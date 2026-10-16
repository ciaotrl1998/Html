# v7全建筑像素素材接入验证

日期：2026-10-16。25类、每类3阶段，共75个原生图素。运行时25张288×128地图图集，另有75张64×64界面预览。

## 已通过

- `npm run build`：重建运行脚本与离线单文件，几何数据与实际PNG指标核对一致。图片、CSS、脚本和网页图标均内嵌。
- `npm run test:buildings`：5项素材测试通过。覆盖全部25类、75个不同阶段；二值Alpha、透明RGB、统一地面锚点、原生帧和总图逐像素一致、单建筑横排图与ZIP一致、100张安装成品哈希及原图备份、64×64同源等比预览。
- 城门每级宽64，随级增高；水田每级48×48；箭塔高度60／72／84且各级高于宽。所有非农田建筑逐级增高。像素化只记录一个等比系数，没有分别拉长X/Y。
- 同一专项浏览器测试覆盖源码静态服务与离线版：75阶段实际绘制、Lv1–15切图边界、地图96×128原生1:1、不依赖分类型运行时缩放、全部帧地面锚点落在地格内(32,54)、75条血条随各自屋顶定位、75个缩略图和320／390／1440宽度卡片／详情。无JS异常和缺失资源，离线版无外部资源请求。
- `npm run test:zoom`：源码／离线，DPR1及1.5，七档缩放，整数像素硬边、远景过滤、平移稳定、暖缓存复用与大地图缓存上限通过。
- `npm run test:grid`：源码／离线，DPR1／1.5／2，七档缩放和网格开关、虚线、像素对齐通过。
- `npm run test:upgrade-markers`：标记尺寸、同步浮动、共享计算及减少动画通过。
- `npm run test:gate-repair`：4项修复规则，以及源码／离线320／1280宽度的详情、地图名称、远景庄园标题与修复预览通过。
- `node --test tests/match.test.js tests/soldier-balance-current.test.js tests/support-buildings-current.test.js tests/production-limits-current.test.js tests/gate-repair-current.test.js`：29项当前规则回归通过，包含战斗、生产、存档及联机副本。
- `node tests/soldier-animation-browser.test.js`：运动插值与连续攻击动画通过，同时验证单独加载`js/art.js`不依赖构建注入的全局几何对象。
- `node --check`：新裁切脚本与渲染器语法通过。`git diff`确认`js/game.js`、`js/maps.js`、`js/network.js`、`js/autoplay.js`没有修改；现有其他未提交改动保留。

## 已有通用PNG测试限制

`npm run test:png`源码390／320／1440宽度的加载、菜单、卡片、详情、换图检查通过。离线全UI检查仍停在原有`assets/overlays/range.png`的非二值Alpha断言。该图512×512，已用二进制比较确认与HEAD完全一致，SHA256为`46a60827dcb5f7f8ddeb1d79a1192bb0a0aceef29251eaa505aa32d8827d1bc1`。本次没有修改该范围圈，所有新建筑均通过独立二值透明检查。没有将此通用测试报告为通过。

## 人工视觉检查

已查看[全部75阶段源码场景](source-all-buildings.png)、[相邻地格密集场景](source-dense-buildings.png)、320宽度[卡片](source-cards-320.png)与[详情](source-detail-320.png)。确认保持平面卡通、细深棕描边、灰蓝瓦顶，低级与高级有结构延续；铜钱、锤砧、灯笼等主要标识保留，田块无围栏，桑树旁有中式小屋，箭塔呈高塔而非平台。

卡片曾因地图帧顶部空白过大显得过小，已改用同源64×64等比预览并重新截图验收，没有CSS额外放大或屋顶／旗帜裁切。对应离线截图亦由专项测试保存。

旧图备份与成品索引见[制作说明](../../../buildings-redesign/v7/README.md)。
