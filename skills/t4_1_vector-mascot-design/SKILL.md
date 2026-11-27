---
name: vector-mascot-design
description: Designs and draws "Cog", the Broken Gear Industries mascot, as pure vector paths (a friendly cog with a face plate, arms, legs and an antenna) so it can be rigged, given expressions and lip-synced later. Use whenever a card needs a character, a host, a guide or a face for the brand, when someone asks for a mascot, a character sheet, proportions, a silhouette test or "make it feel friendly", even if they never say "mascot". The BGI logo mark itself is never touched.
---

# Vector mascot design (t4.1)

Prerequisites: t0.1 easing-and-springs (pop-ins use outBack), t0.3 render-pipeline (to render the demo).
Code: `module.mjs`. Demo: `demo.mjs` (7.5 s). Test: `node test.mjs` (64 checks, exit 0 only if all pass and the engine QC passes).
Everything else in tier 4 (t4.2 to t4.5) imports `makeRig` and `drawMascot` from this folder.

## When to use

Any time a card needs a character. Cog is the only BGI character. Do not invent a second one and do not redraw Cog by hand in a card: import `drawMascot`. Cog is a character, the BGI gear mark is the logo. They never share a path, and the mark is never recoloured, rigged or given a face (a test pins `engine/mark_paths.mjs` by its hash).

## The design in one paragraph

A toothed green ring (8 chunky teeth) is the whole body. A dark glossy face plate sits inside it, with big white eyes (cyan iris), green brows and a small white-lined mouth. Two tube arms and two tube legs end in white mittens and white shoes. A short antenna with a cyan ball carries the secondary motion. Flat shapes, one soft rim light, one dark edge colour, no gradients except the body shading. White hands and shoes echo the white half of the BGI mark.

## Proportions (unit = body radius; `SPEC` in module.mjs holds them)

| Part | Value | Why |
|---|---|---|
| Tooth tips / roots | 1.00 / 0.81 | tooth height 19 percent of radius: chunky, reads as a cog at 28 px |
| Teeth | 8 | 10 or more reads as a germ or spore in silhouette. Fewer than 7 loses "gear" |
| Tooth top / gap | about 30 percent / 30 percent of the circle each | equal chunks, soft shoulders (`toothSoft` 0.22) |
| Face plate | radius 0.63, centre 0.02 below body centre | 63 percent of the body: a face big enough for acting |
| Eyes | x +-0.27, y -0.08, half size 0.165 x 0.20 | eye spacing = 1.6 eye widths: cute, not alien |
| Brows | y -0.40, 0.23 long, 0.048 thick | float above the eyes, free to move 0.12 |
| Mouth | y 0.31, half width 0.19 | lower third of the plate |
| Arms | shoulder (+-0.84, 0.14), 0.34 + 0.30 long, 0.135 to 0.115 thick | hang along the ring, hands just outside it |
| Legs | hip (+-0.30, 0.80), 0.32 + 0.27, 0.15 to 0.125 thick | short stubs: chibi, stable, and the ring stays the star |
| Ground line | 1.56 | sole of the shoe |
| Height | antenna ball to ground 2.85 units | at u = 230 px that is 655 px, at u = 275 it is 784 px |

Size rules: hero u 230 to 280 px. Anything under u = 28 px loses the face: use a silhouette-safe pose (arms up) there. At hero size the smallest feature (a bolt) is 10 px.

## Colour tokens (`MC`)

Only the BGI palette or a mix of two palette colours: body `P.accent`, highlight `P.green` mixed 22 percent with white, shade and edge = accent mixed 42 and 62 percent with ink, plate = ink mixed with panel, eyes `P.white`, iris `P.cyan`, brows `P.green`, mouth interior = red mixed 38 percent into ink. A test fails if a hex literal appears in module.mjs.

## The rig record (this is the contract with t4.2 to t4.4)

`makeRig(overrides)` returns one plain object. Shallow-merged one level deep. All angles in radians, all lengths in units.

| Field | Meaning |
|---|---|
| `x, y, tilt, sx, sy` | hop offset (units), lean, squash and stretch about the ground line |
| `ringRot` | the ring turns, the face does not (rim light stays fixed on screen) |
| `eyeL, eyeR` | `{open 0-1, lx -1..1, ly -1..1, tilt (+ angry), lower 0-1 (happy squint), size 0.6-1.25, pupil 0.4-1.5}` |
| `browL, browR` | `{y -0.12..0.14 (negative = up), tilt (+ angry), x}` |
| `mouth` | `{w 0.6-1.35, open 0-1, smile -1..1, round 0-1, tongue 0-1, teeth 0-1}` |
| `armL, armR` | `{j: [shoulder, elbow, hand] in units, front: draw over the body, hand: rotation}` build `j` with `armJoints(side, a1, a2)` |
| `legL, legR` | `{j: [hip, knee, ankle], foot}` build with `legJoints` |
| `antenna, glow` | bend and cyan glow |
| `cheek, shadow` | blush 0-1, ground shadow 0-1 |
| `hide, explode` | skip parts by name (`PARTS`), per-part `{dx,dy,rot,s}` offsets (build-ups, exploded views) |

