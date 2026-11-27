// t3.2 kinetic typography: split text into letters, words and lines, animate each unit, highlight, count, and run text on a path.
// Layout comes from the real font metrics (kerning kept), so a split line looks exactly like the unsplit one.
// Pure functions of t. Draw on the main canvas (or a full-frame engine canvas): the quality checker reads the text.
import { E, clamp, lerp, prog, rgba, setFont, textW, wrapText, rng, hash, P, SAFE } from '../../engine/index.mjs';

const BASEFIX = 0.34; // letters pivot about 0.34 em above the baseline (middle of the x-height)

// ---------------------------------------------------------------- layout

/**
 * Wrap text to at most as many lines as the plain wrap makes, but with the narrowest width that keeps that line count, so the
 * lines come out about equal in length (no one-word last line). The font must already be set on ctx.
 * @param {*} ctx @param {string} text @param {number} maxW @returns {string[]}
 */
export function balancedWrap(ctx, text, maxW) {
  const base = wrapText(ctx, text, maxW), n = base.length; if (n < 2 || text.includes('\n')) return base;
  let lo = 0, hi = maxW; for (const w of text.split(/\s+/)) lo = Math.max(lo, ctx.measureText(w).width);
  for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (wrapText(ctx, text, mid).length <= n) hi = mid; else lo = mid; }
  return wrapText(ctx, text, hi);
}

/**
 * Lay a text block out and return every letter, word and line with its position, for per-unit animation.
 * Positions are in frame px: `x` is the left edge, `y` the baseline. Letters are placed by prefix width (width of "abc" minus
 * width of "c" gives c's x), which keeps kerning pairs.
 * @param {*} ctx
 * @param {string} text use \n for fixed line breaks
 * @param {{fam?:string,px?:number,wght?:number,track?:number,maxW?:number,x?:number,y?:number,align?:'center'|'left',lineH?:number,balance?:boolean}} [o]
 *   x is the centre (align center) or left edge; y the first baseline; lineH a multiple of px.
 * @returns {{chars:Array<{ch:string,x:number,w:number,cx:number,y:number,line:number,word:number,idx:number}>,words:Array<{text:string,x:number,w:number,y:number,line:number,idx:number,chars:number[]}>,lines:Array<{text:string,x:number,w:number,y:number,idx:number}>,px:number,fam:string,wght:number,track:number,bounds:{x0:number,y0:number,x1:number,y1:number}}}
 */
export function splitText(ctx, text, { fam = 'sg', px = 96, wght = 700, track = 0, maxW = 880, x = 540, y = 900, align = 'center', lineH = 1.16, balance = true } = {}) {
  setFont(ctx, fam, px, wght, track); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const lines = text.includes('\n') ? text.split('\n') : balance ? balancedWrap(ctx, text, maxW) : wrapText(ctx, text, maxW);
  const out = { chars: [], words: [], lines: [], px, fam, wght, track, bounds: { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 } };
  let wi = 0;
  lines.forEach((ln, li) => {
    const lw = textW(ctx, ln, px, track), x0 = align === 'center' ? x - lw / 2 : x, base = y + li * px * lineH;
    out.lines.push({ text: ln, x: x0, w: lw, y: base, idx: li });
    const re = /\S+/g; let m;
    while ((m = re.exec(ln))) {
      const wd = { text: m[0], x: 0, w: 0, y: base, line: li, idx: wi, chars: [] };
      for (let c = m.index; c < m.index + m[0].length; c++) {
        const pre = ctx.measureText(ln.slice(0, c + 1)).width, cw = ctx.measureText(ln[c]).width - (track ? px * track : 0), cx0 = x0 + pre - ctx.measureText(ln[c]).width;
        const ch = { ch: ln[c], x: cx0, w: cw, cx: cx0 + cw / 2, y: base, line: li, word: wi, idx: out.chars.length };
        wd.chars.push(ch.idx); out.chars.push(ch);
      }
      const f = out.chars[wd.chars[0]], l = out.chars[wd.chars[wd.chars.length - 1]]; wd.x = f.x; wd.w = l.x + l.w - f.x; out.words.push(wd); wi++;
    }
    out.bounds.x0 = Math.min(out.bounds.x0, x0); out.bounds.x1 = Math.max(out.bounds.x1, x0 + lw); out.bounds.y0 = Math.min(out.bounds.y0, base - px * 0.78); out.bounds.y1 = Math.max(out.bounds.y1, base + px * 0.24);
  });
  return out;
}

