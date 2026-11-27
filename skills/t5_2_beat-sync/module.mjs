// t5.2 beat-sync: find the beat in a track (onsets, tempo, phase), snap cuts and hits to it, and drive motion from the tempo.
// No dependencies but node built-ins; audio is decoded with ffmpeg (ANNIE_FFMPEG). All times are seconds.
import { spawnSync } from 'node:child_process';

const FF = () => process.env.ANNIE_FFMPEG || '/Users/cris/Desktop/AEON-wt-deps/node_modules/ffmpeg-static/ffmpeg';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** The three music beds the CEO kept (ai-training-video/scripts/music.mjs). Each starts on beat 1 at t = 0 of the bed file, so a video that uses the bed from its start has phase 0. */
export const BEDS = {
  A_bright_pluck: { bpm: 108, beatsPerBar: 4, feel: 'straight, kick on every beat, claps on 2 and 4' },
  D_swing_shuffle: { bpm: 100, beatsPerBar: 4, feel: 'swung: eighth notes in triplet feel, kick on 1 and 3, clap on 2 and 4' },
  E_bossa_nova: { bpm: 118, beatsPerBar: 4, feel: 'syncopated clave on the rim, kick on 1 and 3' },
};

/**
 * Decode any audio file to mono float samples with ffmpeg.
 * @param {string} file @param {number} [sr=22050] @returns {{pcm:Float32Array, sr:number, dur:number}}
 */
export function decodeAudio(file, sr = 22050) {
  const r = spawnSync(FF(), ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(sr), 'pipe:1'], { maxBuffer: 1 << 29 });
  if (r.status !== 0) throw new Error('ffmpeg decode failed for ' + file + ': ' + r.stderr);
  const b = r.stdout, pcm = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4)));
  return { pcm, sr, dur: pcm.length / sr };
}

// ---- FFT (radix-2, in place) ----
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) {
      const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
    } }
  }
}

/**
 * Onset strength: log-compressed spectral flux (how much new energy appears each step), local mean removed, scaled so the biggest value is 1.
 * Value k is stamped at time k / fps + 0.0116 s ... see ONSET_DELAY: the stamp is the CENTRE of the analysis window minus a calibrated delay so it lands on the hit.
 * @param {Float32Array} pcm @param {number} sr @param {{hop?:number, win?:number}} [o] hop 256 samples (11.6 ms at 22.05 kHz), window 1024
 * @returns {{env:Float32Array, low:Float32Array, fps:number, hop:number}} env = all bands, low = under 250 Hz (kick and bass: tells the beat from the off-beat)
 */
export function onsetEnvelope(pcm, sr, { hop = 256, win = 1024 } = {}) {
  const n = Math.max(0, Math.floor((pcm.length - win) / hop)), flux = new Float32Array(n), fluxLow = new Float32Array(n), re = new Float64Array(win), im = new Float64Array(win), han = new Float64Array(win), prev = new Float64Array(win / 2);
  for (let i = 0; i < win; i++) han[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / win);
  const kmax = Math.floor(win / 2 * Math.min(1, 9000 / (sr / 2))), klow = Math.max(2, Math.round(250 / (sr / win)));   // low band = under 250 Hz (kick and bass)
  for (let f = 0; f < n; f++) {
    for (let i = 0; i < win; i++) { re[i] = pcm[f * hop + i] * han[i]; im[i] = 0; }
    fft(re, im); let s = 0, sl = 0;
    for (let k = 1; k < kmax; k++) { const m = Math.log1p(60 * Math.hypot(re[k], im[k]) / win * 8), d = Math.max(0, m - prev[k]); s += d; if (k <= klow) sl += d; prev[k] = m; }
    flux[f] = f === 0 ? 0 : s; fluxLow[f] = f === 0 ? 0 : sl;
  }
  const w = Math.round(0.35 * sr / hop), norm = fl => { const e = new Float32Array(n); let mx = 1e-9;
    for (let f = 0; f < n; f++) { let sum = 0, c = 0; for (let q = Math.max(0, f - w); q <= Math.min(n - 1, f + w); q++) { sum += fl[q]; c++; } e[f] = Math.max(0, fl[f] - sum / c); mx = Math.max(mx, e[f]); }
    for (let f = 0; f < n; f++) e[f] /= mx; return e; };
  return { env: norm(flux), low: norm(fluxLow), fps: sr / hop, hop };
}
/** Seconds ADDED to a flux frame's time to get the hit time (the analysis window sees a hit about 25 ms before its frame stamp). Calibrated on the synthesized beds, whose kicks sit at exact known times; real recordings with slow attacks can differ by about 10 ms. */
export const ONSET_DELAY = 0.0255;
const frameTime = (f, fps) => f / fps + ONSET_DELAY;

