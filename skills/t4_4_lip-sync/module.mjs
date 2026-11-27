// t4.4 lip-sync: turn a voice track (+ its text) into mouth shapes for Cog.
// Pipeline: ffmpeg decodes the audio -> loudness envelope (100 Hz) -> speech segments and energy peaks -> text split into syllables with a vowel class
// -> syllables placed on the audio by "energy CDF" alignment, snapped to energy peaks -> viseme keys -> smooth mouth parameters for any time t.
// Everything after decoding is a pure function. No speech recogniser is used: the timing comes from the audio, the shapes come from the text.
import { spawnSync } from 'node:child_process';
import { clamp, lerp, prog, E, rgba } from '../../engine/index.mjs';
import { rng } from '../../engine/rng.mjs';

const FFMPEG = process.env.ANNIE_FFMPEG || '/Users/cris/Desktop/AEON-wt-deps/node_modules/ffmpeg-static/ffmpeg';

// ------------------------------------------------------------------ visemes
/**
 * The 11 mouth shapes, as t4.1 mouth parameters ({w, open, smile, round, tongue, teeth}). Few shapes, strongly different: a cartoon mouth that is too busy
 * looks like chewing. MBP (lips shut) is the one that matters most: always show it for at least 3 frames.
 */
export const VISEMES = {
  rest: { w: 1, open: 0, smile: 0.35, round: 0, tongue: 0, teeth: 0 },
  MBP: { w: 0.9, open: 0, smile: 0, round: 0, tongue: 0, teeth: 0 },          // b p m: lips pressed, flat line
  FV: { w: 1, open: 0.14, smile: 0.1, round: 0, tongue: 0, teeth: 1 },        // f v: top teeth on the lip
  AH: { w: 1.05, open: 0.85, smile: 0.2, round: 0, tongue: 0.35, teeth: 0 },   // a, father: jaw wide
  EH: { w: 1.12, open: 0.52, smile: 0.45, round: 0, tongue: 0.2, teeth: 0.4 }, // e, a in "say": half open, wide
  EE: { w: 1.28, open: 0.2, smile: 0.8, round: 0, tongue: 0, teeth: 0.7 },     // ee, i: narrow slit, wide smile
  OH: { w: 0.85, open: 0.62, smile: 0, round: 0.75, tongue: 0.1, teeth: 0 },   // o: round, medium
  OO: { w: 0.78, open: 0.3, smile: 0, round: 1, tongue: 0, teeth: 0 },         // oo, w: small round
  TH: { w: 1, open: 0.22, smile: 0.3, round: 0, tongue: 0.7, teeth: 0.9 },     // th l t d n: tongue behind the teeth
  SS: { w: 1.1, open: 0.14, smile: 0.55, round: 0, tongue: 0, teeth: 1 },      // s z c: teeth together, small slit
  SH: { w: 0.9, open: 0.3, smile: 0.1, round: 0.55, tongue: 0, teeth: 0.6 },   // sh ch j: lips pushed out
};
/** The viseme names in a fixed order (for icon rows and tests). */
export const VISEME_NAMES = Object.keys(VISEMES);

// ------------------------------------------------------------------ audio -> envelope
/**
 * Decode any audio file to mono float samples with ffmpeg (the same binary the renderer uses). Returns {samples: Float32Array, rate, duration}.
 * @param {string} file @param {number} [rate] default 16000
 */
export function decodeAudio(file, rate = 16000) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(rate), '-'], { maxBuffer: 1 << 29 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const b = r.stdout, samples = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return { samples, rate, duration: samples.length / rate };
}
/**
 * Loudness envelope at 100 Hz (hop 10 ms, window 25 ms RMS), in dB, normalised so the 95th percentile of the speech frames is 1 and 35 dB below it is 0,
 * then smoothed with a 3-frame mean. Silence in a clean Kokoro track reads exactly 0. Returns {env: Float32Array, hop, duration, refDb}.
 * @param {Float32Array} samples @param {number} rate
 */
