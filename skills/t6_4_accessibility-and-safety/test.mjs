#!/usr/bin/env node
// t6.4 test: colour maths, flash counting, caption rules, the motion kit, nine planted-fault cards (each fault must be caught, each safe
// neighbour must pass), the demo in three motion modes, the ported tt10 with its real caption file, then the demo render + QC.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSkillTest } from '../../engine/testkit.mjs';
import { relLum, contrast, contrastAll, simulate, paletteContrast, motionKit, parseSrt, checkCaptions, changes, flashesPerSecond, scoreCard, lines, LIMITS } from './module.mjs';
import { SHOWN } from './demo.mjs';

const here = import.meta.dirname, TT10 = path.join(here, '../t6_2_batch-render-and-cache/ported/tt10_ops_hr.mjs'), HELLO = path.join(here, '../../engine/examples/hello_card.mjs');
const SRT = '/Users/cris/Desktop/Reports/Agents/VP_AEON/2026-10-27/Assets_Icons_Media/TikTok_Demos/posts/captions/tt10_ops_hr.srt', IDX = new URL('../../engine/index.mjs', import.meta.url).href;
const fx = (frames, body) => `import { createCanvas, setFont } from ${JSON.stringify(IDX)};
export const META = { W: 1080, H: 1920, fps: 30, frames: ${frames}, qc: { closer: false } };
export function frame(t, i) { const cv = createCanvas(1080, 1920), ctx = cv.getContext('2d'); ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, 1080, 1920);
${body}
return cv; }
`;
const flip = n => `ctx.fillStyle = (Math.floor(i / ${n}) % 2) ? '#ffffff' : '#000000'; ctx.fillRect(0, 0, 1080, 1920);`;
const FX = {
  strobe: [60, flip(2)], slow: [90, flip(15)], three: [90, flip(5)], fourhz: [90, flip(4)],
  red: [60, "ctx.fillStyle = (Math.floor(i / 3) % 2) ? '#ff0000' : '#00a000'; ctx.fillRect(0, 0, 1080, 1920);"],
  lowc: [60, "setFont(ctx, 'inter', 60, 700); ctx.fillStyle = '#475569'; ctx.fillText('Dim words on dark', 100, 900);"],
  rushed: [60, "setFont(ctx, 'inter', 60, 700); ctx.fillStyle = '#f8fafc'; if (i < 15) ctx.fillText('This sentence is gone far too soon', 60, 900); ctx.fillStyle = '#22d3ee'; ctx.fillRect(100 + i * 5, 1100, 80, 80);"],
  shake: [60, "ctx.translate(i % 2 ? 12 : -12, 0); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 4; for (let k = 0; k < 12; k++) ctx.strokeRect(100 + k * 20, 300 + k * 60, 700, 90); setFont(ctx, 'inter', 60, 700); ctx.fillStyle = '#f8fafc'; ctx.fillText('Everything shakes', 120, 1200);"],
  stripes: [60, "ctx.fillStyle = '#334155'; for (let x = -120; x < 1300; x += 120) { const o = (i * 30) % 120; ctx.beginPath(); ctx.moveTo(x + o, 0); ctx.lineTo(x + o + 60, 0); ctx.lineTo(x + o + 60 - 400, 1920); ctx.lineTo(x + o - 400, 1920); ctx.fill(); }"],
  calm: [90, "setFont(ctx, 'inter', 60, 700); ctx.fillStyle = '#f8fafc'; ctx.fillText('A calm card that reads easily', 80, 900); ctx.fillStyle = '#19e08f'; ctx.fillRect(100 + i * 5, 1100, 80, 80);"],
};

