---
name: physical-object-motion
description: Gives animated objects weight - nervous sine jitter, seeded scatter with per-piece velocity and spin, landing with an outBack pop and a bob, real closed-form bounces with squash, and exits that fling, fall and turn instead of fading. Use whenever a card has a pile of notifications, a spreadsheet or document that must "fall apart", chips or icons that arrive or leave, a mess that is about to be replaced by a clean tool, or any object that looks like a sticker sliding on a screen, even if the request only says "make it feel real".
---

# Physical object motion (t1.3)

Prerequisites: t0.1 (easing and springs), t0.2 (seeded rng). Code: `module.mjs`. Read `engine/README.md` first for the card contract.

## When to use

The first beat of a tt10 card is a MESS (a restless spreadsheet buried in mail) that the studio's tool replaces. The mess must feel like real stuff: it shakes, it piles up, and when it goes it is kicked away. The tt10 quality level comes from this. Use the skill for any object that arrives, rests or leaves. Moving UI parts (fields, buttons) is t1.5; things that loop forever is t1.4.

## The rules (tt10_ops_hr numbers)

| Moment | Technique | Numbers |
|---|---|---|
| Resting, nervous | `jitter(t, offset)` = amp * sin(t * freq + offset) | amp 4 px, 13 rad/s, offset = row index, only every 3rd row |
| Resting, calm | `bob(t, ph)` | amp 6 px, 4 rad/s, ph per object (0, 1.3, 2.1...) |
| Arriving | `land(t, {t0})`: outBack scale 0 to 1 with overshoot, drops 60 px | 0.35 s, s 1.6, items 0.15 s apart |
| Big drop | `drop(t, {t0, from, to})` outBack along y; overshoot past the floor is the bounce | hello_card: 0.8 s, s 1.5, from -120 to 880; first touch at 0.32 s |
| Impact | `squash(t, impact)` = spring 0.2 to 0 (k 420, c 13); draw `translate(0, halfH*sq); scale(1+0.9*sq, 1-sq)` | settles in about 0.4 s |
| Real bounce | `bounce(t, {t0, y0, floor, g, e})` closed form | g 3000-3200 px/s^2; e 0.5 chip, 0.65 ball; 3 to 5 hops |
| Scatter | `scatterBodies(seed, n)` once; `scatterK(t, s, e)`; `scatterPose(body, home, k)` | 0.4 s inCubic; vx +-450, vy -420..+280 (biased up), spin +-0.6 rad |
| Fling out | `flingOut(x, k)`: away from centre x 540, +400 px fall, 1.2 rad turn | same 0.4 s window as the scatter |

Nothing leaves by fading alone. Alpha goes 1 to 0 WITH the motion, never instead of it. A test checks that an exiting piece travels more than 150 px and that inCubic keeps it under 20 percent of the way at half time (it is kicked, it accelerates).

## API (`module.mjs`)

- `jitter(t, offset, {amp, freq})`, `shake(t, offset)` -> `{dx, dy, rot}` for a loose object, `bob(t, ph, amp, freq)`.
- `scatterBodies(seed, n, {vx, vy, vyBias, spin})` -> bodies `{vx, vy, spin}` (TOTAL displacement at k = 1, in px and rad). Build at module level: draw order is vx, vy, spin from `rng(seed)`.
- `makeCells({seed, x0, y0, cols, rows, rowH, headH})` and `drawCell(ctx, cell, t, k, {hot})`: the tt10 spreadsheet. `hot: P.red` makes a cell blink on a sin(t*9 + col) square.
- `land`, `drop`, `squash`, `bounce` as above. `bounce` returns `{y, vy, impacts, settled, sq}`.
- `pilePose(t, obj, {landT, exit:[s,e]})` -> `{x,y,rot,scale,alpha,phase}` or null; `drawChip(ctx, pose, {ic, color, badge})`. obj = `{x, y, r, ph}`.

```js
const BODIES = scatterBodies(20261027, 60);                       // module level, once
const sc = scatterK(t, 1.9, 2.3);                                  // 0.4 s kick
CELLS.forEach(cell => drawCell(ctx, cell, t, sc, { hot: HOT[cell.row + ':' + cell.c] }));
PILE.forEach((o, i) => { const p = pilePose(t, o, { landT: 0.2 + 0.15 * i, exit: [1.95, 2.35] }); if (p) drawChip(ctx, p, { ic: o.ic }); });
const d = drop(t, { t0: 2.4, from: -120, to: 880 }), sq = squash(t, d.impact);   // see demo.mjs for the full tile
```

## Technique

1. Place objects in layers: sheet cells and chips are drawn UNCLIPPED after the window (so they fly past its edges), page content is drawn inside the window clip.
2. Stagger landings 0.15 s apart, start them at or before frame 0 for a card that opens already busy.
3. After the landing add the bob at once; add a fading-in bob (`prog(t, impact+0.4, impact+0.7)`) for big objects so the squash is not fought by the sin.
4. Scatter and fling start together; delay the fling by 0.05 s so the sheet leads the chips.
5. The tool that replaces the mess starts landing 0.1 s after the scatter ends (demo: scatter ends 2.3, cog drops 2.4). The window must never be empty for more than 0.5 s of nothing moving.
6. Give each object its own phase (`ph`). Equal phases look like a marching band.
7. Shadows: an ellipse under a falling object, alpha and width scaled by height above the floor, sells weight cheaply.

## Common failures

- Fade-only exit (slideshow). Use `scatterPose`/`flingOut`.
- `Math.random` or `Date`: a re-render looks different. Seed everything.
- Jitter on every row: the sheet blurs into a vibration. Every third row only.
- Chips falling through a landed object (the 3.63 s frame of an early demo): choose x positions that miss it.
- Bounce chips bouncing forever: `minV` 120 px/s stops after 3 to 5 hops; raise it for fewer.
- Text on the objects under 42 px for more than 0.5 s fails QC: icons and fake text bars are fine, real labels must be 42 px or more.

## Quality bar

- Seeded output identical for the same seed, different for another; velocities in range; bias upwards.
- Landing overshoots 5 to 15 percent and ends exactly at scale 1; drop ends exactly on the floor and overshoots after first touch.
- Bounce: starts at y0, first touch at sqrt(2h/g), first hop height = (e v)^2 / 2g (checked to 0.5 px), never below the floor, continuous, rests with vy 0.
- Exit: travels over 150 px, accelerates, spins away from the centre, resting items keep bobbing.
- Demo 8 s, 1080x1920, silent; QC passes; nothing frozen over 0.5 s.

## Run it

```
node test.mjs                      (full size, about 50 s)
ANNIE_PREVIEW=1 node test.mjs      (540x960, about 15 s)
```
Writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/test_result.json`. Exit 0 only if everything passed.
