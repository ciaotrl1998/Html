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
  assert.equal(G.soldierRate(G.playerView(s,0)),1/5);
  advance(s,4.9);assert.equal(s.soldiers.length,0);
  advance(s,.1);assert.equal(s.soldiers.length,1);
  const u=s.soldiers[0],start={x:u.x,y:u.y};advance(s,1);
  const distance=Math.hypot(u.x-start.x,u.y-start.y);
  assert(distance>.5&&distance<=G.SOLDIER_SPEED+1e-8,`moved ${distance} tiles`);
  advance(s,9);assert.equal(s.soldiers.filter(unit=>unit.barracksId===b.id).length,3);
});

test('barracks levels retain exponential soldier health and attack while shrine level controls training time',()=>{
  const s=match(),p=G.playerView(s,0),shrine=p.buildings.find(b=>b.type==='shrine');
  for(let level=1;level<=9;level++){
    const b={type:'barracks',level};
    assert.equal(G.soldierHP(p,b),Math.round(110*2**(level-1)));
    assert.equal(G.soldierHP(b),Math.round(110*2**(level-1)));
    assert.equal(G.soldierDamage(p,b),20*2**(level-1));
    assert.equal(G.maxHP(b),Math.round(G.DEFS.barracks.hp*1.55**(level-1)));
  }
  assert.equal(G.soldierTrainingTime(1),5);assert.equal(G.soldierTrainingTime(15),1);
  shrine.level=15;shrine.hp=G.maxHP(shrine);
  assert.equal(G.soldierRate(p),1);
  assert.equal(G.soldierHP(p,{level:1}),110);assert.equal(G.soldierDamage(p,{level:1}),20);
});

test('both troop branches die on the fifth actual arrow from an equal-level tower at every level',()=>{
  for(const troopType of ['infantry','archer'])for(let level=troopType==='archer'?2:1;level<=9;level++){
    const s=match(),tower=add(s,1,'tower',level),hp=G.soldierHP({level,troopType}),damage=G.DEFS.tower.damage*G.factor(tower);
    assert.equal(hp,damage*5);
    const u={id:s.nextId++,owner:0,barracksId:99999,troopType,x:tower.x,y:tower.y,level,hp,maxHp:hp,baseDamage:20,attack:0,targetOwner:null,targetId:null,repelled:100,slowed:0,slowFactor:1,waypoint:null};
    s.soldiers.push(u);
    for(let hit=1;hit<=5;hit++){
      if(hit===1)advance(s,.05);else advance(s,.5);
      assert.equal(s.projectiles.length,1);advance(s,.35);
      assert.equal(u.hp,hp-hit*damage);assert.equal(s.soldiers.includes(u),hit<5);
    }
  }
});

test('each camp pauses at capacity, discards queued progress and replaces only casualties',()=>{
  const s=match(),a=add(s,0),b=add(s,0),enemy=add(s,1);
  advance(s,15);
  for(const camp of [a,b,enemy])assert.equal(G.barracksPopulation(s,camp),3);
  // Keep this isolated from travel and combat while checking long full-cap pauses.
  for(const u of s.soldiers)u.repelled=100;
  advance(s,20);assert.equal(s.soldiers.length,9);
  for(const camp of [a,b,enemy])assert.equal(camp.production,0);
  s.soldiers.find(u=>u.barracksId===a.id).hp=0;
  advance(s,4.9);assert.equal(G.barracksPopulation(s,a),2);assert.equal(G.barracksPopulation(s,b),3);
  advance(s,.1);assert.equal(G.barracksPopulation(s,a),3);
  advance(s,5);assert.equal(G.barracksPopulation(s,a),3);assert.equal(a.production,0);
});

test('levels add one slot, branch veterans share slots and saves preserve replacement progress',()=>{
  for(let level=1;level<=9;level++)assert.equal(G.barracksCapacity({level}),level+2);
  const s=match(),p=G.playerView(s,0),b=add(s,0);p.coins=p.materials=1e12;
  advance(s,15);for(const u of s.soldiers)u.repelled=100;
  const shrine=p.buildings.find(n=>n.type==='shrine');shrine.level=2;shrine.hp=G.maxHP(shrine);
  const training=G.soldierTrainingTime(2);
  assert(G.upgrade(p,b,{troopType:'archer'}).ok);
  advance(s,training);assert.equal(G.barracksPopulation(s,b),4);
  assert.equal(s.soldiers.filter(u=>u.troopType==='infantry').length,3);
  assert.equal(s.soldiers.filter(u=>u.troopType==='archer').length,1);
  s.soldiers[0].hp=0;advance(s,2);
  const loaded=G.restore(G.serialize(s));assert(loaded);
  advance(loaded,training-2.1);assert.equal(G.barracksPopulation(loaded,b),3);
  advance(loaded,.1);assert.equal(G.barracksPopulation(loaded,b),4);
});

test('over-cap legacy armies remain alive and cannot train until a slot opens',()=>{
  const s=match(),b=add(s,0);advance(s,15);
  const extra={...s.soldiers[0],id:s.nextId++,repelled:100};s.soldiers.push(extra);b.production=.99;
  const loaded=G.restore(G.serialize(s));assert(loaded);
  for(const u of loaded.soldiers)u.repelled=100;
  advance(loaded,10);assert.equal(G.barracksPopulation(loaded,b),4);
  const camp=loaded.buildings.find(n=>n.id===b.id);assert.equal(camp.production,0);
  loaded.soldiers[0].hp=0;advance(loaded,5);assert.equal(G.barracksPopulation(loaded,b),3);
  loaded.soldiers[0].hp=0;advance(loaded,5);assert.equal(G.barracksPopulation(loaded,b),3);
});

test('old saved soldiers keep their health percentage under the new higher maximum',()=>{
  const s=match(),b=add(s,0);advance(s,5);const raw=JSON.parse(G.serialize(s)),u=raw.soldiers.find(unit=>unit.barracksId===b.id);
  u.maxHp=120;u.hp=60;
  const loaded=G.restore(JSON.stringify(raw)),migrated=loaded.soldiers.find(unit=>unit.id===u.id);
  assert.equal(migrated.maxHp,110);assert.equal(migrated.hp,55);
});

test('thunder has a two-minute cooldown',()=>{
  const s=match(),p=G.playerView(s,0);
  assert.equal(G.SKILLS.thunder.cooldown,120);
  assert(G.skill(p,'thunder').ok);
  assert.equal(p.cooldowns.thunder,120);
});
