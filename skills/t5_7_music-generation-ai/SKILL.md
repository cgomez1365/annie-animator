---
name: music-generation-ai
description: Generate music beds using Meta's MusicGen model (300M params) with 12 style presets. Needs a GPU. Produces varied, high-quality tracks from text prompts.
---

# Music generation — AI model (t5.7)

Prerequisites: t0.3 (render pipeline — for ffmpeg post-processing). Source: `blocks/render_v2/music/generate.py`.

## When to use

When you need a music bed with more variety and texture than algorithmic composition can deliver, and you have a GPU available. The output is non-deterministic (different every run) but style-controllable via presets and text prompts.

## Technique

### 1. Model

Meta's **MusicGen-small** (300M parameters). Runs on a single GPU with 4 GB+ VRAM. Optimized for GTX 1050 and above; runs on Apple Silicon via MPS.

### 2. Style presets (12)

`ambient`, `cinematic`, `corporate`, `electronic`, `folk`, `hip-hop`, `jazz`, `lo-fi`, `orchestral`, `pop`, `rock`, `world`. Each preset is a curated text prompt plus generation parameters (temperature, top-k, duration, cfg scale).

### 3. Generation pipeline

1. Select preset or write a custom prompt
2. Generate at 32 kHz mono (model native)
3. Resample to 44.1 kHz stereo
4. Normalize to -14 LUFS (streaming target)
5. Fade in/out (0.5 s / 3 s)
6. Export WAV

### 4. Batch mode

Generate N variations from the same prompt, pick the best. Useful for A/B testing beds against a card.

## Output

WAV file, 44.1 kHz stereo, any duration up to 30 s per generation (longer tracks are stitched with crossfade).

## Dependencies

- Python 3.10+
- PyTorch 2.x with CUDA or MPS
- `audiocraft` (Meta's MusicGen library)
- `torchaudio`
- ffmpeg (post-processing)
- GPU with 4 GB+ VRAM

## Quality bar

- Loudness within 1 LU of -14 LUFS
- No abrupt cuts or artifacts at stitch points
- Style matches the preset description
- Fade-out is smooth, no click at end
