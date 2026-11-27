// t4.2 2d-rigging: bones, FK, two-bone IK, linear-blend skinning of vector parts, a pose library, walk and hop cycles for Cog.
// Poses are plain numbers (angles in radians, offsets in units), so they blend, ease and spring like any other value.
// Output goes into the t4.1 rig record: poseToRig(pose) -> makeRig(...) -> drawMascot(ctx, rig, {limb: SKINNED}).
import { SPEC, makeRig, armJoints, legJoints, fk, drawTube, MC, drawMitten, drawShoe, rigSpace } from '../t4_1_vector-mascot-design/module.mjs';
import { clamp, lerp, prog, E, rgba } from '../../engine/index.mjs';
import { P } from '../../engine/brand.mjs';

const TAU = Math.PI * 2;
const GROUND_ANKLE = SPEC.ground - (0.055 + 0.108);   // ankle height when the sole touches the ground: ankle + 0.163 = ground line

// ------------------------------------------------------------------ skeleton and FK
/**
 * A skeleton is a list of bones: {name, parent (name or null), at: [x,y] offset of the bone's root from its parent's TIP (or from the origin for the root),
 * len, rest (rest angle, rad)}. Angles use Cog's convention: 0 = pointing down, + = swing toward +x. Children inherit the parent's angle.
 * @typedef {{name:string,parent:string|null,at:[number,number],len:number,rest?:number}} Bone
 */
/** Cog's skeleton. The body is the root; the limbs hang off it. Offsets come from SPEC so t4.1 stays the single source of truth. */
export const COG_BONES = [
  { name: 'body', parent: null, at: [0, 0], len: 0 },
  { name: 'armL1', parent: 'body', at: [-SPEC.shoulder[0], SPEC.shoulder[1]], len: SPEC.upperArm, rest: -0.32, attachRoot: true },
  { name: 'armL2', parent: 'armL1', at: [0, 0], len: SPEC.foreArm, rest: 0.2 },
  { name: 'armR1', parent: 'body', at: [SPEC.shoulder[0], SPEC.shoulder[1]], len: SPEC.upperArm, rest: 0.32, attachRoot: true },
  { name: 'armR2', parent: 'armR1', at: [0, 0], len: SPEC.foreArm, rest: -0.2 },
  { name: 'legL1', parent: 'body', at: [-SPEC.hip[0], SPEC.hip[1]], len: SPEC.thigh, rest: -0.05, attachRoot: true },
  { name: 'legL2', parent: 'legL1', at: [0, 0], len: SPEC.shin, rest: 0.1 },
  { name: 'legR1', parent: 'body', at: [SPEC.hip[0], SPEC.hip[1]], len: SPEC.thigh, rest: 0.05, attachRoot: true },
  { name: 'legR2', parent: 'legR1', at: [0, 0], len: SPEC.shin, rest: -0.1 },
];
/**
 * Forward kinematics. local = {boneName: angle offset from rest (rad)}; children add their parent's total angle, so a forearm turns
 * with the upper arm. Bones flagged attachRoot are positioned from the body origin (shoulders, hips); other children start at the parent's tip.
 * Returns {name: {x, y, tipX, tipY, angle}} in body units.
 * @param {Bone[]} bones @param {Record<string,number>} [local]
 */
export function solveSkeleton(bones, local = {}) {
  const out = {};
  for (const b of bones) {
    const par = b.parent ? out[b.parent] : null, own = (b.rest || 0) + (local[b.name] || 0);
    const ang = own + (par && !b.attachRoot ? par.angle : 0);
    const ox = b.attachRoot ? b.at[0] : par ? par.tipX + b.at[0] : b.at[0], oy = b.attachRoot ? b.at[1] : par ? par.tipY + b.at[1] : b.at[1];
    out[b.name] = { x: ox, y: oy, angle: ang, tipX: ox + Math.sin(ang) * b.len, tipY: oy + Math.cos(ang) * b.len };
  }
  return out;
}

