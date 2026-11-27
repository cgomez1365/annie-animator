// Annie engine: damped springs (analytic, so any t can be asked for in any order: parallel render workers need that).
// A spring pulls a value from `from` toward `to`: m x'' = -k (x - to) - c x'. Defaults k=170, c=14, m=1 give a lively
// overshoot of about 13 percent that settles in about 0.67 s. damping ratio zeta = c / (2 sqrt(k m)): < 1 bounces, 1 is
// the fastest no-overshoot settle, > 1 is lazy.

/** Named starting points. Spread into the options: spring(t, { to: 1, ...SPRING.snappy }). */
export const SPRING = {
  snappy: { k: 320, c: 26 },   // zeta 0.73, settles ~0.37 s, small overshoot (buttons, chips)
  bouncy: { k: 170, c: 14 },   // zeta 0.54, ~13 % overshoot (landing objects)
  gentle: { k: 90, c: 15 },    // zeta 0.79, soft (panels, camera)
  stiff: { k: 600, c: 40 },    // zeta 0.82, almost no wobble (UI)
  wobbly: { k: 120, c: 6 },    // zeta 0.27, big wobble (stamps, jelly)
  critical: { k: 150, c: 2 * Math.sqrt(150) }, // zeta 1, no overshoot
};

/**
 * Position and velocity of a spring at time t (seconds since it was released).
 * @param {number} t @param {{from?:number,to?:number,k?:number,c?:number,m?:number,v0?:number}} [o]
 * @returns {[number, number]} [x, v]
 */
export function springState(t, { from = 0, to = 1, k = 170, c = 14, m = 1, v0 = 0 } = {}) {
  if (t <= 0) return [from, v0];
  const w0 = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m)), d = from - to;
  if (z < 1 - 1e-9) {
    const wd = w0 * Math.sqrt(1 - z * z), B = (v0 + z * w0 * d) / wd, e = Math.exp(-z * w0 * t), cs = Math.cos(wd * t), sn = Math.sin(wd * t);
    return [to + e * (d * cs + B * sn), e * (-z * w0 * (d * cs + B * sn) + wd * (-d * sn + B * cs))];
  }
  if (z <= 1 + 1e-9) {
    const B = v0 + w0 * d, e = Math.exp(-w0 * t);
    return [to + e * (d + B * t), e * (B - w0 * (d + B * t))];
  }
  const s = Math.sqrt(z * z - 1), r1 = -w0 * (z - s), r2 = -w0 * (z + s), C2 = (v0 - r1 * d) / (r2 - r1), C1 = d - C2;
  const e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
  return [to + C1 * e1 + C2 * e2, C1 * r1 * e1 + C2 * r2 * e2];
}

/** Position of a spring at time t. Example: x = spring(t - 0.4, { from: -200, to: 0, ...SPRING.bouncy }). @returns {number} */
export const spring = (t, o) => springState(t, o)[0];

/**
 * A value that jumps to a new target at each keyframe time and springs there, carrying position and velocity across
 * changes (so a retarget mid-flight bends smoothly, no snap).
 * @param {number} t @param {{t:number,v:number}[]} keys sorted by t; key.v becomes the target at key.t
 * @param {{from?:number,k?:number,c?:number,m?:number}} [o] from = start value before the first key (default keys[0].v)
 * @returns {number}
 */
export function springPath(t, keys, o = {}) {
  let x = o.from ?? keys[0].v, v = 0;
  if (t < keys[0].t) return x;
  for (let i = 0; i < keys.length; i++) {
    const ts = keys[i].t, end = i + 1 < keys.length ? keys[i + 1].t : Infinity, p = { ...o, from: x, to: keys[i].v, v0: v };
    if (t < end) return springState(t - ts, p)[0];
    [x, v] = springState(end - ts, p);
  }
  return x;
}

const memo = new WeakMap();
/**
 * Secondary motion: a mass on a spring that chases `driverFn(t - delay)`. It lags, overshoots, and settles, like a tail
 * or an antenna behind a moving body. Deterministic (fixed 1/240 s steps from t0), safe in any frame order.
 * @param {number} t @param {(t:number)=>number} driverFn the leader's value over time
 * @param {{delay?:number,k?:number,c?:number,m?:number,t0?:number}} [o]
 * @returns {number}
 */
export function followThrough(t, driverFn, { delay = 0, k = 120, c = 12, m = 1, t0 = 0 } = {}) {
  const dt = 1 / 240, n = Math.floor((t - t0) / dt + 1e-9), D = u => driverFn(u - delay);
  const key = `${delay}|${k}|${c}|${m}|${t0}`;
  let rec = memo.get(driverFn); if (!rec) memo.set(driverFn, (rec = new Map()));
  let st = rec.get(key);
  if (!st || st.n > n) st = { n: 0, x: D(t0), v: 0 };
  let { x, v } = st;
  for (let i = st.n; i < n; i++) { const a = (k * (D(t0 + i * dt) - x) - c * v) / m; v += a * dt; x += v * dt; }
  rec.set(key, { n: Math.max(0, n), x, v });
  const rem = t - (t0 + n * dt); // partial last step
  if (rem > 1e-12) { const a = (k * (D(t0 + n * dt) - x) - c * v) / m, v2 = v + a * rem; x += v2 * rem; }
  return x;
}

/** Seconds until the spring stays within `eps` (fraction of the travel) of the target. Use it to size a hold. @returns {number} */
export function settleTime(o = {}, eps = 0.01) {
  const span = Math.abs((o.to ?? 1) - (o.from ?? 0)) || 1; let last = 0;
  for (let t = 0; t < 10; t += 0.005) if (Math.abs(springState(t, o)[0] - (o.to ?? 1)) > eps * span) last = t;
  return last + 0.005;
}
