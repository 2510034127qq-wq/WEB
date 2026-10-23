"""Editable single-disc wheel, informed by Palace Museum Journal 2023/5, figs 14–16.
The 1.1m disc, four-legged cage and ceramic bearings follow the documented mechanism.
The raised working position and exact joinery are a game reconstruction, not an excavated copy.
"""
from pathlib import Path
import bpy,bmesh,math,json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name,color,rough=.8,texture=None):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
 if texture:
  for suffix,inp in [('diff','Base Color'),('rough','Roughness'),('nor_gl','Normal')]:
   n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(ROOT/'public/assets/craft-surfaces'/f'{texture}_{suffix}.jpg'),check_existing=True)
   if suffix!='diff':n.image.colorspace_settings.name='Non-Color'
   if suffix=='nor_gl':
    normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.35;m.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs[0],p.inputs[inp])
   else:m.node_tree.links.new(n.outputs['Color'],p.inputs[inp])
 return m
wood=material('wheel_timber',(.3,.22,.15),.82,'solidwood')
working=wood.copy();working.name='wheel_working_surface'
ceramic=material('wheel_ceramic_bearing',(.18,.16,.11),.28,'earthenware')
fiber=material('wheel_hemp_binding',(.32,.25,.15),.95,'linen')

def group(name):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);return o
turning=group('wheel_turning');fixed=group('wheel_fixed')
def mesh(name,verts,faces,mat,parent,uv=None,bevel=0,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.parent=parent;me.materials.append(mat)
 layer=me.uv_layers.new(name='SurfaceUV')
 for p in me.polygons:
  p.use_smooth=smooth
  for li in p.loop_indices:
   vi=me.loops[li].vertex_index;v=verts[vi]
   layer.data[li].uv=uv(p,v) if callable(uv) else uv[vi] if uv else (v[2]/.6,v[0]/.6)
 if bevel:
  bpy.context.view_layer.objects.active=o
  b=o.modifiers.new('Worked_arris','BEVEL');b.width=bevel;b.segments=4;b.limit_method='ANGLE';b.angle_limit=.35;bpy.ops.object.modifier_apply(modifier=b.name)
  n=o.modifiers.new('Broad_surface_normals','WEIGHTED_NORMAL');n.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=n.name)
 return o

def clipped(poly,edge,greater):
 out=[]
 for i,a in enumerate(poly):
  b=poly[(i+1)%len(poly)];ia=a[1]>=edge if greater else a[1]<=edge;ib=b[1]>=edge if greater else b[1]<=edge
  if ia:out.append(a)
  if ia!=ib:
   t=(edge-a[1])/(b[1]-a[1]);out.append((a[0]+t*(b[0]-a[0]),edge))
 return out

