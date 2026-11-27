// t0.3 demo: the render pipeline as a picture. A card box deals frames to two workers; they converge in an mp4 box.
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, glow, E, prog, lerp } from '../../engine/index.mjs';
import { workerOf } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.6 };
const CLOSER = 4.4, WIN = { x: 72, y: 660, w: 936, h: 580, title: 'render.mjs' };
const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'Frames in.', l2: 'Video out.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 2.1, tOut: 4.25, l1: 'Two workers draw', l2: 'frames in parallel.', c2: P.green, b1: 446, b2: 514, px: 56 };
const LANE_Y = [820, 892], LANE_C = [P.green, P.cyan], X0 = 310, X1 = 735, RATE = 9, TRAVEL = 1.1, T0 = 2.6;

function box(ctx, x, y, w, h, label, color, k = 1) {
  ctx.save(); ctx.globalAlpha *= k; ctx.fillStyle = P.panel2; roundRect(ctx, x, y, w, h, 18).fill(); ctx.strokeStyle = color; ctx.lineWidth = 3; roundRect(ctx, x, y, w, h, 18).stroke();
  setFont(ctx, 'inter', 46, 700); ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, x + w / 2, y + h / 2 - 28 + 38); ctx.restore();
}
export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.9, 2.3)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    const kb = E.outBack(prog(t, 2.3, 2.7), 1.8);
    box(ctx, 110, 790, 170, 130, 'card', P.white, kb); box(ctx, 770, 790, 150, 130, 'mp4', P.green, kb);
    LANE_Y.forEach((y, n) => { ctx.strokeStyle = rgba(LANE_C[n], 0.3); ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(X0 - 20, y); ctx.lineTo(X1 + 30, y); ctx.stroke(); ctx.setLineDash([]); });
    // frames dealt round-robin to the two workers: frame n goes to lane workerOf(n, 2); each tile travels 1.1 s, then is swallowed
    const e = t - T0;
    if (e > 0) for (let n = Math.max(0, Math.floor((e - TRAVEL) * RATE)); n <= Math.floor(e * RATE); n++) {
      const age = e - n / RATE, u = age / TRAVEL; if (u < 0 || u > 1) continue;
      const lane = workerOf(n, 2), x = lerp(X0, X1, E.inOutSine(u)), y = LANE_Y[lane] + 6 * Math.sin(u * 8 + n), a = Math.min(1, u * 8) * (1 - prog(u, 0.9, 1));
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(0.12 * Math.sin(n));
      ctx.fillStyle = P.panel; roundRect(ctx, -30, -23, 60, 46, 8).fill(); ctx.strokeStyle = LANE_C[lane]; ctx.lineWidth = 3; roundRect(ctx, -30, -23, 60, 46, 8).stroke();
      ctx.fillStyle = rgba(LANE_C[lane], 0.8); ctx.fillRect(-19, -4, 38, 8); ctx.restore();
    }
    // mp4 box fills as frames arrive
    if (e > 0) { const f = prog(t, T0, 4.3); ctx.fillStyle = rgba(P.green, 0.25 + 0.2 * Math.sin(t * 9)); roundRect(ctx, 782, 930, 126, 10, 5).fill(); ctx.fillStyle = P.green; roundRect(ctx, 782, 930, Math.max(0.1, 126 * f), 10, 5).fill(); }
    // legend and counter
    ctx.save(); ctx.globalAlpha *= E.outCubic(prog(t, 2.6, 3.0)); setFont(ctx, 'inter', 42, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    LANE_C.forEach((c, n) => { const x = 130 + n * 330; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, 992, 13, 0, 7); ctx.fill(); ctx.fillStyle = P.text; ctx.fillText(`worker ${n + 1}`, x + 28, 1006); });
    const fr = Math.min(225, Math.max(0, Math.floor(e * 60))); ctx.fillStyle = P.white; setFont(ctx, 'mono', 46, 600); ctx.textAlign = 'center'; ctx.fillText(`frame ${String(fr).padStart(4, '0')} / 225`, 540, 1086); ctx.restore();
    // film strip scrolling left: the finished frames becoming a video
    ctx.save(); clipRect(ctx, 100, 1120, 840, 90, 12); ctx.fillStyle = '#05070a'; ctx.fillRect(100, 1120, 840, 90);
    const off = (t * 220) % 130;
    for (let i = -1; i < 8; i++) { const x = 110 + i * 130 - off, hue = (i + Math.floor((t * 220) / 130)) % 3; ctx.fillStyle = [rgba(P.green, 0.35), rgba(P.cyan, 0.35), rgba(P.orange, 0.35)][((hue % 3) + 3) % 3]; roundRect(ctx, x, 1135, 104, 60, 8).fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let d = 0; d < 6; d++) ctx.fillRect(x + 6 + d * 17, 1126, 8, 5); }
    ctx.restore();
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
