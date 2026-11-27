// t7.3 test: the curve library, the cog (ratchet, click, mesh geometry), the rules, the static analyser, and the card scorer on good, mixed and bad cards;
// then the shared render + QC run on the demo.   node test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/canvas.mjs';
import * as M from './module.mjs';

const ENGINE = path.resolve(import.meta.dirname, '../../engine');
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 't73-'));
const GOOD = path.join(ENGINE, 'examples/hello_card.mjs');
// variants of a known-good card, written to tmp with absolute engine imports
const variant = (name, edit) => { let s = fs.readFileSync(GOOD, 'utf8').replace(/from '\.\.\/index\.mjs'/g, `from '${ENGINE}/index.mjs'`); s = edit(s); const f = path.join(tmp, name + '.mjs'); fs.writeFileSync(f, s); return f; };

await runSkillTest({ dir: import.meta.dirname, checks: async ({ ok, near, section }) => {
  section('curve library');
  for (const n of Object.keys(M.CURVES)) { near(M.curve(n, 0), 0, 1e-6, `${n} starts at 0`); ok(M.curve(n, 1) > 0.98 && M.curve(n, 1) < 1.02, `${n} ends at 1 (${M.curve(n, 1).toFixed(3)})`); }
  for (const n of ['enter', 'exit', 'glide', 'breathe']) near(M.overshoot(n), 0, 1e-6, `${n} never overshoots`);
  ok(M.overshoot('pop') > 0.08 && M.overshoot('pop') < 0.12, `pop overshoots about 10 percent (${(M.overshoot('pop') * 100).toFixed(1)})`);
  ok(M.overshoot('click') > 0.04 && M.overshoot('click') < 0.08, `click overshoots 4-8 percent (${(M.overshoot('click') * 100).toFixed(1)})`);
  ok(M.overshoot('slam') > 0.3 && M.overshoot('slam') < 0.45, `slam overshoots 30-45 percent (${(M.overshoot('slam') * 100).toFixed(1)})`);
  ok(M.overshoot('click') < M.overshoot('pop') && M.overshoot('pop') < M.overshoot('slam'), 'overshoot order: click < pop < slam');
  for (const [n, c] of Object.entries(M.CURVES)) { const r = c.dur || c.period; ok(r[0] >= 0.15 && r[1] <= 2.0 && r[0] < r[1], `${n} duration range ${r} is sane`); }
  ok(M.CURVES.click.dur[1] < M.CURVES.pop.dur[0], 'a click is faster than a pop');
  near(M.play('enter', 0.5, 1), 0, 1e-9, 'play: nothing before t0'); near(M.play('enter', 2, 1), 1, 1e-9, 'play: complete after the duration'); near(M.play('exit', 1.175, 1, 0.35), 0.125, 0.01, 'play: exit is slow at first (inCubic 0.5 -> 0.125)');
  let threw = false; try { M.curve('nope', 0.5); } catch { threw = true; } ok(threw, 'unknown curve throws');
  ok(M.sampleCurve('pop', 20).length === 21, 'sampleCurve returns n+1 points'); ok(M.breathe(0) === 0.5 && Math.abs(M.breathe(0.4) - 1) < 1e-9, 'breathe is a sine of period 1.6 s');

  section('the cog: gear and ratchet');
  const gp = M.gearPoints(0, 0, 100, 12, 0), m = 100 / 12; ok(gp.length === 48, '12 teeth = 48 outline points');
  const rr = gp.map(p => Math.hypot(...p)); near(Math.max(...rr), 100 + m, 1e-9, 'tip radius = rp + module'); near(Math.min(...rr), 100 - 1.25 * m, 1e-9, 'root radius = rp - 1.25 module');
  const P1 = 2 * Math.PI / 12, st = n => M.ratchetAngle(0.5 + n * 0.6 + 0.28 + 1e-9, { t0: 0.5 });
  near(M.ratchetAngle(0.2, { t0: 0.5 }), 0, 0, 'before t0 the cog is still'); for (const n of [0, 1, 5, 11]) near(st(n), (n + 1) * P1, 1e-6, `after click ${n} the cog sits exactly on tooth ${n + 1}`);
  let peak = 0, vmax = 0, prev = 0; for (let i = 0; i <= 600; i++) { const a = M.ratchetAngle(i / 100, { t0: 0 }), within = a - Math.floor(a / P1 - 1e-9) * P1; peak = Math.max(peak, a - Math.round(a / P1) * P1 > 0 ? a - Math.floor(a / P1 + 1e-9) * P1 : 0); vmax = Math.max(vmax, Math.abs(a - prev) * 100); prev = a; }
  const over = (() => { let mx = 0; for (let i = 0; i < 400; i++) { const u = i / 400 * 0.28, a = M.ratchetAngle(u, { t0: 0 }); mx = Math.max(mx, a - P1); } return mx / P1; })();
  ok(over > 0.04 && over < 0.08, `a click overshoots its tooth by ${(over * 100).toFixed(1)} percent (4-8)`);
  const avg = P1 / 0.6; ok(vmax > 3 * avg, `snap speed ${(vmax).toFixed(1)} rad/s is over 3x the average ${avg.toFixed(2)}: it clicks, it does not cruise`);
  near(M.ratchetAngle(0.45, {}) - M.ratchetAngle(0.4, {}), 0, 1e-12, 'held between clicks (zero velocity)'); near(M.ratchetAngle(11 * 0.6 + 0.28 + 0.1, {}), 2 * Math.PI, 1e-6, '12 clicks = exactly one full turn (done at 6.88 s)');
  ok(M.CLICK_IMPACT > 0.3 && M.CLICK_IMPACT < 0.6, `impact lands ${M.CLICK_IMPACT.toFixed(3)} of the way into a click`);
  ok(M.clickPulse(0.05, {}) === null, 'no click before the first impact'); const imp = M.CLICK_IMPACT * 0.28; near(M.clickPulse(imp + 1e-6, {}).k, 1, 1e-3, 'envelope is 1 at the impact'); near(M.clickPulse(imp + 0.31, {}).k, 0, 1e-9, 'envelope is 0 after 0.3 s'); ok(M.clickPulse(imp + 0.6 + 0.01, {}).n === 1, 'second click is step 1');
  const sh0 = M.clickShake(imp + 0.4, {}); ok(sh0[0] === 0 && sh0[1] === 0, 'no shake between clicks'); let shm = 0; for (let i = 0; i < 40; i++) { const s = M.clickShake(imp + i / 100, {}, 3); shm = Math.max(shm, Math.hypot(...s)); } ok(shm > 0.5 && shm <= 3.5, `shake peaks at ${shm.toFixed(2)} px (limit 3)`);

  section('the cog: meshed pair geometry (pixels)');
  const overlap = (angA, wrong) => {
    const pair = M.meshedPair(angA, { cx: 200, cy: 300, rpA: 120 }); if (wrong) pair.B.angle = -angA * 12 / 18;
    const draw = g => { const cv = createCanvas(800, 600), c = cv.getContext('2d'); M.drawGear(c, g.cx, g.cy, g.rp, g.teeth, g.angle, { fill: '#fff', hole: 0 }); return c.getImageData(0, 0, 800, 600).data; };
    const a = draw(pair.A), b = draw(pair.B); let o = 0; for (let i = 3; i < a.length; i += 4) if (a[i] > 128 && b[i] > 128) o++; return o;
  };
  const pr = M.meshedPair(0.7, { cx: 200, cy: 300, rpA: 100 }); near(pr.B.cx - pr.A.cx, pr.A.rp + pr.B.rp, 1e-9, 'centres are rpA + rpB apart'); near(pr.B.rp, 150, 1e-9, 'rpB = rpA x teethB / teethA');
  let worst = 0; for (const a of [0, 0.31, 0.9, 1.7, 2.6, 3.9, 5.2]) worst = Math.max(worst, overlap(a, false)); ok(worst <= 3, `teeth never collide at 7 angles (worst overlap ${worst} px)`);
  let bad = 1e9; for (const a of [0, 0.9, 2.6]) bad = Math.min(bad, overlap(a, true)); ok(bad > 100, `the test is sensitive: wrong phase collides (${bad} px)`);
  const d1 = M.meshedPair(0.0, { cx: 0, cy: 0, rpA: 100 }).B.angle, d2 = M.meshedPair(P1, { cx: 0, cy: 0, rpA: 100 }).B.angle; near(d2 - d1, -P1 * 12 / 18, 1e-9, 'B turns the other way by A x 12/18');
  const mp = M.meshPoint(pr); near(mp[0], 300, 1e-9, 'contact point on the line of centres');

  section('rules');
  ok(new Set(M.RULES.map(r => r.id)).size === M.RULES.length, 'rule ids are unique'); ok(M.RULES.filter(r => r.do).length >= 8 && M.RULES.filter(r => !r.do).length >= 8, 'at least 8 do and 8 do-not rules');

  section('static analyser');
  const good = M.analyzeSource("const k = E.outBack(prog(t, 1, 1.4), 1.8); const x = E.inCubic(prog(t, T.a, T.a + 0.3)); const c = P.green; ctx.fillStyle = '#19e08f'; const f = pulse(t, 0.6); end(ctx, t, { closerAt: 4.4 }); hook(ctx, h, t); begin(t);");
  ok(good.eases.outBack === 1 && good.eases.inCubic === 1, 'counts E.* uses'); ok(good.roles.pop && good.roles.exit && good.roles.enter && good.roles.persistent, 'finds pop, enter, exit and ambient motion'); ok(good.durations.n === 2 && good.durations.tooShort.length === 0, 'parses numeric and A to A + d timings');
  ok(good.colors.off.length === 0 && good.forbidden.length === 0 && good.structure.closer && good.structure.hook, 'palette, determinism and structure read clean');
  const badA = M.analyzeSource("const a = E.linear(prog(t, 1, 1.05)); const b = track([[0,0,'inSine']]); ctx.fillStyle = '#ff00ff'; ctx.fillStyle = 'rgba(200,10,200,0.5)'; const r = Math.random(); ctx.rotate(t * 2);");
  ok(badA.eases.linear === 1 && badA.eases.inSine === 1, 'finds linear and quoted ease names'); ok(badA.durations.tooShort[0] === 0.05, 'flags a 0.05 s move'); ok(badA.colors.off.length === 2, `flags both off-palette colours (${badA.colors.off})`); ok(badA.forbidden.includes('Math.random'), 'flags Math.random'); ok(badA.constantSpin, 'flags ctx.rotate(t * k)');
  ok(M.analyzeSource('// Math.random is banned\n/* Date.now() too */ const x = 1;').forbidden.length === 0, 'comments are ignored');
  ok(M.analyzeSource('const z = E.inOutSine(prog(t, 0, 4.6));').durations.tooLong.length === 0 && M.analyzeSource('const z = E.outCubic(prog(t, 0, 4.6));').durations.tooLong.length === 1, 'a slow inOutSine camera move may run long, a slow outCubic may not');
  ok(M.onPalette([25, 224, 143]) && M.onPalette([10, 12, 16]) && M.onPalette([248, 250, 252]) && !M.onPalette([255, 0, 255]) && M.onPalette([20, 24, 30]), 'onPalette: palette and near-black shadows yes, magenta no');
  const train = Array.from({ length: 150 }, (_, i) => (i % 15 < 4 ? 0.04 : 0.002)); const cd = M.cadence(train, 1); ok(cd.events >= 9 && cd.events <= 11, `cadence counts a 2 per second pulse train (${cd.events} events in 5 s)`);
  ok(M.cadence(new Array(150).fill(0.0005), 1).events === 0, 'cadence: a flat profile has no events');

  section('scoring real cards (engine QC runs inside, about 5 s each)');
  const sGood = await M.scoreCard(GOOD); ok(sGood.score >= 90 && sGood.grade === 'on brand' && sGood.qc.pass, `engine hello_card scores ${sGood.score} (on brand, 90+)`);
  const sNoPop = await M.scoreCard(variant('nopop', s => s.replace(/E\.outBack/g, 'E.linear').replace(/E\.inOutCubic/g, 'E.inSine')));
  ok(sNoPop.score <= sGood.score - 8 && sNoPop.fixes.some(f => /linear/.test(f)), `swapping its curves for linear/inSine lowers the score: ${sGood.score} -> ${sNoPop.score}, and says why`);
  const sColor = await M.scoreCard(variant('color', s => s.replace("export function frame", "const BAD = ['#ff00ff', '#00ffff', '#ffee00'];\nexport function frame")));
  ok(sColor.score < sGood.score && sColor.parts.palette.got < 15 && sColor.fixes.some(f => /Off-palette/.test(f)), `three off-palette colours: palette ${sColor.parts.palette.got}/15, score ${sColor.score}`);
  const sRand = await M.scoreCard(variant('rand', s => s.replace("export function frame", "const R0 = Math.random();\nexport function frame")));
  ok(sRand.score <= 59 && sRand.grade === 'off brand', `a Math.random caps the score at 59 (${sRand.score})`);
  const sBad = await M.scoreCard(path.join(tmp, '..', 'none'), {}).catch(() => null); ok(sBad === null, 'a missing file throws instead of scoring');
  const badCard = path.join(tmp, 'bad_card.mjs'); fs.writeFileSync(badCard, `import { createCanvas } from '${ENGINE}/canvas.mjs';\nimport { E, prog, lerp } from '${ENGINE}/index.mjs';\nexport const META = { W: 1080, H: 1920, fps: 30, frames: 150 };\nexport function frame(t) { const cv = createCanvas(1080, 1920), ctx = cv.getContext('2d'); ctx.fillStyle = '#220033'; ctx.fillRect(0, 0, 1080, 1920); const x = lerp(100, 900, E.linear(prog(t, 0, 2))), y = lerp(500, 900, E.inSine(prog(t, 0.5, 0.55))); ctx.fillStyle = '#ff00ff'; ctx.fillRect(x + Math.random() * 3, y, 200, 200); ctx.save(); ctx.rotate(t * 3); ctx.restore(); return cv; }\n`);
  const sBadCard = await M.scoreCard(badCard); ok(sBadCard.score <= 40 && sBadCard.grade === 'off brand' && !sBadCard.qc.pass && sBadCard.fixes.length >= 5, `a deliberately off-brand card scores ${sBadCard.score} with ${sBadCard.fixes.length} fixes listed`);
  ok(sGood.score > sNoPop.score && sNoPop.score > sBadCard.score, `scores are ordered: good ${sGood.score} > curves swapped ${sNoPop.score} > off-brand ${sBadCard.score}`);
  for (const f of ['../t7_1_pseudo-3d-and-isometric/demo.mjs', '../t7_2_mesh-turntable/demo.mjs', 'demo.mjs']) { const sc = await M.scoreCard(path.resolve(import.meta.dirname, f)); ok(sc.score >= 90, `${f.split('/')[1] || f} scores ${sc.score}${sc.fixes.length ? ' (' + sc.fixes[0].slice(0, 60) + ')' : ''}`); }
} });
