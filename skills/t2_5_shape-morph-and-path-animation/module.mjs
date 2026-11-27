// t2.5 shape-morph-and-path-animation: SVG path parsing, stroke draw-on (trim paths), morphing between shapes and icons, motion along a path.
// Paths are flattened to polylines once (makePath), then everything is arc-length based, so speeds are even and trims are exact.
import fs from 'node:fs';
import { E, prog, clamp, lerp, rgba } from '../../engine/ease.mjs';

const TAU = Math.PI * 2;
/** Path of the lucide icon files (same variable the engine's icon() uses). */
const LUCIDE = process.env.ANNIE_LUCIDE || '/Users/cris/Desktop/AEON-wt-deps/node_modules/lucide-react/dist/esm/icons';

/** Seconds and easing per path job (house defaults). */
export const RECIPES = {
  drawOn:  { ease: 'inOutCubic', dur: 1.0, use: 'a line, check mark or chart drawing itself (0.6-1.4 s; long paths up to 1.4 s)' },
  morph:   { ease: 'inOutCubic', dur: 0.6, use: 'icon to icon (play to pause, menu to x): 0.5-0.7 s, with stagger 0.3' },
  follow:  { ease: 'inOutCubic', dur: 1.6, use: 'an object travelling a curve: 1.2-2.4 s, oriented to the tangent' },
  chase:   { ease: 'linear',     dur: 1.2, use: 'a bright window of 20-30 percent of the length running along a path, looped' },
};

// ---------------------------------------------------------------- parsing
/** Scanner over an SVG path string: numbers and (compact) arc flags. */
function scanner(d) {
  let i = 0; const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  return {
    cmd() { ws(); return i < d.length && /[a-zA-Z]/.test(d[i]) ? d[i++] : null; },
    more() { ws(); return i < d.length && !/[a-zA-Z]/.test(d[i]); },
    num() { ws(); const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i)); if (!m) throw new Error(`bad number at ${i} in "${d}"`); i += m[0].length; return parseFloat(m[0]); },
    flag() { ws(); const c = d[i++]; if (c !== '0' && c !== '1') throw new Error(`bad arc flag at ${i - 1}`); return +c; },
  };
}

function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs_, x2, y2) {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return x1 === x2 && y1 === y2 ? [] : [['L', x2, y2]];
  const phi = phiDeg * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  rx = Math.abs(rx); ry = Math.abs(ry); const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const sign = fa === fs_ ? -1 : 1, num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p, co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx, cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry); let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs_ && dth > 0) dth -= TAU; else if (fs_ && dth < 0) dth += TAU;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), dd = dth / n, k = 4 / 3 * Math.tan(dd / 4), out = [];
  const map = (u, v) => [cx + cp * rx * u - sp * ry * v, cy + sp * rx * u + cp * ry * v];
  for (let i = 0; i < n; i++) {
    const a1 = th1 + i * dd, a2 = a1 + dd, c1 = map(Math.cos(a1) - k * Math.sin(a1), Math.sin(a1) + k * Math.cos(a1)), c2 = map(Math.cos(a2) + k * Math.sin(a2), Math.sin(a2) - k * Math.cos(a2)), p = i === n - 1 ? [x2, y2] : map(Math.cos(a2), Math.sin(a2));
    out.push(['C', c1[0], c1[1], c2[0], c2[1], p[0], p[1]]);
  }
  return out;
}

/**
 * Parse an SVG path `d` into absolute commands: M, L, C, Z only (H, V, S, Q, T and arcs are converted; relative commands made absolute).
 * @param {string} d @returns {Array<['M'|'L'|'C'|'Z', ...number[]]>}
 */
