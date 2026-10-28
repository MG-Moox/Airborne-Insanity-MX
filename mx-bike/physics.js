'use strict';
// Core physics for the MX bike game. No DOM access, so it can be tested in Node.
(function (root) {
  // World units are metres, y is up, angles are radians (counter-clockwise = nose up).
  const MASS = 200, INERTIA = 130, WHEEL_R = 0.35, SPRING = 8000, DAMPER = 1300;
  const MU = 1.25, ENGINE = 2600, VMAX = 30, LEAN_TORQUE = 950, G = 9.81;
  const WHEEL_X = 0.75, WHEEL_Y = -0.3;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  class Terrain {
    constructor(seed) {
      this.step = 3;
      this.hs = [];
      const rnd = mulberry32(seed || 1337);
      let h = 0;
      const push = (d) => { h += d - h * 0.08; h = clamp(h, -8, 14); this.hs.push(h); };
      for (let i = 0; i < 14; i++) this.hs.push(0); // flat start
      while (this.hs.length < 1600) {
        const diff = Math.min(1, this.hs.length / 300);
        const r = rnd();
        if (r < 0.18) {
          const n = 2 + Math.floor(rnd() * 3);
          for (let i = 0; i < n; i++) push(0);
        } else if (r < 0.45) {
          const n = 4 + Math.floor(rnd() * 4);
          for (let i = 0; i < n; i++) push((rnd() - 0.5) * (0.8 + diff * 0.8));
        } else if (r < 0.7) {
          const n = 4 + Math.floor(rnd() * 4) * 2;
          const a = 0.3 + diff * 0.2;
          for (let i = 0; i < n; i++) push(i % 2 === 0 ? a : -a);
        } else {
          const s = 0.7 + 0.6 * diff * (0.6 + rnd() * 0.4);
          [0.5, 0.7, 0.8, 0].forEach((d) => push(d * s));
          [-0.7, -0.7, -0.6, -0.3].forEach((d) => push(d * s));
          push(0); push(0);
        }
      }
    }
    height(x) {
      const u = Math.max(0, x) / this.step;
      let i = Math.floor(u);
      if (i >= this.hs.length - 1) return this.hs[this.hs.length - 1];
      const f = u - i;
      const s = (1 - Math.cos(Math.PI * f)) / 2;
      return this.hs[i] * (1 - s) + this.hs[i + 1] * s;
    }
    slope(x) {
      return (this.height(x + 0.02) - this.height(x - 0.02)) / 0.04;
    }
  }

  class Bike {
    constructor(terrain) {
      this.t = terrain;
      this.reset(0, 0);
    }
    reset(x, speed) {
      const sl = this.t.slope(x);
      this.a = Math.atan(sl);
      this.x = x;
      this.y = this.t.height(x) + 0.75 + 0.1;
      this.vx = speed * Math.cos(this.a);
      this.vy = speed * Math.sin(this.a);
      this.w = 0;
      this.crashed = false;
      this.grounded = [false, false];
      this.airTime = 0;
      this.airRot = 0;
      this.flipsEvent = 0;
      this.wheelSpin = [0, 0];
      this.wheelAngle = [0, 0];
    }
    local(lx, ly) {
      const c = Math.cos(this.a), s = Math.sin(this.a);
      return [this.x + lx * c - ly * s, this.y + lx * s + ly * c];
    }
    step(dt, inp) {
      const t = this.t;
      const c = Math.cos(this.a), s = Math.sin(this.a);
      let fx = 0, fy = -G * MASS, tq = 0;
      const wasAir = !(this.grounded[0] || this.grounded[1]);
      for (let wi = 0; wi < 2; wi++) {
        const lx = wi === 0 ? -WHEEL_X : WHEEL_X, ly = WHEEL_Y;
        const rx = lx * c - ly * s, ry = lx * s + ly * c;
        const px = this.x + rx, py = this.y + ry;
        const sl = t.slope(px), len = Math.hypot(1, sl);
        const nx = -sl / len, ny = 1 / len, tx = 1 / len, ty = sl / len;
        const pen = WHEEL_R - (py - t.height(px)) * ny;
        const vx = this.vx - this.w * ry, vy = this.vy + this.w * rx;
        const vt = vx * tx + vy * ty;
        if (pen > 0) {
          this.grounded[wi] = true;
          const vn = vx * nx + vy * ny;
          const Fn = Math.max(0, SPRING * Math.min(pen, 0.45) - DAMPER * vn);
          const maxF = MU * Fn;
          let Ft = -vt * 8;
          if (wi === 0) Ft += inp.throttle * ENGINE * Math.max(0, 1 - Math.max(0, vt) / VMAX);
          Ft -= inp.brake * clamp(vt * 600, -maxF, maxF);
          Ft = clamp(Ft, -maxF, maxF);
          const Fx = Fn * nx + Ft * tx, Fy = Fn * ny + Ft * ty;
          fx += Fx; fy += Fy;
          tq += rx * Fy - ry * Fx;
          this.wheelSpin[wi] = vt / WHEEL_R;
        } else {
          this.grounded[wi] = false;
          let sp = this.wheelSpin[wi];
          if (wi === 0) sp += inp.throttle * 40 * dt;
          sp -= (wi === 1 ? 0.4 : 0.8) * sp * dt + inp.brake * sp * 8 * dt;
          this.wheelSpin[wi] = sp;
        }
        this.wheelAngle[wi] += this.wheelSpin[wi] * dt;
      }
      tq += inp.lean * LEAN_TORQUE - this.w * 25;

      this.vx += (fx / MASS) * dt;
      this.vy += (fy / MASS) * dt;
      this.w += (tq / INERTIA) * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.a += this.w * dt;

      const air = !(this.grounded[0] || this.grounded[1]);
      this.flipsEvent = 0;
      if (air) {
        this.airTime += dt;
        this.airRot += this.w * dt;
      } else {
        if (wasAir && this.airTime > 0.3) {
          this.flipsEvent = Math.floor(Math.abs(this.airRot) / (2 * Math.PI) + 0.3);
        }
        if (!wasAir || !air) { this.airTime = 0; this.airRot = 0; }
      }

      // crash: head or tail touches the ground
      const pts = [[0.2, 1.1], [-0.9, 0.15]];
      for (const p of pts) {
        const q = this.local(p[0], p[1]);
        if (t.height(q[0]) > q[1] - 0.05) { this.crashed = true; break; }
      }
      if (!isFinite(this.x + this.y + this.a)) this.crashed = true;
    }
  }

  const api = { Terrain, Bike, WHEEL_R, WHEEL_X, WHEEL_Y, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MX = api;
})(typeof window !== 'undefined' ? window : globalThis);
