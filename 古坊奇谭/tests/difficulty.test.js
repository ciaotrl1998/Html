'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {WebSocket}=require('ws');
const G=require('../js/game');
const {createServer}=require('../server');

const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
function plot(s){
  const width=G.worldWidth(s),land=G.estate(s);
  for(const k of land.cells){
    const x=k%width,y=Math.floor(k/width);
    if(!G.at(s,x,y)&&!G.isWall(s,x,y)&&G.terrain(x,y,s)!=='water'&&!land.gates.some(g=>g.x===x&&g.y===y))return {x,y};
  }
  throw new Error('No plot');
}
function socketConnection(url){
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(url),messages=[],waiters=[];
    socket.on('message',raw=>{
      const message=JSON.parse(String(raw)),index=waiters.findIndex(w=>w.predicate(message));
      if(index>=0){const [waiter]=waiters.splice(index,1);clearTimeout(waiter.timer);waiter.resolve(message);}else messages.push(message);
    });
    socket.once('error',reject);
    socket.once('open',()=>resolve({socket,send:value=>socket.send(JSON.stringify(value)),next(predicate){
      const index=messages.findIndex(predicate);if(index>=0)return Promise.resolve(messages.splice(index,1)[0]);
      return new Promise((resolveNext,rejectNext)=>{const waiter={predicate,resolve:resolveNext,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);rejectNext(new Error('Timed out'));},3000)};waiters.push(waiter);});
    }}));
  });
}

test('difficulty table and enemy-only final income multipliers match the design',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(G.DIFFICULTIES).map(([id,d])=>[id,[d.name,d.economy,d.soldier]])),{
    beginner:['入门',1,1],hard:['困难',1.2,1.1],extreme:['极难',1.5,1.25],hell:['地狱',2,1.5]
  });
  for(const [difficulty,modifier] of Object.entries({beginner:1,hard:1.2,extreme:1.5,hell:2})){
    const s=G.createMatch({difficulty,mapSeed:42,rotation:0}),enemy=G.playerView(s,1),shrine=enemy.buildings.find(b=>b.type==='shrine');
    shrine.level=2;shrine.hp=G.maxHP(shrine);const p=plot(enemy);assert(G.grantBuilding(enemy,'stage',p.x,p.y,2));
    close(G.income(enemy,shrine),2*1.06*modifier);close(G.rates(enemy).coins,G.income(enemy,shrine));
    for(let i=0;i<40;i++)G.stepEconomy(enemy,.25,false);
    assert.equal(enemy.coins,Math.floor(10*2*1.06*modifier));
  }
  assert.throws(()=>G.createMatch({difficulty:'impossible'}),/Invalid difficulty/);
});

test('soldier health, damage and power scale together only for enemy computers',()=>{
  const expected={beginner:[44,18,28],hard:[48,19.8,31],extreme:[55,22.5,35],hell:[66,27,42]},b={type:'barracks',level:1};
  for(const [difficulty,values] of Object.entries(expected)){
    const s=G.createMatch({difficulty,mapSeed:42,rotation:0}),enemy=G.playerView(s,1);
    assert.equal(G.soldierHP(enemy,b),values[0]);close(G.soldierDamage(enemy,b),values[1]);assert.equal(G.soldierPower(enemy,b),values[2]);
  }
  const s=G.createMatch({mode:'coop',enemyCount:2,difficulty:'hell',mapSeed:42,rotation:0}),human=G.playerView(s,0),ally=G.playerView(s,1),enemy=G.playerView(s,2);
  assert.deepEqual([G.difficultySoldier(human),G.difficultySoldier(ally),G.difficultySoldier(enemy)],[1,1,1.5]);
  human.controller='autoplay';assert.equal(G.difficultySoldier(human),1);
  enemy.controller='human';assert.equal(G.difficultySoldier(enemy),1);
  enemy.controller='computer';const shrine=enemy.buildings.find(n=>n.type==='shrine');shrine.level=3;shrine.hp=G.maxHP(shrine);
  const p=plot(enemy);assert(G.grantBuilding(enemy,'tao',p.x,p.y,1));const upgraded={type:'barracks',level:2};
  assert.equal(G.soldierHP(enemy,upgraded),Math.round(44*1.55*1.2*1.5));
  close(G.soldierDamage(enemy,upgraded),18*2*1.15*1.2*1.5);
});

test('combat applies the selected soldier multiplier to real enemy attacks',()=>{
  const s=G.createMatch({difficulty:'hell',mapSeed:42,rotation:0}),spot=plot(G.playerView(s,0));
  const unit=(owner,targetId)=>({id:s.nextId++,owner,barracksId:99999,x:spot.x,y:spot.y,level:1,hp:owner?66:44,maxHp:owner?66:44,baseDamage:18,attack:0,targetOwner:null,targetId,repelled:0,slowed:0,slowFactor:1,waypoint:null});
  const defender=unit(0,null),attacker=unit(1,defender.id);defender.targetId=attacker.id;s.soldiers.push(defender,attacker);
  G.step(s,.1);assert.equal(defender.hp,17);assert.equal(attacker.hp,48);
});

test('difficulty is saved, old version-nine saves default to beginner, and invalid values are rejected',()=>{
  const hell=G.createMatch({difficulty:'hell',mapSeed:42,rotation:0}),loaded=G.restore(G.serialize(hell));
  assert.equal(loaded.difficulty,'hell');
  const legacy=JSON.parse(G.serialize(hell));delete legacy.difficulty;
  assert.equal(G.restore(JSON.stringify(legacy)).difficulty,'beginner');
  legacy.difficulty='nightmare';assert.equal(G.restore(JSON.stringify(legacy)),null);
});

test('online host difficulty is synchronized and used by the authoritative match',async()=>{
  const service=createServer();await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`ws://127.0.0.1:${service.server.address().port}/ws`,host=await socketConnection(url),guest=await socketConnection(url);
    host.send({type:'create',enemyCount:4,difficulty:'extreme'});const created=await host.next(m=>m.type==='created');
    assert.deepEqual([created.enemyCount,created.difficulty],[4,'extreme']);
    guest.send({type:'join',code:created.code});const joined=await guest.next(m=>m.type==='joined');assert.equal(joined.difficulty,'extreme');
    host.send({type:'settings',enemyCount:6,difficulty:'hell'});const settings=await guest.next(m=>m.type==='settings');assert.deepEqual([settings.enemyCount,settings.difficulty],[6,'hell']);
    host.send({type:'start'});const snapshot=await host.next(m=>m.type==='snapshot'),state=JSON.parse(snapshot.snapshot);assert.deepEqual([state.enemyCount,state.difficulty],[6,'hell']);
    const bad=await socketConnection(url);bad.send({type:'create',difficulty:'nightmare'});assert.equal((await bad.next(m=>m.type==='error')).message,'难度设置无效');bad.socket.close();
    host.socket.close();guest.socket.close();
  }finally{await service.close();}
});
