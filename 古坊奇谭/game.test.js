'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./game.js');
const rich = () => { const s = G.createState(); s.coins = 100000; return s; };
const build = (s, t, x, y) => { const r = G.build(s, t, x, y); assert.equal(r.ok, true, t + ': ' + r.reason); return r.building; };
const advance = (s, seconds) => { for (let t = 0; t < seconds - .00001; t += .1) G.step(s, .1); };
test('26 buildings and four coherent terrain regions', () => {
  assert.equal(Object.keys(G.DEFS).length, 26);
  for (const type of ['water','forest','mountain']) {
    let block = false;
    for (let y=0;y<G.SIZE-2;y++) for(let x=0;x<G.SIZE-2;x++) if(Array.from({length:9},(_,i)=>G.terrain(x+i%3,y+Math.floor(i/3))).every(v=>v===type))block=true;
    assert(block, type+' must contain at least a 3×3 patch');
  }
  assert.equal(G.terrain(8,8), 'plain');
});
test('terrain restrictions, orthogonal predecessor, insufficient funds, occupied cells', () => {
  const s=rich();assert.equal(G.build(s,'farm',7,8).ok,false);assert.equal(G.build(s,'tea',2,7).ok,false);
  assert.match(G.buildReason(s,'farm',4,8),/需临水平地/); // Water itself is invalid.
  assert.match(G.buildReason(s,'farm',6,8),/需临水平地/); // Plain, but not orthogonally adjacent to water.
  build(s,'farm',5,8);assert.equal(G.build(s,'mill',6,9).ok,false);build(s,'mill',6,8);build(s,'wine',7,8);
  assert.equal(G.build(s,'home',6,8).ok,false);assert.equal(G.build(s,'shrine',9,8).ok,false);
  s.coins=0;assert.match(G.buildReason(s,'tower',9,8),/^差/);
});
test('upgrade propagation chooses highest adjacent predecessor and stops at level 3', () => {
  const s=rich(), a=build(s,'tea',6,7), b=build(s,'inn',7,7), c=build(s,'bank',8,7);
  assert.equal(G.upgrade(s,b).ok,false);assert(G.upgrade(s,a).ok);assert(G.upgrade(s,b).ok);assert(G.upgrade(s,c).ok);
  const other=build(s,'tea',7,6);G.upgrade(s,other);G.upgrade(s,other);assert(G.upgrade(s,b).ok);assert(G.upgrade(s,c).ok);assert.equal(G.upgrade(s,c).ok,false);
  assert.equal(a.level,2);assert.equal(c.level,3);
});
test('existing chains keep producing after their prerequisite is removed', () => {
  const s=rich(),a=build(s,'tea',6,7),b=build(s,'inn',7,7);G.demolish(s,a);
  assert(G.income(s,b)>0);assert.match(G.upgradeReason(s,b),/需邻茶肆/);
  const old=s.coins;advance(s,2);assert(s.coins>old);
});
test('ultimate prerequisites count distinct endpoint types, regardless of level', () => {
  const s=rich();build(s,'tea',9,7);build(s,'inn',9,8);build(s,'bank',9,9);
  assert.equal(G.terminalCount(s,9,10),1);assert.match(G.buildReason(s,'guild',9,10),/1\/2/);
  build(s,'farm',7,11);build(s,'mill',8,11);const wine=build(s,'wine',8,10);
  const guild=build(s,'guild',9,10);assert.equal(guild.level,1);assert.equal(G.upgrade(s,guild).ok,false);
  assert(G.rates(s).coins>Object.values(s.buildings).reduce((a,b)=>a+(G.DEFS[b.type].income||0),0));
  G.demolish(s,guild);assert.match(G.buildReason(s,'port',9,10),/2\/3/);
  build(s,'quarry',11,11);build(s,'kiln',10,11);build(s,'trade',10,10);const port=build(s,'port',9,10);
  G.demolish(s,wine);assert(G.income(s,port)>=39*1.1);assert(s.buildings.includes(port));
});
test('support bonuses affect the intended buildings only',()=>{
  const s=rich(),farm=build(s,'farm',5,8),tea=build(s,'tea',7,8);
  const baseline=G.income(s,farm);build(s,'well',5,9);assert(Math.abs(G.income(s,farm)-baseline*1.2)<.001);
  build(s,'home',6,8);assert(Math.abs(G.income(s,farm)-baseline*1.3)<.001);assert(Math.abs(G.income(s,tea)-3.3)<.001);
  build(s,'stage',7,9);assert(Math.abs(G.income(s,tea)-3.39)<.001);
});
test('daylight heals 5% every two seconds; dusk and night do not',()=>{
  const s=rich(),base=s.buildings[0];base.hp=900;advance(s,2.1);assert.equal(base.hp,990);
  G.dusk(s);advance(s,2.1);assert.equal(base.hp,990);G.startNight(s);advance(s,2.1);assert.equal(base.hp,990);
});
test('shortest paths stay orthogonal, bypass a single wall, and attack a complete enclosure',()=>{
  const s=rich(),e={x:8,y:2,type:'bandit',damage:14};const direct=G.findPath(s,e);assert.equal(direct.length,6);
  const wall=build(s,'fence',8,6);const around=G.findPath(s,e);assert(!around.some(p=>p.x===8&&p.y===6));
  let prev=e;for(const p of around){assert.equal(Math.abs(p.x-prev.x)+Math.abs(p.y-prev.y),1);prev=p;}
  G.demolish(s,wall);for(const [x,y] of [[8,7],[9,8],[8,9],[7,8]])build(s,'fence',x,y);
  assert(G.findPath(s,e).some(p=>G.at(s,p.x,p.y)?.type==='fence'));
  G.dusk(s);s.direction=0;G.startNight(s);advance(s,38);assert(s.buildings.some(b=>b.type==='fence'&&b.hp<G.maxHP(b))||s.buildings.length<5);
});
test('two arrow towers can complete the first night and grant dawn rewards',()=>{
  const s=rich();build(s,'tower',8,7);build(s,'tower',7,8);G.dusk(s);G.startNight(s);
  for(let i=0;i<1800&&s.phase==='night';i++)G.step(s,.1);
  assert.equal(s.over,false);assert.equal(s.day,2);assert.equal(s.phase,'day');assert.equal(s.kills,7);
});
test('skills enforce night, costs, cooldown and Taoist temple unlock',()=>{
  const s=rich();s.incense=300;assert.equal(G.skill(s,'repair').ok,false);
  for(const [x,y]of [[6,6],[7,6],[8,6],[9,6],[6,7],[7,7]])build(s,'home',x,y);
  build(s,'tao',9,7);G.dusk(s);G.startNight(s);
  const base=s.buildings[0];base.hp=900;assert(G.skill(s,'repair').ok);assert.equal(base.hp,1530);assert.equal(s.incense,255);assert.equal(G.skill(s,'repair').ok,false);
  advance(s,1);const hp=s.enemies[0].hp;assert(G.skill(s,'repel').ok);assert.equal(s.enemies[0].hp,hp-20);assert(s.enemies[0].repelled>0);assert(G.skill(s,'thunder').ok);assert.equal(s.enemies.length,0);
});
test('night blocks all construction, while dusk still permits preparation',()=>{
  const s=rich(),farm=build(s,'farm',5,8);G.dusk(s);
  const tower=build(s,'tower',7,7);assert.equal(G.build(s,'fence',6,6).ok,true);
  G.startNight(s);const before=s.coins,count=s.buildings.length;
  assert.match(G.buildReason(s,'farm',5,9),/夜晚不可建造/);
  assert.match(G.buildReason(s,'fence',6,5),/夜晚不可建造/);
  assert.equal(G.build(s,'fence',6,5).ok,false);
  assert.match(G.upgradeReason(s,tower),/夜晚不可升级/);
  assert.equal(G.upgrade(s,tower).ok,false);
  assert.match(G.demolish(s,farm).reason,/夜晚不可拆除/);
  assert.equal(s.coins,before);assert.equal(s.buildings.length,count);
});
test('festival awards and boss wave occur every seventh day',()=>{
  const s=rich();s.day=6;G.startNight(s);s.wave.spawned=s.wave.total;advance(s,.1);assert.equal(s.day,7);assert(s.events.some(e=>e.text.includes('上元灯会')));
  const base=s.buildings[0];assert.equal(G.income(s,base),1.25);base.hp=100000;G.startNight(s);assert(s.wave.boss);advance(s,60);assert(s.enemies.some(e=>e.boss));
});
test('main base destruction ends the game and freezes simulation',()=>{
  const s=rich();s.buildings[0].hp=1;G.startNight(s);advance(s,120);assert(s.over);const coins=s.coins;advance(s,10);assert.equal(s.coins,coins);
});
test('save restores construction, clock, enemies and cooldowns; rejects malformed data',()=>{
  const s=rich();build(s,'tea',7,8);G.startNight(s);advance(s,4);G.skill(s,'repel');
  const recovered=G.restore(G.serialize(s));assert(recovered);assert.equal(recovered.coins,s.coins);assert.equal(recovered.time,s.time);assert.equal(recovered.buildings.length,2);assert.equal(recovered.enemies.length,s.enemies.length);assert.equal(recovered.cooldowns.repel,s.cooldowns.repel);
  advance(recovered,2);assert(recovered.time>s.time);assert.equal(G.restore('{bad'),null);
  const duplicate=JSON.parse(G.serialize(s));duplicate.buildings.push({...duplicate.buildings[0]});assert.equal(G.restore(JSON.stringify(duplicate)),null);
  const corrupt=JSON.parse(G.serialize(s));corrupt.buildings[0].level=99;assert.equal(G.restore(JSON.stringify(corrupt)),null);
});
test('income settles once per building per second, with exact coin floating amounts',()=>{
  const s=rich();const tea=build(s,'tea',7,8);const before=s.coins,incense=s.incense;
  advance(s,.9);assert.equal(s.coins,before);assert.equal(s.incense,incense);assert.equal(s.effects.filter(e=>e.type==='income').length,0);
  advance(s,.1);assert.equal(s.coins,before+4);assert(Math.abs(s.incense-incense-.4)<1e-8);
  const floats=s.effects.filter(e=>e.type==='income');assert.equal(floats.length,2);assert.equal(floats.find(e=>e.buildingId===tea.id).amount,3);
  advance(s,.5);assert.equal(s.coins,before+4);assert(s.effects.find(e=>e.buildingId===tea.id).life<.5);
  advance(s,.5);assert.equal(s.coins,before+8);assert.equal(s.effects.filter(e=>e.type==='income').length,2);
});
test('each newly built building waits a full second before its first payout',()=>{
  const s=rich();advance(s,.8);const tea=build(s,'tea',7,8),before=s.coins;
  advance(s,.2);assert.equal(s.coins,before+1);assert(!s.effects.some(e=>e.buildingId===tea.id));
  advance(s,.8);assert.equal(s.coins,before+4);assert(s.effects.some(e=>e.buildingId===tea.id&&e.amount===3));
});
test('fractional income is retained across payouts, upgrades and save reloads',()=>{
  const s=rich(),tea=build(s,'tea',7,8);G.upgrade(s,tea);const before=s.coins;
  advance(s,1);assert.equal(s.effects.find(e=>e.buildingId===tea.id).amount,4);
  const copy=G.restore(G.serialize(s));assert(copy);advance(copy,19);
  // 4.95 × 20 = 99 tea coins, plus 20 coins from the shrine.
  assert.equal(copy.coins,before+119);
  const partial=rich();build(partial,'tea',7,8);advance(partial,.6);const amount=partial.coins;
  const restored=G.restore(G.serialize(partial));advance(restored,.3);assert.equal(restored.coins,amount);advance(restored,.1);assert.equal(restored.coins,amount+4);
});
test('v1 saves without income counters migrate without losing buildings or money',()=>{
  const s=rich();build(s,'tea',7,8);const old=JSON.parse(G.serialize(s));
  for(const b of old.buildings){delete b.incomeTime;delete b.coinPending;delete b.incensePending;}
  const restored=G.restore(JSON.stringify(old));assert(restored);assert.equal(restored.buildings.length,2);assert.equal(restored.coins,s.coins);
  advance(restored,1);assert.equal(restored.coins,s.coins+4);
});
