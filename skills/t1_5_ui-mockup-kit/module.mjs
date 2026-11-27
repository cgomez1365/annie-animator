// t1.5 ui-mockup-kit: the parts of an illustrated product screen, each one animated by its own start time t0.
// Fields fill, buttons press, bubbles pop, bars grow, stamps slam, toggles flip, tabs slide, ticks draw.
// Every part is a pure function of (ctx, t, spec); the small pure helpers (pressScale, stampPose, ...) are exported and tested.
// UI mockups are ILLUSTRATIONS: no real names, no data. Real text is 42 px or more (the readable floor).
import { E, prog, lerp, clamp, rgba, mix } from '../../engine/ease.mjs';
import { setFont, textW, roundRect, glow } from '../../engine/canvas.mjs';
import { icon } from '../../engine/parts.mjs';
import { P } from '../../engine/brand.mjs';
import { loop } from '../../engine/timeline.mjs';

const txt = (c, s, x, y, px, col, w = 650, align = 'left', track = 0) => { setFont(c, 'inter', px, w, track); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, x, y); };
/** Caret alpha 0..1 (period 1.06 s, on 55 percent, 0.08 s soft edges): the same numbers as t1.4's cursorAlpha, kept local so this module needs only the engine. */
export function cursorAlphaLocal(t, period = 1.06, duty = 0.55, edge = 0.08) { const u = loop(t, period) * period, on = duty * period; return clamp(u / edge) * (1 - clamp((u - on) / edge)); }
/** Fade-in alpha 0..1 over d s (outCubic) starting at t0. */
export const appear = (t, t0, d = 0.25) => E.outCubic(prog(t, t0, t0 + d));

// ---------------------------------------------------------------- pure helpers
/** Button press scale: 1 -> 0.96 -> 1 over 0.2 s starting at pressT (a half sine). */
export const pressScale = (t, pressT) => 1 - 0.04 * Math.sin(Math.PI * prog(t, pressT, pressT + 0.2));
/** Which label a pressed button shows: the label swaps 0.1 s after the press starts (the lowest point of the squeeze). */
export const labelAt = (t, pressT, label, doneLabel) => (doneLabel && t >= pressT + 0.1 ? doneLabel : label);
/** Pop scale with outBack (s 1.7 = about 10 percent overshoot) over dur s from t0. Returns 0 before t0. */
export const popScale = (t, t0, dur = 0.5, s = 1.7) => E.outBack(prog(t, t0, t0 + dur), s);
/**
 * Stamp slam: scale falls from `from` (2.2) to 1 with outElastic(1, 0.3) over dur (0.8 s), so it crosses 1 several times;
 * alpha is up in 0.1 s. Returns {scale, a, impact} where impact = the time it first reaches scale 1 (shake the window then, see jolt()).
 */
export function stampPose(t, t0, { from = 2.2, dur = 0.8 } = {}) {
  const k = E.outElastic(prog(t, t0, t0 + dur), 1, 0.3); let u = 0; while (E.outElastic(u, 1, 0.3) < 1 && u < 1) u += 0.001;
  return { scale: lerp(from, 1, k), a: clamp(prog(t, t0, t0 + 0.1)), impact: t0 + u * dur, k };
}
/** Window jolt after an impact at tI: a decaying shake {dx, dy} of `amp` px (default 7) for 0.35 s. Translate the whole window by it. */
export function jolt(t, tI, amp = 7) { const u = prog(t, tI, tI + 0.35), d = (1 - u) ** 2; return t < tI ? { dx: 0, dy: 0 } : { dx: amp * d * Math.sin(u * 38), dy: amp * 0.6 * d * Math.cos(u * 31) }; }
/** Toggle knob position 0 (off) .. 1 (on) with a small overshoot: outBack(1.8) over 0.35 s from flipT; back = flips it off. */
export const toggleK = (t, flipT, { back = false, dur = 0.35 } = {}) => { const k = E.outBack(prog(t, flipT, flipT + dur), 1.8); return back ? 1 - k : k; };
/** Tab underline position (a float tab index) given switches [[t, index], ...] sorted by time; each move is 0.35 s inOutCubic. */
export function tabPos(t, switches, start = 0) {
  let from = start, cur = start; for (const [ts, idx] of switches) { if (t >= ts) { const f = E.inOutCubic(prog(t, ts, ts + 0.35)); cur = lerp(from, idx, f); if (f >= 1) from = idx; } else break; } return cur;
}
/** Tick draw progress 0..1 (outCubic over 0.25 s from t0). */
export const tickK = (t, t0) => E.outCubic(prog(t, t0, t0 + 0.25));
/** Count-up: the number shown while a stat bar fills (rounded integer of value*100 at eased k). */
export const countUp = (t, t0, dur, value) => Math.round(100 * value * E.outCubic(prog(t, t0, t0 + dur)));

