---
name: voice-synced-scenes
description: Makes scenes, highlights and sound effects change on the exact word a Kokoro voice says, by turning each sentence clip into word start/end times (measured speech edges and measured pauses, plus a syllable-weight estimate for the words in between) and giving cue helpers that fire a picture a hair before its word. Use whenever a video has a voice-over and anything on screen should appear, light up or switch "when she says it", when a scene's length must come from the voice instead of a fixed slot, or when captions need word timing, even if the request only says "sync the visuals to the narration".
---

# Voice-synced scenes (t5.1)

Prerequisites: t0.2 (timeline and seeded rng), t0.3 (render pipeline). Code: `module.mjs`. Demo: `demo.mjs` (one real Kokoro sentence drives bars, tags and a voice strip).

## When to use

Any card or lesson where the voice leads. The 28 s TikTok cards fitted a voice into fixed windows and failed. The rule now: **the voice sets the length, every picture fires on its word.** t5.4 (captions) and t5.3 (effects) both take their times from this skill.

## What the pipeline gives you (read before you trust a number)

- Kokoro (kokoro-js 1.2.1, Heart) writes ONE wav per sentence and `durations.json` (`vo.mjs lesson`). That is all it gives: the ONNX model has a single output, `waveform` (checked 2026-11-19: `outputNames = ['waveform']`). **There are no word timings from the engine.** So word times are built here.
- Heart pads every clip: **0.28-0.33 s of silence before the first word, 0.42-0.51 s after the last** (10 clips measured). The old render.mjs spread words over the whole clip, so the first word was 0.3 s early on average (mean edge error 0.385 s).
- Words INSIDE a clause are an estimate (weights by syllables). Clause edges, the start and the end are measured. Say so in your report.

## Technique

1. **Sentence clock.** `buildTimeline(rows, {pre:0.6, gap:0.45, analyze:true})`. `rows` = durations.json rows (`{text, dur, file}`). Sentence start = `pre + sum(dur + gap)`, exactly as render.mjs does it, so scene lengths match. `analyze:true` decodes each wav and uses the measured speech span and pauses (about 0.1 s per clip). Without it you get the text-only guess (still 0.02 s on the edges).
2. **Word times.** `alignWords(text, dur, clip)`:
   - weight per word = syllables + 0.12 per letter beyond three; pauses guessed at `, 0.22 s`, `; : 0.3`, `. ? ! 0.42` (fitted by hand on Heart).
   - with `clip` (from `analyzeClip(envelope(pcm, sr))`): the speech span is the measured one; every comma/full stop is matched to a measured quiet gap by an order-preserving DP (cost = distance, skip = 0.45 s); extra breaths Kokoro adds where the text has no punctuation are respected too (sentence 4 of lesson 1 has a 0.43 s one); then each stretch between gaps is shared out by weight.
   - result: `[{w, s, e, i, pinned}]` in clip time; `buildTimeline` shifts them to lesson time.
3. **Cues.** `cue(tl, k, 'word', {lead:0.12, nth:0})`: when the word starts minus a 0.12 s lead (the eye needs the picture first; entrances take 0.3-0.4 s anyway, so a 0.12 s lead lands the end of the move on the word). Sound effects use `sfxFromCues(items, 0.12)` = the word itself. A word that is not in the sentence THROWS (render.mjs once fell back to 0 silently).
4. **Pick the word that carries meaning**, not the first of the phrase: pop a chip on the noun, light a row on the verb. Never put two cues closer than 0.25 s apart on the same element.
5. **Hold/lead values that work** (tt10 feel on 30 fps): entrance `outCubic` 0.3-0.4 s; pop `outBack(t,1.6-2.0)` 0.4-0.55 s; stagger of a list 0.09-0.15 s; a stamp lands ON the word (`outElastic`, no lead).
6. **Scene length** = `pre + sum(sentence + gap) - gap + tail` (tail 0.7 s, last scene 3.6 s for the end card). Never fix a scene at N seconds; read it from the timeline.
7. **State for drawing:** `wordAt(tl, t)` gives the word being spoken; `activeItem(cues, t)` gives the last item whose cue has passed (light the current list row).
8. Cards are pure functions of `t`: build the timeline once (in `init()`), draw from it. Never call ffmpeg inside `frame`.

