#!/usr/bin/env node
// t2.4 test: every reveal is checked on real pixels (empty at 0, identical to the plain draw at 1, coverage grows monotonically,
// exact where the maths says so), text reveals too; then render the demo and run the quality checker.
import fs from 'node:fs';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas, setFont } from '../../engine/canvas.mjs';
import { RECIPES, maskK, revealRect, revealIris, revealSplit, revealDiagonal, revealScan, revealInk, revealSoft, edgeLine, textRise, textWipe, textChars, typedCount } from './module.mjs';

const BOX = [50, 50, 300, 300], N = 400;
const fresh = () => { const cv = createCanvas(N, N), ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, N, N); return { cv, ctx }; };
const solid = c => { c.fillStyle = '#fff'; c.fillRect(0, 0, N, N); }; // content = white everywhere; the reveal decides what is seen
const cover = (fnReveal, k) => { const { cv, ctx } = fresh(); fnReveal(ctx, k); const d = ctx.getImageData(BOX[0], BOX[1], BOX[2], BOX[3]).data; let on = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 127) on++; return on / (BOX[2] * BOX[3]); };
const bytes = (fnReveal, k) => { const { ctx } = fresh(); fnReveal(ctx, k); return Buffer.from(ctx.getImageData(0, 0, N, N).data.buffer); };
const lumSum = ctx => { const d = ctx.getImageData(0, 0, N, N).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]; return s; };

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  const R = {
    'wipe right': (c, k) => revealRect(c, k, { box: BOX, dir: 'right' }, solid), 'wipe left': (c, k) => revealRect(c, k, { box: BOX, dir: 'left' }, solid),
    'wipe down': (c, k) => revealRect(c, k, { box: BOX, dir: 'down' }, solid), 'wipe up': (c, k) => revealRect(c, k, { box: BOX, dir: 'up' }, solid),
    iris: (c, k) => revealIris(c, k, { box: BOX }, solid), 'split center': (c, k) => revealSplit(c, k, { box: BOX, mode: 'center' }, solid), 'split edges': (c, k) => revealSplit(c, k, { box: BOX, mode: 'edges', axis: 'y' }, solid),
    'diagonal 45': (c, k) => revealDiagonal(c, k, { box: BOX, angle: Math.PI / 4 }, solid), 'diagonal 20': (c, k) => revealDiagonal(c, k, { box: BOX, angle: 0.35 }, solid),
    'scan sweep': (c, k) => revealScan(c, k, { box: BOX, lines: 15 }, solid), 'scan blinds': (c, k) => revealScan(c, k, { box: BOX, lines: 15, mode: 'blinds' }, solid),
    'ink right': (c, k) => revealInk(c, k, { box: BOX, seed: 3 }, solid), 'ink centre': (c, k) => revealInk(c, k, { box: BOX, seed: 9, dir: 'center' }, solid), soft: (c, k) => revealSoft(c, k, { box: BOX, feather: 0.3 }, solid),
  };
  const plain = bytes((c) => solid(c), 0), mid = {};
  for (const [name, fn] of Object.entries(R)) {
    ok(cover(fn, 0) === 0, `${name}: nothing at k 0`); ok(Buffer.compare(bytes(fn, 1), plain) === 0, `${name}: at k 1 the frame is pixel-identical to the plain draw`);
    let prev = 0, mono = true, worst = 0; for (let k = 0; k <= 1.0001; k += 0.05) { const c = cover(fn, k); if (c < prev - 0.004) { mono = false; worst = prev - c; } prev = c; }
    ok(mono, `${name}: coverage never shrinks as k grows (worst drop ${worst.toFixed(4)})`); mid[name] = +cover(fn, 0.5).toFixed(3);
  }
  for (const n of ['wipe right', 'wipe left', 'wipe down', 'wipe up', 'split center', 'split edges']) near(cover(R[n], 0.4), 0.4, 0.012, `${n}: coverage equals k`);
  near(cover(R['diagonal 45'], 0.5), 0.5, 0.012, 'diagonal 45 on a square: half at k 0.5'); near(cover(R['diagonal 20'], 0.5), 0.5, 0.012, 'diagonal 20: half at k 0.5');
  ok(mid.iris > 0.15 && mid.iris < 0.85, `iris at 0.5 covers ${mid.iris}`); ok(mid['ink right'] > 0.2 && mid['ink right'] < 0.8, `ink at 0.5 covers ${mid['ink right']}`); ok(cover(R['ink right'], 0.99) > 0.985, `ink at 0.99 leaves no holes (${cover(R['ink right'], 0.99).toFixed(4)})`); ok(cover(R['ink centre'], 0.99) > 0.985, 'ink from the centre leaves no holes');
  ok(Buffer.compare(bytes(R['ink right'], 0.5), bytes(R['ink right'], 0.5)) === 0, 'ink is deterministic'); ok(Buffer.compare(bytes(R['ink right'], 0.5), bytes((c, k) => revealInk(c, k, { box: BOX, seed: 4 }, solid), 0.5)) !== 0, 'a different ink seed gives a different edge');
  { const { ctx } = fresh(); R.soft(ctx, 0.5); const d = ctx.getImageData(...BOX).data; let part = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 10 && d[i] < 245) part++; ok(part / (BOX[2] * BOX[3]) > 0.04, `soft wipe has a feathered edge (${(100 * part / (BOX[2] * BOX[3])).toFixed(1)} percent partial pixels)`); }
  // out versions
  const O = { 'wipe out': (c, k) => revealRect(c, k, { box: BOX, out: true }, solid), 'diagonal out': (c, k) => revealDiagonal(c, k, { box: BOX, out: true }, solid), 'scan out': (c, k) => revealScan(c, k, { box: BOX, out: true }, solid) };
  for (const [n, fn] of Object.entries(O)) { ok(Buffer.compare(bytes(fn, 0), plain) === 0, `${n}: whole content at k 0`); ok(cover(fn, 1) === 0, `${n}: gone at k 1`); let prev = 1, mono = true; for (let k = 0; k <= 1.001; k += 0.05) { const c = cover(fn, k); if (c > prev + 0.004) mono = false; prev = c; } ok(mono, `${n}: coverage never grows as k grows`); }
  near(cover(O['wipe out'], 0.3), 0.7, 0.012, 'wipe out at 0.3 leaves 70 percent');
  { const e = revealRect(fresh().ctx, 0.5, { box: BOX, dir: 'right' }, solid); near(e.x1, 200, 1e-9, 'wipe edge is at x = 200 for k 0.5'); ok(e.y1 === 50 && e.y2 === 350, 'edge spans the box height'); ok(revealRect(fresh().ctx, 0, { box: BOX }, solid) === null, 'no edge at k 0'); const d = revealDiagonal(fresh().ctx, 0.5, { box: BOX, angle: Math.PI / 4 }, solid); ok(d && Math.abs(d.x1 + d.y1 - d.x2 - d.y2) < 1e-6, 'diagonal edge points lie on one line x + y = const'); }
  // recipes
  for (const [n, r] of Object.entries(RECIPES)) ok(r.dur >= 0.3 && r.dur <= 1.0, `${n}: duration ${r.dur} s is in 0.3-1.0`);
  near(maskK(0, 1, 'wipe'), 0, 1e-12, 'maskK starts at 0'); near(maskK(2, 1, 'wipe'), 1, 1e-12, 'maskK ends at 1'); near(maskK(1.3, 1, 'wipe'), 0.5, 1e-9, 'inOutCubic is 0.5 half way');
  // text
  const plainText = (c) => { setFont(c, 'sg', 60, 700, -0.01); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText('Reveal this', 200, 200); };
  { const a = fresh(); plainText(a.ctx); const sum0 = lumSum(a.ctx);
    const b = fresh(); const endT = textRise(b.ctx, 0.5, { lines: ['Reveal this'], x: 200, y: 200, px: 60, t0: 1, color: '#fff' }); ok(lumSum(b.ctx) === 0, 'textRise draws nothing before t0'); near(endT, 1.32, 1e-9, 'textRise reports when it has landed');
    const c = fresh(); textRise(c.ctx, 2, { lines: ['Reveal this'], x: 200, y: 200, px: 60, t0: 1, color: '#fff' }); near(lumSum(c.ctx) / sum0, 1, 0.003, 'textRise ends equal to plain text');
    const m = fresh(); textRise(m.ctx, 1.03, { lines: ['Reveal this'], x: 200, y: 200, px: 60, t0: 1, color: '#fff' }); ok(lumSum(m.ctx) > 0 && lumSum(m.ctx) < sum0, 'textRise is partial in the middle');
    const w = fresh(); textWipe(w.ctx, 1, { text: 'Reveal this', x: 40, y: 200, px: 60, edgeColor: '#fff' }); const w0 = fresh(); textWipe(w0.ctx, 0, { text: 'Reveal this', x: 40, y: 200, px: 60 }); ok(lumSum(w0.ctx) === 0 && lumSum(w.ctx) > 0, 'textWipe: nothing at 0, text at 1');
    const wh = fresh(); textWipe(wh.ctx, 0.5, { text: 'Reveal this', x: 40, y: 200, px: 60 }); ok(lumSum(wh.ctx) > 0 && lumSum(wh.ctx) < lumSum(w.ctx) * 0.9, 'textWipe half way shows part of the text plus the edge');
    const ch = fresh(); const e2 = textChars(ch.ctx, 5, { text: 'Reveal this', x: 200, y: 200, px: 60, t0: 1, color: '#fff' }); near(e2, 1 + 10 * 0.035 + 0.3, 1e-9, 'textChars reports its end'); near(lumSum(ch.ctx) / sum0, 1, 0.06, 'textChars ends close to plain text (kerning within 6 percent)');
    const c0 = fresh(); textChars(c0.ctx, 0.5, { text: 'Reveal this', x: 200, y: 200, px: 60, t0: 1 }); ok(lumSum(c0.ctx) === 0, 'textChars draws nothing before t0'); }
  ok(typedCount(0, 1, 10) === 0 && typedCount(1.2, 1, 10, 22) === 4 && typedCount(9, 1, 10) === 10, 'typedCount counts characters at 22 per second and caps at the length');
  fs.mkdirSync(`${import.meta.dirname}/out`, { recursive: true }); fs.writeFileSync(`${import.meta.dirname}/out/measured.json`, JSON.stringify({ coverageAtHalf: mid, note: 'fraction of the box revealed at k 0.5 (solid content)' }, null, 1));
} });
