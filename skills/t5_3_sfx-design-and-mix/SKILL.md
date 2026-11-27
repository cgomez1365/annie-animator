---
name: sfx-design-and-mix
description: Designs and mixes the sound of a BGI video: the seven soft synthesized effects (whoosh, pop, tick, chime, stamp, success, wrong) with their pitches, lengths and levels, and an ffmpeg mix that puts the voice at -16 LUFS, effects at 32% of the bus, the music bed under it (optionally ducked 5-6 dB while the voice speaks) with a true peak at or below -1 dBTP, plus the measurements that prove it. Use whenever a card or lesson needs sound effects, a music bed, ducking, a loudness check, an envelope plot, or an audio gate, even if the request only says "make it sound right" or "mix the audio".
---

# SFX design and mix (t5.3)

Prerequisites: t5.1 (cue times for effects), t0.3 (render pipeline). Code: `module.mjs`; `demo_audio.mjs` builds the demo's sound; `demo.mjs` draws it from the measured stems.

## When to use

Any video with sound. Sources of truth: `ai-training-video/scripts/synth.mjs` (the effects, CEO-approved), `render.mjs` (the lesson mix) and `qc.sh` (the gates). This skill re-implements them in one tested module and adds ducking and plots. Audio cannot be looked at, so every claim here is a measurement (LUFS, dBTP, dB of reduction, onset times, envelope PNGs). It is NOT heard until a person listens.

## The seven effects (all synthesized, deterministic, mono 48 kHz, peak -3 dBFS, 2 ms fade in, 5 ms fade out)

| effect | length | sound | use it for | against its cue |
|---|---|---|---|---|
| whoosh | 0.8 s | band-limited noise, centre 250 -> 3450 Hz -> 250 Hz, sin^2 envelope, peak at 0.4 s | scene change | starts 0.05 s BEFORE the new scene |
| pop | 0.16 s | sine 420 -> 940 Hz in 40 ms, decay 22/s | chip, bubble, item appears | on the word |
| tick | 0.08 s | sine 2100 Hz, decay 90/s | a row or check lands; may repeat | on the word |
| chime | 1.6 s | 880 + 1318.5 + 1760 Hz, decays 3.2/4.5/7 per s | a highlight, end card | on the word |
| stamp | 0.5 s | 68 Hz thump (decay 14/s) + 600 Hz-filtered noise burst (11 ms) | a stamp slams in | ON the word |
| success | 1.2 s | C5 (523.25 Hz) then G5 (783.99 Hz) 0.13 s later | correct answer, check | on the word |
| wrong | 0.5 s | 196 + 207 Hz (11 Hz soft beat), decay 7/s | wrong answer, cross; never a buzzer | on the word |

In a mix each effect plays at `0.32 (sfx bus) x gain`: whoosh 0.5, chime 0.7, success 0.8, wrong 0.8, stamp 0.9, pop and tick 1.0 (table `SFX`). Rules (`lintSfx` checks them): never two of the same effect within 0.12 s; never more than three effects starting within 0.15 s; nothing outside the clip. Pair every visual event with one effect; skip decorations that are not events.

## The mix (`mixAudio(spec, outPathWithoutExtension)`)

1. **Voice:** each sentence wav placed with `adelay` (by arithmetic from t5.1, never by ear), `amix normalize=0`, `loudnorm=I=-16:TP=-1.5:LRA=11`, resampled to 48 kHz.
2. **Effects:** `volume = 0.32 x gain`, `adelay`, `amix normalize=0`.
3. **Bed:** `volume=gain` (0.10 flat, or 0.16 with ducking), 2 s fade in, 3 s fade out, trimmed to the clip. Beds: A, D, E from `ai-training-video/assets/music/` (t5.2 has their tempos).
4. **Ducking (`music.duck: {}`):** `sidechaincompress` on the bed keyed by the voice, `DUCK = {threshold:0.06, ratio:2, attack:15 ms, release:450 ms}`: the bed drops 5.2-6.4 dB under speech and is back to 0.0 dB half a second after the last word. With bed gain 0.16 that lands at about the level of the old flat 10% under the voice, and fuller in the gaps. Tried and rejected: threshold 0.03 / ratio 3 = 11-12 dB (pumps, the bed vanishes).
5. **Sum and scale:** the three buses are summed, the sum is scaled (`volume=Δ dB`) so the whole mix reads -16.0 LUFS, then `alimiter=limit=0.85` (-1.4 dBFS) and padded/trimmed to the exact length. The scale is measured twice if the first pass misses by more than 0.25 LU.
6. Outputs: `<out>.wav`, stems `<out>_voice.wav`, `_fx.wav`, `_music.wav` (before the final scale), `<out>_graph.txt` (the exact ffmpeg graph).

```js
const r = mixAudio({ total: 7.8, voice: [{ file: 's07.wav', at: 0.35 }],
  sfx: sfxFromCues([{ name: 'pop', t: cue(tl, 0, 'Paris') }]),
  music: { file: 'bed_D.wav', gain: 0.16, duck: {} } }, 'out/mix');   // r.loudness = {lufs, lra, truePeak, silences}
muxAudio('card.mp4', r.mix, 'card_av.mp4');
```

