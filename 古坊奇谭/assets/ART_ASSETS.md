# 游戏美术资源

游戏的建筑、士兵、地图、界面图形、图标和地图特效均从目录读取 PNG。文字、等级、金额、血量数值继续由程序显示，图片负责外观，程序负责位置、缩放、旋转、淡出和填充比例。

打开 [ART_CATALOG.html](ART_CATALOG.html) 可按分类查看 **217 张图片**（含本次新增 79 张），点击缩略图即可打开原 PNG。[asset-manifest.json](asset-manifest.json) 记录全部路径、实际尺寸和用途；[interface-manifest.json](interface-manifest.json) 记录本次拆出的 UI／特效尺寸及切片参数。

## 统一修改规则

### 场景与士兵的统一风格

建筑、树石、墙体、远山、UI 和图标现使用更厚重的像素材质配色，外轮廓与士兵保持相同的 **深焦棕色 `#4a2e20`**。本次覆盖 **211 张非士兵 PNG**：包括 75 张建筑外观、地形与连接瓦片、场景装饰、UI、叠加图素及特效。六张士兵图集保留。

- 外轮廓仅占原生画布一像素，不向内部扩张或用棕色填充材质。
- 仅对建筑实体描边，淡色庭院／地台不做方框式包边。
- 草地、水面、沙岸、地面道路使用更深的材质色，不逐地块描框；城墙与桥梁的实体边缘加描边，连接边界不封口。
- 原尺寸、建筑锚点、道路／城墙的 16 向连接掩码和 UI 6px 九宫格切片参数保留。抗锯齿 Alpha 已归为 0／255，动态淡出仍由运行时控制。
- 首页场景由内置 image_gen 按统一风格重绘；其余资源保留原有结构，通过像素调色、材质对比度和外轮廓处理统一风格。

旧资源完整备份位于 `assets/generated/world-style/before/assets/`；制作清单、提示词和说明见 [world-style/README.md](generated/world-style/README.md)。改前／改后游戏场景见 [scene-before-after.png](generated/qa/world-style/scene-before-after.png)。

`npm run art:world-style` 会**从本次备份的原图**重建风格资源，因此会覆盖后续对成品图片的手工修改；平时改 PNG 后仅刷新游戏或运行 `npm run build` 即可，不需要重跑风格脚本。

- 文件夹和文件名使用小写英文，单词用 `-` 连接；建筑、道路、士兵保留原有命名，避免断开引用。
- 保持文件名、PNG 格式、画布尺寸、透明边距和锚点。图案可以重绘，透明区域不要填成白色。
- 沿用现有精灵的像素硬边与低饱和青绿、米黄、木棕、砖红配色。按原生像素作画，关闭抗锯齿；所有图片 Alpha 为 0 或 255，运行时淡出由程序控制。
- 同名图片可能用于多个位置，例如 `ui/icons/coin.png` 同时用于顶部资源栏、建造费用和地图收入飘字，改一次即可同步。
- UI 文字及资源数字不会烘焙进图片，避免不同屏幕与实时数值使图片失效。菜单的“坊”、印章文字、席位文字也作为文本叠加。
- 图片文件一一独立，没有把所有控件合并成一张大图；资源总览不是游戏读取的图集。

## 界面 UI

| 路径 | 尺寸 | 用途／修改要求 |
| --- | --- | --- |
| `assets/ui/panels/*.png` | 32×32 | 面板、按钮、弹窗、卡片。**四边切片 6px**，中间 20×20 为填充区；不要把花纹画跨切片边界。 |
| `assets/ui/icons/*.png` | 32×32 | 铜钱、工材、关闭、箭头、技能、开始、合作、读档等。透明边距包含在尺寸内。 |
| `assets/ui/bars/*.png` | 16×6 | 血条底、友军、敌军、建筑与残血色条。会横向伸缩。 |
| `assets/ui/controls/switch-*.png` | 40×22 | 音效开关的开启／关闭两态。 |
| `assets/ui/backgrounds/paper.png` | 64×64 | 首页纸张底纹，平铺使用，边缘应无缝。 |
| `assets/ui/backgrounds/title-town.png` | 256×128 | 首页古镇场景，使用现有建筑组合，透明背景。 |
| `assets/ui/backgrounds/dimmer.png` | 2×2 | 弹窗遮罩基色，运行时透明度 60%。 |

