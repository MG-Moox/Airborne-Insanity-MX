// garage.js - bike classes, customisation and the garage panel. Every choice changes the physics (P) and/or the model + engine sound.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// M = bike + rider mass (kg). 250 2-stroke equals the original tuning the physics tests were written against.
export const CLASSES = [
  { id: '125-2t', name: '125 2-STROKE', blurb: 'Light and flickable. Revs out quickly but runs out of steam at the top.', M: 184, POWER: 17500, FE: 2300, VTOP: 39, I: 0.93, four: false, audio: { pitch: 1.45, wave: 'sawtooth' } },
  { id: '250-2t', name: '250 2-STROKE', blurb: 'Snappy powerband and a great all-rounder. The classic.', M: 200, POWER: 26000, FE: 2900, VTOP: 46, I: 1, four: false, audio: { pitch: 1.18, wave: 'sawtooth' } },
  { id: '250-4t', name: '250 4-STROKE', blurb: 'Smooth, predictable power with a deeper note.', M: 205, POWER: 24500, FE: 2750, VTOP: 44, I: 1.02, four: true, audio: { pitch: 0.9, wave: 'square' } },
  { id: '450-4t', name: '450 4-STROKE', blurb: 'Huge torque and the highest top speed. Heavy and a handful in the air.', M: 210, POWER: 31000, FE: 3250, VTOP: 49, I: 1.05, four: true, audio: { pitch: 0.72, wave: 'square' } },
];
export const COLOURS = [['LIME', [0.52, 0.93, 0.12]], ['ORANGE', [0.98, 0.46, 0.06]], ['RED', [0.88, 0.1, 0.12]], ['BLUE', [0.1, 0.38, 0.95]], ['YELLOW', [0.98, 0.84, 0.08]],
  ['TEAL', [0.05, 0.7, 0.7]], ['PURPLE', [0.55, 0.25, 0.9]], ['PINK', [0.95, 0.35, 0.65]], ['WHITE', [0.92, 0.92, 0.95]], ['BLACK', [0.1, 0.1, 0.12]]];
export const GEAR_COLOURS = [['BLACK', [0.07, 0.08, 0.09]], ['WHITE', [0.9, 0.9, 0.93]], ['RED', [0.8, 0.1, 0.12]], ['BLUE', [0.1, 0.3, 0.85]], ['LIME', [0.45, 0.85, 0.1]], ['ORANGE', [0.95, 0.45, 0.05]], ['PURPLE', [0.5, 0.22, 0.8]], ['TEAL', [0.05, 0.6, 0.62]]];
export const PLATES = [['WHITE', [0.93, 0.93, 0.95]], ['YELLOW', [0.98, 0.85, 0.1]], ['BLACK', [0.08, 0.08, 0.09]], ['RED', [0.85, 0.12, 0.12]]];
export const SUSP = [['SOFT', { k: 0.88, c: 0.85 }, 'Plush over chop, more bottoming on big landings'], ['STANDARD', { k: 1, c: 1 }, 'Balanced for everything'], ['STIFF', { k: 1.15, c: 1.2 }, 'Holds up on big jumps, harsher over bumps']];
export const GEARING = [['ACCELERATION', { fe: 1.12, vt: 0.9 }, 'Short gearing: more punch, lower top speed'], ['BALANCED', { fe: 1, vt: 1 }, 'Stock gearing'], ['TOP SPEED', { fe: 0.9, vt: 1.1 }, 'Tall gearing: slower off the line, higher top speed']];
export const TYRES = [['SOFT TERRAIN', 1.07, 'Most grip on loose dirt'], ['INTERMEDIATE', 1, 'All-rounder'], ['HARD PACK', 0.94, 'Less grip, lower rolling drag feel']];
export const DEFAULT_SETUP = { cls: '250-2t', colour: 0, gear: 0, plate: 0, susp: 1, gearing: 1, tyre: 1 };

const BASE = { K: 7000, CC: 1000, CR: 1600, MU: 1.0, I: [65, 45, 30] };   // original values from physics.js
export const classOf = (s) => CLASSES.find((c) => c.id === s.cls) || CLASSES[1];

export function loadSetup() {
  try { const v = JSON.parse(localStorage.getItem('aimx-garage')); if (v && typeof v === 'object') return { ...DEFAULT_SETUP, ...v }; } catch (_) {}
  return { ...DEFAULT_SETUP };
}
const saveSetup = (s) => { try { localStorage.setItem('aimx-garage', JSON.stringify(s)); } catch (_) {} };

