// t1.2 page-transitions: the tt10 page system. Pages slide in 0.4 s outCubic, out 0.35 s inCubic, overlapping 0.1 s; each page
// has ONE header outside the window; the window title changes only after the old page has gone. All pure functions of t.
import { E, prog, lerp, clamp } from '../../engine/ease.mjs';
import { page as enginePage, pages as enginePages } from '../../engine/timeline.mjs';
import { P } from '../../engine/brand.mjs';

/** House constants (tt10_ops_hr): in 0.4 s, out 0.35 s, overlap 0.1 s, travel 160 px, header comes in 0.05 s after its page, leaves 0.3 s before it. */
export const PAGE = { inDur: 0.4, outDur: 0.35, overlap: 0.1, dist: 160, headIn: 0.05, headOut: 0.3 };

/**
 * Plan a run of pages. durs: seconds each page is "alive" (includes its 0.4 s in and 0.35 s out). Pages overlap by 0.1 s.
 * heads: [[line1, line2], ...] one per page (the header OUTSIDE the window). titles: window title per page (optional).
 * @param {number[]} durs
 * @param {{t0?:number, overlap?:number, heads?:string[][], titles?:string[], dist?:number, px?:number, b1?:number, b2?:number}} [o]
 * @returns {{pages:{s:number,e:number,i:number,title?:string}[], heads:object[], titles:{text:string,at:number}[], end:number, dist:number}}
 * heads[i] is a `hook` cap ({tIn,tOut,l1,l2,c1,c2,b1,b2,px}) ready for engine hook(ctx, cap, t); titles[i] has at = end of page i-1.
 */
export function pagePlan(durs, o = {}) {
  const ov = o.overlap ?? PAGE.overlap, ws = enginePages(durs, { t0: o.t0 ?? 0, overlap: ov });
  const pg = ws.map((w, i) => ({ ...w, i, title: o.titles?.[i] }));
  const heads = (o.heads || []).map(([l1, l2], i) => ({ tIn: pg[i].s + PAGE.headIn, tOut: pg[i].e - PAGE.headOut, l1, l2, c1: P.white, c2: P.green, b1: o.b1 ?? 446, b2: o.b2 ?? 514, px: o.px ?? 56 }));
  const titles = (o.titles || []).map((text, i) => ({ text, at: i === 0 ? -Infinity : pg[i - 1].e }));
  return { pages: pg, heads, titles, end: pg[pg.length - 1].e, dist: o.dist ?? PAGE.dist };
}

/**
 * Slide state of one page at t, or null when it is not on screen. dir = where the page COMES FROM: 'right' (default: enters from the
 * right, leaves to the left), 'left', 'up' (enters from below, leaves upward) or 'down'. Returns {a, dx, dy, i, o}; apply
 * ctx.globalAlpha *= a; ctx.translate(dx, dy).
 * @param {number} t @param {{s:number,e:number}} p @param {{dir?:string,dist?:number,inDur?:number,outDur?:number}} [o]
 */
export function pageSlide(t, p, o = {}) {
  const q = enginePage(t, { s: p.s, e: p.e, inDur: o.inDur ?? PAGE.inDur, outDur: o.outDur ?? PAGE.outDur, dist: o.dist ?? PAGE.dist });
  if (!q) return null;
  const d = { right: [1, 0], left: [-1, 0], up: [0, 1], down: [0, -1] }[o.dir || 'right'];
  return { a: q.a, dx: q.dx * d[0], dy: q.dx * d[1], i: q.i, o: q.o };
}

/**
 * Draw every page that is on screen. drawers[i](ctx, t, page, lt) draws page i in absolute coordinates; lt = t - page.s (local seconds,
 * use it to stagger rows). Each call is wrapped in save/restore with the slide applied. Clip the window's inner rect BEFORE calling.
 * Pages are drawn in order, so during the 0.1 s overlap the incoming page is on top.
 * @returns {number[]} indexes drawn
 */
export function drawPages(ctx, t, plan, drawers, o = {}) {
  const drawn = [];
  plan.pages.forEach((p, i) => {
    const sl = pageSlide(t, p, { dist: plan.dist, ...o }); if (!sl || !drawers[i]) return;
    ctx.save(); ctx.globalAlpha *= sl.a; ctx.translate(sl.dx, sl.dy); drawers[i](ctx, t, p, t - p.s); ctx.restore(); drawn.push(i);
  });
  return drawn;
}

/** Index of the page that is most visible at t (the incoming one wins a tie), or -1. */
export function activePage(t, plan) {
  let best = -1, ba = 0.0001;
  plan.pages.forEach((p, i) => { const s = pageSlide(t, p); if (s && s.a >= ba) { best = i; ba = s.a; } });
  return best;
}

/**
 * Row entrance inside a page: row i starts `first` s after the page starts, rows `gap` s apart (tt10: 0.15 / 0.14), 0.4 s outCubic.
 * Returns {k, a, dx} where dx = 40 px slide from the right (apply as ctx.translate(dx,0), ctx.globalAlpha *= a).
 */
export function rowIn(t, p, i, { first = 0.15, gap = 0.14, dur = 0.4, slide = 40, ease = 'outCubic' } = {}) {
  const k = E[ease](prog(t, p.s + first + gap * i, p.s + first + gap * i + dur)); return { k, a: k, dx: slide * (1 - k) };
}

/**
 * Check a plan against the tt10 rules. Returns [{level:'fail'|'warn', msg}].
 * fail: overlap not 0.1 s; a header still on screen when the next one starts; a title that changes before the old page is gone;
 *   the last page outliving closerAt + 0.3. warn: page under 1.8 s (0.75 s of it is sliding); header under 1.0 s on screen.
 * @param {ReturnType<typeof pagePlan>} plan @param {{closerAt?:number}} [o]
 */
export function validatePlan(plan, o = {}) {
  const out = [], pg = plan.pages;
  pg.forEach((p, i) => {
    if (i > 0 && Math.abs(pg[i - 1].e - p.s - PAGE.overlap) > 1e-9) out.push({ level: 'fail', msg: `page ${i} starts ${(pg[i - 1].e - p.s).toFixed(3)} s before page ${i - 1} ends, want ${PAGE.overlap}` });
    if (p.e - p.s < 1.8) out.push({ level: 'warn', msg: `page ${i} lasts ${(p.e - p.s).toFixed(2)} s: only ${(p.e - p.s - 0.75).toFixed(2)} s is still` });
  });
  plan.heads.forEach((h, i) => {
    if (h.tOut - h.tIn < 1.0) out.push({ level: 'warn', msg: `header ${i} is on screen ${(h.tOut - h.tIn).toFixed(2)} s: too short to read` });
    if (i > 0 && plan.heads[i - 1].tOut + 0.2 > h.tIn + 1e-9) out.push({ level: 'fail', msg: `header ${i - 1} (gone at ${(plan.heads[i - 1].tOut + 0.2).toFixed(2)}) overlaps header ${i} (starts ${h.tIn.toFixed(2)})` });
  });
  plan.titles.forEach((tt, i) => { if (i > 0 && tt.at < pg[i - 1].e - 1e-9) out.push({ level: 'fail', msg: `title ${i} changes at ${tt.at.toFixed(2)} before page ${i - 1} is gone (${pg[i - 1].e.toFixed(2)})` }); });
  if (o.closerAt !== undefined && plan.end > o.closerAt + 0.3 + 1e-9) out.push({ level: 'fail', msg: `last page ends ${plan.end.toFixed(2)}, after the window has left (${(o.closerAt + 0.3).toFixed(2)})` });
  return out;
}
