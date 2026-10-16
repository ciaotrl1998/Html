'use strict';
// Pack generated artwork only: character art is supplied by imagegen, never drawn here.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PNG}=require('pngjs');
const {detectRowCuts,extractSprite}=require('./prepare-archer-sheet.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'assets/generated/cavalry');
const output=path.join(root,'assets/sprites/soldiers/cavalry_player-red.png');
const directions=['front','back','left','right'];
// Mounted troops are intentionally larger than the existing 20x30 foot soldiers.
const W=30,H=45,BASELINE=43,ATLAS_WIDTH=W*12,ATLAS_HEIGHT=H*3;
const CONTOUR_COLOR=[74,46,32]; // Same #4A2E20 as warm-soldier-outlines.cjs.

function applyExteriorContour(atlas){
  const original=Buffer.from(atlas.data);let changed=0;
  for(let row=0;row<3;row++)for(let col=0;col<12;col++){
    const offset=(x,y)=>((row*H+y)*atlas.width+col*W+x)*4;
    const opaque=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&original[offset(x,y)+3]>0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      if(!opaque(x,y))continue;
      const i=offset(x,y),shade=.2126*original[i]+.7152*original[i+1]+.0722*original[i+2];
      const boundary=!opaque(x-1,y)||!opaque(x+1,y)||!opaque(x,y-1)||!opaque(x,y+1);
      // Reuse only the existing dark-edge recolor rule, never the infantry
      // interior-restoration pass: all cavalry material pixels must stay exact.
      if(!boundary||shade>=90)continue;
      if(CONTOUR_COLOR.some((value,ch)=>value!==original[i+ch]))changed++;
      for(let ch=0;ch<3;ch++)atlas.data[i+ch]=CONTOUR_COLOR[ch];
    }
  }
  return changed;
}

function fitFrame(sprite,scale){
  const frame=new PNG({width:W,height:H});frame.data.fill(0);
  const width=Math.max(1,Math.round(sprite.width*scale)),height=Math.max(1,Math.round(sprite.height*scale)),left=Math.floor((W-width)/2),top=BASELINE-height;
  // Preserve source palette and hard pixel edges; area averaging makes tiny riders muddy.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=Math.min(sprite.width-1,Math.floor((x+.5)*sprite.width/width)),sy=Math.min(sprite.height-1,Math.floor((y+.5)*sprite.height/height));
    const from=(sy*sprite.width+sx)*4,to=((top+y)*W+left+x)*4;sprite.data.copy(frame.data,to,from,from+4);
  }
  return frame;
}
function blit(frame,atlas,left,top,mirror=false){
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const from=(y*W+x)*4,to=((top+y)*atlas.width+left+(mirror?W-1-x:x))*4;
    frame.data.copy(atlas.data,to,from,from+4);
  }
}
function enlarge(png,scale){
  const result=new PNG({width:png.width*scale,height:png.height*scale});
  for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++){
    const from=(Math.floor(y/scale)*png.width+Math.floor(x/scale))*4;
    png.data.copy(result.data,(y*result.width+x)*4,from,from+4);
  }
  return result;
}
function validate(atlas){
  assert.equal(atlas.width,ATLAS_WIDTH);assert.equal(atlas.height,ATLAS_HEIGHT);
  const bounds=[];
  for(let level=1;level<=9;level++)for(let direction=0;direction<4;direction++){
    const x0=(((level-1)%3)*4+direction)*W,y0=Math.floor((level-1)/3)*H;
    let pixels=0,left=W,right=-1,top=H,bottom=-1;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const alpha=atlas.data[((y0+y)*ATLAS_WIDTH+x0+x)*4+3];assert(alpha===0||alpha===255);
      if(!alpha)continue;pixels++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    assert(pixels>150,`Empty or fragmented frame: level ${level}, ${directions[direction]}`);
    assert(left>=1&&right<=W-2&&top>=1&&bottom===BASELINE-1,`Frame padding or hoof baseline mismatch: level ${level}, ${directions[direction]}`);
    if(direction===3)for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let channel=0;channel<4;channel++){
      const rightPixel=((y0+y)*ATLAS_WIDTH+x0+x)*4+channel,leftPixel=((y0+y)*ATLAS_WIDTH+x0-W+W-1-x)*4+channel;
      assert.equal(atlas.data[rightPixel],atlas.data[leftPixel],'Side views must be exact mirrors');
    }
    bounds.push({level,direction:directions[direction],pixels,bounds:{left,top,right,bottom}});
  }
  return bounds;
}

