// Handling harness: steer at several speeds, report whether the bike stays up and how violent it gets.
import { Bike } from '../src/physics.js';
import * as T from '../src/terrain.js';
T.DEBUG.noColliders = true; T.DEBUG.flat = true;
const DT = 1 / 240;
function run(speedTarget, steerFn, secs = 5, throttleHold = true) {
  const b = new Bike(); const sp = T.spawnPoint(0); b.teleport(sp.x, sp.z, sp.yaw);
  let ayLate = 0, nLate = 0, steerAxis = 0, t = 0, maxRoll = 0, maxSlip = 0, crashed = null, maxYaw = 0, flips = 0, maxAy = 0;
  const ramp = (cur, tgt, dt, rise, fall) => { const r = Math.abs(tgt) > Math.abs(cur) || Math.sign(tgt) !== Math.sign(cur) ? rise : fall; return cur + Math.max(-r * dt, Math.min(r * dt, tgt - cur)); };
  // phase 1: accelerate straight, then hold speed
  for (let i = 0; i < 240 * 12 && Math.hypot(b.v[0], b.v[2]) < speedTarget; i++) b.step(DT, { throttle: 1, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0, yaw: 0 });
  let vPrev = [...b.v];
  for (let i = 0; i < 240 * secs; i++) {
    t = i * DT;
    const want = steerFn(t);
    steerAxis = ramp(steerAxis, want, DT, 5.5, 9);
    const sp2 = Math.hypot(b.v[0], b.v[2]);
    const thr = throttleHold ? (sp2 < speedTarget ? 1 : 0.35) : 0;
    b.step(DT, { throttle: thr, brakeF: 0, brakeR: 0, steer: steerAxis, pitch: 0, roll: steerAxis * 0.6, yaw: steerAxis * 0.8 });
    if (b.state === 'crashed' && !crashed) { crashed = t.toFixed(2) + 's: ' + (b.crashMsg || ''); }
    maxRoll = Math.max(maxRoll, Math.abs(b.roll || 0));
    maxSlip = Math.max(maxSlip, b.wheels[0].slip, b.wheels[1].slip);
    maxYaw = Math.max(maxYaw, Math.abs(b.w[1]));
    if (i % 24 === 0) { const ay = Math.hypot(b.v[0] - vPrev[0], b.v[2] - vPrev[2]) / (24 * DT); vPrev = [...b.v]; maxAy = Math.max(maxAy, ay); }
    if (t > secs - 1) { ayLate += Math.abs(Math.hypot(b.v[0], b.v[2]) * b.w[1]); nLate++; }
    if (b.events) b.events.length = 0;
  }
  return { crashed, maxRoll: +maxRoll.toFixed(2), maxSlip: +maxSlip.toFixed(1), maxYaw: +maxYaw.toFixed(2), ayEnd: +(ayLate / Math.max(1, nLate)).toFixed(1), v: +Math.hypot(b.v[0], b.v[2]).toFixed(1) };
}
const cases = [];
for (const sp of [8, 14, 22, 30]) {
  cases.push([`v=${sp} full steer hold 3s`, run(sp, () => 1, 3)]);
  cases.push([`v=${sp} half steer hold 3s`, run(sp, () => 0.5, 3)]);
  cases.push([`v=${sp} wiggle L/R 0.6s`, run(sp, (t) => (Math.floor(t / 0.6) % 2 ? 1 : -1), 4)]);
  cases.push([`v=${sp} step then release`, run(sp, (t) => (t < 1 ? 1 : 0), 4)]);
}
let crashes = 0;
for (const [n, r] of cases) { if (r.crashed) crashes++; console.log(n.padEnd(30), JSON.stringify(r)); }
console.log('crashes:', crashes, '/', cases.length);
