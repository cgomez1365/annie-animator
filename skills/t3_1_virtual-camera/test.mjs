#!/usr/bin/env node
// t3.1 test: unit checks of the camera maths and the blur, then render the demo and run the quality checker.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/index.mjs';
import { rig, pushIn, pan, moveTrack, handheld, shake, whip, applyCamera, worldToScreen, camSpeed, motionBlur, focusBlur, rackFocus, withBlur, inView } from './module.mjs';

const lumaSum = c => { const d = c.getImageData(0, 0, 1080, 1920).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]; return s; };
const rowExtent = (c, y) => { const d = c.getImageData(0, y, 1080, 1).data; let a = -1, b = -1; for (let x = 0; x < 1080; x++) if (d[x * 4] > 8) { if (a < 0) a = x; b = x; } return [a, b]; };

await runSkillTest({ dir: import.meta.dirname, checks: async ({ ok, near }) => {
  // ---- rig: a stack that adds x/y/rot and multiplies zoom
  const r = rig(pushIn({ t0: 1, t1: 2, from: 1, to: 1.2 }), pushIn({ t0: 1, t1: 2, from: 1, to: 1.5 }), pan({ t0: 0, t1: 1, to: [100, 40] }), () => ({ x: 5, rot: 0.1 }));
  const c0 = r.at(0), c2 = r.at(3);
  near(c0.zoom, 1, 1e-12, 'rig: zoom at rest is 1'); near(c2.zoom, 1.2 * 1.5, 1e-9, 'rig: zooms multiply'); near(c2.x, 105, 1e-9, 'rig: x adds'); near(c2.y, 40, 1e-9, 'rig: y adds'); near(c2.rot, 0.1, 1e-12, 'rig: rot adds');
  // ---- pushIn: exact endpoints, holds, monotonic
  const p = pushIn({ t0: 1, t1: 2.5, from: 1, to: 1.12 }); near(p(0).zoom, 1, 1e-12, 'pushIn: before t0'); near(p(1).zoom, 1, 1e-12, 'pushIn: at t0'); near(p(2.5).zoom, 1.12, 1e-12, 'pushIn: at t1'); near(p(9).zoom, 1.12, 1e-12, 'pushIn: holds');
  let mono = true; for (let t = 1; t < 2.5; t += 0.05) if (p(t + 0.05).zoom < p(t).zoom - 1e-12) mono = false; ok(mono, 'pushIn is monotonic');
  const pn = pan({ t0: 0, t1: 1, from: [10, 0], to: [-90, 20] }); near(pn(0).x, 10, 1e-12, 'pan start'); near(pn(1).x, -90, 1e-12, 'pan end'); near(pn(0.5).y, 10, 1e-9, 'pan middle (inOutCubic is symmetric)');
  const mt = moveTrack({ zoom: [[0, 1], [1, 1.5, 'outCubic']], x: [[0, 0], [2, 80]] }); near(mt(1).zoom, 1.5, 1e-12, 'moveTrack zoom'); near(mt(1).x, 40, 1e-9, 'moveTrack x (linear)'); ok(mt(1).rot === undefined, 'moveTrack leaves other channels alone');
  // ---- handheld: deterministic, bounded, alive, fades
  const h = handheld({ amp: 6, rot: 0.003, freq: 1.6, seed: 9 }), h2 = handheld({ amp: 6, rot: 0.003, freq: 1.6, seed: 9 }), h3 = handheld({ amp: 6, seed: 10 });
  let hx = 0, hmax = 0, rmax = 0, same = true, diff = false;
  for (let i = 0; i < 600; i++) { const t = i / 30, a = h(t), b = h2(t); if (a.x !== b.x || a.y !== b.y) same = false; if (h3(t).x !== a.x) diff = true; hmax = Math.max(hmax, Math.abs(a.x), Math.abs(a.y)); rmax = Math.max(rmax, Math.abs(a.rot)); hx += a.x * a.x; }
  ok(same, 'handheld: same seed, same path'); ok(diff, 'handheld: other seed, other path'); ok(hmax <= 6.0001 && hmax > 1.5, `handheld stays within amp and moves (max ${hmax.toFixed(2)})`); ok(rmax <= 0.003 + 1e-9 && rmax > 0.0005, `handheld roll bounded (${rmax.toFixed(4)})`); ok(Math.sqrt(hx / 600) > 1, 'handheld rms above 1 px (alive)');
  const hf = handheld({ amp: 6, t0: 2, t1: 4 }); ok(Object.keys(hf(1)).length === 0 && Object.keys(hf(5)).length === 0, 'handheld window: nothing outside t0..t1'); ok(Math.abs(hf(3).x) > 0 || Math.abs(hf(3.01).x) > 0, 'handheld window: active inside');
  // ---- shake: zero outside, bounded, decays
  const s = shake({ hits: [[1, 0.8]], dur: 0.6, amp: 30 }); ok(Object.keys(s(0.99)).length === 0 && Object.keys(s(1.6)).length === 0, 'shake: nothing before the hit or after dur');
  let e1 = 0, e2 = 0, smax = 0; for (let i = 0; i < 6; i++) { e1 += Math.abs(s(1.01 + i / 60).x); e2 += Math.abs(s(1.45 + i / 60).x); } for (let i = 0; i < 18; i++) smax = Math.max(smax, Math.abs(s(1 + i / 30).x));
  ok(e1 > 4 * e2, `shake decays (early ${e1.toFixed(1)} vs late ${e2.toFixed(2)})`); ok(smax <= 30 * 0.64 + 1e-9 && smax > 3, `shake bounded by amp * strength^2 (max ${smax.toFixed(1)})`);
  // ---- whip: endpoints, monotonic, fast middle
  const w = whip({ t0: 2, dur: 0.5, dx: 1200 }); near(w(1.9).x, 0, 1e-12, 'whip: before'); near(w(2.5).x, 1200, 1e-9, 'whip: lands exactly'); near(w(9).x, 1200, 1e-9, 'whip: holds');
  let wm = true, peak = 0; for (let i = 0; i < 15; i++) { const a = w(2 + i / 30).x, b = w(2 + (i + 1) / 30).x; if (b < a - 1e-9) wm = false; peak = Math.max(peak, b - a); } ok(wm, 'whip monotonic'); ok(peak > 3 * (1200 / 15), `whip peak speed ${peak.toFixed(0)} px/frame is over 3x the average ${1200 / 15}`);
  // ---- camera maths: worldToScreen and applyCamera agree
  const rest = { x: 0, y: 0, zoom: 1, rot: 0 }; let q = worldToScreen(rest, 1, [300, 700]); near(q[0], 300, 1e-9, 'rest camera is identity x'); near(q[1], 700, 1e-9, 'rest camera is identity y');
  const pc = { x: 100, y: 0, zoom: 1, rot: 0 }; near(worldToScreen(pc, 1, [540, 960])[0], 440, 1e-9, 'par 1 moves a full 100 px'); near(worldToScreen(pc, 0.3, [540, 960])[0], 510, 1e-9, 'par 0.3 moves 30 px'); near(worldToScreen(pc, 0, [540, 960])[0], 540, 1e-9, 'par 0 is fixed to the screen'); near(worldToScreen(pc, 1.8, [540, 960])[0], 360, 1e-9, 'par 1.8 moves 180 px');
  const zc = { x: 0, y: 0, zoom: 1.2, rot: 0 }; near(worldToScreen(zc, 1, [540, 960])[0], 540, 1e-9, 'zoom keeps the centre'); near(worldToScreen(zc, 1, [640, 960])[0], 660, 1e-9, 'zoom 1.2 scales offsets by 1.2'); near(worldToScreen(zc, 2, [640, 960])[0], 540 + 100 * 1.4, 1e-9, 'par 2 scales by 1 + 0.2 * 2'); near(worldToScreen(zc, 0, [640, 960])[0], 640, 1e-9, 'par 0 does not zoom');
  const cam = { x: 37, y: -22, zoom: 1.13, rot: 0.05 }, cv = createCanvas(1080, 1920), cx = cv.getContext('2d'); cx.save(); applyCamera(cx, cam, 1.4); const T = cx.getTransform(); cx.restore();
  const [sx, sy] = worldToScreen(cam, 1.4, [222, 1333]); near(T.a * 222 + T.c * 1333 + T.e, sx, 1e-3, 'applyCamera matches worldToScreen (x)'); near(T.b * 222 + T.d * 1333 + T.f, sy, 1e-3, 'applyCamera matches worldToScreen (y)');
  // ---- camSpeed
  near(camSpeed(rig(), 1, 30), 0, 1e-12, 'camSpeed of a still rig is 0'); ok(camSpeed(rig(whip({ t0: 2, dx: 1200 })), 2.25, 30) > 200, 'camSpeed mid-whip is above 200 px/frame'); ok(camSpeed(rig(whip({ t0: 2, dx: 1200 })), 3, 30) === 0, 'camSpeed after the whip is 0');
  // ---- motionBlur: still = 1 draw; whip = many; light is conserved; deterministic; smears wider
  const WR = rig(whip({ t0: 2, dur: 0.5, dx: 1200 })), SQ = (c, ts) => { c.fillStyle = '#000'; c.fillRect(0, 0, 1080, 1920); c.fillStyle = '#fff'; c.fillRect(1000 - WR.at(ts).x, 900, 80, 80); };
  const still = createCanvas(1080, 1920).getContext('2d'); ok(motionBlur(still, 3, SQ, { rig: WR }) === 1, 'motionBlur: one draw when the camera is still');
  const A = createCanvas(1080, 1920).getContext('2d'), B = createCanvas(1080, 1920).getContext('2d'), S = createCanvas(1080, 1920).getContext('2d');
  const n1 = motionBlur(A, 2.25, SQ, { rig: WR, shutter: 0.55 }), n2 = motionBlur(B, 2.25, SQ, { rig: WR, shutter: 0.55 }); SQ(S, 2.25);
  ok(n1 >= 8 && n1 <= 16, `motionBlur uses 8-16 samples mid-whip (${n1})`); ok(n1 === n2 && lumaSum(A) === lumaSum(B), 'motionBlur is deterministic');
  const ls = lumaSum(S), lb = lumaSum(A); ok(Math.abs(lb - ls) / ls < 0.03, `motionBlur keeps the total light (${(100 * (lb - ls) / ls).toFixed(2)} percent off)`);
  const eS = rowExtent(S, 940), eB = rowExtent(A, 940); ok(eB[1] - eB[0] > 2 * (eS[1] - eS[0]), `blurred smear is over 2x wider than the sharp square (${eB[1] - eB[0]} vs ${eS[1] - eS[0]} px)`);
  // ---- focusBlur / rackFocus / withBlur / inView
  near(focusBlur(1, 1, 12), 0, 1e-12, 'focusBlur: in focus is 0'); ok(focusBlur(1.8, 1, 12) > focusBlur(1.3, 1, 12) && focusBlur(0.3, 1, 12) > focusBlur(0.7, 1, 12), 'focusBlur grows with distance'); near(focusBlur(9, 1, 12, 28), 28, 1e-12, 'focusBlur is capped');
  const rf = rackFocus([[0, 1.8], [1, 1.8], [1.6, 1, 'inOutCubic']]); near(rf(0.5), 1.8, 1e-12, 'rackFocus holds'); near(rf(1.3), 1.4, 1e-9, 'rackFocus midpoint'); near(rf(5), 1, 1e-12, 'rackFocus lands');
  const D = createCanvas(1080, 1920).getContext('2d'), Dn = createCanvas(1080, 1920).getContext('2d'), Dz = createCanvas(1080, 1920).getContext('2d');
  for (const c of [D, Dn, Dz]) { c.fillStyle = '#000'; c.fillRect(0, 0, 1080, 1920); }
  const sq = c => { c.fillStyle = '#fff'; c.fillRect(500, 900, 80, 80); };
  withBlur(D, 14, sq); sq(Dn); withBlur(Dz, 0, sq);
  ok(D.getImageData(499, 940, 1, 1).data[0] > 20 && D.getImageData(499, 940, 1, 1).data[0] < 200, 'withBlur softens the edge'); ok(D.getImageData(540, 940, 1, 1).data[0] > 200, 'withBlur keeps the core bright'); ok(lumaSum(Dz) === lumaSum(Dn), 'withBlur(0) is a plain draw'); ok(Math.abs(lumaSum(D) - lumaSum(Dn)) / lumaSum(Dn) < 0.03, 'withBlur keeps the total light');
  const tx = createCanvas(1080, 1920).getContext('2d'); tx.save(); tx.translate(60, 40); withBlur(tx, 8, c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 50, 50); }); tx.restore(); ok(tx.getImageData(70, 60, 1, 1).data[0] > 200 && tx.getImageData(30, 30, 1, 1).data[0] < 5, 'withBlur honours the transform of ctx');
  ok(inView({ x: 0, y: 0, zoom: 1, rot: 0 }, 1, 0) && !inView({ x: 0, y: 0, zoom: 1, rot: 0 }, 1, 2400) && inView({ x: 2400, y: 0, zoom: 1, rot: 0 }, 1, 2400), 'inView culls a far scene');
  // ---- source hygiene and frame determinism
  for (const f of ['module.mjs', 'demo.mjs']) { const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''); ok(!/Math\.random|Date\.now|new Date/.test(src), `${f}: no Math.random or Date`); }
  const demo = await import('./demo.mjs'), hash = c => crypto.createHash('sha1').update(c.toBuffer('image/png')).digest('hex');
  ok(hash(demo.frame(2.5, 75)) === hash(demo.frame(2.5, 75)), 'demo frame 2.5 s (mid whip) renders identically twice');
} });
