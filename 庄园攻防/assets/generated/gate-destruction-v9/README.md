# 城门损毁图 · 两向共用版

2026-10-16，按现有v8城门／城墙的平面卡通、灰蓝瓦片、米白砖石、木棕与细深棕描边风格，使用**内置imagegen**生成；未用外部API／CLI。Node/pngjs仅裁切、等比像素化、清理透明边缘、打包与安装。

## 最终文件

- `assets/sprites/buildings/gate/destroyed.png`：横向城墙上的南北门损毁态，左右残柱，中央纵向开口。
- `assets/sprites/buildings/gate/destroyed-ew.png`：竖向城墙上的东西门损毁态，上下残骸，中央横向开口。
- 两张地图PNG都为96×128，帧内地面锚点(48,120)。残骸主体分别64×25、45×64，不做X/Y分别拉伸，也不随等级改变尺寸。三个外观阶段以及游戏Lv1–15共用，只有这两个状态。
- 同目录`destroyed-preview.png`／`destroyed-preview-ew.png`：64×64同源等比详情预览，不是额外损毁等级。
- [destroyed-gates-4x.png](destroyed-gates-4x.png)：去除顶部多余透明留白后的最近邻4倍预览；两张运行PNG仍保留完整96×128画布。
- [gate-destruction-v9.zip](gate-destruction-v9.zip)：4张运行PNG及源图裁切、坐标和等比系数清单，保留项目目录结构。
- [manifest.json](manifest.json)、[installation.json](installation.json)：两种状态、安装路径及SHA256。

耐久≤0时直接用对应残骸替换完整城门，不再在完整建筑上叠加旧裂缝。修复至耐久>0后恢复对应方向及等级的完好图。血条随残骸高度下降；已选中的详情页在耐久跨过0时刷新，无须重新点选。原有修复、升级、士兵通行、存档和联机规则未改变，v9只是美术版本。

完好城门和城墙PNG未改；旧`assets/overlays/gate-broken.png`保留但不再绘制。接入前渲染器、详情页和几何记录保留于`before/`。

## 实际内置生图提示词与源图

- [首轮两向提示词](prompt.txt)：`sources/first.png`。采用左侧横向残柱；右侧仍像正面门框，未采用。
- [竖向损毁最终提示词](prompt-ew.txt)：`sources/ew.png`。采用上下两处残骸，中间横向通道真正透明。
- `ns-style-reference.png`为首稿横向部分的无损裁切，仅用于竖向稿的材质／描边参考。

没有火焰、烟雾、黑色假洞、背景地板或大范围瓦砾，留出透明通道。两个断开的残骸组属于同一帧，裁切时均保留，不把上方残骸误作多余行丢掉。

## 重建与验证

```sh
npm run art:gate-destruction
npm run test:gate-destruction
```

完整的`art:buildings`、`art:fortifications`流程也会最后应用本版，构建核对`metrics.json`与`js/art.js`标记区一致。手工改运行PNG后只需运行`npm run art:catalog`、`npm run build`，不必重建覆盖手改内容。

验证包含二值透明、空通道、两个固定图素、零耐久存档、四方向与三个外观阶段、全部Lv1–15均取同一损毁帧、修复后恢复完好图、实时详情刷新，以及源码／离线资源加载。截图见[验收记录](../qa/gate-destruction-v9/VALIDATION.md)。
