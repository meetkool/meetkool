# Jantar Mantar Chalo (mantarjantar.com): reverse-engineering report

Target: `https://mantarjantar.com`, downloaded 2026-10-15.
Method: REA static analysis (`analyze_javascript_application`, Evidence
`ev_35fe7ebe0132e56950f7c9e67460c34b9412b6e51e4a3ee8838903cfc03d8d65`), a manual read of the
beautified source, a headless Node run of the shipped simulation (`tools/simprobe.js`), and
headless-Chromium play of the offline "Practice" mode (`tools/shots.js`, screenshots in
`screenshots/`).

Evidence labels used below:
- **[S]** read directly in the shipped code
- **[R]** observed at runtime (Node sim run or browser)
- **[I]** inferred, not directly observed

---

## 1. What was downloaded

The whole client is five files. There is no bundler, no source maps, and no image or audio
assets: every sprite is drawn with Canvas 2D code and every sound is synthesised with WebAudio. [S]

| File | Size | Role |
|---|---|---|
| `index.html` | 6.3 KB | Menu card (name, team, "mudda" chips), mobile buttons, CSS, script tags |
| `shared/world.js` | 20.8 KB | Deterministic map data plus shared physics (`moveBody`). UMD module, so it runs on the server and in the browser |
| `shared/sim.js` | 106.8 KB | **The authoritative game simulation.** Runs one instance per room on the server and runs inside the browser for offline practice |
| `vendor/fflate.js` | 32.8 KB | fflate 0.8.2 (MIT), unmodified. Used to inflate compressed snapshots |
| `client.js` | 171.4 KB | Renderer, procedural sprites, audio synth, input, networking, prediction, interpolation, HUD |

`index.html` loads `../shared/world.js`. The "shared" folder name and the comment
`Loaded by the Node server (require) and the browser` show that the server runs this same
`sim.js`. [S] Server code itself is **not** shipped. The client's file-mode hint mentions
`bun start` / `localhost:3000`, so the server most likely runs on Bun. [I]

The downloaded copy lives in `site/` (raw) and `pretty/` (Prettier-formatted). Both are
gitignored so this repo does not republish the game's source.

## 2. Architecture

```
browser                                   server (not shipped; inferred from client + /status)
┌───────────────────────────┐   WS /ws    ┌───────────────────────────────┐
│ client.js                 │ ──JSON───▶ │ room = Sim.createSim()         │
│  sampleInput() @30 Hz     │  "in" msgs │  step() @30 Hz (DT = 1/30)     │
│  local prediction         │            │  snapshotJSON(pid, view, cl)   │
│  (same moveBody)          │ ◀─binary── │  deflate-raw, dictionary =     │
│  interp ~3–10 ticks back  │  snapshots │  previous snapshot             │
│  Canvas renderer + WebAudio│           └───────────────────────────────┘
└───────────────────────────┘
offline "Practice": class Local runs Sim.createSim() in-page, steps it at 30 Hz, and snapshots every 2nd tick
```

- **Tick rate:** 30 Hz simulation (`DT = 1/30`). The client samples input every 30 Hz step
  inside `requestAnimationFrame`. [S]
- **Authority:** the server simulates everything. The client only predicts its own avatar,
  using the identical `World.moveBody`, then reconciles against `me.ack` (the last input
  sequence number the server applied) by replaying the pending inputs. [S]
- **Interpolation:** other entities render `S.delay` ticks in the past. The delay adapts:
  `clamp(2.6 + jitter*2.4, 3, 10)`. When a snapshot is late, entities extrapolate for about
  130 ms. [S]
- **Interest management:** a snapshot carries only the entities inside your view rectangle
  plus a margin. The client reports its view size with `{t:"view"}`. Minimap rows go out
  every 6 ticks, the leaderboard every 30 ticks, and names or barricade lists only when their
  version counter changes. [S]
- **Scale [R]:** on 2026-10-15, `/status` reported 324 players in 11 rooms, max 32 humans
  per room, and about 230–250 entities per room. Room IDs look like `W1-1` and `W2-14`, so
  there are at least two worker processes. [I]

### 2.1 Network protocol [S]

