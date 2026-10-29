import { Bike } from '../src/physics.js';
import * as T from '../src/terrain.js';

const DT = 1 / 240;
const idle = { throttle: 0, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0, yaw: 0 };
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + info); if (!ok) fails++; };
const kmh = (b) => (Math.hypot(...b.v) * 3.6).toFixed(0);

function run(secs, ctl, setup) {
  const b = new Bike();
  if (setup) setup(b);
  const out = { b, maxV: 0, crashed: false, crashMsg: '', jumps: [], splash: false, respawned: false, maxRoll: 0, maxPitch: 0, minSD: 1e9 };
  for (let i = 0; i < secs * 240; i++) {
    b.step(DT, ctl(b, i * DT));
    out.maxV = Math.max(out.maxV, Math.hypot(...b.v));
    out.maxRoll = Math.max(out.maxRoll, Math.abs(b.roll || 0));
    out.maxPitch = Math.max(out.maxPitch, Math.abs(b.pitch));
    out.minSD = Math.min(out.minSD, T.borderSD(b.pos[0], b.pos[2]));
    if (b.state === 'crashed' && !out.crashed) { out.crashed = true; }
    for (const e of b.events) {
      if (e.type === 'jump') out.jumps.push(e);
      if (e.type === 'splash') out.splash = true;
      if (e.type === 'crash') out.crashMsg = e.msg;
      if (e.type === 'respawn') out.respawned = true;
    }
    b.events.length = 0;
    if (!isFinite(b.pos[0] + b.pos[1] + b.pos[2])) break;
  }
  return out;
}
const at = (px, py, headingDeg) => (b) => { const [x, z] = T.toWorld(px, py); b.reset(x, z, (-headingDeg * Math.PI) / 180); };
const steerTo = (b, tx, tz, gain = 2) => {
  const dx = tx - b.pos[0], dz = tz - b.pos[2];
  const want = Math.atan2(-dx, -dz), err = Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw));
  return Math.max(-1, Math.min(1, -err * gain));
};

// ---- terrain / world
check('spawn is flat and low', Math.abs(T.heightAt(0, 0)) < 8, 'h=' + T.heightAt(0, 0).toFixed(1));
const pk = T.toWorld(...T.LAYOUT.ANCHORS[0].slice(0, 2));
check('peak is high', T.heightAt(...pk) > 400, 'h=' + T.heightAt(...pk).toFixed(0));
const lk = T.toWorld(T.LAYOUT.LAKE.cx, T.LAYOUT.LAKE.cy);
check('lake has water below its surface', T.waterLevelAt(...lk) === T.LAKE_LEVEL && T.heightAt(...lk) < T.LAKE_LEVEL - 1, 'bed=' + T.heightAt(...lk).toFixed(1));
check('trees exist in forest chunks', T.treesInChunk(-3, -5).length + T.treesInChunk(-4, -6).length + T.treesInChunk(-5, -8).length > 20);
check('border: outside is outside', T.borderSD(...T.toWorld(5, 600)) < 0 && T.borderSD(0, 0) > 0);

// ---- idle at spawn
let r = run(8, () => idle);
check('idle stable at spawn', !r.crashed && Math.hypot(...r.b.v) < 0.05, `v=${Math.hypot(...r.b.v).toFixed(3)} roll=${r.maxRoll.toFixed(2)}`);

// ---- accelerate north across the festival practice area, keep heading
const west = (d) => [Math.sin((250 * Math.PI) / 180) * d, -Math.cos((250 * Math.PI) / 180) * d];   // a clear 400 m line from spawn
r = run(8, (b) => ({ ...idle, throttle: 1, steer: steerTo(b, ...west(300)) }), (b) => b.reset(0, 0, (-250 * Math.PI) / 180));
console.log('  accel top speed km/h', (r.maxV * 3.6).toFixed(0), 'crashed', r.crashed, r.crashMsg);
check('accelerates quickly', r.maxV > 24 && !r.crashed);

// ---- corner both ways
const rr = run(10, (b, t) => ({ ...idle, throttle: t < 3 ? 0.8 : 0.3, steer: t > 3 ? 0.5 : 0 }), at(1000, 1000, 90));
const rl = run(10, (b, t) => ({ ...idle, throttle: t < 3 ? 0.8 : 0.3, steer: t > 3 ? -0.5 : 0 }), at(1000, 1000, 90));
console.log('  right roll', rr.b.roll.toFixed(2), 'yawRate', rr.b.w[1].toFixed(2), '| left roll', rl.b.roll.toFixed(2), 'yawRate', rl.b.w[1].toFixed(2));
check('leans into turns', rr.b.roll > 0.05 && rl.b.roll < -0.05 && rr.b.w[1] < 0 && rl.b.w[1] > 0 && !rr.crashed && !rl.crashed);

