'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const close = (a, b) => assert(Math.abs(a-b) <= 1e-8*Math.max(1,Math.abs(b)), `${a} != ${b}`);
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

function enemy(s,x,y,extra={}) {
  const e = {id:s.nextId++,type:'bandit',x,y,hp:100000,maxHp:100000,damage:14,speed:.65,
    attack:0,repelled:0,slowed:0,slowFactor:1,laneX:0,laneY:0,path:[],pathRevision:-1,...extra};
  s.enemies.push(e);return e;
}
function scene(level=1) {
  const s=G.createState(null),b=G.grantBuilding(s,'barracks',8,7,level);assert(b);
  s.coins=s.materials=1e12;s.buildings[0].level=15;s.buildings[0].hp=G.maxHP(s.buildings[0]);
  G.startNight(s);s.wave.timer=1e6;
  return {s,b,u:s.soldiers[0]};
}
function advance(s,seconds,dt=.1) {
  for(let i=0;i<Math.round(seconds/dt);i++) G.step(s,dt);
}
function checkedStep(s,dt=.1) {
  const before=s.soldiers.map(u=>({u,x:u.x,y:u.y}));G.step(s,dt);
  for(const {u,x,y} of before) {
    let lastX=Math.round(x),lastY=Math.round(y);
    const samples=Math.max(20,Math.ceil(Math.hypot(u.x-x,u.y-y)/.01));
    for(let i=0;i<=samples;i++) {
      const px=x+(u.x-x)*i/samples,py=y+(u.y-y)*i/samples,tx=Math.round(px),ty=Math.round(py);
      assert(px>=0&&py>=0&&px<=G.worldSize(s)-1&&py<=G.worldSize(s)-1,'movement stays in bounds');
      assert(G.walkable(s,tx,ty),`movement crosses blocked tile ${tx},${ty}`);
      if(tx!==lastX&&ty!==lastY) assert(G.walkable(s,tx,lastY)&&G.walkable(s,lastX,ty),'no corner cutting');
      lastX=tx;lastY=ty;
    }
  }
}

test('public soldier stats scale at every level, including global defense boost',()=>{
  const s=G.createState(null);
  for(let level=1;level<=9;level++) {
    const b={type:'barracks',level};assert.equal(G.soldierLimit(b),level);
    assert.equal(G.soldierHP(b),Math.round(120*G.hpFactor(b)));
    close(G.soldierDamage(s,b),18*G.factor(b));
  }
  assert(G.grantBuilding(s,'tao',9,8,3));
  for(let level=1;level<=9;level++) close(G.soldierDamage(s,{level}),18*2**(level-1)*1.6);
});

test('first night automatically musters level units and idle nights retain real entities',()=>{
  const s=G.createState(null),b=G.grantBuilding(s,'barracks',8,7,3);assert(b);
  assert.deepEqual(s.soldiers,[]);s.time=G.DAY-.1;G.step(s,.1);assert.equal(s.phase,'dusk');
  advance(s,G.DUSK,.25);assert.equal(s.phase,'night');assert.equal(s.day,1);
  assert.equal(s.soldiers.length,3);assert.equal(b.musteredCount,3);
  const units=s.soldiers.map(u=>({...u,path:[...u.path]}));s.wave.timer=1e6;
  advance(s,3);assert.deepEqual(s.soldiers,units);assert.deepEqual(s.enemies,[]);
  assert(s.soldiers.every(u=>u.barracksId===b.id&&u.hp===G.soldierHP(b)&&u.maxHp===u.hp));
  assert.equal(new Set([...s.buildings,...s.soldiers].map(n=>n.id)).size,s.buildings.length+3);
});

test('night build and grant muster immediately; day build waits for night',()=>{
  const s=G.createState(null);s.coins=s.materials=10000;
  const first=G.build(s,'barracks',8,7);assert(first.ok);assert.equal(s.soldiers.length,0);
  G.startNight(s);assert.equal(s.soldiers.length,1);
  const second=G.build(s,'barracks',9,7);assert(second.ok);
  assert.equal(second.building.musteredCount,1);assert.equal(s.soldiers.length,2);
  const third=G.grantBuilding(s,'barracks',10,7,4);assert(third);
  assert.equal(third.musteredCount,4);assert.equal(s.soldiers.filter(u=>u.barracksId===third.id).length,4);
});

