'use strict';
(function () {
  const { Terrain, Bike, WHEEL_R, WHEEL_X, WHEEL_Y, clamp } = window.MX;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize); resize();

  const terrain = new Terrain(1337);
  const bike = new Bike(terrain);
  let checkpoint = 0, best = 0, flipsTotal = 0, popup = '', popupT = 0, crashT = 0;
  try { best = parseFloat(localStorage.getItem('mx-best') || '0') || 0; } catch (e) {}

  // ---- input ----
  const keys = {};
  const touch = { gas: false, brake: false, back: false, fwd: false };
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyR') respawn(true);
    if (e.code === 'KeyM') toggleMute();
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    startAudio();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  document.querySelectorAll('[data-btn]').forEach((el) => {
    const k = el.dataset.btn;
    const on = (e) => { e.preventDefault(); touch[k] = true; el.classList.add('on'); startAudio(); };
    const off = (e) => { e.preventDefault(); touch[k] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, off));
  });
  function readInput() {
    const gas = keys.ArrowUp || keys.KeyW || touch.gas;
    const brake = keys.ArrowDown || keys.KeyS || touch.brake;
    const back = keys.ArrowLeft || keys.KeyA || touch.back;
    const fwd = keys.ArrowRight || keys.KeyD || touch.fwd;
    return { throttle: gas ? 1 : 0, brake: brake ? 1 : 0, lean: (back ? 1 : 0) - (fwd ? 1 : 0) };
  }

  // ---- audio (simple engine tone) ----
  let ac = null, osc = null, gain = null, muted = false;
  function startAudio() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      osc = ac.createOscillator(); gain = ac.createGain();
      osc.type = 'sawtooth'; osc.frequency.value = 60; gain.gain.value = 0;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      osc.connect(lp); lp.connect(gain); gain.connect(ac.destination); osc.start();
    } catch (e) { ac = null; }
  }
  function toggleMute() { muted = !muted; }
  function updateAudio(inp) {
    if (!ac) return;
    const sp = Math.hypot(bike.vx, bike.vy);
    const f = 55 + sp * 4 + inp.throttle * 40;
    osc.frequency.setTargetAtTime(f, ac.currentTime, 0.05);
    gain.gain.setTargetAtTime(muted || bike.crashed ? 0 : 0.03 + inp.throttle * 0.04, ac.currentTime, 0.05);
  }

  // ---- game logic ----
  function respawn(full) {
    if (full) { checkpoint = 0; }
    bike.reset(checkpoint, checkpoint > 0 ? 8 : 0);
    crashT = 0;
  }
  function showPopup(s) { popup = s; popupT = 2; }

  let acc = 0, last = performance.now();
  const DT = 1 / 240;
  let camX = 0, camY = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const inp = bike.crashed ? { throttle: 0, brake: 0, lean: 0 } : readInput();
    acc += dt;
    while (acc >= DT) {
      bike.step(DT, inp);
      acc -= DT;
      if (bike.flipsEvent > 0) {
        flipsTotal += bike.flipsEvent;
        showPopup(bike.flipsEvent + (bike.flipsEvent > 1 ? ' FLIPS!' : ' FLIP!'));
      }
      if (bike.crashed) break;
    }
    if (bike.crashed) {
      crashT += dt;
      if (crashT > 1.4) respawn(false);
    } else {
      const cp = Math.floor(bike.x / 100) * 100;
      if (cp > checkpoint) { checkpoint = cp; showPopup('Checkpoint ' + cp + ' m'); }
      if (bike.x > best) {
        best = bike.x;
        try { localStorage.setItem('mx-best', String(best)); } catch (e) {}
      }
    }
    if (popupT > 0) popupT -= dt;
    updateAudio(inp);

    // camera
    const tx = bike.x + clamp(bike.vx * 0.35, -2, 10);
    camX += (tx - camX) * Math.min(1, dt * 5);
    camY += (bike.y - camY) * Math.min(1, dt * 3);
    draw();
    requestAnimationFrame(frame);
  }

  // ---- rendering ----
  function draw() {
    const S = Math.max(24, Math.min(46, H / 17)); // pixels per metre
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const horizon = H * 0.62;
    const wx = (x) => W / 2 + (x - camX) * S;
    const wy = (y) => horizon - (y - camY) * S;

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#4aa3df'); g.addColorStop(0.6, '#bfe3f5'); g.addColorStop(1, '#f2e6c8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // sun
    ctx.fillStyle = 'rgba(255,244,200,0.9)';
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.18, 34, 0, 7); ctx.fill();

    // parallax hills
    parallax(0.15, '#8fb7c9', 0.45, 0.012, 90);
    parallax(0.3, '#6fa08a', 0.55, 0.02, 60);
    function parallax(f, col, base, freq, amp) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
      for (let px = 0; px <= W; px += 8) {
        const x = px + camX * S * f;
        const y = H * base + Math.sin(x * freq) * amp * 0.4 + Math.sin(x * freq * 2.3 + 1) * amp * 0.25 - camY * S * f * 0.3;
        ctx.lineTo(px, y);
      }
      ctx.lineTo(W, H); ctx.fill();
    }

    // terrain
    ctx.beginPath(); ctx.moveTo(0, H + 10);
    const pts = [];
    for (let px = 0; px <= W + 4; px += 4) {
      const x = camX + (px - W / 2) / S;
      pts.push([px, wy(terrain.height(x))]);
    }
    pts.forEach((p) => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(W + 4, H + 10); ctx.closePath();
    const dg = ctx.createLinearGradient(0, horizon - 200, 0, H);
    dg.addColorStop(0, '#9a6a3a'); dg.addColorStop(1, '#5a3b20');
    ctx.fillStyle = dg; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = '#5da03a'; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = '#7cc04c'; ctx.lineWidth = 2.5; ctx.stroke();

    // checkpoint flags every 100 m
    const first = Math.ceil((camX - W / 2 / S) / 100) * 100;
    for (let x = Math.max(100, first); x < camX + W / 2 / S + 100; x += 100) {
      const px = wx(x), py = wy(terrain.height(x));
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 70); ctx.stroke();
      ctx.fillStyle = x <= checkpoint ? '#3ddc84' : '#ffd23f';
      ctx.fillRect(px, py - 70, 34, 20);
      ctx.fillStyle = '#222'; ctx.font = 'bold 11px system-ui'; ctx.fillText(x + 'm', px + 3, py - 55);
    }

    drawBike(wx(bike.x), wy(bike.y), S);

    // HUD
    const speed = Math.hypot(bike.vx, bike.vy) * 3.6;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(12, 12, 210, 76);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px system-ui';
    ctx.fillText(Math.round(speed) + ' km/h', 22, 42);
    ctx.font = '14px system-ui';
    ctx.fillText('Distance ' + Math.max(0, Math.round(bike.x)) + ' m   Best ' + Math.round(best) + ' m', 22, 64);
    ctx.fillText('Flips ' + flipsTotal + '   Checkpoint ' + checkpoint + ' m', 22, 82);
    if (popupT > 0) {
      ctx.globalAlpha = Math.min(1, popupT);
      ctx.font = 'bold 40px system-ui'; ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText(popup, W / 2, H * 0.22);
      ctx.fillStyle = '#ffd23f'; ctx.fillText(popup, W / 2, H * 0.22);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    if (bike.crashed) {
      ctx.font = 'bold 44px system-ui'; ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText('WIPEOUT!', W / 2, H * 0.4);
      ctx.fillStyle = '#ff5a4a'; ctx.fillText('WIPEOUT!', W / 2, H * 0.4);
      ctx.textAlign = 'left';
    }
  }

  function drawBike(sx, sy, S) {
    ctx.save();
    ctx.translate(sx, sy); ctx.scale(S, -S); ctx.rotate(bike.a);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (pts, col, w) => {
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
    };
    const poly = (pts, col) => {
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    // wheels
    [[-WHEEL_X, 0], [WHEEL_X, 1]].forEach(([wx_, i]) => {
      ctx.save(); ctx.translate(wx_, WHEEL_Y); ctx.rotate(-bike.wheelAngle[i]);
      ctx.beginPath(); ctx.arc(0, 0, WHEEL_R, 0, 7); ctx.strokeStyle = '#161616'; ctx.lineWidth = 0.11; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, WHEEL_R - 0.08, 0, 7); ctx.strokeStyle = '#c9ced4'; ctx.lineWidth = 0.03; ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        line([[0, 0], [Math.cos(a) * (WHEEL_R - 0.08), Math.sin(a) * (WHEEL_R - 0.08)]], '#9aa0a8', 0.015);
      }
      ctx.beginPath(); ctx.arc(0, 0, 0.05, 0, 7); ctx.fillStyle = '#444'; ctx.fill();
      ctx.restore();
    });
    // swingarm, fork, exhaust
    line([[-WHEEL_X, WHEEL_Y], [-0.15, -0.08]], '#888', 0.07);
    line([[WHEEL_X, WHEEL_Y], [0.5, 0.52]], '#d8d8d8', 0.07);
    line([[0.05, -0.15], [-0.85, 0.12]], '#b0b0b0', 0.08);
    // engine + frame + tank + seat
    ctx.beginPath(); ctx.arc(0.1, -0.08, 0.22, 0, 7); ctx.fillStyle = '#555'; ctx.fill();
    poly([[-0.25, 0], [0.45, 0.05], [0.55, 0.5], [0.1, 0.56], [-0.35, 0.36]], '#ff6a1a');
    poly([[-0.75, 0.34], [-0.05, 0.42], [-0.05, 0.5], [-0.75, 0.42]], '#1b1b1b');
    poly([[0.55, 0.18], [0.95, 0.12], [0.95, 0.2], [0.58, 0.28]], '#ff6a1a'); // front fender
    // handlebar
    line([[0.5, 0.52], [0.42, 0.78], [0.28, 0.8]], '#222', 0.06);
    // rider
    const lean = clamp(bike.w * 0.0, -0.2, 0.2);
    line([[0.05, -0.12], [0.3, 0.38], [-0.1, 0.55]], '#1d3b8f', 0.14); // leg
    line([[-0.1, 0.55], [0.12, 1.0]], '#e8e8e8', 0.2); // torso
    line([[0.12, 1.0], [0.4, 0.82], [0.32, 0.8]], '#e8e8e8', 0.09); // arm
    ctx.beginPath(); ctx.arc(0.2 + lean, 1.15, 0.17, 0, 7); ctx.fillStyle = '#d6222b'; ctx.fill();
    line([[0.3, 1.17], [0.4, 1.13]], '#222', 0.06); // visor
    ctx.restore();
  }

  requestAnimationFrame(frame);
})();
