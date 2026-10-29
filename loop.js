// RaceX · Vancouver Loop — SR-500 W, I-5 S, SR-14 E, I-205 N. Real OSM centerline + USGS elevation, stylized NFSU look.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const Q = new URLSearchParams(location.search);
const LOW = Q.has('low'), AUTO = Q.has('auto'), NIGHT = Q.has('night'), DAY = !NIGHT;
const MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent)) || Q.has('mobile');
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = THREE.MathUtils.lerp;
let seed = 7; const srnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };

// ---------- track ----------
const [TR, TG, TBIN] = await Promise.all([fetch('loop.json').then(r => r.json()), fetch('terrain.json').then(r => r.json()), fetch('terrain.bin').then(r => r.arrayBuffer())]);
const P = TR.pts.map(p => new THREE.Vector3(p[0], p[2], p[1]));
const N = P.length, STEP = TR.step, L = N * STEP;
const W = i => ((i % N) + N) % N, PI = i => P[W(i)];
const T = P.map((p, i) => { const a = PI(i - 2), b = PI(i + 2); return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(); });
const RN = T.map(t => new THREE.Vector3(-t.z, 0, t.x)); // right of travel
// sections: highway name per sample, nice names
const SECN = { 'SR-500': 'SR-500 WEST', 'I-5': 'I-5 SOUTH', 'SR-14': 'SR-14 EAST', 'I-205': 'I-205 NORTH' };
const SEC = new Array(N); TR.secs.forEach(([nm, i0], k) => { const i1 = k + 1 < TR.secs.length ? TR.secs[k + 1][1] : N; for (let i = i0; i < i1; i++) SEC[i] = nm; });
const RAMP = SEC.map(s => s === 'Ramp'), BRG = TR.bridge;
const nextHwy = i => { for (let k = 0; k < N; k++) { const s = SEC[W(i + k)]; if (s !== 'Ramp') return s; } };
const secAt = s => SEC[W(Math.floor(s / STEP))];
const secRange = nm => { const r = []; TR.secs.forEach(([n2, i0], k) => { if (n2 === nm) r.push([i0, k + 1 < TR.secs.length ? TR.secs[k + 1][1] : N]); }); return r; };
const LANE = 3.7, LANES = [-LANE, 0, LANE], EDGE = 6.9; // 3 eastbound lanes, d in [-6.9, 6.9]
function frame(s, out) { // centre, tangent, right, heading at distance s
  const f = (((s / STEP) % N) + N) % N, i = Math.floor(f), t = f - i, j = W(i + 1);
  out.p.lerpVectors(P[i], P[j], t); out.t.lerpVectors(T[i], T[j], t).normalize(); out.r.set(-out.t.z, 0, out.t.x);
  out.h = Math.atan2(out.t.x, out.t.z); return out;
}
const mkF = () => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), r: new THREE.Vector3(), h: 0 });
const F = mkF(), F2 = mkF();
function at(s, d, y = 0, v = new THREE.Vector3()) { frame(s, F2); return v.copy(F2.p).addScaledVector(F2.r, d).setY(F2.p.y + y); }

// ---------- renderer ----------
const R = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio, LOW ? 1 : MOBILE ? 1.3 : 1.6);
R.setPixelRatio(DPR); R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = DAY ? 1.0 : 1.05; R.shadowMap.enabled = DAY; R.shadowMap.type = THREE.PCFShadowMap; R.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(R.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(DAY ? 0xaecbe6 : 0x05060d); scene.fog = DAY ? new THREE.FogExp2(0xc9d6e2, 0.00017) : new THREE.FogExp2(0x0a0b18, 0.0026);
const cam = new THREE.PerspectiveCamera(62, 2, 0.5, 16000);

const SUN = new THREE.Vector3(-0.52, 0.44, 0.74).normalize(); // ~3pm late-Oct sun, SSW (+z = south here)
const SKY_DAY = `uniform vec3 sun;varying vec3 v;
float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,r=0.;for(int i=0;i<5;i++){r+=a*ns(p);p*=2.03;a*=.5;}return r;}
void main(){vec3 d=normalize(v);float h=max(d.y,0.);vec3 c=mix(vec3(.62,.76,.9),vec3(.16,.38,.72),pow(h,.55));
 float sd=max(dot(d,sun),0.);c+=vec3(1.,.85,.6)*pow(sd,8.)*.35+vec3(1.,.95,.85)*pow(sd,900.)*6.;
 if(d.y>0.){vec2 uv=d.xz/(d.y+.12)*1.6;float cl=smoothstep(.5,.78,fbm(uv+vec2(3.,1.)));float sh=fbm(uv*1.3+vec2(.4,.2));c=mix(c,mix(vec3(1.),vec3(.62,.66,.74),sh*.8)*(1.+pow(sd,6.)*.4),cl*smoothstep(0.,.18,d.y)*.92);}
 c=mix(c,vec3(.72,.8,.86),exp(-h*9.)*.55);if(d.y<0.)c=vec3(.5,.6,.66);gl_FragColor=vec4(c,1.);}`;
// sky dome: low cloud glowing sodium-orange from city light
{ const g = new THREE.SphereGeometry(5000, 32, 16); const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: {}, vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: DAY ? SKY_DAY : 'varying vec3 v;void main(){float h=max(v.y,0.);vec3 c=mix(vec3(.16,.075,.06),vec3(.012,.014,.03),pow(h,.45));c+=vec3(.09,.03,.08)*exp(-abs(v.y)*14.);gl_FragColor=vec4(c,1.);}' });
  if (DAY) m.uniforms.sun = { value: SUN }; const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky); scene.userData.sky = sky; }
scene.add(DAY ? new THREE.HemisphereLight(0xc4dcff, 0x56603e, .95) : new THREE.HemisphereLight(0x3a4a80, 0x140a10, 0.5));
const moonL = DAY ? new THREE.DirectionalLight(0xfff0d8, 2.6) : new THREE.DirectionalLight(0x8090ff, 0.35); moonL.position.set(200, 400, -300); scene.add(moonL, moonL.target);
if (DAY) { moonL.castShadow = true; const sz = MOBILE || LOW ? 1024 : 2048; moonL.shadow.mapSize.set(sz, sz); const sc = moonL.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400; moonL.shadow.bias = -.0006; moonL.shadow.normalBias = .04; }

// environment map for wet reflections: dark room with sodium strips and neon
{ const es = new THREE.Scene(); es.background = new THREE.Color(0x020205);
  const add = (c, w, h, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: 2 })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; add(new THREE.Color(3, 1.3, .35), 2, .6, Math.cos(a) * 20, 8, Math.sin(a) * 20); }
  add(new THREE.Color(0, 1.6, 2.4), 30, 1, 0, 3, -30); add(new THREE.Color(2.4, 0, 1.2), 30, 1, 0, 3, 30); add(new THREE.Color(.25, .12, .1), 80, 30, 0, 40, 0);
  const pm = new THREE.PMREMGenerator(R); scene.environment = DAY ? pm.fromScene(new RoomEnvironment(), 0.04).texture : pm.fromScene(es, 0.03).texture; scene.environmentIntensity = DAY ? .55 : 0.35; }

// ---------- textures ----------
function canvasTex(w, h, fn, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; }
const glowTex = (r, g, b, soft = 1) => canvasTex(64, 64, (x) => { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(255,255,255,1)`); gr.addColorStop(.18 * soft, `rgba(${r},${g},${b},.85)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); });
const flareTex = canvasTex(128, 128, x => { const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.12, 'rgba(220,235,255,.8)'); gr.addColorStop(1, 'rgba(120,160,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); x.globalCompositeOperation = 'lighter'; const h = x.createLinearGradient(0, 0, 128, 0); h.addColorStop(0, 'rgba(150,190,255,0)'); h.addColorStop(.5, 'rgba(210,230,255,.9)'); h.addColorStop(1, 'rgba(150,190,255,0)'); x.fillStyle = h; x.fillRect(0, 62, 128, 4); x.fillRect(62, 40, 4, 48); });
const streakTex = canvasTex(32, 256, (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.75, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,.95)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); const g2 = x.createLinearGradient(0, 0, w, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = g2; x.fillRect(0, 0, w, h); });
// asphalt: albedo + roughness (puddles) along u = across, v = along
const asphalt = canvasTex(512, 512, (x, w, h) => { x.fillStyle = DAY ? '#3c3c40' : '#16161a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 26000; i++) { const g = (DAY ? 44 : 14) + Math.random() * (DAY ? 46 : 26) | 0; x.fillStyle = `rgb(${g},${g},${g + 3})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  x.fillStyle = DAY ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.35)'; for (let i = 0; i < 4; i++) { const u = [.37, .63, .19, .81][i] * w; x.fillRect(u - 14, 0, 28, h); } // darker wheel tracks
  const line = (u, col, dash) => { x.fillStyle = col; if (!dash) x.fillRect(u - 4, 0, 8, h); else for (let v = 0; v < h; v += 256) x.fillRect(u - 3, v, 6, 64); };
  line(.035 * w, '#d8b830'); line(.965 * w, '#e8e8e8'); line(w / 3, '#e8e8e8', 1); line(2 * w / 3, '#e8e8e8', 1); }, true);
const rough = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { const px = Math.random() * w, py = Math.random() * h, r = rnd(8, 34); const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.beginPath(); x.ellipse(px, py, r * .6, r * 1.8, 0, 0, 7); x.fill(); } }, true);
rough.colorSpace = THREE.NoColorSpace;

