// PORT of TikTok demo card tt10_ops_hr (2026-10-27) to the Annie engine (2026-11-19, t6.2). Original:
//   Reports/Agents/VP_AEON/2026-10-27/Assets_Icons_Media/TikTok_Demos/source/cards/tt10_ops_hr.mjs
// Changes from the original, nothing else: imports come from the engine (palette P as BGI, hook as drawCaption, icon, closer);
// the local lucide loader is gone (engine icon); frame(t, i) has no log argument; the renderer dithers, so the card does not;
// the end card is the engine closer (no "Request a consultation at" lead line); META carries brand 'bgi'.
// Every animation, timing and claim is the original's. 16.5 s, 495 frames.
import { P as BGI, E, clamp, lerp, prog, rgba, rng, createCanvas, setFont, textW, hook as drawCaption, icon, closer } from '../../../engine/index.mjs';

const W = 1080, H = 1920, DUR = 16.5;
export const META = { W, H, fps: 30, frames: Math.round(DUR * 30), coverT: 1.2, brand: 'bgi' };

// ---------------------------------------------------------------- timeline (seconds)
// the spreadsheet is up from frame 0 and scatters at 1.75-2.15; three window pages follow, each sliding in over 0.4 s
// and out over its last 0.35 s, overlapping the next by 0.1 s
// review 10-27: the hook is gone (1.9) before the first header comes in (1.95); the end card holds 3.35 s, as tt8's and tt9's
const T = { hookOut: 1.7, scatter: [1.75, 2.15], end: 13.15 }; // end card 13.15 -> 16.5
const PAGES = [{ s: 1.9, e: 5.0 }, { s: 4.9, e: 9.65 }, { s: 9.55, e: 13.25 }];

// ---------------------------------------------------------------- layout (text y 270-1240; below y 800 it ends by x 930)
const KICK = { y: 300, text: 'BROKEN GEAR INDUSTRIES' };
const HOOK = { tIn: -0.12, tOut: T.hookOut, l1: 'Outgrew your', l2: 'spreadsheets?', c1: '#ffffff', c2: BGI.green, b1: 470, b2: 580,
  px: 104, align: 'center', cx: 540, glint: [0.5, 1.1] };
const HEADS = [['We build the tool', 'that replaces them.'], ['Fixed scope.', 'One flat price, agreed up front.'], ['Ops and HR tools.', 'Pay once. Own them.']]
  .map(([l1, l2], i) => ({ tIn: PAGES[i].s + 0.05, tOut: PAGES[i].e - 0.3, l1, l2, c1: '#ffffff', c2: BGI.green, b1: 446, b2: 514, px: 56, align: 'center', cx: 540 }));
const WIN = { x: 72, y: 660, w: 936, h: 580, bar: 72 }, IN = { x0: 96, x1: 984 }, TX = 210;
const TITLES = ['tracker_FINAL_v7 (2).xlsx', 'Field check-in', 'How it works', 'What we build'];
const RED = '#ff4d6d', AMBER = '#f5a524', INK = '#04140c';

const STEPS = [
  { no: '01', name: 'Conversation' },
  { no: '02', name: 'Scope and price' },
  { no: '03', name: 'Build and review', sub: 'Working software early.' },
  { no: '04', name: 'Handoff' },
];
const BUILDS = [
  { ic: 'clipboard-check', name: 'Field check-in' },
  { ic: 'file-pen-line', name: 'Document intake' },
  { ic: 'package-check', name: 'Inventory ledgers' },
  { ic: 'users', name: 'Applicant pipelines' },
];

function text(ctx, s, x, y, fam, px, wght, color, align = 'left', track = 0) {
  setFont(ctx, fam, px, wght, track); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y);
}

