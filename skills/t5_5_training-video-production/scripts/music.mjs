#!/usr/bin/env node
// Upbeat synthesized music beds (no samples, nothing to license). 48 kHz stereo 16-bit WAV.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SR = 48000;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const N0 = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mid = (name, oct) => 12 * (oct + 1) + N0[name[0]] + (name[1] === 'b' ? -1 : name[1] === '#' ? 1 : 0);
function writeWav(file, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1;

function render(seconds, bpm, bars, o) {
  const N = Math.floor(seconds * SR), L = new Float32Array(N), R = new Float32Array(N);
  const beat = 60 / bpm, sx = beat / 4; // sixteenth
  const add = (t, dur, fn, gain, pan) => {
    const i0 = Math.floor(t * SR), n = Math.floor(dur * SR);
    for (let k = 0; k < n && i0 + k < N; k++) { const v = fn(k / SR) * gain; L[i0 + k] += v * (1 - pan); R[i0 + k] += v * pan; }
  };
  const kick = (t, g) => add(t, 0.3, s => Math.sin(2 * Math.PI * (45 * s + 70 * (1 - Math.exp(-s * 30)) / 30 * 30 * 0 + 110 * (1 - Math.exp(-s * 25)) / 25 * 0 + (45 + 80 * Math.exp(-s * 28)) * s)) * Math.exp(-s * 14), g, 0.5);
  const hat = (t, g, d = 0.04, pan = 0.62) => { let p = 0; add(t, d * 3, s => { const x = rnd(), y = x - p; p = x; return y * Math.exp(-s / d); }, g, pan); };
  const clap = (t, g) => { let p = 0; add(t, 0.2, s => { const x = rnd(), y = (x - 0.6 * p); p = x; return y * Math.exp(-s / 0.07); }, g, 0.5); };
  const rim = (t, g) => add(t, 0.06, s => (Math.sin(2 * Math.PI * 1800 * s) + 0.5 * rnd()) * Math.exp(-s * 80), g, 0.4);
  const pluck = (t, m, dur, g, pan, br) => { const f = hz(m); add(t, dur, s => { const e = Math.exp(-s * (br || 9)); let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * s) / h * Math.exp(-s * h * 3); return v * e; }, g, pan); };
  const ep = (t, m, dur, g, pan) => { const f = hz(m); add(t, dur, s => { const e = Math.exp(-s * 3.2); return (Math.sin(2 * Math.PI * f * s + 1.6 * e * Math.sin(2 * Math.PI * f * 2 * s)) * e + 0.3 * Math.sin(2 * Math.PI * f * s) * Math.exp(-s * 1.2)); }, g, pan); };
  const bass = (t, m, dur, g) => { const f = hz(m); add(t, dur, s => { const e = Math.min(1, s * 120) * Math.exp(-s * 2.2); return (Math.sin(2 * Math.PI * f * s) + 0.35 * Math.sin(4 * Math.PI * f * s)) * e; }, g, 0.5); };
  const pad = (t, ms, dur, g) => ms.forEach((m, k) => { const f = hz(m); add(t, dur + 0.3, s => { const e = Math.min(1, s / 0.25, (dur + 0.3 - s) / 0.3); return (Math.sin(2 * Math.PI * f * s) + Math.sin(2 * Math.PI * (f + 0.4) * s)) * 0.5 * Math.max(0, e); }, g / (1 + k * 0.1), 0.25 + 0.5 * (k % 2)); });
  const total = Math.floor(seconds / (beat * 4));
  for (let b = 0; b < total; b++) {
    const ch = o.chords[b % o.chords.length], root = o.roots[b % o.roots.length], t0 = b * beat * 4;
    o.bar({ t0, sx, beat, ch, root, kick, hat, clap, rim, pluck, ep, bass, pad, bi: b });
  }
  // echo on the right/left for width
  const d = Math.floor(beat * 0.75 * SR);
  for (let i = N - 1; i >= d; i--) { L[i] += R[i - d] * o.echo; R[i] += L[i - d] * o.echo; }
  // fade in/out
  const fi = Math.floor(2 * SR), fo = Math.floor(4 * SR);
  for (let i = 0; i < N; i++) { const g = Math.min(1, i / fi, (N - i) / fo); L[i] *= g; R[i] *= g; }
  let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
  const g = Math.pow(10, -1 / 20) / (m || 1); for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}