## Gates (`GATES`, `checkGates`, same as `qc.sh`)

Integrated loudness -18..-14 LUFS (aim -16), true peak at or below -1 dBTP, and no more than the planned quiet stretches (`silences` counts runs of 2.5 s under -50 dB). `measureLoudness(file)` uses ffmpeg `ebur128=peak=true`; test.mjs checks the meter itself against a 997 Hz sine at -20 dBFS (reads -23.0 LUFS) and a 0.5-peak sine (-6.02 dBTP). AAC encoding moved the demo's true peak by 0.1 dB: measure the FINAL mp4, not only the wav.

## Measuring and plotting

`rmsDb`, `windowDb`, `peakDb`, `dominantHz`, `centroidHz`, `spectrum`, `onsetTime(pcm, sr, from, frac, win)`, `plotEnvelopes(lanes, png, {marks})` (lanes of dB envelopes with vertical cue marks). Look at `out/sfx_envelopes.png` and `out/mix_envelopes.png` after any change. Compare duck vs no-duck by building the same spec twice (that is how the 5-6 dB is measured).

## Module API (`module.mjs`)

`SR`, `SFX`, `GATES`, `DUCK`, `synthSfx`, `writeWav`, `writeSfxLibrary`, `decodeAudio`, `rmsDb`, `windowDb`, `peakDb`, `spectrum`, `dominantHz`, `centroidHz`, `onsetTime`, `measureLoudness`, `checkGates`, `mixAudio`, `muxAudio`, `sfxFromCues`, `lintSfx`, `plotEnvelopes`.

## Common failures

- Voice under the music: the voice must be -16 LUFS BEFORE the bed is added; never `loudnorm` the whole mix (it squashes the effects).
- Effects that sit on the word 120 ms late: fire from the t5.1 cue, with the whoosh's -0.05 s. An effect's own attack must be under 15 ms (all but whoosh and chime are).
- `amix` without `normalize=0` halves each input per extra input. Always `normalize=0`.
- Re-using a filter label in ffmpeg (`[voice]` twice) fails silently in some builds: the module splits each bus with `asplit` into new names.
- Limiter at 0.89 (render.mjs) can leave true peak above -1 dBTP after AAC; 0.85 leaves margin.
- Ducking too deep (12 dB) pumps; too shallow (under 3 dB) leaves the voice fighting the bed. Test on the real voice.
- Not padding: a mix shorter than the video gets cut by `-shortest`. The module pads to `total`.
- Plot lanes use dBFS over a 60 dB window: a 6 dB duck looks small. Trust the number.

## Quality bar (measured; `test.mjs` fails below it)

- Each effect: length within 10 ms of the table, peak -3.0 +-0.2 dBFS, silent first and last sample, no DC, identical on every call; pitches within 8-60 Hz of the design (chime 880, tick 2100, stamp 68, wrong 196+207, success 523.25 then 783.99, pop rising, whoosh brightening then peaking mid-sound).
- Meter: sine reads -23.0 LUFS and -6.02 dBTP (+-0.3).
- Demo mix: -16.0 LUFS (gate -18..-14), true peak -4.5 dBTP (gate -1), voice stem -15.5 LUFS, bed 21.9 LU under the voice, effects at least 6 dB under the voice but audible; length 7.8 s.
- Ducking by A/B: 5.2-6.4 dB under speech, 0.0 dB half a second after.
- Effect placement: each effect mixed alone at 0.30 s starts within 15 ms (whoosh and chime within 120 ms because they rise softly; measured 0-1 ms and 68 ms).
- `demo_av.mp4`: passes the gates after AAC (-16.0 LUFS, -4.6 dBTP), audio inside is within 30 ms of the wav.
- Card: 1080x1920, 7.8 s, engine QC pass.

## Run it

```
cd skills/t5_3_sfx-design-and-mix
node test.mjs                  # about 2 min, exit 0 only if all pass
ANNIE_PREVIEW=1 node test.mjs  # 540x960
```
Outputs in `out/`: `demo.mp4` (silent), `demo_av.mp4`, `demo_mix.wav` + stems + `demo_mix_graph.txt`, `sfx_envelopes.png`, `mix_envelopes.png`, `contact.png`, `mix_data.json`, `test_result.json`. Fixtures: one Kokoro sentence (Heart), a 16 s excerpt of bed D.

## Not verified

- Nobody listened. Levels, ducking taste and effect character are measured only.
- The effects were re-implemented from `synth.mjs` with fades applied before normalization: tick's peak now reads -3.0 dBFS (it was -4.5 in the original, because its peak sits inside the fade). Not A/B compared by ear with the CEO-approved set.
- One voice (Heart) and one bed (D, 16 s). A full 3-minute lesson mix was not rebuilt with this module (the lesson pipeline still uses render.mjs's own mix).
- True peak is ffmpeg's ebur128 estimate (4x oversampling), not a second meter.

## Next skills

t5.4 (captions) takes the same word times as the effects.
