// The demo's sound: one real Kokoro sentence, seven effects fired from t5.1 word cues, bed D ducked under the voice. Shared by demo.mjs and test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { buildTimeline, cue } from '../t5_1_voice-synced-scenes/module.mjs';
import { mixAudio, sfxFromCues, decodeAudio, rmsDb } from './module.mjs';

export const DIR = import.meta.dirname, VOICE_AT = 0.35, TOTAL = 7.8, CLOSER = 4.7;
/** The effect list and mix spec of the demo. @returns {{spec:object, cues:{name:string,t:number,label:string}[]}} */
export function demoSpec() {
  const F = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/voice.json'), 'utf8')), tl = buildTimeline([F.row], { pre: VOICE_AT, analyze: true, baseDir: DIR });
  const at = (w, o = {}) => cue(tl, 0, w, { lead: 0, ...o });
  const cues = [
    { name: 'whoosh', t: 0.35, label: 'new scene' }, { name: 'success', t: at('Paris'), label: 'Paris' }, { name: 'tick', t: at('very'), label: 'very' }, { name: 'chime', t: at('high'), label: 'high' },
    { name: 'stamp', t: at('Most'), label: 'Most' }, { name: 'pop', t: at('almost'), label: 'almost' }, { name: 'wrong', t: at('none'), label: 'none' },
  ];
  const sfx = sfxFromCues(cues);
  return { cues, spec: { total: TOTAL, voice: [{ file: path.join(DIR, F.row.file), at: VOICE_AT }], sfx, music: { file: path.join(DIR, 'fixtures/bed_D_16s.wav'), gain: 0.16, duck: {} } } };
}
/** Build the demo mix into out/ and write out/mix_data.json (loudness, effect times, envelopes) that demo.mjs reads. @param {string} out */
export function buildDemoAudio(out) {
  const { spec, cues } = demoSpec(); fs.mkdirSync(out, { recursive: true });
  const r = mixAudio(spec, path.join(out, 'demo_mix')); return { ...r, spec, cues };
}

/** Write out/mix_data.json: loudness, effect times and 50 ms envelopes of the three stems (what demo.mjs draws). @param {string} out @param {ReturnType<typeof buildDemoAudio>} r */
export function writeMixData(out, r) {
  const env = f => Array.from(rmsDb(decodeAudio(f).pcm, 48000, 0.05), v => +v.toFixed(1)), data = { lufs: r.loudness.lufs, truePeak: r.loudness.truePeak, hop: 0.05, voice: env(r.stems.voice), fx: env(r.stems.fx), music: env(r.stems.music), cues: r.cues };
  fs.writeFileSync(path.join(out, 'mix_data.json'), JSON.stringify(data)); return data;
}
