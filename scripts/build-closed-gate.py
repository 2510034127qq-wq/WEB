"""An editable closed courtyard gate. Game metres: X/east, Y/up, Z/south.
Fitted vertical boards, supporting battens, diagonal braces, forged hinge straps,
wooden latch and stone threshold. Interpretive workshop joinery, not a measured
replica of a named historic building. Reuses the project's licensed PBR maps.
"""
from pathlib import Path
import bpy, bmesh, math, json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

def xyz(p):return (p[0],-p[2],p[1])
def material(name,colour,roughness,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*colour,1)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*colour,1)
 p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metal
 return m
wood=material('gate_timber',(.29,.22,.15),.86)
iron=material('gate_iron',(.065,.06,.05),.65,.7)
stone=material('gate_stone',(.32,.31,.28),.95)
plaster=material('gate_plaster',(.69,.68,.61),1)

def finish(o,name,mat,bevel=.002):
 o.name=name;o.data.materials.append(mat)
 # Metric box projection. Grain runs along each member, not across its joints.
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='SurfaceUV')
 uv.name='SurfaceUV'
 for face in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
  long=max(axes,key=lambda i:o.dimensions[i]);cross=next(i for i in axes if i!=long)
  for li in face.loop_indices:
   p=o.data.vertices[o.data.loops[li].vertex_index].co
   scale=.6 if mat==wood else 2.2 if mat==plaster else 2.8 if mat==stone else 1
   uv.data[li].uv=(p[cross]/scale+.173,p[long]/scale+.419)
 bpy.context.view_layer.objects.active=o
 if bevel:
  mod=o.modifiers.new('Worked_arris','BEVEL');mod.width=bevel;mod.segments=4
  bpy.ops.object.modifier_apply(modifier=mod.name)
 normal=o.modifiers.new('Broad_surface_normals','WEIGHTED_NORMAL');normal.keep_sharp=True
 bpy.ops.object.modifier_apply(modifier=normal.name)
 return o

def box(name,p,size,mat,bevel=.003):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object
 o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,mat,bevel)

def plank(name,x0,x1,y0,y1,z,bow):
 # A small seasoned lengthwise bow and widthwise cup, with constant thickness.
 verts=[];faces=[];rows=12;cols=4
 for face in [-1,1]:
  for r in range(rows+1):
   t=r/rows
   for c in range(cols+1):
    u=c/cols
    cup=.0012*(2*u-1)**2
    verts.append(xyz((x0+(x1-x0)*u,y0+(y1-y0)*t,z+face*.0275+bow*math.sin(math.pi*t)+cup)))
 layer=(rows+1)*(cols+1)
 for f in range(2):
  for r in range(rows):
   for c in range(cols):
    a=f*layer+r*(cols+1)+c;faces.append((a,a+1,a+cols+2,a+cols+1))
 for r in range(rows):
  for c in [0,cols]:
   a=r*(cols+1)+c;b=a+cols+1;faces.append((a,b,b+layer,a+layer))
 for r in [0,rows]:
  for c in range(cols):
   a=r*(cols+1)+c;faces.append((a,a+1,a+1+layer,a+layer))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 # Localise before metric projection so each plank can use a different real cut.
 centre=Vector(xyz(((x0+x1)*.5,(y0+y1)*.5,z)))
 for v in me.vertices:v.co-=centre
 o.location=centre;bpy.context.view_layer.update()
 return finish(o,name,wood,.0022)

def strut(name,a,b,width,depth):
 A,B=Vector(xyz(a)),Vector(xyz(b));delta=B-A
 bpy.ops.mesh.primitive_cube_add(size=1,location=(A+B)*.5);o=bpy.context.object
 o.dimensions=(width,depth,delta.length);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 finish(o,name,wood,.0025);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o

