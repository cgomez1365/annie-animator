// Tiny fixture cards for the self-tests: a 3 s card with a moving dot, so only the thing under test can fail.
import { createCanvas, setFont } from '../../canvas.mjs';
export const META_BASE = { W: 1080, H: 1920, fps: 30, frames: 90, qc: { closer: false } };
export function base(t, { dotMoves = () => true } = {}) {
  const cv = createCanvas(1080, 1920), ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, 1080, 1920);
  const x = dotMoves(t) ? 200 + 600 * (0.5 + 0.5 * Math.sin(t * 5)) : 500; // frozen = the dot stops
  ctx.fillStyle = '#19e08f'; ctx.beginPath(); ctx.arc(x, 1000, 30, 0, Math.PI * 2); ctx.fill();
  return { cv, ctx };
}
export function text(ctx, s, x, y, px, color = '#f8fafc') { setFont(ctx, 'inter', px, 600); ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); }
