// t2.2 demo: two balls drop and bounce, two buttons get tapped. Left: rigid. Right: squash and stretch (volume kept).
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, glow, roundRect, lerp, prog, E } from '../../engine/index.mjs';
import { bounceLook, bounce, tap, pop, deform, drawDeformed, impactTimes } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 2.45 };
const CLOSER = 4.9, WIN = { x: 72, y: 640, w: 936, h: 620, title: 'Same drop, two feels' };
const HOOK = { tIn: 0.1, tOut: 1.75, l1: 'Rigid things', l2: 'look dead.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.5, 1.1] };
const HEAD = { tIn: 1.85, tOut: 4.75, l1: 'Squash on impact.', l2: 'Stretch in flight.', c2: P.green, b1: 446, b2: 514, px: 56 };
const FLOOR = 1010, DROP = { t0: 2.0, y0: 800, floor: FLOOR, g: 3200, e: 0.6 }, TAPS = [3.55, 4.15], CX = [306, 774], R = 50;

function ball(ctx, t, color, rot) {
  const g = ctx.createRadialGradient(-16, -R - 16, 4, 0, -R, R + 6); g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, color); g.addColorStop(1, rgba(color, 0.55));
  glow(ctx, rgba(color, 0.4), 22, () => { ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -R, R, 0, Math.PI * 2); ctx.fill(); });
  ctx.save(); ctx.translate(0, -R); ctx.rotate(rot); ctx.strokeStyle = 'rgba(4,20,12,0.55)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, R * 0.6, -0.5, 0.9); ctx.stroke(); ctx.restore(); // a stripe that turns: the ball is never still
}
function chip(ctx, sx, sy) { ctx.save(); ctx.scale(sx, sy); ctx.fillStyle = rgba(P.green, 0.18); roundRect(ctx, -80, -32, 160, 64, 32).fill(); ctx.strokeStyle = P.green; ctx.lineWidth = 3; roundRect(ctx, -80, -32, 160, 64, 32).stroke(); setFont(ctx, 'inter', 42, 700); ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Sent', 0, 15); ctx.restore(); }

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.7, 2.1)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(540, 740); ctx.lineTo(540, 1240); ctx.stroke();
    [['rigid', P.muted, 0], ['alive', P.green, 1]].forEach(([lab, col, side]) => {
      const cx = CX[side], st = bounce(t, DROP), look = side ? bounceLook(t, DROP, 'ball') : { sx: 1, sy: 1, y: st.y };
      setFont(ctx, 'inter', 42, 600); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(lab, cx, 775);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 190, FLOOR + 4); ctx.lineTo(cx + 190, FLOOR + 4); ctx.stroke();
      const h = clamp01((FLOOR - look.y) / 260); ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - 0.6 * h)})`; ctx.beginPath(); ctx.ellipse(cx, FLOOR + 10, 62 * (1 - 0.35 * h) * look.sx ** 0.5, 9, 0, 0, Math.PI * 2); ctx.fill();
      drawDeformed(ctx, { x: cx, y: look.y, sx: look.sx, sy: look.sy }, () => ball(ctx, t, col, t * 5));
      // button + chip
      const tp = TAPS.map(t0 => tap(t, { t0, amount: 0.10 })).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0), d = side ? deform(tp, 'button') : { sx: 1, sy: 1 };
      ctx.save(); ctx.translate(cx, 1170); ctx.scale(d.sx, d.sy);
      glow(ctx, rgba(col, 0.3 + 0.2 * Math.sin(t * 3)), 20, () => { ctx.fillStyle = side ? P.green : P.muted; roundRect(ctx, -130, -42, 260, 84, 20).fill(); });
      setFont(ctx, 'inter', 44, 700); ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.fillText('Tap', 0, 16); ctx.restore();
      const ps = side ? pop(t, { t0: TAPS[0] + 0.05 }) : (() => { const k = E.outCubic(prog(t, TAPS[0] + 0.05, TAPS[0] + 0.3)); return { sx: k, sy: k }; })();
      if (ps.sx > 0.01) { ctx.save(); ctx.translate(cx, 1082); chip(ctx, ps.sx, ps.sy); ctx.restore(); }
    });
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
const clamp01 = x => Math.max(0, Math.min(1, x));
