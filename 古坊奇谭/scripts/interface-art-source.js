/* Editable production source for the PNG interface pack. Run export-interface-assets.cjs.
   No runtime drawing dependency: the game only reads the exported PNG files. */
(function () {
  const assets = {};
  const ink='#3b5148', jade='#55786e', light='#e5d9b5', gold='#ba9b56', red='#aa6951';
  function asset(path,w,h,paint,slice=0){
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;
    const c=cv.getContext('2d');c.imageSmoothingEnabled=false;paint(c,w,h);
    const p=c.getImageData(0,0,w,h);for(let i=3;i<p.data.length;i+=4)p.data[i]=p.data[i]<128?0:255;c.putImageData(p,0,0);
    assets[path]={width:w,height:h,slice,data:cv.toDataURL('image/png')};
  }
  const box=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  function poly(c,pts,color){c.fillStyle=color;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
  function stroke(c,pts,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.lineJoin='miter';c.lineCap='square';c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
  function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
  function frame(c,w,h,fill,edge=ink){box(c,1,1,w-2,h-2,edge);box(c,2,2,w-4,h-4,gold);box(c,3,3,w-6,h-6,fill);stroke(c,[[4,h-5],[4,4],[w-5,4]],'#f2e6c5');stroke(c,[[5,h-5],[w-5,h-5],[w-5,5]],'#8b8968');for(const x of [2,w-6])for(const y of [2,h-6])box(c,x,y,4,4,edge);}
  for(const [name,fill,edge] of [
    ['paper',light,ink],['card','#e6dfc4',ink],['inset','#c8d0ae','#73846b'],['dark','#36574c','#243e38'],
    ['primary',jade,ink],['secondary','#d6d5b6','#74836c'],['disabled','#b0b5a0','#7d8978'],['danger',red,'#734e3d'],
    ['warning','#b38754','#715640'],['ally','#597f96',ink],['enemy',red,ink],['night','#293f42','#182e32'],['seal',red,'#714635']
  ])asset(`assets/ui/panels/${name}.png`,32,32,(c,w,h)=>frame(c,w,h,fill,edge),6);
  asset('assets/ui/panels/ornament-border.png',32,32,(c,w,h)=>{frame(c,w,h,'#00000000');c.clearRect(6,6,20,20);},6);
  asset('assets/ui/backgrounds/paper.png',64,64,c=>{box(c,0,0,64,64,'#e9dfbe');for(let y=0;y<64;y+=4)for(let x=0;x<64;x+=4){if((x*17+y*31)%13<4)box(c,x,y,1,1,'#ded2ae');if((x*7+y*19)%11<3)box(c,x+2,y+1,1,1,'#eee5ca');}});
  asset('assets/ui/backgrounds/dimmer.png',2,2,c=>box(c,0,0,2,2,'#20332c'));
  function icon(name,paint){asset(`assets/ui/icons/${name}.png`,32,32,c=>paint(c));}
  icon('coin',c=>{ellipse(c,16,17,12,12,ink);ellipse(c,16,15,12,12,gold);ellipse(c,16,14,9,9,'#e2c57e');ellipse(c,16,15,7,7,'#b59451');box(c,12,11,8,8,'#8c713e');c.clearRect(14,13,4,4);stroke(c,[[8,12],[10,7],[16,5]],'#f5df9e',2);});
  icon('materials',c=>{poly(c,[[7,28],[4,25],[19,7],[23,10]],ink);poly(c,[[8,26],[6,25],[20,9],[21,10]],'#b99764');poly(c,[[8,5],[12,2],[28,15],[24,20]],ink);poly(c,[[10,5],[12,4],[26,15],[24,18]],'#849a8b');stroke(c,[[12,5],[24,15]],'#c3cfb2',2);});
  icon('close',c=>{stroke(c,[[8,8],[24,24]],ink,5);stroke(c,[[24,8],[8,24]],ink,5);stroke(c,[[9,8],[24,23]],light,2);stroke(c,[[23,8],[8,23]],light,2);});
  icon('arrow-right',c=>{poly(c,[[5,13],[19,13],[19,7],[28,16],[19,25],[19,19],[5,19]],ink);poly(c,[[7,14],[20,14],[20,10],[26,16],[20,22],[20,18],[7,18]],gold);});
  icon('upgrade',c=>{poly(c,[[3,15],[16,2],[29,15],[23,15],[23,29],[9,29],[9,15]],ink);poly(c,[[7,13],[16,5],[25,13],[21,13],[21,27],[11,27],[11,13]],'#a5c76e');stroke(c,[[12,13],[16,9],[20,13]],'#e3e6ac',2);});
  icon('invasion',c=>{poly(c,[[16,2],[30,19],[23,19],[23,30],[9,30],[9,19],[2,19]],'#673f38');poly(c,[[16,5],[26,17],[21,17],[21,28],[11,28],[11,17],[6,17]],red);stroke(c,[[16,10],[16,21]],'#f4d18c',2);box(c,15,24,2,2,light);});
  icon('grip',c=>{for(let y=12;y<=20;y+=4)box(c,5,y,22,2,'#8b987b');});
  icon('diamond',c=>{poly(c,[[16,5],[27,16],[16,27],[5,16]],ink);poly(c,[[16,8],[24,16],[16,24],[8,16]],gold);box(c,14,14,4,4,light);});
  icon('repel',c=>{poly(c,[[8,3],[25,5],[23,29],[6,27]],ink);poly(c,[[10,5],[23,7],[21,27],[8,25]],'#dbc384');stroke(c,[[15,8],[13,12],[18,13],[12,18],[18,19],[14,24]],red,2);box(c,13,6,6,2,red);});
  icon('repair',c=>{ellipse(c,16,17,13,13,ink);ellipse(c,16,16,11,11,jade);poly(c,[[15,5],[23,9],[19,17],[10,21],[9,13]],'#a5bd7b');stroke(c,[[10,23],[19,10]],light,2);box(c,21,20,2,6,gold);box(c,19,22,6,2,gold);});
  icon('thunder',c=>{poly(c,[[17,2],[29,3],[20,13],[26,13],[8,31],[12,20],[5,20]],ink);poly(c,[[18,4],[25,4],[16,15],[22,15],[11,27],[15,18],[9,18]],'#e8cb7d');});
  icon('single',c=>{box(c,5,10,22,18,ink);box(c,7,12,18,14,light);poly(c,[[2,12],[16,2],[30,12]],ink);poly(c,[[6,10],[16,5],[26,10]],jade);box(c,13,17,6,11,'#876b4d');});
  icon('coop',c=>{for(const [x,color] of [[10,red],[23,jade]]){ellipse(c,x,9,5,5,ink);ellipse(c,x,8,3,3,'#d3b98a');poly(c,[[x-4,14],[x+4,14],[x+7,28],[x-7,28]],ink);box(c,x-3,15,6,11,color);}});
  icon('load',c=>{box(c,5,5,23,23,ink);box(c,7,7,19,19,'#977950');box(c,10,5,13,10,light);box(c,10,19,13,7,'#c6ba94');box(c,18,7,3,6,jade);});
  for(const [name,on] of [['sound-off',false],['sound-on',true]])icon(name,c=>{poly(c,[[3,12],[9,12],[16,6],[16,26],[9,20],[3,20]],ink);poly(c,[[5,14],[10,14],[14,10],[14,22],[10,18],[5,18]],gold);if(on){stroke(c,[[21,10],[25,16],[21,22]],jade,2);stroke(c,[[26,7],[30,16],[26,25]],jade,2);}else{stroke(c,[[21,11],[28,21]],red,2);stroke(c,[[28,11],[21,21]],red,2);}});
  for(const [name,on] of [['switch-off',false],['switch-on',true]])asset(`assets/ui/controls/${name}.png`,40,22,c=>{box(c,1,2,38,18,ink);box(c,3,4,34,14,on?jade:'#929e87');frameThumb(c,on?22:4);});
  function frameThumb(c,x){box(c,x,4,14,14,ink);box(c,x+1,5,12,12,light);box(c,x+3,7,8,2,'#f3e7c4');}
  const overlay=(name,paint,w=64,h=64)=>asset(`assets/overlays/${name}.png`,w,h,paint);
  overlay('territory-shade',c=>box(c,0,0,2,2,'#34473e'),2,2);
  overlay('territory-edge',c=>box(c,2,1,60,2,'#f3df9b'),64,4);
  asset('assets/scenery/world-background.png',2,2,c=>box(c,0,0,2,2,'#d5dcc5'));
  overlay('selection',c=>{box(c,2,2,60,60,'#dcca81');c.clearRect(4,4,56,56);for(const x of [2,55])for(const y of [2,55])box(c,x,y,7,7,gold);});
  overlay('placement',c=>{box(c,30,21,4,22,gold);box(c,21,30,22,4,gold);});
  for(const resource of ['coins','materials'])for(let tier=1;tier<=3;tier++)overlay(`hints/${resource}-tier-${tier}`,c=>{for(let layer=0;layer<(tier>=2?2:1);layer++){const a=6+layer*6,b=58-layer*6,n=layer?8:12;for(const x of [a,b])for(const y of [a,b])stroke(c,[[x+(x===a?n:-n),y],[x,y],[x,y+(y===a?n:-n)]],resource==='coins'?'#e3c575':'#a68fae',3);}if(tier===3){box(c,30,26,4,12,gold);box(c,26,30,12,4,gold);}});
  overlay('range',c=>{ellipse(c,64,64,63,63,'#769258');ellipse(c,64,64,60,60,'#bac69a');c.clearRect(0,0,0,0);},128,128);
  // Ring sprites retain a transparent center, allowing terrain and units to show through.
  for(const [name,color] of [['pulse','#8eb8a0'],['repair','#d0e8a4'],['repel','#dbc384'],['freeze','#e9d28d'],['slow','#76a08f'],['aura','#b99e67']])overlay(name,c=>{ellipse(c,32,32,31,31,color);c.globalCompositeOperation='destination-out';ellipse(c,32,32,29,29,'#ffffff');});
  overlay('level-badge',c=>frame(c,24,24,jade),24,24);
  overlay('gate-broken',c=>{poly(c,[[16,11],[28,20],[23,43],[43,43],[35,23],[49,11]],ink);stroke(c,[[18,40],[30,29],[43,43]],'#b19872',3);});
  for(const [name,color] of [['health-track',ink],['health-player','#91c967'],['health-enemy','#bb775a'],['health-building','#819d64'],['health-critical',red]])asset(`assets/ui/bars/${name}.png`,16,6,(c,w,h)=>{box(c,0,0,w,h,ink);box(c,1,1,w-2,h-2,color);box(c,1,1,w-2,1,name==='health-track'?'#61775c':'#bfd19a');},2);
  for(const [name,color] of [['commerce','#9c8052'],['farm','#6e875b'],['silk','#96758c'],['industry','#648388'],['default','#9b8660']])overlay(`links/${name}`,c=>{box(c,0,1,4,2,color);},9,4);
  overlay('grid',c=>{for(let i=0;i<64;i+=8){box(c,i,0,4,1,'#5d7850');box(c,0,i,1,4,'#5d7850');}});
  for(const [name,paint,w,h] of [
    ['rock',c=>{ellipse(c,8,8,7,6,ink);poly(c,[[2,8],[5,2],[11,3],[14,10],[7,14]],'#b9bda2');},16,16],
    ['arrow',c=>{box(c,1,3,27,2,'#b99764');poly(c,[[24,0],[32,4],[24,8]],'#e5d9b5');stroke(c,[[3,1],[7,4],[3,7]],light);},32,8],
    ['bolt',c=>{box(c,0,2,29,2,'#f6e8bf');box(c,27,1,5,4,gold);},32,6],
    ['thunder',c=>poly(c,[[30,0],[7,36],[23,36],[13,64],[38,28],[23,28],[42,0]],'#f1d88d'),48,64],
    ['soldier-hit',c=>{stroke(c,[[3,27],[28,3]],'#f5e5a1',3);stroke(c,[[7,5],[24,22]],'#c9dfaa',2);},32,32],
    ['hit',c=>{poly(c,[[16,0],[20,10],[30,5],[24,16],[32,23],[21,22],[16,32],[11,23],[1,26],[7,17],[1,8],[12,11]],red);},32,32],
    ['swallow',c=>stroke(c,[[1,2],[8,5],[15,2]],ink,1),16,8],
    ['shadow',c=>ellipse(c,16,8,15,6,'#53664d'),32,16],
    ['water-ripple',c=>{box(c,3,2,12,1,'#e1ebd8');box(c,19,9,10,1,'#e1ebd8');},32,12]
  ])asset(`assets/effects/${name}.png`,w,h,paint);
  for(let i=0;i<4;i++)asset(`assets/scenery/mountain-${i+1}.png`,128,128,c=>{poly(c,[[0,128],[47+i*8,16+i*13],[128,128]],'#acb99b');poly(c,[[47+i*8,16+i*13],[67+i*4,81],[128,128]],'#94a68b');});
  window.GFInterfaceExport=assets;
})();
