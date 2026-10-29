// mathgl.js - tiny column-major matrix helpers (Float64 for precision far from the origin).

export function m4identity() { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }

export function m4mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
export function m4translate(x, y, z) { const m = m4identity(); m[12] = x; m[13] = y; m[14] = z; return m; }
export function m4scale(x, y, z) { const m = m4identity(); m[0] = x; m[5] = y; m[10] = z; return m; }
export function m4rotX(a) { const m = m4identity(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
export function m4rotY(a) { const m = m4identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
export function m4rotZ(a) { const m = m4identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }

export function m4axisAngle(axis, a) {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const x = axis[0] / l, y = axis[1] / l, z = axis[2] / l;
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  const m = m4identity();
  m[0] = t * x * x + c;     m[4] = t * x * y - s * z; m[8] = t * x * z + s * y;
  m[1] = t * x * y + s * z; m[5] = t * y * y + c;     m[9] = t * y * z - s * x;
  m[2] = t * x * z - s * y; m[6] = t * y * z + s * x; m[10] = t * z * z + c;
  return m;
}

// rotation from quaternion [x,y,z,w] plus translation
export function m4fromQuat(q, p) {
  const [x, y, z, w] = q;
  const m = m4identity();
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w);     m[2] = 2 * (x * z - y * w);
  m[4] = 2 * (x * y - z * w);     m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + x * w);
  m[8] = 2 * (x * z + y * w);     m[9] = 2 * (y * z - x * w);     m[10] = 1 - 2 * (x * x + y * y);
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  return m;
}

export function m4perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), m = new Float64Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = (2 * far * near) / (near - far);
  return m;
}

export function m4lookAt(eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float64Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx;
  m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

export function m4point(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

// matrix that places a unit-height, y-axis cylinder between points a and b (scaled along y only)
export function limbMatrix(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]) || 1e-6;
  const y = [d[0] / L, d[1] / L, d[2] / L];
  let ref = Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  let x = [ref[1] * y[2] - ref[2] * y[1], ref[2] * y[0] - ref[0] * y[2], ref[0] * y[1] - ref[1] * y[0]];
  const xl = Math.hypot(...x); x = [x[0] / xl, x[1] / xl, x[2] / xl];
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const m = new Float64Array(16);
  m[0] = x[0]; m[1] = x[1]; m[2] = x[2];
  m[4] = y[0] * L; m[5] = y[1] * L; m[6] = y[2] * L;
  m[8] = z[0]; m[9] = z[1]; m[10] = z[2];
  m[12] = (a[0] + b[0]) / 2; m[13] = (a[1] + b[1]) / 2; m[14] = (a[2] + b[2]) / 2; m[15] = 1;
  return m;
}
