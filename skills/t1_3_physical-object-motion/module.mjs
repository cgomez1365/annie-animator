// t1.3 physical-object-motion: objects that behave like objects. Jitter (sin), seeded scatter with per-piece velocity and spin,
// landing with outBack then bobbing, exits with physics (never a plain fade), analytic bounces with squash.
// Every function is pure in (seed, t): same pixels in any frame order. Numbers are tt10_ops_hr's, generalised.
import { E, prog, lerp, clamp, rgba } from '../../engine/ease.mjs';
import { rng } from '../../engine/rng.mjs';
import { spring } from '../../engine/spring.mjs';
import { P } from '../../engine/brand.mjs';
import { icon } from '../../engine/parts.mjs';
import { roundRect } from '../../engine/canvas.mjs';

// ---------------------------------------------------------------- jitter
/**
 * Sine jitter: how far a "nervous" object is pushed sideways at time t. tt10's spreadsheet rows use amp 4, freq 13 rad/s,
 * offset = row index, on every third row only (so the sheet looks restless, not vibrating). 13 rad/s is a 2 Hz shake.
 * @param {number} t @param {number} offset per-object phase (use the index) @param {{amp?:number,freq?:number}} [o] freq in rad/s
 * @returns {number} px
 */
export const jitter = (t, offset, { amp = 4, freq = 13 } = {}) => amp * Math.sin(t * freq + offset);
/**
 * Two-axis jitter plus a tiny rotation, for a loose object. Different frequencies per axis stop it moving on a straight line.
 * @returns {{dx:number,dy:number,rot:number}} rot in radians (about 0.4 degrees per px of amp)
 */
export function shake(t, offset, { amp = 4, freq = 13 } = {}) {
  return { dx: amp * Math.sin(t * freq + offset), dy: amp * 0.6 * Math.sin(t * freq * 0.77 + offset * 1.9 + 1), rot: 0.007 * amp * Math.sin(t * freq * 0.5 + offset * 0.7) };
}
/** Slow float for things at rest after landing: sin bob. tt10 pile: amp 6, freq 4 rad/s, phase = per-object ph. */
export const bob = (t, ph = 0, amp = 6, freq = 4) => amp * Math.sin(t * freq + ph);

// ---------------------------------------------------------------- seeded scatter
/**
 * Build n flying bodies once (module level). Per body, drawn from rng(seed) in this fixed order: vx, vy, spin.
 * tt10: vx = (r - 0.5) * 900 px, vy = (r - 0.6) * 700 px (biased upwards), spin = (r - 0.5) * 1.2 rad. These are the TOTAL
 * displacement over the scatter (multiplied by the eased k), not px per second.
 * @param {number|string} seed @param {number} n @param {{vx?:number,vy?:number,vyBias?:number,spin?:number}} [o]
 * @returns {{vx:number,vy:number,spin:number}[]}
 */
export function scatterBodies(seed, n, { vx = 900, vy = 700, vyBias = 0.6, spin = 1.2 } = {}) {
  const r = rng(seed); return Array.from({ length: n }, () => { const a = r(), b = r(), c = r(); return { vx: (a - 0.5) * vx, vy: (b - vyBias) * vy, spin: (c - 0.5) * spin }; });
}
/** Scatter progress 0..1 over [s,e] with inCubic (starts slow, leaves fast: it is kicked, not faded). tt10: 0.4 s. */
export const scatterK = (t, s, e) => E.inCubic(prog(t, s, e));
/**
 * Pose of a body at scatter progress k. Home (x,y) is the centre. Position = home + velocity * k (+ gravity * k^2), rotation = spin * k,
 * alpha = 1 - k. Draw with ctx.translate(x,y); ctx.rotate(rot); ctx.globalAlpha *= alpha.
 * @param {{vx:number,vy:number,spin:number}} body @param {{x:number,y:number}} home @param {number} k @param {{gravity?:number}} [o]
 */
export function scatterPose(body, home, k, { gravity = 0 } = {}) { return { x: home.x + body.vx * k, y: home.y + body.vy * k + gravity * k * k, rot: body.spin * k, alpha: 1 - k }; }

/**
 * A grid of cells (a spreadsheet) with a body per cell, built once. tt10: 6 columns [56,160,190,150,170,162], 9 rows of 48 px, a 46 px header row.
 * Each cell gets: x, y (top-left), w, h, home centre cx/cy, bw (width of its fake text bar), body. Row -1 is the header.
 * @param {{seed:number|string,x0:number,y0:number,cols:number[],rows:number,rowH?:number,headH?:number,vx?:number,vy?:number,spin?:number}} o
 */