// ------------------------------------------------------------------ IK
/**
 * Analytic two-bone IK (law of cosines). origin = shoulder or hip, a and b = bone lengths, target = where the hand or ankle should be,
 * prefer = a direction the middle joint should bulge toward (knees and elbows point out and down: [side, 0.3]).
 * If the target is out of reach the chain stretches straight toward it and `reached` is false. Returns {joints:[o, mid, end], reached, a1, a2}
 * where a1, a2 are absolute angles in Cog's convention (0 = down, + = toward +x), ready for fk().
 * @param {[number,number]} origin @param {number} a @param {number} b @param {[number,number]} target @param {[number,number]} [prefer]
 */
export function twoBoneIK(origin, a, b, target, prefer = [0, 1]) {
  const dx = target[0] - origin[0], dy = target[1] - origin[1], raw = Math.hypot(dx, dy), lo = Math.abs(a - b) + 1e-4, hi = a + b - 1e-4;
  const d = clamp(raw, lo, hi), th = Math.atan2(dx, dy);                  // th: angle of the origin-to-target line, 0 = down
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), A = Math.acos(cosA);
  let best = null;
  for (const sgn of [-1, 1]) {
    const a1 = th + sgn * A, mid = [origin[0] + Math.sin(a1) * a, origin[1] + Math.cos(a1) * a];
    const score = (mid[0] - origin[0]) * prefer[0] + (mid[1] - origin[1]) * prefer[1];
    if (!best || score > best.score) best = { a1, mid, score };
  }
  const end = [origin[0] + Math.sin(th) * d, origin[1] + Math.cos(th) * d], a2 = Math.atan2(end[0] - best.mid[0], end[1] - best.mid[1]);
  return { joints: [origin.slice(), best.mid, end], reached: raw <= hi + 1e-9 && raw >= lo - 1e-9, a1: best.a1, a2 };
}
/** Arm IK for one side. target in body units. Returns the two angles in the t4.1 "outward positive" convention: {a1, a2} for armJoints(side, a1, a2). */
export function armIK(side, target) {
  const s = side === 'L' ? -1 : 1, sh = [s * SPEC.shoulder[0], SPEC.shoulder[1]];
  const r = twoBoneIK(sh, SPEC.upperArm, SPEC.foreArm, target, [s * 0.6, 0.8]);
  return { a1: s * r.a1, a2: s * r.a2, reached: r.reached };
}
/**
 * Leg IK for one side. footWorld = where the ANKLE should be, in units relative to the body centre of an un-moved body (floor-fixed).
 * bodyOffset = [rig.x, rig.y] of the body, bodyTilt = rig.tilt, so the foot stays pinned while the body moves. Returns {a1, a2, reached}.
 */
export function legIK(side, footWorld, bodyOffset = [0, 0], bodyTilt = 0) {
  const s = side === 'L' ? -1 : 1, hp = [s * SPEC.hip[0], SPEC.hip[1]];
  const loc = [footWorld[0] - bodyOffset[0], footWorld[1] - bodyOffset[1]], c = Math.cos(-bodyTilt), sn = Math.sin(-bodyTilt);
  const t = [loc[0] * c - loc[1] * sn, loc[0] * sn + loc[1] * c]; // undo the lean (rotation about the body centre)
  const r = twoBoneIK(hp, SPEC.thigh, SPEC.shin, t, [s * 0.9, 0.2]);
  return { a1: s * r.a1, a2: s * r.a2, reached: r.reached };
}

// ------------------------------------------------------------------ skinning (linear blend, two bones)
/**
 * Bind a vector outline to a two-bone chain. restOutline = polygon points in REST pose (chain pointing straight down from `joints[0]`).
 * For each point: s = distance along the chain axis; weight on bone 2 = smoothstep across a blend zone of +-blend around the middle joint.
 * @param {Array<[number,number]>} restOutline @param {Array<[number,number]>} restJoints [origin, mid, end] @param {number} [blend] half width of the blend zone, default 0.10
 * @returns {{rest:Array<[number,number]>, joints:Array<[number,number]>, w2:number[]}}
 */
