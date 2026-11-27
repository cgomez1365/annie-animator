#!/usr/bin/env node
// Engine self-tests. Exit 0 only if every check passes.   node engine/tests/run.mjs [--quick]  (--quick skips the video renders)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { E, clamp, lerp, prog, remap, smoothstep, mix, damp, cubicBezier } from '../ease.mjs';
import { spring, springState, springPath, followThrough, SPRING, settleTime } from '../spring.mjs';
import { rng, noise1, noise2, fbm, pick, shuffle, hash } from '../rng.mjs';
import { track, sequence, stagger, timeline, page, pages, loop } from '../timeline.mjs';
import { setFont, textW, wrapText, fitText, createCanvas, GlobalFonts } from '../canvas.mjs';
import { P, SAFE, SLOGAN, claimViolations } from '../brand.mjs';
import { qcCard } from '../qc.mjs';
import { loadCard, renderFrame, renderCard } from '../render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENGINE = path.join(HERE, '..');
const quick = process.argv.includes('--quick');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const section = s => console.log('--', s);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'annie_selftest_'));

// ---------------------------------------------------------------- easing
section('easing');
const names = Object.keys(E);
ok(names.length >= 25, `E has ${names.length} curves`);
for (const n of names) { near(E[n](0), 0, 1e-9, `${n}(0)`); near(E[n](1), 1, 1e-9, `${n}(1)`); }
const mono = ['linear', 'inQuad', 'outQuad', 'inOutQuad', 'inCubic', 'outCubic', 'inOutCubic', 'inQuart', 'outQuart', 'inOutQuart', 'inExpo', 'outExpo', 'inOutExpo', 'inSine', 'outSine', 'inOutSine', 'inCirc', 'outCirc', 'inOutCirc'];
for (const n of mono) { let prev = -1, good = true; for (let i = 0; i <= 200; i++) { const v = E[n](i / 200); if (v < prev - 1e-12) good = false; prev = v; } ok(good, `${n} is monotonic`); }
for (const n of ['inQuad', 'inCubic', 'inQuart', 'inExpo', 'inSine', 'inCirc']) ok(E[n](0.5) < 0.5, `${n} starts slow`);
for (const n of ['outQuad', 'outCubic', 'outQuart', 'outExpo', 'outSine', 'outCirc']) ok(E[n](0.5) > 0.5, `${n} starts fast`);
ok(Math.max(...Array.from({ length: 101 }, (_, i) => E.outBack(i / 100))) > 1.05, 'outBack overshoots');
ok(Math.min(...Array.from({ length: 101 }, (_, i) => E.inBack(i / 100))) < -0.05, 'inBack pulls back first');
ok(E.outBack(0.5, 3) > E.outBack(0.5, 1), 'outBack s grows the overshoot');
{ let sign = 0, flips = 0; for (let i = 1; i < 400; i++) { const d = E.outElastic(i / 400) - 1, s = Math.sign(d); if (s && sign && s !== sign) flips++; if (s) sign = s; } ok(flips >= 3, `outElastic oscillates (${flips} crossings)`); }
ok(Array.from({ length: 101 }, (_, i) => E.outBounce(i / 100)).every(v => v >= -1e-9 && v <= 1 + 1e-9), 'outBounce stays in 0..1');
near(E.inBounce(0.3), 1 - E.outBounce(0.7), 1e-12, 'inBounce mirrors outBounce');
near(E.outElastic(0.5, 1, 0.3), E.outElastic(0.5), 1e-12, 'outElastic defaults');
near(clamp(5, 0, 1), 1, 0, 'clamp'); near(lerp(10, 20, 0.25), 12.5, 1e-12, 'lerp'); near(prog(5, 4, 6), 0.5, 1e-12, 'prog'); near(prog(9, 4, 6), 1, 0, 'prog clamps');
near(remap(5, 0, 10, 100, 200), 150, 1e-12, 'remap'); near(smoothstep(0.5), 0.5, 1e-12, 'smoothstep(x)'); near(smoothstep(0, 10, 2.5), 0.15625, 1e-12, 'smoothstep(a,b,x)');
ok(mix('#000000', '#ffffff', 0.5) === 'rgb(128,128,128)', 'mix'); near(damp(0, 10, 8, 1 / 30), 10 * (1 - Math.exp(-8 / 30)), 1e-12, 'damp');
{ const lin = cubicBezier(0, 0, 1, 1), ease = cubicBezier(0.42, 0, 0.58, 1); near(lin(0.37), 0.37, 1e-5, 'cubicBezier linear'); near(ease(0.5), 0.5, 1e-5, 'cubicBezier ease-in-out symmetric'); ok(ease(0.2) < 0.2 && ease(0.8) > 0.8, 'cubicBezier ease-in-out shape'); near(cubicBezier(0.25, 0.1, 0.25, 1)(1), 1, 0, 'cubicBezier end'); }

