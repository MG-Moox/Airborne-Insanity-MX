// altProps.js - props for the generated maps: MX park (grandstand, tents, hay bales...) and the city (buildings, lamps, road paint).
import { Geo } from './geometry.js';
import { m4translate, m4rotY, m4mul, limbMatrix } from './mathgl.js';
import * as T from './terrain.js';

const WHITE = [0.94, 0.94, 0.96], DARK = [0.1, 0.1, 0.12], LIME = [0.52, 0.93, 0.12], STRAW = [0.84, 0.7, 0.3], METAL = [0.6, 0.62, 0.66];
const rnd = (a, b, s) => { const v = Math.abs(Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453); return v - Math.floor(v); };
const tube = (g, a, b, r, col, seg = 6) => g.cyl(r, r, 1, seg, col, limbMatrix(a, b), false);
const gy = (x, z) => T.heightAt(x, z);

class Bag {
  constructor(r) { this.r = r; this.g = new Geo(); this.meshes = []; }
  get geo() { if (this.g.p.length / 3 > 52000) this.flush(); return this.g; }
  flush() { if (this.g.p.length) this.meshes.push(this.r.makeMesh(this.g)); this.g = new Geo(); }
}
// a flat quad lying on the ground; each corner follows the terrain (+lift). corners are [x,z] pairs
function groundQuad(g, c, col, lift) {
  const P = c.map(([x, z]) => [x, gy(x, z) + lift, z]);
  const tri = (a, b, d) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]; const ny = u[2] * v[0] - u[0] * v[2]; if (ny >= 0) g.tri(a, b, d, col); else g.tri(a, d, b, col); };
  tri(P[0], P[1], P[2]); tri(P[0], P[2], P[3]);
}

export function buildAltProps(r) {
  const AM = T.ACTIVE, bag = new Bag(r);
  if (AM.id === 2) mxProps(AM, bag); else cityProps(AM, bag);
  bag.flush();
  return { statics: bag.meshes, water: [], wheel: null, startGate: null };
}

function startGate(g, P, x, z, ux, uz, half) {
  const nx = -uz, nz = ux, y = gy(x, z);
  const a = [x + nx * half, y, z + nz * half], b = [x - nx * half, y, z - nz * half];
  tube(g, a, [a[0], y + 8, a[2]], 0.35, DARK, 8); tube(g, b, [b[0], y + 8, b[2]], 0.35, DARK, 8);
  const rot = m4rotY(Math.atan2(-nz, nx));
  for (let i = 0; i < 20; i++) { const t = (i + 0.5) / 20 - 0.5; g.box(1, 1.0, 0.3, i % 2 ? WHITE : [0.08, 0.08, 0.08], m4mul(m4translate(x + nx * t * half * 2, y + 7.4, z + nz * t * half * 2), rot)); }
  g.box(half * 2 + 1, 1.3, 0.4, LIME, m4mul(m4translate(x, y + 8.6, z), rot));
}

