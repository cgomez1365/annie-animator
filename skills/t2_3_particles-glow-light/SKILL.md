---
name: particles-glow-light
description: Adds seeded particles (bursts, sparks, dust puffs, floating motes, trails), additive glow, a thresholded bloom, light sweeps, glints, rings and flashes to a BGI card, all deterministic and cheap enough for 30 fps rendering. Use whenever something lands, clicks, completes, launches or gets revealed and needs to feel energetic, whenever a scene looks flat or "dead" in the dark, whenever a moving object needs a trail or a button needs a shine, or when someone asks for sparkle, glow, shine, confetti or dust, even if they never say "particles".
---

# Particles, glow and light (t2.3)

Prerequisites: t0.1 (curves), t0.2 (seeded rng; everything here is seeded). t2.2 is the usual partner (a squash on landing triggers a puff). Code: `module.mjs`. Contract: `engine/README.md`.

## When to use

At the moment of an event (impact, press, completion, reveal) for 0.3-0.8 s, and as a quiet ambient layer (motes) behind a scene. Effects are seasoning: one hit effect per event, not five. Keep them off text that must be read.

## Rules that make it look good

1. Particles live 0.35-0.8 s (sparks) or 0.45-0.8 s (dust). Longer and it looks like snow. Fade with a power curve (alpha `(1-p)^1.4`) and shrink (size to 25 percent).
2. Sparks are additive streaks along the velocity (length 0.045 s of travel, min 1.5 x size) with a small halo. Dust is normal-blend soft circles that GROW (1x to 2.6x) and fade. Do not mix them up.
3. Colours: green `#19e08f`, white, cyan `#22d3ee` for sparks on dark. Dust is `#94a3b8`. Never use red or orange for success.
4. Counts: spark burst 20-30, dust puff 8-12, motes 20-30. Test: 120 particles plus a full-frame bloom cost about 60 ms per frame (best of 6 on the test machine); a card with one burst and a half-size bloom is far cheaper.
5. Glow = additive (`lighter`) soft sprite. Never fake a glow with shadowBlur on many shapes (slow, and it clips).
6. Bloom once per frame, after lights are drawn and BEFORE text. It keeps only light brighter than `threshold` (90 of 255), so panels, grid and dark areas never change. Without the threshold the whole region brightens and shows a visible rectangle (found and fixed in the demo).
7. Every effect has a fixed seed. Same seed = same sparks every render. Use a different seed per event (`seed: 40 + n`) so repeats do not look copy-pasted.

## The technique

- `burst(t, {t0, x, y, n, seed, speed, angle, gravity, drag, life, size, colors, grow})` -> particles alive at t. Position is analytic (drag and gravity solved exactly, test: within 0.003 px of step-by-step integration). Angle in radians, 0 = right, `-Math.PI/2` = up; `[-0.95*PI, -0.05*PI]` = a fan upward. Recipes: sparks speed [300,900] drag 1.7 gravity 1500 life [0.35,0.75]; confetti speed [250,700] drag 2.5 gravity 600 life [0.9,1.6] with `mode:'square'`.
- `puff(t, {t0, x, y})`: ground dust for a landing; y is the floor line.
- `motes(t, {box, n, period})`: rising twinkling specks, loops exactly every `period` s (tested), stay in the box plus the sway.
- `trailPoints(t, posFn, {n, dt})` + `drawTrail(ctx, pts, {color, width})`: the position function sampled in the past, drawn tapered (width x (1-k), alpha (1-k)^1.6). 14-16 points at 0.02 s gives a 0.3 s tail. posFn must be a pure function of time.
- `drawParticles(ctx, ps, {mode})`: `'spark'`, `'dot'` (additive with halo), `'soft'` (dust), `'square'` (confetti that turns).
- `glowDot(ctx, x, y, r, color, intensity)`: radius r of soft light; breathing = `0.16 + 0.05*sin(3t)`.
- `sweep(ctx, t, {t0, dur, box, r, strength})`: a soft diagonal band crosses a card once (0.6 s, inOutCubic), clipped to the box and its corner radius. Use on cards, buttons, headlines after they land.
- `glint(ctx, x, y, size, k)`: four-point star, grows 0 to 0.4 then fades. `ring(...)`: expanding ring. `flash(t, t0, dur)`: 1 to 0 (squared) multiplier for a glow or border.
- `bloomPass(ctx, [x, y, w, h], {strength 0.4-0.9, scale 6-10, threshold 90})`.

Order inside a frame: background and panels, glows under things, objects, trails, particles, rings, glints, sweeps, bloom, then text.

```js
import { burst, drawParticles, ring, glint, sweep, bloomPass } from './module.mjs';
drawParticles(ctx, burst(t, { t0: 2.95, x: 774, y: 962, n: 28, seed: 40, angle: [-3.0, -0.15], gravity: 1500, drag: 1.7, colors: ['#19e08f', '#ffffff', '#22d3ee'] }), { mode: 'spark' });
ring(ctx, 774, 962, 20, 150, prog(t, 2.95, 3.45)); glint(ctx, 774, 962, 96, prog(t, 2.95, 3.45));
bloomPass(ctx, [540, 714, 466, 540]);       // then draw text
```

Timing at an event (t = hit time): glow flash 0-0.5 s, sparks 0-0.75 s, ring 0-0.5 s, glint 0-0.5 s, sweep starts +0.05 s and lasts 0.6 s. Anticipation (t2.1) before the hit, squash (t2.2) at the hit.

## Module API

`burst`, `puff`, `motes`, `trailPoints`, `glowSprite`, `glowDot`, `drawParticles`, `drawTrail`, `bloomPass`, `sweep`, `glint`, `flash`, `ring`.

## Common failures

- Rectangle of brightness after bloom: threshold too low. Keep 90 or more on dark panels.
- Text under bloom looks smeared: draw text after the bloom.
- Sparks that all fly the same way: widen `angle`, keep `speed` a range.
- Particles created with `Math.random` or `Date`: breaks the renderer's determinism (QC and `framesHash`). Use the module.
- Glow with intensity over 1 everywhere: blown white, no colour. Keep the centre at 1 and the halo at 0.2-0.5.
- Effects covering the hook or the closer area: keep them inside the window.

## Quality bar

- Same inputs give identical particles; a different seed gives a different burst; nothing exists before t0 or after the longest life (test).
- Analytic positions match integration within 1 px (measured 0.003 px); alpha falls monotonically inside 0..1 (test).
- Motes loop exactly and stay in their box (test). Trail head equals the position now (test).
- Glow, bloom, sweep and glint are checked on real pixels: falloff, halo 10 px outside a bright dot, dim panels unchanged, sweep clipped to its box, glint invisible at k 0 and 1 (test).
- Cost: full-frame bloom + 120 particles under 250 ms (measured about 60 ms) (test).
- Demo: flat vs lit hit twice; QC passes with no frozen run.

## Run it

```
cd skills/t2_3_particles-glow-light
node test.mjs                  # about 45 s at full size
ANNIE_PREVIEW=1 node test.mjs
```
Outputs: `out/demo.mp4`, `out/contact.png`, `out/measured.json`, `out/qc.json`.

## Next skills

t2.4 masks and reveals (a wipe with a bright edge uses `glowDot` and `sweep`), t3.x scenes that mix all of this.
