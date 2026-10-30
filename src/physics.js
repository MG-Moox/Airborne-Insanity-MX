// physics.js - 6-DOF dirt bike: rigid body + raycast spring/damper suspension + tyre friction model.
// Local body axes: +x right, +y up, +z back (forward = -z). Angles in radians.
import { heightAt, normalAt, nearbyColliders, waterLevelAt, gripAt, borderSD } from './terrain.js';

const G = 9.81;
export const P = {
  M: 200,                    // bike + rider mass (kg)
  I: [65, 45, 30],           // inertia about local x (pitch), y (yaw), z (roll)
  R: 0.34,                   // wheel radius
  LMAX: 0.45, LMIN: 0.15,    // suspension length range (travel 0.30 m)
  K: 7000, CC: 1000, CR: 1600,
  MU: 1.0,
  FE_MAX: 2900, POWER: 26000, VTOP: 46,
  BMAXF: 3600, BMAXR: 2000,
  CRR: 0.03,
  MEFF: 50,
  LATMIN: 0.34,              // a locked / spinning tyre still keeps this share of its grip sideways (stops violent spin-outs)
  CS: 0.09, CS0: 0.12,       // tyre cornering softness: lateral force saturates at a slip angle of ~CS rad (lower = stiffer)
};
const WHEELBASE = 1.42;
const MOUNTS = [{ y: 0.05, z: -0.70 }, { y: 0.05, z: 0.72 }];   // 0 = front, 1 = rear
// extra body points that collide with the ground (bash plate, pegs, bar ends, tail, head)
const BODY_POINTS = [
  { p: [0, -0.28, 0.05], k: 26000 },
  { p: [0.27, -0.14, 0.05], k: 20000 },
  { p: [-0.27, -0.14, 0.05], k: 20000 },
  { p: [0.44, 0.88, -0.48], k: 14000 },
  { p: [-0.44, 0.88, -0.48], k: 14000 },
  { p: [0, 0.6, 0.95], k: 14000 },
  { p: [0, 1.2, -0.28], k: 12000, head: true },
];

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function qrot(q, v) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
function qAxisAngle(axis, a) { const s = Math.sin(a / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(a / 2)]; }

