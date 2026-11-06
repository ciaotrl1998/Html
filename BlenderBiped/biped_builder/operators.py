import json
import math
import bpy
from bpy.props import BoolProperty, EnumProperty, StringProperty
from mathutils import Matrix, Vector
from .skeleton import activate, create_guide, CONFIG_KEYS, select_pose_bone
from .rig import build_rig, rig_for_context, evaluated_pose, refresh_controls, switch_limb
from .rigify_backend import build_rigify, is_rigify, key_rigify, reset_rigify, switch_rigify, rigify_controls, use_rotation_controls
from .symmetry import native_names, export_name, restore_export_names, find_pairs
from .cleanup import clean_unused_def


def current_guide(context):
    obj = context.object
    if obj and obj.get('biped_kind') == 'GUIDE':
        return obj
    rig = rig_for_context(context)
    return rig.get('biped_guide') if rig else None


class BIPED_OT_preset(bpy.types.Operator):
    bl_idname = 'biped.preset'
    bl_label = '应用骨节预设'
    bl_options = {'REGISTER', 'UNDO'}
    kind: EnumProperty(items=[('HUMAN', '标准人体', ''), ('GAME', '游戏简化', ''), ('REFERENCE', '截图参数', '')])

    def execute(self, context):
        s = context.scene.biped_settings
        for key, value in dict(arms=True, spine_links=4, neck_links=1, leg_links='3', tail_links=0,
                              ponytail1_links=0, ponytail2_links=0, short_thumb=False, prop1=False,
                              prop2=False, prop3=False, triangle_neck=True, triangle_pelvis=False,
                              ankle_attach=.2, shoulder_width=1, hip_width=1, arm_length=1, stance='T').items():
            setattr(s, key, value)
        s.fingers, s.finger_links, s.toes, s.toe_links, s.height_cm = {
            'HUMAN': (5, 3, 1, 1, 180), 'GAME': (5, 3, 1, 1, 180),
            'REFERENCE': (1, 1, 1, 3, 315.52),
        }[self.kind]
        if self.kind == 'GAME':
            s.spine_links, s.stance = 3, 'A'
        elif self.kind == 'REFERENCE':
            s.triangle_pelvis, s.triangle_neck = True, False
        return {'FINISHED'}


class BIPED_OT_create_guide(bpy.types.Operator):
    bl_idname = 'biped.create_guide'
    bl_label = '① 创建体型骨架'
    bl_description = '按左侧参数创建新体型；不会覆盖已有角色。进入编辑模式后可手动贴合模型'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        try:
            guide = create_guide(context.scene.biped_settings, context)
        except ValueError as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        activate(guide, 'EDIT')
        self.report({'INFO'}, '体型已创建；可移动关节贴合模型，再点击「生成控制骨架」')
        return {'FINISHED'}


class BIPED_OT_generate(bpy.types.Operator):
    bl_idname = 'biped.generate'
    bl_label = '② 生成控制骨架'
    bl_description = '使用当前体型的关节位置生成新的控制骨架；保留已有体型与成品'
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return bool(context.object and context.object.get('biped_kind') == 'GUIDE')

    def execute(self, context):
        guide = context.object
        try:
            rig = build_rigify(guide, context)
            rig['biped_guide'] = guide
        except (ValueError, KeyError, RuntimeError) as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        self.report({'INFO'}, 'Rigify 控制器已生成，手脚默认全部 IK；请在姿态模式操作 hand_ik / foot_ik')
        return {'FINISHED'}


class BIPED_OT_rebuild_rigify(bpy.types.Operator):
    bl_idname = 'biped.rebuild_rigify'
    bl_label = '从旧骨架重建 Rigify'
    bl_description = '从原始体型生成新的 Rigify 控制骨架；保留旧骨架、旧动画和蒙皮'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        old = rig_for_context(context)
        guide = current_guide(context)
        if not old or not guide:
            self.report({'ERROR'}, '找不到原始体型，请选中体型骨架后生成')
            return {'CANCELLED'}
        try:
            obj = build_rigify(guide, context)
        except (ValueError, KeyError, RuntimeError) as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        old.hide_set(True)
        context.scene.biped_settings.rig = obj
        self.report({'INFO'}, 'Rigify 已生成，旧骨架已保留；已有网格仍绑定旧骨架，确认后再迁移')
        return {'FINISHED'}


