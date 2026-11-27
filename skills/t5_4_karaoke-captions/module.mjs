// t5.4 karaoke-captions: burned-in captions with word-by-word highlight (y 1470, 52 px, inside the safe zone) and the .srt made from the SAME timings.
// Works on word lists [{w, s, e}] in seconds (t5.1's buildTimeline gives them). Draws with the engine canvas helpers.
import { setFont } from '../../engine/canvas.mjs';
import { E, prog, clamp, rgba } from '../../engine/ease.mjs';
import { roundRect } from '../../engine/canvas.mjs';
import { P } from '../../engine/brand.mjs';

/** Caption style used by the lessons (render.mjs drawCaption) plus the highlight colours. */
export const STYLE = { px: 52, wght: 700, cx: 500, y: 1470, maxW: 780, lineH: 70, padX: 32, padY: 14, radius: 24, maxLines: 2, pill: 'rgba(10,12,16,0.74)', past: P.white, now: P.green, next: P.muted, maxWords: 8 };
const END = /[.?!]$/, SOFT = /[,;:]$/;

/**
 * Split a spoken word list into caption chunks (1-2 lines each).
 * Rules: always break after . ? !; break after , ; : when the chunk already has 3+ words (keeps phrases whole but never leaves a 1-2 word orphan);
 * never more than `maxWords` words (a longer run is cut into two balanced halves); never more than `maxLines` lines at the style's width (checked with `measure`).
 * @param {{w:string,s:number,e:number}[]} words in order, seconds
 * @param {{maxWords?:number, measure?:(text:string)=>number, maxW?:number, maxLines?:number}} [o] measure(text) = pixel width of the text in the caption font
 * @returns {{w:string,s:number,e:number}[][]}
 */
export function chunkWords(words, { maxWords = STYLE.maxWords, measure = null, maxW = STYLE.maxW, maxLines = STYLE.maxLines } = {}) {
  const parts = []; let cur = [];
  words.forEach((x, i) => { cur.push(x); if (END.test(x.w) || (SOFT.test(x.w) && cur.length >= 3) || i === words.length - 1) { parts.push(cur); cur = []; } });
  if (cur.length) parts.push(cur);
  // merge short soft parts forward: a part that ended on , ; : and has fewer than maxWords with the next part joins it
  const merged = [];
  for (const p of parts) { const last = merged.at(-1); if (last && !END.test(last.at(-1).w) && last.length + p.length <= maxWords) last.push(...p); else merged.push(p.slice()); }
  const lines = txt => { if (!measure) return 1; let n = 1, w = 0; const sp = measure(' '); for (const t of txt.split(' ')) { const tw = measure(t); if (w && w + sp + tw > maxW) { n++; w = tw; } else w = w ? w + sp + tw : tw; } return n; };
  const out = [], split = c => { const text = c.map(x => x.w).join(' '); if (c.length > 1 && (c.length > maxWords || lines(text) > maxLines)) { const h = Math.ceil(c.length / 2); split(c.slice(0, h)); split(c.slice(h)); } else out.push(c); };
  merged.forEach(split); return out;
}

/**
 * Turn chunks into timed captions: appear `lead` s before the first word, stay `hold` s after the last (at least `minShow` s in all), never touch the next caption.
 * @param {{w:string,s:number,e:number}[][]} chunks @param {{lead?:number, hold?:number, minShow?:number, gap?:number}} [o]
 * @returns {{text:string, start:number, end:number, words:{w:string,s:number,e:number}[]}[]}
 */
export function timeCaptions(chunks, { lead = 0.08, hold = 0.3, minShow = 0.8, gap = 0.02 } = {}) {
  const caps = chunks.map(c => ({ text: c.map(x => x.w).join(' '), start: Math.max(0, c[0].s - lead), end: c.at(-1).e + hold, words: c }));
  caps.forEach((c, i) => { const nx = caps[i + 1]; c.end = Math.max(c.end, c.start + minShow); if (nx) { nx.start = Math.max(nx.start, c.words.at(-1).e - 0.001); c.end = Math.max(c.words.at(-1).e, Math.min(c.end, nx.start - gap)); } });   // never cut a word short; runs of continuous speech swap instantly
  return caps;
}
/** Words to captions in one call. @param {{w:string,s:number,e:number}[]} words @param {object} [o] chunkWords and timeCaptions options */
export function makeCaptions(words, o = {}) { return timeCaptions(chunkWords(words, o), o); }

