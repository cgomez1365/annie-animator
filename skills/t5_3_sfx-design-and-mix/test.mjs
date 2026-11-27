#!/usr/bin/env node
// t5.3 test: the seven effects measured (length, level, pitch, envelope), the loudness meter checked against a known sine, the demo mix measured
// (LUFS, true peak, stems, ducking by A/B, effect timing), envelope plots written, the card rendered and QC'd, the mix muxed and its A/V offset and loudness measured in the mp4.
// Exit 0 only if everything passes. (The engine's runSkillTest demands a silent demo and exits itself, so the steps run by hand; see ../t5_ENGINE_REQUESTS.md.)
import fs from 'node:fs';
import path from 'node:path';
import { renderCard } from '../../engine/render.mjs';
import { qcCard } from '../../engine/qc.mjs';
import { SFX, SR, GATES, synthSfx, writeWav, decodeAudio, rmsDb, windowDb, peakDb, dominantHz, centroidHz, spectrum, onsetTime, measureLoudness, checkGates, mixAudio, muxAudio, lintSfx, plotEnvelopes } from './module.mjs';
import { demoSpec, buildDemoAudio, writeMixData } from './demo_audio.mjs';

const DIR = import.meta.dirname, out = path.join(DIR, 'out'), preview = process.env.ANNIE_PREVIEW === '1';
let pass = 0, fail = 0; const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); console.log('FAIL', m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m}: got ${(+a).toFixed(3)}, want ${b} (+-${tol})`);
fs.mkdirSync(out, { recursive: true });
const metrics = { sfx: {} };
try {
  console.log('-- the seven effects (synthesized, measured)');
  const lanes = [], names = Object.keys(SFX);
  for (const n of names) {
    const a = synthSfx(n), b = synthSfx(n), m = SFX[n];
    ok(a.length === b.length && a.every((v, i) => v === b[i]), `${n}: identical on every call`); ok(a.every(Number.isFinite), `${n}: no NaN`);
    near(a.length / SR, m.dur, 0.01, `${n}: length`); near(peakDb(a), -3, 0.2, `${n}: peak dBFS`); ok(Math.abs(a[0]) < 0.005 && Math.abs(a.at(-1)) < 0.005, `${n}: starts and ends at silence (no click)`);
    const dc = a.reduce((s, v) => s + v, 0) / a.length; ok(Math.abs(dc) < 0.01, `${n}: no DC offset (${dc.toFixed(4)})`);
    metrics.sfx[n] = { dur: +(a.length / SR).toFixed(3), peakDb: +peakDb(a).toFixed(2) };
    lanes.push({ name: n, db: rmsDb(a, SR, 0.005), hop: 0.005, color: n === 'wrong' ? '#ef4444' : n === 'stamp' ? '#f59e0b' : n === 'success' ? '#19e08f' : '#22d3ee' });
  }
  const S = Object.fromEntries(names.map(n => [n, synthSfx(n)]));
  const nearAny = (f, list, tol) => list.some(x => Math.abs(f - x) <= tol);
  near(dominantHz(S.chime, SR, 0.0, 0.3), 880, 8, 'chime pitch (A5)'); near(dominantHz(S.tick, SR, 0.0, 0.04), 2100, 60, 'tick pitch');
  near(dominantHz(S.stamp, SR, 0.0, 0.12, [20, 300]), 68, 8, 'stamp thump'); ok(nearAny(dominantHz(S.wrong, SR, 0.0, 0.3), [196, 207], 8), 'wrong pitch (196/207 Hz)');
  { const sp = spectrum(S.wrong, SR, 0, 0.3), at = f => Math.max(...Array.from(sp.hz).map((h, k) => Math.abs(h - f) < 4 ? sp.mag[k] : 0)), mx = Math.max(...sp.mag); ok(at(196) > 0.3 * mx && at(207) > 0.3 * mx, 'wrong: both 196 and 207 Hz present (the soft beat)'); }
  near(dominantHz(S.success, SR, 0.0, 0.12), 523.25, 12, 'success first note (C5)'); near(dominantHz(S.success, SR, 0.25, 0.45), 783.99, 15, 'success second note (G5)');
  ok(dominantHz(S.pop, SR, 0.05, 0.11) > dominantHz(S.pop, SR, 0.0, 0.03) + 80, 'pop rises in pitch');
  ok(centroidHz(S.whoosh, SR, 0.1, 0.2) < centroidHz(S.whoosh, SR, 0.3, 0.5) && centroidHz(S.whoosh, SR, 0.3, 0.5) > 800, 'whoosh brightens toward the middle');
  { const e = rmsDb(S.whoosh, SR, 0.02), pk = e.indexOf(Math.max(...e)) * 0.02; ok(pk > 0.3 && pk < 0.5, `whoosh envelope peaks mid-sound (${pk.toFixed(2)} s)`); }
  ok(windowDb(S.chime, SR, 0.8, 1.0) < windowDb(S.chime, SR, 0.0, 0.2) - 12, 'chime decays at least 12 dB'); ok(windowDb(S.stamp, SR, 0.3, 0.5) < windowDb(S.stamp, SR, 0, 0.1) - 25, 'stamp decays at least 25 dB');
  plotEnvelopes(lanes, path.join(out, 'sfx_envelopes.png'), { width: 1200, laneH: 70, floor: -60, title: 'the seven effects: level (dBFS) over time, same time scale' });
  ok(fs.statSync(path.join(out, 'sfx_envelopes.png')).size > 5000, 'effect envelope plot written');

  console.log('-- the meter, checked against a known sine');
  { const n = SR * 3, a = new Float32Array(n), b = new Float32Array(n); for (let i = 0; i < n; i++) { a[i] = 0.1 * Math.sin(2 * Math.PI * 997 * i / SR); b[i] = 0.5 * Math.sin(2 * Math.PI * 997 * i / SR); }
    writeWav(path.join(out, '_sine_a.wav'), a); writeWav(path.join(out, '_sine_b.wav'), b); const ma = measureLoudness(path.join(out, '_sine_a.wav')), mb = measureLoudness(path.join(out, '_sine_b.wav'));
    near(ma.lufs, -23.0, 0.3, '997 Hz sine at -20 dBFS reads -23.0 LUFS'); near(mb.truePeak, -6.02, 0.3, 'sine peak 0.5 reads -6.02 dBTP'); fs.rmSync(path.join(out, '_sine_a.wav')); fs.rmSync(path.join(out, '_sine_b.wav')); }
  ok(!checkGates({ lufs: -12, truePeak: -0.2 }).pass && checkGates({ lufs: -16, truePeak: -2 }).pass && !checkGates({ lufs: -20, truePeak: -2 }).pass, 'checkGates fails what it should');

  console.log('-- lint');
  ok(lintSfx([{ name: 'pop', t: 1 }, { name: 'pop', t: 1.05 }], 5).length === 1, 'lint: two pops within 0.12 s'); ok(lintSfx([{ name: 'pop', t: 1 }, { name: 'tick', t: 1.04 }, { name: 'chime', t: 1.08 }, { name: 'tick', t: 1.1 }], 5).length >= 1, 'lint: more than 3 within 0.15 s');
  ok(lintSfx([{ name: 'pop', t: 6 }, { name: 'zap', t: 1 }], 5).length === 2, 'lint: out of range and unknown effect'); ok(lintSfx([{ name: 'pop', t: 1 }, { name: 'pop', t: 1.3 }, { name: 'tick', t: 1.31 }], 5).length === 0, 'lint: a clean list passes');

  console.log('-- the demo mix, measured');
  const { spec, cues } = demoSpec(); ok(lintSfx(spec.sfx, spec.total).length === 0, 'demo effect list passes the lint');
  const R = buildDemoAudio(out), mixD = decodeAudio(R.mix), vD = decodeAudio(R.stems.voice), fD = decodeAudio(R.stems.fx), mD = decodeAudio(R.stems.music);
  const lv = measureLoudness(R.stems.voice), lm = measureLoudness(R.stems.music);
  console.log('  mix %s LUFS, true peak %s dBTP, LRA %s | voice stem %s LUFS | music stem %s LUFS | fx stem peak %s dBFS | scale %s dB', R.loudness.lufs, R.loudness.truePeak, R.loudness.lra, lv.lufs, lm.lufs, peakDb(fD.pcm).toFixed(1), R.gainDb.toFixed(2));
  near(R.loudness.lufs, GATES.target, 0.5, 'mix integrated loudness near -16 LUFS'); ok(checkGates(R.loudness).pass, 'mix passes the loudness gates ' + checkGates(R.loudness).failures.join('; ')); ok(R.loudness.truePeak <= -1, 'true peak at or below -1 dBTP');
  near(mixD.dur, spec.total, 0.05, 'mix length'); near(lv.lufs, -16, 1.0, 'voice stem near -16 LUFS'); ok(lm.lufs < lv.lufs - 12, `music sits at least 12 LU under the voice (${(lv.lufs - lm.lufs).toFixed(1)} LU)`);
  ok(peakDb(fD.pcm) < peakDb(vD.pcm) - 6 && peakDb(fD.pcm) > -30, 'effects are quieter than the voice (peak 6+ dB lower) but audible');
  // effect timing, each effect mixed alone at 0.30 s so nothing else can hide its start (whoosh and chime rise too softly for a 10% threshold: 5% and a looser window)
  const timing = [];
  for (const n of names) { const one = mixAudio({ total: 1.2, sfx: [{ name: n, t: 0.3 }] }, path.join(out, '_one')), d = decodeAudio(one.stems.fx), soft = n === 'whoosh' || n === 'chime'; const o = onsetTime(d.pcm, d.sr, 0.27, soft ? 0.03 : 0.1, 0.4); timing.push({ name: n, ms: Math.round((o - 0.3) * 1000) }); }
  for (const f of fs.readdirSync(out).filter(f => f.startsWith('_one'))) fs.rmSync(path.join(out, f), { recursive: true, force: true });
  console.log('  effect onset - requested time, mixed alone (ms):', timing.map(t => `${t.name} ${t.ms}`).join(', '));
  ok(timing.every(t => (t.name === 'whoosh' || t.name === 'chime') ? t.ms >= -5 && t.ms <= 120 : t.ms >= -5 && t.ms <= 15), 'every effect starts where the mix puts it (within 15 ms; whoosh and chime within 120 ms)');
  // ducking by A/B: same mix with and without the sidechain
  const nd = mixAudio({ ...spec, music: { ...spec.music, duck: false } }, path.join(out, '_nd')), ndM = decodeAudio(nd.stems.music);
  const speech = [[0.8, 1.4], [1.7, 2.3], [3.0, 3.8]], red = speech.map(([a, b]) => windowDb(ndM.pcm, ndM.sr, a, b) - windowDb(mD.pcm, mD.sr, a, b)), rec = windowDb(ndM.pcm, ndM.sr, 4.5, 4.75) - windowDb(mD.pcm, mD.sr, 4.5, 4.75);
  console.log('  bed reduction while she speaks: %s dB; 0.25-0.5 s after her last word: %s dB', red.map(v => v.toFixed(1)).join(', '), rec.toFixed(1));
  ok(red.every(v => v >= 3 && v <= 9), 'ducking takes the bed down 3-9 dB under the voice'); ok(Math.abs(rec) < 1.5, 'the bed is back within 1.5 dB half a second after the voice');
  metrics.mix = { lufs: R.loudness.lufs, truePeak: R.loudness.truePeak, lra: R.loudness.lra, voiceStemLufs: lv.lufs, musicStemLufs: lm.lufs, fxPeakDb: +peakDb(fD.pcm).toFixed(1), duckingDb: red.map(v => +v.toFixed(1)), recoveryDb: +rec.toFixed(1), effectOnsetMs: timing };
  for (const f of fs.readdirSync(out).filter(f => f.startsWith('_nd'))) fs.rmSync(path.join(out, f), { recursive: true, force: true });
  const lane = (n, a, c) => ({ name: n, db: rmsDb(a.pcm, a.sr, 0.02), hop: 0.02, color: c });
  plotEnvelopes([lane('voice', vD, '#19e08f'), lane('effects', fD, '#f59e0b'), lane('music (ducked)', mD, '#22d3ee'), lane('music (no duck)', ndM, '#475569'), lane('mix', mixD, '#f8fafc')], path.join(out, 'mix_envelopes.png'),
    { width: 1400, laneH: 100, floor: -60, title: `demo mix: ${R.loudness.lufs} LUFS, true peak ${R.loudness.truePeak} dBTP`, marks: cues.map(c => ({ t: c.t, label: c.name })) });
  ok(fs.statSync(path.join(out, 'mix_envelopes.png')).size > 8000, 'mix envelope plot written');
  writeMixData(out, { ...R, cues });

  console.log(`-- render demo (${preview ? '540x960 preview' : '1080x1920'})`);
  const card = path.join(DIR, 'demo.mjs'), r = await renderCard(card, { out, name: 'demo', preview });
  fs.copyFileSync(path.join(out, 'demo_contact.png'), path.join(out, 'contact.png')); fs.rmSync(path.join(out, 'demo_contact.png'), { force: true });
  ok(r.seconds >= 5 && r.seconds <= 8, `demo lasts ${r.seconds} s`); ok(!r.audioStream, 'card video is silent'); ok(r.width === (preview ? 540 : 1080), 'width');
  console.log('-- quality checker');
  const q = await qcCard(card, { out, video: preview ? undefined : path.join(out, 'demo.mp4') });
  for (const i of q.issues) console.log(`  ${i.level.toUpperCase()} ${i.rule}: ${i.detail}`);
  ok(q.pass, `quality checker: ${q.issues.filter(i => i.level === 'fail').map(i => i.rule).join('; ')}`);

  console.log('-- mux and measure the finished file');
  const av = path.join(out, 'demo_av.mp4'); muxAudio(path.join(out, 'demo.mp4'), R.mix, av);
  const lmp4 = measureLoudness(av), A = decodeAudio(av);
  console.log('  demo_av.mp4: %s LUFS, true peak %s dBTP, audio %s s', lmp4.lufs, lmp4.truePeak, A.dur.toFixed(2));
  ok(checkGates(lmp4).pass, 'demo_av.mp4 passes the loudness gates after AAC ' + checkGates(lmp4).failures.join('; ')); near(A.dur, r.seconds, 0.12, 'audio length matches the video');
  // offset between the mix wav and the audio inside the mp4: best lag of the 5 ms envelopes
  { const e1 = rmsDb(mixD.pcm, mixD.sr, 0.005), e2 = rmsDb(A.pcm, A.sr, 0.005); let best = -1e9, bl = 0; for (let L = -24; L <= 24; L++) { let s = 0; for (let i = 30; i < e1.length - 30; i++) s += e1[i] * (e2[i + L] ?? -90); if (s > best) { best = s; bl = L; } } metrics.avOffsetMs = -bl * 5 === 0 ? 0 : bl * 5; ok(Math.abs(bl * 5) <= 30, `audio inside the mp4 is within 30 ms of the mix (lag ${bl * 5} ms)`); }
  metrics.mp4 = { lufs: lmp4.lufs, truePeak: lmp4.truePeak };
  fs.writeFileSync(path.join(out, 'test_result.json'), JSON.stringify({ pass: fail === 0, checksPassed: pass, checksFailed: fail, failures, demoSeconds: r.seconds, preview, framesHash: r.framesHash, qcWarnings: q.warns, metrics }, null, 1));
} catch (e) { fail++; failures.push(e.stack || e.message); console.log('ERROR', e.stack || e.message); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
