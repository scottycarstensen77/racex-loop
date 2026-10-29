import asyncio,sys
from playwright.async_api import async_playwright
SH=[('real-ibridge',1500*4,0,0),('real-i5-exit',4110,0,0),('real-sr14-glenn',3860*4,0,0),('real-i205-lanes',4300*4,0,0)]
async def run():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=await b.new_page(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=1.5)
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda c:c.type=='error' and errs.append(c.text))
    await pg.goto('http://localhost:8788/'+(sys.argv[1] if len(sys.argv)>1 else '?auto&low'),timeout=120000)
    await pg.wait_for_function("window.__ready",timeout=200000)
    await pg.click('#go'); await pg.wait_for_timeout(2000)
    for nm,s,d,_ in SH:
      await pg.evaluate(f"__jump({s},{d})"); await pg.evaluate("__sim(.6)"); await pg.wait_for_timeout(3500)
      await pg.screenshot(path=f'shots/{nm}.png',timeout=240000); print('SHOT',nm,flush=True)
    print('ERR',errs[:8]); await b.close()
asyncio.run(run())
