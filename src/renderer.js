// renderer.js - WebGL2 renderer: linear HDR lighting, cascaded sun shadow maps, MSAA, bloom + ACES tone mapping,
// animated water, procedural sky and particles. Uses a floating origin (everything is drawn relative to the camera).
import { m4perspective, m4lookAt, m4mul, m4translate } from './mathgl.js';

// ---------------------------------------------------------------------------------------------- shaders
const MAIN_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
uniform mat4 uVP; uniform mat4 uModel;
out vec3 vCol; out vec3 vNrm; out vec3 vRel; out vec3 vLocal;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vLocal = aPos; vRel = w.xyz; vNrm = mat3(uModel) * aNrm; vCol = aCol;
  gl_Position = uVP * w;
}`;

const NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`;

const MAIN_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vCol; in vec3 vNrm; in vec3 vRel; in vec3 vLocal;
uniform vec3 uSun; uniform vec3 uFogColor; uniform vec2 uFog; uniform float uAlpha; uniform float uTerrain; uniform vec2 uOrigin;
uniform float uWater; uniform float uTime; uniform float uSpec; uniform float uShin;
uniform sampler2DShadow uSh0; uniform sampler2DShadow uSh1; uniform mat4 uShM0; uniform mat4 uShM1;
uniform int uShN; uniform vec2 uShTex; uniform vec2 uShInv;
uniform vec3 uHorizon; uniform vec3 uZenith;
out vec4 o;
${NOISE}
const vec3 SUN_COL = vec3(1.0, 0.86, 0.66) * 3.3;
const vec3 SKY_AMB = vec3(0.30, 0.45, 0.78) * 0.95;
const vec3 GND_AMB = vec3(0.22, 0.17, 0.10) * 0.55;

