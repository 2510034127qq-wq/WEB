"""Prepare the authored Poly Haven pine for the inaccessible woodland, keeping
the source file and 4K material maps. A 15m+ LOD retains the full tree silhouette.
"""
import bpy,math,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'public/assets/scans/pine_tree_01'
data=json.loads((folder/'pine_tree_01.gltf').read_text())
# Variant B has a naturally irregular branching habit. Referenced vertex data
# and materials are left intact on import, rather than assembling a fake tree.
data['scenes'][0]['nodes']=[1]
source=folder/'pine_selected.gltf';source.write_text(json.dumps(data))
cache=ROOT/'art/pine-source.blend'
if cache.exists():bpy.ops.wm.open_mainfile(filepath=str(cache))
else:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(source))
objects=[o for o in bpy.context.view_layer.objects if o.type=='MESH']
print('IMPORTED',[(o.name,len(o.data.polygons)) for o in objects],flush=True)
if not cache.exists():bpy.ops.wm.save_as_mainfile(filepath=str(cache))
for o in list(bpy.data.objects):
 if o.type=='MESH' and o.name not in bpy.context.view_layer.objects:bpy.data.objects.remove(o,do_unlink=True)
# Separate foliage so the scanned trunk, bark relief and roots retain all faces.
for o in objects:
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':continue
 m=o.data.materials[0]
 if 'twig' not in m.name:continue
 bpy.context.view_layer.objects.active=o
 before=len(o.data.polygons)
 # Coplanar tessellation removal retains boundaries, followed by a distant
 # crown LOD. The full editable tree above is preserved for closer placement.
 mod=o.modifiers.new('coplanar_surface_cleanup','DECIMATE');mod.decimate_type='DISSOLVE';mod.angle_limit=math.radians(1);mod.delimit={'UV','MATERIAL'}
 bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.calc_loop_triangles();triangles=len(o.data.loop_triangles)
 if triangles>650000:
  mod=o.modifiers.new('woodland_distance_lod','DECIMATE');mod.ratio=650000/triangles
  bpy.ops.object.modifier_apply(modifier=mod.name)
 print('FOLIAGE_LOD',before,len(o.data.polygons),flush=True)
for image in bpy.data.images:
 if image.source=='FILE':
  image.filepath=bpy.path.relpath(image.filepath,start=str(ROOT/'art'))
  if image.users:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/woodland-pine.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/woodland-pine.glb'),export_format='GLB',export_yup=True,export_animations=False,export_image_format='AUTO')
print('VEGETATION_COMPLETE',flush=True)
