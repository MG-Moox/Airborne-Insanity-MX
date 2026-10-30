// maps.js - procedural maps 2 (Ridgeline MX Park, three selectable layouts) and 3 (Downtown freeride city).
// Pure functions (no DOM / GL, no imports) so Node tests can load them. World metres: y up, north = -z, east = +x.
// A map object provides everything terrain.js needs: height, surface/grip/colour, trees, colliders, jumps, track loop, teleports.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function ihash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((1337 + s) | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const a = ihash(xi, yi, 0), b = ihash(xi + 1, yi, 0), c = ihash(xi, yi + 1, 0), d = ihash(xi + 1, yi + 1, 0);
  const ab = a + (b - a) * u, cd = c + (d - c) * u;
  return (ab + (cd - ab) * v) * 2 - 1;
}
function fbm(x, y, oct) {
  let a = 1, sum = 0, norm = 0, px = x, py = y;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(px, py); norm += a; const nx = (px * 0.8 - py * 0.6) * 2.03 + 11.7, ny = (px * 0.6 + py * 0.8) * 2.03 - 5.3; px = nx; py = ny; a *= 0.5; }
  return sum / norm;
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rectSD = (x, z, r) => Math.min(x - r[0], r[2] - x, z - r[1], r[3] - z);   // r = [x0,z0,x1,z1]; positive inside

// ---------------------------------------------------------------- closed smooth loop with nearest-point queries
export class Poly {
  constructor(ctrl, step = 4, cell = 24) {
    const n = ctrl.length, pts = [];
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
      const k = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let s = 0; s < k; s++) {
        const t = s / k, t2 = t * t, t3 = t2 * t;
        pts.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    this.n = pts.length; this.x = new Float64Array(this.n); this.z = new Float64Array(this.n); this.s = new Float64Array(this.n);
    this.e = new Float64Array(this.n); this.curv = new Float64Array(this.n);
    pts.forEach((p, i) => { this.x[i] = p[0]; this.z[i] = p[1]; });
    let acc = 0;
    for (let i = 0; i < this.n; i++) { this.s[i] = acc; const j = (i + 1) % this.n; acc += Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]); }
    this.length = acc;
    for (let i = 0; i < this.n; i++) {
      const a = this._i(i - 3), c = this._i(i + 3);
      const ax = this.x[i] - this.x[a], az = this.z[i] - this.z[a], bx = this.x[c] - this.x[i], bz = this.z[c] - this.z[i];
      const cr = ax * bz - az * bx, la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      this.curv[i] = -(cr / (la * lb)) / (0.5 * (la + lb) + 1e-6);
    }
    this.cell = cell; this.hash = new Map();
    for (let i = 0; i < this.n; i++) { const k = this._k(Math.floor(this.x[i] / cell), Math.floor(this.z[i] / cell)); let a = this.hash.get(k); if (!a) { a = []; this.hash.set(k, a); } a.push(i); }
    this.q = { d: 1e9, e: 0, side: 0, i: 0, s: 0, curv: 0 };
    this.closed = true;
  }
  _i(i) { return ((i % this.n) + this.n) % this.n; }
  _k(a, b) { return a * 73856093 ^ b * 19349663; }
  smoothE(f, w) {
    const n = this.n, t = new Float64Array(n);
    for (let i = 0; i < n; i++) t[i] = f(this.x[i], this.z[i]);
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -w; k <= w; k++) { s += t[this._i(i + k)]; c++; } this.e[i] = s / c; }
  }
  query(x, z, maxD) {
    const q = this.q; q.d = 1e9;
    const c = this.cell, r = Math.ceil(maxD / c), cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const lst = this.hash.get(this._k(cx + a, cz + b)); if (!lst) continue;
      for (const i of lst) for (let o = -1; o <= 0; o++) {
        const i0 = this._i(i + o), i1 = this._i(i + o + 1);
        const sx = this.x[i1] - this.x[i0], sz = this.z[i1] - this.z[i0], l2 = sx * sx + sz * sz || 1e-9;
        const t = clamp(((x - this.x[i0]) * sx + (z - this.z[i0]) * sz) / l2, 0, 1);
        const px = this.x[i0] + sx * t - x, pz = this.z[i0] + sz * t - z, d = Math.hypot(px, pz);
        if (d < q.d) {
          q.d = d; q.i = i0;
          q.e = lerp(this.e[i0], this.e[i1], t);
          q.side = (sx * (z - (this.z[i0] + sz * t)) - sz * (x - (this.x[i0] + sx * t))) > 0 ? -1 : 1;
          q.curv = lerp(this.curv[i0], this.curv[i1], t);
          q.s = this.s[i0] + Math.sqrt(l2) * t;
        }
      }
    }
    return q;
  }
  // point + unit tangent at arc length s (wraps)
  at(s) {
    const L = this.length; s = ((s % L) + L) % L;
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.s[mid] <= s) lo = mid; else hi = mid; }
    const i1 = (lo + 1) % this.n, seg = (i1 === 0 ? L : this.s[i1]) - this.s[lo] || 1, t = clamp((s - this.s[lo]) / seg, 0, 1);
    const dx = this.x[i1] - this.x[lo], dz = this.z[i1] - this.z[lo], l = Math.hypot(dx, dz) || 1;
    return { x: this.x[lo] + dx * t, z: this.z[lo] + dz * t, dx: dx / l, dz: dz / l, hd: (Math.atan2(dx, -dz) * 180) / Math.PI, curv: this.curv[lo] };
  }
  // slide a wished arc length s to the straightest nearby spot (max |curvature| within +-35 m is minimal)
  snap(s, win) {
    const L = this.length; let best = s, bc = 1e9;
    for (let d = -win; d <= win; d += 4) {
      const s0 = s + d; let mc = 0;
      for (let k = -35; k <= 35; k += 7) mc = Math.max(mc, Math.abs(this.at(s0 + k).curv));
      const cost = mc + Math.abs(d) * 1e-5;
      if (cost < bc) { bc = cost; best = s0; }
    }
    return ((best % L) + L) % L;
  }
}

