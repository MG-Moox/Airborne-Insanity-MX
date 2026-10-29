// renderer.js - minimal WebGL2 renderer: lit vertex-coloured meshes, procedural sky, dust particles.
// Uses a floating origin (everything is drawn relative to the camera) so far-away terrain stays precise.
import { m4perspective, m4lookAt, m4mul } from './mathgl.js';

const MAIN_VS = `#version 300 es
in vec3 aPos; in vec3 aNrm; in vec3 aCol;
uniform mat4 uVP; uniform mat4 uModel;
out vec3 vCol; out vec3 vNrm; out vec3 vRel; out vec3 vLocal;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vLocal = aPos; vRel = w.xyz; vNrm = mat3(uModel) * aNrm; vCol = aCol;
  gl_Position = uVP * w;
}`;
const MAIN_FS = `#version 300 es
precision highp float;
in vec3 vCol; in vec3 vNrm; in vec3 vRel; in vec3 vLocal;
uniform vec3 uSun; uniform vec3 uFogColor; uniform vec2 uFog; uniform float uAlpha; uniform float uTerrain; uniform vec2 uOrigin;
out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec3 n = normalize(vNrm);
  vec3 col = vCol;
  if (uTerrain > 0.5) {
    vec2 wp = vLocal.xz + uOrigin;
    float dd = length(vRel);
    float f1 = 1.0 - smoothstep(30.0, 110.0, dd), f2 = 1.0 - smoothstep(8.0, 38.0, dd);
    float g = vn(wp*0.22)*0.55 + vn(wp*0.9)*0.3*f1 + vn(wp*3.1)*0.25*f1 + vn(wp*11.0)*0.22*f2;
    col *= 0.74 + 0.5*g;
  }
  float d = max(dot(n, uSun), 0.0);
  float hemi = 0.5 + 0.5*n.y;
  vec3 light = vec3(0.50,0.58,0.72)*hemi*0.80 + vec3(1.0,0.92,0.78)*d*0.95;
  col *= light;
  float dist = length(vRel);
  float f = clamp((dist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  col = mix(col, uFogColor, f*f*(3.0-2.0*f));
  o = vec4(pow(col, vec3(0.95)), uAlpha);
}`;

const SKY_VS = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p * 2.0 - 1.0;
  gl_Position = vec4(vUv, 0.9999, 1.0);
}`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd; uniform vec2 uTan; uniform vec3 uSun; uniform float uTime;
uniform vec3 uHorizon; uniform vec3 uZenith;
out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+7.1; a*=0.5; } return s; }
void main(){
  vec3 dir = normalize(uFwd + vUv.x*uTan.x*uRight + vUv.y*uTan.y*uUp);
  float t = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.55));
  float sd = max(dot(dir, uSun), 0.0);
  col += vec3(1.0,0.85,0.6) * (pow(sd, 8.0)*0.25 + pow(sd, 400.0)*1.6);
  if (dir.y > 0.02) {
    vec2 p = dir.xz / (dir.y + 0.18) * 1.6 + vec2(uTime*0.01, 0.0);
    float c = smoothstep(0.52, 0.80, fbm(p));
    float fade = smoothstep(0.02, 0.25, dir.y);
    col = mix(col, vec3(1.0), c*0.85*fade);
  }
  o = vec4(col, 1.0);
}`;

const PT_VS = `#version 300 es
in vec3 aPos; in float aSize; in float aAlpha;
uniform mat4 uVP; uniform float uScale;
out float vA;
void main(){
  vec4 c = uVP * vec4(aPos, 1.0);
  gl_Position = c; vA = aAlpha;
  gl_PointSize = clamp(aSize * uScale / max(c.w, 0.1), 1.0, 160.0);
}`;
const PT_FS = `#version 300 es
precision highp float;
in float vA; uniform vec3 uColor; out vec4 o;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vA * smoothstep(1.0, 0.25, d);
  if (a < 0.01) discard;
  o = vec4(uColor, a);
}`;

function compile(gl, vsSrc, fsSrc) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

