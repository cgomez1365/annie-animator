// t5.3 sfx-design-and-mix: the seven soft effects (synthesized, deterministic), the ffmpeg mix (voice -16 LUFS, effects, bed, ducking),
// and the measurements that prove it (loudness, true peak, envelopes, ducking depth). Node built-ins + ffmpeg (ANNIE_FFMPEG) + the engine canvas for plots.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '../../engine/canvas.mjs';

export const SR = 48000;
const FF = () => process.env.ANNIE_FFMPEG || '/Users/cris/Desktop/AEON-wt-deps/node_modules/ffmpeg-static/ffmpeg';
const run = (args, o = {}) => spawnSync(FF(), args, { maxBuffer: 1 << 29, ...o });

/** Default ducking (sidechain compressor on the bed, keyed by the voice): about 5-6 dB of bed reduction while she speaks, full recovery within half a second. Measured in test.mjs. */
export const DUCK = { threshold: 0.06, ratio: 2, attack: 15, release: 450 };
/** The loudness gates of the lesson pipeline (ai-training-video/scripts/qc.sh): integrated -18..-14 LUFS (target -16), true peak at or below -1 dBTP. */
export const GATES = { lufsMin: -18, lufsMax: -14, target: -16, truePeak: -1 };

// ---------------------------------------------------------------- the seven effects
/** The effects and what each is for. dur = seconds, gain = default level inside a mix (x the 0.32 sfx bus), at = where it sits against its cue. */
export const SFX = {
  whoosh:  { dur: 0.8,  gain: 0.5, use: 'scene change; starts 0.05 s BEFORE the new scene', at: -0.05, hz: 'noise sweep 250 to 3450 Hz and back' },
  pop:     { dur: 0.16, gain: 1.0, use: 'a chip, bubble or item appears', at: 0, hz: '420 Hz rising to 940 Hz in 40 ms' },
  tick:    { dur: 0.08, gain: 1.0, use: 'a list row or check lands (tiny, can repeat 4x per second)', at: 0, hz: '2100 Hz, 11 ms decay' },
  chime:   { dur: 1.6,  gain: 0.7, use: 'a highlight or the end card; lets the music breathe', at: 0, hz: '880 + 1318.5 + 1760 Hz, 0.3 s decay' },
  stamp:   { dur: 0.5,  gain: 0.9, use: 'a stamp slams in (outElastic); lands ON the word', at: 0, hz: '68 Hz thump + 11 ms noise burst' },
  success: { dur: 1.2,  gain: 0.8, use: 'a correct answer or a check: C5 then G5 0.13 s later', at: 0, hz: '523.25 then 783.99 Hz' },
  wrong:   { dur: 0.5,  gain: 0.8, use: 'a wrong answer or a cross: soft, never a buzzer', at: 0, hz: '196 + 207 Hz (beating at 11 Hz)' },
};
const mkNoise = () => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; }; };
const gen = (sec, fn) => { const n = Math.floor(sec * SR), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn(i / SR, i); return a; };
const RECIPE = {
  whoosh: () => { const noise = mkNoise(); let y = 0; return gen(0.8, t => { const p = t / 0.8, env = Math.sin(Math.PI * p) ** 2, fc = 250 + 3200 * Math.sin(Math.PI * p) ** 1.5, k = 1 - Math.exp(-2 * Math.PI * fc / SR); y += k * (noise() - y); return y * env * 2.2; }); },
  tick: () => gen(0.08, t => Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t * 90) * 0.9),
  pop: () => gen(0.16, t => { const f = 420 + 520 * (1 - Math.exp(-t * 40)); return Math.sin(2 * Math.PI * f * t) * Math.min(1, t * 400) * Math.exp(-t * 22) * 0.9; }),
  chime: () => gen(1.6, t => (Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 3.2) + 0.55 * Math.sin(2 * Math.PI * 1318.5 * t) * Math.exp(-t * 4.5) + 0.3 * Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-t * 7)) * Math.min(1, t * 600) * 0.6),
  stamp: () => { const noise = mkNoise(); let y = 0; return gen(0.5, t => { const k = 1 - Math.exp(-2 * Math.PI * 600 / SR); y += k * (noise() - y); return Math.sin(2 * Math.PI * 68 * t) * Math.exp(-t * 14) + y * Math.exp(-t * 90) * 0.8; }); },
  success: () => gen(1.2, t => { const a = Math.sin(2 * Math.PI * 523.25 * t) * Math.exp(-t * 5), t2 = t - 0.13, b = t2 > 0 ? Math.sin(2 * Math.PI * 783.99 * t2) * Math.exp(-t2 * 4) : 0; return (a + b) * Math.min(1, t * 600) * 0.55; }),
  wrong: () => gen(0.5, t => (Math.sin(2 * Math.PI * 196 * t) + Math.sin(2 * Math.PI * 207 * t)) * Math.exp(-t * 7) * Math.min(1, t * 500) * 0.45),
};
/**
 * Synthesize one effect: mono 48 kHz, peak normalized to -3 dBFS, 2 ms fade-in and 5 ms fade-out so it can never click. Identical on every call.
 * @param {keyof typeof SFX} name @returns {Float32Array}
 */
