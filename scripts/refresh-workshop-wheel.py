"""Refresh the external wheel in editable scenes without repacking their LightUV.
After a geometric or material change, rebake lighting/probes before exporting.
"""
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1]
for name in ['workshop-components','workshop']:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art'/f'{name}.blend'))
 for ob in list(bpy.context.scene.objects):
  if ob.get('deliveryExternal')=='potters-wheel':bpy.data.objects.remove(ob,do_unlink=True)
 for material in list(bpy.data.materials):
  if material.users==0 and material.name.startswith('wheel_'):bpy.data.materials.remove(material)
 with bpy.data.libraries.load(str(ROOT/'art/potters-wheel.blend'),link=False) as (src,dst):dst.objects=src.objects
 for ob in dst.objects:
  if ob:
   bpy.context.collection.objects.link(ob);ob['deliveryExternal']='potters-wheel'
   if ob.parent is None:ob.location=(0,5.6,.78)
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art'/f'{name}.blend'))
 print('REFRESHED_WHEEL',name,flush=True)