// distance along dir (unit) from origin to terrain, or -1 if none within maxLen
function raycast(o, d, maxLen) {
  const f = (t) => o[1] + d[1] * t - heightAt(o[0] + d[0] * t, o[2] + d[2] * t);
  let tp = 0, fp = f(0);
  if (fp <= 0) return 0;
  const STEP = 0.08;
  for (let t = STEP; ; t += STEP) {
    if (t > maxLen) t = maxLen;
    const ft = f(t);
    if (ft <= 0) {
      let lo = tp, hi = t;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (f(mid) > 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    tp = t; fp = ft;
    if (t >= maxLen) return -1;
  }
}

export class Bike {
  constructor() {
    this.stats = { distance: 0, best: 0, flips: 0, bestAir: 0, bestJump: 0 };
    this.events = [];
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    const gy = heightAt(x, z);
    this.q = qAxisAngle([0, 1, 0], yaw);
    this.pos = [x, gy + 0.75, z];
    this.v = [0, 0, 0];
    this.w = [0, 0, 0];
    this.steer = 0;
    this.state = 'ok';
    this.crashT = 0;
    this.headHit = 0;
    this.flipT = 0;
    this.wheels = [
      { L: P.LMAX, grounded: false, spin: 0, omega: 0, load: 0, contact: null, slip: 0 },
      { L: P.LMAX, grounded: false, spin: 0, omega: 0, load: 0, contact: null, slip: 0 },
    ];
    this.air = { on: false, t: 0, pitch: 0, from: [x, gy, z] };
    this.lastSafe = { x, z, yaw };
    this.safeT = 0;
    this.landImpact = 0;
    this.deepT = 0; this.inWater = false; this.wet = 0; this.oob = false; this.oobT = 0;
    this.speed = 0;
    this.slide = 0;
    this._axes();
  }

  _axes() {
    this.up = qrot(this.q, [0, 1, 0]);
    this.fwd = qrot(this.q, [0, 0, -1]);
    this.right = qrot(this.q, [1, 0, 0]);
  }
  toWorld(l) { return add(this.pos, qrot(this.q, l)); }
  get yaw() { return Math.atan2(-this.fwd[0], -this.fwd[2]); }
  get grounded() { return this.wheels[0].grounded || this.wheels[1].grounded; }
  get pitch() { return Math.asin(clamp(this.fwd[1], -1, 1)); }

  teleport(x, z, yaw) {
    const st = this.stats;
    this.reset(x, z, yaw);
    this.stats = st;
  }

  respawn() {
    const s = this.lastSafe;
    const st = this.stats;
    this.reset(s.x, s.z, s.yaw);
    this.stats = st;
  }

  step(dt, inp) {
    const q = this.q;
    this._axes();
    const { up, fwd, right } = this;
    const crashed = this.state === 'crashed';
    if (crashed) inp = { throttle: 0, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0, yaw: 0 };

    const vF = dot(this.v, fwd);
    this.speed = vF;

    // steering angle (front wheel). Lock is limited to what the front tyre can actually grip at this speed
    // (lateral accel = v^2 tan(steer) / wheelbase), so a full-lock input is "as hard as the dirt allows" rather than a spin-out.
    const vAbs = Math.max(Math.abs(vF), 0.5);
    const aLim = clamp(P.MU * (this.wheels[0].grip || 0.9) * G * 0.8, 3.5, 8.5);
    const maxSteer = Math.min(0.62, Math.atan(WHEELBASE * aLim / (vAbs * vAbs)));
    const tgt = inp.steer * maxSteer;
    const rate = ((Math.abs(tgt) > Math.abs(this.steer) ? 2.6 : 4.5) / (1 + vAbs / 11)) * dt;   // bars move slower at speed
    this.steer += clamp(tgt - this.steer, -rate, rate);

    let F = [0, -P.M * G, 0];
    const sp = len(this.v);
    F = sub(F, mul(this.v, 0.33 * sp));                    // aero drag
    let T = [0, 0, 0];

    for (let wi = 0; wi < 2; wi++) {
      const mt = MOUNTS[wi], front = wi === 0, W = this.wheels[wi];
      const m = add(this.pos, qrot(q, [0, mt.y, mt.z]));
      const dir = [-up[0], -up[1], -up[2]];
      const t = raycast(m, dir, P.LMAX + P.R);
      if (t < 0) {
        W.grounded = false; W.contact = null; W.load = 0;
        W.L += (P.LMAX - W.L) * Math.min(1, dt * 10);
        W.omega *= 1 - Math.min(1, dt * (front ? 0.3 : 0.6));
        if (!front) W.omega += inp.throttle * 40 * dt;
        if (inp.brakeR > 0 && !front) W.omega *= 1 - Math.min(1, dt * 8);
        if (inp.brakeF > 0 && front) W.omega *= 1 - Math.min(1, dt * 8);
        W.spin += W.omega * dt;
        continue;
      }
      W.grounded = true;
      const L = t - P.R;
      W.L = Math.max(L, P.LMIN - 0.04);
      const c = P.LMAX - L;
      const C = add(m, mul(dir, t));
      W.contact = C;
      const n = normalAt(C[0], C[2]);
      const r = sub(C, this.pos);
      const vc = add(this.v, cross(this.w, r));
      const comp = -dot(vc, up);
      let Fs = P.K * c + (comp > 0 ? P.CC : P.CR) * comp;
      if (L < P.LMIN) Fs += 45000 * (P.LMIN - L);
      Fs = Math.max(0, Fs);
      W.load = Fs;

      // wheel heading projected on the ground plane
      const fw = front ? add(mul(fwd, Math.cos(this.steer)), mul(right, Math.sin(this.steer))) : fwd;
      const f = norm(sub(fw, mul(n, dot(fw, n))));
      const rt = cross(f, n);
      const vl = dot(vc, f), vs = dot(vc, rt);
      const grip = gripAt(C[0], C[2], C[1]);
      W.grip = grip;
      const Fmax = P.MU * grip * Math.max(Fs, front ? 0 : 500);   // rider weight keeps a little rear grip even when braking unloads it

      let Fx = 0, locked = false, spinning = false;
      if (!front) {
        const vpos = Math.max(0, vl);
        const fe = Math.min(P.FE_MAX, P.POWER / Math.max(vpos, 1.0)) * Math.max(0, 1 - Math.pow(vpos / P.VTOP, 6));
        Fx += inp.throttle * fe;
        if (inp.throttle * fe > Fmax * 0.98) spinning = true;
        if (inp.brakeF > 0.3 && inp.throttle === 0 && vF < 0.6 && vl > -2.5) Fx -= 450;   // reverse
      }
      Fx -= P.CRR * Fs * Math.tanh(vl * 3);
      let brake = (front ? inp.brakeF * P.BMAXF : inp.brakeR * P.BMAXR) * (P.BRAKE_K || 1);
      if (brake <= 0 && inp.throttle < 0.05 && Math.abs(vl) < 0.6 && !crashed) brake = 0.6 * Fmax; // parking hold
      if (brake > 0) {
        // ordinary brake presses are ABS-like (they can't lock the wheel); only a deliberate full press (Space / B) can lock and skid
        const cmd = front ? inp.brakeF : inp.brakeR;
        if (cmd < 0.95) brake = Math.min(brake, 0.88 * Fmax);
        const fb = Math.min(brake, Fmax, P.MEFF * Math.abs(vl) / dt);
        Fx -= Math.sign(vl) * fb;
        if (brake >= Fmax * 0.98 && Math.abs(vl) > 2) locked = true;
      }
      Fx = clamp(Fx, -Fmax, Fmax);
      const FyLim = Math.max(Math.sqrt(Math.max(0, Fmax * Fmax - Fx * Fx)), P.LATMIN * Fmax);
      let Fy = -FyLim * Math.tanh(vs / (P.CS * Math.abs(vl) + P.CS0));
      const FyStab = P.MEFF * Math.abs(vs) / dt;
      if (Math.abs(Fy) > FyStab) Fy = Math.sign(Fy) * FyStab;
      W.slip = Math.abs(vs);

      const Fc = add(add(mul(f, Fx), mul(rt, Fy)), mul(up, Fs));
      F = add(F, Fc);
      T = add(T, cross(r, Fc));

      W.omega = locked ? 0 : (vl / P.R + (spinning ? 25 * inp.throttle : 0));
      W.spin += W.omega * dt;
    }

    // water: drag while wading, sinking in deep water
    this.wet = 0;
    const wLev = waterLevelAt(this.pos[0], this.pos[2]);
    if (wLev > -1e8) {
      const sub = clamp((wLev - (this.pos[1] - 0.45)) / 0.9, 0, 2);
      this.wet = sub;
      if (sub > 0) {
        F = sub3(F, mul(this.v, 260 * sub));
        T = sub3(T, mul(this.w, 40 * sub));
      }
      if (sub > 1.15 && this.state === 'ok') { this.deepT += dt; if (this.deepT > 0.6) this._crash('Splash! Too deep'); } else this.deepT = Math.max(0, this.deepT - dt);
      if (sub > 0.2 && !this.inWater && len(this.v) > 4) this.events.push({ type: 'splash', speed: len(this.v) });
      this.inWater = sub > 0.2;
    } else { this.inWater = false; this.deepT = 0; }

    // body collision points (bash plate, pegs, bars, tail, head)
    let headTouch = 0;
    for (const bp of BODY_POINTS) {
      const r = qrot(q, bp.p);
      const p = add(this.pos, r);
      const h = heightAt(p[0], p[2]);
      const pen = h - p[1];
      if (pen <= 0) continue;
      if (bp.head) headTouch = pen;
      const n = normalAt(p[0], p[2]);
      const vp = add(this.v, cross(this.w, r));
      const vn = dot(vp, n);
      const Fn = Math.max(0, bp.k * Math.min(pen, 0.5) - 500 * vn);
      const vt = sub(vp, mul(n, vn));
      const vtl = len(vt);
      let Ft = [0, 0, 0];
      if (vtl > 1e-4) Ft = mul(vt, -Math.min(0.6 * Fn, P.MEFF * vtl / dt) / vtl);
      const Fc = add(mul(n, Fn), Ft);
      F = add(F, Fc);
      T = add(T, cross(r, Fc));
    }

    // rider: weight shift, balance and air control
    const grounded = this.grounded;
    const pitch = this.pitch;
    const wRight = dot(this.w, right);
    let pitchT = inp.pitch * 900;
    if (grounded && !crashed) {
      // soft rider limits so a wheelie / stoppie doesn't flip the bike over backwards
      if (pitch > 0.6 && inp.pitch <= 0) pitchT -= (pitch - 0.6) * 2600;
      if (pitch < -0.5 && inp.pitch >= 0) pitchT += (-0.5 - pitch) * 2600;
    }
    T = add(T, mul(right, pitchT - (grounded ? 120 : 35) * wRight));
    if (grounded && !crashed) T = add(T, mul(up, -110 * dot(this.w, up)));       // gyro / tyre scrub: a spinning bike settles instead of whirling

    if (!crashed) {
      if (grounded) {
        const wup = [0, 1, 0];
        const upProj = norm(sub(wup, mul(fwd, dot(fwd, wup))));
        const roll = Math.atan2(-dot(upProj, right), dot(upProj, up));
        // lean target is feed-forward from the commanded turn (v^2 tan(steer) / wheelbase), not from the measured yaw rate:
        // using the measured yaw made lean -> yaw -> more lean a runaway that flung the bike around.
        const ayCmd = (vF * vF * Math.tan(this.steer)) / WHEELBASE;
        const rawT = clamp(Math.atan(ayCmd / G) * 0.85 + inp.roll * 0.2, -0.7, 0.7);
        this.tgtRoll = (this.tgtRoll || 0) + (rawT - (this.tgtRoll || 0)) * Math.min(1, dt * 7);   // riders lean in smoothly
        const wRoll = dot(this.w, fwd);
        const tq = clamp(2700 * (this.tgtRoll - roll) - 430 * wRoll, -2200, 2200);
        T = add(T, mul(fwd, tq));
        this.roll = roll;
      } else {
        // in the air the rider squares the bike up for landing unless you are deliberately leaning / whipping
        const wup = [0, 1, 0], upProj = norm(sub(wup, mul(fwd, dot(fwd, wup))));
        const rollA = Math.atan2(-dot(upProj, right), dot(upProj, up));
        const level = Math.abs(inp.roll) < 0.15 && this.air.on ? clamp(-1500 * rollA, -1100, 1100) : 0;
        T = add(T, mul(fwd, inp.roll * 700 - 70 * dot(this.w, fwd) + level));
        T = add(T, mul(up, inp.yaw * 350 - 25 * dot(this.w, up)));
      }
    }

    // integrate (semi-implicit Euler)
    this.v = add(this.v, mul(F, dt / P.M));
    const ql = qconj(q);
    const wl = qrot(ql, this.w), tl = qrot(ql, T);
    const I = P.I;
    const Iw = [I[0] * wl[0], I[1] * wl[1], I[2] * wl[2]];
    const gy = cross(wl, Iw);
    wl[0] += ((tl[0] - gy[0]) / I[0]) * dt;
    wl[1] += ((tl[1] - gy[1]) / I[1]) * dt;
    wl[2] += ((tl[2] - gy[2]) / I[2]) * dt;
    this.w = qrot(q, wl);
    this.pos = add(this.pos, mul(this.v, dt));
    const dq = qmul([this.w[0], this.w[1], this.w[2], 0], q);
    this.q = qnorm([q[0] + 0.5 * dt * dq[0], q[1] + 0.5 * dt * dq[1], q[2] + 0.5 * dt * dq[2], q[3] + 0.5 * dt * dq[3]]);

    this._trees();
    this._post(dt, headTouch);
  }

  _trees() {
    const trees = nearbyColliders(this.pos[0], this.pos[2], 3);
    for (const t of trees) {
      const dx = this.pos[0] - t.x, dz = this.pos[2] - t.z;
      const d = Math.hypot(dx, dz) || 1e-3;
      const lim = t.r + 0.5;
      if (d < lim && this.pos[1] < t.y + t.h) {
        const nx = dx / d, nz = dz / d;
        const vn = this.v[0] * nx + this.v[2] * nz;
        if (vn < 0) {
          this.v[0] -= nx * vn * 1.15; this.v[2] -= nz * vn * 1.15;
          this.w[1] += (Math.random() - 0.5) * 2;
          if (-vn > 6 && this.state === 'ok') this._crash(t.kind === undefined ? 'Smashed into a building!' : 'Hit a tree!');
        }
        this.pos[0] += nx * (lim - d); this.pos[2] += nz * (lim - d);
      }
    }
  }

  _crash(msg) {
    if (this.state === 'crashed') return;
    this.state = 'crashed'; this.crashT = 0;
    this.events.push({ type: 'crash', msg });
  }

  _post(dt, headTouch) {
    this._axes();
    const grounded = this.grounded;
    // air / landing tracking
    if (!grounded) {
      if (!this.air.on) {
        this.air.t += dt;
        if (this.air.t > 0.15) { this.air.on = true; this.air.pitch = 0; this.air.from = [this.pos[0], this.pos[1], this.pos[2]]; this.air.t0 = this.air.t; }
      } else {
        this.air.t += dt;
        this.air.pitch += dot(this.w, this.right) * dt;
      }
    } else {
      if (this.air.on) {
        const dist = Math.hypot(this.pos[0] - this.air.from[0], this.pos[2] - this.air.from[2]);
        const flips = Math.floor(Math.abs(this.air.pitch) / (2 * Math.PI) + 0.3);
        this.landImpact = Math.max(0, -this.v[1]);
        if (this.air.t > 0.7) {
          this.events.push({ type: 'jump', time: this.air.t, dist, flips, back: this.air.pitch > 0 });
          const s = this.stats;
          s.flips += flips; s.bestAir = Math.max(s.bestAir, this.air.t); s.bestJump = Math.max(s.bestJump, dist);
        }
      }
      this.air.on = false; this.air.t = 0;
    }

    // invisible wall at the map border
    const sd = borderSD(this.pos[0], this.pos[2]);
    if (sd < 0) {
      this.oob = true; this.oobT += dt;
      if (sd < -3) {
        const gx = borderSD(this.pos[0] + 6, this.pos[2]) - borderSD(this.pos[0] - 6, this.pos[2]);
        const gz = borderSD(this.pos[0], this.pos[2] + 6) - borderSD(this.pos[0], this.pos[2] - 6);
        const gl = Math.hypot(gx, gz) || 1, nx = gx / gl, nz = gz / gl;
        const vin = this.v[0] * nx + this.v[2] * nz;
        if (vin < 0) { this.v[0] -= nx * vin * 1.6; this.v[2] -= nz * vin * 1.6; }
        this.pos[0] += nx * 0.3; this.pos[2] += nz * 0.3;
      }
      if (this.oobT > 6 || sd < -40) { this.respawn(); this.events.push({ type: 'respawn' }); }
    } else { this.oob = false; this.oobT = 0; }

    if (this.state === 'ok') {
      this.headHit = headTouch > 0.02 ? this.headHit + dt : 0;
      if (this.headHit > 0.05) this._crash('Wiped out!');
      this.flipT = (this.up[1] < 0.15 && grounded) ? this.flipT + dt : 0;
      if (this.flipT > 0.5) this._crash('Wiped out!');
      if (!isFinite(this.pos[0] + this.pos[1] + this.pos[2])) this._crash('Lost it');
      // remember a safe spot to respawn to
      this.safeT += dt;
      if (this.safeT > 0.5 && this.wheels[0].grounded && this.wheels[1].grounded && this.up[1] > 0.85 && !this.inWater && sd > 12) {
        this.safeT = 0;
        this.lastSafe = { x: this.pos[0], z: this.pos[2], yaw: this.yaw };
      }
      const st = this.stats;
      st.distance += Math.hypot(this.v[0], this.v[2]) * dt;
      st.topSpeed = Math.max(st.topSpeed || 0, len(this.v));
    } else {
      this.crashT += dt;
      if (this.crashT > 2.2) { this.respawn(); this.events.push({ type: 'respawn' }); }
    }
    if (this.pos[1] < heightAt(this.pos[0], this.pos[2]) - 3 && !this.inWater) this.respawn();
  }
}
