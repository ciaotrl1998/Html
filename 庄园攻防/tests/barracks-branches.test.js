'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const G=require('../js/game'),N=require('../js/network'),A=require('../js/autoplay');
function match(options={}){const s=G.createMatch({mapSeed:42,rotation:0,...options});for(const p of s.players){p.controller='human';p.selectedSkill='thunder';}return s;}
function fund(s,owner=0){const p=G.playerView(s,owner);p.coins=p.materials=1e12;p.gateLevel=15;for(const b of p.buildings)if(b.type==='shrine'||b.type==='gate'){b.level=15;b.hp=G.maxHP(b);}return p;}
function add(s,owner=0,level=1){const p=G.playerView(s,owner),w=G.worldWidth(s);for(const k of G.estate(p).cells){const x=k%w,y=Math.floor(k/w);if(!G.at(s,x,y)&&G.terrain(x,y,s)!=='water'){const b=G.grantBuilding(p,'barracks',x,y,level);if(b)return b;}}throw Error('No plot');}
function advance(s,seconds){for(let time=0;time<seconds-1e-8;time+=.05)G.step(s,Math.min(.05,seconds-time));}
function openLine(s){const p=G.playerView(s,0),w=G.worldWidth(s);for(const k of G.estate(p).cells){const x=k%w,y=Math.floor(k/w);if([0,1,2,3,4].every(dx=>G.owns(p,x+dx,y)&&G.walkable(s,x+dx,y)&&!G.at(s,x+dx,y)))return {x,y};}throw Error('No open line');}
function unit(s,owner,x,y,troopType='infantry',level=1){const stats={troopType,level},hp=G.soldierHP(G.playerView(s,owner),stats);const u={id:s.nextId++,owner,barracksId:999999,troopType,x,y,level,hp,maxHp:hp,baseDamage:G.TROOPS[troopType].damage*G.factor(stats),attack:0,attackAt:0,targetOwner:null,targetId:null,targetBuildingId:null,repelled:0,slowed:0,slowFactor:1,waypoint:null};s.soldiers.push(u);return u;}

test('level one trains infantry and branch prices have equal value with opposite 60/40 shares',()=>{
  const s=match(),p=fund(s);
  const base=add(s);base.production=.99;advance(s,.05);const recruit=s.soldiers.find(u=>u.barracksId===base.id);assert.equal(recruit.troopType,'infantry');assert.equal(recruit.level,1);
  const costs=[];
  for(const troopType of ['infantry','archer']){const b=add(s),stock=[p.coins,p.materials];assert(G.upgrade(p,b,{troopType}).ok);assert.equal(b.level,2);costs.push([stock[0]-p.coins,stock[1]-p.materials]);}
  assert.deepEqual(costs,[[1520,456],[2280,304]]);
  assert.equal(costs[0][0]/G.COIN_VALUE+costs[0][1],costs[1][0]/G.COIN_VALUE+costs[1][1]);
});

test('bulk stops at level one; archer branch preserves progress, health and old infantry',()=>{
  const s=match(),p=fund(s),b=add(s);b.production=.4;b.hp=G.maxHP(b)*.5;
  assert.equal(G.upgradeOptions(p,b).levels,0);assert.equal(G.bulkUpgrade(p,b).levels,0);assert.equal(b.level,1);assert.equal(G.name(b),'兵营');
  const old=unit(s,0,b.x,b.y,'infantry',1);old.barracksId=b.id;
  const cost=G.upgradeCost(b,{troopType:'archer'}),stock=[p.coins,p.materials],progress=b.production;
  assert(G.upgrade(p,b,{troopType:'archer'}).ok);
  assert.equal(b.level,2);assert.equal(G.name(b),'弓兵营');assert.equal(b.production,progress);assert.equal(b.hp/G.maxHP(b),.5);
  assert.equal(p.coins,stock[0]-cost.coins);assert.equal(p.materials,stock[1]-cost.materials);assert.equal(old.troopType,'infantry');assert.equal(old.level,1);
  b.production=.99;advance(s,.05);const archer=s.soldiers.find(u=>u.troopType==='archer');assert(archer);assert.equal(archer.level,2);
  assert.equal(archer.baseDamage,22);assert.equal(archer.maxHp,Math.round(110*2));
  assert(G.upgrade(p,b).ok);advance(s,.05);assert.equal(archer.level,3);assert.equal(old.level,1);assert.equal(old.troopType,'infantry');assert(G.restore(G.serialize(s)));
});
test('infantry branch upgrades old infantry and high-level granted barracks default to infantry',()=>{
  const s=match(),p=fund(s),b=add(s),old=unit(s,0,b.x,b.y,'infantry',1);old.barracksId=b.id;
  assert(G.upgrade(p,b,{troopType:'infantry'}).ok);assert.equal(old.level,2);assert.equal(G.name(b),'步兵营');
  assert(G.upgrade(p,b).ok);assert.equal(old.level,3);const gifted=add(s,0,7);assert.equal(gifted.troopType,'infantry');assert.equal(G.name(gifted),'步兵营');
});
test('branch choice is mandatory, permanent, owner checked and atomic on failure',()=>{
  const s=match(),p=fund(s),b=add(s);
  for(const options of [{},{troopType:'wizard'},{troopType:null},{troopType:['archer']}]){const before=G.serialize(s);assert.equal(G.upgrade(p,b,options).ok,false);assert.equal(G.serialize(s),before);}
  p.coins=p.materials=0;
  assert.equal(G.upgrade(p,b,{troopType:'archer'}).ok,false);assert.equal(b.level,1);assert.equal(b.troopType,'infantry');
  fund(s);assert.equal(G.upgrade(G.playerView(s,1),b,{troopType:'archer'}).ok,false);assert(G.upgrade(p,b,{troopType:'archer'}).ok);const before=G.serialize(s);
  for(const choice of ['infantry','archer'])assert.equal(G.upgrade(p,b,{troopType:choice}).ok,false);assert.equal(G.serialize(s),before);
});