**Client → server** (JSON text frames):

| `t` | Fields | Meaning |
|---|---|---|
| `join` | `name, team ('P'/'C'), mud, resume?` | Enter a room |
| `in` | `s` seq, `x,y` move vector (−1..1), `a` action click, `e`, `g:[wx,wy]` gas target, `ff` click held, `f`, `r`, `q`, `aim` radians, `m` active within 1.5 s | Per-tick input |
| `view` | `w, h` | Viewport size in world units |
| `team` | `team, mud` | Switch side (T key) |
| `kf` | none | Ask for a keyframe after a decode failure |
| `ping` | `c` client timestamp | Latency probe, sent every 2 s |

**Server → client:**
- Text: `welcome {id, room, info, token, resumed}`, `pong`, `queue {pos,total}`,
  `full {alt:[urls]}` (redirects you to another server), `idlewarn`.
- Binary snapshots: byte 0 holds flags (bit 0 = keyframe), followed by raw deflate. A
  non-keyframe is compressed using the **previous decoded snapshot as the deflate
  dictionary**, which acts as cheap delta compression.
- Close codes: `4000` idle kick, `1008` too many connections from your network, `1013`
  server full. Otherwise the client reconnects with exponential backoff (0.6 s, growing to 8 s).
- Resume: the `welcome.token` is kept in `sessionStorage.jm_resume` and is valid for 22 s. A
  page reload or network drop rejoins the same body through `?r=<token>`.

**HTTP:** `GET /status` returns `{players, rooms, queue, maxPerRoom, list:[{id,humans,P,C,ents,round}]}`.

**Snapshot JSON keys** (from `snapshotJSON`, about 6 KB uncompressed in the probe):
`tk` tick · `e` entity rows · `g` gates · `rd` round · `ev` events · `cl` closed metro
stations · `b`/`bm` barricades (in view / all) · `c` tear-gas cans · `r` delivery riders ·
`bus` · `k` pickups · `wc` water cannons · `mk` monkeys · `fx` world effects · `me` private
state · `pf` private effects · `mm` minimap · `lb` leaderboard · `names`.

Entity row: `[id, type(0=P,1=C,2=N), x, y, dir(0 down,1 up,2 right,3 left), flags, look,
wanted-or-crewReady, mudda, escortT, swingT, followers]`. The flags bitfield is: 1 moving,
2 gassed, 4 stunned, 8 ghost (spawn-protected), 16 sitting, 32 leader, 128 escorted,
256 human, 512 bot, 1024 chai, 2048 sprinting, 4096 idle, 8192 gamchha, 16384 dispersed,
32768 wet, 65536 thrown, 131072 scared, 262144 carried, 524288 carrying,
1048576 fasting, 2097152 climbing the wall.

## 3. The world (`world.js`)

All geometry is fixed. Random parts use seeded `mulberry32`, so every client and server
generates the same city. [S]

- **Map:** 6000 × 6000 units, a satirical New Delhi. [S]
- **Connaught Place** is a circular hub at (3000, 2000) with 3 ring roads and 8 radial spokes. [S]
- **Jantar Mantar plaza** `JM` sits at (3300, 2950) with r = 150. The **Section 163 zone**
  `ZONE` is a fence of R = 340 around it. [S]
- **Roads:** 32 in total: 24 named (Sansad Marg, Janpath, Kartavya Path, Ring Road, ITO Rd,
  Minto Rd, and others) plus 8 CP spokes, and 5 roundabout rings. [S/R]
- **Gates:** generated wherever a road crosses the fence, then de-duplicated, giving 4 gates
  named **North, East, South, West** on Sansad Marg and Jantar Mantar Rd. [R]
- **Yamuna river** at x ≈ 5420 (a wavy line). Its bridges are at y = 2650 and y = 4000.
  Walking in the river halves your speed. [S]
- **Generated content, all seeded [R]:** 769 buildings (seed 1947, each with a shop sign,
  posters, water tanks, dishes, laundry and so on), 610 trees, 12 parks (Lodhi Garden,
  Delhi Ridge forest, Ramlila Maidan, Raj Ghat, DU North Campus, JNU…), 18 police
  checkpoints, 20 street stalls, 5 construction sites (×0.6 speed), 70 CCTV poles, 18 hide
  spots, 379 building doors, 15 metro stations, 24 recruiting "pockets".
