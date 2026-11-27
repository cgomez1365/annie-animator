// t0.1 easing-and-springs: motion recipes on top of the engine's easings and springs.
// A recipe = which curve + how long for one job. Cards ask for a job ("enter", "pop"), not a raw curve.
import { E, prog, lerp } from '../../engine/ease.mjs';
import { spring, springPath, SPRING } from '../../engine/spring.mjs';

/**
 * Standard motion recipes. dur = seconds. `ease` is a name in E. Values are the house defaults from the tt10 cards.
 * @type {Record<string,{ease:string,dur:number,s?:number,use:string}>}
 */
export const RECIPES = {
  enter:   { ease: 'outCubic',   dur: 0.4,  use: 'anything arriving: panels, rows, fades in' },
  exit:    { ease: 'inCubic',    dur: 0.3,  use: 'anything leaving' },
  pop:     { ease: 'outBack',    dur: 0.5, s: 1.7, use: 'chips, bubbles, buttons landing (overshoot about 10 percent)' },
  bigpop:  { ease: 'outBack',    dur: 0.6, s: 2.4, use: 'a hero object, a badge (overshoot about 18 percent)' },
  slam:    { ease: 'outElastic', dur: 0.8,  use: 'stamps, verdict marks (crosses the target about 7 times)' },
  marker:  { ease: 'inOutCubic', dur: 0.9,  use: 'cursors and markers travelling A to B' },
  breathe: { ease: 'inOutSine',  dur: 1.6,  use: 'glow or scale pulses, loop it' },
  scatter: { ease: 'inCubic',    dur: 0.4,  use: 'objects flying away: they accelerate' },
};

/**
 * Eased 0..1 progress of a recipe that starts at t0. Example: x = lerp(a, b, play(t, 1.2, 'pop')).
 * @param {number} t @param {number} t0 start time (s) @param {keyof typeof RECIPES} name @param {{dur?:number,s?:number}} [o] overrides
 * @returns {number}
 */
export function play(t, t0, name, o = {}) {
  const r = RECIPES[name]; if (!r) throw new Error(`unknown recipe ${name}`);
  const k = prog(t, t0, t0 + (o.dur ?? r.dur)), s = o.s ?? r.s;
  return s !== undefined ? E[r.ease](k, s) : E[r.ease](k);
}

/** Seconds into a drop when an outBack(s) first reaches its target: the moment of impact. @param {number} dur @param {number} [s=1.5] */
export function impactTime(dur, s = 1.5) { let u = 0; while (E.outBack(u, s) < 1 && u < 1) u += 0.0005; return u * dur; }

/**
 * An object that falls and lands: outBack carries it past the floor and back (the bounce), a spring squashes it at impact.
 * Returns { y, squash, impact } where squash is 0 normally and about 0.2 at impact; draw with scale(1+0.9*squash, 1-squash)
 * and translate down by half the object's height times squash so its bottom stays on the floor.
 * @param {number} t @param {{t0:number,from:number,to:number,dur?:number,s?:number}} o
 * @returns {{y:number,squash:number,impact:number}}
 */
export function drop(t, { t0, from, to, dur = 0.8, s = 1.5 }) {
  const impact = t0 + impactTime(dur, s), y = lerp(from, to, E.outBack(prog(t, t0, t0 + dur), s));
  return { y, impact, squash: t > impact ? spring(t - impact, { from: 0.2, to: 0, k: 420, c: 13 }) : 0 };
}

/**
 * Which recipe to use for a plain-language job. Falls back to 'enter'.
 * @param {string} job e.g. 'pill lands', 'text appears', 'cursor moves', 'leaves the screen'
 * @returns {keyof typeof RECIPES}
 */
export function recipeFor(job) {
  const j = job.toLowerCase();
  if (/stamp|verdict|slam/.test(j)) return 'slam';
  if (/hero|badge|logo/.test(j)) return 'bigpop';
  if (/land|pop|bubble|chip|button|bounce/.test(j)) return 'pop';
  if (/leave|exit|fly|scatter|away|disappear/.test(j)) return j.includes('scatter') || j.includes('fly') ? 'scatter' : 'exit';
  if (/cursor|marker|travel|move|slide between/.test(j)) return 'marker';
  if (/pulse|glow|breath|idle/.test(j)) return 'breathe';
  return 'enter';
}

/**
 * A spring value that retargets on a schedule (legs), starting at 0: the spring lane of the demo. Engine springPath with a preset.
 * @param {number} t @param {number} t0 first target time @param {number} legDur seconds between targets @param {number[]} values targets in order
 * @param {{k:number,c:number}} [preset] default SPRING.bouncy
 */
export function springLegs(t, t0, legDur, values, preset = SPRING.bouncy) {
  return springPath(t, values.map((v, i) => ({ t: t0 + i * legDur, v })), { from: 0, ...preset });
}

/**
 * Sample an easing for plotting or testing. @param {string} name key of E @param {number} [n=20] @returns {number[]} n+1 values at t = 0..1
 */
export function sampleCurve(name, n = 20) { return Array.from({ length: n + 1 }, (_, i) => E[name](i / n)); }

/**
 * Peak overshoot of a curve as a fraction of travel (0.1 = 10 percent past the target). @param {string} name @returns {number}
 */
export function overshoot(name) { return Math.max(0, Math.max(...sampleCurve(name, 400)) - 1); }