export function loudness(samples, rate) {
  const hop = 0.01, H = Math.round(rate * hop), W = Math.round(rate * 0.025), n = Math.floor(samples.length / H), db = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = i * H - (W >> 1); j < i * H + (W >> 1); j++) if (j >= 0 && j < samples.length) { s += samples[j] * samples[j]; c++; } db[i] = 20 * Math.log10(Math.sqrt(s / Math.max(1, c)) + 1e-5); }
  const speech = Array.from(db).filter(v => v > -55).sort((a, b) => a - b), ref = speech.length ? speech[Math.floor(speech.length * 0.95)] : -20;
  const raw = Float32Array.from(db, v => clamp((v - (ref - 35)) / 35)), env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = (raw[Math.max(0, i - 1)] + raw[i] + raw[Math.min(n - 1, i + 1)]) / 3;
  return { env, hop, duration: samples.length / rate, refDb: ref };
}
/** Decode a file and return its envelope in one call. @param {string} file */
export function analyzeAudio(file) { const a = decodeAudio(file); return loudness(a.samples, a.rate); }
/** Envelope value at time t (linear interpolation). @param {{env:Float32Array,hop:number}} A */
export function envAt(A, t) { const x = t / A.hop, i = Math.floor(x), f = x - i, e = A.env; if (i < 0) return e[0] || 0; if (i >= e.length - 1) return e[e.length - 1] || 0; return e[i] * (1 - f) + e[i + 1] * f; }
/**
 * Speech segments: stretches where the envelope stays above `thr` (default 0.3), bridging gaps shorter than `gap` (0.12 s) and dropping blips shorter than `min` (0.06 s).
 * Returns [{t0, t1}] in seconds.
 */
export function speechSegments(A, { thr = 0.3, gap = 0.12, min = 0.06 } = {}) {
  const seg = []; let s = null;
  for (let i = 0; i < A.env.length; i++) { const on = A.env[i] > thr; if (on && s === null) s = i; if (!on && s !== null) { seg.push([s * A.hop, i * A.hop]); s = null; } }
  if (s !== null) seg.push([s * A.hop, A.env.length * A.hop]);
  const out = []; for (const [a, b] of seg) { if (out.length && a - out[out.length - 1].t1 < gap) out[out.length - 1].t1 = b; else out.push({ t0: a, t1: b }); }
  return out.filter(x => x.t1 - x.t0 >= min);
}
/** Energy peaks (about one per syllable): local maxima of the envelope above 0.35 with prominence 0.08 and at least 80 ms apart. Returns times in seconds. */
export function energyPeaks(A, { floor = 0.35, prominence = 0.08, minGap = 0.08 } = {}) {
  const e = A.env, win = 8, peaks = [];
  for (let i = 2; i < e.length - 2; i++) {
    if (e[i] < floor || e[i] < e[i - 1] || e[i] <= e[i + 1]) continue;
    let lo = Infinity, hi = Infinity; for (let j = i; j > Math.max(0, i - win * 3); j--) lo = Math.min(lo, e[j]); for (let j = i; j < Math.min(e.length, i + win * 3); j++) hi = Math.min(hi, e[j]);
    if (e[i] - Math.max(lo, hi) < prominence) continue;
    if (peaks.length && i * A.hop - peaks[peaks.length - 1].t < minGap) { if (e[i] > peaks[peaks.length - 1].v) peaks[peaks.length - 1] = { t: i * A.hop, v: e[i] }; continue; }
    peaks.push({ t: i * A.hop, v: e[i] });
  }
  return peaks.map(p => p.t);
}