// ---------- sweep helper: extrude a cross-section profile along the track ----------
// prof: array of [d, y] (d across, + = right), uv u along profile; built per track sample (every k points)
function sweep(prof, mat, { k = 1, s0 = 0, s1 = L, vScale = 0.1, use = null, add = true } = {}) {
  const pos = [], uv = [], idx = []; const i0 = Math.floor(s0 / STEP), i1 = Math.ceil(s1 / STEP); let rows = 0, prevOk = false;
  const ul = [0]; for (let j = 1; j < prof.length; j++) ul.push(ul[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]));
  const n = prof.length;
  for (let ii = i0; ii <= i1; ii += k) { const i = W(ii); const ok = !use || use(i); if (!ok) { prevOk = false; continue; } const p = P[i], r = RN[i];
    for (let j = 0; j < n; j++) { pos.push(p.x + r.x * prof[j][0], p.y + prof[j][1], p.z + r.z * prof[j][0]); uv.push(ul[j] / (ul[n - 1] || 1), ii * STEP * vScale); }
    if (prevOk) for (let j = 0; j < n - 1; j++) { const q = (rows - 1) * n + j; idx.push(q, q + n, q + 1, q + 1, q + n, q + n + 1); }
    rows++; prevOk = true; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = DAY; m.frustumCulled = false; if (add) scene.add(m); return m;
}
const HWY = i => !RAMP[i];
// road surface (3 lanes + shoulders), wet
const roadMat = DAY ? new THREE.MeshStandardMaterial({ map: asphalt, roughness: .9, metalness: 0, color: 0x9a9a9e, envMapIntensity: .15 }) : new THREE.MeshPhysicalMaterial({ map: asphalt, roughnessMap: rough, roughness: 0.55, metalness: 0.0, clearcoat: .55, clearcoatRoughness: 0.2, envMapIntensity: .22, color: 0x9a9aa0 });
asphalt.repeat.set(1, 1); rough.repeat.set(1, 1);
sweep([[7.6, 0], [-7.6, 0]], roadMat, { vScale: 1 / 24 });
// oncoming carriageway (left, beyond median) + median gap
sweep([[-9.4, 0.0], [-21, 0.0]], DAY ? new THREE.MeshStandardMaterial({ map: asphalt, roughness: .92, color: 0x8a8a8e, envMapIntensity: .15 }) : new THREE.MeshPhysicalMaterial({ color: 0x15151a, roughnessMap: rough, roughness: .8, clearcoat: .25, clearcoatRoughness: .3, envMapIntensity: .2 }), { vScale: 1 / 24, k: 2, use: HWY });
// Jersey barrier (median, left) — NJ profile both faces
const conc = new THREE.MeshStandardMaterial({ color: DAY ? 0xb4b2aa : 0x48484a, roughness: .85 });
sweep([[-7.6, 0], [-7.95, .08], [-8.1, .33], [-8.25, .82], [-8.45, .82], [-8.6, .33], [-8.75, .08], [-9.1, 0]], conc, { k: 2, vScale: .2, use: HWY });
// right shoulder kerb + W-beam guardrail + posts
const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: .9, roughness: .35 });
sweep([[8.35, .55], [8.32, .62], [8.38, .7], [8.32, .78], [8.36, .86], [8.36, .55]], steel, { k: 1 });
sweep([[-8.36, .55], [-8.36, .86], [-8.32, .78], [-8.38, .7], [-8.32, .62], [-8.35, .55]], steel, { k: 1, use: i => RAMP[i] });
// road-fill embankments (skirts) so the deck meets the real terrain; skipped on bridges
const grass = new THREE.MeshStandardMaterial({ color: DAY ? 0x5d7a36 : 0x0c140c, roughness: 1 });
const notBr = i => !BRG[i];
sweep([[8.5, .5], [9.5, 0], [16, -3.5], [26, -11]], grass, { k: 2, use: notBr });
sweep([[-26, -11], [-21.5, -.3], [-21, 0]], grass, { k: 2, use: i => notBr(i) && HWY(i) });
sweep([[-26, -11], [-16, -3.5], [-9.5, 0], [-8.5, .5]], grass, { k: 2, use: i => notBr(i) && RAMP[i] });
// bridge decks: underside slab + piers
{ const deck = new THREE.MeshStandardMaterial({ color: DAY ? 0x9a978e : 0x2a2a2c, roughness: .9 });
  sweep([[-22, 0], [-22, -1.6], [9, -1.6], [9, 0]], deck, { k: 2, use: i => BRG[i] && HWY(i) }); sweep([[-9, 0], [-9, -1.6], [9, -1.6], [9, 0]], deck, { k: 2, use: i => BRG[i] && RAMP[i] });
  const pg = new THREE.BoxGeometry(2, 1, 1.4); pg.translate(0, -.5, 0); const ps = []; for (let i = 0; i < N; i += 9) if (BRG[i]) ps.push(i);
  const im = new THREE.InstancedMesh(pg, deck, ps.length * 2); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  ps.forEach((i, k) => [-5, 5].forEach((d, j) => { const p = P[i], h = p.y + 30; q.setFromAxisAngle(up, Math.atan2(T[i].x, T[i].z)); m4.compose(new THREE.Vector3(p.x + RN[i].x * (RAMP[i] ? d * .6 : d - 6), p.y - 1.5, p.z + RN[i].z * (RAMP[i] ? d * .6 : d - 6)), q, new THREE.Vector3(1, h, 1)); im.setMatrixAt(k * 2 + j, m4); }));
  im.castShadow = DAY; scene.add(im); }
// ---------- real terrain (USGS 3DEP via AWS Terrarium), carved under the road ----------
const [GX0, GZ0, GS, GNX, GNY] = TG.grid, DEM = new Int16Array(TBIN), WATER_Y = TG.water;
const demAt = (x, z) => { const fx = clamp((x - GX0) / GS, 0, GNX - 1.001), fy = clamp((GZ0 - z) / GS, 0, GNY - 1.001), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const a = DEM[j * GNX + i], b = DEM[j * GNX + i + 1], c = DEM[(j + 1) * GNX + i], d = DEM[(j + 1) * GNX + i + 1]; return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) / 10; };
{ const sk = LOW ? 2 : 1, nx = Math.floor((GNX - 1) / sk) + 1, ny = Math.floor((GNY - 1) / sk) + 1; const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), idx = [];
  const c1 = new THREE.Color(DAY ? 0x5f7d38 : 0x0b120a), c2 = new THREE.Color(DAY ? 0x7c8a46 : 0x101410), c3 = new THREE.Color(DAY ? 0x3f5a2a : 0x080d08), cs = new THREE.Color(DAY ? 0x9a8e70 : 0x14120f), tc = new THREE.Color();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, x = GX0 + i * sk * GS, z = GZ0 - j * sk * GS, h = DEM[j * sk * GNX + i * sk] / 10;
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; const nz = Math.sin(x * .013) * Math.sin(z * .011) + Math.sin(x * .041 + z * .037) * .5;
    tc.copy(c1).lerp(nz > .3 ? c2 : c3, Math.abs(nz) * .6); if (h < WATER_Y + 2.5) tc.lerp(cs, clamp((WATER_Y + 2.5 - h) / 2, 0, 1)); col[k * 3] = tc.r; col[k * 3 + 1] = tc.g; col[k * 3 + 2] = tc.b; }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const q = j * nx + i; idx.push(q, q + 1, q + nx, q + 1, q + nx + 1, q + nx); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); m.receiveShadow = DAY; scene.add(m); scene.userData.terrain = m; }
// Columbia River: one water plane at river level, the terrain hides it everywhere else
{ const g = new THREE.PlaneGeometry(60000, 60000); const cx = GX0 + GNX * GS / 2, cz = GZ0 - GNY * GS / 2;
  const water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: DAY ? 0x40627a : 0x060810, metalness: DAY ? .55 : 1, roughness: DAY ? .18 : .1, envMapIntensity: 1.2 }));
  water.rotation.x = -Math.PI / 2; water.position.set(cx, WATER_Y, cz); scene.add(water);
  // far ground ring beyond the DEM so the horizon isn't water everywhere north
  const rg = new THREE.PlaneGeometry(60000, 30000); const ring = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: DAY ? 0x56703a : 0x0a100a })); ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 60, GZ0 - GNY * GS - 15000 + 40); scene.add(ring); }
// OSM buildings: instanced boxes on the real footprints
{ const B = TG.bld.slice(0, LOW ? 2500 : MOBILE ? 4500 : 6000); const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, .5, 0);
  const winTex = canvasTex(64, 64, (x, w, h) => { x.fillStyle = DAY ? '#c9c4ba' : '#07080c'; x.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 16) for (let i = 4; i < w; i += 12) { x.fillStyle = DAY ? 'rgba(40,60,80,.55)' : (Math.random() < .4 ? '#ffc070' : '#101218'); x.fillRect(i, y, 7, 7); } }, true);
  const mat = new THREE.MeshStandardMaterial({ map: winTex, roughness: .8, emissive: NIGHT ? 0xffffff : 0, emissiveMap: NIGHT ? winTex : null, emissiveIntensity: NIGHT ? .6 : 0 });
  const im = new THREE.InstancedMesh(g, mat, B.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const PAL = [0xd8d2c4, 0xbfb6a6, 0xe6e2da, 0xa8a49c, 0xc8b49a, 0x9eaab4, 0xd2c0a8];
  B.forEach(([x, z, w, l, a, h], k) => { q.setFromAxisAngle(up, a); m4.compose(new THREE.Vector3(x, demAt(x, z) - .5, z), q, new THREE.Vector3(w, h + .5, l)); im.setMatrixAt(k, m4); im.setColorAt(k, c.setHex(PAL[k % PAL.length])); });
  im.castShadow = DAY; im.receiveShadow = DAY; scene.add(im); }
// Portland skyline far across the river to the south-west (stylized distance)
{ const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const winTex = canvasTex(64, 128, (x, w, h) => { x.fillStyle = '#05060a'; x.fillRect(0, 0, w, h); for (let y = 4; y < h; y += 8) for (let i = 3; i < w; i += 7) { if (Math.random() < .45) { x.fillStyle = Math.random() < .8 ? `rgba(255,${190 + Math.random() * 50 | 0},${110 + Math.random() * 60 | 0},.9)` : 'rgba(170,220,255,.9)'; x.fillRect(i, y, 4, 4); } } }, true);
  const mat = DAY ? new THREE.MeshStandardMaterial({ color: 0x9aa6b4, roughness: .6, metalness: .3 }) : new THREE.MeshBasicMaterial({ map: winTex, color: 0xffffff, fog: false });
  const n = LOW ? 60 : 120, im = new THREE.InstancedMesh(box, mat, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) { const r = Math.sqrt(Math.random()) * 900, a = rnd(0, 6.28); const h = r < 400 ? rnd(50, 160) : rnd(12, 60), w = rnd(22, 50);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(0, 3)); m4.compose(new THREE.Vector3(-4600 + Math.cos(a) * r, WATER_Y + 1, 7600 + Math.sin(a) * r), q, new THREE.Vector3(w, h, w)); im.setMatrixAt(i, m4); }
  scene.add(im); }

