"""Open the shipped demo in an isolated Blender process, without installing preferences."""
import sys
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import biped_builder
biped_builder.register()
rig = next(obj for obj in bpy.data.objects if obj.get('biped_kind') == 'RIG')
bpy.context.scene.biped_settings.rig = rig
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.show_region_ui = True
        area.spaces.active.region_3d.view_distance = 3.2
        area.spaces.active.region_3d.view_location = (0, 0, .92)
print('BIPED_UI_READY', flush=True)
