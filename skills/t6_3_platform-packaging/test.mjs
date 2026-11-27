#!/usr/bin/env node
// t6.3 test: video-file checks on real encodes, the post copy reproduced byte for byte against the 20 existing post files, the rules
// (limits, claims, 18+, AI labels, music credit), cover ranking on the ported tt10 and the demo, then the demo render + QC.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSkillTest } from '../../engine/testkit.mjs';
import { renderCard, run, FFMPEG, loadCard } from '../../engine/render.mjs';
import { loadImage } from '../../engine/index.mjs';
import { PLATFORMS, VIDEO_SPEC, COVER_SPEC, checkVideo, buildCopy, validatePost, settingsFor, displayUrl, ytTagLength, writePostFiles, postMarkdown, rankCovers, scoreCover, makeCover, packageCard } from './module.mjs';
import { POSTS } from '/Users/cris/Desktop/Reports/Agents/VP_AEON/2026-10-27/Assets_Icons_Media/TikTok_Demos/source/posts/posts-data.mjs';

const here = import.meta.dirname, TT10 = path.join(here, '../t6_2_batch-render-and-cache/ported/tt10_ops_hr.mjs');
const REF = '/Users/cris/Desktop/Reports/Agents/VP_AEON/2026-10-27/Assets_Icons_Media/TikTok_Demos/posts/';
// mappings transcribed from source/posts/gen-posts.mjs (the generator that wrote the 20 reference files)
const SHOWS_AEON = new Set(['tt1_kinetic_cog', 'tt2_terminal_hook', 'tt3_story_cards', 'tt4_rent_vs_own', 'tt5_memory_switch', 'tt6_failover', 'tt7_three_ways', 'tt8_bgi_lineup', 'tt11_ask_files', 'tt13_block_store', 'tt15_orion_search', 'tt17_voice_studio', 'tt19_cookbook', 'tt20_studio_story']);
const KIND = { tt9_macsense: 'macsense', tt16_local_ai_check: 'macsense', tt12_news_scanner: 'news', tt17_voice_studio: 'store', tt13_block_store: 'store', tt10_ops_hr: 'services', tt14_demos: 'services', tt18_career_services: 'careers', tt8_bgi_lineup: 'studio', tt20_studio_story: 'studio' };
const YT_TAIL = { aeon: 'AEON by Broken Gear Industries', macsense: 'MacSense for Mac', news: 'BGI Global News Scanner', store: 'AEON Block Store', services: 'Broken Gear Industries', careers: 'Broken Gear Industries', studio: 'Broken Gear Industries' };
const YT_TAGS = { aeon: ['AEON', 'AEON AI', 'Aeon AI workspace', 'AEON app', 'free AI workspace', 'Broken Gear Industries', 'BGI'], macsense: ['MacSense', 'Mac Sense', 'Mac health', 'Broken Gear Industries', 'BGI'],
  news: ['BGI Global News Scanner', 'BGI News Scanner', 'world news map', 'Broken Gear Industries', 'BGI'], store: ['AEON', 'AEON Block Store', 'Voice Studio', 'AEON add-ons', 'Broken Gear Industries', 'BGI'],
  services: ['Broken Gear Industries', 'BGI', 'custom ops software', 'HR tools', 'small business software'], careers: ['Broken Gear Industries', 'BGI', 'resume writing', 'ATS resume', 'career services'], studio: ['Broken Gear Industries', 'BGI', 'Broken Gear', 'AEON', 'MacSense'] };
const specOf = p => { const k = KIND[p.card] || 'aeon'; return { id: p.card, date: p.date, brand: p.brand, name: p.name, hook: p.hook, body: p.body, tags: p.tags, url: p.url, credit: p.credit, showsAeon: SHOWS_AEON.has(p.card), ytTail: YT_TAIL[k], ytTags: YT_TAGS[k],
  ai: { voice: true, music: true, voiceIsProduct: p.card === 'tt17_voice_studio' }, music: { igAudioName: 'Ready For Tomorrow (AI music) · Broken Gear Industries' } }; };
const good = () => specOf(POSTS.find(p => p.card === 'tt10_ops_hr')), aeon = () => specOf(POSTS.find(p => p.card === 'tt1_kinetic_cog'));
const pngSize = async f => { const im = await loadImage(f); return [im.width, im.height]; };

