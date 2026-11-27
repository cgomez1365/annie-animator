// t7.1 pseudo-3d-and-isometric: perspective and isometric cameras, boxes and cards as quads, painter's sort, backface culling,
// view-space lighting, perspective-correct texture quads, cast and contact shadows, parallax layers. All pure functions of their inputs.
// Conventions: world x right, y DOWN, z away from the viewer. Positive pitch shows top faces. Light and shading live in view space.
import { createCanvas } from '../../engine/canvas.mjs';
import { mix, rgba, clamp, lerp } from '../../engine/ease.mjs';

// ------------------------------------------------------------------ vectors and matrices (3x3 row-major arrays of 9)
/** @param {number[]} a @param {number[]} b */ export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** @param {number[]} a @param {number[]} b */ export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @param {number[]} a @param {number} s */ export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
/** @param {number[]} a @param {number[]} b */ export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @param {number[]} a @param {number[]} b */ export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {number[]} a */ export const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** Identity matrix. */ export const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Rotation about x by a radians. @param {number} a */ export const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
/** Rotation about y by a radians (spin about the vertical axis). @param {number} a */ export const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
/** Rotation about z by a radians. @param {number} a */ export const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
/** Matrix product a*b (apply b first, then a). @param {number[]} a @param {number[]} b */
export const mmul = (a, b) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]); return r; };
/** Apply matrix m to point p. @param {number[]} m @param {number[]} p */
export const apply = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];

// ------------------------------------------------------------------ cameras
/**
 * A camera. Perspective: screen = c + view.xy * f/(d + view.z), eye at view z = -d. Ortho: screen = c + view.xy * f (no foreshortening).
 * Perspective numbers that work at 1080 wide: f 1000-1400, d 1100-1800 (smaller d = stronger distortion). Pitch 0.2-0.6 rad looks down on things.
 * @param {{cx?:number,cy?:number,f?:number,d?:number,yaw?:number,pitch?:number,roll?:number,ortho?:boolean}} [o]
 * @returns {{cx:number,cy:number,f:number,d:number,rot:number[],ortho:boolean}}
 */
export function makeCamera({ cx = 540, cy = 900, f = 1100, d = 1500, yaw = 0, pitch = 0, roll = 0, ortho = false } = {}) {
  return { cx, cy, f, d, ortho, rot: mmul(rotZ(roll), mmul(rotX(pitch), rotY(yaw))) };
}
/** True isometric camera: yaw 45 degrees, pitch atan(1/sqrt2) = 35.264 degrees, orthographic. `scale` = px per world unit. */
export const isoCamera = ({ cx = 540, cy = 900, scale = 1 } = {}) => makeCamera({ cx, cy, f: scale, yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2), ortho: true });
/** World point to view space. */ export const toView = (p, cam) => apply(cam.rot, p);
/** View point to screen: [x, y, viewZ, scale]. */
export const projectView = (q, cam) => { if (cam.ortho) return [cam.cx + q[0] * cam.f, cam.cy + q[1] * cam.f, q[2], cam.f]; const s = cam.f / (cam.d + q[2]); return [cam.cx + q[0] * s, cam.cy + q[1] * s, q[2], s]; };
/** World point to screen: [x, y, viewZ, scale]. @param {number[]} p @param {*} cam */
export const project = (p, cam) => projectView(toView(p, cam), cam);

// ------------------------------------------------------------------ shapes as quads
// A quad: { pts:[4 world points TL,TR,BR,BL as seen from outside], n: outward world normal, fill?, tex?, edge?, doubleSided? }
const FACES = {
  front: { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }, back: { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] },
  right: { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, left: { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  top: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] }, bottom: { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, -1] },
};
/**
 * A box as 6 quads. size = [w, h, d] full extents. R = rotation (3x3) about the box centre. o.fill: base colour; o.tex: { front, back, top, ... } canvases; o.edge: outline colour.
 * @param {number[]} center @param {number[]} size @param {number[]} [R] @param {{fill?:string,tex?:Object,edge?:string,faces?:string[]}} [o]
 */
