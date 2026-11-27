#!/usr/bin/env node
// Annie engine: card renderer. Library + CLI.
//   node engine/render.mjs <card.mjs> [--preview] [--out dir] [--workers N] [--still t] [--range a-b] [--name base] [--keep]
// A card exports META = { W:1080, H:1920, fps:30, frames:N, coverT?, dither?, holds?, brand?, qc? } and frame(t, i) -> canvas
// (and optionally async init()). Writes <out>/<name>.mp4 (silent, H.264, BT.709) and <out>/<name>_contact.png (12 frames),
// plus <out>/<name>_report.json. Frame PNGs go to a scratch folder under $TMPDIR and are removed afterwards.
// Same colour pipeline and x264 settings as the TikTok cards' render-card.mjs. Deterministic: same card, same frames.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, loadImage, ditherDark, setFont } from './canvas.mjs';
import { SAFE } from './brand.mjs';

/** ffmpeg binary. Override with ANNIE_FFMPEG. */
export const FFMPEG = process.env.ANNIE_FFMPEG || '/Users/cris/Desktop/AEON-wt-deps/node_modules/ffmpeg-static/ffmpeg';
const VF_YUV = 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+bitexact,format=yuv420p';
const X264 = 'ref=4:bframes=3:aq-mode=3:deblock=-1,-1:deadzone-inter=6:deadzone-intra=6:psy-rd=0.6,0';
const pad = i => String(i).padStart(4, '0');
const SELF = fileURLToPath(import.meta.url);

