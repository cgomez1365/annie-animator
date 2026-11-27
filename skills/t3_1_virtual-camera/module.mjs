// t3.1 virtual camera: a camera rig (transform stack) for 2D scenes drawn on the engine's canvas.
// The camera is a plain object { x, y, zoom, rot } (x,y = offset in px from the rest position, zoom = factor, rot = radians).
// It is applied to the ctx as a transform, so text drawn inside the scene is still seen by the quality checker.
// Everything is a pure function of t: no Math.random, no Date, no state between frames.
import { E, clamp, lerp, prog, noise1, track, createCanvas } from '../../engine/index.mjs';

const W = 1080, H = 1920, CX = 540, CY = 960;
const fnE = e => (typeof e === 'function' ? e : E[e] || E.linear);

/** @typedef {{x:number,y:number,zoom:number,rot:number}} Cam */
/** A rig part: t -> partial camera delta. x, y and rot are ADDED, zoom is MULTIPLIED. @typedef {(t:number)=>Partial<Cam>} Part */

/**
 * Build a camera rig from parts (a transform stack). The rig sums x, y, rot and multiplies zoom.
 * @param {...Part} parts pushIn, pan, moveTrack, handheld, shake, whip, ...
 * @returns {{at:(t:number)=>Cam}} rig.at(t) gives the camera at time t
 */
export function rig(...parts) {
  return {
    at(t) {
      const c = { x: 0, y: 0, zoom: 1, rot: 0 };
      for (const p of parts) { const d = p(t); if (d.x) c.x += d.x; if (d.y) c.y += d.y; if (d.rot) c.rot += d.rot; if (d.zoom !== undefined) c.zoom *= d.zoom; }
      return c;
    },
  };
}

/**
 * Push-in (or pull-out) part: zoom goes from `from` to `to` between t0 and t1, holds `to` afterwards.
 * Good pushes: 1.00 -> 1.12 over 1.5-2.5 s (slow, felt), 1.00 -> 1.25 over 0.6 s (punch-in). Ease inOutCubic or outCubic.
 * @param {{t0:number,t1:number,from?:number,to?:number,ease?:string|Function}} o @returns {Part}
 */
export function pushIn({ t0, t1, from = 1, to = 1.12, ease = 'inOutCubic' }) {
  const e = fnE(ease); return t => ({ zoom: lerp(from, to, e(prog(t, t0, t1))) });
}

/**
 * Pan part: offset moves from `from` [x,y] to `to` [x,y] between t0 and t1 (px of camera travel, mid layer), holds after.
 * @param {{t0:number,t1:number,from?:number[],to:number[],ease?:string|Function}} o @returns {Part}
 */
export function pan({ t0, t1, from = [0, 0], to, ease = 'inOutCubic' }) {
  const e = fnE(ease); return t => { const k = e(prog(t, t0, t1)); return { x: lerp(from[0], to[0], k), y: lerp(from[1], to[1], k) }; };
}

/**
 * Free keyframes for any channel. Each channel is a track() key list [[t, value, easeName?], ...]; ease belongs to the segment
 * arriving at that key. Channels left out stay at rest (x,y,rot 0, zoom 1). Use it for moves that go out and come back.
 * @param {{x?:any[],y?:any[],zoom?:any[],rot?:any[]}} ch @returns {Part}
 */
export function moveTrack(ch) {
  const f = {}; for (const k of ['x', 'y', 'zoom', 'rot']) if (ch[k]) f[k] = track(ch[k]);
  return t => { const d = {}; for (const k in f) d[k] = f[k](t); return d; };
}

/**
 * Handheld part: smooth seeded noise on x, y and a little roll. Never settles, so a hold never freezes.
 * Walking-camera look: amp 4-8 px, rot 0.002-0.005 rad (0.1-0.3 deg), freq 1.2-2.2 Hz. Above 12 px or 4 Hz it reads as an earthquake.
 * @param {{amp?:number,rot?:number,freq?:number,seed?:number,t0?:number,t1?:number}} [o] t0/t1 fade it in and out over 0.4 s (optional)
 * @returns {Part}
 */
export function handheld({ amp = 6, rot = 0.003, freq = 1.6, seed = 1, t0 = -Infinity, t1 = Infinity } = {}) {
  return t => {
    const g = Math.min(isFinite(t0) ? prog(t, t0, t0 + 0.4) : 1, isFinite(t1) ? 1 - prog(t, t1 - 0.4, t1) : 1); if (g <= 0) return {};
    const u = t * freq;
    return { x: g * amp * (0.7 * noise1(u, seed) + 0.3 * noise1(u * 2.3 + 5, seed + 1)), y: g * amp * (0.7 * noise1(u + 31.7, seed + 2) + 0.3 * noise1(u * 2.1 + 9, seed + 3)), rot: g * rot * noise1(u * 0.8 + 77, seed + 4) };
  };
}

