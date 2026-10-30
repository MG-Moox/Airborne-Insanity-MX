// terrain.js - the Airborne Insanity MX world as pure functions (no DOM / GL), so physics can be tested in Node.
// World units are metres, y is up, north is -z, east is +x. Spawn is at (0, 0).
import * as L from './layout.js';
import { MAP_W, MAP_H, MAP_BLOCK, MAP_B64 } from './mapdata.js';

export const S = L.S;
const [PX0, PY0] = L.SPAWN_PX;
export const toWorld = (px, py) => [(px - PX0) * S, (py - PY0) * S];
export const toMap = (x, z) => [x / S + PX0, z / S + PY0];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function sstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- hashing / noise
function ihash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((1337 + s) | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const hash2 = ihash;
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const a = ihash(xi, yi, 0), b = ihash(xi + 1, yi, 0), c = ihash(xi, yi + 1, 0), d = ihash(xi + 1, yi + 1, 0);
  const ab = a + (b - a) * u, cd = c + (d - c) * u;
  return (ab + (cd - ab) * v) * 2 - 1;
}
export function fbm(x, y, oct) {
  let a = 1, sum = 0, norm = 0, px = x, py = y;
  for (let i = 0; i < oct; i++) {
    sum += a * vnoise(px, py); norm += a;
    const nx = (px * 0.8 - py * 0.6) * 2.03 + 11.7, ny = (px * 0.6 + py * 0.8) * 2.03 - 5.3;
    px = nx; py = ny; a *= 0.5;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- map image colours
const IMG = (() => {
  const bin = atob(MAP_B64);
  const u = new Uint16Array(MAP_W * MAP_H);
  for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
  return u;
})();
const _c = [0, 0, 0];
// bilinear sample of the painted map at image pixel (px, py); returns shared [r,g,b] in 0..1
export function mapColor(px, py) {
  const fx = clamp(px / MAP_BLOCK - 0.5, 0, MAP_W - 1.001), fy = clamp(py / MAP_BLOCK - 0.5, 0, MAP_H - 1.001);
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
  let r = 0, g = 0, b = 0;
  for (let k = 0; k < 4; k++) {
    const xx = x0 + (k & 1), yy = y0 + (k >> 1);
    const w = (k & 1 ? tx : 1 - tx) * (k >> 1 ? ty : 1 - ty);
    const p = IMG[yy * MAP_W + xx];
    r += w * (p >> 11) / 31; g += w * ((p >> 5) & 63) / 63; b += w * (p & 31) / 31;
  }
  _c[0] = r; _c[1] = g; _c[2] = b;
  return _c;
}

// ---------------------------------------------------------------- coarse grid (elevation + border distance)
const GS = 8;
const GX0 = Math.floor(toWorld(0, 0)[0] / GS) * GS - 480, GZ0 = Math.floor(toWorld(0, 0)[1] / GS) * GS - 480;
const GNX = Math.ceil((toWorld(L.IMG_W, L.IMG_H)[0] - GX0 + 480) / GS) + 1;
const GNZ = Math.ceil((toWorld(L.IMG_W, L.IMG_H)[1] - GZ0 + 480) / GS) + 1;
const baseGrid = new Float32Array(GNX * GNZ);
const sdGrid = new Float32Array(GNX * GNZ);

function pip(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function chamfer(d, nx, nz) {
  const D = 1.4142;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let v = d[j * nx + i];
    if (i > 0) v = Math.min(v, d[j * nx + i - 1] + 1);
    if (j > 0) { v = Math.min(v, d[(j - 1) * nx + i] + 1); if (i > 0) v = Math.min(v, d[(j - 1) * nx + i - 1] + D); if (i < nx - 1) v = Math.min(v, d[(j - 1) * nx + i + 1] + D); }
    d[j * nx + i] = v;
  }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    let v = d[j * nx + i];
    if (i < nx - 1) v = Math.min(v, d[j * nx + i + 1] + 1);
    if (j < nz - 1) { v = Math.min(v, d[(j + 1) * nx + i] + 1); if (i < nx - 1) v = Math.min(v, d[(j + 1) * nx + i + 1] + D); if (i > 0) v = Math.min(v, d[(j + 1) * nx + i - 1] + D); }
    d[j * nx + i] = v;
  }
}
(function buildGrids() {
  const inside = new Uint8Array(GNX * GNZ);
  for (let j = 0; j < GNZ; j++) for (let i = 0; i < GNX; i++) {
    const [px, py] = toMap(GX0 + i * GS, GZ0 + j * GS);
    inside[j * GNX + i] = pip(L.BORDER, px, py) ? 1 : 0;
  }
  const dIn = new Float32Array(GNX * GNZ), dOut = new Float32Array(GNX * GNZ);
  for (let k = 0; k < inside.length; k++) { dIn[k] = inside[k] ? 1e6 : 0; dOut[k] = inside[k] ? 0 : 1e6; }
  chamfer(dIn, GNX, GNZ); chamfer(dOut, GNX, GNZ);
  for (let k = 0; k < inside.length; k++) sdGrid[k] = inside[k] ? (dIn[k] - 0.5) * GS : -(dOut[k] - 0.5) * GS;

  const A = L.ANCHORS, na = A.length, sig2 = 2 * L.ANCHOR_SIGMA_PX * L.ANCHOR_SIGMA_PX;
  for (let j = 0; j < GNZ; j++) for (let i = 0; i < GNX; i++) {
    const [px, py] = toMap(GX0 + i * GS, GZ0 + j * GS);
    let dmin = 1e18;
    for (let k = 0; k < na; k++) { const dx = px - A[k][0], dy = py - A[k][1]; const d = dx * dx + dy * dy; if (d < dmin) dmin = d; }
    let ws = 0, hs = 0;
    for (let k = 0; k < na; k++) {
      const dx = px - A[k][0], dy = py - A[k][1];
      const w = Math.exp(-(dx * dx + dy * dy - dmin) / sig2);
      ws += w; hs += w * A[k][2];
    }
    let h = hs / ws;
    const out = Math.max(0, -sdGrid[j * GNX + i]);
    h -= Math.min(out, 260) * 0.95;            // the world falls away outside the border
    baseGrid[j * GNX + i] = h;
  }
})();

function cubic(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
function sampleGrid(grid, x, z) {
  const fx = (x - GX0) / GS, fz = (z - GZ0) / GS;
  let i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  i = clamp(i, 1, GNX - 3); j = clamp(j, 1, GNZ - 3);
  const r = [0, 0, 0, 0];
  for (let m = 0; m < 4; m++) {
    const o = (j - 1 + m) * GNX + i;
    r[m] = cubic(grid[o - 1], grid[o], grid[o + 1], grid[o + 2], tx);
  }
  return cubic(r[0], r[1], r[2], r[3], tz);
}
function sampleGridLinear(grid, x, z) {
  const fx = clamp((x - GX0) / GS, 0, GNX - 1.001), fz = clamp((z - GZ0) / GS, 0, GNZ - 1.001);
  const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
  const a = grid[j * GNX + i], b = grid[j * GNX + i + 1], c = grid[(j + 1) * GNX + i], d = grid[(j + 1) * GNX + i + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}
// signed distance to the border in metres: positive inside the playable area
export const borderSD = (x, z) => sampleGridLinear(sdGrid, x, z);
const baseAt = (x, z) => sampleGrid(baseGrid, x, z);

// ---------------------------------------------------------------- polylines (river, track)
function catmull(pts, closed, step) {
  const n = pts.length, out = [];
  const get = (i) => closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * S;
    const k = Math.max(2, Math.ceil(len / step));
    for (let s = 0; s < k; s++) {
      const t = s / k, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(get(n - 1).slice());
  return out.map((p) => toWorld(p[0], p[1]));
}

class Path {
  constructor(ptsPx, closed, step, hashCell) {
    this.closed = closed;
    const P = catmull(ptsPx, closed, step);
    this.n = P.length;
    this.x = new Float64Array(this.n); this.z = new Float64Array(this.n);
    this.e = new Float64Array(this.n); this.curv = new Float64Array(this.n);
    this.s = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) { this.x[i] = P[i][0]; this.z[i] = P[i][1]; }
    let acc = 0;
    for (let i = 0; i < this.n; i++) {
      this.s[i] = acc;
      const j = closed ? (i + 1) % this.n : Math.min(i + 1, this.n - 1);
      acc += Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]);
    }
    this.length = acc;
    // curvature (signed, + = turning left when walking along the path, north = -z)
    for (let i = 0; i < this.n; i++) {
      const a = this._idx(i - 3), b = i, c = this._idx(i + 3);
      const ax = this.x[b] - this.x[a], az = this.z[b] - this.z[a], bx = this.x[c] - this.x[b], bz = this.z[c] - this.z[b];
      const cr = ax * bz - az * bx, la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      this.curv[i] = -(cr / (la * lb)) / (0.5 * (la + lb) + 1e-6);
    }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < this.n; i++) { x0 = Math.min(x0, this.x[i]); x1 = Math.max(x1, this.x[i]); z0 = Math.min(z0, this.z[i]); z1 = Math.max(z1, this.z[i]); }
    this.box = [x0, z0, x1, z1];
    this.cell = hashCell;
    this.hash = new Map();
    for (let i = 0; i < this.n; i++) {
      const k = this._key(Math.floor(this.x[i] / hashCell), Math.floor(this.z[i] / hashCell));
      let a = this.hash.get(k); if (!a) { a = []; this.hash.set(k, a); } a.push(i);
    }
    this.q = { d: 1e9, e: 0, t: 0, side: 0, i: 0, s: 0 };
  }
  _idx(i) { return this.closed ? ((i % this.n) + this.n) % this.n : clamp(i, 0, this.n - 1); }
  _key(a, b) { return a * 73856093 ^ b * 19349663; }
  // nearest point on the path; result in the shared object this.q (d = distance, side = +1 to the right of travel)
  query(x, z, maxD) {
    const q = this.q; q.d = 1e9;
    const b = this.box;
    if (x < b[0] - maxD || x > b[2] + maxD || z < b[1] - maxD || z > b[3] + maxD) return q;
    const c = this.cell, r = Math.ceil(maxD / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let a = -r; a <= r; a++) for (let bb = -r; bb <= r; bb++) {
      const lst = this.hash.get(this._key(cx + a, cz + bb));
      if (!lst) continue;
      for (const i of lst) {
        for (let o = -1; o <= 0; o++) {
          const i0 = this._idx(i + o), i1 = this._idx(i + o + 1);
          if (!this.closed && i + o < 0) continue;
          if (!this.closed && i + o + 1 > this.n - 1) continue;
          const sx = this.x[i1] - this.x[i0], sz = this.z[i1] - this.z[i0];
          const l2 = sx * sx + sz * sz || 1e-9;
          const t = clamp(((x - this.x[i0]) * sx + (z - this.z[i0]) * sz) / l2, 0, 1);
          const px = this.x[i0] + sx * t - x, pz = this.z[i0] + sz * t - z;
          const d = Math.hypot(px, pz);
          if (d < q.d) {
            q.d = d; q.i = i0; q.t = t;
            q.e = lerp(this.e[i0], this.e[i1], t);
            q.side = (sx * (z - (this.z[i0] + sz * t)) - sz * (x - (this.x[i0] + sx * t))) > 0 ? -1 : 1;
            q.curv = lerp(this.curv[i0], this.curv[i1], t);
            q.s = this.s[i0] + Math.sqrt(l2) * t;
          }
        }
      }
    }
    return q;
  }
}

