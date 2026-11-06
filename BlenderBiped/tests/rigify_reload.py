"""Prove IK and snapping work after a cold file reload with embedded scripts disabled."""
from pathlib import Path
import sys, json
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import biped_builder
from biped_builder.rig import evaluated_pose
biped_builder.register()
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'dist' / 'Biped_Rigify_1.2.0_Demo.blend'), load_ui=False, use_scripts=False)
obj = next(o for o in bpy.data.objects if o.get('biped_engine') == 'RIGIFY')
bpy.context.scene.biped_settings.rig = obj
obj.animation_data_clear()
limb = next(x for x in json.loads(obj['biped_limbs']) if x['key'] == 'arm_L_ik')
assert not obj.pose.bones[limb['master']]['pole_vector']
assert getattr(obj.pose.bones[limb['pole']], 'hide', obj.data.bones[limb['pole']].hide)
assert bpy.ops.biped.select_control(bone=limb['target']) == {'FINISHED'}
before = evaluated_pose(obj).bones[limb['deform'][-1]].head.copy()
delta = Vector((-.1, -.15, .05))
assert bpy.ops.transform.translate(value=delta, orient_type='GLOBAL') == {'FINISHED'}
after = evaluated_pose(obj).bones[limb['deform'][-1]].head.copy()
assert (after - before - delta).length < .003
assert bpy.ops.biped.switch(key=limb['key'], ik=False) == {'FINISHED'}
assert bpy.ops.biped.switch(key=limb['key'], ik=True) == {'FINISHED'}
after = evaluated_pose(obj).bones[limb['deform'][-1]].head.copy()
assert (after - before - delta).length < .003
print('COLD_RELOAD_NATIVE_IK_AND_SNAPPING_PASS', bpy.app.version_string)