- **Spawns:** protesters spawn at 10 assembly points (DU North Campus, Singhu, Tikri,
  Ghazipur borders, JNU, Ramlila Maidan…). Police spawn at 6 police stations. Detention
  buses drop people at one of 7 far-off destinations (Burari Ground, Bawana PS, Narela
  Stadium, Kapashera, Jharoda Kalan, Badarpur, Ghazipur). [S]
- **Muddas (causes):** 9 of them, each with an emoji, a colour, placard slogans and chants:
  Paper Leak, Berozgari, E20 Petrol, Vote Chori, Saans (AQI), MSP, Purani Pension, Gaddhe,
  Mehngai. Pocket type sets the preferred mudda, e.g. coaching centre → Paper Leak, petrol
  pump → E20. [S]

### 3.1 Movement and physics (shared by server and client prediction) [S]

`moveBody(p, wx, wy, spd, dt, gateDown, bars)`:
1. **Velocity smoothing:** `v += (want*spd − v) * min(1, dt*12)`. Bodies accelerate to full
   speed in about 80 ms instead of snapping.
2. **Integrate:** `x += vx*dt + sx`. Here `sx, sy` is the separation push from crowd
   collisions plus any knockback.
3. **Building collision:** a spatial hash with 200-unit cells. The body is resolved as a
   circle against an axis-aligned rectangle; when the centre is inside, it exits on the
   nearest side.
4. **Zone fence:** in the band around R = 340, police and anyone using an open (broken)
   gate pass through. **Protesters can climb the fence away from gates**, but `onWall`
   multiplies their speed by **×0.06**. Closed gates block protesters.
5. **Barricades:** only protesters collide. Each barricade is a capsule
   (`len`, padding `r + 7`) and pushes you out on the side you came from.
6. Clamp to the world bounds [30, 5970].

**Speeds:** base 150 for both teams. Human protesters get ×1.06. Idle bystanders move at 45.
Sprint is ×1.45 and costs 28 stamina/s, while stamina regenerates at 14/s (the client
currently never sends sprint; bots and NPCs do sprint). Multipliers stack:

| Modifier | × |
|---|---|
| On the fence (climbing) | 0.06 |
| Kafila lagging behind you | 0.72 |
| Carrying a detainee | 0.8 |
| Wet from a water cannon | 0.6 |
| Tear-gassed without a gamchha | 0.5 (protester) / 0.8 (police) |
| In the river | 0.5 |
| Construction site | 0.6 |
| Rain event (dormant, see §9) | 0.88 |
| Boost (golgappa, Halla Bol, rescue) | 1.3 |
| Chai | 1.2 |
| Stunned | 0 |

**Crowd separation:** a 64-unit grid. Pairs closer than `r1 + r2` (r = 10) push apart. Who
yields depends on team and control: in a cop-vs-protester overlap the protester takes 70%
of the push, and a human never gets shoved by NPCs on their own team.

**AI navigation:** a 40-unit grid with BFS flow fields, one per gate (`FIELDS`), one to any
gate (`FANY`), and on-demand fields to arbitrary targets (LRU cache of 48, depth cap 120).
`flowDir` steps toward the neighbour with the lowest value and blocks diagonal corner-cutting.
`pathTo` walks a straight line when the path is clear and otherwise follows the flow field. [S]

## 4. Core loop and win condition [S]

- A round lasts **480 s**. Rounds never pause: the result is announced, the session tally
  updates, and a fresh round starts at once.
- **Protesters win** when the **Dharna POWER meter** reaches its target. The target is
  `clamp(60 + max(5, humanProtesters) × 28, 160, 1200)`. **Police win** when the timer runs out.
- Ways to fill the meter (all run through a **rubber band**: `v × clamp(1 + (1 − pace)×2, 0.7, 2.5)`,
  so a side that is behind the needed pace gains up to ×2.5 and a side that is ahead drops to ×0.7):
  - First arrival in the plaza per run: +12
  - Holding the plaza: +0.75/s per human. This drops ×0.4 when the plaza is contested by
    2 or more active police.
  - NPC protesters in the plaza: +0.014/s each, capped at 0.28/s
  - Anshan (hunger strike) on one of the 5 mats: +0.08/s, plus +5 if you complete 40 s
