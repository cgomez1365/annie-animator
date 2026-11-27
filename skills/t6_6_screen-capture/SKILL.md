---
name: screen-capture
description: Records a web app driven by Playwright through Chrome DevTools Protocol (CDP) screencast, assembles frames into MP4 with ffmpeg, and optionally mixes voice-over from t5.1. Use whenever a training video, product demo, walkthrough, tutorial, or any scripted screen recording of a web application is needed, even if the request only says "record the app" or "make a demo video".
---

# Screen capture (t6.6)

Prerequisites: t0.3 (render pipeline — for ffmpeg assembly patterns), t5.1 (voice-synced-scenes — optional, for narrated recordings). Code: `module.mjs`. Demo: `demo.mjs`.

## When to use

Any time you need a pixel-perfect recording of a web application:
- Training videos (a production pipeline is built on this)
- Product demos and walkthroughs
- Automated visual regression recordings
- Scripted UI tours with narration

CDP screencast is better than OS-level screen recording because: no permission prompts, no desktop chrome in the video, resolution matches the target device exactly, and the whole thing is scriptable.

## Technique

### 1. The CDP screencast loop

Chrome's `Page.startScreencast` emits frames on **visual change**, not at a fixed rate. A static screen (an intro card, a modal that hasn't changed) emits one frame and then nothing. The recorder must hold the last frame until something changes or the scene ends.

```
Page.startScreencast { format, quality, maxWidth, maxHeight, everyNthFrame: 1 }
  → Page.screencastFrame events (timestamp + base64 JPEG)
  → Page.screencastFrameAck (must ack or Chrome throttles)
Page.stopScreencast
```

Each frame carries `metadata.timestamp` (seconds since epoch). The recorder stores `{ ts: timestamp * 1000, data: base64 }` and computes durations between frames at assembly time.

### 2. Frame assembly (ffmpeg concat demuxer)

Frames are written to disk as numbered JPEGs. A `list.txt` file tells ffmpeg how long each frame is held:

```
file 'f00000.jpg'
duration 0.5340
file 'f00001.jpg'
duration 0.0330
...
file 'f00042.jpg'   ← last frame repeated (concat demuxer requirement)
```

The last frame is held to the real recording end time, not to the next frame's timestamp — this matters for static scenes like intro/outro cards where no new frame arrives.

Assembly:
```bash
ffmpeg -f concat -safe 0 -i list.txt \
  -vf 'fps=30,scale=W:H:flags=lanczos,format=yuv420p' \
  -c:v libx264 -crf 18 screen.mp4
```

### 3. Voice mixing (optional)