/**
 * Pick onsets (local maxima of the onset envelope above a threshold).
 * @param {{env:Float32Array,fps:number}} oe @param {{thresh?:number, minGap?:number}} [o] thresh 0.12 of max, minGap 0.06 s
 * @returns {{t:number, strength:number}[]}
 */
export function pickOnsets(oe, { thresh = 0.12, minGap = 0.06 } = {}) {
  const { env, fps } = oe, out = [], r = Math.max(1, Math.round(0.04 * fps));
  for (let f = r; f < env.length - r; f++) {
    if (env[f] < thresh) continue; let isMax = true;
    for (let q = f - r; q <= f + r; q++) if (env[q] > env[f] || (env[q] === env[f] && q < f)) { isMax = false; break; }
    if (!isMax) continue;
    const a = env[f - 1], b = env[f], c = env[f + 1], d = (a - 2 * b + c) || -1e-9, off = clamp(0.5 * (a - c) / d, -0.5, 0.5);   // parabolic refinement
    const t = frameTime(f + off, fps); if (out.length && t - out.at(-1).t < minGap) { if (b > out.at(-1).strength) out[out.length - 1] = { t, strength: b }; continue; }
    out.push({ t, strength: b });
  }
  return out;
}

const envAt = (oe, t, key = 'env') => { const e = oe[key], x = (t - ONSET_DELAY) * oe.fps, i = Math.floor(x), fr = x - i; if (i < 0 || i + 1 >= e.length) return 0; return e[i] * (1 - fr) + e[i + 1] * fr; };
const LOW_W = 1.5;   // how much the kick/bass band counts when choosing which grid line is the beat

/**
 * Tempo and beat phase of a track: try every BPM from `min` to `max` in 0.1 steps and every phase in 5 ms steps; the best grid is the one whose beats
 * (and, at half weight, off-beats) sit on the strongest onsets. A soft prior around 110 BPM stops half/double-time answers.
 * @param {{env:Float32Array,fps:number}} oe from onsetEnvelope
 * @param {{min?:number,max?:number}} [o]
 * @returns {{bpm:number, beat:number, phase:number, score:number, confidence:number}} phase = time of the first beat, in [-0.03, beat - 0.03); confidence = best score over the median score
 */
