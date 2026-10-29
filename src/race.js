// race.js - lap timing, sector checkpoints and AI riders for the MX track. Pure logic (no DOM / GL).
import { Bike } from './physics.js';
import { TRACK_PATH as P, JUMP_LIST, nearbyColliders } from './terrain.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const TRACK_LENGTH = P.length;
const SECTORS = 6;

// position/heading of the racing line at arc length s (wraps)
export function lineAt(s, out = {}) {
  const L = P.length; s = ((s % L) + L) % L;
  let lo = 0, hi = P.n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P.s[mid] <= s) lo = mid; else hi = mid; }
  const i0 = lo, i1 = (lo + 1) % P.n;
  const seg = (i1 === 0 ? L : P.s[i1]) - P.s[i0] || 1, t = clamp((s - P.s[i0]) / seg, 0, 1);
  out.x = P.x[i0] + (P.x[i1] - P.x[i0]) * t; out.z = P.z[i0] + (P.z[i1] - P.z[i0]) * t;
  out.curv = P.curv[i0] + (P.curv[i1] - P.curv[i0]) * t;
  const dx = P.x[i1] - P.x[i0], dz = P.z[i1] - P.z[i0], l = Math.hypot(dx, dz) || 1;
  out.dx = dx / l; out.dz = dz / l; out.yaw = Math.atan2(-dx, -dz);
  return out;
}

export function trackProgress(x, z) {
  const q = P.query(x, z, 60);
  return q.d < 60 ? { s: q.s, d: q.d } : null;
}

// progress along the loop, searching only near a previous arc length so two parts of the track that pass
// close together can never be confused with each other
export function progressNear(x, z, sPrev, win = 14) {
  const L = P.length;
  let lo = 0, hi = P.n - 1;
  const sp = ((sPrev % L) + L) % L;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P.s[mid] <= sp) lo = mid; else hi = mid; }
  let best = null;
  for (let k = -win; k <= win; k++) {
    const i0 = (((lo + k) % P.n) + P.n) % P.n, i1 = (i0 + 1) % P.n;
    const sx = P.x[i1] - P.x[i0], sz = P.z[i1] - P.z[i0], l2 = sx * sx + sz * sz || 1e-9;
    const t = clamp(((x - P.x[i0]) * sx + (z - P.z[i0]) * sz) / l2, 0, 1);
    const d = Math.hypot(P.x[i0] + sx * t - x, P.z[i0] + sz * t - z);
    if (!best || d < best.d) best = { d, s: P.s[i0] + Math.sqrt(l2) * t };
  }
  return best;
}

export class LapTimer {
  constructor() { this.reset(); }
  reset() { this.lap = 0; this.lapStart = null; this.times = []; this.best = null; this.cp = 1; this.prevS = null; this.offT = 0; this.valid = true; this.lastLap = null; this.cur = 0; this.events = []; this.sector = 0; }
  update(bike, now, dt) {
    let pr = this.prevS !== null ? progressNear(bike.pos[0], bike.pos[2], this.prevS, 14) : null;
    if (!pr || pr.d > 28) pr = trackProgress(bike.pos[0], bike.pos[2]);
    if (!pr || pr.d > 28) { this.offT += dt; if (this.offT > 4 && this.lapStart !== null && this.valid) { this.valid = false; this.events.push({ type: 'invalid' }); } this.prevS = null; if (this.lapStart !== null) this.cur = now - this.lapStart; return; }
    this.offT = 0;
    const L = TRACK_LENGTH, s = pr.s;
    if (this.prevS !== null) {
      const d = s - this.prevS;
      if (Math.abs(d) < L / 2) {
        const thr = this.cp * (L / SECTORS);
        if (this.cp < SECTORS && this.prevS < thr && s >= thr && d > 0 && d < 30) { this.events.push({ type: 'sector', n: this.cp, time: this.lapStart !== null ? now - this.lapStart : null }); this.cp++; this.sector = this.cp - 1; }
      } else if (d < -L / 2) {                               // crossed the line forwards
        if (this.lapStart !== null && this.cp >= SECTORS && this.valid) {
          const t = now - this.lapStart; this.times.push(t); this.lastLap = t; this.lap++;
          const pb = this.best === null || t < this.best; if (pb) this.best = t;
          this.events.push({ type: 'lap', time: t, best: pb, n: this.lap });
        } else if (this.lapStart !== null && !this.valid) this.events.push({ type: 'invalidLap' });
        this.lapStart = now; this.cp = 1; this.valid = true;
      } else if (d > L / 2) { /* backwards over the line: ignore */ }
    }
    this.prevS = s;
    this.cur = this.lapStart !== null ? now - this.lapStart : 0;
  }
}