const river = new Path(L.RIVER, false, 5, 24);
const creek = new Path(L.CREEK, false, 4, 24);
const track = new Path(L.TRACK, true, 5, 24);

// path elevations come from the smooth base terrain; rivers only ever flow downhill
function smoothArr(a, w, closed) {
  const n = a.length, o = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -w; k <= w; k++) { const j = closed ? ((i + k) % n + n) % n : clamp(i + k, 0, n - 1); s += a[j]; c++; }
    o[i] = s / c;
  }
  return o;
}
function initPathElev(p, flow) {
  for (let i = 0; i < p.n; i++) p.e[i] = baseAt(p.x[i], p.z[i]);
  if (flow) {
    p.e = smoothArr(p.e, 6, false);
    let m = 1e9; for (let i = 0; i < p.n; i++) { m = Math.min(m, p.e[i]); p.e[i] = m - i * 0.004; }
    p.e = smoothArr(p.e, 3, false);
  } else {
    p.e = smoothArr(p.e, 12, true);
  }
}
initPathElev(river, true); initPathElev(creek, true); initPathElev(track, false);
export const RIVER_PATH = river, CREEK_PATH = creek, TRACK_PATH = track;

// ---------------------------------------------------------------- features (jumps)
// a jump in world space: origin (cx,cz), unit heading (dx,dz), height H, table length T
function makeJump(cx, cz, headingDeg, H, T) {
  const a = (headingDeg * Math.PI) / 180;
  return { cx, cz, dx: Math.sin(a), dz: -Math.cos(a), H, T: T || 0 };
}
function jumpHeight(f, x, z) {
  const rx = x - f.cx, rz = z - f.cz;
  const u = rx * f.dx + rz * f.dz, v = -rx * f.dz + rz * f.dx;
  const Ll = 17 + 2.5 * f.H;                       // length of the downhill landing slope
  if (u < -15 || u > f.T + Ll + 1 || v > 11 || v < -11) return 0;
  const w = 1 - sstep(4.8, 10, Math.abs(v));
  let h;
  if (u < 0) h = f.H * Math.pow((u + 15) / 15, 1.5);                 // take-off ramp
  else if (u < f.T) h = f.H;                                          // flat table top
  else h = f.H * Math.pow(1 - sstep(f.T, f.T + Ll, u), 1.15);         // long downhill landing
  return h * w;
}

