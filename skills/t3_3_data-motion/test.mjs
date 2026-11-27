#!/usr/bin/env node
// t3.3 test: number formatting and easing, chart geometry and pixels, readability rules, then render the demo and run the quality checker.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas, P } from '../../engine/index.mjs';
import { fmt, easeNumber, niceMax, readability, monotoneSamples, barChart, lineChart, sparkline, donutChart, drawNumber, legend, deltaBadge, compareReveal, SERIES } from './module.mjs';

const mk = () => { const c = createCanvas(1080, 1920).getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 1080, 1920); return c; };
const px = (c, x, y) => Array.from(c.getImageData(Math.round(x), Math.round(y), 1, 1).data);
const inkCount = (c, x, y, w, h) => { const d = c.getImageData(x, y, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n; };

await runSkillTest({ dir: import.meta.dirname, checks: async ({ ok, near }) => {
  // ---- fmt, easeNumber, niceMax
  ok(fmt(1284) === '1,284' && fmt(1234567) === '1,234,567' && fmt(12.345, { decimals: 1 }) === '12.3' && fmt(-50) === '-50', 'fmt: separators, decimals, negative');
  ok(fmt(1500, { compact: true }) === '1.5K' && fmt(2000000, { compact: true }) === '2M' && fmt(950, { compact: true }) === '950' && fmt(62, { suffix: '%' }) === '62%' && fmt(7, { prefix: '+' }) === '+7', 'fmt: compact, suffix, prefix');
  ok(!/[$]/.test(fmt(100)), 'fmt never adds a currency sign');
  const en = { to: 62, t0: 1, dur: 1.2 }; near(easeNumber(0.5, en), 0, 1e-12, 'easeNumber before t0'); near(easeNumber(2.2, en), 62, 1e-12, 'easeNumber lands exactly'); near(easeNumber(9, en), 62, 1e-12, 'easeNumber holds');
  let prev = -1, mono = true, over = false; for (let t = 1; t <= 2.2; t += 0.02) { const v = easeNumber(t, en); if (v < prev - 1e-9) mono = false; if (v > 62 + 1e-9) over = true; prev = v; } ok(mono && !over, 'easeNumber is monotonic and never overshoots');
  ok(niceMax(87) === 100 && niceMax(41) === 50 && niceMax(2.3) === 2.5 && niceMax(0) === 1 && niceMax(1000) === 1000 && niceMax(0.34) === 0.5, 'niceMax picks 1/2/2.5/5/10 steps');
  // ---- readability
  const c = mk();
  ok(readability(c, 'hbar', { labels: ['Mon', 'Tue', 'Wed'], w: 800 }).length === 0, 'readability: a small bar chart is fine');
  ok(readability(c, 'hbar', { labels: Array(9).fill('x'), w: 800 }).some(s => /at most 6/.test(s)), 'readability: too many bars'); ok(readability(c, 'hbar', { labels: ['a'], w: 800, px: 38 }).some(s => /under 42/.test(s)), 'readability: text under 42 px');
  ok(readability(c, 'hbar', { labels: ['Average response time last quarter'], w: 800 }).some(s => /label/.test(s)), 'readability: label column too wide'); ok(readability(c, 'vbar', { labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], w: 800 }).some(s => /column/.test(s)), 'readability: vbar label does not fit its column');
  ok(readability(c, 'line', { labels: [], w: 800, series: 4 }).some(s => /series/.test(s)) && readability(c, 'donut', { labels: Array(7).fill('x'), w: 800 }).length > 0, 'readability: 4 series and 7 slices are flagged');
  // ---- monotone curve
  const inc = [[0, 0], [1, 1], [2, 1.2], [3, 5], [4, 5.1], [5, 9]], ms = monotoneSamples(inc, 12);
  ok(inc.every(([x, y]) => ms.some(([a, b]) => Math.abs(a - x) < 1e-9 && Math.abs(b - y) < 1e-9)), 'monotoneSamples passes through every data point'); let nd = true; for (let i = 1; i < ms.length; i++) if (ms[i][1] < ms[i - 1][1] - 1e-9) nd = false; ok(nd, 'monotoneSamples never dips on rising data (no overshoot)');
  const pk = monotoneSamples([[0, 0], [1, 10], [2, 0], [3, 10]], 12); ok(Math.max(...pk.map(p => p[1])) <= 10 + 1e-9 && Math.min(...pk.map(p => p[1])) >= -1e-9, 'monotoneSamples stays inside the data range');
  // ---- barChart
  const data = [{ label: 'A', value: 10 }, { label: 'B', value: 20 }], bc = mk(), g0 = barChart(bc, 0, { x: 100, y: 500, w: 800, h: 200, data, t0: 1 });
  ok(g0.every(b => b.k === 0), 'barChart: nothing grown before t0'); const gE = barChart(mk(), 5, { x: 100, y: 500, w: 800, h: 200, data, t0: 1 });
  near(gE[1].w / gE[0].w, 2, 1e-9, 'barChart: bar B is twice as long as bar A'); ok(gE.every(b => b.k === 1), 'barChart: lands at exactly full growth');
  let maxK = 0, kmono = true, pk0 = 0; for (let t = 1; t < 2; t += 0.02) { const g = barChart(mk(), t, { x: 100, y: 500, w: 800, h: 200, data, t0: 1 }); maxK = Math.max(maxK, g[0].k); if (g[0].k < pk0 - 0.2) kmono = false; pk0 = g[0].k; } ok(maxK > 1.02 && maxK < 1.15, `outBack bar overshoots a little (${maxK.toFixed(3)}) and not more than 15 percent`);
  const bd = mk(); barChart(bd, 5, { x: 100, y: 500, w: 800, h: 200, data, t0: 1, highlight: 1, track: false }); const bm = gE[1]; const q = px(bd, bm.x + bm.w / 2, bm.y + bm.h / 2); ok(q[1] > 150, `highlighted bar is green (${q})`); ok(inkCount(bd, 100, 500, 120, 200) > 100, 'barChart draws the row labels');
  const vt = mk(), vg = barChart(vt, 5, { x: 100, y: 800, w: 800, h: 500, data: [{ label: 'Mon', value: 5 }, { label: 'Tue', value: 10 }, { label: 'Wed', value: 7 }], t0: 0, orient: 'v' });
  near(vg[1].h / vg[0].h, 2, 1e-9, 'vertical bars: heights proportional to values'); ok(vg[1].tip[1] < vg[0].tip[1] && vg[1].tip[1] < vg[2].tip[1], 'vertical bars: tallest tip is highest'); ok(inkCount(vt, 100, 1250, 800, 60) > 100, 'vertical bars: labels drawn under the baseline');
  ok(JSON.stringify(barChart(mk(), 1.3, { x: 100, y: 500, w: 800, h: 200, data, t0: 1 })) === JSON.stringify(barChart(mk(), 1.3, { x: 100, y: 500, w: 800, h: 200, data, t0: 1 })), 'barChart is deterministic');
  // ---- lineChart, sparkline
  const ser = [{ values: [3, 5, 4, 9, 12, 10, 15], color: P.green }], lc = o => lineChart(mk(), o.t, { x: 100, y: 700, w: 800, h: 500, series: ser, t0: 1, dur: 1.2, xLabels: ['a', 'b', 'c'], max: 20 });
  const L0 = lc({ t: 0.5 }), L1 = lc({ t: 1.6 }), L2 = lc({ t: 3 }); ok(L0.k === 0 && L1.k > 0.3 && L1.k < 0.9 && L2.k === 1, 'lineChart progress 0 -> mid -> 1');
  ok(L1.heads[0].x > L0.heads[0].x && L2.heads[0].x > L1.heads[0].x, 'lineChart head moves right'); near(L2.heads[0].value, 15, 1e-6, 'lineChart head lands on the last value'); ok(L2.heads[0].y >= L2.plot.y - 1e-6 && L2.heads[0].y <= L2.plot.y + L2.plot.h + 1e-6, 'lineChart head stays inside the plot');
  const lcc = mk(); lineChart(lcc, 3, { x: 100, y: 700, w: 800, h: 500, series: ser, t0: 1, max: 20 }); const lh = lcc.getImageData(0, 0, 1080, 1920).data; let green = 0; for (let i = 0; i < lh.length; i += 4) if (lh[i + 1] > 150 && lh[i] < 100) green++; ok(green > 2500, `lineChart draws a thick green line (${green} px)`);
  const s1 = sparkline(mk(), 0.5, { x: 100, y: 800, w: 300, h: 100, values: [1, 4, 2, 7], t0: 1 }), s2 = sparkline(mk(), 1.5, { x: 100, y: 800, w: 300, h: 100, values: [1, 4, 2, 7], t0: 1 }), s3 = sparkline(mk(), 4, { x: 100, y: 800, w: 300, h: 100, values: [1, 4, 2, 7], t0: 1 });
  ok(s1.k === 0 && s2.k > 0 && s2.k < 1 && s3.k === 1 && s3.head[0] > s2.head[0], 'sparkline progress'); ok(s3.head[1] >= 800 && s3.head[1] <= 900, 'sparkline head inside its box');
  // ---- donutChart
  const sl = [{ value: 60, color: '#19e08f' }, { value: 40, color: '#22d3ee' }], d0 = donutChart(mk(), 0.5, { cx: 540, cy: 900, r: 200, thick: 50, slices: sl, t0: 1 }), dm = donutChart(mk(), 1.5, { cx: 540, cy: 900, r: 200, thick: 50, slices: sl, t0: 1, dur: 1 }), dE = donutChart(mk(), 4, { cx: 540, cy: 900, r: 200, thick: 50, slices: sl, t0: 1 });
  ok(d0.every(s => s.visible === 0) && dE.every(s => s.visible === 1), 'donut: empty before t0, full after'); ok(dm[0].visible > dm[1].visible, 'donut fills slice 1 before slice 2'); near(dE.reduce((a, s) => a + s.share, 0), 1, 1e-12, 'donut shares sum to 1');
  near(dE[1].end + 0.05 - (-Math.PI / 2), 2 * Math.PI, 1e-9, 'donut slices plus gaps close the circle'); near((dE[0].end - dE[0].start) / (dE[1].end - dE[1].start), 1.5, 1e-9, 'donut slice angles follow the values');
  const dp = mk(); donutChart(dp, 4, { cx: 540, cy: 900, r: 200, thick: 50, slices: sl, t0: 1, orbit: false }); const m0 = dE[0].mid, rr = 175, a = px(dp, 540 + rr * Math.cos(m0), 900 + rr * Math.sin(m0)), b = px(dp, 540 + rr * Math.cos(dE[1].mid), 900 + rr * Math.sin(dE[1].mid));
  ok(a[1] > 180 && a[0] < 80 && b[2] > 180 && b[0] < 80, `donut slice colours land where expected (${a} / ${b})`); ok(px(dp, 540, 900).slice(0, 3).every(v => v < 10), 'donut centre is empty');
  // ---- badge, compare, number, legend
  const bdg = mk(); deltaBadge(bdg, 0.2, { x: 540, y: 900, text: '+71%', t0: 1 }); ok(inkCount(bdg, 300, 800, 480, 200) === 0, 'deltaBadge: nothing before t0'); const bdg2 = mk(); deltaBadge(bdg2, 3, { x: 540, y: 900, text: '+71%', t0: 1 }); ok(inkCount(bdg2, 300, 800, 480, 200) > 500, 'deltaBadge: drawn after t0');
  const cr = compareReveal(mk(), 5, { x: 100, y: 700, w: 800, h: 400, a: { label: 'Before', value: 24 }, b: { label: 'After', value: 41 }, t0: 1 }); ok(cr.pct === 71 && cr.bars[1].w > cr.bars[0].w, 'compareReveal: +71 percent, bigger bar longer'); ok(compareReveal(mk(), 5, { x: 100, y: 700, w: 800, h: 400, a: { label: 'A', value: 50 }, b: { label: 'B', value: 25 }, t0: 1 }).pct === -50, 'compareReveal: negative change');
  const nm = mk(); drawNumber(nm, '62%', { x: 540, y: 900, px: 110 }); ok(inkCount(nm, 380, 800, 320, 140) > 800, 'drawNumber draws centred text'); const lg = mk(); legend(lg, 0, { x: 100, y: 900, w: 800, items: [{ label: 'Done', color: P.green }, { label: 'Open', color: P.cyan }], t0: 1 }); const lg2 = mk(); legend(lg2, 3, { x: 100, y: 900, w: 800, items: [{ label: 'Done', color: P.green }, { label: 'Open', color: P.cyan }], t0: 1 });
  ok(inkCount(lg, 100, 850, 800, 80) === 0 && inkCount(lg2, 100, 850, 800, 80) > 300, 'legend appears after t0'); ok(SERIES.length === 4, 'SERIES has 4 colours');
  // ---- hygiene and determinism
  for (const f of ['module.mjs', 'demo.mjs']) { const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''); ok(!/Math\.random|Date\.now|new Date/.test(src), `${f}: no Math.random or Date`); ok(!/[$€£]\s?\d/.test(src), `${f}: no currency signs`); }
  const demo = await import('./demo.mjs'), hash = cv => crypto.createHash('sha1').update(cv.toBuffer('image/png')).digest('hex'); ok(hash(demo.frame(2.9, 87)) === hash(demo.frame(2.9, 87)), 'demo frame renders identically twice');
} });
