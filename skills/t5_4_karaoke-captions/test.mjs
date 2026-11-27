#!/usr/bin/env node
// t5.4 test: chunking, layout in the safe zone, state machine, .srt round trip and agreement with the video, reading speed, pixel checks that the right word is green at the right
// frame, render, QC, and the highlight timing checked against the audio of the muxed file. Exit 0 only if everything passes.
// (The engine's runSkillTest demands a silent demo and exits itself, so the steps run by hand; see ../t5_ENGINE_REQUESTS.md.)
import fs from 'node:fs';
import path from 'node:path';
import { renderCard } from '../../engine/render.mjs';
import { qcCard } from '../../engine/qc.mjs';
import { createCanvas } from '../../engine/canvas.mjs';
import { buildTimeline, decodeAudio, envelope, analyzeClip, muxVoice } from '../t5_1_voice-synced-scenes/module.mjs';
import { STYLE, chunkWords, timeCaptions, makeCaptions, measurer, layoutCaption, captionState, srtTime, toSrt, parseSrt, readingStats } from './module.mjs';

const DIR = import.meta.dirname, out = path.join(DIR, 'out'), preview = process.env.ANNIE_PREVIEW === '1';
let pass = 0, fail = 0; const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); console.log('FAIL', m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m}: got ${(+a).toFixed(3)}, want ${b} (+-${tol})`);
fs.mkdirSync(out, { recursive: true });
const metrics = {};
try {
  console.log('-- chunking and timing (real Heart sentences, words from t5.1)');
  const rows = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/lesson.json'), 'utf8')).rows, tl = buildTimeline(rows, { pre: 0.6, gap: 0.45, analyze: true, baseDir: DIR });
  const words = tl.sentences.flatMap(s => s.words), ctx = createCanvas(64, 64).getContext('2d'), measure = measurer(ctx);
  const chunks = chunkWords(words, { measure }), caps = timeCaptions(chunks);
  ok(chunks.flat().length === words.length && chunks.flat().every((w, i) => w === words[i]), 'every word appears once, in order');
  ok(chunks.every(c => c.length <= STYLE.maxWords), `no chunk longer than ${STYLE.maxWords} words (longest ${Math.max(...chunks.map(c => c.length))})`);
    ok(tl.sentences.every(s => { const last = caps.find(c => c.words.includes(s.words.at(-1))); return last && last.words.at(-1) === s.words.at(-1); }), 'a chunk never runs across a sentence end');
  ok(caps.every(c => c.words.length === 1 || !/[.?!]$/.test(c.words.slice(0, -1).map(x => x.w).at(-1))), 'no full stop inside a chunk');
  ok(caps.every((c, i) => c.end > c.start && (i === 0 || c.start >= caps[i - 1].end - 0.0015)), 'captions are ordered and never overlap (1.5 ms slack at a swap)');
  ok(caps.every(c => c.start <= c.words[0].s - 0.0 && c.start >= c.words[0].s - 0.1), 'each caption appears at most 0.1 s before its first word, never after it');
  ok(caps.every((c, i) => c.end >= c.words.at(-1).e - 0.001 && true), 'each caption outlasts its last word');
  const rs = readingStats(caps); metrics.reading = { maxCps: +rs.maxCps.toFixed(1), maxWps: +rs.maxWps.toFixed(2), minShow: +rs.minShow.toFixed(2), captions: caps.length };
  console.log('  %d captions; slowest show %s s; max %s chars/s, %s words/s', caps.length, rs.minShow.toFixed(2), rs.maxCps.toFixed(1), rs.maxWps.toFixed(2));
  ok(rs.minShow >= 0.5, `every caption is on screen at least 0.5 s (min ${rs.minShow.toFixed(2)})`); ok(rs.maxCps <= 25, `reading speed at most 25 characters per second (max ${rs.maxCps.toFixed(1)})`);
  // a made-up case with no punctuation and 14 words must split in two
  const long = Array.from({ length: 14 }, (_, i) => ({ w: 'word' + i, s: i * 0.3, e: i * 0.3 + 0.25 })), lc = chunkWords(long, { measure });
  ok(lc.length >= 2 && lc.every(c => c.length <= 8), 'a 14-word run is cut into chunks of at most 8'); ok(chunkWords(long.slice(0, 3), { measure }).length === 1, 'a short run stays whole');
  const orph = chunkWords([{ w: 'Yes,', s: 0, e: 0.3 }, { w: 'and', s: 0.3, e: 0.5 }, { w: 'then', s: 0.5, e: 0.8 }, { w: 'we', s: 0.8, e: 1 }, { w: 'go.', s: 1, e: 1.3 }], { measure }); ok(orph.length === 1, 'a comma after the first word does not leave a one-word orphan');

  console.log('-- layout and the safe zone');
  let lay = caps.map(c => layoutCaption(ctx, c));
  ok(lay.every(L => L.lines.length <= 2), 'at most 2 lines'); ok(lay.every(L => L.box.y1 <= 1580 && L.box.y0 >= 1250 - 10), `pill inside y 1250-1580 (found ${Math.min(...lay.map(L => L.box.y0)).toFixed(0)}-${Math.max(...lay.map(L => L.box.y1)).toFixed(0)})`);
  ok(lay.every(L => L.box.x1 <= 940 && L.box.x0 >= 40), `pill clear of the action rail: right edge at most 940 (found ${Math.max(...lay.map(L => L.box.x1)).toFixed(0)})`);
  ok(lay.every(L => L.lines.every(l => l.items.every(it => it.x + it.width <= 930))), 'no word reaches the action rail (x 940)'); ok(STYLE.px >= 52 && STYLE.y === 1470, 'style: 52 px at y 1470');
  ok(lay.every(L => { const ls = L.lines; return ls.length < 2 || Math.min(ls[0].w, ls[1].w) / Math.max(ls[0].w, ls[1].w) > 0.45; }), 'two-line captions are balanced (shorter line is at least 45% of the longer)');
  ok(lay.every(L => L.lines.every((l, i) => i === 0 || l.items[0].i > L.lines[i - 1].items.at(-1).i)), 'words keep their order across lines');

  console.log('-- state machine');
  const mid = (c, i) => (c.words[i].s + c.words[i].e) / 2;
  const s1 = captionState(caps, mid(caps[0], 1)); ok(s1 && s1.k === 0 && s1.i === 1 && s1.p > 0.3 && s1.p < 0.7, 'mid-word state');
  ok(captionState(caps, caps[0].start - 0.2) === null && captionState(caps, caps.at(-1).end + 0.5) === null, 'nothing before the first or after the last caption');
  const gapT = caps.find(c => c.words.some((w, i) => i && w.s - c.words[i - 1].e > 0.1)); if (gapT) { const i = gapT.words.findIndex((w, q) => q && w.s - gapT.words[q - 1].e > 0.1), tt = (gapT.words[i - 1].e + gapT.words[i].s) / 2, g = captionState(caps, tt); ok(g.i === i - 1 && g.p === 1, 'in a pause the last word stays lit (p = 1)'); }
  ok(captionState(caps, caps[0].start + 0.001).a < 0.05 && captionState(caps, caps[0].start + 0.2).a > 0.95, 'caption fades in over 0.12 s');
  const srt = toSrt(caps), cues = parseSrt(srt);
  ok(cues.length === caps.length && cues.every((c, i) => c.text === caps[i].text && Math.abs(c.start - caps[i].start) < 0.0006 && Math.abs(c.end - caps[i].end) < 0.0006), '.srt round trip keeps text and times (within 0.6 ms)');
  ok(/^1\n\d\d:\d\d:\d\d,\d\d\d --> \d\d:\d\d:\d\d,\d\d\d\n/.test(srt), '.srt format'); ok(srtTime(3723.456) === '01:02:03,456', 'srtTime');
  let agree = 0, total = 0; for (let t = 0; t < tl.end + 1; t += 0.013) { const st = captionState(caps, t), cue = cues.find(c => t >= c.start && t < c.end); total++; if ((!st && !cue) || (st && cue && caps[st.k].text === cue.text)) agree++; }
  ok(agree === total, `video and .srt agree at ${total} sample times (${agree} agree)`); metrics.srtAgreement = `${agree}/${total}`;
  fs.writeFileSync(path.join(out, 'lesson_fixture.srt'), srt);

  console.log(`-- render demo (${preview ? '540x960 preview' : '1080x1920'})`);
  const card = path.join(DIR, 'demo.mjs'), r = await renderCard(card, { out, name: 'demo', preview });
  fs.copyFileSync(path.join(out, 'demo_contact.png'), path.join(out, 'contact.png')); fs.rmSync(path.join(out, 'demo_contact.png'), { force: true });
  ok(r.seconds >= 5 && r.seconds <= 8, `demo lasts ${r.seconds} s`); ok(!r.audioStream, 'card video is silent'); ok(r.width === (preview ? 540 : 1080), 'width');
  console.log('-- quality checker');
  const q = await qcCard(card, { out, video: preview ? undefined : path.join(out, 'demo.mp4') });
  for (const i of q.issues) console.log(`  ${i.level.toUpperCase()} ${i.rule}: ${i.detail}`);
  ok(q.pass, `quality checker: ${q.issues.filter(i => i.level === 'fail').map(i => i.rule).join('; ')}`);

  console.log('-- pixels: the right word is green at the right frame (frames drawn by demo.mjs)');
  const demo = await import('./demo.mjs'); await demo.init(); const I = demo._info(), C = I.CAPS[0], L0 = I.LAY[0], FPS = 30;
  const box = it => { const ln = L0.lines.find(l => l.items.includes(it)); return [Math.floor(it.x), Math.floor(ln.y - 20), Math.ceil(it.width), 40]; };
  const colorShare = (cv, [x, y, w, h], kind) => { const d = cv.getContext('2d').getImageData(x, y, w, h).data; let n = 0, m = 0; for (let i = 0; i < d.length; i += 4) { const [R, G, B] = [d[i], d[i + 1], d[i + 2]]; const green = G > 170 && R < 90 && B > 90 && B < 190, white = R > 225 && G > 225 && B > 225, grey = Math.abs(R - 148) < 28 && Math.abs(G - 163) < 28 && Math.abs(B - 184) < 28; m++; if (kind === 'green' ? green : kind === 'white' ? white : grey) n++; } return n / m; };
  const items = L0.lines.flatMap(l => l.items), tMid = (C.words[1].s + C.words[1].e) / 2, cv = demo.frame(tMid);
  ok(colorShare(cv, box(items[1]), 'green') > 0.01, 'at the middle of word 2, word 2 has green pixels'); ok(colorShare(cv, box(items[0]), 'white') > 0.04 && colorShare(cv, box(items[0]), 'green') < 0.005, 'word 1 (already said) is white, not green');
  ok(colorShare(cv, box(items[3]), 'grey') > 0.04 && colorShare(cv, box(items[3]), 'green') < 0.005, 'word 4 (still to come) is grey, not green');
  const half = demo.frame(C.words[0].s + (C.words[0].e - C.words[0].s) * 0.5), b0 = box(items[0]), gl = colorShare(half, [b0[0], b0[1], Math.floor(b0[2] * 0.4), b0[3]], 'green'), gr = colorShare(half, [b0[0] + Math.ceil(b0[2] * 0.75), b0[1], Math.floor(b0[2] * 0.2), b0[3]], 'green');
  ok(gl > 0.03 && gr < gl / 3, `the wipe: halfway through a word the left part is green (${(gl * 100).toFixed(0)}%) and the right part is not yet (${(gr * 100).toFixed(0)}%)`);
  // first frame where word 1 turns green, against the speech start measured in the muxed audio
  const av = path.join(out, 'demo_av.mp4'); muxVoice(path.join(out, 'demo.mp4'), path.join(DIR, demo.CLIP), demo.VOICE_AT, av);
  const A = decodeAudio(av), cl = analyzeClip(envelope(A.pcm, A.sr));
  const firstGreen = (wordItem, t0, t1) => { for (let f = Math.floor(t0 * FPS); f <= Math.ceil(t1 * FPS); f++) if (colorShare(demo.frame(f / FPS), box(wordItem), 'green') > 0.003) return f / FPS; return -1; };
  const g1 = firstGreen(items[0], 0.3, 1.2), mostIdx = C.words.findIndex(w => w.w === 'Most'), cap2 = I.CAPS[1], L1 = I.LAY[1], it2 = L1.lines.flatMap(l => l.items)[0];
  const box2 = it => { const ln = L1.lines.find(l => l.items.includes(it)); return [Math.floor(it.x), Math.floor(ln.y - 20), Math.ceil(it.width), 40]; };
  let g2 = -1; for (let f = Math.floor(2.3 * FPS); f <= Math.ceil(3.3 * FPS); f++) if (colorShare(demo.frame(f / FPS), box2(it2), 'green') > 0.003) { g2 = f / FPS; break; }
  const gapEnd = cl.pauses.find(p => p.s > 1.5)?.e;
  console.log('  heard in demo_av.mp4: speech starts %s s, 2nd sentence starts %s s | green first appears on word 1 at %s s, on "Most" at %s s', cl.start.toFixed(3), gapEnd?.toFixed(3), g1.toFixed(3), g2.toFixed(3));
  near(g1, cl.start, 0.06, 'first word turns green within 60 ms (2 frames) of the voice starting'); near(g2, gapEnd, 0.06, '"Most" turns green within 60 ms of the second sentence starting');
  metrics.highlightVsAudioMs = { firstWord: Math.round((g1 - cl.start) * 1000), mostAfterPause: Math.round((g2 - gapEnd) * 1000) };
  metrics.safeZone = { pillTop: Math.min(...lay.map(L => L.box.y0)), pillBottom: Math.max(...lay.map(L => L.box.y1)), maxRight: Math.max(...lay.map(L => L.box.x1)) };
  fs.writeFileSync(path.join(out, 'demo.srt'), I.srt);
  fs.writeFileSync(path.join(out, 'test_result.json'), JSON.stringify({ pass: fail === 0, checksPassed: pass, checksFailed: fail, failures, demoSeconds: r.seconds, preview, framesHash: r.framesHash, qcWarnings: q.warns, metrics }, null, 1));
} catch (e) { fail++; failures.push(e.stack || e.message); console.log('ERROR', e.stack || e.message); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
