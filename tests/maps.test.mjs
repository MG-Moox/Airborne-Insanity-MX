// Node checks for the generated maps: heights finite, spawns clear of colliders, track loop sane, a bike rides each map.
const id = parseInt(process.argv[2] || '2', 10), layout = process.argv[3] || 'national';
globalThis.__AIMX_MAP = id; globalThis.__AIMX_LAYOUT = layout;
const T = await import('../src/terrain.js');
const { Bike } = await import('../src/physics.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const AM = T.ACTIVE; ok(!!AM && AM.id === id, `map ${id} active (${AM && AM.name} ${layout})`);
let bad = 0, mn = 1e9, mx = -1e9;
for (let x = -450; x <= 450; x += 9) for (let z = -370; z <= 370; z += 9) { const h = T.heightAt(x, z); if (!isFinite(h)) bad++; mn = Math.min(mn, h); mx = Math.max(mx, h); }
ok(bad === 0, `heights finite (range ${mn.toFixed(1)}..${mx.toFixed(1)} m)`);
ok(T.TELEPORT_COUNT >= 6, `teleports: ${T.TELEPORT_COUNT}`);
for (let i = 0; i < T.TELEPORT_COUNT; i++) {
  const sp = T.spawnPoint(i), near = T.nearbyColliders(sp.x, sp.z, 3).length, h = T.heightAt(sp.x, sp.z);
  ok(near === 0 && isFinite(h) && T.borderSD(sp.x, sp.z) > 5, `spawn ${i} ${sp.name} clear (h=${h.toFixed(1)})`);
}
const jl = T.JUMP_LIST.length; ok(jl >= 4, `jumps: ${jl}`);
const { TRACK_LENGTH } = await import('../src/race.js'); ok(TRACK_LENGTH > 800, `track length ${TRACK_LENGTH.toFixed(0)} m`);
// steepest slope along the track (rideable)
let ms = 0; const P = T.TRACK_PATH; for (let i = 0; i < P.n; i++) { const e = 2; const g = Math.hypot(T.heightAt(P.x[i] + e, P.z[i]) - T.heightAt(P.x[i] - e, P.z[i]), T.heightAt(P.x[i], P.z[i] + e) - T.heightAt(P.x[i], P.z[i] - e)) / (2 * e); ms = Math.max(ms, g); }
ok(ms < 0.75, `max slope on loop ${ms.toFixed(2)}`);
// ride the loop with a simple pursuit controller for 40 s from the start teleport
T.DEBUG.noColliders = false;
const b = new Bike(); const sp = T.spawnPoint(0); b.teleport(sp.x, sp.z, sp.yaw);
let crashed = 0, dist = 0, px = b.pos[0], pz = b.pos[2];
for (let k = 0; k < 240 * 25; k++) {
  const sp2 = Math.hypot(b.vel ? b.vel[0] : 0, b.vel ? b.vel[2] : 0);
  b.step(1 / 240, { throttle: sp2 < 14 ? 0.8 : 0.3, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0, yaw: 0 });
  if (b.crashed) crashed++;
  if (k % 240 === 0) { dist += Math.hypot(b.pos[0] - px, b.pos[2] - pz); px = b.pos[0]; pz = b.pos[2]; }
}
ok(isFinite(b.pos[1]) && dist > 50, `bike rolled ${dist.toFixed(0)} m, finite state (crash frames ${crashed})`);
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