export function synthSfx(name) {
  if (!RECIPE[name]) throw new Error('unknown effect ' + name + ' (have ' + Object.keys(RECIPE).join(', ') + ')');
  const a = RECIPE[name](), fi = Math.round(0.002 * SR), fo = Math.round(0.005 * SR);
  for (let i = 0; i < a.length; i++) { let e = 1; if (i < fi) e = i / fi; if (a.length - 1 - i < fo) e = Math.min(e, (a.length - 1 - i) / fo); a[i] *= e; }   // fades first, so the -3 dBFS peak is the peak that is heard
  let m = 1e-9; for (const v of a) m = Math.max(m, Math.abs(v)); const g = Math.pow(10, -3 / 20) / m; for (let i = 0; i < a.length; i++) a[i] *= g;
  return a;
}
/** Write mono or stereo float samples as a 16-bit WAV. @param {string} file @param {Float32Array} L @param {Float32Array} [R] @param {number} [sr] */
export function writeWav(file, L, R, sr = SR) {
  const n = L.length, ch = R ? 2 : 1, buf = Buffer.alloc(44 + n * 2 * ch);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2 * ch, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2 * ch, 28); buf.writeUInt16LE(2 * ch, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2 * ch, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 2 * ch); if (R) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}
/** Write all seven effects as `<dir>/<name>.wav` (mono 48 kHz). @param {string} dir @returns {Record<string,string>} name -> file */
export function writeSfxLibrary(dir) { fs.mkdirSync(dir, { recursive: true }); const o = {}; for (const n of Object.keys(SFX)) { o[n] = path.join(dir, n + '.wav'); writeWav(o[n], synthSfx(n)); } return o; }

