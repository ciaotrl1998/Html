bl_info = {
    "name": "Biped Builder · 标准人体骨骼",
    "author": "Biped Builder contributors",
    "version": (1, 2, 0),
    "blender": (4, 2, 0),
    "location": "3D View > Sidebar > Biped",
    "description": "Biped 命名与可调骨节，使用 Blender Rigify 生成原生 IK/FK 控制器",
    "category": "Rigging",
}

from . import properties, operators, panels
import bpy
from bpy.app.handlers import persistent
from .rig import refresh_controls


@persistent
def update_control_visibility(scene, depsgraph=None):
    for obj in scene.objects:
        if obj.get('biped_kind') == 'RIG' and 'biped_limbs' in obj:
            refresh_controls(obj)


def register():
    properties.register()
    operators.register()
    panels.register()
    bpy.app.handlers.frame_change_post.append(update_control_visibility)


def unregister():
    if update_control_visibility in bpy.app.handlers.frame_change_post:
        bpy.app.handlers.frame_change_post.remove(update_control_visibility)
    panels.unregister()
    operators.unregister()
    properties.unregister()
