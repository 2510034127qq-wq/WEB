"""Craft-led structural meshes: mortised timber, lapped clay tiles and radial kiln masonry.
Not random vertex noise: bow is across sawn boards, taper follows dressed timber,
joinery locates load paths, and ceramic shrinkage follows throwing courses.
"""
import bpy,bmesh,math
from mathutils import Vector

def install(ns):
 global xyz,finish,wood,wall,ground,brick,roof,clay,porcelain,linen,iron,stone_plinth
 globals().update({k:ns[k] for k in ['xyz','finish','wood','wall','ground','brick','roof','clay','porcelain','linen','iron']})
 stone_plinth=ground.copy();stone_plinth.name='stone_plinth'
 ns.update({'box':box,'beam':beam,'table':table,'roof_shed':roof_shed,'vessel':vessel,'kiln_vault':kiln_vault,'production_racks':production_racks})

def mesh(name,verts,faces,mat,uvs=None,smooth=False,bevel=0):
 me=bpy.data.meshes.new(name);me.from_pydata([xyz(v) for v in verts],[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);finish(o,name,mat)
 uv=me.uv_layers.new(name='SurfaceUV')
 for p in me.polygons:
  p.use_smooth=smooth
  for li in p.loop_indices:
   vi=me.loops[li].vertex_index;v=verts[vi]
   if uvs:uv.data[li].uv=uvs[vi]
   else:
    axis=max(range(3),key=lambda i:abs(p.normal[i]));a=[i for i in range(3) if i!=axis];co=me.vertices[vi].co;uv.data[li].uv=(co[a[0]]/1.4,co[a[1]]/1.4)
 if bevel:
  bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('tool_softened_arris','BEVEL');mod.width=bevel;mod.segments=3;mod.affect='EDGES';bpy.ops.object.modifier_apply(modifier=mod.name)
  mod=o.modifiers.new('weighted_surface_normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def box(name,p,size,m,bevel=.01):
 # Sawn boards have a tiny widthwise cup and compress at their bearing ends.
 w,h,d=size;long=0 if w>=d and w>=h else 2 if d>=h else 1
 verts=[];uv=[];faces=[];N=8 if m==wood and max(size)>.4 else 1
 axes=[k for k in range(3) if k!=long];aa,bb=axes
 for j in range(N+1):
  t=j/N-.5
  for a,b in [(-1,-1),(-1,1),(1,1),(1,-1)]:
   q=list(p);q[long]+=t*size[long];q[aa]+=a*size[aa]*.5;q[bb]+=b*size[bb]*.5
   if m==wood and long!=1:
    q[1]+=math.sin((t+.5)*math.pi)*min(.004,max(size)*.00065)
   verts.append(q);uv.append(((t+.5)*size[long]/1.4,((a+b+2)/4)*max(size[aa],size[bb])/1.4+.117))
 for j in range(N):
  for k in range(4):faces.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
 faces += [(3,2,1,0),(N*4,N*4+1,N*4+2,N*4+3)]
 o=mesh(name,verts,faces,m,uv if m==wood else None,False,min(bevel,min(size)*.2))
 # Keep per-face metric grain; adjacent boards start at different real sample strips.
 if m==wood:
  sample=(sum(ord(c) for c in name)+int(abs(p[0]*13+p[2]*19)))%8
  strip=[.034,.123,.205,.288,.371,.463,.548,.633][sample]
  world_axis=[0,2,1][long]
  start=xyz(p)[world_axis]-size[long]/2
  for f in o.data.polygons:
   axis=max(range(3),key=lambda i:abs(f.normal[i]));a=[i for i in range(3) if i!=axis]
   for li in f.loop_indices:
    co=o.data.vertices[o.data.loops[li].vertex_index].co
    cross=next(a for a in range(3) if a!=world_axis and abs(f.normal[a])<.8)
    cross_size=max(.02,max(size[a] for a in range(3) if a!=long))
    u=(co[world_axis]-start)/max(size[long],.03)*.91+.04
    v=strip+max(0,min(1,(co[cross]-xyz(p)[cross])/cross_size+.5))*.045
    o.data.uv_layers[0].data[li].uv=(u,v)
 return o

def beam(name,a,b,r,m):
 A,B=Vector(a),Vector(b);axis=(B-A).normalized();u=axis.cross(Vector((0,1,0)))
 if u.length<.1:u=axis.cross(Vector((1,0,0)))
 u.normalize();v=axis.cross(u).normalized();L=(B-A).length;verts=[];uv=[];faces=[];sides=24;segments=max(4,int(L*5))
 for j in range(segments+1):
  t=j/segments;center=A.lerp(B,t)
  # Dressed timber gently tapers, with broad axe facets rather than white-noise damage.
  radius=r*(1-.055*t)
  for k in range(sides):
   angle=k/sides*math.tau;facet=1+.014*math.cos(angle*5+.4)*math.sin(math.pi*t)
   q=center+(u*math.cos(angle)+v*math.sin(angle))*radius*facet
   verts.append(tuple(q));uv.append((t*.94+.03,.13+k/sides*.045))
 for j in range(segments):
  for k in range(sides):faces.append((j*sides+k,j*sides+(k+1)%sides,(j+1)*sides+(k+1)%sides,(j+1)*sides+k))
 faces.extend([tuple(range(sides-1,-1,-1)),tuple(segments*sides+k for k in range(sides))])
 return mesh(name,verts,faces,m,uv,True,0)

def table(x,z,w=2.4,d=1.15,h=.92):
 # Frame-and-panel work bench: separate heavy boards, trestle legs, tenons and pegs.
 widths=[.23,.245,.205,.235,.21];factor=d/sum(widths);edge=z-d/2
 for i,wi in enumerate(widths):
  width=wi*factor
  box('bench_worktop_board_%d'%i,(x,h-.008*(i==2),edge+width/2),(w,.07,width-.003),wood,.0045);edge+=width
 for side in [-1,1]:
  xx=x+side*(w/2-.22)
  for zz in [z-d/2+.13,z+d/2-.13]:
   # Socketed leg + shoulder carrying the top, deliberately not a solid slab apron.
   box('bench_leg',(xx,h/2-.018,zz),(.105,h-.07,.105),wood,.003)
   box('leg_tenon_shoulder',(xx,h-.1,zz),(.14,.10,.14),wood,.004)
   for yp in [.24,h-.16]:beam('oak_drawbore_peg',(xx-.066,yp,zz),(xx+.066,yp,zz),.009,wood)
  box('bench_end_rail',(xx,.23,z),(.07,.09,d-.13),wood,.003)
  box('bench_end_apron',(xx,h-.13,z),(.07,.17,d-.1),wood,.003)
 for zz in [z-d/2+.12,z+d/2-.12]:box('bench_long_apron',(x,h-.13,zz),(w-.22,.17,.065),wood,.003)
 box('bench_low_stretcher',(x,.24,z),(w-.25,.085,.07),wood,.003)


def tile_patch(cx,cz,w,d,h,side):
 # Alternate concave pan tiles and convex cover tiles with a solid 11mm fired section.
 verts=[];uv=[];faces=[];step=.205;run=d/2+.36;slope=.73/run;columns=math.ceil((w+.45)/step);rows=math.ceil(run/.245)
 for col in range(columns):
  for row in range(rows):
   x=cx-(w+.45)/2+col*step;zz=cz+side*row*.245;yy=h+.79-row*.245*slope
   for cap in [False,True]:
    base=len(verts);R=.112 if not cap else .062;span=math.pi*.84
    for layer in [0,1]:
     for end in [0,1]:
      for k in range(9):
       a=-span/2+k/8*span;xx=x+(.102 if cap else 0)+R*math.sin(a)
       arc=(math.cos(a)*R if cap else -math.cos(a)*R)+(.053 if cap else .085)
       y=yy+arc-end*.33*slope-layer*.011
       z=zz+side*end*.33
       verts.append((xx,y,z));uv.append(((col%7)*.13+k/8*.11,(row%6)*.15+end*.14))
    for k in range(8):
     faces.append((base+k,base+k+1,base+10+k,base+9+k));faces.append((base+18+k,base+27+k,base+28+k,base+19+k))
     for end in [0,1]:
      q=base+end*9+k;faces.append((q,q+18,q+19,q+1))
    for k in [0,8]:faces.append((base+k,base+9+k,base+27+k,base+18+k))
 return mesh('solid_lapped_pan_and_cover_tiles',verts,faces,roof,uv,True,0)

def roof_shed(cx,cz,w,d,h):
 columns=[cx-w/2+.18,cx-w/6,cx+w/6,cx+w/2-.18] if w>10 else [cx-w/2+.18,cx+w/2-.18]
 for x in columns:
  for z in [cz-d/2+.15,cz+d/2-.15]:
   box('stone_column_plinth',(x,.12,z),(.31,.24,.31),stone_plinth,.035)
   beam('hewn_timber_post',(x,.23,z),(x,h-.02,z),.104,wood)
   # The post itself enters the underside of the transverse beam. A drawbore
   # crosses this bearing; no decorative cube is used to imply a joint.
   beam('column_head_drawbore',(x-.121,h-.10,z),(x+.121,h-.10,z),.012,wood)
  beam('tie_beam',(x,h-.08,cz-d/2),(x,h-.08,cz+d/2),.11,wood)
  beam('king_strut',(x,h-.08,cz),(x,h+.71,cz),.08,wood)
  for side in [-1,1]:beam('braced_bearing',(x,h-.64,cz+side*(d/2-.15)),(x,h-.05,cz+side*(d/2-.78)),.058,wood)
 # Purlins run across structural frames; secondary rafters bear on them.
 for f in [-1,-.52,0,.52,1]:
  yy=h+.72-abs(f)*.73
  beam('longitudinal_purlin',(cx-w/2-.23,yy,cz+f*(d/2+.22)),(cx+w/2+.23,yy,cz+f*(d/2+.22)),.075,wood)
 for j in range(math.ceil(w/.39)+1):
  xx=cx-w/2+j*.39
  for side in [-1,1]:
   beam('secondary_roof_rafter',(xx,h+.73,cz),(xx,h-.08,cz+side*(d/2+.4)),.035,wood)
 for side in [-1,1]:
  tile_patch(cx,cz,w,d,h,side)
  beam('eaves_fascia',(cx-w/2-.25,h-.11,cz+side*(d/2+.37)),(cx+w/2+.25,h-.11,cz+side*(d/2+.37)),.04,wood)
 # Fired ridge covers, lapped end to end, with a hollow underside and closed arris.
 for j in range(math.ceil((w+.5)/.3)):
  vv=[];ff=[];uu=[];xx=cx-w/2-.25+j*.3
  for end in [0,1]:
   for rad in [.116,.104]:
    for k in range(17):
     a=k/16*math.pi;vv.append((xx+end*.326,h+.813+rad*math.sin(a),cz+rad*math.cos(a)));uu.append((j%8*.12+end*.105,k/16))
  for k in range(16):ff.extend([(k,k+1,35+k,34+k),(17+k,51+k,52+k,18+k),(k,17+k,18+k,k+1),(34+k,35+k,52+k,51+k)])
  ff.extend([(0,34,51,17),(16,33,67,50)])
  mesh('overlapped_ridge_cover',vv,ff,roof,uu,True)


def vessel(name,p,profile,m):
 # Hollow turned body; subdivisions respect the designed profile and thrown bands.
 pts=[]
 for i in range(len(profile)-1):
  a,b=profile[i:i+2];count=max(1,int(abs(b[1]-a[1])/.009))
  for j in range(count):
   t=j/count;pts.append((a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t))
 pts.append(profile[-1]);N=128;verts=[];faces=[];uv=[]
 for r,h in pts:
  for j in range(N):
   a=j/N*math.tau
   # Soft throwing courses, slight wheel eccentricity; same shift on inner/outer walls.
   e=(math.sin(h*81)*.00055+math.sin(h*37+.6)*.0008)*(min(r/.04,1))
   rad=max(0,r+e);lean=.0018*math.sin(h*4)
   verts.append((p[0]+rad*math.cos(a)+lean,p[1]+h,p[2]+rad*math.sin(a)));uv.append((j/N,h/max(.01,pts[-1][1],max(v[1] for v in pts))))
 for i in range(len(pts)-1):
  for j in range(N):faces.append((i*N+j,i*N+(j+1)%N,(i+1)*N+(j+1)%N,(i+1)*N+j))
 return mesh(name,verts,faces,m,uv,True)


def kiln_vault(cx=6,cz=5.8):
 # Radial masonry laid on an uninterrupted load-bearing arch, with real mortar gaps.
 n=23;rows=14;inner=1.40;outer=1.65;ybase=.97;front=3.94;step=.274
 for row in range(rows):
  for col in range(n):
   a0=col*math.pi/n+.0025;a1=(col+1)*math.pi/n-.0025;z0=front+row*step+.004;z1=z0+step-.008
   verts=[]
   for z in [z0,z1]:
    for r in [inner,outer]:
     for a in [a0,a1]:verts.append((cx+r*math.cos(a),ybase+r*math.sin(a),z))
   faces=[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]
   o=mesh('radial_kiln_voussoir',verts,faces,brick,None,False,.0035)
   # Each geometric brick samples one brick face, never the whole masonry photograph.
   for face in o.data.polygons:
    for ii,li in enumerate(face.loop_indices):
     # Bevel creates tris and n-gons: project by the dominant face normal,
     # preserving winding instead of assigning a crossing four-corner sequence.
     ax=max(range(3),key=lambda a:abs(face.normal[a]));axes=[a for a in range(3) if a!=ax]
     coords=[o.data.vertices[o.data.loops[l].vertex_index].co for l in face.loop_indices]
     co=o.data.vertices[o.data.loops[li].vertex_index].co
     uv=[]
     for a in axes:
      lo=min(c[a] for c in coords);hi=max(c[a] for c in coords);uv.append((co[a]-lo)/max(.00001,hi-lo))
     o.data.uv_layers[0].data[li].uv=(.33+uv[0]*.145,.905-(row%7)*.143+uv[1]*.032)
 # Inset refractory mortar arch closes every joint while preserving the relief.
 verts=[];faces=[]
 for zz in [front+.012,front+rows*step-.01]:
  for r in [inner+.01,outer-.012]:
   for i in range(97):
    a=i/96*math.pi;verts.append((cx+r*math.cos(a),ybase+r*math.sin(a),zz))
 for i in range(96):
  faces.extend([(i,i+1,97+i+1,97+i),(194+i,291+i,291+i+1,194+i+1),(i,194+i,194+i+1,i+1),(97+i,97+i+1,291+i+1,291+i)])
 return mesh('kiln_mortar_bedding',verts,faces,clay,None,False)


def production_racks():
 # Dense staging behind work positions, outside navigation/carrying lanes.
 for cx in [-5.6,0,5.4]:
  for x in [cx-1.17,cx+1.17]:beam('ware_rack_post',(x,.03,-7.18),(x,2.25,-7.18),.045,wood)
  for level,y in enumerate([.45,.96,1.47,1.98]):
   box('ware_staging_plank',(cx,y,-7.02),(2.45,.033,.39),wood,.003)
   for x in [cx-1.15,cx+1.15]:beam('shelf_bracket',(x,y-.27,-7.18),(x,y-.02,-6.81),.025,wood)
   for i in range(7):
    x=cx-.99+i*.32
    profile=[(0,0),(.041,0),(.048,.004),(.048,.013),(.051,.019),(.061,.029),(.076,.045),(.092,.066),(.106,.087),(.116,.105),(.118,.111),(.116,.115),(.111,.114),(.108,.107),(.099,.089),(.085,.069),(.069,.049),(.052,.033),(.041,.029),(0,.029)]
    # A batch shares a form. The newest boards are less dense, and stacked
    # foot rings leave real gaps instead of duplicating one display row.
    if level==3 and i in [1,5]:continue
    if level==0 and i%3==0:
     for stack in range(3):vessel('nested_porcelain_blanks',(x,y+.019+stack*.024,-7.02),profile,porcelain)
     continue
    vessel('staged_porcelain_blanks',(x,y+.019,-7.02),profile,porcelain)
 # Portable ware boards above the working bay, visibly resting on timber rails.
 for cx in [-5.6,5.4]:
  for j in range(3):box('stored_ware_board',(cx,2.45+j*.037,-6.92),(2.5,.027,.28),wood,.002)
  beam('board_store_bearing',(cx-1.15,2.39,-7.6),(cx-1.15,2.39,-6.58),.05,wood)
  beam('board_store_bearing',(cx+1.15,2.39,-7.6),(cx+1.15,2.39,-6.58),.05,wood)
