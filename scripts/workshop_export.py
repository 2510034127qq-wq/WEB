"""Spatially partition delivery meshes so roofed timber never reflects open sky.
Keep every face, surface UV, lightmap UV and material; editable master stays joined.
"""
from pathlib import Path
import bpy,bmesh,json
ROOT=Path(__file__).resolve().parents[1]

def region(x,z):
 if abs(x)>9.1 or abs(z)>8.05:return 'outdoor'
 if z < -3.4:return 'clay' if x < -2.8 else 'paint' if x>2.8 else 'wheel'
 if z > 3.4:return 'supply' if x < -2.8 else 'kiln' if x>3.2 else 'display'
 return 'glaze' if x>4.3 else 'drying' if x < -4.3 else 'outdoor'

def export_workshop():
 records=[]
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH' or not o.data.materials:continue
  material=o.data.materials[0]
  if material.name=='courtyard_stone':continue
  # The integer face layer survives bmesh copies and lets us retain exact data.
  bm=bmesh.new();bm.from_mesh(o.data);layer=bm.faces.layers.int.new('delivery_region')
  normal_layer=bm.loops.layers.float_vector.new('delivery_corner_normal')
  for f in bm.faces:
   for loop,li in zip(f.loops,o.data.polygons[f.index].loop_indices):loop[normal_layer]=o.data.corner_normals[li].vector
  groups={}
  for f in bm.faces:
   c=o.matrix_world@f.calc_center_median();name=region(c.x,-c.y)
   if name not in groups:groups[name]=len(groups)
   f[layer]=groups[name]
  source_faces=len(bm.faces);retained=0
  for name,index in groups.items():
   part=bm.copy();tag=part.faces.layers.int.get('delivery_region')
   remove=[f for f in part.faces if f[tag]!=index]
   bmesh.ops.delete(part,geom=remove,context='FACES')
   loose=[v for v in part.verts if not v.link_faces]
   if loose:bmesh.ops.delete(part,geom=loose,context='VERTS')
   retained+=len(part.faces);part.faces.layers.int.remove(tag)
   me=bpy.data.meshes.new(o.name+'_'+name);part.to_mesh(me);part.free()
   normals=me.attributes.get('delivery_corner_normal')
   me.normals_split_custom_set([tuple(n.vector) for n in normals.data]);me.attributes.remove(normals)
   ob=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(ob)
   ob.matrix_world=o.matrix_world.copy();ob['lightingRegion']=name
   for m in o.data.materials:me.materials.append(m)
  assert retained==source_faces
  records.append({'material':material.name,'sourceFaces':source_faces,'retainedFaces':retained,'regions':list(groups)})
  bm.free();bpy.data.objects.remove(o,do_unlink=True)
 for m in bpy.data.materials:
  if m.use_nodes:
   for n in list(m.node_tree.nodes):
    if n.type=='TEX_IMAGE':m.node_tree.nodes.remove(n)
 bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if o.type=='MESH':o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/workshop.glb'),export_format='GLB',export_yup=True,export_apply=True,use_selection=True,export_extras=True)
 (ROOT/'qa/workshop-partition.json').write_text(json.dumps(records,indent=2))

if __name__=='__main__':
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/workshop.blend'))
 export_workshop()
