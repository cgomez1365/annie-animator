---
name: series-templates
description: Turns one JSON script into a whole series of BGI cards that look identical in layout, using a template with a lesson badge (pill and progress dots), a progress bar, a hook outside the window, a window as the teaching space and the engine closer. Use whenever more than two cards share a format (a course, a weekly series, "part 3 of 12"), when someone wants to change the look of every episode at once, or when episodes are drifting apart, even if they only say "make the next one like the last one".
---

# Series templates (t6.1)

Prerequisites: t0.1 (easing), t0.2 (timeline, `pages`), t0.3 (render), t0.4 (checker). Code: `module.mjs`. Example script: `series.json`.

## When to use

A format that repeats. One-off cards are hand-built (see tt10). A series is data: you write the words, the template owns the look. Fix the template once and all episodes change.

## The script format

```json
{ "id": "studio_notes", "brand": "bgi", "unit": "PART", "total": 5,
  "episodes": [ { "n": 2, "hook": ["One script.", "Every episode."],
    "pages": [ { "type": "steps", "title": "series.json", "header": ["The template", "does the layout."],
                 "items": [ { "t": "Write the script" }, { "t": "Template draws it", "s": "optional sub line" } ] } ] } ] }
```
- `brand`: `bgi` or `aeon` (aeon adds the 18+ line and the AEON footer through the engine closer).
- `unit` + `n` + `total` make the pill: "PART 2 OF 5". `total` up to 12 draws one dot each; more than 12 draws a rail with a knob.
- `hook`: two lines, at most 880 px wide at 104 px Space Grotesk 700 (about 14 characters). Shown outside the window.
- `pages`: window pages, shown in order. `header` = two lines above the window (56 px). `title` = the window title bar.
- Optional per page: `hold` (seconds of rest after the last item lands) or `dur` (the whole page, seconds).

## Page types (`PAGE_TYPES`)

| type | content | items | default length |
|---|---|---|---|
| `steps` | numbered boxes joined by a dashed line; a marker runs down the line after the last one lands | `[{t, s?}]`, max 4 (3 or fewer get 136 px rows; a sub line `s` adds 38 px) | 0.3 + 0.55 x (n-1) + 0.4 + 1.1 s |
| `list` | icon tiles; a highlight steps down the rows | `[{icon, t}]`, `icon` = a lucide file name, max 4 | 0.15 + 0.14 x (n-1) + 0.4 + 1.7 s |
| `checklist` | boxes that tick with an outBack pop and a drawn check; a glow keeps sweeping | `[{t}]`, max 4 | 0.3 + 0.45 x (n-1) + 0.5 + 1.1 s |
| `compare` | two panels (red x / green check) and a turning cog | `left:{head, lines[]}`, `right:{...}`, max 3 lines each, each line at most 2 wrapped lines at 44 px in 330 px | 0.3 + 0.7 + 0.25 x lines + 1.2 s |

Text inside the window ends at x 930 (the action rail starts at 940). Every text shrinks to fit but never below 42 px; if it still does not fit, `validateSeries` says so: shorten the words.

## Timing (what `planEpisode` computes)

- Pill drops in 0.05-0.5 s (outBack), dots pop 0.35 s on (0.04 s apart), hook rises 0.15 s, a green scan line runs under it.
- Hook out at 1.4 s. First page starts at 1.6 s: the window rises 0.4 s (outCubic, 80 px). Header at page start + 0.05, out at page end - 0.3.
- Pages overlap 0.1 s (slide in 0.4 s outCubic, out 0.35 s inCubic, 160 px). Window title crossfades once the page before has gone.
- Closer starts 0.1 s before the last page ends (frame-rounded); the card lasts closerAt + 3.1 s. A one-page steps card with 3 items = 7.5 s (225 frames).
- Progress bar (y 1290, x 72-1008) fills linearly from 1.6 s to closerAt, a glint runs on it. Badge, bar and window leave 0.1-0.3 s around closerAt.

## API (`module.mjs`)

- `validateSeries(series)` -> `{ok, problems[]}`. Run it first. Checks brand, total, hook widths, header widths, page types, item counts, text that cannot fit at 42 px, missing icons, missing titles, banned claim words (`claimViolations`) in every string.
- `planEpisode(episode)` -> `{hookIn, hookOut, pages:[{s,e,page}], closerAt, seconds, frames}`.
- `makeCard(series, n)` -> `{META, frame, plan}`. `frame(t)` is pure.
- `emitCards(series, dir, prefix?)` -> file paths. The renderer's workers import a card by path, so each episode needs its own small file (the script is inlined in it).
- `drawBadge`, `drawProgress`, `WIN`, `PAGE_TYPES` for people extending the template.

## Recipe: render a series

1. Write `series.json`. `node -e "import('./module.mjs').then(async m=>console.log(m.validateSeries(JSON.parse(await (await import('node:fs/promises')).readFile('series.json','utf8')))))"`.
2. `emitCards(series, 'cards/')`.
3. For each file: `node ../../engine/render.mjs cards/<file>.mjs --preview --out out/prev` while iterating, full size once. For many episodes use t6.2 (batch and cache).
4. `node ../../engine/qc.mjs cards/<file>.mjs` on each. All must pass.
5. Open `out/series_sheet.png` style sheets (the test makes one) and compare episodes side by side.

## Adding a page type

Add an entry to `PAGE_TYPES` with `dur(page)`, `validate(page, out)` and `draw(ctx, t, p)`; `p` has `s`, `e` (window times) and the page's own fields. Rules: every item enters with `outCubic` 0.4 s staggered; something loops after the last item lands (marker, highlight, glow, cog); text at least 42 px and clear of x 930; draw text on the main canvas only.

## Common failures

- "too wide even at 42 px": the words are too long. Cut words; do not shrink.
- A page that feels empty: 3 items in a 504 px window leave space under them on purpose (the bar sits below). Add a 4th item or a sub line before changing the template.
- Pill text above y 250: the pill rests at y 262; it rises from below, never drops from above.
- Hook wraps wide: two short lines beat one long one (hook max 14 characters per line).
- `render.mjs` cannot render `makeCard(...)` directly: it needs a file. Use `emitCards`.
- A series longer than 12 episodes switches to the rail; check that look before shipping.

## Quality bar (measurable)

- `validateSeries` returns ok and catches: a banned word, text too wide, unknown type, 5 items, a missing icon, a missing title, a too-wide hook, a bad brand, a three-line compare line.
- All 5 episodes of the sample series pass the engine checker (no hard failures).
- Across episodes the badge pill is centred (540 +- 4 px) at the same y, the dots differ by `n`, and the window's title bar is pixel-identical at the same time.
- `frame(t)` is pure: same frame twice and out of order.
- The demo (7.5 s) shows hook outside, window slide, three steps landing, marker, bar and closer; no motion gap over 0.5 s.

## Run it

```
node test.mjs                 # 38 checks, 5 episodes through the checker, the demo at 1080x1920, out/series_sheet.png
ANNIE_PREVIEW=1 node test.mjs # same at 540x960
```