test('zero time pauses movement, attacks and recruitment without changing state',()=>{
  const {s,u}=scene();enemy(s,u.x+.6,u.y);
  const before=G.serialize(s);
  for(const dt of [0,-1,NaN,Infinity]) G.step(s,dt);
  assert.equal(G.serialize(s),before);
  G.step(s,.1);assert(s.enemies[0].hp<100000);
});

test('both units hurt HP immediately then at one second, including the cooldown epsilon',()=>{
  const {s,b,u}=scene();u.x=9;u.y=8;const e=enemy(s,9.6,8);
  G.step(s,.1);close(e.hp,100000-G.soldierDamage(s,b));close(u.hp,120-14);
  advance(s,.9);close(e.hp,100000-18);close(u.hp,106);
  G.step(s,.1);close(e.hp,100000-36);close(u.hp,92);
  u.attack=.1+5e-9;e.attack=.1+5e-9;
  G.step(s,.1);close(e.hp,100000-54);close(u.hp,78);
  assert.equal(u.attack,1);assert.equal(e.attack,1);
});

test('soldiers prefer the closest reachable enemy over array order, with no barracks range limit',()=>{
  const {s,b,u}=scene();u.x=16;u.y=0;
  const far=enemy(s,16,16,{repelled:1000}),near=enemy(s,16,7,{repelled:1000});
  assert(distance(b,near)>G.DEFS.barracks.range);
  G.step(s,.1);assert.equal(u.targetId,near.id);assert.notEqual(u.targetId,far.id);
  for(let i=0;i<200&&near.hp===near.maxHp;i++) checkedStep(s);
  assert(near.hp<near.maxHp,'unit actually arrives and attacks a distant target');
  assert(distance(u,near)<=.75);assert.equal(far.hp,far.maxHp);
});

test('unreachable closer enemies are skipped and water routes arrive without refreshes',()=>{
  const {s,u}=scene();u.x=0;u.y=8;
  const unreachable=enemy(s,2,8,{repelled:1000}),reachable=enemy(s,8,8,{repelled:1000});
  assert.equal(G.findSoldierPath(s,u,unreachable),null);
  const path=G.findSoldierPath(s,u,reachable);assert(path.length>8,'route detours around water');
  G.step(s,.1);assert.equal(u.targetId,reachable.id);
  const revision=s.revision;
  for(let i=0;i<600&&reachable.hp===reachable.maxHp;i++) checkedStep(s);
  assert.equal(s.revision,revision);assert(reachable.hp<reachable.maxHp,'detour reaches target');
  assert.equal(unreachable.hp,unreachable.maxHp);
});

test('unhurt enemies proactively pick the nearest soldier within one tile regardless of shrine distance',()=>{
  for(const point of [{x:9,y:8},{x:15,y:0}]) {
    const {s}=scene(2),[far,near]=s.soldiers;
    Object.assign(far,{x:point.x+.9,y:point.y,attack:1});
    Object.assign(near,{x:point.x+.6,y:point.y,attack:1});
    const e=enemy(s,point.x,point.y);G.step(s,.1);
    assert.equal(e.hp,e.maxHp,'enemy was not hit before choosing');
    assert.equal(e.soldierTargetId,near.id);close(near.hp,near.maxHp-14);assert.equal(far.hp,far.maxHp);
  }
});

test('being hit starts retaliation and a dead soldier releases the enemy toward the shrine',()=>{
  const {s,u}=scene();u.x=9;u.y=8;u.hp=1;const e=enemy(s,9.6,8);
  G.step(s,.1);assert(e.hp<e.maxHp);assert.equal(s.soldiers.length,0);
  assert.equal(e.soldierTargetId,undefined);assert.deepEqual(e.path,[]);assert.equal(e.pathRevision,-1);
  const shrine=s.buildings[0],hp=shrine.hp;advance(s,20);
  assert(shrine.hp<hp,'enemy resumes the main shrine route after its target dies');
});

