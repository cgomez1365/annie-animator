// t3.3 data motion: animated bars, lines, donuts, sparklines, counters and comparison reveals, sized for a phone.
// Every chart is a pure function of t. All text is drawn on the ctx you pass (main canvas) so the quality checker reads it.
// Text is always 42 px or more; charts hold few items (see readability()).
import { E, clamp, lerp, prog, rgba, setFont, textW, roundRect, glow, icon, P } from '../../engine/index.mjs';

/** Series colours in BGI's palette, in the order to use them. */
export const SERIES = [P.green, P.cyan, P.orange, P.muted];

// ---------------------------------------------------------------- numbers

/**
 * Format a number: thousands separators, decimals, compact (1.2K, 3.4M), prefix and suffix. Never uses a currency sign
 * (prices are banned claims; pass prefix yourself only when the copy allows).
 * @param {number} v @param {{decimals?:number,sep?:boolean,compact?:boolean,prefix?:string,suffix?:string}} [o]
 */
export function fmt(v, { decimals = 0, sep = true, compact = false, prefix = '', suffix = '' } = {}) {
  let x = v, u = ''; if (compact) { const a = Math.abs(v); if (a >= 1e6) { x = v / 1e6; u = 'M'; } else if (a >= 1e3) { x = v / 1e3; u = 'K'; } }
  const s = Math.abs(x).toFixed(compact && u ? Math.max(decimals, 1) : decimals), [i, f] = s.split('.');
  return (x < 0 ? '-' : '') + prefix + (sep ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : i) + (f && !(compact && u && /^0+$/.test(f)) ? '.' + f : '') + u + suffix;
}
/**
 * Number moving from `from` to `to` over [t0, t0+dur]. Ease outExpo (fast, settles) is the default; use outCubic for a calmer count.
 * Never overshoots: do not pass outBack here (a number that passes its target reads as a bug). Lands exactly on `to`.
 * @param {number} t @param {{from?:number,to:number,t0:number,dur?:number,ease?:string}} o
 */
export function easeNumber(t, { from = 0, to, t0, dur = 1.0, ease = 'outExpo' }) { const k = prog(t, t0, t0 + dur); return k >= 1 ? to : lerp(from, to, E[ease](k)); }

/**
 * Round an axis maximum up to a number a person would pick (1, 2, 2.5, 5 times a power of ten). niceMax(87) = 100, niceMax(41) = 50.
 * @param {number} v @returns {number}
 */
export function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

// ---------------------------------------------------------------- readability

/**
 * Check a chart plan for phone readability. Returns a list of problems (empty = fine).
 * kinds: 'hbar' (max 6 items, label column at most 40 percent of the width), 'vbar' (max 5, each label must fit its column),
 * 'line' (max 3 series, at most 5 x labels), 'donut' (max 5 slices, legend labels must fit), 'spark'.
 * @param {*} ctx @param {'hbar'|'vbar'|'line'|'donut'|'spark'} kind @param {{labels?:string[],w:number,px?:number,series?:number,decimals?:number}} s
 */
export function readability(ctx, kind, { labels = [], w, px = 44, series = 1, decimals = 0 }) {
  const bad = [], max = { hbar: 6, vbar: 5, line: 5, donut: 5, spark: 12 }[kind]; setFont(ctx, 'inter', px, 600);
  if (px < 42) bad.push(`text ${px}px is under 42px`);
  if (labels.length > max) bad.push(`${labels.length} items; at most ${max} read on a phone for ${kind}`);
  const wide = Math.max(0, ...labels.map(l => textW(ctx, l, px, 0)));
  if (kind === 'hbar' && wide > 0.4 * w) bad.push(`longest label ${wide.toFixed(0)}px is over 40 percent of the chart width`);
  if (kind === 'vbar' && labels.length && wide > w / labels.length - 12) bad.push(`label ${wide.toFixed(0)}px does not fit its column ${(w / labels.length).toFixed(0)}px`);
  if (kind === 'donut' && labels.length && wide > w / Math.min(labels.length, 3) - 40) bad.push(`legend label ${wide.toFixed(0)}px is too wide for its slot`);
  if (series > 3) bad.push(`${series} series; use at most 3`); if (decimals > 1) bad.push('more than one decimal: round it');
  return bad;
}

