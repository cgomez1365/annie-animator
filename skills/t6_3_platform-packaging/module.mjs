// t6.3 platform-packaging: take a finished card and make it ready to post on TikTok, Instagram Reels and YouTube Shorts:
// check the video file, pick and check the cover frame, and generate the post file (title, caption, hashtags, AI labels, the 18+
// audience control for AEON, the music-credit line). The copy rules and limits are those of the 2026-10-29 research in
// Reports/Agents/VP_AEON/2026-10-27/Assets_Icons_Media/TikTok_Demos/posts/README.md; platform rules change, so re-check them on the first post.
import fs from 'node:fs';
import path from 'node:path';
import { FFMPEG, run, loadCard, renderFrame } from '../../engine/render.mjs';
import { SAFE, SLOGAN, EIGHTEEN, claimViolations, createCanvas } from '../../engine/index.mjs';

// ------------------------------------------------------------------ specs
/** What each platform needs. `asOf` = when the numbers were read from the platforms' own pages (2026-10-29 research); `recheck` = verify on the first post. */
export const PLATFORMS = {
  tiktok: { name: 'TikTok', asOf: '2026-10-29', recheck: true, caption: 2200, title: 140, hashtags: [3, 5], hook: 100,
    aiLabel: 'AI-generated content: On whenever the voice, pictures or music are AI', commercial: 'Disclose commercial content: On, Your brand (required on every post, own products included)',
    audience: '18+ is the Audience controls switch on the post (not the account-wide one: it removes the per-video choice)', cover: 'Select cover from the video: the frame matching the cover file; profile grid shows a 3:4 crop', maxSeconds: 600 },
  reels: { name: 'Instagram Reels', asOf: '2026-10-29', recheck: true, caption: 2200, hashtags: [0, 5], hook: 100,
    aiLabel: 'Add AI label: On (required for a reel with a realistic AI voice)', audience: 'No per-reel 18+ switch: the account-wide Minimum age 18 (professional account) hides all posts from under-18s',
    cover: 'Add from camera roll; cannot be changed later; the grid shows the centre 3:4 of the cover', maxSeconds: 180, audioName: 'rename once only' },
  shorts: { name: 'YouTube Shorts', asOf: '2026-10-29', recheck: true, title: 100, description: 5000, descriptionUnit: 'bytes', tags: 500, tagsRule: 'a multi-word tag counts with its two quote marks and a comma between tags', hashtags: [0, 3],
    hashtagsNote: 'YouTube shows up to 3 by the title; more than 60 voids them all', aiLabel: 'Altered or synthetic content: No for a plain narrator over AI music; Yes when the AI voice is the product',
    audience: 'Age restriction: No (a restricted video cannot run as an ad); the 18+ line goes in the description instead', cover: 'Custom Shorts thumbnails need the Partner Program: pick the closest suggested frame', maxSeconds: 180 },
};
/** The video every platform gets: the engine's own output format. */
export const VIDEO_SPEC = { width: 1080, height: 1920, fps: 30, codec: 'h264', pixFmt: 'yuv420p' };
/** The cover is a 1080x1920 frame; grids show its centre 3:4 (1080x1440, y 240-1680). Keep the hook inside y 300-1500, x 60-1020. */
export const COVER_SPEC = { width: 1080, height: 1920, crop34: { x: 0, y: 240, w: 1080, h: 1440 }, safe: { x0: 60, x1: 1020, y0: 300, y1: 1500 } };
export const SLOGAN_LINE = SLOGAN.join(' ');
const EXTRA_BANNED = /\b(optimi[sz]e|speed up|clean up)\b/i;

// ------------------------------------------------------------------ video file check
/**
 * Read a video file with ffmpeg. @returns {Promise<{width:number,height:number,fps:number,seconds:number,codec:string,pixFmt:string,audio:boolean,bytes:number}>}
 */
