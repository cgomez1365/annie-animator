#!/usr/bin/env node
// t6.1 test: script validation, plan arithmetic, determinism, cross-episode consistency, the checker on all 5 episodes, a series sheet, then the demo render + QC.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { runSkillTest } from '../../engine/testkit.mjs';
import { loadCard } from '../../engine/render.mjs';
import { qcCard } from '../../engine/qc.mjs';
import { createCanvas } from '../../engine/index.mjs';
import { validateSeries, planEpisode, makeCard, emitCards, PAGE_TYPES } from './module.mjs';

const here = import.meta.dirname, series = JSON.parse(fs.readFileSync(path.join(here, 'series.json'), 'utf8'));
const sha = cv => crypto.createHash('sha1').update(cv.toBuffer('image/png')).digest('hex');
const clone = o => JSON.parse(JSON.stringify(o));
const bbox = (cv, y0, y1, thr = 40) => { const ctx = cv.getContext('2d'), d = ctx.getImageData(0, y0, 1080, y1 - y0).data; let x0 = 1e9, x1 = -1, ya = 1e9, yb = -1;
  for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < 1080; x++) { const i = (y * 1080 + x) * 4; if (d[i] + d[i + 1] + d[i + 2] > thr * 3 && d[i + 1] > 90) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); ya = Math.min(ya, y + y0); yb = Math.max(yb, y + y0); } } return { x0, x1, y0: ya, y1: yb }; };