export function bindSkin(restOutline, restJoints, blend = 0.1) {
  const [o, m] = restJoints, ax = [m[0] - o[0], m[1] - o[1]], L = Math.hypot(ax[0], ax[1]), u = [ax[0] / L, ax[1] / L];
  const w2 = restOutline.map(p => { const s = (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1], x = clamp((s - (L - blend)) / (2 * blend)); return x * x * (3 - 2 * x); });
  return { rest: restOutline.map(p => p.slice()), joints: restJoints.map(p => p.slice()), w2 };
}
/**
 * Pose a bound outline. curJoints = the current [origin, mid, end]. Each bone moves its points rigidly (rotate about its own joint, then move with it);
 * the final point is the weighted mix of the two (that is linear blend skinning). Returns the new polygon.
 * @param {{rest:number[][],joints:number[][],w2:number[]}} skin @param {Array<[number,number]>} curJoints
 */
export function poseSkin(skin, curJoints) {
  const ang = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]), r = skin.joints, c = curJoints;
  const d1 = ang(c[0], c[1]) - ang(r[0], r[1]), d2 = ang(c[1], c[2]) - ang(r[1], r[2]);
  const rot = (p, o, d, to) => { const x = p[0] - o[0], y = p[1] - o[1], cs = Math.cos(-d), sn = Math.sin(-d); return [to[0] + x * cs - y * sn, to[1] + x * sn + y * cs]; };
  return skin.rest.map((p, i) => { const a = rot(p, r[0], d1, c[0]), b = rot(p, r[1], d2, c[1]), w = skin.w2[i]; return [lerp(a[0], b[0], w), lerp(a[1], b[1], w)]; });
}
/** A tapered tube outline around a straight rest chain pointing down: n samples per side, rounded caps. widths = [startDiameter, endDiameter]. */
export function tubeOutline(joints, widths, n = 10) {
  const [o, m, e] = joints, pts = [], seg = (a, b) => Array.from({ length: n }, (_, i) => [lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
  const chain = [...seg(o, m), ...seg(m, e), e], total = Math.hypot(m[0] - o[0], m[1] - o[1]) + Math.hypot(e[0] - m[0], e[1] - m[1]), R = chain.map((p, i) => lerp(widths[0], widths[1], i / (chain.length - 1)) / 2);
  const left = chain.map((p, i) => [p[0] - R[i], p[1]]), right = chain.map((p, i) => [p[0] + R[i], p[1]]);
  for (const p of left) pts.push(p);
  for (let k = 1; k < 8; k++) { const a = Math.PI * k / 8; pts.push([e[0] - R[R.length - 1] * Math.cos(a), e[1] + R[R.length - 1] * Math.sin(a)]); } // rounded tip
  for (let i = right.length - 1; i >= 0; i--) pts.push(right[i]);
  for (let k = 1; k < 8; k++) { const a = Math.PI * k / 8; pts.push([o[0] + R[0] * Math.cos(a), o[1] - R[0] * Math.sin(a)]); } // rounded root
  void total; return pts;
}
/** Polygon area (shoelace). Used to prove skinning keeps volume. */
export function polyArea(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }

const REST = { arm: [[0, 0], [0, SPEC.upperArm], [0, SPEC.upperArm + SPEC.foreArm]], leg: [[0, 0], [0, SPEC.thigh], [0, SPEC.thigh + SPEC.shin]] };
const SKIN = { arm: bindSkin(tubeOutline(REST.arm, SPEC.armW), REST.arm, 0.1), leg: bindSkin(tubeOutline(REST.leg, SPEC.legW), REST.leg, 0.1) };
function drawSkinned(ctx, kind, j) {
  const poly = poseSkin(SKIN[kind], j), w = kind === 'arm' ? SPEC.armW : SPEC.legW;
  ctx.save(); ctx.lineJoin = 'round';
  const path = () => { ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
  path(); ctx.fillStyle = MC.edge; ctx.strokeStyle = MC.edge; ctx.lineWidth = 0.05; ctx.stroke(); ctx.fill();
  path(); ctx.fillStyle = MC.body; ctx.fill();
  ctx.fillStyle = MC.body; ctx.beginPath(); ctx.arc(j[1][0], j[1][1], lerp(w[0], w[1], 0.5) / 2 * 0.98, 0, TAU); ctx.fill(); // joint cap hides any pinch on the inside of a hard bend
  ctx.restore();
}
/** Limb renderers for drawMascot({limb: SKINNED}): an arm and a leg drawn as one skinned outline plus the t4.1 mitten and shoe. */
export const SKINNED = {
  arm(ctx, side, a) {
    const j = a.j; ctx.save(); ctx.translate(j[0][0], j[0][1]); drawSkinned(ctx, 'arm', j.map(p => [p[0] - j[0][0], p[1] - j[0][1]])); ctx.restore();
    drawMitten(ctx, side, a);
  },
  leg(ctx, side, a) {
    const j = a.j; ctx.save(); ctx.translate(j[0][0], j[0][1]); drawSkinned(ctx, 'leg', j.map(p => [p[0] - j[0][0], p[1] - j[0][1]])); ctx.restore();
    drawShoe(ctx, side, a);
  },
};

// ------------------------------------------------------------------ poses
/**
 * A pose is a flat record of numbers. Defaults: everything at rest.
 * x, y: body offset in units (down = +). tilt, sx, sy, ringRot, antenna. armL/armR/legL/legR = {a1, a2} in the outward-positive convention (0 down, PI/2 out, PI up).
 * @typedef {{x:number,y:number,tilt:number,sx:number,sy:number,ringRot:number,antenna:number,armL:{a1:number,a2:number},armR:{a1:number,a2:number},legL:{a1:number,a2:number},legR:{a1:number,a2:number}}} Pose
 */
/** @returns {Pose} the rest pose (arms hang, legs straight). */
export function restPose() {
  return { x: 0, y: 0, tilt: 0, sx: 1, sy: 1, ringRot: 0, antenna: 0, armL: { a1: 0.32, a2: 0.12, front: 0 }, armR: { a1: 0.32, a2: 0.12, front: 0 }, legL: { a1: 0.05, a2: -0.05 }, legR: { a1: 0.05, a2: -0.05 } };
}
/** Merge overrides onto the rest pose (one level deep for the limbs). @param {object} [o] @returns {Pose} */
export function pose(o = {}) { const p = restPose(); for (const [k, v] of Object.entries(o)) p[k] = v && typeof v === 'object' ? { ...p[k], ...v } : v; return p; }
/** An arm entry for a pose that reaches a body-space target with IK and draws in front of the body (hand on chin, hands on hips). */
const reach = (side, target) => { const r = armIK(side, target); return { a1: r.a1, a2: r.a2, front: 1 }; };
/** The pose library: 12 named poses. Each is a Pose. Add more by calling pose({...}). */
export const POSES = {
  idle: pose(),
  wave: pose({ tilt: 0.04, armR: { a1: 2.35, a2: 2.9 }, armL: { a1: 0.3, a2: 0.1 } }),
  cheer: pose({ y: -0.04, armL: { a1: 2.7, a2: 2.95 }, armR: { a1: 2.7, a2: 2.95 }, sy: 1.04, sx: 0.98 }),
  point: pose({ tilt: -0.05, armR: { a1: 1.55, a2: 1.5 }, armL: { a1: 0.5, a2: 0.15 } }),
  shrug: pose({ y: 0.02, armL: { a1: 1.0, a2: 1.7 }, armR: { a1: 1.0, a2: 1.7 }, sy: 0.98, sx: 1.015 }),
  think: pose({ tilt: 0.06, armR: reach('R', [0.42, 0.5]), armL: { a1: 0.5, a2: 0.15 } }),
  hips: pose({ armL: reach('L', [-0.66, 0.74]), armR: reach('R', [0.66, 0.74]) }),
  crouch: pose({ y: 0.2, sy: 0.84, sx: 1.08, armL: { a1: 0.55, a2: 0.3 }, armR: { a1: 0.55, a2: 0.3 } }),
  tall: pose({ y: -0.06, sy: 1.08, sx: 0.95, armL: { a1: 0.1, a2: 0.0 }, armR: { a1: 0.1, a2: 0.0 } }),
  lean: pose({ tilt: 0.16, armL: { a1: 0.9, a2: 0.6 }, armR: { a1: 0.1, a2: 0.0 } }),
  surprise: pose({ y: -0.1, tilt: -0.03, sy: 1.05, sx: 0.97, armL: { a1: 1.2, a2: 1.6 }, armR: { a1: 1.2, a2: 1.6 } }),
  slump: pose({ y: 0.12, tilt: 0.05, sy: 0.93, sx: 1.04, armL: { a1: 0.05, a2: 0.0 }, armR: { a1: 0.05, a2: 0.0 } }),
};
/**
 * Blend two poses: numbers lerp, limbs lerp field by field. k may leave 0..1 (an eased k from outBack overshoots, which gives follow-through for free).
 * @param {Pose} a @param {Pose} b @param {number} k @returns {Pose}
 */
export function blendPoses(a, b, k) {
  const out = {};
  for (const key of Object.keys(a)) out[key] = typeof a[key] === 'object' ? Object.fromEntries(Object.keys(a[key]).map(f => [f, lerp(a[key][f], b[key][f], k)])) : lerp(a[key], b[key], k);
  return out;
}
/**
 * Pose over time from keys [[t, poseOrName, easeName?], ...]. The ease belongs to the segment ARRIVING at that key ('outBack' overshoots into the pose).
 * Before the first key the first pose holds; after the last the last holds. @param {Array<[number,Pose|string,string?]>} keys @returns {(t:number)=>Pose}
 */
export function poseTrack(keys) {
  const P_ = k => structuredClone(typeof k === 'string' ? POSES[k] : k); // a copy, so callers can add offsets without editing the library
  return t => {
    if (t <= keys[0][0]) return P_(keys[0][1]);
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, p0] = keys[i - 1], [t1, p1, e] = keys[i], ease = E[e || 'inOutCubic'] || E.inOutCubic; return blendPoses(P_(p0), P_(p1), ease(prog(t, t0, t1))); }
    return P_(keys[keys.length - 1][1]);
  };
}
/** Write a Pose into a t4.1 rig record (joints from FK, body offsets copied). Extra overrides (face, hide...) go in `extra`. @param {Pose} p @param {object} [extra] */
export function poseToRig(p, extra = {}) {
  return makeRig({ x: p.x, y: p.y, tilt: p.tilt, sx: p.sx, sy: p.sy, ringRot: p.ringRot, antenna: p.antenna,
    armL: { j: armJoints('L', p.armL.a1, p.armL.a2), front: p.armL.front > 0.5 }, armR: { j: armJoints('R', p.armR.a1, p.armR.a2), front: p.armR.front > 0.5 }, legL: { j: legJoints('L', p.legL.a1, p.legL.a2) }, legR: { j: legJoints('R', p.legR.a1, p.legR.a2) }, ...extra });
}

// ------------------------------------------------------------------ cycles
/** Ring rotation that matches ground travel: roll without sliding on the root circle, times `ratio` (0.5 = a gentle, readable roll). dist in units. */
export const rollRot = (dist, ratio = 0.5) => (dist / SPEC.ringRoot) * ratio;
/**
 * Walk (waddle) cycle. phase 0..1 is one full step pair. Left foot is in stance for phase 0-0.5 (flat on the floor, sliding back under the body at exactly
 * body speed), swing for 0.5-1 (lifts `lift` units). The right foot is half a cycle behind. The body sinks `crouch`, bobs, and waddles (tilt).
 * Speed of the body that keeps the feet from sliding: speed = 2 * stride / period (units per second), exported as walkSpeed().
 * @param {number} phase @param {{stride?:number,lift?:number,crouch?:number,bob?:number,waddle?:number,swing?:number}} [o] @returns {Pose}
 */
export function walkPose(phase, { stride = 0.5, lift = 0.16, crouch = 0.125, bob = 0.035, waddle = 0.07, swing = 0.5 } = {}) {
  const ph = ((phase % 1) + 1) % 1, foot = f => {                       // f = this foot's own phase 0..1; returns [x offset, lift]
    if (f < 0.5) return [stride / 2 - stride * (f / 0.5), 0];                       // stance: moves back at body speed
    const s = (f - 0.5) / 0.5; return [-stride / 2 + stride * E.inOutSine(s), lift * Math.sin(Math.PI * s)];  // swing
  };
  const fl = foot(ph), fr = foot((ph + 0.5) % 1), y = crouch - bob * Math.abs(Math.sin(TAU * ph)), tilt = waddle * Math.sin(TAU * ph);
  const L = legIK('L', [-SPEC.hip[0] + fl[0], GROUND_ANKLE - fl[1]], [0, y], tilt), R = legIK('R', [SPEC.hip[0] + fr[0], GROUND_ANKLE - fr[1]], [0, y], tilt);
  const sw = swing * Math.sin(TAU * ph);                                // arms swing against the legs
  return pose({ y, tilt, sy: 1 - 0.012 * Math.cos(TAU * ph * 2), legL: { a1: L.a1, a2: L.a2 }, legR: { a1: R.a1, a2: R.a2 }, armL: { a1: 0.4 + 0.45 * sw, a2: 0.15 + 0.25 * Math.max(0, sw) }, armR: { a1: 0.4 - 0.45 * sw, a2: 0.15 + 0.25 * Math.max(0, -sw) }, antenna: -0.25 * Math.cos(TAU * ph) });
}
/** Body speed (units per second) that matches walkPose with the same stride and period (seconds per full cycle). */
export const walkSpeed = (stride, period) => (2 * stride) / period;
/** World x (units, relative to where the body started) of a walking foot: body distance + the foot's offset. Constant during stance. 'L' or 'R'. */
export function walkFootWorldX(side, phase, dist, stride = 0.5) {
  const ph = ((phase % 1) + 1) % 1, f = side === 'L' ? ph : (ph + 0.5) % 1;
  const off = f < 0.5 ? stride / 2 - stride * (f / 0.5) : -stride / 2 + stride * E.inOutSine((f - 0.5) / 0.5);
  return dist + off;
}
/**
 * One hop. phase 0..1: 0-0.22 anticipation (sink, squash, arms back), 0.22-0.32 launch (stretch, arms up), 0.32-0.72 flight (parabola, feet tuck, ring spins),
 * 0.72-0.82 land (squash), 0.82-1 settle (spring back). Feet are pinned to the floor whenever the body is low enough to reach it.
 * @param {number} phase @param {{height?:number,crouch?:number}} [o] @returns {Pose}
 */
export function hopPose(phase, { height = 0.85, crouch = 0.2 } = {}) {
  const p = clamp(phase), tr = (a, b, e = 'inOutCubic') => E[e](prog(p, a, b));
  let y = 0, sy = 1, sx = 1, arm = 0.32, arm2 = 0.12, tuck = 0, spin = 0;
  const sink = tr(0, 0.22, 'outCubic');
  if (p < 0.22) { y = crouch * sink; sy = 1 - 0.16 * sink; sx = 1 + 0.08 * sink; arm = 0.32 + 0.3 * sink; arm2 = 0.12 + 0.2 * sink; }
  else if (p < 0.32) { const k = tr(0.22, 0.32, 'outCubic'); y = lerp(crouch, 0, k); sy = lerp(0.84, 1.14, k); sx = lerp(1.08, 0.93, k); arm = lerp(0.62, 2.5, k); arm2 = lerp(0.32, 2.8, k); }
  else if (p < 0.72) { const u = prog(p, 0.32, 0.72); y = -height * 4 * u * (1 - u); sy = lerp(1.14, 1.0, E.outCubic(Math.min(1, u * 2))); sx = 1 / sy; arm = 2.5 - 0.5 * u; arm2 = 2.8 - 0.4 * u; tuck = Math.sin(Math.PI * clamp(u * 1.15)); spin = u; }
  else if (p < 0.82) { const k = tr(0.72, 0.82, 'outCubic'); y = crouch * 0.75 * k; sy = lerp(1, 0.86, k); sx = lerp(1, 1.07, k); arm = lerp(2.0, 0.5, k); arm2 = lerp(2.4, 0.3, k); spin = 1; }
  else { const k = prog(p, 0.82, 1), s = 1 - Math.exp(-6 * k) * Math.cos(11 * k); y = crouch * 0.75 * (1 - s); sy = lerp(0.86, 1, s); sx = lerp(1.07, 1, s); arm = lerp(0.5, 0.32, s); arm2 = lerp(0.3, 0.12, s); spin = 1; }
  const L = legIK('L', [-SPEC.hip[0], Math.min(GROUND_ANKLE, SPEC.hip[1] + y + (SPEC.thigh + SPEC.shin) * (1 - 0.42 * tuck))], [0, y], 0);
  const R = legIK('R', [SPEC.hip[0], Math.min(GROUND_ANKLE, SPEC.hip[1] + y + (SPEC.thigh + SPEC.shin) * (1 - 0.42 * tuck))], [0, y], 0);
  return pose({ y, sy, sx, ringRot: TAU / SPEC.teeth * 2 * E.inOutCubic(spin), antenna: 0.45 * Math.sin(TAU * 1.5 * p) * (1 - p), legL: { a1: L.a1, a2: L.a2 }, legR: { a1: R.a1, a2: R.a2 }, armL: { a1: arm, a2: arm2 }, armR: { a1: arm, a2: arm2 } });
}

// ------------------------------------------------------------------ overlay
/**
 * Draw the skeleton over Cog: bones as cyan lines, joints as dots, the body centre as a crosshair. Call after drawMascot with the same rig and x, y, u.
 * @param {*} ctx @param {object} rig @param {{x:number,y:number,u:number,alpha?:number}} o
 */
export function drawSkeleton(ctx, rig, { x, y, u, alpha = 1 }) {
  ctx.save(); ctx.globalAlpha *= alpha; rigSpace(ctx, rig, { x, y, u });
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const a of [rig.armL, rig.armR, rig.legL, rig.legR]) {
    ctx.strokeStyle = rgba(P.ink, 0.9); ctx.lineWidth = 7 / u; ctx.beginPath(); a.j.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    ctx.strokeStyle = P.cyan; ctx.lineWidth = 3.5 / u; ctx.stroke();
    a.j.forEach((p, i) => { ctx.fillStyle = i === 1 ? P.orange : P.white; ctx.strokeStyle = P.ink; ctx.lineWidth = 2 / u; ctx.beginPath(); ctx.arc(p[0], p[1], (i === 1 ? 9 : 7) / u, 0, TAU); ctx.fill(); ctx.stroke(); });
  }
  ctx.strokeStyle = P.cyan; ctx.lineWidth = 3 / u; ctx.beginPath(); ctx.moveTo(-0.1, 0); ctx.lineTo(0.1, 0); ctx.moveTo(0, -0.1); ctx.lineTo(0, 0.1); ctx.stroke();
  ctx.setLineDash([6 / u, 6 / u]); ctx.beginPath(); ctx.arc(0, 0, SPEC.ringRoot, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}
export { GROUND_ANKLE, drawTube, fk };
