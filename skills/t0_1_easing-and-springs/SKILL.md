---
name: easing-and-springs
description: Chooses and applies the right motion curve (easing or damped spring) for every move in a BGI animation card, with durations in seconds and frames, so objects have weight instead of sliding at constant speed. Use whenever a card has anything entering, leaving, landing, popping, travelling between two points, pulsing or bouncing, whenever motion "feels like a slideshow" or "floaty", or when someone asks for ease, bounce, overshoot, elastic or spring, even if they never say the word "easing".
---

# Easing and springs (t0.1)

Prerequisites: none. This is the base of the tree. Every other skill uses it.
Code: `module.mjs` (recipes, drop, springLegs) on top of `engine/ease.mjs` and `engine/spring.mjs`. Read `engine/README.md` first for the card contract.

## When to use

Every time something changes value over time: position, scale, alpha, rotation, colour. A linear move reads as mechanical and cheap. A curve with a clear start and a clear stop reads as physical. Rule of thumb from the tt10 cards: things arrive fast and settle slow, leave slow and finish fast, and nothing important ever moves at one constant speed.

## The technique

1. Get local time with `prog(t, t0, t1)`: 0 before t0, 1 after t1, clamped.
2. Pass it through one curve: `E.outCubic(p)`.
3. Use the result to blend two values: `lerp(a, b, e)`.
Never put `t` straight into `lerp`. Never ease something for longer than it needs: more than 1.2 s on one move feels slow.

### Recipe table (the house defaults; `RECIPES` in module.mjs has them as code)

| Job | Curve | Seconds | Frames at 30 fps | Notes |
|---|---|---|---|---|
| Arrive (panel, row, fade in) | `outCubic` | 0.4 | 12 | list rows: 0.4 s each, 0.14-0.15 s apart |
| Leave | `inCubic` | 0.30-0.35 | 9-10 | accelerates away; page-out is 0.35 s |
| Pop-in (chip, bubble, button) | `outBack(t, 1.7)` | 0.5 | 15 | s 1.5 = 8 percent overshoot, 1.7 = 10, 2.2 = 15 |
| Hero pop (badge, big object) | `outBack(t, 2.4)` | 0.6 | 18 | about 18 percent overshoot |
| Slam (stamp, verdict mark) | `outElastic(t, 1, 0.3)` | 0.8 | 24 | crosses the target 7 times (measured), `p` 0.3 slower than 0.2 |
| Marker or cursor A to B | `inOutCubic` | 0.8-1.0 | 24-30 | loop it: `inOutCubic(loop(t, period))` |
| Breathing, glow | `inOutSine` | 1.6 period | 48 | or `pulse(t, 0.6)` |
| Flying away (scatter) | `inCubic` | 0.4 | 12 | add seeded velocity + spin (t0.2) |

Page slide (two pages overlapping 0.1 s): in 0.4 s `outCubic`, out 0.35 s `inCubic`, travel 160 px. The engine has it: `page()`, `pages()` (t0.2).

### Easing or spring?

- Easing = you decide the duration. Use it for anything timed to a script or to the voice.
- Spring = physics decides when it settles. Use it for things that react (squash on landing, a chip that gets bumped, a retarget in mid-flight). Presets in `SPRING`: `snappy` k 320 c 26 (settles in 0.37 s), `bouncy` k 170 c 14 (13 percent overshoot, settles in 0.67 s), `gentle`, `stiff` (UI, almost no wobble), `wobbly` k 120 c 6 (jelly), `critical` (no overshoot).
- Damping ratio zeta = c / (2 sqrt(k m)). Under 1 bounces; 1 is the fastest settle without overshoot; over 1 is lazy. To run the same motion L times faster, multiply k by L squared and c by L.
- Use `settleTime({to:1, ...SPRING.bouncy})` to size the hold after a spring.

### Landing an object (the hello_card pattern, `drop()`)

```js
import { drop } from './module.mjs';
const d = drop(t, { t0: 2.05, from: -120, to: 880, dur: 0.8, s: 1.5 });
// d.y = outBack position (overshoots the floor by about 8 percent of the travel, then settles: that IS the bounce)
// d.squash = spring after impact (0.2 -> 0). Draw: translate(x, d.y + h/2 * d.squash); scale(1 + 0.9*d.squash, 1 - d.squash)
```
Then add a sine bob that fades in after the settle: `7 * Math.sin((t - d.impact) * 4.2) * prog(t, d.impact + 0.4, d.impact + 0.7)`. Add a shadow ellipse that shrinks and fades as the object rises. Nothing sits still: after the landing there is always a bob, a pulse or a drift.

### Retargeting a spring

`springPath(t, [{t:0.5,v:100},{t:1.5,v:40}], {from:0, ...SPRING.bouncy})` jumps its target at each time and keeps its velocity, so a change in mid-flight bends instead of snapping. `springLegs(t, t0, legDur, values)` is the same on a fixed beat (used for the demo's spring lane).

### Secondary motion

`followThrough(t, driver, {delay, k, c})` is a spring chasing another value: a tail, an antenna, a label under a moving chip. delay 0.04-0.08 s, k 80-140, c 8-12.

## Module API (`module.mjs`)

- `RECIPES` table; `play(t, t0, 'pop' | 'enter' | ..., {dur, s})` -> eased 0..1.
- `drop(t, {t0, from, to, dur, s})` -> `{y, squash, impact}`; `impactTime(dur, s)`.
- `recipeFor('pill lands')` -> recipe name from a plain job.
- `springLegs(t, t0, legDur, values, preset)`; `sampleCurve(name, n)`; `overshoot(name)`.

## Common failures

- Linear anywhere visible. Fix: pick from the table.
- Bouncy everything. Only the things that are objects bounce; text and panels use `outCubic`.
- Overshoot on opacity: alpha above 1 clamps, so an `outBack` on alpha looks like a stall. Use `outCubic` for alpha and `outBack` for scale/position.
- Elastic needs time: under 0.6 s the wobble is a blur; give it 0.8 s or more.
- Easing both ends of something that loops: loops need `inOutCubic`/`inOutSine` so the join has zero speed.
- Using Euler integration for springs: use the analytic `spring()`; it is correct in any frame order, which parallel render workers need.

## Quality bar (measurable)

- Every easing in the table is 0 at its start and exactly 1 at its end (test: 25 curves, endpoints within 1e-9).
- Monotonic curves never go backwards; `outBack(1.70158)` peaks 9-11 percent over 1 (test).
- Springs match a 0.1 ms integration to 0.02 and converge to the target within 0.001 (engine tests).
- In the demo, four balls make the same trip; the linear one is visibly the odd one out; no frame has zero motion (QC motion energy above 0.004 everywhere).

## Run it

```
cd skills/t0_1_easing-and-springs
node test.mjs                 # unit checks + full-size render + QC; exit 0 only if all pass
ANNIE_PREVIEW=1 node test.mjs # same at 540x960 while iterating
```
Outputs: `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/qc_zones.png`.

## Next skills

t0.2 (timeline and seeded rng) for timing many things; t1.x physical object motion uses `drop()`, springs and `followThrough` heavily.
