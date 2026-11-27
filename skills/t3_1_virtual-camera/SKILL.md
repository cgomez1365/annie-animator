---
name: virtual-camera
description: Moves a virtual camera over a 2D animated scene (push-ins, pans, parallax depth layers, handheld shake, impact shake, whip pans with motion blur, rack-focus depth blur) as a stack of small parts that add up to one camera. Use whenever a card should feel filmed instead of slid around, a scene needs depth, a cut should be a whip pan, something lands with an impact, or a shot should shift focus from a near object to a far one, even if nobody says the word "camera".
---

# Virtual camera (t3.1)

Prerequisites: t0.1 (easing), t0.2 (timeline, seeded noise), t0.3 (render), t0.4 (quality checker). Code: `module.mjs` on the engine. Demo: `demo.mjs` (8 s: push-in with parallax, whip pan, rack focus, impact shake).

## When to use

The scene has more than one thing in it and should feel like a real shot: a slow push-in on a dashboard, a whip from one idea to the next, a thud when something lands, depth between a background, a hero panel and foreground chips. Do not move the camera under text that has to be read: keep body text still for 0.8 s at least (push-in under 0.1 zoom per second is fine).

## The model

The camera is `{x, y, zoom, rot}`: x,y = px offset from rest, zoom = factor (1 = rest), rot = radians. A rig adds up parts: x, y, rot are SUMMED, zoom is MULTIPLIED. Each part is a function of t, so any frame can be drawn alone.

`applyCamera(ctx, cam, par)` sets the ctx transform for one depth layer. `par` is the depth: 1 = the hero plane, 1.5-1.8 = near (moves and grows more), 0.2-0.4 = far, 0 = fixed to the screen. Layer zoom = 1 + (zoom-1) * par, layer offset = offset * par, roll is the same on every layer. Text drawn inside keeps its true place in the transform, so the checker still reads it.

## Recipes (numbers that look right)

- Slow push-in: `pushIn({t0, t1, from:1, to:1.12})`, 1.5-2.5 s, inOutCubic. Punch-in: 1 to 1.25 in 0.6 s, outCubic. Never above 1.3: the layers go soft.
- Pan: `pan({t0,t1,to:[x,y]})`, 0.8-1.4 s, inOutCubic. Panning 300 px moves a par 1.8 layer 540 px: that is the parallax.
- Handheld: `handheld({amp:6, rot:0.003, freq:1.6, seed})`. amp 4-8 px, roll 0.002-0.005 rad, freq 1.2-2.2. Above 12 px or 4 Hz it looks like an earthquake. It never settles, so every hold keeps moving (the QC fails still holds).
- Impact shake: `shake({hits:[[t, 0.7]], dur:0.55, amp:30, rot:0.02})`. Trauma falls linearly, offset = amp * trauma^2: starts violent, dies smooth. 0.3 = bump, 0.7 = slam. Put the hit on the frame something lands (2 frames after a whip stops).
- Whip pan: `whip({t0, dur:0.5, dx:1200})`, inOutQuart, 0.35-0.55 s, travel 900-1500 px. Add a roll: `moveTrack({rot:[[t0,0],[t0+0.25,0.035,'inOutSine'],[t0+0.53,0,'outCubic']]})`. The second scene lives `dx * par` further along on each layer (draw it translated by `dx*par`).
- Free moves: `moveTrack({zoom:[[0,1],[2,1.14,'inOutCubic'],[2.25,1.14],[2.75,1.02,'inOutCubic']], x:[...], rot:[...]})` for anything that goes out and comes back.
- Rack focus: `focusBlur(par, focus, aperture)` = aperture * |par - focus| px (aperture 10-14 soft, 16-24 strong, cap 28). `rackFocus([[t,par],...])` is the focus distance over time: hold 0.4 s or more on each target, move in 0.6-0.9 s inOutCubic.

## Motion blur

`motionBlur(ctx, t, drawScene, {rig, shutter:0.55})` draws the scene 2-16 times at sub-frame times and averages them in float (exact, no darkening). drawScene(c, ts) must paint the WHOLE scene including the opaque ground, using the camera at ts. One draw is used when the camera moves under 4 px a frame. Draw headline, tag, kicker and closer AFTER it so they stay sharp. It replaces the whole canvas (putImageData): call it first on a fresh ctx. A whip at 300 px per frame with shutter 0.55 smears about 160 px using 16 samples.

## Blur and cost

`withBlur(ctx, px, c => {...})`: draw the layer on `c` (same transform as ctx); it is blurred once. NEVER use `ctx.filter` around many draw calls: it costs about 35 ms per call on a full frame (46 dots took 1.6 s). A whip frame costs about 16 samples x 3 layers; the 8 s demo renders in about 1 minute at preview size on the shared iMac.

## Common failures

- Text of an off-screen scene is still logged by the checker (x beyond 940 inside y 800-1580 counts). Cull it: `if (cam.x < 1000) sceneA(...)`, `inView(cam, par, sceneOff)`.
- Text near the bottom: zoom pushes it down. A baseline at y 1500 at zoom 1.16 lands at 1586: fail. Keep world text under y 1460 or cap zoom at 1.14.
- One shared handheld seed on two rigs: they shake in lockstep. Give each its own seed.
- `handheld` defaults to active forever. Give `t0/t1` to fade it in and out when a shot must be calm.
- Whip with no blur looks like a glitch; whip with 360 degree shutter and 5 samples looks like ghosts: keep shutter 0.5-0.6 and 12+ samples.
- Backgrounds that move with the camera cannot fake depth. Put dots, marks and glow on par 0.2-0.4 and the grid screen-fixed.
- Rack focus on text you need to read: blur the text only for the first 0.5 s.

## API (`module.mjs`)

`rig(...parts).at(t)`, `pushIn`, `pan`, `moveTrack`, `handheld`, `shake`, `whip`, `applyCamera`, `layerCam`, `worldToScreen`, `camSpeed`, `motionBlur`, `focusBlur`, `rackFocus`, `withBlur`, `inView`.

## Quality bar (measurable)

- Camera maths: rest = identity; par 1 moves 100 of 100 px, par 0.3 moves 30, par 0 stays; zoom keeps the centre; applyCamera equals worldToScreen.
- pushIn, pan, whip hit their end values exactly and hold; whip peak speed is over 3x its average; whip is monotonic.
- handheld is deterministic, bounded by amp, never zero; shake is exactly zero outside its window and decays.
- motionBlur keeps the total light within 3 percent, is deterministic, and smears a moving square to over 2x its width.
- withBlur softens edges, keeps total light, honours the ctx transform; blur 0 equals a plain draw.
- Demo: engine QC passes on the card and on the mp4 (no frozen frames, no text in the red zones, 42 px floor, closer present). No `Math.random` or `Date`.

## Run it

`node test.mjs` (add `ANNIE_PREVIEW=1` for a fast 540x960 run). It writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/qc_zones.png`. Exit 0 only if every check passes.
