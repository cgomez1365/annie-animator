// Annie engine: shared card parts in BGI's look (background, hook, window, button, icons, dust, closer, gear mark).
// Cards compose these; nothing here is required by the renderer.
import fs from 'node:fs';
import { createCanvas, setFont, textW, Path2D, withT, glow, roundRect } from './canvas.mjs';
import { E, prog, clamp, lerp, rgba } from './ease.mjs';
import { rng } from './rng.mjs';
import { P, SLOGAN, SLOGAN_COLORS, CTA, FOOTER, KICKER, EIGHTEEN, SAFE } from './brand.mjs';
import { D_BROKEN, D_FULL } from './mark_paths.mjs';

const { W, H } = SAFE;

// ---------------------------------------------------------------- frame scaffold
/**
 * Start a frame: a W x H canvas with the BGI background and (optionally) the green kicker on top.
 * Pair with end(). Returns { cv, ctx }.
 * Includes drifting dust (turn off with dust:false) so a hold never freezes.
 * @param {number} t @param {{kicker?:string|false, closerAt?:number, grid?:boolean, dust?:boolean}} [o] closerAt hides the kicker when the closer starts
 */
export function begin(t, o = {}) {
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  background(ctx, t, o);
  if (o.dust !== false) dust(ctx, t, { period: 9, n: 44, seed: 11 }); // drifting dust: no hold is ever a frozen frame
  if (o.kicker !== false) kicker(ctx, t, o.kicker || KICKER, o.closerAt);
  return { cv, ctx };
}
/** Finish a frame: draws the closer when o.closerAt is set, returns the canvas. */
export function end(ctx, t, o = {}) {
  if (o.closerAt !== undefined) closer(ctx, t, o.closerAt, o);
  return ctx.canvas;
}