const jumps = [];
function addJump(j) { jumps.push(j); }
const jumpHash = new Map();
function jkey(a, b) { return a * 73856093 ^ b * 19349663; }

// ---- decks (bridges and the lake dock): flat rectangles above the ground
const decks = [];

// ---------------------------------------------------------------- lake
const LK = L.LAKE;
const lakeC = toWorld(LK.cx, LK.cy);
const lakeRx = LK.rx * S, lakeRz = LK.ry * S;
function lakeR(x, z) { const a = (x - lakeC[0]) / lakeRx, b = (z - lakeC[1]) / lakeRz; return Math.sqrt(a * a + b * b); }
export const LAKE_LEVEL = LK.level;

// ---------------------------------------------------------------- the height function
function rawHeight(x, z) {
  const [px, py] = toMap(x, z);
  let h = baseAt(x, z);
  const hb = h;
  // rolling detail: rugged high up, calm in the festival basin
  const basin = sstep(850, 915, py);
  const rug = sstep(130, 430, hb);
  let amp = (1.0 + 9 * rug) * (1 - 0.96 * basin);
  h += fbm(x * 0.0065, z * 0.0065, 4) * amp;
  h += fbm(x * 0.05 + 40, z * 0.05 - 9, 2) * (0.35 + 0.8 * rug) * (1 - 0.9 * basin);
  h += fbm(x * 0.3, z * 0.3, 1) * 0.07;
  // rocky western cliff band
  const cliff = (1 - sstep(60, 170, Math.abs(px - 140))) * sstep(430, 520, py) * (1 - sstep(780, 860, py));
  if (cliff > 0) h += cliff * (Math.abs(fbm(x * 0.02 + 5, z * 0.02, 3)) * 34 - 6);
  // jagged ridgeline on the peak
  const peakK = sstep(330, 500, hb);
  if (peakK > 0) h += peakK * Math.abs(fbm(x * 0.013 + 70, z * 0.013 + 20, 4)) * 38;

  // lake basin
  const lr = lakeR(x, z);
  if (lr < 1.35) {
    const w = 1 - sstep(0.85, 1.35, lr);
    const tgt = lr < 1 ? LK.level - 3.8 * (1 - lr * lr) : LK.level + (lr - 1) * 7;
    h = lerp(h, tgt, w);
  }

  // river + creek channels
  for (const rp of [river, creek]) {
    const q = rp.query(x, z, 18);
    if (q.d < 18) {
      const wide = rp === river ? 1 : 0.7;
      const w = 1 - sstep(5.5 * wide, 17, q.d);
      const prof = q.e - 0.95 * (1 - Math.pow(clamp(q.d / (4.6 * wide), 0, 1), 2));
      const bank = Math.min(h, q.e + 0.35 + Math.max(0, q.d - 4.6 * wide) * 0.45);
      h = lerp(h, q.d < 4.6 * wide ? prof : Math.min(bank, h), w);
    }
  }

  // MX track: levelled ribbon with banked berms
  const tq = track.query(x, z, 30);
  if (tq.d < 30) {
    const flat = 1 - sstep(8.5, 26, tq.d);
    h = lerp(h, tq.e, flat);
    if (tq.d > 7 && tq.d < 13) {
      const outside = (tq.side * Math.sign(tq.curv || 1e-6)) < 0;
      const k = clamp(Math.abs(tq.curv) * 25, 0, 1);
      const bh = 0.45 + (outside ? 1.7 * k : 0.4 * k);
      const bump = Math.exp(-Math.pow((tq.d - 9.6) / 1.9, 2));
      h += bump * bh;
    }
  }
  return h;
}

