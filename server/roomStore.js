const { generateRoomCode, isValid4UniqueDigits, normalizeRoomCode, scoreGuess } = require("./gameRules");

const ROLE = {
  HOST: "host",
  GUEST: "guest"
};

const ROOM_STATUS = {
  WAITING_GUEST: "waiting_guest",
  WAITING_SECRETS: "waiting_secrets",
  PLAYING: "playing",
  FINAL_CHANCE: "final_chance",
  FINISHED: "finished"
};

function oppositeRole(role) {
  return role === ROLE.HOST ? ROLE.GUEST : ROLE.HOST;
}

class RoomStore {
  constructor(options = {}) {
    this.rooms = new Map();
    this.ttlMs = options.ttlMs || 2 * 60 * 60 * 1000;
  }

  createRoom(hostSocketId) {
    const code = generateRoomCode(this.rooms);
    const now = Date.now();
    const room = {
      code,
      hostSocketId,
      guestSocketId: null,
      status: ROOM_STATUS.WAITING_GUEST,
      startingRole: ROLE.HOST,
      turnRole: null,
      finalChanceRole: null,
      secrets: {
        host: null,
        guest: null
      },
      guessLogs: {
        host: [],
        guest: []
      },
      history: [],
      solvedAtAttempt: {
        host: null,
        guest: null
      },
      winner: null,
      createdAt: now,
      updatedAt: now
    };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(roomCode) {
    return this.rooms.get(normalizeRoomCode(roomCode)) || null;
  }

  roleBySocketId(room, socketId) {
    if (room.hostSocketId === socketId) {
      return ROLE.HOST;
    }
    if (room.guestSocketId === socketId) {
      return ROLE.GUEST;
    }
    return null;
  }

  getStateFor(roomCode, role) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return null;
    }

    const isKnownRole = role === ROLE.HOST || role === ROLE.GUEST;
    const me = isKnownRole ? role : null;
    const opponent = me ? oppositeRole(me) : null;

