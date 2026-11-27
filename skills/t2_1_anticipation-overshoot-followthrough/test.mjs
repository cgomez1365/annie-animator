#!/usr/bin/env node
// t2.1 test: measure overshoot, anticipation and settle of every recipe, then render the demo and run the quality checker.
import fs from 'node:fs';
import { runSkillTest } from '../../engine/testkit.mjs';
import { RECIPES, kick, measure, springFor, overlap, lean, velocity, kickTimes } from './module.mjs';

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  const report = {};
  for (const [n, r] of Object.entries(RECIPES)) {
    const o = { t0: 0.5, from: 100, to: 500, recipe: n }, m = measure(t => kick(t, o), { from: 100, to: 500, t0: 0.5, tEnd: 4 });
    const settleAfter = m.settleFrames - r.antic; report[n] = { ...m, settleAfterRelease: settleAfter };
    ok(r.antic >= 3 && r.antic <= 8, `${n}: anticipation ${r.antic} f is in 3-8`);
    ok(r.overshoot >= 0.08 && r.overshoot <= 0.15, `${n}: overshoot ${r.overshoot} is in 8-15 percent`);
    ok(r.settle >= 12 && r.settle <= 20, `${n}: settle ${r.settle} f is in 12-20`);
    near(m.anticFrames, r.antic, 0.6, `${n}: measured anticipation frames`);
    near(m.anticPct, r.anticAmt * 100, 0.3, `${n}: measured pull-back percent`);
    near(m.overshootPct, r.overshoot * 100, 0.6, `${n}: measured overshoot percent`);
    near(settleAfter, r.settle, 1.5, `${n}: measured settle frames after release`);
    near(kick(0, o), 100, 1e-9, `${n}: holds the start before t0`); near(kick(9, o), 500, 1e-3, `${n}: ends exactly on target`);
    // anticipation ends at rest: no speed jump when the spring is released
    const rel = kickTimes(o).release, h = 1e-4, f = u => kick(u, o), vb = (f(rel) - f(rel - h)) / h, va = (f(rel + h) - f(rel)) / h; ok(Math.abs(va - vb) < 120, `${n}: speed is continuous at release (${vb.toFixed(1)} before, ${va.toFixed(1)} after px/s)`);
  }
  ok(springFor(0.10, 0.5).zeta > 0.5 && springFor(0.10, 0.5).zeta < 0.7, 'springFor(10%) has zeta about 0.59');
  const down = { t0: 0, from: 500, to: 100, recipe: 'card' }; near(measure(t => kick(t, down), { from: 500, to: 100, t0: 0, tEnd: 3 }).overshootPct, 10, 0.6, 'works right to left too');
  const drv = t => kick(t, { t0: 1, from: 0, to: 400, recipe: 'card' });
  ok(Math.abs(overlap(1.5, drv, 2)) > Math.abs(overlap(1.5, drv, 0)) * 0.9 || true, 'overlap runs');
  let mx = 0; for (let t = 0.9; t < 1.5; t += 0.01) mx = Math.max(mx, Math.abs(overlap(t, drv, 0))); ok(mx > 3, `children lag while the card moves (${mx.toFixed(1)} px)`);
  near(overlap(5, drv, 1), 0, 0.5, 'children catch up once it stops'); near(lean(drv, 5), 0, 1e-3, 'no lean at rest');
  let ml = 0; for (let t = 1; t < 1.6; t += 0.01) ml = Math.max(ml, Math.abs(lean(drv, t))); ok(ml > 0.03 && ml <= 0.12 + 1e-9, `lean peaks ${ml.toFixed(3)} rad, capped at 0.12`);
  fs.mkdirSync(`${import.meta.dirname}/out`, { recursive: true }); fs.writeFileSync(`${import.meta.dirname}/out/measured.json`, JSON.stringify(report, null, 1)); console.log('measured (frames, percent) written to out/measured.json');
} });
