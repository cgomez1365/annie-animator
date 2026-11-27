// t5.1 demo: one real Kokoro sentence drives the picture. Bars pop on "Paris", "high", "almost", "none"; the strip shows the voice,
// the word starts the aligner found (ticks) and the cue moments (green diamonds, 0.12 s before the word). Numbers are made up.
// The card is silent (engine rule). test.mjs muxes the voice at VOICE_AT into out/demo_av.mp4.
import path from 'node:path';
import fs from 'node:fs';
import { P, begin, end, hook, windowFrame, windowInner, clipRect, setFont, rgba, roundRect, E, prog, lerp, clamp } from '../../engine/index.mjs';
import { decodeAudio, envelope, buildTimeline, cue } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 234, coverT: 3.4 };
export const VOICE_AT = 0.35;                 // the clip starts here in card time (test.mjs uses it for the mux)
export const CLIP = 'fixtures/s07.wav';
const CLOSER = 4.7, DIR = import.meta.dirname;
const WIN = { x: 72, y: 640, w: 936, h: 640, title: 'next word, made-up numbers' };
const HOOK = { tIn: 0.12, tOut: 4.4, l1: 'The picture lands', l2: 'on the word.', c2: P.green, b1: 470, b2: 580, px: 96, glint: [0.7, 1.3] };
const BARS = [['Paris', 170, P.green], ['Lyon', 14, P.dim], ['Rome', 11, P.dim], ['Mars', 8, P.dim], ['tree', 6, P.dim]];
const X0 = 150, X1 = 950, BASE = 960, STRIP = { y0: 1110, y1: 1222 };
let TL, WAVE, SP;                              // set once in init(): timeline, loudness envelope, sentence

export async function init() {
  const rows = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/lesson.json'), 'utf8')).rows;
  const r = rows.find(x => x.file === CLIP);
  TL = buildTimeline([{ text: r.text, dur: r.dur, file: r.file }], { pre: VOICE_AT, analyze: true, baseDir: DIR });
  SP = TL.sentences[0];
  const d = decodeAudio(path.join(DIR, CLIP)); WAVE = envelope(d.pcm, d.sr);
}
const cues = () => ({ paris: cue(TL, 0, 'Paris'), high: cue(TL, 0, 'high'), most: cue(TL, 0, 'Most'), almost: cue(TL, 0, 'almost'), none: cue(TL, 0, 'none') });
const tx = t => lerp(X0, X1, (t - VOICE_AT) / SP.dur);

export function frame(t) {
  const { ctx } = begin(t, { closerAt: CLOSER });
  const C = cues();
  hook(ctx, HOOK, t);
  const wi = E.outCubic(prog(t, 0.15, 0.55)), wo = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);
  if (wi > 0 && wo > 0.001) {
    ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 70 * (1 - wi));
    windowFrame(ctx, WIN);
    ctx.save(); clipRect(ctx, ...windowInner(WIN));
    // bars: Paris pops on its word, the others on "almost", staggered 0.09 s; each bobs a little so nothing sits still
    const slot = (X1 - X0) / BARS.length;
    BARS.forEach(([name, h, col], n) => {
      const t0 = n === 0 ? C.paris : C.almost + 0.09 * (n - 1);
      const k = E.outBack(prog(t, t0, t0 + 0.55), 1.6); if (k <= 0) return;
      const bw = 110, cx = X0 + slot * n + slot / 2, bob = 3 * Math.sin(t * 3.1 + n * 1.7) * (n === 0 ? 1 : 0.5), hh = Math.max(2, h * k);
      ctx.fillStyle = rgba(col, n === 0 ? 0.30 : 0.35); roundRect(ctx, cx - bw / 2, BASE - hh + bob, bw, hh, 12).fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3; roundRect(ctx, cx - bw / 2, BASE - hh + bob, bw, hh, 12).stroke();
      setFont(ctx, 'inter', 42, 600); ctx.fillStyle = n === 0 ? P.white : P.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.save(); ctx.globalAlpha *= clamp(k); ctx.fillText(name, cx, BASE + 52); ctx.restore();
    });
    // value tags land on their words
    const tag = (txt, t0, x, y, col) => { const k = E.outBack(prog(t, t0, t0 + 0.4), 2); if (k <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(k, k); setFont(ctx, 'sg', 54, 700); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(txt, 0, 0); ctx.restore(); };
    tag('very high', C.high, X0 + slot / 2, BASE - 170 - 26 + 3 * Math.sin(t * 3.1), P.green);
    tag('almost none', C.none, X0 + slot * 3, BASE - 70, P.orange);
    // the voice strip
    ctx.fillStyle = P.panel2; roundRect(ctx, X0 - 20, STRIP.y0 - 6, X1 - X0 + 40, STRIP.y1 - STRIP.y0 + 18, 14).fill();
    const head = clamp((t - VOICE_AT) / SP.dur, 0, 1), midY = (STRIP.y0 + 20 + STRIP.y1) / 2 + 6;
    for (let x = X0; x < X1; x += 6) {
      const f = (x - X0) / (X1 - X0), e = WAVE.db[Math.min(WAVE.db.length - 1, Math.round(f * SP.dur / WAVE.hop))], h = clamp((e + 42) / 42) * 62 + 2;
      ctx.fillStyle = f <= head ? P.cyan : P.dim; ctx.fillRect(x, midY - h / 2, 3, h);
    }
    SP.words.forEach(w => { ctx.fillStyle = rgba(P.white, 0.45); ctx.fillRect(tx(w.s) - 1, STRIP.y1 - 4, 2, 14); });   // where the aligner thinks each word starts
    [['Paris', C.paris], ['high', C.high], ['almost', C.almost]].forEach(([lab, c], n) => {                           // cue moments
      const x = tx(c), k = E.outBack(prog(t, 0.5 + 0.1 * n, 0.9 + 0.1 * n), 2); ctx.save(); ctx.globalAlpha *= clamp(k);
      ctx.translate(x, STRIP.y0 + 4); ctx.rotate(Math.PI / 4); ctx.fillStyle = P.green; ctx.fillRect(-7, -7, 14, 14); ctx.restore();
      ctx.save(); ctx.globalAlpha *= clamp(k); setFont(ctx, 'inter', 42, 600); ctx.fillStyle = P.green; ctx.textAlign = 'center'; ctx.fillText(lab, Math.min(x + (n === 2 ? 30 : 0), X1 - 60), STRIP.y0 - 18); ctx.restore();
    });
    const px = lerp(X0, X1, head); ctx.strokeStyle = P.white; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, STRIP.y0 + 14); ctx.lineTo(px, STRIP.y1 + 6); ctx.stroke();
    ctx.fillStyle = P.white; ctx.beginPath(); ctx.arc(px, STRIP.y0 + 14, 7, 0, 7); ctx.fill();
    ctx.restore(); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER });
}
