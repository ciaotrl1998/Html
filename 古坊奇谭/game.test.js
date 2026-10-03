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
  build(s,'farm',4,8);assert.equal(G.build(s,'mill',5,9).ok,false);build(s,'mill',5,8);build(s,'wine',6,8);
  assert.equal(G.build(s,'home',5,8).ok,false);assert.equal(G.build(s,'shrine',9,8).ok,false);
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
  const s=rich();build(s,'tea',9,8);build(s,'inn',9,9);build(s,'bank',9,10);
  build(s,'tea',10,9);build(s,'inn',10,10);build(s,'bank',10,11);
  assert.equal(G.terminalCount(s,9,11),1);assert.match(G.buildReason(s,'guild',9,11),/1\/2/);
  build(s,'farm',6,11);build(s,'mill',7,11);const wine=build(s,'wine',8,11);
  const guild=build(s,'guild',9,11);assert.equal(guild.level,1);assert.equal(G.upgrade(s,guild).ok,false);
  assert(G.rates(s).coins>Object.values(s.buildings).reduce((a,b)=>a+(G.DEFS[b.type].income||0),0));
  G.demolish(s,guild);assert.match(G.buildReason(s,'port',9,11),/2\/3/);
  build(s,'quarry',11,12);build(s,'kiln',10,12);build(s,'trade',9,12);const port=build(s,'port',9,11);
  G.demolish(s,wine);assert(G.income(s,port)>=39*1.1);assert(s.buildings.includes(port));
});
test('support bonuses affect the intended buildings only',()=>{
  const s=rich(),farm=build(s,'farm',4,8),tea=build(s,'tea',6,8);
  const baseline=G.income(s,farm);build(s,'well',4,9);assert(Math.abs(G.income(s,farm)-baseline*1.2)<.001);
  build(s,'home',5,8);assert(Math.abs(G.income(s,farm)-baseline*1.3)<.001);assert(Math.abs(G.income(s,tea)-3.3)<.001);
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
  const s=rich();s.incense=300;assert.equal(G.skill(s,'repair').ok,false);G.dusk(s);G.startNight(s);
  const base=s.buildings[0];base.hp=900;assert(G.skill(s,'repair').ok);assert.equal(base.hp,1530);assert.equal(s.incense,255);assert.equal(G.skill(s,'repair').ok,false);
  assert.equal(G.skill(s,'thunder').ok,false);
  for(const [x,y]of [[6,6],[7,6],[8,6],[9,6],[6,7],[7,7]])build(s,'home',x,y);
  build(s,'tao',9,7);advance(s,1);const hp=s.enemies[0].hp;assert(G.skill(s,'repel').ok);assert.equal(s.enemies[0].hp,hp-20);assert(s.enemies[0].repelled>0);assert(G.skill(s,'thunder').ok);assert.equal(s.enemies.length,0);
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
