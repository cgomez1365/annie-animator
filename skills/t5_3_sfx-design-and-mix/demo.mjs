// t5.3 demo: the mix of one Kokoro sentence + seven effects + bed D, drawn from the measured stems. Three lanes (voice, effects, music: the music dips under the voice),
// seven chips that light on the moment their effect plays, and the measured loudness and true peak. The card is silent (engine rule); test.mjs muxes out/demo_mix.wav into out/demo_av.mp4.
import fs from 'node:fs';
import path from 'node:path';
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, glow, E, prog, lerp, clamp } from '../../engine/index.mjs';
import { buildDemoAudio, writeMixData } from './demo_audio.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 234, coverT: 3.6 };
const CLOSER = 4.7, DIR = import.meta.dirname, OUT = path.join(DIR, 'out');
const WIN = { x: 72, y: 640, w: 936, h: 640, title: 'the mix, measured' };
const HOOK = { tIn: 0.12, tOut: 4.4, l1: 'Voice on top.', l2: 'Sound that fits.', c2: P.green, b1: 470, b2: 580, px: 96, glint: [0.7, 1.3] };
const COL = { whoosh: P.white, pop: P.cyan, tick: P.muted, chime: P.cyan, stamp: P.orange, success: P.green, wrong: P.red };
const LANES = [['voice', 750, P.green], ['effects', 826, P.orange], ['music', 902, P.cyan]];
const LX0 = 270, LX1 = 950, TLANE = 5.0, LH = 62;
let D;

export async function init() {
  const f = path.join(OUT, 'mix_data.json');
  if (!fs.existsSync(f)) writeMixData(OUT, buildDemoAudio(OUT));
  D = JSON.parse(fs.readFileSync(f, 'utf8'));
}
const tx = t => lerp(LX0, LX1, t / TLANE), h = db => clamp((db + 55) / 55) * LH;

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t);
  const wi = E.outCubic(prog(t, 0.15, 0.55)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 70 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    const head = Math.min(t, TLANE);
    LANES.forEach(([name, y, col], n) => {
      ctx.fillStyle = P.panel2; roundRect(ctx, LX0 - 10, y - 4, LX1 - LX0 + 20, LH + 8, 10).fill();
      setFont(ctx, 'inter', 42, 600); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(name, 100, y + 46);
      const env = D[n === 0 ? 'voice' : n === 1 ? 'fx' : 'music'];
      for (let k = 0; k < env.length; k++) { const tk = k * D.hop; if (tk > head || tk > TLANE) break; const v = h(env[k]); if (v < 1) continue; ctx.fillStyle = n === 1 ? rgba(col, 0.9) : (n === 2 ? rgba(col, 0.85) : col); ctx.fillRect(tx(tk), y + LH - v, Math.max(2, tx(D.hop) - tx(0) - 0.5), v); }
    });
    // effect markers on the effects lane
    D.cues.forEach(c => { if (t < c.t) return; const k = E.outBack(prog(t, c.t, c.t + 0.3), 2.2); ctx.save(); ctx.translate(tx(c.t), 826 - 14); ctx.scale(k, k); ctx.rotate(Math.PI / 4); ctx.fillStyle = COL[c.name]; ctx.fillRect(-7, -7, 14, 14); ctx.restore(); });
    const px = tx(head); ctx.strokeStyle = P.white; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, 740); ctx.lineTo(px, 972); ctx.stroke();
    // chips: one per effect, lit when it fires, with a ring that expands and fades
    D.cues.forEach((c, n) => {
      const col = n % 4, row = Math.floor(n / 4), cx = 200 + col * 224, cy = 1060 + row * 84, since = t - c.t, lit = since >= 0, k = lit ? E.outBack(prog(t, c.t, c.t + 0.4), 2) : 0;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(lit ? 1 + 0.12 * (1 - clamp(since / 0.5)) * k : 1, lit ? 1 + 0.12 * (1 - clamp(since / 0.5)) * k : 1);
      if (lit) glow(ctx, rgba(COL[c.name], 0.5 * (1 - clamp(since / 0.9))), 26, () => { ctx.fillStyle = rgba(COL[c.name], 0.22); roundRect(ctx, -100, -34, 200, 68, 34).fill(); });
      else { ctx.fillStyle = P.panel; roundRect(ctx, -100, -34, 200, 68, 34).fill(); }
      ctx.strokeStyle = lit ? COL[c.name] : P.dim; ctx.lineWidth = 3; roundRect(ctx, -100, -34, 200, 68, 34).stroke();
      setFont(ctx, 'inter', 42, 650); ctx.fillStyle = lit ? P.white : P.muted; ctx.textAlign = 'center'; ctx.fillText(c.name, 0, 15); ctx.restore();
    });
    // measured numbers
    const nk = E.outCubic(prog(t, 0.6, 1.1)); ctx.save(); ctx.globalAlpha *= nk; setFont(ctx, 'sg', 54, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = P.white; ctx.fillText(D.lufs.toFixed(1) + ' LUFS', 110, 1232); ctx.fillStyle = P.green; ctx.textAlign = 'right'; ctx.fillText('peak ' + D.truePeak.toFixed(1) + ' dBTP', 920, 1232); ctx.restore();
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER });
}