// ---------------------------------------------------------------- AI rider
export class AIRider {
  constructor(skill, lane, name) {
    this.bike = new Bike(); this.skill = skill; this.lane = lane; this.name = name;
    this.s = 0; this.laps = 0; this.prevS = 0; this.finished = false; this.time = 0; this.progress = 0; this.stuckT = 0; this.crashes = 0; this._ln = {}; this._ln2 = {};
    this.wasCrashed = false;
  }
  place(s, lane) {
    const ln = lineAt(s, {});
    const x = ln.x - ln.dz * lane * -1, z = ln.z + ln.dx * lane * -1;
    this.lane = lane; this.bike.reset(x - ln.dz * 0, z, ln.yaw); this.bike.reset(ln.x + ln.dz * lane, ln.z - ln.dx * lane, ln.yaw);
    this.s = s; this.prevS = s; this.laps = 0; this.finished = false; this.progress = s; this.time = 0; this.crashes = 0;
  }
  control(dt, rubber) {
    const b = this.bike, inp = { throttle: 0, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0, yaw: 0 };
    if (b.state === 'crashed') { this.wasCrashed = true; return inp; }
    if (this.wasCrashed) { this.wasCrashed = false; this.crashes++; }
    let pr = progressNear(b.pos[0], b.pos[2], this.s, 16);
    if (pr.d > 45) pr = trackProgress(b.pos[0], b.pos[2]) || pr;
    const sp = Math.hypot(b.v[0], b.v[2]);
    const s = pr.s;
    // continuous progress (handles wrap)
    let d = s - this.prevS; const L = TRACK_LENGTH;
    if (d < -L / 2) { d += L; this.laps++; } else if (d > L / 2) d -= L;
    this.prevS = s; this.s = s; this.progress += d;
    // aim at a lookahead point on the racing line, offset to our lane
    const look = 7 + sp * 0.55;
    const tgt = lineAt(s + look, this._ln);
    const tx = tgt.x + tgt.dz * this.lane, tz = tgt.z - tgt.dx * this.lane;
    const want = Math.atan2(-(tx - b.pos[0]), -(tz - b.pos[2]));
    const err = Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw));
    inp.steer = clamp(-err * 2.2, -1, 1);
    // target speed from the tightest curve ahead and from jumps
    let k = 0;
    for (let a = 4; a <= 42; a += 6) { const c = Math.abs(lineAt(s + a, this._ln2).curv); if (c > k) k = c; }
    const vCorner = k > 1e-4 ? Math.sqrt(6.2 / (k * 0.9)) : 60;
    let vmax = Math.min(33, vCorner) * this.skill * rubber;
    let nearJump = false;
    for (const j of JUMP_LIST) {
      const dx = b.pos[0] - j.cx, dz = b.pos[2] - j.cz, u = dx * j.dx + dz * j.dz;
      if (dx * dx + dz * dz < 60 * 60 && u > -45 && u < 14 + j.T + 25) { nearJump = true; vmax = Math.min(vmax, 15.5 * this.skill); break; }
    }
    if (nearJump) inp.steer = clamp(inp.steer, -0.3, 0.3);
    vmax = Math.max(vmax, 7);
    const over = sp - vmax;
    inp.throttle = clamp((vmax - sp) * 0.6, 0, 1);
    if (over > 1.5) { inp.brakeF = clamp(over * 0.08, 0, 0.5); inp.brakeR = clamp(over * 0.1, 0, 0.7); }
    if (!b.grounded) {                                                                           // level out in the air
      inp.throttle = 0.1; inp.steer = 0;
      inp.pitch = clamp(-b.pitch * 1.2 - 0.25 * (b.w[0] * b.right[0] + b.w[1] * b.right[1] + b.w[2] * b.right[2]), -1, 1);
      const f = b.fwd, up = b.up, r = b.right, d = f[1];                                      // roll angle relative to the horizon
      let ux = -f[0] * d, uy = 1 - f[1] * d, uz = -f[2] * d; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const roll = Math.atan2(-(ux * r[0] + uy * r[1] + uz * r[2]), ux * up[0] + uy * up[1] + uz * up[2]);
      inp.roll = clamp(-(roll * 2.2 + 0.5 * (b.w[0] * f[0] + b.w[1] * f[1] + b.w[2] * f[2])), -1, 1);
    }
    // stuck detection (tree / berm): back off and respawn
    if (sp < 1.2 && b.state === 'ok') { this.stuckT += dt; if (this.stuckT > 4) { b.respawn(); this.stuckT = 0; } } else this.stuckT = 0;
    return inp;
  }
}

