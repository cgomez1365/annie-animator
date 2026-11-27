---
name: 2d-rigging
description: Rigs Cog (the BGI mascot) with bones, forward kinematics, two-bone IK, linear-blend skinning of vector limbs, a library of 12 named poses and walk and hop cycles whose feet stay planted. Use whenever a character must move its body, reach for or point at something, wave, walk, hop, squash or stretch, keep its feet on the floor while the body moves, or blend between poses, even if nobody says "rig" or "IK".
---

# 2D rigging (t4.2)

Prerequisites: t4.1 vector-mascot-design (the rig record and `drawMascot`), t0.1 easing-and-springs, t0.2 timeline-and-seeded-rng (poses are blended with `E`).
Code: `module.mjs`. Demo: `demo.mjs` (7.5 s). Test: `node test.mjs` (118 checks).

## When to use

Any time a character's body, arms or legs move. You never set arm joint positions by hand: you give a pose (angles) or a target (IK) and `poseToRig` writes the t4.1 rig record. Faces are t4.3, mouths t4.4: they write into the same rig, so everything composes.

## Concepts in plain words

- **Angle convention** (same as t4.1): 0 = pointing down, +PI/2 = straight out to the side, +PI = straight up. The left side is mirrored for you, so "a1 = 1.5" lifts both arms out.
- **FK** (forward): you set the angles, the hand lands where it lands. Good for waves, swings, anything with a rhythm. `solveSkeleton(COG_BONES, {armR1: 0.5})` runs a bone tree where a forearm inherits its parent's turn.
- **IK** (inverse): you set where the hand or foot must be, the elbow or knee is solved. Good for reaching, pointing, planting a foot. `twoBoneIK(origin, a, b, target, prefer)` is analytic (law of cosines, no iteration, exact). `prefer` is the direction the elbow or knee bulges toward: arms `[side*0.6, 0.8]` (out and down), legs `[side*0.9, 0.2]` (out). If the target is out of reach the chain stretches straight at it and `reached` is false.
- **Skinning**: a limb is one outline bound to two bones. Each outline point has a weight on bone 2 that rises smoothly across a blend zone of +-0.10 unit around the elbow (`bindSkin`, `poseSkin`: linear blend skinning). A joint disc covers the pinch on the inside of a hard bend. `SKINNED` is the ready-made renderer: `drawMascot(ctx, rig, {limb: SKINNED})`.

## Recipes

### Make a pose and draw it
```js
import { POSES, poseToRig, SKINNED } from './module.mjs';
import { drawMascot } from '../t4_1_vector-mascot-design/module.mjs';
drawMascot(ctx, poseToRig(POSES.wave), { x: 540, y: 1000, u: 240, limb: SKINNED });
```
12 poses: `idle wave cheer point shrug think hips crouch tall lean surprise slump`. Make more with `pose({armR: {a1, a2}, y, tilt, sx, sy})`.

### Move between poses
`poseTrack([[0,'idle'], [0.5,'wave','outBack'], [1.6,'idle']])(t)` returns a Pose. The ease belongs to the segment arriving at the key: `outBack` overshoots into the pose (follow-through for free). Anticipation: put a small opposite move 0.15 to 0.2 s before the main one (`crouch` before a `cheer`, the arm drops 0.1 rad before a wave). Hold a pose at least 0.25 s before the next move or it reads as twitching. Never hold exactly still: add `antenna` sway, a 0.015 sy breath (see t4.1).

### Reach for something (IK)
```js
const a = armIK('R', [orbX - body.x, orbY - body.y]);   // target in body units, minus the body offset
pose({ armR: { a1: a.a1, a2: a.a2 } })
```
Keep targets inside 0.64 (arm reach) of the shoulder, which is at (+-0.84, 0.14). Arms in front of the body (hand on chin, hands on hips) need `front: 1`: `POSES.think` and `POSES.hips` show it.

### Plant a foot while the body moves
`legIK(side, [footWorldX, GROUND_ANKLE], [bodyX, bodyY], tilt)`: the foot target is in floor coordinates, the body offset and lean are subtracted for you. Ankle height on the floor = `GROUND_ANKLE` (ground line minus the shoe, 1.397). At full height the legs are already straight (Cog has short legs on purpose), so a walk starts from a small crouch (0.125) to leave room for a stride.

