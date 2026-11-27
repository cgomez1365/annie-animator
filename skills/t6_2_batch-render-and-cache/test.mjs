#!/usr/bin/env node
// t6.2 test: planning, fingerprint, batch vs the engine (same framesHash), unchanged / cached-encode / incremental / rejected hint /
// resume after an abort and a damaged frame, determinism report, manifest diff, gc, and the ported tt10 card; then the demo + QC.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSkillTest } from '../../engine/testkit.mjs';
import { renderCard } from '../../engine/render.mjs';
import { renderBatch, cardFingerprint, planTasks, determinismReport, diffManifests, readManifest, gc, cacheStats, estimateBatch, pngComplete } from './module.mjs';

const here = import.meta.dirname, ENGINE_INDEX = new URL('../../engine/index.mjs', import.meta.url).href;
const TT10 = path.join(here, 'ported/tt10_ops_hr.mjs');
const cardSrc = (a, b, split = 1.3, extra = '') => `import { createCanvas, begin } from ${JSON.stringify(ENGINE_INDEX)};
export const META = { W: 1080, H: 1920, fps: 30, frames: 60, coverT: 0.5, qc: { closer: false } };
const SPLIT = ${split}, A = '${a}', B = '${b}';
export function frame(t) { const { cv, ctx } = begin(t, { kicker: false }); ctx.fillStyle = t > SPLIT ? B : A; ctx.fillRect(100 + 380 * t, 800, 220, 220); ${extra} return cv; }
`;

