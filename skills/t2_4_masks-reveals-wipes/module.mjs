// t2.4 masks-reveals-wipes: clip and mask reveals (wipe, iris, split, diagonal, scan, ink, soft) and text reveals.
// A reveal takes progress k (0..1, already eased: use maskK) and a draw function. k <= 0 draws nothing; k >= 1 draws the content
// with NO mask, so the finished frame is pixel-identical to the plain draw. All functions are pure in (k, seed).
import { E, prog, clamp, lerp, rgba } from '../../engine/ease.mjs';
import { rng } from '../../engine/rng.mjs';
import { createCanvas, setFont, textW } from '../../engine/canvas.mjs';

/** Easing and seconds per reveal, from the tt10 cards (page in 0.4, hook line 0.32, exits 0.35). `ease` is a name in E. */
export const RECIPES = {
  wipe:     { ease: 'inOutCubic', dur: 0.6,  use: 'cards, images, bars: clean, directional' },
  iris:     { ease: 'inOutCubic', dur: 0.7,  use: 'focus on one object, badges, avatars' },
  split:    { ease: 'outCubic',   dur: 0.55, use: 'banners and titles opening from the middle' },
  diagonal: { ease: 'inOutCubic', dur: 0.65, use: 'scene changes, hero panels: more energy than a straight wipe' },
  scan:     { ease: 'outCubic',   dur: 0.8,  use: 'tech and data panels, "loading" looks' },
  ink:      { ease: 'inOutQuad',  dur: 0.9,  use: 'organic, playful reveals and transitions' },
  soft:     { ease: 'inOutCubic', dur: 0.7,  use: 'photos and gradients where a hard edge looks cheap' },
  textRise: { ease: 'outCubic',   dur: 0.32, use: 'headlines: each line rises out of a mask, 0.07 s apart' },
  textWipe: { ease: 'inOutCubic', dur: 0.5,  use: 'short labels and numbers with a bright edge' },
  exit:     { ease: 'inCubic',    dur: 0.35, use: 'any reveal run backwards (pass 1 - k or out: true)' },
};

/** Eased progress of a recipe starting at t0: `maskK(t, 2.0, 'wipe')`. @param {number} t @param {number} t0 @param {keyof typeof RECIPES} name @param {{dur?:number}} [o] */
export function maskK(t, t0, name, o = {}) { const r = RECIPES[name]; if (!r) throw new Error(`unknown recipe ${name}`); return E[r.ease](prog(t, t0, t0 + (o.dur ?? r.dur))); }

const clipPoly = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.clip(); };
const inside = (ctx, k, clipFn, fn) => { ctx.save(); clipFn(); fn(ctx); ctx.restore(); };

/**
 * Wipe: a straight edge sweeps across the box. `out` makes the content leave in the same direction (the edge keeps going).
 * @param {*} ctx @param {number} k 0..1 @param {{box:[number,number,number,number],dir?:'right'|'left'|'down'|'up',out?:boolean}} o @param {(ctx:any)=>void} fn draws the content
 * @returns {{x1:number,y1:number,x2:number,y2:number}|null} the moving edge, for edgeLine()
 */
export function revealRect(ctx, k, { box, dir = 'right', out = false }, fn) {
  const [x, y, w, h] = box; k = clamp(k);
  if (out ? k >= 1 : k <= 0) return null; if (out ? k <= 0 : k >= 1) { fn(ctx); return null; }
  const horiz = dir === 'right' || dir === 'left', fwd = dir === 'right' || dir === 'down', L = horiz ? w : h, e = fwd ? L * k : L * (1 - k); // e = the edge, measured from the box start
  const [a, b] = (out ? !fwd : fwd) ? [0, e] : [e, L]; // visible run along the axis
  inside(ctx, k, () => { ctx.beginPath(); ctx.rect(...(horiz ? [x + a, y, b - a, h] : [x, y + a, w, b - a])); ctx.clip(); }, fn);
  return horiz ? { x1: x + e, y1: y, x2: x + e, y2: y + h } : { x1: x, y1: y + e, x2: x + w, y2: y + e };
}

/**
 * Iris: a circle grows from a point (default the box centre) until it covers the box. For an iris OUT pass 1 - k. The circle is also clipped to the box.
 * @param {*} ctx @param {number} k @param {{box:[number,number,number,number],cx?:number,cy?:number}} o @param {(ctx:any)=>void} fn
 */
