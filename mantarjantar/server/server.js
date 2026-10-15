'use strict';
// Our own server for the Jantar Mantar Chalo browser client.
// It runs the game's shared simulation (shared/sim.js, downloaded separately into GAME_DIR)
// and speaks the WebSocket protocol the client expects (see ../REVERSE_ENGINEERING.md §2.1).
// Everything the original server keeps private (room assignment, limits, idle kick,
// keyframes, name filtering, queue, resume) is our own policy, set in CONFIG below.

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const CONFIG = {
  port: +process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  gameDir: path.resolve(process.env.GAME_DIR || path.join(__dirname, '..', 'site')),
  maxPerRoom: +process.env.MAX_PER_ROOM || 32,
  maxRooms: +process.env.MAX_ROOMS || 8,
  maxQueue: 50,
  maxConnsPerIp: +process.env.MAX_CONNS_PER_IP || 4,
  idleWarnSec: +process.env.IDLE_WARN_SEC || 90, // send "idlewarn" after this long without input
  idleKickSec: +process.env.IDLE_KICK_SEC || 115, // close with 4000 after this (warn + 25 s)
  resumeGraceMs: 22000, // the client keeps its resume token for 22 s
  keyframeEveryTicks: 30 * 30, // a fresh keyframe every 30 s even if nothing went wrong
  sendEveryTicks: 2, // 30 Hz simulation, 15 Hz snapshots (what the live server does)
  maxBufferedBytes: 256 * 1024, // skip a client's snapshot while its socket is backed up
  emptyRoomTtlMs: 60000,
  simOptions: {}, // passed to Sim.createSim (roundTime, minP, minC, npcCap…)
};

// ---------------------------------------------------------------- load the shared game code
function loadSim(dir) {
  const simPath = path.join(dir, 'shared', 'sim.js');
  if (!fs.existsSync(simPath)) {
    console.error(`Game files not found in ${dir}.\nRun "npm run fetch-client" first, or set GAME_DIR to a folder holding index.html, client.js, vendor/ and shared/.`);
    process.exit(1);
  }
  return require(simPath);
}

