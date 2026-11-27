// t2.3 particles-glow-light: seeded particles (burst, sparks, dust puff, motes, trails), additive glow, bloom, light sweeps, glints.
// Everything is a pure function of (seed, t): the same frame in any order gives the same pixels. No Math.random, no state.
import { E, prog, clamp, lerp, rgba } from '../../engine/ease.mjs';
import { rng, noise1 } from '../../engine/rng.mjs';
import { createCanvas } from '../../engine/canvas.mjs';

const TAU = Math.PI * 2;

/**
 * One particle as returned by the emitters: position, current velocity, alpha 0..1, size px, colour, age/life in seconds.
 * @typedef {{x:number,y:number,vx:number,vy:number,a:number,size:number,color:string,u:number,life:number,rot:number}} Particle
 */

/**
 * A burst of particles from one point, computed analytically (position at any t without stepping), with linear drag and gravity.
 * Particle i always has the same velocity, life and colour for a given seed. Returns only the ones alive at t (none before t0).
 * Recipes: sparks = speed [300,900] drag 1.8 gravity 1100 life [0.35,0.8]; confetti = speed [250,700] drag 2.5 gravity 600 life [0.9,1.6].
 * @param {number} t seconds @param {{t0:number,x:number,y:number,n?:number,seed?:number,speed?:[number,number],angle?:[number,number],gravity?:number,drag?:number,life?:[number,number],size?:[number,number],colors?:string[],grow?:number}} o
 *   angle in radians, 0 = right, -PI/2 = up (canvas y points down); grow = size multiplier at the end of life (1 = same, 0.2 = shrink, 2.5 = grow)
 * @returns {Particle[]}
 */
export function burst(t, o) {
  const { t0, x, y, n = 24, seed = 1, speed = [300, 900], angle = [0, TAU], gravity = 1100, drag = 1.8, life = [0.35, 0.8], size = [3, 7], colors = ['#ffffff'], grow = 0.25 } = o;
  const u = t - t0; if (u < 0) return [];
  const r = rng(seed * 7919 + 13), out = [], d = Math.max(drag, 1e-6);
  for (let i = 0; i < n; i++) {
    const a = lerp(angle[0], angle[1], r()), sp = lerp(speed[0], speed[1], r()), lf = lerp(life[0], life[1], r()), sz = lerp(size[0], size[1], r()), color = colors[Math.floor(r() * colors.length)], rot = r() * TAU;
    if (u >= lf) continue;
    const vx0 = Math.cos(a) * sp, vy0 = Math.sin(a) * sp, k = 1 - Math.exp(-d * u), e = Math.exp(-d * u);
    const px = x + vx0 * k / d, py = y + gravity * u / d + (vy0 - gravity / d) * k / d;
    const vx = vx0 * e, vy = gravity / d + (vy0 - gravity / d) * e, p = u / lf;
    out.push({ x: px, y: py, vx, vy, a: Math.pow(1 - p, 1.4), size: sz * lerp(1, grow, p), color, u, life: lf, rot });
  }
  return out;
}

/**
 * A ground dust puff for landings: slow, mostly sideways, soft circles that grow and fade. Pair with t2.2 impactTimes().
 * @param {number} t @param {{t0:number,x:number,y:number,n?:number,seed?:number,spread?:number,color?:string}} o y = the floor line
 * @returns {Particle[]}
 */
export function puff(t, o) {
  const { t0, x, y, n = 10, seed = 3, spread = 140, color = '#94a3b8' } = o, u = t - t0; if (u < 0) return [];
  const r = rng(seed * 104729 + 5), out = [];
  for (let i = 0; i < n; i++) {
    const side = (i % 2 ? 1 : -1), vx0 = side * lerp(0.25, 1, r()) * spread * 2.4, vy0 = -lerp(20, 90, r()), lf = lerp(0.45, 0.8, r()), s0 = lerp(14, 26, r()), d = 3.2;
    if (u >= lf) continue;
    const k = 1 - Math.exp(-d * u), p = u / lf;
    out.push({ x: x + side * 10 + vx0 * k / d, y: y - 6 + vy0 * k / d - 30 * u * u, vx: vx0 * Math.exp(-d * u), vy: vy0, a: 0.4 * Math.pow(1 - p, 1.3), size: s0 * (1 + 1.6 * E.outCubic(p)), color, u, life: lf, rot: 0 });
  }
  return out;
}

/**
 * Ambient motes: slow rising specks that twinkle and sway, looping exactly every `period` seconds (position at t equals position at t + period).
 * @param {number} t @param {{box:[number,number,number,number],n?:number,seed?:number,period?:number,sway?:number,size?:[number,number],color?:string}} o box = [x0,y0,x1,y1]
 * @returns {Particle[]}
 */