class BIPED_OT_figure(bpy.types.Operator):
    bl_idname = 'biped.figure'
    bl_label = '返回体型（保留成品）'
    bl_description = '编辑原始体型，不改动现有成品。修改后再次生成会得到另一套控制骨架'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        guide, rig = current_guide(context), rig_for_context(context)
        if not guide:
            self.report({'ERROR'}, '找不到原始体型对象')
            return {'CANCELLED'}
        activate(guide, 'EDIT')
        if rig:
            rig.hide_set(True)
        return {'FINISHED'}


class BIPED_OT_show_rig(bpy.types.Operator):
    bl_idname = 'biped.show_rig'
    bl_label = '选择控制骨架'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        obj = context.scene.biped_settings.rig
        if not obj:
            return {'CANCELLED'}
        activate(obj, 'POSE')
        guide = obj.get('biped_guide')
        if guide:
            guide.hide_set(True)
        return {'FINISHED'}


class BIPED_OT_mirror_figure(bpy.types.Operator):
    bl_idname = 'biped.mirror_figure'
    bl_label = '镜像体型关节'
    bl_description = '按骨名中的 L / R 镜像位置与骨骼滚转；镜像所选源侧骨骼，无选中源侧时镜像整侧'
    bl_options = {'REGISTER', 'UNDO'}
    direction: EnumProperty(items=[('L', '左 → 右', ''), ('R', '右 → 左', '')])

    def execute(self, context):
        obj = context.object
        if not obj or obj.get('biped_kind') != 'GUIDE':
            return {'CANCELLED'}
        activate_mode = obj.mode
        if activate_mode != 'EDIT':
            activate(obj, 'EDIT')
        bones = obj.data.edit_bones
        pairs = find_pairs(bones.keys())
        sources = [b for b in bones if b.name in pairs and (
            b.name.endswith('.' + self.direction) or f' {self.direction} ' in b.name)]
        selected = [b for b in sources if b.select or b.select_head or b.select_tail]
        count = 0
        reflect = Matrix.Diagonal((-1, 1, 1))
        for b in selected or sources:
            target = bones.get(pairs[b.name])
            if target:
                target.use_connect = False
                target.head = reflect @ b.head
                target.tail = reflect @ b.tail
                target.align_roll(reflect @ b.z_axis)
                count += 1
        if activate_mode != 'EDIT':
            bpy.ops.object.mode_set(mode='OBJECT')
        self.report({'INFO'}, f'已镜像 {count} 根骨骼')
        return {'FINISHED'}


class BIPED_OT_load_settings(bpy.types.Operator):
    bl_idname = 'biped.load_settings'
    bl_label = '读取当前角色参数'
    bl_description = '将角色创建时的骨节参数读回面板；不会改变任何骨骼'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        obj = context.object
        if not obj or 'biped_config' not in obj:
            self.report({'ERROR'}, '请先选择插件创建的体型或控制骨架')
            return {'CANCELLED'}
        for key, value in json.loads(obj['biped_config']).items():
            if key in CONFIG_KEYS:
                setattr(context.scene.biped_settings, key, value)
        return {'FINISHED'}


class BIPED_OT_switch(bpy.types.Operator):
    bl_idname = 'biped.switch'
    bl_label = '匹配并切换 IK / FK'
    bl_description = '先将目标控制器匹配到当前姿势，再切换模式。兽腿多节 IK 可能有姿势差异'
    bl_options = {'REGISTER', 'UNDO'}
    key: StringProperty()
    ik: BoolProperty(default=True)

    def execute(self, context):
        obj = rig_for_context(context)
        if not obj:
            return {'CANCELLED'}
        limb = next((x for x in json.loads(obj['biped_limbs']) if x['key'] == self.key), None)
        if not limb:
            return {'CANCELLED'}
        activate(obj, 'POSE')
        try:
            if is_rigify(obj):
                switch_rigify(obj, limb, self.ik)
            else:
                switch_limb(obj, limb, self.ik)
        except ValueError as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        if context.scene.tool_settings.use_keyframe_insert_auto:
            key_rig(obj, context.scene.frame_current)
        return {'FINISHED'}


