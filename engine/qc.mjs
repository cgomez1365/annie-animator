#!/usr/bin/env node
// Annie engine: quality checker. Library + CLI.
//   node engine/qc.mjs <card.mjs> [--out dir] [--step N] [--video file.mp4]
// Renders every frame in memory (no files) and checks: size/fps/duration; FROZEN FRAMES; text in the safe zones; text under
// 42 px held > 0.5 s; contrast of text against its background; banned claim words; and the closer (slogan pair with line 2
// green, Follow, footer; 18+ line for brand 'aeon'). Writes <out>/qc.json and <out>/qc_zones.png (12 frames with the zones
// drawn and the motion profile underneath). Exit 0 only if nothing hard failed.
// A card may declare, in META: holds: [[t0,t1],...] (seconds where stillness is allowed), brand: 'aeon',
// qc: { closer:false, motionThreshold, frozenSeconds, contrast }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from './canvas.mjs';
import { loadCard, contactSheet, FFMPEG, run } from './render.mjs';
import { SAFE, P, SLOGAN, EIGHTEEN, FOOTER, CTA, claimViolations } from './brand.mjs';
import { hex } from './ease.mjs';

const SELF = fileURLToPath(import.meta.url);
/** Default thresholds. Motion energy = sum of |luma change| over pixels that changed by >= 6 levels, per pixel, on a 1/4 size frame. */
export const QC_DEFAULTS = { motionThreshold: 0.004, changeLevels: 6, frozenSeconds: 0.5, transientSeconds: 0.5, contrastFail: 3.0, contrastWarn: 4.5, scale: 4 };

const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** WCAG contrast ratio between two relative luminances. */
export const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
function parseColor(s) {
  if (!s || s === 'gradient') return null;
  if (s[0] === '#') return hex(s);
  const m = s.match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0, 3).map(Number) : null;
}

/**
 * Run the checks on a card file. Returns the result object (the same that is written to qc.json): { pass, issues[], motion{}, ... }.
 * @param {string} cardPath @param {{out?:string,step?:number,video?:string,thresholds?:object,write?:boolean}} [o]
 */