export function parseSvgPath(d) {
  const s = scanner(d), out = []; let x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null, cmd = null, prev = null;
  while (true) {
    const c = s.cmd(); if (c) cmd = c; else if (!s.more()) break; else if (!cmd) throw new Error('path must start with a command');
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { out.push(['Z']); x = sx; y = sy; lc = lq = null; prev = 'Z'; cmd = null; continue; }
    if (C === 'M') { const nx = s.num() + ox, ny = s.num() + oy; out.push(['M', nx, ny]); x = sx = nx; y = sy = ny; cmd = rel ? 'l' : 'L'; lc = lq = null; prev = 'M'; continue; }
    if (C === 'L') { x = s.num() + ox; y = s.num() + oy; out.push(['L', x, y]); lc = lq = null; }
    else if (C === 'H') { x = s.num() + ox; out.push(['L', x, y]); lc = lq = null; }
    else if (C === 'V') { y = s.num() + oy; out.push(['L', x, y]); lc = lq = null; }
    else if (C === 'C') { const a = s.num() + ox, b = s.num() + oy, c2x = s.num() + ox, c2y = s.num() + oy, nx = s.num() + ox, ny = s.num() + oy; out.push(['C', a, b, c2x, c2y, nx, ny]); lc = [c2x, c2y]; lq = null; x = nx; y = ny; }
    else if (C === 'S') { const a = lc ? 2 * x - lc[0] : x, b = lc ? 2 * y - lc[1] : y, c2x = s.num() + ox, c2y = s.num() + oy, nx = s.num() + ox, ny = s.num() + oy; out.push(['C', a, b, c2x, c2y, nx, ny]); lc = [c2x, c2y]; lq = null; x = nx; y = ny; }
    else if (C === 'Q' || C === 'T') {
      let qx, qy; if (C === 'Q') { qx = s.num() + ox; qy = s.num() + oy; } else { qx = lq ? 2 * x - lq[0] : x; qy = lq ? 2 * y - lq[1] : y; }
      const nx = s.num() + ox, ny = s.num() + oy; out.push(['C', x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), nx + 2 / 3 * (qx - nx), ny + 2 / 3 * (qy - ny), nx, ny]); lq = [qx, qy]; lc = null; x = nx; y = ny;
    } else if (C === 'A') {
      const rx = s.num(), ry = s.num(), rot = s.num(), fa = s.flag(), fs2 = s.flag(), nx = s.num() + ox, ny = s.num() + oy;
      out.push(...arcToCubics(x, y, rx, ry, rot, fa, fs2, nx, ny)); x = nx; y = ny; lc = lq = null;
    } else throw new Error(`unsupported command ${cmd}`);
    prev = C;
  }
  return out;
}

// ---------------------------------------------------------------- paths
/**
 * @typedef {{pts:number[][],closed:boolean,cum:number[],len:number}} Sub
 * @typedef {{subs:Sub[],len:number}} Path
 */
const subOf = (pts, closed) => {
  if (closed && pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) > 1e-9) pts = [...pts, pts[0]]; // closed subpaths store the closing point
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, closed, cum, len: cum.at(-1) };
};
/** Build a Path from subpaths (arrays of points). Total length is the sum of the subpath lengths. @param {{pts:number[][],closed?:boolean}[]} subs @returns {Path} */
export function pathFromPoints(subs) { const ss = subs.map(s => subOf(s.pts, !!s.closed)); return { subs: ss, len: ss.reduce((a, s) => a + s.len, 0) }; }

/**
 * Flatten SVG path data to a Path (polylines). step = max segment length in the path's own units (0.2 for 24-unit icons, 4 for pixel paths).
 * @param {string|string[]} d one or several `d` strings @param {{step?:number}} [o] @returns {Path}
 */
