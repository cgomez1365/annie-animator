// t1.4 persistent-motion: nothing on a tt10 card ever stops. Running marker dots, highlight sweeps, pulsing meters, blinking cursors,
// bouncing dots, animated dashed lines, sonar rings. Every function is a pure loop in t (any frame order, any start time).
import { E, prog, lerp, clamp, rgba } from '../../engine/ease.mjs';
import { rng } from '../../engine/rng.mjs';
import { loop, blink } from '../../engine/timeline.mjs';
import { P } from '../../engine/brand.mjs';
import { glow, roundRect } from '../../engine/canvas.mjs';

// ---------------------------------------------------------------- running marker between nodes
/** The legs of a ping-pong walk over n nodes: n=3 gives 0>1, 1>2, 2>1, 1>0 (hello_card's route); it then repeats. */
export const pingPong = n => { const legs = []; for (let i = 0; i < n - 1; i++) legs.push([i, i + 1]); for (let i = n - 1; i > 1; i--) legs.push([i, i - 1]); legs.push(...(n > 1 ? [[1, 0]] : [])); return legs; };
/**
 * Where the marker is at time t. nodes = [{x,y}] (or numbers with o.y). Each leg takes legDur s with inOutCubic (hello_card: 0.8 s).
 * Returns {x, y, p (continuous leg count), leg (index since t0), from, to, f (eased 0..1 within the leg)}. Before t0 the marker sits on node 0.
 * @param {number} t @param {Array<{x:number,y:number}|number>} nodes @param {{t0?:number,legDur?:number,route?:number[][],y?:number,ease?:string}} [o]
 */
export function markerAt(t, nodes, { t0 = 0, legDur = 0.8, route, y = 0, ease = 'inOutCubic' } = {}) {
  const N = nodes.map(n => typeof n === 'number' ? { x: n, y } : n), R = route || pingPong(N.length), p = Math.max(0, (t - t0) / legDur), leg = Math.floor(p), f = E[ease](p - leg), [a, b] = R[leg % R.length];
  return { x: lerp(N[a].x, N[b].x, f), y: lerp(N[a].y, N[b].y, f), p, leg, from: a, to: b, f };
}
/** Strength 0..1 of the arrival ring of node `i`: each arrival pulses a ring for ringDur s (0.45). Use with drawNodes. */
export function arrivalRing(t, nodes, i, { t0 = 0, legDur = 0.8, route, ringDur = 0.45 } = {}) {
  const R = route || pingPong(nodes.length), p = (t - t0) / legDur; if (p <= 0) return 0;
  let ring = 0; for (let leg = Math.floor(p) - 1; leg <= Math.floor(p); leg++) { if (leg < 0) continue; const to = R[leg % R.length][1], ta = t0 + legDur * (leg + 1); if (to === i && t >= ta) ring = Math.max(ring, 1 - prog(t, ta, ta + ringDur)); }
  return ring;
}
/** Draw the dashed track with marching dashes and ringed nodes. nodes = [{x,y}]. o: {color, r (node radius 16), dash [8,6], speed px/s 24, ringsFrom: {t0, legDur} to enable arrival rings}. */
export function drawNodes(ctx, t, nodes, o = {}) {
  const col = o.color || P.green, r = o.r ?? 16;
  dashedLine(ctx, t, nodes[0].x, nodes[0].y, nodes[nodes.length - 1].x, nodes[nodes.length - 1].y, { color: rgba(col, 0.5), width: 2, dash: o.dash, speed: o.speed ?? 24 });
  nodes.forEach((n, i) => {
    ctx.fillStyle = P.panel2; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const k = o.ringsFrom ? arrivalRing(t, nodes, i, o.ringsFrom) : 0;
    if (k > 0) { ctx.strokeStyle = rgba(col, k * 0.8); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n.x, n.y, r + 34 * (1 - k), 0, Math.PI * 2); ctx.stroke(); }
  });
}
/** Draw the marker with a comet trail (7 ghosts 0.045 legs apart) and a glow. nodes as markerAt. o: {t0, legDur, route, y, color, r (20), trail (7)}. */
export function drawMarker(ctx, t, nodes, o = {}) {
  if (t < (o.t0 ?? 0)) return; const col = o.color || P.green, r = o.r ?? 20, T = o.trail ?? 7, base = markerAt(t, nodes, o);
  for (let j = T - 1; j >= 0; j--) {
    const q = markerAt((o.t0 ?? 0) + Math.max(0, base.p - j * 0.045) * (o.legDur ?? 0.8), nodes, o);
    ctx.fillStyle = rgba(col, 0.5 * (1 - j / T) * (j === 0 ? 2 : 1)); ctx.beginPath(); ctx.arc(q.x, q.y, j === 0 ? r : r - j * (r / 12.5), 0, Math.PI * 2); ctx.fill();
  }
  glow(ctx, col, 24, () => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(base.x, base.y, r, 0, Math.PI * 2); ctx.fill(); });
}
/**
 * A dot running down (or up) a dimension line again and again (tt10 "how it works" steps): travels over `travel` of each period with inOutSine,
 * fades out at the end, loops. Returns {x,y,a}: draw a 7 px glowing dot at (x,y) with alpha a, UNDER opaque boxes so it only shows on the line.
 * @param {number} t @param {{t0?:number,x:number,y0:number,y1:number,period?:number,travel?:number}} o
 */
export function lineRunner(t, { t0 = 0, x, y0, y1, period = 1.6, travel = 0.85 }) {
  const run = t - t0; if (run <= 0) return { x, y: y0, a: 0 };
  const u = (run % period) / period; return { x, y: lerp(y0, y1, E.inOutSine(clamp(u / travel))), a: clamp(run / 0.3) * (1 - prog(u, travel, 1)) };
}

