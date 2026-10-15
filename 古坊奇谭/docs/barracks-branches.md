# 兵营分支与弓兵

- Lv1–3兵营只训练同级步兵；Lv3升Lv4时必须选择步兵营或弓兵营，两种分支同价，均要求祠堂Lv5。选择永久固定。
- 普通兵营的连升最多到Lv3。Lv4以后可以继续连升至当前解锁上限，最高Lv9。
- 转职保留兵营耐久比例和训练进度。转为弓兵营前先将所属步兵同步至Lv3，之后这些步兵保持Lv3；新弓兵从Lv4开始，与弓兵营同步升级。步兵营仍同步提升所属步兵等级。
- 两兵种共享每庄120人口、兵营8座上限、训练时间及0.8格/秒移速。祠堂Lv1训练时间5秒，Lv15为1秒。
- 同级弓兵生命为步兵70%，单箭伤害为75%，射程固定3格，攻击间隔1.5秒，弹道0.3秒。生命四舍五入，成长及难度/道观加成沿用原规则。攻击结算时目标已死亡则箭矢失效。
- 弓兵不自动后退，不穿过城墙、不可通行水域或挡路的敌方建筑射击；可以攻击挡路的建筑本身。优先附近敌兵，否则沿通往敌庄祠堂的路径攻击建筑。
- 电脑与托管按当前最低资源秒收入`0、10、18、36、72、144、288、576、1152`选择Lv1–9兵营目标，先训练已解锁等级，再提升基础建筑。新转职按现有分支数量补齐2步兵营:1弓兵营，始终支付正常费用。

## 数据与资源

兵营仍是`type: 'barracks'`，建筑及士兵使用独立`troopType: 'infantry' | 'archer'`。升级接口为`GF.upgrade(state, building, { troopType })`；分支参数仅在Lv3→4允许。预检查使用`GF.upgradeReason(state, building, ignoreFunds, options)`。

版本10可读取版本9对局，将旧兵营、旧士兵设为步兵，保留资源及状态。更早的地图存档继续不支持。本地存档槽名称保持原样，使现有自动存档能直接迁移。

精灵位于`assets/sprites/soldiers/`，按`infantry_player-red.png`、`infantry_ally-green.png`、`infantry_enemy-purple.png`及对应`archer_`前缀命名。图集240×90，每帧20×30，每级依次正、背、左、右，每行三级。弓兵阵营变体通过`node scripts/prepare-archer-factions.cjs`生成，像素位置和透明轮廓不变。

构建命令为`npm run build`。执行`npm run test:branches`可检查兵营、战斗、经济、AI、存档、联机分支/回滚/重连，以及源码和离线版的320/390/1280宽度界面、六张图集与攻击动画。

额外回归：`node tests/match-browser.cjs`检查实际离线文件、960兵渲染及局域网基础流程；`node tests/soldier-online-browser.test.js`检查联机插值；`node tests/match-performance.cjs`检查960名混编士兵及完整AI对局性能。
