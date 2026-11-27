---
name: lip-sync
description: Makes Cog (the BGI mascot) speak in time with a voice track. Decodes the audio with ffmpeg into a loudness envelope, splits the spoken text into syllables with a vowel class, places each syllable on the audio, and returns mouth shapes (11 visemes) for any time t, with lead, smoothing and closed lips in silences. Use whenever a character must talk, a Kokoro or other voice-over has to drive a mouth, captions and a face must match, or someone asks for "lip sync", "talking head", "make it say the line" or "mouth shapes", even if they only say "make Cog talk".
---

# Lip-sync (t4.4)

Prerequisites: t4.1 vector-mascot-design (the mouth parameters), t4.3 expressions-and-acting (the face the mouth sits in), t0.2 timeline-and-seeded-rng. Needs ffmpeg (engine default, `ANNIE_FFMPEG`).
Code: `module.mjs`. Demo: `demo.mjs` (7.5 s). Test: `node test.mjs` (67 checks, uses the real Kokoro tracks, read-only).

## When to use

Any card where the character talks and a voice file exists (or only its text). No speech recogniser is used: the timing comes from the audio, the mouth shapes come from the text. That is accurate enough for a cartoon mouth (about 30 ms on clean tracks) and needs no model download. The video itself stays silent; the voice is layered later (see ANNIE_CONTEXT: voice is a separate layer).

## The pipeline in plain words

1. **Decode**: `decodeAudio(file)` runs ffmpeg to mono 16 kHz float samples. Any format ffmpeg reads.
2. **Envelope**: `loudness(samples, rate)` gives loudness every 10 ms (25 ms RMS window, in dB, 95th percentile = 1, 35 dB below = 0, 3-frame smoothing). Clean Kokoro silence reads exactly 0.
3. **Segments and peaks**: `speechSegments` (voiced stretches, short gaps bridged) and `energyPeaks` (a vowel is a loudness peak, about one per syllable).
4. **Syllables**: `syllabify(text)` splits words by vowel groups with fixes (silent e, `-ed`, `-es`, `-le`, `qu`), `PRONOUNCE` (BGI is "bee jee eye") and `SYLLABLE_OVERRIDES` (video, idea, being ...). Each syllable has a vowel class (AH EH EE OH OO), an onset shape (MBP, FV, SH, OO, TH, SS or none) and a lip-closing coda (m b p f v).
5. **Align**: `alignSyllables(A, syls)`: dynamic programming matches speech segments to runs of syllables (energy share, preferring to end where the text has a full stop). Inside a segment: if the peak count equals the syllable count the peaks are used as they are, otherwise an energy CDF spreads the syllables and each snaps to the nearest unused peak within 70 ms.
6. **Keys**: `visemeKeys`: onset shape 0.06 s before the vowel, vowel held around its centre (opening scaled by loudness), coda closure after. Lip closures (MBP) last at least 0.1 s (3 frames); other shapes at least 0.05 s.
7. **Track**: `makeMouthTrack(A, text, {lead, blend, gain})` returns `{mouthAt(t), visemeAt(t), keys, aligned, segments}`. `mouthAt(t)` is a pure function that returns `{w, open, smile, round, tongue, teeth}`; assign it to `rig.mouth`.

```js
import { analyzeAudio, makeMouthTrack } from './module.mjs';
const A = analyzeAudio('/path/voice.wav');
const track = makeMouthTrack(A, 'Be the cog in the machine.');   // text exactly as spoken
// per frame:  rig.mouth = { ...rig.mouth, ...track.mouthAt(t) };
```
No audio yet? `makeMouthTrack(null, text, {sps: 4.2})` spaces syllables at 4.2 per second (about 160 words per minute) with 0.3 s after a full stop and 0.15 s after a comma. Good for a storyboard; replace it with real audio before final render.

## The 11 visemes (`VISEMES`)

| Shape | Letters | Look |
|---|---|---|
| rest | silence | closed, small smile |
| MBP | b p m | lips pressed, flat line |
| FV | f v | top teeth on the lip, small gap |
| AH | a (father), short u | jaw wide (open 0.85) |
| EH | e, ai, ay | half open, wide |
| EE | ee, ea, i, y | narrow slit, wide smile, teeth |
| OH | o | round, medium |
| OO | oo, ou, w | small round |
| TH | th l t d n | tongue behind the teeth |
| SS | s z soft c x | teeth together, small slit |
| SH | sh ch j | lips pushed out |

Few, strongly different shapes: more than about 12 reads as chewing. The test checks every pair differs in pixels (closest pair: rest and MBP, mean difference 2.7 levels per pixel). The jaw opens AH > EH > EE; the loudness of the syllable scales it.

