---
name: mesh-turntable
description: Loads a binary STL 3D model, thins it to a fast triangle count by vertex clustering (cached on disk), and renders a smooth, shaded, anti-aliased turntable video frame by frame in plain JavaScript with a z-buffer, in BGI's look (dark ground, green rim light, pedestal, optional "being printed" reveal). Use whenever a card must show a 3D-printed figurine, a part, a product model or any STL or mesh turning on screen, a product-ad spin, or a "this is what it looks like from every side" shot, even if no one says STL or turntable.
---

# Mesh turntable (t7.2)

Prerequisites: t0.1 (easing), t0.3 (render pipeline), t7.1 (pseudo 3D, for the pedestal and floor ideas). Code: `module.mjs`. No 3D library, no GPU. Verified on `dragon_final_v9.stl` (43 MB, 861,384 triangles).

## When to use

A figurine, bracket, vase or any `.stl` must rotate in a card: product ad, "printed in minutes" reveal, before/after of a print. Not for scenes with many objects (this renders one mesh), not for textures (shading only, one material).

## The pipeline in four calls

```js
import { loadMesh, renderMesh, fitScale, projectModelPoint, drawReflection } from './module.mjs';
export async function init() {                                   // once per worker
  MESH = await loadMesh(STL, { target: 150000, up: 'z' });       // read + decimate + cache, or load the cache
  SCALE = fitScale(MESH, { maxW: 1120, maxH: 700, pitch: 0.2 });  // px per mm so a full turn stays in the box
}
export function frame(t) {
  const pose = { yaw, pitch: 0.2, scale: SCALE, cx: 540, cy: 1010, dist: 900, clipY };
  const r = renderMesh(MESH, pose, { ss: 2 });                   // {cv, x0, y0, w, h, coverage}
  ctx.drawImage(r.cv, r.x0, r.y0);
}
```
- STL slicer files are Z-up: `up: 'z'` stands the model on its feet. Pass `up: 'y'` for models that are already Y-up.
- World after loading: millimetres, x right, y UP, feet at y = 0, centred on x and z. The model turns about the vertical axis through its footprint centre. `mesh.height`, `mesh.radius` (widest reach from that axis), `mesh.width`, `mesh.depth` are in mm.
- `pose.scale` = px per mm at the model centre. `dist` = eye distance in mm (900 gives a gentle lens; 500 is strong, 2000 almost flat). `pitch` 0.15-0.3 rad looks down on the figure; 0 is eye level.
- `projectModelPoint(mesh, pose, [x, y, z])` returns the screen `[x, y, depth]` of a point in model coordinates (y up from the feet, before the yaw): use it to place the pedestal, rings and glows exactly under the figure. A circle of radius r at height y is a ring of such points.

## Decimation and cache

- `decimate(tris, {target})` is vertex clustering: every vertex snaps to a cubic grid cell, the vertices of a cell merge into their mean, collapsed triangles drop. The cell size is found by cheap counting passes, so you land within about 8 percent of `target`. Measured: 861,384 to 151,014 triangles in 322 ms (cell 0.876 mm); reading the 43 MB file takes 83 ms.
- Target 150,000 is the sweet spot at 1080x1920: about 150 ms per frame. 60,000 starts to round off claws and eyes; 300,000 doubles the frame time with little visible gain.
- Detail finer than the cell is rounded off. Thin walls thinner than a cell can vanish: raise the target for fine models.
- `loadMesh` caches to `cache/<name>.<size>.<mtime>.t<target>.v1.mesh` next to the module (2.7 MB for the dragon; the key includes size, mtime and target, so an edited STL rebuilds). Written atomically (temp file + rename): two workers racing is safe. Delete `cache/` any time.
- `parseSTL` reads binary and ASCII; a file that is neither throws. Meshes with no consistent winding render with holes: re-export from the slicer.

## What the renderer does (and the numbers)

1. Transform every vertex (yaw, pitch, perspective). 2. Light per vertex, interpolate across the triangle (Gouraud): key light upper left (warm, 1.1), cool fill from the right (0.2), green BGI rim light from behind (0.75) plus a Fresnel edge, hemisphere ambient, Blinn-Phong highlight (0.45, shine 42), soft shoulder `1 - exp(-1.25 x)` so whites never clip. 3. Fill triangles into a 2x supersampled z-buffer (cull back faces). 4. Box-downsample to straight alpha: smooth silhouettes. 5. Cavity darkening: a pixel deeper than the mean depth of covered pixels around it (radius 0.8 mm and 3.2 mm) is darkened; jumps over 1.5x the range fade out so a limb in front of a wing leaves no dark halo.
- Override looks with `renderMesh(mesh, pose, { lights: { albedo: [r,g,b], key: {...}, ao: 0 } })`. Albedo 0.8-0.9 grey-white reads as bone-white PLA on the dark ground; a coloured albedo (0.1, 0.8, 0.5) gives green filament.
- Region only: the image covers the model's screen bounding box, not the whole 1080x1920. Draw it at `r.x0, r.y0`.

