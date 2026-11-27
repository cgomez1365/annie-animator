// Annie engine: canvas access, fonts, text and drawing helpers. EVERY card imports createCanvas from here (not from
// @napi-rs/canvas) so the quality checker can see the text a card draws.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { STACK } from './brand.mjs';
export { rgba } from './ease.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Path of @napi-rs/canvas. Override with ANNIE_CANVAS. */
export const CANVAS_PATH = process.env.ANNIE_CANVAS || '/Users/cris/Desktop/AEON-wt-deps/node_modules/@napi-rs/canvas/index.js';
const napi = createRequire(import.meta.url)(CANVAS_PATH);
export const { loadImage, Path2D, GlobalFonts } = napi;
const rawCreate = napi.createCanvas;

const FONT_DIR = process.env.ANNIE_FONTS || path.join(HERE, 'fonts');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'inter-latin-wght.woff2'), 'Inter');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'space-grotesk-latin-wght.woff2'), 'Space Grotesk');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'jetbrains-mono-latin-wght.woff2'), 'JetBrains Mono');

/**
 * Create a canvas. When the quality checker is running, a canvas of the full frame size gets its fillText recorded
 * (globalThis.__annieTextLog). Text drawn on small offscreen layers is not recorded: draw text on the main canvas
 * or on a full-frame layer composited at 0,0.
 * @param {number} w @param {number} h
 */
export function createCanvas(w, h) {
  const cv = rawCreate(w, h), L = globalThis.__annieTextLog;
  if (L && w === L.W && h === L.H) { const ctx = cv.getContext('2d'); hookText(ctx, L.entries); cv.getContext = () => ctx; }
  return cv;
}

/** Set font by family key ('inter' | 'sg' | 'mono'), size px, weight (100-900) and tracking in em. Weight uses variable-font axes. */
export function setFont(ctx, fam, px, wght = 400, trackEm = 0) {
  ctx.font = `${px}px ${STACK[fam] || STACK.inter}`;
  ctx.fontVariationSettings = `'wght' ${wght}`;
  ctx.letterSpacing = `${(px * trackEm).toFixed(3)}px`;
}
/** Width of s in the current font, without the trailing letter-spacing. Pass px and trackEm when tracking is set. */
export const textW = (ctx, s, px = 0, trackEm = 0) => ctx.measureText(s).width - (trackEm ? px * trackEm : 0);

/** Wrap text to maxW using the current font. Returns an array of lines. Explicit \n starts a new line. */
export function wrapText(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; }
    }
    out.push(cur);
  }
  return out;
}
/**
 * Largest font size (<= maxPx, >= minPx) at which every string fits maxW; sets that font on ctx and returns the size.
 * Keep minPx at 42 or more for anything that stays on screen.
 * @param {*} ctx @param {string|string[]} text @param {{fam?:string,wght?:number,maxW:number,maxPx?:number,minPx?:number,track?:number}} o
 */
export function fitText(ctx, text, { fam = 'inter', wght = 600, maxW, maxPx = 96, minPx = 42, track = 0 }) {
  const lines = Array.isArray(text) ? text : [text];
  let px = maxPx;
  for (; px > minPx; px--) { setFont(ctx, fam, px, wght, track); if (lines.every(l => textW(ctx, l, px, track) <= maxW)) break; }
  setFont(ctx, fam, px, wght, track); return px;
}
/** Rounded-rect path (does not fill). r may be a number or [tl,tr,br,bl]. */
export function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return ctx; }
/** Draw fn() with a coloured glow. blur is in px of the final frame. */
export function glow(ctx, color, blur, fn) { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; fn(); ctx.restore(); }
/** Run fn with a transform: {x,y,rot,sx,sy,alpha}. Rotation in radians about (x,y). Always restores. */
export function withT(ctx, { x = 0, y = 0, rot = 0, sx = 1, sy = sx, alpha = 1 } = {}, fn) {
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sx, sy); ctx.globalAlpha *= alpha; fn(); ctx.restore();
}
/** Offscreen layer: draws fn(ctx) on a new w x h canvas and returns it. Use for masks, blur, or compositing as a unit. */
export function layer(w, h, fn) { const cv = rawCreate(w, h); fn(cv.getContext('2d'), cv); return cv; }
/** Draw a layer centred (or anchored) at x,y with scale, rotation and alpha. anchor [0..1,0..1], default centre. */
export function drawLayer(ctx, cv, x, y, { sx = 1, sy = sx, rot = 0, alpha = 1, anchor = [0.5, 0.5] } = {}) {
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sx, sy); ctx.globalAlpha *= alpha;
  ctx.drawImage(cv, -cv.width * anchor[0], -cv.height * anchor[1]); ctx.restore();
}
/** Clip to a rect for the rest of the current save(). */
export function clipRect(ctx, x, y, w, h, r = 0) { ctx.beginPath(); r ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.clip(); }

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/**
 * +-1 LSB static ordered dither on near-black pixels (all channels <= 60/60/72). Stops x264 contouring dark gradients and
 * vignettes. The renderer applies it to every frame (unless META.dither === false), so cards do not need to call it.
 */
export function ditherDark(cv) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, id = c.getImageData(0, 0, W, H), d = id.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (d[i] > 60 || d[i + 1] > 60 || d[i + 2] > 72) continue;
    const b = BAYER4[(y & 3) * 4 + (x & 3)], o = b >= 12 ? 1 : b < 4 ? -1 : 0; if (!o) continue;
    for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] + o));
  }
  c.putImageData(id, 0, 0); return cv;
}
/** +-1 LSB ordered dither on EVERY pixel (bright gradients). Optional; costs ~2x ditherDark. */
export function dither(cv, amount = 1) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, id = c.getImageData(0, 0, W, H), d = id.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, b = BAYER4[(y & 3) * 4 + (x & 3)], o = (b >= 12 ? 1 : b < 4 ? -1 : 0) * amount;
    if (o) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] + o));
  }
  c.putImageData(id, 0, 0); return cv;
}

/** Mark text as texture (tags, tiny labels). The 42 px floor does not apply to decor text. Use sparingly. */
export function decor(ctx, on = true) { ctx.__decor = on; }
/** Record every fillText into `log` as {s,px,a,decor,color,x0,x1,y0,y1} in frame pixels. The QC uses it. */
export function hookText(ctx, log) {
  const orig = ctx.fillText.bind(ctx);
  ctx.fillText = (s, x, y, ...r) => {
    if (ctx.globalAlpha > 0.05 && String(s).trim()) {
      const m = ctx.measureText(s), T = ctx.getTransform(), sc = Math.hypot(T.a, T.b);
      const px = parseFloat(/([\d.]+)px/.exec(ctx.font)?.[1] || '0');
      const bx = [x - m.actualBoundingBoxLeft, x + m.actualBoundingBoxRight], by = [y - m.actualBoundingBoxAscent, y + m.actualBoundingBoxDescent];
      const pts = [[bx[0], by[0]], [bx[1], by[0]], [bx[0], by[1]], [bx[1], by[1]]].map(([u, v]) => [T.a * u + T.c * v + T.e, T.b * u + T.d * v + T.f]);
      log.push({ s: String(s), px: px * sc, a: ctx.globalAlpha, decor: !!ctx.__decor, color: typeof ctx.fillStyle === 'string' ? ctx.fillStyle : 'gradient',
        x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) });
    }
    return orig(s, x, y, ...r);
  };
  return ctx;
}
