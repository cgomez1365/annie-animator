// t4.4 demo: Cog says the BGI slogan. The voice track (a real Kokoro file, analysed offline, NOT in the video) drives the mouth. Shows the loudness bars, the syllables the aligner found,
// the word being said, and the mouth shape in use out of the 11 visemes.
import { P, begin, end, hook, E, prog, lerp, rgba, setFont, glow, roundRect, noise1 } from '../../engine/index.mjs';
import { drawMascot, makeRig, SPEC } from '../t4_1_vector-mascot-design/module.mjs';
import { SKINNED, poseTrack, poseToRig, POSES } from '../t4_2_2d-rigging/module.mjs';
import { applyFace, applyBlink, blinkAmount, blinkTimes, faceFor } from '../t4_3_expressions-and-acting/module.mjs';
import { analyzeAudio, envAt, makeMouthTrack, drawEnvelope, VISEMES, VISEME_NAMES } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 1.0 };
const VO = '/Users/cris/Desktop/Reports/Agents/VP_AEON/2026-10-27/Assets_Icons_Media/TikTok_Demos/voiceover/tracks/tt1_kinetic_cog_vo.wav';
const TEXT = 'Be the cog in the machine. Tools that work for you. AEON. Agents with their own memory. A Local only switch. Blocks you buy once. AEON, by Broken Gear Industries.';
const A = analyzeAudio(VO), M = makeMouthTrack(A, TEXT);
const CLOSER = 4.4, U = 200, CX = 540, GY = 1470, BY = GY - SPEC.ground * U;
const HEAD = { tIn: 0.1, tOut: 4.25, l1: 'Sound in.', l2: 'Mouth shapes out.', c2: P.green, b1: 446, b2: 514, px: 56 };
const PHRASES = [{ words: ['Be', 'the', 'cog', 'in', 'the', 'machine.'], from: 0, to: 2.1, s0: 0 }, { words: ['Tools', 'that', 'work', 'for', 'you.'], from: 2.1, to: 4.3, s0: 7 }];
// word timings from the aligned syllables: a word starts at its first syllable (minus a little) and ends at its last
const WORDS = (() => { const byWord = new Map(); for (const s of M.aligned) { const w = byWord.get(s.word) || { t0: s.t - 0.1, t1: s.t + s.dur / 2, text: s.wordText }; w.t1 = Math.max(w.t1, s.t + s.dur / 2); byWord.set(s.word, w); } return [...byWord.values()]; })();
const BLINKS = blinkTimes(3, 0.5, 8);
const POSE = poseTrack([[0, 'idle'], [0.75, 'idle'], [1.0, 'shrug', 'outBack'], [1.45, 'idle', 'outCubic'], [2.9, 'idle'], [3.15, 'point', 'outBack'], [3.9, 'idle', 'outCubic']]);

