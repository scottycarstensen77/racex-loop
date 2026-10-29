# Whole-loop recognizability data -> osm.json additions: all exits (incl. route exits), street crossings, interchange links/mainlines, rail
import json,math,numpy as np
from scipy.spatial import cKDTree
SRC='/workspace/racex-loop/data/'
lat0,lon0=45.64,-122.61;KX=111320*math.cos(math.radians(lat0));KY=110540
Wc=lambda c:((c['lon']-lon0)*KX,-(c['lat']-lat0)*KY)
LP=json.load(open('/workspace/repo/loop.json'));pts=np.array(LP['pts']);N=len(pts);XZ=pts[:,:2];BRG=LP['bridge']
secs=LP['secs'];lab=['']*N
for k,(nm,i0) in enumerate(secs):
    for i in range(i0,secs[k+1][1] if k+1<len(secs) else N):lab[i]=nm
tan=np.roll(XZ,-2,0)-np.roll(XZ,2,0);tan/=np.linalg.norm(tan,axis=1)[:,None];kd=cKDTree(XZ)
O=json.load(open('/workspace/repo/osm.json'))
H=json.load(open(SRC+'hwy.json'))['elements'];LM=json.load(open(SRC+'lm.json'))['elements']
links=[w for w in H if w['tags'].get('highway') in('motorway_link','trunk_link')]
named=[w for w in H if w['tags'].get('name') and w['tags'].get('highway') in('primary','secondary','tertiary','residential','unclassified','trunk')]
nseg=[];nnm=[]
for w in named:
    for c in w['geometry']:nseg.append(Wc(c));nnm.append(w['tags']['name'])
nk=cKDTree(np.array(nseg))
def g2(w):return np.array([Wc(c) for c in w['geometry']])
starts=cKDTree(np.array([Wc(w['geometry'][0]) for w in links]))
def chain(w):
    g=list(w['geometry'])
    for _ in range(6):
        e=g[-1];nx=[x for x in links if x is not w and abs(x['geometry'][0]['lat']-e['lat'])<1e-6 and abs(x['geometry'][0]['lon']-e['lon'])<1e-6]
        if not nx:break
        g+=nx[0]['geometry'][1:];w=nx[0]
    return np.array([Wc(c) for c in g])
# ---- exits: every motorway_junction on our carriageway
ex=[]
for j in LM:
    t=j.get('tags',{})
    if t.get('highway')!='motorway_junction':continue
    p=np.array(Wc(j));d,i=kd.query(p)
    if d>40:continue
    for wi in starts.query_ball_point(p,14):
        w=links[wi];q=chain(w);dd,_=kd.query(q)
        cl=np.concatenate([[0],np.cumsum(np.linalg.norm(np.diff(q,axis=0),axis=1))]);v=q[min(int(np.searchsorted(cl,30)),len(q)-1)]-q[0]
        if np.linalg.norm(v)<1 or v@tan[i]/np.linalg.norm(v)<.3:continue
        route=(dd>15).sum()<3
        tg=w['tags'];ds=tg.get('destination') or tg.get('exit_to') or ''
        names=[x.strip() for x in ds.replace(';','|').split('|') if x.strip()][:2]
        if not names and not route:
            _,k=nk.query(q[-1]);names=[nnm[k]]
        ex.append({'i':int(i),'ref':t.get('ref',''),'names':names,'dref':tg.get('destination:ref',''),'route':bool(route),'lab':lab[i]})
ex.sort(key=lambda e:e['i']);ex2=[]
for e in ex:
    m=[f for f in ex2 if abs(f['i']-e['i'])<25 and (f['ref']==e['ref'] or not e['ref'] or not f['ref'])]
    if m:
        f=m[0]
        if not f['names'] and e['names']:f['names']=e['names']
        if not f['ref'] and e['ref']:f['ref']=e['ref']
        continue
    ex2.append(e)
for e in ex2:print(e)
O['exits']=ex2
# ---- street crossings (segment intersection with loop polyline)
def inter(a,b,c,d):
    r=b-a;s=d-c;den=r[0]*s[1]-r[1]*s[0]
    if abs(den)<1e-9:return None
    t=((c-a)[0]*s[1]-(c-a)[1]*s[0])/den;u=((c-a)[0]*r[1]-(c-a)[1]*r[0])/den
    return (t,u) if 0<=t<=1 and 0<=u<=1 else None
xs=[]
for w in named:
    q=g2(w);dd,ii=kd.query(q)
    if dd.min()>200:continue
    for k in range(len(q)-1):
        a,b=q[k],q[k+1];_,i0=kd.query((a+b)/2)
        for i in range(i0-40,i0+40):
            c,d=XZ[i%N],XZ[(i+1)%N];r=inter(a,b,c,d)
            if r:
                tg=w['tags'];over=bool(tg.get('bridge')) and tg.get('layer','1')!='-1'
                under=bool(BRG[i%N]) or tg.get('tunnel') or tg.get('layer','0').startswith('-')
                if not over and not under:continue
                dirv=(b-a)/np.linalg.norm(b-a);P0=a+(b-a)*r[0]
                xs.append({'i':i%N,'name':tg['name'],'over':over,'x':round(float(P0[0]),1),'z':round(float(P0[1]),1),'dx':round(float(dirv[0]),3),'dz':round(float(dirv[1]),3),'len':round(float(np.linalg.norm(q[-1]-q[0])) if over else 0,1)})
xs.sort(key=lambda e:e['i']);x2=[]
for e in xs:
    if x2 and abs(e['i']-x2[-1]['i'])<12 and e['name']==x2[-1]['name']:continue
    x2.append(e)
for e in x2:print('X',e['i'],lab[e['i']],e['name'],'OVER' if e['over'] else 'under')
O['xing']=x2
# ---- interchange links + crossing mainlines
IC=[997,1600,4000,5460]
ck=cKDTree(XZ[IC]);rk=cKDTree(np.array([p for r in O['ramps'] for p in r['xz']]))
fly=[]
for w in H:
    hw=w['tags'].get('highway')
    if hw not in('motorway_link','motorway','trunk','trunk_link'):continue
    q=g2(w);dc,_=ck.query(q)
    if dc.min()>750:continue
    dd,_=kd.query(q)
    if np.median(dd)<(10 if 'link' in hw else 28):continue
    if 'link' in hw:
        dr,_=rk.query(q)
        if np.median(dr)<5:continue
    t=w['tags'];ln=int(t['lanes']) if t.get('lanes','').isdigit() else (1 if 'link' in hw else 3)
    fly.append({'g':[[round(a,1),round(b,1)] for a,b in q],'br':bool(t.get('bridge')),'ly':int(t.get('layer','1')) if t.get('layer','1').lstrip('-').isdigit() else 1,'w':round(min(ln,5)*3.7+2.4,1)})
print('fly',len(fly),sum(f['br'] for f in fly))
O['fly']=fly
# ---- rail near SR-14
R=json.load(open(SRC+'rail.json'))['elements'];rl=[]
for w in R:
    q=g2(w);dd,ii=kd.query(q)
    if dd.min()<320 and any(lab[x]=='SR-14' for x in ii):rl.append([[round(a,1),round(b,1)] for a,b in q])
print('rail',len(rl),sum(len(r) for r in rl))
O['rail']=rl
json.dump(O,open('/workspace/repo/osm.json','w'),separators=(',',':'))
