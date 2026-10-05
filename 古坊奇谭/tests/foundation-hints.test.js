'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const close = (actual, expected) => assert(Math.abs(actual-expected)<1e-8, `${actual} != ${expected}`);
const zero = {levels:0,cost:{coins:0,materials:0}};

function scene(seed=null) {
  const s=G.createState(seed);
  s.coins=s.materials=0;s.mission=G.MISSIONS.length;
  return s;
}
function grant(s,type,x,y,level=1) {
  const b=G.grantBuilding(s,type,x,y,level);assert(b,`${type} at ${x},${y}`);return b;
}
function hints(s,x,y) {
  const before=structuredClone(s), result=G.buildHints(s,x,y);
  const candidates=Object.values(G.DEFS).filter(d=>d.cat==='economy' && (d.tier>=1 || d.required));
  assert.deepEqual(result.map(h=>h.type).sort(),candidates.filter(d=>G.buildReason(s,d.id,x,y,true)==='').map(d=>d.id).sort());
  assert.equal(new Set(result.map(h=>h.type)).size,result.length);
  for(const h of result) {
    const d=G.DEFS[h.type];
    assert.deepEqual(h,{type:d.id,resource:d.resource,tier:d.required?3:d.tier});
    assert.equal(G.buildReason(s,h.type,x,y,true),'');
    assert(G.buildReason(s,h.type,x,y),'zero resources still block actual construction');
  }
  assert.deepEqual(s,before);
  return result;
}

test('all four chain middles and endpoints expose resource and tiers without funds, including diagonal prerequisites',()=>{
  for(const [start,middle,end] of G.chains) for(const [type,prev,tier] of [[middle,start,1],[end,middle,2]]) {
    const s=scene();grant(s,prev,7,3);
    assert(hints(s,8,4).some(h=>h.type===type && h.tier===tier && h.resource===G.DEFS[type].resource));
    assert(!hints(s,9,4).some(h=>h.type===type),'distance two is not adjacent');
    assert(!hints(s,8,4).some(h=>h.type===start),'starters are not hints');
  }
});

test('both ultimate hints require every named endpoint, symmetrically for coins and materials',()=>{
  for(const type of ['guild','port']) for(const reverse of [false,true]) {
    const s=scene(), required=[...G.DEFS[type].required];if(reverse) required.reverse();
    const a=grant(s,required[0],7,3);
    assert(!hints(s,8,4).some(h=>h.type===type));
    const b=grant(s,required[1],9,5);
    assert(hints(s,8,4).some(h=>h.type===type && h.tier===3));
    b.x=10;assert(!hints(s,8,4).some(h=>h.type===type));
    b.x=9;a.x=6;assert(!hints(s,8,4).some(h=>h.type===type));
  }
});

test('hints retain all legal resource candidates for actual preview income selection',()=>{
  const s=scene();
  for(const [type,x,y] of [['tea',7,3],['bank',9,3],['wine',9,4],['mulberry',9,5],['tailor',7,5],['trade',7,4]]) grant(s,type,x,y);
  const result=hints(s,8,4);
  assert.deepEqual(result.map(h=>h.type).sort(),['guild','inn','port','weaver']);
  for(const resource of ['coins','materials']) {
    const candidates=result.filter(h=>h.resource===resource);
    assert.deepEqual(candidates.map(h=>h.tier).sort(),[1,3]);
  }
  for(const [start,prev,end,resource] of [['tea','mill','wine','coins'],['mulberry','kiln','trade','materials']]) {
    const state=scene();grant(state,start,7,3);grant(state,prev,9,3);
    const candidates=hints(state,8,4).filter(h=>h.resource===resource);
    assert.deepEqual(candidates.map(h=>h.tier).sort(),[1,2]);
    const preview={type:end,x:8,y:4,level:1};
    assert(G.income({...state,buildings:[...state.buildings,preview]},preview)>G.DEFS[start].income);
  }
});

test('real preview incomes reverse base rankings through multiple prerequisites and include ultimate self aura',()=>{
  for(const [entries,winner,loser,expected] of [
    [[['tea',7,3],['mulberry',9,3,3],['mulberry',9,4,3],['mulberry',9,5,3]],'weaver','inn',6.6],
    [[['mill',7,3,3],['mill',7,4,3],['mill',7,5,3],['kiln',9,3]],'wine','trade',52.8],
    [[['bank',7,3,4],['wine',7,5],['tailor',9,3],['trade',9,5]],'guild','port',391.2]
  ]) {
    const s=scene();for(const [type,x,y,level=1] of entries) grant(s,type,x,y,level);
    const before=structuredClone(s), candidates=hints(s,8,4);
    const incomes=candidates.map(h=>{
      const preview={type:h.type,x:8,y:4,level:1};
      return {...h,income:G.income({...s,buildings:[...s.buildings,preview]},preview)};
    });
    const win=incomes.find(h=>h.type===winner), lose=incomes.find(h=>h.type===loser);
    assert(G.DEFS[winner].income<G.DEFS[loser].income);
    close(win.income,expected);assert(win.income>lose.income);
    assert.equal(incomes.reduce((best,h)=>h.income>best.income?h:best).type,winner);
    if(winner==='guild') {
      close(lose.income,390);
      const preview={type:winner,x:8,y:4,level:1};
      close(G.income(s,preview),379.2);assert(G.income(s,preview)<lose.income);
    }
    assert.deepEqual(s,before);
  }
});

