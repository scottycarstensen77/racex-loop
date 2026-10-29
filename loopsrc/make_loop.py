import re
src=open('slice/slice.js').read()
def rep(a,b,cnt=1):
    global src
    n=src.count(a)
    assert n==cnt,(n,a[:80])
    src=src.replace(a,b)
def cut(start,end,new):
    global src
    i=src.index(start); j=src.index(end,i)
    src=src[:i]+new+src[j:]

rep("// RaceX · SR-14 East Night Run — vertical slice. Real OSM centerline + USGS elevation, stylized wet-night scenery.",
"// RaceX · Vancouver Loop — SR-500 W, I-5 S, SR-14 E, I-205 N. Real OSM centerline + USGS elevation, stylized NFSU look.")
# ---- track: closed loop ----
cut("const TR = await","const LANE = 3.7",r"""const [TR, TG, TBIN] = await Promise.all([fetch('loop.json').then(r => r.json()), fetch('terrain.json').then(r => r.json()), fetch('terrain.bin').then(r => r.arrayBuffer())]);
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
""")
rep("""  const f = clamp(s / STEP, 0, N - 1.001), i = Math.floor(f), t = f - i;
  out.p.lerpVectors(P[i], P[i + 1], t); out.t.lerpVectors(T[i], T[i + 1], t).normalize();""",
"""  const f = (((s / STEP) % N) + N) % N, i = Math.floor(f), t = f - i, j = W(i + 1);
  out.p.lerpVectors(P[i], P[j], t); out.t.lerpVectors(T[i], T[j], t).normalize();""")
