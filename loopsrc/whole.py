# patch loop.js in place for the whole-loop pass
import re
p='/workspace/repo/loop.js';s=open(p).read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)>=1,a[:80]; s=s.replace(a,b) if cnt==0 else s.replace(a,b,cnt)
# lighter sign textures on phones
rep("function guideTex(o) { return canvasTex(1024, 512, (x, w, h) => {","function guideTex(o) { const Z = (LOW || MOBILE) ? .5 : 1; return canvasTex(1024 * Z, 512 * Z, (x, w, h) => { x.scale(Z, Z); w /= Z; h /= Z;")
# exit signage: 1 MILE (side-mounted), 1/2 MILE and EXIT gantries for every exit
old=s[s.index("const taken = [], freeAt"):s.index("// ramp ribbons + gore")]
new='''const taken = [], freeAt = s => !taken.some(t => Math.abs(t - s) < 130), side = [];
const EXS = OSM.exits.map(e => ({ ...e, s: e.i * STEP, nm: [...new Set(e.names.map(abbr))].slice(0, 2), sh: (e.dref || '').split(';').map(parseR).filter(Boolean).slice(0, 2), ref: e.ref.replace(/;/g, '/') }));
TR.secs.forEach(([nm, i0]) => { if (nm === 'Ramp') return; const s = i0 * STEP + 240; taken.push(s); gantry(s, [{ d: -1.6, w: 7.4, tex: guideTex({ sh: [ROUTE[nm]], lines: [CTRL[nm]] }) }]); });
const wrapS = s => ((s % L) + L) % L;
function sideSign(s, tex) { frame(s, F); const d = 11.2 + exrAt(s), grp = new THREE.Group(); const sg = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), signMat(tex)); sg.position.set(0, 4.4, 0); sg.rotation.y = Math.PI; grp.add(sg);
  const bk = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), backMat); bk.position.set(0, 4.4, .05); grp.add(bk); [-2.2, 2.2].forEach(x => { const po = new THREE.Mesh(new THREE.BoxGeometry(.25, 6, .25), steel); po.position.set(x, 2.4, .2); grp.add(po); });
  grp.position.set(F.p.x + F.r.x * d, F.p.y - .6, F.p.z + F.r.z * d); grp.rotation.y = F.h; scene.add(grp); side.push(s); }
for (const [b, foot] of [[300, 'EXIT ONLY'], [805, '½ MILE']]) for (const e of EXS) { const lines = e.nm.length ? e.nm : ['Exit'];
  for (const o of [0, 40, -40, 80, -80, 120]) { const s = wrapS(e.s - b + o); if (!freeAt(s)) continue; taken.push(s); const nl = nlAt(s);
    gantry(s, [{ d: laneD(nl - 1) + .4, w: 7.4, tab: e.ref ? 'EXIT ' + e.ref : '', tex: guideTex({ sh: e.sh, lines, foot: e.route && foot === 'EXIT ONLY' ? '' : foot }) }]); break; } }
for (const e of EXS) for (const o of [0, 60, -60, 120, -120, 180]) { const s = wrapS(e.s - 1610 + o); if (taken.some(t => Math.abs(t - s) < 45) || side.some(t => Math.abs(t - s) < 80) || OPEN[W(Math.floor(s / STEP))]) continue;
  sideSign(s, guideTex({ sh: e.sh, lines: e.nm.length ? e.nm : ['Exit'], foot: '1 MILE' })); if (e.ref) { } break; }
'''
s=s.replace(old,new)
# Interstate Bridge: exaggerated lift towers + heavier truss
rep("const ht = u => w.mov ? 13 : 5 + 7 * Math.sin(Math.PI * (((u % 82) + 82) % 82) / 82);","const ht = u => w.mov ? 20 : 7 + 11 * Math.sin(Math.PI * (((u % 82) + 82) % 82) / 82);")
rep("tr.push([ax, yd0, az, bx, yd1, bz, .6, .7], [ax, yd0 + h0, az, bx, yd1 + h1, bz, .7, .7], [ax, yd0, az, ax, yd0 + h0, az, .35, .35],","tr.push([ax, yd0, az, bx, yd1, bz, 1.1, 1.2], [ax, yd0 + h0, az, bx, yd1 + h1, bz, 1.3, 1.3], [ax, yd0, az, ax, yd0 + h0, az, .7, .7],")
rep("yd + 50, z - ux * 7 * sx + uz * 2.5 * sz, .9, .9])));","yd + 88, z - ux * 7 * sx + uz * 2.5 * sz, 2.6, 2.6])));")
rep("tw.push([x + uz * 7.5, yd + 50, z - ux * 7.5, x - uz * 7.5, yd + 50, z + ux * 7.5, 6, 2.2], [x + uz * 7.5, yd + 30, z - ux * 7.5, x - uz * 7.5, yd + 30, z + ux * 7.5, 5.5, 4]);","tw.push([x + uz * 8.5, yd + 88, z - ux * 8.5, x - uz * 8.5, yd + 88, z + ux * 8.5, 7, 4], [x + uz * 8.5, yd + 56, z - ux * 8.5, x - uz * 8.5, yd + 56, z + ux * 8.5, 6, 3], [x + uz * 8.5, yd + 24, z - ux * 8.5, x - uz * 8.5, yd + 24, z + ux * 8.5, 6, 3]);")
rep("color: DAY ? 0x7d8a80 : 0x2a302c","color: DAY ? 0x56665c : 0x2a302c")
# Glenn Jackson: higher, longer rise, more piers
rep("WATER_Y + 4 + 52 * THREE.MathUtils.smoothstep(z, z0, z0 + 450)","WATER_Y + 4 + 100 * THREE.MathUtils.smoothstep(z, z0, z0 + 650)")
rep("if (k % 7 === 0 && ya","if (k % 5 === 0 && ya")
rep("dk.push([xa, ya - 3.5, za, xb, yb - 3.5, zb, 20, 5]","dk.push([xa, ya - 6, za, xb, yb - 6, zb, 24, 8]")
rep("color: DAY ? 0xa29e94 : 0x333335","color: DAY ? 0x8e8a81 : 0x333335")
# insert scene
mk="// ---------- fir tree cards"
s=s.replace(mk,open('/workspace/repo/loopsrc/whole_scene.js').read()+mk,1)
open(p,'w').write(s);print('ok')
