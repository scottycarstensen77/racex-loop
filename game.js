import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TRACK } from './track.js';
import { buildScenery, piersMesh } from './scenery.js';

// ---------- config / key ----------
const Q = new URLSearchParams(location.search);
const CFG = window.RACEX_CONFIG || {};
if (Q.get('key')) localStorage.racexTilesKey = Q.get('key');
if (Q.get('key') === '') localStorage.removeItem('racexTilesKey');
const TILES_KEY = Q.get('key') || CFG.googleTilesKey || localStorage.racexTilesKey || '';
const LOW = Q.has('low') || (navigator.hardwareConcurrency || 4) <= 4;
const NIGHT = Q.has('night');
document.getElementById('mi').textContent = TRACK.mi;
document.getElementById('credit').textContent = 'Imagery: USGS The National Map (public domain) · Terrain: AWS Terrain Tiles / USGS 3DEP · Roads, buildings, trees © OpenStreetMap contributors (ODbL) · "Ferrari 458 Italia" by vicent091036 (Sketchfab, CC BY 4.0, via three.js examples)' + (TILES_KEY ? ' · Map data ©Google' : '');

// ---------- track ----------
const P = TRACK.pts.map(p => new THREE.Vector2(p[0], -p[1])); // x=east, y(z)=south
const N = P.length;
const TAN = P.map((p, i) => P[(i + 3) % N].clone().sub(P[(i - 3 + N) % N]).normalize());
const NOR = TAN.map(t => new THREE.Vector2(-t.y, t.x));
const CUM = [0]; for (let i = 1; i <= N; i++) CUM.push(CUM[i - 1] + P[i % N].distanceTo(P[i - 1]));
const LEN = CUM[N], HW = 12.5;
let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
P.forEach(p => { mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x); mnz = Math.min(mnz, p.y); mxz = Math.max(mxz, p.y); });
const segAt = i => { let s = TRACK.seg[0][1]; for (const q of TRACK.seg) if (i >= q[0]) s = q[1]; return s; };
const rnd = (a, b) => a + Math.random() * (b - a);
const TH = TRACK.h, TBR = TRACK.br;
const roadY = (x, z, ci) => { const t = TAN[ci], p = P[ci]; const f = ((x - p.x) * t.x + (z - p.y) * t.y) / 5; const j = f >= 0 ? (ci + 1) % N : (ci - 1 + N) % N; return TH[ci] + (TH[j] - TH[ci]) * Math.min(1, Math.abs(f)); };

// ---------- renderer ----------
const canvas = document.getElementById('c');
const R = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio, LOW ? 1.25 : 1.75);
R.setPixelRatio(DPR);
R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = NIGHT ? 1.1 : 0.95;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(NIGHT ? 0x140c22 : 0xc9b8a4, NIGHT ? 0.00045 : 0.00016);
const cam = new THREE.PerspectiveCamera(65, 1, 0.3, 14000);

// sky dome (dusk gradient + stars)
{
  const g = new THREE.SphereGeometry(12000, 32, 16);
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: {},
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: NIGHT ? `varying vec3 vP;float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}
    void main(){float y=vP.y;vec3 top=vec3(.01,.012,.045),mid=vec3(.09,.04,.18),hor=vec3(.85,.32,.18);
    float w=pow(max(0.,dot(normalize(vec3(vP.x,0.,vP.z)),normalize(vec3(-.6,0.,.8)))),3.);
    vec3 c=mix(mix(hor*(.35+.9*w),mid,smoothstep(0.,.18,y)),top,smoothstep(.12,.6,y));
    vec3 q=floor(vP*420.);float s=step(.9975,h(q))*smoothstep(.15,.5,y);c+=vec3(s);gl_FragColor=vec4(c,1.);}` : `varying vec3 vP;
    void main(){float y=vP.y;vec3 sd=normalize(vec3(-.55,.16,-.82));float sdot=max(0.,dot(vP,sd));
    vec3 top=vec3(.22,.42,.78),hor=vec3(.98,.78,.58);vec3 c=mix(hor,top,smoothstep(-.02,.45,y));
    c+=vec3(1.,.6,.3)*pow(sdot,6.)*.6+vec3(1.,.85,.6)*pow(sdot,600.)*8.;if(y<0.)c=mix(c,vec3(.75,.68,.6),smoothstep(0.,-.1,y));gl_FragColor=vec4(c,1.);}` });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky); scene.userData.sky = sky;
}
// lights
scene.add(NIGHT ? new THREE.HemisphereLight(0x4a5a9a, 0x1a1020, 0.55) : new THREE.HemisphereLight(0xbcd4ff, 0x6a5a40, 1.25));
const moon = new THREE.DirectionalLight(NIGHT ? 0xffb48a : 0xffd2a0, NIGHT ? 0.6 : 2.6); moon.position.set(-550, 160, -820); scene.add(moon);
// environment for car reflections: city-light gradient env
{
  const pm = new THREE.PMREMGenerator(R);
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
    vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: !NIGHT ? 'varying vec3 v;void main(){float y=v.y;vec3 c=mix(vec3(1.,.8,.6),vec3(.3,.5,.9),smoothstep(-.05,.5,y));c+=vec3(3.,2.,1.2)*pow(max(0.,dot(v,normalize(vec3(-.55,.16,-.82)))),40.);if(y<-.02)c=vec3(.25,.22,.18);gl_FragColor=vec4(c,1.);}' : 'varying vec3 v;void main(){float y=v.y;vec3 c=mix(vec3(1.2,.5,.25),vec3(.05,.05,.15),smoothstep(-.05,.4,y));c+=vec3(.0,.6,.9)*pow(max(0.,v.x),8.)*1.5+vec3(1.,.2,.8)*pow(max(0.,-v.x),8.)*1.2;c+=vec3(2.)*smoothstep(.97,1.,abs(v.z))*step(.1,y)*step(y,.25);if(y<-.05)c=vec3(.02);gl_FragColor=vec4(c,1.);}' })));
  scene.environment = pm.fromScene(es, 0.02).texture; scene.environmentIntensity = 0.9;
}

