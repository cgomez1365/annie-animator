// t7.3 motion-brand-system: the BGI / AEON signature motion as code.
//   1. CURVES: the timing-curve library (names, easings, durations, jobs) and helpers to play and measure them.
//   2. The cog: gear geometry, the ratchet (it turns in clicks, never spins), the meshed pair, the click pulse.
//   3. RULES: do and do-not, as data.
//   4. scoreCard(): a checker that scores a card file against the system (static source scan + the engine's QC + a motion cadence reading).
// Everything is a pure function of its inputs. No Math.random, no Date.
import fs from 'node:fs';
import { E, prog, lerp, clamp, hex } from '../../engine/ease.mjs';
import { SPRING, spring } from '../../engine/spring.mjs';
import { P } from '../../engine/brand.mjs';
import { qcCard } from '../../engine/qc.mjs';

// ------------------------------------------------------------------ 1. the timing-curve library
/**
 * The studio's curves. One name per job. `dur` is the range in seconds (or `period` for loops). Use the mid value unless the card is crowded.
 * `arg` is the extra easing argument (the overshoot of outBack). `role` groups curves for the checker.
 */
export const CURVES = {
  enter:   { ease: 'outCubic',   dur: [0.30, 0.40], role: 'enter', use: 'fade and slide in: pages, headers, panels, anything arriving' },
  exit:    { ease: 'inCubic',    dur: [0.20, 0.35], role: 'exit',  use: 'everything that leaves: it accelerates away, it never fades out slowly' },
  pop:     { ease: 'outBack',    dur: [0.35, 0.60], arg: 1.7, role: 'pop', use: 'chips, bubbles, buttons and cards landing (10 percent overshoot)' },
  slam:    { ease: 'outElastic', dur: [0.60, 0.90], arg: 1, role: 'pop', use: 'stamps, badges, the one money shot of a card (use once)' },
  glide:   { ease: 'inOutCubic', dur: [0.60, 1.20], role: 'travel', use: 'a marker or camera going from A to B' },
  click:   { ease: 'outBack',    dur: [0.26, 0.30], arg: 1.3, role: 'click', use: 'one cog step: fast snap, small overshoot, then a hold' },
  breathe: { ease: 'inOutSine',  period: [1.2, 2.0], role: 'loop', use: 'glow, button pulse, any hold that must not freeze' },
  settle:  { spring: 'bouncy',   dur: [0.55, 0.80], role: 'pop', use: 'a body that lands and wobbles to rest (SPRING.bouncy, settles in 0.67 s)' },
};
/** Stagger gaps in seconds by what is being staggered (tt10). */
export const STAGGER = { rows: 0.14, chips: 0.08, cells: 0.04, cogSteps: 0.6 };
/** The page slide: in 0.4 s outCubic, out 0.35 s inCubic, overlap 0.1 s, travel 160 px. */
export const PAGE = { inDur: 0.4, outDur: 0.35, overlap: 0.1, dist: 160 };
const easeFn = c => c.spring ? (u => spring(u * ((c.dur[0] + c.dur[1]) / 2), { from: 0, to: 1, ...SPRING[c.spring] })) : c.arg !== undefined ? (u => E[c.ease](u, c.arg)) : E[c.ease];
/** Eased value of a named curve at u in 0..1. @param {keyof typeof CURVES} name @param {number} u */
export function curve(name, u) { const c = CURVES[name]; if (!c) throw new Error('unknown curve ' + name); return easeFn(c)(clamp(u)); }
/** Progress of a named curve at time t for an event starting at t0 (dur defaults to the middle of the range). @returns {number} 0..1 (may pass 1 on overshoot) */
export function play(name, t, t0, dur) { const c = CURVES[name], d = dur ?? (c.dur ? (c.dur[0] + c.dur[1]) / 2 : 1); return curve(name, prog(t, t0, t0 + d)); }
/** Sample a curve at n+1 points (for drawing the curve). */
export const sampleCurve = (name, n = 60) => Array.from({ length: n + 1 }, (_, i) => curve(name, i / n));
/** How far a curve passes its target, as a fraction (0.1 = 10 percent overshoot). */
export const overshoot = (name) => Math.max(0, Math.max(...sampleCurve(name, 400)) - 1);
/** A looping breathing value 0..1 for glows and pulses at `period` s (1.6 is the brand default). */
export const breathe = (t, period = 1.6, phase = 0) => 0.5 + 0.5 * Math.sin(2 * Math.PI * (t / period + phase));