test('branch affordability uses its own quote and bulk upgrades preserve the fixed bias',()=>{
  for(const troopType of ['infantry','archer']){
    const s=match(),p=fund(s),b=add(s),options={troopType},cost=G.upgradeCost(b,options);
    for(const resource of ['coins','materials']){
      p.coins=cost.coins;p.materials=cost.materials;p[resource]--;
      const before=G.serialize(s);assert(G.upgradeReason(p,b,false,options));assert.equal(G.upgrade(p,b,options).ok,false);assert.equal(G.serialize(s),before);
    }
    p.coins=cost.coins;p.materials=cost.materials;assert.equal(G.upgradeReason(p,b,false,options),'');
    assert(G.upgrade(p,b,options).ok);assert.equal(p.coins,0);assert.equal(p.materials,0);
    p.coins=p.materials=1e12;
    const quote=G.upgradeOptions(p,b),before={coins:p.coins,materials:p.materials},result=G.bulkUpgrade(p,b);
    assert(result.ok);assert.equal(b.level,9);assert.deepEqual(result.costspent,quote.cost);
    assert.equal(p.coins,before.coins-quote.cost.coins);assert.equal(p.materials,before.materials-quote.cost.materials);
    assert.equal(quote.cost.coins/G.COIN_VALUE/(quote.cost.coins/G.COIN_VALUE+quote.cost.materials),troopType==='archer'?.6:.4);
  }
});
test('barracks prices grow by 1.8 through four, 2.2 through eight and 3 from nine without a hard limit',()=>{
  const s=match(),p=fund(s);assert.equal(G.DEFS.barracks.limit,undefined);
  const prices=[[600,90],[1080,162],[1944,292],[3500,525],[7699,1155],[16937,2541],
    [37260,5589],[81971,12296],[245913,36887],[737738,110661],[2213214,331982],[6639640,995946]];
  // Other estates and branch/level choices must not alter this estate's price.
  add(s,1,7);
  for(const [coins,materials] of prices){
    assert.deepEqual(G.buildCost(p,'barracks'),{coins,materials});
    const b=add(s,0,3);b.troopType=b.id%2?'archer':'infantry';
  }
  p.buildings=p.buildings.filter(b=>b!==p.buildings.at(-1));
  assert.deepEqual(G.buildCost(p,'barracks'),{coins:6639640,materials:995946});
  assert.deepEqual(G.buildCost(G.playerView(G.restore(G.serialize(s)),0),'barracks'),G.buildCost(p,'barracks'));
});
test('archer stats respect level and difficulty while movement and training remain shared',()=>{
  const s=match({difficulty:'hell'}),p=G.playerView(s,1);s.players[1].controller='computer';
  for(let level=2;level<=9;level++){const b={troopType:'archer',level};assert.equal(G.soldierHP(p,b),Math.round(110*2**(level-1)*1.5));assert.equal(G.soldierDamage(p,b),11*2**(level-1)*1.5);}
  const plot=openLine(s),owner=G.playerView(s,0);assert(G.grantBuilding(owner,'tao',plot.x,plot.y,2));
  for(const troopType of ['infantry','archer'])assert.equal(G.soldierDamage(owner,{troopType,level:4}),G.TROOPS[troopType].damage*8*G.defenseBoost(owner));
  assert.equal(G.TROOPS.archer.range,3);assert.equal(G.TROOPS.archer.interval,1.5);assert.equal(G.soldierRate(G.playerView(s,0)),.2);assert.equal(G.SOLDIER_SPEED,.8);
});
test('archers stop at three tiles, arrows land after .3 seconds and shots are 1.5 seconds apart',()=>{
  const s=match(),{x,y}=openLine(s),u=unit(s,0,x,y,'archer',4),target=unit(s,1,x+3,y,'infantry',9);target.repelled=100;const hp=target.hp;
  advance(s,.05);assert.equal(s.projectiles.length,1);assert.equal(target.hp,hp);assert.equal(u.x,x);
  advance(s,.25);assert.equal(target.hp,hp);advance(s,.05);assert.equal(target.hp,hp-88);
  const first=u.attackAt;advance(s,1.15);assert.equal(u.attackAt,first);advance(s,.05);assert(Math.abs(u.attackAt-first-1.5)<1e-8);assert.equal(u.x,x);
});
test('archers approach from outside range and lost arrows do not hit a replacement target',()=>{
  const s=match(),{x,y}=openLine(s),u=unit(s,0,x,y,'archer',4),target=unit(s,1,x+4,y,'infantry',9);target.repelled=100;u.targetId=target.id;
  advance(s,.05);assert.equal(s.projectiles.length,0);assert(u.x>x);target.x=u.x+2;advance(s,.05);assert.equal(s.projectiles.length,1);
  target.hp=0;const other=unit(s,1,u.x+2,y,'infantry',9);other.repelled=100;const hp=other.hp;advance(s,.35);assert.equal(other.hp,hp);assert.equal(s.projectiles.length,0);
});
test('archers stop and shoot an enemy in range instead of chasing an old target',()=>{
  const s=match(),{x,y}=openLine(s),u=unit(s,0,x,y,'archer',4),old=unit(s,1,x+4,y,'infantry',9),near=unit(s,1,x+2,y,'infantry',9);
  old.repelled=near.repelled=100;u.targetId=old.id;advance(s,.05);
  assert.equal(u.x,x);assert.equal(u.y,y);assert.equal(u.targetId,near.id);assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].targetId,near.id);
});
test('archers shoot the first enemy gate and cannot shoot soldiers through it',()=>{
  const s=match(),gate=s.buildings.find(b=>b.type==='gate'&&b.owner===1),offset=[[0,-1],[1,0],[0,1],[-1,0]][gate.direction],x=gate.x+offset[0]*2,y=gate.y+offset[1]*2;
  assert(G.walkable(s,x,y));const u=unit(s,0,x,y,'archer',4);u.targetOwner=1;const target=unit(s,1,gate.x-offset[0],gate.y-offset[1],'infantry',9);target.repelled=100;
  advance(s,.05);assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].targetType,'building');assert.equal(s.projectiles[0].targetId,gate.id);
  const hp=gate.hp,targetHp=target.hp;advance(s,.3);assert.equal(gate.hp,hp-88);assert.equal(target.hp,targetHp);
});