export async function qcCard(cardPath, o = {}) {
  const cardAbs = path.resolve(cardPath), card = await loadCard(cardAbs), { META } = card, name = path.basename(cardAbs, '.mjs');
  if (card.init) await card.init();
  const th = { ...QC_DEFAULTS, ...(META.qc || {}), ...(o.thresholds || {}) }, step = Math.max(1, o.step || 1), fps = META.fps;
  const out = path.resolve(o.out || path.join(path.dirname(cardAbs), 'out')), issues = [];
  const add = (level, rule, detail, extra = {}) => issues.push({ level, rule, detail, ...extra });

  // --- 1. size / fps / duration (declared) and a real file when given
  if (META.W !== SAFE.W || META.H !== SAFE.H) add('fail', 'size', `META is ${META.W}x${META.H}, must be 1080x1920`);
  if (META.fps !== 30) add('fail', 'fps', `META.fps is ${META.fps}, must be 30`);
  const seconds = META.frames / fps;
  if (seconds < 1 || seconds > 90) add('fail', 'duration', `${seconds.toFixed(2)} s is outside 1-90 s`);
  if (o.video) {
    const probe = await run(FFMPEG, ['-hide_banner', '-i', o.video, '-f', 'null', '-']).catch(e => e.message);
    const res = probe.match(/Video:.* (\d{3,4})x(\d{3,4})/), fr = probe.match(/(\d+(\.\d+)?) fps/), d = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (!res || +res[1] !== 1080 || +res[2] !== 1920) add('fail', 'video size', `file is ${res ? res[1] + 'x' + res[2] : 'unreadable'}`);
    if (fr && Math.abs(+fr[1] - 30) > 0.01) add('fail', 'video fps', `file is ${fr[1]} fps`);
    if (d && Math.abs(+d[1] * 3600 + +d[2] * 60 + +d[3] - seconds) > 0.1) add('fail', 'video duration', `file lasts ${(+d[1] * 3600 + +d[2] * 60 + +d[3]).toFixed(2)} s, card ${seconds.toFixed(2)} s`);
    if (/Stream #\d+:\d+.*Audio:/.test(probe)) add('fail', 'audio', 'file has an audio stream: cards are silent');
  }

  // --- 2. render every (step-th) frame in memory
  const log = { W: META.W, H: META.H, entries: [] }; globalThis.__annieTextLog = log;
  const sw = Math.round(META.W / th.scale), sh = Math.round(META.H / th.scale), small = createCanvas(sw, sh), sc = small.getContext('2d');
  sc.imageSmoothingQuality = 'high';
  const profile = [], hits = new Map(), frameText = [], picks = [];
  let prev = null, last = null;
  const nPick = 12, pickAt = new Set(Array.from({ length: nPick }, (_, i) => Math.round((i * (META.frames - 1)) / (nPick - 1))));
  const pickCanvases = [];
  const note = (key, hard, rule, e, idx, extra = {}) => { const h = hits.get(key) || hits.set(key, { hard, rule, s: e.s, idx: [], minPx: Infinity, ...extra }).get(key); if (hard) h.hard = true; if (h.idx[h.idx.length - 1] !== idx) h.idx.push(idx); h.minPx = Math.min(h.minPx, e.px); return h; };

  let si = 0;
  for (let f = 0; f < META.frames; f += step, si++) {
    log.entries.length = 0;
    const cv = card.frame(f / fps, f);
    if (!cv || cv.width !== META.W || cv.height !== META.H) { add('fail', 'frame size', `frame ${f} is ${cv ? cv.width + 'x' + cv.height : 'missing'}`); break; }
    sc.clearRect(0, 0, sw, sh); sc.drawImage(cv, 0, 0, sw, sh);
    const px = sc.getImageData(0, 0, sw, sh).data, L = new Float32Array(sw * sh);
    for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    let energy = 0;
    if (prev) for (let j = 0; j < L.length; j++) { const d = Math.abs(L[j] - prev[j]); if (d >= th.changeLevels) energy += d; }
    profile.push(prev ? energy / L.length : null); prev = L;
    // text rules (zones, size, claims)
    const entries = log.entries.map(e => ({ ...e })); frameText.push(entries.map(e => ({ s: e.s, color: e.color, a: e.a })));
    for (const e of entries) {
      if (e.y0 < SAFE.top) note(`top|${e.s}`, true, 'text above y 250', e, si);
      if (e.y1 >= SAFE.bottom) note(`bot|${e.s}`, true, 'text below y 1580', e, si);
      if (e.x1 > SAFE.railX && e.y1 > SAFE.railY[0] && e.y0 < SAFE.railY[1]) note(`rail|${e.s}`, true, 'text in the action rail (x >= 940, y 800-1580)', e, si);
      if (!e.decor && e.px < SAFE.floor - 0.05) note(`px|${e.s}`, true, 'text under 42 px', e, si);
      if (!e.decor && e.y1 > SAFE.soft[0] && e.y0 < SAFE.soft[1]) note(`soft|${e.s}`, false, 'text in the Reels caption band (y 1250-1580)', e, si);
      for (const r of claimViolations(e.s)) note(`claim|${r}|${e.s}`, true, `banned claim: ${r}`, e, si, { always: true });
    }
    // contrast, every 3rd sample, only for solid-colour text that is (nearly) fully opaque
    if (si % 3 === 0 && entries.some(e => !e.decor && e.a >= 0.9 && parseColor(e.color))) {
      const ctx = cv.getContext('2d'), full = ctx.getImageData(0, 0, META.W, META.H).data;
      for (const e of entries) {
        const tc = parseColor(e.color); if (!tc || e.a < 0.9 || e.decor || e.px < 12) continue;
        const m = 8, x0 = Math.max(0, Math.floor(e.x0) - m), x1 = Math.min(META.W - 1, Math.ceil(e.x1) + m), y0 = Math.max(0, Math.floor(e.y0) - m), y1 = Math.min(META.H - 1, Math.ceil(e.y1) + m), ls = [];
        for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
          if (x >= e.x0 - 2 && x <= e.x1 + 2 && y >= e.y0 - 2 && y <= e.y1 + 2) continue; // ring only, outside the text box
          const i = (y * META.W + x) * 4; ls.push(lum(full[i], full[i + 1], full[i + 2]));
        }
        if (ls.length < 8) continue; ls.sort((a, b) => a - b);
        const bg = ls[ls.length >> 1], c = ratio(lum(...tc), bg);
        if (c < th.contrastWarn) note(`con|${e.s}`, c < th.contrastFail, `low contrast ${c.toFixed(2)}:1 (needs ${th.contrastFail}:1, ${th.contrastWarn}:1 is comfortable)`, e, si, { every: 3 });
      }
    }
    if (pickAt.has(f) || f + step >= META.frames) { if (pickCanvases.length < nPick + 1 && !pickCanvases.find(p => p.f === f)) { const c2 = createCanvas(META.W, META.H); c2.getContext('2d').drawImage(cv, 0, 0); pickCanvases.push({ f, cv: c2 }); } }
    last = f;
  }
  globalThis.__annieTextLog = null;

  // --- 3. aggregate text hits into issues (a break shorter than 0.5 s in motion is a warning, banned words never are)
  const sec = i => ((i * step) / fps).toFixed(2);
  for (const h of hits.values()) {
    let rs = 0, longest = 1; const ev = h.every || 1; // contrast is sampled every 3rd frame: samples 3 apart still count as one stretch
    for (let j = 1; j < h.idx.length; j++) { if (h.idx[j] - h.idx[j - 1] > ev) rs = j; longest = Math.max(longest, h.idx[j] - h.idx[rs] + 1); }
    const longestS = (longest * step) / fps, hard = h.hard && (h.always || longestS > th.transientSeconds);
    const detail = `"${h.s}" t ${sec(h.idx[0])}-${sec(h.idx[h.idx.length - 1])} s, longest stretch ${longestS.toFixed(2)} s${h.rule === 'text under 42 px' ? `, smallest ${h.minPx.toFixed(1)} px` : ''}`;
    add(hard ? 'fail' : 'warn', h.rule, detail + (h.hard && !hard ? ' (in motion, under 0.5 s)' : ''), { text: h.s, t0: +sec(h.idx[0]), t1: +sec(h.idx[h.idx.length - 1]) });
  }

  // --- 4. frozen frames: runs of low motion longer than frozenSeconds outside declared holds
  const holds = META.holds || [], inHold = t => holds.some(([a, b]) => t >= a && t <= b);
  const frozenRuns = []; let start = null;
  const closeRun = i1 => { if (start === null) return; const n = i1 - start, dur = (n * step) / fps; if (dur > th.frozenSeconds) frozenRuns.push({ t0: +((start * step) / fps).toFixed(2), t1: +((i1 * step) / fps).toFixed(2), seconds: +dur.toFixed(2) }); start = null; };
  profile.forEach((e, i) => { const t = (i * step) / fps, still = e !== null && e < th.motionThreshold && !inHold(t); if (still) { if (start === null) start = i; } else closeRun(i); });
  closeRun(profile.length);
  for (const r of frozenRuns) add('fail', 'frozen frames', `nothing moves from ${r.t0} s to ${r.t1} s (${r.seconds} s). Add motion (a marker, a pulse, a drift) or declare META.holds`, r);

  // --- 5. closer: slogan pair, Follow, footer, 18+
  if (META.qc?.closer !== false) {
    const from = Math.floor(frameText.length * 0.5), tail = frameText.slice(from), flat = tail.flat();
    const hasPair = tail.some(fr => fr.some(x => x.s === SLOGAN[0]) && fr.some(x => x.s === SLOGAN[1]));
    if (!hasPair) add('fail', 'closer: slogan', `"${SLOGAN[0]}" and "${SLOGAN[1]}" never appear together in the second half`);
    else {
      const l2 = flat.find(x => x.s === SLOGAN[1]);
      if (l2 && !(l2.color || '').toLowerCase().startsWith('#19e08f') && parseColor(l2.color)?.join() !== hex(P.green).join()) add('fail', 'closer: slogan colour', `line 2 is ${l2.color}, must be ${P.green}`);
    }
    if (!flat.some(x => /follow/i.test(x.s))) add('fail', 'closer: follow', 'no Follow button text in the second half');
    if (!flat.some(x => x.s === FOOTER.bgi || x.s === FOOTER.aeon || /brokengearindustries\.com/.test(x.s))) add('fail', 'closer: footer', 'no brokengearindustries.com footer in the second half');
    if (META.brand === 'aeon' && !flat.some(x => /18\+/.test(x.s))) add('fail', 'closer: 18+', `AEON cards need the line: ${EIGHTEEN}`);
  }

  // --- result
  const fails = issues.filter(i => i.level === 'fail').length, valid = profile.filter(v => v !== null);
  const result = {
    name, pass: fails === 0, fails, warns: issues.length - fails, size: [META.W, META.H], fps, frames: META.frames, seconds: +seconds.toFixed(2), step, thresholds: th, issues,
    motion: { frozenRuns, min: Math.min(...valid), mean: +(valid.reduce((a, b) => a + b, 0) / Math.max(1, valid.length)).toFixed(4), profile: profile.map(v => (v === null ? null : +v.toFixed(4))) },
  };
  if (o.write !== false) {
    fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'qc.json'), JSON.stringify(result, null, 1));
    fs.writeFileSync(path.join(out, 'qc_zones.png'), zonesSheet(pickCanvases, profile, th, step, fps, holds, frozenRuns).toBuffer('image/png'));
  }
  return result;
}

