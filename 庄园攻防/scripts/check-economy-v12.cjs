'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const G=require('../js/game'),A=require('../js/autoplay');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/resource-balance-v12-2026-10-21');
assert.equal(G.VERSION,12);assert.equal(G.COIN_VALUE,5);
const pair=c=>`${c.coins.toLocaleString('en-US')} / ${c.materials.toLocaleString('en-US')}`;
const table=(h,r)=>['| '+h.join(' | ')+' |','| '+h.map(()=>'---').join(' | ')+' |',...r.map(a=>'| '+a.join(' | ')+' |')].join('\n');
const quote=Object.values(G.DEFS).map(d=>({id:d.id,name:d.name,resource:d.resource||null,limit:d.limit||null,
  definitionCost:d.cost,builds:Array.from({length:d.id==='barracks'?10:d.limit||1},(_,i)=>G.buildCost({actorId:0,buildings:Array.from({length:i},()=>({type:d.id})),fortuneBuilt:i},d.id)),
  income:Array.from({length:d.income?G.maxLevel({type:d.id}):0},(_,i)=>({level:i+1,amount:d.income*G.incomeFactor({type:d.id,level:i+1})})),
  upgrades:Array.from({length:d.id==='fortune'?0:G.maxLevel({type:d.id})-1},(_,i)=>({from:i+1,to:i+2,...G.upgradeCost({type:d.id,level:i+1})})),
  ...(d.id==='barracks'?{archerUpgrades:Array.from({length:8},(_,i)=>({from:i+1,to:i+2,...G.upgradeCost({type:d.id,level:i+1,troopType:'archer'})}))}:{})}));
