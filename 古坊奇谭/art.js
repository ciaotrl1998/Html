(function () {
  'use strict';
  const T = 64, palette = { plain: '#ced5af', water: '#a9c9bd', forest: '#b4c49a', mountain: '#c3c5af' };
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
    if (fancy) { lantern(c, -18, 5); lantern(c, 18, 5); rect(c, -8, -9, 16, 6, '#3c5750', '#b29d69'); c.fillStyle = '#e4d6ad'; c.font = '4px serif'; c.textAlign = 'center'; c.fillText(GF.DEFS[kind].name, 0, -4.5); }
    rect(c, -9, 15, 18, 2, '#d6d6bc'); rect(c, -11, 17, 22, 2, '#b6bca1');
  }
  function building(c, type, level = 1, time = 0) {
    c.save(); c.lineJoin = 'round'; ellipse(c, 2, 18, 26, 8, '#3b503728');
    if(level>=2){poly(c,[[-29,-20],[27,-20],[30,23],[-28,23]],'#bfc4a582','#929f7f',.7);for(let i=0;i<4;i++)line(c,[[-26+i*17,19],[-26+i*17,23]],'#8b987b',.7);}
    if(level===3){for(const x of [-28,28]){line(c,[[x,-17],[x,19]],'#aa985b',1.2);ellipse(c,x,-17,2,2,'#c5ab66');}line(c,[[-26,22],[27,22]],'#c5ab66',2);}
    if (type === 'farm') {
      poly(c, [[-25,-18],[21,-18],[26,16],[-23,20]], '#8faf90', '#83926a', 1.2);
      for (let row = 0; row < 5; row++) { line(c, [[-22,-12+row*6],[23,-14+row*6]], '#bfd0a4', 1.3); for(let col=0;col<6;col++){const x=-19+col*7,y=-9+row*6;line(c,[[x-2,y-5],[x,y],[x+2,y-5]],level===1?'#62885b':'#a29244',1.3);} }
      if(level>1){rect(c,19,-20,3,32,'#928465');line(c,[[14,-18],[25,-18]],'#928465',2);} if(level===3)houseTiny(c, -19,-16);
    } else if (type === 'mulberry') {
      rect(c,-24,-14,48,34,'#acbb87');for(let i=0;i<3;i++)for(let j=0;j<2;j++)tree(c,-16+i*16,-1+j*16,.58+level*.06,true);
    } else if (type === 'quarry') {
      poly(c,[[-25,15],[-20,-14],[14,-20],[26,5],[16,19]],'#b5bba4','#8d9882');stone(c,-8,0,.9);stone(c,11,6,.9);stone(c,1,-10,.7);line(c,[[-18,15],[-12,3]],'#7a7254',2);line(c,[[-18,5],[-7,11]],'#687a70',3);if(level>1)stone(c,10,-19,.7);
    } else if(type==='fence'){
      for(let i=0;i<6;i++){let x=-24+i*9;poly(c,[[x,14],[x,-11-level*2],[x+3,-17-level*2],[x+6,-11-level*2],[x+6,14]],level===3?'#939b87':'#a79466','#776f4d');}rect(c,-26,-7,56,4,'#807351','#625d41');rect(c,-26,7,56,4,'#807351','#625d41');
    }else if(type==='tower'){
      for(const x of [-15,12]){poly(c,[[x-2,18],[x+1,-23],[x+5,-23],[x+5,18]],'#9b865d','#6e7356');}line(c,[[-14,16],[16,-20]],'#a18b5e',3);line(c,[[15,16],[-12,-20]],'#a18b5e',3);rect(c,-21,-25,42,11,'#af9866','#6f7758');for(let i=-18;i<=18;i+=9)rect(c,i,-29,3,14,'#746e4e');roof(c,0,-42,45,13,'#52766d',level);if(level>1)roof(c,0,-50,29,9,'#52766d',level);line(c,[[0,-30],[17,-38]],'#624f39',1.5);ellipse(c,0,-29,3,4,'#48584e');
    }else if(type==='rock'){
      poly(c,[[-24,16],[-20,-5],[20,-5],[24,16]],'#b2b7a2','#7e8d7b');rect(c,-18,-10,36,10,'#c8cbb3','#8d987e');line(c,[[-13,6],[0,-20],[13,6]],'#8a7c56',4);line(c,[[-9,-19],[14,-7]],'#756a4e',4);stone(c,-12,-19,.5);if(level>1)stone(c,18,12,.6);
    }else if(type==='well'){
      ellipse(c,0,10,17,9,'#afb7a3','#7c8c7c');rect(c,-17,2,34,9,'#adb5a0');ellipse(c,0,2,17,8,'#d1d6bb','#7c8c7c');ellipse(c,0,2,12,5,'#638b87');rect(c,-19,-22,3,30,'#937e54');rect(c,16,-22,3,30,'#937e54');roof(c,0,-30,45,13,'#887c58',level);line(c,[[0,-14],[0,0]],'#c4b087');
    }else if(type==='zhong'){
      rect(c,-16,10,32,8,'#a7af9d','#788978');rect(c,-12,6,24,6,'#c3c9b1');poly(c,[[-12,5],[-10,-20],[0,-28],[10,-20],[12,5]],level===3?'#b3a574':'#7a9280','#536c5e');ellipse(c,0,-28,7,8,'#9bad93');rect(c,-8,-36,16,4,'#617a68');line(c,[[8,-11],[20,-29]],'#7a8267',3);line(c,[[-6,-26],[0,-23],[5,-26]],'#4e6659',2);
    }else if(type==='market'){
      rect(c,-24,3,48,12,'#b8a278','#897d5c');for(let i=-20;i<=20;i+=40)rect(c,i,-20,2,28,'#867852');poly(c,[[-23,-22],[23,-22],[29,-6],[-29,-6]],'#b39a68','#8a7c54');for(let i=-20;i<=20;i+=10)poly(c,[[i,-21],[i+5,-21],[i+8,-7],[i-2,-7]],'#e0ce98');for(let i=0;i<5;i++)ellipse(c,-17+i*8,5,3.7,3.6,['#97a165','#b87755','#d0b573'][i%3]);
    }else{
      const color=['wine','kiln','barracks'].includes(type)?'#aa6951':type==='tailor'?'#85788b':type==='tea'?'#728260':'#55786e';
      house(c,level,type,color);
      if(type==='tea'){line(c,[[24,-21],[24,10]],'#837b51',1.5);rect(c,24,-20,12,18,'#e5d7ac','#b9ad82');c.font='8px serif';c.textAlign='center';c.fillStyle='#4b6950';c.fillText('茶',30,-8);}
      if(type==='inn'){line(c,[[24,-24],[24,13]],'#837b51',1.5);rect(c,24,-23,10,21,'#b17455');c.font='7px serif';c.textAlign='center';c.fillStyle='#f1ddb1';c.fillText('宿',29,-10);}
      if(type==='mill'){ellipse(c,22,6,11,11,'#8c8460','#676d51');ellipse(c,22,6,8,8,null,'#c8ba87');for(let i=0;i<8;i++){const a=i*Math.PI/4+time*.4;line(c,[[22,6],[22+10*Math.cos(a),6+10*Math.sin(a)]],'#c2b180',1.5);}ellipse(c,22,6,2,2,'#706949');}
      if(type==='wine'||type==='kiln'){for(let i=0;i<3;i++){ellipse(c,16+i*6,13-i*2,4,5,type==='wine'?'#a57c59':'#b7c6b1','#7b7d61');ellipse(c,16+i*6,8-i*2,2.8,1.5,'#616b57');}}
      if(type==='kiln'){rect(c,16,-32,6,19,'#a18e6c');for(let i=0;i<3;i++)ellipse(c,19+Math.sin(time+i)*3,-38-i*7,3+i,3+i,'#e7e7cf66');}
      if(type==='weaver'||type==='tailor'){line(c,[[-25,-14],[-25,13]],'#8e7c59',1.5);for(let i=0;i<3;i++)rect(c,-25+i*6,-12,5,18,['#c3948d','#b9b590','#7f9e9c'][i]);}
      if(type==='barracks'){line(c,[[23,-37],[23,13]],'#807449',1.7);poly(c,[[24,-37],[39,-32],[24,-26]],'#ad6650');}
      if(type==='bank'||type==='trade'){for(let i=0;i<3;i++){rect(c,15+i*4,13-i*4,8,5,'#ba9b56','#9d8546');line(c,[[18+i*4,14-i*4],[19+i*4,16-i*4]],'#e0c377');}}
      if(type==='home'){tree(c,-25,11,.7,true);}
      if(type==='stage'){rect(c,-17,0,34,14,'#977950');for(let i=-12;i<=12;i+=12){ellipse(c,i,1,2,2,'#cfbb91');poly(c,[[i-3,5],[i+3,5],[i+5,13],[i-5,13]],i?'#8e9b76':'#b17360');}}
      if(type==='guild'||type==='port'){c.save();c.strokeStyle='#c9ac65';c.lineWidth=1.5;ellipse(c,0,19,29,9,null,'#c9ac65');c.restore();}
    }
    c.restore();
  }
  function houseTiny(c,x,y){rect(c,x-5,y,10,7,'#d6d0a6');roof(c,x,y-5,16,7,'#887a52');}
  const thumbs = new Map();
  function thumbnail(type, level=1){const key=type+level;if(thumbs.has(key))return thumbs.get(key);const c=document.createElement('canvas');c.width=180;c.height=150;const ctx=c.getContext('2d');ctx.translate(90,99);ctx.scale(2,2);building(ctx,type,level);const url=c.toDataURL();thumbs.set(key,url);return url;}
  function makeGround(){
    const canvas=document.createElement('canvas');canvas.width=GF.SIZE*T;canvas.height=GF.SIZE*T;const c=canvas.getContext('2d');
    for(let y=0;y<GF.SIZE;y++)for(let x=0;x<GF.SIZE;x++){
      const type=GF.terrain(x,y),px=x*T,py=y*T;
      rect(c,px,py,T,T,palette[type]);rect(c,px,py,T,T,`rgba(248,245,213,${noise(x,y)*.1})`);
      for(let j=0;j<9;j++){let gx=px+noise(x,y,j+2)*60+2,gy=py+noise(y,x,j+31)*60+2;if(type==='water'){line(c,[[gx-3,gy],[gx+4,gy]],'#d1e1c65c',.8);}else{line(c,[[gx-2,gy-2],[gx,gy+1],[gx+2,gy-3]],'#81986238',.8);}}
      if(type==='water'){
        const neighbors=[[0,-1],[1,0],[0,1],[-1,0]];
        for(let i=0;i<4;i++){const nx=x+neighbors[i][0],ny=y+neighbors[i][1];if(GF.terrain(nx,ny)!=='water'){const edges=[[[px,py+4],[px+T,py+4]],[[px+T-4,py],[px+T-4,py+T]],[[px,py+T-4],[px+T,py+T-4]],[[px+4,py],[px+4,py+T]]];line(c,edges[i],'#c6d1a6',8);line(c,edges[i],'#b3cba8',2);}}
        if(noise(x,y)>.3){ellipse(c,px+17,py+38,4,2,'#9fb993');ellipse(c,px+24,py+41,3,1.8,'#9db88e');}
      }
      if(type==='mountain'&&noise(x,y)>.7){stone(c,px+44,py+19,.4);}
    }
    // The old footpath points toward the ancestral hall, without occupying buildable cells.
    for(let y=6;y<=10;y++)rect(c,8*T+25,y*T,14,T,'#dcd8b74a');
    for(let x=6;x<=10;x++)rect(c,x*T,8*T+27,T,12,'#dcd8b74a');
    return canvas;
  }
  const ground=makeGround();
  function render(canvas,s,cam,selected,options={}){
    const c=canvas.getContext('2d'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=canvas.width/w;
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    const night=s.phase==='night',dusk=s.phase==='dusk';c.fillStyle=night?'#31494a':dusk?'#b9b89b':'#d5dcc5';c.fillRect(0,0,w,h);
    c.save();c.translate(cam.x,cam.y);c.scale(cam.zoom,cam.zoom);
    // Soft ink mountain silhouettes outside the map.
    for(let i=0;i<16;i++){const x=i*99-180;poly(c,[[x,-5],[x+60,-110-noise(i,4)*170],[x+160,-5]],night?'#3f5754':'#aebda04d');poly(c,[[x-90,GF.SIZE*T+10],[x-20,GF.SIZE*T+100+noise(i,2)*70],[x+90,GF.SIZE*T+10]],night?'#3f5754':'#aebda03b');}
    c.shadowColor='#40583e18';c.shadowBlur=35;c.shadowOffsetY=8;c.drawImage(ground,0,0);c.shadowColor='transparent';
    const left=Math.max(0,Math.floor(-cam.x/cam.zoom/T)-1),right=Math.min(GF.SIZE-1,Math.ceil((w-cam.x)/cam.zoom/T)+1),top=Math.max(0,Math.floor(-cam.y/cam.zoom/T)-1),bottom=Math.min(GF.SIZE-1,Math.ceil((h-cam.y)/cam.zoom/T)+1);
    const occupied=new Set(s.buildings.map(b=>b.x+','+b.y));
    if(options.grid){c.strokeStyle='#5d78502b';c.lineWidth=.7;c.setLineDash([2,4]);for(let i=0;i<=GF.SIZE;i++){line(c,[[i*T,0],[i*T,GF.SIZE*T]],'#5d785026',.7);line(c,[[0,i*T],[GF.SIZE*T,i*T]],'#5d785026',.7);}c.setLineDash([]);}
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      if(occupied.has(x+','+y))continue;const type=GF.terrain(x,y);c.save();c.translate(x*T+32,y*T+32);
      if(type==='forest'){tree(c,-14,7,.95);tree(c,10,-8,1.1);bamboo(c,15,19,.66);}
      if(type==='mountain'){stone(c,-9,9,1.1);stone(c,15,-4,1.2);stone(c,-13,-13,.6);}
      if(type==='plain'&&(x===0||y===0||x===16||y===16)){if(noise(x,y)>.35)tree(c,0,8,.8+noise(x,y)*.5,true);}
      if(type==='water'){const off=Math.sin(s.elapsed*.8+x+y)*2;line(c,[[-15+off,-10],[1+off,-10]],'#e1ebd880',.9);line(c,[[8-off,10],[19-off,10]],'#e1ebd860',.9);if(noise(x,y)>.65){for(let i=0;i<4;i++)line(c,[[-23+i*3,22],[-25+i*3,9+noise(x,y,i)*7]],'#739575',1.3);}}
      c.restore();
    }
    // Supply chains are orthogonal and remain visible after construction.
    c.setLineDash([4,5]);for(const b of s.buildings){const d=GF.DEFS[b.type];if(!d.prev)continue;for(const n of GF.adjacent(s,b.x,b.y)){if(n.type===d.prev)line(c,[[b.x*T+32,b.y*T+42],[n.x*T+32,n.y*T+42]],d.color,2.2);}}c.setLineDash([]);
    if(selected){const px=selected.x*T,py=selected.y*T;rect(c,px+2,py+2,T-4,T-4,'#fbebaf30');c.strokeStyle='#b59451';c.lineWidth=1.5;c.strokeRect(px+2,py+2,T-4,T-4);const b=GF.at(s,selected.x,selected.y);if(b&&GF.DEFS[b.type].range){c.setLineDash([5,7]);ellipse(c,px+32,py+32,(GF.DEFS[b.type].range+(b.level-1)*.35)*T,(GF.DEFS[b.type].range+(b.level-1)*.35)*T,'#d7c7810a','#b4a46b70');c.setLineDash([]);}if(!b){c.font='23px serif';c.textAlign='center';c.fillStyle='#9c8448';c.fillText('+',px+32,py+40);}}
    for(const b of [...s.buildings].sort((a,b)=>a.y-b.y)){
      if(b.x<left||b.x>right||b.y<top||b.y>bottom)continue;
      c.save();c.translate(b.x*T+32,b.y*T+32);building(c,b.type,b.level,s.elapsed);
      if(b.type==='shrine'&&s.buildings.length===1){c.strokeStyle='#ead59a80';c.lineWidth=1;ellipse(c,0,19,32+Math.sin(s.elapsed)*2,12,null,'#b99e6770');}
      if(b.hp<GF.maxHP(b)){rect(c,-21,-51,42,3,'#61775c66');rect(c,-21,-51,42*Math.max(0,b.hp/GF.maxHP(b)),3,b.hp/GF.maxHP(b)>.35?'#819d64':'#b06a4e');}
      const label=GF.DEFS[b.type].name;c.font='9px "Microsoft YaHei",sans-serif';c.textAlign='center';const labelWidth=c.measureText(label).width+18;rect(c,-labelWidth/2,22,labelWidth,14,'#f3f0daf0');c.fillStyle='#52694e';c.fillText(label, -3,32);c.fillStyle='#a78e55';c.font='7px Georgia';c.fillText(b.level,labelWidth/2-6,31);
      if(GF.DEFS[b.type].end){poly(c,[[23,10],[27,14],[23,18],[19,14]],'#c5a25d');}
      c.restore();
      if(b.type==='barracks'&&b.soldier&&night){c.save();c.translate(b.soldier.x*T+32,b.soldier.y*T+32);person(c,'soldier',s.elapsed);c.restore();}
    }
    for(const e of s.enemies){c.save();c.translate(e.x*T+32,e.y*T+32);if(e.boss)c.scale(1.6,1.6);person(c,e.type,s.elapsed,e.repelled>0);rect(c,-13,-26,26,2.5,'#273e3480');rect(c,-13,-26,26*Math.max(0,e.hp/e.maxHp),2.5,'#bb775a');c.restore();}
    if(night||dusk){c.fillStyle=night?'#19395878':'#ac723222';c.fillRect(0,0,T*GF.SIZE,T*GF.SIZE);if(night){c.globalCompositeOperation='screen';for(const b of s.buildings){if(['shrine','earth','tao','tower','inn'].includes(b.type)){const x=b.x*T+32,y=b.y*T+36,g=c.createRadialGradient(x,y,2,x,y,64);g.addColorStop(0,'#d4a34536');g.addColorStop(1,'#d4a34500');c.fillStyle=g;c.fillRect(x-64,y-64,128,128);}}c.globalCompositeOperation='source-over';}}
    for(const p of s.projectiles){const f=1-p.life/p.total,x=(p.x+(p.tx-p.x)*f)*T+32,y=(p.y+(p.ty-p.y)*f)*T+22;if(p.type==='rock'){ellipse(c,x,y-Math.sin(f*Math.PI)*35,4,4,'#c6c4a2');}else{line(c,[[x,y],[x-(p.tx-p.x)*5,y-(p.ty-p.y)*5]],p.type==='barracks'?'#f5e5a1':'#f6e8bf',2);}}
    for(const e of s.effects){const x=e.x*T+32,y=e.y*T+32,f=1-e.life/e.total;c.save();c.globalAlpha=1-f;
      if(e.type==='thunder'){line(c,[[x+15,y-120],[x-10,y-70],[x+7,y-70],[x-5,y]],'#faf3b0',3);ellipse(c,x,y,22,12,'#eee4a344');}
      else if(e.type==='income'||e.type==='coin'){
        c.globalAlpha=Math.min(1,(1-f)*3);c.translate(x,y-(e.type==='income'?53:20)-f*30);c.scale(Math.max(1,1/cam.zoom),Math.max(1,1/cam.zoom));
        c.font='bold 13px Georgia,serif';c.textAlign='left';const label='+'+e.amount,tw=c.measureText(label).width,start=-(tw+18)/2;
        c.lineWidth=3;c.strokeStyle='#3e573ae0';c.strokeText(label,start,0);c.fillStyle='#ffecb1';c.fillText(label,start,0);
        const cx=start+tw+10;ellipse(c,cx,-5,6,6,'#ddb767','#6f743d');ellipse(c,cx,-5,4.2,4.2,null,'#fae3a2');rect(c,cx-1.7,-6.7,3.4,3.4,'#61724a','#b18e4c');
      }
      else if(e.type==='hit'){ellipse(c,x,y,20,20,'#ae674066');}
      else{ellipse(c,x,y,20+f*450,20+f*450,null,e.type==='repair'?'#d0e8a4':'#eee0a6');}
      c.restore();}
    if(s.phase!=='day'){
      const d=s.direction,positions=[[8.5*T,25],[GF.SIZE*T-25,8.5*T],[8.5*T,GF.SIZE*T-25],[25,8.5*T]],p=positions[d];c.font='bold 15px serif';c.textAlign='center';c.fillStyle=night?'#efd5a0':'#a96045';c.fillText('⚠ 来袭',p[0],p[1]);
    }
    c.restore();
    // Two passing swallows, rendered as fine ink strokes.
    if(!night){for(let i=0;i<2;i++){const x=(s.elapsed*8+i*37+w*.67)%(w+100)-50,y=h*.31+Math.sin(s.elapsed*.12+i)*15+i*12;line(c,[[x-6,y-2],[x,y+Math.sin(s.elapsed*4+i)*2],[x+6,y-2]],'#5d73596a',1);}}
  }
  function person(c,type,time,frozen){
    const bob=frozen?0:Math.sin(time*8)*1.5;ellipse(c,1,10,9,3,'#273d3b38');
    if(type==='fox'){poly(c,[[-6,4],[-17,-5],[-13,7],[-5,10]],'#c5a381');ellipse(c,1,3+bob,8,5,'#c69a77');poly(c,[[4,0+bob],[5,-9+bob],[9,-4+bob],[13,-9+bob],[13,1+bob]],'#d8b891','#996d56');rect(c,7,-2+bob,1.5,1.5,'#565246');}
    else {const color=type==='ghost'?'#849b9c':type==='soldier'?'#818967':'#916b60';poly(c,[[-5,-3+bob],[5,-3+bob],[8,9],[-7,9]],color,'#52605b');ellipse(c,0,-8+bob,4.5,5,type==='ghost'?'#b4c8bb':'#c6b592');rect(c,-5,-13+bob,10,3,type==='soldier'?'#526d60':'#5a625b');line(c,[[-3,9],[-4,14+bob]],'#4c5851',2);line(c,[[3,9],[5,14-bob]],'#4c5851',2);line(c,[[7,1],[10,-11]],type==='ghost'?'#a5c3b5':'#bec1a7',2);}
    if(frozen){ellipse(c,0,-1,14,19,null,'#e9d28d');c.fillStyle='#eddda5';c.font='10px serif';c.textAlign='center';c.fillText('封',0,-18);}
  }
  window.GFArt={T,thumbnail,render};
})();