- **RAF waves:** while a human holds the plaza (or 8+ NPCs do), a wave of temporary police
  rovers spawns every 25 s at a random gate. Size is `min(12, 2 + wave + plazaHumans (+2 if
  protesters are ahead of pace))` and each lives 45 s. After 15 s of calm the waves reset.
- **Bot balancing** runs every second. Protester bots are kept at
  `max(5 + round(1.5×copHumans) − protHumans, ceil(1.5×copHumans) − protHumans)`, capped
  at 24. Police bots at `max(4 − copHumans, ceil(0.6×protHumans) − copHumans)`.

## 5. Playing as a protester (Andolankari) [S, R]

**Controls:** the avatar walks toward the mouse (no movement within 30 px, full speed from
160 px) or with WASD/arrows. Touch uses a floating joystick. One context-sensitive action
fires on **click or Space**; holding it near a barricade means "push". `T` switches team,
`M` mutes, `Q` toggles graphics quality, and `Esc` returns to the menu.

**Context action priority (`ctxOf`):**

| # | Condition | Action |
|---|---|---|
| 10 | Kafila ≥ 4, a cop within 150, Halla Bol off cooldown | **HALLA BOL**: the kafila charges the police (cooldown 4 s) |
| 1 | TV crew within 90 and ready | **Interview** |
| 9 | Free anshan mat within 34 | **Hunger strike** |
| 2 | Open metro station within 70 | **Metro** ride |
| 8 | Hide spot within 48 (20 s cooldown) | **Hide** |
| 3 | Delivery rider within 70 (20 s cooldown) | **Hitch a ride** |
| 4 | Barricade or gate in reach | **Push** |
| 5/6 | Closed station / crew on cooldown | Toast only |
| 0 | Otherwise | **Naara** (rally) plus cheer |

**Kafila (your crowd), slither.io style:**
- `touchRecruit`: walking into NPC protesters recruits them. The pull radius is
  `30 + min(70, 3×kafila)`, plus 20 with a power bank. Cap: **25 followers**.
- `rally` (Naara): pulls everyone in a 280 radius (140 during an internet shutdown,
  ×1.5 with a power bank). Cooldown 3.5 s for humans.
- Followers walk your breadcrumb **trail** (up to 40 points, one every 64 units) and catch up
  once they fall more than 200 behind. If the kafila's centre falls too far behind you, you
  slow to ×0.72 ("Kafila peeche reh gaya!").
- Kafila size tiers: 5 TOLI, 10 JATTHA, 18 KAFILA, 25 SAILAAB 🌊.
- **Crowd shield:** you cannot be detained while 3+ active protesters stand within 58
  (5+ inside the zone). A human leader with 8+ followers outside the zone shields every
  follower within 130.

**Breaking through:**
- Barricade and gate damage per second is `3.4 × (nPush − 0.7×nHold)^1.45`. Effective
  pushers are: protester 1.0, human 1.2, human shoving 1.7, gassed protester 0.35. A
  click-shove with 3+ followers adds a burst of `1 + 0.22×kafila`.
- Gates have 100 HP and heal 2.5/s while police hold them. A broken gate rebuilds over about
  15 s once nobody is near (faster with police nearby) and comes back at 55 HP. Checkpoints
  pop back up after 6–14 s, 60 s at most.
- **Gherao:** 4 or more protesters within 50 of a cop **lift and throw him** 80–234 units
  ("utha ke fek diya"). He is stunned for 2.2 s, immune for 9 s, and non-guards retreat for 6 s.
- **Kick tear gas back:** step on a fresh can (younger than 2.6 s, 22-unit radius) to send it
  300 units in your facing direction. This works once per can.

**Detention and escape:** a carried protester mashes click to `struggle` (needs
`min(16, 10 + 3×copsNearby)`). Alternatively, a kafila of 3+ around the carrier fills a rescue
bar. Release gives 3.5 s of ghost (spawn protection), a 2 s boost, and throws the carrier.
If you end up on a bus, it drives to a far destination (holding click fast-forwards ×3.2) and
you are released after "chai & paperwork".