float pcf(sampler2DShadow s, vec3 c, float inv, float rot){
  float ca = cos(rot), sa = sin(rot);
  vec2 d0 = vec2(ca, sa) * 1.2 * inv, d1 = vec2(-sa, ca) * 1.2 * inv;
  float z = c.z;
  float a = texture(s, vec3(c.xy, z));
  a += texture(s, vec3(c.xy + d0, z));
  a += texture(s, vec3(c.xy - d0, z));
  a += texture(s, vec3(c.xy + d1, z));
  a += texture(s, vec3(c.xy - d1, z));
  return a * 0.2;
}
float shadowAt(vec3 rel, vec3 n){
  if (uShN == 0) return 1.0;
  float rot = h21(gl_FragCoord.xy) * 6.2831;
  vec4 s0 = uShM0 * vec4(rel + n * uShTex.x * 1.6, 1.0);
  vec3 c0 = s0.xyz * 0.5 + 0.5;
  float e0 = max(abs(s0.x), abs(s0.y));
  float r = 1.0;
  if (e0 < 1.0 && c0.z < 1.0) r = pcf(uSh0, c0, uShInv.x, rot);
  if (uShN == 1) return mix(r, 1.0, smoothstep(0.8, 1.0, e0));
  float w = smoothstep(0.72, 0.95, e0);
  if (w > 0.0) {
    vec4 s1 = uShM1 * vec4(rel + n * uShTex.y * 1.6, 1.0);
    vec3 c1 = s1.xyz * 0.5 + 0.5;
    float e1 = max(abs(s1.x), abs(s1.y));
    float r1 = 1.0;
    if (e1 < 1.0 && c1.z < 1.0) r1 = pcf(uSh1, c1, uShInv.y, rot);
    r1 = mix(r1, 1.0, smoothstep(0.8, 1.0, e1));
    r = mix(r, r1, w);
  }
  return r;
}
vec3 skyCol(vec3 d){
  float t = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(t, 0.5));
  float sd = max(dot(d, uSun), 0.0);
  return c + vec3(1.0,0.8,0.55) * (pow(sd, 6.0)*0.25 + pow(sd, 300.0)*6.0);
}
void main(){
  vec3 n = normalize(vNrm);
  vec3 V = -normalize(vRel);
  float dist = length(vRel);
  vec3 col = pow(vCol, vec3(2.2));
  if (uWater > 0.5) {
    vec2 wp = vLocal.xz; float t = uTime;
    vec3 wn;
    if (uWater < 1.5) {
      float e = 0.25;
      vec2 q = wp * 0.45;
      float h0 = vn(q + vec2(t*0.30, t*0.18)) + vn(q*2.3 - vec2(t*0.25, -t*0.2))*0.5 + vn(q*5.1 + vec2(-t*0.4, t*0.35))*0.25;
      float hx = vn(q + vec2(e, 0.0) + vec2(t*0.30, t*0.18)) + vn((q + vec2(e,0.0))*2.3 - vec2(t*0.25, -t*0.2))*0.5 + vn((q + vec2(e,0.0))*5.1 + vec2(-t*0.4, t*0.35))*0.25;
      float hz = vn(q + vec2(0.0, e) + vec2(t*0.30, t*0.18)) + vn((q + vec2(0.0,e))*2.3 - vec2(t*0.25, -t*0.2))*0.5 + vn((q + vec2(0.0,e))*5.1 + vec2(-t*0.4, t*0.35))*0.25;
      float fade = 1.0 - smoothstep(40.0, 200.0, dist);
      wn = normalize(vec3((h0-hx)*0.9*fade, 1.0, (h0-hz)*0.9*fade));
      float fr = 0.03 + 0.97 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
      vec3 R = reflect(-V, wn); R.y = abs(R.y);
      vec3 deep = pow(vec3(0.05, 0.28, 0.36), vec3(2.2));
      vec3 c = mix(deep, skyCol(R), fr);
      float sparkle = pow(max(dot(R, uSun), 0.0), 220.0) * 8.0 * (0.6 + 0.8*vn(wp*3.0 + t));
      c += vec3(1.0, 0.85, 0.6) * sparkle;
      float f = clamp((dist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
      c = mix(c, uFogColor, f*f*(3.0-2.0*f));
      o = vec4(c, clamp(uAlpha * 0.9 + fr * 0.25, 0.0, 0.97));
    } else {
      float s = vn(vec2(wp.x*2.1 + wp.y*1.7, vLocal.y*0.9 + t*6.0)) * 0.6 + vn(vec2(wp.x*5.0 - wp.y*3.0, vLocal.y*2.0 + t*9.0)) * 0.4;
      vec3 c = mix(pow(vec3(0.55, 0.75, 0.85), vec3(2.2)), vec3(1.8), smoothstep(0.35, 0.8, s));
      float f = clamp((dist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
      c = mix(c, uFogColor, f*f*(3.0-2.0*f));
      o = vec4(c, uAlpha);
    }
    return;
  }
  float ao = 1.0;
  if (uTerrain > 0.5) {
    vec2 wp = vLocal.xz + uOrigin;
    float f1 = 1.0 - smoothstep(30.0, 120.0, dist), f2 = 1.0 - smoothstep(6.0, 40.0, dist), f3 = 1.0 - smoothstep(60.0, 220.0, dist);
    float px = max(fwidth(wp.x), fwidth(wp.y));
    float a1 = 1.0 - smoothstep(0.12, 0.4, px*1.9), a2 = 1.0 - smoothstep(0.12, 0.4, px*6.3), a3 = 1.0 - smoothstep(0.12, 0.4, px*13.0), a4 = 1.0 - smoothstep(0.12, 0.4, px*2.9), a5 = 1.0 - smoothstep(0.12, 0.4, px*9.0);
    float dirt = smoothstep(0.03, 0.14, vCol.r - vCol.g);
    float g = vn(wp*0.15)*0.5 + vn(wp*0.7)*0.3*f1 + vn(wp*2.9)*0.28*f1*a4 + vn(wp*9.0)*0.26*f2*a5;
    float blades = (vn(wp*13.0)*0.6 + vn(wp*31.0)*0.4*a3);
    float pebbles = step(0.82, vn(wp*7.0 + 3.1)) * a5;
    float patchN = vn(wp*0.035);
    col *= 0.55 + 0.9*g;
    col *= mix(1.0 + (blades-0.5)*0.5*f2*a3, 1.0 + (pebbles*0.5 - 0.15)*0.35*f2 + (blades-0.5)*0.35*f2*a3, dirt);
    col = mix(col, col*vec3(1.18,1.05,0.7), smoothstep(0.45,0.75,patchN)*(1.0-dirt)*f3);
    col = mix(col, col*vec3(0.75,1.0,0.82), smoothstep(0.4,0.15,patchN)*(1.0-dirt)*f3);
    float e = 0.3, b0 = vn(wp*1.9)*0.6 + vn(wp*6.3)*0.4*a2;
    float bx = vn((wp+vec2(e,0.0))*1.9)*0.6 + vn((wp+vec2(e,0.0))*6.3)*0.4*a2;
    float bz = vn((wp+vec2(0.0,e))*1.9)*0.6 + vn((wp+vec2(0.0,e))*6.3)*0.4*a2;
    n = normalize(n + vec3(b0-bx, 0.0, b0-bz) * (0.9 + 1.4*dirt) * f2 * a1);
  }
  float ndl = max(dot(n, uSun), 0.0);
  float sh = ndl > 0.0 ? shadowAt(vRel, normalize(vNrm)) : 1.0;
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(GND_AMB, SKY_AMB, hemi) * (0.55 + 0.45 * mix(1.0, sh, 0.5));
  vec3 lit = col * (SUN_COL * ndl * sh + amb);
  if (uSpec > 0.0) {
    vec3 H = normalize(uSun + V);
    float sp = pow(max(dot(n, H), 0.0), uShin) * uSpec * ndl * sh * (uShin + 8.0) / 25.0;
    float rim = pow(1.0 - max(dot(n, V), 0.0), 4.0) * uSpec * 0.6;
    lit += SUN_COL * sp * 0.35 + SKY_AMB * rim * (0.4 + 0.6*hemi);
  }
  // atmosphere: distance fog with warm in-scatter toward the sun
  float f = clamp((dist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  f = f*f*(3.0-2.0*f);
  float sd = max(dot(-V, uSun), 0.0);
  vec3 fogC = uFogColor + vec3(1.0, 0.75, 0.5) * pow(sd, 5.0) * 0.55;
  vec3 c = mix(lit, fogC, f);
  o = vec4(c, uAlpha);
}`;

const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform mat4 uModel;
void main(){ gl_Position = uVP * (uModel * vec4(aPos, 1.0)); }`;
const DEPTH_FS = `#version 300 es
precision lowp float; out vec4 o; void main(){ o = vec4(1.0); }`;

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
${NOISE}
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+7.1; a*=0.5; } return s; }
void main(){
  vec3 dir = normalize(uFwd + vUv.x*uTan.x*uRight + vUv.y*uTan.y*uUp);
  float t = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.5));
  float sd = max(dot(dir, uSun), 0.0);
  col = mix(col, uHorizon * 1.15 + vec3(0.25,0.12,0.0), pow(sd, 3.0) * (1.0 - t) * 0.5);          // warm horizon glow towards the sun
  col += vec3(1.0,0.8,0.55) * (pow(sd, 6.0)*0.35 + pow(sd, 64.0)*0.8 + smoothstep(0.9993, 0.9998, sd)*28.0);
  if (dir.y > 0.01) {
    vec2 p = dir.xz / (dir.y + 0.16) * 1.5 + vec2(uTime*0.012, 0.0);
    float d = fbm(p);
    float c = smoothstep(0.5, 0.78, d);
    vec2 sp = normalize(uSun.xz + 1e-4) * 0.06;
    float d2 = fbm(p + sp);
    float shade = clamp((d - d2) * 5.0 + 0.55, 0.0, 1.0);                                            // lit tops, grey bellies
    vec3 cloud = mix(vec3(0.55, 0.6, 0.72), vec3(1.5, 1.4, 1.25), shade);
    cloud += vec3(1.0, 0.7, 0.4) * pow(sd, 8.0) * 0.8;
    float fade = smoothstep(0.01, 0.22, dir.y);
    col = mix(col, cloud, c * 0.92 * fade);
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
in float vA; uniform vec3 uColor; uniform vec3 uLight; out vec4 o;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vA * smoothstep(1.0, 0.25, d);
  if (a < 0.01) discard;
  o = vec4(pow(uColor, vec3(2.2)) * uLight, a);
}`;

// ---- post-processing
const POST_VS = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const BLOOM_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uDir; uniform float uMode; uniform float uThresh;
out vec4 o;
vec3 pre(vec3 c){ float l = max(c.r, max(c.g, c.b)); float k = max(l - uThresh, 0.0); k = k*k/(k + 0.5) ; return c * (k / max(l, 1e-4)); }
void main(){
  if (uMode < 0.5) {                       // prefilter + 4x downsample (4 bilinear taps)
    vec3 a = pre(texture(uTex, vUv + uTexel*vec2(-1.0,-1.0)).rgb) + pre(texture(uTex, vUv + uTexel*vec2(1.0,-1.0)).rgb)
           + pre(texture(uTex, vUv + uTexel*vec2(-1.0,1.0)).rgb) + pre(texture(uTex, vUv + uTexel*vec2(1.0,1.0)).rgb);
    o = vec4(a * 0.25, 1.0);
  } else if (uMode < 1.5) {                // plain 2x downsample
    vec3 a = texture(uTex, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture(uTex, vUv + uTexel*vec2(1.0,-1.0)).rgb
           + texture(uTex, vUv + uTexel*vec2(-1.0,1.0)).rgb + texture(uTex, vUv + uTexel*vec2(1.0,1.0)).rgb;
    o = vec4(a * 0.25, 1.0);
  } else {                                 // gaussian blur along uDir
    vec3 a = texture(uTex, vUv).rgb * 0.2270270270;
    a += (texture(uTex, vUv + uDir*uTexel*1.3846153846).rgb + texture(uTex, vUv - uDir*uTexel*1.3846153846).rgb) * 0.3162162162;
    a += (texture(uTex, vUv + uDir*uTexel*3.2307692308).rgb + texture(uTex, vUv - uDir*uTexel*3.2307692308).rgb) * 0.0702702703;
    o = vec4(a, 1.0);
  }
}`;
const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uScene; uniform sampler2D uB1; uniform sampler2D uB2;
uniform float uSpeed; uniform float uTime; uniform float uBloom; uniform float uExposure; uniform vec2 uRes;
out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec3 c;
  if (uSpeed > 0.01) {                                       // radial speed blur, strongest at the edges
    c = vec3(0.0);
    for (int i = 0; i < 7; i++) c += texture(uScene, vUv - d * (float(i) / 6.0) * uSpeed * (0.2 + r2 * 3.0)).rgb;
    c /= 7.0;
  } else c = texture(uScene, vUv).rgb;
  if (uBloom > 0.0) c += (texture(uB1, vUv).rgb * 0.65 + texture(uB2, vUv).rgb * 0.9) * uBloom;
  c *= uExposure;
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.12);                                  // saturation
  c = pow(c, vec3(1.0/2.2));
  c = mix(c, c*c*(3.0-2.0*c), 0.28);                          // gentle S-curve contrast
  c *= mix(1.0, 1.0 - 0.55*smoothstep(0.1, 0.45, r2), 0.9);   // vignette
  c *= vec3(1.02, 1.0, 0.97);                                 // slight warm grade
  c += (h21(gl_FragCoord.xy + uTime) - 0.5) / 120.0;          // dither, hides banding in the sky
  o = vec4(c, 1.0);
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
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

export const SUN = (() => { const v = [0.5, 0.62, 0.42], l = Math.hypot(...v); return v.map((x) => x / l); })();
export const HORIZON = [0.74, 0.84, 0.92];
export const ZENITH = [0.2, 0.42, 0.8];
const lin = (c) => c.map((x) => Math.pow(x, 2.2));

// quality presets: render scale, MSAA samples, shadow cascades [{size, radius}], bloom
const PRESETS = [
  { scale: 0.75, msaa: 0, cascades: [], bloom: false },
  { scale: 1, msaa: 4, cascades: [{ size: 2048, radius: 75 }], bloom: true },
  { scale: 1, msaa: 4, cascades: [{ size: 4096, radius: 24 }, { size: 2048, radius: 110 }], bloom: true },
];

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; this.canvas = canvas;
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('OES_texture_float_linear');
    this.main = compile(gl, MAIN_VS, MAIN_FS);
    this.depth = compile(gl, DEPTH_VS, DEPTH_FS);
    this.sky = compile(gl, SKY_VS, SKY_FS);
    this.pt = compile(gl, PT_VS, PT_FS);
    this.bloomP = compile(gl, POST_VS, BLOOM_FS);
    this.comp = compile(gl, POST_VS, COMP_FS);
    this.skyVao = gl.createVertexArray();
    this.eye = [0, 0, 0];
    this.time = 0;
    this.tmp = new Float32Array(16);
    this.fogRange = [140, 290];
    this.pass = 'main';
    this.preset = PRESETS[1]; this.scale = 1;
    this.sh = [];            // shadow cascades {tex, fbo, size, radius, m}
    this.targets = null;
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
    // dummy depth textures so the shadow samplers are always valid
    this.dummy = this._depthTex(4);
    this.setQuality(1);
  }

  setQuality(q) {
    const gl = this.gl, P = PRESETS[Math.max(0, Math.min(PRESETS.length - 1, q))];
    this.preset = P; this.scale = P.scale;
    for (const s of this.sh) { gl.deleteTexture(s.tex); gl.deleteFramebuffer(s.fbo); }
    this.sh = P.cascades.map((c) => {
      const tex = this._depthTex(c.size);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, size: c.size, radius: c.radius, m: new Float32Array(16) };
    });
    this._freeTargets();
  }

  _depthTex(size) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    return t;
  }

  // ---------------------------------------------------------------------- render targets
  _tex(w, h, hdr) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  _fboTex(w, h, hdr) {
    const gl = this.gl, tex = this._tex(w, h, hdr), fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }
  _freeTargets() {
    const gl = this.gl, t = this.targets;
    if (!t) return;
    for (const k of ['res', 'b1a', 'b1b', 'b2a', 'b2b']) if (t[k]) { gl.deleteTexture(t[k].tex); gl.deleteFramebuffer(t[k].fbo); }
    if (t.ms) { gl.deleteFramebuffer(t.ms.fbo); gl.deleteRenderbuffer(t.ms.color); gl.deleteRenderbuffer(t.ms.depth); }
    if (t.resDepth) gl.deleteRenderbuffer(t.resDepth);
    this.targets = null;
  }
  _makeTargets(w, h) {
    const gl = this.gl;
    let hdr = this.hdr, samples = Math.min(this.preset.msaa, gl.getParameter(gl.MAX_SAMPLES) || 0);
    for (let attempt = 0; attempt < 4; attempt++) {
      const t = { w, h, hdr, samples };
      t.res = this._fboTex(w, h, hdr);
      if (samples > 0) {
        const fbo = gl.createFramebuffer(), color = gl.createRenderbuffer(), depth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, color); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, hdr ? gl.RGBA16F : gl.RGBA8, w, h);
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
        t.ms = { fbo, color, depth };
        t.sceneFbo = fbo;
      } else {
        t.resDepth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, t.resDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.res.fbo);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.resDepth);
        t.sceneFbo = t.res.fbo;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.sceneFbo);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (ok) {
        t.b1a = this._fboTex(Math.max(1, w >> 2), Math.max(1, h >> 2), hdr); t.b1b = this._fboTex(Math.max(1, w >> 2), Math.max(1, h >> 2), hdr);
        t.b2a = this._fboTex(Math.max(1, w >> 3), Math.max(1, h >> 3), hdr); t.b2b = this._fboTex(Math.max(1, w >> 3), Math.max(1, h >> 3), hdr);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.targets = t; return;
      }
      // fall back: no MSAA first, then 8-bit
      this.targets = t; this._freeTargets();
      if (samples > 0) samples = 0; else hdr = false;
    }
    throw new Error('Could not create render targets.');
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.floor(window.innerWidth * dpr), ch = Math.floor(window.innerHeight * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const w = Math.max(2, Math.floor(cw * this.scale)), h = Math.max(2, Math.floor(ch * this.scale));
    if (!this.targets || this.targets.w !== w || this.targets.h !== h) { this._freeTargets(); this._makeTargets(w, h); }
    this.cw = cw; this.ch = ch; this.w = w; this.h = h;
  }

  makeMesh(geo) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [];
    const attr = (loc, data, size) => {
      const b = gl.createBuffer(); bufs.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    attr(0, geo.p, 3); attr(1, geo.n, 3); attr(2, geo.c, 3);
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

  _ortho(R, near, far) {
    const m = new Float64Array(16);
    m[0] = 1 / R; m[5] = 1 / R; m[10] = -2 / (far - near); m[14] = -(far + near) / (far - near); m[15] = 1;
    return m;
  }

  // Render each shadow cascade around `focus` (world coords). drawFn(cascadeIndex, radius) must issue the draw calls.
  renderShadows(focus, eye, drawFn) {
    const gl = this.gl;
    this.eye = eye; this.shadowsOn = this.sh.length > 0;
    if (!this.shadowsOn) return;
    const L = SUN, D = 420;
    const V0 = m4lookAt([0, 0, 0], [-L[0], -L[1], -L[2]], [0, 1, 0]);
    this.sh.forEach((s, ci) => {
      const texel = (2 * s.radius) / s.size;
      const c = [V0[0] * focus[0] + V0[4] * focus[1] + V0[8] * focus[2], V0[1] * focus[0] + V0[5] * focus[1] + V0[9] * focus[2], V0[2] * focus[0] + V0[6] * focus[1] + V0[10] * focus[2]];
      const cs = [Math.round(c[0] / texel) * texel, Math.round(c[1] / texel) * texel];
      const T = m4translate(-cs[0], -cs[1], -(c[2] + D));
      const P = this._ortho(s.radius, 1, 1000);
      const M = m4mul(P, m4mul(T, V0));
      s.worldM = M;
      const rel = m4mul(M, m4translate(eye[0], eye[1], eye[2]));
      for (let i = 0; i < 16; i++) s.m[i] = rel[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo);
      gl.viewport(0, 0, s.size, s.size);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.colorMask(false, false, false, false);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2.0, 4.0);
      gl.useProgram(this.depth.p);
      gl.uniformMatrix4fv(this.depth.u.uVP, false, s.m);
      this.pass = 'shadow';
      drawFn(ci, s.radius);
      this.pass = 'main';
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.colorMask(true, true, true, true);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    const f = rel.map((x) => x / Math.hypot(...rel));
    let r = [f[1] * cam.up[2] - f[2] * cam.up[1], f[2] * cam.up[0] - f[0] * cam.up[2], f[0] * cam.up[1] - f[1] * cam.up[0]];
    const rl = Math.hypot(...r); r = r.map((x) => x / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    this.pxScale = this.h / (2 * Math.tan(fovy / 2));

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.sceneFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.sky.p);
    const s = this.sky.u, hz = lin(HORIZON), zn = lin(ZENITH);
    gl.uniform3fv(s.uRight, r); gl.uniform3fv(s.uUp, u); gl.uniform3fv(s.uFwd, f);
    gl.uniform2f(s.uTan, Math.tan(fovy / 2) * aspect, Math.tan(fovy / 2));
    gl.uniform3fv(s.uSun, SUN); gl.uniform1f(s.uTime, time);
    gl.uniform3fv(s.uHorizon, hz); gl.uniform3fv(s.uZenith, zn);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.main.p);
    const m = this.main.u;
    gl.uniformMatrix4fv(m.uVP, false, this.vp);
    gl.uniform3fv(m.uSun, SUN); gl.uniform3fv(m.uFogColor, hz);
    gl.uniform3fv(m.uHorizon, hz); gl.uniform3fv(m.uZenith, zn);
    gl.uniform2fv(m.uFog, this.fogRange); gl.uniform1f(m.uTime, time);
    // shadows
    const n = this.shadowsOn ? this.sh.length : 0;
    gl.uniform1i(m.uShN, n);
    gl.uniform1i(m.uSh0, 0); gl.uniform1i(m.uSh1, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, n > 0 ? this.sh[0].tex : this.dummy);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, n > 1 ? this.sh[1].tex : this.dummy);
    if (n > 0) {
      gl.uniformMatrix4fv(m.uShM0, false, this.sh[0].m);
      if (n > 1) gl.uniformMatrix4fv(m.uShM1, false, this.sh[1].m);
      gl.uniform2f(m.uShTex, (2 * this.sh[0].radius) / this.sh[0].size, n > 1 ? (2 * this.sh[1].radius) / this.sh[1].size : 1);
      gl.uniform2f(m.uShInv, 1 / this.sh[0].size, n > 1 ? 1 / this.sh[1].size : 1);
    }
  }

  draw(mesh, model, opts) {
    const gl = this.gl, t = this.tmp;
    for (let i = 0; i < 16; i++) t[i] = model[i];
    t[12] = model[12] - this.eye[0]; t[13] = model[13] - this.eye[1]; t[14] = model[14] - this.eye[2];
    if (this.pass === 'shadow') {
      gl.uniformMatrix4fv(this.depth.u.uModel, false, t);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
      return;
    }
    const m = this.main.u;
    gl.uniformMatrix4fv(m.uModel, false, t);
    const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    gl.uniform1f(m.uAlpha, alpha);
    gl.uniform1f(m.uTerrain, opts && opts.terrain ? 1 : 0);
    gl.uniform1f(m.uWater, opts && opts.water ? opts.water : 0);
    gl.uniform1f(m.uSpec, opts && opts.spec ? opts.spec : 0);
    gl.uniform1f(m.uShin, opts && opts.shin ? opts.shin : 32);
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
    gl.uniform3f(this.pt.u.uLight, 2.4, 2.2, 2.0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindVertexArray(this.ptVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rel, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disable(gl.BLEND); gl.depthMask(true);
    gl.useProgram(this.main.p);
  }

  // resolve MSAA, bloom, tone map to the canvas.  opts: { speed (0..1) }
  end(opts = {}) {
    const gl = this.gl, t = this.targets, P = this.preset;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.bindVertexArray(null);
    if (t.ms) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.ms.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.res.fbo);
      gl.blitFramebuffer(0, 0, t.w, t.h, 0, 0, t.w, t.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    const emptyVao = this.skyVao;
    gl.bindVertexArray(emptyVao);
    const bp = this.bloomP, bu = bp.u;
    const pass = (prog, target, tex, fn) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      gl.viewport(0, 0, target ? target.w : this.cw, target ? target.h : this.ch);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      fn(); gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    gl.useProgram(bp.p); gl.uniform1i(bu.uTex, 0);
    if (P.bloom) {
      pass(bp, t.b1a, t.res.tex, () => { gl.uniform1f(bu.uMode, 0); gl.uniform1f(bu.uThresh, this.hdr ? 1.1 : 0.7); gl.uniform2f(bu.uTexel, 1 / t.w, 1 / t.h); });
      pass(bp, t.b1b, t.b1a.tex, () => { gl.uniform1f(bu.uMode, 2); gl.uniform2f(bu.uDir, 1, 0); gl.uniform2f(bu.uTexel, 1 / t.b1a.w, 1 / t.b1a.h); });
      pass(bp, t.b1a, t.b1b.tex, () => { gl.uniform1f(bu.uMode, 2); gl.uniform2f(bu.uDir, 0, 1); gl.uniform2f(bu.uTexel, 1 / t.b1a.w, 1 / t.b1a.h); });
      pass(bp, t.b2a, t.b1a.tex, () => { gl.uniform1f(bu.uMode, 1); gl.uniform2f(bu.uTexel, 1 / t.b1a.w, 1 / t.b1a.h); });
      pass(bp, t.b2b, t.b2a.tex, () => { gl.uniform1f(bu.uMode, 2); gl.uniform2f(bu.uDir, 1, 0); gl.uniform2f(bu.uTexel, 1 / t.b2a.w, 1 / t.b2a.h); });
      pass(bp, t.b2a, t.b2b.tex, () => { gl.uniform1f(bu.uMode, 2); gl.uniform2f(bu.uDir, 0, 1); gl.uniform2f(bu.uTexel, 1 / t.b2a.w, 1 / t.b2a.h); });
    }
    const cu = this.comp.u;
    gl.useProgram(this.comp.p);
    gl.uniform1i(cu.uScene, 0); gl.uniform1i(cu.uB1, 1); gl.uniform1i(cu.uB2, 2);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.b1a.tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, t.b2a.tex);
    pass(this.comp, null, t.res.tex, () => {
      gl.uniform1f(cu.uSpeed, opts.speed || 0); gl.uniform1f(cu.uTime, this.time % 100);
      gl.uniform1f(cu.uBloom, P.bloom ? 0.32 : 0); gl.uniform1f(cu.uExposure, this.hdr ? 0.82 : 0.9);
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }
}
