// t6.5 performance-profiling: where does a card's render time go, what can a card author change, and what can only the engine change.
// Measured finding (2026-11-19, ported tt10 and hello_card at 1080x1920): drawing is recorded in about 2 ms, rasterised in about 10 ms,
// the engine's dither takes about 17 ms and the PNG encode about 70 ms per frame. A card's own drawing is only about 10 percent of the frame cost.
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCard, renderFrame, FFMPEG, run } from '../../engine/render.mjs';
import { createCanvas, ditherDark } from '../../engine/index.mjs';

const SELF = fileURLToPath(import.meta.url);
/**
 * The budget. A 16.5 s card (495 frames) should render in under 40 s at full size with 2 workers. x264 (preset slow) costs about 23 ms a frame;
 * what is left is 116 ms of work per frame per worker, of which the engine's fixed share (dither + PNG) is about 90 ms. So the card's own
 * drawing (record + raster) gets 25 ms on average and 40 ms at the 95th percentile.
 */
export const BUDGET = { frameMs: 116, cardMeanMs: 25, cardP95Ms: 40, encodeMsFull: 23, encodeMsPreview: 6, startupSeconds: 1.2 };

// ------------------------------------------------------------------ statistics
/** Percentile of a list (linear interpolation). @param {number[]} a @param {number} p 0-100 */
export function percentile(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), k = (p / 100) * (s.length - 1), lo = Math.floor(k), hi = Math.ceil(k); return s[lo] + (s[hi] - s[lo]) * (k - lo); }
/** mean / p50 / p95 / p99 / max of a list of milliseconds, rounded to 0.01. */
export function stats(a) { const r = x => Math.round(x * 100) / 100; return { mean: r(a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)), p50: r(percentile(a, 50)), p95: r(percentile(a, 95)), p99: r(percentile(a, 99)), max: r(Math.max(0, ...a)) }; }
const ctxProtoOf = () => Object.getPrototypeOf(createCanvas(2, 2).getContext('2d'));
const getGc = () => { v8.setFlagsFromString('--expose-gc'); return vm.runInNewContext('gc'); };
const pickFrames = (N, every, from = 0) => { const a = []; for (let i = from; i < N; i += every) a.push(i); return a; };

// ------------------------------------------------------------------ phase times: record, raster, dither, scale, png
/**
 * Time the stages of one frame, in milliseconds: `draw` (the card's frame() call: Skia only records), `raster` (forcing the picture to pixels with a 1x1 read),
 * `dither` (the engine's ditherDark), `scale` (preview only), `png` (the encode the renderer does). `card` = loadCard() result.
 * The first `warm` frames are drawn and thrown away (fonts, JIT).
 * @returns {{idx:number[], draw:number[], raster:number[], dither:number[], scale:number[], png:number[]}}
 */
export function phaseTimes(card, idx, { preview = false, warm = 4 } = {}) {
  const { META } = card, out = { idx: [], draw: [], raster: [], dither: [], scale: [], png: [] }, now = () => performance.now();
  for (let w = 0; w < warm; w++) renderFrame(card, w % META.frames, { preview }).toBuffer('image/png');
  for (const i of idx) {
    const t0 = now(); let cv = card.frame(i / META.fps, i); const t1 = now(); cv.getContext('2d').getImageData(0, 0, 1, 1); const t2 = now();
    if (META.dither !== false) ditherDark(cv); const t3 = now();
    if (preview) { const s = createCanvas(540, 960), c = s.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, 540, 960); cv = s; } const t4 = now();
    cv.toBuffer('image/png'); const t5 = now();
    out.idx.push(i); out.draw.push(t1 - t0); out.raster.push(t2 - t1); out.dither.push(t3 - t2); out.scale.push(t4 - t3); out.png.push(t5 - t4);
  }
  return out;
}

// ------------------------------------------------------------------ operation counts (what the card asks Skia to do)
const COUNT_OPS = ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'drawCanvas', 'clip', 'getImageData', 'putImageData', 'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'save', 'measureText', 'roundRect'];
/**
 * Count the drawing calls of the frames in `idx` (patches the 2D context prototype for the duration, then restores it): calls per frame by operation,
 * how many calls ran with shadowBlur or a filter, how many canvases were drawn on (the frame itself is 1) and how many megabytes of pixels they hold.
 * Also notes whether the card reads pixels back (getImageData) inside frame().
 */
