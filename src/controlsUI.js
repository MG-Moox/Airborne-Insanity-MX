// controlsUI.js - controls editor panel (rebind keys, handling feel, touch options) + on-screen touch controls with a layout editor.
import { ACTIONS, keyName, DEFAULT_SETTINGS } from './input.js';

const CSS = `
#ctl { z-index: 8; }
.ctlcard { max-width: 700px; text-align: left; }
.ctlcard h2 { margin: 0 0 10px; font-style: italic; letter-spacing: 1px; }
.tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.tabs button { background: rgba(255,255,255,.1); color: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 8px 14px; font-weight: 800; cursor: pointer; }
.tabs button.on { background: var(--lime); color: #101808; }
.krow { display: grid; grid-template-columns: 1fr 92px 92px; gap: 8px; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.07); font-size: 14px; }
.kbtn { background: rgba(255,255,255,.12); color: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 7px 4px; font-weight: 800; cursor: pointer; text-align: center; font-size: 13px; }
.kbtn.wait { background: var(--lime); color: #101808; }
.srow { display: grid; grid-template-columns: 1fr 190px 46px; gap: 10px; align-items: center; padding: 7px 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,.07); }
.srow input[type=range] { width: 100%; accent-color: #a8ff45; }
.srow select { background: #18222d; color: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 6px; grid-column: span 2; }
.srow .v { text-align: right; font-variant-numeric: tabular-nums; color: var(--lime); font-weight: 800; }
.note { color: #b9c4ce; font-size: 12px; margin: 10px 0 0; line-height: 1.45; }
.ctlrow { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; flex-wrap: wrap; }
#touch { position: fixed; inset: 0; z-index: 3; pointer-events: none; display: none; }
#touch.show { display: block; }
body.editing .overlay:not(#tedit-wrap) { display: none !important; }
body.editing #hud { display: none; }
body.editing #touch { z-index: 9; display: block; background: rgba(5,9,13,.55); }
.tc { position: absolute; pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; display: grid; place-items: center; border-radius: 50%;
  width: var(--s); height: var(--s); transform: translate(-50%, -50%); font-weight: 900; font-size: calc(var(--s) * .17); letter-spacing: 1px; color: #fff; text-align: center; line-height: 1.05;
  background: rgba(10,16,22,.55); border: 2px solid rgba(255,255,255,.55); backdrop-filter: blur(3px); }
.tc.on { background: rgba(168,255,69,.75); color: #111; border-color: #fff; }
.tc.gas { background: rgba(168,255,69,.35); border-color: #a8ff45; }
.tc.brk { background: rgba(255,90,74,.3); border-color: #ff6a4a; }
.tc.gas.on { background: rgba(168,255,69,.85); } .tc.brk.on { background: rgba(255,106,74,.85); color: #fff; }
.tc.stick .knob { position: absolute; width: 42%; height: 42%; border-radius: 50%; background: rgba(255,255,255,.75); border: 2px solid #fff; left: 29%; top: 29%; box-shadow: 0 2px 10px #0008; }
.tc.stick::before { content: ''; position: absolute; inset: 12%; border-radius: 50%; border: 1px dashed rgba(255,255,255,.35); }
.tc.stick .hint { position: absolute; font-size: 10px; opacity: .8; font-weight: 700; }
body.editing .tc { outline: 3px dashed #a8ff45; cursor: move; }
#tedit-wrap { position: fixed; left: 0; right: 0; top: 10px; z-index: 10; display: none; justify-content: center; pointer-events: none; }
body.editing #tedit-wrap { display: flex; }
#tedit { pointer-events: auto; padding: 10px 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center; font-size: 13px; }
body.touch-on #speedo { bottom: 8px; top: auto; left: 50%; right: auto; transform: translateX(-50%) scale(.66); transform-origin: bottom center; }
body.touch-on #stats { transform: scale(.72); transform-origin: top left; }
body.touch-on #lap { transform: scale(.72); transform-origin: top right; }
body.touch-on #mini { bottom: auto; top: 112px; left: 10px; width: 92px; height: 92px; }
body.touch-on #camname { display: none; }
`;

