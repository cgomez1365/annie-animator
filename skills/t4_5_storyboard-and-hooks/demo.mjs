// t4.5 demo: a 28 s storyboard.json compiles into a timeline, and the pacing checklist reads it. Every number on screen comes from the compiler, not from the demo.
import { P, begin, end, hook, E, prog, lerp, rgba, setFont, glow, roundRect, windowFrame, windowInner, clipRect, icon, pages, page, stagger, noise1 } from '../../engine/index.mjs';
import { drawMascot } from '../t4_1_vector-mascot-design/module.mjs';
import { SKINNED, poseTrack, poseToRig, POSES } from '../t4_2_2d-rigging/module.mjs';
import { applyFace, applyBlink, blinkAmount, faceFor } from '../t4_3_expressions-and-acting/module.mjs';
import { exampleStoryboard, compileStoryboard, pacingReport, noveltyCurve } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.0 };
const SB = exampleStoryboard(28), C = compileStoryboard(SB), R = pacingReport(C, SB), NOV = noveltyCurve(C, 0.1);
const CLOSER = 4.4, WIN = { x: 72, y: 580, w: 936, h: 640 }, IN = windowInner(WIN);
const HEAD = { tIn: 0.1, tOut: 4.25, l1: 'Plan the hook.', l2: 'Check the pacing.', c2: P.green, b1: 446, b2: 514, px: 56 };
const KCOL = { hook: P.cyan, setup: P.muted, reveal: P.green, proof: P.orange, payoff: P.white, closer: P.dim };
const PG = pages([2.0, 2.15], { t0: 0.45, overlap: 0.1 });      // page 1: the beat sheet; page 2: the timeline and the checks
const CHECKS = [['Hook text at ' + C.hookCap.tIn.toFixed(2) + ' s', 3.45], ['Longest gap ' + R.longestGap.toFixed(1) + ' s', 3.7], ['Voice fits every beat', 3.95], ['No banned words', 4.2]];

