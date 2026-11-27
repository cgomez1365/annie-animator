// t1.1 window-frame: the macOS-style window of the tt10 cards. Frame, traffic lights, title bar, title crossfade,
// entrance and exit, adjustable size, content clipped to the inner rect. Pure functions of (t, options): any frame order.
import { E, prog, lerp, clamp, rgba } from '../../engine/ease.mjs';
import { setFont, textW, roundRect } from '../../engine/canvas.mjs';
import { P, SAFE } from '../../engine/brand.mjs';

/** House default window: x 72, y 560, w 936, h 640, title bar 72, corner radius 22 (tt10 uses y 660 and h 580). */
export const WIN = { x: 72, y: 560, w: 936, h: 640, bar: 72, r: 22 };
const DOTS = ['#ff5f57', '#febc2e', '#28c840'];

/**
 * Complete a window rect: fills defaults and adds `inner` [x,y,w,h] (the content area under the title bar, inside the 2 px border).
 * @param {{x?:number,y?:number,w?:number,h?:number,bar?:number,r?:number}} [o]
 * @returns {{x:number,y:number,w:number,h:number,bar:number,r:number,inner:number[],cx:number,cy:number}}
 */
export function windowRect(o = {}) {
  const r = { ...WIN, ...o };
  return { ...r, inner: [r.x + 2, r.y + r.bar + 2, r.w - 4, r.h - r.bar - 4], cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

/**
 * Check a window against the safe zones. Returns [{level:'fail'|'warn', msg}] (empty = fine).
 * fail: leaves the frame, reaches y 1580 (caption band), top above y 560 (collides with the page header at baselines 446/514)
 * unless allowTop. warn: bottom inside the Reels caption band (y 1250+), inner height under 300, a width that squeezes the title.
 * @param {*} rect @param {{allowTop?:boolean}} [o]
 */
export function validateWindow(rect, o = {}) {
  const r = windowRect(rect), out = [];
  if (r.x < 0 || r.x + r.w > SAFE.W) out.push({ level: 'fail', msg: `window leaves the frame sideways (x ${r.x}..${r.x + r.w})` });
  if (r.y + r.h > SAFE.bottom) out.push({ level: 'fail', msg: `window reaches y ${r.y + r.h}, caption band starts at ${SAFE.bottom}` });
  if (r.y < 560 && !o.allowTop) out.push({ level: 'fail', msg: `window top y ${r.y} is under the page header (baselines 446/514); use y >= 560` });
  if (r.y + r.h > SAFE.soft[0]) out.push({ level: 'warn', msg: `window bottom y ${r.y + r.h} is inside the Reels caption band (${SAFE.soft[0]}+)` });
  if (r.inner[3] < 300) out.push({ level: 'warn', msg: `inner height ${r.inner[3]} is small; content needs 300+` });
  if (r.w < 600) out.push({ level: 'warn', msg: `width ${r.w} leaves little room for the title` });
  return out;
}

/** Text inside a window must end left of this x when it sits below y 800 (the action rail starts at x 940). */
export const TEXT_MAX_X = 930;

/** Interpolate two rects (for a resize). k is an eased 0..1 and may overshoot (outBack gives a settle). */
export function lerpRect(a, b, k) {
  const A = windowRect(a), B = windowRect(b);
  return windowRect({ x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k), w: lerp(A.w, B.w, k), h: lerp(A.h, B.h, k), bar: A.bar, r: A.r });
}

/**
 * Which titles are visible at time t and how strongly: a crossfade over `fade` s (default 0.3). The old title fades out and
 * lifts 6 px while the new one fades in from 6 px below. titles: [{text, at, color?}] sorted by `at`; the first one's `at` may be -Infinity.
 * @returns {{text:string,a:number,dy:number,color?:string}[]} alphas of the two neighbours sum to 1 during a fade
 */
export function titleState(t, titles, { fade = 0.3 } = {}) {
  let i = 0; for (let j = 1; j < titles.length; j++) if (t >= titles[j].at) i = j;
  const k = i === 0 ? 1 : E.outCubic(prog(t, titles[i].at, titles[i].at + fade)), out = [];
  out.push({ ...titles[i], a: k, dy: 6 * (1 - k) });
  if (i > 0 && k < 1) out.push({ ...titles[i - 1], a: 1 - k, dy: -6 * k });
  return out;
}

/**
 * Entrance of the window as a whole: slides up `rise` px and fades in over dur s with outCubic (hello_card: 0.4 s, 80 px).
 * @returns {{k:number,a:number,dy:number}} k eased 0..1, a alpha, dy offset in px
 */
export function enter(t, { t0 = 0, dur = 0.4, rise = 80 } = {}) { const k = E.outCubic(prog(t, t0, t0 + dur)); return { k, a: k, dy: rise * (1 - k) }; }
/** Exit alpha (1 -> 0) for the closer: starts 0.1 s before closerAt, ends 0.3 s after it, so the closer's ground covers the rest. */
export const leave = (t, closerAt) => 1 - prog(t, closerAt - 0.1, closerAt + 0.3);

/**
 * Draw only the frame: panel, border, title bar, traffic lights, crossfading title. Leaves the content area empty.
 * o: { rect, titles:[{text,at}], title (single string), fade, pulse:true breathing green hairline on the border, titleColor }
 * Title text is 42 px / 600 (the readable floor). It is shrunk never; a title wider than the bar is cut with an ellipsis.
 * @param {*} ctx @param {number} t @param {object} o
 */
export function drawFrame(ctx, t, o = {}) {
  const R = windowRect(o.rect), { x, y, w, h, bar, r } = R;
  ctx.fillStyle = P.panel; roundRect(ctx, x, y, w, h, r).fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; roundRect(ctx, x + 1, y + 1, w - 2, h - 2, r - 1).stroke();
  if (o.pulse !== false) { // a slow green breathing on the hairline: the frame itself is never dead
    const a = 0.05 + 0.05 * Math.sin(t * 2 * Math.PI / 2.4); ctx.strokeStyle = rgba(P.green, a); ctx.lineWidth = 2; roundRect(ctx, x + 1, y + 1, w - 2, h - 2, r - 1).stroke();
  }
  ctx.fillStyle = P.panel2; roundRect(ctx, x + 2, y + 2, w - 4, bar - 2, [r - 2, r - 2, 0, 0]).fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y + bar, w, 2);
  DOTS.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 40 + i * 30, y + bar / 2, 9, 0, Math.PI * 2); ctx.fill(); });
  const titles = o.titles || (o.title ? [{ text: o.title, at: -Infinity }] : []);
  for (const s of titleState(t, titles, { fade: o.fade })) {
    ctx.save(); ctx.globalAlpha *= s.a; setFont(ctx, 'inter', 42, 600); ctx.fillStyle = s.color || o.titleColor || P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(fitEllipsis(ctx, s.text, w - 260), x + w / 2, y + bar / 2 + 15 + s.dy); ctx.restore();
  }
}
function fitEllipsis(ctx, s, maxW) { if (textW(ctx, s) <= maxW) return s; let n = s.length; while (n > 1 && textW(ctx, s.slice(0, n) + '...') > maxW) n--; return s.slice(0, n) + '...'; }

