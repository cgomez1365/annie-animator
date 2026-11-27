#!/usr/bin/env node
// t1.1 test: unit checks of the window maths and the clip (real pixels), then render the demo and run the quality checker.
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/canvas.mjs';
import { windowRect, validateWindow, lerpRect, titleState, enter, leave, clipInner, drawFrame, drawWindow, WIN } from './module.mjs';

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  const r = windowRect(); ok(r.x === 72 && r.y === 560 && r.w === 936 && r.h === 640 && r.r === 22, 'default window is 72,560,936x640 radius 22');
  ok(r.inner[0] === 74 && r.inner[1] === 560 + 72 + 2 && r.inner[2] === 932 && r.inner[3] === 640 - 72 - 4, 'inner rect = under the bar, inside the 2 px border');
  const a = windowRect({ y: 660, h: 580 }); ok(a.inner[3] === 504, 'adjustable height changes the inner rect (tt10 window: 504)');
  ok(validateWindow(WIN).length === 0, 'default window has no safe-zone issues');
  ok(validateWindow({ y: 400 }).some(i => i.level === 'fail'), 'window under the header zone fails'); ok(validateWindow({ y: 1100, h: 600 }).some(i => i.level === 'fail'), 'window into the caption band fails');
  ok(validateWindow({ w: 1200 }).some(i => i.level === 'fail'), 'window wider than the frame fails'); ok(validateWindow({ y: 700, h: 700 }).some(i => i.level === 'warn'), 'window in the Reels band warns');
  const m = lerpRect({ h: 640 }, { h: 520 }, 0.5); near(m.h, 580, 1e-9, 'lerpRect midpoint'); near(lerpRect({ h: 640 }, { h: 520 }, 1).h, 520, 1e-9, 'lerpRect end'); near(lerpRect({ h: 640 }, { h: 520 }, 1.1).h, 508, 1e-9, 'lerpRect overshoots with k > 1');
  const T = [{ text: 'A', at: -Infinity }, { text: 'B', at: 2 }];
  ok(titleState(1, T).length === 1 && titleState(1, T)[0].text === 'A' && titleState(1, T)[0].a === 1, 'before the change only title A');
  const mid = titleState(2.15, T); ok(mid.length === 2, 'two titles during the fade'); near(mid[0].a + mid[1].a, 1, 1e-9, 'crossfade alphas sum to 1'); ok(mid[0].text === 'B' && mid[1].text === 'A', 'new title first, old second');
  const end = titleState(2.3, T); ok(end.length === 1 && end[0].text === 'B' && end[0].a === 1, 'after 0.3 s only title B at full alpha'); ok(Math.abs(mid[0].dy) <= 6 && Math.abs(mid[1].dy) <= 6, 'title lift is 6 px at most');
  near(enter(0.2, { t0: 0.2 }).a, 0, 1e-12, 'enter starts at 0'); near(enter(0.6, { t0: 0.2 }).dy, 0, 1e-12, 'enter ends in place'); near(enter(0.6, { t0: 0.2 }).a, 1, 1e-12, 'enter ends opaque'); ok(enter(0.3, { t0: 0.2 }).k > 0.5, 'outCubic is past half at a quarter of the way'); near(enter(0.2, { t0: 0.2 }).dy, 80, 1e-9, 'rise is 80 px');
  near(leave(4.5, 4.6), 1, 1e-12, 'leave starts at closerAt - 0.1'); near(leave(4.9, 4.6), 0, 1e-12, 'leave ends at closerAt + 0.3');
  // the clip, with real pixels: paint red everywhere, clipped; red must exist inside inner and not in the bar, the border or outside
  const cv = createCanvas(1080, 1920), c = cv.getContext('2d'), R = windowRect(); c.fillStyle = '#000'; c.fillRect(0, 0, 1080, 1920);
  c.save(); clipInner(c, R); c.fillStyle = '#ff0000'; c.fillRect(0, 0, 1080, 1920); c.restore();
  const px = (x, y) => c.getImageData(x, y, 1, 1).data[0] > 200;
  ok(px(540, 900), 'clip: inside the content area is painted'); ok(!px(540, 580), 'clip: title bar is not painted'); ok(!px(60, 900), 'clip: left of the window is not painted'); ok(!px(1030, 900), 'clip: right of the window is not painted'); ok(!px(540, 1210), 'clip: below the window is not painted');
  ok(!px(75, 1197), 'clip: the rounded bottom-left corner is not painted'); ok(px(120, 1190), 'clip: just inside the bottom edge is painted');
  // frame: three traffic lights with the right colours; title pixels differ between two titles
  const f = createCanvas(1080, 1920), fc = f.getContext('2d'); fc.fillStyle = '#0a0c10'; fc.fillRect(0, 0, 1080, 1920); drawFrame(fc, 0, { rect: R, title: 'Hi' });
  const col = (x, y) => Array.from(fc.getImageData(x, y, 1, 1).data.slice(0, 3));
  ok(col(112, 596)[0] > 230 && col(112, 596)[1] < 120, 'traffic light 1 is red'); ok(col(142, 596)[0] > 230 && col(142, 596)[1] > 160, 'traffic light 2 is amber'); ok(col(172, 596)[1] > 170 && col(172, 596)[0] < 80, 'traffic light 3 is green');
  const d = createCanvas(1080, 1920), dc = d.getContext('2d'); dc.fillStyle = '#0a0c10'; dc.fillRect(0, 0, 1080, 1920);
  ok(drawWindow(dc, 0.05, { enterAt: 0.2 }, () => {}) === false, 'drawWindow draws nothing before its entrance'); ok(drawWindow(dc, 1, { enterAt: 0.2 }, () => {}) === true, 'drawWindow draws after its entrance');
} });
