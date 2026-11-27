// t6.4 demo (8 s): a card is scored for light, motion and contrast. A dial fills to the score, four checks tick, and a brightness trace
// scrolls under its limit line. Built with the motion kit: makeCard('reduced') or makeCard('none') give the calmer versions.
import { P, E, prog, lerp, clamp, rgba, setFont, roundRect, clipRect, begin, end, hook, windowFrame, windowInner, icon } from '../../engine/index.mjs';
import { motionKit } from './module.mjs';

/** The score the dial shows. The test requires the real score of this very card to be at least this. */
export const SHOWN = 96;
export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 4.1 };
const CLOSER = 4.8, WIN = { x: 72, y: 660, w: 936, h: 580, title: 'a11y.mjs' };
const HOOK = { tIn: 0.15, tOut: 1.4, l1: 'Safe to watch,', l2: 'easy to read.', c1: P.white, c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 1.65, tOut: 4.5, l1: 'Scored for light,', l2: 'motion and contrast.', c1: P.white, c2: P.green, b1: 446, b2: 514, px: 56 };
const ROWS = [['eye', 'No flashing', 2.9], ['accessibility', 'Contrast 4.5:1', 3.25], ['zap', 'Calm motion', 3.6], ['check', 'Captions fit', 3.95]];
const DIAL = { x: 262, y: 920, r: 118 };

export function makeCard(mode = 'full') {
  const kit = motionKit(mode);
  function dial(ctx, t) {
    const a = E.outCubic(prog(t, 2.0, 2.4)); if (a <= 0) return;
    const f = E.inOutCubic(prog(t, 2.5, 3.9)), score = Math.round(SHOWN * f), a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5, pulse = t > 3.95 ? 0.5 + 0.5 * Math.sin((t - 3.95) * 5) : 0;
    ctx.save(); ctx.globalAlpha *= a; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(DIAL.x, DIAL.y, DIAL.r, a0, a1); ctx.stroke();
    ctx.save(); ctx.shadowColor = P.green; ctx.shadowBlur = 10 + 14 * pulse; ctx.strokeStyle = P.green; ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(DIAL.x, DIAL.y, DIAL.r, a0, a0 + (a1 - a0) * (SHOWN / 100) * f); ctx.stroke(); ctx.restore();
    setFont(ctx, 'sg', 104, 700); ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(score), DIAL.x, DIAL.y + 30);
    setFont(ctx, 'mono', 42, 700, 0.1); ctx.fillStyle = P.muted; ctx.fillText('SCORE', DIAL.x + 2, DIAL.y + 116); ctx.restore();
  }
  function row(ctx, t, i, [ic, label, t0]) {
    const y = 772 + 92 * i, k = E.outCubic(prog(t, 2.3 + 0.1 * i, 2.6 + 0.1 * i)); if (k <= 0) return;
    const tk = prog(t, t0, t0 + 0.35), pop = E.outBack(tk, kit.overshoot(2.2) || 0.01), shown = kit.mode === 'none' ? (tk > 0 ? 1 : 0) : clamp(pop), glow = t > t0 + 0.4 ? Math.max(0, Math.sin(Math.PI * 2 * ((t - t0) / 1.6 - 0.15 * i))) ** 4 : 0;
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(kit.amp(40) * (1 - k), 0);
    ctx.fillStyle = P.panel2; ctx.strokeStyle = tk > 0 ? P.green : 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3 + 1.5 * glow; roundRect(ctx, 470, y, 64, 64, 16).fill(); ctx.stroke();
    if (tk > 0) { icon(ctx, 'check', 470 + 32 - 17 * Math.max(0.01, shown), y + 32 - 17 * Math.max(0.01, shown), 34 * Math.max(0.01, shown), P.green, 3.4); }
    else icon(ctx, ic, 484, y + 14, 36, P.muted, 2.2);
    setFont(ctx, 'inter', 44, 650); ctx.fillStyle = tk > 0 ? P.white : P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 556, y + 47);
    ctx.restore();
  }
  function trace(ctx, t) { // a brightness trace scrolling left under its limit line: gentle bumps, never crossing
    const a = E.outCubic(prog(t, 2.3, 2.7)); if (a <= 0) return; const x0 = 110, x1 = 930, y0 = 1146, y1 = 1222;
    ctx.save(); ctx.globalAlpha *= a; clipRect(ctx, x0 - 6, y0 - 8, x1 - x0 + 12, y1 - y0 + 16, 12); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x0 - 6, y0 - 8, x1 - x0 + 12, y1 - y0 + 16);
    ctx.strokeStyle = rgba(P.red, 0.8); ctx.lineWidth = 3; ctx.setLineDash([12, 9]); ctx.beginPath(); ctx.moveTo(x0, y0 + 6); ctx.lineTo(x1, y0 + 6); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = P.green; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let x = x0; x <= x1; x += 6) { const u = (x - x0) / 120 + t * 1.8, v = 0.5 + 0.28 * Math.sin(u * 2.1) + 0.14 * Math.sin(u * 5.3 + 1), y = lerp(y1 - 6, y0 + 22, v); x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.restore();
  }
  function frame(t) {
    const { cv, ctx } = begin(t, { closerAt: CLOSER });
    hook(ctx, HOOK, t); hook(ctx, HEAD, t);
    const wi = E.outCubic(prog(t, 1.6, 2.0)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
    if (wi > 0 && wo > 0.001) {
      ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, kit.amp(80) * (1 - wi)); windowFrame(ctx, WIN);
      ctx.save(); clipRect(ctx, ...windowInner(WIN)); dial(ctx, t); ROWS.forEach((r, i) => row(ctx, t, i, r)); trace(ctx, t); ctx.restore(); ctx.restore();
    }
    return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
  }
  return { META, frame };
}
const def = makeCard(process.env.ANNIE_MOTION || 'full');
export const frame = def.frame;
