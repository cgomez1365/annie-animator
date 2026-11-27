// t3.4 demo (8 s): composition made visible, then the engine closer.
//   0.3-2.1  grid + thirds + safe zones: guides draw in, a 2x2 grid of tiles snaps into its cells
//   2.0-3.5  fit + hierarchy: autoLayout sets short copy at 104 px, then long copy re-fits smaller; a px chip counts between them
//   3.5-4.8  contrast: three rows with live WCAG ratios; the weak grey is auto-fixed by ensureContrast and its ratio climbs
// All guides are graphics; every piece of text is 42 px or more and inside the safe zones.
import { P, E, prog, lerp, rgba, setFont, roundRect, glow, icon, begin, end } from '../../engine/index.mjs';
import { thirds, gridLayout, autoLayout, drawItem, contrastRatio, ensureContrast, ZONES, SLOTS } from './module.mjs';

export const META = { W: 1080, H: 1920, fps: 30, frames: 240, coverT: 2.6 };
const CLOSER = 4.9, TH = thirds();
const TAGS = [['GRID + SAFE ZONES', 0.35, 2.05], ['FIT + HIERARCHY', 2.15, 3.4], ['CONTRAST', 3.65, 4.75]];
const BOX = { x: 72, y: 780, w: 936, h: 470 };

// layouts are built once (they only depend on fonts): copy A is short, copy B is long and must shrink
let LA = null, LB = null;
function layouts(ctx) {
  if (!LA) {
    LA = autoLayout(ctx, [{ text: 'One idea', role: 'eyebrow' }, { text: 'Say one thing, big.', role: 'head', maxLines: 2 }, { text: 'Then fit it to the box.', role: 'sub' }], { box: BOX });
    LB = autoLayout(ctx, [{ text: 'One idea', role: 'eyebrow' }, { text: 'Say one thing, big enough to read on a small phone screen.', role: 'head', maxLines: 3 }, { text: 'Longer copy shrinks to fit, never under 42 px.', role: 'sub' }], { box: BOX });
  }
}
const TILES = [['Plan', 'list-checks', P.cyan], ['Build', 'cog', P.green], ['Test', 'circle-check', P.orange], ['Ship', 'send', P.green]];
const BAD = '#566377', ROWS = [['Text on dark', P.white], ['Muted note', P.muted], ['Dim grey', BAD]];