rep("new THREE.PerspectiveCamera(62, 2, 0.5, 12000)","new THREE.PerspectiveCamera(62, 2, 0.5, 16000)")
# ---- sweep: closed, with optional per-index filter ----
cut("function sweep(prof","// road surface",r"""function sweep(prof, mat, { k = 1, s0 = 0, s1 = L, vScale = 0.1, use = null, add = true } = {}) {
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
""")
rep("""sweep([[-9.4, 0.0], [-21, 0.0]], DAY""","""sweep([[-9.4, 0.0], [-21, 0.0]], DAY""")
rep("{ vScale: 1 / 24, k: 2 });\n// Jersey","{ vScale: 1 / 24, k: 2, use: HWY });\n// Jersey")
rep("conc, { k: 2, vScale: .2 });","conc, { k: 2, vScale: .2, use: HWY });")
rep("steel, { k: 1 });","steel, { k: 1 });\nsweep([[-8.36, .55], [-8.36, .86], [-8.32, .78], [-8.38, .7], [-8.32, .62], [-8.35, .55]], steel, { k: 1, use: i => RAMP[i] });")
# replace embankments .. river .. skyline with terrain + water + buildings
cut("// embankments: left rises","// ---------- light poles",r"""// road-fill embankments (skirts) so the deck meets the real terrain; skipped on bridges
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

""")
# poles: skip on ramps by putting below ground? keep, fine. neon: positions along loop
rep("[[700, -34, 0], [1600, -40, 1], [2450, -36, 2], [3300, -45, 3], [4300, -38, 1]].forEach(","Array.from({ length: 18 }, (_, i) => [600 + i * 1450, -34 - (i % 3) * 5, i % 4]).forEach(")
rep("P[Math.floor(s / STEP)].y < 30 ? 6 : 8","6")
# gantries generated per section
cut("const gantries = [","for (const g of gantries)",r"""const DEST = { 'SR-500 WEST': ['500  WEST', 'I-5', 'Seattle · Portland'], 'I-5 SOUTH': ['5  SOUTH', 'Portland', 'Salem'], 'SR-14 EAST': ['14  EAST', 'Camas', 'Washougal'], 'I-205 NORTH': ['205  NORTH', 'Seattle', 'Orchards'] };
const JCT = { 'I-5 SOUTH': ['EXIT 1A', 'SR-14 East', 'Camas'], 'SR-14 EAST': ['EXIT 8', 'I-205 North', 'Seattle'], 'I-205 NORTH': ['EXIT 30', 'SR-500 West', 'Vancouver'], 'SR-500 WEST': ['EXIT 1C', 'I-5 South', 'Portland'] };
const gantries = [];
TR.secs.forEach(([nm, i0], k) => { if (nm === 'Ramp') return; const i1 = k + 1 < TR.secs.length ? TR.secs[k + 1][1] : N; const s0 = i0 * STEP, s1 = i1 * STEP, D = DEST[SECN[nm]], J = JCT[SECN[nm]];
  for (let s = s0 + 300; s < s1 - 900; s += 1400) gantries.push({ s, d: -1.5, w: 9, lines: [[D[0], 110, 150], [D[1], 92, 260], [D[2], 80, 345]] });
  if (s1 - s0 > 1500 && (k + 1 < TR.secs.length || nm === 'SR-500')) { [[1000, '½ MILE'], [400, 'EXIT ONLY']].forEach(([b, t]) => { if (s1 - b > s0 + 200) gantries.push({ s: s1 - b, d: 3.7, w: 7.2, tab: J[0], lines: [[J[1], 92, 140], [J[2], 80, 250], [t, 72, 340]] }); }); } });
""")
rep("for (const g of gantries) { frame(g.s, F);","for (const g of gantries) { if (BRG[W(Math.floor(g.s / STEP))] && 0) continue; frame(g.s, F);")
# trees: on real terrain away from road/water/buildings
cut("  for (let i = 0; i < n; i++) { const s = rnd(0, L); let d;","  im.castShadow = DAY; scene.add(im); }",r"""  let k = 0, tries = 0; while (k < n && tries < n * 20) { tries++; const s = rnd(0, L), d = (Math.random() < .5 ? -1 : 1) * rnd(32, 420); const p = at(s, d, 0); const y = demAt(p.x, p.z); if (y < WATER_Y + 1.5) continue;
    let near = false; for (let j = -6; j <= 6 && !near; j++) { const qq = P[W(Math.floor(s / STEP) + j * 15)]; if (Math.hypot(qq.x - p.x, qq.z - p.z) < 28) near = true; } if (near) continue;
    const h = rnd(9, 26); q.setFromAxisAngle(up, rnd(0, 3.14)); m4.compose(p.setY(y - .5), q, new THREE.Vector3(h * .42, h, h * .42)); im.setMatrixAt(k++, m4); }
  im.count = k;
""")
rep("const n = LOW ? 900 : 1800, im = new THREE.InstancedMesh(gg, mat, n);","const n = LOW ? 2500 : MOBILE ? 4500 : 6500, im = new THREE.InstancedMesh(gg, mat, n);")
rep("for (let i = 0; i < nj; i++) { const s = i * 6; frame(s, F);","for (let i = 0; i < nj; i++) { const s = i * 6; if (RAMP[W(Math.floor(s / STEP))]) { m4.makeScale(0, 0, 0); jim.setMatrixAt(i, m4); continue; } frame(s, F);")
# Mt Hood & ridges & glints
rep("const e = P[N - 1]; hood.position.set(e.x + 8200, -60, e.z + 4300); hood.scale.set(2600, 1500, 2600);","hood.position.set(12500, -80, 4200); hood.scale.set(3600, 2100, 3600);")
rep("ridge.position.set(e.x + 2000, WATER_Y - 30, e.z + 7200); ridge.rotation.y = -.25;","ridge.position.set(4000, WATER_Y - 30, 9000); ridge.rotation.y = -.15;")
rep("const gp = []; for (let i = 0; i < 700; i++) { const mid = P[N >> 1], r = RN[N >> 1], t = T[N >> 1]; const along = rnd(-2500, 2500), across = rnd(RIVER + 30, 1400); gp.push(mid.x + t.x * along + r.x * across, WATER_Y + .2, mid.z + t.z * along + r.z * across); }",
"const gp = []; for (let i = 0, t = 0; i < 900 && t < 20000; t++) { const x = rnd(GX0, GX0 + GNX * GS), z = rnd(GZ0 - GNY * GS, GZ0); if (demAt(x, z) < WATER_Y - .3) { gp.push(x, WATER_Y + .2, z); i++; } }")
# traffic/oncoming: keep oncoming off ramps (hide)
rep("frame(o.s, F); o.g.position.copy(F.p).addScaledVector(F.r, o.d).setY(F.p.y); o.g.rotation.y = F.h + Math.PI; }",
"frame(o.s, F); o.g.position.copy(F.p).addScaledVector(F.r, o.d).setY(F.p.y); o.g.rotation.y = F.h + Math.PI; o.g.visible = !RAMP[W(Math.floor(o.s / STEP))]; }")
rep("oncoming.push({ g, s: rnd(0, L),","oncoming.push({ g, s: rnd(0, 2000),")
# cam lookahead wrap
rep("at(Math.min(L - 1, S.s + 70), S.d * .6, 0)","at(S.s + 70, S.d * .6, 0)")
# laps instead of finish at end
rep("  if (S.s > L - 40) finish(false);",r"""  { const lap = Math.floor((S.s - S.s0) / L); if (lap > S.lap) { const lt = S.t - S.lapT0; S.laps.push(lt); S.lapT0 = S.t; S.lap = lap; const b = +(localStorage.racexLoopBestLap || 0); if (!b || lt < b) { localStorage.racexLoopBestLap = lt; popup('NEW BEST LAP', fmtT(lt), '#30ff8a'); } else popup('LAP ' + lap, fmtT(lt), '#7ff3ff'); if (lap >= LAPS) finish(false); }
    const sn = secAt(S.s); const hw = sn === 'Ramp' ? nextHwy(W(Math.floor(S.s / STEP))) : sn; if (hw !== S.hw) { S.hw = hw; S.hwSeen.add(hw); msg(SECN[hw], 1800); } }""")
