"""Rest skeleton only. All coordinates are metres, Z up, front -Y, character left +X."""
import json
import re
import bpy
from mathutils import Vector

CONFIG_KEYS = ('root_name', 'height_cm', 'arms', 'spine_links', 'neck_links', 'leg_links',
               'tail_links', 'ponytail1_links', 'ponytail2_links', 'fingers', 'finger_links',
               'short_thumb', 'toes', 'toe_links', 'ankle_attach', 'triangle_pelvis',
               'triangle_neck', 'prop1', 'prop2', 'prop3', 'stance', 'shoulder_width',
               'hip_width', 'arm_length')


def config_from_settings(settings):
    config = {key: getattr(settings, key) for key in CONFIG_KEYS}
    config['unit_scale'] = bpy.context.scene.unit_settings.scale_length
    return config


def unique_prefix(requested):
    name = requested.strip() or 'Bip001'
    used = {obj.get('biped_prefix') for obj in bpy.data.objects if obj.get('biped_kind')}
    if name not in used:
        return name
    match = re.match(r'^(.*?)(\d+)$', name)
    stem, number, width = (match[1], int(match[2]), len(match[2])) if match else (name, 0, 3)
    while True:
        number += 1
        candidate = f'{stem}{number:0{width}d}'
        if candidate not in used:
            return candidate


def bone_name(prefix, part='', side=None):
    return ' '.join(x for x in (prefix, side, part) if x)


def link_name(base, index):
    return base if index == 0 else f'{base}{index}'


def blueprint(config):
    """Return deterministic bone specifications, in parent-first order."""
    c, specs = config, []
    h = c['height_cm'] / 100 / c.get('unit_scale', 1)
    prefix = c['root_name']

    def add(part, head, tail, parent=None, side=None, group='Body'):
        name = bone_name(prefix, part, side)
        specs.append(dict(name=name, head=tuple(Vector(head) * h), tail=tuple(Vector(tail) * h),
                          parent=parent, group=group))
        return name

    root = add('', (0, 0, .52), (0, 0, .58))
    pelvis = add('Pelvis', (0, 0, .52), (0, 0, .57), root)
    spine = []
    parent = pelvis
    for i in range(c['spine_links']):
        z0, z1 = .57 + .25 * i / c['spine_links'], .57 + .25 * (i + 1) / c['spine_links']
        parent = add(link_name('Spine', i), (0, 0, z0), (0, 0, z1), parent)
        spine.append(parent)
    neck = []
    for i in range(c['neck_links']):
        z0, z1 = .82 + .08 * i / c['neck_links'], .82 + .08 * (i + 1) / c['neck_links']
        parent = add(link_name('Neck', i), (0, 0, z0), (0, 0, z1), parent)
        neck.append(parent)
    head = add('Head', (0, 0, .9), (0, 0, 1), parent)
    for side, sign in [('L', 1), ('R', -1)]:
        x = .065 * c['hip_width'] * sign
        hip, knee = (x, 0, .52), (x, -.025, .29)
        ankle = (x, 0, .065)
        parent = add('Thigh', hip, knee, spine[0] if c['triangle_pelvis'] else pelvis, side, 'Deform')
        if c['leg_links'] == '4':
            hock = (x, .035, .135)
            parent = add('Calf', knee, hock, parent, side, 'Deform')
            parent = add('HorseLink', hock, ankle, parent, side, 'Deform')
        else:
            parent = add('Calf', knee, ankle, parent, side, 'Deform')
        # Ankle attach changes the foot's longitudinal extent, not the shin position.
        ball_y = -.135 * (1 - c['ankle_attach']) - .015
        ball = (x, ball_y, .028)
        foot = add('Foot', ankle, ball, parent, side, 'Deform')
        for digit in range(c['toes']):
            offset = 0 if c['toes'] == 1 else (digit / (c['toes'] - 1) - .5) * .046
            parent = foot
            for j in range(c['toe_links']):
                y0, y1 = ball_y - .048 * j / c['toe_links'], ball_y - .048 * (j + 1) / c['toe_links']
                parent = add(link_name(f'Toe{digit}', j), (x + offset, y0, .028),
                             (x + offset, y1, .028), parent, side, 'Fingers')
        if c['arms']:
            shoulder_x = .13 * c['shoulder_width']
            drop = .16 if c['stance'] == 'A' else 0
            reach = .32 * c['arm_length']
            shoulder = (sign * shoulder_x, 0, .82)
            elbow = (sign * (shoulder_x + reach * .52), .018, .82 - drop * .52)
            wrist = (sign * (shoulder_x + reach), 0, .82 - drop)
            palm = (sign * (shoulder_x + reach + .045), 0, .82 - drop)
            clavicle = add('Clavicle', (sign * .025, 0, .82), shoulder,
                           spine[-1] if c['triangle_neck'] else neck[0], side)
            parent = add('UpperArm', shoulder, elbow, clavicle, side, 'Deform')
            parent = add('Forearm', elbow, wrist, parent, side, 'Deform')
            hand = add('Hand', wrist, palm, parent, side, 'Deform')
            for digit in range(c['fingers']):
                # One digit represents a mitten; five digits begin with the thumb.
                thumb = digit == 0 and c['fingers'] > 1
                y = -.024 if thumb else ((digit - 1.5) * .014 if c['fingers'] > 1 else 0)
                start = Vector((palm[0] - sign * .025 if thumb else palm[0], y, palm[2]))
                direction = Vector((sign * (.032 if thumb else .047), -.026 if thumb else 0, 0))
                if not thumb:
                    direction *= [1, .95, 1.05, 1, .78][digit]
                links = max(1, c['finger_links'] - int(thumb and c['short_thumb']))
                parent = hand
                for j in range(links):
                    parent = add(link_name(f'Finger{digit}', j), start + direction * j / links,
                                 start + direction * (j + 1) / links, parent, side, 'Fingers')
    parent = pelvis
    for i in range(c['tail_links']):
        parent = add(link_name('Tail', i), (0, .04 + i * .025, .54 - i * .008),
                     (0, .04 + (i + 1) * .025, .54 - (i + 1) * .008), parent, group='Extras')
    for n in (1, 2):
        parent = head
        for i in range(c[f'ponytail{n}_links']):
            x = .035 if n == 1 else -.035
            parent = add(link_name(f'Ponytail{n}', i), (x, .035 + .012 * i, .94 - .023 * i),
                         (x, .035 + .012 * (i + 1), .94 - .023 * (i + 1)), parent, group='Extras')
    for n, side in [(1, 'R'), (2, 'L'), (3, None)]:
        if c[f'prop{n}']:
            if side and c['arms']:
                hand_spec = next(b for b in specs if b['name'] == bone_name(prefix, 'Hand', side))
                pos = Vector(hand_spec['tail']) / h
                parent = hand_spec['name']
            else:
                pos, parent = Vector((0, -.15, .7)), spine[-1]
            add(f'Prop{n}', pos, pos + Vector((0, -.07, 0)), parent, group='Extras')
    return specs