/** BGI ground: near-black, a faint green grid drifting 10 px/s, a vignette. */
export function background(ctx, t, { grid = true } = {}) {
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
  if (grid) {
    const off = (t * 10) % 40; ctx.fillStyle = rgba(P.green, 0.035);
    for (let x = -40 + off; x < W; x += 40) ctx.fillRect(Math.round(x), 0, 1, H);
    for (let y = -40 + off; y < H; y += 40) ctx.fillRect(0, Math.round(y), W, 1);
  }
  const v = ctx.createRadialGradient(540, 900, 200, 540, 900, 1250); v.addColorStop(0, 'rgba(10,12,16,0)'); v.addColorStop(1, 'rgba(10,12,16,0.92)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
/** The green "BROKEN GEAR INDUSTRIES" line at y 300 (42 px, tracked). Fades out as the closer starts at closerAt. */
export function kicker(ctx, t, text = KICKER, closerAt = Infinity) {
  const a = 1 - prog(t, closerAt - 0.1, closerAt + 0.3); if (a <= 0.001) return;
  ctx.save(); ctx.globalAlpha *= a; setFont(ctx, 'inter', 42, 650, 0.14); ctx.fillStyle = P.green; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 540 + 42 * 0.07, 300); ctx.restore();
}

// ---------------------------------------------------------------- hook / caption (two lines, mask-rise in, lift out)
/**
 * Two-line headline, tt10 style: each line rises through a mask over 0.32 s (line 2 starts 0.07 s later), exits with a 0.2 s
 * fade and 10 px lift. cap: { tIn, tOut, l1, l2, c1, c2, b1, b2 (baselines), px, cx=540, wght=700, glint:[t0,t1] }.
 * Hook goes OUTSIDE the window, y 400-700 at px 104, or y 440-520 at px 56 for page headers.
 */
export function hook(ctx, cap, t) {
  if (t < cap.tIn || t > cap.tOut + 0.2) return;
  const outK = t > cap.tOut ? prog(t, cap.tOut, cap.tOut + 0.2) : 0, wg = cap.wght || 700, cx = cap.cx ?? 540;
  ctx.save(); ctx.globalAlpha *= 1 - outK; ctx.translate(0, -10 * outK);
  for (const [txt, col, base, delay] of [[cap.l1, cap.c1 || P.white, cap.b1, 0], [cap.l2, cap.c2 || P.green, cap.b2, 0.07]]) {
    if (!txt) continue;
    const k = E.outCubic(prog(t, cap.tIn + delay, cap.tIn + delay + 0.32)); if (k <= 0) continue;
    const em = cap.px; ctx.save();
    ctx.beginPath(); ctx.rect(0, base - em, 4000, 1.75 * em); ctx.clip(); // mask reaches below descenders
    ctx.globalAlpha *= clamp(k * 1.6); setFont(ctx, 'sg', em, wg, -0.01); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const x = cx - ctx.measureText(txt).width / 2, y = base + 0.4 * em * (1 - k);
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
    const gk = cap.glint && delay > 0 ? prog(t, cap.glint[0], cap.glint[1]) : 0;
    if (gk > 0 && gk < 1) { // light sweep across line 2
      const tw = ctx.measureText(txt).width, bw = 220, gx = x - bw / 2 + (tw + bw) * E.inOutCubic(gk), g = ctx.createLinearGradient(gx - bw / 2, 0, gx + bw / 2, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillText(txt, x, y); ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- window and button
/**
 * macOS-style window: panel, 2 px border, title bar with three dots, centred title (alpha for crossfades). Radius 22.
 * Draw page content after it, clipped with clipRect(ctx, ...windowInner(w)).
 * @param {{x?:number,y?:number,w?:number,h?:number,bar?:number,title?:string,titleAlpha?:number,titleColor?:string}} [w]
 */
export function windowFrame(ctx, w = {}) {
  const { x, y, w: ww, h, bar = 72 } = { ...SAFE.window, ...w };
  ctx.fillStyle = P.panel; roundRect(ctx, x, y, ww, h, 22).fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; roundRect(ctx, x + 1, y + 1, ww - 2, h - 2, 21).stroke();
  ctx.fillStyle = P.panel2; roundRect(ctx, x + 2, y + 2, ww - 4, bar - 2, [20, 20, 0, 0]).fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y + bar, ww, 2);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 40 + i * 30, y + bar / 2, 9, 0, Math.PI * 2); ctx.fill(); });
  if (w.title) {
    ctx.save(); ctx.globalAlpha *= w.titleAlpha ?? 1; setFont(ctx, 'inter', 42, 600); ctx.fillStyle = w.titleColor || P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(w.title, x + ww / 2, y + bar / 2 + 15); ctx.restore();
  }
}
/** Inner content rect of a window [x,y,w,h] for clipRect. */
export const windowInner = (w = {}) => { const { x, y, w: ww, h, bar = 72 } = { ...SAFE.window, ...w }; return [x + 2, y + bar + 2, ww - 4, h - bar - 4]; };

/**
 * Button that presses (scale 1 -> 1-0.04 -> 1 over 0.2 s around pressT) and swaps its label at pressT + 0.1.
 * b: { x, y (centre), w, h, label, doneLabel?, pressT, color?, ink?, px? }
 */
export function button(ctx, t, b) {
  const press = b.pressT === undefined ? 0 : Math.sin(Math.PI * prog(t, b.pressT, b.pressT + 0.2)), done = b.doneLabel && t >= b.pressT + 0.1;
  const s = 1 - 0.04 * press; ctx.save(); ctx.translate(b.x, b.y); ctx.scale(s, s);
  ctx.fillStyle = b.color || P.green; roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, b.r ?? 16).fill();
  setFont(ctx, 'inter', b.px || 44, 700); ctx.fillStyle = b.ink || P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(done ? b.doneLabel : b.label, 0, (b.px || 44) * 0.36); ctx.restore();
}

// ---------------------------------------------------------------- icons (lucide, vector, from node_modules)
const LUCIDE = process.env.ANNIE_LUCIDE || '/Users/cris/Desktop/AEON-wt-deps/node_modules/lucide-react/dist/esm/icons';
const ICN = {};
/** Draw a lucide icon by name ('mail', 'circle-check', 'users'...) in a size px box at x,y (top-left). Throws if the name is unknown. */
export function icon(ctx, name, x, y, size, color, sw = 2) {
  if (!ICN[name]) {
    const src = fs.readFileSync(`${LUCIDE}/${name}.mjs`, 'utf8'), m = src.match(/__iconNode = (\[[\s\S]*?\]);/), d = src.match(/__iconData = (\{[\s\S]*?\n\});/);
    ICN[name] = m ? Function(`return ${m[1]}`)() : Function(`return ${d[1]}`)().node;
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24); ctx.strokeStyle = color; ctx.lineWidth = sw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [tg, a] of ICN[name]) {
    ctx.beginPath();
    if (tg === 'path') { ctx.stroke(new Path2D(a.d)); continue; }
    if (tg === 'rect') ctx.roundRect(+(a.x || 0), +(a.y || 0), +a.width, +a.height, +(a.rx || 0));
    if (tg === 'circle') ctx.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
    if (tg === 'ellipse') ctx.ellipse(+a.cx, +a.cy, +a.rx, +a.ry, 0, 0, Math.PI * 2);
    if (tg === 'line') { ctx.moveTo(+a.x1, +a.y1); ctx.lineTo(+a.x2, +a.y2); }
    if (tg === 'polyline' || tg === 'polygon') { const q = a.points.trim().split(/[\s,]+/).map(Number); ctx.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) ctx.lineTo(q[i], q[i + 1]); if (tg === 'polygon') ctx.closePath(); }
    ctx.stroke();
  }
  ctx.restore();
}

