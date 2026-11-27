#!/usr/bin/env node
// t5.2 test: unit checks, tempo/phase/onsets measured on synthetic clicks and on the three beds (arbitrary start offsets),
// render the demo, run the engine's quality checker, mux bed A into out/demo_av.mp4 and prove the cuts sit on audible beats in that file.
// Exit 0 only if everything passes. (The engine's runSkillTest demands a silent demo and exits itself, so the steps run by hand; see ../t5_ENGINE_REQUESTS.md.)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderCard } from '../../engine/render.mjs';
import { qcCard } from '../../engine/qc.mjs';
import { BEDS, analyzeTrack, onsetEnvelope, estimateTempo, pickOnsets, beatGrid, snapToBeat, snapCuts, beatPhase, beatIndex, beatPulse, beatBounce, beatStep, swingTime, coverage } from './module.mjs';

const DIR = import.meta.dirname, out = path.join(DIR, 'out'), preview = process.env.ANNIE_PREVIEW === '1';
let pass = 0, fail = 0; const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); console.log('FAIL', m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m}: got ${a}, want ${b} (+-${tol})`);
fs.mkdirSync(out, { recursive: true });
const metrics = { beds: {} };
const FFMPEG = process.env.ANNIE_FFMPEG || '/Users/cris/Desktop/AEON-wt-deps/node_modules/ffmpeg-static/ffmpeg';
try {
  console.log('-- unit checks');
  const g = { bpm: 120, phase: 0.1 };   // beat = 0.5 s
  const gr = beatGrid(120, 0.1, 2.2); ok(gr.length === 5 && Math.abs(gr[1] - 0.6) < 1e-9 && Math.abs(gr.at(-1) - 2.1) < 1e-9, 'beatGrid');
  near(snapToBeat(0.74, g), 0.6, 1e-9, 'snapToBeat nearest'); near(snapToBeat(0.86, g), 1.1, 1e-9, 'snapToBeat up'); near(snapToBeat(0.74, g, { every: 2 }), 1.1, 1e-9, 'snapToBeat every 2 (beats 1,3,5...)'); near(snapToBeat(0.74, g, { every: 2, offset: 1 }), 0.6, 1e-9, 'snapToBeat every 2 offset 1');
  near(snapToBeat(2.9, g, { every: 4 }), 2.1, 1e-9, 'snapToBeat bar lines');
  const sc = snapCuts([0.74, 0.8, 3.0, 5.3], g, { maxShift: 0.2, minGap: 0.4 });
  near(sc[0].t, 0.6, 1e-9, 'snapCuts moves a near cut'); ok(sc[1].t >= sc[0].t + 0.4 - 1e-9, 'snapCuts keeps the minimum gap'); ok(sc.every((c, i) => i === 0 || c.t > sc[i - 1].t), 'snapCuts keeps order'); ok(sc[3].snapped === false || Math.abs(sc[3].moved) <= 0.2, 'snapCuts leaves a far cut alone');
  const far = snapCuts([0.85], { bpm: 60, phase: 0 }, { every: 2, maxShift: 0.1 }); ok(far[0].t === 0.85 && !far[0].snapped, 'snapCuts leaves a cut that is farther than maxShift');
  near(beatPhase(0.35, g), 0.5, 1e-9, 'beatPhase mid-beat'); ok(beatIndex(0.59, g) === 0 && beatIndex(0.61, g) === 1 && beatIndex(0.05, g) === -1, 'beatIndex');
  near(beatPulse(0.6, g), 1, 1e-9, 'beatPulse is 1 on the beat'); ok(beatPulse(0.85, g) < 0.3 && beatPulse(0.65, g) < beatPulse(0.62, g) && beatPulse(0.62, g) < 1, 'beatPulse decays after the beat');
  ok(beatPulse(0.6 - 0.03, g) > 0.4 && beatPulse(0.6 - 0.03, g) < 1 && beatPulse(0.6 - 0.2, g) < 0.25, 'beatPulse rises in the last 60 ms before the beat');
  let cont = 0; for (let t = 0.1; t < 2; t += 0.001) cont = Math.max(cont, Math.abs(beatPulse(t + 0.001, g) - beatPulse(t, g))); ok(cont < 0.1, `beatPulse has no jumps (max step ${cont.toFixed(3)} per ms)`);
  near(beatBounce(0.6, g), 0, 1e-9, 'beatBounce lands on the beat'); near(beatBounce(0.85, g), 1, 1e-9, 'beatBounce peaks mid-beat');
  ok(beatStep(0.1, g, 8) === 0 && beatStep(0.6, g, 8) === 1 && beatStep(0.1 + 8 * 0.5, g, 8) === 0 && beatStep(0.0, g, 8) === 7, 'beatStep counts and wraps');
  near(swingTime(1, { bpm: 100, phase: 0 }, 1 / 6), 0.6 * 2 / 3, 1e-9, 'swingTime triplet off-beat at 2/3 of the beat'); near(swingTime(2, { bpm: 100, phase: 0 }, 0), 0.6, 1e-9, 'swingTime on-beat slot');

  console.log('-- measured on synthetic click tracks (exact ground truth)');
  const sr = 22050, click = (bpm, ph, dur) => { const pcm = new Float32Array(sr * dur), b = 60 / bpm; for (let t = ph; t < dur - 0.05; t += b) { const i0 = Math.round(t * sr); for (let k = 0; k < 400 && i0 + k < pcm.length; k++) pcm[i0 + k] += Math.sin(2 * Math.PI * 1500 * k / sr) * Math.exp(-k / 80) * 0.8; } return pcm; };
  metrics.clicks = [];
  for (const [bpm, ph] of [[120, 0.2], [90, 0.13], [140, 0.31]]) {
    const oe = onsetEnvelope(click(bpm, ph, 12), sr), te = estimateTempo(oe), pe = Math.abs(te.phase - ph); const err = Math.min(pe, Math.abs(pe - te.beat));
    near(te.bpm, bpm, 0.3, `click track ${bpm} BPM`); ok(err < 0.015, `click track ${bpm} BPM phase within 15 ms (got ${(te.phase * 1000).toFixed(0)} ms, want ${(ph * 1000).toFixed(0)} ms)`);
    const cov = coverage(beatGrid(bpm, ph, 11.8), pickOnsets(oe), 0.02); ok(cov.share >= 0.95 && Math.abs(cov.meanOffset) < 0.006, `click onsets found within 20 ms (share ${cov.share.toFixed(2)}, offset ${(cov.meanOffset * 1000).toFixed(1)} ms)`);
    metrics.clicks.push({ bpm, phaseWantMs: ph * 1000, bpmGot: te.bpm, phaseErrMs: +(err * 1000).toFixed(1), onsetOffsetMs: +(cov.meanOffset * 1000).toFixed(1) });
  }

  console.log('-- measured on the three music beds (16 s excerpts, three start offsets each)');
  for (const [name, bed] of Object.entries(BEDS)) {
    const beat = 60 / bed.bpm, rows = [];
    for (const skip of [0, 0.37, 1.9]) {
      const a = analyzeTrack(path.join(DIR, 'fixtures', name + '.wav'), { from: skip }), want = (((-skip) % beat) + beat) % beat;
      let pe = Math.abs(a.phase - want); pe = Math.min(pe, Math.abs(pe - beat)); const half = Math.abs(pe - beat / 2);
      const cov = coverage(beatGrid(bed.bpm, want, a.dur - 0.1), a.onsets, 0.04);
      near(a.bpm, bed.bpm, 0.3, `${name} skip ${skip}: tempo`); ok(a.confidence > 3, `${name} skip ${skip}: confidence ${a.confidence.toFixed(1)} > 3`);
      if (name === 'E_bossa_nova') ok(pe < 0.03 || half < 0.03, `${name} skip ${skip}: phase right or exactly half a beat off (known ambiguity)`); else ok(pe < 0.025, `${name} skip ${skip}: phase within 25 ms (got ${(pe * 1000).toFixed(0)} ms)`);
      ok(cov.share >= (name === 'E_bossa_nova' ? 0.7 : 0.9), `${name} skip ${skip}: ${(cov.share * 100).toFixed(0)}% of true beats have an onset within 40 ms`); ok(Math.abs(cov.meanOffset) < 0.01, `${name} skip ${skip}: onset offset ${(cov.meanOffset * 1000).toFixed(1)} ms under 10`);
      rows.push({ skip, bpm: a.bpm, phaseErrMs: +(pe * 1000).toFixed(1), halfBeatOff: half < 0.03, beatCoverage: +cov.share.toFixed(2), onsetOffsetMs: +(cov.meanOffset * 1000).toFixed(1) });
    }
    metrics.beds[name] = rows; console.log(' ', name, rows.map(r => `${r.bpm} BPM, phase err ${r.phaseErrMs} ms${r.halfBeatOff ? ' (HALF BEAT OFF)' : ''}, cover ${r.beatCoverage}`).join(' | '));
  }

  console.log(`-- render demo (${preview ? '540x960 preview' : '1080x1920'})`);
  const card = path.join(DIR, 'demo.mjs');
  const r = await renderCard(card, { out, name: 'demo', preview });
  fs.copyFileSync(path.join(out, 'demo_contact.png'), path.join(out, 'contact.png')); fs.rmSync(path.join(out, 'demo_contact.png'), { force: true });
  ok(r.seconds >= 5 && r.seconds <= 8, `demo lasts ${r.seconds} s`); ok(!r.audioStream, 'card video is silent'); ok(r.width === (preview ? 540 : 1080), 'width');
  console.log('-- quality checker');
  const q = await qcCard(card, { out, video: preview ? undefined : path.join(out, 'demo.mp4') });
  for (const i of q.issues) console.log(`  ${i.level.toUpperCase()} ${i.rule}: ${i.detail}`);
  ok(q.pass, `quality checker: ${q.issues.filter(i => i.level === 'fail').map(i => i.rule).join('; ')}`);

  console.log('-- mux bed A and measure cut-vs-beat in the finished file');
  const demo = await import('./demo.mjs'); await demo.init(); const D = demo._detected();
  const av = path.join(out, 'demo_av.mp4');
  const m = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', path.join(out, 'demo.mp4'), '-i', path.join(DIR, demo.AUDIO), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', av]); ok(m.status === 0, 'mux ' + m.stderr);
  const a = analyzeTrack(av, { to: 7.7 }), grid = beatGrid(a.bpm, a.phase, 7.7), errs = D.CUTS.map(c => Math.min(...grid.map(b => Math.abs(b - c.t))) * 1000);
  const hit = D.CUTS.map(c => coverage([c.t], a.onsets, 0.04).hit);
  console.log('  mp4 audio: %s BPM, phase %s ms; cuts at %s s; distance to the nearest beat found in the mp4: %s ms; cut has an onset within 40 ms: %s', a.bpm, (a.phase * 1000).toFixed(0), D.CUTS.map(c => c.t.toFixed(3)).join(', '), errs.map(e => e.toFixed(0)).join(', '), hit.join(''));
  near(a.bpm, 108, 0.3, 'tempo heard in demo_av.mp4'); ok(D.CUTS.every(c => c.snapped), 'every demo cut was snapped'); ok(errs.every(e => e <= 30), `every cut within 30 ms of a beat heard in the finished mp4 (worst ${Math.max(...errs).toFixed(0)} ms)`);
  ok(hit.every(Boolean), 'every cut lands on a detected onset (kick) within 40 ms');
  metrics.demo = { bpm: a.bpm, cuts: D.CUTS.map(c => ({ raw: c.raw, snapped: +c.t.toFixed(3), moved: +c.moved.toFixed(3) })), cutToBeatMs: errs.map(e => +e.toFixed(1)) };
  fs.writeFileSync(path.join(out, 'test_result.json'), JSON.stringify({ pass: fail === 0, checksPassed: pass, checksFailed: fail, failures, demoSeconds: r.seconds, preview, framesHash: r.framesHash, qcWarnings: q.warns, metrics }, null, 1));
} catch (e) { fail++; failures.push(e.stack || e.message); console.log('ERROR', e.stack || e.message); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