/**
 * Biggest size (maxPx down to minPx, default 42) at which `text` fits in maxW within maxLines lines; returns { px, lines, fits }.
 * Sets the font on ctx at that size. fits is false when even minPx does not fit (shorten the copy; never go under 42 px).
 * @param {*} ctx @param {string} text @param {{fam?:string,wght?:number,maxW:number,maxLines?:number,maxPx?:number,minPx?:number,track?:number}} o
 */
export function fitBlock(ctx, text, { fam = 'sg', wght = 700, maxW, maxLines = 2, maxPx = 120, minPx = 42, track = 0 }) {
  for (let px = maxPx; px >= minPx; px -= 2) {
    setFont(ctx, fam, px, wght, track); const lines = text.includes('\n') ? text.split('\n') : balancedWrap(ctx, text, maxW);
    if (lines.length <= maxLines && lines.every(l => textW(ctx, l, px, track) <= maxW)) return { px, lines, fits: true };
  }
  setFont(ctx, fam, minPx, wght, track); const lines = text.includes('\n') ? text.split('\n') : balancedWrap(ctx, text, maxW);
  return { px: minPx, lines, fits: lines.length <= maxLines && lines.every(l => textW(ctx, l, minPx, track) <= maxW) };
}

/**
 * Check a split block against the platform safe zones and the 42 px floor. Returns a list of problems (empty = fine).
 * Zones: no text above y 250 or from y 1580 down, none at x >= 940 inside y 800-1580. Warns inside the Reels caption band 1250-1580.
 * @param {ReturnType<typeof splitText>} sp @returns {string[]}
 */
export function safeCheck(sp) {
  const b = sp.bounds, bad = [];
  if (sp.px < SAFE.floor) bad.push(`font ${sp.px}px is under ${SAFE.floor}px`);
  if (b.y0 < SAFE.top) bad.push(`top ${b.y0.toFixed(0)} is above y ${SAFE.top}`);
  if (b.y1 > SAFE.bottom) bad.push(`bottom ${b.y1.toFixed(0)} is below y ${SAFE.bottom}`);
  if (b.x1 >= SAFE.railX && b.y1 > SAFE.railY[0] && b.y0 < SAFE.railY[1]) bad.push(`right edge ${b.x1.toFixed(0)} reaches the action rail (x ${SAFE.railX})`);
  if (b.x0 < 40 || b.x1 > 1040) bad.push('block is closer than 40 px to the screen edge');
  return bad;
}

// ---------------------------------------------------------------- unit styles
// A style turns reveal progress k (0..1, already eased by its own curve) into a pose: { dx, dy, sx, sy, rot, a } (offsets in px, rot in rad).
/** @type {Record<string,(k:number,i:number,px:number)=>{dx?:number,dy?:number,sx?:number,sy?:number,rot?:number,a?:number}>} */
export const STYLES = {
  rise: (k, i, px) => { const e = E.outCubic(k); return { dy: 0.55 * px * (1 - e), a: clamp(e * 1.6) }; },
  drop: (k, i, px) => ({ dy: -1.1 * px * (1 - E.outBounce(k)), a: clamp(k * 6) }),
  pop: (k) => { const e = E.outBack(k, 2.0); return { sx: Math.max(0, e), sy: Math.max(0, e), a: clamp(k * 4) }; },
  spin: (k) => { const e = E.outBack(k, 1.6); return { rot: -0.7 * (1 - E.outCubic(k)), sx: Math.max(0, e), sy: Math.max(0, e), a: clamp(k * 3) }; },
  slide: (k, i, px) => ({ dx: -1.3 * px * (1 - E.outCubic(k)), a: clamp(k * 2.5) }),
  slideAlt: (k, i, px) => ({ dx: (i % 2 ? 1 : -1) * 1.6 * px * (1 - E.outCubic(k)), a: clamp(k * 2.5) }),
  fade: (k) => ({ a: E.outCubic(k) }),
  cut: (k) => ({ a: k > 0 ? 1 : 0 }), // typewriter: use with dur 0.001
  blurUp: (k, i, px) => ({ dy: 0.3 * px * (1 - E.outCubic(k)), a: E.outCubic(k) }),
};

