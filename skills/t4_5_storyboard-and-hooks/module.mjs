// t4.5 storyboard-and-hooks: beat sheets for 28 s and 16 s cards, a hook library with fit and claim checks, a pacing checklist, and a storyboard.json that compiles
// into a timeline (beat times, hook caption, page windows, voice-over table, card skeleton). Pure functions; nothing here renders.
import { createCanvas, setFont, textW, begin, end, hook, page, pages, prog, E, clamp } from '../../engine/index.mjs';
import { claimViolations } from '../../engine/brand.mjs';
import { syllabify } from '../t4_4_lip-sync/module.mjs';

// ------------------------------------------------------------------ formats and beat sheets
/**
 * The two card formats. `beats` are the templates: id, kind, duration, what the beat is for, how many visible events it needs, the word limit of its on-screen text.
 * Durations sum to T minus the closer (3.1 s), because the engine closer needs about 3 s at the end (closerAt = T - 3.1).
 * maxEventGap = the longest stretch without something new happening on screen.
 */
export const FORMATS = {
  28: {
    T: 28, closerLen: 3.1, maxEventGap: 1.8, maxBeat: 7.0,
    beats: [
      { id: 'hook', kind: 'hook', dur: 2.4, goal: 'One question or promise, outside the window, readable at once. Opens a loop the payoff will close.', events: 2, maxWords: 7 },
      { id: 'problem', kind: 'setup', dur: 4.6, goal: 'Show the thing the viewer already half-knows (the pain, the confusion, the claim). Make the open loop feel real.', events: 3, maxWords: 10 },
      { id: 'reveal', kind: 'reveal', dur: 7.0, goal: 'The mechanism or the answer, built step by step. This is the longest beat: pages slide, objects land, nothing sits still.', events: 4, maxWords: 12 },
      { id: 'proof', kind: 'proof', dur: 6.0, goal: 'A concrete example or a UI that presses and fills. Proof beats explanation.', events: 4, maxWords: 12 },
      { id: 'payoff', kind: 'payoff', dur: 4.9, goal: 'The line the viewer takes away. Closes the loop from the hook. Lands before the closer starts.', events: 3, maxWords: 10 },
    ],
  },
  16: {
    T: 16, closerLen: 3.1, maxEventGap: 1.5, maxBeat: 5.0,
    beats: [
      { id: 'hook', kind: 'hook', dur: 1.8, goal: 'One short question or promise. First text on screen by 0.15 s.', events: 2, maxWords: 6 },
      { id: 'setup', kind: 'setup', dur: 3.2, goal: 'The situation in one picture.', events: 3, maxWords: 8 },
      { id: 'show', kind: 'reveal', dur: 5.0, goal: 'The move itself, shown not told.', events: 4, maxWords: 10 },
      { id: 'payoff', kind: 'payoff', dur: 2.9, goal: 'The takeaway line. Closes the hook.', events: 2, maxWords: 8 },
    ],
  },
};
/** The beat template list for a format (a deep copy you may edit). @param {16|28} format */
export function beatSheet(format) { const f = FORMATS[format]; if (!f) throw new Error(`format must be 16 or 28, got ${format}`); return JSON.parse(JSON.stringify(f.beats)); }

// ------------------------------------------------------------------ hooks
/**
 * Hook patterns. Each fills a two-line hook (line 1 white, line 2 green). `lines` uses {slots}. `example` is a tested fill: it fits the screen, has no banned claim
 * word and no hype word. Use `hookFromPattern(id, slots)`.
 */
