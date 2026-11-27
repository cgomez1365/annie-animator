---
name: pseudo-3d-and-isometric
description: Gives flat 2D canvas cards real depth with perspective cameras, true isometric cubes and tiles, flipping cards, shaded faces, cast and contact shadows, lit floors and parallax layers, with no 3D library. Use whenever a card needs a card flip, a cube or block stack, an isometric floor, objects that turn in space, layered depth behind a subject, or "make it feel 3D", even if nobody says the word perspective.
---

# Pseudo 3D and isometric (t7.1)

Prerequisites: t0.1 (easing and springs), t0.2 (timeline and seeded rng), t0.3 (render pipeline), t0.4 (quality checker). Code: `module.mjs`, pure functions on the engine's canvas. No `Math.random`, no `Date`.

## When to use

- A card, tile or screen must turn in space (flip, swing, tilt): `cardQuads` + `rotY` + a perspective camera.
- Blocks, boxes, stacks, tiles, "BGI cubes": `boxQuads` + `isoCamera` + `floorGrid` + `castShadow`.
- Depth behind a subject (gears, skyline, dust sheets): `parallax` layers while a camera value slides.
- Not for models with thousands of triangles: use t7.2 (mesh-turntable).

## The model in one paragraph

World axes: x right, y DOWN, z away from the viewer. A shape is a list of quads (4 world points in the order top-left, top-right, bottom-right, bottom-left as seen from outside, plus the outward normal). `prepare()` turns them into view space, drops faces that look away from the eye, lights them and sorts far to near. `drawPrepared()` paints them. Light lives in VIEW space (it stays with the camera, so a turning object keeps a steady look). Positive pitch shows top faces.

## Recipes

Perspective camera for a flipping card:
```js
const cam = makeCamera({ cx: 540, cy: 830, f: 1200, d: 1300, pitch: 0.1 });   // d 1100-1800: smaller d = stronger lens
const quads = cardQuads([0, 0, 0], 400, 420, 14, rotY(angle), { front: FRONT, back: BACK, fill: '#1a2330', edge: rgba(P.green, 0.5) });
drawQuads(ctx, quads, cam, { texN: 12, sheen, light: { ambient: 0.55, diffuse: 0.5 } });
```
- Flip: `angle = PI * sum(E.outBack(prog(t, tn, tn + 0.85), 1.4))` over flips about 1.1 s apart. 0.8-0.9 s per flip. The overshoot (outBack 1.3-1.6) is the "latch". The back texture is drawn upright; the code un-mirrors it.
- Edge-on (90 degrees) the card is only its thickness: 10-16 px thick looks right; thinner flickers.
- `sheen` 0..1 slides a soft white band across the face. Loop it once per flip: `prog(((t - t0) % 1.1 + 1.1) % 1.1, 0.1, 0.9)`.
- Add a bob (`12 sin(2.3 t)`) and a tiny pitch wobble (`0.03 noise1(1.3 t)`) so a hold is never frozen.

Isometric blocks:
```js
const ISO = isoCamera({ cx: 540, cy: 1300, scale: 1.2 });            // 35.264 degree pitch, 45 degree yaw, no foreshortening
floorGrid(ctx, ISO, { floorY: 0, half: 260, step: 52 });               // lit floor with a green grid: shadows need something to land on
const bq = boxQuads([x, -65 - lift, z], [130, 130, 130], rotY(turn), { fill: P.green, edge: 'rgba(4,10,8,0.55)' });
castShadow(ctx, bq.flatMap(q => q.pts), ISO, { dir: [0.6, 1, -0.05], floorY: 0, alpha: 0.75, blur: 9 });   // BEFORE drawQuads
drawQuads(ctx, bq, ISO, { light: { spec: 0.15 } });
```
- The floor sits at y = 0. A box of height h rests with its centre at y = -h/2. Lifting is a more negative y.
- Cubes in a row that looks horizontal on screen: positions with x = z (screen x = (x + z) / sqrt2).
- Drop: `lift = 560 * (1 - E.outBounce(prog(t, t0, t0 + 0.7)))`. Hop plus quarter turn every 1.5 s: `lift = 95 sin(PI u)^0.8`, `turn = 0.25 (n + E.outBack(u, 1.3))` full turns, `u = prog(local, 0, 0.5)`.
- Shadow: alpha 0.75 on the floor, falling to about 0.4, blur growing (8 + lift / 28) as the block rises. `contactShadow(ctx, cx, cy, rx, ry, height)` does the same for a loose object with no floor plane.
- Face tones with the defaults (ambient 0.36, diffuse 0.72): top about 1.0, one side about 0.57, the other about 0.36. Keep ambient at 0.3 or more on the dark BGI ground.