// ---------- light poles (median, double arm) with sodium heads + wet-road reflection streaks ----------
const POLE_GAP = 36, poles = [];
{ const poleG = new THREE.CylinderGeometry(.12, .18, 12, 6); poleG.translate(0, 6, 0); const armG = new THREE.BoxGeometry(.12, .12, 1); armG.translate(0, 0, .5);
  const n = Math.floor(L / POLE_GAP); const pm = new THREE.InstancedMesh(poleG, steel, n), am = new THREE.InstancedMesh(armG, steel, n * 2);
  const headG = new THREE.BoxGeometry(.5, .18, .9); const hm = new THREE.InstancedMesh(headG, new THREE.MeshBasicMaterial({ color: DAY ? new THREE.Color(.5, .5, .48) : new THREE.Color(4, 2, .7) }), n * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const sodium = new THREE.SpriteMaterial({ map: glowTex(255, 150, 60), color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const streakMat = new THREE.MeshBasicMaterial({ map: streakTex, color: 0xff9a40, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55 });
  const stG = new THREE.PlaneGeometry(1.6, 22); stG.rotateX(-Math.PI / 2); stG.translate(0, 0, 0);
  const stm = new THREE.InstancedMesh(stG, streakMat, n); stm.frustumCulled = false;
  const glowG = new THREE.CircleGeometry(7, 20); glowG.rotateX(-Math.PI / 2);
  const poolm = new THREE.InstancedMesh(glowG, new THREE.MeshBasicMaterial({ map: glowTex(255, 140, 50, 3), color: 0x6a3a14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), n * 2); poolm.frustumCulled = false;
  for (let k = 0; k < n; k++) { const s = 30 + k * POLE_GAP; frame(s, F); const base = at(s, -8.45, 0);
    q.setFromAxisAngle(up, F.h); m4.compose(base, q, new THREE.Vector3(1, 1, 1)); pm.setMatrixAt(k, m4);
    [1, -1].forEach((sd, j) => { const qa = new THREE.Quaternion().setFromAxisAngle(up, F.h + (sd > 0 ? -Math.PI / 2 : Math.PI / 2)); const ap = base.clone().setY(base.y + 11.8); m4.compose(ap, qa, new THREE.Vector3(1, 1, 4.2)); am.setMatrixAt(k * 2 + j, m4);
      const hp = at(s, -8.45 + sd * 4.2, 11.7); m4.compose(hp, q, new THREE.Vector3(1, 1, 1)); hm.setMatrixAt(k * 2 + j, m4);
      const spr = new THREE.Sprite(sodium); spr.position.copy(hp); spr.scale.setScalar(LOW ? 5 : 7); if (NIGHT) scene.add(spr);
      const pp = at(s, -8.45 + sd * 4.2, .03 + j * .005); m4.compose(pp, q, new THREE.Vector3(1, 1, 1)); poolm.setMatrixAt(k * 2 + j, m4);
      if (sd > 0) poles.push({ s, d: -8.45 + sd * 4.2, pos: hp }); });
    const sp = at(s, -4.2, .04); m4.compose(sp, q, new THREE.Vector3(1, 1, 1)); stm.setMatrixAt(k, m4); }
  pm.castShadow = DAY; scene.add(pm, am, hm); if (NIGHT) scene.add(stm, poolm); }
// real dynamic lights: small pool following the nearest poles (sodium) — cheap
const lightPool = []; for (let i = 0; i < (DAY ? 0 : LOW ? 3 : 6); i++) { const l = new THREE.PointLight(0xff9a40, 110, 30, 1.6); scene.add(l); lightPool.push(l); }
// neon: a few roadside billboards / signage glow on the left hill (NFSU flavour)
if (NIGHT) { const neon = [['#00e5ff', 'RIVERSIDE'], ['#ff2a6d', 'MOTEL'], ['#c040ff', '24 HR'], ['#30ff8a', 'TACOS']];
  Array.from({ length: 18 }, (_, i) => [600 + i * 1450, -34 - (i % 3) * 5, i % 4]).forEach(([s, d, k]) => { const [c, t] = neon[k];
    const tex = canvasTex(256, 96, (x, w, h) => { x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, w, h); x.font = 'italic bold 54px Arial Black'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = c; x.shadowBlur = 18; x.fillStyle = c; x.fillText(t, w / 2, h / 2); x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = .7; x.fillText(t, w / 2, h / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(2.2, 2.2, 2.2), side: 2, depthWrite: false })); const p = at(s, d, 9 + (6)); m.position.copy(p); frame(s, F); m.rotation.y = F.h + Math.PI + .5; scene.add(m);
    const pl = new THREE.PointLight(new THREE.Color(c), 60, 30, 1.6); pl.position.copy(p).y -= 2; scene.add(pl); }); }

// ---------- overhead WSDOT-green sign gantries ----------
function signTex(lines) { return canvasTex(1024, 384, (x, w, h) => { x.fillStyle = '#0b5a2e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#eee'; x.lineWidth = 8; x.strokeRect(10, 10, w - 20, h - 20);
  lines.forEach(([txt, sz, y, extra]) => { x.fillStyle = '#f2f2f2'; x.font = `bold ${sz}px "Arial Narrow", Arial`; x.textAlign = 'center'; x.fillText(txt, w / 2, y); });
  if (lines.exit) { x.fillStyle = '#0b5a2e'; } }); }
function exitTab(txt) { return canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#0b5a2e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#eee'; x.lineWidth = 5; x.strokeRect(4, 4, w - 8, h + 10); x.fillStyle = '#fff'; x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.fillText(txt, w / 2, 48); }); }
const DEST = { 'SR-500 WEST': ['500  WEST', 'I-5', 'Seattle · Portland'], 'I-5 SOUTH': ['5  SOUTH', 'Portland', 'Salem'], 'SR-14 EAST': ['14  EAST', 'Camas', 'Washougal'], 'I-205 NORTH': ['205  NORTH', 'Seattle', 'Orchards'] };
const JCT = { 'I-5 SOUTH': ['EXIT 1A', 'SR-14 East', 'Camas'], 'SR-14 EAST': ['EXIT 8', 'I-205 North', 'Seattle'], 'I-205 NORTH': ['EXIT 30', 'SR-500 West', 'Vancouver'], 'SR-500 WEST': ['EXIT 1C', 'I-5 South', 'Portland'] };
const gantries = [];
TR.secs.forEach(([nm, i0], k) => { if (nm === 'Ramp') return; const i1 = k + 1 < TR.secs.length ? TR.secs[k + 1][1] : N; const s0 = i0 * STEP, s1 = i1 * STEP, D = DEST[SECN[nm]], J = JCT[SECN[nm]];
  for (let s = s0 + 300; s < s1 - 900; s += 1400) gantries.push({ s, d: -1.5, w: 9, lines: [[D[0], 110, 150], [D[1], 92, 260], [D[2], 80, 345]] });
  if (s1 - s0 > 1500 && (k + 1 < TR.secs.length || nm === 'SR-500')) { [[1000, '½ MILE'], [400, 'EXIT ONLY']].forEach(([b, t]) => { if (s1 - b > s0 + 200) gantries.push({ s: s1 - b, d: 3.7, w: 7.2, tab: J[0], lines: [[J[1], 92, 140], [J[2], 80, 250], [t, 72, 340]] }); }); } });
for (const g of gantries) { if (BRG[W(Math.floor(g.s / STEP))] && 0) continue; frame(g.s, F); const grp = new THREE.Group(); const q = F.h;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(17.6, .5, .5), steel); beam.position.set(0, 7.3, 0); grp.add(beam);
  [-8.6, 8.6].forEach(x => { const c = new THREE.Mesh(new THREE.BoxGeometry(.4, 7.6, .4), steel); c.position.set(x, 3.8, 0); grp.add(c); });
  const sm = new THREE.MeshStandardMaterial({ map: signTex(g.lines), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0, roughness: .5 }); sm.emissiveMap = sm.map; sm.emissiveIntensity = DAY ? .12 : .55;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(g.w, g.w * .375), sm); sign.position.set(-g.d, 8.9, -.3); sign.rotation.y = Math.PI; grp.add(sign);
  if (g.tab) { const tm = new THREE.MeshStandardMaterial({ map: exitTab(g.tab), roughness: .5, emissive: 0xffffff, emissiveIntensity: .55 }); tm.emissiveMap = tm.map; const tb = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .65), tm); tb.position.set(-g.d - g.w / 2 + 1.3, 8.9 + g.w * .1875 + .32, -.3); tb.rotation.y = Math.PI; grp.add(tb); }
  // sign lights
  const sl = new THREE.Mesh(new THREE.BoxGeometry(g.w, .08, .2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6) })); sl.position.set(-g.d, 8.9 - g.w * .1875 - .25, -.8); grp.add(sl);
  grp.traverse(o => { if (o.isMesh) o.castShadow = DAY; }); const c = at(g.s, 0, 0); grp.position.copy(c); grp.rotation.y = q; scene.add(grp); }

// ---------- fir tree cards (instanced crossed quads) ----------
{ const firTex = canvasTex(128, 256, (x, w, h) => { x.clearRect(0, 0, w, h); for (let i = 0; i < 26; i++) { const y = 20 + i * 8.6, hw = 6 + i * 2.2; x.fillStyle = `rgb(${8 + Math.random() * 10 | 0},${22 + Math.random() * 16 | 0},${14 + Math.random() * 10 | 0})`; x.beginPath(); x.moveTo(w / 2, y - 14); x.lineTo(w / 2 - hw, y + 12); x.lineTo(w / 2 + hw, y + 12); x.fill(); } x.fillStyle = '#1a120c'; x.fillRect(w / 2 - 4, h - 26, 8, 26); });
  const g1 = new THREE.PlaneGeometry(1, 1); g1.translate(0, .5, 0); const g2 = g1.clone().rotateY(Math.PI / 2); const gg = new THREE.BufferGeometry();
  const merge = (a, b) => { const pa = [...a.attributes.position.array, ...b.attributes.position.array], ua = [...a.attributes.uv.array, ...b.attributes.uv.array], na = [...a.attributes.normal.array, ...b.attributes.normal.array]; const ia = [...a.index.array, ...b.index.array.map(v => v + 4)]; gg.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(ua, 2)); gg.setAttribute('normal', new THREE.Float32BufferAttribute(na, 3)); gg.setIndex(ia); };
  merge(g1, g2);
  const mat = new THREE.MeshStandardMaterial({ map: firTex, alphaTest: .5, side: 2, roughness: 1, color: DAY ? new THREE.Color(2.4, 2.6, 2.2) : 0x9aa89a });
  const n = LOW ? 2500 : MOBILE ? 4500 : 6500, im = new THREE.InstancedMesh(gg, mat, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let k = 0, tries = 0; while (k < n && tries < n * 20) { tries++; const s = rnd(0, L), d = (Math.random() < .5 ? -1 : 1) * rnd(32, 420); const p = at(s, d, 0); const y = demAt(p.x, p.z); if (y < WATER_Y + 1.5) continue;
    let near = false; for (let j = -6; j <= 6 && !near; j++) { const qq = P[W(Math.floor(s / STEP) + j * 15)]; if (Math.hypot(qq.x - p.x, qq.z - p.z) < 28) near = true; } if (near) continue;
    const h = rnd(9, 26); q.setFromAxisAngle(up, rnd(0, 3.14)); m4.compose(p.setY(y - .5), q, new THREE.Vector3(h * .42, h, h * .42)); im.setMatrixAt(k++, m4); }
  im.count = k;
  im.castShadow = DAY; scene.add(im); }

