'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{PNG}=require('pngjs'),G=require('../js/game');
const {work,W,H,pivot}=require('../scripts/prepare-gate-destruction.cjs'),{bounds}=require('../scripts/prepare-building-atlas.cjs');
const root=path.resolve(__dirname,'..'),meta=JSON.parse(fs.readFileSync(path.join(work,'manifest.json'),'utf8'));
const read=file=>PNG.sync.read(fs.readFileSync(path.join(root,file)));
test('exactly two shared destroyed states retain orthogonal footprints, ground pivots and open passages',()=>{
  assert.equal(meta.states.length,2);assert.deepEqual(meta.states.map(s=>s.orientation),['ns','ew']);
  for(const s of meta.states){
    const p=read(s.image);assert.equal(p.width,W);assert.equal(p.height,H);assert.deepEqual(s.pivot,pivot);assert.deepEqual(s.subject,bounds(p));assert.equal(s.subject.bottom,119);
    assert.deepEqual(s.sharedLevels,[1,15]);assert(Math.abs(s.subject.width-Math.round(s.source.width*s.source.uniformScale))<=1);assert(Math.abs(s.subject.height-Math.round(s.source.height*s.source.uniformScale))<=1);
    if(s.orientation==='ns'){
      assert(s.subject.width>s.subject.height);for(let y=0;y<H;y++)assert.equal(p.data[(y*W+48)*4+3],0,'Vertical NS passage stays transparent');
    }else{
      assert(s.subject.height>s.subject.width);for(let x=0;x<W;x++)assert.equal(p.data[(88*W+x)*4+3],0,'Horizontal EW passage stays transparent');
    }
  }
});
test('four installed PNGs are binary transparent and the packaged artwork matches the live files',()=>{
  const install=JSON.parse(fs.readFileSync(path.join(work,'installation.json'),'utf8')),zip=require('fflate').unzipSync(fs.readFileSync(path.join(work,'gate-destruction-v9.zip')));
  assert.equal(install.rulesChanged,false);assert.equal(install.assets.length,4);
  for(const s of install.assets){const bytes=fs.readFileSync(path.join(root,s.image)),p=PNG.sync.read(bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),s.sha256);assert.deepEqual(bytes,Buffer.from(zip[s.image]));for(let i=0;i<p.data.length;i+=4){assert(p.data[i+3]===0||p.data[i+3]===255);if(!p.data[i+3])assert.equal(p.data.readUInt32BE(i),0);}}
});
test('existing saves retain zero-health gate directions without adding new gameplay state',()=>{
  const s=G.createMatch({mode:'single',enemyCount:4,mapSeed:42,rotation:0}),gates=s.buildings.filter(b=>b.type==='gate'&&b.owner===0);
  assert.equal(gates.length,4);for(const b of gates)b.hp=0;
  const loaded=G.restore(G.serialize(s));assert(loaded);
  for(const b of gates){const gate=loaded.buildings.find(g=>g.id===b.id);assert.equal(gate.hp,0);assert.equal(gate.direction,b.direction);assert.equal(gate.level,b.level);}
});