export function countOps(card, idx) {
  const proto = ctxProtoOf(), saved = {}, calls = {}, ctxProtoCanvas = Object.getPrototypeOf(createCanvas(2, 2)), origGet = ctxProtoCanvas.getContext, tot = { shadowCalls: 0, filterCalls: 0 };
  let canvases = new Set(), mbTotal = 0, nCanv = 0;
  for (const n of COUNT_OPS) { const o = proto[n]; if (!o) continue; saved[n] = o; proto[n] = function (...a) { calls[n] = (calls[n] || 0) + 1; if (/^(fill|stroke|draw)/.test(n)) { if (this.shadowBlur > 0) tot.shadowCalls++; if (this.filter && this.filter !== 'none') tot.filterCalls++; } return o.apply(this, a); }; }
  ctxProtoCanvas.getContext = function (...a) { if (!canvases.has(this)) { canvases.add(this); mbTotal += (this.width * this.height * 4) / 1048576; } return origGet.apply(this, a); };
  try { for (const i of idx) { canvases = new Set(); card.frame(i / card.META.fps, i); nCanv += canvases.size; } }
  finally { for (const [n, o] of Object.entries(saved)) proto[n] = o; ctxProtoCanvas.getContext = origGet; }
  const per = {}; for (const [n, c] of Object.entries(calls)) per[n] = Math.round((c / idx.length) * 10) / 10;
  return { callsPerFrame: per, shadowCallsPerFrame: Math.round((tot.shadowCalls / idx.length) * 10) / 10, filterCallsPerFrame: Math.round((tot.filterCalls / idx.length) * 10) / 10, canvasesPerFrame: Math.round((nCanv / idx.length) * 10) / 10, canvasMBPerFrame: Math.round((mbTotal / idx.length) * 10) / 10, readsPixelsInFrame: (per.getImageData || 0) > 0 };
}

// ------------------------------------------------------------------ hot spots by ablation
const PAINT = ['fill', 'stroke', 'fillText', 'strokeText', 'fillRect', 'strokeRect', 'drawImage', 'drawCanvas'];
const ABLATE = {
  shadow: { what: 'shadowBlur on drawing calls', apply: (p, w) => PAINT.forEach(n => w(n, o => function (...a) { if (this.shadowBlur) { const b = this.shadowBlur; this.shadowBlur = 0; try { return o.apply(this, a); } finally { this.shadowBlur = b; } } return o.apply(this, a); })) },
  text: { what: 'fillText and strokeText', apply: (p, w) => ['fillText', 'strokeText'].forEach(n => w(n, () => function () {})) },
  images: { what: 'drawImage and drawCanvas (layers, sprites)', apply: (p, w) => ['drawImage', 'drawCanvas'].forEach(n => w(n, () => function () {})) },
  gradients: { what: 'fills and strokes with a gradient or pattern', apply: (p, w) => { w('fill', o => function (...a) { if (typeof this.fillStyle !== 'string') return; return o.apply(this, a); }); w('fillRect', o => function (...a) { if (typeof this.fillStyle !== 'string') return; return o.apply(this, a); }); w('stroke', o => function (...a) { if (typeof this.strokeStyle !== 'string') return; return o.apply(this, a); }); } },
  strokes: { what: 'stroke, strokeRect, strokeText', apply: (p, w) => ['stroke', 'strokeRect', 'strokeText'].forEach(n => w(n, () => function () {})) },
  shapes: { what: 'fill and fillRect (solid shapes)', apply: (p, w) => ['fill', 'fillRect'].forEach(n => w(n, () => function () {})) },
};
/**
 * Hot spots by ablation: for each kind of drawing, run the same frames with that kind switched off and see how much of the card's own time (record + raster) goes away.
 * Per-call timers cannot do this because Skia records calls and rasterises later, at the first read. Output of the ablated frames is thrown away.
 * @returns {{baselineMs:number, rows:{kind:string, what:string, savedMs:number, pct:number}[]}} rows sorted by savedMs, biggest first
 */