// ---------------------------------------------------------------- form field
/**
 * A form field: outline box with an icon, a grey fill bar that grows (outCubic) as if text were typed, and a blinking caret when done.
 * tt10: box 840 x 74 radius 14, field fades in 0.2 s before its fill, fill from x+80, bar height 12. Or pass `value` to type REAL text
 * (44 px, one letter per 60 ms, with a caret that follows).
 * @param {*} ctx @param {number} t @param {{x:number,y:number,w?:number,h?:number,ic?:string,t0:number,fillDur?:number,fillW?:number,value?:string,label?:string,color?:string}} f
 * y is the TOP of the box. Fill starts at t0, the box appears 0.2 s earlier.
 */
export function formField(ctx, t, f) {
  const w = f.w ?? 840, h = f.h ?? 74, a = appear(t, f.t0 - 0.2, 0.2); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; roundRect(ctx, f.x, f.y, w, h, 14).stroke();
  if (f.ic) icon(ctx, f.ic, f.x + 22, f.y + (h - 36) / 2, 36, P.muted, 2);
  const fk = E.outCubic(prog(t, f.t0, f.t0 + (f.fillDur ?? 0.5)));
  if (f.value) { const n = Math.floor(f.value.length * clamp(prog(t, f.t0, f.t0 + f.value.length * 0.06))), s = f.value.slice(0, n); txt(ctx, s, f.x + 80, f.y + h / 2 + 15, 44, P.text, 550); setFont(ctx, 'inter', 44, 550); const cx = f.x + 80 + ctx.measureText(s).width + 4; ctx.globalAlpha *= cursorAlphaLocal(t); ctx.fillStyle = P.green; ctx.fillRect(cx, f.y + 16, 4, h - 32); }
  else {
    ctx.fillStyle = 'rgba(203,213,225,0.55)'; roundRect(ctx, f.x + 80, f.y + h / 2 - 6, (f.fillW ?? 330) * fk, 12, 6).fill();
    if (fk >= 1) { ctx.fillStyle = f.color || P.green; ctx.globalAlpha *= cursorAlphaLocal(t); ctx.fillRect(f.x + 80 + (f.fillW ?? 330) + 14, f.y + h / 2 - 15, 4, 30); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- button
/**
 * A full-width button that fades in at t0 (0.25 s), presses at pressT (scale 1 -> 0.96 -> 1) and becomes the confirmation:
 * the label swaps at pressT + 0.1 to `doneLabel` with a check icon. tt10: 840 x 76, green fill, ink text 44 px / 700.
 * @param {{x:number,y:number,w?:number,h?:number,label:string,doneLabel?:string,doneIcon?:string,t0:number,pressT?:number,color?:string,ink?:string}} b x,y = CENTRE
 */
export function pressButton(ctx, t, b) {
  const a = appear(t, b.t0, 0.25); if (a <= 0) return; const w = b.w ?? 840, h = b.h ?? 76, s = b.pressT === undefined ? 1 : pressScale(t, b.pressT), label = labelAt(t, b.pressT ?? Infinity, b.label, b.doneLabel);
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(b.x, b.y); ctx.scale(s, s); ctx.fillStyle = b.color || P.green; roundRect(ctx, -w / 2, -h / 2, w, h, 16).fill();
  const ink = b.ink || P.ink;
  if (label === b.doneLabel && b.doneLabel) { setFont(ctx, 'inter', 44, 700); const tw = 44 + 14 + ctx.measureText(label).width; icon(ctx, b.doneIcon || 'circle-check', -tw / 2, -22, 44, ink, 2.6); txt(ctx, label, -tw / 2 + 58, 16, 44, ink, 700); }
  else txt(ctx, label, 0, 16, 44, ink, 700, 'center');
  ctx.restore();
}

// ---------------------------------------------------------------- prediction bubble
/**
 * A speech / prediction bubble that pops with outBack(1.7) over 0.5 s, scaling about its tail so it grows out of its source.
 * b: {x,y,w,h,text,t0,tail:'bl'|'br'|'tl'|'tr' (default 'bl'), color (border/accent), px (44)}. x,y = top-left of the bubble body.
 */
export function bubble(ctx, t, b) {
  const k = popScale(t, b.t0, 0.5, 1.7); if (k <= 0) return; const tail = b.tail || 'bl', col = b.color || P.green, ox = tail.endsWith('l') ? b.x + 40 : b.x + b.w - 40, oy = tail[0] === 'b' ? b.y + b.h + 22 : b.y - 22;
  ctx.save(); ctx.globalAlpha *= clamp(k * 1.6); ctx.translate(ox, oy); ctx.scale(k, k); ctx.translate(-ox, -oy);
  ctx.fillStyle = P.panel2; ctx.strokeStyle = col; ctx.lineWidth = 3; roundRect(ctx, b.x, b.y, b.w, b.h, 26).fill(); ctx.stroke();
  const ty = tail[0] === 'b' ? b.y + b.h : b.y, dir = tail[0] === 'b' ? 1 : -1; ctx.beginPath(); ctx.moveTo(ox - 16, ty); ctx.lineTo(ox, ty + 22 * dir); ctx.lineTo(ox + 16, ty); ctx.closePath(); ctx.fillStyle = P.panel2; ctx.fill();
  ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(ox - 16, ty); ctx.lineTo(ox, ty + 22 * dir); ctx.lineTo(ox + 16, ty); ctx.stroke(); ctx.strokeStyle = P.panel2; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ox - 14, ty); ctx.lineTo(ox + 14, ty); ctx.stroke();
  txt(ctx, b.text, b.x + b.w / 2, b.y + b.h / 2 + (b.px ?? 44) * 0.36, b.px ?? 44, P.white, 650, 'center'); ctx.restore();
}

// ---------------------------------------------------------------- stat bar
/**
 * A labelled bar that fills with outCubic and counts its percentage up. s: {x,y,w,label,value (0..1),t0,dur (0.8),color,h (26)}; y = baseline of the label.
 * Layout: label at the left (46 px), the percentage at the right end, the track under both.
 */
export function statBar(ctx, t, s) {
  const a = appear(t, s.t0 - 0.15, 0.25); if (a <= 0) return; const h = s.h ?? 26, k = E.outCubic(prog(t, s.t0, s.t0 + (s.dur ?? 0.8)));
  ctx.save(); ctx.globalAlpha *= a; txt(ctx, s.label, s.x, s.y, 46, P.white, 650); txt(ctx, countUp(t, s.t0, s.dur ?? 0.8, s.value) + '%', s.x + s.w, s.y, 46, s.color || P.green, 700, 'right');
  ctx.fillStyle = rgba(P.white, 0.07); roundRect(ctx, s.x, s.y + 20, s.w, h, h / 2).fill(); if (k > 0.001) { ctx.fillStyle = s.color || P.green; roundRect(ctx, s.x, s.y + 20, Math.max(h, s.w * s.value * k), h, h / 2).fill(); }
  ctx.restore();
}

// ---------------------------------------------------------------- stamp
/**
 * A rubber stamp that slams in with outElastic (scale 2.2 -> 1, crossing 1 several times), a ring of ink expanding from the impact.
 * s: {x,y (centre),text,t0,rot (-0.14 rad),color (green),px (60)}. Returns the impact time so the card can jolt() the window.
 * Text is uppercase Space Grotesk 700, tracked 0.08 em, inside a double border.
 */
export function stamp(ctx, t, s) {
  const p = stampPose(t, s.t0); if (p.a <= 0) return p.impact; const col = s.color || P.green, px = s.px ?? 60;
  setFont(ctx, 'sg', px, 700, 0.08); const tw = ctx.measureText(s.text).width, bw = tw + 70, bh = px + 56;
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot ?? -0.14);
  const ring = prog(t, p.impact, p.impact + 0.45); if (ring > 0 && ring < 1) { ctx.strokeStyle = rgba(col, 0.5 * (1 - ring)); ctx.lineWidth = 4; roundRect(ctx, -bw / 2 - 40 * ring, -bh / 2 - 40 * ring, bw + 80 * ring, bh + 80 * ring, 18 + 30 * ring).stroke(); }
  ctx.scale(p.scale, p.scale); ctx.globalAlpha *= p.a; glow(ctx, rgba(col, 0.35), 22, () => { ctx.fillStyle = rgba(P.bg, 0.86); roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 14).fill(); });
  ctx.strokeStyle = col; ctx.lineWidth = 5; roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 14).stroke(); ctx.lineWidth = 2; roundRect(ctx, -bw / 2 + 9, -bh / 2 + 9, bw - 18, bh - 18, 8).stroke();
  setFont(ctx, 'sg', px, 700, 0.08); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s.text, 0.04 * px, px * 0.36); ctx.restore(); return p.impact;
}