面板名称对应关系：`paper` 通用纸面／顶部栏／弹窗；`card` 建造卡片／技能按钮；`inset` 效果区／设定区／席位；`primary` 主按钮；`secondary` 次按钮；`disabled` 不可用按钮；`dark` 提示条；`danger` 危险操作；`warning` 预留警告；`ally` 队友庄园牌；`enemy` 敌方牌；`night` 预留夜间顶栏；`seal` 印章；`ornament-border` 首页装饰边。

图标对应关系：`coin` 铜钱；`materials` 工材；`repel` 驱鬼符；`repair` 回春诀；`thunder` 九霄天雷；`upgrade` 地图升级提示；`single` 单人／网页图标；`coop` 合作／切换席位；`load` 读档；`close` 关闭；`arrow-right` 菜单箭头；`diamond` 装饰菱形；`grip` 面板拖条。`invasion`、`sound-on`、`sound-off` 为预留图标，当前音效开关使用 controls 图片。

按钮按正常／悬停／不可用切换面板 PNG；按下保留位移反馈，键盘焦点保留浏览器轮廓。禁用、锁定、受击的灰化与闪白由程序控制，无需额外绘制每种颜色组合。

## 地图叠加与特效

| 目录／文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `assets/overlays/selection.png`、`placement.png` | 64×64 | 选中格、空地建造加号 |
| `assets/overlays/hints/<coins或materials>-tier-<1至3>.png` | 64×64 | 铜钱／工材增益的三级角标 |
| `assets/overlays/range.png` | 128×128 | 箭塔范围，以中心缩放 |
| `assets/overlays/level-badge.png` | 24×24 | 建筑等级底，数字由程序叠加 |
| `assets/overlays/gate-broken.png` | 64×64 | 城门破损裂口 |
| `assets/overlays/pulse.png`、`repair.png`、`repel.png`、`freeze.png`、`slow.png`、`aura.png` | 64×64 | 法术、封印、减速、光环，透明中心 |
| `assets/overlays/links/*.png` | 9×4 | 商／农／丝／工产业链连接，横向重复后旋转 |
| `assets/overlays/grid.png` | 64×64 | 地图网格，平铺 |
| `assets/overlays/territory-edge.png` | 64×4 | 庄园边界，旋转使用 |
| `assets/overlays/territory-shade.png` | 2×2 | 庄园外区域底色，运行时透明度约 9.5% |
| `assets/effects/rock.png` | 16×16 | 擂石弹丸 |
| `assets/effects/arrow.png`、`bolt.png` | 32×8／32×6 | 弓箭／箭塔投射物，朝右绘制，由程序旋转 |
| `assets/effects/thunder.png` | 48×64 | 落雷，底部为落点 |
| `assets/effects/soldier-hit.png`、`hit.png` | 32×32 | 近战受击／命中 |
| `assets/effects/swallow.png` | 16×8 | 飞燕 |
| `assets/effects/water-ripple.png` | 32×12 | 水波 |
| `assets/effects/shadow.png` | 32×16 | 预留通用脚底阴影 |
| `assets/scenery/mountain-<1至4>.png` | 128×128 | 地图外围远山，底部对齐 |
| `assets/scenery/world-background.png` | 2×2 | 地图外的背景基色 |

战斗特效与地图标记按画布中心定位。兵种的位移、朝向、攻击摆动、受击闪白等继续由动画程序控制，不需要逐个修改动画代码。

## 士兵

路径：`assets/sprites/soldiers/<infantry或archer>_<阵营>.png`。保留原有 **240×90** 图集布局，每帧 **20×30**，12 列×3 行；每个等级依次为正面、背面、左、右四帧，3 个等级一行。`player-red` 为己方、`ally-green` 为友方、`enemy-purple` 为敌方。

兵种采用统一的圆头、短肢、厚实轮廓像素风。**仅在透明边界保留一像素深焦棕色外轮廓（`#4a2e20`）**，不向内部扩张。内部不加统一棕线，保留衣料、皮革、金属各自的颜色与柔和材质暗部，眼睛保留为小型面部特征。步兵保留长矛与盾牌；弓兵保留弓与箭囊。升级时保持身体比例，增加装备覆盖和配件，而非只改颜色。