// ---- braking
r = run(14, (b, t) => t < 5 ? { ...idle, throttle: 1, steer: steerTo(b, ...west(380)) } : { ...idle, brakeF: 0.6, brakeR: 0.5 }, (b) => b.reset(0, 0, (-250 * Math.PI) / 180));
console.log('  brake: final km/h', kmh(r.b), 'crashed', r.crashed);
check('brakes to a stop', !r.crashed && Math.hypot(...r.b.v) < 1);

// ---- jump a festival kicker
const jmp = T.JUMP_LIST.find((j) => Math.abs(j.cx - T.toWorld(1090, 858)[0]) < 1 && Math.abs(j.cz - T.toWorld(1090, 858)[1]) < 1);
r = run(10, (b) => ({ ...idle, throttle: 1, steer: steerTo(b, jmp.cx + jmp.dx * 100, jmp.cz + jmp.dz * 100, 3) }),
  (b) => b.reset(jmp.cx - jmp.dx * 90, jmp.cz - jmp.dz * 90, Math.atan2(-jmp.dx, -jmp.dz)));
console.log('  festival kicker jumps:', JSON.stringify(r.jumps.map((j) => ({ t: +j.time.toFixed(2), d: +j.dist.toFixed(1) }))), 'crashed', r.crashed, r.crashMsg);
check('kicker launches the bike', r.jumps.length >= 1 && r.jumps[0].time > 0.5 && r.jumps[0].dist > 8);

// ---- the lake: slow down in shallow water, sink in deep water
r = run(20, (b) => ({ ...idle, throttle: 0.7, steer: steerTo(b, lk[0], lk[1]) }), at(600, 1005, 180));
console.log('  lake: splash', r.splash, 'crash', r.crashMsg, 'respawned', r.respawned);
check('riding into the lake splashes and sinks you', r.splash && (r.crashed || r.respawned));

// ---- map border is a wall
r = run(30, () => ({ ...idle, throttle: 1 }), at(1100, 1050, 180));
console.log('  border: min signed dist', r.minSD.toFixed(1), 'respawned', r.respawned);
check('cannot leave the map', r.minSD > -45 && isFinite(r.b.pos[0]));

// ---- buildings are solid: the bike must never end up inside one
const bd = T.LAYOUT.BUILDINGS[16];
const bc = T.toWorld(bd[0], bd[1]);
let minGap = 1e9;
r = run(10, (b) => {
  for (const c of T.COLLIDERS) minGap = Math.min(minGap, Math.hypot(b.pos[0] - c.x, b.pos[2] - c.z) - c.r);
  return { ...idle, throttle: 1, steer: steerTo(b, bc[0], bc[1], 3) };
}, at(bd[0] + 60, bd[1], 270));
console.log('  building: crashed', r.crashed, r.crashMsg, 'closest gap to a solid prop', minGap.toFixed(2), 'm');
check('buildings are solid', minGap > -0.9 && (r.crashed || r.maxV < 20));

// ---- climbing the mountain trails without blowing up
const route = [[960, 1010], [995, 790], [995, 650], [850, 560], [600, 560], [540, 460], [480, 300], [300, 215]];
let leg = 0, nanCount = 0, bestLeg = 0;
const climb = run(240, (b) => {
  const [x, z] = T.toWorld(route[leg + 1][0], route[leg + 1][1]);
  if (Math.hypot(b.pos[0] - x, b.pos[2] - z) < 25 && leg < route.length - 2) leg++; bestLeg = Math.max(bestLeg, leg);
  return { ...idle, throttle: 0.75, steer: steerTo(b, x, z, 2) };
}, (b) => b.reset(0, 0, 0));
console.log('  climb: reached leg', bestLeg, 'of', route.length - 2, 'crashed', climb.crashed, 'top km/h', (climb.maxV * 3.6).toFixed(0), 'stats dist', climb.b.stats.distance.toFixed(0));
check('long run is numerically stable', isFinite(climb.b.pos[0]) && isFinite(climb.b.pos[1]) && climb.maxV < 90);

// ---- cost of one physics step (must be far below 1/240 s)
const b = new Bike(); const t0 = performance.now();
for (let i = 0; i < 20000; i++) b.step(DT, { ...idle, throttle: 0.5 });
const us = ((performance.now() - t0) * 1000) / 20000;
check('physics step is fast', us < 400, us.toFixed(0) + ' us/step');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