// ------------------------------------------------------------------ 2. the cog
/** The official mark has 12 teeth; the signature step is one tooth = 30 degrees. */
export const COG_TEETH = 12;
/** Gear polygon, module-based so two gears of the same module mesh: tip = rp + m, root = rp - 1.25 m, m = rp / teeth. Returns [[x,y],...]. */
export function gearPoints(cx, cy, rp, teeth, angle = 0) {
  const m = rp / teeth, tip = rp + m, root = rp - 1.25 * m, p = 2 * Math.PI / teeth, pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = angle + i * p;
    for (const [da, r] of [[-0.30 * p, root], [-0.17 * p, tip], [0.17 * p, tip], [0.30 * p, root]]) pts.push([cx + Math.cos(a + da) * r, cy + Math.sin(a + da) * r]);
  }
  return pts;
}
/**
 * Draw a gear (outline, optional fill, hub hole). o: { fill, stroke, lineWidth, hole (fraction of rp, default 0.32) }.
 * @param {*} ctx @param {number} cx @param {number} cy @param {number} rp pitch radius @param {number} teeth @param {number} angle radians
 */
export function drawGear(ctx, cx, cy, rp, teeth, angle, o = {}) {
  const pts = gearPoints(cx, cy, rp, teeth, angle);
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  const hole = o.hole ?? 0.32; if (hole > 0) { ctx.moveTo(cx + rp * hole, cy); ctx.arc(cx, cy, rp * hole, 0, Math.PI * 2, true); }
  if (o.fill) { ctx.fillStyle = o.fill; ctx.fill('evenodd'); }
  if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lineWidth ?? 4; ctx.lineJoin = 'round'; ctx.stroke(); }
}
/** The moment inside a click (0..1 of its duration) when the cog first reaches its target tooth: the impact. */
export const CLICK_IMPACT = (() => { let u = 0; while (E.outBack(u, CURVES.click.arg) < 1) u += 0.001; return u; })();
/**
 * The ratchet: the cog turns one tooth per `period`, snapping in `dur` seconds with a small overshoot, then holds. It never spins continuously.
 * Returns the rotation in radians (clockwise). After step n has finished it sits at exactly (n + 1) * 2 PI / teeth.
 * @param {number} t @param {{t0?:number,teeth?:number,period?:number,dur?:number,s?:number}} [o]
 */
export function ratchetAngle(t, { t0 = 0, teeth = COG_TEETH, period = 0.6, dur = 0.28, s = CURVES.click.arg } = {}) {
  if (t < t0) return 0; const n = Math.floor((t - t0) / period), u = prog(t - t0 - n * period, 0, dur);
  return (2 * Math.PI / teeth) * (n + E.outBack(u, s));
}
/**
 * The click: time since the last impact, its step index, and a decaying envelope 0..1 (1 at the impact, 0 after `tail` s) for rings and shake.
 * @returns {{n:number,since:number,k:number}|null} null before the first click
 */
export function clickPulse(t, { t0 = 0, period = 0.6, dur = 0.28, tail = 0.3 } = {}) {
  if (t < t0 + dur * CLICK_IMPACT) return null;
  const n = Math.floor((t - t0 - dur * CLICK_IMPACT) / period), since = t - (t0 + n * period + dur * CLICK_IMPACT); return { n, since, k: Math.max(0, 1 - since / tail) };
}
/** A 2-px-class shake that dies in 0.3 s after each impact: returns [dx, dy] in px. */
export function clickShake(t, o = {}, amp = 3) { const c = clickPulse(t, o); if (!c || c.k <= 0) return [0, 0]; const d = amp * c.k * c.k; return [d * Math.sin(c.since * 90), d * 0.6 * Math.cos(c.since * 70)]; }
/**
 * A meshed pair on a horizontal line of centres: A (driver, ratchets clockwise) on the left, B (driven) on the right turning the other way by
 * teethA/teethB, phased half a tooth so A's tooth always sits in B's gap. Centres are rpA + rpB apart.
 * @param {number} angleA radians @param {{cx:number,cy:number,teethA?:number,teethB?:number,rpA:number}} o
 * @returns {{A:{cx:number,cy:number,rp:number,teeth:number,angle:number},B:{cx:number,cy:number,rp:number,teeth:number,angle:number}}}
 */
