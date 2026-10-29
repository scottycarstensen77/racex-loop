// ---------- real exits (OSM motorway_junction refs + destinations): MUTCD green guide signs, route shields ----------
const abbr = t => t.replace(/\bNortheast\b/g, 'NE').replace(/\bSoutheast\b/g, 'SE').replace(/\bNorthwest\b/g, 'NW').replace(/\bSouthwest\b/g, 'SW').replace(/\bBoulevard\b/g, 'Blvd').replace(/\bAvenue\b/g, 'Ave').replace(/\bRoad\b/g, 'Rd').replace(/\bDrive\b/g, 'Dr').replace(/\bStreet\b/g, 'St').replace(/\bSaint\b/g, 'St').replace('National Site', 'Natl Site');
function drawShield(x, kind, num, cx, cy, S) {
  x.save(); x.translate(cx, cy); x.textAlign = 'center'; x.textBaseline = 'middle';
  if (kind === 'I') { const w = S * (num.length > 2 ? 1.12 : .95);
    const path = () => { x.beginPath(); x.moveTo(-w / 2, -S * .42); x.quadraticCurveTo(-w / 4, -S * .56, 0, -S * .44); x.quadraticCurveTo(w / 4, -S * .56, w / 2, -S * .42); x.bezierCurveTo(w / 2 + S * .08, S * .05, w * .28, S * .36, 0, S / 2); x.bezierCurveTo(-w * .28, S * .36, -w / 2 - S * .08, S * .05, -w / 2, -S * .42); x.closePath(); };
    path(); x.fillStyle = '#fff'; x.fill(); x.save(); path(); x.clip(); x.fillStyle = '#003f87'; x.fillRect(-w, -S * .2, 2 * w, S); x.fillStyle = '#b01e2d'; x.fillRect(-w, -S, 2 * w, S * .78); x.restore();
    x.lineWidth = S * .045; x.strokeStyle = '#fff'; path(); x.stroke();
    x.fillStyle = '#fff'; x.font = `bold ${S * .12}px Arial`; x.fillText('INTERSTATE', 0, -S * .3); x.font = `bold ${S * (num.length > 2 ? .4 : .48)}px Arial`; x.fillText(num, 0, S * .14);
  } else { const w = S * (num.length > 2 ? 1.25 : 1); x.fillStyle = '#fff'; x.beginPath(); x.roundRect(-w / 2, -S / 2, w, S, S * .12); x.fill();
    x.strokeStyle = '#111'; x.lineWidth = S * .05; x.beginPath(); x.roundRect(-w / 2 + S * .07, -S / 2 + S * .07, w - S * .14, S - S * .14, S * .09); x.stroke();
    x.fillStyle = '#111'; x.beginPath(); x.ellipse(-w * .3, -S * .24, S * .08, S * .11, -.3, 0, 7); x.fill(); // Washington profile (WA route shield)
    x.font = `bold ${S * .5}px Arial`; x.fillText(num, S * .06, S * .1); }
  x.restore(); }