export const AI_NAMES = ['R. Mackenzie', 'T. Okafor', 'J. Lindqvist', 'S. Vargas', 'M. Tanaka'];

export class Race {
  constructor(player) { this.player = player; this.ais = []; this.state = 'idle'; this.laps = 3; this.t = 0; this.count = 0; this.standing = []; this.results = []; this.playerLaps = 0; this.playerProgress = 0; this.playerPrevS = 0; this.events = []; }
  start(laps = 3, n = 5) {
    this.laps = laps; this.state = 'countdown'; this.count = 4.0; this.t = 0; this.results = []; this.finishedOrder = []; this.events = [];
    const skills = [1.0, 0.96, 0.92, 0.88, 0.84, 0.8].slice(0, n);
    this.ais = skills.map((sk, i) => new AIRider(sk, 0, AI_NAMES[i % AI_NAMES.length]));
    const total = n + 1, L = TRACK_LENGTH, playerSlot = Math.min(total - 1, 2);
    let a = 0;
    for (let slot = 0; slot < total; slot++) {
      const row = Math.floor(slot / 2), col = slot % 2;
      const s = L - 5 - row * 7, lane = col ? 3.2 : -3.2;
      if (slot === playerSlot) { const ln = lineAt(s, {}); this.player.teleport(ln.x + ln.dz * lane, ln.z - ln.dx * lane, ln.yaw); this.playerPrevS = s - L; this.playerProgress = s - L; this.playerLaps = 0; }
      else this.ais[a++].place(s, lane);
    }
    for (const ai of this.ais) { ai.progress = ai.s - L; ai.prevS = ai.s; ai.laps = 0; }
    this.playerFinished = false;
  }
  stop() { this.state = 'idle'; this.ais = []; }
  // returns the input mask for the player: during the countdown the bike is held
  holdPlayer() { return this.state === 'countdown'; }
  update(dt) {
    if (this.state === 'idle') return;
    const L = TRACK_LENGTH;
    if (this.state === 'countdown') {
      const prev = Math.ceil(this.count); this.count -= dt;
      const now = Math.ceil(this.count);
      if (now !== prev && now >= 1 && now <= 3) this.events.push({ type: 'beep', n: now });
      for (const ai of this.ais) { ai.bike.step(dt, { throttle: 0, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0, yaw: 0 }); }
      if (this.count <= 0) { this.state = 'racing'; this.t = 0; this.events.push({ type: 'go' }); }
      return;
    }
    this.t += dt;
    // player progress
    let pr = progressNear(this.player.pos[0], this.player.pos[2], this.playerPrevS, 14);
    if (pr.d > 45) pr = trackProgress(this.player.pos[0], this.player.pos[2]);
    if (pr) { let d = pr.s - this.playerPrevS; if (d < -L / 2) d += L; else if (d > L / 2) d -= L; this.playerPrevS = pr.s; this.playerProgress += d; }
    this.playerLaps = Math.max(0, Math.floor(this.playerProgress / L));
    const leader = Math.max(this.playerProgress, ...this.ais.map((a) => a.progress));
    for (const ai of this.ais) {
      if (!ai.finished) {
        const gap = leader - ai.progress;
        const rubber = clamp(1 + (gap - 20) * 0.0015 - (ai.progress - this.playerProgress > 60 ? 0.03 : 0), 0.93, 1.06);
        const inp = ai.control(dt, rubber);
        ai.bike.step(dt, inp);
        ai.time = this.t;
        if (ai.progress >= this.laps * L) { ai.finished = true; ai.finishTime = this.t; this.results.push({ name: ai.name, time: this.t }); }
      } else ai.bike.step(dt, { throttle: 0, brakeF: 0.3, brakeR: 0.3, steer: 0, pitch: 0, roll: 0, yaw: 0 });
    }
    if (!this.playerFinished && this.playerProgress >= this.laps * L) { this.playerFinished = true; this.playerTime = this.t; this.results.push({ name: 'YOU', time: this.t, player: true }); this.events.push({ type: 'finish' }); }
    // standings
    const all = [{ name: 'YOU', p: this.playerProgress, player: true }, ...this.ais.map((a) => ({ name: a.name, p: a.progress }))];
    all.sort((a, b) => b.p - a.p);
    this.standing = all;
    this.position = all.findIndex((x) => x.player) + 1;
    if (this.playerFinished && this.ais.every((a) => a.finished || a.progress < this.playerProgress - L * 0.6)) { /* keep results board visible */ }
  }
}