const compassOf = (dx, dz) => (Math.atan2(dx, -dz) * 180) / Math.PI;
const norm360 = (a) => ((a % 360) + 360) % 360;

// ================================================================ MAP 2: RIDGELINE MX PARK
export const MX_LAYOUTS = {
  national: {
    name: 'NATIONAL', blurb: 'Fast and flowing. Big tabletops, long straights, sweeping berms.',
    pts: [[-120, 200], [60, 200], [200, 195], [310, 170], [370, 90], [340, 10], [250, -30], [270, -110], [350, -170], [330, -250], [220, -290], [100, -300], [-30, -290], [-150, -300], [-270, -280], [-340, -210], [-330, -120], [-230, -80], [-170, -10], [-250, 60], [-330, 90], [-340, 165], [-260, 205]],
    jumps: [[0.045, 2.6, 8], [0.095, 3.4, 12], [0.15, 3.0, 0], [0.24, 2.6, 6], [0.33, 3.2, 0], [0.45, 3.0, 10], [0.53, 2.8, 0], [0.66, 3.4, 12], [0.76, 2.6, 0], [0.86, 3.0, 8], [0.94, 2.4, 0]],
    whoops: [[0.39, 110], [0.60, 90]],
  },
  technical: {
    name: 'TECHNICAL', blurb: 'Tight serpentine layout: hairpins, whoops, short rhythm sections.',
    pts: [[-150, 170], [-30, 172], [90, 166], [190, 150], [240, 95], [215, 40], [130, 30], [40, 45], [-50, 35], [-140, 30], [-215, 5], [-225, -55], [-170, -95], [-80, -100], [30, -90], [130, -100], [215, -130], [210, -185], [120, -205], [20, -195], [-90, -200], [-190, -205], [-275, -170], [-295, -60], [-300, 50], [-295, 140], [-250, 190]],
    jumps: [[0.04, 2.2, 6], [0.09, 2.6, 0], [0.2, 2.2, 0], [0.31, 2.4, 6], [0.4, 2.0, 0], [0.5, 2.6, 8], [0.6, 2.2, 0], [0.7, 2.4, 6], [0.8, 2.0, 0], [0.9, 2.4, 0]],
    whoops: [[0.15, 80], [0.36, 80], [0.56, 90], [0.74, 70]],
  },
  freeride: {
    name: 'FREERIDE', blurb: 'Giant doubles and step-ups on a wide open loop. Send it.',
    pts: [[-200, 170], [-60, 175], [100, 170], [250, 150], [350, 70], [380, -30], [320, -120], [200, -160], [60, -175], [-80, -170], [-220, -150], [-330, -80], [-350, 20], [-310, 115]],
    jumps: [[0.04, 3.8, 14], [0.1, 4.6, 0], [0.19, 4.2, 18], [0.3, 5.0, 0], [0.41, 4.0, 14], [0.5, 4.8, 0], [0.6, 4.4, 16], [0.71, 5.2, 0], [0.82, 4.0, 12], [0.92, 4.6, 0]],
    whoops: [],
  },
};
const MX_PADDOCK = [-430, 235, -150, 350], MX_FIELD = [160, 240, 440, 360];
const MX_FIELD_JUMPS = [
  [230, 318, 0, 3.2, 0], [262, 318, 0, 4.0, 12], [300, 318, 0, 2.4, 0], [340, 318, 0, 5.0, 0], [385, 318, 0, 3.0, 8],
  [245, 268, 180, 2.6, 0], [285, 268, 180, 3.4, 6], [325, 268, 180, 2.2, 0], [365, 268, 180, 4.2, 0],
];

