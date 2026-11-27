// t6.2 demo (7.5 s): twelve frames, each stamped with a content hash. An edit changes three of them; two workers redraw only those
// three; nine frames are reused from the cache. "Render only what changed."
import { P, E, prog, lerp, clamp, rgba, rng, setFont, roundRect, clipRect, begin, end, hook, windowFrame, windowInner, icon } from '../../engine/index.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 4.1 };
const CLOSER = 4.8, WIN = { x: 72, y: 660, w: 936, h: 580, title: 'batch.mjs' };
const HOOK = { tIn: 0.15, tOut: 1.4, l1: 'Render only', l2: 'what changed.', c1: P.white, c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 1.65, tOut: 4.5, l1: 'Same hash?', l2: 'Skip the frame.', c1: P.white, c2: P.green, b1: 446, b2: 514, px: 56 };
const COLS = 4, TW = 196, TH = 100, GAP = 16, X0 = 124, Y0 = 762, CHANGED = [9, 10, 11];
const r = rng(20261119), hex = () => r.int(0x1000, 0xffff).toString(16);
const OLD = Array.from({ length: 12 }, hex), NEW = Object.fromEntries(CHANGED.map(i => [i, hex()]));
const pos = i => ({ x: X0 + (i % COLS) * (TW + GAP), y: Y0 + Math.floor(i / COLS) * (TH + GAP) }), centre = i => { const p = pos(i); return [p.x + TW / 2, p.y + TH / 2]; };
// events (seconds)
const TILES_IN = 1.95, PEN = [2.6, 3.0], REDRAW = { 9: [3.05, 3.45], 10: [3.05, 3.45], 11: [3.6, 3.95] }, W1 = [[2.85, 3.05, 9], [3.45, 3.6, 11]], W2 = [[2.85, 3.05, 10]];
const flipAt = i => lerp(PEN[0], PEN[1], (centre(i)[0] - 300) / 600);

function tile(ctx, t, i) {
  const k = E.outBack(prog(t, TILES_IN + 0.045 * i, TILES_IN + 0.045 * i + 0.4), 1.6); if (k <= 0) return;
  const { x, y } = pos(i), ch = CHANGED.includes(i);
  const fk = ch ? clamp((t - (flipAt(i) - 0.09)) / 0.18) : 0, sx = ch ? Math.abs(Math.cos(Math.PI * fk)) : 1, flipped = fk >= 0.5;
  const rd = ch ? REDRAW[i] : null, rp = rd ? prog(t, rd[0], rd[1]) : 0, done = rd && t >= rd[1];
  const col = ch && flipped && !done ? P.orange : P.green, lab = ch && flipped && done ? NEW[i] : ch && flipped ? '?' + OLD[i].slice(1) : OLD[i];
  ctx.save(); ctx.globalAlpha *= clamp(k * 1.6); ctx.translate(x + TW / 2, y + TH / 2); ctx.scale(Math.max(0.01, k) * Math.max(0.02, sx), Math.max(0.01, k)); ctx.translate(-TW / 2, -TH / 2);
  const pop = done ? Math.max(0, 1 - (t - rd[1]) / 0.35) : 0; // a green flash as a redrawn frame lands
  ctx.fillStyle = P.panel2; roundRect(ctx, 0, 0, TW, TH, 16).fill();
  ctx.fillStyle = rgba(col, 0.12 + 0.3 * pop); roundRect(ctx, 0, 0, TW, TH, 16).fill();
  if (rd && flipped && !done && rp > 0) { ctx.save(); clipRect(ctx, 0, 0, TW, TH, 16); ctx.fillStyle = rgba(P.cyan, 0.45); ctx.fillRect(0, TH - 12, TW * E.inOutSine(rp), 12); ctx.restore(); }
  ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 3; roundRect(ctx, 1.5, 1.5, TW - 3, TH - 3, 15).stroke();
  setFont(ctx, 'mono', 44, 700); ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(lab, TW / 2, TH / 2 + 15);
  ctx.restore();
}
function worker(ctx, t, legs, col, home) {
  const s0 = legs[0][0] - 0.3; if (t < s0) return; let cur = home;
  for (const [t0, t1, tl] of legs) { const c = centre(tl); if (t >= t1) { cur = c; continue; } if (t >= t0) { const k = E.inOutCubic(prog(t, t0, t1)); cur = [lerp(cur[0], c[0], k), lerp(cur[1], c[1], k)]; } break; }
  const a = E.outCubic(prog(t, s0, s0 + 0.25)), x = cur[0] + 4 * Math.sin(t * 6), y = (cur === home ? cur[1] : cur[1] + 36) + 4 * Math.cos(t * 5);
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.fillStyle = P.bg; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill(); ctx.stroke();
  ctx.rotate(t * 3.2); icon(ctx, 'cog', -19, -19, 38, col, 2.4); ctx.restore();
}
export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.6, 2.0)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi)); windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    for (let i = 0; i < 12; i++) tile(ctx, t, i);
    // a pale scan bar keeps sweeping over the grid: the hold never freezes
    if (t > 2.4) { const u = ((t - 2.4) / 1.3) % 1, sxp = X0 - 60 + (4 * (TW + GAP) + 120) * u, g = ctx.createLinearGradient(sxp - 70, 0, sxp + 70, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(sxp - 70, Y0, 140, 3 * TH + 2 * GAP); }
    // the edit: a pencil crosses the last row
    const pk = prog(t, PEN[0], PEN[1]), pa = E.outCubic(prog(t, PEN[0] - 0.15, PEN[0])) * (1 - prog(t, PEN[1], PEN[1] + 0.2));
    if (pa > 0) { const px = lerp(300, 900, E.inOutCubic(pk)); ctx.save(); ctx.globalAlpha *= pa; ctx.translate(px, 1012 + 6 * Math.sin(pk * 18)); ctx.rotate(-0.25); icon(ctx, 'pencil', -26, -26, 52, P.orange, 2.6); ctx.restore(); }
    worker(ctx, t, W1, P.cyan, [230, 1132]); worker(ctx, t, W2, P.green, [330, 1132]);
    // the counter line
    const lines = [[2.4, 2.8, '12 frames cached', P.green], [2.8, 3.95, '3 changed', P.orange], [3.95, 9, '9 reused · 3 redrawn', P.green]];
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; setFont(ctx, 'inter', 44, 650);
    lines.forEach(([a, b, s, c], n) => { const k = E.outCubic(prog(t, a, a + 0.2)) * (n < 2 ? 1 - prog(t, b - 0.12, b) : 1); if (k <= 0) return; ctx.globalAlpha = wi * wo * k; ctx.fillStyle = c; ctx.fillText(s, 540, 1204 + 10 * (1 - k)); });
    ctx.restore(); ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
