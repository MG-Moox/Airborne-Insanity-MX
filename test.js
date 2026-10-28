const { Terrain, Bike, clamp } = require('./physics.js');
const t = new Terrain(1337);
for (const mode of ['idle', 'throttle', 'autopilot']) {
  const b = new Bike(t);
  let maxA = 0, maxV = 0, flips = 0, time = 0;
  const dt = 1 / 240;
  for (let i = 0; i < 240 * 60 && !b.crashed; i++) {
    const an = Math.atan2(Math.sin(b.a), Math.cos(b.a));
    let inp = { throttle: 0, brake: 0, lean: 0 };
    if (mode === 'throttle') inp.throttle = 1;
    if (mode === 'autopilot') {
      const target = Math.atan(t.slope(b.x));
      inp = { throttle: 1, brake: 0, lean: clamp(-(an - target) * 1.5 - b.w * 0.3, -1, 1) };
    }
    b.step(dt, inp);
    flips += b.flipsEvent;
    maxA = Math.max(maxA, Math.abs(an));
    maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
    time = i * dt;
  }
  console.log(mode, 'x=' + b.x.toFixed(1), 'crashed=' + b.crashed, 't=' + time.toFixed(1), 'maxAngle=' + maxA.toFixed(2), 'maxV=' + maxV.toFixed(1), 'flips=' + flips);
}
