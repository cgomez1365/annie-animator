#!/usr/bin/env node
// t4.2 test: FK, IK, skinning, walk (no foot slide), hop, pose library, then render the demo and run the quality checker.
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas, E } from '../../engine/index.mjs';
import { SPEC, drawMascot, armJoints, legJoints, fk } from '../t4_1_vector-mascot-design/module.mjs';
import { COG_BONES, solveSkeleton, twoBoneIK, armIK, legIK, bindSkin, poseSkin, tubeOutline, polyArea, restPose, pose, POSES, blendPoses, poseTrack, poseToRig, walkPose, walkSpeed, walkFootWorldX, hopPose, rollRot, GROUND_ANKLE, SKINNED } from './module.mjs';

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const hashRig = rig => { const cv = createCanvas(420, 600), c = cv.getContext('2d'); drawMascot(c, rig, { x: 210, y: 230, u: 80, limb: SKINNED }); return c.getImageData(0, 0, 420, 600).data; };

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near, section }) => {
  section('skeleton FK');
  const sk = solveSkeleton(COG_BONES, {}), want = armJoints('R', 0.32, 0.12);
  near(sk.armR1.tipX, want[1][0], 1e-9, 'skeleton FK equals t4.1 armJoints (elbow x)'); near(sk.armR2.tipY, want[2][1], 1e-9, 'skeleton FK equals t4.1 armJoints (hand y)');
  const sk2 = solveSkeleton(COG_BONES, { armR1: 0.5 }); near(sk2.armR2.angle - sk.armR2.angle, 0.5, 1e-9, 'a forearm inherits its parent rotation');
  near(sk2.armR2.x, sk2.armR1.tipX, 1e-9, 'child starts at the parent tip');

  section('two-bone IK');
  for (const [t, label] of [[[0.4, 0.7], 'down-right'], [[0.2, 0.3], 'near'], [[-0.3, 0.7], 'behind'], [[0.5, -0.5], 'up']]) {
    const r = twoBoneIK([0, 0], 0.5, 0.4, t, [1, 1]);
    near(len(r.joints[0], r.joints[1]), 0.5, 1e-9, `IK ${label}: upper bone length kept`); near(len(r.joints[1], r.joints[2]), 0.4, 1e-9, `IK ${label}: lower bone length kept`);
    near(len(r.joints[2], t), 0, 1e-9, `IK ${label}: end lands on the target`); ok(r.reached, `IK ${label}: reported reached`);
    const f = fk([0, 0], [0.5, 0.4], [r.a1, r.a2]); near(f[2][0], t[0], 1e-9, `IK ${label}: angles reproduce the target through fk (x)`); near(f[2][1], t[1], 1e-9, `IK ${label}: (y)`);
  }
  const far = twoBoneIK([0, 0], 0.5, 0.4, [3, 0], [0, 1]); ok(!far.reached, 'unreachable target is reported'); near(len(far.joints[0], far.joints[2]), 0.9, 1e-3, 'unreachable target: chain stretches straight (0.9)'); near(far.joints[2][1], 0, 1e-3, 'unreachable: points at the target');
  const up = twoBoneIK([0, 0], 0.5, 0.4, [0.4, 0.4], [1, 0]), dn = twoBoneIK([0, 0], 0.5, 0.4, [0.4, 0.4], [-1, 0]); ok(up.joints[1][0] > dn.joints[1][0], 'prefer picks the bend side');
  const aR = armIK('R', [0.9, 0.5]), aL = armIK('L', [-0.9, 0.5]); near(aR.a1, aL.a1, 1e-9, 'mirrored arm targets give mirrored angles'); const aj = armJoints('R', aR.a1, aR.a2); near(aj[2][0], 0.9, 1e-9, 'armIK reaches its target through armJoints'); ok(aj[1][0] >= 0.84 && aj[1][1] >= 0.14, 'elbow bulges out and down (not through the body)');

  section('skinning');
  const J = [[0, 0], [0, 0.34], [0, 0.64]], rest = tubeOutline(J, SPEC.armW), skin = bindSkin(rest, J, 0.1);
  const id = poseSkin(skin, J); ok(rest.every((p, i) => Math.hypot(p[0] - id[i][0], p[1] - id[i][1]) < 1e-12), 'rest pose leaves every outline point where it was');
  const bent = fk([0, 0], [0.34, 0.30], [1.0, 1.0 + 1.6]), sp = poseSkin(skin, bent);
  const far1 = rest.map((p, i) => [p, i]).filter(([p]) => p[1] < 0.2), far2 = rest.map((p, i) => [p, i]).filter(([p]) => p[1] > 0.5 && Math.abs(p[0]) < 0.2);
  const d1 = bent[1][0] - bent[0][0], dd = Math.hypot(d1, bent[1][1]); near(dd, 0.34, 1e-9, 'bent chain keeps the upper length');
  const mid = sp.filter((p, i) => rest[i][1] > 0.3 && rest[i][1] < 0.38).length; ok(mid > 3, 'points exist across the elbow zone');
  ok(far1.length > 5 && far2.length > 5, 'both ends have rigid points');
  const rigidOk = far1.every(([p, i]) => { const a1 = Math.atan2(bent[1][0] - bent[0][0], bent[1][1] - bent[0][1]), c = Math.cos(-a1), s = Math.sin(-a1); const exp = [bent[0][0] + p[0] * c - p[1] * s, bent[0][1] + p[0] * s + p[1] * c]; return Math.hypot(exp[0] - sp[i][0], exp[1] - sp[i][1]) < 1e-9; });
  ok(rigidOk, 'points far from the joint move rigidly with their bone');
  const a0 = polyArea(rest), a90 = polyArea(poseSkin(skin, fk([0, 0], [0.34, 0.30], [0.4, 0.4 + Math.PI / 2]))), a120 = polyArea(sp);
  ok(a90 / a0 > 0.9, `volume kept at a 90 degree elbow (${(100 * a90 / a0).toFixed(1)} percent)`); ok(a120 / a0 > 0.8, `volume kept at a 92 degree plus bend (${(100 * a120 / a0).toFixed(1)} percent)`);
  const edge = poly => Math.max(...poly.map((p, i) => len(p, poly[(i + 1) % poly.length]))); ok(edge(sp) < edge(rest) * 1.7, `no tears at the elbow: longest outline edge ${edge(sp).toFixed(3)} vs ${edge(rest).toFixed(3)} at rest`);

  section('pose library');
  const names = Object.keys(POSES); ok(names.length >= 12, `${names.length} poses in the library`);
  const hashes = new Set();
  for (const n of names) {
    const p = POSES[n]; const rig = poseToRig(p);
    ok([p.x, p.y, p.tilt, p.sx, p.sy, p.armL.a1, p.armL.a2, p.armR.a1, p.armR.a2, p.legL.a1, p.legL.a2].every(Number.isFinite), `${n}: all numbers finite`);
    const hand = rig.armR.j[2], ok2 = Math.hypot(hand[0], hand[1]) < 2.1; ok(ok2, `${n}: hand within 2.1 units of the body centre`);
    ok(rig.legR.j[2][1] + 0.163 + p.y <= SPEC.ground + 0.25, `${n}: feet not under the floor by more than a squash`);
    hashes.add(Buffer.from(hashRig(rig)).toString('base64').slice(0, 0) + JSON.stringify(rig.armR.j) + JSON.stringify(rig.armL.j) + rig.y + rig.tilt + rig.sy);
  }
  ok(hashes.size === names.length, 'every pose is different');
  near(blendPoses(POSES.idle, POSES.cheer, 0).armR.a1, POSES.idle.armR.a1, 1e-12, 'blend k=0 is the first pose'); near(blendPoses(POSES.idle, POSES.cheer, 1).armR.a2, POSES.cheer.armR.a2, 1e-12, 'blend k=1 is the second');
  ok(blendPoses(POSES.idle, POSES.cheer, 1.2).armR.a1 > POSES.cheer.armR.a1, 'blend past 1 overshoots (outBack gives follow-through)');
  const tr = poseTrack([[0, 'idle'], [1, 'wave', 'outBack'], [2, 'crouch']]); near(tr(0.5).armR.a1, tr(0.5).armR.a1, 0, 'poseTrack is pure'); near(tr(1).armR.a1, POSES.wave.armR.a1, 1e-9, 'poseTrack hits the key pose at the key time'); near(tr(-5).y, 0, 0, 'poseTrack holds before the first key'); near(tr(9).sy, POSES.crouch.sy, 1e-12, 'poseTrack holds after the last key');
  ok(Math.max(...Array.from({ length: 40 }, (_, i) => tr(i / 40).armR.a1)) > POSES.wave.armR.a1 + 0.05, 'outBack into wave overshoots the pose');

  section('walk cycle');
  const stride = 0.5, T = 0.62, v = walkSpeed(stride, T); near(v, 2 * stride / T, 1e-12, 'walkSpeed = 2 * stride / period');
  const worldAnkle = (p, side) => { const j = legJoints(side, p[side === 'L' ? 'legL' : 'legR'].a1, p[side === 'L' ? 'legL' : 'legR'].a2), c = Math.cos(p.tilt), s_ = Math.sin(p.tilt); return [j[2][0] * c - j[2][1] * s_, j[2][0] * s_ + j[2][1] * c + p.y]; }; // lean about the body centre, then the body offset
  let minAnkle = 1e9, clamped = 0;
  for (let i = 0; i < 400; i++) {
    const ph = i / 400, p = walkPose(ph, { stride });
    for (const side of ['L', 'R']) { const a = worldAnkle(p, side); minAnkle = Math.min(minAnkle, GROUND_ANKLE - a[1]); if (!Number.isFinite(a[0])) clamped++; }
    for (const [side, sx] of [['L', -1], ['R', 1]]) { const f = ph < 0.5 === (side === 'L') ? 0 : 0; void f; const r = legIK(side, [sx * SPEC.hip[0], GROUND_ANKLE - 0.16], [0, p.y], p.tilt); if (!r.reached) clamped++; }
  }
  // the right foot is in stance for phase 0.5-1: its world x must be constant over that stretch
  let r0 = null, slide = 0; for (let i = 200; i < 400; i++) { const ph = i / 400, w = walkFootWorldX('R', ph, 2 * stride * ph, stride); if (r0 === null) r0 = w; slide = Math.max(slide, Math.abs(w - r0)); } // R phase = ph + 0.5 wraps: stance for ph 0.5-1 is f in [0,0.5)
  ok(slide < 1e-9, `right foot planted during its stance (max slide ${slide.toExponential(1)} units)`);
  let l0 = null, ls = 0; for (let i = 0; i < 200; i++) { const ph = i / 400, w = walkFootWorldX('L', ph, 2 * stride * ph, stride); if (l0 === null) l0 = w; ls = Math.max(ls, Math.abs(w - l0)); } ok(ls < 1e-9, `left foot planted during its stance (max slide ${ls.toExponential(1)} units)`);
  // geometry actually places the ankle on the floor in stance: pose -> joints -> ankle world y
  for (const ph of [0.02, 0.1, 0.3, 0.45]) near(worldAnkle(walkPose(ph, { stride }), 'L')[1], GROUND_ANKLE, 1e-6, `left ankle on the floor at phase ${ph}`);
  for (const ph of [0.52, 0.7, 0.75, 0.9]) near(worldAnkle(walkPose(ph, { stride }), 'R')[1], GROUND_ANKLE, 1e-6, `right ankle on the floor at phase ${ph}`);
  near(GROUND_ANKLE - worldAnkle(walkPose(0.75, { stride }), 'L')[1], 0.16, 1e-6, 'swing foot peaks at the lift height (0.16)');
  ok(minAnkle > -1e-6, 'no foot ever goes under the floor'); ok(clamped === 0, 'all leg IK in the walk is within reach (no clamping)');
  ok(Math.abs(walkPose(0).y - walkPose(1).y) < 1e-9 && Math.abs(walkPose(0.37).tilt - walkPose(1.37).tilt) < 1e-9, 'the cycle loops: phase 0 equals phase 1');
  near(rollRot(SPEC.ringRoot * 2 * Math.PI, 1), 2 * Math.PI, 1e-9, 'ring roll: one root circumference of travel = one full turn at ratio 1');

  section('hop cycle');
  const ys = Array.from({ length: 101 }, (_, i) => hopPose(i / 100).y), apex = Math.min(...ys); near(apex, -0.85, 0.02, 'hop apex is the requested height'); ok(ys[0] === 0 && Math.abs(ys[100]) < 0.06, 'hop starts and ends on the floor');
  ok(hopPose(0.15).y > 0.05 && hopPose(0.15).sy < 0.92, 'anticipation: the body sinks and squashes before it leaves'); ok(hopPose(0.3).sy > 1.05, 'launch stretches'); ok(hopPose(0.77).sy < 0.95, 'landing squashes');
  const air = hopPose(0.5), ja = legJoints('L', air.legL.a1, air.legL.a2); ok(ja[2][1] + air.y < GROUND_ANKLE - 0.3, 'in flight the feet are off the floor (tucked)');
  const cr = hopPose(0.2), jc = legJoints('L', cr.legL.a1, cr.legL.a2); near(jc[2][1] + cr.y, GROUND_ANKLE, 1e-6, 'in the crouch the feet stay on the floor');
  ok(hopPose(0.9).ringRot > 0.5 && hopPose(0.05).ringRot === 0, 'the ring spins during the hop');
  ok(poseToRig(restPose()).armR.j.length === 3 && poseToRig(pose({ y: 0.1 })).y === 0.1, 'poseToRig builds a t4.1 rig');
  void E;
} });
