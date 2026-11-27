#!/usr/bin/env node
// t4.5 test: formats, hook library, voice-time model, storyboard compile, pacing checklist (including broken storyboards that must FAIL), card skeleton; then render the demo and run the quality checker.
import fs from 'node:fs';
import path from 'node:path';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/index.mjs';
import { FORMATS, beatSheet, HOOK_PATTERNS, hookFromPattern, fitHook, checkHook, hypeWords, voiceSeconds, compileStoryboard, pacingReport, noveltyCurve, voiceTableMd, makeCard, exampleStoryboard } from './module.mjs';

const here = import.meta.dirname, VO = '/Users/cris/Desktop/Reports/Agents/VP_AEON/2026-10-27/Assets_Icons_Media/TikTok_Demos/voiceover/TikTok_VO_Scripts.md';
const clone = o => JSON.parse(JSON.stringify(o));
const check = (sb) => { const c = compileStoryboard(sb); return { c, r: c.errors.length ? { failed: ['compile'], score: 0, checks: [] } : pacingReport(c, sb) }; };

await runSkillTest({ dir: here, checks: ({ ok, near, section }) => {
  section('formats and beat sheets');
  for (const f of [28, 16]) { const F = FORMATS[f], sum = F.beats.reduce((a, b) => a + b.dur, 0); near(sum, F.T - F.closerLen, 1e-9, `${f} s template: beats ${sum.toFixed(1)} s + closer ${F.closerLen} s = ${F.T} s`); ok(F.beats[0].kind === 'hook' && F.beats[F.beats.length - 1].kind === 'payoff', `${f} s: hook first, payoff last`); ok(F.beats.every(b => b.goal && b.events >= 2), `${f} s: every beat says what it is for and how many events it needs`); }
  ok(beatSheet(28).length === 5 && beatSheet(16).length === 4, 'beatSheet returns 5 and 4 beats'); const bs = beatSheet(28); bs[0].dur = 99; ok(FORMATS[28].beats[0].dur === 2.4, 'beatSheet returns a copy'); ok((() => { try { beatSheet(20); return false; } catch { return true; } })(), 'unknown format throws');

  section('hook library');
  ok(HOOK_PATTERNS.length >= 14, `${HOOK_PATTERNS.length} hook patterns`);
  for (const p of HOOK_PATTERNS) { const h = hookFromPattern(p.id, p.example); ok(h.problems.length === 0, `${p.id}: "${h.l1} / ${h.l2}" has no problems (${h.problems.join('; ')})`); ok(h.px >= 88, `${p.id}: fits at ${h.px} px (88 or more)`); ok(p.lines.length === 2 && p.when, `${p.id}: two lines and a when-to-use`); }
  ok(new Set(HOOK_PATTERNS.map(p => p.id)).size === HOOK_PATTERNS.length, 'pattern ids are unique');
  ok(fitHook('What does AI', 'actually do?').px === 104, 'a short hook fits at the full 104 px'); ok(fitHook('A much much longer first line here', 'x').px < 104 && fitHook('This line is far too long to ever fit on screen at all', 'x').fits === false, 'longer lines shrink the size, absurd ones do not fit');
  ok(fitHook('Memory in', '28 seconds.').w1 < fitHook('The prompt mistake', 'to avoid.').w1, 'width follows the text');
  ok(checkHook('Private by default', 'always.').some(x => x.includes('banned')), 'a banned claim word (private) is caught'); ok(checkHook('Nobody explains', 'this secret.').filter(x => x.includes('hype')).length === 2, 'hype words (nobody, secret) are caught'); ok(checkHook('One two three four', 'five six seven eight').some(x => x.includes('words')), 'more than 7 words is caught'); ok(checkHook('', 'x').length > 0, 'an empty line is caught');
  ok(checkHook('Costs $9 a month', 'only.').some(x => x.includes('price')), 'a price is caught'); ok(hypeWords('the Best and fastest, guaranteed').length === 3, 'hypeWords finds all three');
  ok((() => { try { hookFromPattern('question', {}); return false; } catch { return true; } })(), 'a missing slot throws');

  section('voice-time model');
  const md = fs.existsSync(VO) ? fs.readFileSync(VO, 'utf8') : '', rows = [...md.matchAll(/^\|\s*([\d.]+)[–-]([\d.]+) s\s*\|\s*(.+?)\s*\|\s*[\d.]+ s\s*\|$/gm)].map(m => ({ d: +m[2] - +m[1], text: m[3].replace(/\*[^*]*\*/g, '').trim() }));
  ok(rows.length >= 90, `${rows.length} measured voice rows found`); let err = 0, mx = 0; for (const r of rows) { const e = Math.abs(voiceSeconds(r.text) - r.d); err += e; mx = Math.max(mx, e); }
  ok(err / rows.length < 0.25 && mx < 1.0, `voiceSeconds is within ${(err / rows.length).toFixed(2)} s on average and ${mx.toFixed(2)} s at worst over ${rows.length} measured rows (fitted on these rows: in-sample)`);
  ok(voiceSeconds('') === 0 && voiceSeconds('Hello there.') > 0.5, 'voiceSeconds of nothing is 0');

  section('compile');
  for (const f of [28, 16]) {
    const sb = exampleStoryboard(f), c = compileStoryboard(sb); ok(c.errors.length === 0, `${f} s example compiles (${c.errors.join('; ')})`); near(c.T, f, 0, 'duration'); ok(c.frames === f * 30 && c.META.W === 1080 && c.META.H === 1920 && c.META.fps === 30, `${f} s: META is 1080x1920 at 30 fps, ${c.frames} frames`);
    near(c.beats[c.beats.length - 1].e, c.closerAt, 1e-9, `${f} s: beats end exactly where the closer starts (${c.closerAt.toFixed(1)} s)`); ok(c.beats.every((b, i) => i === 0 || Math.abs(b.s - c.beats[i - 1].e) < 1e-9), `${f} s: beats are back to back`);
    ok(c.hookCap.tIn === 0.15 && c.hookCap.l1 === sb.hook.l1 && c.hookCap.px >= 88, `${f} s: hook caption is ready for the engine hook() (px ${c.hookCap.px})`); ok(c.events.every((e, i) => i === 0 || e > c.events[i - 1]), `${f} s: events are sorted and unique`);
    ok(JSON.stringify(compileStoryboard(clone(sb))) === JSON.stringify(c), `${f} s: compile is deterministic and survives a JSON round trip`);
    const r = pacingReport(c, sb); ok(r.score === 100 && r.failed.length === 0, `${f} s example passes every pacing check (score ${r.score}; failed: ${r.failed.join(', ') || 'none'})`); ok(r.longestGap <= FORMATS[f].maxEventGap, `${f} s: longest stretch without an event ${r.longestGap.toFixed(2)} s`);
    ok(c.voiceRows.every(v => v.slack >= 0), `${f} s: every voice line ends before its beat does (slack ${Math.min(...c.voiceRows.map(v => v.slack)).toFixed(2)} s at the tightest)`);
    const cv = noveltyCurve(c); ok(cv.every(p => p.v >= 0 && p.v <= 1) && cv[0].v > 0.9, `${f} s: novelty curve stays in 0-1 and starts at 1`); ok(Math.abs(cv.find(p => Math.abs(p.t - c.events[3]) < 0.051).v - 1) < 0.07, `${f} s: novelty jumps back to about 1 at an event`);
    fs.mkdirSync(path.join(here, 'out'), { recursive: true }); fs.writeFileSync(path.join(here, 'out', `example_storyboard_${f}.json`), JSON.stringify(sb, null, 2)); if (f === 28) fs.writeFileSync(path.join(here, 'out', 'example_voice_table_28.md'), voiceTableMd(c) + '\n');
  }
  const md28 = voiceTableMd(compileStoryboard(exampleStoryboard(28))).split('\n'); ok(md28.length === 7 && md28[0].startsWith('| Time') && md28.every(l => l.startsWith('|')), 'voice table is a markdown table with 5 rows');

  section('pacing checklist catches broken storyboards');
  const base = exampleStoryboard(28), mut = (name, fn, want) => { const sb = clone(base); fn(sb); const { c, r } = check(sb); ok(r.failed.includes(want) || (want === 'compile' && c.errors.length > 0), `${name} -> fails "${want}" (${r.failed.join(',') || c.errors.join(';')})`); };
  mut('no events in the middle', sb => { sb.beats[2].events = []; sb.beats[3].events = []; }, 'event-gap');
  mut('a 9 s beat', sb => { sb.beats[2].dur = 9; sb.beats[4].dur = 2.9; }, 'beat-length');
  mut('a 0.5 s beat', sb => { sb.beats[1].dur = 0.5; sb.beats[2].dur += 4.1; }, 'beat-min');
  mut('an essay on screen', sb => { sb.beats[1].text = 'It writes very smooth and confident sounding answers that look as if a person thought about every single word in them'; }, 'text-load');
  mut('hook with eight words', sb => { sb.hook.l1 = 'What does a chatbot really'; sb.hook.l2 = 'actually do all day?'; }, 'hook-copy');
  mut('hook claim word', sb => { sb.hook.l2 = 'in private?'; }, 'hook-copy');
  mut('claim in a beat text', sb => { sb.beats[3].text = 'Works offline.'; }, 'claims');
  mut('hype in the voice', sb => { sb.beats[4].voice = 'Nobody tells you this secret.'; }, 'claims');
  mut('loop never closed', sb => { sb.beats[4].closeLoop = false; }, 'loop');
  mut('loop closed too early', sb => { sb.beats[1].closeLoop = true; sb.beats[4].closeLoop = false; }, 'loop');
  mut('voice too long for its beat', sb => { sb.beats[0].voice = 'What does an artificial intelligence chatbot actually do when you type a question into it?'; }, 'voice-fit');
  { const { r } = check((() => { const sb = clone(base); sb.beats[0].dur = 2.4; return sb; })()); ok(r.score === 100, 'control: an unchanged storyboard still scores 100'); }
  mut('beats do not reach the closer', sb => { sb.beats[4].dur = 3; }, 'compile'); mut('no hook beat first', sb => { sb.beats.reverse(); }, 'compile'); mut('unknown kind', sb => { sb.beats[1].kind = 'dance'; }, 'compile'); mut('no payoff', sb => { sb.beats[4].kind = 'proof'; }, 'compile');
  mut('text in the caption band', sb => { sb.beats[2].textY = 1400; }, 'caption-band'); mut('cover frame on the closer', sb => { sb.cover = { t: 26 }; }, 'cover');
  { const sb = clone(base); sb.beats[1].events = []; const { r } = check(sb); ok(r.score < 100, 'a broken storyboard scores below 100'); }
  ok(compileStoryboard({ format: 20, beats: [] }).errors.length === 1, 'bad format reported');

  section('card skeleton');
  const card = makeCard(exampleStoryboard(16), { reveal: (ctx, { page }) => { ctx.fillStyle = '#fff'; ctx.fillRect(100 + page.dx, 800, 100, 100); } });
  ok(card.META.frames === 480 && card.META.coverT === 1.2, 'makeCard gives META'); const f0 = card.frame(0.5), f1 = card.frame(7.0), f2 = card.frame(14.0); ok([f0, f1, f2].every(cv => cv.width === 1080 && cv.height === 1920), 'frame() returns a 1080x1920 canvas');
  const px = cv => { const d = cv.getContext('2d').getImageData(150, 850, 1, 1).data; return d[0]; }; ok(px(f1) > 200 && px(f0) < 100, 'the reveal beat draws through the page slide (white block at 7 s, not at 0.5 s)');
  ok((() => { try { makeCard({ format: 16, beats: [] }); return false; } catch { return true; } })(), 'makeCard throws on a broken storyboard');
  void createCanvas;
} });