function page1(ctx, t, p) {
  const st = stagger(C.beats.length, PG[0].s + 0.15, 0.14, 0.5);
  C.beats.forEach((b, i) => {
    const k = E.outBack((Math.min(1, Math.max(0, (t - st[i].s) / 0.5))), 1.6); if (k <= 0.001) return; const y = 720 + i * 92, d = b.e - b.s;
    ctx.save(); ctx.globalAlpha *= Math.min(1, k * 1.5); ctx.translate(120 + 60 * (1 - k), y);
    ctx.fillStyle = rgba(KCOL[b.kind], 0.18); roundRect(ctx, -14, -38, 210, 76, 22).fill(); ctx.fillStyle = KCOL[b.kind];
    setFont(ctx, 'inter', 46, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = P.white; ctx.fillText(b.id, 0, 16);
    ctx.fillStyle = KCOL[b.kind]; roundRect(ctx, 230, -20, d * 60 * Math.min(1, k), 40, 20).fill();
    setFont(ctx, 'inter', 44, 600); ctx.fillStyle = P.muted; ctx.fillText(d.toFixed(1) + ' s', 230 + d * 60 + 22, 15); ctx.restore();
  });
}
function page2(ctx, t, p) {
  const x0 = 120, W = 840, sc = W / C.T, k = E.outCubic(prog(t, PG[1].s + 0.1, PG[1].s + 0.6));
  ctx.save(); ctx.globalAlpha *= k;
  for (const b of [...C.beats, C.closer]) { const a = prog(t, PG[1].s + 0.1, PG[1].s + 0.1 + 0.5 + 0.04 * C.beats.indexOf(b)); ctx.fillStyle = KCOL[b.kind]; roundRect(ctx, x0 + b.s * sc + 2, 700, Math.max(2, (b.e - b.s) * sc - 4) * E.outCubic(a), 54, 12).fill(); }
  ctx.restore();
  const play = E.inOutCubic(prog(t, PG[1].s + 0.5, PG[1].s + 1.5)) * C.T;     // the playhead scrubs through the whole card
  // novelty curve (area) up to the playhead, event ticks
  ctx.save(); ctx.beginPath(); ctx.moveTo(x0, 880); NOV.forEach(q => { if (q.t <= play) ctx.lineTo(x0 + q.t * sc, 880 - q.v * 84); }); ctx.lineTo(x0 + Math.min(play, C.T) * sc, 880); ctx.closePath(); ctx.fillStyle = rgba(P.cyan, 0.22); ctx.fill();
  ctx.strokeStyle = P.cyan; ctx.lineWidth = 3; ctx.beginPath(); let first = true; NOV.forEach(q => { if (q.t <= play) { const X = x0 + q.t * sc, Y = 880 - q.v * 84; if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y); } }); ctx.stroke();
  for (const e of C.events) if (e <= play) { ctx.fillStyle = P.orange; ctx.beginPath(); ctx.arc(x0 + e * sc, 904, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  if (k > 0.05) { ctx.save(); ctx.globalAlpha *= k; ctx.strokeStyle = P.white; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 + play * sc, 684); ctx.lineTo(x0 + play * sc, 922); ctx.stroke(); ctx.fillStyle = P.white; ctx.beginPath(); ctx.arc(x0 + play * sc, 684, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  CHECKS.forEach(([txt, t0], i) => {
    const kk = E.outBack(Math.min(1, Math.max(0, (t - t0) / 0.4)), 1.8); if (kk <= 0.001) return; const y = 990 + i * 56;
    ctx.save(); ctx.translate(120, y); ctx.globalAlpha *= Math.min(1, kk * 1.4);
    glow(ctx, rgba(P.green, 0.5), 14, () => { ctx.save(); ctx.translate(20, -26); ctx.scale(kk, kk); icon(ctx, 'circle-check', -20, -2, 44, P.green, 2.4); ctx.restore(); });
    setFont(ctx, 'inter', 44, 650); ctx.fillStyle = P.white; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(txt, 70, 10); ctx.restore();
  });
}
function cogRig(t) {
  const pz = poseTrack([[0, 'idle'], [0.6, 'think', 'outCubic'], [3.3, 'think'], [3.5, 'cheer', 'outBack'], [4.35, 'cheer']])(t);
  pz.tilt += 0.03 * Math.sin(t * 2); pz.sy *= 1 + 0.012 * Math.sin(t * 3.1); pz.antenna = 0.3 * Math.sin(t * 2.4);
  const rig = poseToRig(pz); applyFace(rig, faceFor(t < 3.4 ? 'think' : 'joy', t < 3.4 ? 0.8 : 1)); applyBlink(rig, blinkAmount(t, [0.9, 2.7, 3.85])); return rig;
}
export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HEAD, t);
  const wi = E.outCubic(prog(t, 0.3, 0.7)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 60 * (1 - wi));
    const t1 = 1 - prog(t, PG[1].s, PG[1].s + 0.3);
    windowFrame(ctx, { ...WIN, title: 'storyboard.json', titleAlpha: t1 }); if (t > PG[1].s) { ctx.save(); ctx.globalAlpha *= 1 - t1; ctx.fillStyle = 'rgba(0,0,0,0)'; windowFrame(ctx, { ...WIN, title: 'timeline', titleAlpha: 1 - t1 }); ctx.restore(); }
    ctx.save(); clipRect(ctx, ...IN);
    for (const [pgw, fn] of [[PG[0], page1], [PG[1], page2]]) { const p = page(t, pgw); if (!p) continue; ctx.save(); ctx.globalAlpha *= p.a; ctx.translate(p.dx, 0); fn(ctx, t, p); ctx.restore(); }
    ctx.restore(); ctx.restore();
    ctx.save(); ctx.globalAlpha *= wo * wi; drawMascot(ctx, cogRig(t), { x: 190, y: 1355, u: 95, limb: SKINNED }); ctx.restore();
  }
  const ck = E.outBack(prog(t, CLOSER + 0.9, CLOSER + 1.4), 1.8);
  end(ctx, t, { closerAt: CLOSER });
  if (ck > 0.01) { const rg = poseToRig(POSES.cheer); applyFace(rg, faceFor('joy')); rg.antenna = 0.3 * Math.sin(t * 3); applyBlink(rg, blinkAmount(t, [CLOSER + 2.4])); drawMascot(ctx, rg, { x: 540, y: 1418, u: 92 * ck, limb: SKINNED }); }
  return cv;
}
