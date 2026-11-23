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
  if (p.id === 'asleep') { const lt = p.lt; for (let k = 0; k < 3; k++) { const u = ((lt * 0.55 + k / 3) % 1), zx = 150 + 80 * u + k * 10, zy = -150 - 190 * u; x.save(); x.globalAlpha = Math.sin(Math.PI * u) * 0.85; setFont(x, 'mono', 44 + 30 * u, 600); x.fillStyle = rgb(p.eye); x.textAlign = 'center'; x.fillText('z', 540 + zx, 900 + zy); x.restore(); } }
  setFont(x, 'mono', 48, 500); x.fillStyle = P.muted; x.textAlign = 'center'; x.fillText(EMS[seg(t)].label, 540, 1360);
  return cv;
}