// ---------------------------------------------------------------- MX park
function mxProps(AM, bag) {
  const g0 = bag.geo;
  const sp = AM.startP;
  startGate(g0, null, sp.x, sp.z, sp.dx, sp.dz, 10);
  for (const s of AM.structs) {
    const g = bag.geo, y = gy(s.x, s.z);
    if (s.type === 'tent') {
      g.box(s.w, 3.2, s.d, [0.92, 0.92, 0.94], m4translate(s.x, y + 1.6, s.z));
      g.cone(Math.max(s.w, s.d) * 0.78, 2.2, 4, [s.col, s.col.map((v) => v * 0.8)], m4mul(m4translate(s.x, y + 3.2, s.z), m4rotY(Math.PI / 4)));
      g.box(s.w + 0.1, 0.9, 0.2, s.col, m4translate(s.x, y + 3.0, s.z + s.d / 2 + 0.05));
    } else if (s.type === 'truck') {
      g.box(s.w, s.h, s.d, s.col, m4translate(s.x, y + s.h / 2 + 0.7, s.z));
      g.box(3, 2.6, s.d, [0.2, 0.25, 0.35], m4translate(s.x + s.w / 2 + 1.5, y + 1.9, s.z));
      for (const wx of [-4, 4, s.w / 2]) for (const wz of [-1, 1]) g.cyl(0.55, 0.55, 0.4, 8, DARK, m4mul(m4translate(s.x + wx, y + 0.55, s.z + wz * s.d / 2), limbMatrix([0, 0, -1], [0, 0, 1])), true);
    } else if (s.type === 'hall') {
      g.box(s.w, s.h, s.d, s.col, m4translate(s.x, y + s.h / 2, s.z));
      g.box(s.w + 1, 0.5, s.d + 1, [0.3, 0.3, 0.34], m4translate(s.x, y + s.h + 0.25, s.z));
      g.box(s.w - 2, 1.4, 0.2, [0.15, 0.25, 0.35], m4translate(s.x, y + 3.4, s.z - s.d / 2 - 0.05));
      g.box(10, 1.6, 0.3, LIME, m4translate(s.x, y + s.h + 1.3, s.z - s.d / 2));
    } else if (s.type === 'stand') {
      // stepped grandstand facing the track (north); crowd dots in team colours
      for (let t = 0; t < 7; t++) {
        const h = 1 + t * 1.0, zz = s.z - s.d / 2 + (t + 0.5) * (s.d / 7);
        g.box(s.w, h, s.d / 7, [0.62, 0.64, 0.7], m4translate(s.x, y + h / 2, zz));
        for (let k = 0; k < s.w / 2.4; k++) if (rnd(k, t, 3) > 0.25) { const cc = [0.9 * rnd(k, t, 4) + 0.1, 0.7 * rnd(k, t, 5) + 0.1, 0.8 * rnd(k, t, 6) + 0.1]; g.box(0.7, 0.9, 0.5, cc, m4translate(s.x - s.w / 2 + 1.2 + k * 2.4, y + h + 0.5, zz)); }
      }
      g.box(s.w + 2, 0.4, s.d + 2, [0.88, 0.88, 0.9], m4translate(s.x, y + 10.5, s.z));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) tube(g, [s.x + sx * (s.w / 2 + 0.5), y, s.z + sz * (s.d / 2)], [s.x + sx * (s.w / 2 + 0.5), y + 10.5, s.z + sz * (s.d / 2)], 0.25, METAL, 6);
    }
  }
  for (const t of AM.towers) {
    const g = bag.geo, y = gy(t.x, t.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tube(g, [t.x + sx * 1.6, y, t.z + sz * 1.6], [t.x + sx * 1.6, y + 5, t.z + sz * 1.6], 0.12, [0.85, 0.45, 0.1], 5);
    g.box(4.2, 0.2, 4.2, [0.7, 0.7, 0.72], m4translate(t.x, y + 5, t.z));
    g.box(4.4, 0.25, 4.4, [0.95, 0.5, 0.1], m4translate(t.x, y + 7, t.z));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tube(g, [t.x + sx * 2, y + 5, t.z + sz * 2], [t.x + sx * 2, y + 7, t.z + sz * 2], 0.08, METAL, 4);
  }
  for (const b of AM.bales) {
    const g = bag.geo, y = gy(b.x, b.z);
    g.box(2.4, 1.1, 1.0, STRAW, m4mul(m4translate(b.x, y + 0.55, b.z), m4rotY(b.a - Math.PI / 2)));
    g.box(2.42, 0.08, 1.02, [0.75, 0.6, 0.22], m4mul(m4translate(b.x, y + 0.9, b.z), m4rotY(b.a - Math.PI / 2)));
  }
  for (const t of AM.tyres) {
    const g = bag.geo, y = gy(t.x, t.z);
    for (let k = 0; k < 3; k++) g.cyl(0.55, 0.55, 0.38, 8, k % 2 ? WHITE : DARK, m4translate(t.x, y + 0.25 + k * 0.38, t.z), true);
  }
  // flag poles along the start straight and on the field
  const poles = [];
  for (let k = -3; k <= 3; k++) poles.push([sp.x + sp.dx * k * 28 - sp.dz * 19, sp.z + sp.dz * k * 28 + sp.dx * 19]);
  for (let k = 0; k < 6; k++) poles.push([180 + k * 50, 244]);
  poles.forEach(([x, z], k) => {
    const g = bag.geo, y = gy(x, z);
    tube(g, [x, y, z], [x, y + 7, z], 0.07, METAL, 5);
    g.box(0.05, 1.1, 1.8, [[0.95, 0.3, 0.3], [0.2, 0.5, 0.95], [0.98, 0.8, 0.2], LIME][k % 4], m4translate(x, y + 6.2, z + 0.95));
  });
  // finish-straight kerb markers and sponsor boards beside the grandstand
  for (let i = 0; i < 6; i++) { const g = bag.geo, x = -85 + i * 28, z = 221, y = gy(x, z); g.box(14, 2, 0.2, [[0.1, 0.1, 0.12], LIME, [0.9, 0.2, 0.15]][i % 3], m4translate(x, y + 1.1, z)); }
}

