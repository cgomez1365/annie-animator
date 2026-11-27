---
name: page-transitions
description: Runs the tt10 page system - content pages slide into the window over 0.4 s and out over 0.35 s while overlapping the next page by 0.1 s, each page has one header outside the window, and the window title changes only after the old page is gone. Use whenever a card shows more than one screen, step or topic in the same window, whenever pages must follow the voice-over, or when a hold between topics looks like a hard cut or a slideshow, even if the request only says "then show the next part".
---

# Page transitions (t1.2)

Prerequisites: t0.1 (easing), t0.2 (timeline), t1.1 (window frame). Code: `module.mjs` on top of `engine/timeline.mjs` (`page`, `pages`). Read `engine/README.md` first.

## When to use

A tt10 card is a hook, then 2 to 4 pages in ONE window, then the closer. Each page teaches one thing in about 3 to 5 seconds. Use this skill to schedule them and draw them. Row and object motion inside a page is t1.3 to t1.5.

## The numbers (tt10_ops_hr, extracted)

| Thing | Value |
|---|---|
| Page in | 0.4 s `outCubic`, from 160 px to the right (alpha rises with it) |
| Page out | last 0.35 s `inCubic`, to 160 px left (alpha falls with it) |
| Overlap | next page starts 0.1 s (3 frames) before the old one ends |
| tt10's pages | durations 3.1, 4.75, 3.7 from 1.9 s: 1.9-5.0, 4.9-9.65, 9.55-13.25 |
| Header | 2 lines, 56 px, baselines 446 / 514, white then green; in 0.05 s after its page starts, out 0.3 s before it ends (`hook` fades it in 0.2 s) |
| Title in the bar | changes at the END of the previous page (`pages[i-1].e`), 0.3 s crossfade |
| Rows inside a page | first row 0.15 s after the page starts, 0.14 s apart, 0.4 s `outCubic`, 40 px slide |
| Page length | 3 to 4.7 s in a real card (0.75 s is sliding). Under 1.8 s is a demo-only squeeze. |

## API (`module.mjs`)

- `pagePlan(durs, {t0, overlap, heads, titles, dist, px, b1, b2})` -> `{pages:[{s,e,i,title}], heads:[hook caps], titles:[{text,at}], end}`. `heads[i]` goes straight into the engine's `hook(ctx, cap, t)`; `titles` goes straight into `drawWindow({titles})` from t1.1.
- `pageSlide(t, page, {dir, dist})` -> `{a, dx, dy}` or null. `dir` is where the page comes FROM: `'right'` (default), `'left'`, `'up'`, `'down'`.
- `drawPages(ctx, t, plan, drawers)`: calls `drawers[i](ctx, t, page, lt)` for every page on screen, inside save/restore with alpha and translate applied. `lt = t - page.s` is local time for staggering. Call it inside the window's clip.
- `rowIn(t, page, i, {first, gap, dur, slide})` -> `{k, a, dx}` for the i-th row.
- `activePage(t, plan)` -> index of the most visible page (which page is "current" for markers, voice captions).
- `validatePlan(plan, {closerAt})` -> issues. Fails: overlap not 0.1 s, headers overlapping, title changing early, last page outliving the window exit. Warns: page under 1.8 s, header on screen under 1.0 s.

```js
const plan = pagePlan([3.1, 4.75, 3.7], { t0: 1.9, titles: ['Check-in', 'How it works', 'What we build'],
  heads: [['We build the tool', 'that replaces them.'], ['Fixed scope.', 'One flat step list.'], ['Ops and HR tools.', 'Built to your process.']] });
plan.heads.forEach(h => hook(ctx, h, t));
drawWindow(ctx, t, { titles: plan.titles, enterAt: 0.2, closerAt: 13.15 }, c => drawPages(c, t, plan, [pageA, pageB, pageC]));
```
(Header words here are layout examples; check claims against `engine/brand.mjs` BANNED before using real copy.)

## Technique

1. Decide durations from the script or voice: a page lasts as long as its sentence plus 0.75 s of motion. Put them in `pagePlan`, nothing else holds timing.
2. Write each page as a function of `(ctx, t, page, lt)`. Stagger with `rowIn`. Anything that must keep moving after it lands (sweeps, bobs, markers) uses `t`, never `lt`, so it is continuous across the whole page.
3. Header text: two short lines. Line 1 white, line 2 green. 28 characters per line is the most that fits at 56 px between the margins. The header describes the page that is entering; it is gone 0.1 s before the next header starts.
4. The first page may start while the hook is still leaving: tt10 starts page 1 at 1.9 and the hook is gone at 1.9.
5. Order of drawing: later pages sit on top, so the incoming page covers the outgoing one during the 0.1 s overlap.
6. Last page: end it at `closerAt + 0.3` so the window's exit (t1.1 `leave`) and the closer cover its slide-out.
7. Direction: keep `right` for steps that go forward. Use `up` for a stack-of-cards feel, `left` to go back.

## Common failures

- Header of page 2 appears while header of page 1 is still fading: use `pagePlan` and `validatePlan`; never type header times by hand.
- Title changes at the page start (old page still visible, wrong label): the plan sets `at` to the end of the previous page.
- A page that is too long goes quiet. Add persistent motion (t1.4).
- Text of a page crosses x 940 below y 800 for over 0.5 s: the rail rule fails. The slide itself is 0.4 s, so crossing while sliding is allowed (it shows as a warning at most); at rest, keep text left of x 930.
- Pages shorter than 1.8 s read as a flicker. A real card should be 3 s or more.

## Quality bar

- tt10's own three pages are reproduced exactly (unit test); every slide endpoint exact; mid-points match the curves.
- Overlap is 0.1 s and both pages are drawn in it; header and title rules hold; `validatePlan` catches each broken rule.
- Demo: 8 s, 1080x1920, silent, three pages with headers, QC passes, no frozen run over 0.5 s.

## Run it

```
node test.mjs                      (full size, about 45 s)
ANNIE_PREVIEW=1 node test.mjs      (540x960, about 15 s)
```
Writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/test_result.json`. Exit 0 only if all checks passed.