export function makePath(d, { step = 0.2 } = {}) {
  const cmds = (Array.isArray(d) ? d : [d]).flatMap(parseSvgPath), subs = []; let cur = null, x = 0, y = 0;
  const end = closed => { if (cur && cur.length > 1) subs.push({ pts: cur, closed }); cur = null; };
  for (const c of cmds) {
    if (c[0] === 'M') { end(false); cur = [[c[1], c[2]]]; x = c[1]; y = c[2]; }
    else if (c[0] === 'L') { cur ??= [[x, y]]; cur.push([c[1], c[2]]); x = c[1]; y = c[2]; }
    else if (c[0] === 'C') {
      cur ??= [[x, y]]; const [a, b, c2, d2, nx, ny] = c.slice(1), approx = Math.hypot(a - x, b - y) + Math.hypot(c2 - a, d2 - b) + Math.hypot(nx - c2, ny - d2), n = clamp(Math.ceil(approx / step), 4, 160);
      for (let i = 1; i <= n; i++) { const u = i / n, v = 1 - u; cur.push([v * v * v * x + 3 * v * v * u * a + 3 * v * u * u * c2 + u * u * u * nx, v * v * v * y + 3 * v * v * u * b + 3 * v * u * u * d2 + u * u * u * ny]); }
      x = nx; y = ny;
    } else if (c[0] === 'Z') { if (cur) { const f = cur[0]; end(true); x = f[0]; y = f[1]; } }
  }
  end(false); return pathFromPoints(subs);
}

/** Convert a lucide icon (by name) to path data strings (circles, rects, lines, polylines become paths). @param {string} name e.g. 'play' @returns {string[]} */
export function iconPaths(name) {
  const src = fs.readFileSync(`${LUCIDE}/${name}.mjs`, 'utf8'), m = src.match(/__iconNode = (\[[\s\S]*?\]);/), dd = src.match(/__iconData = (\{[\s\S]*?\n\});/);
  const node = m ? Function(`return ${m[1]}`)() : Function(`return ${dd[1]}`)().node, out = [];
  for (const [tg, a] of node) {
    if (tg === 'path') out.push(a.d);
    else if (tg === 'circle') { const cx = +a.cx, cy = +a.cy, r = +a.r; out.push(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`); }
    else if (tg === 'ellipse') { const cx = +a.cx, cy = +a.cy, rx = +a.rx, ry = +a.ry; out.push(`M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`); }
    else if (tg === 'rect') { const x = +(a.x || 0), y = +(a.y || 0), w = +a.width, h = +a.height, r = Math.min(+(a.rx || 0), w / 2, h / 2); out.push(r ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z` : `M${x} ${y}H${x + w}V${y + h}H${x}Z`); }
    else if (tg === 'line') out.push(`M${a.x1} ${a.y1}L${a.x2} ${a.y2}`);
    else if (tg === 'polyline' || tg === 'polygon') { const q = a.points.trim().split(/[\s,]+/).map(Number); let s = `M${q[0]} ${q[1]}`; for (let i = 2; i < q.length; i += 2) s += `L${q[i]} ${q[i + 1]}`; out.push(tg === 'polygon' ? s + 'Z' : s); }
  }
  return out;
}
/** A lucide icon as a Path (24 x 24 units). @param {string} name @param {{step?:number}} [o] @returns {Path} */
export const iconPath = (name, o) => makePath(iconPaths(name), o);

/** Place a Path in pixels: scale s about the origin then translate to x, y. Returns a new Path (line widths then stay in px). @param {Path} p @param {{x:number,y:number,s:number}} at @returns {Path} */
export function place(p, { x, y, s }) { return pathFromPoints(p.subs.map(sub => ({ closed: sub.closed, pts: sub.pts.map(q => [x + q[0] * s, y + q[1] * s]) }))); }

/** Bounding box [x0,y0,x1,y1] of a Path. */
export function bbox(p) { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const s of p.subs) for (const q of s.pts) a = [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[0]), Math.max(a[3], q[1])]; return a; }

/** Point on a polyline at arc length L: {x, y, angle (tangent, radians)}. */
function onSub(sub, L) {
  const { pts, cum } = sub; L = clamp(L, 0, sub.len); let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= L) lo = mid; else hi = mid; }
  const seg = cum[hi] - cum[lo] || 1, u = (L - cum[lo]) / seg, a = pts[lo], b = pts[hi];
  return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
/**
 * Point and heading at fraction s (0..1) of the total length, constant speed. The heading is smoothed over 2 percent of the length so a polyline corner does not snap.
 * @param {Path} p @param {number} s @returns {{x:number,y:number,angle:number}}
 */