// ---------- speed-sense roadside detail (dense, close to the lanes) ----------
{ const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  // reflector delineator posts every 12 m on the right shoulder
  const n = Math.floor(L / 12), postG = new THREE.BoxGeometry(.1, 1.1, .1); postG.translate(0, .55, 0);
  const pim = new THREE.InstancedMesh(postG, new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: .6 }), n);
  const rG = new THREE.BoxGeometry(.11, .16, .11); const rim = new THREE.InstancedMesh(rG, new THREE.MeshBasicMaterial({ color: DAY ? new THREE.Color(1, .6, .1) : new THREE.Color(4, 2.2, .3) }), n);
  // Jersey barrier segment joints every 6 m + small top reflectors every 24 m
  const nj = Math.floor(L / 6), jG = new THREE.BoxGeometry(1.4, .86, .07); jG.translate(0, .42, 0);
  const jim = new THREE.InstancedMesh(jG, new THREE.MeshStandardMaterial({ color: DAY ? 0x6e6c66 : 0x202022, roughness: 1 }), nj);
  for (let i = 0; i < n; i++) { const s = 6 + i * 12; frame(s, F); q.setFromAxisAngle(up, F.h); m4.compose(at(s, 8.0, 0), q, one); pim.setMatrixAt(i, m4); m4.compose(at(s, 8.0, .92), q, one); rim.setMatrixAt(i, m4); }
  for (let i = 0; i < nj; i++) { const s = i * 6; if (RAMP[W(Math.floor(s / STEP))]) { m4.makeScale(0, 0, 0); jim.setMatrixAt(i, m4); continue; } frame(s, F); q.setFromAxisAngle(up, F.h); m4.compose(at(s, -8.35, 0), q, one); jim.setMatrixAt(i, m4); }
  pim.castShadow = DAY; jim.frustumCulled = pim.frustumCulled = rim.frustumCulled = false; scene.add(pim, rim, jim); }
// ---------- Mt. Hood: snow-capped stratovolcano across the river, ESE (placed ~9 km for depth range; real ~80 km) ----------
if (DAY) { const g = new THREE.ConeGeometry(1, 1, 48, 12, true); const pos = g.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) + .5; const a = Math.atan2(pos.getZ(i), pos.getX(i)); const rr = 1 + (Math.sin(a * 5) * .06 + Math.sin(a * 11 + 1) * .04) * (1 - y);
    pos.setX(i, pos.getX(i) * rr); pos.setZ(i, pos.getZ(i) * rr); const snow = y > .55 + Math.sin(a * 9) * .08; col.push(...(snow ? [.95, .97, 1] : [.42, .5, .62])); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.translate(0, .5, 0); g.computeVertexNormals();
  const hood = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: .93 }));
  hood.position.set(12500, -80, 4200); hood.scale.set(3600, 2100, 3600); hood.renderOrder = -0.5; scene.add(hood);
  // low distant ridges (Cascade foothills) across the river
  const rg = new THREE.PlaneGeometry(26000, 400, 120, 1); const rp2 = rg.attributes.position; for (let i = 0; i < rp2.count; i++) if (rp2.getY(i) > 0) rp2.setY(i, 40 + Math.abs(Math.sin(rp2.getX(i) * .0009) * 160 + Math.sin(rp2.getX(i) * .0031) * 60));
  const ridge = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x6f8aa0, fog: false })); ridge.position.set(4000, WATER_Y - 30, 9000); ridge.rotation.y = -.15; scene.add(ridge);
  // sun glints on the river: a field of tiny additive sparkles that twinkle
  const gp = []; for (let i = 0, t = 0; i < 900 && t < 20000; t++) { const x = rnd(GX0, GX0 + GNX * GS), z = rnd(GZ0 - GNY * GS, GZ0); if (demAt(x, z) < WATER_Y - .3) { gp.push(x, WATER_Y + .2, z); i++; } }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  const glint = new THREE.Points(gg, new THREE.PointsMaterial({ size: 2.2, map: glowTex(255, 250, 230, 1), color: 0xfff4d0, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(glint); scene.userData.glint = glint; }

// ---------- rain ----------
const RAIN_N = LOW ? 900 : 2200; const rainG = new THREE.BufferGeometry(); const rp = new Float32Array(RAIN_N * 6); rainG.setAttribute('position', new THREE.BufferAttribute(rp, 3));
const rainBase = []; for (let i = 0; i < RAIN_N; i++) rainBase.push([rnd(-30, 30), rnd(0, 22), rnd(-30, 40)]);
const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: 0x8890b0, transparent: true, opacity: .35, fog: false })); rain.frustumCulled = false; rain.visible = NIGHT; scene.add(rain);
// mist sheets
const mistMat = new THREE.SpriteMaterial({ map: glowTex(120, 110, 130, 4), color: 0x3a3440, transparent: true, opacity: .1, depthWrite: false }); const mists = []; for (let i = 0; i < 10; i++) { const m = new THREE.Sprite(mistMat); m.scale.set(120, 30, 1); m.visible = false; scene.add(m); mists.push(m); }

// ---------- vehicles ----------
const paint = c => new THREE.MeshPhysicalMaterial({ color: c, metalness: .7, roughness: .35, clearcoat: 1, clearcoatRoughness: .05 });
const glassM = new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: .9, roughness: .05 });
const tyreM = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: .8 });
const tailM = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, .15, .1) }), headM = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 3.6) });
const tailSpr = new THREE.SpriteMaterial({ map: glowTex(255, 30, 20), color: 0xff3020, transparent: true, opacity: DAY ? .3 : 1, depthWrite: false, blending: THREE.AdditiveBlending });
const headSpr = new THREE.SpriteMaterial({ map: flareTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const shadowTex = canvasTex(64, 128, (x, w, h) => { const g = x.createRadialGradient(32, 64, 4, 32, 64, 60); g.addColorStop(0, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const shadowM = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: DAY ? .55 : 1 });
function box(w, h, l, m, x = 0, y = 0, z = 0) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(x, y, z); return b; }
function wheelsOn(g, w, l, r = .34) { const wg = new THREE.CylinderGeometry(r, r, .26, 12); wg.rotateZ(Math.PI / 2); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => { const m = new THREE.Mesh(wg, tyreM); m.position.set(sx * w / 2, r, sz * l * .34); g.add(m); }); }
function shadow(g, w, l) { const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.4, l * 1.25), shadowM); s.rotation.x = -Math.PI / 2; s.position.y = .06; g.add(s); }
function sedan(col) { const g = new THREE.Group(), m = paint(col); g.add(box(1.85, .62, 4.6, m, 0, .62, 0)); g.add(box(1.6, .52, 2.3, glassM, 0, 1.18, -.25)); g.add(box(1.5, .06, 2.0, m, 0, 1.46, -.25));
  g.add(box(.4, .14, .05, tailM, -.62, .78, -2.31), box(.4, .14, .05, tailM, .62, .78, -2.31), box(.34, .12, .05, headM, -.6, .7, 2.31), box(.34, .12, .05, headM, .6, .7, 2.31)); wheelsOn(g, 1.7, 4.6); shadow(g, 1.85, 4.6);
  [-.62, .62].forEach(x => { const s = new THREE.Sprite(tailSpr); s.position.set(x, .78, -2.4); s.scale.setScalar(1.1); g.add(s); }); g.userData = { w: 1.9, l: 4.6 }; return g; }
function suv(col) { const g = new THREE.Group(), m = paint(col); g.add(box(1.95, .9, 4.8, m, 0, .8, 0)); g.add(box(1.8, .6, 3.2, glassM, 0, 1.55, -.3)); g.add(box(1.8, .08, 3.2, m, 0, 1.88, -.3));
  g.add(box(.3, .3, .05, tailM, -.75, 1.0, -2.41), box(.3, .3, .05, tailM, .75, 1.0, -2.41)); wheelsOn(g, 1.8, 4.8, .4); shadow(g, 1.95, 4.8);
  [-.75, .75].forEach(x => { const s = new THREE.Sprite(tailSpr); s.position.set(x, 1, -2.5); s.scale.setScalar(1.2); g.add(s); }); g.userData = { w: 2, l: 4.8 }; return g; }
const trailerTex = canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#8a8a8e'; x.fillRect(0, 0, w, h); x.fillStyle = '#c0242c'; x.font = 'italic bold 70px Arial Black'; x.fillText('FRED·LINE', 30, 90); x.fillStyle = '#999'; x.fillRect(0, h - 8, w, 8); });
function truck() { const g = new THREE.Group(); const tm = new THREE.MeshStandardMaterial({ map: trailerTex, roughness: .6 }); const white = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: .6 });
  const tr = new THREE.Mesh(new THREE.BoxGeometry(2.55, 3.0, 13), [white, white, white, white, tm, tm]); tr.material = [tm, tm, white, white, white, white]; tr.position.set(0, 2.4, -2); g.add(tr);
  g.add(box(2.5, 2.6, 2.6, paint(0x1a3a8a), 0, 1.9, 5.9), box(2.3, 1.0, .05, glassM, 0, 2.6, 7.22), box(2.4, .5, 17, tyreM, 0, .5, 0));
  [-1.05, 1.05].forEach(x => { g.add(box(.25, .2, .05, tailM, x, 1.0, -8.52)); const s = new THREE.Sprite(tailSpr); s.position.set(x, 1, -8.6); s.scale.setScalar(1.3); g.add(s); });
  const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, .2) }); for (let i = -3; i < 4; i++) g.add(box(.08, .08, .08, amber, 1.3, .8, i * 2), box(.08, .08, .08, amber, -1.3, .8, i * 2));
  shadow(g, 2.6, 17); g.userData = { w: 2.6, l: 17, truck: 1 }; return g; }
function tuner(col = 0x101014) { // procedural 2nd player car: wide-body tuner with underglow
  const g = new THREE.Group(), m = paint(col); m.metalness = .85;
  const sh = new THREE.Shape(); sh.moveTo(-2.25, .25); sh.lineTo(-2.3, .75); sh.lineTo(-1.5, .95); sh.lineTo(-.6, 1.32); sh.lineTo(.7, 1.3); sh.lineTo(1.25, .95); sh.lineTo(2.25, .78); sh.lineTo(2.3, .3); sh.lineTo(-2.25, .25);
  const eg = new THREE.ExtrudeGeometry(sh, { depth: 1.86, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 2 }); eg.translate(0, 0, -.93); eg.rotateY(-Math.PI / 2);
  g.add(new THREE.Mesh(eg, m)); g.add(box(1.6, .38, 1.5, glassM, 0, 1.08, -.05));
  const wingM = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: .5, roughness: .4 }); g.add(box(1.9, .05, .42, wingM, 0, 1.32, -2.05), box(.06, .32, .3, wingM, -.7, 1.12, -2.0), box(.06, .32, .3, wingM, .7, 1.12, -2.0));
  const stripe = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 1.8, 2.4) }); g.add(box(.05, .06, 3.6, stripe, -.98, .7, 0), box(.05, .06, 3.6, stripe, .98, .7, 0));
  g.add(box(1.5, .1, .05, tailM, 0, .82, -2.33)); [-.6, .6].forEach(x => { const s = new THREE.Sprite(tailSpr); s.position.set(x, .82, -2.4); s.scale.setScalar(1); g.add(s); });
  g.add(box(.4, .1, .05, headM, -.65, .62, 2.32), box(.4, .1, .05, headM, .65, .62, 2.32)); wheelsOn(g, 1.82, 4.4, .36);
  const ug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), new THREE.MeshBasicMaterial({ map: glowTex(0, 229, 255, 3), color: 0x00c8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); ug.rotation.x = -Math.PI / 2; ug.position.y = .05; g.add(ug);
  const ul = new THREE.PointLight(0x00d0ff, 25, 7, 1.5); ul.position.y = .2; g.add(ul); shadow(g, 1.9, 4.4); return g; }

