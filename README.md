# Bulls and Cows (LAN Room)

A small LAN game for two players:
- Host and Guest both set hidden 4-digit secrets (unique digits).
- Players take turns guessing each other's secret.
- Server calculates result as `xAyB`.

## Requirements
- Node.js 18+ (recommended: Node.js 20+)

## Install
```bash
npm install
```

## Run
```bash
npm start
```

Default URL on host machine:
- `http://localhost:3000`

For another device on the same LAN:
1. On host machine, run `ipconfig` and find IPv4 address of your Wi-Fi adapter.
2. Open: `http://<HOST_IPV4>:3000` (example: `http://192.168.1.23:3000`).
3. If needed, allow Node.js through Windows Firewall (Private network).

## How to Play
1. Host clicks `Create Room`.
2. Guest enters room code and clicks `Join as Guest`.
3. Both players set their own secret (`4 unique digits`).
4. Host guesses first, then turns alternate.
5. Guess history displays each player's results like `1A2B`.
6. If the starting player guesses correctly first, opponent still gets one final equal-attempt chance.
7. Winner is decided by fewer attempts to reach `4A0B`; same attempts means draw.
8. Click `Restart Round` to start the next round.

## Test
```bash
npm test
```

Tests cover:
- input validation
- A/B score calculation
- invalid input behavior