test('undamaged enemies outside one tile continue attacking the shrine',()=>{
  const {s,u}=scene();u.x=9.7;u.y=7;u.attack=1;
  const e=enemy(s,9,8);assert(distance(e,u)>1);
  G.step(s,.1);assert.equal(e.hp,e.maxHp);assert.equal(e.soldierTargetId,undefined);
  assert.equal(e.path.at(-1).x,8);assert.equal(e.path.at(-1).y,8);
  // Remove the barracks through its public API so the shrine route can be observed alone.
  assert(G.demolish(s,s.buildings.find(b=>b.type==='barracks')).ok);
  const shrine=s.buildings[0],hp=shrine.hp;advance(s,4);assert(shrine.hp<hp);
});

test('walls block close aggro and blocked retaliation cannot attack through a corner',()=>{
  for(const retaliate of [false,true]) {
    const s=G.createState(42),b=G.grantBuilding(s,'barracks',12,11);assert(b);
    G.startNight(s);s.wave.timer=1e6;const u=s.soldiers[0];let pair;
    for(let y=1;y<24&&!pair;y++) for(let x=1;x<24&&!pair;x++) {
      if(G.walkable(s,x,y)&&G.walkable(s,x+1,y+1)&&(G.isWall(s,x+1,y)||G.isWall(s,x,y+1))) pair={x,y};
    }
    assert(pair,'estate exposes a blocked diagonal corner');
    u.x=pair.x+.6;u.y=pair.y+.6;u.attack=1;
    const e=enemy(s,pair.x+.4,pair.y+.4,retaliate?{soldierTargetId:u.id}:{});
    assert(distance(e,u)<.75);const hp=u.hp,buildings=s.buildings.map(b=>[b.id,b.hp]);
    G.step(s,.001);assert.equal(e.hp,e.maxHp);assert.equal(u.hp,hp);
    assert.deepEqual(s.buildings.map(b=>[b.id,b.hp]),buildings,'no attack through the wall');
    if(!retaliate) assert.equal(e.soldierTargetId,undefined);
  }
});

test('casualties consume the night quota; dawn and next night reset it',()=>{
  const {s,b}=scene(3);const dead=s.soldiers[0].id;s.soldiers[0].hp=0;
  advance(s,2);assert.equal(s.soldiers.length,2);assert.equal(b.musteredCount,3);
  assert(!s.soldiers.some(u=>u.id===dead));
  s.wave.spawned=s.wave.total;G.step(s,.1);
  assert.equal(s.phase,'day');assert.equal(s.day,2);assert.deepEqual(s.soldiers,[]);assert.equal(b.musteredCount,undefined);
  G.startNight(s);assert.equal(s.soldiers.length,3);assert.equal(b.musteredCount,3);
  assert(s.soldiers.every(u=>u.hp===u.maxHp&&u.id!==dead));
});

test('owner demolition and enemy destruction remove its units and enemy targets',()=>{
  for(const destroy of [false,true]) {
    const {s,b,u}=scene(2),other=G.grantBuilding(s,'barracks',10,7,1);assert(other);
    const e=enemy(s,8,6,{soldierTargetId:u.id});
    if(destroy) {
      b.hp=1;for(const unit of s.soldiers) {unit.x=16;unit.y=16;unit.attack=1;}
      G.step(s,.1);assert(!s.buildings.includes(b),'enemy destroys the owner');
    } else assert(G.demolish(s,b).ok);
    assert(s.soldiers.every(unit=>unit.barracksId===other.id));assert.equal(s.soldiers.length,1);
    assert.equal(e.soldierTargetId,undefined);
  }
});

test('night upgrades add only new slots, preserve wounded HP ratios and stop at level nine',()=>{
  const {s,b,u}=scene(2);s.soldiers[1].hp=0;G.step(s,.1);u.hp=u.maxHp*.37;
  u.x=10;u.y=8;u.attack=.6;const id=u.id;
  assert(G.upgrade(s,b).ok);assert.equal(b.level,3);assert.equal(b.musteredCount,3);assert.equal(s.soldiers.length,2);
  assert.equal(u.id,id);assert.equal(u.level,3);assert.equal(u.maxHp,G.soldierHP(b));close(u.hp,u.maxHp*.37);
  assert.equal(u.x,10);assert.equal(u.y,8);assert.equal(u.attack,.6);
  assert.equal(s.soldiers[1].hp,s.soldiers[1].maxHp);
  const result=G.bulkUpgrade(s,b);assert(result.ok);assert.equal(result.levels,6);
  assert.equal(b.level,9);assert.equal(b.musteredCount,9);assert.equal(s.soldiers.length,8);
  close(u.hp,G.soldierHP(b)*.37);close(G.soldierDamage(s,b),18*256);
  assert.equal(G.upgradeOptions(s,b).levels,0);assert.equal(G.upgrade(s,b).ok,false);
});

