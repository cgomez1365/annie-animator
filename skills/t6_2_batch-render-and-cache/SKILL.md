---
name: batch-render-and-cache
description: Renders many animation cards in one run with parallel engine workers, a content-hashed frame cache, incremental re-render, resumable runs and a determinism hash report, and gives the same frames as the engine's single-card renderer. Use whenever more than one card must be rendered (a series, a week of posts), when a card was edited and only part of it changed, when a long render was interrupted, or when someone asks "is this render identical to the last one", even if they only say "re-render everything".
---

# Batch render and cache (t6.2)

Prerequisites: t0.3 (render pipeline), t0.2 (determinism), t0.4 (quality checker), t6.1 for series (optional). Code: `module.mjs` (and `detproc.mjs`, a helper process). Real card used in the tests: `ported/tt10_ops_hr.mjs`, the TikTok card tt10 ported to the engine.

## When to use

- A series of cards: render all, redo only what changed.
- One long card (16 s = 495 frames) after a small edit near the end.
- A run that was stopped (laptop sleep, Ctrl-C, crash): continue, do not start over.
- Proof that two runs gave identical pixels (`framesHash`, per-frame hashes).
For one finished card, `node engine/render.mjs` (t0.3) is enough.

## How it works

1. **Fingerprint** (`cardFingerprint`): sha1 of the card file, every file it imports (followed), every file it reads with `new URL('./x', import.meta.url)`, all `engine/*.mjs`, and the Node version. Any change gives a new hash.
2. **Cache** (`<cache>/<name>/<full|preview>/<hash12>/NNNN.png`, plus `manifest.json` with the sha1 of every frame, `framesHash`, `mp4Hash`). Frames are drawn by the engine's own workers (`render.mjs --worker`), so dithering, scaling and colour are identical to a normal render.
3. **Jobs** run one after another; each job's frames are split into chunks of 60 frames (a run of consecutive missing frames) and drawn by at most 2 worker processes. Never more than 2.
4. **Encode** with the engine's exact filter and x264 settings, plus `-threads 2`.
5. **Status per job**: `unchanged` (same fingerprint, mp4 present and untouched: nothing runs, 0.4 s), `cached-encode` (frames cached, mp4 missing: encode only), `resumed` (some frames existed), `rendered` (all drawn).

## Incremental re-render: the `changed` hint

After an edit, say which seconds it touched: `{ card, changed: [13.0, 16.5] }`. The batch then
1. checks that the previous render of the same `name` exists and has the same frame count;
2. keeps only previous frames outside the range whose PNG still matches the stored hash (`seeded`);
3. **draws 8 reused frames again** (spread over the card, plus the two next to the range) and compares them with the cache. Any difference: the hint is rejected (`hint.accepted:false`) and every frame is drawn;
4. draws only the frames inside the range.
Measured (preview, 2 workers, test machine): tt10 first render 25.1 s; unchanged repeat 0.4 s; closer 0.2 s later = 105 of 495 frames drawn, 9.1 s. Same card, wrong hint: caught by the check, all frames redrawn, result still equals the engine's.
A hint is a promise about time, not about pixels: an edit to a shared helper that touches the whole card needs no hint (full redraw). Without a hint every changed fingerprint redraws everything, but `changedFrames` in the report still tells you which frames differ from the last version.

## Resume

Frames sit in the cache folder of the new fingerprint as they are drawn. If the run stops, run it again: existing complete PNGs are kept (`framesReused`), a PNG cut short by a killed worker is detected (no PNG end marker), deleted and redrawn (`framesRepaired`). `abortAfterTasks: n` (test hook) simulates the crash.

## API

- `renderBatch(jobs, {cache, out, workers=2, chunk=60, verify=8, force=false, contact=true, log})` -> `{workers, seconds, jobs:[{name, status, frames, framesRendered, framesReused, framesRepaired, framesHash, cardHash, hint, changedFrames, mp4, seconds}], totals}`; writes `<out>/batch_report.json`, `<out>/<name>[_preview].mp4`, `<name>[_preview]_contact.png`. Job: `{card, name?, preview?, changed?:[t0,t1], deps?:[files]}`. Give two versions of a card the same `name` so they share a cache.
- `determinismReport(card, {sample=12, preview=true, scratch})` -> `{deterministic, checked, mismatches[]}`: draws the frames forward then reversed in one fresh process, and each alone in its own worker; any hash difference is a mismatch. About 3 s for 12 frames.
- `diffManifests(a, b)` (from `readManifest(cache, name, preview)`) -> `{identical, changed[], ranges[[s,e]]}` in frames and seconds.
- `estimateBatch(jobs)`: 0.077 s/frame full, 0.040 s/frame preview, +2 s encode per card, cached frames free.
- `cardFingerprint`, `planTasks`, `pngComplete`, `readMeta`, `cacheStats`, `gc(cache, {dryRun})` (keeps each card's latest version, removes the rest; only touches folders this module made).

## Recipe: render a series

```js
import { emitCards } from '../t6_1_series-templates/module.mjs';
import { renderBatch, estimateBatch } from './module.mjs';
const files = emitCards(series, 'cards/');                       // one file per episode
const jobs = files.map(card => ({ card, preview: true }));       // preview while iterating
const rep = await renderBatch(jobs, { cache: '.cache', out: 'out', log: console.log });
```
Run it again after editing one episode's script: only that card's file changes, the others report `unchanged`. Full size: drop `preview`; keep each command under about 3 minutes (about 17 s per 225-frame card at full size) by rendering a few cards per run: the second run continues.

## Common failures

- Stale cards in one process: Node caches imported modules, so loading an edited card twice in one process returns the old code. The module reads META and hashes frames in fresh processes (`readMeta`, `detproc.mjs`); do the same in your own scripts.
- Disk: a 495-frame preview card is about 30 MB of PNG, full size several times that. Run `gc` after a series is final.
- `unchanged` but you changed the picture: the change is in a file the card reads in a way the fingerprint cannot see (a path built at run time). Pass it in `deps`, or `force: true`.
- A different `mp4Hash` for the same frames: x264 output can depend on machine load only through threads; the frames (`framesHash`) are the proof of identity, not the mp4 bytes.
- Hint rejected every time: the edit touches more than the range, or the card changed length (frame count differs: a full redraw is the only safe thing).

## Quality bar (measurable, all in the test)

- Batch `framesHash` equals the engine's `renderCard` `framesHash` for the same card (same frames).
- Repeat run: every job `unchanged`, 0 frames drawn, under 3 s. Deleted mp4: `cached-encode`, 0 frames drawn.
- Small-edit run draws about the edited fraction (21 of 60 frames for an edit of the last 0.7 s) and equals a full engine render. A wrong hint is rejected and the result is still correct.
- After a simulated crash and a truncated frame: `resumed`, 1 frame repaired, framesHash equals an uninterrupted render.
- `determinismReport`: true for clean cards and for the ported tt10; false (with frame numbers) for a card using `Math.random`.
- Real card: ported tt10 (495 frames) renders through the batch; a closer edit redraws 105 frames, not 495.

## Run it

```
node test.mjs                  # 44 checks (about 2 min), renders the demo at 1080x1920, checker passes
ANNIE_PREVIEW=1 node test.mjs  # demo at 540x960
```
