#!/usr/bin/env node
// Synthesizes the music bed (slow ambient pad, no samples, nothing to license) and the sound effects. 48 kHz stereo 16-bit WAV.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SR = 48000;

function writeWav(file, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}
function normalize(L, R, peakDb) {
  let m = 0; for (let i = 0; i < L.length; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
  const g = Math.pow(10, peakDb / 20) / (m || 1);
  for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
}

// ── Music pad: four slow chords, 22 s each, crossfaded, with a soft room ──
function pad(seconds) {
  const N = Math.floor(seconds * SR), L = new Float32Array(N), R = new Float32Array(N);
  const chords = [
    [73.42, 110.0, 174.61, 261.63, 329.63],   // Dm9
    [58.27, 116.54, 174.61, 220.0, 293.66],   // Bb maj7
    [87.31, 130.81, 220.0, 261.63, 329.63],   // F maj7
    [65.41, 130.81, 196.0, 293.66, 392.0],    // C add9
  ];
  const seg = 22, fade = 7;
  const dry = [new Float32Array(N), new Float32Array(N)];
  for (let c = 0; c * seg < seconds + fade; c++) {
    const notes = chords[c % chords.length], t0 = c * seg - fade / 2, t1 = (c + 1) * seg + fade / 2;
    const i0 = Math.max(0, Math.floor(t0 * SR)), i1 = Math.min(N, Math.floor(t1 * SR));
    notes.forEach((f, ni) => {
      const lfoRate = 0.05 + 0.021 * ni, ph = ni * 1.7 + c;
      for (let i = i0; i < i1; i++) {
        const t = i / SR;
        const env = Math.min(1, (t - t0) / fade, (t1 - t) / fade);
        const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, env));
        const lfo = 0.78 + 0.22 * Math.sin(2 * Math.PI * lfoRate * t + ph);
        const w = 2 * Math.PI * f * t;
        const w2 = 2 * Math.PI * (f + 0.27) * t;
        const s = Math.sin(w) + Math.sin(w2) + 0.32 * Math.sin(2 * w) + 0.12 * Math.sin(3 * w2);
        const a = e * lfo * s * (ni === 0 ? 0.5 : 0.3) / (1 + ni * 0.15);
        const pan = 0.5 + 0.35 * Math.sin(ni * 1.3 + c);
        dry[0][i] += a * (1 - pan) * 1.4;
        dry[1][i] += a * pan * 1.4;
      }
    });
  }
  // soft low-pass
  for (const ch of dry) { let y = 0; const k = 1 - Math.exp(-2 * Math.PI * 2200 / SR); for (let i = 0; i < N; i++) { y += k * (ch[i] - y); ch[i] = y; } }
  // Schroeder-style room
  const mkComb = (d, g) => ({ buf: new Float32Array(d), i: 0, g });
  const mkAp = d => ({ buf: new Float32Array(d), i: 0 });
  const rooms = [0, 1].map(ch => ({
    combs: [1687, 1601, 2053, 2251, 2399].map((d, k) => mkComb(Math.round((d + ch * 29 + k * 7) * SR / 44100), 0.84)),
    aps: [mkAp(Math.round(556 * SR / 44100)), mkAp(Math.round(441 * SR / 44100))],
  }));
  [L, R].forEach((out, ch) => {
    const rm = rooms[ch];
    for (let i = 0; i < N; i++) {
      const x = dry[ch][i];
      let wet = 0;
      for (const c of rm.combs) { const y = c.buf[c.i]; c.buf[c.i] = x * 0.3 + y * c.g; c.i = (c.i + 1) % c.buf.length; wet += y; }
      for (const a of rm.aps) { const y = a.buf[a.i]; const v = wet + y * 0.5; a.buf[a.i] = v; wet = y - v * 0.5; a.i = (a.i + 1) % a.buf.length; }
      out[i] = x * 0.7 + wet * 0.22;
    }
  });
  normalize(L, R, -1);
  return [L, R];
}

// ── Sound effects ──
const noise = (() => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; }; })();
function mk(sec, fn) { const n = Math.floor(sec * SR), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn(i / SR, i); return a; }
function stereo(a, width = 0) { const L = new Float32Array(a.length), R = new Float32Array(a.length); const d = Math.round(width * SR); for (let i = 0; i < a.length; i++) { L[i] = a[i]; R[i] = i >= d ? a[i - d] : 0; } return [L, R]; }
const sfx = {
  whoosh: () => { let y = 0; return mk(0.8, t => { const p = t / 0.8, env = Math.sin(Math.PI * p) ** 2; const fc = 250 + 3200 * Math.sin(Math.PI * p) ** 1.5; const k = 1 - Math.exp(-2 * Math.PI * fc / SR); y += k * (noise() - y); return y * env * 2.2; }); },
  tick: () => mk(0.08, t => Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t * 90) * 0.9),
  pop: () => mk(0.16, t => { const f = 420 + 520 * (1 - Math.exp(-t * 40)); return Math.sin(2 * Math.PI * f * t) * Math.min(1, t * 400) * Math.exp(-t * 22) * 0.9; }),
  chime: () => mk(1.6, t => (Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 3.2) + 0.55 * Math.sin(2 * Math.PI * 1318.5 * t) * Math.exp(-t * 4.5) + 0.3 * Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-t * 7)) * Math.min(1, t * 600) * 0.6),
  stamp: () => { let y = 0; return mk(0.5, t => { const k = 1 - Math.exp(-2 * Math.PI * 600 / SR); y += k * (noise() - y); return (Math.sin(2 * Math.PI * 68 * t) * Math.exp(-t * 14) * 1.0 + y * Math.exp(-t * 90) * 0.8); }); },
  success: () => mk(1.2, t => { const a = Math.sin(2 * Math.PI * 523.25 * t) * Math.exp(-t * 5), t2 = t - 0.13, b = t2 > 0 ? Math.sin(2 * Math.PI * 783.99 * t2) * Math.exp(-t2 * 4) : 0; return (a + b) * Math.min(1, t * 600) * 0.55; }),
  wrong: () => mk(0.5, t => (Math.sin(2 * Math.PI * 196 * t) + Math.sin(2 * Math.PI * 207 * t)) * Math.exp(-t * 7) * Math.min(1, t * 500) * 0.45),
};

const only = process.argv[2];
if (!only || only === 'music') {
  console.log('music pad...');
  const [L, R] = pad(170);
  writeWav(path.join(ROOT, 'assets/music_pad_full.wav'), L, R);
}
if (!only || only === 'sfx') {
  console.log('sfx...');
  const order = ['whoosh', 'tick', 'pop', 'chime', 'stamp', 'success', 'wrong'];
  const sam = [];
  for (const name of order) {
    const a = sfx[name]();
    const [L, R] = stereo(a, name === 'whoosh' ? 0.004 : 0.0015);
    normalize(L, R, -3);
    writeWav(path.join(ROOT, `assets/sfx/${name}.wav`), L, R);
    sam.push(L, new Float32Array(Math.round(0.6 * SR)));
  }
  const total = sam.reduce((n, a) => n + a.length, 0), all = new Float32Array(total); let o = 0;
  for (const a of sam) { all.set(a, o); o += a.length; }
  writeWav(path.join(ROOT, 'assets/sfx_sampler.wav'), all, all);
}
console.log('done');
