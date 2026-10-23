import bpy
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'art/workshop.blend'))
for m in bpy.data.materials:
    if m.use_nodes:
        for n in list(m.node_tree.nodes):
            if n.type=='TEX_IMAGE':m.node_tree.nodes.remove(n)
bpy.ops.export_scene.gltf(filepath=str(root/'public/assets/workshop.glb'),export_format='GLB',export_yup=True,export_apply=True)
