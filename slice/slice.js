// RaceX · SR-14 East Night Run — vertical slice. Real OSM centerline + USGS elevation, stylized wet-night scenery.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const Q = new URLSearchParams(location.search);
const LOW = Q.has('low'), AUTO = Q.has('auto');
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = THREE.MathUtils.lerp;
let seed = 7; const srnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };

// ---------- track ----------
const TR = await (await fetch('track.json')).json();
const P = TR.pts.map(p => new THREE.Vector3(p[0], p[2], p[1]));
const N = P.length, STEP = 4, L = (N - 1) * STEP;
const T = P.map((p, i) => { const a = P[Math.max(0, i - 2)], b = P[Math.min(N - 1, i + 2)]; return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(); });
const RN = T.map(t => new THREE.Vector3(-t.z, 0, t.x)); // right of travel
const LANE = 3.7, LANES = [-LANE, 0, LANE], EDGE = 6.9; // 3 eastbound lanes, d in [-6.9, 6.9]
function frame(s, out) { // centre, tangent, right, heading at distance s
  const f = clamp(s / STEP, 0, N - 1.001), i = Math.floor(f), t = f - i;
  out.p.lerpVectors(P[i], P[i + 1], t); out.t.lerpVectors(T[i], T[i + 1], t).normalize(); out.r.set(-out.t.z, 0, out.t.x);
  out.h = Math.atan2(out.t.x, out.t.z); return out;
}
const mkF = () => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), r: new THREE.Vector3(), h: 0 });
const F = mkF(), F2 = mkF();
function at(s, d, y = 0, v = new THREE.Vector3()) { frame(s, F2); return v.copy(F2.p).addScaledVector(F2.r, d).setY(F2.p.y + y); }

// ---------- renderer ----------
const R = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio, LOW ? 1 : 1.6);
R.setPixelRatio(DPR); R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05; R.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(R.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05060d); scene.fog = new THREE.FogExp2(0x0a0b18, 0.0026);
const cam = new THREE.PerspectiveCamera(62, 2, 0.1, 6000);

// sky dome: low cloud glowing sodium-orange from city light
{ const g = new THREE.SphereGeometry(5000, 32, 16); const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: {}, vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 v;void main(){float h=max(v.y,0.);vec3 c=mix(vec3(.16,.075,.06),vec3(.012,.014,.03),pow(h,.45));c+=vec3(.09,.03,.08)*exp(-abs(v.y)*14.);gl_FragColor=vec4(c,1.);}' });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky); scene.userData.sky = sky; }
scene.add(new THREE.HemisphereLight(0x3a4a80, 0x140a10, 0.5));
const moonL = new THREE.DirectionalLight(0x8090ff, 0.35); moonL.position.set(200, 400, -300); scene.add(moonL);

// environment map for wet reflections: dark room with sodium strips and neon
{ const es = new THREE.Scene(); es.background = new THREE.Color(0x020205);
  const add = (c, w, h, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: 2 })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; add(new THREE.Color(3, 1.3, .35), 2, .6, Math.cos(a) * 20, 8, Math.sin(a) * 20); }
  add(new THREE.Color(0, 1.6, 2.4), 30, 1, 0, 3, -30); add(new THREE.Color(2.4, 0, 1.2), 30, 1, 0, 3, 30); add(new THREE.Color(.25, .12, .1), 80, 30, 0, 40, 0);
  const pm = new THREE.PMREMGenerator(R); scene.environment = pm.fromScene(es, 0.03).texture; scene.environmentIntensity = 0.35; }

// ---------- textures ----------
function canvasTex(w, h, fn, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; }
const glowTex = (r, g, b, soft = 1) => canvasTex(64, 64, (x) => { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(255,255,255,1)`); gr.addColorStop(.18 * soft, `rgba(${r},${g},${b},.85)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); });
const flareTex = canvasTex(128, 128, x => { const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.12, 'rgba(220,235,255,.8)'); gr.addColorStop(1, 'rgba(120,160,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); x.globalCompositeOperation = 'lighter'; const h = x.createLinearGradient(0, 0, 128, 0); h.addColorStop(0, 'rgba(150,190,255,0)'); h.addColorStop(.5, 'rgba(210,230,255,.9)'); h.addColorStop(1, 'rgba(150,190,255,0)'); x.fillStyle = h; x.fillRect(0, 62, 128, 4); x.fillRect(62, 40, 4, 48); });
const streakTex = canvasTex(32, 256, (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.75, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,.95)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); const g2 = x.createLinearGradient(0, 0, w, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = g2; x.fillRect(0, 0, w, h); });
// asphalt: albedo + roughness (puddles) along u = across, v = along
const asphalt = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#16161a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 26000; i++) { const g = 14 + Math.random() * 26 | 0; x.fillStyle = `rgb(${g},${g},${g + 3})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  x.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 4; i++) { const u = [.37, .63, .19, .81][i] * w; x.fillRect(u - 14, 0, 28, h); } // darker wheel tracks
  const line = (u, col, dash) => { x.fillStyle = col; if (!dash) x.fillRect(u - 4, 0, 8, h); else for (let v = 0; v < h; v += 128) x.fillRect(u - 3, v, 6, 52); };
  line(.035 * w, '#d8b830'); line(.965 * w, '#e8e8e8'); line(w / 3, '#e8e8e8', 1); line(2 * w / 3, '#e8e8e8', 1); }, true);
const rough = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { const px = Math.random() * w, py = Math.random() * h, r = rnd(8, 34); const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.beginPath(); x.ellipse(px, py, r * .6, r * 1.8, 0, 0, 7); x.fill(); } }, true);
rough.colorSpace = THREE.NoColorSpace;