// bake river/creek surface levels etc. once; jumps/decks are added on top
(function buildFeatures() {
  for (const j of L.JUMPS) { const [x, z] = toWorld(j[0], j[1]); addJump(makeJump(x, z, j[2], j[3], j[4])); }
  // peak kickers face downhill
  for (const j of L.PEAK_JUMPS) {
    const [x, z] = toWorld(j[0], j[1]);
    const gx = rawHeight(x + 4, z) - rawHeight(x - 4, z), gz = rawHeight(x, z + 4) - rawHeight(x, z - 4);
    const hd = (Math.atan2(-gx, gz) * 180) / Math.PI; // compass heading of steepest descent
    addJump(makeJump(x, z, hd, j[2], 0));
  }
  // track jumps follow the loop tangent
  for (const tj of L.TRACK_JUMPS) {
    const idx = Math.floor(tj[0] * track.n);
    const i0 = track._idx(idx), i1 = track._idx(idx + 1);
    const dx = track.x[i1] - track.x[i0], dz = track.z[i1] - track.z[i0];
    const hd = (Math.atan2(dx, -dz) * 180) / Math.PI;
    const j = makeJump(track.x[i0], track.z[i0], hd, tj[1], 4);
    addJump(j);
  }
  for (let k = 0; k < jumps.length; k++) {
    const j = jumps[k];
    const r = Math.ceil(95 / 24);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const kk = jkey(Math.floor(j.cx / 24) + a, Math.floor(j.cz / 24) + b);
      let l = jumpHash.get(kk); if (!l) { l = []; jumpHash.set(kk, l); } l.push(k);
    }
  }
})();
export const JUMP_LIST = jumps;