    return {
      roomCode: room.code,
      role: me,
      status: room.status,
      startingRole: room.startingRole,
      turnRole: room.turnRole,
      finalChanceRole: room.finalChanceRole,
      winner: room.winner,
      players: {
        hostConnected: Boolean(room.hostSocketId),
        guestConnected: Boolean(room.guestSocketId)
      },
      secretSet: {
        host: Boolean(room.secrets.host),
        guest: Boolean(room.secrets.guest)
      },
      mySecret: me ? room.secrets[me] : null,
      solvedAtAttempt: me
        ? {
            me: room.solvedAtAttempt[me],
            opponent: room.solvedAtAttempt[opponent]
          }
        : {
            me: null,
            opponent: null
          },
      guessCounts: me
        ? {
            me: room.guessLogs[me].length,
            opponent: room.guessLogs[opponent].length
          }
        : {
            me: 0,
            opponent: 0
          },
      history: room.history.slice()
    };
  }

  joinRoom(roomCode, guestSocketId) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { ok: false, reason: "Room does not exist." };
    }
    if (room.hostSocketId === guestSocketId) {
      return { ok: false, reason: "Host cannot join as guest." };
    }
    if (room.guestSocketId && room.guestSocketId !== guestSocketId) {
      return { ok: false, reason: "Room is full." };
    }

    room.guestSocketId = guestSocketId;
    room.status = ROOM_STATUS.WAITING_SECRETS;
    room.updatedAt = Date.now();
    return { ok: true, room };
  }

  setSecret(roomCode, socketId, secret) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { ok: false, reason: "Room does not exist." };
    }
    const role = this.roleBySocketId(room, socketId);
    if (!role) {
      return { ok: false, reason: "Only room players can set secret." };
    }
    if (!isValid4UniqueDigits(secret)) {
      return { ok: false, reason: "Secret must be 4 unique digits." };
    }
    if (room.status === ROOM_STATUS.PLAYING || room.status === ROOM_STATUS.FINAL_CHANCE || room.status === ROOM_STATUS.FINISHED) {
      return { ok: false, reason: "Restart round before setting new secret." };
    }

    room.secrets[role] = secret;

    if (!room.guestSocketId) {
      room.status = ROOM_STATUS.WAITING_GUEST;
    } else if (room.secrets.host && room.secrets.guest) {
      room.status = ROOM_STATUS.PLAYING;
      room.turnRole = room.startingRole;
      room.finalChanceRole = null;
    } else {
      room.status = ROOM_STATUS.WAITING_SECRETS;
    }
    room.updatedAt = Date.now();
    return { ok: true, room };
  }

  settleWinner(room) {
    const hostTry = room.solvedAtAttempt.host;
    const guestTry = room.solvedAtAttempt.guest;

    if (hostTry !== null && guestTry !== null) {
      if (hostTry < guestTry) {
        room.winner = ROLE.HOST;
      } else if (guestTry < hostTry) {
        room.winner = ROLE.GUEST;
      } else {
        room.winner = "draw";
      }
    } else if (hostTry !== null) {
      room.winner = ROLE.HOST;
    } else if (guestTry !== null) {
      room.winner = ROLE.GUEST;
    } else {
      room.winner = null;
    }

    room.status = ROOM_STATUS.FINISHED;
    room.turnRole = null;
    room.finalChanceRole = null;
  }

  submitGuess(roomCode, socketId, guess) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { ok: false, reason: "Room does not exist." };
    }

    const role = this.roleBySocketId(room, socketId);
    if (!role) {
      return { ok: false, reason: "Only room players can submit guesses." };
    }
    if (!isValid4UniqueDigits(guess)) {
      return { ok: false, reason: "Guess must be 4 unique digits." };
    }
    if (room.status !== ROOM_STATUS.PLAYING && room.status !== ROOM_STATUS.FINAL_CHANCE) {
      return { ok: false, reason: "Round is not in playing state." };
    }
    if (room.status === ROOM_STATUS.PLAYING && room.turnRole !== role) {
      return { ok: false, reason: "Not your turn." };
    }
    if (room.status === ROOM_STATUS.FINAL_CHANCE && room.finalChanceRole !== role) {
      return { ok: false, reason: "Only final-chance player can guess now." };
    }

    const targetRole = oppositeRole(role);
    const targetSecret = room.secrets[targetRole];
    if (!targetSecret) {
      return { ok: false, reason: "Opponent secret is not ready." };
    }

    const { A, B } = scoreGuess(targetSecret, guess);
    const attemptNo = room.guessLogs[role].length + 1;
    const entry = {
      by: role,
      no: attemptNo,
      guess,
      A,
      B,
      at: Date.now()
    };

    room.guessLogs[role].push(entry);
    room.history.push(entry);
    if (A === 4 && room.solvedAtAttempt[role] === null) {
      room.solvedAtAttempt[role] = attemptNo;
    }

    const starter = room.startingRole;
    const nonStarter = oppositeRole(starter);

    if (role === starter && A === 4 && room.solvedAtAttempt[nonStarter] === null) {
      room.status = ROOM_STATUS.FINAL_CHANCE;
      room.turnRole = nonStarter;
      room.finalChanceRole = nonStarter;
      room.updatedAt = Date.now();
      return { ok: true, room, entry };
    }

    if (room.status === ROOM_STATUS.FINAL_CHANCE) {
      this.settleWinner(room);
      room.updatedAt = Date.now();
      return { ok: true, room, entry };
    }

    if (A === 4) {
      this.settleWinner(room);
      room.updatedAt = Date.now();
      return { ok: true, room, entry };
    }

    room.status = ROOM_STATUS.PLAYING;
    room.turnRole = oppositeRole(role);
    room.finalChanceRole = null;
    room.updatedAt = Date.now();
    return { ok: true, room, entry };
  }

  restartRound(roomCode, requesterSocketId) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { ok: false, reason: "Room does not exist." };
    }
    const role = this.roleBySocketId(room, requesterSocketId);
    if (!role) {
      return { ok: false, reason: "Only room players can restart." };
    }

    room.secrets = {
      host: null,
      guest: null
    };
    room.guessLogs = {
      host: [],
      guest: []
    };
    room.history = [];
    room.solvedAtAttempt = {
      host: null,
      guest: null
    };
    room.winner = null;
    room.turnRole = null;
    room.finalChanceRole = null;
    room.status = room.guestSocketId ? ROOM_STATUS.WAITING_SECRETS : ROOM_STATUS.WAITING_GUEST;
    room.updatedAt = Date.now();
    return { ok: true, room };
  }

  handleDisconnect(roomCode, role, socketId) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { closed: false, room: null, reason: "missing" };
    }

    if (role === ROLE.HOST && room.hostSocketId === socketId) {
      const guestSocketId = room.guestSocketId;
      this.rooms.delete(room.code);
      return { closed: true, guestSocketId };
    }

    if (role === ROLE.GUEST && room.guestSocketId === socketId) {
      room.guestSocketId = null;
      room.secrets.guest = null;
      room.secrets.host = null;
      room.guessLogs.host = [];
      room.guessLogs.guest = [];
      room.history = [];
      room.solvedAtAttempt.host = null;
      room.solvedAtAttempt.guest = null;
      room.winner = null;
      room.status = ROOM_STATUS.WAITING_GUEST;
      room.turnRole = null;
      room.finalChanceRole = null;
      room.updatedAt = Date.now();
      return { closed: false, room };
    }

    return { closed: false, room };
  }

  cleanupExpired() {
    const now = Date.now();
    let removed = 0;
    for (const room of this.rooms.values()) {
      if (now - room.updatedAt > this.ttlMs) {
        this.rooms.delete(room.code);
        removed += 1;
      }
    }
    return removed;
  }
}

module.exports = {
  RoomStore,
  ROOM_STATUS,
  ROLE
};
