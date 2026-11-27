// t5.1 voice-synced-scenes: word timing for a Kokoro sentence clip, and the cue helpers that make a scene change on the word.
// No dependencies but node built-ins. Audio is decoded with ffmpeg (ANNIE_FFMPEG).
// All times are seconds. "Clip time" starts at the first sample of the sentence's wav; "lesson time" is clip time + the sentence's start.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FF = () => process.env.ANNIE_FFMPEG || '/Users/cris/Desktop/AEON-wt-deps/node_modules/ffmpeg-static/ffmpeg';

/**
 * Decode any audio file to mono float samples with ffmpeg.
 * @param {string} file @param {number} [sr=16000] sample rate
 * @returns {{pcm:Float32Array, sr:number, dur:number}}
 */
export function decodeAudio(file, sr = 16000) {
  const r = spawnSync(FF(), ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(sr), 'pipe:1'], { maxBuffer: 1 << 29 });
  if (r.status !== 0) throw new Error('ffmpeg decode failed for ' + file + ': ' + r.stderr);
  const b = r.stdout, pcm = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4)));
  return { pcm, sr, dur: pcm.length / sr };
}

/**
 * Loudness envelope in dB relative to the clip's own loud level (98th percentile frame). 25 ms RMS window, `hop` seconds apart.
 * @param {Float32Array} pcm @param {number} sr @param {number} [hop=0.01]
 * @returns {{db:Float32Array, hop:number}} db[k] is the level at time k*hop (window centred there)
 */
export function envelope(pcm, sr, hop = 0.01) {
  const H = Math.round(hop * sr), W = Math.round(0.025 * sr), n = Math.floor(pcm.length / H), rms = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const c = k * H, a = Math.max(0, c - (W >> 1)), b = Math.min(pcm.length, c + (W >> 1)); let s = 0;
    for (let i = a; i < b; i++) s += pcm[i] * pcm[i];
    rms[k] = Math.sqrt(s / Math.max(1, b - a));
  }
  const sorted = Float32Array.from(rms).sort(), ref = sorted[Math.floor(n * 0.98)] || 1e-6, db = new Float32Array(n);
  for (let k = 0; k < n; k++) db[k] = 20 * Math.log10(Math.max(rms[k], 1e-7) / ref);
  return { db, hop };
}

/**
 * Find when the voice really starts and stops, and the quiet gaps inside it (the commas and full stops).
 * @param {{db:Float32Array,hop:number}} env from envelope()
 * @param {{floorDb?:number, pauseDb?:number, minPause?:number}} [o] floorDb -38 = speech edge, pauseDb -30 = "quiet" inside speech, minPause 0.08 s
 * @returns {{start:number, end:number, pauses:{s:number,e:number,mid:number,len:number}[]}}
 */
export function analyzeClip(env, o = {}) {
  const { floorDb = -38, pauseDb = -30, minPause = 0.08 } = o, { db, hop } = env;
  let a = 0, b = db.length - 1;
  while (a < db.length && db[a] < floorDb) a++;
  while (b > a && db[b] < floorDb) b--;
  const pauses = []; let run = -1;
  for (let k = a; k <= b + 1; k++) {
    const quiet = k <= b && db[k] < pauseDb;
    if (quiet && run < 0) run = k;
    if (!quiet && run >= 0) { const s = run * hop, e = k * hop; if (e - s >= minPause && run > a && k <= b) pauses.push({ s, e, mid: (s + e) / 2, len: e - s }); run = -1; }
  }
  return { start: a * hop, end: (b + 1) * hop, pauses };
}

/** Rough English syllable count (vowel groups, minus a silent final e). Good to about +-1 on rare words; the weights tolerate that. @param {string} w */
export function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z']/g, ''); if (!w) return 0;
  if (/^\d+$/.test(w)) return 1;
  let n = (w.match(/[aeiouy]+/g) || []).length;
  if (/[^aeiouy]e$/.test(w) && !/le$/.test(w) && n > 1) n--;
  if (/(ed)$/.test(w) && !/[td]ed$/.test(w) && n > 1) n--;
  return Math.max(1, n);
}

