// t2.2 squash-and-stretch: volume-preserving deformation for landings, taps and pops.
// Rule: width x height stays 1 (sx * sy = 1). Squash = flat and wide. Stretch = tall and thin. Always with limits.
import { E, prog, clamp, lerp } from '../../engine/ease.mjs';
import { springState } from '../../engine/spring.mjs';

/**
 * Limits per object type: max squash (how flat, as a loss of height, 0.3 = sy 0.7) and max stretch (gain of height).
 * Text is kept small so it stays readable; rigid things (cards) hardly deform; jelly (badges, balls) deform a lot.
 * @type {Record<string,{squash:number,stretch:number,use:string}>}
 */
export const LIMITS = {
  text:   { squash: 0.10, stretch: 0.12, use: 'words and numbers: keep it readable' },
  card:   { squash: 0.12, stretch: 0.10, use: 'cards and panels: rigid, only a hint' },
  button: { squash: 0.10, stretch: 0.08, use: 'taps and presses' },
  badge:  { squash: 0.25, stretch: 0.25, use: 'badges, stamps, icons, chips popping in' },
  ball:   { squash: 0.30, stretch: 0.30, use: 'balls and blobs: the full cartoon range' },
};
/** Absolute ceiling for any shape: sy never below 0.70 or above 1.40. Beyond this it looks like rubber. */
export const HARD = { minSy: 0.70, maxSy: 1.40 };

/**
 * Turn a signed amount into a volume-preserving scale pair. amount > 0 squashes (flat, wide), < 0 stretches (tall, thin).
 * @param {number} amount e.g. 0.2 = height 0.8, width 1.25; -0.2 = height 1.2, width 0.833
 * @param {{squash?:number,stretch?:number}|string} [lim] a LIMITS key or {squash, stretch}; clamps the amount
 * @returns {{sx:number,sy:number}}
 */
export function deform(amount, lim = 'ball') {
  const L = typeof lim === 'string' ? LIMITS[lim] : lim, a = clamp(amount, -L.stretch, L.squash), sy = clamp(1 - a, HARD.minSy, HARD.maxSy);
  return { sx: 1 / sy, sy };
}

/**
 * Squash that happens at an impact and springs back with a stretch rebound (the "boing"). Start at t0 = impact time.
 * It returns the SIGNED amount for deform(): positive while squashed, negative while it over-recovers into a stretch, 0 when settled.
 * @param {number} t @param {{t0:number,amount:number,k?:number,c?:number}} o amount = peak squash (0.1-0.3); k, c = spring (defaults settle in about 0.35 s)
 */
export function impactSquash(t, { t0, amount, k = 700, c = 24 }) {
  if (t < t0) return 0;
  return springState(t - t0, { from: amount, to: 0, k, c })[0]; // starts at its peak on the contact frame
}

/**
 * Stretch in flight: proportional to speed, capped. A fast object is taller along its path.
 * @param {number} speed px/s (absolute) @param {{gain?:number,max?:number}} [o] gain = stretch per px/s (0.00015 = 0.15 at 1000 px/s)
 * @returns {number} signed amount for deform(): NEGATIVE (stretch)
 */
export function flightStretch(speed, { gain = 0.00016, max = 0.3 } = {}) { return -Math.min(Math.abs(speed) * gain, max); }

/**
 * A ball bouncing on a floor, exact (no integration): gravity g, restitution e. y is the BOTTOM of the object (it equals floor on contact).
 * At every impact the object stays on the floor for `dwell` seconds (default 0.07 = 2 frames): that is where the squash is seen.
 * @param {number} t @param {{t0:number,y0:number,floor:number,g?:number,e?:number,dwell?:number}} o y grows downward (canvas)
 * @returns {{y:number,vy:number,sinceImpact:number,impactSpeed:number,bounces:number,resting:boolean,contact:boolean,sinceLeave:number}}
 */
export function bounce(t, { t0, y0, floor, g = 3000, e = 0.6, dwell = 0.07 }) {
  const h = floor - y0, tFall = Math.sqrt(2 * Math.max(h, 0) / g), S = { sinceImpact: Infinity, impactSpeed: 0, bounces: 0, resting: false, contact: false, sinceLeave: Infinity };
  if (t <= t0) return { y: y0, vy: 0, ...S };
  let u = t - t0;
  if (u < tFall) return { y: y0 + 0.5 * g * u * u, vy: g * u, ...S };
  let v = g * tFall, n = 0; u -= tFall;
  for (;;) {
    n++; const vOut = v * e, flight = 2 * vOut / g, base = { impactSpeed: v, bounces: n };
    if (u < dwell) return { y: floor, vy: 0, ...base, sinceImpact: u, resting: false, contact: true, sinceLeave: -1 };
    if (vOut < 30 || flight < 1 / 120) return { y: floor, vy: 0, ...base, sinceImpact: u, resting: true, contact: false, sinceLeave: u - dwell };
    const uf = u - dwell;
    if (uf < flight) return { y: floor - (vOut * uf - 0.5 * g * uf * uf), vy: -(vOut - g * uf), ...base, sinceImpact: u, resting: false, contact: false, sinceLeave: uf };
    u = uf - flight; v = vOut;
  }
}

