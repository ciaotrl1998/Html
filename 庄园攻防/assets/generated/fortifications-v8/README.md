# v8 · 两向城门与中式城墙

> 后续[v9损毁态](../gate-destruction-v9/README.md)已接入：横竖两种残骸供所有等级共用，取代旧裂缝叠加。完好城门与城墙仍为本版；当前构建几何由v9合并，重建流程会自动保留损毁态。

> 城墙现采用[v10转角拼接修正](../wall-corner-fix-v10/README.md)：保留本版直墙材质，统一墙顶、垛口与墙身的完整剖面，不再分别缩放生成的转角主体。旧版仅校验边界像素，未能防止拐角内部错位；现已增加通道连续性、墙身基线和实际地图近景回归。

2026-10-16，使用**内置imagegen**按现有建筑的平面卡通、灰蓝／米白配色和细深棕描边重新生成，Node/pngjs仅负责透明化、像素整理、裁切、拼接登记与安装。不使用外部API／CLI；城门不做X/Y分别拉伸。

## 当前已接入

- `assets/sprites/buildings/gate/stages.png`：南北门正面，direction 0/2，三阶段288×128，单帧96×128。主体宽64固定，高64／82／92。
- `assets/sprites/buildings/gate/stages-ew.png`：东西门侧向，direction 1/3，同样288×128。主体宽40固定，高66／81／94。是重新绘制的侧面，不是把正面位图旋转90度。
- 同目录`level-N.png`及`level-N-ew.png`：各三张64×64界面预览，详情根据方向取图。
- `assets/tiles/walls/00.png`至`0f.png`：16张64×64中式城墙连接瓦片，保留N=1、E=2、S=4、W=8掩码，不改地图和碰撞规则。

初级两向城门均至少一格高，后续只沿原生图素增加层高。帧内锚点(48,120)不变；南北门落点为格内(32,54)，与横墙前基座对齐；东西门侧向落点为(32,64)，沿纵墙连接。门柱背后的短接头来自同一城墙PNG，补齐屋檐较宽、门柱较窄产生的草缝，不画墙封住通道中央。血条、等级牌、破损图及详情预览都同步方向。

城墙采用半俯视**正交**投影：墙顶步道、灰蓝压顶、垛口、砖墙前立面和箭孔，保持水平／垂直路径及直角转弯，不采用透视汇聚或菱形等距轴。只给外边缘保留一原生像素#4A2E20描边，Alpha为0或255。

## 成品与备份

- [gates-3x.png](gates-3x.png)：两方向、各三个阶段的像素放大预览。
- [walls-4x.png](walls-4x.png)：16连接图素的像素放大预览。
- [fortifications-v8.zip](fortifications-v8.zip)：24张运行PNG及坐标、连接、几何清单，包含原目录结构。
- [manifest.json](manifest.json)：两向六帧源图边界、等比系数、主体尺寸及16个墙体连接口。
- [metrics.json](metrics.json)：当前全部建筑的运行几何，构建时核对`js/art.js`标记区。
- [installation.json](installation.json)：24张成品的新旧哈希。原有16张城墙、4张南北门图片共20张完整备份在`before/assets/`；新增4张东西门没有伪造“旧图”备份。其他中间稿另行保留。

原始生成图保存在`sources/`。最初的城门稿偏矮、带多余侧墙，未安装；最终采用`gates.png`上排的南北门与`gate-side-final.png`中的东西门。

## 实际内置生图提示词

- [首轮城门](prompt-gates.txt)：`sources/gates-first.png`，未采用。
- [城门高度与角度修订](prompt-gates-height-revision.txt)：`sources/gates.png`，采用上排南北门。
- [侧向城门定宽层高最终稿](prompt-gate-side-final.txt)：`sources/gate-side-final.png`，采用全部三帧。
- [中式半俯视城墙](prompt-walls.txt)：`sources/walls.png`，用于16个模块。

`style-reference.png`为原建筑配色／设计参考；白色`*-guide.png`只约束布局和连接方向。当前裁切阶段取生成的横／纵直墙内部纹样，用`scripts/wall-autotile.cjs`按固定剖面组装全部16个掩码：纵墙范围x=16..47，横墙顶y=14..41，朝下墙身y=42..53；纵向步道宽14像素，横向步道投影高8像素，转角内部也使用同一纹样相位。四角垛口仅在固定角块中衔接，向南继续的墙段不再出现封口立面。开放连接臂整段与对应直墙逐像素相同，16像素纹样周期可连续跨越64像素瓦片和地形缓存分块。非连接边保持透明，不再强迫相邻边界像素同色来掩盖内部偏移。

## 重建与验证

```sh
npm run art:fortifications
npm run test:fortifications
npm run test:buildings
```

只手工改运行PNG时，运行`npm run art:catalog`和`npm run build`即可；重建命令会用已保存源图重新安装。`npm run art:buildings`会先重建基础建筑，再应用本版覆盖，不会把城门退回旧稿。

源码版和离线版均已更新。游戏经济、士兵、升级、存档、联机及地图生成未改，原有未提交改动保留。实际游戏截图与验证见[验收记录](../qa/fortifications-v8/VALIDATION.md)。
