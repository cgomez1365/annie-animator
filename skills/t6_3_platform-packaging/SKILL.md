---
name: platform-packaging
description: Packages a finished BGI card for TikTok, Instagram Reels and YouTube Shorts: checks the video file against the specs, picks and checks the cover frame (with the 3:4 grid crop), and generates the post file with title (140 characters at most), caption, hashtags, AI labels and the music-credit line, with every limit and claim rule checked. Use whenever a card is ready to post or schedule, when someone needs the caption, title, hashtags or cover for a video, or when a post file must be regenerated after a copy change, even if they only say "write the post for this one".
---

# Platform packaging (t6.3)

Prerequisites: t0.3 (a rendered card), t0.4 (the checker). Code: `module.mjs`. Real card used: the ported tt10 (`../t6_2_batch-render-and-cache/ported/tt10_ops_hr.mjs`). Reference: `TikTok_Demos/posts/README.md` and `source/posts/gen-posts.mjs` (the 20 existing post files).

## When to use

After the card passes the checker and the voice and music are on it. Packaging never changes the picture; it checks the file, chooses the cover and writes the words.

## The rules it enforces (2026-10-29 research; platforms change, re-check on the first post)

| | TikTok | Instagram Reels | YouTube Shorts |
|---|---|---|---|
| Title | up to 140 (house limit; TikTok's own is 150) | none | up to 100 |
| Caption | up to 2,200 characters; about 100 show before "more" | up to 2,200 | description up to 5,000 bytes |
| Hashtags | 3-5 | 5 at most, caption and comments together | 3 at the end of the description (over 60 voids all); tags field up to 500 counted with quote marks and commas |
| AI label | AI-generated content: On when voice, pictures or music are AI | Add AI label: On for a realistic AI voice | Altered or synthetic: No for a plain narrator; Yes if the AI voice is the product |
| Commercial | Disclose commercial content: On, Your brand (every post) | Paid partnership label: Off | Branded content: No |
| Cover | pick a frame of the video; grid shows 3:4 | upload from camera roll, cannot be changed later; grid shows centre 3:4 | custom thumbnail needs the Partner Program |

Every caption and description carries: the hook first, the body, the slogan pair together ("Be the cog in the machine." "Tools that work for you."), and the link line. Shorts description adds "The voice is AI text-to-speech (Kokoro, Heart voice). The music is AI-generated (Google Gemini)." Reels audio is renamed "Ready For Tomorrow (AI music) · Broken Gear Industries". Banned words: the engine's list plus optimize, speed up, clean up. No `#` inside a link or word. TikTok has no tappable link: spell the site out ("Find it at ..."); Reels says "Link in bio:" only for the five bio links.

## Video file check

`checkVideo(file, {kind:'master'|'final'})` -> `{ok, problems, warnings, info}`. Needs 1080x1920, 30 fps, H.264, yuv420p. A **master** (engine output) must have no audio; a **final** (what you post) should have audio (warning if not). Warnings: under 3 s, longer than a platform limit (limits not re-checked since 2026-10-29: TikTok 600 s, Reels and Shorts 180 s).

## The cover

- `rankCovers(card)` scores `META.coverT` plus 14 moments before the closer. `scoreCover(card, t)` adds: +4 headline (56 px or more, fully opaque) inside x 60-1020 and y 300-1500, +2 hook-size headline (96 px), +2 content in the 3:4 crop; takes off 10 for the closer (slogan or Follow on screen), 4 for text cut by the crop or edges, 1 per half-faded text item, up to 3 for a mid-transition frame, 3 for an empty frame. Ties go to `coverT`.
- `makeCover(card, {out, name, t?})` writes `<name>_cover.png` (1080x1920, the exact frame the renderer draws, dither included), `<name>_cover_grid.png` (the 3:4 crop, 1080x1440 from y 240) and `<name>_cover.json` (the ranking).
- The ported tt10 picks t 1.2 (its own `coverT`), score 8: the hook "Outgrew your / spreadsheets?" over the jittering spreadsheet.
- Always look at the grid file: the checker cannot judge taste.

## The post spec and files

```js
{ id:'tt10_ops_hr', date:'2026-12-14', brand:'BGI', name:'Outgrew your spreadsheets?', hook:'...', body:'...', tags:[5 words], url:'brokengearindustries.com',
  credit?:'map credit', title?:'TikTok title (default: the hook)', ytTail:'Broken Gear Industries', ytTags:['Broken Gear Industries','BGI'],
  ai:{ voice:true, music:true, voiceIsProduct?:false }, music:{ igAudioName:'Ready For Tomorrow (AI music) · Broken Gear Industries' } }
```
- `buildCopy(spec)` -> `{tiktok:{title,caption}, shorts:{title,description,tags}, reels:{caption}}`.
- `validatePost(spec)` -> `{ok, problems, copy}`. `settingsFor(spec)` -> the switches per platform.
- `postMarkdown(spec, {video, cover, coverGrid, videoInfo})`, `writePostFiles(spec, dir, o)` -> `<id>.md` + `<id>.json`.
- `packageCard({card, spec, out, video, videoKind})` does cover + video check + files in one call and returns `ok`.

## Recipe

1. Render and QC the card (t0.3, t0.4); add voice and music (separate layer).
2. Write the spec (copy from the card's script and the site; claims only from the card, its voice-over or the page it links to).
3. `packageCard(...)`; fix every problem; open `<id>_cover_grid.png` and `<id>.md`.
4. Paste from the md. Accept TikTok's Music Usage Confirmation when AI music is used.

## Common failures

- Hook over 100 characters: the part after the cut is not read. Put the point first.
- Two slogan lines separated, or only one: they travel together.
- A cover taken from the closer or from a card mid-slide: let `rankCovers` choose, or pass `t`.
- Text outside the 3:4 crop (the grid cuts y under 240 and over 1680): keep headlines inside y 300-1500.
- `#demos` or any `#word` in a link reads as a hashtag: `displayUrl` drops fragments.
- Treating these numbers as law: they are dated 2026-10-29 and were not re-read from the live apps today.

## Quality bar (measurable, all in the test)

- The copy generator reproduces all 100 text blocks (TikTok caption, Shorts title, description, tags, Reels caption of the 20 existing posts) byte for byte.
- A 141-character TikTok title, 7 hashtags, a banned word, a 101-character hook, a `#` in a link, AI music without its credit or Instagram audio name, and tags over 500 are each caught; 140 exactly passes.
- Banned words are caught; AI labels enforced.
- File check: a full-size silent master passes; preview size, sound on a master, and 24 fps fail.
- Cover: the ported tt10 and the demo choose a headline frame before the closer; the closer scores 8+ lower; the cover is 1080x1920, the grid 1080x1440, bytes identical on a second run.

## Run it

```
node test.mjs                  # 49 checks, the demo at 1080x1920 (8 s), checker
ANNIE_PREVIEW=1 node test.mjs
```
