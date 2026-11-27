#!/usr/bin/env node
// t0.1 test: unit checks of the recipes + render the demo + run the quality checker. Exit 0 only if all pass.
import { runSkillTest } from '../../engine/testkit.mjs';
import { RECIPES, play, drop, impactTime, recipeFor, springLegs, sampleCurve, overshoot } from './module.mjs';
import { spring, SPRING } from '../../engine/spring.mjs';

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  for (const [n, r] of Object.entries(RECIPES)) { near(play(0, 1, n), 0, 1e-9, `${n} starts at 0`); near(play(1 + r.dur, 1, n), 1, 1e-9, `${n} ends at 1`); ok(r.dur >= 0.3 && r.dur <= 1.6, `${n} duration is in the house range`); }
  ok(overshoot('outBack') > 0.09 && overshoot('outBack') < 0.11, `outBack(1.70158) overshoots about 10 percent (${overshoot('outBack').toFixed(3)})`);
  ok(overshoot('outCubic') === 0 && overshoot('linear') === 0, 'outCubic and linear never overshoot');
  ok(overshoot('outElastic') > 0.2, 'outElastic overshoots hard');
  near(sampleCurve('linear', 4)[2], 0.5, 1e-12, 'sampleCurve');
  const it = impactTime(0.8, 1.5); ok(it > 0.3 && it < 0.6, `impact is mid-drop (${it.toFixed(3)} s)`);
  const d0 = drop(0, { t0: 1, from: -100, to: 800 }), dI = drop(1 + it + 0.02, { t0: 1, from: -100, to: 800 }), dEnd = drop(3, { t0: 1, from: -100, to: 800 });
  near(d0.y, -100, 1e-9, 'drop starts at from'); ok(dI.squash > 0.1, 'squash is large just after impact'); near(dEnd.y, 800, 1e-6, 'drop ends at the floor'); near(dEnd.squash, 0, 1e-3, 'squash settles');
  ok(Math.max(...Array.from({ length: 60 }, (_, i) => drop(1 + i / 60, { t0: 1, from: -100, to: 800 }).y)) > 800, 'drop overshoots the floor (the bounce)');
  ok(recipeFor('pill lands') === 'pop' && recipeFor('leaves the screen') === 'exit' && recipeFor('cursor moves') === 'marker' && recipeFor('stamp') === 'slam' && recipeFor('text appears') === 'enter', 'recipeFor maps plain jobs');
  near(springLegs(0, 1, 1, [1, 0]), 0, 1e-12, 'springLegs holds 0 before the first leg'); near(springLegs(5, 1, 1.1, [1, 0]), 0, 0.02, 'springLegs settles on the last target');
  near(springLegs(1.5, 1, 1.1, [1, 0]), spring(0.5, { from: 0, to: 1, ...SPRING.bouncy }), 1e-9, 'springLegs equals spring in the first leg');
} });
