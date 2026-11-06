# Biped Builder 1.2.0 · 原生对称与精简骨架

1.2.0 增加原生镜像兼容，自动配对实际存在的 L/R 对侧骨骼，工作骨架使用 Blender 可识别的 `.L / .R` 名称，例如 `Bip001 UpperArm.L` 和 `Bip001 UpperArm.R`。中间标记 `Bip001 L UpperArm` 以及词内 `ArmLBase` 也能自动识别配对；名称中有字母却没有实际对侧骨骼时不强行配对。含糊的多组候选会跳过，避免误配。

**已有骨架无需重建：**安装新版后选中体型或控制骨架，点击「修复原生对称并清理 DEF」。会同步已有绑定网格的权重组与动画引用，自动开启 X 轴镜像。体型编辑支持原生 X Mirror，控制器支持原生姿态复制 / 翻转粘贴。可以关闭面板中的「X 轴对称操作」单独调整一侧。

Blender 原生匹配有固定的前后缀规则，不能由插件把内核改为任意位置的 L/R 匹配。本插件先识别原名中的 L/R，再自动转成兼容名称，支持真正的原生镜像。原始 Bip 名称保存在骨骼属性中，烘焙导出骨架时恢复，例如 `Bip001 L UpperArm`。

**DEF 清理：**实际蒙皮只使用 Bip 骨；Rigify 自动生成但无依赖的重复 DEF 输出骨和 DEF 集合会删除。默认标准人体清理 55 根。自定义约束、驱动、父级或蒙皮仍引用的 DEF 会保留为隐藏内部骨，不参与第二套蒙皮。ORG / MCH 是控制计算结构，继续保留并隐藏。

1.1.1 修正了上一版强制开启球形 Pole 的设置。上臂和大腿现在默认使用肢体根部的箭头控制器旋转，球形 Pole 及其连线隐藏、不参与方向控制。手脚末端仍使用原生 IK 目标。

**已有 1.1 Rigify 骨架无需重建：**安装新版后选中角色，点击「Biped → 动画 · IK / FK → 改用箭头旋转控制」。这会原地匹配当前姿势，不改骨名、静置姿势或网格绑定。有当前动作时，会先复制动作，再按场景起止帧逐帧匹配转换；原动作保留。原生匹配存在小幅数值误差，转换后可检查极端姿势。

控制层采用 **Blender 自带 Rigify**：真实的 `hand_ik.L/R`、`foot_ik.L/R`、肢体旋转箭头、脚掌滚动，以及 Root、Torso、Hips、Chest 控制器。蒙皮层继续使用 `Bip001 L UpperArm` 等 Biped 名称。新角色不再使用 1.0 的自建 IK 系统。

手脚默认全部启用 IK。Rigify 的混合属性为 **0 = IK，1 = FK**。

## 安装或升级

1. 先保存 Blender 文件，在「编辑 → 偏好设置 → 插件」停用旧版 Biped Builder。
2. 用「从磁盘安装 / Install from Disk」安装 `dist/Biped_Builder_1.2.0.zip` 并启用。若 Blender 仍缓存旧模块，重启一次。
3. 在 3D 视图按 `N`，打开 `Biped` 标签。

这是本地传统插件 ZIP。生成时会启用当前 Blender 安装中的 Rigify，不会写入用户偏好设置文件。若安装中没有 Rigify，需先在 Blender 的插件设置中安装 / 启用它。

主要针对 Blender 5.2；最低版本声明为 4.2，未安装的版本不作实测保证。1.2 的实测记录见 `dist/symmetry_tests_*.json` 和 `dist/symmetry_upgrade_tests.json`。

## 已有 1.0 自建骨架

**安装新版不会改变已经生成的旧骨架。**

1. 选中旧控制骨架。
2. 在「Biped → 动画 · IK / FK」点击 **从旧骨架重建 Rigify**。
3. 插件从保留的体型生成新的 Rigify，隐藏旧骨架，选中新角色并进入姿态模式。

