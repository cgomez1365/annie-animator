---
name: motion-brand-system
description: Defines how Broken Gear Industries and AEON content moves, so every card feels like the same studio: the named timing-curve library, how the BGI cog turns (in clicks, never a smooth spin), do and do-not rules, and a scorer that grades a card file against the system and lists plain fixes. Use whenever a new card, template or video is being designed, whenever someone asks if a card is "on brand" or "feels like us", when choosing an easing or duration, when drawing or animating a gear or the mark, and before approving any card, even if they never mention motion rules.
---

# Motion brand system (t7.3)

Prerequisites: t0.1 (easing and springs), t0.2 (timeline and rng), t0.4 (quality checker). Code: `module.mjs`. The scorer builds on `engine/qc.mjs`.

## What makes the studio recognizable

Three things, always together: (1) a small set of curves, each with one job; (2) the cog clicks; (3) nothing ever sits still. A viewer should be able to tell a BGI card with the sound off and the logo covered.

## 1. The curve library (`CURVES`)

| Name | Easing | Seconds | Job |
|---|---|---|---|
| `enter` | outCubic | 0.30-0.40 | anything arriving: pages, headers, panels |
| `exit` | inCubic | 0.20-0.35 | anything leaving: it accelerates away |
| `pop` | outBack 1.7 | 0.35-0.60 | chips, bubbles, buttons, cards landing (10 percent overshoot) |
| `slam` | outElastic | 0.60-0.90 | the one money shot per card (37 percent overshoot) |
| `glide` | inOutCubic | 0.60-1.20 | a marker or camera from A to B |
| `click` | outBack 1.3 | 0.26-0.30 | one cog step (6.2 percent overshoot) |
| `breathe` | inOutSine | period 1.2-2.0 (1.6) | glows and holds |
| `settle` | SPRING.bouncy | 0.55-0.80 | a body that lands and wobbles (13.5 percent overshoot) |