function featureHeight(x, z) {
  const l = jumpHash.get(jkey(Math.floor(x / 24), Math.floor(z / 24)));
  if (!l) return 0;
  let h = 0;
  for (const k of l) { const v = jumpHeight(jumps[k], x, z); if (v > h) h = v; }
  return h;
}
export { featureHeight };

// true if (x,z) lies in the approach run-up (70 m) or landing zone of any jump, so trees never block it
function inJumpCorridor(x, z) {
  const l = jumpHash.get(jkey(Math.floor(x / 24), Math.floor(z / 24)));
  if (!l) return false;
  for (const k of l) {
    const f = jumps[k];
    const rx = x - f.cx, rz = z - f.cz;
    const u = rx * f.dx + rz * f.dz, v = -rx * f.dz + rz * f.dx;
    if (u > -75 && u < 50 + f.T && Math.abs(v) < 10) return true;
  }
  return false;
}

// decks: built after raw terrain exists
(function buildDecks() {
  const add = (x0, z0, x1, z1, wHalf, y0, y1) => decks.push({ x0, z0, x1, z1, wHalf, y0, y1, len: Math.hypot(x1 - x0, z1 - z0) });
  for (const b of L.BRIDGES) {
    const c = toWorld(b[0], b[1]), a = (b[2] * Math.PI) / 180, dx = Math.sin(a), dz = -Math.cos(a), hl = b[3] / 2;
    const e0 = rawHeight(c[0] - dx * (hl + 2), c[1] - dz * (hl + 2)), e1 = rawHeight(c[0] + dx * (hl + 2), c[1] + dz * (hl + 2));
    const y = Math.max(e0, e1) + 0.15;
    add(c[0] - dx * hl, c[1] - dz * hl, c[0] + dx * hl, c[1] + dz * hl, 2.2, y, y);
  }
  const [a0, a1] = [toWorld(L.DOCK[0], L.DOCK[1]), toWorld(L.DOCK[2], L.DOCK[3])];
  add(a0[0], a0[1], a1[0], a1[1], 1.8, rawHeight(a0[0], a0[1]) + 0.2, LK.level + 0.45);
})();
export const DECKS = decks;
function deckHeight(x, z) {
  for (const d of decks) {
    const ux = (d.x1 - d.x0) / d.len, uz = (d.z1 - d.z0) / d.len;
    const rx = x - d.x0, rz = z - d.z0;
    const u = rx * ux + rz * uz, v = Math.abs(-rx * uz + rz * ux);
    if (u >= -0.5 && u <= d.len + 0.5 && v < d.wHalf) {
      const y = lerp(d.y0, d.y1, clamp(u / d.len, 0, 1));
      return y;
    }
  }
  return -1e9;
}