/** Pixel width measurer for the caption font. @param {*} ctx @param {{px?:number,wght?:number}} [st] @returns {(text:string)=>number} */
export function measurer(ctx, { px = STYLE.px, wght = STYLE.wght } = {}) { setFont(ctx, 'inter', px, wght); return t => ctx.measureText(t).width; }

/**
 * Lay a caption out: wrapped lines centred on `cx`, each word with its x and width, plus the pill rectangle.
 * @param {*} ctx a 2d context (only for measuring) @param {{words:{w:string}[]}} cap @param {Partial<typeof STYLE>} [st]
 * @returns {{lines:{y:number,x:number,w:number,items:{i:number,w:string,x:number,width:number}[]}[], pill:{x:number,y:number,w:number,h:number}, box:{x0:number,x1:number,y0:number,y1:number}}}
 */
export function layoutCaption(ctx, cap, st = {}) {
  const S = { ...STYLE, ...st }; setFont(ctx, 'inter', S.px, S.wght); const sp = ctx.measureText(' ').width, items = cap.words.map((x, i) => ({ i, w: x.w, width: ctx.measureText(x.w).width }));
  const rows = []; let row = [], rw = 0;
  for (const it of items) { if (row.length && rw + sp + it.width > S.maxW) { rows.push({ row, w: rw }); row = []; rw = 0; } rw = row.length ? rw + sp + it.width : it.width; row.push(it); } rows.push({ row, w: rw });
  if (rows.length === 2) {   // balance the two lines: no orphan word on line 2
    const all = rows[0].row.concat(rows[1].row), wd = a => a.reduce((t, it, q) => t + it.width + (q ? sp : 0), 0); let best = null;
    for (let k = 1; k < all.length; k++) { const a = all.slice(0, k), b = all.slice(k), m = Math.max(wd(a), wd(b)); if (m <= S.maxW && (!best || m < best.m)) best = { m, a, b }; }
    if (best) rows.splice(0, 2, { row: best.a, w: wd(best.a) }, { row: best.b, w: wd(best.b) });
  }
  const h = rows.length * S.lineH + S.padY * 2, y0 = S.y - h / 2, wmax = Math.max(...rows.map(r => r.w));
  const lines = rows.map((r, li) => { let x = S.cx - r.w / 2; const y = y0 + S.padY + S.lineH / 2 + li * S.lineH; return { y, x: S.cx - r.w / 2, w: r.w, items: r.row.map(it => { const o = { i: it.i, w: it.w, x, width: it.width }; x += it.width + sp; return o; }) }; });
  const pill = { x: S.cx - wmax / 2 - S.padX, y: y0, w: wmax + S.padX * 2, h };
  return { lines, pill, box: { x0: pill.x, x1: pill.x + pill.w, y0: pill.y, y1: pill.y + pill.h } };
}

/**
 * What is on screen at time t: which caption, which word is current, how far through it (0..1), and the caption's fade (0..1).
 * A word stays fully lit (p = 1) through a pause until the next word starts.
 * @param {{start:number,end:number,words:{s:number,e:number}[]}[]} caps @param {number} t @param {{fadeIn?:number, fadeOut?:number}} [o]
 * @returns {{k:number, i:number, p:number, a:number}|null} i = -1 before the first word of the caption has started
 */
export function captionState(caps, t, { fadeIn = 0.12, fadeOut = 0.1 } = {}) {
  for (let k = 0; k < caps.length; k++) {
    const c = caps[k]; if (t < c.start || t >= c.end) continue;
    let i = -1; for (let q = 0; q < c.words.length; q++) if (t >= c.words[q].s) i = q;
    const w = c.words[Math.max(0, i)], p = i < 0 ? 0 : clamp((t - w.s) / Math.max(1e-3, w.e - w.s));
    return { k, i, p, a: E.outCubic(prog(t, c.start, c.start + fadeIn)) * (1 - prog(t, c.end - fadeOut, c.end)) };
  }
  return null;
}