const PAUSE = { ',': 0.22, ';': 0.3, ':': 0.3, '.': 0.42, '?': 0.45, '!': 0.42, '—': 0.25 };   // text-only pause guess, seconds (checked against Heart in test.mjs)
/**
 * Split a sentence into words with their weights and the pause punctuation that follows each.
 * Weight = 1 per syllable + 0.12 per letter beyond the third (long words take longer): fitted by hand on Heart, see SKILL.md.
 * @param {string} text @returns {{w:string, clean:string, weight:number, punct:string, pause:number}[]}
 */
export function parseWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).map(w => {
    const clean = w.replace(/^[^\w']+|[^\w']+$/g, ''), m = w.match(/[,;:.?!—]+$/), punct = m ? m[0].slice(-1) : '';
    return { w, clean, weight: syllables(clean) + 0.12 * Math.max(0, clean.length - 3), punct, pause: PAUSE[punct] || 0 };
  });
}

/** Kokoro Heart leaves about 0.3 s of silence before the first word and 0.47 s after the last (10 clips measured: 0.28-0.33 and 0.42-0.50). Used only when the audio is not analysed. */
export const KOKORO_EDGES = { lead: 0.3, tail: 0.47 };
const PSEUDO = 0.2;   // seconds per weight unit when a guessed pause is turned into weight

/**
 * Word start/end times inside one sentence clip.
 * Text only (no `clip`): the speech span is the clip minus Kokoro's usual lead and tail silence, shared out by word weight, with a guessed pause after each comma or full stop.
 * With `clip` (output of analyzeClip): the real speech span is used, each comma/full stop is pinned to a quiet gap measured in the audio, and any other measured gap
 * (a breath Kokoro added where the text has no punctuation) is also respected, so no word is ever placed inside a silence.
 * @param {string} text the exact spoken text
 * @param {number} dur clip length in seconds
 * @param {{start:number,end:number,pauses:{s:number,e:number,mid:number}[]}} [clip] measured speech span and gaps
 * @returns {{w:string, s:number, e:number, i:number, pinned:boolean}[]} clip-time seconds; `pinned` = the word's end is followed by a measured gap
 */
export function alignWords(text, dur, clip) {
  const ws = parseWords(text), n = ws.length;
  const a = clip ? clip.start : Math.min(KOKORO_EDGES.lead, dur * 0.1), b = clip ? clip.end : Math.max(a + 0.2, dur - KOKORO_EDGES.tail);
  const gaps = clip ? clip.pauses.filter(p => p.s > a && p.e < b) : [];
  const cum = [0]; ws.forEach(x => cum.push(cum[cum.length - 1] + x.weight));
  const total = cum[n], pw = ws.map((x, k) => (k < n - 1 ? x.pause / PSEUDO : 0)), totalAll = total + pw.reduce((s, v) => s + v, 0);
  // predicted time of the boundary after word k (text-only model, whole sentence)
  const pred = k => { const before = cum[k + 1] + pw.slice(0, k).reduce((s, v) => s + v, 0); return a + (b - a) * (before + pw[k] / 2) / totalAll; };
  // 1. match text pauses to measured gaps (order-preserving, skip allowed, cost = distance, skip = 0.45 s)
  const tp = []; ws.forEach((x, k) => { if (k < n - 1 && x.pause > 0) tp.push(k); });
  const pin = new Map(), SK = 0.45, K = tp.length, M = gaps.length;
  if (K && M) {
    const D = Array.from({ length: K + 1 }, () => new Array(M + 1).fill(Infinity)), B = Array.from({ length: K + 1 }, () => new Array(M + 1).fill(null)); D[0][0] = 0;
    for (let i = 0; i <= K; i++) for (let j = 0; j <= M; j++) {
      const c = D[i][j]; if (c === Infinity) continue;
      if (i < K && c + SK < D[i + 1][j]) { D[i + 1][j] = c + SK; B[i + 1][j] = [i, j, -1]; }
      if (j < M && c + SK * 0.5 < D[i][j + 1]) { D[i][j + 1] = c + SK * 0.5; B[i][j + 1] = [i, j, -2]; }
      if (i < K && j < M) { const e = Math.abs(gaps[j].mid - pred(tp[i])); if (e < 0.6 && c + e < D[i + 1][j + 1]) { D[i + 1][j + 1] = c + e; B[i + 1][j + 1] = [i, j, j]; } }
    }
    let i = K, j = M; while (i > 0 || j > 0) { const bk = B[i][j]; if (!bk) break; if (bk[2] >= 0) pin.set(tp[bk[0]], gaps[bk[2]]); i = bk[0]; j = bk[1]; }
  }
  // 2. other measured gaps (>= 0.15 s) go to the nearest unpinned word boundary
  const used = new Set([...pin.values()]);
  for (const g of gaps) { if (used.has(g) || g.len < 0.15) continue; let bk = -1, bd = Infinity; for (let k = 0; k < n - 1; k++) { if (pin.has(k)) continue; const d = Math.abs(pred(k) - g.mid); if (d < bd) { bd = d; bk = k; } } if (bk >= 0 && bd < 0.5) { pin.set(bk, g); used.add(g); } }
  // 3. segments between pinned gaps share their span by weight; an unpinned text pause becomes a gap item inside the segment
  const out = new Array(n); let k = 0, cursor = a;
  while (k < n) {
    let j = k; while (j < n - 1 && !pin.has(j)) j++;
    const segEnd = j === n - 1 ? b : pin.get(j).s, items = [];
    for (let q = k; q <= j; q++) { items.push({ q, wt: ws[q].weight }); if (q < j && pw[q] > 0) items.push({ gap: true, wt: pw[q] }); }
    const sum = items.reduce((s, x) => s + x.wt, 0), span = Math.max(0.02, segEnd - cursor); let t = cursor;
    for (const it of items) { const d = span * it.wt / sum; if (!it.gap) out[it.q] = { w: ws[it.q].w, s: t, e: t + d, i: it.q, pinned: it.q === j && j < n - 1 }; t += d; }
    cursor = j === n - 1 ? b : pin.get(j).e; k = j + 1;
  }
  return out;
}