// ---------- player ----------
const CARS = [
  { name: 'FERRARI 458', sub: 'V8 · 562 HP', top: 88, acc: 13.5, grip: 1.0, drift: .8, nos: 1.0, stats: [.95, .85, .7] },
  { name: 'RX-14 TUNER', sub: 'TWIN-TURBO · WIDEBODY', top: 80, acc: 15, grip: .85, drift: 1.25, nos: 1.3, stats: [.8, .92, .95] },
];
let carSel = +(Q.get('car') ?? localStorage.racexLoopCar ?? 0) || 0;
const player = new THREE.Group(); player.rotation.order = 'YXZ'; scene.add(player);
// ---- driver's-seat cockpit (default view; ?chase or the CAM button for chase cam) ----
let COCKPIT = !Q.has('chase') && localStorage.racexCam !== 'chase';
const ckp = new THREE.Group(); scene.add(cam); cam.add(ckp);
{ const M = c => new THREE.MeshBasicMaterial({ color: c, fog: false, depthTest: false, depthWrite: false, toneMapped: false });
  const add = (geo, m, x, y, z, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.z = rz; o.renderOrder = 999; o.frustumCulled = false; ckp.add(o); return o; };
  const dark = M(0x0b0c0f), dash = M(0x17181c), trim = M(0x2a2b30), hood = M(0x7a0c0c), glassT = new THREE.MeshBasicMaterial({ color: 0x0, transparent: true, opacity: .18, fog: false, depthTest: false, depthWrite: false });
  // hood: wide trapezoid peeking over the dash
  const hs = new THREE.Shape(); hs.moveTo(-1.6, 0); hs.lineTo(1.6, 0); hs.lineTo(.9, .085); hs.quadraticCurveTo(0, .11, -.9, .085); hs.lineTo(-1.6, 0);
  add(new THREE.ShapeGeometry(hs, 8), hood, 0, -.44, -1);
  // dashboard top with a soft curve + gauge binnacle
  const ds = new THREE.Shape(); ds.moveTo(-3, -1.5); ds.lineTo(3, -1.5); ds.lineTo(3, -.02); ds.quadraticCurveTo(0, .06, -3, -.02); ds.lineTo(-3, -1.5);
  add(new THREE.ShapeGeometry(ds, 10), dash, 0, -.43, -1);
  const bs = new THREE.Shape(); bs.moveTo(-.95, 0); bs.quadraticCurveTo(-.62, .1, -.3, 0); add(new THREE.ShapeGeometry(bs, 8), trim, 0, -.405, -1);
  add(new THREE.PlaneGeometry(6, .012), trim, 0, -.43, -1);
  // A-pillars, roof edge, mirror
  for (const sx of [-1, 1]) { const ps = new THREE.Shape(); ps.moveTo(sx * 1.9, -.5); ps.lineTo(sx * 1.55, -.5); ps.lineTo(sx * .98, .62); ps.lineTo(sx * 1.4, .62); ps.lineTo(sx * 1.9, -.5); add(new THREE.ShapeGeometry(ps), dark, 0, 0, -1); }
  add(new THREE.PlaneGeometry(4, .3), dark, 0, .7, -1); add(new THREE.PlaneGeometry(4, .05), glassT, 0, .53, -1);
  const mr = new THREE.Shape(); mr.moveTo(-.2, -.045); mr.lineTo(.2, -.045); mr.quadraticCurveTo(.23, 0, .2, .045); mr.lineTo(-.2, .045); mr.quadraticCurveTo(-.23, 0, -.2, -.045);
  add(new THREE.ShapeGeometry(mr, 6), M(0x101114), .12, .44, -1); add(new THREE.PlaneGeometry(.36, .06), M(0x6f8296), .12, .44, -.999); add(new THREE.PlaneGeometry(.025, .12), dark, .12, .54, -1); }
function fitCockpit() { const hh = Math.tan(cam.fov * Math.PI / 360), hw = hh * cam.aspect; ckp.scale.set(hw / 1.25, hh / .62, 1); }
// sun glare
let flare = null; if (DAY) { const ft = (r, a, soft) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, `rgba(255,250,235,${a})`); g.addColorStop(soft, `rgba(255,235,200,${a * .35})`); g.addColorStop(1, 'rgba(255,230,200,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };
  const fl = new THREE.PointLight(0xffffff, 0, 1); flare = new Lensflare(); flare.addElement(new LensflareElement(ft(0, .7, .2), LOW ? 160 : 220, 0, new THREE.Color(1, .97, .9))); flare.addElement(new LensflareElement(ft(0, .25, .6), 60, .55, new THREE.Color(.7, .85, 1))); flare.addElement(new LensflareElement(ft(0, .2, .6), 110, .8, new THREE.Color(1, .8, .6)));
  fl.add(flare); scene.add(fl); scene.userData.flareL = fl; }
// roadside delineator posts + small green distance signs
{ const n = Math.floor(L / 40), pg = new THREE.BoxGeometry(.12, 1.1, .12), pm = new THREE.MeshLambertMaterial({ color: 0xe8e8e0 });
  const im = new THREE.InstancedMesh(pg, pm, n), rg = new THREE.BoxGeometry(.13, .18, .13), rm = new THREE.MeshBasicMaterial({ color: 0xffa020 }), ir = new THREE.InstancedMesh(rg, rm, n), o = new THREE.Object3D();
  for (let k = 0; k < n; k++) { const s = k * 40 + 7; frame(s, F2); o.position.copy(F2.p).addScaledVector(F2.r, 9.6); o.position.y += .55; o.rotation.set(0, F2.h, 0); o.updateMatrix(); im.setMatrixAt(k, o.matrix); o.position.y += .38; o.updateMatrix(); ir.setMatrixAt(k, o.matrix); }
  scene.add(im, ir);
  const sm = new THREE.MeshLambertMaterial({ color: 0x0f6b34 }), poleM = new THREE.MeshLambertMaterial({ color: 0x9a9da3 }), ns = Math.floor(L / 400);
  const sb = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 1.1, .06), sm, ns), sp = new THREE.InstancedMesh(new THREE.CylinderGeometry(.05, .05, 2.4, 5), poleM, ns);
  for (let k = 0; k < ns; k++) { const s = k * 400 + 213; frame(s, F2); o.position.copy(F2.p).addScaledVector(F2.r, 10.4); o.rotation.set(0, F2.h, 0); o.position.y += 1.2; o.updateMatrix(); sp.setMatrixAt(k, o.matrix); o.position.y += 1.5; o.updateMatrix(); sb.setMatrixAt(k, o.matrix); }
  scene.add(sb, sp); }
{ const b = document.createElement('button'); b.id = 'camb'; b.textContent = 'CAM'; b.style.cssText = 'position:fixed;z-index:20;left:calc(14px + env(safe-area-inset-left));top:calc(64px + env(safe-area-inset-top));padding:6px 12px;border-radius:14px;border:1px solid #7ff3ff;background:rgba(0,20,30,.55);color:#7ff3ff;font:600 12px system-ui;letter-spacing:2px;pointer-events:auto';
  const tog = e => { e && e.preventDefault(); COCKPIT = !COCKPIT; localStorage.racexCam = COCKPIT ? 'cockpit' : 'chase'; }; b.addEventListener('pointerdown', tog); document.body.appendChild(b); addEventListener('keydown', e => { if (e.code === 'KeyC') tog(); }); }
const body = new THREE.Group(); player.add(body);
const models = [new THREE.Group(), tuner()]; models.forEach(m => body.add(m));
let ferrariReady = false;
{ const dr = new DRACOLoader(); dr.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); const gl = new GLTFLoader(); gl.setDRACOLoader(dr);
  gl.load('assets/ferrari.glb', g => { const m = g.scene.children[0];
    const bm = new THREE.MeshPhysicalMaterial({ color: 0xc8101a, metalness: 1, roughness: .38, clearcoat: 1, clearcoatRoughness: .03 }), det = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: .3 }), gm = new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: .3, roughness: 0, transparent: true, opacity: .75 });
    const set = (n, mat) => { const o = m.getObjectByName(n); if (o) o.material = mat; }; set('body', bm); ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim'].forEach(n => set(n, det)); set('glass', gm);
    m.scale.setScalar(1.05); m.rotation.y += Math.PI; models[0].add(m); castAll(m); ferrariReady = true; ready(); }, undefined, e => { console.warn('ferrari failed', e); models[0].add(sedan(0xc8101a)); ferrariReady = true; ready(); }); }
