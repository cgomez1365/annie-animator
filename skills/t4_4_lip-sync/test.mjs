#!/usr/bin/env node
// t4.4 test: visemes, syllable counts, audio decode, alignment (synthetic ground truth and real Kokoro tracks with the measured times from the VO scripts),
// mouth track behaviour, then render the demo and run the quality checker.
import fs from 'node:fs';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/index.mjs';
import { rng } from '../../engine/rng.mjs';
import { makeRig, drawMascot, validateRig } from '../t4_1_vector-mascot-design/module.mjs';
import { VISEMES, VISEME_NAMES, decodeAudio, loudness, analyzeAudio, envAt, speechSegments, energyPeaks, wordSyllables, syllabify, alignSyllables, visemeKeys, makeMouthTrack, synthSpeech } from './module.mjs';

const VO = '/Users/cris/Desktop/Reports/Agents/VP_AEON/2026-10-27/Assets_Icons_Media/TikTok_Demos/voiceover';
const TT1 = `${VO}/tracks/tt1_kinetic_cog_vo.wav`, SCRIPTS = `${VO}/TikTok_VO_Scripts.md`;
const TEXT1 = 'Be the cog in the machine. Tools that work for you. AEON. Agents with their own memory. A Local only switch. Blocks you buy once. AEON, by Broken Gear Industries.';
const WORDS = { machine: 2, agents: 2, memory: 3, industries: 3, intelligence: 4, artificial: 4, little: 2, make: 1, broken: 2, local: 2, probability: 5, learned: 1, makes: 1, language: 2, model: 2, predict: 2, training: 2, because: 2, tokens: 2, computer: 3, simple: 2, hello: 2, world: 1,
  people: 2, video: 3, create: 2, being: 2, tools: 1, switch: 1, blocks: 1, buy: 1, once: 1, gear: 1, cog: 1, work: 1, you: 1, your: 1, the: 1, with: 1, their: 1, own: 1, only: 2, listen: 2, number: 2, sentence: 2, answer: 2, question: 2, important: 3, information: 4, automatic: 4, however: 3,
  together: 3, between: 2, example: 3, table: 2, have: 1, done: 1, store: 1, share: 1, there: 1, where: 1, are: 1, use: 1, eye: 1, idea: 3, area: 3, science: 2, quiet: 2, every: 3, through: 1, thought: 1, enough: 2, weight: 1, night: 1, minute: 2, banana: 3, electricity: 5, television: 4, beautiful: 3, queen: 1, quick: 1, quality: 3, be: 1, by: 1, a: 1, aeon: 1 };