function buildMx(layoutId) {
  const LY = MX_LAYOUTS[layoutId] || MX_LAYOUTS.national;
  const S = 1, IMG_W = 920, IMG_H = 760, PX0 = 460, PY0 = 380;
  const box = { x0: -460, z0: -380, x1: 460, z1: 380 };
  const rEdge = (x, z) => Math.max(Math.abs(x) / 460, Math.abs(z) / 380);
  const poly = new Poly(LY.pts, 4, 24);
  const base = (x, z) => {
    const r = rEdge(x, z);
    let h = 1.6 * fbm(x * 0.005 + 3, z * 0.005, 3) + 0.35 * fbm(x * 0.03, z * 0.03, 2);
    const hills = sstep(0.8, 1.15, r);
    h += hills * (10 + 14 * (0.5 + 0.5 * fbm(x * 0.012 + 9, z * 0.012, 3))) + hills * hills * 18;
    return h;
  };
  const padA = 1.0, padB = 1.0;
  const padBlend = (x, z, h) => {
    const a = clamp(rectSD(x, z, MX_PADDOCK) / 24 + 0.15, 0, 1), b = clamp(rectSD(x, z, MX_FIELD) / 24 + 0.15, 0, 1);
    h = lerp(h, padA, sstep(0, 1, a)); return lerp(h, padB, sstep(0, 1, b));
  };
  poly.smoothE((x, z) => base(x, z), 12);
  const L = poly.length;
  // jumps and whoops snapped to straights
  const jumps = [], jumpS = [];
  let lastS = -999;
  for (const [t, H, T] of LY.jumps) {
    const s = poly.snap(t * L, 0.035 * L);
    if (jumpS.some((q) => Math.abs(q - s) < 70)) continue;
    const p = poly.at(s); jumps.push([p.x, p.z, norm360(p.hd), H, T]); jumpS.push(s); lastS = s;
  }
  const whoops = [];
  for (const [t, len] of LY.whoops) { const s = poly.snap(t * L, 0.03 * L); whoops.push([s - len / 2, s + len / 2]); }
  for (const j of MX_FIELD_JUMPS) jumps.push(j.slice());
  const whoopH = (s) => {
    let h = 0;
    for (const [a, b] of whoops) if (s > a && s < b) h += sstep(a, a + 8, s) * (1 - sstep(b - 8, b, s)) * 0.5 * (0.5 - 0.5 * Math.cos(((s - a) * 6.283) / 6.5));
    return h;
  };
  const height = (x, z) => {
    let h = padBlend(x, z, base(x, z));
    const q = poly.query(x, z, 30);
    if (q.d < 30) {
      const flat = 1 - sstep(9, 27, q.d);
      h = lerp(h, q.e, flat);
      const k = clamp(Math.abs(q.curv) * 22, 0, 1);
      if (k > 0.05) {
        const outside = (q.side * Math.sign(q.curv || 1e-6)) < 0;
        if (outside) h += k * 2.0 * sstep(5.2, 8.4, q.d) * (1 - sstep(9.6, 13.5, q.d));
        else h += k * 0.35 * sstep(6, 8, q.d) * (1 - sstep(8.5, 12, q.d));
      }
      if (whoops.length && q.d < 8) h += whoopH(q.s) * (1 - sstep(4.5, 7.2, q.d));
    }
    return h;
  };
  const inField = (x, z) => rectSD(x, z, MX_FIELD) > -6, inPad = (x, z) => rectSD(x, z, MX_PADDOCK) > -6;
  const trackD = (x, z) => poly.query(x, z, 26).d;
  const surface = (x, z) => {
    const d = trackD(x, z);
    if (d < 9.5 || inField(x, z)) return { dirt: true, v: 0.55, sat: 0.45, r: 0.55, g: 0.38, b: 0.22, snow: false, grip: 1.0 };
    if (inPad(x, z)) return { dirt: false, v: 0.5, sat: 0.1, r: 0.5, g: 0.48, b: 0.44, snow: false, grip: 0.92 };
    return { dirt: false, v: 0.3, sat: 0.5, r: 0.2, g: 0.45, b: 0.14, snow: false, grip: 0.88 };
  };
  const color = (x, z, h, n) => {
    const r = rEdge(x, z), dn = fbm(x * 0.05, z * 0.05, 2);
    let col = [0.17 + 0.04 * dn, 0.38 + 0.06 * dn, 0.12];
    col = mix3(col, [0.1, 0.24, 0.08], sstep(0.72, 0.97, r));
    if (inPad(x, z)) col = mix3(col, [0.52 + 0.04 * dn, 0.5 + 0.04 * dn, 0.45], sstep(-2, 6, rectSD(x, z, MX_PADDOCK)));
    if (inField(x, z)) col = mix3(col, [0.52 + 0.05 * dn, 0.38 + 0.04 * dn, 0.23], sstep(-2, 6, rectSD(x, z, MX_FIELD)));
    const q = poly.query(x, z, 24);
    if (q.d < 14) {
      const dd = 1 - sstep(8.8, 11.8, q.d);
      let dc = [0.47 + 0.05 * dn, 0.33 + 0.04 * dn, 0.2 + 0.02 * dn];
      const rut = Math.exp(-Math.pow((q.d - 2.3) / 0.8, 2)) * 0.07;
      dc = [dc[0] - rut, dc[1] - rut, dc[2] - rut * 0.6];
      col = mix3(col, dc, dd);
    }
    const steep = sstep(0.84, 0.55, n[1]);
    if (steep > 0) col = mix3(col, [0.43, 0.41, 0.39], steep * 0.85);
    const k = 0.94 + 0.12 * ihash(Math.floor(x * 0.5), Math.floor(z * 0.5), 5);
    return [col[0] * k, col[1] * k, col[2] * k];
  };
  const trees = (cx, cz, CH) => {
    const out = [], n = Math.ceil(CH / 9);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const gi = cx * n + i, gj = cz * n + j;
      const x = cx * CH + (i + ihash(gi, gj, 11)) * 9, z = cz * CH + (j + ihash(gi, gj, 12)) * 9;
      if (x >= (cx + 1) * CH || z >= (cz + 1) * CH) continue;
      const r = rEdge(x, z); if (r < 0.7) continue;
      if (rectSD(x, z, box) < 8 || rectSD(x, z, MX_PADDOCK) > -22 || rectSD(x, z, MX_FIELD) > -22) continue;
      const p = sstep(0.74, 0.96, r) * 0.85;
      if (ihash(gi, gj, 13) > p * 0.95) continue;
      const h = height(x, z);
      if (Math.abs(height(x + 2, z) - height(x - 2, z)) > 2.2) continue;
      const rr = ihash(gi, gj, 14);
      out.push({ x, z, y: h, h: 6 + rr * 9, r: 0.25 + rr * 0.16, kind: ihash(gi, gj, 15) < 0.8 ? 0 : 1, seed: rr });
    }
    return out;
  };
  // structures (props + colliders)
  const structs = [];
  const colliders = [];
  const addBox = (type, x, z, w, d, h, col, extra) => {
    structs.push({ type, x, z, w, d, h, col, ...(extra || {}) });
    const rr = Math.min(w, d) / 2 + 0.2, n = Math.max(1, Math.round(Math.max(w, d) / Math.min(w, d))), long = w >= d;
    for (let i = 0; i < n; i++) { const o = n === 1 ? 0 : (i / (n - 1) - 0.5) * (Math.max(w, d) - Math.min(w, d)); colliders.push({ x: x + (long ? o : 0), z: z + (long ? 0 : o), r: rr, h: h + 1 }); }
  };
  const TENTS = [[0.95, 0.3, 0.45], [0.2, 0.55, 0.9], [0.98, 0.75, 0.15], [0.3, 0.8, 0.4], [0.95, 0.5, 0.1], [0.6, 0.3, 0.9]];
  for (let i = 0; i < 8; i++) addBox('tent', -400 + (i % 4) * 62, 262 + Math.floor(i / 4) * 40, 12, 9, 4.2, TENTS[i % TENTS.length]);
  for (let i = 0; i < 5; i++) addBox('truck', -400 + i * 48, 328, 14, 3.4, 3.6, [0.85, 0.85, 0.88]);
  addBox('hall', -170, 262, 22, 12, 6, [0.8, 0.78, 0.72]);
  addBox('stand', -20, 232, 150, 12, 7, [0.75, 0.75, 0.78]);   // grandstand along the start straight
  // marshal towers just outside the track at corners
  const towers = [];
  for (let k = 0; k < 7; k++) {
    const s = poly.snap((k + 0.5) / 7 * L, L / 20), p = poly.at(s);
    // pick the outside of the bend
    const out = p.curv > 0 ? 1 : -1, nx = -p.dz * out, nz = p.dx * out;
    // outside normal (rights-hand side of travel is (-dz,dx) in x-z with north=-z; test which side is farther from the centroid)
    const px = p.x + nx * 17, pz = p.z + nz * 17, qx = p.x - nx * 17, qz = p.z - nz * 17;
    const cx0 = 0, cz0 = 0;
    const o = Math.hypot(px - cx0, pz - cz0) > Math.hypot(qx - cx0, qz - cz0) ? [px, pz] : [qx, qz];
    if (rectSD(o[0], o[1], MX_PADDOCK) > -10 || rectSD(o[0], o[1], MX_FIELD) > -10) continue;
    towers.push({ x: o[0], z: o[1] }); colliders.push({ x: o[0], z: o[1], r: 2.4, h: 6 });
  }
  const startP = poly.at(0);
  // hay bales on the outside of the bends, tyre stacks on the inside
  const bales = [], tyres = [];
  for (let s = 0; s < L; s += 6) {
    const p = poly.at(s), k = Math.abs(p.curv);
    if (k < 0.009) continue;
    const out = p.curv > 0 ? -1 : 1;                                  // matches the berm side used in height()
    const nx = -p.dz, nz = p.dx;
    const sx = p.x + nx * out * 15.5, sz = p.z + nz * out * 15.5;
    if (rectSD(sx, sz, MX_PADDOCK) > -4 || rectSD(sx, sz, MX_FIELD) > -4) continue;
    bales.push({ x: sx, z: sz, a: Math.atan2(p.dx, p.dz) });
    if (s % 18 < 6) { const tx = p.x - nx * out * 10, tz = p.z - nz * out * 10; tyres.push({ x: tx, z: tz }); }
  }
  const dist = (x, z, a, b) => Math.hypot(x - a, z - b);
  const zones = [
    { id: 'pad', name: 'PADDOCK', sub: 'Team tents and trucks', test: (x, z) => rectSD(x, z, MX_PADDOCK) > 0 },
    { id: 'field', name: 'FREESTYLE FIELD', sub: 'Practice kickers and big air', test: (x, z) => rectSD(x, z, MX_FIELD) > 0 },
    { id: 'gate', name: 'START STRAIGHT', sub: 'Grandstand and gate', test: (x, z) => dist(x, z, startP.x, startP.z) < 60 },
  ];
  const zoneAt = (x, z) => { for (const zn of zones) if (zn.test(x, z)) return zn; return null; };
  // teleports (world coordinates)
  const tel = [];
  const px = (x, z) => [x / S + PX0, z / S + PY0];
  const addTel = (name, x, z, hd, cat, blurb) => { const [a, b] = px(x, z); tel.push([name, a, b, hd, cat, blurb]); };
  { const p = poly.at(L - 12); addTel('Start gate', p.x, p.z, norm360(p.hd), 'TRACK', 'Gate drop on the start straight'); }
  jumpS.slice(0, 5).forEach((s, i) => { const p = poly.at(s - 38); addTel('Jump ' + (i + 1), p.x, p.z, norm360(p.hd), 'TRACK', 'Approach run to jump ' + (i + 1)); });
  whoops.slice(0, 3).forEach((w, i) => { const p = poly.at(w[0] - 28); addTel('Whoops ' + (i + 1), p.x, p.z, norm360(p.hd), 'TRACK', 'Rhythm section ahead'); });
  addTel('Paddock', -290, 292, 90, 'PADDOCK', 'Team tents and trucks');
  addTel('Grandstand', -20, 250, 90, 'PADDOCK', 'Behind the grandstand');
  addTel('Field: big row', 300, 350, 0, 'FIELD', 'Kickers and tables, heading north');
  addTel('Field: south row', 300, 236, 180, 'FIELD', 'Kickers heading south');
  addTel('Hilltop view', -380, -300, 135, 'FIELD', 'Look down over the whole park');
  const cats = ['TRACK', 'PADDOCK', 'FIELD'];
  const layout = { IMG_W, IMG_H, TELEPORT_CATS: cats.filter((c) => tel.some((t) => t[4] === c)), TELEPORTS: tel };
  // map picture (north-up) drawn with 2D canvas calls
  const image = (doc) => {
    const cv = doc.createElement('canvas'); cv.width = IMG_W; cv.height = IMG_H; const c = cv.getContext('2d');
    const gr = c.createRadialGradient(PX0, PY0, 80, PX0, PY0, 520); gr.addColorStop(0, '#4f9a2c'); gr.addColorStop(0.7, '#3d7d22'); gr.addColorStop(1, '#23501a');
    c.fillStyle = gr; c.fillRect(0, 0, IMG_W, IMG_H);
    const rect = (r, col) => { c.fillStyle = col; const [a, b] = px(r[0], r[1]); c.fillRect(a, b, r[2] - r[0], r[3] - r[1]); };
    rect(MX_PADDOCK, '#8e8a80'); rect(MX_FIELD, '#a77a46');
    const trace = (w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath(); for (let i = 0; i <= poly.n; i++) { const k = i % poly.n, [a, b] = px(poly.x[k], poly.z[k]); if (i) c.lineTo(a, b); else c.moveTo(a, b); } c.stroke(); };
    trace(22, '#3b2a18'); trace(17, '#b07a45');
    c.fillStyle = '#ffd34a';
    for (const j of jumps) { const [a, b] = px(j[0], j[1]); c.beginPath(); c.arc(a, b, 4, 0, 7); c.fill(); }
    for (const st of structs) { const [a, b] = px(st.x, st.z); c.fillStyle = st.type === 'stand' ? '#ccd' : `rgb(${st.col.map((v) => Math.round(v * 255))})`; c.fillRect(a - st.w / 2, b - st.d / 2, st.w, st.d); }
    c.fillStyle = '#fff'; c.font = 'bold 14px system-ui'; c.textAlign = 'center';
    c.fillText('PADDOCK', px(-290, 0)[0], px(0, 305)[1] + 40); c.fillText('FREESTYLE FIELD', px(300, 0)[0], px(0, 300)[1] + 55);
    const sp = px(startP.x, startP.z); c.fillStyle = '#a8ff45'; c.fillRect(sp[0] - 3, sp[1] - 10, 6, 20);
    cv.complete = true;
    return cv;
  };
  return {
    id: 2, name: 'RIDGELINE MX PARK', sub: LY.name + ' LAYOUT', layoutId, S, IMG_W, IMG_H, PX0, PY0, box, poly, jumps, height,
    surface, grip: (x, z) => surface(x, z).grip, color, trees, colliders, structs, towers, bales, tyres, zoneAt, layout, image,
    borderSD: (x, z) => rectSD(x, z, [box.x0, box.z0, box.x1, box.z1]),
    trackCtrl: LY.pts, whoops, jumpS, startP, MX_PADDOCK, MX_FIELD, blurb: LY.blurb,
  };
}

