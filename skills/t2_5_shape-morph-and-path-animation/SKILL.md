---
name: shape-morph-and-path-animation
description: Animates vector paths - strokes that draw themselves on (trim paths) with glow and a bright head, running light windows along an outline, morphing one shape or icon into another (play to pause, menu to x, check to heart) even when they have different numbers of parts, and moving an object along a curve at even speed while it turns to face the direction of travel. Use whenever a line, chart, check mark, logo outline or icon should appear or change, whenever an icon swap looks like a cut or a crossfade, or when an object must travel a curved route, even if the person never says "path" or "morph".
---

# Shape morph and path animation (t2.5)

Prerequisites: t0.1 (curves), t0.2 (timeline). Code: `module.mjs`. Contract: `engine/README.md`. Glow on strokes borrows the idea of t2.3; this module has its own so it has no cross-skill import.

## When to use

A line chart or underline that draws itself; a check mark confirming; an icon that changes meaning (play to pause, menu to x, check to heart); a logo outline tracing; an arrow, plane or dot travelling a route; a light running along a border to keep a held shape alive.

## How it works

1. Turn path data into a `Path`: `makePath(d, {step})` flattens an SVG `d` string (or several) into polylines. `step` = longest segment in the path's own units: 0.2 for 24-unit icons, 4 for pixel paths. `iconPath('play')` loads a lucide icon (circles, rects, lines, arcs are converted).
2. Put it in pixels once: `place(path, {x, y, s})`. Line widths are then in px.
3. Everything after that is by arc length (`path.len`), so speeds are even and trims are exact.

Supported path commands: M L H V C S Q T A Z, absolute and relative, compact arc flags like `a2 2 0 012 2`. Arcs and quadratics become cubics. Lengths are tested against independent references (0.1 percent for cubics, 0.3 percent for arcs and circles).

## Draw-on (trim paths)

`drawOn(ctx, path, {from, to, color, width, glow, head, alpha, cap})` strokes the part between fractions `from` and `to` of the total length, across all subpaths. Recipes (`RECIPES`):

| Job | Ease | Seconds (frames) | Notes |
|---|---|---|---|
| Draw-on (line, check, outline) | outCubic or inOutCubic | 0.6-1.4 (18-42) | `to = ease(prog(t, t0, t0+dur))`; long paths up to 1.4 s |
| Chase (light running along) | linear, looped | 1.1-1.3 per lap | `chaseWindow(loop(t, 1.2), 0.25)` gives `{from, to}`; 20-30 percent of the length |
| Morph | inOutCubic | 0.5-0.7 (15-21) | stagger 0.3 |
| Follow | inOutCubic | 1.2-2.4 | arc-length speed, heading from the tangent |

Looks good: width 8-10 px at 200 px icon size (stroke about 4 percent of the size), glow colour = stroke colour, head dot white. After a closed shape finishes drawing, fade its fill in over 0.3 s (`fillPath`, alpha 0.16-0.22). Held shapes get a chase window so they never freeze.

## Morph

```js
const A = place(iconPath('play'), { x: 150, y: 768, s: 200 / 24 }), B = place(iconPath('pause'), { x: 150, y: 768, s: 200 / 24 });
const prep = prepareMorph(A, B, { n: 110 });                // once, at module level
drawOn(ctx, morphPath(prep, E.inOutCubic(prog(t, 2.85, 3.45)), { stagger: 0.3 }), { width: 9, glow: '#19e08f' });
```
- Subpaths are paired by size (biggest to biggest). A subpath with no partner grows from, or collapses to, the centre of the other icon (play to pause grows the second bar; menu to x collapses the third line).
- Each pair is resampled to n points (96-120 is smooth) and the start point and direction are chosen to minimise travel (a square morphing to a rotated copy of itself moves almost nothing: tested).
- Closed to open pairs are morphed as open strokes.
- `stagger` 0.3 lets the change travel along the outline (organic); 0 changes everywhere at once (mechanical).
- Chain icons 0.2-0.3 s apart; do not morph while the previous morph is still moving.
- Morphing a shape into one that has a very different outline length is fine; into one with a different topology (a ring to a bar) looks like a collapse: use a draw-on instead.

## Follow a path

`follow(path, k)` -> `{x, y, angle}` at the eased fraction k (constant speed, heading smoothed over 2 percent of the length). `drawFollower(ctx, pos, fn, scale)` translates and rotates so `fn` draws the object pointing right. To turn around, add `Math.PI * E.inOutCubic(prog(...))` to the angle over 0.2 s while it reverses. Anticipate the start with a short pull-back (t2.1). Heading turns less than 0.3 rad per frame on a 3 s S-curve ride (test).

## Module API

`RECIPES`, `parseSvgPath`, `makePath`, `iconPaths`, `iconPath`, `pathFromPoints`, `place`, `bbox`, `pointAt`, `resample`, `drawOn`, `fillPath`, `chaseWindow`, `prepareMorph`, `morphPath`, `follow`, `drawFollower`, `length`.

## Common failures

- `step` too big on a 24-unit icon: it looks polygonal. Use 0.2 or less; use 4 for pixel paths.
- Scaling after the stroke: line widths scale with it. `place()` first.
- Drawing the morph with `fillPath` while the pair is open: fills a strange sliver. Fill only closed shapes.
- Morph between two shapes of unrelated meaning with n too low (under 64): the outline shimmers. Use 96+.
- A path that never returns to its start but is marked closed: always end with `Z` for shapes.
- Object follows a polyline with sharp corners: heading snaps. Use curves, or accept the smoothing (2 percent).
- A held drawn shape with no chase or glow pulse: freezes. Add `chaseWindow`.

## Quality bar

- Parser handles all commands; lengths match independent references (cubic 0.1 percent, circle 0.3 percent) (test).
- Trims verified on pixels: `to 0.5` stops at the middle, `from 0.4 to 0.6` is a window, trim runs across subpaths (test).
- Morph at 0 is exactly A and at 1 exactly B; distance from A grows monotonically; 4 icon pairs with unequal subpath counts end with the right length and bounds (test).
- Constant speed along an S curve within 2 percent; heading continuous (test).
- Demo: icon chain, S-curve flight and a chart that draws itself, all with live motion; QC passes.

## Run it

```
cd skills/t2_5_shape-morph-and-path-animation
node test.mjs                  # about 45 s at full size
ANNIE_PREVIEW=1 node test.mjs
```
Outputs: `out/demo.mp4`, `out/contact.png`, `out/measured.json`, `out/qc.json`.

## Next skills

Tier 3 scene builders (charts, icon sequences, UI flows) use draw-on and morph; t2.4 reveals pair with draw-on edges.
