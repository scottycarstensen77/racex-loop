s=open('loop.js').read()
def rep(a,b):
    global s; assert a in s,a[:60]; s=s.replace(a,b,1)
rep("import { RoomEnvironment }","import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';\nimport { RoomEnvironment }")
# softer daylight / haze
rep("R.toneMappingExposure = DAY ? .95","R.toneMappingExposure = DAY ? 1.0")
rep("new THREE.FogExp2(0xb9cfe2, 0.00011)","new THREE.FogExp2(0xc9d6e2, 0.00017)")
rep("new THREE.Color(DAY ? 0x9cc2e6","new THREE.Color(DAY ? 0xaecbe6")
# cockpit + glare + roadside, after player creation
rep("const player = new THREE.Group(); player.rotation.order = 'YXZ'; scene.add(player);",
r"""const player = new THREE.Group(); player.rotation.order = 'YXZ'; scene.add(player);
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
  const tog = e => { e && e.preventDefault(); COCKPIT = !COCKPIT; localStorage.racexCam = COCKPIT ? 'cockpit' : 'chase'; }; b.addEventListener('pointerdown', tog); document.body.appendChild(b); addEventListener('keydown', e => { if (e.code === 'KeyC') tog(); }); }""")
rep("function camUpdate(dt, k) {\n", r"""function camUpdate(dt, k) {
  ckp.visible = COCKPIT; player.visible = !COCKPIT || !S.run && !S.done ? !COCKPIT : false; if (!COCKPIT && !player.visible) player.visible = true;
  if (scene.userData.flareL) scene.userData.flareL.position.copy(cam.position).addScaledVector(SUN, 9000);
  if (COCKPIT && (S.run || S.done)) { frame(S.s, F); const v = S.v, yaw = player.rotation.y, sy = Math.sin(yaw), cy = Math.cos(yaw);
    // left-hand-drive seat: ~0.36 m left of centre, slightly behind middle, eye at 1.1 m
    const t = S.t, bob = Math.min(1, v / 40); tmp.copy(player.position); tmp.x += sy * -.15 - cy * .36; tmp.z += cy * -.15 + sy * .36; tmp.y += 1.1 + Math.sin(t * 7.3) * .012 * bob + Math.sin(t * 13.1) * .006 * bob;
    const sh = S.shake * .12; tmp.x += rnd(-sh, sh); tmp.y += rnd(-sh, sh) * .5; cam.position.copy(tmp);
    const sway = (S.yawVis || 0) * .4 + Math.sin(t * 1.9) * .006 * bob; tmp2.set(tmp.x + Math.sin(yaw + sway) * 40, tmp.y - .9 + (at(S.s + 40, 0, 0).y - player.position.y), tmp.z + Math.cos(yaw + sway) * 40); cam.lookAt(tmp2);
    cam.rotateZ(clamp(-(S.yawVis || 0) * .25, -.05, .05) + Math.sin(t * 5.1) * .003 * bob);
    const fov = (innerWidth / innerHeight > 1.9 ? 64 : 70) + clamp(v - 8, 0, 80) * .13 + (k.nosOn ? 6 : 0); cam.fov = lerp(cam.fov, fov, dt * 3); cam.updateProjectionMatrix(); fitCockpit(); return; }
  if (COCKPIT) ckp.visible = false;
""")
open('loop.js','w').write(s)
