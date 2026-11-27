---
name: layout-and-composition
description: Composes vertical 9:16 cards: a 12-column grid, rule of thirds for tall frames, the platform safe zones, a type hierarchy with a 42 px floor, text fitting (fitPx) with balanced lines, an auto layout that stacks and shrinks text blocks to a box while keeping clear of the action rail, tile grids, optical centring, composition checks and contrast maths (with an auto-fix). Use whenever a card needs its elements placed, text must fit a box, copy of unknown length must not break the layout, or a colour must be checked for legibility, even if the request only says "lay this out" or "make it fit".
---

# Layout and composition (t3.4)

Prerequisites: t0.1, t0.2, t0.3, t0.4 (checker: its safe-zone rules are the ones used here). Code: `module.mjs` on the engine. Demo: `demo.mjs` (8 s: guides and a snapped tile grid, text re-fitting between short and long copy, live contrast ratios with an auto-fix).

## The frame (1080 x 1920)

- No text above y 250, from y 1580 down, or at x >= 940 inside y 800-1580. 42 px is the smallest text. Avoid the Reels caption band y 1250-1580 for anything that must be read (warning only).
- `ZONES.full` = x 72-1008, y 262-1568 (12 px inside the limits). `ZONES.prime` = x 72-928, y 400-1250: the calm middle where hooks and windows live.
- A CENTRED line in the rail band (y 800-1580) can be 776 px wide at most (`maxWidthAt(y0, y1)`); above y 800 it can be 936.
- Slots used by the tt10 cards (`SLOTS`): kicker baseline 300, hook band y 400-700 (px 104, baselines 470 and 580), page headers px 56 at baselines 446 and 514, window y 560-1200, caption band 1250-1580, closer y 440-1240.

## Technique

1. Grid: `makeGrid()` = 12 columns, 72 margins, 24 gutters. `g.span(3, 6)` gives [x, width] for six columns from column 3. Align edges to column lines; use tiles for repeated things: `gridLayout(4, box, {cols:2, gap:28})` returns equal cells (a short last row is centred).
2. Thirds for tall frames: lines x 360 and 720, y 640 and 1280 (`thirds()`). Put the subject (hero object, big number, chart) in the middle third (y 640-1280), near the upper power points; supporting text in the lower third above y 1250. One focal point per page.
3. Hierarchy: pick roles, not sizes. `ROLES`: head (Space Grotesk 104, up to 3 lines), sub (56), body (46), caption (42, muted), eyebrow (42, tracked, green, uppercase). Adjacent levels differ by at least 1.25x (104/56 = 1.86 good, 56/46 = 1.22 weak: use weight or colour too). `typeScale(step)` = 42, 56, 75, 100, 133.
4. Fit: `fitPx(ctx, text, {maxW, maxLines, maxPx, minPx, fam, wght})` steps down 2 px and balances the lines (no one-word last line). It never returns under 42 and says `fits:false` when the copy is too long: shorten the copy, never go under 42.
5. Auto layout: `autoLayout(ctx, [{text, role, maxLines?}], {box, cx:540, vAlign:'optical'})` fits every block at the largest common scale (down to 0.55), stacks them with a gap of 0.5 em, centres them optically (centre at 46 percent of the box), and narrows each block for the rail band it lands in (iterates 3 passes). Returns `items` (lines, px, baselines, y0, y1), `bounds`, `fits`, `scale`, `issues`. Draw with `drawItem(ctx, item, {alpha, dy})`. Build it once per copy, not per frame, if you can (it only depends on fonts).
6. Check: `layoutIssues(layout)` (top, bottom, rail, 42 px, 40 px side margin) and `composeCheck(rects, {allow, balance})` (overlaps, hierarchy too flat, visual mass off the centre line by more than 8 percent). Run both in the card's test.
7. Contrast: `contrastRatio(fg, bg)` is WCAG (1 to 21). The engine checker fails text under 3:1 and warns under 4.5. `ensureContrast(fg, bg, 4.5)` lightens (dark ground) or darkens (light ground) a colour until it passes; use it for any colour not taken from the palette. The palette's `dim` (#475569) is 2.5:1: texture only, never words.

## Recipes

- Hook card: eyebrow, head (2 lines), sub in box y 400-700; window below from y 760.
- Stat card: number (px 180-220 from t3.2/t3.3) centred on y 700-800 (upper power point), caption under it, source line last.
- List card: `gridLayout(n, box, {cols:1, gap:20, aspect:0.2})` rows 150 px high, icon left, label 50 px.
- Copy of unknown length: always lay out through autoLayout and read `fits`; if false, show the shorter variant.

## Common failures

- Centred 860 px text at y 900: right edge 970, in the rail. Use `maxWidthAt`.
- Two sizes 1.1x apart: reads as a mistake. Make them 1.25x or more apart, or give them the same size.
- Fixing overflow by going to 38 px: the checker fails it. Cut words.
- Everything centred and equal weight: no focal point. One big thing, one supporting thing.
- Layout computed inside the frame loop with `Math.random` or timing: layouts must be pure functions of the copy and the fonts.
- Optical centre ignored: geometrically centred stacks look low; `opticalY` lifts them about 4 percent of the free space.

## API (`module.mjs`)

Zones and grid: `SLOTS`, `ZONES`, `maxWidthAt`, `makeGrid`, `thirds`, `opticalY`, `gridLayout`, `stackY`, `centerOfMass`. Type: `typeScale`, `ROLES`, `fitPx`, `autoLayout`, `drawItem`. Checks: `layoutIssues`, `composeCheck`. Contrast: `luminance`, `contrastRatio`, `ensureContrast`.

## Quality bar (measurable)

- Grid: 12 columns span exactly 72 to 1008; two halves plus a gutter equal 936; tiles are equal and never overlap and fill the box.
- fitPx: 12 real headlines all fit 776 px in at most 3 lines at 42 px or more; a short headline stays at 90 px or more; impossible copy answers `fits:false` at 42; lines are balanced (shortest over 60 percent of longest).
- autoLayout: head > sub > eyebrow in size with head/sub at least 1.25x; blocks do not overlap; stays in its box; in the rail band the right edge is under x 940 and width at most 776; above it the full width is used; the drawn ink sits inside the computed box and is centred.
- layoutIssues and composeCheck catch each failure they claim to (tested one by one); contrast maths: white on black 21, ensureContrast fixes the dim grey to 4.5:1 and darkens on light grounds.
- Demo: engine QC passes on the card and on the mp4.

## Run it

`node test.mjs` (add `ANNIE_PREVIEW=1` for a fast 540x960 run). Writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/qc_zones.png`. Exit 0 only if everything passes.
