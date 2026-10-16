'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{PNG}=require('pngjs');
const G=require('../js/game'),{validate,W,H,pivot,thumbnail}=require('../scripts/prepare-building-v7.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'assets/generated/buildings-redesign/v7');
const metadata=JSON.parse(fs.readFileSync(path.join(work,'buildings-atlas.json'),'utf8'));
const read=file=>PNG.sync.read(fs.readFileSync(file));

test('one regular atlas covers all 25 live building types and all three linked stages',()=>{
  assert.equal(metadata.version,7);assert.equal(metadata.frames.length,75);assert.equal(metadata.columns,9);assert.equal(metadata.rows,9);
  assert.deepEqual([...new Set(metadata.frames.map(f=>f.type))].sort(),Object.keys(G.DEFS).sort());
  assert.equal(new Set(metadata.frames.map(f=>f.image)).size,75);
  const hashes=new Set();
  for(const type of Object.keys(G.DEFS)){
    const family=metadata.frames.filter(f=>f.type===type);assert.deepEqual(family.map(f=>f.stage),[1,2,3]);
    assert.equal(new Set(family.map(f=>f.motif)).size,1);
    for(const [stage,f] of family.entries()){
      const png=read(path.join(work,'ready',type,`level-${stage+1}.png`)),subject=validate(png);
      assert.deepEqual(subject,f.subject);assert.equal(f.frame.width,W);assert.equal(f.frame.height,H);assert.deepEqual(f.pivot,pivot);
      if(type==='farm'){assert.equal(subject.width,48);assert.equal(subject.height,48,'Open rice paddy remains the same square size at every stage');}
      else{
        assert(Math.abs(subject.width-Math.round(f.source.width*f.source.uniformScale))<=1);
        assert(Math.abs(subject.height-Math.round(f.source.height*f.source.uniformScale))<=1,'Pixelization uses one uniform scale, never separate X/Y stretching');
      }
      if(type==='gate')assert.equal(subject.width,64,'Gate stays one tile wide at every tier');
      if(type==='tower')assert(subject.height>subject.width,'Archer tower must have an upright tower silhouette');
      assert.deepEqual(f.gameLevels,stage===0?[1,3]:stage===1?[4,6]:[7,G.maxLevel({type})]);
      hashes.add(crypto.createHash('sha256').update(png.data).digest('hex'));
      if(stage&&type!=='farm'){const prev=family[stage-1].subject;assert(subject.height>prev.height);assert(subject.width*subject.height>prev.width*prev.height,'Higher tier must have a larger main silhouette');}
    }
  }
  assert.equal(hashes.size,75,'No duplicated stage or accidentally reused generic building');
});

test('atlas cells match the staged PNGs exactly, have binary alpha and never spill into neighboring cells',()=>{
  const atlas=read(path.join(work,'buildings-atlas.png'));assert.equal(atlas.width,W*9);assert.equal(atlas.height,H*9);
  for(let i=3;i<atlas.data.length;i+=4)assert(atlas.data[i]===0||atlas.data[i]===255);
  for(const f of metadata.frames){
    const png=read(path.join(work,'ready',f.type,`level-${f.stage}.png`));
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const a=((f.frame.y+y)*atlas.width+f.frame.x+x)*4,b=(y*W+x)*4;
      assert.deepEqual(atlas.data.subarray(a,a+4),png.data.subarray(b,b+4));
    }
  }
  for(let y=H*8;y<H*9;y++)for(let x=W*3;x<W*9;x++)assert.equal(atlas.data[(y*atlas.width+x)*4+3],0,'Unused cells must remain transparent');
});

test('each building has one transparent three-stage sheet with pixel-identical aligned frames',()=>{
  const directory=path.join(work,'by-building'),grouped=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  assert.equal(grouped.version,metadata.version);assert.equal(grouped.buildings.length,25);
  assert.deepEqual(grouped.stageOrder,[1,2,3]);assert.equal(grouped.columns,3);assert.equal(grouped.rows,1);
  assert.deepEqual(fs.readdirSync(directory).filter(f=>f.endsWith('.png')).sort(),Object.keys(G.DEFS).map(type=>`${type}.png`).sort());
  const atlas=read(path.join(work,'buildings-atlas.png'));
  for(const b of grouped.buildings){
    const png=read(path.join(directory,b.image));assert.equal(png.width,W*3);assert.equal(png.height,H);
    assert.deepEqual(b.frames.map(f=>f.stage),[1,2,3]);
    for(const [index,f] of b.frames.entries()){
      const source=metadata.frames.find(s=>s.type===b.type&&s.stage===f.stage);
      assert.deepEqual(f.frame,{x:index*W,y:0,width:W,height:H});assert.deepEqual(f.pivot,pivot);
      assert.deepEqual(f.gameLevels,source.gameLevels);assert.deepEqual(f.subject,source.subject);
      for(let y=0;y<H;y++){
        const a=((source.frame.y+y)*atlas.width+source.frame.x)*4,z=(y*png.width+f.frame.x)*4;
        assert.deepEqual(png.data.subarray(z,z+W*4),atlas.data.subarray(a,a+W*4),'Regrouping must not alter artwork pixels');
      }
    }
  }
  const archive=require('fflate').unzipSync(fs.readFileSync(path.join(work,'buildings-by-type.zip')));
  assert.equal(Object.keys(archive).filter(name=>name.endsWith('.png')).length,25);
  for(const [name,bytes] of Object.entries(archive))assert.deepEqual(Buffer.from(bytes),fs.readFileSync(path.join(directory,name)));
});

test('installed sheets and thumbnails match approved art, with original thumbnails recoverable',()=>{
  const installation=JSON.parse(fs.readFileSync(path.join(work,'installation.json'),'utf8'));
  const overrides=JSON.parse(fs.readFileSync(path.join(root,'assets/generated/fortifications-v8/installation.json'),'utf8')).assets;
  assert.equal(installation.version,7);assert.equal(installation.rulesChanged,false);assert.equal(installation.assets.length,100);
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  for(const record of installation.assets){
    const file=path.join(root,record.image),parts=record.image.split('/'),type=parts.at(-2),name=parts.at(-1);
    const override=overrides.find(f=>f.image===record.image);
    const expected=override?path.join(root,override.ready):name==='stages.png'?path.join(work,'by-building',`${type}.png`):path.join(work,'thumbnails',type,name);
    assert.deepEqual(fs.readFileSync(file),fs.readFileSync(expected));assert.equal(hash(fs.readFileSync(file)),override?.afterHash??record.afterHash);
    if(override)assert.equal(override.beforeHash,record.afterHash,'Gate revision retains its exact previous approved art');
    if(name!=='stages.png'){assert(record.backup);assert.equal(hash(fs.readFileSync(path.join(root,record.backup))),record.beforeHash);}
  }
});

test('UI previews uniformly fit the same artwork without map-frame headroom',()=>{
  for(const f of metadata.frames){
    const native=read(path.join(work,'ready',f.type,`level-${f.stage}.png`)),preview=read(path.join(work,'thumbnails',f.type,`level-${f.stage}.png`));
    assert.equal(preview.width,64);assert.equal(preview.height,64);assert.deepEqual(preview.data,thumbnail(native).data);
    for(let i=3;i<preview.data.length;i+=4)assert(preview.data[i]===0||preview.data[i]===255);
  }
});