**Getting around:**
- **Metro:** teleports you to the nearest open station that is at least 300 closer to JM. It
  takes followers within 320 along. Cooldown 8 s. The "DMRC gates closed" event shuts 6
  central stations.
- **Delivery riders (🛵):** drop you up to 1,100 units closer (never inside zone + 280).
  +20 points.
- **Hide spots:** hide for 5 s (7 s in Gurdwara Bangla Sahib, which also gives full stamina
  and chai). Every cop within 380 or targeting you loses track and wanders confused. One FIR
  level is "misplaced".

**Street stalls** (each has a per-player cooldown):

| Stall | Effect |
|---|---|
| Golgappa | Full stamina plus 5 s boost |
| DJB tanker | Clears gas; gamchha immunity for 12 s |
| Selfie point | LIVE ×2 points for 15 s |
| Sulabh | Full stamina |
| Paan | Tip: protesters learn the weakest gate; police learn the direction of the most-wanted player |

**Pickup (only type spawned):** wet gamchha, giving tear-gas immunity for 20 s. 12 on the
map, each respawns 20 s after pickup.

**Wanted / FIR system:** the "streak" rises with recruits, breaks, kicks, arrivals, holds and
CCTV sightings (+30 when passing a CCTV pole with a kafila of 3+). FIR levels trigger at
100 / 250 / 500 / 850 / 1300: Suspicious element → Urban Naxal → Toolkit gang → Tukde tukde →
100% ANTI-NATIONAL. Each level multiplies score by ×(1 + 0.2×level). From level 2, up to 3
hunter cops spawn 520 units away to chase you. The police get a bounty of `0.6 × streak`.

**Media:** there are 4 crews. **Honest crews** (Ground Zero News, Sach Ka Saamna) give +60
"ON TV!", spawn up to 4 new followers, and grant LIVE ×2 for 20 s. **Godi media**
(DESH TAK 24x7, Chillao TV) follow big kafilas and drain one follower every 1.6 s. They give
"VIRAL (edited)" points but cost 25% of your kafila. Surround the anchor with 5 people and
they flee ("GO BACK!", +60).

## 6. Playing as police (Dilli Police) [S, R]

- **Left click: lathi swing.** A 74-unit cone (dot product ≥ 0.3), cooldown 1 s, with a
  forward lunge. Bystanders scatter. If 2 or fewer protesters are hit, they are knocked back
  300 and lose crowd cover for 2.2 s. Larger groups only get knocked back 170. Hits chain into
  a combo (×(1 + 0.3×(combo − 1)) within 2.5 s). Then the nearest **unshielded** target is
  **lifted by a squad constable** (or detained directly) and carried to the nearest
  detention bus.
- **Right click: tear gas.** Range up to 650, cooldown 4 s (2 s with a power bank). The
  cloud grows to radius 150 (115 for NPC throws), lasts 7 s, and halves protester speed.
  Human-thrown gas also nudges and disperses followers.
- A human police player spawns with one **squad constable**, who orbits you and grabs
  exposed protesters.
- **Carrying** a detainee slows you to ×0.8. The detainee is delivered within 80 of a loading
  bus or after 8–10 s / stuck 2.5 s. Points: human detainee 60, bot 45, leader 30, NPC 6,
  +40 inside the plaza, plus the wanted bounty.
- NPC police roles: **holder** (2 per gate), **guard** (1–2 per checkpoint/cordon),
  **rover** (patrols around JM), **hunter** (police bots, chasing wanted targets, dropping
  temporary barricades in front of fast runners, using the megaphone), **squad** (your helper).
- **Megaphone** (NPC hunters, cooldown 40 s): followers within 260 may go home, with less
  chance for same-mudda followers and big kafilas.
- **VARUN water cannons** (3): a 360° turret with a 310 range and ±0.38 rad spray cone that
  knocks people back and makes them wet. They drive to block the biggest kafila. When
  surrounded by 9+ protesters they stall and retreat.

