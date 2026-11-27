// t3.1 demo (8 s): one scene, three camera moves.
//   0.2-2.0 s  slow push-in with handheld and three parallax depths (far dots, mid panel, near chips)
//   2.25-2.75  whip pan with motion blur and a roll, lands with an impact shake, onto scene B
//   2.7-4.8    rack focus: the near chip is sharp, then focus pulls to the hero card
// Then the engine closer. Headline, tag and kicker are screen-fixed overlays drawn AFTER the camera, so they stay sharp.
import { P, E, prog, lerp, rgba, rng, setFont, roundRect, glow, icon, drawMark, background, kicker, dust, hook, end, createCanvas } from '../../engine/index.mjs';
import { rig, moveTrack, handheld, shake, applyCamera, motionBlur, focusBlur, rackFocus, withBlur } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 3.9 };
const CLOSER = 4.9, B_OFF = 1200;

const CAM = rig(
  moveTrack({
    zoom: [[0, 1], [0.2, 1], [2.0, 1.14, 'inOutCubic'], [2.25, 1.14], [2.75, 1.02, 'inOutCubic'], [4.8, 1.06, 'inOutSine']],
    x: [[0, 0], [0.2, 0], [2.0, 70, 'inOutCubic'], [2.25, 70], [2.75, B_OFF, 'inOutQuart'], [4.8, B_OFF - 40, 'inOutSine']],
    rot: [[0, 0], [2.25, 0], [2.5, 0.035, 'inOutSine'], [2.78, 0, 'outCubic']],
  }),
  handheld({ amp: 7, rot: 0.003, freq: 1.5, seed: 3 }),
  shake({ hits: [[2.78, 0.75]], dur: 0.55, amp: 30, rot: 0.02 }),
);
const FOCUS = rackFocus([[0, 1], [3.3, 1.8], [3.3, 1.8], [4.0, 1.0, 'inOutCubic'], [4.9, 1.0]]);
const APERTURE = 13;

const HOOK = { tIn: 0.15, tOut: 2.0, l1: 'Same scene.', l2: 'Different camera.', c2: P.green, b1: 470, b2: 580, px: 96, glint: [0.6, 1.2] };
const HEAD = { tIn: 2.35, tOut: 4.75, l1: 'Whip, land,', l2: 'then pull focus.', c2: P.green, b1: 446, b2: 514, px: 56 };
const TAGS = [['PUSH-IN + PARALLAX', 0.4, 2.2], ['WHIP PAN', 2.2, 3.1], ['RACK FOCUS', 3.1, 4.75]];

// far layer: seeded dots and BGI marks
const FAR = (() => { const r = rng(314); return Array.from({ length: 46 }, () => ({ x: r.range(-200, 1280), y: r.range(560, 1560), s: r.range(5, 16), a: r.range(0.1, 0.35), mark: r() < 0.12 })); })();
const FARB = (() => { const r = rng(2718); return Array.from({ length: 22 }, () => ({ x: r.range(-200, 1280), y: r.range(560, 1560), s: r.range(10, 30), a: r.range(0.12, 0.3) })); })();

function chip(c, x, y, w, h, col, ic, label, t) {
  glow(c, rgba(col, 0.3), 24, () => { c.fillStyle = P.panel2; roundRect(c, x, y, w, h, 24).fill(); });
  c.strokeStyle = col; c.lineWidth = 3; roundRect(c, x, y, w, h, 24).stroke();
  icon(c, ic, x + 28, y + h / 2 - 28, 56, col, 2);
  if (label) { setFont(c, 'inter', 44, 700); c.fillStyle = P.white; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(label, x + 106, y + h / 2 + 15); }
}

function farLayer(c, set, t, blur, offX = 0) {
  withBlur(c, blur, c => {
    for (const d of set) {
      const x = d.x + offX, y = d.y + 6 * Math.sin(t * 0.9 + d.x);
      if (d.mark) drawMark(c, x, y, 70, { k: 1, alpha: 0.18 }); else { c.fillStyle = rgba(P.green, d.a); c.beginPath(); c.arc(x, y, d.s, 0, 7); c.fill(); }
    }
  });
}