// ------------------------------------------------------------------ text -> syllables
/** How odd words are SAID, as plain letters. "AEON" is spoken Ee-on in BGI voice-overs. */
export const PRONOUNCE = { aeon: 'ee on', bgi: 'bee jee eye', ai: 'a eye', llm: 'el el em', tiktok: 'tik tok', youtube: 'you tube', macsense: 'mac sense', '18+': 'eighteen plus' };
/** Syllable counts for words the vowel-group rule gets wrong (hiatus words). Add yours here. */
export const SYLLABLE_OVERRIDES = { video: 3, radio: 3, idea: 3, being: 2, science: 2, real: 1, area: 3, quiet: 2, created: 3, creating: 3, creative: 3, create: 2, poem: 2, lion: 2, giant: 2, diamond: 2, every: 3, different: 3, family: 3, evening: 2, business: 2, people: 2, once: 1 };
const isV = c => 'aeiouy'.includes(c);
/** Split one word into syllables with a mouth class each. Returns [{text, nucleus: 'AH'|'EH'|'EE'|'OH'|'OO', onset: viseme|null, coda: viseme|null}]. */
export function wordSyllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return [];
  const orig = w; w = w.replace(/qu/g, 'kw');
  let drop = 0;
  if (w.length > 2 && w.endsWith('e') && !isV(w[w.length - 2])  ) drop = 1;                  // silent final e: make, machine, gence
  else if (w.length > 3 && w.endsWith('es') && !isV(w[w.length - 3]) && !'sxzcgh'.includes(w[w.length - 3])) drop = 2;                                                  // makes
  else if (w.length > 3 && w.endsWith('ed') && !'td'.includes(w[w.length - 3]) && !isV(w[w.length - 3])) drop = 2;                                                      // learned
  let core = w.slice(0, w.length - drop); if (!/[aeiouy]/.test(core.replace(/^y/, ''))) core = w;                                                                              // the, be: keep the e
  if (w.length > 3 && /[^aeiouy]le$/.test(w)) core = w;                                                                                                                         // little: le is a syllable
  const groups = []; const re = /[aeiouy]+/g; let m;
  while ((m = re.exec(core))) { if (m.index === 0 && m[0][0] === 'y' && m[0].length === 1 && core.length > 1) continue; groups.push({ g: m[0].replace(/^y(?=[aeiou])/, ''), i: m.index }); }
  const forced = SYLLABLE_OVERRIDES[orig]; let n = groups.length || 1;
  if (forced && forced !== n) { // split or merge groups to hit the forced count
    while (groups.length < forced) { const big = groups.reduce((a, b) => (b.g.length > a.g.length ? b : a), groups[0] || { g: 'a', i: 0 }); if (big.g.length > 1) { const k = groups.indexOf(big); groups.splice(k, 1, { g: big.g[0], i: big.i }, { g: big.g.slice(1), i: big.i + 1 }); } else groups.push({ g: big.g, i: big.i + 1 }); }
    while (groups.length > forced) groups.pop();
    n = forced;
  }
  if (!groups.length) groups.push({ g: 'a', i: 0 });
  return groups.map((gr, k) => {
    const g = gr.g, openEnd = !/[^aeiouy]/.test(core.slice(gr.i + g.length, gr.i + g.length + 1)) || gr.i + g.length >= core.length;
    let nucleus = 'EH';
    if (/oo|ou|ew|ue|uo|^w?u$/.test(g) && !/^u$/.test(g)) nucleus = 'OO'; else if (/^u$/.test(g)) nucleus = 'AH';
    else if (/o/.test(g)) nucleus = 'OH'; else if (/ee|ie|ea|^y$|ey/.test(g)) nucleus = 'EE';
    else if (/a/.test(g)) nucleus = /ai|ay|ei/.test(g) ? 'EH' : 'AH';
    else if (/^i$/.test(g)) nucleus = (drop === 1 || openEnd) ? 'EE' : 'EH'; else if (/^e$/.test(g)) nucleus = openEnd && core.length <= 2 ? 'EE' : 'EH';
    const before = core.slice(k ? groups[k - 1].i + groups[k - 1].g.length : 0, gr.i), after = core.slice(gr.i + g.length, groups[k + 1] ? groups[k + 1].i : core.length + 1);
    return { text: core.slice(gr.i, gr.i + g.length), nucleus, onset: consonantViseme(before, true, g[0]), coda: k === groups.length - 1 ? consonantViseme(after, false) : null };
  });
}
/** The most visible consonant in a cluster, or null. Onset: the strongest one anywhere in the cluster. Coda: only lip-closing and lip-biting ones (they cannot be skipped). */
function consonantViseme(s, onset, nextVowel = '') {
  if (!s) return null; s = s.replace(/kw/g, 'w');
  if (/[bpm]/.test(s) && (onset || /[bpm]$/.test(s))) return 'MBP';
  if (/ph|[fv]/.test(s) && (onset || /[fv]$/.test(s))) return 'FV';
  if (!onset) return null;
  if (/sh|ch|j/.test(s)) return 'SH'; if (/w/.test(s)) return 'OO'; if (/th|[ltdn]/.test(s)) return 'TH'; if (/[szx]/.test(s) || /c(?=[eiy])/.test(s + nextVowel)) return 'SS';
  return null;
}
/**
 * Text -> syllables. Words are split on spaces; PRONOUNCE rewrites odd words first. Each syllable carries its word index, the viseme classes and `pauseAfter`
 * (seconds of expected pause: 0.3 after . ? !  0.15 after , ; :) which is only used when there is no audio.
 * @param {string} text @returns {Array<{word:number, wordText:string, text:string, nucleus:string, onset:string|null, coda:string|null, pauseAfter:number, last:boolean}>}
 */
