"""Native Blender IK/FK rig. Export bones retain the unmodified Biped names."""
import json
import math
import bpy
from mathutils import Matrix, Vector
from .skeleton import activate, bone_name


def evaluated_pose(obj):
    bpy.context.view_layer.update()
    return obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).pose


def drive(constraint, obj, key):
    driver = constraint.driver_add('influence').driver
    driver.type = 'SCRIPTED'
    var = driver.variables.new()
    var.name, var.type = 'blend', 'SINGLE_PROP'
    var.targets[0].id = obj
    var.targets[0].data_path = f'["{key}"]'
    driver.expression = 'blend'


def copy_constraint(pose_bone, obj, subtarget, kind='COPY_TRANSFORMS', name='Biped'):
    con = pose_bone.constraints.new(kind)
    con.name, con.target, con.subtarget = name, obj, subtarget
    con.owner_space = con.target_space = 'POSE'
    return con


def make_widgets(prefix, scene):
    collection = bpy.data.collections.new(f'{prefix} · 控制器形状')
    scene.collection.children.link(collection)
    widgets = {}
    cube_vertices = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    cube_edges = [(a, b) for a in range(8) for b in range(a + 1, 8)
                  if sum(cube_vertices[a][j] != cube_vertices[b][j] for j in range(3)) == 1]
    ring = [(math.cos(i * math.tau / 32), 0, math.sin(i * math.tau / 32)) for i in range(32)]
    diamond = [(1, 0, 0), (0, 1, 0), (-1, 0, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
    for kind, vertices, edges in [
        ('box', cube_vertices, cube_edges),
        ('ring', ring, [(i, (i + 1) % 32) for i in range(32)]),
        ('diamond', diamond, [(i, (i + 1) % 4) for i in range(4)] + [(i, j) for i in range(4) for j in (4, 5)]),
    ]:
        mesh = bpy.data.meshes.new(f'WGT_{prefix}_{kind}')
        mesh.from_pydata(vertices, edges, [])
        mesh.update()
        obj = bpy.data.objects.new(mesh.name, mesh)
        collection.objects.link(obj)
        obj.hide_render = True
        obj.hide_set(True)
        obj['biped_widget'] = prefix
        widgets[kind] = obj
    return widgets


def apply_widget(pb, widgets, kind, size):
    pb.custom_shape = widgets[kind]
    pb.use_custom_shape_bone_size = False
    pb.custom_shape_scale_xyz = (size,) * 3


def calibrate_pole(obj, limb):
    """Find the pole offset that reproduces the edited rest bend, including mirrored rolls."""
    con = obj.pose.bones[limb['ik'][-2]].constraints['Biped IK']
    references = [(name, obj.data.bones[name].head_local.copy()) for name in limb['ik'][1:-1]]

    def error(angle):
        con.pole_angle = (angle + math.pi) % math.tau - math.pi
        pose = evaluated_pose(obj)
        return sum((pose.bones[name].head - point).length_squared for name, point in references)

    step = math.tau / 16
    best = min((error(-math.pi + i * step), -math.pi + i * step) for i in range(16))[1]
    low, high = best - step, best + step
    for _ in range(20):
        a, b = low + (high - low) / 3, high - (high - low) / 3
        if error(a) < error(b):
            high = b
        else:
            low = a
    error((low + high) / 2)


def build_rig(guide, context):
    activate(guide)
    config = json.loads(guide['biped_config'])
    prefix, h = guide['biped_prefix'], config['height_cm'] / 100 / config.get('unit_scale', 1)
    required = [guide['biped_prefix'], bone_name(prefix, 'Pelvis'), bone_name(prefix, 'Head')]
    for side in ('L', 'R'):
        required += [bone_name(prefix, part, side) for part in ('Thigh', 'Calf', 'Foot')]
        if config['leg_links'] == '4':
            required.append(bone_name(prefix, 'HorseLink', side))
        if config['arms']:
            required += [bone_name(prefix, part, side) for part in ('Clavicle', 'UpperArm', 'Forearm', 'Hand')]
        required += [bone_name(prefix, f'Toe{i}', side) for i in range(config['toes'])]
    missing = [name for name in required if name not in guide.data.bones]
    if missing:
        raise ValueError('体型缺少骨骼，请撤销删除或重新创建：' + ', '.join(missing[:4]))
    if any(b.length < h * .0001 for b in guide.data.bones):
        raise ValueError('体型中有长度为零或过短的骨骼，请先修正')
    if any(abs(v - 1) > 1e-5 for v in guide.scale):
        raise ValueError('请先在对象模式对体型骨架应用缩放（Ctrl+A → 缩放），再生成')
    # A copied armature preserves manual edits, rolls and the exact chosen hierarchy.
    obj = bpy.data.objects.new(f'{prefix} · 控制骨架', guide.data.copy())
    context.collection.objects.link(obj)
    obj.matrix_world = guide.matrix_world.copy()
    obj['biped_kind'], obj['biped_prefix'], obj['biped_config'] = 'RIG', prefix, guide['biped_config']
    obj['biped_version'] = '1.0.0'
    obj.show_in_front = True
    obj.data.display_type = 'OCTAHEDRAL'
    source_names = [b.name for b in obj.data.bones]
    activate(obj, 'EDIT')
    eb = obj.data.edit_bones
    global_bone = eb.new('CTRL_Global')
    global_bone.head, global_bone.tail = (0, 0, 0), (0, 0, h * .12)
    global_bone.use_deform = False
    eb[prefix].parent = global_bone
    eb[prefix].use_connect = False

    def duplicate(source, name, parent):
        original = eb[source]
        b = eb.new(name)
        b.head, b.tail, b.roll = original.head.copy(), original.tail.copy(), original.roll
        b.use_deform = False
        b.parent = eb[parent]
        return b

    def pivot(name, position, parent, orientation=None):
        b = eb.new(name)
        b.head, b.tail = position, Vector(position) + Vector((0, h * .04, 0))
        if orientation:
            b.matrix = orientation.copy()
            b.head = position
            b.length = h * .04
        b.use_deform, b.parent = False, eb[parent]
        return b

    limbs = []
    for side in ('L', 'R'):
        parts = [('LEG', ['Thigh', 'Calf'] + (['HorseLink'] if config['leg_links'] == '4' else []) + ['Foot'])]
        if config['arms']:
            parts.append(('ARM', ['UpperArm', 'Forearm', 'Hand']))
        for kind, names in parts:
            deform = [bone_name(prefix, name, side) for name in names]
            missing = [name for name in deform if name not in eb]
            if missing:
                raise ValueError('体型缺少骨骼：' + ', '.join(missing))
            parent = eb[deform[0]].parent.name
            fk_names, ik_names = [], []
            for tag, result in [('FK', fk_names), ('IK', ik_names)]:
                for i, source in enumerate(deform):
                    target = f'{"CTRL" if tag == "FK" else "MCH"}_{side}_{names[i]}_{tag}'
                    duplicate(source, target, result[-1] if result else parent)
                    result.append(target)
            result_names = []
            for source, ik_name in zip(deform, ik_names):
                name = ik_name + '_Result'
                duplicate(source, name, ik_name)
                result_names.append(name)
            target_name, pole_name = f'CTRL_{side}_{names[-1]}_IK', f'CTRL_{side}_{kind}_Pole'
            duplicate(deform[-1], target_name, 'CTRL_Global')
            root = eb[deform[0]].head.copy()
            joint = eb[deform[1]].head.copy()
            end = eb[deform[-1]].head.copy()
            axis = end - root
            projected = root + axis * ((joint - root).dot(axis) / max(axis.length_squared, 1e-12))
            bend = joint - projected
            if bend.length < h * .001:
                bend = Vector((0, 1 if kind == 'ARM' else -1, 0))
            pole = joint + bend.normalized() * h * .24
            pivot(pole_name, pole, 'CTRL_Global')
            limb = dict(side=side, kind=kind, deform=deform, fk=fk_names, ik=ik_names,
                        result=result_names, target=target_name, pole=pole_name, key=f'{kind.lower()}_{side}_ik')
            if kind == 'LEG':
                ankle, ball = eb[deform[-1]].head.copy(), eb[deform[-1]].tail.copy()
                heel = Vector((ankle.x, ankle.y + h * .035, ball.z))
                toe = ball + Vector((0, -h * .048, 0))
                heel_b = pivot(f'MCH_{side}_Heel', heel, target_name)
                toe_b = pivot(f'MCH_{side}_ToePivot', toe, heel_b.name)
                ball_b = pivot(f'MCH_{side}_Ball', ball, toe_b.name)
                ankle_b = duplicate(deform[-1], f'MCH_{side}_Ankle', ball_b.name)
                limb['effector'] = ankle_b.name
                limb['roll'] = [heel_b.name, ball_b.name, toe_b.name]
                limb['toe_follow'] = []
                for digit in range(config['toes']):
                    source = bone_name(prefix, f'Toe{digit}', side)
                    helper = duplicate(source, f'MCH_{side}_Toe{digit}_Follow', toe_b.name)
                    limb['toe_follow'].append([source, helper.name])
            else:
                limb['effector'] = target_name
            limbs.append(limb)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj['biped_limbs'] = json.dumps(limbs)
    data = obj.data
    for collection in list(data.collections):
        data.collections.remove(collection)
    collections = {name: data.collections.new(name) for name in
                   ('身体 · Body', '左臂 · L Arm', '右臂 · R Arm', '左腿 · L Leg', '右腿 · R Leg',
                    '手指脚趾 · Digits', '附加 · Extras', '变形 · Deform', '内部 · Mechanism')}
    collections['内部 · Mechanism'].is_visible = False
    collections['变形 · Deform'].is_visible = True
    widgets = make_widgets(prefix, context.scene)
    limb_deforms = {name for limb in limbs for name in limb['deform']}
    for bone in data.bones:
        pb = obj.pose.bones[bone.name]
        pb.rotation_mode = 'XYZ'
        bone.color.palette = 'THEME03' if (' L ' in bone.name or '_L_' in bone.name) else (
            'THEME04' if (' R ' in bone.name or '_R_' in bone.name) else 'THEME09')
        if bone.name.startswith('MCH_'):
            collections['内部 · Mechanism'].assign(bone)
            bone.hide_select = True
        elif bone.name in limb_deforms:
            collections['变形 · Deform'].assign(bone)
            bone.hide_select = True
        elif ' Finger' in bone.name or ' Toe' in bone.name:
            collections['手指脚趾 · Digits'].assign(bone)
        elif any(token in bone.name for token in ('Tail', 'Ponytail', 'Prop')):
            collections['附加 · Extras'].assign(bone)
        elif not bone.name.startswith('CTRL_') or bone.name == 'CTRL_Global':
            collections['身体 · Body'].assign(bone)
            size = h * (.14 if bone.name == 'CTRL_Global' else .095 if bone.name == prefix
                        else .065 if bone.name.endswith('Pelvis') else .035)
            apply_widget(pb, widgets, 'ring', size)
        if bone.name in source_names:
            bone.use_deform = True
    for limb in limbs:
        key = limb['key']
        obj[key] = 1.0 if limb['kind'] == 'LEG' else 0.0
        obj.id_properties_ui(key).update(min=0.0, max=1.0, description='0 = FK，1 = IK')
        label = ('左' if limb['side'] == 'L' else '右') + ('臂 · ' if limb['kind'] == 'ARM' else '腿 · ')
        collection = collections[label + limb['side'] + (' Arm' if limb['kind'] == 'ARM' else ' Leg')]
        for name in limb['fk'] + [limb['target'], limb['pole']]:
            collection.assign(data.bones[name])
            pb = obj.pose.bones[name]
            apply_widget(pb, widgets, 'diamond' if name == limb['pole'] else 'box',
                         h * (.018 if name == limb['pole'] else .025))
            if name in limb['fk']:
                pb.lock_location = (True,) * 3
            pb.lock_scale = (True,) * 3
        con = obj.pose.bones[limb['ik'][-2]].constraints.new('IK')
        con.name = 'Biped IK'
        con.target, con.subtarget = obj, limb['effector']
        con.pole_target, con.pole_subtarget = obj, limb['pole']
        con.chain_count, con.use_stretch, con.iterations = len(limb['ik']) - 1, False, 128
        for name in limb['ik']:
            obj.pose.bones[name].ik_stretch = 0
        copy_constraint(obj.pose.bones[limb['ik'][-1]], obj, limb['effector'], 'COPY_ROTATION', 'IK end rotation')
        for name in limb['result']:
            obj.pose.bones[name].rotation_mode = 'QUATERNION'
        for deform, fk, ik in zip(limb['deform'], limb['fk'], limb['result']):
            copy_constraint(obj.pose.bones[deform], obj, fk, name='Biped FK')
            drive(copy_constraint(obj.pose.bones[deform], obj, ik, name='Biped IK blend'), obj, key)
        if limb['kind'] == 'LEG':
            pb = obj.pose.bones[limb['target']]
            pb['foot_roll'] = 0.0
            pb.id_properties_ui('foot_roll').update(min=-60.0, max=100.0, description='脚跟 / 脚掌 / 脚尖滚动（度）')
            for name, expr in zip(limb['roll'], ['min(roll, 0)', 'min(max(roll, 0), 45)', 'max(roll - 45, 0)']):
                d = obj.pose.bones[name].driver_add('rotation_euler', 0).driver
                d.type = 'SCRIPTED'
                var = d.variables.new()
                var.name, var.type = 'roll', 'SINGLE_PROP'
                var.targets[0].id = obj
                var.targets[0].data_path = f'pose.bones["{limb["target"]}"]["foot_roll"]'
                d.expression = f'({expr}) * 0.0174532925199433'
            for source, helper in limb['toe_follow']:
                obj.pose.bones[helper].rotation_mode = 'QUATERNION'
                drive(copy_constraint(obj.pose.bones[source], obj, helper, 'COPY_ROTATION', 'Biped toe ground'), obj, key)
        calibrate_pole(obj, limb)
    # Show FK controls for FK limbs, and IK target/pole for IK limbs. Controls remain
    # selectable through the panel irrespective of this manually refreshed visibility.
    refresh_controls(obj)
    evaluated_pose(obj)
    guide.hide_render = True
    guide.hide_set(True)
    context.scene.biped_settings.rig = obj
    activate(obj, 'POSE')
    return obj


def refresh_controls(obj):
    if obj.get('biped_engine') == 'RIGIFY':
        return
    for limb in json.loads(obj['biped_limbs']):
        ik = obj.get(limb['key'], 0) >= .5
        for name in limb['fk']:
            if name in obj.data.bones:
                obj.data.bones[name].hide = ik
        for name in (limb['target'], limb['pole']):
            if name in obj.data.bones:
                obj.data.bones[name].hide = not ik


def pole_matrix(obj, limb, matrices):
    a, b, c = (matrices[0].translation, matrices[1].translation, matrices[-1].translation)
    axis = c - a
    projection = a + axis * ((b - a).dot(axis) / max(axis.length_squared, 1e-12))
    direction = b - projection
    if direction.length < .0001:
        direction = obj.pose.bones[limb['pole']].matrix.translation - b
    if direction.length < .0001:
        direction = Vector((0, 1 if limb['kind'] == 'ARM' else -1, 0))
    matrix = obj.pose.bones[limb['pole']].matrix.copy()
    distance = sum(obj.data.bones[name].length for name in limb['deform'][:-1]) * .65
    matrix.translation = b + direction.normalized() * distance
    return matrix


def switch_limb(obj, limb, ik):
    """Match the current evaluated pose before changing the IK/FK influence."""
    pose = evaluated_pose(obj)
    matrices = [pose.bones[name].matrix.copy() for name in limb['deform']]
    toes = {source: pose.bones[source].matrix.copy() for source, _ in limb.get('toe_follow', [])}
    if ik:
        if limb['kind'] == 'LEG':
            obj.pose.bones[limb['target']]['foot_roll'] = 0.0
            obj.update_tag()
            evaluated_pose(obj)
        obj.pose.bones[limb['target']].matrix = matrices[-1]
        obj.pose.bones[limb['pole']].matrix = pole_matrix(obj, limb, matrices)
        pose = evaluated_pose(obj)
        for name, ik_name, desired in zip(limb['result'], limb['ik'], matrices):
            # IK solves joint positions, but FK may carry independent axial twist.
            # Preserve that twist on separate result bones, keeping the solver
            # chain and all joint positions unchanged.
            delta = pose.bones[ik_name].matrix.to_quaternion().inverted() @ desired.to_quaternion()
            twist = Vector((0, delta.y, 0))
            from mathutils import Quaternion
            q = Quaternion((delta.w, twist.x, twist.y, twist.z))
            obj.pose.bones[name].rotation_quaternion = q.normalized() if q.magnitude > 1e-8 else Quaternion()
        evaluated_pose(obj)
        for source, helper in limb.get('toe_follow', []):
            obj.pose.bones[helper].matrix = toes[source]
    else:
        for name, matrix in zip(limb['fk'], matrices):
            obj.pose.bones[name].matrix = matrix
            evaluated_pose(obj)
    obj[limb['key']] = float(ik)
    obj.update_tag()
    refresh_controls(obj)
    evaluated_pose(obj)
    if not ik:
        for source, matrix in toes.items():
            obj.pose.bones[source].matrix = matrix
        evaluated_pose(obj)


def rig_for_context(context):
    obj = context.object
    if obj and obj.get('biped_kind') == 'RIG':
        return obj
    if obj and obj.type == 'MESH':
        armature = obj.find_armature()
        if armature and armature.get('biped_kind') == 'RIG':
            return armature
    return context.scene.biped_settings.rig