// ---------------------------------------------------------------- analysis helpers
/** Decode any audio file to mono floats. @param {string} file @param {number} [sr=48000] @returns {{pcm:Float32Array, sr:number, dur:number}} */
export function decodeAudio(file, sr = SR) {
  const r = run(['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(sr), 'pipe:1']); if (r.status !== 0) throw new Error('decode failed ' + file + ': ' + r.stderr);
  const b = r.stdout, pcm = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4))); return { pcm, sr, dur: pcm.length / sr };
}
/** RMS level in dBFS per `hop` seconds (window = hop). @param {Float32Array} pcm @param {number} sr @param {number} [hop=0.02] @returns {Float32Array} */
export function rmsDb(pcm, sr, hop = 0.02) {
  const H = Math.round(hop * sr), n = Math.floor(pcm.length / H), out = new Float32Array(n);
  for (let k = 0; k < n; k++) { let s = 0; for (let i = k * H; i < (k + 1) * H; i++) s += pcm[i] * pcm[i]; out[k] = 10 * Math.log10(Math.max(s / H, 1e-12)); }
  return out;
}
/** Mean power level (dBFS) of a time window. @param {Float32Array} pcm @param {number} sr @param {number} t0 @param {number} t1 */
export function windowDb(pcm, sr, t0, t1) { const a = Math.max(0, Math.round(t0 * sr)), b = Math.min(pcm.length, Math.round(t1 * sr)); let s = 0; for (let i = a; i < b; i++) s += pcm[i] * pcm[i]; return 10 * Math.log10(Math.max(s / Math.max(1, b - a), 1e-12)); }
/** Sample peak in dBFS. @param {Float32Array} pcm */
export function peakDb(pcm) { let m = 1e-9; for (const v of pcm) m = Math.max(m, Math.abs(v)); return 20 * Math.log10(m); }
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
}
/** Magnitude spectrum of a window (Hann, 16384 points zero-padded): {hz[], mag[]}. @param {Float32Array} pcm @param {number} sr @param {number} t0 @param {number} t1 */
export function spectrum(pcm, sr, t0, t1) {
  const N = 16384, re = new Float64Array(N), im = new Float64Array(N), a = Math.round(t0 * sr), n = Math.min(N, Math.round((t1 - t0) * sr), pcm.length - a);
  for (let i = 0; i < n; i++) re[i] = pcm[a + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  fft(re, im); const mag = new Float64Array(N / 2), hz = new Float64Array(N / 2); for (let k = 0; k < N / 2; k++) { mag[k] = Math.hypot(re[k], im[k]); hz[k] = k * sr / N; } return { hz, mag };
}
/** The loudest frequency in a window, Hz. @param {Float32Array} pcm @param {number} sr @param {number} t0 @param {number} t1 @param {[number,number]} [band] limit the search (Hz) */
export function dominantHz(pcm, sr, t0, t1, band = [20, 20000]) { const { hz, mag } = spectrum(pcm, sr, t0, t1); let best = 0, bh = 0; for (let k = 1; k < hz.length; k++) if (hz[k] >= band[0] && hz[k] <= band[1] && mag[k] > best) { best = mag[k]; bh = hz[k]; } return bh; }
/** Spectral centroid (Hz) of a window: where the "weight" of the sound sits. */
export function centroidHz(pcm, sr, t0, t1) { const { hz, mag } = spectrum(pcm, sr, t0, t1); let s = 0, w = 0; for (let k = 1; k < hz.length; k++) { s += hz[k] * mag[k]; w += mag[k]; } return w ? s / w : 0; }
/**
 * First time the envelope reaches `frac` of its own peak, searching from `from` seconds. Used to prove an effect really starts where the mix says.
 * @param {Float32Array} pcm @param {number} sr @param {number} from @param {number} [frac=0.1] @param {number} [win=0.5] seconds searched @returns {number} seconds or -1
 */
export function onsetTime(pcm, sr, from, frac = 0.1, win = 0.5) {
  const a = Math.round(from * sr), b = Math.min(pcm.length, a + Math.round(win * sr)); let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(pcm[i]));
  for (let i = a; i < b; i++) if (Math.abs(pcm[i]) >= frac * m) return i / sr; return -1;
}

/**
 * Loudness of a file with ffmpeg ebur128: integrated LUFS, loudness range, true peak dBTP, plus quiet stretches of 2.5 s or more (qc.sh's check).
 * @param {string} file @returns {{lufs:number, lra:number, truePeak:number, silences:number}}
 */