// ---------------------------------------------------------------- highlight sweep
/**
 * Highlight intensities 0..1 for n list items, stepping across them in a cycle (tt10 builds list: period 2.4 s, n 4).
 * item i = max(0, sin(2 pi ((t - t0)/period - i/n))) ^ power. power 4 makes the highlight narrow (one item at a time, with a soft overlap).
 * Use it to drive border alpha (0.45 + 0.5 h), border width (2 + 1.5 h) or a fill. Returns an array of n numbers.
 * @param {number} t @param {{t0?:number,n:number,period?:number,power?:number}} o
 */
export const sweep = (t, { t0 = 0, n, period = 2.4, power = 4 }) => Array.from({ length: n }, (_, i) => Math.max(0, Math.sin(2 * Math.PI * ((t - t0) / period - i / n))) ** power);

// ---------------------------------------------------------------- meters
/** One meter level 0..1: base + amp * sin(2 pi (t f + phase)). Default a 0.5 +- 0.3 at 0.8 Hz. */
export const meterLevel = (t, { base = 0.5, amp = 0.3, freq = 0.8, phase = 0 } = {}) => clamp(base + amp * Math.sin(2 * Math.PI * (t * freq + phase)));
/**
 * Levels for n bars like an equaliser: each has its own seeded frequency (0.5-1.3 Hz), phase and base, so they never line up.
 * Build once (module level) and call at(t). @returns {(t:number)=>number[]}
 */
export function barField(seed, n, { base = [0.35, 0.65], amp = [0.15, 0.3], freq = [0.5, 1.3] } = {}) {
  const r = rng(seed), S = Array.from({ length: n }, () => ({ base: r.range(...base), amp: r.range(...amp), freq: r.range(...freq), phase: r.range(0, 1) }));
  return t => S.map(s => meterLevel(t, s));
}
/** Draw vertical meter bars in a box. levels 0..1 from barField(...)(t). o: {x,y,w,h,gap,colors}. Bars grow from the bottom with rounded tops and a faint track. */
export function drawBars(ctx, levels, { x, y, w, h, gap = 14, color = P.green, alpha = 1 }) {
  const n = levels.length, bw = (w - gap * (n - 1)) / n;
  levels.forEach((v, i) => { const bx = x + i * (bw + gap); ctx.fillStyle = rgba(P.white, 0.06 * alpha); roundRect(ctx, bx, y, bw, h, 10).fill(); const bh = Math.max(8, h * v); ctx.fillStyle = rgba(Array.isArray(color) ? color[i % color.length] : color, alpha); roundRect(ctx, bx, y + h - bh, bw, bh, 10).fill(); });
}
/** Breathing value 0..1 on an inOutSine period (glows, button halos). */
export const breathe = (t, period = 1.6, phase = 0) => E.inOutSine(0.5 - 0.5 * Math.cos(2 * Math.PI * (t / period + phase)));

// ---------------------------------------------------------------- cursor and dots
/** Cursor alpha: the blink (period 1.06 s, on 55 percent) with 0.08 s soft edges so it does not flash harshly. */
export function cursorAlpha(t, { period = 1.06, duty = 0.55, edge = 0.08 } = {}) {
  const u = loop(t, period) * period, on = duty * period; return clamp(u / edge) * (1 - clamp((u - on) / edge));
}
/** Draw a text cursor (a 4 px bar) at x,y (top) h tall. */
export function drawCursor(ctx, t, x, y, h, color = P.green) { const a = cursorAlpha(t); if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; ctx.fillRect(x, y, 4, h); ctx.restore(); }
/** Vertical lift (px, up = negative) of dot i of a typing indicator: each dot hops once per period, 0.18 of a period apart. */
export function dotLift(t, i, { period = 1.0, amp = 12 } = {}) { const u = loop(t, period, -i * 0.18); return u < 0.5 ? -amp * Math.sin(Math.PI * u * 2) : 0; }
/** Draw n bouncing dots centred at x,y. o: {n 3, gap 34, r 9, amp 12, period 1, color}. */
export function drawBouncingDots(ctx, t, x, y, o = {}) {
  const n = o.n ?? 3, gap = o.gap ?? 34;
  for (let i = 0; i < n; i++) { ctx.fillStyle = o.color || P.muted; ctx.beginPath(); ctx.arc(x + (i - (n - 1) / 2) * gap, y + dotLift(t, i, o), o.r ?? 9, 0, Math.PI * 2); ctx.fill(); }
}

// ---------------------------------------------------------------- lines and rings
/** A straight dashed line whose dashes march along it (speed px/s, default 30; negative reverses). o: {color, width 2, dash [8,6]}. */
export function dashedLine(ctx, t, x0, y0, x1, y1, o = {}) {
  const d = o.dash || [8, 6]; ctx.save(); ctx.strokeStyle = o.color || rgba(P.green, 0.5); ctx.lineWidth = o.width ?? 2; ctx.setLineDash(d); ctx.lineDashOffset = -(o.speed ?? 30) * t; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
}
/** Sonar rings round a point: n rings expand from r0 to r1 on a period, fading out. Returns nothing; draws. o: {n 2, r0 10, r1 46, period 1.8, color}. */
export function drawRings(ctx, t, x, y, o = {}) {
  const n = o.n ?? 2, r0 = o.r0 ?? 10, r1 = o.r1 ?? 46, per = o.period ?? 1.8;
  for (let i = 0; i < n; i++) { const u = loop(t, per, i / n); ctx.strokeStyle = rgba(o.color || P.green, 0.6 * (1 - u)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, E.outQuad(u)), 0, Math.PI * 2); ctx.stroke(); }
}
