# Annie engine: the contract

This is the single source of truth for the animation engine. Every skill under `../skills/` builds on it. Read this file, run the example, then build.

Verified on 2026-11-19: `node engine/tests/run.mjs` passes (197 checks), `engine/examples/hello_card.mjs` renders at 1080x1920 and passes the quality checker.

## What it is

Plain ES modules. No installs. Draws with `@napi-rs/canvas`, encodes with `ffmpeg`. A card is a file that says how long it is and draws one frame at a time; the engine renders it in parallel, encodes it, and checks it.

```
engine/
  index.mjs      one import for everything
  ease.mjs       easings E, clamp, lerp, prog, remap, smoothstep, mix, damp, cubicBezier
  spring.mjs     spring, springState, springPath, followThrough, SPRING presets, settleTime
  rng.mjs        rng, hash, noise1, noise2, fbm, pick, shuffle
  timeline.mjs   track, sequence, stagger, timeline, page, pages, k, loop, pulse, blink
  canvas.mjs     createCanvas, fonts, setFont, textW, wrapText, fitText, roundRect, glow, withT, layer, ditherDark
  brand.mjs      palette P, SAFE zones, SLOGAN, FOOTER, EIGHTEEN, BANNED claim words
  parts.mjs      begin/end, background, kicker, hook, windowFrame, button, icon, dust, drawMark, closer
  render.mjs     renderer (library + CLI)
  qc.mjs         quality checker (library + CLI)
  fonts/         Inter, Space Grotesk, JetBrains Mono (woff2, OFL)
  examples/hello_card.mjs
  tests/run.mjs  self-tests
  testkit.mjs    runSkillTest(): the shared test.mjs runner for skills (unit checks, render demo.mjs to out/, QC on card and mp4)
```

## Environment variables

| Variable | Default | Use |
|---|---|---|
| `ANNIE_CANVAS` | (required) | path to `@napi-rs/canvas/index.js` |
| `ANNIE_FFMPEG` | (required) | path to ffmpeg binary (e.g. from `ffmpeg-static`) |
| `ANNIE_LUCIDE` | (required) | path to lucide icon ESM files for `icon()` |
| `ANNIE_FONTS` | `engine/fonts` | font folder |
| `ANNIE_PREVIEW=1` | off | render at 540x960 (same as `--preview`) |
| `ANNIE_WORKERS` | 2 | parallel frame workers |

## The card contract

A card is an `.mjs` file with two exports:

```js
import { begin, end, hook, E, prog } from '../engine/index.mjs';
export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.6 };
export function frame(t, i) {            // t = seconds, i = frame number. Return a 1080x1920 canvas.
  const { cv, ctx } = begin(t, { closerAt: 4.4 });   // background + kicker
  // ... draw ...
  return end(ctx, t, { closerAt: 4.4 });             // closer (slogan, Follow, footer)
}
```

Rules:
- `frame` must be a pure function of `(t, i)`. No `Math.random`, no `Date`, no state kept between frames. Use `rng(seed)` created inside the frame (or at module level and re-created per frame if you consume it).
- Create canvases only with `createCanvas` from the engine, not from `@napi-rs/canvas`. The checker reads the text through it.
- `META` optional fields: `coverT` (cover frame second), `holds: [[t0,t1],...]` (seconds where stillness is allowed), `dither: false`, `qc: { closer: false, motionThreshold, frozenSeconds, contrast... }`.
- Optional `export async function init()` runs once per worker (load images there).
- The renderer applies `ditherDark` to every frame. Do not dither in the card.
- Duration for demos: 5 to 8 s. The closer needs about 3 s at the end: closer at `T - 3.1` or earlier.
- Time conventions: seconds in code, frames only for META. Every motion is `prog(t, t0, t1)` then an easing.

## ease.mjs

