#!/usr/bin/env node
// t0.2 test: unit checks of the seeded helpers + render the demo + run the quality checker. Exit 0 only if all pass.
import { runSkillTest } from '../../engine/testkit.mjs';
import { scatterField, jitter, scatterPose, scatterLoop, staggerOrder, beatChart, fingerprint } from './module.mjs';
import { rng } from '../../engine/rng.mjs';

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  const box = [0, 0, 400, 200], a = scatterField(42, 14, { box }), b = scatterField(42, 14, { box }), c = scatterField(43, 14, { box });
  ok(fingerprint(a) === fingerprint(b), 'same seed gives the same field'); ok(fingerprint(a) !== fingerprint(c), 'different seed gives a different field');
  ok(a.every(p => p.hx >= 0 && p.hx <= 400 && p.hy >= 0 && p.hy <= 200), 'homes stay inside the box');
  const j1 = jitter(1.234, 7, 4), j2 = jitter(1.234, 7, 4); ok(j1[0] === j2[0] && j1[1] === j2[1], 'jitter is deterministic'); ok(Math.abs(j1[0]) <= 4 && Math.abs(j1[1]) <= 4, 'jitter stays within amp');
  const p0 = scatterPose(a[0], 0, 0.5, { shake: 0 }); near(p0.x, a[0].hx, 1e-9, 'k=0 is home (no shake)'); const p1 = scatterPose(a[0], 1, 0.5); ok(Math.hypot(p1.x - a[0].hx, p1.y - a[0].hy) > 100, 'k=1 is flown away');
  const ks = Array.from({ length: 64 }, (_, i) => scatterLoop(3 + i * 0.05, 3)); ok(Math.min(...ks) === 0 && Math.max(...ks) > 0.95, 'scatterLoop goes home and away'); near(scatterLoop(3.0, 3), 0, 1e-12, 'loop starts at home'); near(scatterLoop(3 + 3.2, 3), scatterLoop(3, 3), 1e-12, 'loop repeats every period');
  const fw = staggerOrder(5, 1, 0.1, 0.4, 'forward'), rv = staggerOrder(5, 1, 0.1, 0.4, 'reverse'), ce = staggerOrder(5, 1, 0.1, 0.4, 'center'), r1 = staggerOrder(6, 0, 0.1, 0.4, 'random', 9), r2 = staggerOrder(6, 0, 0.1, 0.4, 'random', 9);
  near(fw[0].s, 1, 1e-12, 'forward: item 0 first'); near(rv[4].s, 1, 1e-12, 'reverse: last item first'); near(ce[2].s, 1, 1e-12, 'center: middle item first'); ok(JSON.stringify(r1) === JSON.stringify(r2), 'random order is seeded'); ok(new Set(r1.map(x => x.s.toFixed(3))).size === 6, 'random order uses every slot once');
  const ch = beatChart([['a', 2], ['b', 2, 1]], { x0: 100, width: 300 }); near(ch[1].x, 100 + 1 * 100, 1e-9, 'beatChart places an overlapping beat'); near(ch[1].x + ch[1].w, 400, 1e-9, 'beatChart ends at x0 + width');
  ok(rng(5)() === rng(5)(), 'engine rng stays deterministic');
} });