// ---------------------------------------------------------------- spring
section('spring');
{
  for (const [label, o] of [['bouncy', SPRING.bouncy], ['critical', SPRING.critical], ['over', { k: 100, c: 40 }], ['wobbly', SPRING.wobbly]]) {
    near(spring(0, { from: 3, to: 9, ...o }), 3, 1e-12, `${label} starts at from`); near(spring(12, { from: 3, to: 9, ...o }), 9, 1e-3, `${label} converges`);
    // analytic matches a tiny-step integration
    let x = 3, v = 0; const dt = 1e-4, m = 1; for (let i = 0; i < 10000; i++) { const a = (o.k * (9 - x) - o.c * v) / m; v += a * dt; x += v * dt; }
    near(spring(1, { from: 3, to: 9, ...o }), x, 0.02, `${label} matches integration at 1 s`);
    const [x1, v1] = springState(0.4, { from: 3, to: 9, ...o }), h = 1e-6; near((spring(0.4 + h, { from: 3, to: 9, ...o }) - spring(0.4 - h, { from: 3, to: 9, ...o })) / (2 * h), v1, 1e-3, `${label} velocity is the derivative`);
  }
  ok(Math.max(...Array.from({ length: 300 }, (_, i) => spring(i / 100, { to: 1, ...SPRING.bouncy }))) > 1.05, 'bouncy overshoots');
  ok(Math.max(...Array.from({ length: 300 }, (_, i) => spring(i / 100, { to: 1, ...SPRING.critical }))) <= 1 + 1e-9, 'critical never overshoots');
  ok(Array.isArray(springState(0.3, { v0: 5 })) && springState(0, { v0: 5 })[1] === 5, 'springState returns [x, v] and keeps v0');
  const sp = t => springPath(t, [{ t: 0.5, v: 100 }, { t: 1.5, v: 40 }], { from: 0 });
  near(sp(0.2), 0, 1e-12, 'springPath holds before first key'); near(sp(1.45), 100, 5, 'springPath settles at first target'); near(sp(6), 40, 0.05, 'springPath reaches the last target');
  ok(Math.abs(sp(1.5 + 1e-6) - sp(1.5 - 1e-6)) < 1e-3, 'springPath is continuous at a retarget');
  const drv = t => (t < 0.5 ? 0 : 100); near(followThrough(0.2, drv), 0, 1e-9, 'followThrough quiet before the move'); ok(followThrough(0.62, drv) < 90 && followThrough(0.62, drv) > 0, 'followThrough lags the driver'); near(followThrough(6, drv), 100, 0.5, 'followThrough settles');
  const a1 = followThrough(1.0, drv, { k: 140, c: 9 }); followThrough(0.4, drv, { k: 140, c: 9 }); near(followThrough(1.0, drv, { k: 140, c: 9 }), a1, 1e-12, 'followThrough is order independent (memo)');
  ok(settleTime({ to: 1, ...SPRING.bouncy }) > 0.3 && settleTime({ to: 1, ...SPRING.bouncy }) < 2, 'settleTime is sensible');
}

