// props.js - static landmarks built from primitives: festival, wheel, buildings, bridges, dock, gate, tower, mast, water.
import { Geo } from './geometry.js';
import { m4translate, m4rotX, m4rotY, m4rotZ, m4mul, m4scale, limbMatrix } from './mathgl.js';
import * as T from './terrain.js';

const rad = (d) => (d * Math.PI) / 180;
const rnd = (a, b, s) => { const v = Math.abs(Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453); return v - Math.floor(v); };
const tube = (g, a, b, r, col, seg = 7) => g.cyl(r, r, 1, seg, col, limbMatrix(a, b), false);

const WALLS = [[0.86, 0.8, 0.68], [0.72, 0.55, 0.38], [0.58, 0.64, 0.74], [0.78, 0.3, 0.24], [0.9, 0.9, 0.9], [0.4, 0.5, 0.42]];
const ROOFS = [[0.55, 0.15, 0.12], [0.25, 0.3, 0.4], [0.22, 0.24, 0.27], [0.42, 0.32, 0.22], [0.92, 0.92, 0.94], [0.7, 0.2, 0.2]];
const TENT_COLS = [[0.95, 0.3, 0.45], [0.2, 0.55, 0.9], [0.98, 0.75, 0.15], [0.3, 0.8, 0.4]];
const WHITE = [0.94, 0.94, 0.96], DARK = [0.1, 0.1, 0.12], WOOD = [0.45, 0.31, 0.18], WOOD2 = [0.55, 0.4, 0.24], METAL = [0.6, 0.62, 0.66], LIME = [0.52, 0.93, 0.12];

function groundY(x, z) { return T.heightAt(x, z); }

