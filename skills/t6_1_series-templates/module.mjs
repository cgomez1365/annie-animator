// t6.1 series-templates: one JSON script -> a whole series of cards that look the same.
// Layout (all y in the 1080x1920 frame): lesson badge y 262-330 (pill) + dots y 366; hook outside the window (baselines 470/580);
// the window at x 72 y 660 w 936 h 580 is the teaching space; progress bar y 1290; the engine closer at the end.
import fs from 'node:fs';
import path from 'node:path';
import {
  P, SAFE, claimViolations, E, prog, lerp, clamp, rgba, pages, page, setFont, textW, fitText, wrapText, roundRect, clipRect,
  begin, end, hook, windowFrame, windowInner, icon,
} from '../../engine/index.mjs';

/** The window every template page lives in. */
export const WIN = { x: 72, y: 660, w: 936, h: 580 };
/** Where text may sit inside the window: right edge 930 keeps clear of the action rail (x >= 940). */
export const TEXT_X1 = 930;
/** Seconds the engine closer needs after closerAt. */
export const CLOSER_LEN = 3.1;
export const HOOK_IN = 0.15, HOOK_LEN = 1.45, FIRST_PAGE = 1.6, MAX_ITEMS = 4;
const LUCIDE = process.env.ANNIE_LUCIDE || '/Users/cris/Desktop/AEON-wt-deps/node_modules/lucide-react/dist/esm/icons';
const TX = 210;

// ------------------------------------------------------------------ small drawing helpers
const text = (ctx, s, x, y, fam, px, wght, color, align = 'left', track = 0) => { setFont(ctx, fam, px, wght, track); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); };
/** Text that shrinks to fit maxW but never under 42 px (the checker's floor). Returns the size used. */
function fitDraw(ctx, s, x, y, maxW, o) { const px = fitText(ctx, s, { fam: o.fam || 'inter', wght: o.wght, maxW, maxPx: o.px, minPx: 42 }); ctx.fillStyle = o.color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); return px; }

// ------------------------------------------------------------------ the page types
// Each type: { dur(page) seconds, validate(page) problems[], draw(ctx, t, p, win) } where p = { s, e } window times of the page.
const rowHs = items => items.map(it => (items.length <= 3 ? 136 : 106) + (it.s ? 38 : 0)); // 3 or fewer items breathe: 136 px rows