/**
 * Staggered reveal times. unit 'char' | 'word' | 'line'. Returns {s, e} per unit. `order` 'forward'|'reverse'|'center'|'random'.
 * Gaps that read well: letters 0.025-0.045 s, words 0.08-0.14 s, lines 0.12-0.2 s. Cap the whole stagger under 1.2 s.
 * @param {number} n @param {number} t0 @param {number} gap @param {number} dur @param {'forward'|'reverse'|'center'|'random'} [order] @param {number} [seed]
 */
export function unitTimes(n, t0, gap, dur, order = 'forward', seed = 1) {
  let rank = Array.from({ length: n }, (_, i) => i);
  if (order === 'reverse') rank = rank.map(i => n - 1 - i);
  else if (order === 'center') { const c = (n - 1) / 2, idx = rank.slice().sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || a - b); rank = rank.map(i => idx.indexOf(i)); }
  else if (order === 'random') { const r = rng(seed), keys = rank.map(() => r()), idx = rank.slice().sort((a, b) => keys[a] - keys[b]); rank = rank.map(i => idx.indexOf(i)); }
  return rank.map(k => ({ s: t0 + k * gap, e: t0 + k * gap + dur }));
}

/**
 * Draw a split block with a per-unit animation. This is the workhorse.
 * @param {*} ctx @param {ReturnType<typeof splitText>} sp @param {number} t
 * @param {{unit?:'char'|'word'|'line', style?:string|Function, t0:number, gap?:number, dur?:number, order?:string, seed?:number,
 *   color?:string|((u:any)=>string), alpha?:number, out?:{t0:number,gap?:number,dur?:number,dy?:number},
 *   idle?:{amp?:number,freq?:number,phase?:number}, extra?:(u:any,t:number)=>any, mask?:boolean}} o
 *   - style: a STYLES name or (k,i,px)=>pose. - color: fixed colour or fn(unit)->colour (a unit is a char, a word or a line object).
 *   - out: staggered exit, units lift dy px (default -0.5 em) and fade with inCubic. - idle: a gentle wave after landing (amp px) so a hold never freezes.
 *   - extra(u,t): returns more pose fields, e.g. from emphasis(). - mask: clip each LINE to its own band (mask-rise, like hook()).
 * @returns {number} how many units were visible (alpha above 0)
 */
export function drawUnits(ctx, sp, t, { unit = 'char', style = 'rise', t0, gap = 0.035, dur = 0.4, order = 'forward', seed = 1, color = P.white, alpha = 1, out = null, idle = null, extra = null, mask = false }) {
  const units = unit === 'char' ? sp.chars : unit === 'word' ? sp.words : sp.lines, n = units.length, tm = unitTimes(n, t0, gap, dur, order, seed), fnS = typeof style === 'function' ? style : STYLES[style], px = sp.px;
  const tmo = out ? unitTimes(n, out.t0, out.gap ?? gap, out.dur ?? 0.3, order, seed) : null;
  let shown = 0;
  for (let i = 0; i < n; i++) {
    const u = units[i], k = prog(t, tm[i].s, tm[i].e); if (k <= 0) continue;
    const pose = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, a: 1, ...fnS(k, i, px) };
    if (tmo) { const ko = E.inCubic(prog(t, tmo[i].s, tmo[i].e)); pose.dy += (out.dy ?? -0.5 * px) * ko; pose.a *= 1 - ko; }
    if (idle && k >= 1 && !(tmo && t >= tmo[i].s)) pose.dy += idle.amp * Math.sin(2 * Math.PI * ((idle.freq ?? 0.8) * t - i * (idle.phase ?? 0.09)));
    let about = null, xc = null;
    if (extra) { const x = extra(u, t); if (x) { if (x.dx) pose.dx += x.dx; if (x.dy) pose.dy += x.dy; if (x.rot) pose.rot += x.rot; if (x.sx) pose.sx *= x.sx; if (x.sy) pose.sy *= x.sy; if (x.a !== undefined) pose.a *= x.a; if (x.color) xc = x.color; about = x.about || null; } }
    if (pose.a <= 0.003) continue;
    const col = xc || (typeof color === 'function' ? color(u) : color);
    ctx.save(); ctx.globalAlpha *= clamp(pose.a) * alpha;
    if (mask && unit !== 'char') { ctx.beginPath(); ctx.rect(0, u.y - 1.1 * px, 4000, 1.75 * px); ctx.clip(); }
    if (unit === 'char') {
      const cx = u.cx, cy = u.y - BASEFIX * px;
      if (about) { ctx.translate(about[0] + pose.dx, about[1] + pose.dy); ctx.scale(pose.sx, pose.sy); ctx.rotate(pose.rot); ctx.translate(-about[0], -about[1]); }
      else { ctx.translate(cx + pose.dx, cy + pose.dy); ctx.scale(pose.sx, pose.sy); ctx.rotate(pose.rot); ctx.translate(-cx, -cy); }
      setFont(ctx, sp.fam, px, sp.wght, sp.track); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(u.ch, u.x, u.y);
    } else {
      const cx = u.x + u.w / 2, cy = u.y - BASEFIX * px;
      ctx.translate(cx + pose.dx, cy + pose.dy); ctx.scale(pose.sx, pose.sy); ctx.rotate(pose.rot); ctx.translate(-cx, -cy);
      setFont(ctx, sp.fam, px, sp.wght, sp.track); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(u.text, u.x, u.y);
    }
    ctx.restore(); shown++;
  }
  return shown;
}