test('hints enforce each candidate count limit and inclusive spacing radius',()=>{
  for(const d of Object.values(G.DEFS).filter(d=>d.cat==='economy' && (d.tier>=1 || d.required))) {
    const s=scene();
    const required=d.required || [d.prev];
    required.forEach((type,i)=>grant(s,type,7+i*2,3));
    assert(hints(s,8,4).some(h=>h.type===d.id),d.id);
    const peer=grant(s,d.id,8+d.radius,4);
    assert(!hints(s,8,4).some(h=>h.type===d.id),d.id+' inclusive radius');
    peer.x++;
    assert.equal(hints(s,8,4).some(h=>h.type===d.id),d.limit>1,d.id+' beyond radius');
    for(let i=1;i<d.limit;i++) grant(s,d.id,14,7+i);
    assert(!hints(s,8,4).some(h=>h.type===d.id),d.id+' count limit');
  }
});

test('hint legality covers terrain, water, occupancy, enemy radius, game over and invalid coordinates',()=>{
  const s=scene();grant(s,'tea',7,3);
  assert(hints(s,8,4).some(h=>h.type==='inn'));
  for(const [x,y] of [[12,4],[12,12]]) {
    grant(s,'tea',x-1,y);
    assert(!hints(s,x,y).some(h=>h.type==='inn'));
  }
  grant(s,'tea',3,4);assert.deepEqual(hints(s,3,5),[]);
  for(const [x,y] of [[-1,4],[17,4],[8.5,4],[NaN,4]]) assert.deepEqual(hints(s,x,y),[]);
  const b=grant(s,'tower',8,4);assert.deepEqual(hints(s,8,4),[]);
  s.buildings=s.buildings.filter(n=>n!==b);
  s.enemies=[{x:8.64,y:4}];assert.deepEqual(hints(s,8,4),[]);
  s.enemies[0].x=8.66;assert(hints(s,8,4).some(h=>h.type==='inn'));
  s.enemies=[];s.over=true;assert.deepEqual(hints(s,8,4),[]);
});

test('estate hints reject walls, gates and outside plots and match fund-free legality across saved maps',()=>{
  for(const seed of [1,42,73193]) {
    let s=scene(seed);grant(s,'tea',11,11);
    for(const state of [s,G.restore(G.serialize(s))]) {
      assert(state);
      for(let y=0;y<G.worldSize(state);y++) for(let x=0;x<G.worldSize(state);x++) hints(state,x,y);
      for(const key of G.estate(state).walls) assert.deepEqual(G.buildHints(state,key%25,Math.floor(key/25)),[]);
      for(const gate of G.estate(state).gates) assert.deepEqual(G.buildHints(state,gate.x,gate.y),[]);
      assert.deepEqual(G.buildHints(state,0,0),[]);
      assert(G.buildHints(state,12,10).some(h=>h.type==='inn'));
    }
  }
});

test('shrine and gates alternate from one to fifteen in either order with atomic costs and HP ratios',()=>{
  for(const first of ['shrine','gate']) {
    const s=scene(42), shrine=s.buildings[0], gates=s.buildings.filter(b=>b.type==='gate'), ratios=[1,.6,0,.23];
    s.coins=s.materials=1e12;shrine.hp=G.maxHP(shrine)*.37;
    gates.forEach((b,i)=>b.hp=G.maxHP(b)*ratios[i]);
    for(let level=2;level<=15;level++) for(const type of [first,first==='shrine'?'gate':'shrine']) {
      const b=type==='shrine'?shrine:gates[level%4], price=G.upgradeCost(b), before=structuredClone(s);
      assert.deepEqual(G.upgradeOptions(s,b),{levels:1,cost:price});assert.deepEqual(s,before);
      assert(G.upgrade(s,b).ok);
      assert.equal(b.level,level);
      for(const resource of ['coins','materials']) assert.equal(s[resource],before[resource]-price[resource]);
      assert.equal(s.revision,before.revision+1);
      assert(Math.abs(shrine.level-s.gateLevel)<=1);
      assert(gates.every(g=>g.level===s.gateLevel));
      close(shrine.hp/G.maxHP(shrine),.37);
      gates.forEach((g,i)=>close(g.hp/G.maxHP(g),ratios[i]));
      if(type===first && level<15) {
        const blocked=structuredClone(s);
        assert(G.upgradeReason(s,b,true));assert.deepEqual(G.upgradeOptions(s,b),zero);
        assert.equal(G.upgrade(s,b).ok,false);assert.deepEqual(s,blocked);
      }
    }
    for(const b of [shrine,...gates]) {
      assert.equal(G.maxLevel(b),15);assert.deepEqual(G.upgradeOptions(s,b),zero);
      const before=structuredClone(s);assert.equal(G.upgrade(s,b).ok,false);assert.deepEqual(s,before);
    }
    const loaded=G.restore(G.serialize(s));assert(loaded);
    assert.equal(loaded.buildings[0].level,15);assert.equal(loaded.gateLevel,15);
    assert(loaded.buildings.filter(b=>b.type==='gate').every(b=>b.level===15));
  }
});

