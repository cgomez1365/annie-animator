// t3.4 layout and composition for 9:16 (1080x1920): grid, thirds, safe zones, type hierarchy, text fitting, auto layout, contrast.
// Numbers come from the platform gates (engine SAFE): no text above y 250, from y 1580 down, or at x >= 940 inside y 800-1580; 42 px floor.
import { clamp, lerp, setFont, textW, wrapText, SAFE, P } from '../../engine/index.mjs';

export const W = 1080, H = 1920;

// ---------------------------------------------------------------- zones, grid, thirds

/** Named vertical slots used by the tt10 cards (y in px): kicker baseline, hook band, teaching window, Reels caption band, closer. */
export const SLOTS = { kicker: 300, hook: [400, 700], header: [420, 530], window: [560, 1200], caption: [1250, 1580], closer: [440, 1240] };

/**
 * Text-safe geometry. `full` is where any text may go (x 72-1008, y 262-1568, 12 px inside the platform limits). `rail` is the narrower
 * x range for text whose box touches y 800-1580 (it must stay left of x 940). `prime` is the calm centre (y 400-1250, clear of the Reels caption band).
 */
export const ZONES = {
  full: { x: 72, y: SAFE.top + 12, w: 936, h: SAFE.bottom - SAFE.top - 24 },
  rail: { x0: 72, x1: SAFE.railX - 12 }, // 72..928
  prime: { x: 72, y: 400, w: 856, h: 850 },
  railBand: SAFE.railY, // [800, 1580]
};

/**
 * Widest a CENTRED line (centre x) can be at a vertical span y0..y1 without reaching the action rail. Outside the rail band it is 936
 * (margins 72); inside it, the distance from the centre to x 928, doubled.
 * @param {number} y0 @param {number} y1 @param {number} [cx]
 */
export function maxWidthAt(y0, y1, cx = 540) {
  const inRail = y1 > ZONES.railBand[0] && y0 < ZONES.railBand[1];
  return inRail ? 2 * Math.min(cx - ZONES.rail.x0, ZONES.rail.x1 - cx) : 2 * Math.min(cx - 72, W - 72 - cx);
}

/**
 * Column grid for the frame. 12 columns, 72 px margins, 24 px gutters by default. Returns { colW, x(col), span(col, n) -> [x, w], cols }.
 * @param {{cols?:number,margin?:number,gutter?:number}} [o]
 */
export function makeGrid({ cols = 12, margin = 72, gutter = 24 } = {}) {
  const colW = (W - 2 * margin - gutter * (cols - 1)) / cols;
  return { cols, margin, gutter, colW, x: c => margin + c * (colW + gutter), span: (c, n) => [margin + c * (colW + gutter), n * colW + (n - 1) * gutter] };
}

/**
 * Rule of thirds for a vertical frame: lines at x 360/720 and y 640/1280, four power points. Vertical rule of thumb: the subject
 * (hero object, big number) sits on or near the upper-middle power points (y 640-760); text that supports it lives in the lower third above y 1250.
 */
export function thirds() {
  const xs = [W / 3, (2 * W) / 3], ys = [H / 3, (2 * H) / 3];
  return { xs, ys, points: ys.flatMap(y => xs.map(x => [x, y])), heroBand: [ys[0], ys[1]] };
}

/** y for the top of a block of height h so that it is centred optically (centre at 46 percent of the box, a touch above the middle). */
export const opticalY = (boxY, boxH, h) => boxY + (boxH - h) * 0.46;

/**
 * Equal tiles for n items in a box: cols columns, `gap` px, the last short row centred. aspect = height / width (omit to fill the box height).
 * @param {number} n @param {{x:number,y:number,w:number,h:number}} box @param {{cols?:number,gap?:number,aspect?:number,centerLast?:boolean}} [o]
 * @returns {Array<{x:number,y:number,w:number,h:number,row:number,col:number}>}
 */
