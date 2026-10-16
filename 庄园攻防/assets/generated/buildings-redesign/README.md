# 建筑图集 · 中式开放水田与竖向升级版

> 2026-10-16更新：当前游戏使用[v7细描边平面卡通像素版](v7/README.md)，全25类75阶段已生成、裁切并接入。新版图集和ZIP位于`v7/`，每张三阶段图288×128，单帧96×128，地图原生1:1绘制。以下内容为此前v3归档，不能用下方旧命令覆盖当前成品。

当前交付为 **v3 中式简约版**，使用内置 imagegen，参考用户提供的WorldBox截图的像素尺度与可见建筑高度，一批重绘25类建筑、每类3个连续阶段，共75个图素。没有复制参考图中的西式建筑、地图或界面。旧版源图和带版本号的方案、图集继续保留，便于比较。

- `source-v3-worldbox.png`：当前内置生图的透明源图。
- `buildings-atlas.png`：整理后的576×576透明图集，9列×9行，单格64×64。
- `buildings-atlas-3x.png`：最近邻放大预览。
- `buildings-atlas.json`：75格的类型、名称、阶段、坐标、适用等级、锚点及源图裁切边界。
- `by-building/<type>.png`：按建筑分开的25张透明PNG，每张192×64，左／中／右分别是低／中／高阶段，每格64×64。由当前图集无损裁切重排，不缩放或重画。
- `by-building/manifest.json`：25张三阶段图的建筑中文名、文件名、裁切坐标、适用等级和单格锚点。
- `buildings-by-type.zip`：上述25张PNG及坐标清单的压缩包。
- `ready/<type>/level-1.png`至`level-3.png`：75张单阶段图素，已同步到运行时目录，用于建造卡片和建筑详情。
- `before/assets/sprites/buildings/`：接入前75张建筑素材的备份。`installation.json`记录100张运行时图片的路径、原图备份及新旧哈希。
- `generation-prompt-v3-worldbox.txt`：实际使用的内置生图提示词。
- `designs.json`：当前v3设计方案；v1和v2方案分别保留在`designs-v1-rejected.json`、`designs-v2-simple.json`。
- `source-v2-simple.png`、`buildings-atlas-v2-simple.png`及同名JSON：上一版源图、整理图集和坐标记录。

每连续3格为同一建筑从低到高的3阶段：通常对应游戏Lv1–3、Lv4–6、Lv7–9；祠堂和城门的第3阶段延续到Lv15。保持主体、配色与功能符号一致，通过增加墙高、楼层或重檐体现升级，不仅横向放大。继续使用灰蓝中式瓦顶、木构白墙和深棕描边，减少雕花、庭院和装饰小物。

农田为1:1正方形的开放水田，无围栏、木框或砖墙，稻株之间保留浅水；三阶段为幼苗、密植青稻、成熟金稻。桑园以桑树为主体，旁有小型灰瓦农舍。箭塔保留细长塔身、梯子和高处射击层，三级均为竖向高塔，而非地面平台。

图集每行从左到右的建筑分组：

1. 祠堂／庄园城门／兵营
2. 箭塔／擂石台／水井
3. 茶肆／客栈／钱庄
4. 农田／磨坊／酒坊
5. 桑园／织坊／成衣铺
6. 石场／瓷窑／商号
7. 汇财会馆／百工院／戏台
8. 土地庙／钟馗像／道观
9. 造化匣；最后6格留空。

画布锚点为(32,48)，主体最下行在y=47，透明Alpha仅0或255，建筑外轮廓为一像素深棕色#4A2E20。水田保留源图自然边缘，不额外绘制闭合深棕外框。图片由imagegen绘制，脚本仅裁切、尺寸整理、处理外轮廓和排图，不代替生图绘制建筑。建筑等比缩放，水田单独规整为1:1，三个阶段的主体分别为32×32、39×39、46×46。

重新整理：`node scripts/prepare-building-atlas.cjs pack assets/generated/buildings-redesign/source-v3-worldbox.png`。

按建筑裁切三等级横排图并打包：`node scripts/prepare-building-atlas.cjs sheets`。重新整理总图后，应重新运行此命令。

检查75格覆盖、分级、锚点、透明度、裁切一致性、水田1:1、箭塔竖向比例、25张三阶段图和压缩包：`node --test tests/building-atlas.test.js`。

## 游戏接入

已接入源码版和离线单文件。地图读取`assets/sprites/buildings/<type>/stages.png`，每张192×64，从左到右为三个阶段。按最新反馈将地图建筑缩到上一版的85%：原生帧显示倍率由1.5改为1.275，即81.6×81.6世界像素；原图锚点(32,48)不变，绘制偏移约(-40.8,-39.2)（相对地格中心）。实际落地点仍为地格内(32,54)，距64像素地格下边界10像素，不因缩放回到地格中间。高阶屋檐可稍超出格宽，占地／点击规则不变。升级只改变源图裁切列，不改变落地点。

血条与远景庄园标题按放大后的主体高度上移，名称牌放在实际落地点下方4像素；等级牌仍靠近地格右下角。原始PNG、三阶段裁切尺寸以及卡片／详情的图片规格未改动。`assets/generated/qa/building-redesign/layout-before-*.png`保留此次调整前截图，`*-all-buildings.png`和`*-dense-buildings.png`为调整后游戏内效果。

建造卡片和详情页仍读取同目录的`level-1.png`至`level-3.png`，内容与图集各帧完全一致；取消了针对旧版透明留白的额外CSS放大，防止屋顶、旗帜被裁掉。游戏等级、经济、兵种、存档和联机规则未作改动。

重新接入：先运行`node scripts/prepare-building-atlas.cjs sheets`，再运行`node scripts/prepare-building-atlas.cjs install`，最后运行`npm run art:catalog`与`npm run build`。安装脚本先检查全部候选图像，再备份旧图并写入，不会用后来的图覆盖首次备份。

`npm run test:buildings`检查裁切、75个阶段、100张成品一致性、旧图备份、地图实际绘制参数、Lv1–15切图边界、卡片／详情图片及源码／离线加载。截图位于`assets/generated/qa/building-redesign/`。
