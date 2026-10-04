'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const close = (actual, expected) => assert(Math.abs(actual-expected)<1e-8, `${actual} != ${expected}`);
const zero = {levels:0,cost:{coins:0,materials:0}};

function scene(seed=null, shrineLevel=15) {
  const s=G.createState(seed), shrine=s.buildings[0];
  shrine.level=shrineLevel;shrine.hp=G.maxHP(shrine);
  s.coins=s.materials=1e12;s.mission=G.MISSIONS.length;
  return s;
}
function grant(s,type,x,y,level=1) {
  const b=G.grantBuilding(s,type,x,y,level);assert(b,`${type} at ${x},${y}`);return b;
}
function cost(type,from,to) {
  const total={coins:0,materials:0};
  for(let level=from;level<to;level++) {
    const next=G.upgradeCost({type,level});
    for(const key of Object.keys(total)) total[key]+=next[key];
  }
  return total;
}
function flight(hp=100) {
  const s=scene(null,2), tower=grant(s,'tower',8,7);
  G.startNight(s);s.wave.spawned=s.wave.total;
  const enemy={id:s.nextId++,type:'bandit',x:8,y:6,hp,maxHp:hp,speed:.65,damage:14,attack:0,repelled:10,path:[],pathRevision:-1};
  s.enemies=[enemy];
  G.step(s,.1);assert.equal(enemy.hp,hp);assert.equal(s.projectiles.length,1);
  return {s,tower,enemy};
}

test('tower launch leaves HP intact and deals snapshot damage only after .3 seconds',()=>{
  const {s,tower,enemy}=flight(), arrow=s.projectiles[0];
  assert.equal(arrow.targetId,enemy.id);assert.equal(arrow.damage,22);
  assert.equal(arrow.life,.3);assert.equal(arrow.total,.3);
  G.step(s,.25);assert.equal(enemy.hp,100);close(arrow.life,.05);
  G.step(s,.049);assert.equal(enemy.hp,100);
  G.step(s,.001);assert.equal(enemy.hp,78);assert.equal(s.projectiles.length,0);
  assert(tower.cooldown>0);
});

test('upgrading or demolishing the source leaves an existing arrow damage unchanged',()=>{
  for(const action of ['upgrade','demolish']) {
    const {s,tower,enemy}=flight();
    assert(G[action](s,tower).ok);
    assert.equal(s.projectiles[0].damage,22);
    G.step(s,.25);G.step(s,.05);
    assert.equal(enemy.hp,78,action);assert.equal(s.projectiles.length,0);
  }
});

test('arrows follow moving targets and update both destination coordinates',()=>{
  const {s,enemy}=flight(), arrow=s.projectiles[0];
  enemy.repelled=0;enemy.laneX=0;enemy.laneY=0;
  enemy.x=7;enemy.y=6;
  const before={x:enemy.x,y:enemy.y};
  G.step(s,.1);
  assert(enemy.x!==before.x || enemy.y!==before.y);
  assert.equal(arrow.tx,enemy.x);assert.equal(arrow.ty,enemy.y);
  assert.notEqual(arrow.tx,8);assert.equal(enemy.hp,100);
  G.step(s,.2);assert.equal(enemy.hp,78);
});

test('dead or removed targets discard arrows without retargeting nearby enemies',()=>{
  for(const removed of [false,true]) {
    const {s,tower,enemy}=flight();tower.cooldown=100;
    const other={...enemy,id:s.nextId++,x:9,hp:100};
    s.enemies.push(other);
    if(removed) s.enemies=s.enemies.filter(e=>e!==enemy);
    else enemy.hp=0;
    G.step(s,.1);
    assert.equal(s.projectiles.length,0);assert.equal(other.hp,100);
    G.step(s,.2);assert.equal(other.hp,100);
    assert.equal(s.kills,removed?0:1);
  }
});

test('multiple lethal arrows collect one kill and reward once',()=>{
  const {s,tower,enemy}=flight(22);
  s.wave.spawned=s.wave.total-1;s.wave.timer=100;tower.cooldown=100;
  s.projectiles.push({...s.projectiles[0]});
  const coins=s.coins;
  G.step(s,.25);assert.equal(s.kills,0);
  G.step(s,.05);
  assert.equal(enemy.hp,0);assert.equal(s.kills,1);
  assert.equal(s.coins,coins+G.ENEMIES.bandit.reward);
  assert.equal(s.effects.filter(e=>e.type==='coin').length,1);
  assert.equal(s.projectiles.length,0);assert.equal(s.enemies.length,0);
  G.step(s,.1);assert.equal(s.kills,1);assert.equal(s.coins,coins+8);
});