export function makeCells({ seed, x0, y0, cols, rows, rowH = 48, headH = 46, vx = 900, vy = 700, spin = 1.2 }) {
  const r = rng(seed), out = [];
  for (let row = -1; row < rows; row++) {
    let x = x0; cols.forEach((w, c) => {
      const h = row < 0 ? headH : rowH, y = row < 0 ? y0 : y0 + headH + row * rowH;
      out.push({ row, c, x, y, w, h, cx: x + w / 2, cy: y + h / 2, bw: (row < 0 ? 0.35 : c === 0 ? 0.3 : 0.3 + 0.6 * r()) * (w - 28), body: { vx: (r() - 0.5) * vx, vy: (r() - 0.6) * vy, spin: (r() - 0.5) * spin } }); x += w;
    });
  }
  return out;
}
/**
 * Draw one spreadsheet cell as tt10 does: a faint box with a text bar. It jitters (every third row), blinks when `hot`, and flies at scatter k.
 * @param {*} ctx @param {ReturnType<typeof makeCells>[0]} cell @param {number} t @param {number} k scatter progress
 * @param {{hot?:string, jitter?:boolean}} [o] hot = colour of a blinking cell (e.g. P.red); jitter defaults to row % 3 === 1
 */
export function drawCell(ctx, cell, t, k, o = {}) {
  if (k >= 1) return;
  const jit = (o.jitter ?? (cell.row >= 0 && cell.row % 3 === 1)) ? jitter(t, cell.row) : 0, p = scatterPose(cell.body, { x: cell.cx + jit, y: cell.cy }, k);
  ctx.save(); ctx.globalAlpha *= p.alpha; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
  ctx.fillStyle = cell.row < 0 ? rgba(P.green, 0.10) : o.hot && Math.sin(t * 9 + cell.c) > 0 ? rgba(o.hot, 0.30) : 'rgba(255,255,255,0.015)'; ctx.fillRect(-cell.w / 2, -cell.h / 2, cell.w, cell.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.strokeRect(-cell.w / 2 + 0.5, -cell.h / 2 + 0.5, cell.w - 1, cell.h - 1);
  ctx.fillStyle = cell.row < 0 ? rgba(P.green, 0.55) : cell.c === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(203,213,225,0.38)'; roundRect(ctx, -cell.w / 2 + 14, -6, cell.bw, 12, 6).fill(); ctx.restore();
}

// ---------------------------------------------------------------- landing
/**
 * An object lands: scale pops with outBack (overshoot 10 percent at s 1.7, 8 at 1.5) while it drops `drop` px into place.
 * tt10 pile: dur 0.35 s, s 1.6, drop 60 px. Returns {scale, dy, k}; apply translate(x, y + dy + bob) then scale(scale).
 * @param {number} t @param {{t0:number,dur?:number,s?:number,drop?:number}} o
 */
export function land(t, { t0, dur = 0.35, s = 1.6, drop = 60 }) { const k = E.outBack(prog(t, t0, t0 + dur), s); return { scale: k, dy: -drop * (1 - k), k }; }
/**
 * Where an object is on a long outBack drop (hello_card: from -120 to 880 in 0.8 s, s 1.5) and the time it first touches the floor.
 * The overshoot past `to` IS the bounce. @returns {{y:number, impact:number, k:number}}
 */
export function drop(t, { t0, from, to, dur = 0.8, s = 1.5 }) {
  let u = 0; while (E.outBack(u, s) < 1) u += 0.001;
  const k = E.outBack(prog(t, t0, t0 + dur), s); return { y: lerp(from, to, k), impact: t0 + u * dur, k };
}
/** Squash after an impact: 0.2 at the moment of impact, springing to 0 (k 420, c 13). Draw: translate(x, y + halfH*sq); scale(1 + 0.9*sq, 1 - sq). */
export const squash = (t, tImpact, amp = 0.2) => t <= tImpact ? 0 : spring(t - tImpact, { from: amp, to: 0, k: 420, c: 13 });

/**
 * Real bouncing, closed form (no simulation state). Falls from y0 to floor under gravity g (px/s^2), then bounces with
 * restitution e (0.45 = a dense chip, 0.65 = a ball) until the hop is under minV px/s, then rests. Pure in t.
 * @param {number} t @param {{t0:number,y0:number,floor:number,g?:number,e?:number,minV?:number}} o
 * @returns {{y:number, vy:number, impacts:number[], settled:boolean, sq:number}} y in px (down is +), impacts = impact times, sq = squash amount
 */
export function bounce(t, { t0, y0, floor, g = 3000, e = 0.45, minV = 120 }) {
  const impacts = [], speeds = [];
  let tt = t0 + Math.sqrt(2 * (floor - y0) / g), v = g * Math.sqrt(2 * (floor - y0) / g);
  impacts.push(tt); speeds.push(v);
  while (v * e > minV && impacts.length < 12) { v *= e; tt += 2 * v / g; impacts.push(tt); speeds.push(v); }
  const settleT = impacts[impacts.length - 1];
  let y, vy;
  if (t <= t0) { y = y0; vy = 0; }
  else if (t < impacts[0]) { const u = t - t0; y = y0 + 0.5 * g * u * u; vy = g * u; }
  else if (t >= settleT) { y = floor; vy = 0; }
  else { let i = 0; while (i + 1 < impacts.length && t >= impacts[i + 1]) i++; const u = t - impacts[i], v0 = speeds[i] * e; y = floor - (v0 * u - 0.5 * g * u * u); vy = -(v0 - g * u); }
  let sq = 0; for (let i = 0; i < impacts.length; i++) if (t > impacts[i]) sq = squash(t, impacts[i], 0.2 * Math.min(1, speeds[i] / speeds[0]));
  return { y, vy, impacts, settled: t >= settleT, sq };
}

// ---------------------------------------------------------------- exits with physics
/**
 * Fling out: an object leaves AWAY from the centre, falls and turns (tt10 pile: push 1.4 of its distance from cx, fall 400 px, spin 1.2 rad,
 * all multiplied by k = inCubic of the 0.4 s window). Returns the offsets to ADD to the resting pose, plus alpha.
 * @param {number} x resting x (to know which side it leaves toward) @param {number} k exit progress @param {{cx?:number,push?:number,fall?:number,spin?:number}} [o]
 */
export function flingOut(x, k, { cx = 540, push = 1.4, fall = 400, spin = 1.2 } = {}) { return { dx: (x - cx) * push * k, dy: fall * k, rot: spin * k * (x >= cx ? 1 : -1), alpha: 1 - k }; }

/**
 * One call for a notification-style object: lands (outBack), bobs, then flies out. obj: {x, y, r (rest rotation), ph (bob phase)}.
 * tm: {landT, exit:[s,e], landDur, drop, s}. Returns null when it is not on screen, else {x, y, rot, scale, alpha, phase} where
 * phase is 'land' | 'rest' | 'exit'. tt10 landed its five items 0.15 s apart starting at -0.3 s (so they are already there at frame 0).
 */
export function pilePose(t, obj, tm) {
  const L = land(t, { t0: tm.landT, dur: tm.landDur ?? 0.35, s: tm.s ?? 1.6, drop: tm.drop ?? 60 });
  if (L.k <= 0) return null;
  const k = tm.exit ? scatterK(t, tm.exit[0], tm.exit[1]) : 0; if (k >= 1) return null;
  const f = flingOut(obj.x, k, tm.fling), b = bob(t, obj.ph, tm.bobAmp ?? 6, tm.bobFreq ?? 4);
  return { x: obj.x + f.dx, y: obj.y + b + L.dy + f.dy, rot: (obj.r || 0) + f.rot, scale: L.scale, alpha: f.alpha, phase: k > 0 ? 'exit' : t < tm.landT + (tm.landDur ?? 0.35) ? 'land' : 'rest' };
}
/** Draw a pile item: a 92 px rounded tile with a lucide icon and (badge:true) a red unread dot, at a pilePose. Icons are not text, so the 42 px floor does not apply. */
export function drawChip(ctx, pose, { ic = 'mail', color = P.text, badge = true, size = 92 } = {}) {
  ctx.save(); ctx.globalAlpha *= pose.alpha; ctx.translate(pose.x, pose.y); ctx.rotate(pose.rot); ctx.scale(pose.scale, pose.scale);
  ctx.fillStyle = P.panel2; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; roundRect(ctx, -size / 2, -size / 2, size, size, 18).fill(); ctx.stroke();
  icon(ctx, ic, -size * 0.28, -size * 0.28, size * 0.56, color, 2);
  if (badge) { ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(size * 0.43, -size * 0.43, 13, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