export function buildProps(r) {
  const out = { statics: [], water: [], wheel: null };
  const L = T.LAYOUT;
  const world = new Geo();    // opaque world props, in world coordinates

  // ---------------------------------------------------------------- buildings
  for (const b of L.BUILDINGS) {
    const [x, z] = T.toWorld(b[0], b[1]);
    const w = b[2], d = b[3], h = b[4], a = rad(b[5]);
    const y = groundY(x, z);
    const M = m4mul(m4translate(x, y, z), m4rotY(-a));
    const wall = WALLS[(b[6] + Math.floor(rnd(b[0], b[1], 1) * 3)) % WALLS.length], roof = ROOFS[b[6] % ROOFS.length];
    world.box(w, h + 2, d, wall, m4mul(M, m4translate(0, h / 2 - 1, 0)));
    const rr = Math.hypot(w, d) / 2 * 1.08;
    world.cyl(0.0, rr, Math.max(2.2, h * 0.45), 4, roof, m4mul(M, m4mul(m4translate(0, h + Math.max(2.2, h * 0.45) / 2, 0), m4rotY(Math.PI / 4))), false);
    // windows + door
    for (let i = 0; i < Math.max(2, Math.floor(w / 4)); i++) {
      const wx = (i + 0.5) / Math.max(2, Math.floor(w / 4)) * w - w / 2;
      world.box(1.1, 1.2, 0.12, [0.15, 0.2, 0.3], m4mul(M, m4translate(wx, h * 0.55, d / 2 + 0.02)));
      world.box(1.1, 1.2, 0.12, [0.15, 0.2, 0.3], m4mul(M, m4translate(wx, h * 0.55, -d / 2 - 0.02)));
    }
    world.box(1.4, 2.1, 0.14, [0.3, 0.2, 0.12], m4mul(M, m4translate(0, 1.05, d / 2 + 0.03)));
  }

  // ---------------------------------------------------------------- tents + containers + light poles
  L.TENTS.forEach((t, i) => {
    const [x, z] = T.toWorld(t[0], t[1]); const y = groundY(x, z); const c = TENT_COLS[t[2] % TENT_COLS.length];
    world.cyl(3.4, 3.4, 2.4, 10, [0.95, 0.95, 0.95], m4translate(x, y + 1.2, z), false);
    world.cone(3.8, 2.8, 10, [c, WHITE], m4translate(x, 0, z), y + 2.4);
    tube(world, [x, y, z], [x, y + 5.4, z], 0.08, METAL);
  });
  L.CONTAINERS.forEach((c, i) => {
    const [x, z] = T.toWorld(c[0], c[1]); const y = groundY(x, z);
    const col = [[0.8, 0.25, 0.2], [0.2, 0.4, 0.7], [0.85, 0.7, 0.2], [0.3, 0.55, 0.35], [0.6, 0.6, 0.62], [0.9, 0.5, 0.15]][i % 6];
    world.box(6, 2.6, 2.4, col, m4mul(m4translate(x, y + 1.3, z), m4rotY(rad(rnd(i, 3, 9) * 40 - 20))));
  });
  const lamps = [[760, 905], [900, 905], [1000, 940], [700, 960], [560, 1000], [1120, 1030], [780, 1050], [920, 1040], [660, 905], [1100, 940]];
  for (const p of lamps) {
    const [x, z] = T.toWorld(p[0], p[1]); const y = groundY(x, z);
    tube(world, [x, y, z], [x, y + 8, z], 0.12, METAL);
    world.box(1.3, 0.25, 0.6, [1.0, 0.95, 0.75], m4translate(x, y + 8.1, z));
  }

  // ---------------------------------------------------------------- the main stage
  {
    const [sx, sz] = T.toWorld(L.STAGE.p[0], L.STAGE.p[1]); const y = groundY(sx, sz);
    const M = m4mul(m4translate(sx, y, sz), m4rotY(rad(L.STAGE.heading)));
    const PINK = [0.95, 0.35, 0.55];
    world.box(40, 1.8, 20, [0.16, 0.16, 0.19], m4mul(M, m4translate(0, 0.9, 0)));
    world.box(38, 13, 1.2, [0.07, 0.07, 0.09], m4mul(M, m4translate(0, 8.3, -9)));
    world.box(24, 8, 0.4, [0.75, 0.95, 1.0], m4mul(M, m4translate(0, 8, -8.2)));       // LED wall
    world.box(8, 5, 0.4, [1.0, 0.45, 0.7], m4mul(M, m4translate(-14.5, 6.5, -8.2)));
    world.box(8, 5, 0.4, [0.45, 1.0, 0.7], m4mul(M, m4translate(14.5, 6.5, -8.2)));
    world.cone(24, 11, 18, [PINK, WHITE], M, 10.5);
    world.cone(13, 8, 12, [PINK, WHITE], m4mul(M, m4translate(-27, 0, 3)), 7.5);
    world.cone(13, 8, 12, [WHITE, PINK], m4mul(M, m4translate(27, 0, 3)), 7.5);
    for (const [px, pz] of [[-19, 9], [19, 9], [-19, -8], [19, -8], [0, 10], [-10, 10], [10, 10]]) world.cyl(0.35, 0.35, 9.4, 8, WHITE, m4mul(M, m4translate(px, 6.5, pz)), false);
    for (const sgn of [-1, 1]) {
      world.box(4, 5.5, 3, DARK, m4mul(M, m4translate(sgn * 21, 4.5, 5)));
      world.box(4, 5.5, 3, DARK, m4mul(M, m4translate(sgn * 21, 10, 5)));
    }
    // truss + stage lights
    world.box(40, 0.5, 0.5, METAL, m4mul(M, m4translate(0, 10.2, 8)));
    for (let i = -8; i <= 8; i++) world.box(0.7, 0.7, 0.7, [1.0, 0.9, 0.5], m4mul(M, m4translate(i * 2.3, 9.7, 8)));
    // crowd
    for (let i = 0; i < 190; i++) {
      const px = 790 + rnd(i, 1, 2) * 100, py = 935 + rnd(i, 2, 3) * 56;
      const [cx, cz] = T.toWorld(px, py);
      const cy = groundY(cx, cz);
      const cr = [rnd(i, 4, 1), rnd(i, 5, 2) * 0.8, rnd(i, 6, 3)].map((v) => 0.25 + v * 0.7);
      world.cyl(0.24, 0.27, 1.15, 6, cr, m4translate(cx, cy + 0.9, cz), false);
      world.sphere(0.18, 6, 5, [0.82, 0.6, 0.45], m4translate(cx, cy + 1.7, cz));
      if (rnd(i, 7, 4) > 0.55) tube(world, [cx + 0.2, cy + 1.4, cz], [cx + 0.35, cy + 2.2, cz], 0.06, [0.82, 0.6, 0.45], 5);
    }
  }

  // ---------------------------------------------------------------- start gate on the MX track
  {
    const P = T.TRACK_PATH, i0 = 0, i1 = 3;
    const dx = P.x[i1] - P.x[i0], dz = P.z[i1] - P.z[i0], l = Math.hypot(dx, dz);
    const ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
    const x = P.x[i0], z = P.z[i0], y = groundY(x, z);
    const half = 10;
    const a = [x + nx * half, y, z + nz * half], b = [x - nx * half, y, z - nz * half];
    tube(world, a, [a[0], y + 8, a[2]], 0.35, [0.1, 0.1, 0.12], 8);
    tube(world, b, [b[0], y + 8, b[2]], 0.35, [0.1, 0.1, 0.12], 8);
    const rot = m4rotY(Math.atan2(-nz, nx));
    for (let i = 0; i < 20; i++) {
      const t = (i + 0.5) / 20 - 0.5;
      world.box(1, 1.0, 0.3, i % 2 ? [0.95, 0.95, 0.95] : [0.08, 0.08, 0.08], m4mul(m4translate(x + nx * t * 20, y + 7.4, z + nz * t * 20), rot));
    }
    world.box(21, 1.3, 0.4, LIME, m4mul(m4translate(x, y + 8.6, z), rot));
    out.startGate = { x, z, y, ux, uz };
  }

  // ---------------------------------------------------------------- bridges + dock
  for (const d of T.DECKS) {
    const len = d.len, ux = (d.x1 - d.x0) / len, uz = (d.z1 - d.z0) / len, nx = -uz, nz = ux;
    const a = [d.x0, (d.y0 + d.y1) / 2, d.z0], ang = Math.atan2(ux, uz);
    const cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2, cy = (d.y0 + d.y1) / 2;
    const M = m4mul(m4translate(cx, cy + 0.07, cz), m4rotY(ang));
    world.box(d.wHalf * 2, 0.22, len + 1, WOOD2, m4mul(M, m4translate(0, -0.11, 0)));
    for (let k = 0; k < Math.floor(len / 1.2); k++) world.box(d.wHalf * 2 + 0.1, 0.05, 0.12, WOOD, m4mul(M, m4translate(0, 0.01, -len / 2 + k * 1.2 + 0.6)));
    for (const s of [-1, 1]) {
      world.box(0.12, 0.1, len + 1, WOOD, m4mul(M, m4translate(s * (d.wHalf - 0.05), 0.95, 0)));
      for (let k = 0; k <= Math.floor(len / 3); k++) world.box(0.14, 1.0, 0.14, WOOD, m4mul(M, m4translate(s * (d.wHalf - 0.05), 0.5, -len / 2 + k * (len / Math.floor(len / 3)))));
    }
    for (let k = 0; k <= Math.floor(len / 4); k++) for (const s of [-1, 1]) {
      const px = d.x0 + ux * k * (len / Math.floor(len / 4)) + nx * s * (d.wHalf - 0.3), pz = d.z0 + uz * k * (len / Math.floor(len / 4)) + nz * s * (d.wHalf - 0.3);
      const top = d.y0 + (d.y1 - d.y0) * (k / Math.floor(len / 4));
      world.cyl(0.18, 0.18, top - (T.heightAt(px, pz) - 0.5) + 1, 6, WOOD, m4translate(px, (top + T.heightAt(px, pz) - 0.5) / 2 - 0.5, pz), false);
    }
  }

  // ---------------------------------------------------------------- billboard tower, mountain hut, summit mast
  {
    const [x, z] = T.toWorld(L.TOWER.p[0], L.TOWER.p[1]); const y = groundY(x, z);
    world.box(1.4, 22, 1.4, [0.5, 0.5, 0.52], m4translate(x, y + 11, z));
    for (let i = 0; i < 5; i++) world.box(3.4, 3.6, 0.5, i % 2 ? [0.85, 0.1, 0.1] : WHITE, m4translate(x, y + 5 + i * 3.6, z + 0.9));
    const [hx, hz] = T.toWorld(L.CABIN.p[0], L.CABIN.p[1]); const hy = groundY(hx, hz);
    world.box(7, 4.6, 5, WOOD2, m4translate(hx, hy + 1.6, hz));
    world.cyl(0, 5.6, 2.2, 4, [0.3, 0.2, 0.15], m4mul(m4translate(hx, hy + 5, hz), m4rotY(Math.PI / 4)), false);
    world.box(0.8, 3, 0.8, [0.4, 0.4, 0.4], m4translate(hx + 2, hy + 6, hz));
    const [mx, mz] = T.toWorld(220, 40); const my = groundY(mx, mz);
    for (let i = 0; i < 6; i++) world.cyl(0.35, 0.45, 4, 8, i % 2 ? [0.9, 0.12, 0.1] : WHITE, m4translate(mx, my + 2 + i * 4, mz), false);
    world.sphere(0.8, 8, 6, [1, 0.2, 0.1], m4translate(mx, my + 25.5, mz));
  }

  out.statics.push(r.makeMesh(world));

  // ---------------------------------------------------------------- ferris wheel
  {
    const [wx, wz] = T.toWorld(L.WHEEL.p[0], L.WHEEL.p[1]); const y = groundY(wx, wz), R = L.WHEEL.r, axle = R + 3;
    const sup = new Geo();
    for (const s of [-1, 1]) {
      tube(sup, [wx + s * 1.6, y + axle, wz], [wx + s * 1.6, y, wz + 8], 0.35, METAL, 7);
      tube(sup, [wx + s * 1.6, y + axle, wz], [wx + s * 1.6, y, wz - 8], 0.35, METAL, 7);
      sup.box(0.5, 0.4, 18, DARK, m4translate(wx + s * 1.6, y + 0.2, wz));
    }
    tube(sup, [wx - 2.2, y + axle, wz], [wx + 2.2, y + axle, wz], 0.5, DARK, 8);
    out.statics.push(r.makeMesh(sup));
    const rim = new Geo();
    rim.torus(R, 0.25, 36, 5, [0.95, 0.9, 0.95]);
    rim.torus(R * 0.55, 0.15, 24, 5, [0.9, 0.3, 0.5]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; tube(rim, [0, 0, 0], [0, Math.cos(a) * R, Math.sin(a) * R], 0.1, [0.85, 0.85, 0.9], 5); }
    const gon = new Geo();
    gon.box(1.8, 1.3, 1.4, [0.95, 0.4, 0.3], m4translate(0, -0.9, 0)); gon.box(2, 0.15, 1.6, WHITE, m4translate(0, -0.15, 0));
    out.wheel = { rim: r.makeMesh(rim), gondola: r.makeMesh(gon), x: wx, y: y + axle, z: wz, R, count: 12 };
  }

  // ---------------------------------------------------------------- water
  const lake = new Geo(), wLake = [0.08, 0.38, 0.5];
  {
    const c = T.toWorld(L.LAKE.cx, L.LAKE.cy);
    const Rx = L.LAKE.rx * T.S * 0.99, Rz = L.LAKE.ry * T.S * 0.99, lvl = T.LAKE_LEVEL;
    const v = [c[0], lvl, c[1]]; const seg = 56;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      lake.tri(v, [c[0] + Math.cos(a1) * Rx, lvl, c[1] + Math.sin(a1) * Rz], [c[0] + Math.cos(a0) * Rx, lvl, c[1] + Math.sin(a0) * Rz], wLake);
    }
  }
  out.water.push({ mesh: r.makeMesh(lake), alpha: 0.78 });
  for (const P of [T.RIVER_PATH, T.CREEK_PATH]) {
    const g = new Geo(), hw = P === T.RIVER_PATH ? 5.0 : 3.6;
    for (let i = 0; i < P.n - 1; i++) {
      const dx = P.x[i + 1] - P.x[i], dz = P.z[i + 1] - P.z[i], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      const dx0 = i > 0 ? P.x[i] - P.x[i - 1] : dx, dz0 = i > 0 ? P.z[i] - P.z[i - 1] : dz, l0 = Math.hypot(dx0, dz0) || 1, nx0 = -dz0 / l0, nz0 = dx0 / l0;
      const y0 = P.e[i] + 0.02, y1 = P.e[i + 1] + 0.02;
      const col = [0.12, 0.45, 0.55];
      const a = [P.x[i] + nx0 * hw, y0, P.z[i] + nz0 * hw], b = [P.x[i] - nx0 * hw, y0, P.z[i] - nz0 * hw];
      const c = [P.x[i + 1] - nx * hw, y1, P.z[i + 1] - nz * hw], d = [P.x[i + 1] + nx * hw, y1, P.z[i + 1] + nz * hw];
      g.tri(a, b, c, col); g.tri(a, c, d, col);
    }
    out.water.push({ mesh: r.makeMesh(g), alpha: 0.72 });
  }
  // waterfall
  {
    const [tx, tz] = T.toWorld(...L.WATERFALL.top), [bx, bz] = T.toWorld(...L.WATERFALL.bottom);
    const ty = groundY(tx, tz), by = groundY(bx, bz);
    const dx = bx - tx, dz = bz - tz, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l, w = 3.2;
    const g = new Geo();
    const N = 6;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const p = (t, s) => [tx + dx * t + nx * w * s, groundY(tx + dx * t, tz + dz * t) + 0.5, tz + dz * t + nz * w * s];
      g.tri(p(t0, -1), p(t0, 1), p(t1, 1), [0.88, 0.96, 1]); g.tri(p(t0, -1), p(t1, 1), p(t1, -1), [0.88, 0.96, 1]);
    }
    out.water.push({ mesh: r.makeMesh(g), alpha: 0.88, fall: true });
  }
  return out;
}
