// t7.1 demo: flat shapes become depth. A card flips in true perspective (front "FLAT", back "DEEP"), three iso cubes drop, hop and quarter-turn
// with cast shadows on a lit floor, and three parallax gear layers drift behind them as the camera slides. 7.5 s, closer at 4.4 s.
import { P, begin, end, hook, drawMark, E, prog, lerp, rgba, mix, setFont, glow, roundRect, noise1 } from '../../engine/index.mjs';
import { makeCamera, isoCamera, rotY, rotX, mmul, cardQuads, boxQuads, drawQuads, castShadow, floorGrid, parallax, depthTint, texture, project } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.2 };
const CLOSER = 4.4;
const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'Flat shapes.', l2: 'Real depth.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 2.1, tOut: 4.25, l1: 'Perspective, light', l2: 'and shadow.', c2: P.green, b1: 446, b2: 514, px: 56 };

// ---- textures (drawn once, 2 px per world unit)
const CW = 440, CH = 420;
const FRONT = texture(CW * 2, CH * 2, c => {
  const g = c.createLinearGradient(0, 0, 0, CH * 2); g.addColorStop(0, '#141b25'); g.addColorStop(1, '#0d1117'); c.fillStyle = g; c.fillRect(0, 0, CW * 2, CH * 2);
  c.strokeStyle = rgba(P.green, 0.7); c.lineWidth = 8; c.strokeRect(24, 24, CW * 2 - 48, CH * 2 - 48);
  drawMark(c, CW, 330, 330, { k: 1 }); setFont(c, 'sg', 170, 700, -0.01); c.fillStyle = P.white; c.textAlign = 'center'; c.fillText('FLAT', CW, 740);
});
const BACK = texture(CW * 2, CH * 2, c => {
  const g = c.createLinearGradient(0, 0, 0, CH * 2); g.addColorStop(0, '#19e08f'); g.addColorStop(1, P.accent); c.fillStyle = g; c.fillRect(0, 0, CW * 2, CH * 2);
  c.strokeStyle = 'rgba(4,20,12,0.5)'; c.lineWidth = 8; c.strokeRect(24, 24, CW * 2 - 48, CH * 2 - 48);
  setFont(c, 'sg', 190, 700, -0.01); c.fillStyle = P.ink; c.textAlign = 'center'; c.fillText('DEEP', CW, 560);
  c.fillStyle = 'rgba(4,20,12,0.55)'; c.fillRect(200, 640, CW * 2 - 400, 10); c.fillRect(300, 700, CW * 2 - 600, 10);
});
const TOPMARK = texture(260, 260, c => { c.fillStyle = '#0d1117'; c.fillRect(0, 0, 260, 260); c.strokeStyle = P.green; c.lineWidth = 12; c.strokeRect(8, 8, 244, 244); drawMark(c, 130, 130, 170, { k: 1 }); });

// ---- cameras
const CARD_CAM = (pitch, cy) => makeCamera({ cx: 540, cy, f: 1200, d: 1300, pitch });
const ISO = isoCamera({ cx: 540, cy: 1300, scale: 1.2 });
const CUBES = [{ u: -150, col: P.green, t0: 0.85 }, { u: 0, col: P.cyan, t0: 1.0, top: TOPMARK }, { u: 150, col: '#e6edf5', t0: 1.15 }];
const FLOOR_Y = 0, S = 130;

// one quarter turn every `period` s, `dur` long, overshooting like a latch: returns turns (0.25 per step)
const stepTurn = (t, t0, period, dur) => { if (t < t0) return 0; const n = Math.floor((t - t0) / period), u = prog(t - t0 - n * period, 0, dur); return 0.25 * (n + E.outBack(u, 1.3)); };
const hopH = (t, t0, period, dur) => { if (t < t0) return 0; const n = Math.floor((t - t0) / period), u = prog(t - t0 - n * period, 0, dur); return 95 * Math.sin(Math.PI * u) ** 0.8; };

