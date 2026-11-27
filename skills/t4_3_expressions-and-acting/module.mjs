// t4.3 expressions-and-acting: emotion presets, blinks, eye darts, anticipation, and staggered acting beats for Cog's face.
// A "face" is the face half of a t4.1 rig: {eyeL, eyeR, browL, browR, mouth, cheek}. Everything here is a pure function of time.
import { clamp, lerp, prog, E } from '../../engine/index.mjs';
import { rng, noise1 } from '../../engine/rng.mjs';
import { validateRig, makeRig } from '../t4_1_vector-mascot-design/module.mjs';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ emotion presets
const eye = (o = {}) => ({ open: 1, lx: 0, ly: 0, tilt: 0, lower: 0, size: 1, pupil: 1, ...o });
const brow = (o = {}) => ({ y: 0, tilt: 0, x: 0, ...o });
const mouth = (o = {}) => ({ w: 1, open: 0, smile: 0, round: 0, tongue: 0, teeth: 0, ...o });
/** Build a face record. e / eL / eR: eye overrides (eL, eR win over e). b / bL / bR the same for brows. @returns {{eyeL:object,eyeR:object,browL:object,browR:object,mouth:object,cheek:number}} */
export function face({ e = {}, eL, eR, b = {}, bL, bR, m = {}, cheek = 0.6 } = {}) {
  return { eyeL: eye({ ...e, ...eL }), eyeR: eye({ ...e, ...eR }), browL: brow({ ...b, ...bL }), browR: brow({ ...b, ...bR }), mouth: mouth(m), cheek };
}
/**
 * The 12 emotions. Parameters follow t4.1: brow tilt + = angry (inner end down), - = worried (inner end up); eye lower = happy squint;
 * mouth smile -1..1. Read them with readFace() to check what a custom face says.
 */