export function syllabify(text) {
  const out = []; const words = text.split(/\s+/).filter(Boolean);
  words.forEach((raw, wi) => {
    const clean = raw.toLowerCase().replace(/[^a-z0-9+]/g, ''), spoken = PRONOUNCE[clean] || clean, punct = /[.?!]$/.test(raw) ? 0.3 : /[,;:]$/.test(raw) ? 0.15 : 0;
    const parts = spoken.split(/\s+/); let first = true;
    parts.forEach((part, pi) => { const sy = wordSyllables(part); sy.forEach((s, si) => { out.push({ word: wi, wordText: raw, ...s, pauseAfter: pi === parts.length - 1 && si === sy.length - 1 ? punct : 0, last: pi === parts.length - 1 && si === sy.length - 1, first: first && si === 0 }); }); first = false; });
  });
  return out;
}

// ------------------------------------------------------------------ alignment
/**
 * Place syllables on the audio, in three steps.
 * 1. Speech segments (stretches of voice separated by pauses) and text chunks (split at . , ; : ? !) are matched with dynamic programming: each segment gets a
 *    run of consecutive syllables, close to its share of the total speech energy, and runs prefer to end where the text has punctuation.
 * 2. Inside a segment the syllables are spread by an energy CDF (a syllable sits where the running energy reaches (k + 0.5) / n).
 * 3. Snap: if the segment has exactly as many energy peaks as syllables, the peaks are used as they are; otherwise each syllable moves to the nearest unused
 *    peak within +-`snap` s (in order). A vowel is a loudness peak.
 * Returns [{...syllable, t (centre), dur, seg}] in time order. @param {{env:Float32Array,hop:number,duration:number}} A @param {ReturnType<typeof syllabify>} syls
 * @param {{snap?:number, gap?:number}} [o]
 */
