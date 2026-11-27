#!/usr/bin/env node
// t4.1 test: geometry, silhouette, palette, brand-mark guard, part independence, determinism; then render the demo and run the quality checker.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/index.mjs';
import { rng } from '../../engine/rng.mjs';
import { SPEC, PARTS, PART_CENTER, gearPoints, makeRig, validateRig, drawMascot, mouthGeometry, fk, armJoints, legJoints, revealParts } from './module.mjs';

const here = import.meta.dirname;
const MARK_SHA = 'a0c531490c142e22361019a4b9217009f4dc97a4ee1bddbd67a66b55d26cb9e3'; // engine/mark_paths.mjs as of 2026-11-19: the official BGI mark, never altered
const render = (rig, o = {}, w = 520, h = 700) => { const cv = createCanvas(w, h), c = cv.getContext('2d'); drawMascot(c, rig, { x: w / 2, y: 290, u: 100, ...o }); return { cv, c, d: c.getImageData(0, 0, w, h).data }; };
const sha = b => crypto.createHash('sha1').update(b).digest('hex');

await runSkillTest({ dir: here, checks: ({ ok, near, section }) => {
  section('gear geometry');
  const pts = gearPoints(), pitch = pts.length / SPEC.teeth, rad = p => Math.hypot(p[0], p[1]);
  ok(Number.isInteger(pitch), 'steps divide evenly by teeth');
  let maxDiff = 0; for (let i = 0; i < pts.length - pitch; i++) maxDiff = Math.max(maxDiff, Math.abs(rad(pts[i]) - rad(pts[i + pitch])));
  ok(maxDiff < 1e-9, `outline repeats every tooth (max diff ${maxDiff})`);
  ok(Math.min(...pts.map(rad)) >= SPEC.ringRoot - 1e-9 && Math.max(...pts.map(rad)) <= SPEC.ringOuter + 1e-9, 'radius stays between root and tip');
  const tooth = (SPEC.ringOuter - SPEC.ringRoot) / SPEC.ringOuter; ok(tooth > 0.12 && tooth < 0.24, `tooth height ${(tooth * 100).toFixed(0)} percent of radius is in the 12-24 percent style range`);
  const top = pts.filter(p => rad(p) > SPEC.ringOuter - 0.005).length / pts.length, root = pts.filter(p => rad(p) < SPEC.ringRoot + 0.005).length / pts.length;
  ok(top > 0.2 && top < 0.5 && root > 0.2 && root < 0.5, `tooth tops ${(top * 100).toFixed(0)} percent and gaps ${(root * 100).toFixed(0)} percent of the circumference are both chunky (20-50 percent)`);
  ok(SPEC.plate < SPEC.ringRoot - 0.12, 'face plate leaves a ring of body between plate and tooth root');
  ok(Math.hypot(SPEC.eyeX + SPEC.eyeRx, SPEC.eyeRy) < SPEC.plate - 0.05, 'eyes sit inside the plate');
  ok(Math.hypot(SPEC.cheekX + 0.12, SPEC.cheekY) < SPEC.plate, 'cheeks sit inside the plate');
  const u = 230; ok(SPEC.eyeRy * u >= 40 && SPEC.browW * u >= 10 && SPEC.boltSize * u >= 9 && SPEC.armW[1] * u >= 26 && SPEC.legW[1] * u >= 26, 'smallest features are big enough at hero size (eye 40 px, brow 10 px, bolt 9 px, limbs 26 px)');

  section('silhouette');
  const sil = render(makeRig(), { silhouette: P_WHITE() }), W = 520, H = 700; let mism = 0, filled = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) { const a = sil.d[(y * W + x) * 4 + 3], b = sil.d[(y * W + (W - 1 - x)) * 4 + 3]; if (a > 128) filled++; if ((a > 128) !== (b > 128)) mism++; }
  ok(filled > 12000, `silhouette has body (${filled} px per half)`); ok(mism / filled < 0.01, `default pose is left-right symmetric (${mism} mismatched px, ${(100 * mism / filled).toFixed(2)} percent)`);
  const ring = render(makeRig({ hide: PARTS.filter(p => p !== 'ring') }), {}, 520, 700); let tr = 0, prev = null; const rr = 0.905 * 100;
  for (let i = 0; i < 720; i++) { const a = i / 720 * Math.PI * 2, x = Math.round(260 + Math.sin(a) * rr), y = Math.round(290 - Math.cos(a) * rr), on = ring.d[(y * 520 + x) * 4 + 3] > 128; if (prev !== null && on !== prev) tr++; prev = on; }
  ok(tr === SPEC.teeth * 2 || tr === SPEC.teeth * 2 - 1 || tr === SPEC.teeth * 2 + 1, `reading the ring at mid-tooth radius finds ${SPEC.teeth} teeth (${tr} edges)`);

  section('palette and brand mark');
  const src = fs.readFileSync(`${here}/module.mjs`, 'utf8');
  ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), 'module.mjs contains no hex colour: every colour comes from the BGI palette or a mix of two palette colours');
  ok(!/mark_paths|drawMark|D_BROKEN|D_FULL/.test(src), 'module.mjs never touches the BGI mark');
  ok(sha256(fs.readFileSync(`${here}/../../engine/mark_paths.mjs`)) === MARK_SHA, 'engine/mark_paths.mjs (the official mark) is byte-identical to the pinned copy');

  section('rig record');
  const r0 = makeRig(); ok(PARTS.every(p => p in PART_CENTER), 'every part has a pivot in PART_CENTER');
  ok(makeRig({ mouth: { open: 0.5 } }).mouth.smile === 0.55 && makeRig({ mouth: { open: 0.5 } }).mouth.open === 0.5, 'makeRig merges one level deep');
  const bad = validateRig(makeRig({ eyeL: { open: 4, lx: 9 }, mouth: { smile: -5, w: 0 }, browR: { y: -2 } }));
  ok(bad.eyeL.open === 1 && bad.eyeL.lx === 1 && bad.mouth.smile === -1 && bad.mouth.w === 0.6 && bad.browR.y === -0.12, 'validateRig clamps out-of-range values');
  const a0 = armJoints('R', 0.3, 0.1), a1 = armJoints('L', 0.3, 0.1);
  near(Math.hypot(a0[1][0] - a0[0][0], a0[1][1] - a0[0][1]), SPEC.upperArm, 1e-9, 'fk keeps the upper arm length'); near(Math.hypot(a0[2][0] - a0[1][0], a0[2][1] - a0[1][1]), SPEC.foreArm, 1e-9, 'fk keeps the forearm length');
  near(a0[2][0], -a1[2][0], 1e-9, 'left arm mirrors right'); near(a0[2][1], a1[2][1], 1e-9, 'mirror keeps y');
  const up = fk([0, 0], [1], [Math.PI]); near(up[1][1], -1, 1e-9, 'angle PI points straight up'); near(fk([0, 0], [1], [0])[1][1], 1, 1e-9, 'angle 0 points down');
  const lg = legJoints('R'); ok(Math.abs(lg[2][1] + 0.0 - (SPEC.hip[1] + SPEC.thigh + SPEC.shin)) < 0.01, 'rest legs reach the ground line (within 0.01 unit)');
  ok(lg[2][1] + 0.055 + 0.108 <= SPEC.ground + 1e-6, 'shoe sole stays above the ground line');
  const m0 = mouthGeometry({ w: 1, open: 0, smile: 0.5, round: 0 }), m1 = mouthGeometry({ w: 1, open: 1, smile: 0.5, round: 0 }), m2 = mouthGeometry({ w: 1, open: 1, smile: 0, round: 1 });
  ok(m0.gap === 0 && m1.gap > 0.15, 'mouth gap follows open'); ok(m2.hw < m1.hw, 'round narrows the mouth'); ok([...m1.top, ...m1.bot].every(Number.isFinite), 'mouth control points are finite');
  const mu = mouthGeometry({ w: 1, open: 0, smile: 1, round: 0 }), mf = mouthGeometry({ w: 1, open: 0, smile: -1, round: 0 }); ok(mu.cornerY < mf.cornerY, 'smile lifts the corners above the frown');
  const rv = revealParts(makeRig(), 0.5, { eyeL: [1, 1.5] }); ok(rv.hide.includes('eyeL'), 'reveal hides a part before its start');
  const rm = revealParts(makeRig(), 1.3, { eyeL: [1, 1.5] }), re = revealParts(makeRig(), 2, { eyeL: [1, 1.5] }); ok(rm.explode.eyeL.s > 1.01, `reveal overshoots mid-pop (s ${rm.explode.eyeL.s.toFixed(3)})`); near(re.explode.eyeL.s, 1, 1e-9, 'reveal ends at scale 1');

  section('parts are independent handles');
  const full = render(r0).d;
  for (const p of PARTS) { const h = render(makeRig({ hide: [p] })).d; let diff = 0; for (let i = 0; i < h.length; i += 4) if (Math.abs(h[i] - full[i]) + Math.abs(h[i + 1] - full[i + 1]) + Math.abs(h[i + 2] - full[i + 2]) > 14) diff++; ok(diff > 30, `hiding ${p} changes the picture (${diff} px)`); }
  const sh = render(makeRig({ shadow: 0 })).d; let sd = 0; for (let i = 3; i < sh.length; i += 4) if (Math.abs(sh[i] - full[i]) > 3) sd++; ok(sd > 200, `rig.shadow draws a ground shadow (${sd} px)`);

  section('random rigs render clean and deterministically');
  const r = rng(4101);
  for (let n = 0; n < 12; n++) {
    const rg = () => makeRig({ tilt: r.range(-0.3, 0.3), sx: r.range(0.85, 1.2), sy: r.range(0.85, 1.2), ringRot: r.range(0, 6), antenna: r.range(-1, 1), eyeL: { open: r.range(0, 1), lx: r.range(-1, 1), ly: r.range(-1, 1), tilt: r.range(-0.5, 0.5), lower: r.range(0, 1) }, eyeR: { open: r.range(0, 1), tilt: r.range(-0.5, 0.5) },
      browL: { y: r.range(-0.1, 0.1), tilt: r.range(-0.5, 0.5) }, mouth: { w: r.range(0.7, 1.3), open: r.range(0, 1), smile: r.range(-1, 1), round: r.range(0, 1), tongue: r.range(0, 1), teeth: r.range(0, 1) }, armL: { j: armJoints('L', r.range(0, 3), r.range(0, 3)) }, y: -r.range(0, 0.6) });
    const s1 = r.int(1, 1e6); const a = rg(), b = JSON.parse(JSON.stringify(a)); validateRig(a); validateRig(b);
    const ha = sha(render(a).cv.toBuffer('image/png')), hb = sha(render(b).cv.toBuffer('image/png'));
    ok(ha === hb, `random rig ${n} renders identically twice`); void s1;
  }
} });
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function P_WHITE() { return '#f8fafc'; }