/** The QC contact sheet: 12 frames with the zones drawn (red = no text, amber = action rail, blue = soft caption band) + motion profile. */
function zonesSheet(picks, profile, th, step, fps, holds, frozenRuns) {
  picks.sort((a, b) => a.f - b.f);
  const imgs = picks.map(p => { const c = createCanvas(1080, 1920), x = c.getContext('2d'); x.drawImage(p.cv, 0, 0);
    x.fillStyle = 'rgba(255,0,0,0.35)'; x.fillRect(0, 0, 1080, 250); x.fillRect(0, 1580, 1080, 340);
    x.fillStyle = 'rgba(255,160,0,0.25)'; x.fillRect(940, 800, 140, 780); x.fillStyle = 'rgba(80,120,255,0.16)'; x.fillRect(0, 1250, 940, 330); return c; });
  const sheet = contactSheet(imgs, picks.map(p => `t=${(p.f / fps).toFixed(2)}s`)), ph = 110, cv = createCanvas(sheet.width, sheet.height + ph + 20), c = cv.getContext('2d');
  c.drawImage(sheet, 0, 0); c.fillStyle = '#10141b'; c.fillRect(0, sheet.height, cv.width, ph + 20);
  const x0 = 10, w = cv.width - 20, n = profile.length, y0 = sheet.height + 10, mx = Math.max(th.motionThreshold * 8, ...profile.filter(v => v !== null));
  const T = i => (i * step) / fps;
  holds.forEach(([a, b]) => { c.fillStyle = 'rgba(80,120,255,0.25)'; c.fillRect(x0 + (a * fps / step / n) * w, y0, ((b - a) * fps / step / n) * w, ph); });
  frozenRuns.forEach(r => { c.fillStyle = 'rgba(239,68,68,0.35)'; c.fillRect(x0 + (r.t0 * fps / step / n) * w, y0, ((r.t1 - r.t0) * fps / step / n) * w, ph); });
  profile.forEach((v, i) => { if (v === null) return; const hgt = Math.min(ph, (Math.sqrt(v / mx)) * ph); c.fillStyle = v < th.motionThreshold ? '#ef4444' : '#19e08f'; c.fillRect(x0 + (i / n) * w, y0 + ph - hgt, Math.max(1, w / n), hgt); });
  c.strokeStyle = '#f59e0b'; const ty = y0 + ph - Math.sqrt(th.motionThreshold / mx) * ph; c.beginPath(); c.moveTo(x0, ty); c.lineTo(x0 + w, ty); c.stroke();
  c.fillStyle = '#9fb3c8'; c.font = '13px Menlo'; c.fillText('motion energy per frame (sqrt scale). green = moving, red = below threshold, amber line = threshold, blue = declared hold', x0, y0 + ph + 14);
  return cv;
}

// ---------------------------------------------------------------- CLI (not awaited at the top level: see render.mjs)
async function main() {
  const argv = process.argv.slice(2), o = { card: null };
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--out') o.out = argv[++i]; else if (argv[i] === '--step') o.step = +argv[++i]; else if (argv[i] === '--video') o.video = argv[++i]; else if (!o.card) o.card = argv[i]; }
  if (!o.card) { console.error('usage: node engine/qc.mjs <card.mjs> [--out dir] [--step N] [--video file.mp4]'); process.exit(2); }
  try {
    const r = await qcCard(o.card, o);
    for (const i of r.issues) console.log(`${r.name}: ${i.level.toUpperCase()} ${i.rule}: ${i.detail}`);
    console.log(`${r.name}: ${r.pass ? 'PASS' : `FAIL (${r.fails} hard)`}, ${r.warns} warning(s), ${r.frames} frames, ${r.seconds} s, motion min ${r.motion.min.toFixed(3)} mean ${r.motion.mean}`);
    process.exit(r.pass ? 0 : 1);
  } catch (e) { console.error(e.stack || e.message); process.exit(2); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main();
