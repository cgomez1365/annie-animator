---
name: soft-relaxing-video-batch
description: Batch pipeline for calm, faceless TikTok/Reels/Shorts — Kokoro Nicole voice-over, synthesized singing-bowl music, slow-zoom AI-generated stills. 48-video proven pipeline.
---

# Soft / relaxing video batch (t6.7)

Prerequisites: t5.1 (voice-synced scenes), t5.8 (audio synthesis — singing bowl), t0.3 (render pipeline). Source: `soft-relaxing-video/`.

## When to use

When you need a batch of calm, faceless vertical videos for social media — meditation, affirmation, motivational, nature, ASMR-adjacent content. The pipeline is proven at 48 videos.

## Technique

### 1. Script generation

Each video gets a short script (3–5 sentences, 20–40 seconds read time). Scripts are themed by batch: gratitude, morning routine, breathing, self-care, sleep, nature sounds. Tone is warm, unhurried, second-person.

### 2. Voice

**Kokoro Nicole** (female, calm, American English). Speed 0.9–1.0. Each sentence is a separate WAV for precise timing.

### 3. Music bed

Synthesized singing-bowl pad (t5.8 `synth.mjs`). Mixed at 15–20% volume, ducked under voice. No licensed music.

### 4. Visuals

AI-generated stills (landscape, nature, abstract calm) with a slow Ken Burns zoom (1.0→1.08 over the clip duration). No text on screen except an optional soft watermark. Aspect ratio 9:16 (1080×1920).

### 5. Assembly

ffmpeg concat: still → zoom filter → overlay voice + music → fade in/out → MP4 (libx264, crf 20).

### 6. Batch orchestration

A manifest JSON lists all 48 scripts. The pipeline renders them sequentially or 2-parallel, writes a cover frame and post metadata per video (t6.3 platform-packaging format).

## Output

Per video: MP4 (1080×1920, 30 fps, 20–45 s), cover frame PNG, post.json. Per batch: manifest with titles, durations, file paths.

## Dependencies

- Node.js 18+ (orchestration)
- Kokoro TTS (Python, kokoro-js or kokoro CLI)
- ffmpeg
- AI image generator (for source stills)

## Quality bar

- Voice is clear and unhurried (no rushed sentences)
- Music does not compete with voice (ducked by ≥12 dB)
- Zoom is smooth (no jitter, no visible resampling artifacts)
- Each video stands alone (no "part 1 of N" dependency)