## 7. Random events (one every 24–36 s, at most 2 at once) [S]

| Event | Duration | Effect |
|---|---|---|
| 📵 Internet shutdown | 25 s | Naara range halved; NPC gate choice randomised |
| 🚇 DMRC gates closed | 35 s | Rajiv Chowk, Patel Chowk, Central Secretariat, Mandi House, ITO, Vishwavidyalaya closed |
| 🚨 Vajra volley | 10 s | Anti-riot vehicle fires 7 gas shells at the biggest crowd |
| 📱 Video goes viral | 12 s | +2 NPCs at every pocket |
| Trending mudda | 30 s | One mudda trends: ×1.5 score for its protesters, extra supporters |
| 🛡️ RAF reinforcements | 40 s | 6 temporary rovers at JM |

## 8. Scoring, missions, round end [S]

- Notable score events: recruit +8 each · approach JM +5 per 50 units gained · arrive
  +250 + 10×kafila · dharna +3×(1 + holdT/20, max ×4) + 0.3×kafila per second (×2 while
  fasting) · gate broken +150 · checkpoint +80 · Halla Bol 10 + 12/cop · gherao +40 ·
  rescue +40 · kick back gas +25 · anshan completed +300 · team win +300 (needs 60 s on
  the team).
- Global multipliers: protester ×(1 + 0.2×FIR level); police ×1.6; LIVE/reel ×2; trending
  mudda ×1.5.
- **Aaj ka kaam (missions):** 3 active at a time, refilled as you complete them. There are
  11 protester missions (kafila of N, recruit N, break barricades, chase off godi media,
  hide, hold the dharna, TV interview, rescue/wriggle, naaras, survive an anshan, Halla Bol)
  and 5 police missions (detain, scatter, gas, lathi hits, carry to bus).
  Rewards are 30–90, +20 for the harder tier.
- At round end each human gets a private `roundend` summary: winner, rank among teammates,
  each team's MVP, session tally, arrivals and detentions.

## 9. Dormant or unfinished code [S, R]

Code paths that exist but never trigger in the shipped build:
- **Monkeys:** `updateMonkeys` (they steal your chai/phone/gamchha/power bank buff) and
  `MONKEY_HOMES` exist, but `S.monkeys` is never populated.
- **Pickups:** handlers exist for chai, samosa, powerbank, reel and funding, but `newPickup`
  hard-codes `type = "gamchha"`. The power-bank and chai buffs can still come from the
  Gurdwara hide spot.
- **Events:** `rain` (×0.88 speed, gas fades ×2) and `langar` (NPCs path to Bangla Sahib)
  are checked but missing from `EVDEF`.
- **Other:** `S.vip` (a VIP convoy, serialized but never filled), `dashT` (×3 dash, never
  set), and the mobile "LIFT"/"DASH" buttons, which are hidden.

## 10. Client presentation [S, R]

- **Rendering:** Canvas 2D. The ground is drawn as cached 384-px tiles, with a y-sorted
  display list for people, vehicles, buildings and props. Characters come from a procedural
  `drawChar` with 4 directions × walk frames, cached as sprites. Looks include 9 mudda
  outfits × 9 variants, generic protesters, leaders, cop/RAF, reporter, cameraman, chaiwala,
  anchor and godi cameraman.
- **Prop and vehicle sprites:** autos, bikes, cars, buses, Vajra, VARUN, cows, dogs, pigeons,
  billboards, tents, metro stations, stalls, barricades and more. Ambient traffic and animals
  are client-only.
- **Quality:** auto-drops to "FAST" graphics if fps stays under 48 for 3 s.
- **Audio:** all synthesised (oscillators, a noise buffer, formant "vox" chants, a crowd
  murmur bed). About 30 SFX: whistle, horn, chant, thwack, gas thump, metro chime, monkey,
  and more.
- **HUD:** score/kafila panel, missions, FIR stars, round timer and POWER bar, top-players
  list with ping, a "Dilli map" minimap, a "BREAKING" satirical news ticker, toasts, a kill
  feed, and speech bubbles.
- **Test hook:** `window.__jm` exposes internal state (`S`, `P`, `start`, `keys`, `cam`…)
  "for automated tests".