shadow(player, 1.9, 4.5);
// headlight cone + flare sprites, tail sprites, nitro flames
const headL = new THREE.SpotLight(0xffe8c8, DAY ? 0 : LOW ? 50 : 70, 70, .42, .6, 1.4); headL.position.set(0, .9, 1.9); headL.target.position.set(0, 0, 30); player.add(headL, headL.target);
const flares = [-.65, .65].map(x => { const s = new THREE.Sprite(headSpr); s.position.set(x, .7, 2.3); s.scale.setScalar(DAY ? .5 : 1.4); player.add(s); return s; });
const pTails = [-.6, .6].map(x => { const s = new THREE.Sprite(tailSpr); s.position.set(x, .82, -2.35); s.scale.setScalar(1.1); player.add(s); return s; });
const flameM = new THREE.SpriteMaterial({ map: glowTex(80, 160, 255, 2), color: 0x60a0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const flames = [-.45, .45].map(x => { const s = new THREE.Sprite(flameM); s.position.set(x, .42, -2.55); s.scale.set(.1, .1, 1); player.add(s); return s; });
const popM = new THREE.SpriteMaterial({ map: glowTex(255, 140, 40, 2), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const pops = [-.45, .45].map(x => { const s = new THREE.Sprite(popM); s.position.set(x, .42, -2.5); s.scale.setScalar(.01); player.add(s); return s; });
// road spray behind the car
const SPRAY = 140, sprayG = new THREE.BufferGeometry(), sprayP = new Float32Array(SPRAY * 3); sprayG.setAttribute('position', new THREE.BufferAttribute(sprayP, 3));
const spray = new THREE.Points(sprayG, new THREE.PointsMaterial({ size: .5, map: glowTex(200, 200, 220, 3), color: 0x606878, transparent: true, depthWrite: false, opacity: .5 })); spray.frustumCulled = false; spray.visible = NIGHT; scene.add(spray);
const sprayV = []; for (let i = 0; i < SPRAY; i++) sprayV.push({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), life: 0 });

// ---------- traffic ----------
const COLS = [0xdedede, 0x1d1d22, 0x6a6e78, 0x2a3e6a, 0x8a1a1a, 0x5a5a52, 0xb8b8c0, 0x223322, 0xd0c8a8];
const traffic = []; const castAll = g => { if (DAY) g.traverse(o => { if (o.isMesh && !o.material.transparent) o.castShadow = true; }); };
for (let i = 0; i < (LOW ? 14 : MOBILE ? 18 : 22); i++) { const kind = i % 7 === 0 ? 'truck' : i % 3 === 0 ? 'suv' : 'sedan'; const m = kind === 'truck' ? truck() : kind === 'suv' ? suv(COLS[i % COLS.length]) : sedan(COLS[i % COLS.length]); castAll(m); scene.add(m);
  traffic.push({ m, s: 110 + i * 48 + rnd(-12, 12), lane: i % 3, d: LANES[i % 3], v: kind === 'truck' ? rnd(22, 25) : rnd(26, 32), w: m.userData.w, l: m.userData.l, passed: false, nm: false, hit: 0, tlc: rnd(4, 14) }); }
// oncoming headlights (westbound side)
const oncoming = []; for (let i = 0; i < 18; i++) { const g = new THREE.Group(); if (DAY) { const c = sedan(COLS[(i * 5) % COLS.length]); c.rotation.y = 0; g.add(c); } else [-.6, .6].forEach(x => { const s = new THREE.Sprite(headSpr); s.position.set(x, .7, 0); s.scale.setScalar(2.4); g.add(s); }); scene.add(g); oncoming.push({ g, s: rnd(0, 2000), d: -rnd(11.5, 19), v: rnd(26, 34) }); }

const cop = { on: false, s: -999, d: 0 }; // cops removed

// ---------- post: bloom + speed FX (radial blur, chromatic aberration, vignette, grain, nitro tint) ----------
const composer = new EffectComposer(R); composer.addPass(new RenderPass(scene, cam));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 128), DAY ? .22 : .85, .55, DAY ? .95 : .82); composer.addPass(bloom);
const fxPass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, amt: { value: 0 }, ca: { value: 0 }, nos: { value: 0 }, t: { value: 0 }, shake: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `precision highp float;uniform sampler2D tDiffuse;uniform float amt,ca,nos,t,shake;varying vec2 vUv;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+t)*43758.5453);}
  void main(){vec2 c=vec2(.5,.52);vec2 d=vUv-c;float r=length(d);vec3 col=vec3(0.);float w=0.;
    for(int i=0;i<${LOW || MOBILE ? 4 : 6};i++){float k=float(i)/${LOW || MOBILE ? '4.' : '6.'};float s=1.-amt*k*smoothstep(.05,.6,r);vec2 uv=c+d*s;
      col.r+=texture2D(tDiffuse,c+d*s*(1.+ca*r)).r;col.g+=texture2D(tDiffuse,uv).g;col.b+=texture2D(tDiffuse,c+d*s*(1.-ca*r)).b;w+=1.;}
    col/=w;col*=mix(1.,smoothstep(1.05,.28,r),.85);col+=nos*vec3(.0,.06,.14)*smoothstep(.25,.75,r);col+=(h(floor(vUv*vec2(420.,200.)))-.5)*.02;
    gl_FragColor=vec4(col,1.);}` }); composer.addPass(fxPass); composer.addPass(new OutputPass());
function resize() { const w = innerWidth, h = innerHeight; R.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w * DPR / (MOBILE ? 3 : 2), h * DPR / (MOBILE ? 3 : 2)); cam.aspect = w / h; cam.fov = w / h > 1.9 ? 58 : 64; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 350)); window.visualViewport?.addEventListener('resize', resize); resize();

// ---------- audio (WebAudio synth: engine layers, wind, tyres, rain, nitro, siren, pops) ----------
let AC = null, A = {};
function initAudio() { if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const master = AC.createGain(); master.gain.value = .55; master.connect(AC.destination); A.master = master;
  const comp = AC.createDynamicsCompressor(); comp.connect(master);
  const nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; A.nb = nb;
  const noise = (type, f, q, g0) => { const s = AC.createBufferSource(); s.buffer = nb; s.loop = true; const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = AC.createGain(); g.gain.value = g0; s.connect(fl).connect(g).connect(comp); s.start(); return { f: fl, g }; };
  // engine: 3 detuned oscillators -> waveshaper -> lowpass
  const eg = AC.createGain(); eg.gain.value = .0; const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3;
  const ws = AC.createWaveShaper(); const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; cv[i] = Math.tanh(x * 2.6); } ws.curve = cv;
  const os = [['sawtooth', 1, .5], ['square', .5, .35], ['sawtooth', 2.01, .22], ['triangle', 4, .12]].map(([t, m, g]) => { const o = AC.createOscillator(); o.type = t; const gg = AC.createGain(); gg.gain.value = g; o.connect(gg).connect(ws); o.start(); return { o, m }; });
  ws.connect(lp).connect(eg).connect(comp); A.eng = { os, lp, g: eg };
  A.wind = noise('bandpass', 700, .6, 0); A.tyre = noise('bandpass', 1800, 2.5, 0); A.rain = noise('highpass', 3500, .3, .05); A.nos = noise('bandpass', 2400, .8, 0);
}
function burst(dur, f, gain, type = 'bandpass') { if (!AC) return; const s = AC.createBufferSource(); s.buffer = A.nb; const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const g = AC.createGain(); const t = AC.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(fl).connect(g).connect(A.master); s.start(t, Math.random()); s.stop(t + dur + .05); }
function popSound() { burst(.07, 900, .9); setTimeout(() => burst(.06, 600, .7), 70); if (Math.random() < .6) setTimeout(() => burst(.05, 1200, .6), 150); }
function thump(g = 1) { if (!AC) return; const o = AC.createOscillator(); o.frequency.value = 70; const gg = AC.createGain(); const t = AC.currentTime; gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(.001, t + .35); o.frequency.exponentialRampToValueAtTime(30, t + .35); o.connect(gg).connect(A.master); o.start(); o.stop(t + .4); burst(.4, 400, g * .8, 'lowpass'); }

// ---------- input ----------
const inp = { steer: 0, gas: AUTO, brake: false, nos: Q.has('nos') };
const kb = {}; addEventListener('keydown', e => { kb[e.code] = true; }); addEventListener('keyup', e => { kb[e.code] = false; });
const hold = (id, k) => { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); inp[k] = true; el.style.background = 'rgba(255,255,255,.18)'; }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => { inp[k] = false; el.style.background = ''; })); };
hold('gas', 'gas'); hold('brk', 'brake'); hold('nosb', 'nos');
{ const pad = $('pad'), kn = $('knob').firstElementChild; let id = null, x0 = 0;
  pad.addEventListener('pointerdown', e => { id = e.pointerId; x0 = e.clientX; pad.setPointerCapture(id); });
  pad.addEventListener('pointermove', e => { if (e.pointerId !== id) return; inp.steer = clamp((e.clientX - x0) / 55, -1, 1); kn.style.left = (51 + inp.steer * 48) + 'px'; });
  const up = e => { if (e.pointerId !== id) return; id = null; inp.steer = 0; kn.style.left = '51px'; }; pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); }

// ---------- game state ----------
const LAPS = Math.max(1, +(Q.get('laps') || 1)); const fmtT = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const S = { s0: 20, lap: 0, laps: [], lapT0: 0, hw: 'SR-500', hwSeen: new Set(), s: 20, d: LANES[1], psi: 0, v: 0, slip: 0, yawVis: 0, gear: 1, rpm: 900, nos: 1, score: 0, combo: 1, comboT: 0, heat: 0, shake: 0, spin: 0, t: 0, top: 0, nm: 0, bestCombo: 1, drift: 0, run: false, done: false, cut: 0, crashT: 0, busted: 0 };
const GEARS = [0, 14, 25, 36, 48, 62, 99];
window.__S = S;
function popup(txt, sub, col) { const p = $('pop'); const d = document.createElement('div'); d.className = 'p'; d.innerHTML = txt + (sub ? `<small>${sub}</small>` : ''); if (col) d.style.color = col; p.innerHTML = ''; p.appendChild(d); }
function msg(t, ms = 1500) { $('msg').textContent = t; clearTimeout(msg.t); msg.t = setTimeout(() => $('msg').textContent = '', ms); }
function addScore(p, label, sub) { S.score += Math.round(p * S.combo); popup(`${label} +${Math.round(p * S.combo)}`, sub); }

// garage
function garage() { const g = $('garage'); g.innerHTML = ''; CARS.forEach((c, i) => { const d = document.createElement('div'); d.className = 'card' + (i === carSel ? ' sel' : ''); d.innerHTML = `<b>${c.name}</b><span style="color:#ff2a6d">${c.sub}</span>` + ['TOP SPEED', 'ACCEL', 'DRIFT'].map((n, k) => `<div class="st">${n}<i><u style="width:${c.stats[k] * 100}%"></u></i></div>`).join(''); d.onclick = () => { carSel = i; localStorage.racexLoopCar = i; garage(); showCar(); }; g.appendChild(d); }); }
function showCar() { models.forEach((m, i) => m.visible = i === carSel); }
garage(); showCar();
function ready() { $('load').textContent = 'ready'; window.__ready = true; }
function reset() { Object.assign(S, { s0: 20, lap: 0, laps: [], lapT0: 0, hw: 'SR-500', hwSeen: new Set(['SR-500']), s: 20, d: LANES[1], psi: 0, v: 0, slip: 0, gear: 1, nos: 1, score: 0, combo: 1, comboT: 0, heat: Q.has('heat') ? 3.5 : 0, shake: 0, spin: 0, t: 0, top: 0, nm: 0, bestCombo: 1, drift: 0, done: false, crashT: 0, busted: 0 });
  traffic.forEach((c, i) => { c.s = 120 + i * 85 + rnd(-25, 25); c.lane = i % 3; c.d = LANES[c.lane]; c.passed = false; c.nm = false; });
  if (Q.has('at')) { S.s = S.s0 = +Q.get('at'); traffic.forEach((c, i) => { c.s = S.s + 40 + i * 70 + rnd(-15, 15); }); } }
function go() { initAudio(); AC?.resume(); $('start').style.display = 'none'; $('end').style.display = 'none'; reset(); S.run = true; if (Q.has('v')) S.v = +Q.get('v');
  try { if (!/iP(hone|od|ad)/.test(navigator.userAgent)) document.documentElement.requestFullscreen?.().catch(() => { }); screen.orientation?.lock?.('landscape').catch(() => { }); } catch (e) { } msg(SECN[secAt(S.s) === 'Ramp' ? nextHwy(W(Math.floor(S.s / STEP))) : secAt(S.s)], 1800); }
$('go').onclick = go; $('again').onclick = () => { $('end').style.display = 'none'; $('start').style.display = 'flex'; };
function finish(busted) { S.run = false; S.done = true; $('endt').textContent = busted ? 'BUSTED' : 'FINISH'; const best = +(localStorage.racexLoopBest || 0); if (!busted && S.score > best) localStorage.racexLoopBest = S.score;
  $('res').innerHTML = `SCORE <b>${S.score.toLocaleString()}</b>${!busted && S.score > best ? ' · NEW BEST' : ''}<br>TIME <b>${fmtT(S.t)}</b>${S.laps.length ? ' · BEST LAP <b>' + fmtT(Math.min(...S.laps)) + '</b>' : ''} · TOP <b>${Math.round(S.top * 2.237)} MPH</b><br>NEAR MISSES <b>${S.nm}</b> · BEST COMBO <b>x${S.bestCombo}</b>`; $('end').style.display = 'flex'; }

