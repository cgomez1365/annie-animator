---
name: expressions-and-acting
description: Gives Cog (the BGI mascot) a face that acts, with 12 emotion presets, natural blinks, eye darts, a head that follows the eyes, anticipation before a reaction and staggered timing so eyes, brows and mouth break in a wave. Use whenever a character must show a feeling, react to something on screen, look at an object, blink, think, be surprised, be pleased, or hold a face while someone else talks, even if nobody says "expression" or "acting".
---

# Expressions and acting (t4.3)

Prerequisites: t4.1 vector-mascot-design (the face parts and `applyFace` target), t4.2 2d-rigging (body poses go with the face), t0.1 easing-and-springs, t0.2 timeline-and-seeded-rng (blink schedule uses the seeded rng).
Code: `module.mjs`. Demo: `demo.mjs` (7.5 s). Test: `node test.mjs` (75 checks).

## When to use

Whenever the face is on screen for more than a second. A face that never changes reads as a mask; a face that changes all at once reads as a slideshow. This skill makes the three things people notice: eyes that blink and look, a reaction that winds up and pops, and a face that arrives part by part. Mouths for speech are t4.4; this skill holds the face the mouth sits in.

## The data

A face = `{eyeL, eyeR, browL, browR, mouth, cheek}` (the face half of the t4.1 rig). `faceFor('joy', 1)` gives one; `applyFace(rig, face)` writes it into a rig; `validateFace` clamps it. Conventions: brow and eye `tilt` + = angry (inner end down), - = worried (inner end up); eye `lower` = happy squint; brow `y` negative = raised; mouth `smile` -1..1.

## The 12 emotions and what makes each one read

| Emotion | What carries it |
|---|---|
| neutral | small smile, eyes open, brows level |
| happy | lower lid 0.25, brows up a hair, smile 0.8, cheeks glow |
| joy | lower lid 0.42, wide open mouth with tongue, cheeks full |
| sad | brows worried (tilt -0.45), eyes 72 percent open and looking down, big pupils, frown |
| angry | brows and lids tilted in (0.45 to 0.5), pupils small, teeth |
| surprise | eyes 1.2 size with small pupils, brows up 0.11, round mouth |
| scared | like surprise but worried brows, small flat mouth, eyes looking up a little |
| think | eyes up and sideways, one brow up one down, flat small mouth |
| smug | eyes 62 percent open, one brow raised, closed smile |
| sleepy | eyes 28 percent open, brows low, small round mouth |
| confused | uneven eye sizes, brows tilted opposite ways, crooked wobbly mouth |
| determined | eyes narrowed and tilted in, brows tilted, flat mouth |

Brows do most of the work: take the brows away and sad, angry and scared become the same face. Eyes second, mouth third. `readFace(face)` returns `{valence, arousal}` (-1..1) so a custom face can be checked: if you meant "sad" and it reads positive, fix the face. `intensity` 0 to 1.3 scales any emotion (1.3 = exaggerated, the art clamps it).

## Blinks (`blinkTimes`, `blinkAmount`, `applyBlink`)

- Gaps 2.2 to 5.0 s, mean about 3.6 s (tested over 300 s). 15 percent are double blinks 0.28 s apart. Seeded: same seed, same blinks.
- Shape: shut in 0.06 s (`inQuad`, falls fast), held 0.03 s, open in 0.11 s (`outQuad`, eases back). Total 0.20 s = 6 frames. Opening slower than closing is what makes it alive.
- Add a blink on every big look (`gazeShiftTimes(keys)` lists them) and on a change of emotion; people blink during a large gaze shift.
- `applyBlink(rig, closed)` caps `open` at `1 - closed` and keeps the lid tilt, so an angry face blinks angry.
- Never blink during the 0.2 s after a surprise pop: wide eyes are the whole beat.

## Eye darts (`gaze`, `gazeShiftTimes`, `headFollow`)

`gaze([[t, lx, ly], ...])(t)` returns `{lx, ly}` in -1..1. Each change is a saccade: 90 percent done in 0.08 s (`outCubic`, 2 to 3 frames), then the eyes hold with a tiny drift (sd about 0.01 to 0.02) so they are never dead. Slow smooth gazes look like drifting; real eyes snap. Hold each target 0.4 s or more so it reads. The head follows the eyes: `headFollow(g, t)` is a lean (max 0.07 rad) that trails the eyes by 0.12 s: eyes first, head after.

## Acting beats (`actFace`, `actBody`, `checkBeats`)