/** Times (seconds) at which a bounce first touches the floor, first `n`. Use them to trigger dust, sound cues and squash. */
export function impactTimes(o, n = 5) {
  const { t0, y0, floor, g = 3000, e = 0.6, dwell = 0.07 } = o; let t = t0 + Math.sqrt(2 * (floor - y0) / g), v = g * (t - t0); const out = [t];
  while (out.length < n) { const vo = v * e, f = 2 * vo / g; if (vo < 30 || f < 1 / 120) break; t += dwell + f; v = vo; out.push(t); }
  return out;
}

/**
 * The finished look of a bouncing object: deformation (sx, sy) for this frame. On contact it is squashed (amount grows with the impact
 * speed, capped by the limit); as it leaves, the squash turns into a stretch along the flight; on the last landing the squash rings out.
 * @param {number} t @param {{t0:number,y0:number,floor:number,g?:number,e?:number,dwell?:number}} o @param {string} [lim] LIMITS key
 * @returns {{sx:number,sy:number,y:number,vy:number,amount:number}}
 */
export function bounceLook(t, o, lim = 'ball') {
  const st = bounce(t, o), L = LIMITS[lim], fs = { gain: 0.00016 * (L.stretch / 0.3), max: L.stretch };
  let amount = flightStretch(st.vy, fs);
  if (st.bounces > 0) {
    const a = Math.min(st.impactSpeed / 1400 * L.squash, L.squash), T = 0.06;
    if (st.contact) amount = a * (1 - 0.15 * prog(st.sinceImpact, 0, o.dwell ?? 0.07)); // pressed flat on the floor
    else if (st.resting) amount = impactSquash(t, { t0: t - st.sinceImpact + (o.dwell ?? 0.07) * 0, amount: a });
    else { const w = prog(st.sinceLeave, 0, T); amount = a * 0.85 * (1 - w) + w * flightStretch(st.vy, fs); } // leaves the floor: squash turns to stretch
  }
  return { ...deform(amount, lim), y: st.y, vy: st.vy, amount };
}

/**
 * A tap on a button or chip: a quick press (squash) and a springy release. Returns signed amount for deform().
 * @param {number} t @param {{t0:number,amount?:number,downSec?:number}} o downSec = seconds held down (0.07 = 2 frames)
 */
export function tap(t, { t0, amount = 0.08, downSec = 0.07 }) {
  if (t < t0) return 0;
  if (t < t0 + downSec) return amount * E.outCubic(prog(t, t0, t0 + downSec));
  return springState(t - t0 - downSec, { from: amount, to: 0, k: 520, c: 20 })[0];
}

/**
 * A pop-in: scale grows from 0 with a spring, and the height leads (stretch first, then settles). Returns {sx, sy} to apply as scale.
 * For something that appears from nothing (badge, chip, number). Do not use on long text.
 * @param {number} t @param {{t0:number,k?:number,c?:number,lead?:number}} o lead = extra height at the start of the pop (0.18)
 */
export function pop(t, { t0, k = 260, c = 17, lead = 0.18 }) {
  if (t <= t0) return { sx: 0, sy: 0 };
  const u = t - t0, s = springState(u, { from: 0, to: 1, k, c })[0], extra = lead * Math.exp(-u * 9) * Math.sin(Math.min(u * 14, Math.PI));
  return { sx: Math.max(0, s * (1 - extra * 0.8)), sy: Math.max(0, s * (1 + extra)) };
}

/**
 * Draw `fn` deformed about an anchor so a landing object squashes ON the floor, not around its middle.
 * Anchor 'bottom' = the contact point stays put; 'center' scales about the middle. fn draws the object centred on (0, 0) for 'center',
 * or with its bottom at (0, 0) for 'bottom'.
 * @param {CanvasRenderingContext2D} ctx @param {{x:number,y:number,sx:number,sy:number,rot?:number,anchor?:'bottom'|'center'}} o @param {()=>void} fn
 */
export function drawDeformed(ctx, { x, y, sx, sy, rot = 0 }, fn) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx, sy); fn(); ctx.restore(); }

/** Volume (area) of a deform result: always 1 unless clamped. */
export const area = d => d.sx * d.sy;