export function hotspots(card, idx, { warm = 4 } = {}) {
  const proto = ctxProtoOf(), saved = {}, wrap = (n, f) => { if (!proto[n]) return; saved[n] ??= proto[n]; proto[n] = f(saved[n]); }, restore = () => { for (const [n, o] of Object.entries(saved)) proto[n] = o; for (const k of Object.keys(saved)) delete saved[k]; };
  const once = i => { const t0 = performance.now(); const cv = card.frame(i / card.META.fps, i); cv.getContext('2d').getImageData(0, 0, 1, 1); return performance.now() - t0; };
  for (let w = 0; w < warm; w++) once(w % card.META.frames);
  const base = idx.map(once), rows = [];
  for (const [kind, k] of Object.entries(ABLATE)) { // baseline and ablated frame run back to back, so machine drift cancels
    let b = 0, a = 0;
    for (const i of idx) { b += once(i); try { k.apply(proto, wrap); a += once(i); } finally { restore(); } }
    rows.push({ kind, what: k.what, savedMs: Math.round(((b - a) / idx.length) * 100) / 100 });
  }
  const baselineMs = base.reduce((s, v) => s + v, 0) / base.length;
  rows.forEach(r => { r.pct = Math.round(Math.max(0, (r.savedMs / baselineMs) * 100)); }); rows.sort((x, y) => y.savedMs - x.savedMs);
  return { baselineMs: Math.round(baselineMs * 100) / 100, rows };
}

// ------------------------------------------------------------------ memory
/**
 * Draw `frames` frames in a row (cycling through the card), collect garbage every 10 frames and count the canvases that are still alive (WeakRefs), as megabytes of pixels. A line through those counts is the trend.
 * `leak` is true when the megabytes of surviving canvases grow by more than 8 per 100 frames after warm-up.
 * @returns {{startMB:number, endMB:number, slopeMBPer100Frames:number, leak:boolean, samples:number}}
 */
export async function memoryTrend(card, { frames = 150, warm = 20 } = {}) {
  // Resident memory is too noisy to show a canvas leak (the allocator keeps freed pages), so count the canvases themselves: every canvas drawn on gets a
  // WeakRef; after a garbage collection and a turn of the event loop, a canvas that is still alive is one the card is keeping.
  const gc = getGc(), N = card.META.frames, pts = [], refs = [], seen = new WeakSet(), proto = Object.getPrototypeOf(createCanvas(2, 2)), orig = proto.getContext;
  proto.getContext = function (...a) { if (!seen.has(this)) { seen.add(this); refs.push([new WeakRef(this), (this.width * this.height * 4) / 1048576]); } return orig.apply(this, a); };
  const tick = async () => { gc(); await new Promise(r => setImmediate(r)); await new Promise(r => setTimeout(r, 5)); gc(); }, alive = () => { let n = 0, mb = 0; for (const [r, m] of refs) if (r.deref()) { n++; mb += m; } return [n, mb]; };
  try {
    for (let f = 0; f < frames + warm; f++) { const i = f % N, cv = card.frame(i / card.META.fps, i); cv.getContext('2d').getImageData(0, 0, 1, 1); if (f % 10 === 9) { await tick(); if (f >= warm) { const [n, mb] = alive(); pts.push([f - warm, mb, n]); } } }
  } finally { proto.getContext = orig; }
  const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0), sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  const slope = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0, per100 = Math.round(slope * 100 * 100) / 100;
  return { aliveCanvasesAtStart: pts[0][2], aliveCanvasesAtEnd: pts[n - 1][2], startMB: Math.round(pts[0][1] * 10) / 10, endMB: Math.round(pts[n - 1][1] * 10) / 10, slopeMBPer100Frames: per100, leak: per100 > 8, samples: n };
}
/**
 * Peak resident memory of a loop that draws, dithers, PNG-encodes and writes frames the way an engine worker does, in a fresh process.
 * `yieldEvery` 0 = never turn the event loop (what render.mjs --worker does today); 10 = turn it every 10 frames. Measured on hello_card: 225 frames
 * peak at 3.7 GB without yielding and 0.5 GB with it, because native canvas memory is freed only when the event loop turns.
 * @returns {Promise<{frames:number, yieldEvery:number, maxRSSMB:number}>}
 */
