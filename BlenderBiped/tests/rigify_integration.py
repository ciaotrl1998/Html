import sys
import json
from pathlib import Path
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import biped_builder
from biped_builder.rig import evaluated_pose
from biped_builder.skeleton import activate, create_guide
from biped_builder.rigify_backend import build_rigify, reset_rigify
from biped_builder.symmetry import export_name, find_pairs

CHECKS = []


def check(condition, description):
    if not condition:
        raise AssertionError(description)
    CHECKS.append(description)
    print('PASS', description, flush=True)


def matrices(obj, names):
    pose = evaluated_pose(obj)
    return [pose.bones[name].matrix.copy() for name in names]


def compare(a, b, tolerance, label):
    error = max(abs(x[i][j] - y[i][j]) for x, y in zip(a, b) for i in range(4) for j in range(4))
    print('METRIC', label, error, flush=True)
    check(error < tolerance, label)


def main():
    biped_builder.register()
    bpy.ops.biped.create_guide()
    assert bpy.ops.biped.generate() == {'FINISHED'}
    obj = bpy.context.object
    assert obj.get('biped_engine') == 'RIGIFY'
    check(obj.get('biped_engine') == 'RIGIFY', 'default generate operator uses real Rigify')
    limbs = json.loads(obj['biped_limbs'])
    check(len(limbs) == 4, 'four native Rigify limb components')
    prefix = obj['biped_prefix']
    guide = obj['biped_guide']
    bip_names = [b.name for b in obj.data.bones if b.use_deform]
    check(set(bip_names) == set(guide.data.bones.keys()), 'only original Biped names participate in skinning')
    check('DEF' not in obj.data.collections and not any(b.name.startswith('DEF-') for b in obj.data.bones),
          'unused Rigify DEF bones and collection are removed')
    check(obj.data.use_mirror_x and guide.data.use_mirror_x, 'native X-axis mirror enabled on figure and rig')
    check(all(bpy.utils.flip_name(n) in obj.data.bones for n in bip_names if n.endswith(('.L', '.R'))),
          'all Bip side bones have real native Blender mirror counterparts')
    check(all(obj.pose.bones[x['master']]['IK_FK'] == 0 for x in limbs), 'all hands and feet start in IK')
    check(all(not obj.pose.bones[x['master']]['pole_vector'] for x in limbs), 'all limbs default to native rotational IK')
    check(all(getattr(obj.pose.bones[x['pole']], 'hide', obj.data.bones[x['pole']].hide) for x in limbs),
          'all ball-shaped pole controls are hidden')
    compare(matrices(obj, bip_names), [guide.data.bones[n].matrix_local for n in bip_names], .003,
            'Rigify generation preserves Biped rest pose and rolls')
    for limb in limbs:
        target = obj.pose.bones[limb['target']]
        check(target.custom_shape is not None, limb['key'] + ' has Rigify widget')
        before = evaluated_pose(obj).bones[limb['deform'][-1]].head.copy()
        delta = Vector((-.08 if limb['side'] == 'L' else .08, -.12, .06)) if limb['kind'] == 'ARM' else Vector((.02, -.1, .09))
        # Exercise the same select-control + G transform path as the desktop UI.
        check(bpy.ops.biped.select_control(bone=limb['target']) == {'FINISHED'}, limb['key'] + ' select button')
        check(bpy.ops.transform.translate(value=delta, orient_type='GLOBAL') == {'FINISHED'},
              limb['key'] + ' pose-mode G transform')
        pose = evaluated_pose(obj)
        after = pose.bones[limb['deform'][-1]].head.copy()
        print('IK_ERROR_METRES', limb['key'], (after - before - delta).length, flush=True)
        check((after - before - delta).length < .003, limb['key'] + ' Bip end follows native IK controller')
        old = matrices(obj, limb['deform'])
        check(bpy.ops.biped.switch(key=limb['key'], ik=False) == {'FINISHED'}, limb['key'] + ' native snap to FK')
        compare(old, matrices(obj, limb['deform']), .006, limb['key'] + ' FK snap preserves Bip pose')
        check(bpy.ops.biped.switch(key=limb['key'], ik=True) == {'FINISHED'}, limb['key'] + ' native snap to IK')
        compare(old, matrices(obj, limb['deform']), .006, limb['key'] + ' IK snap preserves Bip pose')
    check(bpy.ops.biped.validate() == {'FINISHED'}, 'rig validator')
    # Binding hidden Bip bones must still produce usable skin weights.
    reset_rigify(obj)
    activate(obj)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=.12, location=(0, 0, 1.2))
    mesh = bpy.context.object
    check(bpy.ops.biped.bind_mesh() == {'FINISHED'}, 'automatic weight binding on Rigify-backed Bip bones')
    check(mesh.find_armature() == obj and bool(mesh.vertex_groups), 'bound mesh targets the Rigify rig')
    check(set(mesh.vertex_groups.keys()) <= set(bip_names), 'only Bip groups are generated for skinning')
    activate(obj, 'POSE')
    reset_rigify(obj)
    leg = next(x for x in limbs if x['key'] == 'leg_L_ik')
    arm = next(x for x in limbs if x['key'] == 'arm_L_ik')
    before = matrices(obj, leg['deform'])[-1].translation.copy()
    m = obj.pose.bones['torso'].matrix.copy()
    m.translation.z -= .12
    obj.pose.bones['torso'].matrix = m
    after = matrices(obj, leg['deform'])[-1].translation
    check((after - before).length < .002, 'Rigify torso moves down with feet planted')
    reset_rigify(obj)
    before = matrices(obj, leg['deform'])
    obj.pose.bones[leg['heel']].rotation_euler.x = .35
    after = matrices(obj, leg['deform'])
    check((after[-1].translation - before[-1].translation).length > .015, 'native foot heel widget drives foot roll')
    reset_rigify(obj)
    for l in limbs:
        reset_rigify(obj)
        before = matrices(obj, l['deform'])
        bpy.ops.biped.select_control(bone=l['ik_controls'][0])
        check(bpy.ops.transform.rotate(value=.7, orient_axis='Y', orient_type='LOCAL') == {'FINISHED'},
              l['key'] + ' native arrow accepts local R rotation')
        after = matrices(obj, l['deform'])
        check((after[1].translation - before[1].translation).length > .005,
              l['key'] + ' arrow rotation changes elbow or knee direction')
        check((after[-1].translation - before[-1].translation).length < .003,
              l['key'] + ' arrow rotation preserves hand or foot IK position')
    reset_rigify(obj)
    # Upgrade an existing 1.1 pole-mode pose without regenerating or moving it.
    for l in limbs:
        obj.pose.bones[l['master']]['pole_vector'] = True
    obj.update_tag()
    before = matrices(obj, bip_names)
    check(bpy.ops.biped.rotation_controls() == {'FINISHED'}, 'existing pole-mode rig converts in place')
    compare(before, matrices(obj, bip_names), .006, 'pole-to-arrow conversion preserves current Bip pose')
    reset_rigify(obj)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 3
    scene.frame_set(1)
    for l in limbs:
        obj.pose.bones[l['master']]['pole_vector'] = True
    obj.update_tag()
    check(bpy.ops.biped.key_pose() == {'FINISHED'}, 'key native Rigify controllers and custom properties')
    scene.frame_set(3)
    obj.pose.bones['root'].location.x += .35
    m = obj.pose.bones['torso'].matrix.copy()
    m.translation.z -= .06
    obj.pose.bones['torso'].matrix = m
    bpy.ops.biped.key_pose()
    samples = {}
    for frame in (1, 2, 3):
        scene.frame_set(frame)
        samples[frame] = matrices(obj, bip_names)
    original_action = obj.animation_data.action
    check(bpy.ops.biped.rotation_controls() == {'FINISHED'}, 'animated pole-mode rig converts on action copy')
    check(obj.animation_data.action != original_action and original_action.use_fake_user,
          'original action remains backed up')
    for frame in (1, 2, 3):
        scene.frame_set(frame)
        compare(samples[frame], matrices(obj, bip_names), .006, f'animated arrow conversion preserves frame {frame}')
        check(all(not obj.pose.bones[l['master']]['pole_vector'] for l in limbs),
              f'no animated return to ball pole at frame {frame}')
        samples[frame] = matrices(obj, bip_names)
    check(bpy.ops.biped.bake_skeleton() == {'FINISHED'}, 'native Rigify motion bakes to pure Bip skeleton')
    baked = bpy.context.object
    baked_names = [export_name(obj.data.bones[n]) for n in bip_names]
    check(set(baked.data.bones.keys()) == set(baked_names), 'baked skeleton restores exact standard Bip names')
    for frame in (1, 2, 3):
        scene.frame_set(frame)
        compare(samples[frame], matrices(baked, baked_names), .0005, f'Rigify to Bip bake frame {frame}')
    activate(obj, 'POSE')
    obj.animation_data_clear()
    reset_rigify(obj)
    # Preserve legacy objects and regenerate from their original figure in place.
    from biped_builder.rig import build_rig as build_legacy
    bpy.ops.biped.preset(kind='HUMAN')
    legacy_guide = create_guide(scene.biped_settings, bpy.context, compatible_names=False)
    legacy = build_legacy(legacy_guide, bpy.context)
    legacy['biped_guide'] = legacy_guide
    check(bpy.ops.biped.rebuild_rigify() == {'FINISHED'}, 'old rig rebuild button generates Rigify')
    upgraded = bpy.context.object
    check(legacy.name in bpy.data.objects and legacy.hide_get(), 'old rig retained and hidden after rebuild')
    check(upgraded.get('biped_engine') == 'RIGIFY', 'upgraded rig uses real Rigify')
    activate(upgraded)
    upgraded.hide_set(True)
    bpy.ops.biped.preset(kind='HUMAN')
    placed_guide = create_guide(scene.biped_settings, bpy.context)
    placed_guide.location = (2., 3., .5)
    placed_guide.rotation_euler.z = .35
    placed = build_rigify(placed_guide, bpy.context)
    pl = next(x for x in json.loads(placed['biped_limbs']) if x['key'] == 'arm_L_ik')
    before = placed.matrix_world @ matrices(placed, pl['deform'])[-1].translation
    expected = placed_guide.matrix_world @ placed_guide.data.bones[pl['deform'][-1]].head_local
    check((before - expected).length < .003, 'translated and rotated figure placement is preserved')
    bpy.ops.biped.select_control(bone=pl['target'])
    bpy.ops.transform.translate(value=(0, -.1, .04), orient_type='GLOBAL')
    after = placed.matrix_world @ matrices(placed, pl['deform'])[-1].translation
    check((after - before - Vector((0, -.1, .04))).length < .003,
          'world-space IK transforms work on translated and rotated characters')
    activate(placed)
    placed.hide_set(True)
    # Exercise the screenshot preset, short spine, maximum options and the paw component.
    for kind in ('REFERENCE', 'MIN', 'MAX', 'PAW'):
        bpy.ops.biped.preset(kind='REFERENCE' if kind == 'REFERENCE' else 'HUMAN')
        settings = scene.biped_settings
        settings.at_cursor = False
        if kind == 'MIN':
            settings.spine_links, settings.neck_links, settings.arms = 1, 1, False
        elif kind == 'MAX':
            settings.spine_links, settings.neck_links = 10, 25
            settings.finger_links, settings.short_thumb = 4, True
            settings.toes, settings.toe_links = 5, 3
            settings.tail_links, settings.ponytail1_links, settings.ponytail2_links = 25, 25, 25
            settings.prop1 = settings.prop2 = settings.prop3 = True
            settings.stance = 'A'
        elif kind == 'PAW':
            settings.leg_links = '4'
        g = create_guide(settings, bpy.context)
        r = build_rigify(g, bpy.context)
        check(r.get('biped_engine') == 'RIGIFY', kind + ' generates real Rigify')
        ls = json.loads(r['biped_limbs'])
        check(len(ls) == (2 if kind == 'MIN' else 4), kind + ' has expected native limb count')
        l = next(x for x in ls if x['kind'] == 'LEG')
        before = matrices(r, l['deform'])[-1].translation.copy()
        bpy.ops.biped.select_control(bone=l['target'])
        bpy.ops.transform.translate(value=(0, -.08, .08), orient_type='GLOBAL')
        after = matrices(r, l['deform'])[-1].translation.copy()
        check((after - before).length > .05, kind + ' foot IK moves Bip foot')
        activate(r)
        r.hide_set(True)
    # Save a new demo; old 1.0 demo is preserved for comparison.
    activate(obj, 'POSE')
    scene.biped_settings.rig = obj
    scene.frame_start, scene.frame_end = 1, 48
    scene.frame_set(1)
    reset_rigify(obj)
    bpy.ops.biped.key_pose()
    scene.frame_set(24)
    m = obj.pose.bones['torso'].matrix.copy()
    m.translation.z -= .08
    obj.pose.bones['torso'].matrix = m
    bpy.ops.biped.select_control(bone=arm['target'])
    bpy.ops.transform.translate(value=(-.12, -.18, .1), orient_type='GLOBAL')
    obj.pose.bones[leg['heel']].rotation_euler.x = .3
    bpy.ops.biped.key_pose()
    scene.frame_set(48)
    reset_rigify(obj)
    bpy.ops.biped.key_pose()
    scene.frame_set(1)
    keep = {obj, guide, obj['biped_metarig']}
    widget_objects = {pb.custom_shape for pb in obj.pose.bones if pb.custom_shape}
    activate(obj, 'POSE')
    for candidate in list(bpy.data.objects):
        if candidate not in keep and candidate not in widget_objects:
            bpy.data.objects.remove(candidate, do_unlink=True)
    # Save only the primary rig's generated UI; test-only UI texts are discarded.
    main_text = obj['biped_metarig'].data.rigify_rig_ui
    for text in list(bpy.data.texts):
        if text != main_text:
            bpy.data.texts.remove(text)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_location = (0, 0, .95)
            area.spaces.active.region_3d.view_distance = 3.5
            from mathutils import Quaternion
            import math
            area.spaces.active.region_3d.view_rotation = Quaternion((1, 0, 0), math.pi / 2)
            area.spaces.active.show_region_ui = True
    path = ROOT / 'dist' / 'Biped_Rigify_1.2.0_Demo.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    result = dict(version=bpy.app.version_string, engine='RIGIFY', checks=len(CHECKS), passed=CHECKS)
    (ROOT / 'dist' / f'symmetry_tests_{bpy.app.version_string.split()[0]}.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('RIGIFY_TEST_PASS', bpy.app.version_string, len(CHECKS), flush=True)


if __name__ == '__main__':
    main()
