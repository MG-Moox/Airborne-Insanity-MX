// bikeModel.js - procedural dirt bike + rider. Bike-local axes: +x right, +y up, +z back (forward = -z).
// Ground is 0.74 m below the origin when the suspension is fully extended.
import { Geo } from './geometry.js';
import { m4identity, m4mul, m4translate, m4scale, m4rotX, m4rotY, m4rotZ, m4fromQuat, limbMatrix, m4point } from './mathgl.js';

const LIME = [0.52, 0.93, 0.12], BLACK = [0.06, 0.06, 0.07], WHITE = [0.93, 0.93, 0.95], GREY = [0.42, 0.44, 0.48],
  DARK = [0.16, 0.17, 0.19], SILVER = [0.74, 0.76, 0.8], ALU = [0.62, 0.64, 0.68], GOLD = [0.86, 0.62, 0.14], RUBBER = [0.04, 0.04, 0.045], SKIN = [0.85, 0.62, 0.48];
const PANTS = [0.9, 0.91, 0.94], JERSEY = [0.07, 0.08, 0.09], BOOT = [0.1, 0.1, 0.11];

const HUB_F = [0, -0.4, -0.7], HUB_R = [0, -0.4, 0.72];
const HEAD = [0, 0.52, -0.47];
const PIVOT = [0, -0.27, 0.16];
const PEG_L = [-0.27, -0.29, 0.06], PEG_R = [0.27, -0.29, 0.06];
const GRIP_L = [-0.39, 0.6, -0.5], GRIP_R = [0.39, 0.6, -0.5];

const tube = (g, a, b, r, col) => g.cyl(r, r, 1, 7, col, limbMatrix(a, b), false);
const mirror = (f) => { f(1); f(-1); };