Arm and leg angle convention: 0 = pointing straight down, +PI/2 = straight out to the side, +PI = straight up; the left side is mirrored for you. `fk(origin, lens, angles)` is the generic version.

`validateRig(rig)` clamps everything into the range the art survives (eyes inside the plate, mouth inside the plate). Call it after any procedural animation.

## API

`drawMascot(ctx, rig, {x, y, u, alpha, silhouette, only, limb})` (x,y = body centre in px, u = px per unit, default 230), `gearPoints / gearPath`, `mouthGeometry`, `drawTube` (a tapered tube from overlapping discs: it never pinches at a bend), `armJoints / legJoints / fk`, `worldToBody`, `revealParts(rig, t, {part:[t0,t1]})` (pop-in about each part's own centre), `drawGuides` (blueprint circles), `groundShadow`, `SPEC`, `MC`, `PARTS`, `PART_CENTER`.
`limb: {arm, leg}` lets t4.2 swap in its own limb renderer.

## Technique: how to draw a mascot that looks designed

1. Start from the silhouette. Fill it solid white (`silhouette: true`) at 64, 40 and 28 px. If it reads as a germ, a flower or a blob, fix the outline before touching the face.
2. Build every part as its own path with its own pivot, so each part is a handle. If two things always move together, still keep two paths.
3. Draw order is fixed: legs, back arms, antenna stem, ring, bolts, plate, cheeks, eyes, brows, mouth, gloss, antenna ball, front arms.
4. One light direction (top left). The gradient and the rim light stay fixed on screen while the ring turns through them: that is what makes the turn look physical.
5. Every shape has one darker edge copy (offset 0.03 down, or an outline 0.02 thick). That single edge is what stops it looking like clip art.
6. Face detail budget: eyes get two catchlights (big top-right, small bottom-left); the mouth is a single white line closed and a dark-red shape open; nothing else.
7. Pop-ins: parts arrive with `outBack` 2.0 over 0.35 s, 0.05 to 0.1 s apart (`revealParts`). Ring first, face second, limbs last.

## Common failures

- Ring with 10 or more teeth, or thin teeth: it becomes a spore. Keep `teeth` at 8 and tooth height at 19 percent.
- Grey hands: a shade layer drawn without clipping. The shade is clipped to the mitten.
- Mouth "O" with pointed corners: for round shapes the Bezier handles must be vertical at the corners (`kx` goes to 0 as `round` goes to 1). Already handled.
- A pale ring around a squinting or closing eye: lids are clip regions, not painted shapes (painting plate-coloured lids over a clipped eye leaves a fringe). Gloss is drawn over the whole face after the eyes.
- Scale 0 on a part: use `hide`, not `s: 0` (done by `revealParts`).
- Brand: no price, no claim, no competitor on the character; the slogan is in the closer, both lines together.

## QUALITY BAR (measured by test.mjs)

- Ring outline repeats every tooth to 1e-9, radius stays between root and tip, tooth tops and gaps are each 20 to 50 percent of the circumference.
- Reading the ring at mid-tooth radius finds exactly 8 teeth.
- Default silhouette is left-right symmetric to 1 percent.
- Smallest features at hero size: eye 40 px, brow 10 px, bolt 9 px, limbs 26 px.
- Every colour is a palette token or a mix; the BGI mark file is byte-identical to the pinned hash and never imported.
- Each of the 14 parts changes the picture when hidden (each is a real handle); 12 seeded random rigs render byte-identical twice.
- Demo: 1080x1920, 7.5 s, silent, QC pass, nothing frozen, closer complete.

## Run it

```
cd skills/t4_1_vector-mascot-design
node test.mjs                  # full size, about 1 minute
ANNIE_PREVIEW=1 node test.mjs  # 540x960, faster
```
Writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/test_result.json`.

## What the demo shows (7.5 s)

0.15 s hook "Meet Cog." / "Built from shapes." 0.2 to 1.1 s blueprint circles and the ring traced by a green line, then filled. 1.0 to 2.05 s parts pop in. 2.0 s Cog waves hello. 2.15 to 4.4 s four groups light up with a label (eyes and brows, mouth, arms and legs, ring and antenna), each doing its own move. 4.4 s the standard closer, with Cog waving under the footer.
