'use strict';
// End-to-end protocol checks against our server, decoding snapshots with the game's own fflate build
// the same way the browser client does (flags byte + deflate-raw, previous snapshot as dictionary).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const WebSocket = require('ws');
const { start, cleanName, cleanInput } = require('../server');

const GAME_DIR = path.resolve(process.env.GAME_DIR || path.join(__dirname, '..', '..', 'site'));
const fflate = require(path.join(GAME_DIR, 'vendor', 'fflate.js'));
const UTF8 = new TextDecoder();

let srv, base;
test.before(async () => {
  srv = await start({ port: 0, host: '127.0.0.1', gameDir: GAME_DIR, maxConnsPerIp: 6, idleWarnSec: 2, idleKickSec: 3 });
  base = `127.0.0.1:${srv.port}`;
});
test.after(() => srv.close());

// a minimal client mirroring client.js's Online class
function connect(q = '') {
  const ws = new WebSocket(`ws://${base}/ws${q}`);
  const c = { ws, dict: null, snaps: [], text: [], keys: 0, deltas: 0, errors: 0, closed: null };
  ws.on('message', (data, isBinary) => {
    if (!isBinary) return c.text.push(JSON.parse(data.toString()));
    const b = new Uint8Array(data);
    const key = b[0] & 1;
    try {
      if (!key && !c.dict) throw new Error('delta before keyframe');
      const raw = fflate.inflateSync(b.subarray(1), key ? undefined : { dictionary: c.dict });
      c.dict = raw;
      c.snaps.push(JSON.parse(UTF8.decode(raw)));
      key ? c.keys++ : c.deltas++;
    } catch (e) {
      c.errors++;
      c.dict = null;
    }
  });
  ws.on('close', (code) => (c.closed = code));
  c.send = (o) => ws.send(JSON.stringify(o));
  c.open = new Promise((r, j) => {
    ws.on('open', r);
    ws.on('error', j);
  });
  c.until = async (fn, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('timed out waiting');
  };
  c.welcome = () => c.text.find((m) => m.t === 'welcome');
  c.close = () => {
    ws.close();
    return c.until(() => c.closed !== null);
  };
  return c;
}
async function join(name, team, q) {
  const c = connect(q);
  await c.open;
  c.send({ t: 'join', name, team, mud: 2 });
  await c.until(c.welcome);
  return c;
}

test('join, keyframe then delta snapshots decode with the client decoder', async () => {
  const a = await join('Tester', 'P');
  const w = a.welcome();
  assert.ok(w.id > 0 && w.token && w.room && w.info && Array.isArray(w.info.pockets));
  await a.until(() => a.snaps.length >= 12);
  assert.strictEqual(a.errors, 0);
  assert.strictEqual(a.keys, 1);
  assert.ok(a.deltas >= 11);
  const s = a.snaps[a.snaps.length - 1];
  assert.strictEqual(s.t, 's');
  assert.strictEqual(s.me.id, w.id);
  assert.strictEqual(s.me.team, 'P');
  for (const k of ['e', 'g', 'rd', 'b', 'c', 'r', 'bus', 'k', 'fx']) assert.ok(k in s, 'snapshot has ' + k);
  await a.close();
});

test('inputs move the player and are acknowledged; ping, kf and team work', async () => {
  const a = await join('Mover', 'P');
  await a.until(() => a.snaps.length > 2 && a.snaps[a.snaps.length - 1].me.st === 'active');
  const s0 = a.snaps[a.snaps.length - 1].me;
  for (let i = 1; i <= 45; i++) {
    a.send({ t: 'in', s: i, x: 1, y: 0, m: 1 });
    await new Promise((r) => setTimeout(r, 33));
  }
  const s1 = await a.until(() => {
    const me = a.snaps[a.snaps.length - 1].me;
    return me.ack >= 40 && me;
  });
  assert.ok(Math.hypot(s1.x - s0.x, s1.y - s0.y) > 60, 'moved');
  a.send({ t: 'ping', c: 1234 });
  await a.until(() => a.text.some((m) => m.t === 'pong' && m.c === 1234));
  const keysBefore = a.keys;
  a.send({ t: 'kf' });
  await a.until(() => a.keys > keysBefore);
  a.send({ t: 'team', team: 'C', mud: 0 });
  await a.until(() => a.snaps[a.snaps.length - 1].me.team === 'C');
  assert.strictEqual(a.errors, 0);
  await a.close();
});

test('two players share a room and appear in each other\'s names list', async () => {
  const a = await join('Alpha', 'P');
  const b = await join('Bravo', 'C');
  assert.strictEqual(a.welcome().room, b.welcome().room);
  await a.until(() => a.snaps.some((s) => s.names && s.names.some((n) => n[1] === 'Bravo')));
  const st = await (await fetch(`http://${base}/status`)).json();
  assert.ok(st.players >= 2 && st.rooms >= 1 && st.maxPerRoom === 32);
  await a.close();
  await b.close();
});

test('a dropped player resumes the same body with the token', async () => {
  const a = await join('Comeback', 'P');
  const { id, token } = a.welcome();
  a.ws.terminate();
  await a.until(() => a.closed !== null);
  const b = connect('?r=' + encodeURIComponent(token));
  await b.open;
  b.send({ t: 'join', name: 'Comeback', team: 'P', resume: token });
  const w = await b.until(b.welcome);
  assert.strictEqual(w.resumed, true);
  assert.strictEqual(w.id, id);
  await b.close();
});

test('per-network connection limit closes extra sockets with 1008', async () => {
  const open = [];
  for (let i = 0; i < 6; i++) {
    const c = connect();
    await c.open;
    open.push(c);
  }
  const extra = connect();
  await extra.until(() => extra.closed !== null);
  assert.strictEqual(extra.closed, 1008);
  for (const c of open) await c.close();
});

test('idle players are warned, then kicked with 4000', async () => {
  const a = await join('Sleepy', 'P');
  await a.until(() => a.text.some((m) => m.t === 'idlewarn'), 6000);
  await a.until(() => a.closed !== null, 6000);
  assert.strictEqual(a.closed, 4000);
});

test('names and inputs are cleaned', () => {
  assert.strictEqual(cleanName('  Bunty‮ from\n\tBurari  ', 'P'), 'Bunty from Burari');
  assert.strictEqual(cleanName('<b>x</b>', 'P'), 'bx/b');
  assert.strictEqual(cleanName('', 'C'), 'Const. Rookie');
  assert.strictEqual(cleanName('Fake bot 🤖', 'P'), 'Fake bot');
  assert.strictEqual(Array.from(cleanName('a'.repeat(40), 'P')).length, 18);
  const i = cleanInput({ s: 5, x: 9, y: -9, g: [99999, -5], aim: 'nope', extra: 1 });
  assert.deepStrictEqual([i.x, i.y, i.g[0], i.g[1], i.aim, 'extra' in i], [1, -1, 6000, 0, undefined, false]);
});
