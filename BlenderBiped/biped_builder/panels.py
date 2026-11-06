import json
import bpy
from .rig import rig_for_context
from .rigify_backend import is_rigify


def draw_rigify(layout, context, obj):
    layout.label(text='Rigify 原生控制器 · 手脚默认 IK', icon='CONSTRAINT_BONE')
    layout.operator('biped.rotation_controls', icon='FILE_REFRESH')
    layout.operator('biped.symmetry_cleanup', icon='MOD_MIRROR')
    layout.prop(obj.data, 'use_mirror_x', text='X 轴对称操作')
    if context.object != obj or context.mode != 'POSE':
        layout.label(text='点击上方「选择控制骨架」进入姿态模式', icon='INFO')
    row = layout.row(align=True)
    for name, text in [('root', '全局'), ('torso', '身体'), ('hips', '骨盆'), ('chest', '胸部')]:
        if name in obj.pose.bones:
            row.operator('biped.select_control', text=text).bone = name
    for limb in json.loads(obj['biped_limbs']):
        box = layout.box()
        text = ('左' if limb['side'] == 'L' else '右') + ('手臂' if limb['kind'] == 'ARM' else '腿脚')
        master = obj.pose.bones[limb['master']]
        box.label(text=text)
        box.prop(master, '["IK_FK"]', text='IK 0 ↔ FK 1', slider=True)
        row = box.row(align=True)
        for ik, label in [(True, '匹配 → IK'), (False, '匹配 → FK')]:
            op = row.operator('biped.switch', text=label)
            op.key, op.ik = limb['key'], ik
        row = box.row(align=True)
        row.operator('biped.select_control', text='手 IK' if limb['kind'] == 'ARM' else '脚 IK').bone = limb['target']
        row.operator('biped.select_control', text='上臂旋转' if limb['kind'] == 'ARM' else '大腿旋转').bone = limb['ik_controls'][0]
        if limb['heel']:
            box.operator('biped.select_control', text='脚跟 / 脚掌滚动控制器').bone = limb['heel']
        row = box.row(align=True)
        for i, name in enumerate(limb['fk']):
            row.operator('biped.select_control', text=f'FK {i + 1}').bone = name
    layout.label(text='G 移动手脚 IK；R 旋转肢体箭头调整方向', icon='INFO')
    layout.operator('biped.key_pose', icon='KEY_HLT')
    layout.operator('biped.reset_pose', icon='LOOP_BACK')


class BIPED_PT_structure(bpy.types.Panel):
    bl_label = 'Biped · 人体骨骼构建'
    bl_idname = 'BIPED_PT_structure'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Biped'

    def draw(self, context):
        layout, s = self.layout, context.scene.biped_settings
        layout.use_property_split = True
        layout.use_property_decorate = False
        layout.label(text='控制系统：Blender Rigify', icon='ARMATURE_DATA')
        row = layout.row(align=True)
        for kind, text in [('HUMAN', '标准人体'), ('GAME', '游戏'), ('REFERENCE', '截图')]:
            row.operator('biped.preset', text=text).kind = kind
        layout.prop(s, 'root_name')
        layout.prop(s, 'height_cm')
        layout.prop(s, 'stance')
        box = layout.box()
        for key in ('arms', 'neck_links', 'spine_links', 'leg_links', 'tail_links',
                    'ponytail1_links', 'ponytail2_links'):
            box.prop(s, key)
        box = layout.box()
        col = box.column()
        col.enabled = s.arms
        for key in ('fingers', 'finger_links', 'short_thumb'):
            col.prop(s, key)
        for key in ('toes', 'toe_links', 'ankle_attach'):
            box.prop(s, key)
        row = layout.row(align=True)
        for key in ('prop1', 'prop2', 'prop3'):
            row.prop(s, key, text=key[-1], toggle=True)
        layout.label(text='上方 1 / 2 / 3：右手、左手、身前道具', icon='INFO')
        layout.prop(s, 'at_cursor')
        layout.operator('biped.create_guide', icon='ARMATURE_DATA')
        layout.operator('biped.generate', icon='CONSTRAINT_BONE')
        obj = context.object
        if obj and obj.get('biped_kind') == 'GUIDE':
            layout.label(text='编辑模式移动关节，贴合模型后生成', icon='EDITMODE_HLT')
            row = layout.row(align=True)
            row.operator('biped.mirror_figure', text='左 → 右镜像').direction = 'L'
            row.operator('biped.mirror_figure', text='右 → 左镜像').direction = 'R'
            layout.label(text='参数仅用于新建，不覆盖手动调整', icon='INFO')
            layout.prop(obj.data, 'use_mirror_x', text='X 轴对称操作')
            layout.operator('biped.symmetry_cleanup', icon='MOD_MIRROR')