function sceneA(c, t, cam, focus) {
  const pars = [0.3, 1, 1.8];
  c.save(); applyCamera(c, cam, 0.3); farLayer(c, FAR, t, focusBlur(0.3, focus, APERTURE)); c.restore();
  c.save(); applyCamera(c, cam, 1);
  withBlur(c, focusBlur(1, focus, APERTURE), c => {
    glow(c, 'rgba(0,0,0,0.5)', 40, () => { c.fillStyle = P.panel2; roundRect(c, 140, 800, 800, 580, 28).fill(); });
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 2; roundRect(c, 141, 801, 798, 578, 27).stroke();
    setFont(c, 'sg', 52, 700); c.fillStyle = P.white; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText('Morning queue', 190, 884);
    [['mail', 'Answer emails', P.green], ['file-text', 'Draft the report', P.cyan], ['calendar', 'Book the call', P.orange], ['send', 'Send the invoice', P.green]].forEach(([ic, txt, col], i) => {
      const y = 940 + i * 108, sweep = ((t * 0.9 + i * 0.33) % 1);
      c.fillStyle = rgba(col, 0.1 + 0.08 * Math.sin(sweep * Math.PI)); roundRect(c, 170, y, 740, 88, 18).fill();
      icon(c, ic, 196, y + 20, 48, col, 2); setFont(c, 'inter', 46, 600); c.fillStyle = P.text; c.fillText(txt, 270, y + 58);
      c.fillStyle = rgba(col, 0.9); c.beginPath(); c.arc(872, y + 44, 12 + 2 * Math.sin(t * 4 + i), 0, 7); c.fill();
    });
    chip(c, 640, 1400, 300, 100, P.green, 'bell', '3 new', t);
  });
  c.restore();
  c.save(); applyCamera(c, cam, 1.8);
  withBlur(c, focusBlur(1.8, focus, APERTURE), c => {
    c.globalAlpha *= 0.9; chip(c, -90, 1330, 250, 250, P.cyan, 'cog', '', t);
    chip(c, 900, 700, 260, 200, P.orange, 'zap', '', t);
  });
  c.restore();
}

function sceneB(c, t, cam, focus) {
  c.save(); applyCamera(c, cam, 0.3); farLayer(c, FARB, t, focusBlur(0.3, focus, APERTURE), B_OFF * 0.3); c.restore();
  c.save(); applyCamera(c, cam, 1); c.translate(B_OFF, 0);
  withBlur(c, focusBlur(1, focus, APERTURE), c => {
    glow(c, 'rgba(0,0,0,0.5)', 40, () => { c.fillStyle = P.panel; roundRect(c, 200, 1290, 680, 150, 26).fill(); });
    setFont(c, 'inter', 46, 600); c.fillStyle = P.muted; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText('Next: weekly summary', 250, 1380);
    glow(c, rgba(P.green, 0.28), 36, () => { c.fillStyle = P.panel2; roundRect(c, 140, 820, 800, 420, 32).fill(); });
    c.strokeStyle = rgba(P.green, 0.7); c.lineWidth = 3; roundRect(c, 141, 821, 798, 418, 31).stroke();
    const pk = 1 + 0.03 * Math.sin(t * 3); c.save(); c.translate(540, 960); c.scale(pk, pk); icon(c, 'circle-check', -70, -70, 140, P.green, 1.8); c.restore();
    setFont(c, 'sg', 76, 700); c.fillStyle = P.white; c.textAlign = 'center'; c.fillText('Report sent', 540, 1130);
    setFont(c, 'inter', 46, 500); c.fillStyle = P.muted; c.fillText('All tasks done', 540, 1196);
  });
  c.restore();
  c.save(); applyCamera(c, cam, 1.8); c.translate(B_OFF * 1.8, 0);
  withBlur(c, focusBlur(1.8, focus, APERTURE), c => {
    chip(c, 40, 1380, 330, 130, P.green, 'send', 'Sent', t);
    chip(c, 800, 690, 200, 200, P.cyan, 'sparkles', '', t);
  });
  c.restore();
}

export function frame(t) {
  const draw = (c, ts) => {
    const cam = CAM.at(ts), f = FOCUS(ts);
    background(c, ts);
    if (cam.x < 1000) sceneA(c, ts, cam, f); // cull: the checker reads text even when it is off screen
    if (cam.x > 320) sceneB(c, ts, cam, f);
  };
  const ctx = createCanvas(1080, 1920).getContext('2d');
  if (t < CLOSER + 0.5) motionBlur(ctx, t, draw, { rig: CAM, shutter: 0.55 });
  dust(ctx, t, { period: 9, n: 30, seed: 11, alpha: 0.7 });
  kicker(ctx, t, undefined, CLOSER);
  hook(ctx, HOOK, t); hook(ctx, HEAD, t);
  for (const [label, a, b] of TAGS) {
    const k = E.outCubic(prog(t, a, a + 0.3)) * (1 - prog(t, b - 0.15, b)) * (1 - prog(t, CLOSER - 0.1, CLOSER + 0.3)); if (k <= 0.01) continue;
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, 14 * (1 - k)); setFont(ctx, 'inter', 42, 700, 0.1); ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 70; ctx.fillStyle = rgba(P.green, 0.16); roundRect(ctx, 540 - w / 2, 672, w, 76, 38).fill(); ctx.strokeStyle = P.green; ctx.lineWidth = 2; roundRect(ctx, 540 - w / 2, 672, w, 76, 38).stroke();
    ctx.fillStyle = P.green; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 540, 725); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
