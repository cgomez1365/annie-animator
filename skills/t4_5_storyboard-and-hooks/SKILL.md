---
name: storyboard-and-hooks
description: Plans a BGI animation card before any frame is drawn. Gives the beat sheets for 28 s and 16 s cards, a library of 14 tested hook patterns with a fit-and-claims check, a pacing checklist (the retention habits as code), and a storyboard.json that compiles into a timeline, a hook caption, a voice-over table and a working card skeleton. Use whenever a new card, short or lesson clip is being planned, a hook or opening line is needed, a script has to be fitted to a time budget, a card feels slow or flat, or someone asks "what goes in the first two seconds", even if they never say "storyboard".
---

# Storyboard and hooks (t4.5)

Prerequisites: t4.4 lip-sync (syllable counts drive the voice-time model), t0.2 timeline-and-seeded-rng (pages and overlaps), t0.3 render-pipeline (to render what you plan).
Code: `module.mjs`. Demo: `demo.mjs` (7.5 s). Test: `node test.mjs` (121 checks; it also writes `out/example_storyboard_28.json`, `out/example_storyboard_16.json` and `out/example_voice_table_28.md`).

## When to use

Before drawing anything. The plan is cheap to change, the render is not. This skill decides: what the first 2 seconds say, how long each beat lasts, when something new appears, where the voice sits, and whether the whole thing breaks a BGI claim rule. It judges the PLAN. It cannot know how long people really watch: the checks encode habits of cards that hold attention (the tt10 standard), nothing more.

## Beat sheets (`FORMATS`, `beatSheet(28 | 16)`)

Durations add up to T minus the 3.1 s closer. Frames at 30 fps in brackets.

| 28 s card | Start | Dur | Job | Events | Words |
|---|---|---|---|---|---|
| hook | 0.0 | 2.4 (72) | one question or promise, outside the window, opens the loop | 2 | 7 |
| problem | 2.4 | 4.6 (138) | the pain or confusion the viewer already half knows | 3 | 10 |
| reveal | 7.0 | 7.0 (210) | the mechanism, built step by step (longest beat) | 4 | 12 |
| proof | 14.0 | 6.0 (180) | a concrete example, a UI that presses and fills | 4 | 12 |
| payoff | 20.0 | 4.9 (147) | the takeaway line, closes the loop | 3 | 10 |
| closer | 24.9 | 3.1 (93) | engine closer: slogan, Follow, footer | | |

| 16 s card | Start | Dur | Job |
|---|---|---|---|
| hook | 0.0 | 1.8 (54) | short question or promise |
| setup | 1.8 | 3.2 (96) | the situation in one picture |
| show | 5.0 | 5.0 (150) | the move itself, shown not told |
| payoff | 10.0 | 2.9 (87) | the takeaway, closes the hook |
| closer | 12.9 | 3.1 (93) | engine closer |

An "event" = something new and visible: an entrance, a pop, a page slide, a stamp, a number changing. Persistent motion (dust, bobbing) does not count: it stops a frozen frame but does not refresh the picture.

## Hooks (`HOOK_PATTERNS`, `hookFromPattern(id, slots)`)

Two lines, line 1 white, line 2 green, Space Grotesk 104 px, baselines 470 and 580, appears by 0.15 s, outside the window, stays at least 1.2 s.

| id | Template | When |
|---|---|---|
| question | What does {x} / actually do? | a topic people use but cannot explain |
| contradiction | {x} is not / {y}. | a common wrong picture |
| mistake | The {x} mistake / to avoid. | a fixable habit |
| promise | {x} in / {n} seconds. | one idea (use the real card length) |
| count | {n} ways to / {x}. | a list of three or fewer |
| open-loop | Watch what / {x} does next. | something visibly happens |
| challenge | Spot the / {x}. | a before and after to judge |
| before-after | Before: {x} / After: {y}. | a clear improvement |
| command | Stop {x} / and try this. | a habit with a better replacement |
| myth | Myth: {x} / Fact: {y} | a false belief corrected in a line |
| definition | {x} in / one sentence. | a definition that fits the voice |
| scenario | You ask {x}. / Then what? | walk through what happens next |
| either-or | {x} or / {y}? | a real choice the card resolves |
| reveal | What is inside / a {x}? | something you can open up on screen |