// ---------------------------------------------------------------- input and name hygiene
const NAME_MAX = 18;
const BLOCKED = (process.env.BLOCKED_NAMES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
function cleanName(raw, team) {
  let n = String(raw == null ? '' : raw)
    .normalize('NFC')
    .replace(/\s+/g, ' ') // tabs and newlines become spaces before control characters are dropped
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '') // control and bidi characters
    .replace(/[<>]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  n = Array.from(n).slice(0, NAME_MAX).join('');
  if (n.endsWith('🤖')) n = n.replace(/🤖+$/u, '').trim(); // the robot mark is reserved for bots
  const low = n.toLowerCase();
  if (!n || BLOCKED.some((b) => low.includes(b))) n = team === 'C' ? 'Const. Rookie' : 'Aam Aadmi';
  return n;
}
const num = (v, lo, hi) => {
  v = +v;
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0;
};
// same shape as the client's own inputMsg(); everything else in the message is dropped
function cleanInput(o) {
  return {
    s: Number.isInteger(o.s) ? o.s : 0,
    x: num(o.x, -1, 1),
    y: num(o.y, -1, 1),
    sp: o.sp ? 1 : 0,
    a: o.a ? 1 : 0,
    e: o.e ? 1 : 0,
    g: Array.isArray(o.g) ? [num(o.g[0], 0, 6000), num(o.g[1], 0, 6000)] : 0,
    q: Number.isInteger(o.q) ? o.q : -1,
    ff: o.ff ? 1 : 0,
    f: o.f ? 1 : 0,
    r: o.r ? 1 : 0,
    m: o.m ? 1 : 0,
    aim: Number.isFinite(+o.aim) ? +o.aim : undefined,
  };
}

// ---------------------------------------------------------------- rooms
class Room {
  constructor(id, Sim) {
    this.id = id;
    this.sim = Sim.createSim(CONFIG.simOptions);
    this.clients = new Set(); // connected Client objects
    this.parked = new Map(); // token -> {pid, until} for players who dropped and may resume
    this.emptySince = Date.now();
  }
  humans() {
    return this.clients.size + this.parked.size;
  }
  tick() {
    const sim = this.sim;
    sim.step();
    const tick = sim.S.tick;
    const now = Date.now();
    for (const [tok, p] of this.parked)
      if (p.until <= now) {
        sim.removePlayer(p.pid);
        this.parked.delete(tok);
        tokens.delete(tok);
      }
    if (tick % 30 === 0) for (const c of this.clients) c.checkIdle();
    if (tick % CONFIG.sendEveryTicks) return;
    for (const c of this.clients) c.sendSnapshot(tick);
    if (this.humans()) this.emptySince = now;
  }
  stats() {
    const s = this.sim.stats();
    return { id: this.id, humans: this.humans(), P: s.P, C: s.C, ents: s.ents, round: s.round };
  }
}

const rooms = new Map();
const tokens = new Map(); // resume token -> room
let roomSeq = 0;
let Sim = null;

function totalHumans() {
  let n = 0;
  for (const r of rooms.values()) n += r.humans();
  return n;
}
// fill the fullest room that still has space, so players meet each other; open a new room when all are full
function pickRoom() {
  let best = null;
  for (const r of rooms.values()) if (r.humans() < CONFIG.maxPerRoom && (!best || r.humans() > best.humans())) best = r;
  if (best) return best;
  if (rooms.size >= CONFIG.maxRooms) return null;
  const r = new Room('R' + ++roomSeq, Sim);
  rooms.set(r.id, r);
  return r;
}

// ---------------------------------------------------------------- clients
const ipConns = new Map();
const queue = [];

class Client {
  constructor(ws, ip) {
    this.ws = ws;
    this.ip = ip;
    this.room = null;
    this.pid = 0;
    this.token = null;
    this.view = { w: 1200, h: 900 };
    this.cl = { fxTick: 0 }; // per-client snapshot bookkeeping used by sim.snapshotJSON
    this.dict = null; // last raw snapshot sent = deflate dictionary for the next one
    this.wantKey = true;
    this.lastKeyTick = 0;
    this.warned = false;
    this.join = null;
  }
  sendText(o) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
  }
  admit(msg) {
    const team = msg.team === 'C' ? 'C' : 'P';
    const mud = Number.isInteger(msg.mud) ? msg.mud : undefined;
    let resumed = false;
    const tok = typeof msg.resume === 'string' ? msg.resume : this.resumeTok;
    const held = tok && tokens.get(tok);
    if (held && held.parked.has(tok)) {
      const p = held.parked.get(tok);
      held.parked.delete(tok);
      this.room = held;
      this.pid = p.pid;
      this.token = tok;
      resumed = true; // keep the body's current team: a reconnecting client re-sends the team it started with
    } else {
      const room = pickRoom();
      if (!room) return false;
      this.room = room;
      const e = room.sim.addPlayer(cleanName(msg.name, team), team, false, mud);
      this.pid = e.id;
      this.token = crypto.randomBytes(16).toString('hex');
      tokens.set(this.token, room);
    }
    this.room.clients.add(this);
    this.cl = { fxTick: this.room.sim.S.tick };
    this.dict = null;
    this.wantKey = true;
    this.sendText({ t: 'welcome', id: this.pid, room: this.room.id, info: this.room.sim.staticInfo(), token: this.token, resumed });
    return true;
  }
  onMessage(data) {
    let m;
    try {
      m = JSON.parse(data);
    } catch (e) {
      return;
    }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') return this.sendText({ t: 'pong', c: +m.c || 0 });
    if (m.t === 'join') {
      if (this.room || this.join) return;
      this.join = m;
      if (!this.admit(m)) enqueue(this);
      return;
    }
    if (!this.room) return;
    const sim = this.room.sim;
    if (m.t === 'in') {
      sim.input(this.pid, cleanInput(m));
      if (m.m) this.warned = false;
    } else if (m.t === 'view') this.view = { w: num(m.w, 400, 2200), h: num(m.h, 300, 1600) };
    else if (m.t === 'team') sim.setTeam(this.pid, m.team === 'C' ? 'C' : 'P', Number.isInteger(m.mud) ? m.mud : undefined);
    else if (m.t === 'kf') this.wantKey = true;
  }
  checkIdle() {
    const idle = this.room.sim.idleSeconds(this.pid);
    if (idle >= CONFIG.idleKickSec) this.ws.close(4000, 'idle');
    else if (idle >= CONFIG.idleWarnSec && !this.warned) {
      this.warned = true;
      this.sendText({ t: 'idlewarn' });
    }
  }
  sendSnapshot(tick) {
    if (this.ws.readyState !== 1) return;
    if (this.ws.bufferedAmount > CONFIG.maxBufferedBytes) return; // dictionary chain stays intact: nothing was sent
    const raw = Buffer.from(this.room.sim.snapshotJSON(this.pid, this.view, this.cl));
    const key = this.wantKey || !this.dict || tick - this.lastKeyTick >= CONFIG.keyframeEveryTicks;
    const body = key ? zlib.deflateRawSync(raw) : zlib.deflateRawSync(raw, { dictionary: this.dict });
    const frame = Buffer.allocUnsafe(body.length + 1);
    frame[0] = key ? 1 : 0;
    body.copy(frame, 1);
    this.ws.send(frame);
    this.dict = raw;
    if (key) {
      this.wantKey = false;
      this.lastKeyTick = tick;
    }
  }
  onClose(code) {
    const qi = queue.indexOf(this);
    if (qi >= 0) queue.splice(qi, 1);
    const n = (ipConns.get(this.ip) || 1) - 1;
    if (n > 0) ipConns.set(this.ip, n);
    else ipConns.delete(this.ip);
    if (!this.room) return;
    this.room.clients.delete(this);
    if (code === 4000) {
      // idle kick: free the spot now
      this.room.sim.removePlayer(this.pid);
      tokens.delete(this.token);
    } else this.room.parked.set(this.token, { pid: this.pid, until: Date.now() + CONFIG.resumeGraceMs });
    this.room = null;
    drainQueue();
  }
}

