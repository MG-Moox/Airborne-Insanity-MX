// hud.js - DOM heads-up display, minimap, full map and fast-travel overlay.
import * as T from './terrain.js';

const $ = (id) => document.getElementById(id);
export const fmtTime = (t) => {
  if (t === null || t === undefined || !isFinite(t)) return '--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
};

export class Hud {
  constructor(mapImg) {
    this.img = mapImg;
    this.el = { hud: $('hud'), sp: $('sp'), gear: $('gear'), rpm: $('rpm').firstElementChild, alt: $('s-alt'), dist: $('s-dist'), top: $('s-top'), air: $('s-air'), flip: $('s-flip'),
      zone: $('zone'), pop: $('popups'), warn: $('warn'), crash: $('crash'), count: $('count'), cam: $('camname'), board: $('board'),
      lcur: $('l-cur'), llast: $('l-last'), lbest: $('l-best'), ln: $('l-n'), lof: $('l-of'), pos: $('pos'), mini: $('mini'), bigmap: $('bigmap'), mapc: $('mapc') };
    this.mctx = this.el.mini.getContext('2d');
    this.zoneId = null; this.zoneT = 0; this.mapOpen = false;
    this.onTeleport = null;
    this.el.mapc.addEventListener('click', (e) => this._mapClick(e));
    this.spotCat = 'ZONES'; this.hoverSpot = -1; this.spotUI = null;
  }
  show(v) { this.el.hud.classList.toggle('hide', !v); }

  popup(text, cls = 'good') {
    const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text;
    this.el.pop.appendChild(d);
    while (this.el.pop.children.length > 3) this.el.pop.removeChild(this.el.pop.firstChild);
    setTimeout(() => d.remove(), 2300);
  }

  setCamName(n) { this.el.cam.textContent = 'CAMERA: ' + n + '   (C to change)'; }

  update(s) {
    const e = this.el;
    e.sp.textContent = Math.round(s.speed * 3.6);
    e.gear.textContent = 'GEAR ' + s.gear;
    e.rpm.style.width = Math.round(s.rpm * 100) + '%';
    e.alt.textContent = Math.round(s.alt) + ' m';
    e.dist.textContent = (s.stats.distance / 1000).toFixed(2) + ' km';
    e.top.textContent = Math.round((s.stats.topSpeed || 0) * 3.6) + ' km/h';
    e.air.textContent = s.stats.bestAir.toFixed(1) + ' s';
    e.flip.textContent = s.stats.flips;
    // zone banner
    const z = s.zone;
    if (z && z.id !== this.zoneId) {
      this.zoneId = z.id; this.zoneT = 3.2;
      e.zone.firstElementChild.textContent = z.name; e.zone.lastElementChild.textContent = z.sub;
      e.zone.classList.add('show');
    } else if (!z) this.zoneId = null;
    if (this.zoneT > 0) { this.zoneT -= s.dt; if (this.zoneT <= 0) e.zone.classList.remove('show'); }
    // lap timer
    const lt = s.lap;
    e.lcur.textContent = fmtTime(lt.cur);
    e.llast.textContent = fmtTime(lt.lastLap);
    e.lbest.textContent = fmtTime(lt.best);
    e.ln.textContent = Math.min(lt.times.length + 1, s.raceLaps || 999);
    e.lof.textContent = s.raceLaps ? ' / ' + s.raceLaps : '';
    if (s.race && s.race.state !== 'idle') { e.pos.classList.remove('hide'); e.pos.textContent = 'P' + (s.race.position || '-') + ' / ' + (s.race.ais.length + 1); } else e.pos.classList.add('hide');
    // warnings
    if (s.oob) { e.warn.classList.remove('hide'); e.warn.innerHTML = 'LEAVING THE MAP<br><small>turn back!</small>'; }
    else if (s.invalid) { e.warn.classList.remove('hide'); e.warn.textContent = 'OFF TRACK - LAP INVALID'; }
    else e.warn.classList.add('hide');
    if (s.crashMsg) { e.crash.classList.remove('hide'); e.crash.innerHTML = 'WIPEOUT!<small>' + s.crashMsg + '</small>'; } else e.crash.classList.add('hide');
    if (s.count !== null) { e.count.classList.remove('hide'); e.count.textContent = s.count; } else e.count.classList.add('hide');
    this._minimap(s);
    if (this.mapOpen) this._bigMap(s);
  }

  board(results, laps) {
    const b = this.el.board;
    if (!results) { b.classList.add('hide'); return; }
    b.classList.remove('hide');
    b.innerHTML = '<h2>RESULTS &middot; ' + laps + ' LAPS</h2>' + results.map((r, i) => '<div' + (r.player ? ' class="lime"' : '') + '><span>' + (i + 1) + '. ' + r.name + '</span><span>' + fmtTime(r.time) + '</span></div>').join('') + '<small>Press F for another race</small>';
  }