## Module API (`module.mjs`)

`decodeAudio(file, sr)`, `envelope(pcm, sr, hop)`, `analyzeClip(env, {floorDb:-38, pauseDb:-30, minPause:0.08})`, `syllables(w)`, `parseWords(text)`, `alignWords(text, dur, clip?)`, `alignByChars(text, dur)` (the old baseline, for tests only), `buildTimeline(rows, opts)`, `cue(tl, k, word?, {lead, nth})`, `wordAt(tl, t)`, `activeItem(cues, t)`, `sfxFromCues(items, lead)`, `saveTimeline(tl, file)`, `pauseErrors(words, clip, text)`, `muxVoice(video, voice, delay, out)`, `KOKORO_EDGES`.

```js
const rows = JSON.parse(fs.readFileSync('voice/female_heart/durations.json'));
const tl = buildTimeline(rows, { analyze: true });            // lesson time
const popParis = cue(tl, 7, 'Paris');                          // seconds
const rowLit = activeItem([cue(tl,7,'Paris'), cue(tl,7,'Most')], t);
```

## Common failures

- `alignByChars` on the whole clip: first word 0.3 s early, last word 0.5 s late. Always cut the clip's silence (measured or `KOKORO_EDGES`).
- Cue on the first word of a clause when the picture belongs to the noun: reads as early. Cue the noun.
- A different voice (George, Michael): silences differ. Run with `analyze:true`; `KOKORO_EDGES` is Heart's.
- Numbers and symbols: Kokoro says "40%" as "forty percent", but the text has one token. Write numbers as spoken (the lesson scripts already do) or cues drift by a word.
- Sentences with an abbreviation full stop ("U.S.") count as a pause in the text model; a measured gap is not there, the DP skips it (cost 0.45 s) and the guess stays.
- `analyzeClip` thresholds assume a clean synthetic voice with no music under it. Run it on the voice-only clips, never on the mix.

## Quality bar (measured; `test.mjs` fails below it)

- Mean error of the first-word start / last-word end against the measured speech span: text-only under 0.06 s and at least 4x better than the char-share baseline (measured 0.017 s vs 0.385 s on 10 Heart clips).
- Text-only commas and full stops land no farther from the real gaps than the baseline (0.058 s vs 0.082 s mean over 13 pauses).
- With audio: every comma/full stop sits inside its measured gap; words ordered, no overlap, inside the sentence.
- `cue` throws on a missing word; sentence starts equal render.mjs arithmetic (to 1e-9 s).
- Sync in the finished file: in `out/demo_av.mp4` the first word is heard within 30 ms of its cue time and the second sentence within 30 ms (measured 0 ms and 0 ms: same data, so this proves the mux delay and card clock, not the word model).
- Card: 1080x1920, 7.8 s, engine QC pass (warnings only for text in motion under 42 px).

## Run it

```
cd skills/t5_1_voice-synced-scenes
node test.mjs                  # about 1 min, exit 0 only if all pass
ANNIE_PREVIEW=1 node test.mjs  # 540x960
```
Outputs in `out/`: `demo.mp4` (silent card), `demo_av.mp4` (same with the voice), `contact.png`, `qc.json`, `test_result.json`. Fixtures: `fixtures/s00-s09.wav` (16 kHz mono copies of lesson 1 Heart sentences) and `lesson.json`. New voice clips need Kokoro with the sandbox OFF (`ai-training-video/scripts/vo.mjs`); this skill only reads the wavs.

## Not verified

- Word boundaries inside a clause are not independently measured (no ground truth exists: no phoneme durations from the model, no forced aligner installed). Expect up to about 0.1-0.15 s of error on mid-clause words; the 0.12 s lead hides most of it. A forced aligner (e.g. Montreal Forced Aligner) would settle it.
- Only Heart was measured. Not heard by a person.

## Next skills

t5.2 (beat sync), t5.3 (sfx and mix: takes `sfxFromCues`), t5.4 (karaoke captions: takes `buildTimeline` words).