## Tuning (the four numbers that matter)

- `lead` 0.05 s (1.5 frames): the mouth moves BEFORE the sound. If it looks late, raise it to 0.08; if it looks early, lower it to 0.02. People forgive early far less than late.
- `blend` 0.09 s: vowels take 3 frames to arrive. MBP takes 0.06 s (2 frames), teeth and tongue shapes 0.07 s.
- `gain` 1: scales jaw opening (0.7 for a quiet character, 1.2 for a shouter).
- Silence: when the envelope has been under 0.18 to 0.38 for 60 ms the mouth closes to rest within 0.1 s. Measured on tt1: maximum opening in gaps is 0.005.

Rules of thumb: always show MBP for at least 3 frames; do not show a shape shorter than 2 frames unless it is a lip closure; the head bobs on stressed syllables (demo: body `y -= 0.018 * env`); eyes keep blinking (t4.3) and the brows lift slightly on loud syllables.

## Text rules

- Write the text exactly as it is spoken: numbers and symbols as words ("eighteen plus"), add a full stop where the voice pauses. The aligner uses punctuation to prefer segment boundaries, so a missing full stop at the end of a line costs accuracy.
- Add odd words to `PRONOUNCE` (spelling as it sounds) and miscounted words to `SYLLABLE_OVERRIDES`. Hiatus words (video, radio, idea, area) must be in the override table.
- Sentence-final pauses of 0.3 s or more split segments; the 0.15 s comma pause does not (the voice often does not stop for a comma).

## What was measured (test.mjs)

- Syllable counts correct for 99 of 99 words in the test list. Caution: I chose the list after seeing the rules fail on a few words and added overrides for them, so treat this as 95 percent or so on unseen text, not 100.
- Speech segments start and end within 0.12 s of the measured times in the VO scripts for 36 of 39 script rows across 8 Kokoro tracks (worst miss 1.67 s, a row the script lists as one beat but the voice splits). Alignment of first and last syllable of every row of 6 more tracks: 29 of 29.
- Synthetic signal with known syllable times: worst rms error 6 ms, worst single error 20 ms. This is the easy case (clean bumps), so it proves the code, not the accuracy on speech.
- tt1 (Heart voice, 14 s): syllables per speech segment equal syllables per sentence (7, 5, 2, 8, 6, 4, 9); every syllable lies inside a measured phrase window.
- Mouth track on tt1: closed in silences (max opening 0.005), correlation with loudness 0.68 at lag 0 frames, jaw reverses 6 times per second (natural), largest one-frame jump 0.73 (lip closures), all 8 lip closures fully shut within 70 ms.
- NOT measured: lips against video of a real speaker, other voices than Kokoro Heart and Michael, other languages, shouted or whispered speech, music under the voice (analyse the voice track before mixing).

## Common failures

- Mouth chews on every consonant: raise `blend` or merge shapes; only MBP and FV are mandatory shapes.
- Mouth drifts out of sync late in a long track: a syllable count is wrong somewhere. The DP resets at every pause, so drift cannot pass a full stop; look for the segment whose syllable count differs from the sentence (`aligned[i].seg`).
- Mouth moves in music or breaths: analyse the clean voice track, not the mix. Breaths under 0.3 envelope are ignored.
- Numbers: "40%" is read as letters nobody says; write "forty percent".
- Mouth open during a hold at the end: the last key relaxes to rest 0.12 s after its hold; check that the text ends with a full stop.

## QUALITY BAR

All of the measurements above, plus: `mouthAt` pure and deterministic; `lead` shifts by exactly the offset; `gain` scales opening exactly; viseme keys sorted, every key a real viseme; text-only fallback closed before the start and finite after; demo 1080x1920, 7.5 s, silent, QC pass, nothing frozen.

## Run it

```
cd skills/t4_4_lip-sync && node test.mjs      # about 1 to 2 minutes
```
The test and demo read voice-over WAV files from a path set in `VO` at the top of `test.mjs` and `demo.mjs`.

## What the demo shows (7.5 s)

Header "Sound in. Mouth shapes out." A panel with the loudness bars scrolling past a playhead and orange ticks for the syllables the aligner found. Cog says the BGI slogan from the real Heart track (first two lines, 0.16 to 3.74 s): the word being said turns green, the mouth follows, and a row of 11 mouth icons lights the viseme in use. Lips shut on "Be", "machine", "Tools" ... 4.4 s closer with a small waving Cog. The audio is analysed, not included: the MP4 is silent.
