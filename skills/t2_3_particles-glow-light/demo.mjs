// t2.3 demo: an orb flies into a card, twice. Left: flat (plain shapes). Right: lit (trail, glow, sparks, ring, glint, sweep, motes, bloom).
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, icon, lerp, prog, clamp, E } from '../../engine/index.mjs';
import { burst, motes, trailPoints, drawParticles, drawTrail, glowDot, bloomPass, sweep, glint, ring, flash } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 3.05 };
const CLOSER = 4.9, WIN = { x: 72, y: 640, w: 936, h: 620, title: 'Same hit, two looks' };
const HOOK = { tIn: 0.1, tOut: 1.75, l1: 'Light and sparks', l2: 'sell the hit.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.5, 1.1] };
const HEAD = { tIn: 1.85, tOut: 4.75, l1: 'Trail. Glow. Sparks.', l2: 'Then bloom.', c2: P.green, b1: 446, b2: 514, px: 56 };
const T0 = 1.95, CYCLE = 1.45, FLY = 1.0, CX = [306, 774], CARD_Y = 1040, CARD = { w: 330, h: 160 };

// the orb's position for one column: a curve from the lower left into the top of the card; waits at the start, rests at the end of each cycle
const orbPos = cx => t => {
  const n = Math.max(0, Math.floor((t - T0) / CYCLE)), ph = clamp((t - T0 - n * CYCLE) / FLY), e = E.inQuad(ph);
  const S = [cx - 200, 1215], C = [cx - 210, 900], Tg = [cx, CARD_Y - CARD.h / 2 - 8];
  return { x: (1 - e) ** 2 * S[0] + 2 * (1 - e) * e * C[0] + e * e * Tg[0], y: (1 - e) ** 2 * S[1] + 2 * (1 - e) * e * C[1] + e * e * Tg[1], ph, n };
};
const posL = orbPos(CX[0]), posR = orbPos(CX[1]);
const impacts = [0, 1].map(n => T0 + n * CYCLE + FLY);
const lastHit = t => impacts.filter(x => x <= t).pop();

function cardBody(ctx, cx, hit, lit, t) {
  const f = hit === undefined ? 0 : flash(t, hit, 0.5);
  ctx.save(); ctx.translate(cx, CARD_Y + (lit ? -3 * f : 0));
  ctx.fillStyle = P.panel2; roundRect(ctx, -CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h, 22).fill();
  ctx.strokeStyle = lit ? rgba(P.green, 0.35 + 0.65 * f) : rgba(P.muted, 0.5); ctx.lineWidth = 3; roundRect(ctx, -CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h, 22).stroke();
  icon(ctx, 'circle-check', -CARD.w / 2 + 28, -22, 44, lit ? P.green : P.muted, 2.6);
  ctx.restore();
}
function cardText(ctx, cx, lit) { setFont(ctx, 'inter', 44, 700); ctx.fillStyle = lit ? P.white : P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Ready', cx - CARD.w / 2 + 88, CARD_Y + 15); }

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.7, 2.1)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(540, 740); ctx.lineTo(540, 1240); ctx.stroke();
    const hit = lastHit(t);
    // ---- left: flat
    cardBody(ctx, CX[0], undefined, false, t);
    { const p = posL(t); if (p.ph < 1) { ctx.fillStyle = P.muted; ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.fill(); } }
    // ---- right: lit
    drawParticles(ctx, motes(t, { box: [560, 760, 990, 1230], n: 26, seed: 8, period: 6, color: '#9cc4ff' }), { mode: 'dot', glow: 4 });
    glowDot(ctx, CX[1], CARD_Y, 230, P.green, 0.16 + 0.05 * Math.sin(t * 3) + 0.5 * (hit ? flash(t, hit, 0.5) : 0));
    cardBody(ctx, CX[1], hit, true, t);
    const pr = posR(t);
    if (pr.ph < 1 && t >= T0) {
      const fade = prog(pr.ph, 0, 0.12) * (1 - prog(pr.ph, 0.96, 1));
      ctx.save(); ctx.globalAlpha *= fade; drawTrail(ctx, trailPoints(t, posR, { n: 16, dt: 0.02 }), { color: P.green, width: 30, alpha: 0.9 });
      glowDot(ctx, pr.x, pr.y, 60, P.green, 1); ctx.fillStyle = '#eafff6'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 17, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    impacts.forEach((h, n) => {
      const x = CX[1], y = CARD_Y - CARD.h / 2 - 8;
      drawParticles(ctx, burst(t, { t0: h, x, y, n: 28, seed: 40 + n, speed: [300, 900], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 1500, drag: 1.7, life: [0.35, 0.75], size: [3.5, 7], colors: [P.green, '#ffffff', P.cyan] }), { mode: 'spark' });
      ring(ctx, x, y, 20, 150, prog(t, h, h + 0.5), { color: P.green, width: 7 });
      glint(ctx, x, y, 96, prog(t, h, h + 0.5));
      sweep(ctx, t, { t0: h + 0.05, dur: 0.6, box: [CX[1] - CARD.w / 2, CARD_Y - CARD.h / 2, CARD.w, CARD.h], r: 22, strength: 0.55 });
    });
    bloomPass(ctx, [540, 714, 466, 540], { strength: 0.55, scale: 8 });
    cardText(ctx, CX[0], false); cardText(ctx, CX[1], true);
    for (const [lab, col, cx] of [['flat', P.muted, CX[0]], ['lit', P.green, CX[1]]]) { setFont(ctx, 'inter', 42, 600); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(lab, cx, 775); }
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