// ---------------------------------------------------------------- rng, noise, timeline
section('rng and timeline');
{
  const a = rng(42), b = rng(42), xs = Array.from({ length: 1000 }, () => a()), ys = Array.from({ length: 1000 }, () => b());
  ok(xs.every((v, i) => v === ys[i]), 'rng is deterministic'); ok(xs.every(v => v >= 0 && v < 1), 'rng in [0,1)');
  near(xs.reduce((p, c) => p + c, 0) / 1000, 0.5, 0.04, 'rng mean'); ok(new Set(xs).size > 990, 'rng does not repeat early');
  near(rng(1)(), ((1103515245 + 12345) & 0x7fffffff) / 2147483648, 0, 'rng first value follows the spec formula');
  { let s = 12345; const r = rng(12345); let good = true; for (let i = 0; i < 50; i++) { s = Number((BigInt(s) * 1103515245n + 12345n) & 0x7fffffffn); if (r() !== s / 2147483648) good = false; } ok(good, 'rng equals exact integer LCG (BigInt)'); }
  ok(rng('abc')() === rng('abc')() && rng('abc')() !== rng('abd')(), 'string seeds'); ok(hash('x') === hash('x') && hash('x') !== hash('y'), 'hash');
  const f = rng(7).fork(1), g = rng(7).fork(2); ok(f() !== g(), 'fork streams differ');
  ok(noise1(3.3, 5) === noise1(3.3, 5), 'noise1 deterministic'); ok(Array.from({ length: 500 }, (_, i) => noise1(i * 0.37)).every(v => v >= -1 && v <= 1), 'noise1 range');
  ok(Math.abs(noise1(2.001) - noise1(2)) < 0.02, 'noise1 is smooth'); ok(Math.abs(noise2(1.2, 3.4, 1)) <= 1 && noise2(1, 2, 3) === noise2(1, 2, 3), 'noise2'); ok(Math.abs(fbm(1.3, 2.1, { octaves: 5 })) <= 1, 'fbm range');
  const arr = [1, 2, 3, 4, 5, 6, 7, 8], sh = shuffle(rng(3), arr); ok([...sh].sort().join() === arr.join() && sh.join() !== arr.join() && arr.join() === '1,2,3,4,5,6,7,8', 'shuffle permutes a copy'); ok(arr.includes(pick(rng(1), arr)), 'pick');
  const tk = track([[0, 0], [1, 10, 'outCubic'], [2, 0]]); near(tk(-1), 0, 0, 'track holds first'); near(tk(1), 10, 1e-12, 'track hits a key'); near(tk(3), 0, 0, 'track holds last'); ok(tk(0.5) > 5, 'track eases into key 1 (outCubic is above linear)');
  ok(track([[0, '#000000'], [1, '#ffffff']])(0.5) === 'rgb(128,128,128)', 'track blends colours');
  const sq = sequence([['a', 2], ['b', 3, 0.5], ['c', 1, -1]]); near(sq.beats.b.s, 1.5, 1e-12, 'sequence overlap'); near(sq.beats.c.s, 5.5, 1e-12, 'sequence gap'); near(sq.end, 6.5, 1e-12, 'sequence end');
  const st = stagger(4, 1, 0.1, 0.5); near(st[3].s, 1.3, 1e-12, 'stagger start'); near(st[3].e, 1.8, 1e-12, 'stagger end');
  const tl = timeline().add('x', 1, 2).after('x', 'y', 1, { overlap: 0.1 }); near(tl.get('y').s, 2.9, 1e-12, 'timeline.after'); ok(tl.has('x', 2) && !tl.has('x', 3.5) && tl.active(2.95).length === 2, 'timeline has/active'); near(tl.end, 3.9, 1e-12, 'timeline end');
  const pg = pages([3.1, 4.75, 3.7], { t0: 1.9 }); near(pg[1].s, 4.9, 1e-9, 'pages overlap 0.1'); near(pg[2].e, 13.25, 1e-9, 'pages end');
  const p0 = page(2.0, pg[0]); ok(p0.a < 1 && p0.dx > 0, 'page slides in from the right'); near(page(3.5, pg[0]).dx, 0, 1e-12, 'page rests at 0'); ok(page(4.9, pg[0]).dx < 0 && page(4.9, pg[0]).a < 1, 'page slides out to the left'); ok(page(1, pg[0]) === null, 'page is null outside');
  near(loop(1.7, 1.6), 0.0625, 1e-9, 'loop');
}

// ---------------------------------------------------------------- canvas and brand
section('canvas and brand');
{
  ok(GlobalFonts.has('Inter') && GlobalFonts.has('Space Grotesk') && GlobalFonts.has('JetBrains Mono'), 'three fonts registered');
  const cv = createCanvas(400, 100), c = cv.getContext('2d'); setFont(c, 'inter', 60, 700); const w700 = textW(c, 'Hello'); setFont(c, 'inter', 60, 300); ok(w700 > textW(c, 'Hello'), 'font weight axis changes width');
  setFont(c, 'sg', 60, 700); ok(wrapText(c, 'one two three four five six seven', 300).length >= 2, 'wrapText wraps'); const px = fitText(c, 'A fairly long line of text', { fam: 'inter', wght: 600, maxW: 500, maxPx: 90 }); ok(px >= 42 && px < 90 && textW(c, 'A fairly long line of text') <= 500, 'fitText fits');
  ok(P.green === '#19e08f' && SAFE.top === 250 && SAFE.bottom === 1580 && SLOGAN.length === 2, 'brand constants');
  ok(claimViolations('Only $49 per month').length >= 1 && claimViolations('Your private files').length === 1 && claimViolations('Be the cog in the machine.').length === 0, 'claim words');
}

