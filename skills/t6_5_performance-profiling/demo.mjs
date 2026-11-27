// t6.5 demo (8 s): the time one frame takes, as a stacked bar: your card, the engine's dither, the engine's PNG encode. Numbers are the
// measured means of the ported tt10 at 1080x1920 on 2026-11-19 (11, 17, 73 ms). Then a cached layer takes 3 ms off the green part.
import { P, E, prog, lerp, clamp, rgba, setFont, roundRect, clipRect, begin, end, hook, windowFrame, windowInner } from '../../engine/index.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 4.0 };
const CLOSER = 4.8, WIN = { x: 72, y: 660, w: 936, h: 580, title: 'profile.mjs' };
const HOOK = { tIn: 0.15, tOut: 1.4, l1: 'Where does', l2: 'the time go?', c1: P.white, c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 1.65, tOut: 4.5, l1: 'Most of it is', l2: 'not your card.', c1: P.white, c2: P.green, b1: 446, b2: 514, px: 56 };
const X0 = 110, PXMS = 6, BAR = { y: 840, h: 92 }, BUDGET_MS = 116;
const SEG = [['Your card', 11, P.green, 2.1, 2.6, 8], ['Dither', 17, P.cyan, 2.6, 3.1], ['PNG', 73, P.orange, 3.1, 3.7]]; // name, ms, colour, t0, t1, (ms after the cached layer)

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.6, 2.0)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi)); windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    const cache = E.inOutCubic(prog(t, 3.95, 4.4)), cardMs = lerp(11, 8, cache);
    // budget line
    const ba = E.outCubic(prog(t, 2.0, 2.4)); ctx.save(); ctx.globalAlpha *= ba; const bx = X0 + BUDGET_MS * PXMS;
    ctx.strokeStyle = rgba(P.red, 0.85); ctx.lineWidth = 3; ctx.setLineDash([12, 9]); ctx.beginPath(); ctx.moveTo(bx, 790); ctx.lineTo(bx, 960); ctx.stroke(); ctx.setLineDash([]);
    setFont(ctx, 'inter', 42, 650); ctx.fillStyle = P.red; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('budget', bx, 778); ctx.restore();
    // bar
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(ctx, X0, BAR.y, 700 + 40, BAR.h, 14).fill();
    let x = X0; const vals = [cardMs, 17, 73];
    SEG.forEach(([name, , col, t0, t1], i) => {
      const k = E.outCubic(prog(t, t0, t1)), w = vals[i] * PXMS * k; if (w <= 0.5) return;
      ctx.fillStyle = col; ctx.save(); clipRect(ctx, X0, BAR.y, 740, BAR.h, 14); ctx.fillRect(x, BAR.y, w, BAR.h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; const g = ((t * 0.9) % 1) * (w + 60) - 30; ctx.fillRect(x + clamp(g, 0, w - 4), BAR.y, 4, BAR.h); ctx.restore(); x += w;
    });
    // legend rows: number counts up as its segment grows
    SEG.forEach(([name, ms, col, t0, t1], i) => {
      const y = 1010 + 62 * i, a = E.outCubic(prog(t, t0, t0 + 0.3)); if (a <= 0) return; const shown = i === 0 ? cardMs : ms, v = Math.round(shown * E.outCubic(prog(t, t0, t1)));
      ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = col; roundRect(ctx, X0, y - 30, 34, 34, 8).fill(); setFont(ctx, 'inter', 46, 650); ctx.fillStyle = P.white; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(name, X0 + 54, y);
      setFont(ctx, 'mono', 46, 700); ctx.fillStyle = i === 0 && cache > 0.5 ? P.green : P.text; ctx.textAlign = 'right'; ctx.fillText(`${i === 0 && cache > 0.99 ? 8 : v} ms`, 600, y); ctx.restore();
    });
    // the cached-layer saving: a tag pops above the green part
    const tg = E.outBack(prog(t, 4.2, 4.6), 2); if (tg > 0) { ctx.save(); ctx.translate(X0 + 30, 812); ctx.scale(Math.max(0.01, tg), Math.max(0.01, tg)); setFont(ctx, 'mono', 44, 700); ctx.fillStyle = P.green; ctx.textAlign = 'left'; ctx.fillText('-3 ms', -8, 0); ctx.restore(); }
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