// ---------- main loop ----------
const FIX = 1 / 120; let acc = 0; const clock = new THREE.Clock(); let fpsA = 0, fpsN = 0, fpsT = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fwd = new THREE.Vector3();
let sprayI = 0, lastGear = 1, copLow = 0, prevNos = false, wallT = 0;
function autopilot() { // test driver: hunts near misses (only with ?auto)
  let tgt = LANES[1], best = 1e9; for (const c of traffic) { const ds = c.s - S.s; if (ds > 4 && ds < 90 && ds < best) { best = ds; tgt = c.d + (c.d < 0 ? 1 : c.d > 0 ? -1 : (Math.sin(c.s) > 0 ? 1 : -1)) * (c.w / 2 + 2.0); } }
  tgt = clamp(tgt, -EDGE + 1.3, EDGE - 1.3); inp.steer = clamp((tgt - S.d) * .35 - S.psi * 3, -1, 1); inp.gas = true; }
function update(dt) {
  const C = CARS[carSel]; S.t += dt;
  if (AUTO) autopilot();
  const st = clamp(inp.steer + (kb.ArrowRight || kb.KeyD ? 1 : 0) - (kb.ArrowLeft || kb.KeyA ? 1 : 0), -1, 1);
  const gas = inp.gas || kb.ArrowUp || kb.KeyW, brake = inp.brake || kb.ArrowDown || kb.KeyS || kb.Space;
  const drifting = brake && Math.abs(st) > .3 && S.v > 14;
  const nosOn = (inp.nos || kb.ShiftLeft || kb.KeyN) && S.nos > 0 && gas && S.v > 8;
  if (nosOn) { S.nos = Math.max(0, S.nos - dt * .28 / C.nos); if (!prevNos) burst(.6, 300, .6, 'lowpass'); } else S.nos = Math.min(1, S.nos + dt * .035);
  prevNos = nosOn;
  // longitudinal
  const top = C.top * (nosOn ? 1.2 : 1); let a = 0;
  if (gas && S.cut <= 0) a = C.acc * Math.max(0, 1 - (S.v / top) ** 2) * (S.v < 8 ? 1.2 : 1) + (nosOn ? 9 * C.nos : 0);
  if (brake && !drifting) a -= 24; if (drifting) a -= 2.5; a -= .0008 * S.v * S.v + .4; if (!gas && !brake) a -= 1.5;
  S.cut -= dt; S.v = Math.max(0, S.v + a * dt);
  if (S.spin > 0) { S.spin -= dt; S.v *= 1 - dt * 1.4; }
  // gears
  let g = S.gear || 1; if (g < 6 && S.v > GEARS[g]) g++; else if (g > 1 && S.v < GEARS[g - 1] - 3) g--; const lo = GEARS[g - 1], hi = GEARS[g];
  if (g > lastGear && S.v > 6) { S.cut = .11; popSound(); pops.forEach(p => p.userData.t = .12); S.shake = Math.max(S.shake, .12); }
  lastGear = g; S.gear = g; S.rpm = lerp(S.rpm, 1100 + 6900 * clamp((S.v - lo * .75) / (hi - lo * .75), 0, 1) * (gas ? 1 : .8), .25);
  // steering in track space
  const maxPsi = lerp(.42, .1, clamp(S.v / 80, 0, 1)) * C.grip * (drifting ? 1.5 : 1);
  const psiT = st * maxPsi; S.psi += (psiT - S.psi) * Math.min(1, dt * (drifting ? 2.5 : 5));
  const slipT = drifting ? st * .5 * C.drift : 0; S.slip += (slipT - S.slip) * Math.min(1, dt * (drifting ? 3 : 5));
  if (drifting) S.drift += dt * S.v * Math.abs(S.slip) * 6; else if (S.drift > 0) { if (S.drift > 60) { addScore(S.drift, 'DRIFT', ''); S.combo = Math.min(10, S.combo + 1); S.comboT = 4; } S.drift = 0; }
  S.s += S.v * Math.cos(S.psi) * dt; S.d += (S.v * Math.sin(S.psi) + S.slip * S.v * .08) * dt;
  // walls
  const lim = EDGE - .95; if (Math.abs(S.d) > lim) { S.d = Math.sign(S.d) * lim; S.psi *= .4; S.v *= 1 - dt * 1.3; S.shake = Math.max(S.shake, .25); wallT = .2; if (S.v > 25 && Math.random() < dt * 8) burst(.1, 3000, .3); }
  wallT -= dt; S.top = Math.max(S.top, S.v);
  // traffic
  for (const c of traffic) {
    let lead = null; for (const o of traffic) if (o !== c && o.lane === c.lane && o.s > c.s && o.s - c.s < 28) lead = o;
    const vt = lead ? Math.min(c.v, lead.v) : c.v; c.vc = lerp(c.vc || c.v, vt, dt);
    c.s += c.vc * dt; c.tlc -= dt;
    if (c.tlc < 0) { c.tlc = rnd(5, 15); const nl = clamp(c.lane + (Math.random() < .5 ? -1 : 1), 0, 2); const ok = !traffic.some(o => o !== c && o.lane === nl && Math.abs(o.s - c.s) < 25) && Math.abs(c.s - S.s) > 18; if (ok) c.lane = nl; }
    c.d = lerp(c.d, LANES[c.lane], dt * .8);
    const ds = c.s - S.s;
    if (ds < -140 || ds > 2000) { c.s = S.s + rnd(700, 1800); c.lane = Math.floor(rnd(0, 3)); c.d = LANES[c.lane]; c.passed = false; c.minD = 99; if (traffic.some(o => o !== c && o.lane === c.lane && Math.abs(o.s - c.s) < 30)) c.s += 45; }
    const dd = Math.abs(c.d - S.d), hitL = c.l / 2 + 2.25, hitW = c.w / 2 + .92;
    if (Math.abs(ds) < hitL + 2) c.minD = Math.min(c.minD ?? 99, dd);
    if (Math.abs(ds) < hitL && dd < hitW && S.t - (c.hit || -9) > 1.2) { // crash
      c.hit = S.t; const rel = S.v - c.vc; S.v = Math.max(c.vc * .6, S.v * .45); c.vc += rel * .3; S.spin = .9; S.slip = (Math.random() < .5 ? -1 : 1) * .9; S.shake = 1.2; S.d += Math.sign(S.d - c.d || 1) * .9;
      S.combo = 1; S.comboT = 0; thump(1.2); popup('CRASH', 'combo lost', '#ff3050'); }
    if (!c.passed && ds < -hitL) { c.passed = true; if ((c.minD ?? 99) < hitW + 1.5 && S.t - (c.hit || -9) > 1.5 && S.v - c.vc > 5) { const close = clamp(1 - ((c.minD - hitW) / 1.5), 0, 1); S.nm++; const p = 200 + 300 * close + (S.v - c.vc) * 8; S.combo = Math.min(10, S.combo + 1); S.bestCombo = Math.max(S.bestCombo, S.combo); S.comboT = 4.5; addScore(p, close > .6 ? 'CLOSE CALL' : 'NEAR MISS', `x${S.combo} combo`); burst(.35, 1400, .5); } }
    frame(c.s, F); c.m.position.copy(F.p).addScaledVector(F.r, c.d); c.m.position.y = F.p.y + (S.t - (c.hit || -9) < .4 ? .05 : 0); c.m.rotation.y = F.h - (LANES[c.lane] - c.d) * .03;
  }
  S.comboT -= dt; if (S.comboT <= 0 && S.combo > 1) { S.combo = 1; }
  for (const o of oncoming) { o.s -= o.v * dt; if (o.s < S.s - 200) o.s = S.s + rnd(900, 1900); frame(o.s, F); o.g.position.copy(F.p).addScaledVector(F.r, o.d).setY(F.p.y); o.g.rotation.y = F.h + Math.PI; o.g.visible = !RAMP[W(Math.floor(o.s / STEP))]; }
  { const lap = Math.floor((S.s - S.s0) / L); if (lap > S.lap) { const lt = S.t - S.lapT0; S.laps.push(lt); S.lapT0 = S.t; S.lap = lap; const b = +(localStorage.racexLoopBestLap || 0); if (!b || lt < b) { localStorage.racexLoopBestLap = lt; popup('NEW BEST LAP', fmtT(lt), '#30ff8a'); } else popup('LAP ' + lap, fmtT(lt), '#7ff3ff'); if (lap >= LAPS) finish(false); }
    const sn = secAt(S.s); const hw = sn === 'Ramp' ? nextHwy(W(Math.floor(S.s / STEP))) : sn; if (hw !== S.hw) { S.hw = hw; S.hwSeen.add(hw); msg(SECN[hw], 1800); } }
  // player pose
  frame(S.s, F); player.position.copy(F.p).addScaledVector(F.r, S.d); player.position.y = F.p.y;
  const spinYaw = S.spin > 0 ? S.slip * Math.sin(S.spin * 7) * .6 : 0;
  player.rotation.y = F.h - S.psi - S.slip + spinYaw;
  body.rotation.z = lerp(body.rotation.z, st * S.v * .0025 * (drifting ? 1.6 : 1), .15); body.rotation.x = lerp(body.rotation.x, (gas ? -.012 : brake ? .02 : 0) * Math.min(1, S.v / 10), .1);
  flames.forEach(f => { const k = nosOn ? 1 + Math.random() * .6 : 0; f.scale.set(.5 * k + .01, 1.4 * k + .01, 1); });
  pops.forEach(p => { p.userData.t = (p.userData.t || 0) - dt; const k = p.userData.t > 0 ? .9 + Math.random() * .5 : .01; p.scale.setScalar(k); });
  pTails.forEach(s => s.scale.setScalar(brake ? 1.8 : 1.1));
  // lights: sodium pool follows nearest poles ahead
  let li = 0; for (const p of poles) { if (p.s > S.s - 30 && li < lightPool.length) { lightPool[li].position.copy(p.pos); li++; } }
  // spray
  if (S.v > 12) for (let k = 0; k < 3; k++) { const sp = sprayV[sprayI++ % SPRAY]; sp.p.copy(player.position).addScaledVector(F.t, -2.3).addScaledVector(F.r, rnd(-.9, .9)); sp.p.y += .3; sp.v.copy(F.t).multiplyScalar(S.v * .55).add(tmp.set(rnd(-1, 1), rnd(1, 3), rnd(-1, 1))); sp.life = .7; }
  for (let i = 0; i < SPRAY; i++) { const sp = sprayV[i]; sp.life -= dt; if (sp.life <= 0) { sprayP[i * 3 + 1] = -999; continue; } sp.v.y -= 9 * dt; sp.p.addScaledVector(sp.v, dt); sprayP[i * 3] = sp.p.x; sprayP[i * 3 + 1] = sp.p.y; sprayP[i * 3 + 2] = sp.p.z; }
  sprayG.attributes.position.needsUpdate = true;
  S.shake = Math.max(0, S.shake - dt * 2.2);
  return { nosOn, drifting, gas, st };
}
function camUpdate(dt, k) {
  ckp.visible = COCKPIT; player.visible = !(COCKPIT && (S.run || S.done));
  if (scene.userData.flareL) scene.userData.flareL.position.copy(cam.position).addScaledVector(SUN, 9000);
  if (COCKPIT && (S.run || S.done)) { frame(S.s, F); const v = S.v, yaw = player.rotation.y, sy = Math.sin(yaw), cy = Math.cos(yaw);
    // left-hand-drive seat: ~0.36 m left of centre, slightly behind middle, eye at 1.1 m
    const t = S.t, bob = Math.min(1, v / 40); tmp.copy(player.position); tmp.x += sy * -.15 + cy * .36; tmp.z += cy * -.15 - sy * .36; tmp.y += 1.1 + Math.sin(t * 7.3) * .012 * bob + Math.sin(t * 13.1) * .006 * bob;
    const sh = S.shake * .12; tmp.x += rnd(-sh, sh); tmp.y += rnd(-sh, sh) * .5; cam.position.copy(tmp);
    const sway = (S.yawVis || 0) * .4 + Math.sin(t * 1.9) * .006 * bob; tmp2.set(tmp.x + Math.sin(yaw + sway) * 40, tmp.y - .9 + (at(S.s + 40, 0, 0).y - player.position.y), tmp.z + Math.cos(yaw + sway) * 40); cam.lookAt(tmp2);
    cam.rotateZ(clamp(-(S.yawVis || 0) * .25, -.05, .05) + Math.sin(t * 5.1) * .003 * bob);
    const fov = (innerWidth / innerHeight > 1.9 ? 64 : 70) + clamp(v - 8, 0, 80) * .13 + (k.nosOn ? 6 : 0); cam.fov = lerp(cam.fov, fov, dt * 3); cam.updateProjectionMatrix(); fitCockpit(); return; }
  if (COCKPIT) ckp.visible = false;
  frame(S.s, F); const v = S.v, yaw = player.rotation.y; fwd.set(Math.sin(yaw * .35 + F.h * .65), 0, Math.cos(yaw * .35 + F.h * .65));
  const back = 6.6 + v * .01 + (k.nosOn ? .8 : 0), hgt = 2.35 + v * .004; // high enough to see traffic over the car
  tmp.copy(player.position).addScaledVector(fwd, -back); tmp.y += hgt; cam.position.lerp(tmp, Math.min(1, dt * 9));
  const sh = S.shake * .35; cam.position.x += rnd(-sh, sh); cam.position.y += rnd(-sh, sh) * .6;
  const vib = Math.min(.045, .0035 * (v / 20) ** 2); const tt = S.t * 31; cam.position.y += (Math.sin(tt) * .6 + Math.sin(tt * 2.37 + 1) * .4) * vib; cam.position.x += Math.sin(tt * 1.71) * vib * .5;
  tmp2.copy(player.position).addScaledVector(fwd, 70).lerp(at(S.s + 70, S.d * .6, 0), .5); tmp2.y = lerp(player.position.y, tmp2.y, .5) + .9; cam.lookAt(tmp2); // aim ~70 m down the road (follows curves)
  const fov = (innerWidth / innerHeight > 1.9 ? 58 : 64) + clamp(v - 8, 0, 80) * .2 + (k.nosOn ? 8 : 0); cam.fov = lerp(cam.fov, fov, dt * 3); cam.updateProjectionMatrix();
}
function fxUpdate(dt, k) {
  const sp = clamp((S.v - 28) / 55, 0, 1); fxPass.uniforms.amt.value = lerp(fxPass.uniforms.amt.value, k.nosOn ? .085 : 0, dt * 4);
  fxPass.uniforms.ca.value = MOBILE ? 0 : .004 + sp * .01 + fxPass.uniforms.amt.value * .5 + S.shake * .04; fxPass.uniforms.nos.value = lerp(fxPass.uniforms.nos.value, k.nosOn ? 1 : 0, dt * 5); fxPass.uniforms.t.value = S.t % 10;
  bloom.strength = (DAY ? .22 : .8) + (k.nosOn ? .25 : 0);
  // rain streaks around camera, stretched by speed
  const c = cam.position, yaw = F.h, sx = Math.sin(yaw), cz = Math.cos(yaw), len = .5 + Math.min(S.v, 60) * .012;
  if (DAY) { moonL.position.copy(player.position).addScaledVector(SUN, 200); moonL.target.position.copy(player.position); if (scene.userData.glint) scene.userData.glint.material.opacity = .45 + Math.sin(S.t * 9) * .25; }
  if (NIGHT) {
  for (let i = 0; i < RAIN_N; i++) { const b = rainBase[i]; b[1] -= dt * 16; b[2] -= dt * S.v * .9; if (b[1] < -3) b[1] += 25; if (b[2] < -30) b[2] += 70;
    const x = c.x + b[0] * cz + b[2] * sx, z = c.z - b[0] * sx + b[2] * cz, y = c.y + b[1] - 6; const j = i * 6;
    rp[j] = x; rp[j + 1] = y; rp[j + 2] = z; rp[j + 3] = x - sx * len * .9; rp[j + 4] = y + .55; rp[j + 5] = z - cz * len * .9; }
  rainG.attributes.position.needsUpdate = true; }
  if (false) mists.forEach((m, i) => { const s = i * 60 + 600 * Math.ceil((S.s - 40 - i * 60) / 600); frame(Math.max(0, s), F2); m.position.copy(F2.p).addScaledVector(F2.r, (i % 3 - 1) * 30); m.position.y += 6; });
  scene.userData.sky.position.copy(cam.position);
}
function audioUpdate(k) { if (!AC) return; const t = AC.currentTime, f = S.rpm / 60 * 2;
  A.eng.os.forEach(o => o.o.frequency.setTargetAtTime(f * o.m, t, .03)); A.eng.g.gain.setTargetAtTime(S.run ? .22 + (k.gas ? .2 : 0) : .1, t, .05); A.eng.lp.frequency.setTargetAtTime(500 + S.rpm * .35 + (k.gas ? 900 : 0), t, .05);
  A.wind.g.gain.setTargetAtTime(Math.min(.8, (S.v / 60) ** 2 * .6), t, .1); A.wind.f.frequency.setTargetAtTime(400 + S.v * 12, t, .1);
  A.tyre.g.gain.setTargetAtTime((k.drifting ? .35 : 0) + (wallT > 0 ? .25 : 0) + (S.spin > 0 ? .4 : 0), t, .05);
  A.nos.g.gain.setTargetAtTime(k.nosOn ? .3 : 0, t, .08); }