# Individually fitted boards carry continuous grain along their length. Edge
# radii, 0.5mm joints and modest widthwise cup are manufactured features.
edges=[-.55,-.415,-.267,-.122,.029,.179,.328,.453,.55]
for i,(low,high) in enumerate(zip(edges,edges[1:])):
 polygon=[(.55*math.cos(j/512*math.tau),.55*math.sin(j/512*math.tau)) for j in range(512)]
 polygon=clipped(clipped(polygon,low+.00025,True),high-.00025,False);n=len(polygon)
 verts=[(x,y-.00045*(math.cos((z-low)/(high-low)*math.pi*2)+1),z) for y in [0,-.063] for x,z in polygon]
 faces=[tuple(range(n-1,-1,-1)),tuple(n+j for j in range(n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
 def disc_uv(face,v,phase=i):
  x,y,z=v
  if abs(face.normal.z)>.8:return(z/.6+phase*.193,x/.6+phase*.317)
  # Vertical board edges need a real thickness axis; reusing top-face UVs
  # collapses their area to zero and destroys the tangent-space normal frame.
  run=x if abs(face.normal.y)>abs(face.normal.x) else z
  return(y/.6+phase*.193,run/.6+phase*.317)
 ob=mesh(f'Fitted_disc_board_{i+1}',verts,faces,wood,turning,disc_uv,.0014)
 ob.data.materials.append(working)
 for p in ob.data.polygons:
  if p.normal.z>.95:p.material_index=1

def strut(name,a,b,width,depth,parent):
 A,B=Vector(a),Vector(b);axis=(B-A).normalized();u=axis.cross(Vector((0,0,1)))
 if u.length<.01:u=axis.cross(Vector((0,1,0)))
 u.normalize();v=axis.cross(u).normalized();L=(B-A).length;verts=[];uv=[]
 for t in [0,.08,.92,1]:
  for i,j in [(-1,-1),(1,-1),(1,1),(-1,1)]:
   q=A.lerp(B,t)+u*i*width*.5+v*j*depth*.5;verts.append(tuple(q));uv.append(((i*width+j*depth)/.6,t*L/.6))
 faces=[(3,2,1,0),(12,13,14,15)]+[(r*4+k,r*4+(k+1)%4,(r+1)*4+(k+1)%4,(r+1)*4+k) for r in range(3) for k in range(4)]
 def strut_uv(face,q):
  delta=Vector(q)-A;normal=Vector((face.normal.x,face.normal.z,-face.normal.y))
  if abs(normal.dot(axis))>.8:return(delta.dot(u)/.6,delta.dot(v)/.6)
  cross=v if abs(normal.dot(u))>abs(normal.dot(v)) else u
  return(delta.dot(cross)/.6,delta.dot(axis)/.6)
 return mesh(name,verts,faces,wood,parent,strut_uv,.0018)

def lathe(name,profile,mat,parent,n=160):
 verts=[];uv=[];faces=[];distance=0
 for i,(r,y) in enumerate(profile):
  if i:distance+=math.hypot(r-profile[i-1][0],y-profile[i-1][1])
  for j in range(n+1):
   a=j/n*math.tau;verts.append((r*math.cos(a),y,r*math.sin(a)));uv.append((j/n*math.tau*max(r,.01)/.6,distance/.6))
 for i in range(len(profile)-1):
  for j in range(n):
   a=i*(n+1)+j
   if profile[i][0]==0:faces.append((a,a+n+2,a+n+1))
   elif profile[i+1][0]==0:faces.append((a,a+1,a+n+1))
   else:faces.append((a,a+1,a+n+2,a+n+1))
 return mesh(name,verts,faces,mat,parent,uv,smooth=True)

# Two mortised cross battens tie all the disc boards together underneath.
for x in [-.21,.21]:strut('Underside_cross_batten',(x,-.085,-.41),(x,-.085,.41),.06,.045,turning)
# Four cage legs connect the disc to the lower ceramic radial bearing.
for j in range(4):
 a=j/4*math.tau+math.pi/4
 strut('Cage_leg',(.075*math.cos(a),-.045,.075*math.sin(a)),(.101*math.cos(a),-.47,.101*math.sin(a)),.028,.032,turning)
lathe('Ceramic_thrust_cap',[(0,-.061),(.047,-.061),(.061,-.074),(.062,-.10),(.061,-.122),(.052,-.125),(.043,-.118),(.041,-.09),(.025,-.081),(0,-.079)],ceramic,turning)
lathe('Ceramic_radial_collar',[(.054,-.449),(.062,-.444),(.086,-.444),(.091,-.449),(.091,-.481),(.086,-.486),(.059,-.486),(.054,-.48),(.054,-.449)],ceramic,turning)
# Fixed, ground-anchored post; the rounded replaceable top meets the thrust cap.
lathe('Ground_anchored_post',[(0,-.96),(.053,-.96),(.053,-.8),(.052,-.45),(.049,-.17),(.044,-.12),(.04,-.091),(.025,-.079),(0,-.078)],wood,fixed,96)
# Real helical cord section binds the cage around the radial collar.
verts=[];uv=[];faces=[];segments=640;sides=8
for j in range(segments+1):
 t=j/segments;a=t*math.tau*7;center=Vector((.115*math.cos(a),-.417-t*.041,.115*math.sin(a)))
 outward=Vector((math.cos(a),0,math.sin(a)))
 for k in range(sides+1):
  angle=k/sides*math.tau;q=center+outward*math.cos(angle)*.003+Vector((0,1,0))*math.sin(angle)*.003
  verts.append(tuple(q));uv.append((k/sides,t*32))
for j in range(segments):
 for k in range(sides):
  a=j*(sides+1)+k;faces.append((a,a+1,a+sides+2,a+sides+1))
mesh('Seven_turn_hemp_lashing',verts,faces,fiber,turning,uv,smooth=True)

for im in bpy.data.images:
 if im.source=='FILE':im.filepath=bpy.path.relpath(im.filepath,start=str(ROOT/'art'))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/potters-wheel.blend'))
# Batch by material within each moving assembly while leaving the authoring file intact.
for root in [turning,fixed]:
 groups={}
 for o in list(root.children):
  if o.type=='MESH':
   bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
   bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
 for o in list(root.children):
  if o.type=='MESH':groups.setdefault(o.data.materials[0].name,[]).append(o)
 for name,objects in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  if len(objects)>1:bpy.ops.object.join()
  objects[0].name=root.name+'_'+name
for mat in bpy.data.materials:
 if mat.use_nodes:
  for node in list(mat.node_tree.nodes):
   if node.type=='TEX_IMAGE':mat.node_tree.nodes.remove(node)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/potters-wheel.glb'),export_format='GLB',export_yup=True,export_animations=False)
(ROOT/'public/assets/wheel-provenance.json').write_text(json.dumps({'author':'Yaohuo project','source':'art/potters-wheel.blend',
 'reference':'https://www.dpm.org.cn/Uploads/File/2023/05/19/u6466da5a467d9.pdf','referencePages':'32-33, figures 14-16',
 'diameterMetres':1.1,'structure':'Single wooden disc, fixed post, ceramic thrust/radial bearings, four cage legs and cord binding',
 'limits':'Raised 0.78m game work position and exact joinery are interpretive; not a surveyed 1743 wheel. End-grain mapping still needs separate scan review.'},indent=2))
print('POTTERS_WHEEL_COMPLETE')
