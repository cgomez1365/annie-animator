// t6.3 demo (8 s): a card is packaged. A scrubber hunts for the cover frame, snaps to it, and the 3:4 grid crop locks on;
// then the post checks tick: cover, title length, AI label, 18+ control.
import { P, E, prog, lerp, clamp, rgba, setFont, roundRect, clipRect, begin, end, hook, windowFrame, windowInner } from '../../engine/index.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 4.2 };
const CLOSER = 4.8, WIN = { x: 72, y: 660, w: 936, h: 580, title: 'post.md' };
const HOOK = { tIn: 0.15, tOut: 1.4, l1: 'One card,', l2: 'three apps.', c1: P.white, c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 1.65, tOut: 4.5, l1: 'Cover, title, labels.', l2: 'Checked first.', c1: P.white, c2: P.green, b1: 446, b2: 514, px: 56 };
const TH = { x: 120, y: 760, w: 210, h: 373 }; // the video thumbnail (9:16)
const TRACK = { x: 120, y: 1176, w: 210 };
const ITEMS = [['Cover frame picked', 3.15], ['Title: 140 max', 3.5], ['AI label on', 3.85], ['18+ control set', 4.2]];

// the picture inside the thumbnail changes with the scrub position u (0..1): a hook bar, a window, a closer-ish end
function thumb(ctx, t, u, snapped) {
  ctx.save(); clipRect(ctx, TH.x, TH.y, TH.w, TH.h, 14); ctx.fillStyle = '#0b0e13'; ctx.fillRect(TH.x, TH.y, TH.w, TH.h);
  const sx = TH.w / 1080, sc = (x, y, w, h, c, r = 4) => { ctx.fillStyle = c; roundRect(ctx, TH.x + x * sx, TH.y + y * sx, w * sx, h * sx, r).fill(); };
  const hookA = 1 - prog(u, 0.28, 0.4), winA = prog(u, 0.28, 0.42) * (1 - prog(u, 0.82, 0.9)), endA = prog(u, 0.84, 0.92);
  ctx.globalAlpha = hookA; sc(210, 400, 660, 90, P.white, 10); sc(300, 530, 480, 90, P.green, 10);
  ctx.globalAlpha = winA; sc(72, 660, 936, 580, '#11161d', 22); sc(72, 660, 936, 70, '#171d26', 18); [0, 1, 2].forEach(k => sc(110 + k * 42, 686, 22, 22, ['#ff5f57', '#febc2e', '#28c840'][k], 11)); [0, 1, 2].forEach(k => sc(130, 790 + k * 120, 600 - k * 90, 40, 'rgba(203,213,225,0.45)', 14));
  ctx.globalAlpha = endA; sc(340, 600, 400, 400, 'rgba(255,255,255,0.9)', 200); sc(180, 1060, 720, 50, P.white, 12); sc(260, 1160, 560, 50, P.green, 12);
  ctx.globalAlpha = 1;
  if (snapped > 0) { // the 3:4 crop the profile grids show (y 240-1680 of the 1920): it locks on with an outBack pop
    const k = E.outBack(snapped, 1.7), cy = TH.y + 240 * sx, ch = 1440 * sx; ctx.strokeStyle = P.green; ctx.lineWidth = 4; ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(TH.x, TH.y, TH.w, cy - TH.y); ctx.fillRect(TH.x, cy + ch, TH.w, TH.y + TH.h - cy - ch);
    ctx.save(); ctx.translate(TH.x + TH.w / 2, cy + ch / 2); ctx.scale(lerp(1.12, 1, clamp(k)), lerp(1.12, 1, clamp(k))); roundRect(ctx, -TH.w / 2 + 2, -ch / 2, TH.w - 4, ch, 6).stroke(); ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = snapped > 0 ? rgba(P.green, 0.9) : 'rgba(255,255,255,0.16)'; ctx.lineWidth = 3; roundRect(ctx, TH.x, TH.y, TH.w, TH.h, 14).stroke();
}
function tick(ctx, t, i, [label, t0]) {
  const y = 790 + 104 * i, k = E.outCubic(prog(t, 2.3 + 0.1 * i, 2.6 + 0.1 * i)); if (k <= 0) return;
  const tk = prog(t, t0, t0 + 0.35), pop = E.outBack(tk, 2.2), glow = t > t0 + 0.4 ? Math.max(0, Math.sin(Math.PI * 2 * ((t - t0) / 1.6 - 0.15 * i))) ** 4 : 0;
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(40 * (1 - k), 0);
  ctx.fillStyle = P.panel2; ctx.strokeStyle = tk > 0 ? P.green : 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3 + 1.5 * glow; roundRect(ctx, 380, y, 68, 68, 16).fill(); ctx.stroke();
  if (tk > 0) { ctx.save(); ctx.translate(414, y + 34); ctx.scale(Math.max(0.01, pop), Math.max(0.01, pop)); ctx.strokeStyle = P.green; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const q = E.outCubic(tk);
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-16 + 10 * clamp(q * 2), 10 * clamp(q * 2)); if (q > 0.5) ctx.lineTo(-6 + 22 * (q - 0.5) * 2, 10 - 26 * (q - 0.5) * 2); ctx.stroke(); ctx.restore(); }
  setFont(ctx, 'inter', 46, 650); ctx.fillStyle = tk > 0 ? P.white : P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 470, y + 50);
  ctx.restore();
}
export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.6, 2.0)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi)); windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // scrubber: sweeps 0 -> 1 -> back, then snaps to the cover moment (u = 0.35) with an outBack settle
    const pop = E.outBack(prog(t, 2.9, 3.4), 1.5);
    const u = t < 2.0 ? 0.02 : t < 2.9 ? clamp(E.inOutSine(prog(t, 2.0, 2.9))) * 0.95 : lerp(0.95, 0.35, pop);
    const snapped = t >= 3.15 ? prog(t, 3.15, 3.5) : 0;
    const ta = E.outCubic(prog(t, 1.9, 2.3)); ctx.save(); ctx.globalAlpha *= ta; thumb(ctx, t, u, snapped);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; roundRect(ctx, TRACK.x, TRACK.y, TRACK.w, 8, 4).fill(); ctx.fillStyle = P.cyan; roundRect(ctx, TRACK.x, TRACK.y, Math.max(8, TRACK.w * u), 8, 4).fill();
    ctx.fillStyle = snapped > 0 ? P.green : P.white; ctx.beginPath(); ctx.arc(TRACK.x + TRACK.w * u, TRACK.y + 4, 13 + 3 * Math.sin(t * 8) * (snapped > 0 ? 0 : 1), 0, 7); ctx.fill(); ctx.restore();
    ITEMS.forEach((it, i) => tick(ctx, t, i, it));
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
