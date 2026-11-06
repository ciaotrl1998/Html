"""Build real Rigify rigs, with an independent, rest-offset-correct Bip skin layer.

Rigify is imported from Blender's own installation; no copied rig templates or
replacement IK solver are included in this add-on.
"""
import json
import bpy
import addon_utils
from mathutils import Vector
from .skeleton import activate, bone_name, link_name, select_pose_bone

_SNAP_NAMESPACE = None


def is_rigify(obj):
    return bool(obj and obj.get('biped_engine') == 'RIGIFY')


def ensure_rigify():
    if not hasattr(bpy.types.PoseBone, 'rigify_type'):
        # Rigify reads its own AddonPreferences while registering. default_set
        # creates that in-memory entry; no user preferences file is saved here.
        addon_utils.enable('rigify', default_set=True, persistent=True)
    if not hasattr(bpy.types.PoseBone, 'rigify_type'):
        raise ValueError('找不到 Rigify。请在 Blender 偏好设置的插件中启用 Rigify 后重试')


def _metarig(guide, context):
    config = json.loads(guide['biped_config'])
    prefix = guide['biped_prefix']
    h = config['height_cm'] / 100 / config.get('unit_scale', 1)
    names = set(guide.data.bones.keys())
    if any(b.length < h * .0001 for b in guide.data.bones):
        raise ValueError('体型中有过短骨骼，请先修正')
    if any(abs(v - 1) > 1e-5 for v in guide.scale):
        raise ValueError('请先对体型骨架应用对象缩放，再生成 Rigify')
    # Evaluate and validate the entire required naming set before making new data.
    from .skeleton import blueprint
    missing = [spec['name'] for spec in blueprint(config) if spec['name'] not in names]
    if missing:
        raise ValueError('体型缺少标准骨骼，请修正：' + ', '.join(missing[:4]))
    data = bpy.data.armatures.new(prefix + '_Rigify_Metarig')
    meta = bpy.data.objects.new(data.name, data)
    context.collection.objects.link(meta)
    meta.matrix_world = guide.matrix_world.copy()
    meta['biped_kind'] = 'METARIG'
    meta['biped_prefix'] = prefix
    mapping, types, groups = {}, {}, {}
    activate(meta, 'EDIT')

    def add(source_name, name, parent=None, connected=False, rig_type='', group='身体 Body'):
        src = guide.data.bones[source_name]
        b = data.edit_bones.new(name)
        b.head, b.tail = src.head_local, src.tail_local
        b.matrix = src.matrix_local.copy()
        b.length = src.length
        if parent:
            b.parent = data.edit_bones[parent]
            if connected:
                if (b.head - b.parent.tail).length > h * .002:
                    raise ValueError('相邻关节未接合，请在体型中修正：' + source_name)
                b.use_connect = True
        mapping[source_name], types[name], groups[name] = name, rig_type, group
        return name

    pelvis = bone_name(prefix, 'Pelvis')
    add(pelvis, 'spine', rig_type='spines.basic_spine' if config['spine_links'] >= 2 else 'basic.copy_chain')
    previous = 'spine'
    for i in range(config['spine_links']):
        name = f'spine.{i + 1:03d}'
        previous = add(bone_name(prefix, link_name('Spine', i)), name, previous, True)
    chest = previous
    previous = chest
    for i in range(config['neck_links']):
        previous = add(bone_name(prefix, link_name('Neck', i)), 'neck' if i == 0 else f'neck.{i:03d}',
                       previous, i > 0, 'spines.super_head' if i == 0 else '')
    add(bone_name(prefix, 'Head'), 'head', previous, True)
    for side in ('L', 'R'):
        suffix = '.' + side
        arm_group, leg_group = f'手臂 {side}', f'腿脚 {side}'
        previous = mapping[bone_name(prefix, 'Spine')] if config['triangle_pelvis'] else 'spine'
        leg_parts = ['Thigh', 'Calf'] + (['HorseLink'] if config['leg_links'] == '4' else []) + ['Foot']
        leg_meta = ['thigh', 'shin'] + (['hock'] if config['leg_links'] == '4' else []) + ['foot']
        for i, (part, base) in enumerate(zip(leg_parts, leg_meta)):
            previous = add(bone_name(prefix, part, side), base + suffix, previous, i > 0,
                           ('limbs.paw' if config['leg_links'] == '4' else 'limbs.leg') if i == 0 else '', leg_group)
        foot = data.edit_bones['foot' + suffix]
        # Rigify's leg needs one connected toe and an unconnected heel marker.
        # The synthetic toe drives every actual Bip toe as a child, preserving
        # arbitrary Biped toe counts and phalange lengths without branching the IK chain.
        toe = data.edit_bones.new('toe' + suffix)
        toe.head, toe.tail = foot.tail.copy(), foot.tail + Vector((0, -h * .048, 0))
        toe.parent, toe.use_connect = foot, True
        types[toe.name], groups[toe.name] = '', leg_group
        if config['leg_links'] == '3':
            heel = data.edit_bones.new('heel.02' + suffix)
            heel.head = (foot.head.x - h * .025, foot.head.y + h * .025, foot.tail.z)
            heel.tail = (foot.head.x + h * .025, foot.head.y + h * .025, foot.tail.z)
            heel.parent = foot
            types[heel.name], groups[heel.name] = '', leg_group
        for digit in range(config['toes']):
            previous = toe.name
            for j in range(config['toe_links']):
                previous = add(bone_name(prefix, link_name(f'Toe{digit}', j), side),
                               f'digit_toe{digit}_{j}' + suffix, previous, False,
                               'basic.super_copy', '脚趾 Digits')
        if config['arms']:
            shoulder = add(bone_name(prefix, 'Clavicle', side), 'shoulder' + suffix,
                           chest if config['triangle_neck'] else 'neck', False,
                           'basic.super_copy', arm_group)
            previous = shoulder
            for i, (part, base) in enumerate(zip(['UpperArm', 'Forearm', 'Hand'], ['upper_arm', 'forearm', 'hand'])):
                previous = add(bone_name(prefix, part, side), base + suffix, previous, i > 0,
                               'limbs.arm' if i == 0 else '', arm_group)
            for digit in range(config['fingers']):
                links = max(1, config['finger_links'] - int(digit == 0 and config['fingers'] > 1 and config['short_thumb']))
                previous = 'hand' + suffix
                for j in range(links):
                    previous = add(bone_name(prefix, link_name(f'Finger{digit}', j), side),
                                   f'finger{digit}.{j:02d}' + suffix, previous, j > 0,
                                   ('limbs.super_finger' if links >= 2 else 'basic.super_copy') if j == 0 else '',
                                   '手指 Fingers')
    # Other appendages are simple, independent Rigify FK controls.
    for source in guide.data.bones:
        if source.name in mapping or source.name == prefix:
            continue
        parent = mapping.get(source.parent.name, 'spine') if source.parent else 'spine'
        name = 'extra_' + source.name[len(prefix):].strip().replace(' ', '_')
        add(source.name, name, parent, False, 'basic.super_copy', '附加 Extras')
    bpy.ops.object.mode_set(mode='OBJECT')
    collection_names = list(dict.fromkeys(groups.values()))
    collections = {name: data.collections.new(name) for name in collection_names}
    fk_collection = data.collections.new('FK 控制')
    tweak_collection = data.collections.new('微调 Tweaks')
    fk_collection.rigify_ui_row = len(collections) + 1
    tweak_collection.rigify_ui_row = len(collections) + 2
    for i, collection in enumerate(collections.values()):
        collection.rigify_ui_row = i + 1
    for name, rig_type in types.items():
        pb = meta.pose.bones[name]
        pb.rigify_type = rig_type
        collections[groups[name]].assign(pb.bone)
        from rigify.utils.layers import ControlLayersOption
        if rig_type:
            if hasattr(pb.rigify_parameters, ControlLayersOption.FK.refs_option):
                ControlLayersOption.FK.set(pb.rigify_parameters, [fk_collection])
            if hasattr(pb.rigify_parameters, ControlLayersOption.TWEAK.refs_option):
                ControlLayersOption.TWEAK.set(pb.rigify_parameters, [tweak_collection])
        if rig_type in ('limbs.arm', 'limbs.leg', 'limbs.paw'):
            pb.rigify_parameters.segments = 1
            pb.rigify_parameters.bbones = 1
            pb.rigify_parameters.rotation_axis = 'automatic'
            if rig_type == 'limbs.leg':
                pb.rigify_parameters.extra_ik_toe = True
                pb.rigify_parameters.extra_toe_roll = True
        elif rig_type == 'spines.basic_spine':
            pb.rigify_parameters.pivot_pos = max(1, (config['spine_links'] + 1) // 2)
    return meta, mapping


def build_rigify(guide, context):
    from .symmetry import normalized_guide_copy, native_names
    from .cleanup import clean_unused_def
    activate(guide)
    source = normalized_guide_copy(guide, context)
    source_data = source.data
    try:
        obj = _build_rigify_raw(source, context)
        obj['biped_guide'] = guide
        native_names(obj)
        clean_unused_def(obj)
        obj['biped_version'] = '1.2.0'
        guide.hide_set(True)
        activate(obj, 'POSE')
        return obj
    finally:
        if bpy.context.object == source and source.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.data.objects.remove(source, do_unlink=True)
        if source_data.users == 0:
            bpy.data.armatures.remove(source_data)


def _build_rigify_raw(guide, context):
    activate(guide)
    ensure_rigify()
    from rigify.generate import Generator
    from rigify.base_generate import BaseGenerator
    meta = None
    before_objects = set(bpy.data.objects)
    try:
        meta, mapping = _metarig(guide, context)
        generator = Generator(context, meta)
        BaseGenerator.instance = generator
        try:
            generator.generate()
        finally:
            BaseGenerator.instance = None
        obj = generator.obj
        # Rigify creates a fresh target at identity. Its duplicated rest bones
        # remain in metarig-local coordinates; retain the fitted figure placement.
        obj.matrix_world = guide.matrix_world.copy()
        prefix = guide['biped_prefix']
        limbs = []
        for component in generator.rig_list:
            if not hasattr(component, 'get_ik_fk_position_chains'):
                continue
            org_name = component.bones.org.main[0]
            side = org_name[-1]
            kind = 'ARM' if 'upper_arm' in org_name else 'LEG'
            ik_chain, tail_chain, fk_chain = component.get_ik_fk_position_chains()
            ctrl = component.bones.ctrl
            limbs.append(dict(
                key=f'{kind.lower()}_{side}_ik', kind=kind, side=side, master=ctrl.master,
                target=ctrl.ik, pole=ctrl.ik_pole, fk=list(fk_chain),
                ik=list(ik_chain), tail=list(tail_chain),
                ik_controls=list(component.get_ik_control_chain()),
                extras=list(component.get_extra_ik_controls()),
                heel=ctrl.get('heel', ''),
                deform=[source for source, target in mapping.items() if 'ORG-' + target in component.bones.org.main],
            ))
            master = obj.pose.bones[ctrl.master]
            master['IK_FK'], master['IK_Stretch'], master['pole_vector'] = 0., 0., False
        obj['biped_kind'], obj['biped_engine'] = 'RIG', 'RIGIFY'
        obj['biped_prefix'], obj['biped_config'] = prefix, guide['biped_config']
        obj['biped_version'] = '1.2.0'
        obj['biped_rotation_ik'] = True
        obj['biped_limbs'] = json.dumps(limbs)
        obj['biped_guide'], obj['biped_metarig'] = guide, meta
        obj.name = f'{prefix} · Rigify 控制骨架'
        obj.show_in_front = True
        obj.data.display_type = 'OCTAHEDRAL'
        _add_bip_layer(obj, guide, mapping)
        obj.data.collections['FK 控制'].is_visible = False
        obj.data.collections['微调 Tweaks'].is_visible = False
        for pb in obj.pose.bones:
            if pb.custom_shape:
                pb.bone.color.palette = 'THEME03' if pb.name.endswith('.L') else (
                    'THEME04' if pb.name.endswith('.R') else 'THEME09')
        obj.update_tag()
        context.view_layer.update()
        activate(obj, 'POSE')
        for bone in obj.data.bones:
            select_pose_bone(obj, bone.name, False)
        obj.data.bones.active = obj.data.bones['root']
        select_pose_bone(obj, 'root', True)
        guide.hide_set(True)
        meta.hide_set(True)
        context.scene.biped_settings.rig = obj
        return obj
    except Exception:
        # Only remove objects created by this failed generation transaction.
        if context.object and context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        for obj in set(bpy.data.objects) - before_objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        activate(guide)
        raise


def _add_bip_layer(obj, guide, mapping):
    """Rigid rest offsets avoid orientation changes caused by Rigify's roll alignment."""
    prefix = guide['biped_prefix']
    activate(obj, 'EDIT')
    eb = obj.data.edit_bones
    controls = {b.name for b in eb}
    body = 'torso' if 'torso' in eb else 'spine'
    helpers = {}
    for i, source in enumerate(guide.data.bones):
        follow = eb.new(f'MCH-BipFollow.{i:03d}')
        follow.head, follow.tail = source.head_local, source.tail_local
        follow.matrix = source.matrix_local.copy()
        follow.length = source.length
        follow.parent = eb[body if source.name == prefix else 'ORG-' + mapping[source.name]]
        follow.use_deform = False
        helpers[source.name] = follow.name
        b = eb.new(source.name)
        b.head, b.tail = source.head_local, source.tail_local
        b.matrix = source.matrix_local.copy()
        b.length = source.length
        b.use_deform = True
    for source in guide.data.bones:
        if source.parent:
            eb[source.name].parent = eb[source.parent.name]
    bpy.ops.object.mode_set(mode='OBJECT')
    bip_collection = obj.data.collections.new('Bip · 蒙皮骨骼')
    helper_collection = obj.data.collections.new('Bip · 内部跟随')
    bip_collection.is_visible = helper_collection.is_visible = False
    for bone in obj.data.bones:
        bone.use_deform = bone.name in helpers
        if bone.name in controls:
            # Rigify decides which controls and mechanisms should be visible.
            continue
        for collection in list(bone.collections):
            collection.unassign(bone)
        if bone.name in helpers:
            bip_collection.assign(bone)
            pb = obj.pose.bones[bone.name]
            con = pb.constraints.new('COPY_TRANSFORMS')
            con.name, con.target, con.subtarget = 'Rigify → Bip', obj, helpers[bone.name]
            con.target_space = con.owner_space = 'POSE'
        else:
            helper_collection.assign(bone)
        bone.hide_select = True
    obj['biped_mapping'] = json.dumps(mapping)


def rigify_controls(obj):
    return [pb for pb in obj.pose.bones if pb.custom_shape and not pb.name.startswith(('ORG-', 'MCH-', 'DEF-'))]


def key_rigify(obj, frame):
    for pb in rigify_controls(obj):
        for path in ('location', 'scale', 'rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler'):
            pb.keyframe_insert(path, frame=frame, group=pb.name)
        for key in pb.keys():
            if isinstance(pb[key], (bool, int, float)):
                pb.keyframe_insert(f'["{key}"]', frame=frame, group=pb.name)


def reset_rigify(obj):
    for pb in rigify_controls(obj):
        pb.matrix_basis.identity()
    for limb in json.loads(obj['biped_limbs']):
        pb = obj.pose.bones[limb['master']]
        pb['IK_FK'], pb['IK_Stretch'], pb['pole_vector'] = 0., 0., False
    obj.update_tag()
    bpy.context.view_layer.update()


def _snap_namespace():
    """Compile only installed Rigify utilities, never code stored in a .blend."""
    global _SNAP_NAMESPACE
    if _SNAP_NAMESPACE is None:
        ensure_rigify()
        from rigify.rig_ui_template import UI_IMPORTS, UI_BASE_UTILITIES
        from rigify.utils.animation import SCRIPT_UTILITIES_BAKE, SCRIPT_UTILITIES_OP_SNAP
        from rigify.rigs.limbs.limb_rigs import SCRIPT_UTILITIES_OP_TOGGLE_POLE
        namespace = {'__name__': __name__ + '.native_snap'}
        sources = list(UI_IMPORTS) + [UI_BASE_UTILITIES % 'biped_native_snap']
        sources += SCRIPT_UTILITIES_BAKE + SCRIPT_UTILITIES_OP_TOGGLE_POLE + SCRIPT_UTILITIES_OP_SNAP
        exec('\n'.join(dict.fromkeys(sources)), namespace)
        _SNAP_NAMESPACE = namespace
    return _SNAP_NAMESPACE


def _native_runner(base_name, args, autokey=False):
    ns = _snap_namespace()
    runner = type('BipedNativeSnap', (ns[base_name], ns['RigifySingleUpdateMixin']), {})()
    for key, value in args.items():
        setattr(runner, key, value)
    runner.keyflags = ns['get_autokey_flags'](bpy.context, ignore_keyingset=True) if autokey else None
    runner.keyflags_switch = ns['add_flags_if_set'](runner.keyflags, {'INSERTKEY_AVAILABLE'})
    runner.init_execute(bpy.context)
    return runner


def switch_rigify(obj, limb, ik):
    """Use Rigify's own matching code, also after loading without embedded scripts."""
    activate(obj, 'POSE')
    if ik:
        base_name = 'RigifyLimbIk2FkBase'
        args = dict(prop_bone=limb['master'], fk_bones=json.dumps(limb['fk']),
                    ik_bones=json.dumps(limb['ik']), ctrl_bones=json.dumps(limb['ik_controls']),
                    tail_bones=json.dumps(limb['tail']), extra_ctrls=json.dumps(limb['extras']),
                    pole_prop='pole_vector')
    else:
        base_name = 'RigifyGenericSnapBase'
        args = dict(output_bones=json.dumps(limb['fk']), input_bones=json.dumps(limb['ik'] + limb['tail']),
                    ctrl_bones=json.dumps(limb['ik_controls'] + limb['tail'] + limb['extras']),
                    locks=(False, False, False), undo_copy_scale=False)
    runner = _native_runner(base_name, args, autokey=True)
    try:
        runner.before_save_state(bpy.context, obj)
        try:
            state = runner.save_frame_state(bpy.context, obj)
        finally:
            runner.after_save_state(bpy.context, obj)
        runner.apply_frame_state(bpy.context, obj, state)
    except (AttributeError, RuntimeError, KeyError) as exc:
        raise ValueError('Rigify 姿势匹配失败：' + str(exc)) from exc
    obj.pose.bones[limb['master']]['IK_FK'] = 0. if ik else 1.
    if 'FK 控制' in obj.data.collections and not ik:
        obj.data.collections['FK 控制'].is_visible = True
    obj.update_tag()
    bpy.context.view_layer.update()


def use_rotation_controls(obj, context):
    """Convert the current Rigify in place, keeping skinning and rest bones intact.

    If an action exists, sample its evaluated IK chains first, then convert each
    scene frame on a copy. The original action remains available as a backup.
    """
    activate(obj, 'POSE')
    scene, frame = context.scene, context.scene.frame_current
    limbs = json.loads(obj['biped_limbs'])
    runners = [_native_runner('RigifyLimbTogglePoleBase', dict(
        prop_bone=l['master'], pole_prop='pole_vector', fk_bones='[]',
        ik_bones=json.dumps(l['ik']), ctrl_bones=json.dumps(l['ik_controls']),
        tail_bones='[]', extra_ctrls=json.dumps(l['extras']), use_pole=False,
    )) for l in limbs]
    action = obj.animation_data.action if obj.animation_data else None
    new_action = None
    if action and scene.frame_end - scene.frame_start > 20000:
        raise ValueError('请将动画转换帧范围缩小至 20000 帧以内')
    try:
        if action:
            samples = {}
            for f in range(scene.frame_start, scene.frame_end + 1):
                scene.frame_set(f)
                context.view_layer.update()
                samples[f] = [runner.save_frame_state(context, obj) for runner in runners]
            new_action = action.copy()
            new_action.name = action.name + '_RotationIK'
            action.use_fake_user = True
            old_slot = obj.animation_data.action_slot
            obj.animation_data.action = new_action
            if old_slot:
                slot = next((s for s in new_action.slots if s.identifier == old_slot.identifier), None)
                if slot:
                    obj.animation_data.action_slot = slot
            for f, states in samples.items():
                scene.frame_set(f)
                for l, runner, state in zip(limbs, runners, states):
                    runner.apply_frame_state(context, obj, state)
                    pb = obj.pose.bones[l['ik_controls'][0]]
                    rotation = 'rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler'
                    pb.keyframe_insert(rotation, frame=f, group=pb.name)
                    master = obj.pose.bones[l['master']]
                    master.keyframe_insert('["pole_vector"]', frame=f, group=master.name)
                context.view_layer.update()
        else:
            for l, runner in zip(limbs, runners):
                if obj.pose.bones[l['master']].get('pole_vector'):
                    state = runner.save_frame_state(context, obj)
                    runner.apply_frame_state(context, obj, state)
        obj['biped_rotation_ik'], obj['biped_version'] = True, '1.2.0'
    except Exception:
        if new_action:
            obj.animation_data.action = action
        raise
    finally:
        scene.frame_set(frame)
        obj.update_tag()
        context.view_layer.update()
    return bool(action)
