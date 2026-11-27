// t5.2 demo: bed A (108 BPM) under a card whose pulses, step lights and scene cuts are locked to the beat that analyzeTrack() found in the audio.
// Raw cut times (orange) are snapped to every second beat (green) with snapCuts. The strip is the real onset envelope of the track.
// The card is silent (engine rule); test.mjs muxes fixtures/A_bright_pluck.wav (starts at t = 0) into out/demo_av.mp4.
import path from 'node:path';
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, glow, E, prog, lerp, clamp, page } from '../../engine/index.mjs';
import { analyzeTrack, beatGrid, beatPulse, beatBounce, beatStep, snapCuts, envBars } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 234, coverT: 3.6 };
export const AUDIO = 'fixtures/A_bright_pluck.wav';
export const RAW_CUTS = [0.85, 2.45, 3.55];                       // where the "editor" wanted the cuts
const CLOSER = 4.7, DIR = import.meta.dirname;
const WIN = { x: 72, y: 640, w: 936, h: 640, title: 'bed A, 108 BPM' };
const HOOK = { tIn: 0.12, tOut: 4.4, l1: 'Cut on the beat.', l2: 'Not near it.', c2: P.green, b1: 470, b2: 580, px: 96, glint: [0.7, 1.3] };
const SCENES = [['Scene 1', P.green], ['Scene 2', P.cyan], ['Scene 3', P.orange], ['Scene 4', P.white]];
const SX0 = 130, SX1 = 950, SPAN = 5.0, SY = 1210;                // strip: 5 s over 820 px
let G, CUTS, BARS, DET;

export async function init() {
  const a = analyzeTrack(path.join(DIR, AUDIO));
  G = { bpm: a.bpm, phase: a.phase }; DET = a;
  CUTS = snapCuts(RAW_CUTS, G, { every: 2, maxShift: 0.3 });
  BARS = envBars(a.oe, 164);                                         // 164 bars of 5 px = 5 s
}
const tx = t => lerp(SX0, SX1, t / SPAN);

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t);
  const pulse = beatPulse(t, G), wi = E.outCubic(prog(t, 0.15, 0.55)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 70 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // row 1: eight step lights, one per beat, each pops ON its beat
    const cur = beatStep(t, G, 8);
    for (let n = 0; n < 8; n++) {
      const cx = 160 + n * 100, on = n === cur, k = on ? pulse : 0;
      ctx.save(); ctx.translate(cx, 800); ctx.scale(1 + 0.28 * k, 1 + 0.28 * k);
      if (on) glow(ctx, rgba(P.green, 0.6 * k), 26 * k, () => { ctx.fillStyle = P.green; ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.fill(); });
      else { ctx.strokeStyle = P.dim; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.stroke(); }
      setFont(ctx, 'inter', 42, 700); ctx.fillStyle = on ? P.ink : P.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(n % 4 + 1), 0, 15); ctx.restore();
    }
    // row 2: the scene panel; each scene's page starts 0.2 s before its cut so the move lands on the beat
    ctx.save(); clipRect(ctx, 110, 860, 860, 150, 18);
    ctx.fillStyle = P.panel2; ctx.fillRect(110, 860, 860, 150);
    const starts = [0.45, ...CUTS.map(c => c.t - 0.2)], ends = [...CUTS.map(c => c.t - 0.2), 99];   // each page is gone the moment the next starts: no text ever overlaps
    SCENES.forEach(([label, col], i) => {
      const pg = page(t, { s: starts[i], e: ends[i], dist: 220 }); if (!pg) return;
      ctx.save(); ctx.globalAlpha *= pg.a; ctx.translate(pg.dx, 0);
      ctx.fillStyle = rgba(col, 0.16); ctx.fillRect(110, 860, 860, 150); ctx.fillStyle = col; ctx.fillRect(110, 860, 10, 150);
      setFont(ctx, 'sg', 64, 700); ctx.fillStyle = P.white; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 160, 955);
      ctx.restore();
    });
    // a ball dropped on every beat: lands exactly on the beat, squashes, rises
    const b = beatBounce(t, G), by = 975 - 90 * b, sq = 1 + 0.35 * Math.max(0, pulse - 0.55) * (b < 0.2 ? 1 : 0);
    ctx.save(); ctx.translate(900, by); ctx.scale(1 / sq, sq); ctx.fillStyle = P.white; ctx.beginPath(); ctx.arc(0, -18, 24, 0, 7); ctx.fill(); ctx.restore();
    ctx.restore();
    // row 3: the strip, legend, raw -> snapped
    setFont(ctx, 'inter', 42, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = P.orange; ctx.fillText('raw cut', 110, 1075); ctx.fillStyle = P.green; ctx.fillText('on the beat', 330, 1075);
    ctx.fillStyle = P.panel2; roundRect(ctx, SX0 - 20, 1095, SX1 - SX0 + 40, 125, 14).fill();
    const head = clamp(t / SPAN, 0, 1);
    for (let i = 0; i < BARS.length; i++) { const x = SX0 + i * 5, f = i / BARS.length, h = 4 + 66 * BARS[i]; ctx.fillStyle = f <= head ? P.cyan : P.dim; ctx.fillRect(x, SY - h, 3, h); }
    beatGrid(G.bpm, G.phase, SPAN).forEach(bt => { const near = Math.abs(t - bt) < 0.08; ctx.fillStyle = near ? P.white : rgba(P.white, 0.4); ctx.fillRect(tx(bt) - 1, 1108, near ? 3 : 2, 100); });
    CUTS.forEach((c, i) => {
      const k = E.outBack(prog(t, 0.7 + 0.25 * i, 1.1 + 0.25 * i), 2), m = E.inOutCubic(prog(t, 1.5 + 0.45 * i, 2.05 + 0.45 * i)), x = lerp(tx(c.raw), tx(c.t), m);
      if (k <= 0) return; ctx.save(); ctx.translate(x, 1108); ctx.scale(clamp(k, 0, 1.3), clamp(k, 0, 1.3)); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = mix2(P.orange, P.green, m); ctx.fillRect(-10, -10, 20, 20); ctx.restore();
    });
    const px = tx(Math.min(t, SPAN)); ctx.strokeStyle = P.white; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, 1100); ctx.lineTo(px, 1216); ctx.stroke();
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER });
}
function mix2(a, b, k) { const h = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), A = h(a), B = h(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; }
export const _detected = () => ({ G, CUTS, DET });
