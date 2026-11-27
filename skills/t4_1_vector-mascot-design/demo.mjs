// t4.1 demo: "Meet Cog." The mascot builds from paths (guides, outline trace, parts pop in), then each part group shows it has a handle.
import { P, begin, end, hook, E, prog, clamp, lerp, rgba, setFont, glow, roundRect, createCanvas, noise1, spring, SPRING } from '../../engine/index.mjs';
import { makeRig, drawMascot, drawGuides, gearPoints, revealParts, armJoints, legJoints, SPEC } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.0 };
const CLOSER = 4.4, CX = 540, CY = 1020, U0 = 275;
const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'Meet Cog.', l2: 'Built from shapes.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.7, 1.3] };
const HEAD = { tIn: 2.15, tOut: 4.25, l1: 'Every part', l2: 'has a handle.', c2: P.green, b1: 446, b2: 514, px: 56 };
const GROUPS = [[2.2, 2.75, 'Eyes and brows'], [2.75, 3.3, 'Mouth'], [3.3, 3.85, 'Arms and legs'], [3.85, 4.4, 'Ring and antenna']];
const bump = (t, a, b) => Math.sin(Math.PI * prog(t, a, b)); // 0 -> 1 -> 0 over [a, b]
const blink = (t, t0) => { const p = prog(t, t0, t0 + 0.16); return p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0; };

function rigAt(t) {
  const rig = makeRig();
  // construction: ring first (alpha handled by the caller), then plate, face, limbs
  revealParts(rig, t, { antenna: [1.0, 1.4], plate: [1.0, 1.35], bolts: [1.05, 1.4], eyeL: [1.3, 1.65], eyeR: [1.36, 1.71], browL: [1.5, 1.8], browR: [1.55, 1.85], mouth: [1.6, 1.9], cheeks: [1.7, 1.95], armL: [1.55, 1.9], armR: [1.6, 1.95], legL: [1.65, 2.0], legR: [1.7, 2.05] });
  const settle = prog(t, 2.0, 2.3);
  // life: breathing, a slow lean, antenna sway, blinks, eye darts
  rig.sy = 1 + 0.018 * Math.sin(t * 3.1); rig.sx = 1 - 0.009 * Math.sin(t * 3.1);
  rig.tilt = 0.025 * Math.sin(t * 1.7) * settle; rig.antenna = (0.35 * noise1(t * 0.9, 3) + 0.25 * Math.sin(t * 2.6)) * settle;
  rig.ringRot = 0.12 * Math.sin(t * 1.2);
  const b = Math.max(blink(t, 2.05), blink(t, 3.5), blink(t, 5.2)); rig.eyeL.open = rig.eyeR.open = 1 - b;
  // intro: the first wave (t 2.0 - 2.2 only as the hello; groups take over after)
  const hello = prog(t, 1.95, 2.15) * (1 - prog(t, 2.2, 2.5));
  if (hello > 0) { rig.armR.j = armJoints('R', lerp(0.32, 2.35, hello), lerp(0.12, 2.9 + 0.45 * Math.sin(t * 22), hello)); }
  // group 0: eyes and brows
  const g0 = bump(t, 2.2, 2.75), look = Math.sin(prog(t, 2.2, 2.75) * Math.PI * 2);
  rig.eyeL.lx = rig.eyeR.lx = 0.85 * look * g0; rig.browL.y = rig.browR.y = -0.09 * g0; rig.eyeL.size = rig.eyeR.size = 1 + 0.12 * g0;
  // group 1: mouth talks
  const g1 = bump(t, 2.75, 3.3); rig.mouth.open = g1 * (0.55 + 0.45 * Math.sin((t - 2.75) * 26)) ; rig.mouth.smile = 0.55 + 0.4 * g1; rig.mouth.tongue = 0.5 * g1;
  // group 2: arms wave, legs hop
  const g2 = bump(t, 3.3, 3.85), hop = Math.abs(Math.sin(prog(t, 3.3, 3.85) * Math.PI * 2)) * g2;
  rig.armL.j = armJoints('L', 0.32 + 1.5 * g2 + 0.2 * Math.sin(t * 20) * g2, 0.12 + 1.9 * g2); rig.armR.j = armJoints('R', 0.32 + 1.5 * g2 - 0.2 * Math.sin(t * 20) * g2, 0.12 + 1.9 * g2);
  rig.y = -0.35 * hop; rig.sy *= 1 - 0.08 * (1 - hop) * g2; rig.sx *= 1 + 0.06 * (1 - hop) * g2;
  const fl = 0.45 * hop; rig.legL.j = legJoints('L', 0.05 - fl * 0.3, -0.05 + fl); rig.legR.j = legJoints('R', 0.05 - fl * 0.3, -0.05 + fl);
  // group 3: ring turns, antenna lights up
  const g3 = prog(t, 3.85, 4.4);
  rig.ringRot += Math.PI * 2 / SPEC.teeth * 2 * E.inOutCubic(g3); rig.glow = bump(t, 3.85, 4.5); rig.antenna += 0.5 * Math.sin(g3 * Math.PI * 4) * bump(t, 3.85, 4.4);
  return rig;
}