`E` has 25 curves: `linear, inQuad, outQuad, inOutQuad, inCubic, outCubic, inOutCubic, inQuart, outQuart, inOutQuart, inExpo, outExpo, inOutExpo, inSine, outSine, inOutSine, inCirc, outCirc, inOutCirc, inBack(t,s), outBack(t,s=1.70158), inOutBack, inElastic, outElastic(t,a=1,p=0.3), outBounce, inBounce`. All hit exactly 0 and 1 at the ends.

| Job | Use | Duration |
|---|---|---|
| Entrance, fade in | `outCubic` | 0.3-0.4 s |
| Exit | `inCubic` | 0.2-0.35 s |
| Bouncy pop-in (chips, bubbles) | `outBack(t, 1.5-2.2)` | 0.35-0.6 s |
| Slam (stamps) | `outElastic(t, 1, 0.3)` | 0.6-0.9 s |
| Marker or cursor looping A to B | `inOutCubic` | 0.6-1.2 s |
| Breathing, glow | `inOutSine` or `pulse()` | 1-2 s period |

Helpers: `clamp(x,a=0,b=1)`, `lerp(a,b,t)`, `prog(t,t0,t1)` (clamped 0..1), `remap(x,a,b,c,d)`, `smoothstep(a,b,x)` or `smoothstep(x)`, `mix('#hex','#hex',t)` returns `rgb()`, `rgba('#hex',a)`, `damp(cur,target,lambda,dt)`, `cubicBezier(x1,y1,x2,y2)` returns an easing function.

```js
import { E, prog, lerp } from './engine/index.mjs';
const y = lerp(-120, 880, E.outBack(prog(t, 2.05, 2.85), 1.5));   // drops in with a bounce
```

## spring.mjs

Analytic damped spring `m x'' = -k (x - to) - c x'`. Safe in any frame order. `SPRING` presets: `snappy {k:320,c:26}`, `bouncy {k:170,c:14}` (13 percent overshoot, settles 0.67 s), `gentle`, `stiff`, `wobbly`, `critical` (no overshoot).

- `spring(t, {from,to,k,c,m,v0})` -> position. `springState(...)` -> `[x, v]`.
- `springPath(t, [{t,v},...], {from,k,c,m})`: jumps target at each key time, springs there, carries velocity.
- `followThrough(t, driverFn, {delay,k,c})`: a lagging, overshooting follower (a tail behind a moving body). Deterministic fixed-step simulation.
- `settleTime({to,...SPRING.bouncy})`: seconds until within 1 percent. Size your holds with it.

```js
const x = spring(t - 0.4, { from: -300, to: 0, ...SPRING.bouncy });
const tail = followThrough(t, u => 300 * E.inOutCubic(prog(u, 1, 2)), { delay: 0.05, k: 90, c: 8 });
```

## rng.mjs

`rng(seed)` is `s = (s * 1103515245 + 12345) & 0x7fffffff`, value `s / 2^31` in [0,1). Computed exactly (Math.imul). Seed is a number or string. Extras: `r.range(a,b)`, `r.int(a,b)` inclusive, `r.sign()`, `r.normal()`, `r.fork(n)`.
`hash(str)` FNV-1a. `noise1(x, seed)`, `noise2(x, y, seed)` smooth value noise in [-1,1]. `fbm(x, y, {octaves,lacunarity,gain,seed})`. `pick(r, arr)`, `shuffle(r, arr)` (copy).

```js
const r = rng(20261119);
const pieces = Array.from({ length: 12 }, () => ({ vx: r.range(-600, 600), vy: r.range(-500, 100), spin: r.range(-1, 1) }));  // build once at module level
const jitter = 4 * noise1(t * 3 + i * 10.7);   // organic shake, never random per frame
```

## timeline.mjs

