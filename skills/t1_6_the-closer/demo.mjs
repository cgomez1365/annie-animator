// t1.6 demo (AEON variant, so the 18+ line shows): the whole hand-over. The hook rises and lifts out (tOut 1.5); the window comes in with a
// last page and its header; at closerAt 4.5 the window, header and kicker leave together (0.4 s) while the closer's ground, gear mark,
// wordmark, slogan (both lines, line 2 green), the Follow button (glow, one press at +1.9 s), the footer and the 18+ line come up and stay 3.5 s.
import { P, begin, hook, icon, setFont, rgba, roundRect, E, prog } from '../../engine/index.mjs';
import { drawWindow, windowRect } from '../t1_1_window-frame/module.mjs';
import { pressButton } from '../t1_5_ui-mockup-kit/module.mjs';
import { drawCloser, choreography, fadeOut, validateCloser } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 6.4, brand: 'aeon' };
const CLOSER = 4.5, WIN = windowRect({ y: 660, h: 580 }), CH = choreography(CLOSER, { hookTOut: 1.5 });
const HOOK = { tIn: 0.1, tOut: 1.5, l1: 'Every card', l2: 'ends the same.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.5, 1.1] };
const HEAD = { tIn: 1.75, tOut: 4.1, l1: 'Then it all leaves', l2: 'for the closer.', c2: P.green, b1: 446, b2: 514, px: 56 };
const ROWS = [['Window', 'app-window'], ['Header', 'heading'], ['Kicker', 'type']];
export const _issues = validateCloser({ closerAt: CLOSER, duration: 8, brand: 'aeon', metaBrand: META.brand, hookTOut: HOOK.tOut });

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  drawWindow(ctx, t, { rect: WIN, title: 'Last page', enterAt: 1.35, closerAt: CLOSER }, c => {
    ROWS.forEach(([name, ic], i) => { // each row is a thing that will leave; a highlight steps down them
      const r = E.outCubic(prog(t, 1.7 + 0.14 * i, 2.1 + 0.14 * i)), y = 780 + i * 100, hl = Math.max(0, Math.sin(2 * Math.PI * ((t - 1.7) / 1.8 - i / 3))) ** 4;
      c.save(); c.globalAlpha *= r; c.translate(40 * (1 - r), 0); c.fillStyle = rgba(P.green, 0.04 + 0.10 * hl); roundRect(c, 110, y, 800, 78, 16).fill(); c.strokeStyle = rgba(P.green, 0.3 + 0.6 * hl); c.lineWidth = 2 + 1.5 * hl; roundRect(c, 110, y, 800, 78, 16).stroke();
      icon(c, ic, 136, y + 19, 40, P.green, 2); setFont(c, 'inter', 46, 650); c.fillStyle = P.white; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(name + ' leaves', 200, y + 54); c.restore();
    });
    pressButton(c, t, { x: 540, y: 1130, label: 'Hand over', doneLabel: 'Handed over', t0: 2.3, pressT: 3.4 });
  });
  drawCloser(ctx, t, CLOSER, { brand: 'aeon' });
  return ctx.canvas;
}