export function revealIris(ctx, k, { box, cx, cy }, fn) {
  const [x, y, w, h] = box; cx ??= x + w / 2; cy ??= y + h / 2; k = clamp(k); if (k <= 0) return; if (k >= 1) { fn(ctx); return; }
  const R = Math.max(Math.hypot(cx - x, cy - y), Math.hypot(cx - x - w, cy - y), Math.hypot(cx - x, cy - y - h), Math.hypot(cx - x - w, cy - y - h));
  inside(ctx, k, () => { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, Math.PI * 2); ctx.clip(); }, fn);
}

/**
 * Split: mode 'center' opens from the middle line outward; mode 'edges' closes in from both sides toward the middle. axis 'x' = vertical split line.
 * @param {*} ctx @param {number} k @param {{box:[number,number,number,number],axis?:'x'|'y',mode?:'center'|'edges'}} o @param {(ctx:any)=>void} fn
 */
export function revealSplit(ctx, k, { box, axis = 'x', mode = 'center' }, fn) {
  const [x, y, w, h] = box; k = clamp(k); if (k <= 0) return; if (k >= 1) { fn(ctx); return; }
  const L = axis === 'x' ? w : h;
  inside(ctx, k, () => {
    ctx.beginPath();
    const rects = mode === 'center' ? [[L / 2 - (L * k) / 2, L * k]] : [[0, (L * k) / 2], [L - (L * k) / 2, (L * k) / 2]];
    for (const [a, len] of rects) ctx.rect(...(axis === 'x' ? [x + a, y, len, h] : [x, y + a, w, len]));
    ctx.clip();
  }, fn);
}

/** Sutherland-Hodgman clip of a polygon by the half plane dot(p, d) <= c. */
function halfPlane(poly, d, c) {
  const out = [], f = p => p[0] * d[0] + p[1] * d[1] - c;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const u = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
  }
  return out;
}

/**
 * Diagonal wipe: a straight edge at any angle sweeps across the box. angle = direction of travel in radians (0 = left to right,
 * PI/4 = from the top-left corner toward the bottom-right, PI/2 = top to bottom). `out` lets the content leave the same way.
 * @param {*} ctx @param {number} k @param {{box:[number,number,number,number],angle?:number,out?:boolean}} o @param {(ctx:any)=>void} fn
 * @returns {{x1:number,y1:number,x2:number,y2:number}|null}
 */
export function revealDiagonal(ctx, k, { box, angle = Math.PI / 4, out = false }, fn) {
  const [x, y, w, h] = box; k = clamp(k); if (out ? k >= 1 : k <= 0) return null; if (out ? k <= 0 : k >= 1) { fn(ctx); return null; }
  const d = [Math.cos(angle), Math.sin(angle)], corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], ps = corners.map(p => p[0] * d[0] + p[1] * d[1]);
  const p0 = Math.min(...ps), p1 = Math.max(...ps), c = p0 + (p1 - p0) * k;
  const poly = halfPlane(corners, out ? [-d[0], -d[1]] : d, out ? -c : c);
  const on = poly.filter(p => Math.abs(p[0] * d[0] + p[1] * d[1] - c) < 1e-6), edge = on.length >= 2 ? { x1: on[0][0], y1: on[0][1], x2: on[1][0], y2: on[1][1] } : null;
  if (poly.length >= 3) inside(ctx, k, () => clipPoly(ctx, poly), fn);
  return edge;
}

/**
 * Scan lines: the box is cut into horizontal bars that wipe in from the left. mode 'sweep' staggers them top to bottom (a scanner);
 * 'blinds' wipes even bars left to right and odd bars right to left at the same time. `out` = they leave the same way.
 * @param {*} ctx @param {number} k @param {{box:[number,number,number,number],lines?:number,mode?:'sweep'|'blinds',stagger?:number,out?:boolean}} o @param {(ctx:any)=>void} fn
 */
