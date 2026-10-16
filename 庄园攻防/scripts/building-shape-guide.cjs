'use strict';
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const work=path.resolve(__dirname,'../assets/generated/buildings-redesign');
const design=JSON.parse(fs.readFileSync(path.join(work,'designs.json'),'utf8'));
const profile=type=>type==='farm'?[[48,48],[48,48],[48,48]]:type==='gate'?[[64,44],[64,56],[64,68]]:type==='shrine'?[[50,42],[54,50],[58,58]]:type==='tower'?[[34,52],[38,60],[42,68]]:['guild','port'].includes(type)?[[52,42],[56,50],[60,58]]:[[34,30],[38,38],[42,46]];
const guide=new PNG({width:1440,height:1728});guide.data.fill(0);
for(const [index,b] of design.buildings.entries())for(let stage=0;stage<3;stage++){
  const [w,h]=profile(b.id)[stage],x=(index%3*3+stage)*160+(80-w),y=Math.floor(index/3)*192+176-h*2;
  for(let py=0;py<h*2;py++)for(let px=0;px<w*2;px++){
    const i=((y+py)*guide.width+x+px)*4,edge=px<2||py<2||px>=w*2-2||py>=h*2-2;
    guide.data[i]=edge?72:160;guide.data[i+1]=edge?105:171;guide.data[i+2]=edge?128:180;guide.data[i+3]=255;
  }
}
fs.writeFileSync(path.join(work,'v4-shape-guide.png'),PNG.sync.write(guide));
console.log(path.join(work,'v4-shape-guide.png'));
