#!/usr/bin/env node
// t1.4 test: every loop is periodic, bounded and really moves (pixel diffs); then render the demo and run the quality checker.
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/canvas.mjs';
import { pingPong, markerAt, arrivalRing, drawNodes, drawMarker, lineRunner, sweep, meterLevel, barField, drawBars, breathe, cursorAlpha, drawCursor, dotLift, drawBouncingDots, dashedLine, drawRings } from './module.mjs';

const px = fn => { const cv = createCanvas(400, 300), c = cv.getContext('2d'); c.fillStyle = '#0a0c10'; c.fillRect(0, 0, 400, 300); fn(c); return c.getImageData(0, 0, 400, 300).data; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) n++; return n; };

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  ok(JSON.stringify(pingPong(3)) === '[[0,1],[1,2],[2,1],[1,0]]', 'pingPong(3) is hello_card\'s route'); ok(pingPong(4).length === 6, 'pingPong(4) has 6 legs');
  const nodes = [{ x: 200, y: 100 }, { x: 540, y: 100 }, { x: 880, y: 100 }], o = { t0: 1, legDur: 0.8 };
  near(markerAt(0.5, nodes, o).x, 200, 1e-9, 'before t0 the marker sits on node 0'); near(markerAt(1.8, nodes, o).x, 540, 1e-9, 'after one leg it is on node 1'); near(markerAt(2.6, nodes, o).x, 880, 1e-9, 'after two legs on node 2'); near(markerAt(3.4, nodes, o).x, 540, 1e-9, 'then back to node 1'); near(markerAt(4.2, nodes, o).x, 200, 1e-9, 'then home');
  near(markerAt(4.2 + 3.2, nodes, o).x, markerAt(4.2, nodes, o).x, 1e-9, 'the route repeats every 4 legs'); near(markerAt(1.4, nodes, o).x, (200 + 540) / 2, 1e-9, 'inOutCubic is at the midpoint at half time'); ok(markerAt(1.1, nodes, o).x - 200 < 0.1 * 340 * 0.8, 'it starts slowly (ease in)');
  ok(markerAt(1.5, [200, 540, 880], { y: 50 }).y === 50, 'number nodes use o.y');
  ok(arrivalRing(1.8, nodes, 1, o) > 0.99 && arrivalRing(2.3, nodes, 1, o) === 0 && arrivalRing(0.5, nodes, 1, o) === 0, 'ring fires on arrival and decays within 0.45 s'); ok(arrivalRing(1.9, nodes, 2, o) === 0, 'no ring on a node that was not reached');
  const lr = lineRunner(0.4, { t0: 0, x: 146, y0: 100, y1: 400 }); ok(lr.a > 0.99 && lr.y > 100 && lr.y < 400, 'lineRunner travels'); ok(lineRunner(1.58, { x: 1, y0: 100, y1: 400 }).a < 0.2, 'lineRunner fades at the end of its period'); near(lineRunner(1.6 + 0.4, { x: 1, y0: 100, y1: 400 }).y, lineRunner(0.4, { x: 1, y0: 100, y1: 400 }).y, 1e-9, 'lineRunner loops every 1.6 s');
  // sweep
  const s0 = sweep(0.6, { t0: 0, n: 4 }); ok(s0.length === 4 && s0.every(v => v >= 0 && v <= 1), 'sweep values in 0..1'); let peaks = 0; for (let t = 0; t < 2.4; t += 0.01) { const sw = sweep(t, { n: 4 }); if (sw.filter(v => v > 0.5).length > 2) peaks++; } ok(peaks === 0, 'never more than two items bright at once (power 4 is narrow)');
  const order = []; for (let t = 0; t < 2.4; t += 0.01) { const sw = sweep(t, { n: 4 }); const m = sw.indexOf(Math.max(...sw)); if (order[order.length - 1] !== m) order.push(m); } ok(order.length >= 5, `highlight steps through every item (${order.join('')})`); ok(new Set(order).size === 4, 'every item gets the highlight'); near(sweep(0.5, { n: 4 })[0], sweep(0.5 + 2.4, { n: 4 })[0], 1e-9, 'sweep loops every period');
  // meters
  const f = barField(5, 5), g = barField(5, 5), h = barField(6, 5); ok(JSON.stringify(f(1.3)) === JSON.stringify(g(1.3)), 'barField is seeded'); ok(JSON.stringify(f(1.3)) !== JSON.stringify(h(1.3)), 'another seed differs');
  let lo = 1, hi = 0; for (let t = 0; t < 6; t += 0.02) f(t).forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }); ok(lo >= 0 && hi <= 1 && hi - lo > 0.3, `bars move over a real range (${lo.toFixed(2)}..${hi.toFixed(2)})`); ok(new Set(f(2).map(v => v.toFixed(3))).size === 5, 'bars are never level with each other');
  near(meterLevel(0, { base: 0.5, amp: 0.3, freq: 1 }), 0.5, 1e-12, 'meterLevel centre'); near(meterLevel(0.25, { base: 0.5, amp: 0.3, freq: 1 }), 0.8, 1e-9, 'meterLevel peak'); near(breathe(0, 1.6), 0, 1e-12, 'breathe starts at 0'); near(breathe(0.8, 1.6), 1, 1e-9, 'breathe peaks at half a period');
  // cursor and dots
  let on = 0, offc = 0; for (let t = 0; t < 1.06; t += 0.01) { const a = cursorAlpha(t); if (a > 0.99) on++; if (a < 0.01) offc++; } ok(on > 40 && offc > 30, `cursor has an on and an off phase (${on}/${offc} of 106)`); near(cursorAlpha(1.06 * 5.2), cursorAlpha(1.06 * 0.2), 1e-9, 'cursor loops');
  ok(dotLift(0.25, 0) < -11 && dotLift(0.75, 0) === 0, 'dot 0 hops in the first half of the period'); ok(dotLift(0.25 + 0.18, 1) < -11, 'dot 1 hops 0.18 s after dot 0'); ok(dotLift(0.3, 0) !== dotLift(0.3, 1), 'dots are out of step');
  // everything actually changes between frames (pixel evidence that nothing is dead), at several start times
  const things = { 'marker': (c, t) => drawMarker(c, t, nodes.map(n => ({ x: n.x / 3 + 20, y: 150 })), { t0: 0 }), 'nodes+rings': (c, t) => drawNodes(c, t, nodes.map(n => ({ x: n.x / 3 + 20, y: 150 })), { ringsFrom: { t0: 0 } }), 'bars': (c, t) => drawBars(c, barField(3, 5)(t), { x: 50, y: 50, w: 250, h: 200 }),
    'bouncing dots': (c, t) => drawBouncingDots(c, t, 200, 150), 'dashed line': (c, t) => dashedLine(c, t, 20, 150, 380, 150, { color: '#19e08f', width: 6 }), 'rings': (c, t) => drawRings(c, t, 200, 150) };
  for (const [name, fn] of Object.entries(things)) { let worst = 1e9; for (const t0 of [0.3, 1.7, 3.1]) worst = Math.min(worst, diff(px(c => fn(c, t0)), px(c => fn(c, t0 + 0.2)))); ok(worst > 20, `${name} changes between frames (min ${worst} px differ over 0.2 s)`); }
  { let seen = new Set(); for (let t = 0; t < 1.1; t += 0.05) seen.add(diff(px(c => drawCursor(c, t, 100, 100, 44)), px(c => {})) > 0); ok(seen.has(true) && seen.has(false), 'cursor pixels appear and disappear'); }
} });
