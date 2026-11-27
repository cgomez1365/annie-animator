// t7.2 mesh-turntable: STL -> decimated, cached mesh -> z-buffered, shaded, anti-aliased turntable frames in plain JS.
// Pipeline: readSTL -> decimate (vertex clustering) -> finishMesh (Y-up, centred, smooth normals) -> loadMesh (cache) -> renderMesh / drawMesh.
// World: x right, y UP (mm, feet at y = 0), z toward the back; the model turns about the vertical axis through its footprint centre.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '../../engine/canvas.mjs';

// ------------------------------------------------------------------ STL
/**
 * Parse an STL (binary, or ASCII as a fallback) into a flat triangle soup: 9 floats per triangle (x,y,z for each of 3 vertices).
 * @param {Buffer} b @returns {{tris:Float32Array,n:number,binary:boolean}}
 */
export function parseSTL(b) {
  if (b.length >= 84) {
    const n = b.readUInt32LE(80);
    if (84 + n * 50 === b.length) {
      const tris = new Float32Array(n * 9);
      for (let i = 0, o = 96; i < n; i++, o += 50) for (let k = 0; k < 9; k++) tris[i * 9 + k] = b.readFloatLE(o + k * 4);
      return { tris, n, binary: true };
    }
  }
  const txt = b.toString('latin1'), re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g, f = []; let m;
  while ((m = re.exec(txt))) f.push(+m[1], +m[2], +m[3]);
  if (!f.length || f.length % 9) throw new Error('not a readable STL (binary size mismatch and no ASCII facets)');
  return { tris: Float32Array.from(f), n: f.length / 9, binary: false };
}
/** Read an STL file. @param {string} file */
export const readSTL = file => parseSTL(fs.readFileSync(file));
/** Write a binary STL (used by tests and for saving decimated copies). @param {string} file @param {Float32Array} tris */
export function writeSTL(file, tris) {
  const n = tris.length / 9, b = Buffer.alloc(84 + n * 50); b.write('annie t7.2', 0); b.writeUInt32LE(n, 80);
  for (let i = 0, o = 84; i < n; i++, o += 50) for (let k = 0; k < 9; k++) b.writeFloatLE(tris[i * 9 + k], o + 12 + k * 4);
  fs.writeFileSync(file, b);
}
/** Axis-aligned bounds of a triangle soup or a position array. @param {Float32Array} a @returns {{min:number[],max:number[]}} */
export function bounds(a) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { const v = a[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { min, max };
}

// ------------------------------------------------------------------ decimation (vertex clustering)
/** Total surface area of a triangle soup. */
function soupArea(t) { let A = 0; for (let i = 0; i < t.length; i += 9) { const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2]; A += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); } return A; }
const DIM = 2048; // cells per axis at most
function cellIds(t, min, c) { // one id per soup vertex
  const ids = new Float64Array(t.length / 3), inv = 1 / c;
  for (let i = 0, j = 0; i < t.length; i += 3, j++) ids[j] = (Math.floor((t[i] - min[0]) * inv) * DIM + Math.floor((t[i + 1] - min[1]) * inv)) * DIM + Math.floor((t[i + 2] - min[2]) * inv);
  return ids;
}
function countKept(ids) { let n = 0; for (let i = 0; i < ids.length; i += 3) if (ids[i] !== ids[i + 1] && ids[i + 1] !== ids[i + 2] && ids[i] !== ids[i + 2]) n++; return n; }
/**
 * Decimate a triangle soup by VERTEX CLUSTERING: snap every vertex to a cubic grid cell, merge the vertices of a cell into their mean,
 * drop triangles that collapse. The cell size is found by 2-6 cheap counting passes so the result lands within about 8 percent of `target`.
 * Fast (about 2 s for 860k triangles), keeps the silhouette, rounds off detail finer than a cell. Returns an indexed mesh.
 * @param {Float32Array} tris soup, 9 floats per triangle @param {{target?:number}} [o] target triangle count (default 150000)
 * @returns {{pos:Float32Array,idx:Uint32Array,cell:number,from:number}}
 */
