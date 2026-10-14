'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../js/game');

function match(){
  const s=G.createMatch({mapSeed:42,rotation:0});
  for(const p of s.players){p.controller='human';p.selectedSkill='thunder';}
  return s;
}
function emptyPlot(s,predicate=()=>true){
  const width=G.worldWidth(s),gates=G.estate(s).gates;
  for(const k of G.estate(s).cells){
    const x=k%width,y=Math.floor(k/width);
    if(!G.at(s,x,y)&&!G.isWall(s,x,y)&&G.terrain(x,y,s)!=='water'&&!gates.some(g=>g.x===x&&g.y===y)&&predicate(x,y))return {x,y};
  }
  throw new Error('No matching empty plot');
}
const advance=(s,time,dt=.05)=>{for(let elapsed=0;elapsed<time-1e-8&&!s.over;elapsed+=dt)G.step(s,Math.min(dt,time-elapsed));};

test('all players start new matches with zero resources',()=>{
  for(const options of [{mode:'single',enemyCount:1},{mode:'single',enemyCount:4},{mode:'coop',enemyCount:2},{mode:'coop',enemyCount:6}]){
    const s=G.createMatch({...options,mapSeed:42,rotation:0});
    for(const p of s.players)assert.deepEqual([p.coins,p.materials],[0,0]);
  }
  const s=match(),p=G.playerView(s,0);advance(s,1);
  assert.deepEqual([p.coins,p.materials],[1,0]);
});

test('rock platform is fortune-only and uses its original splash attack',()=>{
  const s=match(),p=G.playerView(s,0);p.coins=p.materials=10000;
  assert.equal(G.DEFS.rock.fortuneOnly,true);
  assert.deepEqual([G.DEFS.rock.damage,G.DEFS.rock.range,G.DEFS.rock.interval,G.DEFS.rock.splash],[64,3.8,2,1.5]);
  const rockPlot=emptyPlot(p);assert.equal(G.buildReason(p,'rock',rockPlot.x,rockPlot.y),'仅可由造化匣获得');
  assert(G.fortuneCandidates(p,rockPlot.x,rockPlot.y).some(d=>d.id==='rock'));
  const rock=G.grantBuilding(p,'rock',rockPlot.x,rockPlot.y,1);assert(rock);assert.equal(G.DEFS.rock.soldierAura,undefined);
  const unitHp=G.soldierHP(G.playerView(s,1),{level:3});
  const unit=(id,x,y)=>({id,owner:1,barracksId:99999,x,y,level:3,hp:unitHp,maxHp:unitHp,baseDamage:72,attack:0,targetOwner:null,targetId:null,repelled:0,slowed:0,slowFactor:1,waypoint:null});
  const target=unit(s.nextId++,rock.x+.5,rock.y),nearby=unit(s.nextId++,rock.x+1,rock.y);
  s.soldiers.push(target,nearby);G.step(s,.05);
  assert.equal(target.hp,unitHp-64);assert.equal(nearby.hp,unitHp-64);assert.equal(rock.cooldown,2);
});

test('main-city upgrades raise soldier power by ten percent per level from zero',()=>{
  const s=match(),p=G.playerView(s,0),shrine=p.buildings.find(b=>b.type==='shrine');
  const barracksPlot=emptyPlot(p),barracks=G.grantBuilding(p,'barracks',barracksPlot.x,barracksPlot.y,1);
  assert.equal(G.soldierBoost(p),1);assert.equal(G.soldierHP(p,barracks),44);assert.equal(G.soldierDamage(p,barracks),18);
  shrine.level=2;shrine.hp=G.maxHP(shrine);
  assert.equal(G.soldierBoost(p),1.1);assert.equal(G.soldierHP(p,barracks),48);assert(Math.abs(G.soldierDamage(p,barracks)-19.8)<1e-9);
  shrine.level=15;shrine.hp=G.maxHP(shrine);
  assert(Math.abs(G.soldierBoost(p)-2.4)<1e-9);
});

test('well boosts every farm in its estate regardless of distance',()=>{
  const s=match(),p=G.playerView(s,0),farmPlot=emptyPlot(p,(x,y)=>G.terrain(x,y,p)==='shore');
  const farm=G.grantBuilding(p,'farm',farmPlot.x,farmPlot.y,1);assert(farm);assert.equal(G.income(p,farm),1);
  const wellPlot=emptyPlot(p,(x,y)=>G.dist8(x,y,farm.x,farm.y)>1),well=G.grantBuilding(p,'well',wellPlot.x,wellPlot.y,1);
  assert(well);assert.equal(G.income(p,farm),1.2);assert.equal(G.dryFarm(p,farm),false);
});

test('farm and mulberry construction costs rise from ten to one hundred twenty percent while upgrades stay fixed',()=>{
  assert.deepEqual(G.DEFS.farm.cost,{coins:75,materials:0});
  assert.deepEqual(G.DEFS.mulberry.cost,{coins:0,materials:65});
  for(const [type,terrain,costs,lastRefund] of [
    ['farm','shore',[8,24,41,57,74,90],{coins:36,materials:0}],
    ['mulberry','forest',[7,21,36,50,64,78],{coins:0,materials:31}]
  ]){
    const s=match(),p=G.playerView(s,0);p.coins=p.materials=10000;
    const upgradeCost=G.upgradeCost({type,level:1});let last;
    for(const amount of costs){
      const cost=type==='farm'?{coins:amount,materials:0}:{coins:0,materials:amount};
      assert.deepEqual(G.buildCost(p,type),cost);
      const plot=emptyPlot(p,(x,y)=>G.terrain(x,y,p)===terrain),before={coins:p.coins,materials:p.materials};
      const result=G.build(p,type,plot.x,plot.y);assert(result.ok);last=result.building;assert.deepEqual(last.originCost,cost);
      assert.deepEqual({coins:before.coins-p.coins,materials:before.materials-p.materials},cost);
      assert.deepEqual(G.upgradeCost({type,level:1}),upgradeCost);
    }
    assert.deepEqual(G.demolish(p,last).refund,lastRefund);
  }
});

test('farm and mulberry production chains fully swap resources and ultimate prerequisites',()=>{
  for(const type of ['tea','inn','bank','mulberry','weaver','tailor'])assert.equal(G.DEFS[type].resource,'coins',type);
  for(const type of ['farm','mill','wine','quarry','kiln','trade'])assert.equal(G.DEFS[type].resource,'materials',type);
  assert.deepEqual(G.DEFS.guild.required,['bank','tailor']);
  assert.deepEqual(G.DEFS.port.required,['wine','trade']);
  assert.deepEqual([G.DEFS.guild.resource,G.DEFS.guild.auraResource],['coins','coins']);
  assert.deepEqual([G.DEFS.port.resource,G.DEFS.port.auraResource],['materials','materials']);
});

test('version-eight saves are discarded',()=>{
  const s=match(),raw=JSON.parse(G.serialize(s));raw.version=8;
  assert.equal(G.VERSION,9);assert.equal(G.restore(JSON.stringify(raw)),null);
});
