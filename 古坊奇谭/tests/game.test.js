'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const rich = () => { const s = G.createState(null); s.coins = 100000; s.materials = 100000; return s; };
const build = (s, t, x, y) => { const r = G.build(s, t, x, y); assert.equal(r.ok, true, t + ': ' + r.reason); return r.building; };
const grant = (s, t, x, y, level = 1) => { const b = G.grantBuilding(s, t, x, y, level); assert(b, t + ' grant failed'); return b; };
const advance = (s, seconds) => { for (let t = 0; t < seconds - .00001; t += .1) G.step(s, .1); };
const setShrineLevel = (s, level) => { const shrine=s.buildings.find(b=>b.type==='shrine');shrine.level=level;shrine.hp=G.maxHP(shrine);return shrine; };
test('25 buildings including fixed gates and a distinct legacy shore ring around water', () => {
  assert.equal(Object.keys(G.DEFS).length, 25);
  assert.equal(G.SIZE,25);assert.equal(G.DEFS.gate.fixed,true);
  const s=G.createState(null),size=G.worldSize(s);assert.equal(size,17);
  for(const type of ['home','market','fence'])assert.equal(G.DEFS[type],undefined);
  assert.deepEqual(new Set(Object.values(G.TERRAIN)), new Set(['平地','水岸','水域','林地','山地']));
  for (const type of ['water','forest','mountain']) {
    let block = false;
    for (let y=0;y<size-2;y++) for(let x=0;x<size-2;x++) if(Array.from({length:9},(_,i)=>G.terrain(x+i%3,y+Math.floor(i/3),s)).every(v=>v===type))block=true;
    assert(block, type+' must contain at least a 3×3 patch');
  }
  assert.equal(G.terrain(8,8), 'plain');
  assert.equal(G.terrain(4,8), 'water');
  assert.equal(G.terrain(5,8), 'shore');
  assert.equal(G.terrain(5,4), 'shore'); // Diagonal corner of the reservoir.
  assert.equal(G.terrain(7,10), 'shore'); // The winding lower water region also has a bank.
  assert.equal(G.terrain(6,8), 'plain');
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(G.terrain(x,y,s)==='shore'){
    let touchesWater=false;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)if(x+dx>=0&&x+dx<size&&y+dy>=0&&y+dy<size&&G.terrain(x+dx,y+dy,s)==='water')touchesWater=true;
    assert(touchesWater,`shore ${x},${y} must border water`);
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(G.terrain(x,y,s)==='water'){
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<size&&ny>=0&&ny<size&&G.terrain(nx,ny,s)!=='water')
        assert.equal(G.terrain(nx,ny,s),'shore',`water ${x},${y} must have a complete shore ring`);
    }
  }
});
test('diagonal adjacency counts, plus terrain, predecessor, funds and occupied cells', () => {
  const s=rich();assert.equal(G.build(s,'farm',7,8).ok,false);assert.equal(G.build(s,'tea',2,7).ok,false);
  assert.match(G.buildReason(s,'farm',4,8),/水域不可建造/);
  assert.match(G.buildReason(s,'farm',6,8),/需水岸或水井旁平地/);
  build(s,'farm',5,8);assert.equal(G.build(s,'mill',7,9).ok,false); // Chebyshev distance 2 is not adjacent.
  build(s,'mill',6,9);build(s,'wine',7,8); // Diagonal adjacency to the farm now qualifies.
  assert.equal(G.build(s,'zhong',6,9).ok,false);assert.equal(G.build(s,'shrine',9,8).ok,false);
  s.coins=0;assert.match(G.buildReason(s,'tower',9,8),/^差/);
});
test('no building type can be placed in water, including unrestricted buildings',()=>{
  const s=rich(),before=s.coins;
  for(const type of Object.keys(G.DEFS)){
    assert.equal(G.buildReason(s,type,4,8),'水域不可建造',type);
    assert.equal(G.build(s,type,4,8).ok,false,type);
  }
  assert.equal(s.buildings.length,1);assert.equal(s.coins,before);
  assert.equal(G.buildReason(s,'farm',5,8),'');
  assert.equal(G.buildReason(s,'farm',5,4),''); // Diagonal shore is valid too.
  assert.equal(G.buildReason(s,'farm',6,8),'需水岸或水井旁平地');
});
test('forest and mountain reserve industry plots for their own starter buildings',()=>{
  const s=rich(),forest=[12,4],mountain=[13,13];
  assert.equal(G.terrain(...forest),'forest');assert.equal(G.terrain(...mountain),'mountain');
  for(const d of Object.values(G.DEFS).filter(d=>d.cat==='economy')){
    if(d.id!=='mulberry'){
      assert.equal(G.buildReason(s,d.id,...forest),'林地仅可建桑园',d.id);
      assert.equal(G.build(s,d.id,...forest).ok,false,d.id);
    }
    if(d.id!=='quarry'){
      assert.equal(G.buildReason(s,d.id,...mountain),'山地仅可建石场',d.id);
      assert.equal(G.build(s,d.id,...mountain).ok,false,d.id);
    }
  }
  build(s,'mulberry',...forest);build(s,'quarry',...mountain);
  assert.equal(G.buildReason(s,'tower',12,5),'');
  assert.equal(G.buildReason(s,'tower',13,12),'');
  assert.equal(G.buildReason(s,'earth',14,13),'仅可由造化匣获得');
});
test('a well permits farms on adjacent plain tiles, including diagonals',()=>{
  const s=rich();
  assert.equal(G.buildReason(s,'farm',9,9),'需水岸或水井旁平地');
  const well=grant(s,'well',10,10);
  assert.equal(G.buildReason(s,'farm',9,9),'');
  assert.equal(G.buildReason(s,'farm',12,10),'需水岸或水井旁平地');
  assert.equal(G.buildReason(s,'farm',11,11),'山地仅可建石场');
  const farm=build(s,'farm',9,9);
  assert.equal(G.buildReason(s,'farm',4,8),'水域不可建造');
  assert.equal(G.restore(G.serialize(s)).buildings.some(b=>b.id===farm.id),true);
  assert.equal(G.demolish(s,well).ok,true);
  assert.equal(G.buildReason(s,'farm',9,10),'需水岸或水井旁平地');
  assert(s.buildings.includes(farm),'an existing field remains after the well is removed');
  const forest=rich();grant(forest,'well',9,4);
  assert.equal(G.buildReason(forest,'farm',10,4),'林地仅可建桑园');
});
test('inland farms lose durability after their last well is removed, then collapse',()=>{
  const s=rich(),well=grant(s,'well',10,10),inland=build(s,'farm',9,9),shore=build(s,'farm',5,8);
  advance(s,1);assert.equal(inland.hp,G.maxHP(inland));
  const result=G.demolish(s,well);assert.equal(result.ok,true);assert.equal(result.dryFarms,1);
  assert.equal(G.dryFarm(s,inland),true);assert.equal(G.dryFarm(s,shore),false);
  advance(s,1);assert(Math.abs(inland.hp-G.maxHP(inland)*.95)<1e-7);
  assert.equal(shore.hp,G.maxHP(shore));
  const loaded=G.restore(G.serialize(s));assert(loaded);const dry=loaded.buildings.find(b=>b.id===inland.id);
  advance(loaded,19);
  assert.equal(loaded.buildings.includes(dry),false);
  assert(loaded.events.some(e=>e.text.includes('农田被摧毁')));
  assert.equal(loaded.buildings.some(b=>b.id===shore.id),true);
});
test('a second or replacement well keeps inland farms alive',()=>{
  const s=rich(),first=grant(s,'well',10,10),second=grant(s,'well',9,10),farm=build(s,'farm',9,9);
  assert.equal(G.demolish(s,first).dryFarms,0);
  advance(s,2);assert.equal(farm.hp,G.maxHP(farm));
  assert.equal(G.demolish(s,second).dryFarms,1);
  advance(s,1);const damaged=farm.hp;assert(damaged<G.maxHP(farm));
  grant(s,'well',10,10);assert.equal(G.dryFarm(s,farm),false);
  advance(s,2);assert(farm.hp>=damaged);
});
test('old saves move water buildings onto land while retaining their progress',()=>{
  const s=rich(),farm=build(s,'farm',5,8),tower=build(s,'tower',8,7);
  farm.x=4;farm.y=8;farm.level=2;farm.hp=G.maxHP(farm);
  tower.x=3;tower.y=8;tower.hp=200;
  const restored=G.restore(G.serialize(s));assert(restored);
  assert.equal(restored.coins,s.coins);assert.equal(restored.buildings.length,s.buildings.length);
  const movedFarm=restored.buildings.find(b=>b.id===farm.id),movedTower=restored.buildings.find(b=>b.id===tower.id);
  assert.equal(G.terrain(movedFarm.x,movedFarm.y),'shore');assert.equal(movedFarm.level,2);assert.equal(movedFarm.hp,farm.hp);
  assert.notEqual(G.terrain(movedTower.x,movedTower.y),'water');assert.equal(movedTower.hp,200);
  assert.notDeepEqual([movedFarm.x,movedFarm.y],[movedTower.x,movedTower.y]);
  assert(restored.events.some(e=>e.text.includes('2 栋建筑已迁出水域')));
  assert.equal(G.restore(G.serialize(restored)).events.length,0,'migration runs only once');
});
test('nine upgrade levels propagate along the adjacent chain and reuse three art stages', () => {
  const s=rich();s.coins=s.materials=1e8;setShrineLevel(s,15);
  const a=build(s,'tea',6,7), b=build(s,'inn',7,7), c=build(s,'bank',8,7);
  assert.equal(G.upgrade(s,b).ok,false);
  for(let level=2;level<=G.MAX_LEVEL;level++){
    assert(G.upgrade(s,a).ok);
    assert(G.upgrade(s,b).ok);
    assert(G.upgrade(s,c).ok);
    assert.equal(c.level,level);
  }
  assert.equal(G.upgrade(s,c).ok,false);
  assert.deepEqual(Array.from({length:9},(_,i)=>G.visualLevel(i+1)),[1,1,1,2,2,2,3,3,3]);
  assert.equal(G.name({...a,level:4}),G.name({...a,level:6}));
  assert.equal(G.name({...a,level:7}),G.name({...a,level:9}));
});
test('ultimate upgrades require both named endpoint neighbors at the target level',()=>{
  const s=rich();s.coins=s.materials=1e8;setShrineLevel(s,2);
  const tea=build(s,'tea',9,7),inn=build(s,'inn',9,8),bank=build(s,'bank',9,9);
  const farm=build(s,'farm',7,11),mill=build(s,'mill',8,11),wine=build(s,'wine',8,10);
  const guild=build(s,'guild',9,10);
  assert.match(G.upgradeReason(s,guild),/钱庄 Lv2/);
  for(const b of [tea,inn,bank])assert(G.upgrade(s,b).ok);
  assert.match(G.upgradeReason(s,guild),/酒坊 Lv2/);
  for(const b of [farm,mill,wine])assert(G.upgrade(s,b).ok);
  assert(G.upgrade(s,guild).ok);assert.equal(guild.level,2);
});
test('existing chains keep producing after their prerequisite is removed', () => {
  const s=rich();setShrineLevel(s,2);const a=build(s,'tea',6,7),b=build(s,'inn',7,7);G.demolish(s,a);
  assert(G.income(s,b)>0);assert.match(G.upgradeReason(s,b),/需邻茶肆/);
  const old=s.coins;advance(s,2);assert(s.coins>old);
});
test('copper ultimate requires bank and winery and boosts only copper income', () => {
  const s=rich();build(s,'tea',9,7);build(s,'inn',9,8);build(s,'bank',9,9);
  assert.deepEqual(G.DEFS.guild.required,['bank','wine']);assert.equal(G.DEFS.guild.resource,'coins');
  assert(G.DEFS.guild.cost.materials>G.DEFS.guild.cost.coins);
  assert.match(G.buildReason(s,'guild',9,10),/酒坊/);
  build(s,'farm',7,11);build(s,'mill',8,11);const wine=build(s,'wine',8,10);
  const before=G.rates(s);
  const guild=build(s,'guild',9,10);assert.equal(guild.level,1);assert.equal(G.upgrade(s,guild).ok,false);
  assert(G.rates(s).coins>before.coins);assert.equal(G.rates(s).materials,before.materials);
  assert(G.income(s,guild)>=G.DEFS.guild.income*1.2);
  G.demolish(s,wine);assert(s.buildings.includes(guild),'built ultimate remains after a prerequisite is removed');
  G.demolish(s,guild);assert.match(G.buildReason(s,'guild',9,10),/酒坊/);
});
test('materials ultimate requires tailor and trade and boosts only materials',()=>{
  const s=rich();build(s,'tea',7,8);
  build(s,'mulberry',10,6);build(s,'weaver',10,7);build(s,'tailor',10,8);
  assert.deepEqual(G.DEFS.port.required,['tailor','trade']);assert.equal(G.DEFS.port.name,'百工院');assert.equal(G.DEFS.port.resource,'materials');
  assert(G.DEFS.port.cost.coins>G.DEFS.port.cost.materials);
  assert.match(G.buildReason(s,'port',9,9),/商号/);
  build(s,'quarry',11,11);build(s,'kiln',10,10);const trade=build(s,'trade',10,9);
  const before=G.rates(s);const port=build(s,'port',9,9);
  assert.equal(G.rates(s).coins,before.coins);assert(G.rates(s).materials>before.materials);
  assert(G.income(s,port)>=G.DEFS.port.income*1.2);
  const old=s.materials;advance(s,1);assert(s.materials>old);
  assert(s.effects.some(e=>e.buildingId===port.id&&e.resource==='materials'));
  const saved=JSON.parse(G.serialize(s)),oldPort=saved.buildings.find(b=>b.id===port.id);
  oldPort.coinPending=.6;oldPort.materialPending=0;
  const migrated=G.restore(JSON.stringify(saved)),migratedPort=migrated.buildings.find(b=>b.id===port.id);
  assert.equal(migratedPort.coinPending,0);assert.equal(migratedPort.materialPending,.6);
  G.demolish(s,trade);assert(s.buildings.includes(port));
  G.demolish(s,port);assert.match(G.buildReason(s,'port',9,9),/商号/);
});
test('support bonuses affect the intended buildings only',()=>{
  const s=rich(),farm=build(s,'farm',5,8),tea=build(s,'tea',7,8);
  const baseline=G.income(s,farm);grant(s,'well',5,9);assert(Math.abs(G.income(s,farm)-baseline*1.2)<.001);
   grant(s,'stage',7,9);assert(Math.abs(G.income(s,farm)-baseline*1.23)<.001);assert(Math.abs(G.income(s,tea)-2.06)<.001);
});
test('fortune boxes grow exponentially and create the shrine-unlocked maximum level',()=>{
  const first=G.createState(null),second=G.createState(null);setShrineLevel(first,7);setShrineLevel(second,7);
  assert.deepEqual(G.buildCost(first,'fortune'),{coins:90,materials:60});
  assert.equal(G.unlockedBuildingLevel(first),5);
  first.coins=second.coins=first.materials=second.materials=1e6;
  const a=G.build(first,'fortune',7,8),b=G.build(second,'fortune',7,8);
  assert(a.ok&&b.ok);assert.equal(a.rolled,b.rolled);assert.equal(a.building.level,5);assert.equal(a.building.hp,G.maxHP(a.building));
  assert.equal(first.fortuneBuilt,1);assert.deepEqual(G.buildCost(first,'fortune'),{coins:162,materials:108});
  assert.deepEqual(a.building.originCost,{coins:90,materials:60});
  assert(!['home','market','fence','fortune','shrine','gate'].includes(a.rolled));
  assert.equal(G.DEFS[a.rolled].income,undefined,'Fortune never produces an income building');
  for(const plot of [[7,8],[5,8],[12,4],[13,13]])assert(G.fortuneCandidates(first,...plot).every(d=>!d.income&&d.cat!=='economy'),'Production buildings stay out of every fortune pool');
});
test('exclusive buildings only come from fortune while retired buildings are absent',()=>{
  const s=rich();
  for(const type of ['earth','tao','stage','well','rock','zhong']){
    assert.equal(G.DEFS[type].fortuneOnly,true);assert.equal(G.buildReason(s,type,7,8),'仅可由造化匣获得');
    assert(G.fortuneCandidates(s,7,8).some(d=>d.id===type),type+' belongs to fortune pool');
  }
  for(const type of ['home','market','fence'])assert.equal(G.buildReason(s,type,7,8),'未知建筑');
});
test('earth temples reduce damage and Taoist temples empower defenses',()=>{
  const s=rich(),earth=grant(s,'earth',7,8),tao=grant(s,'tao',9,8),tower=build(s,'tower',8,7);
  assert(Math.abs(G.buildingGuard(s,tower)-.2)<1e-8);assert(Math.abs(G.defenseBoost(s)-1.15)<1e-8);
  setShrineLevel(s,2);assert(G.upgrade(s,earth).ok);assert(G.upgrade(s,tao).ok);
  assert(Math.abs(G.buildingGuard(s,tower)-.4)<1e-8);assert(Math.abs(G.defenseBoost(s)-1.3)<1e-8);
});
test('Zhong Kui periodically slows every enemy regardless of distance',()=>{
  const s=rich(),zhong=grant(s,'zhong',0,0);G.startNight(s);
  advance(s,.5);const enemy=s.enemies[0];assert(enemy);
  assert(enemy.slowed>3.5&&enemy.slowed<=G.DEFS.zhong.slowDuration);
  assert(Math.abs(enemy.slowFactor-.6)<1e-8);assert(zhong.cooldown>11&&zhong.cooldown<=G.DEFS.zhong.pulseInterval);
  advance(s,4.1);assert.equal(enemy.slowed,0);assert.equal(enemy.slowFactor,1);
  setShrineLevel(s,2);assert(G.upgrade(s,zhong).ok);assert(Math.abs(G.zhongSlow(zhong)-.48)<1e-8);
});
test('same building cannot repeat within its range, but farm and mulberry may cluster',()=>{
  const s=rich();
  build(s,'tea',7,8);
  assert.match(G.buildReason(s,'tea',8,7),/范围内已有相同建筑/); // Diagonal neighbour counts.
  assert.match(G.buildReason(s,'tea',8,9),/范围内已有相同建筑/);
  assert.equal(G.build(s,'tea',9,8).ok,true);                    // Two cells away is allowed.
  build(s,'farm',5,8);assert.equal(G.build(s,'farm',5,9).ok,true); // Range 0 lets farms stand adjacent.
  build(s,'mulberry',11,3);assert.equal(G.build(s,'mulberry',12,4).ok,true);
});
test('industry building limits shrink by tier and reject excess construction',()=>{
  assert.deepEqual([G.DEFS.farm.limit,G.DEFS.mulberry.limit,G.DEFS.tea.limit,G.DEFS.quarry.limit],[8,8,6,6]);
  for(const type of ['inn','mill','weaver','kiln'])assert.equal(G.DEFS[type].limit,3);
  for(const type of ['bank','wine','tailor','trade'])assert.equal(G.DEFS[type].limit,1);
  assert.equal(G.DEFS.guild.limit,1);assert.equal(G.DEFS.port.limit,1);
  const s=rich();let built=0;
  const size=G.worldSize(s);
  for(let y=0;y<size&&built<G.DEFS.farm.limit;y++)for(let x=0;x<size&&built<G.DEFS.farm.limit;x++)if(!G.buildReason(s,'farm',x,y)){build(s,'farm',x,y);built++;}
  assert.equal(built,8);assert.equal(G.buildReason(s,'farm',0,0),'已达上限（8座）');
});
test('the level-15 shrine gates all nine ordinary building levels',()=>{
  const s=rich();s.coins=s.materials=1e9;const tea=build(s,'tea',7,8),shrine=s.buildings[0];
  assert.equal(G.maxLevel(shrine),15);assert.equal(G.maxLevel(tea),9);
  assert.deepEqual(G.SHRINE_REQUIREMENTS.slice(2),[2,3,5,7,9,11,13,15]);
  assert.match(G.upgradeReason(s,tea),/祠堂 Lv2/);
  for(let target=2;target<=9;target++){
    setShrineLevel(s,G.requiredShrineLevel(target));
    assert(G.upgrade(s,tea).ok,`tea reaches ${target}`);
  }
  assert.match(G.upgradeReason(s,tea),/最高等级/);
  while(shrine.level<G.SHRINE_MAX_LEVEL)assert(G.upgrade(s,shrine).ok);
  assert.equal(shrine.level,15);assert.match(G.upgradeReason(s,shrine),/最高等级/);
});
test('only the immediately previous industry tier adds 10% income per level',()=>{
  const s=rich();setShrineLevel(s,2);
  const farm=build(s,'farm',5,8),mill=build(s,'mill',6,9),wine=build(s,'wine',7,8);
  assert(Math.abs(G.income(s,mill)-3.3)<.001);   // 3 × (1 + .1), farm within 1.
   assert(Math.abs(G.income(s,wine)-26.4)<.001);   // Farm is two tiers earlier and adds nothing.
  assert(G.upgrade(s,farm).ok);                   // Farm Lv2 adds .2
  assert(Math.abs(G.income(s,mill)-3.6)<.001);
   assert(Math.abs(G.income(s,wine)-26.4)<.001);
  build(s,'tea',6,5);const inn=build(s,'inn',6,4);
   assert(Math.abs(G.income(s,inn)-5.5)<.001);
  build(s,'tea',9,4);                             // Distance 3 exceeds the inn range of 2.
   assert(Math.abs(G.income(s,inn)-5.5)<.001);
});
test('all four chains ignore a starter two tiers behind the endpoint',()=>{
  for(const [types,cells,midBase,endBase] of [
      [['tea','inn','bank'],[[6,5],[6,4],[7,4]],5,40],
     [['farm','mill','wine'],[[5,8],[6,9],[7,8]],3,24],
      [['mulberry','weaver','tailor'],[[10,6],[10,7],[10,8]],3,24],
     [['quarry','kiln','trade'],[[11,11],[10,10],[10,9]],5,40]
  ]){
    const s=rich();setShrineLevel(s,2);const start=build(s,types[0],...cells[0]),middle=build(s,types[1],...cells[1]),end=build(s,types[2],...cells[2]);
    assert(Math.abs(G.income(s,middle)-midBase*1.1)<1e-8,types[1]+' receives starter bonus');
    assert(Math.abs(G.income(s,end)-endBase*1.1)<1e-8,types[2]+' receives middle bonus only');
    assert(G.upgrade(s,start).ok);
    assert(Math.abs(G.income(s,middle)-midBase*1.2)<1e-8,types[1]+' responds to starter level');
    assert(Math.abs(G.income(s,end)-endBase*1.1)<1e-8,types[2]+' ignores starter level');
  }
});
test('daylight heals 10% each second and caps at full health; dusk and night do not',()=>{
  const s=rich(),base=s.buildings[0];base.hp=900;
  advance(s,.9);assert.equal(base.hp,900);
  advance(s,.1);assert.equal(base.hp,1080);
  advance(s,4);assert.equal(base.hp,G.maxHP(base));
  base.hp=900;G.dusk(s);advance(s,2.1);assert.equal(base.hp,900);
  G.startNight(s);advance(s,2.1);assert.equal(base.hp,900);
});
test('shortest paths stay orthogonal, attack buildings on the direct route, and attack a complete enclosure',()=>{
  const s=rich(),e={x:8,y:2,type:'bandit',damage:14};const direct=G.findPath(s,e);assert.equal(direct.length,6);
  const wall=grant(s,'zhong',8,6);const around=G.findPath(s,e);assert.equal(around.length,6);assert(around.some(p=>p.x===8&&p.y===6));
  let prev=e;for(const p of around){assert.equal(Math.abs(p.x-prev.x)+Math.abs(p.y-prev.y),1);prev=p;}
  G.demolish(s,wall);for(const [x,y] of [[8,7],[9,8],[8,9],[7,8]])grant(s,'zhong',x,y);
  assert(G.findPath(s,e).some(p=>G.at(s,p.x,p.y)?.type==='zhong'));
  G.dusk(s);s.direction=0;G.startNight(s);advance(s,38);assert(s.buildings.some(b=>b.type==='zhong'&&b.hp<G.maxHP(b))||s.buildings.length<5);
});
test('enemies route around water and old saves move enemies out of water',()=>{
  const s=rich(),e={x:0,y:8,type:'bandit',damage:14};
  const path=G.findPath(s,e);assert(path.length>8);
  let prev=e;
  for(const p of path){
    assert.notEqual(G.terrain(p.x,p.y),'water');
    assert.equal(Math.abs(p.x-prev.x)+Math.abs(p.y-prev.y),1);
    prev=p;
  }
  G.startNight(s);s.wave.spawned=s.wave.total;
  s.enemies=[{...e,id:s.nextId++,hp:100,maxHp:100,speed:.65,attack:0,repelled:0,path:[],pathRevision:-1}];
  for(let i=0;i<100;i++){
    G.step(s,.1);
    assert(s.enemies.every(n=>G.terrain(Math.round(n.x),Math.round(n.y))!=='water'));
  }
  const saved=JSON.parse(G.serialize(s));saved.enemies[0].x=3;saved.enemies[0].y=8;
  const restored=G.restore(JSON.stringify(saved));assert(restored);
  assert.notEqual(G.terrain(Math.round(restored.enemies[0].x),Math.round(restored.enemies[0].y)),'water');
});
test('two arrow towers can complete the first night and grant dawn rewards',()=>{
  const s=rich();build(s,'tower',8,7);build(s,'tower',7,8);G.dusk(s);G.startNight(s);
  for(let i=0;i<1800&&s.phase==='night';i++)G.step(s,.1);
  assert.equal(s.over,false);assert.equal(s.day,2);assert.equal(s.phase,'day');assert.equal(s.kills,5);
});
test('day fifteen starts the later enemy growth segment',()=>{
  const enemyAt=day=>{const s=G.createState(null);s.day=day;G.startNight(s);G.step(s,.25);G.step(s,.25);return s.enemies[0];};
  const first=enemyAt(1),late=enemyAt(15);
  assert(first&&late);
  assert.equal(first.maxHp,60);assert(Math.abs(first.damage-6.3)<1e-8);
  assert(Math.abs(late.maxHp-100*Math.pow(1.26,13)*1.32*1.08)<1e-8);
  assert(Math.abs(late.damage-14*Math.pow(1.15,13)*1.22*1.04)<1e-8);
  assert(Math.abs(late.maxHp/first.maxHp-Math.pow(1.26,13)*1.32*1.08/.6)<1e-8);
  assert(Math.abs(late.damage/first.damage-Math.pow(1.15,13)*1.22*1.04/.45)<1e-8);
  assert(late.speed>first.speed);
});
test('skills enforce night and cooldown without incense or building unlocks',()=>{
  for(const id of Object.keys(G.SKILLS)) {
    const s=rich();assert.equal('incense' in s,false);assert(G.chooseSkill(s,id).ok);assert.equal(G.skill(s,id).ok,false);
    G.dusk(s);G.startNight(s);advance(s,1);
    const base=s.buildings[0];base.hp=900;const hp=s.enemies[0].hp;
    assert(G.skill(s,id).ok);assert.equal(G.skill(s,id).ok,false);
    if(id==='repair')assert.equal(base.hp,1530);
    if(id==='repel'){assert.equal(s.enemies[0].hp,hp-20);assert(s.enemies[0].repelled>0);}
    if(id==='thunder')assert.equal(s.enemies.length,0);
  }
});
test('night permits the same building construction, upgrade and demolition as day',()=>{
  const s=rich();setShrineLevel(s,2);const farm=build(s,'farm',5,8);G.dusk(s);
  const tower=build(s,'tower',7,7);assert.equal(G.build(s,'barracks',6,6).ok,true);
  G.startNight(s);const before={coins:s.coins,materials:s.materials},count=s.buildings.length;
  assert.equal(G.buildReason(s,'farm',5,9),'');
  assert.equal(G.buildReason(s,'barracks',6,5),'');
  assert.equal(G.build(s,'farm',5,9).ok,true);
  assert.equal(G.build(s,'barracks',6,5).ok,true);
  assert.equal(G.buildReason(s,'tower',4,8),'水域不可建造');
  assert.equal(G.upgradeReason(s,tower),'');
  assert.equal(G.upgrade(s,tower).ok,true);assert.equal(tower.level,2);
  assert.equal(G.demolishReason(s,farm),'');
  assert.equal(G.demolish(s,farm).ok,true);
  assert.match(G.demolish(s,s.buildings[0]).reason,/祠堂不可拆除/);
  const farmCost=G.DEFS.farm.cost,barracksCost=G.DEFS.barracks.cost,upgradeCost=G.upgradeCost({type:'tower',level:1});
  for(const resource of ['coins','materials']) assert.equal(s[resource],before[resource]-farmCost[resource]-barracksCost[resource]-upgradeCost[resource]+Math.floor(farmCost[resource]*.4));
  assert.equal(s.buildings.length,count+1);
});
test('festival awards and boss wave occur every seventh day',()=>{
  const s=rich();s.day=6;G.startNight(s);s.wave.spawned=s.wave.total;advance(s,.1);assert.equal(s.day,7);assert(s.events.some(e=>e.text.includes('上元灯会')));
  const base=s.buildings[0];assert(Math.abs(G.income(s,base)-1.25)<1e-8);base.hp=100000;G.startNight(s);assert(s.wave.boss);advance(s,60);assert(s.enemies.some(e=>e.boss));
});
test('main base destruction ends the game and freezes simulation',()=>{
  const s=rich();s.buildings[0].hp=1;G.startNight(s);advance(s,120);assert(s.over);const coins=s.coins;advance(s,10);assert.equal(s.coins,coins);
});
test('save restores construction, clock, enemies and cooldowns; rejects malformed data',()=>{
  const s=rich();assert(G.chooseSkill(s,'repel').ok);build(s,'tea',7,8);G.startNight(s);advance(s,4);assert(G.skill(s,'repel').ok);
  const recovered=G.restore(G.serialize(s));assert(recovered);assert.equal(recovered.coins,s.coins);assert.equal(recovered.time,s.time);assert.equal(recovered.buildings.length,2);assert.equal(recovered.enemies.length,s.enemies.length);assert.equal(recovered.cooldowns.repel,s.cooldowns.repel);
  const legacyEnemy=JSON.parse(G.serialize(s));for(const e of legacyEnemy.enemies){delete e.slowed;delete e.slowFactor;}
  assert.deepEqual(recovered.enemies.map(e=>[e.x,e.y,e.laneX,e.laneY]),s.enemies.map(e=>[e.x,e.y,e.laneX,e.laneY]));
  assert(recovered.enemies.every(e=>e.path.length===0&&e.pathRevision===-1));
  const migratedEnemy=G.restore(JSON.stringify(legacyEnemy));assert(migratedEnemy);assert(migratedEnemy.enemies.every(e=>e.slowed===0&&e.slowFactor===1));
  advance(recovered,2);assert(recovered.time>s.time);assert.equal(G.restore('{bad'),null);
  const duplicate=JSON.parse(G.serialize(s));duplicate.buildings.push({...duplicate.buildings[0]});assert.equal(G.restore(JSON.stringify(duplicate)),null);
  const corrupt=JSON.parse(G.serialize(s));corrupt.buildings[0].level=99;assert.equal(G.restore(JSON.stringify(corrupt)),null);
});
test('income settles once per building per second, with exact coin floating amounts',()=>{
  const s=rich();const tea=build(s,'tea',7,8),before=s.coins;
  advance(s,.9);assert.equal(s.coins,before);assert.equal(s.effects.filter(e=>e.type==='income').length,0);
   advance(s,.1);assert.equal(s.coins,before+3);assert.equal('incense' in s,false);
   const floats=s.effects.filter(e=>e.type==='income');assert.equal(floats.length,2);assert.equal(floats.find(e=>e.buildingId===tea.id).amount,2);
   assert.equal(floats.find(e=>e.buildingId===s.buildings[0].id).amount,1);
   advance(s,.5);assert.equal(s.coins,before+3);assert(s.effects.find(e=>e.buildingId===tea.id).life<.5);
   advance(s,.5);assert.equal(s.coins,before+6);assert.equal(s.effects.filter(e=>e.type==='income').length,2);
});
test('each newly built building waits a full second before its first payout',()=>{
  const s=rich();advance(s,.8);const tea=build(s,'tea',7,8),before=s.coins;
  advance(s,.2);assert.equal(s.coins,before+1);assert(!s.effects.some(e=>e.buildingId===tea.id));
   advance(s,.8);assert.equal(s.coins,before+3);assert(s.effects.some(e=>e.buildingId===tea.id&&e.amount===2));
});
test('fractional income is retained across payouts, upgrades and save reloads',()=>{
  const s=rich();setShrineLevel(s,2);const tea=build(s,'tea',7,8);G.upgrade(s,tea);const before=s.coins;
   advance(s,1);assert.equal(s.effects.find(e=>e.buildingId===tea.id).amount,4);
  const copy=G.restore(G.serialize(s));assert(copy);advance(copy,19);
   // 4 × 20 = 80 tea coins, plus 40 coins from the Lv2 shrine.
   assert.equal(copy.coins,before+120);
  const partial=rich();build(partial,'tea',7,8);advance(partial,.6);const amount=partial.coins;
   const restored=G.restore(G.serialize(partial));advance(restored,.3);assert.equal(restored.coins,amount);advance(restored,.1);assert.equal(restored.coins,amount+3);
});
test('v1 saves without income counters migrate without losing buildings or money',()=>{
  const s=rich();build(s,'tea',7,8);const old=JSON.parse(G.serialize(s));old.version=1;
  for(const b of old.buildings){delete b.incomeTime;delete b.coinPending;delete b.incensePending;}
  const restored=G.restore(JSON.stringify(old));assert(restored);assert.equal(restored.version,4);assert.equal(restored.buildings.length,2);assert.equal(restored.coins,s.coins);assert.equal('incense' in restored,false);
   advance(restored,1);assert.equal(restored.coins,s.coins+3);
});
test('old level-three saves retain durability percentage after the growth rebalance',()=>{
  const s=rich(),tea=build(s,'tea',7,8),old=JSON.parse(G.serialize(s));
  old.version=1;const legacy=old.buildings.find(b=>b.id===tea.id);legacy.level=3;legacy.hp=Math.round(G.DEFS.tea.hp*1.65*1.65)*.5;
  const restored=G.restore(JSON.stringify(old));assert(restored);
  const current=restored.buildings.find(b=>b.id===tea.id);
  assert.equal(restored.version,4);assert.equal(current.level,3);
  assert(Math.abs(current.hp/G.maxHP(current)-.5)<1e-8);
});
test('v2 level-nine saves migrate to the new durability curve',()=>{
  const s=rich(),tea=build(s,'tea',7,8),old=JSON.parse(G.serialize(s));old.version=2;
  const legacy=old.buildings.find(b=>b.id===tea.id);legacy.level=9;legacy.hp=Math.round(G.DEFS.tea.hp*Math.pow(1.3,8))*.4;
  const restored=G.restore(JSON.stringify(old));assert(restored);const current=restored.buildings.find(b=>b.id===tea.id);
  assert.equal(restored.version,4);assert.equal(current.level,9);assert(Math.abs(current.hp/G.maxHP(current)-.4)<1e-8);
});
test('old saves remove retired buildings without invalidating the town',()=>{
  const old=JSON.parse(G.serialize(rich()));old.version=3;old.incense=25;
  for(const [i,type] of ['home','market','fence'].entries())old.buildings.push({id:100+i,type,x:i,y:0,level:1,hp:200,cooldown:0,incomeTime:0,coinPending:0,materialPending:0,incensePending:0});
  const restored=G.restore(JSON.stringify(old));assert(restored);assert.equal(restored.buildings.length,1);
  assert(restored.events.some(e=>e.text.includes('3 栋已退役建筑被移除')));
});
test('two-resource chains have the intended costs, production and formula upgrades',()=>{
  const fresh=G.createState(null);
  assert.deepEqual({coins:fresh.coins,materials:fresh.materials,fortuneBuilt:fresh.fortuneBuilt},{coins:150,materials:200,fortuneBuilt:0});
  assert.equal('prosperity' in fresh,false);
  for(const d of Object.values(G.DEFS)){assert.equal('prosperity' in d,false);assert.equal('unlock' in d,false);}
  for(const type of ['tea','inn','bank','farm','mill','wine']) assert.equal(G.DEFS[type].resource,'coins');
  for(const type of ['mulberry','weaver','tailor','quarry','kiln','trade']) assert.equal(G.DEFS[type].resource,'materials');
  for(const [types,incomes,costs] of [
     [['tea','inn','bank'],[2,5,40],[[0,98],[165,360],[2867,5000]]],
     [['farm','mill','wine'],[1,3,24],[[0,65],[110,240],[1720,3000]]],
     [['mulberry','weaver','tailor'],[1,3,24],[[95,0],[290,70],[3680,1200]]],
     [['quarry','kiln','trade'],[2,5,40],[[143,0],[435,105],[6134,2000]]],
     [['guild'],[240],[[44572,66858]]],
     [['port'],[300],[[70500,37500]]]
  ])for(const [i,type] of types.entries()){
    assert.equal(G.DEFS[type].income,incomes[i],type);
    assert.deepEqual(G.DEFS[type].cost,{coins:costs[i][0],materials:costs[i][1]},type);
  }
  for(const type of ['tea','farm']){
    const d=G.DEFS[type];assert.equal(d.cost.coins,0);assert(d.cost.materials>0);
    for(const level of [1,2]){const cost=G.upgradeCost({type,level});assert.equal(cost.coins,0);assert(cost.materials>d.cost.materials);}
  }
  for(const type of ['mulberry','quarry']){
    const d=G.DEFS[type];assert(d.cost.coins>0);assert.equal(d.cost.materials,0);
    for(const level of [1,2]){const cost=G.upgradeCost({type,level});assert(cost.coins>d.cost.coins);assert.equal(cost.materials,0);}
  }
   for(const group of [['inn','bank'],['mill','wine'],['guild']])for(const type of group){const c=G.DEFS[type].cost;assert(c.materials>c.coins);assert(c.coins>0);}
   for(const group of [['weaver','tailor'],['kiln','trade'],['port']])for(const type of group){const c=G.DEFS[type].cost;assert(c.coins>c.materials);assert(c.materials>0);}
  assert(G.DEFS.tailor.cost.coins>G.DEFS.weaver.cost.coins);
  assert(G.DEFS.tailor.cost.materials>G.DEFS.weaver.cost.materials);
   for(const type of ['tea','inn','bank','farm','mill','wine','mulberry','weaver','tailor','quarry','kiln','trade','guild','port']){
    const c=G.DEFS[type].cost;
    for(const level of [1,2,3,4])assert.deepEqual(G.upgradeCost({type,level}),{
      coins:Math.ceil(c.coins*1.8*Math.pow(G.UPGRADE_GROWTH,level-1)),materials:Math.ceil(c.materials*1.8*Math.pow(G.UPGRADE_GROWTH,level-1))
    });
  }
});
test('default estates can immediately fund tea or towers on legal plots',()=>{
  assert.equal(G.createState(null).materials,200);
  for(const seed of [1,7,42,73193,99991]){
    const s=G.createState(seed);assert.equal(s.coins,150);assert.equal(s.materials,200);
    const size=G.worldSize(s),plots=[...G.estate(s).cells].map(key=>[key%size,Math.floor(key/size)]);
    for(const type of ['tea','tower']){
      const plot=plots.find(([x,y])=>!G.buildReason(s,type,x,y,true));assert(plot,type+' opening plot');
      const opening=G.restore(G.serialize(s)),cost=G.buildCost(opening,type);
      assert.equal(G.buildReason(opening,type,...plot),'');assert(G.build(opening,type,...plot).ok);
      const reward=G.MISSIONS.slice(s.mission,opening.mission).reduce((sum,m)=>sum+m.reward,0);
      assert.deepEqual([opening.coins,opening.materials],[150-cost.coins+reward,200-cost.materials]);
    }
    assert.equal(s.coins,150);assert.equal(s.materials,200);
    const loaded=G.restore(G.serialize(s));assert(loaded);assert.deepEqual([loaded.coins,loaded.materials],[150,200]);
  }
});
test('construction and upgrading check and deduct each resource atomically',()=>{
  const s=G.createState(null);s.coins=200;s.materials=120;const coins=s.coins,materials=s.materials;
  s.materials=0;assert.match(G.buildReason(s,'tea',7,8),/工材/);assert.equal(G.build(s,'tea',7,8).ok,false);assert.equal(s.coins,coins);
  s.materials=materials;const tea=build(s,'tea',7,8);assert.equal(s.materials,materials-G.DEFS.tea.cost.materials);assert(s.coins>=coins);
  setShrineLevel(s,2);const before={coins:s.coins,materials:s.materials};s.materials=0;assert.match(G.upgradeReason(s,tea),/工材/);assert.equal(G.upgrade(s,tea).ok,false);assert.equal(s.coins,before.coins);
  s.materials=1000;const cost=G.upgradeCost(tea);assert(G.upgrade(s,tea).ok);assert.equal(s.materials,1000-cost.materials);
  const other=rich();other.coins=0;assert.match(G.buildReason(other,'mulberry',11,3),/铜钱/);assert.equal(G.build(other,'mulberry',11,3).ok,false);assert.equal(other.materials,100000);
});
test('silk and craft pay materials once per building-second and survive save migration',()=>{
  const s=rich();setShrineLevel(s,2);const mulberry=build(s,'mulberry',11,3),coins=s.coins,materials=s.materials;
  advance(s,.9);assert.equal(s.materials,materials);assert.equal(s.effects.filter(e=>e.buildingId===mulberry.id).length,0);
   advance(s,.1);assert.equal(s.materials,materials+1);assert.equal(s.coins,coins+2);
   assert.deepEqual(s.effects.filter(e=>e.buildingId===mulberry.id).map(e=>[e.resource,e.amount]),[['materials',1]]);
  G.upgrade(s,mulberry);advance(s,.5);
  const restored=G.restore(G.serialize(s));assert(restored);const next=restored.buildings.find(b=>b.id===mulberry.id);
  assert.equal(next.materialPending,mulberry.materialPending);assert.equal(restored.materials,s.materials);
  const legacy=JSON.parse(G.serialize(s));delete legacy.materials;delete legacy.prosperity;
  for(const b of legacy.buildings){delete b.materialPending;if(b.id===mulberry.id)b.coinPending=.45;}
  const migrated=G.restore(JSON.stringify(legacy));assert(migrated);assert.equal(migrated.materials,120);
  const migratedTree=migrated.buildings.find(b=>b.id===mulberry.id);assert.equal(migratedTree.materialPending,.45);assert.equal(migratedTree.coinPending,0);
});
test('legacy scripted opening funds production and survives night one without guaranteeing seven nights',t=>{
  const {run}=require('../scripts/balance-sim.js');
  const rush=run(10,'build'),runs=[1,7,42,73193,99991].map(seed=>run(7,'balanced',seed));
  assert(rush.over,'Ignoring defenses should eventually lose the town');
  assert(runs.some(result=>result.over),'The old defense plan must expose later defeat risk');
  for(const result of runs){
    t.diagnostic(`legacy seed ${result.seed}: day ${result.day}, defeated=${result.over}`);
    assert(result.day>1,'The funded opening survives the first night');
    if(result.over){assert(result.day<=7);assert.equal(result.history.at(-1).shrineHP,0);}
    else {assert.equal(result.day,8);assert(result.history.at(-1).shrineHP>0);}
    assert(result.nextPlan>=4,'Default stock funds the first four opening buildings');
    assert(result.history[0].materialRate>0,'The first day establishes material production');
    assert.equal(result.history[0].shrineHP,1800);
  }
});