export function decimate(tris, { target = 150000 } = {}) {
  const n = tris.length / 9, { min, max } = bounds(tris), ext = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (n <= target) { // nothing to remove: just weld
    return weld(tris, cellIds(tris, min, ext / (DIM - 2)), min, ext / (DIM - 2), n);
  }
  let c = Math.max(Math.sqrt(soupArea(tris) / target) * 0.9, ext / (DIM - 2));
  for (let it = 0; it < 6; it++) {
    const kept = countKept(cellIds(tris, min, c)); if (Math.abs(kept - target) / target < 0.08) break;
    c = Math.max(c * Math.sqrt(kept / target), ext / (DIM - 2));
  }
  return weld(tris, cellIds(tris, min, c), min, c, n);
}
function weld(tris, ids, min, c, n) {
  const map = new Map(), sum = [], cnt = [], idx = [];
  const slot = (id, i) => { let s = map.get(id); if (s === undefined) { s = cnt.length; map.set(id, s); sum.push(0, 0, 0); cnt.push(0); } sum[s * 3] += tris[i * 3]; sum[s * 3 + 1] += tris[i * 3 + 1]; sum[s * 3 + 2] += tris[i * 3 + 2]; cnt[s]++; return s; };
  const slots = new Int32Array(ids.length); for (let i = 0; i < ids.length; i++) slots[i] = slot(ids[i], i);
  const used = new Int32Array(cnt.length).fill(-1); let V = 0;
  for (let i = 0; i < n; i++) { const a = slots[i * 3], b = slots[i * 3 + 1], d = slots[i * 3 + 2]; if (a === b || b === d || a === d) continue; for (const s of [a, b, d]) if (used[s] < 0) used[s] = V++; idx.push(used[a], used[b], used[d]); }
  const pos = new Float32Array(V * 3); for (let s = 0; s < cnt.length; s++) if (used[s] >= 0) { pos[used[s] * 3] = sum[s * 3] / cnt[s]; pos[used[s] * 3 + 1] = sum[s * 3 + 1] / cnt[s]; pos[used[s] * 3 + 2] = sum[s * 3 + 2] / cnt[s]; }
  return { pos, idx: Uint32Array.from(idx), cell: c, from: n };
}