// id, label, kind, default centre (% of viewport), base size px, press action
const ITEMS = [
  { id: 'stick', label: '', kind: 'stick', x: 14, y: 73, s: 160 },
  { id: 'gas', label: 'GAS', kind: 'hold', cls: 'gas', key: 'gas', x: 90, y: 70, s: 112 },
  { id: 'brake', label: 'BRAKE', kind: 'hold', cls: 'brk', key: 'brake', x: 76, y: 82, s: 88 },
  { id: 'rear', label: 'REAR\nBRAKE', kind: 'hold', cls: 'brk', key: 'rear', x: 93, y: 40, s: 60 },
  { id: 'front', label: 'FRONT\nBRAKE', kind: 'hold', cls: 'brk', key: 'front', x: 66, y: 78, s: 60 },
  { id: 'cam', label: 'CAM', kind: 'tap', fn: 'camera', x: 38, y: 8, s: 48 },
  { id: 'respawn', label: 'RESET', kind: 'tap', fn: 'respawn', x: 46, y: 8, s: 48 },
  { id: 'map', label: 'MAP', kind: 'tap', fn: 'map', x: 54, y: 8, s: 48 },
  { id: 'pause', label: 'MENU', kind: 'tap', fn: 'pause', x: 62, y: 8, s: 48 },
];

