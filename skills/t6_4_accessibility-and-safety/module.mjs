// t6.4 accessibility-and-safety: score a card for people who are sensitive to light, motion or low contrast, and check caption files.
// The score is a heuristic built on WCAG 2.x ideas (contrast 4.5:1 and 3:1, general flash and red flash thresholds, reading time); it is
// a tripwire for the common mistakes, not a medical or legal clearance. The engine checker (t0.4) still runs separately.
import fs from 'node:fs';
import path from 'node:path';
import { loadCard } from '../../engine/render.mjs';
import { createCanvas, P, SAFE } from '../../engine/index.mjs';
import { hex } from '../../engine/ease.mjs';

// ------------------------------------------------------------------ constants
/** Thresholds, all in one place. */
export const LIMITS = {
  flashChange: 0.1,        // WCAG general flash: a change of 0.1 of the maximum relative luminance (1.0 for sRGB white)
  flashDarkLimit: 0.8,     // ... where the darker image is below 0.8
  flashesPerSecond: 3,     // more than 3 flashes (pairs of opposing changes) in any 1 s fails
  redChange: 0.25,         // red flash: 25% of a region newly saturated red (r/(r+g+b) >= 0.8)
  regionArea: 1 / 9,       // flashes only count when they cover about 1/9 of the frame (a 360x640 block)
  contrastNormal: 4.5, contrastLarge: 3.0, largePx: 56, contrastCvd: 3.0,
  wordsPerSecond: 3.0, minReadSeconds: 1.0, minTokenChars: 5,
  movedFraction: 0.35, movedFractionStrong: 0.6, movedSustainedSeconds: 0.6, shakeSwingPx: 8, shakeReversalsPerSecond: 4,
  captions: { cpsTarget: 17, cpsMax: 20, minSeconds: 0.8, maxSeconds: 7, lineChars: 42, maxLines: 2, minGapSeconds: 0.05 },
  pass: 80,
};
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const LIN = new Float32Array(256).map((_, i) => lin(i));
/** Relative luminance (0-1) of an [r,g,b] 0-255 colour. */
export const relLum = ([r, g, b]) => 0.2126 * LIN[Math.round(r)] + 0.7152 * LIN[Math.round(g)] + 0.0722 * LIN[Math.round(b)];
/** WCAG contrast ratio of two [r,g,b] colours. */
export const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Colour-blind simulation matrices on linear RGB (Machado et al. 2009, severity 1). */
export const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const toSrgb = v => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
/** How an [r,g,b] colour looks to someone with protan / deutan / tritan colour vision. @returns {number[]} */
export function simulate(rgb, kind) { const l = rgb.map(lin), m = CVD[kind]; return m.map(row => toSrgb(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])); }
/** Lowest contrast of a text colour on a background over normal vision and the three colour-blind types. */
export function contrastAll(fg, bg) { const out = { normal: contrast(fg, bg) }; for (const k of Object.keys(CVD)) out[k] = contrast(simulate(fg, k), simulate(bg, k)); out.min = Math.min(...Object.values(out)); return out; }
/** Contrast of every BGI text colour on the three grounds, so a palette choice can be judged before drawing. */
export function paletteContrast() {
  const grounds = { bg: P.bg, panel: P.panel, panel2: P.panel2 }, text = ['white', 'text', 'muted', 'faint', 'dim', 'green', 'accent', 'cyan', 'red', 'orange'], rows = {};
  for (const t of text) { rows[t] = {}; for (const [g, c] of Object.entries(grounds)) rows[t][g] = Math.round(contrast(hex(P[t]), hex(c)) * 100) / 100; rows[t].usable = Math.min(...Object.values(rows[t])) >= LIMITS.contrastNormal ? 'body' : Math.min(...Object.values(rows[t])) >= LIMITS.contrastLarge ? 'large only' : 'never for words'; }
  return rows;
}
const parseColor = s => { if (!s || s === 'gradient') return null; if (s[0] === '#') return hex(s); const m = s.match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0, 3).map(Number) : null; };

// ------------------------------------------------------------------ motion kit (for authors: build the reduced-motion version into the card)
/**
 * Motion options for card authors. mode 'full' = as designed, 'reduced' = about 40% distances, no overshoot beyond 1.2, no shake, no spin;
 * 'none' = nothing travels or scales: only fades and colour. Use amp() for every distance, shake() for jitter, overshoot() for outBack/elastic strength.
 * @param {'full'|'reduced'|'none'} [mode]
 */