export const SUN = (() => { const v = [0.45, 0.78, 0.35], l = Math.hypot(...v); return v.map((x) => x / l); })();
export const HORIZON = [0.74, 0.84, 0.92];
export const ZENITH = [0.22, 0.45, 0.80];

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; this.canvas = canvas;
    this.main = compile(gl, MAIN_VS, MAIN_FS);
    this.sky = compile(gl, SKY_VS, SKY_FS);
    this.pt = compile(gl, PT_VS, PT_FS);
    this.skyVao = gl.createVertexArray();
    this.eye = [0, 0, 0];
    this.time = 0;
    this.tmp = new Float32Array(16);
    this.fogRange = [140, 290];
    // particle buffers
    this.ptVao = gl.createVertexArray();
    this.ptBuf = gl.createBuffer();
    gl.bindVertexArray(this.ptVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
    const loc = (n) => gl.getAttribLocation(this.pt.p, n);
    gl.enableVertexAttribArray(loc('aPos')); gl.vertexAttribPointer(loc('aPos'), 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(loc('aSize')); gl.vertexAttribPointer(loc('aSize'), 1, gl.FLOAT, false, 20, 12);
    gl.enableVertexAttribArray(loc('aAlpha')); gl.vertexAttribPointer(loc('aAlpha'), 1, gl.FLOAT, false, 20, 16);
    gl.bindVertexArray(null);
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (this.scale || 1);
    const w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.w = w; this.h = h;
  }

  makeMesh(geo) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [];
    const attr = (name, data, size) => {
      const b = gl.createBuffer(); bufs.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
      const l = gl.getAttribLocation(this.main.p, name);
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
    };
    attr('aPos', geo.p, 3); attr('aNrm', geo.n, 3); attr('aCol', geo.c, 3);
    const ib = gl.createBuffer(); bufs.push(ib);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const idx = geo.i instanceof Uint32Array ? geo.i : new Uint32Array(geo.i);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, bufs, count: idx.length };
  }
  freeMesh(m) {
    const gl = this.gl;
    gl.deleteVertexArray(m.vao);
    m.bufs.forEach((b) => gl.deleteBuffer(b));
  }

  // cam: { eye:[x,y,z], target:[x,y,z], up:[x,y,z], fov (deg) }
  begin(cam, time) {
    const gl = this.gl;
    this.resize();
    this.time = time;
    this.eye = cam.eye;
    const aspect = this.w / this.h;
    const fovy = (cam.fov * Math.PI) / 180;
    const rel = [cam.target[0] - cam.eye[0], cam.target[1] - cam.eye[1], cam.target[2] - cam.eye[2]];
    const view = m4lookAt([0, 0, 0], rel, cam.up);
    const proj = m4perspective(fovy, aspect, 0.1, 900);
    this.vp = new Float32Array(m4mul(proj, view));
    // camera basis for the sky
    const f = rel.map((x) => x / Math.hypot(...rel));
    let r = [f[1] * cam.up[2] - f[2] * cam.up[1], f[2] * cam.up[0] - f[0] * cam.up[2], f[0] * cam.up[1] - f[1] * cam.up[0]];
    const rl = Math.hypot(...r); r = r.map((x) => x / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    this.pxScale = this.h / (2 * Math.tan(fovy / 2));

    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
    gl.clearColor(...HORIZON, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.sky.p);
    const s = this.sky.u;
    gl.uniform3fv(s.uRight, r); gl.uniform3fv(s.uUp, u); gl.uniform3fv(s.uFwd, f);
    gl.uniform2f(s.uTan, Math.tan(fovy / 2) * aspect, Math.tan(fovy / 2));
    gl.uniform3fv(s.uSun, SUN); gl.uniform1f(s.uTime, time);
    gl.uniform3fv(s.uHorizon, HORIZON); gl.uniform3fv(s.uZenith, ZENITH);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.main.p);
    const m = this.main.u;
    gl.uniformMatrix4fv(m.uVP, false, this.vp);
    gl.uniform3fv(m.uSun, SUN); gl.uniform3fv(m.uFogColor, HORIZON);
    gl.uniform2fv(m.uFog, this.fogRange);
  }

  draw(mesh, model, opts) {
    const gl = this.gl, m = this.main.u, t = this.tmp;
    for (let i = 0; i < 16; i++) t[i] = model[i];
    t[12] = model[12] - this.eye[0]; t[13] = model[13] - this.eye[1]; t[14] = model[14] - this.eye[2];
    gl.uniformMatrix4fv(m.uModel, false, t);
    const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    gl.uniform1f(m.uAlpha, alpha);
    gl.uniform1f(m.uTerrain, opts && opts.terrain ? 1 : 0);
    if (opts && opts.terrain) gl.uniform2f(m.uOrigin, model[12], model[14]);
    if (alpha < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    if (alpha < 1) { gl.disable(gl.BLEND); gl.depthMask(true); }
  }

  // data: Float32Array of [x,y,z,size,alpha] (world coords), count particles
  drawParticles(data, count, color) {
    if (!count) return;
    const gl = this.gl;
    const rel = new Float32Array(count * 5);
    for (let i = 0; i < count; i++) {
      rel[i * 5] = data[i * 5] - this.eye[0]; rel[i * 5 + 1] = data[i * 5 + 1] - this.eye[1]; rel[i * 5 + 2] = data[i * 5 + 2] - this.eye[2];
      rel[i * 5 + 3] = data[i * 5 + 3]; rel[i * 5 + 4] = data[i * 5 + 4];
    }
    gl.useProgram(this.pt.p);
    gl.uniformMatrix4fv(this.pt.u.uVP, false, this.vp);
    gl.uniform1f(this.pt.u.uScale, this.pxScale);
    gl.uniform3fv(this.pt.u.uColor, color);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindVertexArray(this.ptVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rel, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disable(gl.BLEND); gl.depthMask(true);
    gl.useProgram(this.main.p);
  }
}
