#!/usr/bin/env node
// t6.5 test: statistics, the toolkit, the profile of real cards (ported tt10, hello_card), planted slow and leaking cards, a cached twin that gives the same
// pixels in less time, the optimised tt10, the cost prediction against a real render, the raw-pipe prototype against the engine; then the demo render + QC.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { runSkillTest } from '../../engine/testkit.mjs';
import { loadCard, renderCard } from '../../engine/render.mjs';
import { createCanvas } from '../../engine/index.mjs';
import { percentile, stats, phaseTimes, countOps, profileCard, advise, renderCost, memoryTrend, loopMemory, layerCache, memo, scratch, glowSprite, drawGlow, cacheStats, clearCaches, encodeBench, rawRender, BUDGET } from './module.mjs';

const here = import.meta.dirname, TT10 = path.join(here, '../t6_2_batch-render-and-cache/ported/tt10_ops_hr.mjs'), CACHED = path.join(here, 'optimized/tt10_ops_hr_cached.mjs'), HELLO = path.join(here, '../../engine/examples/hello_card.mjs');
const IDX = new URL('../../engine/index.mjs', import.meta.url).href, MOD = new URL('./module.mjs', import.meta.url).href;
const sha = cv => crypto.createHash('sha1').update(cv.toBuffer('image/png')).digest('hex');
// planted fixtures: the same picture drawn two ways (static layer rebuilt every frame with two scratch canvases, versus cached), and a leaker
const STATIC = `const base = (c) => { const g = c.createRadialGradient(540, 900, 100, 540, 900, 1300); g.addColorStop(0, '#1b2a3a'); g.addColorStop(1, '#0a0c10'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920); for (let k = 0; k < 40; k++) { c.fillStyle = 'rgba(25,224,143,0.08)'; c.fillRect(0, k * 48, 1080, 2); } };`;
const SLOW = `import { createCanvas } from ${JSON.stringify(IDX)};
export const META = { W: 1080, H: 1920, fps: 30, frames: 60, qc: { closer: false } };
${STATIC}
export function frame(t, i) { const cv = createCanvas(1080, 1920), ctx = cv.getContext('2d');
  for (let n = 0; n < 2; n++) { const tmp = createCanvas(1080, 1920); base(tmp.getContext('2d')); ctx.drawImage(tmp, 0, 0); }
  for (let k = 0; k < 120; k++) { ctx.save(); ctx.shadowColor = '#19e08f'; ctx.shadowBlur = 60; ctx.fillStyle = '#19e08f'; ctx.beginPath(); ctx.arc(80 + (k % 24) * 40 + 20 * Math.sin(t * 3 + k), 500 + Math.floor(k / 24) * 150, 10, 0, 7); ctx.fill(); ctx.restore(); }
  ctx.getImageData(0, 0, 10, 10); return cv; }
`;
const FAST = `import { createCanvas } from ${JSON.stringify(IDX)};
import { layerCache } from ${JSON.stringify(MOD)};
export const META = { W: 1080, H: 1920, fps: 30, frames: 60, qc: { closer: false } };
${STATIC}
export function frame(t, i) { const cv = createCanvas(1080, 1920), ctx = cv.getContext('2d');
  const L = layerCache('static', 1080, 1920, c => base(c)); ctx.drawImage(L, 0, 0); ctx.drawImage(L, 0, 0);
  for (let k = 0; k < 120; k++) { ctx.save(); ctx.shadowColor = '#19e08f'; ctx.shadowBlur = 60; ctx.fillStyle = '#19e08f'; ctx.beginPath(); ctx.arc(80 + (k % 24) * 40 + 20 * Math.sin(t * 3 + k), 500 + Math.floor(k / 24) * 150, 10, 0, 7); ctx.fill(); ctx.restore(); }
  return cv; }
`;
const LEAK = `import { createCanvas } from ${JSON.stringify(IDX)};
export const META = { W: 1080, H: 1920, fps: 30, frames: 60, qc: { closer: false } };
const keep = []; export function frame(t, i) { const cv = createCanvas(1080, 1920), ctx = cv.getContext('2d'); ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, 1080, 1920); const k = createCanvas(500, 500); k.getContext('2d').fillRect(0, 0, 500, 500); keep.push(k); return cv; }
`;
const CLEAN = LEAK.replace('keep.push(k);', '');

