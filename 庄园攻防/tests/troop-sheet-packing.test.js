'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PNG}=require('pngjs');
const {detectRowCuts}=require('../scripts/prepare-archer-sheet.cjs');
const root=path.resolve(__dirname,'..');
test('row cuts follow empty gutters on a nonuniform source, keeping complete poses',()=>{
 const png=new PNG({width:120,height:300}),bands=[[5,44],[60,99],[112,151],[165,204],[215,254],[266,299]];
 for(const [top,bottom] of bands)for(let y=top;y<=bottom;y++)for(let x=20;x<100;x++)png.data[(y*png.width+x)*4+3]=255;
 const cuts=detectRowCuts(png,6);assert.equal(cuts.length,7);
 bands.forEach(([top,bottom],row)=>{assert(cuts[row]<=top);assert(cuts[row+1]>bottom,'Boots must stay within the source crop');});
 assert(cuts[3]>150,'A fixed sixth would cut this pose');
});
test('production infantry crops include the original boot pixels in each front/back view',()=>{
 const source=PNG.sync.read(fs.readFileSync(path.join(root,'assets/generated/infantry/player-red-source-v2.png')));
 const meta=JSON.parse(fs.readFileSync(path.join(root,'assets/generated/infantry/infantry-player-red.json')));
 // These are actual source boot bands, established by inspecting the complete source.
 const bootBands=[[211,224],[645,660],[1065,1085]];
 for(const frame of meta.frames.filter(f=>f.direction==='front'||f.direction==='back')){
  const band=bootBands[Math.floor((frame.level-1)/3)],rect=frame.source;let boots=0;
  for(let y=band[0];y<=band[1];y++)for(let x=rect.x0;x<rect.x1;x++)if(source.data[(y*source.width+x)*4+3]>=128){
   boots++;assert(y>=rect.y0&&y<rect.y1,`${frame.name}: source boot at y=${y} was clipped`);
  }
  assert(boots>40,`${frame.name}: expected complete source boots`);
 }
});
test('all infantry faction frames keep their common baseline, padding and alpha layout',()=>{
 let alpha;
 for(const faction of ['player-red','ally-green','enemy-purple']){
  const png=PNG.sync.read(fs.readFileSync(path.join(root,`assets/sprites/soldiers/infantry_${faction}.png`)));
  assert.equal(png.width,240);assert.equal(png.height,90);
  const mask=[];
  for(let i=3;i<png.data.length;i+=4){assert([0,255].includes(png.data[i]));mask.push(png.data[i]);}
  if(alpha)assert.deepEqual(mask,alpha);else alpha=mask;
  for(let row=0;row<3;row++)for(let col=0;col<12;col++){
   const at=(x,y)=>png.data[((row*30+y)*png.width+col*20+x)*4+3];let last=-1;
   for(let y=0;y<30;y++)for(let x=0;x<20;x++)if(at(x,y))last=y;
   assert.equal(last,27,`${faction} frame ${row},${col}: consistent boot baseline`);
   for(let x=0;x<20;x++){assert.equal(at(x,28),0);assert.equal(at(x,29),0);}
  }
 }
});

test('level 4–9 infantry side poses keep the same height as front and back poses',()=>{
 for(const faction of ['player-red','ally-green','enemy-purple']){
  const png=PNG.sync.read(fs.readFileSync(path.join(root,`assets/sprites/soldiers/infantry_${faction}.png`)));
  for(let level=4;level<=9;level++){
   const heights=[];
   for(let direction=0;direction<4;direction++){
    const x0=((level-1)%3)*80+direction*20,y0=Math.floor((level-1)/3)*30;
    let top=30,bottom=-1;
    for(let y=0;y<30;y++)for(let x=0;x<20;x++)if(png.data[((y0+y)*png.width+x0+x)*4+3]){top=Math.min(top,y);bottom=Math.max(bottom,y);}
    heights.push(bottom-top+1);
   }
   assert(Math.max(...heights)-Math.min(...heights)<=1,`${faction} level ${level}: turning must not shrink the pose (${heights})`);
  }
 }
});