/**
 * Emphasis for drawUnits({extra}): the chosen words pop (scale 1 -> peak -> settle with a spring-like overshoot), switch colour and
 * jolt once. Scale is about the WORD's centre so neighbours keep their spacing. Peak 1.12-1.2; keep a 0.05 s head start before the voice.
 * @param {ReturnType<typeof splitText>} sp @param {{words:number[], t0:number, peak?:number, color?:string, dur?:number, hold?:boolean}} o
 * @returns {(u:any,t:number)=>any}
 */
export function emphasis(sp, { words, t0, peak = 1.16, color = P.green, dur = 0.5, hold = true }) {
  const set = new Map(words.map(w => [w, sp.words[w]]));
  return (u, t) => {
    const w = set.get(u.word); if (!w || t < t0) return null;
    const k = prog(t, t0, t0 + dur), s = 1 + (peak - 1) * Math.sin(Math.PI * Math.min(1, k * 1.0)) * (1 - 0.35 * k), cx = w.x + w.w / 2, cy = w.y - BASEFIX * sp.px;
    return { sx: s, sy: s, about: [cx, cy], rot: 0.025 * Math.sin(k * Math.PI * 2) * (1 - k), color: hold || k < 1 ? color : null };
  };
}

// ---------------------------------------------------------------- highlight, underline

/**
 * Highlighter sweep behind words: a marker bar grows left to right over `dur` (inOutCubic). Call it BEFORE drawUnits, then pass
 * the returned colorFor to drawUnits as `color` so letters turn dark (ink) once the bar has passed them.
 * Across lines it sweeps each line in turn. @param {*} ctx @param {ReturnType<typeof splitText>} sp
 * @param {{words:number[], t0:number, dur?:number, color?:string, ink?:string, base?:string, padX?:number, skew?:number, alpha?:number}} o
 * @returns {{colorFor:(u:any)=>string, progress:number}}
 */