test('saves preserve quota, wounded units and enemy targets while resetting cached paths',()=>{
  const {s,b,u}=scene(3);s.soldiers[2].hp=0;G.step(s,.1);
  u.x=9.25;u.y=8.2;u.hp*=.42;u.attack=.63;
  const e=enemy(s,10,8,{soldierTargetId:u.id,chaseTile:'9,8',path:[{x:9,y:8}],pathRevision:s.revision});
  Object.assign(u,{targetId:e.id,targetTile:'10,8',path:[{x:10,y:8}],pathRevision:s.revision});
  let loaded=G.restore(G.serialize(s));assert(loaded);
  const savedUnit=loaded.soldiers.find(n=>n.id===u.id);
  for(const field of ['id','barracksId','x','y','hp','maxHp','level','attack','targetId']) assert.equal(savedUnit[field],u[field]);
  assert.equal(loaded.enemies[0].soldierTargetId,u.id);
  for(const unit of [...loaded.soldiers,...loaded.enemies]) {assert.deepEqual(unit.path,[]);assert.equal(unit.pathRevision,-1);}
  assert.equal(savedUnit.targetTile,undefined);assert.equal(loaded.enemies[0].chaseTile,undefined);
  const ids=loaded.soldiers.map(u=>u.id),hp=loaded.soldiers.map(u=>u.hp);
  for(let i=0;i<8;i++) {loaded=G.restore(G.serialize(loaded));assert(loaded);}
  assert.equal(loaded.buildings.find(n=>n.id===b.id).musteredCount,3);
  assert.deepEqual(loaded.soldiers.map(u=>u.id),ids);assert.deepEqual(loaded.soldiers.map(u=>u.hp),hp);
  loaded.enemies=[];loaded.wave.timer=1e6;advance(loaded,2);assert.equal(loaded.soldiers.length,2,'reload does not refill casualties');
  assert(loaded.nextId>Math.max(...loaded.buildings.map(b=>b.id),...ids,e.id));
});

test('legacy saves without units consume the current quota and recruit only on the next night',()=>{
  const {s,b}=scene(3),raw=JSON.parse(G.serialize(s));delete raw.soldiers;
  const owner=raw.buildings.find(n=>n.id===b.id);delete owner.musteredCount;owner.soldier={x:1,y:1};
  let loaded=G.restore(JSON.stringify(raw));assert(loaded);
  assert.deepEqual(loaded.soldiers,[]);assert.equal(loaded.buildings.find(n=>n.id===b.id).soldier,undefined);
  for(let i=0;i<4;i++) {loaded=G.restore(G.serialize(loaded));assert(loaded);advance(loaded,.2);}
  assert.equal(loaded.buildings.find(n=>n.id===b.id).musteredCount,3);assert.deepEqual(loaded.soldiers,[]);
  loaded.wave.spawned=loaded.wave.total;G.step(loaded,.1);G.startNight(loaded);assert.equal(loaded.soldiers.length,3);
  const day=G.createState(null);assert(G.grantBuilding(day,'barracks',8,7,2));
  const oldDay=JSON.parse(G.serialize(day));delete oldDay.soldiers;
  const migrated=G.restore(JSON.stringify(oldDay));assert(migrated);G.startNight(migrated);assert.equal(migrated.soldiers.length,2);
});

