# Annie the Animator: skill tree

45 skills in 9 tiers on one shared engine. Core 36: 35 verified, 1 partial, 0 failed (independent review: **7.3 / 10**, REVIEW.md). Plus 9 production/creative skills (t5.5–t8.2) added 2026-11-27.

Built 2026-11-19. Start with `engine/README.md`, then the skill you need (each folder has SKILL.md, module.mjs, demo.mjs, test.mjs, out/demo.mp4).

## Tier 0: Foundation

| id | skill | status | review | needs | what it does |
|---|---|---|---|---|---|
| t0.1 | [Easing and springs](skills/t0_1_easing-and-springs/SKILL.md) | verified | 8 | - | Pick the right motion curve or spring for every move so objects have weight. |
| t0.2 | [Timeline and seeded randomness](skills/t0_2_timeline-and-seeded-rng/SKILL.md) | verified | 8 | t0.1 | Schedule many things on one clock and add random-looking motion that is identical on every render. |
| t0.3 | [Render pipeline](skills/t0_3_render-pipeline/SKILL.md) | verified | 8 | t0.1, t0.2 | Turn a card file into a silent 1080x1920 MP4 and a contact sheet, identical on every run. |
| t0.4 | [Quality checker](skills/t0_4_quality-checker/SKILL.md) | verified | 8 | t0.3 | Check every card for frozen frames, unsafe text, small text, low contrast and banned claims before posting. |

## Tier 1: The tt10 core

| id | skill | status | review | needs | what it does |
|---|---|---|---|---|---|
| t1.1 | [Window frame](skills/t1_1_window-frame/SKILL.md) | verified | 8 | t0.1, t0.3, t0.4 | Draw the macOS-style window with traffic lights, a crossfading title, an entrance and exit, an adjustable size and content clipped to the inner rect. |
| t1.2 | [Page transitions](skills/t1_2_page-transitions/SKILL.md) | verified | 7 | t0.1, t0.2, t1.1 | Slide pages in and out of the window the tt10 way, with one header per page outside the window and a window title that changes only after the old page has gone. |
| t1.3 | [Physical object motion](skills/t1_3_physical-object-motion/SKILL.md) | verified | 8 | t0.1, t0.2 | Make objects jitter, pile up, scatter with seeded velocity and spin, land with a bounce and leave by physics instead of fading. |
| t1.4 | [Persistent motion](skills/t1_4_persistent-motion/SKILL.md) | verified | 7 | t0.1, t0.2, t0.4 | Keep every hold alive with running markers, highlight sweeps, pulsing meters, blinking cursors, bouncing dots and marching dashes. |
| t1.5 | [UI mockup kit](skills/t1_5_ui-mockup-kit/SKILL.md) | verified | 8 | t0.1, t1.1, t1.2 | Illustrated product screens: fields that fill, buttons that press, bubbles that pop, bars that grow, stamps that slam, toggles, tabs and ticks that draw. |
| t1.6 | [The closer](skills/t1_6_the-closer/SKILL.md) | verified | 8 | t0.1, t1.1, t1.2 | Time the hand-over and draw the end card: hook out, window and headers fade, gear mark, slogan pair, a Follow button that presses once, the footer and the 18+ line on AEON cards. |

## Tier 2: Motion principles and effects

| id | skill | status | review | needs | what it does |
|---|---|---|---|---|---|
| t2.1 | [Anticipation, overshoot, follow-through](skills/t2_1_anticipation-overshoot-followthrough/SKILL.md) | verified | 7 | t0.1, t0.2 | Give cards and UI a wind-up, a measured overshoot and a settle, with children that lag behind. |
| t2.2 | [Squash and stretch](skills/t2_2_squash-and-stretch/SKILL.md) | verified | 7 | t0.1, t2.1 | Deform shapes and short text with volume kept, for landings, taps and pops, inside hard limits. |
| t2.3 | [Particles, glow and light](skills/t2_3_particles-glow-light/SKILL.md) | verified | 7 | t0.1, t0.2 | Seeded sparks, dust, motes and trails plus additive glow, thresholded bloom, sweeps and glints. |
| t2.4 | [Masks, reveals and wipes](skills/t2_4_masks-reveals-wipes/SKILL.md) | verified | 7 | t0.1, t0.2 | Reveal and remove content with wipes, iris, split, diagonal, scan, ink and soft masks, and reveal text. |
| t2.5 | [Shape morph and path animation](skills/t2_5_shape-morph-and-path-animation/SKILL.md) | verified | 7 | t0.1, t0.2 | Draw strokes on, morph one icon or shape into another, and move objects along curves at even speed. |

## Tier 3: Camera, type and data