export const onDeck = (x, z) => deckHeight(x, z) > -1e8;

export function heightAt(x, z) {
  if (DEBUG.flat) return 0;
  let h = rawHeight(x, z);
  const f = featureHeight(x, z);
  if (f > 0) h += f;
  const d = deckHeight(x, z);
  if (d > h - 1.2 && d > -1e8) h = Math.max(h, d);
  return h;
}
export function normalAt(x, z, e = 0.25) {
  if (DEBUG.flat) return [0, 1, 0];
  const hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx / (2 * e), nz = -hz / (2 * e), l = Math.sqrt(nx * nx + 1 + nz * nz);
  return [nx / l, 1 / l, nz / l];
}

// ---------------------------------------------------------------- water
// returns the water surface height at (x,z), or -Infinity if there is no water there
export function waterLevelAt(x, z) {
  if (DEBUG.flat) return -Infinity;
  const lr = lakeR(x, z);
  if (lr < 0.985) return LK.level;
  for (const rp of [river, creek]) {
    const q = rp.query(x, z, 8);
    const wide = rp === river ? 1 : 0.7;
    if (q.d < 4.8 * wide) return q.e;
  }
  return -Infinity;
}
export function waterDepthAt(x, z) { const w = waterLevelAt(x, z); return w === -Infinity ? 0 : Math.max(0, w - rawHeight(x, z)); }