When scenes have voice-over (WAV files from t5.1 or t5.5's Kokoro TTS), each clip is delayed to its scene's start time with `adelay` and mixed:

```
[1:a]adelay=0|0[a0]; [2:a]adelay=4500|4500[a1]; ... amix=inputs=N:normalize=0[a]
```

`normalize=0` is critical — without it, ffmpeg auto-normalizes and the volume jumps between scenes.

### 4. Viewport presets

| Kind | Viewport | Scale | Output |
|------|----------|-------|--------|
| Phone (iPhone 15 Pro) | 390×844 | 2× | 780×1688 |
| Tablet (iPad) | 820×1180 | 2× | 1640×2360 |
| Desktop (1080p) | 1280×720 | 1.5× | 1920×1080 |
| Desktop (720p) | 1280×720 | 1× | 1280×720 |

Phone viewports set `isMobile: true, hasTouch: true` on the Playwright context.

### 5. Page injection (captions and tap indicator)

An `addInitScript` injects two elements into every page load:

- **`#__cap`** — a fixed caption bar at the bottom of the screen. Desktop version is a floating pill (960px, centered, rounded); phone version is full-width with a gradient. `window.__cap(text)` sets it; empty string hides it.
- **`.__tap`** — a green ripple circle (46px) that animates at a click point. `window.__tap(x, y)` spawns one; it fades out in 0.7s. Shows the viewer where the "finger" tapped.

Both survive page navigations because they're in `addInitScript` (runs on every new document). A `MutationObserver` re-injects them if React replaces the body.

### 6. Scene helpers

The helpers object wraps Playwright's raw API into training-video-friendly actions:

| Helper | What it does | Timing |
|--------|-------------|--------|
| `tap(loc)` | Scroll into view, show tap indicator, click | ~1.4s total |
| `tapTop(loc)` | Scroll near top, tap, wait for loading text to clear | ~1.7s total |
| `type(loc, text)` | Click field, type char by char (55ms/char) | varies |
| `point(loc)` | Show tap indicator without clicking (for destructive buttons) | ~1.1s |
| `card(title, sub)` | Full-screen branded card (intro/outro) | instant |
| `cap(text)` | Set caption text | instant |
| `center(loc)` | Scroll element to vertical center | 0.65s |
| `top(loc, y)` | Scroll element near top of viewport | 0.7s |
| `scrollTo(y)` | Scroll to absolute Y | 0.8s |
| `wait(ms)` | Pause (capped to 250ms in dry mode) | varies |

### 7. Dry-run mode

`--dry` walks every scene in ~15 seconds (waits capped to 250ms), saves a screenshot per scene, and skips CDP recording entirely. Use it as a storyboard: review screenshots before committing to a full recording.

Tile dry-run screenshots into a contact sheet with the sheet helper (3 columns, 640px each).

## Module API (`module.mjs`)

### Core recording

- `createRecorder(page, opts)` → `{ start(), stop(), frames }` — wraps CDP screencast. `opts`: `{ format:'jpeg', quality:92, maxWidth, maxHeight }`.
- `assembleFrames(frames, recStart, endMs, outDir, size)` → `screenPath` — writes numbered JPEGs + `list.txt`, runs ffmpeg concat, returns the raw video path.
- `mixVoice(screenPath, wavPaths, startTimes, outPath)` → `mp4Path` — overlays WAV clips at their start times onto the video.

### Viewport

- `VIEWPORTS` — the preset table above as `{ phone, tablet, desktop, desktop720 }`.
- `contextOpts(kind)` → Playwright context options for that viewport kind.

### Page injection

- `INIT_SCRIPT` — the caption + tap indicator injection script (string). Pass to `context.addInitScript()`.
- `capHelpers(page, dry)` → `{ cap, tap: showTap, wait }` — the page-level helpers.

### Scene helpers

- `sceneHelpers(page, opts)` → the full helpers object (tap, tapTop, type, point, card, cap, center, top, scrollTo, wait). `opts`: `{ dry, logo, site, unit, photo, lang, BASE }`.

### Verification

- `verifyVideo(path)` → `{ duration, dimensions, meanDb, maxDb }` — ffprobe the output.
- `makeFrameStrip(path, outPath, width)` — 4 frames at key timestamps, hstacked.
- `makeSheet(dir, ids, outPath, cols)` — tile dry-run screenshots into a contact sheet.

## Recipe: record a scripted web app walkthrough

```js
import { chromium } from 'playwright';
import { createRecorder, assembleFrames, mixVoice, contextOpts,
         INIT_SCRIPT, sceneHelpers, VIEWPORTS } from './module.mjs';

// 1. Launch
const browser = await chromium.launch();
const ctx = await browser.newContext(contextOpts('phone'));
await ctx.addInitScript(INIT_SCRIPT);
const page = await ctx.newPage();

// 2. Record
const rec = createRecorder(page, { ...VIEWPORTS.phone });
await rec.start();

// 3. Drive scenes
const h = sceneHelpers(page, { dry: false, logo, BASE: 'http://localhost:3111' });
await h.card('Welcome', 'A quick tour');
await h.cap('First, scan the QR code on the door.');
await page.goto(url);
await h.tap(page.locator('button:has-text("OK")'));
// ... more scenes ...

// 4. Stop and assemble
const { frames } = await rec.stop();
const screen = await assembleFrames(frames, rec.startMs, Date.now(), 'out/frames', VIEWPORTS.phone);
const final = await mixVoice(screen, wavPaths, startTimes, 'out/video.mp4');
await browser.close();
```

## Recipe: dry-run storyboard

```js
const h = sceneHelpers(page, { dry: true });
// ... drive scenes (waits are capped to 250ms) ...
await page.screenshot({ path: `out/shot_${i}.png` });
// After all scenes:
makeSheet('out', ['00','01','02','03'], 'out/sheet.png', 3);
```

## Common failures

- **No frames captured:** `Page.screencastFrameAck` must be called for every frame or Chrome throttles delivery. The module handles this internally.
- **Static screen = one frame:** CDP only emits on visual change. The assembler holds the last frame to `endMs`. A scene that shows nothing but a static card for 5 seconds still works — it's one held frame.
- **Caption flashes on navigation:** A `page.goto()` wipes the DOM. The init script re-injects on the next `DOMContentLoaded`, but there's a brief flash. Put navigations at scene boundaries, not mid-scene.
- **Voice out of sync:** If a scene's action takes longer than its narration, the voice moves on while the screen is still animating. Keep actions under the narration duration; let the voice carry the explanation.
- **8 GB RAM:** Playwright + a dev server + Kokoro fit. Don't run Figma or Xcode alongside a recording.
- **ffmpeg-static on npm 10+:** `npm install-scripts approve ffmpeg-static && npm rebuild ffmpeg-static`.
- **`normalize=0` in amix:** Without it, ffmpeg auto-levels and the volume jumps between scenes. Always pass it.

## Quality bar

- Assembled video matches the target resolution exactly (phone: 780×1688, desktop: 1920×1080).
- Frame durations sum to within 0.1s of wall-clock recording time.
- Voice clips are audible (mean volume above -30 dB) and start within 50ms of their target time.
- No black frames (every frame is a valid JPEG from CDP).
- Dry-run screenshots cover every scene (count matches scene count).
- Caption bar is visible and readable in every captioned frame.
- Tap indicator appears at the correct element position.

## Run it

```
cd skills/t6_6_screen-capture
node test.mjs                  # unit tests for assembly math and helper timing
node demo.mjs                  # records a small demo of a local page
```

## Dependencies

- `playwright` (Chromium)
- `ffmpeg-static` (or system ffmpeg)
- t5.1 voice-synced-scenes (optional, for narrated recordings)
- t5.5 training-video-production (for Kokoro TTS voice generation)

## Not verified

- Tablet viewport (820×1180) has not been tested in a full recording.
- Frame rate consistency on Linux (only tested on macOS ARM).
- Concurrent recordings in the same browser instance.

## Next skills

This skill is consumed by t5.5 (training-video-production) for training videos. It could also be used by t6.1 (series-templates) to record animated card previews, or by t6.3 (platform-packaging) to generate preview GIFs from rendered videos.