class BIPED_OT_rotation_controls(bpy.types.Operator):
    bl_idname = 'biped.rotation_controls'
    bl_label = '改用箭头旋转控制'
    bl_description = '原地切换为 Rigify 箭头旋转，隐藏球形 Pole；如有动作，将复制动作并按场景帧范围匹配转换'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        obj = rig_for_context(context)
        if not is_rigify(obj):
            self.report({'ERROR'}, '请先选择本插件生成的 Rigify 控制骨架')
            return {'CANCELLED'}
        try:
            animated = use_rotation_controls(obj, context)
        except (ValueError, RuntimeError, KeyError) as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        self.report({'INFO'}, '已改为箭头旋转，球形 Pole 已隐藏' + ('；当前帧范围动画已匹配到动作副本，原动作保留' if animated else ''))
        return {'FINISHED'}


class BIPED_OT_symmetry_cleanup(bpy.types.Operator):
    bl_idname = 'biped.symmetry_cleanup'
    bl_label = '修复原生对称并清理 DEF'
    bl_description = '自动识别实际 L/R 配对，转为 Blender 原生镜像命名；同步权重与动画引用，清理无依赖 DEF'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        obj = context.object
        if not obj or obj.type != 'ARMATURE' or obj.get('biped_kind') not in ('RIG', 'GUIDE'):
            obj = rig_for_context(context)
        if not obj:
            self.report({'ERROR'}, '请先选择体型或控制骨架')
            return {'CANCELLED'}
        try:
            renamed = native_names(obj)
            removed, retained = clean_unused_def(obj) if is_rigify(obj) else (0, 0)
            guide = obj.get('biped_guide')
            if guide and guide != obj:
                native_names(guide)
            obj['biped_version'] = '1.2.0'
        except (ValueError, RuntimeError) as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        self.report({'INFO'}, f'原生对称已开启；兼容命名 {len(renamed)} 根，清理 DEF {removed} 根，保留内部依赖 {retained} 根')
        return {'FINISHED'}


class BIPED_OT_select(bpy.types.Operator):
    bl_idname = 'biped.select_control'
    bl_label = '选择控制器'
    bl_options = {'REGISTER', 'UNDO'}
    bone: StringProperty()

    def execute(self, context):
        obj = rig_for_context(context)
        if not obj or self.bone not in obj.data.bones:
            return {'CANCELLED'}
        activate(obj, 'POSE')
        for bone in obj.data.bones:
            select_pose_bone(obj, bone.name, False)
        bone = obj.data.bones[self.bone]
        bone.hide = False
        for collection in bone.collections:
            collection.is_visible = True
        select_pose_bone(obj, self.bone, True)
        obj.data.bones.active = bone
        return {'FINISHED'}


def animator_bones(obj):
    if is_rigify(obj):
        return rigify_controls(obj)
    constrained = {name for limb in json.loads(obj['biped_limbs']) for name in limb['deform']}
    return [pb for pb in obj.pose.bones if not pb.name.startswith('MCH_') and pb.name not in constrained]


def key_rig(obj, frame):
    if is_rigify(obj):
        key_rigify(obj, frame)
        return
    for pb in animator_bones(obj):
        pb.keyframe_insert('location', frame=frame, group=pb.name)
        rotation = 'rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else (
            'rotation_axis_angle' if pb.rotation_mode == 'AXIS_ANGLE' else 'rotation_euler')
        pb.keyframe_insert(rotation, frame=frame, group=pb.name)
        pb.keyframe_insert('scale', frame=frame, group=pb.name)
        if 'foot_roll' in pb:
            pb.keyframe_insert('["foot_roll"]', frame=frame, group=pb.name)
    for limb in json.loads(obj['biped_limbs']):
        obj.keyframe_insert(f'["{limb["key"]}"]', frame=frame, group='IK FK')
        for name in limb['result']:
            obj.pose.bones[name].keyframe_insert('rotation_quaternion', frame=frame, group=name)
        for _, helper in limb.get('toe_follow', []):
            obj.pose.bones[helper].keyframe_insert('rotation_quaternion', frame=frame, group=helper)


class BIPED_OT_key(bpy.types.Operator):
    bl_idname = 'biped.key_pose'
    bl_label = '整套姿势打关键帧'
    bl_description = '记录动画控制骨、IK/FK 混合值与脚掌滚动'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        obj = rig_for_context(context)
        if not obj:
            return {'CANCELLED'}
        key_rig(obj, context.scene.frame_current)
        return {'FINISHED'}


