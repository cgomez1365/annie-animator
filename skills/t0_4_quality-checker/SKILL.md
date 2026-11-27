---
name: quality-checker
description: Runs the engine's quality checker on a BGI animation card and turns its verdict into plain fixes, covering frozen frames, safe zones, text size, contrast, banned claims and the required ending. Use before every render and after every change to a card, whenever someone asks whether a video is "safe to post", "good enough" or "checked", and whenever text might sit under the TikTok top bar, caption band or action rail, even if they never mention QC.
---

# Quality checker (t0.4)

Prerequisites: t0.3 (render pipeline). Code: `module.mjs` (lint, explain, checkBox, contrast) on top of `engine/qc.mjs`.

## When to use

Every card, every time: once while drawing (pre-checks) and once on the finished card and file. A card is not finished until `node engine/qc.mjs` exits 0 AND someone has looked at the contact sheet. The checker finds rule breaks; it cannot judge taste.

## Commands

```
node engine/qc.mjs card.mjs [--out dir] [--step N] [--video out/name.mp4]
```
Prints one line per issue (`FAIL` or `WARN`), a summary, writes `<out>/qc.json` and `<out>/qc_zones.png` (12 frames with the zones painted: red = no text, amber = action rail, blue = soft caption band, plus a motion-energy graph). Exit 0 only with no FAIL. `--step 2` checks every 2nd frame (about twice as fast, less exact). `--video` also checks the real MP4. About 5 s per 225 frames.

## What it checks (all numbers are in `engine/qc.mjs`)

| Rule | Limit | Level |
|---|---|---|
| Size, fps, duration | 1080x1920, 30 fps, 1-90 s (and the file, with --video; no audio) | FAIL |
| Frozen frames | motion energy < 0.004 for more than 0.5 s outside `META.holds` | FAIL |
| Top zone | text above y 250 | FAIL (if longer than 0.5 s) |
| Bottom zone | text reaching y 1580 | FAIL (0.5 s) |
| Action rail | text with right edge past x 940 between y 800 and 1580 | FAIL (0.5 s) |
| Text size | under 42 px for more than 0.5 s (texture text via `decor(ctx)` exempt) | FAIL |
| Contrast | under 3:1 for more than 0.5 s; under 4.5:1 warns | FAIL / WARN |
| Banned claims | private, privacy, offline, secure, price patterns, forever, unlimited, no data..., Viz, Talent, competitor names, B Corp, Gumroad | FAIL at any moment |
| Closer | in the 2nd half: slogan line 1 and 2 together with line 2 in #19e08f, Follow, brokengearindustries.com | FAIL (switch off with `META.qc = {closer:false}`) |
| Reels caption band | text in y 1250-1580 | WARN |

A zone or size break that lasts 0.5 s or less (text sliding in or out) is only a warning. A banned word is never excused.

Motion energy = sum of luma changes of at least 6 levels, per pixel, on a quarter-size frame. A 14 px dot moving 10 px per frame measures 0.018. The drifting grid alone measures 0.000, so background drift cannot hide a frozen subject. Add a mover (marker loop, highlight sweep, pulse, dust) to every hold, or declare a deliberate pause: `META.holds = [[t0, t1]]`.

Contrast: the text colour against the median luminance of a ring around the text box, every 3rd frame, only while the text is at least 90 percent opaque. Text on a busy picture can read wrong: put a panel behind it.

## While drawing (pre-checks, `module.mjs`)

- `checkBox({x0,y0,x1,y1})` -> `{ok, problems, nudge:{dx,dy}}`: the smallest move into the safe area.
- `floorPx(px)` (never under 42), `contrastRatio('#f8fafc', '#0a0c10')` (above 15), `claims(str)` (banned-claim labels for a line of copy).
- `fitText(ctx, text, {maxW, minPx: 42})` from the engine shrinks to fit without going under 42.

## After running (`lint`)

`lint(cardPath, {out})` runs the checker and returns plain lines: `FIX: <what is wrong> (<where>) -> <how to fix it>`. `explain(issue)` maps one issue to `{what, fix}` (table `FIXES`). Give those lines to the person; do not paste raw qc.json.

## Reading qc_zones.png

Look at the zones sheet for: text touching a red band; text hugging the amber rail; a lopsided layout; elements that vanish between two frames; the closer fully formed by the last 3 frames. Then the motion graph under it: green bars = moving, red bars = under the threshold (a red run longer than 15 frames is the frozen failure), blue band = declared hold.

## Common failures

- Frozen hold: the most common. A blinking cursor alone does not save a hold: it changes twice a second, so the gaps between blinks are still. Use a continuous mover.
- Kicker or closer text in the wrong zone: use `begin`/`end` from the engine; they are placed correctly.
- Text under 42 px in a mockup: labels in a UI illustration must still be 42 px or `decor`. Prefer fewer, bigger words.
- Rail: a right-aligned line that ends at x 960 in the lower half. Keep right edges at 930 or less below y 800.
- Banned word in a variable name is fine; in a drawn string it fails. "private" never appears at all.
- Text drawn on small offscreen layers is invisible to the checker. Draw text on the main canvas or a full-frame layer.
- A card made with `createCanvas` from `@napi-rs/canvas` directly logs no text: the checker says "closer: slogan" missing. Import from the engine.

## Quality bar (measurable)

- The checker flags a card with a deliberate 1.5 s freeze, text at y 150, text in the rail, 30 px text held for the whole card, a banned word, and unreadable contrast, each by its own rule (engine self-test).
- It does not flag a clean card, nor a freeze declared in `META.holds` (engine self-test).
- `lint` gives a fix for every issue it finds (test: all lines contain `->`).
- A card passes only if it also has the closer; demos of this skill pass with 1 warning (the Follow button's pop-in scale, 0.1 s).

## Run it

```
cd skills/t0_4_quality-checker
node test.mjs                 # unit checks, lint on fixtures, demo render, QC; exit 0 only if all pass
ANNIE_PREVIEW=1 node test.mjs
```
Outputs: `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/qc_zones.png`.

## Next skills

All of tiers 1-4 finish with `node test.mjs`, which calls this checker through `engine/testkit.mjs`.