## The printed-reveal (`pose.clipY`)

`clipY` in mm removes everything above that height, shows the inside as a green cap and lights a 2.2 mm band at the cut. Drive it with `H * 1.04 * E.inOutCubic(prog(t, 0.85, 2.85))` (2 s feels like a fast print), then pass `undefined` once finished (no cut cost). Draw a ring at `projectModelPoint(..., [r cos a, clipY, r sin a])` behind the figure (angles 0..PI are the back half) and again in front (PI..2PI), plus a bright dot orbiting it (`a = 3.2 t`): that is the print head.

## Product-ad recipe (the demo)

- Hook outside, model below it: figure centre `cy` 1010, scale about 5.7 for the dragon (the widest reach is 98 mm, so the wings touch the frame edges for a moment: allowed).
- Pedestal: ring `ring(y = 0, r = 0.64 * mesh.radius)` projected with `projectModelPoint`; fill with a radial gradient `#1a222d` to `#0f151c`, 3 px green rim at alpha 0.55, 72 ticks (5 degrees, every 6th longer, front ticks brighter) that turn with `yaw` so the spin reads even on a symmetric part. Glow pool behind: radial green at alpha 0.13.
- Rotation: `yaw = 0.35 + 2 PI 0.94 E.inOutSine(prog(t, 0.3, 4.55))`: eases in and out, about 340 degrees, peak 2.2 rad/s. A constant speed also works for a long hold.
- Reflection: `drawReflection(ctx, r, baseY, {alpha: 0.2})` clipped to the pedestal ring.
- Fade the whole group out over 0.37 s around the closer. Never draw text over the model.

## Module API

`parseSTL, readSTL, writeSTL, bounds, decimate, vertexNormals, finishMesh, saveMeshCache, readMeshCache, cachePath, loadMesh, fitScale, projectModelPoint, renderMesh, drawMesh, drawReflection, LIGHTS`; test meshes: `makeSphere, makeTorusKnot, concatMeshes, toSoup`.

## Common failures

- Model upside down or lying on its back: wrong `up`. Slicer STLs are Z-up.
- Model sliced off at the frame edge: use `fitScale` (it accounts for the widest reach), or accept a brief overflow of wing tips by passing a `maxW` a little over 1080.
- Everything dark grey: albedo too low or `ao` too strong; keep albedo at 0.8-0.9. Over-bright flat tops: lower `key.k`.
- Holes or inside-out look: the STL has flipped triangles; `renderMesh` culls by winding (outward = counter-clockwise).
- Dark halo outlines: raise the fade range in the cavity pass or set `lights.ao` to 0.6.
- Slow frames (over 0.5 s): target too high, `ss: 2` on a huge region, or scale too large. `ss: 1` halves the time but edges alias.
- Workers all decimating at once on a cold cache: run `loadMesh` once in `test.mjs` or before rendering (the test does).
- `Math.random` and `Date` never touch a frame (a `Date` only names the cache temp file).

## Quality bar (what the test measures)

STL binary roundtrip and ASCII parse; garbage rejected. Decimation lands within 12 percent of the target on a 48,000-triangle sphere, every vertex within one cell of the true surface, surface area 90-102 percent, mesh under target only welded. Cache roundtrip exact; damaged cache returns null; second `loadMesh` reads the cache; key changes with target. Upright, centred, feet on y = 0, normals point outward (mean dot above 0.99). Sphere silhouette area within 3 percent of the perspective prediction; z-buffer centre depth equal to eye distance minus radius within 0.3 mm; nearer sphere wins at all overlap pixels (0 wrong); edges antialiased; inside-out sphere shows its far wall (culling by winding); the clip plane removes the top and shows the green cap only when clipped; the light side is brighter than the shadow side; cavity darkening lowers mean brightness; `fitScale` keeps a full turn inside its box; identical pose gives identical pixels. Real model: 861,384 to within 10 percent of 150,000 triangles, height 126.6 mm and width 150.1 mm kept, second load from cache under 1.5 s, one 1080x1920 frame under 1.5 s (measured about 150 ms). Demo: 5-8 s, 1080x1920 silent, QC passes. By eye on `out/contact.png`: smooth turn, readable shading, clean ground, closer.

## Run it

```
node test.mjs                          # unit + full-size render + QC (first run builds the cache; allow about 2 minutes)
ANNIE_PREVIEW=1 node test.mjs          # 540x960 while iterating
node ../../engine/render.mjs demo.mjs --still 3.4 --out out    # one full-size frame
T72_STL=/path/other.stl node ../../engine/render.mjs demo.mjs --preview --out /tmp/x   # try another model
```
