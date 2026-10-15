(function () {
  'use strict';
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = 64, palette = { plain: '#ced5af', shore: '#d9cda7', water: '#a9c9bd', forest: '#b4c49a', mountain: '#c3c5af' };
  const hintCaches = new WeakMap();
  const sprites = new Map();
  const assetUrl=path=>window.GF_ASSET_URLS?.[path]||path;
  let artAssetVersion=0;
  const artImages=new Map();
  function artImage(path){
    if(artImages.has(path))return artImages.get(path);
    const image=new Image();image.onload=image.onerror=()=>{artAssetVersion++;groundSeed=null;};image.src=assetUrl(path);artImages.set(path,image);return image;
  }
  const buildingPath=(type,level)=>`assets/sprites/buildings/${type}/level-${GF.visualLevel(level)}.png`;
  const maskName=mask=>mask.toString(16).padStart(2,'0');
  const soldierAtlasSources={
    infantry_player:'assets/sprites/soldiers/infantry_player-red.png',
    infantry_ally:'assets/sprites/soldiers/infantry_ally-green.png',
    infantry_enemy:'assets/sprites/soldiers/infantry_enemy-purple.png',
    archer_player:'assets/sprites/soldiers/archer_player-red.png',
    archer_ally:'assets/sprites/soldiers/archer_ally-green.png',
    archer_enemy:'assets/sprites/soldiers/archer_enemy-purple.png'
  };
  const soldierAtlases={};
  const soldierMotionCaches=new WeakMap();
  function soldierFacing(dx,dy,current='front'){
    const ax=Math.abs(dx),ay=Math.abs(dy),horizontal=current==='left'||current==='right';
    // Keep the current sprite axis around diagonals; switch only after the new axis clearly wins.
    const useHorizontal=horizontal?ay<=ax*1.35:ax>ay*1.35;
    return useHorizontal?(dx<0?'left':'right'):(dy<0?'back':'front');
  }
  let soldierSpriteVersion=0;
  for(const [faction,source] of Object.entries(soldierAtlasSources)){
    const image=new Image();
    image.onload=image.onerror=()=>soldierSpriteVersion++;
    image.src=assetUrl(source);soldierAtlases[faction]=image;
  }
  let glowSprite = null;
  // Bake the night lantern glow once; drawing a cached image beats creating a radial gradient per
  // building every frame.
  function nightGlow(){
    if(glowSprite)return glowSprite;
    const size=128,cv=document.createElement('canvas');cv.width=cv.height=size;
    const g=cv.getContext('2d'),grad=g.createRadialGradient(size/2,size/2,1,size/2,size/2,size/2);
    grad.addColorStop(0,'#d4a34536');grad.addColorStop(1,'#d4a34500');
    g.fillStyle=grad;g.fillRect(0,0,size,size);
    return glowSprite=cv;
  }
  function drawBaked(c,key,paint){
    let sprite=sprites.get(key);
    if(!sprite){
      sprite=document.createElement('canvas');sprite.width=256;sprite.height=256;
      const ctx=sprite.getContext('2d');ctx.scale(2,2);ctx.translate(64,96);paint(ctx);
      sprites.set(key,sprite);
    }
    c.drawImage(sprite,-64,-96,128,128);
  }
  const noise = (x, y, n = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453; return v - Math.floor(v); };
  function poly(c, points, fill, stroke, width = 1) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function line(c, points, color, width = 1) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
  function ellipse(c, x, y, rx, ry, fill, stroke) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = .8; c.stroke(); } }
  function rect(c, x, y, w, h, fill, stroke) { c.fillStyle = fill; c.fillRect(x, y, w, h); if (stroke) { c.strokeStyle = stroke; c.lineWidth = .7; c.strokeRect(x, y, w, h); } }
  function tree(c, x, y, size = 1, autumn = false) {
    c.save(); c.translate(x, y); c.scale(size, size);
    ellipse(c, 2, 4, 11, 4, '#4a674721'); line(c, [[0, 2], [0, -18]], '#736e4b', 2);
    ellipse(c, -5, -15, 8, 9, autumn ? '#9aaf6e' : '#6a8b63', '#58755370'); ellipse(c, 5, -20, 9, 10, autumn ? '#b1ba79' : '#7c9c6a', '#58755370'); ellipse(c, -1, -27, 8, 9, autumn ? '#bec286' : '#8daa72');
    line(c, [[-6, -29], [-2, -33], [2, -33]], '#c4d69a55', 1.3); c.restore();
  }
  function bamboo(c, x, y, size = 1) {
    c.save(); c.translate(x, y); c.scale(size, size);
    for (let i = -1; i <= 1; i++) { line(c, [[i * 5, 3], [i * 7, -30 - i * 4]], '#708660', 1.4); for (let j = 0; j < 3; j++) { const yy = -9 - j * 8; line(c, [[i * 6, yy], [i * 6 + 9, yy - 6]], '#658560', 1); ellipse(c, i * 6 + 8, yy - 5, 5, 1.6, '#6e9064'); ellipse(c, i * 6 - 5, yy - 5, 5, 1.6, '#849e6b'); } }
    c.restore();
  }
  function stone(c, x, y, size = 1) { c.save(); c.translate(x, y); c.scale(size, size); ellipse(c, 0, 3, 12, 4, '#6d745425'); poly(c, [[-12, 0], [-8, -12], [0, -17], [11, -9], [13, 3], [1, 6]], '#a4ac98', '#899680'); poly(c, [[-8, -12], [0, -17], [11, -9], [2, -4]], '#bec5b0'); poly(c, [[2, -4], [11, -9], [13, 3], [1, 6]], '#909d89'); c.restore(); }
  function roof(c, x, y, w, h, color = '#55786e', tier = 1) {
    const edge = color === '#aa6951' ? '#714e3d' : '#36564f';
    poly(c, [[x - w / 2 - 3, y + h], [x - w / 2 + 4, y + h - 5], [x - w / 2 + 9, y], [x + w / 2 - 9, y], [x + w / 2 - 4, y + h - 5], [x + w / 2 + 3, y + h], [x, y + h + 3]], color, edge, .9);
    for (let i = -w / 2 + 8; i < w / 2 - 3; i += 5) line(c, [[x + i * .73, y + 2], [x + i, y + h - 1]], '#d5e0bf42', .7);
    line(c, [[x - w / 2 + 8, y + 1], [x + w / 2 - 8, y + 1]], '#314e49', 2);
    line(c, [[x - w / 2 - 3, y + h - 2], [x - w / 2 - 2, y + h], [x, y + h + 2], [x + w / 2 + 2, y + h], [x + w / 2 + 3, y + h - 2]], tier >= 3 ? '#bda65f' : '#86a095', 1.4);
  }
  function lantern(c, x, y) { line(c, [[x, y - 5], [x, y + 6]], '#78663b', .6); ellipse(c, x, y, 2.7, 3.6, '#ba634b'); line(c, [[x, y - 2], [x, y + 2]], '#e2a169', .6); }
  function house(c, level, kind, color) {
    const fancy = ['shrine', 'earth', 'tao', 'guild', 'port'].includes(kind), w = fancy ? 44 : 39, h = level > 1 ? 24 : 20;
    rect(c, -w / 2 - 3, 9, w + 6, 7, '#aaad92', '#8f997f'); rect(c, -w / 2, -h + 14, w, h, '#e5d9b5', '#9a9475');
    rect(c, w / 2 - 8, -h + 15, 8, h - 1, '#cdc5a1');
    for (const x of [-w / 2 + 3, w / 2 - 4]) rect(c, x, -h + 13, 2, h + 1, fancy ? '#9b5947' : '#897c58');
    rect(c, -5, 2, 10, 12, fancy ? '#785345' : '#665f45'); line(c, [[0, 3], [0, 13]], '#b1976a');
    for (const x of [-14, 10]) { rect(c, x, -1, 6, 6, '#7b8063', '#b8a47c'); line(c, [[x + 3, 0], [x + 3, 4]], '#d2bf8b', .6); }
    roof(c, 0, -h - 2, w + 6, 16, color, level);
    if (level >= 2 || fancy) { rect(c, -11, -h - 9, 22, 10, '#d6c6a1', '#8b8668'); roof(c, 0, -h - 17, 35, 10, color, level); }
    if (level === 3) { rect(c, -8, -h - 24, 16, 8, '#d6c6a1'); roof(c, 0, -h - 30, 27, 9, color, level); }
    if (fancy) { lantern(c, -18, 5); lantern(c, 18, 5); rect(c, -8, -9, 16, 6, '#3c5750', '#b29d69'); c.fillStyle = '#e4d6ad'; c.font = '4px "SimHei","Microsoft YaHei",sans-serif'; c.textAlign = 'center'; c.fillText(GF.DEFS[kind].name, 0, -4.5); }
    rect(c, -9, 15, 18, 2, '#d6d6bc'); rect(c, -11, 17, 22, 2, '#b6bca1');
  }
  function building(c, type, level = 1, time = 0, baked = false) {
    level = GF.visualLevel(level);
    c.save(); c.lineJoin = 'round'; ellipse(c, 2, 18, 26, 8, '#3b503728');
    if(level>=2){poly(c,[[-29,-20],[27,-20],[30,23],[-28,23]],'#bfc4a582','#929f7f',.7);for(let i=0;i<4;i++)line(c,[[-26+i*17,19],[-26+i*17,23]],'#8b987b',.7);}
    if(level===3){for(const x of [-28,28]){line(c,[[x,-17],[x,19]],'#aa985b',1.2);ellipse(c,x,-17,2,2,'#c5ab66');}line(c,[[-26,22],[27,22]],'#c5ab66',2);}
    if (type === 'gate') {
      rect(c,-29,-12,58,34,'#999c8a','#58675e');
      for(const x of [-27,19]){rect(c,x,-20,8,44,'#c1c4ae','#687568');for(let y=-15;y<24;y+=9)line(c,[[x,y],[x+8,y]],'#84907d',1);}
      rect(c,-18,-7,36,30,'#775638','#4e4435');
      for(let x=-15;x<18;x+=6)line(c,[[x,-6],[x,22]],'#b29762',1.3);
      line(c,[[0,-7],[0,23]],'#423e31',2);line(c,[[-17,7],[17,7]],'#5a4a33',3);
      for(const x of [-5,5])ellipse(c,x,10,2,2,'#d0af66');
      rect(c,-22,-23,44,13,'#dbccaa','#887b5e');roof(c,0,-39,59,17,'#55786e',level);
      if(level>1)roof(c,0,-49,39,11,'#55786e',level);
    } else if (type === 'farm') {
      poly(c, [[-25,-18],[21,-18],[26,16],[-23,20]], '#8faf90', '#83926a', 1.2);
      for (let row = 0; row < 5; row++) { line(c, [[-22,-12+row*6],[23,-14+row*6]], '#bfd0a4', 1.3); for(let col=0;col<6;col++){const x=-19+col*7,y=-9+row*6;line(c,[[x-2,y-5],[x,y],[x+2,y-5]],level===1?'#62885b':'#a29244',1.3);} }
      if(level>1){rect(c,19,-20,3,32,'#928465');line(c,[[14,-18],[25,-18]],'#928465',2);} if(level===3)houseTiny(c, -19,-16);
    } else if (type === 'mulberry') {
      rect(c,-24,-14,48,34,'#acbb87');for(let i=0;i<3;i++)for(let j=0;j<2;j++)tree(c,-16+i*16,-1+j*16,.58+level*.06,true);
    } else if (type === 'quarry') {
      poly(c,[[-25,15],[-20,-14],[14,-20],[26,5],[16,19]],'#b5bba4','#8d9882');stone(c,-8,0,.9);stone(c,11,6,.9);stone(c,1,-10,.7);line(c,[[-18,15],[-12,3]],'#7a7254',2);line(c,[[-18,5],[-7,11]],'#687a70',3);if(level>1)stone(c,10,-19,.7);
    } else if(type==='fortune'){
      ellipse(c,0,15,25,7,'#5d4e3b30');rect(c,-23,-10,46,27,'#8b5f48','#5d493b');poly(c,[[-25,-10],[-18,-24],[18,-24],[25,-10]],'#527269','#354f49',1.2);rect(c,-5,-13,10,18,'#c4a35d','#6f603d');ellipse(c,0,-4,3,4,'#f0d991');for(const x of [-16,16])lantern(c,x,8);
    }else if(type==='tower'){
      for(const x of [-15,12]){poly(c,[[x-2,18],[x+1,-23],[x+5,-23],[x+5,18]],'#9b865d','#6e7356');}line(c,[[-14,16],[16,-20]],'#a18b5e',3);line(c,[[15,16],[-12,-20]],'#a18b5e',3);rect(c,-21,-25,42,11,'#af9866','#6f7758');for(let i=-18;i<=18;i+=9)rect(c,i,-29,3,14,'#746e4e');roof(c,0,-42,45,13,'#52766d',level);if(level>1)roof(c,0,-50,29,9,'#52766d',level);line(c,[[0,-30],[17,-38]],'#624f39',1.5);ellipse(c,0,-29,3,4,'#48584e');
    }else if(type==='rock'){
      poly(c,[[-24,16],[-20,-5],[20,-5],[24,16]],'#b2b7a2','#7e8d7b');rect(c,-18,-10,36,10,'#c8cbb3','#8d987e');line(c,[[-13,6],[0,-20],[13,6]],'#8a7c56',4);line(c,[[-9,-19],[14,-7]],'#756a4e',4);stone(c,-12,-19,.5);if(level>1)stone(c,18,12,.6);
    }else if(type==='well'){
      ellipse(c,0,10,17,9,'#afb7a3','#7c8c7c');rect(c,-17,2,34,9,'#adb5a0');ellipse(c,0,2,17,8,'#d1d6bb','#7c8c7c');ellipse(c,0,2,12,5,'#638b87');rect(c,-19,-22,3,30,'#937e54');rect(c,16,-22,3,30,'#937e54');roof(c,0,-30,45,13,'#887c58',level);line(c,[[0,-14],[0,0]],'#c4b087');
    }else if(type==='zhong'){
      rect(c,-16,10,32,8,'#a7af9d','#788978');rect(c,-12,6,24,6,'#c3c9b1');poly(c,[[-12,5],[-10,-20],[0,-28],[10,-20],[12,5]],level===3?'#b3a574':'#7a9280','#536c5e');ellipse(c,0,-28,7,8,'#9bad93');rect(c,-8,-36,16,4,'#617a68');line(c,[[8,-11],[20,-29]],'#7a8267',3);line(c,[[-6,-26],[0,-23],[5,-26]],'#4e6659',2);
    }else{
      const color=['wine','kiln','barracks'].includes(type)?'#aa6951':type==='tailor'?'#85788b':type==='tea'?'#728260':'#55786e';
      house(c,level,type,color);
      if(type==='tea'){line(c,[[24,-21],[24,10]],'#837b51',1.5);rect(c,24,-20,12,18,'#e5d7ac','#b9ad82');c.font='8px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.fillStyle='#4b6950';c.fillText('茶',30,-8);}
      if(type==='inn'){line(c,[[24,-24],[24,13]],'#837b51',1.5);rect(c,24,-23,10,21,'#b17455');c.font='7px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.fillStyle='#f1ddb1';c.fillText('宿',29,-10);}
      if(type==='mill'){ellipse(c,22,6,11,11,'#8c8460','#676d51');ellipse(c,22,6,8,8,null,'#c8ba87');if(!baked)buildingAnimation(c,type,time);}
      if(type==='wine'||type==='kiln'){for(let i=0;i<3;i++){ellipse(c,16+i*6,13-i*2,4,5,type==='wine'?'#a57c59':'#b7c6b1','#7b7d61');ellipse(c,16+i*6,8-i*2,2.8,1.5,'#616b57');}}
      if(type==='kiln'){rect(c,16,-32,6,19,'#a18e6c');if(!baked)buildingAnimation(c,type,time);}
      if(type==='weaver'||type==='tailor'){line(c,[[-25,-14],[-25,13]],'#8e7c59',1.5);for(let i=0;i<3;i++)rect(c,-25+i*6,-12,5,18,['#c3948d','#b9b590','#7f9e9c'][i]);}
      if(type==='barracks'){line(c,[[23,-37],[23,13]],'#807449',1.7);poly(c,[[24,-37],[39,-32],[24,-26]],'#ad6650');}
      if(type==='bank'||type==='trade'){for(let i=0;i<3;i++){rect(c,15+i*4,13-i*4,8,5,'#ba9b56','#9d8546');line(c,[[18+i*4,14-i*4],[19+i*4,16-i*4]],'#e0c377');}}
      if(type==='stage'){rect(c,-17,0,34,14,'#977950');for(let i=-12;i<=12;i+=12){ellipse(c,i,1,2,2,'#cfbb91');poly(c,[[i-3,5],[i+3,5],[i+5,13],[i-5,13]],i?'#8e9b76':'#b17360');}}
      if(type==='guild'||type==='port'){
        c.save();c.strokeStyle='#c9ac65';c.lineWidth=1.5;ellipse(c,0,19,29,9,null,'#c9ac65');
        if(type==='guild'){
          ellipse(c,22,-20,7,7,'#ddb767','#6f743d');rect(c,20,-22,4,4,'#61724a','#b18e4c');
        }else{
          c.translate(22,-21);c.rotate(-.6);rect(c,-2,-1,4,12,'#b99764','#665e47');rect(c,-8,-6,16,6,'#849a8b','#4e695f');
        }
        c.restore();
      }
    }
    c.restore();
  }
  function buildingAnimation(c,type,time){
    if(type==='mill'){
      for(let i=0;i<8;i++){const a=i*Math.PI/4+time*.4;line(c,[[22,6],[22+10*Math.cos(a),6+10*Math.sin(a)]],'#c2b180',1.5);}
      ellipse(c,22,6,2,2,'#706949');
    }
    if(type==='kiln')for(let i=0;i<3;i++)ellipse(c,19+Math.sin(time+i)*3,-38-i*7,3+i,3+i,'#e7e7cf66');
  }
  function houseTiny(c,x,y){rect(c,x-5,y,10,7,'#d6d0a6');roof(c,x,y-5,16,7,'#887a52');}
  function thumbnail(type, level=1){
    return assetUrl(buildingPath(type,level));
  }
  function makeGround(s,occupied,left,top,right,bottom,scale){
    const size=GF.worldWidth(s),height=GF.worldHeight(s),center=GF.worldCenter(s),estate=GF.estate(s);
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(((right-left+1)*T+96)*scale);canvas.height=Math.ceil(((bottom-top+1)*T+96)*scale);const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.scale(scale,scale);c.translate(48-left*T,48-top*T);
    for(let y=Math.max(0,top-1);y<=Math.min(height-1,bottom+1);y++)for(let x=Math.max(0,left-1);x<=Math.min(size-1,right+1);x++){
      const type=GF.terrain(x,y,s),px=x*T,py=y*T,image=artImage(`assets/tiles/terrain/${type}.png`);
      if(image.complete&&image.naturalWidth)c.drawImage(image,px,py,T,T);
      if(estate&&!GF.owns(s,x,y))rect(c,px,py,T,T,'#34473e18');
    }
    if(!estate){
      for(let y=center-2;y<=center+2;y++)rect(c,center*T+25,y*T,14,T,'#dcd8b74a');
      for(let x=center-2;x<=center+2;x++)rect(c,x*T,center*T+27,T,12,'#dcd8b74a');
    }else{
      const has=(set,x,y)=>x>=0&&y>=0&&x<size&&y<height&&set.has(y*size+x);
      for(const index of estate.roads){
        const x=index%size,y=Math.floor(index/size);if(x<left-1||x>right+1||y<top-1||y>bottom+1)continue;const px=x*T,py=y*T,water=GF.terrain(x,y,s)==='water';
        const north=has(estate.roads,x,y-1),south=has(estate.roads,x,y+1),east=has(estate.roads,x+1,y),west=has(estate.roads,x-1,y);
        const mask=Number(north)|Number(east)*2|Number(south)*4|Number(west)*8,image=artImage(`assets/tiles/roads/${water?'bridge':'ground'}-${maskName(mask)}.png`);
        if(image.complete&&image.naturalWidth)c.drawImage(image,px,py,T,T);
      }
      // Follow the irregular interior one cell edge at a time.
      for(const index of estate.cells){
        const x=index%size,y=Math.floor(index/size);if(x<left-1||x>right+1||y<top-1||y>bottom+1)continue;const px=x*T,py=y*T;
        for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]])if(!GF.owns(s,x+dx,y+dy)){
          const edge=dx===1?[[px+T-2,py+2],[px+T-2,py+T-2]]:dx===-1?[[px+2,py+2],[px+2,py+T-2]]:dy===1?[[px+2,py+T-2],[px+T-2,py+T-2]]:[[px+2,py+2],[px+T-2,py+2]];
          line(c,edge,'#f3df9b99',2);
        }
      }
      const connects=(x,y)=>GF.isWall(s,x,y)||estate.gates.some(g=>g.x===x&&g.y===y);
      for(const index of estate.walls){
        const x=index%size,y=Math.floor(index/size);if(x<left-1||x>right+1||y<top-1||y>bottom+1)continue;const px=x*T,py=y*T;
        const mask=Number(connects(x,y-1))|Number(connects(x+1,y))*2|Number(connects(x,y+1))*4|Number(connects(x-1,y))*8,image=artImage(`assets/tiles/walls/${maskName(mask)}.png`);
        if(image.complete&&image.naturalWidth)c.drawImage(image,px,py,T,T);
      }
    }
    drawGroundDecorations(c,s,occupied,Math.max(0,left-2),Math.max(0,top-2),Math.min(size-1,right+2),Math.min(height-1,bottom+2));
    return {canvas,left,top,right,bottom,scale};
  }
  function newGround(s,occupied){
    const size=GF.worldWidth(s),height=GF.worldHeight(s),estate=GF.estate(s),waterRows=Array.from({length:height},()=>[]);
    for(let y=0;y<height;y++)for(let x=0;x<size;x++)if(GF.terrain(x,y,s)==='water'&&!GF.isWall(s,x,y)&&!estate.roads.has(y*size+x))waterRows[y].push({x,outside:!GF.owns(s,x,y)});
    return {occupied:new Set(occupied),chunks:new Map(),waterRows};
  }
  function drawGroundDecorations(ctx,s,occupied,left,top,right,bottom){
    const size=GF.worldWidth(s),height=GF.worldHeight(s),estate=GF.estate(s);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      if(occupied.has(x+','+y)||GF.isWall(s,x,y)||estate?.roads.has(y*size+x))continue;
      const type=GF.terrain(x,y,s);ctx.save();ctx.translate(x*T+32,y*T+32);
      const outside=!!estate&&!GF.owns(s,x,y);if(outside)ctx.globalAlpha=.78;
      if(type==='forest'){const image=artImage('assets/tiles/resources/forest.png');if(image.complete&&image.naturalWidth)ctx.drawImage(image,-64,-64,128,128);}
      if(type==='mountain'){const image=artImage('assets/tiles/resources/mountain.png');if(image.complete&&image.naturalWidth)ctx.drawImage(image,-64,-64,128,128);}
      if(type==='plain'&&(x===0||y===0||x===size-1||y===height-1)&&noise(x,y)>.35){
        ctx.translate(0,8);const scale=.8+noise(x,y)*.5;ctx.scale(scale,scale);const image=artImage('assets/tiles/resources/border-tree.png');if(image.complete&&image.naturalWidth)ctx.drawImage(image,-64,-72,128,128);
      }
      if(type==='water'){
        if(noise(x,y)>.65){const image=artImage('assets/tiles/resources/reeds.png');if(image.complete&&image.naturalWidth)ctx.drawImage(image,-32,-32,64,64);}
      }
      ctx.restore();
    }
  }
  function updateGround(s,occupied){
    const changed=[...ground.occupied].filter(k=>!occupied.has(k)).concat([...occupied].filter(k=>!ground.occupied.has(k)));
    for(const key of changed){const [x,y]=key.split(',').map(Number);for(const [id,tile] of ground.chunks)if(x>=tile.left-2&&x<=tile.right+2&&y>=tile.top-2&&y<=tile.bottom+2)ground.chunks.delete(id);}
    ground.occupied=new Set(occupied);
  }
  let ground, groundSeed;
  function healthBarY(b){
    const type=b.type,level=GF.visualLevel(b.level);
    if(type==='gate')return level>1?-56:-46;
    if(type==='farm')return -26;
    if(type==='mulberry')return -31;
    if(type==='quarry'||type==='rock')return -34;
    if(type==='tower')return level>1?-57:-49;
    if(type==='well')return -37;
    if(type==='zhong')return -43;
    if(level===3)return -61;
    if(level===2)return -48;
    return ['shrine','earth','tao','guild','port','barracks'].includes(type)?-44:-29;
  }
  function influenceBounds(s,b){
    const d=GF.DEFS[b.type];
    if(d.cat!=='economy' && b.type!=='well' && b.type!=='earth')return null;
    const radius=d.cat==='economy' ? d.radius : b.type==='earth' ? d.range : 1;
    if(radius===0)return null;
    const x=Math.max(2,(b.x-radius)*T+2),y=Math.max(2,(b.y-radius)*T+2);
    const right=Math.min(GF.worldWidth(s)*T-2,(b.x+radius+1)*T-2),bottom=Math.min(GF.worldHeight(s)*T-2,(b.y+radius+1)*T-2);
    return {x,y,width:right-x,height:bottom-y};
  }
  function directChainLink(consumer,producer){
    const d=GF.DEFS[consumer.type];
    if(consumer.owner!==producer.owner||!d.radius||GF.dist8(consumer.x,consumer.y,producer.x,producer.y)>d.radius)return false;
    return d.prev===producer.type || !!d.required?.includes(producer.type);
  }
  function selectedLinks(s,b){
    return s.buildings.filter(n=>n!==b && (directChainLink(b,n)||directChainLink(n,b)));
  }
  function drawLinks(c,s,visible){
    c.save();c.setLineDash([4,5]);c.globalAlpha=s.phase==='night'?.92:.82;
    const list=s.buildings;
    for(let i=0;i<list.length;i++){
      const b=list[i],d=GF.DEFS[b.type];
      if(!d.radius)continue;
      for(let j=i+1;j<list.length;j++){
        const n=list[j];
        if(!directChainLink(b,n)&&!directChainLink(n,b))continue;
        if(visible&&!visible(b.x*T+32,b.y*T+32,120)&&!visible(n.x*T+32,n.y*T+32,120))continue;
        const nd=GF.DEFS[n.type],chain=d.chain||nd.chain;
        const color={商:'#9c8052',农:'#6e875b',丝:'#96758c',工:'#648388'}[chain]||'#9b8660';
        const sx=b.x*T+32,sy=b.y*T+37,tx=n.x*T+32,ty=n.y*T+37,dx=tx-sx,dy=ty-sy,length=Math.hypot(dx,dy),trim=12;
        line(c,[[sx+dx/length*trim,sy+dy/length*trim],[tx-dx/length*trim,ty-dy/length*trim]],color,2.2);
      }
    }
    c.restore();
  }
  function drawSelection(c,s,selected){
    if(!selected)return;
    const b=GF.at(s,selected.x,selected.y);
    if(!b||b.type!=='tower')return;
    const radius=(GF.DEFS.tower.range+(b.level-1)*.35)*T;
    c.save();
    c.beginPath();c.arc(b.x*T+32,b.y*T+32,radius,0,Math.PI*2);c.fillStyle='#8faa6518';c.fill();c.setLineDash([7,5]);c.strokeStyle=s.phase==='night'?'#c4dca4':'#769258';c.lineWidth=2;c.stroke();
    c.restore();
  }
  function render(canvas,s,cam,selected,options={}){
    const size=GF.worldWidth(s),height=GF.worldHeight(s),estate=GF.estate(s),cacheKey=JSON.stringify([s.mapSeed,s.rotation,size,height,s.mapGeneration,s.mode,s.enemyCount]);
    const animationTime=options.animationTime??s.elapsed,playerOwner=options.player??0,player=GF.playerView(s,playerOwner);
    // Enemy occupancy changes every frame; economic recommendations only change with the town.
    const hintKey=JSON.stringify([cacheKey,player.actorId,s.over,s.day,player.buildings.map(b=>[b.type,b.x,b.y,b.level,b.owner])]);
    let hints=hintCaches.get(s);
    if(!hints||hints.key!==hintKey){hints={key:hintKey,tiles:new Map()};hintCaches.set(s,hints);}
    const blockedHints=new Set();
    for(const e of GF.hostileUnits(player))for(let y=Math.floor(e.y)-1;y<=Math.ceil(e.y)+1;y++)for(let x=Math.floor(e.x)-1;x<=Math.ceil(e.x)+1;x++){
      if(Math.hypot(e.x-x,e.y-y)<.65)blockedHints.add(y*size+x);
    }
    const occupied=new Set(s.buildings.map(b=>b.x+','+b.y));
    if(!ground || groundSeed!==cacheKey){ground=newGround(s,occupied);groundSeed=cacheKey;}
    else updateGround(s,occupied);
    const c=canvas.getContext('2d'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=canvas.width/w;
    const night=false,dusk=false;
    const left=Math.max(0,Math.floor(-cam.x/cam.zoom/T)-1),right=Math.min(size-1,Math.ceil((w-cam.x)/cam.zoom/T)+1),top=Math.max(0,Math.floor(-cam.y/cam.zoom/T)-1),bottom=Math.min(height-1,Math.ceil((h-cam.y)/cam.zoom/T)+1);
    const visible=(x,y,rx,ry=rx)=>x+rx>=-cam.x/cam.zoom&&x-rx<=(w-cam.x)/cam.zoom&&y+ry>=-cam.y/cam.zoom&&y-ry<=(h-cam.y)/cam.zoom;
    c.setTransform(dpr,0,0,dpr,0,0);
    c.imageSmoothingEnabled=false;
    c.fillStyle=night?'#31494a':dusk?'#b9b89b':'#d5dcc5';c.fillRect(0,0,w,h);
    c.save();c.translate(cam.x,cam.y);c.scale(cam.zoom,cam.zoom);
    // Soft ink mountain silhouettes outside the map.
    if(cam.y/cam.zoom> -1||(h-cam.y)/cam.zoom>height*T){for(let i=Math.max(0,Math.floor((-cam.x/cam.zoom+20)/99));i<Math.ceil(size*T/99)+5&&i*99-180<(w-cam.x)/cam.zoom;i++){const x=i*99-180;if(cam.y/cam.zoom> -1)poly(c,[[x,-5],[x+60,-110-noise(i,4)*170],[x+160,-5]],night?'#3f5754':'#aebda04d');if((h-cam.y)/cam.zoom>height*T)poly(c,[[x-90,height*T+10],[x-20,height*T+100+noise(i,2)*70],[x+90,height*T+10]],night?'#3f5754':'#aebda03b');}}
    // Bounded, zoom-aware chunks avoid allocating several full 75x90 map canvases.
    const scale=cam.zoom<.3?.25:cam.zoom<.65?.5:1;
    for(let cy=Math.floor(top/16);cy<=Math.floor(bottom/16);cy++)for(let cx=Math.floor(left/16);cx<=Math.floor(right/16);cx++){
      const key=cx+','+cy+','+scale;let tile=ground.chunks.get(key);
      if(!tile){tile=makeGround(s,occupied,cx*16,cy*16,Math.min(size-1,cx*16+15),Math.min(height-1,cy*16+15),scale);ground.chunks.set(key,tile);}
      else{ground.chunks.delete(key);ground.chunks.set(key,tile);}
      const tw=(tile.right-tile.left+1)*T,th=(tile.bottom-tile.top+1)*T;
      c.drawImage(tile.canvas,48*scale,48*scale,tw*scale,th*scale,tile.left*T,tile.top*T,tw,th);
    }
    while(ground.chunks.size>40)ground.chunks.delete(ground.chunks.keys().next().value);
    if(options.grid){c.strokeStyle=night?'#c6d7a855':'#5d785055';c.lineWidth=1.4;c.lineCap='round';c.setLineDash([4,4]);c.beginPath();
      for(let i=left;i<=right+1;i++){c.moveTo(i*T,top*T);c.lineTo(i*T,(bottom+1)*T);}
      for(let i=top;i<=bottom+1;i++){c.moveTo(left*T,i*T);c.lineTo((right+1)*T,i*T);}
      c.stroke();c.setLineDash([]);
    }
    // Batch all visible ripple segments by opacity instead of saving/stroking each tile.
    c.save();c.lineWidth=.9;c.lineCap='round';
    for(const outside of [false,true])for(const wave of [0,1]){
      c.globalAlpha=outside?.78:1;c.strokeStyle=wave?'#e1ebd860':'#e1ebd880';c.beginPath();let segments=0;
      for(let y=top;y<=bottom;y++)for(const tile of ground.waterRows[y]){
        const x=tile.x,cx=x*T+32,cy=y*T+32;
        if(tile.outside!==outside||x<left||x>right||occupied.has(x+','+y)||!visible(cx,cy,22,11))continue;
        const off=Math.sin(animationTime*.8+x+y)*2;
        c.moveTo(cx+(wave?8-off:-15+off),cy+(wave?10:-10));c.lineTo(cx+(wave?19-off:1+off),cy+(wave?10:-10));segments++;
      }
      if(segments)c.stroke();
    }
    c.restore();
    drawLinks(c,s,visible);
    if(selected){const px=selected.x*T,py=selected.y*T;rect(c,px+2,py+2,T-4,T-4,'#fbebaf30');c.strokeStyle='#b59451';c.lineWidth=1.5;c.strokeRect(px+2,py+2,T-4,T-4);if(!GF.at(s,selected.x,selected.y)){c.font='23px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.fillStyle='#9c8448';c.fillText('+',px+32,py+40);}}
    for(const b of s.buildings.filter(b=>visible(b.x*T+32,b.y*T+32,64,96)).sort((a,b)=>a.y-b.y)){
      c.save();c.translate(b.x*T+32,b.y*T+32);
      const buildingImage=artImage(buildingPath(b.type,b.level));
      if(buildingImage.complete&&buildingImage.naturalWidth){c.imageSmoothingEnabled=false;c.drawImage(buildingImage,-64,-96,128,128);}
      if(b.type==='shrine'){rect(c,-38,-57,76,19,s.players[b.owner].team===1?'#a74e3ceb':b.owner===options.player?'#3d685deb':'#597f96eb');c.font='bold 12px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.fillStyle='#fff4d9';c.fillText(b.owner===options.player?'你的庄园':s.players[b.owner].team===0?'队友庄园':'敌方庄园 '+(b.owner+1),0,-43);}
      if(b.type==='gate'){
        if(b.hp<=0){poly(c,[[-16,-6],[-5,1],[-10,20],[12,20],[5,4],[17,-6]],'#34443bee');line(c,[[-14,17],[-3,9],[10,21]],'#b19872',3);c.font='bold 11px "Microsoft YaHei",sans-serif';c.textAlign='center';rect(c,-19,-19,38,15,'#714a3be8');c.fillStyle='#ffe0b0';c.fillText('毁损',0,-8);}
        else{c.font='bold 10px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.fillStyle='#f1dfae';c.fillText(['北','东','南','西'][b.direction]||'门',0,-13);}
      }
      if(b.type==='shrine'&&s.buildings.length===1){c.strokeStyle='#ead59a80';c.lineWidth=1;ellipse(c,0,19,32+Math.sin(s.elapsed)*2,12,null,'#b99e6770');}
      if(b.hp<GF.maxHP(b)){const y=healthBarY(b);rect(c,-21,y,42,3,'#61775c66');rect(c,-21,y,42*Math.max(0,b.hp/GF.maxHP(b)),3,b.hp/GF.maxHP(b)>.35?'#819d64':'#b06a4e');}
      if(!GF.upgradeReason(player,b)){
        const bob=(reducedMotion||options.reducedMotion===true)?0:Math.sin(animationTime*3+(b.id||0)*2.399963229728653)*2.5;
        c.save();c.translate(0,bob);poly(c,[[11,-5],[17,-11],[23,-5],[20,-5],[20,0],[14,0],[14,-5]],'#b4df63','#496a38',1.2);c.restore();
      }
      const levelLabel=String(b.level),badgeWidth=16,badgeX=25-badgeWidth;
      c.beginPath();c.moveTo(badgeX+2,5);c.lineTo(23,5);c.quadraticCurveTo(25,5,25,7);c.lineTo(25,19);c.quadraticCurveTo(25,21,23,21);c.lineTo(badgeX+2,21);c.quadraticCurveTo(badgeX,21,badgeX,19);c.lineTo(badgeX,7);c.quadraticCurveTo(badgeX,5,badgeX+2,5);c.closePath();c.fillStyle='#52685a';c.fill();
      c.fillStyle='#f4ebd2';c.font='900 11px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(levelLabel,badgeX+badgeWidth/2,13);c.textBaseline='alphabetic';
      if(cam.zoom>=.9){const label=b.type==='gate'?(['北','东','南','西'][b.direction]||'')+'城门':b.type==='barracks'?GF.name(b):GF.DEFS[b.type].name;c.font='9px "SimHei","Microsoft YaHei",sans-serif';const labelWidth=c.measureText(label).width+14;rect(c,-labelWidth/2,27,labelWidth,14,'#f3f0daf0');c.fillStyle='#52694e';c.fillText(label,0,37);}
      if(GF.DEFS[b.type].end){poly(c,[[-23,10],[-19,14],[-23,18],[-27,14]],'#c5a25d');}
      c.restore();
    }
    // Units use their own positions, even when their barracks is offscreen.
    let soldierMotion=soldierMotionCaches.get(s);
    if(!soldierMotion){soldierMotion={facing:new Map(),positions:new Map(),walking:new Map(),health:new Map(),hitUntil:new Map(),attacks:new Map(),attackCooldowns:new Map(),samples:new Map(),spacing:new Map()};soldierMotionCaches.set(s,soldierMotion);}
    soldierMotion.spacing||=new Map();
    const allUnits=[];
    for(const source of s.soldiers){
      if(source.hp<=0)continue;
      let unit=source;
      if(options.unitPosition){const position=options.unitPosition(source,s.players[source.owner].team===0);unit={...source,...position};}
      else if(options.animationTime!==undefined){
        // Render one simulation interval behind so fixed 30 Hz positions blend across every display frame.
        let sample=soldierMotion.samples.get(source.id);
        if(!sample)sample={fromX:source.x,fromY:source.y,x:source.x,y:source.y,time:s.elapsed,duration:0};
        else if(source.x!==sample.x||source.y!==sample.y){
          const duration=Math.max(1/120,s.elapsed-sample.time);
          sample={fromX:sample.x,fromY:sample.y,x:source.x,y:source.y,time:s.elapsed,duration};
        }
        else if(s.elapsed!==sample.time)sample={fromX:source.x,fromY:source.y,x:source.x,y:source.y,time:s.elapsed,duration:0};
        soldierMotion.samples.set(source.id,sample);
        const progress=sample.duration?Math.max(0,Math.min(1,(animationTime-sample.time)/sample.duration)):1;
        unit={...source,x:sample.fromX+(sample.x-sample.fromX)*progress,y:sample.fromY+(sample.y-sample.fromY)*progress};
      }
      allUnits.push({unit,base:{x:unit.x,y:unit.y},soldier:s.players[source.owner].team===0});
    }
    const pushes=allUnits.map(()=>({x:0,y:0}));
    for(let pass=0;pass<3;pass++)for(let i=0;i<allUnits.length;i++)for(let j=i+1;j<allUnits.length;j++){
      let dx=(allUnits[i].unit.x-allUnits[j].unit.x)*T+pushes[i].x-pushes[j].x;
      let dy=(allUnits[i].unit.y-allUnits[j].unit.y)*T+pushes[i].y-pushes[j].y;
      let distance=Math.hypot(dx,dy);
      const minimum=allUnits[i].unit.boss||allUnits[j].unit.boss?22:18;
      if(distance>=minimum)continue;
      if(distance<.001){
        const hash=(Math.imul((allUnits[i].unit.id||i)+1,1103515245)^Math.imul((allUnits[j].unit.id||j)+1,12345))>>>0;
        const angle=hash/4294967296*Math.PI*2;dx=Math.cos(angle);dy=Math.sin(angle);distance=1;
      }
      const force=(minimum-distance)*.5/distance;
      pushes[i].x+=dx*force;pushes[i].y+=dy*force;
      pushes[j].x-=dx*force;pushes[j].y-=dy*force;
    }
    for(let i=0;i<allUnits.length;i++){
      const item=allUnits[i],limit=item.unit.boss?14:10,length=Math.hypot(pushes[i].x,pushes[i].y);
      if(length>limit){pushes[i].x*=limit/length;pushes[i].y*=limit/length;}
      const target={x:pushes[i].x/T,y:pushes[i].y/T},previous=soldierMotion.spacing.get(item.unit.id);
      let spacing=target;
      if(previous){const dt=Math.max(0,Math.min(.1,animationTime-previous.time)),blend=1-Math.exp(-dt*18);spacing={x:previous.x+(target.x-previous.x)*blend,y:previous.y+(target.y-previous.y)*blend};}
      soldierMotion.spacing.set(item.unit.id,{...spacing,time:animationTime});
      item.unit={...item.unit,x:item.unit.x+spacing.x,y:item.unit.y+spacing.y};
    }
    const units=allUnits.filter(({unit})=>visible(unit.x*T+32,unit.y*T+32,unit.boss?38:24,unit.boss?76:52));
    units.sort((a,b)=>a.unit.y-b.unit.y);
    const unitById=new Map(s.soldiers.map(unit=>[unit.id,unit])),buildingById=new Map(s.buildings.map(building=>[building.id,building]));
    for(const {unit} of units){
      const previousHp=soldierMotion.health.get(unit.id);
      if(previousHp!==undefined&&unit.hp<previousHp){
        soldierMotion.hitUntil.set(unit.id,animationTime+.2);
        if(options.online){
          let attacker=null,best=.8;
          for(const item of units){
            if(s.players[item.unit.owner].team===s.players[unit.owner].team)continue;
            const distance=Math.hypot(item.unit.x-unit.x,item.unit.y-unit.y);
            if(distance<best||distance===best&&(!attacker||item.unit.id<attacker.id)){attacker=item.unit;best=distance;}
          }
          if(attacker)soldierMotion.attacks.set(attacker.id,animationTime);
        }
      }
      soldierMotion.health.set(unit.id,unit.hp);
    }
    for(const {unit:e,base,soldier} of units){
      const archer=GF.troopType(e)==='archer',interval=GF.troopDef(e).interval;
      // Cooldown values tick at 30 Hz; the reset timestamp drives the short swing on the render clock.
      const previousAttack=soldierMotion.attackCooldowns.get(e.id);
      if(options.online){
        if(e.attackAt>0&&e.attackAt!==previousAttack)soldierMotion.attacks.set(e.id,animationTime-Math.max(0,s.elapsed-e.attackAt));
        soldierMotion.attackCooldowns.set(e.id,e.attackAt);
      }else{
        if(e.attack>0&&(previousAttack===undefined||e.attack>previousAttack+.0001))soldierMotion.attacks.set(e.id,s.elapsed-(interval-e.attack));
        soldierMotion.attackCooldowns.set(e.id,e.attack);
      }
      const previous=soldierMotion.positions.get(e.id),goal=unitById.get(e.targetId)||buildingById.get(e.targetBuildingId)||e.waypoint;
      let dx=previous?base.x-previous.x:0,dy=previous?base.y-previous.y:0;
      if((Math.abs(dx)+Math.abs(dy)<=.001||archer)&&goal){dx=goal.x-base.x;dy=goal.y-base.y;}
      if(Math.abs(dx)+Math.abs(dy)>.001){const current=soldierMotion.facing.get(e.id)||'front';soldierMotion.facing.set(e.id,soldierFacing(dx,dy,current));}
      const moved=!!previous&&Math.hypot(base.x-previous.x,base.y-previous.y)>.0001;
      let walk=soldierMotion.walking.get(e.id);
      if(moved&&!e.repelled){
        if(!walk||animationTime>=walk.until)walk={started:animationTime,until:animationTime+.3};
        else walk.until=walk.started+(Math.floor((animationTime-walk.started)/.3)+1)*.3;
        soldierMotion.walking.set(e.id,walk);
      }
      soldierMotion.positions.set(e.id,{x:base.x,y:base.y});
      const bounce=walk&&animationTime<walk.until&&!e.repelled&&!reducedMotion?soldierWalkBounce(animationTime-walk.started):{stretch:0,lift:0};
      const faction=s.players[e.owner].team!==s.players[playerOwner].team?'enemy':e.owner===playerOwner?'player':'ally';
      const direction=soldierMotion.facing.get(e.id)||'front',localAttack=soldierMotion.attacks.get(e.id),attackCooldown=localAttack!==undefined?1-(animationTime-localAttack):archer?0:e.attack;
      const attackAngle=!archer&&!reducedMotion&&!e.repelled?soldierAttackAngle(attackCooldown,direction):0,hit=animationTime<(soldierMotion.hitUntil.get(e.id)||0);
      c.save();c.translate(e.x*T+32,e.y*T+32);if(e.boss)c.scale(1.6,1.6);
      c.save();c.rotate(attackAngle);
      if(archer&&!reducedMotion&&!e.repelled&&localAttack!==undefined){
        const elapsed=animationTime-localAttack,recoil=elapsed>=0&&elapsed<.15?2*Math.sin(elapsed/.15*Math.PI):0;
        c.translate(direction==='left'?recoil:direction==='right'?-recoil:0,direction==='back'?recoil:direction==='front'?-recoil:0);
      }
      soldierSprite(c,soldierAtlases[GF.troopType(e)+'_'+faction],e.level,direction,soldier?'soldier':'enemy-soldier',animationTime,e.repelled>0,bounce,hit);c.restore();
      if(e.slowed>0)ellipse(c,0,2,13,5,'#8bb7a029','#76a08f');c.restore();
    }
    // Keep health bars above all unit bodies during close combat.
    for(const {unit:e,soldier} of units){c.save();c.translate(e.x*T+32,e.y*T+32);if(e.boss)c.scale(1.6,1.6);rect(c,-14,-43,28,4.5,soldier?'#254a31':'#273e3480',soldier?'#c9dfaa':null);rect(c,-13,-42,26*Math.max(0,Math.min(1,e.hp/e.maxHp)),2.5,soldier?'#91c967':'#bb775a');c.restore();}
    if(night||dusk){c.fillStyle=night?'#19395878':'#ac723222';c.fillRect(left*T,top*T,(right-left+1)*T,(bottom-top+1)*T);if(night){const glow=nightGlow();c.globalCompositeOperation='screen';for(const b of s.buildings){if(!visible(b.x*T+32,b.y*T+36,64))continue;if(['shrine','earth','tao','tower','inn'].includes(b.type))c.drawImage(glow,b.x*T+32-64,b.y*T+36-64,128,128);}c.globalCompositeOperation='source-over';}}
    const hintPulse=reducedMotion||options.reducedMotion===true?1:1+.035*Math.sin(animationTime*2.4);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      const tile=y*size+x;
      if(occupied.has(x+','+y)||blockedHints.has(tile)||!visible(x*T+32,y*T+32,29))continue;
      let best=hints.tiles.get(tile);
      if(!hints.tiles.has(tile)){
        let bestIncome=-Infinity;best=null;
        const town=player;
        for(const hint of GF.buildHints(town,x,y,true)){
          if(hint.resource!=='coins'&&hint.resource!=='materials')continue;
          const preview={type:hint.type,x,y,level:1};
          // Include the new building's own aura without changing the live state.
          const shadow={...town,buildings:[...town.buildings,preview]},income=GF.income(shadow,preview);
          if(!best||income>bestIncome||income===bestIncome&&(hint.tier>best.tier||hint.tier===best.tier&&hint.resource==='coins'&&best.resource!=='coins')){
            best=hint;bestIncome=income;
          }
        }
        hints.tiles.set(tile,best);
      }
      if(!best)continue;
      c.save();c.translate(x*T+32,y*T+32);c.scale(hintPulse,hintPulse);
      c.strokeStyle=best.resource==='coins'?'#f5d978':'#d7b8f0';c.lineWidth=3.5;c.lineCap='butt';c.lineJoin='miter';c.globalAlpha=.7;c.shadowColor='transparent';c.shadowBlur=0;
      c.beginPath();
      for(let layer=0;layer<(best.tier>=2?2:1);layer++){
        const halfWidth=26-layer*6,arm=layer?8:12;
        for(const sx of [-1,1])for(const sy of [-1,1]){
          c.moveTo(sx*(halfWidth-arm),sy*halfWidth);c.lineTo(sx*halfWidth,sy*halfWidth);c.lineTo(sx*halfWidth,sy*(halfWidth-arm));
        }
      }
      if(best.tier===3){c.moveTo(-5,0);c.lineTo(5,0);c.moveTo(0,-5);c.lineTo(0,5);}
      c.stroke();c.restore();
    }
    drawSelection(c,s,selected);
    for(const p of options.projectiles||s.projectiles){const f=1-p.life/p.total,x=(p.x+(p.tx-p.x)*f)*T+32,y=(p.y+(p.ty-p.y)*f)*T+22;if(!visible(x,y,Math.abs((p.tx-p.x)*5)+5,Math.abs((p.ty-p.y)*5)+40))continue;if(p.type==='rock'){ellipse(c,x,y-Math.sin(f*Math.PI)*35,4,4,'#c6c4a2');}else{line(c,[[x,y],[x-(p.tx-p.x)*5,y-(p.ty-p.y)*5]],p.type==='archer'?'#f5e5a1':'#f6e8bf',2);}}
    for(const e of options.effects||s.effects){const x=e.x*T+32,y=e.y*T+32,f=1-e.life/e.total;
      const radius=['income','coin'].includes(e.type)?Math.max(64,('+'+e.amount).length*14/cam.zoom):['hit','soldier-hit'].includes(e.type)?24:e.type==='thunder'?120:24+f*480;
      if(!visible(x,y,radius))continue;c.save();c.globalAlpha=1-f;
      if(e.type==='thunder'){line(c,[[x+15,y-120],[x-10,y-70],[x+7,y-70],[x-5,y]],'#faf3b0',3);ellipse(c,x,y,22,12,'#eee4a344');}
      else if(e.type==='zhong-pulse'){ellipse(c,x,y,24+f*480,16+f*480,null,'#8eb8a0');}
      else if(e.type==='income'||e.type==='coin'){
        c.globalAlpha=Math.min(1,(1-f)*3);c.translate(x,y-(e.type==='income'?4:20)-f*24);c.scale(Math.max(1,1/cam.zoom),Math.max(1,1/cam.zoom));
        c.font='bold 13px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='left';const label='+'+e.amount,tw=c.measureText(label).width,start=-(tw+18)/2;
        c.lineWidth=3;c.strokeStyle='#3e573ae0';c.strokeText(label,start,0);c.fillStyle='#ffecb1';c.fillText(label,start,0);
        const cx=start+tw+10;
        if(e.resource==='materials'){
          c.save();c.translate(cx,-5);c.rotate(-.6);
          rect(c,-2,-1,4,11,'#b99764','#665e47');rect(c,-7,-6,14,5,'#849a8b','#4e695f');line(c,[[-5,-4],[5,-4]],'#b6c7ad',1);
          c.restore();
        }else{
          ellipse(c,cx,-5,6,6,'#ddb767','#6f743d');ellipse(c,cx,-5,4.2,4.2,null,'#fae3a2');rect(c,cx-1.7,-6.7,3.4,3.4,'#61724a','#b18e4c');
        }
      }
      else if(e.type==='soldier-hit'){line(c,[[x-10+f*8,y+5],[x+12,y-13+f*8]],'#f5e5a1',2);line(c,[[x-5,y-9],[x+5,y+1]],'#c9dfaa',1.5);}
      else if(e.type==='hit'){ellipse(c,x,y,20,20,'#ae674066');}
      else{ellipse(c,x,y,20+f*450,20+f*450,null,e.type==='repair'?'#d0e8a4':'#eee0a6');}
      c.restore();}
    c.restore();
    // Two passing swallows, rendered as fine ink strokes.
    if(!night){for(let i=0;i<2;i++){const x=(animationTime*8+i*37+w*.67)%(w+100)-50,y=h*.31+Math.sin(animationTime*.12+i)*15+i*12;line(c,[[x-6,y-2],[x,y+Math.sin(animationTime*4+i)*2],[x+6,y-2]],'#5d73596a',1);}}
  }
  function person(c,type,time,frozen){
    const bob=frozen?0:Math.sin(time*8)*1.5;ellipse(c,1,10,9,3,'#273d3b38');
    if(type==='fox'){poly(c,[[-6,4],[-17,-5],[-13,7],[-5,10]],'#c5a381');ellipse(c,1,3+bob,8,5,'#c69a77');poly(c,[[4,0+bob],[5,-9+bob],[9,-4+bob],[13,-9+bob],[13,1+bob]],'#d8b891','#996d56');rect(c,7,-2+bob,1.5,1.5,'#565246');}
    else {const color=type==='ghost'?'#849b9c':type==='soldier'?'#4f8b9a':'#b75548';poly(c,[[-5,-3+bob],[5,-3+bob],[8,9],[-7,9]],color,'#52605b');ellipse(c,0,-8+bob,4.5,5,type==='ghost'?'#b4c8bb':'#c6b592');rect(c,-5,-13+bob,10,3,type==='soldier'?'#32677c':'#8c3f35');line(c,[[-3,9],[-4,14+bob]],'#4c5851',2);line(c,[[3,9],[5,14-bob]],'#4c5851',2);line(c,[[7,1],[10,-11]],type==='ghost'?'#a5c3b5':'#bec1a7',2);}
    if(frozen){ellipse(c,0,-1,14,19,null,'#e9d28d');c.fillStyle='#eddda5';c.font='10px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.fillText('封',0,-18);}
  }
  function soldierWalkBounce(time){
    const phase=((time%.3)+.3)%.3,amount=phase<.1?phase/.1:1-(phase-.1)/.2,value=2*Math.max(0,Math.min(1,amount));
    return {stretch:value,lift:value};
  }
  function soldierAttackAngle(cooldown,direction){
    if(!(cooldown>0&&cooldown<=1))return 0;
    const elapsed=1-cooldown,amount=elapsed<.05?elapsed/.05:elapsed<.1?1-(elapsed-.05)/.05:0,degrees=20*Math.max(0,amount);
    return degrees*(direction==='left'||direction==='back'?-1:1)*Math.PI/180;
  }
  function soldierSprite(c,atlas,level,direction,fallback,time,frozen,bounce={stretch:0,lift:0},hit=false){
    if(!atlas.complete||!atlas.naturalWidth){person(c,fallback,time,frozen);return;}
    const directionIndex={front:0,back:1,left:2,right:3},safeLevel=Math.max(1,Math.min(9,level||1));
    const row=Math.floor((safeLevel-1)/3),col=((safeLevel-1)%3)*4+directionIndex[direction];
    c.save();c.imageSmoothingEnabled=false;if(hit)c.filter='brightness(0) invert(1)';c.drawImage(atlas,col*20,row*30,20,30,-16,-45-bounce.stretch-bounce.lift,32,48+bounce.stretch);c.restore();
    if(frozen){ellipse(c,0,-16,14,24,null,'#e9d28d');c.fillStyle='#eddda5';c.font='8px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.fillText('封',0,-43);}
  }
  function assetCanvas(width,height,paint){
    const source=document.createElement('canvas');source.width=width;source.height=height;paint(source.getContext('2d'));
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(source,0,0,width,height,0,0,64,64);
    const pixels=c.getImageData(0,0,64,64);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]<128?0:255;c.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
  }
  function paintTerrainTile(c,type){
    rect(c,0,0,T,T,palette[type]);
    for(let j=0;j<9;j++){const gx=noise(3,7,j+2)*60+2,gy=noise(7,3,j+31)*60+2;if(type==='water')line(c,[[gx-3,gy],[gx+4,gy]],'#d1e1c65c',.8);else if(type==='shore')ellipse(c,gx,gy,1.2,.7,'#9eaa873f');else line(c,[[gx-2,gy-2],[gx,gy+1],[gx+2,gy-3]],'#81986238',.8);}
    if(type==='shore')for(let j=0;j<3;j++){const gx=10+noise(3,7,j+65)*44,gy=10+noise(7,3,j+81)*44;line(c,[[gx-2,gy+4],[gx,gy-2],[gx+2,gy+4]],'#a9ad765c',.9);}
    if(type==='water'){ellipse(c,17,38,4,2,'#9fb993');ellipse(c,24,41,3,1.8,'#9db88e');}
  }
  function paintConnectedTile(c,mask,kind){
    const north=mask&1,east=mask&2,south=mask&4,west=mask&8;
    if(kind==='wall'){
      c.beginPath();c.rect(19,19,26,26);if(north)c.rect(19,0,26,32);if(south)c.rect(19,32,26,32);if(west)c.rect(0,19,32,26);if(east)c.rect(32,19,32,26);
      c.fillStyle='#667367';c.shadowColor='#34463866';c.shadowBlur=4;c.shadowOffsetY=3;c.fill();c.shadowColor='transparent';c.strokeStyle='#4b5c51';c.lineWidth=3;c.stroke();c.clip();rect(c,0,0,T,T,'#b7bba7');
      for(let row=0;row<8;row++){const yy=row*8;line(c,[[0,yy],[T,yy]],'#788775',1);for(let col=0;col<5;col++){const xx=col*16+(row%2)*8;line(c,[[xx,yy],[xx,yy+8]],'#87927e',1);}}
      return;
    }
    c.beginPath();c.rect(21,21,22,22);if(north)c.rect(21,0,22,32);if(south)c.rect(21,32,22,32);if(west)c.rect(0,21,32,22);if(east)c.rect(32,21,32,22);c.clip();
    rect(c,0,0,T,T,kind==='bridge'?'#ad9063':'#dfd5b494');
    if(kind==='bridge')for(let i=0;i<T;i+=7){if(north||south||!east&&!west)line(c,[[19,i],[45,i]],'#655c43',1.5);if(east||west)line(c,[[i,19],[i,45]],'#655c43',1.5);}
  }
  function exportPngAssets(){
    const assets={};
    for(const type of Object.keys(GF.DEFS))for(let level=1;level<=3;level++)assets[`assets/sprites/buildings/${type}/level-${level}.png`]=assetCanvas(128,128,c=>{c.translate(64,96);building(c,type,(level-1)*3+1,0,true);});
    for(const type of Object.keys(palette))assets[`assets/tiles/terrain/${type}.png`]=assetCanvas(T,T,c=>paintTerrainTile(c,type));
    assets['assets/tiles/resources/forest.png']=assetCanvas(128,128,c=>{c.translate(64,64);tree(c,-14,7,.95);tree(c,10,-8,1.1);bamboo(c,15,19,.66);});
    assets['assets/tiles/resources/mountain.png']=assetCanvas(128,128,c=>{c.translate(64,64);stone(c,-9,9,1.1);stone(c,15,-4,1.2);stone(c,-13,-13,.6);});
    assets['assets/tiles/resources/border-tree.png']=assetCanvas(128,128,c=>{c.translate(64,72);tree(c,0,0,1,true);});
    assets['assets/tiles/resources/reeds.png']=assetCanvas(64,64,c=>{for(let i=0;i<4;i++)line(c,[[9+i*3,54],[7+i*3,39+i%2*4]],'#739575',1.3);});
    for(let mask=0;mask<16;mask++){
      const name=mask.toString(16).padStart(2,'0');
      assets[`assets/tiles/walls/${name}.png`]=assetCanvas(T,T,c=>paintConnectedTile(c,mask,'wall'));
      assets[`assets/tiles/roads/ground-${name}.png`]=assetCanvas(T,T,c=>paintConnectedTile(c,mask,'ground'));
      assets[`assets/tiles/roads/bridge-${name}.png`]=assetCanvas(T,T,c=>paintConnectedTile(c,mask,'bridge'));
    }
    return assets;
  }
  window.GFArt={T,thumbnail,render,exportPngAssets,spriteVersion:()=>soldierSpriteVersion+artAssetVersion,cacheStats:()=>({chunks:ground?.chunks.size||0,pixels:[...(ground?.chunks.values()||[])].reduce((n,t)=>n+t.canvas.width*t.canvas.height,0),largestSide:Math.max(0,...[...(ground?.chunks.values()||[])].map(t=>Math.max(t.canvas.width,t.canvas.height)))})};
})();
