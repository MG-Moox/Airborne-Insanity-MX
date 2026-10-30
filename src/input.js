// input.js - keyboard (rebindable), gamepad, touch and tilt -> bike controls.
// Separate front/rear brakes and rider weight shift like a sim. Bindings + feel settings persist in localStorage.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// id, label, default keys (two slots). Held actions first, then one-shot actions.
export const ACTIONS = [
  { id: 'throttle', label: 'Throttle', def: ['KeyW', 'ArrowUp'] },
  { id: 'brake', label: 'Brakes (front + rear)', def: ['KeyS', 'ArrowDown'] },
  { id: 'left', label: 'Steer left', def: ['KeyA', 'ArrowLeft'] },
  { id: 'right', label: 'Steer right', def: ['KeyD', 'ArrowRight'] },
  { id: 'rearBrake', label: 'Rear brake only', def: ['Space', ''] },
  { id: 'frontBrake', label: 'Front brake only', def: ['KeyB', ''] },
  { id: 'leanBack', label: 'Lean back (wheelie / nose up)', def: ['ShiftLeft', 'KeyZ'] },
  { id: 'leanFwd', label: 'Lean forward (nose down)', def: ['KeyX', ''] },
  { id: 'leanLeft', label: 'Lean left (whip / tilt)', def: ['KeyQ', ''] },
  { id: 'leanRight', label: 'Lean right (whip / tilt)', def: ['KeyE', ''] },
  { id: 'camera', label: 'Change camera', def: ['KeyC', ''], once: true },
  { id: 'map', label: 'Map and fast travel', def: ['KeyM', ''], once: true },
  { id: 'respawn', label: 'Respawn', def: ['KeyR', ''], once: true },
  { id: 'resetLap', label: 'Reset lap timer', def: ['KeyL', ''], once: true },
  { id: 'mute', label: 'Mute sound', def: ['KeyN', ''], once: true },
  { id: 'pause', label: 'Pause / menu', def: ['KeyP', ''], once: true },
];

export const DEFAULT_SETTINGS = {
  steerSens: 1, leanSens: 1, response: 1, assist: 1, invertLean: false,       // feel
  touch: 'auto', touchScale: 1, touchOpacity: 0.85, tilt: false, tiltInvert: false, // touch
};

export const keyName = (c) => {
  if (!c) return '-';
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  const map = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=' };
  return map[c] || c.replace('Numpad', 'Num ');
};