function buildBody() {
  const g = new Geo();
  // twin-spar aluminium frame
  mirror((s) => {
    tube(g, [s * 0.075, 0.5, -0.43], [s * 0.1, 0.3, 0.12], 0.03, ALU);        // main spar
    tube(g, [s * 0.1, 0.3, 0.12], [s * 0.09, 0.42, 0.72], 0.022, ALU);        // subframe
    tube(g, [s * 0.1, 0.3, 0.12], [s * 0.1, -0.2, 0.16], 0.028, ALU);         // swingarm pivot plate
    tube(g, [s * 0.07, 0.47, -0.45], [s * 0.1, -0.2, -0.12], 0.026, ALU);     // down tube
    tube(g, [s * 0.1, -0.2, -0.12], [s * 0.1, -0.27, 0.16], 0.026, ALU);      // cradle
  });
  // engine: crankcases, finned cylinder, head, clutch cover, carb / airbox
  g.box(0.24, 0.3, 0.38, GREY, m4translate(0, -0.2, 0.0));
  g.box(0.3, 0.2, 0.26, DARK, m4translate(0, -0.3, 0.08));
  g.cyl(0.115, 0.115, 0.04, 14, ALU, m4mul(m4translate(0.145, -0.2, 0.06), m4rotZ(Math.PI / 2)));   // clutch cover
  g.cyl(0.07, 0.07, 0.05, 12, BLACK, m4mul(m4translate(0.17, -0.2, 0.06), m4rotZ(Math.PI / 2)));
  const cyl = (y, r) => g.cyl(r, r, 0.028, 10, SILVER, m4mul(m4translate(0, y, -0.1 - (y + 0.02) * 0.45), m4rotX(0.38)));
  for (let i = 0; i < 5; i++) cyl(0.0 + i * 0.045, 0.105);
  g.cyl(0.1, 0.1, 0.2, 10, GREY, m4mul(m4translate(0, 0.05, -0.12), m4rotX(0.38)));
  g.box(0.2, 0.09, 0.2, SILVER, m4mul(m4translate(0, 0.24, -0.2), m4rotX(0.38)));                      // head
  // fuel tank + seat + airbox
  g.box(0.27, 0.2, 0.5, LIME, m4mul(m4translate(0, 0.46, -0.2), m4rotX(0.05)));
  g.box(0.26, 0.09, 0.78, BLACK, m4mul(m4translate(0, 0.43, 0.38), m4rotX(0.015)));                   // seat
  g.box(0.2, 0.05, 0.3, BLACK, m4translate(0, 0.41, -0.06));
  g.box(0.22, 0.17, 0.4, DARK, m4translate(0, 0.28, 0.32));
  // radiator shrouds (the big flared lime wedges)
  mirror((s) => {
    g.box(0.12, 0.34, 0.34, LIME, m4mul(m4translate(s * 0.17, 0.35, -0.4), m4mul(m4rotZ(-s * 0.2), m4rotX(0.0))));
    g.box(0.07, 0.24, 0.5, LIME, m4mul(m4translate(s * 0.17, 0.36, 0.0), m4rotZ(-s * 0.08)));
    g.box(0.07, 0.2, 0.46, LIME, m4mul(m4translate(s * 0.15, 0.37, 0.48), m4rotZ(-s * 0.05)));           // side panels
    g.box(0.075, 0.28, 0.07, BLACK, m4translate(s * 0.215, 0.35, -0.55));                                // radiator guard
    g.box(0.02, 0.19, 0.19, WHITE, m4translate(s * 0.2, 0.39, 0.52));                                    // side number plate
    g.box(0.022, 0.11, 0.045, BLACK, m4translate(s * 0.21, 0.39, 0.52));
  });
  // rear fender + tail light
  g.box(0.17, 0.03, 0.36, LIME, m4mul(m4translate(0, 0.46, 0.93), m4rotX(-0.55)));
  g.box(0.12, 0.05, 0.05, [0.6, 0.05, 0.05], m4translate(0, 0.33, 1.14));
  // exhaust: header out the front, expansion chamber along the right side, silencer
  tube(g, [0.04, 0.12, -0.3], [0.2, 0.0, -0.3], 0.025, SILVER);
  tube(g, [0.2, 0.0, -0.3], [0.2, 0.04, 0.0], 0.03, SILVER);
  g.cyl(0.085, 0.035, 0.5, 10, SILVER, m4mul(m4translate(0.21, 0.07, 0.12), m4rotX(Math.PI / 2)));         // expansion chamber
  g.cyl(0.04, 0.04, 0.34, 9, SILVER, m4mul(m4translate(0.22, 0.24, 0.46), m4rotX(Math.PI / 2 - 0.2)));     // link
  g.cyl(0.07, 0.06, 0.4, 10, ALU, m4mul(m4translate(0.22, 0.38, 0.72), m4rotX(Math.PI / 2 + 0.1)));         // silencer
  g.cyl(0.062, 0.062, 0.035, 10, BLACK, m4mul(m4translate(0.22, 0.4, 0.92), m4rotX(Math.PI / 2 + 0.1)));
  // pegs, kick-side lever, chain
  g.box(0.1, 0.02, 0.06, SILVER, m4translate(0.27, -0.29, 0.06));
  g.box(0.1, 0.02, 0.06, SILVER, m4translate(-0.27, -0.29, 0.06));
  g.cyl(0.075, 0.075, 0.014, 12, GOLD, m4mul(m4translate(-0.09, -0.3, 0.2), m4rotZ(Math.PI / 2)));   // front sprocket
  g.cyl(0.14, 0.14, 0.014, 16, GOLD, m4mul(m4translate(-0.09, -0.4, 0.72), m4rotZ(Math.PI / 2)));    // rear sprocket
  tube(g, [-0.09, -0.225, 0.2], [-0.09, -0.26, 0.72], 0.01, DARK);
  tube(g, [-0.09, -0.375, 0.2], [-0.09, -0.54, 0.72], 0.01, DARK);
  return g;
}

