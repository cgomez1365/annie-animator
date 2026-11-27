// t4.1 vector-mascot-design: "Cog", the BGI mascot, built from paths only.
// One rig record (makeRig) drives every part. t4.2 (rigging), t4.3 (faces) and t4.4 (mouths) all write into that record.
// Units: 1 unit = the radius of the cog body. Draw with drawMascot(ctx, rig, {x, y, u}); u = pixels per unit (hero 230).
// The official BGI mark is NEVER used or altered here. Cog is a character, the mark is the logo.
import { Path2D, roundRect } from '../../engine/index.mjs';
import { P } from '../../engine/brand.mjs';
import { clamp, lerp, mix, rgba } from '../../engine/ease.mjs';

const TAU = Math.PI * 2;

/** Style guide as numbers. Every proportion of the character lives here; change it here and nowhere else. */
export const SPEC = {
  teeth: 8,             // eight chunky teeth: reads as a gear at 28 px. Ten or more reads as a germ or a spore in silhouette
  ringOuter: 1.0,       // tooth tips
  ringRoot: 0.81,       // between teeth. Tooth height = 0.19 = 19 percent of the radius
  toothSoft: 0.22,      // edge softness of a tooth (0 = square, 0.5 = sine). 0.30 = rounded trapezoid
  plate: 0.63,          // face plate radius (63 percent of the body)
  plateY: 0.02,         // face plate centre, a hair below the body centre
  boltR: 0.72, bolts: 5, boltSize: 0.045,
  eyeX: 0.27, eyeY: -0.08, eyeRx: 0.165, eyeRy: 0.20, iris: 0.105,
  browY: -0.40, browLen: 0.115, browW: 0.048,
  mouthY: 0.31,
  cheekX: 0.43, cheekY: 0.16,
  shoulder: [0.84, 0.14], upperArm: 0.34, foreArm: 0.30, armW: [0.135, 0.115],
  hip: [0.30, 0.80], thigh: 0.32, shin: 0.27, legW: [0.15, 0.125],
  ground: 1.56,         // the line the feet stand on, in units below the body centre
  antenna: { base: [0, -0.93], len: 0.34, ball: 0.075 },
  bodyHeight: 2.85,      // antenna ball to ground, in units. Width incl. arms about 2.6.
};

/** Colour tokens. Everything is the BGI palette or a mix of two palette colours. No stray hex. */
export const MC = {
  bodyHi: mix(P.green, P.white, 0.22), body: P.accent, bodyLo: mix(P.accent, P.ink, 0.42), edge: mix(P.accent, P.ink, 0.62),
  plate: mix(P.ink, P.panel, 0.55), plateRim: mix(P.accent, P.ink, 0.55), white: P.white, glove: P.white, gloveShade: mix(P.white, P.muted, 0.5),
  iris: P.cyan, pupil: P.ink, brow: P.green, mouthIn: mix(P.ink, P.red, 0.38), tongue: mix(P.red, P.orange, 0.55), blush: mix(P.red, P.orange, 0.45), antenna: P.cyan, shadow: P.ink,
};

/** The named parts. Each can be driven or hidden on its own; this is what "expression-ready" means. */
export const PARTS = ['legL', 'legR', 'armL', 'armR', 'antenna', 'ring', 'bolts', 'plate', 'cheeks', 'eyeL', 'eyeR', 'browL', 'browR', 'mouth'];

/**
 * Outline of a cog as a closed list of points. radius(theta) = root + (outer - root) * smoothstep of cos(teeth * theta),
 * which gives teeth with flat tops, rounded shoulders and a smooth root (no corners to alias).
 * @param {number} teeth @param {number} outer @param {number} root @param {{rot?:number, soft?:number, steps?:number}} [o]
 * @returns {Array<[number,number]>}
 */
export function gearPoints(teeth = SPEC.teeth, outer = SPEC.ringOuter, root = SPEC.ringRoot, { rot = 0, soft = SPEC.toothSoft, steps = 480 } = {}) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * TAU, c = Math.cos(teeth * (th - rot)), s = clamp((c + soft) / (2 * soft)), e = s * s * (3 - 2 * s), r = root + (outer - root) * e;
    pts.push([Math.sin(th) * r, -Math.cos(th) * r]);
  }
  return pts;
}
/** gearPoints as a Path2D. @returns {Path2D} */
export function gearPath(teeth, outer, root, o) {
  const p = new Path2D(), pts = gearPoints(teeth, outer, root, o); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p;
}

