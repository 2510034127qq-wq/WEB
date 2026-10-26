"""Place joints at actual mesh/plane section centres, not projected silhouettes."""
import json, numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'.tmp/user-hands-inspection.json').read_text())
path=ROOT/'scripts/hand-landmarks.json';landmarks=json.loads(path.read_text())
report={}
for side in ['left','right']:
    obj=next(o for o in data[side] if o['type']=='MESH');vertices=np.array(obj['positions'])
    triangles=np.array([[f[0],f[j],f[j+1]] for f in obj['faces'] for j in range(1,len(f)-1)])
    points=vertices[triangles];report[side]={}
    for name,chain in landmarks[side]['chains'].items():
        old=np.array(chain);report[side][name]=[]
        for j in [1,2]:
            origin=old[j];normal=old[j+1]-old[j-1];normal/=np.linalg.norm(normal)
            distance=(points-origin)@normal
            candidates=np.where((distance.min(axis=1)<0)&(distance.max(axis=1)>0))[0]
            nodes={};coords=[];graph={}
            def key(p):
                k=tuple(np.round(p/1e-6).astype(int))
                if k not in nodes:nodes[k]=len(coords);coords.append(p);graph[nodes[k]]=set()
                return nodes[k]
            for t in candidates:
                intersections=[]
                for a,b in [(0,1),(1,2),(2,0)]:
                    da,db=distance[t,a],distance[t,b]
                    if da*db<0:intersections.append(points[t,a]+(points[t,b]-points[t,a])*da/(da-db))
                if len(intersections)==2:
                    a,b=map(key,intersections);graph[a].add(b);graph[b].add(a)
            remaining=set(graph);sections=[]
            while remaining:
                stack=[remaining.pop()];component=[]
                while stack:
                    v=stack.pop();component.append(v)
                    for k in graph[v]:
                        if k in remaining:remaining.remove(k);stack.append(k)
                if len(component)<6:continue
                cloud=np.array([coords[k] for k in component]);center=cloud.mean(axis=0)
                # Trace closed contour and use its area centroid to avoid vertex-density bias.
                if all(len(graph[k])==2 for k in component):
                    ordered=[component[0]];previous=None;current=component[0]
                    while len(ordered)<=len(component):
                        following=next(k for k in graph[current] if k!=previous)
                        if following==ordered[0]:break
                        ordered.append(following);previous,current=current,following
                    cloud=np.array([coords[k] for k in ordered])
                    u=np.cross(normal,[1,0,0]);u/=np.linalg.norm(u);v=np.cross(normal,u)
                    xy=np.stack(((cloud-origin)@u,(cloud-origin)@v),axis=1);other=np.roll(xy,-1,axis=0)
                    cross=xy[:,0]*other[:,1]-other[:,0]*xy[:,1];area=cross.sum()
                    if abs(area)>1e-10:
                        c=((xy+other)*cross[:,None]).sum(axis=0)/(3*area);center=origin+u*c[0]+v*c[1]
                sections.append((np.linalg.norm(center-origin),center,len(component)))
            if not sections:raise RuntimeError((side,name,j,'no surface section'))
            distance,center,count=min(sections,key=lambda s:s[0])
            if distance>.06:
                report[side][name].append({'joint':j,'status':'section joins palm; retain landmark','moveSourceUnits':distance});continue
            chain[j]=[round(float(v),8) for v in center]
            report[side][name].append({'joint':j,'before':origin.tolist(),'after':chain[j],'sectionPoints':count,'moveSourceUnits':distance})
path.write_text(json.dumps(landmarks,indent=2))
(ROOT/'qa/hand-joint-sections.json').write_text(json.dumps(report,indent=2))
