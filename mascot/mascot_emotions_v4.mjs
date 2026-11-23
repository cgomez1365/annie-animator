// Mascot emotion reel v4: EVERY emotion now has its own small animation (symbols, particles, weather) like proud's. Based on v3
// Mascot emotion reel v3 (proud is reworked: chest-out pop, twinkling sparkles, a popping '!' and a small rising heart). Based on v2 (CEO 2026-11-22: "animate as many complex emotions as you can with what you have, including color changes
// for anger or frustration"). The gear body (one tooth missing), the pill eyes and nothing else. Every emotion is a set of parameters
// (eye shape, lids, tilt, look, body colour, eye colour, spin speed, shake, bounce, sink, scale, glow); emotions blend over 0.4 s and a few add a
// one-shot "stinger" (a pop on surprise, a stutter on frustration, a flicker on overload). 20 emotions, 2.3 s each. Silent, no closer (a template).
import { createCanvas, setFont, glow, E, prog, P, Path2D, noise1 } from '../../engine/index.mjs';

const DUR = 2.3, BLEND = 0.4, GREEN = '#19e08f', EMS = [];
export const META = { W: 1080, H: 1920, fps: 30, frames: Math.round(30 * (24 * DUR + 2)), brand: 'bgi', coverT: 4, qc: { closer: false } };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const L = (a, b, k) => a + (b - a) * k, LA = (a, b, k) => a.map((v, i) => L(v, b[i], k)), rgb = (c, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;

// parameter defaults. tiltL/tiltR rotate each eye; lidL/lidR (0..1) cover the top of the eye; lidTilt slants the lid (radians, mirrored per eye:
// positive = inner corners down = angry, negative = outer corners down = sad); arc (0..1) swaps the pill for a happy arc.
const D = { color: hex(GREEN), eye: hex(GREEN), w: 42, h: 110, wR: 1, hR: 1, gap: 168, dy: 20, tiltL: 0, tiltR: 0, lidL: 0, lidR: 0, lidTilt: 0, lidTiltR: null, arc: 0, lookX: 0, lookY: 0, head: 0, spin: 0.21, shake: 0, bounce: 0, sink: 0, scale: 1, glow: 0.34, breathe: 0.012, blink: 1, ea: 1, bf: 6.9 };
const em = (id, label, p) => EMS.push({ id, label, p: { ...D, ...p } });
em('calm', 'calm', {});
em('curious', 'curious', { h: 130, w: 46, head: 0.17, lookX: 18, lookY: -16, spin: 0.3 });
em('focused', 'focused', { w: 92, h: 36, dy: 26, lidL: 0.12, lidR: 0.12, spin: 0.1, glow: 0.3 });
em('happy', 'happy', { arc: 1, spin: 0.45, bounce: 10, glow: 0.46 });
em('excited', 'excited', { w: 58, h: 132, color: hex('#5dffb0'), eye: hex('#eafff4'), spin: 1.3, bounce: 30, glow: 0.65 });
em('proud', 'proud', { w: 70, h: 56, lidL: 0.42, lidR: 0.42, lookY: -22, scale: 1.05, spin: 0.28, glow: 0.5, color: hex('#fbbf24'), eye: hex('#fef3c7') });
em('surprised', 'surprised', { w: 62, h: 150, color: hex('#d1fae5'), eye: hex('#ffffff'), spin: 0, glow: 0.7, gap: 190 });
em('confused', 'confused', { w: 52, h: 120, hR: 0.55, wR: 0.8, tiltR: 0.35, head: -0.14, color: hex('#22d3ee'), eye: hex('#a5f3fc'), spin: -0.5, lookX: -14, glow: 0.3 });
em('worried', 'worried', { w: 40, h: 126, lidL: 0.28, lidR: 0.28, lidTilt: -0.42, color: hex('#f59e0b'), eye: hex('#fde68a'), spin: 0.55, shake: 2.2, glow: 0.3, lookX: -10 });
em('sad', 'sad', { w: 38, h: 58, dy: 56, lidL: 0.35, lidR: 0.35, lidTilt: -0.5, color: hex('#60a5fa'), eye: hex('#bfdbfe'), spin: 0.05, sink: 36, glow: 0.14, breathe: 0.006 });
em('sleepy', 'sleepy', { w: 64, h: 96, dy: 36, lidL: 0.62, lidR: 0.62, color: hex('#2f9d78'), eye: hex('#a7f3d0'), spin: 0.03, glow: 0.18, breathe: 0.03, blink: 0.4 });
em('bored', 'bored', { w: 64, h: 70, lidL: 0.5, lidR: 0.5, lookX: -34, color: hex('#7aa095'), eye: hex('#b7cfc6'), spin: 0.12, glow: 0.18 });
em('frustrated', 'frustrated', { w: 76, h: 42, lidL: 0.42, lidR: 0.42, lidTilt: 0.28, color: hex('#f59e0b'), eye: hex('#fcd34d'), spin: 1.0, shake: 3.5, glow: 0.45 });
em('angry', 'angry', { w: 88, h: 54, lidL: 0.55, lidR: 0.55, lidTilt: 0.5, color: hex('#ef4444'), eye: hex('#fecaca'), spin: 1.9, shake: 6, scale: 1.04, glow: 0.65 });
em('furious', 'furious', { w: 100, h: 56, lidL: 0.68, lidR: 0.68, lidTilt: 0.62, color: hex('#dc2626'), eye: hex('#ffffff'), spin: 3.4, shake: 11, scale: 1.07, glow: 0.9, blink: 0 });
em('relieved', 'relieved', { arc: 0.8, lidL: 0.25, lidR: 0.25, color: hex('#2dd4bf'), eye: hex('#99f6e4'), spin: 0.12, glow: 0.3, breathe: 0.035 });
em('mischievous', 'mischievous', { w: 56, h: 100, lidL: 0.55, lidTilt: 0.3, hR: 1.1, head: 0.14, lookX: 18, spin: 0.38, color: hex('#34d399'), eye: hex('#d1fae5'), glow: 0.4 });
em('determined', 'determined', { w: 78, h: 62, lidL: 0.4, lidR: 0.4, lidTilt: 0.22, spin: 0.7, scale: 1.04, glow: 0.5, color: hex('#2bf0a0') });
em('embarrassed', 'embarrassed', { arc: 0.45, lookX: -26, lookY: 24, color: hex('#fb923c'), eye: hex('#fed7aa'), scale: 0.94, spin: 0.08, glow: 0.3, head: -0.08 });
em('overwhelmed', 'overwhelmed', { w: 70, h: 86, color: hex('#22d3ee'), eye: hex('#ffffff'), spin: 2.2, shake: 4, glow: 0.6 });
em('love', 'love', { arc: 1, color: hex('#f9a8d4'), eye: hex('#fce7f3'), spin: 0.15, glow: 0.45, head: 0.08, breathe: 0.02 });
em('asleep', 'asleep', { w: 76, h: 10, dy: 34, color: hex('#60a5fa'), eye: hex('#93c5fd'), spin: 0.02, glow: 0.16, sink: 12, breathe: 0.04, blink: 0 });
em('standby', 'standby', { w: 28, h: 28, dy: 30, gap: 150, spin: 0.04, glow: 0.2, ea: 0.5 });
em('joke', 'good one!', {});
em('calm', 'calm again', { spin: 0.21 });

const N = EMS.length, seg = t => Math.min(N - 1, Math.floor(t / DUR));
const mixP = (a, b, k) => { const o = {}; for (const key in a) o[key] = Array.isArray(a[key]) ? LA(a[key], b[key], k) : (a[key] === null ? b[key] : (typeof a[key] === 'number' ? L(a[key], b[key] ?? a[key], k) : a[key])); return o; };

/** parameters at time t: blend from the previous emotion, then add the current emotion's stinger (all pure functions of t) */
function at(t) {
  const s = seg(t), lt = t - s * DUR, cur = EMS[s], prev = EMS[Math.max(0, s - 1)], k = E.outCubic(prog(lt, 0, BLEND)), p = mixP(prev.p, cur.p, k), ramp = prog(lt, 0, BLEND), id = cur.id;
  p.id = id; p.lt = lt; p.kick = 0;
  if (id === 'surprised') p.kick = 0.16 * Math.exp(-7 * lt) * Math.cos(18 * lt);
  if (id === 'angry' || id === 'furious') p.kick = (id === 'furious' ? 0.1 : 0.07) * Math.exp(-6 * lt) * Math.cos(20 * lt);
  if (id === 'proud') { p.kick = 0.07 * Math.exp(-6 * lt) * Math.cos(16 * lt); p.bounce = 6; p.bf = 4.2; p.lookY = -22 + 4 * Math.sin(lt * 3); p.head = 0.05 * Math.sin(lt * 2.4); }
  if (id === 'excited') p.kick = 0.06 * Math.exp(-5 * lt) * Math.cos(16 * lt);
  if (id === 'frustrated') {   // sputtering spin and an amber <-> red flicker, shake in bursts
    const burst = Math.max(0, Math.sin(lt * 5.2)) ** 2; p.spin *= 0.15 + 1.6 * burst; p.shake *= 0.3 + 1.8 * burst; p.color = LA(hex('#f59e0b'), hex('#ef4444'), 0.5 + 0.5 * Math.sin(lt * 4.4) * ramp); p.eye = LA(hex('#fcd34d'), hex('#fecaca'), 0.5 + 0.5 * Math.sin(lt * 4.4));
  }
  if (id === 'angry') p.color = LA(hex('#ef4444'), hex('#b91c1c'), 0.5 + 0.5 * Math.sin(lt * 7) * ramp);
  if (id === 'furious') { p.color = LA(hex('#dc2626'), hex('#7f1d1d'), 0.5 + 0.5 * Math.sin(lt * 9)); p.glow *= 0.8 + 0.2 * Math.sin(lt * 12); }
  if (id === 'confused') { p.spin = -0.5 * Math.sin(lt * 4.2); p.lookX += 14 * Math.sin(lt * 5); }
  if (id === 'worried') { p.lookX += 22 * Math.sin(lt * 6.5); p.lookY += 5 * Math.sin(lt * 9); }
  if (id === 'curious') { p.lookX += 8 * Math.sin(lt * 3); }
  if (id === 'overwhelmed') { const n = noise1(lt * 7, 3); p.spin = 2.2 * n; p.color = LA(hex('#22d3ee'), hex('#ef4444'), 0.5 + 0.5 * noise1(lt * 5, 9)); p.shake *= 0.6 + Math.abs(noise1(lt * 11, 5)); }
  if (id === 'bored') p.lookX += -8 * Math.sin(lt * 1.2);
  if (id === 'sleepy') { p.lidL = p.lidR = L(0.55, 0.9, 0.5 + 0.5 * Math.sin(lt * 1.6)); }
  if (id === 'relieved') { p.spin = L(1.4, 0.12, E.outCubic(prog(lt, 0, 1.6))); p.sink = 14 * Math.sin(Math.min(lt, 1.6) * Math.PI / 1.6); }
  if (id === 'love') { p.kick = 0.035 * Math.max(0, Math.sin(lt * 6.5)) ** 6; p.glow = 0.4 + 0.1 * Math.sin(lt * 6.5); p.head = 0.08 * Math.sin(lt * 1.6); }
  if (id === 'asleep') { p.sink = 12 + 6 * Math.sin(lt * 1.5); }
  if (id === 'standby') { const pu = 0.5 + 0.5 * Math.sin(lt * 3.2); p.glow = 0.1 + 0.4 * pu; p.ea = 0.3 + 0.55 * pu; }
  if (id === 'joke') {   // deadpan first, then the laugh breaks out at 0.8 s
    const lg = E.outCubic(prog(lt, 0.8, 1.0)), wob = Math.sin(lt * 16);
    p.arc = lg; p.bounce = 26 * lg; p.bf = 21; p.head = 0.14 * wob * lg - 0.08 * lg; p.shake = 3 * lg; p.spin = 0.15 + 1.4 * lg * (0.5 + 0.5 * Math.sin(lt * 9));
    p.color = LA(hex(GREEN), hex('#bef264'), lg); p.eye = LA(hex(GREEN), hex('#f7fee7'), lg); p.glow = 0.34 + 0.25 * lg; p.kick = 0.05 * Math.exp(-8 * Math.max(0, lt - 0.8)) * Math.cos(20 * (lt - 0.8)) * (lt > 0.8 ? 1 : 0);
  }
  return p;
}
// body angle = integral of the spin speed (a table, so frame(t) stays a pure function of t)
const DT = 1 / 120, ANG = new Float64Array(Math.ceil(META.frames / 30 / DT) + 2);
for (let i = 1; i < ANG.length; i++) ANG[i] = ANG[i - 1] + at(i * DT).spin * DT;
const angle = t => { const f = t / DT, i = Math.floor(f); return L(ANG[i], ANG[i + 1], f - i); };

// gear: 12 teeth, tooth 0 missing, no outline for it
const R = 250, TN = 12, step = (Math.PI * 2) / TN, rt = R * 1.17, BODY = new Path2D();
for (let i = 0; i < TN; i++) {
  const a = i * step - Math.PI / 2;
  if (i === 0) { BODY.moveTo(R * Math.cos(a - 0.3 * step), R * Math.sin(a - 0.3 * step)); BODY.arc(0, 0, R, a - 0.3 * step, a + 0.7 * step); continue; }
  [[a - 0.3 * step, R], [a - 0.17 * step, rt], [a + 0.17 * step, rt], [a + 0.3 * step, R]].forEach(([th, r]) => BODY.lineTo(r * Math.cos(th), r * Math.sin(th)));
  BODY.arc(0, 0, R, a + 0.3 * step, a + 0.7 * step);
}
BODY.closePath();


// ---------------------------------------------------------------- per-emotion effects (pure functions of the local time lt)
const PI2 = Math.PI * 2, hsh = (k, m = 1) => { const v = Math.sin(k * 127.1 + m * 311.7) * 43758.5453; return v - Math.floor(v); };
const fx = {
  star(x, px, py, r, rot, a, col = '#fde68a', gl = 'rgba(251,191,36,0.9)') { if (a <= 0.01) return; x.save(); x.translate(px, py); x.rotate(rot); x.globalAlpha = a; glow(x, gl, 16, () => { x.fillStyle = col; x.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.24 : r, an = (i * Math.PI) / 4 - Math.PI / 2; x[i ? 'lineTo' : 'moveTo'](rr * Math.cos(an), rr * Math.sin(an)); } x.closePath(); x.fill(); }); x.restore(); },
  heart(x, px, py, sc, a, col = '#f9a8d4', gl = 'rgba(249,168,212,0.8)') { if (a <= 0.01) return; x.save(); x.translate(px, py); x.scale(sc, sc); x.globalAlpha = a; glow(x, gl, 14, () => { x.fillStyle = col; x.beginPath(); x.moveTo(0, 22); x.bezierCurveTo(-46, -8, -26, -40, 0, -18); x.bezierCurveTo(26, -40, 46, -8, 0, 22); x.fill(); }); x.restore(); },
  drop(x, px, py, sc, a, col = '#93c5fd') { if (a <= 0.01) return; x.save(); x.translate(px, py); x.scale(sc, sc); x.globalAlpha = a; x.fillStyle = col; x.beginPath(); x.moveTo(0, -30); x.bezierCurveTo(26, 0, 26, 24, 0, 24); x.bezierCurveTo(-26, 24, -26, 0, 0, -30); x.fill(); x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.ellipse(-8, 6, 5, 9, 0.3, 0, PI2); x.fill(); x.restore(); },
  txt(x, str, px, py, size, rot, a, col, gl, fam = 'sg') { if (a <= 0.01) return; x.save(); x.translate(px, py); x.rotate(rot); x.globalAlpha = a; setFont(x, fam, size, 700); x.textAlign = 'center'; glow(x, gl, 20, () => { x.fillStyle = col; x.fillText(str, 0, size * 0.34); }); x.restore(); },
  ring(x, px, py, r, a, col, lw = 4) { if (a <= 0.01) return; x.save(); x.globalAlpha = a; x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.arc(px, py, r, 0, PI2); x.stroke(); x.restore(); },
  ticks(x, px, py, r0, r1, n, rot, a, col, lw = 6, from = 0, to = PI2) { if (a <= 0.01) return; x.save(); x.globalAlpha = a; x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; for (let i = 0; i < n; i++) { const an = from + ((to - from) * i) / Math.max(1, n - (to - from < PI2 ? 1 : 0)) + rot; x.beginPath(); x.moveTo(px + r0 * Math.cos(an), py + r0 * Math.sin(an)); x.lineTo(px + r1 * Math.cos(an), py + r1 * Math.sin(an)); x.stroke(); } x.restore(); },
  puff(x, px, py, r, a, col) { if (a <= 0.01) return; x.save(); x.globalAlpha = a; x.fillStyle = col; [[0, 0, 1], [-0.7, 0.3, 0.75], [0.7, 0.25, 0.8], [0.1, -0.6, 0.7]].forEach(([dx, dy, k]) => { x.beginPath(); x.arc(px + dx * r, py + dy * r, r * k, 0, PI2); x.fill(); }); x.restore(); },
  vein(x, px, py, sc, a, col) { if (a <= 0.01) return; x.save(); x.translate(px, py); x.scale(sc, sc); x.globalAlpha = a; x.strokeStyle = col; x.lineWidth = 9; x.lineCap = 'round'; for (let q = 0; q < 4; q++) { x.save(); x.rotate((q * Math.PI) / 2 + Math.PI / 4); x.beginPath(); x.arc(32, 0, 28, Math.PI * 0.62, Math.PI * 1.38); x.stroke(); x.restore(); } x.restore(); },
  fade: (lt, a0 = 0.15) => prog(lt, 0, a0 + 0.1) * (1 - prog(lt, 1.95, 2.3)),
};
const FX = {
  calm(x, c, lt, f) { for (let k = 0; k < 2; k++) { const u = (lt * 0.45 + k * 0.5) % 1; fx.ring(x, c.x, c.y, 300 + 150 * u, (1 - u) * 0.3 * f, '#19e08f', 3); } for (let k = 0; k < 6; k++) { const u = (lt * 0.25 + hsh(k)) % 1; x.save(); x.globalAlpha = Math.sin(Math.PI * u) * 0.5 * f; x.fillStyle = '#6ee7b7'; x.beginPath(); x.arc(c.x + (hsh(k, 2) - 0.5) * 760, c.y + 300 - 560 * u, 4 + 4 * hsh(k, 3), 0, PI2); x.fill(); x.restore(); } },
  curious(x, c, lt, f) { const w = E.outBack(prog(lt, 0.35, 0.7), 2.2); fx.txt(x, '?', c.x + 250, c.y - 330, 150 * w, 0.2 + 0.05 * Math.sin(lt * 7), f, '#a7f3d0', 'rgba(25,224,143,0.8)'); const w2 = E.outBack(prog(lt, 0.95, 1.3), 2.2); fx.txt(x, '?', c.x - 270, c.y - 270, 90 * w2, -0.25, f, '#6ee7b7', 'rgba(25,224,143,0.7)'); for (let k = 0; k < 3; k++) { const an = lt * 1.1 + (k * PI2) / 3; fx.star(x, c.x + 360 * Math.cos(an), c.y + 330 * Math.sin(an), 14, lt, 0.7 * f, '#d1fae5', 'rgba(25,224,143,0.8)'); } },
  focused(x, c, lt, f) { const t0 = 1 - 0.1 * (0.5 + 0.5 * Math.sin(lt * 3)); x.save(); x.globalAlpha = 0.8 * f; x.strokeStyle = '#19e08f'; x.lineWidth = 6; x.lineCap = 'round'; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx2, sy2]) => { const px = c.x + sx2 * 215 * t0, py = c.y + 20 + sy2 * 105 * t0; x.beginPath(); x.moveTo(px - sx2 * 34, py); x.lineTo(px, py); x.lineTo(px, py - sy2 * 34); x.stroke(); }); x.restore(); x.save(); x.beginPath(); x.arc(c.x, c.y, 190, 0, PI2); x.clip(); x.globalAlpha = 0.35 * f; x.fillStyle = '#19e08f'; x.fillRect(c.x - 200, c.y - 60 + 130 * Math.sin(lt * 2.6), 400, 4); x.restore(); },
  happy(x, c, lt, f) { for (let k = 0; k < 7; k++) { const fr = (lt * 0.9 + k / 7) % 1, tw = Math.sin(Math.PI * fr), an = k * 2.4 + lt * 0.4; fx.star(x, c.x + 340 * Math.cos(an), c.y + 320 * Math.sin(an), 16 + 22 * tw, lt + k, tw * f, '#d1fae5', 'rgba(25,224,143,0.9)'); } for (let k = 0; k < 4; k++) { const fr = (lt * 0.7 + k / 4) % 1; fx.txt(x, '+', c.x + (k % 2 ? 300 : -300) + 20 * k, c.y - 100 - 200 * fr, 54, lt * 2, Math.sin(Math.PI * fr) * f, '#6ee7b7', 'rgba(25,224,143,0.8)', 'mono'); } },
  excited(x, c, lt, f) { const pu = 0.5 + 0.5 * Math.sin(lt * 14); fx.ticks(x, c.x, c.y, 340 + 14 * pu, 410 + 30 * pu, 16, lt * 0.5, 0.9 * f, '#eafff4', 7); for (let k = 0; k < 5; k++) { const fr = (lt * 1.3 + k / 5) % 1, tw = Math.sin(Math.PI * fr); fx.star(x, c.x + (k - 2) * 160, c.y - 400 + 40 * Math.sin(k + lt * 3), 20 + 26 * tw, lt * 2 + k, tw * f, '#ffffff', 'rgba(93,255,176,0.9)'); } const w = E.outBack(prog(lt, 0.3, 0.6), 2.4); fx.txt(x, '!!', c.x - 290, c.y - 330, 120 * w, -0.2 + 0.06 * Math.sin(lt * 12), f, '#eafff4', 'rgba(93,255,176,0.9)'); },
  surprised(x, c, lt, f) { const w = E.outBack(prog(lt, 0.02, 0.22), 2.8); fx.txt(x, '!', c.x, c.y - 400, 230 * w, 0, f, '#ffffff', 'rgba(209,250,229,0.9)'); fx.ticks(x, c.x, c.y, 330, 400, 5, 0, f * (1 - prog(lt, 0.3, 0.9)), '#ffffff', 7, -Math.PI * 0.85, -Math.PI * 0.15); const u = prog(lt, 0, 0.7); fx.ring(x, c.x, c.y, 300 + 220 * u, (1 - u) * 0.6 * f, '#ffffff', 5); },
  confused(x, c, lt, f) { const w = E.outBack(prog(lt, 0.3, 0.65), 2.2); fx.txt(x, '?', c.x + 260, c.y - 300, 160 * w, 0.25, f, '#a5f3fc', 'rgba(34,211,238,0.9)'); const w2 = E.outBack(prog(lt, 0.75, 1.1), 2.2); fx.txt(x, '?', c.x - 280, c.y - 340, 100 * w2, -0.3, f, '#67e8f9', 'rgba(34,211,238,0.8)'); x.save(); x.translate(c.x - 250, c.y - 160); x.rotate(lt * 2.4); x.globalAlpha = 0.7 * f; x.strokeStyle = '#22d3ee'; x.lineWidth = 6; x.lineCap = 'round'; x.setLineDash([14, 12]); x.beginPath(); for (let i = 0; i <= 60; i++) { const an = i * 0.2, r = 6 + i * 0.9; x[i ? 'lineTo' : 'moveTo'](r * Math.cos(an), r * Math.sin(an)); } x.stroke(); x.restore(); },
  worried(x, c, lt, f) { for (let k = 0; k < 2; k++) { const u = prog(lt - k * 0.9, 0, 1.2); fx.drop(x, c.x + 225 - k * 440, c.y - 150 + 230 * u * u, 0.9, Math.sin(Math.PI * Math.min(1, u)) * f, '#93c5fd'); } for (let k = 0; k < 3; k++) fx.txt(x, '.', c.x - 60 + k * 60, c.y - 360, 120, 0, f * (0.25 + 0.75 * (Math.floor(lt * 3) % 4 > k ? 1 : 0)), '#fde68a', 'rgba(245,158,11,0.7)', 'mono'); },
  sad(x, c, lt, f) { x.save(); x.globalAlpha = 0.75 * f; x.fillStyle = '#475569'; [[-60, 0, 62], [10, -22, 78], [86, 2, 58], [30, 20, 64]].forEach(([dx, dy, r]) => { x.beginPath(); x.arc(c.x + dx, c.y - 395 + dy, r, 0, PI2); x.fill(); }); x.restore(); for (let k = 0; k < 7; k++) { const u = (lt * 1.4 + k / 7) % 1; x.save(); x.globalAlpha = Math.sin(Math.PI * u) * 0.8 * f; x.strokeStyle = '#93c5fd'; x.lineWidth = 5; x.lineCap = 'round'; const rx = c.x - 90 + k * 32, ry = c.y - 330 + 200 * u; x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx - 6, ry + 26); x.stroke(); x.restore(); } for (const sd of [-1, 1]) { const u = prog(lt - (sd > 0 ? 0.5 : 0), 0.2, 1.2); fx.drop(x, c.x + sd * 84, c.y + 110 + 170 * u * u, 0.8, Math.sin(Math.PI * Math.min(1, u)) * f); } },
  sleepy(x, c, lt, f) { const r = 20 + 24 * (0.5 + 0.5 * Math.sin(lt * 3.2)); x.save(); x.globalAlpha = 0.8 * f; x.strokeStyle = '#bfdbfe'; x.lineWidth = 4; x.fillStyle = 'rgba(191,219,254,0.18)'; x.beginPath(); x.arc(c.x + 170, c.y + 70, r, 0, PI2); x.fill(); x.stroke(); x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(c.x + 170 - r * 0.35, c.y + 70 - r * 0.35, r * 0.14, 0, PI2); x.fill(); x.restore(); const u = (lt * 0.5) % 1; fx.txt(x, 'z', c.x - 250 + 50 * u, c.y - 200 - 120 * u, 50 + 20 * u, 0, Math.sin(Math.PI * u) * 0.8 * f, '#6ee7b7', 'rgba(25,224,143,0.5)', 'mono'); },
  bored(x, c, lt, f) { for (let k = 0; k < 3; k++) fx.txt(x, '.', c.x + 220 + k * 50, c.y - 250, 120, 0, f * (Math.floor(lt * 1.6) % 4 > k ? 0.9 : 0.15), '#b7cfc6', 'rgba(122,160,149,0.5)', 'mono'); const u = prog(lt, 0.6, 1.8); fx.puff(x, c.x - 330 - 40 * u, c.y + 120 - 30 * u, 24 + 40 * u, 0.35 * Math.sin(Math.PI * Math.min(1, u)) * f, '#b7cfc6'); const tx = c.x - 540 + 1200 * ((lt * 0.35) % 1); x.save(); x.globalAlpha = 0.5 * f; x.strokeStyle = '#7aa095'; x.lineWidth = 3; x.translate(tx, c.y + 470); x.rotate(lt * 4); x.beginPath(); x.arc(0, 0, 22, 0, PI2); x.moveTo(-22, 0); x.lineTo(22, 0); x.moveTo(0, -22); x.lineTo(0, 22); x.stroke(); x.restore(); },
  frustrated(x, c, lt, f) { for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) { const u = (lt * 1.1 + k / 3 + (sd > 0 ? 0.17 : 0)) % 1; fx.puff(x, c.x + sd * 200 + 30 * Math.sin(u * 5) * sd, c.y - 300 - 190 * u, 22 + 48 * u, (1 - u) * 0.55 * f, '#fcd34d'); } fx.vein(x, c.x + 240, c.y - 240, 1 + 0.12 * Math.sin(lt * 18), f, '#f59e0b'); for (let k = 0; k < 4; k++) fx.ticks(x, c.x - 250, c.y - 200, 30, 60, 1, hsh(k) * PI2 + Math.floor(lt * 8) * 0.9, f * (hsh(k, Math.floor(lt * 8)) > 0.4 ? 0.8 : 0), '#fde68a', 5); },
  angry(x, c, lt, f) { fx.vein(x, c.x + 250, c.y - 250, 1.3 + 0.18 * Math.sin(lt * 24), f, '#ef4444'); for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { const u = (lt * 1.8 + k / 4) % 1; fx.puff(x, c.x + sd * 210, c.y - 290 - 240 * u, 20 + 50 * u, (1 - u) * 0.6 * f, '#fca5a5'); } fx.ticks(x, c.x, c.y, 335, 395, 7, 0, f * (0.5 + 0.5 * Math.sin(lt * 20)), '#ef4444', 8, -Math.PI * 0.9, -Math.PI * 0.1); x.save(); const g = x.createRadialGradient(540, 960, 420, 540, 960, 1150); g.addColorStop(0, 'rgba(239,68,68,0)'); g.addColorStop(1, `rgba(239,68,68,${0.22 * f * (0.7 + 0.3 * Math.sin(lt * 9))})`); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920); x.restore(); },
  furious(x, c, lt, f) { for (let k = 0; k < 2; k++) { const u = (lt * 2 + k * 0.5) % 1; fx.ring(x, c.x, c.y, 300 + 330 * u, (1 - u) * 0.65 * f, '#f87171', 7); } fx.vein(x, c.x + 260, c.y - 260, 1.7 + 0.25 * Math.sin(lt * 28), f, '#fecaca'); fx.vein(x, c.x - 270, c.y - 190, 1.1 + 0.2 * Math.sin(lt * 31), f, '#ef4444'); for (let k = 0; k < 22; k++) { const u = (lt * (0.8 + hsh(k) * 0.9) + hsh(k, 4)) % 1; x.save(); x.globalAlpha = Math.sin(Math.PI * u) * f; glow(x, 'rgba(251,146,60,0.9)', 12, () => { x.fillStyle = hsh(k, 7) > 0.5 ? '#fb923c' : '#fde047'; x.beginPath(); x.arc(c.x + (hsh(k, 2) - 0.5) * 620 + 60 * Math.sin(u * 7 + k), c.y + 260 - 760 * u, 4 + 6 * hsh(k, 3), 0, PI2); x.fill(); }); x.restore(); } x.save(); const g = x.createRadialGradient(540, 960, 360, 540, 960, 1100); g.addColorStop(0, 'rgba(127,29,29,0)'); g.addColorStop(1, `rgba(220,38,38,${0.38 * f})`); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920); x.restore(); },
  relieved(x, c, lt, f) { const u = prog(lt, 0.1, 1.9); fx.puff(x, c.x + 330 + 160 * u, c.y + 40 - 20 * u, 30 + 70 * u, 0.5 * Math.sin(Math.PI * Math.min(1, u)) * f, '#ccfbf1'); const d = prog(lt, 0.1, 1.2); fx.drop(x, c.x - 215, c.y - 120 + 250 * d * d, 0.85, Math.sin(Math.PI * Math.min(1, d)) * f, '#99f6e4'); for (let k = 0; k < 5; k++) { const fr = (lt * 0.7 + k / 5) % 1, tw = Math.sin(Math.PI * fr); fx.star(x, c.x + 330 * Math.cos(k * 1.9), c.y - 80 + 300 * Math.sin(k * 1.9), 12 + 18 * tw, lt + k, tw * 0.9 * f, '#ccfbf1', 'rgba(45,212,191,0.9)'); } },
  mischievous(x, c, lt, f) { const gl1 = Math.max(0, Math.sin(Math.PI * prog(lt, 0.55, 0.95))), gl2 = Math.max(0, Math.sin(Math.PI * prog(lt, 1.45, 1.85))); const ex = c.x + 84 + 18, ey = c.y + 10; fx.star(x, ex + 26, ey - 36, 34 * gl1 + 4, 0.2, gl1 * f, '#ffffff', 'rgba(190,242,100,0.95)'); fx.star(x, ex + 40, ey - 60, 26 * gl2 + 4, 0.2, gl2 * f, '#ffffff', 'rgba(190,242,100,0.95)'); for (let k = 0; k < 3; k++) fx.ticks(x, c.x - 340 - 20 * k, c.y - 120 + 60 * k, 0, 70, 1, 0, 0.5 * f * (0.5 + 0.5 * Math.sin(lt * 4 + k)), '#6ee7b7', 5, 0, 0); fx.txt(x, 'heh', c.x + 250, c.y - 300 + 8 * Math.sin(lt * 5), 62 * E.outBack(prog(lt, 0.75, 1.1), 2), 0.18, f, '#bbf7d0', 'rgba(25,224,143,0.8)', 'mono'); },
  determined(x, c, lt, f) { for (let k = 0; k < 12; k++) { const u = (lt * (1.6 + hsh(k) * 0.8) + hsh(k, 5)) % 1, side = k % 2 ? 1 : -1, y = c.y - 360 + 720 * hsh(k, 2), len = 120 + 140 * hsh(k, 3); x.save(); x.globalAlpha = Math.sin(Math.PI * u) * 0.7 * f; x.strokeStyle = '#d1fae5'; x.lineWidth = 5; x.lineCap = 'round'; const xx = c.x + side * (520 - 330 * u); x.beginPath(); x.moveTo(xx, y); x.lineTo(xx + side * len, y); x.stroke(); x.restore(); } const fl = Math.max(0, Math.sin(Math.PI * prog(lt, 0.7, 1.1))); fx.star(x, c.x + 90, c.y - 20, 40 * fl + 3, 0, fl * f, '#ffffff', 'rgba(43,240,160,0.9)'); fx.ticks(x, c.x, c.y, 330, 380, 3, 0, f * 0.7, '#2bf0a0', 8, -Math.PI * 0.62, -Math.PI * 0.38); },
  embarrassed(x, c, lt, f) { const bl = 0.35 + 0.15 * Math.sin(lt * 3); x.save(); x.globalAlpha = bl * f * prog(lt, 0.05, 0.5); for (const sd of [-1, 1]) { const g = x.createRadialGradient(c.x + sd * 160, c.y + 105, 0, c.x + sd * 160, c.y + 105, 70); g.addColorStop(0, 'rgba(251,113,133,0.9)'); g.addColorStop(1, 'rgba(251,113,133,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(c.x + sd * 160, c.y + 105, 70, 42, 0, 0, PI2); x.fill(); } x.restore(); const u = prog(lt, 0.3, 1.5); fx.drop(x, c.x + 215, c.y - 100 + 200 * u * u, 0.9, Math.sin(Math.PI * Math.min(1, u)) * f, '#fed7aa'); for (let k = 0; k < 3; k++) fx.txt(x, '.', c.x - 290 + k * 46, c.y - 270, 120, 0, f * (Math.floor(lt * 2.2) % 4 > k ? 0.9 : 0.15), '#fed7aa', 'rgba(251,146,60,0.6)', 'mono'); },
  overwhelmed(x, c, lt, f) { for (let k = 0; k < 9; k++) { const fr = Math.floor(lt * 14); const px = c.x + (hsh(k, fr) - 0.5) * 760, py = c.y + (hsh(k, fr + 9) - 0.5) * 760, w = 20 + 90 * hsh(k, fr + 3); x.save(); x.globalAlpha = (hsh(k, fr + 5) > 0.35 ? 0.8 : 0) * f; x.fillStyle = hsh(k, fr + 7) > 0.5 ? '#22d3ee' : (hsh(k, fr + 8) > 0.5 ? '#ef4444' : '#ffffff'); x.fillRect(px, py, w, 6 + 8 * hsh(k, fr + 1)); x.restore(); } ['!', '?'].forEach((ch, k) => { const an = lt * 3.2 + k * Math.PI; fx.txt(x, ch, c.x + 380 * Math.cos(an), c.y - 60 + 330 * Math.sin(an), 110, an, f, k ? '#22d3ee' : '#ef4444', 'rgba(255,255,255,0.7)'); }); },
  love(x, c, lt, f) { for (let k = 0; k < 9; k++) { const u = (lt * (0.45 + 0.12 * (k % 3)) + k / 9) % 1, sz = 0.5 + 0.7 * hsh(k, 2); fx.heart(x, c.x + (hsh(k, 5) - 0.5) * 680 + 30 * Math.sin(u * 8 + k), c.y + 330 - 700 * u, sz, Math.sin(Math.PI * u) * f); } for (let k = 0; k < 4; k++) { const fr = (lt * 0.8 + k / 4) % 1, tw = Math.sin(Math.PI * fr); fx.star(x, c.x + 330 * Math.cos(k * 1.6 + 0.5), c.y + 290 * Math.sin(k * 1.6 + 0.5), 14 + 18 * tw, lt + k, tw * 0.9 * f, '#fce7f3', 'rgba(249,168,212,0.9)'); } },
  asleep(x, c, lt, f) { x.save(); x.globalAlpha = 0.85 * f; const mx = c.x - 270, my = c.y - 330; x.fillStyle = '#bfdbfe'; glow(x, 'rgba(147,197,253,0.7)', 24, () => { x.beginPath(); x.arc(mx, my, 62, 0, PI2); x.fill(); }); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(mx + 30, my - 14, 56, 0, PI2); x.fill(); x.restore(); for (let k = 0; k < 6; k++) { const tw = 0.5 + 0.5 * Math.sin(lt * 2.4 + k * 1.7); fx.star(x, c.x + (hsh(k, 1) - 0.5) * 820, c.y - 400 + 520 * hsh(k, 2) * 0.55 - 40, 10 + 12 * tw, 0, (0.3 + 0.6 * tw) * f, '#dbeafe', 'rgba(147,197,253,0.8)'); } },
  standby(x, c, lt, f) { for (let k = 0; k < 2; k++) { const u = (lt * 0.55 + k * 0.5) % 1; fx.ring(x, c.x, c.y, 280 + 210 * u, (1 - u) * 0.45 * f, '#19e08f', 4); } for (let k = 0; k < 3; k++) { const on = 0.25 + 0.75 * Math.max(0, Math.sin(lt * 4 - k * 0.9)); x.save(); x.globalAlpha = on * f; x.fillStyle = '#19e08f'; x.beginPath(); x.arc(c.x - 40 + k * 40, c.y + 430, 9, 0, PI2); x.fill(); x.restore(); } },
  joke(x, c, lt, f) { const lg = prog(lt, 0.8, 1.0); const w1 = E.outBack(prog(lt, 0.9, 1.2), 2.4), w2 = E.outBack(prog(lt, 1.1, 1.4), 2.4); fx.txt(x, 'ha', c.x - 290, c.y - 300 + 12 * Math.sin(lt * 21), 120 * w1, -0.2, f, '#f7fee7', 'rgba(190,242,100,0.9)'); fx.txt(x, 'ha!', c.x + 280, c.y - 350 + 12 * Math.sin(lt * 21 + 1), 140 * w2, 0.2, f, '#f7fee7', 'rgba(190,242,100,0.9)'); for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) { const u = (lt * 1.6 + k / 3) % 1; fx.drop(x, c.x + sd * (84 + 140 * u), c.y + 40 - 140 * Math.sin(u * Math.PI * 0.9) + 90 * u, 0.55, lg * Math.sin(Math.PI * u) * f, '#bae6fd'); } for (let k = 0; k < 6; k++) { const fr = (lt * 1.4 + k / 6) % 1, tw = Math.sin(Math.PI * fr); fx.star(x, c.x + 360 * Math.cos(k * 1.05), c.y + 330 * Math.sin(k * 1.05), 14 + 20 * tw, lt * 2 + k, tw * lg * f, '#ecfccb', 'rgba(190,242,100,0.95)'); } },
};

const blinkF = (t, amt) => { const ph = (t % 3.1) / 0.14; return ph < 1 ? 1 - Math.sin(Math.PI * ph) * 0.92 * amt : 1; };

export function frame(t, i) {
  const cv = createCanvas(1080, 1920), x = cv.getContext('2d');
  x.fillStyle = '#0a0c10'; x.fillRect(0, 0, 1080, 1920);
  const p = at(t), ang = angle(t), b = blinkF(t, p.blink);
  const sx = p.shake * noise1(t * 17, 1), sy = p.shake * noise1(t * 17, 2), bob = -p.bounce * Math.abs(Math.sin(t * p.bf)) + p.sink;
  const sc = p.scale * (1 + p.kick) * (1 + p.breathe * Math.sin(t * 1.8));
  const ctr = p.id === 'overwhelmed' ? 0 : 0;
  x.save(); x.translate(540 + sx, 900 + sy + bob); x.scale(sc, sc);
  // body
  x.save(); x.rotate(ang);
  glow(x, rgb(p.color, p.glow * (0.85 + 0.15 * Math.sin(t * 3))), 60, () => { x.fillStyle = P.panel2; x.fill(BODY); });
  x.strokeStyle = rgb(p.color); x.lineWidth = 12; x.lineJoin = 'round'; x.stroke(BODY);
  x.setLineDash([10, 14]); x.strokeStyle = rgb(p.color, 0.28); x.lineWidth = 4; x.beginPath(); x.arc(0, 0, R * 0.8, 0, 7); x.stroke(); x.setLineDash([]);
  x.restore();
  // face: eyes. overload draws a red/cyan split behind the eyes.
  x.save(); x.rotate(p.head);
  const ec = rgb(p.eye), ltR = p.lidTiltR ?? p.lidTilt;
  const eye = (side, ox, col) => {
    const w = p.w * (side > 0 ? p.wR : 1), h = p.h * (side > 0 ? p.hR : 1) * b, lid = side < 0 ? p.lidL : p.lidR, tilt = side < 0 ? p.tiltL : p.tiltR, lt = side * -p.lidTilt;
    x.save(); x.globalAlpha *= p.ea; x.translate(side * p.gap / 2 + p.lookX + ox, p.dy + p.lookY); x.rotate(tilt);
    if (p.arc < 1) {
      x.save(); x.globalAlpha = 1 - p.arc;
      if (lid > 0) { x.rotate(lt); x.beginPath(); x.rect(-300, -h / 2 + lid * h, 600, 600); x.clip(); x.rotate(-lt); }
      glow(x, rgb(p.eye, 0.75), 30, () => { x.fillStyle = col; x.beginPath(); x.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) / 2); x.fill(); }); x.restore();
    }
    if (p.arc > 0) { x.save(); x.globalAlpha = p.arc; x.strokeStyle = col; x.lineWidth = 22; x.lineCap = 'round'; x.beginPath(); x.arc(0, 18, 46, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); x.restore(); }
    x.restore();
  };
  if (p.id === 'overwhelmed') { [-1, 1].forEach(s => eye(s, 10 * noise1(t * 20, 4), 'rgba(239,68,68,0.7)')); [-1, 1].forEach(s => eye(s, -10 * noise1(t * 20, 6), 'rgba(34,211,238,0.7)')); }
  [-1, 1].forEach(s => eye(s, 0, ec));
  x.restore(); x.restore();
  if (p.id === 'proud') {   // little celebration animations around the body (all pure functions of the local time)
    const lt = p.lt, fade = 1 - prog(lt, 1.95, 2.3), cx0 = 540 + sx, cy0 = 900 + sy + bob;
    const star = (px, py, r, rot, a) => { x.save(); x.translate(px, py); x.rotate(rot); x.globalAlpha = a; glow(x, 'rgba(251,191,36,0.9)', 18, () => { x.fillStyle = '#fde68a'; x.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.24 : r, a2 = (i * Math.PI) / 4 - Math.PI / 2; x[i ? 'lineTo' : 'moveTo'](rr * Math.cos(a2), rr * Math.sin(a2)); } x.closePath(); x.fill(); }); x.restore(); };
    for (let k = 0; k < 7; k++) { const fr = (lt * 0.9 + k / 7) % 1, tw = Math.sin(Math.PI * fr), ang2 = k * 2.4 + lt * 0.35, rad = 330 + 70 * ((k * 37) % 5) / 4; star(cx0 + rad * Math.cos(ang2), cy0 + rad * 0.92 * Math.sin(ang2), 18 + 30 * tw, lt * 0.8 + k, tw * fade * prog(lt, 0.15, 0.5)); }
    const pop = E.outBack(prog(lt, 0.55, 0.9), 2.2); if (pop > 0) { x.save(); x.translate(cx0 + 250, cy0 - 330); x.rotate(0.18 + 0.04 * Math.sin(lt * 9)); x.scale(pop, pop); x.globalAlpha = fade; setFont(x, 'sg', 150, 700); x.textAlign = 'center'; glow(x, 'rgba(251,191,36,0.8)', 24, () => { x.fillStyle = '#fbbf24'; x.fillText('!', 0, 50); }); x.restore(); }
    const hu = prog(lt, 1.0, 2.1); if (hu > 0 && hu < 1) { x.save(); x.translate(cx0 - 230 + 20 * Math.sin(hu * 6), cy0 - 280 - 130 * hu); const hs = 0.8 + 0.4 * E.outBack(prog(hu, 0, 0.25), 2); x.scale(hs, hs); x.globalAlpha = Math.sin(Math.PI * Math.min(1, hu * 1.05)) * fade; glow(x, 'rgba(249,168,212,0.8)', 16, () => { x.fillStyle = '#f9a8d4'; x.beginPath(); x.moveTo(0, 22); x.bezierCurveTo(-46, -8, -26, -40, 0, -18); x.bezierCurveTo(26, -40, 46, -8, 0, 22); x.fill(); }); x.restore(); }
  }
  { const lt0 = p.lt, ff = fx.fade(lt0), fn = FX[p.id]; if (fn && p.id !== 'proud') { x.save(); fn(x, { x: 540 + sx, y: 900 + sy + bob }, lt0, ff, p); x.restore(); } }
  if (p.id === 'asleep') { const lt = p.lt; for (let k = 0; k < 3; k++) { const u = ((lt * 0.55 + k / 3) % 1), zx = 150 + 80 * u + k * 10, zy = -150 - 190 * u; x.save(); x.globalAlpha = Math.sin(Math.PI * u) * 0.85; setFont(x, 'mono', 44 + 30 * u, 600); x.fillStyle = rgb(p.eye); x.textAlign = 'center'; x.fillText('z', 540 + zx, 900 + zy); x.restore(); } }
  setFont(x, 'mono', 48, 500); x.fillStyle = P.muted; x.textAlign = 'center'; x.fillText(EMS[seg(t)].label, 540, 1360);
  return cv;
}
