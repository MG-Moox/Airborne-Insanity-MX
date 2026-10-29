// camera.js - dynamic third-person chase, close chase, rider POV and free orbit cameras.
import { heightAt } from './terrain.js';

export const CAM_MODES = ['CHASE', 'CLOSE', 'POV', 'ORBIT'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Camera {
  constructor() {
    this.mode = 0;
    this.eye = [0, 5, 10]; this.target = [0, 0, 0]; this.up = [0, 1, 0]; this.fwd = [0, 0, -1];
    this.fov = 65; this.yaw = 0; this.yawOff = 0; this.pitchOff = 0; this.idle = 0;
    this.orbitYaw = 0.6; this.orbitPitch = 0.35; this.orbitDist = 7;
    this.shake = 0; this.kick = 0; this.initialised = false; this.vel = [0, 0, 0];
    this.crashSpin = 0; this.lastY = 0;
  }
  cycle() { this.mode = (this.mode + 1) % CAM_MODES.length; this.initialised = false; return CAM_MODES[this.mode]; }
  setMode(m) { this.mode = m; this.initialised = false; }
  get name() { return CAM_MODES[this.mode]; }
  get isPOV() { return this.mode === 2; }

  look(dx, dy) {
    if (this.mode === 3) { this.orbitYaw -= dx * 0.006; this.orbitPitch = clamp(this.orbitPitch + dy * 0.005, -0.2, 1.4); }
    else if (this.mode === 2) { this.yawOff = clamp(this.yawOff - dx * 0.004, -2.2, 2.2); this.pitchOff = clamp(this.pitchOff - dy * 0.004, -1, 1); this.idle = 0; }
    else { this.yawOff = clamp(this.yawOff - dx * 0.006, -Math.PI, Math.PI); this.pitchOff = clamp(this.pitchOff + dy * 0.005, -0.4, 1.0); this.idle = 0; }
  }
  zoom(d) { this.orbitDist = clamp(this.orbitDist * (1 + d * 0.0012), 3, 40); }
  impact(v) { this.kick = Math.min(1, this.kick + v); }

  update(dt, bike, pose) {
    const sp = Math.hypot(bike.v[0], bike.v[1], bike.v[2]);
    const hsp = Math.hypot(bike.v[0], bike.v[2]);
    const crashed = bike.state === 'crashed';
    this.idle += dt;
    if (this.idle > 1.2 && this.mode !== 3) { const k = 1 - Math.exp(-dt * 2.2); this.yawOff = lerp(this.yawOff, 0, k); this.pitchOff = lerp(this.pitchOff, 0, k); }
    this.kick *= Math.exp(-dt * 6);
    const air = bike.air.on;

    let eye, target, up = [0, 1, 0], fov;
    if (this.mode === 2) {
      // ---- rider POV: eye at the helmet, view stabilised a little against the bike's roll
      const stand = pose ? pose.standing : 0;
      const e = bike.toWorld([pose ? pose.lean * 0.05 : 0, lerp(1.07, 1.12, stand) - this.kick * 0.04, lerp(-0.18, -0.34, stand)]);
      const bf = bike.fwd, bu = bike.up;
      let f = norm([bf[0] * 0.8 + 0, bf[1] * 0.55 + 0.0, bf[2] * 0.8]);                  // flatten pitch a bit
      f = norm([lerp(f[0], bf[0], 0.6), lerp(bf[1] * 0.6, bf[1], 0.5), lerp(f[2], bf[2], 0.6)]);
      const cy = Math.cos(this.yawOff), sy = Math.sin(this.yawOff);
      const rx = norm([-f[2], 0, f[0]]);
      f = norm([f[0] * cy + rx[0] * sy * -1, f[1] + this.pitchOff * 0.8, f[2] * cy + rx[2] * sy * -1]);
      up = norm([lerp(0, bu[0], 0.5), 1, lerp(0, bu[2], 0.5)]);
      eye = e;
      const shake = (this.kick * 0.03 + Math.min(sp, 40) * 0.0004 * (bike.grounded ? 1 : 0.2));
      eye = [e[0] + (Math.random() - 0.5) * shake, e[1] + (Math.random() - 0.5) * shake, e[2] + (Math.random() - 0.5) * shake];
      target = [eye[0] + f[0] * 10, eye[1] + f[1] * 10, eye[2] + f[2] * 10];
      fov = 78 + Math.min(sp * 0.55, 22);
    } else if (this.mode === 3) {
      // ---- free orbit
      const cp = Math.cos(this.orbitPitch), d = this.orbitDist;
      target = [bike.pos[0], bike.pos[1] + 0.7, bike.pos[2]];
      eye = [target[0] + Math.sin(this.orbitYaw) * cp * d, target[1] + Math.sin(this.orbitPitch) * d, target[2] + Math.cos(this.orbitYaw) * cp * d];
      fov = 62;
    } else {
      // ---- dynamic third person
      const close = this.mode === 1;
      let vy = bike.yaw;
      if (hsp > 3.5) {
        const velYaw = Math.atan2(-bike.v[0], -bike.v[2]);
        vy = bike.yaw + angDiff(bike.yaw, velYaw) * (air ? 0.85 : 0.45);           // blend heading with direction of travel
      }
      if (!this.initialised) { this.yaw = vy; }
      const rate = (crashed ? 0.5 : 2.4 + Math.min(hsp, 40) * 0.09);
      this.yaw += angDiff(this.yaw, vy) * (1 - Math.exp(-rate * dt));
      if (crashed) { this.crashSpin += dt * 0.35; } else this.crashSpin *= Math.exp(-dt * 2);
      const ya = this.yaw + this.yawOff + this.crashSpin;
      const dir = [-Math.sin(ya), 0, -Math.cos(ya)];
      let dist = (close ? 3.1 + sp * 0.03 : 5.0 + sp * 0.075) * (air ? 1.12 : 1) * (crashed ? 1.45 : 1);
      let h = (close ? 1.3 : 2.05 + sp * 0.01) + this.pitchOff * 3.5 + (air ? 0.5 : 0);
      const look = Math.min(4.5, hsp * 0.12);
      target = [bike.pos[0] + bike.v[0] * 0.08 + dir[0] * look, bike.pos[1] + 0.65 + (air ? -0.2 : 0), bike.pos[2] + bike.v[2] * 0.08 + dir[2] * look];
      const want = [bike.pos[0] - dir[0] * dist, bike.pos[1] + h, bike.pos[2] - dir[2] * dist];
      if (!this.initialised) { this.eye = want.slice(); this.initialised = true; }
      const kh = 1 - Math.exp(-dt * (close ? 14 : 9)), kv = 1 - Math.exp(-dt * (air ? 3.5 : 7));
      eye = [lerp(this.eye[0], want[0], kh), lerp(this.eye[1], want[1], kv), lerp(this.eye[2], want[2], kh)];
      // keep a fixed follow distance even if the spring lags at high speed
      const ex = eye[0] - bike.pos[0], ez = eye[2] - bike.pos[2], el = Math.hypot(ex, ez), maxD = dist * 1.25;
      if (el > maxD) { eye[0] = bike.pos[0] + (ex / el) * maxD; eye[2] = bike.pos[2] + (ez / el) * maxD; }
      const gy = heightAt(eye[0], eye[2]) + 0.8;
      if (eye[1] < gy) eye[1] = gy;
      const sh = this.kick * 0.18 + Math.min(sp, 45) * 0.0012;
      eye[0] += (Math.random() - 0.5) * sh; eye[1] += (Math.random() - 0.5) * sh;
      up = [bike.up[0] * 0.08, 1, bike.up[2] * 0.08];
      fov = (close ? 70 : 62) + Math.min(sp * 0.6, 24) + this.kick * 6;
    }
    this.fov += (fov - this.fov) * (1 - Math.exp(-dt * 6));
    this.eye = eye; this.target = target; this.up = norm(up);
    const f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]; this.fwd = norm(f);
    if (this.mode !== 2 && this.mode !== 3) this.initialised = true;
    return this;
  }
  get cam() { return { eye: this.eye, target: this.target, up: this.up, fov: this.fov, fwd: this.fwd }; }
}
