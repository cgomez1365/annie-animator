// t1.6 the-closer: how every BGI card ends. The hook leaves, the window and headers fade, the ground, gear mark, wordmark,
// slogan (both lines together, line 2 green), the Follow button (glow, one press) and the footer come up, and AEON cards carry the 18+ line.
// drawCloser() reproduces the engine's closer() pixel for pixel by default and adds the knobs a card may turn (button press time, glow,
// footer text, follow label, mark, dust). The slogan text is NOT a parameter: it is brand law (CEO 2026-10-27).
import { E, prog, clamp, rgba } from '../../engine/ease.mjs';
import { setFont, glow, roundRect } from '../../engine/canvas.mjs';
import { P, SLOGAN, SLOGAN_COLORS, CTA, FOOTER, EIGHTEEN, SAFE } from '../../engine/brand.mjs';
import { dust, drawMark, CLOSER as LAYOUT } from '../../engine/parts.mjs';

const { W, H } = SAFE;

/** Offsets (seconds after the closer's start t0) of every closer event, as [start, end]. The reveal is complete 1.2 s after t0; the press is at 1.9 s. */
export const CLOSER_T = {
  ground: [0, 0.5], mark: [0, 0.8], wordmark: [0.1, 0.5], slogan1: [0.35, 0.8], slogan2: [0.55, 1.0],
  button: [0.8, 1.2], footer: [0.8, 1.15], press: [1.9, 2.1], settle: 1.2,
};
/** Seconds the closer needs after t0 to be read and rest on screen: reveal 1.2 s plus a 1.9 s hold = 3.1 s. A card ends at closerAt + 3.1 or later. */
export const CLOSER_HOLD = 3.1;

/** Y positions of each closer element for 'bgi' and 'aeon' (the engine's table: both fit y 300-1240, clear of the rail and the caption band). */
export const LAYOUT_Y = LAYOUT;

/**
 * The hand-over from the body of a card to the closer, as absolute times. Everything that leaves does so over [closerAt - 0.1, closerAt + 0.3]
 * (window, headers, kicker); the hook must already be gone (its own tOut + 0.2 s fade) before the window rises, and the closer's ground
 * covers whatever is left from closerAt. Returns the table plus `end` (the earliest sensible card length).
 * @param {number} closerAt @param {{hookTOut?:number}} [o]
 */
export function choreography(closerAt, { hookTOut } = {}) {
  const a = n => closerAt + n;
  return {
    hookGone: hookTOut === undefined ? undefined : hookTOut + 0.2, leaveStart: a(-0.1), leaveEnd: a(0.3), ground: a(0), mark: [a(0), a(0.8)], wordmark: [a(0.1), a(0.5)],
    slogan1: [a(0.35), a(0.8)], slogan2: [a(0.55), a(1.0)], button: [a(0.8), a(1.2)], footer: [a(0.8), a(1.15)], press: [a(1.9), a(2.1)], revealed: a(1.2), end: a(CLOSER_HOLD),
  };
}
/** Alpha for everything that leaves for the closer (window, headers, kicker, loose objects): 1 until closerAt - 0.1, 0 at closerAt + 0.3. */
export const fadeOut = (t, closerAt) => 1 - prog(t, closerAt - 0.1, closerAt + 0.3);

/**
 * Check a card's plan against the closer rules. Returns [{level:'fail'|'warn', msg}].
 * fail: card shorter than closerAt + 3.1 s (the reveal needs 1.2 s and the footer needs 1.9 s of rest); closerAt in the first half of the card
 * (the checker looks for the closer in the second half); brand 'aeon' without META.brand set; hook still visible when the window starts leaving.
 * warn: less than 3.1 s of hold; closer later than T - 3.1.
 * @param {{closerAt:number,duration:number,brand?:'bgi'|'aeon',metaBrand?:string,hookTOut?:number}} c
 */
export function validateCloser(c) {
  const out = [], hold = c.duration - c.closerAt;
  if (hold < 2.5) out.push({ level: 'fail', msg: `only ${hold.toFixed(2)} s after closerAt: the closer needs 3.1 s (2.5 s is the hard floor)` });
  else if (hold < CLOSER_HOLD - 1e-9) out.push({ level: 'warn', msg: `${hold.toFixed(2)} s of closer: the footer rests under 1.9 s` });
  if (c.closerAt < c.duration / 2) out.push({ level: 'fail', msg: `closerAt ${c.closerAt} is in the first half of a ${c.duration} s card` });
  if (c.brand === 'aeon' && c.metaBrand !== 'aeon') out.push({ level: 'fail', msg: "brand 'aeon' needs META.brand = 'aeon' so the checker requires the 18+ line" });
  if (c.hookTOut !== undefined && c.hookTOut + 0.2 > c.closerAt - 0.1) out.push({ level: 'fail', msg: 'the hook is still on screen when the window starts to leave' });
  return out;
}

/**
 * The slogan: both lines, line 1 white (rises at t0+0.35, 0.45 s outCubic, 18 px), line 2 green #19e08f (t0+0.55). 60 px Space Grotesk 700 centred
 * on x 540: line 1 stays left of the action rail (66 px reached x 956). The lines cannot be changed and cannot be drawn apart.
 * @param {*} ctx @param {number} t @param {number} t0 @param {number} y1 baseline of line 1 @param {number} y2 baseline of line 2
 */
