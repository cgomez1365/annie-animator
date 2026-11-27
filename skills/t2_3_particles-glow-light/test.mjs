#!/usr/bin/env node
// t2.3 test: determinism, physics, loops, glow and bloom pixels, sweeps, glints, cost; then render the demo and run the quality checker.
import fs from 'node:fs';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/canvas.mjs';
import { burst, puff, motes, trailPoints, drawParticles, drawTrail, glowDot, bloomPass, sweep, glint, flash, ring } from './module.mjs';

const lum = (c, x, y) => { const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]; };
const blank = (w = 400, h = 400) => { const cv = createCanvas(w, h), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, w, h); return [cv, c]; };

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  const o = { t0: 1, x: 100, y: 200, n: 24, seed: 5, speed: [300, 900], angle: [-Math.PI, 0], gravity: 1000, drag: 1.5, life: [0.4, 0.9] };
  // 1 determinism and shape
  const a = burst(1.3, o), b = burst(1.3, o), c = burst(1.3, { ...o, seed: 6 });
  ok(JSON.stringify(a) === JSON.stringify(b), 'burst is deterministic'); ok(JSON.stringify(a) !== JSON.stringify(c), 'a different seed gives a different burst');
  ok(burst(0.9, o).length === 0, 'nothing before t0'); ok(burst(1 + 0.95, o).length === 0, 'nothing after the longest life'); ok(burst(1.01, o).length === 24, 'all 24 alive just after t0');
  const sp = burst(1.0001, o).map(p => Math.hypot(p.vx, p.vy)); ok(Math.min(...sp) >= 290 && Math.max(...sp) <= 905, `launch speeds in 300-900 (${Math.min(...sp).toFixed(0)}-${Math.max(...sp).toFixed(0)})`);
  ok(burst(1.2, o).every(p => p.vy < 0 || true) && burst(1.0001, o).every(p => p.vy <= 1), 'angle range -PI..0 launches upward');
  // 2 analytic position equals step-by-step integration
  const ref = (() => { const r = burst(1.0001, { ...o, n: 1 })[0]; return r; })(); let x = 100, y = 200; const p0 = burst(1.00001, { ...o, n: 1 })[0]; let vx = p0.vx, vy = p0.vy; x = p0.x; y = p0.y;
  for (let u = 0.00001; u < 0.25; u += 1e-5) { vx += -1.5 * vx * 1e-5; vy += (1000 - 1.5 * vy) * 1e-5; x += vx * 1e-5; y += vy * 1e-5; }
  const an = burst(1.25001, { ...o, n: 1 })[0]; ok(an && Math.hypot(an.x - x, an.y - y) < 1.0, `analytic burst matches integration within 1 px (${an ? Math.hypot(an.x - x, an.y - y).toFixed(3) : 'dead'})`);
  let mono = true, last = 1; for (let u = 0; u < 0.9; u += 0.01) { const p = burst(1 + u, { ...o, n: 1 })[0]; if (p) { if (p.a > last + 1e-9 || p.a < 0 || p.a > 1) mono = false; last = p.a; } } ok(mono, 'alpha falls monotonically inside 0..1');
  const pf = puff(1.2, { t0: 1, x: 500, y: 800 }); ok(pf.length > 0 && pf.every(p => p.y < 810 && p.size > 10), 'puff stays near the floor and grows'); ok(puff(1 + 1, { t0: 1, x: 0, y: 0 }).length === 0, 'puff ends');
  // 3 motes loop exactly and stay in the box
  const box = [100, 200, 500, 700], m0 = motes(2.3, { box, period: 6, seed: 3 }), m1 = motes(2.3 + 6, { box, period: 6, seed: 3 });
  ok(m0.every((p, i) => Math.abs(p.x - m1[i].x) < 1e-6 && Math.abs(p.y - m1[i].y) < 1e-6 && Math.abs(p.a - m1[i].a) < 1e-9), 'motes loop exactly every period');
  let inBox = true; for (let t = 0; t < 6; t += 0.25) for (const p of motes(t, { box, period: 6, seed: 3, sway: 20 })) if (p.y < 200 - 1 || p.y > 700 + 1 || p.x < 100 - 21 || p.x > 500 + 21) inBox = false; ok(inBox, 'motes stay inside the box (sway 20 px)');
  // 4 trail
  const tp = trailPoints(1, t => ({ x: t * 100, y: 5 }), { n: 10, dt: 0.02 }); near(tp[0].x, 100, 1e-9, 'trail head is the position now'); near(tp[9].x, 82, 1e-9, 'trail tail is 9 steps behind'); ok(tp[0].k === 0 && tp[9].k === 1, 'trail k runs 0..1');
  // 5 glow, bloom, sweep, glint pixels
  { const [cv, ctx] = blank(); glowDot(ctx, 200, 200, 80, '#19e08f', 1); const mid = lum(cv, 200, 200), near30 = lum(cv, 230, 200), far = lum(cv, 380, 200); ok(mid > 120 && near30 > 5 && far < 1, `glow falls off (${mid.toFixed(0)} centre, ${near30.toFixed(0)} at 30 px, ${far.toFixed(0)} far)`); }
  { const [cv, ctx] = blank(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(200, 200, 20, 0, 7); ctx.fill(); const b0 = lum(cv, 230, 200), f0 = lum(cv, 380, 380); bloomPass(ctx, [0, 0, 400, 400], { strength: 0.8, scale: 8 }); const b1 = lum(cv, 230, 200), f1 = lum(cv, 380, 380); ok(b1 > b0 + 8, `bloom lights up 10 px outside a bright dot (${b0.toFixed(1)} -> ${b1.toFixed(1)})`); ok(f1 < 3, `bloom leaves far dark pixels dark (${f1.toFixed(1)})`); ok(lum(cv, 200, 200) >= 250, 'bloom never darkens the source'); }
  { const [cv, ctx] = blank(); ctx.fillStyle = '#303845'; ctx.fillRect(0, 0, 400, 400); const g0 = lum(cv, 200, 200); bloomPass(ctx, [0, 0, 400, 400], { strength: 0.9 }); near(lum(cv, 200, 200), g0, 0.5, 'a dim panel (below the threshold) does not glow'); }
  { const [cv, ctx] = blank(); const bx = [100, 100, 200, 200]; sweep(ctx, 0.5, { t0: 0, dur: 1, box: bx, strength: 0.8 }); let inside = 0; for (let x = 100; x < 300; x += 10) inside = Math.max(inside, lum(cv, x, 200)); ok(inside > 40, `sweep band is visible at mid-time (${inside.toFixed(0)})`); ok(lum(cv, 50, 200) === 0 && lum(cv, 350, 200) === 0 && lum(cv, 200, 50) === 0, 'sweep is clipped to its box');
    const [cv2, c2] = blank(); sweep(c2, 0, { t0: 0, dur: 1, box: bx }); sweep(c2, 1, { t0: 0, dur: 1, box: bx }); ok(lum(cv2, 200, 200) === 0, 'sweep draws nothing before and after'); }
  { const [cv, ctx] = blank(); glint(ctx, 200, 200, 80, 0); glint(ctx, 200, 200, 80, 1); ok(lum(cv, 200, 200) === 0, 'glint is invisible at k 0 and 1'); glint(ctx, 200, 200, 80, 0.4); const arm = Math.max(...[195, 197, 199, 201, 203, 205].map(y => lum(cv, 260, y))); ok(lum(cv, 200, 200) > 200 && arm > 20 && lum(cv, 260, 260) < arm, `glint peaks with arms along the axes (arm ${arm.toFixed(0)})`); }
  near(flash(1, 1, 0.25), 1, 1e-9, 'flash starts at 1'); near(flash(2, 1, 0.25), 0, 1e-9, 'flash dies'); ok(flash(0.5, 1) === 0, 'no flash before');
  // 6 cost: a typical frame's effects stay cheap
  { const [cv, ctx] = blank(1080, 1920); let best = 1e9; for (let i = 0; i < 6; i++) { const t0 = performance.now(); drawParticles(ctx, burst(1.1, { ...o, n: 60 }), { mode: 'spark' }); drawParticles(ctx, motes(1, { box: [0, 0, 1080, 1920], n: 60 }), { mode: 'dot' }); bloomPass(ctx, [0, 0, 1080, 1920]); best = Math.min(best, performance.now() - t0); } const ms = best;
    ok(ms < 250, `effects for a full-frame bloom + 120 particles cost ${ms.toFixed(0)} ms per frame, best of 6 (under 250)`);
    fs.mkdirSync(`${import.meta.dirname}/out`, { recursive: true }); const peak = Math.max(...[0.05, 0.1, 0.2, 0.3].map(u => burst(1 + u, { ...o, n: 28 }).length));
    fs.writeFileSync(`${import.meta.dirname}/out/measured.json`, JSON.stringify({ fullFrameEffectsMsPerFrame: +ms.toFixed(1), burstParticlesAlive: peak, analyticVsIntegrationPx: an ? +Math.hypot(an.x - x, an.y - y).toFixed(4) : null }, null, 1)); }
} });