// ---------------------------------------------------------------- render determinism and the QC
section('render and QC');
const F = n => path.join(HERE, 'fixtures', n + '.mjs');
{
  const raw = cv => Buffer.from(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.buffer);
  const hello = await loadCard(path.join(ENGINE, 'examples', 'hello_card.mjs')), hashOf = (i, pv) => crypto.createHash('sha1').update(raw(renderFrame(hello, i, { preview: pv }))).digest('hex');
  for (const i of [0, 70, 150, 224]) ok(hashOf(i, false) === hashOf(i, false), `hello_card frame ${i} is identical when rendered twice`);
  ok(hashOf(150, true) === hashOf(150, true), 'preview frame is identical twice');
  const r1 = await renderCard(path.join(ENGINE, 'examples', 'hello_card.mjs'), { still: 3.6, out: path.join(tmp, 'a'), preview: true }), r2 = await renderCard(path.join(ENGINE, 'examples', 'hello_card.mjs'), { still: 3.6, out: path.join(tmp, 'b'), preview: true });
  ok(crypto.createHash('sha1').update(fs.readFileSync(r1.still)).digest('hex') === crypto.createHash('sha1').update(fs.readFileSync(r2.still)).digest('hex'), 'two --still renders give the same PNG bytes');
  const c1 = raw(renderFrame(hello, 100)), c2 = raw(renderFrame(hello, 101)); ok(!c1.equals(c2), 'consecutive frames differ');
}
{
  const q = async (n, o = {}) => qcCard(F(n), { out: path.join(tmp, 'qc_' + n), ...o });
  const rules = r => r.issues.filter(i => i.level === 'fail').map(i => i.rule);
  const clean = await q('clean_card'); ok(clean.pass, `QC passes a clean card (${rules(clean).join('; ')})`); ok(fs.existsSync(path.join(tmp, 'qc_clean_card', 'qc.json')) && fs.existsSync(path.join(tmp, 'qc_clean_card', 'qc_zones.png')), 'QC writes qc.json and the zones sheet');
  const frozen = await q('frozen_card'); ok(!frozen.pass && rules(frozen).includes('frozen frames'), 'QC catches the frozen segment'); const fr = frozen.motion.frozenRuns[0]; ok(fr && fr.t0 >= 0.9 && fr.t0 <= 1.2 && fr.t1 >= 2.4 && fr.t1 <= 2.7, `frozen run is located near 1.0-2.5 s (got ${fr && fr.t0}-${fr && fr.t1})`);
  const hold = await q('frozen_hold_card'); ok(hold.pass, 'a declared hold is allowed');
  const bad = await q('unsafe_card'), br = rules(bad);
  ok(!bad.pass, 'QC fails the unsafe card'); ok(br.includes('text above y 250'), 'catches text above y 250'); ok(br.includes('text in the action rail (x >= 940, y 800-1580)'), 'catches text in the action rail');
  ok(br.includes('text under 42 px'), 'catches text under 42 px'); ok(br.some(r => r.startsWith('banned claim')), 'catches a banned claim'); ok(br.some(r => r.startsWith('low contrast')), 'catches low contrast');
  ok(!bad.issues.some(i => i.level === 'fail' && /All clear/.test(i.text || '')), 'does not blame the clean text');
  const noCloser = await qcCard(F('clean_card'), { out: path.join(tmp, 'qc_nc'), thresholds: {} }); ok(noCloser.pass, 'closer rule can be switched off per card');
  if (!quick) {
    const hello = await qcCard(path.join(ENGINE, 'examples', 'hello_card.mjs'), { out: path.join(tmp, 'qc_hello') }); ok(hello.pass, `QC passes hello_card (${rules(hello).join('; ')})`);
    const r = await renderCard(path.join(ENGINE, 'examples', 'hello_card.mjs'), { out: path.join(tmp, 'vid'), preview: true });
    ok(r.width === 540 && r.height === 960 && Math.abs(r.seconds - 7.5) < 0.05 && !r.audioStream && fs.existsSync(r.contact), 'preview render: 540x960, 7.5 s, silent, contact sheet');
    const v = await qcCard(F('clean_card'), { out: path.join(tmp, 'qc_v'), video: r.mp4 });
    ok(v.issues.some(i => i.rule === 'video size'), 'QC --video notices a file that is not 1080x1920');
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
