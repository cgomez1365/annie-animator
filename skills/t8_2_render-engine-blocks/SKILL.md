---
name: render-engine-blocks
description: Template-based video rendering engine — JSON manifest defines blocks (intro, body, outro) with visual overlays, text and transitions. Queue system for batch processing, server mode for API-driven rendering.
---

# Render engine — blocks (t8.2)

Prerequisites: t0.3 (render pipeline), t5.6 or t5.7 (music generation), t5.1 (voice-synced scenes). Source: `blocks/render_v2/`.

## When to use

When you need to produce many videos from a template — a content series, an ad batch, a product lineup — where the structure is fixed but the data (text, images, colors, music style) changes per video. The block engine separates content from layout.

## Technique

### 1. Block manifest (`block.manifest.json`)

A JSON file describing the video's structure as an ordered list of **blocks**:

```json
{
  "template": "product-explainer",
  "duration": 30,
  "blocks": [
    { "type": "intro", "duration": 4, "title": "...", "logo": "..." },
    { "type": "body", "duration": 22, "slides": [...] },
    { "type": "outro", "duration": 4, "cta": "...", "url": "..." }
  ]
}
```

Each block type has a registered renderer that knows how to draw its frames.

### 2. Visual overlays

Blocks can stack overlays: background plate, text layers (with entry/exit animations), icons, progress bars, brand elements. Overlays are composited per-frame in painter's order.

### 3. Transitions

Block-to-block transitions: crossfade, slide, wipe, zoom. Duration and easing are per-transition. The engine handles frame overlap at boundaries.

### 4. Templates

A template is a directory with:
- `template.json` — block sequence, default durations, overlay positions
- `assets/` — fonts, logos, background images
- `renderer.js` — the frame-drawing code for each block type

New templates are added by writing a renderer; the engine handles sequencing, encoding and output.

### 5. Queue system

A file-based queue (`queue/`) with one JSON job per video. The engine polls the queue, renders in order, writes output to `output/`. Failed jobs are moved to `queue/failed/` with error logs.

### 6. Server mode

An HTTP API (`server/`) accepts job submissions (POST with manifest + assets), returns a job ID, and serves the rendered video when done. Designed for integration with content management systems.

## Output

MP4 (1080×1920 or 1920×1080, 30 fps, libx264 crf 20). Music and voice are mixed in a final pass (voice at -16 LUFS, music ducked).

## Dependencies

- Node.js 18+ (engine and server)
- `@napi-rs/canvas` or Playwright (frame rendering)
- ffmpeg (encoding and mixing)
- Music generation skill (t5.6, t5.7 or t5.8)
- Voice generation (Kokoro or external TTS)

## Quality bar

- Template renders identically given the same manifest and assets
- Block transitions have no black frames or frame drops
- Text is readable at phone size (minimum 36px at 1080w)
- Queue handles interrupted runs (resume, not restart)
- Server responds within 500 ms for job submission; rendering is async