// everything that turns with the bars; origin = steering head
function buildFrontEnd() {
  const g = new Geo();
  const o = (p) => [p[0] - HEAD[0], p[1] - HEAD[1], p[2] - HEAD[2]];
  g.cyl(0.045, 0.045, 0.18, 8, ALU, m4translate(0, 0, 0));                                    // head tube
  tube(g, o([-0.1, 0.55, -0.5]), o([0.1, 0.55, -0.5]), 0.034, ALU);                          // top clamp
  tube(g, o([-0.1, 0.44, -0.52]), o([0.1, 0.44, -0.52]), 0.03, ALU);                         // lower clamp
  mirror((s) => {
    tube(g, o([s * 0.1, 0.58, -0.5]), o([s * 0.1, 0.18, -0.6]), 0.028, GOLD);               // upper fork tubes (gold)
  });
  tube(g, o([-0.4, 0.64, -0.5]), o([0.4, 0.64, -0.5]), 0.014, ALU);                          // handlebar
  tube(g, o([-0.4, 0.64, -0.5]), o([-0.33, 0.55, -0.46]), 0.014, ALU);
  tube(g, o([0.4, 0.64, -0.5]), o([0.33, 0.55, -0.46]), 0.014, ALU);
  g.box(0.16, 0.05, 0.03, LIME, m4translate(0, 0.17, -0.02));                                // bar pad
  g.cyl(0.024, 0.024, 0.13, 8, BLACK, m4mul(m4translate(...o(GRIP_L)), m4rotZ(Math.PI / 2)));  // grips
  g.cyl(0.024, 0.024, 0.13, 8, BLACK, m4mul(m4translate(...o(GRIP_R)), m4rotZ(Math.PI / 2)));
  tube(g, o([-0.33, 0.645, -0.54]), o([-0.18, 0.64, -0.62]), 0.007, SILVER);                 // levers
  tube(g, o([0.33, 0.645, -0.54]), o([0.18, 0.64, -0.62]), 0.007, SILVER);
  g.box(0.1, 0.07, 0.07, BLACK, m4translate(-0.25, 0.1, 0.0));                               // hand guards
  g.box(0.1, 0.07, 0.07, BLACK, m4translate(0.25, 0.1, 0.0));
  g.box(0.25, 0.25, 0.03, WHITE, m4mul(m4translate(0, 0.12, -0.14), m4rotX(0.34)));          // front number plate
  g.box(0.11, 0.13, 0.034, BLACK, m4mul(m4translate(0, 0.12, -0.14), m4rotX(0.34)));
  g.box(0.25, 0.022, 0.032, LIME, m4mul(m4translate(0, 0.255, -0.16), m4rotX(0.34)));
  return g;
}

function buildWheel(w) {
  const g = new Geo();
  g.torus(0.275, 0.065, 24, 8, RUBBER, m4scale(w, 1, 1));                                       // tyre carcass
  const n = 26;
  for (let i = 0; i < n; i++) {                                                                 // knobs
    const a = (i / n) * Math.PI * 2;
    g.box(0.14 * w + 0.03, 0.045, 0.07, [0.07, 0.07, 0.075], m4mul(m4rotX(a), m4translate(0, 0.335, 0)));
    g.box(0.1 * w, 0.04, 0.05, [0.07, 0.07, 0.075], m4mul(m4rotX(a + 0.06), m4mul(m4translate(0.045 * w, 0.328, 0), m4rotZ(0.0))));
  }
  g.torus(0.222, 0.016, 24, 5, [0.12, 0.12, 0.14]);                                             // rim
  for (let i = 0; i < 10; i++) g.box(0.01, 0.45, 0.01, SILVER, m4rotX((i / 10) * Math.PI));     // spokes
  g.cyl(0.05, 0.05, 0.16, 10, GOLD, m4rotZ(Math.PI / 2));                                       // hub
  g.cyl(0.13, 0.13, 0.012, 16, SILVER, m4mul(m4translate(-0.075, 0, 0), m4rotZ(Math.PI / 2)));  // brake disc
  g.box(0.02, 0.1, 0.03, LIME, m4translate(0.0, 0.21, 0));                                      // rim marker (shows spin)
  return g;
}

