// t0.1 demo: four balls, same move, four feels. 7.5 s. linear (mechanical) vs outCubic vs outBack vs a spring.
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, glow, lerp, prog, E } from '../../engine/index.mjs';
import { springLegs, play } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.2 };
const CLOSER = 4.4, WIN = { x: 72, y: 660, w: 936, h: 580, title: 'Same move, four curves' };
const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'Same move.', l2: 'Different feel.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 2.1, tOut: 4.25, l1: 'Curves give', l2: 'motion a feel.', c2: P.green, b1: 446, b2: 514, px: 56 };
const X0 = 390, X1 = 880, T0 = 2.45, LEG = 1.1, EASE_DUR = 0.9;
const LANES = [
  { name: 'linear', y: 815, color: P.muted, val: (t, from, to) => lerp(from, to, prog(t, 0, EASE_DUR)) },
  { name: 'outCubic', y: 925, color: P.cyan, val: (t, from, to) => lerp(from, to, E.outCubic(prog(t, 0, EASE_DUR))) },
  { name: 'outBack', y: 1035, color: P.orange, val: (t, from, to) => lerp(from, to, E.outBack(prog(t, 0, EASE_DUR), 2.0)) },
  { name: 'spring', y: 1145, color: P.green, spring: true },
];
// position 0..1 of a lane at time t: legs alternate right and left, every LEG seconds
function value(l, t) {
  if (l.spring) return springLegs(t, T0, LEG, [1, 0, 1, 0]);
  const e = t - T0; if (e < 0) return 0;
  const leg = Math.floor(e / LEG), from = leg % 2 === 0 ? 0 : 1;
  return l.val(e - leg * LEG, from, 1 - from);
}

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.9, 2.3)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // finish lines: the target at both ends
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; for (const x of [X0, X1]) { ctx.beginPath(); ctx.moveTo(x, 770); ctx.lineTo(x, 1190); ctx.stroke(); }
    LANES.forEach((l, n) => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + n);
      setFont(ctx, 'inter', 42, 600); ctx.fillStyle = l.color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(l.name, 110, l.y + 15);
      ctx.strokeStyle = rgba(l.color, 0.25); ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(X0, l.y); ctx.lineTo(X1, l.y); ctx.stroke(); ctx.setLineDash([]);
      for (let j = 5; j >= 1; j--) { const q = value(l, t - j * 0.035); ctx.fillStyle = rgba(l.color, 0.5 * (1 - j / 6)); ctx.beginPath(); ctx.arc(lerp(X0, X1, q), l.y, 24 - j * 2.2, 0, Math.PI * 2); ctx.fill(); }
      const x = lerp(X0, X1, value(l, t));
      glow(ctx, rgba(l.color, 0.5), 16 + 8 * pulse, () => { ctx.fillStyle = l.color; ctx.beginPath(); ctx.arc(x, l.y, 24, 0, Math.PI * 2); ctx.fill(); });
    });
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
