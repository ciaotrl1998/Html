"""Remove Rigify's unused deformation output after installing the Bip skin layer."""
import json
import re
import bpy


def _path_bone(path):
    match = re.search(r'(?:pose\.)?bones\[("(?:\\.|[^"\\])*")\]', path)
    return json.loads(match[1]) if match else None


def clean_unused_def(obj):
    from .skeleton import activate
    candidates = {b.name for b in obj.data.bones if b.name.startswith('DEF-')}
    if not candidates:
        if 'DEF' in obj.data.collections and not obj.data.collections['DEF'].bones:
            obj.data.collections.remove(obj.data.collections['DEF'])
        return 0, 0
    edges = {b.name: set() for b in obj.data.bones}
    protected = set()
    for bone in obj.data.bones:
        if bone.parent:
            edges[bone.name].add(bone.parent.name)
        for attr in ('bbone_custom_handle_start', 'bbone_custom_handle_end'):
            target = getattr(bone, attr, None)
            if target:
                edges[bone.name].add(target.name)
    for owner_obj in bpy.data.objects:
        if owner_obj.parent == obj and owner_obj.parent_type == 'BONE':
            protected.add(owner_obj.parent_bone)
        if owner_obj.type == 'MESH' and any(m.type == 'ARMATURE' and m.object == obj for m in owner_obj.modifiers):
            protected.update(group.name for group in owner_obj.vertex_groups if group.name in candidates)
        owners = [(None, owner_obj.constraints)]
        if owner_obj.type == 'ARMATURE':
            owners += [(pb.name, pb.constraints) for pb in owner_obj.pose.bones]
        for owner_name, constraints in owners:
            refs = set()
            for con in constraints:
                for target_attr, name_attr in [('target', 'subtarget'), ('pole_target', 'pole_subtarget')]:
                    if getattr(con, target_attr, None) == obj:
                        refs.add(getattr(con, name_attr, ''))
                for target in getattr(con, 'targets', []):
                    if target.target == obj:
                        refs.add(target.subtarget)
            if owner_obj == obj and owner_name:
                edges[owner_name].update(refs)
            else:
                protected.update(refs)
        if owner_obj.type == 'ARMATURE':
            for pb in owner_obj.pose.bones:
                if owner_obj == obj and pb.custom_shape_transform:
                    edges[pb.name].add(pb.custom_shape_transform.name)
    # Driver references are dependencies, including object and armature-data owners.
    for owner_id in [*bpy.data.objects, *bpy.data.armatures]:
        animation = owner_id.animation_data
        if not animation:
            continue
        for fc in animation.drivers:
            refs = set()
            for variable in fc.driver.variables:
                for target in variable.targets:
                    if target.id in (obj, obj.data):
                        refs.update(filter(None, [target.bone_target, _path_bone(target.data_path)]))
            owner_name = _path_bone(fc.data_path) if owner_id in (obj, obj.data) else None
            if owner_name in edges:
                edges[owner_name].update(refs)
            else:
                protected.update(refs)
    # Existing keyed DEF bones are user data and remain protected.
    for action in bpy.data.actions:
        curves = list(getattr(action, 'fcurves', []))
        for layer in getattr(action, 'layers', []):
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    curves.extend(bag.fcurves)
        protected.update(filter(None, (_path_bone(fc.data_path) for fc in curves)))
    keep = protected & candidates
    for owner, refs in edges.items():
        if owner not in candidates:
            keep.update(refs & candidates)
    while True:
        expanded = keep | {ref for name in keep for ref in edges[name] if ref in candidates}
        if expanded == keep:
            break
        keep = expanded
    removable = candidates - keep
    mode = obj.mode
    activate(obj, 'OBJECT')
    for owner_id in (obj, obj.data):
        if owner_id.animation_data:
            for fc in list(owner_id.animation_data.drivers):
                if _path_bone(fc.data_path) in removable:
                    owner_id.animation_data.drivers.remove(fc)
    activate(obj, 'EDIT')
    for name in removable:
        obj.data.edit_bones.remove(obj.data.edit_bones[name])
    bpy.ops.object.mode_set(mode='OBJECT')
    if 'DEF' in obj.data.collections:
        collection = obj.data.collections['DEF']
        if keep:
            internal = obj.data.collections.get('MCH') or obj.data.collections.new('MCH')
            for name in keep:
                internal.assign(obj.data.bones[name])
                obj.data.bones[name].use_deform = False
        obj.data.collections.remove(collection)
    for name in ('ORG', 'MCH', 'Bip · 内部跟随'):
        if name in obj.data.collections:
            obj.data.collections[name].is_visible = False
    obj['biped_def_cleanup'] = json.dumps(dict(removed=len(removable), retained=len(keep)))
    activate(obj, mode if mode != 'EDIT' else 'EDIT')
    return len(removable), len(keep)