function guideTex(o) { return canvasTex(1024, 512, (x, w, h) => {
  x.fillStyle = '#0b6a3a'; x.beginPath(); x.roundRect(0, 0, w, h, 28); x.fill(); x.strokeStyle = '#f2f2f2'; x.lineWidth = 10; x.beginPath(); x.roundRect(14, 14, w - 28, h - 28, 20); x.stroke();
  let y = 34; const sh = o.sh || [];
  if (sh.length) { const S = 140, dir = sh.some(q => q[2]); sh.forEach(([k, n, d], i) => { const cx = w / 2 + (i - (sh.length - 1) / 2) * 280; if (d) { x.fillStyle = '#fff'; x.font = 'bold 50px Arial'; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillText(d, cx, y + 46); } drawShield(x, k, n, cx, y + (dir ? 62 : 6) + S / 2, S); }); y += dir ? 218 : 160; }
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const avail = h - y - (o.foot ? 120 : 34), n = o.lines.length, sz = Math.min(98, avail / n * .86);
  o.lines.forEach((t, i) => { let fs = sz; x.font = `bold ${fs}px "Arial Narrow", Arial`; while (x.measureText(t).width > w - 70 && fs > 30) { fs -= 3; x.font = `bold ${fs}px "Arial Narrow", Arial`; } x.fillText(t, w / 2, y + sz * (i + 1) + 6); });
  if (o.foot === 'EXIT ONLY') { x.fillStyle = '#f2c200'; x.fillRect(w * .18, h - 118, w * .64, 90); x.fillStyle = '#111'; x.font = 'bold 70px Arial'; x.fillText('EXIT ONLY', w / 2 + 40, h - 48);
    x.beginPath(); const ax = w * .18 + 70, ay = h - 73; x.moveTo(ax - 14, ay - 34); x.lineTo(ax + 14, ay - 34); x.lineTo(ax + 14, ay + 4); x.lineTo(ax + 30, ay + 4); x.lineTo(ax, ay + 38); x.lineTo(ax - 30, ay + 4); x.lineTo(ax - 14, ay + 4); x.fill(); }
  else if (o.foot) { x.font = 'bold 76px Arial'; x.fillText(o.foot, w / 2, h - 46); } }); }
const tabTex = t => canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#0b6a3a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#f2f2f2'; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h + 20); x.fillStyle = '#fff'; let fs = 78; x.font = `bold ${fs}px Arial`; while (x.measureText(t).width > w - 40) { fs -= 4; x.font = `bold ${fs}px Arial`; } x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, w / 2, h / 2 + 8); });
const goreTex = ref => canvasTex(512, 384, (x, w, h) => { x.fillStyle = '#0b6a3a'; x.beginPath(); x.roundRect(0, 0, w, h, 24); x.fill(); x.strokeStyle = '#f2f2f2'; x.lineWidth = 8; x.beginPath(); x.roundRect(10, 10, w - 20, h - 20, 18); x.stroke();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = 'bold 92px Arial'; x.fillText('EXIT', w / 2, 112); let fs = 120; x.font = `bold ${fs}px Arial`; while (x.measureText(ref).width > w - 60) { fs -= 6; x.font = `bold ${fs}px Arial`; } x.fillText(ref, w / 2, 236);
  x.save(); x.translate(w / 2, 304); x.rotate(Math.PI / 4); x.fillRect(-10, -30, 20, 60); x.beginPath(); x.moveTo(-30, -26); x.lineTo(30, -26); x.lineTo(0, -62); x.fill(); x.restore(); });
const signMat = tex => { const m = new THREE.MeshStandardMaterial({ map: tex, roughness: .5, emissive: 0xffffff, emissiveIntensity: DAY ? .1 : .5 }); m.emissiveMap = tex; return m; };
const backMat = new THREE.MeshStandardMaterial({ color: 0x8b8f93, roughness: .7, metalness: .4 });
const gantries = [];
function gantry(s, signs) { frame(s, F); const h = F.h, iR = W(Math.floor(s / STEP)), ex = exrAt(s); const xr = 8.9 + ex + (OPEN[iR] ? 5 : 0), xl = RAMP[iR] ? -8.9 : -8.35;
  const grp = new THREE.Group();
  const truss = new THREE.Mesh(new THREE.BoxGeometry(xr - xl, 1, .9), steel); truss.position.set(-(xl + xr) / 2, 7.5, 0); grp.add(truss);
  [xl, xr].forEach(d => { const c = new THREE.Mesh(new THREE.BoxGeometry(.55, 8, .55), steel); c.position.set(-d, 4, 0); grp.add(c); const ft = new THREE.Mesh(new THREE.BoxGeometry(1.2, .6, 1.2), conc); ft.position.set(-d, .3, 0); grp.add(ft); });
  for (const g of signs) { const hg = g.w * .5, y = 7.5 + hg / 2 - .9;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(g.w, hg), signMat(g.tex)); sign.position.set(-g.d, y, -.55); sign.rotation.y = Math.PI; grp.add(sign);
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(g.w, hg), backMat); bk.position.set(-g.d, y, -.5); grp.add(bk);
    if (g.tab) { const tw = 3.2; const tb = new THREE.Mesh(new THREE.PlaneGeometry(tw, .8), signMat(tabTex(g.tab))); tb.position.set(-(g.d + g.w / 2 - tw / 2), y + hg / 2 + .38, -.55); tb.rotation.y = Math.PI; grp.add(tb); }
    if (NIGHT) { const sl = new THREE.Mesh(new THREE.BoxGeometry(g.w, .08, .2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6) })); sl.position.set(-g.d, y - hg / 2 - .2, -.9); grp.add(sl); } }
  grp.traverse(o => { if (o.isMesh) o.castShadow = DAY; }); grp.position.copy(at(s, 0, 0)); grp.rotation.y = h; scene.add(grp); gantries.push(s); }