// ---------------------------------------------------------------- city
function cityProps(AM, bag) {
  const { CP, CR, CK } = AM;
  startGate(bag.geo, null, AM.startP.x, AM.startP.z, AM.startP.dx, AM.startP.dz, 10);
  for (const b of AM.buildings) {
    const g = bag.geo, hw = b.w / 2, hd = b.d / 2;
    let y0 = 1e9;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) y0 = Math.min(y0, gy(b.x + sx * hw, b.z + sz * hd));
    const H = b.h + 3, cy = y0 - 3 + H / 2, tower = b.kind === 'tower';
    const body = tower ? [0.5, 0.58, 0.68] : b.col;
    g.box(b.w, H, b.d, body, m4translate(b.x, cy, b.z));
    // window bands per floor on all four sides
    const floors = Math.floor((b.h - 4) / 3.6), glass = tower ? [0.14, 0.24, 0.36] : [0.17, 0.22, 0.28];
    if (b.kind !== 'garage') {
      for (let f = 0; f < floors; f++) {
        const fy = y0 + 4.2 + f * 3.6;
        g.box(b.w - 3, 1.7, 0.2, glass, m4translate(b.x, fy, b.z + hd + 0.05)); g.box(b.w - 3, 1.7, 0.2, glass, m4translate(b.x, fy, b.z - hd - 0.05));
        g.box(0.2, 1.7, b.d - 3, glass, m4translate(b.x + hw + 0.05, fy, b.z)); g.box(0.2, 1.7, b.d - 3, glass, m4translate(b.x - hw - 0.05, fy, b.z));
      }
      g.box(b.w - 6, 2.6, 0.25, [0.1, 0.12, 0.15], m4translate(b.x, y0 + 1.4, b.z + hd + 0.08));       // shopfront
    } else {
      for (let f = 0; f < 2; f++) { const fy = y0 + 2.5 + f * 3.4; g.box(b.w + 0.2, 0.5, 0.2, [0.3, 0.3, 0.32], m4translate(b.x, fy, b.z + hd)); g.box(b.w + 0.2, 0.5, 0.2, [0.3, 0.3, 0.32], m4translate(b.x, fy, b.z - hd)); g.box(0.2, 0.5, b.d, [0.3, 0.3, 0.32], m4translate(b.x + hw, fy, b.z)); g.box(0.2, 0.5, b.d, [0.3, 0.3, 0.32], m4translate(b.x - hw, fy, b.z)); }
    }
    const top = y0 + b.h;
    g.box(b.w + 0.6, 0.8, b.d + 0.6, [0.3, 0.3, 0.33], m4translate(b.x, top + 0.2, b.z));
    for (let k = 0; k < 2 + Math.floor(rnd(b.x, b.z, 1) * 3); k++) g.box(3 + rnd(k, b.x, 2) * 2, 1.8, 2.6, [0.6, 0.62, 0.64], m4translate(b.x + (rnd(k, b.z, 3) - 0.5) * (b.w - 8), top + 1.3, b.z + (rnd(k, b.x, 4) - 0.5) * (b.d - 8)));
    if (tower) { tube(g, [b.x, top, b.z], [b.x, top + 14, b.z], 0.25, METAL, 5); g.sphere(0.5, 6, 4, [0.95, 0.15, 0.1], m4translate(b.x, top + 14.2, b.z)); }
  }
  for (const l of AM.lamps) {
    const g = bag.geo, y = gy(l.x, l.z);
    tube(g, [l.x, y, l.z], [l.x, y + 8, l.z], 0.13, [0.25, 0.27, 0.3], 5);
    g.box(1.4, 0.18, 0.5, [0.95, 0.9, 0.7], m4translate(l.x + (AM.axisD(l.x) < CR + 3 ? 0 : 0.5), y + 8.1, l.z));
  }
  // fountain, planters
  for (const s of AM.structs) {
    const g = bag.geo, y = gy(s.x, s.z);
    if (s.type === 'fountain') {
      g.cyl(6, 6, 0.9, 16, [0.7, 0.7, 0.72], m4translate(s.x, y + 0.45, s.z), true);
      g.cyl(5.2, 5.2, 0.4, 16, [0.2, 0.5, 0.7], m4translate(s.x, y + 0.75, s.z), true);
      g.cyl(0.6, 1.0, 3, 8, [0.75, 0.75, 0.78], m4translate(s.x, y + 2.2, s.z), true);
      g.sphere(1.3, 8, 5, [0.6, 0.85, 0.95], m4translate(s.x, y + 3.9, s.z));
    } else if (s.type === 'planter') {
      g.box(3.4, 1.0, 3.4, [0.6, 0.6, 0.58], m4translate(s.x, y + 0.5, s.z));
      g.sphere(1.3, 6, 4, [0.2, 0.5, 0.15], m4translate(s.x, y + 1.7, s.z));
    }
  }
  // skate plaza rails, ledge faces
  { const g = bag.geo, cx = 70, cz = -70;
    for (const [dx0, dz0, ln, ang] of [[-20, -8, 12, 0], [-10, 38, 14, 0], [30, 30, 10, 0]]) {
      const x = cx + dx0, z = cz + dz0, y = gy(x, z);
      tube(g, [x - ln / 2, y + 1.0, z], [x + ln / 2, y + 1.0, z], 0.06, [0.8, 0.8, 0.85], 5);
      for (let k = 0; k <= 3; k++) tube(g, [x - ln / 2 + (ln * k) / 3, y, z], [x - ln / 2 + (ln * k) / 3, y + 1.0, z], 0.05, [0.8, 0.8, 0.85], 4);
    } }
  // road paint: dashed centre lines and zebra crossings
  const g = bag.geo, YEL = [0.9, 0.75, 0.15];
  for (let k = -CK; k <= CK; k++) for (const horiz of [0, 1]) {
    for (let t = -CK * CP - CR; t < CK * CP + CR; t += 10) {
      if (AM.axisD(t + 2) < CR + 3.5) continue;
      const a = t, b = t + 4.5, w = 0.18;
      if (horiz) groundQuad(bag.geo, [[a, k * CP - w], [a, k * CP + w], [b, k * CP + w], [b, k * CP - w]], YEL, 0.045);
      else groundQuad(bag.geo, [[k * CP - w, a], [k * CP + w, a], [k * CP + w, b], [k * CP - w, b]], YEL, 0.045);
    }
  }
  for (let i = -CK; i <= CK; i++) for (let j = -CK; j <= CK; j++) {
    const ix = i * CP, iz = j * CP;
    for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ox = ix + dir[0] * (CR + 2.2), oz = iz + dir[1] * (CR + 2.2);
      if (Math.abs(ox) > CK * CP + CR + 4 || Math.abs(oz) > CK * CP + CR + 4) continue;
      for (let s = -CR + 1.5; s < CR - 1; s += 1.6) {
        const px = dir[0] ? 0 : 1, pz = dir[0] ? 1 : 0;                      // direction across the road
        const cx = ox + px * s, cz = oz + pz * s, hl = 1.6, hw = 0.4;
        const q = dir[0] ? [[cx - hl, cz - hw], [cx - hl, cz + hw], [cx + hl, cz + hw], [cx + hl, cz - hw]] : [[cx - hw, cz - hl], [cx - hw, cz + hl], [cx + hw, cz + hl], [cx + hw, cz - hl]];
        groundQuad(bag.geo, q, [0.88, 0.88, 0.9], 0.045);
      }
    }
  }
}
