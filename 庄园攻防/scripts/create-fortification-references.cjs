'use strict';
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const {blit,enlarge}=require('./prepare-building-atlas.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'assets/generated/fortifications-v8');
fs.mkdirSync(out,{recursive:true});
const style=new PNG({width:576,height:768});style.data.fill(0);
['gate','shrine','inn'].forEach((type,row)=>blit(enlarge(PNG.sync.read(fs.readFileSync(path.join(root,`assets/generated/buildings-redesign/v7/by-building/${type}.png`))),2),style,0,row*256));
fs.writeFileSync(path.join(out,'style-reference.png'),PNG.sync.write(style));
const guide=new PNG({width:1280,height:1280});guide.data.fill(0);
for(let mask=0;mask<16;mask++){
  const ox=mask%4*320+32,oy=Math.floor(mask/4)*320+32;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(x>=48&&x<208&&y>=48&&y<208||mask&1&&x>=48&&x<208&&y<128||mask&2&&y>=48&&y<208&&x>=128||mask&4&&x>=48&&x<208&&y>=128||mask&8&&y>=48&&y<208&&x<128){
    const i=((oy+y)*guide.width+ox+x)*4;guide.data[i]=guide.data[i+1]=guide.data[i+2]=245;guide.data[i+3]=255;
  }
}
fs.writeFileSync(path.join(out,'wall-layout-guide.png'),PNG.sync.write(guide));
const gates=new PNG({width:960,height:640});gates.data.fill(0);
for(let row=0;row<2;row++)for(let stage=0;stage<3;stage++){
  const w=row?106:154,h=[164,202,240][stage],left=stage*320+Math.floor((320-w)/2),top=row*320+280-h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=((top+y)*gates.width+left+x)*4;gates.data[i]=gates.data[i+1]=gates.data[i+2]=245;gates.data[i+3]=255;}
}
fs.writeFileSync(path.join(out,'gate-height-guide.png'),PNG.sync.write(gates));
const sides=new PNG({width:960,height:360});sides.data.fill(0);
for(let stage=0;stage<3;stage++){
  const w=120,h=[204,264,312][stage],left=stage*320+100,top=340-h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=((top+y)*sides.width+left+x)*4;sides.data[i]=sides.data[i+1]=sides.data[i+2]=245;sides.data[i+3]=255;}
}
fs.writeFileSync(path.join(out,'gate-side-height-guide.png'),PNG.sync.write(sides));
const sourceFile=path.join(out,'sources/gates.png');
if(fs.existsSync(sourceFile)){const p=PNG.sync.read(fs.readFileSync(sourceFile)),side=new PNG({width:p.width,height:p.height-500});PNG.bitblt(p,side,0,500,p.width,p.height-500,0,0);fs.writeFileSync(path.join(out,'gate-side-reference.png'),PNG.sync.write(side));}
