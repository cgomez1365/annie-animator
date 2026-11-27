---
name: audio-synthesis-js
description: Pure JavaScript audio synthesis — drum machines, melodic instruments, ambient pads and SFX — with no samples, no models, no native dependencies. Runs anywhere Node runs.
---

# Audio synthesis — pure JS (t5.8)

Prerequisites: t0.2 (timeline and seeded RNG — for deterministic patterns). Source: `scripts/music.mjs` and `scripts/synth.mjs` from the training-video-production skill (t5.5).

## When to use

When you need a music bed or sound effect and cannot install Python, a GPU, or large sample libraries. Everything is synthesized from math in a single Node.js script.

## Technique

### 1. Upbeat music bed (`music.mjs`)

A multi-instrument synthesizer with seeded RNG for variation:

| Instrument | Synthesis | Role |
|-----------|-----------|------|
| Kick | Sine with pitch sweep (200→60 Hz) + tanh saturation | Low end |
| Hi-hat | Filtered noise burst, 80 ms decay | Time feel |
| Clap | Noise burst + comb filter, layered 3× | Backbeat |
| Pluck | Karplus-Strong (noise → delay → LP filter) | Melody |
| EP (electric piano) | FM synthesis (2-op), velocity-sensitive | Chords |
| Bass | Square wave + LP filter envelope | Foundation |
| Pad | Detuned saw pair + slow LP sweep | Atmosphere |

Patterns are 4-bar loops with per-instrument probability gates from seeded RNG. Same seed = same track.

### 2. Ambient pad + SFX (`synth.mjs`)

- **Singing bowl:** Additive synthesis (fundamental + 5 partials at non-harmonic ratios), slow attack, long decay
- **Slow chords:** 3-voice detuned triangle waves, chord changes every 8 beats
- **SFX:** Whoosh (filtered noise sweep), chime (FM bell), transition sweep

### 3. Output

Both scripts write a 44.1 kHz 16-bit WAV using raw buffer writes (no native addon).

## Dependencies

- Node.js 18+
- Zero npm dependencies

## Quality bar

- No clipping (samples clamped to ±0.95 before quantization)
- Deterministic from seed
- Music bed loops cleanly (last bar = first bar energy)
- Singing bowl partials decay naturally (no abrupt cutoff)