await runSkillTest({ dir: here, checks: async ({ ok, near, section }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't64_'));
  try {
    section('colour maths');
    near(contrast([255, 255, 255], [0, 0, 0]), 21, 0.001, 'white on black is 21:1'); near(relLum([255, 255, 255]), 1, 1e-9, 'white has luminance 1'); near(contrast([119, 119, 119], [255, 255, 255]), 4.48, 0.02, '#777 on white is 4.48:1 (WCAG reference)');
    const red = contrastAll([255, 40, 40], [10, 12, 16]); ok(red.protan < red.normal - 0.8 && red.min === Math.min(red.normal, red.protan, red.deutan, red.tritan), `red on near-black reads worse for protan viewers (${red.normal.toFixed(1)} vs ${red.protan.toFixed(1)})`);
    ok(simulate([255, 255, 255], 'deutan').every(v => v > 250), 'colour-blind simulation keeps white white');
    const pal = paletteContrast(); ok(pal.white.usable === 'body' && pal.text.usable === 'body' && pal.dim.usable === 'never for words' && pal.green.usable === 'body', `palette: white ${pal.white.bg}:1 body, dim ${pal.dim.bg}:1 never for words`);

    section('flash counting');
    const sq = (n, half) => Array.from({ length: n }, (_, i) => (Math.floor(i / half) % 2 ? 1 : 0));
    ok(flashesPerSecond(changes(sq(60, 2), 0.1), 30) === 7.5 && flashesPerSecond(changes(sq(90, 5), 0.1), 30) === 3 && flashesPerSecond(changes(sq(90, 4), 0.1), 30) === 4, 'square waves: 2-frame halves = 7.5 flashes a second, 5-frame = 3, 4-frame = 4');
    ok(changes([0, 0.05, 0.1, 0.15, 0.2], 0.1).length === 1 && changes([0.9, 1, 0.9, 1, 0.9], 0.1, (a, b) => Math.min(a, b) >= 0.8).length === 0, 'a slow rise is one change; white-to-white above 0.8 is not a flash');

    section('captions');
    const cue = (a, b, ...l) => ({ start: a, end: b, lines: l, text: l.join(' ') });
    ok(checkCaptions([cue(0, 2, 'Short and easy to read.'), cue(2.2, 4.5, 'Also fine here.')]).ok, 'comfortable captions pass');
    const f1 = checkCaptions([cue(0, 1, 'x'.repeat(30))]); ok(!f1.ok && f1.issues[0].rule === 'reading speed' && f1.stats.maxCps === 30, 'a 30 characters a second cue fails');
    ok(!checkCaptions([cue(0, 3, 'One'), cue(2.5, 5, 'Two')]).ok, 'overlapping cues fail'); ok(!checkCaptions([cue(0, 3, 'a', 'b', 'c')]).ok, 'three lines fail'); ok(!checkCaptions([cue(0, 0.5, 'Hi')]).ok, 'a cue under 0.8 s fails');
    ok(checkCaptions([cue(0, 3, 'x'.repeat(50))]).issues.some(i => i.rule === 'line length' && i.level === 'warn'), 'a 50-character line warns');
    const real = parseSrt(fs.readFileSync(SRT, 'utf8')), rc = checkCaptions(real); ok(real.length === 6 && rc.ok && rc.issues.filter(i => i.rule === 'line length').length === 3, `the real tt10 caption file: ${real.length} cues, no failures, ${rc.issues.length} notes (3 lines over 42 characters)`);

    section('motion kit');
    const full = motionKit('full'), red2 = motionKit('reduced'), none = motionKit('none');
    ok(full.amp(100) === 100 && red2.amp(100) === 40 && none.amp(100) === 0, 'amp: 100 / 40 / 0'); ok(full.overshoot(1.7) === 1.7 && red2.overshoot(1.7) === 1.2 && none.overshoot(1.7) === 0, 'overshoot: full / capped 1.2 / none');
    ok(full.shake(0.3, 5) !== 0 && red2.shake(0.3, 5) === 0 && none.shake(0.3, 5) === 0, 'shake only in full mode'); ok(full.spin && !red2.spin && !none.spin && none.flash(0.9) === 0 && full.flash(0.9) === 0.35, 'spin only in full; flash capped at 0.35, none in "none"');
    let threw = false; try { motionKit('loud'); } catch { threw = true; } ok(threw, 'an unknown mode throws');

    section('planted faults');
    const files = {}; for (const [n, [fr, body]] of Object.entries(FX)) { files[n] = path.join(tmp, `${n}.mjs`); fs.writeFileSync(files[n], fx(fr, body)); }
    const R = {}; for (const n of Object.keys(FX)) R[n] = await scoreCard(files[n]);
    ok(!R.strobe.pass && R.strobe.sections.photosensitivity.generalFlashesPerSecond === 7.5 && R.strobe.issues.some(i => i.level === 'fail' && i.section === 'photosensitivity'), `white/black at 7.5 flashes a second FAILS (${R.strobe.sections.photosensitivity.generalFlashesPerSecond} a second, score ${R.strobe.score})`);
    ok(R.three.pass && R.three.sections.photosensitivity.generalFlashesPerSecond === 3, 'exactly 3 flashes a second passes (the WCAG limit)'); ok(!R.fourhz.pass && R.fourhz.sections.photosensitivity.generalFlashesPerSecond === 4, '4 flashes a second FAILS');
    ok(R.slow.pass && R.slow.sections.photosensitivity.generalFlashesPerSecond === 1 && R.slow.issues.some(i => i.level === 'warn' && /brightness/.test(i.detail)), 'a 1 Hz white/black pulse passes with a brightness-jump note');
    ok(!R.red.pass && R.red.sections.photosensitivity.redFlashesPerSecond > 3 && R.red.sections.photosensitivity.generalFlashesPerSecond === 0, `a red/green strobe of equal brightness is caught as a RED flash (${R.red.sections.photosensitivity.redFlashesPerSecond} a second, no general flash)`);
    ok(!R.lowc.pass && R.lowc.sections.contrast.minRatio < 3 && R.lowc.issues.some(i => i.level === 'fail' && i.section === 'contrast'), `#475569 text on near-black FAILS contrast (${R.lowc.sections.contrast.minRatio}:1)`);
    ok(R.rushed.sections.reading.rushed.length === 1 && R.rushed.sections.reading.rushed[0].seconds <= 0.55, `a six-word line visible for ${R.rushed.sections.reading.rushed[0] && R.rushed.sections.reading.rushed[0].seconds} s is flagged as too fast to read`);
    ok(R.shake.sections.motion.level === 'strong' && R.shake.sections.motion.shakeSwingsPerSecond >= 4 && !R.shake.pass, `a whole-picture shake is caught (${R.shake.sections.motion.shakeSwingsPerSecond} swings a second, score ${R.shake.score})`);
    ok(['moderate', 'strong'].includes(R.stripes.sections.motion.level) && R.stripes.sections.motion.sustainedLargeAreaSeconds >= 1.5, `a full-screen moving pattern is caught (${R.stripes.sections.motion.sustainedLargeAreaSeconds} s of large-area motion)`);
    ok(R.calm.pass && R.calm.score >= 95 && R.calm.issues.length === 0 && R.calm.sections.motion.level === 'calm', `a calm readable card scores ${R.calm.score} with no issues`);
    ok(lines(R.calm)[0].startsWith('clean') && lines(R.strobe)[0].startsWith('FIX'), 'lines() prints FIX for failures and clean for none');

    section('the demo in three motion modes');
    const D = {}; for (const mode of ['full', 'reduced', 'none']) { const f = path.join(tmp, `demo_${mode}.mjs`); fs.writeFileSync(f, `import { makeCard } from ${JSON.stringify(new URL('./demo.mjs', import.meta.url).href)};\nconst c = makeCard(${JSON.stringify(mode)});\nexport const META = c.META; export const frame = c.frame;\n`); D[mode] = await scoreCard(f); }
    ok(Object.values(D).every(r => r.pass && r.sections.photosensitivity.pass), `all three modes pass (scores ${D.full.score} / ${D.reduced.score} / ${D.none.score})`);
    ok(D.full.score >= SHOWN, `the dial shows ${SHOWN}; this card's own score is ${D.full.score}`);
    ok(D.none.sections.motion.peakMovedFraction <= D.full.sections.motion.peakMovedFraction + 1e-9 && D.reduced.sections.motion.peakMovedFraction <= D.full.sections.motion.peakMovedFraction + 1e-9, `calmer modes never move more of the frame at once (peak ${D.full.sections.motion.peakMovedFraction} / ${D.reduced.sections.motion.peakMovedFraction} / ${D.none.sections.motion.peakMovedFraction})`);
    console.log(`  info: demo motion full ${JSON.stringify(D.full.sections.motion)} none ${JSON.stringify(D.none.sections.motion)}`);

    section('real cards');
    const hello = await scoreCard(HELLO); ok(hello.pass && hello.score >= 95, `engine hello_card scores ${hello.score}`);
    const tt = await scoreCard(TT10, { srt: SRT }); ok(tt.pass && tt.sections.photosensitivity.pass && tt.sections.contrast.minRatio >= 4.5, `ported tt10 passes: score ${tt.score}, flashes ${tt.sections.photosensitivity.generalFlashesPerSecond}, lowest contrast ${tt.sections.contrast.minRatio}:1, motion ${tt.sections.motion.level}`);
    ok(tt.sections.captions && tt.sections.captions.ok && tt.score < 100, `tt10's real caption file is read: ${tt.issues.filter(i => i.section === 'captions').length} notes, score ${tt.score}`); console.log('  info: tt10 issues:\n    ' + lines(tt).join('\n    '));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
} });
