'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const {run, summary} = require('../scripts/estate-balance-sim.js');
const close = (actual, expected) => assert(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('two opening towers allow contact without breaking the gate across all sampled approaches', () => {
  const {SEEDS, runCombat} = require('../scripts/pacing-sim.js');
  for (const seed of SEEDS) for (let direction=0; direction<4; direction++) {
    const r=runCombat({day:1,seed,direction,mode:'two'});
    assert(r.complete && !r.over && !r.timeout);
    assert.equal(r.brokenGates,0);
    assert(r.minGateRatio >= .65 && r.minGateRatio < 1, `seed ${seed}, direction ${direction}: ${r.minGateRatio}`);
    assert(r.nightSeconds < 30);
  }
});

function incomeScene(level, day, capped, placements) {
  const s = G.createState(null);s.day=day;
  for (const [type,x,y] of placements) assert(G.grantBuilding(s,type,x,y,level), `${type} at ${x},${y}`);
  // Grants bypass economic terrain and construction limits, so validate the latter here.
  for (const b of s.buildings) {
    const d = G.DEFS[b.type], peers = s.buildings.filter(n=>n.type===b.type);
    if (d.limit) assert(peers.length<=d.limit, b.type+' limit');
    for (const type of d.required || (d.prev ? [d.prev] : [])) {
      assert(G.adjacent(s,b.x,b.y).some(n=>n.type===type && n.level===level), b.type+' retains '+type);
    }
  }
  if (capped) {
    let count=0;
    for (let y=0;y<G.worldSize(s) && count<8;y++) for (let x=0;x<G.worldSize(s) && count<8;x++) {
      if (G.grantBuilding(s,'stage',x,y,9)) count++;
    }
    assert.equal(count,8);
  }
  return s;
}

test('same-level endpoints beat densely supplied middles at every level, with equal global bonuses and festivals', () => {
  for (const [start,middle,end] of [['tea','inn','bank'],['farm','mill','wine'],['mulberry','weaver','tailor'],['quarry','kiln','trade']]) {
    // With no spacing limit, every adjacent tile can hold a starter, up to that starter's count limit.
    const cells = [[7,3],[8,3],[9,3],[7,4],[9,4],[7,5],[8,5],[9,5]].slice(0, G.DEFS[start].limit);
    assert.equal(cells.length,G.DEFS[start].limit);
    for (let level=1;level<=9;level++) for (const day of [1,7]) for (const capped of [false,true]) {
      const supplied = incomeScene(level,day,capped,[[middle,8,4],...cells.map(([x,y])=>[start,x,y])]);
      const sparse = incomeScene(level,day,capped,[[start,7,4],[middle,8,4],[end,9,4]]);
      if (start==='farm') {
        assert(G.grantBuilding(supplied,'well',8,2,level));
        assert(G.grantBuilding(sparse,'well',6,4,level));
        assert(G.income(sparse,sparse.buildings.find(b=>b.type==='farm'))>G.DEFS.farm.income*G.incomeFactor({type:'farm',level}));
      }
      assert(cells.every(([x,y])=>G.dist8(x,y,8,4)<=G.DEFS[middle].radius));
      const middleRate=G.income(supplied,supplied.buildings.find(b=>b.type===middle));
      const endpointRate=G.income(sparse,sparse.buildings.find(b=>b.type===end));
      assert(endpointRate>=middleRate*2.5, `${end} vs ${middle} Lv${level} day${day} capped=${capped}: ${endpointRate/middleRate}`);
      if (capped) close(middleRate,G.DEFS[middle].income*G.incomeFactor({type:middle,level})*3*(day===7?1.25:1));
    }
  }
});

test('same-level ultimates with one of each endpoint beat fully supplied highest-income endpoints at every level', () => {
  for (const [ultimate,start,middle,end,otherStart,otherMiddle,otherEnd] of [
    ['guild','tea','inn','bank','farm','mill','wine'],
    ['port','quarry','kiln','trade','mulberry','weaver','tailor']
  ]) {
    assert.equal(G.DEFS[end].income,48);
    assert.equal(G.DEFS[end].resource,G.DEFS[ultimate].resource);
    for (let level=1;level<=9;level++) for (const day of [1,7]) for (const capped of [false,true]) {
      const supplied=incomeScene(level,day,capped,[
        [end,9,4],
        [middle,8,3],[middle,10,3],[middle,8,5],
        [start,7,3],[start,11,3],[start,7,5]
      ]);
      const sparse=incomeScene(level,day,capped,[
        [ultimate,9,4],[end,8,4],[middle,7,4],[start,6,4],
        [otherEnd,10,4],[otherMiddle,11,4],[otherStart,12,4]
      ]);
      assert.equal(supplied.buildings.filter(b=>b.type===middle).length,G.DEFS[middle].limit);
      assert(supplied.buildings.filter(b=>b.type===middle).every(b=>G.dist8(b.x,b.y,9,4)<=G.DEFS[end].radius));
      for (const type of G.DEFS[ultimate].required) assert.equal(sparse.buildings.filter(b=>b.type===type).length,1);
      const endpointRate=G.income(supplied,supplied.buildings.find(b=>b.type===end));
      const ultimateRate=G.income(sparse,sparse.buildings.find(b=>b.type===ultimate));
      assert(ultimateRate>=endpointRate*2, `${ultimate} vs ${end} Lv${level} day${day} capped=${capped}: ${ultimateRate/endpointRate}`);
      if (capped) close(endpointRate,48*G.incomeFactor({type:end,level})*3*(day===7?1.25:1));
    }
  }
});

test('income tempers ordinary growth and shrine growth after level seven', () => {
  const s = G.createState(null);
  for (const d of Object.values(G.DEFS).filter(d => d.income)) {
    for (const [level, multiple] of [[1,1],[2,2],[3,4]]) {
      const b = {type:d.id, level, x:0, y:0};
      close(G.income(s,b), d.income * multiple);
    }
    for (let level=4; level<=G.maxLevel({type:d.id}); level++) {
      const multiple = d.id === 'shrine' ? 2 ** Math.min(6,level-1) * 1.5 ** Math.max(0,level-7) : 4 * 1.65 ** (level - 3);
      close(G.income(s,{type:d.id,level,x:0,y:0}), d.income * multiple);
    }
  }
  close(G.income(s,{type:'shrine',level:15,x:0,y:0}), 1640.25);
});

test('upgrade premiums begin after ordinary level four and foundation level seven', () => {
  assert.deepEqual(G.DEFS.gate.upgradeBase,{coins:150,materials:120});
  assert.deepEqual(G.upgradeCost({type:'gate',level:1}),{coins:270,materials:216});
  for (const d of Object.values(G.DEFS).filter(d => d.id !== 'fortune')) {
    for (let level=1; level<G.maxLevel({type:d.id}); level++) {
      const base = d.upgradeBase || d.cost;
      const growth = d.id === 'shrine' ? 1.65 : 2.15;
      const foundation = d.id === 'shrine' || d.id === 'gate';
      const premium = (d.id === 'shrine' ? 1.18 : d.id === 'gate' ? 1.06 : d.income ? 1.20 : 1.12) ** Math.max(0,level-(foundation?7:4));
      const expected = {};
      for (const resource of ['coins','materials']) expected[resource] = Math.ceil(base[resource] * 1.8 * growth ** (level-1) * premium);
      assert.deepEqual(G.upgradeCost({type:d.id,level}), expected, `${d.id} Lv${level}`);
    }
  }
});

test('middle and late income upgrades require increasing accumulation time', () => {
  const s = G.createState(null);
  for (const d of Object.values(G.DEFS).filter(d => d.income)) {
    let previous = 0;
    for (let level=d.id==='shrine'?7:3; level<G.maxLevel({type:d.id}); level++) {
      const b = {type:d.id,level,x:0,y:0}, cost = G.upgradeCost(b);
      // Combined resource cost measures the burden on equal coin/material production.
      const seconds = (cost.coins + cost.materials) / G.income(s,b);
      if(previous)assert(seconds>previous,`${d.id} Lv${level} funding time`);
      if (previous) {
        const ratio = seconds / previous;
        assert(ratio>1.2&&ratio<1.6, `${d.id} Lv${level} wait ratio ${ratio}`);
      }
      previous = seconds;
    }
  }
});

test('every high-level building upgrade cost outgrows its income, damage or durability', () => {
  const s = G.createState(null);
  for (const d of Object.values(G.DEFS).filter(d=>d.id!=='fortune')) {
    const foundation = d.id==='shrine'||d.id==='gate';
    for (let level=foundation?7:4; level<G.maxLevel({type:d.id})-1; level++) {
      const b={type:d.id,level,x:0,y:0},next={...b,level:level+1};
      const output=n=>d.income?G.income(s,n):d.damage?d.damage*G.factor(n):G.maxHP(n);
      const outputGrowth=output(next)/output(b),cost=G.upgradeCost(b),nextCost=G.upgradeCost(next);
      if(d.income)close(outputGrowth,d.id==='shrine'?1.5:1.65);
      if(d.damage)close(outputGrowth,2);
      if(d.id==='gate')assert(Math.abs(outputGrowth-1.55)<.001);
      for(const resource of ['coins','materials']) {
        if(!cost[resource]){assert.equal(nextCost[resource],0);continue;}
        const costGrowth=nextCost[resource]/cost[resource];
        assert(costGrowth>outputGrowth,`${d.id} Lv${level} ${resource}: cost growth ${costGrowth} <= output growth ${outputGrowth}`);
        assert(nextCost[resource]/output(next)>cost[resource]/output(b),`${d.id} ${resource} accumulation burden`);
      }
    }
  }
});

test('income auras keep growing with diminishing relative gains after level three', () => {
  for (const type of ['stage','guild','port','well','farm']) {
    const s = G.createState(null);
    const target = {type:type === 'port' ? 'mulberry' : type === 'well' ? 'farm' : type === 'farm' ? 'mill' : 'tea',level:1,x:0,y:0};
    const source = {type,level:1,x:1,y:0};
    s.buildings = [source];
    const base = G.DEFS[target.type].income;
    const bonus = type === 'well' ? .2 : type === 'farm' ? .1 : G.DEFS[type].aura;
    let previous = 0, previousRatio = Infinity;
    for (let level=1; level<=9; level++) {
      source.level = level;
      const rate = G.income(s,target);
      const multiple = level<=3 ? 2 ** (level-1) : 4 + .8 * (level-3);
      close(rate, base * (1 + bonus * multiple));
      assert(rate > previous);
      if (level>=4) {
        const ratio = rate / previous;
        assert(ratio > 1 && ratio < previousRatio, `${type} Lv${level} relative aura gain`);
        previousRatio = ratio;
      }
      previous = rate;
    }
  }
});

test('building durability and tower attack retain their existing growth curves', () => {
  for (const d of Object.values(G.DEFS)) {
    for (let level=1; level<=G.maxLevel({type:d.id}); level++) {
      assert.equal(G.maxHP({type:d.id,level}), Math.round(d.hp * 1.55 ** (level-1)));
    }
  }
  for (const level of [1,2,3,6,9]) {
    const s = G.createState(null), tower = G.grantBuilding(s,'tower',8,7,level);
    assert(tower);
    G.startNight(s);s.wave.spawned=s.wave.total;
    const enemy = {id:s.nextId++,type:'bandit',x:8,y:6,hp:1e8,maxHp:1e8,speed:.65,damage:14,attack:0,repelled:0,path:[],pathRevision:-1};
    s.enemies = [enemy];G.step(s,.25);
    assert.equal(enemy.hp,1e8);
    assert.equal(s.projectiles.length,1);
    G.step(s,.25);assert.equal(enemy.hp,1e8);
    G.step(s,.05);
    close(1e8-enemy.hp, 22 * 2 ** (level-1));
  }
});

test('enemy growth accelerates through middle and late stages then eases into endless nights', () => {
  const enemies = new Map();
  for (let day=1; day<=31; day++) {
    const s = G.createState(null);s.day=day;G.startNight(s);s.wave.boss=false;G.step(s,.25);G.step(s,.25);
    const enemy = s.enemies[0];assert(enemy);assert.equal(enemy.type,'bandit');
    enemies.set(day,enemy);
    for(const field of ['maxHp','damage','speed'])assert(Number.isFinite(enemy[field])&&enemy[field]>0,`day ${day} ${field}`);
    if(day>1){
      assert(enemy.maxHp>enemies.get(day-1).maxHp);
      assert(enemy.damage>enemies.get(day-1).damage);
      assert(enemy.speed>=enemies.get(day-1).speed);
    }
  }
  close(enemies.get(1).maxHp,G.ENEMIES.bandit.hp);
  assert(enemies.get(1).damage<G.ENEMIES.bandit.damage);
  const growth = (day,field) => enemies.get(day)[field] / enemies.get(day-1)[field];
  for (const field of ['maxHp','damage']) {
    for(const [start,end] of [[2,7],[8,14],[15,21],[22,31]]) {
      assert(growth(start,field)>1);
      for(let day=start+1;day<=end;day++)close(growth(day,field),growth(start,field));
    }
    assert(growth(8,field)>growth(7,field));
    assert(growth(15,field)>growth(14,field));
    assert(growth(22,field)<growth(21,field));
  }
  close(enemies.get(30).speed,enemies.get(31).speed);
  assert(enemies.get(31).speed<=G.ENEMIES.bandit.speed*1.22);
});

test('festival siege strengthens every enemy in single and coop waves, caps after day twenty-one and survives saves',()=>{
  for(const [day,hpMultiple,damageMultiple] of [[7,1,1],[14,1.75,1.25],[21,2.5,1.5],[28,2.5,1.5]]){
    for(const mode of ['single','vertical','horizontal']){
      const create=()=>mode==='single'?G.createState(42):G.createCoopState(42,mode);
      const festival=create();festival.day=day;G.startNight(festival);
      const total=festival.wave.total;
      for(const index of [0,1,2,total-2,total-1]){
        const ordinary=create();ordinary.day=day;G.startNight(ordinary);ordinary.wave.boss=false;
        for(const s of [festival,ordinary]){s.enemies=[];s.wave.spawned=index;s.wave.timer=0;G.step(s,.01);}
        assert.equal(festival.enemies.length,ordinary.enemies.length);
        for(const [offset,e] of festival.enemies.entries()){
          const normal=ordinary.enemies[offset];assert.equal(e.type,normal.type);
          close(e.maxHp/normal.maxHp,hpMultiple*(e.boss?4.5:1));
          close(e.damage/normal.damage,damageMultiple*(e.boss?2:1));
          close(e.speed,normal.speed);
        }
        const loaded=G.restore(G.serialize(festival));assert(loaded);
        assert.deepEqual(loaded.wave,festival.wave);
        assert.deepEqual(loaded.enemies.map(e=>[e.type,e.boss,e.hp,e.maxHp,e.damage]),festival.enemies.map(e=>[e.type,e.boss,e.hp,e.maxHp,e.damage]));
      }
    }
  }
});

test('all enemy types and bosses use the same growth at different shrine levels in single and coop games', () => {
  const baselines=new Map();
  for(const day of [1,4,5,7,10,14,15,21,22,28,30,31]) for(const level of [1,9,15]) for(const mode of ['single','vertical','horizontal']) {
    const s=mode==='single'?G.createState(42):G.createCoopState(42,mode);
    s.day=day;
    for(const b of s.buildings.filter(b=>b.type==='shrine')) { b.level=level;b.hp=G.maxHP(b); }
    G.startNight(s);
    const total=s.wave.total;
    for(const index of [0,1,2,total-2,total-1]) {
      s.enemies=[];s.wave.spawned=index;s.wave.timer=0;G.step(s,.01);
      assert.equal(s.enemies.length,Math.min(mode==='single'?1:2,total-index));
      for(const [offset,e] of s.enemies.entries()) {
        const i=index+offset,type=day>=5&&i%4===2?'fox':day>=4&&i%3===1?'ghost':'bandit';
        const boss=day%7===0&&i>=total-(mode==='single'?1:2),d=G.ENEMIES[type];
        assert.equal(e.type,type);assert.equal(e.boss,boss);
        const normalized={hp:e.maxHp/d.hp/(boss?4.5:1),damage:e.damage/d.damage/(boss?2:1),speed:e.speed/d.speed};
        if(!baselines.has(day))baselines.set(day,normalized);
        for(const field of Object.keys(normalized))close(normalized[field],baselines.get(day)[field]);
        close(e.maxHp,e.hp);
      }
      s.wave.spawned=0;s.wave.timer=100;
      const killed=s.enemies[0],coins=s.coins,partnerCoins=s.partner?.coins;
      const reward={bandit:8,ghost:12,fox:10}[killed.type]*(killed.boss?5:1);
      killed.hp=0;G.step(s,.01);
      close(s.coins-coins,reward/(mode==='single'?1:2));
      if(mode!=='single')close(s.partner.coins-partnerCoins,reward/2);
    }
  }
});

test('waves increase to a bounded total, double in coop and preserve enemy unlocks and saved progress', () => {
  const totals=new Map();
  for(let day=1;day<=31;day++) {
    const s=G.createState(1);s.day=day;G.startNight(s);
    totals.set(day,s.wave.total);
    assert(Number.isInteger(s.wave.total)&&s.wave.total>0&&s.wave.total<=120);
    assert.equal(s.wave.boss,day%7===0);
    if(day>1&&day%7!==1)assert(s.wave.total>=totals.get(day-1));
    for(const layout of ['vertical','horizontal']) {
      const coop=G.createCoopState(1,layout);coop.day=day;G.startNight(coop);
      assert.equal(coop.wave.total,s.wave.total*2);assert(coop.wave.total<=240);
    }
    if(day<=5) {
      for(let tick=0;tick<400 && s.wave.spawned<3;tick++)G.step(s,.25);
      assert.equal(s.wave.spawned,3);
      assert.deepEqual(s.enemies.map(e=>e.type),day<4?['bandit','bandit','bandit']:day===4?['bandit','ghost','bandit']:['bandit','ghost','fox']);
    }
    const loaded=G.restore(G.serialize(s));assert(loaded,`day ${day} wave survives save/load`);
    assert.deepEqual(loaded.wave,s.wave);assert.equal(loaded.day,day);
    assert.deepEqual(loaded.enemies.map(e=>[e.type,e.hp,e.damage]),s.enemies.map(e=>[e.type,e.hp,e.damage]));
  }
  assert(totals.get(1)<totals.get(5));
  assert(totals.get(13)-totals.get(12)>totals.get(3)-totals.get(2));
  assert(totals.get(7)>totals.get(8),'festival adds pressure before the population cap');
  assert.equal(totals.get(30),120);assert.equal(totals.get(31),120);
});

test('high-level legacy and estate saves preserve HP, stock and pending income', () => {
  for (const seed of [null,1]) {
    const s = G.createState(seed), shrine = s.buildings[0];
    shrine.level=15;shrine.hp=G.maxHP(shrine)*.37;
    const center = G.worldCenter(s), tea = G.grantBuilding(s,'tea',center+1,center,9);
    assert(tea);tea.hp=G.maxHP(tea)*.42;tea.coinPending=.73;tea.incomeTime=.6;
    s.coins=987654.25;s.materials=876543.75;
    G.startNight(s);G.step(s,.25);G.step(s,.25);
    // Persisted enemies keep their purchased/save-time stats rather than being rescaled.
    s.enemies[0].hp=123456;s.enemies[0].maxHp=234567;s.enemies[0].damage=789;
    const saved = JSON.parse(G.serialize(s)), loaded = G.restore(JSON.stringify(saved));assert(loaded);
    assert.equal(loaded.coins,saved.coins);assert.equal(loaded.materials,saved.materials);
    for (const b of saved.buildings) {
      const restored = loaded.buildings.find(n=>n.id===b.id);assert(restored);
      assert.equal(restored.level,b.level);close(restored.hp,b.hp);
      assert.equal(restored.coinPending,b.coinPending);assert.equal(restored.materialPending,b.materialPending);
      assert.equal(restored.incomeTime,b.incomeTime);
    }
    for (const field of ['hp','maxHp','damage']) assert.equal(loaded.enemies[0][field],saved.enemies[0][field]);
  }
});

function assertSimulation(result) {
  const label=`seed ${result.seed}, ${result.style}`;
  assert(['completed','defeat'].includes(result.stopReason),label);
  assert.equal(result.over,result.stopReason==='defeat',label);
  assert.equal(result.history.filter(h=>h.complete).length,result.day-1,label);
  if(result.over){
    assert.equal(result.history.at(-1).complete,false,label);
    assert.equal(result.history.at(-1).shrineMinHPRatio,0,label);
  }else{
    assert.equal(result.day,result.days+1,label);
    assert.equal(result.history.length,result.days,label);
    assert(result.history.every(h=>h.complete),label);
  }
  let previousSeconds=0,previousKills=0,previousUpgrades=0;
  for(const [index,h] of result.history.entries()){
    assert.equal(h.day,index+1,label);
    assert(h.seconds>previousSeconds&&h.seconds<=result.seconds,label);
    for(const field of ['coins','materials','coinRate','materialRate','nightSeconds','nightDeaths','gateBreaks','kills','totalUpgrades']){
      assert(Number.isFinite(h[field])&&h[field]>=0,`${label}: ${field}`);
    }
    for(const field of ['gateMinHPRatio','shrineMinHPRatio'])assert(h[field]>=0&&h[field]<=1,`${label}: ${field}`);
    assert(h.kills>=previousKills,label);
    assert.equal(h.totalUpgrades,previousUpgrades+h.upgrades,label);
    assert(h.nightSeconds>0,label);
    // The report rounds ratios to three decimals, so a surviving shrine may report zero.
    previousSeconds=h.seconds;previousKills=h.kills;previousUpgrades=h.totalUpgrades;
  }
  assert.equal(result.actions.filter(a=>a.kind==='upgrade').length,previousUpgrades,label);
  assert.equal(result.actions.filter(a=>a.kind==='build').length,result.history.reduce((n,h)=>n+h.builds,0),label);
  for(const a of result.actions){
    assert(a.second>=0&&a.second<=result.seconds,label);
    if(a.kind!=='skill')assert(a.coins>=0&&a.materials>=0,label);
  }
  const report=summary(result);
  assert.equal(report.stopReason,result.stopReason);assert.equal(report.day,result.day);
  assert.deepEqual(report.milestones.map(h=>[h.day,h.complete,h.gateHP,h.shrineHP]),
    result.history.filter(h=>[5,10,15,20,25,30,35].includes(h.day)||!h.complete).map(h=>[h.day,h.complete,h.gateMinHPRatio,h.shrineMinHPRatio]));
}

test('default-stock estate scripts fund the opening and report consistent survival and pressure metrics', t => {
  for(const seed of [1,7,42,73193,99991]) {
    const result=run(30,'balanced',seed,{useSkills:false}),label=`seed ${seed}`;
    t.diagnostic(`${label}: completed ${result.day-1} nights, ${result.stopReason}`);
    assertSimulation(result);
    assert(result.history[0].complete,label);
    for(const h of result.history.filter(h=>h.complete)) {
      assert.equal(h.complete,true,label);assert(h.shrineMinHPRatio>=0,label);
      assert(h.towers>=2,label);assert(h.economyBuildings>=4,label);
      assert.deepEqual(h.skills,{thunder:0,repair:0,repel:0},label);
    }
    assert(result.actions.length>0,label);
    const first=result.actions[0];
    assert.equal(first.second,0,label);assert.equal(first.phase,'day',label);assert.equal(first.kind,'build',label);
    assert.equal(first.type,'tea',label);
    assert.equal(first.coins,150-G.DEFS.tea.cost.coins+G.MISSIONS[0].reward,label);
    assert.equal(first.materials,200-G.DEFS.tea.cost.materials,label);
    assert(result.actions.some(a=>a.type==='mulberry' && a.kind==='build' && a.phase==='day' && a.day===1),label);
  }
});

test('original geography scripts fund a daytime opening and retain valid simulation summaries', () => {
  for (const seed of [1,7,42,73193,99991]) {
    const nights=30;
    const result = run(nights,'balanced',seed,{mapGeneration:1}), label = `seed ${seed}, ${nights} nights`;
    assert.equal(result.worldSize,25);assertSimulation(result);assert(result.day>1,label);
    assert(result.actions.length>0,label);
    assert.equal(result.actions[0].second,0,label);assert.equal(result.actions[0].phase,'day',label);
    assert.equal(result.actions[0].type,'tea',label);
    assert.equal(result.actions[0].coins,150-G.DEFS.tea.cost.coins+G.MISSIONS[0].reward,label);
    assert.equal(result.actions[0].materials,200-G.DEFS.tea.cost.materials,label);
    assert(result.history[0].complete && result.history[0].towers>=2,label);
  }
});

test('scripts without a skill choice cannot cast, even when their skill option is enabled', t => {
  for (const seed of [1,7,42,73193,99991]) {
    const passive = run(30,'balanced',seed,{useSkills:false});
    const active = run(30,'balanced',seed,{useSkills:true});
    const completed = r => r.history.filter(h=>h.complete).length;
    t.diagnostic(`seed ${seed}: without skills ${completed(passive)} nights (${passive.stopReason}), with skills ${completed(active)} nights (${active.stopReason})`);
    for (const result of [passive,active]) {
      const pressure=result.history;
      t.diagnostic(`seed ${seed}, skills=${result.options.useSkills}: alive=${!result.over}, day=${result.day}, seconds=${result.seconds}, gate breaks=${pressure.reduce((n,h)=>n+h.gateBreaks,0)}, losses=${pressure.reduce((n,h)=>n+h.nightDeaths,0)}, min shrine HP ratio=${Math.min(...pressure.map(h=>h.shrineMinHPRatio))}`);
      assertSimulation(result);
    }
    for(const result of [passive,active]) {
      assert(result.history.every(h=>Object.values(h.skills).every(n=>n===0)));
      assert(result.actions.every(a=>a.kind!=='skill'));
    }
    assert.deepEqual(active.history,passive.history,`seed ${seed}: unselected skills cannot affect survival`);
  }
  for (const style of ['economy','defense']) {
    const result = run(30,style,1);
    assertSimulation(result);
    if(style==='economy'){
      assert.equal(result.stopReason,'defeat','No defenses leaves the shrine vulnerable');
      assert.equal(result.history[0].towers,0);
    }
  }
});

test('planned day fifteen reinforcement does not affect a funded opening or earlier defeat', () => {
  const ordinary = run(30,'balanced',1,{mapGeneration:1});
  const reinforced = run(30,'balanced',1,{mapGeneration:1,towersPerGate:3,reinforcementDay:15});
  for (const result of [ordinary,reinforced]) {
    assertSimulation(result);assert(result.day>1);
    assert.equal(result.actions[0].second,0);assert.equal(result.actions[0].type,'tea');
    assert(result.actions.some(a=>a.phase==='day' && a.kind==='build' && a.type==='tower'));
  }
  assert.deepEqual(reinforced.history.filter(h=>h.day<15),ordinary.history.filter(h=>h.day<15));
  assert.equal(reinforced.layout.reinforcements.length,4);
  const added = reinforced.layout.reinforcements.map(p=>reinforced.actions.find(a=>a.kind==='build' && a.type==='tower' && a.x===p.x && a.y===p.y));
  if(reinforced.day<15)assert(added.every(a=>a===undefined));
  else assert(added.every(a=>a===undefined||a.day>=15));
});
