// t3.2 demo (8 s): three type pages, then the engine closer.
//   0.25-2.0  per-letter: line 1 drops with a bounce, line 2 pops in (spin), a gentle idle wave keeps it alive
//   2.0-3.5   per-word: words slide in from alternating sides, a marker sweeps the key word and it pops
//   3.4-4.8   counter in fixed digit cells + a decode line + text riding a wave path
// Tag, kicker and closer are drawn by the engine pieces; all text stays inside the safe zones and at or above 42 px.
import { P, E, prog, rgba, setFont, roundRect, begin, end } from '../../engine/index.mjs';
import { splitText, fitBlock, drawUnits, highlightSweep, emphasis, underline, countText, drawCounter, scramble, makePath, wavePath, drawOnPath } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 1.5 };
const CLOSER = 4.9;
const TAGS = [['PER LETTER', 0.35, 1.8], ['PER WORD + HIGHLIGHT', 1.9, 3.3], ['COUNTER + PATH', 3.5, 4.75]];

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });

  // ---- page 1: per letter
  if (t < 1.95) {
    const a = splitText(ctx, 'Letters land', { px: 124, y: 930 }), b = splitText(ctx, 'one by one.', { px: 124, y: 1070 });
    const out = { t0: 1.6, gap: 0.02, dur: 0.28 };
    drawUnits(ctx, a, t, { unit: 'char', style: 'drop', t0: 0.3, gap: 0.04, dur: 0.55, color: P.white, out, idle: { amp: 5 } });
    drawUnits(ctx, b, t, { unit: 'char', style: 'spin', t0: 0.9, gap: 0.04, dur: 0.45, color: P.green, out, idle: { amp: 5, phase: 0.11 } });
  }

  // ---- page 2: per word, highlight sweep, emphasis
  if (t > 1.7 && t < 3.75) {
    const fit = fitBlock(ctx, 'Words slide in,\nthe key word glows.', { maxW: 760, maxLines: 2, maxPx: 96, fam: 'sg', wght: 700 });
    const sp = splitText(ctx, 'Words slide in,\nthe key word glows.', { px: fit.px, y: 960, lineH: 1.3, maxW: 760 });
    const key = 6 /* glows. */, hl = highlightSweep(ctx, sp, t, { words: [key], t0: 2.75, dur: 0.45 });
    drawUnits(ctx, sp, t, { unit: 'word', style: 'slideAlt', t0: 1.85, gap: 0.08, dur: 0.4, color: hl.colorFor, out: { t0: 3.15, gap: 0.05, dur: 0.25 }, idle: { amp: 4, freq: 0.9, phase: 0.12 }, extra: emphasis(sp, { words: [key], t0: 2.75, peak: 1.14, color: null }) });
    underline(ctx, sp, t, { word: 4, t0: 2.3, dur: 0.4, wavy: true, width: 6, color: P.cyan });
  }

  // ---- page 3: counter, decode line, text on a wave
  if (t > 3.6) {
    const final = countText(99, { to: 1284, t0: 3.75 }), live = countText(t, { to: 1284, t0: 3.75, dur: 1.0 });
    const k = E.outCubic(prog(t, 3.7, 4.0));
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, 30 * (1 - k)); drawCounter(ctx, live, final, { x: 540, y: 1010, px: 220, color: P.white }); ctx.restore();
    const dk = prog(t, 3.95, 4.5), dec = scramble('steps counted, steady', dk, t);
    ctx.save(); ctx.globalAlpha *= E.outCubic(prog(t, 3.9, 4.15)); setFont(ctx, 'mono', 46, 600); ctx.fillStyle = dk >= 1 ? P.green : P.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(dec, 540, 1100); ctx.restore();
    const path = wavePath(110, 900, 1290, 26, 1.5, -t * 2.2);
    drawOnPath(ctx, 'text can follow any curve', path, t, { px: 58, s0: 0, t0: 4.1, gap: 0.03, dur: 0.3, color: i => (i > 15 ? P.green : P.white) });
  }

  // ---- tag pill (engine look, same slot as t3.1)
  for (const [label, a, b] of TAGS) {
    const k = E.outCubic(prog(t, a, a + 0.3)) * (1 - prog(t, b - 0.15, b)) * (1 - prog(t, CLOSER - 0.1, CLOSER + 0.3)); if (k <= 0.01) continue;
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, 14 * (1 - k)); setFont(ctx, 'inter', 42, 700, 0.1); ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 70; ctx.fillStyle = rgba(P.green, 0.16); roundRect(ctx, 540 - w / 2, 672, w, 76, 38).fill(); ctx.strokeStyle = P.green; ctx.lineWidth = 2; roundRect(ctx, 540 - w / 2, 672, w, 76, 38).stroke();
    ctx.fillStyle = P.green; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 540, 725); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
