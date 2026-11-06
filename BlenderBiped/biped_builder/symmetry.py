"""LR pairing, native Blender names, and reversible Biped export names."""
import json
import re
import bpy

EXPORT_NAME = 'biped_export_name'


def export_name(bone):
    return bone.get(EXPORT_NAME, bone.name)


def find_pairs(names):
    """Only pair real counterparts; prefer native and delimited markers.

    A bare uppercase L/R anywhere in a name is supported if swapping that one
    letter identifies a unique existing counterpart. Ambiguous matches are skipped.
    """
    names = set(names)
    choices = {}
    for name in names:
        flipped = bpy.utils.flip_name(name)
        if flipped != name and flipped in names:
            choices[name] = flipped
            continue
        candidates = []
        for i, char in enumerate(name):
            if char not in 'LR':
                continue
            other = name[:i] + ('R' if char == 'L' else 'L') + name[i + 1:]
            if other in names:
                isolated = (i == 0 or not name[i - 1].isalnum()) and (i + 1 == len(name) or not name[i + 1].isalnum())
                candidates.append((not isolated, other))
        if candidates:
            best = min(priority for priority, _ in candidates)
            options = {other for priority, other in candidates if priority == best}
            if len(options) == 1:
                choices[name] = options.pop()
    return {name: other for name, other in choices.items() if choices.get(other) == name}


def _replace_metadata(value, rename):
    if isinstance(value, str):
        return rename.get(value, value)
    if isinstance(value, list):
        return [_replace_metadata(item, rename) for item in value]
    if isinstance(value, dict):
        return {rename.get(key, key): _replace_metadata(item, rename) for key, item in value.items()}
    return value


def native_names(obj):
    """Normalize actual bone IDs so built-in X Mirror, paste-flipped and weights work."""
    from .skeleton import activate
    mode = obj.mode
    if mode == 'EDIT':
        bpy.ops.object.mode_set(mode='OBJECT')
    pairs = find_pairs(obj.data.bones.keys())
    rename = {}
    for name, other in pairs.items():
        if bpy.utils.flip_name(name) == other:
            continue
        differences = [i for i, (a, b) in enumerate(zip(name, other)) if a != b]
        if len(name) != len(other) or len(differences) != 1:
            continue
        i = differences[0]
        stem = re.sub(r'\s+', ' ', name[:i] + name[i + 1:]).strip(' ._-')
        new = stem + '.' + name[i]
        if len(new.encode('utf-8')) > 63:
            raise ValueError('镜像兼容名称过长，请缩短：' + name)
        if new in obj.data.bones and new != name:
            raise ValueError('镜像名称冲突，请先修正：' + new)
        rename[name] = new
    if len(set(rename.values())) != len(rename):
        raise ValueError('多组骨骼转换后重名，请先使用不同的骨骼名称')
    bound_meshes = [mesh for mesh in bpy.data.objects if mesh.type == 'MESH' and any(
        m.type == 'ARMATURE' and m.object == obj for m in mesh.modifiers)]
    for old, new in rename.items():
        bone = obj.data.bones[old]
        if (bone.use_deform or obj.get('biped_kind') == 'GUIDE') and EXPORT_NAME not in bone:
            bone[EXPORT_NAME] = old
        bone.name = new  # Blender updates constraints, RNA animation paths and drivers.
        for mesh in bound_meshes:
            if old in mesh.vertex_groups and new not in mesh.vertex_groups:
                mesh.vertex_groups[old].name = new
    for key in ('biped_limbs', 'biped_mapping'):
        if key in obj:
            obj[key] = json.dumps(_replace_metadata(json.loads(obj[key]), rename))
    obj['biped_symmetry_pairs'] = json.dumps(find_pairs(obj.data.bones.keys()))
    obj.data.use_mirror_x = True
    obj['biped_native_symmetry'] = True
    obj.update_tag()
    bpy.context.view_layer.update()
    if mode == 'EDIT':
        activate(obj, 'EDIT')
    return rename


def normalized_guide_copy(guide, context):
    """The generator's template uses standard Biped names internally."""
    clone = guide.copy()
    clone.data = guide.data.copy()
    clone.data.use_mirror_x = False
    context.collection.objects.link(clone)
    clone.name = guide.name + '_BuildSource'
    names = [export_name(b) for b in clone.data.bones]
    if len(set(names)) != len(names):
        bpy.data.objects.remove(clone, do_unlink=True)
        raise ValueError('体型中的导出骨名重复')
    for bone in clone.data.bones:
        bone.name = export_name(bone)
    return clone


def restore_export_names(obj):
    for bone in obj.data.bones:
        original = export_name(bone)
        if original != bone.name:
            bone.name = original
