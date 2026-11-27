/**
 * Screen capture via Chrome DevTools Protocol screencast (2026-11-27).
 *
 * Extracted from FQC's tools/video/make-video.mjs into a reusable module.
 * Drives any Playwright page, captures frames through CDP, assembles with
 * ffmpeg. The app-specific choreography (actions, scenes, preview mode)
 * stays in the consumer; this module owns the recording mechanics.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Viewport presets
// ---------------------------------------------------------------------------

export const VIEWPORTS = {
  phone:      { w: 780,  h: 1688, viewport: { width: 390, height: 844 },  deviceScaleFactor: 2,   isMobile: true, hasTouch: true },
  tablet:     { w: 1640, h: 2360, viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2,   isMobile: true, hasTouch: true },
  desktop:    { w: 1920, h: 1080, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 },
  desktop720: { w: 1280, h: 720,  viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
};

export function contextOpts(kind) {
  const v = VIEWPORTS[kind] || VIEWPORTS.desktop;
  const o = { viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor };
  if (v.isMobile) { o.isMobile = true; o.hasTouch = true; }
  return o;
}

// ---------------------------------------------------------------------------
// Page injection: caption bar + tap indicator
// ---------------------------------------------------------------------------

export const INIT_SCRIPT = `(() => {
  const css = \`nextjs-portal{display:none!important}
  #__cap::after{content:attr(data-t)}
  #__cap{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:14px 18px 22px;background:linear-gradient(transparent,rgba(3,10,8,.94) 38%);color:#fff;font:700 17px/1.35 -apple-system,Helvetica,sans-serif;text-align:center;pointer-events:none;text-shadow:0 1px 3px #000}
  @media (min-width:700px){#__cap{left:50%;right:auto;transform:translateX(-50%);bottom:26px;width:min(960px,90vw);padding:12px 24px;border-radius:16px;background:rgba(3,10,8,.88);border:1px solid rgba(125,255,192,.28);font-size:20px;box-shadow:0 8px 30px rgba(0,0,0,.5)}}
  .__tap{position:fixed;z-index:2147483647;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(120,255,190,.38);border:2px solid #7dffc0;pointer-events:none;animation:__t .7s ease-out forwards}
  @keyframes __t{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}\`;
  const boot = () => {
    if (!document.body || document.getElementById('__cap')) return;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    const d = document.createElement('div'); d.id = '__cap'; document.body.appendChild(d);
    const t = sessionStorage.getItem('__cap') || ''; d.setAttribute('data-t', t); d.style.display = t ? 'block' : 'none';
  };
  window.__cap = (t) => { boot(); sessionStorage.setItem('__cap', t); const d = document.getElementById('__cap'); d.setAttribute('data-t', t); d.style.display = t ? 'block' : 'none'; };
  window.__tap = (x, y) => { boot(); const e = document.createElement('div'); e.className = '__tap'; e.style.left = x + 'px'; e.style.top = y + 'px'; document.body.appendChild(e); setTimeout(() => e.remove(), 800); };
  document.addEventListener('DOMContentLoaded', boot);
  new MutationObserver(boot).observe(document, { childList: true, subtree: true });
})()`;

// ---------------------------------------------------------------------------
// CDP recorder
// ---------------------------------------------------------------------------

export function createRecorder(page, opts = {}) {
  const { format = 'jpeg', quality = 92, maxWidth = 1920, maxHeight = 1080 } = opts;
  const frames = [];
  let cdp = null;
  let startMs = 0;

  return {
    frames,
    get startMs() { return startMs; },

    async start() {
      cdp = await page.context().newCDPSession(page);
      cdp.on('Page.screencastFrame', async (f) => {
        frames.push({ ts: f.metadata.timestamp * 1000, data: f.data });
        await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      });
      startMs = Date.now();
      await cdp.send('Page.startScreencast', { format, quality, maxWidth, maxHeight, everyNthFrame: 1 });
    },

    async stop() {
      if (cdp) await cdp.send('Page.stopScreencast');
      return { frames, startMs, endMs: Date.now() };
    },
  };
}

// ---------------------------------------------------------------------------
// Frame assembly
// ---------------------------------------------------------------------------

let _ffmpeg = null;
function ffmpegBin() {
  if (_ffmpeg) return _ffmpeg;
  try { _ffmpeg = (await import('ffmpeg-static')).default; } catch { _ffmpeg = 'ffmpeg'; }
  return _ffmpeg;
}

export async function assembleFrames(frames, recStart, endMs, outDir, size) {
  const ff = typeof ffmpegBin === 'function' ? await ffmpegBin() : 'ffmpeg';
  const fdir = path.join(outDir, 'frames');
  fs.rmSync(fdir, { recursive: true, force: true });
  fs.mkdirSync(fdir, { recursive: true });

  const list = [];
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(fdir, name), Buffer.from(f.data, 'base64'));
    const begin = i === 0 ? 0 : Math.max(0, f.ts - recStart) / 1000;
    const next = i + 1 < frames.length
      ? Math.max(0, frames[i + 1].ts - recStart) / 1000
      : Math.max(begin + 1, (endMs - recStart) / 1000);
    list.push(`file '${name}'`, `duration ${Math.max(0.001, next - begin).toFixed(4)}`);
  });
  list.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  fs.writeFileSync(path.join(fdir, 'list.txt'), list.join('\n'));

  const rawPath = path.join(outDir, 'screen.mp4');
  const r = spawnSync(ff, [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', path.join(fdir, 'list.txt'),
    '-vf', `fps=30,scale=${size.w}:${size.h}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-crf', '18', rawPath,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`frame assembly failed: ${r.stderr.slice(-500)}`);
  fs.rmSync(fdir, { recursive: true, force: true });
  return rawPath;
}

// ---------------------------------------------------------------------------
// Voice mixing
// ---------------------------------------------------------------------------

export function mixVoice(screenPath, wavPaths, startTimes, outPath, ffmpegPath) {
  const ff = ffmpegPath || 'ffmpeg';
  const filter = wavPaths.map((_, i) =>
    `[${i + 1}:a]adelay=${Math.round(startTimes[i] * 1000)}|${Math.round(startTimes[i] * 1000)}[a${i}]`
  ).join(';')
    + ';' + wavPaths.map((_, i) => `[a${i}]`).join('')
    + `amix=inputs=${wavPaths.length}:normalize=0[a]`;

  const r = spawnSync(ff, [
    '-y', '-loglevel', 'error',
    '-i', screenPath,
    ...wavPaths.flatMap((w) => ['-i', w]),
    '-filter_complex', filter,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    '-shortest', outPath,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`voice mix failed: ${r.stderr.slice(-600)}`);
  return outPath;
}

// ---------------------------------------------------------------------------
// Scene helpers
// ---------------------------------------------------------------------------

export function sceneHelpers(page, opts = {}) {
  const { dry = false, logo = '', BASE = 'http://localhost:3000' } = opts;
  const wait = (ms) => page.waitForTimeout(dry ? Math.min(ms, 250) : ms);

  const h = {
    p: page, wait, dry, BASE, logo,
    ...opts,

    async center(loc) {
      await loc.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await wait(650);
    },

    async tap(loc) {
      await h.center(loc);
      const b = await loc.boundingBox();
      await page.evaluate(([x, y]) => window.__tap?.(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
      await wait(280);
      await loc.click();
      await wait(500);
    },

    async top(loc, y = 130) {
      await loc.evaluate((e, y) => window.scrollBy({ top: e.getBoundingClientRect().top - y, behavior: 'smooth' }), y);
      await wait(700);
    },

    async tapTop(loc, y = 130) {
      await h.top(loc, y);
      const b = await loc.boundingBox();
      await page.evaluate(([x, y]) => window.__tap?.(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
      await wait(280);
      await loc.click();
      await page.waitForFunction(() => !/Loading|Counting the last/.test(document.body.innerText), null, { timeout: 9000 }).catch(() => {});
      await wait(700);
    },

    async point(loc, y = 200) {
      await h.top(loc, y);
      const b = await loc.boundingBox();
      await page.evaluate(([x, y]) => window.__tap?.(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
      await wait(900);
    },

    async type(loc, text, y = 220) {
      await h.top(loc, y);
      const b = await loc.boundingBox();
      await page.evaluate(([x, y]) => window.__tap?.(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
      await wait(250);
      await loc.click();
      await loc.pressSequentially(text, { delay: dry ? 0 : 55 });
      await wait(500);
    },

    async scrollTo(y) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y);
      await wait(800);
    },

    async card(title, line) {
      const desktop = (opts.kind || 'desktop') === 'desktop';
      await page.setContent(`<body style="margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,#12332a,#06120f);color:#fff;font-family:-apple-system,Helvetica,sans-serif;text-align:center"><div style="padding:0 6vw">${logo ? `<div style="display:inline-block;background:#fff;border-radius:22px;padding:${desktop ? '26px 40px' : '18px 26px'};box-shadow:0 12px 50px rgba(0,0,0,.45)"><img src="${logo}" style="display:block;height:${desktop ? 120 : 64}px"></div>` : ''}<div style="font:800 ${desktop ? 54 : 30}px/1.15 Helvetica;margin-top:${desktop ? 44 : 30}px">${title}</div><div style="font:500 ${desktop ? 26 : 16}px/1.4 Helvetica;margin-top:14px;color:#9fe8c4">${line}</div></div></body>`);
      await page.evaluate(() => { try { sessionStorage.setItem('__cap', ''); } catch {} });
    },

    async cap(t) {
      await page.evaluate((x) => window.__cap?.(x), t).catch(() => {});
    },
  };
  return h;
}

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------

export function verifyVideo(videoPath, ffmpegPath) {
  const ff = ffmpegPath || 'ffmpeg';
  const info = spawnSync(ff, ['-hide_banner', '-i', videoPath], { encoding: 'utf8' }).stderr;
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const secs = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;
  const dims = /Video: .*?, (\d+x\d+)/.exec(info)?.[1] || '';
  const vol = spawnSync(ff, ['-hide_banner', '-i', videoPath, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const meanDb = /mean_volume: (-?[\d.]+)/.exec(vol)?.[1] || '';
  const maxDb = /max_volume: (-?[\d.]+)/.exec(vol)?.[1] || '';
  return { duration: secs, dimensions: dims, meanDb, maxDb };
}

export function makeFrameStrip(videoPath, outPath, width = 480, ffmpegPath) {
  const ff = ffmpegPath || 'ffmpeg';
  const run = (a) => spawnSync(ff, a, { encoding: 'utf8' });
  const info = run(['-hide_banner', '-i', videoPath]).stderr;
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const secs = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 10;
  const ts = [1.5, secs * 0.35, secs * 0.7, secs - 2];
  const dir = path.dirname(outPath);
  const base = path.basename(outPath, path.extname(outPath));
  const ins = ts.flatMap((t, i) => {
    const f = path.join(dir, `${base}_${i}.png`);
    run(['-y', '-loglevel', 'error', '-ss', String(t), '-i', videoPath, '-frames:v', '1', f]);
    return ['-i', f];
  });
  run(['-y', '-loglevel', 'error', ...ins, '-filter_complex',
    ts.map((_, i) => `[${i}]scale=${width}:-1[s${i}]`).join(';') + ';' +
    ts.map((_, i) => `[s${i}]`).join('') + 'hstack=4',
    outPath]);
  ts.forEach((_, i) => { try { fs.unlinkSync(path.join(dir, `${base}_${i}.png`)); } catch {} });
}

export function makeSheet(dir, ids, outPath, cols = 3, ffmpegPath) {
  const ff = ffmpegPath || 'ffmpeg';
  const ins = ids.flatMap((i) => ['-i', path.join(dir, `shot_${i}.png`)]);
  const sc = ids.map((_, k) => `[${k}]scale=640:-1[s${k}]`).join(';');
  const rows = [];
  for (let r = 0; r * cols < ids.length; r++)
    rows.push(ids.slice(r * cols, r * cols + cols).map((_, k) => `[s${r * cols + k}]`).join('') +
      `hstack=${Math.min(cols, ids.length - r * cols)}[r${r}]`);
  const fc = `${sc};${rows.join(';')};${rows.map((_, r) => `[r${r}]`).join('')}vstack=${rows.length}`;
  const r = spawnSync(ff, ['-y', '-loglevel', 'error', ...ins, '-filter_complex', fc, outPath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sheet failed: ${r.stderr.slice(-300)}`);
}
