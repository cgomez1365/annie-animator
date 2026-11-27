#!/usr/bin/env node
// t2.2 test: volume, limits, bounce physics, impact squash and recovery, tap and pop; then render the demo and run the quality checker.
import fs from 'node:fs';
import { runSkillTest } from '../../engine/testkit.mjs';
import { LIMITS, HARD, deform, impactSquash, flightStretch, bounce, impactTimes, bounceLook, tap, pop, area } from './module.mjs';

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  // 1 volume is kept and limits hold, for every object type and a sweep of amounts (including absurd ones)
  for (const [n, L] of Object.entries(LIMITS)) {
    let worst = 0, minSy = 9, maxSy = 0;
    for (let a = -1; a <= 1; a += 0.01) { const d = deform(a, n); worst = Math.max(worst, Math.abs(area(d) - 1)); minSy = Math.min(minSy, d.sy); maxSy = Math.max(maxSy, d.sy); }
    ok(worst < 1e-12, `${n}: sx*sy = 1 for every amount (worst error ${worst})`);
    ok(minSy >= 1 - L.squash - 1e-9 && minSy >= HARD.minSy - 1e-9, `${n}: flattest sy ${minSy.toFixed(3)} respects the limit`);
    ok(maxSy <= 1 + L.stretch + 1e-9 && maxSy <= HARD.maxSy + 1e-9, `${n}: tallest sy ${maxSy.toFixed(3)} respects the limit`);
  }
  ok(deform(0.2, 'ball').sx > 1.24 && deform(0.2, 'ball').sx < 1.26, 'squash 0.2 gives width 1.25');
  ok(deform(5, 'text').sy >= 0.9 && deform(-5, 'text').sy <= 1.12, 'text stays within 10 percent squash and 12 percent stretch');
  // 2 bounce physics
  const o = { t0: 0, y0: 200, floor: 600, g: 3000, e: 0.6 }, ts = impactTimes(o, 4), h0 = 400;
  near(bounce(ts[0], o).y, 600, 1e-6, 'first impact is exactly on the floor'); ok(ts.every((x, i) => i === 0 || x > ts[i - 1]), 'impact times increase');
  let apex = 600; for (let t = ts[0]; t < ts[1]; t += 1 / 2000) apex = Math.min(apex, bounce(t, o).y); near(600 - apex, h0 * 0.36, 1.5, 'first rebound reaches e^2 of the drop height');
  let maxY = 0; for (let t = 0; t < 3; t += 1 / 240) maxY = Math.max(maxY, bounce(t, o).y); ok(maxY <= 600 + 1e-6, 'never goes through the floor');
  ok(bounce(9, o).resting && bounce(9, o).y === 600, 'comes to rest on the floor');
  let hits = 0, prevY = 0; for (let t = 0; t < 3; t += 1 / 4000) { const y = bounce(t, o).y; if (y >= 599.9 && prevY < 599.9) hits++; prevY = y; } ok(hits >= 3, `numeric scan finds the impacts (${hits})`);
  // 3 the look: squash at impact, stretch in flight, recovery
  const look = (t, lim) => bounceLook(t, o, lim); let maxSquash = 0, maxStretch = 0, areaWorst = 0;
  for (let t = 0; t < 2.5; t += 1 / 240) { const l = look(t); maxSquash = Math.max(maxSquash, 1 - l.sy); maxStretch = Math.max(maxStretch, l.sy - 1); areaWorst = Math.max(areaWorst, Math.abs(area(l) - 1)); }
  ok(maxSquash >= 0.15 && maxSquash <= 0.3 + 1e-9, `ball squash peaks ${(maxSquash * 100).toFixed(1)} percent (15-30)`);
  ok(maxStretch >= 0.1 && maxStretch <= 0.3 + 1e-9, `ball stretch peaks ${(maxStretch * 100).toFixed(1)} percent (10-30)`);
  ok(areaWorst < 1e-9, 'area stays 1 on every frame');
  const l30 = look(ts[0] + 1 / 30, 'ball'); const squashFrames = (() => { let n = 0; for (let t = ts[0]; t < ts[0] + 0.5; t += 1 / 240) if (1 - look(t).sy > 0.1) n += 1 / 8; return n; })();
  ok(squashFrames >= 0.5 && squashFrames <= 4, `contact squash lasts ${squashFrames.toFixed(1)} frames (0.5-4)`);
  const rec = (() => { let last = 0; for (let u = 0; u < 1; u += 1 / 480) if (Math.abs(impactSquash(ts[0] + u, { t0: ts[0], amount: 0.24 })) > 0.02) last = u; return last * 30; })();
  ok(rec <= 14, `impact squash recovers within 14 frames (${rec.toFixed(1)})`);
  ok(Math.abs(impactSquash(ts[0] + 0.8, { t0: ts[0], amount: 0.24 })) < 0.002, 'squash fully settles');
  const rb = Array.from({ length: 120 }, (_, i) => impactSquash(ts[0] + i / 240, { t0: ts[0], amount: 0.24 })); ok(Math.min(...rb) < -0.02, `the rebound over-recovers into a small stretch (${Math.min(...rb).toFixed(3)})`);
  ok(flightStretch(2000) === -0.3 && flightStretch(0) === 0, 'flight stretch is capped at 0.3 and zero at rest');
  // 4 tap and pop
  let tapMax = 0, tapRec = 99; for (let i = 0; i < 480; i++) { const t = i / 480, a = tap(t, { t0: 0, amount: 0.1 }); tapMax = Math.max(tapMax, a); } for (let i = 480; i > 0; i--) { if (Math.abs(tap(i / 480, { t0: 0, amount: 0.1 })) > 0.01) { tapRec = i / 480 * 30; break; } }
  near(tapMax, 0.1, 0.001, 'tap squashes by exactly its amount'); ok(tapRec <= 14, `tap recovers within 14 frames (${tapRec.toFixed(1)})`);
  const p0 = pop(0, { t0: 0 }), pEnd = pop(3, { t0: 0 }), pEarly = pop(0.05, { t0: 0 }); near(p0.sx, 0, 1e-9, 'pop starts at 0'); near(pEnd.sx, 1, 1e-3, 'pop ends at 1 wide'); near(pEnd.sy, 1, 1e-3, 'pop ends at 1 tall');
  ok(pEarly.sy > pEarly.sx, 'pop is taller than wide at the start (stretch leads)');
  let pk = 0; for (let t = 0; t < 1; t += 1 / 240) pk = Math.max(pk, pop(t, { t0: 0 }).sy); ok(pk > 1.02 && pk < 1.3, `pop overshoots ${(100 * (pk - 1)).toFixed(0)} percent (2-30)`);
  fs.mkdirSync(`${import.meta.dirname}/out`, { recursive: true });
  fs.writeFileSync(`${import.meta.dirname}/out/measured.json`, JSON.stringify({ ballMaxSquashPct: +(maxSquash * 100).toFixed(1), ballMaxStretchPct: +(maxStretch * 100).toFixed(1), contactSquashFrames: +squashFrames.toFixed(1), recoveryFrames: +rec.toFixed(1), tapMax, tapRecoveryFrames: +tapRec.toFixed(1), popPeakPct: +(100 * (pk - 1)).toFixed(1), areaWorstError: areaWorst }, null, 1));
} });
