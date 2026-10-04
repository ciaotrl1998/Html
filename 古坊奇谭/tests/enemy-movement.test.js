'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const seeds = Array.from({length:20},(_,i)=>Math.imul(i,2654435761)>>>0);
const directions = [[0,-1],[1,0],[0,1],[-1,0]];
const scenes = [
  ['generation 2',seed=>G.createState(seed,2)],
  ['generation 1',seed=>G.createState(seed,1)],
  ['legacy 17',seed=>{const s=G.createState(null);s.mapSeed=seed;return s;}]
];
function enemy(s,x,y,extra={}) {
  return {id:s.nextId++,type:'bandit',x,y,hp:10000,maxHp:10000,damage:14,speed:1.1,attack:0,repelled:0,slowed:0,slowFactor:1,laneX:.24,laneY:-.24,path:[],pathRevision:-1,...extra};
}
function night(s,enemies) {
  G.startNight(s);s.wave.spawned=s.wave.total;s.enemies=enemies;
}
function advance(s,seconds) {
  for(let i=0;i<Math.round(seconds*10);i++) G.step(s,.1);
}
function route(s,e,orthogonal=true) {
  let previous={x:Math.round(e.x),y:Math.round(e.y)};
  for(const p of e.path) {
    assert(Number.isInteger(p.x)&&Number.isInteger(p.y),'waypoints remain integer');
    const distance=Math.abs(p.x-previous.x)+Math.abs(p.y-previous.y);
    if(orthogonal) assert(distance<=1,'orthogonal route including repeated lane rejoin');
    assert(G.walkable(s,p.x,p.y));previous=p;
  }
}
function checkedStep(s,dt=.1) {
  const before=s.enemies.map(e=>({e,x:e.x,y:e.y}));
  G.step(s,dt);
  for(const {e,x,y} of before) {
    const clear=(tx,ty)=>G.walkable(s,tx,ty)&&!(G.at(s,tx,ty)?.hp>0);
    let lastX=Math.round(x),lastY=Math.round(y);
    for(let i=0;i<=20;i++) {
      const px=x+(e.x-x)*i/20,py=y+(e.y-y)*i/20,tx=Math.round(px),ty=Math.round(py);
      assert(px>=0&&py>=0&&px<=G.worldSize(s)-1&&py<=G.worldSize(s)-1,'map bounds');
      assert(clear(tx,ty),`blocked segment at ${tx},${ty}`);
      if(tx!==lastX&&ty!==lastY) assert(clear(tx,lastY)&&clear(lastX,ty),'no diagonal corner cutting');
      lastX=tx;lastY=ty;
    }
    route(s,e,false);
  }
}