function cog(ctx, cx, cy, r, teeth, a, col) {
  ctx.beginPath(); const n = teeth * 2;
  for (let i = 0; i < n; i++) { const th = a + (i / n) * Math.PI * 2, rr = (i % 2 ? 0.8 : 1) * r, w = Math.PI / n * 0.5; for (const d of [-w, w]) { ctx.lineTo(cx + Math.cos(th + d) * rr, cy + Math.sin(th + d) * rr); } }
  ctx.closePath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2, true); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
}
const GEARS = [ // depth, x, y, r, teeth, spin dir
  { d: 4, x: 200, y: 760, r: 150, n: 14, s: 0.10 }, { d: 4, x: 900, y: 1010, r: 190, n: 16, s: -0.08 }, { d: 4, x: 120, y: 1330, r: 120, n: 12, s: 0.12 },
  { d: 2.5, x: 860, y: 700, r: 100, n: 12, s: -0.16 }, { d: 2.5, x: 260, y: 1050, r: 130, n: 14, s: 0.13 }, { d: 2.5, x: 920, y: 1370, r: 90, n: 10, s: 0.17 },
  { d: 1.6, x: 130, y: 900, r: 70, n: 10, s: -0.22 }, { d: 1.6, x: 960, y: 880, r: 60, n: 9, s: 0.2 },
];

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  const camX = lerp(-170, 170, E.inOutSine(prog(t, 0, 4.6)));
  const wo = 1 - prog(t, CLOSER - 0.12, CLOSER + 0.25);
  // ---- parallax gears (far to near): far layers shift less, shrink and fade toward the ground
  for (const g of GEARS) {
    const q = parallax(g.d, camX), cx = 540 + (g.x - 540) * q.s + q.dx, cy = 900 + (g.y - 900) * q.s;
    ctx.save(); ctx.globalAlpha *= wo * 0.9 * q.a; cog(ctx, cx, cy, g.r * q.s, g.n, t * g.s, depthTint(P.green, g.d)); ctx.restore();
  }
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  if (wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wo;
    // ---- iso floor, cast shadows, cubes
    const fk = E.outCubic(prog(t, 0.5, 1.0));
    ctx.save(); ctx.globalAlpha *= fk; floorGrid(ctx, ISO, { floorY: FLOOR_Y, half: 260, step: 52 }); ctx.restore();
    const quads = [];
    CUBES.forEach((c, i) => {
      const drop = c.t0 < t ? 1 - E.outBounce(prog(t, c.t0, c.t0 + 0.7)) : 1, lift = drop * 560 + hopH(t, 2.0 + 0.25 * i, 1.5, 0.5);
      if (t < c.t0) return;
      const R = rotY(stepTurn(t, 2.0 + 0.25 * i, 1.5, 0.5) * Math.PI * 2), ctr = [c.u, FLOOR_Y - S / 2 - lift, c.u];
      const bq = boxQuads(ctr, [S, S, S], R, { fill: c.col, edge: 'rgba(4,10,8,0.55)', tex: c.top ? { top: c.top } : undefined });
      const verts = []; for (const q of bq) verts.push(...q.pts);
      castShadow(ctx, verts, ISO, { dir: [0.6, 1, -0.05], floorY: FLOOR_Y, alpha: 0.75 - 0.35 * Math.min(1, lift / 300), blur: 8 + lift / 28 });
      quads.push(...bq);
    });
    drawQuads(ctx, quads, ISO, { light: { spec: 0.15 } });
    // ---- perspective card
    const ck = E.outBack(prog(t, 0.9, 1.5), 1.6);
    if (ck > 0.01) {
      let turns = 0; for (const f of [1.5, 2.6, 3.7]) turns += E.outBack(prog(t, f, f + 0.85), 1.4);
      const yaw = turns * Math.PI, bob = 12 * Math.sin(t * 2.3), pitch = 0.1 + 0.03 * noise1(t * 1.3, 4);
      const cam = CARD_CAM(pitch, 832 + bob), R = mmul(rotX(0.02 * Math.sin(t * 1.7)), rotY(yaw));
      // soft glow plate behind the card
      ctx.save(); const gr = ctx.createRadialGradient(540, 832, 20, 540, 832, 380); gr.addColorStop(0, rgba(P.green, 0.16 * ck)); gr.addColorStop(1, rgba(P.green, 0)); ctx.fillStyle = gr; ctx.fillRect(100, 480, 880, 800); ctx.restore();
      const quads2 = cardQuads([0, 0, 0], CW * ck, CH * ck, 14, R, { front: FRONT, back: BACK, fill: '#1a2330', edge: rgba(P.green, 0.5) });
      const sheen = prog(((t - 1.5) % 1.1 + 1.1) % 1.1, 0.1, 0.9);
      drawQuads(ctx, quads2, cam, { texN: 12, sheen, light: { ambient: 0.55, diffuse: 0.5 } });
    }
    ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER });
}
