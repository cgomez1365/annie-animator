// Annie engine: seeded randomness. Never use Math.random in frame code: a frame must be the same every time.
import { lerp } from './ease.mjs';

/** FNV-1a 32-bit hash of a string (or number) -> unsigned int. Use it to turn names into seeds. */
export function hash(str) {
  const s = String(str); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Seeded generator. s = (s * 1103515245 + 12345) & 0x7fffffff, computed exactly with Math.imul, value = s / 2^31.
 * Returns a function r() giving floats in [0,1). It also carries r.range(a,b), r.int(a,b) (inclusive), r.sign(),
 * r.normal() (about -3..3) and r.fork(n) (an independent generator).
 * @param {number|string} seed same seed, same sequence, always
 */
export function rng(seed = 1) {
  let s = (typeof seed === 'string' ? hash(seed) : seed | 0) & 0x7fffffff;
  const r = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 2147483648; };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.normal = () => (r() + r() + r() + r() + r() + r() - 3) * Math.SQRT2;
  r.fork = n => rng((s ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0);
  return r;
}

const lat = (ix, iy, seed) => {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
};
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth 1D value noise in [-1, 1]. Same x, same value. Use for organic jitter: x = t * frequency. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = fade(x - i);
  return lerp(lat(i, 0, seed), lat(i + 1, 0, seed), f) * 2 - 1;
}
/** Smooth 2D value noise in [-1, 1]. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
  return lerp(lerp(lat(ix, iy, seed), lat(ix + 1, iy, seed), fx), lerp(lat(ix, iy + 1, seed), lat(ix + 1, iy + 1, seed), fx), fy) * 2 - 1;
}
/**
 * Fractal noise: layers of noise2 (noise1 when y is 0/omitted behaves as a line through the field). Range about [-1, 1].
 * fbm(x, y, { octaves = 4, lacunarity = 2, gain = 0.5, seed = 0 })  or  fbm(x, { ... }).
 */
export function fbm(x, y = 0, o = {}) {
  if (typeof y === 'object') { o = y; y = 0; }
  const { octaves = 4, lacunarity = 2, gain = 0.5, seed = 0 } = o;
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) { sum += amp * noise2(x * f + i * 17.3, y * f + i * 9.1, seed + i); norm += amp; amp *= gain; f *= lacunarity; }
  return sum / norm;
}
/** Pick one item with generator r. @param {()=>number} r @param {any[]} arr */
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
/** Shuffled copy (Fisher-Yates) using generator r. The input is not changed. */
export function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