// ---------------------------------------------------------------- curves

/**
 * Smooth monotone curve through points (Fritsch-Carlson cubic): never overshoots the data, so a line chart never dips below zero
 * or above its max between points. Returns a dense polyline [[x,y],...] with `per` samples per segment.
 * @param {number[][]} pts [[x,y],...] with strictly increasing x @param {number} [per]
 */
export function monotoneSamples(pts, per = 14) {
  const n = pts.length; if (n < 3) return pts.slice();
  const dx = [], m = [], tg = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); m.push((pts[i + 1][1] - pts[i][1]) / dx[i]); }
  tg[0] = m[0]; tg[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) tg[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; } const a = tg[i] / m[i], b = tg[i + 1] / m[i], s = a * a + b * b; if (s > 9) { const r = 3 / Math.sqrt(s); tg[i] = r * a * m[i]; tg[i + 1] = r * b * m[i]; } }
  const out = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < per; j++) {
    const u = j / per, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    out.push([pts[i][0] + u * dx[i], h00 * pts[i][1] + h10 * dx[i] * tg[i] + h01 * pts[i + 1][1] + h11 * dx[i] * tg[i + 1]]);
  }
  out.push(pts[n - 1].slice()); return out;
}
/** Point of a dense polyline (increasing x) at a given x, interpolated. */
function atX(poly, x) {
  if (x <= poly[0][0]) return poly[0].slice(); if (x >= poly[poly.length - 1][0]) return poly[poly.length - 1].slice();
  let lo = 0, hi = poly.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (poly[m][0] <= x) lo = m; else hi = m; }
  const f = (x - poly[lo][0]) / ((poly[hi][0] - poly[lo][0]) || 1); return [x, lerp(poly[lo][1], poly[hi][1], f)];
}

// ---------------------------------------------------------------- bar chart

/**
 * Animated bar chart. Bars grow from the baseline with a stagger; the value labels count up with them. `ease` shapes the bar
 * (outBack adds a small overshoot bounce at the tip; numbers never overshoot). A winner can glow; a scan highlight can sweep across.
 * @param {*} ctx @param {number} t
 * @param {{x:number,y:number,w:number,h:number,data:Array<{label:string,value:number,color?:string}>,t0:number,gap?:number,dur?:number,ease?:string,orient?:'h'|'v',max?:number,px?:number,
 *   valueFmt?:(v:number)=>string,highlight?:number,hlColor?:string,track?:boolean,scan?:number,alpha?:number,barMax?:number}} o
 *   barMax = thickest bar in px (rows, default 76). h orient: rows (label left, bar, value at the tip). v orient: columns (value above, label below).
 * @returns {Array<{x:number,y:number,w:number,h:number,tip:[number,number],value:number,k:number}>} bar rectangles (final geometry, k = growth)
 */