const gaps = (A, ts) => ts.map(([a, b]) => { let m = 0, n = 0, mx = 0; for (let t = a; t < b; t += 0.01) { const v = envAt(A, t); m += v; n++; mx = Math.max(mx, v); } return [m / n, mx]; });
function parseScript(name) { // rows of one "## ttN_name" table: [{t0, t1, text}]
  const md = fs.readFileSync(SCRIPTS, 'utf8'), i = md.indexOf(`## ${name} `); if (i < 0) return []; const rest = md.slice(i + 5), j = rest.indexOf('\n## '), sec = j < 0 ? rest : rest.slice(0, j);
  return [...sec.matchAll(/^\|\s*([\d.]+)[–-]([\d.]+) s\s*\|\s*(.+?)\s*\|\s*[\d.]+ s\s*\|$/gm)].map(m => ({ t0: +m[1], t1: +m[2], text: m[3].replace(/\*[^*]*\*/g, '').trim() }));
}
const shot = m => { const cv = createCanvas(220, 160), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 220, 160); drawMascot(c, makeRig({ mouth: m, shadow: 0, hide: ['legL', 'legR', 'armL', 'armR', 'antenna', 'ring', 'bolts'] }), { x: 110, y: -30, u: 170 }); return c.getImageData(0, 0, 220, 160).data; };

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near, section }) => {
  section('visemes');
  ok(VISEME_NAMES.length === 11, '11 visemes');
  for (const n of VISEME_NAMES) { const r = validateRig(makeRig({ mouth: { ...VISEMES[n] } })); ok(Object.keys(VISEMES[n]).every(k => Math.abs(r.mouth[k] - VISEMES[n][k]) < 1e-9), `${n}: inside the mouth's safe range`); }
  const px = Object.fromEntries(VISEME_NAMES.map(n => [n, shot(VISEMES[n])])); let minD = 1e9, minPair = '';
  for (let i = 0; i < VISEME_NAMES.length; i++) for (let j = i + 1; j < VISEME_NAMES.length; j++) { const a = px[VISEME_NAMES[i]], b = px[VISEME_NAMES[j]]; let d = 0; for (let p = 0; p < a.length; p += 4) d += Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]); d /= a.length / 4; if (d < minD) { minD = d; minPair = `${VISEME_NAMES[i]}/${VISEME_NAMES[j]}`; } }
  ok(minD > 0.9, `every pair of mouth shapes differs in pixels (closest ${minPair}: ${minD.toFixed(2)})`);
  ok(VISEMES.MBP.open === 0 && VISEMES.AH.open > VISEMES.EH.open && VISEMES.EH.open > VISEMES.EE.open && VISEMES.OO.round === 1 && VISEMES.FV.teeth === 1, 'jaw opens AH > EH > EE, MBP is shut, OO is round, FV shows teeth');

  section('text to syllables');
  const bad = Object.entries(WORDS).filter(([w, n]) => wordSyllables(w).length !== n).map(([w, n]) => `${w} (want ${n}, got ${wordSyllables(w).length})`), acc = 1 - bad.length / Object.keys(WORDS).length;
  ok(acc >= 0.95, `syllable counts right for ${(acc * 100).toFixed(1)} percent of ${Object.keys(WORDS).length} words (misses: ${bad.join(', ') || 'none'})`);
  const sy = syllabify(TEXT1); ok(sy.length >= 38 && sy.length <= 44, `the tt1 text is ${sy.length} syllables`); ok(sy.filter(s => s.last && s.pauseAfter > 0).length === 8, 'eight punctuation pauses found');
  ok(syllabify('AEON')[0].nucleus === 'EE' && syllabify('AEON').length === 2, 'AEON is spoken Ee-on (2 syllables)');
  const m = syllabify('maybe fine'); ok(m[0].onset === 'MBP' && syllabify('five')[0].onset === 'FV' && syllabify('shop')[0].onset === 'SH' && syllabify('cat')[0].onset === null && syllabify('city')[0].onset === 'SS', 'onset classes: m is MBP, f is FV, sh is SH, hard c is none, soft c is SS');
  ok(syllabify('film')[0].coda === 'MBP' && syllabify('leaf')[0].coda === 'FV' && syllabify('cat')[0].coda === null, 'lip-closing endings are kept (film ends in m), others ignored');

  section('audio decode and envelope');
  const dec = decodeAudio(TT1); near(dec.duration, 14.0, 0.05, 'ffmpeg decodes tt1 to 14.0 s'); ok(dec.samples.some(v => Math.abs(v) > 0.2), 'samples are real audio');
  const A = analyzeAudio(TT1); ok(Math.abs(A.env.length - 1400) <= 2, `envelope has 100 values per second (${A.env.length})`); ok(Math.min(...A.env) >= 0 && Math.max(...A.env) <= 1 && Math.max(...A.env) > 0.95, 'envelope is normalised to 0-1');
  const G = gaps(A, [[1.6, 2.4], [4.0, 5.6], [10.9, 11.1]]); ok(G.every(([mean, mx]) => mean < 0.02 && mx < 0.05), `silent gaps read as silence (mean ${G.map(g => g[0].toFixed(3)).join(', ')})`);
  const V = gaps(A, [[0.2, 1.3], [2.6, 3.7]]); ok(V.every(([mean]) => mean > 0.45), `speech reads as speech (mean ${V.map(g => g[0].toFixed(2)).join(', ')})`);

  section('segments against the measured times in the VO scripts');
  let rows = 0, hit = 0, worst = 0;
  for (const name of ['tt1_kinetic_cog', 'tt2_terminal_hook', 'tt3_story_cards', 'tt4_rent_vs_own', 'tt5_memory_switch', 'tt10_ops_hr', 'tt12_news_scanner', 'tt14_demos']) {
    const f = `${VO}/tracks/${name.split('_')[0]}_${name.split('_').slice(1).join('_')}_vo.wav`; if (!fs.existsSync(f)) continue;
    const a = analyzeAudio(f), segs = speechSegments(a, { gap: 0.2 }), tab = parseScript(name);
    for (const r of tab) { rows++; const s0 = segs.map(g => Math.abs(g.t0 - r.t0)), s1 = segs.map(g => Math.abs(g.t1 - r.t1)), d0 = Math.min(...s0), d1 = Math.min(...s1); worst = Math.max(worst, d0, d1); if (d0 <= 0.12 && d1 <= 0.12) hit++; }
  }
  ok(rows >= 30, `${rows} rows of measured times found in the VO scripts`); ok(hit / rows >= 0.9, `speech segments start and end within 0.12 s of the measured times for ${hit} of ${rows} script rows (worst ${worst.toFixed(2)} s)`);
  const sg = speechSegments(A, { gap: 0.15 }); ok(sg.length === 7, `tt1 has 7 speech segments with a 0.15 s bridge (${sg.length})`);

  section('alignment: synthetic ground truth');
  const stext = 'We build tools for people. Every tool does one job well. It runs on your computer, and it stays simple. That is the whole idea.', ssy = syllabify(stext); let worstRms = 0, worstMax = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = rng(seed), times = []; let t = 0.3; ssy.forEach(s => { times.push(t); t += r.range(0.15, 0.27) + (s.last && s.pauseAfter >= 0.3 ? 0.7 : s.last && s.pauseAfter > 0 ? 0.35 : 0); });
    const sp = synthSpeech(times, { seed }), al = alignSyllables(loudness(sp.samples, sp.rate), ssy), err = al.map((a, k) => a.t - times[k]);
    ok(al.length === ssy.length, `seed ${seed}: every syllable is placed`); worstRms = Math.max(worstRms, Math.sqrt(err.reduce((a, b) => a + b * b, 0) / err.length)); worstMax = Math.max(worstMax, ...err.map(Math.abs));
    ok(al.every((a, k) => k === 0 || a.t > al[k - 1].t), `seed ${seed}: syllables stay in order`);
  }
  ok(worstRms < 0.03 && worstMax < 0.08, `synthetic syllable times recovered: worst rms ${(worstRms * 1000).toFixed(0)} ms, worst error ${(worstMax * 1000).toFixed(0)} ms (the clean synthetic signal is the easy case)`);

  section('alignment: real Kokoro tracks');
  const al = alignSyllables(A, sy); ok(al.length === sy.length, 'tt1: all syllables placed');
  const chunks = []; { let c = 0; sy.forEach(s => { c++; if (s.last && s.pauseAfter >= 0.3) { chunks.push(c); c = 0; } }); if (c) chunks.push(c); }   // sentence-final pauses only: the 0.15 s comma pause is too short to split a segment
  const perSeg = Array(chunks.length).fill(0); al.forEach(a => perSeg[a.seg]++); ok(JSON.stringify(perSeg) === JSON.stringify(chunks), `tt1: syllables per speech segment ${perSeg.join(',')} equal syllables per sentence ${chunks.join(',')}`);
  const win = [[0.15, 1.41], [2.55, 3.78], [5.9, 7.95], [8.2, 10.7], [11.25, 13.24]], per = [7, 5, 2 + 6, 6 + 5, 2 + 5].map((n, i) => n); void per;
  let inside = 0; for (const a of al) if (win.some(([x, y]) => a.t >= x - 0.1 && a.t <= y + 0.1)) inside++; ok(inside === al.length, `tt1: every syllable falls inside a measured phrase window (+-0.1 s): ${inside} of ${al.length}`);
  ok(al.every((a, k) => k === 0 || a.t > al[k - 1].t + 0.03), 'tt1: syllables are in order and at least 30 ms apart');
  let rowsOk = 0, rowsAll = 0;
  for (const name of ['tt2_terminal_hook', 'tt3_story_cards', 'tt4_rent_vs_own', 'tt5_memory_switch', 'tt10_ops_hr', 'tt14_demos']) {
    const f = `${VO}/tracks/${name.split('_')[0]}_${name.split('_').slice(1).join('_')}_vo.wav`; const tab = parseScript(name); if (!fs.existsSync(f) || !tab.length) continue;
    const a = analyzeAudio(f), text = tab.map(r => (/[.?!,;:]$/.test(r.text) ? r.text : r.text + '.')).join(' '), alg = alignSyllables(a, syllabify(text));
    let k = 0; const sylsPerRow = tab.map(r => syllabify(/[.?!,;:]$/.test(r.text) ? r.text : r.text + '.').length);
    tab.forEach((r, i) => { const mine = alg.slice(k, k + sylsPerRow[i]); k += sylsPerRow[i]; rowsAll++; if (mine.length && mine[0].t >= r.t0 - 0.1 && mine[0].t <= r.t0 + 0.3 && mine[mine.length - 1].t <= r.t1 + 0.1 && mine[mine.length - 1].t >= r.t1 - 0.35) rowsOk++; });
  }
  ok(rowsAll >= 20 && rowsOk / rowsAll >= 0.9, `six more real tracks: first and last syllable of ${rowsOk} of ${rowsAll} script rows land inside the measured row times`);

  section('mouth track');
  const M = makeMouthTrack(A, TEXT1), M2 = makeMouthTrack(A, TEXT1);
  ok(JSON.stringify(M.mouthAt(1.1)) === JSON.stringify(M2.mouthAt(1.1)) && JSON.stringify(M.mouthAt(1.1)) === JSON.stringify(M.mouthAt(1.1)), 'mouthAt is pure and deterministic');
  const shut = []; for (const [a, b] of [[1.6, 2.4], [4.0, 5.6]]) for (let t = a; t < b; t += 1 / 30) shut.push(M.mouthAt(t).open); ok(Math.max(...shut) < 0.06, `mouth is closed in silence (max open ${Math.max(...shut).toFixed(3)})`);
  const talk = []; for (let t = 0.2; t < 1.3; t += 1 / 30) talk.push(M.mouthAt(t).open); const tm = talk.reduce((a, b) => a + b) / talk.length; ok(tm > 0.3 && Math.max(...talk) > 0.6, `mouth opens while speaking (mean ${tm.toFixed(2)}, peak ${Math.max(...talk).toFixed(2)})`);
  const F = 30, T = Math.floor(14 * F), mo = Array.from({ length: T }, (_, i) => M.mouthAt(i / F).open), en = Array.from({ length: T }, (_, i) => envAt(A, i / F)), mean = a => a.reduce((x, y) => x + y) / a.length;
  const corr = (lag) => { const xs = [], ys = []; for (let i = 0; i < T; i++) { const j = i + lag; if (j >= 0 && j < T) { xs.push(mo[i]); ys.push(en[j]); } } const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
  let bestL = 0, bestC = -1; for (let l = -5; l <= 5; l++) { const c = corr(l); if (c > bestC) { bestC = c; bestL = l; } }
  ok(bestC > 0.6, `mouth opening follows loudness (correlation ${bestC.toFixed(2)} at best lag)`); ok(Math.abs(bestL) <= 3, `no big lag: best alignment is ${bestL} frames (${(bestL / F * 1000).toFixed(0)} ms)`);
  const rev = (() => { let r = 0, d0 = 0; for (let i = 1; i < T; i++) { const d = mo[i] - mo[i - 1]; if (Math.abs(d) > 0.02 && Math.sign(d) !== d0 && d0 !== 0) r++; if (Math.abs(d) > 0.02) d0 = Math.sign(d); } return r / 14; })();
  ok(rev < 11, `no flapping: the jaw changes direction ${rev.toFixed(1)} times per second (natural speech 6-9 syllables per second)`); ok(Math.max(...mo.slice(1).map((v, i) => Math.abs(v - mo[i]))) < 0.8, 'no single-frame jumps over 0.8 in jaw opening (lip closures take 2 frames, vowels 3)');
  const mb = M.keys.filter(k => k.v === 'MBP'); ok(mb.length >= 8, `${mb.length} lip closures (b, p, m) in the keys`);
  const closed = mb.filter(k => M.mouthAt(k.t - 0.05 + 0.06).open < 0.12).length; ok(closed === mb.length, `the lips are shut ${closed} of ${mb.length} times 60 ms into every closure`);
  ok(M.keys.every((k, i) => i === 0 || k.t - M.keys[i - 1].t >= 0.05 - 1e-9 || k.v === M.keys[i - 1].v), 'every shape is held at least 0.05 s (1.5 frames) unless it repeats'); ok(M.keys.every((k, i) => k.v !== 'MBP' || !M.keys[i + 1] || M.keys[i + 1].t - k.t >= 0.1 - 1e-9 || M.keys[i + 1].v === 'MBP'), 'lip closures last at least 0.1 s (3 frames)');
  const Mlead = makeMouthTrack(A, TEXT1, { lead: 0.08 }); near(Mlead.mouthAt(1.0).open, M.mouthAt(1.03).open, 1e-9, 'lead shifts the mouth earlier by exactly the offset');
  const Mgain = makeMouthTrack(A, TEXT1, { gain: 0.5 }); near(Mgain.mouthAt(1.15).open, M.mouthAt(1.15).open * 0.5, 1e-9, 'gain scales jaw opening');
  const keys = visemeKeys(al, A); ok(keys.every((k, i) => i === 0 || k.t >= keys[i - 1].t), 'viseme keys are sorted'); ok(keys.every(k => VISEMES[k.v] && k.w > 0 && k.w <= 1), 'every key names a real viseme with weight 0-1');
  console.log(`  numbers: syllable accuracy ${(acc * 100).toFixed(1)}%, script rows ${hit}/${rows} (worst ${worst.toFixed(2)} s), real-track rows ${rowsOk}/${rowsAll}, synthetic rms ${(worstRms * 1000).toFixed(0)} ms max ${(worstMax * 1000).toFixed(0)} ms, correlation ${bestC.toFixed(2)} at ${bestL} frames, reversals/s ${rev.toFixed(1)}, closest viseme pair ${minPair} ${minD.toFixed(2)}`);
  section('text-only fallback');
  const MT = makeMouthTrack(null, 'We build tools. They stay simple.'); ok(MT.syllables === 7 && MT.duration > 1.5, `without audio ${MT.syllables} syllables over ${MT.duration.toFixed(2)} s`); ok(MT.mouthAt(-1).open === 0 && Number.isFinite(MT.mouthAt(0.5).open), 'text-only track is closed before it starts and finite after');
  const tmax = Math.max(...Array.from({ length: 60 }, (_, i) => MT.mouthAt(i / 30).open)); ok(tmax > 0.3, `text-only mouth moves (peak ${tmax.toFixed(2)})`);
  void energyPeaks;
} });
