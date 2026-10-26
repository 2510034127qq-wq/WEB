import bpy,sys,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
side=sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/f'art/user-{side}-hand-rig.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world=bpy.data.worlds.new('review');scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.new('ShaderNodeBackground');bg.inputs[0].default_value=(.25,.25,.25,1);out=scene.world.node_tree.nodes.new('ShaderNodeOutputWorld');scene.world.node_tree.links.new(bg.outputs[0],out.inputs[0])
for loc,power,size in [((.3,-.2,.6),12,.4),((-.3,.3,.4),8,.3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.30
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
for pose in ['open','fist','pinch']:
    rig.animation_data_create();rig.animation_data.action=bpy.data.actions.get(pose);scene.frame_set(1)
    for angle,loc in [('palm',(.03,.02,.6)),('side',(.5,.02,.22)),('back',(-.02,.02,-.6))]:
        target=Vector((0,.012,0));cam.location=Vector(loc);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(ROOT/f'qa/hand-{side}-{pose}-{angle}.png');bpy.ops.render.render(write_still=True)
