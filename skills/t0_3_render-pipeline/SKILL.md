---
name: render-pipeline
description: Renders a BGI animation card to a silent 1080x1920 30 fps H.264 MP4 plus a contact sheet using the engine's parallel renderer, and proves the output is deterministic. Use whenever a card file (META plus frame(t, i)) needs to become a video, a preview, a still, or a time range; when a render is slow, missing frames, or differs between runs; or when someone asks how long a render will take, even if they only say "make the video".
---

# Render pipeline (t0.3)

Prerequisites: t0.1, t0.2 (you need a card to render). Code: `module.mjs` (plan, preflight, hash, probe) on top of `engine/render.mjs`.

## When to use

After you have a card file. Always render a 540x960 preview first while iterating, and the full 1080x1920 once per finished card.

## The card contract (short; `engine/README.md` has the full text)

```js
export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.6 };
export function frame(t, i) { /* return a 1080x1920 canvas; t = i / 30 */ }
```
- Frames = seconds x 30. Demos are 5-8 s = 150-240 frames.
- `frame` is a pure function of `(t, i)`: same input, same pixels. No `Math.random`, no `Date`, no growing state.
- Create canvases with `createCanvas` from the engine, not from `@napi-rs/canvas`.
- Optional `init()` (async) for loading images; it runs once in every worker.
- Optional META: `holds`, `brand: 'aeon'`, `dither: false`, `qc: {...}`.

## Commands

```
node engine/render.mjs card.mjs --preview --out /tmp/x     # 540x960, fast encode, about 9 s for 225 frames
node engine/render.mjs card.mjs --out out                  # 1080x1920, about 17 s for 225 frames (measured on the shared iMac)
node engine/render.mjs card.mjs --still 3.6 --out /tmp/x   # one PNG at t = 3.6 s, no encode
node engine/render.mjs card.mjs --range 1-2.5 --out /tmp/x # only those seconds, file name_range.mp4
node engine/render.mjs card.mjs --workers 1 ...            # fewer workers (default 2; never more than 2 on the shared iMac)
```
Environment: `ANNIE_PREVIEW=1`, `ANNIE_WORKERS`, `ANNIE_CANVAS`, `ANNIE_FFMPEG`, `ANNIE_FONTS`, `ANNIE_LUCIDE`.
Writes `out/<name>.mp4`, `out/<name>_contact.png` (12 frames), `out/<name>_report.json`; prints the report. Exit 0 if a silent MP4 of the right size came out.

## What the renderer does (and why)

1. Loads the card, checks META. 2. Splits frames round-robin over the workers: worker w draws w, w+W, w+2W... (`workerOf(i, workers)`). 3. Each worker calls `frame`, applies `ditherDark` (a static +-1 level pattern on near-black pixels so x264 does not show contour bands in the dark vignette), scales to 540x960 for preview, writes `0000.png`... into a scratch folder under `$TMPDIR`. 4. ffmpeg encodes: filter `scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+bitexact,format=yuv420p`; libx264 preset slow, crf 16, profile high level 4.1, `ref=4:bframes=3:aq-mode=3:deblock=-1,-1:deadzone-inter=6:deadzone-intra=6:psy-rd=0.6,0`; tags bt709 + iec61966-2-1 transfer; `+faststart`, `-an` (no audio). Preview: crf 20, preset veryfast. 5. Builds a 12-frame contact sheet, probes the file, writes the report with `framesHash` (sha1 of all frame PNGs). 6. Deletes the scratch frames (`--keep` leaves them).
Same pipeline as the TikTok cards' `render-card.mjs`; only the hard-coded AEON paths are gone.

## Planning and checking (`module.mjs`)

- `framesFor(seconds)`, `secondsFor(frames)`, `workerOf(i, workers)`.
- `estimateSeconds(frames, {preview, workers})`: 0.077 s/frame full, 0.040 s/frame preview, with 2 workers, measured on hello_card (17.4 s and 8.9 s for 225 frames). Heavy cards (blur, big layers) cost more. Keep each command under about 3 minutes: split long cards with `--range`.
- `preflight(cardPath)`: plain-language problems (fps, duration outside 5-8 s, coverT, `frame(0)` not deterministic).
- `frameHash(cardPath, i, {preview})`: hash of the exact final frame. Call twice; they must match. Hash two renders' `framesHash` fields to compare whole videos.
- `renderTo(card, out, opts)` (wraps the engine), `probe(mp4)` -> `{width,height,fps,seconds,audio,codec}`.

## Recipe: render a new card

1. `node engine/qc.mjs card.mjs --out /tmp/q` (t0.4). Fix hard failures first; rendering a card that will not pass wastes time.
2. Preview render, open `_contact.png`, judge it (see failures below).
3. Full render once. Then `node engine/qc.mjs card.mjs --video out/name.mp4` to check the file itself.
4. Silent MP4 only. Voice and music are separate layers added later.

## Common failures

- "frames missing" or a worker crash: an exception inside `frame` for some t. Run `--still t` at the failing time to see the stack.
- Different output between runs: something non-deterministic (Math.random, Date, a variable that persists). `preflight` finds some; `frameHash` of the same frame twice finds the rest. Workers also render in different orders than your own loop, so order-dependent state breaks only in renders.
- A card that imports `render.mjs` (directly or through a helper) used to deadlock workers; the engine's main block is not awaited at top level now. Keep it that way if you edit render.mjs.
- Blurry text at preview size is normal; judge layout at preview and detail at full size.
- Banding in dark gradients: leave dithering on (default). Setting `META.dither = false` brings contouring back.
- Disk: the PNG frames sit in `$TMPDIR` during a render and are removed after; very long cards need free space for them.
- Colour looks different in a player: the file is BT.709 limited range with an sRGB transfer tag, the same as every approved card; do not re-encode it.

## Quality bar (measurable)

- Output is 1080x1920 (540x960 preview), 30 fps, H.264, no audio stream, duration = frames/30 within 0.05 s (test probes the file).
- Same card, same frames: `frameHash` equal twice; `framesHash` equal with 1 worker and with 2 workers (test).
- `--range` renders exactly the requested frames (test: 1-2 s = 31 frames).
- A 7.5 s card renders in under 40 s at full size on the shared iMac with 2 workers (measured 17 s).

## Run it

```
cd skills/t0_3_render-pipeline
node test.mjs                 # unit checks, real renders, demo render, QC; exit 0 only if all pass
ANNIE_PREVIEW=1 node test.mjs
```
Outputs: `out/demo.mp4`, `out/contact.png`, `out/qc.json`.

## Next skills

t0.4 checks the card before and after rendering. Every tier 1-4 skill ends its test with this pipeline.