function labelChip(ctx, t) {
  for (const [a, b, text] of GROUPS) {
    const k = E.outBack(prog(t, a, a + 0.25), 1.8), o = 1 - prog(t, b - 0.08, b + 0.02); if (k <= 0.01 || o <= 0.01 || t > b + 0.02) continue;
    ctx.save(); ctx.translate(CX, 655); ctx.scale(k, k); ctx.globalAlpha *= o; setFont(ctx, 'inter', 52, 700);
    const w = ctx.measureText(text).width + 80;
    glow(ctx, rgba(P.cyan, 0.35), 24, () => { ctx.fillStyle = P.panel2; roundRect(ctx, -w / 2, -48, w, 96, 48).fill(); });
    ctx.strokeStyle = rgba(P.cyan, 0.8); ctx.lineWidth = 3; roundRect(ctx, -w / 2, -48, w, 96, 48).stroke();
    ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, 0, 18); ctx.restore();
  }
}

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const u = lerp(U0, 235, E.inOutCubic(prog(t, 2.1, 2.6))), outA = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  const cy = CY + lerp(0, 40, E.inOutCubic(prog(t, 2.1, 2.6)));
  if (outA > 0.001) {
    ctx.save(); ctx.globalAlpha *= outA;
    const rigT = rigAt(t), ringK = prog(t, 0.25, 1.0), fillK = E.outCubic(prog(t, 0.85, 1.15));
    // blueprint: guide circles and the cog outline traced before it fills
    if (t < 2.2) {
      const gk = E.outCubic(prog(t, 0.2, 0.8)), ga = 1 - prog(t, 1.3, 1.9);
      drawGuides(ctx, { x: CX, y: cy, u, alpha: ga, k: gk });
      const pts = gearPoints(), n = Math.floor(pts.length * E.inOutCubic(ringK));
      if (n > 2 && fillK < 1) { ctx.save(); ctx.translate(CX, cy); ctx.scale(u, u); ctx.strokeStyle = P.green; ctx.lineWidth = 3.5 / u; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (n >= pts.length - 1) ctx.closePath(); ctx.stroke(); ctx.restore(); }
    }
    const k0 = E.outBack(prog(t, 0.85, 1.25), 1.6);
    if (fillK > 0.01) drawMascot(ctx, rigT, { x: CX, y: cy + 14 * (1 - k0), u: u * (0.94 + 0.06 * k0), alpha: fillK });
    labelChip(ctx, t);
    ctx.restore();
  }
  // closer: Cog waves under the footer (shapes only, the engine closer keeps all the text)
  const ck = E.outBack(prog(t, CLOSER + 0.9, CLOSER + 1.4), 1.8);
  end(ctx, t, { closerAt: CLOSER });
  if (ck > 0.01) {
    const r = makeRig({ shadow: 1 }); const w = Math.sin((t - CLOSER) * 14);
    r.armR.j = armJoints('R', 2.35, 2.9 + 0.45 * w); r.sy = 1 + 0.02 * Math.sin(t * 3.1); r.antenna = 0.3 * Math.sin(t * 2.4); r.eyeL.open = r.eyeR.open = 1 - blink(t, CLOSER + 2.3); r.mouth.smile = 0.9; r.mouth.open = 0.25;
    r.eyeL.lower = r.eyeR.lower = 0.25; r.tilt = 0.03 * Math.sin(t * 1.7);
    drawMascot(ctx, r, { x: 540, y: 1418, u: 92 * ck });
  }
  return cv;
}