let K = { nosOn: false, drifting: false, gas: false, st: 0 };
function hud() { $('spd').textContent = Math.round(S.v * 2.237); $('gear').textContent = S.v < .5 ? 'N' : S.gear; $('nos').firstElementChild.style.width = (S.nos * 100) + '%';
  $('sc').textContent = S.score.toLocaleString(); const cb = $('combo'); cb.textContent = 'x' + S.combo + ' COMBO'; cb.style.opacity = S.combo > 1 ? 1 : 0; $('combobar').firstElementChild.style.width = (S.combo > 1 ? clamp(S.comboT / 4.5, 0, 1) * 100 : 0) + '%';
  const f = (((S.s - S.s0) / L) % 1 + 1) % 1; $('prog').firstElementChild.style.width = f * 100 + '%'; $('dist').textContent = SECN[S.hw] + ' · LAP ' + Math.min(LAPS, S.lap + 1) + '/' + LAPS + ' · ' + fmtT(S.t - S.lapT0); drawMap(); }
// minimap: the whole loop, you (cyan), cop (red)
const MM = $('mm'), mx = MM.getContext('2d'); let mmB = null;
{ let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; P.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }); const sc = Math.min((MM.width - 12) / (x1 - x0), (MM.height - 12) / (z1 - z0)); mmB = { x0, z0, sc, ox: (MM.width - (x1 - x0) * sc) / 2, oz: (MM.height - (z1 - z0) * sc) / 2 }; }
const mmP = p => [mmB.ox + (p.x - mmB.x0) * mmB.sc, mmB.oz + (p.z - mmB.z0) * mmB.sc];
const mmBg = document.createElement('canvas'); mmBg.width = MM.width; mmBg.height = MM.height;
{ const c = mmBg.getContext('2d'); const COL = { 'SR-500': '#ffd200', 'I-5': '#ff2a6d', 'SR-14': '#00e5ff', 'I-205': '#30ff8a', Ramp: '#bbb' }; c.lineWidth = 3; c.lineCap = 'round';
  for (let i = 0; i < N; i += 4) { c.strokeStyle = COL[SEC[i]]; c.beginPath(); c.moveTo(...mmP(P[i])); c.lineTo(...mmP(PI(i + 4))); c.stroke(); }
  c.fillStyle = '#fff'; c.font = 'bold 9px Arial'; [['500', 'SR-500'], ['5', 'I-5'], ['14', 'SR-14'], ['205', 'I-205']].forEach(([t, nm]) => { const r = secRange(nm)[0]; const p = mmP(P[(r[0] + r[1]) >> 1]); c.fillText(t, p[0] + 4, p[1] - 4); }); }
function drawMap() { mx.clearRect(0, 0, MM.width, MM.height); mx.drawImage(mmBg, 0, 0); const dot = (pos, col, r) => { const [x, y] = mmP(pos); mx.fillStyle = col; mx.beginPath(); mx.arc(x, y, r, 0, 7); mx.fill(); };
  dot(player.position, '#fff', 4.5); dot(player.position, '#00e5ff', 3); }
function loop() {
  requestAnimationFrame(loop); const dt = Math.min(.05, clock.getDelta());
  if (S.run) { acc = Math.min(acc + dt, .1); let n = 0; while (acc >= FIX && n < 8) { K = update(FIX); acc -= FIX; n++; } camUpdate(dt, K); }
  else { // attract cam orbit around the car at the start line
    frame(S.s, F); player.position.copy(F.p).addScaledVector(F.r, S.d); player.rotation.y = F.h; const a = performance.now() * .00015 + 2.4; cam.position.copy(player.position).add(tmp.set(Math.sin(a) * 8, 2.2, Math.cos(a) * 8)); cam.lookAt(tmp2.copy(player.position).setY(player.position.y + .8)); }
  fxUpdate(dt, K); audioUpdate(K); if (S.run) hud();
  composer.render();
  fpsT += dt; fpsN++; if (fpsT > 1) { window.__fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
}
reset(); loop();
window.__scene = scene; window.__cam = cam;
window.__T = { L, N, STEP, secs: TR.secs, secAt, frame: s => { frame(s, F); return { x: F.p.x, y: F.p.y, z: F.p.z, h: F.h }; }, player };
window.__sim = (sec) => { let n = Math.round(sec / FIX); while (n-- > 0 && S.run) K = update(FIX); camUpdate(.5, K); return { s: S.s, v: S.v, hw: S.hw, lap: S.lap, run: S.run, done: S.done }; };