// ---------------------------------------------------------------- surface classification from the painted map
export function surfaceAt(x, z, h) {
  const [px, py] = toMap(x, z);
  const c = mapColor(px, py), r = c[0], g = c[1], b = c[2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, sat = mx > 0 ? (mx - mn) / mx : 0;
  const warm = r > g && g > b;
  const dirt = warm && sat > 0.3 && v > 0.42;
  const out = { dirt, v, sat, r, g, b };
  out.snow = h !== undefined && h > 390 && v > 0.5 && sat < 0.35;
  return out;
}

// grip multiplier at a world position (used by the tyre model)
export function gripAt(x, z, h) {
  if (DEBUG.flat) return DEBUG.grip || 0.9;
  if (waterLevelAt(x, z) > -1e8) return 0.55;
  const s = surfaceAt(x, z, h);
  if (h > 410 && s.v > 0.5) return 0.62;          // snow
  if (s.dirt) return 1.0;
  if (s.v < 0.34 && s.g >= s.r) return 0.86;      // forest floor / grass
  return 0.92;
}

// ---------------------------------------------------------------- zones
export function zoneAt(x, z) {
  const [px, py] = toMap(x, z);
  for (const zn of L.ZONES) {
    if (Math.hypot(px - zn.c[0], py - zn.c[1]) < zn.r) return zn;
  }
  return null;
}

// ---------------------------------------------------------------- trees (density driven by the painted map)
export const CHUNK = 128;
const TREE_CELL = 9;
const treeCache = new Map();
const ckey = (cx, cz) => (cx + 5000) * 100003 + (cz + 5000);
function treeDensity(x, z, h) {
  if (borderSD(x, z) < 6) return 0;
  const s = surfaceAt(x, z, h);
  if (s.dirt) return 0;
  let p = clamp((0.44 - s.v) / 0.26, 0, 1);
  if (s.sat < 0.16) p *= 0.25;
  p *= 1 - sstep(260, 400, h);
  return p;
}
export function treesInChunk(cx, cz) {
  const key = ckey(cx, cz);
  let list = treeCache.get(key);
  if (list) return list;
  list = [];
  const n = Math.ceil(CHUNK / TREE_CELL);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const gi = cx * n + i, gj = cz * n + j;
    const x = cx * CHUNK + (i + ihash(gi, gj, 11)) * TREE_CELL;
    const z = cz * CHUNK + (j + ihash(gi, gj, 12)) * TREE_CELL;
    if (x >= (cx + 1) * CHUNK || z >= (cz + 1) * CHUNK) continue;
    const h = rawHeight(x, z);
    const p = treeDensity(x, z, h);
    if (ihash(gi, gj, 13) > p * 0.95) continue;
    if (waterLevelAt(x, z) > -1e8 || lakeR(x, z) < 1.25) continue;
    if (Math.hypot(x, z) < 22) continue;
    if (track.query(x, z, 34).d < 30) continue;
    if (river.query(x, z, 9).d < 8 || creek.query(x, z, 9).d < 7) continue;
    if (inJumpCorridor(x, z)) continue;
    if (featureHeight(x, z) > 0.01 || featureHeight(x + 8, z) > 0.01 || featureHeight(x - 8, z) > 0.01 || featureHeight(x, z + 8) > 0.01 || featureHeight(x, z - 8) > 0.01) continue;
    if (deckHeight(x, z) > -1e8) continue;
    if (propBlocked(x, z, 5)) continue;
    if (normalAt(x, z)[1] < 0.78) continue;
    const r = ihash(gi, gj, 14);
    list.push({ x, z, y: h, h: 6 + r * 9, r: 0.25 + r * 0.16, kind: ihash(gi, gj, 15) < 0.82 ? 0 : 1, seed: r });
  }
  treeCache.set(key, list);
  return list;
}
export function nearbyTrees(x, z, radius) {
  const out = [];
  const c0x = Math.floor((x - radius) / CHUNK), c1x = Math.floor((x + radius) / CHUNK);
  const c0z = Math.floor((z - radius) / CHUNK), c1z = Math.floor((z + radius) / CHUNK);
  for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
    for (const t of treesInChunk(cx, cz)) { const dx = t.x - x, dz = t.z - z; if (dx * dx + dz * dz < radius * radius) out.push(t); }
  }
  return out;
}

