'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{PNG}=require('pngjs');
const {work,validate}=require('../scripts/prepare-fortifications-v8.cjs');
const root=path.resolve(__dirname,'..'),meta=JSON.parse(fs.readFileSync(path.join(work,'manifest.json'),'utf8'));
const read=file=>PNG.sync.read(fs.readFileSync(path.join(root,file)));
test('six real gate drawings cover both orientations, one-tile initial height and fixed tier width',()=>{
  assert.equal(meta.gates.length,6);
  for(const orientation of ['ns','ew']){
    const family=meta.gates.filter(f=>f.orientation===orientation);
    assert.deepEqual(family.map(f=>f.stage),[1,2,3]);
    assert.equal(new Set(family.map(f=>f.subject.width)).size,1);
    for(let i=0;i<3;i++){
      const f=family[i],s=f.subject;assert(s.height>=64);assert.equal(s.bottom,119);assert.deepEqual(f.pivot,{x:48,y:120});
      assert.equal(s.width,orientation==='ns'?64:40);if(i)assert(s.height>family[i-1].subject.height);
      assert(Math.abs(s.width-Math.round(f.source.width*f.source.uniformScale))<=1);
      assert(Math.abs(s.height-Math.round(f.source.height*f.source.uniformScale))<=1,'Gate artwork never uses anisotropic stretching');
    }
  }
  const ns=read('assets/sprites/buildings/gate/stages.png'),ew=read('assets/sprites/buildings/gate/stages-ew.png');
  assert.equal(ns.width,288);assert.equal(ns.height,128);assert.equal(ew.width,288);assert.equal(ew.height,128);assert(!ns.data.equals(ew.data));
});
test('all sixteen Chinese masonry masks have full-profile open arms and clear closed tile edges',()=>{
  validate();assert.equal(meta.walls.length,16);
  for(const f of meta.walls){
    const p=read(f.image);assert.equal(p.width,64);assert.equal(p.height,64);
    for(const [bit,pixel] of [[1,i=>i],[2,i=>i*64+63],[4,i=>63*64+i],[8,i=>i*64]]){
      let visible=0;for(let i=0;i<64;i++)visible+=p.data[pixel(i)*4+3]>0;
      if(f.mask&bit)assert(visible>=24,'Open wall arm reaches the adjacent tile');else assert.equal(visible,0,'Unsupported branches remain closed inside the cell');
    }
  }
});

test('walkways stay full width and texture-continuous through every bend, end, T and cross',()=>{
  const straight=read('assets/tiles/walls/0a.png'),sample=(p,x,y)=>p.data.subarray((y*64+x)*4,(y*64+x+1)*4);
  for(let mask=0;mask<16;mask++){
    const p=read(`assets/tiles/walls/${mask.toString(16).padStart(2,'0')}.png`),floor=new Set();
    // Independent layout specification, deliberately not imported from the
    // packer: 14px north/south lane joins an 8px east/west projected lane.
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const vertical=x>=25&&x<39&&(y>=23&&y<31||mask&1&&y<23||mask&4&&y>=31);
      const horizontal=y>=23&&y<31&&(x>=25&&x<39||mask&8&&x<25||mask&2&&x>=39);
      if(!vertical&&!horizontal)continue;
      const expected=sample(straight,16+x%16,23+((y-23)%8+8)%8);
      assert.equal(sample(p,x,y)[3],255,`No hole in mask ${mask} floor ${x},${y}`);
      assert.deepEqual(sample(p,x,y),expected,`No parapet/end-cap/texture offset across mask ${mask} floor ${x},${y}`);
      floor.add(y*64+x);
    }
    const seen=new Set(),queue=[27*64+32];
    for(let i=0;i<queue.length;i++){
      const pos=queue[i];if(seen.has(pos)||!floor.has(pos))continue;seen.add(pos);
      const x=pos%64,y=pos>>6;for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]])if(x+dx>=0&&x+dx<64&&y+dy>=0&&y+dy<64)queue.push(pos+dx+dy*64);
    }
    assert.equal(seen.size,floor.size,`All mask ${mask} branches join without a cap inside the bend`);
  }
});

test('south-facing facades share a fixed baseline and never cover a continuing vertical arm',()=>{
  const horizontal=read('assets/tiles/walls/0a.png'),vertical=read('assets/tiles/walls/05.png');
  const pixel=(p,x,y)=>p.data.subarray((y*64+x)*4,(y*64+x+1)*4);
  for(let mask=0;mask<16;mask++){
    const p=read(`assets/tiles/walls/${mask.toString(16).padStart(2,'0')}.png`);
    for(let x=0;x<64;x++)for(let y=43;y<53;y++){
      const facade=x<16?mask&8:x>=48?mask&2:!(mask&4);
      if(facade&&x!==16&&x!==47)assert.deepEqual(pixel(p,x,y),pixel(horizontal,x,y),`Facade baseline in mask ${mask}, column ${x}`);
      if(mask&4&&x>=16&&x<48)assert.deepEqual(pixel(p,x,y),pixel(vertical,x,y),`No closed end face across south arm ${mask}`);
    }
  }
});
test('new gate and wall PNGs are installed, binary transparent, and original art remains recoverable',()=>{
  const installation=JSON.parse(fs.readFileSync(path.join(work,'installation.json'),'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(installation.version,8);assert.equal(installation.rulesChanged,false);assert.equal(installation.assets.length,24);
  for(const f of installation.assets){
    const bytes=fs.readFileSync(path.join(root,f.image)),p=PNG.sync.read(bytes);assert.equal(hash(bytes),f.afterHash);assert.deepEqual(bytes,fs.readFileSync(path.join(root,f.ready)));
    for(let i=0;i<p.data.length;i+=4){assert(p.data[i+3]===0||p.data[i+3]===255);if(!p.data[i+3])assert.equal(p.data.readUInt32BE(i),0);}
    if(f.backup)assert.equal(hash(fs.readFileSync(path.join(root,f.backup))),f.beforeHash);else assert.equal(f.beforeHash,null);
  }
  assert.equal(installation.assets.filter(f=>f.backup).length,20);
});