// ---------- sweep helper: extrude a cross-section profile along the track ----------
// prof: array of [d, y] (d across, + = right), uv u along profile; built per track sample (every k points)
function sweep(prof, mat, { k = 1, s0 = 0, s1 = L, vScale = 0.1, side = 0 } = {}) {
  const pos = [], uv = [], idx = []; const i0 = Math.floor(s0 / STEP), i1 = Math.min(N - 1, Math.ceil(s1 / STEP)); let rows = 0;
  const ul = [0]; for (let j = 1; j < prof.length; j++) ul.push(ul[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]));
  for (let i = i0; i <= i1; i += k) { const p = P[i], r = RN[i]; for (let j = 0; j < prof.length; j++) { pos.push(p.x + r.x * prof[j][0], p.y + prof[j][1], p.z + r.z * prof[j][0]); uv.push(ul[j] / (ul[ul.length - 1] || 1), i * STEP * vScale); } rows++; }
  const n = prof.length; for (let a = 0; a < rows - 1; a++) for (let j = 0; j < n - 1; j++) { const q = a * n + j; idx.push(q, q + n, q + 1, q + 1, q + n, q + n + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; scene.add(m); return m;
}
// road surface (3 lanes + shoulders), wet
const roadMat = new THREE.MeshPhysicalMaterial({ map: asphalt, roughnessMap: rough, roughness: 0.55, metalness: 0.0, clearcoat: .55, clearcoatRoughness: 0.2, envMapIntensity: .22, color: 0x9a9aa0 });
asphalt.repeat.set(1, 1); rough.repeat.set(1, 1);
sweep([[-7.6, 0], [7.6, 0]], roadMat, { vScale: 1 / 20 });
// oncoming carriageway (left, beyond median) + median gap
sweep([[-21, 0.0], [-9.4, 0.0]], new THREE.MeshPhysicalMaterial({ color: 0x15151a, roughnessMap: rough, roughness: .8, clearcoat: .25, clearcoatRoughness: .3, envMapIntensity: .2 }), { vScale: 1 / 20, k: 2 });
// Jersey barrier (median, left) — NJ profile both faces
const conc = new THREE.MeshStandardMaterial({ color: 0x48484a, roughness: .85 });
sweep([[-7.6, 0], [-7.95, .08], [-8.1, .33], [-8.25, .82], [-8.45, .82], [-8.6, .33], [-8.75, .08], [-9.1, 0]], conc, { k: 2, vScale: .2 });
// right shoulder kerb + W-beam guardrail + posts
const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: .9, roughness: .35 });
sweep([[8.35, .55], [8.32, .62], [8.38, .7], [8.32, .78], [8.36, .86], [8.36, .55]], steel, { k: 1 });
// embankments: left rises (residential hill, sound walls), right falls toward the river
const grass = new THREE.MeshStandardMaterial({ color: 0x0c140c, roughness: 1 });
sweep([[-21, 0], [-26, .4], [-40, 6], [-90, 14], [-400, 30]], grass, { k: 3 });
const RIVER = 62, WATER_Y = 2.2;
const bankAt = i => Math.max(WATER_Y + .5, P[i].y);
{ const pos = [], idx = []; let rows = 0; for (let i = 0; i < N; i += 3) { const p = P[i], r = RN[i], pr = [[7.6, 0], [10.5, -.15], [16, -1.2], [RIVER - 8, -(p.y - WATER_Y) * .75], [RIVER + 2, -(p.y - WATER_Y) - .6]]; pr.forEach(q => pos.push(p.x + r.x * q[0], p.y + q[1], p.z + r.z * q[0])); rows++; }
  for (let a = 0; a < rows - 1; a++) for (let j = 0; j < 4; j++) { const q = a * 5 + j; idx.push(q, q + 5, q + 1, q + 1, q + 5, q + 6); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x10140e, roughness: .95 })); m.frustumCulled = false; scene.add(m); }
// riprap / rail line along the bank: dark gravel strip + rails
sweep([[22, -1.6], [30, -2.4]], new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 }), { k: 3 });
// sound walls on the left beyond the oncoming lanes in residential stretches
const wallTex = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#5c5a55'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 3; for (let i = 0; i <= w; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } x.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < h; i += 8) x.fillRect(0, i, w, 2); }, true);
const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: .9 });
[[900, 1900], [2600, 3500]].forEach(([a, b]) => sweep([[-23, -.2], [-23, 5.2], [-23.4, 5.2], [-23.4, -.2]], wallMat, { s0: a, s1: b, k: 1, vScale: 1 / 16 }));

// ---------- river with real planar reflection ----------
{ const g = new THREE.PlaneGeometry(9000, 2600); const mid = P[N >> 1], r = RN[N >> 1];
  let water;
  if (!LOW) { water = new Reflector(g, { textureWidth: Math.round(innerWidth * DPR * .5), textureHeight: Math.round(innerHeight * DPR * .5), color: 0x5a6070, clipBias: 0.003 }); }
  else water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x060810, metalness: 1, roughness: .12 }));
  water.rotation.x = -Math.PI / 2; water.position.set(mid.x + r.x * (RIVER + 1300), WATER_Y, mid.z + r.z * (RIVER + 1300)); water.rotation.z = -Math.atan2(T[N >> 1].x, T[N >> 1].z) + Math.PI / 2; scene.add(water); }
