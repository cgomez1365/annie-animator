// t6.2 batch-render-and-cache: render many cards with parallel workers, a content-hashed frame cache, incremental re-render,
// resumable runs and a determinism hash report. It reuses the engine's own frame workers (render.mjs --worker), so every frame is
// drawn, dithered and scaled exactly as the engine does it; the engine itself is not changed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FFMPEG, run, contactSheet } from '../../engine/render.mjs';
import { loadImage } from '../../engine/index.mjs';

const ENGINE = fileURLToPath(new URL('../../engine/', import.meta.url));
const RENDER = path.join(ENGINE, 'render.mjs'), DETPROC = fileURLToPath(new URL('./detproc.mjs', import.meta.url));
const pad = i => String(i).padStart(4, '0');
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
/** Per-frame cost on the shared iMac, 2 workers (measured in t0.3 on hello_card, 225 frames). */
export const SEC_PER_FRAME = { full: 0.077, preview: 0.040 };
// Copied from engine/render.mjs (they are not exported there): the colour pipeline and x264 settings.
const VF_YUV = 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+bitexact,format=yuv420p';
const X264 = 'ref=4:bframes=3:aq-mode=3:deblock=-1,-1:deadzone-inter=6:deadzone-intra=6:psy-rd=0.6,0';
const IEND = '0000000049454e44ae426082';

// ------------------------------------------------------------------ fingerprint: what a card's pixels depend on
/**
 * Hash everything a card's frames depend on: the card file, every file it imports (relative imports, followed transitively),
 * every file it reads with `new URL('./x', import.meta.url)`, extra files you name, all engine/*.mjs files, and the Node version.
 * A change in any of them gives a new hash, so the cache never serves frames from the wrong code.
 * @param {string} cardPath @param {{extra?:string[]}} [o] @returns {{hash:string, files:string[]}}
 */
export function cardFingerprint(cardPath, { extra = [] } = {}) {
  const seen = new Set(), files = [], h = crypto.createHash('sha1');
  const visit = f => {
    f = path.resolve(f); if (seen.has(f) || !fs.existsSync(f)) return; seen.add(f); files.push(f);
    const src = fs.readFileSync(f); h.update(path.basename(f)).update(src);
    if (!/\.(mjs|js|cjs)$/.test(f)) return; const s = src.toString('utf8'), dir = path.dirname(f);
    for (const m of s.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) visit(path.resolve(dir, m[1]));
    for (const m of s.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g)) visit(path.resolve(dir, m[1]));
  };
  visit(cardPath); extra.forEach(visit);
  for (const f of fs.readdirSync(ENGINE).filter(n => n.endsWith('.mjs')).sort()) { h.update(f).update(fs.readFileSync(path.join(ENGINE, f))); }
  h.update(process.version);
  return { hash: h.digest('hex'), files: files.filter(f => !f.startsWith(ENGINE)) };
}

// ------------------------------------------------------------------ cache layout
// <cache>/<name>/<mode>/manifest.json            the latest finished render: cardHash, per-frame pixel hashes, framesHash
// <cache>/<name>/<mode>/<cardHash12>/NNNN.png    the frames of one card version (mode = full | preview)
const modeOf = preview => (preview ? 'preview' : 'full');
const jobDir = (cache, name, preview) => path.join(cache, name, modeOf(preview));
/** True when the PNG file exists and ends with the PNG end marker (a worker killed mid-write leaves a short file). */
export function pngComplete(file) {
  try { const fd = fs.openSync(file, 'r'), st = fs.fstatSync(fd); if (st.size < 100) { fs.closeSync(fd); return false; }
    const b = Buffer.alloc(12); fs.readSync(fd, b, 0, 12, st.size - 12); fs.closeSync(fd); return b.toString('hex') === IEND; } catch { return false; }
}
/** Read the latest manifest of a card in a cache, or null. @returns {{cardHash:string,frames:number,hashes:string[],framesHash:string,fps:number}|null} */
export function readManifest(cache, name, preview = false) { try { return JSON.parse(fs.readFileSync(path.join(jobDir(cache, name, preview), 'manifest.json'), 'utf8')); } catch { return null; } }

/** Seconds a batch should take: frames x per-frame cost (2 workers), plus about 2 s of encode per card. Cached frames cost nothing. @param {{frames:number,preview?:boolean,cached?:number}[]} jobs */
export function estimateBatch(jobs, { workers = 2 } = {}) { return Math.round(jobs.reduce((s, j) => s + (j.frames - (j.cached || 0)) * SEC_PER_FRAME[j.preview ? 'preview' : 'full'] * (2 / Math.min(2, workers)) + 2, 0) * 10) / 10; }

