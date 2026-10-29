// particles.js - pooled billboard particles: dust, water spray, snow spray and crash debris.
const KINDS = {
  dust: { color: [0.62, 0.5, 0.36], grav: 0.4, drag: 1.6, grow: 2.2 },
  water: { color: [0.82, 0.92, 1.0], grav: 9, drag: 0.4, grow: 0.8 },
  snow: { color: [0.96, 0.97, 1.0], grav: 1.5, drag: 1.4, grow: 1.6 },
  grass: { color: [0.25, 0.42, 0.15], grav: 7, drag: 0.5, grow: 0.3 },
};

class Pool {
  constructor(n, spec) {
    this.n = n; this.spec = spec; this.cursor = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.size = new Float32Array(n);
    this.out = new Float32Array(n * 5);
  }
  emit(x, y, z, vx, vy, vz, size, life) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
  }
  update(dt) {
    const s = this.spec, d = Math.exp(-s.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - s.grav * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
  }
  pack() {
    let c = 0; const s = this.spec;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const t = 1 - this.life[i] / this.max[i];
      const o = c * 5;
      this.out[o] = this.pos[i * 3]; this.out[o + 1] = this.pos[i * 3 + 1]; this.out[o + 2] = this.pos[i * 3 + 2];
      this.out[o + 3] = this.size[i] * (1 + t * s.grow);
      this.out[o + 4] = Math.min(1, (1 - t) * 1.6) * (s.alpha || 0.5);
      c++;
    }
    return c;
  }
}

export class Particles {
  constructor() {
    this.pools = {};
    for (const k in KINDS) this.pools[k] = new Pool(k === 'dust' ? 900 : 500, { ...KINDS[k], alpha: k === 'dust' ? 0.42 : 0.7 });
  }
  emit(kind, ...a) { this.pools[kind].emit(...a); }
  update(dt) { for (const k in this.pools) this.pools[k].update(dt); }
  draw(r) { for (const k in this.pools) { const p = this.pools[k], n = p.pack(); if (n) r.drawParticles(p.out, n, KINDS[k].color); } }

  // dust / spray behind a wheel contact point
  wheelSpray(c, vel, kind, power, rnd = Math.random) {
    const n = Math.min(4, Math.ceil(power));
    for (let i = 0; i < n; i++) {
      this.emit(kind, c[0] + (rnd() - 0.5) * 0.3, c[1] + 0.1, c[2] + (rnd() - 0.5) * 0.3,
        -vel[0] * 0.25 + (rnd() - 0.5) * 2.5, 0.8 + rnd() * 2.2 * Math.min(1.5, power * 0.5), -vel[2] * 0.25 + (rnd() - 0.5) * 2.5,
        kind === 'dust' ? 0.5 + rnd() * 0.6 : 0.18 + rnd() * 0.2, kind === 'dust' ? 0.8 + rnd() * 0.8 : 0.5 + rnd() * 0.5);
    }
  }
  burst(kind, p, n, speed, size, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, u = Math.random();
      this.emit(kind, p[0], p[1] + 0.2, p[2], Math.cos(a) * speed * u, speed * (0.4 + Math.random()), Math.sin(a) * speed * u, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6));
    }
  }
}