export function drawSlogan(ctx, t, t0, y1, y2) {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; setFont(ctx, 'sg', 60, 700, -0.01);
  [[y1, 0.35], [y2, 0.55]].forEach(([y, d], i) => { const l = E.outCubic(prog(t, t0 + d, t0 + d + 0.45)); ctx.globalAlpha = l; ctx.fillStyle = SLOGAN_COLORS[i]; ctx.fillText(SLOGAN[i], 540, y + 18 * (1 - l)); });
  ctx.restore();
}

/**
 * The Follow button: lands at t0+0.8 with outBack(1.8) over 0.4 s, breathes (1.6 s period, scale +-1.5 percent, glow 30 to 48 px at 35 to 70 percent),
 * and presses once (1 -> 0.96 -> 1 over 0.2 s) at pressAt. 500 x 90 pill, ink text 46 px / 750, label "+  Follow for more".
 * @param {*} ctx @param {number} t @param {number} t0 closer start @param {number} y centre y @param {{label?:string,pressAt?:number|false,glowK?:number}} [o]
 */
export function drawFollow(ctx, t, t0, y, o = {}) {
  const bk = E.outBack(prog(t, t0 + 0.8, t0 + 1.2), 1.8), pa = o.pressAt === false ? Infinity : (o.pressAt ?? t0 + 1.9), press = Math.sin(Math.PI * prog(t, pa, pa + 0.2)), pulse = 0.5 + 0.5 * Math.sin((t - t0) * 2 * Math.PI / 1.6);
  if (!(bk > 0.001 && t >= t0 + 0.8)) return;
  ctx.save(); ctx.translate(540, y); const sc = bk * (1 - 0.04 * press) * (1 + 0.015 * Math.sin((t - t0) * 2 * Math.PI / 1.6)); ctx.scale(sc, sc); const g = o.glowK ?? 1;
  glow(ctx, rgba(P.green, (0.35 + 0.35 * pulse) * g), (30 + 18 * pulse) * g, () => { ctx.fillStyle = P.green; roundRect(ctx, -250, -45, 500, 90, 45).fill(); });
  setFont(ctx, 'inter', 46, 750); ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('+  ' + (o.label || CTA.follow), 0, 16); ctx.restore();
}

/**
 * The whole closer from t0. Draw it LAST. o: { brand 'bgi'|'aeon', cta (footer text, default the brand's URL), follow (button label),
 * pressAt (seconds, default t0+1.9, false = never), glowK (0..1.5), mark (false hides the gear mark), dustN (36) }.
 * brand 'aeon' adds the 18+ line in two lines (the full EIGHTEEN wording, never shortened) and uses the AEON layout (mark 250 px).
 * Never freezes: the dust drifts and the Follow button breathes (glow and 1.5 percent scale).
 */
export function drawCloser(ctx, t, t0, o = {}) {
  const k = prog(t, t0, t0 + 0.5), a = E.outCubic(k); if (k <= 0) return;
  const aeon = o.brand === 'aeon', L = LAYOUT[aeon ? 'aeon' : 'bgi'];
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(540, 600, 40, 540, 600, 760); g.addColorStop(0, rgba(P.green, 0.10)); g.addColorStop(1, rgba(P.bg, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  dust(ctx, t, { period: 9, n: o.dustN ?? 36, seed: 7, alpha: 0.8 * a });
  if (o.mark !== false) drawMark(ctx, L.mark[0], L.mark[1], L.mark[2], { k: prog(t, t0, t0 + 0.8), alpha: a });
  ctx.save(); ctx.globalAlpha = a * E.outCubic(prog(t, t0 + 0.1, t0 + 0.5)); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  setFont(ctx, 'inter', aeon ? 76 : 84, 800, 0.06); ctx.fillStyle = P.white; ctx.fillText('BROKEN GEAR', 540 + 84 * 0.03, L.name);
  setFont(ctx, 'mono', 42, 600, 0.36); ctx.fillStyle = P.faint; ctx.fillText('INDUSTRIES', 540 + 42 * 0.18, L.sub); ctx.restore();
  drawSlogan(ctx, t, t0, L.s1, L.s2);
  drawFollow(ctx, t, t0, L.btn, { label: o.follow, pressAt: o.pressAt, glowK: o.glowK });
  const c = E.outCubic(prog(t, t0 + 0.8, t0 + 1.15));
  ctx.save(); ctx.globalAlpha = c; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; setFont(ctx, 'inter', 46, 650); ctx.fillStyle = P.white; ctx.fillText(o.cta || FOOTER[aeon ? 'aeon' : 'bgi'], 540, L.foot);
  if (aeon) { setFont(ctx, 'inter', 42, 500); ctx.fillStyle = P.muted; const [l1, l2] = EIGHTEEN.split(', '); ctx.fillText(l1 + ',', 540, L.adult[0]); ctx.fillText(l2, 540, L.adult[1]); }
  ctx.restore();
}