// Cards are read in a fresh process each time: Node caches imported modules for the life of a process, so loading an edited card in
// this process would return the old version.
function nodeJson(args) {
  return new Promise((res, rej) => { const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; }); p.on('error', rej);
    p.on('exit', c => { if (c !== 0) return rej(new Error(`${path.basename(args[0])} exited ${c}: ${err.slice(-500)}`)); try { res(JSON.parse(out.trim().split('\n').pop())); } catch (e) { rej(new Error('unreadable output: ' + out.slice(-200))); } }); });
}
/** META of a card file, read in a fresh process (never stale). @param {string} cardPath */
export const readMeta = cardPath => nodeJson([DETPROC, path.resolve(cardPath), 'meta']);

// ------------------------------------------------------------------ the worker pool
function spawnTask(cardAbs, dir, i0, last, preview) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [RENDER, '--worker', cardAbs, dir, String(i0), '1', String(last), preview ? '1' : '0'], { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
    p.stderr.on('data', d => { err += d; }); p.on('error', rej);
    p.on('exit', c => (c === 0 ? res() : rej(new Error(`frames ${i0}-${last}: worker exited ${c}: ${err.slice(-400)}`))));
  });
}
/** Split missing frame numbers into tasks of contiguous runs, at most `chunk` frames each. @param {number[]} missing @param {number} chunk @returns {[number,number][]} */
export function planTasks(missing, chunk = 60) {
  const tasks = []; let i = 0;
  while (i < missing.length) { let j = i; while (j + 1 < missing.length && missing[j + 1] === missing[j] + 1 && j + 1 - i < chunk) j++; tasks.push([missing[i], missing[j]]); i = j + 1; }
  return tasks;
}
async function pool(tasks, n, fn, { abortAfter = Infinity } = {}) {
  let next = 0, done = 0, failed = null;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (!failed && next < tasks.length) {
      if (done >= abortAfter) { failed = new Error('aborted (test hook abortAfterTasks)'); break; }
      const t = tasks[next++]; try { await fn(t); done++; } catch (e) { failed = e; }
    }
  }));
  if (failed) throw failed;
}

// ------------------------------------------------------------------ one job
/**
 * Render frames into the cache folder of this card version, reusing every complete frame already there (resume), seeding from the
 * previous version when a `changed` hint is given, then encode. Returns the job report.
 * @param {{card:string, name?:string, preview?:boolean, changed?:[number,number]}} job
 * @param {{cache:string,out:string,workers:number,chunk:number,verify:number,force:boolean,contact:boolean,abortAfterTasks?:number}} o
 */