export const EMOTIONS = {
  neutral: face({ m: { smile: 0.25 }, cheek: 0.5 }),
  happy: face({ e: { lower: 0.25 }, b: { y: -0.03 }, m: { smile: 0.8, open: 0.2 }, cheek: 0.85 }),
  joy: face({ e: { lower: 0.42, open: 0.95 }, b: { y: -0.06 }, m: { smile: 1, open: 0.78, tongue: 0.6, w: 1.15 }, cheek: 1 }),
  sad: face({ e: { open: 0.72, ly: 0.3, pupil: 1.25, size: 0.95 }, b: { y: 0.03, tilt: -0.45 }, m: { smile: -0.8, open: 0.08, w: 0.85 }, cheek: 0.1 }),
  angry: face({ e: { tilt: 0.45, open: 0.8, pupil: 0.8 }, b: { y: 0.03, tilt: 0.5 }, m: { smile: -0.55, open: 0.32, teeth: 0.7, w: 0.95 }, cheek: 0 }),
  surprise: face({ e: { size: 1.2, pupil: 0.65 }, b: { y: -0.11 }, m: { open: 0.85, round: 0.9, smile: 0, w: 0.9 }, cheek: 0.3 }),
  scared: face({ e: { size: 1.15, pupil: 0.6, ly: -0.15 }, b: { y: -0.07, tilt: -0.4 }, m: { open: 0.4, smile: -0.6, w: 0.8 }, cheek: 0 }),
  think: face({ e: { open: 0.9, lx: 0.55, ly: -0.55 }, bL: { y: -0.08, tilt: -0.2 }, bR: { y: 0.02, tilt: 0.18 }, m: { smile: -0.1, w: 0.8 }, cheek: 0.3 }),
  smug: face({ e: { open: 0.62, lower: 0.12 }, bL: { y: -0.05, tilt: -0.1 }, bR: { y: 0.0, tilt: 0.12 }, m: { smile: 0.75, w: 0.9 }, cheek: 0.5 }),
  sleepy: face({ e: { open: 0.28 }, b: { y: 0.05 }, m: { smile: 0.05, open: 0.18, round: 0.35, w: 0.85 }, cheek: 0.6 }),
  confused: face({ eL: { size: 0.9 }, eR: { size: 1.1 }, bL: { y: -0.08, tilt: -0.3 }, bR: { y: 0.03, tilt: 0.3 }, m: { smile: -0.3, round: 0.2, open: 0.2, w: 0.85 }, cheek: 0.3 }),
  determined: face({ e: { open: 0.82, tilt: 0.25 }, b: { y: 0.02, tilt: 0.3 }, m: { smile: 0.2, w: 0.85 }, cheek: 0.3 }),
};
const clone = f => JSON.parse(JSON.stringify(f));
/** Blend two faces. k may go below 0 or above 1 (an overshoot gives a pop). Numbers lerp, nested objects lerp field by field. */
export function blendFace(a, b, k) {
  const out = {};
  for (const key of Object.keys(a)) out[key] = typeof a[key] === 'object' ? Object.fromEntries(Object.keys(a[key]).map(f => [f, lerp(a[key][f], b[key][f], k)])) : lerp(a[key], b[key], k);
  return out;
}
/** A named emotion at an intensity. 0 = neutral, 1 = the preset, up to 1.3 = exaggerated (the art is clamped to a safe range). @param {string|object} emo @param {number} [intensity] */
export function faceFor(emo, intensity = 1) {
  const target = typeof emo === 'string' ? EMOTIONS[emo] : emo; if (!target) throw new Error(`unknown emotion ${emo}`);
  const f = blendFace(EMOTIONS.neutral, target, intensity); return validateFace(f);
}
/** Clamp a face to the ranges the art can hold (uses t4.1 validateRig). Returns the same object. */
export function validateFace(f) { const r = validateRig({ ...makeRig(), ...f }); for (const k of Object.keys(f)) f[k] = r[k]; return f; }
/** Copy a face onto a rig. Returns the rig. Eye gaze (lx, ly) is kept from the face unless `keepGaze` is set. */
export function applyFace(rig, f, { keepGaze = false } = {}) {
  for (const k of ['eyeL', 'eyeR']) { const g = keepGaze ? { lx: rig[k].lx, ly: rig[k].ly } : {}; rig[k] = { ...rig[k], ...f[k], ...g }; }
  for (const k of ['browL', 'browR']) rig[k] = { ...rig[k], ...f[k] };
  rig.mouth = { ...rig.mouth, ...f.mouth }; rig.cheek = f.cheek; return rig;
}
/**
 * What a face says, as two numbers from -1 to 1. valence = pleasant or not, arousal = calm or charged. Use it to check a custom face before
 * rendering it: if it does not read as the quadrant you meant, change the face, not the reading.
 * valence = 0.75 smile + 0.35 lower lid - 0.8 |brow tilt|; arousal = 1.5 (eye openness x size - 0.9) + 0.9 mouth open + 2.4 (-brow height) + 0.7 (|brow tilt| + |eye tilt|) .
 * @param {{eyeL:object,eyeR:object,browL:object,browR:object,mouth:object}} f @returns {{valence:number, arousal:number}}
 */
export function readFace(f) {
  const av = (a, b, k) => (a[k] + b[k]) / 2, op = (f.eyeL.open * f.eyeL.size + f.eyeR.open * f.eyeR.size) / 2, bt = av(f.browL, f.browR, 'tilt'), by = av(f.browL, f.browR, 'y');
  const valence = 0.75 * f.mouth.smile + 0.35 * av(f.eyeL, f.eyeR, 'lower') - 0.8 * Math.abs(bt) - 0.5 * Math.abs(av(f.eyeL, f.eyeR, 'tilt'));
  const arousal = 1.5 * (op - 0.9) + 0.9 * f.mouth.open * (1 + 0.5 * f.mouth.round) + 2.4 * -by + 0.7 * (Math.abs(bt) + Math.abs(av(f.eyeL, f.eyeR, 'tilt')));
  return { valence: clamp(valence, -1, 1), arousal: clamp(arousal, -1, 1) };
}

// ------------------------------------------------------------------ blinks
/**
 * Deterministic blink times between t0 and t1 (seconds). Gaps are 2.2 to 5.0 s; 15 percent of blinks are doubles (a second blink 0.28 s later).
 * People blink about every 3 to 4 s; much faster looks nervous, much slower looks like a stare.
 * @param {number|string} seed @param {number} t0 @param {number} t1 @returns {number[]}
 */
