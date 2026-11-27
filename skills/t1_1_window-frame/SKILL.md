---
name: window-frame
description: Draws the macOS-style window every tt10 card is built around - panel, 2 px border, title bar with three traffic lights, a title that crossfades when the page changes, an entrance and exit, an adjustable size, and content clipped to the inner rect. Use whenever a card needs to show a tool, a screen, a form or a report inside a "window", whenever the title bar text must change between pages, or when a window must resize or leave for the end card, even if the request only says "show the app" or "put it in a frame".
---

# Window frame (t1.1)

Prerequisites: t0.1 (easing), t0.3 (render pipeline), t0.4 (quality checker). Code: `module.mjs` on top of `engine/parts.mjs` (this module adds the crossfade, the rounded clip, the resize and the checks). Read `engine/README.md` first for the card contract.

## When to use

Every tt10-level card shows its product inside one window. The window is the stage: header text sits ABOVE it, the content sits INSIDE it, and the closer takes over from it. Use this skill for the window itself. Page content that slides in and out is t1.2. Fields, buttons, stamps are t1.5.

## The numbers (from tt10_ops_hr and hello_card)

| Part | Value |
|---|---|
| Default rect | x 72, y 560, w 936, h 640 (tt10 and hello_card use y 660, h 580: inner height 504) |
| Corner radius | 22 outside, 21 for the border path, 20 for the bar fill |
| Border | 2 px, white at 10 percent |
| Title bar | 72 px tall, fill panel2 `#11161d`, 2 px line under it at 8 percent white |
| Traffic lights | radius 9, centres at x + 40, +70, +100, y + 36, colours `#ff5f57 #febc2e #28c840` |
| Title | Inter 42 px / 600 (the readable floor), centred, baseline y + bar/2 + 15, white (muted for a "dead" file name) |
| Title crossfade | 0.3 s `outCubic`; old title fades out and lifts 6 px, new one fades in from 6 px below; alphas always sum to 1 |
| Entrance | 0.4 s `outCubic` from alpha 0, sliding up 80 px |
| Exit | alpha 1 to 0 from `closerAt - 0.1` to `closerAt + 0.3` (the closer's ground covers the rest) |
| Inner rect | `[x+2, y+bar+2, w-4, h-bar-4]`; clip top corners square, bottom corners radius 20 |

Content text must end left of x 930 when it sits below y 800 (`TEXT_MAX_X`): the action rail starts at x 940. The window itself may cover the rail; only text may not.

## API (`module.mjs`)

- `windowRect({x,y,w,h,bar,r})` -> rect with `inner [x,y,w,h]`, `cx`, `cy`. Pass partial objects anywhere a rect is wanted.
- `validateWindow(rect)` -> `[{level:'fail'|'warn', msg}]`. Fails: leaves the frame, reaches y 1580, top above y 560 (collides with the page header). Warns: bottom in the Reels band (y 1250+), inner height under 300, width under 600.
- `drawWindow(ctx, t, {rect, titles|title, enterAt, enterDur, rise, closerAt, alpha}, content)` -> the whole thing. `content(ctx, inner, rect)` draws in absolute frame coordinates, already clipped. Returns false when nothing was drawn (before the entrance).
- `drawFrame(ctx, t, {rect, titles|title, fade, pulse})` frame only. `pulse` (default on) breathes the border in green at 5 to 10 percent on a 2.4 s period, so even an empty window is never dead.
- `clipInner(ctx, rect)` clip inside your own `ctx.save()`.
- `titleState(t, [{text, at}], {fade})` -> the one or two titles to draw with alpha and dy. Use `at = the previous page's end` so the title changes only after the old page is gone (tt10 review rule).
- `enter(t, {t0, dur, rise})`, `leave(t, closerAt)`: the window's alpha and offset, for your own composition.
- `lerpRect(a, b, k)`: resize. Drive k with `E.outBack(prog(t, t0, t0+0.6), 1.5)` for a settle (8 percent overshoot), or `E.inOutCubic` for a calm resize. Move the bottom edge only; keep x, y, w when the header must not move.

```js
import { drawWindow, lerpRect, windowRect } from './module.mjs';
const rect = lerpRect(windowRect({ y: 660 }), windowRect({ y: 660, h: 520 }), E.outBack(prog(t, 3.1, 3.7), 1.5));
drawWindow(ctx, t, { rect, titles: [{ text: 'Inbox', at: -Infinity }, { text: 'Report', at: 2.9 }], enterAt: 0.2, closerAt: 4.6 },
  (c, inner, R) => { /* draw content with absolute coordinates */ });
```

## Technique

1. Headers go outside the window, baselines 446 and 514 at 56 px (see `hook` in the engine). The window top stays at y 560 or lower.
2. Draw order: background, hook and headers, window (frame then clipped content), then anything that must fly out of the window unclipped (tt10 draws its scattering spreadsheet after the clip so cells leave the frame), then the closer.
3. Content that overlaps the edge (marquees, rings, big shapes) is cut by the clip: that is the proof it is "inside the glass". Anything that should escape is drawn after `restore()`.
4. A window that resizes: animate only the height with a settle; draw content relative to `rect.inner` (not constants) or it will not follow.
5. The title changes with the page, never on its own. One crossfade per page change.
6. Window exit and header exit start together, 0.1 s before `closerAt` (use `leave`).

## Common failures

- Title wider than the bar: `drawFrame` cuts it with an ellipsis; shorten the text instead (about 22 characters fit).
- Content drawn without the clip pokes through the rounded bottom corners: use `clipInner`, not a plain rect.
- Text sliding through x 940+ below y 800 fails the rail rule for more than 0.5 s: keep text chips in the top row or left side, let only shapes cross the edge.
- Window top at y 500: header descenders touch the bar. `validateWindow` fails it.
- Hard-coding pixel positions inside a resizable window: the content does not follow.

## Quality bar

- Default window is exactly 72, 560, 936x640 radius 22; inner rect math is exact (unit tests).
- The clip is proved with real pixels: painted inside the content area, never in the bar, border, outside, or the rounded bottom corners.
- Title crossfade alphas sum to 1 for the whole 0.3 s; at the end only the new title at alpha 1.
- Entrance and exit endpoints exact (alpha 0 and 1, offset 80 and 0).
- Demo: 7.5 s, 1080x1920, engine QC passes (no frozen run over 0.5 s, nothing in the red zones, closer correct).

## Run it

```
node test.mjs                        (full size, about 45 s)
ANNIE_PREVIEW=1 node test.mjs        (540x960, about 15 s, use while iterating)
```
Outputs: `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/qc_zones.png`, `out/test_result.json`. Exit 0 only if every check passed.
