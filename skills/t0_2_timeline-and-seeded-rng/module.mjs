// t0.2 timeline-and-seeded-rng: seeded scatter fields, organic jitter, stagger orders and beat charts.
// Everything here is a pure function of (seed, t): same inputs, same pixels, in any frame order.
import { rng, noise1, shuffle } from '../../engine/rng.mjs';
import { sequence, stagger } from '../../engine/timeline.mjs';
import { E, prog, lerp } from '../../engine/ease.mjs';

/**
 * Build a field of pieces once (module level, not per frame). Each piece has a home, a fly-away velocity and a spin,
 * all drawn from rng(seed) in a fixed order, so the field is identical on every render.
 * @param {number|string} seed @param {number} n @param {{box:[number,number,number,number],speed?:[number,number],size?:[number,number]}} o
 * box = [x0,y0,x1,y1] where homes are placed
 * @returns {{id:number,hx:number,hy:number,vx:number,vy:number,spin:number,size:number,phase:number,hue:number}[]}
 */
export function scatterField(seed, n, { box, speed = [300, 900], size = [18, 30] }) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, id) => {
    const ang = r.range(0, Math.PI * 2), sp = r.range(speed[0], speed[1]);
    return { id, hx: r.range(box[0], box[2]), hy: r.range(box[1], box[3]), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 150, spin: r.range(-6, 6), size: r.range(size[0], size[1]), phase: r.range(0, 100), hue: r.int(0, 3) };
  });
}

/**
 * Small organic shake: smooth noise, never random per frame. Each piece should pass its own phase.
 * @param {number} t @param {number} phase per-piece offset @param {number} [amp=4] px @param {number} [freq=3] wobbles per second
 * @returns {[number,number]} [dx, dy]
 */
export function jitter(t, phase, amp = 4, freq = 3) { return [amp * noise1(t * freq + phase, 1), amp * noise1(t * freq + phase + 50, 2)]; }

/**
 * Where a piece is at scatter progress k (0 = home, 1 = flown away, usually E.inCubic of a time window).
 * Spins and flies along its own velocity. @param {*} piece from scatterField @param {number} k @param {number} t
 * @returns {{x:number,y:number,rot:number}}
 */
export function scatterPose(piece, k, t, { shake = 4 } = {}) {
  const [dx, dy] = jitter(t, piece.phase, shake * (1 - k)), g = 400 * k * k; // a little gravity so it arcs
  return { x: piece.hx + dx + piece.vx * k, y: piece.hy + dy + piece.vy * k + g, rot: piece.spin * k + 0.08 * noise1(t * 2 + piece.phase, 3) * (1 - k) };
}

/**
 * Looping scatter schedule for a card: shake at home, fly away, hold, come back. Returns k (0 home .. 1 away) at time t.
 * @param {number} t @param {number} t0 loop start @param {{period?:number,away?:[number,number],back?:[number,number]}} [o] times inside the period
 */
export function scatterLoop(t, t0, { period = 3.2, away = [1.0, 1.7], back = [2.4, 3.2] } = {}) {
  const u = ((t - t0) % period + period) % period;
  return E.inCubic(prog(u, away[0], away[1])) * (1 - E.outCubic(prog(u, back[0], back[1])));
}

/**
 * Stagger start times in a chosen order. mode: 'forward' | 'reverse' | 'center' (middle first) | 'random' (seeded).
 * @param {number} n @param {number} t0 @param {number} gap seconds between starts @param {number} dur each lasts
 * @param {'forward'|'reverse'|'center'|'random'} [mode] @param {number|string} [seed]
 * @returns {{i:number,s:number,e:number}[]} item i with its own window (index = the item, not the order)
 */
export function staggerOrder(n, t0, gap, dur, mode = 'forward', seed = 1) {
  const slots = stagger(n, t0, gap, dur);
  const order = mode === 'reverse' ? [...Array(n).keys()].reverse()
    : mode === 'center' ? [...Array(n).keys()].sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b)
    : mode === 'random' ? shuffle(rng(seed), [...Array(n).keys()]) : [...Array(n).keys()];
  const out = new Array(n); order.forEach((item, slot) => { out[item] = { i: item, s: slots[slot].s, e: slots[slot].e }; }); return out;
}

/**
 * A beat chart: lay named beats end to end with overlaps, then scale to a pixel width.
 * @param {Array<[string, number, number?]>} items [name, dur, overlap?] as engine sequence
 * @param {{x0:number,width:number}} o
 * @returns {{name:string,s:number,e:number,x:number,w:number}[]}
 */
export function beatChart(items, { x0, width }) {
  const { beats, end } = sequence(items), px = width / end;
  return Object.entries(beats).map(([name, b]) => ({ name, s: b.s, e: b.e, x: x0 + b.s * px, w: (b.e - b.s) * px }));
}

/** A short fingerprint of a field (rounded coordinates): equal fields give equal strings. Use in tests. @param {*[]} field @returns {string} */
export function fingerprint(field) { return field.map(p => [p.hx, p.hy, p.vx, p.vy].map(v => Math.round(v)).join(',')).join(';'); }

export { lerp };