export function highlightSweep(ctx, sp, t, { words, t0, dur = 0.5, color = P.green, ink = P.ink, base = P.white, padX = 12, skew = 0.12, alpha = 1 }) {
  const k = E.inOutCubic(prog(t, t0, t0 + dur)), ws = words.map(i => sp.words[i]), total = ws.reduce((s, w) => s + w.w, 0) || 1; let acc = 0; const covered = new Set();
  if (k > 0) {
    ctx.save(); ctx.fillStyle = rgba(color, 0.95 * alpha);
    for (const w of ws) {
      const a = acc / total, b = (acc + w.w) / total, wk = clamp((k - a) / (b - a)); acc += w.w; if (wk <= 0) continue;
      const x = w.x - padX, y = w.y - sp.px * 0.86, h = sp.px * 1.08, ww = (w.w + 2 * padX) * wk;
      ctx.beginPath(); ctx.moveTo(x + skew * h, y); ctx.lineTo(x + ww + skew * h, y); ctx.lineTo(x + ww, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
      for (const ci of w.chars) if (sp.chars[ci].cx < w.x + w.w * wk) covered.add(ci);
    }
    ctx.restore();
  }
  return { colorFor: u => (covered.has(u.idx) ? ink : base), progress: k };
}

/**
 * Underline drawn under a word, left to right. wavy gives a hand-drawn squiggle. @param {*} ctx @param {ReturnType<typeof splitText>} sp
 * @param {{word:number,t0:number,dur?:number,color?:string,width?:number,wavy?:boolean,gap?:number}} o
 */
export function underline(ctx, sp, t, { word, t0, dur = 0.45, color = P.green, width = 7, wavy = false, gap = 0.16 }) {
  const w = sp.words[word], k = E.outCubic(prog(t, t0, t0 + dur)); if (k <= 0) return;
  const y = w.y + sp.px * gap, x1 = w.x + w.w * k;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.beginPath();
  if (!wavy) { ctx.moveTo(w.x, y); ctx.lineTo(x1, y); } else { for (let x = w.x; x <= x1; x += 4) { const yy = y + 5 * Math.sin((x - w.x) / 14 + t * 6); x === w.x ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } }
  ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- counters and typing

/**
 * A number counting from `from` to `to` over [t0, t0+dur] with an ease (outExpo feels fast-then-settle; default). Returns the string with
 * thousands separators, decimals, prefix and suffix. The value lands exactly on `to` (no float dust).
 * @param {number} t @param {{from?:number,to:number,t0:number,dur?:number,ease?:string,decimals?:number,sep?:boolean,prefix?:string,suffix?:string}} o
 */
export function countText(t, { from = 0, to, t0, dur = 1.4, ease = 'outExpo', decimals = 0, sep = true, prefix = '', suffix = '' }) {
  const v = prog(t, t0, t0 + dur) >= 1 ? to : lerp(from, to, E[ease](prog(t, t0, t0 + dur))), s = Math.abs(v).toFixed(decimals);
  const [i, f] = s.split('.'), ii = sep ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : i;
  return (v < 0 ? '-' : '') + prefix + ii + (f ? '.' + f : '') + suffix;
}
/**
 * Draw a counter in fixed digit cells (tabular figures) so the number never jitters while it counts. `ref` is the final string; it
 * sets the width, and the live string is right-aligned inside it, with the left cells left blank (no leading zeros).
 * @param {*} ctx @param {string} s live string @param {string} ref widest string (usually the final value) @param {{x:number,y:number,fam?:string,px?:number,wght?:number,color?:string,align?:'center'|'left'}} o
 * @returns {{x0:number,x1:number}} the extent of the ref layout
 */
export function drawCounter(ctx, s, ref, { x, y, fam = 'sg', px = 160, wght = 700, color = P.white, align = 'center' }) {
  setFont(ctx, fam, px, wght); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = color;
  const dw = Math.max(...'0123456789'.split('').map(d => ctx.measureText(d).width)), cell = c => (/\d/.test(c) ? dw : ctx.measureText(c).width);
  const widths = [...ref].map(cell), total = widths.reduce((a, b) => a + b, 0), x0 = align === 'center' ? x - total / 2 : x;
  const live = [...s], off = ref.length - live.length; let cx = x0; for (let i = 0; i < off; i++) cx += widths[i];
  live.forEach((c, i) => { const w = widths[off + i]; ctx.fillText(c, cx + (w - ctx.measureText(c).width) / 2, y); cx += w; });
  return { x0, x1: x0 + total };
}
/** How many letters a typewriter has typed at time t: `cps` characters per second from t0 (14-24 cps reads as typing). */
export const typeCount = (t, { t0, cps = 20 }) => Math.max(0, Math.floor((t - t0) * cps) + (t >= t0 ? 1 : 0));
/** Blinking caret after the first n letters of a split block (draws a bar). Blinks 0.53 s on / 0.53 s off, always solid while typing. */
export function caret(ctx, sp, n, t, { color = P.green, t0 = 0, typing = false } = {}) {
  if (!typing && Math.floor((t - t0) / 0.53) % 2) return;
  const c = sp.chars[Math.max(0, Math.min(sp.chars.length, n) - 1)]; if (!c) return;
  ctx.fillStyle = color; ctx.fillRect(c.x + c.w + sp.px * 0.06, c.y - sp.px * 0.78, Math.max(5, sp.px * 0.07), sp.px * 0.98);
}
/**
 * Decode effect: final string with letters resolved left to right as k goes 0..1; the rest cycle through seeded random glyphs
 * at 14 changes a second. Same t and seed always give the same string. Spaces stay spaces.
 * @param {string} finalStr @param {number} k 0..1 @param {number} t @param {number} [seed] @param {string} [set]
 */
export function scramble(finalStr, k, t, seed = 7, set = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&') {
  const n = finalStr.length, done = Math.floor(clamp(k) * n + 1e-9); let s = '';
  for (let i = 0; i < n; i++) { const c = finalStr[i]; if (c === ' ' || i < done) { s += c; continue; } s += set[Math.floor(rng(hash(`${seed}:${i}:${Math.floor(t * 14)}`))() * set.length)]; }
  return s;
}

// ---------------------------------------------------------------- text on a path

/**
 * A path you can walk by arc length. pointFn(u) returns [x, y] for u in 0..1. Returns { len, at(s) -> {x,y,angle} } with s in px.
 * @param {(u:number)=>number[]} pointFn @param {number} [n] samples
 */
export function makePath(pointFn, n = 400) {
  const pts = Array.from({ length: n + 1 }, (_, i) => pointFn(i / n)), cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[n];
  return { len, at(s) {
    s = clamp(s, 0, len); let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1, f = (s - cum[lo]) / seg, a = pts[lo], b = pts[hi];
    return { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  } };
}
/** Arc of a circle from angle a0 to a1 (radians, 0 = right, clockwise on screen). */
export const arcPath = (cx, cy, r, a0, a1) => makePath(u => [cx + r * Math.cos(lerp(a0, a1, u)), cy + r * Math.sin(lerp(a0, a1, u))]);
/** Sine wave from x0 to x1 around y with `waves` full periods; phase in radians (animate it for a flowing line). */
export const wavePath = (x0, x1, y, amp, waves, phase = 0) => makePath(u => [lerp(x0, x1, u), y + amp * Math.sin(u * waves * 2 * Math.PI + phase)]);

/**
 * Draw text along a path, one glyph at a time, each rotated to the tangent (kerning kept by prefix widths).
 * Reveal: letters pop in with stagger `gap` from t0 (set gap 0 and t0 -1 for always visible). flow: px per second the text slides along the path (marquee).
 * Keep curvature gentle: radius at least 6 x font size, wave amplitude at most 0.6 x font size per 400 px, or letters collide.
 * @param {*} ctx @param {string} text @param {ReturnType<typeof makePath>} path @param {number} t
 * @param {{fam?:string,px?:number,wght?:number,track?:number,s0?:number,align?:'start'|'center',t0?:number,gap?:number,dur?:number,color?:string|((i:number)=>string),flow?:number,side?:number}} [o]
 *   s0 = distance along the path where the text starts (or its centre with align center). side -1 puts the text on the other side.
 */
export function drawOnPath(ctx, text, path, t, { fam = 'sg', px = 64, wght = 700, track = 0, s0 = 0, align = 'start', t0 = -1, gap = 0.035, dur = 0.35, color = P.white, flow = 0, side = 1 } = {}) {
  setFont(ctx, fam, px, wght, track); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const total = textW(ctx, text, px, track), start = (align === 'center' ? s0 - total / 2 : s0) + flow * t; let vis = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue;
    const pre = ctx.measureText(text.slice(0, i + 1)).width, cw = ctx.measureText(text[i]).width, x = pre - cw, w = cw - (track ? px * track : 0), s = start + x + w / 2;
    if (s < 0 || s > path.len) continue;
    const k = gap === 0 && t0 < 0 ? 1 : prog(t, t0 + i * gap, t0 + i * gap + dur); if (k <= 0) continue;
    const p = path.at(s), sc = Math.max(0, E.outBack(k, 2)), edge = Math.min(prog(s, 0, 60), prog(path.len - s, 0, 60));
    ctx.save(); ctx.globalAlpha *= clamp(k * 3) * (flow ? edge : 1); ctx.translate(p.x, p.y); ctx.rotate(p.angle + (side < 0 ? Math.PI : 0)); ctx.scale(sc, sc);
    ctx.fillStyle = typeof color === 'function' ? color(i) : color; ctx.fillText(text[i], -w / 2, side < 0 ? -px * 0.28 : 0); ctx.restore(); vis++;
  }
  return vis;
}