rep("const S = { s: 20,","const LAPS = Math.max(1, +(Q.get('laps') || 1)); const fmtT = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;\nconst S = { s0: 20, lap: 0, laps: [], lapT0: 0, hw: 'SR-500', hwSeen: new Set(), s: 20,")
rep("function reset() { Object.assign(S, { s: 20,","function reset() { Object.assign(S, { s0: 20, lap: 0, laps: [], lapT0: 0, hw: 'SR-500', hwSeen: new Set(['SR-500']), s: 20,")
rep("if (Q.has('at')) { S.s = +Q.get('at');","if (Q.has('at')) { S.s = S.s0 = +Q.get('at');")
rep("msg('SR-14 EAST', 1800); }","msg(SECN[secAt(S.s) === 'Ramp' ? nextHwy(W(Math.floor(S.s / STEP))) : secAt(S.s)], 1800); }")
rep("const best = +(localStorage.racexSliceBest || 0); if (!busted && S.score > best) localStorage.racexSliceBest = S.score;","const best = +(localStorage.racexLoopBest || 0); if (!busted && S.score > best) localStorage.racexLoopBest = S.score;")
rep("TIME <b>${S.t.toFixed(1)}s</b>","TIME <b>${fmtT(S.t)}</b>${S.laps.length ? ' · BEST LAP <b>' + fmtT(Math.min(...S.laps)) + '</b>' : ''}")
rep("localStorage.racexSliceCar2","localStorage.racexLoopCar",2)
# HUD: progress, highway, lap timer, minimap
rep("""$('prog').firstElementChild.style.width = clamp(S.s / L, 0, 1) * 100 + '%'; $('dist').textContent = 'SR-14 EAST · ' + Math.max(0, (L - S.s) / 1000).toFixed(1) + ' KM'; }""",
r"""const f = (((S.s - S.s0) / L) % 1 + 1) % 1; $('prog').firstElementChild.style.width = f * 100 + '%'; $('dist').textContent = SECN[S.hw] + ' · LAP ' + Math.min(LAPS, S.lap + 1) + '/' + LAPS + ' · ' + fmtT(S.t - S.lapT0); drawMap(); }
// minimap: the whole loop, you (cyan), cop (red)
const MM = $('mm'), mx = MM.getContext('2d'); let mmB = null;
{ let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; P.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }); const sc = Math.min((MM.width - 12) / (x1 - x0), (MM.height - 12) / (z1 - z0)); mmB = { x0, z0, sc, ox: (MM.width - (x1 - x0) * sc) / 2, oz: (MM.height - (z1 - z0) * sc) / 2 }; }
const mmP = p => [mmB.ox + (p.x - mmB.x0) * mmB.sc, mmB.oz + (p.z - mmB.z0) * mmB.sc];
const mmBg = document.createElement('canvas'); mmBg.width = MM.width; mmBg.height = MM.height;
{ const c = mmBg.getContext('2d'); const COL = { 'SR-500': '#ffd200', 'I-5': '#ff2a6d', 'SR-14': '#00e5ff', 'I-205': '#30ff8a', Ramp: '#bbb' }; c.lineWidth = 3; c.lineCap = 'round';
  for (let i = 0; i < N; i += 4) { c.strokeStyle = COL[SEC[i]]; c.beginPath(); c.moveTo(...mmP(P[i])); c.lineTo(...mmP(PI(i + 4))); c.stroke(); }
  c.fillStyle = '#fff'; c.font = 'bold 9px Arial'; [['500', 'SR-500'], ['5', 'I-5'], ['14', 'SR-14'], ['205', 'I-205']].forEach(([t, nm]) => { const r = secRange(nm)[0]; const p = mmP(P[(r[0] + r[1]) >> 1]); c.fillText(t, p[0] + 4, p[1] - 4); }); }
function drawMap() { mx.clearRect(0, 0, MM.width, MM.height); mx.drawImage(mmBg, 0, 0); const dot = (pos, col, r) => { const [x, y] = mmP(pos); mx.fillStyle = col; mx.beginPath(); mx.arc(x, y, r, 0, 7); mx.fill(); };
  dot(player.position, '#fff', 4.5); dot(player.position, '#00e5ff', 3); if (cop.on) dot(cop.m.position, (S.t * 6) % 2 < 1 ? '#ff2030' : '#3060ff', 3); }""")