旧骨架、动作和蒙皮均保留。已有网格仍绑定旧骨架，确认效果后可在网格副本中将骨架修改器指向新骨架；对应 Bip 名称和静置姿势应保持一致。旧版 `CTRL_...` 动画不会自动迁移到 Rigify 控制器。

原始体型被删除或关节未接合时，需要修复或新建体型。

## 创建新角色

1. 设置高度、骨节和姿势，或使用「标准人体 / 游戏 / 截图」预设。
2. 点击「① 创建体型骨架」，在编辑模式移动关节贴合模型。
3. 保持四肢关节接合，保留轻微肘膝弯曲，不要将整条肢体拉成完全共线。
4. 点击「② 生成控制骨架」，生成真实 Rigify 控制器并进入姿态模式。

角色正面为 `-Y`，上方为 `+Z`，左侧为 `+X`。高度以厘米输入，尊重场景单位比例。参数用于新建体型，不会覆盖手工调整；返回体型后再生成会建立另一套成品。

## 操作 IK

点击「动画 · IK / FK → 选择控制骨架」，确认模式为 **姿态模式 / Pose Mode**。

| 控制器 | 操作 |
| --- | --- |
| `hand_ik.L / .R` | G 移动手部目标，整条手臂跟随；R 旋转手掌 |
| `foot_ik.L / .R` | G 移动脚部目标，整条腿跟随；R 旋转脚 |
| `upper_arm_ik.L / .R` | 旋转上臂箭头控制器，调整肘部朝向 |
| `thigh_ik.L / .R` | 旋转大腿箭头控制器，调整膝部朝向 |
| `foot_heel_ik.L / .R` | 旋转脚掌 / 脚跟控制器，进行脚掌滚动 |
| `root` | 移动、旋转整个角色，包括手脚 IK |
| `torso` | 移动身体，IK 手脚默认保持原位 |
| `hips / chest / neck / head` | 调整骨盆、胸部、颈部和头部 |
| `..._fk.L / .R` | FK 模式下逐节旋转四肢 |

面板提供「手 IK」「脚 IK」「上臂旋转」「大腿旋转」选择按钮。手脚目标按 G 移动；上臂和大腿箭头按 R 旋转，局部 Y 轴旋转可调整肘膝弯曲方向，手脚目标保持原位。脚掌滚动按钮选择原生脚跟控制器，不使用旧版 `foot_roll` 属性。

**0 = IK，1 = FK**，与旧版方向不同。「匹配 → IK / FK」使用当前安装的 Rigify 匹配逻辑对齐姿势后切换；直接拖混合滑条只做混合，不自动匹配。

只操作可见的 Rigify 线框控制器。`Bip...` 为蒙皮骨，默认隐藏且不可选；`ORG-`、`MCH-`、`DEF-` 是 Rigify 内部骨，不用于直接操作。

FK 集合初始隐藏，切换到 FK 或点击 FK 选择按钮后显示。微调集合也初始隐藏，可在「蒙皮、显示与烘焙 → 骨骼集合显示」打开。

插件中文面板在未执行 `.blend` 内嵌 UI 脚本时也可完成选择、IK/FK 匹配和切换；它使用本机 Rigify 的代码，不执行文件中的脚本，不修改脚本信任设置。Rigify 自带的 Rig Main Properties 面板也可使用。

## 骨节与命名

支持手臂开关、颈部 1–25 节、脊椎 1–10 节、腿 3 / 4 节、尾部 0–25 节、两组马尾各 0–25 节、手指 0–5 根且各 1–4 节、短拇指、脚趾 1–5 根且各 1–3 节、三组道具、T / A Pose、肩宽、髋宽、臂长和踝部附着。

「截图」预设：高度 315.52 厘米、脊椎 4、颈部 1、腿 3、手指 1 × 1、脚趾 1 × 3、踝部附着 0.2；三角形骨盆开启、三角形颈部关闭。

体型可以直接开启 X 轴镜像进行编辑，也可以使用插件「左 → 右 / 右 → 左」按钮。旧中间 L/R 名称先点击「修复原生对称并清理 DEF」，之后即可使用 Blender 的原生镜像工具。

烘焙导出的标准 Bip 骨名示例（工作骨架的左右骨使用等价 `.L / .R` 名称）：

