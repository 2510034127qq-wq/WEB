import bpy,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
side=sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(ROOT/f'art/user-hands/{side}/hand_3d_model_{side}.fbx'))
scene=bpy.context.scene
obj=next(o for o in scene.objects if o.type=='MESH')
for mat in obj.data.materials:
    for n in mat.node_tree.nodes:
        if n.type=='TEX_IMAGE' and n.image:
            n.image.filepath=str(ROOT/f'art/user-hands/{side}/hand_3d_model_{side}.fbm/hand_3d_model_{side}_basecolor.jpg');n.image.reload()
points=[obj.matrix_world@v.co for v in obj.data.vertices]
center=sum(points,Vector())/len(points)
scene.render.engine='CYCLES';scene.cycles.samples=16
scene.world=bpy.data.worlds.new('world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.3,.3,.3,1)
for loc,power,size in [((1,-2,3),180,3),((-2,1,2),140,2)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=1.2
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
for axis,loc in [('top',(0,0,3)),('front',(0,-3,.4)),('back',(0,3,.4))]:
    cam.location=center+Vector(loc);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(ROOT/f'qa/user-hand-{side}-{axis}.png');bpy.ops.render.render(write_still=True)