// ------------------------------------------------------------------ geometry helpers (shared with t4.2)
/**
 * Forward kinematics for a chain. angles are absolute, in radians, 0 = pointing straight down, positive = swing toward +x.
 * Returns the joint points [origin, j1, j2, ...]. @param {[number,number]} origin @param {number[]} lens @param {number[]} angles
 */
export function fk(origin, lens, angles) {
  const out = [origin.slice()]; let [x, y] = origin;
  lens.forEach((L, i) => { x += Math.sin(angles[i]) * L; y += Math.cos(angles[i]) * L; out.push([x, y]); });
  return out;
}
/**
 * Arm joints for one side. a1/a2 are the upper arm and forearm angles in the "outward positive" convention:
 * 0 = hanging straight down, +PI/2 = straight out to the side, +PI = straight up. The left side is mirrored for you.
 * @param {'L'|'R'} side @param {number} a1 @param {number} a2 @returns {Array<[number,number]>}
 */
export function armJoints(side, a1 = 0.32, a2 = 0.12) {
  const s = side === 'L' ? -1 : 1, sh = [s * SPEC.shoulder[0], SPEC.shoulder[1]];
  return fk(sh, [SPEC.upperArm, SPEC.foreArm], [s * a1, s * a2]);
}
/** Leg joints for one side (hip, knee, ankle). Same angle convention as armJoints: positive = knee/foot swings outward. */
export function legJoints(side, a1 = 0.05, a2 = -0.05) {
  const s = side === 'L' ? -1 : 1, hp = [s * SPEC.hip[0], SPEC.hip[1]];
  return fk(hp, [SPEC.thigh, SPEC.shin], [s * a1, s * a2]);
}

// ------------------------------------------------------------------ the rig record
const FACE = {
  eye: { open: 1, lx: 0, ly: 0, tilt: 0, lower: 0, size: 1, pupil: 1 },       // open 0..1, look -1..1, tilt rad (+ = angry), lower 0..1 (happy squint)
  brow: { y: 0, tilt: 0, x: 0 },                                              // y in units (negative = raised), tilt rad (+ = angry)
};
/** The neutral, happy-default rig. Every field is documented in SKILL.md. */
export function defaultRig() {
  return {
    x: 0, y: 0,                         // extra offset in units (hops), on top of drawMascot's x,y
    tilt: 0, sx: 1, sy: 1,              // body lean (rad) and squash/stretch about the ground line
    ringRot: 0,                         // the toothed ring turns, the face does not
    shadow: 1,                          // ground shadow strength 0..1 (0 hides it)
    glow: 0,                            // 0..1 cyan glow on the antenna ball
    antenna: 0,                         // bend in rad (+ = to the right)
    eyeL: { ...FACE.eye }, eyeR: { ...FACE.eye },
    browL: { ...FACE.brow }, browR: { ...FACE.brow },
    mouth: { w: 1, open: 0, smile: 0.55, round: 0, tongue: 0, teeth: 0 },  // see mouthGeometry
    cheek: 0.7,
    armL: { j: armJoints('L'), front: false, hand: 0 }, armR: { j: armJoints('R'), front: false, hand: 0 },
    legL: { j: legJoints('L'), foot: 0 }, legR: { j: legJoints('R'), foot: 0 },
    hide: [],                           // names from PARTS to skip (used for exploded views and construction reveals)
    explode: {},                        // per part {dx, dy, rot, s} offsets in units, used by exploded views
  };
}
/** Merge overrides (shallow per part, deep one level) onto a fresh default rig. @param {object} [o] @returns {object} */
export function makeRig(o = {}) {
  const r = defaultRig();
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && r[k] && typeof r[k] === 'object' && !Array.isArray(r[k])) r[k] = { ...r[k], ...v }; else r[k] = v;
  }
  return r;
}
/** Clamp every rig value to the range the art can hold without breaking (eyes inside the plate, mouth inside the plate). Returns the same rig. */
export function validateRig(r) {
  for (const e of [r.eyeL, r.eyeR]) { e.open = clamp(e.open); e.lx = clamp(e.lx, -1, 1); e.ly = clamp(e.ly, -1, 1); e.tilt = clamp(e.tilt, -0.7, 0.7); e.lower = clamp(e.lower); e.size = clamp(e.size, 0.6, 1.25); e.pupil = clamp(e.pupil, 0.4, 1.5); }
  for (const b of [r.browL, r.browR]) { b.y = clamp(b.y, -0.12, 0.14); b.tilt = clamp(b.tilt, -0.6, 0.6); b.x = clamp(b.x, -0.08, 0.08); }
  const m = r.mouth; m.w = clamp(m.w, 0.6, 1.35); m.open = clamp(m.open); m.smile = clamp(m.smile, -1, 1); m.round = clamp(m.round); m.tongue = clamp(m.tongue); m.teeth = clamp(m.teeth);
  r.cheek = clamp(r.cheek); r.shadow = clamp(r.shadow); r.glow = clamp(r.glow); r.antenna = clamp(r.antenna, -1.2, 1.2);
  return r;
}

