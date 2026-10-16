# 建筑图集接入验证

> 本页为此前v3验证归档。当前全建筑重绘版见[v7验证记录](v7/VALIDATION.md)，使用288×128图集、96×128地图帧与原生像素绘制。

日期：2026-10-16。接入25类建筑、每类3阶段；地图使用25张192×64图集，卡片与详情使用75张对应单帧。保留原图备份，未改游戏、地图、电脑策略、经济、存档或联机结算规则。

## 已通过

- `npm run build`：重新生成`js/runtime.js`与`dist/庄园攻防.html`，含25张图集和75张缩略图；网页图标也内嵌，外置`dist/icon.png`继续保留供游戏盒扫描。
- `npm run test:buildings`：4项素材检查及源码／离线浏览器验证通过。验证75格像素一致、透明度、1:1水田、竖向箭塔、阶段体量递进、100张安装成品、新旧图片哈希与备份、三列实际裁切。按最新反馈地图显示为上一版的85%，即原生帧的1.275倍（81.6×81.6）；75帧的原图(32,48)锚点均仍落在地格内(32,54)，距下边界10像素；受损建筑血条随缩放后的屋顶高度定位。
- 同一测试覆盖Lv1–15全部切图边界、75个详情缩略图、320／390／1440宽度的卡片与详情，不出现CSS额外放大裁切。离线版没有外部PNG、CSS或脚本请求，源码静态服务无缺失资源。
- `npm run test:zoom`：源码／离线、DPR1与1.5、七档缩放、近景硬边、远景过滤、移动稳定性、地形缓存复用与失效检查通过。整数像素断言计入新版1.275倍绘制比例。
- `node tests/grid-rendering-browser.test.js`：源码／离线、DPR1／1.5／2、七档缩放、网格开关与像素对齐通过。
- `node tests/upgrade-marker-browser.test.js`：升级标记尺寸、统一浮动及减少动画模式通过。
- `node tests/gate-labels-browser.test.js`：源码／离线320与1280宽度的城门详情、名称缩放规则及修复预览通过。
- `node --test tests/match.test.js tests/soldier-balance-current.test.js tests/support-buildings-current.test.js tests/production-limits-current.test.js tests/gate-repair-current.test.js`：29项当前规则回归全部通过。

## 已有测试限制

- `npm test`仍失败，包含旧地图种子、旧地图布局、波次和旧经济／升级规则断言。例如旧测试向`createState`传入当前接口不接受的地图种子，报`Invalid map seed`。本次未修改这些旧测试或游戏规则；`js/game.js`、`js/maps.js`、`js/autoplay.js`、`js/network.js`已逐字节确认与接入前HEAD一致。
- `npm run test:png`源码390／320／1440宽度的加载、菜单、建造卡片、详情及替换检查通过。离线全UI检查停在已有`assets/overlays/range.png`的非二值Alpha断言。该512×512范围图与HEAD逐字节一致，本次未重画、缩放或修改其Alpha。修正了原清单把它登记为128×128的过时尺寸，并让导出脚本按保留的成品实际尺寸登记，避免后续再次写错。
- 建筑专属测试独立验证源码／离线及三种屏幕宽度均通过，不依赖上述范围图的二值Alpha断言；本次新增的全部建筑PNG均已验证为二值Alpha。

## 截图

- `source-all-buildings.png`、`offline-all-buildings.png`：游戏实际绘制的全部25类、75个阶段。
- `layout-before-source.png`、`layout-before-offline.png`：放大与锚点下移前的效果。
- `source-dense-buildings.png`、`offline-dense-buildings.png`：缩至上一版85%且保留低位锚点的相邻地格密集排列，包含受损建筑血条。
- `source-detail-320.png`／`offline-detail-320.png`等：320／390／1440宽度的详情。
- `source-cards-320.png`／`offline-cards-320.png`等：对应宽度的建造卡片。

旧建筑PNG可从`assets/generated/buildings-redesign/before/assets/sprites/buildings/`恢复；`assets/generated/buildings-redesign/installation.json`保留路径与哈希记录。
