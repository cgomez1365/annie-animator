---
name: masks-reveals-wipes
description: Reveals and removes content with masks instead of fades - straight and diagonal wipes, iris, split, scan lines, ink-like blob wipes, feathered soft wipes, and text reveals (mask rise, wipe with a bright edge, per-letter, typewriter) - with easing, duration and edge-glow recipes, all verified on real pixels. Use whenever a card, image, number or headline enters or leaves, whenever a transition feels like a plain fade or a cut, or when someone asks for a wipe, reveal, iris, transition, "uncover" or "text animation", even if they never say "mask".
---

# Masks, reveals and wipes (t2.4)

Prerequisites: t0.1 (curves), t0.2 (timeline). Code: `module.mjs`. Contract: `engine/README.md`. Edge glows pair with t2.3; leaving things pair with t2.1.

## When to use

A new thing appears or an old one leaves and the viewer should feel a direction. A fade says "nothing happened"; a wipe says "this came from there". Use ONE reveal style per card family so it feels designed; vary direction, not style.

## How a reveal works

Every reveal takes a progress `k` (0..1, already eased: `maskK(t, t0, 'wipe')`) and a draw function `fn(ctx)`:
- `k <= 0` draws nothing. `k >= 1` draws the content with NO mask, so the finished frame is pixel-identical to a plain draw (tested for every reveal).
- In between, a clip path (hard, crisp, cheap) cuts the content. `revealSoft` uses a gradient mask on a full-frame layer instead (feathered, slower).
- Wipes return the moving edge so you can draw a bright line on it with `edgeLine`.
- To make something LEAVE: `out: true` (wipe, diagonal, scan: the edge keeps going the same way) or pass `1 - k` (iris, split, ink: they close or recede).

## Recipes (`RECIPES`, seconds; frames at 30 fps)

| Reveal | Call | Ease | Seconds (frames) | Use |
|---|---|---|---|---|
| Wipe | `revealRect(ctx, k, {box, dir:'right'})` | inOutCubic | 0.6 (18) | cards, bars, images |
| Iris | `revealIris(ctx, k, {box, cx, cy})` | inOutCubic | 0.7 (21) | focus on one object, avatars |
| Split | `revealSplit(ctx, k, {box, axis:'x', mode:'center'})` | outCubic | 0.55 (17) | banners opening from the middle; mode 'edges' closes in |
| Diagonal | `revealDiagonal(ctx, k, {box, angle})` | inOutCubic | 0.65 (20) | scene changes, hero panels; angle 0.35-0.8 rad |
| Scan lines | `revealScan(ctx, k, {box, lines:14, mode:'sweep'})` | outCubic | 0.8 (24) | data panels; 'blinds' = even and odd bars from opposite sides |
| Ink | `revealInk(ctx, k, {box, seed, dir})` | inOutQuad | 0.9 (27) | organic, playful; dir right/left/up/down/center |
| Soft | `revealSoft(ctx, k, {box, feather:0.25})` | inOutCubic | 0.7 (21) | photos and gradients; fn must draw on the ctx it is given |
| Exit | any, run with `exit` | inCubic | 0.35 (10) | leaving is faster than entering |

Text (draw on the MAIN canvas, never a small layer):
- `textRise(ctx, t, {lines, x, y, px, t0})`: each line rises 0.4 em out of a mask, 0.32 s, lines 0.07 s apart. Returns the time the last line has landed. The hook style.
- `textWipe(ctx, k, {text, x, y, px})`: left to right behind a bright edge, 0.5 s, for labels and numbers.
- `textChars(ctx, t, {text, x, y, px, t0})`: letters rise 0.3 em, 0.035 s apart (a 12-letter word takes 0.7 s). Positions come from measured prefix widths. Not for sentences over 20 letters (too slow).
- `typedCount(t, t0, len, cps)`: how many characters a typewriter shows (22 per second). Draw `text.slice(0, n)` plus a blinking caret.

```js
import { maskK, revealRect, revealDiagonal, edgeLine } from './module.mjs';
const k = maskK(t, 2.0, 'wipe');                       // eased 0..1
const e = revealRect(ctx, k, { box: [108, 736, 420, 104], dir: 'right' }, c => drawCard(c));
edgeLine(ctx, e, { color: '#19e08f', width: 5 });      // bright edge, additive
// leaving, 0.35 s: revealRect(ctx, maskK(t, 4.15, 'exit'), { box, dir: 'right', out: true }, draw)
```

## Rules that make it good

1. The edge moves in the direction of the story: forward actions wipe right or down; "back" wipes left.
2. Overlap: start the next element 0.1-0.2 s after the previous one starts, not after it ends (tile stagger 0.2 s in the demo).
3. Add a bright edge on hard wipes (width 4-6 px, additive). Skip it on ink and soft.
4. Content under the mask must be alive (bars breathing, a dot running), or the reveal ends in a still picture.
5. Under 0.3 s a wipe reads as a glitch; over 1.0 s it is slow. Leaving is 0.35 s.
6. Keep the box clip-aligned to the object (same rounded corners need a clip with the radius; hard rect clips cut the corners of a rounded card for a few frames, which is fine at 0.6 s).
7. Never mask the closer or the hook with these; the engine has its own.

## Module API

`RECIPES`, `maskK`; `revealRect`, `revealIris`, `revealSplit`, `revealDiagonal`, `revealScan`, `revealInk`, `revealSoft`; `edgeLine`; `textRise`, `textWipe`, `textChars`, `typedCount`.

## Common failures

- A fade where a wipe was meant: the content must be drawn at full opacity under the mask.
- Wipe edge and content moving different ways: pick one direction per card.
- Text on a small offscreen layer: the quality checker cannot see it. These functions draw text on the ctx you give them.
- Soft wipe everywhere: each call makes a full-frame layer. Use it for one or two things.
- Ink that leaves holes: not possible here (tested to 0.99); if you build your own blobs, make the radius at least 1.25 x the cell.
- Forgetting the box: reveals clip to the box you pass; give the exact object rect.

## Quality bar (all on real pixels in `test.mjs`)

- Nothing drawn at k 0; frame pixel-identical to the plain draw at k 1 (14 reveals).
- Coverage never shrinks as k grows (21 steps) for every reveal; `out` versions never grow.
- Exact where the maths says so: wipe, split, scan-out equal k to 1.2 percent; a diagonal across a square covers 50 percent at k 0.5; ink leaves no holes at k 0.99; ink is deterministic and seed-sensitive; soft has a feathered edge.
- Recipe durations are 0.3-1.0 s; text reveals draw nothing before t0 and end equal to the plain text (kerning for per-letter within 6 percent).
- Demo: six tiles, six reveals, then six exits; QC passes with no frozen run.

## Run it

```
cd skills/t2_4_masks-reveals-wipes
node test.mjs                  # about 50 s at full size
ANNIE_PREVIEW=1 node test.mjs
```
Outputs: `out/demo.mp4`, `out/contact.png`, `out/measured.json` (coverage of each reveal at k 0.5), `out/qc.json`.

## Next skills

t2.5 shape morph and path animation (draw-on strokes pair with textWipe edges), tier 3 scene builders.
