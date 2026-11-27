---
name: ai-training-video
description: Build long-form (2:30-3:30) vertical 9:16 training videos for TikTok / Reels / Shorts from a written script — Kokoro text-to-speech voice (Heart female, Michael male), scenes that change on the exact word they explain, burned-in captions plus an .srt, soft sound effects and a quiet synthesized ambient bed, all rendered in code on the BGI dark look. Use whenever the user asks for a lesson, explainer, training or "AI literacy" video, a course of short educational videos, a voice-over-plus-animation video made from a script, a male/female voice version of the same video, or wants to reuse or extend the Broken Gear Industries AI Training pipeline (lessons 1-40), even if they never mention Kokoro, ffmpeg, canvas or the word "skill".
---

# AI training video lessons

Voice-driven explainer videos, one script in, a finished 1080x1920 MP4 + captions out. Built 2026-11-11 for the BGI "AI Training" course (40 lessons, mid-college level, serious, plain, not hyped). Lesson 1 ("What AI actually is") is the worked example in `examples/`: female (Heart) 2:58, male (Michael) 3:17. Recommended voices: **Heart (`af_heart`) and Michael (`am_michael`)**. Nicole is NOT used: she speaks about 35% slower and turned lesson 1 into 4:20.

## What one video is

- 1080x1920, 30 fps, H.264 + AAC, about 10 MB, 2:30-3:30. Gates: 120-240 s, -18..-14 LUFS, true peak at or below -1 dBTP.
- 5-7 scenes, 3-6 spoken sentences each (about 25 sentences, 440 words). Scenes join with 0.6 s dissolves. The first scene is the hook, the last is a recap, "next lesson" and the BGI end card (slogan, URL, Follow pill).
- Voice: one Kokoro clip per sentence. Captions: burned in at y 1470 (inside TikTok's safe zone), 52 px, up to 2 lines, and exported as `.srt` from the same timings.
- Sound: voice normalized to -16 LUFS; seven soft effects (whoosh at each scene change, pop, tick, chime, stamp, success, wrong) at about 32% of peak; a synthesized upbeat music bed at 10% (the slow ambient pad droned — use an upbeat bed). Three beds used interchangeably: **A bright pluck** (108 BPM), **D swing shuffle** (100 BPM), **E bossa nova** (118 BPM). `render.mjs` rotates them by lesson number (1=A, 2=D, 3=E, ...) or take `--music A|D|E`. Generator: `scripts/music.mjs` (other beds B, C, F, G, H exist in the working folder `samples/music_v2` and `music_v3`). No songs, no samples, nothing to license, nothing to label as AI music.

## Confirm before you build (ask only what blocks you)

1. The lesson's topic and where it sits in the 40-lesson order. Read the previous lesson's `script.json` so "Next lesson:" is true.
2. Voice: Heart and Michael unless told otherwise (the user wants both versions of each lesson; render both).
3. Where it goes: a lesson folder `Lxx_<slug>/` holding `script.json`; output lands in `Lxx_<slug>/out/`.

## The pipeline, in order

Setup once: `scripts/setup.sh` (links or installs kokoro-js, generates the three music beds in `assets/music/`, prints the two env lines). Set `AIV_FFMPEG` and `AIV_CANVAS` to your local paths (ffmpeg-static binary and @napi-rs/canvas index.js). Work in the lesson's parent folder.

1. **Script** — write `script.json` (see Script rules). `examples/L01_what_ai_is/script.md` is the readable form. Show the script before rendering anything: review video by video.
2. **Voice samples (new voice only)** — `node scripts/vo.mjs sample <script.json> af_heart am_michael` (sandbox OFF: kokoro's phonemizer WASM fails inside it).
3. **Voice** — `node scripts/vo.mjs lesson <lessonDir> af_heart female` then `... am_michael male` (sandbox OFF, about 2 min each). One WAV per sentence, cached by hash; `durations.json` holds the lengths. Use ABSOLUTE `<lessonDir>` or leave it: render.mjs resolves by file name, so a relative path is fine.
4. **Look check** — `node scripts/render.mjs <lessonDir> female --shots auto` writes one still per sentence to `out/shots/`. Tile them into a contact sheet and LOOK (`ffmpeg -pattern_type glob -i 'out/shots/female_*.png' -vf "select='lt(n,14)',scale=230:-1,tile=7x2" -frames:v 1 sheet.png`). This is where overlaps, clipped text and broken glyphs show up. Fix, re-shoot, only then render.
5. **Render** — `node scripts/render.mjs <lessonDir> female` and `... male`. Frames are piped raw to ffmpeg (no PNG files), then the audio is mixed and muxed. Both lesson-1 videos finished in a few minutes each on this Mac. Run in the background. `--reuse` skips the frame pass if the silent video already exists (use it after an audio-only fix).
6. **QC** — `scripts/qc.sh out/*.mp4`, then open a few frames from the FINISHED file, then listen. Say plainly that audio was measured, not heard, until a person has listened.
7. **Deliver** — script.md, both MP4s and the `.srt`.

## Timing rules, and why each number is what it is

All in `scripts/render.mjs` (top constants and the "timeline" block).

| Constant | Value | Why |
|---|---|---|
| `PRE` | 0.6 s | Scene shows before the first word. |
| `GAP` | 0.45 s | Quiet between sentences: breathing room, and where a visual lands. |
| `TAIL` | 0.7 s | Quiet after a scene's last sentence before the dissolve. |
| `LAST_TAIL` | 3.6 s | The end card and the success chime ring out. |
| `X` | 0.6 s | Dissolve overlap. |

- Scene length = `PRE + sum(sentence length + GAP) - GAP + TAIL`. Scene start `T[i] = sum of earlier D - i*X`. The voice for a sentence is placed at `T[i] + at[k]` (`adelay`), by arithmetic, never by ear. So the video is exactly as long as the speech needs; nothing is squeezed into a fixed slot.
- Visual cues fire on the word they show: `sc.w(k, 'word')` returns when that word starts (character position across the sentence, minus 0.15 s so the picture arrives just before the word). The same cue times drive the sound effects, so picture and sound never drift apart.
- This replaced the old 28 s TikTok cards, which fitted a voice into fixed windows and were "terrible" (voice stopping halfway, text finishing after the voice, voice too quiet). Do not go back to fixed windows.

## Script rules

`script.json`: `{ id, n, of, title, arc, scenes: [ { visual, kicker, [next], sentences: [...] } ] }`. `visual` picks the scene drawing (see Scene library); `kicker` is the small cyan label under the lesson badge; `next` is only for the recap scene.

- Level: mid-college, serious, plain. Define a term the first time it appears (token, hallucination) in one clause. No hype words ("game-changer", "revolutionary"), no "AI will..." predictions, no jargon walls. A sentence reads aloud in one breath.
- Structure that holds view time: hook in the first 3 s (a fact the viewer recognizes) and a promise of what they will know; four to six scenes that each pay something off; one "here is the part most people get wrong" re-hook near the middle; one worked example; a rule they can use; a recap; "Next lesson: ..."; the slogan.
- About 440 words gives 2:58 with Heart. Aim 350-450. Spoken text is exactly the sentence text, so write numbers and symbols the way they should be said ("forty percent", not "40%"; test any odd one with `vo.mjs sample`).
- Claim discipline (BGI rules, enforced by eye): never "private", "offline", "secure", "just works", "forever", "no data leaves", any competitor or product name, any price. Illustrations must say so on screen ("illustrative numbers", "sample"). Facts that can date (a record height, a year) are checked before they go on screen (Everest 8,849 m).
- Slogan, both lines, always: "Be the cog in the machine. Tools that work for you."

## Scene library (in `render.mjs`, object `SCENE`)

`hook` (headline, three chips, "?" and a progress ring), `predict` (pill, flow diagram, sentence with probability bars, token split), `train` (scrolling pages, hide-guess-correct demo, chips, database vs model cards), `fluent` (headline, FLUENT != TRUE, fake citation with stamp, two same-confidence answers marked correct/wrong), `goodbad` (strong/weak panels with ticking items), `rule` (headline, four-box checklist, two filling bars), `recap` (numbered recap, next-lesson card, end card).

Each scene has three parts, all in `render.mjs`:
1. a `Q.<name>` function returning its cue times (scene-local seconds),
2. a `SCENE.<name>(t, sc)` drawing function using helpers `txt, box, check, cross, bang, vis, popK, scaled`,
3. the sound-effect lines in the `scenes.forEach` FX block, built from the same cues.

## Generic scenes (added 2026-11-15; lesson 2 is built only from these)

Four data-driven scenes need no code: the scene's content sits in a `data` object in `script.json`. Every item carries `on: [sentenceIndex, "word"]` (appears as that word starts; `[k]` = when sentence k starts). A wrong sentence number or a word that is not in the sentence STOPS the render with a message (the old `sc.w` silently fell back to 0). `color` is one of white, text, muted, cyan, green, amber, red. Keep colours consistent inside a lesson (lesson 2: Task cyan, Context green, Constraints amber, Format white).

| visual | data | use for |
|---|---|---|
| `statement` | `lines:[{ text, color?, size?, y?, on, off? }]` | big centered lines; `off` fades a line out when a later sentence starts; give each line a `y` (centre of the safe area is about 895; pairs 835/955) |
| `steps` | `title?:{text,color?,on}`, `items:[{ label, sub?, color?, on }]` (up to 5), `bullets?:'check'`, `foot?:{text,color?,on}` | numbered cards that pop in as each is spoken |
| `compare` | `cards:[{ title, body, tone:'no'\|'yes', color?, on }]` (two), `note?` (small line under the cards, e.g. "made-up example") | database-vs-model style cards, cross or check |
| `example` | `prompt:[{text,color?,on}]`, `chips?:[{text,color?,on}]`, `answerOn`, `answerTone:'bad'\|'good'`, `answer:[line...]`, `answerTag?:{text,color?,on?}`, `note?` | a "what you type" window, optional question/legend chips, then a "what you get" window; keep prompt lines under about 40 characters and answer lines under 50 |

`recap` now takes `data.lines:[{text,on}]` (three) and prints "Lesson N+1: <next>" from `script.n`; without `data` it keeps lesson 1's old text. Lesson 1's stills were compared before and after this change: 12 of 12 byte-identical.

Anything these four cannot draw still needs a new scene (the three-part recipe above). Look at `--shots auto` before every render: the first frames of a scene can be empty until the first cue, so put an early `on` on the first item.

## Look

BGI dark: bg `#0a0c10`, panels `#11161d`, cyan `#22d3ee`, green `#19e08f`, amber `#f59e0b`, red `#ef4444`, text `#f8fafc`. Content sits in x 70-930 (the TikTok action rail covers x >= 940, y 800-1580), nothing above y 250 or below y 1580. Safe zones are the reason the content is centered on x 500, not 540.

## Gotchas

- **Kokoro needs the sandbox off.** The phonemizer WASM fails inside it. Render and sample voices with `dangerouslyDisableSandbox`; everything else runs sandboxed.
- **Writing to the Desktop also needs the sandbox off.** The sandbox only allows the working folder and `$TMPDIR`.
- **Glyphs:** the font has no `↻`; it draws as a broken box. Draw arrows and icons as paths (`check`, `cross`, the repeat arc). `≠` works.
- **Hook text** shrinks to fit 900 px in the older card renderers; here headlines are fixed 92-96 px, so keep hook lines under about 17 characters per line.
- **durations.json used to store relative voice paths** (a failed first mux). render.mjs now resolves by file name; if audio fails with "No such file", look there first.
- **Loudness:** voice at -16 LUFS, bed at 10% of a -1 dBFS pad. Dropping `loudnorm` (as the 28 s cards once did) leaves the voice about 2 dB above the music: too quiet.
- **Long runs:** render in the background; do not poll. Both lesson-1 renders ran back to back in one command.
- **Posting is separate.** Platform settings: AI-generated-content label on (the voice is AI), commercial-content toggle "Your brand". No music label is needed: the bed is synthesized.

## Worked example

`examples/L01_what_ai_is/`: `script.json` (input), `script.md` (readable), both videos and the `.srt`. In `examples/`: the music sample, the pad under a voice, the sound-effect sampler and the two winning voice samples.

## Baseline for planning

Lesson 1: 442 words, 27 sentences, 7 scenes, 52 sound effects. Voice about 2 min per voice, frames and encode a few minutes per video. Writing the script and its scenes is the real work; the rest is machine time. 40 lessons by a human studio would be roughly 80-120 h of editing plus voice-over fees (estimate, not looked up).
