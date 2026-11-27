// t4.2 demo: Cog with a visible skeleton. A walk cycle with planted feet (ground ticks scroll past), arms that reach orbs with IK while the feet stay put, then one hop.
import { P, begin, end, hook, E, prog, clamp, lerp, rgba, setFont, glow, roundRect } from '../../engine/index.mjs';
import { makeRig, drawMascot, armJoints, SPEC } from '../t4_1_vector-mascot-design/module.mjs';
import { SKINNED, poseToRig, walkPose, hopPose, blendPoses, POSES, restPose, armIK, legIK, GROUND_ANKLE, rollRot, drawSkeleton, pose } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.0 };
const CLOSER = 4.4, U = 240, CX = 540, GY = 1470, BY = GY - SPEC.ground * U;   // BY = body centre y when the feet stand on the line
const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'Bones first.', l2: 'Then the skin.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.7, 1.3] };
const HEAD = { tIn: 2.15, tOut: 4.25, l1: 'Reach with IK.', l2: 'Feet stay put.', c2: P.green, b1: 446, b2: 514, px: 56 };
const STRIDE = 0.5, PERIOD = 0.62, WALK0 = 0.3, STOP = 1.85, RAMP = 0.3, IK0 = 2.2, HOP0 = 3.5, HOP_D = 0.95;
const CHIPS = [[2.2, 3.45, 'IK reach'], [3.45, 4.4, 'Hop cycle']];
const bump = (t, a, b) => Math.sin(Math.PI * prog(t, a, b));

// total walk phase: runs at full speed until STOP, then the speed ramps linearly to zero over RAMP seconds (so the ground ticks stop smoothly)
function walkPhase(t) {
  if (t < WALK0) return 0;
  const e = Math.min(t, STOP) - WALK0; let ph = e / PERIOD;
  if (t > STOP) { const d = Math.min(t - STOP, RAMP); ph += (d - (d * d) / (2 * RAMP)) / PERIOD; }
  return ph;
}
// the two orbs the hands chase (body units, relative to the body centre)
const orbR = t => [1.18 + 0.3 * Math.cos((t - IK0) * 5.2), 0.12 + 0.42 * Math.sin((t - IK0) * 5.2)];
const orbL = t => [-1.18 - 0.3 * Math.cos((t - IK0) * 4.4 + 1.4), 0.12 + 0.42 * Math.sin((t - IK0) * 4.4 + 1.4)];

function ikPose(t) {
  const e = t - IK0, x = 0.14 * Math.sin(e * 4.2), y = 0.09 + 0.1 * Math.sin(e * 6.3), tilt = 0.05 * Math.sin(e * 4.2 + 1);
  const L = legIK('L', [-SPEC.hip[0], GROUND_ANKLE], [x, y], tilt), R = legIK('R', [SPEC.hip[0], GROUND_ANKLE], [x, y], tilt);   // feet pinned: the ANKLE target never moves
  const a = armIK('R', orbR(t).map((v, i) => v - [x, y][i])), b = armIK('L', orbL(t).map((v, i) => v - [x, y][i]));
  return pose({ x, y, tilt, legL: { a1: L.a1, a2: L.a2 }, legR: { a1: R.a1, a2: R.a2 }, armR: { a1: a.a1, a2: a.a2 }, armL: { a1: b.a1, a2: b.a2 }, antenna: -0.5 * Math.cos(e * 4.2) });
}
function sceneRig(t) {
  let pz, extra = {};
  if (t < IK0) {
    const ph = walkPhase(t), w = walkPose(ph, { stride: STRIDE }), s = E.inOutCubic(prog(t, STOP, STOP + 0.35));
    pz = blendPoses(w, restPose(), s); pz.ringRot = rollRot(ph * 2 * STRIDE);
  } else if (t < HOP0) {
    pz = ikPose(t); const into = E.inOutCubic(prog(t, HOP0 - 0.3, HOP0)); if (into > 0) pz = blendPoses(pz, hopPose(0, { height: 0.42 }), into);
    const o = orbR(t); extra = { eyeL: { lx: clamp(o[0] * 0.8 - 0.4, -1, 1), ly: o[1] }, eyeR: { lx: clamp(o[0] * 0.8 - 0.4, -1, 1), ly: o[1] } };
  } else pz = hopPose(prog(t, HOP0, HOP0 + HOP_D), { height: 0.42 });
  const rig = poseToRig(pz, extra); rig.mouth.smile = 0.7;
  return { rig, pz };
}