export function barChart(ctx, t, { x, y, w, h, data, t0, gap = 0.11, dur = 0.6, ease = 'outBack', orient = 'h', max, px = 44, barMax = 76, valueFmt = v => fmt(v), highlight = -1, hlColor = P.green, track = true, scan = 0, alpha = 1 }) {
  const n = data.length, top = max ?? niceMax(Math.max(...data.map(d => d.value))), out = [];
  const eb = (k, s) => (ease === 'outBack' ? E.outBack(k, s ?? 1.4) : E[ease](k));
  ctx.save(); ctx.globalAlpha *= alpha;
  if (orient === 'h') {
    setFont(ctx, 'inter', px, 600); const labW = Math.max(...data.map(d => textW(ctx, d.label, px, 0))) + 24, valW = Math.max(...data.map(d => textW(ctx, valueFmt(d.value), px, 0))) + 28, row = h / n, bh = Math.min(row * 0.58, barMax), bx = x + labW, bw = w - labW - valW;
    data.forEach((d, i) => {
      const k = prog(t, t0 + i * gap, t0 + i * gap + dur), kb = Math.max(0, eb(k)), cy = y + row * (i + 0.5), col = d.color || (i === highlight ? hlColor : SERIES[1]);
      const len = bw * (d.value / top) * kb, lead = i === highlight ? 1 : 0.85;
      if (track) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; roundRect(ctx, bx, cy - bh / 2, bw, bh, bh / 2).fill(); }
      ctx.save(); ctx.globalAlpha *= clamp(k * 5); setFont(ctx, 'inter', px, 600); ctx.fillStyle = i === highlight ? P.white : P.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(d.label, x, cy + px * 0.34); ctx.restore();
      if (len > 1) {
        const draw = () => { ctx.fillStyle = rgba(col, lead); roundRect(ctx, bx, cy - bh / 2, Math.max(len, bh * 0.5), bh, bh / 2).fill(); };
        if (i === highlight) glow(ctx, rgba(col, 0.55), 22 + 8 * Math.sin(t * 4), draw); else draw();
        if (scan) { const sp = ((t / scan) % 1) * (bw + 200) - 100, g = ctx.createLinearGradient(bx + sp - 60, 0, bx + sp + 60, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.save(); roundRect(ctx, bx, cy - bh / 2, Math.max(len, bh * 0.5), bh, bh / 2).clip(); ctx.fillStyle = g; ctx.fillRect(bx, cy - bh / 2, len, bh); ctx.restore(); }
      }
      const v = d.value * E.outCubic(clamp(k)); ctx.save(); ctx.globalAlpha *= clamp(k * 4); setFont(ctx, 'inter', px, 700); ctx.fillStyle = i === highlight ? hlColor : P.white; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(valueFmt(k >= 1 ? d.value : v), bx + len + 16, cy + px * 0.34); ctx.restore();
      out.push({ x: bx, y: cy - bh / 2, w: bw * (d.value / top), h: bh, tip: [bx + bw * (d.value / top), cy], value: d.value, k: kb });
    });
  } else {
    const colW = w / n, bw = Math.min(colW * 0.56, 130), base = y + h - px * 1.5, hh = base - y - px * 1.6;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, base, w, 3);
    data.forEach((d, i) => {
      const k = prog(t, t0 + i * gap, t0 + i * gap + dur), kb = Math.max(0, eb(k)), cx = x + colW * (i + 0.5), col = d.color || (i === highlight ? hlColor : SERIES[1]), len = hh * (d.value / top) * kb;
      if (len > 1) { const draw = () => { ctx.fillStyle = rgba(col, i === highlight ? 1 : 0.85); roundRect(ctx, cx - bw / 2, base - len, bw, len, [14, 14, 0, 0]).fill(); }; if (i === highlight) glow(ctx, rgba(col, 0.55), 22 + 8 * Math.sin(t * 4), draw); else draw(); }
      ctx.save(); ctx.globalAlpha *= clamp(k * 4); setFont(ctx, 'inter', px, 700); ctx.fillStyle = i === highlight ? hlColor : P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(valueFmt(k >= 1 ? d.value : d.value * E.outCubic(clamp(k))), cx, base - len - 16);
      setFont(ctx, 'inter', px, 600); ctx.fillStyle = i === highlight ? P.white : P.muted; ctx.fillText(d.label, cx, base + px * 1.15); ctx.restore();
      out.push({ x: cx - bw / 2, y: base - hh * (d.value / top), w: bw, h: hh * (d.value / top), tip: [cx, base - hh * (d.value / top)], value: d.value, k: kb });
    });
  }
  ctx.restore(); return out;
}

// ---------------------------------------------------------------- line chart and sparkline

/**
 * Animated line chart: the curve draws left to right (monotone smooth), the area under it fades in, a pulsing head dot rides the tip
 * and shows its value. Several series draw together. Faint gridlines, optional x labels (42 px+).
 * @param {*} ctx @param {number} t
 * @param {{x:number,y:number,w:number,h:number,series:Array<{values:number[],color?:string,label?:string,area?:boolean}>,t0:number,dur?:number,ease?:string,min?:number,max?:number,
 *   xLabels?:string[],px?:number,grid?:number,headLabel?:boolean,valueFmt?:(v:number)=>string,alpha?:number,lineW?:number}} o
 * @returns {{heads:Array<{x:number,y:number,value:number}>, plot:{x:number,y:number,w:number,h:number}, k:number}}
 */
