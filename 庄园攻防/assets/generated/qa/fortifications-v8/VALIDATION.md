# 城门／城墙v8验证

2026-10-16。

> 下方为v8接入时的历史记录。其单行边缘RGBA测试不足以验证拐角内部，用户后续截图证实仍有通道错位。当前已采用v10完整剖面拼接并重新验证，最终近景和检查结果见[转角修正验收](../wall-corners-v10/VALIDATION.md)。本目录的游戏截图也已按当前素材更新。

- `npm run test:fortifications`：3项素材测试通过，验证两方向各三帧、初级高度至少64、各方向宽度固定、城门单一等比系数、原生帧锚点、16种连接掩码的边界、全部开放接口的RGBA一致、24张安装成品、二值透明及20张原素材备份。
- 同一命令的浏览器检查覆盖源码与离线：四个真实地图方向×三个外观阶段，正确选择正面／侧向图集，原生裁切、方向落点、血条高度与详情预览；像素抽样确认初级门柱外侧是相同城墙像素而非草缝；16张墙、两张门图集和侧向预览均成功加载，离线无外部请求，无JS异常及缺失资源。
- [source-gate-directions-levels.png](source-gate-directions-levels.png)与[offline-gate-directions-levels.png](offline-gate-directions-levels.png)：四方向与三个阶段的实际游戏渲染，非概念图；[source-estate.png](source-estate.png)与[offline-estate.png](offline-estate.png)展示完整真实庄园的连接转角。
- 已人工查看上述近景和完整庄园，检查城门初级体量、层高变化、两种角度，以及横／纵门墙衔接。发现屋檐较宽、门柱较窄造成的草缝后，已加入门柱背后的同图素短接头并重新验证。
- `npm run art:buildings`完整重建通过：先安装基础建筑，再应用v8覆盖，最终仍是64像素高的初级正面城门和新增侧向图；不会退回旧城门。`npm run test:buildings`的5项素材及源码／离线浏览器检查通过。
- `npm run test:zoom`、`npm run test:grid`、`npm run test:gate-repair`通过，覆盖不同DPR、七档缩放、地形缓存、门牌显示及修复预览。`node --test tests/match.test.js tests/gate-repair-current.test.js`的16项当前规则回归通过。
- `git diff`确认`js/game.js`、`js/maps.js`、`js/network.js`、`js/autoplay.js`未改；界面源码只为详情预览传递既有方向，地图碰撞、经济、战斗、存档和联机结算未变。新素材管线语法检查通过。

源图、实际提示词、文件布局与旧图备份见[制作说明](../../fortifications-v8/README.md)。
