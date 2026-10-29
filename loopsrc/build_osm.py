# Real lanes / exits / ramps / landmarks from OSM for the loop -> osm.json
import json,math,numpy as np
from scipy.spatial import cKDTree
from scipy.ndimage import median_filter
SRC='/workspace/racex-loop/data/'
lat0,lon0=45.64,-122.61;KX=111320*math.cos(math.radians(lat0));KY=110540
W=lambda lat,lon:((lon-lon0)*KX,-(lat-lat0)*KY)   # world x,z
LP=json.load(open('/workspace/repo/loop.json'));pts=np.array(LP['pts']);N=len(pts);XZ=pts[:,:2]
secs=LP['secs'];lab=['']*N
for k,(nm,i0) in enumerate(secs):
    i1=secs[k+1][1] if k+1<len(secs) else N
    for i in range(i0,i1):lab[i]=nm
tan=np.roll(XZ,-2,0)-np.roll(XZ,2,0);tan/=np.linalg.norm(tan,axis=1)[:,None]
kd=cKDTree(XZ)
H=json.load(open(SRC+'hwy.json'))['elements'];LM=json.load(open(SRC+'lm.json'))['elements']
mw=[w for w in H if w['tags'].get('highway') in('motorway','trunk')]
links=[w for w in H if w['tags'].get('highway') in('motorway_link','trunk_link')]
# --- lanes: sample each motorway way, match to loop points with same direction
segp=[];segd=[];segl=[]
for w in mw:
    g=[W(c['lat'],c['lon']) for c in w['geometry']];ln=w['tags'].get('lanes')
    if not ln or not ln.isdigit():continue
    for a,b in zip(g,g[1:]):
        a=np.array(a);b=np.array(b);L=np.linalg.norm(b-a)
        if L<1:continue
        for t in np.arange(0,L,4):segp.append(a+(b-a)*t/L);segd.append((b-a)/L);segl.append(int(ln))
segp=np.array(segp);segd=np.array(segd);segl=np.array(segl);sk=cKDTree(segp)
lanes=np.zeros(N,int)
for i in range(N):
    for j in sk.query_ball_point(XZ[i],14):
        if segd[j]@tan[i]>.8:lanes[i]=max(lanes[i],segl[j])
# fill gaps along loop
for i in range(N):
    if lanes[i]==0:
        for d in range(1,200):
            if lanes[(i-d)%N]:lanes[i]=lanes[(i-d)%N];break
lanes=np.clip(lanes,2,5)
ext=np.concatenate([lanes[-60:],lanes,lanes[:60]]);lanes=median_filter(ext,size=61)[60:-60]
lanes=np.where(np.array(lab)=='Ramp',np.minimum(lanes,2),lanes)
print('lanes by section',{nm:np.bincount(lanes[[i for i in range(N) if lab[i]==nm]]).tolist() for nm,_ in secs})
# --- exits (junction nodes on our carriageway) + their link geometry
J=[e for e in LM if e.get('tags',{}).get('highway')=='motorway_junction']
def links_from(p,end=0):
    r=[]
    for w in links:
        g=w['geometry'];c=g[0] if end==0 else g[-1]
        if math.dist(W(c['lat'],c['lon']),p)<12:r.append(w)
    return r
def onloop(g):
    q=np.array([W(c['lat'],c['lon']) for c in g]);d,_=kd.query(q);return q,d
def dest(w):
    t=w['tags'];d=t.get('destination') or t.get('exit_to') or '';ref=t.get('destination:ref','')
    return [x.strip() for x in d.replace(';','|').split('|') if x.strip()][:2],ref
