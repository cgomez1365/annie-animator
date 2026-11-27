// t2.5 demo: three jobs. Morph: play -> pause -> check -> heart (one icon changing shape). Follow: an arrow flies an S-curve, turning with it.
// Draw-on: a line chart draws itself with a bright head, then a light runs along it.
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, glow, lerp, prog, loop, E } from '../../engine/index.mjs';
import { makePath, iconPath, place, prepareMorph, morphPath, drawOn, fillPath, follow, drawFollower, chaseWindow, pointAt } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 4.0 };
const CLOSER = 4.9, WIN = { x: 72, y: 640, w: 936, h: 620, title: 'Draw it. Morph it. Fly it.' };
const HOOK = { tIn: 0.1, tOut: 1.75, l1: 'Shapes can', l2: 'move like thoughts.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.5, 1.1] };
const HEAD = { tIn: 1.85, tOut: 4.75, l1: 'Draw-on. Morph.', l2: 'Follow the path.', c2: P.green, b1: 446, b2: 514, px: 56 };

// ---- morph chain (icons placed at 200 px)
const AT = { x: 150, y: 768, s: 200 / 24 };
const ICONS = ['play', 'pause', 'circle-check', 'heart'].map(n => place(iconPath(n), AT));
const PREPS = [0, 1, 2].map(i => prepareMorph(ICONS[i], ICONS[i + 1], { n: 110 }));
const MORPH_T = [2.85, 3.55, 4.25], MORPH_DUR = 0.6;
// ---- follow path (pixels)
const FOLLOW = makePath('M 580 1000 C 680 740, 820 1020, 960 770', { step: 4 });
// ---- chart path (pixels)
const CHART = makePath('M 340 1205 C 400 1205 420 1120 470 1130 S 560 1195 620 1155 S 720 1085 780 1105 S 880 1060 960 1085', { step: 4 });
const AREA = (() => { const pts = [...CHART.subs[0].pts, [960, 1225], [340, 1225]]; return { subs: [{ pts, closed: true }] }; })();

function arrow(c) {
  glow(c, rgba(P.green, 0.6), 22, () => { c.fillStyle = P.green; c.beginPath(); c.moveTo(34, 0); c.lineTo(-26, -22); c.lineTo(-12, 0); c.lineTo(-26, 22); c.closePath(); c.fill(); });
}

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 1.7, 2.1)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // ---- morph
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(250, 868, 118, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    let cur = ICONS[0], k0 = 0;
    for (let i = 0; i < 3; i++) if (t >= MORPH_T[i]) { cur = morphPath(PREPS[i], E.inOutCubic(prog(t, MORPH_T[i], MORPH_T[i] + MORPH_DUR)), { stagger: 0.3 }); k0 = 1; }
    const kDraw = E.outCubic(prog(t, 2.0, 2.6));
    if (t < MORPH_T[0]) { fillPath(ctx, ICONS[0], rgba(P.green, 0.22), prog(t, 2.5, 2.8)); drawOn(ctx, ICONS[0], { to: kDraw, width: 9, color: P.green, glow: P.green, head: kDraw < 1 ? '#ffffff' : null }); }
    else drawOn(ctx, cur, { width: 9, color: P.green, glow: P.green });
    { const w = chaseWindow(loop(t, 1.3), 0.22); if (t > 2.6) drawOn(ctx, t < MORPH_T[0] ? ICONS[0] : cur, { ...w, width: 9, color: '#eafff6', alpha: 0.9 }); }
    setFont(ctx, 'inter', 42, 600); ctx.fillStyle = P.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('morph', 250, 1030);
    // ---- follow
    drawOn(ctx, FOLLOW, { width: 3, color: 'rgba(255,255,255,0.16)' });
    const going = t < 3.55, k = going ? E.inOutCubic(prog(t, 2.0, 3.5)) : 1 - E.inOutCubic(prog(t, 3.6, 4.8));
    if (t >= 2.0) {
      const f = follow(FOLLOW, k), flip = Math.PI * E.inOutCubic(prog(t, 3.5, 3.75));
      drawOn(ctx, FOLLOW, going ? { from: Math.max(0, k - 0.32), to: k, width: 10, color: P.cyan, glow: P.cyan, alpha: 0.9 } : { from: k, to: Math.min(1, k + 0.32), width: 10, color: P.cyan, glow: P.cyan, alpha: 0.9 });
      drawFollower(ctx, { x: f.x, y: f.y, angle: f.angle + flip }, arrow);
    }
    setFont(ctx, 'inter', 42, 600); ctx.fillStyle = P.muted; ctx.textAlign = 'center'; ctx.fillText('follow', 770, 1030);
    // ---- draw-on chart
    const kc = E.outCubic(prog(t, 2.1, 3.5));
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(340, 1225); ctx.lineTo(980, 1225); ctx.moveTo(340, 1225); ctx.lineTo(340, 1050); ctx.stroke();
    fillPath(ctx, AREA, rgba(P.cyan, 0.16), prog(t, 3.3, 3.9));
    drawOn(ctx, CHART, { to: kc, width: 8, color: P.cyan, glow: P.cyan, head: kc < 1 ? '#ffffff' : null });
    if (t > 3.5) { const w = chaseWindow(loop(t, 1.1), 0.25); drawOn(ctx, CHART, { ...w, width: 8, color: '#eaffff', alpha: 0.9 }); }
    setFont(ctx, 'inter', 42, 600); ctx.fillStyle = P.muted; ctx.textAlign = 'left'; ctx.fillText('draw-on', 110, 1170);
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