// ---------------------------------------------------------------- toggle
/**
 * A labelled switch. The knob slides with outBack(1.8) over 0.35 s at flipT while the track colour mixes dim -> green.
 * o: {x,y (label baseline, switch sits right of it at sx),label,sx (switch left x),t0,flipT,back,color}. Switch 150 x 76.
 */
export function toggle(ctx, t, o) {
  const a = appear(t, o.t0, 0.25); if (a <= 0) return; const k = toggleK(t, o.flipT ?? Infinity, { back: o.back }), kc = clamp(k), W = 150, H = 76, y0 = o.y - 52, sx = o.sx;
  ctx.save(); ctx.globalAlpha *= a; txt(ctx, o.label, o.x, o.y, 46, P.white, 650);
  ctx.fillStyle = mix(P.dim, o.color || P.green, kc); roundRect(ctx, sx, y0, W, H, H / 2).fill();
  const kx = sx + 8 + k * (W - 16 - 60), kn = 60; glow(ctx, 'rgba(0,0,0,0.4)', 8, () => { ctx.fillStyle = P.white; ctx.beginPath(); ctx.arc(kx + kn / 2, y0 + H / 2, kn / 2, 0, Math.PI * 2); ctx.fill(); }); ctx.restore();
}

// ---------------------------------------------------------------- tabs
/**
 * A tab bar: labels in a row, the active one white, the others muted, and an underline pill that SLIDES between them (0.35 s inOutCubic).
 * o: {x,y (baseline),w,labels,switches:[[t,index]],t0,start (0)}. Tabs share the width equally; labels are centred, 44 px.
 */