export function blinkTimes(seed, t0, t1) {
  const r = rng(seed), out = []; let t = t0 + r.range(0.8, 2.2);
  while (t < t1) { out.push(t); if (r() < 0.15) out.push(t + 0.28); t += r.range(2.2, 5.0); }
  return out;
}
/**
 * How closed the eyes are (0 open, 1 shut) at time t for a list of blink times. Shape: closes in 0.06 s (inQuad: falls fast), stays shut 0.03 s,
 * opens in 0.11 s (outQuad: eases back). Total 0.20 s = 6 frames at 30 fps. Opening slower than closing is what makes it look alive.
 */
export function blinkAmount(t, times, { close = 0.06, hold = 0.03, open = 0.11 } = {}) {
  for (const b of times) {
    const u = t - b; if (u < 0 || u > close + hold + open) continue;
    if (u < close) return E.inQuad(u / close); if (u < close + hold) return 1; return 1 - E.outQuad((u - close - hold) / open);
  }
  return 0;
}
/** Put a blink amount on a rig's eyes: open = min(open, 1 - closed). Keeps any lid tilt. Returns the rig. */
export function applyBlink(rig, closed) { for (const k of ['eyeL', 'eyeR']) rig[k].open = Math.min(rig[k].open, 1 - clamp(closed)); return rig; }

// ------------------------------------------------------------------ gaze
/**
 * Eye darts. keys = [[t, lx, ly], ...] (-1..1). Each change is a saccade: 0.08 s with outCubic (eyes snap, then settle); between darts the eyes
 * hold with a tiny drift (+-0.02, deterministic noise) so they are never dead. Returns f(t) -> {lx, ly}.
 * @param {Array<[number,number,number]>} keys @param {{dur?:number, drift?:number, seed?:number}} [o]
 */
export function gaze(keys, { dur = 0.08, drift = 0.02, seed = 7 } = {}) {
  return t => {
    let i = -1; for (let n = 0; n < keys.length; n++) if (t >= keys[n][0]) i = n;
    const to = keys[Math.max(i, 0)], from = keys[Math.max(i - 1, 0)], k = i <= 0 ? 1 : E.outCubic(prog(t, to[0], to[0] + dur));
    return { lx: clamp(lerp(from[1], to[1], k) + drift * noise1(t * 1.7, seed), -1, 1), ly: clamp(lerp(from[2], to[2], k) + drift * noise1(t * 1.9, seed + 5), -1, 1) };
  };
}
/** Times of the big gaze shifts (more than `min` of travel) in a gaze key list: people usually blink during a large look. */
export function gazeShiftTimes(keys, min = 0.6) { const out = []; for (let i = 1; i < keys.length; i++) if (Math.hypot(keys[i][1] - keys[i - 1][1], keys[i][2] - keys[i - 1][2]) >= min) out.push(keys[i][0] + 0.02); return out; }
/** The head follows the eyes: a lean (rad) that trails the gaze by `lag` seconds (default 0.12 = 3 to 4 frames) and is smaller than the look. */
export function headFollow(g, t, { lag = 0.12, amount = 0.07 } = {}) { return amount * g(t - lag).lx; }

// ------------------------------------------------------------------ acting beats
/** Per-part start delays. Eyes lead, brows follow 0.04 s (1 frame), the mouth 0.07 s, the cheeks 0.1 s: the face "breaks" in a wave, not all at once. */
export const DELAYS = { eyes: 0, brows: 0.04, mouth: 0.07, cheek: 0.1 };
/**
 * The wind-up version of any face: eyes narrow to 78 percent, brows drop 0.035, the mouth closes most of the way and loses half its smile. Anticipation is relative:
 * whatever the character looked like, it contracts a little before the next big change (like a body dipping before a jump).
 */
export function windUp(f) {
  const o = clone(f);
  for (const k of ['eyeL', 'eyeR']) { o[k].open *= 0.78; o[k].size *= 0.96; }
  for (const k of ['browL', 'browR']) o[k].y += 0.035;
  o.mouth.open *= 0.4; o.mouth.smile *= 0.5; return validateFace(o);
}
/**
 * An acting beat: {t: when the new emotion STARTS to appear (s), emo: preset name or a face, int: intensity 0..1.3, dur: seconds to arrive (0.12-0.25),
 * ease: 'outBack' | 'outCubic' ..., anticipate: seconds of wind-up before t (0 = none, 0.12 typical), pop: body hop in units (0 = none)}.
 * Beats must be at least `dur` apart (checkBeats).
 * @typedef {{t:number, emo:string|object, int?:number, dur?:number, ease?:string, anticipate?:number, pop?:number}} Beat
 */