// ---------- textures ----------
function asphaltTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#1b1c20'; x.fillRect(0, 0, 512, 512);
  const img = x.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() * 26) | 0; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n + 2; }
  x.putImageData(img, 0, 0);
  // lanes: road spans u 0..1 across 25 m; 4 lanes
  const lane = u => u * 512;
  x.fillStyle = '#f2c200'; x.fillRect(lane(0.03), 0, 6, 512); // yellow edge = left (median) side, US one-way roadway
  x.fillStyle = '#e8e8e8'; x.fillRect(lane(0.97) - 6, 0, 6, 512); // white edge = right shoulder
  x.fillStyle = '#d8d8d8'; [0.265, 0.5, 0.735].forEach(u => x.fillRect(lane(u) - 3, 0, 5, 200));
  // tire wear stripes
  x.globalAlpha = 0.12; x.fillStyle = '#000'; [0.15, 0.38, 0.62, 0.85].forEach(u => x.fillRect(lane(u) - 14, 0, 28, 512)); x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function glowTex(r, g, b) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(.25, `rgba(${r},${g},${b},.5)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

// ---------- road ----------
function ribbon(o1, o2, y, mat, vScale) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const p = P[i % N], m = NOR[i % N];
    const yy = y + TH[i % N]; pos.push(p.x + m.x * o1, yy, p.y + m.y * o1, p.x + m.x * o2, yy, p.y + m.y * o2);
    const v = CUM[i] / vScale; uv.push(0, v, 1, v);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const ge = new THREE.BufferGeometry();
  ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  ge.setIndex(idx); ge.computeVertexNormals();
  const me = new THREE.Mesh(ge, mat); me.frustumCulled = false; scene.add(me); return me;
}
const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex(), roughness: NIGHT ? 0.55 : 0.85, metalness: NIGHT ? 0.15 : 0, color: NIGHT ? 0xffffff : 0xb8b4ae, side: THREE.DoubleSide, envMapIntensity: NIGHT ? 0.5 : 0.25 });
const road = ribbon(-HW, HW, 0.05, roadMat, 24);
ribbon(-HW - 3, -HW, 0.03, new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9, side: 2 }), 10);
ribbon(HW, HW + 3, 0.03, new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9, side: 2 }), 10);
// concrete barriers with neon reflector strip
function wall(o, col) {
  const pos = [], idx = []; const h = 1.0;
  for (let i = 0; i <= N; i++) { const p = P[i % N], m = NOR[i % N]; const yb = TH[i % N]; pos.push(p.x + m.x * o, yb - (TBR[i % N] ? 1.6 : 0.6), p.y + m.y * o, p.x + m.x * o, yb + h, p.y + m.y * o); if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setIndex(idx); ge.computeVertexNormals();
  const w = new THREE.Mesh(ge, new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 0.8, side: 2 })); w.frustumCulled = false; scene.add(w);
  const sp = [], si = [];
  for (let i = 0; i <= N; i++) { const p = P[i % N], m = NOR[i % N]; const oo = o - Math.sign(o) * 0.02; const yb = TH[i % N]; sp.push(p.x + m.x * oo, yb + .78, p.y + m.y * oo, p.x + m.x * oo, yb + .9, p.y + m.y * oo); if (i < N) { const a = i * 2; si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); g2.setIndex(si);
  const s = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color: NIGHT ? col : new THREE.Color(0xd8d4c8), side: 2, toneMapped: !NIGHT ? true : false })); s.frustumCulled = false; scene.add(s);
}
wall(-HW - 3, new THREE.Color(0x00e5ff).multiplyScalar(2.2)); wall(HW + 3, new THREE.Color(0xff2bd6).multiplyScalar(2.2));
// track bridge piers + deck underside
{ const pr = []; for (let i = 0; i < N; i += 6) if (TBR[i]) for (const o of [-8, 0, 8]) { const x = P[i].x + NOR[i].x * o, z = P[i].y + NOR[i].y * o; pr.push(x, -z, TH[i] - 30, TH[i] - 1.5); }
  // ground height under piers is unknown here; long piers sink into terrain (hidden)
  scene.add(piersMesh(pr)); }
// overhead sign gantries (generic WSDOT-style green signs; text approximated)
{
  const signs = [[700, 'I-5 SOUTH', 'Portland'], [1250, 'SR-14 EAST', 'Camas'], [2200, 'SR-14 EAST', 'Columbia River Gorge'], [3150, 'I-205 NORTH', 'Seattle'], [4250, 'SR-500 WEST', 'Fourth Plain Blvd'], [200, 'SR-500 WEST', 'I-5'], [3700, 'I-205 NORTH', 'Orchards']];
  const post = new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: .7, roughness: .4 });
  for (const [i, a, b] of signs) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 192; const x = c.getContext('2d');
    x.fillStyle = '#0b6b3a'; x.fillRect(0, 0, 512, 192); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(8, 8, 496, 176);
    x.fillStyle = '#fff'; x.font = 'bold 64px Arial'; x.textAlign = 'center'; x.fillText(a, 256, 90); x.font = '48px Arial'; x.fillText(b, 256, 156);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group(), y = TH[i];
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.75), new THREE.MeshStandardMaterial({ map: t, roughness: .6, side: 2, emissiveMap: t, emissive: NIGHT ? 0x444444 : 0 })); panel.position.set(0, 7.5, 0); panel.rotation.y = Math.PI; g.add(panel);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * HW + 7, .5, .5), post); beam.position.y = 9.3; g.add(beam);
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, 10, 8), post); p.position.set(sx * (HW + 3.5), 4.7, 0); g.add(p); }
    g.position.set(P[i].x, y, P[i].y); g.rotation.y = Math.atan2(TAN[i].x, TAN[i].y); scene.add(g);
  }
}

// ---------- street lights (instanced) + pooled real lights ----------
const LAMP_EVERY = 12; // points (5 m) => 60 m
const lampPos = [];
{
  const pole = new THREE.CylinderGeometry(0.15, 0.22, 11, 6); pole.translate(0, 5.5, 0);
  const arm = new THREE.BoxGeometry(0.15, 0.15, 3); arm.translate(0, 11, -1.4);
  const head = new THREE.BoxGeometry(0.6, 0.18, 1.2); head.translate(0, 10.9, -2.8);
  const cnt = Math.ceil(N / LAMP_EVERY) * 2;
  const mp = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: .6, metalness: .6 }), cnt);
  const ma = new THREE.InstancedMesh(arm, mp.material, cnt);
  const mh = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: NIGHT ? new THREE.Color(1.0, 0.75, 0.45).multiplyScalar(6) : new THREE.Color(0x777770), toneMapped: !NIGHT }), cnt);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  let k = 0;
  for (let i = 0; i < N; i += LAMP_EVERY) for (const sd of [-1, 1]) {
    if (sd === 1 && (i / LAMP_EVERY) % 2) continue;
    const p = P[i], m = NOR[i], o = sd * (HW + 4.2);
    const ang = Math.atan2(m.x * sd, m.y * sd); q.setFromAxisAngle(up, ang);
    M.compose(new THREE.Vector3(p.x + m.x * o, TH[i], p.y + m.y * o), q, one);
    mp.setMatrixAt(k, M); ma.setMatrixAt(k, M); mh.setMatrixAt(k, M); k++;
    lampPos.push(new THREE.Vector3(p.x + m.x * (o - sd * 2.8), TH[i] + 10.5, p.y + m.y * (o - sd * 2.8)));
  }
  mp.count = ma.count = mh.count = k; scene.add(mp, ma, mh);
  // glow sprites on heads
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(lampPos.flatMap(v => [v.x, v.y, v.z]), 3));
  if (NIGHT) scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 9, map: glowTex(255, 190, 120), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff })));
}
const POOL = NIGHT ? (LOW ? 4 : 6) : 0, pool = [];
for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffb070, 260, 34, 1.6); scene.add(l); pool.push(l); }

// ---------- fallback night city (no boxes): city light field + river + skyline glow ----------
const fallback = new THREE.Group(); scene.add(fallback); fallback.visible = false;
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 1 }));
  g.rotation.x = -Math.PI / 2; g.position.y = -0.4; fallback.add(g);
  const riverZ = mxz + 90;
  const river = new THREE.Mesh(new THREE.PlaneGeometry(30000, 1600), new THREE.MeshStandardMaterial({ color: 0x050a14, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4 }));
  river.rotation.x = -Math.PI / 2; river.position.set(0, -0.2, riverZ + 800); fallback.add(river);
  // city lights: dense near "streets" grid, sodium/LED/neon mixes
  const pts = [], cols = [], C = new THREE.Color();
  const palette = [[1, .7, .35], [1, .78, .5], [.85, .9, 1], [1, .55, .25], [.4, .9, 1], [1, .3, .8]];
  const M = LOW ? 14000 : 26000;
  for (let i = 0; i < M; i++) {
    let x, z, ok = false, tries = 0;
    while (!ok && tries++ < 8) {
      x = rnd(mnx - 4000, mxx + 4000); z = rnd(mnz - 4000, mxz + 4000);
      if (z > riverZ && z < riverZ + 1600) continue; // river
      if (Math.random() < 0.7) { x = Math.round(x / 120) * 120 + rnd(-6, 6); } else { z = Math.round(z / 120) * 120 + rnd(-6, 6); } // street grid
      ok = true;
    }
    if (!ok) continue;
    let y = 0.5 + Math.random() * 6; if (z > riverZ + 1600 && Math.abs(x + 900) < 900 && Math.random() < .5) y = rnd(5, 140); // Portland downtown towers across the river
    pts.push(x, y, z); const p = palette[(Math.random() * (Math.random() < .9 ? 4 : 6)) | 0]; C.setRGB(p[0], p[1], p[2]).multiplyScalar(rnd(.6, 1.6)); cols.push(C.r, C.g, C.b);
  }
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  fallback.add(new THREE.Points(g2, new THREE.PointsMaterial({ size: 7, vertexColors: true, map: glowTex(255, 255, 255), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
  // river reflections of the lights: vertical streaks
  const rp = [], rc = [];
  for (let i = 0; i < pts.length / 3; i += 9) { const z = pts[i * 3 + 2]; if (z > riverZ + 1600 && z < riverZ + 2000) { rp.push(pts[i * 3], -0.1, riverZ + 1600 - (z - riverZ - 1600) * 0.6); rc.push(cols[i * 3] * .5, cols[i * 3 + 1] * .5, cols[i * 3 + 2] * .5); } }
  const g3 = new THREE.BufferGeometry(); g3.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); g3.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  fallback.add(new THREE.Points(g3, new THREE.PointsMaterial({ size: 12, vertexColors: true, map: glowTex(255, 255, 255), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  // conifer silhouettes along the freeway (PNW), instanced low-poly but dark
  const tg = new THREE.ConeGeometry(3.2, 16, 7); tg.translate(0, 8, 0);
  const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0x0a140e, roughness: 1 }), 2500); let k = 0; const Mx = new THREE.Matrix4();
  for (let i = 0; i < N && k < 2500; i += 3) for (const sd of [-1, 1]) { if (Math.random() < .55 || k >= 2500) continue; const o = sd * rnd(HW + 10, HW + 60); const s = rnd(.7, 1.6); Mx.makeScale(s, s * rnd(.8, 1.3), s).setPosition(P[i].x + NOR[i].x * o, 0, P[i].y + NOR[i].y * o); tm.setMatrixAt(k++, Mx); }
  tm.count = k; fallback.add(tm);
}

// ---------- Google Photorealistic 3D Tiles (only when a key exists) ----------
let tiles = null, scen = null; const tilesWrap = new THREE.Group(); tilesWrap.rotation.y = Math.PI; /* plugin frame is X=west,Z=north; ours X=east,Z=south */
buildScenery(scene, R, { low: LOW }).then(s => { scen = s; s.root.userData.setNight(NIGHT); console.log('[RaceX] scenery', s.root.userData.buildings, 'buildings', s.root.userData.trees, 'trees'); window.__scen = s.root.userData; document.getElementById('load').textContent = carReady ? 'ready' : 'loading car…'; })
  .catch(e => { console.error('scenery failed', e); fallback.visible = true; });
async function initTiles() {
  if (!TILES_KEY || Q.has('notiles')) return;
  try {
    const pre = await fetch('https://tile.googleapis.com/v1/3dtiles/root.json?key=' + encodeURIComponent(TILES_KEY));
    if (!pre.ok) { let m = ''; try { m = (await pre.json()).error.message; } catch (_) {} console.warn('[RaceX] 3D Tiles unavailable (' + pre.status + '), using built-in scenery:', m); return; }
    const { TilesRenderer } = await import('3d-tiles-renderer');
    const { GoogleCloudAuthPlugin, ReorientationPlugin, TileCompressionPlugin, UpdateOnChangePlugin } = await import('3d-tiles-renderer/plugins');
    tiles = new TilesRenderer();
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: TILES_KEY, autoRefreshToken: true }));
    if (TileCompressionPlugin) tiles.registerPlugin(new TileCompressionPlugin());
    const [lat0, lon0] = TRACK.origin;
    const h = +(Q.get('h') ?? CFG.tilesHeight ?? -22), rot = +(Q.get('rot') ?? CFG.tilesRotation ?? 0);
    tiles.registerPlugin(new ReorientationPlugin({ lat: lat0 * Math.PI / 180, lon: lon0 * Math.PI / 180, height: h, up: '+y', recenter: true, azimuth: rot * Math.PI / 180 }));
    tiles.errorTarget = LOW ? 32 : (innerWidth < 1000 ? 20 : 12); tiles.maxDepth = 30; if (tiles.lruCache) { tiles.lruCache.minSize = 300; tiles.lruCache.maxSize = LOW ? 500 : 900; }
    tiles.setCamera(cam); tiles.setResolutionFromRenderer(cam, R);
    tilesWrap.add(tiles.group); scene.add(tilesWrap);
    // keep road on top; hide fallback ground/lights but keep street lamps & walls
    tiles.addEventListener('load-model', () => { tilesLoaded++; if (tilesLoaded > 25 && !tilesShown) { tilesShown = true; const hide = () => { if (scen) { scen.root.userData.hideForTiles ? scen.root.userData.hideForTiles() : (scen.root.visible = false); } else setTimeout(hide, 500); }; hide(); fallback.visible = false; } });
    window.__tiles = () => ({ loaded: tilesLoaded, shown: tilesShown, off: +tilesWrap.position.y.toFixed(2), calib: calibN, downloading: tiles.stats ? tiles.stats.downloading : -1, parsing: tiles.stats ? tiles.stats.parsing : -1 });
    if (Q.has('photoroad')) { road.material.transparent = true; road.material.opacity = 0.35; road.material.depthWrite = false; }
    scene.fog.density = 0.00012;
    console.log('[RaceX] Google Photorealistic 3D Tiles enabled');
  } catch (e) { console.warn('3D Tiles failed, using night-city fallback', e); }
}

let tilesLoaded = 0, tilesShown = false, calibN = 0, calibF = 0; const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
function calibTiles() {
  if (!tilesShown || Q.has('nocalib') || (++calibF % 12)) return;
  rc.set(new THREE.Vector3(S.x, S.y + 250, S.z), new THREE.Vector3(0, -1, 0)); rc.far = 600;
  const hits = rc.intersectObject(tiles.group, true); if (!hits.length) return;
  let best = null; for (const h of hits) { const d = Math.abs(h.point.y - S.y); if (d < 80 && (!best || d < Math.abs(best.point.y - S.y))) best = h; }
  if (!best) best = hits[0];
  const err = (S.y - 0.25) - best.point.y; // photo road 25 cm under ribbon
  if (Math.abs(err) > 120) return;
  tilesWrap.position.y += err * (calibN < 5 ? 1 : 0.15); calibN++;
}
// ---------- car ----------
const car = new THREE.Group(); car.rotation.order = "YXZ"; scene.add(car);
const carBody = new THREE.Group(); car.add(carBody);
const wheels = [];
let carReady = false;
{
  const draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  const gl = new GLTFLoader(); gl.setDRACOLoader(draco);
  gl.load('assets/ferrari.glb', g => {
    const m = g.scene.children[0];
    const body = new THREE.MeshPhysicalMaterial({ color: 0xd0101a, metalness: 1, roughness: .45, clearcoat: 1, clearcoatRoughness: .03 });
    const detail = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: .35 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: .25, roughness: 0, transmission: LOW ? 0 : .6, transparent: true, opacity: .7 });
    const set = (n, mat) => { const o = m.getObjectByName(n); if (o) o.material = mat; };
    set('body', body); set('rim_fl', detail); set('rim_fr', detail); set('rim_rr', detail); set('rim_rl', detail); set('trim', detail); set('glass', glass);
    ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].forEach(n => { const w = m.getObjectByName(n); if (w) wheels.push(w); });
    m.scale.setScalar(1.05);
    m.rotation.y += Math.PI; carBody.add(m);
    // fake contact shadow
    const sc = document.createElement('canvas'); sc.width = sc.height = 128; const x = sc.getContext('2d'); const gr = x.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.08; car.add(sh);
    carReady = true; document.getElementById('load').textContent = 'ready';
  }, undefined, e => { document.getElementById('load').textContent = 'car failed to load'; console.error(e); });
  // head/tail light glows (bloom picks these up)
  const hl = new THREE.SpriteMaterial({ map: glowTex(220, 235, 255), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false });
  const tl = new THREE.SpriteMaterial({ map: glowTex(255, 30, 30), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false });
  [[-.65, .72, 2.15, hl, 1.2], [.65, .72, 2.15, hl, 1.2], [-.6, .82, -2.2, tl, .9], [.6, .82, -2.2, tl, .9]].forEach(a => { const s = new THREE.Sprite(a[3]); s.position.set(a[0], a[1], a[2]); s.scale.setScalar(a[4]); car.add(s); });
  car.userData.tail = tl;
  const head = new THREE.SpotLight(0xdde8ff, NIGHT ? 900 : 120, 120, 0.5, 0.5, 1.4); head.position.set(0, 0.9, 1.8); head.target.position.set(0, 0, 25); car.add(head, head.target);
  // nitro flames
  const fl = new THREE.SpriteMaterial({ map: glowTex(80, 180, 255), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  car.userData.flames = [-.45, .45].map(x => { const s = new THREE.Sprite(fl); s.position.set(x, .45, -2.5); s.scale.set(.8, .8, 1); car.add(s); return s; });
  car.userData.flameMat = fl;
}

// ---------- post ----------
const composer = new EffectComposer(R);
composer.addPass(new RenderPass(scene, cam));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), NIGHT ? 0.85 : 0.35, 0.55, NIGHT ? 0.82 : 0.95);
composer.addPass(bloom); composer.addPass(new OutputPass());
function resize() {
  const w = innerWidth, h = innerHeight; R.setSize(w, h, false); composer.setSize(w, h);
  bloom.setSize(w * DPR / 2, h * DPR / 2); cam.aspect = w / h; cam.updateProjectionMatrix();
  fx.width = w; fx.height = h; if (tiles) tiles.setResolutionFromRenderer(cam, R);
}
const fx = document.getElementById('fx'), fxc = fx.getContext('2d');
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 350)); window.visualViewport?.addEventListener('resize', resize); resize();

// ---------- input ----------
const K = {}; addEventListener('keydown', e => { K[e.code] = 1; }); addEventListener('keyup', e => { K[e.code] = 0; });
const B = {};
function bindBtn(id) {
  const el = document.getElementById(id);
  const on = e => { e.preventDefault(); B[id] = 1; el.classList.add('on'); }, off = e => { e.preventDefault(); B[id] = 0; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}
['gas', 'brk', 'nos'].forEach(bindBtn);
let steerTouch = null, steerX0 = 0, steerVal = 0;
const steerEl = document.getElementById('steer'), nub = document.getElementById('nub');
steerEl.addEventListener('pointerdown', e => { e.preventDefault(); steerTouch = e.pointerId; steerX0 = e.clientX; steerEl.setPointerCapture(e.pointerId); });
steerEl.addEventListener('pointermove', e => { if (e.pointerId !== steerTouch) return; steerVal = Math.max(-1, Math.min(1, (e.clientX - steerX0) / 60)); });
const endSteer = e => { if (e.pointerId === steerTouch) { steerTouch = null; steerVal = 0; } };
steerEl.addEventListener('pointerup', endSteer); steerEl.addEventListener('pointercancel', endSteer);

// ---------- audio ----------
let AC = null, eng = null;
function initAudio() {
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 4;
    const eg = AC.createGain(); eg.gain.value = .0; lp.connect(eg); eg.connect(master);
    const o1 = AC.createOscillator(); o1.type = 'sawtooth'; const o2 = AC.createOscillator(); o2.type = 'square'; const o3 = AC.createOscillator(); o3.type = 'sawtooth';
    const g1 = AC.createGain(), g2 = AC.createGain(), g3 = AC.createGain(); g1.gain.value = .5; g2.gain.value = .25; g3.gain.value = .3;
    o1.connect(g1).connect(lp); o2.connect(g2).connect(lp); o3.connect(g3).connect(lp); o1.start(); o2.start(); o3.start();
    // noise for tires/wind
    const nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const mk = (f, q) => { const s = AC.createBufferSource(); s.buffer = nb; s.loop = true; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const g = AC.createGain(); g.gain.value = 0; s.connect(bp).connect(g).connect(master); s.start(); return { g, bp }; };
    eng = { o1, o2, o3, lp, eg, tire: mk(1800, 6), wind: mk(500, .6), nos: mk(3000, .8) };
  } catch (e) { console.warn('audio off', e); }
}
function updAudio(rpm, thr, slip, spd, nos) {
  if (!eng) return; const t = AC.currentTime, f = 28 + rpm / 9000 * 190;
  eng.o1.frequency.setTargetAtTime(f, t, .03); eng.o2.frequency.setTargetAtTime(f * .5, t, .03); eng.o3.frequency.setTargetAtTime(f * 1.01 * 2, t, .03);
  eng.lp.frequency.setTargetAtTime(500 + rpm / 9000 * 2600 * (.5 + thr * .5), t, .05);
  eng.eg.gain.setTargetAtTime(.18 + thr * .2, t, .05);
  eng.tire.g.gain.setTargetAtTime(Math.min(.35, Math.max(0, slip - 2) * .04), t, .05);
  eng.wind.g.gain.setTargetAtTime(Math.min(.25, spd / 90 * .25), t, .1);
  eng.nos.g.gain.setTargetAtTime(nos ? .22 : 0, t, .05);
}

// ---------- game state ----------
const S = {
  x: 0, z: 0, h: 0, vx: 0, vz: 0, yawRate: 0, ci: 2, run: false, lapT: 0, lap: 1, best: +localStorage.racexBest2 || 0, last: 0,
  nos: 1, rpm: 900, gear: 1, shake: 0, segName: '', segT: 0, prog: 0, started: false
};
function placeStart() { const i = Math.max(0, Math.min(N - 1, +Q.get('at') || 2)), p = P[i], t = TAN[i]; S.x = p.x + NOR[i].x * 4; S.z = p.y + NOR[i].y * 4; /* +NOR = right of travel */ S.h = Math.atan2(t.x, t.y); S.ci = i; }
placeStart();
let ghostRec = [], ghost = JSON.parse(localStorage.racexGhost2 || 'null');
function nearest(x, z) {
  let best = 1e18, bi = S.ci;
  for (let k = -30; k <= 60; k++) { const i = (S.ci + k + N) % N, dx = P[i].x - x, dz = P[i].y - z, d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
  return bi;
}
const GEARS = [0, 17, 30, 43, 56, 70, 999]; // m/s upshift points
const fmt = t => t ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}` : '--';

document.getElementById('go').onclick = () => {
  document.getElementById('start').style.display = 'none'; S.run = true; initAudio();
  try { document.documentElement.requestFullscreen?.().catch(() => { }); screen.orientation?.lock?.('landscape').catch(() => { }); } catch (e) { }
};

// minimap
const mm = document.getElementById('mm').getContext('2d');
const mmS = 200 / Math.max(mxx - mnx, mxz - mnz), mmOx = 130 - (mnx + mxx) / 2 * mmS, mmOz = 130 - (mnz + mxz) / 2 * mmS;
const mmBg = document.createElement('canvas'); mmBg.width = mmBg.height = 260;
{ const c = mmBg.getContext('2d'); c.lineJoin = 'round'; c.shadowColor = '#00e5ff'; c.shadowBlur = 8; c.strokeStyle = '#7ff3ff'; c.lineWidth = 5; c.beginPath(); P.forEach((p, i) => { const x = mmOx + p.x * mmS, y = mmOz + p.y * mmS; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke(); }

// gauge
const gc = document.getElementById('gauge').getContext('2d');
function drawGauge(mph, rpm, gear, nos, nosOn) {
  const c = gc; c.clearRect(0, 0, 460, 300); const cx = 230, cy = 210, r = 160, a0 = Math.PI * .8, a1 = Math.PI * 2.2;
  c.lineCap = 'round'; c.lineWidth = 16; c.strokeStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
  const f = rpm / 9000, ar = a0 + (a1 - a0) * f;
  const gr = c.createLinearGradient(cx - r, 0, cx + r, 0); gr.addColorStop(0, '#00e5ff'); gr.addColorStop(.7, '#ff2bd6'); gr.addColorStop(1, '#ff3030');
  c.strokeStyle = gr; c.shadowColor = f > .85 ? '#ff3030' : '#00e5ff'; c.shadowBlur = 14; c.beginPath(); c.arc(cx, cy, r, a0, ar); c.stroke(); c.shadowBlur = 0;
  c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.7)'; c.fillStyle = 'rgba(255,255,255,.7)'; c.font = 'bold 16px Arial'; c.textAlign = 'center';
  for (let k = 0; k <= 9; k++) { const a = a0 + (a1 - a0) * k / 9; c.strokeStyle = k >= 8 ? '#ff3030' : 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22)); c.lineTo(cx + Math.cos(a) * (r - 34), cy + Math.sin(a) * (r - 34)); c.stroke(); c.fillText(k, cx + Math.cos(a) * (r - 50), cy + Math.sin(a) * (r - 50) + 6); }
  c.fillStyle = '#fff'; c.font = 'italic 900 78px Arial Black, Arial'; c.fillText(Math.round(mph), cx, cy - 10);
  c.font = 'bold 15px Arial'; c.fillStyle = '#00e5ff'; c.fillText('MPH', cx, cy + 12);
  c.font = 'italic 900 34px Arial Black, Arial'; c.fillStyle = f > .9 ? '#ff3030' : '#ff2bd6'; c.fillText(gear, cx, cy + 56);
  c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(cx - 90, cy + 70, 180, 10); c.fillStyle = nosOn ? '#fff' : '#00e5ff'; c.shadowColor = '#00e5ff'; c.shadowBlur = nosOn ? 16 : 6; c.fillRect(cx - 90, cy + 70, 180 * nos, 10); c.shadowBlur = 0;
}

