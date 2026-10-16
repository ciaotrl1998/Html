'use strict';
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const {validate,enlarge}=require('./prepare-cavalry-sheet.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'assets/sprites/soldiers'),work=path.join(root,'assets/generated/cavalry');
const FACTIONS={'ally-green':{faction:'ally',hue:171,saturationMin:.34,saturationScale:.85,lightnessScale:.91},'enemy-purple':{faction:'enemy',hue:282,saturationMin:.38,saturationScale:.88,lightnessScale:.84}};
function hsl(r,g,b){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
  if(!d)return [0,0,l];return [((max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60),d/(1-Math.abs(2*l-1)),l];
}
function rgb(h,s,l){
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h/60%2-1)),m=l-c/2;
  return (h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x]).map(value=>Math.round((value+m)*255));
}
function buildFactionMask(source){
  const candidates=new Uint8Array(source.width*source.height),strong=new Uint8Array(candidates.length),mask=new Uint8Array(candidates.length);
  for(let pixel=0;pixel<candidates.length;pixel++){
    const i=pixel*4,[r,g,b,a]=source.data.subarray(i,i+4);if(!a||r===74&&g===46&&b===32)continue;
    const [h,s,l]=hsl(r,g,b),skin=h>10&&h<38&&r>130&&g>80&&b>55;
    // Tight red hue excludes orange/brown horse fur and leather; a connected,
    // strongly red cloth seed excludes isolated warm facial/wooden shadow pixels.
    if(skin||!((h<=12||h>=342)&&s>=.3&&l>.07&&r>=55&&r-Math.max(g,b)>=18))continue;
    candidates[pixel]=1;if(r>=95&&(h<=10||h>=350)&&s>=.5)strong[pixel]=1;
  }
  const visited=new Uint8Array(candidates.length);
  for(let start=0;start<candidates.length;start++){
    if(!candidates[start]||visited[start])continue;
    const component=[start];visited[start]=1;let seeded=false;
    for(let n=0;n<component.length;n++){
      const pixel=component[n],x=pixel%source.width,y=Math.floor(pixel/source.width);seeded||=!!strong[pixel];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!(dx||dy))continue;const xx=x+dx,yy=y+dy;
        if(xx<0||yy<0||xx>=source.width||yy>=source.height||Math.floor(xx/30)!==Math.floor(x/30)||Math.floor(yy/45)!==Math.floor(y/45))continue;
        const next=yy*source.width+xx;if(candidates[next]&&!visited[next]){visited[next]=1;component.push(next);}
      }
    }
    if(seeded)for(const pixel of component)mask[pixel]=1;
  }
  return mask;
}
function recolor(source,mask,palette){
  const result=new PNG({width:source.width,height:source.height});source.data.copy(result.data);
  for(let pixel=0;pixel<mask.length;pixel++)if(mask[pixel]){
    const i=pixel*4,[,s,l]=hsl(...source.data.subarray(i,i+3));
    const color=rgb(palette.hue,Math.min(.7,Math.max(palette.saturationMin,s*palette.saturationScale)),Math.max(.07,Math.min(.68,l*palette.lightnessScale)));
    for(let ch=0;ch<3;ch++)result.data[i+ch]=color[ch];
  }
  return result;
}
function generate(replace=false){
  for(const faction of Object.keys(FACTIONS))if(fs.existsSync(path.join(directory,`cavalry_${faction}.png`))&&!replace)throw Error(`cavalry_${faction}.png already exists; use --replace to regenerate.`);
  const source=PNG.sync.read(fs.readFileSync(path.join(directory,'cavalry_player-red.png')));validate(source);
  const metadata=JSON.parse(fs.readFileSync(path.join(work,'cavalry-player-red.json'),'utf8')),mask=buildFactionMask(source);
  const maskImage=new PNG({width:source.width,height:source.height});maskImage.data.fill(0);
  for(let p=0;p<mask.length;p++)if(mask[p])maskImage.data.fill(255,p*4,p*4+4);
  fs.writeFileSync(path.join(work,'faction-accent-mask.png'),PNG.sync.write(maskImage));
  for(const [faction,palette] of Object.entries(FACTIONS)){
    const result=recolor(source,mask,palette),checks=validate(result),image=`assets/sprites/soldiers/cavalry_${faction}.png`;
    fs.writeFileSync(path.join(root,image),PNG.sync.write(result));
    for(const scale of [4,8])fs.writeFileSync(path.join(work,`cavalry-${faction}-preview-${scale}x.png`),PNG.sync.write(enlarge(result,scale)));
    fs.writeFileSync(path.join(work,`cavalry-${faction}.json`),JSON.stringify({...metadata,image,faction:palette.faction,sourceImage:'assets/sprites/soldiers/cavalry_player-red.png',palette:{...palette,sourceAccent:'red faction cloth',mask:'assets/generated/cavalry/faction-accent-mask.png',recoloredPixels:mask.reduce((sum,n)=>sum+n,0),nonAccentUnchanged:true,alphaUnchanged:true},validation:checks},null,2)+'\n');
    console.log(JSON.stringify({image,width:result.width,height:result.height,frameWidth:30,frameHeight:45,frames:checks.length,recoloredPixels:mask.reduce((sum,n)=>sum+n,0)}));
  }
}
if(require.main===module)generate(process.argv.includes('--replace'));
module.exports={buildFactionMask,recolor,FACTIONS};