/** @param {Beat} b */
const target = b => faceFor(b.emo, b.int ?? 1);
/**
 * The face at time t for a list of beats. Before the first beat it is neutral. During a beat each part arrives with its own delay (DELAYS) and the
 * beat's ease; outBack makes the reaction overshoot and settle. During the 'anticipate' window before a beat the face winds up (windUp).
 * @param {number} t @param {Beat[]} beats sorted by t @returns {object} a face
 */
export function actFace(t, beats) {
  let i = -1; for (let n = 0; n < beats.length; n++) if (t >= beats[n].t) i = n;
  const prev = i >= 0 ? target(beats[i]) : clone(EMOTIONS.neutral);
  const nx = beats[i + 1];
  if (nx && nx.anticipate && t >= nx.t - nx.anticipate) { // wind-up before the next beat
    const a = E.outCubic(prog(t, nx.t - nx.anticipate, nx.t)); return blendFace(prev, windUp(prev), a);
  }
  if (i < 0) return prev;
  const b = beats[i], from = i > 0 ? target(beats[i - 1]) : clone(EMOTIONS.neutral), to = target(b), dur = b.dur ?? 0.18, ease = E[b.ease || 'outCubic'] || E.outCubic;
  const wind = b.anticipate ? windUp(from) : from, out = {};
  const kFor = part => ease(prog(t, b.t + DELAYS[part], b.t + DELAYS[part] + dur));
  const parts = { eyeL: 'eyes', eyeR: 'eyes', browL: 'brows', browR: 'brows' };
  for (const key of Object.keys(to)) {
    const k = key === 'mouth' ? kFor('mouth') : key === 'cheek' ? kFor('cheek') : kFor(parts[key]);
    out[key] = typeof to[key] === 'object' ? Object.fromEntries(Object.keys(to[key]).map(f => [f, lerp(wind[key][f], to[key][f], k)])) : lerp(wind[key], to[key], k);
  }
  return validateFace(out);
}
/**
 * Body motion that goes with the beats: a small squat during the wind-up and a damped hop (`pop`) on the reaction.
 * Returns {y, sy, sx} offsets to ADD to the body pose (y in units, down = +). Pure function of t.
 */
export function actBody(t, beats) {
  let y = 0, sy = 0;
  for (const b of beats) {
    if (b.anticipate && t >= b.t - b.anticipate && t < b.t) { const a = E.outCubic(prog(t, b.t - b.anticipate, b.t)); y += 0.05 * a; sy -= 0.05 * a; }
    if (b.pop && t >= b.t) { const u = t - b.t; y -= b.pop * Math.exp(-4.5 * u) * Math.abs(Math.sin(Math.PI * u / 0.3)); sy += 0.5 * b.pop * Math.exp(-4.5 * u) * Math.abs(Math.sin(Math.PI * u / 0.3)); }
  }
  return { y, sy, sx: -sy * 0.8 };
}
/** Problems with a beat list: unsorted, beats closer than their dur, unknown emotions. Returns an array of messages (empty = fine). @param {Beat[]} beats */
export function checkBeats(beats) {
  const bad = [];
  beats.forEach((b, i) => {
    if (typeof b.emo === 'string' && !EMOTIONS[b.emo]) bad.push(`beat ${i}: unknown emotion ${b.emo}`);
    if (i && b.t < beats[i - 1].t + (beats[i - 1].dur ?? 0.18) + 0.2) bad.push(`beat ${i} starts ${(b.t - beats[i - 1].t).toFixed(2)} s after beat ${i - 1}: needs about ${((beats[i - 1].dur ?? 0.18) + 0.2).toFixed(2)} s for the first face to read`);
    if (b.anticipate && i && b.t - b.anticipate < beats[i - 1].t + (beats[i - 1].dur ?? 0.18)) bad.push(`beat ${i}: anticipation starts before beat ${i - 1} has arrived`);
  });
  return bad;
}
export { TAU };
