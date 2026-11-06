"""Run with blender --background --factory-startup --python tests/blender_integration.py.
Real dependency-graph tests: no mocked bpy or IK solver.
"""
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import biped_builder
from biped_builder.skeleton import activate, create_guide, bone_name, blueprint, config_from_settings
from biped_builder.rig import build_rig, evaluated_pose, switch_limb

CHECKS = []


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    CHECKS.append(message)
    print('PASS', message, flush=True)


def matrices(obj, names):
    pose = evaluated_pose(obj)
    return [pose.bones[name].matrix.copy() for name in names]


def matrix_error(a, b):
    return max(abs(a[i][j] - b[i][j]) for i in range(4) for j in range(4))


def compare(before, after, tolerance, message):
    error = max(matrix_error(a, b) for a, b in zip(before, after))
    print('ERROR_METRIC', message, error, flush=True)
    check(error < tolerance, f'{message} (max error {error:.8f})')


def run():
    biped_builder.register()
    s = bpy.context.scene.biped_settings
    check(s.height_cm == 180 and s.fingers == 5, 'registration and default properties')
    bpy.ops.biped.preset(kind='REFERENCE')
    check(s.height_cm > 315 and s.toe_links == 3 and s.fingers == 1
          and s.triangle_pelvis and not s.triangle_neck, 'reference screenshot preset')
    bpy.ops.biped.preset(kind='HUMAN')
    s.at_cursor = False
    guide = create_guide(s, bpy.context)
    prefix = guide['biped_prefix']
    check(prefix == 'Bip001', 'default root is Bip001')
    names = set(guide.data.bones.keys())
    check({prefix + ' Spine', prefix + ' Spine3', prefix + ' L Finger0',
           prefix + ' R Finger42', prefix + ' L Toe0', prefix + ' L Clavicle'} <= names,
          'Biped spine, side, finger, toe and clavicle naming')
    rig = build_rig(guide, bpy.context)
    rig['biped_guide'] = guide
    limbs = json.loads(rig['biped_limbs'])
    check(len(limbs) == 4, 'four IK/FK chains')
    check(all(not b.use_deform for b in rig.data.bones if b.name.startswith(('CTRL_', 'MCH_'))),
          'helper and control bones excluded from skinning')
    for limb in limbs:
        actual = matrices(rig, limb['deform'])
        rest = [rig.data.bones[name].matrix_local for name in limb['deform']]
        compare(actual, rest, .003, 'initial rest pose ' + limb['key'])
    check(bpy.ops.biped.validate() == {'FINISHED'}, 'rig validator')

    arm = next(x for x in limbs if x['key'] == 'arm_L_ik')
    leg = next(x for x in limbs if x['key'] == 'leg_L_ik')
    # Nontrivial FK rotation, then round-trip matching.
    rig.pose.bones[arm['fk'][0]].rotation_euler.z = .32
    rig.pose.bones[arm['fk'][1]].rotation_euler.x = -.45
    rig.pose.bones[arm['fk'][-1]].rotation_euler.y = .18
    before = matrices(rig, arm['deform'])
    switch_limb(rig, arm, True)
    compare(before, matrices(rig, arm['deform']), .006, 'rotated arm FK to IK preserves pose')
    switch_limb(rig, arm, False)
    compare(before, matrices(rig, arm['deform']), .006, 'arm IK to FK preserves pose')
    bpy.ops.biped.reset_pose()

    for limb in (arm, leg):
        switch_limb(rig, limb, True)
        target = rig.pose.bones[limb['target']]
        m = target.matrix.copy()
        m.translation += Vector((-.07, -.10, .06)) if limb['kind'] == 'ARM' else Vector((.02, -.12, .08))
        target.matrix = m
        pose = evaluated_pose(rig)
        actual = pose.bones[limb['deform'][-1]].head.copy()
        goal = pose.bones[limb['effector']].head.copy()
        error = (actual - goal).length
        check(error < .002, f'{limb["kind"]} IK follows reachable target: {error:.7f}m')
        rest_lengths = [rig.data.bones[name].length for name in limb['deform'][:-1]]
        lengths = [(pose.bones[name].tail - pose.bones[name].head).length for name in limb['deform'][:-1]]
        check(max(abs(a - b) for a, b in zip(rest_lengths, lengths)) < .0001,
              limb['kind'] + ' IK does not stretch')
        before = matrices(rig, limb['deform'])
        switch_limb(rig, limb, False)
        compare(before, matrices(rig, limb['deform']), .006, limb['kind'] + ' moved IK to FK preserves pose')
        switch_limb(rig, limb, True)
        compare(before, matrices(rig, limb['deform']), .006, limb['kind'] + ' round trip FK to IK preserves pose')
    bpy.ops.biped.reset_pose()

    before = matrices(rig, leg['deform'])[-1].translation.copy()
    m = rig.pose.bones[prefix].matrix.copy()
    m.translation.z -= .12
    rig.pose.bones[prefix].matrix = m
    after = matrices(rig, leg['deform'])[-1].translation.copy()
    check((after - before).length < .002, 'foot remains planted when COM moves down')
    rig.pose.bones['CTRL_Global'].location.x = 1.25
    after = matrices(rig, leg['deform'])[-1].translation.copy()
    check(abs(after.x - before.x - 1.25) < .002, 'global controller moves feet with character')
    bpy.ops.biped.reset_pose()

    target = rig.pose.bones[leg['target']]
    ankle_before = matrices(rig, leg['deform'])[-1].translation.copy()
    target['foot_roll'] = 30.
    rig.update_tag()
    pose = evaluated_pose(rig)
    ankle_after = pose.bones[leg['deform'][-1]].head.copy()
    check(ankle_after.z > ankle_before.z + .02, 'positive foot roll lifts heel')
    toe = prefix + ' L Toe0'
    check(abs(pose.bones[toe].head.z - rig.data.bones[toe].head_local.z) < .003,
          'ball roll keeps toe base on floor')
    before = matrices(rig, leg['deform'] + [toe])
    switch_limb(rig, leg, False)
    compare(before, matrices(rig, leg['deform'] + [toe]), .006,
            'foot roll pose including toe preserved when switching to FK')
    switch_limb(rig, leg, True)
    compare(before, matrices(rig, leg['deform'] + [toe]), .006,
            'foot roll pose including toe preserved when switching back to IK')
    bpy.ops.biped.reset_pose()
    check(bpy.ops.biped.key_pose() == {'FINISHED'}, 'all controls and custom properties can be keyed')
    check(rig.animation_data and rig.animation_data.action, 'keyed action exists')

    # Bake two distinct poses including the independent global-controller motion.
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 3
    scene.frame_set(3)
    rig.pose.bones['CTRL_Global'].location.x = .4
    m = rig.pose.bones[prefix].matrix.copy()
    m.translation.z -= .07
    rig.pose.bones[prefix].matrix = m
    bpy.ops.biped.key_pose()
    snapshots = {}
    deform_names = [b.name for b in rig.data.bones if b.use_deform]
    for frame in (1, 2, 3):
        scene.frame_set(frame)
        snapshots[frame] = matrices(rig, deform_names)
    activate(rig, 'POSE')
    check(bpy.ops.biped.bake_skeleton() == {'FINISHED'}, 'clean animation bake operator')
    baked = bpy.context.object
    check(baked.data.bones[prefix].parent is None, 'baked COM is a root bone')
    check(set(baked.data.bones.keys()) == set(deform_names), 'bake contains only Biped deform names')
    check(all(not pb.constraints for pb in baked.pose.bones), 'bake has no rig constraints')
    for frame in (1, 2, 3):
        scene.frame_set(frame)
        compare(snapshots[frame], matrices(baked, deform_names), .0005,
                f'bake reproduces evaluated deformation and global movement at frame {frame}')
    baked.hide_set(True)

    # Actual mirror operation on names that Blender native .L/.R mirroring cannot handle.
    activate(guide, 'EDIT')
    for b in guide.data.edit_bones:
        b.select = b.select_head = b.select_tail = False
    left = guide.data.edit_bones[prefix + ' L Forearm']
    left.use_connect = False
    left.head.y += .03
    left.select = True
    expected = left.head.copy()
    bpy.ops.biped.mirror_figure(direction='L')
    right = guide.data.edit_bones[prefix + ' R Forearm']
    check((right.head - Vector((-expected.x, expected.y, expected.z))).length < 1e-6,
          'figure mirror works with Biped spaced L/R names')
    bpy.ops.object.mode_set(mode='OBJECT')
    guide.hide_set(True)

    # Minimum and maximum topology; no arms must still yield working legs.
    for kind in ('MIN', 'MAX', 'HORSE'):
        bpy.ops.biped.preset(kind='HUMAN')
        s.root_name = 'Bip001'
        s.at_cursor = False
        if kind == 'MIN':
            s.arms, s.spine_links, s.neck_links = False, 1, 1
        elif kind == 'MAX':
            s.neck_links, s.spine_links, s.finger_links, s.toes, s.toe_links = 25, 10, 4, 5, 3
            s.tail_links, s.ponytail1_links, s.ponytail2_links = 25, 25, 25
            s.prop1 = s.prop2 = s.prop3 = True
            s.short_thumb = True
            s.triangle_pelvis, s.triangle_neck = True, False
            s.stance = 'A'
        else:
            s.leg_links = '4'
        g = create_guide(s, bpy.context)
        r = build_rig(g, bpy.context)
        r['biped_guide'] = g
        check(r['biped_prefix'] != prefix, kind + ' uses unique character prefix')
        ls = json.loads(r['biped_limbs'])
        check(len(ls) == (2 if kind == 'MIN' else 4), kind + ' topology builds')
        check(bpy.ops.biped.validate() == {'FINISHED'}, kind + ' passes rig validation')
        if kind == 'HORSE':
            check(any('HorseLink' in b.name for b in r.data.bones if b.use_deform), 'horse link naming')
            l = next(x for x in ls if x['kind'] == 'LEG')
            check(r.pose.bones[l['ik'][-2]].constraints['Biped IK'].chain_count == 3,
                  'horse leg uses a three-segment IK chain')
        if kind == 'MIN':
            bpy.context.scene.unit_settings.scale_length = .01
            centimeter_config = config_from_settings(s)
            centimeter_head = next(b for b in blueprint(centimeter_config) if b['name'].endswith(' Head'))
            check(abs(centimeter_head['tail'][2] - 180) < .001, 'height respects centimetre scene unit scale')
            bpy.context.scene.unit_settings.scale_length = 1
        activate(r)
        r.hide_set(True)

    # Automatic weights must use deformation bones and keep the armature modifier valid.
    activate(rig)
    bpy.context.scene.biped_settings.rig = rig
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=.15, location=(0, 0, 1.2))
    mesh = bpy.context.object
    check(bpy.ops.biped.bind_mesh() == {'FINISHED'}, 'automatic mesh binding operator')
    check(mesh.find_armature() == rig and len(mesh.vertex_groups) > 0, 'mesh has weights and correct armature')
    helpers = {b.name for b in rig.data.bones if not b.use_deform}
    check(not (helpers & set(mesh.vertex_groups.keys())), 'automatic weights exclude IK/FK helpers')

    # Restore a useful example file containing only the primary rig and its guide.
    activate(rig, 'POSE')
    bpy.context.scene.biped_settings.rig = rig
    bpy.ops.biped.reset_pose()
    scene.frame_set(1)
    scene.frame_start, scene.frame_end = 1, 48
    bpy.ops.biped.key_pose()
    scene.frame_set(24)
    m = rig.pose.bones[prefix].matrix.copy()
    m.translation.z -= .08
    rig.pose.bones[prefix].matrix = m
    foot = rig.pose.bones[leg['target']]
    foot['foot_roll'] = 20.
    switch_limb(rig, arm, True)
    m = rig.pose.bones[arm['target']].matrix.copy()
    m.translation += Vector((-.12, -.15, .07))
    rig.pose.bones[arm['target']].matrix = m
    bpy.ops.biped.key_pose()
    scene.frame_set(48)
    bpy.ops.biped.reset_pose()
    bpy.ops.biped.key_pose()
    scene.frame_set(1)
    rig.update_tag()
    evaluated_pose(rig)
    check(rig.data.bones[arm['target']].hide, 'frame change refreshes FK control visibility')
    scene.frame_set(24)
    check(not rig.data.bones[arm['target']].hide, 'frame change refreshes IK control visibility')
    scene.frame_set(1)
    for obj in list(bpy.data.objects):
        if obj in (rig, guide) or obj.get('biped_widget') == prefix:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_location = (0, 0, .95)
            area.spaces.active.region_3d.view_distance = 3.8
            # Front perspective with a slight turn so poles and foot controls read clearly.
            from mathutils import Quaternion
            area.spaces.active.region_3d.view_rotation = Quaternion((1, 0, 0), math.radians(78))
            area.spaces.active.show_region_ui = True
            area.spaces.active.overlay.show_floor = True
    path = ROOT / 'dist' / 'Biped_Builder_Demo.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    result = {'blender': bpy.app.version_string, 'checks': len(CHECKS), 'passed': CHECKS,
              'demo': str(path), 'status': 'PASS'}
    (ROOT / 'dist' / f'test_results_{bpy.app.version_string.split()[0]}.json').write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
    biped_builder.unregister()
    biped_builder.register()
    biped_builder.unregister()
    print('BIPED_TESTS_COMPLETE', json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    try:
        run()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
