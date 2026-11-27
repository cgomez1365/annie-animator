# Engine requests from tier 4 (2026-11-19)

Nothing blocked tier 4. These are conveniences I worked around inside my own modules. The engine was not edited.

1. Audio helper. t4.4 has its own `decodeAudio` (ffmpeg to float samples) and `loudness` (100 Hz envelope). If other tiers need audio (music beds, sound effects), move them to `engine/audio.mjs`.
2. Contact sheet at chosen times. `render.mjs` writes 12 evenly spaced frames. For story cards I needed 12 frames at chosen seconds (I used a scratch script that calls `frame(t)` and tiles them). A `--contact 0.4,0.9,1.5,...` option would remove that.
3. Window title crossfade. `windowFrame` draws the whole window for each title, so a crossfade has to draw the frame twice (t4.5 demo does). A `titles: [[text, alpha], ...]` option would be cleaner.
4. `poseTrack`-style helpers return shared objects when a key is held. In t4.2 I fixed it in my own module (it clones), but `track()` in `timeline.mjs` has no object-valued equivalent; a `trackObj` that clones would help.