- `track([[t, v, easeName?], ...])` -> function of t. Ease applies to the segment arriving at that key. Numbers or `#hex` colours.
- `sequence([[name, dur, overlap?], ...], {t0})` -> `{beats:{name:{s,e,d}}, end}`. overlap > 0 starts early, < 0 leaves a gap.
- `stagger(n, t0, gap, dur)` -> `[{i,s,e}]`. `k(t, {s,e}, 'outBack')` eased progress.
- `timeline()`: `.add(name, s, d)`, `.after(prev, name, d, {overlap})`, `.with(other, name, d)`, `.k(name, t, ease)`, `.has(name, t)`, `.active(t)`, `.end`.
- `page(t, {s,e,inDur=0.4,outDur=0.35,dist=160})` -> `{a, dx}` or null (the tt10 page slide). `pages(durs, {t0, overlap=0.1})` -> windows overlapping 0.1 s.
- `loop(t, period, phase)` 0..1 saw; `pulse(t, hz, phase)` 0..1 sine; `blink(t, period, duty)` boolean.

```js
const pg = pages([3.1, 4.75, 3.7], { t0: 1.9 });
const p = page(t, pg[0]); if (p) { ctx.save(); ctx.globalAlpha *= p.a; ctx.translate(p.dx, 0); drawPage(); ctx.restore(); }
```

## canvas.mjs

Re-exports `createCanvas` (wrapped), `loadImage`, `Path2D`, `GlobalFonts`. Registers Inter, Space Grotesk, JetBrains Mono.
`setFont(ctx, 'inter'|'sg'|'mono', px, weight, trackEm)`, `textW`, `wrapText(ctx, text, maxW)`, `fitText(ctx, text, {fam,wght,maxW,maxPx,minPx=42})` (sets the font, returns px), `roundRect` (builds path, returns ctx), `glow(ctx, colour, blur, fn)`, `withT(ctx, {x,y,rot,sx,sy,alpha}, fn)`, `layer(w,h,fn)`, `drawLayer`, `clipRect`, `ditherDark`, `dither`, `decor(ctx, on)` (marks texture text exempt from the 42 px floor), `hookText`.
Text on a small offscreen `layer` is NOT seen by the checker. Draw text on the main canvas, or on a full 1080x1920 layer drawn at 0,0.

```js
const { cv, ctx } = begin(t); setFont(ctx, 'sg', 104, 700); ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.fillText('Hello', 540, 470);
```

## brand.mjs