for(const [name,create] of scenes) {
  test(`${name}: 20 seeds expose all five reachable dry spawn candidates in each direction`,()=>{
    for(const seed of seeds) for(let direction=0;direction<4;direction++) {
      const s=create(seed),size=G.worldSize(s),mid=G.worldCenter(s);
      assert.equal(size,name==='legacy 17'?17:25);
      const expected=Array.from({length:5},(_,i)=>{
        const pos=mid-2+i;
        return [{x:pos,y:0},{x:size-1,y:pos},{x:pos,y:size-1},{x:0,y:pos}][direction];
      });
      assert.deepEqual(G.spawnPlots(s,direction),expected,`${name} seed ${seed} direction ${direction}`);
      for(const p of expected) {
        assert.notEqual(G.terrain(p.x,p.y,s),'water');assert(G.walkable(s,p.x,p.y));
        const path=G.findPath(s,p);assert(path.length);
        assert.deepEqual(path.at(-1),{x:mid,y:mid});
        route(s,{...p,path});
      }
    }
  });
  test(`${name}: actual spawns use diverse candidates, bounded jitter and reproducible lanes`,()=>{
    for(const seed of seeds) for(let direction=0;direction<4;direction++) {
      const a=create(seed),b=create(seed),size=G.worldSize(a),mid=G.worldCenter(a),positions=[],tiles=new Set();
      for(const s of [a,b]) {s.direction=direction;G.startNight(s);s.wave.total=24;}
      for(let i=0;i<24;i++) {
        for(const s of [a,b]) {s.wave.timer=0;G.step(s,.001);}
        const e=a.enemies.at(-1),other=b.enemies.at(-1);
        assert.deepEqual(e,other,`${name} seed ${seed} direction ${direction} spawn ${i}`);
        const x=Math.round(e.x),y=Math.round(e.y);
        assert(G.spawnPlots(a,direction).some(p=>p.x===x&&p.y===y));
        assert.notEqual(G.terrain(x,y,a),'water');
        assert(Math.abs(e.x-x)<=.281&&Math.abs(e.y-y)<=.281,'spawn jitter .28 plus one movement tick');
        assert(Math.abs(e.laneX)<=.25&&Math.abs(e.laneY)<=.25);
        assert(e.x>=0&&e.y>=0&&e.x<=size-1&&e.y<=size-1);
        positions.push(`${e.x},${e.y}`);tiles.add(direction%2?y:x);
        route(a,e);
      }
      assert.equal(new Set(positions).size,24,'actual spawn positions are distinct');
      assert(tiles.size>=4,'spawns spread across the edge candidates');
      assert([...tiles].some(pos=>pos!==mid),'spawns do not all use the center');
    }
  });
  test(`${name}: boss waves spawn from all four directions and retain a final boss`,()=>{
    const s=create(42);s.day=7;G.startNight(s);
    const seen=new Set();
    for(let i=0;i<s.wave.total;i++) {
      s.wave.timer=0;G.step(s,.001);
      const e=s.enemies.at(-1),dir=i%4;
      assert(G.spawnPlots(s,dir).some(p=>p.x===Math.round(e.x)&&p.y===Math.round(e.y)));
      seen.add(dir);assert.equal(e.boss,i===s.wave.total-1);
    }
    assert.equal(seen.size,4);assert.equal(s.enemies.filter(e=>e.boss).length,1);
  });
  for(let direction=0;direction<4;direction++) {
    test(`${name}: direction ${direction} moves safely for 300 seconds and passes destroyed obstacles`,()=>{
      const s=create(42),p=G.spawnPlots(s,direction)[direction],e=enemy(s,p.x,p.y),mid=G.worldCenter(s);
      s.buildings[0].level=15;s.buildings[0].hp=G.maxHP(s.buildings[0]);
      const [dx,dy]=directions[direction],gate=s.buildings.find(b=>b.type==='gate'&&b.direction===direction);
      const plot=G.findPath(s,e).find(p=>!G.at(s,p.x,p.y)&&G.owns(s,p.x,p.y)&&G.terrain(p.x,p.y,s)!=='water'&&Math.abs(p.x-mid)+Math.abs(p.y-mid)>=2);
      assert(plot,'dry building plot on incoming route');
      const blocker=G.grantBuilding(s,'well',plot.x,plot.y,1);
      assert(blocker,'building on the incoming route');
      // Keep a live obstacle for 100 seconds, then let attacks break it naturally.
      const obstacle=gate||blocker;obstacle.hp=1e6;
      night(s,[e]);let travelled=0,damaged=false,inside=false;
      for(let i=0;i<3000;i++) {
        if(i===1000) obstacle.hp=1;
        const x=e.x,y=e.y;checkedStep(s);
        travelled+=Math.hypot(e.x-x,e.y-y);
        if(i<1000&&obstacle.hp<1e6) {
          damaged=true;
          assert(Math.round(e.x)!==obstacle.x||Math.round(e.y)!==obstacle.y,'attack from outside occupied tile');
          assert(Math.hypot(e.x-obstacle.x,e.y-obstacle.y)<=1.05);
        }
        if(gate&&((e.x-gate.x)*dx+(e.y-gate.y)*dy<-.5)) inside=true;
      }
      assert.equal(s.over,false);assert(Math.abs(s.elapsed-300)<1e-7);
      const label=`${name} direction ${direction}: position ${e.x},${e.y}, travelled ${travelled}, next ${JSON.stringify(e.path[0])}`;
      assert(damaged,`${label}: live obstacle was attacked`);
      assert(obstacle.hp<=0,`${label}: obstacle destroyed`);
      if(gate) assert(inside,`${label}: passes through broken gate`);
      assert(s.buildings[0].hp<G.maxHP(s.buildings[0]),`${label}: reaches and attacks shrine rather than getting stuck`);
    });
  }
  test(`${name}: save reload preserves fractional positions and lanes, migrates legacy lanes and rejects bad lanes`,()=>{
    const s=create(42);G.startNight(s);advance(s,4);
    const saved=JSON.parse(G.serialize(s)),loaded=G.restore(JSON.stringify(saved));assert(loaded);
    const fields=e=>[e.id,e.x,e.y,e.laneX,e.laneY];
    assert.deepEqual(loaded.enemies.map(fields),s.enemies.map(fields));
    assert(loaded.enemies.some(e=>e.x!==Math.round(e.x)||e.y!==Math.round(e.y)));
    assert(loaded.enemies.every(e=>e.path.length===0&&e.pathRevision===-1));
    const old=JSON.parse(G.serialize(s));for(const e of old.enemies) {delete e.laneX;delete e.laneY;}
    const first=G.restore(JSON.stringify(old)),second=G.restore(JSON.stringify(old));assert(first&&second);
    assert.equal(first.seed,old.seed,'migration must not consume RNG');
    assert.deepEqual(first.enemies.map(fields),second.enemies.map(fields));
    assert(first.enemies.every(e=>Math.abs(e.laneX)<=.25&&Math.abs(e.laneY)<=.25));
    assert.deepEqual(G.restore(G.serialize(first)).enemies.map(fields),first.enemies.map(fields));
    for(const field of ['laneX','laneY']) {
      for(const value of [null,'0',{},[],.300001,-.300001,1e300]) {
        const raw=JSON.parse(G.serialize(s));raw.enemies[0][field]=value;
        assert.equal(G.restore(JSON.stringify(raw)),null,`${field}=${JSON.stringify(value)}`);
      }
      for(const value of [-.3,.3]) {
        const raw=JSON.parse(G.serialize(s));raw.enemies[0][field]=value;
        const valid=G.restore(JSON.stringify(raw));assert(valid);assert.equal(valid.enemies[0][field],value);
      }
    }
    for(let i=0;i<100;i++) checkedStep(loaded);
  });
}