```text
Bip001
Bip001 Pelvis
Bip001 Spine / Spine1 / Spine2 / Spine3
Bip001 Neck / Neck1 ...
Bip001 Head
Bip001 L Clavicle
Bip001 L UpperArm / Forearm / Hand
Bip001 L Finger0 / Finger01 / Finger02
Bip001 L Finger1 / Finger11 / Finger12
Bip001 L Thigh / Calf / Foot
Bip001 L Toe0 / Toe01 / Toe02
Bip001 R ...
Bip001 Tail / Tail1 ...
Bip001 Ponytail1 / Ponytail11 ...
Bip001 Prop1 / Prop2 / Prop3
```

真正的蒙皮骨仅为 Bip 骨；没有实际依赖的 Rigify `DEF-` 已清理。跟随层保留静置方向差异，避免 Rigify 自动调整 Roll 后让 Bip 骨翻转。

一节脊椎使用 Rigify FK 身体链；至少两节脊椎时生成 Torso / Hips / Chest。四节兽腿使用 Rigify Paw；尾部、马尾、道具使用 Rigify FK。人体两节肢体是主要操作目标。

## 蒙皮、动画与导出

选择未绑定骨架的网格，在面板指定新 Rigify 角色，点击「自动权重绑定所选网格」。仅为 Bip 骨建立顶点组；已有骨架修改器的网格会被拒绝，请先在副本中处理。自动权重仍需检查和修整。

「整套姿势打关键帧」记录 Rigify 控制器和数值自定义属性。「重置整套姿势」恢复变换并将手脚设回 IK，不删除已有动画。

按时间轴起止帧「烘焙纯 Bip 动画骨架」，会创建新的纯 Bip 骨架及逐帧动作，包含 Root 运动，不含控制器和约束。原始网格仍绑定原控制骨架；导出皮肤网格时需在副本中改用烘焙骨架。FBX 可关闭 Add Leaf Bones。

工作网格顶点组为 `.L / .R` 兼容名称；纯 Bip 烘焙骨架恢复了 Max 风格名称。网格副本改绑时也需要将其顶点组恢复到相同的 Bip 名称，映射保存在烘焙对象的 `biped_vertex_group_map` 属性中。直接修改原始工作网格的组名会破坏原绑定，请只处理导出副本。

本插件不读取 Max `.bip` 文件，不含 Character Studio Footstep 或自动重心平衡。同名不代表轴向和动画控制器数据与 Max 完全兼容。

## 示例与验证

- 新示例：`dist/Biped_Rigify_1.2.0_Demo.blend`。先启用插件再打开文件，选中新角色，在姿态模式操作。1–48 帧演示手部 IK、下蹲和脚掌滚动。
- `tests/rigify_integration.py`：用真实控制器选择及 Blender 变换操作验证 G 移动、左右上臂和大腿箭头的 R 旋转、手脚位置保持、球形控制隐藏、IK/FK 匹配、动画模式转换、烘焙、自动权重和旧版重建。
- `tests/rigify_reload.py`：新进程禁用内嵌脚本后重开示例，检查 IK 与匹配。
- `tests/symmetry_upgrade.py`：测试原生编辑镜像、翻转姿态粘贴、词内 L/R 配对、旧 1.1.1 蒙皮与动作升级、DEF 依赖保护。
- `tests/install_smoke.py`：隔离目录安装 ZIP 并生成 Rigify。
- `symmetry_tests_*.json` 是 1.2 记录；`rotation_ik_tests_*.json` 是 1.1.1 记录；`rigify_tests_*.json` 是 1.1.0 记录。`test_results_*.json` 与 `Biped_Builder_Demo.blend` 是 1.0 留档，不代表新版测试。

参考：[Blender Rigify 官方组件](https://docs.blender.org/manual/en/5.2/addons/rigify/rig_types/index.html)、[Autodesk Biped 骨节设置](https://help.autodesk.com/cloudhelp/2024/ENU/3DSMax-Character-Animation/files/GUID-4C763A71-2ACE-4B75-8F33-4521C39D9E20.htm)。