Rules (`checkHook` enforces them): 7 words or fewer; both lines fit 920 px at 76 px or more (`fitHook` steps 104, 100 ... 76 and returns the largest that fits: pass it as `cap.px`); no banned claim word from `engine/brand.mjs` (private, offline, secure, prices, competitor names ...); no hype word (`HYPE`: nobody, everyone, secret, guaranteed, best, fastest, shocking ...). A hook is a question or a promise the card can keep, never a claim it cannot prove. All 14 examples fit at 96 px or more.

## The retention checklist (`pacingReport(compiled, sb)`)

Each check has a weight; `score` is the weighted share passed (0-100). Failed ids are listed in `failed`.

| id | Rule | Why |
|---|---|---|
| hook-first-text | hook text arrives by 0.3 s (default 0.15) | the first second decides if the thumb stops |
| hook-readable | hook stays on screen at least 1.2 s | 5 to 8 words need about 1.2 s |
| hook-copy | `checkHook` passes | fits, no claims, no hype |
| event-gap | no stretch over 1.8 s (28 s) or 1.5 s (16 s) without a new event | the picture must keep refreshing |
| beat-length | no beat over 7 s (28 s) or 5 s (16 s) | long beats need sub-events or pages |
| beat-min | no beat under 0.8 s | shorter cannot be read |
| text-load | on-screen words per beat under the template limit and under 3.3 words per second | rule of thumb: 3.3 words per second is about 200 words per minute, a comfortable reading speed |
| loop | the hook beat has `openLoop`, a later beat starting after 60 percent of the card has `closeLoop` | curiosity needs a payoff |
| payoff-late | payoff starts after 60 percent of the card and ends before the closer | the answer is the reward for staying |
| closer | closer starts at T - 3.1 (needs 3 s) | the engine closer is complete by +1.2 s and never freezes |
| cover | cover frame between 0.8 and 3.6 s, inside the hook beat | the cover must show the hook |
| voice-fit | every voice line ends 0.05 s before its beat ends | the voice must not run into the next beat |
| caption-band | no planned text in y 1250-1580 (`textY`) | Reels caption band |
| claims | no banned claim or hype wording anywhere (text, voice, visual notes) | BGI claim rules |

Failing a check is information, not an insult: fix the plan, then re-run. `noveltyCurve(compiled)` draws 1 at every event decaying over 1.2 s: it restates the event times (it is NOT a retention forecast), but a curve with long low stretches is the curve of a card that drags.

## storyboard.json

```json
{ "id": "example_28_chatbot", "title": "What does AI actually do?", "format": 28, "brand": "bgi", "fps": 30, "cover": { "t": 1.3 },
  "hook": { "pattern": "question", "l1": "What does AI", "l2": "actually do?" },
  "beats": [
    { "id": "hook", "kind": "hook", "dur": 2.4, "text": "What does AI actually do?", "voice": "What does AI actually do?",
      "visual": "a chat bubble pops in with a blinking cursor", "events": [1.0], "openLoop": true },
    { "id": "problem", "kind": "setup", "dur": 4.6, "text": "...", "voice": "...", "visual": "...", "events": [0.9, 2.2, 3.5] }, ... ] }
```
Beat fields: `id`, `kind` (hook | setup | reveal | proof | turn | payoff), `dur` seconds, `text` (what the viewer reads), `voice` (exactly as spoken, with full stops), `voiceAt` (seconds into the beat, default 0.15), `visual` (one sentence for the animator), `events` (seconds from the beat start when something new appears; the beat start is automatic), `overlap`, `openLoop`, `closeLoop`, `textY`. Full examples: `exampleStoryboard(28)` and `exampleStoryboard(16)`, also saved in `out/`.

`compileStoryboard(sb)` returns `{T, frames, META, closerAt, beats: [{..., s, e, events}], events, hookCap, closer, voiceRows, errors}`. `errors` (never thrown) lists: format not 16 or 28, first beat not the hook, no payoff, unknown kind, beats that do not end where the closer starts. `META` is ready to export from a card file. `hookCap` goes straight into the engine `hook(ctx, cap, t)`.

## Voice time (`voiceSeconds(text)`, `voiceTableMd(compiled)`)

