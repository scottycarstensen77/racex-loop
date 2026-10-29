import asyncio,sys,time,json,math
from playwright.async_api import async_playwright
Q=sys.argv[1] if len(sys.argv)>1 else '?auto&low'
OUT=sys.argv[2] if len(sys.argv)>2 else 'shots'
async def run():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=await b.new_page(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=1.5)
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda c:c.type in('error',) and errs.append(c.text))
    await pg.goto('http://localhost:8788/'+Q,timeout=120000)
    await pg.wait_for_function("window.__ready",timeout=200000)
    await pg.screenshot(path=f'{OUT}/loop-start.png',timeout=240000)
    await pg.click('#go'); await pg.wait_for_timeout(3000)
    fps=await pg.evaluate("window.__fps"); print('fps (swiftshader, headless)',fps)
    shot=set(); t0=time.time(); last=None
    for k in range(400):
      r=await pg.evaluate("(()=>{const r=__sim(4);const f=__T.frame(__S.s);const pl=__T.player;const c=__cam.position;const fw=[Math.sin(f.h),Math.cos(f.h)];const behind=(pl.position.x-c.x)*fw[0]+(pl.position.z-c.z)*fw[1];let dy=pl.rotation.y-f.h;dy=Math.atan2(Math.sin(dy),Math.cos(dy));return {...r,behind,dy,nm:__S.nm,score:__S.score,top:__S.top,nan:[pl.position.x,pl.position.y,pl.position.z].some(isNaN)}})()")
      if k%10==0: print(k,json.dumps({a:(round(v,2) if isinstance(v,float) else v) for a,v in r.items()}),flush=True)
      if r['nan']: print('NAN!');break
      hw=r['hw']
      if hw!=last:
        last=hw; await pg.evaluate("__sim(6)"); await pg.wait_for_timeout(1500)
        name=hw.lower().replace('-','')
        if name in shot: name+='-lap'
        shot.add(name); await pg.screenshot(path=f'{OUT}/loop-{name}.png',timeout=240000); print('SHOT',name,r,flush=True)
      if not r['run']: print('ended',r);break
    print('done',r,'secs',time.time()-t0); print('ERR',errs[:8]); await b.close()
asyncio.run(run())