/**
 * Draw the captions for time t on a 1080x1920 context: a dark pill, spoken words white, the current word wiped green left to right as it is said (with a 5% pop on its start),
 * words still to come muted grey. Returns the state drawn (or null).
 * @param {*} ctx @param {number} t @param {{words:{w:string,s:number,e:number}[],start:number,end:number}[]} caps @param {Partial<typeof STYLE> & {layouts?:any[]}} [st] pass `layouts` (array from layoutAll) to skip re-measuring
 */
export function drawCaptions(ctx, t, caps, st = {}) {
  const S = { ...STYLE, ...st }, state = captionState(caps, t); if (!state || state.a <= 0.002) return state;
  const L = (S.layouts && S.layouts[state.k]) || layoutCaption(ctx, caps[state.k], S), cap = caps[state.k];
  ctx.save(); ctx.globalAlpha *= state.a; ctx.translate(0, 10 * (1 - state.a));
  ctx.fillStyle = S.pill; roundRect(ctx, L.pill.x, L.pill.y, L.pill.w, L.pill.h, S.radius).fill(); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; roundRect(ctx, L.pill.x, L.pill.y, L.pill.w, L.pill.h, S.radius).stroke();
  setFont(ctx, 'inter', S.px, S.wght); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const ln of L.lines) for (const it of ln.items) {
    const w = cap.words[it.i], past = state.i > it.i, now = state.i === it.i, y = ln.y + 2;
    if (now) {
      const pop = 1 + 0.05 * Math.sin(Math.PI * clamp((t - w.s) / 0.18)), cx = it.x + it.width / 2;
      ctx.save(); ctx.translate(cx, y); ctx.scale(pop, pop); ctx.translate(-cx, -y);
      ctx.fillStyle = S.next; ctx.fillText(it.w, it.x, y);
      ctx.save(); ctx.beginPath(); ctx.rect(it.x - 4, y - S.px, (it.width + 8) * state.p, S.px * 2); ctx.clip(); ctx.fillStyle = S.now; ctx.fillText(it.w, it.x, y); ctx.restore(); ctx.restore();
    } else { ctx.fillStyle = past ? S.past : S.next; ctx.fillText(it.w, it.x, y); }
  }
  ctx.restore(); return state;
}
/** Layout every caption once (call in init). @param {*} ctx @param {any[]} caps @param {object} [st] @returns {any[]} */
export function layoutAll(ctx, caps, st = {}) { return caps.map(c => layoutCaption(ctx, c, st)); }

// ---------------------------------------------------------------- .srt from the same captions
const pad = (n, w) => String(n).padStart(w, '0');
/** Seconds to an SRT time stamp HH:MM:SS,mmm. @param {number} s */
export function srtTime(s) { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), x = Math.floor(ms % 60000 / 1000); return `${pad(h, 2)}:${pad(m, 2)}:${pad(x, 2)},${pad(ms % 1000, 3)}`; }
/** The .srt text for captions: one cue per caption, the same start and end the video shows. @param {{text:string,start:number,end:number}[]} caps @returns {string} */
export function toSrt(caps) { return caps.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'); }
/** Parse an .srt back to cues (for checks and for importing a script's captions). @param {string} text @returns {{n:number,start:number,end:number,text:string}[]} */
export function parseSrt(text) {
  const tt = s => { const m = /(\d+):(\d+):(\d+),(\d+)/.exec(s); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
  return text.trim().split(/\n\s*\n/).map(b => { const l = b.split('\n'), m = /(\S+) --> (\S+)/.exec(l[1]); return { n: +l[0], start: tt(m[1]), end: tt(m[2]), text: l.slice(2).join('\n') }; });
}
/**
 * Reading-speed report: words and characters per second each caption is on screen (Netflix guideline: at most 17-20 characters per second).
 * @param {{text:string,start:number,end:number}[]} caps @returns {{maxCps:number, maxWps:number, minShow:number, items:{text:string,cps:number,wps:number,show:number}[]}}
 */
export function readingStats(caps) { const items = caps.map(c => { const d = c.end - c.start; return { text: c.text, cps: c.text.length / d, wps: c.text.split(' ').length / d, show: d }; }); return { maxCps: Math.max(...items.map(i => i.cps)), maxWps: Math.max(...items.map(i => i.wps)), minShow: Math.min(...items.map(i => i.show)), items }; }