await runSkillTest({ dir: here, checks: async ({ ok, near, section }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't65_')); const w = (n, s) => { const f = path.join(tmp, n); fs.writeFileSync(f, s); return f; };
  try {
    section('statistics');
    near(percentile([1, 2, 3, 4, 5], 50), 3, 1e-9, 'median'); near(percentile([1, 2, 3, 4, 5], 95), 4.8, 1e-9, 'p95 interpolates'); ok(stats([10, 20, 30]).mean === 20 && stats([10, 20, 30]).max === 30, 'stats mean and max');
    ok(BUDGET.cardMeanMs === 25 && BUDGET.frameMs === 116, 'the budget: 116 ms a frame, 25 ms for the card');

    section('toolkit');
    clearCaches(); let drawn = 0; const a = layerCache('k', 100, 100, c => { drawn++; c.fillStyle = '#f00'; c.fillRect(0, 0, 100, 100); }), b = layerCache('k', 100, 100, () => { drawn++; });
    ok(a === b && drawn === 1, 'layerCache draws once and returns the same canvas'); let calls = 0; const m1 = memo('m', () => { calls++; return [1, 2]; }), m2 = memo('m', () => { calls++; return []; }); ok(m1 === m2 && calls === 1, 'memo computes once');
    const s1 = scratch('s', 50, 50); s1.getContext('2d').fillRect(0, 0, 50, 50); const s2 = scratch('s', 50, 50); ok(s1 === s2 && s2.getContext('2d').getImageData(10, 10, 1, 1).data[3] === 0, 'scratch is one canvas, cleared on every request');
    ok(glowSprite('rgba(25,224,143,0.6)', 40) === glowSprite('rgba(25,224,143,0.6)', 40) && cacheStats().layers === 1 && cacheStats().glows === 1 && cacheStats().megabytes > 0, `glow sprites are cached; stats ${JSON.stringify(cacheStats())}`);
    const gc = createCanvas(200, 200); drawGlow(gc.getContext('2d'), 100, 100, 'rgba(25,224,143,0.6)', 40); const px = gc.getContext('2d').getImageData(100, 100, 1, 1).data, far = gc.getContext('2d').getImageData(5, 5, 1, 1).data; ok(px[1] > 100 && far[3] === 0, 'drawGlow is bright at the centre and clear at the edge'); clearCaches(); ok(cacheStats().layers === 0, 'clearCaches empties everything');

    section('real card: ported tt10 (1080x1920)');
    const P = await profileCard(TT10, { every: 6 });
    ok(P.share.png >= 60 && P.share.png <= 85 && P.share.draw + P.share.raster <= 20, `the PNG encode is ${P.share.png}% of a frame, the card's own drawing ${P.share.draw + P.share.raster}%`);
    ok(P.phases.png.mean > 50 && P.phases.dither.mean > 8 && P.phases.draw.mean < 8 && P.phases.raster.mean > 3, `stage means: draw ${P.phases.draw.mean}, raster ${P.phases.raster.mean}, dither ${P.phases.dither.mean}, png ${P.phases.png.mean} ms`);
    ok(P.budget.cardMean && P.budget.cardP95, `tt10's own time is inside the budget: ${P.cardMs.mean} ms mean, ${P.cardMs.p95} ms p95`);
    ok(P.ops.canvasesPerFrame === 1 && !P.ops.readsPixelsInFrame && P.ops.shadowCallsPerFrame === 0 && P.ops.callsPerFrame.fillRect > 50, `tt10 draws on 1 canvas, no readback, no shadows, ${P.ops.callsPerFrame.fillRect} fillRect calls a frame`);
    const hg = P.hotspots.rows.find(r => r.kind === 'gradients'), hsh = P.hotspots.rows.find(r => r.kind === 'shapes'); ok(P.hotspots.rows[0].savedMs >= P.hotspots.rows[1].savedMs && hg.savedMs > 2 && hsh.savedMs > 3, `hot spots by ablation: shapes ${hsh.savedMs} ms, gradients ${hg.savedMs} ms (the full-screen vignette)`);
    ok(P.memory && !P.memory.leak && P.memory.aliveCanvasesAtEnd <= 4, `tt10 keeps no canvases (${P.memory.aliveCanvasesAtEnd} alive, ${P.memory.slopeMBPer100Frames} MB per 100 frames)`);
    ok(P.advice.some(l => /PNG encode/.test(l)) && P.advice.some(l => /inside the budget/.test(l)) && P.advice.some(l => /gradient/.test(l)), 'the advice names the PNG encode, the budget verdict and the gradient hot spot');
    console.log('  info: tt10 advice:\n    ' + P.advice.join('\n    '));

    section('planted slow card, its cached twin, and a leaker');
    const slowF = w('slow.mjs', SLOW), fastF = w('fast.mjs', FAST), SP = await profileCard(slowF, { every: 5, memory: false }), FP = await profileCard(fastF, { every: 5, memory: false, hot: false });
    ok(SP.ops.canvasesPerFrame >= 3 && SP.ops.canvasMBPerFrame >= 20 && SP.ops.readsPixelsInFrame && SP.ops.shadowCallsPerFrame >= 100, `the slow card is described: ${SP.ops.canvasesPerFrame} canvases (${SP.ops.canvasMBPerFrame} MB), ${SP.ops.shadowCallsPerFrame} shadow calls, pixel readback`);
    ok(['canvases', 'readback', 'shadowBlur'].every((k, i) => SP.advice.some(l => [/canvases are drawn/, /getImageData/, /shadowBlur/][i].test(l))), 'the advice names the extra canvases, the readback and the shadows');
    ok(SP.hotspots.rows.find(r => r.kind === 'shadow').savedMs > 1 && SP.hotspots.rows.find(r => r.kind === 'images').savedMs > 1, `ablation finds the shadows (${SP.hotspots.rows.find(r => r.kind === 'shadow').savedMs} ms) and the layer blits (${SP.hotspots.rows.find(r => r.kind === 'images').savedMs} ms)`);
    const cs = await loadCard(slowF), cf = await loadCard(fastF); const same = [0, 20, 41, 59].every(i => sha(cs.frame(i / 30, i)) === sha(cf.frame(i / 30, i))); ok(same, 'the cached twin draws exactly the same pixels (4 frames, sha1)');
    ok(FP.cardMs.mean <= SP.cardMs.mean * 0.7 && FP.ops.canvasesPerFrame === 1 && !FP.ops.readsPixelsInFrame, `the cached twin is faster: ${SP.cardMs.mean} ms -> ${FP.cardMs.mean} ms, ${FP.ops.canvasesPerFrame} canvas a frame`);
    const lk = await memoryTrend(await loadCard(w('leak.mjs', LEAK)), { frames: 100, warm: 10 }), cl = await memoryTrend(await loadCard(w('clean.mjs', CLEAN)), { frames: 100, warm: 10 });
    ok(lk.leak && lk.slopeMBPer100Frames > 20 && lk.aliveCanvasesAtEnd > 80 && !cl.leak && cl.aliveCanvasesAtEnd <= 4, `a card that keeps a canvas every frame leaks ${lk.slopeMBPer100Frames} MB per 100 frames (${lk.aliveCanvasesAtEnd} canvases alive); the clean twin ${cl.slopeMBPer100Frames} MB (${cl.aliveCanvasesAtEnd} alive)`);

    section('memory while rendering (the engine worker loop)');
    const lm0 = await loopMemory(HELLO, { frames: 90, yieldEvery: 0 }), lm1 = await loopMemory(HELLO, { frames: 90, yieldEvery: 10 });
    ok(lm0.maxRSSMB > 1000 && lm1.maxRSSMB < lm0.maxRSSMB * 0.5, `90 frames at full size: ${lm0.maxRSSMB} MB peak if the loop never yields, ${lm1.maxRSSMB} MB if it turns the event loop every 10 frames`);
    console.log(`  info: worker-loop memory, 90 frames: ${lm0.maxRSSMB} MB without yielding, ${lm1.maxRSSMB} MB with`);

    section('optimised tt10');
    const c0 = await loadCard(TT10), c1 = await loadCard(CACHED); let maxd = 0, sum = 0, n = 0;
    for (const i of [0, 30, 60, 100, 150, 220, 300, 420, 494]) { const a = c0.frame(i / 30, i).getContext('2d').getImageData(0, 0, 1080, 1920).data, b = c1.frame(i / 30, i).getContext('2d').getImageData(0, 0, 1080, 1920).data; for (let k = 0; k < a.length; k += 4) { const d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); if (d > maxd) maxd = d; sum += d; n++; } }
    ok(maxd <= 6 && sum / n < 1.0, `the cached-vignette tt10 matches the port to rounding: largest difference ${maxd} levels summed over 3 channels (1 per channel), mean ${(sum / n).toFixed(2)} (not byte-identical: 8-bit alpha in the layer)`);
    const idx = Array.from({ length: 41 }, (_, j) => j * 12), best = (c, k) => Math.min(...[0, 1, 2].map(() => stats(phaseTimes(c, idx).draw.map((d, j, arr) => d)).mean + 0)), once = c => { const p = phaseTimes(c, idx); return p.draw.reduce((s, v, j) => s + v + p.raster[j], 0) / idx.length; };
    const a2 = Math.min(once(c0), once(c0)), b2 = Math.min(once(c1), once(c1)); ok(b2 <= a2 * 0.88, `tt10's own time with the cached vignette: ${a2.toFixed(1)} ms -> ${b2.toFixed(1)} ms (${Math.round((1 - b2 / a2) * 100)}% less; the whole frame, with PNG and dither, gains about ${(a2 - b2).toFixed(1)} of ${P.totalMs.mean} ms)`);

    section('cost prediction and the raw-pipe prototype (hello_card, 1080x1920, 225 frames)');
    const hp = await profileCard(HELLO, { every: 3, memory: false, hot: false }), predicted = renderCost(hp);
    const t0 = Date.now(), eng = await renderCard(HELLO, { out: path.join(tmp, 'eng'), name: 'hello' }), engSec = (Date.now() - t0) / 1000;
    ok(predicted > engSec * 0.65 && predicted < engSec * 1.45, `predicted ${predicted} s, the engine took ${engSec.toFixed(1)} s (within 35 to 45 percent)`);
    const raw = await rawRender(HELLO, { out: path.join(tmp, 'raw'), name: 'hello' }), engHash = crypto.createHash('sha1').update(fs.readFileSync(eng.mp4)).digest('hex');
    ok(raw.sha1 === engHash, `the raw-pipe mp4 is byte-identical to the engine's (sha1 ${raw.sha1.slice(0, 10)})`); ok(raw.seconds < engSec * 0.7, `and takes ${raw.seconds} s against ${engSec.toFixed(1)} s (${(engSec / raw.seconds).toFixed(1)}x faster)`);
    const eb = encodeBench(await loadCard(TT10)); ok(eb.pngMs > eb.rawMs * 5 && eb.rawMB === 7.9, `getting a frame out: PNG ${eb.pngMs} ms (${eb.pngKB} KB), raw ${eb.rawMs} ms (${eb.rawMB} MB), WebP ${eb.webpMs} ms`);
    console.log(`  info: render of hello_card ${engSec.toFixed(1)} s (engine) vs ${raw.seconds} s (raw pipe); predicted ${predicted} s`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
} });
