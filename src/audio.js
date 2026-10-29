// audio.js - synthesised engine, wind, tyre, impact and splash sounds (Web Audio, no files).
export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.ok = false; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const c = this.ctx = new C();
      this.master = c.createGain(); this.master.gain.value = 0.55; this.master.connect(c.destination);
      // engine: two detuned saws + square through a lowpass
      this.eng = c.createGain(); this.eng.gain.value = 0;
      this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 900; this.lp.Q.value = 2;
      this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square'; this.o3 = c.createOscillator(); this.o3.type = 'sawtooth';
      const g2 = c.createGain(); g2.gain.value = 0.5; const g3 = c.createGain(); g3.gain.value = 0.35;
      this.o1.connect(this.lp); this.o2.connect(g2); g2.connect(this.lp); this.o3.connect(g3); g3.connect(this.lp);
      this.lp.connect(this.eng); this.eng.connect(this.master);
      [this.o1, this.o2, this.o3].forEach((o) => o.start());
      // noise source for wind / tyres / splash
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const mk = (type, f, q) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); return { g, fl }; };
      this.wind = mk('bandpass', 500, 0.6); this.dirt = mk('lowpass', 1200, 0.5); this.water = mk('bandpass', 2400, 0.8);
      this.noiseBuf = buf;
      this.ok = true;
    } catch (e) { this.ok = false; }
  }
  mute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; return this.muted; }
  update(bike, inp, dt) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const sp = Math.hypot(bike.v[0], bike.v[1], bike.v[2]);
    const grounded = bike.wheels[1].grounded;
    const crashed = bike.state === 'crashed';
    const th = crashed ? 0 : inp.throttle;
    // fake gearbox: rpm climbs through 5 gears
    const gearTop = [9, 15, 21, 28, 40], gears = gearTop.length;
    let g = 0; while (g < gears - 1 && sp > gearTop[g]) g++;
    const lo = g === 0 ? 0 : gearTop[g - 1];
    let rpm = 0.22 + 0.78 * Math.min(1, (sp - lo * 0.55) / (gearTop[g] - lo * 0.55));
    if (!grounded || (bike.wheels[1].omega * 0.34 > sp + 4)) rpm = Math.min(1, rpm + th * 0.35);
    rpm = Math.max(0.2, Math.min(1, rpm * (0.55 + 0.45 * Math.max(th, 0.3))));
    this.rpm = rpm; this.gear = g + 1;
    const f = 38 + rpm * 120;
    this.o1.frequency.setTargetAtTime(f, t, 0.04); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04); this.o3.frequency.setTargetAtTime(f * 1.005 + 1.5, t, 0.04);
    this.lp.frequency.setTargetAtTime(500 + rpm * 1800 + th * 900, t, 0.05);
    this.eng.gain.setTargetAtTime(crashed ? 0.02 : 0.16 + th * 0.12 + rpm * 0.05, t, 0.05);
    this.wind.g.gain.setTargetAtTime(Math.min(0.3, sp / 130), t, 0.1); this.wind.fl.frequency.setTargetAtTime(300 + sp * 22, t, 0.1);
    const slide = grounded ? Math.min(1, (bike.wheels[1].slip + bike.wheels[0].slip) * 0.12) : 0;
    this.dirt.g.gain.setTargetAtTime(grounded ? Math.min(0.22, sp / 200 + slide * 0.15) : 0, t, 0.06);
    this.water.g.gain.setTargetAtTime(bike.inWater ? Math.min(0.35, 0.08 + sp / 60) : 0, t, 0.05);
  }
  thud(power) { if (!this.ok) return; this._burst(70 + Math.random() * 20, Math.min(0.7, power * 0.08), 0.22, 'lowpass', 220); }
  crash() { if (!this.ok) return; this._burst(100, 0.7, 0.5, 'lowpass', 500); this._burst(2000, 0.25, 0.25, 'bandpass', 2000); }
  splash() { if (!this.ok) return; this._burst(900, 0.5, 0.6, 'bandpass', 1800); }
  beep(f = 880, d = 0.12, v = 0.18) {
    if (!this.ok) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = f; g.gain.value = v; g.gain.setTargetAtTime(0, c.currentTime + d * 0.6, d * 0.2);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + d + 0.1);
  }
  _burst(f, v, d, type, cutoff) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = f / 500;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = cutoff;
    const g = c.createGain(); g.gain.value = v; g.gain.setTargetAtTime(0, c.currentTime + 0.02, d / 3);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + d + 0.3);
  }
}