### Walk (waddle) cycle
`walkPose(phase, {stride: 0.5, lift: 0.16, crouch: 0.125, bob: 0.035, waddle: 0.07})`, phase 0..1 per step pair.
- Period 0.55 to 0.7 s per cycle (0.62 default). Faster than 0.5 s looks frantic, slower than 0.9 s looks tired.
- Body speed that keeps the feet from sliding: `walkSpeed(stride, period) = 2 * stride / period` units per second (1.6 u/s at stride 0.5, period 0.62). Distance = `2 * stride * phase`.
- Stance (phase 0 to 0.5 for the left foot): the foot moves back at exactly body speed so it is fixed on the floor. Swing: it lifts 0.16 and steps forward with `inOutSine`. The right foot is half a cycle behind.
- Body bobs 0.035 (highest at mid-stance), tilts 0.07 rad (the waddle), arms swing against the legs.
- Roll the ring with the ground: `ringRot = rollRot(distance)` (ratio 0.5 = readable roll).
- To stop: ramp the speed to 0 over 0.3 s and blend the pose to `restPose()` over 0.35 s (demo does this).
- Scroll ground ticks backwards at body speed so the planted feet are visible (demo does this).

### Hop cycle
`hopPose(phase, {height: 0.85, crouch: 0.2})`, 0.9 to 1.0 s total. 0 to 0.22 anticipation (sink, squash to 0.84, arms back), 0.22 to 0.32 launch (stretch to 1.14), 0.32 to 0.72 flight (parabola, feet tucked, ring spins a quarter turn of teeth), 0.72 to 0.82 landing squash (0.86), 0.82 to 1 damped settle. Feet stay on the floor whenever the body is low enough to reach it. Keep `height` under 0.5 in a card that has text above the character: flight height is height x u px.

### Squash and stretch
sx = 1/sy (keep volume). 0.84 to 0.86 squash, 1.14 stretch, never more than 1.2. Pivot is the ground line (done by `drawMascot`).

## API

`COG_BONES, solveSkeleton, twoBoneIK, armIK, legIK, bindSkin, poseSkin, tubeOutline, polyArea, SKINNED, restPose, pose, POSES, blendPoses, poseTrack, poseToRig, walkPose, walkSpeed, walkFootWorldX, hopPose, rollRot, drawSkeleton, GROUND_ANKLE`.
`drawSkeleton(ctx, rig, {x,y,u,alpha})` overlays bones (cyan), joints (white, elbow and knee orange) on a drawn Cog: use it in tutorials and tests.

## Common failures

- Arms or legs that "pop" between poses: you blended angle poses with IK targets. Resolve IK to angles first (`armIK`, `legIK`) and blend the angles, which is what `POSES` does.
- Feet that slide: body speed is not `2 * stride / period`, or the ankle target moves in body space instead of floor space. Use `legIK` with the body offset.
- A knee that bends the wrong way: wrong `prefer`. Use the defaults.
- Leg IK out of reach (reported `reached: false`, leg straightens and the foot lifts off the floor): the stride is too long for the crouch. Stride 0.5 with crouch 0.125 is tested over 400 phases; a longer stride needs a deeper crouch.
- Walk and hop text collisions: flight height x u plus the antenna can reach a header. Check `bodyY - 1.3u - height*u` against the safe zone.
- Frozen hold: add antenna sway and the breath even when the pose is held.

## QUALITY BAR (measured by test.mjs)

- IK end effector within 1e-9 of any reachable target, bone lengths kept to 1e-9, angles reproduce the target through `fk`; unreachable targets are reported and straightened.
- Skinning: rest pose reproduces the outline exactly (1e-12); points far from the elbow move rigidly with their bone (1e-9); area kept above 90 percent at a 90 degree bend and above 80 percent at 92 degrees plus; no outline edge stretched more than 1.7x.
- Walk: stance foot's floor position constant to 1e-9 over its whole stance; ankle on the floor to 1e-6 in stance; swing foot peaks at the lift height; no foot below the floor; all legs within IK reach; cycle loops.
- Hop: apex within 0.02 of the requested height; sinks and squashes before leaving, stretches at launch, squashes on landing; feet off the floor in flight, on it in the crouch.
- 12 poses, all finite, all different, hands within 2.1 units.
- Demo: 1080x1920, 7.5 s, silent, QC pass, nothing frozen.

## Run it

```
cd skills/t4_2_2d-rigging && node test.mjs        # about 1 minute
```

## What the demo shows (7.5 s)

0.15 s hook "Bones first. / Then the skin." Cog walks in place with the skeleton overlay on, the ground ticks sliding back at exactly body speed. 2.2 s "IK reach": two orbs circle at the sides, both arms follow them with IK, the eyes follow the orb, the body sways and dips while the feet stay put. 3.45 s "Hop cycle": crouch, launch, flight with the ring spinning, landing. 4.4 s closer, Cog cheering under the footer.