Seconds of Kokoro Heart speech = 0.205 per syllable + 1.05 x pauses inside the text (0.3 after a full stop, 0.15 after a comma). Measured on 95 rows of the existing VO scripts: mean error 0.18 s, worst 0.72 s (0.17 s mean when fitted on half the rows and tested on the other half). Aim for voice that ends at least 0.3 s before the beat does. `voiceTableMd` prints the rows in the same `| Time | Voice-over | Must end by |` format as `TikTok_VO_Scripts.md`, with OVERRUN marked.
Speed: the fit gives 4.9 syllables per second overall for Heart, pauses included. Slower voices need more time (the ai-training-video skill measured Nicole about 35 percent slower than Heart); refit the two constants from a few measured rows before using another voice.

## From plan to card (`makeCard`)

```js
import { makeCard, exampleStoryboard } from './module.mjs';
const sb = exampleStoryboard(28);                      // or load your storyboard.json
export const { META, frame } = makeCard(sb, {
  reveal: (ctx, { t, beat, local, page }) => { /* draw with page.a and page.dx (tt10 page slide: 0.4 s in, 0.35 s out, 0.1 s overlap) */ },
  proof:  (ctx, { local }) => { /* ... */ },
});
```
`makeCard` handles the background, kicker, hook, page windows and the closer; you draw only the beat contents. It throws if the storyboard has compile errors.

## Workflow

1. Pick a pattern (`HOOK_PATTERNS`), fill it, run `checkHook`.
2. Copy `exampleStoryboard(28 or 16)`, write text and voice for each beat, add `events` so nothing waits more than 1.5 s.
3. `compileStoryboard` then `pacingReport`. Fix until `failed` is empty. Print `voiceTableMd` and send the voice lines to Kokoro.
4. Draw the beats with t0.1 curves, t0.2 pages, t4.x characters. Render, run the engine QC (t0.4).
5. After voice exists, re-measure: voice length from the real WAV (t4.4 `analyzeAudio`) replaces the estimate.

## Common failures

- Hook as a statement the card cannot prove ("The best way to learn AI"): `checkHook` flags best; rewrite as a question or a challenge.
- Beats that add up to 25 s in a 28 s card: the compiler says where the closer should start.
- A 7 s reveal with one event: add events at 1.2, 2.6, 4.0, 5.4 or split it into two pages.
- Voice written longer than the beat: shorten the sentence, do not speed the voice.
- Text over the caption band: keep text above y 1250 where possible.
- Reading the novelty curve as audience data: it is the plan restated, not a forecast.

## QUALITY BAR (measured by test.mjs)

- Both templates: durations sum to T - 3.1; hook first, payoff last; each beat has a goal and at least 2 events; `beatSheet` returns copies.
- 14 hook patterns, every example free of banned claims and hype, 7 words or fewer, fits at 88 px or more; banned and hype words, price, over-long and empty hooks are caught; fit shrinks with length.
- Voice model within 0.25 s mean and 1.0 s worst over the 95 measured rows (in-sample).
- Both example storyboards compile with no errors, deterministically and through a JSON round trip, and pass all 14 checks (score 100).
- 17 deliberately broken storyboards (no events, 9 s beat, 0.5 s beat, essay text, long hook, claim word, hype in voice, loop open or closed wrong, voice too long, short or missing beats, caption band, cover on the closer) each fail the check that names the fault.
- `makeCard` returns a working 1080x1920 frame function.
- Demo: 1080x1920, 7.5 s, silent, QC pass, nothing frozen; every number on screen comes from the compiler.

## Run it

```
cd skills/t4_5_storyboard-and-hooks && node test.mjs     # about 1 minute
```

## What the demo shows (7.5 s)

Header "Plan the hook. Check the pacing." A window titled storyboard.json: the five beats of the 28 s example slide in with colour-coded duration bars (hook 2.4 s, problem 4.6 s, reveal 7.0 s, proof 6.0 s, payoff 4.9 s). The page slides to "timeline": the beats lay out end to end with the closer, a playhead scrubs the whole 28 s while the novelty curve and event ticks draw, then four checks tick off with the numbers the compiler measured (hook at 0.15 s, longest gap 1.6 s, voice fits every beat, no banned words). Cog thinks, then cheers. 4.4 s closer.
