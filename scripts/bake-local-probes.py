"""Cycles radiance probes at the actual work stations, in the same lighting as
the static irradiance bake. Diffuse and glossy responses share one light field.
"""
from pathlib import Path
import bpy,json,math
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/lighting/probes';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/workshop.blend'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=128
scene.cycles.use_denoising=True;scene.cycles.max_bounces=6;scene.cycles.diffuse_bounces=4
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU'
# The saved workshop contains the same solar-disc-removed sky and physical sun
# used by bake-workshop-light.py; keep its intensity and direction unchanged.
config=json.loads((ROOT/'public/assets/environment/lighting.json').read_text())
for n in scene.world.node_tree.nodes:
 if n.type=='BACKGROUND':n.inputs[1].default_value=config['skyStrength']
for l in scene.objects:
 if l.type=='LIGHT' and l.data.type=='SUN':l.data.energy=config['sunStrength']
camdata=bpy.data.cameras.new('workstation_radiance');camdata.type='PANO';camdata.panorama_type='EQUIRECTANGULAR'
cam=bpy.data.objects.new('workstation_radiance',camdata);scene.collection.objects.link(cam);scene.camera=cam
# Blender camera forward -Z becomes game -Z; up remains game +Y.
cam.rotation_euler=Vector((0,1,0)).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1024;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='HDR';scene.view_settings.view_transform='Standard'
stations={'clay':[-5.6,1.35,-5.6],'wheel':[0,1.35,-5.6],'paint':[5.4,1.35,-5.6],
 'drying':[-7.2,1.35,-.2],'glaze':[7.2,1.5,-.2],'supply':[-6,1.55,4.8],
 'display':[0,1.35,5.8],'kiln':[6,1.15,3.5]}
records=[]
for name,p in stations.items():
 cam.location=(p[0],-p[2],p[1]);scene.render.filepath=str(OUT/(name+'.hdr'))
 bpy.ops.render.render(write_still=True)
 records.append({'station':name,'position':p,'file':name+'.hdr','samples':128})
 print('PROBE_DONE',name,flush=True)
(OUT/'manifest.json').write_text(json.dumps({'method':'Cycles 128 samples, same openings, materials, sky and sun as the static irradiance bake; 4 diffuse bounces. No solar disc in the sky.', 'probes':records},indent=2))