class BIPED_OT_reset(bpy.types.Operator):
    bl_idname = 'biped.reset_pose'
    bl_label = '重置整套姿势'
    bl_description = '将当前控制骨架恢复初始姿势；不删除已有动画关键帧。支持撤销'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        obj = rig_for_context(context)
        if not obj:
            return {'CANCELLED'}
        activate(obj, 'POSE')
        if is_rigify(obj):
            reset_rigify(obj)
            if context.scene.tool_settings.use_keyframe_insert_auto:
                key_rig(obj, context.scene.frame_current)
            return {'FINISHED'}
        for pb in animator_bones(obj):
            pb.matrix_basis.identity()
            if 'foot_roll' in pb:
                pb['foot_roll'] = 0.0
        for limb in json.loads(obj['biped_limbs']):
            obj[limb['key']] = float(limb['kind'] == 'LEG')
            for name in limb['result']:
                obj.pose.bones[name].matrix_basis.identity()
            for _, helper in limb.get('toe_follow', []):
                obj.pose.bones[helper].matrix_basis.identity()
        obj.update_tag()
        refresh_controls(obj)
        evaluated_pose(obj)
        if context.scene.tool_settings.use_keyframe_insert_auto:
            key_rig(obj, context.scene.frame_current)
        return {'FINISHED'}


class BIPED_OT_bind(bpy.types.Operator):
    bl_idname = 'biped.bind_mesh'
    bl_label = '自动权重绑定所选网格'
    bl_description = '将所选、尚未蒙皮的网格绑定到面板指定的控制骨架；支持撤销'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        rig = rig_for_context(context)
        meshes = [obj for obj in context.selected_objects if obj.type == 'MESH' and not obj.get('biped_widget')]
        if not rig or not meshes:
            self.report({'ERROR'}, '请先选中网格，并在面板指定当前控制骨架')
            return {'CANCELLED'}
        if any(any(m.type == 'ARMATURE' for m in obj.modifiers) for obj in meshes):
            self.report({'ERROR'}, '所选网格已有骨架修改器；为保护现有蒙皮，请先单独处理')
            return {'CANCELLED'}
        if any(abs(v - 1) > 1e-5 for obj in [rig] + meshes for v in obj.scale):
            self.report({'ERROR'}, '请先对网格与骨架应用对象缩放，再自动绑定')
            return {'CANCELLED'}
        activate(rig)
        for obj in meshes:
            obj.select_set(True)
        try:
            bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        except RuntimeError as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        self.report({'INFO'}, '已执行自动权重；请检查肩髋、手指等区域，必要时继续权重绘制')
        return {'FINISHED'}


class BIPED_OT_bake(bpy.types.Operator):
    bl_idname = 'biped.bake_skeleton'
    bl_label = '烘焙纯 Bip 动画骨架'
    bl_description = '按场景起止帧新建仅含 Bip 变形骨的烘焙骨架；包含全局运动，不改动原始控制骨架或网格'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        rig = rig_for_context(context)
        if not rig:
            return {'CANCELLED'}
        scene, old_frame = context.scene, context.scene.frame_current
        if scene.frame_end - scene.frame_start > 20000:
            self.report({'ERROR'}, '请将烘焙范围缩小到 20000 帧以内')
            return {'CANCELLED'}
        names = [b.name for b in rig.data.bones if b.use_deform]
        data = bpy.data.armatures.new(rig['biped_prefix'] + '_Baked')
        obj = bpy.data.objects.new(data.name, data)
        context.collection.objects.link(obj)
        obj.matrix_world = rig.matrix_world.copy()
        obj['biped_kind'] = 'BAKED'
        obj['biped_prefix'] = rig['biped_prefix']
        obj['biped_vertex_group_map'] = json.dumps({n: export_name(rig.data.bones[n]) for n in names})
        activate(obj, 'EDIT')
        for name in names:
            source = rig.data.bones[name]
            b = data.edit_bones.new(name)
            b.head, b.tail = source.head_local, source.tail_local
            b.matrix = source.matrix_local.copy()
            b.length = source.length
            b['biped_export_name'] = export_name(source)
        for name in names:
            parent = rig.data.bones[name].parent
            while parent and parent.name not in names:
                parent = parent.parent
            if parent:
                data.edit_bones[name].parent = data.edit_bones[parent.name]
        bpy.ops.object.mode_set(mode='POSE')
        # Do not copy constraints. Assign evaluated pose matrices parent-first so
        # the baked root receives global-controller motion without helper parents.
        ordered = sorted(names, key=lambda name: len(data.bones[name].parent_recursive))
        try:
            for frame in range(scene.frame_start, scene.frame_end + 1):
                scene.frame_set(frame)
                pose = evaluated_pose(rig)
                matrices = {name: pose.bones[name].matrix.copy() for name in names}
                for name in ordered:
                    pb = obj.pose.bones[name]
                    pb.rotation_mode = 'QUATERNION'
                    # convert_local_to_pose accounts for evaluated parent transforms
                    # without an expensive dependency-graph update for every bone.
                    bone = data.bones[name]
                    kwargs = dict(parent_matrix=matrices[bone.parent.name],
                                  parent_matrix_local=bone.parent.matrix_local) if bone.parent else {}
                    pb.matrix_basis = bone.convert_local_to_pose(matrices[name], bone.matrix_local,
                                                                 invert=True, **kwargs)
                    pb.keyframe_insert('location', frame=frame, group=name)
                    pb.keyframe_insert('rotation_quaternion', frame=frame, group=name)
                    pb.keyframe_insert('scale', frame=frame, group=name)
        finally:
            scene.frame_set(old_frame)
        if obj.animation_data and obj.animation_data.action:
            obj.animation_data.action.name = rig['biped_prefix'] + '_Baked_Action'
        restore_export_names(obj)
        self.report({'INFO'}, '已生成纯 Bip 烘焙骨架；网格仍绑定原骨架，导出前需在网格副本中改用烘焙骨架')
        return {'FINISHED'}