export function motes(t, { box, n = 30, seed = 5, period = 8, sway = 22, size = [2, 5], color = '#9cc4ff' }) {
  const r = rng(seed * 3571 + 1), [x0, y0, x1, y1] = box, h = y1 - y0, out = [];
  for (let i = 0; i < n; i++) {
    const bx = lerp(x0, x1, r()), ph = r(), lanes = 1 + Math.floor(r() * 2), sz = lerp(size[0], size[1], r()), tw = 1 + Math.floor(r() * 3), nz = r() * 50;
    const f = (((t / period) * lanes + ph) % 1 + 1) % 1, sw = sway * Math.sin(TAU * ((t / period) * lanes + ph) * 2 + nz); // sin keeps the loop exact
    out.push({ x: bx + sw, y: y1 - f * h, vx: 0, vy: -h * lanes / period, a: (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(TAU * (tw * t / period + ph)))) * Math.sin(Math.PI * f), size: sz, color, u: f, life: 1, rot: 0 });
  }
  return out;
}

/**
 * Trail points behind a moving thing: the position function sampled at earlier times. k = 0 at the head, 1 at the tail.
 * @param {number} t @param {(t:number)=>{x:number,y:number}} posFn pure function of time @param {{n?:number,dt?:number}} [o] n points, dt seconds between them (0.016 = 1 frame)
 * @returns {{x:number,y:number,k:number}[]}
 */
export function trailPoints(t, posFn, { n = 14, dt = 0.018 } = {}) { return Array.from({ length: n }, (_, j) => ({ ...posFn(t - j * dt), k: j / (n - 1) })); }

// ---------------------------------------------------------------- drawing
const SPRITES = new Map();
/** A cached soft round sprite (radial falloff) 128 px wide in a colour; the base of every glow. @param {string} color '#rrggbb' */
export function glowSprite(color) {
  if (SPRITES.has(color)) return SPRITES.get(color);
  const cv = createCanvas(128, 128), c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, rgba(color, 1)); g.addColorStop(0.22, rgba(color, 0.55)); g.addColorStop(0.55, rgba(color, 0.14)); g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g; c.fillRect(0, 0, 128, 128); SPRITES.set(color, cv); return cv;
}
/** Additive glow: a soft light of radius r at x,y. intensity 0..1+. */
export function glowDot(ctx, x, y, r, color, intensity = 1) {
  if (intensity <= 0.002 || r <= 0.2) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(intensity, 0, 1); ctx.drawImage(glowSprite(color), x - r, y - r, 2 * r, 2 * r);
  if (intensity > 1) { ctx.globalAlpha = clamp(intensity - 1, 0, 1); ctx.drawImage(glowSprite(color), x - r, y - r, 2 * r, 2 * r); }
  ctx.restore();
}

/**
 * Draw particles. mode 'spark' = a streak along the velocity (length 0.045 s of travel), 'dot' = glowing dot, 'soft' = normal-blend soft circle (dust),
 * 'square' = confetti squares that turn. Sparks and dots are additive.
 * @param {*} ctx @param {Particle[]} ps @param {{mode?:'spark'|'dot'|'soft'|'square',glow?:number}} [o] glow = halo radius multiplier (0 off, 3 default for dot)
 */
export function drawParticles(ctx, ps, { mode = 'dot', glow = mode === 'dot' ? 3 : 0 } = {}) {
  ctx.save();
  for (const p of ps) {
    if (p.a <= 0.003) continue;
    if (mode === 'spark') {
      const sp = Math.hypot(p.vx, p.vy) || 1, L = Math.max(p.size * 1.5, sp * 0.045), ux = p.vx / sp, uy = p.vy / sp;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = p.a; ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.5, p.size * 0.55); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * L, p.y - uy * L); ctx.stroke();
      glowDot(ctx, p.x, p.y, p.size * 3, p.color, p.a * 0.6); ctx.globalCompositeOperation = 'lighter';
    } else if (mode === 'soft') {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = p.a; ctx.drawImage(glowSprite(p.color), p.x - p.size, p.y - p.size, 2 * p.size, 2 * p.size);
    } else if (mode === 'square') {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = p.a; ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.u * 9); ctx.scale(1, Math.abs(Math.cos(p.u * 11 + p.rot)) * 0.8 + 0.2); ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); ctx.restore();
    } else {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = p.a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      if (glow) glowDot(ctx, p.x, p.y, p.size * glow, p.color, p.a * 0.7);
    }
  }
  ctx.restore();
}

/** Draw a tapered additive trail from trailPoints(): wide and bright at the head, thin and faint at the tail. */
export function drawTrail(ctx, pts, { color = '#19e08f', width = 22, alpha = 0.8 } = {}) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < pts.length - 1; i++) { const k = pts[i].k; ctx.globalAlpha = alpha * Math.pow(1 - k, 1.6); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, width * (1 - k) * 0.9); ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke(); }
  ctx.restore();
}

