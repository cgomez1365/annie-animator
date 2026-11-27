#!/usr/bin/env node
// t4.3 test: emotion presets, readability, blink statistics, eye darts, staggered beats, anticipation; then render the demo and run the quality checker.
import crypto from 'node:crypto';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/index.mjs';
import { makeRig, drawMascot } from '../t4_1_vector-mascot-design/module.mjs';
import { EMOTIONS, face, faceFor, blendFace, validateFace, applyFace, readFace, blinkTimes, blinkAmount, applyBlink, gaze, gazeShiftTimes, headFollow, actFace, actBody, checkBeats, windUp } from './module.mjs';
import { BEATS as DEMO_BEATS } from './demo.mjs';

const shot = f => { const cv = createCanvas(260, 260), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 260, 260); drawMascot(c, applyFace(makeRig({ shadow: 0, hide: ['legL', 'legR', 'armL', 'armR', 'antenna'] }), f), { x: 130, y: 135, u: 120 }); return c.getImageData(0, 0, 260, 260).data; };
const flat = f => { const o = []; const walk = v => { if (typeof v === 'number') o.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); }; walk(f); return o; };
const maxDelta = (a, b) => Math.max(...flat(a).map((v, i) => Math.abs(v - flat(b)[i])));

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near, section }) => {
  section('presets');
  const names = Object.keys(EMOTIONS); ok(names.length === 12, `${names.length} emotions`);
  for (const n of names) { const before = JSON.stringify(EMOTIONS[n]), v = validateFace(JSON.parse(before)); ok(JSON.stringify(v) === before, `${n}: every value is inside the art's safe range`); }
  near(maxDelta(faceFor('joy', 0), EMOTIONS.neutral), 0, 1e-12, 'intensity 0 is neutral'); near(maxDelta(faceFor('joy', 1), EMOTIONS.joy), 0, 1e-9, 'intensity 1 is the preset');
  ok(faceFor('surprise', 1.3).browL.y <= EMOTIONS.surprise.browL.y + 1e-9, 'intensity 1.3 exaggerates (brows higher)');
  near(maxDelta(blendFace(EMOTIONS.sad, EMOTIONS.joy, 0), EMOTIONS.sad), 0, 1e-12, 'blendFace k=0'); near(maxDelta(blendFace(EMOTIONS.sad, EMOTIONS.joy, 1), EMOTIONS.joy), 0, 1e-12, 'blendFace k=1');
  const R = Object.fromEntries(names.map(n => [n, readFace(EMOTIONS[n])]));
  ok(R.happy.valence > 0.3 && R.joy.valence > 0.5 && R.joy.arousal > 0.3, 'happy and joy read as pleasant, joy charged');
  ok(R.sad.valence < -0.3 && R.sad.arousal < 0.3, 'sad reads as unpleasant and calm'); ok(R.angry.valence < -0.3 && R.angry.arousal > 0.3, 'angry reads as unpleasant and charged');
  ok(R.surprise.arousal > 0.6, 'surprise is high arousal'); ok(R.scared.valence < -0.3 && R.scared.arousal > 0.6, 'scared is unpleasant and very charged');
  ok(R.sleepy.arousal < -0.5, 'sleepy is low arousal'); ok(R.smug.valence > 0.3 && R.smug.arousal < 0, 'smug is pleasant and relaxed');
  ok(Math.abs(R.neutral.valence) < 0.35 && Math.abs(R.neutral.arousal) < 0.35, 'neutral is near the centre'); ok(R.confused.valence < 0 && R.determined.arousal > 0 && Math.abs(R.think.valence) < 0.3, 'confused, determined and think sit where expected');
  // every pair of emotions looks different in pixels
  const shots = Object.fromEntries(names.map(n => [n, shot(faceFor(n))])); let minD = 1e9, minPair = '';
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const a = shots[names[i]], b = shots[names[j]]; let d = 0; for (let p = 0; p < a.length; p += 4) d += Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]); d /= (a.length / 4); if (d < minD) { minD = d; minPair = `${names[i]}/${names[j]}`; } }
  ok(minD > 1.6, `every pair of faces differs in pixels (closest pair ${minPair}: ${minD.toFixed(2)} mean levels per pixel)`);

  section('blinks');
  const bt = blinkTimes(11, 0, 300), bt2 = blinkTimes(11, 0, 300); ok(JSON.stringify(bt) === JSON.stringify(bt2), 'blink schedule is deterministic'); ok(JSON.stringify(blinkTimes(12, 0, 300)) !== JSON.stringify(bt), 'a different seed gives a different schedule');
  const gaps = bt.slice(1).map((t, i) => t - bt[i]), singles = gaps.filter(g => g > 0.5), doubles = gaps.filter(g => g < 0.5);
  ok(singles.every(g => g >= 2.2 - 0.29 && g <= 5.0 + 0.29), `gaps between blink groups stay 2.2-5.0 s (min ${Math.min(...singles).toFixed(2)}, max ${Math.max(...singles).toFixed(2)})`);
  const mean = singles.reduce((a, b) => a + b, 0) / singles.length; ok(mean > 3 && mean < 4.4, `mean gap ${mean.toFixed(2)} s is the natural 3-4 s`);
  const df = doubles.length / (doubles.length + singles.length); ok(df > 0.05 && df < 0.3, `double blinks are ${(df * 100).toFixed(0)} percent of blink groups (target 15)`); ok(doubles.every(g => Math.abs(g - 0.28) < 1e-9), 'doubles are 0.28 s apart');
  const one = [1.0]; let nz = 0, closeT = null, openT = null, prev = 0;
  for (let i = 0; i <= 3000; i++) { const t = 0.99 + i / 5000, a = blinkAmount(t, one); if (a > 0) nz++; if (closeT === null && a >= 0.999) closeT = t - 1.0; if (a >= 0.999) openT = t; prev = a; } void prev;
  const endT = (() => { for (let i = 0; i <= 3000; i++) { const t = 1 + i / 5000; if (t > 1.1 && blinkAmount(t, one) === 0) return t - 1; } return NaN; })();
  near(closeT, 0.06, 0.003, 'eyes shut 0.06 s after the blink starts'); near(endT - (openT - 1), 0.11, 0.003, 'eyes take 0.11 s to open again'); ok(0.06 < 0.11, 'closing is faster than opening'); near(endT, 0.2, 0.004, 'a blink lasts 0.2 s');
  for (const off of [0, 0.01, 0.02, 0.03]) { let mx = 0, frames = 0; for (let f = 0; f < 12; f++) { const a = blinkAmount(1 + off + f / 30, one); if (a > 0) frames++; mx = Math.max(mx, a); } ok(frames <= 7 && mx >= 0.9, `at 30 fps (offset ${off}) a blink covers ${frames} frames and reaches ${mx.toFixed(2)}`); }
  let shut = 0, N = 30000; for (let i = 0; i < N; i++) if (blinkAmount(i / 100, bt) > 0.5) shut++; ok(shut / N < 0.06, `eyes are mostly open: closed past halfway only ${(100 * shut / N).toFixed(1)} percent of the time`);
  const rg = applyBlink(applyFace(makeRig(), faceFor('angry')), 1); ok(rg.eyeL.open === 0 && Math.abs(rg.eyeL.tilt - EMOTIONS.angry.eyeL.tilt) < 1e-12, 'a blink keeps the eye tilt'); ok(applyBlink(applyFace(makeRig(), faceFor('sleepy')), 0.1).eyeR.open <= 0.28 + 1e-9, 'a blink never opens eyes more than the emotion allows');

  section('gaze');
  const keys = [[0, 0, 0], [1, 0.9, -0.2], [2, -0.5, 0.6]], g = gaze(keys);
  near(g(0.5).lx, 0, 0.05, 'eyes hold before the first dart'); near(g(1.2).lx, 0.9, 0.05, 'eyes arrive at the first target'); near(g(2.3).ly, 0.6, 0.05, 'eyes arrive at the second target');
  ok(g(1.08).lx > 0.9 * 0.9 - 0.05, 'a dart is 90 percent complete in 0.08 s (a saccade, not a drift)'); ok(g(1.0).lx < 0.1, 'a dart starts at its key time');
  let sd = []; for (let i = 0; i < 100; i++) sd.push(g(1.2 + i * 0.0075).lx); const sm = sd.reduce((a, b) => a + b) / 100, sdv = Math.sqrt(sd.reduce((a, b) => a + (b - sm) ** 2, 0) / 100); ok(sdv > 0.003 && sdv < 0.03, `eyes are never dead during a hold (drift sd ${sdv.toFixed(4)})`);
  ok(JSON.stringify(g(1.234)) === JSON.stringify(gaze(keys)(1.234)), 'gaze is pure'); ok(gazeShiftTimes(keys).length === 2 && gazeShiftTimes([[0, 0, 0], [1, 0.2, 0.1]]).length === 0, 'gazeShiftTimes finds only large looks');
  const cross = (fn, half) => { for (let i = 0; i < 600; i++) { const tt = 0.95 + i / 1000; if (Math.abs(fn(tt)) >= half) return tt; } return NaN; }; const tg = cross(g2 => g(g2).lx, 0.45), th = cross(tt => headFollow(g, tt), 0.5 * Math.abs(headFollow(g, 1.45))); ok(th > tg + 0.08 && th < tg + 0.2 && Math.abs(headFollow(g, 1.45)) < 0.1, `the head trails the eyes by ${(th - tg).toFixed(2)} s and leans only ${Math.abs(headFollow(g, 1.45)).toFixed(3)} rad`);

  section('acting beats');
  ok(checkBeats(DEMO_BEATS).length === 0, 'the demo beats pass checkBeats'); ok(checkBeats([{ t: 1, emo: 'sad' }, { t: 1.1, emo: 'joy' }]).length > 0, 'beats too close together are flagged'); ok(checkBeats([{ t: 1, emo: 'nope' }]).length > 0, 'unknown emotion is flagged');
  const beats = [{ t: 1, emo: 'sad', dur: 0.2, ease: 'outCubic' }, { t: 2.5, emo: 'surprise', dur: 0.16, ease: 'outBack', anticipate: 0.15, pop: 0.2 }];
  near(maxDelta(actFace(0, beats), EMOTIONS.neutral), 0, 1e-9, 'before the first beat the face is neutral'); near(maxDelta(actFace(1.6, beats), EMOTIONS.sad), 0, 1e-6, 'after dur + delays the face is the emotion');
  const at = t => actFace(t, beats), fr = (a, b) => (a.eyeL.open - EMOTIONS.neutral.eyeL.open) / (EMOTIONS.sad.eyeL.open - EMOTIONS.neutral.eyeL.open);
  const kEye = t => (at(t).eyeL.open - 1) / (EMOTIONS.sad.eyeL.open - 1), kBrow = t => (at(t).browL.tilt - 0) / (EMOTIONS.sad.browL.tilt - 0), kMouth = t => (at(t).mouth.smile - 0.25) / (EMOTIONS.sad.mouth.smile - 0.25); void fr;
  ok(kEye(1.1) > kBrow(1.1) && kBrow(1.1) > kMouth(1.1) && kMouth(1.1) > 0, `parts break in order: eyes ${kEye(1.1).toFixed(2)} > brows ${kBrow(1.1).toFixed(2)} > mouth ${kMouth(1.1).toFixed(2)} at 0.1 s`);
  ok(at(2.45).eyeL.open < EMOTIONS.sad.eyeL.open - 0.02 && at(2.45).browL.y > EMOTIONS.sad.browL.y - 0.001, 'anticipation: eyes narrow before the reaction'); ok(maxDelta(at(2.4999), at(2.5001)) < 0.01, 'no jump where the wind-up hands over to the reaction');
  let mx = 0, os = 0; for (let i = 0; i <= 600; i++) { const t = i / 120 + 0.5, a = at(t), b = at(t + 1 / 120); mx = Math.max(mx, maxDelta(a, b)); os = Math.max(os, a.eyeL.size); } ok(mx < 0.25, `no jump cuts: the largest change of any value in 1/120 s is ${mx.toFixed(3)} (a cut would be 0.8 or more)`);
  ok(os > 1.2 + 0.005, `outBack overshoots: eye size peaks at ${os.toFixed(3)} before settling at 1.2`); near(at(4).eyeL.size, 1.2, 1e-6, 'and settles');
  const body = t => actBody(t, beats); ok(body(2.45).y > 0.01 && body(2.45).sy < -0.01, 'body squats during the wind-up'); let peak = 0; for (let i = 0; i < 100; i++) peak = Math.min(peak, body(2.5 + i / 200).y); ok(peak < -0.2 * 0.5, `the reaction hops (peak ${peak.toFixed(3)} units up)`); ok(Math.abs(body(4).y) < 0.01 && Math.abs(body(0).y) < 1e-12, 'body offsets die away');
  const wu = windUp(EMOTIONS.joy); ok(wu.eyeL.open < EMOTIONS.joy.eyeL.open && wu.mouth.open < EMOTIONS.joy.mouth.open && wu.mouth.smile < EMOTIONS.joy.mouth.smile, 'the wind-up face is narrower and calmer than the face it winds up from');
  const f1 = face({ m: { smile: 1 } }); ok(f1.eyeL.open === 1 && f1.mouth.smile === 1 && f1.eyeL !== f1.eyeR, 'face() builds independent eyes');
  section('rendering');
  const h = f => crypto.createHash('sha1').update(Buffer.from(shot(f))).digest('hex'); ok(names.every(n => h(faceFor(n)) === h(faceFor(n))), 'all 12 emotions render identically twice');
} });
