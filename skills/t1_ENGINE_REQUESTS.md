# Engine requests from tier 1 (none block anything; every one was worked around inside the skill modules)

1. `parts.windowFrame` / `windowInner`: no title crossfade, no rounded-bottom clip, no resize. t1.1 `module.mjs` does all three (`drawFrame`, `clipInner`, `lerpRect`). Suggest adopting `titleState` and `clipInner` into the engine.
2. `parts.closer`: no options for the Follow press time, label, glow strength or the mark. t1.6 `drawCloser` reproduces it exactly (pixel test, at most 40 differing pixels) and adds them. Suggest the engine's `closer` call it.
3. `qc.mjs` "text under 42 px" warns on the Follow label for 0.1 s while it pops in (outBack scale), on every card. Harmless warning (under 0.5 s). Suggest exempting text whose own scale is rising from 0 inside the first 0.4 s of its entrance.
4. `timeline.page` returns `dx` only; vertical slides are derived in t1.2 `pageSlide` by mapping `dx` to `dy`. Suggest an optional `dir` argument.
