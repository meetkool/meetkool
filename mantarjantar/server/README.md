# Our own Jantar Mantar Chalo server

The game's public site ships its browser client and its game logic (`shared/sim.js`), but
not its server. This folder is a server written from scratch that speaks the same WebSocket
protocol, so the unmodified client can be played against it locally.

## Run it

```bash
cd mantarjantar/server
npm install
npm run fetch-client   # downloads the 5 public client files into ../site (gitignored)
npm start              # http://localhost:3000, then press PLAY ONLINE
npm test               # 7 protocol tests, decoding snapshots with the client's own decoder
```

The game files belong to the game's authors. Keep them on your own machine for study, and
don't host them publicly without their permission.

## What it does

| Piece | Behaviour |
|---|---|
| Static files | Serves `index.html`, `client.js`, `vendor/`, `shared/` from `GAME_DIR` |
| `GET /status` | `{players, rooms, queue, maxPerRoom, list:[{id, humans, P, C, ents, round}]}`, the same shape as the live site |
| `WS /ws` | `join`, `in`, `view`, `team`, `kf`, `ping` in; `welcome`, `pong`, `queue`, `full`, `idlewarn` and binary snapshots out |
| Simulation | One `Sim.createSim()` per room, stepped at 30 Hz |
| Snapshots | Every 2nd tick (15 Hz). Byte 0 is the keyframe flag; the rest is raw deflate, with the previous snapshot as the dictionary for deltas |

## Our answers to the original server's unknowns

These are our own choices, not the live server's. Change them with environment variables or
in `CONFIG` at the top of `server.js`.

| Unknown | Our policy | Setting |
|---|---|---|
| Room assignment | Join the fullest room that still has space; open a new room when all are full; delete a room after 60 s with nobody in it | `MAX_PER_ROOM` (32), `MAX_ROOMS` (8) |
| Server full | Queue up to 50 players with position updates, then `full` and close 1013 | `CONFIG.maxQueue` |
| Per-network limit | 4 sockets per IP (first `X-Forwarded-For` hop if behind a proxy), extra ones closed with 1008 | `MAX_CONNS_PER_IP` |
| Idle kick | `idlewarn` after 90 s without input, close 4000 at 115 s (warning + 25 s, as observed live) | `IDLE_WARN_SEC`, `IDLE_KICK_SEC` |
| Resume | Random 128-bit token; a dropped player's body is held for 22 s, the client's own window | `CONFIG.resumeGraceMs` |
| Keyframes | First snapshot, on a client's `kf` request, and every 30 s | `CONFIG.keyframeEveryTicks` |
| Slow clients | Skip a snapshot while more than 256 KB is still queued on the socket | `CONFIG.maxBufferedBytes` |
| Names | Whitespace collapsed, control and bidi characters and `<>` removed, 18 characters max, the 🤖 bot mark stripped, optional blocklist, defaults when empty | `BLOCKED_NAMES` (comma list) |
| Input | Only known fields kept; move vector clamped to −1…1, gas target to the map, messages over 4 KB rejected | none |

## Tested

- `npm test`: join, keyframe then delta decoding, movement and input acks, ping, keyframe
  requests, team switch, two players sharing a room, resume with the same body, the
  connection limit, the idle kick, and name and input cleaning.
- Also checked in Chromium with the real client: two browsers (protester and police) in one
  room seeing each other, a page reload resuming the same body, and a 1-room/1-player
  server queueing the second player.
