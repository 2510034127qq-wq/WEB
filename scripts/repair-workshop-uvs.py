"""Migrate the existing editable workshop without changing its baked geometry.
Merge legacy UVMap/SurfaceUV and preserve LightUV values exactly.
"""
from pathlib import Path
import bpy,json
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/workshop.blend'))
report=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 layers=o.data.uv_layers
 surface=[u for u in layers if u.name!='LightUV']
 if len(surface)>1:
  target=surface[0]
  for p in o.data.polygons:
   # Components joined with a different UV name have all-zero coordinates in
   # the first layer. Copy their original coordinates, never generate new UVs.
   if all(target.data[i].uv.length<1e-8 for i in p.loop_indices):
    for candidate in surface[1:]:
     if any(candidate.data[i].uv.length>1e-8 for i in p.loop_indices):
      for i in p.loop_indices:target.data[i].uv=candidate.data[i].uv
      break
  for extra in surface[1:]:layers.remove(extra)
 if layers:
  layers[0].name='SurfaceUV';layers.active_index=0;layers[0].active_render=True
 if 'LightUV' in layers:assert layers[1].name=='LightUV'
 report.append({'object':o.name,'uvLayers':[u.name for u in layers]})
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/workshop.blend'))
for m in bpy.data.materials:
 if m.use_nodes:
  for n in list(m.node_tree.nodes):
   if n.type=='TEX_IMAGE':m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/workshop.glb'),export_format='GLB',export_yup=True,export_apply=True,use_selection=True)
(ROOT/'qa/workshop-uv-migration.json').write_text(json.dumps(report,indent=2))
print('UV_MIGRATION_COMPLETE',flush=True)