export function frame(t) {
  const { cv, ctx } = begin(t, { closerAt: CLOSER });
  layouts(ctx);
  const out = 1 - prog(t, CLOSER - 0.1, CLOSER + 0.3);

  // ---- page 1: guides and tiles
  if (t < 2.25) {
    const pa = E.outCubic(prog(t, 0.3, 0.8)) * (1 - prog(t, 1.95, 2.2)) * out;
    ctx.save(); ctx.globalAlpha *= pa;
    // red bands: top < 250, bottom > 1580 and the action rail (hatched)
    const hatch = (x, y, w, h) => { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.fillStyle = rgba(P.red, 0.07); ctx.fillRect(x, y, w, h); ctx.strokeStyle = rgba(P.red, 0.22); ctx.lineWidth = 3; for (let d = -h; d < w + h; d += 34) { ctx.beginPath(); ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); ctx.stroke(); } ctx.restore(); };
    const wipe = E.outCubic(prog(t, 0.35, 1.0));
    hatch(0, 0, 1080, 250 * wipe); hatch(0, 1920 - 340 * wipe, 1080, 340 * wipe); hatch(940, 800, 140, 780 * wipe);
    ctx.strokeStyle = rgba(P.red, 0.7); ctx.lineWidth = 3; ctx.setLineDash([16, 10]); ctx.lineDashOffset = -t * 40;
    ctx.beginPath(); ctx.moveTo(0, 250); ctx.lineTo(1080 * wipe, 250); ctx.moveTo(1080, 1580); ctx.lineTo(1080 - 1080 * wipe, 1580); ctx.moveTo(940, 800); ctx.lineTo(940, 800 + 780 * wipe); ctx.stroke();
    // thirds
    ctx.strokeStyle = rgba(P.cyan, 0.55); ctx.lineWidth = 2.5; ctx.lineDashOffset = t * 30;
    const tk = E.outCubic(prog(t, 0.55, 1.3));
    TH.xs.forEach(x => { ctx.beginPath(); ctx.moveTo(x, 250); ctx.lineTo(x, 250 + 1330 * tk); ctx.stroke(); });
    TH.ys.forEach(y => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080 * tk, y); ctx.stroke(); });
    ctx.setLineDash([]);
    TH.points.forEach(([x, y], i) => { const k = E.outBack(prog(t, 0.9 + i * 0.08, 1.3 + i * 0.08), 2), pu = 0.5 + 0.5 * Math.sin(t * 4 + i); if (k <= 0) return; ctx.fillStyle = rgba(P.cyan, 0.25 + 0.2 * pu); ctx.beginPath(); ctx.arc(x, y, (22 + 6 * pu) * k, 0, 7); ctx.fill(); ctx.fillStyle = P.cyan; ctx.beginPath(); ctx.arc(x, y, 9 * k, 0, 7); ctx.fill(); });
    ctx.restore();
    // tiles snap into a 2x2 grid in the text-safe column
    const cells = gridLayout(4, { x: 100, y: 790, w: 800, h: 520 }, { cols: 2, gap: 28 });
    cells.forEach((c, i) => {
      const k = E.outBack(prog(t, 1.1 + i * 0.12, 1.6 + i * 0.12), 1.7), a = clamp01(k * 3) * (1 - prog(t, 1.95, 2.2)) * out; if (k <= 0 || a <= 0.01) return;
      const [label, ic, col] = TILES[i], bob = 4 * Math.sin(t * 3 + i * 1.3);
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(c.x + c.w / 2, c.y + c.h / 2 + bob); ctx.scale(k, k);
      glow(ctx, rgba(col, 0.25), 22, () => { ctx.fillStyle = P.panel2; roundRect(ctx, -c.w / 2, -c.h / 2, c.w, c.h, 26).fill(); }); ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 3; roundRect(ctx, -c.w / 2, -c.h / 2, c.w, c.h, 26).stroke();
      icon(ctx, ic, -34, -c.h / 2 + 40, 68, col, 2); setFont(ctx, 'inter', 48, 700); ctx.fillStyle = P.white; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 0, c.h / 2 - 44); ctx.restore();
    });
  }

  // ---- page 2: autoLayout A -> B with a px chip and a width guide
  if (t > 2.0 && t < 3.55) {
    const swap = E.inOutCubic(prog(t, 2.95, 3.3)), a = (1 - prog(t, 3.25, 3.5)) * out;
    ctx.save(); ctx.globalAlpha *= a;
    // width guide with a travelling dot
    const gy = 752, gx0 = 540 - 428, gx1 = 540 + 428, gk = E.outCubic(prog(t, 2.1, 2.5)); ctx.strokeStyle = rgba(P.cyan, 0.7); ctx.lineWidth = 3; ctx.setLineDash([12, 9]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.moveTo(540 - 428 * gk, gy); ctx.lineTo(540 + 428 * gk, gy); ctx.stroke(); ctx.setLineDash([]);
    const dx = lerp(gx0, gx1, 0.5 + 0.5 * Math.sin(t * 2.4)); ctx.fillStyle = P.cyan; ctx.beginPath(); ctx.arc(dx, gy, 9, 0, 7); ctx.fill();
    [[gx0], [gx1]].forEach(([x]) => { ctx.fillStyle = P.cyan; ctx.fillRect(x - 2, gy - 14, 4, 28); });
    // blocks
    const lay = swap < 0.5 ? LA : LB, k = swap < 0.5 ? 1 - swap * 2 : (swap - 0.5) * 2;
    lay.items.forEach((it, i) => { const e = E.outCubic(prog(t, 2.2 + i * 0.12, 2.55 + i * 0.12)), ee = swap === 0 ? e : k; drawItem(ctx, it, { alpha: ee, dy: 24 * (1 - ee) + (swap > 0 ? 10 * (1 - k) * (swap < 0.5 ? -1 : 1) : 0) }); });
    // px chip counts between the two head sizes
    const pxA = LA.items[1].px, pxB = LB.items[1].px, pxNow = Math.round(lerp(pxA, pxB, swap)), ck = E.outBack(prog(t, 2.55, 2.95), 1.8);
    if (ck > 0.01) { ctx.save(); ctx.translate(540, 1310); ctx.scale(ck, ck); setFont(ctx, 'inter', 46, 700); const label = `headline ${pxNow} px`, w = ctx.measureText(label).width + 64; ctx.fillStyle = rgba(P.green, 0.14); roundRect(ctx, -w / 2, -42, w, 84, 42).fill(); ctx.strokeStyle = P.green; ctx.lineWidth = 3; roundRect(ctx, -w / 2, -42, w, 84, 42).stroke(); ctx.fillStyle = P.green; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 0, 16); ctx.restore(); }
    ctx.restore();
  }

  // ---- page 3: contrast rows
  if (t > 3.5) {
    const fixed = ensureContrast(BAD, P.panel, 4.5), fk = E.inOutCubic(prog(t, 4.15, 4.6));
    ROWS.forEach(([label, col], i) => {
      const k = E.outCubic(prog(t, 3.6 + i * 0.12, 3.95 + i * 0.12)), y = 790 + i * 190; if (k <= 0) return;
      ctx.save(); ctx.globalAlpha *= k * out; ctx.translate(0, 26 * (1 - k));
      ctx.fillStyle = P.panel; roundRect(ctx, 100, y, 800, 150, 26).fill(); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2; roundRect(ctx, 101, y + 1, 798, 148, 25).stroke();
      const c2 = i === 2 ? lerpHex(BAD, fixed, fk) : col, ratio = contrastRatio(c2, P.panel), good = ratio >= 4.5;
      setFont(ctx, 'inter', 54, 650); ctx.fillStyle = c2; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 136, y + 93);
      setFont(ctx, 'mono', 50, 700); ctx.fillStyle = good ? P.green : P.orange; ctx.textAlign = 'right'; ctx.fillText(`${ratio.toFixed(1)}:1`, 782, y + 92);
      const tk = good ? E.outBack(prog(t, i === 2 ? 4.6 : 3.9 + i * 0.12, (i === 2 ? 4.6 : 3.9 + i * 0.12) + 0.4), 2) : 1; icon(ctx, good ? 'circle-check' : 'triangle-alert', 806, y + 43, 64 * Math.max(0.01, tk), good ? P.green : P.orange, 2.4);
      ctx.restore();
    });
    // a scan line keeps the page alive
    const sx = 100 + ((t * 0.6) % 1) * 800; ctx.save(); ctx.globalAlpha *= out * E.outCubic(prog(t, 4.0, 4.3)); const g = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(Math.max(100, sx - 40), 790, Math.min(80, 900 - sx + 40), 530); ctx.restore();
  }

  // ---- tags
  for (const [label, a, b] of TAGS) {
    const k = E.outCubic(prog(t, a, a + 0.3)) * (1 - prog(t, b - 0.15, b)) * out; if (k <= 0.01) continue;
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, 14 * (1 - k)); setFont(ctx, 'inter', 42, 700, 0.1); ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 70; ctx.fillStyle = rgba(P.green, 0.16); roundRect(ctx, 540 - w / 2, 672, w, 76, 38).fill(); ctx.strokeStyle = P.green; ctx.lineWidth = 2; roundRect(ctx, 540 - w / 2, 672, w, 76, 38).stroke();
    ctx.fillStyle = P.green; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 540, 725); ctx.restore();
  }
  return end(ctx, t, { closerAt: CLOSER, brand: 'bgi' });
}
const clamp01 = v => Math.max(0, Math.min(1, v));
function lerpHex(a, b, k) { const f = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), A = f(a), B = f(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join(''); }