await runSkillTest({ dir: here, checks: async ({ ok, near, section }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't62_')), cache = path.join(tmp, 'cache'), out = path.join(tmp, 'out'), P = { preview: true };
  const write = (n, s) => { const f = path.join(tmp, n); fs.writeFileSync(f, s); return f; };
  try {
    section('planning');
    ok(JSON.stringify(planTasks([0, 1, 2, 3, 4, 10, 11], 3)) === '[[0,2],[3,4],[10,11]]', 'planTasks splits runs at gaps and at the chunk size');
    ok(planTasks([], 60).length === 0, 'no missing frames, no tasks');
    near(estimateBatch([{ frames: 225, preview: false }]), 19.3, 0.5, 'estimate for one 225-frame full-size card matches the measured 17 s plus encode');
    ok(estimateBatch([{ frames: 225, preview: false, cached: 225 }]) < 3, 'cached frames cost nothing to estimate');

    section('fingerprint');
    const helper = write('helper.mjs', 'export const K = 1;\n'), data = write('data.json', '{"a":1}'), imp = write('imp.mjs', `import { K } from './helper.mjs';\nimport fs from 'node:fs';\nconst d = fs.readFileSync(new URL('./data.json', import.meta.url));\nexport const META = {W:1080,H:1920,fps:30,frames:30};\nexport function frame(){ return null; }\n`);
    const f1 = cardFingerprint(imp); ok(f1.hash === cardFingerprint(imp).hash, 'the fingerprint is stable'); ok(f1.files.length === 3 && f1.files.some(f => f.endsWith('data.json')), `it follows imports and URL-read files: ${f1.files.map(f => path.basename(f))}`);
    fs.writeFileSync(helper, 'export const K = 2;\n'); ok(cardFingerprint(imp).hash !== f1.hash, 'editing an imported file changes the hash');
    const f2 = cardFingerprint(imp).hash; fs.writeFileSync(data, '{"a":2}'); ok(cardFingerprint(imp).hash !== f2, 'editing a JSON file the card reads changes the hash');

    section('batch = engine');
    const cA = write('cardA.mjs', cardSrc('#19e08f', '#22d3ee')), cB = write('cardB.mjs', cardSrc('#f59e0b', '#ef4444'));
    const eng = await renderCard(cA, { ...P, out: path.join(tmp, 'eng'), name: 'cardA' });
    const r1 = await renderBatch([{ card: cA, ...P }, { card: cB, ...P }], { cache, out, chunk: 20 });
    ok(r1.jobs.every(j => j.status === 'rendered' && j.framesRendered === 60), `first run draws every frame: ${r1.jobs.map(j => j.status)}`);
    ok(r1.jobs[0].framesHash === eng.framesHash, 'the batch framesHash equals the engine framesHash (same frames)');
    ok(fs.existsSync(path.join(out, 'cardA_preview.mp4')) && fs.existsSync(path.join(out, 'cardA_preview_contact.png')) && fs.existsSync(path.join(out, 'batch_report.json')), 'mp4, contact sheet and batch report are written');
    ok(r1.jobs[0].framesHash !== r1.jobs[1].framesHash, 'two different cards give different hashes');

    section('unchanged and cached-encode');
    const r2 = await renderBatch([{ card: cA, ...P }, { card: cB, ...P }], { cache, out });
    ok(r2.jobs.every(j => j.status === 'unchanged' && j.framesRendered === 0), `a repeat run does nothing: ${r2.jobs.map(j => j.status)}`); ok(r2.seconds < 3, `and takes ${r2.seconds} s (under 3 s)`);
    ok(r2.jobs[0].framesHash === r1.jobs[0].framesHash, 'same hash after the repeat');
    fs.rmSync(path.join(out, 'cardB_preview.mp4')); const r3 = await renderBatch([{ card: cB, ...P }], { cache, out });
    ok(r3.jobs[0].status === 'cached-encode' && r3.jobs[0].framesRendered === 0, `a deleted mp4 is re-encoded from the cached frames: ${r3.jobs[0].status}`);
    ok(r3.jobs[0].framesHash === r1.jobs[1].framesHash, 'and the frames are the same');

    section('incremental re-render');
    const m0 = readManifest(cache, 'cardA', true);
    fs.writeFileSync(cA, cardSrc('#19e08f', '#a78bfa')); // only frames after 1.3 s change (frames 40-59)
    const r4 = await renderBatch([{ card: cA, ...P, changed: [1.3, 2.0] }], { cache, out, chunk: 10 }), j4 = r4.jobs[0];
    ok(j4.hint && j4.hint.accepted && j4.hint.checked >= 8, `the hint was checked on ${j4.hint && j4.hint.checked} frames and accepted`);
    ok(j4.framesRendered <= 22 && j4.framesReused >= 38, `only the edited seconds were drawn: ${j4.framesRendered} drawn, ${j4.framesReused} reused`);
    const eng2 = await renderCard(cA, { ...P, out: path.join(tmp, 'eng2'), name: 'cardA' }); ok(j4.framesHash === eng2.framesHash, 'the incremental result equals a full engine render of the edited card (framesHash)');
    const d = diffManifests(m0, readManifest(cache, 'cardA', true)); ok(!d.identical && d.changed.length > 0 && d.changed.every(i => i >= 39), `the manifest diff names the changed frames: ${d.ranges.map(r => r.map(x => x.toFixed(2)).join('-')).join(', ')} s`);
    ok(JSON.stringify(j4.changedFrames) === JSON.stringify(d.changed), 'the job report lists the same changed frames');
    // a wrong hint: the edit is at the start, the hint says the end
    fs.writeFileSync(cA, cardSrc('#ef4444', '#a78bfa'));
    const r5 = await renderBatch([{ card: cA, ...P, changed: [1.3, 2.0] }], { cache, out }), j5 = r5.jobs[0], eng3 = await renderCard(cA, { ...P, out: path.join(tmp, 'eng3'), name: 'cardA' });
    ok(j5.hint && !j5.hint.accepted && j5.framesRendered === 60, `a wrong hint is rejected by the check and everything is redrawn (${j5.framesRendered} frames)`); ok(j5.framesHash === eng3.framesHash, 'and the result is still correct');

    section('resume');
    fs.writeFileSync(cA, cardSrc('#ef4444', '#a78bfa', 0.9, 'ctx.fillStyle = "#fff"; ctx.fillRect(40, 40, 30, 30);'));
    let aborted = false; try { await renderBatch([{ card: cA, ...P }], { cache, out, chunk: 10, abortAfterTasks: 2 }); } catch (e) { aborted = /aborted/.test(e.message); }
    ok(aborted, 'a run that stops half way throws (simulated crash)');
    const dirA = path.join(cache, 'cardA', 'preview', cardFingerprint(cA).hash.slice(0, 12)), have = fs.readdirSync(dirA).filter(f => f.endsWith('.png'));
    ok(have.length >= 10 && have.length < 60, `${have.length} of 60 frames survived the crash`);
    fs.writeFileSync(path.join(dirA, have[0]), fs.readFileSync(path.join(dirA, have[0])).subarray(0, 500)); ok(!pngComplete(path.join(dirA, have[0])), 'a truncated frame is detected');
    const r6 = await renderBatch([{ card: cA, ...P }], { cache, out, chunk: 10 }), j6 = r6.jobs[0], eng4 = await renderCard(cA, { ...P, out: path.join(tmp, 'eng4'), name: 'cardA' });
    ok(j6.status === 'resumed' && j6.framesReused >= have.length - 1 && j6.framesRepaired === 1, `the rerun resumes: ${j6.framesReused} reused, ${j6.framesRendered} drawn, ${j6.framesRepaired} repaired`);
    ok(j6.framesHash === eng4.framesHash, 'the resumed video has exactly the frames of an uninterrupted engine render');

    console.log(`  info: small card, incremental edit drew ${j4.framesRendered} of 60 frames`);
    section('determinism report');
    const dr = await determinismReport(cA, { sample: 8, scratch: tmp }); ok(dr.deterministic && dr.checked === 8, `a clean card is deterministic (${dr.checked} frames, 3 ways)`);
    const bad = write('bad.mjs', cardSrc('#fff', '#fff', 1.3, 'ctx.fillRect(Math.random() * 900, 100, 40, 40);')); const db = await determinismReport(bad, { sample: 6, scratch: tmp });
    ok(!db.deterministic && db.mismatches.length > 0, `a card that uses Math.random is caught (${db.mismatches.length} mismatches)`);

    section('cache upkeep');
    const before = cacheStats(cache); ok(before.folders >= 4, `the cache holds ${before.folders} card versions (${Math.round(before.bytes / 1e6)} MB)`);
    const dry = gc(cache, { dryRun: true }); ok(dry.removed > 0 && cacheStats(cache).folders === before.folders, 'gc dry run counts old versions without deleting');
    const g = gc(cache); ok(g.removed === dry.removed && cacheStats(cache).folders === before.folders - g.removed, `gc removed ${g.removed} old versions and kept each card's latest`);
    const r7 = await renderBatch([{ card: cA, ...P }], { cache, out }); ok(r7.jobs[0].status === 'unchanged', 'the kept version still serves the card after gc');

    section('real card: ported tt10 (495 frames)');
    const tt = await renderBatch([{ card: TT10, ...P }], { cache, out }); ok(tt.jobs[0].status === 'rendered' && tt.jobs[0].frames === 495, `tt10 renders through the batch (${tt.jobs[0].seconds} s, 2 workers, preview)`);
    const tt2 = await renderBatch([{ card: TT10, ...P }], { cache, out }); ok(tt2.jobs[0].status === 'unchanged' && tt2.seconds < 3, `and a repeat costs ${tt2.seconds} s`);
    const ttEdit = fs.readFileSync(TT10, 'utf8').replace("end: 13.15 }", "end: 13.35 }").replace(/'\.\.\/\.\.\/\.\.\/engine\/index\.mjs'/, JSON.stringify(ENGINE_INDEX)); // the closer starts 0.2 s later
    const ttCard = write('tt10_edit.mjs', ttEdit); ok(ttEdit.includes('13.35'), 'the edit of tt10 applied');
    const tt3 = await renderBatch([{ card: ttCard, name: 'tt10_ops_hr', ...P, changed: [13.0, 16.5] }], { cache, out, contact: false }), jt = tt3.jobs[0];
    ok(jt.hint && jt.hint.accepted && jt.framesRendered < 130 && jt.framesReused > 360, `editing tt10's closer time redraws ${jt.framesRendered} of 495 frames (${jt.framesReused} reused, hint checked on ${jt.hint && jt.hint.checked}, ${jt.seconds} s)`);
    console.log(`  info: tt10 first render ${tt.jobs[0].seconds} s; repeat ${tt2.seconds} s; closer edit ${jt.seconds} s with ${jt.framesRendered} drawn / ${jt.framesReused} reused (hint checked ${jt.hint.checked} frames)`);
    const dt = await determinismReport(TT10, { sample: 8, scratch: tmp }); ok(dt.deterministic, `the ported tt10 is deterministic (${dt.checked} frames, 3 ways)`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
} });