export function lineChart(ctx, t, { x, y, w, h, series, t0, dur = 1.3, ease = 'inOutCubic', min, max, xLabels, px = 42, grid = 3, headLabel = true, valueFmt = v => fmt(v), alpha = 1, lineW = 7 }) {
  const all = series.flatMap(s => s.values), lo = min ?? Math.min(0, ...all), hi = max ?? niceMax(Math.max(...all)), padB = xLabels ? px * 1.7 : 10, pl = { x: x + 8, y: y + 10, w: w - 16, h: h - padB - 10 };
  const k = E[ease](prog(t, t0, t0 + dur)), heads = [], sy = v => pl.y + pl.h - ((v - lo) / (hi - lo)) * pl.h;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 2; for (let g = 0; g <= grid; g++) { const gy = pl.y + (pl.h * g) / grid; ctx.beginPath(); ctx.moveTo(pl.x, gy); ctx.lineTo(pl.x + pl.w, gy); ctx.stroke(); }
  if (xLabels) { ctx.save(); ctx.globalAlpha *= E.outCubic(prog(t, t0, t0 + 0.4)); setFont(ctx, 'inter', px, 600); ctx.fillStyle = P.muted; ctx.textBaseline = 'alphabetic'; xLabels.forEach((l, i) => { ctx.textAlign = i === 0 ? 'left' : i === xLabels.length - 1 ? 'right' : 'center'; ctx.fillText(l, pl.x + (pl.w * i) / (xLabels.length - 1), y + h - 6); }); ctx.restore(); }
  const xh = pl.x + pl.w * k;
  series.forEach((s, si) => {
    const col = s.color || SERIES[si % SERIES.length], n = s.values.length, poly = monotoneSamples(s.values.map((v, i) => [pl.x + (pl.w * i) / (n - 1), sy(v)])), head = atX(poly, xh);
    ctx.save(); ctx.beginPath(); ctx.rect(pl.x - 20, y - 30, xh - pl.x + 20, h + 60); ctx.clip();
    if (s.area !== false && si === 0) { const g = ctx.createLinearGradient(0, pl.y, 0, pl.y + pl.h); g.addColorStop(0, rgba(col, 0.32)); g.addColorStop(1, rgba(col, 0)); ctx.beginPath(); poly.forEach(([px_, py_], i) => (i ? ctx.lineTo(px_, py_) : ctx.moveTo(px_, py_))); ctx.lineTo(poly[poly.length - 1][0], pl.y + pl.h); ctx.lineTo(poly[0][0], pl.y + pl.h); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); }
    ctx.strokeStyle = col; ctx.lineWidth = lineW; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); poly.forEach(([px_, py_], i) => (i ? ctx.lineTo(px_, py_) : ctx.moveTo(px_, py_))); glow(ctx, rgba(col, 0.5), 14, () => ctx.stroke()); ctx.restore();
    const hv = lo + ((pl.y + pl.h - head[1]) / pl.h) * (hi - lo); heads.push({ x: head[0], y: head[1], value: hv });
    if (k > 0.01) { const pu = 0.5 + 0.5 * Math.sin(t * 5); ctx.save(); ctx.fillStyle = rgba(col, 0.25 + 0.2 * pu); ctx.beginPath(); ctx.arc(head[0], head[1], 17 + 6 * pu, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(head[0], head[1], 11, 0, 7); ctx.fill(); ctx.strokeStyle = P.bg; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
    if (headLabel && k > 0.05 && si === 0) { const v = k >= 1 ? s.values[n - 1] : hv, txt = valueFmt(v); setFont(ctx, 'inter', px, 700); const tw = textW(ctx, txt, px, 0), lx = clamp(head[0], pl.x + tw / 2 + 8, pl.x + pl.w - tw / 2 - 8); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(txt, lx, head[1] - 30); }
  });
  ctx.restore(); return { heads, plot: pl, k };
}

/**
 * Sparkline: a small line with no axes, a gradient tail and a head dot. Use inside rows and cards (width 160-320 px).
 * @param {*} ctx @param {number} t @param {{x:number,y:number,w:number,h:number,values:number[],color?:string,t0:number,dur?:number,lineW?:number,alpha?:number}} o
 * @returns {{head:[number,number],k:number}}
 */
