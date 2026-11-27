# Engine requests from tier 5 (sound and sync), 2026-11-19

The engine was not edited. Each item below was worked around inside the t5 skill folders.

1. **testkit: allow a second, audio output.** `runSkillTest` requires `demo.mp4` to be silent (right for the card) and calls `process.exit`, so a skill that must also prove its audio cannot add steps after the render. Request: an optional `after({ out, result })` async callback that runs after the render and QC and before exit, and whose failures count. Workaround used: each t5 `test.mjs` repeats the testkit steps by hand (renderCard, qcCard, contact.png, test_result.json) and then muxes `out/demo_av.mp4` and measures it.
2. **qc: a switch for the caption band warning.** Burned-in captions must sit at y 1470, inside the Reels caption band (y 1250-1580), so the checker prints one warning per word for the whole run (t5.4 shows 12). Request: `META.qc.captionBand: false` (or a `META.captions = { y }` declaration) that silences that warning for text declared as captions. Workaround: none, the warnings are expected and listed.
3. **qc: do not count the breathing scale of a 42 px chip as under 42 px.** A chip drawn at 42 px and scaled 0.975-1.025 fails "text under 42 px" for 1 s. Workaround: draw such text at 46 px.
4. **canvas: a PNG helper.** `createCanvas(...).toBuffer('image/png')` works but is undocumented in the README; t5.3 uses it for envelope plots. Request: document it (and say that plots need no QC hook).
