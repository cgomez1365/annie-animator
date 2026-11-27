#!/usr/bin/env node
// t1.6 test: the closer matches the engine's closer pixel for pixel by default, has every required element, never freezes, the press and
// the plan rules hold; then render the demo (AEON variant) and run the quality checker, which requires slogan pair, Follow, footer and 18+.
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas, setFont } from '../../engine/canvas.mjs';
import { closer as engineCloser, CLOSER as EL } from '../../engine/parts.mjs';
import { SLOGAN, EIGHTEEN } from '../../engine/brand.mjs';
import { CLOSER_T, CLOSER_HOLD, choreography, fadeOut, validateCloser, drawSlogan, drawFollow, drawCloser } from './module.mjs';
import { _issues } from './demo.mjs';

const W = 1080, H = 1920, px = fn => { const cv = createCanvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#0a0c10'; c.fillRect(0, 0, W, H); fn(c); return c.getImageData(0, 0, W, H).data; };
const nDiff = (a, b, tol = 8) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > tol) n++; return n; };
const count = (d, rgb, tol, y0, y1, x0 = 0, x1 = W) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; if (Math.abs(d[i] - rgb[0]) < tol && Math.abs(d[i + 1] - rgb[1]) < tol && Math.abs(d[i + 2] - rgb[2]) < tol) n++; } return n; };
const btnWidth = (d, y) => { let x0 = -1, x1 = -1; for (let x = 200; x < 880; x++) { const i = (y * W + x) * 4; if (d[i] < 60 && d[i + 1] > 190 && d[i + 2] > 110 && d[i + 2] < 190) { if (x0 < 0) x0 = x; x1 = x; } } return x1 - x0; };

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  const T0 = 4.5, c = choreography(T0, { hookTOut: 1.5 });
  near(c.leaveStart, 4.4, 1e-9, 'leave starts 0.1 s before closerAt'); near(c.leaveEnd, 4.8, 1e-9, 'leave ends 0.3 s after'); near(c.slogan2[0], 5.05, 1e-9, 'slogan line 2 at t0+0.55'); near(c.press[0], 6.4, 1e-9, 'press at t0+1.9'); near(c.revealed, 5.7, 1e-9, 'reveal done at t0+1.2'); near(c.end, 7.6, 1e-9, 'card should run to closerAt + 3.1'); near(c.hookGone, 1.7, 1e-9, 'hook is gone 0.2 s after its tOut'); near(CLOSER_HOLD, 3.1, 1e-9, 'hold is 3.1 s');
  near(fadeOut(4.3, 4.5), 1, 1e-12, 'fadeOut is 1 before the hand-over'); near(fadeOut(4.4, 4.5), 1, 1e-12, 'still 1 at closerAt - 0.1'); near(fadeOut(4.8, 4.5), 0, 1e-12, 'zero at closerAt + 0.3'); ok(fadeOut(4.6, 4.5) > 0.2 && fadeOut(4.6, 4.5) < 0.8, 'half way during the hand-over');
  // validation
  ok(validateCloser({ closerAt: 4.5, duration: 8, metaBrand: 'bgi' }).length === 0, 'a good plan has no issues'); ok(validateCloser({ closerAt: 6.5, duration: 8 }).some(i => i.level === 'fail'), 'under 2.5 s of closer fails'); ok(validateCloser({ closerAt: 5.2, duration: 8 }).some(i => i.level === 'warn'), 'under 3.1 s of closer warns');
  ok(validateCloser({ closerAt: 3, duration: 8 }).some(i => /first half/.test(i.msg)), 'closer in the first half fails'); ok(validateCloser({ closerAt: 4.5, duration: 8, brand: 'aeon', metaBrand: 'bgi' }).some(i => /18\+/.test(i.msg)), 'aeon without META.brand fails'); ok(validateCloser({ closerAt: 4.5, duration: 8, hookTOut: 4.3 }).some(i => /hook/.test(i.msg)), 'hook still up at the hand-over fails'); ok(_issues.length === 0, `demo plan has no issues: ${JSON.stringify(_issues)}`);
  // identical to the engine's closer
  for (const brand of ['bgi', 'aeon']) for (const dt of [0.2, 0.6, 1.0, 1.5, 2.0, 2.8]) { const a = px(cc => drawCloser(cc, T0 + dt, T0, { brand })), b = px(cc => engineCloser(cc, T0 + dt, T0, { brand })); const n = nDiff(a, b); ok(n <= 40, `${brand} closer at t0+${dt} matches the engine (${n} px differ)`); }
  // nothing before t0
  ok(nDiff(px(cc => drawCloser(cc, T0 - 0.1, T0, {})), px(() => {})) === 0, 'nothing is drawn before t0');
  // slogan: both lines, colours, safe width
  const bg = px(cc => drawCloser(cc, T0 + 2.5, T0, { brand: 'bgi' })); ok(count(bg, [248, 250, 252], 12, EL.bgi.s1 - 50, EL.bgi.s1 + 6) > 250, 'slogan line 1 is white'); ok(count(bg, [25, 224, 143], 14, EL.bgi.s2 - 50, EL.bgi.s2 + 6, 0, 900) > 250, 'slogan line 2 is #19e08f green'); ok(count(bg, [25, 224, 143], 14, EL.bgi.s1 - 50, EL.bgi.s1 + 6) < 30, 'line 1 is not green');
  { const cv = createCanvas(W, H), cx = cv.getContext('2d'); setFont(cx, 'sg', 60, 700, -0.01); ok(cx.measureText(SLOGAN[0]).width / 2 + 540 < 930, `line 1 ends at x ${Math.round(540 + cx.measureText(SLOGAN[0]).width / 2)}, left of the action rail`); }
  const only1 = px(cc => drawSlogan(cc, T0 + 0.6, T0, 975, 1057)); ok(count(only1, [248, 250, 252], 20, 900, 1000) > 0, 'slogan lines rise in together (line 1 first, line 2 following 0.2 s later)');
  // follow button, 18+, footer
  const aeon = px(cc => drawCloser(cc, T0 + 2.5, T0, { brand: 'aeon' })); ok(count(aeon, [25, 224, 143], 20, EL.aeon.btn - 40, EL.aeon.btn + 40, 290, 790) > 8000, 'AEON closer has the green Follow button'); ok(count(aeon, [148, 163, 184], 40, EL.aeon.adult[0] - 40, EL.aeon.adult[1] + 14) > 300, 'AEON closer draws the 18+ line'); const said = brand => { const cv = createCanvas(W, H), cx = cv.getContext('2d'), L = []; const orig = cx.fillText.bind(cx); cx.fillText = (s, ...r) => { L.push(String(s)); return orig(s, ...r); }; drawCloser(cx, T0 + 2.5, T0, { brand }); return L; };
  ok(said('aeon').some(s => s.startsWith('AEON is for adults: 18+,')) && said('aeon').some(s => s.startsWith('or the age of majority where you live')), 'AEON closer writes both halves of the 18+ line'); ok(!said('bgi').some(s => /18\+/.test(s)), 'BGI closer has no 18+ line'); ok(said('bgi').includes(SLOGAN[0]) && said('bgi').includes(SLOGAN[1]), 'both slogan lines are drawn together'); ok(said('bgi').includes('brokengearindustries.com') && said('aeon').includes('brokengearindustries.com/aeon'), 'footers are the brand URLs');
  ok(EIGHTEEN.startsWith('AEON is for adults: 18+, or the age of majority where you live'), 'the 18+ wording is the engine\'s, whole'); ok(EL.aeon.adult[1] < 1240 && EL.bgi.foot < 1250, 'all closer text sits above y 1250');
  // press: the button narrows ~4 percent at pressAt + 0.1, and not when pressAt is false
  const y = EL.bgi.btn, w = tt => btnWidth(px(cc => drawFollow(cc, tt, T0, y)), y), wFalse = tt => btnWidth(px(cc => drawFollow(cc, tt, T0, y, { pressAt: false })), y);
  const pa = T0 + 1.9, rest = (w(pa - 0.2) + w(pa + 0.4)) / 2, dip = w(pa + 0.1); ok(dip < rest * 0.975, `button squeezes at the press (${dip} vs ${rest.toFixed(0)} px wide)`); ok(Math.abs(wFalse(pa + 0.1) - (wFalse(pa - 0.2) + wFalse(pa + 0.4)) / 2) < 14, 'with pressAt false there is no squeeze (only the 1.5 percent breathing)');
  ok(w(T0 + 0.7) === -2 || w(T0 + 0.7) <= 0, 'button is not there before t0 + 0.8'); { const g1 = px(cc => drawFollow(cc, T0 + 2.4, T0, y)), g2 = px(cc => drawFollow(cc, T0 + 2.8, T0, y)); ok(nDiff(g1, g2, 4) > 200, 'the button breathes (glow changes between frames 0.4 s apart)'); }
  // never freezes
  ok(nDiff(px(cc => drawCloser(cc, T0 + 3.0, T0, { brand: 'aeon' })), px(cc => drawCloser(cc, T0 + 3.2, T0, { brand: 'aeon' })), 6) > 150, 'the closer changes between frames 0.2 s apart in the hold');
  // options
  ok(count(px(cc => drawCloser(cc, T0 + 2.5, T0, { brand: 'bgi', mark: false })), [248, 250, 252], 12, 320, 700) < count(bg, [248, 250, 252], 12, 320, 700), 'mark:false removes the gear'); ok(nDiff(px(cc => drawCloser(cc, T0 + 2.5, T0, { cta: 'brokengearindustries.com/store' })), bg) > 200, 'cta text can be replaced'); ok(CLOSER_T.press[0] === 1.9 && CLOSER_T.settle === 1.2, 'timing table');
} });
