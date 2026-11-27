// t7.2 test: STL IO, decimation, cache, rasteriser correctness (z-buffer, culling, clipping, antialiasing, determinism), then the shared render + QC run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSkillTest } from '../../engine/testkit.mjs';
import * as M from './module.mjs';

const DRAGON = '/Users/cris/Desktop/Reports/Agents/VP_AEON/2026-11-16/Assets_Icons_Media/Printer_Axolotl/free_route/dragon_final_v9.stl';
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 't72-'));
const sum = (r) => { const d = r.cv.getContext('2d').getImageData(0, 0, r.w, r.h).data; let h = 7; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) >>> 0; return h; };
const mk = m => M.finishMesh(m, { up: 'y' });
const area = m => { let A = 0; for (let i = 0; i < m.idx.length; i += 3) { const a = m.idx[i] * 3, b = m.idx[i + 1] * 3, c = m.idx[i + 2] * 3, u = [0, 1, 2].map(k => m.pos[b + k] - m.pos[a + k]), v = [0, 1, 2].map(k => m.pos[c + k] - m.pos[a + k]); A += 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]); } return A; };

await runSkillTest({ dir: import.meta.dirname, checks: async ({ ok, near, section }) => {
  section('STL read and write');
  const sph = M.makeSphere(20, 48), soup = M.toSoup(sph), f1 = path.join(tmp, 's.stl'); M.writeSTL(f1, soup);
  const back = M.readSTL(f1); ok(back.binary && back.n === sph.idx.length / 3, `binary roundtrip keeps ${sph.idx.length / 3} triangles`); ok(Math.abs(back.tris[5] - soup[5]) < 1e-6, 'vertex values survive');
  const ascii = 'solid x\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\nendsolid x\n', pa = M.parseSTL(Buffer.from(ascii));
  ok(!pa.binary && pa.n === 1 && pa.tris[3] === 1, 'ASCII STL parses');
  let threw = false; try { M.parseSTL(Buffer.from('not an stl at all, just words'.repeat(10))); } catch { threw = true; } ok(threw, 'garbage is rejected with an error');
  const bb = M.bounds(sph.pos); near(bb.max[0] - bb.min[0], 40, 0.5, 'bounds of a radius 20 sphere');

  section('decimation');
  const big = M.makeSphere(30, 220), bigSoup = M.toSoup(big), T0 = big.idx.length / 3, target = 5000;
  const t0 = performance.now(), d = M.decimate(bigSoup, { target }), ms = performance.now() - t0, T1 = d.idx.length / 3;
  ok(T0 > 40000, `source sphere has ${T0} triangles`); ok(Math.abs(T1 - target) / target < 0.12, `lands within 12 percent of the target: ${T1} vs ${target}`);
  ok(ms < 3000, `decimates ${T0} triangles in ${ms.toFixed(0)} ms`);
  let rmin = 1e9, rmax = 0; for (let i = 0; i < d.pos.length; i += 3) { const r = Math.hypot(d.pos[i], d.pos[i + 1], d.pos[i + 2]); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
  ok(rmax <= 30.01 && rmin >= 30 - d.cell, `every vertex stays on the surface within one cell (r ${rmin.toFixed(2)}..${rmax.toFixed(2)}, cell ${d.cell.toFixed(2)})`);
  const A0 = 4 * Math.PI * 900, A1 = area(d); ok(A1 > 0.9 * A0 && A1 < 1.02 * A0, `surface area kept (${(A1 / A0 * 100).toFixed(1)} percent of the true sphere)`);
  const sm = M.decimate(soup, { target: 100000 }); ok(sm.idx.length / 3 > 0.95 * sph.idx.length / 3 - 4, 'a mesh already under the target is only welded, not thinned');
  ok(d.idx.every(i => i < d.pos.length / 3), 'indices are valid');

  section('prepare and cache');
  const m = M.finishMesh(d, { up: 'z' }); near(m.height, 60, 1.5, 'Z-up sphere: height = 60 after turning upright'); near(m.pos.reduce((a, v, i) => i % 3 === 1 ? Math.min(a, v) : a, 1e9), 0, 1e-4, 'feet at y = 0');
  const cxs = (Math.min(...Array.from({ length: m.V }, (_, i) => m.pos[i * 3])) + Math.max(...Array.from({ length: m.V }, (_, i) => m.pos[i * 3]))) / 2; near(cxs, 0, 0.05, 'centred on x');
  let dots = 0; for (let i = 0; i < m.V; i++) { const x = m.pos[i * 3], y = m.pos[i * 3 + 1] - 30, z = m.pos[i * 3 + 2], l = Math.hypot(x, y, z); dots += (m.nrm[i * 3] * x + m.nrm[i * 3 + 1] * y + m.nrm[i * 3 + 2] * z) / l; }
  ok(dots / m.V > 0.99, `smooth normals point outward (mean dot ${(dots / m.V).toFixed(4)})`);
  const cf = path.join(tmp, 'a.mesh'); M.saveMeshCache(cf, d); const rc = M.readMeshCache(cf);
  ok(rc && rc.pos.length === d.pos.length && rc.idx.length === d.idx.length && rc.pos[10] === d.pos[10] && rc.idx[99] === d.idx[99], 'cache roundtrip is exact');
  fs.writeFileSync(path.join(tmp, 'bad.mesh'), Buffer.from('ANMHgarbage')); ok(M.readMeshCache(path.join(tmp, 'bad.mesh')) === null && M.readMeshCache(path.join(tmp, 'none.mesh')) === null, 'damaged or missing cache returns null');
  const L1 = await M.loadMesh(f1, { target: 300, cacheDir: tmp, up: 'y' }), L2 = await M.loadMesh(f1, { target: 300, cacheDir: tmp, up: 'y' });
  ok(!L1.fromCache && L2.fromCache && L1.T === L2.T && L1.V === L2.V, 'loadMesh: first call builds the cache, second reads it');
  ok(M.cachePath(f1, { target: 300, cacheDir: tmp }) !== M.cachePath(f1, { target: 400, cacheDir: tmp }), 'cache key changes with the target');

  section('rasteriser');
  const S = mk(M.makeSphere(40, 64)), pose = { yaw: 0.3, pitch: 0, scale: 5, cx: 300, cy: 300, dist: 900 }, o = { W: 600, H: 600, ss: 2, returnDepth: true };
  const r = M.renderMesh(S, pose, o); let cov = 0; for (const a of r.alpha) cov += a;
  const expect = Math.PI * Math.pow(40 * 5 * 900 / Math.sqrt(900 * 900 - 1600), 2); ok(Math.abs(cov - expect) / expect < 0.03, `sphere silhouette area ${cov.toFixed(0)} px vs ${expect.toFixed(0)} (within 3 percent)`);
  const ci = (300 - r.y0) * r.w + (300 - r.x0); near(r.depth[ci], 900 - 40, 0.3, 'z-buffer: centre depth = eye distance - radius');
  let partial = 0; for (const a of r.alpha) if (a > 0.1 && a < 0.9) partial++; ok(partial > 0.5 * 2 * Math.PI * 200, `antialiased edge: ${partial} partial-coverage pixels on a ${(2 * Math.PI * 200).toFixed(0)} px circumference`);
  const a1 = M.renderMesh(S, pose, o), a2 = M.renderMesh(S, pose, o); ok(sum(a1) === sum(a2), 'same pose, same pixels (deterministic)');
  // occlusion: two spheres, the nearer one wins at every pixel where both exist
  const near_ = M.makeSphere(20, 48, [0, 0, -40]), far_ = M.makeSphere(30, 48, [0, 0, 40]), two = mk(M.concatMeshes(near_, far_)), nIdx = near_.idx.length;
  const onlyNear = { ...two, idx: two.idx.slice(0, nIdx) }, onlyFar = { ...two, idx: two.idx.slice(nIdx) }, p2 = { ...pose, yaw: 0, scale: 6 };
  const rb = M.renderMesh(two, p2, o), rn = M.renderMesh(onlyNear, p2, o), rf = M.renderMesh(onlyFar, p2, o);
  const z = (R, x, y) => R.depth[(y - R.y0) * R.w + (x - R.x0)], zi = (R, x, y) => R.alpha[(y - R.y0) * R.w + (x - R.x0)];
  let bothCount = 0, bad = 0; for (let y = rb.y0; y < rb.y0 + rb.h; y++) for (let x = rb.x0; x < rb.x0 + rb.w; x++) { if (zi(rn, x, y) === 1 && zi(rf, x, y) === 1 && zi(rb, x, y) === 1) { bothCount++; if (Math.abs(z(rb, x, y) - Math.min(z(rn, x, y), z(rf, x, y))) > 0.05) bad++; } }
  ok(bothCount > 3000 && bad === 0, `occlusion: ${bothCount} overlap pixels, ${bad} with the wrong depth`);
  let nearer = 0; for (let y = rb.y0; y < rb.y0 + rb.h; y += 3) for (let x = rb.x0; x < rb.x0 + rb.w; x += 3) if (zi(rn, x, y) === 1 && zi(rf, x, y) === 1 && z(rn, x, y) < z(rf, x, y)) nearer++; ok(nearer > 200, 'the nearer sphere really is nearer in the overlap');
  // winding and culling: a reversed mesh shows nothing without clipping (inside-out), a correct one shows its front
  const rev = { ...S, idx: Uint32Array.from(S.idx, (v, i) => S.idx[i - (i % 3) + [0, 2, 1][i % 3]]) }; const rr = M.renderMesh(rev, pose, o); ok(Math.abs(rr.depth[ci] - (900 + 40)) < 0.5 && Math.abs(r.depth[ci] - (900 - 40)) < 0.5, `back-face culling: an inside-out sphere shows its FAR wall (${rr.depth[ci].toFixed(1)}), the right one its near wall (${r.depth[ci].toFixed(1)})`);
  // clipping: nothing above the plane; the cut shows the green cap when seen from above
  const H = S.height, pc = { ...pose, pitch: 0.7, yaw: 0, clipY: H * 0.5 }, rc2 = M.renderMesh(S, pc, o), rn2 = M.renderMesh(S, { ...pc, clipY: undefined }, o);
  const topRow = (R) => { for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) if (R.alpha[y * R.w + x] > 0.5) return y + R.y0; };
  ok(topRow(rc2) > topRow(rn2) + 20, `clip plane removes the top: first row ${topRow(rc2)} vs ${topRow(rn2)} uncut`);
  const cut = rc2.cv.getContext('2d').getImageData(0, 0, rc2.w, rc2.h).data; let green = 0; for (let i = 0; i < cut.length; i += 4) if (cut[i + 3] > 200 && cut[i + 1] > cut[i] * 1.6 && cut[i + 1] > cut[i + 2] * 1.2) green++;
  const un = rn2.cv.getContext('2d').getImageData(0, 0, rn2.w, rn2.h).data; let green2 = 0; for (let i = 0; i < un.length; i += 4) if (un[i + 3] > 200 && un[i + 1] > un[i] * 1.6 && un[i + 1] > un[i + 2] * 1.2) green2++;
  ok(green > 5000 && green2 < green / 10, `cap shows green only when clipped (${green} vs ${green2} px)`);
  // shading: the light side is brighter than the shadow side
  const lum = (R, x, y) => { const q = R.cv.getContext('2d').getImageData(x - R.x0, y - R.y0, 1, 1).data; return q[0] + q[1] + q[2]; }; const sp = { yaw: 0, pitch: 0, scale: 5, cx: 300, cy: 300, dist: 900 }, rs = M.renderMesh(S, sp, { W: 600, H: 600, ss: 2 });
  ok(lum(rs, 240, 260) > lum(rs, 370, 340) + 60, `key light from the upper left: lit side ${lum(rs, 240, 260)} vs shadow side ${lum(rs, 370, 340)}`);
  // cavity darkening: a knot's crossings are darker than its open surface
  const K = mk(M.makeTorusKnot()), rk0 = M.renderMesh(K, { yaw: 0.4, pitch: 0.3, scale: 5, cx: 300, cy: 300 }, { W: 600, H: 600, ss: 2 }), rk1 = M.renderMesh(K, { yaw: 0.4, pitch: 0.3, scale: 5, cx: 300, cy: 300 }, { W: 600, H: 600, ss: 2, lights: { ao: 0 } });
  const mean = R => { const q = R.cv.getContext('2d').getImageData(0, 0, R.w, R.h).data; let s = 0, n = 0; for (let i = 0; i < q.length; i += 4) if (q[i + 3] > 250) { s += q[i] + q[i + 1] + q[i + 2]; n++; } return s / n; };
  ok(mean(rk0) < mean(rk1) - 3, `cavity darkening lowers mean brightness (${mean(rk0).toFixed(1)} vs ${mean(rk1).toFixed(1)} without)`);
  // framing and projection
  const sc = M.fitScale(K, { maxW: 400, maxH: 300, pitch: 0.2 }); let wmax = 0, hmax = 0; for (let a = 0; a < 6.3; a += 0.45) { const rr2 = M.renderMesh(K, { yaw: a, pitch: 0.2, scale: sc, cx: 300, cy: 300 }, { W: 600, H: 600, ss: 1 }); wmax = Math.max(wmax, rr2.w - 4); hmax = Math.max(hmax, rr2.h - 4); }
  ok(wmax <= 400 * 1.06 && hmax <= 300 * 1.06, `fitScale keeps a full turn inside the box (max ${wmax} x ${hmax} px in 400 x 300)`);
  const pp = M.projectModelPoint(S, { yaw: 0, pitch: 0, scale: 5, cx: 300, cy: 300, dist: 900 }, [0, S.height / 2, 0]); near(pp[0], 300, 1e-6, 'projectModelPoint: model centre x'); near(pp[1], 300, 1e-6, 'projectModelPoint: model centre y');
  const foot = M.projectModelPoint(S, { yaw: 0, pitch: 0, scale: 5, cx: 300, cy: 300, dist: 900 }, [0, 0, 0]); near(foot[1], 300 + 40 * 5, 1.0, 'feet are half a height below the centre');

  section('the real model');
  if (fs.existsSync(DRAGON)) {
    const t1 = performance.now(), dm = await M.loadMesh(DRAGON, { target: 150000 }), ld = performance.now() - t1;
    ok(Math.abs(dm.T - 150000) / 150000 < 0.1, `dragon decimated from 861,384 to ${dm.T} triangles (target 150000)`);
    near(dm.height, 126.6, 1.0, 'dragon height in mm survives decimation'); near(dm.width, 150.1, 1.5, 'dragon width survives');
    const t2 = performance.now(), dm2 = await M.loadMesh(DRAGON, { target: 150000 }), l2 = performance.now() - t2; ok(dm2.fromCache && l2 < 1500, `second load from the cache in ${l2.toFixed(0)} ms (first ${ld.toFixed(0)} ms)`);
    const tr = performance.now(), rr3 = M.renderMesh(dm2, { yaw: 1, pitch: 0.2, scale: 5.5, cx: 540, cy: 1000 }, {}), fr = performance.now() - tr; ok(fr < 1500 && rr3.coverage > 0.1, `one 1080x1920 frame of ${dm2.T} triangles in ${fr.toFixed(0)} ms`);
  } else console.log('NOTE dragon STL not found: real-model checks skipped');
} });