export function revealScan(ctx, k, { box, lines = 18, mode = 'sweep', stagger = 0.55, out = false }, fn) {
  const [x, y, w, h] = box; k = clamp(k); if (out ? k >= 1 : k <= 0) return; if (out ? k <= 0 : k >= 1) { fn(ctx); return; }
  const bh = h / lines;
  inside(ctx, k, () => {
    ctx.beginPath();
    for (let i = 0; i < lines; i++) {
      const kk = mode === 'blinds' ? k : clamp((k - stagger * i / (lines - 1)) / (1 - stagger)), s = out ? 1 - kk : kk, fromRight = mode === 'blinds' && i % 2 === 1;
      const len = w * s, rx = out ? (fromRight ? x : x + w - len) : (fromRight ? x + w - len : x);
      if (len > 0.01) ctx.rect(rx, y + i * bh, len, bh + 0.6); // 0.6 px overlap hides seams between bars
    }
    ctx.clip();
  }, fn);
}

/**
 * Ink wipe: a field of seeded blobs (jittered grid circles) grows along `dir`, merging into one organic edge. At k = 1 the union covers the box.
 * For an ink OUT pass 1 - k (the ink recedes). Coverage grows monotonically with k (tested).
 * @param {*} ctx @param {number} k @param {{box:[number,number,number,number],seed?:number,dir?:'right'|'left'|'down'|'up'|'center',cell?:number}} o @param {(ctx:any)=>void} fn
 */
export function revealInk(ctx, k, { box, seed = 1, dir = 'right', cell }, fn) {
  const [x, y, w, h] = box; k = clamp(k); if (k <= 0) return; if (k >= 1) { fn(ctx); return; }
  cell ??= Math.max(34, Math.sqrt((w * h) / 90)); const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell), r = rng(seed * 6007 + 11), blobs = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = x + (i + 0.5) * w / cols + (r() - 0.5) * 0.6 * cell, cy = y + (j + 0.5) * h / rows + (r() - 0.5) * 0.6 * cell, nz = r() * 0.2;
    const u = dir === 'right' ? (cx - x) / w : dir === 'left' ? 1 - (cx - x) / w : dir === 'down' ? (cy - y) / h : dir === 'up' ? 1 - (cy - y) / h : Math.hypot(cx - x - w / 2, cy - y - h / 2) / Math.hypot(w / 2, h / 2);
    blobs.push([cx, cy, u * 0.55 + nz]); // start time 0 .. 0.75
  }
  const rMax = 1.3 * Math.max(w / cols, h / rows);
  inside(ctx, k, () => {
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.beginPath();
    for (const [cx, cy, d] of blobs) { const p = clamp((k - d) / 0.25); if (p > 0) { const rr = rMax * E.outCubic(p); ctx.moveTo(cx + rr, cy); ctx.arc(cx, cy, rr, 0, Math.PI * 2); } }
    ctx.clip();
  }, fn);
}

/**
 * Soft wipe: a feathered edge (no hard line) using a gradient mask on a full-frame layer. Slower than clip reveals: use for one or two
 * things per frame. fn receives the layer context and must draw with it. Only the box is affected; the layer is erased outside the box.
 * @param {*} ctx @param {number} k @param {{box:[number,number,number,number],dir?:'right'|'left'|'down'|'up',feather?:number}} o feather = fraction of the length (0.1-0.4) @param {(ctx:any)=>void} fn
 */
export function revealSoft(ctx, k, { box, dir = 'right', feather = 0.25 }, fn) {
  const [x, y, w, h] = box; k = clamp(k); if (k <= 0) return; if (k >= 1) { fn(ctx); return; }
  const cv = createCanvas(ctx.canvas.width, ctx.canvas.height), c = cv.getContext('2d'); fn(c);
  const v = dir === 'right' || dir === 'left', L = v ? w : h, f = L * feather, edge = (L + f) * k; // edge runs from -f to L
  const g = v ? c.createLinearGradient(dir === 'right' ? x : x + w, 0, dir === 'right' ? x + w : x, 0) : c.createLinearGradient(0, dir === 'down' ? y : y + h, 0, dir === 'down' ? y + h : y);
  const stop = u => clamp(u / L, 0, 1);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(stop(edge - f), 'rgba(0,0,0,1)'); g.addColorStop(stop(edge), 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-in'; c.fillStyle = g; c.fillRect(x, y, w, h);
  ctx.drawImage(cv, 0, 0);
}

/** Bright edge for a moving wipe: soft wide line, core line, white hot centre; additive. @param {*} ctx @param {{x1:number,y1:number,x2:number,y2:number}|null} e @param {{color?:string,width?:number,alpha?:number}} [o] */
export function edgeLine(ctx, e, { color = '#19e08f', width = 6, alpha = 1 } = {}) {
  if (!e) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [wd, a, col] of [[width * 4, 0.16, color], [width * 1.6, 0.5, color], [Math.max(2, width * 0.5), 0.95, '#ffffff']]) { ctx.globalAlpha = a * alpha; ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke(); }
  ctx.restore();
}