exits=[];ramps=[]
for j in J:
    p=W(j['lat'],j['lon']);d,i=kd.query(p)
    if d>30:continue
    for w in links_from(p):
        g=list(w['geometry'])
        for _ in range(4):
            e=g[-1];nx=[x for x in links if x is not w and abs(x['geometry'][0]['lat']-e['lat'])<1e-6 and abs(x['geometry'][0]['lon']-e['lon'])<1e-6]
            if not nx:break
            g+=nx[0]['geometry'][1:]
        q,dd=onloop(g)
        if not (w['tags'].get('destination') or w['tags'].get('exit_to')):
            for x in links:
                pass
        if (dd>15).sum()<3:continue   # it is our own route
        # direction check: link start heading roughly along loop
        cl=np.concatenate([[0],np.cumsum(np.linalg.norm(np.diff(q,axis=0),axis=1))]);v=q[min(int(np.searchsorted(cl,30)),len(q)-1)]-q[0]
        if np.linalg.norm(v)<1 or v@tan[i]/np.linalg.norm(v)<.3:continue

        names,ref=dest(w)
        exits.append({'i':int(i),'ref':j['tags'].get('ref',''),'names':names,'dref':ref,'lab':lab[i]})
        ramps.append({'i':int(i),'kind':'off','xz':[[round(a,1),round(b,1)] for a,b in q[:120]]})
# on-ramps merging into loop
for w in links:
    g=w['geometry'];q,dd=onloop(g)
    if dd[-1]<14 and (dd>18).sum()>=3:
        i=int(kd.query(q[-1])[1]);v=q[-1]-q[max(0,len(q)-4)]
        if np.linalg.norm(v)>1 and v@tan[i]/np.linalg.norm(v)>.5: ramps.append({'i':i,'kind':'on','xz':[[round(a,1),round(b,1)] for a,b in q[-120:]]})
# dedupe exits by index
exits.sort(key=lambda e:e['i']);ex2=[]
for e in exits:
    if ex2 and abs(e['i']-ex2[-1]['i'])<100:
        if not ex2[-1]['names'] and e['names']:ex2[-1]=e
        continue
    ex2.append(e)
exits=[e for e in ex2 if e['names']]
for e in exits:print(e)
print('ramps',len(ramps),sum(r['kind']=='on' for r in ramps))
# --- landmarks
def geom(w):return [[round(a,1),round(b,1)] for a,b in (W(c['lat'],c['lon']) for c in w['geometry'])]
lmk={'ibridge':[],'glenn':[],'towers':[],'pearson':None,'tall':[]}
for e in LM:
    t=e.get('tags',{});
    if e['type']!='way':continue
    nm=t.get('name','')
    if nm=='Interstate Bridge' and t.get('highway') in('motorway','trunk'):lmk['ibridge'].append({'g':geom(e),'mov':t.get('bridge')=='movable'})
    elif nm=='Glenn L. Jackson Memorial Bridge' and t.get('highway')=='motorway':lmk['glenn'].append(geom(e))
    elif t.get('man_made')=='water_tower':
        g=np.array(geom(e));c=g.mean(0)
        if abs(c[0])<9000 and abs(c[1])<9000:lmk['towers'].append([round(c[0],1),round(c[1],1)])
    elif t.get('aeroway')=='aerodrome':lmk['pearson']=geom(e)
    elif 'building' in t:
        try:h=float(t.get('height','0').split()[0])
        except:h=0
        if not h and t.get('building:levels','').isdigit():h=int(t['building:levels'])*3.5
        if h>=28:
            g=np.array(geom(e));c=g.mean(0);qq=g-c;u,s,vt=np.linalg.svd(qq,full_matrices=False);pr=qq@vt.T
            lmk['tall'].append([round(c[0],1),round(c[1],1),round(float(np.ptp(pr[:,0])),1),round(float(np.ptp(pr[:,1])),1),round(-math.atan2(vt[0][1],vt[0][0]),3),round(min(h,140),1)])
lmk['ibridge']=[b for b in lmk['ibridge'] if abs(b['g'][0][0])<9000]
lmk['glenn']=[b for b in lmk['glenn'] if abs(b[0][0])<20000]
print({k:(len(v) if v else v) for k,v in lmk.items() if k!='pearson'},'pearson',bool(lmk['pearson']))
json.dump({'lanes':lanes.tolist(),'exits':exits,'ramps':ramps,'lmk':lmk},open('/workspace/repo/osm.json','w'),separators=(',',':'))
