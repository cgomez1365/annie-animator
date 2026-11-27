// Annie engine: the shared test runner every skill's test.mjs uses.
//   import { runSkillTest } from '../../engine/testkit.mjs';
//   await runSkillTest({ dir: import.meta.dirname, checks: async ({ ok, near }) => { ... unit checks ... } });
// It runs your unit checks, renders demo.mjs through the engine (full size, or 540x960 with ANNIE_PREVIEW=1), writes
// out/demo.mp4 and out/contact.png, runs the quality checker on the card AND on the mp4, and exits 0 only if everything passed.
import fs from 'node:fs';
import path from 'node:path';
import { renderCard } from './render.mjs';
import { qcCard } from './qc.mjs';

/**
 * @param {{dir:string, demo?:string, checks?:(h:{ok:Function,near:Function,section:Function})=>Promise<void>|void, minSeconds?:number, maxSeconds?:number}} o
 * @returns {Promise<never>} exits the process
 */
export async function runSkillTest({ dir, demo = 'demo.mjs', checks, minSeconds = 5, maxSeconds = 8 }) {
  let pass = 0, fail = 0; const failures = [];
  const ok = (c, msg) => { if (c) pass++; else { fail++; failures.push(msg); console.log('FAIL', msg); } };
  const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} (+-${tol})`);
  const section = s => console.log('--', s);
  const out = path.join(dir, 'out'), card = path.join(dir, demo), preview = process.env.ANNIE_PREVIEW === '1';
  fs.mkdirSync(out, { recursive: true });
  try {
    if (checks) { section('unit checks'); await checks({ ok, near, section }); }
    section(`render demo (${preview ? '540x960 preview' : '1080x1920'})`);
    const r = await renderCard(card, { out, name: 'demo', preview });
    fs.copyFileSync(path.join(out, 'demo_contact.png'), path.join(out, 'contact.png'));
    fs.rmSync(path.join(out, 'demo_contact.png'), { force: true });
    ok(r.seconds >= minSeconds && r.seconds <= maxSeconds, `demo lasts ${r.seconds} s, must be ${minSeconds}-${maxSeconds} s`);
    ok(!r.audioStream, 'demo is silent'); ok(r.width === (preview ? 540 : 1080), `demo width ${r.width}`);
    section('quality checker');
    const q = await qcCard(card, { out, video: preview ? undefined : path.join(out, 'demo.mp4') });
    for (const i of q.issues) console.log(`  ${i.level.toUpperCase()} ${i.rule}: ${i.detail}`);
    ok(q.pass, `quality checker: ${q.issues.filter(i => i.level === 'fail').map(i => i.rule).join('; ')}`);
    fs.writeFileSync(path.join(out, 'test_result.json'), JSON.stringify({ pass: fail === 0, checksPassed: pass, checksFailed: fail, failures, demoSeconds: r.seconds, preview, framesHash: r.framesHash, qcWarnings: q.warns, motionMin: q.motion.min }, null, 1));
  } catch (e) { fail++; failures.push(e.stack || e.message); console.log('ERROR', e.stack || e.message); }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
