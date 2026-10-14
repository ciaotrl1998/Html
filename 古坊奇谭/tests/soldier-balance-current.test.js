'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../js/game');

const advance=(s,time,dt=.05)=>{for(let elapsed=0;elapsed<time-1e-8&&!s.over;elapsed+=dt)G.step(s,Math.min(dt,time-elapsed));};
function match(){const s=G.createMatch({mapSeed:42,rotation:0});for(const p of s.players){p.controller='human';p.selectedSkill='thunder';}return s;}
function add(s,owner,type='barracks',level=1){
  const p=G.playerView(s,owner),width=G.worldWidth(s);
  for(const k of G.estate(p).cells){const x=k%width,y=Math.floor(k/width);if(!G.at(s,x,y)&&!G.isWall(s,x,y)&&G.terrain(x,y,s)!=='water')return G.grantBuilding(p,type,x,y,level);}
  throw new Error('No buildable plot');
}

test('level-one barracks produces one soldier every five seconds and movement is capped at 0.8 tiles per second',()=>{
  const s=match(),b=add(s,0);
  assert.equal(G.soldierRate(b),1/5);assert.equal(G.soldierRate({level:9}),8/15);
  advance(s,4.9);assert.equal(s.soldiers.length,0);
  advance(s,.1);assert.equal(s.soldiers.length,1);
  const u=s.soldiers[0],start={x:u.x,y:u.y};advance(s,1);
  const distance=Math.hypot(u.x-start.x,u.y-start.y);
  assert(distance>.5&&distance<=G.SOLDIER_SPEED+1e-8,`moved ${distance} tiles`);
  advance(s,9);assert.equal(s.soldiers.filter(unit=>unit.barracksId===b.id).length,3);
});

test('a level-one soldier survives one level-one tower arrow and dies to the second',()=>{
  const s=match(),tower=add(s,1,'tower'),hp=G.soldierHP({level:1});
  assert.equal(hp,G.DEFS.tower.damage*2);
  const u={id:s.nextId++,owner:0,barracksId:99999,x:tower.x,y:tower.y,level:1,hp,maxHp:hp,baseDamage:18,attack:0,targetOwner:null,targetId:null,repelled:10,slowed:0,slowFactor:1,waypoint:null};
  s.soldiers.push(u);G.step(s,.05);assert.equal(s.projectiles.length,1);
  advance(s,.35);assert.equal(u.hp,G.DEFS.tower.damage);assert(s.soldiers.includes(u));
  advance(s,.5);assert.equal(s.projectiles.length,1);
  advance(s,.35);assert(!s.soldiers.includes(u));
});

test('old saved soldiers keep their health percentage under the new lower maximum',()=>{
  const s=match(),b=add(s,0);advance(s,5);const raw=JSON.parse(G.serialize(s)),u=raw.soldiers.find(unit=>unit.barracksId===b.id);
  u.maxHp=120;u.hp=60;
  const loaded=G.restore(JSON.stringify(raw)),migrated=loaded.soldiers.find(unit=>unit.id===u.id);
  assert.equal(migrated.maxHp,44);assert.equal(migrated.hp,22);
});

test('thunder has a two-minute cooldown',()=>{
  const s=match(),p=G.playerView(s,0);
  assert.equal(G.SKILLS.thunder.cooldown,120);
  assert(G.skill(p,'thunder').ok);
  assert.equal(p.cooldowns.thunder,120);
});