async function runJob(job, o) {
  const t0 = Date.now(), cardAbs = path.resolve(job.card), name = job.name || path.basename(cardAbs, '.mjs'), preview = !!job.preview;
  const META = await readMeta(cardAbs), N = META.frames, fp = cardFingerprint(cardAbs, { extra: job.deps || [] }), h12 = fp.hash.slice(0, 12);
  const base = jobDir(o.cache, name, preview), dir = path.join(base, h12), prev = readManifest(o.cache, name, preview), mp4 = path.join(o.out, `${name}${preview ? '_preview' : ''}.mp4`);
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(o.out, { recursive: true });
  const rep = { name, preview, cardHash: fp.hash, frames: N, status: '', framesRendered: 0, framesReused: 0, framesRepaired: 0, hint: null, mp4 };

  // 1. identical card as the last finished render and the mp4 is there: nothing to do
  if (!o.force && prev && prev.cardHash === fp.hash && fs.existsSync(mp4) && prev.mp4Hash && sha1(fs.readFileSync(mp4)) === prev.mp4Hash) {
    return { ...rep, status: 'unchanged', framesReused: N, framesHash: prev.framesHash, seconds: (Date.now() - t0) / 1000, changedFrames: [] };
  }
  // 2. seed from the previous version when the caller says which seconds changed; verify a sample of the reused frames first
  if (job.changed && prev && prev.cardHash !== fp.hash && prev.frames === N && !o.force) {
    const pdir = path.join(base, prev.cardHash.slice(0, 12)), a = Math.max(0, Math.floor(job.changed[0] * META.fps)), b = Math.min(N - 1, Math.ceil(job.changed[1] * META.fps));
    const clean = []; for (let i = 0; i < N; i++) if ((i < a || i > b) && pngComplete(path.join(pdir, `${pad(i)}.png`)) && sha1(fs.readFileSync(path.join(pdir, `${pad(i)}.png`))) === prev.hashes[i]) clean.push(i);
    const picks = new Set(); if (clean.length) { for (let k = 0; k < o.verify; k++) picks.add(clean[Math.floor((k * (clean.length - 1)) / Math.max(1, o.verify - 1))]); [a - 1, b + 1].forEach(i => { if (clean.includes(i)) picks.add(i); }); }
    const vdir = path.join(base, `verify_${h12}`); fs.mkdirSync(vdir, { recursive: true }); let bad = 0;
    await pool([...picks].sort((x, y) => x - y).map(i => [i, i]), o.workers, ([i0, i1]) => spawnTask(cardAbs, vdir, i0, i1, preview));
    for (const i of picks) if (sha1(fs.readFileSync(path.join(vdir, `${pad(i)}.png`))) !== prev.hashes[i]) bad++;
    fs.rmSync(vdir, { recursive: true, force: true });
    if (bad) rep.hint = { accepted: false, checked: picks.size, mismatches: bad, note: 'a frame outside the hinted seconds changed: rendering everything' };
    else { rep.hint = { accepted: true, checked: picks.size, seeded: clean.length };
      for (const i of clean) { const f = path.join(dir, `${pad(i)}.png`); if (!pngComplete(f)) fs.copyFileSync(path.join(pdir, `${pad(i)}.png`), f); } }
  }
  // 3. render what is missing or damaged (resume)
  const missing = [];
  for (let i = 0; i < N; i++) { const f = path.join(dir, `${pad(i)}.png`); if (fs.existsSync(f) && !pngComplete(f)) { fs.rmSync(f); rep.framesRepaired++; } if (!fs.existsSync(f)) missing.push(i); }
  rep.framesReused = N - missing.length; rep.framesRendered = missing.length;
  await pool(planTasks(missing, o.chunk), o.workers, ([i0, i1]) => spawnTask(cardAbs, dir, i0, i1, preview), { abortAfter: o.abortAfterTasks ?? Infinity });
  // 4. manifest: pixel hash of every frame, and the same framesHash the engine reports
  const hashes = [], hh = crypto.createHash('sha1');
  for (let i = 0; i < N; i++) { const b = fs.readFileSync(path.join(dir, `${pad(i)}.png`)); hashes.push(sha1(b)); hh.update(crypto.createHash('sha1').update(b).digest()); }
  rep.framesHash = hh.digest('hex');
  rep.changedFrames = prev && prev.frames === N ? hashes.map((x, i) => (x !== prev.hashes[i] ? i : -1)).filter(i => i >= 0) : null;
  // 5. encode (same filter and x264 settings as the engine; 2 threads so the shared iMac stays usable)
  await run(FFMPEG, ['-y', '-framerate', String(META.fps), '-start_number', '0', '-i', path.join(dir, '%04d.png'), '-frames:v', String(N), '-threads', '2', '-vf', VF_YUV,
    '-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '20' : '16', '-profile:v', 'high', '-level:v', '4.1', '-x264-params', X264,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-movflags', '+faststart', '-an', mp4]);
  if (o.contact) { const picks = Array.from({ length: 12 }, (_, i) => Math.round((i * (N - 1)) / 11)), imgs = []; for (const f of picks) imgs.push(await loadImage(path.join(dir, `${pad(f)}.png`)));
    fs.writeFileSync(path.join(o.out, `${name}${preview ? '_preview' : ''}_contact.png`), contactSheet(imgs, picks.map(f => `t=${(f / META.fps).toFixed(2)}s`)).toBuffer('image/png')); }
  const mp4Hash = sha1(fs.readFileSync(mp4));
  fs.writeFileSync(path.join(base, 'manifest.json'), JSON.stringify({ name, preview, cardHash: fp.hash, files: fp.files, frames: N, fps: META.fps, hashes, framesHash: rep.framesHash, mp4Hash }));
  return { ...rep, status: rep.framesRendered === N ? 'rendered' : rep.framesRendered === 0 ? 'cached-encode' : 'resumed', seconds: Math.round((Date.now() - t0) / 100) / 10 };
}

// ------------------------------------------------------------------ the batch
/**
 * Render a list of cards. Jobs run one after another; each job's frames are drawn by up to `workers` (default 2, never more) engine
 * worker processes in chunks of `chunk` frames. Every finished frame stays in the cache, so a repeat run, an interrupted run or a run
 * after a small edit redraws only what is missing or changed.
 * Job: { card, name?, preview?, changed?:[t0,t1] (seconds the edit touched; trusted only after a 8-frame check), deps?:[files] }.
 * Status per job: unchanged (nothing done) | cached-encode | resumed | rendered. Writes <out>/batch_report.json.
 * @param {object[]} jobs @param {{cache:string,out:string,workers?:number,chunk?:number,verify?:number,force?:boolean,contact?:boolean,abortAfterTasks?:number,log?:Function}} o
 */
