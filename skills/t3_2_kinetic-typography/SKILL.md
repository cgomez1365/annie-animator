---
name: kinetic-typography
description: Animates text per letter, per word and per line (drop, pop, spin, slide, rise, typewriter), with marker highlight sweeps, emphasis pops, underlines, counters in fixed digit cells, a decode (scramble) effect and text riding a curve, all laid out from real font metrics so a split line looks exactly like the plain line. Use whenever a headline, hook, key phrase or number must move, land, be emphasised or count up, even if the request only says "make the words animate" or "make that word stand out".
---

# Kinetic typography (t3.2)

Prerequisites: t0.1 (easing), t0.2 (timeline, seeded rng), t0.3 (render), t0.4 (checker). Code: `module.mjs` on the engine. Demo: `demo.mjs` (8 s: per-letter, per-word with highlight, counter + decode + wave text).

## When to use

Any text that is the subject of the shot: the hook, a key phrase, a number. Plain static text is fine for captions and labels. One kinetic idea per page: a card with letters flying AND a wave AND a counter is noise.

## Rules that never bend

- Body text 42 px or more, always. Headlines 64-124 px in Space Grotesk 700 (`sg`), body in Inter (`inter`).
- No text above y 250, from y 1580 down, or at x >= 940 inside y 800-1580. A CENTRED block in that band can be 776 px wide at most (540 +- 388). `safeCheck(split)` returns the problems.
- Draw on the main canvas. Off-screen layers hide text from the checker.
- Animated text must be fully landed and still readable for at least 0.8 s before it leaves.
- `idle` waves (amp 4-6 px) keep a held line alive; the QC fails still holds.

## Technique

1. Lay out once per frame: `sp = splitText(ctx, 'Letters land', {px:124, y:930})`. It wraps with balanced lines, centres on x 540, and gives `sp.chars`, `sp.words`, `sp.lines` with x, y (baseline), w. Letters are placed by prefix width, which keeps kerning ("AVAT" stays tight).
2. Animate: `drawUnits(ctx, sp, t, {unit:'char', style:'drop', t0:0.3, gap:0.04, dur:0.55, color, out, idle, extra})`.
   - Styles: `rise` (0.55 em up, outCubic), `drop` (1.1 em fall, outBounce), `pop` (scale outBack 2.0), `spin` (roll -0.7 rad + pop), `slide`, `slideAlt` (alternating sides, 1.6 em), `fade`, `blurUp`, `cut` (typewriter). Or pass `(k, i, px) => ({dx,dy,sx,sy,rot,a})`. Every style lands exactly on the rest pose at k = 1 (tested).
   - Timing: letters gap 0.025-0.045 s, dur 0.35-0.55; words gap 0.08-0.14, dur 0.4-0.5; lines gap 0.12-0.2, dur 0.35-0.45. Keep the whole stagger under 1.2 s. `order`: forward, reverse, center (burst), random (seeded).
   - Exit: `out:{t0, gap, dur}` lifts and fades each unit (inCubic). Start it 0.3 s before the next page.
   - Mask-rise lines like hook(): `unit:'line', style:'rise', mask:true`.
3. Highlight a key word: `hl = highlightSweep(ctx, sp, t, {words:[6], t0:2.75, dur:0.45})` BEFORE drawUnits, then pass `color: hl.colorFor` (letters turn ink once the bar passes). Add `extra: emphasis(sp, {words:[6], t0:2.75, peak:1.14, color:null})` for the pop (scale about the word's centre, small roll). With a fixed colour pass `color: P.green` instead of null.
4. Underline: `underline(ctx, sp, t, {word:4, t0:2.3, wavy:true, color:P.cyan})`.
5. Counter: `s = countText(t, {to:1284, t0:3.75, dur:1.0})` (outExpo, exact landing, thousands separators); draw with `drawCounter(ctx, s, finalString, {x:540, y:1010, px:220})`: digits sit in fixed cells so nothing jitters, blank cells on the left.
6. Typing: `n = typeCount(t, {t0, cps:20})`; style `cut` with dur 0.001 and gap 1/cps; `caret(ctx, sp, n, t, {typing})`.
7. Decode: `scramble('steps counted', k, t)` resolves left to right, 14 glyph changes a second, seeded. Draw it in `mono` so width never changes.
8. Text on a path: `path = wavePath(110, 900, 1290, 26, 1.5, -t*2.2)` (or `arcPath`, or `makePath(u => [x,y])`), then `drawOnPath(ctx, text, path, t, {px:58, s0:0, t0:4.1, gap:0.03, color})`. Radius at least 6 x the font size; wave amplitude under 0.6 x font size per 400 px. `flow` px/s scrolls it like a marquee.
9. Fitting: `fitBlock(ctx, text, {maxW:760, maxLines:2, maxPx:96})` returns the biggest px that fits and `fits:false` when even 42 px cannot (then shorten the copy).

## Common failures

- Highlight starting before the words have landed (it paints a bar behind half-moved words). Start it after the last word's end.
- Emphasis colour `P.ink` with a highlight: dark text on the dark ground until the bar arrives. Use `color:null` with `hl.colorFor`.
- Centred text 860 px wide at y 900: right edge 970, inside the rail. Fit to 760.
- A counter drawn with plain fillText: the digits shift as the number changes. Use drawCounter.
- Two pages' text in the same y band at the same time: exit the first (`out`) before the next lands, or move the second.
- `Math.random` for scatter or scramble: never. `scramble` and `unitTimes(...,'random',seed)` are seeded.
- Per-letter text under 42 px "because it is decorative": the checker only exempts text marked with `decor(ctx)`; do not use it for words people must read.

## API (`module.mjs`)

Layout: `splitText`, `balancedWrap`, `fitBlock`, `safeCheck`. Animation: `STYLES`, `unitTimes`, `drawUnits`, `emphasis`, `highlightSweep`, `underline`. Numbers and typing: `countText`, `drawCounter`, `typeCount`, `caret`, `scramble`. Paths: `makePath`, `arcPath`, `wavePath`, `drawOnPath`.

## Quality bar (measurable)

- Split letters reproduce the plain line (under 3 percent of ink pixels differ); text on a straight path equals plain text (under 4 percent); kerning kept (AVAT narrower than the sum of its letters).
- Letters, words and lines reach exact positions and widths; the last letter ends where the line ends (within 1.5 px); the line is centred on x.
- Every style is invisible at k = 0 and exactly at rest at k = 1; unit orders cover every slot once; random order is seeded.
- drawUnits draws nothing before t0, everything after, nothing after `out`; idle makes a held line move.
- countText lands exactly, never goes backwards; drawCounter width is constant while counting; tabular digits start at the same x.
- scramble: final text at k = 1, same string for the same t and seed, spaces kept, left to right.
- Demo: engine QC passes on the card and the mp4 (safe zones, 42 px floor, no frozen frames, closer present).

## Run it

`node test.mjs` (add `ANNIE_PREVIEW=1` for a fast 540x960 run). Writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/qc_zones.png`. Exit 0 only if everything passes.
