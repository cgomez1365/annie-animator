---
name: performance-profiling
description: Profiles a BGI card's render cost and memory: the time of each stage of a frame (record, raster, dither, PNG encode), hot spots by switching drawing features off, operation counts, canvas leaks, and a predicted render time, with the canvas tricks (layer cache, memo, scratch canvas, glow sprite) that cut a card's own cost. Use whenever a render is slow or runs out of memory, before building a card with many particles, shadows, gradients or layers, when a long card (over 10 s) is planned, or when someone asks "why does this take so long", even if they only say "make it render faster".
---

# Performance profiling (t6.5)

Prerequisites: t0.3 (render pipeline), t0.4 (quality checker). Code: `module.mjs` (+ `memproc.mjs`, a helper process). Real card: the ported tt10 and an optimised copy in `optimized/`.

## The finding to remember (measured 2026-11-19, 1080x1920, test machine)

Per frame on tt10 and hello_card: card **draw (record) 2 ms + raster 9 ms**, engine **dither 17 ms**, engine **PNG encode 73 ms**: about 100 ms. Your card is about 11 percent of a frame. Skia only records drawing calls; the pixels are made at the first read (a 1x1 `getImageData` forces it), so timing `card.frame()` alone says 2 ms and is wrong. Optimising a card's drawing can gain a few percent; the engine's PNG encode and dither are where the time is (see `../t6_ENGINE_REQUESTS.md`). A raw-pipe prototype (`rawRender`) makes the same byte-identical mp4 in 5.9 s instead of 16.0 s.

## The budget (`BUDGET`)

A 16.5 s card (495 frames) should render in under 40 s at full size with 2 workers. x264 takes about 23 ms a frame (6 ms at preview). That leaves 116 ms of work per frame per worker. The engine's fixed share is about 90 ms, so a card gets **25 ms average and 40 ms at the 95th percentile** for its own drawing (record + raster). tt10 uses 11 ms.

## Measuring: `profileCard(card, {every=3, preview, memory, hot})`

Returns `phases` (draw, raster, dither, scale, png: mean, p50, p95, p99, max), `share` (percent of the frame), `cardMs` and `totalMs`, `spikes` (slow frames), `ops`, `hotspots`, `memory`, `budget` and plain-language `advice[]`.

- **`ops`** (`countOps`): calls a frame by kind, calls with shadowBlur or a filter, canvases drawn on per frame (1 is right: the frame itself) and their megabytes, whether `frame()` reads pixels back.
- **`hotspots`** (by ablation): the same frames run with one kind of drawing switched off (shadow blur, text, images, gradient fills, strokes, solid shapes); the time that disappears is that kind's cost. tt10: solid shapes 7.5 ms, gradient fills 4.1 ms (the full-screen vignette), strokes 0.7, text 0.2.
- **`memory`** (`memoryTrend`): canvases still alive after garbage collection, counted with WeakRefs; a card that keeps canvases grows by MB per 100 frames. (Resident memory is too noisy for this.)
- **`renderCost(profile)`**: frames x per-frame ms / workers + x264 + 1.2 s. hello_card: predicted 17.6 s, real 16.0 s.
- Always sample with `every: 1` for the final check; `every: 3` is enough to find problems. Run in a fresh process for an edited card.

## Memory while rendering (`loopMemory`)

The engine's frame workers draw in a synchronous loop. @napi-rs/canvas frees a canvas's pixels only after the event loop turns, so every frame's 8 MB stays until the worker exits: hello_card 90 frames peaks at 1.5 GB, 225 frames at 3.7 GB; with `await new Promise(r => setImmediate(r))` every 10 frames: 0.5 GB. A 495-frame card needs about 4 GB per worker. In your own tools that loop over frames, yield every 10 frames. (Engine request 10.)

## Canvas tricks (the toolkit)

- `layerCache(key, w, h, draw)`: draw a static layer once, `drawImage` it every frame. The key must name everything the layer depends on. **Never cache text**: the checker reads text when it is drawn and a cached layer draws it once. Measured: a full-screen vignette as a gradient costs 4.3 ms, as a cached blit 0.8 ms. `optimized/tt10_ops_hr_cached.mjs`: tt10's own time 10.9 ms -> 7.3 ms (about 33 percent), the whole frame about 3 percent; frames match the port to rounding (at most 1 level per channel), not byte for byte.
- `memo(key, fn)`: build constants once (seeded cell lists, gradients, Path2D). Must not depend on t.
- `scratch(key, w, h)`: one reusable temporary canvas, cleared on every request. A canvas created per frame costs about 3.5 ms more than a reused one at full size and, in a loop that does not yield, 8 MB of memory.
- `glowSprite(color, r)` / `drawGlow(ctx, x, y, 'rgba(r,g,b,a)', r, alpha)`: a cached radial glow instead of `shadowBlur` (30 blurred circles: 2.3 ms; sprites 1.1 ms; larger and more numerous blurs cost much more). Test it before trusting it: look at both.
- `cacheStats()`, `clearCaches()`. A cache keeps its canvases for the life of the process: 1080x1920 is 8 MB each.
- Other rules: one path and one `stroke()` for many segments; no `ctx.filter`; no `getImageData` inside `frame()`; create gradients once; skip drawing that is off screen or covered; keep `save/restore` pairs tight.

## Recipe

1. `const P = await profileCard('card.mjs', { every: 3 }); console.log(P.advice.join('\n'))`.
2. If `budget.cardMean` or `cardP95` is false: take the top hot spot, apply the trick, profile again. If both are true, stop: the card is not the problem.
3. A long card that renders slowly or swaps: check `loopMemory(card, {frames: 90, yieldEvery: 0})` and read engine request 10.
4. Before a series (t6.1/t6.2): `renderCost` times the number of episodes tells you whether to render in two runs.
5. When you cache a layer, compare frames before and after (a sha1 or a pixel difference) and say which you got.

## Common failures

- Timing `card.frame()` only: 2 ms, wrong. Force a read, as `phaseTimes` does.
- Caching a layer that holds text or that depends on t: stale or invisible text.
- Per-frame `createCanvas` for temporary surfaces: use `scratch`.
- Trusting a one-off number: the machine is shared. `profileCard` samples many frames; take the p95 and the mean, repeat before and after.
- "Optimised" cards that change the picture: always diff.
- Treating `rawRender` as the engine: it is a prototype in this skill; the engine still writes PNGs.

## Quality bar (measurable, all in the test)

- The PNG encode is 60-85 percent of tt10's frame and the card's own drawing under 20 percent; the stage means are measured (draw < 8, raster > 3, dither > 8, png > 50 ms).
- tt10 is inside the budget (11 ms mean, 16 ms p95), draws on 1 canvas, no readback, no shadows, no canvas leak; the advice says so.
- The planted slow card is described correctly (3+ canvases, 100+ shadow calls, readback) and ablation finds its shadows and layer blits; its cached twin draws identical pixels (sha1) in at most 70 percent of the time; a card that keeps a canvas every frame is flagged as a leak and its clean twin is not.
- The optimised tt10 matches the port to rounding and its own time is at least 12 percent lower.
- The predicted render time is within about 35-45 percent of a real render; the raw-pipe prototype's mp4 is byte-identical to the engine's and at least 30 percent faster; the worker loop uses under half the memory when it yields.

## Run it

```
node test.mjs     # 34 checks, about 2 minutes (it renders hello_card twice at full size), demo at 1080x1920, checker
```
