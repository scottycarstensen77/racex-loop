// ---------- whole-loop recognizability: overpasses with street names, interchange flyovers + crossing mainlines, sound walls, BNSF rail on SR-14 ----------
const nameTex = t => canvasTex(512, 96, (x, w, h) => { x.fillStyle = '#0b6a3a'; x.beginPath(); x.roundRect(0, 0, w, h, 12); x.fill(); x.strokeStyle = '#f2f2f2'; x.lineWidth = 5; x.beginPath(); x.roundRect(6, 6, w - 12, h - 12, 9); x.stroke();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; let fs = 62; x.font = `bold ${fs}px "Arial Narrow", Arial`; while (x.measureText(t).width > w - 40 && fs > 24) { fs -= 3; x.font = `bold ${fs}px "Arial Narrow", Arial`; } x.fillText(t, w / 2, h / 2 + 3); });
{ const dk = [], pr = [], pp = [];
  for (const c of OSM.xing) { const i = c.i, p = P[i], rn = RN[i], t = T[i], nm = abbr(c.name);
    if (c.over) { const cs = c.dx * rn.x + c.dz * rn.z, sgn = Math.abs(cs) < .35 ? Math.sign(cs || 1) * .35 : cs, yd = p.y + 7.2, hl = clamp(c.len / 2, 30 + EXR[i], 70);
      dk.push([c.x - c.dx * hl, yd, c.z - c.dz * hl, c.x + c.dx * hl, yd, c.z + c.dz * hl, 13, 1.7], [c.x - c.dx * hl, yd + .85, c.z - c.dz * hl, c.x + c.dx * hl, yd + .85, c.z + c.dz * hl, 13.4, .5]);
      for (const d of [-8.6, 12.6 + EXR[i], -30]) { const q = d / sgn, x = c.x + c.dx * q, z = c.z + c.dz * q; for (const o of [-4, 4]) pr.push([x + t.x * o, Math.min(p.y, demAt(x, z)) - 1, z + t.z * o, x + t.x * o, yd - .85, z + t.z * o, 1.3, 1.3]); }
      const g = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.1), signMat(nameTex(nm))); g.position.set(c.x - t.x * 7.0 + rn.x * 1.5, yd + .1, c.z - t.z * 7.0 + rn.z * 1.5); g.rotation.y = Math.atan2(t.x, t.z) + Math.PI; scene.add(g); }
    else { const s = i * STEP - 70; frame(s, F); const d = 10.4 + exrAt(s), x = F.p.x + F.r.x * d, z = F.p.z + F.r.z * d; pp.push([x, F.p.y - 1, z, x, F.p.y + 3.2, z, .14, .14]);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(4.6, .86), signMat(nameTex(nm))); g.position.set(x, F.p.y + 3.6, z); g.rotation.y = F.h + Math.PI; scene.add(g); } }
  beams(dk, conc, 1); beams(pr, conc, 1.3); if (pp.length) beams(pp, steel, .14); }
