#!/usr/bin/env node
// t2.5 test: path parsing and lengths against independent references, resampling, trims on real pixels, morph endpoints and alignment,
// icon morphs with unequal subpath counts, constant speed and smooth heading along a path; then render the demo and run the quality checker.
import fs from 'node:fs';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/canvas.mjs';
import { RECIPES, parseSvgPath, makePath, iconPath, iconPaths, place, resample, pointAt, drawOn, prepareMorph, morphPath, follow, chaseWindow, pathFromPoints, bbox } from './module.mjs';

const N = 400, fresh = () => { const cv = createCanvas(N, N), ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, N, N); return { cv, ctx }; };
const lit = (ctx, x0, x1, y0 = 0, y1 = N) => { const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 60) n++; return n; };
// independent reference: cubic length by 20000-step summation
const cubicLen = (p0, p1, p2, p3) => { let L = 0, px = p0[0], py = p0[1]; for (let i = 1; i <= 20000; i++) { const u = i / 20000, v = 1 - u, x = v ** 3 * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u ** 3 * p3[0], y = v ** 3 * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u ** 3 * p3[1]; L += Math.hypot(x - px, y - py); px = x; py = y; } return L; };

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  // 1 parsing and lengths
  const rect = makePath('M0 0 h10 v10 h-10 z'); near(rect.len, 40, 1e-9, 'relative h v and z: a 10 square has length 40'); ok(rect.subs[0].closed, 'z closes the subpath');
  const half = makePath('M0 0 a10 10 0 0 1 20 0', { step: 0.1 }); near(half.len / (10 * Math.PI), 1, 0.003, 'half circle by arc has length pi r (within 0.3 percent)');
  const flags = makePath('M0 0a10 10 0 01 20 0', { step: 0.1 }); near(flags.len / (10 * Math.PI), 1, 0.003, 'compact arc flags ("0 01 20 0") parse');
  const cub = makePath('M0 0 C 0 10 10 10 10 0', { step: 0.05 }); near(cub.len / cubicLen([0, 0], [0, 10], [10, 10], [10, 0]), 1, 0.001, 'cubic length matches a 20000-step reference (0.1 percent)');
  const q = makePath('M0 0 Q 5 10 10 0', { step: 0.05 }); const qRef = cubicLen([0, 0], [10 / 3, 20 / 3], [20 / 3, 20 / 3], [10, 0]); near(q.len / qRef, 1, 0.001, 'quadratic converts to the same curve');
  ok(parseSvgPath('M1 2 L3 4 H5 V6 Z').map(c => c[0]).join('') === 'MLLLZ', 'H and V become L'); ok(parseSvgPath('M0 0 S 1 1 2 2').length === 2 && parseSvgPath('M0 0 Q 1 1 2 0 T 4 0').length === 3, 'S and T parse');
  const circ = iconPath('circle-check', { step: 0.05 }); ok(circ.subs.length === 2 && circ.subs[0].closed, 'circle-check icon parses into 2 subpaths');
  for (const n of ['play', 'pause', 'menu', 'x', 'heart', 'star', 'send', 'check', 'bell', 'sun']) { const p = iconPath(n); ok(p.len > 5 && p.subs.every(s => s.pts.every(pt => pt.every(Number.isFinite))), `icon ${n} flattens to finite points (length ${p.len.toFixed(1)})`); }
  { const pr = makePath(iconPaths('circle').join(' '), { step: 0.05 }); near(pr.len / (2 * Math.PI * 10), 1, 0.003, 'lucide circle (r 10) is 2 pi r within 0.3 percent'); const p2 = iconPath('pause'); const bb = bbox(p2); ok(bb[0] >= 4.9 && bb[0] <= 5.1 && bb[2] >= 18.9 && bb[2] <= 19.1, 'pause bars span x 5 to 19 as the icon file says'); }
  // 2 resample
  { const line = [[0, 0], [100, 0], [100, 100]], r = resample(line, 21); const gaps = r.slice(1).map((p, i) => Math.hypot(p[0] - r[i][0], p[1] - r[i][1])); ok(r.length === 21 && Math.max(...gaps) - Math.min(...gaps) < 1e-9 + 8 * 0.5, `resample spaces points evenly (gap ${Math.min(...gaps).toFixed(2)}-${Math.max(...gaps).toFixed(2)})`); near(r[0][0], 0, 1e-12, 'resample keeps the first point'); near(r[20][1], 100, 1e-9, 'resample keeps the last point'); }
  // 3 trims on real pixels
  { const L = makePath('M50 200 L350 200', { step: 5 }); const { ctx } = fresh(); drawOn(ctx, L, { to: 0.5, width: 10, cap: 'butt' }); ok(lit(ctx, 40, 202) > 0 && lit(ctx, 205, 360) === 0, 'drawOn to 0.5 stops at the middle'); near(lit(ctx, 0, N) / (150 * 10), 1, 0.05, 'half a 300 px line is 150 px long (area within 5 percent)');
    const a = fresh(); drawOn(a.ctx, L, { to: 0, width: 10 }); ok(lit(a.ctx, 0, N) === 0, 'drawOn to 0 draws nothing'); const b = fresh(); drawOn(b.ctx, L, { from: 0.4, to: 0.6, width: 10, cap: 'butt' }); ok(lit(b.ctx, 50, 168) === 0 && lit(b.ctx, 172, 228) > 0 && lit(b.ctx, 232, 360) === 0, 'drawOn from 0.4 to 0.6 is a window');
    const w = chaseWindow(0.5, 0.25); near(w.to - w.from, 0.25, 1e-9, 'chase window keeps its length'); ok(chaseWindow(0, 0.25).to === 0 && chaseWindow(1, 0.25).from === 1, 'chase window starts and ends off the path');
    const two = pathFromPoints([{ pts: [[50, 100], [150, 100]] }, { pts: [[50, 300], [150, 300]] }]); const t2 = fresh(); drawOn(t2.ctx, two, { to: 0.75, width: 10, cap: 'butt' }); ok(lit(t2.ctx, 0, N, 90, 110) > 900 && lit(t2.ctx, 0, N, 290, 310) > 400 && lit(t2.ctx, 0, N, 290, 310) < 600, 'trim runs across subpaths: 0.75 = first line plus half the second'); }
  // 4 morph
  const sq = place(makePath('M0 0 H1 V1 H0 Z', { step: 0.01 }), { x: 100, y: 100, s: 200 }), ci = place(makePath('M 0.5 0 A 0.5 0.5 0 1 1 0.5 1 A 0.5 0.5 0 1 1 0.5 0 Z', { step: 0.01 }), { x: 100, y: 100, s: 200 });
  { const prep = prepareMorph(sq, ci, { n: 120 }); const p0 = morphPath(prep, 0), p1 = morphPath(prep, 1, {}); const dA = p0.subs[0].pts.slice(0, 120).reduce((s, q, i) => s + Math.hypot(q[0] - prep.pairs[0].a[i][0], q[1] - prep.pairs[0].a[i][1]), 0), dB = p1.subs[0].pts.slice(0, 120).reduce((s, q, i) => s + Math.hypot(q[0] - prep.pairs[0].b[i][0], q[1] - prep.pairs[0].b[i][1]), 0);
    near(dA, 0, 1e-9, 'morph at 0 is shape A'); near(dB, 0, 1e-9, 'morph at 1 is shape B');
    let prevD = 0, mono = true; for (let k = 0; k <= 1.0001; k += 0.1) { const m = morphPath(prep, k, { stagger: 0 }), d = m.subs[0].pts.slice(0, 120).reduce((s, q, i) => s + Math.hypot(q[0] - prep.pairs[0].a[i][0], q[1] - prep.pairs[0].a[i][1]), 0); if (d < prevD - 1e-6) mono = false; prevD = d; } ok(mono, 'distance from A grows as k grows');
    const mid = morphPath(prep, 0.5, { stagger: 0 }); const bb = bbox(mid); ok(bb[0] > 99 && bb[2] < 301, 'the half-way shape stays inside the bounds of A and B');
    const c1 = fresh(); drawOn(c1.ctx, morphPath(prep, 0.5), { width: 4 }); ok(lit(c1.ctx, 0, N) > 800, 'a morph frame draws');
    // alignment: a shape morphing to a copy of itself that starts at another corner must not travel
    const sq2 = pathFromPoints([{ closed: true, pts: [[300, 100], [300, 300], [100, 300], [100, 100], [300, 100]] }]), sq1 = pathFromPoints([{ closed: true, pts: [[100, 100], [300, 100], [300, 300], [100, 300], [100, 100]] }]), pr2 = prepareMorph(sq1, sq2, { n: 120 });
    ok(pr2.pairs[0].costAligned < pr2.pairs[0].costDirect * 0.05 + 1e-6, `alignment finds the matching start point and direction (travel ${pr2.pairs[0].costAligned.toFixed(0)} vs ${pr2.pairs[0].costDirect.toFixed(0)} unaligned)`); }
  // 5 icon morphs with unequal subpath counts
  { for (const [a, b] of [['play', 'pause'], ['menu', 'x'], ['pause', 'circle-check'], ['circle-check', 'heart']]) {
      const A = place(iconPath(a), { x: 0, y: 0, s: 10 }), B = place(iconPath(b), { x: 0, y: 0, s: 10 }), prep = prepareMorph(A, B), m1 = morphPath(prep, 1), m0 = morphPath(prep, 0);
      ok(prep.pairs.length === Math.max(A.subs.length, B.subs.length), `${a} -> ${b}: ${prep.pairs.length} pairs for ${A.subs.length} and ${B.subs.length} subpaths`);
      near(m1.len / B.len, 1, 0.03, `${a} -> ${b}: at k 1 the length equals ${b} (within 3 percent)`); near(m0.len / A.len, 1, 0.03, `${a} -> ${b}: at k 0 the length equals ${a}`);
      const dB = bbox(m1), eB = bbox(B); ok(Math.abs(dB[0] - eB[0]) < 0.2 && Math.abs(dB[2] - eB[2]) < 0.2 && Math.abs(dB[3] - eB[3]) < 0.2, `${a} -> ${b}: final bounds match ${b}`); } }
  // 6 motion along a path
  { const S = makePath('M 0 0 C 100 -200, 200 200, 300 0', { step: 1 }); const f0 = follow(S, 0), f1 = follow(S, 1); near(f0.x, 0, 1e-9, 'follow starts at the first point'); near(f1.x, 300, 1e-6, 'follow ends at the last point');
    const speeds = []; for (let k = 0.02; k < 0.98; k += 0.02) { const a = pointAt(S, k), b = pointAt(S, k + 0.001); speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / 0.001); } const mean = speeds.reduce((a, b) => a + b) / speeds.length; ok(Math.max(...speeds) / Math.min(...speeds) < 1.02, `constant speed along an S curve (spread ${(Math.max(...speeds) / Math.min(...speeds)).toFixed(4)}), mean ${mean.toFixed(0)} px per unit k, curve length ${S.len.toFixed(0)}`);
    let maxTurn = 0, prev = pointAt(S, 0).angle; for (let k = 1 / 90; k <= 1.0001; k += 1 / 90) { const a = pointAt(S, k).angle; let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; maxTurn = Math.max(maxTurn, Math.abs(d)); prev = a; } ok(maxTurn < 0.3, `heading turns at most ${maxTurn.toFixed(3)} rad per frame over a 3 s ride (under 0.3)`);
    ok(Math.abs(pointAt(makePath('M0 0 L100 0'), 0.5).angle) < 1e-9 && Math.abs(pointAt(makePath('M0 0 L0 100'), 0.5).angle - Math.PI / 2) < 1e-9, 'heading is 0 along +x and pi/2 along +y'); ok(follow(S, 0.5, { orient: false }).angle === 0, 'orient false keeps it upright'); }
  for (const [n, r] of Object.entries(RECIPES)) ok(r.dur >= 0.5 && r.dur <= 1.7, `${n}: recipe duration ${r.dur} s is in 0.5-1.7`);
  fs.mkdirSync(`${import.meta.dirname}/out`, { recursive: true });
  const S2 = makePath('M 0 0 C 100 -200, 200 200, 300 0', { step: 1 });
  fs.writeFileSync(`${import.meta.dirname}/out/measured.json`, JSON.stringify({ halfCircleLengthRatio: +(half.len / (10 * Math.PI)).toFixed(5), cubicLengthRatio: +(cub.len / cubicLen([0, 0], [0, 10], [10, 10], [10, 0])).toFixed(5), sCurveLength: +S2.len.toFixed(1), iconLengths: Object.fromEntries(['play', 'pause', 'menu', 'x', 'check', 'heart'].map(n => [n, +iconPath(n).len.toFixed(1)])) }, null, 1));
} });
