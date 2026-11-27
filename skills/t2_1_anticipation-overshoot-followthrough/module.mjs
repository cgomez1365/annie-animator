// t2.1 anticipation-overshoot-followthrough: the classic principles as numbers you can ask for.
// A "kick" = a short pull back (anticipation), a fast move that overshoots, a spring settle. Pure functions of t.
import { E, prog, clamp } from '../../engine/ease.mjs';
import { springState, followThrough } from '../../engine/spring.mjs';

export const FPS = 30;

/**
 * House recipes per object type. antic and settle are FRAMES at 30 fps (3-8 and 12-20); anticAmt = pull-back as a
 * fraction of the travel; overshoot = fraction of the travel the object runs past the target.
 * @type {Record<string,{antic:number,anticAmt:number,overshoot:number,settle:number,use:string}>}
 */
export const RECIPES = {
  button:  { antic: 3, anticAmt: 0.06, overshoot: 0.12, settle: 12, use: 'buttons, chips, small tags: snappy' },
  card:    { antic: 4, anticAmt: 0.05, overshoot: 0.10, settle: 15, use: 'cards, tiles, list rows: the default' },
  toast:   { antic: 5, anticAmt: 0.04, overshoot: 0.08, settle: 16, use: 'banners and toasts sliding in from an edge' },
  badge:   { antic: 5, anticAmt: 0.10, overshoot: 0.15, settle: 18, use: 'badges, stamps, hero icons: big and playful' },
  panel:   { antic: 8, anticAmt: 0.03, overshoot: 0.08, settle: 20, use: 'big heavy panels and windows: slow and weighty' },
};

/**
 * Spring constants {k, c} that give a given peak overshoot (fraction of the spring's own travel) and a 1 percent settle time.
 * zeta comes from the overshoot formula; omega is found by bisection on the real spring so the settle time is measured, not guessed.
 * @param {number} overshoot 0.02-0.4 @param {number} settleSec seconds to stay within 1 percent
 * @returns {{k:number,c:number,zeta:number,omega:number}}
 */
const SF = new Map();
export function springFor(overshoot, settleSec) {
  const key = `${overshoot}|${settleSec}`; if (SF.has(key)) return SF.get(key);
  const L = Math.log(Math.max(overshoot, 1e-4)), zeta = -L / Math.sqrt(Math.PI * Math.PI + L * L);
  const settleAt = w => { let last = 0; for (let t = 0; t < 6; t += 0.004) if (Math.abs(springState(t, { from: 0, to: 1, k: w * w, c: 2 * zeta * w })[0] - 1) > 0.01) last = t; return last + 0.004; };
  let lo = 2, hi = 200; // settle time falls as omega rises
  for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (settleAt(mid) > settleSec) lo = mid; else hi = mid; }
  const omega = (lo + hi) / 2, res = { k: omega * omega, c: 2 * zeta * omega, zeta, omega }; SF.set(key, res); return res;
}

/** Resolve a recipe name or an options object into full kick options (frames converted to seconds). */
function resolve(o) {
  const r = typeof o.recipe === 'string' ? RECIPES[o.recipe] : null;
  if (typeof o.recipe === 'string' && !r) throw new Error(`unknown recipe ${o.recipe}`);
  const m = { antic: 4, anticAmt: 0.05, overshoot: 0.10, settle: 15, ...(r || {}), ...o };
  const anticSec = m.antic / FPS, settleSec = m.settle / FPS, os = m.overshoot / (1 + m.anticAmt); // spring starts from the pulled-back point
  return { ...m, anticSec, settleSec, sp: springFor(Math.max(os, 0.005), settleSec) };
}

/**
 * Position of an object that anticipates, then flies to `to`, overshoots and settles. Start at t0.
 * Phases: t0 .. t0+antic: eases backwards by anticAmt*travel (inOutSine, ends at rest); then a spring released from there.
 * @param {number} t seconds
 * @param {{t0:number,from:number,to:number,recipe?:keyof typeof RECIPES,antic?:number,anticAmt?:number,overshoot?:number,settle?:number}} o
 * @returns {number}
 */
export function kick(t, o) {
  const m = resolve(o), D = o.to - o.from, xa = o.from - m.anticAmt * D;
  if (t <= o.t0) return o.from;
  if (t < o.t0 + m.anticSec) return o.from + (xa - o.from) * E.inOutSine(prog(t, o.t0, o.t0 + m.anticSec));
  return springState(t - o.t0 - m.anticSec, { from: xa, to: o.to, k: m.sp.k, c: m.sp.c })[0];
}

/** Times of a kick: when the pull-back ends, when the peak lands, when it has settled. @returns {{release:number,settled:number,spring:{k:number,c:number}}} */
export function kickTimes(o) { const m = resolve(o); return { release: o.t0 + m.anticSec, settled: o.t0 + m.anticSec + m.settleSec, spring: { k: m.sp.k, c: m.sp.c } }; }

/**
 * Measure any 1-D motion curve that goes from `from` to `to`: this is what the test reports.
 * @param {(t:number)=>number} fn @param {{from:number,to:number,t0:number,tEnd:number}} o
 * @returns {{anticPct:number,anticFrames:number,overshootPct:number,peakFrames:number,settleFrames:number,maxSpeed:number}}
 */
export function measure(fn, { from, to, t0, tEnd }) {
  const dt = 1 / 480, D = Math.abs(to - from), sgn = Math.sign(to - from) || 1;
  let minS = 0, tMin = t0, maxS = 0, tMax = t0, settle = t0, prev = from, maxV = 0;
  for (let t = t0; t <= tEnd; t += dt) {
    const x = fn(t), s = (x - from) * sgn; maxV = Math.max(maxV, Math.abs(x - prev) / dt); prev = x;
    if (s < minS) { minS = s; tMin = t; } // deepest pull-back
    if (s > maxS) { maxS = s; tMax = t; } // furthest forward point
    if (Math.abs(x - to) > 0.01 * D) settle = t;
  }
  return { anticPct: (-minS / D) * 100, anticFrames: (tMin - t0) * FPS, overshootPct: Math.max(0, (maxS - D) / D) * 100, peakFrames: (tMax - t0) * FPS, settleFrames: (settle - t0) * FPS, maxSpeed: maxV };
}

/**
 * Overlapping action: offset (px) of layer i behind a moving leader. Children trail the card by 2 frames each, then catch up.
 * driver must be a STABLE function (declare it once at module level) because it is cached by identity.
 * @param {number} t @param {(t:number)=>number} driver leader position @param {number} i layer index 0,1,2...
 * @param {{step?:number,amt?:number,k?:number,c?:number}} [o] step = extra delay per layer (s), amt = how much of the lag to show (0..1)
 */
export function overlap(t, driver, i, { step = 0.066, amt = 0.25, k = 140, c = 13 } = {}) {
  return amt * (followThrough(t, driver, { delay: step * (i + 1), k, c }) - driver(t));
}

/** Velocity of a curve (units per second), central difference. */
export const velocity = (fn, t, h = 1 / 240) => (fn(t + h) - fn(t - h)) / (2 * h);

/**
 * Drag as a tilt: a body moving right leans back (negative rotation); it levels out as it stops. Returns radians.
 * @param {(t:number)=>number} fn position @param {number} t @param {{gain?:number,max?:number}} [o] gain rad per px/s, max rad (0.12 = about 7 degrees)
 */
export function lean(fn, t, { gain = 0.00006, max = 0.12 } = {}) { return clamp(-velocity(fn, t) * gain, -max, max); }
