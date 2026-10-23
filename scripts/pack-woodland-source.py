"""Keep used scan images inside the editable tree, independent of the raw catalog."""
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/woodland-pine.blend'))
for image in bpy.data.images:
 if image.source=='FILE' and image.users:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/woodland-pine.blend'))
print('WOODLAND_SOURCE_PACKED',flush=True)
