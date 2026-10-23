import bpy,json
from pathlib import Path
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64
world=bpy.data.worlds.new('unit_sky');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(1,1,1,1);world.node_tree.nodes['Background'].inputs[1].default_value=1;scene.world=world
bpy.ops.mesh.primitive_plane_add(size=2);o=bpy.context.object;m=bpy.data.materials.new('unit_diffuse');m.use_nodes=True;n=m.node_tree.nodes;n.clear();d=n.new('ShaderNodeBsdfDiffuse');d.inputs[0].default_value=(1,1,1,1);out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(d.outputs[0],out.inputs[0]);o.data.materials.append(m)
im=bpy.data.images.new('diffuse_bake',width=16,height=16,float_buffer=True);t=n.new('ShaderNodeTexImage');t.image=im;n.active=t
scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False;bpy.ops.object.bake(type='DIFFUSE')
r={'unitWhiteLambertUnderUnitWorld':list(im.pixels)[(8*16+8)*4:(8*16+8)*4+3]};Path('qa/lightmap-calibration.json').write_text(json.dumps(r,indent=2));print(r,flush=True)
