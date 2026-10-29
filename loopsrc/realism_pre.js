// ---------- OSM ramps: off/on-ramp ribbons that peel away from the right edge (scenery, not drivable) ----------
const OPEN = new Uint8Array(N), RMP = [];
for (const r of OSM.ramps) { let pts = r.xz.slice(); const p0 = P[r.i], d0 = Math.hypot(pts[0][0] - p0.x, pts[0][1] - p0.z), d1 = Math.hypot(pts.at(-1)[0] - p0.x, pts.at(-1)[1] - p0.z); if (d1 < d0) pts.reverse();
  const sp = []; let acc = 0; for (let k = 0; k < pts.length - 1 && acc < 650; k++) { const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 3)); for (let m = 0; m < n; m++) sp.push([x0 + (x1 - x0) * m / n, z0 + (z1 - z0) * m / n]); acc += d; }
  let j = r.i, free = -1; const out = [], opened = [];
  for (let k = 0; k < sp.length; k++) { const [x, z] = sp[k]; let bj = j, bd = 1e18; for (let q = -25; q <= 25; q++) { const jj = W(j + q), p = P[jj], dd = (p.x - x) ** 2 + (p.z - z) ** 2; if (dd < bd) { bd = dd; bj = jj; } } j = bj;
    const p = P[j], rn = RN[j], t = T[j], lat = (x - p.x) * rn.x + (z - p.z) * rn.z, al = (x - p.x) * t.x + (z - p.z) * t.z, minL = 7.6 + EXR[j] + 2.3;
    if (free < 0 && lat >= minL + .5) free = k;
    if (free < 0) { if ((k > 12 && lat < -3) || k > 120) { out.length = 0; break; } out.push({ x: p.x + rn.x * minL + t.x * al, z: p.z + rn.z * minL + t.z * al, j, f: 0 }); opened.push(j); }
    else out.push({ x, z, j, f: Math.hypot(x - sp[free][0], z - sp[free][1]) }); }
  if (out.length > 10 && free > 0) { opened.forEach(jj => { for (let q = -3; q <= 3; q++) OPEN[W(jj + q)] = 1; }); RMP.push({ i: r.i, kind: r.kind, pts: out, free, toward: d1 < d0 }); } }