export function tabs(ctx, t, o) {
  const a = appear(t, o.t0, 0.25); if (a <= 0) return; const n = o.labels.length, cw = o.w / n, pos = tabPos(t, o.switches || [], o.start ?? 0);
  ctx.save(); ctx.globalAlpha *= a;
  o.labels.forEach((l, i) => { const on = clamp(1 - Math.abs(pos - i)); txt(ctx, l, o.x + cw * (i + 0.5), o.y, 44, mix(P.muted, P.white, on), 650, 'center'); });
  ctx.fillStyle = rgba(P.white, 0.08); ctx.fillRect(o.x, o.y + 22, o.w, 2); ctx.fillStyle = P.green; roundRect(ctx, o.x + cw * pos + cw * 0.15, o.y + 18, cw * 0.7, 8, 4).fill(); ctx.restore();
}

// ---------------------------------------------------------------- checkbox list
/**
 * Checkbox rows. Each row appears 0.14 s after the one above (0.4 s outCubic, 40 px from the right); its tick DRAWS (stroke grows over 0.25 s)
 * at ticks[i] while the box fills green and the text dims. o: {x,y (baseline of row 0),items,gap (64),t0,ticks:[t,...]}.
 */
export function checkList(ctx, t, o) {
  o.items.forEach((s, i) => {
    const r = appear(t, o.t0 + 0.14 * i, 0.4); if (r <= 0) return; const y = o.y + i * (o.gap ?? 64), tk = o.ticks?.[i] === undefined ? 0 : tickK(t, o.ticks[i]);
    ctx.save(); ctx.globalAlpha *= r; ctx.translate(40 * (1 - r), 0);
    ctx.fillStyle = tk > 0 ? rgba(P.green, 0.25 + 0.75 * tk) : 'rgba(255,255,255,0.03)'; ctx.strokeStyle = tk > 0 ? P.green : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; roundRect(ctx, o.x, y - 40, 48, 48, 12).fill(); ctx.stroke();
    if (tk > 0) { ctx.strokeStyle = P.ink; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const pts = [[o.x + 11, y - 15], [o.x + 21, y - 5], [o.x + 38, y - 29]], L1 = Math.hypot(10, 10), L2 = Math.hypot(17, 24), at = tk * (L1 + L2); ctx.beginPath(); ctx.moveTo(...pts[0]);
      if (at <= L1) ctx.lineTo(pts[0][0] + 10 * at / L1, pts[0][1] + 10 * at / L1); else { ctx.lineTo(...pts[1]); const f = (at - L1) / L2; ctx.lineTo(pts[1][0] + 17 * f, pts[1][1] - 24 * f); } ctx.stroke(); }
    txt(ctx, s, o.x + 76, y, 46, mix(P.white, P.muted, tk), 650); ctx.restore();
  });
}