const M = (n, o) => mid(n, o);
const variants = {
  // A: bright, friendly pop-pluck, 108 BPM, C-G-Am-F
  A_bright_pluck: { bpm: 108, echo: 0.28, roots: [M('C',2), M('G',1), M('A',1), M('F',1)],
    chords: [[M('C',4), M('E',4), M('G',4)], [M('B',3), M('D',4), M('G',4)], [M('C',4), M('E',4), M('A',4)], [M('C',4), M('F',4), M('A',4)]],
    bar: ({ t0, sx, beat, ch, root, kick, hat, clap, pluck, bass, pad }) => {
      pad(t0, ch, beat * 4, 0.10);
      for (let q = 0; q < 4; q++) { kick(t0 + q * beat, 0.55); if (q % 2) clap(t0 + q * beat, 0.10); }
      for (let e = 0; e < 8; e++) hat(t0 + e * 2 * sx + sx, 0.07);
      for (let s = 0; s < 16; s++) if (s % 2 === 0 || s % 4 === 3) { const idx = [0, 1, 2, 1, 0, 1, 2, 1][(s >> 1) % 8]; pluck(t0 + s * sx, ch[idx] + 12, 0.35, 0.16, 0.3 + 0.4 * (s % 3) / 2); }
      [0, 6, 8, 14].forEach(s => bass(t0 + s * sx, root, beat * 0.9, 0.55));
    } },
  // B: warm lo-fi groove, 92 BPM, electric piano chords
  B_warm_groove: { bpm: 92, echo: 0.22, roots: [M('F',2), M('E',2), M('D',2), M('C',2)],
    chords: [[M('F',3), M('A',3), M('C',4), M('E',4)], [M('E',3), M('G',3), M('B',3), M('D',4)], [M('D',3), M('F',3), M('A',3), M('C',4)], [M('C',3), M('E',3), M('G',3), M('B',3)]],
    bar: ({ t0, sx, beat, ch, root, kick, hat, clap, ep, bass }) => {
      kick(t0, 0.6); kick(t0 + 10 * sx, 0.45); kick(t0 + 8 * sx, 0.25);
      clap(t0 + 4 * sx, 0.14); clap(t0 + 12 * sx, 0.14);
      for (let e = 0; e < 8; e++) hat(t0 + e * 2 * sx, e % 2 ? 0.06 : 0.04, 0.03);
      [0, 6, 10].forEach((s, i) => ch.forEach((m, k) => ep(t0 + s * sx + k * 0.012, m, beat * (i === 0 ? 2 : 1), 0.12, 0.3 + 0.1 * k)));
      ep(t0 + 14 * sx, ch[3] + 12, beat, 0.10, 0.7);
      [0, 3, 7, 10].forEach(s => bass(t0 + s * sx, root, beat * 0.8, 0.6));
    } },
  // C: driving but light, 120 BPM, Am-F-C-G staccato arps
  C_driving_arp: { bpm: 120, echo: 0.3, roots: [M('A',1), M('F',1), M('C',2), M('G',1)],
    chords: [[M('A',3), M('C',4), M('E',4)], [M('A',3), M('C',4), M('F',4)], [M('G',3), M('C',4), M('E',4)], [M('G',3), M('B',3), M('D',4)]],
    bar: ({ t0, sx, beat, ch, root, kick, hat, clap, pluck, bass, pad }) => {
      pad(t0, ch, beat * 4, 0.09);
      for (let q = 0; q < 4; q++) { kick(t0 + q * beat, 0.5); hat(t0 + q * beat + 2 * sx, 0.09); }
      clap(t0 + beat, 0.09); clap(t0 + 3 * beat, 0.09);
      for (let s = 0; s < 16; s++) { const idx = [0, 1, 2, 1][s % 4]; pluck(t0 + s * sx, ch[idx] + (s % 8 > 3 ? 24 : 12), 0.18, 0.11, 0.35 + 0.3 * ((s >> 1) % 2), 16); }
      for (let q = 0; q < 8; q++) bass(t0 + q * 2 * sx, root, beat * 0.4, 0.5);
    } },
};

