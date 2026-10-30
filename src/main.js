// main.js - game loop: physics (fixed 240 Hz), AI race, cameras, rendering, HUD, audio, particles.
import { Renderer } from './renderer.js';
import { World } from './scene.js';
import { initMapSelect } from './mapSelect.js';
import { Bike, P } from './physics.js';
import { initGarage, applySetup, classOf, COLOURS, GEAR_COLOURS, PLATES } from './garage.js';
import { createBikeModel, RiderRagdoll } from './bikeModel.js';
import { Camera, CAM_MODES } from './camera.js';
import { Input } from './input.js';
import { initControls } from './controlsUI.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { Hud, fmtTime } from './hud.js';
import { LapTimer, Race } from './race.js';
import * as T from './terrain.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const params = new URLSearchParams(location.search);
const DT = 1 / 240;
const ACCENTS = [[0.9, 0.2, 0.2], [0.2, 0.5, 0.95], [0.98, 0.6, 0.1], [0.7, 0.3, 0.9], [0.95, 0.95, 0.95]];

function fail(msg) { $('loadtxt').textContent = 'Could not start the game'; $('loaderr').textContent = msg; $('bar').classList.add('hide'); console.error(msg); }

async function boot() {
  const canvas = $('c');
  let renderer;
  try { renderer = new Renderer(canvas); } catch (e) { return fail(String(e.message || e).slice(0, 300)); }

  const mapImg = T.ACTIVE ? T.ACTIVE.image(document) : new Image(); if (!T.ACTIVE) mapImg.src = 'assets/map.jpg';
  let quality = 1;
  try { const q = parseInt(localStorage.getItem('aimx-quality'), 10); if (q >= 0 && q <= 2) quality = q; } catch (_) {}
  if (params.has('q')) quality = clamp(parseInt(params.get('q'), 10) || 0, 0, 2);
  const applyQuality = (q) => {
    quality = q; renderer.setQuality(q); renderer.resize(); world.setQuality(q);
    try { localStorage.setItem('aimx-quality', String(q)); } catch (_) {}
    document.querySelectorAll('.qbtn').forEach((b) => b.classList.toggle('sel', +b.dataset.q === q));
  };

  const world = new World(renderer);
  try { world.init(); } catch (e) { return fail('World build failed: ' + (e.message || e)); }

  const bike = new Bike();
  let model = null;
  const aiModels = ACCENTS.map((c) => createBikeModel(renderer, c));
  const rider = new RiderRagdoll();
  const camera = new Camera();
  const particles = new Particles();
  const audio = new Audio();
  const hud = new Hud(mapImg);
  const lapTimer = new LapTimer();
  const race = new Race(bike);
  let garageOpen = false, prevCamMode = 0;
  const bikeLine = () => { const s = garage.setup, c = classOf(s), e = $('bikeline'); if (e) e.textContent = c.name + '  \u00b7  ' + COLOURS[s.colour][0] + ' / ' + GEAR_COLOURS[s.gear][0] + ' GEAR'; };
  const applyGarage = (s) => {
    applySetup(P, s); const c = classOf(s);
    if (model) model.dispose();
    model = createBikeModel(renderer, { accent: COLOURS[s.colour][1], jersey: GEAR_COLOURS[s.gear][1], plate: PLATES[s.plate][1], four: c.four });
    audio.setEngine(c.audio); bikeLine();
  };
  const garage = initGarage({
    change: applyGarage,
    open: () => {
      garageOpen = true; prevCamMode = camera.mode; camera.setMode(3); camera.orbitDist = 4.8; camera.orbitPitch = 0.2;
      $('start').classList.add('hide'); $('pause').classList.add('hide'); hud.show(false); hud.toggleMap(false);
    },
    close: () => {
      garageOpen = false; camera.setMode(running ? prevCamMode : 3);
      if (running) { hud.show(true); $('pause').classList.remove('hide'); } else $('start').classList.remove('hide');
    },
  });
  applyGarage(garage.setup);
  const pose = { standing: 0, forward: 0, lean: 0 };
  const aiPose = ACCENTS.map(() => ({ standing: 0, forward: 0.2, lean: 0 }));

  let running = false, paused = false, gameTime = 0, acc = 0, last = performance.now(), crashMsg = '', crashShow = 0, shakeT = 0;
  let prevAir = false, resultsT = 0, wasInWater = false, lastInp = { throttle: 0, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0, yaw: 0 };
  let countShown = null, raceMsgT = 0;

  const doTeleport = (i) => {
    const sp = T.spawnPoint(i);
    race.stop(); hud.board(null);
    bike.teleport(sp.x, sp.z, sp.yaw); rider.active = false; camera.initialised = false;
    lapTimer.prevS = null;
    hud.popup('FAST TRAVEL  ·  ' + sp.name, 'good');
    if (hud.mapOpen) { hud.toggleMap(false); }
    if (paused) togglePause();
    const sn = $('spotname'); if (sn) sn.textContent = sp.name;
  };
  hud.onTeleport = doTeleport;

  const startRace = () => {
    race.start(3, 5); camera.initialised = false; rider.active = false; hud.board(null); lapTimer.reset(); resultsT = 0;
    hud.popup('RACE  ·  3 LAPS', 'good');
  };

  const input = new Input(canvas, {
    camera: () => { const n = camera.cycle(); hud.setCamName(n); },
    map: () => { if (running) { hud.toggleMap(); } },
    respawn: () => { bike.respawn(); rider.active = false; camera.initialised = false; },
    help: () => togglePause(),
    pause: () => togglePause(),
    mute: () => { audio.mute(); },
    race: () => { if (running) hud.popup('AI RACING IS NOT READY YET - USE THE LAP TIMER', 'warn'); },
    resetLap: () => lapTimer.reset(),
    teleport: (i) => { if (running) doTeleport(i); },
    look: (dx, dy) => camera.look(dx, dy),
    zoom: (d) => camera.zoom(d),
  });

  const controls = initControls(input, {
    camera: () => { const n = camera.cycle(); hud.setCamName(n); },
    respawn: () => { bike.respawn(); rider.active = false; camera.initialised = false; },
    map: () => { if (running) hud.toggleMap(); },
    pause: () => togglePause(),
  });
  $('ctlbtn').onclick = () => controls.open();
  $('ctlbtn2').onclick = () => controls.open();

  function togglePause() {
    if (!running) return;
    paused = !paused;
    $('pause').classList.toggle('hide', !paused);
    if (paused) hud.toggleMap(false);
    last = performance.now();
  }
  $('resume').onclick = () => togglePause();
  $('restart').onclick = () => { togglePause(); doTeleport(0); };
  $('mute').onclick = () => { const m = audio.mute(); $('mute').textContent = m ? 'SOUND OFF' : 'SOUND ON'; };

  for (const host of ['qrow', 'pq']) {
    const el = $(host);
    ['LOW', 'HIGH', 'ULTRA'].forEach((n, q) => { const b = document.createElement('button'); b.className = 'btn alt qbtn'; b.dataset.q = q; b.textContent = n; b.onclick = () => applyQuality(q); el.appendChild(b); });
  }
  applyQuality(quality);

  // ------------------------------------------------------------ loading
  const sp0 = T.spawnPoint(params.has('tp') ? clamp(parseInt(params.get('tp'), 10) - 1, 0, T.TELEPORT_COUNT - 1) : 0);
  bike.teleport(sp0.x, sp0.z, sp0.yaw);
  camera.setMode(params.has('cam') ? clamp(parseInt(params.get('cam'), 10), 0, 3) : 0);
  hud.setCamName(CAM_MODES[camera.mode]);
  const bar = $('bar').firstElementChild;
  let total = 0;
  await new Promise((resolve) => {
    const tick = () => {
      const r = world.update(bike.pos[0], bike.pos[2], 2);
      total = Math.max(total, r.pending + 1);
      bar.style.width = Math.round(100 * (1 - r.pending / total)) + '%';
      if (r.pending === 0) resolve(); else requestAnimationFrame(tick);
    };
    tick();
  });
  $('loading').classList.add('hide');

  const begin = () => {
    $('start').classList.add('hide');
    audio.start(); running = true; hud.show(true); last = performance.now();
  };
  const rideMode = camera.mode;
  const begin2 = () => { camera.setMode(rideMode); begin(); };
  const mapSel = initMapSelect();
  $('mapname').textContent = mapSel.name + (mapSel.sub ? ' · ' + mapSel.sub : '');
  $('mapsel').onclick = () => { $('start').classList.add('hide'); mapSel.open(() => $('start').classList.remove('hide')); };
  $('mapsel2').onclick = () => { $('pause').classList.add('hide'); mapSel.open(() => $('pause').classList.remove('hide')); };
  $('garagebtn').onclick = () => garage.open();
  $('garagebtn2').onclick = () => garage.open();
  $('spotbtn').onclick = () => { hud.toggleMap(true); };
  $('mapbtn2').onclick = () => { hud.toggleMap(true); };
  const sn = T.spawnPoint(params.has('tp') ? clamp(parseInt(params.get('tp'), 10) - 1, 0, T.TELEPORT_COUNT - 1) : 0); $('spotname').textContent = sn.name;
  if (params.has('auto')) begin(); else { camera.orbitDist = 7.5; camera.orbitPitch = 0.28; camera.setMode(3); $('start').classList.remove('hide'); $('go').onclick = begin2; }
  addEventListener('keydown', (e) => { if (!running && (e.code === 'Enter' || e.code === 'Space') && !$('start').classList.contains('hide')) begin(); });
  $('c').addEventListener('pointerdown', () => audio.start());

  // ------------------------------------------------------------ per-frame helpers
  function surfaceKind(c, h) {
    if (T.waterLevelAt(c[0], c[2]) > -1e8) return 'water';
    const s = T.surfaceAt(c[0], c[2], h);
    if (h > 400 && s.v > 0.5) return 'snow';
    return s.dirt || s.v > 0.4 ? 'dust' : 'grass';
  }

  function handleEvents(dt) {
    for (const e of bike.events) {
      if (e.type === 'jump') {
        const bits = [];
        if (e.flips > 0) bits.push((e.flips > 1 ? e.flips + 'x ' : '') + (e.back ? 'BACKFLIP' : 'FRONTFLIP'));
        bits.push(e.time.toFixed(1) + 's AIR');
        hud.popup(bits.join('  ·  ') + '  ·  ' + Math.round(e.dist) + ' m', bike.landImpact > 11 ? 'warn' : 'good');
      } else if (e.type === 'crash') {
        crashMsg = e.msg; crashShow = 2.2; rider.launch(bike); audio.crash(); camera.impact(1);
        particles.burst('dust', bike.pos, 24, 5, 0.9, 1.4);
      } else if (e.type === 'respawn') { crashMsg = ''; rider.active = false; camera.initialised = false; }
      else if (e.type === 'splash') { audio.splash(); particles.burst('water', bike.pos, 30, Math.min(8, e.speed * 0.5), 0.35, 1.0); }
    }
    bike.events.length = 0;
    // landings
    const air = bike.air.on;
    if (prevAir && !air) { audio.thud(bike.landImpact); camera.impact(clamp(bike.landImpact * 0.045, 0, 1)); particles.burst('dust', bike.wheels[1].contact || bike.pos, 6, 3, 0.7, 0.9); }
    prevAir = air;
    for (const l of lapTimer.events) {
      if (l.type === 'lap') hud.popup((l.best ? 'BEST LAP  ' : 'LAP  ') + fmtTime(l.time), l.best ? 'good' : '');
      else if (l.type === 'sector') hud.popup('SECTOR ' + l.n, '');
      else if (l.type === 'invalidLap') hud.popup('LAP INVALID', 'warn');
    }
    lapTimer.events.length = 0;
    for (const e of race.events) {
      if (e.type === 'beep') audio.beep(660, 0.15);
      else if (e.type === 'go') { audio.beep(1100, 0.5, 0.25); hud.popup('GO!', 'good'); }
      else if (e.type === 'finish') { hud.popup('FINISHED  P' + race.position, 'good'); resultsT = 0.1; }
    }
    race.events.length = 0;
  }

  function emitParticles(b, inp, dt, k) {
    if (b.state === 'crashed') return;
    const sp = Math.hypot(b.v[0], b.v[2]);
    for (let wi = 0; wi < 2; wi++) {
      const W = b.wheels[wi];
      if (!W.grounded || !W.contact) continue;
      const kind = surfaceKind(W.contact, W.contact[1]);
      let power = 0;
      if (wi === 1) power = (inp.throttle * 0.8 + W.slip * 0.25) * (sp > 2 || inp.throttle > 0.3 ? 1 : 0) + sp * 0.02;
      else power = W.slip * 0.2 + sp * 0.012;
      if (kind === 'water') power = sp * 0.12;
      power *= dt * 60 * k;
      let n = Math.floor(power); if (Math.random() < power - n) n++;
      if (n > 0) particles.wheelSpray(W.contact, b.v, kind, n);
    }
  }

  // ------------------------------------------------------------ main loop
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    const rdt = dt;
    if (paused) dt = 0;
    if (garageOpen || !running) camera.orbitYaw += rdt * (garageOpen ? 0.35 : 0.18);
    controls.setActive(running && !paused);
    if (hud.mapOpen && (!running || paused)) hud.redrawMap({ x: bike.pos[0], z: bike.pos[2], yaw: bike.yaw, ais: [] });
    input.speed = Math.hypot(bike.v[0], bike.v[2]);
    const inpRaw = input.poll(dt);
    let inp = inpRaw;
    const crashed = bike.state === 'crashed';
    if (!running || crashed || race.holdPlayer()) inp = { throttle: running && race.holdPlayer() ? inpRaw.throttle * 0.0 : 0, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0, yaw: 0 };
    lastInp = inp;

    if (running && !paused) {
      gameTime += dt; acc += dt; let n = 0;
      while (acc >= DT && n < 12) {
        bike.step(DT, inp);
        if (race.state !== 'idle') race.update(DT);
        rider.step(DT, T.heightAt, T.normalAt);
        acc -= DT; n++;
      }
      if (acc > DT * 12) acc = 0;
      handleEvents(dt);
      lapTimer.update(bike, gameTime, dt);
      if (crashShow > 0) crashShow -= dt;
      // pose
      const sp = Math.hypot(bike.v[0], bike.v[2]);
      const standT = (bike.grounded && sp > 7.5 && inp.brakeF < 0.5 && !bike.inWater) || bike.air.on ? 1 : 0;
      const k = Math.min(1, dt * 3.5);
      pose.standing += (standT - pose.standing) * k;
      pose.forward += (clamp(-inp.pitch, -1, 1) - pose.forward) * k;
      pose.lean += (clamp(inp.roll, -1, 1) - pose.lean) * k;
      race.ais.forEach((a, i) => { const p = aiPose[i % aiPose.length]; const s = Math.hypot(a.bike.v[0], a.bike.v[2]); p.standing += ((s > 8 ? 1 : 0) - p.standing) * k; p.lean += (clamp(a.bike.steer * -1, -1, 1) - p.lean) * k; });
      emitParticles(bike, inp, dt, 1);
      race.ais.forEach((a) => emitParticles(a.bike, { throttle: 0.7 }, dt, 0.5));
      particles.update(dt);
      audio.update(bike, inp, dt);
    }

    const lap = lapTimer;
    // world streaming + camera
    camera.update(dt, bike, pose);
    const cam = camera.cam;
    const rs = world.update(bike.pos[0], bike.pos[2], 1);

    // ---- render
    const pov = camera.isPOV;
    const ground = T.heightAt(bike.pos[0], bike.pos[2]);
    const drawBike = (b, mdl, p, opts, withShadow = true) => {
      mdl.draw(b, p, opts);
      if (withShadow) {
        const gy = T.heightAt(b.pos[0], b.pos[2]), h = b.pos[1] - gy;
        mdl.drawShadow(b.pos[0], gy, b.pos[2], T.normalAt(b.pos[0], b.pos[2], 0.6), b.fwd, 0.8, (renderer.shadowsOn ? 0.14 : 0.3) * clamp(1 - h / 7, 0, 1));
      }
    };
    const drawActors = (shadowPass) => {
      drawBike(bike, model, pose, { pov: pov && !shadowPass, ragdoll: rider.active }, !shadowPass);
      if (rider.active) model.drawRagdoll(rider);
      race.ais.forEach((a, i) => drawBike(a.bike, aiModels[i % aiModels.length], aiPose[i % aiPose.length], { ragdoll: false }, !shadowPass));
    };
    renderer.renderShadows(bike.pos, cam.eye, (ci, R) => { world.draw(cam, 0, bike.pos, R); drawActors(true); });
    renderer.begin(cam, gameTime);
    world.draw(cam, dt);
    drawActors(false);
    world.drawWater();
    particles.draw(renderer);
    renderer.end({ speed: clamp((Math.hypot(bike.v[0], bike.v[1], bike.v[2]) - 18) / 40, 0, 1) * 0.22 });

    // ---- HUD
    if (running) {
      const sp = Math.hypot(bike.v[0], bike.v[1], bike.v[2]);
      const [px, py] = [bike.pos[0], bike.pos[2]];
      hud.update({
        dt, speed: sp, gear: audio.gear || 1, rpm: audio.rpm || 0.2, alt: bike.pos[1], stats: bike.stats, zone: T.zoneAt(px, py), lap,
        race, raceLaps: race.state !== 'idle' ? race.laps : 0, oob: bike.oob, invalid: lap.lapStart !== null && !lap.valid && lap.offT > 0.5,
        crashMsg: crashed && crashShow > 0 ? crashMsg : '', count: race.state === 'countdown' ? (race.count > 3 ? 'READY' : Math.max(1, Math.ceil(race.count))) : null,
        x: px, z: py, yaw: bike.yaw, ais: race.ais.map((a) => ({ x: a.bike.pos[0], z: a.bike.pos[2] })),
      });
      if (race.playerFinished) { resultsT -= dt; if (resultsT <= 0) { resultsT = 1; const res = [...race.results].sort((a, b) => a.time - b.time); hud.board(res, race.laps); } }
    }
  }
  requestAnimationFrame(frame);

  // handy for debugging / automated tests
  window.__mx = { P, garage, bike, camera, world, race, T, hud, input, renderer, startRace, doTeleport, lapTimer, setPaused: (v) => { paused = v; }, get running() { return running; } };
  window.__mxReady = true;
}

boot().catch((e) => fail(String(e && e.stack ? e.stack : e).slice(0, 400)));