function rigAt(t) {
  const pz = POSE(t), env = envAt(A, t + 0.05);
  pz.tilt += 0.03 * Math.sin(t * 2.1) + 0.02 * noise1(t * 1.3, 2); pz.y -= 0.018 * env; pz.sy *= 1 + 0.012 * Math.sin(t * 3.1);
  pz.antenna = 0.25 * noise1(t * 1.1, 4) + 0.15 * Math.sin(t * 2.3) + 0.25 * env;
  const rig = poseToRig(pz); rig.shadow = 1;
  applyFace(rig, faceFor('happy', 0.6)); rig.browL.y = rig.browR.y = -0.03 - 0.04 * env;
  for (const k of ['eyeL', 'eyeR']) { rig[k].lx = 0.05 * Math.sin(t * 1.7); rig[k].ly = 0.04; }
  applyBlink(rig, blinkAmount(t, BLINKS));
  rig.mouth = { ...rig.mouth, ...M.mouthAt(t) };
  return rig;
}
function strip(ctx, t) {
  const a = E.outCubic(prog(t, 0.2, 0.55)) * (1 - prog(t, CLOSER - 0.1, CLOSER + 0.2)); if (a <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = P.panel; roundRect(ctx, 90, 590, 900, 170, 26).fill(); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; roundRect(ctx, 91, 591, 898, 168, 25).stroke();
  ctx.save(); ctx.beginPath(); ctx.roundRect(100, 596, 880, 160, 20); ctx.clip();
  drawEnvelope(ctx, A, t, { x: 120, y: 612, w: 840, h: 110, span: 2.2, color: P.cyan, marks: M.aligned.map(s => s.t) });
  ctx.restore(); ctx.fillStyle = P.white; ctx.fillRect(540 - 1.5, 600, 3, 150); ctx.restore();
}
function karaoke(ctx, t) {
  for (const ph of PHRASES) {
    const a = E.outCubic(prog(t, ph.from, ph.from + 0.25)) * (1 - prog(t, ph.to - 0.15, ph.to)); if (a <= 0.01) continue;
    setFont(ctx, 'inter', 56, 700); const gap = 18, ws = ph.words.map(w => ctx.measureText(w).width); const tot = ws.reduce((x, y) => x + y, 0) + gap * (ws.length - 1); let x = CX - tot / 2;
    ctx.save(); ctx.globalAlpha *= a; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ph.words.forEach((w, i) => { const wd = WORDS.find(q => q.text === w && q.t0 > ph.from - 0.4 && q.t0 < ph.to + 0.2) || WORDS[ph.s0 === 0 ? i : 6 + i], now = t >= wd.t0 && t < wd.t1 + 0.04, done = t >= wd.t1 + 0.04; ctx.fillStyle = now ? P.green : done ? P.white : P.muted; ctx.fillText(w, x, 840 - (now ? 5 : 0)); x += ws[i] + gap; });
    ctx.restore();
  }
}
function visemeRow(ctx, t) {
  const a = E.outCubic(prog(t, 0.4, 0.8)) * (1 - prog(t, CLOSER - 0.1, CLOSER + 0.2)); if (a <= 0.01) return;
  const cur = M.visemeAt(t).v, x0 = 150, dx = 76, y = 1548;
  ctx.save(); ctx.globalAlpha *= a;
  VISEME_NAMES.forEach((n, i) => {
    const x = x0 + i * dx, on = n === cur || (cur === 'rest' && n === 'rest'), s = on ? 1.12 : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = on ? rgba(P.green, 0.22) : P.panel; ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = on ? P.green : 'rgba(255,255,255,0.12)'; ctx.lineWidth = on ? 4 : 2; ctx.stroke(); ctx.restore();
    drawMascot(ctx, makeRig({ mouth: VISEMES[n], shadow: 0, hide: ['legL', 'legR', 'armL', 'armR', 'antenna', 'ring', 'bolts', 'plate', 'eyeL', 'eyeR', 'browL', 'browR', 'cheeks'] }), { x, y: y - SPEC.mouthY * 118 * s, u: 118 * s });
  });
  ctx.restore();
}
export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HEAD, t);
  const outA = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3), inA = E.outCubic(prog(t, 0.05, 0.3));
  if (outA > 0.001) {
    ctx.save(); ctx.globalAlpha *= outA;
    strip(ctx, t); karaoke(ctx, t);
    ctx.save(); ctx.globalAlpha *= inA; ctx.strokeStyle = rgba(P.green, 0.45); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(90, GY); ctx.lineTo(990, GY); ctx.stroke();
    drawMascot(ctx, rigAt(t), { x: CX, y: BY, u: U, limb: SKINNED }); ctx.restore();
    visemeRow(ctx, t);
    ctx.restore();
  }
  const ck = E.outBack(prog(t, CLOSER + 0.9, CLOSER + 1.4), 1.8);
  end(ctx, t, { closerAt: CLOSER });
  if (ck > 0.01) {
    const rg = poseToRig(POSES.wave); applyFace(rg, faceFor('joy', 0.9)); rg.antenna = 0.3 * Math.sin(t * 3); applyBlink(rg, blinkAmount(t, [CLOSER + 2.4]));
    drawMascot(ctx, rg, { x: 540, y: 1418, u: 92 * ck, limb: SKINNED });
  }
  return cv;
}
