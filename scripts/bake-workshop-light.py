"""Bake spatial occlusion and true diffuse bounce into a second UV set. Uses Cycles.
Source remains editable. Runtime retains PBR materials and dynamic direct shadows.
"""
from pathlib import Path
import bpy,math,json,array,sys
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/lighting';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/workshop.blend'))
for ob in bpy.context.scene.objects:
 if ob.type=='MESH' and ob.data.materials and ob.data.materials[0].name=='bamboo_leaves':
  # Leaves are rendered two-sided. Duplicate reversed faces are invalid glTF
  # topology and do not add physical thickness or visible detail.
  if ob.data.validate(clean_customdata=False):print('REPAIRED_DUPLICATE_LEAF_FACES',ob.name,flush=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=128
scene.cycles.use_denoising=True;scene.cycles.max_bounces=4;scene.cycles.diffuse_bounces=3
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
 for d in prefs.devices:d.use=d.type=='OPTIX';print('DEVICE',d.name,d.type,d.use,flush=True)
 scene.cycles.device='GPU'
except Exception as e:print('CPU_FALLBACK',e,flush=True)
for ob in list(scene.objects):
 if ob.type=='LIGHT':bpy.data.objects.remove(ob,do_unlink=True)
# Use the same physically captured sky. Static indirect bounce only, no baked sun shadow.
world=bpy.data.worlds.new('captured_daylight');world.use_nodes=True;scene.world=world
n=world.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputWorld');bg=n.new('ShaderNodeBackground');env=n.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(ROOT/'public/assets/environment/courtyard-sky-2k.hdr'));bg.inputs[1].default_value=.75
world.node_tree.links.new(env.outputs[0],bg.inputs[0]);world.node_tree.links.new(bg.outputs[0],out.inputs[0])
config=json.loads((ROOT/'public/assets/environment/lighting.json').read_text())
# Remove the tiny solar disc from diffuse sky. The separate sun is responsible
# for this energy and its shadows; the background panorama is left unchanged.
source=env.image;w,h=source.size
pix=array.array('f',[0])*(w*h*4);source.pixels.foreach_get(pix)
peak=max(range(w*h//2,w*h),key=lambda i:sum(pix[i*4:i*4+3]))
px=peak%w;py=peak//w;radius=12
ring=[(x%w+y*w)*4 for y in range(max(0,py-radius),min(h,py+radius+1)) for x in range(px-radius,px+radius+1) if radius*.8 < math.hypot(x-px,y-py) < radius]
fill=[sum(pix[i+c] for i in ring)/len(ring) for c in range(3)]
for y in range(max(0,py-radius),min(h,py+radius+1)):
 for x in range(px-radius,px+radius+1):
  distance=math.hypot(x-px,y-py)
  if distance>=radius:continue
  weight=max(0,min(1,(radius-distance)/4));i=(x%w+y*w)*4
  for c in range(3):pix[i+c]=pix[i+c]*(1-weight)+fill[c]*weight
diffuse_sky=bpy.data.images.new('daylight_without_solar_disc',width=w,height=h,float_buffer=True)
diffuse_sky.pixels.foreach_set(pix);env.image=diffuse_sky
coords=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeMapping');mapping.inputs['Rotation'].default_value[2]=-config['skyRotation'];world.node_tree.links.new(coords.outputs['Generated'],mapping.inputs['Vector']);world.node_tree.links.new(mapping.outputs[0],env.inputs['Vector'])
light=bpy.data.lights.new('sun_indirect_bake','SUN');light.energy=config['sunStrength'];light.angle=math.radians(.8);lo=bpy.data.objects.new('sun_indirect_bake',light);scene.collection.objects.link(lo)
sun=config['sunDirection'];lo.rotation_euler=Vector((-sun[0],sun[2],-sun[1])).to_track_quat('-Z','Y').to_euler()
# Metric source materials should match runtime reflectance, without multiplying albedo twice.
for m in bpy.data.materials:
 if not m.use_nodes:continue
 for n in m.node_tree.nodes:
  if n.type=='BSDF_PRINCIPLED':
   if n.inputs['Base Color'].is_linked:n.inputs['Base Color'].default_value=(1,1,1,1)
scene.render.bake.margin=12;scene.render.bake.use_clear=True
# Denoise irradiance, not the physical texture maps. A separate empty scene
# avoids rerendering the workshop and keeps the original geometry untouched.
denoise_scene=bpy.data.scenes.new('irradiance_denoiser')
denoise_scene.render.engine='CYCLES';denoise_scene.cycles.samples=1
denoise_scene.render.resolution_percentage=100
denoise_scene.view_settings.view_transform='Standard'
camera_data=bpy.data.cameras.new('cache_camera');camera=bpy.data.objects.new('cache_camera',camera_data)
denoise_scene.collection.objects.link(camera);denoise_scene.camera=camera
tree=bpy.data.node_groups.new('irradiance_denoise','CompositorNodeTree')
denoise_scene.compositing_node_group=tree
tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
image_node=tree.nodes.new('CompositorNodeImage');dn=tree.nodes.new('CompositorNodeDenoise');output=tree.nodes.new('NodeGroupOutput')
tree.links.new(image_node.outputs['Image'],dn.inputs['Image']);tree.links.new(dn.outputs['Image'],output.inputs['Image'])
def save_denoised(im,path,size):
 image_node.image=im
 denoise_scene.render.resolution_x=size;denoise_scene.render.resolution_y=size
 denoise_scene.render.image_settings.file_format='HDR'
 denoise_scene.render.filepath=str(path)
 bpy.ops.render.render(scene=denoise_scene.name,write_still=True)
records=json.loads((OUT/'manifest.json').read_text()) if (OUT/'manifest.json').exists() else []
materials=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['weathered_wood','lime_plaster','kiln_firebrick','stone_plinth','courtyard_stone','grey_fired_roof_tiles','ivory_porcelain','unglazed_stoneware','undyed_linen']
for o in list(scene.objects):
 if o.type!='MESH' or not o.data.materials:continue
 name=o.data.materials[0].name
 if name not in materials:continue
 records=[r for r in records if r['material']!=name]
 print('UV_START',name,len(o.data.polygons),flush=True)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 if 'LightUV' not in o.data.uv_layers:
  o.data.uv_layers.new(name='LightUV');o.data.uv_layers.active=o.data.uv_layers['LightUV']
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(69),island_margin=.002,area_weight=.5);bpy.ops.object.mode_set(mode='OBJECT')
 o.data.uv_layers.active=o.data.uv_layers['LightUV']
 size=4096 if name in ['weathered_wood','courtyard_stone'] else 2048
 m=o.data.materials[0];targets=[]
 for mat in o.data.materials:
  t=mat.node_tree.nodes.new('ShaderNodeTexImage');targets.append((mat,t))
 sky_pixels=None
 for kind in ['ao','sky','indirect']:
  im=bpy.data.images.new(name+'_'+kind,width=size,height=size,alpha=False,float_buffer=True);im.colorspace_settings.name='Non-Color'
  for mat,t in targets:t.image=im;mat.node_tree.nodes.active=t
  print('BAKE_START',name,kind,flush=True)
  if kind=='ao':bpy.ops.object.bake(type='AO',uv_layer='LightUV')
  else:
   # Sky is directly visible only through openings. Add only bounced sunlight;
   # the moving actor and all direct sun shadows remain real time.
   bg.inputs[1].default_value=config['skyStrength'] if kind=='sky' else 0
   light.energy=0 if kind=='sky' else config['sunStrength']
   scene.render.bake.use_pass_direct=kind=='sky';scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False;bpy.ops.object.bake(type='DIFFUSE',uv_layer='LightUV')
   pixels=array.array('f',[0])*(size*size*4);im.pixels.foreach_get(pixels)
   if kind=='sky':sky_pixels=pixels
   else:
    for i in range(len(pixels)):
     if i%4!=3:pixels[i]=pixels[i]+sky_pixels[i]
    im.pixels.foreach_set(pixels)
  if kind=='indirect':
   dest=OUT/(name+'_'+kind+'.hdr');save_denoised(im,dest,size)
  else:
   dest=OUT/(name+'_'+kind+'.png');im.filepath_raw=str(dest);im.file_format='PNG';im.save()
  records.append({'material':name,'type':kind,'size':size,'samples':128,'denoised':kind=='indirect','file':dest.relative_to(ROOT).as_posix()})
  print('BAKE_DONE',name,kind,flush=True)
 for mat,t in targets:mat.node_tree.nodes.remove(t)
 bg.inputs[1].default_value=config['skyStrength'];light.energy=config['sunStrength']
 o.data.uv_layers.active_index=0;o.data.uv_layers[0].active_render=True
# Bake UVs and all editable geometry are preserved in the source.
diffuse_sky.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/workshop.blend'))
for m in bpy.data.materials:
 if m.use_nodes:
  for n in list(m.node_tree.nodes):
   if n.type=='TEX_IMAGE':m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type=='MESH':o.select_set(True)
sys.path.insert(0,str(ROOT/'scripts'))
from workshop_export import export_workshop
export_workshop()
(OUT/'manifest.json').write_text(json.dumps(records,indent=2))
print('LIGHT_BAKE_COMPLETE',flush=True)
