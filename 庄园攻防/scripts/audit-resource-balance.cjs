'use strict';
// Read-only balance audit: calls the current game API; never edits game values.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const G = require('../js/game'), A = require('../js/autoplay');
const root = path.resolve(__dirname, '..'), date = '2026-10-21';
const prefix = path.join(root, 'docs', `resource-balance-audit-${date}`);
const definitions = Object.values(G.DEFS), economy = definitions.filter(d => d.cat === 'economy');
const zero = () => ({ coins: 0, materials: 0 });
const add = (a, b, n = 1) => { a.coins += b.coins * n; a.materials += b.materials * n; return a; };
const sum = rows => rows.reduce((a, b) => add(a, b), zero());
const copy = x => JSON.parse(JSON.stringify(x));
const round = n => +n.toFixed(4), number = n => Number.isInteger(n) ? n.toLocaleString('en-US') : round(n).toLocaleString('en-US');
const pair = x => `${number(x.coins)} / ${number(x.materials)}`;
const table = (headers, rows) => ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |', ...rows.map(row => '| ' + row.join(' | ') + ' |')].join('\n');

function buildingAudit(d) {
  const generated = d.unique || d.fixed;
  const count = d.id === 'fortune' || d.id === 'barracks' ? 10 : d.limit || 1;
  const builds = Array.from({ length: count }, (_, i) => ({ ordinal: i + 1, ...G.buildCost({ actorId: 0, buildings: Array.from({ length: i }, () => ({ type: d.id })), fortuneBuilt: i }, d.id) }));
  const maximum = G.maxLevel({ type: d.id });
  const upgrades = d.id === 'fortune' ? [] : Array.from({ length: maximum - 1 }, (_, i) => ({ from: i + 1, to: i + 2, ...G.upgradeCost({ type: d.id, level: i + 1 }) }));
  const production = d.income ? Array.from({ length: maximum }, (_, i) => ({ level: i + 1, basePerSecond: d.income * G.incomeFactor({ type: d.id, level: i + 1 }) })) : [];
  return { id: d.id, name: d.name, category: d.cat, tier: d.tier ?? (d.required ? 3 : null), resource: d.resource || null,
    limit: d.limit || (d.unique ? 1 : null), acquisition: generated ? '系统生成，定义中的建造价不实际收费' : d.fortuneOnly ? '仅造化匣随机获得；不另扣定义中的建造费' : d.id === 'fortune' ? '付费随机变成非经济建筑，不保留匣子' : '可直接建造',
    definitionBuildCost: d.cost, chargedBuildSeries: generated || d.fortuneOnly ? [] : builds,
    definedBuildSeries: builds, buildSeriesTotal: sum(builds), upgradeSeries: upgrades, totalUpgradeCost: sum(upgrades), production,
    ownAura: d.aura || 0, ownAuraResource: d.auraResource || null, farmAura: d.farmAura || 0 };
}
const buildings = definitions.map(buildingAudit);
const stages = [1, 3, 5, 7, 8, 9].map(level => {
  const base = zero(), withoutUltimates = zero(), upgradeRound = zero();
  for (const d of economy) {
    const resource = d.resource, value = d.income * G.incomeFactor({ type: d.id, level }) * d.limit;
    base[resource] += value; if (!d.required) withoutUltimates[resource] += value;
    if (level < 9) add(upgradeRound, G.upgradeCost({ type: d.id, level }), d.limit);
  }
  const af = G.auraFactor({ level });
  const ultimateAurasOnly = { coins: base.coins * (1 + G.DEFS.guild.aura * af), materials: base.materials * (1 + G.DEFS.port.aura * af) };
  return { level, base, withoutUltimates, ultimateAurasOnly, upgradeRound: level < 9 ? upgradeRound : null,
    materialToCoinBaseRatio: base.materials / base.coins, materialToCoinAuraRatio: ultimateAurasOnly.materials / ultimateAurasOnly.coins,
    guildAura: G.DEFS.guild.aura * af, portAura: G.DEFS.port.aura * af };
});
const economyConstruction = sum(buildings.filter(b => b.category === 'economy').map(b => b.buildSeriesTotal));
const economyUpgradeTotals = sum(buildings.filter(b => b.category === 'economy').map(b => ({ coins: b.totalUpgradeCost.coins * b.limit, materials: b.totalUpgradeCost.materials * b.limit })));
const economyByTier = [0,1,2,3].map(tier => {
  const rows = buildings.filter(b => b.category === 'economy' && b.tier === tier);
  const base = zero(); for (const b of rows) base[b.resource] += G.DEFS[b.id].income * b.limit;
  return { tier, count: rows.reduce((n, b) => n + b.limit, 0), base,
    construction: sum(rows.map(b => b.buildSeriesTotal)), firstUpgradeRound: sum(rows.map(b => ({ coins: b.upgradeSeries[0].coins * b.limit, materials: b.upgradeSeries[0].materials * b.limit }))) };
});
const foundation = [2,3,4,5,6,7,8,9].map(ordinaryLevel => {
  const shrineLevel = G.requiredShrineLevel(ordinaryLevel);
  const toLevel = (id, level) => sum(buildings.find(b => b.id === id).upgradeSeries.filter(u => u.to <= level));
  return { ordinaryLevel, shrineRequired: shrineLevel, prerequisiteGateLevel: Math.max(1, shrineLevel - 1),
    shrineCumulative: toLevel('shrine', shrineLevel),
    shrineAndOneGateMinimum: add(toLevel('shrine', shrineLevel), toLevel('gate', Math.max(1, shrineLevel - 1))) };
});
const latestShrine = G.upgradeCost({ type: 'shrine', level: 14 });
const maxIncomeBeforeShrine15 = {
  coins: 3 * (economy.filter(d => d.resource === 'coins').reduce((n,d) => n + d.income * d.limit * G.incomeFactor({ type: d.id, level: 8 }), 0) + G.DEFS.shrine.income * G.incomeFactor({ type: 'shrine', level: 14 })),
  materials: 3 * economy.filter(d => d.resource === 'materials').reduce((n,d) => n + d.income * d.limit * G.incomeFactor({ type: d.id, level: 8 }), 0)
};
const optimisticShrine14to15Days = Math.max(latestShrine.coins / maxIncomeBeforeShrine15.coins, latestShrine.materials / maxIncomeBeforeShrine15.materials) / 86400;