// Portland across the river: skyline with lit windows (far bank ~1.6-3.5 km)
{ const winTex = canvasTex(64, 128, (x, w, h) => { x.fillStyle = '#05060a'; x.fillRect(0, 0, w, h); for (let y = 4; y < h; y += 8) for (let i = 3; i < w; i += 7) { if (Math.random() < .45) { const c = Math.random() < .8 ? `rgba(255,${190 + Math.random() * 50 | 0},${110 + Math.random() * 60 | 0},${.5 + Math.random() * .5})` : 'rgba(170,220,255,.9)'; x.fillStyle = c; x.fillRect(i, y, 4, 4); } } }, true);
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const mat = new THREE.MeshBasicMaterial({ map: winTex, color: 0xffffff, fog: false });
  const n = LOW ? 120 : 260, im = new THREE.InstancedMesh(box, mat, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const mid = P[N >> 1], r = RN[N >> 1], t = T[N >> 1];
  for (let i = 0; i < n; i++) { const along = rnd(-4500, 4500), across = rnd(1700, 3600); const tower = Math.abs(along + 1800) < 700 && Math.random() < .5; const h = tower ? rnd(60, 160) : rnd(8, 40); const w = rnd(18, 50);
    const x = mid.x + t.x * along + r.x * across, z = mid.z + t.z * along + r.z * across; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(0, 3)); m4.compose(new THREE.Vector3(x, WATER_Y + 1, z), q, new THREE.Vector3(w, h, w)); im.setMatrixAt(i, m4); }
  scene.add(im);
  // far shore light strip (airport/industrial) as points
  const pts = [], cols = []; for (let i = 0; i < 1600; i++) { const along = rnd(-5000, 5000), across = rnd(1500, 3800); pts.push(mid.x + t.x * along + r.x * across, WATER_Y + rnd(1, 6), mid.z + t.z * along + r.z * across); const c = Math.random() < .75 ? [1, .62, .28] : [.7, .85, 1]; cols.push(...c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 10, map: glowTex(255, 200, 140), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: true }))); }

// ---------- light poles (median, double arm) with sodium heads + wet-road reflection streaks ----------
const POLE_GAP = 52, poles = [];
{ const poleG = new THREE.CylinderGeometry(.12, .18, 12, 6); poleG.translate(0, 6, 0); const armG = new THREE.BoxGeometry(.12, .12, 1); armG.translate(0, 0, .5);
  const n = Math.floor(L / POLE_GAP); const pm = new THREE.InstancedMesh(poleG, steel, n), am = new THREE.InstancedMesh(armG, steel, n * 2);
  const headG = new THREE.BoxGeometry(.5, .18, .9); const hm = new THREE.InstancedMesh(headG, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, .7) }), n * 2);
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
      const spr = new THREE.Sprite(sodium); spr.position.copy(hp); spr.scale.setScalar(LOW ? 5 : 7); scene.add(spr);
      const pp = at(s, -8.45 + sd * 4.2, .03 + j * .005); m4.compose(pp, q, new THREE.Vector3(1, 1, 1)); poolm.setMatrixAt(k * 2 + j, m4);
      if (sd > 0) poles.push({ s, d: -8.45 + sd * 4.2, pos: hp }); });
    const sp = at(s, -4.2, .04); m4.compose(sp, q, new THREE.Vector3(1, 1, 1)); stm.setMatrixAt(k, m4); }
  scene.add(pm, am, hm, stm, poolm); }
// real dynamic lights: small pool following the nearest poles (sodium) — cheap
const lightPool = []; for (let i = 0; i < (LOW ? 3 : 6); i++) { const l = new THREE.PointLight(0xff9a40, 110, 30, 1.6); scene.add(l); lightPool.push(l); }
// neon: a few roadside billboards / signage glow on the left hill (NFSU flavour)
{ const neon = [['#00e5ff', 'RIVERSIDE'], ['#ff2a6d', 'MOTEL'], ['#c040ff', '24 HR'], ['#30ff8a', 'TACOS']];
  [[700, -34, 0], [1600, -40, 1], [2450, -36, 2], [3300, -45, 3], [4300, -38, 1]].forEach(([s, d, k]) => { const [c, t] = neon[k];
    const tex = canvasTex(256, 96, (x, w, h) => { x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, w, h); x.font = 'italic bold 54px Arial Black'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = c; x.shadowBlur = 18; x.fillStyle = c; x.fillText(t, w / 2, h / 2); x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = .7; x.fillText(t, w / 2, h / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(2.2, 2.2, 2.2), side: 2, depthWrite: false })); const p = at(s, d, 9 + (P[Math.floor(s / STEP)].y < 30 ? 6 : 8)); m.position.copy(p); frame(s, F); m.rotation.y = F.h + Math.PI + .5; scene.add(m);
    const pl = new THREE.PointLight(new THREE.Color(c), 60, 30, 1.6); pl.position.copy(p).y -= 2; scene.add(pl); }); }

// ---------- overhead WSDOT-green sign gantries ----------
function signTex(lines) { return canvasTex(1024, 384, (x, w, h) => { x.fillStyle = '#0b5a2e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#eee'; x.lineWidth = 8; x.strokeRect(10, 10, w - 20, h - 20);
  lines.forEach(([txt, sz, y, extra]) => { x.fillStyle = '#f2f2f2'; x.font = `bold ${sz}px "Arial Narrow", Arial`; x.textAlign = 'center'; x.fillText(txt, w / 2, y); });
  if (lines.exit) { x.fillStyle = '#0b5a2e'; } }); }
function exitTab(txt) { return canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#0b5a2e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#eee'; x.lineWidth = 5; x.strokeRect(4, 4, w - 8, h + 10); x.fillStyle = '#fff'; x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.fillText(txt, w / 2, 48); }); }
const gantries = [
  { s: 150, d: 3.7, w: 7.2, tab: 'EXIT 1', lines: [['SE Columbia Way', 92, 130], ['Fort Vancouver', 72, 230], ['Natl Site    ¼ MILE', 72, 320]] },
  { s: 1350, d: -1.5, w: 9, lines: [['14  EAST', 110, 150], ['Camas', 92, 260], ['Washougal', 80, 345]] },
  { s: 3800, d: 3.7, w: 7.2, tab: 'EXIT 3', lines: [['Grand Blvd', 96, 140], ['SE Columbia Way', 80, 250], ['½ MILE', 72, 340]] },
];
for (const g of gantries) { frame(g.s, F); const grp = new THREE.Group(); const q = F.h;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(17.6, .5, .5), steel); beam.position.set(0, 7.3, 0); grp.add(beam);
  [-8.6, 8.6].forEach(x => { const c = new THREE.Mesh(new THREE.BoxGeometry(.4, 7.6, .4), steel); c.position.set(x, 3.8, 0); grp.add(c); });
  const sm = new THREE.MeshStandardMaterial({ map: signTex(g.lines), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0, roughness: .5 }); sm.emissiveMap = sm.map; sm.emissiveIntensity = .55;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(g.w, g.w * .375), sm); sign.position.set(-g.d, 8.9, -.3); sign.rotation.y = Math.PI; grp.add(sign);
  if (g.tab) { const tm = new THREE.MeshStandardMaterial({ map: exitTab(g.tab), roughness: .5, emissive: 0xffffff, emissiveIntensity: .55 }); tm.emissiveMap = tm.map; const tb = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .65), tm); tb.position.set(-g.d - g.w / 2 + 1.3, 8.9 + g.w * .1875 + .32, -.3); tb.rotation.y = Math.PI; grp.add(tb); }
  // sign lights
  const sl = new THREE.Mesh(new THREE.BoxGeometry(g.w, .08, .2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6) })); sl.position.set(-g.d, 8.9 - g.w * .1875 - .25, -.8); grp.add(sl);
  const c = at(g.s, 0, 0); grp.position.copy(c); grp.rotation.y = q; scene.add(grp); }