await runSkillTest({ dir: here, checks: async ({ ok, near, section }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't63_'));
  try {
    section('specs');
    ok(['tiktok', 'reels', 'shorts'].every(k => PLATFORMS[k] && PLATFORMS[k].asOf && PLATFORMS[k].recheck), 'three platforms, each dated and marked re-check');
    ok(PLATFORMS.tiktok.title === 140 && PLATFORMS.tiktok.caption === 2200 && PLATFORMS.shorts.title === 100 && PLATFORMS.shorts.description === 5000 && PLATFORMS.reels.hashtags[1] === 5, 'limits: TikTok title 140 and caption 2,200, Shorts title 100 and description 5,000, Reels 5 hashtags');
    ok(VIDEO_SPEC.width === 1080 && VIDEO_SPEC.height === 1920 && COVER_SPEC.crop34.h === 1440 && COVER_SPEC.crop34.y === 240, 'video 1080x1920; the 3:4 crop is 1440 px tall from y 240');
    near(ytTagLength(['AEON', 'BGI app']), 14, 0, 'tag length of "AEON, BGI app" = 4 + 7 + 2 + 1');
    ok(displayUrl('brokengearindustries.com/#demos') === 'brokengearindustries.com (Demos section)' && displayUrl('brokengearindustries.com/store#voice_studio') === 'brokengearindustries.com/store', 'a #fragment never reaches a caption');

    section('video file checks');
    const hello = path.join(here, '../../engine/examples/hello_card.mjs'), master = (await renderCard(hello, { out: tmp, name: 'm', range: [0, 1] })).mp4;
    const prev = (await renderCard(hello, { out: tmp, name: 'p', range: [0, 1], preview: true })).mp4;
    const c1 = await checkVideo(master, { kind: 'master' }); ok(c1.ok && c1.info.width === 1080 && c1.info.fps === 30 && c1.info.codec === 'h264' && c1.info.pixFmt === 'yuv420p' && !c1.info.audio, `a full-size silent master passes: ${c1.problems}`);
    ok(c1.warnings.some(w => /under 3 s/.test(w)), 'a 1 s clip gets the too-short warning');
    const c2 = await checkVideo(prev, { kind: 'master' }); ok(!c2.ok && c2.problems.some(p => /540x960/.test(p)), `a preview-size file fails: ${c2.problems}`);
    const aud = path.join(tmp, 'aud.mp4'); await run(FFMPEG, ['-y', '-i', master, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'copy', '-c:a', 'aac', aud]);
    const c3 = await checkVideo(aud, { kind: 'master' }), c4 = await checkVideo(aud, { kind: 'final' }); ok(!c3.ok && c3.problems.some(p => /silent/.test(p)), 'a master with sound fails'); ok(c4.ok && c4.info.audio && !c4.warnings.some(w => /no audio/.test(w)), 'a final file with sound passes');
    const c5 = await checkVideo(master, { kind: 'final' }); ok(c5.ok && c5.warnings.some(w => /no audio/.test(w)), 'a final file with no sound gets a warning');
    const f24 = path.join(tmp, 'f24.mp4'); await run(FFMPEG, ['-y', '-i', master, '-r', '24', '-c:v', 'libx264', '-an', f24]); const c6 = await checkVideo(f24, { kind: 'master' }); ok(!c6.ok && c6.problems.some(p => /24 fps/.test(p)), `24 fps fails: ${c6.problems}`);

    section('copy = the 20 existing post files');
    let same = 0, total = 0, wrong = [];
    for (const p of POSTS) {
      const s = specOf(p), c = buildCopy(s), v = validatePost(s), md = fs.readFileSync(`${REF}week${String(p.week).padStart(2, '0')}_${p.card}.md`, 'utf8'), blocks = [...md.matchAll(/```text\n([\s\S]*?)\n```/g)].map(m => m[1]);
      [c.tiktok.caption, c.shorts.title, c.shorts.description, c.shorts.tags, c.reels.caption].forEach((e, i) => { total++; if (blocks[i] === e) same++; else wrong.push(`${p.card}#${i}`); });
      if (!v.ok) wrong.push(`${p.card} invalid: ${v.problems}`);
    }
    ok(same === total && total === 100, `all ${total} text blocks (TikTok caption, Shorts title, description, tags, Reels caption of 20 posts) match the reference files byte for byte ${wrong.join(' ')}`);
    ok(POSTS.length === 20, 'twenty reference posts');

    section('rules');
    const bad = (mut, re, msg) => { const s = good(); mut(s); const v = validatePost(s); ok(!v.ok && v.problems.some(p => re.test(p)), `${msg}: ${v.problems.join(' | ') || 'no problem found'}`); };
    ok(validatePost(good()).ok, 'the sample BGI post validates');
    bad(s => { s.title = 'x'.repeat(141); }, /TikTok title is 141/, 'a TikTok title of 141 characters is caught');
    ok(validatePost({ ...good(), title: 'x'.repeat(140) }).ok, 'a title of exactly 140 characters passes');
    bad(s => { s.tags = [...s.tags, 'one', 'two']; }, /hashtags/, 'seven hashtags are caught'); bad(s => { s.tags = ['a']; }, /at least 3/, 'one hashtag is caught');
    bad(s => { s.body += ' Your files stay private.'; }, /claim rule/, 'a banned claim word is caught'); bad(s => { s.body += ' We optimize your week.'; }, /claim rule/, '"optimize" is caught');
    bad(s => { s.hook = 'h'.repeat(101); }, /hook is 101/, 'a hook over 100 characters is caught'); bad(s => { s.name = 'n'.repeat(90); }, /Shorts title/, 'a Shorts title over 100 is caught');
    bad(s => { s.body += ' See brokengearindustries.com/#about for more.'; }, /#/, 'a # inside a link is caught');
    bad(s => { s.ai.musicCredit = 'Music by us.'; }, /music-credit/, 'AI music without its credit line is caught'); bad(s => { s.music = {}; }, /igAudioName|AI music/, 'AI music without the Instagram audio name is caught');
    bad(s => { s.ytTags = ['word '.repeat(100)]; }, /tags are/, 'YouTube tags over 500 are caught');
    const a = aeon(), ca = buildCopy(a), sa = settingsFor(a), g = good(), cg = buildCopy(g), sg = settingsFor(g);
    ok([ca.tiktok.caption, ca.reels.caption, ca.shorts.description].every(s => s.includes('AEON is for adults: 18+, or the age of majority where you live.')), 'an AEON post carries the 18+ line on all three platforms');
    ok(sa.tiktok.audienceControls18 === 'On' && sg.tiktok.audienceControls18 === 'Off', 'TikTok Audience controls (18+): On for AEON, Off for BGI-only');
    ok(![cg.tiktok.caption, cg.reels.caption, cg.shorts.description].some(s => s.includes('18+')), 'a BGI-only post does not carry the AEON line');
    ok(sa.tiktok.aiGeneratedContent === 'On' && sa.reels.addAiLabel === 'On' && sa.shorts.ageRestriction === 'No' && sa.reels.audioName.includes('(AI music)'), 'AI label on for TikTok and Reels, YouTube age restriction No, the Reels audio named (AI music)');
    ok(/The music is AI-generated \(Google Gemini\)\./.test(cg.shorts.description) && /The voice is AI text-to-speech/.test(cg.shorts.description), 'the Shorts description carries the voice and music credit lines');
    ok(settingsFor(specOf(POSTS.find(p => p.card === 'tt17_voice_studio'))).shorts.alteredOrSynthetic.startsWith('Yes'), 'when the AI voice is the product, YouTube altered/synthetic is Yes');
    ok(settingsFor({ ...g, ai: { voice: false, music: false } }).tiktok.aiGeneratedContent === 'Off', 'no AI: no label');

    section('post files');
    const w = writePostFiles(g, tmp, { video: master, cover: path.join(tmp, 'c.png') }), md = fs.readFileSync(w.md, 'utf8'), js = JSON.parse(fs.readFileSync(w.json, 'utf8'));
    ok(w.ok && ['## TikTok', '## YouTube Shorts', '## Instagram Reels', 'Title (', 'Caption (', 'Audience controls (18+) | Off', 'AI-generated content | **On**', 'Checks:** all passed'].every(s => md.includes(s)), 'the post file has the three platform sections, counts, settings and the check result');
    ok(js.checks.ok && js.copy.tiktok.caption === buildCopy(g).tiktok.caption && js.settings.tiktok.aiGeneratedContent === 'On', 'the json twin matches');
    ok(postMarkdown({ ...g, tags: ['a'] }).includes('FAILED'), 'a failing post says FAILED at the top of its file');

    section('cover frame: ported tt10 and the demo');
    const t0 = Date.now(), r = await rankCovers(TT10); const card = r.card;
    ok(r.ranked.length >= 14 && r.ranked.some(x => x.t === 1.2), `${r.ranked.length} candidates including META.coverT 1.2 (${Math.round((Date.now() - t0) / 100) / 10} s)`);
    ok(r.best.hero && !r.best.closer && r.best.t < 13.15 && r.best.score >= 6, `tt10's best cover is a hook-size headline before the closer: t ${r.best.t}, score ${r.best.score} (${r.best.why.join('; ')})`);
    const last = scoreCover(card, 16.4); ok(last.closer && last.score < r.best.score - 8, `the closer frame scores ${last.score}: ${last.why[0]}`);
    const early = scoreCover(card, 0.0), mid = scoreCover(card, 4.95); ok(early.score < r.best.score && (mid.why.some(x => /faded|transition/.test(x)) || mid.score < r.best.score), `a half-faded or mid-transition moment scores lower (t 4.95: ${mid.score})`);
    const cov = await makeCover(TT10, { out: tmp, name: 'tt10' }), [cw, ch] = await pngSize(cov.file), [gw, gh] = await pngSize(cov.grid);
    ok(cw === 1080 && ch === 1920 && gw === 1080 && gh === 1440, `cover is ${cw}x${ch}, grid crop ${gw}x${gh}`); const again = await makeCover(TT10, { out: path.join(tmp, 'again'), name: 'tt10' });
    ok(fs.readFileSync(cov.file).equals(fs.readFileSync(again.file)), 'making the cover twice gives the same bytes');
    const dr = await rankCovers(path.join(here, 'demo.mjs')); ok(dr.best.hero && !dr.best.closer, `the demo's own best cover is a headline frame (t ${dr.best.t})`);

    section('package a real card end to end');
    const pk = await packageCard({ card: TT10, spec: good(), out: path.join(tmp, 'pk'), video: master, videoKind: 'master' });
    ok(pk.ok && fs.existsSync(pk.files.md) && fs.existsSync(pk.cover.file) && fs.readFileSync(pk.files.md, 'utf8').includes('tt10_ops_hr_cover.png'), `tt10 is packaged: ${pk.problems.join('; ') || 'cover, checks and post file written'}`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
} });