/**
 * The baseline used by render.mjs on 2026-11-11: a word starts at its character position in the sentence, spread over the whole clip.
 * Kept only so test.mjs can prove alignWords is closer to the audio.
 * @param {string} text @param {number} dur
 */
export function alignByChars(text, dur) {
  const ws = text.trim().split(/\s+/); let pos = 0; const len = text.trim().length;
  return ws.map((w, i) => { const s = text.indexOf(w, pos); pos = s + w.length; return { w, i, s: dur * s / len, e: dur * (s + w.length) / len }; });
}

/**
 * Lay a lesson's sentences on one clock the way render.mjs does: PRE before the first word, GAP between sentences.
 * @param {{text:string, dur:number, file?:string}[]} rows one per sentence, in order (durations.json rows)
 * @param {{pre?:number, gap?:number, t0?:number, analyze?:boolean, baseDir?:string}} [o] analyze:true reads each wav and uses measured pauses
 * @returns {{sentences:{i:number,text:string,start:number,end:number,dur:number,words:{w:string,s:number,e:number,i:number,pinned:boolean}[]}[], end:number}} word times are LESSON time
 */
export function buildTimeline(rows, o = {}) {
  const { pre = 0.6, gap = 0.45, t0 = 0, analyze = false, baseDir = '.' } = o;
  let t = t0 + pre; const sentences = [];
  rows.forEach((r, i) => {
    let clip = null, dur = r.dur;
    if (analyze && r.file) { const f = path.isAbsolute(r.file) ? r.file : path.join(baseDir, r.file), d = decodeAudio(f); dur = d.dur; clip = analyzeClip(envelope(d.pcm, d.sr)); }
    const words = alignWords(r.text, dur, clip).map(x => ({ ...x, s: x.s + t, e: x.e + t }));
    sentences.push({ i, text: r.text, start: t, end: t + dur, dur, words }); t += dur + gap;
  });
  return { sentences, end: t - gap };
}

/**
 * When a word starts, in lesson time. `lead` pulls the picture slightly BEFORE the word (0.12 s default: the eye needs the picture first).
 * Throws when the word is not in the sentence, so a typo cannot silently fire at 0.
 * @param {{sentences:any[]}} tl from buildTimeline @param {number} k sentence index @param {string} [word] omit = start of the sentence
 * @param {{lead?:number, nth?:number}} [o] nth = which occurrence (0 = first)
 */
