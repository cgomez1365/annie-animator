// t4.3 demo: one little story told with the face. Cog notices a glowing orb (eyes lead, head follows), winds up, reacts (surprise), thinks, then lights up (joy).
import { P, begin, end, hook, E, prog, lerp, rgba, setFont, glow, roundRect, noise1 } from '../../engine/index.mjs';
import { drawMascot, SPEC } from '../t4_1_vector-mascot-design/module.mjs';
import { SKINNED, poseTrack, poseToRig, POSES } from '../t4_2_2d-rigging/module.mjs';
import { applyFace, applyBlink, blinkAmount, gaze, headFollow, actFace, actBody, faceFor } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 2.2 };
const CLOSER = 4.4, U = 240, CX = 540, GY = 1470, BY = GY - SPEC.ground * U, ORB = [815, 1060];
const HOOK = { tIn: 0.1, tOut: 1.35, l1: 'Blink. Look.', l2: 'React.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.5, 1.0] };
const HEAD = { tIn: 1.5, tOut: 4.25, l1: 'Eyes lead.', l2: 'The face follows.', c2: P.green, b1: 446, b2: 514, px: 56 };
export const BEATS = [
  { t: 1.15, emo: 'surprise', dur: 0.16, ease: 'outBack', anticipate: 0.15, pop: 0.2 },
  { t: 1.95, emo: 'think', dur: 0.22 },
  { t: 2.8, emo: 'joy', dur: 0.18, ease: 'outBack', pop: 0.14 },
];
const GAZE = gaze([[0, 0, 0.05], [0.55, 0.92, -0.12], [1.9, -0.5, -0.65], [2.75, 0.4, -0.1], [3.1, 0, 0.1]]);
const BLINKS_ALL = [0.46, 1.94, 3.55, 3.83];   // 1.94 goes with the big look at 1.9 (people blink during a large gaze shift)
const POSE = poseTrack([[0, 'idle'], [0.5, 'idle'], [0.8, 'point', 'outCubic'], [1.15, 'point'], [1.38, 'surprise', 'outBack'], [1.95, 'surprise'], [2.25, 'think', 'outCubic'], [2.8, 'think'], [3.05, 'cheer', 'outBack'], [3.9, 'cheer'], [4.3, 'idle']]);
const CHIPS = [[1.5, 1.95, 'Surprise'], [1.95, 2.8, 'Think'], [2.8, 4.35, 'Joy']];

function rigAt(t) {
  const pz = POSE(t), ab = actBody(t, BEATS), g = GAZE(t);
  pz.y += ab.y; pz.sy += ab.sy; pz.sx += ab.sx; pz.tilt += headFollow(GAZE, t);
  pz.sy *= 1 + 0.014 * Math.sin(t * 3.1); pz.antenna = 0.3 * noise1(t * 1.1, 4) + 0.18 * Math.sin(t * 2.3 + 1) + (ab.y < -0.02 ? 0.5 : 0);
  const rig = poseToRig(pz); rig.shadow = 1;
  applyFace(rig, actFace(t, BEATS));
  for (const k of ['eyeL', 'eyeR']) { rig[k].lx = lerp(rig[k].lx, g.lx, 0.9); rig[k].ly = lerp(rig[k].ly, g.ly, 0.9); }
  applyBlink(rig, blinkAmount(t, BLINKS_ALL));
  rig.glow = 0.3 + 0.4 * prog(t, 2.8, 3.1);
  return rig;
}
function orb(ctx, t, rig) {
  const k = E.outBack(prog(t, 0.35, 0.8), 2.2), fly = E.inOutCubic(prog(t, 2.45, 2.85)); if (k <= 0.01 || fly >= 1) return;
  const bob = 8 * Math.sin(t * 4.2), hx = CX + 330, hy = BY + 0.2 * U, x = lerp(ORB[0], hx, fly), y = lerp(ORB[1] + bob, hy, fly) - 90 * Math.sin(Math.PI * fly);
  const s = k * (1 - 0.5 * fly) * (1 + 0.18 * (t > 1.1 && t < 1.5 ? Math.sin((t - 1.1) * 30) * (1 - prog(t, 1.1, 1.5)) : 0)), pulse = 0.5 + 0.5 * Math.sin(t * 5);
  glow(ctx, rgba(P.cyan, 0.7), 30 + 14 * pulse, () => { ctx.fillStyle = P.cyan; ctx.beginPath(); ctx.arc(x, y, 38 * s, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = rgba(P.white, 0.85); ctx.beginPath(); ctx.arc(x - 11 * s, y - 12 * s, 9 * s, 0, Math.PI * 2); ctx.fill();
  // the gaze line: a dashed line from Cog's eyes to the orb while Cog looks at it
  const gl = Math.min(prog(t, 0.55, 0.75), 1 - prog(t, 1.85, 1.95)) * (1 - fly);
  if (gl > 0.01) { ctx.save(); ctx.globalAlpha *= 0.55 * gl; ctx.strokeStyle = P.cyan; ctx.lineWidth = 3; ctx.setLineDash([10, 12]); ctx.lineDashOffset = -t * 60; ctx.beginPath(); ctx.moveTo(CX + (SPEC.eyeX + 0.1) * U, BY + (rig.y + SPEC.eyeY) * U); ctx.lineTo(x - 50, y); ctx.stroke(); ctx.restore(); }
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
  const outA = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3), inA = E.outCubic(prog(t, 0.05, 0.3));
  if (outA > 0.001) {
    ctx.save(); ctx.globalAlpha *= outA * inA;
    ctx.strokeStyle = rgba(P.green, 0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(90, GY); ctx.lineTo(990, GY); ctx.stroke();
    const rig = rigAt(t); drawMascot(ctx, rig, { x: CX, y: BY, u: U, limb: SKINNED }); orb(ctx, t, rig); chip(ctx, t);
    ctx.restore();
  }
  const ck = E.outBack(prog(t, CLOSER + 0.9, CLOSER + 1.4), 1.8);
  end(ctx, t, { closerAt: CLOSER });
  if (ck > 0.01) {
    const rg = poseToRig(POSES.cheer); applyFace(rg, faceFor('joy')); rg.antenna = 0.3 * Math.sin(t * 3); applyBlink(rg, blinkAmount(t, [CLOSER + 2.4]));
    drawMascot(ctx, rg, { x: 540, y: 1418, u: 92 * ck, limb: SKINNED });
  }
  return cv;
}
