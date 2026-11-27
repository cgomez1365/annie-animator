// t1.4 demo: a board where the layout is built by 1.2 s and then STANDS STILL for four seconds, yet never freezes:
// a sonar dot, a typing bubble, a marker running between nodes on marching dashes, a highlight stepping down a list,
// a blinking cursor and meters that pulse. This is the "nothing freezes" proof.
import { P, begin, end, hook, icon, setFont, rgba, roundRect, E, prog, lerp } from '../../engine/index.mjs';
import { drawWindow, windowRect } from '../t1_1_window-frame/module.mjs';
import { drawNodes, drawMarker, sweep, barField, drawBars, drawCursor, drawBouncingDots, drawRings, breathe } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 3.0 };
const CLOSER = 5.0, WIN = windowRect({ y: 660, h: 580 });
const HOOK = { tIn: 0.1, tOut: 1.7, l1: 'Nothing freezes.', l2: 'Ever.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.5, 1.1] };
const HEAD = { tIn: 1.8, tOut: 4.7, l1: 'Loops keep it alive:', l2: 'markers, sweeps, pulses.', c2: P.green, b1: 446, b2: 514, px: 56 };
const NODES = [{ x: 200, y: 880 }, { x: 540, y: 880 }, { x: 880, y: 880 }];
const ROWS = [['Queue', 'inbox'], ['Review', 'eye'], ['Add a step', 'plus']], BARS = barField(20261119, 5);
const IN = (t, t0, d = 0.4) => E.outCubic(prog(t, t0, t0 + d));
const text = (c, s, x, y, px, col, w = 650) => { setFont(c, 'inter', px, w); c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(s, x, y); };

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  drawWindow(ctx, t, { rect: WIN, title: 'Live board', enterAt: 0.1, closerAt: CLOSER }, c => {
    // status row: a sonar dot and a typing bubble
    let k = IN(t, 0.6); c.save(); c.globalAlpha *= k;
    drawRings(c, t, 140, 786, { r0: 8, r1: 34 }); c.fillStyle = P.green; c.beginPath(); c.arc(140, 786, 9, 0, 7); c.fill(); text(c, 'Live', 190, 802, 46, P.white);
    c.fillStyle = P.panel2; c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 2; roundRect(c, 690, 748, 190, 76, 38).fill(); c.stroke(); drawBouncingDots(c, t, 785, 788, { amp: 11 }); c.restore();
    // track: marching dashes, ringed nodes, a marker with a trail
    k = IN(t, 0.8); c.save(); c.globalAlpha *= k; drawNodes(c, t, NODES, { ringsFrom: { t0: 1.2, legDur: 0.8 } }); c.restore(); drawMarker(c, t, NODES, { t0: 1.2, legDur: 0.8 });
    // list: a highlight steps down it; the last row has a blinking cursor
    const hl = sweep(t, { t0: 1.2, n: 3, period: 2.4 });
    ROWS.forEach(([name], i) => {
      const r = IN(t, 0.9 + 0.14 * i), y = 950 + i * 82; c.save(); c.globalAlpha *= r; c.translate(40 * (1 - r), 0);
      c.fillStyle = rgba(P.green, 0.04 + 0.10 * hl[i]); roundRect(c, 110, y, 470, 68, 16).fill(); c.strokeStyle = rgba(P.green, 0.3 + 0.6 * hl[i]); c.lineWidth = 2 + 1.5 * hl[i]; roundRect(c, 110, y, 470, 68, 16).stroke();
      text(c, name, 140, y + 49, 44, P.white);
      if (i === 2) { setFont(c, 'inter', 44, 650); drawCursor(c, t, 140 + c.measureText(name).width + 8, y + 12, 44); }
      c.restore();
    });
    // meters: five bars that never line up
    k = IN(t, 1.0); drawBars(c, BARS(t), { x: 650, y: 940, w: 250, h: 230, gap: 14, color: [P.green, P.cyan, P.orange, P.green, P.cyan], alpha: k });
  });
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
