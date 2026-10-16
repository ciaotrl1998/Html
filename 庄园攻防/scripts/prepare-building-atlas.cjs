'use strict';
// Imagegen supplies all new building artwork; this tool only crops and packs assets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{PNG}=require('pngjs');
const G=require('../js/game');
const crypto=require('node:crypto');
const {extractSprite}=require('./prepare-archer-sheet.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'assets/generated/buildings-redesign');
const spec=JSON.parse(fs.readFileSync(path.join(work,'designs.json'),'utf8'));
assert.deepEqual(spec.buildings.map(b=>b.id).sort(),Object.keys(G.DEFS).sort(),'Design sheet must cover exactly the live building types');
const {frameWidth:W,frameHeight:H,columns,rows}=spec.layout;
function blit(source,target,left,top){for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){const from=(y*source.width+x)*4,to=((top+y)*target.width+left+x)*4;source.data.copy(target.data,to,from,from+4);}}
function enlarge(source,scale){const output=new PNG({width:source.width*scale,height:source.height*scale});for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){const from=(Math.floor(y/scale)*source.width+Math.floor(x/scale))*4;source.data.copy(output.data,(y*output.width+x)*4,from,from+4);}return output;}
function write(file,png){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,PNG.sync.write(png));}
function position(index,stage){return {x:((index%3)*3+stage)*W,y:Math.floor(index/3)*H};}
function reference(){const atlas=new PNG({width:columns*W,height:rows*H});atlas.data.fill(0);for(const [index,b] of spec.buildings.entries())for(let stage=0;stage<3;stage++){const png=PNG.sync.read(fs.readFileSync(path.join(root,`assets/sprites/buildings/${b.id}/level-${stage+1}.png`))),p=position(index,stage);blit(png,atlas,p.x,p.y);}write(path.join(work,'current-reference.png'),atlas);write(path.join(work,'current-reference-3x.png'),enlarge(atlas,3));console.log(path.join(work,'current-reference.png'));}
function detectCuts(source,axis,count){
  const length=axis==='x'?source.width:source.height,counts=new Uint32Array(length),step=length/count,cuts=[0];
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(source.data[(y*source.width+x)*4+3]>=128)counts[axis==='x'?x:y]++;
  for(let n=1;n<count;n++){
    const expected=n*step,start=Math.max(cuts.at(-1)+1,Math.floor(expected-step*.22)),end=Math.min(length-1,Math.ceil(expected+step*.22));
    let minimum=Infinity;for(let p=start;p<=end;p++)minimum=Math.min(minimum,counts[p]);
    const runs=[];let run=-1;
    for(let p=start;p<=end+1;p++){if(p<=end&&counts[p]===minimum){if(run<0)run=p;}else if(run>=0){runs.push({start:run,end:p-1});run=-1;}}
    runs.sort((a,b)=>Math.abs((a.start+a.end)/2-expected)-Math.abs((b.start+b.end)/2-expected)||(b.end-b.start)-(a.end-a.start));
    cuts.push(Math.round((runs[0].start+runs[0].end)/2));
  }
  cuts.push(length);return cuts;
}
function bounds(png){let left=png.width,right=-1,top=png.height,bottom=-1,pixels=0;for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++)if(png.data[(y*png.width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);pixels++;}return {left,right,top,bottom,width:right-left+1,height:bottom-top+1,pixels};}
function fit(sprite,stage,type){
  const frame=new PNG({width:W,height:H});frame.data.fill(0);
  const squarePaddy=type==='farm',side=[32,39,46][stage];
  const scale=Math.min([42,50,58][stage]/sprite.width,side/sprite.height),width=squarePaddy?side:Math.max(1,Math.round(sprite.width*scale)),height=squarePaddy?side:Math.max(1,Math.round(sprite.height*scale)),left=Math.floor((W-width)/2),top=48-height;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=Math.min(sprite.width-1,Math.floor((x+.5)*sprite.width/width)),sy=Math.min(sprite.height-1,Math.floor((y+.5)*sprite.height/height));
    const from=(sy*sprite.width+sx)*4,to=((top+y)*W+left+x)*4;sprite.data.copy(frame.data,to,from,from+4);
  }
  // Keep open paddy edges natural: a closed brown perimeter would look fenced.
  if(squarePaddy)return frame;
  // One exterior pixel in the same brown as the units; never paint inner material.
  const original=Buffer.from(frame.data),opaque=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&original[(y*W+x)*4+3]>0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(opaque(x,y)&&(!opaque(x-1,y)||!opaque(x+1,y)||!opaque(x,y-1)||!opaque(x,y+1))){const i=(y*W+x)*4;frame.data[i]=74;frame.data[i+1]=46;frame.data[i+2]=32;}
  return frame;
}
function validate(png){
  assert.equal(png.width,W);assert.equal(png.height,H);const b=bounds(png);assert(b.pixels>90,'Empty or badly cropped building');assert(b.left>=2&&b.right<=61&&b.top>=1&&b.bottom===47,`Building escaped its frame/pivot: ${JSON.stringify(b)}`);
  for(let i=3;i<png.data.length;i+=4)assert(png.data[i]===0||png.data[i]===255,'Alpha must be binary');return b;
}
function pack(input){
  const source=PNG.sync.read(fs.readFileSync(input)),xCuts=detectCuts(source,'x',9),yCuts=detectCuts(source,'y',9),atlas=new PNG({width:W*columns,height:H*rows}),frames=[];atlas.data.fill(0);
  for(const [index,b] of spec.buildings.entries())for(let stage=0;stage<3;stage++){
    const col=index%3*3+stage,row=Math.floor(index/3),rect={x0:xCuts[col],x1:xCuts[col+1],y0:yCuts[row],y1:yCuts[row+1]},sprite=extractSprite(source,rect),frame=fit(sprite,stage,b.id),p=position(index,stage),relative=`assets/sprites/buildings/${b.id}/level-${stage+1}.png`,subject=validate(frame);
    write(path.join(work,'ready',b.id,`level-${stage+1}.png`),frame);blit(frame,atlas,p.x,p.y);
    frames.push({type:b.id,name:b.name,stage:stage+1,description:b.stages[stage],motif:b.motif,gameLevels:stage===2?[7,G.maxLevel({type:b.id})]:spec.stageLevels[stage],image:relative,frame:{...p,width:W,height:H},pivot:spec.layout.pivot,source:rect,subject});
  }
  for(const b of spec.buildings){const family=frames.filter(f=>f.type===b.id);for(let stage=1;stage<3;stage++){const prev=family[stage-1].subject,next=family[stage].subject;assert(next.height>prev.height&&next.width*next.height>prev.width*prev.height,`Upgrade silhouette is not growing: ${b.id}`);}}
  write(path.join(work,'buildings-atlas.png'),atlas);write(path.join(work,'buildings-atlas-3x.png'),enlarge(atlas,3));
  fs.writeFileSync(path.join(work,'buildings-atlas.json'),JSON.stringify({version:spec.version,image:'assets/generated/buildings-redesign/buildings-atlas.png',width:atlas.width,height:atlas.height,...spec.layout,sourceImage:path.relative(root,input).replaceAll('\\','/'),sourceCuts:{x:xCuts,y:yCuts},style:spec.style,frames},null,2)+'\n');
  console.log(JSON.stringify({atlas:path.join(work,'buildings-atlas.png'),sprites:frames.length,xCuts,yCuts}));
}
function sheets(){
  // Lossless regrouping of the approved atlas; no resizing or repainting here.
  const manifest=JSON.parse(fs.readFileSync(path.join(work,'buildings-atlas.json'),'utf8'));
  const atlas=PNG.sync.read(fs.readFileSync(path.join(work,'buildings-atlas.png'))),directory=path.join(work,'by-building'),buildings=[],archive={};
  assert.equal(manifest.version,spec.version);assert.equal(manifest.frames.length,spec.buildings.length*3);
  assert.equal(atlas.width,W*columns);assert.equal(atlas.height,H*rows);fs.mkdirSync(directory,{recursive:true});
  for(const b of spec.buildings){
    const family=manifest.frames.filter(f=>f.type===b.id).sort((a,b)=>a.stage-b.stage);
    assert.deepEqual(family.map(f=>f.stage),[1,2,3]);
    const sheet=new PNG({width:W*3,height:H});sheet.data.fill(0);
    for(const [index,f] of family.entries())for(let y=0;y<H;y++){
      assert.equal(f.frame.width,W);assert.equal(f.frame.height,H);
      const from=((f.frame.y+y)*atlas.width+f.frame.x)*4,to=(y*sheet.width+index*W)*4;
      atlas.data.copy(sheet.data,to,from,from+W*4);
    }
    const filename=`${b.id}.png`,bytes=PNG.sync.write(sheet);fs.writeFileSync(path.join(directory,filename),bytes);archive[filename]=bytes;
    buildings.push({type:b.id,name:b.name,image:filename,width:sheet.width,height:sheet.height,frames:family.map((f,index)=>({stage:f.stage,gameLevels:f.gameLevels,frame:{x:index*W,y:0,width:W,height:H},pivot:f.pivot,subject:f.subject}))});
  }
  const metadata=Buffer.from(JSON.stringify({version:spec.version,frameWidth:W,frameHeight:H,columns:3,rows:1,stageOrder:[1,2,3],source:'../buildings-atlas.png',buildings},null,2)+'\n');
  fs.writeFileSync(path.join(directory,'manifest.json'),metadata);archive['manifest.json']=metadata;
  fs.writeFileSync(path.join(work,'buildings-by-type.zip'),require('fflate').zipSync(archive,{level:6}));
  console.log(JSON.stringify({directory,sheets:buildings.length,width:W*3,height:H,archive:path.join(work,'buildings-by-type.zip')}));
}
function install(){
  const manifest=JSON.parse(fs.readFileSync(path.join(work,'buildings-atlas.json'),'utf8')),records=[];
  const grouped=JSON.parse(fs.readFileSync(path.join(work,'by-building/manifest.json'),'utf8'));
  assert.equal(manifest.version,spec.version);assert.equal(grouped.version,spec.version);
  assert.equal(manifest.frames.length,spec.buildings.length*3);
  assert.deepEqual(grouped.buildings.map(b=>b.type).sort(),spec.buildings.map(b=>b.id).sort());
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const pending=[];
  for(const f of manifest.frames){
    const next=fs.readFileSync(path.join(work,'ready',f.type,`level-${f.stage}.png`));validate(PNG.sync.read(next));pending.push({image:f.image,next});
  }
  for(const b of grouped.buildings){
    const next=fs.readFileSync(path.join(work,'by-building',b.image)),sheet=PNG.sync.read(next);
    assert.equal(sheet.width,W*3);assert.equal(sheet.height,H);
    for(let stage=0;stage<3;stage++){
      const frame=PNG.sync.read(fs.readFileSync(path.join(work,'ready',b.type,`level-${stage+1}.png`)));
      for(let y=0;y<H;y++)assert.deepEqual(sheet.data.subarray((y*sheet.width+stage*W)*4,(y*sheet.width+(stage+1)*W)*4),frame.data.subarray(y*W*4,(y+1)*W*4),'Regenerate sheets before installing');
    }
    pending.push({image:`assets/sprites/buildings/${b.type}/stages.png`,next});
  }
  const installation=path.join(work,'installation.json'),previous=fs.existsSync(installation)?JSON.parse(fs.readFileSync(installation,'utf8')).assets:[];
  // Validate every candidate first, then retain originals before changing live files.
  for(const f of pending){
    const target=path.join(root,f.image),backup=path.join(work,'before',f.image),prior=previous.find(p=>p.image===f.image);
    if(!fs.existsSync(backup)&&fs.existsSync(target)&&(!prior||prior.beforeHash!==null)){fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(target,backup);}
    const saved=fs.existsSync(backup);
    records.push({image:f.image,backup:saved?path.relative(root,backup).replaceAll('\\','/'):null,beforeHash:saved?hash(fs.readFileSync(backup)):null,afterHash:hash(f.next)});
  }
  for(const f of pending)fs.writeFileSync(path.join(root,f.image),f.next);
  fs.writeFileSync(installation,JSON.stringify({version:spec.version,assets:records,source:'by-building/manifest.json',rulesChanged:false},null,2)+'\n');console.log(`Installed ${grouped.buildings.length} three-stage sheets and ${manifest.frames.length} thumbnails; originals retained in assets/generated/buildings-redesign/before/.`);
}
if(require.main===module){if(process.argv[2]==='reference')reference();else if(process.argv[2]==='pack'&&process.argv[3])pack(path.resolve(process.argv[3]));else if(process.argv[2]==='sheets')sheets();else if(process.argv[2]==='install')install();else throw Error('Use: node scripts/prepare-building-atlas.cjs reference | pack source.png | sheets | install');}
module.exports={spec,position,blit,enlarge,validate,bounds};
