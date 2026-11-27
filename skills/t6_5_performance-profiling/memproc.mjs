// t6.5 helper process: draw frames the way an engine worker does (draw, dither, PNG encode, write a file) and report the peak resident memory.
// node memproc.mjs <card.mjs> <frames> <yieldEvery 0=never> <preview 0|1>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCard, renderFrame } from '../../engine/render.mjs';
const [card, frames, every, prev] = process.argv.slice(2), c = await loadCard(card), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem_')), n = Math.min(+frames, c.META.frames);
if (c.init) await c.init();
for (let f = 0; f < n; f++) { fs.writeFileSync(path.join(dir, `${f}.png`), renderFrame(c, f, { preview: prev === '1' }).toBuffer('image/png')); if (+every && f % +every === 0) await new Promise(r => setImmediate(r)); }
fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ frames: n, yieldEvery: +every, maxRSSMB: Math.round(process.resourceUsage().maxRSS / 1024) }));
process.exit(0);
