// t7.3 demo: the studio's signature motion. A 12-tooth cog clicks one tooth every 0.6 s and drives a 18-tooth gear the other way (ring + shake on every click),
// above four lanes that run the library's curves (enter, pop, slam, exit) with onion-skin trails so the feel of each curve is visible. 7.5 s, closer at 4.4 s.
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, E, prog, lerp, noise1 } from '../../engine/index.mjs';
import { play, ratchetAngle, meshedPair, drawGear, clickPulse, clickShake, breathe } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.6 };
const CLOSER = 4.4, WIN = { x: 72, y: 660, w: 936, h: 640, title: 'Motion system' };
const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'One studio.', l2: 'One feel.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 2.1, tOut: 4.25, l1: 'The cog clicks.', l2: 'Every curve has a job.', c2: P.green, b1: 446, b2: 514, px: 56 };
const RATCHET = { t0: 1.2, period: 0.6, dur: 0.28 };
const GEAR = { cx: 300, cy: 902, rpA: 94 };
const LANES = [{ name: 'ENTER', curve: 'enter', y: 1078, col: P.cyan }, { name: 'POP', curve: 'pop', y: 1128, col: P.green }, { name: 'SLAM', curve: 'slam', y: 1178, col: P.orange }, { name: 'EXIT', curve: 'exit', y: 1228, col: P.white }];
const X0 = 340, X1 = 900, LOOP = 2.4;

// position of a lane's dot at local loop time u: moves with the library curve, holds, then glides back (so the loop never jumps)
const lanePos = (c, u) => { const d = c === 'slam' ? 0.9 : c === 'pop' ? 0.55 : 0.4; return u < 0.2 ? X0 : u < 0.2 + d ? lerp(X0, X1, play(c, u, 0.2, d)) : u < 1.5 ? X1 : lerp(X1, X0, E.inOutCubic(prog(u, 1.5, 2.2))); };

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 0.9, 1.3)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // ---- gears
    const angA = ratchetAngle(t, RATCHET), pair = meshedPair(angA, GEAR), [sx, sy] = clickShake(t, RATCHET, 3), cp = clickPulse(t, RATCHET);
    ctx.save(); ctx.translate(sx, sy);
    const gk = E.outBack(prog(t, 1.0, 1.5), 1.6); ctx.translate(pair.A.cx, pair.A.cy); ctx.scale(gk, gk); ctx.translate(-pair.A.cx, -pair.A.cy);
    drawGear(ctx, pair.B.cx, pair.B.cy, pair.B.rp, pair.B.teeth, pair.B.angle, { fill: P.panel2, stroke: P.green, lineWidth: 4 });
    drawGear(ctx, pair.A.cx, pair.A.cy, pair.A.rp, pair.A.teeth, pair.A.angle, { fill: P.white, stroke: P.white, lineWidth: 2 });
    // hubs and a green tooth marker so the turn reads
    for (const g of [pair.A, pair.B]) { ctx.fillStyle = P.green; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.rp * 0.1, 0, 7); ctx.fill(); const a = g.angle, r = g.rp * 0.62; ctx.strokeStyle = g === pair.A ? P.ink : P.green; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(a) * g.rp * 0.4, g.cy + Math.sin(a) * g.rp * 0.4); ctx.lineTo(g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r); ctx.stroke(); }
    // pawl: drops into the next tooth on every click
    const dip = cp ? 8 * cp.k * cp.k * cp.k : 0; ctx.fillStyle = P.green; ctx.beginPath(); const px = pair.A.cx, py = pair.A.cy - pair.A.rp * 1.12 - 16 + dip; ctx.moveTo(px - 16, py - 26); ctx.lineTo(px + 16, py - 26); ctx.lineTo(px, py + 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    // click ring at the contact point
    if (cp && cp.k > 0) { const k = 1 - cp.k, cx = pair.A.cx + pair.A.rp, cy = pair.A.cy; ctx.strokeStyle = rgba(P.green, 0.85 * cp.k); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 14 + 70 * E.outCubic(k), 0, 7); ctx.stroke(); }
    // ratio label, breathing
    ctx.save(); ctx.globalAlpha *= E.outCubic(prog(t, 1.4, 1.8)); setFont(ctx, 'mono', 46, 700); ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.fillText('12 : 18', 830, 890); setFont(ctx, 'inter', 42, 600); ctx.fillStyle = rgba(P.green, 0.7 + 0.3 * breathe(t)); ctx.fillText('30° each', 830, 945); ctx.restore();
    // ---- curve lanes
    LANES.forEach((L, i) => {
      const k = E.outBack(prog(t, 1.5 + 0.14 * i, 1.95 + 0.14 * i), 1.8); if (k <= 0) return;
      ctx.save(); ctx.globalAlpha *= Math.min(1, k * 1.5); ctx.translate(0, 14 * (1 - k));
      setFont(ctx, 'inter', 42, 700); ctx.fillStyle = L.col; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(L.name, 112, L.y + 15);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(X0, L.y); ctx.lineTo(X1, L.y); ctx.stroke(); ctx.setLineDash([]);
      const lt = ((t - (1.9 + 0.14 * i)) % LOOP + LOOP) % LOOP;
      for (let g = 7; g >= 0; g--) { const x = lanePos(L.curve, Math.max(0, lt - g * 0.045)); ctx.fillStyle = rgba(L.col, g === 0 ? 1 : 0.5 * (1 - g / 8)); ctx.beginPath(); ctx.arc(x, L.y, g === 0 ? 18 : 18 - g * 1.4, 0, 7); ctx.fill(); }
      ctx.restore();
    });
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER });
}
