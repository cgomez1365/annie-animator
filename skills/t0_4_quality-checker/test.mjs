#!/usr/bin/env node
// t0.4 test: unit checks of the lint helpers (run on real fixture cards) + render the demo + run the quality checker.
import os from 'node:os';
import path from 'node:path';
import { runSkillTest } from '../../engine/testkit.mjs';
import { FIXES, explain, lint, checkBox, floorPx, contrastRatio, claims } from './module.mjs';

const FIX = path.join(import.meta.dirname, '../../engine/tests/fixtures');
await runSkillTest({ dir: import.meta.dirname, checks: async ({ ok, near }) => {
  ok(checkBox({ x0: 100, y0: 300, x1: 600, y1: 400 }).ok, 'a box in the safe area is fine');
  const hi = checkBox({ x0: 100, y0: 100, x1: 600, y1: 160 }); ok(!hi.ok && hi.problems.includes('above y 250') && hi.nudge.dy === 150, 'a box above y 250 is flagged and nudged down');
  const lo = checkBox({ x0: 100, y0: 1550, x1: 600, y1: 1620 }); ok(!lo.ok && lo.nudge.dy < 0 && 1620 + lo.nudge.dy < 1580, 'a box below y 1580 is nudged up');
  const rail = checkBox({ x0: 600, y0: 900, x1: 1000, y1: 960 }); ok(!rail.ok && rail.nudge.dx === -60, 'a box reaching x 1000 in the rail is nudged left'); ok(checkBox({ x0: 600, y0: 400, x1: 1000, y1: 460 }).ok, 'x 1000 is fine above y 800');
  ok(floorPx(30) === 42 && floorPx(60) === 60, 'floorPx'); near(contrastRatio('#000000', '#ffffff'), 21, 1e-9, 'contrast black on white'); ok(contrastRatio('#f8fafc', '#0a0c10') > 15 && contrastRatio('#475569', '#0a0c10') < 4.5, 'contrast: white on bg is high, dim on bg is below 4.5');
  ok(claims('Only $9 a month').length >= 1 && claims('Your private notes').length === 1 && claims('Tools that work for you.').length === 0, 'claims pre-check');
  ok(FIXES.every(f => f.what && f.fix), 'every fix has a what and a fix');
  const bad = await lint(path.join(FIX, 'unsafe_card.mjs'), { out: path.join(os.tmpdir(), 't04_unsafe') });
  ok(!bad.pass && bad.lines.length >= 5 && bad.lines.every(l => /->/.test(l)), 'lint explains every issue with a fix');
  ok(bad.lines.some(l => /half a second|top bar|caption|buttons|read|brand/.test(l)), 'lint lines are in plain words'); ok(explain({ rule: 'text above y 250', level: 'fail' }).fix.includes('250'), 'explain finds the fix');
  const good = await lint(path.join(FIX, 'clean_card.mjs'), { out: path.join(os.tmpdir(), 't04_clean') }); ok(good.pass && good.lines[0].startsWith('clean'), 'lint says clean for a clean card');
} });