| id | skill | status | review | needs | what it does |
|---|---|---|---|---|---|
| t3.1 | [Virtual camera](skills/t3_1_virtual-camera/SKILL.md) | verified | 8 | t0.1, t0.2, t0.3, t0.4 | Move a camera over a 2D scene: push-ins, pans, parallax depth, handheld and impact shake, whip pans with motion blur and rack-focus blur. |
| t3.2 | [Kinetic typography](skills/t3_2_kinetic-typography/SKILL.md) | verified | 7 | t0.1, t0.2, t0.3, t0.4 | Animate text per letter, word and line, highlight and emphasise key words, count numbers in fixed cells, decode text and run it along a curve, all inside the safe zones. |
| t3.3 | [Data motion](skills/t3_3_data-motion/SKILL.md) | verified | 8 | t0.1, t0.2, t0.3, t0.4 | Animate bar, line and donut charts, sparklines, counters, delta badges and a before/after comparison so numbers read at phone size. |
| t3.4 | [Layout and composition](skills/t3_4_layout-and-composition/SKILL.md) | verified | 7 | t0.1, t0.2, t0.3, t0.4 | Place things on a vertical 9:16 card: grid, thirds, safe zones, type hierarchy, text that fits its box, and colours that stay legible. |

## Tier 4: Character and story

| id | skill | status | review | needs | what it does |
|---|---|---|---|---|---|
| t4.1 | [Vector mascot design](skills/t4_1_vector-mascot-design/SKILL.md) | verified | 8 | t0.1, t0.3 | Draw Cog, the BGI cog mascot, as 14 separate vector parts driven by one rig record, with a style guide and a silhouette test. |
| t4.2 | [2D rigging](skills/t4_2_2d-rigging/SKILL.md) | verified | 7 | t4.1, t0.1, t0.2 | Give Cog bones, two-bone IK, skinned limbs, 12 poses and walk and hop cycles whose feet stay planted. |
| t4.3 | [Expressions and acting](skills/t4_3_expressions-and-acting/SKILL.md) | verified | 8 | t4.1, t4.2, t0.1, t0.2 | Give Cog 12 readable emotions, natural blinks, snappy eye darts and reactions that wind up, pop and arrive part by part. |
| t4.4 | [Lip-sync](skills/t4_4_lip-sync/SKILL.md) | verified | 7 | t4.1, t4.3, t0.2 | Drive Cog's mouth from a voice track and its text: loudness envelope, syllables, 11 mouth shapes, lead and smoothing. |
| t4.5 | [Storyboard and hooks](skills/t4_5_storyboard-and-hooks/SKILL.md) | verified | 7 | t4.4, t0.2, t0.3 | Plan a 28 s or 16 s card before drawing it: beat sheets, 14 tested hook patterns, a pacing checklist and a storyboard.json that compiles into a timeline. |

## Tier 5: Sound and sync

| id | skill | status | review | needs | what it does |
|---|---|---|---|---|---|
| t5.1 | [Voice-synced scenes](skills/t5_1_voice-synced-scenes/SKILL.md) | verified | 7 | t0.2, t0.3 | Turn each Kokoro sentence clip into word start times so pictures, highlights and effects land on the word being said. |
| t5.2 | [Beat sync](skills/t5_2_beat-sync/SKILL.md) | partial | 6 | t0.1, t0.2 | Find a track's tempo and beats and use them to snap cuts and drive pulses, bounces and step lights. |
| t5.3 | [SFX design and mix](skills/t5_3_sfx-design-and-mix/SKILL.md) | verified | 7 | t5.1, t0.3 | Seven soft synthesized effects and an ffmpeg mix (voice -16 LUFS, effects, ducked bed) with measured loudness, true peak and envelope plots. |
| t5.4 | [Karaoke captions](skills/t5_4_karaoke-captions/SKILL.md) | verified | 7 | t5.1, t0.3 | Burn in captions at y 1470 with the current word wiped green as it is said, and write the .srt from the same timings. |
| t5.5 | [Training video production](skills/t5_5_training-video-production/SKILL.md) | verified | — | t5.1, t0.3 | End-to-end training video pipeline: Kokoro TTS voice-over, pure-JS music beds, ffmpeg assembly, QC checks. Proven on FQC. |
| t5.6 | [Music generation (algorithmic)](skills/t5_6_music-generation-algorithmic/SKILL.md) | new | — | t0.2 | Algorithmic music via music theory: scales, chord progressions, rhythm patterns → MIDI → SoundFont rendering. 100% original, no AI weights. Python. |
| t5.7 | [Music generation (AI model)](skills/t5_7_music-generation-ai/SKILL.md) | new | — | t0.2 | MusicGen-small (300M params), 12 style presets, GPU-accelerated. Prompt-driven original music generation. Python + PyTorch. |
| t5.8 | [Audio synthesis (pure JS)](skills/t5_8_audio-synthesis-js/SKILL.md) | new | — | t0.2 | Zero-dependency music beds and SFX in Node.js: drum machines, pads, singing bowls, seeded RNG. Runs anywhere Node runs. |

## Tier 6: Production

