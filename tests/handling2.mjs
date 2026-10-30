// "Hard-ish" check: pushing too hard should slide / wipe out sometimes, but never spin wildly out of nowhere.
import { Bike } from '../src/physics.js';
import * as T from '../src/terrain.js';
T.DEBUG.noColliders = true; T.DEBUG.flat = true;
const DT = 1 / 240;
function run(v0, grip, fn, secs = 3) {
  T.DEBUG.grip = grip;
  const b = new Bike(); const sp = T.spawnPoint(0); b.teleport(sp.x, sp.z, sp.yaw);
  for (let i = 0; i < 240 * 14 && Math.hypot(b.v[0], b.v[2]) < v0; i++) b.step(DT, { throttle: 1, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0, yaw: 0 });
  let steer = 0, maxSlip = 0, maxRoll = 0, maxYaw = 0, crash = null, y0 = b.yaw, turned = 0, prev = b.yaw;
  for (let i = 0; i < 240 * secs; i++) {
    const t = i * DT, c = fn(t, b);
    steer += Math.max(-5.5 * DT, Math.min(5.5 * DT, c.steer - steer));
    b.step(DT, { throttle: c.throttle || 0, brakeF: c.brakeF || 0, brakeR: c.brakeR || 0, steer, pitch: 0, roll: steer * 0.6, yaw: steer * 0.8 });
    for (const e of b.events) if (e.type === 'crash' && !crash) crash = t.toFixed(2) + 's ' + e.msg; b.events.length = 0;
    maxSlip = Math.max(maxSlip, b.wheels[0].slip, b.wheels[1].slip); maxRoll = Math.max(maxRoll, Math.abs(b.roll || 0)); maxYaw = Math.max(maxYaw, Math.abs(b.w[1]));
    let dy = b.yaw - prev; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); turned += dy; prev = b.yaw;
  }
  return { crash, slip: +maxSlip.toFixed(1), roll: +maxRoll.toFixed(2), yaw: +maxYaw.toFixed(2), turnDeg: Math.round((turned * 180) / Math.PI), v: +Math.hypot(b.v[0], b.v[2]).toFixed(1) };
}
const rows = [];
for (const g of [0.9, 0.6]) for (const v of [12, 20]) {
  rows.push([`grip ${g} v${v} full steer, coast`, run(v, g, () => ({ steer: 1 }))]);
  rows.push([`grip ${g} v${v} full steer + HARD BRAKE`, run(v, g, () => ({ steer: 1, brakeF: 0.85, brakeR: 0.55 }))]);
  rows.push([`grip ${g} v${v} full steer + FULL THROTTLE`, run(v, g, () => ({ steer: 1, throttle: 1 }))]);
  rows.push([`grip ${g} v${v} flick L-R-L + brake`, run(v, g, (t) => ({ steer: Math.floor(t / 0.5) % 2 ? 1 : -1, brakeF: 0.85, brakeR: 0.55, throttle: 0.2 }))]);
}
for (const [n, r] of rows) console.log(n.padEnd(42), JSON.stringify(r));
