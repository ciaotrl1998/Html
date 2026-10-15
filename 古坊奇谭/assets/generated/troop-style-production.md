# 统一兵种制作记录

以用户认可的 `archers/player-red-source-v2.png` 为风格基准：圆头、厚实躯干、短肢。装备九级成长依次为布衣、布配件、绗缝布甲、皮背心、皮肩甲、全套皮甲、白银、银金混合、黄金。己／友／敌三个阵营使用相同 Alpha 与身体形状。

生产图集：`../sprites/soldiers/` 下 infantry／archer × player-red／ally-green／enemy-purple 六张 240×90 PNG，每格 20×30；原有渲染布局与逻辑不变。

制作采用内置 image_gen 编辑，源图、提示词及侧面补图保留于各兵种目录。棕色描边生图参考仅用于确定暖棕色方向；成品通过原生像素调色落实参考，保留原来的形状和二值透明，避免生图色彩参考的半透明光晕进入游戏。

`scripts/warm-soldier-outlines.cjs` 现已改为仅对透明边界的暗像素使用一像素深焦棕色 `#4a2e20`。内部暗线用邻近衣料、皮革、金属的材质阴影替代，眼睛保留为小型面部特征；不再全局染棕或给内部缝隙描边。应从高分辨率原图重新打包、阵营换色后再处理，完整命令见 `../ART_ASSETS.md`。旧版全局染棕的六张图集保存在 `outline-before-exterior-only/`，用于前后对照。

侧面补图为 3 列×2 行，4／5／6 级在上排，7／8／9 级在下排。打包时统一不同源图的像素尺度，去除相邻格残点，再使用统一脚底锚点。右侧由左侧镜像生成，保证两侧大小一致。

步兵下半身裁切修复：主源图与侧面补图改按实际行间空隙分排，不再按图片高度等分，保留 4–9 级完整的腿部和靴子。三个阵营已同步，旧图集在 `infantry/before-row-crop-fix/`，对照图在 `qa/infantry-crop/before-after.png`；运行 `npm run test:art-packing` 验证。

步兵侧面尺寸修复：侧面补图改按同级正背面实际人物高度等比缩放，避免源图留白不同造成左右朝向偏小；三个阵营的 4–9 级四向高度误差最多一个像素，脚底锚点不变。修复前图集在 `infantry/before-side-scale-fix/`。

对照预览：`qa/archer-style/equipment-progression.png`；实际游戏三阵营渲染：`qa/archer-style/in-game-factions.png`。原始旧兵种图集在对应目录的备份子目录中。

最终使用的提示词：[步兵装备成长](infantry/generation-prompt-v2.txt)、[弓兵装备成长](archers/generation-prompt-v3.txt)、[步兵侧面](infantry/generation-prompt-sides.txt)、[弓兵侧面](archers/generation-prompt-sides.txt)、[棕色描边](brown-outline-prompt.txt)。

验证：六张图集尺寸／36 帧／二值透明／暖棕暗部检查通过；士兵动画、16 项兵种规则、源码与离线版三个宽度的兵营分支及联机检查通过。额外运行的通用 PNG 界面测试在现有 `assets/overlays/range.png` 非二值 Alpha 上失败，该图片未在本次兵种修改中改动。
