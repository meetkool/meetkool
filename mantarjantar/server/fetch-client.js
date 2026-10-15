'use strict';
// Downloads the public game client into GAME_DIR (default ../site) for local study.
// These files belong to the game's authors; keep them local (the folder is gitignored).
const fs = require('fs');
const path = require('path');

const ORIGIN = process.env.GAME_ORIGIN || 'https://mantarjantar.com';
const DIR = path.resolve(process.env.GAME_DIR || path.join(__dirname, '..', 'site'));
const FILES = ['index.html', 'client.js', 'vendor/fflate.js', 'shared/world.js', 'shared/sim.js'];

(async () => {
  for (const f of FILES) {
    const res = await fetch(`${ORIGIN}/${f}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
    const out = path.join(DIR, f);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log(`saved ${path.relative(process.cwd(), out)}`);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
