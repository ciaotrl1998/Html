'use strict';
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const {extractSprite}=require('./prepare-archer-sheet.cjs');
const work=path.resolve(__dirname,'../assets/generated/buildings-redesign/v7');
const batches=JSON.parse(fs.readFileSync(path.join(work,'batches.json'),'utf8'));
function clean(file){const p=PNG.sync.read(fs.readFileSync(file));for(let i=0;i<p.data.length;i+=4){if(p.data[i+3]>=220)p.data[i+3]=255;else p.data.fill(0,i,i+4);}return p;}
function cuts(p,axis,count){
  const length=axis==='x'?p.width:p.height,counts=new Uint32Array(length),step=length/count,out=[0];
  for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(p.data[(y*p.width+x)*4+3])counts[axis==='x'?x:y]++;
  for(let n=1;n<count;n++){
    const center=n*step,start=Math.max(out.at(-1)+1,Math.floor(center-step*.35)),end=Math.min(length-1,Math.ceil(center+step*.35));let minimum=Infinity;
    for(let at=start;at<=end;at++)minimum=Math.min(minimum,counts[at]);
    let run=-1;const runs=[];for(let at=start;at<=end+1;at++){if(at<=end&&counts[at]===minimum){if(run<0)run=at;}else if(run>=0){runs.push([run,at-1]);run=-1;}}
    runs.sort((a,b)=>Math.abs((a[0]+a[1])/2-center)-Math.abs((b[0]+b[1])/2-center));out.push(Math.round((runs[0][0]+runs[0][1])/2));
  }
  return [...out,length];
}
function loadBatch(key,original=false){
  const refined=path.join(work,'sources',`${key}-height.png`),file=!original&&fs.existsSync(refined)?refined:path.join(work,'sources',`${key}.png`),p=clean(file);
  const manual=key==='a'&&file===refined;
  const x=manual?[0,630,916,1536]:cuts(p,'x',3),y=manual?[0,224,398,598,766,907,1024]:cuts(p,'y',batches[key].length);
  return {p,x,y,file};
}
function extract(batch,row,col){return extractSprite(batch.p,{x0:batch.x[col],x1:batch.x[col+1],y0:batch.y[row],y1:batch.y[row+1]});}
function lowReference(key){
  const batch=loadBatch(key,true),out=new PNG({width:768,height:Math.ceil(batches[key].length/3)*256});out.data.fill(0);
  batches[key].forEach((type,index)=>{const s=extract(batch,index,0),scale=Math.min(200/s.width,210/s.height),w=Math.round(s.width*scale),h=Math.round(s.height*scale),left=index%3*256+Math.floor((256-w)/2),top=Math.floor(index/3)*256+232-h;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const from=(Math.min(s.height-1,Math.floor(y/scale))*s.width+Math.min(s.width-1,Math.floor(x/scale)))*4;s.data.copy(out.data,((top+y)*out.width+left+x)*4,from,from+4);}
  });
  fs.writeFileSync(path.join(work,`${key}-low-reference.png`),PNG.sync.write(out));
}
if(require.main===module){
  if(process.argv[2]==='references'){for(const key of Object.keys(batches))lowReference(key);process.exit();}
  const batch=loadBatch('a',true),out=new PNG({width:768,height:512});out.data.fill(0);
  batches.a.forEach((type,index)=>{const s=extract(batch,index,0),scale=Math.min(200/s.width,210/s.height),w=Math.round(s.width*scale),h=Math.round(s.height*scale),left=index%3*256+Math.floor((256-w)/2),top=Math.floor(index/3)*256+232-h;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const from=(Math.min(s.height-1,Math.floor(y/scale))*s.width+Math.min(s.width-1,Math.floor(x/scale)))*4;s.data.copy(out.data,((top+y)*out.width+left+x)*4,from,from+4);}
  });
  fs.writeFileSync(path.join(work,'key-low-reference.png'),PNG.sync.write(out));
  for(const key of Object.keys(batches)){const b=loadBatch(key);console.log(key,b.x,b.y,JSON.stringify(batches[key].map((type,row)=>({type,size:[0,1,2].map(col=>{const s=extract(b,row,col);return [s.width,s.height];})}))));}
}
module.exports={work,batches,clean,cuts,loadBatch,extract,lowReference};