export function meshedPair(angleA, { cx, cy, teethA = COG_TEETH, teethB = 18, rpA }) {
  const rpB = rpA * teethB / teethA, pB = 2 * Math.PI / teethB;
  return { A: { cx, cy, rp: rpA, teeth: teethA, angle: angleA }, B: { cx: cx + rpA + rpB, cy, rp: rpB, teeth: teethB, angle: Math.PI + pB / 2 - angleA * teethA / teethB } };
}
/** Contact point of a meshed pair (where the pitch circles touch). */
export const meshPoint = pair => [pair.A.cx + pair.A.rp, pair.A.cy];

// ------------------------------------------------------------------ 3. the rules
/** Do and do-not rules as data (id, level, text). Print them into a brief, or read them while reviewing a card. */
export const RULES = [
  { id: 'D1', do: true, text: 'Things arrive with outCubic (0.3-0.4 s) or land with outBack (0.35-0.6 s, overshoot 1.5-2.2). Things leave with inCubic (0.2-0.35 s).' },
  { id: 'D2', do: true, text: 'The cog turns in clicks: one tooth (30 degrees) per 0.6 s, a 0.28 s snap with a small overshoot, then a hold. The driven gear turns the other way at the tooth ratio.' },
  { id: 'D3', do: true, text: 'Every click leaves a trace: a 0.3 s ring or a 3 px shake. A click with no trace reads as a glitch.' },
  { id: 'D4', do: true, text: 'Pages slide 0.4 s in, 0.35 s out, overlapping 0.1 s. Staggers: rows 0.14 s, chips 0.08 s, cells 0.04 s; cap a whole stagger under 1.2 s.' },
  { id: 'D5', do: true, text: 'Nothing sits still: every hold carries a breathe (1.6 s), a drift, a marker or dust. Declare a hold in META.holds only for a real pause.' },
  { id: 'D6', do: true, text: 'One slam (outElastic) per card, on the money shot. Everything else pops or glides.' },
  { id: 'D7', do: true, text: 'Palette is the BGI palette. Green is the action colour: use it for the thing to look at, not for everything.' },
  { id: 'D8', do: true, text: 'Every card ends with the closer: slogan (both lines, line 2 green), Follow, footer. The gear mark draws itself in the closer.' },
  { id: 'N1', do: false, text: 'No linear motion for anything an eye follows. Linear belongs to nothing (drift under 10 px/s is the only exception).' },
  { id: 'N2', do: false, text: 'No constant-speed spinning cog. A gear that spins smoothly says "screensaver"; BGI gears click.' },
  { id: 'N3', do: false, text: 'No slow fade-outs (over 0.4 s) and no fade-ins as the only entrance: add a slide or a pop.' },
  { id: 'N4', do: false, text: 'No more than one thing popping at the same instant; stagger them.' },
  { id: 'N5', do: false, text: 'No Math.random or Date in frames. Use rng(seed) and noise1.' },
  { id: 'N6', do: false, text: 'No second overshoot curve on the same object in one move (outBack on top of a spring doubles the wobble).' },
  { id: 'N7', do: false, text: 'No off-palette colour, no gradients that fight the green, no drop shadows on text.' },
  { id: 'N8', do: false, text: 'No motion shorter than 0.15 s (reads as a cut) and no single move longer than 3 s unless it is a slow camera or turn.' },
];

// ------------------------------------------------------------------ 4. the checker
const SIGNATURE = new Set(['outCubic', 'inCubic', 'outBack', 'outElastic', 'inOutCubic', 'inOutSine', 'outBounce']);
const TOLERATED = new Set(['outQuart', 'inOutQuart', 'outExpo', 'outQuad', 'inOutQuad', 'outSine']);
const OFF_SYSTEM = new Set(['linear', 'inQuad', 'inSine', 'inBack', 'inElastic', 'inBounce', 'inExpo', 'inOutExpo', 'inCirc', 'outCirc', 'inOutCirc', 'inOutBack', 'inQuart']);
const PALETTE = [...new Set(Object.values(P))].map(h => hex(h));
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const near = (a, b, d) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= d;
/** Is an [r,g,b] on the BGI palette (within 36) or a near-black shadow neutral? */
export const onPalette = rgb => PALETTE.some(p => near(rgb, p, 36)) || (Math.max(...rgb) - Math.min(...rgb) <= 16 && Math.max(...rgb) <= 70) || (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255);

