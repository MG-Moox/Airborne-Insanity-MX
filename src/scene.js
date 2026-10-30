// scene.js - streams terrain chunks (with painted-map colours, forests and boulders) around the camera and draws the world.
import { Geo } from './geometry.js';
import { m4translate, m4mul, m4rotX, m4rotY, m4identity } from './mathgl.js';
import * as T from './terrain.js';
import { buildProps } from './props.js';

const CH = T.CHUNK;
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function terrainColor(x, z, h, n) {
  const [px, py] = T.toMap(x, z);
  const c = T.mapColor(px, py);
  const r = c[0], g = c[1], b = c[2];
  const v = Math.max(r, g, b), mn = Math.min(r, g, b), sat = v > 0 ? (v - mn) / v : 0;
  // classify the painting: dirt tracks / plaza (warm, bright), rock (grey-blue), otherwise vegetation
  const dirtW = Math.min(1, Math.max(0, (r - b - 0.09) / 0.12)) * T.sstep(0.34, 0.5, v) * T.sstep(0.18, 0.3, sat);
  const rockW = Math.max(0, 1 - sat / 0.22) * T.sstep(0.2, 0.32, v) * (1 - T.sstep(0.65, 0.8, v)) * (1 - dirtW);
  const dn = T.fbm(x * 0.05, z * 0.05, 2);
  const lush = T.fbm(x * 0.011 + 40, z * 0.011, 2);
  const forest = [0.09 + 0.04 * dn, 0.19 + 0.06 * dn, 0.07], meadow = mix3([0.24, 0.5, 0.12], [0.5, 0.55, 0.17], T.sstep(0.35, 0.7, lush)).map((q, i) => q + (i === 1 ? 0.07 : 0.05) * (dn - 0.5));
  let col = mix3(forest, meadow, T.sstep(0.22, 0.46, v));
  col = mix3(col, [0.62 + 0.07 * dn, 0.42 + 0.05 * dn, 0.24 + 0.03 * dn], dirtW);
  col = mix3(col, [0.46, 0.45, 0.44], Math.max(rockW * 0.75, T.sstep(230, 340, h) * 0.65));
  // rock on steep faces
  const rock = [0.43, 0.41, 0.39];
  const steep = T.sstep(0.84, 0.55, n[1]);
  if (steep > 0) col = mix3(col, rock, steep * 0.88);
  // snow near the summit
  const sn = T.fbm(x * 0.02, z * 0.02, 3) * 40;
  const snow = T.sstep(335, 430, h + sn) * (0.35 + 0.65 * T.sstep(0.45, 0.85, n[1]));
  if (snow > 0) col = mix3(col, [0.86, 0.89, 0.95], snow);
  // lake / river beds
  if (h < T.LAKE_LEVEL + 0.6 && T.waterLevelAt(x, z) > -1e8) col = mix3(col, [0.2, 0.3, 0.3], 0.85);
  else if (h < 0.5) col = mix3(col, [0.62, 0.55, 0.38], 0.5);
  if (T.onDeck(x, z)) col = [0.42, 0.29, 0.17];
  // slight per-vertex variation
  const k = 0.93 + 0.14 * T.hash2(Math.floor(x * 0.5), Math.floor(z * 0.5), 5);
  return [col[0] * k, col[1] * k, col[2] * k];
}