// ------------------------------------------------------------------ mouth
/**
 * Mouth geometry from five numbers. w = width scale, open = jaw gap 0..1, smile = -1 (frown) .. 1 (grin), round = 0..1 (an "O"),
 * tongue / teeth 0..1. Returns the two lip edges as cubic Bezier control points plus the measured gap and half width.
 * @param {{w:number,open:number,smile:number,round:number}} m @param {number} [cy] @returns {{hw:number, gap:number, cornerY:number, top:number[], bot:number[], mid:number}}
 */
export function mouthGeometry(m, cy = SPEC.mouthY) {
  const hw = lerp(0.19, 0.085, m.round) * m.w, gap = m.open * 0.17 * (1 + 0.45 * m.round);
  const cornerY = cy - 0.045 * m.smile * (1 - 0.7 * m.round), sag = 0.075 * m.smile * (1 - 0.5 * m.round);
  const mid = cornerY + sag * 0.75, topApex = mid - gap * 0.34, botApex = mid + gap * 0.66, k = 4 / 3, kx = lerp(0.45 * hw * k, 0, m.round);
  const top = [-hw, cornerY, -hw + kx, cornerY + (topApex - cornerY) * k, hw - kx, cornerY + (topApex - cornerY) * k, hw, cornerY];
  const bot = [hw, cornerY, hw - kx, cornerY + (botApex - cornerY) * k, -hw + kx, cornerY + (botApex - cornerY) * k, -hw, cornerY];
  return { hw, gap, cornerY, top, bot, mid };
}
function mouthPath(g) {
  const p = new Path2D(); p.moveTo(g.top[0], g.top[1]); p.bezierCurveTo(g.top[2], g.top[3], g.top[4], g.top[5], g.top[6], g.top[7]);
  p.bezierCurveTo(g.bot[2], g.bot[3], g.bot[4], g.bot[5], g.bot[6], g.bot[7]); p.closePath(); return p;
}

// ------------------------------------------------------------------ limbs
/**
 * A tapered tube along points (a smoothed polyline), built from overlapping discs so a bent joint never pinches.
 * Draws an outline pass first, then the fill. widths = [startDiameter, endDiameter] in units.
 */
