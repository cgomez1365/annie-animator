# Engine requests from tier 3 (none blocking; every skill works around them)

1. `E.outBack(0, s)` returns 2.2e-16, not exactly 0. Code that guards with `if (k > 0)` draws a scaled glyph at about 0 px and the checker fails it as "text under 42 px". Workaround used: guard with `k > 0.01`. Request: clamp the ends exactly (return 0 at t <= 0 and 1 at t >= 1) for outBack, outElastic and the other overshoot curves.
2. The checker logs text that is drawn OFF screen (for example scene B of a whip pan parked at x 1200). Workaround: cull scenes that are not in view (`inView` in t3.1). Request: ignore text whose box is fully outside 0..1080 x 0..1920.
3. `ctx.filter = 'blur(...)'` costs about 35 ms per draw call on a full frame in @napi-rs/canvas. Workaround: draw a layer, blur once (`withBlur` in t3.1). Request: a note in engine/README.md.
4. `track()` and `prog()` with an infinite start (`prog(t, -Infinity, ...)`) return NaN; t3.1 guards it itself.
