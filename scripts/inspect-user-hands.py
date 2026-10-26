import bpy, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
report={}
for side in ['left','right']:
    before=set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(ROOT/f'art/user-hands/{side}/hand_3d_model_{side}.fbx'))
    objects=set(bpy.data.objects)-before
    report[side]=[]
    for obj in objects:
        item={'name':obj.name,'type':obj.type,'matrix':[list(row) for row in obj.matrix_world]}
        if obj.type=='MESH':
            points=[obj.matrix_world@v.co for v in obj.data.vertices]
            item.update(vertices=len(points),polygons=len(obj.data.polygons),bounds=[[min(v[i] for v in points) for i in range(3)],[max(v[i] for v in points) for i in range(3)]],materials=[m.name for m in obj.data.materials],groups=[g.name for g in obj.vertex_groups])
            # Save projected geometry for an unlit diagnostic diagram, not an asset edit.
            item['positions']=[list(v) for v in points]
            item['faces']=[list(p.vertices) for p in obj.data.polygons]
        report[side].append(item)
    for obj in objects: bpy.data.objects.remove(obj,do_unlink=True)
(ROOT/'.tmp/user-hands-inspection.json').write_text(json.dumps(report))
print('INSPECTION_COMPLETE',flush=True)