Also: stagger gaps rows 0.14 s, chips 0.08 s, cells 0.04 s (`STAGGER`); page slide in 0.4 s, out 0.35 s, overlap 0.1 s, 160 px (`PAGE`; use the engine's `page()`/`pages()`).
Use: `play('pop', t, t0)` gives eased progress (dur defaults to the mid value; pass your own). `curve(name, u)` for u in 0..1, `sampleCurve(name, n)` to draw it, `overshoot(name)` to measure it, `breathe(t, 1.6)` for pulses.

## 2. How the cog turns

The official mark has 12 teeth, so one click = one tooth = 30 degrees.
- It never spins smoothly. `ratchetAngle(t, {t0, teeth: 12, period: 0.6, dur: 0.28})`: one tooth per 0.6 s, a 0.28 s snap (outBack 1.3, overshoot 6 percent of a tooth, about 1.9 degrees), then a hold. It sits on the exact tooth after each click; 12 clicks = one turn in 7.2 s. Fastest allowed period 0.45 s; slowest 0.9 s.
- Every click leaves a trace at the impact moment (`CLICK_IMPACT` = 0.435 of the way into the snap): `clickPulse(t, o)` gives `{n, since, k}` with k = 1 at impact falling to 0 in 0.3 s. Use it for a ring (radius 14 -> 84 px, alpha 0.85 -> 0), a pawl dip (8 px, k cubed) and `clickShake(t, o, 3)` (3 px, dies in 0.3 s).
- A driven gear turns the other way by the tooth ratio: `meshedPair(angleA, {cx, cy, rpA, teethA: 12, teethB: 18})` returns both gears; B is phased half a tooth so teeth never collide (tested at 7 angles by pixel overlap: 0). Same module on both gears: `gearPoints(cx, cy, rp, teeth, angle)` uses tip = rp + m, root = rp - 1.25 m, m = rp / teeth, so any two gears with `rp / teeth` equal will mesh.
- `drawGear(ctx, cx, cy, rp, teeth, angle, {fill, stroke, lineWidth, hole})`. White fill = the solid half of the mark; green outline = the broken half. Keep a green tooth marker line so the turn reads.
- In the closer the engine draws the official mark itself (`drawMark`); do not rotate it. Use clicking gears in the body of a card.

## 3. Rules (`RULES`, ids D1-D8 do, N1-N8 do not)

Do: arrive with outCubic or land with outBack; leave with inCubic; the cog clicks; every click leaves a trace; pages overlap 0.1 s; nothing sits still (breathe, drift, dust); one slam per card; palette only; end with the closer.
Do not: linear motion on anything the eye follows; a constant-speed cog; slow fade-outs over 0.4 s; several pops at one instant; `Math.random`/`Date`; two overshoot curves on one move; off-palette colour; moves shorter than 0.15 s or longer than 3 s (slow camera and turns on inOutSine may run long).

## 4. The scorer

```js
import { scoreCard } from './module.mjs';
const r = await scoreCard('/path/to/card.mjs', { files: ['/path/to/helper.mjs'] });   // about 5-8 s (runs the engine QC)
console.log(r.score, r.grade, r.fixes);            // 90+ on brand, 70-89 close, under 70 off brand
```
Points (100): engine QC 25, easing vocabulary 20 (share of eased uses that are signature curves), roles 15 (a pop, an enter, an exit, ambient motion; minus one for a constant-speed `ctx.rotate(t * k)`), palette 15, timings 10 (0.15-3 s), determinism 5 (a `Math.random`, `Date` or timer also caps the total at 59), structure 5 (closer, hook, begin), cadence 5 (0.3-4 motion events a second). `r.parts` says what each part found; `r.fixes` is a list of plain sentences. `analyzeSource(text)` is the static scan alone (instant); `cadence(profile, step)` the pace reading.
- It reads the card FILE (plus `files`). Motion that lives in a helper module is invisible unless you pass it. It cannot see textures or text inside images.
- Palette uses a distance of 36 per colour to the BGI palette; near-black neutrals pass.
- Measured on 2026-11-19: engine `hello_card` 100, the three t7 demos 100, t0.1 demo 98 (one `linear`), a hello_card copy with outBack/inOutCubic swapped for linear/inSine 90 (borderline), with three off-palette colour literals 85 (close), a copy with `Math.random` capped at 59, a deliberately bad card 3. The high marks of good cards mean "follows the rules", not "is beautiful": look at the contact sheet.
- Cadence limits come from those six cards (0.4-0.8 events a second), not from viewer data.

## Common failures

- A smooth-spinning gear (`ctx.rotate(t * 1.2)`): replace with `ratchetAngle`. The scorer flags it.
- A click with no trace: add the ring or the shake from `clickPulse`.
- Two gears that interpenetrate: their `rp / teeth` differ, or B lacks the half-tooth phase. Use `meshedPair`.
- Everything pops at once: stagger by 0.08-0.14 s.
- Score 100 but the card feels dead: the rules are satisfied and the timing is wrong for the content. Check the contact sheet and the motion graph in `qc_zones.png`.
- Overshoot on exits: exits are inCubic, never outBack.
- Text in the caption band (y 1250-1580) or at x >= 940 inside y 800-1580: the QC (and so the score) catches it. The demo hit this once with its ratio label, which is why it now sits at x 830.

## Quality bar (what the test measures)

Every curve starts at 0 and ends within 2 percent of 1; enter, exit, glide, breathe overshoot 0; pop 8-12, click 4-8, slam 30-45 percent; click is faster than pop. The cog: outline radii exact, ratchet sits on the exact tooth after every click, overshoot 4-8 percent of a tooth, snap speed over 3x the average, zero velocity in the hold, 12 clicks = 2 PI, impact envelope 1 -> 0 in 0.3 s, shake at most 3 px. Mesh: centres rpA + rpB apart, B counter-rotates by 12/18, teeth overlap 3 px or less at 7 angles while a wrong phase overlaps over 100 px. Analyser: finds easings, roles, timings, off-palette colours, `Math.random`, constant spin; ignores comments. Scorer: hello_card on brand (90+), curves swapped lowers it by 8 or more and says why, off-palette colours lower the palette part, `Math.random` caps at 59, the bad card is 40 or less with at least 5 fixes, the three t7 demos 90+. Demo: 5-8 s, 1080x1920, silent, engine QC passes; by eye on `out/contact.png`.

## Run it

```
node test.mjs                         # 94 checks + render + QC (about 1.5 minutes)
ANNIE_PREVIEW=1 node test.mjs         # 540x960 while iterating
node -e "import('./module.mjs').then(async m => console.log(await m.scoreCard(process.argv[1])))" /path/to/card.mjs
```