export function drawTube(ctx, pts, widths, fill, edge, edgeW = 0.026) {
  const path = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]], n = 14;
    for (let j = 0; j < n; j++) path.push([lerp(a[0], b[0], j / n), lerp(a[1], b[1], j / n), (i + j / n) / (pts.length - 1)]);
  }
  const l = pts[pts.length - 1]; path.push([l[0], l[1], 1]);
  for (const [col, grow] of [[edge, edgeW], [fill, 0]]) {
    ctx.fillStyle = col; ctx.beginPath();
    for (const [x, y, k] of path) { const r = lerp(widths[0], widths[1], k) / 2 + grow; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    ctx.fill();
  }
}
/** Default arm: a tapered green tube plus a white mitten with a thumb. j = [shoulder, elbow, hand]. side 'L'|'R'. */
export function drawArm(ctx, side, a) { drawTube(ctx, a.j, SPEC.armW, MC.body, MC.edge); drawMitten(ctx, side, a); }
/** The white mitten at the end of an arm (a.j[2] is the hand point, a.j[1] the elbow, so the thumb knows which way is up). */
export function drawMitten(ctx, side, a) {
  const [, e, h] = a.j, sgn = side === 'L' ? -1 : 1;
  const ang = Math.atan2(h[0] - e[0], -(h[1] - e[1])); // direction of the forearm, 0 = up
  ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(ang + (a.hand || 0));
  ctx.fillStyle = MC.edge; ctx.beginPath(); ctx.arc(0, 0.045, 0.118, 0, TAU); ctx.arc(-sgn * 0.085, 0.0, 0.056, 0, TAU); ctx.fill();
  ctx.fillStyle = MC.glove; ctx.beginPath(); ctx.arc(0, 0.045, 0.1, 0, TAU); ctx.arc(-sgn * 0.085, 0.0, 0.04, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0.045, 0.1, 0, TAU); ctx.clip(); ctx.fillStyle = rgba(MC.gloveShade, 0.4); ctx.fillRect(-0.2, 0.095, 0.4, 0.2); ctx.restore();
  ctx.restore();
}
/** Default leg: a green tube and a white shoe that points out to its side. j = [hip, knee, ankle]. */
export function drawLeg(ctx, side, a) { drawTube(ctx, a.j, SPEC.legW, MC.body, MC.edge); drawShoe(ctx, side, a); }
/** The white shoe at the ankle (a.j[2]); a.foot rotates it. */
export function drawShoe(ctx, side, a) {
  const an = a.j[2], sgn = side === 'L' ? -1 : 1;
  ctx.save(); ctx.translate(an[0] + sgn * 0.045, an[1] + 0.055); ctx.rotate((a.foot || 0) * sgn);
  ctx.fillStyle = MC.edge; ctx.beginPath(); ctx.ellipse(0, 0, 0.185, 0.108, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = MC.glove; ctx.beginPath(); ctx.ellipse(0, -0.006, 0.165, 0.09, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(MC.gloveShade, 0.6); ctx.beginPath(); ctx.ellipse(0, 0.045, 0.15, 0.04, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ face parts
function drawEye(ctx, side, e) {
  const sx = side === 'L' ? -1 : 1, rx = SPEC.eyeRx * e.size, ry = SPEC.eyeRy * e.size, close = 1 - e.open;
  ctx.save(); ctx.translate(sx * SPEC.eyeX, SPEC.eyeY);
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.clip();
  // lids are clip regions (not painted shapes), so no pale fringe is left at the edge of a closing eye
  let lidY = -ry * 1.2;
  if (close > 0.001 || e.tilt !== 0) { // upper lid: the visible part of the eye is below a line that slides down and can tilt
    lidY = -ry * 1.15 + (ry * 2.3) * close;
    ctx.save(); ctx.rotate(-sx * e.tilt); ctx.beginPath(); ctx.rect(-rx * 3, lidY, rx * 6, ry * 6); ctx.restore(); ctx.clip();
  }
  if (e.lower > 0.001) { // lower lid pushes up in a curve (the happy squint): visible part is above the curve
    const y = ry * 1.1 - ry * 1.5 * e.lower;
    ctx.beginPath(); ctx.moveTo(-rx * 2, -ry * 3); ctx.lineTo(-rx * 2, y + 0.04); ctx.quadraticCurveTo(0, y - 0.3 * e.lower * ry, rx * 2, y + 0.04); ctx.lineTo(rx * 2, -ry * 3); ctx.closePath(); ctx.clip();
  }
  ctx.fillStyle = MC.white; ctx.fillRect(-rx, -ry, 2 * rx, 2 * ry);
  const ir = SPEC.iris * e.size * e.pupil ** 0.35, ix = e.lx * (rx - ir * 0.62), iy = e.ly * (ry - ir * 0.62);
  ctx.fillStyle = MC.iris; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
  ctx.fillStyle = MC.pupil; ctx.beginPath(); ctx.arc(ix, iy, ir * 0.55 * e.pupil, 0, TAU); ctx.fill();
  ctx.fillStyle = MC.white; ctx.beginPath(); ctx.arc(ix + ir * 0.36, iy - ir * 0.38, ir * 0.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(ix - ir * 0.34, iy + ir * 0.4, ir * 0.14, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawBrow(ctx, side, b) {
  const sx = side === 'L' ? -1 : 1;
  ctx.save(); ctx.translate(sx * (SPEC.eyeX + b.x), SPEC.browY + b.y); ctx.rotate(-sx * b.tilt);
  ctx.strokeStyle = MC.brow; ctx.lineWidth = SPEC.browW; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-SPEC.browLen, 0); ctx.quadraticCurveTo(0, -0.025, SPEC.browLen, 0); ctx.stroke(); ctx.restore();
}
function drawMouth(ctx, m) {
  const g = mouthGeometry(m);
  if (g.gap < 0.012) { // closed: one soft line
    ctx.strokeStyle = MC.white; ctx.lineWidth = 0.034; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(g.top[0], g.top[1]);
    ctx.bezierCurveTo(g.top[2], g.top[3], g.top[4], g.top[5], g.top[6], g.top[7]); ctx.stroke(); return;
  }
  const path = mouthPath(g);
  ctx.save(); ctx.fillStyle = MC.mouthIn; ctx.fill(path); ctx.clip(path);
  if (m.teeth > 0.01) { ctx.fillStyle = MC.white; ctx.fillRect(-g.hw, g.mid - g.gap, 2 * g.hw, g.gap * 0.34 + m.teeth * g.gap * 0.5 + 0.02); }
  if (m.tongue > 0.01) { ctx.fillStyle = MC.tongue; ctx.beginPath(); ctx.ellipse(0, g.mid + g.gap * 0.66, g.hw * 0.62, g.gap * (0.25 + 0.4 * m.tongue), 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = MC.white; ctx.lineWidth = 0.03; ctx.lineJoin = 'round'; ctx.stroke(path);
}

// ------------------------------------------------------------------ the whole character
/**
 * Draw Cog. rig comes from makeRig(). o: {x, y} = body centre in px, u = px per unit (default 230), alpha, silhouette (solid fill,
 * for the 64 px readability test), only (array of PARTS to draw, others skipped).
 * Draw order: legs, back arms, antenna stem, ring, bolts, plate, cheeks, eyes, brows, mouth, antenna ball, front arms.
 * @param {*} ctx @param {object} rig @param {{x?:number,y?:number,u?:number,alpha?:number,silhouette?:boolean|string,only?:string[],limb?:{arm?:Function,leg?:Function}}} [o]
 */
export function drawMascot(ctx, rig, o = {}) {
  const { x = 540, y = 960, u = 230, alpha = 1, silhouette = false, only = null } = o, arm = o.limb?.arm || drawArm, leg = o.limb?.leg || drawLeg;
  const show = n => !rig.hide.includes(n) && (!only || only.includes(n)), ex = n => rig.explode[n] || null;
  const part = (n, fn) => { if (!show(n)) return; const e = ex(n); ctx.save(); if (e) { ctx.translate(e.dx || 0, e.dy || 0); if (e.rot) ctx.rotate(e.rot); if (e.s) ctx.scale(e.s, e.s); } fn(); ctx.restore(); };
  const G = SPEC.ground;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(u, u); ctx.translate(rig.x, rig.y);
  if (rig.shadow > 0.001 && !silhouette) { // ground shadow, shrinks as the body rises
    const lift = clamp(-rig.y / 1.2), sh = (1 - 0.35 * lift) * rig.shadow;
    ctx.save(); ctx.translate(0, G - rig.y + 0.02); ctx.scale(1, 0.16); ctx.fillStyle = rgba(P.ink, 0.55 * sh); ctx.beginPath(); ctx.arc(0, 0, 1.05 * (rig.sx ** 0.5), 0, TAU); ctx.fill(); ctx.restore();
  }
  bodyTransform(ctx, rig);
  if (silhouette) { drawSilhouette(ctx, rig, arm, leg, typeof silhouette === 'string' ? silhouette : P.white); ctx.restore(); return; }
  part('legL', () => leg(ctx, 'L', rig.legL)); part('legR', () => leg(ctx, 'R', rig.legR));
  if (!rig.armL.front) part('armL', () => arm(ctx, 'L', rig.armL)); if (!rig.armR.front) part('armR', () => arm(ctx, 'R', rig.armR));
  const A = SPEC.antenna, ab = [A.base[0], A.base[1]], tipX = ab[0] + Math.sin(rig.antenna) * A.len, tipY = ab[1] - Math.cos(rig.antenna) * A.len;
  part('antenna', () => { ctx.strokeStyle = MC.edge; ctx.lineWidth = 0.05; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ab[0], ab[1] + 0.05); ctx.quadraticCurveTo(ab[0] + Math.sin(rig.antenna) * A.len * 0.2, ab[1] - A.len * 0.55, tipX, tipY); ctx.stroke(); });
  part('ring', () => drawRing(ctx, rig));
  part('bolts', () => { for (let i = 0; i < SPEC.bolts; i++) { const a = rig.ringRot + (i / SPEC.bolts) * TAU, bx = Math.sin(a) * SPEC.boltR, by = -Math.cos(a) * SPEC.boltR;
    ctx.fillStyle = MC.edge; ctx.beginPath(); ctx.arc(bx, by + 0.012, SPEC.boltSize, 0, TAU); ctx.fill(); ctx.fillStyle = MC.bodyHi; ctx.beginPath(); ctx.arc(bx, by, SPEC.boltSize * 0.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = MC.bodyLo; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(bx - 0.026, by + 0.026); ctx.lineTo(bx + 0.026, by - 0.026); ctx.stroke(); } });
  part('plate', () => { // glossy dark face plate with a green rim
    ctx.fillStyle = MC.plateRim; ctx.beginPath(); ctx.arc(0, SPEC.plateY, SPEC.plate + 0.028, 0, TAU); ctx.fill();
    ctx.fillStyle = MC.plate; ctx.beginPath(); ctx.arc(0, SPEC.plateY, SPEC.plate, 0, TAU); ctx.fill();
  });
  part('cheeks', () => { for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * SPEC.cheekX, SPEC.cheekY); ctx.scale(1, 0.62); const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.12); cg.addColorStop(0, rgba(MC.blush, 0.8 * rig.cheek)); cg.addColorStop(1, rgba(MC.blush, 0)); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, 0.12, 0, TAU); ctx.fill(); ctx.restore(); } });
  part('eyeL', () => drawEye(ctx, 'L', rig.eyeL)); part('eyeR', () => drawEye(ctx, 'R', rig.eyeR));
  part('browL', () => drawBrow(ctx, 'L', rig.browL)); part('browR', () => drawBrow(ctx, 'R', rig.browR));
  part('mouth', () => drawMouth(ctx, rig.mouth));
  part('plate', () => { ctx.save(); ctx.beginPath(); ctx.arc(0, SPEC.plateY, SPEC.plate, 0, TAU); ctx.clip(); ctx.fillStyle = rgba(P.white, 0.045); ctx.beginPath(); ctx.ellipse(-0.17, -0.34, 0.47, 0.24, -0.5, 0, TAU); ctx.fill(); ctx.restore(); }); // gloss over the whole face
  part('antenna', () => {
    const g = rig.glow; if (g > 0.01) { const gr = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 0.42); gr.addColorStop(0, rgba(MC.antenna, 0.55 * g)); gr.addColorStop(1, rgba(MC.antenna, 0)); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(tipX, tipY, 0.42, 0, TAU); ctx.fill(); }
    ctx.fillStyle = MC.edge; ctx.beginPath(); ctx.arc(tipX, tipY + 0.01, A.ball + 0.022, 0, TAU); ctx.fill(); ctx.fillStyle = mix(MC.antenna, P.white, 0.25 * g); ctx.beginPath(); ctx.arc(tipX, tipY, A.ball, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(P.white, 0.8); ctx.beginPath(); ctx.arc(tipX - 0.022, tipY - 0.024, 0.02, 0, TAU); ctx.fill(); });
  if (rig.armL.front) part('armL', () => arm(ctx, 'L', rig.armL)); if (rig.armR.front) part('armR', () => arm(ctx, 'R', rig.armR));
  ctx.restore();
}
function drawRing(ctx, rig) {
  const gp = gearPath(SPEC.teeth, SPEC.ringOuter, SPEC.ringRoot, { rot: rig.ringRot });
  ctx.save(); ctx.translate(0.0, 0.035); ctx.fillStyle = MC.edge; ctx.fill(gp); ctx.restore(); // depth: a darker copy below
  const g = ctx.createRadialGradient(-0.34, -0.46, 0.05, -0.1, -0.1, 1.35); g.addColorStop(0, MC.bodyHi); g.addColorStop(0.42, MC.body); g.addColorStop(1, MC.bodyLo);
  ctx.fillStyle = g; ctx.fill(gp);
  ctx.save(); ctx.clip(gp); // rim light stays fixed on screen while the teeth turn through it
  const lg = ctx.createLinearGradient(-0.8, -0.8, 0.8, 0.8); lg.addColorStop(0, rgba(P.white, 0.6)); lg.addColorStop(0.45, rgba(P.white, 0)); lg.addColorStop(0.7, rgba(P.ink, 0)); lg.addColorStop(1, rgba(P.ink, 0.4));
  ctx.strokeStyle = lg; ctx.lineWidth = 0.1; ctx.stroke(gp); ctx.restore();
  ctx.strokeStyle = MC.edge; ctx.lineWidth = 0.022; ctx.lineJoin = 'round'; ctx.stroke(gp);
  ctx.strokeStyle = rgba(MC.bodyLo, 0.8); ctx.lineWidth = 0.018; ctx.beginPath(); ctx.arc(0, SPEC.plateY, 0.665, 0, TAU); ctx.stroke(); // track groove around the plate
}
function drawSilhouette(ctx, rig, arm, leg, col) {
  ctx.fillStyle = col; ctx.strokeStyle = col;
  const A = SPEC.antenna, tx = Math.sin(rig.antenna) * A.len, ty = A.base[1] - Math.cos(rig.antenna) * A.len;
  ctx.fill(gearPath(SPEC.teeth, SPEC.ringOuter, SPEC.ringRoot, { rot: rig.ringRot }));
  ctx.lineWidth = 0.06; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, A.base[1] + 0.05); ctx.lineTo(tx, ty); ctx.stroke(); ctx.beginPath(); ctx.arc(tx, ty, A.ball + 0.02, 0, TAU); ctx.fill();
  for (const [s, a] of [['L', rig.armL], ['R', rig.armR]]) { ctx.lineWidth = SPEC.armW[0]; ctx.lineJoin = 'round'; ctx.beginPath(); a.j.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.beginPath(); ctx.arc(a.j[2][0], a.j[2][1] + 0.04, 0.115, 0, TAU); ctx.fill(); }
  for (const [s, a] of [['L', rig.legL], ['R', rig.legR]]) { const sg = s === 'L' ? -1 : 1; ctx.lineWidth = SPEC.legW[0]; ctx.beginPath(); a.j.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.beginPath(); ctx.ellipse(a.j[2][0] + sg * 0.045, a.j[2][1] + 0.055, 0.185, 0.108, 0, 0, TAU); ctx.fill(); }
}

/** Guide overlay for the style sheet: construction circles and the eye/mouth lines, in unit space around (x,y). */
export function drawGuides(ctx, { x, y, u, alpha = 1, k = 1 }) {
  ctx.save(); ctx.translate(x, y); ctx.scale(u, u); ctx.globalAlpha *= alpha; ctx.lineWidth = 1.6 / u; ctx.strokeStyle = rgba(P.cyan, 0.75);
  for (const [r, d] of [[SPEC.ringOuter, 0], [SPEC.ringRoot, 1], [SPEC.plate, 0]]) { ctx.setLineDash(d ? [0.04, 0.04] : []); ctx.beginPath(); ctx.arc(0, d === 0 && r === SPEC.plate ? SPEC.plateY : 0, r * k, 0, TAU); ctx.stroke(); }
  ctx.setLineDash([0.03, 0.05]); ctx.beginPath(); ctx.moveTo(-1.5 * k, SPEC.eyeY); ctx.lineTo(1.5 * k, SPEC.eyeY); ctx.moveTo(-1.5 * k, SPEC.mouthY); ctx.lineTo(1.5 * k, SPEC.mouthY); ctx.moveTo(0, -1.4 * k); ctx.lineTo(0, SPEC.ground * k); ctx.moveTo(-1.5 * k, SPEC.ground); ctx.lineTo(1.5 * k, SPEC.ground); ctx.stroke();
  ctx.restore();
}
/** A soft ground shadow ellipse for the character standing at (x, groundY) px. Draw it before the mascot if you use rig.shadow = 0. */
export function groundShadow(ctx, x, groundY, w, strength = 1) {
  ctx.save(); ctx.translate(x, groundY); ctx.scale(1, 0.16); ctx.fillStyle = rgba(P.ink, 0.55 * strength); ctx.beginPath(); ctx.arc(0, 0, w, 0, TAU); ctx.fill(); ctx.restore();
}
/** Convert a point in world units (relative to the body centre, no lean) into body space, undoing the lean. Used to pin feet to the floor. */
export function worldToBody(p, tilt) { const c = Math.cos(-tilt), s = Math.sin(-tilt); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; }

// ------------------------------------------------------------------ construction reveal
/** Centre of each part in unit space. Used to scale a part about its own middle (pop-ins) instead of the body centre. */
export const PART_CENTER = {
  legL: [-0.3, 1.2], legR: [0.3, 1.2], armL: [-1.0, 0.45], armR: [1.0, 0.45], antenna: [0, -1.05], ring: [0, 0], bolts: [0, 0], plate: [0, 0.02], cheeks: [0, 0.16],
  eyeL: [-SPEC.eyeX, SPEC.eyeY], eyeR: [SPEC.eyeX, SPEC.eyeY], browL: [-SPEC.eyeX, SPEC.browY], browR: [SPEC.eyeX, SPEC.browY], mouth: [0, SPEC.mouthY],
};
/**
 * Build-up reveal: each part pops in (scale 0 -> 1 with an outBack overshoot) about its own centre. schedule = {partName: [t0, t1]}.
 * Parts missing from the schedule are left alone. Writes rig.explode / rig.hide and returns the rig.
 * @param {object} rig @param {number} t @param {Record<string,[number,number]>} schedule @param {number} [over] outBack overshoot, default 2.0
 */
export function revealParts(rig, t, schedule, over = 2.0) {
  for (const [name, [t0, t1]] of Object.entries(schedule)) {
    const p = clamp((t - t0) / (t1 - t0)), c = PART_CENTER[name];
    if (p <= 0.001) { if (!rig.hide.includes(name)) rig.hide.push(name); continue; }
    const q = p - 1, s = 1 + (over + 1) * q * q * q + over * q * q; // outBack, inlined so this module has no easing dependency
    rig.explode[name] = { ...(rig.explode[name] || {}), dx: c[0] * (1 - s), dy: c[1] * (1 - s), s };
  }
  return rig;
}

/**
 * Apply the body-space transform of a rig to ctx: squash/stretch about the ground line, then the lean. Call after translate(x,y) and scale(u,u)
 * and translate(rig.x, rig.y). Overlays (skeletons, guides) use it so they sit exactly on the drawn character.
 */
export function bodyTransform(ctx, rig) { const G = SPEC.ground; ctx.translate(0, G); ctx.scale(rig.sx, rig.sy); ctx.translate(0, -G); ctx.rotate(rig.tilt); }
/** Same transform for a whole overlay in one call: translate to (x,y), scale by u, then the rig offset and body transform. */
export function rigSpace(ctx, rig, { x = 540, y = 960, u = 230 } = {}) { ctx.translate(x, y); ctx.scale(u, u); ctx.translate(rig.x, rig.y); bodyTransform(ctx, rig); }
