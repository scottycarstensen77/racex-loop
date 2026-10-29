import asyncio,sys
from playwright.async_api import async_playwright
SH=[(n,i*4,d,0) for n,i,d in [('w01-sr500-stjohns',433,0),('w02-i5-sr500',975,0),('w03-i5-downtown',1140,0),('w04-i5-ibridge',1500,-3.7),('w05-i5-sr14',1600,0),('w06-sr14-river-rail',2560,3.7),('w07-sr14-glenn',3770,0),('w07b-sr14-glenn',3820,0),('w08-sr14-i205',3960,0),('w09-i205-walls',4650,0),('w10-i205-sr500',5330,0),('w11-sr500-mall',5940,0)]]
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