function controlledRun(seed, seconds = 3600) {
  const s = G.createMatch({ mapSeed: seed, enemyCount: 1, difficulty: 'beginner' }), p = G.playerView(s, 0);
  G.chooseSkill(p, 'thunder'); const bot = A.create(p);
  const spent = zero(), earned = zero(), rewards = zero(), byType = {}, history = [];
  const originals = { build: G.build, upgrade: G.upgrade };
  for (const method of ['build', 'upgrade']) G[method] = function (...args) {
    const cost = method === 'build' ? G.buildCost(args[0], args[1]) : G.upgradeCost(args[1]);
    const result = originals[method](...args);
    if (result.ok) {
      add(spent, cost); const type = method === 'build' ? args[1] : args[1].type;
      const record = byType[type] ||= { build: zero(), upgrade: zero(), builds: 0, upgrades: 0 };
      add(record[method], cost); record[method === 'build' ? 'builds' : 'upgrades']++;
    }
    return result;
  };
  try {
    for (let tick = 1; tick <= seconds * 4; tick++) {
      const before = { coins: p.coins, materials: p.materials }, oldSpent = copy(spent);
      bot.tick(.25);
      rewards.coins += p.coins - before.coins + spent.coins - oldSpent.coins;
      rewards.materials += p.materials - before.materials + spent.materials - oldSpent.materials;
      const beforeIncome = { coins: p.coins, materials: p.materials };
      G.stepEconomy(p, .25, false); add(earned, { coins: p.coins - beforeIncome.coins, materials: p.materials - beforeIncome.materials });
      s.elapsed += .25; s.time = s.elapsed;
      if ([60,180,600,1800,3600].includes(s.elapsed)) history.push({ seconds: s.elapsed, stocks: { coins: p.coins, materials: p.materials }, rates: G.rates(p), spent: copy(spent), earned: copy(earned), rewards: copy(rewards),
        buildings: p.buildings.map(b => ({ type: b.type, level: b.level, x: b.x, y: b.y })) });
    }
  } finally { Object.assign(G, originals); }
  assert.equal(p.coins, earned.coins + rewards.coins - spent.coins);
  assert.equal(p.materials, earned.materials + rewards.materials - spent.materials);
  return { seed, seconds, method: '当前自动经营策略；初始资源0；正常建造升级支付；仅运行己方经济，不运行战斗、对手、损毁或自动修复',
    earned, rewards, spent, byType, stocks: { coins: p.coins, materials: p.materials }, rates: G.rates(p), history };
}
const previous = process.argv.includes('--reuse-simulations') ? JSON.parse(fs.readFileSync(prefix + '.json','utf8')) : null;
const simulations = previous ? previous.simulations : [];
if(!previous)for (const seed of [7,42,73193]) { const r = controlledRun(seed); simulations.push(r); console.log(JSON.stringify({ seed, stocks: r.stocks, rates: r.rates, spent: r.spent })); }
const sourceHashes = Object.fromEntries(['js/game.js','js/maps.js','js/autoplay.js'].map(file => [file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
if(previous)assert.deepEqual(previous.sourceHashes,sourceHashes,'Only reuse simulation results against identical game, map and controller sources');
const esbuild=require('esbuild'),runtime=fs.readFileSync(path.join(root,'js/runtime.js'),'utf8'),offline=fs.readFileSync(path.join(root,'dist/庄园攻防.html'),'utf8');
const runtimeParity=Object.fromEntries(Object.keys(sourceHashes).map(file=>{
  const transformed=esbuild.transformSync(fs.readFileSync(path.join(root,file),'utf8'),{target:'es2017',charset:'utf8',sourcefile:path.basename(file)}).code;
  return [file,{runtime:runtime.includes(transformed),offline:offline.includes(transformed)}];
}));
for(const [file,match] of Object.entries(runtimeParity))assert(match.runtime&&match.offline,'Built game matches audited source: '+file);
for(const b of buildings.filter(b=>b.category==='economy'))for(const u of b.upgradeSeries){assert.equal(u.coins,b.upgradeSeries[0].coins*5**(u.from-1));assert.equal(u.materials,b.upgradeSeries[0].materials*5**(u.from-1));}
const report = { date, sourceHashes, assumptions: ['人类玩家经济倍率为1', '基础产出忽略邻接、光环和特殊建筑', '满额产能是数量上限模型，不是具体地图可放置性证明', '终极光环模型仅计会馆与百工院，不计邻接/水井/戏台；不代表最终实战收入', '模拟为隔离经济场景，不能代表胜率或截图存档'],
  runtimeParity, buildings, stages, economyConstruction, economyUpgradeTotals, economyByTier, foundation, maxIncomeBeforeShrine15, optimisticShrine14to15Days, simulations };
fs.writeFileSync(prefix + '.json', JSON.stringify(report,null,2) + '\n');

const lines = [
  `# 当前资源平衡审计（${date}）`,
  '直接调用当前 js/game.js 的 buildCost、upgradeCost、incomeFactor、auraFactor 与 rates；未修改任何游戏数值。完整逐项数据见同名 JSON。所有费用对均为「铜钱 / 工材」，产出均为每游戏秒。',
  '## 结论',
  '普通四条产业链的同级满额升级费是对称的；加入两座终极建筑后，全体经济建筑的升级工材费仅比铜钱费多约1.54%。终极建筑使工材基础产能高约16.76%，全局光环又向工材倾斜。因此成熟经济的供需比例存在工材偏富余的结构性风险，但具体结余仍由布局、等级、升级顺序和战斗决定。',
  '必须同时说明：3个隔离经济模拟中，种子7和42反而大量积存铜钱，种子73193两种库存较接近。前两局3600秒时有5级会馆、没有百工院，第三局两座终极建筑都没造出来。不能由某一张库存截图认定「系统永远缺铜钱」。终极建筑占本资源基础满额产能的大部分：会馆约67%，百工院约72%，先建成/先升级哪一边，会造成很大的结构性摆动。',
  `另一项更严重的问题是后期基础建筑的费用曲线：祠堂14→15需 ${pair(latestShrine)}。即使假设全部产钱/产工材产业都达到可解锁的8级、数量全部满额、所有建筑均获得最高3倍收入，且无其他开销，仅靠持续产出也至少要 ${number(optimisticShrine14to15Days)} 个现实24小时长度的游戏时间日；这是非常乐观的时间下界，不是可达布局承诺。`,
  '## 审计边界',
  '- 人类经济倍率为1；AI困难倍率不作为玩家产能。截图只有库存，不能倒推出历史收入/消耗。',
  '- 普通经济建筑最高9级，祠堂/城门最高15级；普通升级有祠堂和同链前置等级门槛。',
  '- 茶肆/桑园产铜钱；农田/石场产工材。建筑名字或链条主题不能代替 resource 字段。',
  '- 免费出兵、自动修复和技能冷却均不持续消耗资源。任务奖励仅铜钱，总量825；不能视为持续产能。',
  '- 造化匣支付的是逐次上涨的匣子价格，随机建筑不再收费；仅造化建筑的定义价格仍参与其升级公式。',
  '- 基础产能、全局光环模型和自动经营模拟分开列出，不混作同一场景。',
  '## 所有建筑建造费用与基础产出',
  table(['建筑','获取方式','数量上限','实付建造费（第1次）','基础产出（Lv1）','Lv1→2','升级至最高级累计（单座）'], buildings.map(b => [b.name,b.acquisition,b.id==='gate'?'随地图生成':b.limit||'无类型上限',b.chargedBuildSeries.length?pair(b.chargedBuildSeries[0]):'无直接建造收费',b.resource?`${b.resource==='coins'?'铜钱':'工材'} ${b.production[0].basePerSecond}/s`:'无',b.upgradeSeries.length?pair(b.upgradeSeries[0]):'不适用',b.upgradeSeries.length?pair(b.totalUpgradeCost):'不适用'])),
  '## 非固定建造费',
  '农田和桑园按当前已建数量递增，拆除后数量减少会影响再造费用；兵营无类型数量上限，以下只列前10座，公式覆盖后续。造化匣最多10次。',
  ...['farm','mulberry','barracks','fortune'].map(id => { const b=buildings.find(b=>b.id===id);return `### ${b.name}\n\n`+table(['第几座/次','铜钱','工材'],b.definedBuildSeries.map(x=>[x.ordinal,number(x.coins),number(x.materials)])); }),
  '兵营第 n 座（n从1起）的倍率：0.5 × 1.5^min(n−1,5) × 2^max(n−6,0)，分别乘定义价格240铜钱、234工材后向上取整。首座120/117。',
  '农田/桑园第 n 座倍率：0.1 + 1.1 × min(5,n−1)/5，分别乘定义价格75铜钱、65工材后向上取整。造化匣第 n 次：定义价格90/78 × 1.55^(n−1)，向上取整。',
  '## 产业数量、供给与升级总需求',
  table(['产业层级（代码tier）','满额座数','基础总产出 铜钱/工材','全部建造费','全部1→2升级费'],economyByTier.map(t=>[t.tier,t.count,pair(t.base),pair(t.construction),pair(t.firstUpgradeRound)])),
  `全部34座经济建筑：建造累计 ${pair(economyConstruction)}；从1级全部升级到9级累计 ${pair(economyUpgradeTotals)}。这是静态满额预算，不含前置基础设施、军防、造化和时间先后限制。`,
  table(['同级等级','基础产出 铜钱/工材','只计会馆+百工院全局光环的产出','会馆/百工院光环','满额经济建筑该轮升级费'],stages.map(s=>[s.level,pair(s.base),pair(s.ultimateAurasOnly),`${number(s.guildAura*100)}% / ${number(s.portAura*100)}%`,s.upgradeRound?pair(s.upgradeRound):'已满级'])),
  '普通三层产业基础满额产出为铜钱118/s、工材118/s。加入汇财会馆240/s和百工院300/s后为358/s、418/s；未计祠堂。普通四链同级升级预算完全对称，终极两座拉开小幅费用差距。',
  '## 产出加成与升级增长',
  '- 普通生产建筑每升一级基础产出×2；经济升级费每升一级×5，因此相对于同级产能，下一次升级等待压力每级约×2.5。固定已有布局下，不能用低级回本速度外推高级。',
  '- 祠堂基础铜钱：1–7级每级×2，7级后每级×1.5。',
  '- auraFactor(L)=2^min(2,L−1) × [1+0.2×max(0,L−3)]。会馆仅铜钱+5%×auraFactor；百工院仅工材+10%×auraFactor；戏台两种收入+3%×auraFactor；水井仅农田+20%×auraFactor。',
  '- 经济前置建筑在相邻1格内，每座提供10%×前置auraFactor；所有加成合计最高+200%，即收入最高3倍。',
  '- 工材×1.3先应用于建筑定义费用和特殊upgradeBase。经济升级另按对侧全体同层及以下产业的理论满额基础产能×7.5计算，再用自身资源占比分配；此分支不再乘1.3。自身占比依层级为0%、20%、30%、40%。',
  '- 非经济建筑升级：定义费用/upgradeBase ×1.8×5^(L−1)×premium^max(0,L−阈值)。祠堂premium1.18、阈值7；城门1.06、阈值7；其他非经济建筑1.12、阈值4。',
  '## 普通等级解锁所需基础设施预算',
  table(['目标普通等级','所需祠堂等级','至少城门等级','祠堂累计费用','祠堂+一座城门最低累计费用'],foundation.map(f=>[f.ordinaryLevel,f.shrineRequired,f.prerequisiteGateLevel,pair(f.shrineCumulative),pair(f.shrineAndOneGateMinimum)])),
  '城门/祠堂升级交替受限：目标等级最多比另一类当前等级高1级。多城门地图中应核对实际被同步的门；表只算一座门，是基础设施费用下界。',
  `祠堂14→15前，所有可解锁产业最高8级。将全部收入都按3倍上界估计，铜钱最多 ${number(maxIncomeBeforeShrine15.coins)}/s，工材最多 ${number(maxIncomeBeforeShrine15.materials)}/s。即使已有部分存款，基础设施总费用也远超截图量级；单次等待下界是假设从该笔费用零准备金开始。`,
  '## 当前自动经营策略的隔离经济模拟',
  '3个地图种子，各模拟3600游戏秒；从0资源开始，正常支付建造和升级费用，沿用现有自动经营策略，只结算己方经济。没有战斗、敌方、建筑损毁、伤亡或战争支出，因此不是实战胜率评测，也不代表用户截图的存档。每局核对「收入+任务奖励−支出=库存」两种资源账本完全相等。',
  table(['种子','3600秒库存 铜钱/工材','当前每秒产出 铜钱/工材','累计产出','累计消耗'],simulations.map(s=>[s.seed,pair(s.stocks),pair(s.rates),pair(s.earned),pair(s.spent)])),
  ...simulations.map(s=>`### 种子 ${s.seed} 的阶段记录\n\n`+table(['游戏秒','库存 铜钱/工材','每秒产出','累计消耗'],s.history.map(h=>[h.seconds,pair(h.stocks),pair(h.rates),pair(h.spent)]))),
  '## 调整优先级（建议，尚未修改）',
  '1. 先明确目标局长和高阶解锁时间，再重做祠堂/城门的15级费用曲线；当前5倍连续增长会吞没其他微调效果。',
  '2. 对齐两座终极产业的产出/光环，或明确它们为何不对称，并让长期资源需求与产能比匹配；先做隔离参数对照再定数值。',
  '3. 如保留工材偏高产，军防/建筑升级可承担更高工材份额；不要不分阶段地全局加费，以免开局因基础工材不足卡住。',
  '4. 检查经济升级是否应纳入统一工材系数；当前1.3未覆盖独立的经济升级定价分支，仅凭这一点不能断言是程序错误。',
  '5. 用正常对战、多个地图与不同策略复测，分别记录累计产出、累计消耗、净库存和等待铜钱/工材的时间。库存比不能单独定义平衡。',
  '## 附录：每一种建筑的每级升级费与基础产出',
  ...buildings.filter(b=>b.id!=='fortune').map(b=>`### ${b.name}（${b.id}）\n\n`+table(['升级','铜钱','工材','升级前基础产出/s','升级后基础产出/s'],b.upgradeSeries.map(u=>[`${u.from}→${u.to}`,number(u.coins),number(u.materials),b.production.length?number(b.production[u.from-1].basePerSecond):'—',b.production.length?number(b.production[u.to-1].basePerSecond):'—']))),
  '## 来源哈希',
  '已验证当前 js/runtime.js 和离线 dist/庄园攻防.html 中的 game、maps、autoplay 编译内容均与本次审计源码一致。模拟账本与经济升级5倍增长公式已交叉校验。',
  ...Object.entries(sourceHashes).map(([file,hash])=>`- ${file}: ${hash}`),
];
fs.writeFileSync(prefix + '.md', lines.join('\n\n') + '\n');
console.log('Saved ' + prefix + '.md and .json');
