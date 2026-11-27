---
name: anticipation-overshoot-followthrough
description: Gives cards, buttons, badges and panels the classic principles of animation as exact numbers - a short pull-back (anticipation), a fast move that overshoots the target, a spring settle, and children that lag behind the parent (overlapping action, drag). Use whenever something travels from A to B, lands, snaps into place or gets handed to the viewer, whenever motion looks "flat", "robotic" or like a slideshow, or when someone asks for bounce, wind-up, weight or "make it feel alive", even if they never say "anticipation".
---

# Anticipation, overshoot, follow-through (t2.1)

Prerequisites: t0.1 (easing and springs), t0.2 (timeline). Code: `module.mjs`. Contract for cards: `engine/README.md`.

## When to use

Any move of an object the viewer should read as physical: a card sliding in, a chip landing, a panel changing place, a badge stamped on. Do NOT use it on text that must be read while it moves (use `outCubic`, t0.1), on background drift, or on fades.

## The idea in one line

Before it goes, it winds up (3-8 frames). When it arrives, it runs past the mark (8-15 percent of the travel), then settles (12-20 frames). Its parts do not all stop at once.

## Recipes (frames at 30 fps; `RECIPES` in module.mjs is this table as code, test-verified)

| Object | Anticipation | Pull-back | Overshoot | Settle after release | Use |
|---|---|---|---|---|---|
| `button` (chip, tag) | 3 f (0.10 s) | 6 % of travel | 12 % | 12 f | snappy, small |
| `card` (tile, row) | 4 f (0.13 s) | 5 % | 10 % | 15 f | the default |
| `toast` (banner from an edge) | 5 f | 4 % | 8 % | 16 f | sliding in |
| `badge` (stamp, hero icon) | 5 f | 10 % | 15 % | 18 f | big and playful |
| `panel` (heavy window) | 8 f (0.27 s) | 3 % | 8 % | 20 f | slow, weighty |

Measured by `test.mjs` on a 400 px move: overshoot within 0.01 percent of the recipe, anticipation exactly the frame count, settle (1 percent band) within 1 frame of the recipe, speed continuous at release.

Rules of thumb:
- Heavier or bigger = longer anticipation, smaller overshoot, longer settle. Lighter = shorter, springier.
- Pull-back opposite to the travel direction. For a card that drops in from the top, it first rises 5 percent of the drop.
- Anticipation under 3 frames is not seen; over 8 frames feels like lag. If a voice cue sets the beat, start the pull-back early so the move itself lands on the cue.
- Overshoot over 15 percent reads as rubber. Under 6 percent reads as nothing.
- Always follow with an idle (bob 3 px at 4 rad/s, glow pulse) so nothing freezes after the settle.

## The technique

1. One call gives the position: `kick(t, {t0, from, to, recipe:'card'})`. Phase 1: from `from` it eases back (inOutSine, ends at rest). Phase 2: a spring is released from the pulled-back point toward `to`. The spring constants come from `springFor(overshoot, settleSec)`, which finds zeta from the overshoot formula and omega by bisection on the real spring, so the numbers you ask for are the numbers you get.
2. Override any field: `kick(t, {t0, from, to, recipe:'card', overshoot:0.14, antic:6})`.
3. Overlapping action: `overlap(t, driverFn, i)` returns the pixel offset of layer i. Layer 0 trails by 4 frames, layer 1 by 6, layer 2 by 8 (step 0.066 s). Show only 25 percent of the lag (`amt`). Icon first, title next, bar last. The driver must be a stable function declared once at module level (it is cached by identity).
4. Drag: `lean(fn, t)` returns a tilt in radians from the card's speed: moving right leans back, level at rest. Cap 0.12 rad (7 degrees).
5. Check your own curve with `measure(fn, {from, to, t0, tEnd})`: it returns pull-back percent and frames, overshoot percent, peak frame, settle frame, max speed.

```js
import { kick, overlap, lean, RECIPES } from './module.mjs';
const X = t => kick(t, { t0: 2.0, from: 330, to: 750, recipe: 'card' });   // module level: stable
// in frame(t):
ctx.translate(X(t), 1105 + 3 * Math.sin(t * 4.1)); ctx.rotate(lean(X, t));
const iconDx = overlap(t, X, 0), titleDx = overlap(t, X, 1);
```

Several hops in a row: build X as a loop over hop start times (see `demo.mjs`: three hops, each a new `kick` from the last target). Space hops at least `anticipation + settle` apart (about 1 s for a card) or the next pull-back cuts into the settle.

## Module API

`RECIPES`; `kick(t, o)`; `kickTimes(o)` -> `{release, settled, spring}`; `springFor(overshoot, settleSec)` -> `{k,c,zeta,omega}`; `measure(fn, o)`; `overlap(t, driver, i, o)`; `velocity(fn, t)`; `lean(fn, t, o)`; `FPS`.

## Common failures

- Overshoot with no anticipation on a big object: it looks like a bounce, not an intention. Add the pull-back.
- Same recipe for everything: a chip and a window must not feel the same weight. Use the table.
- Children that stop with the parent: it reads as one rigid sprite. Use `overlap`, 25 percent of the lag.
- Tilt left on after the stop: `lean` is velocity-driven, so it levels itself; do not add a second rotation.
- Overshoot on opacity: alpha clamps, so it looks like a stall. Apply this to position and scale only.
- Text sliding with overshoot over a window edge: keep text pull-back at 0 and overshoot at most 6 percent.

## Quality bar

- Anticipation 3-8 frames, overshoot 8-15 percent, settle 12-20 frames after release, per recipe (test).
- Measured values match the recipe: overshoot within 0.6 points, pull-back within 0.3 points, frames within 0.6 / 1.5 (test).
- Speed is continuous at release; the card ends exactly on target (test).
- Children lag more than 3 px while the card moves and catch up when it stops; tilt is capped at 0.12 rad (test).
- Demo: flat card and alive card make the same three hops; QC passes with no frozen run.

## Run it

```
cd skills/t2_1_anticipation-overshoot-followthrough
node test.mjs                  # full size render + QC; exit 0 only if all pass (about 40 s)
ANNIE_PREVIEW=1 node test.mjs  # 540x960 while iterating
```
Outputs: `out/demo.mp4`, `out/contact.png`, `out/measured.json` (the numbers per recipe), `out/qc.json`.

## Next skills

t2.2 squash-and-stretch (add deformation to the landing), t2.3 particles (dust on impact).
