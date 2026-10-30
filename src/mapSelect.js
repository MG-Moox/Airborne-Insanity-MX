// mapSelect.js - the map chooser. The world is built once at load, so picking a map stores the choice and reloads the page.
import { MAP_INFO } from './maps.js';
import * as T from './terrain.js';

export function initMapSelect() {
  const host = document.getElementById('maps');
  const curId = T.MAP_NUMBER, curLayout = T.ACTIVE ? T.ACTIVE.layoutId : null;
  const choose = (id, layout) => {
    try { localStorage.setItem('aimx-map', String(id)); if (layout) localStorage.setItem('aimx-layout', layout); } catch (_) {}
    const u = new URL(location.href); ['map', 'layout', 'tp', 'auto'].forEach((k) => u.searchParams.delete(k));
    if (id === curId && (id !== 2 || layout === curLayout)) { close(); return; }
    location.href = u.toString();
  };
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  function render() {
    host.innerHTML = '';
    const card = el('div', 'card glass mapcard'); card.appendChild(el('h2', '', 'SELECT MAP'));
    const grid = el('div', 'mgrid');
    for (const m of MAP_INFO) {
      const c = el('div', 'mcard' + (m.id === curId ? ' on' : ''));
      c.appendChild(el('div', 'mthumb m' + m.id)); c.appendChild(el('b', '', m.name)); c.appendChild(el('small', '', m.blurb));
      if (m.layouts) {
        const row = el('div', 'seg');
        m.layouts.forEach((l) => { const b = el('button', m.id === curId && l.id === curLayout ? 'on' : '', l.name); b.title = l.blurb; b.onclick = () => choose(2, l.id); row.appendChild(b); });
        c.appendChild(row);
      } else { const b = el('button', 'go', m.id === curId ? 'CURRENT MAP' : 'RIDE HERE'); b.onclick = () => choose(m.id); c.appendChild(b); }
      grid.appendChild(c);
    }
    card.appendChild(grid);
    const back = el('button', 'btn alt', 'BACK'); back.onclick = () => close(); card.appendChild(back);
    host.appendChild(card);
  }
  let after = null;
  function open(cb) { after = cb || null; render(); host.classList.remove('hide'); }
  function close() { host.classList.add('hide'); if (after) after(); after = null; }
  return { open, close, name: T.ACTIVE ? T.ACTIVE.name : 'PAINTED ISLAND', sub: T.ACTIVE ? T.ACTIVE.sub : '' };
}
