// geometry.js - procedural low-poly mesh builder with per-vertex colour. Transforms are baked in.
import { m4identity } from './mathgl.js';

function normalMat(m) {
  // inverse transpose of the upper-left 3x3 (handles non-uniform scale)
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const Gc = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  // inverse = adj/det where adj = [[A,D,G],[B,E,H],[C,F,I]]; inverse-transpose = adj^T/det
  return [A / det, B / det, C / det, D / det, E / det, F / det, Gc / det, H / det, I / det];
}

export class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  get count() { return this.p.length / 3; }

  _push(verts, norms, color, idx, m) {
    m = m || m4identity();
    const nm = normalMat(m);
    const base = this.p.length / 3;
    for (let k = 0; k < verts.length; k += 3) {
      const x = verts[k], y = verts[k + 1], z = verts[k + 2];
      this.p.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      const nx = norms[k], ny = norms[k + 1], nz = norms[k + 2];
      let tx = nm[0] * nx + nm[3] * ny + nm[6] * nz, ty = nm[1] * nx + nm[4] * ny + nm[7] * nz, tz = nm[2] * nx + nm[5] * ny + nm[8] * nz;
      const l = Math.hypot(tx, ty, tz) || 1;
      this.n.push(tx / l, ty / l, tz / l);
      this.c.push(color[0], color[1], color[2]);
    }
    for (const j of idx) this.i.push(base + j);
  }

  box(sx, sy, sz, color, m) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const faces = [
      [[1, 0, 0], [x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]],
      [[-1, 0, 0], [-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]],
      [[0, 1, 0], [-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]],
      [[0, -1, 0], [-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]],
      [[0, 0, 1], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],
      [[0, 0, -1], [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]],
    ];
    const v = [], n = [], idx = [];
    faces.forEach((f, k) => {
      for (let q = 1; q <= 4; q++) { v.push(...f[q]); n.push(...f[0]); }
      idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    this._push(v, n, color, idx, m);
    return this;
  }

  // axis along y, centred at origin. rTop / rBot may be 0 for a cone.
  cyl(rTop, rBot, h, seg, color, m, caps = true) {
    const v = [], n = [], idx = [];
    const slope = (rBot - rTop) / h;
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, slope);
      v.push(ca * rTop, h / 2, sa * rTop); n.push(ca / nl, slope / nl, sa / nl);
      v.push(ca * rBot, -h / 2, sa * rBot); n.push(ca / nl, slope / nl, sa / nl);
    }
    for (let s = 0; s < seg; s++) {
      const a = s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this._push(v, n, color, idx, m);
    if (caps) {
      for (const [r, y, ny] of [[rTop, h / 2, 1], [rBot, -h / 2, -1]]) {
        if (r <= 0) continue;
        const cv = [0, y, 0], cn = [0, ny, 0], ci = [];
        for (let s = 0; s <= seg; s++) {
          const a = (s / seg) * Math.PI * 2;
          cv.push(Math.cos(a) * r, y, Math.sin(a) * r); cn.push(0, ny, 0);
        }
        for (let s = 1; s <= seg; s++) ci.push(0, s, s + 1);
        this._push(cv, cn, color, ci, m);
      }
    }
    return this;
  }

  sphere(r, sw, sh, color, m) {
    const v = [], n = [], idx = [];
    for (let j = 0; j <= sh; j++) {
      const th = (j / sh) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let i = 0; i <= sw; i++) {
        const ph = (i / sw) * Math.PI * 2;
        const nx = Math.cos(ph) * st, ny = ct, nz = Math.sin(ph) * st;
        v.push(nx * r, ny * r, nz * r); n.push(nx, ny, nz);
      }
    }
    for (let j = 0; j < sh; j++) {
      for (let i = 0; i < sw; i++) {
        const a = j * (sw + 1) + i, b = a + sw + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    this._push(v, n, color, idx, m);
    return this;
  }

  // ring whose axle is the x axis (wheel tyre)
  torus(R, r, sM, sm, color, m) {
    const v = [], n = [], idx = [];
    for (let i = 0; i <= sM; i++) {
      const th = (i / sM) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      for (let j = 0; j <= sm; j++) {
        const ph = (j / sm) * Math.PI * 2, cp = Math.cos(ph), sp = Math.sin(ph);
        v.push(r * sp, (R + r * cp) * ct, (R + r * cp) * st);
        n.push(sp, cp * ct, cp * st);
      }
    }
    for (let i = 0; i < sM; i++) {
      for (let j = 0; j < sm; j++) {
        const a = i * (sm + 1) + j, b = a + sm + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    this._push(v, n, color, idx, m);
    return this;
  }


  // flat-shaded triangle (counter-clockwise when seen from outside)
  tri(a, b, c, color, m) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    this._push([...a, ...b, ...c], [...n, ...n, ...n], color, [0, 1, 2], m);
    return this;
  }
  // double-sided triangle (for thin sails, banners)
  tri2(a, b, c, color, m) { this.tri(a, b, c, color, m); this.tri(a, c, b, color, m); return this; }

  // striped cone, apex up, base at y=0. colors alternate per segment
  cone(r, h, seg, colors, m, y0 = 0) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri([0, y0 + h, 0], [Math.cos(a1) * r, y0, Math.sin(a1) * r], [Math.cos(a0) * r, y0, Math.sin(a0) * r], colors[i % colors.length], m);
    }
    return this;
  }

  // sphere squashed/jittered into a boulder
  rock(r, seed, color, m) {
    const sw = 6, sh = 4, v = [], n = [], idx = [];
    const J = (i, j) => 0.78 + 0.44 * (Math.abs(Math.sin(seed * 91.7 + i * 12.9898 + j * 78.233) * 43758.5453) % 1);
    for (let j = 0; j <= sh; j++) {
      const th = (j / sh) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let i = 0; i <= sw; i++) {
        const ph = (i / sw) * Math.PI * 2, k = J(i % sw, j) * r;
        v.push(Math.cos(ph) * st * k, ct * k * 0.75, Math.sin(ph) * st * k);
        n.push(Math.cos(ph) * st, ct, Math.sin(ph) * st);
      }
    }
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) { const a = j * (sw + 1) + i, b = a + sw + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    this._push(v, n, color, idx, m);
    return this;
  }

  // append another Geo (already in final space) with an optional transform
  append(g, m) { this._push(g.p, g.n, [0, 0, 0], g.i, m); const base = this.c.length - g.c.length; for (let k = 0; k < g.c.length; k++) this.c[base + k] = g.c[k]; return this; }

  quad(w, d, color, m) { // horizontal quad facing +y
    this._push([-w / 2, 0, -d / 2, -w / 2, 0, d / 2, w / 2, 0, d / 2, w / 2, 0, -d / 2], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], color, [0, 1, 2, 0, 2, 3], m);
    return this;
  }
}
