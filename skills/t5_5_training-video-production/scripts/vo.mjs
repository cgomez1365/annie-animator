#!/usr/bin/env node
// Voice for the long lessons (kokoro-js, local). Needs the sandbox off (phonemizer WASM).
//   node vo.mjs sample <script.json> [voice ...]   -> assets/voice_samples/voice_<voice>.wav (the opening of that script, each voice)
//   node vo.mjs lesson <lessonDir> <voice> <tag>   -> <lessonDir>/voice/<tag>/s<N>.wav + durations.json (cached per sentence)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { KokoroTTS } from 'kokoro-js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const say = s => s.replace(/\bAEON\b/g, 'Ee-on');
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32' });
const mode = process.argv[2];

if (mode === 'sample') {
  const script = JSON.parse(fs.readFileSync(path.resolve(process.argv[3]), 'utf8'));
  const text = script.scenes[0].sentences.concat(script.scenes[1].sentences.slice(0, 2)).join(' ... ');
  fs.mkdirSync(path.join(ROOT, 'assets/voice_samples'), { recursive: true });
  for (const v of process.argv.slice(4).length ? process.argv.slice(4) : ['af_heart', 'am_michael', 'af_nicole', 'bm_george']) {
    const a = await tts.generate(say(text), { voice: v, speed: 1 });
    await a.save(path.join(ROOT, `assets/voice_samples/voice_${v}.wav`));
    console.log(v, (a.audio.length / a.sampling_rate).toFixed(1) + 's');
  }
} else if (mode === 'lesson') {
  const [dir, voice, tag] = process.argv.slice(3);
  const script = JSON.parse(fs.readFileSync(path.join(dir, 'script.json'), 'utf8'));
  const out = path.join(dir, 'voice', tag); fs.mkdirSync(out, { recursive: true });
  const rows = []; let k = 0;
  for (const sc of script.scenes) for (const text of sc.sentences) {
    const h = crypto.createHash('md5').update(voice + '|' + text).digest('hex').slice(0, 10);
    const file = path.join(out, `s${String(k).padStart(2, '0')}_${h}.wav`);
    let dur;
    if (fs.existsSync(file)) {
      const b = fs.readFileSync(file); const fmt = b.readUInt16LE(20), sr = b.readUInt32LE(24), ds = b.readUInt32LE(40);
      dur = ds / (sr * (fmt === 3 ? 4 : 2));
    } else {
      const a = await tts.generate(say(text), { voice, speed: 1 });
      await a.save(file); dur = a.audio.length / a.sampling_rate;
    }
    rows.push({ i: k, text, file, dur: +dur.toFixed(3) });
    k++;
  }
  fs.writeFileSync(path.join(out, 'durations.json'), JSON.stringify(rows, null, 1));
  console.log(`${tag}: ${rows.length} sentences, ${rows.reduce((n, r) => n + r.dur, 0).toFixed(1)}s of speech`);
}