export function measureLoudness(file) {
  const r = run(['-hide_banner', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }), t = r.stderr, sum = t.slice(t.lastIndexOf('Summary:'));
  const pick = re => { const m = re.exec(sum); return m ? parseFloat(m[1]) : NaN; };
  const s = run(['-hide_banner', '-i', file, '-vn', '-af', 'silencedetect=n=-50dB:d=2.5', '-f', 'null', '-'], { encoding: 'utf8' });
  return { lufs: pick(/I:\s+(-?[\d.]+) LUFS/), lra: pick(/LRA:\s+(-?[\d.]+) LU/), truePeak: pick(/Peak:\s+(-?[\d.]+) dBFS/), silences: (s.stderr.match(/silence_start/g) || []).length };
}
/** The gates as a verdict. @param {{lufs:number,truePeak:number}} m @returns {{pass:boolean, failures:string[]}} */
export function checkGates(m) {
  const f = []; if (!(m.lufs >= GATES.lufsMin && m.lufs <= GATES.lufsMax)) f.push(`loudness ${m.lufs} LUFS outside ${GATES.lufsMin}..${GATES.lufsMax}`); if (!(m.truePeak <= GATES.truePeak)) f.push(`true peak ${m.truePeak} dBTP above ${GATES.truePeak}`); return { pass: !f.length, failures: f };
}

// ---------------------------------------------------------------- the mix
/**
 * Mix a voice, effects and a music bed into 48 kHz stereo WAVs.
 * Voice: each clip placed at its time, joined, loudnorm to -16 LUFS. Effects: at `sfxBus` (0.32) x the effect's gain. Bed: `music.gain` (0.10), fades 2 s in and 3 s out,
 * optionally ducked under the voice (`duck: {}` = DUCK defaults). Sum, scaled so the whole mix reads `target` LUFS, then a limiter at -1.4 dBFS.
 * Writes `<out>.wav` and stems `<out>_voice.wav`, `_fx.wav`, `_music.wav` (before the final scaling).
 * @param {{total:number, voice?:{file:string, at:number}[], sfx?:{name?:string, file?:string, t:number, gain?:number}[], music?:{file:string, gain?:number, start?:number, duck?:false|{threshold?:number, ratio?:number, attack?:number, release?:number}},
 *          sfxBus?:number, target?:number, sfxDir?:string}} spec
 * @param {string} out path without extension
 * @returns {{mix:string, stems:{voice:string, fx:string, music:string}, loudness:{lufs:number,lra:number,truePeak:number,silences:number}, gainDb:number, graph:string}}
 */
