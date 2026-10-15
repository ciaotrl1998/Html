'use strict';
const assert=require('node:assert/strict'),G=require('../js/game');require('../js/autoplay');
const {performance}=require('node:perf_hooks');
const s=G.createMatch({mode:'coop',enemyCount:6,mapSeed:42,rotation:0});
for(const p of s.players){p.controller='human';p.selectedSkill='thunder';const home=G.estate(G.playerView(s,p.id)).center;
 // Keep attacks on cooldown so this population benchmark measures a stable mixed army.
 // Arbitrary invulnerability is no longer valid: the game synchronizes real troop stats.
 for(let i=0;i<120;i++){const troopType=i%3===2?'archer':'infantry',level=troopType==='archer'?4:1,stats={troopType,level},hp=G.soldierHP(G.playerView(s,p.id),stats);
  s.soldiers.push({id:s.nextId++,owner:p.id,barracksId:99999,troopType,x:home.x,y:home.y,level,hp,maxHp:hp,baseDamage:G.soldierDamage(G.playerView(s,p.id),stats),attack:1e6,attackAt:0,targetBuildingId:null,targetOwner:null,targetId:null,repelled:0,slowed:0,slowFactor:1,waypoint:null});
 }
}
const times=[];for(let i=0;i<1800;i++){const t=performance.now();G.step(s,.1);times.push(performance.now()-t);}
times.sort((a,b)=>a-b);assert.equal(s.soldiers.length,960);assert(times[Math.floor(times.length*.95)]<50,'960-unit simulation keeps up with 20Hz scheduling');
const restored=G.restore(G.serialize(s));assert(restored);
console.log(JSON.stringify({scenario:'8 estates / 960 soldiers / 180 seconds',medianMs:times[900],p95Ms:times[1710],maxMs:times.at(-1),saveBytes:G.serialize(s).length}));
for(const mode of ['single','coop']){const state=G.createMatch({mode,enemyCount:mode==='coop'?6:4,mapSeed:73193});state.players[0].controller='autoplay';state.players[0].selectedSkill='thunder';
 const start=performance.now();let peak=0;
 for(let i=0;i<9000&&!state.over;i++){G.step(state,.1);peak=Math.max(peak,state.soldiers.length);}
 assert(state.players.every(p=>p.ai.decisions>0));assert(state.nextId>state.players.length*3);assert(G.restore(G.serialize(state)));
 console.log(JSON.stringify({scenario:mode+' AI match',seconds:state.elapsed,wallMs:performance.now()-start,peakUnits:peak,result:state.result,barracksBuilt:state.players.map(p=>p.ai.builds),lastActions:state.players.map(p=>p.ai.lastAction)}));
}
