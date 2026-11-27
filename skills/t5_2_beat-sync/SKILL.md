---
name: beat-sync
description: Finds the beat of a music track (decoded with ffmpeg: onsets, tempo in BPM, beat phase) and uses it to snap cuts and hits to the beat and to drive tempo-locked motion (pulses, bouncing objects, step lights, swing). Use whenever a card or video has music and anything should land on the beat, when cuts or scene changes should feel "on the music", when a visual must pulse at the song's tempo, or when you need the BPM or beat times of one of the three BGI beds (A, D, E) or any new track, even if the request only says "make it feel rhythmic".
---

# Beat sync (t5.2)

Prerequisites: t0.1 (easing), t0.2 (timeline). Code: `module.mjs` (own FFT, no dependencies). Demo: `demo.mjs` (bed A at 108 BPM: step lights, a bouncing ball, scene cuts snapped to the beat, the real onset strip).

## When to use

Music under a card or lesson and a picture that should hit with it. For the training lessons the music is only 10% under a voice, so the beat is a quiet cue: use it for pulses, ticks and scene changes that fall in the gaps between words, never to override a word cue (t5.1 wins when both want the same moment).

## The three beds (known, no analysis needed)

`BEDS` in the module: **A bright pluck 108 BPM** (kick on every beat), **D swing shuffle 100 BPM** (swung eighths, kick 1+3, clap 2+4), **E bossa nova 118 BPM** (syncopated clave). All start on beat 1 at t = 0 of the bed file. `render.mjs` cuts the bed with `atrim=0:total`, so in a lesson the grid is `{bpm, phase: 0}` and beat n is at `n * 60/bpm`. Use those constants for the beds; analyse only unknown tracks. A fade-in runs the first 2 s (beats 1-3 are quiet).

## Technique

1. **Analyse:** `analyzeTrack(file, {from, to})` -> `{bpm, beat, phase, confidence, onsets:[{t,strength}], oe}`. Steps inside: decode to 22.05 kHz mono; STFT 1024 / hop 256 (11.6 ms); log-compressed spectral flux over 0-9 kHz plus a separate under-250 Hz band (kick and bass); subtract the 0.7 s local mean; pick local maxima above 0.12 with parabolic refinement; add `ONSET_DELAY` (25.5 ms, see below).
2. **Tempo and phase:** `estimateTempo(oe)` tries 70-170 BPM in 0.1 steps and every phase in 5 ms steps; score = onset strength on the beats + 0.5 x on the off-beats + 1.5 x the low band on the beats, times a soft prior around 110 BPM. Then an octave check: if the double-speed grid scores at least 90% as well, take it (a bare click track at 140 BPM otherwise reads 70). `confidence` = best score over the median score; under 3 means "do not trust it".
3. **Grid:** `beatGrid(bpm, phase, until)`. Beat n = phase + n*60/bpm. `phase` is the first beat, in [-0.03, beat-0.03).
4. **Snap:** `snapToBeat(t, g, {every, offset})`: `every:1` any beat, `2` half bars, `4` bar lines. `snapCuts(cuts, g, {every, maxShift:0.2, minGap:0.4})` moves each cut to the nearest beat, but leaves it alone if it would move more than `maxShift` (a cut on a spoken word beats the grid), keeps order and a minimum gap. Cut every 2 beats (1.1 s at 108 BPM) for scene changes; every beat only for hits and ticks.
5. **Land on the beat:** a move that takes 0.4 s must START 0.2 s before the beat so its fastest part lands on it (outCubic is half done at 40% of its time). In the demo each page starts at `cut - 0.2`. For a stamp or pop with `outBack`/`outElastic`, start 0.06-0.1 s early.
6. **Tempo-locked motion** (all pure functions of t, so renders are identical):
   - `beatPulse(t, g, {attack:0.06, decay:0.35})`: 1 on the beat, falls with a 0.35-beat time constant; rises smoothly in the last 60 ms. Use `scale = 1 + 0.28 p` for lights, `1 + 0.12 p` for big objects, `glow = p`.
   - `beatBounce(t, g, power=1.6)`: 0 on the beat, 1 half a beat later: a ball dropped on every beat. Pair with a squash `scaleY = 1 + 0.35 * max(0, pulse - 0.55)` at the landing.
   - `beatStep(t, g, n)`: which of n step lights is on (one per beat).
   - `swingTime(slot, g, amount)`: time of eighth-note slots; `amount 1/6` gives bed D's triplet feel (off-beat at 2/3 of the beat). On D, offset off-beat hits with it or they sit stiff against the music.
   - `beatPhase(t, g)` 0..1 inside the beat; `beatIndex(t, g)` beat number.