// ---------------------------------------------------------------- background and kicker (as tt8 / tt9)
function background(ctx, t) {
  ctx.fillStyle = BGI.bg; ctx.fillRect(0, 0, W, H);
  const off = (t * 10) % 40;
  ctx.fillStyle = rgba(BGI.green, 0.035);
  for (let x = -40 + off; x < W; x += 40) ctx.fillRect(Math.round(x), 0, 1, H);
  for (let y = -40 + off; y < H; y += 40) ctx.fillRect(0, Math.round(y), W, 1);
  const v = ctx.createRadialGradient(540, 900, 200, 540, 900, 1250); v.addColorStop(0, 'rgba(10,12,16,0)'); v.addColorStop(1, 'rgba(10,12,16,0.92)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
function kicker(ctx, t) {
  const a = 1 - prog(t, T.end - 0.1, T.end + 0.3); if (a <= 0.001) return;
  ctx.save(); ctx.globalAlpha *= a; text(ctx, KICK.text, 540 + 42 * 0.07, KICK.y, 'inter', 42, 650, BGI.green, 'center', 0.14); ctx.restore();
}

// ---------------------------------------------------------------- the window; its title crossfades with each page
function titleAt(t) { // [title index, alpha]; a title changes only once the page before it has gone (review 10-27)
  const bounds = [-1, T.scatter[1], PAGES[0].e, PAGES[1].e];
  let i = 0; for (let j = 1; j < 4; j++) if (t >= bounds[j]) i = j;
  return [i, E.outCubic(prog(t, bounds[i], bounds[i] + 0.3)) || (i === 0 ? 1 : 0)];
}
function windowFrame(ctx, t) {
  ctx.fillStyle = BGI.panel; ctx.beginPath(); ctx.roundRect(WIN.x, WIN.y, WIN.w, WIN.h, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(WIN.x + 1, WIN.y + 1, WIN.w - 2, WIN.h - 2, 21); ctx.stroke();
  ctx.fillStyle = BGI.panel2; ctx.beginPath(); ctx.roundRect(WIN.x + 2, WIN.y + 2, WIN.w - 4, WIN.bar - 2, [20, 20, 0, 0]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(WIN.x, WIN.y + WIN.bar, WIN.w, 2);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(WIN.x + 40 + i * 30, WIN.y + WIN.bar / 2, 9, 0, Math.PI * 2); ctx.fill(); });
  const [i, a] = titleAt(t);
  ctx.save(); ctx.globalAlpha *= a; text(ctx, TITLES[i], 540, WIN.y + WIN.bar / 2 + 15, 'inter', 42, 600, i === 0 ? BGI.muted : BGI.white, 'center'); ctx.restore();
}
function pageK(t, p) {
  if (t < p.s || t > p.e) return null;
  const i = E.outCubic(prog(t, p.s, p.s + 0.4)), o = E.inCubic(prog(t, p.e - 0.35, p.e));
  return [Math.min(i, 1 - o), 160 * (1 - i) - 160 * o];
}

// ---------------------------------------------------------------- page 0 (the hook): a spreadsheet nobody can keep up with
const COLS = [56, 160, 190, 150, 170, 162], ROWS = 9, ROW_H = 48, GRID_Y = 744;
const CELLS = (() => { const r = rng(20261027), out = [];
  for (let row = -1; row < ROWS; row++) { let x = IN.x0;
    COLS.forEach((w, c) => { out.push({ row, c, x, w, bw: (row < 0 ? 0.35 : c === 0 ? 0.3 : 0.3 + 0.6 * r()) * (w - 28), vx: (r() - 0.5) * 900, vy: (r() - 0.6) * 700, spin: (r() - 0.5) * 1.2 }); x += w; });
  } return out; })();
const HOT = [[1, 2, RED], [3, 4, AMBER], [5, 1, RED], [6, 5, AMBER], [8, 3, RED]]; // cells that blink
const PILE = [ // mail and paper piling onto the window
  { ic: 'mail', x: 150, y: 700, r: -0.12, ph: 0.0 }, { ic: 'file-text', x: 900, y: 690, r: 0.10, ph: 1.3 },
  { ic: 'mail', x: 860, y: 1010, r: 0.14, ph: 2.1 }, { ic: 'sheet', x: 205, y: 1150, r: -0.08, ph: 0.7 }, { ic: 'mail', x: 560, y: 1205, r: 0.05, ph: 2.9 },
];
function pageSheet(ctx, t) {
  const sc = E.inCubic(prog(t, ...T.scatter)); if (sc >= 1) return;
  CELLS.forEach(cell => {
    const y = cell.row < 0 ? GRID_Y : GRID_Y + 46 + cell.row * ROW_H, h = cell.row < 0 ? 46 : ROW_H;
    const jit = cell.row >= 0 && cell.row % 3 === 1 ? 4 * Math.sin(t * 13 + cell.row) : 0;
    ctx.save(); ctx.globalAlpha *= 1 - sc;
    ctx.translate(cell.x + cell.w / 2 + jit + cell.vx * sc, y + h / 2 + cell.vy * sc); ctx.rotate(cell.spin * sc);
    const hot = HOT.find(([r, c]) => r === cell.row && c === cell.c);
    ctx.fillStyle = cell.row < 0 ? rgba(BGI.green, 0.10) : hot && Math.sin(t * 9 + cell.c) > 0 ? rgba(hot[2], 0.30) : 'rgba(255,255,255,0.015)';
    ctx.fillRect(-cell.w / 2, -h / 2, cell.w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.strokeRect(-cell.w / 2 + 0.5, -h / 2 + 0.5, cell.w - 1, h - 1);
    ctx.fillStyle = cell.row < 0 ? rgba(BGI.green, 0.55) : cell.c === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(203,213,225,0.38)';
    ctx.beginPath(); ctx.roundRect(-cell.w / 2 + 14, -6, cell.bw, 12, 6); ctx.fill();
    ctx.restore();
  });
  // the cell cursor jumps every 0.3 s
  if (sc < 0.2) { // it fades as the cells start to fly, rather than outlining empty space
    const r = rng(1000 + Math.floor(t / 0.3)), row = Math.floor(r() * ROWS), c = 1 + Math.floor(r() * 5), cell = CELLS.find(q => q.row === row && q.c === c);
    ctx.save(); ctx.globalAlpha *= 1 - sc / 0.2;
    ctx.strokeStyle = BGI.green; ctx.lineWidth = 3; ctx.strokeRect(cell.x + 1.5, GRID_Y + 46 + row * ROW_H + 1.5, cell.w - 3, ROW_H - 3);
    ctx.restore();
  }
  PILE.forEach((p, i) => { // each lands in turn (0.15 s apart from frame 0), bobs, then flies off with the cells
    const land = E.outBack(prog(t, -0.3 + 0.15 * i, 0.05 + 0.15 * i), 1.6), bob = 6 * Math.sin(t * 4 + p.ph);
    ctx.save(); ctx.globalAlpha *= 1 - sc;
    ctx.translate(p.x + (p.x - 540) * 1.4 * sc, p.y + bob - 60 * (1 - land) + 400 * sc); ctx.rotate(p.r + 1.2 * sc * Math.sign(p.x - 540)); ctx.scale(land, land);
    ctx.fillStyle = BGI.panel2; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-46, -46, 92, 92, 18); ctx.fill(); ctx.stroke();
    icon(ctx, p.ic, -26, -26, 52, p.ic === 'sheet' ? BGI.green : BGI.text, 2);
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(40, -40, 13, 0, Math.PI * 2); ctx.fill(); // an unread badge
    ctx.restore();
  });
}

// ---------------------------------------------------------------- page 1: a field check-in tool assembles (illustration: no names, no data)
const SIG = (() => { const pts = []; for (let j = 0; j <= 220; j++) { const u = j / 220;
  pts.push([250 + 520 * u + 30 * Math.cos(u * Math.PI * 14), 1052 - 38 * Math.sin(u * Math.PI * 14) * (0.55 + 0.45 * Math.sin(u * 6))]); } return pts; })();
function pageTool(ctx, t, p) {
  const fields = [{ ic: 'map-pin', y: 762, w: 330, k: [0.25, 0.75] }, { ic: 'user', y: 856, w: 270, k: [0.55, 1.05] }];
  fields.forEach(f => {
    const a = E.outCubic(prog(t, p.s + f.k[0] - 0.2, p.s + f.k[0])); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(120, f.y, 840, 74, 14); ctx.stroke();
    icon(ctx, f.ic, 142, f.y + 19, 36, BGI.muted, 2);
    const k = E.outCubic(prog(t, p.s + f.k[0], p.s + f.k[1]));
    ctx.fillStyle = 'rgba(203,213,225,0.55)'; ctx.beginPath(); ctx.roundRect(200, f.y + 31, f.w * k, 12, 6); ctx.fill();
    if (k >= 1) { ctx.fillStyle = BGI.green; ctx.fillRect(920, f.y + 22, 4, 30); }
    ctx.restore();
  });
  // the signature pad, and a signature written across it
  const pa = E.outCubic(prog(t, p.s + 0.75, p.s + 1.0));
  if (pa > 0) {
    ctx.save(); ctx.globalAlpha *= pa;
    ctx.fillStyle = BGI.panel2; ctx.beginPath(); ctx.roundRect(120, 950, 840, 170, 14); ctx.fill();
    icon(ctx, 'pen-line', 142, 970, 36, BGI.muted, 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(200, 1086); ctx.lineTo(920, 1086); ctx.stroke(); ctx.setLineDash([]);
    const n = Math.floor(SIG.length * E.inOutSine(prog(t, p.s + 1.0, p.s + 2.0)));
    if (n > 1) { ctx.strokeStyle = BGI.white; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); SIG.slice(0, n).forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
    ctx.restore();
  }
  // the button presses at s + 2.15 and becomes the confirmation
  const ba = E.outCubic(prog(t, p.s + 1.1, p.s + 1.35)); if (ba <= 0) return;
  const press = Math.sin(Math.PI * prog(t, p.s + 2.05, p.s + 2.25)), done = t >= p.s + 2.15;
  ctx.save(); ctx.globalAlpha *= ba; ctx.translate(540, 1176); ctx.scale(1 - 0.04 * press, 1 - 0.04 * press);
  ctx.fillStyle = BGI.green; ctx.beginPath(); ctx.roundRect(-420, -38, 840, 76, 16); ctx.fill();
  if (done) {
    setFont(ctx, 'inter', 44, 700); const w = 44 + 14 + textW(ctx, 'Checked in');
    icon(ctx, 'circle-check', -w / 2, -22, 44, INK, 2.6); text(ctx, 'Checked in', -w / 2 + 58, 16, 'inter', 44, 700, INK);
  } else text(ctx, 'Check in', 0, 16, 'inter', 44, 700, INK, 'center');
  ctx.restore();
}

// ---------------------------------------------------------------- page 2: how it works, four steps in turn
const STEP_Y = [750, 856, 962, 1106]; // a step with a line under its name gets 144 px, one without 106
function pageSteps(ctx, t, p) {
  // once all four are down, a marker runs 01 -> 04 along the line, again and again: the hold never freezes. It is drawn
  // first, under the opaque number boxes, so it shows only on the dashed line between them (review 10-27: it smudged "04")
  const run = t - (p.s + 0.3 + 0.75 * 3 + 0.4);
  if (run > 0) {
    const u = (run % 1.6) / 1.6, y = lerp(STEP_Y[0] + 35, STEP_Y[3] + 35, E.inOutSine(clamp(u / 0.85)));
    ctx.save(); ctx.globalAlpha *= clamp(run / 0.3) * (1 - prog(u, 0.85, 1)); ctx.fillStyle = BGI.green; ctx.shadowColor = BGI.green; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(146, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  STEPS.forEach((st, i) => {
    const y = STEP_Y[i], k = E.outCubic(prog(t, p.s + 0.3 + 0.75 * i, p.s + 0.7 + 0.75 * i)); if (k <= 0) return;
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(40 * (1 - k), 0);
    if (i < 3) { // the dimension line down to the next step
      const lk = prog(t, p.s + 0.6 + 0.75 * i, p.s + 1.05 + 0.75 * i);
      ctx.strokeStyle = rgba(BGI.green, 0.5); ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(146, y + 72); ctx.lineTo(146, y + 72 + (STEP_Y[i + 1] - y - 72) * lk); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = BGI.panel; ctx.beginPath(); ctx.roundRect(110, y + 4, 72, 62, 12); ctx.fill(); // opaque base: the marker passes under it
    ctx.fillStyle = rgba(BGI.green, 0.12); ctx.strokeStyle = BGI.green; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(110, y + 4, 72, 62, 12); ctx.fill(); ctx.stroke();
    text(ctx, st.no, 146, y + 50, 'mono', 42, 700, BGI.green, 'center');
    text(ctx, st.name, TX, st.sub ? y + 42 : y + 52, 'inter', 52, 650, BGI.white, 'left', -0.01);
    if (st.sub) text(ctx, st.sub, TX, y + 96, 'inter', 42, 500, BGI.muted);
    ctx.restore();
  });
}

// ---------------------------------------------------------------- page 3: what the studio builds
function pageBuilds(ctx, t, p) {
  BUILDS.forEach((b, i) => {
    const y = 752 + 118 * i, k = E.outCubic(prog(t, p.s + 0.15 + 0.14 * i, p.s + 0.55 + 0.14 * i)); if (k <= 0) return;
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(40 * (1 - k), 0);
    // a highlight steps down the list once a second: the hold never freezes
    const hl = Math.max(0, Math.sin(Math.PI * 2 * ((t - p.s) / 2.4 - i / 4))) ** 4;
    ctx.fillStyle = BGI.panel2; ctx.strokeStyle = rgba(BGI.green, 0.45 + 0.5 * hl); ctx.lineWidth = 2 + 1.5 * hl;
    ctx.beginPath(); ctx.roundRect(110, y + 6, 80, 80, 16); ctx.fill(); ctx.stroke();
    icon(ctx, b.ic, 128, y + 24, 44, BGI.green, 2);
    text(ctx, b.name, TX + 20, y + 63, 'inter', 52, 650, BGI.white, 'left', -0.01);
    ctx.restore();
  });
}

// ---------------------------------------------------------------- frame
export function frame(t, i) {
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  background(ctx, t);
  kicker(ctx, t);
  drawCaption(ctx, HOOK, t);
  const wa = 1 - prog(t, T.end - 0.1, T.end + 0.3); // the window leaves with the kicker as the end card comes up
  if (wa > 0.001) {
    ctx.save(); ctx.globalAlpha = wa; windowFrame(ctx, t);
    ctx.save(); ctx.beginPath(); ctx.rect(WIN.x + 2, WIN.y + WIN.bar + 2, WIN.w - 4, WIN.h - WIN.bar - 4); ctx.clip();
    [pageTool, pageSteps, pageBuilds].forEach((fn, i) => {
      const pk = pageK(t, PAGES[i]); if (!pk) return;
      ctx.save(); ctx.globalAlpha *= pk[0]; ctx.translate(pk[1], 0); fn(ctx, t, PAGES[i]); ctx.restore();
    });
    ctx.restore();
    pageSheet(ctx, t); // unclipped: the pile and the scattering cells fly past the window's edges
    ctx.restore();
  }
  HEADS.forEach(h => drawCaption(ctx, h, t));
  closer(ctx, t, T.end, { brand: 'bgi' }); // engine closer (the original's endCard adds a "Request a consultation at" lead line the engine closer does not have)
  return cv;
}
export const TIMES = { ...T, PAGES };
