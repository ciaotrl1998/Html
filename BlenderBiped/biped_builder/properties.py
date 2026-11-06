import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, IntProperty, PointerProperty, StringProperty


class BIPED_Settings(bpy.types.PropertyGroup):
    root_name: StringProperty(name="根名称", default="Bip001", maxlen=24,
                              description="变形骨名称前缀，例如 Bip001、Bip01；自动为新角色分配不重复名称")
    height_cm: FloatProperty(name="高度（厘米）", default=180.0, min=10, max=2000)
    arms: BoolProperty(name="手臂", default=True)
    spine_links: IntProperty(name="脊椎链接", default=4, min=1, max=10)
    neck_links: IntProperty(name="颈部链接", default=1, min=1, max=25)
    leg_links: EnumProperty(name="腿链接", items=[('3', "3 · 人体", "大腿、小腿、脚"),
                                                ('4', "4 · 兽腿", "增加 HorseLink；使用三节腿 IK")], default='3')
    tail_links: IntProperty(name="尾部链接", default=0, min=0, max=25)
    ponytail1_links: IntProperty(name="马尾辫 1 链接", default=0, min=0, max=25)
    ponytail2_links: IntProperty(name="马尾辫 2 链接", default=0, min=0, max=25)
    fingers: IntProperty(name="手指", default=5, min=0, max=5)
    finger_links: IntProperty(name="手指链接", default=3, min=1, max=4)
    short_thumb: BoolProperty(name="短拇指", default=False, description="拇指比其他手指少一节")
    toes: IntProperty(name="脚趾", default=1, min=1, max=5)
    toe_links: IntProperty(name="脚趾链接", default=1, min=1, max=3)
    ankle_attach: FloatProperty(name="踝部附着", default=0.2, min=0, max=1,
                                description="踝关节沿脚掌的位置：0 接近脚跟，1 接近脚趾")
    triangle_pelvis: BoolProperty(name="三角形骨盆", default=False,
                                  description="大腿父级改为最低脊椎；影响骨骼层级，请在蒙皮前决定")
    triangle_neck: BoolProperty(name="三角形颈部", default=True,
                                description="锁骨接到最上方脊椎；关闭时接到最低颈骨")
    prop1: BoolProperty(name="道具 1 · 右手", default=False)
    prop2: BoolProperty(name="道具 2 · 左手", default=False)
    prop3: BoolProperty(name="道具 3 · 身前", default=False)
    stance: EnumProperty(name="初始姿势", items=[('T', "T Pose", "水平手臂"), ('A', "A Pose", "手臂下垂约 30 度")], default='T')
    shoulder_width: FloatProperty(name="肩宽比例", default=1.0, min=0.6, max=1.6)
    hip_width: FloatProperty(name="髋宽比例", default=1.0, min=0.6, max=1.6)
    arm_length: FloatProperty(name="臂长比例", default=1.0, min=0.6, max=1.5)
    at_cursor: BoolProperty(name="在 3D 游标处创建", default=True)
    rig: PointerProperty(name="当前控制骨架", type=bpy.types.Object,
                         poll=lambda self, obj: obj.type == 'ARMATURE' and obj.get('biped_kind') == 'RIG')


def register():
    bpy.utils.register_class(BIPED_Settings)
    bpy.types.Scene.biped_settings = PointerProperty(type=BIPED_Settings)


def unregister():
    del bpy.types.Scene.biped_settings
    bpy.utils.unregister_class(BIPED_Settings)