| 等级 | 装备阶段 |
| --- | --- |
| 1 | 基础布衣、头巾、简易武器 |
| 2 | 布帽、布护腕、腰包 |
| 3 | 绗缝布甲、加厚肩领、绑腿 |
| 4 | 皮革背心、皮帽、皮护腕 |
| 5 | 加厚皮甲、肩甲、手套、护胫 |
| 6 | 全套皮甲、双肩护甲、皮腰甲与皮靴 |
| 7 | 白银胸甲、银盔、银色武器配件 |
| 8 | 银甲搭配金色肩甲、头盔饰边与武器配件 |
| 9 | 黄金头盔、胸甲、双肩甲、护腕、腰甲与护胫，配高级武器 |

制作源图及打包元数据保存在 `assets/generated/archers/` 和 `assets/generated/infantry/`，运行时只使用 `assets/sprites/soldiers/` 下的六张图集。打包工具可用 `--type=infantry` 切换为步兵；阵营配色工具同样支持该参数。旧兵种图集保留在各自 generated 目录的备份子目录中。

本版重建顺序：

```sh
node scripts/prepare-archer-sheet.cjs pack assets/generated/archers/player-red-source-v3.png --sides=assets/generated/archers/player-red-sides-v1.png
node scripts/prepare-archer-sheet.cjs pack assets/generated/infantry/player-red-source-v2.png --type=infantry --sides=assets/generated/infantry/player-red-sides-v1.png
node scripts/prepare-archer-factions.cjs
node scripts/prepare-archer-factions.cjs --type=infantry
node scripts/warm-soldier-outlines.cjs
node scripts/preview-archer-style.cjs
npm run build
```

`warm-soldier-outlines.cjs` 必须在重新打包和阵营换色后运行：按每帧 Alpha 的四邻接边界识别外轮廓，仅改变边缘上的暗像素；内部原始暗线使用邻近材质颜色的阴影替代。不会改变 Alpha、轮廓位置与图集布局。不要直接在上一版已全局染棕的图集上重复处理，否则无法恢复丢失的材质颜色。`--sides` 是 3 列×2 行的 4–9 级侧面补图；打包时会先统一源图像素比例，避免不同源尺寸把高等级缩小。资源总览用于直接修改成品 PNG，手工改图后无需运行重建脚本。

## 建筑

路径：`assets/sprites/buildings/<建筑类型>/level-<外观等级>.png`

- 图片尺寸：`64x64`
- 地面锚点：`(32, 48)`
- 缩放方式：最近邻硬边缘，不使用平滑插值
- Alpha 通道：二值透明，所有像素透明度只能为 `0` 或 `255`
- `level-1.png`：游戏等级 1-3
- `level-2.png`：游戏等级 4-6
- `level-3.png`：游戏等级 7 及以上

城门也属于建筑，路径为 `assets/sprites/buildings/gate/`。

## 地图

- 基础地表：`assets/tiles/terrain/`，每张 `64x64`
- 地图资源装饰：`assets/tiles/resources/`
- 城墙：`assets/tiles/walls/`，每张 `64x64`
- 地面道路和水上桥梁：`assets/tiles/roads/`，每张 `64x64`

城墙和道路文件名中的十六进制数字是四方向连接掩码：

- `1`：上
- `2`：右
- `4`：下
- `8`：左

例如 `05.png` 表示上下连接，`0a.png` 表示左右连接，`0f.png` 表示四面连接。

## 修改生效

- 使用源码版 `index.html`：替换同名 PNG 后刷新页面即可。
- 使用 `dist/古坊奇谭.html`：替换 PNG 后执行 `npm run build`，图片会重新嵌入离线单文件。
- `npm run art:catalog`：修改图片后刷新资源清单和总览，不会修改 PNG。
- `npm run art:interface`：只补齐缺失的 UI／特效 PNG，**保留已存在图片**；不是每次改图必须执行的步骤。
- `node scripts/export-interface-assets.cjs --overwrite`：主动重置本次新增的 UI／特效资源，**会覆盖你的手工修改**。
- `npm run test:png`：检查源码版与离线版的图片加载、菜单交互及同名图片替换，覆盖 320／390／1440 宽度。
- `node scripts/generate-art-assets.cjs` 会用原程序外观重新生成并覆盖全部建筑和地图 PNG，请勿在保留手工修改时运行。

本次 UI 包来自 `scripts/interface-art-source.js` 的像素绘制导出与现有建筑拼合，未调用 AI 生图；游戏运行时只读取导出的 PNG，不调用该绘制源文件。修改图片后无需编辑绘制源代码。