const ROUTE = { 'I-5': ['I', '5', 'SOUTH'], 'I-205': ['I', '205', 'NORTH'], 'SR-14': ['S', '14', 'EAST'], 'SR-500': ['S', '500', 'WEST'] };
const CTRL = { 'I-5': 'Portland', 'I-205': 'Seattle · Orchards', 'SR-14': 'Camas · Washougal', 'SR-500': 'Vancouver · I-5' };
const parseR = t => { const m = /^(I|SR)\s*(\d+)\s*([A-Za-z]*)/.exec(t || ''); return m ? [m[1] === 'I' ? 'I' : 'S', m[2], m[3].toUpperCase()] : null; };
const taken = [], freeAt = s => !taken.some(t => Math.abs(t - s) < 170);
const EXS = OSM.exits.map(e => ({ ...e, s: e.i * STEP, nm: [...new Set(e.names.map(abbr))].slice(0, 2), sh: parseR(e.dref), ref: e.ref.replace(/;/g, '/') }));
TR.secs.forEach(([nm, i0]) => { if (nm === 'Ramp') return; const s = i0 * STEP + 240; taken.push(s); gantry(s, [{ d: -1.6, w: 7.4, tex: guideTex({ sh: [ROUTE[nm]], lines: [CTRL[nm]] }) }]); });
for (const e of EXS) { const sh = e.sh ? [e.sh] : [], lines = e.nm.length ? e.nm : ['Exit'];
  for (const [b, foot] of [[760, '½ MILE'], [280, 'EXIT ONLY']]) { const s = e.s - b; if (s < 0 || !freeAt(s)) continue; taken.push(s); const nl = nlAt(s);
    gantry(s, [{ d: laneD(nl - 1) + .4, w: 7.4, tab: e.ref ? 'EXIT ' + e.ref : '', tex: guideTex({ sh, lines, foot }) }]); } }