export function gridLayout(n, box, { cols = 2, gap = 24, aspect, centerLast = true } = {}) {
  const rows = Math.ceil(n / cols), cw = (box.w - gap * (cols - 1)) / cols, ch = aspect ? cw * aspect : (box.h - gap * (rows - 1)) / rows, out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols, inRow = r === rows - 1 ? n - r * cols : cols, off = centerLast ? ((cols - inRow) * (cw + gap)) / 2 : 0;
    out.push({ x: box.x + off + c * (cw + gap), y: box.y + r * (ch + gap), w: cw, h: ch, row: r, col: c });
  }
  return out;
}
/** Stack rectangles of given heights top to bottom with equal gaps: returns the y of each. */
export function stackY(heights, { y = 0, gap = 24 } = {}) { let c = y; return heights.map(h => { const v = c; c += h + gap; return v; }); }
/** Centre of visual mass of rectangles (area weighted): [x, y]. Compare with the frame centre to judge balance. */
export function centerOfMass(rects) { let a = 0, x = 0, y = 0; for (const r of rects) { const s = r.w * r.h; a += s; x += (r.x + r.w / 2) * s; y += (r.y + r.h / 2) * s; } return a ? [x / a, y / a] : [W / 2, H / 2]; }

// ---------------------------------------------------------------- type hierarchy and fitting

/** Modular type scale from the 42 px floor: sizes(0) = 42, ratio 1.333 by default (42, 56, 75, 100, 133, 177). */
export const typeScale = (step, base = 42, ratio = 4 / 3) => Math.round(base * Math.pow(ratio, step));

/**
 * Roles for text blocks (tt10 cards): px is the preferred size, minPx the floor (never under 42), lines the most lines allowed.
 * head = Space Grotesk 104 (hook), sub = 56, body = 46, caption = 42 muted, eyebrow = 42 tracked uppercase green.
 */
export const ROLES = {
  head: { fam: 'sg', wght: 700, px: 104, minPx: 64, lines: 3, lineH: 1.08, color: P.white, track: -0.01 },
  sub: { fam: 'sg', wght: 600, px: 56, minPx: 46, lines: 3, lineH: 1.2, color: P.green, track: 0 },
  body: { fam: 'inter', wght: 500, px: 46, minPx: 42, lines: 4, lineH: 1.35, color: P.text, track: 0 },
  caption: { fam: 'inter', wght: 500, px: 42, minPx: 42, lines: 2, lineH: 1.3, color: P.muted, track: 0 },
  eyebrow: { fam: 'inter', wght: 700, px: 42, minPx: 42, lines: 1, lineH: 1, color: P.green, track: 0.14 },
};

/** Wrap with the narrowest width that keeps the same number of lines (lines come out even). */
function balanced(ctx, text, maxW) {
  const base = wrapText(ctx, text, maxW), n = base.length; if (n < 2 || text.includes('\n')) return base;
  let lo = 0, hi = maxW; for (const w of text.split(/\s+/)) lo = Math.max(lo, ctx.measureText(w).width);
  for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (wrapText(ctx, text, m).length <= n) hi = m; else lo = m; }
  return wrapText(ctx, text, hi);
}

/**
 * Largest font size at which `text` fits in maxW within maxLines (balanced lines). Steps down 2 px from maxPx to minPx (default 42).
 * Sets the font on ctx. Returns { px, lines, fits, w } where w is the widest line. When fits is false, shorten the copy: never go under 42.
 * @param {*} ctx @param {string} text @param {{maxW:number,maxLines?:number,maxPx?:number,minPx?:number,fam?:string,wght?:number,track?:number}} o
 */
export function fitPx(ctx, text, { maxW, maxLines = 2, maxPx = 104, minPx = 42, fam = 'sg', wght = 700, track = 0 }) {
  const floor = Math.max(42, minPx);
  for (let px = maxPx; px >= floor; px -= 2) {
    setFont(ctx, fam, px, wght, track); const lines = balanced(ctx, text, maxW), w = Math.max(...lines.map(l => textW(ctx, l, px, track)));
    if (lines.length <= maxLines && w <= maxW + 0.5) return { px, lines, fits: true, w };
  }
  setFont(ctx, fam, floor, wght, track); const lines = balanced(ctx, text, maxW), w = Math.max(...lines.map(l => textW(ctx, l, floor, track)));
  return { px: floor, lines, fits: lines.length <= maxLines && w <= maxW + 0.5, w };
}

