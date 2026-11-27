// t1.1 demo: one window, three things to see: it rises in (0.4 s outCubic), its title crossfades, it resizes with a settle,
// and the content (radar rings, a bobbing cog, chips sliding through) is clipped to the inner rect the whole time.
import { P, begin, end, hook, icon, setFont, rgba, roundRect, E, prog, lerp, loop } from '../../engine/index.mjs';
import { drawWindow, lerpRect, windowRect } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.2 };
const CLOSER = 4.6;
const HEAD1 = { tIn: 0.2, tOut: 2.5, l1: 'One window', l2: 'sets the stage.', c2: P.green, b1: 446, b2: 514, px: 56 };
const HEAD2 = { tIn: 2.9, tOut: 4.35, l1: 'Content stays', l2: 'inside the glass.', c2: P.green, b1: 446, b2: 514, px: 56 };
const BIG = windowRect({ y: 590, h: 640 }), SMALL = windowRect({ y: 590, h: 520 });
const TITLES = [{ text: 'Inbox', at: -Infinity }, { text: 'Live report', at: 2.9 }];

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HEAD1, t); hook(ctx, HEAD2, t);
  const rk = E.outBack(prog(t, 3.1, 3.7), 1.5), rect = lerpRect(BIG, SMALL, rk);
  drawWindow(ctx, t, { rect, titles: TITLES, enterAt: 0.2, closerAt: CLOSER }, (c, inner, R) => {
    const cx = R.cx, cy = inner[1] + inner[3] / 2;
    // radar rings: four rings expand on a 2.4 s loop and run far past the edges (the clip cuts them)
    for (let n = 0; n < 4; n++) { const u = loop(t, 2.4, n / 4), rad = 60 + 760 * E.outQuad(u); c.strokeStyle = rgba(P.green, 0.5 * (1 - u)); c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.stroke(); }
    // the cog bobs and turns
    const bob = 8 * Math.sin(t * 3.2); c.save(); c.translate(cx, cy + bob); c.rotate(t * 0.9);
    c.fillStyle = P.panel2; c.strokeStyle = P.green; c.lineWidth = 4; roundRect(c, -75, -75, 150, 150, 34).fill(); c.stroke(); icon(c, 'cog', -42, -42, 84, P.green, 2); c.restore();
    // a chip with text slides through the top row (above y 800, so its text never meets the action rail) and is cut by the edges;
    // a wide bar sweeps the lower area the other way and is cut by both edges and the rounded corners
    { const u = loop(t, 3.4), x = lerp(inner[0] - 360, inner[0] + inner[2] + 40, u), y = inner[1] + 40; c.fillStyle = rgba(P.cyan, 0.18); roundRect(c, x, y, 340, 76, 20).fill(); c.strokeStyle = P.cyan; c.lineWidth = 2.5; roundRect(c, x, y, 340, 76, 20).stroke();
      setFont(c, 'inter', 42, 650); c.fillStyle = P.white; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText('Inbox', x + 170, y + 52); }
    { const u = loop(t, 2.8, 0.4), x = lerp(inner[0] + inner[2] + 40, inner[0] - 700, u), y = inner[1] + inner[3] - 110; c.fillStyle = rgba(P.orange, 0.22); roundRect(c, x, y, 660, 60, 16).fill(); c.strokeStyle = P.orange; c.lineWidth = 2.5; roundRect(c, x, y, 660, 60, 16).stroke(); }
  });
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