// ribbon helper along an xz polyline with per-point y; prof = [[across, dy], ...]
function ribbon(list, mat, prof, vS = 24) { const pos = [], uv = [], idx = []; let base = 0; const n = prof.length;
  for (const L of list) { const m = L.length; let v = 0;
    for (let k = 0; k < m; k++) { const [x, y, z] = L[k], a = L[Math.max(0, k - 1)], b = L[Math.min(m - 1, k + 1)]; let tx = b[0] - a[0], tz = b[2] - a[2]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (k) v += Math.hypot(x - L[k - 1][0], z - L[k - 1][2]); const w = L[k][3] || 1;
      for (let j = 0; j < n; j++) { const d = prof[j][0] * w; pos.push(x - tz * d, y + prof[j][1], z + tx * d); uv.push(j / (n - 1), v / vS); }
      if (k) for (let j = 0; j < n - 1; j++) { const q = base + (k - 1) * n + j; idx.push(q, q + n, q + 1, q + 1, q + n, q + n + 1); } }
    base += m * n; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const me = new THREE.Mesh(g, mat); me.receiveShadow = DAY; me.frustumCulled = false; scene.add(me); return me; }
const pkd = P.filter((_, i) => i % 4 === 0), loopNear = (x, z) => { let bd = 1e18, by = 0; for (const p of pkd) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; by = p.y; } } return [Math.sqrt(bd), by]; };
// interchange flyovers (OSM motorway_link bridges, layer-lifted, cleared over the loop) + the crossing mainlines
{ const top = [], dkL = [], pr = [];
  for (const f of OSM.fly) { const g = resamp(f.g, 8), m = g.length, gl = g.map(([x, z]) => Math.max(demAt(x, z), WATER_Y) + .5); let cl = 0; const cum = [0]; for (let k = 1; k < m; k++) cum.push(cum[k - 1] + Math.hypot(g[k][0] - g[k - 1][0], g[k][1] - g[k - 1][1])); const tot = cum[m - 1];
    let lift = 0; if (f.br) { lift = 7.4 * Math.max(1, f.ly); for (const [x, z] of g) { const [d, y] = loopNear(x, z); if (d < 22) lift = Math.max(lift, y + 7.6 - Math.min(...gl)); } }
    const L = g.map(([x, z], k) => { const tp = f.br ? Math.min(1, Math.min(cum[k], tot - cum[k]) / Math.min(70, tot / 2.2) + .25) : 0; return [x, gl[k] + lift * Math.min(1, tp), z, f.w / 2]; });
    top.push(L); if (f.br) { dkL.push(L); L.forEach((p, k) => { if (k % 4 === 2 && p[1] - gl[k] > 4) pr.push([p[0], gl[k] - 1, p[2], p[0], p[1] - 1.2, p[2], 2.2, 2.2]); }); } }
  const rt = canvasTex(128, 256, (x, w, h) => { x.fillStyle = DAY ? '#45454a' : '#16161a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { const g = (DAY ? 50 : 14) + Math.random() * 40 | 0; x.fillStyle = `rgb(${g},${g},${g + 3})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } x.fillStyle = '#e6e6e6'; x.fillRect(3, 0, 4, h); x.fillRect(w - 7, 0, 4, h); }, true);
  ribbon(top, new THREE.MeshStandardMaterial({ map: rt, roughness: .9, color: 0x9a9a9e, side: 2, polygonOffset: true, polygonOffsetFactor: -2 }), [[-1, 0], [1, 0]]);
  ribbon(dkL, conc, [[-1.08, -1.6], [-1.08, .9], [-1, .9], [-1, 0.05], [-1.08, -1.6], [1.08, -1.6], [1, .05], [1, .9], [1.08, .9], [1.08, -1.6]]);
  beams(pr, conc, 2.2); }
// sound walls: tan concrete panels behind the right shoulder on I-205 and SR-500 (gaps at ramps, bridges, overpasses)
{ const wt = canvasTex(64, 256, (x, w, h) => { x.fillStyle = DAY ? '#b3a58e' : '#3a362f'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * .08})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, w, 3); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, 4, w, 2); x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(w * .78, 0, w * .22, h); }, true);
  const near = new Uint8Array(N); OSM.xing.forEach(c => { for (let q = -12; q <= 12; q++) near[W(c.i + q)] = 1; });
  const use = i => (SEC[i] === 'I-205' || (SEC[i] === 'SR-500' && (i < 5720 || i > 6060))) && !BRG[i] && !near[i] && !OPEN[W(i - 8)] && !OPEN[i] && !OPEN[W(i + 8)];
  sweep([[13.6, -3], [13.6, 3.6], [13.9, 3.9], [14.2, 3.6], [14.2, -3]], new THREE.MeshStandardMaterial({ map: wt, roughness: .95 }), { k: 2, use, vScale: 1 / 6 }); }
// BNSF main line along SR-14 (real OSM track) + a parked freight
{ const bt = canvasTex(64, 64, (x, w, h) => { x.fillStyle = DAY ? '#7a7166' : '#24211e'; x.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { const g = 90 + Math.random() * 60 | 0; x.fillStyle = `rgba(${g},${g - 8},${g - 16},.6)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } x.fillStyle = '#3b2a1e'; x.fillRect(8, 0, w - 16, 14); x.fillStyle = '#b8b8bc'; x.fillRect(19, 0, 4, h); x.fillRect(w - 23, 0, 4, h); }, true);
  const RL = OSM.rail.map(r => resamp(r, 6).map(([x, z]) => [x, Math.max(demAt(x, z), WATER_Y + .5) + 1.1, z, 1]));
  ribbon(RL, new THREE.MeshStandardMaterial({ map: bt, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), [[-2.2, 0], [2.2, 0]], 2.4);
  const sc = r => r.filter(([x, , z]) => { for (let i = 2300; i < 2750; i += 10) if (Math.hypot(P[i].x - x, P[i].z - z) < 110) return true; return false; }).length, lg = RL.reduce((a, b) => sc(b) > sc(a) ? b : a, []), cars = []; const cols = [0x8a3a22, 0x2c4a6a, 0x5b5f63, 0x7a2f1c, 0x335533, 0x9a6a2a];
  for (let k = 20; k + 3 < lg.length && cars.length < (LOW ? 28 : 48); k += 3) { const a = lg[k], b = lg[k + 3]; cars.push([a[0], a[1] + .9, a[2], b[0], b[1] + .9, b[2], 3, 4]); }
  if (cars.length) { const im = beams(cars, new THREE.MeshStandardMaterial({ roughness: .8 }), 3); const c = new THREE.Color(); cars.forEach((_, i) => im.setColorAt(i, c.setHex(i < 3 ? 0xd2691e : cols[i % cols.length]))); } }