export function loopMemory(cardPath, { frames = 90, yieldEvery = 0, preview = false } = {}) {
  return new Promise((res, rej) => { const p = spawn(process.execPath, [fileURLToPath(new URL('./memproc.mjs', import.meta.url)), path.resolve(cardPath), String(frames), String(yieldEvery), preview ? '1' : '0'], { stdio: ['ignore', 'pipe', 'pipe'] }); let o = '', e = '';
    p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('exit', c => (c === 0 ? res(JSON.parse(o.trim().split('\n').pop())) : rej(new Error('memproc exited ' + c + ' ' + e.slice(-300))))); });
}

// ------------------------------------------------------------------ the whole profile
/**
 * Profile a card: stage times with the budget verdict, spike frames, operation counts, hot spots by ablation and a memory trend.
 * `every` samples every n-th frame (3 is a good default; 1 for the final check). Runs in this process: for an edited card, start a fresh process.
 * @param {string} cardPath @param {{every?:number, preview?:boolean, memory?:boolean, hot?:boolean}} [o]
 */
export async function profileCard(cardPath, { every = 3, preview = false, memory = true, hot = true } = {}) {
  const card = await loadCard(path.resolve(cardPath)); if (card.init) await card.init();
  const idx = pickFrames(card.META.frames, every), pt = phaseTimes(card, idx, { preview }), N = card.META.frames, fps = card.META.fps;
  const cardMs = pt.draw.map((d, j) => d + pt.raster[j]), total = cardMs.map((c, j) => c + pt.dither[j] + pt.scale[j] + pt.png[j]);
  const phases = { draw: stats(pt.draw), raster: stats(pt.raster), dither: stats(pt.dither), scale: stats(pt.scale), png: stats(pt.png) }, sum = Object.values(phases).reduce((s, p) => s + p.mean, 0) || 1;
  const share = Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, Math.round((v.mean / sum) * 100)]));
  const med = percentile(cardMs, 50), spikes = cardMs.map((ms, j) => ({ frame: pt.idx[j], t: Math.round((pt.idx[j] / fps) * 100) / 100, ms: Math.round(ms * 10) / 10 })).filter(s => s.ms > Math.max(2.5 * med, BUDGET.cardP95Ms * 0.6)).sort((a, b) => b.ms - a.ms).slice(0, 6);
  const c = stats(cardMs), t = stats(total), ops = countOps(card, idx.slice(0, 40));
  const P = { card: path.basename(cardPath), frames: N, sampled: idx.length, preview, phases, share, cardMs: c, totalMs: t, spikes, ops,
    budget: { cardMean: c.mean <= BUDGET.cardMeanMs, cardP95: c.p95 <= BUDGET.cardP95Ms, frame: !preview ? t.mean <= BUDGET.frameMs : null, limits: BUDGET } };
  if (hot) P.hotspots = hotspots(card, idx.slice(0, 24));
  if (memory) P.memory = await memoryTrend(card, { frames: 120, warm: 12 });
  P.advice = advise(P); return P;
}

/**
 * Plain-language advice from a profile. Each line says what is measured and what to do about it.
 * @param {object} P a profileCard result @returns {string[]}
 */
