// t3.3 demo (8 s): three data pages inside one window (tt10 page slides), then the engine closer.
//   page 1  comparison reveal (two bars grow, delta badge pops) + a sparkline row
//   page 2  line chart, two series, smooth, area fill, pulsing head dots, x labels
//   page 3  donut sweeping round with a counting centre number and a legend
// All numbers are made up for the demo. All text is 42 px or more and inside the safe zones.
import { P, E, prog, rgba, setFont, begin, end, hook, windowFrame, windowInner, clipRect, page, pages } from '../../engine/index.mjs';
import { compareReveal, sparkline, lineChart, donutChart, drawNumber, legend, easeNumber, fmt } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 4.3 };
const CLOSER = 4.9, WIN = { x: 72, y: 640, w: 936, h: 800 };
const PG = pages([1.9, 1.6, 1.6], { t0: 0.3 }); // 0.3-2.2, 2.1-3.7, 3.6-5.2
const HEADS = [
  { tIn: 0.35, tOut: 2.0, l1: 'Compare in one glance,', l2: 'the winner glows.', c2: P.green, b1: 446, b2: 514, px: 56 },
  { tIn: 2.3, tOut: 3.55, l1: 'Lines draw themselves,', l2: 'smooth and honest.', c2: P.green, b1: 446, b2: 514, px: 56 },
  { tIn: 3.75, tOut: 4.8, l1: 'Donuts fill in,', l2: 'numbers count up.', c2: P.green, b1: 446, b2: 514, px: 56 },
];
const TITLES = ['This week', 'Trend', 'Split'];
const SPARK = [6, 9, 8, 12, 11, 17, 15, 22, 27, 31];
const NOW = [8, 12, 10, 18, 24, 22, 31], BEFORE = [6, 7, 9, 8, 12, 14, 15];

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  for (const h of HEADS) hook(ctx, h, t);
  const wi = E.outCubic(prog(t, 0.15, 0.55)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    TITLES.forEach((tt, i) => { const p = page(t, PG[i]); const a = p ? p.a : 0; if (a <= 0.01) return; ctx.save(); ctx.globalAlpha *= a; setFont(ctx, 'inter', 42, 600); ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(tt, WIN.x + WIN.w / 2, WIN.y + 51); ctx.restore(); });
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // ---- page 1
    let p = page(t, PG[0]);
    if (p) {
      ctx.save(); ctx.globalAlpha *= p.a; ctx.translate(p.dx, 0);
      compareReveal(ctx, t, { x: 110, y: 780, w: 820, h: 520, a: { label: 'Last week', value: 24 }, b: { label: 'This week', value: 41 }, t0: 0.75, px: 52, badgeAt: 1.75 });
      const sk = E.outCubic(prog(t, 1.2, 1.5)); ctx.save(); ctx.globalAlpha *= sk; setFont(ctx, 'inter', 44, 600); ctx.fillStyle = P.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Trend', 110, 1345); ctx.restore();
      sparkline(ctx, t, { x: 300, y: 1265, w: 630, h: 120, values: SPARK, color: P.cyan, t0: 1.3, dur: 1.0 });
      ctx.restore();
    }
    // ---- page 2
    p = page(t, PG[1]);
    if (p) {
      ctx.save(); ctx.globalAlpha *= p.a; ctx.translate(p.dx, 0);
      lineChart(ctx, t, { x: 110, y: 740, w: 820, h: 560, series: [{ values: NOW, color: P.green, area: true }, { values: BEFORE, color: P.cyan, area: false }], t0: 2.5, dur: 1.2, xLabels: ['Mon', 'Wed', 'Fri', 'Sun'], px: 42, max: 40 });
      legend(ctx, t, { x: 110, y: 1385, w: 820, items: [{ label: 'This week', color: P.green }, { label: 'Last week', color: P.cyan }], t0: 3.0 });
      ctx.restore();
    }
    // ---- page 3
    p = page(t, PG[2]);
    if (p) {
      ctx.save(); ctx.globalAlpha *= p.a; ctx.translate(p.dx, 0);
      const SL = [{ value: 62, color: P.green }, { value: 25, color: P.cyan }, { value: 13, color: P.orange }];
      donutChart(ctx, t, { cx: 540, cy: 1020, r: 215, thick: 58, slices: SL, t0: 3.95, dur: 1.0, highlight: 0 });
      if (t > 3.9) drawNumber(ctx, fmt(easeNumber(t, { to: 62, t0: 3.95, dur: 1.0, ease: 'outCubic' }), { suffix: '%' }), { x: 540, y: 1052, px: 112, t, popT: 4.95 });
      legend(ctx, t, { x: 110, y: 1370, w: 820, items: [{ label: 'Done', color: P.green }, { label: 'Open', color: P.cyan }, { label: 'Late', color: P.orange }], t0: 4.2 });
      ctx.restore();
    }
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