function ground(ctx, t) {
  const dist = (t < IK0 ? walkPhase(t) * 2 * STRIDE : walkPhase(IK0) * 2 * STRIDE), a = 0.9;
  ctx.save(); ctx.strokeStyle = rgba(P.green, 0.55 * a); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(90, GY); ctx.lineTo(990, GY); ctx.stroke();
  for (let k = -12; k < 40; k++) { const x = CX + (k * 0.7 - (dist % 0.7)) * U; if (x < 100 || x > 980) continue; const fade = 1 - Math.abs(x - CX) / 480; ctx.fillStyle = rgba(P.green, 0.8 * clamp(fade * 1.4)); ctx.fillRect(x - 2, GY + 8, 4, 26); }
  ctx.restore();
}
function orbs(ctx, t, rig) {
  const k = E.outBack(prog(t, IK0 + 0.05, IK0 + 0.4), 1.8) * (1 - prog(t, HOP0 - 0.3, HOP0 - 0.1)); if (k <= 0.01) return;
  for (const [o, c] of [[orbR(t), P.cyan], [orbL(t), P.orange]]) {
    const x = CX + (o[0] + rig.x) * U, y = BY + (o[1] + rig.y) * U;
    for (let j = 6; j >= 1; j--) { const q = o === undefined ? o : (c === P.cyan ? orbR(t - j * 0.045) : orbL(t - j * 0.045)); ctx.fillStyle = rgba(c, 0.5 * (1 - j / 7)); ctx.beginPath(); ctx.arc(CX + (q[0] + rig.x) * U, BY + (q[1] + rig.y) * U, 22 * k * (1 - j / 9), 0, Math.PI * 2); ctx.fill(); }
    glow(ctx, rgba(c, 0.6), 22, () => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 24 * k, 0, Math.PI * 2); ctx.fill(); });
  }
}
function chip(ctx, t) {
  for (const [a, b, text] of CHIPS) {
    const k = E.outBack(prog(t, a, a + 0.25), 1.8), o = 1 - prog(t, b - 0.08, b); if (k <= 0.01 || o <= 0.01) continue;
    ctx.save(); ctx.translate(CX, 612); ctx.scale(k, k); ctx.globalAlpha *= o; setFont(ctx, 'inter', 52, 700);
    const w = ctx.measureText(text).width + 80;
    glow(ctx, rgba(P.cyan, 0.35), 24, () => { ctx.fillStyle = P.panel2; roundRect(ctx, -w / 2, -48, w, 96, 48).fill(); });
    ctx.strokeStyle = rgba(P.cyan, 0.8); ctx.lineWidth = 3; roundRect(ctx, -w / 2, -48, w, 96, 48).stroke();
    ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, 0, 18); ctx.restore();
  }
}

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const outA = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3), inA = E.outCubic(prog(t, 0.2, 0.55));
  if (outA > 0.001) {
    ctx.save(); ctx.globalAlpha *= outA * inA;
    ground(ctx, t);
    const { rig } = sceneRig(t); rig.shadow = 1;
    const sk = E.outCubic(prog(t, 0.5, 0.9));
    drawMascot(ctx, rig, { x: CX, y: BY, u: U, limb: SKINNED });
    orbs(ctx, t, rig);
    drawSkeleton(ctx, rig, { x: CX, y: BY, u: U, alpha: sk * (1 - prog(t, CLOSER - 0.3, CLOSER)) });
    chip(ctx, t);
    ctx.restore();
  }
  const ck = E.outBack(prog(t, CLOSER + 0.9, CLOSER + 1.4), 1.8);
  end(ctx, t, { closerAt: CLOSER });
  if (ck > 0.01) {
    const pz = blendPoses(POSES.idle, POSES.cheer, 0.5 + 0.5 * Math.sin((t - CLOSER) * 5)), rg = poseToRig(pz); rg.mouth.smile = 0.9; rg.mouth.open = 0.25;
    drawMascot(ctx, rg, { x: 540, y: 1418, u: 92 * ck, limb: SKINNED });
  }
  return cv;
}
