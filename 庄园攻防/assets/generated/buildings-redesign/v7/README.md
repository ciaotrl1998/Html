# v7 · 全建筑平面卡通像素版

> 后续更新：当前城门与城墙已由[v8两向城门／中式城墙](../../fortifications-v8/README.md)修订；本目录保留基础建筑及此前城门归档。当前构建读取v8几何，重建全部建筑后会自动应用v8覆盖。

2026-10-16，按用户确认的`review-v6-thin-outline.png`风格与`user-approved-palette.png`配色，使用**内置imagegen**完成25类、每类3阶段，共75个图素；随后以Node/pngjs清理透明边缘、等比像素化、裁切并接入游戏。没有调用外部生图API或CLI，没有非等比拉伸。

## 成品

- [buildings-atlas.png](buildings-atlas.png)：864×1152透明总图，9列×9行，最后6格留空。
- [buildings-atlas-2x.png](buildings-atlas-2x.png)：最近邻2倍预览。
- [buildings-by-type.zip](buildings-by-type.zip)：25张单建筑三阶段PNG及坐标清单。
- [by-building/manifest.json](by-building/manifest.json)：每张288×128，左／中／右为低／中／高；单帧96×128，锚点(48,120)。
- `ready/<type>/level-N.png`：75张原生地图帧，与图集各格像素一致。
- `thumbnails/<type>/level-N.png`：75张64×64界面预览，同源图案等比整理到56×56范围，地面y=60；不把地图画布的顶部空白带进卡片。
- [buildings-atlas.json](buildings-atlas.json)：每帧实际主体边界、源文件、裁切边界、单一等比系数与适用游戏等级。
- [metrics.json](metrics.json)：实际帧尺寸、锚点及各建筑三阶段高度，构建时检查渲染器一致性。
- [installation.json](installation.json)：100张已安装PNG的新旧哈希与备份位置。接入前完整100张图片保留在`before-buildings/`，不会被后续重复安装覆盖。

地图读取`assets/sprites/buildings/<type>/stages.png`，UI读取同目录`level-N.png`。新版已写入源码版、`js/runtime.js`和`dist/庄园攻防.html`，离线包内嵌全部资源。游戏经济、升级、兵种、存档与联机结算规则未改变，原有未提交改动保留。

## 画面约束

平面2D、简约少色块、中式瓦顶、细深棕外描边#4A2E20，无写实材质、斜向等距透视或背景光晕。透明Alpha为0或255，透明像素RGB清零。像素化采用最近邻及轻量颜色量化；所有建筑均只用一个缩放系数，源图新增楼层与塔身体现升级，不分别拉长X/Y。

城门固定64像素宽，高度34／50／61；箭塔高度60／72／84；水田固定48×48，开放田埂和可见浅水，不加围栏；桑园旁保留中式小屋。祠堂初级54×49，汇财会馆58×40、百工院58×38，普通房屋初级宽42；终极建筑从初级即可识别铜钱／锤砧标志。大多数普通房屋宽度每阶段只增4像素，主要增加墙高、阁楼和二层。箱、像、田等非房屋按自身结构升级。

地图原生帧96×128按1:1绘制，地面锚点仍落在64像素地格内(32,54)，距下边界10像素。实际屋顶高度控制血条位置。高阶屋檐略超格宽，但占地／点击仍是一格。近景保留硬边，远景沿用原有非整数缩放过滤。

## 实际提示词与源图

以下均为本次内置imagegen实际使用的提示词，原始生成结果保留在`sources/`。其中半透明背景晕染在像素整理阶段移除。

| 提示词 | 源图 | 最终采用 |
| --- | --- | --- |
| [A批](prompt-a.txt) | `sources/a.png` | 箭塔 |
| [A批层高修订](prompt-a-height-refine.txt) | `sources/a-height.png` | 城门、汇财会馆 |
| [关键三类层高最终稿](prompt-key-height-final.txt) | `sources/key-final.png` | 祠堂、百工院、客栈 |
| [B批](prompt-b.txt)、[层高修订](prompt-b-height-refine.txt) | `sources/b.png`、`sources/b-height.png` | 修订稿全部6类 |
| [C批](prompt-c.txt)、[层高修订](prompt-c-height-refine.txt) | `sources/c.png`、`sources/c-height.png` | 修订稿全部6类 |
| [D批](prompt-d.txt) | `sources/d.png` | 农田、擂石台、戏台、土地庙、钟馗像、道观、造化匣 |

`reference-a/b/c/d.png`来自接入前v3图集，仅作为原设计身份参考。`a/b/c/d-low-reference.png`为初级单独参考，避免高阶稿沿袭旧版过宽比例。`designs-before.json`和`art-before.js`保留本轮开始前设计记录与渲染源码。

## 重建与验证

```sh
npm run art:buildings
npm run test:buildings
```

无需重新生图即可复现裁切与安装。若只是手工改运行时PNG，仅运行`npm run art:catalog`和`npm run build`，不要重建覆盖手改内容。若改变尺寸，应同步`js/art.js`标记区内数据，构建会与`metrics.json`核对。

浏览器验证与实际游戏截图见[验证记录](../../qa/building-redesign/v7/VALIDATION.md)。