const load = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (_) { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

export class Input {
  constructor(canvas, handlers) {
    this.k = {}; this.h = handlers;
    this.axis = { throttle: 0, brakeF: 0, brakeR: 0, steer: 0, pitch: 0, roll: 0 };
    // touch state written by the touch overlay (controlsUI.js)
    this.touch = { gas: false, brake: false, rear: false, front: false, sx: 0, sy: 0, active: false };
    this.tilt = 0; this.tiltOn = false;
    this.speed = 0;                 // m/s, set by main for steering assist
    this.drag = null; this.pad = null; this.prevPad = {};
    this.capture = null;            // function(code) while the editor waits for a key
    this.blocked = false;           // true while a modal (controls editor) is open
    this.onChange = null;
    this.settings = { ...DEFAULT_SETTINGS, ...load('aimx-ctl', {}) };
    this.binds = {};
    const saved = load('aimx-binds', {});
    for (const a of ACTIONS) this.binds[a.id] = Array.isArray(saved[a.id]) && saved[a.id].length === 2 ? saved[a.id].slice() : a.def.slice();
    this._index();

    const down = (e) => {
      if (this.capture) { e.preventDefault(); if (!e.repeat) this.capture(e.code); return; }
      if (this.blocked) return;
      if (e.repeat) { if (this._isGame(e.code)) e.preventDefault(); return; }
      this.k[e.code] = true;
      if (this._isGame(e.code)) e.preventDefault();
      const H = this.h, act = this.byKey[e.code];
      if (e.code === 'Escape') { H.pause && H.pause(); return; }
      if (act) {
        for (const id of act) {
          switch (id) {
            case 'camera': H.camera && H.camera(); break;
            case 'map': H.map && H.map(); break;
            case 'respawn': H.respawn && H.respawn(); break;
            case 'resetLap': H.resetLap && H.resetLap(); break;
            case 'mute': H.mute && H.mute(); break;
            case 'pause': H.pause && H.pause(); break;
          }
        }
      }
      if (e.code === 'KeyH') H.help && H.help();
      if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5), 10); if (n >= 1 && n <= 8) H.teleport && H.teleport(n - 1); }
    };
    addEventListener('keydown', down);
    addEventListener('keyup', (e) => { this.k[e.code] = false; });
    addEventListener('blur', () => { this.k = {}; });
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && this.touch.active) { /* camera look with a finger */ } this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
    canvas.addEventListener('pointermove', (e) => { if (this.drag && e.pointerId === this.drag.id) { handlers.look && handlers.look(e.clientX - this.drag.x, e.clientY - this.drag.y); this.drag.x = e.clientX; this.drag.y = e.clientY; } });
    const up = (e) => { if (this.drag && e.pointerId === this.drag.id) this.drag = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); handlers.zoom && handlers.zoom(e.deltaY); }, { passive: false });
    addEventListener('deviceorientation', (e) => {
      if (!this.settings.tilt) return;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      const v = ang === 90 ? e.beta : ang === 270 || ang === -90 ? -e.beta : e.gamma;
      if (v == null) return;
      if (this.tiltRef == null) this.tiltRef = v;
      this.tilt = clamp((v - this.tiltRef) / 22, -1, 1) * (this.settings.tiltInvert ? -1 : 1);
    });
  }

  _index() {
    this.byKey = {}; this.heldKeys = new Set();
    for (const a of ACTIONS) for (const c of this.binds[a.id]) { if (!c) continue; (this.byKey[c] = this.byKey[c] || []).push(a.id); if (!a.once) this.heldKeys.add(c); }
  }
  _isGame(c) { return this.heldKeys.has(c) || /^(Arrow|Space|Tab)/.test(c) || c === 'Escape'; }
  _down(id) { const b = this.binds[id]; return !!((b[0] && this.k[b[0]]) || (b[1] && this.k[b[1]])); }

  // ---- editor API
  save() { save('aimx-binds', this.binds); save('aimx-ctl', this.settings); this._index(); if (this.onChange) this.onChange(); }
  setBinding(id, slot, code) {
    if (code) for (const a of ACTIONS) { if (a.id === id) continue; const b = this.binds[a.id]; for (let s = 0; s < 2; s++) if (b[s] === code) b[s] = ''; }
    const own = this.binds[id]; if (code && own[1 - slot] === code) own[1 - slot] = '';
    own[slot] = code; this.save();
  }
  resetBindings() { for (const a of ACTIONS) this.binds[a.id] = a.def.slice(); this.save(); }
  resetSettings() { this.settings = { ...DEFAULT_SETTINGS }; this.tiltRef = null; this.save(); }
  set(key, v) { this.settings[key] = v; if (key === 'tilt') this.tiltRef = null; this.save(); }
  calibrateTilt() { this.tiltRef = null; }
  get touchVisible() { const t = this.settings.touch; return t === 'on' || (t === 'auto' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)); }

  // smooth a keyboard-style target toward a value; rise/fall in 1/s
  _ramp(key, target, dt, rise, fall) {
    const a = this.axis, cur = a[key];
    const rate = Math.abs(target) > Math.abs(cur) || Math.sign(target) !== Math.sign(cur) ? rise : fall;
    a[key] = cur + clamp(target - cur, -rate * dt, rate * dt);
  }

  poll(dt) {
    const t = this.touch, H = this.h, S = this.settings, d = (id) => this._down(id);
    const gp = (navigator.getGamepads && navigator.getGamepads()[0]) || null;
    let thr = d('throttle') || t.gas ? 1 : 0;
    let brF = 0, brR = 0;
    if (d('brake') || t.brake) { brF = 0.85; brR = 0.55; }          // front-biased like a real bike: the rear locks far less easily
    if (d('rearBrake') || t.rear) brR = 1;
    if (d('frontBrake') || t.front) brF = 1;
    let steer = (d('right') ? 1 : 0) - (d('left') ? 1 : 0);
    let pitch = (d('leanBack') ? 1 : 0) - (d('leanFwd') ? 1 : 0);          // + = lean back / nose up
    let roll = (d('leanRight') ? 1 : 0) - (d('leanLeft') ? 1 : 0);
    if (t.active) { steer += t.sx; pitch += t.sy; }                          // analog touch stick (up = lean forward)
    if (S.tilt && this.tilt) steer += this.tilt;
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      thr = Math.max(thr, gp.buttons[7] ? gp.buttons[7].value : 0);
      brF = Math.max(brF, gp.buttons[6] ? gp.buttons[6].value : 0);
      brR = Math.max(brR, gp.buttons[5] && gp.buttons[5].pressed ? 1 : 0, gp.buttons[2] && gp.buttons[2].pressed ? 1 : 0);
      steer += dz(gp.axes[0]);
      pitch -= dz(gp.axes[3]); roll += dz(gp.axes[2]);
      const edge = (i, fn) => { const p = gp.buttons[i] && gp.buttons[i].pressed; if (p && !this.prevPad[i] && fn) fn(); this.prevPad[i] = p; };
      edge(0, H.respawn); edge(3, H.camera); edge(8, H.map); edge(9, H.pause);
    }
    // feel: sensitivity, speed-sensitive steering assist, lean inversion
    const assistK = 1 / (1 + S.assist * 0.016 * this.speed);
    steer = clamp(steer * S.steerSens * (S.assist > 0 ? assistK : 1), -1, 1);
    pitch = clamp(pitch * S.leanSens * (S.invertLean ? -1 : 1), -1, 1);
    roll = clamp(roll * S.leanSens, -1, 1);
    const r = S.response;
    this._ramp('throttle', thr, dt, 7 * r, 9 * r);
    this._ramp('brakeF', brF, dt, 8 * r, 14 * r);
    this._ramp('brakeR', brR, dt, 8 * r, 14 * r);
    this._ramp('steer', steer, dt, gp || t.active || S.tilt ? 30 : 5.5 * r, gp || t.active || S.tilt ? 30 : 9 * r);
    this._ramp('pitch', pitch, dt, 6 * r, 8 * r);
    this._ramp('roll', roll, dt, 6 * r, 8 * r);
    const a = this.axis;
    return { throttle: a.throttle, brakeF: a.brakeF, brakeR: a.brakeR, steer: a.steer, pitch: a.pitch, roll: a.roll || a.steer * 0.6, yaw: a.steer * 0.8 };
  }
}
