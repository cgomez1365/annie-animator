---
name: squash-and-stretch
description: Deforms shapes and text with volume kept constant (width times height stays 1) so landings, taps, pops and bounces feel like they have mass, with hard limits per object type so nothing turns to rubber. Use whenever something hits a surface, gets pressed, pops into view, or flies fast, whenever a bounce or a button tap looks stiff, or when someone asks for "squishy", "bouncy", "cartoon" or "jelly" feel, even if they never say "squash".
---

# Squash and stretch (t2.2)

Prerequisites: t0.1 (easing and springs), t2.1 (anticipation and follow-through; the rebound here is the same spring idea). Code: `module.mjs`. Contract: `engine/README.md`.

## When to use

A ball or icon landing, a button or chip tapped, a badge or number popping in, an object flying fast. Squash = flat and wide (pressed). Stretch = tall and thin (fast). Use it on vector shapes, icons, chips and short text. Do NOT use it on photos, long text, windows or the closer.

## The rules

1. Volume stays: `sx * sy = 1`. If it gets 25 percent wider it gets 20 percent shorter (`deform(0.2)` = width 1.25, height 0.8). Never scale one axis alone.
2. Squash at the moment of contact (2-3 frames, 0.07 s), stretch while moving fast, normal at rest and at the top of a bounce.
3. Anchor at the contact point. A landing object squashes ON the floor: translate to the bottom, then scale. If you scale about the middle it sinks into the floor.
4. Limits (`LIMITS`, tested over a sweep of amounts including absurd ones):

| Object | Max squash (height lost) | Max stretch (height gained) | Notes |
|---|---|---|---|
| `text` | 10 % | 12 % | stays readable, short words only |
| `card` | 12 % | 10 % | rigid, only a hint |
| `button` | 10 % | 8 % | taps and presses |
| `badge` | 25 % | 25 % | icons, stamps, chips |
| `ball` | 30 % | 30 % | full cartoon range |

Hard ceiling for any shape: height never under 0.70 or over 1.40. Beyond it the shape reads as rubber.

## The technique

- `deform(amount, 'ball')` -> `{sx, sy}`. amount > 0 squash, < 0 stretch, clamped by the limit.
- `bounce(t, {t0, y0, floor, g, e, dwell})` is an exact bouncing body (no integration, safe in any frame order). y is the BOTTOM of the object. At every impact it rests on the floor for `dwell` 0.07 s (2 frames): that is the frame the viewer sees the squash. Good values: g 2800-3400 px/s2 for a 200 px drop in 0.35 s, e 0.55-0.65.
- `bounceLook(t, o, 'ball')` -> `{sx, sy, y, vy, amount}`: the finished look. On contact the squash is `impactSpeed/1400 * limit` (capped). When it leaves the floor the squash turns into a stretch along the flight (`flightStretch`: 0.16 per 1000 px/s, cap 0.3). The last landing rings out with `impactSquash` (a spring, k 700 c 24: over-recovers into a small stretch, still within 6 frames).
- `impactTimes(o, n)` gives the touch times: use them for dust (t2.3), sound cues and screen shake.
- `tap(t, {t0, amount, downSec})`: press in 2 frames, springy release (k 520, c 20, back in 8 frames). Feed it to `deform(tap(...), 'button')`.
- `pop(t, {t0})` -> `{sx, sy}` scale: spring from 0 to 1 that peaks about 14 percent over, with the height leading (taller than wide for the first frames). For chips, badges, numbers.
- `drawDeformed(ctx, {x, y, sx, sy, rot}, fn)`: translate, rotate, scale, then `fn` draws the object with its BOTTOM (or centre) at 0,0.

```js
import { bounceLook, drawDeformed, tap, deform } from './module.mjs';
const DROP = { t0: 2.0, y0: 800, floor: 1010, g: 3200, e: 0.6 };      // module level
const L = bounceLook(t, DROP, 'ball');
drawDeformed(ctx, { x: 774, y: L.y, sx: L.sx, sy: L.sy }, () => { /* circle centred at (0, -R) */ });
const b = deform(tap(t, { t0: 3.55, amount: 0.10 }), 'button');        // press a button
```

## Recipes

- Ball drop: contact squash 20-30 percent, stretch 15-25 percent in flight, 3 bounces with e 0.6 (apexes 36, 13, 5 percent of the first drop). Shadow shrinks and fades with height.
- Button tap: 10 percent squash, 2 frames down, 8 frames back; label does not scale separately.
- Chip or badge pop-in: `pop`, 0.5 s. Add a ring or dust (t2.3) on the first frame.
- Card landing: 6-12 percent only, with t2.1 overshoot.
- A word: 8 percent at most, and only while it is not being read.

## Common failures

- Squash in mid-air: the object has already left the floor. Use `dwell` so contact lasts 2 frames on the floor.
- Scaling about the centre: it sinks. Anchor on the contact point.
- sx and sy not reciprocal: the object swells. Always go through `deform`.
- More than 30 percent: rubber. More than 12 percent on text: unreadable.
- Squash for a whole second: contact is 2-3 frames; the rest is rebound.
- No idle after the last bounce: add the ringing `impactSquash` and a glow pulse so it does not freeze.

## Module API

`LIMITS`, `HARD`; `deform`; `impactSquash`; `flightStretch`; `bounce`; `impactTimes`; `bounceLook`; `tap`; `pop`; `drawDeformed`; `area`.

## Quality bar

- Area (sx * sy) is 1 on every frame; limits hold for every object type over a sweep of -1..1 (test).
- Ball squash peaks 15-30 percent and stretch 10-30 percent; contact lasts 0.5-4 frames; recovery within 14 frames (test, numbers in `out/measured.json`).
- Bounce physics are exact: first rebound reaches e squared of the drop (36 percent for e 0.6), never below the floor, comes to rest (test).
- Pop starts at 0, ends at exactly 1, peaks 2-30 percent over, height leads (test). Tap squashes by exactly its amount and is back in 14 frames (test).
- Demo: rigid ball vs squash-stretch ball, same drop and same taps; QC passes.

## Run it

```
cd skills/t2_2_squash-and-stretch
node test.mjs                  # about 45 s at full size
ANNIE_PREVIEW=1 node test.mjs  # while iterating
```

## Next skills

t2.3 particles (dust puff on every impact), t2.1 (add anticipation before the drop).
