const test = require("node:test");
const assert = require("node:assert/strict");
const { RoomStore, ROOM_STATUS } = require("./roomStore");

test("round should support both players setting secrets and alternate turns", () => {
  const store = new RoomStore({ ttlMs: 1000 });
  const room = store.createRoom("host-1");

  assert.equal(room.status, ROOM_STATUS.WAITING_GUEST);
  assert.equal(room.code.length, 6);

  const joinResult = store.joinRoom(room.code, "guest-1");
  assert.equal(joinResult.ok, true);
  assert.equal(joinResult.room.status, ROOM_STATUS.WAITING_SECRETS);

  const hostSecretResult = store.setSecret(room.code, "host-1", "4271");
  assert.equal(hostSecretResult.ok, true);
  assert.equal(hostSecretResult.room.status, ROOM_STATUS.WAITING_SECRETS);

  const guestSecretResult = store.setSecret(room.code, "guest-1", "9351");
  assert.equal(guestSecretResult.ok, true);
  assert.equal(guestSecretResult.room.status, ROOM_STATUS.PLAYING);
  assert.equal(guestSecretResult.room.turnRole, "host");

  const hostGuess1 = store.submitGuess(room.code, "host-1", "1234");
  assert.equal(hostGuess1.ok, true);
  assert.equal(hostGuess1.room.status, ROOM_STATUS.PLAYING);
  assert.equal(hostGuess1.room.turnRole, "guest");
  assert.equal(hostGuess1.room.guessLogs.host.length, 1);

  const guestGuess1 = store.submitGuess(room.code, "guest-1", "5678");
  assert.equal(guestGuess1.ok, true);
  assert.equal(guestGuess1.room.status, ROOM_STATUS.PLAYING);
  assert.equal(guestGuess1.room.turnRole, "host");
  assert.equal(guestGuess1.room.guessLogs.guest.length, 1);

  const hostGuess2 = store.submitGuess(room.code, "host-1", "9351");
  assert.equal(hostGuess2.ok, true);
  assert.equal(hostGuess2.entry.A, 4);
  assert.equal(hostGuess2.room.status, ROOM_STATUS.FINAL_CHANCE);
  assert.equal(hostGuess2.room.finalChanceRole, "guest");
  assert.equal(hostGuess2.room.turnRole, "guest");

  const guestGuess2 = store.submitGuess(room.code, "guest-1", "4271");
  assert.equal(guestGuess2.ok, true);
  assert.equal(guestGuess2.entry.A, 4);
  assert.equal(guestGuess2.room.status, ROOM_STATUS.FINISHED);
  assert.equal(guestGuess2.room.winner, "draw");
});

test("non-starter should win immediately when solving first", () => {
  const store = new RoomStore({ ttlMs: 1000 });
  const room = store.createRoom("host-1");
  store.joinRoom(room.code, "guest-1");
  store.setSecret(room.code, "host-1", "4271");
  store.setSecret(room.code, "guest-1", "9351");

  const hostGuess = store.submitGuess(room.code, "host-1", "1234");
  assert.equal(hostGuess.ok, true);
  assert.equal(hostGuess.room.turnRole, "guest");

  const guestGuess = store.submitGuess(room.code, "guest-1", "4271");
  assert.equal(guestGuess.ok, true);
  assert.equal(guestGuess.entry.A, 4);
  assert.equal(guestGuess.room.status, ROOM_STATUS.FINISHED);
  assert.equal(guestGuess.room.winner, "guest");
});

test("starter should win if opponent misses final chance", () => {
  const store = new RoomStore({ ttlMs: 1000 });
  const room = store.createRoom("host-1");
  store.joinRoom(room.code, "guest-1");
  store.setSecret(room.code, "host-1", "4271");
  store.setSecret(room.code, "guest-1", "9351");

  const hostGuess = store.submitGuess(room.code, "host-1", "9351");
  assert.equal(hostGuess.ok, true);
  assert.equal(hostGuess.room.status, ROOM_STATUS.FINAL_CHANCE);
  assert.equal(hostGuess.room.finalChanceRole, "guest");

  const guestFinalChance = store.submitGuess(room.code, "guest-1", "1234");
  assert.equal(guestFinalChance.ok, true);
  assert.equal(guestFinalChance.room.status, ROOM_STATUS.FINISHED);
  assert.equal(guestFinalChance.room.winner, "host");
});

test("restart should reset dual-secret round", () => {
  const store = new RoomStore({ ttlMs: 1000 });
  const room = store.createRoom("host-1");
  store.joinRoom(room.code, "guest-1");
  store.setSecret(room.code, "host-1", "4271");
  store.setSecret(room.code, "guest-1", "9351");
  store.submitGuess(room.code, "host-1", "9351");
  store.submitGuess(room.code, "guest-1", "4271");

  const restartResult = store.restartRound(room.code, "host-1");
  assert.equal(restartResult.ok, true);
  assert.equal(restartResult.room.status, ROOM_STATUS.WAITING_SECRETS);
  assert.equal(restartResult.room.history.length, 0);
  assert.equal(restartResult.room.secrets.host, null);
  assert.equal(restartResult.room.secrets.guest, null);
  assert.equal(restartResult.room.turnRole, null);
});

test("guest disconnect should reset active round and keep room", () => {
  const store = new RoomStore({ ttlMs: 1000 });
  const room = store.createRoom("host-1");
  store.joinRoom(room.code, "guest-1");
  store.setSecret(room.code, "host-1", "1234");
  store.setSecret(room.code, "guest-1", "5678");
  store.submitGuess(room.code, "host-1", "5678");

  const result = store.handleDisconnect(room.code, "guest", "guest-1");
  assert.equal(result.closed, false);

  const current = store.getRoom(room.code);
  assert.equal(Boolean(current), true);
  assert.equal(current.status, ROOM_STATUS.WAITING_GUEST);
  assert.equal(current.guestSocketId, null);
  assert.equal(current.history.length, 0);
  assert.equal(current.secrets.host, null);
  assert.equal(current.secrets.guest, null);
});

test("host disconnect should close room", () => {
  const store = new RoomStore({ ttlMs: 1000 });
  const room = store.createRoom("host-1");
  store.joinRoom(room.code, "guest-1");

  const result = store.handleDisconnect(room.code, "host", "host-1");
  assert.equal(result.closed, true);
  assert.equal(result.guestSocketId, "guest-1");
  assert.equal(store.getRoom(room.code), null);
});

test("cleanup should remove expired rooms", () => {
  const store = new RoomStore({ ttlMs: 1 });
  const room = store.createRoom("host-1");

  room.updatedAt = Date.now() - 10;
  const removed = store.cleanupExpired();
  assert.equal(removed, 1);
  assert.equal(store.getRoom(room.code), null);
});
