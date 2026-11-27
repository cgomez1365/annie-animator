// t5.4 demo: one real Kokoro sentence pair, captions burned in at y 1470 (52 px, pill, spoken white / now green wipe / next grey), and the .srt cues built from the same
// timings shown in a window and lit as each caption plays. The card is silent (engine rule); test.mjs muxes the voice at VOICE_AT into out/demo_av.mp4.
import fs from 'node:fs';
import path from 'node:path';
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, createCanvas, E, prog, clamp } from '../../engine/index.mjs';
import { buildTimeline } from '../t5_1_voice-synced-scenes/module.mjs';
import { makeCaptions, layoutAll, drawCaptions, captionState, srtTime, toSrt } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 234, coverT: 3.6 };
export const VOICE_AT = 0.35, CLIP = 'fixtures/s07.wav';
const CLOSER = 4.7, DIR = import.meta.dirname;
const WIN = { x: 72, y: 640, w: 936, h: 520, title: 'captions.srt' };
const HOOK = { tIn: 0.12, tOut: 4.4, l1: 'Read along.', l2: 'Word by word.', c2: P.green, b1: 470, b2: 580, px: 96, glint: [0.7, 1.3] };
let CAPS, LAY, TL;

export async function init() {
  const row = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/lesson.json'), 'utf8')).rows.find(r => r.file === CLIP);
  TL = buildTimeline([row], { pre: VOICE_AT, analyze: true, baseDir: DIR });
  CAPS = makeCaptions(TL.sentences[0].words); LAY = layoutAll(createCanvas(64, 64).getContext('2d'), CAPS);
}
export const _info = () => ({ CAPS, LAY, TL, srt: toSrt(CAPS) });

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  hook(ctx, HOOK, t);
  const wi = E.outCubic(prog(t, 0.15, 0.55)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3), st = captionState(CAPS, t);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 70 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    CAPS.forEach((c, k) => {
      const y = 740 + k * 150, on = st && st.k === k, kin = E.outBack(prog(t, 0.55 + 0.12 * k, 0.95 + 0.12 * k), 1.8); if (kin <= 0) return;
      ctx.save(); ctx.globalAlpha *= clamp(kin); ctx.translate(0, 14 * (1 - clamp(kin)));
      ctx.fillStyle = on ? rgba(P.green, 0.14) : P.panel2; roundRect(ctx, 110, y, 860, 128, 16).fill(); ctx.strokeStyle = on ? P.green : 'rgba(255,255,255,0.12)'; ctx.lineWidth = on ? 3 : 2; roundRect(ctx, 110, y, 860, 128, 16).stroke();
      setFont(ctx, 'mono', 42, 500); ctx.fillStyle = on ? P.green : P.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(`${k + 1}  ${srtTime(c.start)} --> ${srtTime(c.end)}`, 130, y + 52);
      setFont(ctx, 'inter', 42, 600); ctx.fillStyle = on ? P.white : P.text; ctx.fillText(c.text, 130, y + 104); ctx.restore();
    });
    // legend: the three word states, each chip breathes a little
    [['spoken', P.white], ['now', P.green], ['next', P.muted]].forEach(([lab, col], n) => {
      const k = E.outBack(prog(t, 0.9 + 0.1 * n, 1.3 + 0.1 * n), 2), br = 1 + 0.025 * Math.sin(t * 3.2 + n); if (k <= 0) return;
      ctx.save(); ctx.translate(250 + n * 290, 1090); ctx.scale(clamp(k, 0, 1.2) * br, clamp(k, 0, 1.2) * br);
      ctx.fillStyle = P.panel; roundRect(ctx, -110, -34, 220, 68, 34).fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; roundRect(ctx, -110, -34, 220, 68, 34).stroke();
      setFont(ctx, 'inter', 46, 650); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(lab, 0, 16); ctx.restore();
    });
    ctx.restore(); ctx.restore();
  }
  drawCaptions(ctx, t, CAPS, { layouts: LAY });
  return end(ctx, t, { closerAt: CLOSER });
}
