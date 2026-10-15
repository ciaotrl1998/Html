'use strict';
// A one-pixel silhouette contour only. Internal dark strokes inherit the nearby
// cloth/leather/metal color instead of receiving the contour's brown palette.
// Run on freshly packed/faction-colored atlases; never on the old all-brown pass.
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const root=path.resolve(__dirname,'..');
const requestedType=process.argv.find(arg=>arg.startsWith('--type='))?.slice(7);
if(requestedType&&!['infantry','archer'].includes(requestedType))throw Error('Unsupported troop type');
const luminance=(r,g,b)=>.2126*r+.7152*g+.0722*b;
function family(r,g,b){
 if(Math.max(r,g,b)-Math.min(r,g,b)<35)return 'neutral';
 if(b>r*1.1&&b>g*.95)return 'blue';
 if(g>r*1.08&&g>b*.8)return 'green';
 if(b>g*1.3&&r>g*1.2)return 'purple';
 if(r>g*1.6&&r>b*1.5)return 'red';
 if(r>145&&g>105&&b>60&&r>g*1.05&&r>b*1.2)return 'skin-gold';
 return 'leather-gold';
}
for(const type of requestedType?[requestedType]:['infantry','archer'])for(const faction of ['player-red','ally-green','enemy-purple']){
 const file=path.join(root,`assets/sprites/soldiers/${type}_${faction}.png`),png=PNG.sync.read(fs.readFileSync(file)),original=Buffer.from(png.data);let contours=0,interiors=0;
 for(let row=0;row<3;row++)for(let col=0;col<12;col++){
  const offset=(x,y)=>((row*30+y)*png.width+col*20+x)*4;
  const opaque=(x,y)=>x>=0&&x<20&&y>=0&&y<30&&original[offset(x,y)+3]>0;
  const boundary=(x,y)=>!opaque(x-1,y)||!opaque(x+1,y)||!opaque(x,y-1)||!opaque(x,y+1);
  for(let y=0;y<30;y++)for(let x=0;x<20;x++){
   if(!opaque(x,y))continue;
   const i=offset(x,y),r=original[i],g=original[i+1],b=original[i+2],shade=luminance(r,g,b);
   if(boundary(x,y)){
    if(shade<90){png.data[i]=74;png.data[i+1]=46;png.data[i+2]=32;contours++;}
    continue;
   }
   if(shade>=68)continue;
   let skinNeighbors=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&opaque(x+dx,y+dy)){
    const n=offset(x+dx,y+dy),nr=original[n],ng=original[n+1],nb=original[n+2];
    if(nr>145&&ng>105&&nb>65&&nr>ng*1.05&&nr>nb*1.2)skinNeighbors++;
   }
   // Eyes remain tiny facial features, rather than becoming patches of skin.
   if(y<19&&skinNeighbors>=3&&shade<50)continue;
   const groups=new Map();
   for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    if(!(dx||dy)||!opaque(x+dx,y+dy))continue;
    const n=offset(x+dx,y+dy),nr=original[n],ng=original[n+1],nb=original[n+2],light=luminance(nr,ng,nb);
    if(light<72)continue;
    const weight=(boundary(x+dx,y+dy)?.35:1)/Math.pow(dx*dx+dy*dy,1.5),key=family(nr,ng,nb);
    const group=groups.get(key)||{weight:0,r:0,g:0,b:0};
    group.weight+=weight;group.r+=nr*weight;group.g+=ng*weight;group.b+=nb*weight;groups.set(key,group);
   }
   const group=[...groups.values()].sort((a,b)=>b.weight-a.weight)[0];
   if(group){
    // Use a modest material shadow, with no separate dark stroke inside the body.
    const color=[group.r/group.weight,group.g/group.weight,group.b/group.weight];
    const factor=Math.min(.88,Math.max(.65,78/luminance(...color)));
    for(let ch=0;ch<3;ch++)png.data[i+ch]=Math.round(color[ch]*factor);
   }else{
    const gain=Math.max(1,78/Math.max(1,shade));for(let ch=0;ch<3;ch++)png.data[i+ch]=Math.min(180,Math.round(original[i+ch]*gain));
   }
   interiors++;
  }
 }
 fs.writeFileSync(file,PNG.sync.write(png));
 if(faction==='player-red'){
  const scale=8,preview=new PNG({width:png.width*scale,height:png.height*scale});
  for(let y=0;y<preview.height;y++)for(let x=0;x<preview.width;x++){
   const from=(Math.floor(y/scale)*png.width+Math.floor(x/scale))*4;png.data.copy(preview.data,(y*preview.width+x)*4,from,from+4);
  }
  const dir=type==='archer'?'archers':'infantry';fs.writeFileSync(path.join(root,`assets/generated/${dir}/${type}-player-red-preview-8x.png`),PNG.sync.write(preview));
 }
 console.log(`${type}_${faction}: ${contours} thin exterior contour pixels; ${interiors} interior pixels restored to material colors`);
}
