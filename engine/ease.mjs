// Annie engine: easing curves and small math helpers. Pure functions, no dependencies.
// Every easing maps 0 -> 0 and 1 -> 1 exactly. Back and elastic curves leave the 0..1 range in between on purpose.

/** Clamp x into [a, b]. @param {number} x @param {number} [a=0] @param {number} [b=1] @returns {number} */
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
/** Linear interpolation from a to b. @param {number} a @param {number} b @param {number} t @returns {number} */
export const lerp = (a, b, t) => a + (b - a) * t;
/** Progress of t between t0 and t1, clamped to 0..1. This is how every animation gets its local time. @returns {number} */
export const prog = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
/** Map x from range a..b to range c..d (not clamped). @returns {number} */
export const remap = (x, a, b, c, d) => c + ((x - a) / (b - a)) * (d - c);
/** Smooth 0..1 step. `smoothstep(a, b, x)` like GLSL; `smoothstep(x)` means (0, 1, x). @returns {number} */
export function smoothstep(a, b, x) {
  if (b === undefined) { x = a; a = 0; b = 1; }
  const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t);
}
/** Smoother step (zero first and second derivative at both ends). @returns {number} */
export function smootherstep(a, b, x) {
  if (b === undefined) { x = a; a = 0; b = 1; }
  const t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10);
}

const C1 = 1.70158, C2 = C1 * 1.525;
const bounceOut = t => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
/** outElastic(t, a = 1, p = 0.3): a = overshoot amplitude (>= 1), p = period (smaller = faster wobble). */
const outElastic = (t, a = 1, p = 0.3) => {
  if (t <= 0) return 0; if (t >= 1) return 1;
  a = Math.max(1, a); const s = (p / (2 * Math.PI)) * Math.asin(1 / a);
  return a * Math.pow(2, -10 * t) * Math.sin(((t - s) * 2 * Math.PI) / p) + 1;
};

/**
 * Easing table. Each entry is a function t(0..1) -> eased value. See README "ease.mjs" for what to use when.
 * Entrances: outCubic, outBack, outElastic. Exits: inCubic, inQuad. Loops and markers: inOutCubic, inOutSine.
 */
export const E = {
  linear: t => t,
  inQuad: t => t * t, outQuad: t => 1 - (1 - t) * (1 - t), inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: t => t * t * t, outCubic: t => 1 - Math.pow(1 - t, 3), inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: t => t ** 4, outQuart: t => 1 - Math.pow(1 - t, 4), inOutQuart: t => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)), outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  inSine: t => 1 - Math.cos((t * Math.PI) / 2), outSine: t => Math.sin((t * Math.PI) / 2), inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  inCirc: t => 1 - Math.sqrt(1 - t * t), outCirc: t => Math.sqrt(1 - Math.pow(t - 1, 2)),
  inOutCirc: t => (t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2),
  inBack: (t, s = C1) => t * t * ((s + 1) * t - s),
  outBack: (t, s = C1) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inOutBack: (t, s = C2) => (t < 0.5 ? (Math.pow(2 * t, 2) * ((s + 1) * 2 * t - s)) / 2 : (Math.pow(2 * t - 2, 2) * ((s + 1) * (t * 2 - 2) + s) + 2) / 2),
  inElastic: (t, a = 1, p = 0.3) => 1 - outElastic(1 - t, a, p),
  outElastic,
  outBounce: bounceOut, inBounce: t => 1 - bounceOut(1 - t),
};

/** Blend two '#rrggbb' (or '#rgb') colours. Returns 'rgb(r,g,b)'. @param {string} a @param {string} b @param {number} t */
export function mix(a, b, t) {
  const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
}
/** '#rgb' / '#rrggbb' -> [r,g,b]. @param {string} h @returns {number[]} */
export function hex(h) {
  if (h.length === 4) h = '#' + [...h.slice(1)].map(c => c + c).join('');
  const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** '#rrggbb' + alpha -> 'rgba(...)'. */
export const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

/**
 * Frame-rate independent smoothing: move `current` toward `target`. lambda ~ 6 is gentle, 20 is snappy.
 * Call it with the same dt every frame, or use it for cursors that chase a point.
 */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** CSS-style cubic-bezier easing: returns a function t -> eased. Example: cubicBezier(0.22, 1, 0.36, 1) is a soft outQuint. */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = s => ((ax * s + bx) * s + cx) * s, Y = s => ((ay * s + by) * s + cy) * s, dX = s => (3 * ax * s + 2 * bx) * s + cx;
  return t => {
    if (t <= 0) return 0; if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) { const e = X(s) - t; if (Math.abs(e) < 1e-7) return Y(s); const d = dX(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
    let lo = 0, hi = 1; s = t;
    for (let i = 0; i < 40; i++) { const e = X(s); if (Math.abs(e - t) < 1e-7) break; if (e < t) lo = s; else hi = s; s = (lo + hi) / 2; }
    return Y(s);
  };
}
