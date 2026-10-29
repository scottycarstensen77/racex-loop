# Builds loop data for the full-loop game from the earlier OSM/USGS extraction in /workspace/racex-loop
import json,math,numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import cKDTree
SRC='/workspace/racex-loop/'
T=json.load(open(SRC+'track.json'));P=np.array(T['points'],float);H=np.array(json.load(open(SRC+'data/roadh.json')))
LB=T['labels'];BR=np.array(T['bridge'])
N0=len(P)
def csm(a,s): return gaussian_filter1d(np.concatenate([a[-300:],a,a[:300]]),s,axis=0)[300:-300]
# smooth xy (closed), resample 4 m
P=csm(P,3)
seg=np.hypot(*np.diff(np.vstack([P,P[:1]]),axis=0).T);cum=np.concatenate([[0],np.cumsum(seg)]);Ltot=cum[-1]
STEP=4;n=int(Ltot//STEP);Ltot=n*STEP;s=np.arange(n)*STEP*(cum[-1]/Ltot)
Pc=np.vstack([P,P[:1]]);Hc=np.concatenate([H,H[:1]])
x=np.interp(s,cum,Pc[:,0]);y=np.interp(s,cum,Pc[:,1]);h=np.interp(s,cum,Hc)
h=csm(h,6)
idx=np.clip(np.searchsorted(cum,s,side='right')-1,0,N0-1)
lab=[LB[i] for i in idx];br=BR[idx]
# curvature radius
pts=np.c_[x,y];t=np.roll(pts,-3,0)-np.roll(pts,3,0);ang=np.unwrap(np.arctan2(t[:,1],t[:,0]));k=np.abs(np.gradient(ang))/STEP
print('n',n,'len m',Ltot,'min radius',1/k.max(),'pts r<60:',(1/k<60).sum())
# sections
secs=[];cur=None
for i,l in enumerate(lab):
    if l!=cur: secs.append([l,i]);cur=l
print(secs)
grade=np.gradient(h)/STEP;print('max grade',np.abs(grade).max())
out={'step':STEP,'pts':[[round(a,1),round(-b,1),round(c,2)] for a,b,c in zip(x,y,h)],'secs':secs,'bridge':[int(v) for v in br]}
json.dump(out,open('/workspace/repo/loop.json','w'),separators=(',',':'))
# terrain: 20 m grid from carved 10 m dem2 (rows south->north). Output rows north->south? keep: row j = Y0+j*S (north coord)
G=np.load(SRC+'data/dem2.npy');X0,Y0=-5300,-4650
G2=G[::2,::2];S=20;ny,nx=G2.shape
gx=X0+np.arange(nx)*S;gy=Y0+np.arange(ny)*S;GX,GY=np.meshgrid(gx,gy)
kd=cKDTree(np.c_[x,y]);d,ii=kd.query(np.c_[GX.ravel(),GY.ravel()]);d=d.reshape(GX.shape);ii=ii.reshape(GX.shape)
rh=h[ii]-1.2;elev=br[ii]>0
near=(d<34)&~elev;G2=np.where(near,np.minimum(G2,rh),G2)
blend=(d>=34)&(d<60)&~elev;w=(d-34)/26;G2=np.where(blend,np.minimum(G2,rh*(1-w)+G2*w+0*w) ,G2)
G2=np.maximum(G2,-15)
open('/workspace/repo/terrain.bin','wb').write(np.round(G2*10).astype('<i2').tobytes())
mask=(d<45).astype(np.uint8)
# buildings from OSM
B=json.load(open(SRC+'data/bld.json'))['elements'];nodes={e['id']:(e['lon'],e['lat']) for e in B if e['type']=='node'}
lat0,lon0=45.64,-122.61;KX=111320*math.cos(math.radians(lat0));KY=110540
bl=[]
for e in B:
    if e['type']!='way' or 'building' not in e.get('tags',{}): continue
    if 'geometry' in e: c=[(g['lon'],g['lat']) for g in e['geometry']]
    else: c=[nodes[i] for i in e.get('nodes',[]) if i in nodes]
    if len(c)<3: continue
    q=np.array([((lo-lon0)*KX,(la-lat0)*KY) for lo,la in c]);cx,cy=q.mean(0)
    dd,_=kd.query([cx,cy])
    if dd<40 or dd>1500: continue
    # oriented size via PCA
    qq=q-q.mean(0);u,sv,vt=np.linalg.svd(qq,full_matrices=False);a=math.atan2(vt[0][1],vt[0][0])
    pr=qq@vt.T;w_=np.ptp(pr[:,0]);l_=np.ptp(pr[:,1])
    if w_<4 or l_<4: continue
    tg=e['tags'];ht=float(tg.get('height','0').split()[0] or 0) if tg.get('height','').replace('.','',1).split(' ')[0].isdigit() else 0
    if not ht: ht=float(tg['building:levels'])*3.2 if tg.get('building:levels','').isdigit() else (4+min(w_*l_,4000)/600)
    bl.append([round(cx,1),round(-cy,1),round(w_,1),round(l_,1),round(-a,3),round(min(ht,90),1),round(dd)])
bl.sort(key=lambda b:b[6]);print('buildings',len(bl))
json.dump({'grid':[X0,-Y0,S,nx,ny],'water':3.5,'bld':[b[:6] for b in bl[:6000]]},open('/workspace/repo/terrain.json','w'),separators=(',',':'))
