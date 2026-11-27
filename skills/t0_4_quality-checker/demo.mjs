// t0.4 demo: a mini phone with the safe zones drawn; a text bar wanders into the red zone and gets flagged, then returns and passes.
// Beside it, the checklist the checker runs flips from pending to a verdict one row at a time.
import { P, SAFE, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, icon, glow, E, prog, lerp, loop } from '../../engine/index.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.6 };
const CLOSER = 4.4, WIN = { x: 72, y: 660, w: 936, h: 580, title: 'qc.mjs' };
const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'Safe to post?', l2: 'Checked by code.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 2.1, tOut: 4.25, l1: 'Frozen, unsafe or', l2: 'unreadable fails.', c2: P.green, b1: 446, b2: 514, px: 56 };
const PH = { x: 112, y: 752, w: 270, h: 480 }, S = 0.25; // the phone is the 1080x1920 frame at one quarter size
const ROWS = ['frozen frames', 'safe zones', 'text size', 'contrast', 'claims'], RY = [800, 870, 940, 1010, 1080];
const PERIOD = 3.2, T0 = 2.7;
// the wandering text bar: y in phone pixels, 22 = inside the red top zone (y < 62), 150 = safe
const barY = t => lerp(22, 150, E.inOutCubic(Math.abs(2 * loop(t - T0, PERIOD) - 1)));

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.9, 2.3)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // phone with zones
    const pk = E.outBack(prog(t, 2.3, 2.8), 1.6);
    ctx.save(); ctx.translate(PH.x + PH.w / 2, PH.y + PH.h / 2); ctx.scale(pk, pk); ctx.translate(-PH.w / 2, -PH.h / 2);
    ctx.fillStyle = '#05070a'; roundRect(ctx, 0, 0, PH.w, PH.h, 14).fill(); ctx.save(); clipRect(ctx, 0, 0, PH.w, PH.h, 14);
    ctx.fillStyle = 'rgba(239,68,68,0.35)'; ctx.fillRect(0, 0, PH.w, SAFE.top * S); ctx.fillRect(0, SAFE.bottom * S, PH.w, PH.h - SAFE.bottom * S);
    ctx.fillStyle = 'rgba(245,158,11,0.28)'; ctx.fillRect(SAFE.railX * S, SAFE.railY[0] * S, PH.w - SAFE.railX * S, (SAFE.railY[1] - SAFE.railY[0]) * S);
    const by = barY(t), bad = by - 7 < SAFE.top * S; // the bar's top edge is inside the red zone
    // text bars: two fixed (safe) and one wandering
    ctx.fillStyle = 'rgba(248,250,252,0.85)'; roundRect(ctx, 30, 170, 150, 14, 7).fill(); roundRect(ctx, 30, 196, 100, 14, 7).fill();
    ctx.fillStyle = bad ? P.red : P.green; roundRect(ctx, 30, by - 7, 170, 14, 7).fill();
    // scan line sweeping down, every 1.6 s
    const sy = lerp(0, PH.h, loop(t, 1.6)); ctx.fillStyle = rgba(P.cyan, 0.7); ctx.fillRect(0, sy, PH.w, 2); const g = ctx.createLinearGradient(0, sy - 40, 0, sy); g.addColorStop(0, 'rgba(34,211,238,0)'); g.addColorStop(1, 'rgba(34,211,238,0.25)'); ctx.fillStyle = g; ctx.fillRect(0, sy - 40, PH.w, 40);
    ctx.restore(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; roundRect(ctx, 1, 1, PH.w - 2, PH.h - 2, 14).stroke(); ctx.restore();
    // checklist
    ROWS.forEach((r, n) => {
      const tr = 2.6 + 0.22 * n, k = E.outCubic(prog(t, tr - 0.2, tr)); if (k <= 0) return;
      const x0 = 450, y = RY[n]; ctx.save(); ctx.globalAlpha *= k; ctx.translate(30 * (1 - k), 0);
      setFont(ctx, 'inter', 46, 600); ctx.fillStyle = P.white; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(r, x0 + 64, y + 16);
      const done = t >= tr + 0.35, live = n === 1 && done ? !bad : true, s = done ? E.outElastic(prog(t, tr + 0.35, tr + 0.95)) : 1;
      ctx.save(); ctx.translate(x0 + 22, y); ctx.scale(s, s);
      if (!done) { ctx.strokeStyle = rgba(P.muted, 0.5 + 0.4 * Math.sin(t * 8 + n)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 18, t * 6, t * 6 + 4.2); ctx.stroke(); }
      else icon(ctx, live ? 'circle-check' : 'circle-x', -24, -24, 48, live ? P.green : P.red, 2.4);
      ctx.restore(); ctx.restore();
    });
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