// ---------- fir tree cards (instanced crossed quads) ----------
{ const firTex = canvasTex(128, 256, (x, w, h) => { x.clearRect(0, 0, w, h); for (let i = 0; i < 26; i++) { const y = 20 + i * 8.6, hw = 6 + i * 2.2; x.fillStyle = `rgb(${8 + Math.random() * 10 | 0},${22 + Math.random() * 16 | 0},${14 + Math.random() * 10 | 0})`; x.beginPath(); x.moveTo(w / 2, y - 14); x.lineTo(w / 2 - hw, y + 12); x.lineTo(w / 2 + hw, y + 12); x.fill(); } x.fillStyle = '#1a120c'; x.fillRect(w / 2 - 4, h - 26, 8, 26); });
  const g1 = new THREE.PlaneGeometry(1, 1); g1.translate(0, .5, 0); const g2 = g1.clone().rotateY(Math.PI / 2); const gg = new THREE.BufferGeometry();
  const merge = (a, b) => { const pa = [...a.attributes.position.array, ...b.attributes.position.array], ua = [...a.attributes.uv.array, ...b.attributes.uv.array], na = [...a.attributes.normal.array, ...b.attributes.normal.array]; const ia = [...a.index.array, ...b.index.array.map(v => v + 4)]; gg.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(ua, 2)); gg.setAttribute('normal', new THREE.Float32BufferAttribute(na, 3)); gg.setIndex(ia); };
  merge(g1, g2);
  const mat = new THREE.MeshStandardMaterial({ map: firTex, alphaTest: .5, side: 2, roughness: 1, color: 0x9aa89a });
  const n = LOW ? 900 : 1800, im = new THREE.InstancedMesh(gg, mat, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) { const s = rnd(0, L); let d; const side = Math.random(); if (side < .62) d = -rnd(26, 160); else d = rnd(13, 30);
    const f = Math.floor(s / STEP); let y = P[f].y; if (d < -26) y += d < -40 ? 6 + (Math.min(-d, 90) - 40) * .16 : (-d - 26) * .43; else y += d > 16 ? -1.2 - (d - 16) * .2 : -(d - 10.5) * .2;
    const h = rnd(9, 26); q.setFromAxisAngle(up, rnd(0, 3.14)); m4.compose(at(s, d, y - P[f].y), q, new THREE.Vector3(h * .42, h, h * .42)); im.setMatrixAt(i, m4); }
  scene.add(im); }

// ---------- rain ----------
const RAIN_N = LOW ? 900 : 2200; const rainG = new THREE.BufferGeometry(); const rp = new Float32Array(RAIN_N * 6); rainG.setAttribute('position', new THREE.BufferAttribute(rp, 3));
const rainBase = []; for (let i = 0; i < RAIN_N; i++) rainBase.push([rnd(-30, 30), rnd(0, 22), rnd(-30, 40)]);
const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: 0x8890b0, transparent: true, opacity: .35, fog: false })); rain.frustumCulled = false; scene.add(rain);
// mist sheets
const mistMat = new THREE.SpriteMaterial({ map: glowTex(120, 110, 130, 4), color: 0x3a3440, transparent: true, opacity: .1, depthWrite: false }); const mists = []; for (let i = 0; i < 10; i++) { const m = new THREE.Sprite(mistMat); m.scale.set(120, 30, 1); scene.add(m); mists.push(m); }

// ---------- vehicles ----------
const paint = c => new THREE.MeshPhysicalMaterial({ color: c, metalness: .7, roughness: .35, clearcoat: 1, clearcoatRoughness: .05 });
const glassM = new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: .9, roughness: .05 });
const tyreM = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: .8 });
const tailM = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, .15, .1) }), headM = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 3.6) });
const tailSpr = new THREE.SpriteMaterial({ map: glowTex(255, 30, 20), color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const headSpr = new THREE.SpriteMaterial({ map: flareTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const shadowTex = canvasTex(64, 128, (x, w, h) => { const g = x.createRadialGradient(32, 64, 4, 32, 64, 60); g.addColorStop(0, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const shadowM = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
function box(w, h, l, m, x = 0, y = 0, z = 0) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(x, y, z); return b; }
function wheelsOn(g, w, l, r = .34) { const wg = new THREE.CylinderGeometry(r, r, .26, 12); wg.rotateZ(Math.PI / 2); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => { const m = new THREE.Mesh(wg, tyreM); m.position.set(sx * w / 2, r, sz * l * .34); g.add(m); }); }
function shadow(g, w, l) { const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.4, l * 1.25), shadowM); s.rotation.x = -Math.PI / 2; s.position.y = .04; g.add(s); }
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
function copCar() { const g = new THREE.Group(); const blk = paint(0x07070a), wht = paint(0xe8e8e8); g.add(box(1.9, .62, 4.9, blk, 0, .64, 0), box(1.92, .4, 1.6, wht, 0, .7, .2)); g.add(box(1.6, .5, 2.4, glassM, 0, 1.2, -.3), box(1.5, .06, 2.1, wht, 0, 1.47, -.3));
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, .2, .2) }), blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(.2, .6, 7) }); const r = box(.6, .14, .3, red, -.35, 1.56, -.2), b = box(.6, .14, .3, blue, .35, 1.56, -.2); g.add(r, b);
  const rs = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color: 0xff2030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), bs = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color: 0x3060ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  rs.position.set(-.4, 1.6, -.2); bs.position.set(.4, 1.6, -.2); g.add(rs, bs);
  [-.62, .62].forEach(x => { const s = new THREE.Sprite(headSpr); s.position.set(x, .7, 2.5); s.scale.setScalar(2.2); g.add(s); });
  const rl = new THREE.PointLight(0xff2030, 0, 26, 1.4), bl = new THREE.PointLight(0x3060ff, 0, 26, 1.4); rl.position.set(-1, 2, 0); bl.position.set(1, 2, 0); g.add(rl, bl);
  wheelsOn(g, 1.75, 4.9); shadow(g, 1.9, 4.9); g.userData = { rs, bs, rl, bl, r, b, w: 1.9, l: 4.9 }; return g; }