// ---------------------------------------------------------------- signature pad
/** Points of a signature-like scribble inside a box (for signaturePad): a wave with a decaying slope. Build once at module level. */
export const scribble = (x0, x1, y, amp = 38, n = 220) => Array.from({ length: n + 1 }, (_, j) => { const u = j / n; return [x0 + (x1 - x0) * u + 30 * Math.cos(u * Math.PI * 14), y - amp * Math.sin(u * Math.PI * 14) * (0.55 + 0.45 * Math.sin(u * 6))]; });
/** A signature pad with a dashed baseline and a pen icon; `pts` (from scribble) is written across over [t0+0.25, t0+1.25] with inOutSine. o: {x,y,w,h,t0,pts}. */
export function signaturePad(ctx, t, o) {
  const a = appear(t, o.t0, 0.25); if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a;
  ctx.fillStyle = P.panel2; roundRect(ctx, o.x, o.y, o.w, o.h, 14).fill(); icon(ctx, 'pen-line', o.x + 22, o.y + 20, 36, P.muted, 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(o.x + 80, o.y + o.h - 34); ctx.lineTo(o.x + o.w - 40, o.y + o.h - 34); ctx.stroke(); ctx.setLineDash([]);
  const n = Math.floor(o.pts.length * E.inOutSine(prog(t, o.t0 + 0.25, o.t0 + 1.25)));
  if (n > 1) { ctx.strokeStyle = P.white; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); o.pts.slice(0, n).forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); } ctx.restore();
}
