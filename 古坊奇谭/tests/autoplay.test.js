'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../js/game.js'),A=require('../js/autoplay.js');
function advance(s,bot,seconds){for(let i=0;i<seconds*4&&!s.over;i++){bot.tick(.25);G.step(s,.25);}}

test('autoplay obeys action rules and resource costs without modifying the simulation clock',()=>{
  const s=G.createState(42);s.coins=200;s.materials=220;G.chooseSkill(s,'thunder');const before=G.serialize(s),bot=A.create(s);
  assert.equal(G.serialize(s),before,'Planning does not alter the town');
  const originals={},counts={build:0,upgrade:0,skill:0};
  for(const name of Object.keys(counts)){
    originals[name]=G[name];
    G[name]=(...args)=>{
      const [state,type,x,y]=args;
      assert.equal(name==='build'?G.buildReason(state,type,x,y):name==='upgrade'?G.upgradeReason(state,type):G.skillReason(state,type),'');
      const result=originals[name](...args);assert(result.ok);counts[name]++;return result;
    };
  }
  try{
    bot.tick(.1);assert.equal(s.elapsed,0);assert.equal(s.time,0);
    assert(counts.build+counts.upgrade>0,'First action goes through a funded public action API');
    assert(s.coins<200||s.materials<220,'First action pays its normal resource cost');
    advance(s,bot,900);
    assert(counts.build>10);assert(counts.upgrade>10);assert(counts.skill>0);
    const r=bot.report();assert.equal(r.builds,counts.build);assert.equal(r.upgrades,counts.upgrade);
    assert.equal(Object.values(r.skills).reduce((a,b)=>a+b,0),counts.skill);
    assert(s.coins>=0&&s.materials>=0);assert(G.restore(G.serialize(s)));
    const snapshot=G.serialize(s);s.over=true;const ended=G.serialize(s),report=bot.report();
    bot.tick(100);assert.equal(G.serialize(s),ended);assert.deepEqual(bot.report(),report);
    assert.notEqual(snapshot,ended);
  }finally{Object.assign(G,originals);}
});

test('five procedural maps can be played automatically through the seventh-night victory',()=>{
  for(const seed of [1,7,42,73193,99991]){
    const s=G.createState(seed),bot=A.create(s);advance(s,bot,1000);
    assert(!s.over,`seed ${seed}`);assert(s.day>=9,`seed ${seed}`);assert(s.celebrated);
    assert(s.buildings.filter(b=>b.type==='tower').length>=1);
    assert(s.buildings.filter(b=>b.type==='tower').length<=12,'Only reinforce threatened fronts');
    assert(s.buildings.filter(b=>G.DEFS[b.type].cat==='economy').length>=15,'Expand income beyond one building per industry');
    assert(s.buildings.some(b=>G.DEFS[b.type].cat==='economy'&&b.level>1));
    assert(bot.report().skills.thunder>0);
  }
});

test('opening expands repeated income buildings instead of filling eight tower slots',()=>{
  const s=G.createState(42);s.coins=200;s.materials=220;const bot=A.create(s);advance(s,bot,G.DAY-.25);
  assert.equal(s.phase,'day');
  assert.equal(s.buildings.filter(b=>b.type==='tower').length,0,'No known attackers during the first day');
  const eco=s.buildings.filter(b=>G.DEFS[b.type].cat==='economy');
  assert(eco.length>=8);assert(eco.filter(b=>b.type==='farm').length>1);assert(eco.filter(b=>b.type==='mulberry').length>1);
  const rates=G.rates(s);assert(rates.coins>=8);assert(rates.materials>=6);
  assert(s.coins>=G.DEFS.tower.cost.coins&&s.materials>=G.DEFS.tower.cost.materials,'Keep an emergency tower budget for dusk');
});

test('one adequate tower upgrades under stronger opening pressure without adding towers',()=>{
  const s=G.createState(42);s.coins=s.materials=1e6;G.dusk(s);
  const bot=A.create(s);bot.tick(1);
  assert.equal(s.buildings.filter(b=>b.type==='tower').length,1);
  const tower=s.buildings.find(b=>b.type==='tower'),gate=G.estate(s).gates[s.direction];
  assert(A.coversGate(tower,gate),'Build on the announced front');
  for(let i=0;i<15;i++)bot.tick(1);
  assert.equal(s.buildings.filter(b=>b.type==='tower').length,1,'Sufficient firepower must not trigger extra towers');
  assert(tower.level>1,'Opening pressure upgrades the existing tower');
  assert.equal(s.buildings.filter(b=>b.type==='tower').length,1);
  assert(bot.report().actions.some(a=>a.kind==='build'&&G.DEFS[a.type].cat==='economy'));
  assert(bot.report().actions.every(a=>typeof a.reason==='string'&&a.reason.length>0));
});

test('actual pressure triggers upgrades and repairs instead of ignoring defense',()=>{
  const s=G.createState(42);s.coins=s.materials=1e6;G.chooseSkill(s,'repair');
  const shrine=s.buildings.find(b=>b.type==='shrine');shrine.level=15;shrine.hp=G.maxHP(shrine);
  G.dusk(s);const bot=A.create(s);bot.tick(1);
  const tower=s.buildings.find(b=>b.type==='tower'),gate=G.estate(s).gates[s.direction];
  G.startNight(s);for(let i=0;i<10&&!s.enemies.length;i++)G.step(s,.25);
  const e=s.enemies[0];e.hp=e.maxHp=1000;e.x=gate.x;e.y=gate.y;
  s.cooldowns.thunder=s.cooldowns.repel=99;
  const gateBuilding=s.buildings.find(b=>b.type==='gate'&&b.direction===gate.direction);gateBuilding.hp=G.maxHP(gateBuilding)*.4;
  bot.tick(1);
  assert.equal(bot.report().skills.repair,1);assert(tower.level>1,'Upgrade the existing tower under pressure');
  assert.equal(s.buildings.filter(b=>b.type==='tower').length,1);
});

test('autoplay can take over existing, legacy, crowded and resource-poor games without deleting player buildings',()=>{
  for(const seed of [null,42]){
    const s=G.createState(seed),center=G.worldCenter(s);s.coins=200;s.materials=220;
    const placed=G.grantBuilding(s,'tower',center+1,center);
    const bot=A.create(s);advance(s,bot,60);
    assert(s.buildings.some(b=>b.id===placed.id));assert(bot.report().builds>0);
    assert(s.buildings.some(b=>G.DEFS[b.type].cat==='economy'));assert(G.restore(G.serialize(s)));
  }
  const crowded=G.createState(42);crowded.coins=crowded.materials=0;
  for(let y=0;y<25;y++)for(let x=0;x<25;x++)G.grantBuilding(crowded,'tower',x,y);
  const bot=A.create(crowded),before=G.serialize(crowded);bot.tick(1);
  assert.equal(G.serialize(crowded),before);assert.equal(bot.report().builds,0);
});

test('disabled ticking and exported report copies cannot change game or controller state',()=>{
  const s=G.createState(7);s.coins=200;s.materials=220;const bot=A.create(s),before=G.serialize(s);
  for(const dt of [0,-1,NaN,Infinity])bot.tick(dt);
  assert.equal(G.serialize(s),before);assert.equal(bot.report().decisions,0);
  bot.tick(1);const report=bot.report();report.actions[0].type='changed';report.skills.repair=99;
  assert.notEqual(bot.report().actions[0].type,'changed');assert.equal(bot.report().skills.repair,0);
});