export function alignSyllables(A, syls, { snap = 0.07, gap = 0.15 } = {}) {
  const N = syls.length; if (!N) return [];
  const segs = speechSegments(A, { gap }), S = segs.length; if (!S) return alignFromText(syls);
  const e = A.env, W = segs.map(g => { let sum = 0; for (let i = Math.floor(g.t0 / A.hop); i < Math.min(e.length, Math.ceil(g.t1 / A.hop)); i++) if (e[i] > 0.3) sum += e[i] * e[i]; return sum; }), WT = W.reduce((a, b) => a + b, 0) || 1;
  const expect = W.map(w => (N * w) / WT);
  const boundary = new Array(N + 1).fill(0); boundary[0] = boundary[N] = 1; syls.forEach((sy, k) => { if (sy.last && sy.pauseAfter > 0) boundary[k + 1] = sy.pauseAfter >= 0.3 ? 1 : 0.6; });
  // DP over segments (rows) and syllables consumed (cols). cost[s][j] = best cost with the first s segments holding the first j syllables.
  const INF = 1e18, cost = Array.from({ length: S + 1 }, () => new Float64Array(N + 1).fill(INF)), from = Array.from({ length: S + 1 }, () => new Int32Array(N + 1).fill(-1)); cost[0][0] = 0;
  for (let s = 0; s < S; s++) for (let j = 0; j <= N; j++) { if (cost[s][j] >= INF) continue;
    for (let k = 0; j + k <= N; k++) { const x = expect[s], c = ((k - x) ** 2) / Math.max(1, x) + (k === 0 && segs[s].t1 - segs[s].t0 > 0.25 ? 4 : 0) + 2.5 * (1 - boundary[j + k]) * (s < S - 1 ? 1 : 0), v = cost[s][j] + c; if (v < cost[s + 1][j + k]) { cost[s + 1][j + k] = v; from[s + 1][j + k] = j; } if (k > x + 6) break; } }
  const counts = new Array(S).fill(0); { let j = N; for (let s = S; s >= 1; s--) { const pj = from[s][j]; counts[s - 1] = j - (pj < 0 ? 0 : pj); j = pj < 0 ? 0 : pj; } }
  const peaksAll = energyPeaks(A), out = []; let idx = 0;
  segs.forEach((g, si) => {
    const k = counts[si]; if (!k) return; const sl = syls.slice(idx, idx + k); idx += k;
    const i0 = Math.floor(g.t0 / A.hop), i1 = Math.min(e.length, Math.ceil(g.t1 / A.hop)), cum = new Float64Array(i1 - i0 + 1); for (let i = i0; i < i1; i++) cum[i - i0 + 1] = cum[i - i0] + (e[i] > 0.3 ? e[i] * e[i] : 0);
    const tot = cum[cum.length - 1] || 1, at = q => { const target = q * tot; let lo = 0, hi = cum.length - 2; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid + 1] < target) lo = mid + 1; else hi = mid; } return (i0 + lo) * A.hop; };
    const peaks = peaksAll.filter(p => p >= g.t0 - 0.02 && p <= g.t1 + 0.02);
    let times; if (peaks.length === k) times = peaks.slice();
    else { const used = new Set(); let last = g.t0 - 1; times = sl.map((_, n) => { const t = at((n + 0.5) / k); let best = -1, bd = snap + 1e-9; peaks.forEach((p, i) => { const d = Math.abs(p - t); if (d < bd && !used.has(i) && p > last + 0.04) { bd = d; best = i; } }); if (best >= 0) { used.add(best); last = peaks[best]; return peaks[best]; } last = Math.max(last, t); return t; }); }
    sl.forEach((sy, n) => { const nxt = times[n + 1] !== undefined ? times[n + 1] : g.t1 + 0.04; out.push({ ...sy, t: times[n], dur: clamp((nxt - times[n]) * 0.92, 0.06, 0.3), seg: si }); });
  });
  return out;
}
/** Text-only fallback when there is no audio: speak at `sps` syllables per second (default 4.2, about 160 words per minute) with the punctuation pauses. Returns aligned syllables. */
export function alignFromText(syls, { sps = 4.2, t0 = 0 } = {}) {
  let t = t0; return syls.map(s => { const d = 1 / sps, out = { ...s, t: t + d / 2, dur: d * 0.9 }; t += d + s.pauseAfter; return out; });
}