export function motionKit(mode = (process.env.ANNIE_MOTION || 'full')) {
  const A = { full: 1, reduced: 0.4, none: 0 }[mode]; if (A === undefined) throw new Error(`motion mode must be full, reduced or none, got ${mode}`);
  return {
    mode, factor: A,
    /** Scale a distance, size change or angle (px, radians). */ amp: x => x * A,
    /** Overshoot strength for outBack: 1.70158 full, 1.2 reduced, 0 none (then ease with outCubic). */ overshoot: s => (mode === 'full' ? s : mode === 'reduced' ? Math.min(s, 1.2) : 0),
    /** Sinusoidal jitter, only in full mode (reduced and none do not shake). */ shake: (t, amp, hz = 13, ph = 0) => (mode === 'full' ? amp * Math.sin(t * hz + ph) : 0),
    /** Whether things may spin or travel across large areas. */ spin: mode === 'full', travel: mode !== 'none',
    /** Stretch a duration: slower in reduced modes. */ dur: d => (mode === 'full' ? d : d * 1.25),
    /** Flash intensity cap: never above 0.35 alpha for full-frame light, and none in 'none'. */ flash: a => (mode === 'none' ? 0 : Math.min(a, 0.35)),
  };
}

// ------------------------------------------------------------------ caption files
/** Parse an .srt string into cues [{n, start, end, text, lines[]}] with times in seconds. */
export function parseSrt(text) {
  const cues = []; const ts = s => { const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0').slice(0, 3) / 1000; };
  for (const blk of text.replace(/\r/g, '').trim().split(/\n\s*\n/)) { const l = blk.split('\n'); const ti = l.findIndex(x => x.includes('-->')); if (ti < 0) continue;
    const [a, b] = l[ti].split('-->'); const lines = l.slice(ti + 1).filter(Boolean); cues.push({ n: +l[0] || cues.length + 1, start: ts(a), end: ts(b), lines, text: lines.join(' ') }); }
  return cues;
}
/**
 * Check caption cues for readability: reading speed in characters per second (17 target, 20 fails), duration (0.8-7 s), line length (42), lines per cue (2), overlaps.
 * @param {{start:number,end:number,lines:string[],text:string}[]} cues @returns {{ok:boolean, issues:{level:string,rule:string,detail:string}[], stats:object}}
 */
export function checkCaptions(cues, L = LIMITS.captions) {
  const issues = [], add = (level, rule, detail) => issues.push({ level, rule, detail }); let maxCps = 0, worst = null;
  cues.forEach((c, i) => {
    const d = c.end - c.start, chars = [...c.text.replace(/\s+/g, ' ')].length, cps = chars / d, tag = `cue ${i + 1} "${c.text.slice(0, 40)}"`; if (cps > maxCps) { maxCps = cps; worst = i + 1; }
    if (cps > L.cpsMax) add('fail', 'reading speed', `${tag}: ${cps.toFixed(1)} characters per second, limit ${L.cpsMax}`); else if (cps > L.cpsTarget) add('warn', 'reading speed', `${tag}: ${cps.toFixed(1)} characters per second, target ${L.cpsTarget}`);
    if (d < L.minSeconds) add('fail', 'duration', `${tag}: on screen ${d.toFixed(2)} s, minimum ${L.minSeconds} s`); if (d > L.maxSeconds) add('warn', 'duration', `${tag}: on screen ${d.toFixed(2)} s, over ${L.maxSeconds} s`);
    if (c.lines.length > L.maxLines) add('fail', 'lines', `${tag}: ${c.lines.length} lines, limit ${L.maxLines}`); const long = c.lines.find(x => [...x].length > L.lineChars); if (long) add('warn', 'line length', `${tag}: a line of ${[...long].length} characters, limit ${L.lineChars}`);
    const nx = cues[i + 1]; if (nx && nx.start < c.end - 1e-6) add('fail', 'overlap', `${tag} overlaps the next cue by ${(c.end - nx.start).toFixed(2)} s`); else if (nx && nx.start - c.end < L.minGapSeconds && nx.start >= c.end) add('warn', 'gap', `${tag}: only ${(nx.start - c.end).toFixed(2)} s before the next cue`);
  });
  return { ok: !issues.some(i => i.level === 'fail'), issues, stats: { cues: cues.length, maxCps: Math.round(maxCps * 10) / 10, worstCue: worst } };
}

// ------------------------------------------------------------------ flash analysis
/**
 * Count opposing changes of at least `thr` in a series sampled at fps. A change is a rise or fall of `thr` from the last turning point.
 * `skip(a,b)` can drop a change (the darker value must stay under the dark limit). @returns {number[]} frame numbers of the changes
 */
export function changes(series, thr, skip = () => false) {
  const out = []; let state = null, cur = series[0], anchor = series[0];
  for (let i = 1; i < series.length; i++) {
    const v = series[i];
    if (state === null) { if (v - anchor >= thr) { state = 'up'; if (!skip(anchor, v)) out.push(i); cur = v; } else if (anchor - v >= thr) { state = 'down'; if (!skip(anchor, v)) out.push(i); cur = v; } else if (Math.abs(v - anchor) < thr / 4) anchor = v; }
    else if (state === 'up') { if (v > cur) cur = v; else if (cur - v >= thr) { if (!skip(cur, v)) out.push(i); state = 'down'; cur = v; } }
    else { if (v < cur) cur = v; else if (v - cur >= thr) { if (!skip(cur, v)) out.push(i); state = 'up'; cur = v; } }
  }
  return out;
}
/** Most flashes (pairs of changes) found in any window of one second. @param {number[]} ch frame numbers @param {number} fps */
export function flashesPerSecond(ch, fps) { let worst = 0; for (let i = 0; i < ch.length; i++) { let j = i; while (j < ch.length && ch[j] - ch[i] < fps) j++; worst = Math.max(worst, (j - i) / 2); } return worst; }

// ------------------------------------------------------------------ the scorer
const SW = 270, SH = 480, CW = 45, CH = 80, NX = 6, NY = 6; // analysis canvas and its 6x6 cells; a region is 2x2 cells (1/9 of the frame)
/**
 * Score a card. Draws every `step`-th frame once and measures: flashes (general and red) in 25 regions plus the whole frame; text contrast (normal, and as seen
 * with the three kinds of colour-blindness); reading time of every text; large moving areas and global shake; and, if `srt` is given, the caption file.
 * Returns { pass, score, sections, issues }. Hard failures (flash, contrast under 3:1 for more than 0.5 s, captions over 20 characters per second) set pass false.
 * @param {string} cardPath @param {{step?:number, srt?:string, cues?:object[]}} [o]
 */
export async function scoreCard(cardPath, o = {}) {
  const card = await loadCard(path.resolve(cardPath)), { META } = card, fps = META.fps, step = Math.max(1, o.step || 1), N = META.frames; if (card.init) await card.init();
  const small = createCanvas(SW, SH), sc = small.getContext('2d'), mid = createCanvas(540, 960), mc = mid.getContext('2d'); sc.imageSmoothingQuality = 'high'; mc.imageSmoothingQuality = 'high';
  const log = { W: META.W, H: META.H, entries: [] }; globalThis.__annieTextLog = log;
  const REG = []; for (let j = 0; j <= NY - 2; j++) for (let i = 0; i <= NX - 2; i++) REG.push([i, j]);
  const lumS = [], redS = [], L = new Float32Array(SW * SH), G = new Float32Array(SW * SH); let prev = null, prevG = null; const moved = [], cam = [], idx = [], shifts = [];
  const texts = new Map(), contrastHits = new Map(); let sampledSeconds = 0;
  try {
    for (let f = 0; f < N; f += step) {
      if (idx.length % 10 === 9) await new Promise(r => setImmediate(r)); // native canvas memory is freed only when the event loop turns
      log.entries.length = 0; const cv = card.frame(f / fps, f); idx.push(f);
      sc.clearRect(0, 0, SW, SH); sc.drawImage(cv, 0, 0, SW, SH); const d = sc.getImageData(0, 0, SW, SH).data;
      const cellL = new Float64Array(NX * NY), cellR = new Float64Array(NX * NY); let changed = 0;
      for (let y = 0, k = 0; y < SH; y++) for (let x = 0; x < SW; x++, k++) {
        const i = k * 4, r = d[i], g = d[i + 1], b = d[i + 2], c = (y / CH | 0) * NX + (x / CW | 0), ll = 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
        cellL[c] += ll; const sum = r + g + b; if (sum > 60 && r / sum >= 0.8) cellR[c]++;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b; if (prev && Math.abs(luma - prev[k]) >= 6) changed++; L[k] = luma;
      }
      const cellArea = CW * CH, rl = [], rr = [];
      for (const [i, j] of REG) { const c = [j * NX + i, j * NX + i + 1, (j + 1) * NX + i, (j + 1) * NX + i + 1]; rl.push(c.reduce((a, q) => a + cellL[q], 0) / (4 * cellArea)); rr.push(c.reduce((a, q) => a + cellR[q], 0) / (4 * cellArea)); }
      rl.push(cellL.reduce((a, q) => a + q, 0) / (SW * SH)); rr.push(cellR.reduce((a, q) => a + q, 0) / (SW * SH)); lumS.push(rl); redS.push(rr);
      moved.push(prev ? changed / (SW * SH) : 0);
      // global shift: gradient magnitude; best integer shift within +-8 small px (32 px at full size): coarse grid of 2, then refine by 1.
      // Only counted when the picture has texture in at least a quarter of its cells (a lone moving element is not a camera move).
      const cellG = new Float64Array(NX * NY);
      for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) { const k = y * SW + x; G[k] = Math.abs(L[k + 1] - L[k - 1]) + Math.abs(L[k + SW] - L[k - SW]); cellG[(y / CH | 0) * NX + (x / CW | 0)] += G[k]; }
      const spread = cellG.filter(v => v > 3000).length / (NX * NY);
      if (prevG) {
        const sad = (dx, dy) => { let s = 0; for (let y = 12; y < SH - 12; y += 3) for (let x = 12; x < SW - 12; x += 3) s += Math.abs(G[y * SW + x] - prevG[(y - dy) * SW + x - dx]); return s; };
        const base = sad(0, 0); let best = base, bdx = 0, bdy = 0;
        for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) { const s = sad(dx, dy); if (s < best) { best = s; bdx = dx; bdy = dy; } }
        const cx = bdx, cy = bdy; for (let dy = cy - 1; dy <= cy + 1; dy++) for (let dx = cx - 1; dx <= cx + 1; dx++) { const s = sad(dx, dy); if (s < best) { best = s; bdx = dx; bdy = dy; } }
        shifts.push(base > 400 && spread >= 0.25 && best < base * 0.5 ? [bdx * 4, bdy * 4] : [0, 0]);
      } else shifts.push([0, 0]);
      prev = Float32Array.from(L); prevG = Float32Array.from(G);
      // text: reading time (every frame) and contrast (every 3rd sample)
      for (const e of log.entries) { if (e.decor || e.a < 0.05) continue; const t = texts.get(e.s) || texts.set(e.s, { s: e.s, px: e.px, run: [], frames: [] }).get(e.s); t.px = Math.max(t.px, e.px); t.frames.push([f, e.a]); }
      if ((idx.length - 1) % 3 === 0 && log.entries.some(e => !e.decor && e.a >= 0.9 && parseColor(e.color))) {
        mc.clearRect(0, 0, 540, 960); mc.drawImage(cv, 0, 0, 540, 960); const full = mc.getImageData(0, 0, 540, 960).data; sampledSeconds += (3 * step) / fps;
        for (const e of log.entries) {
          const tc = parseColor(e.color); if (!tc || e.a < 0.9 || e.decor || e.px < 12) continue;
          const m = 6, x0 = Math.max(0, Math.floor(e.x0 / 2) - m), x1 = Math.min(539, Math.ceil(e.x1 / 2) + m), y0 = Math.max(0, Math.floor(e.y0 / 2) - m), y1 = Math.min(959, Math.ceil(e.y1 / 2) + m), rs = [], gs = [], bs = [];
          for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) { if (x >= e.x0 / 2 - 2 && x <= e.x1 / 2 + 2 && y >= e.y0 / 2 - 2 && y <= e.y1 / 2 + 2) continue; const i = (y * 540 + x) * 4; rs.push(full[i]); gs.push(full[i + 1]); bs.push(full[i + 2]); }
          if (rs.length < 8) continue; const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; }, bg = [med(rs), med(gs), med(bs)], c = contrastAll(tc, bg), large = e.px >= LIMITS.largePx, need = large ? LIMITS.contrastLarge : LIMITS.contrastNormal;
          const h = contrastHits.get(e.s) || contrastHits.set(e.s, { s: e.s, px: e.px, large, n: 0, below: 0, belowHard: 0, belowCvd: 0, min: 99, minCvd: 99 }).get(e.s);
          h.n++; h.min = Math.min(h.min, c.normal); h.minCvd = Math.min(h.minCvd, c.min); if (c.normal < need) h.below++; if (c.normal < LIMITS.contrastLarge) h.belowHard++; if (c.min < LIMITS.contrastCvd) h.belowCvd++;
        }
      }
    }
  } finally { globalThis.__annieTextLog = null; }
  const issues = [], add = (level, section, detail) => issues.push({ level, section, detail }), secPer = (step) / fps, sections = {};

  // --- photosensitivity
  const nR = REG.length + 1; let worstF = 0, worstR = -1, worstRed = 0, worstRedR = -1;
  for (let r = 0; r < nR; r++) {
    const ls = lumS.map(x => x[r]), rs = redS.map(x => x[r]);
    const lc = changes(ls, LIMITS.flashChange, (a, b) => Math.min(a, b) >= LIMITS.flashDarkLimit), fl = flashesPerSecond(lc.map(i => i * step), fps); if (fl > worstF) { worstF = fl; worstR = r; }
    const rc = changes(rs, LIMITS.redChange), rf = flashesPerSecond(rc.map(i => i * step), fps); if (rf > worstRed) { worstRed = rf; worstRedR = r; }
  }
  const photo = { generalFlashesPerSecond: worstF, redFlashesPerSecond: worstRed, region: worstR >= 0 ? (worstR === REG.length ? 'whole frame' : `block ${REG[worstR]}`) : null, pass: worstF <= LIMITS.flashesPerSecond && worstRed <= LIMITS.flashesPerSecond }; sections.photosensitivity = photo;
  if (worstF > LIMITS.flashesPerSecond) add('fail', 'photosensitivity', `${worstF} flashes in one second in ${photo.region} (limit ${LIMITS.flashesPerSecond}): changes of 0.1 in average brightness over a ninth of the screen`);
  if (worstRed > LIMITS.flashesPerSecond) add('fail', 'photosensitivity', `${worstRed} saturated-red flashes in one second (limit ${LIMITS.flashesPerSecond})`);
  const frameL = lumS.map(x => x[REG.length]), maxJump = frameL.reduce((m, v, i) => (i ? Math.max(m, Math.abs(v - frameL[i - 1])) : 0), 0); photo.maxFrameToFrameBrightnessJump = Math.round(maxJump * 1000) / 1000;
  if (maxJump > 0.2) add('warn', 'photosensitivity', `the whole frame changes brightness by ${maxJump.toFixed(2)} in one frame`);

  // --- contrast
  const hits = [...contrastHits.values()], total = hits.reduce((a, h) => a + h.n, 0) || 1, bad = hits.reduce((a, h) => a + h.below, 0), hard = hits.filter(h => h.belowHard * 3 * secPer * 1 > 0.5 + 1e-9);
  const cn = { minRatio: hits.length ? Math.round(Math.min(...hits.map(h => h.min)) * 100) / 100 : null, minRatioColourBlind: hits.length ? Math.round(Math.min(...hits.map(h => h.minCvd)) * 100) / 100 : null, belowTargetFraction: Math.round((bad / total) * 1000) / 1000, texts: hits.length, worst: hits.sort((a, b) => a.min - b.min).slice(0, 4).map(h => ({ text: h.s, px: Math.round(h.px), ratio: Math.round(h.min * 100) / 100, colourBlindRatio: Math.round(h.minCvd * 100) / 100 })) }; sections.contrast = cn;
  for (const h of hard) add('fail', 'contrast', `"${h.s}": ${h.min.toFixed(2)}:1, under the 3:1 floor for ${(h.belowHard * 3 * secPer).toFixed(1)} s`);
  for (const h of hits.filter(h => h.below * 3 * secPer > 0.5 && !hard.includes(h))) add('warn', 'contrast', `"${h.s}": ${h.min.toFixed(2)}:1, wants ${h.large ? 3 : 4.5}:1 (${h.large ? 'large' : 'body'} text, ${Math.round(h.px)} px)`);
  for (const h of hits.filter(h => h.belowCvd * 3 * secPer > 0.5)) add('warn', 'contrast', `"${h.s}": ${h.minCvd.toFixed(2)}:1 for colour-blind viewers (wants ${LIMITS.contrastCvd}:1): do not rely on hue alone`);

  // --- reading time
  const rushed = []; let readTexts = 0;
  for (const t of texts.values()) {
    if ([...t.s.replace(/\s/g, '')].length < LIMITS.minTokenChars || t.px < 42) continue; readTexts++;
    let best = 0, run = 0, last = -1e9; for (const [f, a] of t.frames) { if (a >= 0.9) { run = f - last <= step ? run + step : step; best = Math.max(best, run); } else run = 0; last = f; }
    const words = t.s.trim().split(/\s+/).length, need = Math.max(LIMITS.minReadSeconds, 0.4 + words / LIMITS.wordsPerSecond), have = best / fps; if (have < need - 1e-6) rushed.push({ text: t.s, seconds: Math.round(have * 100) / 100, need: Math.round(need * 100) / 100 });
  }
  sections.reading = { texts: readTexts, rushed }; for (const r of rushed) add('warn', 'reading', `"${r.text}" is fully visible ${r.seconds} s, a reader needs about ${r.need} s`);

  // --- motion
  const frames = idx.length; let sustained = 0, runS = 0, peak = 0, strong = 0;
  moved.forEach(v => { peak = Math.max(peak, v); if (v >= LIMITS.movedFraction) { runS += secPer; sustained = Math.max(sustained, runS); } else runS = 0; });
  let runStrong = 0; moved.forEach(v => { if (v >= LIMITS.movedFractionStrong) { runStrong += secPer; strong = Math.max(strong, runStrong); } else runStrong = 0; });
  // shake: follow the picture's position (the sum of the global shifts) and count swings of at least 8 px within one second
  const px = [0], py = [0]; shifts.forEach(([dx, dy]) => { px.push(px[px.length - 1] + dx); py.push(py[py.length - 1] + dy); });
  const swing = [...changes(px, LIMITS.shakeSwingPx), ...changes(py, LIMITS.shakeSwingPx)].map(i => i * step).sort((a, b) => a - b); let worstRev = 0;
  for (let i = 0; i < swing.length; i++) { let j = i; while (j < swing.length && swing[j] - swing[i] < fps) j++; worstRev = Math.max(worstRev, j - i); }
  const camPx = shifts.map(([dx, dy]) => Math.hypot(dx, dy)), camSeconds = camPx.filter(v => v > 0).length * secPer;
  const level = worstRev >= LIMITS.shakeReversalsPerSecond || strong >= LIMITS.movedSustainedSeconds ? 'strong' : sustained >= LIMITS.movedSustainedSeconds || camSeconds > 1 ? 'moderate' : 'calm';
  sections.motion = { level, peakMovedFraction: Math.round(peak * 1000) / 1000, sustainedLargeAreaSeconds: Math.round(sustained * 100) / 100, strongAreaSeconds: Math.round(strong * 100) / 100, shakeSwingsPerSecond: worstRev, wholeFrameShiftSeconds: Math.round(camSeconds * 100) / 100, notMeasured: 'zoom, spin and parallax of single layers' };
  if (worstRev >= LIMITS.shakeReversalsPerSecond) add('warn', 'motion', `the whole picture keeps moving back and forth: ${worstRev} swings of 8 px or more in one second`);
  if (strong >= LIMITS.movedSustainedSeconds) add('warn', 'motion', `more than ${LIMITS.movedFractionStrong * 100}% of the frame changes for ${strong.toFixed(2)} s at once`); else if (sustained >= LIMITS.movedSustainedSeconds) add('warn', 'motion', `more than ${LIMITS.movedFraction * 100}% of the frame changes for ${sustained.toFixed(2)} s at once`);

  // --- captions
  let capt = null; const cues = o.cues || (o.srt ? parseSrt(fs.readFileSync(o.srt, 'utf8')) : null);
  if (cues) { capt = checkCaptions(cues); sections.captions = capt; for (const i of capt.issues) add(i.level, 'captions', `${i.rule}: ${i.detail}`); } else sections.captions = null;

  // --- score
  let score = 100; const fails = issues.filter(i => i.level === 'fail');
  if (!photo.pass) score -= 60; score -= Math.min(25, Math.round(cn.belowTargetFraction * 60)); score -= hard.length * 15; score -= Math.min(16, rushed.length * 4);
  score -= sections.motion.level === 'strong' ? 25 : sections.motion.level === 'moderate' ? 8 : 0; score -= hits.some(h => h.belowCvd * 3 * secPer > 0.5) ? 5 : 0;
  if (capt) score -= Math.min(20, capt.issues.filter(i => i.level === 'fail').length * 4 + capt.issues.filter(i => i.level === 'warn').length * 1);
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { card: path.basename(cardPath), frames, seconds: N / fps, pass: fails.length === 0 && score >= LIMITS.pass, score, sections, issues };
}

/** One plain line per issue, for a person: `FIX` for failures, `note` for warnings. */
export const lines = r => (r.issues.length ? r.issues.map(i => `${i.level === 'fail' ? 'FIX' : 'note'} [${i.section}] ${i.detail}`) : ['clean: no accessibility issues found']);
