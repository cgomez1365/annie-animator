// Annie engine: keyframe tracks, beat sequences, staggers and page slides. All times in seconds.
import { E, clamp, prog, lerp, mix } from './ease.mjs';

const fn = e => (typeof e === 'function' ? e : E[e] || E.linear);

/**
 * A value over time from keyframes. Each key is [t, value, easeName?]; the ease is used on the segment ARRIVING at that key
 * (so [[0,0],[0.6,1,'outBack']] overshoots on its way into 1). Before the first key the value holds; after the last it holds.
 * Values may be numbers or '#rrggbb' colours (colours return 'rgb(...)').
 * @param {Array<[number, number|string, (string|Function)?]>} keys sorted by time
 * @param {{ease?:string|Function}} [o] default ease for keys without one
 * @returns {(t:number)=>number|string}
 */
export function track(keys, o = {}) {
  const def = o.ease || 'linear';
  return t => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1, e] = keys[i], k = fn(e || def)(prog(t, t0, t1));
        return typeof v0 === 'string' ? mix(v0, v1, clamp(k)) : lerp(v0, v1, k);
      }
    }
    return keys[keys.length - 1][1];
  };
}

/**
 * Lay beats end to end. items: [name, duration, overlap?]. overlap > 0 starts the beat that many seconds BEFORE the previous
 * one ends; overlap < 0 leaves a gap. Returns { beats: {name:{s,e,d}}, end }.
 * Example: sequence([['hook',1.8],['panel',3,0.1],['closer',3,0.2]]) -> panel starts at 1.7, closer at 4.5.
 * @param {Array<[string, number, number?]>} items @param {{t0?:number}} [o]
 */
export function sequence(items, { t0 = 0 } = {}) {
  const beats = {}; let cur = t0, end = t0;
  items.forEach(([name, d, overlap = 0], i) => {
    const s = i === 0 ? t0 : cur - overlap; beats[name] = { s, e: s + d, d }; cur = s + d; end = Math.max(end, cur);
  });
  return { beats, end };
}

/**
 * Staggered starts: n items, item i starts at t0 + i * gap and lasts dur. Returns [{s,e,i}].
 * Use gap 0.06-0.15 s for lists, 0.03-0.05 for grids. @param {number} n @param {number} t0 @param {number} gap @param {number} dur
 */
export const stagger = (n, t0, gap, dur) => Array.from({ length: n }, (_, i) => ({ i, s: t0 + i * gap, e: t0 + i * gap + dur }));

/** Eased 0..1 progress of an item {s,e} at time t: k(t, beat, 'outBack') . */
export const k = (t, b, ease = 'outCubic') => fn(ease)(prog(t, b.s, b.e));

/**
 * A mutable timeline with named beats, for readable cards.
 *   const tl = timeline(); tl.add('hook', 0, 1.7); tl.after('hook', 'panel', 3.0, { overlap: 0.1 });
 *   tl.k('panel', t, 'outBack')  // eased 0..1;  tl.has('panel', t)  // inside the beat
 */
export function timeline() {
  const b = {};
  const api = {
    beats: b,
    /** Add a beat at an absolute start. */
    add(name, s, d) { b[name] = { s, e: s + d, d }; return api; },
    /** Add a beat that starts when `prev` ends (minus overlap). */
    after(prev, name, d, { overlap = 0 } = {}) { return api.add(name, b[prev].e - overlap, d); },
    /** Add a beat that starts together with `other` (plus delay). */
    with(other, name, d, { delay = 0 } = {}) { return api.add(name, b[other].s + delay, d); },
    get: name => b[name],
    /** Eased progress of a named beat. */
    k: (name, t, ease = 'outCubic') => fn(ease)(prog(t, b[name].s, b[name].e)),
    /** True while t is inside the beat. */
    has: (name, t) => t >= b[name].s && t <= b[name].e,
    /** Names of beats that are active at t. */
    active: t => Object.keys(b).filter(n => t >= b[n].s && t <= b[n].e),
    /** Latest end of any beat. */
    get end() { return Math.max(0, ...Object.values(b).map(x => x.e)); },
  };
  return api;
}

/**
 * The tt10 page slide. Content slides in over inDur (outCubic) and out over the last outDur (inCubic).
 * Returns null outside [s,e]; otherwise { a: alpha 0..1, dx: horizontal offset in px (+ = still to the right, - = leaving left) }.
 * Apply as: ctx.globalAlpha *= p.a; ctx.translate(p.dx, 0).
 * @param {number} t @param {{s:number,e:number,inDur?:number,outDur?:number,dist?:number}} p
 */
export function page(t, { s, e, inDur = 0.4, outDur = 0.35, dist = 160 }) {
  if (t < s || t > e) return null;
  const i = E.outCubic(prog(t, s, s + inDur)), o = E.inCubic(prog(t, e - outDur, e));
  return { a: Math.min(i, 1 - o), dx: dist * (1 - i) - dist * o, i, o };
}
/**
 * Consecutive page windows that overlap (the next starts before the last one ends, default 0.1 s).
 * pages([3.1, 4.75, 3.7], { t0: 1.9 }) -> [{s:1.9,e:5.0},{s:4.9,e:9.65},{s:9.55,e:13.25}] (these are tt10's pages).
 */
export function pages(durs, { t0 = 0, overlap = 0.1 } = {}) {
  const out = []; let s = t0;
  for (const d of durs) { out.push({ s, e: s + d }); s = s + d - overlap; }
  return out;
}

/** 0..1 saw that repeats every `period` seconds (phase 0..1 shifts it). Use it to loop markers: E.inOutCubic(loop(t, 1.6)). */
export const loop = (t, period, phase = 0) => (((t / period + phase) % 1) + 1) % 1;
/** Smooth pulse 0..1 at `freq` Hz: 0.5 + 0.5 sin. For meters and glows. */
export const pulse = (t, freq = 1, phase = 0) => 0.5 + 0.5 * Math.sin(2 * Math.PI * (t * freq + phase));
/** Square blink: true for `duty` of each period. For cursors (period 1.06, duty 0.55). */
export const blink = (t, period = 1.06, duty = 0.55) => loop(t, period) < duty;
