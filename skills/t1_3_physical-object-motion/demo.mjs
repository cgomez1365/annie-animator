// t1.3 demo: a restless spreadsheet (sine jitter, blinking cells) under a pile of notification chips that land with outBack and bob.
// At 1.9 s the sheet scatters with seeded per-cell velocity and spin and the chips are flung out: nothing fades, everything is thrown.
// Then a cog tile drops in with outBack + squash and three chips fall with real bounces.
import { P, begin, end, hook, icon, rgba, roundRect, E, prog, lerp } from '../../engine/index.mjs';
import { drawWindow, enter, windowRect } from '../t1_1_window-frame/module.mjs';
import { makeCells, drawCell, scatterK, pilePose, drawChip, drop, squash, bounce, bob } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 1.2 };
const CLOSER = 5.0, WIN = windowRect({ y: 660, h: 580 }), SCAT = [1.9, 2.3];
const HOOK = { tIn: 0.1, tOut: 1.7, l1: 'Messy sheets', l2: 'pile up.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.5, 1.1] };
const HEAD = { tIn: 2.35, tOut: 4.7, l1: 'Nothing just fades.', l2: 'Things have weight.', c2: P.green, b1: 446, b2: 514, px: 56 };
const CELLS = makeCells({ seed: 20261027, x0: 96, y0: 744, cols: [56, 160, 190, 150, 170, 162], rows: 9 });
const HOT = [[1, 2, P.red], [3, 4, P.orange], [5, 1, P.red], [6, 5, P.orange], [8, 3, P.red]];
const PILE = [{ ic: 'mail', x: 150, y: 700, r: -0.12, ph: 0 }, { ic: 'file-text', x: 900, y: 690, r: 0.1, ph: 1.3 }, { ic: 'calendar', x: 860, y: 1010, r: 0.14, ph: 2.1 }, { ic: 'sheet', x: 205, y: 1150, r: -0.08, ph: 0.7 }, { ic: 'mail', x: 560, y: 1205, r: 0.05, ph: 2.9 }];
const COG = { t0: 2.4, from: -120, to: 880 };
const CHIPS = [{ ic: 'mail', x: 215, col: P.green, t0: 3.1 }, { ic: 'calendar', x: 400, col: P.cyan, t0: 3.3 }, { ic: 'file-text', x: 865, col: P.orange, t0: 3.5 }];
const FLOOR = 1130;

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  drawWindow(ctx, t, { rect: WIN, titles: [{ text: 'tracker_FINAL_v7.xlsx', at: -Infinity, color: P.muted }, { text: 'Field check-in', at: SCAT[1] }], enterAt: 0.05, closerAt: CLOSER }, (c) => {
    // page 2 content: the cog tile drops (outBack), squashes, bobs; three chips bounce on the floor
    const d = drop(t, { ...COG, dur: 0.8, s: 1.5 }), sq = squash(t, d.impact), settle = prog(t, d.impact + 0.4, d.impact + 0.7);
    if (t > COG.t0) {
      const y = d.y + 7 * Math.sin((t - d.impact) * 4.2) * settle, h = Math.max(0, 1 - (COG.to - y) / 420);
      c.fillStyle = `rgba(0,0,0,${0.35 * Math.min(1, h)})`; c.beginPath(); c.ellipse(540, COG.to + 92, 86 * (0.6 + 0.4 * h), 14 * (0.6 + 0.4 * h), 0, 0, 7); c.fill();
      c.save(); c.translate(540, y + 75 * sq); c.rotate(0.06 * Math.sin((t - d.impact) * 3) * settle); c.scale(1 + 0.9 * sq, 1 - sq);
      c.save(); c.shadowColor = rgba(P.green, 0.35); c.shadowBlur = 26; c.fillStyle = P.panel2; roundRect(c, -75, -75, 150, 150, 32).fill(); c.restore();
      c.strokeStyle = P.green; c.lineWidth = 4; roundRect(c, -75, -75, 150, 150, 32).stroke(); icon(c, 'cog', -42, -42, 84, P.green, 2); c.restore();
    }
    CHIPS.forEach((o, i) => {
      if (t < o.t0) return; const b = bounce(t, { t0: o.t0, y0: 640, floor: FLOOR, g: 3200, e: 0.5 }), idle = b.settled ? bob(t, i * 2.1, 3, 3.4) : 0;
      c.fillStyle = `rgba(0,0,0,${0.3 * clampK((b.y - 640) / (FLOOR - 640))})`; c.beginPath(); c.ellipse(o.x, FLOOR + 52, 40, 8, 0, 0, 7); c.fill();
      drawChip(c, { x: o.x - 0, y: b.y + idle + 46 * b.sq, rot: 0, scale: 1, alpha: 1 }, { ic: o.ic, color: o.col, badge: false });
    });
  });
  // page 1: the sheet and the pile, drawn unclipped so pieces fly past the window edges (as tt10)
  const en = enter(t, { t0: 0.05 }), sc = scatterK(t, ...SCAT), wa = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (sc < 1 && en.a > 0) {
    ctx.save(); ctx.globalAlpha *= en.a * wa; ctx.translate(0, en.dy);
    CELLS.forEach(cell => drawCell(ctx, cell, t, sc, { hot: HOT.find(([r, c]) => r === cell.row && c === cell.c)?.[2] }));
    ctx.restore();
  }
  PILE.forEach((o, i) => { const p = pilePose(t, o, { landT: -0.3 + 0.15 * i + 0.5, exit: [SCAT[0] + 0.05, SCAT[1] + 0.05] }); if (p && wa > 0.001) { ctx.save(); ctx.globalAlpha *= wa; drawChip(ctx, p, { ic: o.ic, color: o.ic === 'sheet' ? P.green : P.text }); ctx.restore(); } });
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
const clampK = x => Math.max(0, Math.min(1, x));