/**
 * Bloom approximation: shrink a region to 1/scale and 1/(2 scale), draw both back enlarged with additive blending. Cheap and deterministic
 * (no filters). Only pixels brighter than `threshold` spread a soft halo; panels, grid and dark areas stay exactly as they are. Run it ONCE per frame, after the lights are drawn and before any text.
 * @param {*} ctx @param {[number,number,number,number]} rect [x,y,w,h] region @param {{strength?:number,scale?:number,threshold?:number}} [o] strength 0.4-0.9, scale 6-10, threshold 0-255 (only light above it blooms; 90 keeps panels quiet)
 */
export function bloomPass(ctx, [x, y, w, h], { strength = 0.6, scale = 8, threshold = 90 } = {}) {
  const src = ctx.canvas;
  for (const [s, a] of [[scale, strength], [scale * 2, strength * 0.7]]) {
    const sw = Math.max(2, Math.round(w / s)), sh = Math.max(2, Math.round(h / s)), cv = createCanvas(sw, sh), c = cv.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(src, x, y, w, h, 0, 0, sw, sh);
    const im = c.getImageData(0, 0, sw, sh), d = im.data; // keep only what is brighter than the threshold: panels and the grid must not glow
    for (let i = 0; i < d.length; i += 4) { d[i] = Math.max(0, d[i] - threshold) * 255 / (255 - threshold); d[i + 1] = Math.max(0, d[i + 1] - threshold) * 255 / (255 - threshold); d[i + 2] = Math.max(0, d[i + 2] - threshold) * 255 / (255 - threshold); }
    c.putImageData(im, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(cv, 0, 0, sw, sh, x, y, w, h); ctx.restore();
  }
}

/**
 * A light sweep across a box (the "shine" on a card or button): a soft diagonal band travels left to right once, additive.
 * @param {*} ctx @param {number} t @param {{t0:number,dur?:number,box:[number,number,number,number],r?:number,angle?:number,width?:number,strength?:number,color?:string}} o
 *   box [x,y,w,h]; r = corner radius to clip to; angle radians of the band tilt (0.5 = steep); width as a fraction of box width
 */
export function sweep(ctx, t, { t0, dur = 0.6, box, r = 0, angle = 0.5, width = 0.35, strength = 0.5, color = '#ffffff' }) {
  const k = prog(t, t0, t0 + dur); if (k <= 0 || k >= 1) return;
  const [x, y, w, h] = box, bw = w * width, cx = lerp(-bw, w + bw + h * Math.tan(angle), E.inOutCubic(k));
  ctx.save(); ctx.beginPath(); r ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y + h / 2); ctx.transform(1, 0, -Math.tan(angle), 1, 0, 0);
  const g = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0); g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.5, rgba(color, strength * Math.sin(Math.PI * k) ** 0.5)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fillRect(cx - bw, -h, 2 * bw, 2 * h); ctx.restore();
}

/**
 * A glint: a four-point star flare with a hot core. k 0..1 over its life (0 and 1 draw nothing, peak at 0.4). Use at an impact or on a stamp.
 * @param {*} ctx @param {number} x @param {number} y @param {number} size px radius of the long arms @param {number} k life 0..1 @param {string} [color]
 */
export function glint(ctx, x, y, size, k, color = '#ffffff') {
  if (k <= 0 || k >= 1) return;
  const e = k < 0.4 ? E.outCubic(k / 0.4) : 1 - E.inCubic((k - 0.4) / 0.6), L = size * e, W = size * 0.09 * e;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.fillStyle = color;
  for (const rot of [0, Math.PI / 2]) { ctx.save(); ctx.rotate(rot + 0.12 * k); ctx.beginPath(); ctx.moveTo(-L, 0); ctx.quadraticCurveTo(0, -W, L, 0); ctx.quadraticCurveTo(0, W, -L, 0); ctx.fill(); ctx.restore(); }
  ctx.restore(); glowDot(ctx, x, y, size * 0.55 * e, color, 0.9 * e);
}

/** Impact flash curve: 1 at t0, falls to 0 over dur (squared, so it pops and dies). Multiply a glow or a full-screen white by it. */
export const flash = (t, t0, dur = 0.25) => { const k = prog(t, t0, t0 + dur); return t < t0 ? 0 : (1 - k) * (1 - k); };

/** Expanding ring for impacts: draws a circle that grows and fades. k 0..1. */
export function ring(ctx, x, y, r0, r1, k, { color = '#19e08f', width = 6 } = {}) {
  if (k <= 0 || k >= 1) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.pow(1 - k, 1.5); ctx.strokeStyle = color; ctx.lineWidth = width * (1 - 0.6 * k); ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, E.outCubic(k)), 0, TAU); ctx.stroke(); ctx.restore();
}