// ---------------------------------------------------------------- solid props (buildings etc.): circles
export const COLLIDERS = [];
export function addCollider(x, z, r, topAboveGround) {
  COLLIDERS.push({ x, z, r, h: topAboveGround, y: rawHeight(x, z) });
}
function propBlocked(x, z, pad) {
  for (const c of COLLIDERS) if (Math.hypot(c.x - x, c.z - z) < c.r + pad) return true;
  return false;
}
export const DEBUG = { noColliders: false, flat: false, grip: 0.9 };   // tests: ride through trees / buildings
export function nearbyColliders(x, z, radius) {
  if (DEBUG.noColliders) return [];
  const out = nearbyTrees(x, z, radius);
  for (const c of COLLIDERS) { const dx = c.x - x, dz = c.z - z; if (dx * dx + dz * dz < (radius + c.r) * (radius + c.r)) out.push(c); }
  return out;
}

// every building / stage / wheel registers circular colliders so you can't ride through them
(function registerProps() {
  for (const b of L.BUILDINGS) {
    const [x, z] = toWorld(b[0], b[1]);
    const w = b[2], d = b[3], a = (b[5] * Math.PI) / 180;
    const n = Math.max(1, Math.round(Math.max(w, d) / Math.min(w, d)));
    const long = w >= d;
    const r = Math.min(w, d) / 2 + 0.3;
    for (let i = 0; i < n; i++) {
      const o = (n === 1 ? 0 : (i / (n - 1) - 0.5) * (Math.max(w, d) - Math.min(w, d)));
      const ox = long ? o : 0, oz = long ? 0 : o;
      addCollider(x + ox * Math.cos(a) - oz * Math.sin(a), z + ox * Math.sin(a) + oz * Math.cos(a), r, b[4] + 4);
    }
  }
  const [sx, sz] = toWorld(L.STAGE.p[0], L.STAGE.p[1]);
  for (let i = -2; i <= 2; i++) addCollider(sx + i * 8, sz - 6, 5, 14);
  const [wx, wz] = toWorld(L.WHEEL.p[0], L.WHEEL.p[1]);
  addCollider(wx, wz, 4, 20);
  const [tx, tz] = toWorld(L.TOWER.p[0], L.TOWER.p[1]);
  addCollider(tx, tz, 1.5, 22);
  const [cx, cz] = toWorld(L.CABIN.p[0], L.CABIN.p[1]);
  addCollider(cx, cz, 4.5, 8);
  for (const c of L.CONTAINERS) { const [x, z] = toWorld(c[0], c[1]); addCollider(x, z, 2.2, 3.5); }
})();

// ---------------------------------------------------------------- spawn / fast travel
export function spawnPoint(i) {
  const t = L.TELEPORTS[i];
  let [x, z] = toWorld(t[1], t[2]);
  let yaw;
  if (t[3] === 'auto') {                       // face downhill and start on the slope above the launch ramp
    const e = 6, gx = heightAt(x + e, z) - heightAt(x - e, z), gz = heightAt(x, z + e) - heightAt(x, z - e), gl = Math.hypot(gx, gz) || 1;
    const dx = -gx / gl, dz = -gz / gl;
    x -= dx * 24; z -= dz * 24; yaw = Math.atan2(-dx, -dz);
  } else yaw = (-t[3] * Math.PI) / 180;
  return { name: t[0], x, z, yaw, cat: t[4], blurb: t[5] };
}
export const TELEPORT_COUNT = L.TELEPORTS.length;
export const WORLD_BOX = { x0: toWorld(0, 0)[0], z0: toWorld(0, 0)[1], x1: toWorld(L.IMG_W, L.IMG_H)[0], z1: toWorld(L.IMG_W, L.IMG_H)[1] };
export const LAYOUT = L;