test('walls block archer shots and mixed troops share one estate population cap',()=>{
  const s=match(),w=G.worldWidth(s);let line;
  for(const k of G.estate(G.playerView(s,0)).walls){const x=k%w,y=Math.floor(k/w);for(const [dx,dy] of [[1,0],[0,1]])if(G.walkable(s,x-dx,y-dy)&&G.walkable(s,x+dx,y+dy)){line={x,y,dx,dy};break;}if(line)break;}
  assert(line);const {x,y,dx,dy}=line,u=unit(s,0,x-dx,y-dy,'archer',4),enemy=unit(s,1,x+dx,y+dy,'infantry',9);enemy.repelled=100;
  advance(s,.05);assert(!s.projectiles.some(p=>p.sourceId===u.id&&p.targetId===enemy.id));
  const capped=match(),p=fund(capped),infantry=add(capped,0,4),archer=add(capped,0,4);archer.troopType='archer';
  const home=G.estate(p).center;for(let i=0;i<119;i++)unit(capped,0,home.x,home.y,i%3===2?'archer':'infantry',4);
  p.recruitCursor=1;infantry.production=archer.production=.99;advance(capped,.05);
  assert.equal(capped.soldiers.length,120);assert.equal(capped.soldiers.at(-1).troopType,'archer');
  advance(capped,1.5);assert.equal(capped.soldiers.length,120);assert.equal(infantry.production,0);assert.equal(archer.production,0);
});
test('version nine migrates and current saves round-trip mixed troops and in-flight arrows',()=>{
  const s=match(),p=fund(s),b=add(s,0,4);b.production=.6;const old=unit(s,0,b.x,b.y,'infantry',4);old.barracksId=b.id;old.hp=old.maxHp*.5;
  const raw=JSON.parse(G.serialize(s));raw.version=9;for(const n of raw.buildings)delete n.troopType;for(const n of raw.soldiers){delete n.troopType;delete n.attackAt;delete n.targetBuildingId;}
  const loaded=G.restore(JSON.stringify(raw));assert(loaded);assert.equal(loaded.version,G.VERSION);assert.equal(loaded.soldiers[0].hp/loaded.soldiers[0].maxHp,.5);
  assert.equal(loaded.buildings.find(n=>n.id===b.id).troopType,'infantry');assert.equal(loaded.buildings.find(n=>n.id===b.id).production,.6);assert.equal(loaded.players[0].coins,p.coins*G.COIN_VALUE);
  const {x,y}=openLine(s),u=unit(s,0,x,y,'archer',4),target=unit(s,1,x+2,y,'infantry',9);target.repelled=100;advance(s,.05);
  const copy=G.restore(G.serialize(s));assert(copy);assert(copy.projectiles.some(shot=>shot.sourceId===u.id));advance(s,.4);advance(copy,.4);assert.deepEqual(JSON.parse(G.serialize(copy)),JSON.parse(G.serialize(s)));
  const bad=JSON.parse(G.serialize(copy));bad.soldiers.find(n=>n.troopType==='archer').level=1;assert.equal(G.restore(JSON.stringify(bad)),null);
});
test('replicas predict branches, roll rejection back, synchronize stats and restore checkpoints',()=>{
  const s=match({mode:'coop'}),p=fund(s),b=add(s),r=N.createReplica(N.snapshot(s,0),0,1,0);
  assert(r.act({id:1,kind:'upgrade',x:b.x,y:b.y,troopType:'archer'}).ok);assert.equal(r.state.buildings.find(n=>n.id===b.id).troopType,'archer');assert.equal(b.level,1);
  let stream=N.delta(s);assert(r.apply({...stream.message,session:1,seq:1,ack:1,economy:N.economy(s,0)}));assert.equal(r.state.buildings.find(n=>n.id===b.id).level,1);
  assert(r.act({id:2,kind:'upgrade',x:b.x,y:b.y,troopType:'archer'}).ok);assert(G.upgrade(p,b,{troopType:'archer'}).ok);b.production=.99;advance(s,.05);let next=N.delta(s,stream.next);
  assert(r.apply({...next.message,session:1,seq:2,ack:2,economy:N.economy(s,0)}));assert.equal(r.state.soldiers[0].troopType,'archer');assert.equal(r.state.soldiers[0].level,2);
  assert(G.upgrade(p,b).ok);next=N.delta(s,next.next);assert(r.apply({...next.message,session:1,seq:3,ack:2,economy:N.economy(s,0)}));assert.equal(r.state.soldiers[0].level,3);assert.equal(r.state.soldiers[0].maxHp,s.soldiers[0].maxHp);
  const checkpoint=N.createReplica(N.snapshot(s,0),0,1,3,2);assert(checkpoint);assert.equal(checkpoint.state.soldiers[0].troopType,'archer');
});
test('AI income gates reach nine and its branch selection restores a two-to-one mix',()=>{
  for(const [index,threshold] of [0,10,18,36,72,144,288,576,1152].entries())assert.equal(A.desiredMilitaryLevel(threshold),index+1);
  const buildings=[];for(const expected of ['infantry','infantry','archer','infantry','infantry','archer']){const choice=A.nextBarracksTroop(buildings);assert.equal(choice,expected);buildings.push({type:'barracks',level:2,troopType:choice});}
  buildings.pop();assert.equal(A.nextBarracksTroop(buildings),'archer');
});
test('actual computer and autoplay decisions grow foundations and form upgraded mixed armies',()=>{
  for(const owner of [0,1]){
    const s=match(),p=G.playerView(s,owner);p.controller=owner?'computer':'autoplay';p.coins=p.materials=1e12;
    const bot=A.create(p);
    for(let i=0;i<400;i++){bot.tick(1);G.stepEconomy(p,.25,false);s.elapsed+=1;}
    const camps=p.buildings.filter(b=>b.type==='barracks');assert.equal(camps.length,3);
    assert.equal(camps.filter(b=>b.troopType==='archer').length,1);assert.equal(camps.filter(b=>b.troopType==='infantry').length,2);
    assert(camps.every(b=>b.level>=4));assert(camps.some(b=>b.level>=5));assert(G.shrineLevel(p)>5);assert(p.gateLevel>5);
    assert(p.coins>=0&&p.materials>=0);assert(G.restore(G.serialize(s)));
  }
});
test('six troop atlases have identical dimensions and preserve faction alpha masks',()=>{
  for(const type of ['infantry','archer']){const images=['player-red','ally-green','enemy-purple'].map(faction=>PNG.sync.read(fs.readFileSync(path.join(__dirname,`../assets/sprites/soldiers/${type}_${faction}.png`))));for(const png of images){assert.equal(png.width,240);assert.equal(png.height,90);}for(let i=3;i<images[0].data.length;i+=4)for(const png of images){assert.equal(png.data[i],images[0].data[i]);assert([0,255].includes(png.data[i]));}}
});