// ================================================================ MAP 3: DOWNTOWN FREERIDE CITY
const CP = 140, CR = 12, CW = 5, CK = 3;                 // street pitch, road half width, sidewalk width, axes at -3..3
function buildCity() {
  const S = 1.5, IMG_W = 750, IMG_H = 750, PX0 = 375, PY0 = 375;
  const box = { x0: -560, z0: -560, x1: 560, z1: 560 };
  const CITY = CK * CP + CR + CW;                          // outer edge of the paved city (437)
  const inCity = (x, z) => Math.abs(x) <= CITY && Math.abs(z) <= CITY;
  const axisD = (v) => Math.abs(v - clamp(Math.round(v / CP), -CK, CK) * CP);
  const blockIJ = (x, z) => [Math.floor(x / CP), Math.floor(z / CP)];
  const SPECIAL = { '0,-1': 'skate', '-1,-1': 'park', '0,0': 'site', '-1,0': 'square' };
  const blockKind = (i, j) => {
    if (i < -CK || i >= CK || j < -CK || j >= CK) return 'none';
    const sp = SPECIAL[i + ',' + j]; if (sp) return sp;
    const h = ihash(i, j, 3);
    return h < 0.34 ? 'mid' : h < 0.56 ? 'tower' : h < 0.68 ? 'park' : h < 0.78 ? 'lot' : h < 0.88 ? 'site' : 'square';
  };
  const bc = (i, j) => [(i + 0.5) * CP, (j + 0.5) * CP];
  const rimH = (x, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); return sstep(CITY + 6, 560, m) * (16 + 14 * (0.5 + 0.5 * fbm(x * 0.01, z * 0.01, 3))); };
  const base = (x, z) => 3.2 * fbm(x * 0.0035 + 7, z * 0.0035, 2) + rimH(x, z) + 0.15 * fbm(x * 0.05, z * 0.05, 2);
  // ---- features inside blocks
  const gauss = (x, z, a, b, A, s) => A * Math.exp(-((x - a) * (x - a) + (z - b) * (z - b)) / (2 * s * s));
  const stairsH = (u) => {                                  // u along the descent direction; platform then 8 steps then ground
    if (u < -16) return 0; if (u < -8) return 2.8 * sstep(-16, -8, u);
    if (u < 0) return 2.8; if (u > 9.6) return 0;
    const k = u / 1.2, f = k - Math.floor(k); return 2.8 - 0.35 * (Math.floor(k) + sstep(0.78, 1, f));
  };
  const blockFeat = (x, z, i, j, kind) => {
    const [cx, cz] = bc(i, j), dx = x - cx, dz = z - cz;
    if (kind === 'skate') {
      let h = 0;
      const br = Math.hypot(dx + 20, dz - 14); h += -3.2 * (1 - sstep(8, 17, br));                     // bowl
      const pyr = Math.max(Math.abs(dx - 24), Math.abs(dz + 22)); h += 1.5 * sstep(14, 8, pyr) * 1;   // funbox pyramid
      const st = stairsH(-(dx - 28)); if (Math.abs(dz - 22) < 5) h += st * (1 - sstep(3.5, 5, Math.abs(dz - 22)));
      if (Math.abs(dz + 2) < 1.2 && dx > -40 && dx < 4) h += 0.45 * (1 - sstep(0.7, 1.2, Math.abs(dz + 2))) * sstep(-40, -38, dx) * (1 - sstep(2, 4, dx));   // ledge
      return h;
    }
    if (kind === 'site') {
      const s1 = ihash(i, j, 21), s2 = ihash(i, j, 22);
      return gauss(x, z, cx - 24 + s1 * 6, cz - 20, 6.5, 12) + gauss(x, z, cx + 18, cz - 26 + s2 * 6, 8, 10) + gauss(x, z, cx + 24, cz + 22, 5, 11) + gauss(x, z, cx - 22, cz + 24 - s1 * 5, 4.2, 9)
        + 0.6 * Math.max(0, Math.sin(dx * 0.5) * Math.sin(dz * 0.5));
    }
    if (kind === 'park') return 2.4 * fbm(x * 0.03 + i, z * 0.03 + j, 2) + gauss(x, z, cx + 10, cz - 10, 4.5, 16);
    return 0;
  };
  const heightRaw = (x, z) => {
    let h = base(x, z);
    if (!inCity(x, z)) return h;
    const u = axisD(x), v = axisD(z), a = u - CR, b = v - CR;
    if (a >= 0 && b >= 0) {
      h += 0.16 * sstep(0, 0.5, Math.min(a, b));
      const bm = sstep(0, 5, Math.min(u, v) - (CR + CW));
      if (bm > 0) { const [i, j] = blockIJ(x, z); const k = blockKind(i, j); if (k !== 'none') h += bm * blockFeat(x, z, i, j, k); }
    }
    return h;
  };
  // ---- buildings
  const buildings = [], structs = [], colliders = [], lamps = [];
  const PAL = [[0.74, 0.72, 0.68], [0.62, 0.38, 0.3], [0.52, 0.58, 0.66], [0.82, 0.78, 0.66], [0.55, 0.55, 0.58], [0.7, 0.52, 0.36], [0.4, 0.46, 0.52]];
  const addB = (x, z, w, d, h, ci, kind) => {
    buildings.push({ x, z, w, d, h, col: PAL[ci % PAL.length], kind });
    const sp = 8, r = 5.5, hw = w / 2 - 2, hd = d / 2 - 2;
    const nx = Math.max(1, Math.ceil((2 * hw) / sp)), nz = Math.max(1, Math.ceil((2 * hd) / sp));
    for (let i = 0; i <= nx; i++) for (const sgn of [-1, 1]) colliders.push({ x: x - hw + (2 * hw * i) / nx, z: z + sgn * hd, r, h: h + 2 });
    for (let j = 1; j < nz; j++) for (const sgn of [-1, 1]) colliders.push({ x: x + sgn * hw, z: z - hd + (2 * hd * j) / nz, r, h: h + 2 });
  };
  const EXT = CP / 2 - CR - CW - 4;                          // usable half extent of a block (49)
  for (let i = -CK; i < CK; i++) for (let j = -CK; j < CK; j++) {
    const kind = blockKind(i, j), [cx, cz] = bc(i, j), r = (s) => ihash(i, j, s);
    if (kind === 'mid') {
      const q = EXT / 2;
      for (let a = 0; a < 4; a++) {
        const w = 32 + r(30 + a) * 12, d = 32 + r(40 + a) * 12;
        addB(cx + (a % 2 ? q : -q) + (r(50 + a) - 0.5) * 3, cz + (a < 2 ? -q : q) + (r(60 + a) - 0.5) * 3, w, d, 14 + r(70 + a) * 36, Math.floor(r(80 + a) * 7), 'mid');
      }
    } else if (kind === 'tower') {
      addB(cx, cz, 50 + r(31) * 12, 50 + r(32) * 12, 70 + r(33) * 50, Math.floor(r(34) * 7), 'tower');
    } else if (kind === 'lot') {
      addB(cx + 20, cz - 22, 34, 30, 9, Math.floor(r(35) * 7), 'garage');
    }
  }
  // street lamps along every street (alternate sides), skipping intersections
  for (let k = -CK; k <= CK; k++) {
    for (let t = -CK * CP + 28; t < CK * CP - 20; t += 56) {
      const off = CR + 1.5, along = t + ihash(k, t, 7) * 6;
      if (axisD(along) < CR + 6) continue;
      const sgn = ((Math.floor(t / 56) + k) & 1) ? 1 : -1;
      lamps.push({ x: k * CP + sgn * off, z: along }); lamps.push({ x: along, z: k * CP + sgn * off });
    }
  }
  for (const l of lamps) colliders.push({ x: l.x, z: l.z, r: 0.4, h: 8 });
  // special structures
  const fountain = { x: -70, z: 70 };
  structs.push({ type: 'fountain', x: fountain.x, z: fountain.z }); colliders.push({ x: fountain.x, z: fountain.z, r: 6, h: 2.5 });
  for (const [px0, pz0] of [[-100, 40], [-40, 40], [-100, 100], [-40, 100]]) { structs.push({ type: 'planter', x: px0, z: pz0 }); colliders.push({ x: px0, z: pz0, r: 1.8, h: 1.2 }); }
  // ---- jumps
  const jumps = [];
  // street gap jumps: the table spans the intersection
  const gaps = [[-280, 0, 90, 2.4, 24], [140, 0, 90, 2.6, 24], [0, -280, 0, 2.4, 24], [0, 140, 180, 2.6, 24], [-140, -280, 0, 2.2, 24], [280, 140, 270, 2.4, 24], [-280, 140, 90, 2.2, 24], [280, -140, 270, 2.6, 24], [140, 280, 180, 2.4, 24]];
  for (const [ix, iz, hd, H, T] of gaps) {
    const a = (hd * Math.PI) / 180, dx = Math.sin(a), dz = -Math.cos(a);
    jumps.push([ix - dx * (CR + 1) - dx * 0, iz - dz * (CR + 1), hd, H, T]);
  }
  // skate plaza and park kickers, site ramps
  jumps.push([40, -100, 90, 1.6, 0], [100, -40, 270, 2.0, 0], [-100, -100, 90, 2.0, 0], [-40, -40, 180, 1.8, 0]);
  const loopC = [[40, -140], [100, -140], [131, -131], [140, -100], [140, -40], [140, 40], [140, 100], [131, 131], [100, 140], [40, 140], [-40, 140], [-100, 140], [-131, 131], [-140, 100], [-140, 40], [-140, -40], [-140, -100], [-131, -131], [-100, -140], [-40, -140]];
  const poly = new Poly(loopC, 4, 24); poly.smoothE((x, z) => heightRaw(x, z), 6);
  const height = heightRaw;
  const surface = (x, z) => {
    const mk = (dirt, v, grip, r, g, b) => ({ dirt, v, sat: dirt ? 0.4 : 0.05, r, g, b, snow: false, grip });
    if (!inCity(x, z)) return mk(false, 0.3, 0.88, 0.2, 0.45, 0.14);
    const u = axisD(x), v = axisD(z);
    if (u < CR || v < CR) return mk(false, 0.45, 0.9, 0.2, 0.2, 0.22);
    if (Math.min(u, v) < CR + CW) return mk(false, 0.5, 0.95, 0.6, 0.6, 0.58);
    const [i, j] = blockIJ(x, z), k = blockKind(i, j);
    if (k === 'site') return mk(true, 0.55, 1.0, 0.55, 0.38, 0.22);
    if (k === 'park') return mk(false, 0.3, 0.88, 0.25, 0.5, 0.15);
    return mk(false, 0.5, 0.97, 0.68, 0.68, 0.66);
  };
  const color = (x, z, h, n) => {
    const dn = fbm(x * 0.05, z * 0.05, 2), k = 0.94 + 0.12 * ihash(Math.floor(x * 0.5), Math.floor(z * 0.5), 5);
    let col;
    if (!inCity(x, z)) {
      col = mix3([0.2 + 0.05 * dn, 0.45 + 0.06 * dn, 0.14], [0.12, 0.27, 0.09], sstep(CITY + 30, 540, Math.max(Math.abs(x), Math.abs(z))));
      const steep = sstep(0.84, 0.55, n[1]); if (steep > 0) col = mix3(col, [0.43, 0.41, 0.39], steep * 0.85);
    } else {
      const u = axisD(x), v = axisD(z);
      if (u < CR || v < CR) col = [0.2 + 0.03 * dn, 0.2 + 0.03 * dn, 0.22 + 0.03 * dn];
      else if (Math.min(u, v) < CR + CW) col = [0.62 + 0.04 * dn, 0.62 + 0.04 * dn, 0.6 + 0.04 * dn];
      else {
        const [i, j] = blockIJ(x, z), kd = blockKind(i, j);
        if (kd === 'park') col = [0.2 + 0.05 * dn, 0.42 + 0.06 * dn, 0.12];
        else if (kd === 'site') col = [0.47 + 0.05 * dn, 0.33 + 0.04 * dn, 0.2];
        else if (kd === 'lot') col = [0.24, 0.24, 0.26];
        else col = [0.66 + 0.04 * dn, 0.66 + 0.04 * dn, 0.64];
        if (kd === 'skate') col = [0.72, 0.72, 0.7];
      }
    }
    return [col[0] * k, col[1] * k, col[2] * k];
  };
  const trees = (cx, cz, CH) => {
    const out = [], n = Math.ceil(CH / 9);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const gi = cx * n + i, gj = cz * n + j;
      const x = cx * CH + (i + ihash(gi, gj, 11)) * 9, z = cz * CH + (j + ihash(gi, gj, 12)) * 9;
      if (x >= (cx + 1) * CH || z >= (cz + 1) * CH) continue;
      if (Math.abs(x) > 556 || Math.abs(z) > 556) continue;
      let p = 0, hh = 6 + ihash(gi, gj, 14) * 9, kind = ihash(gi, gj, 15) < 0.8 ? 0 : 1;
      if (!inCity(x, z)) p = sstep(CITY + 20, CITY + 70, Math.max(Math.abs(x), Math.abs(z))) * 0.8;
      else {
        const u = axisD(x), v = axisD(z);
        if (Math.min(u, v) >= CR + CW + 3) { const [bi, bj] = blockIJ(x, z), kd = blockKind(bi, bj); if (kd === 'park') p = 0.45; kind = 1; hh = 5 + ihash(gi, gj, 14) * 4; }
        else p = 0;
      }
      if (ihash(gi, gj, 13) > p * 0.95) continue;
      if (Math.abs(x) < 24 && Math.abs(z) < 24) continue;
      out.push({ x, z, y: height(x, z), h: hh, r: 0.25 + ihash(gi, gj, 14) * 0.16, kind, seed: ihash(gi, gj, 14) });
    }
    // street trees along sidewalks
    for (let a = -CK; a <= CK; a++) {
      for (const horiz of [0, 1]) for (const sgn of [-1, 1]) {
        const off = CR + CW / 2 + 0.2;
        const step = 20;
        const lo = horiz ? cx * CH : cz * CH, hi = lo + CH;
        for (let t = Math.ceil(lo / step) * step; t < hi; t += step) {
          const x = horiz ? t : a * CP + sgn * off, z = horiz ? a * CP + sgn * off : t;
          if (horiz ? (z < cz * CH || z >= (cz + 1) * CH) : (x < cx * CH || x >= (cx + 1) * CH)) continue;
          if (Math.abs(horiz ? x : z) > CK * CP + CR) continue;
          if (axisD(horiz ? x : z) < CR + CW + 3) continue;                 // keep intersections clear
          if (ihash(Math.round(x), Math.round(z), 91) < 0.25) continue;
          out.push({ x, z, y: height(x, z), h: 6 + ihash(Math.round(x), Math.round(z), 92) * 3, r: 0.22, kind: 1, seed: ihash(Math.round(x), Math.round(z), 93) });
        }
      }
    }
    return out;
  };
  const zones = [
    { id: 'ctr', name: 'DOWNTOWN', sub: 'Main crossing', test: (x, z) => Math.hypot(x, z) < 40 },
    { id: 'skate', name: 'SKATE PLAZA', sub: 'Bowl, stairs and funbox', test: (x, z) => x > 17 && x < 123 && z < -17 && z > -123 },
    { id: 'park', name: 'CITY PARK', sub: 'Rolling grass and trees', test: (x, z) => x < -17 && x > -123 && z < -17 && z > -123 },
    { id: 'site', name: 'BUILDING SITE', sub: 'Dirt mounds and big air', test: (x, z) => x > 17 && x < 123 && z > 17 && z < 123 },
    { id: 'sq', name: 'TOWN SQUARE', sub: 'Fountain and open pavement', test: (x, z) => x < -17 && x > -123 && z > 17 && z < 123 },
  ];
  const zoneAt = (x, z) => { for (const zn of zones) if (zn.test(x, z)) return zn; return null; };
  const tel = [], px = (x, z) => [x / S + PX0, z / S + PY0];
  const addTel = (name, x, z, hd, cat, blurb) => { const [a, b] = px(x, z); tel.push([name, a, b, hd, cat, blurb]); };
  addTel('Downtown crossing', 0, 0, 90, 'DOWNTOWN', 'Centre of the city');
  addTel('Town square', -70, 100, 0, 'DOWNTOWN', 'Open paved square with a fountain');
  addTel('City circuit start', 0, -140, 90, 'DOWNTOWN', 'Lap timer street circuit');
  addTel('Skate bowl', 40, -50, 270, 'SKATE', 'Drop into the concrete bowl');
  addTel('Stair set', 100, -48, 270, 'SKATE', 'Launch down the eight stair');
  addTel('Funbox', 105, -92, 180, 'SKATE', 'Pyramid funbox');
  addTel('Site mounds', 30, 40, 90, 'DIRT', 'Big dirt mounds on the building site');
  addTel('Park hills', -70, -50, 0, 'DIRT', 'Rolling park hills');
  gaps.slice(0, 5).forEach((g, i) => { const a = (g[2] * Math.PI) / 180; addTel('Street gap ' + (i + 1), g[0] - Math.sin(a) * 55, g[1] + Math.cos(a) * 55, g[2], 'STREET GAPS', 'Jump the intersection'); });
  addTel('Edge of town', 400, 0, 270, 'DIRT', 'Ride the hills outside the city');
  const cats = ['DOWNTOWN', 'SKATE', 'DIRT', 'STREET GAPS'];
  const layout = { IMG_W, IMG_H, TELEPORT_CATS: cats.filter((c) => tel.some((t) => t[4] === c)), TELEPORTS: tel };
  const image = (doc) => {
    const cv = doc.createElement('canvas'); cv.width = IMG_W; cv.height = IMG_H; const c = cv.getContext('2d');
    c.fillStyle = '#2f6a22'; c.fillRect(0, 0, IMG_W, IMG_H);
    const f = (x, z, w, d, col) => { const [a, b] = px(x - w / 2, z - d / 2); c.fillStyle = col; c.fillRect(a, b, w / S, d / S); };
    f(0, 0, 2 * CITY, 2 * CITY, '#8d8d8a');
    for (let i = -CK; i < CK; i++) for (let j = -CK; j < CK; j++) {
      const k = blockKind(i, j), [cx, cz] = bc(i, j), s = CP - 2 * (CR + CW) + 2 * CW;
      const col = k === 'park' ? '#3f8a2a' : k === 'site' ? '#9a6a3a' : k === 'lot' ? '#3a3a3e' : k === 'skate' ? '#b9b9b6' : k === 'square' ? '#a8a8a2' : '#8d8d8a';
      f(cx, cz, s, s, col);
    }
    for (let k = -CK; k <= CK; k++) { f(k * CP, 0, 2 * CR, 2 * CITY, '#2c2c30'); f(0, k * CP, 2 * CITY, 2 * CR, '#2c2c30'); }
    for (const b of buildings) f(b.x, b.z, b.w, b.d, b.kind === 'tower' ? '#6f7f93' : b.kind === 'garage' ? '#555' : '#b0a590');
    c.strokeStyle = '#a8ff45'; c.lineWidth = 3; c.setLineDash([8, 6]); c.beginPath();
    for (let i = 0; i <= poly.n; i += 2) { const k = i % poly.n, [a, b] = px(poly.x[k], poly.z[k]); if (i) c.lineTo(a, b); else c.moveTo(a, b); } c.stroke(); c.setLineDash([]);
    c.fillStyle = '#fff'; c.font = 'bold 13px system-ui'; c.textAlign = 'center';
    for (const [nm, x, z] of [['SKATE PLAZA', 70, -70], ['CITY PARK', -70, -70], ['BUILDING SITE', 70, 70], ['TOWN SQUARE', -70, 70]]) { const [a, b] = px(x, z); c.fillText(nm, a, b); }
    cv.complete = true;
    return cv;
  };
  return {
    id: 3, name: 'DOWNTOWN FREERIDE', sub: 'URBAN CITY', S, IMG_W, IMG_H, PX0, PY0, box, poly, jumps, height, surface, grip: (x, z) => surface(x, z).grip,
    color, trees, colliders, structs, buildings, lamps, zoneAt, layout, image, CP, CR, CW, CK, CITY, axisD, blockKind, bc, loopC,
    borderSD: (x, z) => rectSD(x, z, [box.x0, box.z0, box.x1, box.z1]),
    trackCtrl: loopC, whoops: [], jumpS: [], startP: poly.at(0), gaps, blurb: 'Streets, skate plaza, dirt site and street gaps.',
  };
}

export const MAP_INFO = [
  { id: 1, name: 'PAINTED ISLAND', blurb: 'The open-world island: mountain, lake, river, festival and an MX loop.' },
  { id: 2, name: 'RIDGELINE MX PARK', blurb: 'A conventional pro motocross track with three layouts, paddock and a freestyle field.', layouts: Object.entries(MX_LAYOUTS).map(([id, l]) => ({ id, name: l.name, blurb: l.blurb })) },
  { id: 3, name: 'DOWNTOWN FREERIDE', blurb: 'Urban city: street gaps, skate plaza, building-site dirt and a street circuit.' },
];

export function createMap(id, layoutId) {
  if (id === 2) return buildMx(layoutId || 'national');
  if (id === 3) return buildCity();
  return null;
}