// ------------------------------------------------------------------ viseme keys and mouth track
/**
 * Turn aligned syllables into keyframes [{t, v: viseme name, w: 0..1 weight}] sorted by time. Per syllable: an onset consonant shape 0.06 s before the vowel,
 * the vowel shape held around the centre, a coda closure (m, b, p, f, v) after it. Lip closures (MBP) are kept at least 0.1 s: neighbours are pushed away.
 * Returns the keys. @param {ReturnType<typeof alignSyllables>} al @param {{env?:{env:Float32Array,hop:number}}} [o]
 */
export function visemeKeys(al, A = null) {
  const keys = [];
  for (const s of al) {
    const amp = A ? clamp(envAt(A, s.t) * 1.15) : 0.8, a = 0.35 + 0.65 * amp, d = s.dur;
    if (s.onset) keys.push({ t: s.t - 0.35 * d - 0.05, v: s.onset, w: s.onset === 'MBP' ? 1 : 0.9, hold: s.onset === 'MBP' ? 0.1 : 0.05 });
    keys.push({ t: s.t - 0.3 * d, v: s.nucleus, w: a, hold: 0.7 * d });
    if (s.coda) keys.push({ t: s.t + 0.42 * d, v: s.coda, w: s.coda === 'MBP' ? 1 : 0.9, hold: s.coda === 'MBP' ? 0.1 : 0.05 });
  }
  keys.sort((x, y) => x.t - y.t);
  for (let i = 1; i < keys.length; i++) { const need = keys[i - 1].v === 'MBP' ? 0.1 : 0.05, prev = keys[i - 1]; if (keys[i].t < prev.t + need * (keys[i].v === prev.v ? 0 : 1)) keys[i].t = prev.t + need * (keys[i].v === prev.v ? 0 : 1); }
  return keys;
}
/** Blend time per shape: lips close fast (MBP 0.06 s), teeth and tongue shapes 0.07 s, vowels use `blend` (0.09 s). */
const blendFor = (v, blend) => (v === 'MBP' ? Math.min(blend, 0.06) : v === 'FV' || v === 'TH' || v === 'SS' || v === 'SH' ? Math.min(blend, 0.07) : blend);
const lerpMouth = (a, b, k) => Object.fromEntries(Object.keys(a).map(f => [f, lerp(a[f], b[f], k)]));
/**
 * Build the mouth track. Returns {mouthAt(t) -> mouth params for rig.mouth, visemeAt(t) -> {v, w}, keys, aligned, segments, duration}.
 * mouthAt shifts everything EARLIER by `lead` (default 0.05 s: the mouth moves before the sound, 1.5 frames at 30 fps) and eases between shapes over `blend` (default 0.09 s, 3 frames).
 * In silence (envelope under 0.3 for the last 60 ms) the mouth closes to `rest` in 0.1 s. Jaw opening is scaled by loudness: loud syllables open wider.
 * @param {{env:Float32Array,hop:number,duration:number}|null} A audio analysis or null (text-only) @param {string} text
 * @param {{lead?:number, blend?:number, gain?:number, sps?:number}} [o]
 */
