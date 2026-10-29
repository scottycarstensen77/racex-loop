// Real-world scenery: USGS aerial imagery draped on AWS Terrarium terrain, OSM buildings/roads/walls/trees.
import * as THREE from 'three';
const LAT0 = 45.64, LON0 = -122.61, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110540;
const tileXY = (x, y, z) => { // local (x east, y north) -> web-mercator tile coords
  const lat = LAT0 + y / KY, lon = LON0 + x / KX, n = 2 ** z;
  return [(lon + 180) / 360 * n, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n];
};
const fromTile = (tx, ty, z) => { const n = 2 ** z, lon = tx / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI; return [(lon - LON0) * KX, (lat - LAT0) * KY]; };

export async function buildScenery(scene, R, { low = false, base = 'assets/sc/' } = {}) {
  const [meta, demBuf, sc] = await Promise.all([
    fetch(base + 'meta.json').then(r => r.json()),
    fetch(base + 'dem.bin').then(r => r.arrayBuffer()),
    fetch(base + 'scene.json').then(r => r.json())]);
  const [GX0, GY0, GS, GNX, GNY] = meta.grid, D = new Int16Array(demBuf);
  const H = (x, y) => { // y = north
    let fx = (x - GX0) / GS, fy = (y - GY0) / GS; fx = Math.max(0, Math.min(GNX - 1.001, fx)); fy = Math.max(0, Math.min(GNY - 1.001, fy));
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * GNX + i;
    return ((D[k] * (1 - u) + D[k + 1] * u) * (1 - v) + (D[k + GNX] * (1 - u) + D[k + GNX + 1] * u) * v) / 10;
  };
  const TL = new THREE.TextureLoader(), maxAniso = R.capabilities.getMaxAnisotropy();
  const tex = u => { const t = TL.load(base + u); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso); t.generateMipmaps = true; return t; };
  const root = new THREE.Group(); scene.add(root);
  const groundMat = map => new THREE.MeshLambertMaterial({ map, color: 0xd8d8d0 });

  // --- grid mesh helper: covers local rect [x0,x1]x[y0,y1] (north-up) with nseg cells, uv from mercator mapping
  function gridMesh(x0, y0, x1, y1, nx, ny, uvf, mat, dy = 0) {
    const pos = new Float32Array((nx + 1) * (ny + 1) * 3), uv = new Float32Array((nx + 1) * (ny + 1) * 2), idx = [];
    let p = 0, q = 0;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, y = y0 + (y1 - y0) * j / ny;
      pos[p++] = x; pos[p++] = H(x, y) + dy; pos[p++] = -y; const [u, v] = uvf(x, y); uv[q++] = u; uv[q++] = v;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
  // backdrop: whole bbox, z14 imagery
  {
    const [z, bx, by, bnx, bny] = meta.back;
    const [x0, y1] = fromTile(bx, by, z), [x1, y0] = fromTile(bx + bnx, by + bny, z);
    const m = groundMat(tex('back.jpg')); m.polygonOffset = true; m.polygonOffsetFactor = 4; m.polygonOffsetUnits = 4;
    const st = low ? 60 : 40;
    const g = gridMesh(x0, y0, x1, y1, Math.round((x1 - x0) / st), Math.round((y1 - y0) / st), (x, y) => { const [tx, ty] = tileXY(x, y, z); return [(tx - bx) / bnx, 1 - (ty - by) / bny]; }, m, -0.4);
    root.add(g);
  }
  // corridor: z16 atlases (4x4 tiles each), one mesh per tile
  const seg = low ? 16 : 30;
  for (const [bx, by, tiles] of meta.blocks) {
    const m = groundMat(tex(`a${bx}_${by}.jpg`));
    const gs = [];
    for (const [ix, iy] of tiles) {
      const tx = bx * 4 + ix, ty = by * 4 + iy;
      const [x0, y1] = fromTile(tx, ty, 16), [x1, y0] = fromTile(tx + 1, ty + 1, 16);
      gs.push(gridMesh(x0, y0, x1, y1, seg, seg, (x, y) => { const [a, b] = tileXY(x, y, 16); return [(a - bx * 4) / 4, 1 - (b - by * 4) / 4]; }, m).geometry);
    }
    root.add(new THREE.Mesh(mergeGeos(gs), m));
  }
  // water (Columbia River surface ~ real elevation)
  {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0x1d3a4a, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.82, envMapIntensity: 1.2 }));
    w.rotation.x = -Math.PI / 2; w.position.y = meta.water; root.add(w); root.userData.water = w;
  }
  // --- buildings
  const winTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const on = Math.random() < .45; x.fillStyle = on ? `hsl(${35 + Math.random() * 15},90%,${55 + Math.random() * 25}%)` : '#050608'; x.fillRect(i * 32 + 6, j * 32 + 8, 20, 16); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const facTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#c9c4ba'; x.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(${Math.random() < .5 ? 0 : 255},${Math.random() < .5 ? 0 : 255},${Math.random() < .5 ? 0 : 255},.03)`; x.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { x.fillStyle = '#3b4a58'; x.fillRect(i * 32 + 6, j * 32 + 8, 20, 16); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(i * 32 + 6, j * 32 + 8, 20, 3); }
    x.fillStyle = 'rgba(0,0,0,.18)'; for (let j = 0; j < 4; j++) x.fillRect(0, j * 32 + 29, 128, 3);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const bMat = new THREE.MeshStandardMaterial({ map: facTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: .85, vertexColors: true });
  const rMat = new THREE.MeshStandardMaterial({ roughness: .95, vertexColors: true });
  {
    const wp = [], wu = [], wc = [], rp = [], rc = [], C = new THREE.Color();
    const pal = [[.86, .83, .76], [.75, .72, .68], [.92, .9, .86], [.66, .6, .55], [.8, .77, .7], [.6, .64, .68]];
    let cnt = 0;
    for (const b of sc.b) {
      const [base, h, kind] = b; const n = (b.length - 4) / 2;
      if (low && h < 6 && Math.random() < .5) continue;
      const pts = []; for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(b[4 + i * 2], b[5 + i * 2]));
      const top = base + h + 0.3, y0 = base - 1.5;
      const p = pal[(Math.abs(b[4] * 7 + b[5] * 3) | 0) % pal.length]; C.setRGB(p[0], p[1], p[2]);
      const rcol = kind === 0 ? [.32, .28, .26] : [.42, .42, .43];
      let u = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i], c = pts[(i + 1) % n], L = a.distanceTo(c);
        const u0 = u / 4, u1 = (u + L) / 4, v0 = 0, v1 = h / 3.2; u += L;
        wp.push(a.x, y0, -a.y, c.x, y0, -c.y, c.x, top, -c.y, a.x, y0, -a.y, c.x, top, -c.y, a.x, top, -a.y);
        wu.push(u0, -0.5, u1, -0.5, u1, v1, u0, -0.5, u1, v1, u0, v1);
        for (let k = 0; k < 6; k++) wc.push(C.r, C.g, C.b);
      }
      const tri = THREE.ShapeUtils.triangulateShape(pts, []);
      for (const t of tri) for (const k of [t[0], t[2], t[1]]) { rp.push(pts[k].x, top, -pts[k].y); rc.push(...rcol); }
      cnt++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3)); g.computeVertexNormals();
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3)); g2.computeVertexNormals();
    const m1 = new THREE.Mesh(g, bMat), m2 = new THREE.Mesh(g2, rMat); m1.material.side = THREE.DoubleSide; root.add(m1, m2);
    root.userData.buildings = cnt;
  }
  // --- other roads (OSM), draped or elevated on bridges
  {
    const pos = [], col = [], sk = [], piers = [];
    for (const r of sc.r) {
      const w = r[0] / 2, br = r[1], n = (r.length - 2) / 3, sh = r[0] >= 9 ? .16 : .22;
      for (let i = 0; i < n - 1; i++) {
        const ax = r[2 + i * 3], ay = r[3 + i * 3], az = r[4 + i * 3], bx = r[5 + i * 3], by = r[6 + i * 3], bz = r[7 + i * 3];
        let dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; const nx = -dy * w, ny = dx * w;
        const A = [ax + nx, az, -(ay + ny)], B = [ax - nx, az, -(ay - ny)], Cc = [bx + nx, bz, -(by + ny)], Dd = [bx - nx, bz, -(by - ny)];
        pos.push(...A, ...B, ...Cc, ...B, ...Dd, ...Cc); for (let k = 0; k < 6; k++) col.push(sh, sh, sh * 1.05);
        if (br) {
          for (const s of [1, -1]) { const P0 = s > 0 ? A : B, P1 = s > 0 ? Cc : Dd; sk.push(P0[0], P0[1] + .9, P0[2], P1[0], P1[1] + .9, P1[2], P1[0], P1[1] - 1.4, P1[2], P0[0], P0[1] + .9, P0[2], P1[0], P1[1] - 1.4, P1[2], P0[0], P0[1] - 1.4, P0[2]); }
          if (i % 2 === 0) { const g = H(ax, ay); if (az - g > 3) piers.push(ax, ay, g, az - 1.4); }
        }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    root.add(new THREE.Mesh(g, m));
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3)); g2.computeVertexNormals();
    root.add(new THREE.Mesh(g2, concreteMat()));
    root.add(piersMesh(piers));
  }
  // --- noise walls
  {
    const p = [];
    for (const w of sc.w) { const h = w[0], n = (w.length - 1) / 3; for (let i = 0; i < n - 1; i++) { const a = w.slice(1 + i * 3, 4 + i * 3), b = w.slice(4 + i * 3, 7 + i * 3); p.push(a[0], a[2] - 1, -a[1], b[0], b[2] - 1, -b[1], b[0], b[2] + h, -b[1], a[0], a[2] - 1, -a[1], b[0], b[2] + h, -b[1], a[0], a[2] + h, -a[1]); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
    root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: .95, side: THREE.DoubleSide })));
  }
  // --- trees (instanced conifers + broadleaf)
  {
    const t = sc.t, n = t.length / 3, lim = low ? 3500 : n;
    const con = new THREE.ConeGeometry(2.6, 13, 7); con.translate(0, 9, 0);
    const leaf = new THREE.IcosahedronGeometry(3.6, 0); leaf.scale(1, 1.15, 1); leaf.translate(0, 6.5, 0);
    const trunk = new THREE.CylinderGeometry(.25, .35, 4, 5); trunk.translate(0, 2, 0);
    const mc = new THREE.InstancedMesh(con, new THREE.MeshLambertMaterial({ color: 0x2c4a2a }), lim), ml = new THREE.InstancedMesh(leaf, new THREE.MeshLambertMaterial({ color: 0x4d6b2f, flatShading: true }), lim), mt = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x4a3828 }), lim * 2);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < n && a + b < lim; i++) {
      const x = t[i * 3], y = t[i * 3 + 1], z = t[i * 3 + 2], s = .75 + ((i * 2654435761) % 1000) / 1000 * .7;
      Q.setFromAxisAngle(Y, i); M.compose(new THREE.Vector3(x, z - .2, -y), Q, new THREE.Vector3(s, s * (.9 + (i % 5) * .08), s));
      const tint = .8 + (i % 7) * .05;
      if (i % 3) { mc.setMatrixAt(a, M); mc.setColorAt(a++, C.setScalar(tint)); } else { ml.setMatrixAt(b, M); ml.setColorAt(b++, C.setScalar(tint)); }
      mt.setMatrixAt(c++, M);
    }
    mc.count = a; ml.count = b; mt.count = c; root.add(mc, ml, mt);
    root.userData.trees = a + b;
  }
  root.userData.setNight = night => { bMat.emissiveIntensity = night ? 1.6 : 0; };
  return { root, H };
}
let _cm; function concreteMat() { return _cm || (_cm = new THREE.MeshStandardMaterial({ color: 0x9d9a92, roughness: .9, side: THREE.DoubleSide })); }
export function piersMesh(p) { // [x,y(north),ground,top]*
  const n = p.length / 4, g = new THREE.BoxGeometry(1.6, 1, 1.6); g.translate(0, .5, 0);
  const m = new THREE.InstancedMesh(g, concreteMat(), Math.max(1, n)), M = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { const h = p[i * 4 + 3] - p[i * 4 + 2] + 1; M.makeScale(1, h, 1).setPosition(p[i * 4], p[i * 4 + 2] - 1, -p[i * 4 + 1]); m.setMatrixAt(i, M); }
  m.count = n; return m;
}
export function mergeGeos(gs) {
  let nv = 0, ni = 0; for (const g of gs) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let v = 0, k = 0;
  for (const g of gs) { pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3); uv.set(g.attributes.uv.array, v * 2); const I = g.index.array; for (let i = 0; i < I.length; i++) idx[k++] = I[i] + v; v += g.attributes.position.count; g.dispose(); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); o.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); o.setIndex(new THREE.BufferAttribute(idx, 1)); return o;
}
