import re
F='/workspace/repo/loop.js'; s=open(F).read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)==cnt,(a[:60],s.count(a)); s=s.replace(a,b)
# 1 load osm.json
rep("fetch('terrain.bin').then(r => r.arrayBuffer())]);","fetch('terrain.bin').then(r => r.arrayBuffer())]);\nconst OSM = await fetch('osm.json').then(r => r.json());")
# 2 per-point lanes + right-edge offset
rep("const LANE = 3.7, LANES = [-LANE, 0, LANE], EDGE = 6.9; // 3 eastbound lanes, d in [-6.9, 6.9]\n",
"""const LANE = 3.7, LANES = [-LANE, 0, LANE], EDGE = 6.9; // lane 0 = left lane, d in [-6.9, 6.9] for 3 lanes
// real lane counts from OSM: lanes 0..NL-1 at d = -3.7 + 3.7k; the right edge moves out by EXR
const NL = OSM.lanes, EXR = new Float32Array(N);
{ const raw = NL.map(n => (n - 3) * LANE + (n === 3 ? 0 : 1.0)); for (let i = 0; i < N; i++) { let a = 0; for (let k = -30; k <= 30; k++) a += raw[W(i + k)]; EXR[i] = a / 61; } }
const exrAt = s => { const f = (((s / STEP) % N) + N) % N, i = Math.floor(f), t = f - i; return EXR[i] * (1 - t) + EXR[W(i + 1)] * t; };
const nlAt = s => NL[W(Math.floor(s / STEP))], laneD = k => -LANE + k * LANE;
const LL = (lat, lon) => [(lon + 122.61) * 111320 * Math.cos(45.64 * Math.PI / 180), -(lat - 45.64) * 110540];
""")
rep("function at(s, d, y = 0, v = new THREE.Vector3()) { frame(s, F2); return",
    "function at(s, d, y = 0, v = new THREE.Vector3()) { if (d > 7.2) d += exrAt(s); frame(s, F2); return")
# 3 sweep shift
rep("function sweep(prof, mat, { k = 1, s0 = 0, s1 = L, vScale = 0.1, use = null, add = true } = {}) {",
    "function sweep(prof, mat, { k = 1, s0 = 0, s1 = L, vScale = 0.1, use = null, add = true, shift = true } = {}) {")
rep("for (let j = 0; j < n; j++) { pos.push(p.x + r.x * prof[j][0], p.y + prof[j][1], p.z + r.z * prof[j][0]);",
    "for (let j = 0; j < n; j++) { const dx = prof[j][0] + (shift && prof[j][0] > 1 ? EXR[i] : 0); pos.push(p.x + r.x * dx, p.y + prof[j][1], p.z + r.z * dx);")
# 4 markings out of the texture, into geometry
rep("  line(.035 * w, '#d8b830'); line(.965 * w, '#e8e8e8'); line(w / 3, '#e8e8e8', 1); line(2 * w / 3, '#e8e8e8', 1); }, true);","  }, true);")
rep("sweep([[7.6, 0], [-7.6, 0]], roadMat, { vScale: 1 / 24 });","""sweep([[7.6, 0], [-7.6, 0]], roadMat, { vScale: 1 / 24 });
// lane markings: dashed white (3 m on / 9 m off), solid yellow left edge, solid white right edge line
{ const dash = canvasTex(8, 128, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(0, 0, w, 32); }, true);
  const mk = (c, map) => new THREE.MeshStandardMaterial({ color: c, map, alphaTest: map ? .5 : 0, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, emissive: c, emissiveIntensity: DAY ? .08 : .25 });
  const wm = mk(0xeeeeee, dash), ws = mk(0xeeeeee), ys = mk(0xe0b828);
  for (let k = 1; k <= 4; k++) { const d = -LANE * 1.5 + LANE * k; sweep([[d + .07, .02], [d - .07, .02]], wm, { vScale: 1 / 12, shift: false, use: i => NL[i] > k }); }
  sweep([[-5.47, .02], [-5.65, .02]], ys, { shift: false, k: 2 }); sweep([[4.65, .02], [4.47, .02]], ws, { k: 2 }); }""")
# 5 physics, autopilot, traffic
rep("const lim = EDGE - .95; if (Math.abs(S.d) > lim)","const lim = S.d > 0 ? 6.4 + exrAt(S.s) : EDGE - .95; if (Math.abs(S.d) > lim)")
rep("tgt = clamp(tgt, -EDGE + 1.3, EDGE - 1.3);","tgt = clamp(tgt, -EDGE + 1.3, laneD(nlAt(S.s) - 1) + .8);")
rep("const nl = clamp(c.lane + (Math.random() < .5 ? -1 : 1), 0, 2);","const nl = clamp(c.lane + (Math.random() < .5 ? -1 : 1), 0, nlAt(c.s) - 1);")
rep("c.d = lerp(c.d, LANES[c.lane], dt * .8);","if (c.lane > nlAt(c.s + 60) - 1) c.lane = nlAt(c.s + 60) - 1; c.d = lerp(c.d, LANES[c.lane], dt * .8);")
rep("c.lane = Math.floor(rnd(0, 3)); c.d","c.lane = Math.floor(rnd(0, nlAt(c.s))); c.d")
s=re.sub(r"LANES\[([^\]]+)\]",r"laneD(\1)",s)
rep("const HWY = i => !RAMP[i];\n","const HWY = i => !RAMP[i];\n"+open('/workspace/repo/loopsrc/realism_pre.js').read())
rep("[8.36, .55]], steel, { k: 1 });","[8.36, .55]], steel, { k: 1, use: i => !OPEN[i] });")
rep("const s = 6 + i * 12; frame(s, F);","const s = 6 + i * 12; if (OPEN[W(Math.floor(s / STEP))]) { m4.makeScale(0, 0, 0); pim.setMatrixAt(i, m4); rim.setMatrixAt(i, m4); continue; } frame(s, F);")
# 6 replace fake gantries with real exits / shields / ramps / landmarks
a=s.index("// ---------- overhead WSDOT-green sign gantries ----------"); b=s.index("// ---------- fir tree cards")
s=s[:a]+open('/workspace/repo/loopsrc/realism_scene.js').read()+"\n"+s[b:]
# guardrail/posts skip where a ramp touches the road
s=s.replace("window.__T = {","window.__jump = (s, d = 0) => { S.s = s; S.d = d; S.psi = 0; S.v = 0; camUpdate(.5, K); };\nwindow.__T = {")
open(F,'w').write(s); print('ok')
