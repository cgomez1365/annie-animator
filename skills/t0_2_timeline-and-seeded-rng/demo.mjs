// t0.2 demo: a beat chart (sequence with overlaps) above two scatter fields built from the SAME seed: they move identically.
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, E, prog, lerp, loop } from '../../engine/index.mjs';
import { sequence } from '../../engine/timeline.mjs';
import { scatterField, scatterPose, scatterLoop, beatChart } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.6 };
const CLOSER = 4.4, WIN = { x: 72, y: 660, w: 936, h: 580, title: 'seed 42' };
const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'Plan it once.', l2: 'Same every time.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 2.1, tOut: 4.25, l1: 'Beats on a timeline,', l2: 'seeded and repeatable.', c2: P.green, b1: 446, b2: 514, px: 56 };
const BEATS = [['hook', 1.6], ['panel', 1.4, 0.2], ['list', 1.2, 0.2], ['closer', 1.0, 0.1]];
const CHART = beatChart(BEATS, { x0: 290, width: 640 }), END = sequence(BEATS).end, ROWS = [800, 856, 912, 968], ROWC = [P.green, P.cyan, P.orange, P.white];
const FIELDS = [{ x: 110, label: 'run 1' }, { x: 560, label: 'run 2' }], FW = 410, FY = 1030, FH = 190;
const COLORS = [P.green, P.cyan, P.orange, P.white];
// both fields call scatterField with the same seed: identical pieces by construction
const PIECES = FIELDS.map(() => scatterField(42, 14, { box: [30, 70, FW - 30, FH - 25], speed: [120, 380], size: [14, 24] }));

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.9, 2.3)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // beat chart: bars grow in one after another (stagger 0.15 s), a playhead loops across
    CHART.forEach((b, n) => {
      const k = E.outCubic(prog(t, 2.35 + 0.15 * n, 2.8 + 0.15 * n)); if (k <= 0) return;
      ctx.save(); ctx.globalAlpha *= k;
      setFont(ctx, 'inter', 42, 600); ctx.fillStyle = ROWC[n]; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(b.name, 110, ROWS[n] + 15);
      ctx.fillStyle = rgba(ROWC[n], 0.28); roundRect(ctx, b.x, ROWS[n] - 18, b.w * k, 36, 10).fill(); ctx.strokeStyle = ROWC[n]; ctx.lineWidth = 2.5; roundRect(ctx, b.x, ROWS[n] - 18, b.w * k, 36, 10).stroke();
      ctx.restore();
    });
    const ph = loop(t - 2.9, 3.2); if (t > 2.9) { const x = lerp(290, 930, E.inOutSine(ph)); ctx.strokeStyle = P.white; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 772); ctx.lineTo(x, 990); ctx.stroke(); ctx.fillStyle = P.white; ctx.beginPath(); ctx.arc(x, 772, 7, 0, 7); ctx.fill(); }
    // two fields, same seed
    FIELDS.forEach((f, n) => {
      const k = E.outCubic(prog(t, 2.55 + 0.15 * n, 3.0 + 0.15 * n)); if (k <= 0) return;
      ctx.save(); ctx.globalAlpha *= k; ctx.translate(f.x, FY);
      ctx.fillStyle = P.panel2; roundRect(ctx, 0, 0, FW, FH, 16).fill(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; roundRect(ctx, 1, 1, FW - 2, FH - 2, 15).stroke();
      setFont(ctx, 'inter', 42, 600); ctx.fillStyle = P.muted; ctx.textAlign = 'left'; ctx.fillText(f.label, 20, 48);
      ctx.save(); clipRect(ctx, 0, 0, FW, FH, 16);
      const sk = scatterLoop(t, 3.0);
      PIECES[n].forEach(p => { const q = scatterPose(p, sk, t); ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = COLORS[p.hue]; roundRect(ctx, -p.size / 2, -p.size / 2, p.size, p.size, 5).fill(); ctx.restore(); });
      ctx.restore(); ctx.restore();
    });
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
