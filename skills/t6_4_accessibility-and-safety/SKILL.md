---
name: accessibility-and-safety
description: Scores a BGI card for viewers who are sensitive to flashing light, motion or low contrast, and checks caption files for readability. It measures flashes per second (general and saturated red), text contrast for normal and colour-blind vision, reading time, large-area motion and whole-picture shake, and gives a 0-100 score with plain-language fixes. Use before any card is posted, whenever a card has full-screen colour changes, pulses, shakes, scattering or fast text, when text colours are chosen, or when someone asks for a calmer or reduced-motion version, even if they only say "is this safe to post".
---

# Accessibility and safety (t6.4)

Prerequisites: t0.1 (curves), t0.2 (seeded rng), t0.4 (the engine checker runs separately and covers zones, 42 px text, frozen frames). Code: `module.mjs`. Real card used: the ported tt10 and its real caption file.

This is a tripwire built on WCAG 2.x ideas (general flash, red flash, contrast 4.5:1 and 3:1, reading time). It is not a medical or legal clearance and it is not a replacement for the Harding test. Say so when you report a score.

## When to use

Last step before packaging (t6.3). Run it on every card; run it again after any change to colours, backgrounds, pulses or the closer.

## What it measures (`scoreCard(card, {srt?, cues?, step?})`)

| Section | How | Fails (hard) | Warns |
|---|---|---|---|
| Photosensitivity | Mean relative luminance of 25 blocks of a ninth of the frame (360x640) plus the whole frame, every frame. A change = a rise or fall of 0.1 from the last turning point, skipped when both values are 0.8 or higher. A flash = a pair of changes. | more than 3 flashes in any 1 s; more than 3 saturated-red flashes in 1 s (a block gains or loses 25 percent area of pixels with r/(r+g+b) at 0.8 or higher) | whole frame changes brightness by 0.2 or more in one frame (one white cut is allowed, it is just harsh) |
| Contrast | Text colour against the median colour of a ring around its box, every 3rd frame, text at 90 percent opacity or more. Body text wants 4.5:1, text of 56 px or more wants 3:1. Also run through protan, deutan and tritan simulation. | under 3:1 for more than 0.5 s | under target for more than 0.5 s; under 3:1 for colour-blind viewers (do not rely on hue) |
| Reading time | Longest run a text is fully visible; need = max(1.0 s, 0.4 s + words / 3). Skips tokens under 5 characters and decor text. | none | text visible less than it needs |
| Motion | Share of pixels that change by 6 levels or more per frame; the picture's global shift tracked on a gradient image (texture in a quarter of the frame needed) and counted as swings of 8 px or more. | none | 35 percent of the frame changing for 0.6 s or more (moderate); 60 percent for 0.6 s (strong); 4 swings of 8 px in a second (strong, shake) |
| Captions | `parseSrt` + `checkCaptions`: reading speed 17 characters a second target and 20 limit, cue 0.8-7 s, 42 characters a line, 2 lines, no overlap, 0.05 s gap | over 20 cps, under 0.8 s, 3 lines, overlap | over 17 cps, over 7 s, long lines, no gap |

Score = 100 minus: 60 for a flash failure; up to 25 for the share of text-time under target; 15 per hard contrast failure; 4 per rushed text (max 16); 25 strong motion or 8 moderate; 5 colour-blind contrast; up to 20 for caption issues. `pass` = no hard failure and score 80 or more. Not measured: zoom, spin and parallax of single layers, spatial patterns (stripes) other than moving, anything audio. Look at the card.

## Palette rules (`paletteContrast()`)

On the BGI grounds: `white`, `text`, `muted`, `faint`, `green`, `accent`, `cyan`, `orange`, `red` reach body contrast; `dim` (#475569) never carries words (2.6:1). Do not tell red from green by hue alone: use an icon or a word as well (the x and check icons, "stale" and "reused").

## Motion kit: build the calm version into the card

`motionKit(mode)` with mode `full`, `reduced`, `none` (default from `ANNIE_MOTION`):
- `amp(x)`: scale every distance, size change and angle (1 / 0.4 / 0). `overshoot(s)`: outBack strength (s / at most 1.2 / 0, then use outCubic). `shake(t, amp)`: jitter, full mode only. `spin`, `travel`: booleans. `dur(d)`: 1.25 times longer in the calm modes. `flash(a)`: caps full-frame light at 0.35, none in 'none'.
- Rule: nothing that is not a fade or a colour change may exceed 160 px of travel, and no spin, in `reduced`. In `none` the picture must still move a little (a pulse, a loop) or the engine checker fails it as frozen.
- The demo is built this way: `makeCard('full' | 'reduced' | 'none')`; all three pass the scorer.

## Recipe

1. `const r = await scoreCard('card.mjs', { srt: 'card.srt' }); console.log(lines(r).join('\n'))`.
2. FIX lines first (they fail the card), then notes. Typical fixes: slow a pulse below 3 a second or lower its size; replace `dim` text with `muted` or `text`; keep a text up for 0.4 s + words / 3 s; cut caption lines at 42 characters (break at the end of a clause).
3. Rerun until `pass`. Quote the score, the three headline numbers (flashes per second, lowest contrast, motion level) and what was not measured.
4. Tell the reviewer in one line, plain words: "Safe: no flashing, readable text, calm motion" or what has to change.

## Common failures

- A closer or cut that flashes white: a one-frame jump from dark to bright is a warning; two within a second is a failure.
- Bright full-frame glows pulsing at the beat: cap with `kit.flash()` and keep pulses at or under 1.5 Hz.
- Muted text on a lighter panel: check with `contrastAll(fg, bg)`.
- A caption with two 52-character lines: break it into two cues.
- Scoring a card you edited in the same process: Node caches modules; score from a fresh process.

## Quality bar (measurable, all in the test)

- Colour maths matches references (white on black 21:1, #777 on white 4.48:1).
- Planted faults are caught: white/black strobe at 7.5 and at 4 flashes a second, a red/green strobe of equal brightness (red flash only), #475569 text, a whole-picture shake, a full-screen moving pattern, a six-word line shown 0.5 s, bad captions (30 cps, overlap, 3 lines).
- Safe neighbours pass: exactly 3 flashes a second, a 1 Hz pulse (with a note), a calm readable card scores 95 or more with no issues.
- The demo passes in all three motion modes and its real score is at least the 96 its dial shows. The engine's hello_card scores 95 or more; the ported tt10 passes with score 85 and real notes (3 caption lines over 42 characters, two quick button labels).

## Run it

```
node test.mjs                  # 41 checks (about 1.5 min), demo at 1080x1920, checker
ANNIE_PREVIEW=1 node test.mjs
```
