// t2.1 demo: the same card makes the same three hops twice. Top = flat (one ease). Bottom = alive (anticipation, overshoot, follow-through).
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, glow, roundRect, icon, lerp, prog, E } from '../../engine/index.mjs';
import { kick, kickTimes, overlap, lean, RECIPES } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 3.0 };
const CLOSER = 4.9, WIN = { x: 72, y: 640, w: 936, h: 620, title: 'Same hops, two feels' };
const HOOK = { tIn: 0.1, tOut: 1.75, l1: 'Flat motion', l2: 'feels cheap.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.5, 1.1] };
const HEAD = { tIn: 1.85, tOut: 4.75, l1: 'Pull back. Overshoot.', l2: 'Let it follow through.', c2: P.green, b1: 446, b2: 514, px: 56 };
const XS = [330, 750, 330, 750], HOPS = [2.0, 2.95, 3.9], FLAT_DUR = 0.55, R = RECIPES.card;

// position of each card at time t: three hops
const flatX = t => { let x = XS[0]; HOPS.forEach((h, i) => { x = t >= h ? lerp(XS[i], XS[i + 1], E.outCubic(prog(t, h, h + FLAT_DUR))) : x; }); return x; };
const aliveX = t => { let x = XS[0]; HOPS.forEach((h, i) => { if (t >= h) x = kick(t, { t0: h, from: XS[i], to: XS[i + 1], recipe: 'card' }); }); return x; };

function card(ctx, t, x, y, { rot = 0, kids = [0, 0, 0], color, shadow = true }) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 92, 96, 11, 0, 0, Math.PI * 2); ctx.fill(); }
  glow(ctx, rgba(color, 0.35), 24, () => { ctx.fillStyle = P.panel2; roundRect(ctx, -105, -75, 210, 150, 20).fill(); });
  ctx.strokeStyle = rgba(color, 0.7); ctx.lineWidth = 3; roundRect(ctx, -105, -75, 210, 150, 20).stroke();
  ctx.save(); ctx.translate(kids[0], 0); ctx.fillStyle = rgba(color, 0.18); ctx.beginPath(); ctx.arc(-58, -22, 28, 0, Math.PI * 2); ctx.fill(); icon(ctx, 'mail', -72, -36, 28, color, 2.4); ctx.restore();
  ctx.save(); ctx.translate(kids[1], 0); setFont(ctx, 'inter', 42, 700); ctx.fillStyle = P.white; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Sent', -16, -8); ctx.restore();
  ctx.save(); ctx.translate(kids[2], 0); ctx.fillStyle = rgba(color, 0.5); roundRect(ctx, -76, 28, 150 * (0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3))), 12, 6).fill(); ctx.fillStyle = 'rgba(255,255,255,0.14)'; roundRect(ctx, -76, 50, 110, 12, 6).fill(); ctx.restore();
  ctx.restore();
}

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.7, 2.1)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    for (const [lab, col, y] of [['flat: one ease', P.muted, 775], ['alive', P.green, 1000]]) { setFont(ctx, 'inter', 42, 600); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(lab, 110, y); }
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]); for (const x of [330, 750]) for (const [a, b] of [[810, 965], [1030, 1205]]) { ctx.beginPath(); ctx.moveTo(x, a); ctx.lineTo(x, b); ctx.stroke(); } ctx.setLineDash([]);
    const bob = Math.sin(t * 4.1) * 3;
    card(ctx, t, flatX(t), 880 + bob * 0.5, { color: P.muted, kids: [0, 0, 0] });
    const ax = aliveX(t);
    card(ctx, t, ax, 1105 + bob, { color: P.green, rot: lean(aliveX, t), kids: [overlap(t, aliveX, 0), overlap(t, aliveX, 1), overlap(t, aliveX, 2)] });
    setFont(ctx, 'inter', 42, 600); ctx.fillStyle = P.muted; ctx.textAlign = 'center'; ctx.fillText(`${R.antic} f back  ·  ${Math.round(R.overshoot * 100)}% over  ·  ${R.settle} f settle`, 540, 1245);
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