## 11. Runtime verification [R]

- Headless Node, 5 simulated minutes with one scripted human walking to JM
  (`tools/simprobe.js`): 9,000 ticks in about 7.7 s (about 35× real time). At the end of
  the run there were 207 entities, 6 arrivals, 40 detentions, and the meter at 159/200.
  Every world/private FX type listed above fired at least once.
- Headless Chromium, offline practice (`tools/shots.js`): the menu, protester spawn,
  marching (kafila 14, context = Halla Bol), and the police view after `T` (RAF wave banner,
  detention buses, cordon) all rendered with **0 page errors**.

## 12. Unknowns

- Server code is not shipped, so these are inferred from client handling only: room
  assignment, per-IP connection limits, the idle-kick timing (about 25 s after `idlewarn`),
  keyframe cadence, and the server-side name filter.
- Online behaviour (latency, real player mixes) was not captured. Only `/status` was
  queried; no online session was joined.

## 13. Live session (15 Oct 2026) [R]

One automated client (`tools/online.js`) joined the public server for 117 s. It played as a
protester for 64 s, then switched to police with `T`. A phone-sized practice run
(`tools/phone.js`) tested the touch controls. The raw capture holds other players' names, so
it is not committed. Screenshots have the leaderboard and feed blurred (`tools/blur.py`).

- **Transport:** a plain WebSocket at `wss://mantarjantar.com/ws`, not Socket.IO.
  - Up: 3,488 `in` messages (29.8/s, ~95 B each, ~2.7 KB/s).
  - Down: 1 keyframe (1,975 B) and 1,746 delta snapshots (14.9/s, median 382 B, max 2.6 KB,
    ~6.0 KB/s).
  - The server sends every second tick, so snapshots arrive every 66 ms at the median.
  - Ping from the cloud machine was 190 ms at the median, and interpolation delay ranged
    3.2–6.2 ticks.
  - Predicted position led the last server position by ~31 units at the median, and the
    visible correction stayed under 5 px for 90% of samples.
- **Room:** round 52, win target 788 power, 302 distinct bodies seen, 32 of them humans.
  `/status` showed 303–320 players in 11 rooms across the session.
- **What happened to the test player:** detained twice in the first minute (carried →
  escorted → bus for 9–12 s → released at a far drop-off such as Bawana PS).
- **Measured speeds while moving (median / p90):**

  | Who | Median | p90 |
  |---|---|---|
  | Police | 126 | 205 |
  | Marching protesters | 136 | 190 |
  | Human players | 135 | 171 |
  | Scared NPCs (sprint) | 148 | 249 |
  | TV crews | 176 | 240 |
  | Idle bystanders | 34 | 48 |

  These are consistent with the code's base values: 150, ×1.45 sprint, 45 idle.
- **Tear gas:** 80 shells seen. The cloud radius was 150 for human-thrown shells and 115 for
  NPC-thrown shells, as in `updateCans`.
- **Phone:** a floating joystick moved the protester at 159 units/s (150 × 1.06). Only the
  NAARA button shows for protesters; LATHI and GAS show for police. LIFT and DASH stay hidden.
- **Payments:** none. There is no shop, currency or purchase flow in the code or the traffic.

## 14. Our own server

`server/` is a from-scratch Node server for the unmodified client. It runs the game's shared
`sim.js` (one instance per room, 30 Hz) and speaks the protocol from §2.1: deflate-raw
snapshots, with the previous snapshot as the dictionary, at 15 Hz.

It answers each unknown in §12 with its own policy:
- **Rooms:** fill the fullest room up to 32 humans, then open a new room.
- **Connections:** 4 sockets per IP.
- **Idle:** warn at 90 s, kick with close code 4000 at 115 s.
- **Resume:** a 22 s window.
- **Keyframes:** on request and every 30 s.
- **Full server:** a queue, then `full` with close code 1013.
- **Names:** cleaned before use.

These are our choices, not the live server's. `npm test` runs 7 end-to-end protocol tests,
decoding snapshots with the client's own fflate. A two-browser Chromium session also played
together on it, and a page reload resumed the same body. See `server/README.md`.
