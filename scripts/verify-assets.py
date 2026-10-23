"""Run inside Blender: inspect editable sources, optionally repair texture paths."""
import bpy,json,sys
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
root=Path(args[args.index('--root')+1]).resolve() if '--root' in args else Path(__file__).resolve().parents[1]
repair='--repair-relative' in args
records=[]
for name in ['workshop','hands']:
    path=root/'art'/f'{name}.blend'
    bpy.ops.wm.open_mainfile(filepath=str(path))
    if repair:
        for image in bpy.data.images:
            if image.source=='FILE':image.filepath='//../public/assets/textures/'+Path(image.filepath).name
        bpy.ops.wm.save_as_mainfile(filepath=str(path))
    images=[]
    for image in bpy.data.images:
        if image.source!='FILE':continue
        resolved=Path(bpy.path.abspath(image.filepath)).resolve()
        images.append({'path':image.filepath,'exists':resolved.is_file(),'insidePackage':resolved.is_relative_to(root)})
    record={'file':f'art/{name}.blend','meshObjects':sum(o.type=='MESH' for o in bpy.data.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'bones':sum(len(a.bones) for a in bpy.data.armatures),'images':images}
    assert all(i['exists'] and i['insidePackage'] for i in images),record
    records.append(record)
(root/'qa').mkdir(exist_ok=True)
(root/'qa'/'assets-check.json').write_text(json.dumps({'root':str(root),'records':records},indent=2),encoding='utf-8')
print('ASSETS_CHECK_PASS',flush=True)