export function mixAudio(spec, out) {
  const { total, voice = [], sfx = [], music = null, sfxBus = 0.32, target = GATES.target } = spec, dir = path.dirname(out); fs.mkdirSync(dir, { recursive: true });
  const lib = writeSfxLibrary(spec.sfxDir || path.join(dir, '_sfx')), inputs = [], g = [], add = f => { inputs.push('-i', f); return inputs.length / 2 - 1; };
  const vi = voice.map(v => add(v.file)); voice.forEach((v, k) => g.push(`[${vi[k]}:a]aresample=${SR},aformat=channel_layouts=mono,adelay=${Math.round(v.at * 1000)}:all=1[v${k}]`));
  if (voice.length) g.push(voice.map((_, k) => `[v${k}]`).join('') + `amix=inputs=${voice.length}:normalize=0:duration=longest,loudnorm=I=${GATES.target}:TP=-1.5:LRA=11,aresample=${SR},aformat=channel_layouts=stereo,apad=whole_dur=${total}[voice]`);
  else g.push(`anullsrc=r=${SR}:cl=stereo,atrim=0:${total}[voice]`);
  if (sfx.length) {
    const si = sfx.map(x => add(x.file || lib[x.name])); sfx.forEach((x, k) => { const ms = Math.round(x.t * 1000), gn = sfxBus * (x.gain ?? SFX[x.name]?.gain ?? 1); g.push(`[${si[k]}:a]aresample=${SR},aformat=channel_layouts=stereo,volume=${gn.toFixed(4)},adelay=${ms}|${ms}[x${k}]`); });
    g.push(sfx.map((_, k) => `[x${k}]`).join('') + `amix=inputs=${sfx.length}:normalize=0:duration=longest,apad=whole_dur=${total}[fx]`);
  } else g.push(`anullsrc=r=${SR}:cl=stereo,atrim=0:${total}[fx]`);
  const duck = music && music.duck ? { ...DUCK, ...music.duck } : null;
  g.push(duck ? `[voice]asplit=3[vB][vC][vA]` : `[voice]asplit=2[vB][vC]`);
  if (music) {
    const mi = add(music.file), s0 = music.start || 0, gain = music.gain ?? 0.1;
    g.push(`[${mi}:a]aresample=${SR},aformat=channel_layouts=stereo,atrim=start=${s0}:end=${s0 + total},asetpts=PTS-STARTPTS,volume=${gain},afade=t=in:d=2,afade=t=out:st=${Math.max(0, total - 3)}:d=3,apad=whole_dur=${total}[mus0]`);
    g.push(duck ? `[mus0][vA]sidechaincompress=threshold=${duck.threshold}:ratio=${duck.ratio}:attack=${duck.attack}:release=${duck.release}:makeup=1[mus]` : `[mus0]anull[mus]`);
  } else g.push(`anullsrc=r=${SR}:cl=stereo,atrim=0:${total}[mus]`);
  g.push(`[fx]asplit=2[fxB][fxC]`, `[mus]asplit=2[musB][musC]`);
  g.push(`[vB][fxB][musB]amix=inputs=3:normalize=0:duration=longest,atrim=0:${total},asetpts=PTS-STARTPTS[sum]`);
  const graph = g.join(';\n'), gfile = out + '_graph.txt'; fs.writeFileSync(gfile, graph);
  const stems = { voice: out + '_voice.wav', fx: out + '_fx.wav', music: out + '_music.wav' }, raw = out + '_sum.wav';
  const r = run(['-v', 'error', '-y', ...inputs, '-filter_complex_script', gfile, '-map', '[vC]', '-t', String(total), stems.voice, '-map', '[fxC]', '-t', String(total), stems.fx, '-map', '[musC]', '-t', String(total), stems.music, '-map', '[sum]', '-t', String(total), '-ar', String(SR), raw], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('mix failed: ' + r.stderr);
  // scale so the whole mix reads the target, then limit; measure and repeat once if it missed
  let gainDb = 0, loud = measureLoudness(raw), cur = raw;
  for (let pass = 0; pass < 2; pass++) {
    gainDb += target - loud.lufs; const next = out + '.wav';
    const f = run(['-v', 'error', '-y', '-i', raw, '-af', `volume=${gainDb.toFixed(3)}dB,alimiter=limit=0.85:level=0:attack=2:release=60,apad=whole_dur=${total}`, '-t', String(total), '-ar', String(SR), next], { encoding: 'utf8' }); if (f.status !== 0) throw new Error('scale failed: ' + f.stderr);
    loud = measureLoudness(next); cur = next; if (Math.abs(loud.lufs - target) < 0.25) break;
  }
  fs.rmSync(raw, { force: true });
  return { mix: cur, stems, loudness: loud, gainDb, graph };
}
/**
 * Put audio on a silent video (AAC 192k). @param {string} video @param {string} audio @param {string} out
 */
export function muxAudio(video, audio, out) { const r = run(['-v', 'error', '-y', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('mux failed: ' + r.stderr); }

/**
 * Cue list to sfx list: an effect fires `at` seconds from its cue (whoosh -0.05, the rest 0). Pass cue times from t5.1.
 * @param {{t:number, name:string, gain?:number}[]} cues @returns {{name:string,t:number,gain?:number}[]}
 */
export function sfxFromCues(cues) { return cues.map(c => ({ name: c.name, t: Math.max(0, c.t + (SFX[c.name]?.at || 0)), gain: c.gain })); }
/**
 * Rule check for an effect list: no two of the same kind closer than 0.12 s, never more than 3 starting within 0.15 s, nothing outside 0..total.
 * @param {{name:string,t:number}[]} list @param {number} total @returns {string[]} problems (empty = fine)
 */
export function lintSfx(list, total) {
  const p = [], s = list.slice().sort((a, b) => a.t - b.t);
  s.forEach((x, i) => { if (x.t < 0 || x.t > total) p.push(`${x.name} at ${x.t} is outside 0..${total}`); if (!SFX[x.name]) p.push(`unknown effect ${x.name}`);
    for (let j = i + 1; j < s.length && s[j].t - x.t < 0.15; j++) { if (s[j].name === x.name && s[j].t - x.t < 0.12) p.push(`two ${x.name} within 0.12 s at ${x.t.toFixed(2)}`); }
    if (s.filter(y => y.t >= x.t && y.t < x.t + 0.15).length > 3) p.push(`more than 3 effects within 0.15 s at ${x.t.toFixed(2)}`); });
  return [...new Set(p)];
}

// ---------------------------------------------------------------- envelope plots (audio cannot be seen: look at these)
/**
 * Draw lanes of dB envelopes to a PNG: one lane per stem, a time axis, optional marks (vertical lines with labels).
 * @param {{name:string, db:Float32Array, hop:number, color?:string}[]} lanes @param {string} outPng
 * @param {{marks?:{t:number,label?:string}[], width?:number, laneH?:number, floor?:number, title?:string}} [o]
 */
export function plotEnvelopes(lanes, outPng, { marks = [], width = 1400, laneH = 120, floor = -60, title = '' } = {}) {
  const padL = 140, padT = title ? 50 : 20, H = padT + lanes.length * (laneH + 16) + 40, cv = createCanvas(width, H), ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, width, H); if (title) { ctx.fillStyle = '#f8fafc'; ctx.font = '600 24px Inter, sans-serif'; ctx.fillText(title, 20, 34); }
  const T = Math.max(...lanes.map(l => l.db.length * l.hop)), x = t => padL + (width - padL - 20) * t / T;
  lanes.forEach((l, i) => {
    const y0 = padT + i * (laneH + 16); ctx.fillStyle = '#11161d'; ctx.fillRect(padL, y0, width - padL - 20, laneH); ctx.fillStyle = l.color || '#22d3ee'; ctx.font = '600 20px Inter, sans-serif'; ctx.fillText(l.name, 14, y0 + laneH / 2 + 7);
    ctx.fillStyle = '#475569'; ctx.font = '14px Inter, sans-serif'; ctx.fillText('0 dB', padL + 4, y0 + 14); ctx.fillText(floor + ' dB', padL + 4, y0 + laneH - 4);
    ctx.fillStyle = l.color || '#22d3ee'; for (let k = 0; k < l.db.length; k++) { const v = Math.min(1, Math.max(0, (l.db[k] - floor) / -floor)); ctx.fillRect(x(k * l.hop), y0 + laneH - v * laneH, Math.max(1, (width - padL - 20) * l.hop / T), v * laneH); }
  });
  ctx.strokeStyle = 'rgba(248,250,252,0.45)'; ctx.lineWidth = 1; ctx.fillStyle = '#f8fafc'; ctx.font = '15px Inter, sans-serif';
  marks.forEach(m => { ctx.beginPath(); ctx.moveTo(x(m.t), padT); ctx.lineTo(x(m.t), H - 34); ctx.stroke(); if (m.label) { ctx.save(); ctx.translate(x(m.t) + 4, H - 38); ctx.rotate(-0.6); ctx.fillText(m.label, 0, 0); ctx.restore(); } });
  ctx.fillStyle = '#94a3b8'; ctx.font = '14px Inter, sans-serif'; for (let s = 0; s <= T; s += 1) ctx.fillText(s + 's', x(s) - 8, H - 8);
  fs.writeFileSync(outPng, cv.toBuffer('image/png'));
}