function addTree(g, t, ox, oz) {
  const s = t.seed, H = t.h, x = t.x - ox, z = t.z - oz, y = t.y - 0.2;
  const tint = t.y > 300 ? T.sstep(300, 420, t.y) : 0;
  const base = mix3([0.07 + 0.06 * s, 0.22 + 0.12 * s, 0.1 + 0.05 * s], [0.18, 0.3, 0.3], tint * 0.7);
  const dark = base.map((v) => v * 0.78);
  { const rr = H * (t.kind === 0 ? 0.22 : 0.26), sh = [0.1, 0.2, 0.07], yy = y + 0.3;
    for (let k = 0; k < 8; k++) { const a0 = (k / 8) * 6.283, a1 = ((k + 1) / 8) * 6.283; g.tri([x, yy, z], [x + Math.sin(a1) * rr, yy, z + Math.cos(a1) * rr], [x + Math.sin(a0) * rr, yy, z + Math.cos(a0) * rr], sh); } }
  const snowy = [0.88, 0.92, 0.95];
  if (t.kind === 0) {
    g.cyl(0.14, 0.22, H * 0.3, 5, [0.3, 0.2, 0.12], m4translate(x, y + H * 0.15, z), false);
    const tiers = [[0.24, 0.46, 0.14], [0.19, 0.42, 0.36], [0.13, 0.38, 0.58]];
    tiers.forEach((tr, i) => g.cone(H * tr[0], H * tr[1], 6, i === 2 && tint > 0.4 ? [snowy, base] : [base, dark], m4translate(x, 0, z), y + H * tr[2]));
  } else {
    // broadleaf / aspen
    g.cyl(0.12, 0.2, H * 0.55, 5, [0.62, 0.58, 0.5], m4translate(x, y + H * 0.27, z), false);
    g.sphere(H * 0.24, 6, 5, mix3([0.3, 0.5, 0.15], [0.55, 0.55, 0.15], s), m4translate(x, y + H * 0.66, z + 0.2));
    g.sphere(H * 0.18, 6, 4, mix3([0.25, 0.46, 0.14], [0.5, 0.5, 0.12], s), m4translate(x + 0.6, y + H * 0.48, z - 0.4));
  }
}

export class World {
  constructor(renderer) {
    this.r = renderer;
    this.chunks = new Map();
    this.radius = 3;
    this.props = null;
    this.stats = { chunks: 0, verts: 0 };
    this.wheelAngle = 0;
    this.box = T.WORLD_BOX;
  }

  init() { this.props = buildProps(this.r); }

  setQuality(q) {
    const radius = [2, 3, 4][q] || 3;
    this.radius = radius;
    const far = 150 + radius * 70;
    this.r.fogRange = [far * 0.45, far * 1.0];
  }