export function makeMouthTrack(A, text, { lead = 0.05, blend = 0.09, gain = 1, sps = 4.2 } = {}) {
  const syls = syllabify(text), aligned = A ? alignSyllables(A, syls) : alignFromText(syls, { sps }), keys = visemeKeys(aligned, A);
  const segments = A ? speechSegments(A) : [];
  const visemeAt = t0 => {
    const t = t0 + lead; let i = -1; for (let n = 0; n < keys.length; n++) if (keys[n].t <= t) i = n; else break;
    if (i < 0) return { v: 'rest', w: 0 };
    const k = keys[i]; if (t > k.t + k.hold + 0.12 && (!keys[i + 1] || keys[i + 1].t > t)) return { v: 'rest', w: 0 };
    return { v: k.v, w: k.w };
  };
  const mouthAt = t0 => {
    const t = t0 + lead; let i = -1; for (let n = 0; n < keys.length; n++) if (keys[n].t <= t) i = n; else break;
    const quiet = A ? 1 - clamp((Math.max(envAt(A, t), envAt(A, t - 0.03), envAt(A, t - 0.06)) - 0.18) / 0.2) : 0;   // 0 = loud, 1 = silent
    let m;
    if (i < 0) m = { ...VISEMES.rest };
    else {
      const k = keys[i], nx = keys[i + 1], here = lerpMouth(VISEMES.rest, VISEMES[k.v], k.w), from = i > 0 ? lerpMouth(VISEMES.rest, VISEMES[keys[i - 1].v], keys[i - 1].w) : { ...VISEMES.rest };
      const af = E.inOutSine(prog(t, k.t, k.t + blendFor(k.v, blend))); m = lerpMouth(from, here, af);
      if (!nx && t > k.t + k.hold + 0.12) m = lerpMouth(m, VISEMES.rest, E.inOutSine(prog(t, k.t + k.hold + 0.12, k.t + k.hold + 0.3)));
      else if (nx && t > k.t + k.hold && t < nx.t) { const gapK = E.inOutSine(prog(t, k.t + k.hold, nx.t)); m = lerpMouth(here, lerpMouth(VISEMES.rest, VISEMES[nx.v], nx.w), Math.max(gapK, 0) * (nx.t - (k.t + k.hold) < 0.25 ? 1 : 0.6)); }
    }
    if (A) m = lerpMouth(m, VISEMES.rest, E.inOutSine(clamp(quiet * 1.4)) * 0.97);
    m.open = clamp(m.open * gain, 0, 1); return m;
  };
  return { mouthAt, visemeAt, keys, aligned, segments, duration: A ? A.duration : (aligned.length ? aligned[aligned.length - 1].t + 0.3 : 0), syllables: syls.length };
}

// ------------------------------------------------------------------ drawing helpers
/** Draw the envelope as scrolling bars around time `t` (a window of `span` seconds, playhead in the middle). Returns nothing. Bars are cyan, brighter near the playhead. */
export function drawEnvelope(ctx, A, t, { x, y, w, h, span = 2, color = '#22d3ee', marks = [] }) {
  const n = Math.floor(w / 9);
  for (let i = 0; i < n; i++) {
    const tt = t - span / 2 + (i / (n - 1)) * span, v = tt < 0 || tt > A.duration ? 0 : envAt(A, tt), near = 1 - Math.min(1, Math.abs(tt - t) / (span / 2)), bh = Math.max(3, v * h);
    ctx.fillStyle = rgba(color, 0.25 + 0.65 * near); ctx.beginPath(); ctx.roundRect(x + (i / (n - 1)) * (w - 6), y + (h - bh) / 2, 6, bh, 3); ctx.fill();
  }
  for (const m of marks) { const px = x + ((m - (t - span / 2)) / span) * (w - 6); if (px < x || px > x + w) continue; ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(px + 3, y + h + 14, 6, 0, Math.PI * 2); ctx.fill(); }
}
/** Deterministic speech-like test signal: one amplitude bump per syllable at known times (Hann-shaped, 90-140 ms) on a noisy 140 Hz carrier. Returns {samples, rate}. For tests. */
export function synthSpeech(times, { rate = 16000, duration = null, seed = 5 } = {}) {
  const r = rng(seed), total = duration ?? (times[times.length - 1] + 0.5), s = new Float32Array(Math.floor(total * rate));
  for (const t of times) { const d = r.range(0.09, 0.14), a = r.range(0.5, 1); for (let i = Math.floor((t - d) * rate); i < Math.floor((t + d) * rate); i++) { if (i < 0 || i >= s.length) continue; const u = (i / rate - (t - d)) / (2 * d), hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * u); s[i] += a * 0.3 * hann * (Math.sin(2 * Math.PI * 140 * i / rate) + 0.4 * (r() - 0.5)); } }
  return { samples: s, rate };
}