`P` palette (bg #0a0c10, panel #0d1117, panel2 #11161d, white #f8fafc, text #cbd5e1, muted #94a3b8, dim #475569, accent #00c97a, green #19e08f, cyan #22d3ee, red #ef4444, orange #f59e0b, ink #04140c). `SAFE` zones. `SLOGAN` (two lines, line 2 green), `CTA.follow`, `FOOTER.bgi`, `KICKER`, `BANNED`, `claimViolations(s)`.

## parts.mjs

`begin(t, {closerAt, kicker, dust})` -> `{cv, ctx}` (grid background, drifting dust, kicker). `end(ctx, t, {closerAt, brand, cta})`. `background`, `kicker`, `hook(ctx, cap, t)` (two-line mask-rise headline: `{tIn,tOut,l1,l2,c1,c2,b1,b2,px,glint}`; hook at px 104 baselines 470/580, page headers px 56 baselines 446/514), `windowFrame(ctx, {x,y,w,h,title,titleAlpha})` + `windowInner(w)`, `button(ctx, t, {x,y,w,h,label,doneLabel,pressT})`, `icon(ctx, 'lucide-name', x, y, size, colour, stroke)`, `dust(ctx, t, {...})`, `drawMark(ctx, cx, cy, size, {k, alpha})` (official BGI gear), `closer(ctx, t, t0, {brand})`, `CLOSER` y positions.
The closer is complete by `t0 + 1.2` s and never freezes (dust, breathing Follow button). It contains the slogan, a Follow button and the footer.

## render.mjs

```
node engine/render.mjs <card.mjs> [--preview] [--out dir] [--workers N] [--still t] [--range a-b] [--name base] [--keep]
```
Writes `<out>/<name>.mp4`, `<out>/<name>_contact.png` (12 frames), `<out>/<name>_report.json` and prints the report as JSON. Default out = `out/` next to the card. `--still 3.6` writes one PNG. `--range 1-2.5` renders only those seconds (`<name>_range.mp4`). `--preview` = 540x960, fast encode. Frames are PNGs in a scratch folder under `$TMPDIR`, removed afterwards (`--keep` leaves them). Colour pipeline: sRGB to BT.709 limited, tagged; libx264 crf 16 preset slow, high profile level 4.1 (preview: crf 20 veryfast). Report has `framesHash`: equal hash = identical frames.
Library: `renderCard(path, opts)`, `renderFrame(card, i, {preview})`, `loadCard(path)`, `contactSheet(imgs, labels)`.
Timing (measured): hello_card, 225 frames, 2 workers: 9 s at 540x960, 17 s at 1080x1920. The checker takes about 5 s for the same card.

## qc.mjs

```
node engine/qc.mjs <card.mjs> [--out dir] [--step N] [--video file.mp4]
```
Exit 0 only if no hard failure. Writes `<out>/qc.json` and `<out>/qc_zones.png` (12 frames with the zones drawn and the motion profile). Library: `qcCard(path, {out, step, video, thresholds, write})` returns `{pass, issues, motion, ...}`.

Rules (HARD = fails the run, warn = reported):

| Rule | Level |
|---|---|
| META is 1080x1920, fps 30, duration 1-90 s; with `--video`: the file matches, has no audio | hard |
| Frozen frames: motion energy under 0.004 for more than 0.5 s outside `META.holds` | hard |
| Text above y 250, from y 1580 down, or at x >= 940 inside y 800-1580 (more than 0.5 s) | hard |
| Text under 42 px held more than 0.5 s (`decor` text exempt) | hard |
| Contrast under 3:1 for more than 0.5 s (under 4.5:1 warns) | hard / warn |
| Banned claim word (private, offline, secure, price, Gumroad, competitor names ...) at any moment | hard |
| Closer in the second half: slogan pair with line 2 in #19e08f, Follow, footer | hard (off with `qc.closer:false`) |
| Text inside the Reels caption band y 1250-1580 | warn |

Motion energy is the sum of the luma changes of at least 6 levels, per pixel, on a quarter-size frame. Measured: a 14 px dot moving 10 px per frame gives 0.018; the drifting grid background alone gives 0.000 (so background drift cannot hide a frozen subject; a grid-only card fails as frozen). Shorter-than-0.5 s zone or size breaks (text sliding in) are warnings.
Contrast: the text colour against the median luminance of a ring around its box, sampled every 3rd frame, only while the text is at least 90 percent opaque.

## Self-tests

`node engine/tests/run.mjs` (about 25 s; `--quick` skips video renders). Checks easing endpoints and shapes, springs (convergence, integration match, continuity), rng, noise, timeline, fonts, render determinism (frames hashed twice, `--still` twice), the checker catching a frozen segment, text above y 250, text in the rail, text under 42 px, a banned word, low contrast, and passing a clean card and `hello_card`.

## Known limits

- Frozen detection needs 0.5 s of near-zero change. A slow gradient breathing (changes under 6 luma levels) counts as frozen: pair it with a real mover.
- Text on small offscreen layers is not checked. Contrast uses a ring around the text box, so text over a busy picture can read wrong.
- `--range` renders the seconds you ask for but frames still carry their absolute time.
- The checker does not judge taste. Look at the contact sheet.

## Writing a skill's test.mjs

```js
import { runSkillTest } from '../../engine/testkit.mjs';
await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near }) => { ok(1 + 1 === 2, 'math'); near(0.1 + 0.2, 0.3, 1e-9, 'float'); } });
```
It runs your checks, renders `demo.mjs` (full size; `ANNIE_PREVIEW=1` for 540x960) to `out/demo.mp4` and `out/contact.png`, runs the QC on the card and the file (`out/qc.json`, `out/qc_zones.png`), requires 5-8 s, writes `out/test_result.json`, exits 0 only if everything passed. A card or skill module must never import `render.mjs` at top level in a way that waits on a worker; importing helpers from it is fine.