// ramp ribbons + gore: crash cushion + 'EXIT nn' post sign
{ const rampTex = canvasTex(128, 256, (x, w, h) => { x.fillStyle = DAY ? '#3e3e42' : '#16161a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { const g = (DAY ? 46 : 14) + Math.random() * 40 | 0; x.fillStyle = `rgb(${g},${g},${g + 3})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } x.fillStyle = '#e6e6e6'; x.fillRect(4, 0, 4, h); x.fillStyle = '#e6e6e6'; x.fillRect(w - 8, 0, 4, h); }, true);
  const pos = [], uv = [], idx = []; let base = 0;
  for (const r of RMP) { const n = r.pts.length; let v = 0;
    for (let k = 0; k < n; k++) { const p = r.pts[k], a = r.pts[Math.max(0, k - 1)], b = r.pts[Math.min(n - 1, k + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; const rx = -tz, rz = tx;
      p.y = lerp(P[p.j].y + .03, Math.max(demAt(p.x, p.z), WATER_Y) + .35, THREE.MathUtils.smoothstep(p.f, 0, 170));
      if (k) v += Math.hypot(p.x - r.pts[k - 1].x, p.z - r.pts[k - 1].z);
      pos.push(p.x - rx * 2.3, p.y, p.z - rz * 2.3, p.x + rx * 2.3, p.y, p.z + rz * 2.3); uv.push(0, v / 24, 1, v / 24);
      if (k) { const q = base + (k - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); } }
    base += n * 2; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: rampTex, roughness: .9, color: 0x9a9a9e, side: 2, polygonOffset: true, polygonOffsetFactor: -1 })); m.receiveShadow = DAY; m.frustumCulled = false; scene.add(m);
  const cushG = new THREE.BoxGeometry(.9, 1, 3.2); cushG.translate(0, .5, 0); const cushM = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: .6 });
  for (const r of RMP) { const gi = r.toward ? r.free : r.free, gp = r.pts[Math.min(r.pts.length - 1, gi + 2)], j = gp.j, side = 7.6 + EXR[j] + .3;
    const c = new THREE.Mesh(cushG, cushM); const lp = P[j]; const gl = ((gp.x - lp.x) * RN[j].x + (gp.z - lp.z) * RN[j].z) - 2.3 - .5; c.position.set(lp.x + RN[j].x * Math.max(side, gl), lp.y, lp.z + RN[j].z * Math.max(side, gl)); c.rotation.y = Math.atan2(T[j].x, T[j].z); c.castShadow = DAY; scene.add(c);
    if (r.kind !== 'off') continue; const e = EXS.find(e => Math.abs(e.i - r.i) < 70); if (!e) continue;
    const sp = r.pts[Math.min(r.pts.length - 1, r.free + 10)], jj = sp.j, gap = ((sp.x - P[jj].x) * RN[jj].x + (sp.z - P[jj].z) * RN[jj].z) - 2.3, dd = Math.max(7.6 + EXR[jj] + 1, (7.6 + EXR[jj] + gap) / 2);
    const grp = new THREE.Group(); const pan = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.95), signMat(goreTex(e.ref || '›'))); pan.position.set(0, 3.0, 0); pan.rotation.y = Math.PI; grp.add(pan);
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.95), backMat); bk.position.set(0, 3.0, .03); grp.add(bk);
    [-.9, .9].forEach(x => { const po = new THREE.Mesh(new THREE.BoxGeometry(.12, 3.1, .12), steel); po.position.set(x, 1.55, .08); grp.add(po); });
    grp.position.set(P[jj].x + RN[jj].x * dd, P[jj].y, P[jj].z + RN[jj].z * dd); grp.rotation.y = Math.atan2(T[jj].x, T[jj].z); grp.traverse(o => { if (o.isMesh) o.castShadow = DAY; }); scene.add(grp); } }

// ---------- landmarks from OSM ----------
function beams(list, mat, th) { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0, .5); const im = new THREE.InstancedMesh(g, mat, list.length);
  const m4 = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
  list.forEach((L, i) => { a.set(L[0], L[1], L[2]); b.set(L[3], L[4], L[5]); dir.subVectors(b, a); const len = dir.length() || .01; dir.normalize(); q.setFromUnitVectors(z, dir); sc.set(L[6] || th, L[7] || th, len); m4.compose(a, q, sc); im.setMatrixAt(i, m4); });
  im.castShadow = DAY; im.receiveShadow = DAY; scene.add(im); return im; }