test('foundation previews ignore funds but upgrades reject either shortage and bulk always fails atomically',()=>{
  for(const seed of [null,42]) for(const resource of ['coins','materials']) {
    const s=scene(seed);
    for(const b of s.buildings) {
      s.coins=s.materials=1000;const price=G.upgradeCost(b);s[resource]=price[resource]-1;
      const before=structuredClone(s);
      assert.deepEqual(G.upgradeOptions(s,b),{levels:1,cost:price});
      assert.equal(G.upgradeReason(s,b,true),'');assert(G.upgradeReason(s,b));
      assert.equal(G.upgrade(s,b).ok,false);assert.deepEqual(s,before);
      const result=G.bulkUpgrade(s,b);
      assert.equal(result.ok,false);assert.equal(result.levels,0);assert(result.reason);
      assert.deepEqual(result.costspent,zero.cost);assert.deepEqual(s,before);
    }
  }
  for(const seed of [null,42]) {
    const s=scene(seed);s.coins=s.materials=1e12;
    for(const b of s.buildings) {
      const before=structuredClone(s);assert.equal(G.bulkUpgrade(s,b).ok,false);assert.deepEqual(s,before);
    }
  }
});

test('legacy estate level gaps survive saves unchanged and only the lower foundation can catch up',()=>{
  for(const [shrineLevel,gateLevel] of [[15,1],[1,15],[9,3],[3,9]]) {
    const s=scene(42);s.coins=s.materials=1e12;s.gateLevel=gateLevel;
    for(const b of s.buildings) {b.level=b.type==='shrine'?shrineLevel:gateLevel;b.hp=G.maxHP(b)*.5;}
    let loaded=G.restore(G.serialize(s));assert(loaded);
    assert.equal(loaded.buildings[0].level,shrineLevel);assert.equal(loaded.gateLevel,gateLevel);
    while(Math.abs(loaded.buildings[0].level-loaded.gateLevel)>1) {
      const shrine=loaded.buildings[0], gate=loaded.buildings.find(b=>b.type==='gate');
      const lower=shrine.level<gate.level?shrine:gate, higher=lower===shrine?gate:shrine;
      assert(G.upgradeReason(loaded,higher,true));assert.deepEqual(G.upgradeOptions(loaded,higher),zero);
      const before=structuredClone(loaded);assert.equal(G.upgrade(loaded,higher).ok,false);assert.deepEqual(loaded,before);
      assert.deepEqual(G.upgradeOptions(loaded,lower),{levels:1,cost:G.upgradeCost(lower)});
      assert(G.upgrade(loaded,lower).ok);
      const levels=loaded.buildings.map(b=>b.level), stock=[loaded.coins,loaded.materials];
      loaded=G.restore(G.serialize(loaded));assert(loaded);
      assert.deepEqual(loaded.buildings.map(b=>b.level),levels);assert.deepEqual([loaded.coins,loaded.materials],stock);
      loaded.buildings.forEach(b=>close(b.hp/G.maxHP(b),.5));
    }
  }
});

test('no-estate shrine remains unrestricted while ordinary upgrades still use the old shrine requirements',()=>{
  const s=scene();s.coins=s.materials=1e12;assert.equal(G.estate(s),null);
  const shrine=s.buildings[0], tower=grant(s,'tower',8,7);
  for(let level=1;level<=15;level++) {
    assert.equal(shrine.level,level);
    assert.deepEqual(G.upgradeOptions(s,shrine),level===15?zero:{levels:1,cost:G.upgradeCost(shrine)});
    const unlocked=G.unlockedBuildingLevel(s);
    assert.equal(G.upgradeOptions(s,tower).levels,unlocked-1);
    if(level<15) assert(G.upgrade(s,shrine).ok);
  }
  const loaded=G.restore(G.serialize(s));assert(loaded);assert.equal(loaded.buildings[0].level,15);
  const estate=scene(42);estate.coins=estate.materials=1e12;
  const b=grant(estate,'barracks',12,11,3), base=estate.buildings[0];base.level=5;base.hp=G.maxHP(base);
  assert.equal(estate.gateLevel,1);assert.equal(G.upgradeReason(estate,b),'');assert(G.upgrade(estate,b).ok);
  assert.equal(b.level,4);assert(G.upgradeReason(estate,b,true));
});