  // grass tufts and wildflowers: tiny geometry that gives the ground scale and depth
  _scatter(g, cx, cz, ox, oz) {
    const N = 34, cell = CH / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = ox + (i + T.hash2(cx * N + i, cz * N + j, 41)) * cell, z = oz + (j + T.hash2(cx * N + i, cz * N + j, 42)) * cell;
      const h = T.heightAt(x, z);
      if (h < 1 || h > 300 || T.borderSD(x, z) < 3 || T.waterLevelAt(x, z) > -1e8 || T.onDeck(x, z)) continue;
      const c = T.mapColor(...T.toMap(x, z)), v = Math.max(c[0], c[1], c[2]), isDirt = c[0] - c[2] > 0.12 && v > 0.4;
      if (isDirt) continue;
      const nn = T.normalAt(x, z, 1); if (nn[1] < 0.8) continue;
      if (T.COLLIDERS.length && T.nearbyColliders(x, z, 1.5).length) continue;
      const r1 = T.hash2(i, j, cx * 7 + cz), lx = x - ox, lz = z - oz;
      const gcol = [0.2 + 0.2 * r1, 0.42 + 0.2 * r1, 0.1 + 0.05 * r1];
      const hh = 0.35 + 0.35 * T.hash2(i, j, 43), a0 = r1 * 6.28;
      for (let k = 0; k < 4; k++) {
        const a = a0 + k * 1.57, bx = lx + Math.cos(a) * 0.1, bz = lz + Math.sin(a) * 0.1;
        g.tri([bx - 0.07, h, bz], [bx + 0.07, h, bz], [bx + Math.cos(a) * 0.14, h + hh, bz + Math.sin(a) * 0.14], gcol);
        g.tri([bx + 0.07, h, bz], [bx - 0.07, h, bz], [bx + Math.cos(a) * 0.14, h + hh, bz + Math.sin(a) * 0.14], gcol);
      }
      if (T.hash2(i, j, 44) > 0.8 && v > 0.45) {
        const fc = [[1, 0.9, 0.2], [0.95, 0.95, 1], [0.9, 0.35, 0.6], [0.6, 0.5, 0.95]][Math.floor(T.hash2(i, j, 45) * 4)];
        g.sphere(0.06, 4, 3, fc, m4translate(lx + 0.3, h + hh + 0.04, lz));
      }
    }
  }

  _key(cx, cz) { return cx * 4099 + cz; }

  _build(cx, cz, lod) {
    const ox = cx * CH, oz = cz * CH;
    const cells = lod === 0 ? 128 : 48, step = CH / cells, nv = cells + 1;
    const g = new Geo();
    const hs = new Float32Array(nv * nv);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) hs[j * nv + i] = T.heightAt(ox + i * step, oz + j * step);
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nv; i++) {
        const x = ox + i * step, z = oz + j * step, h = hs[j * nv + i];
        // normal from neighbours inside the chunk, analytic on the border
        const e = step;
        const hl = i > 0 ? hs[j * nv + i - 1] : T.heightAt(x - e, z), hr = i < nv - 1 ? hs[j * nv + i + 1] : T.heightAt(x + e, z);
        const hu = j > 0 ? hs[(j - 1) * nv + i] : T.heightAt(x, z - e), hd = j < nv - 1 ? hs[(j + 1) * nv + i] : T.heightAt(x, z + e);
        let nx = (hl - hr) / (2 * e), nz = (hu - hd) / (2 * e); const nl = Math.sqrt(nx * nx + 1 + nz * nz);
        const n = [nx / nl, 1 / nl, nz / nl];
        const c = terrainColor(x, z, h, n);
        {   // baked ambient occlusion: hollows and gullies darker, crests slightly lighter
          const k = 3, il = Math.max(0, i - k), ir = Math.min(nv - 1, i + k), ju = Math.max(0, j - k), jd = Math.min(nv - 1, j + k);
          const avg = (hs[j * nv + il] + hs[j * nv + ir] + hs[ju * nv + i] + hs[jd * nv + i]) * 0.25;
          const ao = Math.max(0.55, Math.min(1.1, 1 - (avg - h) * 0.28));
          c[0] *= ao; c[1] *= ao; c[2] *= ao;
        }
        g.p.push(i * step, h, j * step); g.n.push(n[0], n[1], n[2]); g.c.push(c[0], c[1], c[2]);
      }
    }
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const a = j * nv + i, b = a + 1, c = a + nv, d = c + 1;
      g.i.push(a, c, b, b, c, d);
    }
    // skirts hide cracks between chunks of different detail
    const base = g.p.length / 3;
    const edge = [];
    for (let i = 0; i < nv; i++) edge.push(i);                       // north
    for (let j = 1; j < nv; j++) edge.push(j * nv + nv - 1);         // east
    for (let i = nv - 2; i >= 0; i--) edge.push((nv - 1) * nv + i);  // south
    for (let j = nv - 2; j >= 1; j--) edge.push(j * nv);             // west
    const m = edge.length;
    for (const e of edge) { g.p.push(g.p[e * 3], g.p[e * 3 + 1] - 5, g.p[e * 3 + 2]); g.n.push(g.n[e * 3], g.n[e * 3 + 1], g.n[e * 3 + 2]); g.c.push(g.c[e * 3], g.c[e * 3 + 1], g.c[e * 3 + 2]); }
    for (let k = 0; k < m; k++) { const a = edge[k], b = edge[(k + 1) % m], a2 = base + k, b2 = base + ((k + 1) % m); g.i.push(a, a2, b, b, a2, b2); }
    // forests
    const trees = T.treesInChunk(cx, cz);
    const dec = lod === 0 ? 1 : 2;
    for (let k = 0; k < trees.length; k += 1) { if (lod && k % dec) continue; addTree(g, trees[k], ox, oz); }
    if (lod === 0) this._scatter(g, cx, cz, ox, oz);
    // boulders on steep ground
    if (lod === 0) {
      for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
        const x = ox + (i + T.hash2(cx * 9 + i, cz * 9 + j, 31)) * (CH / 9), z = oz + (j + T.hash2(cx * 9 + i, cz * 9 + j, 32)) * (CH / 9);
        if (T.hash2(cx * 9 + i, cz * 9 + j, 33) > 0.35) continue;
        const h = T.heightAt(x, z);
        if (h < 60 || T.borderSD(x, z) < 5) continue;
        const nn = T.normalAt(x, z, 1);
        if (nn[1] > 0.82 || T.waterLevelAt(x, z) > -1e8) continue;
        const sz = 0.8 + T.hash2(i, j, 34) * 2.6, grey = 0.36 + 0.14 * T.hash2(i, j, 35);
        if (T.COLLIDERS.length && T.nearbyColliders(x, z, 3).length) continue;
        g.rock(sz, T.hash2(i, j, 36) * 10, [grey, grey * 0.97, grey * 0.93], m4mul(m4translate(x - ox, h - sz * 0.25, z - oz), m4rotY(T.hash2(i, j, 37) * 6)));
      }
    }
    return { mesh: this.r.makeMesh(g), lod, cx, cz, verts: g.p.length / 3 };
  }

  // build / free chunks around (x,z); returns number built this call
  update(x, z, budget = 1) {
    const ccx = Math.floor(x / CH), ccz = Math.floor(z / CH), R = this.radius;
    const want = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dz * dz; if (d2 > (R + 0.4) * (R + 0.4)) continue;
      const cx = ccx + dx, cz = ccz + dz;
      const x0 = cx * CH, z0 = cz * CH;
      if (x0 + CH < this.box.x0 - 400 || x0 > this.box.x1 + 400 || z0 + CH < this.box.z0 - 400 || z0 > this.box.z1 + 400) continue;
      want.push({ cx, cz, d2, lod: d2 <= 2.3 ? 0 : 1 });
    }
    want.sort((a, b) => a.d2 - b.d2);
    let built = 0;
    for (const w of want) {
      if (built >= budget) break;
      const k = this._key(w.cx, w.cz), have = this.chunks.get(k);
      if (!have || have.lod > w.lod) {
        if (have) this.r.freeMesh(have.mesh);
        this.chunks.set(k, this._build(w.cx, w.cz, w.lod)); built++;
      }
    }
    for (const [k, c] of this.chunks) {
      const dx = c.cx - ccx, dz = c.cz - ccz;
      if (dx * dx + dz * dz > (R + 1.8) * (R + 1.8)) { this.r.freeMesh(c.mesh); this.chunks.delete(k); }
    }
    this.stats.chunks = this.chunks.size;
    return { built, pending: want.filter((w) => { const c = this.chunks.get(this._key(w.cx, w.cz)); return !c || c.lod > w.lod; }).length };
  }

  ready(x, z) {
    const ccx = Math.floor(x / CH), ccz = Math.floor(z / CH);
    return this.chunks.has(this._key(ccx, ccz));
  }

  // shadow pass: pass focus ([x,y,z]) and radius to draw only what can land inside that cascade
  draw(cam, dt, focus, R) {
    const r = this.r, ex = cam.eye[0], ez = cam.eye[2];
    const f = cam.fwd;
    for (const c of this.chunks.values()) {
      if (focus) {
        if (Math.abs(c.cx * CH + CH / 2 - focus[0]) > R + CH * 0.8 || Math.abs(c.cz * CH + CH / 2 - focus[2]) > R + CH * 0.8) continue;
        r.draw(c.mesh, m4translate(c.cx * CH, 0, c.cz * CH), { terrain: true });
        continue;
      }
      const mx = c.cx * CH + CH / 2 - ex, mz = c.cz * CH + CH / 2 - ez;
      const d = Math.hypot(mx, mz);
      if (d > CH * 1.2 && (mx * f[0] + mz * f[2]) / d < -0.35) continue;      // behind the camera
      r.draw(c.mesh, m4translate(c.cx * CH, 0, c.cz * CH), { terrain: true });
    }
    for (const m of this.props.statics) r.draw(m, m4identity(), { spec: 0.12, shin: 16 });
    // ferris wheel
    const w = this.props.wheel;
    this.wheelAngle += dt * 0.12;
    r.draw(w.rim, m4mul(m4translate(w.x, w.y, w.z), m4rotX(this.wheelAngle)));
    for (let i = 0; i < w.count; i++) {
      const a = this.wheelAngle + (i / w.count) * Math.PI * 2;
      r.draw(w.gondola, m4translate(w.x, w.y + Math.cos(a) * w.R, w.z + Math.sin(a) * w.R));
    }
  }

  drawWater() {
    for (const w of this.props.water) this.r.draw(w.mesh, m4identity(), { alpha: w.alpha, water: w.fall ? 2 : 1 });
  }
}