# test hooks
rep("window.__scene = scene; window.__cam = cam;",r"""window.__scene = scene; window.__cam = cam;
window.__T = { L, N, STEP, secs: TR.secs, secAt, frame: s => { frame(s, F); return { x: F.p.x, y: F.p.y, z: F.p.z, h: F.h }; }, player };
window.__sim = (sec) => { let n = Math.round(sec / FIX); while (n-- > 0 && S.run) K = update(FIX); camUpdate(.5, K); return { s: S.s, v: S.v, hw: S.hw, lap: S.lap, run: S.run, done: S.done }; };""")
open('loop.js','w').write(src)
h=open('slice/index.html').read()
for a,b in [('<title>RaceX · SR-14 Night Run</title>','<title>RaceX · Vancouver Loop</title>'),('content="RaceX 14"','content="RaceX"'),('href="../assets/icon-180.png"','href="assets/icon-180.png"'),
 ('<div id="dist">SR-14 EAST · 5.0 KM</div></div>','<div id="dist">SR-500 WEST</div><canvas id="mm" width="150" height="110"></canvas></div>'),
 ('SR-14 EAST · VANCOUVER WA','SR-500 · I-5 · SR-14 · I-205 · 16.5 MI LOOP · VANCOUVER WA'),('src="slice.js"','src="loop.js"'),
 ('#dist{font-size:10px;color:#aaa;margin-top:3px}','#dist{font-size:10px;color:#ddd;margin-top:3px}#mm{display:block;margin:4px 0 0 auto;width:150px;height:110px;background:rgba(0,0,0,.35);border-radius:8px}@media (max-height:380px){#mm{width:120px;height:88px}}'),
 ('go over 120 mph and the cops come.','go over 120 mph and the cops come · one lap of the real loop.')]:
    assert a in h,a; h=h.replace(a,b)
open('index.html','w').write(h)
