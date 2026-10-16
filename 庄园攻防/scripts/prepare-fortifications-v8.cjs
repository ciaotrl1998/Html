'use strict';
// AI-drawn masonry/gates. This step cleans, uniformly pixelizes gates, crops
// wall materials, and registers entire surfaces for seamless orthogonal tiling.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{PNG}=require('pngjs');
const {clean,cuts}=require('./building-v7-source.cjs'),{extractSprite}=require('./prepare-archer-sheet.cjs');
const {bounds,blit,enlarge}=require('./prepare-building-atlas.cjs'),{thumbnail}=require('./prepare-building-v7.cjs');
const {assembleWalls,PROFILE}=require('./wall-autotile.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'assets/generated/fortifications-v8');
const W=96,H=128,pivot={x:48,y:120};
const read=f=>PNG.sync.read(fs.readFileSync(f));
function save(file,png){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,PNG.sync.write(png));}
function json(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
function blank(w,h){const p=new PNG({width:w,height:h});p.data.fill(0);return p;}
function copyPixel(a,b,x,y,xx,yy){a.data.copy(b.data,(yy*b.width+xx)*4,(y*a.width+x)*4,(y*a.width+x+1)*4);}
function resized(sprite,w,h,mirror=false){
  const p=blank(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sx=Math.min(sprite.width-1,Math.floor((x+.5)*sprite.width/w)),sy=Math.min(sprite.height-1,Math.floor((y+.5)*sprite.height/h));if(mirror)sx=sprite.width-1-sx;
    const a=(sy*sprite.width+sx)*4,b=(y*w+x)*4;
    if(sprite.data[a+3]){for(let k=0;k<3;k++)p.data[b+k]=Math.min(255,Math.round(sprite.data[a+k]/8)*8);p.data[b+3]=255;}
  }return p;
}
function warmOutline(p,mask,coverage){
  const src=Buffer.from(p.data),solid=(x,y)=>{
    if(x<0){if(!(mask&8))return false;x=0;}if(x>=p.width){if(!(mask&2))return false;x=p.width-1;}
    if(y<0){if(!(mask&1))return false;y=0;}if(y>=p.height){if(!(mask&4))return false;y=p.height-1;}
    return coverage?coverage(x,y):src[(y*p.width+x)*4+3]>0;
  };
  for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(src[(y*p.width+x)*4+3]&&solid(x,y)&&(!solid(x-1,y)||!solid(x+1,y)||!solid(x,y-1)||!solid(x,y+1))){const i=(y*p.width+x)*4;p.data[i]=74;p.data[i+1]=46;p.data[i+2]=32;}
}
function gateFrames(){
  const source=clean(path.join(work,'sources/gates.png')),xs=cuts(source,'x',3),ys=cuts(source,'y',2),side=clean(path.join(work,'sources/gate-side-final.png')),sideX=cuts(side,'x',3),frames=[];
  const all=blank(W*3,H*2);
  for(const [row,orientation] of ['ns','ew'].entries()){
    const sheet=blank(W*3,H);
    for(let stage=0;stage<3;stage++){
      const p=row?side:source,rect={x0:(row?sideX:xs)[stage],x1:(row?sideX:xs)[stage+1],y0:row?0:ys[0],y1:row?p.height:ys[1]},sprite=extractSprite(p,rect);
      const width=row?40:64,scale=width/sprite.width,height=Math.round(sprite.height*scale),image=resized(sprite,width,height),frame=blank(W,H);
      assert(height>=64&&height<=116,`Gate ${orientation}/${stage+1} must be at least one tile tall and fit headroom`);
      blit(image,frame,(W-width)/2,pivot.y-height);
      // Fine native brown silhouette, never thickened into the interior.
      const original=Buffer.from(frame.data),solid=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&original[(y*W+x)*4+3];
      for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(solid(x,y)&&(!solid(x-1,y)||!solid(x+1,y)||!solid(x,y-1)||!solid(x,y+1))){const i=(y*W+x)*4;frame.data[i]=74;frame.data[i+1]=46;frame.data[i+2]=32;}
      const name=orientation==='ns'?`level-${stage+1}.png`:`level-${stage+1}-ew.png`;
      save(path.join(work,'ready/gate',`${orientation}-${stage+1}.png`),frame);
      save(path.join(work,'ready/assets/sprites/buildings/gate',name),thumbnail(frame));
      blit(frame,sheet,stage*W,0);blit(frame,all,stage*W,row*H);
      frames.push({orientation,stage:stage+1,frame:{x:stage*W,y:0,width:W,height:H},pivot,groundY:row?64:54,subject:bounds(frame),source:{image:`sources/${row?'gate-side-final':'gates'}.png`,rect,width:sprite.width,height:sprite.height,uniformScale:scale}});
    }
    save(path.join(work,'ready/assets/sprites/buildings/gate',orientation==='ns'?'stages.png':'stages-ew.png'),sheet);
  }
  save(path.join(work,'gates.png'),all);save(path.join(work,'gates-3x.png'),enlarge(all,3));
  return frames;
}
function wallModules(){
  const p=clean(path.join(work,'sources/walls.png')),xs=cuts(p,'x',4),ys=cuts(p,'y',4),raw=[];
  for(let mask=0;mask<16;mask++){const col=mask%4,row=mask>>2;raw.push(extractSprite(p,{x0:xs[col],x1:xs[col+1],y0:ys[row],y1:ys[row+1]}));}
  // Crop interior periods of the two AI-drawn straight modules. Closed source
  // end faces must not reappear where two live tiles meet.
  const vertical=resized(raw[5],32,Math.round(raw[5].height*32/raw[5].width)),horizontal=resized(raw[10],Math.round(raw[10].width*40/raw[10].height),40);
  const v=blank(64,64),h=blank(64,64);
  for(let y=0;y<64;y++)for(let x=0;x<32;x++)copyPixel(vertical,v,x,12+y%16,x+16,y);
  for(let y=0;y<40;y++)for(let x=0;x<64;x++)copyPixel(horizontal,h,14+x%16,y,x,y+14);
  warmOutline(v,5);warmOutline(h,10);
  const modules=[],atlas=blank(256,256),frames=assembleWalls(v,h,warmOutline);
  for(let mask=0;mask<16;mask++){
    const n=!!(mask&1),e=!!(mask&2),s=!!(mask&4),w=!!(mask&8),frame=frames[mask];
    const filename=`${mask.toString(16).padStart(2,'0')}.png`;save(path.join(work,'ready/assets/tiles/walls',filename),frame);blit(frame,atlas,mask%4*64,(mask>>2)*64);
    modules.push({mask,image:`assets/tiles/walls/${filename}`,frame:{x:mask%4*64,y:(mask>>2)*64,width:64,height:64},connections:{north:n,east:e,south:s,west:w},source:{indices:[5,10],assembly:'shared-surface-v10',profile:PROFILE},subject:bounds(frame)});
  }
  save(path.join(work,'walls.png'),atlas);save(path.join(work,'walls-4x.png'),enlarge(atlas,4));
  return modules;
}
function validate(){
  const meta=JSON.parse(fs.readFileSync(path.join(work,'manifest.json'),'utf8')),pixels=file=>read(path.join(work,'ready',file));
  for(const f of meta.gates){const p=read(path.join(work,'ready/gate',`${f.orientation}-${f.stage}.png`)),b=bounds(p);assert.deepEqual(b,f.subject);assert(b.height>=64);assert.equal(b.bottom,119);assert.equal(b.width,f.orientation==='ns'?64:40);}
  for(let a=0;a<16;a++)for(let b=0;b<16;b++){
    const A=pixels(`assets/tiles/walls/${a.toString(16).padStart(2,'0')}.png`),B=pixels(`assets/tiles/walls/${b.toString(16).padStart(2,'0')}.png`);
    // The pattern wraps over 16 pixels; adjacent boundary pixels need not have
    // identical colors. Compare complete connector strips to the straight wall,
    // including walkway, parapet and facade, rather than forcing a 1px border.
    if(a&2&&b&8){const H=pixels('assets/tiles/walls/0a.png');for(let y=0;y<64;y++)for(let x=0;x<16;x++){
      assert.deepEqual(A.data.subarray((y*64+x+48)*4,(y*64+x+49)*4),H.data.subarray((y*64+x+48)*4,(y*64+x+49)*4),'Entire east arm');
      assert.deepEqual(B.data.subarray((y*64+x)*4,(y*64+x+1)*4),H.data.subarray((y*64+x)*4,(y*64+x+1)*4),'Entire west arm');
    }}
    if(a&4&&b&1){const V=pixels('assets/tiles/walls/05.png');for(let y=0;y<14;y++){
      assert.deepEqual(B.data.subarray(y*64*4,(y+1)*64*4),V.data.subarray(y*64*4,(y+1)*64*4),'Entire north arm');
      if(y<10)assert.deepEqual(A.data.subarray((y+54)*64*4,(y+55)*64*4),V.data.subarray((y+54)*64*4,(y+55)*64*4),'Entire south arm');
    }}
  }
  for(const record of meta.walls){const p=pixels(record.image);assert.equal(p.width,64);assert.equal(p.height,64);for(let i=3;i<p.data.length;i+=4)assert(p.data[i]===0||p.data[i]===255);}
  return meta;
}
function pack(){
  const gates=gateFrames(),walls=wallModules();json(path.join(work,'manifest.json'),{version:8,mode:'built-in imagegen',frameWidth:W,frameHeight:H,pivot,gates,walls});
  const metrics=JSON.parse(fs.readFileSync(path.join(root,'assets/generated/buildings-redesign/v7/metrics.json'),'utf8'));metrics.version=8;metrics.heights.gate=gates.filter(f=>f.orientation==='ns').map(f=>f.subject.height);metrics.gateOrientations={ns:{image:'stages.png',groundY:54,heights:metrics.heights.gate},ew:{image:'stages-ew.png',groundY:64,heights:gates.filter(f=>f.orientation==='ew').map(f=>f.subject.height)}};
  json(path.join(work,'metrics.json'),metrics);validate();
  const archive={'manifest.json':fs.readFileSync(path.join(work,'manifest.json')),'metrics.json':fs.readFileSync(path.join(work,'metrics.json'))};
  for(const f of walls)archive[f.image]=fs.readFileSync(path.join(work,'ready',f.image));
  for(const name of ['stages.png','stages-ew.png',...Array.from({length:3},(_,i)=>`level-${i+1}.png`),...Array.from({length:3},(_,i)=>`level-${i+1}-ew.png`)]){const f=`assets/sprites/buildings/gate/${name}`;archive[f]=fs.readFileSync(path.join(work,'ready',f));}
  fs.writeFileSync(path.join(work,'fortifications-v8.zip'),require('fflate').zipSync(archive,{level:6}));
  console.log(JSON.stringify({gates:gates.map(f=>`${f.orientation}/${f.stage}: ${f.subject.width}x${f.subject.height}`),walls:16}));
}
function install(){
  validate();const ready=path.join(work,'ready/assets'),files=[],records=[],hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.name.endsWith('.png'))files.push(file);}};walk(ready);
  for(const file of files){const image='assets/'+path.relative(ready,file).replaceAll('\\','/'),target=path.join(root,image),backup=path.join(work,'before',image),bytes=fs.readFileSync(file);
    // The four -ew files were created by this revision, not pre-existing art.
    // Re-running the installer must not relabel generated files as originals.
    const original=!image.endsWith('-ew.png');
    if(original&&!fs.existsSync(backup)&&fs.existsSync(target)){fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(target,backup);}
    const saved=original&&fs.existsSync(backup);records.push({image,ready:path.relative(root,file).replaceAll('\\','/'),backup:saved?path.relative(root,backup).replaceAll('\\','/'):null,beforeHash:saved?hash(fs.readFileSync(backup)):null,afterHash:hash(bytes)});
  }
  for(const file of files){const target=path.join(root,'assets',path.relative(ready,file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
  json(path.join(work,'installation.json'),{version:8,rulesChanged:false,assets:records});console.log(`Installed ${records.length} fortification PNGs; originals retained.`);
}
if(require.main===module){if(process.argv[2]==='pack')pack();else if(process.argv[2]==='install')install();else if(process.argv[2]==='validate')validate();else throw Error('Use pack | install | validate');}
module.exports={work,validate};