class BIPED_PT_proportions(bpy.types.Panel):
    bl_label = '比例与层级（新建前设置）'
    bl_parent_id = 'BIPED_PT_structure'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Biped'
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout, s = self.layout, context.scene.biped_settings
        layout.use_property_split = True
        layout.use_property_decorate = False
        for key in ('shoulder_width', 'hip_width', 'arm_length', 'triangle_pelvis', 'triangle_neck'):
            layout.prop(s, key)
        layout.operator('biped.load_settings', icon='IMPORT')


class BIPED_PT_animation(bpy.types.Panel):
    bl_label = '动画 · IK / FK'
    bl_idname = 'BIPED_PT_animation'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Biped'

    def draw(self, context):
        layout, s = self.layout, context.scene.biped_settings
        layout.prop(s, 'rig', text='角色')
        layout.operator('biped.show_rig', icon='OUTLINER_OB_ARMATURE')
        obj = rig_for_context(context)
        if not obj:
            layout.label(text='生成控制骨架后显示动画工具', icon='INFO')
            return
        prefix = obj['biped_prefix']
        if is_rigify(obj):
            draw_rigify(layout, context, obj)
            return
        layout.label(text='当前为旧版控制骨架', icon='INFO')
        layout.operator('biped.rebuild_rigify', icon='FILE_REFRESH')
        row = layout.row(align=True)
        row.operator('biped.select_control', text='全局').bone = 'CTRL_Global'
        row.operator('biped.select_control', text='重心 COM').bone = prefix
        row.operator('biped.select_control', text='骨盆').bone = prefix + ' Pelvis'
        for limb in json.loads(obj['biped_limbs']):
            box = layout.box()
            label = ('左' if limb['side'] == 'L' else '右') + ('手臂' if limb['kind'] == 'ARM' else '腿')
            active = obj.get(limb['key'], 0)
            box.label(text=f'{label}  ·  {"IK" if active >= .5 else "FK"}')
            row = box.row(align=True)
            for ik, text in [(False, '匹配 → FK'), (True, '匹配 → IK')]:
                op = row.operator('biped.switch', text=text, depress=(active >= .5) == ik)
                op.key, op.ik = limb['key'], ik
            row = box.row(align=True)
            if active >= .5:
                row.operator('biped.select_control', text='手掌' if limb['kind'] == 'ARM' else '脚掌').bone = limb['target']
                row.operator('biped.select_control', text='肘方向' if limb['kind'] == 'ARM' else '膝方向').bone = limb['pole']
                if limb['kind'] == 'LEG':
                    box.prop(obj.pose.bones[limb['target']], '["foot_roll"]', text='脚掌滚动')
            else:
                for i, name in enumerate(limb['fk']):
                    row.operator('biped.select_control', text=str(i + 1)).bone = name
        layout.label(text='IK 手脚固定于全局；移动 COM 调整身体', icon='INFO')
        layout.operator('biped.key_pose', icon='KEY_HLT')
        layout.operator('biped.reset_pose', icon='LOOP_BACK')


class BIPED_PT_tools(bpy.types.Panel):
    bl_label = '蒙皮、显示与烘焙'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Biped'
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout, obj = self.layout, rig_for_context(context)
        if not obj:
            layout.label(text='请先生成控制骨架')
            return
        layout.operator('biped.bind_mesh', icon='MOD_ARMATURE')
        layout.operator('biped.validate', icon='CHECKMARK')
        layout.operator('biped.figure', icon='EDITMODE_HLT')
        box = layout.box()
        box.label(text='骨骼集合显示')
        for col in obj.data.collections:
            if col.name not in ('内部 · Mechanism', 'Bip · 内部跟随', 'MCH', 'ORG', 'DEF'):
                box.prop(col, 'is_visible', text=col.name)
        layout.prop(obj, 'show_in_front', text='骨架透视显示')
        layout.label(text=f'烘焙帧段：{context.scene.frame_start} — {context.scene.frame_end}')
        layout.operator('biped.bake_skeleton', icon='ACTION')
        layout.label(text='烘焙生成新骨架，网格绑定保持原样', icon='INFO')


CLASSES = (BIPED_PT_structure, BIPED_PT_proportions, BIPED_PT_animation, BIPED_PT_tools)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