def rivet(name,p):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,radius=.011,location=xyz(p));o=bpy.context.object
 o.scale=(1,.46,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 finish(o,name,iron,.0004)
 for f in o.data.polygons:f.use_smooth=True

def strap(name,hinge,side,y):
 # Tapered forged end and round pin bosses, with a real 7 mm section.
 outline=[(0,-.043),(.08,-.043),(.30,-.025),(.39,-.038),(.425,0),(.39,.038),(.30,.025),(.08,.043),(0,.043)]
 verts=[xyz((hinge+side*x,y+dy,z)) for z in [7.854,7.861] for x,dy in outline];n=len(outline)
 faces=[tuple(range(n-1,-1,-1)),tuple(n+i for i in range(n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);finish(o,name,iron,.0013)
 for x in [.06,.2,.35]:rivet(name+'_rivet',(hinge+side*x,y,7.849))
 bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=.021,depth=.14,location=xyz((hinge,y,7.864)))
 finish(bpy.context.object,name+'_pin',iron,.0012)

# Existing south wall ends at x=+/-3 m. Infill returns bear the lintel; leaves do not.
for side in [-1,1]:
 box('Plastered_gate_return',(side*2.31,1.45,8),(1.42,2.9,.36),plaster,.012)
 box('Stone_jamb_foot',(side*1.54,.145,7.99),(.30,.29,.40),stone,.013)
 box('Mortised_gate_jamb',(side*1.54,1.58,7.99),(.20,2.66,.23),wood,.0045)
box('Gate_lintel',(0,2.84,7.99),(3.30,.22,.26),wood,.0045)
box('Rebated_stone_threshold',(0,.074,7.99),(3.34,.148,.40),stone,.014)
# The opaque meeting stile covers the centre joint between the two leaves.
for side in [-1,1]:
 left,right=(-1.43,-.006) if side<0 else (.006,1.43)
 for i in range(8):
  a=left+(right-left)*i/8+.0006;b=left+(right-left)*(i+1)/8-.0006
  plank(f'Leaf_{side}_fitted_board_{i}',a,b,.153,2.721,7.966,[.0018,-.0012,.0024,-.001,.0011,-.002,.0014,-.0008][i])
 for y in [.48,1.47,2.38]:
  box(f'Leaf_{side}_through_batten',((left+right)/2,y,7.902),(1.43,.105,.082),wood,.0025)
  for x in [left+.11,right-.11]:
   bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.009,depth=.09,location=xyz((x,y,7.9)),rotation=(math.pi/2,0,0))
   finish(bpy.context.object,'Flush_hardwood_peg',wood,.0007)
 strut(f'Leaf_{side}_diagonal_brace',(left+.12,.57,7.90),(right-.12,1.38,7.90),.075,.07)
 for y in [.48,2.38]:strap(f'Forged_hinge_{side}',side*1.43,-side,y)
box('Overlapping_meeting_stile',(.012,1.437,7.922),(.067,2.568,.038),wood,.002)
for x in [-.46,.43]:
 box('Latch_keeper_base',(x,1.22,7.849),(.055,.22,.012),iron,.0015)
 for y in [1.17,1.27]:box('Latch_keeper_standoff',(x,y,7.807),(.055,.015,.075),iron,.001)
 box('Latch_keeper_face',(x,1.22,7.768),(.055,.115,.012),iron,.0015)
 rivet('Keeper_pin',(x,1.305,7.839));rivet('Keeper_pin',(x,1.135,7.839))
box('Closed_wooden_crossbar',(-.07,1.22,7.807),(1.27,.073,.062),wood,.005)
box('Hand_worn_latch_stop',(.42,1.22,7.78),(.065,.10,.025),wood,.005)

scene=bpy.context.scene;scene['purpose']='Closed courtyard; no exterior woodland in runtime'
scene['openingMetres']=[2.86,2.568];scene['state']='closed and barred'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/closed-courtyard-gate.blend'))
# Four draw groups share the existing PBR textures at runtime. Keep the editable
# original members above in the Blender source, including their joinery names.
for mat in [wood,iron,stone,plaster]:
 objects=[o for o in scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.object.join();objects[0].name='closed_gate_'+mat.name
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/closed-courtyard-gate.glb'),export_format='GLB',export_yup=True,export_animations=False,export_apply=True)
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH')
(ROOT/'qa/closed-gate-asset.json').write_text(json.dumps({'source':'art/closed-courtyard-gate.blend','runtime':'public/assets/closed-courtyard-gate.glb','triangles':triangles,'materialGroups':4,'clearOpeningMetres':[2.86,2.568],'construction':'16 fitted 55 mm boards, timber jambs, supporting battens, bracing, metal hinges, closed latch, stone threshold','provenance':'Original interpretive geometry; existing licensed timber, plaster, iron and stone PBR maps are reused at runtime.'},indent=2))
print('CLOSED_GATE_COMPLETE',triangles,flush=True)
