'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../js/game.js'),A=require('../js/autoplay.js');

function advanceEconomy(s,bot,seconds){
  const view=G.playerView(s,0);
  for(let i=0;i<seconds*4&&!s.over;i++){
    bot.tick(.25);G.stepEconomy(view,.25,false);s.elapsed+=.25;s.time=s.elapsed;
  }
}
function count(view,type){return view.buildings.filter(b=>b.type===type).length;}

test('autoplay uses public actions and pays normal costs',()=>{
  const s=G.createState(42),view=G.playerView(s,0);view.coins=view.materials=1000;G.chooseSkill(view,'thunder');
  const before=G.serialize(s),bot=A.create(view);assert.equal(G.serialize(s),before,'planning must not change the estate');
  const originals={},calls={build:0,upgrade:0};
  for(const name of Object.keys(calls)){
    originals[name]=G[name];
    G[name]=(...args)=>{
      const [state,target,x,y]=args;
      assert.equal(name==='build'?G.buildReason(state,target,x,y):G.upgradeReason(state,target,false,x||{}),'');
      const result=originals[name](...args);assert(result.ok);calls[name]++;return result;
    };
  }
  try{
    advanceEconomy(s,bot,120);
    assert(calls.build>=20);assert(calls.upgrade>=5);
    assert.equal(bot.report().builds,calls.build);assert.equal(bot.report().upgrades,calls.upgrade);
    assert(view.coins>=0&&view.materials>=0);assert(G.restore(G.serialize(s)));
    assert(bot.report().actions.every(a=>typeof a.reason==='string'&&a.reason.length>0));
  }finally{Object.assign(G,originals);}
});

test('zero-resource opening establishes both resources before military spending',()=>{
  const s=G.createState(42),view=G.playerView(s,0),bot=A.create(view);advanceEconomy(s,bot,145);
  const builds=bot.report().actions.filter(a=>a.kind==='build'),types=builds.map(a=>a.type);
  assert.deepEqual(types.slice(0,2),['farm','mulberry']);
  const barracksAt=types.indexOf('barracks'),towerAt=types.indexOf('tower');
  assert.equal(types.slice(0,barracksAt).filter(type=>type==='farm'||type==='mulberry').length,8);
  assert(barracksAt>=8);assert(towerAt>barracksAt);
  assert(count(view,'farm')>=4);assert(count(view,'mulberry')>=4);
  assert(G.rates(view).coins>=5);assert(G.rates(view).materials>=4);
});

test('midgame route grows industry, main city and army across map seeds',()=>{
  for(const seed of [1,42,99991]){
    const s=G.createState(seed),view=G.playerView(s,0),bot=A.create(view);advanceEconomy(s,bot,360);
    const rates=G.rates(view),upgradedEconomy=view.buildings.filter(b=>G.DEFS[b.type].income&&b.type!=='shrine'&&b.level>1);
    assert.equal(count(view,'farm'),6,`farm seed ${seed}`);assert.equal(count(view,'mulberry'),6,`mulberry seed ${seed}`);
    assert(count(view,'tea')>=2,`tea seed ${seed}`);assert(count(view,'quarry')>=2,`quarry seed ${seed}`);
    assert(count(view,'mill')>=1,`mill seed ${seed}`);assert(count(view,'weaver')>=1,`weaver seed ${seed}`);
    assert(count(view,'barracks')>=2,`barracks seed ${seed}`);assert(count(view,'tower')>=1,`tower seed ${seed}`);
    assert(G.shrineLevel(view)>=2,`shrine seed ${seed}`);assert(upgradedEconomy.length>=8,`upgrades seed ${seed}`);
    assert(rates.coins>=80&&rates.materials>=80,`balanced rates seed ${seed}`);
  }
});

test('nearby attackers trigger immediate tower reinforcement',()=>{
  const s=G.createState(7),view=G.playerView(s,0);view.coins=view.materials=1e6;
  const bot=A.create(view);for(let i=0;i<10;i++)bot.tick(1);
  const gate=G.estate(view).gates[0],tower=view.buildings.find(b=>b.type==='tower'&&A.coversGate(b,gate));
  assert(tower);assert.equal(tower.level,1);
  for(let i=0;i<3;i++)s.soldiers.push({id:s.nextId++,owner:1,x:gate.x,y:gate.y+i*.1,hp:44,maxHp:44,baseDamage:18});
  bot.tick(1);assert(tower.level>1||count(view,'tower')>1);
});

test('game controller runs the same balanced route for computer players',()=>{
  const s=G.createState(42);s.players[0].controller='computer';s.players[0].selectedSkill='thunder';
  for(let i=0;i<960&&!s.over;i++)G.step(s,.25);
  assert.equal(s.over,false);
  for(const player of s.players){
    const view=G.playerView(s,player.id);
    assert.equal(player.eliminated,false);assert(count(view,'farm')>=5);assert(count(view,'mulberry')>=5);
    assert(count(view,'barracks')>=2);assert(count(view,'tower')>=1);
    assert(G.rates(view).coins>=15&&G.rates(view).materials>=15);
  }
});

test('strategic production planning clusters suppliers and completes ultimate buildings',()=>{
  for(const seed of [1,42,99991]){
    const s=G.createState(seed),view=G.playerView(s,0);view.coins=view.materials=1e7;G.chooseSkill(view,'thunder');
    // Nine military tiers now share the decision budget with economic construction.
    const bot=A.create(view);for(let i=0;i<100;i++)bot.tick(1);
    const ultimates=view.buildings.filter(b=>G.DEFS[b.type].required);
    assert(ultimates.length>=1,`ultimate seed ${seed}`);
    for(const building of ultimates)for(const required of G.DEFS[building.type].required){
      assert(view.buildings.some(b=>b.type===required&&G.dist8(b.x,b.y,building.x,building.y)<=1),`${building.type} keeps ${required} adjacent`);
    }
    const middles=view.buildings.filter(b=>G.DEFS[b.type].tier===1);
    const supplierCounts=middles.map(b=>view.buildings.filter(n=>n.type===G.DEFS[b.type].prev&&G.dist8(n.x,n.y,b.x,b.y)<=1).length);
    assert(supplierCounts.reduce((sum,n)=>sum+n,0)/supplierCounts.length>=2,`supplier density seed ${seed}: ${supplierCounts}`);
    assert(bot.report().actions.some(action=>action.reason.startsWith('筹建')));
  }
});

test('normal economy reaches an ultimate without neglecting its army',()=>{
  for(const seed of [1,42,99991]){
    const s=G.createState(seed),view=G.playerView(s,0),bot=A.create(view);advanceEconomy(s,bot,720);
    assert(view.buildings.some(b=>G.DEFS[b.type].required),`ultimate seed ${seed}`);
    assert(count(view,'barracks')>=2&&count(view,'tower')>=1,`army seed ${seed}`);
  }
});

test('invalid ticking and exported report copies cannot mutate controller state',()=>{
  const s=G.createState(7),view=G.playerView(s,0),bot=A.create(view),before=G.serialize(s);
  for(const dt of [0,-1,NaN,Infinity])bot.tick(dt);
  assert.equal(G.serialize(s),before);assert.equal(bot.report().decisions,0);
  view.coins=view.materials=1000;bot.tick(1);const report=bot.report();report.actions[0].type='changed';report.skills.thunder=99;
  assert.notEqual(bot.report().actions[0].type,'changed');assert.equal(bot.report().skills.thunder,0);
});
