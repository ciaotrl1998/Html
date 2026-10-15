'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),G=require('../js/game');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function match(){const s=G.createMatch({mode:'coop',enemyCount:2,mapSeed:42,rotation:0});for(const p of s.players)p.controller='human';return s;}
function setLevel(s,owner,level){const p=G.playerView(s,owner);p.gateLevel=level;for(const b of p.buildings)if(b.type==='gate'){b.level=level;b.hp=G.maxHP(b);}return p;}
function advance(s,seconds){for(let t=0;t<seconds-1e-8;t+=.25)G.step(s,Math.min(.25,seconds-t));}
test('gate repair progression preserves the base and grows by 0.2 percentage points per level',()=>{
 for(let level=1;level<=15;level++)near(G.gateRepairRate(level),.02+(level-1)*.002);
 near(G.gateRepairRate(15),.048);near(G.gateRepairRate(16),.048);
});
test('gate level repairs only its own estate at the displayed rate without four-gate stacking',()=>{
 const s=match(),levels=[1,6,11,15],injured=[];
 levels.forEach((level,owner)=>{
  const p=setLevel(s,owner,level);
  for(const b of p.buildings){b.hp=G.maxHP(b)*.4;b.lastHit=-10;injured.push({b,before:b.hp,max:G.maxHP(b),rate:G.gateRepairRate(level)});}
 });
 advance(s,1);
 for(const {b,before,max,rate} of injured)near(b.hp-before,max*rate);
});
test('higher gate levels retain the ten-second repair delay, full-health cap and fixed repair skill',()=>{
 const s=match(),p=setLevel(s,0,15),b=p.buildings.find(b=>b.type==='shrine'),max=G.maxHP(b);
 b.hp=max*.5;b.lastHit=s.elapsed;
 advance(s,9.75);near(b.hp,max*.5);
 advance(s,.25);near(b.hp,max*(.5+.048*.25));
 b.hp=max-1;b.lastHit=-10;advance(s,1);near(b.hp,max);
 b.hp=max*.1;p.selectedSkill='repair';assert(G.skill(p,'repair').ok);near(b.hp,max*.45);
});
test('actual shared gate upgrade and save restoration retain the derived repair bonus',()=>{
 const s=match(),p=G.playerView(s,0);p.coins=p.materials=1e6;
 const gates=p.buildings.filter(b=>b.type==='gate');
 assert(G.upgrade(p,gates[0]).ok);assert.equal(p.gateLevel,2);assert(gates.every(b=>b.level===2));
 const loaded=G.restore(G.serialize(s));assert(loaded);
 near(G.gateRepairRate(G.playerView(loaded,0).gateLevel),.022);
 const shrine=G.playerView(loaded,0).buildings.find(b=>b.type==='shrine'),before=G.maxHP(shrine)*.5;
 shrine.hp=before;shrine.lastHit=-10;advance(loaded,1);near(shrine.hp-before,G.maxHP(shrine)*.022);
});