function enqueue(c) {
  if (queue.length >= CONFIG.maxQueue) {
    c.sendText({ t: 'full', alt: [] });
    c.ws.close(1013, 'full');
    return;
  }
  queue.push(c);
  c.sendText({ t: 'queue', pos: queue.length, total: queue.length });
}
function drainQueue() {
  while (queue.length && queue[0].admit(queue[0].join)) queue.shift();
  queue.forEach((c, i) => c.sendText({ t: 'queue', pos: i + 1, total: queue.length }));
}

// ---------------------------------------------------------------- HTTP: static client + /status
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function status() {
  const list = [...rooms.values()].map((r) => r.stats());
  return { players: totalHumans(), rooms: rooms.size, queue: queue.length, maxPerRoom: CONFIG.maxPerRoom, list };
}
function serve(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/status') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    return res.end(JSON.stringify(status()));
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(CONFIG.gameDir, p));
  if (!file.startsWith(CONFIG.gameDir + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(buf);
  });
}

// ---------------------------------------------------------------- boot
function start(opts) {
  Object.assign(CONFIG, opts || {});
  Sim = loadSim(CONFIG.gameDir);
  const server = http.createServer(serve);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  wss.on('connection', (ws, req) => {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
    const n = (ipConns.get(ip) || 0) + 1;
    if (n > CONFIG.maxConnsPerIp) {
      ws.close(1008, 'too many connections');
      return;
    }
    ipConns.set(ip, n);
    const c = new Client(ws, ip);
    c.resumeTok = new URL(req.url, 'http://x').searchParams.get('r') || null;
    ws.on('message', (d, isBinary) => {
      if (!isBinary) c.onMessage(d.toString());
    });
    ws.on('close', (code) => c.onClose(code));
    ws.on('error', () => {});
  });
  const TICK_MS = 1000 / 30;
  let next = Date.now();
  const loop = setInterval(() => {
    const now = Date.now();
    let steps = 0;
    while (now >= next && steps < 4) {
      for (const r of rooms.values()) r.tick();
      next += TICK_MS;
      steps++;
    }
    if (now - next > 500) next = now; // fell far behind: drop the backlog instead of fast-forwarding
    for (const [id, r] of rooms) if (!r.humans() && now - r.emptySince > CONFIG.emptyRoomTtlMs) rooms.delete(id);
  }, 5);
  return new Promise((resolve) =>
    server.listen(CONFIG.port, CONFIG.host, () => {
      const a = server.address();
      console.log(`Jantar Mantar server on http://${CONFIG.host === '0.0.0.0' ? 'localhost' : CONFIG.host}:${a.port}  (game files: ${CONFIG.gameDir})`);
      resolve({
        port: a.port,
        status,
        close: () =>
          new Promise((done) => {
            clearInterval(loop);
            for (const c of wss.clients) c.terminate();
            wss.close();
            server.close(() => done());
          }),
      });
    }),
  );
}

if (require.main === module) start();
module.exports = { start, cleanName, cleanInput, CONFIG };
