"""Install into an isolated BLENDER_USER_SCRIPTS, never the user's real configuration."""
import os
import sys
from pathlib import Path
import bpy

root = Path(__file__).resolve().parents[1]
scripts = Path(os.environ['BLENDER_USER_SCRIPTS']).resolve()
assert scripts.is_relative_to(root), 'Isolated user scripts directory must be inside the project'
assert (scripts / 'addons').is_dir()
archive = root / 'dist' / 'Biped_Builder_1.2.0.zip'
bpy.ops.preferences.addon_install(filepath=str(archive), overwrite=True)
bpy.ops.preferences.addon_enable(module='biped_builder')
assert 'biped_builder' in bpy.context.preferences.addons
assert hasattr(bpy.types.Scene, 'biped_settings')
assert bpy.ops.biped.create_guide() == {'FINISHED'}
assert bpy.ops.biped.generate() == {'FINISHED'}
assert bpy.ops.biped.validate() == {'FINISHED'}
module = sys.modules['biped_builder']
assert Path(module.__file__).resolve().is_relative_to(scripts)
bpy.ops.preferences.addon_disable(module='biped_builder')
print('ZIP_INSTALL_SMOKE_PASS', bpy.app.version_string, module.__file__)