| id | skill | status | review | needs | what it does |
|---|---|---|---|---|---|
| t6.1 | [Series templates](skills/t6_1_series-templates/SKILL.md) | verified | 7 | t0.1, t0.2, t0.3, t0.4 | One JSON script becomes a whole series of cards with the same badge, progress bar, hook, window and closer. |
| t6.2 | [Batch render and cache](skills/t6_2_batch-render-and-cache/SKILL.md) | verified | 8 | t0.2, t0.3, t0.4 | Render many cards with 2 parallel workers and a content-hashed frame cache, redraw only what changed, resume interrupted runs, and prove the frames are identical. |
| t6.3 | [Platform packaging](skills/t6_3_platform-packaging/SKILL.md) | verified | 7 | t0.3, t0.4 | Check the video file, choose the cover frame and write the TikTok, Reels and Shorts post file with every limit, AI label, 18+ control and music credit checked. |
| t6.4 | [Accessibility and safety](skills/t6_4_accessibility-and-safety/SKILL.md) | verified | 7 | t0.1, t0.2, t0.4 | Score a card for flashing, contrast, reading time and motion, check caption files, and build calm motion modes into a card. |
| t6.5 | [Performance profiling](skills/t6_5_performance-profiling/SKILL.md) | verified | 8 | t0.3, t0.4 | Find where a frame's time and memory go (the card is about 11 percent, the engine's PNG encode about 73), cut the card's own cost with layer caches, and predict render time. |
| t6.6 | [Screen capture](skills/t6_6_screen-capture/SKILL.md) | verified | — | t0.3, t5.1 | CDP screencast recording of web apps via Playwright: frame capture, ffmpeg assembly, voice mixing, viewport presets, scene helpers. |
| t6.7 | [Soft/relaxing video batch](skills/t6_7_soft-relaxing-video-batch/SKILL.md) | new | — | t5.1, t5.8, t0.3 | 48-video batch pipeline for calm faceless TikTok/Reels: Kokoro Nicole voice, singing-bowl music, slow-zoom AI stills. Proven pipeline. |

## Tier 7: Masterwork and 3D

| id | skill | status | review | needs | what it does |
|---|---|---|---|---|---|
| t7.1 | [Pseudo 3D and isometric](skills/t7_1_pseudo-3d-and-isometric/SKILL.md) | verified | 8 | t0.1, t0.2, t0.3, t0.4 | Make flat canvas cards feel three-dimensional: flipping cards, isometric blocks, shaded faces, cast shadows and parallax depth. |
| t7.2 | [Mesh turntable](skills/t7_2_mesh-turntable/SKILL.md) | verified | 8 | t0.1, t0.3, t7.1 | Load an STL, thin it to a fast cached mesh, and render a smooth shaded turntable (with an optional printed-layer reveal) in plain JavaScript. |
| t7.3 | [Motion brand system](skills/t7_3_motion-brand-system/SKILL.md) | verified | 7 | t0.1, t0.2, t0.4 | The BGI and AEON signature motion as code: a named timing-curve library, a cog that turns in clicks, do and do-not rules, and a scorer that grades a card file and lists fixes. |
| t7.4 | [3D print pipeline](skills/t7_4_3d-print-pipeline/SKILL.md) | new | — | t7.2 | CadQuery/OpenSCAD parametric modeling → STL → Flash Studio/OrcaSlicer slicing → Flashforge Adventurer 5M. Holiday set and shelf tower as examples. |

## Tier 8: Creative AI

| id | skill | status | review | needs | what it does |
|---|---|---|---|---|---|
| t8.1 | [Image design](skills/t8_1_image-design/SKILL.md) | new | — | t3.4 | Prompt engineering for Midjourney/DALL-E/Flux/SD quality: wallpapers, backgrounds, product shots. Style control, composition, upscaling, batch generation. |
| t8.2 | [Render engine (blocks)](skills/t8_2_render-engine-blocks/SKILL.md) | new | — | t0.3, t5.6 | Template-based video rendering: JSON manifest → visual blocks → queue → batch output. Music and voice layered separately. Server mode for API-driven rendering. |

## Honest limits
- (major) all: No human has played any demo video or listened to any audio; motion judged from stills and numbers only.
- (major) t4.1: Cog mascot design has not been shown to or approved by the CEO.
- (minor) t5.2: Partial: on bed E detected beat is half a beat off; BEDS constants must be used.
- (minor) t4.4: Lip-sync never judged against real sound; syllable accuracy tuned in-sample.
- (minor) all: Demos are 7.5-8 s with ~2.7 s closer, so the technique gets about 4.5 s; several features are unit-tested but not shown (t1.2 directions, t1.3 gravity, t1.5 signature, t2.4 text reveals, t3.3 vertical bars).
- (minor) t6.3: Platform limits are 2026-10-29 research, not re-read from live apps.
- (minor) engine: Open engine requests: raw-frame pipe to ffmpeg (about 2.7x faster) and frame workers that never yield (about 3.7 GB per worker).
- (minor) t7.2: skill.json lists cache/ which is absent until first run; 6 exports lack JSDoc (t2.1 x2, t3.4, t5.3, t6.1, t6.3).