const load = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (_) { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function initControls(input, hooks = {}) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  let layout = load('aimx-touchlayout', {});
  let active = false, editing = false;

  // ------------------------------------------------------------------ touch overlay
  const touch = el('div'); touch.id = 'touch'; document.body.appendChild(touch);
  const nodes = {};
  const pos = (it) => layout[it.id] || { x: it.x, y: it.y };
  function place() {
    const S = input.settings;
    touch.style.opacity = editing ? 1 : S.touchOpacity;
    for (const it of ITEMS) {
      const n = nodes[it.id], p = pos(it);
      n.style.setProperty('--s', Math.round(it.s * S.touchScale) + 'px');
      n.style.left = p.x + '%'; n.style.top = p.y + '%';
    }
  }
  for (const it of ITEMS) {
    const n = el('div', 'tc ' + (it.kind === 'stick' ? 'stick' : '') + ' ' + (it.cls || ''), it.kind === 'stick' ? '<div class="knob"></div>' : it.label.replace('\n', '<br>'));
    nodes[it.id] = n; touch.appendChild(n);
    let ptr = null;
    const startDrag = (e) => { ptr = { id: e.pointerId, ox: e.clientX, oy: e.clientY, p0: { ...pos(it) } }; try { n.setPointerCapture(e.pointerId); } catch (_) {} };
    n.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (editing) { startDrag(e); return; }
      ptr = { id: e.pointerId };
      try { n.setPointerCapture(e.pointerId); } catch (_) {}
      if (it.kind === 'hold') { input.touch[it.key] = true; n.classList.add('on'); }
      else if (it.kind === 'tap') { n.classList.add('on'); hooks[it.fn] && hooks[it.fn](); }
      else if (it.kind === 'stick') { input.touch.active = true; moveStick(e); }
    });
    const moveStick = (e) => {
      const r = n.getBoundingClientRect(), R = r.width / 2, cx = r.left + R, cy = r.top + R;
      let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R;
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      const dz = (v) => (Math.abs(v) < 0.1 ? 0 : (v - Math.sign(v) * 0.1) / 0.9);
      const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.25);        // finer control near the centre
      input.touch.sx = curve(dz(dx)); input.touch.sy = curve(dz(dy));
      const k = n.querySelector('.knob'); k.style.transform = `translate(${dx * R * 0.58}px, ${dy * R * 0.58}px)`;
    };
    n.addEventListener('pointermove', (e) => {
      if (!ptr || e.pointerId !== ptr.id) return;
      if (editing) {
        const W = innerWidth, H = innerHeight;
        layout[it.id] = { x: Math.max(4, Math.min(96, ptr.p0.x + ((e.clientX - ptr.ox) / W) * 100)), y: Math.max(4, Math.min(96, ptr.p0.y + ((e.clientY - ptr.oy) / H) * 100)) };
        place();
      } else if (it.kind === 'stick') moveStick(e);
    });
    const end = (e) => {
      if (!ptr || e.pointerId !== ptr.id) return; ptr = null;
      if (editing) { save('aimx-touchlayout', layout); return; }
      n.classList.remove('on');
      if (it.kind === 'hold') input.touch[it.key] = false;
      if (it.kind === 'stick') { input.touch.active = false; input.touch.sx = 0; input.touch.sy = 0; n.querySelector('.knob').style.transform = ''; }
    };
    n.addEventListener('pointerup', end); n.addEventListener('pointercancel', end);
    n.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  place();
  addEventListener('resize', place);

  const releaseAll = () => { Object.assign(input.touch, { gas: false, brake: false, rear: false, front: false, sx: 0, sy: 0, active: false }); for (const n of Object.values(nodes)) n.classList.remove('on'); };
  function setActive(v) {                       // called by main: true while actually riding
    active = v && input.touchVisible;
    touch.classList.toggle('show', active);
    document.body.classList.toggle('touch-on', active);
    if (!active) releaseAll();
  }

  // layout editor
  const wrap = el('div'); wrap.id = 'tedit-wrap';
  const bar = el('div', 'glass'); bar.id = 'tedit';
  bar.innerHTML = '<b>EDIT TOUCH LAYOUT</b> <span>drag buttons to move them</span> <label>Size <input id="te-s" type="range" min="0.7" max="1.5" step="0.05" style="vertical-align:middle"></label> <label>Opacity <input id="te-o" type="range" min="0.3" max="1" step="0.05" style="vertical-align:middle"></label> <button class="btn alt" id="te-r">RESET</button> <button class="go" id="te-d" style="margin:0;padding:8px 18px">DONE</button>';
  wrap.appendChild(bar); document.body.appendChild(wrap);
  const startEdit = () => {
    editing = true; panel.classList.add('hide'); document.body.classList.add('editing'); releaseAll();
    bar.querySelector('#te-s').value = input.settings.touchScale; bar.querySelector('#te-o').value = input.settings.touchOpacity; place();
  };
  const stopEdit = () => { editing = false; document.body.classList.remove('editing'); panel.classList.remove('hide'); place(); render(); };
  bar.querySelector('#te-s').oninput = (e) => { input.set('touchScale', +e.target.value); place(); };
  bar.querySelector('#te-o').oninput = (e) => { input.set('touchOpacity', +e.target.value); place(); };
  bar.querySelector('#te-r').onclick = () => { layout = {}; save('aimx-touchlayout', layout); place(); };
  bar.querySelector('#te-d').onclick = stopEdit;

  // ------------------------------------------------------------------ controls panel
  const panel = el('div', 'overlay hide'); panel.id = 'ctl';
  panel.innerHTML = '<div class="card glass ctlcard"><h2>CONTROLS</h2><div class="tabs" id="ctl-tabs"></div><div id="ctl-body"></div><div class="ctlrow"><button class="btn alt" id="ctl-reset">RESET THIS TAB</button><button class="go" id="ctl-close">DONE</button></div></div>';
  document.body.appendChild(panel);
  const body = panel.querySelector('#ctl-body'), tabs = panel.querySelector('#ctl-tabs');
  let tab = 'kb';
  const TABS = [['kb', 'KEYBOARD'], ['feel', 'HANDLING FEEL'], ['touch', 'TOUCH / TILT']];
  tabs.innerHTML = TABS.map(([id, n]) => `<button data-t="${id}">${n}</button>`).join('');
  tabs.onclick = (e) => { const t = e.target.dataset && e.target.dataset.t; if (t) { cancelCapture(); tab = t; render(); } };

  let capBtn = null;
  function cancelCapture() { input.capture = null; if (capBtn) capBtn = null; }
  function renderKb() {
    body.innerHTML = '';
    for (const a of ACTIONS) {
      const row = el('div', 'krow'); row.appendChild(el('div', '', a.label));
      for (let s = 0; s < 2; s++) {
        const b = el('button', 'kbtn', keyName(input.binds[a.id][s]));
        b.onclick = () => {
          cancelCapture(); render(); const nb = body.querySelectorAll('.kbtn')[ACTIONS.indexOf(a) * 2 + s];
          nb.classList.add('wait'); nb.textContent = 'press key...'; capBtn = nb;
          input.capture = (code) => {
            input.capture = null; capBtn = null;
            if (code === 'Escape') { render(); return; }
            input.setBinding(a.id, s, code === 'Backspace' || code === 'Delete' ? '' : code); render();
          };
        };
        row.appendChild(b);
      }
      body.appendChild(row);
    }
    body.appendChild(el('p', 'note', 'Click a slot, then press the key you want (Backspace clears it, Esc cancels). A key can only do one thing, so reusing a key moves it. Fixed: <b>Esc</b> = menu, <b>1-8</b> = quick teleport, mouse drag = look around, wheel = zoom, gamepad works automatically.'));
  }
  const slider = (label, key, min, max, step, fmt = (v) => v.toFixed(2)) => {
    const r = el('div', 'srow'); r.appendChild(el('div', '', label));
    const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = input.settings[key];
    const v = el('div', 'v', fmt(+i.value)); i.oninput = () => { input.set(key, +i.value); v.textContent = fmt(+i.value); };
    r.appendChild(i); r.appendChild(v); body.appendChild(r);
  };
  const check = (label, key, cb) => {
    const r = el('div', 'srow'); r.appendChild(el('div', '', label));
    const i = el('input'); i.type = 'checkbox'; i.checked = !!input.settings[key]; i.style.cssText = 'width:22px;height:22px;accent-color:#a8ff45;justify-self:end;grid-column:span 2';
    i.onchange = async () => { if (cb) { const ok = await cb(i.checked); if (ok === false) { i.checked = false; input.set(key, false); return; } } input.set(key, i.checked); };
    r.appendChild(i); body.appendChild(r);
  };
  const select = (label, key, opts) => {
    const r = el('div', 'srow'); r.appendChild(el('div', '', label));
    const s = el('select'); opts.forEach(([v, n]) => { const o = el('option', '', n); o.value = v; s.appendChild(o); });
    s.value = String(input.settings[key]); s.onchange = () => { const raw = s.value; input.set(key, isNaN(+raw) ? raw : +raw); render(); };
    r.appendChild(s); body.appendChild(r);
  };
  function renderFeel() {
    body.innerHTML = '';
    slider('Steering sensitivity', 'steerSens', 0.5, 1.6, 0.05);
    slider('Lean / weight-shift sensitivity', 'leanSens', 0.5, 1.6, 0.05);
    slider('Control response (how fast inputs ramp)', 'response', 0.6, 1.8, 0.05);
    select('Steering assist at speed', 'assist', [[0, 'Off - full steering lock at any speed'], [1, 'Light (default)'], [2, 'Strong - best for beginners']]);
    check('Invert lean forward / back', 'invertLean');
    body.appendChild(el('p', 'note', 'Tip: if the bike feels twitchy at speed, lower sensitivity or raise assist. If it feels lazy, raise response. Everything here is saved on this device.'));
  }
  function renderTouch() {
    body.innerHTML = '';
    select('Show touch controls', 'touch', [['auto', 'Automatic (phones / tablets)'], ['on', 'Always on'], ['off', 'Off']]);
    slider('Button size', 'touchScale', 0.7, 1.5, 0.05, (v) => Math.round(v * 100) + '%');
    slider('Button opacity', 'touchOpacity', 0.3, 1, 0.05, (v) => Math.round(v * 100) + '%');
    check('Tilt steering (tilt the device like a handlebar)', 'tilt', async (on) => {
      if (on && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { return (await DeviceOrientationEvent.requestPermission()) === 'granted'; } catch (_) { return false; }
      }
      return true;
    });
    check('Invert tilt direction', 'tiltInvert');
    const r = el('div', 'ctlrow'); r.style.justifyContent = 'flex-start';
    const b1 = el('button', 'btn', 'EDIT BUTTON LAYOUT'); b1.onclick = startEdit;
    const b2 = el('button', 'btn alt', 'RE-CENTRE TILT'); b2.onclick = () => input.calibrateTilt();
    r.appendChild(b1); r.appendChild(b2); body.appendChild(r);
    body.appendChild(el('p', 'note', 'Left stick: steer (left / right) and shift your weight (up = lean forward, down = lean back for wheelies). Right side: GAS and BRAKE, plus separate front / rear brakes. Drag the screen to look around. Use "Always on" to preview the layout on a computer.'));
  }
  function render() {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    ({ kb: renderKb, feel: renderFeel, touch: renderTouch })[tab]();
    renderHints();
  }
  panel.querySelector('#ctl-reset').onclick = () => {
    if (tab === 'kb') input.resetBindings();
    else if (tab === 'feel') { const k = ['steerSens', 'leanSens', 'response', 'assist', 'invertLean']; k.forEach((x) => { input.settings[x] = DEFAULT_SETTINGS[x]; }); input.save(); }
    else { ['touch', 'touchScale', 'touchOpacity', 'tilt', 'tiltInvert'].forEach((x) => { input.settings[x] = DEFAULT_SETTINGS[x]; }); layout = {}; save('aimx-touchlayout', layout); input.save(); place(); }
    render();
  };
  const close = () => { cancelCapture(); panel.classList.add('hide'); input.blocked = false; hooks.closed && hooks.closed(); };
  panel.querySelector('#ctl-close').onclick = close;
  function open(t) { if (t) tab = t; input.blocked = true; panel.classList.remove('hide'); render(); }

  // quick-reference table on the menu screens
  function renderHints() {
    const t = document.getElementById('keytable'); if (!t) return;
    const k = (id) => input.binds[id].filter(Boolean).map((c) => `<kbd>${keyName(c)}</kbd>`).join(' ') || '<kbd>-</kbd>';
    const rows = [['throttle', 'brake', 'left'], ['right', 'leanBack', 'leanFwd'], ['camera', 'map', 'respawn']];
    const lab = { throttle: 'gas', brake: 'brake', left: 'left', right: 'right', leanBack: 'wheelie', leanFwd: 'lean fwd', camera: 'camera', map: 'map', respawn: 'respawn' };
    t.innerHTML = rows.map((r) => '<tr>' + r.map((id) => `<td>${k(id)} ${lab[id]}</td>`).join('') + '</tr>').join('');
  }
  input.onChange = () => { place(); renderHints(); };
  renderHints(); place();
  document.body.classList.toggle('touch-on', false);

  return { open, close, setActive, renderHints, get isOpen() { return !panel.classList.contains('hide'); } };
}