export function cue(tl, k, word, o = {}) {
  const { lead = 0.12, nth = 0 } = o, s = tl.sentences[k]; if (!s) throw new Error(`cue: no sentence ${k}`);
  if (word === undefined) return s.start;
  const key = String(word).toLowerCase().replace(/[^\w']/g, ''); let seen = 0;
  for (const w of s.words) if (w.w.toLowerCase().replace(/[^\w']/g, '') === key) { if (seen++ === nth) return Math.max(0, w.s - lead); }
  throw new Error(`cue: word "${word}"${nth ? ` #${nth}` : ''} is not in sentence ${k}: "${s.text}"`);
}

/**
 * Which word is being spoken at time t, as {k, i, word, p} (sentence, word index, entry, 0..1 progress through the word), or null in a silence.
 * @param {{sentences:any[]}} tl @param {number} t
 */
export function wordAt(tl, t) {
  for (const s of tl.sentences) { if (t < s.start - 0.001 || t > s.end + 0.001) continue; for (const w of s.words) if (t >= w.s && t < w.e) return { k: s.i, i: w.i, word: w, p: (t - w.s) / (w.e - w.s) }; }
  return null;
}

/**
 * Highlight state for a list of items tied to words. items = [{k, word, ...}] -> index of the latest item whose cue has passed (-1 before the first).
 * Use it to light the "current" row of a list on the word being said.
 * @param {number[]} cues cue times, ascending @param {number} t
 */
export function activeItem(cues, t) { let a = -1; for (let i = 0; i < cues.length; i++) if (t >= cues[i]) a = i; return a; }

/**
 * Sound-effect list for a set of cues: [{t, name}] you can hand to t5.3's mixer. Effects fire ON the cue plus `lead` (default: with the word, not before it).
 * @param {{t:number, name:string, gain?:number}[]} items @param {number} [lead=0.12]
 */
export function sfxFromCues(items, lead = 0.12) { return items.map(x => ({ t: x.t + lead, name: x.name, gain: x.gain ?? 1 })); }

/** Write a timeline as JSON for the next agent (words and sentences, lesson time). @param {object} tl @param {string} file */
export function saveTimeline(tl, file) { fs.writeFileSync(file, JSON.stringify(tl, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v, 1)); }

/**
 * Score a word alignment against the measured gaps of a clip: for every text pause (comma, full stop) the distance in seconds between
 * the word boundary the aligner made and the nearest measured gap's edge. Lower is better. Used by test.mjs.
 * @param {{s:number,e:number}[]} words clip-time words @param {{pauses:{s:number,e:number}[]}} clip @param {string} text
 * @returns {number[]} one error per internal text pause that has a measured gap within 0.5 s
 */
export function pauseErrors(words, clip, text) {
  const ws = parseWords(text), errs = [];
  ws.forEach((x, k) => { if (k < ws.length - 1 && x.pause > 0) {
    const bnd = (words[k].e + words[k + 1].s) / 2; let best = Infinity;
    for (const p of clip.pauses) best = Math.min(best, bnd >= p.s && bnd <= p.e ? 0 : Math.min(Math.abs(bnd - p.s), Math.abs(bnd - p.e)));
    if (best < 0.5) errs.push(best);
  } });
  return errs;
}

/**
 * Put a voice file on a silent video: the voice starts `delay` seconds into the video. Writes AAC. For the full mix (sfx, music, ducking, loudness) use t5.3.
 * @param {string} video silent mp4 @param {string} voice wav/mp3 @param {number} delay seconds @param {string} out mp4 path
 */
export function muxVoice(video, voice, delay, out) {
  const ms = Math.round(delay * 1000), r = spawnSync(FF(), ['-v', 'error', '-y', '-i', video, '-i', voice, '-filter_complex', `[1:a]aresample=48000,adelay=${ms}:all=1,apad[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out]);
  if (r.status !== 0) throw new Error('mux failed: ' + r.stderr);
}