```js
const BEATS = [
  { t: 1.15, emo: 'surprise', dur: 0.16, ease: 'outBack', anticipate: 0.15, pop: 0.2 },
  { t: 1.95, emo: 'think',    dur: 0.22 },
  { t: 2.80, emo: 'joy',      dur: 0.18, ease: 'outBack', pop: 0.14 } ];
applyFace(rig, actFace(t, BEATS));       // the face
const b = actBody(t, BEATS);             // add b.y, b.sy, b.sx to the body pose
```
What each field does:
- `t` the moment the new face starts to appear. `dur` how long it takes to arrive: 0.12 to 0.25 s (4 to 7 frames). Faster than 0.1 s is a cut, slower than 0.3 s is a drift.
- **Stagger** (`DELAYS`): eyes start at 0, brows +0.04 s, mouth +0.07 s, cheeks +0.10 s. The face "breaks" in a wave. Tested: at 0.1 s the eyes are further along than the brows, and the brows further than the mouth.
- `ease: 'outBack'` makes the reaction overshoot and settle (surprise, joy, a pop). `outCubic` for slow feelings (sad, think).
- **Anticipation** (`anticipate: 0.12 to 0.18`): before a big reaction the face winds up (eyes narrow to 78 percent, brows drop, mouth closes) and the body squats 0.05 (`actBody`), like a dip before a jump. `windUp(face)` is relative, so it works from any face. Use it for surprise, joy, anger; skip it for sad and sleepy.
- `pop`: a damped hop on the reaction, 0.12 to 0.2 units. It decays (`exp(-4.5u)`), 3 bounces at most.
- Space beats at least `dur + 0.2` s apart (a face needs 0.2 s to be read). `checkBeats(beats)` returns the problems.
- Hold the final face at least 0.3 s. Reaction chain that works at 28 s card pace: notice (0.5 s) then wind-up (0.15) then react (hold 0.6) then think (hold 0.8) then resolve.

## Rules of thumb

- The eyes go first, then brows, then mouth, then body.
- Every strong emotion gets a wind-up in the opposite direction and an overshoot into the pose.
- Never hold a face dead: drift in the gaze, antenna sway, breath (t4.1/t4.2 handle those).
- One idea per face. A face that shows joy and worry at once reads as nothing.
- A face is on screen for at least 6 frames to be read at all.
- At u under 100 px the face carries only eyes open or shut and smile or frown. Do not rely on brow tilt there.

## Common failures

- All parts change on the same frame: set `DELAYS`, do not set all parts to the same progress.
- Reaction without wind-up reads as a glitch; wind-up without a hold afterwards reads as a stutter. Hold at least 0.3 s.
- Lids that tilt but never blink: `applyBlink` after `applyFace`, every frame.
- Gaze that tracks smoothly: use `gaze`, not an eased lerp.
- Beats closer than `dur + 0.2`: `checkBeats` flags it.

## QUALITY BAR (measured by test.mjs)

- 12 emotions, all inside the art's safe range; every pair of faces differs in pixels; `readFace` puts each emotion in its expected quadrant.
- Blinks: seeded and deterministic; gaps 2.2 to 5.0 s, mean 3 to 4.4 s; 5 to 30 percent doubles at exactly 0.28 s; shut at 0.06 s, open again at 0.20 s; closing faster than opening; covers 7 frames or fewer at 30 fps and reaches at least 0.9; eyes closed past half under 6 percent of the time.
- Gaze: a dart is 90 percent done in 0.08 s; holds drift (sd 0.003 to 0.03); the head trails the eyes by 0.08 to 0.2 s.
- Beats: parts arrive in order eyes, brows, mouth; wind-up narrows the eyes and hands over to the reaction without a jump (under 0.01); outBack overshoots and settles; no value changes by more than 0.25 in 1/120 s; body squats then hops then settles.
- Demo: 1080x1920, 7.5 s, silent, QC pass, nothing frozen.

## Run it

```
cd skills/t4_3_expressions-and-acting && node test.mjs     # about 1 minute
```

## What the demo shows (7.5 s)

0.1 s hook "Blink. Look. React." Cog blinks, a glowing orb pops in, Cog's eyes dart to it (a dashed gaze line) and the head follows, a wind-up squat at 1.0 s, then the surprise pop at 1.15 s (outBack, hop). 1.5 s header "Eyes lead. The face follows." with a label per feeling: Surprise, Think (eyes up and left, one brow up, hand to the chin), Joy at 2.8 s (the orb flies into Cog's hand, arms up, antenna lights). 4.4 s closer, a small joyful Cog under the footer.
