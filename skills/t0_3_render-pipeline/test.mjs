#!/usr/bin/env node
// t0.3 test: unit checks of the pipeline helpers (including a real render + probe) + render the demo + run the quality checker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSkillTest } from '../../engine/testkit.mjs';
import { framesFor, secondsFor, workerOf, estimateSeconds, preflight, frameHash, renderTo, probe, exists } from './module.mjs';

const FIX = path.join(import.meta.dirname, '../../engine/tests/fixtures');
await runSkillTest({ dir: import.meta.dirname, checks: async ({ ok, near }) => {
  ok(framesFor(7.5) === 225 && secondsFor(225) === 7.5, 'frames and seconds'); ok([0, 1, 2, 3, 4].map(i => workerOf(i, 2)).join() === '0,1,0,1,0', 'workers deal frames round-robin');
  near(estimateSeconds(225, { preview: false }), 17.3, 0.3, 'estimate matches the measured full-size render'); ok(estimateSeconds(225, { preview: true }) < estimateSeconds(225), 'preview is faster');
  ok((await preflight(path.join(FIX, 'clean_card.mjs'))).some(p => /5-8 s/.test(p)) && !(await preflight(path.join(FIX, 'clean_card.mjs'))).some(p => /determin/.test(p)), 'preflight flags a 3 s card and passes determinism');
  const demo = path.join(import.meta.dirname, 'demo.mjs'); ok((await preflight(demo)).length === 0, 'the demo passes preflight');
  ok((await frameHash(demo, 90, { preview: true })) === (await frameHash(demo, 90, { preview: true })), 'a frame hashes the same twice'); ok((await frameHash(demo, 90)) !== (await frameHash(demo, 91)), 'neighbouring frames differ');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't03_')), r = await renderTo(path.join(FIX, 'clean_card.mjs'), tmp, { preview: true, workers: 2 });
  ok(exists(r.mp4) && exists(r.contact), 'renderTo writes the mp4 and the contact sheet'); const p = await probe(r.mp4);
  ok(p.width === 540 && p.height === 960 && p.fps === 30 && !p.audio && Math.abs(p.seconds - 3) < 0.05 && p.codec === 'h264', `probe reads the file: ${JSON.stringify(p)}`);
  const r2 = await renderTo(path.join(FIX, 'clean_card.mjs'), tmp, { preview: true, workers: 1, name: 'one' }); ok(r2.framesHash === r.framesHash, '1 worker and 2 workers give identical frames');
  const rg = await renderTo(path.join(FIX, 'clean_card.mjs'), tmp, { preview: true, name: 'range', range: [1, 2] }); ok(rg.frames === 31 && /_range\.mp4$/.test(rg.mp4), '--range renders only those seconds');
  fs.rmSync(tmp, { recursive: true, force: true });
} });
