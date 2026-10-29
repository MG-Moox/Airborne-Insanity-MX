// input.js - keyboard, gamepad and touch -> bike controls. Separate front/rear brakes and rider weight shift like a sim.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  constructor(canvas, handlers) {
    this.k = {}; this.h = handlers;
    this.axis = { throttle: 0, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0 };
    this.touch = { gas: false, brake: false, left: false, right: false, fwd: false, back: false };
    this.drag = null;
    this.pad = null;
    const down = (e) => {
      if (e.repeat) { if (this._isGame(e.code)) e.preventDefault(); return; }
      this.k[e.code] = true;
      if (this._isGame(e.code)) e.preventDefault();
      const H = this.h;
      switch (e.code) {
        case 'KeyC': H.camera && H.camera(); break;
        case 'KeyM': H.map && H.map(); break;
        case 'KeyR': H.respawn && H.respawn(); break;
        case 'KeyH': H.help && H.help(); break;
        case 'KeyN': H.mute && H.mute(); break;
        case 'KeyF': H.race && H.race(); break;
        case 'KeyL': H.resetLap && H.resetLap(); break;
        case 'KeyP': case 'Escape': H.pause && H.pause(); break;
        default:
          if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5), 10); if (n >= 1 && n <= 8) H.teleport && H.teleport(n - 1); }
      }
    };
    addEventListener('keydown', down);
    addEventListener('keyup', (e) => { this.k[e.code] = false; });
    addEventListener('blur', () => { this.k = {}; });
    canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
    canvas.addEventListener('pointermove', (e) => { if (this.drag && e.pointerId === this.drag.id) { handlers.look && handlers.look(e.clientX - this.drag.x, e.clientY - this.drag.y); this.drag.x = e.clientX; this.drag.y = e.clientY; } });
    const up = (e) => { if (this.drag && e.pointerId === this.drag.id) this.drag = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); handlers.zoom && handlers.zoom(e.deltaY); }, { passive: false });
    document.querySelectorAll('[data-btn]').forEach((el) => {
      const key = el.dataset.btn;
      const on = (e) => { e.preventDefault(); this.touch[key] = true; el.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.touch[key] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, off));
    });
    this.prevPad = {};
  }
  _isGame(c) { return /^(Arrow|Space|Key[WASDQEBFRCMNHL]|Shift|Tab)/.test(c); }

  // smooth a keyboard-style target toward a value; rise/fall in 1/s
  _ramp(key, target, dt, rise, fall) {
    const a = this.axis, cur = a[key];
    const rate = Math.abs(target) > Math.abs(cur) || Math.sign(target) !== Math.sign(cur) ? rise : fall;
    a[key] = cur + clamp(target - cur, -rate * dt, rate * dt);
  }

  poll(dt) {
    const k = this.k, t = this.touch, H = this.h;
    const gp = (navigator.getGamepads && navigator.getGamepads()[0]) || null;
    let thr = (k.KeyW || k.ArrowUp && false || t.gas) ? 1 : 0;
    let brF = 0, brR = 0;
    if (k.KeyS || t.brake) { brF = 0.75; brR = 0.9; }
    if (k.Space) brR = 1;
    if (k.KeyB) brF = 1;
    let steer = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + (t.right ? 1 : 0) - (t.left ? 1 : 0);
    let pitch = (k.ArrowDown || t.back ? 1 : 0) - (k.ArrowUp || t.fwd ? 1 : 0);   // + = lean back / nose up
    let roll = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
    if (k.KeyQ) roll -= 1; if (k.KeyE) roll += 1;
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      thr = Math.max(thr, gp.buttons[7] ? gp.buttons[7].value : 0);
      brF = Math.max(brF, gp.buttons[6] ? gp.buttons[6].value : 0);
      brR = Math.max(brR, gp.buttons[5] && gp.buttons[5].pressed ? 1 : 0, gp.buttons[2] && gp.buttons[2].pressed ? 1 : 0);
      steer += dz(gp.axes[0]);
      pitch -= dz(gp.axes[3]); roll += dz(gp.axes[2]) * 0.0;
      const edge = (i, fn) => { const p = gp.buttons[i] && gp.buttons[i].pressed; if (p && !this.prevPad[i] && fn) fn(); this.prevPad[i] = p; };
      edge(0, H.respawn); edge(3, H.camera); edge(8, H.map); edge(9, H.pause); edge(4, H.race);
    }
    steer = clamp(steer, -1, 1);
    // throttle/brake ramps feel like analogue controls; steering eases in and recentres quicker
    this._ramp('throttle', thr, dt, 7, 9);
    this._ramp('brakeF', brF, dt, 8, 14);
    this._ramp('brakeR', brR, dt, 8, 14);
    this._ramp('steer', steer, dt, gp ? 30 : 5.5, gp ? 30 : 9);
    this._ramp('pitch', clamp(pitch, -1, 1), dt, 6, 8);
    this._ramp('roll', clamp(roll, -1, 1), dt, 6, 8);
    const a = this.axis;
    return { throttle: a.throttle, brakeF: a.brakeF, brakeR: a.brakeR, steer: a.steer, pitch: a.pitch, roll: a.roll || a.steer * 0.6, yaw: a.steer * 0.8 };
  }
}
