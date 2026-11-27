#!/usr/bin/env node
// t1.2 test: timing maths against tt10's own numbers, plan validation, then render the demo and run the quality checker.
import { runSkillTest } from '../../engine/testkit.mjs';
import { E } from '../../engine/ease.mjs';
import { pagePlan, pageSlide, drawPages, activePage, rowIn, validatePlan, PAGE } from './module.mjs';
import { _issues } from './demo.mjs';

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => {
  // tt10_ops_hr's own pages: 1.9-5.0, 4.9-9.65, 9.55-13.25
  const tt10 = pagePlan([3.1, 4.75, 3.7], { t0: 1.9 }); [[1.9, 5.0], [4.9, 9.65], [9.55, 13.25]].forEach(([s, e], i) => { near(tt10.pages[i].s, s, 1e-9, `tt10 page ${i} start`); near(tt10.pages[i].e, e, 1e-9, `tt10 page ${i} end`); });
  const p = tt10.pages[0];
  ok(pageSlide(1.8, p) === null && pageSlide(5.1, p) === null, 'no slide outside the page window');
  near(pageSlide(1.9, p).a, 0, 1e-12, 'alpha 0 at the start'); near(pageSlide(1.9, p).dx, 160, 1e-9, 'enters from 160 px to the right'); near(pageSlide(2.3, p).dx, 0, 1e-9, 'in is finished after 0.4 s'); near(pageSlide(2.3, p).a, 1, 1e-12, 'fully opaque after 0.4 s');
  near(pageSlide(2.3 - 0.2, p).dx, 160 * (1 - E.outCubic(0.5)), 1e-9, 'half-way in uses outCubic'); near(pageSlide(4.65, p).a, 1, 1e-12, 'still full 0.35 s before the end'); near(pageSlide(5.0, p).a, 0, 1e-12, 'alpha 0 at the end'); near(pageSlide(5.0, p).dx, -160, 1e-9, 'leaves 160 px to the left');
  near(pageSlide(4.65 + 0.175, p).dx, -160 * E.inCubic(0.5), 1e-9, 'half-way out uses inCubic');
  ok(pageSlide(2.0, p, { dir: 'up' }).dy > 0 && pageSlide(2.0, p, { dir: 'up' }).dx === 0, 'dir up moves vertically'); ok(pageSlide(2.0, p, { dir: 'left' }).dx < 0, 'dir left enters from the left');
  // overlap: during 4.9..5.0 both page 0 (leaving) and page 1 (arriving) are on screen
  ok(pageSlide(4.95, tt10.pages[0]) && pageSlide(4.95, tt10.pages[1]), 'both pages visible during the 0.1 s overlap'); ok(!pageSlide(4.85, tt10.pages[1]), 'next page not yet there before the overlap'); ok(pageSlide(4.95, tt10.pages[0]).a < 0.8, 'outgoing page is already fading in the overlap');
  ok(activePage(2.8, tt10) === 0 && activePage(6, tt10) === 1 && activePage(12, tt10) === 2 && activePage(0.5, tt10) === -1, 'activePage picks the visible page');
  // headers: tt10 header i = s+0.05 .. e-0.3
  const h = pagePlan([3.1, 4.75], { t0: 1.9, heads: [['a', 'b'], ['c', 'd']], titles: ['T1', 'T2'] });
  near(h.heads[0].tIn, 1.95, 1e-9, 'header in 0.05 s after its page'); near(h.heads[0].tOut, 4.7, 1e-9, 'header out 0.3 s before its page ends'); ok(h.heads[0].px === 56 && h.heads[0].b1 === 446 && h.heads[0].b2 === 514, 'header at 56 px, baselines 446 / 514'); ok(h.heads[0].c2 === '#19e08f', 'header line 2 is green');
  ok(h.heads[0].tOut + 0.2 < h.heads[1].tIn, 'one header is gone before the next appears'); ok(h.titles[0].at === -Infinity && Math.abs(h.titles[1].at - 5.0) < 1e-9, 'title 2 changes when page 1 is gone');
  ok(validatePlan(h).filter(i => i.level === 'fail').length === 0, 'a tt10 style plan validates');
  // validation catches mistakes
  const bad = pagePlan([3, 3], { t0: 0, overlap: 0.3, heads: [['a', 'b'], ['c', 'd']] }); ok(validatePlan(bad).some(i => i.level === 'fail' && /before page/.test(i.msg)), 'overlap 0.3 s is flagged');
  const shortP = pagePlan([1.0], { t0: 0, heads: [['a', 'b']] }); ok(validatePlan(shortP).some(i => i.level === 'warn'), 'a 1 s page warns');
  const late = pagePlan([3, 3], { t0: 0 }); ok(validatePlan(late, { closerAt: 2 }).some(i => i.level === 'fail'), 'a page outliving the window exit fails');
  const badT = { pages: h.pages, heads: [], titles: [{ text: 'a', at: -Infinity }, { text: 'b', at: 4 }], end: 7, dist: 160 }; ok(validatePlan(badT).some(i => /before page/.test(i.msg)), 'a title that changes while the old page is still there fails');
  // rows: 0.14 s apart
  near(rowIn(2.05, tt10.pages[0], 0).k, 0, 1e-12, 'row 0 starts 0.15 s after the page'); ok(rowIn(2.3, tt10.pages[0], 0).k > 0.5 && rowIn(2.3, tt10.pages[0], 3).k === 0, 'later rows start later'); near(rowIn(2.05 + 0.14 * 2 + 0.4, tt10.pages[0], 2).k, 1, 1e-12, 'row ends at 1');
  // drawPages calls the right drawers in order, with local time
  const calls = [], fake = { save() {}, restore() {}, translate() {}, globalAlpha: 1 }; const got = drawPages(fake, 4.95, tt10, [() => calls.push(0), (c, t, pg, lt) => calls.push([1, +lt.toFixed(2)]), () => calls.push(2)]); ok(JSON.stringify(got) === '[0,1]' && calls[0] === 0 && calls[1][0] === 1 && calls[1][1] === 0.05, 'drawPages draws outgoing then incoming with local time');
  ok(PAGE.inDur === 0.4 && PAGE.outDur === 0.35 && PAGE.overlap === 0.1, 'house constants');
  ok(_issues.filter(i => i.level === 'fail').length === 0, `demo plan has no failing issues: ${JSON.stringify(_issues)}`);
} });
