"""Adapt CC-BY Fab hands to the existing craft rig; preserve authored UVs and finger topology."""
import bpy,bmesh,math,json
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(ROOT/'art/sources/fab-hands/hands.fbx'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');hand=next(o for o in bpy.context.scene.objects if o.type=='MESH')
wrist=rig.data.bones['hand.L'].head_local.copy()
y=(rig.data.bones['f_middle.01.L'].head_local-wrist).normalized()
x=(rig.data.bones['f_pinky.01.L'].head_local-rig.data.bones['f_index.01.L'].head_local).normalized();x=(x-y*x.dot(y)).normalized();z=x.cross(y).normalized()
T=Matrix(((*x,-x.dot(wrist)),(*y,-y.dot(wrist)-.055),(*z,-z.dot(wrist)),(0,0,0,1)))
hand.data.transform(T@hand.matrix_world);hand.matrix_world=Matrix.Identity(4)
rig.data.transform(T);rig.matrix_world=Matrix.Identity(4)
bm=bmesh.new();bm.from_mesh(hand.data)
remove=[v for v in bm.verts if v.co.y<-.098 or abs(v.co.x)>.14 or abs(v.co.z)>.08]
bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(hand.data);bm.free()
# Handed wrist becomes the local root; the authored palm and finger chains stay intact.
rename={'hand.L':'wrist'}
for i,n in enumerate(['f_index','f_middle','f_ring','f_pinky']):
 for j in range(3):rename[f'{n}.{j+1:02}.L']=f'finger{i}_{j}'
for j in range(3):rename[f'thumb.{j+1:02}.L']=f'thumb_{j}'
for old,new in rename.items():rig.data.bones[old].name=new
# Renaming bones propagates groups; normalize remaining forearm weights to wrist.
wristGroup=hand.vertex_groups.get('wrist') or hand.vertex_groups.new(name='wrist')
fore=hand.vertex_groups.get('forearm.L')
if fore:
 for v in hand.data.vertices:
  for g in list(v.groups):
   if g.group==fore.index:wristGroup.add([v.index],g.weight,'ADD')
bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
rig.data.edit_bones['wrist'].parent=None
for b in list(rig.data.edit_bones):
 if b.name not in rename.values() and not b.name.startswith('palm.') or b.name.endswith('.R') or '_end' in b.name:
  if b.name!='wrist':rig.data.edit_bones.remove(b)
for b in rig.data.edit_bones:b.align_roll(Vector((0,0,1)))
bpy.ops.object.mode_set(mode='OBJECT')
hand.name='authored_hand';rig.name='craft_hand_rig'
(ROOT/'public/assets/hand-rig.json').write_text(json.dumps({'sourceSide':'left','palmNormal':[0,1,0],'fingerForward':[0,0,-1],'boneLengths':{b.name:b.length for b in rig.data.bones}},indent=2))
mat=hand.data.materials[0];mat.name='warm_skin';mat.use_nodes=True
nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');p=nodes.new('ShaderNodeBsdfPrincipled');mat.node_tree.links.new(p.outputs[0],out.inputs[0]);p.inputs['Metallic'].default_value=0;p.inputs['IOR'].default_value=1.4
folder=ROOT/'art/sources/fab-hands/Textures'
for channel,slot in [('BaseColor','Base Color'),('Roughness','Roughness'),('Normal_GL','Normal')]:
 t=nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(folder/f'arm_base_2048_{channel}.png'))
 if channel!='BaseColor':t.image.colorspace_settings.name='Non-Color'
 if channel=='Normal_GL':
  n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.65;mat.node_tree.links.new(t.outputs[0],n.inputs['Color']);mat.node_tree.links.new(n.outputs[0],p.inputs[slot])
 else:mat.node_tree.links.new(t.outputs[0],p.inputs[slot])
# One subdivision improves silhouettes while keeping the authored UVs/skin weights.
bpy.context.view_layer.objects.active=hand
mod=hand.modifiers.new('near_view_surface','SUBSURF');mod.levels=1
bpy.ops.object.modifier_move_up(modifier=mod.name)
bpy.ops.object.modifier_apply(modifier=mod.name)
for face in hand.data.polygons:face.use_smooth=True
for image in bpy.data.images:
 if image.source=='FILE':image.filepath='//sources/fab-hands/Textures/'+Path(image.filepath).name
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/hands.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/hands.glb'),export_format='GLB',export_yup=True,export_animations=False,export_image_format='AUTO')
print('HAND_ADAPTED',len(hand.data.vertices),flush=True)