// front fender arc around the front hub (origin = hub)
function buildFender() {
  const g = new Geo();
  const pts = [];
  for (let a = -28; a <= 70; a += 14) { const r = (a * Math.PI) / 180; pts.push([0, 0.42 * Math.cos(r), -0.42 * Math.sin(r)]); }
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dy, dz);
    g.box(0.15, 0.022, L + 0.015, LIME, m4mul(m4translate(0, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2), m4rotX(Math.atan2(-dy, dz))));
  }
  return g;
}

function unitLimb(col) { return new Geo().cyl(1, 1, 1, 8, col, null, false); }

function buildHelmet() {
  const g = new Geo();
  g.sphere(0.165, 12, 9, LIME, m4scale(1, 1.05, 1.12));
  g.box(0.045, 0.02, 0.3, WHITE, m4mul(m4translate(0, 0.16, -0.0), m4rotX(0)));                      // centre stripe
  g.box(0.25, 0.1, 0.1, BLACK, m4translate(0, -0.015, -0.155));                                       // goggles
  g.box(0.215, 0.07, 0.03, [0.55, 0.75, 0.9], m4translate(0, -0.015, -0.208));                        // goggle lens
  g.box(0.3, 0.02, 0.2, BLACK, m4mul(m4translate(0, 0.1, -0.19), m4rotX(0.28)));                      // peak
  g.box(0.14, 0.1, 0.12, WHITE, m4mul(m4translate(0, -0.1, -0.17), m4rotX(-0.2)));                    // chin bar
  g.box(0.3, 0.04, 0.2, BLACK, m4translate(0, -0.015, 0.0));                                          // goggle strap
  return g;
}
function buildBoot() { const g = new Geo(); g.box(0.12, 0.11, 0.3, BOOT, m4translate(0, -0.035, -0.07)); g.box(0.125, 0.03, 0.12, LIME, m4translate(0, 0.02, -0.12)); return g; }
function buildChest() {
  const g = new Geo();
  g.sphere(0.16, 10, 8, JERSEY, m4scale(1.12, 1, 0.78));
  g.box(0.1, 0.1, 0.02, WHITE, m4translate(0, -0.02, 0.125));                                          // back number
  g.box(0.045, 0.07, 0.024, BLACK, m4translate(0, -0.02, 0.127));
  g.box(0.34, 0.035, 0.1, LIME, m4translate(0, 0.07, 0.0));                                            // shoulder stripe
  return g;
}
function buildHip() { return new Geo().sphere(0.14, 8, 6, PANTS, m4scale(1.05, 0.9, 1)); }
function ball(r, col) { return new Geo().sphere(r, 6, 5, col); }

function ik2(a, b, l1, l2, bend) {
  let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  let d = Math.hypot(dx, dy, dz);
  const maxd = l1 + l2 - 0.002;
  if (d > maxd) { const k = maxd / d; dx *= k; dy *= k; dz *= k; d = maxd; }
  const ux = dx / d, uy = dy / d, uz = dz / d;
  const proj = bend[0] * ux + bend[1] * uy + bend[2] * uz;
  let px = bend[0] - ux * proj, py = bend[1] - uy * proj, pz = bend[2] - uz * proj;
  const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const j = [a[0] + ux * x + px * h, a[1] + uy * x + py * h, a[2] + uz * x + pz * h];
  return { joint: j, end: [a[0] + dx, a[1] + dy, a[2] + dz] };
}

