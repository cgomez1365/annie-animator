// t7.1 test: unit checks on the maths and on real pixels, then the shared render + QC run.   node test.mjs
import { runSkillTest } from '../../engine/testkit.mjs';
import { createCanvas } from '../../engine/canvas.mjs';
import * as M from './module.mjs';

const px = (cv, x, y) => { const d = cv.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

await runSkillTest({ dir: import.meta.dirname, checks: ({ ok, near, section }) => {
  section('projection');
  const pc = M.makeCamera({ cx: 200, cy: 300, f: 1000, d: 1000 });
  let p = M.project([0, 0, 0], pc); near(p[0], 200, 1e-9, 'origin x'); near(p[1], 300, 1e-9, 'origin y');
  p = M.project([100, 50, 0], pc); near(p[0], 300, 1e-9, 'persp x at z=0'); near(p[1], 350, 1e-9, 'persp y at z=0');
  p = M.project([100, 0, 1000], pc); near(p[0], 250, 1e-9, 'twice as far = half as big'); ok(M.project([100, 0, -500], pc)[0] > 300, 'nearer = bigger');
  const iso = M.isoCamera({ cx: 0, cy: 0, scale: 1 }), ox = M.project([100, 0, 0], iso), oz = M.project([0, 0, 100], iso), oy = M.project([0, -100, 0], iso);
  near(Math.hypot(ox[0], ox[1]), Math.hypot(oz[0], oz[1]), 1e-6, 'iso: x and z axes same length');
  near(Math.abs(Math.atan2(ox[1], ox[0])) * 180 / Math.PI, 30, 0.05, 'iso: x axis at 30 degrees');
  near(Math.abs(Math.atan2(oz[1], oz[0])) * 180 / Math.PI, 30, 0.05, 'iso: z axis at 30 degrees');
  near(oy[0], 0, 1e-9, 'iso: up axis is vertical'); ok(oy[1] < 0, 'iso: up (-y) goes up the screen');
  near(Math.hypot(ox[0], ox[1]), 100 * Math.sqrt(2 / 3), 1e-6, 'iso: true iso foreshortening 0.8165');
  ok(M.isoPoint(100, 0, 0, { cx: 0, cy: 0 })[0] > 0 && M.isoPoint(0, 0, 100, { cx: 0, cy: 0 })[0] < 0, 'isoPoint: x right, z left');

  section('matrices');
  const r = M.apply(M.rotY(Math.PI / 2), [1, 0, 0]); near(r[0], 0, 1e-9, 'rotY 90 x'); near(r[2], -1, 1e-9, 'rotY 90 z');
  const m2 = M.mmul(M.rotX(0.3), M.rotX(-0.3)); near(m2[0] + m2[4] + m2[8], 3, 1e-9, 'rotX then back = identity');

  section('culling and sorting');
  const cube = M.boxQuads([0, 0, 0], [100, 100, 100], M.I3, { fill: '#19e08f' });
  ok(M.prepare(cube, iso).length === 3, 'iso cube: exactly 3 faces visible');
  const names = M.prepare(cube, iso).map(d => d.q.name).sort().join(','); ok(names === 'left,right,top' || names === 'front,right,top' || names === 'front,left,top' || names.includes('top'), 'iso cube shows the top: ' + names);
  ok(M.prepare(cube, pc).length === 1, 'perspective, on axis, pitch 0: only the front face');
  ok(M.prepare(M.boxQuads([300, 0, 0], [100, 100, 100]), pc).length === 2, 'perspective, box off to the right: front + its left side');
  const cardAt = a => M.prepare(M.cardQuads([0, 0, 0], 200, 200, 10, M.rotY(a), {}), pc).map(d => d.q.name);
  ok(cardAt(0).includes('front') && !cardAt(0).includes('back'), 'card at 0: front shows, back culled');
  ok(cardAt(Math.PI).includes('back') && !cardAt(Math.PI).includes('front'), 'card at 180 degrees: back shows, front culled');
  const e = M.prepare(M.cardQuads([0, 0, 0], 200, 200, 10, M.rotY(Math.PI / 2), {}), pc); ok(e.every(d => d.q.name !== 'front' && d.q.name !== 'back'), 'card at 90 degrees: edge-on, no face');
  const back = M.prepare(M.cardQuads([0, 0, 0], 200, 200, 10, M.rotY(Math.PI), {}), pc).find(d => d.q.name === 'back');
  ok(back.s[0][0] < back.s[1][0] && back.s[0][1] < back.s[3][1], 'back texture is not mirrored (TL is left of TR, above BL)');
  ok(M.area2(back.s.map(s => [s[0], s[1]])) > 0, 'visible quads wind clockwise on screen');
  const two = [{ pts: [[-50, -50, 200], [50, -50, 200], [50, 50, 200], [-50, 50, 200]], n: [0, 0, -1], fill: '#00ff00' }, { pts: [[-50, -50, 0], [50, -50, 0], [50, 50, 0], [-50, 50, 0]], n: [0, 0, -1], fill: '#ff0000' }];
  const sorted = M.prepare(two, pc); ok(sorted[0].depth > sorted[1].depth, 'painter: far first');
  const cv0 = createCanvas(400, 600), c0 = cv0.getContext('2d'); M.drawQuads(c0, two, pc, { light: { ambient: 1, diffuse: 0 } });
  const mid = px(cv0, 200, 300); ok(mid[0] > 200 && mid[1] < 60, 'near red quad covers far green quad');

  section('lighting');
  const lit = M.prepare(cube, iso), byName = Object.fromEntries(lit.map(d => [d.q.name, d.k]));
  const sideK = lit.filter(d => d.q.name !== 'top').map(d => d.k); ok(sideK.length === 2 && byName.top > sideK[0] && byName.top > sideK[1], `top face brightest (${Object.entries(byName).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', ')})`);
  ok(Math.abs(sideK[0] - sideK[1]) > 0.05, 'the two side faces differ in tone');
  for (const d of lit) ok(d.k >= 0.3 && d.k <= 1.3, 'brightness in range ' + d.k.toFixed(2));
  ok(M.lambert([0, 0, 1]) < M.lambert(M.LIGHT) , 'a face turned from the light is darker than one facing it');
  const sh = M.shade('#19e08f', 0.5), sh2 = M.shade('#19e08f', 1.3); ok(sh !== sh2 && /rgb/.test(sh), 'shade returns colours');

  section('texture mapping (real pixels)');
  const T = M.texture(200, 200, c => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 200, 200); c.fillStyle = '#ff0000'; c.fillRect(50, 50, 50, 50); c.fillStyle = '#0000ff'; c.fillRect(150, 150, 50, 50); });
  const cam = M.makeCamera({ cx: 300, cy: 300, f: 1200, d: 1200, yaw: 0.0 });
  const quad = M.cardQuads([0, 0, 0], 400, 400, 2, M.I3, { front: T }); const cv1 = createCanvas(600, 600), c1 = cv1.getContext('2d'); c1.fillStyle = '#000'; c1.fillRect(0, 0, 600, 600);
  const pr = M.drawQuads(c1, quad, cam, { light: { ambient: 1, diffuse: 0 } }); const f = pr.find(d => d.q.name === 'front');
  // red square centre = texture (75,75) = (0.375, 0.375) of the face
  const bil = (u, v) => { const [a, b, c, d] = f.s; const t = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], bt = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u]; return [t[0] + (bt[0] - t[0]) * v, t[1] + (bt[1] - t[1]) * v]; };
  let q = bil(0.375, 0.375); let c = px(cv1, ...q); ok(c[0] > 240 && c[1] < 20 && c[2] < 20, 'red square lands at its mapped place (flat-on): ' + c);
  q = bil(0.875, 0.875); c = px(cv1, ...q); ok(c[2] > 240 && c[0] < 20, 'blue square at the opposite corner: ' + c);
  q = bil(0.1, 0.9); c = px(cv1, ...q); ok(c[0] > 240 && c[1] > 240 && c[2] > 240, 'white elsewhere');
  // strong perspective: sample the projected centre of the red square using TRUE 3D mapping (affine grid cells are exact only at grid points, so test within 3 px)
  const camP = M.makeCamera({ cx: 300, cy: 300, f: 1000, d: 700, yaw: 0.9 }), cv2 = createCanvas(600, 600), c2 = cv2.getContext('2d'); c2.fillStyle = '#000'; c2.fillRect(0, 0, 600, 600);
  const quad2 = M.cardQuads([0, 0, 0], 240, 240, 2, M.I3, { front: T }), pr2 = M.drawQuads(c2, quad2, camP, { light: { ambient: 1, diffuse: 0 }, texN: 16 }), f2 = pr2.find(d => d.q.name === 'front');
  const pt3 = (u, v) => { const [a, b, , d] = f2.q.pts; const P3 = [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * u + (d[i] - a[i]) * v); return M.project(P3, camP); };
  const rc = pt3(0.375, 0.375); c = px(cv2, rc[0], rc[1]); ok(c[0] > 230 && c[1] < 30, 'perspective-correct: red square centre under yaw 0.9, d 700: ' + c);
  const wc = pt3(0.8, 0.2); c = px(cv2, wc[0], wc[1]); ok(c[0] > 230 && c[1] > 230 && c[2] > 230, 'perspective-correct: white at (0.8, 0.2): ' + c);
  // no seams: every interior sample of the textured quad is covered (white texture, black ground)
  let holes = 0, n = 0; for (let i = 1; i < 30; i++) for (let j = 1; j < 30; j++) { const s = pt3(i / 30, j / 30), cc = px(cv2, s[0], s[1]); n++; if (cc[0] + cc[1] + cc[2] === 0) holes++; }
  ok(holes === 0, `no seam holes in ${n} interior samples (${holes} found)`);
  const aff = M.affine([[0, 0], [1, 0], [0, 1]], [[10, 20], [30, 20], [10, 60]]); near(aff[0] * 1 + aff[2] * 0 + aff[4], 30, 1e-9, 'affine maps point 1'); near(aff[1] * 0 + aff[3] * 1 + aff[5], 60, 1e-9, 'affine maps point 2');

  section('shadows');
  const d = M.norm([1, 1, 0]); const fp = M.onFloor([0, -100, 0], d, 0); near(fp[0], 100 / Math.SQRT2 * 0 + 100 * d[0] / d[1], 1e-9, 'onFloor slides along the light'); near(fp[1], 0, 1e-9, 'onFloor lands on the plane');
  near(M.onFloor([5, 0, 7], d, 0)[0], 5, 1e-9, 'a point already on the floor stays');
  const h = M.hull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 7]]); ok(h.length === 4, 'hull drops interior points');
  const ca = createCanvas(600, 600), cx = ca.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, 600, 600);
  const bx = M.boxQuads([0, -50, 0], [100, 100, 100]), verts = bx.flatMap(q => q.pts), cam3 = M.isoCamera({ cx: 300, cy: 300, scale: 1 });
  const hs = M.castShadow(cx, verts, cam3, { dir: [0.6, 1, -0.05], floorY: 0, alpha: 1, blur: 0.01 }); const hc = hs.reduce((a, p) => [a[0] + p[0] / hs.length, a[1] + p[1] / hs.length], [0, 0]);
  ok(hs.length >= 4 && px(ca, hc[0], hc[1])[0] < 40, 'cast shadow darkens the floor at the hull centre');
  const long = M.castShadow(cx, verts, cam3, { dir: [1.5, 1, 0], floorY: 0, alpha: 0, blur: 0.01 }), short = M.castShadow(cx, verts, cam3, { dir: [0.2, 1, 0], floorY: 0, alpha: 0, blur: 0.01 });
  const span = a => Math.max(...a.map(p => p[0])) - Math.min(...a.map(p => p[0])); ok(span(long) > span(short), 'lower light = longer shadow');
  const cs = createCanvas(200, 200), cc2 = cs.getContext('2d'); cc2.fillStyle = '#fff'; cc2.fillRect(0, 0, 200, 200); M.contactShadow(cc2, 100, 100, 60, 20, 0); const dark0 = px(cs, 100, 100)[0];
  cc2.fillStyle = '#fff'; cc2.fillRect(0, 0, 200, 200); M.contactShadow(cc2, 100, 100, 60, 20, 300); ok(px(cs, 100, 100)[0] > dark0 + 40, `contact shadow fades with height (${dark0} -> ${px(cs, 100, 100)[0]})`);

  section('parallax');
  const a = M.parallax(1, 100), b = M.parallax(4, 100), z = M.parallax(8, 100);
  near(a.dx, -100, 1e-9, 'depth 1 moves with the camera'); near(b.dx, -25, 1e-9, 'depth 4 moves a quarter as much'); ok(Math.abs(z.dx) < Math.abs(b.dx) && z.s < b.s && b.s < a.s && z.a < b.a && b.a < a.a, 'deeper = slower, smaller, fainter');
  ok(M.depthTint('#19e08f', 1) !== M.depthTint('#19e08f', 5), 'depthTint changes with depth');

  section('determinism');
  const render = () => { const cvx = createCanvas(600, 600), cxx = cvx.getContext('2d'); M.drawQuads(cxx, M.cardQuads([0, 0, 0], 300, 300, 10, M.rotY(0.7), { front: T, back: T }), cam, { sheen: 0.4 }); return Buffer.from(cxx.getImageData(0, 0, 600, 600).data).toString('base64').length + ':' + Buffer.from(cxx.getImageData(0, 0, 600, 600).data).reduce((s, v, i) => (s * 31 + v + i) >>> 0, 7); };
  ok(render() === render(), 'same inputs, same pixels');
} });