Parallax:
```js
const q = parallax(depth, camX);                                  // { dx, dy, s, a }: far = slower, smaller, fainter
cx = 540 + (x - 540) * q.s + q.dx;   colour = depthTint(P.green, depth);
```
Depths 1.6, 2.5 and 4 look right. Slide the camera 150-200 px over 4-5 s with `E.inOutSine`. Far layers turn slower and stay dim (alpha about 0.45).

## Module API

Vectors: `add sub mul dot cross norm`. Matrices (9 numbers): `I3 rotX rotY rotZ mmul apply`. Cameras: `makeCamera({cx,cy,f,d,yaw,pitch,roll,ortho})`, `isoCamera({cx,cy,scale})`, `project(p, cam)` -> `[x, y, viewZ, scale]`, `toView`, `projectView`. Shapes: `boxQuads(center, size, R, {fill, tex, edge, faces})`, `cardQuads(center, w, h, thick, R, {front, back, fill, edge})`. Lighting: `LIGHT`, `lambert(n, {light, ambient, diffuse, spec, shine})`, `shade(color, k)`. Drawing: `prepare`, `drawPrepared`, `drawQuads`, `drawTexturedQuad(ctx, tex, viewPts, cam, n)`, `affine`, `area2`. Shadows and floor: `hull`, `onFloor`, `castShadow`, `contactShadow`, `floorGrid`. Parallax: `parallax`, `depthTint`. Helpers: `texture(w, h, fn)` (a drawing surface), `isoPoint(x, y, z, {cx, cy, s})` (camera-free iso for simple diagrams, y up).

## Common failures

- Texture looks like a sticker: lighting did not reach it. `drawPrepared` darkens textured faces by `1 - k`; keep `ambient` 0.5 or more on cards or the front goes muddy.
- Seams between grid cells: use `texN` 12-16 when `d` is under 900.
- Wrong overlap: the sort uses mean depth per quad. Convex objects that do not interpenetrate sort right; two blocks closer than a block width in depth can fight. Space them, or draw object by object far to near.
- Shadow invisible: the floor was as dark as the shadow. Use `floorGrid` (fill `#131a23`) and alpha 0.6-0.75. A light from the left (the default) wants `dir` with positive x. Draw the shadow BEFORE the object.
- Hard shadow edge: `blur` under 4 px looks cut out; 8-14 reads as soft light.
- Text on a texture: textures are drawn once into `texture()` canvases. The checker does not read them, so keep text at 100 px or more in the texture so it stays readable at 60 degrees.
- Ortho camera and `d`: `d` is ignored in ortho. For perspective, to make things bigger raise `f`, not `d`.
- A flip with no overshoot looks like a slideshow. Always `outBack` 1.3-1.6.
- A card overlapping the headline: the hook sits at y 400-620 until about 2.0 s. Keep the card top at 630 or lower.

## Quality bar (what the test measures)

1. Projection is exact: the origin lands on (cx, cy); perspective scale is f / (d + z); iso axes at 30 degrees, equal length, foreshortening 0.8165.
2. An iso cube shows exactly 3 faces; a head-on perspective box shows 1; a card shows its front at 0 degrees, its back at 180, and only its edge at 90.
3. The back texture is never mirrored (TL left of TR, above BL); visible quads wind clockwise.
4. Painter's sort: the near quad covers the far one at the pixel.
5. Lighting: top face brightest, the two side faces differ by 0.05 or more, all brightness between 0.3 and 1.3.
6. Textures land where mapped, flat-on and under yaw 0.9 with d 700 (red and white probes read back from pixels), with 0 holes in 841 interior samples.
7. Shadows: the hull centre darkens the floor, lower light gives a longer shadow, the contact shadow fades with height.
8. Parallax: deeper layers move slower, shrink and fade. The same inputs give identical pixels.
9. Demo: 5-8 s, 1080x1920, silent, engine QC passes (no frozen run over 0.5 s, safe zones, closer). By eye on `out/contact.png`: shadows visible, card clear of the headline, cubes inside the frame.

## Run it

```
node test.mjs                          # unit checks + full-size render + QC (about 1 minute)
ANNIE_PREVIEW=1 node test.mjs          # 540x960 while iterating
node ../../engine/render.mjs demo.mjs --still 3.2 --out out    # one full-size frame
```
Outputs: `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/qc_zones.png`, `out/test_result.json`.