export function advise(P) {
  const a = [], pct = P.share, c = P.cardMs, o = P.ops;
  a.push(`Per frame the engine spends ${pct.png}% on the PNG encode, ${pct.dither}% on dither${P.preview ? `, ${pct.scale}% on scaling` : ''}; the card's own drawing is ${pct.draw + pct.raster}% (${c.mean} ms average, ${c.p95} ms at the 95th percentile). Only that last part is yours to change.`);
  if (!P.budget.cardMean || !P.budget.cardP95) a.push(`The card's own time is over budget (${c.mean} ms average, limit ${BUDGET.cardMeanMs}; ${c.p95} ms p95, limit ${BUDGET.cardP95Ms}): fix the hot spots below.`); else a.push(`The card's own time is inside the budget (${BUDGET.cardMeanMs} ms average, ${BUDGET.cardP95Ms} ms p95).`);
  const hs = P.hotspots && P.hotspots.rows.filter(r => r.pct >= 15 && r.savedMs >= 1.5);
  for (const r of hs || []) {
    const fix = { shadow: 'replace shadowBlur with a cached glow sprite (drawGlow) or draw the glow once into a cached layer', text: 'draw fewer, longer strings; never cache text layers (the checker would stop seeing the text)', images: 'check each drawImage: scale cached layers once, not every frame; avoid drawing a full-frame layer when a small one will do', gradients: 'create each gradient once (memo) and reuse it; use a cached layer for a static vignette', strokes: 'merge strokes into one path and one stroke() call; avoid wide dashed lines', shapes: 'merge shapes into one path; skip shapes that are fully covered or off screen' }[r.kind];
    a.push(`${r.what}: ${r.pct}% of the card's own time (${r.savedMs} ms a frame). ${fix}.`);
  }
  if (o.shadowCallsPerFrame > 20) a.push(`${o.shadowCallsPerFrame} drawing calls a frame use shadowBlur: blur is the most expensive thing a card can ask for. Use drawGlow().`);
  if (o.filterCallsPerFrame > 0) a.push(`${o.filterCallsPerFrame} calls a frame use ctx.filter: avoid it, pre-render the effect.`);
  if (o.canvasesPerFrame > 2) a.push(`${o.canvasesPerFrame} canvases are drawn on every frame (${o.canvasMBPerFrame} MB of pixels): create them once with layerCache() or reuse one with scratch().`);
  if (o.readsPixelsInFrame) a.push(`frame() reads pixels back with getImageData (${o.callsPerFrame.getImageData} a frame): this forces a raster in the middle of the frame. Avoid it.`);
  if ((o.callsPerFrame.createLinearGradient || 0) + (o.callsPerFrame.createRadialGradient || 0) > 30) a.push(`${(o.callsPerFrame.createLinearGradient || 0) + (o.callsPerFrame.createRadialGradient || 0)} gradients are created a frame: memo() them.`);
  if (P.spikes.length) a.push(`Slow frames: ${P.spikes.slice(0, 3).map(s => `t ${s.t} s (${s.ms} ms)`).join(', ')}. They are where the card does the most at once (scatter, closer, page change).`);
  if (P.memory) a.push(P.memory.leak ? `Canvases pile up: ${P.memory.slopeMBPer100Frames} MB of surviving canvases per 100 frames (${P.memory.aliveCanvasesAtEnd} alive): something is kept between frames (a growing array, a cache without a limit).` : `No canvas leak: ${P.memory.aliveCanvasesAtEnd} canvases alive at the end (${P.memory.endMB} MB), trend ${P.memory.slopeMBPer100Frames} MB per 100 frames.`);
  if (P.frames >= 100) a.push('Memory while rendering: an engine worker never turns the event loop, so native canvas memory is kept until it exits (about 8 MB a frame at full size; hello_card needs 3.7 GB for 225 frames). See t6_ENGINE_REQUESTS.md item 10 and loopMemory().');
  if (pct.png >= 55) a.push('The PNG encode is more than half of every frame and no card can change it. See t6_ENGINE_REQUESTS.md (E-1: raw frames to ffmpeg, measured 60 ms a frame saved).');
  return a;
}

/**
 * Predict the wall-clock seconds of a render from a profile: frames x (card + dither + scale + png) / workers, plus x264 time and about 1.2 s of start-up.
 * Calibrated on hello_card (17.4 s measured at full size, 8.9 s preview, 225 frames, 2 workers, shared iMac).
 */
export function renderCost(P, { frames = P.frames, workers = 2, preview = P.preview } = {}) {
  const perFrame = P.totalMs.mean, enc = preview ? BUDGET.encodeMsPreview : BUDGET.encodeMsFull;
  return Math.round(((frames * perFrame) / Math.min(2, workers) / 1000 + (frames * enc) / 1000 + BUDGET.startupSeconds) * 10) / 10;
}

