// t1.2 demo: three pages in one window, each with its own header above it. Pages slide in 0.4 s and out 0.35 s, overlapping 0.1 s.
// The window title changes only after the old page has gone. Content on each page is alive (sweeps, bars, bobbing tiles).
import { P, begin, end, hook, icon, setFont, rgba, roundRect, E, prog, lerp, loop } from '../../engine/index.mjs';
import { drawWindow, windowRect } from '../t1_1_window-frame/module.mjs';
import { pagePlan, drawPages, rowIn, validatePlan } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 3.0 };
const CLOSER = 5.0;
const PLAN = pagePlan([1.7, 1.7, 1.6], { t0: 0.5, titles: ['Slide in', 'Slide out', 'Overlap'], heads: [['Slides in', 'over 0.4 seconds.'], ['Slides out', 'over 0.35 seconds.'], ['Overlaps', 'by 0.1 seconds.']] });
const WIN = windowRect({ y: 590, h: 640 });
const ROWS = [['mail', 'Inbox'], ['calendar', 'Calendar'], ['file-text', 'Files']];

function pageList(c, t, p) { // rows enter 0.14 s apart; a highlight steps down the list
  ROWS.forEach(([ic, name], i) => {
    const r = rowIn(t, p, i), y = 730 + i * 130, hl = Math.max(0, Math.sin(2 * Math.PI * ((t - p.s) / 1.5 - i / 3))) ** 4;
    c.save(); c.globalAlpha *= r.a; c.translate(r.dx, 0);
    c.fillStyle = rgba(P.green, 0.04 + 0.10 * hl); roundRect(c, 110, y, 800, 104, 20).fill(); c.strokeStyle = rgba(P.green, 0.25 + 0.6 * hl); c.lineWidth = 2 + 1.5 * hl; roundRect(c, 110, y, 800, 104, 20).stroke();
    icon(c, ic, 140, y + 26, 52, P.green, 2); setFont(c, 'inter', 52, 650, -0.01); c.fillStyle = P.white; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(name, 230, y + 68); c.restore();
  });
}
function pageBars(c, t, p) { // bars grow with outCubic, then breathe
  [['Mon', 0.62, P.cyan], ['Tue', 0.84, P.green], ['Wed', 0.48, P.orange]].forEach(([d, v, col], i) => {
    const r = rowIn(t, p, i), y = 740 + i * 130, k = E.outCubic(prog(t, p.s + 0.3 + 0.14 * i, p.s + 0.9 + 0.14 * i)), br = 1 + 0.03 * Math.sin(t * 5 + i * 1.7) * k;
    c.save(); c.globalAlpha *= r.a; setFont(c, 'inter', 52, 650); c.fillStyle = P.white; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(d, 120, y + 66);
    c.fillStyle = rgba(P.white, 0.06); roundRect(c, 270, y + 14, 640, 64, 16).fill(); c.fillStyle = col; roundRect(c, 270, y + 14, 640 * v * k * br, 64, 16).fill(); c.restore();
  });
}
function pageTiles(c, t, p) { // tiles pop with outBack, then bob
  [['Draft', 'pen-line', P.green], ['Review', 'eye', P.cyan], ['Send', 'send', P.orange], ['Done', 'circle-check', P.white]].forEach(([n, ic, col], i) => {
    const x = 110 + (i % 2) * 410, y = 740 + Math.floor(i / 2) * 210, k = E.outBack(prog(t, p.s + 0.2 + 0.12 * i, p.s + 0.7 + 0.12 * i), 1.7), bob = 6 * Math.sin(t * 3.4 + i * 1.3) * k;
    if (k <= 0) return; c.save(); c.translate(x + 190, y + 90 + bob); c.scale(k, k); c.fillStyle = P.panel2; c.strokeStyle = col; c.lineWidth = 3; roundRect(c, -190, -90, 380, 180, 24).fill(); c.stroke();
    icon(c, ic, -150, -26, 52, col, 2); setFont(c, 'inter', 46, 650); c.fillStyle = P.white; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(n, -78, 16); c.restore();
  });
}

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  PLAN.heads.forEach(h => hook(ctx, h, t));
  drawWindow(ctx, t, { rect: WIN, titles: PLAN.titles, enterAt: 0.2, closerAt: CLOSER }, c => drawPages(c, t, PLAN, [pageList, pageBars, pageTiles]));
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
export const _issues = validatePlan(PLAN, { closerAt: CLOSER });
