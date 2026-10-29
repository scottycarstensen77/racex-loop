import re,sys
def js(fn):
    s=open(fn).read()
    s=re.sub(r"\nconst cop = \{ m: copCar\(\)[^\n]*", "\nconst cop = { on: false, s: -999, d: 0 }; // cops removed", s)
    s=re.sub(r"\n  // heat & cop\n(.*\n)*?    u\.rs\.scale[^\n]*", "", s)
    s=re.sub(r" S\.heat = Math\.min\(5, S\.heat \+ \.?\d+\);", "", s)
    s=re.sub(r"\n  A\.siren\.g\.gain\.setTargetAtTime\([^\n]*\); \}", " }", s)
    s=re.sub(r"\n  heatBars\.forEach[^\n]*", "", s)
    s=re.sub(r"\nconst heatBars[^\n]*", "", s)
    s=s.replace(" if (cop.on) dot(cop.m.position, (S.t * 6) % 2 < 1 ? '#ff2030' : '#3060ff', 3);","")
    s=re.sub(r"\n  cop\.on = false; cop\.m\.visible = false; \}", " }", s)
    assert 'cop.m' not in s and 'heatBars' not in s and 'PURSUIT' not in s, fn
    open(fn,'w').write(s)
def html(fn):
    s=open(fn).read()
    s=s.replace('<div id="heat" class="hud">HEAT<div class="bars"><span></span><span></span><span></span><span></span><span></span></div>','<div id="heat" class="hud">')
    s=s.replace(' · go over 120 mph and the cops come','')
    s=s.replace('#heat{top:','#heat{color:#fff!important;top:')
    s=s.replace('#mm{display:block;margin:4px 0 0 auto;','#mm{display:block;position:relative;margin:8px 0 0 auto;')
    s=s.replace('#dist{font-size:10px;color:#ddd;margin-top:3px}','#dist{font-size:10px;color:#fff;margin-top:4px;line-height:14px;background:rgba(0,0,0,.45);padding:2px 6px;border-radius:6px;display:inline-block;white-space:nowrap}')
    assert 'HEAT' not in s and 'cops' not in s, fn
    open(fn,'w').write(s)
for f in sys.argv[1:]: (js if f.endswith('.js') else html)(f)