const resamp = (g, st) => { const o = []; for (let k = 0; k < g.length - 1; k++) { const [x0, z0] = g[k], [x1, z1] = g[k + 1], n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / st)); for (let m = 0; m < n; m++) o.push([x0 + (x1 - x0) * m / n, z0 + (z1 - z0) * m / n]); } o.push(g.at(-1)); return o; };
// Interstate Bridge: twin steel through-truss spans with the vertical-lift towers on the Vancouver side
{ const A = [-4930, 2017], B = [-5325, 2995], al = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / al, uz = (B[1] - A[1]) / al;
  const tm = new THREE.MeshStandardMaterial({ color: DAY ? 0x7d8a80 : 0x2a302c, roughness: .55, metalness: .5 }), dm = new THREE.MeshStandardMaterial({ color: DAY ? 0x9d9a92 : 0x2a2a2c, roughness: .9 });
  const tr = [], dk = [], pr = [], tw = [];
  for (const w of OSM.lmk.ibridge) { const g = resamp(w.g, 9);
    for (let k = 0; k < g.length - 1; k++) { const [x0, z0] = g[k], [x1, z1] = g[k + 1], dx = x1 - x0, dz = z1 - z0, dl = Math.hypot(dx, dz) || 1, nx = -dz / dl, nz = dx / dl;
      const u0 = (x0 - A[0]) * ux + (z0 - A[1]) * uz, u1 = (x1 - A[0]) * ux + (z1 - A[1]) * uz;
      const yd0 = Math.max(demAt(x0, z0) + .8, WATER_Y + 13), yd1 = Math.max(demAt(x1, z1) + .8, WATER_Y + 13);
      const ht = u => w.mov ? 13 : 5 + 7 * Math.sin(Math.PI * (((u % 82) + 82) % 82) / 82);
      dk.push([x0, yd0 - .6, z0, x1, yd1 - .6, z1, 12.5, 1.2]);
      if (u0 < 40 || u0 > al - 30) continue;
      [-6.5, 6.5].forEach(o => { const ax = x0 + nx * o, az = z0 + nz * o, bx = x1 + nx * o, bz = z1 + nz * o, h0 = ht(u0), h1 = ht(u1);
        tr.push([ax, yd0, az, bx, yd1, bz, .6, .7], [ax, yd0 + h0, az, bx, yd1 + h1, bz, .7, .7], [ax, yd0, az, ax, yd0 + h0, az, .35, .35], [k % 2 ? ax : bx, k % 2 ? yd0 : yd1, k % 2 ? az : bz, k % 2 ? bx : ax, k % 2 ? yd1 + h1 : yd0 + h0, k % 2 ? bz : az, .3, .3]); });
      tr.push([x0 - nx * 6.5, yd0 + ht(u0), z0 - nz * 6.5, x0 + nx * 6.5, yd0 + ht(u0), z0 + nz * 6.5, .3, .3]);
      if (Math.floor(u0 / 82) !== Math.floor(u1 / 82) && demAt(x0, z0) < WATER_Y + 3) pr.push([x0, WATER_Y - 2, z0, x0, yd0 - 1.2, z0, 15, 4]); }
    if (w.mov) [w.g[0], w.g.at(-1)].forEach(([x, z]) => { const yd = WATER_Y + 13; [-1, 1].forEach(sx => [-1, 1].forEach(sz => tw.push([x + uz * 7 * sx + ux * 2.5 * sz, yd, z - ux * 7 * sx + uz * 2.5 * sz, x + uz * 7 * sx + ux * 2.5 * sz, yd + 50, z - ux * 7 * sx + uz * 2.5 * sz, .9, .9])));
      tw.push([x + uz * 7.5, yd + 50, z - ux * 7.5, x - uz * 7.5, yd + 50, z + ux * 7.5, 6, 2.2], [x + uz * 7.5, yd + 30, z - ux * 7.5, x - uz * 7.5, yd + 30, z + ux * 7.5, 5.5, 4]); }); }
  beams(tr, tm, .5); beams(dk, dm, 1); beams(pr, dm, 4); beams(tw, tm, 1); }