// ------------------------------------------------------------------ mesh preparation and cache
/** Area-weighted smooth vertex normals. @param {Float32Array} pos @param {Uint32Array} idx */
export function vertexNormals(pos, idx) {
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3, ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // length = 2 x area: weights the sum
    for (const k of [a, b, c]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  return nrm;
}
/**
 * Make a render-ready mesh: orient to Y-up (up:'z' turns a slicer-style Z-up model upright), centre it on x and z, put its feet at y = 0, add smooth normals.
 * @param {{pos:Float32Array,idx:Uint32Array}} m @param {{up?:'z'|'y'}} [o]
 * @returns {{pos:Float32Array,nrm:Float32Array,idx:Uint32Array,V:number,T:number,height:number,radius:number,width:number,depth:number}}
 */
export function finishMesh(m, { up = 'z' } = {}) {
  const pos = Float32Array.from(m.pos);
  if (up === 'z') for (let i = 0; i < pos.length; i += 3) { const y = pos[i + 1], z = pos[i + 2]; pos[i + 1] = z; pos[i + 2] = -y; } // (x,y,z) -> (x,z,-y): a pure rotation, keeps handedness
  const { min, max } = bounds(pos), cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2; let radius = 0;
  for (let i = 0; i < pos.length; i += 3) { pos[i] -= cx; pos[i + 1] -= min[1]; pos[i + 2] -= cz; radius = Math.max(radius, Math.hypot(pos[i], pos[i + 2])); }
  return { pos, nrm: vertexNormals(pos, m.idx), idx: m.idx, V: pos.length / 3, T: m.idx.length / 3, height: max[1] - min[1], radius, width: max[0] - min[0], depth: max[2] - min[2] };
}
const MAGIC = 0x484d4e41; // 'ANMH'
/** Save a mesh (pos + idx) atomically: write a temp file, then rename, so two workers can race safely. */
export function saveMeshCache(file, m) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const head = Buffer.alloc(16); head.writeUInt32LE(MAGIC, 0); head.writeUInt32LE(m.pos.length / 3, 4); head.writeUInt32LE(m.idx.length / 3, 8);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`; // Date only names a temp file, never reaches a frame
  fs.writeFileSync(tmp, Buffer.concat([head, Buffer.from(m.pos.buffer, m.pos.byteOffset, m.pos.byteLength), Buffer.from(m.idx.buffer, m.idx.byteOffset, m.idx.byteLength)]));
  fs.renameSync(tmp, file);
}
/** Load a cached mesh, or null if missing or damaged. */
export function readMeshCache(file) {
  try {
    const b = fs.readFileSync(file); if (b.readUInt32LE(0) !== MAGIC) return null;
    const V = b.readUInt32LE(4), T = b.readUInt32LE(8); if (16 + V * 12 + T * 12 !== b.length) return null;
    const ab = b.buffer.slice(b.byteOffset + 16, b.byteOffset + b.length);
    return { pos: new Float32Array(ab, 0, V * 3), idx: new Uint32Array(ab, V * 12, T * 3) };
  } catch { return null; }
}
const DEFAULT_CACHE = path.join(import.meta.dirname, 'cache');
/** Cache file for a source STL and settings (key = name, size, mtime, target, version). */
export function cachePath(file, { target = 150000, cacheDir = DEFAULT_CACHE } = {}) {
  const st = fs.statSync(file); return path.join(cacheDir, `${path.basename(file, path.extname(file))}.${st.size}.${Math.round(st.mtimeMs)}.t${target}.v1.mesh`);
}
/**
 * The one call a card needs (use it in `export async function init()`): load the decimated mesh from the cache, or read the STL, decimate,
 * save the cache, and return the render-ready mesh. First run on a 43 MB file takes a few seconds; every later run loads in well under a second.
 * @param {string} file STL path @param {{target?:number,up?:'z'|'y',cacheDir?:string}} [o]
 * @returns {Promise<ReturnType<typeof finishMesh> & {fromCache:boolean}>}
 */
export async function loadMesh(file, o = {}) {
  const cf = cachePath(file, o); let m = readMeshCache(cf), fromCache = !!m;
  if (!m) { m = decimate(readSTL(file).tris, { target: o.target ?? 150000 }); saveMeshCache(cf, m); }
  return { ...finishMesh(m, { up: o.up ?? 'z' }), fromCache };
}

// ------------------------------------------------------------------ camera and framing
/** Where the model centre (half its height) sits on the screen is pose.cx, pose.cy. Pose: {yaw, pitch, scale (px per mm at the centre), cx, cy, dist (eye distance in mm)}. */
function poseConsts(mesh, pose) {
  const yaw = pose.yaw ?? 0, pitch = pose.pitch ?? 0.2, dist = pose.dist ?? 900, f = (pose.scale ?? 4) * dist;
  return { cY: Math.cos(yaw), sY: Math.sin(yaw), cP: Math.cos(pitch), sP: Math.sin(pitch), dist, f, cx: pose.cx ?? 540, cy: pose.cy ?? 900, hy: mesh.height / 2 };
}
/**
 * Project a point given in model coordinates (x, y up from the feet, z; before the yaw turn) to the screen. Use it to put rings, glows and shadows where the model is.
 * @returns {[number,number,number]} [x, y, depth in mm]
 */
export function projectModelPoint(mesh, pose, p) {
  const k = poseConsts(mesh, pose), x = p[0], y = p[1] - k.hy, z = p[2], x1 = k.cY * x + k.sY * z, z1 = -k.sY * x + k.cY * z;
  const y2 = k.cP * y + k.sP * z1, z2 = -k.sP * y + k.cP * z1, d = k.dist + z2; return [k.cx + k.f * x1 / d, k.cy - k.f * y2 / d, d];
}
/** Largest scale (px per mm) at which the turning model fits a box: width 2*radius, height from the pitch. */
export function fitScale(mesh, { maxW, maxH, pitch = 0.2 }) {
  return Math.min(maxW / (2 * mesh.radius), maxH / (mesh.height * Math.cos(pitch) + 2 * mesh.radius * Math.sin(pitch))) * 0.97;
}

// ------------------------------------------------------------------ shading
const norm3 = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
/** Default studio lights in VIEW space (x right, y up, z away): warm key from upper left front, cool fill from the right, green BGI rim from behind. */
export const LIGHTS = {
  albedo: [0.82, 0.85, 0.88], key: { dir: norm3([-0.62, 0.5, -0.6]), color: [1.0, 0.95, 0.88], k: 1.1 }, fill: { dir: norm3([0.8, 0.05, -0.45]), color: [0.4, 0.65, 0.95], k: 0.2 },
  rim: { dir: norm3([0.55, 0.3, 0.78]), color: [0.1, 0.95, 0.6], k: 0.75 }, ambient: { sky: [0.1, 0.12, 0.16], ground: [0.02, 0.025, 0.03] }, spec: 0.45, shine: 42, fresnel: 0.45, ao: 1,
};
const BACK_COLOR = [20, 150, 100], GLOW_COLOR = [150, 255, 215];

// ------------------------------------------------------------------ the rasteriser
let POOL = { n: 0, z: null, rgb: null }; // grown on demand, reused across frames
/**
 * Render one frame of the model into an offscreen image: transform, per-vertex lighting (key, fill, rim, hemisphere ambient, Blinn-Phong, Fresnel rim),
 * z-buffered triangle fill at `ss` x supersampling, screen-space cavity darkening (two scales), box downsample into straight alpha.
 * Optional print reveal: o.clipY (mm) cuts everything above that height, shows the inside as a green cap and lights a thin band at the cut.
 * @param {*} mesh from loadMesh @param {{yaw?:number,pitch?:number,scale?:number,cx?:number,cy?:number,dist?:number,clipY?:number}} pose
 * @param {{W?:number,H?:number,ss?:number,lights?:object,returnDepth?:boolean,glowMm?:number}} [o]
 * @returns {{cv:any,x0:number,y0:number,w:number,h:number,coverage:number,depth?:Float32Array,alpha?:Float32Array}}
 */
export function renderMesh(mesh, pose, o = {}) {
  const W = o.W ?? 1080, H = o.H ?? 1920, ss = o.ss ?? 2, L = { ...LIGHTS, ...(o.lights || {}) }, k = poseConsts(mesh, pose), clipY = pose.clipY ?? Infinity, clipOn = clipY < Infinity, glowMm = o.glowMm ?? 2.2;
  const { pos, nrm, idx, V, T } = mesh, sx = new Float32Array(V), sy = new Float32Array(V), sd = new Float32Array(V), col = new Float32Array(V * 3);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const A = L.albedo, kd = L.key.dir, fd = L.fill.dir, rd = L.rim.dir, S = L.ambient.sky, G = L.ambient.ground;
  const hk = norm3([kd[0], kd[1], kd[2] - 1]); // half vector with the eye at -z
  for (let v = 0, i = 0; v < V; v++, i += 3) {
    const x = pos[i], y = pos[i + 1] - k.hy, z = pos[i + 2], xa = k.cY * x + k.sY * z, za = -k.sY * x + k.cY * z, y2 = k.cP * y + k.sP * za, z2 = -k.sP * y + k.cP * za, d = k.dist + z2;
    const X = k.cx + k.f * xa / d, Y = k.cy - k.f * y2 / d; sx[v] = X; sy[v] = Y; sd[v] = d;
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    const nx0 = nrm[i], ny0 = nrm[i + 1], nz0 = nrm[i + 2], nxa = k.cY * nx0 + k.sY * nz0, nza = -k.sY * nx0 + k.cY * nz0, nx = nxa, ny = k.cP * ny0 + k.sP * nza, nz = -k.sP * ny0 + k.cP * nza;
    const dk = Math.max(0, nx * kd[0] + ny * kd[1] + nz * kd[2]), df = Math.max(0, nx * fd[0] + ny * fd[1] + nz * fd[2]), hemi = ny * 0.5 + 0.5;
    const ndv = Math.max(0, -nz), fr = Math.pow(1 - ndv, 3) * L.fresnel, rm = Math.pow(Math.max(0, nx * rd[0] + ny * rd[1] + nz * rd[2]), 1.4) * L.rim.k, sp = Math.pow(Math.max(0, nx * hk[0] + ny * hk[1] + nz * hk[2]), L.shine) * L.spec * dk;
    for (let c = 0; c < 3; c++) {
      const amb = G[c] + (S[c] - G[c]) * hemi, lit = A[c] * (amb + L.key.k * L.key.color[c] * dk + L.fill.k * L.fill.color[c] * df) + sp * L.key.color[c] + L.rim.color[c] * (rm + fr * 0.6) * (0.35 + 0.65 * hemi);
      col[v * 3 + c] = 255 * (1 - Math.exp(-1.25 * lit)); // soft shoulder: no clipped whites
    }
  }
  x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2); x1 = Math.min(W, Math.ceil(x1) + 2); y1 = Math.min(H, Math.ceil(y1) + 2);
  const rw = x1 - x0, rh = y1 - y0; if (rw <= 0 || rh <= 0) return { cv: createCanvas(1, 1), x0: 0, y0: 0, w: 1, h: 1, coverage: 0 };
  const Rw = rw * ss, Rh = rh * ss, N = Rw * Rh; if (POOL.n < N) POOL = { n: N, z: new Float32Array(N), rgb: new Uint8ClampedArray(N * 3) };
  const zb = POOL.z, img = POOL.rgb; zb.fill(Infinity, 0, N);
  // sub-pixel coordinates in the supersampled region
  const px = new Float32Array(V), py = new Float32Array(V); for (let v = 0; v < V; v++) { px[v] = (sx[v] - x0) * ss; py[v] = (sy[v] - y0) * ss; }
  const yw = clipOn ? new Float32Array(V) : null; if (clipOn) for (let v = 0; v < V; v++) yw[v] = pos[v * 3 + 1];
  for (let t = 0; t < T; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2], ax = px[a], ay = py[a], bx = px[b], by = py[b], cx = px[c], cy = py[c];
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (area === 0) continue;
    const back = area < 0; // outward-facing triangles wind positive in this y-down screen space (checked by the cube test)
    if (back && !clipOn) continue;
    if (clipOn && Math.min(yw[a], yw[b], yw[c]) > clipY) continue;
    const minx = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxx = Math.min(Rw - 1, Math.ceil(Math.max(ax, bx, cx))), miny = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxy = Math.min(Rh - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minx > maxx || miny > maxy) continue;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy), id = 1 / den, dw0 = (by - cy) * id, dw1 = (cy - ay) * id, da = sd[a], db = sd[b], dc = sd[c];
    const a3 = a * 3, b3 = b * 3, c3 = c * 3, ya = clipOn ? yw[a] : 0, yb = clipOn ? yw[b] : 0, yc = clipOn ? yw[c] : 0, allBelow = clipOn && Math.max(ya, yb, yc) <= clipY - glowMm;
    for (let y = miny; y <= maxy; y++) {
      const pyy = y + 0.5; let w0 = ((by - cy) * (minx + 0.5 - cx) + (cx - bx) * (pyy - cy)) * id, w1 = ((cy - ay) * (minx + 0.5 - cx) + (ax - cx) * (pyy - cy)) * id, row = y * Rw;
      for (let x = minx; x <= maxx; x++, w0 += dw0, w1 += dw1) {
        const w2 = 1 - w0 - w1; if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const d = w0 * da + w1 * db + w2 * dc, q = row + x; if (d >= zb[q]) continue;
        let r, g, bl;
        if (back) { // looking into the cut: flat green cap
          const yy = w0 * ya + w1 * yb + w2 * yc; if (yy > clipY) continue; r = BACK_COLOR[0]; g = BACK_COLOR[1]; bl = BACK_COLOR[2];
        } else {
          if (clipOn && !allBelow) { const yy = w0 * ya + w1 * yb + w2 * yc; if (yy > clipY) continue; if (yy > clipY - glowMm) { const gk = (yy - (clipY - glowMm)) / glowMm; r = (w0 * col[a3] + w1 * col[b3] + w2 * col[c3]) * (1 - gk) + GLOW_COLOR[0] * gk; g = (w0 * col[a3 + 1] + w1 * col[b3 + 1] + w2 * col[c3 + 1]) * (1 - gk) + GLOW_COLOR[1] * gk; bl = (w0 * col[a3 + 2] + w1 * col[b3 + 2] + w2 * col[c3 + 2]) * (1 - gk) + GLOW_COLOR[2] * gk; zb[q] = d; const p3 = q * 3; img[p3] = r; img[p3 + 1] = g; img[p3 + 2] = bl; continue; } }
          r = w0 * col[a3] + w1 * col[b3] + w2 * col[c3]; g = w0 * col[a3 + 1] + w1 * col[b3 + 1] + w2 * col[c3 + 1]; bl = w0 * col[a3 + 2] + w1 * col[b3 + 2] + w2 * col[c3 + 2];
        }
        zb[q] = d; const p3 = q * 3; img[p3] = r; img[p3 + 1] = g; img[p3 + 2] = bl;
      }
    }
  }
  // ---- resolve: box-downsample the subsamples (coverage, mean colour of covered, mean depth of covered)
  const n1 = rw * rh, alpha = new Float32Array(n1), dep = new Float32Array(n1), rgb = new Float32Array(n1 * 3), ss2 = ss * ss; let covered = 0;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    let cnt = 0, sd_ = 0, r = 0, g = 0, b = 0;
    for (let j = 0; j < ss; j++) { const row = (y * ss + j) * Rw + x * ss; for (let i = 0; i < ss; i++) { const q = row + i, z = zb[q]; if (z !== Infinity) { cnt++; sd_ += z; r += img[q * 3]; g += img[q * 3 + 1]; b += img[q * 3 + 2]; } } }
    const p = y * rw + x; if (cnt) { alpha[p] = cnt / ss2; dep[p] = sd_ / cnt; rgb[p * 3] = r / cnt; rgb[p * 3 + 1] = g / cnt; rgb[p * 3 + 2] = b / cnt; covered++; }
  }
  // ---- cavity darkening: a pixel deeper than the covered-pixel mean around it is in a pit (eye, groove, crease, under a limb)
  const ao = new Float32Array(n1).fill(1), aoK = L.ao ?? 1;
  if (aoK > 0 && covered) for (const [mm, depthMm, w] of [[0.8, 1.6, 0.38], [3.2, 6.0, 0.4]]) {
    const R = Math.max(2, Math.round(mm * (pose.scale ?? 4))), M = boxBlur(dep, alpha, rw, rh, R, true), C = boxBlur(alpha, alpha, rw, rh, R, false);
    for (let p = 0; p < n1; p++) if (alpha[p] > 0 && C[p] > 1e-3) { const diff = dep[p] - M[p] / C[p], oc = Math.min(1, Math.max(0, diff / depthMm)) * (1 - Math.min(1, Math.max(0, (diff - depthMm * 1.5) / (depthMm * 2)))); ao[p] -= w * aoK * oc; } // big depth jumps (a limb over a wing) fade out: no halos
  }
  const cv = createCanvas(rw, rh), c2 = cv.getContext('2d'), id2 = c2.createImageData(rw, rh), d2 = id2.data;
  for (let p = 0; p < n1; p++) { const a = alpha[p]; if (!a) continue; const m = Math.max(0.25, ao[p]); d2[p * 4] = rgb[p * 3] * m; d2[p * 4 + 1] = rgb[p * 3 + 1] * m; d2[p * 4 + 2] = rgb[p * 3 + 2] * m; d2[p * 4 + 3] = Math.round(a * 255); }
  c2.putImageData(id2, 0, 0);
  const out = { cv, x0, y0, w: rw, h: rh, coverage: covered / n1 }; if (o.returnDepth) { out.depth = dep; out.alpha = alpha; } return out;
}
/** Separable box blur of src (optionally weighted by the alpha mask), radius R px. */
function boxBlur(src, mask, w, h, R, weighted) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), val = i => weighted ? src[i] * mask[i] : src[i];
  for (let y = 0; y < h; y++) { let s = 0; const row = y * w; for (let x = -R; x <= R; x++) if (x >= 0 && x < w) s += val(row + x); for (let x = 0; x < w; x++) { tmp[row + x] = s; const add = x + R + 1, rem = x - R; if (add < w) s += val(row + add); if (rem >= 0) s -= val(row + rem); } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -R; y <= R; y++) if (y >= 0 && y < h) s += tmp[y * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s; const add = y + R + 1, rem = y - R; if (add < h) s += tmp[add * w + x]; if (rem >= 0) s -= tmp[rem * w + x]; } }
  return out;
}
/**
 * Render and draw into ctx. Returns the render result. Use o.alpha to fade the whole model.
 * @param {*} ctx @param {*} mesh @param {*} pose @param {*} [o] see renderMesh, plus alpha
 */
export function drawMesh(ctx, mesh, pose, o = {}) {
  const r = renderMesh(mesh, pose, o); ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.drawImage(r.cv, r.x0, r.y0); ctx.restore(); return r;
}
/** Mirror reflection on a glossy floor: the rendered model flipped about baseY, faded by a gradient. Call BEFORE drawing the model, clipped to the floor shape if needed. */
export function drawReflection(ctx, r, baseY, { alpha = 0.22, fadePx = 260 } = {}) {
  const t = createCanvas(r.w, r.h), c = t.getContext('2d'); c.drawImage(r.cv, 0, 0); c.globalCompositeOperation = 'destination-in';
  const bottom = baseY - r.y0, g = c.createLinearGradient(0, bottom, 0, bottom - fadePx); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, r.w, r.h);
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(0, 2 * baseY); ctx.scale(1, -1); ctx.drawImage(t, r.x0, r.y0); ctx.restore();
}

// ------------------------------------------------------------------ procedural meshes (tests, fallbacks, quick props)
/** A UV sphere as {pos, idx}, outward winding. @param {number} [R=1] @param {number} [seg=48] longitudes @param {number[]} [c=[0,0,0]] centre */
export function makeSphere(R = 1, seg = 48, c = [0, 0, 0]) {
  const rings = Math.max(4, seg >> 1), pos = [], idx = [];
  for (let i = 0; i <= rings; i++) { const th = Math.PI * i / rings; for (let j = 0; j < seg; j++) { const ph = 2 * Math.PI * j / seg; pos.push(c[0] + R * Math.sin(th) * Math.cos(ph), c[1] + R * Math.cos(th), c[2] + R * Math.sin(th) * Math.sin(ph)); } }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + (j + 1) % seg, d = (i + 1) * seg + j, e = (i + 1) * seg + (j + 1) % seg; if (i > 0) idx.push(a, b, d); if (i < rings - 1) idx.push(b, e, d); }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}
/** A (2,3) torus knot tube as {pos, idx}: a good stand-in prop with real curvature and self-occlusion. */
export function makeTorusKnot({ p = 2, q = 3, R = 30, r = 9, seg = 240, tube = 24 } = {}) {
  const pos = [], idx = [], P = u => { const cu = Math.cos(p * u), su = Math.sin(p * u), rr = R * (2 + Math.cos(q * u)) * 0.5; return [rr * cu, R * Math.sin(q * u) * 0.5, rr * su]; };
  for (let i = 0; i < seg; i++) {
    const u = 2 * Math.PI * i / seg, a = P(u), b = P(u + 0.01), T = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], tl = Math.hypot(...T); T[0] /= tl; T[1] /= tl; T[2] /= tl;
    let N = [-a[0], -a[1], -a[2]]; const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2]; N = [N[0] - T[0] * d, N[1] - T[1] * d, N[2] - T[2] * d]; const nl = Math.hypot(...N); N = N.map(x => x / nl);
    const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    for (let j = 0; j < tube; j++) { const v = 2 * Math.PI * j / tube, cv = Math.cos(v) * r, sv = Math.sin(v) * r; pos.push(a[0] + N[0] * cv + B[0] * sv, a[1] + N[1] * cv + B[1] * sv, a[2] + N[2] * cv + B[2] * sv); }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < tube; j++) { const a = i * tube + j, b = i * tube + (j + 1) % tube, c = ((i + 1) % seg) * tube + j, d = ((i + 1) % seg) * tube + (j + 1) % tube; idx.push(a, b, c, b, d, c); }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}
/** Merge indexed meshes into one. @param {...{pos:Float32Array,idx:Uint32Array}} ms */
export function concatMeshes(...ms) {
  const pos = new Float32Array(ms.reduce((s, m) => s + m.pos.length, 0)), idx = new Uint32Array(ms.reduce((s, m) => s + m.idx.length, 0)); let po = 0, io = 0;
  for (const m of ms) { pos.set(m.pos, po); for (let i = 0; i < m.idx.length; i++) idx[io + i] = m.idx[i] + po / 3; po += m.pos.length; io += m.idx.length; }
  return { pos, idx };
}
/** Indexed mesh to a triangle soup (for writing an STL). */
export function toSoup(m) { const t = new Float32Array(m.idx.length * 3); for (let i = 0; i < m.idx.length; i++) for (let k = 0; k < 3; k++) t[i * 3 + k] = m.pos[m.idx[i] * 3 + k]; return t; }