// ---------------------------------------------------------------- text reveals
/**
 * Mask-rise text (the hook style): each line rises 0.4 em out of a mask and fades in; lines 0.07 s apart. Draw on the MAIN canvas.
 * @param {*} ctx @param {number} t @param {{lines:string[],x:number,y:number,px?:number,lh?:number,t0:number,dur?:number,gap?:number,fam?:string,wght?:number,color?:string|string[],align?:CanvasTextAlign}} o y = baseline of line 1; lh = line height
 * @returns {number} the time the last line has landed
 */
export function textRise(ctx, t, { lines, x, y, px = 56, lh = px * 1.15, t0, dur = RECIPES.textRise.dur, gap = 0.07, fam = 'sg', wght = 700, color = '#f8fafc', align = 'center' }) {
  lines.forEach((s, i) => {
    const k = E.outCubic(prog(t, t0 + i * gap, t0 + i * gap + dur)); if (k <= 0) return;
    ctx.save(); setFont(ctx, fam, px, wght, -0.01); ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; const wdt = ctx.measureText(s).width, bx = align === 'center' ? x - wdt / 2 : align === 'right' ? x - wdt : x, base = y + i * lh;
    ctx.beginPath(); ctx.rect(bx - 8, base - px, wdt + 16, px * 1.75); ctx.clip(); ctx.globalAlpha *= clamp(k * 1.6); ctx.fillStyle = Array.isArray(color) ? color[i % color.length] : color; ctx.fillText(s, x, base + 0.4 * px * (1 - k)); ctx.restore();
  });
  return t0 + (lines.length - 1) * gap + dur;
}

/**
 * Text wipe: the text is revealed left to right behind a bright edge. Good for short labels and numbers. Draw on the MAIN canvas.
 * @param {*} ctx @param {number} k 0..1 @param {{text:string,x:number,y:number,px?:number,fam?:string,wght?:number,color?:string,edgeColor?:string}} o left aligned at x
 */
export function textWipe(ctx, k, { text, x, y, px = 56, fam = 'sg', wght = 700, color = '#f8fafc', edgeColor = '#19e08f' }) {
  k = clamp(k); if (k <= 0) return; ctx.save(); setFont(ctx, fam, px, wght, -0.01); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; const wdt = ctx.measureText(text).width;
  ctx.save(); ctx.beginPath(); ctx.rect(x - 4, y - px, (wdt + 8) * k, px * 1.5); ctx.clip(); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
  if (k < 1) edgeLine(ctx, { x1: x - 4 + (wdt + 8) * k, y1: y - px * 0.85, x2: x - 4 + (wdt + 8) * k, y2: y + px * 0.25 }, { color: edgeColor, width: 4 });
  ctx.restore();
}

/**
 * Per-character reveal: each letter rises 0.3 em and fades in, 0.035 s apart. Positions come from measured prefix widths, so kerning is kept.
 * @param {*} ctx @param {number} t @param {{text:string,x:number,y:number,px?:number,t0:number,per?:number,dur?:number,fam?:string,wght?:number,color?:string,align?:CanvasTextAlign}} o @returns {number} time the last letter has landed
 */
export function textChars(ctx, t, { text, x, y, px = 56, t0, per = 0.035, dur = 0.3, fam = 'sg', wght = 700, color = '#f8fafc', align = 'center' }) {
  ctx.save(); setFont(ctx, fam, px, wght, -0.01); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; const total = ctx.measureText(text).width, x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (let i = 0; i < text.length; i++) {
    const k = E.outCubic(prog(t, t0 + i * per, t0 + i * per + dur)); if (k <= 0 || text[i] === ' ') continue;
    ctx.globalAlpha = clamp(k * 1.5); ctx.fillStyle = color; ctx.fillText(text[i], x0 + ctx.measureText(text.slice(0, i)).width, y + 0.3 * px * (1 - k));
  }
  ctx.restore(); return t0 + (text.length - 1) * per + dur;
}

/** Visible character count of a typewriter at time t: `cps` characters per second from t0. */
export const typedCount = (t, t0, len, cps = 22) => clamp(Math.floor((t - t0) * cps), 0, len);