test('invalid IDs, owners, quota and unit stats are rejected rather than replenished',()=>{
  const {s,b,u}=scene(2);enemy(s,10,8);
  const mutations=[
    r=>r.soldiers.push({...r.soldiers[0]}),
    r=>r.soldiers[0].id=r.buildings[0].id,
    r=>r.soldiers[0].id=r.enemies[0].id,
    ...[0,-1,1.5,'6',Number.MAX_SAFE_INTEGER+1].map(value=>r=>r.soldiers[0].id=value),
    ...[99999,s.buildings[0].id,'2',null].map(value=>r=>r.soldiers[0].barracksId=value),
    r=>r.buildings.find(n=>n.id===b.id).musteredCount=1,
    r=>delete r.buildings.find(n=>n.id===b.id).musteredCount,
    ...[-1,3,.5,'2',null].map(value=>r=>r.buildings.find(n=>n.id===b.id).musteredCount=value),
    ...[0,-1,u.maxHp+1,null,'120'].map(value=>r=>r.soldiers[0].hp=value),
    r=>r.soldiers[0].maxHp++,r=>r.soldiers[0].level++,
    ...[-1,1.01,null,'0'].map(value=>r=>r.soldiers[0].attack=value),
    r=>r.soldiers[0].x=-1,r=>r.soldiers[0].y=17,
    r=>r.soldiers[0].targetId='7',r=>r.enemies[0].soldierTargetId=-1,
    r=>r.phase='day',r=>r.soldiers={},
    r=>r.soldiers.push({...r.soldiers[0],id:r.nextId++})
  ];
  for(const [index,mutate] of mutations.entries()) {
    const raw=JSON.parse(G.serialize(s));mutate(raw);
    assert.equal(G.restore(JSON.stringify(raw)),null,`invalid save mutation ${index}`);
  }
  const stale=JSON.parse(G.serialize(s));stale.soldiers[0].targetId=99999;stale.enemies[0].soldierTargetId=99998;
  const loaded=G.restore(JSON.stringify(stale));assert(loaded);
  assert.equal(loaded.soldiers[0].targetId,null);assert.equal(loaded.enemies[0].soldierTargetId,undefined);
});

test('20 seeds: actual soldiers cross live buildings, gates and bridges safely and reach targets without refreshes',()=>{
  let bridges=0;
  for(let i=0;i<20;i++) {
    const seed=Math.imul(i,2654435761)>>>0,s=G.createState(seed);
    const b=G.grantBuilding(s,'barracks',12,11,1);assert(b);
    const gate=s.buildings.find(b=>b.type==='gate'&&b.direction===i%4);
    const targetPoint=[{x:12,y:0},{x:24,y:12},{x:12,y:24},{x:0,y:12}][i%4];
    const plot=G.findSoldierPath(s,b,targetPoint).find(p=>G.owns(s,p.x,p.y)&&!G.at(s,p.x,p.y)&&!G.isWall(s,p.x,p.y)&&G.terrain(p.x,p.y,s)!=='water');
    assert(plot);const blocker=G.grantBuilding(s,'well',plot.x,plot.y);assert(blocker);
    G.startNight(s);s.wave.timer=1e6;const u=s.soldiers[0];
    const target=enemy(s,targetPoint.x,targetPoint.y,{repelled:1000});
    const path=G.findSoldierPath(s,u,target);assert(path&&path.length);
    assert(path.some(p=>p.x===gate.x&&p.y===gate.y),'route passes the live gate');
    assert(path.some(p=>p.x===blocker.x&&p.y===blocker.y),'route passes a live ordinary building');
    for(const p of path) if(G.terrain(p.x,p.y,s)==='water') {assert(G.estate(s).roads.has(p.y*25+p.x));bridges++;}
    const revision=s.revision,gateHP=gate.hp,blockerHP=blocker.hp;let crossedGate=false,crossedBuilding=false;
    for(let tick=0;tick<800&&target.hp===target.maxHp;tick++) {
      checkedStep(s);
      crossedGate ||= Math.round(u.x)===gate.x&&Math.round(u.y)===gate.y;
      crossedBuilding ||= Math.round(u.x)===blocker.x&&Math.round(u.y)===blocker.y;
    }
    assert.equal(s.revision,revision);assert.equal(gate.hp,gateHP);assert.equal(blocker.hp,blockerHP);
    assert(crossedGate&&crossedBuilding,`seed ${seed}: entity crosses occupied tiles`);
    assert(target.hp<target.maxHp,`seed ${seed}: reaches target rather than getting stuck at ${u.x},${u.y}`);
    assert(distance(u,target)<=.75);
  }
  assert(bridges>0,'seed sample exercises water crossed by bridge roads');
});
