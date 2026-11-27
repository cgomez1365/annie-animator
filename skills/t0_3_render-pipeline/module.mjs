// t0.3 render-pipeline: thin helpers around engine/render.mjs: plan a render, run it, verify it, probe a file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { renderCard, renderFrame, loadCard, FFMPEG, run } from '../../engine/render.mjs';

/** Frames needed for a duration. @param {number} seconds @param {number} [fps=30] @returns {number} */
export const framesFor = (seconds, fps = 30) => Math.round(seconds * fps);
/** Seconds that a frame count lasts. @param {number} frames @param {number} [fps=30] @returns {number} */
export const secondsFor = (frames, fps = 30) => frames / fps;

/**
 * Which worker draws frame i when `workers` run in parallel: frames are dealt round-robin (worker w gets w, w+W, w+2W...).
 * This is exactly how render.mjs splits the work. @param {number} i @param {number} workers @param {number} [first=0] first frame of the render
 * @returns {number}
 */
export const workerOf = (i, workers, first = 0) => (i - first) % workers;

/**
 * Rough wall-clock estimate in seconds, from the measured speed on the shared iMac (hello_card, 2 workers: 17.4 s for
 * 225 frames at 1080x1920 = 0.077 s/frame; 8.9 s at 540x960 = 0.040 s/frame). Heavy cards (blur, many layers) are slower.
 * It is a planning number, not a promise. @param {number} frames @param {{preview?:boolean,workers?:number}} [o]
 */
export function estimateSeconds(frames, { preview = false, workers = 2 } = {}) { return Math.round(frames * (preview ? 0.040 : 0.077) * (2 / Math.max(1, Math.min(workers, 2))) * 10) / 10; }

/**
 * Check a card's META before spending time on it: returns a list of plain-language problems (empty = fine).
 * @param {string} cardPath @returns {Promise<string[]>}
 */
export async function preflight(cardPath) {
  const problems = [];
  let card; try { card = await loadCard(cardPath); } catch (e) { return [e.message]; }
  const { META } = card, sec = META.frames / META.fps;
  if (META.fps !== 30) problems.push(`fps is ${META.fps}, must be 30`);
  if (sec < 5 || sec > 8) problems.push(`${sec.toFixed(1)} s: a demo should be 5-8 s`);
  if (META.coverT !== undefined && (META.coverT < 0 || META.coverT > sec)) problems.push('coverT is outside the card');
  const a = card.frame(0, 0), b = card.frame(0, 0);
  const ha = hashCanvas(a), hb = hashCanvas(b);
  if (ha !== hb) problems.push('frame(0) is not deterministic: it differs between two calls (Math.random, Date, or kept state?)');
  return problems;
}

/** SHA-1 of a canvas' pixels. @param {*} cv @returns {string} */
export function hashCanvas(cv) { return crypto.createHash('sha1').update(Buffer.from(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.buffer)).digest('hex'); }

/**
 * Hash of final frame i exactly as the renderer would write it (dither included). Equal hashes = identical frames.
 * @param {string} cardPath @param {number} i @param {{preview?:boolean}} [o] @returns {Promise<string>}
 */
export async function frameHash(cardPath, i, o = {}) { const card = await loadCard(cardPath); if (card.init) await card.init(); return hashCanvas(renderFrame(card, i, o)); }

/**
 * Render a card to <out>/<name>.mp4 + <name>_contact.png. Thin wrapper over the engine. Returns the report.
 * @param {string} cardPath @param {string} out @param {{preview?:boolean,workers?:number,name?:string}} [o]
 */
export function renderTo(cardPath, out, o = {}) { return renderCard(cardPath, { out, ...o }); }

/**
 * Read size, fps, duration and audio presence of an mp4 with ffmpeg. @param {string} mp4
 * @returns {Promise<{width:number,height:number,fps:number,seconds:number,audio:boolean,codec:string}>}
 */
export async function probe(mp4) {
  const e = await run(FFMPEG, ['-hide_banner', '-i', mp4, '-f', 'null', '-']).catch(x => x.message);
  const res = e.match(/Video: (\w+).* (\d{3,4})x(\d{3,4})/), fps = e.match(/(\d+(?:\.\d+)?) fps/), d = e.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return { codec: res?.[1], width: +res?.[2], height: +res?.[3], fps: +fps?.[1], seconds: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : NaN, audio: /Stream #\d+:\d+.*Audio:/.test(e) };
}

/** True if the file exists and is not empty. @param {string} p */
export const exists = p => fs.existsSync(p) && fs.statSync(p).size > 0;
export { path };