function pack(input,replace=false){
  if(fs.existsSync(output)&&!replace)throw Error('Cavalry atlas already exists; use --replace only to replace this generated asset.');
  const source=PNG.sync.read(fs.readFileSync(input)),cuts=detectRowCuts(source,6),atlas=new PNG({width:ATLAS_WIDTH,height:ATLAS_HEIGHT}),frames=[];
  atlas.data.fill(0);
  for(let level=1;level<=9;level++){
    const groupX=(level-1)%3,groupY=Math.floor((level-1)/3);
    const extracted=directions.slice(0,3).map((direction,index)=>{
      const col=groupX*2+index%2,row=groupY*2+Math.floor(index/2);
      const rectangle={x0:Math.floor(col*source.width/6),x1:Math.floor((col+1)*source.width/6),y0:cuts[row],y1:cuts[row+1]};
      return {sprite:extractSprite(source,rectangle),rectangle};
    });
    // A common scale per level keeps front/back/profile mounts in the same world scale.
    const targetHeight=level<=3?39:level<=6?40:41;
    const scale=Math.min(...extracted.map(({sprite})=>Math.min((W-4)/sprite.width,targetHeight/sprite.height)));
    const fitted=extracted.map(({sprite})=>fitFrame(sprite,scale));
    for(let index=0;index<4;index++){
      const x=(groupX*4+index)*W,y=groupY*H,canonical=Math.min(index,2);
      blit(fitted[canonical],atlas,x,y,index===3);
      frames.push({name:`cavalry_lv${level}_${directions[index]}`,level,direction:directions[index],frame:{x,y,width:W,height:H},pivot:{x:W/2,y:BASELINE},source:extracted[canonical].rectangle,mirrored:index===3});
    }
  }
  fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
  const unoutlinedPath=path.join(directory,`unoutlined-${W}x${H}.png`);
  fs.writeFileSync(unoutlinedPath,PNG.sync.write(atlas));
  const contourPixelsChanged=applyExteriorContour(atlas),checks=validate(atlas);
  const preview=path.join(directory,'cavalry-player-red-preview-4x.png'),metadata=path.join(directory,'cavalry-player-red.json');
  fs.writeFileSync(output,PNG.sync.write(atlas));fs.writeFileSync(preview,PNG.sync.write(enlarge(atlas,4)));
  fs.writeFileSync(path.join(directory,'cavalry-player-red-preview-8x.png'),PNG.sync.write(enlarge(atlas,8)));
  fs.writeFileSync(metadata,JSON.stringify({image:'assets/sprites/soldiers/cavalry_player-red.png',type:'cavalry',faction:'player',width:ATLAS_WIDTH,height:ATLAS_HEIGHT,frameWidth:W,frameHeight:H,columns:12,rows:3,levels:9,directionOrder:directions,pivot:{x:W/2,y:BASELINE},outline:{color:'#4A2E20',darkEdgeLuminanceThreshold:90,interiorChanged:false,alphaChanged:false},unoutlinedImage:path.relative(root,unoutlinedPath).replaceAll('\\','/'),footSoldierReference:{frameWidth:20,frameHeight:30},sourceImage:path.relative(root,input).replaceAll('\\','/'),sourceRowCuts:cuts,frames,validation:checks},null,2)+'\n');
  console.log(JSON.stringify({output,preview,metadata,frames:frames.length,contourPixelsChanged,validated:true}));
}
if(require.main===module){
  if(process.argv[2]==='validate')console.log(JSON.stringify({frames:validate(PNG.sync.read(fs.readFileSync(output))).length,validated:true}));
  else if(process.argv[2])pack(path.resolve(process.argv[2]),process.argv.includes('--replace'));
  else throw Error('Use: node scripts/prepare-cavalry-sheet.cjs source.png [--replace] | validate');
}
module.exports={validate,applyExteriorContour,enlarge};