test('spawn candidate validation rejects invalid directions and occupied edge tiles without mutating state',()=>{
  const s=G.createState(null),before=G.serialize(s);
  for(const direction of [-1,4,.5,null,'0',NaN]) assert.deepEqual(G.spawnPlots(s,direction),[]);
  assert.equal(G.serialize(s),before);
  const blocker=G.grantBuilding(s,'well',8,0);assert(blocker);
  assert.equal(G.spawnPlots(s,0).length,4);assert(!G.spawnPlots(s,0).some(p=>p.x===8));
});

test('path refresh during a water corner preserves integer routes and makes forward progress',t=>{
  const s=G.createState(null),e=enemy(s,0,8);night(s,[e]);
  const initial=G.findPath(s,e);assert(initial.length>8);
  let turns=0,lastHeading=null;
  s.buildings[0].level=15;s.buildings[0].hp=G.maxHP(s.buildings[0]);
  const shrine=s.buildings[0],initialHP=shrine.hp;let hits=0;
  for(let i=0;i<3000;i++) {
    if(i%7===0) s.revision++;
    const x=e.x,y=e.y,hp=shrine.hp;checkedStep(s);
    if(shrine.hp<hp) hits++;
    assert.equal(e.pathRevision,s.revision);
    const heading=Math.abs(e.x-x)>Math.abs(e.y-y)?'x':'y';
    if(Math.hypot(e.x-x,e.y-y)>.02) {if(lastHeading&&lastHeading!==heading) turns++;lastHeading=heading;}
  }
  const control=G.createState(null),other=enemy(control,0,8);night(control,[other]);
  control.buildings[0].level=15;control.buildings[0].hp=G.maxHP(control.buildings[0]);
  for(let i=0;i<3000;i++) checkedStep(control);
  const controlDamage=G.maxHP(control.buildings[0])-control.buildings[0].hp;
  t.diagnostic(`shrine ${shrine.x},${shrine.y}, HP ${initialHP} -> ${shrine.hp}, hits ${hits}; refreshed position ${e.x},${e.y}, next ${JSON.stringify(e.path[0])}; no-refresh position ${other.x},${other.y}, shrine damage ${controlDamage}`);
  assert(controlDamage>0,'same route reaches and damages shrine without repeated refresh');
  assert(turns>=2,'water route exercises multiple turns');
  assert(s.buildings[0].hp<G.maxHP(s.buildings[0]),`refreshes do not trap the enemy at a corner: position ${e.x},${e.y}, next ${JSON.stringify(e.path[0])}`);
});

