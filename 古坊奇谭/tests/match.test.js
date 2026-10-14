'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../js/game');
const N=require('../js/network');
const advance=(s,time,dt=.1)=>{for(let t=0;t<time-1e-8&&!s.over;t+=dt)G.step(s,Math.min(dt,time-t));};
function match(options={}){const s=G.createMatch({mapSeed:42,rotation:0,...options});for(const p of s.players){p.controller='human';p.selectedSkill='thunder';}return s;}
function add(s,owner,type='barracks',level=1){const p=G.playerView(s,owner),e=G.estate(p);for(const k of e.cells){const x=k%s.worldSize,y=Math.floor(k/s.worldSize);if(!G.at(s,x,y)&&!G.isWall(s,x,y)&&G.terrain(x,y,s)!=='water')return G.grantBuilding(p,type,x,y,level);}throw Error('No plot');}
function unit(s,owner,x,y,damage=18){const u={id:s.nextId++,owner,barracksId:99999,x,y,level:1,hp:120,maxHp:120,baseDamage:damage,attack:0,targetOwner:null,targetId:null,repelled:0,slowed:0,slowFactor:1,waypoint:null};s.soldiers.push(u);return u;}
const shrine=(s,owner)=>s.buildings.find(b=>b.owner===owner&&b.type==='shrine');

