'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const {run, summary} = require('../scripts/estate-balance-sim.js');
const close = (actual, expected) => assert(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

function incomeScene(level, day, capped, placements) {
  const s = G.createState(null);s.day=day;
  for (const [type,x,y] of placements) assert(G.grantBuilding(s,type,x,y,level), `${type} at ${x},${y}`);
  // Grants bypass economic terrain and construction limits, so validate the latter here.
  for (const b of s.buildings) {
    const d = G.DEFS[b.type], peers = s.buildings.filter(n=>n.type===b.type);
    if (d.limit) assert(peers.length<=d.limit, b.type+' limit');
    if (d.radius) assert(peers.every(n=>n===b || G.dist8(n.x,n.y,b.x,b.y)>d.radius), b.type+' spacing');
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
    const cells = G.DEFS[middle].radius===1
      ? [[7,3],[8,3],[9,3],[7,4],[9,4],[7,5],[8,5],[9,5]]
      : [[6,2],[8,3],[10,2],[6,4],[10,4],[6,6]];
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
    assert.equal(G.DEFS[end].income,40);
    assert.equal(G.DEFS[end].resource,G.DEFS[ultimate].resource);
    for (let level=1;level<=9;level++) for (const day of [1,7]) for (const capped of [false,true]) {
      const supplied=incomeScene(level,day,capped,[
        [end,9,4],[middle,8,4],[middle,11,4],[middle,8,7],
        [start,7,4],[start,12,4],[start,7,7]
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
      if (capped) close(endpointRate,40*G.incomeFactor({type:end,level})*3*(day===7?1.25:1));
    }
  }
});

test('income keeps the first three levels and tempers ordinary and shrine growth', () => {
  const s = G.createState(null);
  for (const d of Object.values(G.DEFS).filter(d => d.income)) {
    for (const [level, multiple] of [[1,1],[2,2],[3,4]]) {
      const b = {type:d.id, level, x:0, y:0};
      close(G.income(s,b), d.income * multiple);
    }
    for (let level=4; level<=G.maxLevel({type:d.id}); level++) {
      const multiple = d.id === 'shrine' ? 4 + level - 3 : 4 * 1.65 ** (level - 3);
      close(G.income(s,{type:d.id,level,x:0,y:0}), d.income * multiple);
    }
  }
  close(G.income(s,{type:'shrine',level:15,x:0,y:0}), 6.4);
});

test('upgrade premiums begin after economic level four and shrine level seven', () => {
  for (const d of Object.values(G.DEFS).filter(d => d.id !== 'fortune')) {
    for (let level=1; level<G.maxLevel({type:d.id}); level++) {
      const base = d.upgradeBase || d.cost;
      const growth = d.id === 'shrine' ? 1.65 : 2.15;
      const premium = d.id === 'shrine' ? 1.08 ** Math.max(0,level-7) : d.cat === 'economy' ? 1.12 ** Math.max(0,level-4) : 1;
      const expected = {};
      for (const resource of ['coins','materials']) expected[resource] = Math.ceil(base[resource] * 1.8 * growth ** (level-1) * premium);
      assert.deepEqual(G.upgradeCost({type:d.id,level}), expected, `${d.id} Lv${level}`);
    }
  }
});

test('later upgrades require progressively longer production time', () => {
  const s = G.createState(null);
  for (const d of Object.values(G.DEFS).filter(d => d.income)) {
    let previous = 0;
    for (let level=3; level<G.maxLevel({type:d.id}); level++) {
      const b = {type:d.id,level,x:0,y:0}, cost = G.upgradeCost(b);
      // Combined resource cost measures the burden on equal coin/material production.
      const seconds = (cost.coins + cost.materials) / G.income(s,b);
      assert(seconds > previous, `${d.id} Lv${level} should take longer to fund`);
      if (previous) {
        const ratio = seconds / previous;
        assert(ratio > 1.2 && ratio < (d.id === 'shrine' ? 1.85 : 1.5), `${d.id} Lv${level} wait ratio ${ratio}`);
      }
      previous = seconds;
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
    close(1e8-enemy.hp, 22 * 2 ** (level-1));
  }
});

test('enemy growth preserves the first fourteen days and accelerates the later exponential segments', () => {
  const enemies = new Map();
  for (let day=1; day<=31; day++) {
    const s = G.createState(null);s.day=day;G.startNight(s);G.step(s,.25);G.step(s,.25);
    const enemy = s.enemies[0];assert(enemy);assert.equal(enemy.type,'bandit');
    enemies.set(day,enemy);
    const late=Math.max(0,day-14),opening=Math.min(1,(day-1)/9);
    close(enemy.maxHp,100*(.45+.55*opening)*1.23**Math.min(13,day-1)*1.24**Math.min(7,late)*1.18**Math.max(0,late-7)*(1+.08*late));
    close(enemy.damage,14*(.3+.7*opening)*1.12**Math.min(13,day-1)*1.15**Math.min(7,late)*1.12**Math.max(0,late-7)*(1+.04*late));
    if (day<=14) {
      const opening=Math.min(1,(day-1)/9);
      close(enemy.maxHp, 100 * 1.23 ** (day-1) * (.45+.55*opening));
      close(enemy.damage, 14 * 1.12 ** (day-1) * (.3+.7*opening));
      if(day>1) {
        assert(enemy.maxHp>enemies.get(day-1).maxHp);
        assert(enemy.damage>enemies.get(day-1).damage);
      }
    }
  }
  close(enemies.get(1).maxHp,45);close(enemies.get(1).damage,4.2);
  close(enemies.get(10).maxHp,100*1.23**9);close(enemies.get(10).damage,14*1.12**9);
  for (const [day,hp,damage] of [
    [15,100*1.23**13*1.24*1.08,14*1.12**13*1.15*1.04],
    [21,100*1.23**13*1.24**7*1.56,14*1.12**13*1.15**7*1.28],
    [30,100*1.23**13*1.24**7*1.18**9*2.28,14*1.12**13*1.15**7*1.12**9*1.64]
  ]) {
    close(enemies.get(day).maxHp,hp);close(enemies.get(day).damage,damage);
    assert(hp > enemies.get(14).maxHp && damage > enemies.get(14).damage);
  }
  const growth = (day,field) => enemies.get(day)[field] / enemies.get(day-1)[field];
  for (const field of ['maxHp','damage']) {
    assert(growth(22,field) < growth(21,field));
    assert(growth(31,field) > 1 && growth(31,field) < growth(22,field));
  }
});

test('opening waves ramp to the original counts and delay ghosts until day four and foxes until day five', () => {
  for(let day=1;day<=31;day++) {
    const s=G.createState(1);s.day=day;G.startNight(s);
    const oldTotal=Math.min(120,7+day*3+Math.floor(day/3)*2+(day%7===0?12:0));
    assert.equal(s.wave.total,Math.ceil(oldTotal*Math.min(1,.5+.5*(day-1)/9)),`day ${day}`);
    if(day<=5) {
      for(let tick=0;tick<400 && s.wave.spawned<3;tick++)G.step(s,.25);
      assert.equal(s.wave.spawned,3);
      assert.deepEqual(s.enemies.map(e=>e.type),day<4?['bandit','bandit','bandit']:day===4?['bandit','ghost','bandit']:['bandit','ghost','fox']);
    }
  }
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

test('five estate seeds survive three nights without skills, shrine damage, losses or gate breaches', () => {
  for(const seed of [1,7,42,73193,99991]) {
    const result=run(3,'balanced',seed,{useSkills:false}),label=`seed ${seed}`;
    assert.equal(result.stopReason,'completed',label);assert.equal(result.over,false,label);assert.equal(result.day,4,label);
    assert.equal(result.history.length,3,label);
    for(const h of result.history) {
      assert(h.complete,label);assert.equal(h.shrineMinHPRatio,1,label);
      assert.equal(h.nightDeaths,0,label);assert.equal(h.gateBreaks,0,label);assert(h.gateMinHPRatio>0,label);
      assert.deepEqual(h.skills,{thunder:0,repair:0,repel:0},label);
    }
    assert(result.actions.every(a=>a.kind!=='skill'),label);
  }
});

test('active estate play retains the measured opening baseline and faces middle-game pressure without rushing maximum levels', () => {
  for (const seed of [1,7,42,73193,99991]) {
    const nights=30;
    // Historical balance measurements belong to the original geography.
    const result = run(nights,'balanced',seed,{mapGeneration:1}), label = `seed ${seed}, ${nights} nights`;
    assert.equal(result.worldSize,25);assert.equal(result.stopReason,'defeat',label);
    assert.equal(result.over,true,label);assert(result.day>=15 && result.day<=30,label);
    assert.equal(result.history.filter(h=>h.complete).length,result.day-1,label);
    assert(result.history.filter(h=>h.day<=14).every(h=>h.complete),label);
    assert(result.firstLevel9Day === null || result.firstLevel9Day>=20,label);
    assert(result.history.filter(h=>h.day<20).every(h=>h.highestLevel<9),label);
    const day15 = result.history.find(h=>h.day===15);assert(day15);
    assert.equal(day15.complete,seed!==7,label);
    assert(day15.averageProductionLevel>=4 && day15.averageProductionLevel<=6.5,label);
    if (day15.complete) assert(day15.shrineLevel>=9 && day15.shrineLevel<=11,label);
    assert(day15.coinRate>0 && day15.coinRate<2000 && day15.materialRate>0 && day15.materialRate<2000,label);
    assert(result.history.some(h=>h.gateMinHPRatio<1),`${label}: gates take damage`);
    assert(result.history.some(h=>h.gateBreaks>0),`${label}: enemies breach gates`);
    assert(result.history.some(h=>h.shrineMinHPRatio>0 && h.shrineMinHPRatio<1),`${label}: shrine takes damage`);
    for (const skill of ['thunder','repair','repel']) assert(result.history.some(h=>h.skills[skill]>0),`${label}: ${skill} used`);
    const report = summary(result);
    assert.equal(report.stopReason,result.stopReason);
    assert(report.milestones.some(h=>h.day===result.day && !h.complete),label);
  }
});

test('estate survival requires skills and investment in both economy and defense', () => {
  const passive = run(20,'balanced',1,{useSkills:false});
  assert.equal(passive.stopReason,'defeat');assert(passive.day<20);
  assert(passive.history.every(h=>Object.values(h.skills).every(n=>n===0)));
  for (const style of ['economy','defense']) {
    const result = run(30,style,1);
    assert.equal(result.stopReason,'defeat',style);assert(result.day<20,style);
  }
});

test('adding a third tower per gate on day fifteen improves long-term survival', () => {
  const ordinary = run(30,'balanced',1,{mapGeneration:1});
  const reinforced = run(30,'balanced',1,{mapGeneration:1,towersPerGate:3,reinforcementDay:15});
  assert.equal(ordinary.stopReason,'defeat');assert.equal(reinforced.stopReason,'defeat');
  assert(reinforced.day>ordinary.day && reinforced.seconds>ordinary.seconds);
  assert.deepEqual(reinforced.history.filter(h=>h.day<15),ordinary.history.filter(h=>h.day<15));
  assert.equal(reinforced.layout.reinforcements.length,4);
  const added = reinforced.layout.reinforcements.map(p=>reinforced.actions.find(a=>a.kind==='build' && a.type==='tower' && a.x===p.x && a.y===p.y));
  assert(added.every(a=>a && a.day>=15));
});