/**
 * Impact shake (trauma model). Each hit [t, strength 0..1] sets trauma = strength, which falls linearly to 0 over `dur`.
 * Offset = amp * trauma^2 * noise at `freq` Hz, so the shake starts violent and dies smoothly. Strength 0.3 = bump, 0.7 = slam.
 * @param {{hits:Array<[number,number]>,dur?:number,amp?:number,rot?:number,freq?:number,seed?:number}} o @returns {Part}
 */
export function shake({ hits, dur = 0.6, amp = 28, rot = 0.02, freq = 22, seed = 5 }) {
  return t => {
    let tr = 0; for (const [ti, s] of hits) { const u = (t - ti) / dur; if (u >= 0 && u < 1) tr = Math.max(tr, s * (1 - u)); }
    if (tr <= 0) return {};
    const q = tr * tr, u = t * freq;
    return { x: amp * q * noise1(u, seed), y: amp * q * noise1(u + 40.3, seed + 1), rot: rot * q * noise1(u + 80.9, seed + 2) };
  };
}

/**
 * Whip pan part: x travels `dx` px (y `dy`) between t0 and t0 + dur and holds. Default ease inOutQuart: slow start, very fast
 * middle (peak about 4 x average speed), hard stop. Duration 0.35-0.55 s; travel 900-1500 px. Pair with motionBlur().
 * @param {{t0:number,dur?:number,dx:number,dy?:number,ease?:string|Function}} o @returns {Part}
 */
export function whip({ t0, dur = 0.5, dx, dy = 0, ease = 'inOutQuart' }) {
  const e = fnE(ease); return t => { const k = e(prog(t, t0, t0 + dur)); return { x: dx * k, y: dy * k }; };
}

// ---------------------------------------------------------------- applying the camera

/**
 * Apply the camera to ctx for one depth layer. Call inside ctx.save()/ctx.restore(), then draw the layer in ordinary
 * screen-sized coordinates (the rest position of the camera shows the world as drawn).
 * par = parallax depth: 1 = the focus plane (moves with the camera), above 1 = nearer (moves and grows faster), below 1 = farther,
 * 0 = fixed to the screen. Layer scale = 1 + (zoom - 1) * par, offset = camera offset * par, roll is the same on every layer.
 * To land a second scene centred after the camera moved by X, draw that scene shifted by X * par on that layer.
 * @param {*} ctx @param {Cam} cam @param {number} [par] @param {{cx?:number,cy?:number}} [o] centre of the view
 */
export function applyCamera(ctx, cam, par = 1, { cx = CX, cy = CY } = {}) {
  const zl = 1 + (cam.zoom - 1) * par;
  ctx.translate(cx, cy); ctx.rotate(cam.rot); ctx.scale(zl, zl); ctx.translate(-cx - cam.x * par, -cy - cam.y * par);
}
/** Where a world point lands on screen for a layer with this parallax (the maths applyCamera does), for tests and cull checks. @returns {[number,number]} */
export function worldToScreen(cam, par, [wx, wy], { cx = CX, cy = CY } = {}) {
  const zl = 1 + (cam.zoom - 1) * par, dx = wx - cx - cam.x * par, dy = wy - cy - cam.y * par, c = Math.cos(cam.rot), s = Math.sin(cam.rot);
  return [cx + zl * (c * dx - s * dy), cy + zl * (s * dx + c * dy)];
}
/** Convenience: run fn(ctx) with the camera applied for one layer, then restore. */
export function layerCam(ctx, cam, par, fn, o) { ctx.save(); applyCamera(ctx, cam, par, o); fn(ctx); ctx.restore(); }

/**
 * How fast the picture moves, in px per frame, at the layer par. Counts pan/shake offset, zoom about 540 px from the centre and
 * roll about 540 px from the centre. Used to decide how many blur samples a frame needs.
 * @param {{at:(t:number)=>Cam}} r @param {number} t @param {number} [fps] @param {number} [par]
 */
export function camSpeed(r, t, fps = 30, par = 1) {
  const h = 0.5 / fps, a = r.at(t - h), b = r.at(t + h);
  return Math.hypot((b.x - a.x) * par, (b.y - a.y) * par) + Math.abs(b.zoom - a.zoom) * par * 540 + Math.abs(b.rot - a.rot) * 540;
}