test('all layouts, rotations and seeded terrain are connected and have the specified doors',()=>{
 for(const seed of [1,42,73193,99991])for(const mode of ['single','coop'])for(const count of mode==='single'?[1,2,3,4]:[2,4,6])for(let rotation=0;rotation<4;rotation++){
  const s=match({mode,enemyCount:count,mapSeed:seed,rotation}),blue=mode==='coop'?2:1;
  const expected=mode==='single'?[[50,25],[75,25],[75,50],[75,75]][count-1]:{2:[50,40],4:[75,40],6:[75,90]}[count];
  assert.deepEqual([s.worldSize,s.worldHeight],rotation%2?[...expected].reverse():expected);
  assert.equal(s.players.length,blue+count);const land=G.estate(s),own=new Set();
  for(const p of s.players){
   const view=G.playerView(s,p.id),e=G.estate(view);assert.deepEqual([view.coins,view.materials],[150,200]);assert.deepEqual(G.rates(view),{coins:1,materials:0});
   for(const k of e.cells){assert(!own.has(k),'interiors do not overlap');own.add(k);}
   for(const type of ['forest','mountain','plain'])assert([...e.cells].some(k=>G.terrain(k%s.worldSize,Math.floor(k/s.worldSize),s)===type),type);
   for(const g of e.gates){assert(!G.isWall(s,g.x,g.y));assert(G.findPath(s,e.center,g));}
   assert(G.findPath(s,e.center,land.estates[(p.id+1)%s.players.length].center),'all estates connect through gates');
  }
  assert.equal(land.gates.length,mode==='single'?count*2:count===2?4:count===4?8:12);
  for(const k of land.sharedWall)assert(G.isWall(s,k%s.worldSize,Math.floor(k/s.worldSize)));
  assert(G.restore(G.serialize(s)));
 }
});
test('barracks rate, fractional production and birth stats survive upgrade, removal and saves',()=>{
 const s=match(),b=add(s,0),p=G.playerView(s,0);advance(s,3);assert.equal(s.soldiers.length,3);assert.equal(G.soldierRate({level:9}),3);
 const old=s.soldiers[0],hp=old.maxHp,damage=old.baseDamage;
 shrine(s,0).level=15;p.coins=p.materials=1e9;assert(G.upgrade(p,b).ok);advance(s,4);assert.equal(s.soldiers.length,8);
 assert.equal(old.maxHp,hp);assert.equal(old.baseDamage,damage);assert(s.soldiers.some(u=>u.level===2));
 assert(G.demolish(p,b).ok);assert.equal(s.soldiers.length,8);advance(s,.1);assert.equal(s.soldiers.length,8);
 assert(G.restore(G.serialize(s)));
});
test('population cap is per estate, fair among barracks and never accumulates backlog',()=>{
 const s=match(),a=add(s,0),b=add(s,0),home=G.estate(G.playerView(s,0)).center;
 for(let i=0;i<119;i++)unit(s,0,home.x,home.y);
 advance(s,1);assert.equal(s.soldiers.length,120);assert.equal(s.soldiers.at(-1).barracksId,a.id);
 advance(s,3);assert.equal(a.production,0);assert.equal(b.production,0);
 s.soldiers.shift();advance(s,.5);assert.equal(s.soldiers.length,119);advance(s,.5);assert.equal(s.soldiers.length,120);assert.equal(s.soldiers.at(-1).barracksId,b.id);
});
test('soldiers leave by doors, destroy hostile gates and eventually attack the main city',()=>{
 const s=match();for(const b of s.buildings)if(b.owner===1)b.hp=1;
 add(s,0, 'barracks',3);const walls=new Set(G.estate(s).walls);
 for(let i=0;i<2500&&!s.over;i++){G.step(s,.1);for(const u of s.soldiers)assert(G.walkable(s,Math.round(u.x),Math.round(u.y)));}
 assert.equal(s.result,'victory');assert(s.players[1].eliminated);assert(!s.buildings.some(b=>b.owner===1));assert(!s.soldiers.some(u=>u.owner===1));assert.deepEqual(G.estate(s).walls,walls);
 const oldHome=G.estate(G.playerView(s,1)).center;assert.equal(G.buildReason(G.playerView(s,0),'tower',oldHome.x,oldHome.y),'该庄园已出局');
});
test('nearby hostile soldiers take priority; allies and distant hostile troops do not',()=>{
 const s=match({mode:'coop',enemyCount:2}),home=G.estate(G.playerView(s,0)).center;
 const a=unit(s,0,home.x,home.y),ally=unit(s,1,home.x+.2,home.y),enemy=unit(s,2,home.x+.6,home.y);
 advance(s,.1);assert.equal(a.targetId,enemy.id);assert.equal(ally.hp,120);assert(enemy.hp<120);
 enemy.hp=0;advance(s,.1);assert.equal(a.targetId,null);assert.notEqual(a.targetOwner,null);
});
test('nearest reachable enemy is selected and eliminated targets are skipped',()=>{
 const s=match({enemyCount:2}),home=G.estate(G.playerView(s,0)).center;
 const u=unit(s,0,home.x,home.y);advance(s,.1);
 const distances=s.players.slice(1).map(p=>[p.id,G.findPath(s,home,shrine(s,p.id)).length]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);assert.equal(u.targetOwner,distances[0][0]);
 const victim=u.targetOwner,b=shrine(s,victim);b.hp=1;b.lastHit=s.elapsed;const attack=unit(s,0,b.x,b.y-1,1e6);attack.targetOwner=victim;advance(s,.1);assert(s.players[victim].eliminated);advance(s,.1);assert.notEqual(u.targetOwner,victim);
});
test('individual elimination retains all walls and leaves survivors playing; simultaneous main-city attacks draw',()=>{
 const s=match({mode:'coop'}),walls=new Set(G.estate(s).walls),home=shrine(s,0);home.hp=1;home.lastHit=s.elapsed;
 const u=unit(s,2,home.x,home.y-1,1e6);u.targetOwner=0;advance(s,.1);
 assert(s.players[0].eliminated);assert(!s.over);assert.deepEqual(G.estate(s).walls,walls);assert(!s.soldiers.some(u=>u.owner===0));
 assert.equal(G.skillReason(G.playerView(s,0),'thunder'),'该庄园已出局');assert(G.restore(G.serialize(s)));
 const draw=match();for(const owner of [0,1]){const b=shrine(draw,owner);b.hp=1;b.lastHit=draw.elapsed;unit(draw,1-owner,b.x,b.y-1,1e6).targetOwner=owner;}
 advance(draw,.1);assert.equal(draw.result,'draw');const before=draw.elapsed;advance(draw,1);assert.equal(draw.elapsed,before);
});
test('ten-second out-of-combat repair; occupied or threatened broken gates do not close',()=>{
 const s=match(),b=shrine(s,0);b.hp=900;b.lastHit=0;advance(s,9);assert.equal(b.hp,900);advance(s,2);assert(b.hp>930&&b.hp<950);
 const gate=s.buildings.find(b=>b.type==='gate'&&b.owner===0);gate.hp=0;gate.lastHit=s.elapsed-10;
 const u=unit(s,1,gate.x,gate.y);u.repelled=10;advance(s,.1);assert.equal(gate.hp,0);
 s.soldiers=[];advance(s,.1);assert(gate.hp>0);
});
test('skills are always available only to their owner and only hit hostile troops in the defence zone',()=>{
 const s=match({mode:'coop',enemyCount:4}),p=G.playerView(s,0),h=G.estate(p).center,out=G.estate(G.playerView(s,2)).center;
 const enemy=unit(s,2,h.x,h.y),ally=unit(s,1,h.x,h.y),far=unit(s,2,out.x,out.y);
 const money=p.coins;assert(G.skill(p,'thunder').ok);assert(!s.soldiers.includes(enemy));assert.equal(ally.hp,120);assert.equal(far.hp,120);assert.equal(p.coins,money);assert.equal(p.kills,1);assert(!G.skill(p,'thunder').ok);
 p.selectedSkill='repair';const a=shrine(s,0),b=shrine(s,1);a.hp=b.hp=100;assert(G.skill(p,'repair').ok);assert.equal(a.hp,730);assert.equal(b.hp,100);
});
test('new saves preserve future simulation and reject obsolete, corrupt or foreign-owned data',()=>{
 const s=match();add(s,0);advance(s,2.3);const next=G.restore(G.serialize(s));assert(next);advance(s,8);advance(next,8);assert.deepEqual(JSON.parse(G.serialize(s)),JSON.parse(G.serialize(next)));
 for(const mutate of [v=>v.version=7,v=>v.worldSize=25,v=>v.players[0].coins=-1,v=>v.players[0].selectedSkill='toString',v=>v.buildings[0].owner=1,v=>v.buildings.push({...v.buildings[0]}),v=>v.soldiers[0].x=-1]){const raw=JSON.parse(G.serialize(s));mutate(raw);assert.equal(G.restore(JSON.stringify(raw)),null);}
});
test('replicas predict only own economy, reconcile rejection and receive every estate elimination',()=>{
 const s=match({mode:'coop',enemyCount:6});s.players[1].controller='human';const replica=N.createReplica(N.snapshot(s,0),0,1,0);assert(replica);assert.equal(replica.state.players[1].coins,0);
 let frame=N.delta(s),previous=frame.next;const before=JSON.stringify(s.soldiers);const p=G.playerView(replica.state,0),plot=[...G.estate(p).cells].map(k=>({x:k%s.worldSize,y:Math.floor(k/s.worldSize)})).find(p=>!G.buildReason(G.playerView(s,0),'tea',p.x,p.y));
 assert(replica.act({id:1,kind:'build',building:'tea',...plot}).ok);assert(replica.state.buildings.some(b=>b.id<0));assert.equal(JSON.stringify(s.soldiers),before);
 frame=N.delta(s,previous);assert(replica.apply({...frame.message,session:1,seq:1,ack:1,economy:N.economy(s,0)}));assert(!replica.state.buildings.some(b=>b.id<0));
 assert.equal(replica.act({id:2,kind:'upgrade',x:shrine(s,2).x,y:shrine(s,2).y}).ok,false);
});