/** Ambient dust: slow upward drift that loops every `period` s, so a hold never freezes. box = [x0,y0,x1,y1] limits it. */
export function dust(ctx, t, { period = 8, n = 50, seed = 20261119, alpha = 1, box = null, color = '156,196,255' } = {}) {
  const r = rng(seed), H2 = H + 40;
  for (let i = 0; i < n; i++) {
    const x = box ? box[0] + (box[2] - box[0]) * r() : W * r(), y0 = H2 * r(), kk = r() < 0.65 ? 1 : 2, rad = 1.3 + 1.6 * r(), a = 0.16 + 0.3 * r(), tw = 1 + Math.floor(3 * r()), ph = r();
    const y = (((y0 - (H2 * kk * t) / period) % H2) + H2) % H2 - 20; if (box && (y < box[1] || y > box[3])) continue;
    ctx.fillStyle = `rgba(${color},${(a * (0.6 + 0.4 * Math.sin(2 * Math.PI * ((tw * t) / period + ph))) * alpha).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- the BGI gear mark (official outlines)
const P_BROKEN = new Path2D(D_BROKEN), P_FULL = new Path2D(D_FULL);
const perim = d => { const n = d.match(/-?\d+(\.\d+)?/g).map(Number); let L = 0; for (let i = 2; i < n.length; i += 2) L += Math.hypot(n[i] - n[i - 2], n[i + 1] - n[i - 1]); return L + Math.hypot(n[0] - n[n.length - 2], n[1] - n[n.length - 1]); };
const LEN_BROKEN = perim(D_BROKEN), LEN_FULL = perim(D_FULL);
/**
 * BGI mark centred at cx,cy; size = the 112-unit viewBox in px. o.k 0..1 draws it like a CAD sketch (crosshair, outline traces,
 * left half fills white); o.alpha. Right half is the green "broken" outline, left half solid white.
 */
export function drawMark(ctx, cx, cy, size, o = {}) {
  const a = o.alpha ?? 1, k = o.k ?? 1; if (a <= 0.001) return;
  const s = size / 112, cross = prog(k, 0, 0.2), trace = E.inOutCubic(prog(k, 0.1, 0.65)), fill = E.outCubic(prog(k, 0.55, 0.8));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.lineJoin = 'round';
  if (cross > 0) { ctx.save(); ctx.globalAlpha *= cross; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.8; ctx.setLineDash([10, 2, 2, 2]); ctx.beginPath(); ctx.moveTo(-54, 0); ctx.lineTo(54, 0); ctx.moveTo(0, -54); ctx.lineTo(0, 54); ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.beginPath(); ctx.rect(0, -70, 70, 140); ctx.clip();
  if (trace > 0) {
    ctx.strokeStyle = P.green; ctx.save(); ctx.globalAlpha *= trace; ctx.lineWidth = 1; ctx.setLineDash([2.5, 3]); ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.lineWidth = 1.3; ctx.setLineDash([LEN_BROKEN * trace, LEN_BROKEN]); ctx.stroke(P_BROKEN); ctx.setLineDash([]);
    ctx.beginPath(); if (trace >= 1) ctx.arc(0, 0, 8, 0, Math.PI * 2); else ctx.arc(0, 0, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * trace); ctx.stroke();
  }
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(-70, -70, 70, 140); ctx.clip();
  if (trace > 0 && fill < 1) { ctx.strokeStyle = P.green; ctx.lineWidth = 1.3; ctx.setLineDash([LEN_FULL * trace, LEN_FULL]); ctx.stroke(P_FULL); ctx.setLineDash([]); }
  if (fill > 0) { ctx.save(); ctx.globalAlpha *= fill; ctx.fillStyle = P.white; ctx.fill(P_FULL); ctx.fillStyle = P.panel; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  ctx.restore(); ctx.restore();
}

// ---------------------------------------------------------------- the closer
/** Y positions of the closer, for cards that hand things over to it. */
export const CLOSER = {
  bgi: { mark: [540, 500, 330], name: 790, sub: 856, s1: 975, s2: 1057, btn: 1130, foot: 1226 },
  aeon: { mark: [540, 430, 250], name: 650, sub: 706, s1: 840, s2: 918, btn: 990, foot: 1076, adult: [1152, 1198] },
};
/** Seconds the closer needs from t0 until everything has landed. Keep the card at least this + 2 s long after t0. */
export const CLOSER_SETTLE = 2.0;
/**
 * The closer (every card ends with it): ground, BGI gear mark and wordmark, the slogan (both lines, line 2 green), a Follow
 * button with glow that presses at t0 + 1.9, the footer URL, and for brand 'aeon' the 18+ line. Everything is in place by t0 + 1.2.
 * @param {*} ctx @param {number} t @param {number} t0 start time @param {{brand?:'bgi'|'aeon', cta?:string}} [o]
 */
export function closer(ctx, t, t0, o = {}) {
  const k = prog(t, t0, t0 + 0.5), a = E.outCubic(k); if (k <= 0) return;
  const aeon = o.brand === 'aeon', L = CLOSER[aeon ? 'aeon' : 'bgi'];
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(540, 600, 40, 540, 600, 760); g.addColorStop(0, rgba(P.green, 0.10)); g.addColorStop(1, rgba(P.bg, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  dust(ctx, t, { period: 9, n: 36, seed: 7, alpha: 0.8 * a }); // the closer never freezes
  drawMark(ctx, L.mark[0], L.mark[1], L.mark[2], { k: prog(t, t0, t0 + 0.8), alpha: a });
  ctx.save(); ctx.globalAlpha = a * E.outCubic(prog(t, t0 + 0.1, t0 + 0.5)); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  setFont(ctx, 'inter', aeon ? 76 : 84, 800, 0.06); ctx.fillStyle = P.white; ctx.fillText('BROKEN GEAR', 540 + 84 * 0.03, L.name);
  setFont(ctx, 'mono', 42, 600, 0.36); ctx.fillStyle = P.faint; ctx.fillText('INDUSTRIES', 540 + 42 * 0.18, L.sub); ctx.restore();
  // slogan: line 1 at t0 + 0.35, line 2 at t0 + 0.55; 60 px keeps line 1 left of the action rail
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; setFont(ctx, 'sg', 60, 700, -0.01);
  [[L.s1, 0.35], [L.s2, 0.55]].forEach(([y, d], i) => { const l = E.outCubic(prog(t, t0 + d, t0 + d + 0.45)); ctx.globalAlpha = l; ctx.fillStyle = SLOGAN_COLORS[i]; ctx.fillText(SLOGAN[i], 540, y + 18 * (1 - l)); });
  ctx.restore();
  // Follow button: lands with outBack, glows on a 1.6 s pulse, presses once at t0 + 1.9
  const bk = E.outBack(prog(t, t0 + 0.8, t0 + 1.2), 1.8), press = Math.sin(Math.PI * prog(t, t0 + 1.9, t0 + 2.1)), pulse = 0.5 + 0.5 * Math.sin((t - t0) * 2 * Math.PI / 1.6);
  if (bk > 0.001 && t >= t0 + 0.8) {
    ctx.save(); ctx.translate(540, L.btn); const sc = bk * (1 - 0.04 * press) * (1 + 0.015 * Math.sin((t - t0) * 2 * Math.PI / 1.6)); ctx.scale(sc, sc);
    glow(ctx, rgba(P.green, 0.35 + 0.35 * pulse), 30 + 18 * pulse, () => { ctx.fillStyle = P.green; roundRect(ctx, -250, -45, 500, 90, 45).fill(); });
    setFont(ctx, 'inter', 46, 750); ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('+  ' + CTA.follow, 0, 16); ctx.restore();
  }
  const c = E.outCubic(prog(t, t0 + 0.8, t0 + 1.15));
  ctx.save(); ctx.globalAlpha = c; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; setFont(ctx, 'inter', 46, 650); ctx.fillStyle = P.white;
  ctx.fillText(o.cta || FOOTER[aeon ? 'aeon' : 'bgi'], 540, L.foot);
  if (aeon) { setFont(ctx, 'inter', 42, 500); ctx.fillStyle = P.muted; const [l1, l2] = EIGHTEEN.split(', '); ctx.fillText(l1 + ',', 540, L.adult[0]); ctx.fillText(l2, 540, L.adult[1]); }
  ctx.restore();
}