export function pointAt(p, s) {
  const at = L => { let acc = L; for (const sub of p.subs) { if (acc <= sub.len + 1e-9) return onSub(sub, acc); acc -= sub.len; } return onSub(p.subs.at(-1), p.subs.at(-1).len); };
  const L = clamp(s) * p.len, h = Math.max(p.len * 0.01, 1e-6), a = at(Math.max(0, L - h)), b = at(Math.min(p.len, L + h)), c = at(L);
  return { x: c.x, y: c.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Resample a polyline to n points equally spaced along its length (first and last kept). @param {number[][]} pts @param {number} n @returns {number[][]} */
export function resample(pts, n) {
  const sub = subOf(pts, false), out = [];
  for (let i = 0; i < n; i++) { const L = sub.len * i / (n - 1), q = onSub(sub, L); out.push([q.x, q.y]); }
  if (sub.len === 0) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]]);
  return out;
}

// ---------------------------------------------------------------- drawing: draw-on (trim paths)
/**
 * Draw the part of a Path between fractions `from` and `to` of its total length (a stroke that draws itself, or a window that runs along it).
 * Optional glow under the stroke and a bright head dot at the leading end. Widths are in px, so place() the path first.
 * @param {*} ctx @param {Path} p @param {{from?:number,to?:number,color?:string,width?:number,glow?:string|null,head?:string|null,alpha?:number,cap?:CanvasLineCap}} [o]
 */
export function drawOn(ctx, p, { from = 0, to = 1, color = '#19e08f', width = 8, glow = null, head = null, alpha = 1, cap = 'round' } = {}) {
  from = clamp(from); to = clamp(to); if (to - from <= 1e-6) return;
  const a = from * p.len, b = to * p.len; let off = 0;
  const stroke = (w, col, al) => {
    ctx.save(); ctx.lineCap = cap; ctx.lineJoin = 'round'; ctx.lineWidth = w; ctx.strokeStyle = col; ctx.globalAlpha *= al; off = 0;
    for (const sub of p.subs) {
      const s0 = Math.max(a - off, 0), s1 = Math.min(b - off, sub.len); off += sub.len; if (s1 - s0 <= 1e-9) continue;
      ctx.beginPath(); const q0 = onSub(sub, s0); ctx.moveTo(q0.x, q0.y);
      for (let i = 1; i < sub.pts.length; i++) { if (sub.cum[i] <= s0) continue; if (sub.cum[i - 1] >= s1) break; if (sub.cum[i] < s1) ctx.lineTo(sub.pts[i][0], sub.pts[i][1]); }
      const q1 = onSub(sub, s1); ctx.lineTo(q1.x, q1.y); ctx.stroke();
    }
    ctx.restore();
  };
  if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; stroke(width * 3.2, rgba(glow, 0.18), alpha); stroke(width * 1.8, rgba(glow, 0.3), alpha); ctx.restore(); }
  stroke(width, color, alpha);
  if (head) { const q = pointAt(p, to); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, width * 3.2); g.addColorStop(0, rgba(head, 0.95)); g.addColorStop(1, rgba(head, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, width * 3.2, 0, TAU); ctx.fill(); ctx.restore(); }
}

/** Fill the closed subpaths of a Path (the fill that fades in after a draw-on). */
export function fillPath(ctx, p, color, alpha = 1) { ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.beginPath(); for (const s of p.subs) { s.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); if (s.closed) ctx.closePath(); } ctx.fill('nonzero'); ctx.restore(); }

/** A running window along a path for loops: returns {from, to} for drawOn. frac = window length (0.25); cycle phase 0..1 (use loop(t, period)). */
export function chaseWindow(phase, frac = 0.25) { const e = phase * (1 + frac); return { from: clamp(e - frac), to: clamp(e) }; }

// ---------------------------------------------------------------- morph
const areaBox = s => { const xs = s.pts.map(q => q[0]), ys = s.pts.map(q => q[1]); return (Math.max(...xs) - Math.min(...xs) + 1e-6) * (Math.max(...ys) - Math.min(...ys) + 1e-6) + s.len * 1e-3; };

