'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../js/game'),N=require('../js/network'),Maps=require('../js/maps');
const {once}=require('node:events'),{WebSocket}=require('ws'),{createServer}=require('../server');

test('all estate sizes preserve layouts, resources, shared walls, reachable gates and save/network geometry',()=>{
  for(const estateSize of Object.keys(G.ESTATE_SIZES))for(const mode of ['single','coop'])for(const enemyCount of mode==='single'?[1,2,3,4]:[2,4,6])for(const mapSeed of [1,42,2271579626])for(let rotation=0;rotation<4;rotation++){
    const s=G.createMatch({estateSize,mode,enemyCount,mapSeed,rotation}),[w,h]=Maps.dimensions(mode,enemyCount,estateSize),land=G.estate(s),owned=new Set();
    assert.deepEqual([s.worldSize,s.worldHeight],rotation%2?[h,w]:[w,h]);
    for(const p of s.players){
      const view=G.playerView(s,p.id),e=G.estate(view);
      assert(e.cells.size>0);
      for(const k of e.cells){assert(!owned.has(k));owned.add(k);assert(!land.walls.has(k));}
      for(const type of ['plain','forest','mountain'])assert([...e.cells].some(k=>G.terrain(k%s.worldSize,Math.floor(k/s.worldSize),s)===type),`${estateSize} ${mode} ${mapSeed} ${type}`);
      for(const k of [...e.cells,...e.walls]){const x=k%s.worldSize,y=Math.floor(k/s.worldSize);assert(x>=2&&y>=2&&x<s.worldSize-2&&y<s.worldHeight-2);}
      for(const gate of e.gates)assert(G.findPath(s,e.center,gate));
      const enemy=land.estates.find(other=>G.hostile(s,p.id,other.owner));assert(G.findPath(s,e.center,enemy.center));
    }
    if(mode==='coop')assert(land.sharedWall.size>0);
    const copy=G.restore(G.serialize(s));assert(copy);assert.equal(copy.estateSize,estateSize);assert.deepEqual([...G.estate(copy).cells],[...land.cells]);
    if(mode==='coop'){const replica=N.createReplica(N.snapshot(s,0),0,1,0);assert(replica);assert.equal(replica.state.estateSize,estateSize);assert.equal(replica.state.worldSize,s.worldSize);}
  }
});

test('sampled interior areas follow the four requested averages in both modes and maps grow with the setting',()=>{
  for(const mode of ['single','coop']){
    let previousArea=0,previousMap=0;
    for(const [estateSize,config] of Object.entries(G.ESTATE_SIZES)){
      let total=0,count=0,seed=20261021;
      for(let i=0;i<100;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        const s=G.createMatch({mode,estateSize,mapSeed:seed,rotation:0});
        for(const e of G.estate(s).estates){total+=e.cells.size;count++;}
      }
      const mean=total/count;assert(Math.abs(mean-config.area)<config.area*.1,`${mode} ${estateSize}: ${mean}`);assert(mean>previousArea);previousArea=mean;
      const [w,h]=Maps.dimensions(mode,mode==='single'?1:2,estateSize);assert(w*h>previousMap);previousMap=w*h;
    }
  }
});

test('legacy saves retain medium geometry; invalid sizes and mismatched map dimensions are rejected',()=>{
  const s=G.createMatch({mapSeed:42}),raw=JSON.parse(G.serialize(s));delete raw.estateSize;
  const old=G.restore(JSON.stringify(raw));assert(old);assert.equal(old.estateSize,'medium');assert.deepEqual([...G.estate(old).cells],[...G.estate(s).cells]);
  for(const estateSize of ['huge','__proto__',null,{},1,['small']]){assert.throws(()=>G.createMatch({estateSize}));assert.equal(G.restore(JSON.stringify({...raw,estateSize})),null);}
  assert.equal(G.restore(JSON.stringify({...raw,estateSize:'large'})),null);
  assert.deepEqual([s.worldSize,s.worldHeight],[44,19]);
});

test('room creation and settings validate estate sizes and preserve settings after rejected updates',async()=>{
  const service=createServer();await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const socket=new WebSocket(`ws://127.0.0.1:${service.server.address().port}/ws`);
  try{
    await once(socket,'open');
    const request=async message=>{const response=once(socket,'message');socket.send(JSON.stringify(message));return JSON.parse(String((await response)[0]));};
    const created=await request({type:'create',enemyCount:4,difficulty:'hard',estateSize:'large'});assert.equal(created.type,'created');assert.equal(created.estateSize,'large');
    const room=service.rooms.get(created.code);
    for(const estateSize of ['invalid',['mini'],null,{}]){
      const rejected=await request({type:'settings',enemyCount:2,difficulty:'hell',estateSize});assert.equal(rejected.type,'error');
      assert.deepEqual([room.enemyCount,room.difficulty,room.estateSize],[4,'hard','large']);
    }
    const updated=await request({type:'settings',enemyCount:6,difficulty:'beginner',estateSize:'mini'});assert.equal(updated.type,'settings');assert.equal(updated.estateSize,'mini');
    const retained=await request({type:'settings',enemyCount:2});assert.equal(retained.estateSize,'mini');assert.equal(room.estateSize,'mini');
  }finally{socket.terminate();await service.close();}
});
