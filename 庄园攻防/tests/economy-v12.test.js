'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),G=require('../js/game');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const place=(p,type)=>{const w=G.worldWidth(p);for(const k of G.estate(p).cells){const x=k%w,y=Math.floor(k/w);const b=G.grantBuilding(p,type,x,y,1);if(b)return b;}throw Error('No plot');};
test('paired industries have five-to-one production and mirrored prices at every level',()=>{
  for(const [coin,material] of [['tea','quarry'],['inn','kiln'],['bank','trade'],['mulberry','farm'],['weaver','mill'],['tailor','wine'],['guild','port']]){
    const c=G.DEFS[coin],m=G.DEFS[material];assert.equal(c.income/G.COIN_VALUE,m.income);assert.equal(c.limit,m.limit);
    near(c.cost.coins/G.COIN_VALUE,m.cost.materials);near(c.cost.materials,m.cost.coins/G.COIN_VALUE);
    for(let level=1;level<=9;level++){
      near(c.income*G.incomeFactor({type:coin,level})/G.COIN_VALUE,m.income*G.incomeFactor({type:material,level}));
      if(level<9){const a=G.upgradeCost({type:coin,level}),b=G.upgradeCost({type:material,level});assert(Math.abs(a.coins/G.COIN_VALUE-b.materials)<=1);assert(Math.abs(a.materials-b.coins/G.COIN_VALUE)<=1);}
    }
  }
  assert.equal(G.DEFS.guild.aura,G.DEFS.port.aura);
  assert.equal(G.DEFS.mulberry.income,5);assert.equal(G.DEFS.farm.income,1);assert.equal(G.DEFS.tea.income,10);assert.equal(G.DEFS.quarry.income,2);
});
test('foundations alternate and barracks branches retain exact 60/40 value shares at every transition',()=>{
  for(const [type,troopType] of [['shrine'],['gate'],['tower'],['barracks','infantry'],['barracks','archer']]){
    let previous;
    for(let level=1;level<G.maxLevel({type});level++){
      const cost=G.upgradeCost({type,level,troopType}),coin=cost.coins/G.COIN_VALUE,total=coin+cost.materials;
      assert(Number.isInteger(cost.coins)&&Number.isInteger(cost.materials));
      const coinShare=type==='barracks'?(troopType==='archer'?.6:.4):(level%2?.4:.6);
      near(coin/total,coinShare);near(cost.materials/total,1-coinShare);
      const d=G.DEFS[type],base=d.upgradeBase||d.cost,foundation=type==='shrine'||type==='gate';
      const premium=type==='shrine'?1.18:type==='gate'?1.06:1.12;
      const expected=(base.coins/G.COIN_VALUE+base.materials)*1.8*5**(level-1)*premium**Math.max(0,level-(foundation?7:4));
      assert(total>=expected-.01&&total<=expected+10.01,'Original budget rounded up by at most ten value units');
      if(previous)assert(cost.coins>previous.coins&&cost.materials>previous.materials);
      previous=cost;
    }
  }
});
test('original fivefold upgrade growth and late premiums apply to every building type',()=>{
  assert.equal(G.UPGRADE_GROWTH,5);assert.equal(G.ECONOMY_UPGRADE_GROWTH,5);assert.equal(G.GROWTH,2);
  for(const d of Object.values(G.DEFS))for(let level=1;level<G.maxLevel({type:d.id});level++){
    const cost=G.upgradeCost({type:d.id,level});
    if(d.cat==='economy'){
      const first=G.upgradeCost({type:d.id,level:1});
      assert.equal(cost.coins,first.coins*5**(level-1));assert.equal(cost.materials,first.materials*5**(level-1));
    }else if(!['shrine','gate','barracks','tower'].includes(d.id)){
      const base=d.upgradeBase||d.cost,multiple=1.8*5**(level-1)*(d.income?1.20:1.12)**Math.max(0,level-4);
      assert.deepEqual(cost,{coins:Math.ceil(base.coins*multiple),materials:Math.ceil(base.materials*multiple)});
    }
  }
});
test('normal build/upgrade/bulk actions charge the advertised prices and reject shortages atomically',()=>{
  const s=G.createState(42),p=G.playerView(s,0);p.coins=p.materials=1e15;
  const shrine=p.buildings.find(b=>b.type==='shrine');shrine.level=15;p.gateLevel=15;s.revision++;
  const tower=place(p,'tower');
  for(let level=1;level<9;level++){
    const cost=G.upgradeCost(tower),before={coins:p.coins,materials:p.materials};
    assert(G.upgrade(p,tower).ok);assert.equal(p.coins,before.coins-cost.coins);assert.equal(p.materials,before.materials-cost.materials);
  }
  const second=place(p,'tower'),cost=G.upgradeCost(second);p.coins=cost.coins-1;p.materials=cost.materials;
  let before=G.serialize(s);assert.equal(G.upgrade(p,second).ok,false);assert.equal(G.serialize(s),before);
  p.coins=cost.coins;p.materials=cost.materials-1;before=G.serialize(s);assert.equal(G.upgrade(p,second).ok,false);assert.equal(G.serialize(s),before);
  p.coins=p.materials=1e15;const options=G.upgradeOptions(p,second),old={coins:p.coins,materials:p.materials};const bulk=G.bulkUpgrade(p,second);
  assert(bulk.ok);assert.deepEqual(bulk.costspent,options.cost);assert.equal(p.coins,old.coins-options.cost.coins);assert.equal(p.materials,old.materials-options.cost.materials);
});
test('old saves convert currency, pending payouts and historical refunds exactly once for every player',()=>{
  const s=G.createMatch({mode:'coop',enemyCount:2,mapSeed:42});
  for(const p of s.players){p.coins=36000+p.id;p.materials=498000+p.id;}
  const p=G.playerView(s,0),tower=place(p,'tower');tower.originCost={coins:101,materials:23};s.buildings[0].coinPending=.75;
  const raw=JSON.parse(G.serialize(s));raw.version=11;
  const loaded=G.restore(JSON.stringify(raw));assert(loaded);assert.equal(loaded.version,G.VERSION);
  for(const p of loaded.players){assert.equal(p.coins,(36000+p.id)*G.COIN_VALUE);assert.equal(p.materials,498000+p.id);}
  assert.equal(loaded.buildings[0].coinPending,3.75);assert.deepEqual(loaded.buildings.find(b=>b.id===tower.id).originCost,{coins:505,materials:23});
  const again=G.restore(G.serialize(loaded));assert(again);assert.equal(G.serialize(again),G.serialize(loaded),'No conversion on v12 reload or network snapshots');
  const invalid=JSON.parse(JSON.stringify(raw));invalid.players[0].coins=Number.MAX_VALUE;assert.equal(G.restore(JSON.stringify(invalid)),null);
});
test('five-to-one resource units persist through fractional payouts and normal economy settlement',()=>{
  const s=G.createState(42),p=G.playerView(s,0);p.mission=G.MISSIONS.length;
  for(let i=0;i<4;i++)G.stepEconomy(p,.25,false);assert.deepEqual({coins:p.coins,materials:p.materials},{coins:5,materials:0});
  assert.equal(G.MISSIONS.reduce((n,m)=>n+m.reward,0),825*G.COIN_VALUE);
  assert.equal(G.rates(p).coins,G.DEFS.shrine.income);
});
test('old saves may migrate but old live-network currency units are rejected',()=>{
  const N=require('../js/network'),s=G.createMatch({mode:'coop',enemyCount:2,mapSeed:42}),old=JSON.parse(N.snapshot(s,0));old.version=11;
  assert(G.restore(JSON.stringify(old)));assert.equal(N.createReplica(JSON.stringify(old),0,1,0),null);
  assert(N.createReplica(N.snapshot(s,0),0,1,0));
});
