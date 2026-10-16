'use strict';
// Imagegen supplies the actual ruins. Only crop, uniform nearest-neighbor
// pixelization, transparent-edge cleanup and game-frame packing happen here.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{PNG}=require('pngjs');
const {clean}=require('./building-v7-source.cjs'),{bounds,blit,enlarge}=require('./prepare-building-atlas.cjs'),{thumbnail}=require('./prepare-building-v7.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'assets/generated/gate-destruction-v9'),W=96,H=128,pivot={x:48,y:120};
function blank(w,h){const p=new PNG({width:w,height:h});p.data.fill(0);return p;}
function save(file,png){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,PNG.sync.write(png));}
function json(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
function cropAll(p,rect){
  // Both disconnected remnants are part of ONE sprite; do not discard the
  // north pile as a stray previous-row component.
  const cell=blank(rect.x1-rect.x0,rect.y1-rect.y0);PNG.bitblt(p,cell,rect.x0,rect.y0,cell.width,cell.height,0,0);
  const b=bounds(cell),out=blank(b.width,b.height);assert(b.pixels>100);PNG.bitblt(cell,out,b.left,b.top,b.width,b.height,0,0);return out;
}
function frameFrom(sprite,orientation){
  const scale=orientation==='ns'?64/sprite.width:64/sprite.height,width=Math.round(sprite.width*scale),height=Math.round(sprite.height*scale),frame=blank(W,H);
  assert(width<=72&&height<=72,'Ruins must remain inside a single gate footprint plus small debris margin');
  const left=Math.floor((W-width)/2),top=pivot.y-height;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=Math.min(sprite.width-1,Math.floor((x+.5)/scale)),sy=Math.min(sprite.height-1,Math.floor((y+.5)/scale)),from=(sy*sprite.width+sx)*4,to=((top+y)*W+left+x)*4;
    if(sprite.data[from+3]){for(let c=0;c<3;c++)frame.data[to+c]=Math.min(255,Math.round(sprite.data[from+c]/8)*8);frame.data[to+3]=255;}
  }
  const data=Buffer.from(frame.data),solid=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&data[(y*W+x)*4+3]>0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(solid(x,y)&&(!solid(x-1,y)||!solid(x+1,y)||!solid(x,y-1)||!solid(x,y+1))){const i=(y*W+x)*4;frame.data[i]=74;frame.data[i+1]=46;frame.data[i+2]=32;}
  return {frame,scale,subject:bounds(frame)};
}
function pack(){
  const ns=clean(path.join(work,'sources/first.png')),ew=clean(path.join(work,'sources/ew.png')),records=[],preview=blank(W*2,H),archive={};
  for(const [index,orientation] of ['ns','ew'].entries()){
    const source=index?ew:ns,rect={x0:0,y0:0,x1:index?source.width:Math.floor(source.width*.58),y1:source.height},sprite=cropAll(source,rect),out=frameFrom(sprite,orientation);
    const name=index?'destroyed-ew.png':'destroyed.png',thumb=index?'destroyed-preview-ew.png':'destroyed-preview.png',image=`assets/sprites/buildings/gate/${name}`,thumbnailPath=`assets/sprites/buildings/gate/${thumb}`;
    save(path.join(work,'ready',name),out.frame);save(path.join(work,'ready',thumb),thumbnail(out.frame));blit(out.frame,preview,index*W,0);
    archive[image]=fs.readFileSync(path.join(work,'ready',name));archive[thumbnailPath]=fs.readFileSync(path.join(work,'ready',thumb));
    records.push({orientation,image,thumbnail:thumbnailPath,frame:{width:W,height:H},pivot,groundY:index?64:54,subject:out.subject,sharedLevels:[1,15],source:{image:`sources/${index?'ew':'first'}.png`,rect,width:sprite.width,height:sprite.height,uniformScale:out.scale}});
  }
  save(path.join(work,'destroyed-gates.png'),preview);
  const compact=blank(W*2,80);PNG.bitblt(preview,compact,0,48,W*2,80,0,0);save(path.join(work,'destroyed-gates-4x.png'),enlarge(compact,4));
  json(path.join(work,'manifest.json'),{version:9,mode:'built-in imagegen',states:records});
  const metrics=JSON.parse(fs.readFileSync(path.join(root,'assets/generated/fortifications-v8/metrics.json'),'utf8'));metrics.version=9;
  for(const r of records)metrics.gateOrientations[r.orientation].destroyed={image:path.basename(r.image),thumbnail:path.basename(r.thumbnail),width:r.subject.width,height:r.subject.height};
  json(path.join(work,'metrics.json'),metrics);archive['manifest.json']=fs.readFileSync(path.join(work,'manifest.json'));fs.writeFileSync(path.join(work,'gate-destruction-v9.zip'),require('fflate').zipSync(archive,{level:6}));
  console.log(JSON.stringify(records.map(r=>({orientation:r.orientation,width:r.subject.width,height:r.subject.height}))));
}
function install(){
  const metadata=JSON.parse(fs.readFileSync(path.join(work,'manifest.json'),'utf8')),records=[];
  for(const r of metadata.states)for(const image of [r.image,r.thumbnail]){
    const ready=path.join(work,'ready',path.basename(image)),target=path.join(root,image),bytes=fs.readFileSync(ready);fs.copyFileSync(ready,target);
    records.push({image,ready:path.relative(root,ready).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  json(path.join(work,'installation.json'),{version:9,rulesChanged:false,assets:records});console.log('Installed two shared destroyed-gate sprites and two UI previews; healthy sprites retained.');
}
if(require.main===module){if(process.argv[2]==='pack')pack();else if(process.argv[2]==='install')install();else throw Error('Use pack | install');}
module.exports={work,W,H,pivot};