export function estimateTempo(oe, { min = 70, max = 170 } = {}) {
  const dur = oe.env.length / oe.fps; let best = { score: -1 }; const scores = [];
  for (let bpm = min; bpm <= max + 1e-9; bpm += 0.1) {
    const beat = 60 / bpm, prior = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.6) ** 2); let bScore = -1, bPh = 0;
    for (let ph = 0; ph < beat; ph += 0.005) {
      let s = 0, n = 0; for (let t = ph; t < dur - 0.1; t += beat) { s += envAt(oe, t) + 0.5 * envAt(oe, t + beat / 2) + LOW_W * envAt(oe, t, 'low'); n++; }
      s = n ? s / n : 0; if (s > bScore) { bScore = s; bPh = ph; }
    }
    const sc = bScore * (0.7 + 0.3 * prior); scores.push(sc);
    if (sc > best.score) best = { score: sc, bpm, beat, phase: bPh };
  }
  const med = scores.slice().sort((a, b) => a - b)[scores.length >> 1] || 1e-9;
  // octave check: a grid at half the real tempo also scores well (its half-beats hit the other beats). If the double-speed grid lands on onsets nearly as strongly, it is the real beat.
  if (best.bpm * 2 <= max + 1e-9) {
    const hit = (bpm, ph) => { const b = 60 / bpm; let s = 0, n = 0; for (let t = ph; t < dur - 0.1; t += b) { s += envAt(oe, t) + LOW_W * envAt(oe, t, 'low'); n++; } return n ? s / n : 0; };
    let h1 = 0, h2 = 0, p2 = best.phase; for (let ph = 0; ph < best.beat / 2; ph += 0.005) { const v = hit(best.bpm * 2, ph); if (v > h2) { h2 = v; p2 = ph; } }
    h1 = hit(best.bpm, best.phase); if (h2 >= 0.9 * h1) best = { score: best.score, bpm: best.bpm * 2, beat: best.beat / 2, phase: p2 };
  }
  // refine phase to 1 ms around the best grid
  let rb = best.phase, rs = -1; for (let ph = best.phase - 0.01; ph <= best.phase + 0.01; ph += 0.001) { let s = 0; for (let t = ph; t < dur - 0.1; t += best.beat) s += envAt(oe, t) + LOW_W * envAt(oe, t, 'low'); if (s > rs) { rs = s; rb = ph; } }
  let ph = rb; while (ph < -0.03) ph += best.beat; while (ph >= best.beat - 0.03) ph -= best.beat;   // a beat within 30 ms of t = 0 counts as the first beat (phase about 0), not the one after it
  return { bpm: +best.bpm.toFixed(1), beat: best.beat, phase: ph, score: best.score, confidence: best.score / med };
}

/**
 * Beat times of a grid. beat n happens at phase + n * 60/bpm.
 * @param {number} bpm @param {number} phase @param {number} until seconds @param {{from?:number}} [o] @returns {number[]}
 */
export function beatGrid(bpm, phase, until, { from = 0 } = {}) { const b = 60 / bpm, out = []; for (let n = Math.ceil((from - phase) / b - 1e-9); phase + n * b <= until + 1e-9; n++) out.push(phase + n * b); return out; }

/**
 * Nearest grid time to t. `every` keeps only every nth beat (2 = half bars, 4 = bar lines); `offset` picks which beat of the group (0 = beat 1).
 * @param {number} t @param {{bpm:number,phase:number}} g @param {{every?:number, offset?:number}} [o] @returns {number}
 */
export function snapToBeat(t, g, { every = 1, offset = 0 } = {}) { const step = every * 60 / g.bpm, base = g.phase + offset * 60 / g.bpm; return base + Math.round((t - base) / step) * step; }

/**
 * Snap cut times to the beat, but leave a cut alone when the nearest beat is farther than `maxShift` (a cut that must stay on a word beats the grid).
 * Cuts stay in order and at least `minGap` apart.
 * @param {number[]} cuts @param {{bpm:number,phase:number}} g @param {{every?:number, maxShift?:number, minGap?:number}} [o]
 * @returns {{raw:number, t:number, moved:number, snapped:boolean}[]}
 */
export function snapCuts(cuts, g, { every = 1, maxShift = 0.2, minGap = 0.4 } = {}) {
  const out = []; let last = -Infinity;
  for (const raw of cuts) {
    let t = snapToBeat(raw, g, { every }), snapped = Math.abs(t - raw) <= maxShift; if (!snapped) t = raw;
    if (t < last + minGap) { t = snapped ? t + every * 60 / g.bpm : last + minGap; }
    out.push({ raw, t, moved: t - raw, snapped }); last = t;
  }
  return out;
}

/** Position inside the beat: 0 at the beat, rising to just under 1 before the next. @param {number} t @param {{bpm:number,phase:number}} g */
export function beatPhase(t, g) { const b = 60 / g.bpm, x = ((t - g.phase) / b) % 1; return x < 0 ? x + 1 : x; }
/** Beat number (0-based, can be negative before the first beat). @param {number} t @param {{bpm:number,phase:number}} g */
export function beatIndex(t, g) { return Math.floor((t - g.phase) / (60 / g.bpm) + 1e-9); }

