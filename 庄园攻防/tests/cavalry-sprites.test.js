'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const {validate,applyExteriorContour}=require('../scripts/prepare-cavalry-sheet.cjs');
const root=path.resolve(__dirname,'..'),read=file=>PNG.sync.read(fs.readFileSync(path.join(root,file)));

test('cavalry uses 30x45 frames, 36 poses, hoof baselines and mirrored side views',()=>{
  const atlas=read('assets/sprites/soldiers/cavalry_player-red.png');assert.equal(validate(atlas).length,36);
  assert.equal(atlas.width,360);assert.equal(atlas.height,135);
  for(const type of ['infantry','archer']){const foot=read(`assets/sprites/soldiers/${type}_player-red.png`);assert.equal(foot.width,240);assert.equal(foot.height,90);assert(atlas.width>foot.width&&atlas.height>foot.height);}
});

test('only dark exterior colors change; alpha, silhouettes, highlights and all interior pixels remain exact',()=>{
  const before=read('assets/generated/cavalry/unoutlined-30x45.png'),after=read('assets/sprites/soldiers/cavalry_player-red.png');
  assert.equal(before.width,after.width);assert.equal(before.height,after.height);let changed=0;
  for(let row=0;row<3;row++)for(let col=0;col<12;col++){
    const offset=(x,y)=>((row*45+y)*after.width+col*30+x)*4;
    const opaque=(x,y)=>x>=0&&x<30&&y>=0&&y<45&&before.data[offset(x,y)+3]>0;
    for(let y=0;y<45;y++)for(let x=0;x<30;x++){
      const i=offset(x,y);assert.equal(before.data[i+3],after.data[i+3]);
      const differs=[0,1,2].some(ch=>before.data[i+ch]!==after.data[i+ch]);
      const boundary=opaque(x,y)&&(!opaque(x-1,y)||!opaque(x+1,y)||!opaque(x,y-1)||!opaque(x,y+1));
      const shade=.2126*before.data[i]+.7152*before.data[i+1]+.0722*before.data[i+2];
      if(boundary&&shade<90)assert.deepEqual([...after.data.subarray(i,i+3)],[74,46,32]);
      else assert.equal(differs,false,'Non-outline pixel was modified');
      if(differs)changed++;
    }
  }
  assert(changed>0);const bytes=Buffer.from(after.data);assert.equal(applyExteriorContour(after),0);assert(after.data.equals(bytes),'Reapplying the outline must be idempotent');
});

test('all cavalry factions share exact 30x45 poses, alpha masks and brown outlines; only faction cloth changes',()=>{
  const {buildFactionMask,FACTIONS}=require('../scripts/prepare-cavalry-factions.cjs');
  const player=read('assets/sprites/soldiers/cavalry_player-red.png'),mask=buildFactionMask(player);
  for(const faction of Object.keys(FACTIONS)){
    const png=read(`assets/sprites/soldiers/cavalry_${faction}.png`);assert.equal(validate(png).length,36);let changed=0;
    for(let pixel=0;pixel<mask.length;pixel++){
      const i=pixel*4;assert.equal(png.data[i+3],player.data[i+3]);
      if(mask[pixel]){assert.notDeepEqual(png.data.subarray(i,i+3),player.data.subarray(i,i+3));changed++;if(faction==='ally-green')assert(png.data[i+1]>png.data[i]&&png.data[i+2]>png.data[i]);else assert(png.data[i+2]>png.data[i+1]&&png.data[i]>png.data[i+1]);}
      else assert.deepEqual(png.data.subarray(i,i+4),player.data.subarray(i,i+4),'Non-faction material or outline changed');
    }
    assert(changed>200);
    for(let row=0;row<3;row++)for(let col=0;col<12;col++){let count=0;for(let y=0;y<45;y++)for(let x=0;x<30;x++)count+=mask[(row*45+y)*png.width+col*30+x];assert(count>=2,'Every level and direction has faction accents');}
    const metadata=JSON.parse(fs.readFileSync(path.join(root,`assets/generated/cavalry/cavalry-${faction}.json`),'utf8'));
    assert.equal(metadata.frames.length,36);assert(metadata.frames.every(f=>f.frame.width===30&&f.frame.height===45));assert.deepEqual(metadata.pivot,{x:15,y:43});
  }
});
