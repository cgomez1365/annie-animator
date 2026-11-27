---
name: timeline-and-seeded-rng
description: Schedules many animated things on one clock (named beats, overlaps, staggers, page slides, loops) and adds organic randomness that is identical on every render (seeded generators, smooth noise jitter, seeded scatter fields). Use whenever a card has more than one thing animating, a list that should appear one by one, a pile of objects that jitter or fly apart, pages that slide in and out, or any request for "random" movement, even though the render must come out frame-for-frame the same every time.
---

# Timeline and seeded rng (t0.2)

Prerequisite: t0.1 (easing and springs). Code: `module.mjs` on top of `engine/timeline.mjs` and `engine/rng.mjs`.

## When to use

A card is a score: hook at 0.15 s, window at 1.9 s, list rows 0.14 s apart, closer at 4.4 s. Put the numbers in one place and derive everything from them. Randomness (jitter, scatter) must come from a seed so a re-render, a preview and a worker all draw the same frame. `Math.random()` and `Date` are forbidden in frame code.

## Timing technique

1. Write the beats once, near the top of the card:
```js
const { beats, end } = sequence([['hook', 1.8], ['panel', 3.0, 0.1], ['closer', 3.0, 0.2]], { t0: 0.15 });
// overlap 0.1 = panel starts 0.1 s BEFORE the hook ends; a negative overlap leaves a gap
```
2. Read progress with `k(t, beats.panel, 'outCubic')` or `timeline().k('panel', t)`.
3. Lists: `stagger(n, t0, gap, dur)`. Gap 0.14-0.15 s for rows (tt10), 0.06-0.10 for chips, 0.03-0.05 for grids. `staggerOrder(n, t0, gap, dur, 'forward'|'reverse'|'center'|'random', seed)` changes which item goes first; center-first feels like a burst, reverse like a build-down.
4. Pages: `pages([3.1, 4.75, 3.7], {t0: 1.9})` makes windows that overlap 0.1 s (tt10's exact pages: 1.9-5.0, 4.9-9.65, 9.55-13.25). `page(t, p)` -> `{a, dx}`: in 0.4 s outCubic, out 0.35 s inCubic, 160 px travel. The header of a page leaves 0.3 s before the page does and comes in 0.05 s after it starts.
5. Loops: `loop(t, period)` 0..1 saw; `pulse(t, hz)` 0..1 sine; `blink(t, 1.06, 0.55)` cursor. Loop periods that are multiples of each other (1.6, 3.2) keep everything in step.
6. Tracks for one value over time: `track([[0, 0], [0.6, 1, 'outBack'], [2, 1], [2.4, 0, 'inCubic']])` (ease belongs to the segment arriving at that key).
7. Frames: t = frame / 30. 0.1 s = 3 frames; 0.35 s is about 10; 0.4 s = 12.
8. Never leave a gap longer than 0.5 s where nothing moves (QC fails it). Fill holds with loops: marker runs, highlight sweeps (`sin` over `p^4`), pulses.

## Seeded randomness technique

- `rng(seed)` returns r(); `r.range(a,b)`, `r.int(a,b)`, `r.sign()`, `r.fork(n)`. LCG `s = (s*1103515245 + 12345) & 0x7fffffff`, value `s / 2^31`. Same seed gives the same list forever. Seeds: use the card date (20261119) or a name (`rng('tt10')`).
- Draw random values in a FIXED ORDER when you build things, at module level (once), not inside `frame`. A field built in `frame` that consumes `r()` in a different order for different t is a bug.
- Smooth jitter: `noise1(t * freq + phase, seed)` in [-1,1]. Frequency 2-4 gives a hand-held shake, 8-13 a nervous buzz (tt10 uses `sin(t*13 + row)` on every third row). `jitter(t, phase, amp=4, freq=3)` returns `[dx, dy]`. Give every object its own `phase` or they move in lockstep.
- Scatter fields: `scatterField(seed, n, {box, speed:[300,900], size})` makes homes, velocities and spins once. `scatterPose(piece, k, t)` gives position and rotation for scatter progress k (0 home, 1 gone; k = `E.inCubic(prog(...))`), with gravity `400 k^2` for an arc and shake that dies as k grows. `scatterLoop(t, t0)` is a ready loop: shake 1.0 s, fly 0.7 s, hold 0.7 s, return 0.8 s, period 3.2 s.
- tt10 numbers: cells fly with `vx` +-450 px, `vy` -420..+280, spin +-0.6 rad over 0.4 s (`inCubic`); mail icons land with `outBack(1.6)` 0.15 s apart and bob with `6 sin(4t + phase)`.
- Shuffles and picks: `shuffle(r, arr)` returns a copy; `pick(r, arr)`.
- Verify determinism: `fingerprint(field)` is equal for equal seeds; render the same frame twice and compare hashes (t0.3).

## Module API (`module.mjs`)

`scatterField`, `scatterPose`, `scatterLoop`, `jitter`, `staggerOrder`, `beatChart(items, {x0,width})` (bars in pixels for a timeline picture), `fingerprint`. Engine: `sequence, stagger, timeline, track, page, pages, loop, pulse, blink, rng, noise1, noise2, fbm, shuffle, pick, hash`.

## Common failures

- `Math.random()` or `Date.now()` in a card: the QC cannot catch it, only a determinism check can. Search the file for them.
- State kept between frames (a variable that grows each call): workers render frames in any order, so frame 90 will differ.
- One shared `phase` for all jittering objects: they look like a rigid block.
- Overlap sign mistakes: positive overlap means EARLIER start. Check `beats.x.s` by printing.
- Stagger too wide: 12 rows at 0.15 s is 1.8 s before the last one even starts. Cap the whole stagger under 1.2 s.
- Random velocity that is too small: scattered pieces must leave the window; speed 300+ px/s over 0.4 s.

## Quality bar (measurable)

- Same seed gives byte-identical fields; different seed differs (test).
- `scatterLoop` returns exactly 0 at the loop start and repeats every period (test).
- Two panels fed the same seed move identically (the demo: "run 1" and "run 2").
- Rendering a demo frame twice gives equal hashes (engine tests and t0.3).
- No `Math.random`/`Date` in frame code (grep).

## Run it

```
cd skills/t0_2_timeline-and-seeded-rng
node test.mjs                 # exit 0 only if unit checks, render and QC pass
ANNIE_PREVIEW=1 node test.mjs # 540x960 preview
```
Outputs in `out/`: `demo.mp4`, `contact.png`, `qc.json`.

## Next skills

Everything in tiers 1-4: physical objects (scatter), UI mockups (stagger, pages), transitions (page).
