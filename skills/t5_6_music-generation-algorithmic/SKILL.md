---
name: music-generation-algorithmic
description: Generate original music beds from music theory rules — scales, chord progressions, rhythm patterns — rendered through MIDI and SoundFont synthesis. No AI model weights, 100% deterministic and original output.
---

# Music generation — algorithmic (t5.6)

Prerequisites: t0.2 (timeline and seeded RNG — for deterministic composition). Source: AEON Neural Composer (`blocks/render_v2/music/composer.py`).

## When to use

When you need a royalty-free music bed whose style, tempo and key you control exactly, and you want it reproducible from a seed. No GPU, no model download, no licensing.

## Technique

### 1. Theory engine

The composer picks a **scale** (major, minor, pentatonic, blues, dorian, mixolydian), a **chord progression** (I–IV–V–I, ii–V–I, vi–IV–I–V, etc.) and a **rhythm grid** (4/4, 3/4, 6/8). Notes are chosen by rule — chord tones on strong beats, passing tones on weak beats, tensions resolved stepwise.

### 2. MIDI generation

Theory decisions become MIDI events: note-on/off with velocity curves, CC for expression. The MIDI is fully deterministic given the seed, tempo, key and style preset.

### 3. SoundFont / synthesis rendering

MIDI is rendered to WAV through a SoundFont (`.sf2`) or a built-in additive/FM synthesizer. Post-processing: EQ, compression, reverb (convolution or algorithmic), limiter.

### 4. Style presets

Each preset bundles a scale preference, rhythm density, instrument palette and mix template. Examples: `ambient` (sparse, pad-heavy, slow), `corporate` (major key, light percussion, piano + strings), `lo-fi` (swing grid, vinyl noise, Rhodes).

## Output

A WAV file (44.1 kHz, 16-bit stereo) of any requested duration. Same seed + preset = identical output on every run.

## Dependencies

- Python 3.10+
- `mido` (MIDI generation)
- `numpy` (signal math)
- A SoundFont file (FluidR3_GM recommended) or the built-in synthesizer
- `scipy` for reverb convolution (optional)

## Quality bar

- No clipping (true peak below -1 dBFS)
- Chord changes land on downbeats
- No dissonant intervals on strong beats unless the style calls for it (blues, jazz)
- Identical output from the same seed