// write the setup into the live physics parameter object
export function applySetup(P, s) {
  const c = classOf(s), su = SUSP[clamp(s.susp, 0, 2)][1], ge = GEARING[clamp(s.gearing, 0, 2)][1], ty = TYRES[clamp(s.tyre, 0, 2)][1];
  P.M = c.M; P.POWER = c.POWER; P.FE_MAX = Math.round(c.FE * ge.fe); P.VTOP = +(c.VTOP * ge.vt).toFixed(2);
  P.K = BASE.K * su.k; P.CC = BASE.CC * su.c; P.CR = BASE.CR * su.c; P.MU = BASE.MU * ty;
  P.I = BASE.I.map((v) => v * c.I);
}

// 0..1 bars for the garage UI, computed from the same numbers the physics uses
export function statBars(s) {
  const c = classOf(s), ge = GEARING[clamp(s.gearing, 0, 2)][1], su = SUSP[clamp(s.susp, 0, 2)][1], ty = TYRES[clamp(s.tyre, 0, 2)][1];
  const fe = c.FE * ge.fe, vt = c.VTOP * ge.vt;
  return [
    ['ACCELERATION', clamp((fe - 2000) / 1700, 0.05, 1)],
    ['TOP SPEED', clamp((vt - 34) / 20, 0.05, 1)],
    ['AGILITY', clamp(1 - (c.M - 176) / 50, 0.1, 1)],
    ['GRIP', clamp((ty - 0.85) / 0.3, 0.05, 1)],
    ['LANDING STRENGTH', clamp((su.k - 0.8) / 0.4, 0.05, 1)],
  ];
}

export function initGarage(hooks) {
  const setup = loadSetup();
  const panel = document.getElementById('garage');
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const sw = (list, key, parent, label) => {
    const row = el('div', 'gsec'); row.appendChild(el('div', 'gl', label));
    const box = el('div', 'swatches');
    list.forEach(([n, rgb], i) => {
      const b = el('button', 'sw' + (setup[key] === i ? ' on' : '')); b.title = n; b.style.background = `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})`;
      b.onclick = () => { setup[key] = i; change(); }; box.appendChild(b);
    });
    row.appendChild(box); parent.appendChild(row);
  };
  const seg = (list, key, parent, label) => {
    const row = el('div', 'gsec'); row.appendChild(el('div', 'gl', label));
    const box = el('div', 'seg');
    list.forEach((it, i) => { const b = el('button', setup[key] === i ? 'on' : '', it[0]); b.title = it[2] || ''; b.onclick = () => { setup[key] = i; change(); }; box.appendChild(b); });
    row.appendChild(box); if (list[setup[key]] && list[setup[key]][2]) row.appendChild(el('div', 'gn', list[setup[key]][2])); parent.appendChild(row);
  };
  function render() {
    panel.innerHTML = '';
    const head = el('div', 'ghead'); head.appendChild(el('h2', '', 'GARAGE'));
    const back = el('button', 'go', 'DONE'); back.onclick = () => close(); head.appendChild(back); panel.appendChild(head);
    const body = el('div', 'gbody'); panel.appendChild(body);
    // class
    const cl = el('div', 'gsec'); cl.appendChild(el('div', 'gl', 'BIKE CLASS'));
    const grid = el('div', 'cgrid');
    CLASSES.forEach((c) => { const b = el('button', 'cbtn' + (setup.cls === c.id ? ' on' : ''), `<b>${c.name}</b><small>${c.blurb}</small>`); b.onclick = () => { setup.cls = c.id; change(); }; grid.appendChild(b); });
    cl.appendChild(grid); body.appendChild(cl);
    // stat bars
    const bars = el('div', 'gsec'); bars.appendChild(el('div', 'gl', 'PERFORMANCE'));
    statBars(setup).forEach(([n, v]) => bars.appendChild(el('div', 'bar', `<span>${n}</span><i><u style="width:${Math.round(v * 100)}%"></u></i>`)));
    const c = classOf(setup); bars.appendChild(el('div', 'gn', `${c.M} kg with rider · ${(c.four ? '4-stroke' : '2-stroke')} engine note`));
    body.appendChild(bars);
    sw(COLOURS, 'colour', body, 'BIKE COLOUR'); sw(GEAR_COLOURS, 'gear', body, 'RIDER GEAR'); sw(PLATES, 'plate', body, 'NUMBER PLATES');
    seg(SUSP, 'susp', body, 'SUSPENSION'); seg(GEARING, 'gearing', body, 'GEARING'); seg(TYRES, 'tyre', body, 'TYRES');
    const rs = el('button', 'btn alt', 'RESET TO STOCK'); rs.onclick = () => { Object.assign(setup, DEFAULT_SETUP); change(); }; body.appendChild(rs);
  }
  function change() { saveSetup(setup); render(); hooks.change && hooks.change(setup); }
  function open() { render(); panel.classList.remove('hide'); hooks.open && hooks.open(); }
  function close() { panel.classList.add('hide'); hooks.close && hooks.close(); }
  return { setup, open, close, get isOpen() { return !panel.classList.contains('hide'); } };
}
