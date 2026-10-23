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
exports=[]
for form in ['bowl','vase']:
    path=root/'qa'/'exports'/f'{form}.glb'
    if not path.exists():continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes=[o for o in bpy.data.objects if o.type=='MESH']
    assert meshes and all(len(o.data.vertices)>100 for o in meshes)
    textures=[{'width':i.size[0],'height':i.size[1],'embedded':bool(i.packed_file)} for i in bpy.data.images if i.type=='IMAGE']
    assert textures and all(i['width']>0 and i['embedded'] for i in textures)
    exports.append({'file':f'qa/exports/{form}.glb','meshes':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'textures':textures})
report=Path(args[args.index('--report')+1]) if '--report' in args else root/'qa'/'assets-check.json'
report.parent.mkdir(exist_ok=True,parents=True)
report.write_text(json.dumps({'root':str(root),'records':records,'exportRoundtrip':exports},indent=2),encoding='utf-8')
print('ASSETS_CHECK_PASS',flush=True)