export function boxQuads(center, size, R = I3, o = {}) {
  const h = [size[0] / 2, size[1] / 2, size[2] / 2], out = [];
  for (const name of o.faces || Object.keys(FACES)) {
    const F = FACES[name], hn = Math.abs(F.n[0]) * h[0] + Math.abs(F.n[1]) * h[1] + Math.abs(F.n[2]) * h[2];
    const hu = Math.abs(F.u[0]) * h[0] + Math.abs(F.u[1]) * h[1] + Math.abs(F.u[2]) * h[2], hv = Math.abs(F.v[0]) * h[0] + Math.abs(F.v[1]) * h[1] + Math.abs(F.v[2]) * h[2];
    const c = mul(F.n, hn), corner = (su, sv) => add(center, apply(R, add(c, add(mul(F.u, su * hu), mul(F.v, sv * hv)))));
    out.push({ name, pts: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], n: apply(R, F.n), fill: o.fill, tex: o.tex && o.tex[name], edge: o.edge });
  }
  return out;
}
/** A thin textured card (box of thickness `thick`) whose front and back carry textures. Flip it with rotY(angle). */
export const cardQuads = (center, w, h, thick, R, o = {}) => boxQuads(center, [w, h, thick], R, { fill: o.fill || '#161c26', edge: o.edge, tex: { front: o.front, back: o.back } });

// ------------------------------------------------------------------ lighting
/** Default light, in VIEW space, pointing TOWARD the light: up, left, toward the viewer. */
export const LIGHT = norm([-0.45, -0.75, -0.5]);
/**
 * Brightness factor for a view-space normal: ambient + diffuse (+ a tight specular if o.spec). 0.3-0.45 ambient keeps shadows readable on the dark BGI ground.
 * Returns 0..~1.3 (above 1 = highlight, handled by shade()).
 * @param {number[]} nView @param {{light?:number[],ambient?:number,diffuse?:number,spec?:number,shine?:number}} [o]
 */
export function lambert(nView, { light = LIGHT, ambient = 0.36, diffuse = 0.72, spec = 0, shine = 30 } = {}) {
  const d = Math.max(0, dot(nView, light)); let k = ambient + diffuse * d;
  if (spec > 0) { const h = norm(add(light, [0, 0, -1])); k += spec * Math.pow(Math.max(0, dot(nView, h)), shine); }
  return k;
}
/** Colour times brightness: k < 1 darkens toward near-black, k > 1 lightens toward white. @param {string} color @param {number} k */
export const shade = (color, k) => k <= 1 ? mix('#04060a', color, clamp(k)) : mix(color, '#ffffff', clamp(k - 1, 0, 0.6));

/**
 * Cull and sort quads for a camera. Back faces are dropped (unless doubleSided), the rest are sorted far to near (painter's algorithm
 * on mean view depth). Returns drawables with view points, brightness `k` and screen points `s`.
 * Painter's sort is right for convex objects that do not interleave; for stacked boxes sort by centre depth and keep gaps >= 1 px.
 * @param {Array} quads @param {*} cam @param {{light?:number[],ambient?:number,diffuse?:number,spec?:number}} [lo]
 */