export async function renderBatch(jobs, o) {
  const opt = { workers: Math.max(1, Math.min(2, o.workers || +process.env.ANNIE_WORKERS || 2)), chunk: 60, verify: 8, force: false, contact: true, ...o };
  const t0 = Date.now(), results = [];
  for (const j of jobs) { const r = await runJob(j, opt); results.push(r); if (o.log) o.log(`${r.name}: ${r.status} (${r.framesRendered} drawn, ${r.framesReused} reused, ${r.seconds} s)`); }
  const report = { workers: opt.workers, seconds: Math.round((Date.now() - t0) / 100) / 10, jobs: results,
    totals: { cards: results.length, framesRendered: results.reduce((s, r) => s + r.framesRendered, 0), framesReused: results.reduce((s, r) => s + r.framesReused, 0) } };
  fs.mkdirSync(opt.out, { recursive: true }); fs.writeFileSync(path.join(opt.out, 'batch_report.json'), JSON.stringify(report, null, 1));
  return report;
}

// ------------------------------------------------------------------ determinism report
/**
 * Prove a card is deterministic: draw `sample` frames (spread over the card, always the first and last) and compare the pixel
 * hashes: forward and then in reverse order in one fresh process, and each frame alone in its own worker process. Returns { deterministic, checked, mismatches[] }.
 * Slow for heavy cards: 12 frames about 3 s.
 * @param {string} cardPath @param {{sample?:number,preview?:boolean,scratch:string}} o
 */
export async function determinismReport(cardPath, { sample = 12, preview = true, scratch } = {}) {
  const cardAbs = path.resolve(cardPath), N = (await readMeta(cardAbs)).frames;
  const idx = [...new Set(Array.from({ length: sample }, (_, i) => Math.round((i * (N - 1)) / Math.max(1, sample - 1))))];
  const { a, b } = await nodeJson([DETPROC, cardAbs, preview ? '1' : '0', idx.join(',')]);
  const dir = fs.mkdtempSync(path.join(scratch, 'det_')); await Promise.all(idx.map(i => spawnTask(cardAbs, dir, i, i, preview)));
  const mism = []; for (const i of idx) { const c = sha1(fs.readFileSync(path.join(dir, `${pad(i)}.png`))); if (a[i] !== b[i]) mism.push({ frame: i, why: 'differs when drawn again in the same process (reverse order)' }); if (a[i] !== c) mism.push({ frame: i, why: 'differs in a separate worker process' }); }
  fs.rmSync(dir, { recursive: true, force: true });
  return { card: path.basename(cardAbs), deterministic: mism.length === 0, checked: idx.length, frames: idx, mismatches: mism, hashes: a };
}

/**
 * Compare two manifests (readManifest results): which frames changed, as frame numbers and as second ranges. Equal framesHash = identical video frames.
 * @returns {{identical:boolean, sameLength:boolean, changed:number[], ranges:[number,number][]}}
 */
export function diffManifests(a, b) {
  if (!a || !b) return { identical: false, sameLength: false, changed: [], ranges: [] };
  const n = Math.min(a.frames, b.frames), changed = []; for (let i = 0; i < n; i++) if (a.hashes[i] !== b.hashes[i]) changed.push(i);
  const ranges = []; for (const i of changed) { const r = ranges[ranges.length - 1]; if (r && i === r[1] + 1) r[1] = i; else ranges.push([i, i]); }
  return { identical: a.framesHash === b.framesHash, sameLength: a.frames === b.frames, changed, ranges: ranges.map(([x, y]) => [x / a.fps, (y + 1) / a.fps]) };
}

/** Delete old frame folders in a cache, keeping the folder of each card's latest manifest. Only touches folders this module made. @returns {{removed:number, bytes:number}} */
export function gc(cache, { dryRun = false } = {}) {
  let removed = 0, bytes = 0;
  for (const name of fs.existsSync(cache) ? fs.readdirSync(cache) : []) for (const mode of ['full', 'preview']) {
    const base = path.join(cache, name, mode); if (!fs.existsSync(base)) continue; let keep = null; try { keep = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8')).cardHash.slice(0, 12); } catch {}
    for (const d of fs.readdirSync(base)) { const p = path.join(base, d); if (!fs.statSync(p).isDirectory() || d === keep) continue; for (const f of fs.readdirSync(p)) bytes += fs.statSync(path.join(p, f)).size; removed++; if (!dryRun) fs.rmSync(p, { recursive: true, force: true }); }
  }
  return { removed, bytes };
}
/** Size of a cache in bytes and number of card versions. */
export function cacheStats(cache) { let bytes = 0, folders = 0; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { walk(p); if (/^[0-9a-f]{12}$/.test(e.name)) folders++; } else bytes += fs.statSync(p).size; } }; if (fs.existsSync(cache)) walk(cache); return { bytes, folders }; }