  // ---- minimap: north-up crop of the painted map centred on the rider
  _minimap(s) {
    const c = this.mctx, W = 380, R = W / 2;
    const [px, py] = T.toMap(s.x, s.z);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.clip();
    const span = 300;                                   // image px across the minimap
    const k = W / span;
    c.fillStyle = '#0b1118'; c.fillRect(0, 0, W, W);
    c.translate(R, R);
    c.rotate(this.rotateMap ? s.yaw : 0);
    if (this.img && this.img.complete) c.drawImage(this.img, -px * k, -py * k, T.LAYOUT.IMG_W * k, T.LAYOUT.IMG_H * k);
    // track start + ai
    for (const a of s.ais || []) { const [ax, ay] = T.toMap(a.x, a.z); c.fillStyle = '#ff5a4a'; c.beginPath(); c.arc((ax - px) * k, (ay - py) * k, 7, 0, 7); c.fill(); }
    c.restore();
    c.save(); c.translate(R, R);
    if (this.rotateMap) c.rotate(0); else c.rotate(-s.yaw);
    c.fillStyle = '#a8ff45'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -16); c.lineTo(11, 12); c.lineTo(0, 6); c.lineTo(-11, 12); c.closePath(); c.stroke(); c.fill();
    c.restore();
    c.fillStyle = '#fff'; c.font = 'bold 22px system-ui'; c.textAlign = 'center'; c.fillText('N', R, 26);
  }

  // ---- full map
  toggleMap(open) {
    this.mapOpen = open === undefined ? !this.mapOpen : open;
    this.el.bigmap.classList.toggle('hide', !this.mapOpen);
    if (this.mapOpen) {
      const cv = this.el.mapc;
      cv.width = T.LAYOUT.IMG_W; cv.height = T.LAYOUT.IMG_H;
      this._buildSpots();
    }
    return this.mapOpen;
  }
  // category tabs + clickable list of quick teleports beside the map
  _buildSpots() {
    const host = $('spots'); if (!host) return;
    const cats = T.LAYOUT.TELEPORT_CATS, list = T.LAYOUT.TELEPORTS;
    host.innerHTML = '<h3>QUICK TELEPORT</h3><div class="stabs"></div><div class="slist"></div><button class="btn alt" id="mapclose" style="width:100%;margin:8px 0 0">CLOSE MAP</button>';
    const tabs = host.querySelector('.stabs'), box = host.querySelector('.slist');
    const draw = () => {
      tabs.innerHTML = ''; box.innerHTML = '';
      cats.forEach((c) => { const b = document.createElement('button'); b.textContent = c; b.className = c === this.spotCat ? 'on' : ''; b.onclick = () => { this.spotCat = c; draw(); }; tabs.appendChild(b); });
      let n = 0;
      list.forEach((t, i) => {
        if (t[4] !== this.spotCat) return; n++;
        const r = document.createElement('button'); r.className = 'srow2';
        r.innerHTML = `<span class="num">${this.spotCat === 'ZONES' ? i + 1 : n}</span><span class="nm">${t[0]}<small>${t[5] || ''}</small></span>`;
        r.onmouseenter = () => { this.hoverSpot = i; }; r.onmouseleave = () => { this.hoverSpot = -1; };
        r.onclick = () => this.onTeleport && this.onTeleport(i);
        box.appendChild(r);
      });
    };
    draw();
    host.querySelector('#mapclose').onclick = () => { this.toggleMap(false); if (this.onMapClose) this.onMapClose(); };
  }
  redrawMap(s) { if (this.mapOpen) this._bigMap(s); }
  _bigMap(s) {
    const cv = this.el.mapc, c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.img && this.img.complete) c.drawImage(this.img, 0, 0);
    let n = 0;
    T.LAYOUT.TELEPORTS.forEach((t, i) => {
      if (t[4] !== this.spotCat) return; n++;
      const hot = i === this.hoverSpot, r = hot ? 26 : 20;
      c.fillStyle = hot ? '#a8ff45' : '#0b1118e6'; c.strokeStyle = '#a8ff45'; c.lineWidth = 3;
      c.beginPath(); c.arc(t[1], t[2], r, 0, 7); c.fill(); c.stroke();
      c.fillStyle = hot ? '#0b1118' : '#a8ff45'; c.font = 'bold 24px system-ui'; c.textAlign = 'center'; c.fillText(this.spotCat === 'ZONES' ? i + 1 : n, t[1], t[2] + 8);
      if (hot) { c.font = 'bold 26px system-ui'; c.lineWidth = 6; c.strokeStyle = '#000'; c.strokeText(t[0], t[1], t[2] - 34); c.fillStyle = '#fff'; c.fillText(t[0], t[1], t[2] - 34); }
    });
    for (const a of s.ais || []) { const [ax, ay] = T.toMap(a.x, a.z); c.fillStyle = '#ff5a4a'; c.beginPath(); c.arc(ax, ay, 8, 0, 7); c.fill(); }
    const [px, py] = T.toMap(s.x, s.z);
    c.save(); c.translate(px, py); c.rotate(-s.yaw);
    c.fillStyle = '#a8ff45'; c.strokeStyle = '#000'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, -24); c.lineTo(16, 18); c.lineTo(0, 9); c.lineTo(-16, 18); c.closePath(); c.stroke(); c.fill();
    c.restore();
  }
  _mapClick(e) {
    const cv = this.el.mapc, r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cv.width, y = ((e.clientY - r.top) / r.height) * cv.height;
    let best = -1, bd = 40;
    T.LAYOUT.TELEPORTS.forEach((t, i) => { if (t[4] !== this.spotCat) return; const d = Math.hypot(t[1] - x, t[2] - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0 && this.onTeleport) this.onTeleport(best);
  }
}