// Glenn L. Jackson Bridge (I-205): long, high concrete box girder on tall piers
{ const ws = OSM.lmk.glenn.filter(g => g.every(([x, z]) => x > 3800 && x < 5600 && z > 3700 && z < 6600)); let z0 = 1e9, z1 = -1e9; ws.forEach(g => g.forEach(([, z]) => { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }));
  const dm = new THREE.MeshStandardMaterial({ color: DAY ? 0xa29e94 : 0x333335, roughness: .85 }), dk = [], pr = [];
  const yAt = (x, z) => Math.max(demAt(x, z) + 1, WATER_Y + 4 + 52 * THREE.MathUtils.smoothstep(z, z0, z0 + 450) * (1 - THREE.MathUtils.smoothstep(z, z1 - 600, z1)));
  for (const w of ws) { const g = resamp(w, 12); for (let k = 0; k < g.length - 1; k++) { const [xa, za] = g[k], [xb, zb] = g[k + 1], ya = yAt(xa, za), yb = yAt(xb, zb);
      if (Math.min(...P.filter((_, i) => i % 8 === 0).map(p => Math.hypot(p.x - xa, p.z - za))) < 30) continue;
      dk.push([xa, ya - 3.5, za, xb, yb - 3.5, zb, 20, 5], [xa, ya + .5, za, xb, yb + .5, zb, 20.5, 1]); if (k % 7 === 0 && ya - demAt(xa, za) > 6) pr.push([xa, Math.max(demAt(xa, za), WATER_Y) - 2, za, xa, ya - 3.5, za, 12, 4.5]); } }
  if (dk.length) { beams(dk, dm, 1); beams(pr, dm, 4); } }
// water towers (incl. the one by Pearson / Fort Vancouver)
{ const wm = new THREE.MeshStandardMaterial({ color: 0xd7dde2, roughness: .5, metalness: .3 });
  for (const [x, z] of OSM.lmk.towers) { const y = demAt(x, z), grp = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 10), wm); tank.scale.set(1, .75, 1); tank.position.y = 36; grp.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(8.2, 4, 16), wm); cap.position.y = 42; grp.add(cap); const ctr = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 32, 8), wm); ctr.position.y = 16; grp.add(ctr);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, leg = new THREE.Mesh(new THREE.CylinderGeometry(.45, .55, 33, 6), wm); leg.position.set(Math.cos(a) * 6, 16.5, Math.sin(a) * 6); grp.add(leg); }
    grp.position.set(x, y, z); grp.traverse(o => { if (o.isMesh) o.castShadow = DAY; }); scene.add(grp); } }
// Pearson Field runway + hangars, Fort Vancouver stockade
{ const pg = OSM.lmk.pearson; let cx = 0, cz = 0; pg.forEach(([x, z]) => { cx += x; cz += z; }); cx /= pg.length; cz /= pg.length;
  let sxx = 0, szz = 0, sxz = 0; pg.forEach(([x, z]) => { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }); const ang = .5 * Math.atan2(2 * sxz, sxx - szz), dx = Math.cos(ang), dz = Math.sin(ang);
  let ext = 0; pg.forEach(([x, z]) => { ext = Math.max(ext, Math.abs((x - cx) * dx + (z - cz) * dz)); }); const len = Math.min(1000, ext * 1.7);
  const rt = canvasTex(64, 512, (x, w, h) => { x.fillStyle = '#4a4a4e'; x.fillRect(0, 0, w, h); x.fillStyle = '#eee'; x.fillRect(2, 0, 3, h); x.fillRect(w - 5, 0, 3, h); for (let v = 0; v < h; v += 128) x.fillRect(w / 2 - 2, v, 4, 64); }, true); rt.repeat.set(1, len / 120);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(30, len), new THREE.MeshStandardMaterial({ map: rt, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2 })); rw.rotation.order = 'YXZ'; rw.rotation.set(-Math.PI / 2, Math.atan2(dx, dz), 0); rw.position.set(cx, demAt(cx, cz) + .4, cz); scene.add(rw);
  const hm = new THREE.MeshStandardMaterial({ color: 0xc9c0a8, roughness: .8 }); for (let k = -1; k <= 1; k++) { const hx = cx + dx * k * 70 - dz * 85, hz = cz + dz * k * 70 + dx * 85; const hg = new THREE.Mesh(new THREE.BoxGeometry(45, 12, 30), hm); hg.position.set(hx, demAt(hx, hz) + 6, hz); hg.rotation.y = -ang; hg.castShadow = DAY; scene.add(hg); }
  const [fx, fz] = LL(45.6255, -122.6623), fy = demAt(fx, fz), wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }), wl = [];
  [[-110, -60, 110, -60], [110, -60, 110, 60], [110, 60, -110, 60], [-110, 60, -110, -60]].forEach(([a, b, c, d]) => wl.push([fx + a, fy, fz + b, fx + c, fy, fz + d, .6, 0])); 
  const im = beams(wl.map(l => [l[0], l[1] + 2.5, l[2], l[3], l[4] + 2.5, l[5], .6, 5]), wood, 1);
  const bas = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 8), wood); bas.position.set(fx - 110, fy + 6, fz - 60); scene.add(bas);
  const fh = new THREE.Mesh(new THREE.BoxGeometry(30, 9, 16), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: .8 })); fh.position.set(fx, fy + 4.5, fz); scene.add(fh); }