// ---------------------------------------------------------------- motion blur (sub-frame accumulation)

/**
 * Motion blur by drawing the scene several times at sub-frame times and averaging them (equal weights).
 * drawScene(c, ts) must paint the WHOLE scene (opaque ground included) at time ts using the camera at ts. Draw screen-fixed
 * overlays (headline, closer) AFTER this call so they stay sharp. Samples are decided from camera speed: a still frame costs one draw.
 * shutter = exposure in frames (0.5 = 180 degree shutter, 1.0 = 360 degrees and smeary). Blur length is speed * shutter px.
 * The averaged frame is written with putImageData, so it REPLACES the whole canvas (call it first, on an empty ctx, with an opaque scene).
 * @param {*} ctx target @param {number} t @param {(c:*,ts:number)=>void} drawScene
 * @param {{rig:{at:(t:number)=>Cam},shutter?:number,fps?:number,maxSamples?:number,pxPerSample?:number,minBlur?:number}} o
 * @returns {number} samples used
 */
export function motionBlur(ctx, t, drawScene, { rig: r, shutter = 0.5, fps = 30, maxSamples = 16, pxPerSample = 9, minBlur = 4 }) {
  const blurPx = Math.max(camSpeed(r, t, fps, 1), camSpeed(r, t, fps, 1.8)) * shutter * 2;
  if (blurPx < minBlur) { drawScene(ctx, t); return 1; }
  const n = clamp(Math.ceil(blurPx / pxPerSample), 2, maxSamples), span = shutter / fps, scratch = createCanvas(W, H), sc = scratch.getContext('2d'), acc = new Float32Array(W * H * 4);
  for (let j = 0; j < n; j++) {
    const ts = t + (j / (n - 1) - 0.5) * span;
    sc.clearRect(0, 0, W, H); drawScene(sc, ts);
    const d = sc.getImageData(0, 0, W, H).data; for (let i = 0; i < d.length; i++) acc[i] += d[i]; // exact float sum: no 8-bit rounding drift
  }
  const out = ctx.createImageData(W, H); for (let i = 0; i < acc.length; i++) out.data[i] = Math.round(acc[i] / n);
  ctx.putImageData(out, 0, 0);
  return n;
}

// ---------------------------------------------------------------- rack focus (depth blur)

/**
 * Blur radius in px for a layer: aperture * |par - focus|, capped at maxBlur. Aperture 8-14 gives a soft background, 16-24 a strong rack.
 * @param {number} par layer depth @param {number} focus focused depth @param {number} [aperture] @param {number} [maxBlur]
 */
export function focusBlur(par, focus, aperture = 12, maxBlur = 28) { return Math.min(maxBlur, aperture * Math.abs(par - focus)); }

/**
 * A focus-distance function of t from keyframes [[t, par, ease?], ...] (a track). Rack = move the value from one depth to another
 * in 0.5-0.9 s with inOutCubic, hold 0.4 s or more on each target.
 * @param {any[]} keys @returns {(t:number)=>number}
 */
export function rackFocus(keys) { return track(keys); }

/**
 * Run fn(c) and blur everything it draws by `px` (gaussian). fn gets a context `c` with the SAME transform as ctx (so the camera
 * transform you applied still works); draw on c, not on ctx. px < 0.4 draws sharp straight onto ctx.
 * Why a layer: ctx.filter costs about 35 ms per DRAW CALL on a full frame (46 dots = 1.6 s), so blur once per layer, never per shape.
 * The layer is a full-frame engine canvas, so the quality checker still sees its text.
 * @param {*} ctx @param {number} px @param {(c:*)=>void} fn
 */
export function withBlur(ctx, px, fn) {
  if (px < 0.4) { fn(ctx); return; }
  const lay = createCanvas(W, H), c = lay.getContext('2d'); c.setTransform(ctx.getTransform()); fn(c);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = `blur(${px.toFixed(2)}px)`; ctx.drawImage(lay, 0, 0); ctx.restore();
}

/**
 * Cull helper: true when the layer's scene (centred at sceneOff * par from the middle, `half` px wide each side) can be seen.
 * The checker reads text that is drawn off screen, so skip scenes (and their text) that are not in view.
 * @param {Cam} cam @param {number} par @param {number} sceneOff scene offset in mid-layer px @param {number} [half]
 */
export function inView(cam, par, sceneOff, half = 700) { return Math.abs(sceneOff * par - cam.x * par) < half + 540 * Math.max(0, cam.zoom - 1) + 60; }