export class RiderRagdoll {
  constructor() { this.active = false; this.pos = [0, 0, 0]; this.vel = [0, 0, 0]; this.q = [0, 0, 0, 1]; this.w = [0, 0, 0]; this.t = 0; this.sliding = false; }
  launch(bike) {
    this.active = true; this.t = 0;
    this.pos = bike.toWorld([0, 0.55, 0.2]);
    this.vel = [bike.v[0] * 0.95 + bike.up[0] * 2.5, bike.v[1] * 0.9 + 2.5, bike.v[2] * 0.95 + bike.up[2] * 2.5];
    this.q = bike.q.slice();
    this.w = [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9];
  }
  step(dt, heightAt, normalAt) {
    if (!this.active) return;
    this.t += dt;
    this.vel[1] -= 9.81 * dt;
    const gy = heightAt(this.pos[0], this.pos[2]) + 0.3;
    this.sliding = false;
    if (this.pos[1] < gy) {
      const n = normalAt(this.pos[0], this.pos[2]);
      this.pos[1] = gy;
      const vn = this.vel[0] * n[0] + this.vel[1] * n[1] + this.vel[2] * n[2];
      if (vn < 0) { this.vel[0] -= n[0] * vn * 1.25; this.vel[1] -= n[1] * vn * 1.25; this.vel[2] -= n[2] * vn * 1.25; }
      const f = Math.exp(-dt * 2.2);
      this.vel[0] *= f; this.vel[2] *= f; this.vel[1] *= 0.9;
      for (let i = 0; i < 3; i++) this.w[i] *= Math.exp(-dt * 3.5);
      this.sliding = true;
    }
    this.pos[0] += this.vel[0] * dt; this.pos[1] += this.vel[1] * dt; this.pos[2] += this.vel[2] * dt;
    const [x, y, z] = this.w, h = dt * 0.5, q = this.q;
    const dq = [x * q[3] + y * q[2] - z * q[1], y * q[3] + z * q[0] - x * q[2], z * q[3] + x * q[1] - y * q[0], -x * q[0] - y * q[1] - z * q[2]];
    const n = Math.hypot(q[0] + dq[0] * h, q[1] + dq[1] * h, q[2] + dq[2] * h, q[3] + dq[3] * h) || 1;
    this.q = [(q[0] + dq[0] * h) / n, (q[1] + dq[1] * h) / n, (q[2] + dq[2] * h) / n, (q[3] + dq[3] * h) / n];
  }
}