export function prepare(quads, cam, lo = {}) {
  const out = [];
  for (const q of quads) {
    const v = q.pts.map(p => toView(p, cam)); let n = apply(cam.rot, q.n);
    const c = [(v[0][0] + v[2][0]) / 2, (v[0][1] + v[2][1]) / 2, (v[0][2] + v[2][2]) / 2], toEye = cam.ortho ? [0, 0, -1] : sub([0, 0, -cam.d], c);
    let facing = dot(n, toEye) > 0;
    if (!facing) { if (!q.doubleSided) continue; n = mul(n, -1); }
    out.push({ q, v, n, depth: (v[0][2] + v[1][2] + v[2][2] + v[3][2]) / 4, k: lambert(n, lo), s: v.map(p => projectView(p, cam)) });
  }
  return out.sort((a, b) => b.depth - a.depth);
}
/** Signed screen area of a polygon of [x,y] points (positive = clockwise on screen, y down). */
export const area2 = s => { let a = 0; for (let i = 0; i < s.length; i++) { const p = s[i], q = s[(i + 1) % s.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

// ------------------------------------------------------------------ drawing
/** Triangle-to-triangle affine for drawImage. src, dst: [[x,y],[x,y],[x,y]]. Returns [a,b,c,d,e,f] or null when degenerate. */
export function affine(src, dst) {
  const [[s0x, s0y], [s1x, s1y], [s2x, s2y]] = src, [[d0x, d0y], [d1x, d1y], [d2x, d2y]] = dst;
  const det = (s1x - s0x) * (s2y - s0y) - (s2x - s0x) * (s1y - s0y); if (Math.abs(det) < 1e-9) return null;
  const a = ((d1x - d0x) * (s2y - s0y) - (d2x - d0x) * (s1y - s0y)) / det, b = ((d1y - d0y) * (s2y - s0y) - (d2y - d0y) * (s1y - s0y)) / det;
  const c = ((d2x - d0x) * (s1x - s0x) - (d1x - d0x) * (s2x - s0x)) / det, d = ((d2y - d0y) * (s1x - s0x) - (d1y - d0y) * (s2x - s0x)) / det;
  return [a, b, c, d, d0x - a * s0x - c * s0y, d0y - b * s0x - d * s0y];
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/**
 * Draw a texture on a quad with TRUE perspective: the quad is split into an n x n grid in VIEW space, every grid point is projected,
 * and each cell is drawn as two affine triangles (clip + drawImage), grown 0.6 px to hide seams. n = 8 is fine for cards, 14 for strong perspective.
 * @param {*} ctx @param {*} tex canvas or image @param {number[][]} v 4 view points TL,TR,BR,BL @param {*} cam @param {number} [n=10]
 */
export function drawTexturedQuad(ctx, tex, v, cam, n = 10) {
  const w = tex.width, h = tex.height, grid = [];
  for (let j = 0; j <= n; j++) { grid[j] = []; const L = lerp3(v[0], v[3], j / n), R = lerp3(v[1], v[2], j / n); for (let i = 0; i <= n; i++) grid[j][i] = projectView(lerp3(L, R, i / n), cam); }
  const tri = (s, d) => {
    const cx = (d[0][0] + d[1][0] + d[2][0]) / 3, cy = (d[0][1] + d[1][1] + d[2][1]) / 3, g = d.map(p => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 0.6, p[1] + dy / l * 0.6]; });
    const m = affine(s, d); if (!m) return;
    ctx.save(); ctx.beginPath(); ctx.moveTo(g[0][0], g[0][1]); ctx.lineTo(g[1][0], g[1][1]); ctx.lineTo(g[2][0], g[2][1]); ctx.closePath(); ctx.clip();
    ctx.transform(...m); ctx.drawImage(tex, 0, 0); ctx.restore();
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const s00 = [i / n * w, j / n * h], s10 = [(i + 1) / n * w, j / n * h], s01 = [i / n * w, (j + 1) / n * h], s11 = [(i + 1) / n * w, (j + 1) / n * h];
    const p00 = grid[j][i], p10 = grid[j][i + 1], p01 = grid[j + 1][i], p11 = grid[j + 1][i + 1];
    tri([s00, s10, s01], [p00, p10, p01]); tri([s10, s11, s01], [p10, p11, p01]);
  }
}
/**
 * Draw prepared quads: flat fill shaded by `k`, or a texture darkened by (1-k) black plus an optional moving sheen, then a hairline edge.
 * @param {*} ctx @param {Array} prepared result of prepare() @param {*} cam @param {{alpha?:number,sheen?:number,texN?:number}} [o] sheen 0..1 = position of a light band across textured faces
 */
export function drawPrepared(ctx, prepared, cam, o = {}) {
  for (const d of prepared) {
    const { q, s, k } = d, path = () => { ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(s[i][0], s[i][1]); ctx.closePath(); };
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    if (q.tex) {
      drawTexturedQuad(ctx, q.tex, d.v, cam, o.texN || 10);
      path(); ctx.fillStyle = `rgba(4,6,10,${clamp(1.02 - k, 0, 0.85).toFixed(3)})`; ctx.fill();
      if (o.sheen !== undefined && o.sheen > 0 && o.sheen < 1) { // light band that travels across the face as it turns
        ctx.save(); path(); ctx.clip(); const xs = s.map(p => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), ys = s.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), cx = lerp(x0 - 120, x1 + 120, o.sheen);
        const g = ctx.createLinearGradient(cx - 110, y0, cx + 110, y1); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x0 - 140, y0, x1 - x0 + 280, y1 - y0); ctx.restore();
      }
    } else { path(); ctx.fillStyle = shade(q.fill || '#161c26', k); ctx.fill(); }
    if (q.edge) { path(); ctx.strokeStyle = q.edge; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.restore();
  }
}
/** One call: prepare + draw. @returns {Array} the prepared list (for hit tests and counts) */
export function drawQuads(ctx, quads, cam, o = {}) { const p = prepare(quads, cam, o.light || {}); drawPrepared(ctx, p, cam, o); return p; }

// ------------------------------------------------------------------ shadows
/** Convex hull of 2D points (monotone chain). @param {number[][]} pts */
export function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Project a world point along `dir` (pointing away from the light) onto the horizontal floor plane y = floorY. */
export const onFloor = (p, dir, floorY) => { const t = (floorY - p[1]) / dir[1]; return [p[0] + dir[0] * t, floorY, p[2] + dir[2] * t]; };
/**
 * Cast shadow of a convex object: every vertex is pushed along the light direction onto the floor, the hull is filled soft.
 * dir (world, pointing from light to scene, y > 0 because y is down) e.g. norm([0.5, 1, 0.3]). Longer shadows = lower light.
 * @param {*} ctx @param {number[][]} worldPts @param {*} cam @param {{dir?:number[],floorY:number,alpha?:number,blur?:number,color?:string}} o
 * @returns {number[][]} screen hull
 */
export function castShadow(ctx, worldPts, cam, { dir = norm([0.55, 1, 0.35]), floorY, alpha = 0.55, blur = 10, color = '0,0,0' }) {
  const h = hull(worldPts.map(p => { const f = onFloor(p, dir, floorY), s = project(f, cam); return [s[0], s[1]]; }));
  if (h.length < 3) return h;
  ctx.save(); ctx.filter = `blur(${blur}px)`; ctx.fillStyle = `rgba(${color},${alpha})`; ctx.beginPath(); ctx.moveTo(h[0][0], h[0][1]); for (const p of h.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill(); ctx.restore();
  return h;
}
/** Soft contact shadow ellipse: gets wider, fainter and softer as `height` (px above the floor) grows. cx,cy = point under the object. */
export function contactShadow(ctx, cx, cy, rx, ry, height = 0, { alpha = 0.6 } = {}) {
  const g = clamp(height / 300), a = alpha * (1 - 0.65 * g), sc = 1 + 0.35 * g;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc * (ry / rx)); const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.5})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