/**
 * Lay out a vertical stack of text blocks inside a box, centred, fitted and safe-zone aware.
 * blocks: [{text, role:'head'|'sub'|'body'|'caption'|'eyebrow', color?, maxLines?}]. All blocks shrink together (scale 1 down to 0.55) until the
 * stack fits the box height; no block goes under its role's minPx or 42. Widths respect the action rail for the band they land in.
 * Gap between blocks = 0.5 x the next block's px. vAlign 'optical' (default), 'top' or 'center'.
 * @param {*} ctx @param {Array<{text:string,role?:string,color?:string,maxLines?:number}>} blocks
 * @param {{box?:{x:number,y:number,w:number,h:number},cx?:number,vAlign?:'optical'|'top'|'center',gapEm?:number}} [o]
 * @returns {{items:Array<{role:string,lines:string[],px:number,fam:string,wght:number,track:number,color:string,lineH:number,y0:number,y1:number,baselines:number[],cx:number,w:number}>,bounds:{x0:number,y0:number,x1:number,y1:number},fits:boolean,scale:number,issues:string[]}}
 */
export function autoLayout(ctx, blocks, { box = { x: 72, y: 400, w: 936, h: 850 }, cx = 540, vAlign = 'optical', gapEm = 0.5 } = {}) {
  const rolesOf = b => ROLES[b.role || 'body'];
  const plan = (scale, widths) => blocks.map((b, i) => {
    const r = rolesOf(b), px = Math.max(Math.max(42, r.minPx), Math.round(r.px * scale / 2) * 2), maxLines = b.maxLines ?? r.lines, text = r.track > 0 && b.role === 'eyebrow' ? b.text.toUpperCase() : b.text;
    const f = fitPx(ctx, text, { maxW: widths[i], maxLines, maxPx: px, minPx: Math.max(42, r.minPx), fam: r.fam, wght: r.wght, track: r.track }), lh = f.px * r.lineH;
    return { role: b.role || 'body', lines: f.lines, px: f.px, fam: r.fam, wght: r.wght, track: r.track, color: b.color || r.color, lineH: r.lineH, h: lh * f.lines.length, fits: f.fits, w: f.w };
  });
  const place = items => { let total = 0; items.forEach((it, i) => { total += it.h + (i ? gapEm * it.px : 0); }); return total; };
  let widths = blocks.map(() => Math.min(box.w, maxWidthAt(box.y, box.y + 1, cx))), scale = 1, items;
  for (let pass = 0; pass < 3; pass++) {
    scale = 1; items = plan(scale, widths); while (place(items) > box.h && scale > 0.55) { scale -= 0.02; items = plan(scale, widths); }
    const total = place(items), y0 = vAlign === 'top' ? box.y : vAlign === 'center' ? box.y + (box.h - total) / 2 : opticalY(box.y, box.h, total);
    let y = y0; const nw = widths.slice();
    items.forEach((it, i) => { y += i ? gapEm * it.px : 0; it.y0 = y; it.y1 = y + it.h; y += it.h; nw[i] = Math.min(box.w, maxWidthAt(it.y0, it.y1, cx)); });
    if (nw.every((w, i) => Math.abs(w - widths[i]) < 1)) break; widths = nw;
  }
  items.forEach(it => { it.cx = cx; it.baselines = it.lines.map((_, li) => it.y0 + ((it.lineH - 1) * it.px) / 2 + it.px * 0.8 + li * it.px * it.lineH); });
  const bounds = { x0: Math.min(...items.map(i => cx - i.w / 2)), x1: Math.max(...items.map(i => cx + i.w / 2)), y0: items[0].y0, y1: items[items.length - 1].y1 };
  const out = { items, bounds, fits: items.every(i => i.fits) && place(items) <= box.h + 1, scale, issues: [] }; out.issues = layoutIssues(out);
  return out;
}

