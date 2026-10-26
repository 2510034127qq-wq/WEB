"""Rig the user's separate meshes in Blender. Preserve UVs; no mirrored runtime hand.

Landmarks are measured on the supplied mesh, in imported world coordinates.
Local authoring frame: +Y fingers, +Z palm; glTF: -Z fingers, +Y palm.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
landmarks=json.loads((ROOT/'scripts/hand-landmarks.json').read_text())
report={'source':'User supplied FBX and base color; original left/right labels preserved, no mirroring','hands':{}}
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def segment(p,a,b):
    v=b-a;t=max(0,min(1,(p-a).dot(v)/v.length_squared));return (p-a-v*t).length,t
for source,anatomy in [('left','left'),('right','right')]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src=ROOT/f'art/user-hands/{source}/hand_3d_model_{source}.fbx'
    bpy.ops.import_scene.fbx(filepath=str(src))
    mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    data=landmarks[source];w=Vector(data['wrist']);raw={n:[Vector(p) for p in pts] for n,pts in data['chains'].items()}
    y=(raw['finger1'][0]-w).normalized()
    across=raw['finger3'][0]-raw['finger0'][0]
    if anatomy=='right':across=-across
    x=(across-y*across.dot(y)).normalized();z=x.cross(y).normalized()
    scale=data['scale'];origin=Vector((0,-.055,0))
    def transform(p):
        q=p-w;return Vector((q.dot(x),q.dot(y),q.dot(z)))*scale+origin
    chains={n:[transform(p) for p in pts] for n,pts in raw.items()}
    matrix=mesh.matrix_world.copy()
    for v in mesh.data.vertices:v.co=transform(matrix@v.co)
    mesh.matrix_world=Matrix.Identity(4);mesh.name=f'user_{anatomy}_hand_skin'
    # Extend the supplied forearm to a human forearm length, preserving its surface
    # and texture. The open end stays behind the camera/body rather than at wrist.
    minY=min(v.co.y for v in mesh.data.vertices)
    for v in mesh.data.vertices:
        if v.co.y<-.09:
            t=(-.09-v.co.y)/(-.09-minY)
            v.co.y=-.09-t*.51
    for p in mesh.data.polygons:p.use_smooth=True
    mat=mesh.data.materials[0];mat.name='user_hand_skin';mat.use_nodes=True
    nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');bs=nodes.new('ShaderNodeBsdfPrincipled');mat.node_tree.links.new(bs.outputs[0],out.inputs[0])
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/f'art/user-hands/{source}/hand_3d_model_{source}.fbm/hand_3d_model_{source}_basecolor.jpg'))
    mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.56;bs.inputs['IOR'].default_value=1.4
    # Keep skin honest: the supplied file has base color only; no invented scan maps.
    arm=bpy.data.armatures.new(f'{anatomy}_anatomical_skeleton');rig=bpy.data.objects.new(f'user_{anatomy}_hand_rig',arm);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);mesh.select_set(False);bpy.ops.object.mode_set(mode='EDIT')
    wrist=arm.edit_bones.new('wrist');wrist.head=origin;wrist.tail=(0,-.015,0);wrist.align_roll(Vector((0,0,-1)))
    fore=arm.edit_bones.new('forearm');fore.head=origin;fore.tail=(0,-.31,0);fore.parent=wrist;fore.align_roll(Vector((0,0,-1)))
    upper=arm.edit_bones.new('upperarm');upper.head=fore.tail;upper.tail=(0,-.60,0);upper.parent=fore;upper.use_connect=True;upper.align_roll(Vector((0,0,-1)))
    palmRoot=arm.edit_bones.new('palm');palmRoot.head=origin;palmRoot.tail=(0,.035,0);palmRoot.parent=wrist;palmRoot.align_roll(Vector((0,0,1)))
    for name,pts in chains.items():
        parent=palmRoot
        if name!='thumb':
            palm=arm.edit_bones.new('palm_'+name);palm.head=origin+Vector((pts[0].x*.28,.009,0));palm.tail=pts[0];palm.parent=palmRoot;palm.align_roll(Vector((0,0,-1)));parent=palm
        for j in range(3):
            bone=arm.edit_bones.new(f'{name}_{j}');bone.head=pts[j];bone.tail=pts[j+1];bone.parent=parent;bone.use_connect=j>0
            # Local +X flexion must move fingers toward the palm (+Z), for both sides.
            bone.align_roll(Vector((0,0,1)));parent=bone
    bpy.ops.object.mode_set(mode='OBJECT')
    groups={b.name:mesh.vertex_groups.new(name=b.name) for b in arm.bones}
    # Blender's heat solver diffuses weights through the actual connected skin,
    # keeping the webbing continuous rather than a spatial nearest-finger seam.
    mesh.vertex_groups.clear()
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    mod=next(m for m in mesh.modifiers if m.type=='ARMATURE');mod.use_deform_preserve_volume=False
    # The supplied fingertip/nail topology contains narrow overlapping strips.
    # Keep distal tissue and nails with the distal phalanx rather than allowing
    # heat diffusion to pull a nail corner toward a neighbouring finger.
    for v in mesh.data.vertices:
        nearest=min((segment(v.co,pts[j],pts[j+1])[0],name,j) for name,pts in chains.items() for j in range(3))
        distance,name,j=nearest
        pts=chains[name]
        if j!=2:continue
        along=(v.co-pts[2]).dot((pts[3]-pts[2]).normalized());amount=smooth(0,.006,along)
        if amount<=0:continue
        distal=mesh.vertex_groups[f'{name}_2']
        old={g.group:g.weight*(1-amount) for g in v.groups};old[distal.index]=old.get(distal.index,0)+amount
        for g in list(v.groups):mesh.vertex_groups[g.group].remove([v.index])
        for index,weight in old.items():
            if weight>1e-8:mesh.vertex_groups[index].add([v.index],weight,'REPLACE')
    # Smooth silhouettes and supply enough vertices at each bend; retain the
    # original editable cage and UVs in Blender. Apply before export for Web parity.
    bpy.context.view_layer.objects.active=mesh;mesh.select_set(True);rig.select_set(False)
    sub=mesh.modifiers.new('Joint surface subdivision','SUBSURF');sub.levels=1
    bpy.ops.object.modifier_move_up(modifier=sub.name);bpy.ops.object.modifier_apply(modifier=sub.name)
    for v in mesh.data.vertices:
        merged={}
        for g in v.groups:
            index=mesh.vertex_groups['palm'].index if mesh.vertex_groups[g.group].name.startswith('palm_finger') else g.group
            merged[index]=merged.get(index,0)+g.weight
        keep=sorted(merged.items(),key=lambda a:-a[1])[:4]
        total=sum(w for i,w in keep)
        if total<1e-8:raise RuntimeError(f'Unweighted vertex {v.index}')
        for g in list(v.groups):mesh.vertex_groups[g.group].remove([v.index])
        for i,w in keep:mesh.vertex_groups[i].add([v.index],w/total,'REPLACE')
    counts={n:0 for n in groups};maxError=0;unweighted=0
    for v in mesh.data.vertices:
        total=sum(g.weight for g in v.groups);maxError=max(maxError,abs(1-total));unweighted+=total<.999
        for g in v.groups:
            if g.weight>.01:counts[mesh.vertex_groups[g.group].name]+=1
    # Authored pose actions are also exported for inspection in any glTF viewer.
    for pose in ['open','fist','pinch']:
        rig.animation_data_clear()
        for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0)
        for name in chains:
            values=([0,0,0] if pose=='open' else ([.45,.65,.55] if name=='thumb' else [1.05,1.45,1.0]))
            if pose=='pinch':values=[.35,.6,.45] if name=='thumb' else ([.45,.9,.65] if name=='finger0' else [.18,.35,.2])
            for j in range(3):
                b=rig.pose.bones[f'{name}_{j}'];b.rotation_euler.x=values[j];b.keyframe_insert('rotation_euler',frame=1);b.keyframe_insert('rotation_euler',frame=24)
        rig.animation_data.action.name=pose
        track=rig.animation_data.nla_tracks.new();track.name=pose;track.strips.new(pose,1,rig.animation_data.action);track.mute=True
    rig.animation_data_create();rig.animation_data.action=bpy.data.actions.get('open')
    rig.animation_data.action_slot=rig.animation_data.action.slots[0]
    for b in rig.pose.bones:b.rotation_euler=(0,0,0)
    # Keep actions with fake users in the editable file; ACTIONS export will pick them up.
    for action in bpy.data.actions:action.use_fake_user=True
    for im in bpy.data.images:
        if im.source=='FILE':im.pack()
    bpy.context.view_layer.objects.active=rig;rig.select_set(True)
    rig.show_in_front=True;arm.display_type='STICK'
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'art/user-{anatomy}-hand-rig.blend'))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/f'public/assets/user-{anatomy}-hand.glb'),export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_all_influences=False)
    info={'sourceFile':str(src.relative_to(ROOT)),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'anatomicalSide':anatomy,'vertices':len(mesh.data.vertices),'boneLengths':{b.name:b.length for b in arm.bones},'weightedVertices':counts,'maxWeightSumError':maxError,'unweightedVertices':unweighted,'chains':{n:[list(p) for p in pts] for n,pts in chains.items()},'palmNormal':[0,1,0],'fingerForward':[0,0,-1],'forearmLength':.255,'upperarmLength':.29}
    report['hands'][anatomy]=info
    (ROOT/f'public/assets/user-{anatomy}-hand-rig.json').write_text(json.dumps(info,indent=2))
(ROOT/'qa/user-hand-rig.json').write_text(json.dumps(report,indent=2))
print('USER_HAND_RIGS_COMPLETE',flush=True)