/**
 * Clip the rest of the current save() to the window's inner rect. Top corners square, bottom corners follow the window radius
 * (so content never pokes out of the rounded bottom corners). Call inside ctx.save()/restore().
 * @param {*} ctx @param {*} rect
 */
export function clipInner(ctx, rect) {
  const R = windowRect(rect), [x, y, w, h] = R.inner; ctx.beginPath(); ctx.roundRect(x, y, w, h, [0, 0, R.r - 2, R.r - 2]); ctx.clip();
}

/**
 * The whole window in one call: entrance, frame, clipped content, exit. content(ctx, inner, rect) draws in absolute frame
 * coordinates inside the clip. o: { rect, titles|title, enterAt, enterDur, rise, closerAt, alpha }. Returns false when nothing was drawn.
 * @param {*} ctx @param {number} t @param {object} o @param {(ctx:any, inner:number[], rect:any)=>void} content
 */
export function drawWindow(ctx, t, o, content) {
  const en = enter(t, { t0: o.enterAt ?? 0, dur: o.enterDur ?? 0.4, rise: o.rise ?? 80 }), lv = o.closerAt === undefined ? 1 : leave(t, o.closerAt), a = en.a * lv * (o.alpha ?? 1);
  if (a <= 0.001) return false;
  const rect = windowRect(o.rect);
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, en.dy);
  drawFrame(ctx, t, { ...o, rect });
  if (content) { ctx.save(); clipInner(ctx, rect); content(ctx, rect.inner, rect); ctx.restore(); }
  ctx.restore(); return true;
}