// ---------- player ----------
const CARS = [
  { name: 'FERRARI 458', sub: 'V8 · 562 HP', top: 88, acc: 13.5, grip: 1.0, drift: .8, nos: 1.0, stats: [.95, .85, .7] },
  { name: 'RX-14 TUNER', sub: 'TWIN-TURBO · WIDEBODY', top: 80, acc: 15, grip: .85, drift: 1.25, nos: 1.3, stats: [.8, .92, .95] },
];
let carSel = +(Q.get('car') ?? localStorage.racexSliceCar ?? 0) || 0;
const player = new THREE.Group(); player.rotation.order = 'YXZ'; scene.add(player);
const body = new THREE.Group(); player.add(body);
const models = [new THREE.Group(), tuner()]; models.forEach(m => body.add(m));
let ferrariReady = false;
{ const dr = new DRACOLoader(); dr.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); const gl = new GLTFLoader(); gl.setDRACOLoader(dr);
  gl.load('../assets/ferrari.glb', g => { const m = g.scene.children[0];
    const bm = new THREE.MeshPhysicalMaterial({ color: 0xc8101a, metalness: 1, roughness: .38, clearcoat: 1, clearcoatRoughness: .03 }), det = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: .3 }), gm = new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: .3, roughness: 0, transparent: true, opacity: .75 });
    const set = (n, mat) => { const o = m.getObjectByName(n); if (o) o.material = mat; }; set('body', bm); ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim'].forEach(n => set(n, det)); set('glass', gm);
    m.scale.setScalar(1.05); m.rotation.y += Math.PI; models[0].add(m); ferrariReady = true; ready(); }, undefined, e => { console.warn('ferrari failed', e); models[0].add(sedan(0xc8101a)); ferrariReady = true; ready(); }); }