test('pausing by withholding step preserves all flight state',()=>{
  const {s,enemy}=flight(), snapshot=structuredClone(s);
  // The simulation has no pause API: the caller pauses by not calling step.
  for(let frame=0;frame<60;frame++) assert.deepEqual(s,snapshot);
  assert.equal(enemy.hp,100);assert.equal(s.projectiles[0].life,.3);
  G.step(s,.25);G.step(s,.05);assert.equal(enemy.hp,78);
});

test('the last arrow kills before enemy attacks and then awards dawn once',()=>{
  const {s,enemy}=flight(22), shrine=s.buildings[0];
  enemy.x=8;enemy.y=7;enemy.repelled=1;enemy.damage=1e9;
  enemy.path=[{x:8,y:8}];enemy.pathRevision=s.revision;
  shrine.hp=1;
  // Put the enemy in attack position only on the impact tick.
  G.step(s,.25);assert.equal(s.phase,'night');assert.equal(s.kills,0);
  enemy.x=8;enemy.y=7;enemy.attack=0;enemy.repelled=0;
  const coins=s.coins;
  G.step(s,.05);
  assert.equal(s.over,false);assert.equal(shrine.hp,1);
  assert.equal(s.kills,1);assert.equal(s.day,2);assert.equal(s.phase,'day');
  assert.equal(s.coins,coins+8+56);assert.equal(s.projectiles.length,0);
  assert.equal(s.effects.filter(e=>e.type==='coin').length,1);
  assert.equal(s.events.filter(e=>e.kind==='reward').length,1);
});

test('saving in flight resumes only the remaining flight time',()=>{
  const {s,enemy}=flight();G.step(s,.1);
  const saved=JSON.parse(G.serialize(s));close(saved.projectiles[0].life,.2);
  const loaded=G.restore(JSON.stringify(saved));assert(loaded);
  const target=loaded.enemies.find(e=>e.id===enemy.id);
  // Restore resets building cooldowns; suppress new shots to isolate this arrow.
  for(const b of loaded.buildings) b.cooldown=100;
  assert.deepEqual(loaded.projectiles,saved.projectiles);
  G.step(loaded,.199);assert.equal(target.hp,100);
  G.step(loaded,.001);assert.equal(target.hp,78);assert.equal(loaded.projectiles.length,0);
});

test('restore rejects malformed arrows and enemies, skips absent targets and accepts old empty saves',()=>{
  const {s}=flight(), saved=JSON.parse(G.serialize(s));
  for(const patch of [
    {targetId:0},{targetId:1.5},{targetId:'3'},{damage:-1},{damage:'22'},
    {life:0},{life:-.1},{life:.31},{life:null},{total:.2},{x:-1},{ty:17},{type:'rock'}
  ]) {
    const bad=structuredClone(saved);Object.assign(bad.projectiles[0],patch);
    assert.equal(G.restore(JSON.stringify(bad)),null,JSON.stringify(patch));
  }
  for(const field of ['targetId','damage','life','total']) {
    const bad=structuredClone(saved);delete bad.projectiles[0][field];
    assert.equal(G.restore(JSON.stringify(bad)),null,field);
  }
  for(const speed of [0,-1,null,'0.65',undefined]) {
    const bad=structuredClone(saved);bad.enemies[0].speed=speed;
    assert.equal(G.restore(JSON.stringify(bad)),null,`speed ${speed}`);
  }
  for(const projectiles of [null,{},[null]]) {
    const bad=structuredClone(saved);bad.projectiles=projectiles;
    assert.equal(G.restore(JSON.stringify(bad)),null);
  }
  const missing=structuredClone(saved);missing.projectiles[0].targetId=9999;
  const skipped=G.restore(JSON.stringify(missing));assert(skipped);assert.deepEqual(skipped.projectiles,[]);
  for(const absent of [false,true]) {
    const old=structuredClone(saved);old.projectiles=[];
    if(absent) delete old.projectiles;
    const loaded=G.restore(JSON.stringify(old));assert(loaded);assert.deepEqual(loaded.projectiles,[]);
  }
});

test('upgrade preview ignores zero resources, sums next prices and never mutates state',()=>{
  const s=scene(), tower=grant(s,'tower',8,7);s.coins=s.materials=0;
  const before=structuredClone(s);
  assert.deepEqual(G.upgradeOptions(s,tower),{levels:8,cost:cost('tower',1,9)});
  assert.deepEqual(G.upgradeOptions(s,s.buildings[0]),zero);
  assert.deepEqual(s,before);
  const shrineScene=scene(null,1), shrine=shrineScene.buildings[0];
  shrineScene.coins=shrineScene.materials=0;
  const shrineBefore=structuredClone(shrineScene);
  assert.deepEqual(G.upgradeOptions(shrineScene,shrine),{levels:14,cost:cost('shrine',1,15)});
  assert.deepEqual(shrineScene,shrineBefore);
});

