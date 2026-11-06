"""Native mirror operations and an actual 1.1.1 weighted-file migration."""
from pathlib import Path
import sys, json
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import biped_builder
from biped_builder.skeleton import create_guide, activate, select_pose_bone
from biped_builder.symmetry import find_pairs, export_name
from biped_builder.rig import evaluated_pose
from biped_builder.cleanup import clean_unused_def

checks = []


def check(value, message):
    if not value:
        raise AssertionError(message)
    checks.append(message)
    print('PASS', message, flush=True)


biped_builder.register()
pairs = find_pairs(['ArmLBase', 'ArmRBase', 'Bip001 L UpperArm', 'Bip001 R UpperArm', 'UpperArm',
                    'Forearm', 'tail.L', 'tail.R'])
check(pairs['ArmLBase'] == 'ArmRBase', 'LR inside a word automatically pairs real counterparts')
check(pairs['Bip001 L UpperArm'] == 'Bip001 R UpperArm', 'middle Biped side markers automatically pair')
check('UpperArm' not in pairs and 'Forearm' not in pairs, 'unpaired letters are not treated as symmetry')
g = create_guide(bpy.context.scene.biped_settings, bpy.context)
activate(g, 'EDIT')
for b in g.data.edit_bones:
    b.select = b.select_head = b.select_tail = False
left = g.data.edit_bones[g['biped_prefix'] + ' Forearm.L']
right = g.data.edit_bones[g['biped_prefix'] + ' Forearm.R']
left.select_head = True
left.select = False
g.data.edit_bones.active = left
before_l, before_r = left.head.copy(), right.head.copy()
bpy.ops.transform.translate(value=(.02, .03, .04), orient_type='GLOBAL')
check((left.head - before_l).length > .02, 'native edit-mode G moves the selected joint')
check((right.head - Vector((-left.head.x, left.head.y, left.head.z))).length < .0001,
      'native X Mirror moves the corresponding other-side joint automatically')
check((right.head - before_r).length > .02, 'native mirror actually moves the unselected opposite joint')
activate(g, 'OBJECT')
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'dist' / 'Biped_Rigify_1.1.1_Demo.blend'), load_ui=False, use_scripts=False)
o = next(x for x in bpy.data.objects if x.get('biped_engine') == 'RIGIFY')
bpy.context.scene.biped_settings.rig = o
prefix = o['biped_prefix']
names = [b.name for b in o.data.bones if b.use_deform]
original_action = o.animation_data.action
samples = {}
for f in (1, 24, 48):
    bpy.context.scene.frame_set(f)
    p = evaluated_pose(o)
    samples[f] = {n: p.bones[n].matrix.copy() for n in names}
activate(o)
bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=.12, location=(0, 0, 1.2))
mesh = bpy.context.object
check(bpy.ops.biped.bind_mesh() == {'FINISHED'}, 'old file mesh bound before migration')
before_mesh = [v.co.copy() for v in mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices]
activate(o, 'POSE')
check(bpy.ops.biped.symmetry_cleanup() == {'FINISHED'}, 'one-click migration on real 1.1.1 file')
check(o.animation_data.action == original_action, 'animation action retained during naming repair')
check(not any(b.name.startswith('DEF-') for b in o.data.bones) and 'DEF' not in o.data.collections,
      'all 55 unused standard Rigify DEF bones and collection removed')
by_export = {export_name(b): b.name for b in o.data.bones if b.use_deform}
check(set(by_export) == set(names), 'standard Biped export names preserved')
check(all(bpy.utils.flip_name(n) in o.data.bones for n in by_export.values() if n.endswith(('.L', '.R'))),
      'migrated actual bone names work with Blender flip-name function')
check(set(mesh.vertex_groups.keys()) <= set(by_export.values()), 'bound mesh vertex groups follow renamed bones')
after_mesh = [v.co.copy() for v in mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices]
check(max((a - b).length for a, b in zip(before_mesh, after_mesh)) < .0001,
      'weighted mesh deformation preserved after migration and DEF deletion')
for f in (1, 24, 48):
    bpy.context.scene.frame_set(f)
    p = evaluated_pose(o)
    error = max(abs(p.bones[by_export[n]].matrix[i][j] - m[i][j])
                for n, m in samples[f].items() for i in range(4) for j in range(4))
    check(error < .0001, f'animation evaluated pose retained at frame {f}')
o.animation_data_clear()
bpy.ops.biped.reset_pose()
o.data.use_mirror_x = False
limbs = json.loads(o['biped_limbs'])
arm = next(l for l in limbs if l['key'] == 'arm_L_ik')
bpy.ops.biped.select_control(bone=arm['target'])
bpy.ops.transform.translate(value=(-.12, -.1, .08), orient_type='GLOBAL')
check(bpy.ops.pose.copy() == {'FINISHED'}, 'native copy pose accepts selected Rigify controller')
check(bpy.ops.pose.paste(flipped=True) == {'FINISHED'}, 'native paste-flipped runs successfully')
p = evaluated_pose(o)
left = p.bones['hand_ik.L'].head
right = p.bones['hand_ik.R'].head
check((right - Vector((-left.x, left.y, left.z))).length < .0001,
      'native flipped pose reaches the correct opposite hand')
check(bpy.ops.biped.validate() == {'FINISHED'}, 'IK metadata and constraints remain valid after repair')
# Dependency guard: a user-added non-DEF constraint still needs this DEF helper.
activate(o, 'EDIT')
b = o.data.edit_bones.new('DEF-user-dependent')
b.head, b.tail = (0, 0, .1), (0, 0, .2)
bpy.ops.object.mode_set(mode='POSE')
con = o.pose.bones['torso'].constraints.new('COPY_LOCATION')
con.target, con.subtarget, con.influence = o, 'DEF-user-dependent', 0.
removed, retained = clean_unused_def(o)
check(retained == 1 and 'DEF-user-dependent' in o.data.bones, 'referenced DEF helper is retained')
o.pose.bones['torso'].constraints.remove(con)
removed, retained = clean_unused_def(o)
check(removed == 1 and 'DEF-user-dependent' not in o.data.bones, 'DEF helper removed after final dependency removed')
result = dict(version=bpy.app.version_string, checks=len(checks), passed=checks)
(ROOT / 'dist' / 'symmetry_upgrade_tests.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('SYMMETRY_UPGRADE_PASS', len(checks), flush=True)