def activate(obj, mode='OBJECT'):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if mode != 'OBJECT':
        bpy.ops.object.mode_set(mode=mode)


def select_pose_bone(obj, name, selected):
    # Blender 5.x moved pose selection from Bone to PoseBone.
    bone = obj.data.bones[name]
    if hasattr(bone, 'select'):
        bone.select = selected
    else:
        obj.pose.bones[name].select = selected


def create_guide(settings, context, compatible_names=True):
    config = config_from_settings(settings)
    config['root_name'] = unique_prefix(config['root_name'])
    prefix = config['root_name']
    if len(prefix.encode('utf-8')) > 32:
        raise ValueError('根名称过长，请控制在 32 字节以内（建议 Bip001）')
    data = bpy.data.armatures.new(f'{prefix}_Figure')
    obj = bpy.data.objects.new(f'{prefix} · 体型', data)
    context.collection.objects.link(obj)
    if settings.at_cursor:
        obj.location = context.scene.cursor.location
    obj['biped_kind'], obj['biped_prefix'] = 'GUIDE', prefix
    obj['biped_config'] = json.dumps(config, ensure_ascii=False)
    obj.show_in_front = True
    data.display_type = 'OCTAHEDRAL'
    activate(obj, 'EDIT')
    for spec in blueprint(config):
        bone = data.edit_bones.new(spec['name'])
        bone.head, bone.tail = spec['head'], spec['tail']
        if spec['parent']:
            bone.parent = data.edit_bones[spec['parent']]
        bone.use_connect = bool(bone.parent and (bone.head - bone.parent.tail).length < 1e-6)
        bone.align_roll(Vector((0, 1, 0)) if abs(bone.vector.normalized().z) > .9 else Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in data.bones:
        bone.color.palette = 'THEME03' if ' L ' in bone.name else 'THEME04' if ' R ' in bone.name else 'THEME09'
        bone['biped_export_name'] = bone.name
    if compatible_names:
        from .symmetry import native_names
        native_names(obj)
    return obj
