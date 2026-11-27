#!/usr/bin/env node
// t1.5 test: the animation helpers hit their numbers; every part draws nothing before its time and something after (real pixels); then demo + QC.
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/canvas.mjs';
import { P } from '../../engine/brand.mjs';
import { pressScale, labelAt, popScale, stampPose, jolt, toggleK, tabPos, tickK, countUp, appear, formField, pressButton, bubble, statBar, stamp, toggle, tabs, checkList, signaturePad, scribble } from './module.mjs';

const W = 1080, H = 1920, canvasAt = fn => { const cv = createCanvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#0a0c10'; c.fillRect(0, 0, W, H); fn(c); return c.getImageData(0, 0, W, H).data; };
const lit = d => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n; };
const countColor = (d, rgb, tol = 30) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - rgb[0]) < tol && Math.abs(d[i + 1] - rgb[1]) < tol && Math.abs(d[i + 2] - rgb[2]) < tol) n++; return n; };

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  // pure helpers
  near(pressScale(0, 1), 1, 1e-12, 'press: 1 before'); near(pressScale(1.1, 1), 0.96, 1e-9, 'press: 0.96 at the lowest point'); near(pressScale(1.2, 1), 1, 1e-9, 'press: back to 1 after 0.2 s'); ok(pressScale(1.05, 1) < 1 && pressScale(1.15, 1) < 1, 'press is squeezed in between');
  ok(labelAt(1.09, 1, 'a', 'b') === 'a' && labelAt(1.1, 1, 'a', 'b') === 'b' && labelAt(5, 1, 'a') === 'a', 'label swaps at pressT + 0.1');
  let mx = 0; for (let t = 0; t <= 0.5; t += 0.005) mx = Math.max(mx, popScale(t, 0)); ok(mx > 1.07 && mx < 1.13, `bubble pop overshoots about 10 percent (${mx.toFixed(3)})`); near(popScale(0.5, 0), 1, 1e-12, 'pop ends at 1'); near(popScale(-1, 0), 0, 1e-12, 'pop is 0 before t0');
  let crossings = 0, prev = stampPose(0, 0).scale - 1; for (let t = 0; t <= 0.8; t += 0.002) { const d = stampPose(t, 0).scale - 1; if (d * prev < 0) crossings++; prev = d || prev; } ok(crossings >= 3, `stamp crosses its final size ${crossings} times (elastic)`); near(stampPose(0, 0).scale, 2.2, 1e-9, 'stamp starts at 2.2'); near(stampPose(0.8, 0).scale, 1, 1e-9, 'stamp ends at 1'); ok(stampPose(0.05, 0).a === 0.5 && stampPose(0.2, 0).a === 1, 'stamp alpha is up in 0.1 s');
  const imp = stampPose(0, 0).impact; ok(imp > 0.02 && imp < 0.5, `stamp impact time ${imp.toFixed(3)}`); ok(Math.abs(stampPose(imp, 0).scale - 1) < 0.02, 'scale is 1 at the impact time');
  ok(jolt(imp - 0.01, imp).dx === 0, 'jolt: still before the impact'); ok(Math.abs(jolt(imp + 0.03, imp).dx) + Math.abs(jolt(imp + 0.03, imp).dy) > 1, 'jolt: shakes just after'); ok(Math.abs(jolt(imp + 0.4, imp).dx) < 1e-9 && Math.abs(jolt(imp + 0.4, imp).dy) < 1e-9, 'jolt: still again after 0.35 s'); let jm = 0; for (let t = imp; t < imp + 0.35; t += 0.005) jm = Math.max(jm, Math.abs(jolt(t, imp).dx)); ok(jm <= 7 && jm > 2, `jolt peaks within its 7 px (${jm.toFixed(2)})`);
  near(toggleK(0, 1), 0, 1e-12, 'toggle off before'); near(toggleK(1.35, 1), 1, 1e-12, 'toggle on after 0.35 s'); let tm = 0; for (let t = 1; t < 1.35; t += 0.005) tm = Math.max(tm, toggleK(t, 1)); ok(tm > 1.05, `knob overshoots (${tm.toFixed(3)})`); near(toggleK(1.35, 1, { back: true }), 0, 1e-12, 'back flips it off');
  near(tabPos(0, [[2, 1]]), 0, 1e-12, 'tab starts at 0'); near(tabPos(2.35, [[2, 1]]), 1, 1e-12, 'tab slides to 1 in 0.35 s'); ok(tabPos(2.1, [[2, 1]]) > 0 && tabPos(2.1, [[2, 1]]) < 1, 'underline is between tabs mid-move'); near(tabPos(5, [[2, 1], [3, 2]]), 2, 1e-12, 'second switch lands on 2'); near(tabPos(2.6, [[2, 1], [3, 0]]), 1, 1e-12, 'holds between switches');
  near(tickK(1, 1), 0, 1e-12, 'tick starts at 0'); near(tickK(1.25, 1), 1, 1e-12, 'tick done in 0.25 s'); ok(countUp(0, 0, 1, 0.72) === 0 && countUp(1, 0, 1, 0.72) === 72 && countUp(0.3, 0, 1, 0.72) > 0 && countUp(0.3, 0, 1, 0.72) < 72, 'count-up runs 0 to 72'); near(appear(0, 0), 0, 1e-12, 'appear starts at 0');
  // each part: nothing before its time, something after
  const parts = {
    formField: (c, t) => formField(c, t, { x: 120, y: 800, ic: 'user', t0: 1 }), pressButton: (c, t) => pressButton(c, t, { x: 540, y: 900, label: 'Go', doneLabel: 'Done', t0: 1, pressT: 1.5 }),
    bubble: (c, t) => bubble(c, t, { x: 200, y: 700, w: 340, h: 92, text: 'Hi', t0: 1 }), statBar: (c, t) => statBar(c, t, { x: 120, y: 880, w: 780, label: 'Done', value: 0.7, t0: 1 }), stamp: (c, t) => stamp(c, t, { x: 540, y: 900, text: 'OK', t0: 1 }),
    toggle: (c, t) => toggle(c, t, { x: 120, y: 900, sx: 640, label: 'On', t0: 1, flipT: 1.5 }), tabs: (c, t) => tabs(c, t, { x: 110, y: 800, w: 820, labels: ['A', 'B'], t0: 1 }), checkList: (c, t) => checkList(c, t, { x: 120, y: 900, items: ['a', 'b'], t0: 1, ticks: [1.5, 1.7] }), signaturePad: (c, t) => signaturePad(c, t, { x: 120, y: 900, w: 700, h: 160, t0: 1, pts: scribble(200, 700, 1000) }) };
  for (const [n, fn] of Object.entries(parts)) { const before = lit(canvasAt(c => fn(c, 0.5))), after = lit(canvasAt(c => fn(c, 3))); ok(before === 0, `${n}: nothing drawn before t0`); ok(after > 300, `${n}: drawn after (${after} lit px)`); }
  // specific pixel evidence
  const fieldW = t => { const d = canvasAt(c => formField(c, t, { x: 120, y: 800, t0: 1, fillW: 330 })); let n = 0; const y = 800 + 37; for (let x = 200; x < 700; x++) { const i = (y * W + x) * 4; if (d[i] > 80) n++; } return n; };
  ok(fieldW(1.1) > 0 && fieldW(1.1) < fieldW(1.3) && fieldW(1.3) < fieldW(2.2), 'form field fill bar grows over time'); ok(Math.abs(fieldW(2.2) - 330) < 8, `form field fill ends at fillW (${fieldW(2.2)})`);
  const greenA = countColor(canvasAt(c => pressButton(c, 3, { x: 540, y: 900, label: 'Go', t0: 1 })), [25, 224, 143]), greenB = countColor(canvasAt(c => pressButton(c, 1.6 + 0.0, { x: 540, y: 900, label: 'Go', t0: 1, pressT: 1.5 })), [25, 224, 143]); ok(greenA > 20000, 'button is green'); ok(greenB < greenA, 'a pressed button is smaller than a resting one');
  const barPx = t => countColor(canvasAt(c => statBar(c, t, { x: 120, y: 880, w: 780, label: 'Done', value: 0.5, t0: 1, dur: 0.8 })), [25, 224, 143], 20); ok(barPx(1.2) < barPx(1.5) && barPx(1.5) < barPx(2.5), 'stat bar fills over time');
  const knobX = t => { const d = canvasAt(c => toggle(c, t, { x: 120, y: 900, sx: 640, label: 'On', t0: 0, flipT: 1 })); let sx = 0, n = 0; for (let x = 640; x < 790; x++) { const i = (870 * W + x) * 4; if (d[i] > 200 && d[i + 1] > 200) { sx += x; n++; } } return n ? sx / n : 0; }; ok(knobX(3) > knobX(0.5) + 50, 'toggle knob moves right when flipped');
  const tickPx = t => { const d = canvasAt(c => checkList(c, t, { x: 120, y: 900, items: ['a'], t0: -1, ticks: [1] })); let n = 0; for (let y = 866; y < 896; y++) for (let x = 126; x < 162; x++) { const i = (y * W + x) * 4; if (d[i + 1] < 80) n++; } return n; };
  ok(tickPx(1.05) < tickPx(1.12) && tickPx(1.12) < tickPx(3), `the tick stroke is drawn progressively (${tickPx(1.05)} < ${tickPx(1.12)} < ${tickPx(3)})`);
} });