/** Run a command, resolve with stderr text, reject on non-zero exit. */
export function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], ...opts }); let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', rej);
    p.on('exit', code => (code === 0 ? res(err) : rej(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-800)}`))));
  });
}

/** Load a card module and check its META. @param {string} cardPath @returns {Promise<{META:object,frame:Function,init?:Function}>} */
export async function loadCard(cardPath) {
  const card = await import(pathToFileURL(path.resolve(cardPath)).href), { META, frame } = card;
  if (!META || META.W !== 1080 || META.H !== 1920 || !META.fps || !META.frames || typeof frame !== 'function')
    throw new Error(`${path.basename(cardPath)}: export META = {W:1080,H:1920,fps,frames} and frame(t, i)`);
  return card;
}

/** Render frame i of a card to its final canvas (dither applied, preview scaling applied). */
export function renderFrame(card, i, { preview = false } = {}) {
  const { META } = card;
  let cv = card.frame(i / META.fps, i);
  if (!cv || cv.width !== META.W || cv.height !== META.H) throw new Error(`frame ${i}: returned ${cv ? cv.width + 'x' + cv.height : 'nothing'}, expected ${META.W}x${META.H}`);
  if (META.dither !== false) ditherDark(cv);
  if (preview) { const s = createCanvas(540, 960), c = s.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, 540, 960); cv = s; }
  return cv;
}

function parseArgs(argv) {
  const a = { card: null, preview: process.env.ANNIE_PREVIEW === '1', out: null, workers: null, still: undefined, range: null, name: null, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--preview') a.preview = true; else if (v === '--keep') a.keep = true;
    else if (v === '--out') a.out = argv[++i]; else if (v === '--workers') a.workers = +argv[++i];
    else if (v === '--still') a.still = +argv[++i]; else if (v === '--name') a.name = argv[++i];
    else if (v === '--range') { const [x, y] = argv[++i].split('-').map(Number); a.range = [x, y]; }
    else if (!v.startsWith('--') && !a.card) a.card = v;
  }
  return a;
}

/** Contact sheet: n frames spread over the card (last one = final frame), labelled with time. Returns a canvas. */
export function contactSheet(imgs, labels, { cols = 6, cw = 180 } = {}) {
  const ch = Math.round((imgs[0].height * cw) / imgs[0].width), lh = 26, g = 10, rows = Math.ceil(imgs.length / cols);
  const cv = createCanvas(cols * cw + (cols + 1) * g, rows * (ch + lh + g) + g), c = cv.getContext('2d');
  c.fillStyle = '#1a1f29'; c.fillRect(0, 0, cv.width, cv.height); c.imageSmoothingQuality = 'high';
  imgs.forEach((im, i) => {
    const x = g + (i % cols) * (cw + g), y = g + Math.floor(i / cols) * (ch + lh + g);
    c.drawImage(im, x, y + lh, cw, ch); setFont(c, 'mono', 15, 500); c.fillStyle = '#9fb3c8'; c.fillText(labels[i], x, y + 18);
  });
  return cv;
}

/**
 * Render a card. Returns the report object (also written to <out>/<name>_report.json).
 * @param {string} cardPath @param {{preview?:boolean,out?:string,workers?:number,still?:number,range?:[number,number],name?:string,keep?:boolean}} [o]
 */
export async function renderCard(cardPath, o = {}) {
  const t0 = Date.now(), cardAbs = path.resolve(cardPath), card = await loadCard(cardAbs), { META } = card;
  const name = o.name || path.basename(cardAbs, '.mjs'), out = path.resolve(o.out || path.join(path.dirname(cardAbs), 'out'));
  fs.mkdirSync(out, { recursive: true });
  if (card.init) await card.init();
  if (o.still !== undefined) { // one frame, no encode
    const i = Math.min(META.frames - 1, Math.max(0, Math.round(o.still * META.fps))), file = path.join(out, `${name}_still.png`);
    fs.writeFileSync(file, renderFrame(card, i, o).toBuffer('image/png')); return { name, still: file, frame: i };
  }
  const [f0, f1] = o.range ? [Math.max(0, Math.round(o.range[0] * META.fps)), Math.min(META.frames - 1, Math.round(o.range[1] * META.fps))] : [0, META.frames - 1];
  const total = f1 - f0 + 1, scratch = fs.mkdtempSync(path.join(os.tmpdir(), `annie_${name}_`));
  try {
    const W = Math.max(1, Math.min(o.workers || +process.env.ANNIE_WORKERS || 2, total));
    await Promise.all(Array.from({ length: W }, (_, w) => run(process.execPath, [SELF, '--worker', cardAbs, scratch, String(f0 + w), String(W), String(f1), o.preview ? '1' : '0'])));
    const missing = []; for (let i = f0; i <= f1; i++) if (!fs.existsSync(path.join(scratch, `${pad(i)}.png`))) missing.push(i);
    if (missing.length) throw new Error(`${name}: ${missing.length} frames missing (first ${missing[0]})`);
    const h = crypto.createHash('sha1'); for (let i = f0; i <= f1; i++) h.update(crypto.createHash('sha1').update(fs.readFileSync(path.join(scratch, `${pad(i)}.png`))).digest());
    const mp4 = path.join(out, `${name}${o.range ? '_range' : ''}.mp4`);
    await run(FFMPEG, ['-y', '-framerate', String(META.fps), '-start_number', String(f0), '-i', path.join(scratch, '%04d.png'), '-frames:v', String(total), '-vf', VF_YUV,
      '-c:v', 'libx264', '-preset', o.preview ? 'veryfast' : 'slow', '-crf', o.preview ? '20' : '16', '-profile:v', 'high', '-level:v', '4.1', '-x264-params', X264,
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-movflags', '+faststart', '-an', mp4]);
    // contact sheet: 12 frames over the range
    const picks = Array.from({ length: Math.min(12, total) }, (_, i) => Math.round(f0 + (i * (total - 1)) / Math.max(1, Math.min(12, total) - 1)));
    const imgs = []; for (const f of picks) imgs.push(await loadImage(path.join(scratch, `${pad(f)}.png`)));
    const sheet = path.join(out, `${name}_contact.png`);
    fs.writeFileSync(sheet, contactSheet(imgs, picks.map(f => `t=${(f / META.fps).toFixed(2)}s`)).toBuffer('image/png'));
    const probe = await run(FFMPEG, ['-hide_banner', '-i', mp4, '-f', 'null', '-']).catch(e => e.message);
    const dur = (probe.match(/Duration: (\d+):(\d+):([\d.]+)/) || []).slice(1).map(Number), res = probe.match(/Video:.* (\d{3,4})x(\d{3,4})/);
    const report = {
      name, preview: !!o.preview, frames: total, fps: META.fps, width: res ? +res[1] : null, height: res ? +res[2] : null,
      seconds: dur.length ? dur[0] * 3600 + dur[1] * 60 + dur[2] : null, audioStream: /Stream #\d+:\d+.*Audio:/.test(probe), bytes: fs.statSync(mp4).size,
      framesHash: h.digest('hex'), workers: W, renderSeconds: Math.round((Date.now() - t0) / 100) / 10, mp4, contact: sheet,
    };
    fs.writeFileSync(path.join(out, `${name}_report.json`), JSON.stringify(report, null, 2));
    return report;
  } finally { if (!o.keep) fs.rmSync(scratch, { recursive: true, force: true }); else console.error('frames kept in', scratch); }
}

// ---------------------------------------------------------------- CLI and worker
// main() is not awaited at the top level on purpose: a card that imports this file (directly or through a skill module) must
// not deadlock with a worker that is importing that card.
async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--worker') { // --worker card scratch i0 step last preview
    const [, cardAbs, scratch, i0, step, last, prev] = argv, card = await loadCard(cardAbs);
    if (card.init) await card.init();
    for (let f = +i0; f <= +last; f += +step) fs.writeFileSync(path.join(scratch, `${pad(f)}.png`), renderFrame(card, f, { preview: prev === '1' }).toBuffer('image/png'));
    process.exit(0);
  }
  const a = parseArgs(argv);
  if (!a.card) { console.error('usage: node engine/render.mjs <card.mjs> [--preview] [--out dir] [--workers N] [--still t] [--range a-b] [--name base] [--keep]'); process.exit(2); }
  try { const r = await renderCard(a.card, a); console.log(JSON.stringify(r)); process.exit(r.audioStream || (r.width && r.width !== (a.preview ? 540 : 1080)) ? 1 : 0); }
  catch (e) { console.error(e.message); process.exit(1); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
