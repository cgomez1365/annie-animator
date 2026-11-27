// hello_card: the smallest real card. 7.5 s, 1080x1920, silent.
//   hook "Nothing real / moves linearly." -> a window opens -> a cog chip lands with outBack and squashes on impact ->
//   a marker runs between three nodes with inOutCubic, with a trail and node pulses -> the BGI closer.
// Run:  node engine/render.mjs engine/examples/hello_card.mjs --out /some/dir      (add --preview while iterating)
import { E, prog, lerp, rgba, spring, rng, loop } from '../index.mjs';
import { P, begin, end, hook, windowFrame, windowInner, clipRect, icon, dust, glow, roundRect } from '../index.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.6, brand: 'bgi' };
const T = { hookOut: 2.0, winIn: 1.9, drop: 2.05, closer: 4.4 };
const HOOK = { tIn: 0.15, tOut: T.hookOut, l1: 'Nothing real', l2: 'moves linearly.', c1: P.white, c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 3.0, tOut: 4.25, l1: 'Easing gives', l2: 'objects weight.', c1: P.white, c2: P.green, b1: 446, b2: 514, px: 56 };
const WIN = { x: 72, y: 660, w: 936, h: 580, title: 'Motion check' };
const NODES = [200, 540, 880], TRACK_Y = 1130, REST_Y = 880, DROP = [-120, REST_Y], DUR = 0.8, S = 1.5;
// the moment the drop first reaches REST_Y (outBack crosses 1): the impact, where the squash starts
let u0 = 0; while (E.outBack(u0, S) < 1) u0 += 0.001;
const T_IMPACT = T.drop + u0 * DUR;

export function frame(t, i) {
  const { cv, ctx } = begin(t, { closerAt: T.closer });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);

  // window slides up and in (0.4 s outCubic), leaves under the closer
  const wi = E.outCubic(prog(t, T.winIn, T.winIn + 0.4)), wo = 1 - prog(t, T.closer - 0.1, T.closer + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // track: dashed line with three nodes
    ctx.strokeStyle = rgba(P.green, 0.5); ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(NODES[0], TRACK_Y); ctx.lineTo(NODES[2], TRACK_Y); ctx.stroke(); ctx.setLineDash([]);
    const p = (t - 3.0) / 0.8, run = t >= 3.0;
    NODES.forEach((x, n) => {
      let ring = 0; // each arrival at this node pulses a ring for 0.45 s
      if (run) for (let leg = Math.floor(p) - 1; leg <= Math.floor(p); leg++) { if (leg < 0) continue; const arr = [1, 2, 1, 0][leg % 4], ta = 3.0 + 0.8 * (leg + 1); if (arr === n && t >= ta) ring = Math.max(ring, 1 - prog(t, ta, ta + 0.45)); }
      ctx.fillStyle = P.panel2; ctx.strokeStyle = P.green; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, TRACK_Y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (ring > 0) { ctx.strokeStyle = rgba(P.green, ring * 0.8); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, TRACK_Y, 16 + 34 * (1 - ring), 0, Math.PI * 2); ctx.stroke(); }
    });
    if (run) { // marker + trail: A -> B -> C -> B -> A, each leg 0.8 s inOutCubic
      const at = q => { const leg = Math.floor(q), f = E.inOutCubic(q - leg), [a, b] = [[0, 1], [1, 2], [2, 1], [1, 0]][((leg % 4) + 4) % 4]; return lerp(NODES[a], NODES[b], f); };
      for (let j = 6; j >= 0; j--) { const q = Math.max(0, p - j * 0.045); ctx.fillStyle = rgba(P.green, 0.5 * (1 - j / 7) * (j === 0 ? 2 : 1)); ctx.beginPath(); ctx.arc(at(q), TRACK_Y, j === 0 ? 20 : 20 - j * 1.6, 0, Math.PI * 2); ctx.fill(); }
      glow(ctx, P.green, 24, () => { ctx.fillStyle = P.green; ctx.beginPath(); ctx.arc(at(p), TRACK_Y, 20, 0, Math.PI * 2); ctx.fill(); });
    }
    ctx.restore(); ctx.restore();
  }

  // the cog chip: drops with outBack (overshoot = the bounce), squashes at impact (spring), then bobs on a sine
  const k = prog(t, T.drop, T.drop + DUR);
  if (k > 0 && wo > 0.001) {
    const y0 = lerp(DROP[0], DROP[1], E.outBack(k, S)), settle = prog(t, T_IMPACT + 0.4, T_IMPACT + 0.7);
    const bob = 7 * Math.sin((t - T_IMPACT) * 4.2) * settle, sq = t > T_IMPACT ? spring(t - T_IMPACT, { from: 0.2, to: 0, k: 420, c: 13 }) : 0;
    const rot = 0.06 * Math.sin((t - T_IMPACT) * 3) * settle, y = y0 + bob;
    ctx.save(); ctx.globalAlpha *= wo;
    // shadow on the window floor: shrinks and fades as the chip rises
    const h = Math.max(0, 1 - (REST_Y - y) / 420);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * Math.min(1, h)})`; ctx.beginPath(); ctx.ellipse(540, REST_Y + 92, 86 * (0.6 + 0.4 * h), 14 * (0.6 + 0.4 * h), 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(540, y + 75 * sq); ctx.rotate(rot); ctx.scale(1 + 0.9 * sq, 1 - sq);
    glow(ctx, rgba(P.green, 0.35), 26, () => { ctx.fillStyle = P.panel2; roundRect(ctx, -75, -75, 150, 150, 32).fill(); });
    ctx.strokeStyle = P.green; ctx.lineWidth = 4; roundRect(ctx, -75, -75, 150, 150, 32).stroke();
    icon(ctx, 'cog', -42, -42, 84, P.green, 2); ctx.restore();
  }
  return end(ctx, t, { closerAt: T.closer, brand: 'bgi' });
}