// ------------------------------------------------------------------ the toolkit: canvas tricks for cards
const LAYERS = new Map(), MEMO = new Map(), SCRATCH = new Map(), GLOWS = new Map();
/**
 * A layer drawn once and reused: static grounds, vignettes, panels, sprites. `draw(ctx)` runs the first time only. Same key = same layer, so the key must name everything
 * the layer depends on. Never put text on a cached layer: the checker reads text when it is drawn, and a cached layer draws it once.
 * @param {string} key @param {number} w @param {number} h @param {(ctx:any)=>void} draw @returns {any} canvas, for drawImage
 */
export function layerCache(key, w, h, draw) { let c = LAYERS.get(key); if (!c) { c = createCanvas(w, h); draw(c.getContext('2d')); LAYERS.set(key, c); } return c; }
/** Compute a heavy constant once (a list of seeded cells, a gradient, a Path2D). The value must not depend on t. */
export function memo(key, fn) { if (!MEMO.has(key)) MEMO.set(key, fn()); return MEMO.get(key); }
/** One reusable canvas per key, cleared every time you ask: for effects that need a temporary surface. You must redraw all of it. */
export function scratch(key, w, h) { let c = SCRATCH.get(key); if (!c || c.width !== w || c.height !== h) { c = createCanvas(w, h); SCRATCH.set(key, c); } c.getContext('2d').clearRect(0, 0, w, h); return c; }
/** A soft round glow (radial gradient, colour at alpha, 0 at the edge) drawn once per colour and radius: the cheap replacement for shadowBlur. */
export function glowSprite(color, radius) { const k = `${color}|${radius}`; let c = GLOWS.get(k); if (!c) { c = createCanvas(radius * 2, radius * 2); const x = c.getContext('2d'), g = x.createRadialGradient(radius, radius, 0, radius, radius, radius); g.addColorStop(0, color); g.addColorStop(0.4, color.replace(/[\d.]+\)$/, m => String(parseFloat(m) * 0.45) + ')')); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(0, 0, radius * 2, radius * 2); GLOWS.set(k, c); } return c; }
/** Draw a glow centred on x, y. color must be 'rgba(r,g,b,a)'. */
export function drawGlow(ctx, x, y, color, radius, alpha = 1) { const s = glowSprite(color, radius); ctx.save(); ctx.globalAlpha *= alpha; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(s, x - radius, y - radius); ctx.restore(); }
/** What the caches hold. */
export function cacheStats() { let mb = 0; for (const c of [...LAYERS.values(), ...SCRATCH.values(), ...GLOWS.values()]) mb += (c.width * c.height * 4) / 1048576; return { layers: LAYERS.size, scratch: SCRATCH.size, glows: GLOWS.size, memo: MEMO.size, megabytes: Math.round(mb * 10) / 10 }; }
/** Empty all caches. */
export function clearCaches() { LAYERS.clear(); MEMO.clear(); SCRATCH.clear(); GLOWS.clear(); }

// ------------------------------------------------------------------ encode benchmark and a raw-pipe prototype (evidence for engine request E-1)
/**
 * Time the ways to get a finished frame out of the canvas: the PNG the renderer writes, the raw RGBA buffer, WebP. Averages over `n` frames.
 * @returns {{pngMs:number, rawMs:number, webpMs:number, pngKB:number, rawMB:number}}
 */