/** A lit floor with fine grid lines in world space (y = floorY), clipped to half-extent `half`. Gives shadows something to fall on and the eye a depth scale. */
export function floorGrid(ctx, cam, { floorY = 0, half = 400, step = 80, fill = '#131a23', line = 'rgba(25,224,143,0.16)', edge = 'rgba(25,224,143,0.45)' } = {}) {
  const P4 = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, z]) => project([x, floorY, z], cam));
  ctx.save(); ctx.beginPath(); P4.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.clip();
  ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath();
  for (let g = -half; g <= half; g += step) { const a = project([g, floorY, -half], cam), b = project([g, floorY, half], cam), c = project([-half, floorY, g], cam), d = project([half, floorY, g], cam); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); }
  ctx.stroke(); ctx.restore();
  ctx.save(); ctx.beginPath(); P4.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.strokeStyle = edge; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
}

// ------------------------------------------------------------------ parallax
/**
 * Parallax transform for a layer at `depth` (1 = the focus plane, 2 = twice as far). Far layers move less (dx = -cam/depth), shrink toward the horizon
 * and fade toward the background. Returns { dx, dy, s, a }.
 * @param {number} depth >= 1 @param {number} camX px @param {number} [camY=0] px @param {{zoom?:number,fade?:number}} [o]
 */
export function parallax(depth, camX, camY = 0, { zoom = 1, fade = 0.55 } = {}) {
  const inv = 1 / depth; return { dx: -camX * inv, dy: -camY * inv, s: lerp(1, 0.55, 1 - inv) * zoom, a: 1 - fade * (1 - inv) };
}
/** Colour a far layer toward the background: depth 1 = full colour, depth 4 = mostly the ground. */
export const depthTint = (color, depth, bg = '#0a0c10') => mix(bg, color, clamp(1 / depth + 0.1, 0, 1));

// ------------------------------------------------------------------ small helpers for cards
/** A drawing surface for textures. @param {number} w @param {number} h @param {(ctx:any)=>void} fn */
export function texture(w, h, fn) { const cv = createCanvas(w, h), c = cv.getContext('2d'); fn(c, cv); return cv; }
/** Isometric 2D projection without a camera (y up): [cx + (x - z) cos30 s, cy + (x + z) sin30 s - y s]. */
export const isoPoint = (x, y, z, { cx = 540, cy = 900, s = 1 } = {}) => [cx + (x - z) * Math.cos(Math.PI / 6) * s, cy + (x + z) * 0.5 * s - y * s];