export function sparkline(ctx, t, { x, y, w, h, values, color = P.green, t0, dur = 0.9, lineW = 5, alpha = 1 }) {
  const lo = Math.min(...values), hi = Math.max(...values), n = values.length, k = E.inOutCubic(prog(t, t0, t0 + dur)), pad = 10;
  const poly = monotoneSamples(values.map((v, i) => [x + pad + ((w - 2 * pad) * i) / (n - 1), y + h - pad - ((v - lo) / ((hi - lo) || 1)) * (h - 2 * pad)]), 10), xh = x + pad + (w - 2 * pad) * k, head = atX(poly, xh);
  ctx.save(); ctx.globalAlpha *= alpha; ctx.save(); ctx.beginPath(); ctx.rect(x - 10, y - 20, xh - x + 10, h + 40); ctx.clip(); ctx.strokeStyle = color; ctx.lineWidth = lineW; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); poly.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); ctx.restore();
  if (k > 0.01) { const pu = 0.5 + 0.5 * Math.sin(t * 5); ctx.fillStyle = rgba(color, 0.3 + 0.2 * pu); ctx.beginPath(); ctx.arc(head[0], head[1], 12 + 4 * pu, 0, 7); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(head[0], head[1], 7.5, 0, 7); ctx.fill(); }
  ctx.restore(); return { head, k };
}

// ---------------------------------------------------------------- donut

/**
 * Animated donut. The ring sweeps round once (slices fill in order); a small gap separates slices; an orbiting spark keeps it alive
 * after it is full. Draw the centre number yourself (drawNumber) so it can count with the sweep.
 * @param {*} ctx @param {number} t
 * @param {{cx:number,cy:number,r:number,thick?:number,slices:Array<{value:number,color?:string,label?:string}>,t0:number,dur?:number,ease?:string,gap?:number,highlight?:number,start?:number,orbit?:boolean,alpha?:number}} o
 *   r = outer radius. gap in radians. highlight pushes one slice out 14 px and makes it thicker.
 * @returns {Array<{start:number,end:number,mid:number,value:number,share:number,color:string,visible:number}>} angles of every slice (radians), visible = filled fraction 0..1
 */
export function donutChart(ctx, t, { cx, cy, r, thick = 48, slices, t0, dur = 1.1, ease = 'inOutCubic', gap = 0.05, highlight = -1, start = -Math.PI / 2, orbit = true, alpha = 1 }) {
  const total = slices.reduce((s, d) => s + d.value, 0), n = slices.length, span = 2 * Math.PI - n * gap, k = E[ease](prog(t, t0, t0 + dur)), out = []; let a = start;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = thick; ctx.beginPath(); ctx.arc(cx, cy, r - thick / 2, 0, 7); ctx.stroke();
  slices.forEach((d, i) => {
    const sw = (d.value / total) * span, a0 = a, a1 = a + sw, filled = clamp((k * 2 * Math.PI - (a0 - start)) / (sw + gap)), col = d.color || SERIES[i % SERIES.length], hl = i === highlight && k >= 1; a = a1 + gap;
    out.push({ start: a0, end: a1, mid: (a0 + a1) / 2, value: d.value, share: d.value / total, color: col, visible: filled });
    if (filled <= 0) return;
    const mid = (a0 + a1) / 2, ox = hl ? 14 * Math.cos(mid) : 0, oy = hl ? 14 * Math.sin(mid) : 0, rr = r - thick / 2;
    ctx.save(); ctx.translate(ox, oy); ctx.strokeStyle = col; ctx.lineWidth = hl ? thick + 10 : thick; ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a0 + sw * filled); if (hl) glow(ctx, rgba(col, 0.5), 20, () => ctx.stroke()); else ctx.stroke(); ctx.restore();
  });
  if (orbit && k >= 1) { const ang = start + t * 1.6, rr = r - thick / 2; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang), 6, 0, 7); ctx.fill(); }
  ctx.restore(); return out;
}

/**
 * Draw a number (or any short string) centred at x,y with a scale pop when `popT` arrives. Use with easeNumber and fmt for the centre of a donut.
 * @param {*} ctx @param {string} s @param {{x:number,y:number,px?:number,fam?:string,wght?:number,color?:string,t?:number,popT?:number,align?:'center'|'left'}} o
 */