const variants2 = {
  // D: swung shuffle, 100 BPM, triplet feel
  D_swing_shuffle: { bpm: 100, echo: 0.2, roots: [M('D',2), M('G',1), M('C',2), M('A',1)],
    chords: [[M('F',3), M('A',3), M('C',4), M('E',4)], [M('F',3), M('B',3), M('D',4), M('G',4)], [M('E',3), M('G',3), M('B',3), M('D',4)], [M('E',3), M('G',3), M('C',4), M('E',4)]],
    bar: ({ t0, beat, ch, root, kick, hat, clap, ep, pluck, bass }) => {
      const u = beat / 3;
      for (let q = 0; q < 4; q++) { const tb = t0 + q * beat; if (q % 2 === 0) kick(tb, 0.5); else clap(tb, 0.13); hat(tb, 0.07, 0.05); hat(tb + 2 * u, 0.05, 0.03); }
      for (let q = 0; q < 4; q++) bass(t0 + q * beat, q % 2 ? root + 7 : root, beat * 0.9, 0.55);
      [0, 2 * beat + 2 * u].forEach((tt, i) => ch.forEach((m, k) => ep(t0 + tt + k * 0.01, m, beat * 1.6, 0.11, 0.3 + 0.12 * k)));
      [beat + 2 * u, 3 * beat, 3 * beat + 2 * u].forEach((tt, i) => pluck(t0 + tt, ch[(i + 1) % 4] + 12, 0.4, 0.14, 0.65, 7));
    } },
  // E: bossa nova, 118 BPM, clave rim, nylon-ish plucks
  E_bossa_nova: { bpm: 118, echo: 0.18, roots: [M('D',2), M('G',1), M('C',2), M('A',1)],
    chords: [[M('F',3), M('A',3), M('C',4), M('E',4)], [M('F',3), M('B',3), M('D',4), M('G',4)], [M('E',3), M('G',3), M('B',3), M('D',4)], [M('E',3), M('G',3), M('C',4), M('E',4)]],
    bar: ({ t0, sx, beat, ch, root, kick, hat, rim, pluck, bass }) => {
      [0, 3, 6, 10, 12].forEach(s => rim(t0 + s * sx, 0.2));
      for (let e = 0; e < 8; e++) hat(t0 + e * 2 * sx, e % 2 ? 0.05 : 0.07, 0.03);
      [0, 6, 8, 14].forEach(s => bass(t0 + s * sx, s === 6 || s === 14 ? root + 7 : root, beat * 0.7, 0.5));
      kick(t0, 0.35); kick(t0 + 8 * sx, 0.3);
      [0, 3, 6, 8, 11, 14].forEach((s, i) => ch.forEach((m, k) => { if (i % 2 === 0 || k > 1) pluck(t0 + s * sx + k * 0.008, m, 0.45, 0.07, 0.3 + 0.13 * k, 6); }));
      [2, 5, 9, 13].forEach((s, i) => pluck(t0 + s * sx, ch[(i * 2) % 4] + 12, 0.3, 0.1, 0.7, 8));
    } },
  // F: half-time bounce, 140 BPM (feels 70), deep sub, bell plucks, rolling hats
  F_halftime_bounce: { bpm: 140, echo: 0.3, roots: [M('E',1), M('C',2), M('G',1), M('D',2)],
    chords: [[M('E',4), M('G',4), M('B',4)], [M('E',4), M('G',4), M('C',5)], [M('D',4), M('G',4), M('B',4)], [M('D',4), M('F#',4), M('A',4)]],
    bar: ({ t0, sx, beat, ch, root, kick, hat, clap, pluck, bass, pad }) => {
      pad(t0, ch.map(m => m - 12), beat * 4, 0.07);
      kick(t0, 0.6); kick(t0 + 7 * sx, 0.4); kick(t0 + 10 * sx, 0.45);
      clap(t0 + 8 * sx, 0.16);
      for (let s = 0; s < 16; s++) hat(t0 + s * sx, s % 4 === 0 ? 0.05 : 0.035, 0.025);
      hat(t0 + 14 * sx + sx / 2, 0.04, 0.02); hat(t0 + 15 * sx + sx / 2, 0.04, 0.02);
      bass(t0, root, beat * 2.5, 0.7); bass(t0 + 10 * sx, root, beat * 1.2, 0.6);
      [0, 3, 6, 10, 12].forEach((s, i) => pluck(t0 + s * sx, ch[[2, 1, 0, 1, 2][i]] + 12, 0.5, 0.14, 0.3 + 0.1 * i, 5));
    } },
  // G: reggae one-drop, 84 BPM, offbeat skank
  G_reggae_offbeat: { bpm: 84, echo: 0.25, roots: [M('G',1), M('C',2), M('E',2), M('D',2)],
    chords: [[M('G',3), M('B',3), M('D',4)], [M('G',3), M('C',4), M('E',4)], [M('G',3), M('B',3), M('E',4)], [M('F#',3), M('A',3), M('D',4)]],
    bar: ({ t0, sx, beat, ch, root, kick, hat, rim, ep, pluck, bass }) => {
      kick(t0 + 2 * beat, 0.5); rim(t0 + 2 * beat, 0.22);
      for (let e = 0; e < 8; e++) hat(t0 + e * 2 * sx, e % 2 ? 0.07 : 0.04, 0.035);
      for (let q = 0; q < 4; q++) ch.forEach((m, k) => ep(t0 + q * beat + 2 * sx + k * 0.006, m, 0.18, 0.1, 0.3 + 0.12 * k));
      [0, 3, 6, 8, 11, 14].forEach((s, i) => bass(t0 + s * sx, [0, 0, 7, 0, 3, 5][i] + root, beat * 0.6, 0.6));
      pluck(t0 + 12 * sx, ch[2] + 12, 0.4, 0.1, 0.7, 7);
    } },
  // H: 16th funk, 104 BPM, syncopated kick, ghost snares, staccato stabs
  H_funk_sixteenth: { bpm: 104, echo: 0.15, roots: [M('D',2), M('G',1), M('E',2), M('A',1)],
    chords: [[M('F',4), M('A',4), M('C',5)], [M('F',4), M('B',4), M('D',5)], [M('G',4), M('B',4), M('D',5)], [M('E',4), M('A',4), M('C',5)]],
    bar: ({ t0, sx, beat, ch, root, kick, hat, clap, pluck, bass }) => {
      [0, 3, 7, 10].forEach(s => kick(t0 + s * sx, 0.5));
      clap(t0 + 4 * sx, 0.14); clap(t0 + 12 * sx, 0.14); clap(t0 + 9 * sx, 0.04); clap(t0 + 15 * sx, 0.04);
      for (let s = 0; s < 16; s++) hat(t0 + s * sx, s % 2 ? 0.035 : 0.065, 0.025);
      [0, 2, 3, 6, 8, 10, 11, 14].forEach((s, i) => bass(t0 + s * sx, root + [0, 12, 0, 7, 0, 12, 10, 7][i], sx * 1.6, 0.5));
      [2, 5, 6, 9, 13, 15].forEach((s, i) => ch.forEach((m, k) => pluck(t0 + s * sx + k * 0.004, m, 0.12, 0.07, 0.3 + 0.13 * k, 28)));
    } },
};
const secs = +process.argv[2] || 240;
const KEEP = ['A_bright_pluck', 'D_swing_shuffle', 'E_bossa_nova'];
const which = Object.fromEntries(Object.entries({ ...variants, ...variants2 }).filter(([k]) => KEEP.includes(k)));
for (const [name, v] of Object.entries(which)) {
  const [L, R] = render(secs, v.bpm, 0, v);
  writeWav(path.join(ROOT, 'assets/music', name + '.wav'), L, R);
  console.log('wrote', name);
}