const base={coins:0,materials:0},firstRound={coins:0,materials:0};
for(const d of Object.values(G.DEFS).filter(d=>d.cat==='economy')){
  base[d.resource]+=d.income*d.limit;const u=G.upgradeCost({type:d.id,level:1});firstRound.coins+=u.coins*d.limit;firstRound.materials+=u.materials*d.limit;
}
assert.equal(base.coins/G.COIN_VALUE,base.materials);assert.equal(firstRound.coins/G.COIN_VALUE,firstRound.materials);
function simulate(seed,seconds=1800){
  const s=G.createState(seed),p=G.playerView(s,0),bot=A.create(p);G.chooseSkill(p,'thunder');
  const spent={coins:0,materials:0},income={coins:0,materials:0},reward={coins:0,materials:0},history=[];
  const original={build:G.build,upgrade:G.upgrade};
  for(const method of Object.keys(original))G[method]=function(...args){const cost=method==='build'?G.buildCost(args[0],args[1]):G.upgradeCost(args[1],args[2]),r=original[method](...args);if(r.ok){spent.coins+=cost.coins;spent.materials+=cost.materials;}return r;};
  try{
    for(let i=1;i<=seconds*4;i++){
      const before={coins:p.coins,materials:p.materials},oldSpent={...spent};bot.tick(.25);
      reward.coins+=p.coins-before.coins+spent.coins-oldSpent.coins;reward.materials+=p.materials-before.materials+spent.materials-oldSpent.materials;
      const b={coins:p.coins,materials:p.materials};G.stepEconomy(p,.25,false);income.coins+=p.coins-b.coins;income.materials+=p.materials-b.materials;s.elapsed+=.25;s.time=s.elapsed;
      if([60,180,600,1200,1800].includes(s.elapsed)){
        const rates=G.rates(p);history.push({seconds:s.elapsed,stock:{coins:p.coins,materials:p.materials},rates,normalizedRates:{coins:rates.coins/G.COIN_VALUE,materials:rates.materials},shrine:G.shrineLevel(p),gate:p.gateLevel,
          buildingLevels:p.buildings.map(b=>({type:b.type,level:b.level}))});
      }
    }
  }finally{Object.assign(G,original);}
  assert.equal(p.coins,income.coins+reward.coins-spent.coins);assert.equal(p.materials,income.materials+reward.materials-spent.materials);
  return {seed,seconds,spent,income,reward,history};
}
const sourceHashes=Object.fromEntries(['js/game.js','js/autoplay.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
const cached=process.argv.includes('--reuse')?JSON.parse(fs.readFileSync(out+'.json','utf8')):null;
if(cached)assert.deepEqual(cached.sourceHashes,sourceHashes);
const simulations=cached?cached.simulations:[7,42,73193].map(seed=>{const r=simulate(seed);console.log(JSON.stringify({seed,...r.history.at(-1)}));return r;});
const report={version:G.VERSION,exchange:G.COIN_VALUE,sourceHashes,base,firstRound,quote,simulations};
fs.writeFileSync(out+'.json',JSON.stringify(report,null,2)+'\n');
const lines=['# v12 双资源价值与交替升级费用',
  '当前规则使用5铜钱≈1工材的价值标尺。普通初级产业对应5铜钱/秒与1工材/秒，较强初级产业10与2。下列费用均为「铜钱 / 工材」，不是价值比例的原始数字。',
  '## 规则与存档',
  '- 镜像产业链的基础产出、建造价格、升级价格按价值对齐；高低两档和数量上限保留。会馆1200铜钱/秒、百工院240工材/秒；两者光环均为5%×等级光环系数。取消历史独立工材1.3倍系数。',
  '- 兵营按本庄园现存数量计价，首座600铜钱/90工材，第2～4座每次×1.8，第5～8座每次×2.2，第9座起每次×3。按未取整的基础价格累计倍率，最终分别向上取整；步兵营、弓兵营合并计数。',
  '- 祠堂、城门、箭塔1→2级工材价值60%、铜钱40%；2→3级铜钱60%、工材40%，之后交替。兵营从1→2级选择分支起：弓兵营每次升级固定铜钱价值60%、工材40%，步兵营固定铜钱40%、工材60%；同等级总价值相同。预算向上取整至10价值单位，使4:6和6:4占比精确成立。',
  '- 恢复原升级增长规则：经济升级费用每级×5，产出仍每级×2。其他建筑升级预算=(定义铜钱/5＋工材)×1.8×5^(当前等级−1)×后期加价；祠堂当前等级超过7级后逐级再×1.18，城门×1.06；其他建筑当前等级超过4级后逐级再×1.12（有收入的非经济建筑×1.20）。祠堂、城门、兵营、箭塔再按上述预算取整分配，其余建筑保留各自费用构成。',
  '- 经济升级计算对侧产能时先把铜钱/5换成价值，避免费用再多乘一次5。自身资源价值占比依层级仍为0%、20%、30%、40%。',
  '- 旧v9/v10/v11存档迁移到v12：每个庄园铜钱余额、待结算铜钱、历史建造铜钱成本×5；工材、等级、进度保留。v12存档与网络快照不重复转换；保存键不变。',
  '- 自动经营的资源权重、收益评分、军力门槛、等待时间、布局评分按价值比较；基础供应按正常数量上限规划，正常付费。对外收入报告保留实际币种数量。',
  '- 资源栏新增每秒产出。建筑等级上限、伤害、血量、兵种、人口上限不变。联机服务器需重启，客户端需刷新到同一版本。',
  '## 升级费用示例',table(['建筑','1→2（铜钱/工材）','2→3','3→4','最后一级'],['shrine','gate','barracks','tower'].map(id=>{const b=quote.find(b=>b.id===id);return [b.name,...b.upgrades.slice(0,3).map(pair),pair(b.upgrades.at(-1))];})),
  `全部34座经济建筑无加成Lv1基础产出：${pair(base)}/秒（数量5:1，价值1:1）；全部1→2级费用：${pair(firstRound)}（价值1:1）。满额数量模型不保证每张地图都能完整摆放。`,
  '## 隔离经济模拟',
  '三个地图各1800游戏秒，从0资源开始，运行当前自动经营并支付正常费用，只结算己方经济，不运行战斗、敌方或损毁。每局核对收入＋任务奖励－支出＝库存。这是节奏和账本检查，不是胜率或所有布局都无剩余的承诺。',
  table(['种子','秒','铜钱/工材库存','实际产出/秒','折算价值产出/秒','祠堂/城门'],simulations.flatMap(s=>s.history.map(h=>[s.seed,h.seconds,pair(h.stock),pair(h.rates),pair(h.normalizedRates),h.shrine+' / '+h.gate]))),
  '## 完整报价',
  '祠堂/城门系统生成，不收定义建造费；擂石台、水井、戏台、土地庙、钟馗像、道观仅由造化匣随机取得，不另付定义建造费，升级按自身类型。兵营列前10座，后续仍由buildCost计算。',
  ...quote.map(b=>`### ${b.name}\n\n建造报价序列：${b.builds.map(pair).join('；')}。\n\n`+(b.archerUpgrades?'以下为步兵营升级费用。\n\n':'')+(b.upgrades.length?table(['升级','铜钱','工材','铜钱价值占比'],b.upgrades.map(u=>[u.from+'→'+u.to,u.coins.toLocaleString('en-US'),u.materials.toLocaleString('en-US'),((u.coins/5)/(u.coins/5+u.materials)*100).toFixed(1)+'%'])):'匣子转化后不保留本类型。')+(b.archerUpgrades?'\n\n弓兵营升级费用：\n\n'+table(['升级','铜钱','工材','铜钱价值占比'],b.archerUpgrades.map(u=>[u.from+'→'+u.to,u.coins.toLocaleString('en-US'),u.materials.toLocaleString('en-US'),'60.0%'])):'')+(b.income.length?'\n\n基础产出：'+b.income.map(x=>`Lv${x.level}=${x.amount}/秒`).join('；'):'')),
  '## 验证与来源',
  'tests/economy-v12.test.js 覆盖镜像价格/产出、所有交替占比、真实逐级与批量扣费、余额不足原子性、旧存档一次迁移、分数产出。tests/economy-v12-browser.test.js 覆盖网页版/离线版320、390、1366视口的读档、产出显示、升级报价、实际点击扣费与顶部布局。',
  ...Object.entries(sourceHashes).map(([f,h])=>`${f}: ${h}`)];
fs.writeFileSync(out+'.md',lines.join('\n\n')+'\n');console.log('Saved '+out+'.md and .json');