7. **Never freeze:** a beat-locked element covers the 0.5 s rule on its own; add a slow second mover for the bars between hits.
8. **Check it:** `coverage(expectedTimes, onsets, tol)` says how many expected hits have an onset within tol (default 40 ms) and the mean offset.

## Module API (`module.mjs`)

`BEDS`, `decodeAudio`, `onsetEnvelope`, `ONSET_DELAY`, `pickOnsets`, `estimateTempo`, `analyzeTrack`, `beatGrid`, `snapToBeat`, `snapCuts`, `beatPhase`, `beatIndex`, `beatPulse`, `beatBounce`, `beatStep`, `swingTime`, `coverage`, `envBars`.

```js
const a = analyzeTrack('track.mp3'); const g = { bpm: a.bpm, phase: a.phase };
const cuts = snapCuts([0.85, 2.45, 3.55], g, { every: 2, maxShift: 0.3 });   // [{raw, t, moved, snapped}]
const s = 1 + 0.28 * beatPulse(t, g);
```

## Common failures

- Cutting on the detected `phase` when it is half a beat off (see Not verified: bed E). For the beds, use `BEDS` and phase 0.
- Half-time or double-time BPM from a track with a sparse beat: check `confidence` and listen to a click on the grid (render the grid as ticks, as the demo's strip does).
- Using a clip that starts mid-bar: the grid is still right (phase is a time), but "every 2" counts from the first detected beat, not from beat 1 of the bar. Pass `offset`.
- Variable tempo (live drums, a song with a ritard): one grid cannot follow it. The beds are exact; recorded music may not be.
- Analysing the finished mix with a loud voice on top: voice syllables read as onsets. Analyse the music file alone.
- Motion that starts ON the beat looks late: start 0.2 s early (rule 5).

## Quality bar (measured; `test.mjs` fails below it)

- Synthetic click tracks at 120, 90 and 140 BPM (exact ground truth): tempo within 0.3 BPM, phase within 15 ms, onsets within 20 ms with under 6 ms mean offset.
- Beds A, D, E, each at three start offsets (0, 0.37, 1.9 s): tempo within 0.3 BPM on all nine; A and D phase within 25 ms (measured 1-3 ms); at least 90% (A, D) or 70% (E) of the true beats have a detected onset within 40 ms, mean offset under 10 ms (measured about 1 ms).
- `beatPulse` is 1 on the beat, decays, rises into the next beat, has no jumps; `snapCuts` keeps order and gap and leaves far cuts alone.
- In `out/demo_av.mp4` (the card muxed with bed A, AAC): the audio reads 107.9 BPM, and each of the three snapped cuts is within 30 ms of a beat found in that file (measured 2, 1, 0 ms) and sits on a detected kick onset.
- Card: 1080x1920, 7.8 s, engine QC pass.

## Run it

```
cd skills/t5_2_beat-sync
node test.mjs                  # about 2 min, exit 0 only if all pass
ANNIE_PREVIEW=1 node test.mjs  # 540x960
```
Outputs in `out/`: `demo.mp4` (silent card), `demo_av.mp4` (with bed A), `contact.png`, `qc.json`, `test_result.json`. Fixtures: 16 s excerpts of the three beds (`fixtures/*.wav`, cut so the grid starts at 0).

## Not verified

- **Bed E: the detected beat is exactly half a beat late** (about 253 ms). The clave and bass put louder onsets on the off-beat than the kick puts on the beat (measured: low band 0.42 off-beat vs 0.22 on-beat). Tempo is right (118). Use `BEDS` and phase 0 for E.
- The 25.5 ms onset delay and the "kick lands on the hit" claims come from the synthesized beds and click tracks. Recorded music with soft attacks may read about 10 ms late.
- Only 16 s excerpts were analysed; nobody listened to `demo_av.mp4`.
- Swing: `swingTime` is unit-tested against arithmetic only; it was not compared with bed D's hits.

## Next skills

t5.3 (mix: ducks the bed under the voice, effects land on cues), t5.4 (captions).
