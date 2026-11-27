# Engine requests from the tier 2 builder (2026-11-19)

Nothing here blocked the work. Every item was worked around inside the skill modules. The engine was not edited.

1. Bloom (optional). t2.3 `bloomPass` is a thresholded down-and-up-scale bloom (about 60 ms for a full 1080x1920 frame, best of 6, shared iMac). If other tiers need it, move it into `engine/canvas.mjs` so skills do not each keep a copy.
2. SVG path tools (optional). t2.5 `parseSvgPath`, `makePath`, `iconPath`, `pointAt` are generic. Tier 3 chart and icon builders will want them; they could live in the engine as `engine/paths.mjs`.
3. Test runner clobbering. `runSkillTest` writes into the skill's own `out/`. Two runs of the same skill at the same time (for example a slow background run and a new foreground run) overwrite each other's `demo.mp4` and `test_result.json`. This happened once on t2.1 (a stale preview run finished late and replaced the good result). Suggest: write to `out/.tmp-<pid>` and rename at the end, or lock the folder.
4. Checker note (no change needed). Text that is drawn under a partial mask (t2.4 tile text, t2.2 chip text while it pops) is logged by the checker at full size for the whole frame. It reported only warnings (text under 42 px while scaling), never a failure. Keep as is.
5. Closer warning (no change needed). The engine closer's "+ Follow for more" button reports a warning for under 0.10 s while it pops in (16 px at the first frame). It is a warning only.