export const HOOK_PATTERNS = [
  { id: 'question', name: 'Plain question', lines: ['What does {x}', 'actually do?'], slots: ['x'], when: 'a topic people use but cannot explain', example: { x: 'AI' } },
  { id: 'contradiction', name: 'Contradiction', lines: ['{x} is not', '{y}.'], slots: ['x', 'y'], when: 'a common wrong picture', example: { x: 'AI', y: 'a search box' } },
  { id: 'mistake', name: 'Mistake', lines: ['The {x} mistake', 'to avoid.'], slots: ['x'], when: 'a fixable habit', example: { x: 'prompt' } },
  { id: 'promise', name: 'Time promise', lines: ['{x} in', '{n} seconds.'], slots: ['x', 'n'], when: 'a single clear idea (use the real card length)', example: { x: 'Memory', n: '28' } },
  { id: 'count', name: 'Counted list', lines: ['{n} ways to', '{x}.'], slots: ['n', 'x'], when: 'a short list of three or fewer', example: { n: 'Three', x: 'ask better' } },
  { id: 'open-loop', name: 'Open loop', lines: ['Watch what', '{x} does next.'], slots: ['x'], when: 'something visibly happens in the card', example: { x: 'Cog' } },
  { id: 'challenge', name: 'Spot it', lines: ['Spot the', '{x}.'], slots: ['x'], when: 'a before and after the viewer can judge', example: { x: 'weak prompt' } },
  { id: 'before-after', name: 'Before and after', lines: ['Before: {x}', 'After: {y}.'], slots: ['x', 'y'], when: 'a clear improvement', example: { x: 'vague', y: 'exact' } },
  { id: 'command', name: 'Stop doing', lines: ['Stop {x}', 'and try this.'], slots: ['x'], when: 'a habit with a better replacement', example: { x: 'guessing' } },
  { id: 'myth', name: 'Myth and fact', lines: ['Myth: {x}', 'Fact: {y}'], slots: ['x', 'y'], when: 'a false belief you can correct in one line', example: { x: 'AI knows', y: 'AI predicts' } },
  { id: 'definition', name: 'One sentence', lines: ['{x} in', 'one sentence.'], slots: ['x'], when: 'a definition that fits in the voice-over', example: { x: 'A token' } },
  { id: 'scenario', name: 'Scenario', lines: ['You ask {x}.', 'Then what?'], slots: ['x'], when: 'a walk through what happens next', example: { x: 'AI' } },
  { id: 'either-or', name: 'Either or', lines: ['{x} or', '{y}?'], slots: ['x', 'y'], when: 'a real choice the card resolves', example: { x: 'Rented', y: 'owned' } },
  { id: 'reveal', name: 'What is inside', lines: ['What is inside', 'a {x}?'], slots: ['x'], when: 'a thing you can open up on screen', example: { x: 'chatbot' } },
];
/** Words that sell harder than the facts allow. The BGI claim rules say: no unproven claims. Whole words, case-insensitive. */
export const HYPE = /\b(nobody|everyone|everybody|secret|shocking|insane|incredible|unbelievable|guaranteed|best|fastest|never fails|game[- ]?changer|you won't believe|mind[- ]?blowing|revolutionary)\b/i;
/** Hype words found in a string (array of matches). */
export const hypeWords = s => [...String(s).matchAll(new RegExp(HYPE.source, 'gi'))].map(m => m[0]);
let _ctx = null;
/**
 * Does a two-line hook fit? Measures with the engine's Space Grotesk 700 at 104 px (the tt10 hook size) and steps down 4 px at a time to 76 px.
 * Lines must stay inside 920 px (the safe width). Returns {fits, px, w1, w2}; px is the largest size that fits (pass it as hook cap.px).
 * @param {string} l1 @param {string} l2 @param {{maxW?:number}} [o]
 */
export function fitHook(l1, l2, { maxW = 920 } = {}) {
  _ctx = _ctx || createCanvas(40, 40).getContext('2d');
  for (let px = 104; px >= 76; px -= 4) { setFont(_ctx, 'sg', px, 700, -0.01); const w1 = textW(_ctx, l1, px, -0.01), w2 = textW(_ctx, l2, px, -0.01); if (Math.max(w1, w2) <= maxW) return { fits: true, px, w1, w2 }; }
  setFont(_ctx, 'sg', 76, 700, -0.01); return { fits: false, px: 76, w1: textW(_ctx, l1, 76, -0.01), w2: textW(_ctx, l2, 76, -0.01) };
}
/**
 * Fill a hook pattern. Returns {l1, l2, px, pattern, problems}. problems = checkHook() of the result.
 * @param {string} id pattern id @param {Record<string,string>} slots
 */
export function hookFromPattern(id, slots) {
  const p = HOOK_PATTERNS.find(x => x.id === id); if (!p) throw new Error(`unknown hook pattern ${id}`);
  const fill = s => s.replace(/\{(\w+)\}/g, (_, k) => { if (!(k in slots)) throw new Error(`pattern ${id} needs slot ${k}`); return slots[k]; });
  const l1 = fill(p.lines[0]), l2 = fill(p.lines[1]); return { l1, l2, px: fitHook(l1, l2).px, pattern: id, problems: checkHook(l1, l2) };
}
/**
 * Problems with a hook. Rules: both lines present; at most 7 words; at least 76 px fit (920 px wide); no banned claim word; no hype word; neither line empty or
 * only punctuation; line 2 is the one in green so it should carry the punch (not a lone article).
 * @returns {string[]} messages (empty = fine)
 */
export function checkHook(l1, l2) {
  const bad = [], all = `${l1} ${l2}`, words = all.split(/\s+/).filter(Boolean).length;
  if (!l1 || !l2 || !/\w/.test(l1) || !/\w/.test(l2)) bad.push('both hook lines need words');
  if (words > 7) bad.push(`${words} words: a hook is 7 words or fewer`);
  const f = fitHook(l1, l2); if (!f.fits) bad.push(`does not fit 920 px even at 76 px (line widths ${Math.round(f.w1)} and ${Math.round(f.w2)})`);
  for (const v of [l1, l2]) { claimViolations(v).forEach(c => bad.push(`banned claim: ${c}`)); }
  claimViolations(all).forEach(c => { if (!bad.includes(`banned claim: ${c}`)) bad.push(`banned claim: ${c}`); });
  hypeWords(all).forEach(h => bad.push(`hype word: ${h}`));
  if (/^(a|an|the|of|to|and)\b[.?!]?$/i.test(l2.trim())) bad.push('line 2 is a lone article');
  return bad;
}

// ------------------------------------------------------------------ voice time
/** Seconds of Kokoro Heart speech for a text: 0.205 s per syllable plus 1.05 x the pauses inside it (0.3 after a full stop, 0.15 after a comma). Fitted on 95 measured script rows, mean error 0.18 s (0.17 on rows held out of the fit). */
export function voiceSeconds(text) {
  const sy = syllabify(text); if (!sy.length) return 0;
  const pauses = sy.reduce((a, s) => a + s.pauseAfter, 0) - sy[sy.length - 1].pauseAfter;
  return 0.205 * sy.length + 1.05 * pauses;
}
const words = s => String(s || '').split(/\s+/).filter(Boolean).length;

// ------------------------------------------------------------------ storyboard.json
/**
 * The storyboard.json shape (also the field list for validation).
 *   { id, title, format: 16|28, brand: 'bgi'|'aeon', fps: 30,
 *     hook: { pattern?, l1, l2 },
 *     beats: [ { id, kind, dur, text?, voice?, voiceAt?, visual?, motion?, events?: [seconds from beat start], overlap?, openLoop?, closeLoop?, textY? } ],
 *     cover?: { t } }
 * `dur` of the beats sum to T - 3.1. The closer is added by the compiler (closerAt = T - 3.1).
 */
export const STORYBOARD_FIELDS = ['id', 'title', 'format', 'brand', 'fps', 'hook', 'beats', 'cover'];
const KINDS = ['hook', 'setup', 'reveal', 'proof', 'turn', 'payoff'];
/**
 * Compile a storyboard into a timeline. Returns { T, fps, frames, META, closerAt, beats: [{...beat, s, e, events: [absolute times]}], events, hookCap, pageDurs,
 * voiceRows, errors }. errors = structural problems (missing hook, durations that do not add up, unknown kind...). Does not throw.
 * @param {object} sb
 */
export function compileStoryboard(sb) {
  const errors = [], F = FORMATS[sb.format]; if (!F) return { errors: [`format must be 16 or 28, got ${sb.format}`] };
  const fps = sb.fps || 30, T = F.T, closerAt = +(T - F.closerLen).toFixed(6), out = []; let cur = 0;
  (sb.beats || []).forEach((b, i) => {
    if (!KINDS.includes(b.kind)) errors.push(`beat ${b.id}: unknown kind ${b.kind}`);
    if (!(b.dur > 0)) errors.push(`beat ${b.id}: dur must be positive`);
    const s = i === 0 ? 0 : cur - (b.overlap || 0), e = s + b.dur; cur = e;
    const rel = (b.events || []).filter(x => x >= 0 && x < b.dur).map(x => s + x);
    out.push({ ...b, s: +s.toFixed(6), e: +e.toFixed(6), events: [...new Set([+s.toFixed(6), ...rel])].sort((a, c) => a - c) });
  });
  if (!out.length) errors.push('no beats'); else {
    if (out[0].kind !== 'hook') errors.push('the first beat must be the hook');
    if (Math.abs(out[out.length - 1].e - closerAt) > 0.05) errors.push(`beats end at ${out[out.length - 1].e.toFixed(2)} s but the closer starts at ${closerAt.toFixed(2)} s (T ${T} - ${F.closerLen})`);
    if (!out.some(b => b.kind === 'payoff')) errors.push('there is no payoff beat');
  }
  const hookBeat = out.find(b => b.kind === 'hook'), hk = sb.hook || {};
  const hookCap = hookBeat ? { tIn: 0.15, tOut: Math.max(0.15, hookBeat.e - 0.05), l1: hk.l1, l2: hk.l2, c2: '#19e08f', b1: 470, b2: 580, px: hk.l1 && hk.l2 ? fitHook(hk.l1, hk.l2).px : 104 } : null;
  const closer = { id: 'closer', kind: 'closer', s: closerAt, e: T, events: [closerAt, closerAt + 0.35, closerAt + 0.8, closerAt + 1.9] };
  const events = [...new Set(out.flatMap(b => b.events).concat(closer.events).concat(hookCap ? [hookCap.tIn] : []))].sort((a, c) => a - c);
  const coverT = sb.cover?.t ?? (hookBeat ? Math.min(hookBeat.e - 0.3, 1.4) : 1);
  const voiceRows = out.filter(b => b.voice).map((b, i, arr) => { const t0 = b.s + (b.voiceAt ?? 0.15), d = voiceSeconds(b.voice); return { id: b.id, t0, t1: t0 + d, mustEnd: b.e, voice: b.voice, slack: b.e - 0.05 - (t0 + d) }; });
  return { T, fps, frames: Math.round(T * fps), META: { W: 1080, H: 1920, fps, frames: Math.round(T * fps), coverT, ...(sb.brand === 'aeon' ? { brand: 'aeon' } : {}) }, closerAt, beats: out, closer, events, hookCap, voiceRows, brand: sb.brand || 'bgi', errors };
}

// ------------------------------------------------------------------ pacing checklist
/**
 * The retention-curve checklist as code. Each check returns {id, ok, weight, detail}. It judges the PLAN, not the finished video: it cannot know how long people watch,
 * it checks the habits of cards that keep a viewer: an early hook, something new on screen every 1.5-1.8 s, no beat that drags, text that can be read, a loop that
 * is opened and closed, a payoff before the closer, a voice that fits its beat, no banned claim words.
 * Returns {score 0-100, checks, longestGap, eventsPerSecond}. @param {ReturnType<typeof compileStoryboard>} c @param {object} [sb] the source storyboard (for the hook text)
 */
export function pacingReport(c, sb = {}) {
  const F = FORMATS[sb.format || (c.T === 16 ? 16 : 28)], checks = [], add = (id, ok, detail, weight = 1) => checks.push({ id, ok: !!ok, weight, detail });
  const hk = c.hookCap, hb = c.beats[0];
  add('hook-first-text', hk && hk.tIn <= 0.3 + 1e-9, `hook text arrives at ${hk ? hk.tIn.toFixed(2) : 'never'} s (limit 0.3)`, 2);
  add('hook-readable', hk && hk.tOut - hk.tIn >= 1.2 - 1e-9, `hook stays ${hk ? (hk.tOut - hk.tIn).toFixed(2) : 0} s (needs 1.2)`, 2);
  add('hook-copy', hk && !checkHook(hk.l1 || '', hk.l2 || '').length, hk ? (checkHook(hk.l1 || '', hk.l2 || '').join('; ') || 'fits, no claims, no hype') : 'no hook', 2);
  const ev = [...c.events, c.T], gapsAt = ev.slice(1).map((t, i) => [t - ev[i], ev[i]]).filter(([, t]) => t < c.closerAt + 3);
  const longest = Math.max(...gapsAt.map(g => g[0])), worst = gapsAt.find(g => g[0] === longest);
  add('event-gap', longest <= F.maxEventGap + 1e-9, `longest stretch with nothing new: ${longest.toFixed(2)} s at ${worst[1].toFixed(2)} s (limit ${F.maxEventGap})`, 3);
  const longBeat = c.beats.find(b => b.e - b.s > F.maxBeat + 1e-9); add('beat-length', !longBeat, longBeat ? `beat ${longBeat.id} is ${(longBeat.e - longBeat.s).toFixed(1)} s (limit ${F.maxBeat})` : `longest beat ${Math.max(...c.beats.map(b => b.e - b.s)).toFixed(1)} s`, 1);
  const shortBeat = c.beats.find(b => b.e - b.s < 0.8 - 1e-9); add('beat-min', !shortBeat, shortBeat ? `beat ${shortBeat.id} is ${(shortBeat.e - shortBeat.s).toFixed(2)} s: under 0.8 s cannot be read` : 'no beat under 0.8 s', 1);
  const tmpl = F.beats, wordBad = c.beats.filter(b => { const lim = (tmpl.find(t => t.id === b.id) || tmpl.find(t => t.kind === b.kind) || { maxWords: 12 }).maxWords, w = b.kind === 'hook' ? words(`${sb.hook?.l1 || ''} ${sb.hook?.l2 || ''}`) : words(b.text); return w > lim || (b.kind !== 'hook' && w / (b.e - b.s) > 3.3); });
  add('text-load', !wordBad.length, wordBad.length ? `too many words in ${wordBad.map(b => b.id).join(', ')} (limits per beat, and 3.3 words per second)` : 'on-screen words are within limits', 2);
  const open = c.beats.find(b => b.openLoop), close = c.beats.find(b => b.closeLoop);
  add('loop', open && close && open.s < 3 && close.s >= 0.6 * c.closerAt - 1e-9 && close.e <= c.closerAt + 1e-9, open && close ? `loop opens at ${open.s.toFixed(1)} s, closes at ${close.s.toFixed(1)} s` : 'no open loop / close loop flags', 2);
  const pay = c.beats.find(b => b.kind === 'payoff'); add('payoff-late', pay && pay.s >= 0.6 * c.closerAt - 1e-9 && pay.e <= c.closerAt + 1e-9, pay ? `payoff starts ${pay.s.toFixed(1)} s, closer at ${c.closerAt.toFixed(1)} s` : 'no payoff', 2);
  add('closer', c.closerAt <= c.T - 3.0 + 1e-9, `closer starts at ${c.closerAt.toFixed(2)} s of ${c.T} s (needs 3 s)`, 2);
  add('cover', c.META.coverT >= 0.8 && c.META.coverT <= Math.min(3.6, hb ? hb.e : 3.6), `cover frame at ${c.META.coverT.toFixed(2)} s (0.8 to 3.6 and inside the hook)`, 1);
  const vo = c.voiceRows.filter(r => r.slack < 0); add('voice-fit', !vo.length, vo.length ? `voice overruns its beat: ${vo.map(r => `${r.id} by ${(-r.slack).toFixed(2)} s`).join(', ')}` : `all ${c.voiceRows.length} voice lines end before the next beat (smallest slack ${c.voiceRows.length ? Math.min(...c.voiceRows.map(r => r.slack)).toFixed(2) : '-'} s)`, 2);
  const zone = c.beats.filter(b => b.textY && b.textY > 1250 && b.textY < 1580); add('caption-band', !zone.length, zone.length ? `text planned inside the caption band (y 1250-1580) in ${zone.map(b => b.id).join(', ')}` : 'no text planned in the caption band', 1);
  const texts = [sb.hook?.l1, sb.hook?.l2, ...c.beats.flatMap(b => [b.text, b.voice, b.visual])].filter(Boolean), cl = texts.flatMap(s => claimViolations(s)), hy = texts.flatMap(hypeWords);
  add('claims', !cl.length && !hy.length, cl.length || hy.length ? `banned or hype wording: ${[...new Set([...cl, ...hy])].join('; ')}` : 'no banned claim or hype words', 3);
  const tot = checks.reduce((a, x) => a + x.weight, 0), got = checks.filter(x => x.ok).reduce((a, x) => a + x.weight, 0);
  return { score: Math.round(100 * got / tot), checks, longestGap: longest, eventsPerSecond: c.events.length / c.T, failed: checks.filter(x => !x.ok).map(x => x.id) };
}
/**
 * A novelty curve for the plan: 1 at the instant something new appears, decaying with a 1.2 s time constant until the next event. Mean novelty is a rough measure of how
 * often the picture refreshes. It is NOT a retention forecast: it only restates the event times. Returns [{t, v}] every dt seconds.
 */
export function noveltyCurve(c, dt = 0.1) {
  const out = []; for (let t = 0; t <= c.T + 1e-9; t += dt) { let last = -Infinity; for (const e of c.events) if (e <= t + 1e-9) last = e; out.push({ t: +t.toFixed(3), v: last === -Infinity ? 0 : Math.min(1, Math.exp(-(t - last) / 1.2)) }); }
  return out;
}
/** The voice-over table in the format of TikTok_VO_Scripts.md: | Time | Voice-over | Must end by |. Rows that overrun get a trailing OVERRUN note. */
export function voiceTableMd(c) {
  const f = x => x.toFixed(2);
  return ['| Time | Voice-over | Must end by |', '|---|---|---|', ...c.voiceRows.map(r => `| ${f(r.t0)}–${f(r.t1)} s | ${r.voice}${r.slack < 0 ? ' (OVERRUN)' : ''} | ${f(r.mustEnd)} s |`)].join('\n');
}

// ------------------------------------------------------------------ card skeleton
/**
 * Turn a storyboard into a working card: {META, frame}. `draw` = {hook?(ctx, t, beat), setup?, reveal?, proof?, turn?, payoff?, default?}. Each is called as
 * draw[kind](ctx, { t, beat, local (seconds into the beat), page: {a, dx} | null (the tt10 page slide, 0.4 s in, 0.35 s out, overlap 0.1) }) while the beat is on screen.
 * The hook is drawn by the engine hook() from the storyboard's hook lines; the closer by the engine. Use it as `export const { META, frame } = makeCard(sb, draw)`.
 */
export function makeCard(sb, draw = {}) {
  const c = compileStoryboard(sb); if (c.errors.length) throw new Error(`storyboard has errors: ${c.errors.join('; ')}`);
  const pg = c.beats.filter(b => b.kind !== 'hook').map(b => ({ s: b.s, e: b.e + 0.1 }));
  const frame = t => {
    const { cv, ctx } = begin(t, { closerAt: c.closerAt }); hook(ctx, c.hookCap, t);
    c.beats.forEach(b => { if (b.kind === 'hook') { if (draw.hook && t >= b.s && t <= b.e) draw.hook(ctx, { t, beat: b, local: t - b.s, page: null }); return; }
      const w = pg.find(p => p.s === b.s), p = page(t, w); if (!p) return; (draw[b.kind] || draw.default || (() => {}))(ctx, { t, beat: b, local: t - b.s, page: p }); });
    return end(ctx, t, { closerAt: c.closerAt, brand: c.brand });
  };
  return { META: c.META, frame, compiled: c };
}
/** A ready-made example storyboard (28 s or 16 s) about how a chatbot works / how to write a prompt. Passes every check. Copy it and edit. @param {16|28} format */
export function exampleStoryboard(format = 28) {
  if (format === 16) return {
    id: 'example_16_prompt', title: 'Spot the weak prompt', format: 16, brand: 'bgi', fps: 30, cover: { t: 1.2 }, hook: { pattern: 'challenge', ...pick(hookFromPattern('challenge', { x: 'weak prompt' })) },
    beats: [
      { id: 'hook', kind: 'hook', dur: 1.8, text: 'Spot the weak prompt.', voice: 'Spot the weak prompt.', visual: 'two chat bubbles slide in, one vague one exact', events: [0.9], openLoop: true },
      { id: 'setup', kind: 'setup', dur: 3.2, text: 'Write me something.', voice: 'Write me something. Vague in, vague out.', visual: 'a chat window; the vague prompt types in and a limp answer appears', events: [0.8, 1.9] },
      { id: 'show', kind: 'reveal', dur: 5.0, text: 'Add who, what, and format.', voice: 'Say who it is for, what you want, and the format.', visual: 'three chips land one by one and the answer sharpens', events: [0.9, 2.0, 3.1, 4.1] },
      { id: 'payoff', kind: 'payoff', dur: 2.9, text: 'Specific in, useful out.', voice: 'Specific in, useful out.', visual: 'the answer card stamps in', events: [0.8, 1.8], closeLoop: true },
    ],
  };
  return {
    id: 'example_28_chatbot', title: 'What does AI actually do?', format: 28, brand: 'bgi', fps: 30, cover: { t: 1.3 }, hook: { pattern: 'question', ...pick(hookFromPattern('question', { x: 'AI' })) },
    beats: [
      { id: 'hook', kind: 'hook', dur: 2.4, text: 'What does AI actually do?', voice: 'What does AI actually do?', visual: 'a chat bubble pops in with a blinking cursor', events: [1.0], openLoop: true },
      { id: 'problem', kind: 'setup', dur: 4.6, text: 'It writes fluent answers.', voice: 'It writes smooth, confident answers. But how?', visual: 'a window: a question types in and a long answer streams out', events: [0.9, 2.2, 3.5] },
      { id: 'reveal', kind: 'reveal', dur: 7.0, text: 'It predicts the next word.', voice: 'Given some text, it predicts the word that is most likely to come next. Then it repeats.', visual: 'a sentence grows word by word with candidate chips', events: [1.2, 2.6, 4.0, 5.4] },
      { id: 'proof', kind: 'proof', dur: 6.0, text: 'One word at a time.', voice: 'The capital of France is. Paris scores high. Other words score near zero.', visual: 'probability bars fill, Paris wins', events: [1.0, 2.2, 3.6, 4.8] },
      { id: 'payoff', kind: 'payoff', dur: 4.9, text: 'Fluent is not the same as true.', voice: 'That is why a fluent answer can still be wrong. Check what matters.', visual: 'a stamp slams: CHECK IT', events: [0.6, 1.9, 3.3], closeLoop: true },
    ],
  };
}
const pick = h => ({ l1: h.l1, l2: h.l2 });
export { KINDS };