// speed lines overlay
const lines = Array.from({ length: 70 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), s: rnd(.6, 1.4) }));
function drawFx(k) {
  const w = fx.width, h = fx.height; fxc.clearRect(0, 0, w, h); if (k <= 0.01) return;
  const cx = w / 2, cy = h * .45, R0 = Math.hypot(w, h) * .5;
  fxc.lineCap = 'round';
  for (const l of lines) {
    l.r += 0.04 * l.s * (1 + k * 2); if (l.r > 1) { l.r = .25 + Math.random() * .1; l.a = Math.random() * Math.PI * 2; }
    const r1 = R0 * l.r, r2 = r1 + R0 * .18 * k * l.s; const ca = Math.cos(l.a), sa = Math.sin(l.a);
    fxc.strokeStyle = `rgba(200,240,255,${.35 * k * l.r})`; fxc.lineWidth = 1.5 + 2 * l.r;
    fxc.beginPath(); fxc.moveTo(cx + ca * r1, cy + sa * r1 * .7); fxc.lineTo(cx + ca * r2, cy + sa * r2 * .7); fxc.stroke();
  }
  const vg = fxc.createRadialGradient(cx, cy, R0 * .45, cx, cy, R0); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,10,${.55 * k})`); fxc.fillStyle = vg; fxc.fillRect(0, 0, w, h);
}

function flash(name) { const el = document.getElementById('seg'); el.innerHTML = name + '<small>' + ({ 'SR-500': 'WESTBOUND', 'I-5': 'SOUTHBOUND', 'SR-14': 'EASTBOUND · COLUMBIA RIVER', 'I-205': 'NORTHBOUND' }[name] || '') + '</small>'; el.classList.add('on'); S.segT = 2.2; }

// ---------- loop ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3();
let prev = performance.now(), fpsAcc = 0, fpsN = 0;
function step(dt) {
  const gas = B.gas || K.ArrowUp || K.KeyW ? 1 : 0, brk = B.brk || K.ArrowDown || K.KeyS || K.Space ? 1 : 0, nosBtn = B.nos || K.ShiftLeft || K.ShiftRight;
  let steer = steerVal + ((K.ArrowRight || K.KeyD) ? 1 : 0) - ((K.ArrowLeft || K.KeyA) ? 1 : 0); steer = Math.max(-1, Math.min(1, steer));
  const fx_ = Math.sin(S.h), fz = Math.cos(S.h), rx = Math.cos(S.h), rz = -Math.sin(S.h);
  let vf = S.vx * fx_ + S.vz * fz, vl = S.vx * rx + S.vz * rz;
  const nosOn = nosBtn && S.nos > 0.01 && gas && S.run;
  if (nosOn) S.nos = Math.max(0, S.nos - dt * 0.22); else S.nos = Math.min(1, S.nos + dt * 0.035);
  const vmax = nosOn ? 92 : 78, acc = (nosOn ? 22 : 12) * (1 - Math.max(0, vf) / vmax);
  if (S.run) { if (gas) vf += acc * dt; if (brk) vf -= (vf > 0 ? 26 : 6) * dt; }
  vf -= (0.6 + vf * 0.004) * Math.sign(vf) * dt; if (!S.run) vf *= .9;
  vf = Math.max(-8, vf);
  const spd = Math.abs(vf);
  const drifting = brk && Math.abs(steer) > .3 && spd > 18;
  // yaw: steering authority falls off with speed; drift increases rotation
  const steerAuth = Math.min(1, spd / 8) * (1.9 / (1 + spd * 0.028)) * (drifting ? 1.7 : 1);
  const targetYaw = -steer * steerAuth * Math.sign(vf || 1); // + = left? heading increases toward +x(east)... sign handled below
  S.yawRate += (targetYaw - S.yawRate) * Math.min(1, dt * (drifting ? 4 : 7));
  S.h += S.yawRate * dt;
  // lateral grip: low when drifting -> slide; slip angle stored for FX/sound
  const grip = drifting ? 1.6 : 9;
  vl *= Math.exp(-grip * dt);
  if (drifting) vf -= spd * 0.08 * dt; // drift scrubs a little speed
  const nfx = Math.sin(S.h), nfz = Math.cos(S.h), nrx = Math.cos(S.h), nrz = -Math.sin(S.h);
  S.vx = nfx * vf + nrx * vl; S.vz = nfz * vf + nrz * vl;
  S.x += S.vx * dt; S.z += S.vz * dt;
  // track containment
  const pi = S.ci; S.ci = nearest(S.x, S.z);
  const p = P[S.ci], n = NOR[S.ci]; const d = (S.x - p.x) * n.x + (S.z - p.y) * n.y; const lim = HW + 3 - 1.1;
  if (Math.abs(d) > lim) {
    const push = Math.abs(d) - lim, s = Math.sign(d); S.x -= n.x * push * s; S.z -= n.y * push * s;
    const vn = S.vx * n.x + S.vz * n.y; if (vn * s > 0) { S.vx -= n.x * vn * 1.4; S.vz -= n.y * vn * 1.4; S.shake = Math.min(1, S.shake + Math.abs(vn) * .05); navigator.vibrate?.(20); }
    S.vx *= Math.pow(.6, dt); S.vz *= Math.pow(.6, dt);
    // align heading toward track a bit
    const th = Math.atan2(TAN[S.ci].x, TAN[S.ci].y); let dh = th - S.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; S.h += dh * Math.min(1, dt * 3);
  }
  // laps
  if (S.run) {
    S.lapT += dt;
    if (pi > N - 200 && S.ci < 200) { S.last = S.lapT; if (!S.best || S.lapT < S.best) { S.best = S.lapT; localStorage.racexBest2 = S.best; ghost = ghostRec; try { localStorage.racexGhost2 = JSON.stringify(ghostRec); } catch (e) { } } S.lap++; S.lapT = 0; ghostRec = []; flash('LAP ' + S.lap); }
    if (pi < 200 && S.ci > N - 200) { /* went backwards over line */ }
    if (((S.lapT * 10) | 0) > ghostRec.length) ghostRec.push([Math.round(S.x), Math.round(S.z)]);
  }
  // gearbox & rpm
  let g = 1; while (g < 6 && spd > GEARS[g]) g++;
  const lo = GEARS[g - 1], hi = GEARS[g] === 999 ? 95 : GEARS[g];
  const rpmT = 1200 + (spd - lo) / (hi - lo) * 6600 + (gas && spd < 3 ? 2500 : 0) + (drifting ? 800 : 0);
  if (g !== S.gear) { S.gear = g; S.shake = Math.min(1, S.shake + .15); }
  S.rpm += (Math.min(8800, rpmT) - S.rpm) * Math.min(1, dt * 10);
  const slip = Math.abs(vl);
  const nm = segAt(S.ci); if (nm !== S.segName) { S.segName = nm; flash(nm); }
  return { gas, steer, spd, vf, nosOn, slip, drifting };
}

function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  const st = step(dt);
  // car transform
  const cy = roadY(S.x, S.z, S.ci); S.y = cy; car.position.set(S.x, cy, S.z); car.rotation.y = S.h;
  { const sl = (TH[(S.ci + 2) % N] - TH[(S.ci - 2 + N) % N]) / 20; const fwd = Math.cos(S.h) * TAN[S.ci].y + Math.sin(S.h) * TAN[S.ci].x; car.rotation.x = -Math.atan(sl) * Math.sign(fwd || 1); }
  carBody.rotation.z = THREE.MathUtils.lerp(carBody.rotation.z, -S.yawRate * st.spd * .004, .15); // body roll
  carBody.rotation.x = THREE.MathUtils.lerp(carBody.rotation.x, (st.gas ? -.012 : .01) * Math.min(1, st.spd / 10), .1);
  wheels.forEach(w => w.rotation.x -= st.vf * dt / 0.34);
  car.userData.flameMat.opacity = st.nosOn ? .8 + Math.random() * .2 : 0; car.userData.flames.forEach(f => f.scale.set(.6 + Math.random() * .5, .6 + Math.random() * .5, 1));
  car.userData.tail.color.setScalar(B.brk || K.ArrowDown || K.Space ? 2.2 : 1);
  // pooled lamp lights: nearest lamps ahead of the car
  const lampI = Math.floor(S.ci / LAMP_EVERY);
  const near = lampPos.map((v, i) => [v, (v.x - S.x) ** 2 + (v.z - S.z) ** 2]).filter(a => a[1] < 160 * 160).sort((a, b) => a[1] - b[1]).slice(0, POOL);
  pool.forEach((l, i) => { if (near[i]) { l.position.copy(near[i][0]); l.visible = true; } else l.visible = false; });
  // camera: chase, FOV kick, shake
  const sp = st.spd, nosK = st.nosOn ? 1 : 0;
  const CH = +(Q.get('camh') || 0); const back = (Q.has('front') ? -1 : 1) * 6.6 + sp * 0.025 + nosK * 1.2 + CH * 1.2, hgt = 2.1 + sp * .006 + CH;
  const ch = S.h - S.yawRate * 0.12;
  tmpV.set(S.x - Math.sin(ch) * back, cy + hgt, S.z - Math.cos(ch) * back);
  camPos.lerp(tmpV, 1 - Math.exp(-dt * 9));
  if (camPos.lengthSq() === 0 || camPos.distanceTo(tmpV) > 60) camPos.copy(tmpV);
  S.shake = Math.max(0, S.shake - dt * 2.5);
  const sh = S.shake * .25 + (sp > 50 ? (sp - 50) / 40 * .04 : 0) + nosK * .05;
  cam.position.copy(camPos).add(tmpV.set(rnd(-sh, sh), rnd(-sh, sh), rnd(-sh, sh)));
  camLook.set(S.x + Math.sin(S.h) * (6 + CH), cy + 1.1, S.z + Math.cos(S.h) * (6 + CH)); cam.lookAt(camLook);
  const fovT = 62 + Math.min(1, sp / 80) * 18 + nosK * 10; cam.fov += (fovT - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
  scene.userData.sky.position.copy(cam.position);
  if (tiles) { cam.updateMatrixWorld(); tiles.update(); calibTiles(); }
  composer.render();
  drawFx(Math.max(0, (sp - 40) / 45) * .8 + nosK * .6);
  // HUD
  const mph = sp * 2.237;
  drawGauge(mph, S.rpm, S.gear, S.nos, st.nosOn);
  document.getElementById('lapn').textContent = S.lap; document.getElementById('segn').textContent = S.segName;
  document.getElementById('ltime').textContent = fmt(S.lapT) || '0:00.00'; document.getElementById('best').textContent = fmt(S.best); document.getElementById('last').textContent = fmt(S.last);
  if (S.segT > 0) { S.segT -= dt; if (S.segT <= 0) document.getElementById('seg').classList.remove('on'); }
  nub.style.transform = `translateX(${steerVal * 44}px)`;
  mm.clearRect(0, 0, 260, 260); mm.save(); mm.beginPath(); mm.arc(130, 130, 128, 0, 7); mm.clip(); mm.drawImage(mmBg, 0, 0);
  if (ghost && ghost.length && S.run) { const gi = Math.min(ghost.length - 1, (S.lapT * 10) | 0); mm.fillStyle = 'rgba(255,255,255,.7)'; mm.beginPath(); mm.arc(mmOx + ghost[gi][0] * mmS, mmOz + ghost[gi][1] * mmS, 6, 0, 7); mm.fill(); }
  mm.fillStyle = '#ff2bd6'; mm.shadowColor = '#ff2bd6'; mm.shadowBlur = 12; mm.beginPath(); mm.arc(mmOx + S.x * mmS, mmOz + S.z * mmS, 8, 0, 7); mm.fill(); mm.restore();
  updAudio(S.rpm, st.gas, st.slip, sp, st.nosOn);
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { window.__fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(frame);
}
initTiles();
requestAnimationFrame(frame);
window.__S = S;