/**
 * Prepare a morph between two Paths. Subpaths are paired by size (biggest with biggest); a subpath with no partner grows from, or collapses to, the centre of the other icon.
 * Each pair is resampled to n points and the start point and direction are chosen to minimise total travel.
 * @param {Path} A @param {Path} B @param {{n?:number}} [o] n points per subpath (96 is smooth)
 */
export function prepareMorph(A, B, { n = 96 } = {}) {
  const sa = [...A.subs].sort((x, y) => areaBox(y) - areaBox(x)), sb = [...B.subs].sort((x, y) => areaBox(y) - areaBox(x)), pairs = [];
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    let a = sa[i], b = sb[i]; const ghost = (s, c) => ({ pts: [c, c], closed: s.closed }), bc = P => { const q = bbox(P); return [(q[0] + q[2]) / 2, (q[1] + q[3]) / 2]; };
    if (!a) a = ghost(b, bc(A)); if (!b) b = ghost(a, bc(B)); // a missing partner grows from (or collapses to) the centre of the other icon
    const closed = a.closed && b.closed;
    const pa0 = closed ? a.pts.slice(0, -1) : a.pts, pb0 = closed ? b.pts.slice(0, -1) : b.pts;
    let ra = closed ? resample([...pa0, pa0[0]], n + 1).slice(0, n) : resample(pa0, n), rb = closed ? resample([...pb0, pb0[0]], n + 1).slice(0, n) : resample(pb0, n);
    let best = Infinity, bestB = rb; const cost = (u, v) => u.reduce((s, q, i) => s + (q[0] - v[i][0]) ** 2 + (q[1] - v[i][1]) ** 2, 0);
    for (const dir of [1, -1]) { const cand = dir === 1 ? rb : [...rb].reverse(); const shifts = closed ? n : 1; for (let sft = 0; sft < shifts; sft += closed ? 1 : 1) { const rot = closed ? cand.slice(sft).concat(cand.slice(0, sft)) : cand; const c = cost(ra, rot); if (c < best) { best = c; bestB = rot; } } }
    pairs.push({ a: ra, b: bestB, closed, costAligned: best, costDirect: cost(ra, rb) });
  }
  return { pairs, n };
}

/**
 * The morphed Path at progress k (0 = A, 1 = B). stagger 0..1 makes the change travel along the outline instead of happening everywhere at once
 * (0.3 looks organic; 0 looks mechanical). Feed the result to drawOn(ctx, path) or fillPath.
 * @param {ReturnType<typeof prepareMorph>} prep @param {number} k @param {{stagger?:number}} [o] @returns {Path}
 */
export function morphPath(prep, k, { stagger = 0.3 } = {}) {
  k = clamp(k);
  return pathFromPoints(prep.pairs.map(({ a, b, closed }) => ({ closed, pts: a.map((q, i) => { const ki = clamp((k * (1 + stagger) - stagger * i / (a.length - 1)) ), e = ki; return [lerp(q[0], b[i][0], e), lerp(q[1], b[i][1], e)]; }) })));
}

// ---------------------------------------------------------------- motion along a path
/**
 * Position and heading of an object that travels a Path. k is the (already eased) fraction of the length. Use `orient: false` to keep it upright.
 * @param {Path} p @param {number} k @param {{orient?:boolean}} [o] @returns {{x:number,y:number,angle:number}}
 */
export function follow(p, k, { orient = true } = {}) { const q = pointAt(p, k); return orient ? q : { ...q, angle: 0 }; }

/** Draw `fn` at the follower position, rotated to its heading (fn draws the object pointing right, centred on 0,0). @param {*} ctx @param {{x:number,y:number,angle:number}} f @param {(ctx:any)=>void} fn @param {number} [scale] */
export function drawFollower(ctx, f, fn, scale = 1) { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle); ctx.scale(scale, scale); fn(ctx); ctx.restore(); }

/** Total length of a Path in its own units. */
export const length = p => p.len;