/**
 * Static scan of card source: which easings, durations, colours and banned calls it uses. Pure (no files, no rendering).
 * @param {string} source @returns {{eases:Record<string,number>,constantSpin:boolean,roles:{pop:boolean,enter:boolean,exit:boolean,persistent:boolean},durations:{n:number,tooShort:number[],tooLong:number[]},colors:{n:number,off:string[]},forbidden:string[],structure:{closer:boolean,hook:boolean,begin:boolean}}}
 */
export function analyzeSource(source) {
  const src = stripComments(source), eases = {}, bump = n => { eases[n] = (eases[n] || 0) + 1; };
  for (const m of src.matchAll(/\bE\.(\w+)/g)) bump(m[1]);
  for (const m of src.matchAll(/['"](linear|in[A-Z]\w*|out[A-Z]\w*)['"]/g)) bump(m[1]);
  for (const m of src.matchAll(/\b(spring|springPath|springState|followThrough|SPRING\.\w+)\b/g)) bump('spring');
  const used = new Set(Object.keys(eases));
  const roles = {
    pop: used.has('outBack') || used.has('outElastic') || used.has('spring') || used.has('outBounce'),
    enter: used.has('outCubic') || used.has('outBack') || used.has('outElastic') || /\b(hook|page|pages)\s*\(/.test(src) || used.has('spring'),
    exit: used.has('inCubic') || /\b(hook|page|pages)\s*\(/.test(src) || /1\s*-\s*prog\(/.test(src),
    persistent: /\b(noise1|pulse|loop|blink|dust|breathe|ratchetAngle|followThrough)\s*\(|Math\.sin\(\s*t|Math\.cos\(\s*t|begin\(/.test(src),
  };
  const tooShort = [], tooLong = []; let n = 0;
  for (const m of src.matchAll(/prog\(\s*[\w.]+\s*,\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/g)) {
    const a = m[1].trim(), b = m[2].trim(); let d = null;
    if (/^[\d.]+$/.test(a) && /^[\d.]+$/.test(b)) d = +b - +a; else if (b.startsWith(a) && /^\+\s*[\d.]+$/.test(b.slice(a.length).trim())) d = +b.slice(a.length).replace('+', '').trim();
    if (d === null || !isFinite(d)) continue; n++; const line = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index + m[0].length));
    if (d < 0.15) tooShort.push(+d.toFixed(3)); if (d > 3.0 && !/inOutSine|inOutCubic|loop\(/.test(line)) tooLong.push(+d.toFixed(3)); // a slow camera or turn (inOutSine) may run long
  }
  const off = []; let nc = 0;
  for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) { nc++; let h = m[0]; if (h.length === 4) h = '#' + [...h.slice(1)].map(c => c + c).join(''); if (!onPalette(hex(h))) off.push(m[0]); }
  for (const m of src.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g)) { nc++; const rgb = [+m[1], +m[2], +m[3]]; if (!onPalette(rgb)) off.push(m[0] + ')'); }
  const forbidden = [];
  if (/Math\.random\s*\(/.test(src)) forbidden.push('Math.random'); if (/\bDate\.now\s*\(|new\s+Date\b/.test(src)) forbidden.push('Date'); if (/performance\.now\s*\(/.test(src)) forbidden.push('performance.now');
  if (/\bsetTimeout\s*\(|\bsetInterval\s*\(|requestAnimationFrame/.test(src)) forbidden.push('timers');
  const constantSpin = /rotate\(\s*\(?\s*t\s*[*\/]|rotate\(\s*[\d.]+\s*\*\s*t\b/.test(src); // ctx.rotate(t * k): a smooth spinner, not a click
  return { eases, constantSpin, roles, durations: { n, tooShort, tooLong }, colors: { n: nc, off }, forbidden, structure: { closer: /\bcloser\s*\(|\bend\s*\([^)]*closerAt|closerAt\s*:/.test(src), hook: /\bhook\s*\(/.test(src), begin: /\bbegin\s*\(/.test(src) } };
}
/**
 * Motion cadence from a QC motion-energy profile: how many separate motion events per second. Pace of the six cards built so far is 0.4-0.8 events a second; under 0.3 the card is sluggish, over 4 frantic (calibrated on those cards, not on viewer data). An event = a rise over 1.5x the running median after a lull.
 * @param {(number|null)[]} profile energy per sampled frame @param {number} step frames per sample @param {number} [fps=30]
 */
export function cadence(profile, step = 1, fps = 30) {
  const v = profile.map(x => x ?? 0), seconds = v.length * step / fps, sm = v.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - 1); j <= Math.min(v.length - 1, i + 1); j++) { s += v[j]; c++; } return s / c; });
  const sorted = [...sm].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)] || 1e-6, thr = Math.max(med * 1.5, 0.004);
  let events = 0, armed = true; for (const e of sm) { if (armed && e > thr * 1.25) { events++; armed = false; } else if (e < thr * 0.9) armed = true; }
  return { events, perSecond: seconds ? events / seconds : 0, seconds };
}

const W = { qc: 25, vocab: 20, roles: 15, durations: 10, palette: 15, determinism: 5, structure: 5, cadence: 5 };
/**
 * Score a card file against the motion brand system. 0-100: 90 and up = on brand, 70-89 = close, under 70 = off brand. A forbidden call
 * (Math.random, Date, timers) caps the total at 59. Reads the card FILE only (pass extra files with o.files if the motion lives in a helper module).
 * Uses the engine's QC for the hard rules (about 5 s). It judges rule-following, not taste: look at the contact sheet as well.
 * @param {string} cardPath @param {{files?:string[],qc?:boolean,step?:number}} [o]
 * @returns {Promise<{score:number,grade:string,parts:Record<string,{got:number,of:number,note:string}>,fixes:string[],analysis:object,qc?:object,cadence?:object}>}
 */
export async function scoreCard(cardPath, { files = [], qc = true, step = 2 } = {}) {
  const source = [cardPath, ...files].map(f => fs.readFileSync(f, 'utf8')).join('\n'), a = analyzeSource(source), parts = {}, fixes = [];
  const part = (k, frac, note) => { parts[k] = { got: +(W[k] * clamp(frac)).toFixed(1), of: W[k], note }; };
  // vocabulary: share of eased uses that are signature curves
  const names = Object.keys(a.eases), total = names.reduce((s, n) => s + a.eases[n], 0), sig = names.reduce((s, n) => s + (SIGNATURE.has(n) || n === 'spring' ? a.eases[n] : TOLERATED.has(n) ? a.eases[n] * 0.5 : 0), 0);
  const offs = names.filter(n => OFF_SYSTEM.has(n));
  part('vocab', total ? sig / total : 0.5, total ? `${total} eased uses, ${Math.round(100 * sig / total)} percent signature${offs.length ? '; off-system: ' + offs.join(', ') : ''}` : 'no easing found (is the motion inside a helper? pass o.files)');
  if (offs.length) fixes.push(`Replace ${offs.join(', ')} with the brand curves: outCubic to enter, inCubic to leave, outBack to land, inOutCubic to travel.`);
  // roles: a pop, an entrance, an exit, something always moving
  const r = a.roles, got = [r.pop, r.enter, r.exit, r.persistent].filter(Boolean).length - (a.constantSpin ? 1 : 0);
  part('roles', got / 4, `${a.constantSpin ? 'CONSTANT-SPEED ROTATION found; ' : ''}pop ${r.pop ? 'yes' : 'NO'}, enter ${r.enter ? 'yes' : 'NO'}, exit ${r.exit ? 'yes' : 'NO'}, ambient motion ${r.persistent ? 'yes' : 'NO'}`);
  if (a.constantSpin) fixes.push('A shape rotates at constant speed (ctx.rotate(t * k)). BGI cogs click: use ratchetAngle() (rule N2).');
  if (!r.pop) fixes.push('Nothing pops: land at least one object with outBack (1.5-2.2) or a bouncy spring.'); if (!r.exit) fixes.push('Nothing exits with inCubic: add exits (0.2-0.35 s) or use hook() and page().'); if (!r.persistent) fixes.push('No ambient motion found: add dust, a breathe pulse or a drifting marker so holds never freeze.');
  // durations
  const bad = a.durations.tooShort.length + a.durations.tooLong.length;
  part('durations', a.durations.n ? 1 - bad / a.durations.n * 2 : 0.7, a.durations.n ? `${a.durations.n} literal timings, ${a.durations.tooShort.length} under 0.15 s, ${a.durations.tooLong.length} over 3 s` : 'no literal prog() timings found to judge');
  if (a.durations.tooShort.length) fixes.push(`Timings under 0.15 s read as cuts (${a.durations.tooShort.join(', ')} s): lengthen to 0.3-0.4 s.`);
  if (a.durations.tooLong.length) fixes.push(`Single moves over 3 s (${a.durations.tooLong.join(', ')} s) feel sluggish unless it is a camera or turn: split or speed up.`);
  // palette
  part('palette', a.colors.n ? 1 - Math.min(1, a.colors.off.length / a.colors.n * 2) : 1, a.colors.n ? `${a.colors.n} colour literals, ${a.colors.off.length} off palette${a.colors.off.length ? ': ' + [...new Set(a.colors.off)].slice(0, 5).join(', ') : ''}` : 'only palette tokens (P.*) used');
  if (a.colors.off.length) fixes.push(`Off-palette colours: ${[...new Set(a.colors.off)].slice(0, 5).join(', ')}. Use the P.* tokens.`);
  // determinism
  part('determinism', a.forbidden.length ? 0 : 1, a.forbidden.length ? 'forbidden: ' + a.forbidden.join(', ') : 'no Math.random, Date or timers'); if (a.forbidden.length) fixes.push(`Remove ${a.forbidden.join(', ')}: frames must be a pure function of t. Use rng(seed) and noise1.`);
  // structure
  const st = a.structure, sGot = (st.closer ? 3 : 0) + (st.hook ? 1 : 0) + (st.begin ? 1 : 0);
  part('structure', sGot / 5, `closer ${st.closer ? 'yes' : 'NO'}, hook ${st.hook ? 'yes' : 'no'}, begin ${st.begin ? 'yes' : 'no'}`); if (!st.closer) fixes.push('No closer: end the frame with end(ctx, t, {closerAt}).');
  // engine QC and cadence
  let q = null, cad = null;
  if (qc) {
    q = await qcCard(cardPath, { write: false, step }); const fails = q.issues.filter(i => i.level === 'fail');
    part('qc', q.pass ? 1 : Math.max(0, 1 - fails.length * 0.34), q.pass ? `engine QC passed (${q.warns} warnings)` : `engine QC failed: ${[...new Set(fails.map(i => i.rule))].join('; ')}`);
    for (const f of fails) fixes.push(`QC: ${f.rule} (${f.detail.slice(0, 90)}).`);
    cad = cadence(q.motion.profile, step); const ps = cad.perSecond;
    part('cadence', ps >= 0.3 && ps <= 4 ? 1 : ps < 0.3 ? ps / 0.3 : Math.max(0, 1 - (ps - 4) / 4), `${cad.events} motion events in ${cad.seconds.toFixed(1)} s = ${ps.toFixed(2)} a second (brand pace 0.3-4)`);
    if (ps < 0.3) fixes.push('Pace is sluggish: fewer than 0.3 motion events a second. Stagger more things in.'); if (ps > 4) fixes.push('Pace is frantic: more than 4 motion events a second. Overlap less, hold more.');
  } else { part('qc', 0.5, 'not run'); part('cadence', 0.5, 'not run'); }
  let score = Object.values(parts).reduce((s, p) => s + p.got, 0); if (a.forbidden.length) score = Math.min(score, 59);
  score = Math.round(score); return { score, grade: score >= 90 ? 'on brand' : score >= 70 ? 'close' : 'off brand', parts, fixes, analysis: a, qc: q ? { pass: q.pass, fails: q.fails, warns: q.warns } : undefined, cadence: cad || undefined };
}
