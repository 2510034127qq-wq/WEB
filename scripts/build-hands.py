"""Original rigged craftsperson hands; editable, metre-scaled Blender source."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,rough):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
skin=material('warm_skin',(0.49,0.29,0.18),0.64);cloth=material('indigo_cotton',(0.055,0.10,0.12),0.96);nail=material('fingernails',(0.62,0.44,0.34),0.47)
parts=[]
def ellipsoid(p,s):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=p);o=bpy.context.object;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);parts.append(o);return o
ellipsoid((0,0,0),(0.042,0.057,0.016))
ellipsoid((0,-0.055,-0.002),(0.026,0.051,0.02))
ellipsoid((-0.027,-0.004,-0.005),(0.024,0.04,0.019))
chains={}
for i,(x,length) in enumerate([(-0.03,0.075),(-0.009,0.086),(0.013,0.080),(0.033,0.060)]):
    points=[Vector((x,0.034,0)),Vector((x,0.034+length*0.43,-0.002)),Vector((x,0.034+length*0.76,-0.004)),Vector((x,0.034+length,-0.005))]
    chains[f'finger{i}']=points
    for j in range(3):
        a,b=points[j:j+2];o=ellipsoid((a+b)/2,(0.0095-j*0.001,(b-a).length/2+0.006,0.009-j*0.001));o.rotation_euler=(b-a).to_track_quat('Y','Z').to_euler()
chains['thumb']=[Vector((-0.025,-0.025,-0.002)),Vector((-0.054,0.004,-0.004)),Vector((-0.068,0.026,-0.005)),Vector((-0.071,0.046,-0.006))]
for j in range(3):
    a,b=chains['thumb'][j:j+2];o=ellipsoid((a+b)/2,(0.013-j*0.002,(b-a).length/2+0.008,0.012-j*0.0015));o.rotation_euler=(b-a).to_track_quat('Y','Z').to_euler()
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();hand=bpy.context.object;hand.name='anatomical_hand'
mod=hand.modifiers.new('continuous_skin','REMESH');mod.mode='VOXEL';mod.voxel_size=0.0025;bpy.ops.object.modifier_apply(modifier=mod.name)
mod=hand.modifiers.new('skin_smoothing','SMOOTH');mod.factor=0.7;mod.iterations=4;bpy.ops.object.modifier_apply(modifier=mod.name)
for f in hand.data.polygons:f.use_smooth=True
hand.data.materials.append(skin)
arm=bpy.data.armatures.new('hand_skeleton');rig=bpy.data.objects.new('hand_rig',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);hand.select_set(False);bpy.ops.object.mode_set(mode='EDIT')
root=arm.edit_bones.new('wrist');root.head=(0,-0.09,0);root.tail=(0,0.03,0)
for name,points in chains.items():
    prev=root
    for j in range(3):
        b=arm.edit_bones.new(f'{name}_{j}');b.head=points[j];b.tail=points[j+1];b.parent=prev;prev=b
bpy.ops.object.mode_set(mode='OBJECT')
hand.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
# Cloth forearm has a flared open cuff and physically modelled folds.
verts=[];faces=[]
for j in range(9):
    y=-0.075-j*0.025
    for i in range(40):
        a=i/40*math.tau;r=0.034+j*0.0015+math.sin(a*9+j*1.8)*0.0018
        verts.append((math.cos(a)*r,y,math.sin(a)*r))
for j in range(8):
    for i in range(40):faces.append((j*40+i,j*40+(i+1)%40,(j+1)*40+(i+1)%40,(j+1)*40+i))
me=bpy.data.meshes.new('sleeve');me.from_pydata(verts,[],faces);me.materials.append(cloth)
o=bpy.data.objects.new('cotton_sleeve',me);bpy.context.collection.objects.link(o)
for f in me.polygons:f.use_smooth=True
for name,points in chains.items():
    tip=points[-1];bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=tip+Vector((0,-0.005,0.007)))
    o=bpy.context.object;o.name=f'{name}_nail';o.scale=(0.006,0.009,0.001);o.data.materials.append(nail)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.context.view_layer.update()
    matrix=o.matrix_world.copy();o.parent=rig;o.parent_type='BONE';o.parent_bone=f'{name}_2';o.matrix_world=matrix
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/hands.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/hands.glb'),export_format='GLB',export_yup=True)
print('HANDS_COMPLETE',flush=True)
