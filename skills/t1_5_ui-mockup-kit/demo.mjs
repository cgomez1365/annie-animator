// t1.5 demo: one illustrated check-in screen in two tabs. Tab "Form": two fields fill, a toggle flips, the button presses and becomes
// "Checked in", a stamp slams in and jolts the window. Tab "Status": two stat bars grow and count, ticks draw down a checklist, a bubble pops.
import { P, begin, end, hook, E, prog, lerp } from '../../engine/index.mjs';
import { drawWindow, windowRect } from '../t1_1_window-frame/module.mjs';
import { pagePlan, drawPages } from '../t1_2_page-transitions/module.mjs';
import { formField, pressButton, toggle, tabs, stamp, statBar, checkList, bubble, stampPose, jolt } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 3.0 };
const CLOSER = 5.0, WIN = windowRect({ y: 660, h: 580 });
const PLAN = pagePlan([2.9, 2.0], { t0: 0.4, titles: ['Field check-in', 'Status'], heads: [['Fields fill,', 'buttons press.'], ['Bars grow,', 'ticks draw.']] });
const [A, B] = PLAN.pages, SWITCH = [[B.s, 1]];
const STAMP_T = A.s + 2.35, IMPACT = stampPose(STAMP_T, STAMP_T).impact;

function pageForm(c, t) {
  formField(c, t, { x: 120, y: 850, ic: 'map-pin', t0: A.s + 0.35, fillW: 330 });
  formField(c, t, { x: 120, y: 940, ic: 'user', t0: A.s + 0.65, fillW: 270 });
  toggle(c, t, { x: 120, y: 1070, sx: 640, label: 'Remind me', t0: A.s + 0.9, flipT: A.s + 1.5 });
  pressButton(c, t, { x: 540, y: 1160, label: 'Check in', doneLabel: 'Checked in', t0: A.s + 1.1, pressT: A.s + 1.95 });
  stamp(c, t, { x: 735, y: 905, text: 'LOGGED', t0: STAMP_T, rot: -0.14 });
}
function pageStatus(c, t) {
  statBar(c, t, { x: 120, y: 880, w: 780, label: 'Done', value: 0.72, t0: B.s + 0.3, dur: 0.9 });
  statBar(c, t, { x: 120, y: 975, w: 780, label: 'Left', value: 0.28, t0: B.s + 0.45, dur: 0.9, color: P.cyan });
  checkList(c, t, { x: 120, y: 1085, items: ['Arrive', 'Sign', 'Submit'], t0: B.s + 0.5, gap: 62, ticks: [B.s + 0.95, B.s + 1.25, B.s + 1.55] });
  bubble(c, t, { x: 560, y: 1070, w: 340, h: 92, text: 'On track', t0: B.s + 1.0, tail: 'bl' });
}

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  PLAN.heads.forEach(h => hook(ctx, h, t));
  const j = jolt(t, IMPACT); ctx.save(); ctx.translate(j.dx, j.dy);
  drawWindow(ctx, t, { rect: WIN, titles: PLAN.titles, enterAt: 0.15, closerAt: CLOSER }, c => {
    tabs(c, t, { x: 110, y: 806, w: 820, labels: ['Form', 'Status'], switches: SWITCH, t0: 0.5 });
    drawPages(c, t, PLAN, [pageForm, pageStatus]);
  });
  ctx.restore();
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