const steps = {
  dur: pg => 0.3 + 0.55 * (pg.items.length - 1) + 0.4 + (pg.hold ?? 1.1),
  validate(pg, out) {
    if (pg.items.length > MAX_ITEMS) out(`steps: at most ${MAX_ITEMS} items`);
    const h = rowHs(pg.items).reduce((a, b) => a + b, 0); if (h > 480) out(`steps: items are ${h}px tall, the window holds 480 (drop a sub line)`);
    pg.items.forEach((it, i) => { if (widthAt(it.t, 52, 650, TEXT_X1 - TX, 42) < 0) out(`steps item ${i + 1} "${it.t}" is too wide even at 42 px`); if (it.s && widthAt(it.s, 42, 500, TEXT_X1 - TX, 42) < 0) out(`steps item ${i + 1} sub line is too wide`); });
  },
  draw(ctx, t, p) {
    const hs = rowHs(p.items), ys = hs.map((_, i) => 756 + hs.slice(0, i).reduce((a, b) => a + b, 0)), n = p.items.length;
    const run = t - (p.s + 0.3 + 0.55 * (n - 1) + 0.4); // a marker runs 01 -> last on the dashed line, again and again
    if (run > 0 && n > 1) { const u = (run % 1.5) / 1.5, y = lerp(ys[0] + 35, ys[n - 1] + 35, E.inOutSine(clamp(u / 0.85)));
      ctx.save(); ctx.globalAlpha *= clamp(run / 0.3) * (1 - prog(u, 0.85, 1)); ctx.fillStyle = P.green; ctx.shadowColor = P.green; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(146, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    p.items.forEach((it, i) => {
      const y = ys[i], k = E.outCubic(prog(t, p.s + 0.3 + 0.55 * i, p.s + 0.7 + 0.55 * i)); if (k <= 0) return;
      ctx.save(); ctx.globalAlpha *= k; ctx.translate(40 * (1 - k), 0);
      if (i < n - 1) { const lk = prog(t, p.s + 0.5 + 0.55 * i, p.s + 0.9 + 0.55 * i); ctx.strokeStyle = rgba(P.green, 0.5); ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(146, y + 72); ctx.lineTo(146, y + 72 + (ys[i + 1] - y - 72) * lk); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = P.panel; roundRect(ctx, 110, y + 4, 72, 62, 12).fill(); ctx.fillStyle = rgba(P.green, 0.12); ctx.strokeStyle = P.green; ctx.lineWidth = 2.5; roundRect(ctx, 110, y + 4, 72, 62, 12).fill(); ctx.stroke();
      text(ctx, String(i + 1).padStart(2, '0'), 146, y + 50, 'mono', 42, 700, P.green, 'center');
      fitDraw(ctx, it.t, TX, it.s ? y + 42 : y + 52, TEXT_X1 - TX, { px: 52, wght: 650, color: P.white });
      if (it.s) fitDraw(ctx, it.s, TX, y + 96, TEXT_X1 - TX, { px: 42, wght: 500, color: P.muted });
      ctx.restore();
    });
  },
};

const list = {
  dur: pg => 0.15 + 0.14 * (pg.items.length - 1) + 0.4 + (pg.hold ?? 1.7),
  validate(pg, out) {
    if (pg.items.length > MAX_ITEMS) out(`list: at most ${MAX_ITEMS} items`);
    pg.items.forEach((it, i) => { if (!it.icon || !fs.existsSync(`${LUCIDE}/${it.icon}.mjs`)) out(`list item ${i + 1}: icon "${it.icon}" is not a lucide icon file`); if (widthAt(it.t, 52, 650, TEXT_X1 - (TX + 20), 42) < 0) out(`list item ${i + 1} "${it.t}" is too wide even at 42 px`); });
  },
  draw(ctx, t, p) {
    p.items.forEach((it, i) => {
      const y = 752 + 118 * i, k = E.outCubic(prog(t, p.s + 0.15 + 0.14 * i, p.s + 0.55 + 0.14 * i)); if (k <= 0) return;
      ctx.save(); ctx.globalAlpha *= k; ctx.translate(40 * (1 - k), 0);
      const hl = Math.max(0, Math.sin(Math.PI * 2 * ((t - p.s) / 2.4 - i / p.items.length))) ** 4; // a highlight steps down the list: the hold never freezes
      ctx.fillStyle = P.panel2; ctx.strokeStyle = rgba(P.green, 0.45 + 0.5 * hl); ctx.lineWidth = 2 + 1.5 * hl; roundRect(ctx, 110, y + 6, 80, 80, 16).fill(); ctx.stroke();
      icon(ctx, it.icon, 128, y + 24, 44, P.green, 2);
      fitDraw(ctx, it.t, TX + 20, y + 63, TEXT_X1 - (TX + 20), { px: 52, wght: 650, color: P.white });
      ctx.restore();
    });
  },
};

const checklist = {
  dur: pg => 0.3 + 0.45 * (pg.items.length - 1) + 0.5 + (pg.hold ?? 1.1),
  validate(pg, out) {
    if (pg.items.length > MAX_ITEMS) out(`checklist: at most ${MAX_ITEMS} items`);
    pg.items.forEach((it, i) => { if (widthAt(it.t, 52, 650, TEXT_X1 - 220, 42) < 0) out(`checklist item ${i + 1} "${it.t}" is too wide even at 42 px`); });
  },
  draw(ctx, t, p) {
    const n = p.items.length, done = p.s + 0.3 + 0.45 * (n - 1) + 0.5;
    p.items.forEach((it, i) => {
      const y = 770 + 124 * i, t0 = p.s + 0.3 + 0.45 * i, k = E.outCubic(prog(t, t0 - 0.2, t0)); if (k <= 0) return;
      ctx.save(); ctx.globalAlpha *= k; ctx.translate(40 * (1 - k), 0);
      const tk = prog(t, t0, t0 + 0.35), pop = E.outBack(tk, 2.2), sweep = Math.max(0, Math.sin(Math.PI * 2 * ((t - done) / 2.0 - i / n))) ** 4 * (t > done ? 1 : 0);
      ctx.fillStyle = P.panel2; ctx.strokeStyle = tk > 0 ? P.green : 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3 + 1.5 * sweep; roundRect(ctx, 120, y, 72, 72, 16).fill(); ctx.stroke();
      if (tk > 0) { ctx.save(); ctx.translate(156, y + 36); ctx.scale(Math.max(0.01, pop), Math.max(0.01, pop)); ctx.strokeStyle = P.green; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const q = E.outCubic(tk); ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(-17 + 11 * clamp(q * 2), 0 + 11 * clamp(q * 2)); if (q > 0.5) ctx.lineTo(-6 + 24 * (q - 0.5) * 2, 11 - 28 * (q - 0.5) * 2); ctx.stroke(); ctx.restore(); }
      fitDraw(ctx, it.t, 220 + 20, y + 52, TEXT_X1 - 240, { px: 52, wght: 650, color: tk > 0 ? P.white : P.text });
      ctx.restore();
    });
  },
};

const compare = {
  dur: pg => 0.3 + 0.7 + 0.25 * Math.max(pg.left.lines.length, pg.right.lines.length) + (pg.hold ?? 1.2),
  validate(pg, out) {
    const m = createMeasure();
    for (const [side, c] of [['left', pg.left], ['right', pg.right]]) {
      if (!c || !c.head || !Array.isArray(c.lines)) { out(`compare.${side} needs head and lines[]`); continue; }
      if (c.lines.length > 3) out(`compare.${side}: at most 3 lines`);
      c.lines.forEach(l => { const w = m.wrap(l, 44, 600, 330); if (w.length > 2) out(`compare.${side} line "${l}" wraps to ${w.length} lines at 44 px (330 px wide): shorten it`); });
    }
  },
  draw(ctx, t, p) {
    [['left', 110, P.red, 'x', -1], ['right', 540, P.green, 'check', 1]].forEach(([side, x, col, ic, dir], si) => {
      const c = p[side], k = E.outBack(prog(t, p.s + 0.3 + 0.2 * si, p.s + 0.8 + 0.2 * si), 1.6); if (k <= 0) return;
      ctx.save(); ctx.globalAlpha *= clamp(k * 1.5); ctx.translate(dir * 50 * (1 - k), 0);
      ctx.fillStyle = P.panel2; ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 2.5; roundRect(ctx, x, 770, 390, 350, 20).fill(); ctx.stroke();
      icon(ctx, ic, x + 24, 796, 56, col, 3); text(ctx, c.head.toUpperCase(), x + 96, 840, 'mono', 42, 700, col);
      let y = 922; c.lines.forEach((l, li) => { const lk = E.outCubic(prog(t, p.s + 0.7 + 0.25 * li + 0.2 * si, p.s + 1.0 + 0.25 * li + 0.2 * si)); ctx.save(); ctx.globalAlpha *= lk; ctx.translate(0, 14 * (1 - lk));
        const m = createMeasure(); m.wrap(l, 44, 600, 330).forEach(ln => { text(ctx, ln, x + 30, y, 'inter', 44, 600, P.white); y += 56; }); ctx.restore(); y += 16; });
      ctx.restore();
    });
    const k = E.outBack(prog(t, p.s + 0.9, p.s + 1.3), 2); // a turning cog between the panels: the page keeps moving
    if (k > 0) { ctx.save(); ctx.translate(520, 1100); ctx.scale(k, k); ctx.rotate((t - p.s) * 1.1); ctx.fillStyle = P.bg; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill(); icon(ctx, 'cog', -20, -20, 40, P.white, 2.2); ctx.restore(); }
  },
};
/** The page types a series script can use. @type {Record<string,{dur:Function,validate:Function,draw:Function}>} */
export const PAGE_TYPES = { steps, list, checklist, compare };

// ------------------------------------------------------------------ measuring (validation needs text widths)
let _m; function createMeasure() {
  if (_m) return _m;
  const cv = begin(0, { dust: false, kicker: false }).cv, ctx = cv.getContext('2d');
  _m = { wrap: (s, px, wght, maxW) => { setFont(ctx, 'inter', px, wght); return wrapText(ctx, s, maxW); }, width: (s, px, wght, fam = 'inter') => { setFont(ctx, fam, px, wght); return ctx.measureText(s).width; } };
  return _m;
}
/** The size (px) a line needs to fit maxW starting at maxPx, or -1 if even minPx is too wide. */
function widthAt(s, maxPx, wght, maxW, minPx) { const m = createMeasure(); for (let px = maxPx; px >= minPx; px--) if (m.width(s, px, wght) <= maxW) return px; return -1; }

// ------------------------------------------------------------------ the script format and its checks
/**
 * Check a series script. Returns { ok, problems[] } with plain-words problems naming the episode and page.
 * Script: { id, name, brand:'bgi'|'aeon', unit?:'LESSON', total, episodes:[{ n, hook:[l1,l2], pages:[{ type:'steps|list|checklist|compare', title, header:[l1,l2], items|left|right, hold? }] }] }
 * @param {object} series @returns {{ok:boolean, problems:string[]}}
 */
export function validateSeries(series) {
  const problems = [], add = (ep, m) => problems.push(`${ep}: ${m}`);
  if (!series || !Array.isArray(series.episodes) || !series.episodes.length) return { ok: false, problems: ['series.episodes must be a list'] };
  if (!['bgi', 'aeon'].includes(series.brand)) problems.push('series.brand must be "bgi" or "aeon"');
  if (!(series.total >= series.episodes.length)) problems.push('series.total must be at least the number of episodes');
  const seen = new Set(), m = createMeasure();
  series.episodes.forEach(ep => {
    const id = `episode ${ep.n}`; if (seen.has(ep.n)) add(id, 'duplicate n'); seen.add(ep.n);
    if (!(ep.n >= 1 && ep.n <= series.total)) add(id, 'n must be between 1 and series.total');
    if (!ep.hook || ep.hook.length !== 2) add(id, 'hook needs two lines [l1, l2]'); else ep.hook.forEach(l => { if (m.width(l, 104, 700, 'sg') > 880) add(id, `hook line "${l}" is wider than 880 px at 104 px`); });
    if (!ep.pages || !ep.pages.length) { add(id, 'needs at least one page'); return; }
    ep.pages.forEach((pg, pi) => {
      const pid = `${id} page ${pi + 1}`, type = PAGE_TYPES[pg.type]; if (!type) { add(pid, `unknown type "${pg.type}" (use ${Object.keys(PAGE_TYPES).join(', ')})`); return; }
      if (!pg.header || pg.header.length !== 2) add(pid, 'header needs two lines'); else pg.header.forEach(l => { if (m.width(l, 56, 700, 'sg') > 880) add(pid, `header line "${l}" is wider than 880 px at 56 px`); });
      if (!pg.title) add(pid, 'title (the window title) is missing');
      if (!pg.items && pg.type !== 'compare') add(pid, 'items[] is missing');
      type.validate(pg, msg => add(pid, msg));
    });
    for (const s of strings(ep)) { const bad = claimViolations(s); if (bad.length) add(id, `"${s}" breaks a claim rule: ${bad.join(', ')}`); }
  });
  return { ok: problems.length === 0, problems };
}
function strings(o, out = []) { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach(x => strings(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k !== 'type' && k !== 'icon') strings(v, out); return out; }

// ------------------------------------------------------------------ the plan: every time in one place
/**
 * Compute an episode's times. Hook 0.15-1.6 s, window pages overlap by 0.1 s (slide in 0.4 s, out 0.35 s), the closer starts 0.1 s
 * before the last page ends, and the card lasts closerAt + 3.1 s.
 * @returns {{hookIn:number,hookOut:number,pages:{s:number,e:number,page:object}[],closerAt:number,seconds:number,frames:number}}
 */
export function planEpisode(ep) {
  const durs = ep.pages.map(pg => pg.dur ?? PAGE_TYPES[pg.type].dur(pg)), pw = pages(durs, { t0: FIRST_PAGE, overlap: 0.1 });
  const closerAt = Math.round((pw[pw.length - 1].e - 0.1) * 30) / 30, frames = Math.ceil((closerAt + CLOSER_LEN) * 30);
  return { hookIn: HOOK_IN, hookOut: FIRST_PAGE - 0.2, pages: pw.map((w, i) => ({ s: w.s, e: w.e, page: ep.pages[i] })), closerAt, seconds: frames / 30, frames };
}

// ------------------------------------------------------------------ badge, dots, progress bar
/** The lesson badge: a pill ("LESSON 2 OF 5") that drops in with outBack, a row of progress dots (done = green, now = pulsing ring, to come = dim). */
export function drawBadge(ctx, t, { n, total, unit = 'LESSON' }, closerAt) {
  const a = (1 - prog(t, closerAt - 0.1, closerAt + 0.3)); if (a <= 0.001) return;
  const label = `${unit} ${n} OF ${total}`; setFont(ctx, 'mono', 42, 700, 0.06); const w = ctx.measureText(label).width + 64, k = E.outBack(prog(t, 0.05, 0.5), 1.8), y = 262 + 30 * (1 - k);
  ctx.save(); ctx.globalAlpha *= a * clamp(k * 2);
  ctx.fillStyle = rgba(P.green, 0.10); ctx.strokeStyle = rgba(P.green, 0.55); ctx.lineWidth = 2.5; roundRect(ctx, 540 - w / 2, y, w, 68, 34).fill(); ctx.stroke();
  text(ctx, label, 540 + 1.5, y + 47, 'mono', 42, 700, P.green, 'center', 0.06); ctx.restore();
  const dotsN = Math.min(total, 12), gap = 38, x0 = 540 - ((dotsN - 1) * gap) / 2, y2 = 366;
  if (total <= 12) for (let i = 0; i < total; i++) {
    const dk = E.outBack(prog(t, 0.35 + 0.04 * i, 0.7 + 0.04 * i), 2), x = x0 + i * gap, cur = i === n - 1, done = i < n - 1, r = (cur ? 9 : 6.5) * dk;
    if (dk <= 0) continue; ctx.save(); ctx.globalAlpha *= a;
    if (cur) { const pu = 0.5 + 0.5 * Math.sin(t * 5); ctx.strokeStyle = rgba(P.green, 0.25 + 0.45 * pu); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y2, 15 + 3 * pu, 0, 7); ctx.stroke(); }
    ctx.fillStyle = cur || done ? P.green : P.dim; ctx.beginPath(); ctx.arc(x, y2, Math.max(0.1, r), 0, 7); ctx.fill(); ctx.restore();
  } else { // long series: a rail with a knob
    ctx.save(); ctx.globalAlpha *= a; const L = 440, f = (n - 1) / (total - 1); ctx.fillStyle = P.dim; roundRect(ctx, 540 - L / 2, y2 - 3, L, 6, 3).fill(); ctx.fillStyle = P.green; roundRect(ctx, 540 - L / 2, y2 - 3, Math.max(6, L * f), 6, 3).fill();
    const pu = 0.5 + 0.5 * Math.sin(t * 5); ctx.beginPath(); ctx.arc(540 - L / 2 + L * f, y2, 9 + 2 * pu, 0, 7); ctx.fill(); ctx.restore();
  }
}
/** The progress bar under the window (y 1290, x 72-1008): fills with time, a bright glint travels along the filled part. */
export function drawProgress(ctx, t, closerAt) {
  const a = E.outCubic(prog(t, FIRST_PAGE, FIRST_PAGE + 0.4)) * (1 - prog(t, closerAt - 0.1, closerAt + 0.3)); if (a <= 0.001) return;
  const x = 72, w = 936, f = clamp((t - FIRST_PAGE) / (closerAt - FIRST_PAGE));
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = 'rgba(255,255,255,0.10)'; roundRect(ctx, x, 1286, w, 10, 5).fill();
  if (f > 0) { ctx.fillStyle = P.green; roundRect(ctx, x, 1286, Math.max(10, w * f), 10, 5).fill();
    const g = x + ((t * 520) % (Math.max(60, w * f) + 80)) - 40; ctx.save(); clipRect(ctx, x, 1286, Math.max(10, w * f), 10, 5); const gr = ctx.createLinearGradient(g - 40, 0, g + 40, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(g - 40, 1286, 80, 10); ctx.restore(); }
  ctx.restore();
}

// ------------------------------------------------------------------ the card
/**
 * Build a card ({ META, frame }) for one episode of a series. frame(t) is a pure function of t.
 * @param {object} series a validated series script @param {number} n episode number (1-based, the script's own n)
 */
export function makeCard(series, n) {
  const ep = series.episodes.find(e => e.n === n); if (!ep) throw new Error(`no episode ${n}`);
  const plan = planEpisode(ep), meta = { W: 1080, H: 1920, fps: 30, frames: plan.frames, coverT: Math.min(plan.hookIn + 1.0, plan.closerAt) };
  if (series.brand === 'aeon') meta.brand = 'aeon';
  const HOOK = { tIn: plan.hookIn, tOut: plan.hookOut, l1: ep.hook[0], l2: ep.hook[1], c1: P.white, c2: P.green, b1: 470, b2: 580, px: 104, glint: [0.6, 1.2] };
  const HEADS = plan.pages.map(w => ({ tIn: w.s + 0.05, tOut: w.e - 0.3, l1: w.page.header[0], l2: w.page.header[1], c1: P.white, c2: P.green, b1: 446, b2: 514, px: 56 }));
  function frame(t) {
    const { cv, ctx } = begin(t, { closerAt: plan.closerAt, kicker: false });
    drawBadge(ctx, t, { n: ep.n, total: series.total, unit: series.unit }, plan.closerAt);
    hook(ctx, HOOK, t);
    if (t < plan.hookOut + 0.2) { // the hook's own mover: a green scan line under line 2 (a hold is never still)
      const a = E.outCubic(prog(t, 0.5, 0.8)) * (1 - prog(t, plan.hookOut, plan.hookOut + 0.2)); if (a > 0) { ctx.save(); ctx.globalAlpha *= a * 0.9; const u = (t * 0.9) % 1, x = 270 + 540 * u; const g = ctx.createLinearGradient(x - 110, 0, x + 110, 0); g.addColorStop(0, rgba(P.green, 0)); g.addColorStop(0.5, rgba(P.green, 1)); g.addColorStop(1, rgba(P.green, 0)); ctx.fillStyle = g; ctx.fillRect(270, 642, 540, 6); ctx.restore(); } }
    drawProgress(ctx, t, plan.closerAt);
    const wi = E.outCubic(prog(t, FIRST_PAGE, FIRST_PAGE + 0.4)), wo = 1 - prog(t, plan.closerAt - 0.1, plan.closerAt + 0.3);
    if (wi > 0 && wo > 0.001) {
      ctx.save(); ctx.globalAlpha *= wi * wo; ctx.translate(0, 80 * (1 - wi));
      const bounds = plan.pages.map((w, i) => (i === 0 ? FIRST_PAGE : plan.pages[i - 1].e)); let ti = 0; bounds.forEach((b, i) => { if (t >= b) ti = i; });
      windowFrame(ctx, { ...WIN, title: plan.pages[ti].page.title, titleAlpha: ti === 0 ? 1 : E.outCubic(prog(t, bounds[ti], bounds[ti] + 0.3)) });
      ctx.save(); clipRect(ctx, ...windowInner(WIN));
      plan.pages.forEach(w => { const pg = page(t, w); if (!pg) return; ctx.save(); ctx.globalAlpha *= pg.a; ctx.translate(pg.dx, 0); PAGE_TYPES[w.page.type].draw(ctx, t, { ...w.page, s: w.s, e: w.e }); ctx.restore(); });
      ctx.restore(); ctx.restore();
    }
    HEADS.forEach(h => hook(ctx, h, t));
    return end(ctx, t, { closerAt: plan.closerAt, brand: series.brand });
  }
  return { META: meta, frame, plan };
}

/**
 * Write one card file per episode (the renderer's workers import a card by file path, so each episode needs its own tiny file).
 * Each file inlines the series script, so a card file renders the same on any machine. Returns the file paths.
 * @param {object} series @param {string} dir output folder @param {string} [prefix] default series.id
 */
export function emitCards(series, dir, prefix = series.id) {
  fs.mkdirSync(dir, { recursive: true }); const me = new URL('./module.mjs', import.meta.url).href;
  return series.episodes.map(ep => { const f = path.join(dir, `${prefix}_ep${String(ep.n).padStart(2, '0')}.mjs`);
    fs.writeFileSync(f, `// generated by t6.1 series-templates from ${series.id}, episode ${ep.n}. Do not edit: change the script and emit again.\nimport { makeCard } from ${JSON.stringify(me)};\nconst { META, frame } = makeCard(${JSON.stringify(series)}, ${ep.n});\nexport { META, frame };\n`); return f; });
}