test('Zhong slowdown reduces distance and repel freezes motion and attacks before resuming',()=>{
  const a=G.createState(42),b=G.createState(42),ea=enemy(a,12,0),eb=enemy(b,12,0);
  const zhong=G.grantBuilding(b,'zhong',13,12);assert(zhong);
  night(a,[ea]);night(b,[eb]);
  for(let i=0;i<20;i++) {checkedStep(a);checkedStep(b);}
  assert.equal(eb.slowFactor,.6);assert(eb.slowed>0);
  assert(eb.y<ea.y-.5,'slowdown causes measurably less forward travel');
  const frozen=[eb.x,eb.y],hp=eb.hp,gateHP=b.buildings.filter(n=>n.type==='gate').map(n=>n.hp);
  assert(G.skill(b,'repel').ok);assert.equal(eb.hp,hp-20);
  for(let i=0;i<40;i++) checkedStep(b);
  assert.deepEqual([eb.x,eb.y],frozen);
  assert.deepEqual(b.buildings.filter(n=>n.type==='gate').map(n=>n.hp),gateHP);
  for(let i=0;i<10;i++) checkedStep(b);
  assert(Math.hypot(eb.x-frozen[0],eb.y-frozen[1])>.2,'movement resumes after repel');
  assert.equal(eb.slowed,0);assert.equal(eb.slowFactor,1);
});

test('crowds keep distinct diverse positions while advancing and attacking a gate',()=>{
  const s=G.createState(42),gate=s.buildings.find(b=>b.type==='gate'&&b.direction===0);
  s.buildings[0].level=15;s.buildings[0].hp=G.maxHP(s.buildings[0]);
  const enemies=Array.from({length:16},(_,i)=>enemy(s,12,0,{laneX:(i%4-.5)*.1,laneY:(Math.floor(i/4)-1.5)*.1}));
  night(s,enemies);const initialDistance=enemies.map(e=>Math.hypot(e.x-gate.x,e.y-gate.y));
  for(let i=0;i<20;i++) checkedStep(s);
  assert.equal(new Set(enemies.map(e=>`${e.x.toFixed(6)},${e.y.toFixed(6)}`)).size,enemies.length);
  assert(new Set(enemies.map(e=>e.x.toFixed(2))).size>=4,'crowd has transverse variety');
  assert(enemies.every((e,i)=>Math.hypot(e.x-gate.x,e.y-gate.y)<initialDistance[i]-.5),'every crowd member advances');
  for(let i=0;i<200;i++) checkedStep(s);
  assert(gate.hp===0,'crowd attacks and breaks the gate');
  assert(enemies.every(e=>e.y>gate.y+.5),'all crowd members pass the gate');
});