/** Draw one item of autoLayout centred at its cx, with optional alpha and vertical offset (for entrances). Returns nothing. */
export function drawItem(ctx, it, { alpha = 1, dy = 0, dx = 0 } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; setFont(ctx, it.fam, it.px, it.wght, it.track); ctx.fillStyle = it.color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  it.lines.forEach((l, i) => ctx.fillText(it.role === 'eyebrow' ? l.toUpperCase() : l, it.cx + dx + (it.track ? (it.px * it.track) / 2 : 0), it.baselines[i] + dy)); ctx.restore();
}

// ---------------------------------------------------------------- checks

/**
 * Check a layout (from autoLayout, or {items:[{y0,y1,x0?,x1?,px,w,cx}]}) against the safe zones: top, bottom, rail, 42 px floor, 40 px side margin.
 * Returns problems; empty means clean. Block x extent = cx +- w/2 unless x0/x1 are given.
 */
export function layoutIssues({ items }) {
  const bad = [];
  items.forEach((it, i) => {
    const x0 = it.x0 ?? it.cx - it.w / 2, x1 = it.x1 ?? it.cx + it.w / 2, tag = `block ${i}${it.role ? ' (' + it.role + ')' : ''}`;
    if (it.px < SAFE.floor) bad.push(`${tag}: ${it.px}px is under ${SAFE.floor}px`);
    if (it.y0 < SAFE.top) bad.push(`${tag}: top ${it.y0.toFixed(0)} is above y ${SAFE.top}`);
    if (it.y1 > SAFE.bottom) bad.push(`${tag}: bottom ${it.y1.toFixed(0)} is below y ${SAFE.bottom}`);
    if (x1 >= SAFE.railX && it.y1 > SAFE.railY[0] && it.y0 < SAFE.railY[1]) bad.push(`${tag}: right edge ${x1.toFixed(0)} reaches the action rail`);
    if (x0 < 40 || x1 > W - 40) bad.push(`${tag}: closer than 40 px to the screen edge`);
  });
  return bad;
}
/**
 * Composition check for any set of named rectangles: overlaps between rects (except pairs you list in `allow`), hierarchy (adjacent type sizes
 * differ by at least 1.25x), and balance (centre of mass within `balance` of the frame centre in x). Returns { ok, issues }.
 * @param {Array<{name:string,x:number,y:number,w:number,h:number,px?:number}>} rects @param {{allow?:string[][],balance?:number}} [o]
 */
export function composeCheck(rects, { allow = [], balance = 0.08 } = {}) {
  const issues = [], ok2 = (a, b) => allow.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j]; if (ok2(a.name, b.name)) continue;
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) issues.push(`${a.name} overlaps ${b.name}`);
  }
  const t = rects.filter(r => r.px).sort((a, b) => b.px - a.px); for (let i = 1; i < t.length; i++) if (t[i].px !== t[i - 1].px && t[i - 1].px / t[i].px < 1.25) issues.push(`type sizes ${t[i - 1].px} and ${t[i].px} are too close to read as different levels`);
  const [cx] = centerOfMass(rects); if (Math.abs(cx - W / 2) / W > balance) issues.push(`visual mass is ${(cx - W / 2).toFixed(0)} px off the centre line`);
  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------- contrast

const hex = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c); const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
/** WCAG relative luminance of '#rrggbb'. */
export const luminance = c => { const [r, g, b] = hex(c); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
/** WCAG contrast ratio, 1 to 21. The checker fails text under 3:1 and warns under 4.5:1. */
export const contrastRatio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
/**
 * Return fg unchanged if it already reaches `min` against bg, else the nearest lighter (on a dark bg) or darker (on a light bg) mix of fg
 * that does. Steps 2 percent toward white/black. Use it for muted text and any colour you did not take from the palette.
 * @param {string} fg @param {string} bg @param {number} [min] 4.5 body text, 3 for large text (56 px+)
 */
export function ensureContrast(fg, bg, min = 4.5) {
  if (contrastRatio(fg, bg) >= min) return fg;
  const target = luminance(bg) < 0.5 ? [255, 255, 255] : [0, 0, 0], a = hex(fg);
  for (let k = 0.02; k <= 1.0001; k += 0.02) { const c = toHex(a.map((v, i) => lerp(v, target[i], k))); if (contrastRatio(c, bg) >= min) return c; }
  return toHex(target);
}