shadow(player, 1.9, 4.5);
// headlight cone + flare sprites, tail sprites, nitro flames
const headL = new THREE.SpotLight(0xffe8c8, LOW ? 50 : 70, 70, .42, .6, 1.4); headL.position.set(0, .9, 1.9); headL.target.position.set(0, 0, 30); player.add(headL, headL.target);
const flares = [-.65, .65].map(x => { const s = new THREE.Sprite(headSpr); s.position.set(x, .7, 2.3); s.scale.setScalar(1.4); player.add(s); return s; });
const pTails = [-.6, .6].map(x => { const s = new THREE.Sprite(tailSpr); s.position.set(x, .82, -2.35); s.scale.setScalar(1.1); player.add(s); return s; });
const flameM = new THREE.SpriteMaterial({ map: glowTex(80, 160, 255, 2), color: 0x60a0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const flames = [-.45, .45].map(x => { const s = new THREE.Sprite(flameM); s.position.set(x, .42, -2.55); s.scale.set(.1, .1, 1); player.add(s); return s; });
const popM = new THREE.SpriteMaterial({ map: glowTex(255, 140, 40, 2), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const pops = [-.45, .45].map(x => { const s = new THREE.Sprite(popM); s.position.set(x, .42, -2.5); s.scale.setScalar(.01); player.add(s); return s; });
// road spray behind the car
const SPRAY = 140, sprayG = new THREE.BufferGeometry(), sprayP = new Float32Array(SPRAY * 3); sprayG.setAttribute('position', new THREE.BufferAttribute(sprayP, 3));
const spray = new THREE.Points(sprayG, new THREE.PointsMaterial({ size: .5, map: glowTex(200, 200, 220, 3), color: 0x606878, transparent: true, depthWrite: false, opacity: .5 })); spray.frustumCulled = false; scene.add(spray);
const sprayV = []; for (let i = 0; i < SPRAY; i++) sprayV.push({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), life: 0 });

// ---------- traffic ----------
const COLS = [0xdedede, 0x1d1d22, 0x6a6e78, 0x2a3e6a, 0x8a1a1a, 0x5a5a52, 0xb8b8c0, 0x223322, 0xd0c8a8];
const traffic = [];
for (let i = 0; i < (LOW ? 14 : 22); i++) { const kind = i % 7 === 0 ? 'truck' : i % 3 === 0 ? 'suv' : 'sedan'; const m = kind === 'truck' ? truck() : kind === 'suv' ? suv(COLS[i % COLS.length]) : sedan(COLS[i % COLS.length]); scene.add(m);
  traffic.push({ m, s: 110 + i * 48 + rnd(-12, 12), lane: i % 3, d: LANES[i % 3], v: kind === 'truck' ? rnd(22, 25) : rnd(26, 32), w: m.userData.w, l: m.userData.l, passed: false, nm: false, hit: 0, tlc: rnd(4, 14) }); }
// oncoming headlights (westbound side)
const oncoming = []; for (let i = 0; i < 18; i++) { const g = new THREE.Group(); [-.6, .6].forEach(x => { const s = new THREE.Sprite(headSpr); s.position.set(x, .7, 0); s.scale.setScalar(2.4); g.add(s); }); scene.add(g); oncoming.push({ g, s: rnd(0, L), d: -rnd(11.5, 19), v: rnd(26, 34) }); }
// cop
const cop = { m: copCar(), on: false, s: -999, d: 0, v: 0, t: 0 }; scene.add(cop.m); cop.m.visible = false;

// ---------- post: bloom + speed FX (radial blur, chromatic aberration, vignette, grain, nitro tint) ----------
const composer = new EffectComposer(R); composer.addPass(new RenderPass(scene, cam));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 128), .85, .55, .82); composer.addPass(bloom);
const fxPass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, amt: { value: 0 }, ca: { value: 0 }, nos: { value: 0 }, t: { value: 0 }, shake: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float amt,ca,nos,t,shake;varying vec2 vUv;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+t)*43758.5453);}
  void main(){vec2 c=vec2(.5,.52);vec2 d=vUv-c;float r=length(d);vec3 col=vec3(0.);float w=0.;
    for(int i=0;i<${LOW ? 4 : 7};i++){float k=float(i)/${LOW ? '4.' : '7.'};float s=1.-amt*k*smoothstep(.05,.6,r);vec2 uv=c+d*s;
      col.r+=texture2D(tDiffuse,c+d*s*(1.+ca*r)).r;col.g+=texture2D(tDiffuse,uv).g;col.b+=texture2D(tDiffuse,c+d*s*(1.-ca*r)).b;w+=1.;}
    col/=w;col*=mix(1.,smoothstep(1.05,.28,r),.85);col+=nos*vec3(.0,.06,.14)*smoothstep(.25,.75,r);col+=(h(vUv*731.)-.5)*.035;
    gl_FragColor=vec4(col,1.);}` }); composer.addPass(fxPass); composer.addPass(new OutputPass());
function resize() { const w = innerWidth, h = innerHeight; R.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w * DPR / 2, h * DPR / 2); cam.aspect = w / h; cam.fov = w / h > 1.9 ? 58 : 64; cam.updateProjectionMatrix(); }
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
  const so = AC.createOscillator(); so.type = 'triangle'; so.frequency.value = 800; const lfo = AC.createOscillator(); lfo.frequency.value = .35; const lg = AC.createGain(); lg.gain.value = 420; lfo.connect(lg).connect(so.frequency); const sg = AC.createGain(); sg.gain.value = 0; so.connect(sg).connect(comp); so.start(); lfo.start(); A.siren = { g: sg, lfo };
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
const S = { s: 20, d: LANES[1], psi: 0, v: 0, slip: 0, yawVis: 0, gear: 1, rpm: 900, nos: 1, score: 0, combo: 1, comboT: 0, heat: 0, shake: 0, spin: 0, t: 0, top: 0, nm: 0, bestCombo: 1, drift: 0, run: false, done: false, cut: 0, crashT: 0, busted: 0 };
const GEARS = [0, 14, 25, 36, 48, 62, 99];
window.__S = S;
function popup(txt, sub, col) { const p = $('pop'); const d = document.createElement('div'); d.className = 'p'; d.innerHTML = txt + (sub ? `<small>${sub}</small>` : ''); if (col) d.style.color = col; p.innerHTML = ''; p.appendChild(d); }
function msg(t, ms = 1500) { $('msg').textContent = t; clearTimeout(msg.t); msg.t = setTimeout(() => $('msg').textContent = '', ms); }
function addScore(p, label, sub) { S.score += Math.round(p * S.combo); popup(`${label} +${Math.round(p * S.combo)}`, sub); }

// garage
function garage() { const g = $('garage'); g.innerHTML = ''; CARS.forEach((c, i) => { const d = document.createElement('div'); d.className = 'card' + (i === carSel ? ' sel' : ''); d.innerHTML = `<b>${c.name}</b><span style="color:#ff2a6d">${c.sub}</span>` + ['TOP SPEED', 'ACCEL', 'DRIFT'].map((n, k) => `<div class="st">${n}<i><u style="width:${c.stats[k] * 100}%"></u></i></div>`).join(''); d.onclick = () => { carSel = i; localStorage.racexSliceCar = i; garage(); showCar(); }; g.appendChild(d); }); }
function showCar() { models.forEach((m, i) => m.visible = i === carSel); }
garage(); showCar();
function ready() { $('load').textContent = 'ready'; window.__ready = true; }
function reset() { Object.assign(S, { s: 20, d: LANES[1], psi: 0, v: 0, slip: 0, gear: 1, nos: 1, score: 0, combo: 1, comboT: 0, heat: Q.has('heat') ? 3.5 : 0, shake: 0, spin: 0, t: 0, top: 0, nm: 0, bestCombo: 1, drift: 0, done: false, crashT: 0, busted: 0 });
  traffic.forEach((c, i) => { c.s = 120 + i * 210 + rnd(-40, 40); c.lane = i % 3; c.d = LANES[c.lane]; c.passed = false; c.nm = false; });
  if (Q.has('at')) { S.s = +Q.get('at'); traffic.forEach((c, i) => { c.s = S.s + 40 + i * 70 + rnd(-15, 15); }); }
  cop.on = false; cop.m.visible = false; }
function go() { initAudio(); AC?.resume(); $('start').style.display = 'none'; $('end').style.display = 'none'; reset(); S.run = true; if (Q.has('v')) S.v = +Q.get('v');
  try { if (!/iP(hone|od|ad)/.test(navigator.userAgent)) document.documentElement.requestFullscreen?.().catch(() => { }); screen.orientation?.lock?.('landscape').catch(() => { }); } catch (e) { } msg('SR-14 EAST', 1800); }
$('go').onclick = go; $('again').onclick = () => { $('end').style.display = 'none'; $('start').style.display = 'flex'; };
function finish(busted) { S.run = false; S.done = true; $('endt').textContent = busted ? 'BUSTED' : 'FINISH'; const best = +(localStorage.racexSliceBest || 0); if (!busted && S.score > best) localStorage.racexSliceBest = S.score;
  $('res').innerHTML = `SCORE <b>${S.score.toLocaleString()}</b>${!busted && S.score > best ? ' · NEW BEST' : ''}<br>TIME <b>${S.t.toFixed(1)}s</b> · TOP <b>${Math.round(S.top * 2.237)} MPH</b><br>NEAR MISSES <b>${S.nm}</b> · BEST COMBO <b>x${S.bestCombo}</b>`; $('end').style.display = 'flex'; }

// ---------- main loop ----------
const clock = new THREE.Clock(); let fpsA = 0, fpsN = 0, fpsT = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fwd = new THREE.Vector3();
let sprayI = 0, lastGear = 1, copLow = 0, prevNos = false, wallT = 0;
const heatBars = [...document.querySelectorAll('#heat .bars span')];
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
  let g = 1; while (g < 6 && S.v > GEARS[g]) g++; const lo = GEARS[g - 1], hi = GEARS[g];
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
    if (ds < -140 || ds > 900) { c.s = S.s + rnd(260, 520); c.lane = Math.floor(rnd(0, 3)); c.d = LANES[c.lane]; c.passed = false; c.minD = 99; if (traffic.some(o => o !== c && o.lane === c.lane && Math.abs(o.s - c.s) < 30)) c.s += 45; }
    const dd = Math.abs(c.d - S.d), hitL = c.l / 2 + 2.25, hitW = c.w / 2 + .92;
    if (Math.abs(ds) < hitL + 2) c.minD = Math.min(c.minD ?? 99, dd);
    if (Math.abs(ds) < hitL && dd < hitW && S.t - (c.hit || -9) > 1.2) { // crash
      c.hit = S.t; const rel = S.v - c.vc; S.v = Math.max(c.vc * .6, S.v * .45); c.vc += rel * .3; S.spin = .9; S.slip = (Math.random() < .5 ? -1 : 1) * .9; S.shake = 1.2; S.d += Math.sign(S.d - c.d || 1) * .9;
      S.combo = 1; S.comboT = 0; S.heat = Math.min(5, S.heat + .6); thump(1.2); popup('CRASH', 'combo lost', '#ff3050'); }
    if (!c.passed && ds < -hitL) { c.passed = true; if ((c.minD ?? 99) < hitW + 1.5 && S.t - (c.hit || -9) > 1.5 && S.v - c.vc > 5) { const close = clamp(1 - ((c.minD - hitW) / 1.5), 0, 1); S.nm++; const p = 200 + 300 * close + (S.v - c.vc) * 8; S.combo = Math.min(10, S.combo + 1); S.bestCombo = Math.max(S.bestCombo, S.combo); S.comboT = 4.5; addScore(p, close > .6 ? 'CLOSE CALL' : 'NEAR MISS', `x${S.combo} combo`); S.heat = Math.min(5, S.heat + .06); burst(.35, 1400, .5); } }
    frame(c.s, F); c.m.position.copy(F.p).addScaledVector(F.r, c.d); c.m.position.y = F.p.y + (S.t - (c.hit || -9) < .4 ? .05 : 0); c.m.rotation.y = F.h - (LANES[c.lane] - c.d) * .03;
  }
  S.comboT -= dt; if (S.comboT <= 0 && S.combo > 1) { S.combo = 1; }
  for (const o of oncoming) { o.s -= o.v * dt; if (o.s < S.s - 200) o.s = S.s + rnd(500, 900); frame(o.s, F); o.g.position.copy(F.p).addScaledVector(F.r, o.d).setY(F.p.y); o.g.rotation.y = F.h + Math.PI; }
  // heat & cop
  if (S.v > 53.6) S.heat = Math.min(5, S.heat + dt * .3); else if (!cop.on) S.heat = Math.max(0, S.heat - dt * .08);
  if (S.heat >= 1 && !cop.on && S.s > 200) { cop.on = true; cop.s = S.s - 160; cop.d = S.d; cop.v = S.v + 5; cop.m.visible = true; msg('PURSUIT!', 1800); }
  if (cop.on) { const gap = S.s - cop.s; const vt = Math.min(98, S.v + (gap > 25 ? 10 + gap * .02 : gap > 9 ? 2 : -2)); cop.v = lerp(cop.v, vt, dt * .9); cop.s += cop.v * dt;
    let td = gap < 40 ? S.d : cop.d; for (const c of traffic) { const ds = c.s - cop.s; if (ds > 0 && ds < 22 && Math.abs(c.d - td) < 2.6) td = c.d + (c.d > 0 ? -3.7 : 3.7); } cop.d = lerp(cop.d, clamp(td, -lim, lim), dt * 1.5);
    if (gap < 5.5 && Math.abs(cop.d - S.d) < 2) { S.v *= 1 - dt * .8; S.shake = Math.max(S.shake, .3); }
    if (gap < 9 && S.v < 7) { copLow += dt; if (copLow > 2.5) { finish(true); } } else copLow = 0;
    if (gap > 650) { cop.on = false; cop.m.visible = false; S.heat = 0; S.score += 2500; popup('ESCAPED +2500', 'heat cleared', '#30ff8a'); }
    frame(cop.s, F); cop.m.position.copy(F.p).addScaledVector(F.r, cop.d); cop.m.rotation.y = F.h; const u = cop.m.userData, ph = (S.t * 6) % 2 < 1;
    u.rs.scale.setScalar(ph ? 5 : .5); u.bs.scale.setScalar(ph ? .5 : 5); u.rl.intensity = ph ? 120 : 0; u.bl.intensity = ph ? 0 : 160; }
  if (S.s > L - 40) finish(false);
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
  frame(S.s, F); const v = S.v, yaw = player.rotation.y; fwd.set(Math.sin(yaw * .35 + F.h * .65), 0, Math.cos(yaw * .35 + F.h * .65));
  const back = 6.3 + v * .022 + (k.nosOn ? 1.4 : 0), hgt = 2.05 + v * .005;
  tmp.copy(player.position).addScaledVector(fwd, -back); tmp.y += hgt; cam.position.lerp(tmp, Math.min(1, dt * 9));
  const sh = S.shake * .35; cam.position.x += rnd(-sh, sh); cam.position.y += rnd(-sh, sh) * .6;
  tmp2.copy(player.position).addScaledVector(fwd, 7); tmp2.y += 1.1; cam.lookAt(tmp2);
  const fov = (innerWidth / innerHeight > 1.9 ? 58 : 64) + clamp(v - 20, 0, 70) * .17 + (k.nosOn ? 9 : 0); cam.fov = lerp(cam.fov, fov, dt * 3); cam.updateProjectionMatrix();
}
function fxUpdate(dt, k) {
  const sp = clamp((S.v - 28) / 55, 0, 1); fxPass.uniforms.amt.value = lerp(fxPass.uniforms.amt.value, sp * .07 + (k.nosOn ? .08 : 0), dt * 4);
  fxPass.uniforms.ca.value = .01 + sp * .05 + (k.nosOn ? .06 : 0) + S.shake * .05; fxPass.uniforms.nos.value = lerp(fxPass.uniforms.nos.value, k.nosOn ? 1 : 0, dt * 5); fxPass.uniforms.t.value = S.t % 10;
  bloom.strength = .8 + (k.nosOn ? .35 : 0);
  // rain streaks around camera, stretched by speed
  const c = cam.position, yaw = F.h, sx = Math.sin(yaw), cz = Math.cos(yaw), len = .5 + S.v * .025;
  for (let i = 0; i < RAIN_N; i++) { const b = rainBase[i]; b[1] -= dt * 16; b[2] -= dt * S.v * .9; if (b[1] < -3) b[1] += 25; if (b[2] < -30) b[2] += 70;
    const x = c.x + b[0] * cz + b[2] * sx, z = c.z - b[0] * sx + b[2] * cz, y = c.y + b[1] - 6; const j = i * 6;
    rp[j] = x; rp[j + 1] = y; rp[j + 2] = z; rp[j + 3] = x - sx * len * .9; rp[j + 4] = y + .55; rp[j + 5] = z - cz * len * .9; }
  rainG.attributes.position.needsUpdate = true;
  mists.forEach((m, i) => { const s = i * 60 + 600 * Math.ceil((S.s - 40 - i * 60) / 600); frame(Math.max(0, s), F2); m.position.copy(F2.p).addScaledVector(F2.r, (i % 3 - 1) * 30); m.position.y += 6; });
  scene.userData.sky.position.copy(cam.position);
}
function audioUpdate(k) { if (!AC) return; const t = AC.currentTime, f = S.rpm / 60 * 2;
  A.eng.os.forEach(o => o.o.frequency.setTargetAtTime(f * o.m, t, .03)); A.eng.g.gain.setTargetAtTime(S.run ? .22 + (k.gas ? .2 : 0) : .1, t, .05); A.eng.lp.frequency.setTargetAtTime(500 + S.rpm * .35 + (k.gas ? 900 : 0), t, .05);
  A.wind.g.gain.setTargetAtTime(Math.min(.5, (S.v / 80) ** 2 * .45), t, .1); A.wind.f.frequency.setTargetAtTime(400 + S.v * 12, t, .1);
  A.tyre.g.gain.setTargetAtTime((k.drifting ? .35 : 0) + (wallT > 0 ? .25 : 0) + (S.spin > 0 ? .4 : 0), t, .05);
  A.nos.g.gain.setTargetAtTime(k.nosOn ? .3 : 0, t, .08);
  A.siren.g.gain.setTargetAtTime(cop.on ? clamp(1 - (S.s - cop.s) / 500, .05, 1) * .1 : 0, t, .2); }
let K = { nosOn: false, drifting: false, gas: false, st: 0 };
function hud() { $('spd').textContent = Math.round(S.v * 2.237); $('gear').textContent = S.v < .5 ? 'N' : S.gear; $('nos').firstElementChild.style.width = (S.nos * 100) + '%';
  $('sc').textContent = S.score.toLocaleString(); const cb = $('combo'); cb.textContent = 'x' + S.combo + ' COMBO'; cb.style.opacity = S.combo > 1 ? 1 : 0; $('combobar').firstElementChild.style.width = (S.combo > 1 ? clamp(S.comboT / 4.5, 0, 1) * 100 : 0) + '%';
  heatBars.forEach((b, i) => b.style.background = S.heat > i + .02 ? (i < 2 ? '#ffb000' : '#ff2a4a') : 'rgba(255,255,255,.15)');
  $('prog').firstElementChild.style.width = clamp(S.s / L, 0, 1) * 100 + '%'; $('dist').textContent = 'SR-14 EAST · ' + Math.max(0, (L - S.s) / 1000).toFixed(1) + ' KM'; }
function loop() {
  requestAnimationFrame(loop); const dt = Math.min(.05, clock.getDelta());
  if (S.run) { K = update(dt); camUpdate(dt, K); }
  else { // attract cam orbit around the car at the start line
    frame(S.s, F); player.position.copy(F.p).addScaledVector(F.r, S.d); player.rotation.y = F.h; const a = performance.now() * .00015 + 2.4; cam.position.copy(player.position).add(tmp.set(Math.sin(a) * 8, 2.2, Math.cos(a) * 8)); cam.lookAt(tmp2.copy(player.position).setY(player.position.y + .8)); }
  fxUpdate(dt, K); audioUpdate(K); if (S.run) hud();
  composer.render();
  fpsT += dt; fpsN++; if (fpsT > 1) { window.__fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
}
reset(); loop();
window.__scene = scene;