class BIPED_OT_validate(bpy.types.Operator):
    bl_idname = 'biped.validate'
    bl_label = '检查控制骨架'

    def execute(self, context):
        obj = rig_for_context(context)
        if not obj:
            return {'CANCELLED'}
        errors = []
        if is_rigify(obj):
            for limb in json.loads(obj['biped_limbs']):
                for name in limb['fk'] + limb['ik'] + [limb['target'], limb['pole'], limb['master']]:
                    if name not in obj.pose.bones:
                        errors.append('缺少 Rigify 骨骼：' + name)
            for bone in obj.data.bones:
                if bone.use_deform and not bone.name.startswith(obj['biped_prefix']):
                    errors.append('非 Bip 骨骼参与蒙皮：' + bone.name)
            if errors:
                self.report({'ERROR'}, '；'.join(errors[:4]))
                return {'CANCELLED'}
            self.report({'INFO'}, 'Rigify 控制器与 Bip 蒙皮层检查通过')
            return {'FINISHED'}
        for limb in json.loads(obj['biped_limbs']):
            for name in limb['deform'] + limb['fk'] + limb['ik'] + [limb['target'], limb['pole']]:
                if name not in obj.pose.bones:
                    errors.append('缺少：' + name)
            for name in limb['ik']:
                if name in obj.pose.bones and obj.pose.bones[name].bone.use_deform:
                    errors.append('内部骨不应参与蒙皮：' + name)
            if limb['ik'][-2] in obj.pose.bones:
                ik = obj.pose.bones[limb['ik'][-2]].constraints.get('Biped IK')
                if not ik or ik.target != obj or ik.subtarget not in obj.pose.bones:
                    errors.append('IK 约束目标无效：' + limb['key'])
        for fcurve in obj.animation_data.drivers if obj.animation_data else []:
            if not fcurve.driver.is_valid:
                errors.append('驱动无效：' + fcurve.data_path)
        if errors:
            self.report({'ERROR'}, '；'.join(errors[:6]))
            return {'CANCELLED'}
        count = sum(b.use_deform for b in obj.data.bones)
        self.report({'INFO'}, f'检查通过：{count} 根 Bip 变形骨，{len(json.loads(obj["biped_limbs"]))} 条 IK/FK 链')
        return {'FINISHED'}


CLASSES = (BIPED_OT_preset, BIPED_OT_create_guide, BIPED_OT_generate, BIPED_OT_rebuild_rigify, BIPED_OT_figure,
           BIPED_OT_show_rig, BIPED_OT_mirror_figure, BIPED_OT_load_settings,
           BIPED_OT_switch, BIPED_OT_rotation_controls, BIPED_OT_symmetry_cleanup, BIPED_OT_select, BIPED_OT_key, BIPED_OT_reset,
           BIPED_OT_bind, BIPED_OT_bake, BIPED_OT_validate)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