export function createBikeModel(r, accent) {
  if (accent) { LIME[0] = accent[0]; LIME[1] = accent[1]; LIME[2] = accent[2]; }
  const body = r.makeMesh(buildBody()), front = r.makeMesh(buildFrontEnd()), wheelF = r.makeMesh(buildWheel(1.0)), wheelR = r.makeMesh(buildWheel(1.5)), fender = r.makeMesh(buildFender());
  const helmet = r.makeMesh(buildHelmet()), boot = r.makeMesh(buildBoot()), chest = r.makeMesh(buildChest()), hip = r.makeMesh(buildHip());
  const limbPants = r.makeMesh(unitLimb(PANTS)), limbJersey = r.makeMesh(unitLimb(JERSEY)), limbLime = r.makeMesh(unitLimb(LIME)), limbDark = r.makeMesh(unitLimb(DARK)), limbGold = r.makeMesh(unitLimb(GOLD)), limbBoot = r.makeMesh(unitLimb(BOOT)), limbAlu = r.makeMesh(unitLimb(ALU));
  const glove = r.makeMesh(ball(0.055, BLACK)), knee = r.makeMesh(ball(0.075, LIME));
  const shadowGeo = new Geo();
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
    shadowGeo.tri([0, 0, 0], [Math.cos(a1), 0, Math.sin(a1)], [Math.cos(a0), 0, Math.sin(a0)], [0, 0, 0]);
  }
  const shadow = r.makeMesh(shadowGeo);

  const limb = (mesh, M, a, b, rad) => r.draw(mesh, m4mul(M, m4mul(limbMatrix(a, b), m4scale(rad, 1, rad))));
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

  function drawRiderPosed(M, pose, hideHead) {
    const stand = pose.standing, fw = pose.forward, ln = pose.lean;
    const hips = [ln * 0.1, 0.4 + 0.1 * stand + 0.02 * fw, 0.3 - 0.2 * stand - 0.1 * fw];
    const tl = 0.5, tilt = 0.45 + 0.35 * stand + 0.25 * fw;            // torso lean-forward amount
    const sh = [hips[0] + ln * 0.14, hips[1] + tl * Math.cos(tilt * 0.9), hips[2] - tl * Math.sin(tilt * 0.9)];
    const headP = [sh[0], sh[1] + 0.22, sh[2] - 0.1];
    r.draw(hip, m4mul(M, m4translate(...hips)));
    limb(limbJersey, M, hips, sh, 0.125);
    r.draw(chest, m4mul(M, m4translate(sh[0], sh[1] - 0.04, sh[2])));
    if (!hideHead) r.draw(helmet, m4mul(M, m4translate(...headP)));
    for (const s of [-1, 1]) {
      const peg = s < 0 ? PEG_L : PEG_R, grip = s < 0 ? GRIP_L : GRIP_R;
      const hipS = [hips[0] + s * 0.1, hips[1], hips[2]];
      const leg = ik2(hipS, [peg[0], peg[1] + 0.05, peg[2]], 0.46, 0.46, [s * 0.35, 0.1, -1]);
      limb(limbPants, M, hipS, leg.joint, 0.088); limb(limbPants, M, leg.joint, leg.end, 0.07);
      r.draw(knee, m4mul(M, m4translate(...leg.joint)));
      { const dx = leg.joint[0] - leg.end[0], dy = leg.joint[1] - leg.end[1], dz = leg.joint[2] - leg.end[2], dl = Math.hypot(dx, dy, dz) || 1, k = 0.24 / dl; limb(limbBoot, M, [leg.end[0], leg.end[1] - 0.02, leg.end[2]], [leg.end[0] + dx * k, leg.end[1] + dy * k, leg.end[2] + dz * k], 0.082); }
      r.draw(boot, m4mul(M, m4translate(leg.end[0], leg.end[1] - 0.04, leg.end[2])));
      const shS = [sh[0] + s * 0.19, sh[1] - 0.02, sh[2]];
      const arm = ik2(shS, grip, 0.31, 0.31, [s * 1, -0.5, 0.2]);
      limb(limbLime, M, shS, arm.joint, 0.055); limb(limbLime, M, arm.joint, arm.end, 0.048);
      r.draw(glove, m4mul(M, m4translate(...arm.end)));
    }
  }

  function drawRagdoll(rd) {
    const M = m4fromQuat(rd.q, rd.pos);
    const t = rd.t * 7, k = Math.min(1, Math.hypot(...rd.w) / 4 + 0.35);
    const fl = (i) => Math.sin(t + i * 1.7) * 0.35 * k;
    const hips = [0, 0, 0], sh = [0, 0.5, 0];
    r.draw(hip, M); limb(limbJersey, M, hips, sh, 0.125); r.draw(chest, m4mul(M, m4translate(0, 0.46, 0)));
    r.draw(helmet, m4mul(M, m4translate(0.02, 0.72, -0.05)));
    for (const s of [-1, 1]) {
      const kn = [s * (0.15 + fl(s) * 0.5), -0.4, -0.12 + fl(2 + s) * 0.4], ft = [s * (0.22 + fl(3) * 0.4), -0.85, 0.05 + fl(4 + s) * 0.5];
      limb(limbPants, M, [s * 0.1, 0, 0], kn, 0.088); limb(limbPants, M, kn, ft, 0.07); r.draw(boot, m4mul(M, m4translate(ft[0], ft[1] - 0.04, ft[2])));
      const el = [s * (0.35 + fl(5 + s) * 0.3), 0.42, 0.05 + fl(6 + s) * 0.3], hd = [s * (0.55 + fl(7) * 0.3), 0.45 + fl(8 + s) * 0.3, -0.1 + fl(9 + s) * 0.4];
      limb(limbLime, M, [s * 0.19, 0.48, 0], el, 0.055); limb(limbLime, M, el, hd, 0.048); r.draw(glove, m4mul(M, m4translate(...hd)));
    }
  }

  return {
    // bike: Bike from physics.js; pose: {standing,forward,lean}; opts: {pov, ragdoll, alpha}
    draw(bike, pose, opts = {}) {
      const M = m4fromQuat(bike.q, bike.pos);
      r.draw(body, M);
      const steer = bike.steer * 0.9;
      const S = m4mul(m4translate(...HEAD), m4mul(m4rotY(steer), m4translate(-HEAD[0], -HEAD[1], -HEAD[2])));
      const MF = m4mul(M, S);
      r.draw(front, m4mul(MF, m4translate(...HEAD)));
      const wf = bike.wheels[0], wr = bike.wheels[1];
      const hubF = [HUB_F[0], 0.05 - wf.L, HUB_F[2]], hubR = [HUB_R[0], 0.05 - wr.L, HUB_R[2]];
      // fork lowers + front wheel (steered)
      for (const s of [-1, 1]) {
        limb(limbAlu, MF, [s * 0.1, 0.16, -0.58], [s * 0.1, hubF[1] + 0.02, hubF[2] + 0.0], 0.03);
      }
      r.draw(wheelF, m4mul(MF, m4mul(m4translate(...hubF), m4rotX(-wf.spin))));
      r.draw(fender, m4mul(MF, m4translate(hubF[0], hubF[1] - 0.04, hubF[2] - 0.02)));
      // swingarm + rear shock + rear wheel
      limb(limbAlu, M, PIVOT, hubR, 0.034); limb(limbAlu, M, [-0.09, PIVOT[1], PIVOT[2]], [-0.09, hubR[1], hubR[2]], 0.025);
      limb(limbLime, M, [0, 0.28, 0.24], [0, (PIVOT[1] + hubR[1]) / 2 + 0.02, (PIVOT[2] + hubR[2]) / 2 - 0.02], 0.028);
      r.draw(wheelR, m4mul(M, m4mul(m4translate(...hubR), m4rotX(-wr.spin))));
      if (!opts.ragdoll) drawRiderPosed(M, pose, opts.pov);
    },
    drawRagdoll,
    // soft blob shadow on the ground under the bike (n = ground normal, fwd = bike forward)
    drawShadow(x, y, z, n, fwd, size, a) {
      const d = fwd[0] * n[0] + fwd[1] * n[1] + fwd[2] * n[2];
      let za = [fwd[0] - n[0] * d, fwd[1] - n[1] * d, fwd[2] - n[2] * d];
      const zl = Math.hypot(...za) || 1; za = za.map((v) => v / zl);
      const xa = [n[1] * za[2] - n[2] * za[1], n[2] * za[0] - n[0] * za[2], n[0] * za[1] - n[1] * za[0]];
      const m = new Float64Array(16);
      m[0] = xa[0] * size * 0.55; m[1] = xa[1] * size * 0.55; m[2] = xa[2] * size * 0.55;
      m[4] = n[0]; m[5] = n[1]; m[6] = n[2];
      m[8] = za[0] * size * 1.3; m[9] = za[1] * size * 1.3; m[10] = za[2] * size * 1.3;
      m[12] = x + n[0] * 0.06; m[13] = y + n[1] * 0.06; m[14] = z + n[2] * 0.06; m[15] = 1;
      r.draw(shadow, m, { alpha: a });
    },
  };
}
