---
name: karaoke-captions
description: Burns captions into a vertical video with a word-by-word karaoke highlight (spoken words white, the current word wiped green as it is said, upcoming words grey) at y 1470 in 52 px inside the TikTok/Reels safe zone, and writes the .srt from the very same timings. Use whenever a video has a voice and needs captions, subtitles, a read-along or an .srt export, when captions must follow the spoken words, or when a caption layout has to be checked against the safe zones, even if the request only says "add subtitles".
---

# Karaoke captions (t5.4)

Prerequisites: t5.1 (word times), t0.3 (render pipeline). Code: `module.mjs`. Demo: `demo.mjs` (captions on a real Kokoro sentence pair, the .srt cues lighting in a window as each caption plays).

## When to use

Every voiced video. The CEO's lessons have burned-in captions (`render.mjs drawCaption`: 52 px, y 1470, pill) and an `.srt`. This skill keeps that look and adds the word highlight, from word times that come from t5.1 (`buildTimeline(...).sentences[k].words`). One timing source feeds the pixels and the file, so they cannot disagree (measured: 2454 of 2454 sample times).

## The look (numbers from `STYLE`)

- Font Inter 700 (the lessons use SF Pro Display 700), **52 px**, line height 70 px, at most 2 lines, centred on **x 500** (not 540: the TikTok action rail covers x >= 940 for y 800-1580; the pill's right edge stays under 940, measured 920).
- Caption block centred on **y 1470**. A 2-line pill is 168 px high: y 1386-1554, inside the safe zone (nothing from y 1580 down). A 1-line pill is 98 px (y 1421-1519).
- Pill: `rgba(10,12,16,0.74)`, radius 24, padding 32 px sideways / 14 px up and down, 2 px edge `rgba(255,255,255,0.10)` so it reads on dark grounds.
- Words: spoken `#f8fafc`, the current word `#19e08f` wiped left to right over its own duration (clip rect = width x p), upcoming `#94a3b8`. The current word pops to 105% over 0.18 s (`sin` curve) at its start. In a pause the last word stays fully green until the next one starts.
- Entrance: alpha `outCubic` over 0.12 s and a 10 px rise; exit: 0.1 s fade. Nothing else moves, the highlight is the motion.
- Contrast: grey on the pill is about 7:1, green about 9:1 (QC passes at 3:1).

## Technique

1. **Words:** `tl = buildTimeline(rows, {analyze:true})`, `words = tl.sentences.flatMap(s => s.words)` (t5.1). Word times inside a clause are estimates (+-0.1 s); the first and last word of each clause are measured.
2. **Chunks:** `chunkWords(words, {measure})`. Always break after `. ? !`; break after `, ; :` once the chunk has 3+ words (so "Yes, and then we go." is one chunk, not an orphan "Yes,"); join short soft parts forward up to 8 words; a run longer than 8 words, or one that would wrap to 3 lines at 780 px, is cut into two balanced halves. `measure = measurer(ctx)` gives pixel widths in the caption font.
3. **Timing:** `timeCaptions(chunks, {lead:0.08, hold:0.3, minShow:0.8, gap:0.02})`: a caption appears 0.08 s before its first word, stays 0.3 s after the last, is on screen at least 0.8 s, never overlaps the next, never cuts its own last word short; continuous speech swaps in one frame. `makeCaptions(words)` does steps 2-3.
4. **Layout once:** `layoutAll(ctx, caps)` in `init()`. `layoutCaption` wraps greedily, then BALANCES two lines (the shorter line is at least 45% of the longer; no one-word orphan like "none." on line 2) and returns every word's x and width plus the pill box.
5. **Draw:** `drawCaptions(ctx, t, caps, {layouts})` in the card's `frame(t)` after everything except the closer. It returns the state (`captionState`: caption k, word i, progress p, alpha a), handy for syncing other elements.
6. **Hide where the picture needs the space:** do not call `drawCaptions` (or pass captions without the last chunk) on the end card; the closer covers y 1100-1230 anyway.
7. **.srt:** `toSrt(caps)`: one cue per caption with the caption's own start and end (millisecond rounding: `HH:MM:SS,mmm`). `parseSrt` reads one back. Write the file next to the video with the same base name.
8. **Reading speed:** `readingStats(caps)`: characters and words per second on screen. Measured on 5 lesson sentences: at most 20.0 characters/s, 4.2 words/s, shortest caption 0.99 s. Keep under 25 characters/s; if a caption is too fast the sentence is too long, split the sentence in the script.

## Module API (`module.mjs`)

`STYLE`, `chunkWords`, `timeCaptions`, `makeCaptions`, `measurer`, `layoutCaption`, `layoutAll`, `captionState`, `drawCaptions`, `srtTime`, `toSrt`, `parseSrt`, `readingStats`.

```js
const words = tl.sentences.flatMap(s => s.words);
const caps = makeCaptions(words, { measure: measurer(ctx) });
const lay = layoutAll(ctx, caps);                      // in init()
drawCaptions(ctx, t, caps, { layouts: lay });          // in frame(t)
fs.writeFileSync('lesson.srt', toSrt(caps));
```

## Common failures

- **Centre at 540:** the pill reaches x 962 and sits under the action rail. Use `cx: 500`.
- **Three lines:** the pill grows to 238 px and its top goes above 1350 into the thumb zone. `chunkWords` prevents it; if you change the font size, re-run the test.
- **Captions that lead the voice:** a word highlighted before it is said looks wrong, a word 0.1 s late looks fine. `lead` stays 0.08 s; do not raise it.
- **Highlight stepping instead of wiping:** drawing the whole word green at its start reads as a blink at 52 px. Keep the wipe.
- **Text drawn on a small layer:** the engine checker cannot read it. Draw captions on the main canvas (the module does).
- **Rounding drift in the .srt:** do not re-time cues for the file only; use `toSrt(caps)` of the same `caps` the video drew.
- **Numbers and symbols in the script:** the caption shows exactly the sentence text; Kokoro says "forty percent" for "40%". Write the spoken form in the script (the lessons already do).

## Quality bar (measured; `test.mjs` fails below it)

- Every word appears once, in order; no chunk over 8 words; no full stop inside a chunk; a 14-word run is cut; "Yes, and then we go." stays whole.
- Captions ordered, no overlap, appear at most 0.1 s before the first word, on screen at least 0.5 s (measured 0.99), at most 25 characters/s (measured 20.0).
- Layout: at most 2 lines, balanced, pill y 1386-1554 (inside 1250-1580), right edge 920 (under 940), no word past x 930.
- State machine: mid-word p between 0.3 and 0.7; a pause keeps the last word lit (p = 1); nothing before the first or after the last caption.
- .srt round trip within 0.6 ms; video and .srt agree at all 2454 sample times.
- Pixels in the frames the card draws: at mid-word the current word has green pixels, an earlier word is white and not green, a later word is grey and not green; halfway through a word the left 40% is green and the right part is not.
- Against the audio of `out/demo_av.mp4`: the first word turns green 50 ms after the voice is heard (one frame plus the first sliver of the wipe), "Most" after the pause 27 ms after it is heard; both inside the 60 ms bar.
- Card: 1080x1920, 7.8 s, engine QC pass (warnings only: the engine flags any text in the Reels caption band y 1250-1580, which is where captions must sit, and text in motion under 42 px).

## Run it

```
cd skills/t5_4_karaoke-captions
node test.mjs                  # about 1.5 min, exit 0 only if all pass
ANNIE_PREVIEW=1 node test.mjs  # 540x960
```
Outputs in `out/`: `demo.mp4` (silent), `demo_av.mp4` (with the voice), `demo.srt`, `lesson_fixture.srt` (captions for the 5 fixture sentences), `contact.png`, `qc.json`, `test_result.json`. Fixtures: 5 Heart sentences (`fixtures/s03,s05,s07,s08,s09.wav`, `lesson.json`).

## Not verified

- Word times inside a clause are estimates (see t5.1): on a long clause the green wipe can sit up to about 0.1-0.15 s off a word's true start. Clause starts and sentence ends are measured.
- The pill is nearly invisible on the dark BGI ground by design (only the 2 px edge shows). Over a busy picture or a bright scene, contrast was not tested.
- Only English, Heart, 52 px. A word wider than 780 px (a long URL) is not handled.
- No person watched the video; the highlight timing was measured against the audio, not judged by eye in motion.

## Next skills

None in tier 5. The lesson renderer (`ai-training-video/scripts/render.mjs`) still uses its own caption code; swapping this module in is a separate, untested step.
