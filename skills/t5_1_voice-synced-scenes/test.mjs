#!/usr/bin/env node
// t5.1 test: unit checks, measured checks against real Kokoro clips, render the demo, run the engine's quality checker,
// mux the voice into out/demo_av.mp4 and prove the audio in that file lines up with the cue times. Exit 0 only if everything passes.
// (The engine's runSkillTest demands a silent demo and exits itself, so this test runs the same steps by hand; see ../t5_ENGINE_REQUESTS.md.)
import fs from 'node:fs';
import path from 'node:path';
import { renderCard } from '../../engine/render.mjs';
import { qcCard } from '../../engine/qc.mjs';
import { decodeAudio, envelope, analyzeClip, alignWords, alignByChars, parseWords, pauseErrors, syllables, buildTimeline, cue, wordAt, activeItem, muxVoice } from './module.mjs';

const DIR = import.meta.dirname, out = path.join(DIR, 'out'), preview = process.env.ANNIE_PREVIEW === '1';
let pass = 0, fail = 0; const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); console.log('FAIL', m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m}: got ${a}, want ${b} (+-${tol})`);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
fs.mkdirSync(out, { recursive: true });
const metrics = {};
try {
  console.log('-- unit checks');
  ok(syllables('artificial') >= 4 && syllables('intelligence') >= 4 && syllables('the') === 1 && syllables('made') === 1, 'syllables');
  const pw = parseWords('Take the sentence: the capital, France.'); ok(pw.length === 6 && pw[2].pause > 0 && pw[4].pause > 0 && pw[5].punct === '.', 'parseWords punctuation');
  const L = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/lesson.json'), 'utf8')).rows;
  const tl = buildTimeline(L, { pre: 0.6, gap: 0.45 });
  near(tl.sentences[0].start, 0.6, 1e-9, 'first sentence starts after PRE'); near(tl.sentences[1].start, 0.6 + L[0].dur + 0.45, 1e-9, 'second sentence = PRE + dur + GAP');
  ok(tl.sentences.every(s => s.words.every((w, i) => w.e > w.s && (i === 0 || w.s >= s.words[i - 1].e - 1e-9))), 'words are ordered and do not overlap');
  ok(tl.sentences.every(s => s.words[0].s >= s.start && s.words.at(-1).e <= s.end), 'words stay inside their sentence');
  near(cue(tl, 7, 'Paris', { lead: 0 }), tl.sentences[7].words[0].s, 1e-9, 'cue returns the word start'); near(cue(tl, 7, 'Paris') , tl.sentences[7].words[0].s - 0.12, 1e-9, 'default lead is 0.12 s');
  let threw = false; try { cue(tl, 7, 'zebra'); } catch { threw = true; } ok(threw, 'cue throws for a word that is not in the sentence');
  ok(cue(tl, 7, 'words') > cue(tl, 7, 'Most'), 'cue finds later words'); ok(cue(tl, 1) === tl.sentences[1].start, 'cue(k) = start of sentence');
  const w3 = tl.sentences[3].words[3]; ok(wordAt(tl, (w3.s + w3.e) / 2)?.word.w === w3.w, 'wordAt finds the spoken word'); ok(wordAt(tl, 0.1) === null, 'wordAt is null before the voice');
  ok(activeItem([1, 2, 3], 0.5) === -1 && activeItem([1, 2, 3], 2.5) === 1, 'activeItem');

  console.log('-- measured against real Kokoro (Heart) clips');
  const edge = { chars: [], text: [] }, pe = { chars: [], text: [], audio: [] }, lead = [], tail = [];
  for (const r of L) {
    const d = decodeAudio(path.join(DIR, r.file)), c = analyzeClip(envelope(d.pcm, d.sr));
    lead.push(c.start); tail.push(d.dur - c.end);
    const wa = alignWords(r.text, d.dur, c), wt = alignWords(r.text, d.dur), wc = alignByChars(r.text, d.dur);
    ok(Math.abs(wa[0].s - c.start) < 0.011 && Math.abs(wa.at(-1).e - c.end) < 0.011, `audio mode spans the measured speech (sentence ${r.i})`);
    ok(wa.every((w, i) => w.e > w.s && (i === 0 || w.s >= wa[i - 1].e - 1e-9)), `audio mode words ordered (sentence ${r.i})`);
    edge.chars.push(Math.abs(wc[0].s - c.start), Math.abs(wc.at(-1).e - c.end)); edge.text.push(Math.abs(wt[0].s - c.start), Math.abs(wt.at(-1).e - c.end));
    pe.chars.push(...pauseErrors(wc, c, r.text)); pe.text.push(...pauseErrors(wt, c, r.text)); pe.audio.push(...pauseErrors(wa, c, r.text));
  }
  metrics.leadSilence = [Math.min(...lead), Math.max(...lead)]; metrics.tailSilence = [Math.min(...tail), Math.max(...tail)];
  metrics.edgeErrorChars = mean(edge.chars); metrics.edgeErrorText = mean(edge.text);
  metrics.pauseErrorChars = mean(pe.chars); metrics.pauseErrorText = mean(pe.text); metrics.pauseErrorAudio = mean(pe.audio); metrics.pausesScored = pe.text.length;
  console.log('  Kokoro lead silence %s s, tail silence %s s', metrics.leadSilence.map(x => x.toFixed(2)).join('-'), metrics.tailSilence.map(x => x.toFixed(2)).join('-'));
  console.log('  speech start/end error (mean s): char-share baseline %s, text-only %s', metrics.edgeErrorChars.toFixed(3), metrics.edgeErrorText.toFixed(3));
  console.log('  comma/full-stop boundary error (mean s, %d pauses): baseline %s, text-only %s, with audio %s', metrics.pausesScored, metrics.pauseErrorChars.toFixed(3), metrics.pauseErrorText.toFixed(3), metrics.pauseErrorAudio.toFixed(3));
  ok(metrics.edgeErrorText < 0.06 && metrics.edgeErrorText < metrics.edgeErrorChars / 4, 'text-only mode finds the speech start and end at least 4x closer than the char-share baseline');
  ok(metrics.pauseErrorText <= metrics.pauseErrorChars, 'text-only mode puts commas and full stops no farther from the real gaps than the baseline');
  ok(metrics.pauseErrorAudio < 0.005, 'audio mode puts every comma and full stop inside its measured gap');
  ok(metrics.pausesScored >= 12, 'enough pauses scored to mean something');

  console.log(`-- render demo (${preview ? '540x960 preview' : '1080x1920'})`);
  const card = path.join(DIR, 'demo.mjs');
  const r = await renderCard(card, { out, name: 'demo', preview });
  fs.copyFileSync(path.join(out, 'demo_contact.png'), path.join(out, 'contact.png')); fs.rmSync(path.join(out, 'demo_contact.png'), { force: true });
  ok(r.seconds >= 5 && r.seconds <= 8, `demo lasts ${r.seconds} s`); ok(!r.audioStream, 'card video is silent'); ok(r.width === (preview ? 540 : 1080), 'width');
  console.log('-- quality checker');
  const q = await qcCard(card, { out, video: preview ? undefined : path.join(out, 'demo.mp4') });
  for (const i of q.issues) console.log(`  ${i.level.toUpperCase()} ${i.rule}: ${i.detail}`);
  ok(q.pass, `quality checker: ${q.issues.filter(i => i.level === 'fail').map(i => i.rule).join('; ')}`);

  console.log('-- mux the voice and measure sync in the finished file');
  const demo = await import('./demo.mjs'); await demo.init();
  const av = path.join(out, 'demo_av.mp4'); muxVoice(path.join(out, 'demo.mp4'), path.join(DIR, demo.CLIP), demo.VOICE_AT, av);
  const d = decodeAudio(av), c = analyzeClip(envelope(d.pcm, d.sr)), T = buildTimeline([{ text: L[7].text, dur: L[7].dur, file: L[7].file }], { pre: demo.VOICE_AT, analyze: true, baseDir: DIR });
  const first = cue(T, 0, 'Paris', { lead: 0 }), second = cue(T, 0, 'Most', { lead: 0 });
  const afterGap = c.pauses.find(p => p.s > first + 1)?.e;
  console.log('  audio in demo_av.mp4: speech starts %s s (first word cue %s s); second sentence starts %s s (cue %s s)', c.start.toFixed(3), first.toFixed(3), afterGap?.toFixed(3), second.toFixed(3));
  near(c.start, first, 0.03, 'first word is heard at its cue time (+-30 ms)'); near(afterGap, second, 0.03, 'second sentence is heard at its cue time (+-30 ms)');
  metrics.syncFirstWordMs = Math.round((c.start - first) * 1000); metrics.syncSecondSentenceMs = Math.round((afterGap - second) * 1000);
  const ap = spawnProbe(av); ok(ap.audio && Math.abs(ap.dur - r.seconds) < 0.15, 'demo_av.mp4 has an audio track and the same length as the card');
  fs.writeFileSync(path.join(out, 'test_result.json'), JSON.stringify({ pass: fail === 0, checksPassed: pass, checksFailed: fail, failures, demoSeconds: r.seconds, preview, framesHash: r.framesHash, qcWarnings: q.warns, metrics }, null, 1));
} catch (e) { fail++; failures.push(e.stack || e.message); console.log('ERROR', e.stack || e.message); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function spawnProbe(f) {
  const r = spawnSyncFF(['-hide_banner', '-i', f]); const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(r); return { audio: /Audio:/.test(r), dur: dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0 };
}
function spawnSyncFF(args) { return spawnSyncSafe(process.env.ANNIE_FFMPEG || '/Users/cris/Desktop/AEON-wt-deps/node_modules/ffmpeg-static/ffmpeg', args); }
import { spawnSync } from 'node:child_process';
function spawnSyncSafe(bin, args) { const r = spawnSync(bin, args, { encoding: 'utf8' }); return (r.stderr || '') + (r.stdout || ''); }
