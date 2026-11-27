#!/usr/bin/env node
// t3.2 test: layout, styles, counters, paths, then render the demo and run the quality checker.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas, setFont, textW, P } from '../../engine/index.mjs';
import { balancedWrap, splitText, fitBlock, safeCheck, STYLES, unitTimes, drawUnits, emphasis, highlightSweep, countText, drawCounter, typeCount, scramble, makePath, arcPath, wavePath, drawOnPath } from './module.mjs';
import { wrapText } from '../../engine/index.mjs';

const mk = () => { const c = createCanvas(1080, 1920).getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 1080, 1920); return c; };
const lum = c => c.getImageData(0, 0, 1080, 1920).data;
const diffRatio = (a, b) => { const x = lum(a), y = lum(b); let ink = 0, bad = 0; for (let i = 0; i < x.length; i += 4) { const m = Math.max(x[i], y[i]); if (m > 40) { ink++; if (Math.abs(x[i] - y[i]) > 90) bad++; } } return ink ? bad / ink : 0; };

await runSkillTest({ dir: import.meta.dirname, checks: async ({ ok, near }) => {
  const c = mk();
  // ---- splitText
  const sp = splitText(c, 'Hello world', { px: 100, y: 800 });
  ok(sp.chars.length === 10 && sp.words.length === 2 && sp.lines.length === 1, 'splitText: 10 letters, 2 words, 1 line');
  setFont(c, 'sg', 100, 700, 0); const lw = textW(c, 'Hello world', 100, 0);
  near(sp.lines[0].x + sp.lines[0].w / 2, 540, 0.01, 'splitText centres the line on x'); near(sp.lines[0].w, lw, 1e-6, 'line width is the real text width');
  const last = sp.chars[9]; ok(Math.abs(last.x + last.w - (sp.lines[0].x + lw)) < 1.5, `last letter ends where the line ends (${(last.x + last.w - (sp.lines[0].x + lw)).toFixed(2)} px off)`);
  ok(sp.chars.every((ch, i) => i === 0 || ch.x > sp.chars[i - 1].x), 'letters go left to right'); near(sp.words[0].w, textW(c, 'Hello', 100, 0), 2, 'word width matches the plain word');
  const av = splitText(c, 'AVAT', { px: 100, y: 800, align: 'left', x: 100 }); let sumW = 0; setFont(c, 'sg', 100, 700, 0); for (const ch of 'AVAT') sumW += c.measureText(ch).width;
  ok(av.chars[3].x + av.chars[3].w - 100 < sumW - 1, 'kerning is kept (AVAT is narrower than the sum of its letters)');
  const ml = splitText(c, 'One two three four five six seven', { px: 80, maxW: 500, y: 800, lineH: 1.2 }); ok(ml.lines.length >= 3, `wrapping makes lines (${ml.lines.length})`); near(ml.lines[1].y - ml.lines[0].y, 96, 1e-9, 'line spacing is px * lineH'); ok(ml.words.length === 7, 'words survive wrapping');
  // balanced wrap
  setFont(c, 'sg', 80, 700, 0); const txt = 'Ship the report before lunch today', plain = wrapText(c, txt, 800), bal = balancedWrap(c, txt, 800);
  ok(bal.length === plain.length, 'balancedWrap keeps the line count'); const mx = ls => Math.max(...ls.map(l => c.measureText(l).width)); ok(mx(bal) <= mx(plain) + 1e-9, 'balancedWrap is never wider than the plain wrap'); ok(Math.min(...bal.map(l => c.measureText(l).width)) >= Math.min(...plain.map(l => c.measureText(l).width)), 'balancedWrap has no shorter last line');
  // ---- fitBlock / safeCheck
  const f1 = fitBlock(c, 'Words slide in,\nthe key word glows.', { maxW: 860, maxLines: 2 }), f2 = fitBlock(c, 'Words slide in,\nthe key word glows.', { maxW: 500, maxLines: 2 });
  ok(f1.fits && f1.px >= 42 && f1.px <= 120, `fitBlock fits (${f1.px}px)`); ok(f2.px <= f1.px, 'fitBlock shrinks for a narrower box'); ok(!fitBlock(c, 'A very long headline that cannot possibly fit on two short lines at all', { maxW: 400, maxLines: 2 }).fits, 'fitBlock says no when even 42 px will not fit');
  ok(safeCheck(splitText(c, 'Hi there', { px: 100, y: 1000 })).length === 0, 'safeCheck passes a centred block');
  ok(safeCheck(splitText(c, 'Hi there', { px: 100, y: 200 })).some(s => /above/.test(s)), 'safeCheck flags text above y 250'); ok(safeCheck(splitText(c, 'Hi', { px: 100, y: 1650 })).some(s => /below/.test(s)), 'safeCheck flags text below y 1580');
  ok(safeCheck(splitText(c, 'Wide wide wide text', { px: 100, y: 1000, x: 700, maxW: 1000 })).some(s => /rail/.test(s)), 'safeCheck flags the action rail'); ok(safeCheck(splitText(c, 'Hi there', { px: 40, y: 1000 })).some(s => /under/.test(s)), 'safeCheck flags under 42 px');
  // ---- unitTimes and styles
  for (const o of ['forward', 'reverse', 'center', 'random']) { const tm = unitTimes(7, 1, 0.1, 0.4, o, 3), ss = new Set(tm.map(x => x.s.toFixed(3))); ok(ss.size === 7 && Math.min(...tm.map(x => x.s)) === 1, `unitTimes ${o}: 7 distinct slots starting at t0`); }
  ok(JSON.stringify(unitTimes(9, 0, 0.1, 0.4, 'random', 5)) === JSON.stringify(unitTimes(9, 0, 0.1, 0.4, 'random', 5)), 'unitTimes random is seeded'); ok(unitTimes(7, 0, 0.1, 0.4, 'center')[3].s === 0, 'unitTimes center: middle first'); ok(unitTimes(5, 0, 0.1, 0.4, 'reverse')[4].s === 0, 'unitTimes reverse: last first');
  for (const [name, fn] of Object.entries(STYLES)) {
    const e = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, a: 1, ...fn(1, 3, 100) };
    ok(Math.abs(e.dx) < 1e-9 && Math.abs(e.dy) < 1e-9 && Math.abs(e.sx - 1) < 1e-9 && Math.abs(e.sy - 1) < 1e-9 && Math.abs(e.rot) < 1e-9 && Math.abs(e.a - 1) < 1e-9, `style ${name}: lands exactly on the rest pose at k=1`);
    const z = { a: 1, sx: 1, ...fn(0, 3, 100) }; ok(z.a === 0 || z.sx === 0 || name === 'cut', `style ${name}: invisible at k=0`);
  }
  // ---- drawUnits: nothing early, everything at the end, same look as a plain line, exit works
  const sd = splitText(mk(), 'Hello world', { px: 100, y: 800 }), dr = mk();
  ok(drawUnits(dr, sd, 0.5, { style: 'rise', t0: 1 }) === 0, 'drawUnits draws nothing before t0'); ok(drawUnits(mk(), sd, 3, { style: 'pop', t0: 1, gap: 0.05, dur: 0.4 }) === 10, 'drawUnits draws all 10 letters when done');
  ok(drawUnits(mk(), sd, 1.2, { unit: 'word', style: 'slide', t0: 1, gap: 0.1, dur: 0.4 }) >= 1, 'drawUnits unit word works');
  const A = mk(), B = mk(); drawUnits(A, sd, 5, { style: 'rise', t0: 1, color: '#fff' }); setFont(B, 'sg', 100, 700, 0); B.fillStyle = '#fff'; B.textBaseline = 'alphabetic'; B.textAlign = 'left'; B.fillText('Hello world', sd.lines[0].x, 800);
  const dd = diffRatio(A, B); ok(dd < 0.03, `split letters look like the plain line (${(100 * dd).toFixed(2)} percent of ink differs)`);
  ok(drawUnits(mk(), sd, 3.0, { style: 'rise', t0: 0, gap: 0.03, dur: 0.3, out: { t0: 1, gap: 0.03, dur: 0.3 } }) === 0, 'drawUnits out: everything has left'); ok(drawUnits(mk(), sd, 1.15, { style: 'rise', t0: 0, gap: 0.03, dur: 0.3, out: { t0: 1, gap: 0.03, dur: 0.3 } }) > 0, 'drawUnits out: still visible while leaving');
  const i0 = mk(), i1 = mk(); drawUnits(i0, sd, 4.0, { style: 'rise', t0: 0, idle: { amp: 6 } }); drawUnits(i1, sd, 4.4, { style: 'rise', t0: 0, idle: { amp: 6 } }); ok(diffRatio(i0, i1) > 0.005, 'idle wave: a held line keeps moving');
  // ---- emphasis, highlight
  const em = emphasis(sd, { words: [1], t0: 1, peak: 1.2 }), wch = sd.chars.find(x => x.word === 1);
  ok(em(wch, 0.5) === null && em(sd.chars[0], 1.2) === null, 'emphasis: only the chosen word, only after t0'); const peak = Math.max(...Array.from({ length: 30 }, (_, i) => em(wch, 1 + i * 0.0166).sx)); ok(peak > 1.15 && peak <= 1.2 + 1e-9, `emphasis peaks near 1.2 (${peak.toFixed(3)})`); near(em(wch, 1.5).sx, 1, 1e-9, 'emphasis settles back to 1');
  const H = mk(), h0 = highlightSweep(H, sd, 0.5, { words: [1], t0: 1 }), hm = highlightSweep(mk(), sd, 1.25, { words: [1], t0: 1, dur: 0.5 }), hend = highlightSweep(H, sd, 2, { words: [1], t0: 1 });
  ok(h0.progress === 0 && hend.progress === 1, 'highlightSweep progress runs 0 to 1'); ok(hm.progress > 0.3 && hm.progress < 0.7, 'highlightSweep mid-sweep'); ok(hend.colorFor(wch) === P.ink && h0.colorFor(wch) === P.white, 'highlightSweep turns the letters dark once covered');
  const wd = sd.words[1], pxl = H.getImageData(Math.round(wd.x + wd.w / 2), Math.round(wd.y - 30), 1, 1).data; ok(pxl[1] > 150, 'highlight bar is drawn behind the word at the end');
  // ---- counters
  const cc = { to: 1284, t0: 1, dur: 1.4 }; ok(countText(0.5, cc) === '0' && countText(5, cc) === '1,284', 'countText starts at 0 and lands on 1,284'); let mono = true, prev = -1; for (let t = 1; t <= 2.4; t += 0.05) { const v = +countText(t, cc).replace(/,/g, ''); if (v < prev) mono = false; prev = v; } ok(mono, 'countText never goes backwards');
  ok(countText(9, { to: 12.5, t0: 0, decimals: 1, prefix: '+', suffix: '%' }) === '+12.5%', 'countText decimals, prefix, suffix'); ok(countText(9, { from: 0, to: -50, t0: 0 }) === '-50', 'countText negative'); ok(countText(9, { to: 1234567, t0: 0 }) === '1,234,567', 'countText thousands'); ok(countText(1.7, { to: 1284, t0: 1, dur: 1.4 }).length >= 3, 'countText mid value has digits');
  const k1 = drawCounter(mk(), '5', '1,284', { x: 540, y: 900, px: 160 }), k2 = drawCounter(mk(), '1,284', '1,284', { x: 540, y: 900, px: 160 }), k3 = drawCounter(mk(), '888', '1,284', { x: 540, y: 900, px: 160 }); ok(k1.x0 === k2.x0 && k2.x1 === k3.x1, 'drawCounter layout width never changes while counting');
  const T0 = mk(), T1 = mk(); drawCounter(T0, '1,111', '1,111', { x: 540, y: 900, px: 160 }); drawCounter(T1, '1,181', '1,181', { x: 540, y: 900, px: 160 }); const cx = d => { const a = d.getImageData(0, 760, 1080, 150).data; let m = 0; for (let x = 0; x < 1080; x++) { let s = 0; for (let y = 0; y < 150; y++) s += a[(y * 1080 + x) * 4]; if (s > 0 && !m) m = x; } return m; }; ok(Math.abs(cx(T0) - cx(T1)) <= 2, 'tabular digits: 1,111 and 1,181 start at the same x');
  ok(typeCount(0.5, { t0: 1 }) === 0 && typeCount(1, { t0: 1, cps: 20 }) === 1 && typeCount(2, { t0: 1, cps: 20 }) === 21, 'typeCount');
  // ---- scramble
  ok(scramble('decode me', 1, 3) === 'decode me', 'scramble k=1 is the final text'); const s0 = scramble('decode me', 0, 3); ok(s0.length === 9 && s0[6] === ' ' && s0 !== 'decode me', 'scramble k=0 keeps length and spaces'); ok(scramble('decode me', 0.4, 3.1, 4) === scramble('decode me', 0.4, 3.1, 4), 'scramble is deterministic'); ok(scramble('decode me', 0.4, 3.1) !== scramble('decode me', 0.4, 3.5), 'scramble changes over time'); ok(scramble('decode me', 0.4, 3.1).startsWith('dec'), 'scramble resolves left to right');
  // ---- paths
  const ln = makePath(u => [100 + 800 * u, 500]), ar = arcPath(540, 900, 300, 0, Math.PI), wv = wavePath(100, 900, 500, 30, 2, 0);
  near(ln.len, 800, 1e-6, 'line path length'); near(ar.len, 300 * Math.PI, 300 * Math.PI * 0.001, 'arc path length'); near(ln.at(400).x, 500, 1e-6, 'path.at(400) on a line'); near(ln.at(0).angle, 0, 1e-9, 'line angle 0'); near(ar.at(0).x, 840, 1e-6, 'arc starts at angle 0'); near(ar.at(ar.len / 2).angle, Math.PI, 0.02, 'arc tangent at the bottom points left'); ok(wv.len > 800 && Math.abs(wv.at(wv.len * 0.1).angle) > 0.05, 'wave path is longer than its chord and tilts');
  const P1 = mk(), P2 = mk(); const vis = drawOnPath(P1, 'Hello world', ln, 5, { px: 100, s0: 0, t0: 1, gap: 0.02, color: '#fff' }); ok(vis === 10, `drawOnPath draws every letter (${vis})`);
  setFont(P2, 'sg', 100, 700, 0); P2.fillStyle = '#fff'; P2.textBaseline = 'alphabetic'; P2.textAlign = 'left'; P2.fillText('Hello world', 100, 500); const pd = diffRatio(P1, P2); ok(pd < 0.04, `text on a straight path equals plain text (${(100 * pd).toFixed(2)} percent differs)`);
  ok(drawOnPath(mk(), 'Hello world', ln, 0.5, { px: 100, t0: 1 }) === 0, 'drawOnPath reveals nothing before t0'); ok(drawOnPath(mk(), 'curvy text', ar, 5, { px: 60, s0: ar.len / 2, align: 'center', t0: 0 }) === 9, 'drawOnPath centred on an arc');
  // ---- hygiene and determinism
  for (const f of ['module.mjs', 'demo.mjs']) { const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''); ok(!/Math\.random|Date\.now|new Date/.test(src), `${f}: no Math.random or Date`); }
  const demo = await import('./demo.mjs'), hash = cv => crypto.createHash('sha1').update(cv.toBuffer('image/png')).digest('hex'); ok(hash(demo.frame(2.9, 87)) === hash(demo.frame(2.9, 87)), 'demo frame renders identically twice');
} });