/**
 * Pulse that hits 1 ON the beat and falls away: attack `attack` s before the beat (smooth rise), then exponential decay with time constant `decay` beats.
 * Use for scale (1 + 0.12 * p), glow, brightness. Same value every time it is called with the same t.
 * @param {number} t @param {{bpm:number,phase:number}} g @param {{attack?:number, decay?:number}} [o] attack 0.06 s, decay 0.35 beats
 * @returns {number} 0..1
 */
export function beatPulse(t, g, { attack = 0.06, decay = 0.35 } = {}) {
  const b = 60 / g.bpm, since = ((t - g.phase) % b + b) % b, until = b - since;
  if (until < attack) { const x = 1 - until / attack; return x * x * (3 - 2 * x); }   // rising into the next beat
  return Math.exp(-since / (decay * b));
}
/** Bounce: 0 on the beat, rises to 1 half a beat later and returns (a ball dropped on every beat). `power` > 1 makes it hang at the top. @param {number} t @param {{bpm:number,phase:number}} g @param {number} [power=1.6] */
export function beatBounce(t, g, power = 1.6) { const x = beatPhase(t, g); return Math.pow(Math.sin(Math.PI * x), power); }
/** Which step (0..n-1) is lit: one step per beat, wrapping. @param {number} t @param {{bpm:number,phase:number}} g @param {number} n */
export function beatStep(t, g, n) { return ((beatIndex(t, g) % n) + n) % n; }
/**
 * Swing: delays the off-beat eighth. amount 0 = straight, 1/6 = triplet shuffle (off-beat at 2/3 of the beat, bed D's feel), 0.5 would push it onto the next beat.
 * Returns the time of eighth-note slot `slot` (0, 1, 2, ...; odd slots are the off-beats) of the grid.
 * @param {number} slot @param {{bpm:number,phase:number}} g @param {number} [amount=0]
 */
export function swingTime(slot, g, amount = 0) { const b = 60 / g.bpm, whole = Math.floor(slot / 2), odd = slot % 2; return g.phase + whole * b + (odd ? b * (0.5 + amount) : 0); }

/**
 * One-call analysis of a file.
 * @param {string} file @param {{sr?:number, from?:number, to?:number}} [o] from/to cut the analysed span (seconds)
 * @returns {{bpm:number, beat:number, phase:number, confidence:number, onsets:{t:number,strength:number}[], oe:object, dur:number}}
 */
export function analyzeTrack(file, { sr = 22050, from = 0, to = Infinity } = {}) {
  const d = decodeAudio(file, sr), a = Math.round(from * sr), b = Math.min(d.pcm.length, Math.round(to * sr)), pcm = d.pcm.subarray(a, b);
  const oe = onsetEnvelope(pcm, sr), t = estimateTempo(oe);
  return { ...t, onsets: pickOnsets(oe), oe, dur: pcm.length / sr };
}

/**
 * How well a list of expected hit times is covered by detected onsets: the share of expected hits that have an onset within `tol` seconds, and the mean signed offset (onset - expected) of those.
 * @param {number[]} expected @param {{t:number}[]} onsets @param {number} [tol=0.04] @returns {{hit:number, total:number, share:number, meanOffset:number}}
 */
export function coverage(expected, onsets, tol = 0.04) {
  let hit = 0, off = 0;
  for (const e of expected) { let best = null; for (const o of onsets) if (Math.abs(o.t - e) <= tol && (best === null || Math.abs(o.t - e) < Math.abs(best - e))) best = o.t; if (best !== null) { hit++; off += best - e; } }
  return { hit, total: expected.length, share: expected.length ? hit / expected.length : 0, meanOffset: hit ? off / hit : 0 };
}

/**
 * Downsample the onset envelope to `n` bars (max per bar) for drawing a strip. @param {{env:Float32Array,fps:number}} oe @param {number} n @returns {Float32Array}
 */
export function envBars(oe, n) { const out = new Float32Array(n), per = oe.env.length / n; for (let i = 0; i < n; i++) { let m = 0; for (let q = Math.floor(i * per); q < Math.floor((i + 1) * per); q++) m = Math.max(m, oe.env[q] || 0); out[i] = m; } return out; }
