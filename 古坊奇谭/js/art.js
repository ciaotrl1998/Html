(function () {
  'use strict';
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = 64, palette = { plain: '#ced5af', shore: '#d9cda7', water: '#a9c9bd', forest: '#b4c49a', mountain: '#c3c5af' };
  const hintCaches = new WeakMap();
  const sprites = new Map();
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
  const thumbs = new Map();
  function thumbnail(type, level=1){
    const key=type+GF.visualLevel(level);
    if(thumbs.has(key))return thumbs.get(key);
    const source=document.createElement('canvas');source.width=240;source.height=260;
    const ctx=source.getContext('2d');ctx.translate(120,190);ctx.scale(2,2);building(ctx,type,level);
    // Include every nontransparent pixel, including roof strokes and soft shadows.
    const pixels=ctx.getImageData(0,0,source.width,source.height).data;
    let left=source.width,top=source.height,right=-1,bottom=-1;
    for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
      if(!pixels[(y*source.width+x)*4+3])continue;
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
    }
    const c=document.createElement('canvas');c.width=180;c.height=210;
    if(right>=left){
      left=Math.max(0,left-1);top=Math.max(0,top-1);right=Math.min(source.width-1,right+1);bottom=Math.min(source.height-1,bottom+1);
      const width=right-left+1,height=bottom-top+1,padding=6,scale=Math.min((c.width-padding*2)/width,(c.height-padding*2)/height);
      c.getContext('2d').drawImage(source,left,top,width,height,(c.width-width*scale)/2,(c.height-height*scale)/2,width*scale,height*scale);
    }
    const url=c.toDataURL();thumbs.set(key,url);return url;
  }
  function makeGround(s,occupied){
    const size=GF.worldWidth(s),height=GF.worldHeight(s),center=GF.worldCenter(s),estate=GF.estate(s);
    const canvas=document.createElement('canvas');canvas.width=size*T;canvas.height=height*T;const c=canvas.getContext('2d');
    for(let y=0;y<height;y++)for(let x=0;x<size;x++){
      const type=GF.terrain(x,y,s),px=x*T,py=y*T;
      rect(c,px,py,T,T,palette[type]);
      if(type==='water'){
        rect(c,px,py,T,T,palette.shore);
        const north=GF.terrain(x,y-1,s)==='water',east=GF.terrain(x+1,y,s)==='water',south=GF.terrain(x,y+1,s)==='water',west=GF.terrain(x-1,y,s)==='water';
        const tl=!north&&!west?18:0,tr=!north&&!east?18:0,br=!south&&!east?18:0,bl=!south&&!west?18:0;
        c.beginPath();c.moveTo(px+tl,py);c.lineTo(px+T-tr,py);c.quadraticCurveTo(px+T,py,px+T,py+tr);
        c.lineTo(px+T,py+T-br);c.quadraticCurveTo(px+T,py+T,px+T-br,py+T);c.lineTo(px+bl,py+T);
        c.quadraticCurveTo(px,py+T,px,py+T-bl);c.lineTo(px,py+tl);c.quadraticCurveTo(px,py,px+tl,py);c.closePath();
        c.fillStyle=palette.water;c.fill();
        c.save();c.clip();c.beginPath();
        if(!north){c.moveTo(px+tl,py);c.lineTo(px+T-tr,py);}
        if(!east){c.moveTo(px+T,py+tr);c.lineTo(px+T,py+T-br);}
        if(!south){c.moveTo(px+T-br,py+T);c.lineTo(px+bl,py+T);}
        if(!west){c.moveTo(px,py+T-bl);c.lineTo(px,py+tl);}
        if(tl){c.moveTo(px,py+tl);c.quadraticCurveTo(px,py,px+tl,py);}
        if(tr){c.moveTo(px+T-tr,py);c.quadraticCurveTo(px+T,py,px+T,py+tr);}
        if(br){c.moveTo(px+T,py+T-br);c.quadraticCurveTo(px+T,py+T,px+T-br,py+T);}
        if(bl){c.moveTo(px+bl,py+T);c.quadraticCurveTo(px,py+T,px,py+T-bl);}
        c.strokeStyle='#c6d1a6';c.lineWidth=6;c.stroke();c.restore();
      }else rect(c,px,py,T,T,`rgba(248,245,213,${noise(x,y)*.1})`);
      for(let j=0;j<9;j++){let gx=px+noise(x,y,j+2)*60+2,gy=py+noise(y,x,j+31)*60+2;if(type==='water'){line(c,[[gx-3,gy],[gx+4,gy]],'#d1e1c65c',.8);}else if(type==='shore'){ellipse(c,gx,gy,1.2,.7,'#9eaa873f');}else{line(c,[[gx-2,gy-2],[gx,gy+1],[gx+2,gy-3]],'#81986238',.8);}}
      if(type==='shore'){
        for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) if(GF.terrain(x+dx,y+dy,s)==='water'){
          const edge=dx===1?[[px+T-3,py+4],[px+T-3,py+T-4]]:dx===-1?[[px+3,py+4],[px+3,py+T-4]]:dy===1?[[px+4,py+T-3],[px+T-4,py+T-3]]:[[px+4,py+3],[px+T-4,py+3]];
          line(c,edge,'#f4e6bf9c',2);
        }
        for(let j=0;j<3;j++){const gx=px+10+noise(x,y,j+65)*44,gy=py+10+noise(y,x,j+81)*44;line(c,[[gx-2,gy+4],[gx,gy-2],[gx+2,gy+4]],'#a9ad765c',.9);}
      }
      if(type==='water'){
        if(noise(x,y)>.3){ellipse(c,px+17,py+38,4,2,'#9fb993');ellipse(c,px+24,py+41,3,1.8,'#9db88e');}
      }
      if(type==='mountain'&&!GF.isWall(s,x,y)&&!estate?.roads.has(y*size+x)&&noise(x,y)>.7){stone(c,px+44,py+19,.4);}
      if(estate&&!GF.owns(s,x,y))rect(c,px,py,T,T,'#34473e18');
    }
    if(!estate){
      for(let y=center-2;y<=center+2;y++)rect(c,center*T+25,y*T,14,T,'#dcd8b74a');
      for(let x=center-2;x<=center+2;x++)rect(c,x*T,center*T+27,T,12,'#dcd8b74a');
    }else{
      const has=(set,x,y)=>x>=0&&y>=0&&x<size&&y<height&&set.has(y*size+x);
      for(const index of estate.roads){
        const x=index%size,y=Math.floor(index/size),px=x*T,py=y*T,water=GF.terrain(x,y,s)==='water';
        const north=has(estate.roads,x,y-1),south=has(estate.roads,x,y+1),east=has(estate.roads,x+1,y),west=has(estate.roads,x-1,y);
        c.save();c.beginPath();c.rect(px+21,py+21,22,22);
        if(north)c.rect(px+21,py,22,32);if(south)c.rect(px+21,py+32,22,32);
        if(west)c.rect(px,py+21,32,22);if(east)c.rect(px+32,py+21,32,22);
        c.clip();rect(c,px,py,T,T,water?'#ad9063':'#dfd5b494');
        if(water){
          for(let i=0;i<T;i+=7){if(north||south||!east&&!west)line(c,[[px+19,py+i],[px+45,py+i]],'#655c43',1.5);if(east||west)line(c,[[px+i,py+19],[px+i,py+45]],'#655c43',1.5);}
        }
        c.restore();
      }
      // Follow the irregular interior one cell edge at a time.
      for(const index of estate.cells){
        const x=index%size,y=Math.floor(index/size),px=x*T,py=y*T;
        for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]])if(!GF.owns(s,x+dx,y+dy)){
          const edge=dx===1?[[px+T-2,py+2],[px+T-2,py+T-2]]:dx===-1?[[px+2,py+2],[px+2,py+T-2]]:dy===1?[[px+2,py+T-2],[px+T-2,py+T-2]]:[[px+2,py+2],[px+T-2,py+2]];
          line(c,edge,'#f3df9b99',2);
        }
      }
      const connects=(x,y)=>GF.isWall(s,x,y)||estate.gates.some(g=>g.x===x&&g.y===y);
      for(const index of estate.walls){
        const x=index%size,y=Math.floor(index/size),px=x*T,py=y*T;
        c.save();c.beginPath();c.rect(px+19,py+19,26,26);
        if(connects(x,y-1))c.rect(px+19,py,26,32);if(connects(x,y+1))c.rect(px+19,py+32,26,32);
        if(connects(x-1,y))c.rect(px,py+19,32,26);if(connects(x+1,y))c.rect(px+32,py+19,32,26);
        c.fillStyle='#667367';c.shadowColor='#34463866';c.shadowBlur=4;c.shadowOffsetY=3;c.fill();c.shadowColor='transparent';
        c.strokeStyle='#4b5c51';c.lineWidth=3;c.stroke();c.clip();
        rect(c,px,py,T,T,'#b7bba7');
        for(let row=0;row<8;row++){
          const yy=py+row*8;line(c,[[px,yy],[px+T,yy]],'#788775',1);
          for(let col=0;col<5;col++){const xx=px+col*16+(row%2)*8;line(c,[[xx,yy],[xx,yy+8]],'#87927e',1);}
        }
        c.restore();
      }
    }
    // Bake the large map shadow once instead of blurring a map-sized surface every frame.
    const padded=document.createElement('canvas');padded.width=canvas.width+96;padded.height=canvas.height+96;
    const ctx=padded.getContext('2d');ctx.shadowColor='#40583e18';ctx.shadowBlur=35;ctx.shadowOffsetY=8;
    ctx.drawImage(canvas,48,48);
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.translate(48,48);
    const base=document.createElement('canvas');base.width=padded.width;base.height=padded.height;
    base.getContext('2d').drawImage(padded,0,0);
    padded.base=base;padded.occupied=new Set(occupied);
    const waterRows=Array.from({length:height},()=>[]);
    for(let y=0;y<height;y++)for(let x=0;x<size;x++)if(GF.terrain(x,y,s)==='water'&&!GF.isWall(s,x,y)&&!estate?.roads.has(y*size+x))waterRows[y].push({x,outside:!!estate&&!GF.owns(s,x,y)});
    drawGroundDecorations(ctx,s,occupied,0,0,size-1,height-1);
    padded.waterRows=waterRows;
    return padded;
  }
  function drawGroundDecorations(ctx,s,occupied,left,top,right,bottom){
    const size=GF.worldWidth(s),height=GF.worldHeight(s),estate=GF.estate(s);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      if(occupied.has(x+','+y)||GF.isWall(s,x,y)||estate?.roads.has(y*size+x))continue;
      const type=GF.terrain(x,y,s);ctx.save();ctx.translate(x*T+32,y*T+32);
      const outside=!!estate&&!GF.owns(s,x,y);if(outside)ctx.globalAlpha=.78;
      if(type==='forest')drawBaked(ctx,'forest',c=>{tree(c,-14,7,.95);tree(c,10,-8,1.1);bamboo(c,15,19,.66);});
      if(type==='mountain')drawBaked(ctx,'mountain',c=>{stone(c,-9,9,1.1);stone(c,15,-4,1.2);stone(c,-13,-13,.6);});
      if(type==='plain'&&(x===0||y===0||x===size-1||y===height-1)&&noise(x,y)>.35){
        ctx.translate(0,8);const scale=.8+noise(x,y)*.5;ctx.scale(scale,scale);drawBaked(ctx,'border-tree',c=>tree(c,0,0,1,true));
      }
      if(type==='water'){
        if(noise(x,y)>.65)for(let i=0;i<4;i++)line(ctx,[[-23+i*3,22],[-25+i*3,9+noise(x,y,i)*7]],'#739575',1.3);
      }
      ctx.restore();
    }
  }
  function updateGround(s,occupied){
    const changed=[...ground.occupied].filter(key=>!occupied.has(key)).concat([...occupied].filter(key=>!ground.occupied.has(key)));
    if(!changed.length)return;
    const ctx=ground.getContext('2d'),size=GF.worldWidth(s),height=GF.worldHeight(s);
    for(const key of changed){
      const [x,y]=key.split(',').map(Number);
      // Trees spill across tile edges. Restore a padded patch, then replay nearby decor in painter order.
      const px=Math.max(0,x*T+48-32),py=Math.max(0,y*T+48-32);
      const width=Math.min(ground.width-px,T+64),patchHeight=Math.min(ground.height-py,T+64);
      ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(px,py,width,patchHeight);
      ctx.drawImage(ground.base,px,py,width,patchHeight,px,py,width,patchHeight);
      ctx.beginPath();ctx.rect(px,py,width,patchHeight);ctx.clip();ctx.translate(48,48);
      drawGroundDecorations(ctx,s,occupied,Math.max(0,x-2),Math.max(0,y-2),Math.min(size-1,x+2),Math.min(height-1,y+2));
      ctx.restore();
    }
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
    if(!d.radius||GF.dist8(consumer.x,consumer.y,producer.x,producer.y)>d.radius)return false;
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
    const size=GF.worldWidth(s),height=GF.worldHeight(s),estate=GF.estate(s),cacheKey=JSON.stringify([s.mapSeed,s.estateSeed,size,height,s.mapGeneration,s.coopLayout]);
    const animationTime=options.animationTime??s.elapsed,player=s.mode==='coop'?GF.playerView(s,options.player||0):s;
    // Enemy occupancy changes every frame; economic recommendations only change with the town.
    const hintKey=JSON.stringify([cacheKey,player.actorId,s.over,s.day,player.buildings.map(b=>[b.type,b.x,b.y,b.level,b.owner])]);
    let hints=hintCaches.get(s);
    if(!hints||hints.key!==hintKey){hints={key:hintKey,tiles:new Map()};hintCaches.set(s,hints);}
    const blockedHints=new Set();
    for(const e of s.enemies)for(let y=Math.floor(e.y)-1;y<=Math.ceil(e.y)+1;y++)for(let x=Math.floor(e.x)-1;x<=Math.ceil(e.x)+1;x++){
      if(Math.hypot(e.x-x,e.y-y)<.65)blockedHints.add(y*size+x);
    }
    const occupied=new Set(s.buildings.map(b=>b.x+','+b.y));
    if(!ground || groundSeed!==cacheKey){ground=makeGround(s,occupied);groundSeed=cacheKey;}
    else updateGround(s,occupied);
    const c=canvas.getContext('2d'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=canvas.width/w;
    const night=s.phase==='night',dusk=s.phase==='dusk';
    const left=Math.max(0,Math.floor(-cam.x/cam.zoom/T)-1),right=Math.min(size-1,Math.ceil((w-cam.x)/cam.zoom/T)+1),top=Math.max(0,Math.floor(-cam.y/cam.zoom/T)-1),bottom=Math.min(height-1,Math.ceil((h-cam.y)/cam.zoom/T)+1);
    const visible=(x,y,rx,ry=rx)=>x+rx>=-cam.x/cam.zoom&&x-rx<=(w-cam.x)/cam.zoom&&y+ry>=-cam.y/cam.zoom&&y-ry<=(h-cam.y)/cam.zoom;
    c.setTransform(dpr,0,0,dpr,0,0);
    c.fillStyle=night?'#31494a':dusk?'#b9b89b':'#d5dcc5';c.fillRect(0,0,w,h);
    c.save();c.translate(cam.x,cam.y);c.scale(cam.zoom,cam.zoom);
    // Soft ink mountain silhouettes outside the map.
    if(cam.y/cam.zoom> -1||(h-cam.y)/cam.zoom>height*T){for(let i=Math.max(0,Math.floor((-cam.x/cam.zoom+20)/99));i<Math.ceil(size*T/99)+5&&i*99-180<(w-cam.x)/cam.zoom;i++){const x=i*99-180;if(cam.y/cam.zoom> -1)poly(c,[[x,-5],[x+60,-110-noise(i,4)*170],[x+160,-5]],night?'#3f5754':'#aebda04d');if((h-cam.y)/cam.zoom>height*T)poly(c,[[x-90,height*T+10],[x-20,height*T+100+noise(i,2)*70],[x+90,height*T+10]],night?'#3f5754':'#aebda03b');}}
    // Crop in world space so a close-up does not submit the entire map texture.
    const gx=Math.max(0,Math.floor(-cam.x/cam.zoom+48)),gy=Math.max(0,Math.floor(-cam.y/cam.zoom+48));
    const gw=Math.min(ground.width,Math.ceil((w-cam.x)/cam.zoom+48)+1)-gx,gh=Math.min(ground.height,Math.ceil((h-cam.y)/cam.zoom+48)+1)-gy;
    if(gw>0&&gh>0)c.drawImage(ground,gx,gy,gw,gh,gx-48,gy-48,gw,gh);
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
      drawBaked(c,'building:'+b.type+':'+GF.visualLevel(b.level),ctx=>building(ctx,b.type,b.level,0,true));
      buildingAnimation(c,b.type,animationTime);
      if(s.mode==='coop'&&b.type==='shrine'){rect(c,-38,-57,76,19,b.owner===options.player?'#3d685deb':'#8a6647eb');c.font='bold 12px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.fillStyle='#fff4d9';c.fillText(b.owner===options.player?'你的庄园':options.online?'队友庄园':'电脑庄园',0,-43);}
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
      if(cam.zoom>=.9){const label=b.type==='gate'?(['北','东','南','西'][b.direction]||'')+'城门':GF.DEFS[b.type].name;c.font='9px "SimHei","Microsoft YaHei",sans-serif';const labelWidth=c.measureText(label).width+14;rect(c,-labelWidth/2,27,labelWidth,14,'#f3f0daf0');c.fillStyle='#52694e';c.fillText(label,0,37);}
      if(GF.DEFS[b.type].end){poly(c,[[-23,10],[-19,14],[-23,18],[-27,14]],'#c5a25d');}
      c.restore();
    }
    // Units use their own positions, even when their barracks is offscreen.
    const units=[...s.enemies.map(unit=>({unit,soldier:false})),...s.soldiers.filter(unit=>unit.hp>0).map(unit=>({unit,soldier:true}))].map(item=>options.unitPosition?{...item,unit:{...item.unit,...options.unitPosition(item.unit,item.soldier)}}:item).filter(({unit})=>visible(unit.x*T+32,unit.y*T+32,unit.boss?48:30)).sort((a,b)=>a.unit.y-b.unit.y);
    for(const {unit:e,soldier} of units){c.save();c.translate(e.x*T+32,e.y*T+32);if(e.boss)c.scale(1.6,1.6);person(c,soldier?'soldier':e.type,animationTime,e.repelled>0);if(e.slowed>0)ellipse(c,0,2,13,18,'#8bb7a029','#76a08f');c.restore();}
    // Keep health bars above all unit bodies during close combat.
    for(const {unit:e,soldier} of units){c.save();c.translate(e.x*T+32,e.y*T+32);if(e.boss)c.scale(1.6,1.6);rect(c,-14,-27,28,4.5,soldier?'#254a31':'#273e3480',soldier?'#c9dfaa':null);rect(c,-13,-26,26*Math.max(0,Math.min(1,e.hp/e.maxHp)),2.5,soldier?'#91c967':'#bb775a');c.restore();}
    if(night||dusk){c.fillStyle=night?'#19395878':'#ac723222';c.fillRect(left*T,top*T,(right-left+1)*T,(bottom-top+1)*T);if(night){const glow=nightGlow();c.globalCompositeOperation='screen';for(const b of s.buildings){if(!visible(b.x*T+32,b.y*T+36,64))continue;if(['shrine','earth','tao','tower','inn'].includes(b.type))c.drawImage(glow,b.x*T+32-64,b.y*T+36-64,128,128);}c.globalCompositeOperation='source-over';}}
    const hintPulse=reducedMotion||options.reducedMotion===true?1:1+.035*Math.sin(animationTime*2.4);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      const tile=y*size+x;
      if(occupied.has(x+','+y)||blockedHints.has(tile)||!visible(x*T+32,y*T+32,29))continue;
      let best=hints.tiles.get(tile);
      if(!hints.tiles.has(tile)){
        let bestIncome=-Infinity;best=null;
        const town={...player,enemies:[]};
        for(const hint of GF.buildHints(town,x,y)){
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
    for(const p of options.projectiles||s.projectiles){const f=1-p.life/p.total,x=(p.x+(p.tx-p.x)*f)*T+32,y=(p.y+(p.ty-p.y)*f)*T+22;if(!visible(x,y,Math.abs((p.tx-p.x)*5)+5,Math.abs((p.ty-p.y)*5)+40))continue;if(p.type==='rock'){ellipse(c,x,y-Math.sin(f*Math.PI)*35,4,4,'#c6c4a2');}else{line(c,[[x,y],[x-(p.tx-p.x)*5,y-(p.ty-p.y)*5]],p.type==='barracks'?'#f5e5a1':'#f6e8bf',2);}}
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
    else {const color=type==='ghost'?'#849b9c':type==='soldier'?'#818967':'#916b60';poly(c,[[-5,-3+bob],[5,-3+bob],[8,9],[-7,9]],color,'#52605b');ellipse(c,0,-8+bob,4.5,5,type==='ghost'?'#b4c8bb':'#c6b592');rect(c,-5,-13+bob,10,3,type==='soldier'?'#526d60':'#5a625b');line(c,[[-3,9],[-4,14+bob]],'#4c5851',2);line(c,[[3,9],[5,14-bob]],'#4c5851',2);line(c,[[7,1],[10,-11]],type==='ghost'?'#a5c3b5':'#bec1a7',2);}
    if(frozen){ellipse(c,0,-1,14,19,null,'#e9d28d');c.fillStyle='#eddda5';c.font='10px "SimHei","Microsoft YaHei",sans-serif';c.textAlign='center';c.fillText('封',0,-18);}
  }
  window.GFArt={T,thumbnail,render};
})();