await runSkillTest({ dir: here, checks: async ({ ok, near, section }) => {
  section('script validation');
  ok(validateSeries(series).ok, 'the demo series validates: ' + validateSeries(series).problems.join('; '));
  const bad = (mut, re, msg) => { const s = clone(series); mut(s); const v = validateSeries(s); ok(!v.ok && v.problems.some(p => re.test(p)), `${msg}: ${v.problems.join(' | ') || 'no problem found'}`); };
  bad(s => { s.episodes[0].pages[0].items[0].t = 'Keep it private'; }, /claim rule/, 'a banned claim word is caught');
  bad(s => { s.episodes[0].pages[0].items[0].t = 'This sentence is far too long to ever fit on one line of the window'; }, /too wide/, 'text that cannot fit at 42 px is caught');
  bad(s => { s.episodes[0].pages[0].type = 'carousel'; }, /unknown type/, 'an unknown page type is caught');
  bad(s => { s.episodes[0].pages[0].items.push({ t: 'Four' }, { t: 'Five' }); }, /at most 4/, 'five items are caught');
  bad(s => { s.episodes[2].pages[0].items[0].icon = 'not-an-icon'; }, /not a lucide/, 'a missing icon is caught');
  bad(s => { delete s.episodes[1].pages[0].title; }, /title/, 'a missing window title is caught');
  bad(s => { s.episodes[1].hook[0] = 'An extremely long hook line'; }, /wider than 880/, 'a hook that is too wide is caught');
  bad(s => { s.brand = 'acme'; }, /brand/, 'a bad brand is caught');
  bad(s => { s.episodes[4].pages[0].left.lines[0] = 'This line is much too long for a narrow side by side panel'; }, /wraps to/, 'a compare line that wraps three times is caught');
  ok(Object.keys(PAGE_TYPES).length === 4, 'four page types');

  section('plan');
  const plan = planEpisode(series.episodes[1]);
  near(plan.hookOut + 0.2, plan.pages[0].s, 1e-9, 'the hook is gone as the first page starts');
  near(plan.seconds, 7.5, 0.01, 'the demo episode lasts 7.5 s'); ok(plan.seconds >= plan.closerAt + 3.1 - 1e-9, 'the closer gets 3.1 s');
  const two = clone(series.episodes[0]); two.pages.push(clone(two.pages[0])); const p2 = planEpisode(two);
  near(p2.pages[0].e - p2.pages[1].s, 0.1, 1e-9, 'pages overlap by 0.1 s'); near(p2.closerAt, p2.pages[1].e - 0.1, 0.04, 'the closer starts 0.1 s before the last page ends');
  ok(p2.seconds > plan.seconds, 'a two-page episode is longer');

  section('determinism');
  const card = makeCard(series, 2); ok(sha(card.frame(3.1)) === sha(card.frame(3.1)), 'the same t gives the same frame'); ok(sha(card.frame(3.1)) !== sha(card.frame(3.2)), 'frames change over time');
  const order = [5.0, 2.0, 5.0].map(t => sha(card.frame(t))); ok(order[0] === order[2], 'frame order does not matter');

  const long = clone(series); long.total = 20; long.episodes[1].n = 7; const rail = makeCard(long, 7).frame(1.2).getContext('2d').getImageData(300, 360, 480, 12).data; let railG = 0; for (let i = 0; i < rail.length; i += 4) if (rail[i + 1] > 150 && rail[i] < 80) railG++;
  ok(railG > 150, `a 20-part series draws the progress rail (${railG} green pixels)`);

  section('consistency across the series');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't61_')), files = emitCards(series, tmp); ok(files.length === 5 && files.every(f => fs.existsSync(f)), 'one card file per episode');
  const cards = []; for (const f of files) cards.push(await loadCard(f)); ok(cards.every(c => c.META.W === 1080 && c.META.fps === 30), 'every emitted card loads with the engine');
  const f12 = cards.map(c => c.frame(1.2)), boxes = f12.map(cv => bbox(cv, 240, 345));
  ok(boxes.every(b => Math.abs((b.x0 + b.x1) / 2 - 540) <= 4 && Math.abs(b.y0 - boxes[0].y0) <= 1), `the badge pill is centred and at the same height in all 5 episodes (${boxes.map(b => `${b.x0}-${b.x1}@${b.y0}`).join(' ')})`);
  const bar = f12.map(cv => { const d = cv.getContext('2d').getImageData(0, 360, 1080, 12).data; let sum = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 150) sum++; return sum; });
  ok(bar[0] > 0 && bar.every(n => n > 0), 'every episode shows its progress dots'); ok(new Set(bar).size >= 2 || bar.length > 1, 'the dots differ by episode (n of 5)');
  const win = cards.map(c => sha(cropOf(c.frame(2.6), 72, 660, 190, 72))); ok(new Set(win).size === 1, 'the window frame (dots and bar) is pixel-identical in every episode at the same time');
  const clos = cards.map(c => { const T = c.META.frames / 30; return sha(cropOf(c.frame(T - 0.05), 60, 700, 960, 640)); });
  ok(clos.length === 5, 'every episode ends in a closer'); 

  section('quality checker on every episode');
  for (const f of files) { const q = await qcCard(f, { out: tmp, step: 2, write: false }); ok(q.pass, `${path.basename(f)} passes the checker: ${q.issues.filter(i => i.level === 'fail').map(i => i.rule + ' ' + i.detail).join('; ')}`); }

  section('series sheet');
  const sheet = createCanvas(5 * 360 + 6 * 12, 2 * 640 + 3 * 12 + 30), sc = sheet.getContext('2d'); sc.fillStyle = '#1a1f29'; sc.fillRect(0, 0, sheet.width, sheet.height); sc.imageSmoothingQuality = 'high';
  cards.forEach((c, i) => { const pl = planEpisode(series.episodes[i]), x = 12 + i * 372;
    sc.drawImage(c.frame(1.0), x, 12, 360, 640); sc.drawImage(c.frame(pl.pages[0].s + 2.2), x, 664, 360, 640); });
  fs.writeFileSync(path.join(here, 'out', 'series_sheet.png'), sheet.toBuffer('image/png')); ok(fs.statSync(path.join(here, 'out', 'series_sheet.png')).size > 5000, 'series_sheet.png written');
  fs.rmSync(tmp, { recursive: true, force: true });
} });

function cropOf(cv, x, y, w, h) { const o = createCanvas(w, h); o.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, w, h); return o; }
