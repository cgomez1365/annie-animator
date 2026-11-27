// t2.4 demo: six tiles, six reveals (wipe, iris, split, diagonal, scan, ink), then they leave. Live content under every mask.
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, icon, lerp, prog, E } from '../../engine/index.mjs';
import { revealRect, revealIris, revealSplit, revealDiagonal, revealScan, revealInk, edgeLine, maskK, textWipe, RECIPES } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 3.2 };
const CLOSER = 4.9, WIN = { x: 72, y: 640, w: 936, h: 620, title: 'Six ways in' };
const HOOK = { tIn: 0.1, tOut: 1.75, l1: 'Do not fade.', l2: 'Reveal.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.5, 1.1] };
const HEAD = { tIn: 1.85, tOut: 4.75, l1: 'A mask gives motion', l2: 'a direction.', c2: P.green, b1: 446, b2: 514, px: 56 };
const TILES = [
  { name: 'wipe', x: 108, y: 736 }, { name: 'iris', x: 552, y: 736 }, { name: 'split', x: 108, y: 908 },
  { name: 'diagonal', x: 552, y: 908 }, { name: 'scan', x: 108, y: 1080 }, { name: 'ink', x: 552, y: 1080 },
], TW = 420, TH = 104, IN0 = 2.0, OUT0 = 4.15;

// the content every mask uncovers: a live panel (bars breathe, a dot runs along the bottom)
function content(ctx, x, y, t, i) {
  const g = ctx.createLinearGradient(x, y, x + TW, y + TH); g.addColorStop(0, '#12301f'); g.addColorStop(1, '#0f2a3a');
  ctx.fillStyle = g; roundRect(ctx, x, y, TW, TH, 16).fill(); ctx.strokeStyle = rgba(P.green, 0.6); ctx.lineWidth = 3; roundRect(ctx, x + 1.5, y + 1.5, TW - 3, TH - 3, 15).stroke();
  icon(ctx, 'activity', x + 22, y + 16, 40, P.green, 2.6);
  setFont(ctx, 'inter', 44, 700); ctx.fillStyle = P.white; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Live', x + 78, y + 52);
  for (let b = 0; b < 7; b++) { const hh = 22 + 26 * (0.5 + 0.5 * Math.sin(t * 3.2 + b * 0.9 + i)); ctx.fillStyle = rgba(P.cyan, 0.75); roundRect(ctx, x + 236 + b * 24, y + 80 - hh, 14, hh, 5).fill(); }
  const run = (t * 0.8 + i * 0.2) % 1; ctx.fillStyle = P.green; ctx.beginPath(); ctx.arc(x + 24 + run * (TW - 48), y + TH - 12, 5, 0, Math.PI * 2); ctx.fill();
}
const box = tl => [tl.x, tl.y, TW, TH];

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.7, 2.1)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    TILES.forEach((tl, i) => {
      // placeholder outline: the empty slot
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); roundRect(ctx, tl.x, tl.y, TW, TH, 16).stroke(); ctx.setLineDash([]);
      const nm = tl.name, tIn = IN0 + i * 0.2, tOut = OUT0 + i * 0.07, dur = nm === 'ink' ? 0.9 : nm === 'scan' ? 0.8 : 0.6;
      const kIn = maskK(t, tIn, nm === 'scan' ? 'scan' : nm === 'ink' ? 'ink' : nm === 'diagonal' ? 'diagonal' : nm === 'iris' ? 'iris' : nm === 'split' ? 'split' : 'wipe');
      const kOut = maskK(t, tOut, 'exit'), draw = c => content(c, tl.x, tl.y, t, i), out = t >= tOut;
      let edge = null;
      if (nm === 'wipe') edge = revealRect(ctx, out ? kOut : kIn, { box: box(tl), dir: 'right', out }, draw);
      if (nm === 'iris') revealIris(ctx, out ? 1 - kOut : kIn, { box: box(tl) }, draw);
      if (nm === 'split') revealSplit(ctx, out ? 1 - kOut : kIn, { box: box(tl), axis: 'x', mode: 'center' }, draw);
      if (nm === 'diagonal') edge = revealDiagonal(ctx, out ? kOut : kIn, { box: box(tl), angle: Math.PI / 5, out }, draw);
      if (nm === 'scan') revealScan(ctx, out ? kOut : kIn, { box: box(tl), lines: 14, mode: 'sweep', out }, draw);
      if (nm === 'ink') revealInk(ctx, out ? 1 - kOut : kIn, { box: box(tl), seed: 7, dir: 'right' }, draw);
      edgeLine(ctx, edge, { color: P.green, width: 5 });
      setFont(ctx, 'inter', 42, 600); ctx.fillStyle = P.muted; ctx.textAlign = 'left'; ctx.fillText(nm, tl.x + 4, tl.y + TH + 40);
    });
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
