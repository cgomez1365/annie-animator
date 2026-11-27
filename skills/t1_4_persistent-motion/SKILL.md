---
name: persistent-motion
description: Keeps every hold of a card alive with loops - a marker dot running between nodes on marching dashes, highlight sweeps stepping down lists, pulsing meters, blinking cursors, bouncing typing dots and sonar rings. Use whenever a page or window has to stay on screen for more than half a second after its content has landed, whenever the quality checker reports a frozen run, or when a finished layout looks like a screenshot, even if the request never mentions loops or idle animation.
---

# Persistent motion (t1.4)

Prerequisites: t0.1 (easing), t0.2 (timeline: `loop`, `pulse`, `blink`), t0.4 (the checker that fails a still frame). Code: `module.mjs`. Read `engine/README.md` first.

## When to use

The checker fails a card if its motion energy stays under 0.004 for more than 0.5 s outside declared holds. The drifting background does not count (it measures 0.000). So after every entrance, something real must keep moving. tt10's rule: the thing that landed keeps moving AND the page has a loop. Use this skill to add the loops. The landing itself is t1.3, the mockup parts are t1.5.

## The loops (tt10_ops_hr and hello_card numbers)

| Loop | Function | Numbers |
|---|---|---|
| Marker between nodes | `markerAt`, `drawMarker`, `drawNodes` | each leg 0.8 s `inOutCubic`, route A-B-C-B-A, 7 ghost trail dots 0.045 legs apart, glow 24 px, radius 20; arrival ring 0.45 s |
| Dot down a dimension line | `lineRunner` | period 1.6 s, travels 85 percent with `inOutSine`, then fades; draw it UNDER opaque boxes |
| Highlight sweep | `sweep(t, {n, period 2.4, power 4})` | item i = max(0, sin(2 pi (t/period - i/n)))^4; drive border alpha 0.45 + 0.5 h and width 2 + 1.5 h |
| Meter | `meterLevel`, `barField(seed, n)`, `drawBars` | each bar its own 0.5-1.3 Hz sine on a 0.35-0.65 base, amp 0.15-0.3 |
| Breathing | `breathe(t, 1.6)` | inOutSine, 1.6 s (glows, halos) |
| Cursor | `cursorAlpha`, `drawCursor` | period 1.06 s, on 55 percent, 0.08 s soft edges, 4 px bar |
| Typing dots | `dotLift`, `drawBouncingDots` | 3 dots, 1.0 s period, 12 px hop, 0.18 period apart |
| Marching dashes | `dashedLine`, used by `drawNodes` | dash 8 6, 24-30 px/s |
| Sonar | `drawRings` | 2 rings, 10 to 46 px, 1.8 s |

All of them are pure functions of `t`. Use `t` (the card clock), never local time from an entrance, so a loop is continuous across page changes and never restarts with a jump.

## API quick reference

```js
const BARS = barField(20261119, 5);                                  // module level
const NODES = [{x:200,y:880},{x:540,y:880},{x:880,y:880}];
drawNodes(ctx, t, NODES, { ringsFrom: { t0: 1.2, legDur: 0.8 } });    // dashes march, rings on arrival
drawMarker(ctx, t, NODES, { t0: 1.2, legDur: 0.8 });                  // glowing marker with a trail
const hl = sweep(t, { t0: 1.2, n: 3 });                               // 3 numbers 0..1
drawBars(ctx, BARS(t), { x: 650, y: 940, w: 250, h: 230, color: [P.green, P.cyan] });
drawCursor(ctx, t, x, y, 44);  drawBouncingDots(ctx, t, 785, 788);  drawRings(ctx, t, 140, 786);
```
Also `pingPong(n)` (leg list), `arrivalRing(t, nodes, i, o)`, `dashedLine(ctx, t, x0, y0, x1, y1, {speed})`.

## Technique

1. After the layout is built, list what is moving. Rule of thumb from the tt10 pages: at least TWO different loops on every page that is held more than 1.5 s, one big (marker, bars) and one small (cursor, dots).
2. Start loops when their element has landed (`t0` = landing + 0.2). A loop that runs from frame 0 under a not-yet-visible element wastes nothing, but a marker that appears mid-run looks wrong: fade the element in, run the loop from its `t0`.
3. Periods that are not multiples of each other (0.8 s marker, 2.4 s sweep, 1.06 s cursor, 1.0 s dots, 1.8 s sonar) keep the page from ever repeating as one block.
4. Motion amount: a 14 px dot moving 10 px per frame gives energy 0.018 (floor 0.004). Cursor alone (a 4x44 px blink) is NOT enough. Pair it with a mover.
5. Highlight sweeps beat static emphasis: the eye follows the step, and the list reads in order.
6. Under a clip (window), loops inherit it. Under an opaque box, draw the loop first, then the box.
7. Cards with a hold longer than 0.5 s that is meant to be still must declare it in `META.holds`; do that only for a deliberate pause, not to hide a dead page.

## Common failures

- Loop restarts with a jump on a page change: you used local page time. Use `t`.
- Everything pulses in step (all `sin(t*3)`): give each element its own phase or use `barField`.
- A cursor as the only motion: frozen-run failure.
- Marker trail drawn over text: draw order, trail first, text last.
- Dashes that do not march (they look static): `lineDashOffset` must change with `t`; `dashedLine` does it, a plain `setLineDash` does not.
- Text under 42 px on a moving label fails QC for any stretch over 0.5 s.

## Quality bar

- Marker lands exactly on each node at each leg end, route repeats every 4 legs, eases in and out (unit tests).
- Sweep: never more than two items bright, steps through every item in order, loops each period.
- Meters: seeded, 0..1, never level with each other, real range over 0.3.
- Cursor and dots have on and off phases and loop; six primitives each change more than 20 pixels between frames 0.2 s apart at three different start times (pixel tests on a real canvas).
- Demo: layout built by 1.2 s, then 4 s of hold; QC reports no frozen run.

## Run it

```
node test.mjs                      (full size, about 50 s)
ANNIE_PREVIEW=1 node test.mjs      (540x960, about 15 s)
```
Writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/test_result.json`. Exit 0 only if all checks passed.
