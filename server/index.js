const http = require("http");
const path = require("path");
const express = require("express");
const { Server } = require("socket.io");
const { RoomStore } = require("./roomStore");
const { normalizeRoomCode } = require("./gameRules");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 3000);
const roomStore = new RoomStore({ ttlMs: 2 * 60 * 60 * 1000 });

app.use(express.static(path.join(__dirname, "..", "client")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, now: Date.now() });
});

setInterval(() => {
  roomStore.cleanupExpired();
}, 60 * 1000).unref();

function emitRoomState(roomCode) {
  const room = roomStore.getRoom(roomCode);
  if (!room) {
    return;
  }
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit("state:update", roomStore.getStateFor(roomCode, "host"));
  }
  if (room.guestSocketId) {
    io.to(room.guestSocketId).emit("state:update", roomStore.getStateFor(roomCode, "guest"));
  }
}

function safeAck(ack, payload) {
  if (typeof ack === "function") {
    ack(payload);
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", (ack) => {
    const room = roomStore.createRoom(socket.id);
    socket.join(room.code);
    socket.data.role = "host";
    socket.data.roomCode = room.code;
    safeAck(ack, { ok: true, roomCode: room.code });
    emitRoomState(room.code);
  });

  socket.on("room:join", (payload, ack) => {
    const roomCode = normalizeRoomCode(payload && payload.roomCode);
    const result = roomStore.joinRoom(roomCode, socket.id);
    safeAck(ack, { ok: result.ok, reason: result.reason, roomCode });
    if (!result.ok) {
      return;
    }
    socket.join(roomCode);
    socket.data.role = "guest";
    socket.data.roomCode = roomCode;
    emitRoomState(roomCode);
  });

  socket.on("secret:set", (payload, ack) => {
    const roomCode = normalizeRoomCode(socket.data.roomCode);
    const secret = String(payload && payload.secret ? payload.secret : "").trim();
    const result = roomStore.setSecret(roomCode, socket.id, secret);
    safeAck(ack, { ok: result.ok, reason: result.reason });
    if (!result.ok) {
      return;
    }
    emitRoomState(roomCode);
  });

  socket.on("guess:submit", (payload, ack) => {
    const roomCode = normalizeRoomCode(socket.data.roomCode);
    const guess = String(payload && payload.guess ? payload.guess : "").trim();
    const result = roomStore.submitGuess(roomCode, socket.id, guess);
    safeAck(ack, { ok: result.ok, reason: result.reason, entry: result.entry });
    if (!result.ok) {
      return;
    }
    emitRoomState(roomCode);
  });

  socket.on("round:restart", (ack) => {
    const roomCode = normalizeRoomCode(socket.data.roomCode);
    const result = roomStore.restartRound(roomCode, socket.id);
    safeAck(ack, { ok: result.ok, reason: result.reason });
    if (!result.ok) {
      return;
    }
    emitRoomState(roomCode);
  });

  socket.on("disconnect", () => {
    const roomCode = normalizeRoomCode(socket.data.roomCode);
    const role = socket.data.role;
    if (!roomCode || !role) {
      return;
    }
    const result = roomStore.handleDisconnect(roomCode, role, socket.id);
    if (result.closed) {
      if (result.guestSocketId) {
        io.to(result.guestSocketId).emit("room:closed", { reason: "Host left room." });
      }
      return;
    }
    emitRoomState(roomCode);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Bulls and Cows LAN server listening on http://localhost:${PORT}`);
});
