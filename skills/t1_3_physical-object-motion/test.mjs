#!/usr/bin/env node
// t1.3 test: the physics helpers are deterministic, bounded and physically sane; then render the demo and run the quality checker.
import { runSkillTest } from '../../engine/testkit.mjs';
import { E } from '../../engine/ease.mjs';
import { jitter, shake, bob, scatterBodies, scatterK, scatterPose, makeCells, land, drop, squash, bounce, flingOut, pilePose } from './module.mjs';

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  // jitter
  near(jitter(0, 0), 0, 1e-12, 'jitter at t=0 offset 0 is 0'); let mx = 0; for (let t = 0; t < 3; t += 0.01) mx = Math.max(mx, Math.abs(jitter(t, 1.3))); ok(mx <= 4 && mx > 3.9, `jitter peaks at its amp (${mx.toFixed(3)})`);
  ok(jitter(1.7, 2) === jitter(1.7, 2), 'jitter is deterministic'); ok(Math.abs(jitter(1.7, 2) - jitter(1.7, 3)) > 0.01, 'different offsets differ'); const sh = shake(0.9, 4); ok(Math.abs(sh.dx) <= 4 && Math.abs(sh.dy) <= 2.4 && Math.abs(sh.rot) < 0.03, 'shake stays small');
  // scatter bodies: seeded
  const a = scatterBodies(7, 40), b = scatterBodies(7, 40), c = scatterBodies(8, 40); ok(JSON.stringify(a) === JSON.stringify(b), 'same seed, same bodies'); ok(JSON.stringify(a) !== JSON.stringify(c), 'different seed, different bodies');
  ok(a.every(p => Math.abs(p.vx) <= 450 && p.vy >= -0.6 * 700 - 1e-9 && p.vy <= 0.4 * 700 + 1e-9 && Math.abs(p.spin) <= 0.6), 'velocities stay in the tt10 ranges (vx +-450, vy -420..280, spin +-0.6)');
  ok(a.filter(p => p.vy < 0).length > a.filter(p => p.vy > 0).length, 'bodies are biased upwards (more rise than fall)'); ok(new Set(a.map(p => Math.round(p.spin * 1000))).size > 30, 'spins differ per body');
  // scatter pose
  const body = { vx: 400, vy: -300, spin: 0.5 }; const p0 = scatterPose(body, { x: 100, y: 200 }, 0), p1 = scatterPose(body, { x: 100, y: 200 }, 1);
  ok(p0.x === 100 && p0.y === 200 && p0.rot === 0 && p0.alpha === 1, 'k=0 is home, unrotated, opaque'); ok(p1.x === 500 && p1.y === -100 && p1.rot === 0.5 && p1.alpha === 0, 'k=1 is home + velocity, spun, invisible');
  ok(Math.hypot(p1.x - 100, p1.y - 200) > 150, 'a scattered piece travels far (never a plain fade)');
  const half = scatterPose(body, { x: 100, y: 200 }, scatterK(0.5, 0, 1)); ok(Math.hypot(half.x - 100, half.y - 200) < 0.2 * 500, 'inCubic: half-way in time is under 20 percent of the way (it accelerates)'); ok(scatterK(0, 0, 1) === 0 && scatterK(1, 0, 1) === 1, 'scatterK endpoints');
  ok(scatterPose(body, { x: 0, y: 0 }, 1, { gravity: 400 }).y === -300 + 400, 'gravity adds k^2 * g');
  // cells
  const cells = makeCells({ seed: 20261027, x0: 96, y0: 690, cols: [56, 160, 190, 150, 170, 162], rows: 9 }); ok(cells.length === 60 && cells[0].row === -1, '6 columns x (9 rows + header) = 60 cells'); near(cells[5].x + cells[5].w, 96 + 888, 1e-9, 'columns add up to 888 px'); near(cells[6].y, 690 + 46, 1e-9, 'first body row sits under the 46 px header');
  ok(JSON.stringify(cells) === JSON.stringify(makeCells({ seed: 20261027, x0: 96, y0: 690, cols: [56, 160, 190, 150, 170, 162], rows: 9 })), 'cells are reproducible');
  // landing
  let over = 0, endK = 0; for (let t = 0; t <= 0.5; t += 0.005) { const l = land(t, { t0: 0 }); over = Math.max(over, l.scale); endK = l.scale; } ok(over > 1.05 && over < 1.15, `landing overshoots 5-15 percent (${over.toFixed(3)})`); near(endK, 1, 1e-12, 'landing ends at scale 1'); near(land(0, { t0: 0 }).dy, -60, 1e-9, 'lands from 60 px above'); near(land(0.35, { t0: 0 }).dy, 0, 1e-9, 'lands exactly in place');
  const d = drop(0.8, { t0: 0, from: -120, to: 880 }); near(d.y, 880, 1e-9, 'drop ends on the floor'); ok(drop(d.impact + 0.05, { t0: 0, from: -120, to: 880 }).y > 880, 'drop overshoots the floor after the first touch'); ok(d.impact > 0.2 && d.impact < 0.8, `impact time ${d.impact.toFixed(3)} is inside the drop`);
  near(squash(1, 2), 0, 1e-12, 'no squash before impact'); ok(squash(2.02, 2) > 0.1, 'squash is large just after impact'); ok(Math.abs(squash(3, 2)) < 0.002, 'squash has settled 1 s later');
  // bounce
  const o = { t0: 0, y0: 0, floor: 500, g: 3000, e: 0.5 }; const b0 = bounce(0, o), tf = Math.sqrt(2 * 500 / 3000);
  near(b0.y, 0, 1e-9, 'bounce starts at y0'); near(bounce(tf, o).y, 500, 1e-6, 'first touch at sqrt(2h/g)'); near(b0.impacts[0], tf, 1e-9, 'impact list starts with the fall time');
  let below = false, ymin = 1e9; for (let t = 0; t < 3; t += 0.002) { const y = bounce(t, o).y; if (y > 500 + 1e-6) below = true; if (t > tf && t < tf + 0.3) ymin = Math.min(ymin, y); } ok(!below, 'never goes through the floor'); ok(ymin < 500 - 40, 'rises after the first impact');
  const apex1 = Math.min(...Array.from({ length: 400 }, (_, i) => bounce(tf + i * (0.002), o).y)); const v1 = 3000 * tf * 0.5, h1 = v1 * v1 / (2 * 3000); near(500 - apex1, h1, 0.5, 'first hop height = (e v)^2 / 2g (e = 0.5 gives h/4)');
  ok(bounce(5, o).settled && bounce(5, o).y === 500 && bounce(5, o).vy === 0, 'comes to rest on the floor'); ok(o && bounce(0.5, o).impacts.length >= 3 && bounce(0.5, o).impacts.length <= 6, 'a handful of bounces, not dozens'); ok(bounce(tf + 0.01, o).sq > 0.1 && bounce(5, o).sq < 0.002, 'squash after impact, none at rest');
  let cont = 0, prev = bounce(0, o).y; for (let t = 0.001; t < 2; t += 0.001) { const y = bounce(t, o).y; cont = Math.max(cont, Math.abs(y - prev)); prev = y; } ok(cont < 12, `bounce path is continuous (max step ${cont.toFixed(2)} px per ms)`);
  // fling
  const f = flingOut(150, 1), g2 = flingOut(900, 1); ok(f.dx < 0 && g2.dx > 0, 'left items leave left, right items leave right'); near(f.dy, 400, 1e-9, 'they fall 400 px'); ok(f.rot < 0 && g2.rot > 0, 'they spin away from the centre'); ok(f.alpha === 0 && flingOut(150, 0).alpha === 1, 'alpha runs 1 to 0 with k');
  // pile
  const obj = { x: 900, y: 700, r: 0.1, ph: 0 }, tm = { landT: 0, exit: [2, 2.4] };
  ok(pilePose(-0.1, obj, tm) === null, 'not drawn before it lands'); ok(pilePose(0.2, obj, tm).phase === 'land', 'landing phase'); ok(pilePose(1, obj, tm).phase === 'rest', 'rest phase'); ok(pilePose(2.2, obj, tm).phase === 'exit', 'exit phase'); ok(pilePose(2.4, obj, tm) === null, 'gone after the exit');
  const rest = pilePose(1, obj, tm), later = pilePose(1.3, obj, tm); ok(rest.y !== later.y, 'a resting item keeps bobbing (nothing freezes)'); ok(Math.abs(rest.y - 700) <= 6.0001, 'bob stays within 6 px');
  const ex = pilePose(2.3, obj, tm); ok(ex.x > 900 && ex.y > 700 && ex.rot > 0.1, 'an exiting item moves out, down and turns');
} });