// downtown Vancouver towers (Esther Short area), glass
{ const gt = canvasTex(64, 128, (x, w, h) => { x.fillStyle = DAY ? '#5d7890' : '#0a0c12'; x.fillRect(0, 0, w, h); for (let y = 2; y < h; y += 8) { x.fillStyle = DAY ? 'rgba(220,235,250,.35)' : (Math.random() < .5 ? '#ffd890' : '#141820'); x.fillRect(0, y, w, 4); } x.fillStyle = 'rgba(30,40,50,.5)'; for (let i = 0; i < w; i += 8) x.fillRect(i, 0, 1, h); }, true);
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, .5, 0); const T2 = OSM.lmk.tall, im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: gt, roughness: .25, metalness: .6, emissive: NIGHT ? 0xffffff : 0, emissiveMap: NIGHT ? gt : null, emissiveIntensity: NIGHT ? .7 : 0 }), T2.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0); T2.forEach(([x, z, w, l, a, h], k) => { q.setFromAxisAngle(up, -a); m4.compose(new THREE.Vector3(x, demAt(x, z) - 1, z), q, new THREE.Vector3(w * 1.03, h + 1, l * 1.03)); im.setMatrixAt(k, m4); }); im.castShadow = DAY; scene.add(im); }
// Vancouver Mall (SR-500 / I-205): big low box, parking field, pylon sign facing the freeway
{ const [mx, mz] = LL(45.6585, -122.5845), my = demAt(mx, mz);
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(560, 420), new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })); lot.rotation.x = -Math.PI / 2; lot.position.set(mx, my + .5, mz); scene.add(lot);
  const bm = new THREE.MeshStandardMaterial({ color: 0xd9d0c0, roughness: .85 }); [[0, 0, 300, 12, 150], [-170, 0, 70, 16, 110], [170, 10, 80, 15, 120]].forEach(([ox, oz, w, h, d]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bm); b.position.set(mx + ox, my + h / 2, mz + oz); b.castShadow = DAY; scene.add(b); });
  let bj = 0, bd = 1e18; P.forEach((p, i) => { const d = (p.x - mx) ** 2 + (p.z - mz) ** 2; if (d < bd) { bd = d; bj = i; } }); const side = Math.sign((mx - P[bj].x) * RN[bj].x + (mz - P[bj].z) * RN[bj].z) || 1, sj = W(bj - 60);
  const pp = at(sj * STEP, side * 34, 0), py = Math.max(demAt(pp.x, pp.z), pp.y - 4); const pyl = new THREE.Group(); const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 18, 1.2), steel); post.position.y = 9; pyl.add(post);
  const st = canvasTex(512, 256, (x, w, h) => { x.fillStyle = '#b3122a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = 'bold 96px Arial'; x.fillText('VANCOUVER', w / 2, 110); x.font = 'bold 110px Arial'; x.fillText('MALL', w / 2, 220); });
  const pl = new THREE.Mesh(new THREE.BoxGeometry(8, 4, .5), [backMat, backMat, backMat, backMat, signMat(st), signMat(st)]); pl.position.y = 19; pyl.add(pl); pyl.position.set(pp.x, py, pp.z); pyl.rotation.y = T[sj] ? Math.atan2(T[sj].x, T[sj].z) : 0; scene.add(pyl); }
