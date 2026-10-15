'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {PNG}=require('pngjs');

const directory=path.join(__dirname,'../assets/sprites/soldiers');
const type=process.argv.find(arg=>arg.startsWith('--type='))?.slice(7)||'archer';
if(!['archer','infantry'].includes(type))throw Error('Unsupported troop type');
const source=PNG.sync.read(fs.readFileSync(path.join(directory,`${type}_player-red.png`)));
function hsl(r,g,b){
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
  if(!d)return [0,0,l];
  const s=d/(1-Math.abs(2*l-1));
  return [((max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60),s,l];
}
function rgb(h,s,l){
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h/60%2-1)),m=l-c/2;
  const triplet=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return triplet.map(value=>Math.round((value+m)*255));
}
const seeds=new Set();
for(let pixel=0;pixel<source.width*source.height;pixel++){
  const i=pixel*4;if(!source.data[i+3])continue;
  const [r,g,b]=source.data.subarray(i,i+3),[h,s,l]=hsl(r,g,b);
  if((h<=17||h>=342)&&s>=.3&&l>.08&&r-Math.max(g,b)>=18)seeds.add(pixel);
}
for(const [faction,hue] of [['ally-green',171],['enemy-purple',282]]){
  const result=new PNG({width:source.width,height:source.height});source.data.copy(result.data);
  for(let pixel=0;pixel<source.width*source.height;pixel++){
    const i=pixel*4;if(!source.data[i+3])continue;
    const [r,g,b]=source.data.subarray(i,i+3),[h,s,l]=hsl(r,g,b);
    const x=pixel%source.width,y=Math.floor(pixel/source.width);
    let nearby=false;
    for(let dy=-1;dy<=1&&!nearby;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,yy=y+dy;
      if(xx>=0&&xx<source.width&&yy>=0&&yy<source.height&&seeds.has(yy*source.width+xx))nearby=true;
    }
    const skin=h>10&&h<38&&r>130&&g>80&&b>55;
    if(!seeds.has(pixel)&&!(nearby&&!skin&&(h<=26||h>=335)&&s>=.32&&r-Math.max(g,b)>=12))continue;
    const color=rgb(hue,Math.min(.7,Math.max(.34,s*.85)),Math.max(.07,Math.min(.68,l*(hue===171?.91:.84))));
    for(let ch=0;ch<3;ch++)result.data[i+ch]=color[ch];
  }
  const output=path.join(directory,`${type}_${faction}.png`);
  fs.writeFileSync(output,PNG.sync.write(result));console.log(output);
}
