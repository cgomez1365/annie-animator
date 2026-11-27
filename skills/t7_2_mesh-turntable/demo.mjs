// t7.2 demo: a product turntable for a printed figurine. The model is "printed" layer by layer (a green cut plane climbs it) while it turns on a
// ticked pedestal with a soft floor reflection, then keeps turning. Mesh = the dragon STL, decimated and cached on first run. 7.5 s, closer at 4.4 s.
import fs from 'node:fs';
import { P, begin, end, hook, E, prog, lerp, rgba, mix, loop, pulse, createCanvas } from '../../engine/index.mjs';
import { loadMesh, renderMesh, makeTorusKnot, finishMesh, fitScale, projectModelPoint, drawReflection } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 225, coverT: 3.4 };
const CLOSER = 4.4;
const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'Every angle.', l2: 'One smooth turn.', c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
const HEAD = { tIn: 2.1, tOut: 4.25, l1: 'Turn it.', l2: 'Show it off.', c2: P.green, b1: 446, b2: 514, px: 56 };
const STL = process.env.T72_STL || '/Users/cris/Desktop/Reports/Agents/VP_AEON/2026-11-16/Assets_Icons_Media/Printer_Axolotl/free_route/dragon_final_v9.stl';
let MESH, SCALE; const PITCH = 0.2, CY = 1010, CX = 540;

export async function init() {
  MESH = fs.existsSync(STL) ? await loadMesh(STL, { target: 150000, up: 'z' }) : finishMesh(makeTorusKnot({ R: 40, r: 12 }), { up: 'y' }); // fallback prop if the file is missing
  SCALE = fitScale(MESH, { maxW: 1120, maxH: 700, pitch: PITCH });
}
const ring = (mesh, pose, y, r, a0, a1, n = 72) => { const pts = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push(projectModelPoint(mesh, pose, [r * Math.cos(a), y, r * Math.sin(a)])); } return pts; };
const path = (ctx, pts) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  const wo = 1 - prog(t, CLOSER - 0.12, CLOSER + 0.25), pk = E.outBack(prog(t, 0.25, 0.85), 1.5), yaw = 0.35 + 2 * Math.PI * 0.94 * E.inOutSine(prog(t, 0.3, 4.55));
  if (wo <= 0.001) return end(ctx, t, { closerAt: CLOSER });
  const H = MESH.height, pr = prog(t, 0.85, 2.85), printing = pr < 1, clipY = printing ? H * 1.04 * E.inOutCubic(pr) : undefined;
  const pose = { yaw, pitch: PITCH, scale: SCALE, cx: CX, cy: CY, dist: 900, clipY };
  const base = projectModelPoint(MESH, pose, [0, 0, 0]), PR = MESH.radius * 0.64;
  ctx.save(); ctx.globalAlpha *= wo;
  // soft green light pool behind the figure
  const gl = ctx.createRadialGradient(CX, 960, 30, CX, 960, 560); gl.addColorStop(0, rgba(P.green, 0.13 * pk)); gl.addColorStop(1, rgba(P.green, 0)); ctx.fillStyle = gl; ctx.fillRect(0, 300, 1080, 1400);
  // pedestal: a slab (rim + top), ticks that turn with the model
  const top = ring(MESH, pose, 0, PR, 0, Math.PI * 2, 96);
  ctx.save(); ctx.globalAlpha *= E.outCubic(prog(t, 0.25, 0.7));
  ctx.beginPath(); top.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); const sh = ctx.createRadialGradient(base[0], base[1], 10, base[0], base[1], PR * SCALE); sh.addColorStop(0, '#1a222d'); sh.addColorStop(1, '#0f151c'); ctx.fillStyle = sh; ctx.fill();
  // side wall between the two ellipses (front half)
  const fr = ring(MESH, pose, 0, PR, Math.PI, Math.PI * 2), fr2 = ring(MESH, pose, -7, PR, Math.PI * 2, Math.PI); ctx.beginPath(); fr.concat(fr2).forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = '#10161d'; ctx.fill();
  ctx.strokeStyle = rgba(P.green, 0.55); ctx.lineWidth = 3; path(ctx, top); ctx.stroke();
  for (let i = 0; i < 72; i++) { // 5 degree ticks, every 6th longer; front ticks brighter: the rotation reads even when the figure is symmetric
    const a = i * Math.PI / 36 + yaw, long = i % 6 === 0, a0 = projectModelPoint(MESH, pose, [PR * (long ? 0.86 : 0.92) * Math.cos(a), 0, PR * (long ? 0.86 : 0.92) * Math.sin(a)]), a1 = projectModelPoint(MESH, pose, [PR * 0.985 * Math.cos(a), 0, PR * 0.985 * Math.sin(a)]);
    const front = Math.sin(a) < 0 ? 0 : 1; // z toward the back is +; sin(a) > 0 means behind the centre
    ctx.strokeStyle = rgba(P.green, (long ? 0.75 : 0.42) * (0.35 + 0.65 * (1 - front))); ctx.lineWidth = long ? 4 : 2.5; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
  }
  ctx.restore();
  // render the model once; use it for the reflection and the figure
  const r = renderMesh(MESH, pose, { ss: 2 });
  ctx.save(); path(ctx, top); ctx.closePath(); ctx.clip(); drawReflection(ctx, r, base[1], { alpha: 0.2, fadePx: 220 }); ctx.restore();
  // print plane: ring behind the figure, then the figure, then the front arc
  const ck = printing ? 1 : 1 - prog(t, 2.85, 3.15), ry = clipY !== undefined ? clipY : H, ringR = PR * 0.95, sweep = t * 3.2;
  if (ck > 0.01) { ctx.save(); ctx.globalAlpha *= ck; ctx.strokeStyle = rgba(P.green, 0.8); ctx.lineWidth = 3; path(ctx, ring(MESH, pose, ry, ringR, 0, Math.PI)); ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.globalAlpha *= E.outCubic(prog(t, 0.8, 1.1)); ctx.drawImage(r.cv, r.x0, r.y0); ctx.restore();
  if (ck > 0.01) {
    ctx.save(); ctx.globalAlpha *= ck; ctx.strokeStyle = rgba(P.green, 0.8); ctx.lineWidth = 3; path(ctx, ring(MESH, pose, ry, ringR, Math.PI, Math.PI * 2)); ctx.stroke();
    const nz = projectModelPoint(MESH, pose, [ringR * Math.cos(sweep), ry, ringR * Math.sin(sweep)]); ctx.fillStyle = P.white; ctx.shadowColor = P.green; ctx.shadowBlur = 22; ctx.beginPath(); ctx.arc(nz[0], nz[1], 9, 0, 7); ctx.fill(); ctx.restore();
  }
  ctx.restore();
  return end(ctx, t, { closerAt: CLOSER });
}