test('preview respects every shrine unlock and the highest adjacent predecessor',()=>{
  for(let level=1;level<=15;level++) {
    const s=scene(null,level), tower=grant(s,'tower',8,7);
    const unlocked=G.unlockedBuildingLevel(s);
    assert.deepEqual(G.upgradeOptions(s,tower),{levels:unlocked-1,cost:cost('tower',1,unlocked)});
  }
  const s=scene(), inn=grant(s,'inn',8,7);
  grant(s,'tea',6,7,9);assert.deepEqual(G.upgradeOptions(s,inn),zero);
  grant(s,'tea',7,6,3);grant(s,'tea',9,6,5);
  assert.deepEqual(G.upgradeOptions(s,inn),{levels:4,cost:cost('inn',1,5)});
});

test('both ultimate prerequisites cap preview at their minimum adjacent level',()=>{
  for(const type of ['guild','port']) {
    const s=scene(), b=grant(s,type,8,7), [a,c]=G.DEFS[type].required;
    grant(s,a,7,7,7);assert.deepEqual(G.upgradeOptions(s,b),zero);
    const neighbor=grant(s,c,9,7,4);
    assert.deepEqual(G.upgradeOptions(s,b),{levels:3,cost:cost(type,1,4)});
    neighbor.x=10;assert.deepEqual(G.upgradeOptions(s,b),zero);
  }
});

test('max, outside, gameover, null and missing buildings have zero options and atomic failure',()=>{
  for(const kind of ['max','outside','gameover','null','missing']) {
    const s=scene(), tower=grant(s,'tower',8,7);
    let b=tower;
    if(kind==='max') {tower.level=9;tower.hp=G.maxHP(tower);}
    if(kind==='outside') tower.x=-1;
    if(kind==='gameover') s.over=true;
    if(kind==='null') b=null;
    if(kind==='missing') b={...tower};
    const before=structuredClone(s);
    assert.deepEqual(G.upgradeOptions(s,b),zero,kind);
    const result=G.bulkUpgrade(s,b);
    assert.equal(result.ok,false);assert.equal(result.levels,0);
    assert.deepEqual(result.costspent,zero.cost);assert(result.reason);
    assert.deepEqual(s,before,kind);
  }
});

test('bulk upgrade stops at either exhausted resource and preserves damaged HP ratio',()=>{
  for(const resource of ['coins','materials']) {
    const s=scene(), tower=grant(s,'tower',8,7), budget=cost('tower',1,4);
    tower.hp=G.maxHP(tower)*.37;
    s[resource]=budget[resource];const before={coins:s.coins,materials:s.materials};
    const result=G.bulkUpgrade(s,tower);
    assert.equal(result.ok,true);assert.equal(result.levels,3);assert(result.reason);
    assert.deepEqual(result.costspent,budget);assert.equal(tower.level,4);
    close(tower.hp/G.maxHP(tower),.37);
    for(const key of ['coins','materials']) assert.equal(s[key],before[key]-budget[key]);
  }
  for(const resource of ['coins','materials']) {
    const s=scene(), tower=grant(s,'tower',8,7);s[resource]=G.upgradeCost(tower)[resource]-1;
    const before=structuredClone(s), result=G.bulkUpgrade(s,tower);
    assert.equal(result.ok,false);assert.equal(result.levels,0);assert(result.reason);
    assert.deepEqual(result.costspent,zero.cost);assert.deepEqual(s,before);
  }
});

test('four gates upgrade together for one price, full or partial, retaining full, damaged and broken ratios',()=>{
  for(const partial of [false,true]) {
    const s=scene(42), gates=s.buildings.filter(b=>b.type==='gate'), ratios=[1,.6,0,.23];
    gates.forEach((b,i)=>b.hp=G.maxHP(b)*ratios[i]);
    const targetLevel=partial?4:9, budget=cost('gate',1,targetLevel);
    if(partial) s.materials=budget.materials;
    const before=structuredClone(s);
    for(const gate of gates) assert.deepEqual(G.upgradeOptions(s,gate),{levels:8,cost:cost('gate',1,9)});
    assert.deepEqual(s,before);
    const result=G.bulkUpgrade(s,gates[2]);
    assert.equal(result.ok,true);assert.equal(result.levels,targetLevel-1);
    assert.deepEqual(result.costspent,budget);assert.equal(s.gateLevel,targetLevel);
    assert.equal(Boolean(result.reason),partial);
    gates.forEach((b,i)=>{assert.equal(b.level,targetLevel);close(b.hp/G.maxHP(b),ratios[i]);});
    for(const key of ['coins','materials']) assert.equal(s[key],before[key]-budget[key]);
  }
});