export function drawNumber(ctx, s, { x, y, px = 96, fam = 'sg', wght = 700, color = P.white, t = 0, popT = -1, align = 'center' }) {
  const sc = popT >= 0 ? 1 + 0.12 * Math.sin(Math.PI * prog(t, popT, popT + 0.45)) : 1;
  ctx.save(); ctx.translate(x, y - px * 0.34); ctx.scale(sc, sc); setFont(ctx, fam, px, wght); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, 0, px * 0.34); ctx.restore();
}

/**
 * Legend row: coloured dot + label, centred in equal slots across `w`. Labels are 42 px+. Returns nothing.
 * @param {*} ctx @param {number} t @param {{x:number,y:number,w:number,items:Array<{label:string,color:string}>,t0:number,gap?:number,px?:number}} o
 */
export function legend(ctx, t, { x, y, w, items, t0, gap = 0.1, px = 46 }) {
  const slot = w / items.length;
  items.forEach((it, i) => { const k = E.outCubic(prog(t, t0 + i * gap, t0 + i * gap + 0.35)); if (k <= 0) return; setFont(ctx, 'inter', px, 600); const tw = textW(ctx, it.label, px, 0), cx = x + slot * (i + 0.5), x0 = cx - (tw + 34) / 2;
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, 16 * (1 - k)); ctx.fillStyle = it.color; ctx.beginPath(); ctx.arc(x0 + 10, y - px * 0.3, 10, 0, 7); ctx.fill(); ctx.fillStyle = P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(it.label, x0 + 34, y); ctx.restore(); });
}

// ---------------------------------------------------------------- comparison reveal

/**
 * Delta badge: a pill that pops in (outBack) with an arrow and a change such as "+38%". Green for up, red for down.
 * @param {*} ctx @param {number} t @param {{x:number,y:number,text:string,t0:number,up?:boolean,px?:number}} o x,y = centre
 */
export function deltaBadge(ctx, t, { x, y, text, t0, up = true, px = 46 }) {
  const k = E.outBack(prog(t, t0, t0 + 0.5), 2.0); if (k <= 0.01) return;
  const col = up ? P.green : P.red; setFont(ctx, 'inter', px, 750); const tw = textW(ctx, text, px, 0), w = tw + 100, h = px * 1.9;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.globalAlpha *= clamp(k * 3);
  glow(ctx, rgba(col, 0.4), 22, () => { ctx.fillStyle = rgba(col, 0.16); roundRect(ctx, -w / 2, -h / 2, w, h, h / 2).fill(); }); ctx.strokeStyle = col; ctx.lineWidth = 3; roundRect(ctx, -w / 2, -h / 2, w, h, h / 2).stroke();
  icon(ctx, up ? 'trending-up' : 'trending-down', -w / 2 + 26, -px * 0.5, px, col, 2.4); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, -w / 2 + 26 + px + 14, px * 0.34); ctx.restore();
}

/**
 * Comparison reveal: two values side by side as two bars that grow together, the bigger one highlighted, then a delta badge pops
 * between them. Returns the delta (percent change from a to b, rounded) and where the badge sits.
 * @param {*} ctx @param {number} t @param {{x:number,y:number,w:number,h:number,a:{label:string,value:number},b:{label:string,value:number},t0:number,px?:number,valueFmt?:(v:number)=>string,badgeAt?:number}} o
 */
export function compareReveal(ctx, t, { x, y, w, h, a, b, t0, px = 46, valueFmt = v => fmt(v), badgeAt }) {
  const win = b.value >= a.value ? 1 : 0, bars = barChart(ctx, t, { x, y, w, h: h * 0.62, data: [{ label: a.label, value: a.value, color: win === 0 ? P.green : P.dim }, { label: b.label, value: b.value, color: win === 1 ? P.green : P.dim }], t0, gap: 0.12, dur: 0.7, orient: 'h', px, barMax: 110, valueFmt, highlight: win, track: false });
  const pct = Math.round(((b.value - a.value) / a.value) * 100); deltaBadge(ctx, t, { x: x + w / 2, y: y + h * 0.62 + 64, text: `${pct >= 0 ? '+' : ''}${pct}%`, t0: badgeAt ?? t0 + 1.1, up: pct >= 0, px });
  return { pct, bars };
}
