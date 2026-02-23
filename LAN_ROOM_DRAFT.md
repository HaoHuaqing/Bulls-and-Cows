# Bulls and Cows - LAN Room Draft (Option 2)

## Goal
- Two players use their own devices on the same Wi-Fi/LAN.
- One player creates a room and sets a hidden 4-digit secret (all digits unique).
- The other player joins and submits guesses.
- Server returns `xAyB` automatically for each guess.
- Keep game state synced for both players in real time.

## Scope for v0 (MVP)
- Create room (host role).
- Join room by room code (guest role).
- Secret validation:
  - Exactly 4 digits.
  - No repeated digit.
- Guess validation:
  - Exactly 4 digits.
  - No repeated digit.
- Result calculation: `A = right digit + right position`, `B = right digit + wrong position`.
- Guess history visible to both players.
- Win condition: `4A0B`.
- Restart round in same room.

## Suggested Stack
- Frontend: plain HTML/CSS/JS (fastest to ship).
- Backend: Node.js + Express + Socket.IO.
- Storage: in-memory map (no database for MVP).

## Why this stack
- LAN friendly and easy to run from one laptop.
- Socket.IO keeps both clients synced without polling.
- In-memory state is enough for casual rounds.

## Player Flow
1. Host opens app and clicks `Create Room`.
2. Server returns `roomCode` (for example `834271`).
3. Host sets secret number (only host can see it).
4. Guest opens app on another device and enters `roomCode`.
5. Guest sends guess.
6. Server computes `xAyB`, appends guess log, broadcasts update.
7. Repeat until `4A0B`.
8. Either player clicks `New Round`, host sets new secret.

## Data Model (server memory)
```js
rooms = {
  "834271": {
    hostSocketId: "...",
    guestSocketId: "...",
    status: "waiting_secret|playing|finished",
    secret: "4271",
    guesses: [
      { guess: "1234", A: 1, B: 2, at: 1700000000 }
    ],
    winner: "guest|null"
  }
}
```

## Core Events (Socket.IO)
- `room:create` -> `{ roomCode }`
- `room:join` -> `{ roomCode, ok, reason? }`
- `secret:set` -> `{ ok, reason? }`
- `guess:submit` -> `{ ok, reason? }`
- `state:update` -> full room-safe state (never expose `secret` to guest)
- `round:restart` -> reset status and guesses

## Validation Rules
- `isValid4UniqueDigits(s)`:
  - regex `^[0-9]{4}$`
  - set size must be 4
- Reject invalid room code or invalid phase action.

## Calculation Logic
```txt
A = count(secret[i] === guess[i])
B = count(d in guess where d exists in secret) - A
```

## Security/Privacy Notes
- Never send secret to guest client.
- Host can still inspect browser memory, so this is trust-based casual play.
- Add room auto-expire (for example 2 hours idle) to avoid memory leak.

## Local Run Plan
1. Host machine runs server on port `3000`.
2. Find host LAN IP (for example `192.168.1.23`).
3. Both users open `http://192.168.1.23:3000`.
4. If blocked, allow Node.js in Windows Firewall (Private network).

## MVP File Layout
```txt
Bulls and Cows/
  server/
    index.js
    roomStore.js
    gameRules.js
  client/
    index.html
    app.js
    style.css
  package.json
  README.md
```

## Milestones
- M1: Single-room end-to-end loop works on one machine (2 tabs).
- M2: LAN join works from second device.
- M3: Add restart, room expiry, and basic error UI.

## Non-goals for v0
- Authentication/accounts.
- Persistent leaderboard.
- Anti-cheat.
- Internet public deployment.