export function encodeBench(card, { n = 6 } = {}) {
  const idx = pickFrames(card.META.frames, Math.max(1, Math.floor(card.META.frames / n))).slice(0, n), t = { png: 0, raw: 0, webp: 0 }; let kb = 0, mb = 0;
  for (const i of idx) { const cv = renderFrame(card, i); let s = performance.now(); const p = cv.toBuffer('image/png'); t.png += performance.now() - s; kb += p.length / 1024; s = performance.now(); const r = cv.data(); t.raw += performance.now() - s; mb += r.length / 1048576; s = performance.now(); cv.toBuffer('image/webp', 100); t.webp += performance.now() - s; }
  const r = x => Math.round((x / idx.length) * 10) / 10; return { pngMs: r(t.png), rawMs: r(t.raw), webpMs: r(t.webp), pngKB: Math.round(kb / idx.length), rawMB: Math.round((mb / idx.length) * 10) / 10 };
}
const VF_YUV = 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+bitexact,format=yuv420p';
const X264 = 'ref=4:bframes=3:aq-mode=3:deblock=-1,-1:deadzone-inter=6:deadzone-intra=6:psy-rd=0.6,0';
/**
 * PROTOTYPE, not the engine: render a card by sending raw RGBA frames from worker processes straight into ffmpeg (no PNG files). Same filter and x264 settings as the engine.
 * Returns { mp4, seconds, frames, sha1 }. Used to prove that request E-1 gives the same video, faster.
 * @param {string} cardPath @param {{out:string, name?:string, preview?:boolean, workers?:number}} o
 */
export async function rawRender(cardPath, { out, name, preview = false, workers = 2 } = {}) {
  const t0 = Date.now(), abs = path.resolve(cardPath), card = await loadCard(abs), { META } = card, N = META.frames, W = Math.max(1, Math.min(2, workers)), w = preview ? 540 : 1080, h = preview ? 960 : 1920, size = w * h * 4;
  fs.mkdirSync(out, { recursive: true }); const mp4 = path.join(out, `${name || path.basename(abs, '.mjs')}_raw.mp4`);
  const ff = spawn(FFMPEG, ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-framerate', String(META.fps), '-i', '-', '-frames:v', String(N), '-vf', VF_YUV, '-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '20' : '16',
    '-profile:v', 'high', '-level:v', '4.1', '-x264-params', X264, '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-movflags', '+faststart', '-an', mp4], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = ''; ff.stderr.on('data', d => { err += d; }); const done = new Promise((res, rej) => { ff.on('exit', c => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c + ': ' + err.slice(-300)))));  ff.on('error', rej); }); ff.stdin.on('error', () => {});
  const ws = Array.from({ length: W }, (_, k) => { const p = spawn(process.execPath, [SELF, '--raw-worker', abs, String(k), String(W), String(N - 1), preview ? '1' : '0'], { stdio: ['ignore', 'pipe', 'inherit'] }); const s = { p, chunks: [], have: 0, waiter: null, ended: false };
    p.stdout.on('data', d => { s.chunks.push(d); s.have += d.length; if (s.have > size * 3) p.stdout.pause(); if (s.waiter) s.waiter(); }); p.stdout.on('end', () => { s.ended = true; if (s.waiter) s.waiter(); }); return s; });
  const take = async s => { while (s.have < size) { if (s.ended) throw new Error('a worker stopped early'); await new Promise(r => { s.waiter = r; }); s.waiter = null; } const buf = Buffer.concat(s.chunks); s.chunks = [buf.subarray(size)]; s.have = buf.length - size; if (s.have < size * 3) s.p.stdout.resume(); return buf.subarray(0, size); };
  const h1 = crypto.createHash('sha1');
  for (let i = 0; i < N; i++) { const f = await take(ws[i % W]); h1.update(f); if (!ff.stdin.write(f)) await new Promise(r => ff.stdin.once('drain', r)); }
  ff.stdin.end(); await done; const bytes = fs.readFileSync(mp4);
  return { mp4, seconds: Math.round((Date.now() - t0) / 100) / 10, frames: N, sha1: crypto.createHash('sha1').update(bytes).digest('hex'), rawHash: h1.digest('hex') };
}
// worker mode of the prototype: draw frames k, k+W, ... and write each as raw RGBA to stdout
if (process.argv[2] === '--raw-worker' && process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  const [, , , cardAbs, k, W, last, prev] = process.argv, card = await loadCard(cardAbs); if (card.init) await card.init();
  for (let f = +k; f <= +last; f += +W) { const b = renderFrame(card, f, { preview: prev === '1' }).data(); await new Promise((res, rej) => process.stdout.write(Buffer.from(b.buffer, b.byteOffset, b.byteLength), e => (e ? rej(e) : res()))); }
  process.exit(0);
}