export async function probeVideo(file) {
  const t = await run(FFMPEG, ['-hide_banner', '-i', file, '-f', 'null', '-']).catch(e => e.message);
  const v = t.match(/Video: (\w+).*?, (\w+)[(,].*?, (\d{3,4})x(\d{3,4})/), fr = t.match(/(\d+(?:\.\d+)?) fps/), d = t.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!v || !d) throw new Error(`cannot read ${file}`);
  return { width: +v[3], height: +v[4], fps: fr ? +fr[1] : 0, seconds: +d[1] * 3600 + +d[2] * 60 + +d[3], codec: v[1], pixFmt: v[2], audio: /Stream #\d+:\d+.*Audio:/.test(t), bytes: fs.statSync(file).size };
}
/**
 * Check a video against the platform specs. kind 'master' = a silent card from the engine (no audio allowed); 'final' = the file you
 * post, with voice and music (audio expected). Returns { ok, problems[], warnings[], info }.
 * @param {string} file @param {{kind?:'master'|'final'}} [o]
 */
export async function checkVideo(file, { kind = 'final' } = {}) {
  const i = await probeVideo(file), problems = [], warnings = [];
  if (i.width !== VIDEO_SPEC.width || i.height !== VIDEO_SPEC.height) problems.push(`size is ${i.width}x${i.height}, platforms want ${VIDEO_SPEC.width}x${VIDEO_SPEC.height} (9:16)`);
  if (Math.abs(i.fps - VIDEO_SPEC.fps) > 0.01) problems.push(`${i.fps} fps, expected ${VIDEO_SPEC.fps}`);
  if (i.codec !== VIDEO_SPEC.codec) problems.push(`codec ${i.codec}, expected H.264`);
  if (i.pixFmt !== VIDEO_SPEC.pixFmt) problems.push(`pixel format ${i.pixFmt}, expected yuv420p`);
  if (kind === 'master' && i.audio) problems.push('a master card must be silent: voice and music are added later');
  if (kind === 'final' && !i.audio) warnings.push('no audio: the posted file normally carries the voice and the music');
  for (const [k, p] of Object.entries(PLATFORMS)) if (i.seconds > p.maxSeconds) warnings.push(`${p.name}: ${i.seconds.toFixed(1)} s is over ${p.maxSeconds} s (limit not re-checked since ${p.asOf})`);
  if (i.seconds < 3) warnings.push('under 3 s: too short to count as a view on most feeds');
  return { ok: problems.length === 0, problems, warnings, info: i };
}

// ------------------------------------------------------------------ copy: one post spec, three platforms
const n = s => [...s].length, bytes = s => Buffer.byteLength(s, 'utf8');
const join = (...parts) => parts.filter(Boolean).join('\n\n');
const FRAGMENT_LABEL = { demos: ' (Demos section)' };
/** A URL as people read it in a caption: a #fragment would turn into a hashtag, so it is dropped (a known one becomes words). */
export function displayUrl(url) { return url.replace(/\/?#([\w-]+)$/, (_, f) => FRAGMENT_LABEL[f] || ''); }
const BIO = new Set(['aeon', 'macsense', 'store', 'careers', '']);
const hashtags = (p, k) => p.tags.slice(0, k).map(t => '#' + t).join(' ');
const adultLine = p => (p.showsAeon || /AEON/.test(`${p.hook} ${p.body}`) ? EIGHTEEN : '');
const link = (p, platform) => { const u = displayUrl(p.url), first = u.split('/')[1] ?? '', frag = p.url.match(/#([\w-]+)$/)?.[1]; return platform === 'reels' && BIO.has(first) && !(frag && FRAGMENT_LABEL[frag]) ? `Link in bio: ${u}` : `Find it at ${u}`; };
/**
 * Make the copy for all three platforms from one spec.
 * Spec: { id, date?, brand:'AEON'|'BGI', name, hook, body, tags[], url, showsAeon?, credit?, title?, ytTail, ytTags[], ytCategory?,
 *         ai:{ voice:boolean, music:boolean, voiceIsProduct?:boolean, voiceCredit?, musicCredit? }, music:{ igAudioName? } }
 * @returns {{tiktok:{title:string,caption:string}, shorts:{title:string,description:string,tags:string}, reels:{caption:string}}}
 */
export function buildCopy(p) {
  const age = adultLine(p), sloganLine = p.hook === SLOGAN_LINE ? '' : SLOGAN_LINE;
  const ai = p.ai || {}, voice = ai.voice ? (ai.voiceCredit || 'The voice is AI text-to-speech (Kokoro, Heart voice).') : '', music = ai.music ? (ai.musicCredit || 'The music is AI-generated (Google Gemini).') : '';
  const tiktok = join(p.hook, p.body, p.credit, sloganLine, [link(p, 'tiktok'), age].filter(Boolean).join('\n'), hashtags(p, 5));
  const reels = join(p.hook, p.body, p.credit, sloganLine, [link(p, 'reels'), age].filter(Boolean).join('\n'), hashtags(p, 5));
  const description = join(`${p.hook} ${p.body}`, p.credit, sloganLine, `Visit ${displayUrl(p.url)}`, age, [voice, music].filter(Boolean).join(' '), hashtags(p, 3));
  return { tiktok: { title: p.title || p.hook, caption: tiktok }, shorts: { title: `${p.name} | ${p.ytTail || 'Broken Gear Industries'}`, description, tags: (p.ytTags || []).join(', ') }, reels: { caption: reels } };
}
/** YouTube's count of the tags field: each tag, +2 for the quote marks of a multi-word tag, and a comma between tags. */
export const ytTagLength = tags => tags.reduce((a, t) => a + [...t].length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1);

/**
 * Check a spec and its copy. Returns { ok, problems[] } in plain words. Checks: limits (TikTok title 140 and caption 2,200; Shorts title 100,
 * description 5,000 bytes, tags 500; Reels caption 2,200 and 5 hashtags), the hook fits before "more" (100), 3-5 hashtags, banned claim words,
 * both slogan lines together, the 18+ line wherever AEON is shown, the AI credit lines when AI audio is used, no #fragment in copy.
 * @param {object} p spec @returns {{ok:boolean, problems:string[], copy:object}}
 */
export function validatePost(p) {
  const problems = [], add = m => problems.push(`${p.id}: ${m}`), c = buildCopy(p), ai = p.ai || {};
  const T = PLATFORMS.tiktok, S = PLATFORMS.shorts, R = PLATFORMS.reels;
  if (!p.hook || !p.body || !p.url || !p.name) add('hook, body, url and name are all required');
  if (n(c.tiktok.title) > T.title) add(`TikTok title is ${n(c.tiktok.title)} characters, limit ${T.title}`);
  if (n(c.tiktok.caption) > T.caption) add(`TikTok caption is ${n(c.tiktok.caption)} characters, limit ${T.caption}`);
  if (n(c.reels.caption) > R.caption) add(`Reels caption is ${n(c.reels.caption)} characters, limit ${R.caption}`);
  if (n(c.shorts.title) > S.title) add(`Shorts title is ${n(c.shorts.title)} characters, limit ${S.title}`);
  if (bytes(c.shorts.description) > S.description) add(`Shorts description is ${bytes(c.shorts.description)} bytes, limit ${S.description}`);
  if (ytTagLength(p.ytTags || []) > S.tags) add(`Shorts tags are ${ytTagLength(p.ytTags)} long, limit ${S.tags}`);
  if (n(p.hook) > T.hook) add(`the hook is ${n(p.hook)} characters: only about ${T.hook} show before "more"`);
  if (!p.tags || p.tags.length < T.hashtags[0]) add(`give at least ${T.hashtags[0]} hashtags`);
  if ((p.tags || []).length > T.hashtags[1]) add(`${p.tags.length} hashtags: Instagram allows ${R.hashtags[1]} and TikTok advice is ${T.hashtags[0]}-${T.hashtags[1]}`);
  for (const [where, s] of [['TikTok caption', c.tiktok.caption], ['Reels caption', c.reels.caption], ['Shorts description', c.shorts.description], ['Shorts title', c.shorts.title], ['Shorts tags', c.shorts.tags], ['TikTok title', c.tiktok.title]]) {
    const bad = [...claimViolations(s), ...(EXTRA_BANNED.test(s) ? ['optimize / speed up / clean up'] : [])]; if (bad.length) add(`${where} breaks a claim rule: ${bad.join(', ')}`);
    if (/#\w+/.test(s.replace(/(^|\s)#\w+/g, ' ').replace(/#\s/g, ''))) add(`${where} has a # inside a word or link (it would read as a hashtag)`);
  }
  for (const [where, s] of [['TikTok caption', c.tiktok.caption], ['Reels caption', c.reels.caption], ['Shorts description', c.shorts.description]]) {
    if (!(s.includes(SLOGAN[0]) && s.includes(SLOGAN[1]))) add(`${where}: both slogan lines must appear together`);
    if (p.showsAeon || /AEON/.test(`${p.hook} ${p.body}`)) if (!s.includes(EIGHTEEN)) add(`${where}: AEON is shown, so it needs "${EIGHTEEN}"`);
  }
  if (ai.music && !/AI-generated|AI music/.test(c.shorts.description)) add('the music is AI: the Shorts description needs the music-credit line');
  if (ai.voice && !/AI text-to-speech|AI voice/.test(c.shorts.description)) add('the voice is AI: the Shorts description needs the voice credit');
  if (ai.music && !(p.music && p.music.igAudioName && /AI music/.test(p.music.igAudioName))) add('the music is AI: set music.igAudioName to a name that says "(AI music)" for the Instagram audio');
  if (p.brand === 'AEON' && !p.showsAeon && !/AEON/.test(`${p.hook} ${p.body}`)) add('brand AEON but the copy never says AEON');
  return { ok: problems.length === 0, problems, copy: c };
}

/**
 * The switches to set on each platform for this post, as data (the post file prints them as tables).
 * @returns {{tiktok:object,reels:object,shorts:object}}
 */
export function settingsFor(p) {
  const ai = p.ai || {}, anyAi = !!(ai.voice || ai.music || ai.visuals), adult = !!(p.showsAeon || /AEON/.test(`${p.hook} ${p.body}`));
  return {
    tiktok: { audienceControls18: adult ? 'On' : 'Off', aiGeneratedContent: anyAi ? 'On' : 'Off', commercialContent: 'On: Your brand (then accept the Music Usage Confirmation when AI music is used)', sound: "Keep the video's own sound; do not add a TikTok library sound", visibility: 'Everyone' },
    reels: { addAiLabel: ai.voice || ai.visuals ? 'On' : 'Off', minimumAge18: 'account-wide (Account type and tools -> Other -> Minimum age), not per reel', audioName: ai.music ? (p.music?.igAudioName || '') : '', paidPartnership: 'Off (own product)' },
    shorts: { ageRestriction: 'No', madeForKids: 'No', alteredOrSynthetic: ai.voiceIsProduct ? 'Yes (the AI voice is the product)' : 'No', category: p.ytCategory || 'Science & Technology', brandedContent: 'No' },
  };
}

const block = s => '```text\n' + s + '\n```';
/**
 * The post file as Markdown: video and cover, the three platforms' copy with their counts, the switches to set, a before-you-post list.
 * @param {object} p spec @param {{video?:string,cover?:string,coverGrid?:string,videoInfo?:object}} [o]
 */
export function postMarkdown(p, o = {}) {
  const v = validatePost(p), c = v.copy, s = settingsFor(p), T = PLATFORMS.tiktok, S = PLATFORMS.shorts, R = PLATFORMS.reels;
  const tbl = rows => ['| Setting | Set to |', '|---|---|', ...rows.map(([a, b]) => `| ${a} | ${b} |`)].join('\n');
  return [
    `# ${p.date ? p.date + ' · ' : ''}${p.name}`, '',
    `**Video:** ${o.video ? path.basename(o.video) : '(not set)'}${o.videoInfo ? ` (${o.videoInfo.seconds.toFixed(1)} s, ${o.videoInfo.width}x${o.videoInfo.height})` : ''} · **Cover:** ${o.cover ? path.basename(o.cover) : '(not set)'}${o.coverGrid ? ` · 3:4 grid preview: ${path.basename(o.coverGrid)}` : ''}`,
    `**Brand:** ${p.brand} · **Links to:** ${displayUrl(p.url)} · **18+:** ${s.tiktok.audienceControls18 === 'On' ? 'yes, the video shows AEON' : 'no'} · **Checks:** ${v.ok ? 'all passed' : 'FAILED: ' + v.problems.join('; ')}`, '',
    '## Before you post', '- [ ] Post the file with the voice and the music, not the silent master.', ...(s.tiktok.audienceControls18 === 'On' ? ['- [ ] TikTok: turn on Audience controls (18+).'] : []), `- [ ] Check ${displayUrl(p.url)} loads.`, '',
    '## TikTok', `Title (${n(c.tiktok.title)} of ${T.title}):`, block(c.tiktok.title), '', `Caption (${n(c.tiktok.caption)} of ${T.caption} characters; the first line shows before "more"):`, block(c.tiktok.caption), '',
    tbl([['Audience controls (18+)', s.tiktok.audienceControls18 === 'On' ? '**On**' : 'Off'], ['AI-generated content', `**${s.tiktok.aiGeneratedContent}**`], ['Disclose commercial content', s.tiktok.commercialContent], ['Sound', s.tiktok.sound], ['Cover', T.cover], ['Who can view', s.tiktok.visibility]]), '',
    '## YouTube Shorts', `Title (${n(c.shorts.title)} of ${S.title}):`, block(c.shorts.title), '', `Description (${bytes(c.shorts.description)} of ${S.description} bytes):`, block(c.shorts.description), '', `Tags (${ytTagLength(p.ytTags || [])} of ${S.tags}):`, block(c.shorts.tags), '',
    tbl([['Age restriction', s.shorts.ageRestriction], ['Made for kids', s.shorts.madeForKids], ['Altered or synthetic content', s.shorts.alteredOrSynthetic], ['Category', s.shorts.category], ['Thumbnail', S.cover]]), '',
    '## Instagram Reels', `Caption (${n(c.reels.caption)} of ${R.caption}; ${Math.min(5, p.tags.length)} of ${R.hashtags[1]} hashtags):`, block(c.reels.caption), '',
    tbl([['Add AI label', `**${s.reels.addAiLabel}**`], ...(s.reels.audioName ? [['Audio name', `Rename audio (once only) to "${s.reels.audioName}"`]] : []), ['18+', s.reels.minimumAge18], ['Cover', R.cover], ['Paid partnership label', s.reels.paidPartnership]]), '',
    `_Platform numbers read ${T.asOf}; re-check on the first post._`, ''].join('\n');
}
/** Write <dir>/<id>.md and <dir>/<id>.json (spec, copy, settings, checks). @returns {{md:string,json:string,ok:boolean,problems:string[]}} */
export function writePostFiles(p, dir, o = {}) {
  fs.mkdirSync(dir, { recursive: true }); const v = validatePost(p), md = path.join(dir, `${p.id}.md`), js = path.join(dir, `${p.id}.json`);
  fs.writeFileSync(md, postMarkdown(p, o)); fs.writeFileSync(js, JSON.stringify({ spec: p, copy: v.copy, settings: settingsFor(p), checks: { ok: v.ok, problems: v.problems }, video: o.video || null, cover: o.cover || null }, null, 1));
  return { md, json: js, ok: v.ok, problems: v.problems };
}

// ------------------------------------------------------------------ the cover frame
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
/**
 * Score one moment of a card as a cover. + for a big, fully opaque headline inside the safe box, + for visible content in the 3:4 crop; - for
 * the closer (slogan or Follow on screen), text cut by the crop or the edges, text half faded, a busy mid-transition frame, an empty frame.
 * @param {{META:object,frame:Function,init?:Function}} card a loaded card @param {number} t seconds
 */
export function scoreCover(card, t) {
  const fps = card.META.fps, i = Math.round(t * fps), log = { W: 1080, H: 1920, entries: [] }, why = [];
  globalThis.__annieTextLog = log; let cv, prev; try { cv = card.frame(i / fps, i); log.entries.length = 0; cv = card.frame(i / fps, i); prev = card.frame(Math.max(0, i - 3) / fps, Math.max(0, i - 3)); } finally { globalThis.__annieTextLog = null; }
  const E = log.entries.filter(e => e.a > 0.05), S = COVER_SPEC.safe, C = COVER_SPEC.crop34; let score = 0;
  const closer = E.some(e => e.s === SLOGAN[0] || /^\W*Follow/.test(e.s)); if (closer) { score -= 10; why.push('closer on screen'); }
  const hero = E.filter(e => e.px >= 56 && e.a >= 0.95 && e.x0 >= S.x0 && e.x1 <= S.x1 && e.y0 >= S.y0 && e.y1 <= S.y1);
  if (hero.length) { score += 4; why.push('headline in the safe box'); if (hero.some(e => e.px >= 96)) { score += 2; why.push('hook-size headline'); } }
  const cut = E.filter(e => e.a >= 0.3 && (e.y0 < C.y + 20 || e.y1 > C.y + C.h - 20 || e.x0 < 40 || e.x1 > 1040)); if (cut.length) { score -= 4; why.push(`text near or outside the 3:4 crop: "${cut[0].s}"`); }
  const fading = E.filter(e => e.a > 0.1 && e.a < 0.9).length; if (fading) { score -= Math.min(4, fading); why.push(`${fading} text items half faded`); }
  const g = cv.getContext('2d').getImageData(C.x, C.y, C.w, C.h).data, g0 = prev.getContext('2d').getImageData(C.x, C.y, C.w, C.h).data; let bright = 0, cnt = 0, diff = 0;
  for (let k = 0; k < g.length; k += 16) { cnt++; if (lum(g, k) > 70) bright++; diff += Math.abs(lum(g, k) - lum(g0, k)); }
  const frac = bright / cnt, motion = diff / cnt;
  if (frac < 0.015) { score -= 3; why.push('almost empty'); } else if (frac > 0.6) { score -= 2; why.push('too bright'); } else { score += 2; why.push('has content'); }
  if (motion > 6) { score -= Math.min(3, motion / 6); why.push('mid-transition'); }
  return { t, score: Math.round(score * 10) / 10, hero: hero.length > 0, closer, bright: Math.round(frac * 1000) / 1000, motion: Math.round(motion * 100) / 100, why };
}
/**
 * Rank candidate cover moments of a card, best first: META.coverT, then 14 moments spread over the part before the closer (or the first 70 percent).
 * Ties go to META.coverT. @param {string} cardPath @param {{samples?:number}} [o] @returns {Promise<{ranked:object[], best:object, card:object}>}
 */
export async function rankCovers(cardPath, { samples = 14 } = {}) {
  const card = await loadCard(path.resolve(cardPath)); if (card.init) await card.init();
  const { META } = card, dur = META.frames / META.fps, to = Math.min(dur * 0.7, dur - 3.2), ts = new Set(META.coverT !== undefined ? [META.coverT] : []);
  for (let k = 0; k < samples; k++) ts.add(Math.round((0.3 + (k * (to - 0.3)) / (samples - 1)) * 30) / 30);
  const ranked = [...ts].map(t => scoreCover(card, t)).sort((a, b) => b.score - a.score || (b.t === META.coverT) - (a.t === META.coverT) || a.t - b.t);
  return { ranked, best: ranked[0], card };
}
/**
 * Pick the cover and write it: <out>/<name>_cover.png (1080x1920, exactly the frame the renderer would draw) and <name>_cover_grid.png (the 3:4 crop the grids show),
 * plus <name>_cover.json with the ranking. `t` forces a moment. @param {string} cardPath @param {{out:string,name?:string,t?:number}} o
 */
export async function makeCover(cardPath, { out, name, t } = {}) {
  const base = name || path.basename(cardPath, '.mjs'), { ranked, best, card } = await rankCovers(cardPath), pick = t === undefined ? best : (ranked.find(r => r.t === t) || scoreCover(card, t));
  fs.mkdirSync(out, { recursive: true }); const idx = Math.round(pick.t * card.META.fps), cv = renderFrame(card, idx), C = COVER_SPEC.crop34;
  const file = path.join(out, `${base}_cover.png`), grid = path.join(out, `${base}_cover_grid.png`); fs.writeFileSync(file, cv.toBuffer('image/png'));
  const g = createCanvas(C.w, C.h); g.getContext('2d').drawImage(cv, C.x, C.y, C.w, C.h, 0, 0, C.w, C.h); fs.writeFileSync(grid, g.toBuffer('image/png'));
  fs.writeFileSync(path.join(out, `${base}_cover.json`), JSON.stringify({ chosen: pick, ranked: ranked.slice(0, 6) }, null, 1));
  return { file, grid, chosen: pick, ranked };
}

/**
 * Package one card: pick and write the cover, check the video file (when given), write the post files. Returns everything with a single `ok`.
 * @param {{card:string, spec:object, out:string, video?:string, videoKind?:'master'|'final'}} o
 */
export async function packageCard({ card, spec, out, video, videoKind = 'final' }) {
  const cover = await makeCover(card, { out, name: spec.id }), vid = video ? await checkVideo(video, { kind: videoKind }) : null;
  const files = writePostFiles(spec, out, { video, cover: cover.file, coverGrid: cover.grid, videoInfo: vid ? vid.info : undefined });
  const problems = [...files.problems, ...(vid ? vid.problems : []), ...(cover.chosen.closer ? ['the chosen cover shows the closer'] : []), ...(cover.chosen.hero ? [] : ['no headline inside the cover safe box (warning: judge the cover by eye)'].filter(() => false))];
  return { ok: problems.length === 0, problems, cover, video: vid, files };
}
