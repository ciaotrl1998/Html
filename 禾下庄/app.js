'use strict';
const {Game,TYPES,GOODS,stats,sum}=FarmGame;
const $=id=>document.getElementById(id);
const STORAGE='hexiazhuang-demo-v1';
let game,tab='build',selected=null,placing=null,moving=null,preview=null,toastUntil=0,shownFailure=false,dragType=null,buildPage=0;
try{const saved=JSON.parse(localStorage.getItem(STORAGE));game=saved&&saved.version===1?new Game(saved.state):new Game();}catch{game=new Game();}
const canvas=$('map'),ctx=canvas.getContext('2d');
let width=0,height=0,baseTile=1,uiTime=0,saveTime=0,last=0,mapZoom=1,mapPanX=0,mapPanY=0,pinch=null,mapPointer=null,floaters=[],lastMaterials=game.materials,lastSales=game.sales;
function syncViewport(){const height=window.visualViewport?.height||window.innerHeight;document.documentElement.style.setProperty('--viewport-height',`${height}px`);}
syncViewport();window.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('resize',syncViewport);
const iconCache=new Map();
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');toastUntil=performance.now()+2600;}
function showDragGhost(type,x,y){const ghost=$('drag-ghost');ghost.hidden=true;document.querySelector('.management').classList.add('is-dragging');}
function hideDragGhost(){ $('drag-ghost').hidden=true; }
function addFloater(b,text,type){floaters.push({bId:b.id,text,type,born:performance.now()});}
function collectFeedback(){
  const materialDelta=game.materials-lastMaterials,salesDelta=game.sales-lastSales;const workshop=game.buildings.find(b=>b.type==='workshop'),market=game.buildings.find(b=>b.type==='market');
  if(materialDelta>0&&workshop)addFloater(workshop,'+'+materialDelta,'material');
  if(salesDelta>0&&market)addFloater(market,'+'+salesDelta,'gold');
  for(const event of game.feedback.splice(0)){const b=game.building(event.building);if(b)addFloater(b,'+'+Number(event.amount.toFixed(2)),event.type);}
  lastMaterials=game.materials;lastSales=game.sales;
}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify({version:1,state:game.serialize()}));}catch{}}
function amountCost(g,m){return `${g?g+'金币':''}${g&&m?' · ':''}${m?m+'材料':''}`||'免费';}
function closeDialog(){$('dialog').close();}
function showDialog(html){$('dialog-body').innerHTML=html;$('dialog').showModal();}
function icon(type){if(!iconCache.has(type)){const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');drawBuilding(x,{type,x:0,y:0,level:1},2,0,0,0,true);iconCache.set(type,c.toDataURL());}return `<img class="building-icon" src="${iconCache.get(type)}" alt="">`;}
function fillIcons(){}
function renderPanel(){
  const panel=$('panel'),scrollTop=panel.scrollTop,b=game.building(selected);
  if(b){
    const d=TYPES[b.type],s=stats(b),workers=game.workers.filter(w=>w.assigned===b.id).length,free=game.workers.filter(w=>!w.assigned&&!w.task).length,mult=2**(b.level-1),cost=d.upgrade?.map(n=>n*mult);
    let inv=[];for(const [k,n]of Object.entries(b.input))if(n)inv.push(`<span>入 ${GOODS[k].name} ${n}</span>`);for(const [k,n]of Object.entries(b.output))if(n)inv.push(`<span>${GOODS[k].name} ${n}</span>`);
    panel.innerHTML=`<div class="detail-sheet"><div class="panel-title"><div class="detail-name">${icon(b.type)}<div><h2>${d.name}<span class="level">${b.type==='market'||b.type==='pile'?'场外':'Lv.'+b.level}</span></h2><div class="subtitle">${b.type==='home'?'庄田主宅':b.type==='market'?'物料售出即换金币':s.cycle+'秒 / 批 · 输出 '+sum(b.output)+'/'+s.output}</div></div></div><button data-action="deselect" title="返回建筑栏" aria-label="关闭建筑信息">×</button></div><div class="meter detail-meter"><span id="detail-progress" style="width:${b.batch?b.progress/b.batch.cycle*100:0}%"></span></div><div class="inventory" id="detail-inventory">${inv.join('')||'<span class="empty">暂无库存</span>'}</div>${!['home','pile'].includes(b.type)?`<div class="assignment"><div>指派村民 <small id="free-label">空闲 ${free} 人</small></div><div class="stepper"><button data-action="unassign" ${workers===0?'disabled':''} aria-label="移除一名村民">−</button><strong id="assigned-count">${workers}</strong><button data-action="assign" ${free===0?'disabled':''} aria-label="指派一名村民">+</button></div></div>`:''}<div class="detail-actions">${cost?`<button class="primary" data-action="upgrade" ${b.level>=5||game.gold<cost[0]||game.materials<cost[1]?'disabled':''}>${b.level>=5?'已达最高级':'升级至 '+(b.level+1)+' 级'}${b.level<5?`<small>${amountCost(...cost)}</small>`:''}</button>`:''}${!['market','pile'].includes(b.type)?'<button data-action="move" class="secondary action-icon" title="移动建筑" aria-label="移动建筑">↔</button>':''}${!['home','market','pile'].includes(b.type)?'<button data-action="demolish" class="secondary destructive action-icon" title="拆除建筑">×</button>':''}</div></div>`;
    fillIcons();panel.scrollTop=scrollTop;return;
  }
  if(tab==='workers'){
    const total=game.workers.length,free=game.workers.filter(w=>!w.assigned&&!w.task).length,hire=45+Math.max(0,total-2)*15;
    panel.innerHTML=`<div class="section-heading"><div><span class="eyebrow">庄丁名册</span><h2>村民 <em>${total}</em> <small>/ 24</small></h2><p>已指派 ${game.workers.filter(w=>w.assigned).length} · 空闲 ${free}</p></div><button class="primary compact-action" data-action="hire" ${game.gold<hire||total>=24?'disabled':''}>雇用 · ${hire}<i class="coin"></i></button></div><button class="secondary auto-distribute" data-action="auto-distribute" ${!free||!game.buildings.some(b=>!['home','pile','market'].includes(b.type)&&!game.active(b))?'disabled':''}>自动分派</button><div class="worker-upgrades">${[['carryLevel','搬运载重',[5,7,9,12,15]],['speedLevel','行走速度',[100,115,130,145,160]]].map(([key,label,values])=>{const level=game[key],cost=[60*2**(level-1),6*2**(level-1)],unit=key==='carryLevel'?'件':'%';return `<div class="worker-upgrade"><div><strong>${label}<span class="level">Lv.${level}</span></strong><small>${values[level-1]}${unit}${level<5?' → '+values[level]+unit:''}</small></div><button class="secondary" data-worker-upgrade="${key}" ${level>=5||game.gold<cost[0]||game.materials<cost[1]?'disabled':''}>${level>=5?'已满级':amountCost(...cost)}</button></div>`;}).join('')}</div>`;
    panel.scrollTop=scrollTop;return;
  }
  if(tab==='land'){panel.innerHTML=`<div class="section-heading"><div><span class="eyebrow">田契卷宗</span><h2>青溪庄田</h2><p>一纸地契，终身经营</p></div><span class="seal-tag">${game.won?'已归名下':'租赁中'}</span></div><div class="land-deed"><span class="deed-label">买地银两</span><div class="land-price">${game.won?'已买下':game.landPrice.toLocaleString()}<small>${game.won?'免租经营':'金币'}</small></div><div class="deed-line"></div><p>买下地皮后，地主不再收租，田庄归你世代经营。</p></div><button class="primary buy-land" data-action="buy" ${game.won||game.gold<game.landPrice||game.grace!==null?'disabled':''}>${game.won?'地契已签':'签下地契 · '+game.landPrice.toLocaleString()+'金币'}</button>`;panel.scrollTop=scrollTop;return;}
  const list=Object.entries(TYPES).filter(([k])=>k!=='home'&&k!=='market'&&k!=='pile');
  const columns=Math.max(3,Math.min(5,Math.floor((panel.clientWidth-28)/92))),rows=2,pageSize=columns*rows,pages=Math.max(1,Math.ceil(list.length/pageSize));buildPage=Math.min(buildPage,pages-1);const pageList=list.slice(buildPage*pageSize,(buildPage+1)*pageSize);
  panel.innerHTML=`<div class="build-grid" style="--build-columns:${columns}">${pageList.map(([k,d])=>{const unlocked=game.unlocked.includes(k),affordable=game.gold>=d.cost[0]&&game.materials>=d.cost[1],state=!unlocked?'locked':affordable?'ready':'short';return `<button class="building-option ${state}" data-build="${k}" data-drag-type="${k}" draggable="false">${icon(k)}<strong>${d.name}</strong><small>${unlocked?amountCost(...d.cost):'需 '+d.requires.map(r=>TYPES[r].name).join(' / ')}</small></button>`;}).join('')}</div><div class="build-pagination"><button data-page="prev" ${buildPage===0?'disabled':''} aria-label="上一页">‹</button><span>${buildPage+1} / ${pages}</span><button data-page="next" ${buildPage>=pages-1?'disabled':''} aria-label="下一页">›</button></div>`;
  fillIcons();panel.scrollTop=scrollTop;
}
function refresh(){
  collectFeedback();
  $('gold').textContent=Math.floor(game.gold).toLocaleString();$('materials').textContent=game.materials;
  const secs=Math.max(0,Math.ceil(game.grace??game.rentTime));$('timer').textContent=game.won?'已买地':`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
  $('rent-amount').textContent=game.won?'免租':game.rent;
  $('rent-label').textContent=game.grace!==null?'宽限剩余':'距收租';document.querySelector('.rent-strip').classList.toggle('danger',!game.won&&(game.rentTime<30||game.grace!==null));
  $('rent-progress').style.width=(game.won?100:Math.max(0,game.rentTime/60*100))+'%';
  const free=game.workers.filter(w=>!w.assigned&&!w.task).length;const people=`村民 ${game.workers.length} · 空闲 ${free}`;$('population').textContent=people;
  const market=game.buildings.find(b=>b.type==='market'),n=game.workers.filter(w=>w.assigned===market.id).length;$('market-workers').textContent=n?n+'人售货':'无人专职';
  renderPanel();
  if(game.failed&&!shownFailure){shownFailure=true;showDialog('<h2>田庄暂归地主</h2><p>未能在宽限期内付清租金。这一局的布局已经保存。</p><p>累计售货 '+Math.floor(game.sales)+'金币 · 付清 '+(game.round-1)+'轮租金</p><div class="dialog-actions"><button class="secondary" data-dialog="close">查看田庄</button><button class="primary" data-dialog="restart">重新经营</button></div>');}
}
document.querySelector('.tabs').addEventListener('click',e=>{const btn=e.target.closest('[data-tab]');if(!btn)return;tab=btn.dataset.tab;selected=null;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));renderPanel();});
$('panel').addEventListener('click',e=>{
  const el=e.target.closest('button');if(!el||el.disabled)return;
  if(el.dataset.build){return;}
  if(el.dataset.page){buildPage+=el.dataset.page==='next'?1:-1;renderPanel();return;}
  const b=game.building(selected),action=el.dataset.action;
  if(action==='deselect'){selected=null;renderPanel();return;}
  if(game.failed)return toast('本局已结束');
  if(action==='auto-distribute'){const count=game.autoAssign(true);toast('已分派 '+count+' 名村民');refresh();save();return;}
  if(el.dataset.workerUpgrade){if(game.upgradeWorkers(el.dataset.workerUpgrade))toast('全体村民升级完成');refresh();save();return;}
  if(action==='assign'||action==='unassign'){game.assign(b,action==='assign'?1:-1);refresh();}
  if(action==='upgrade'){if(game.upgrade(b))toast(TYPES[b.type].name+'升级完成');refresh();}
  if(action==='move'){moving=b.id;placing=b.type;preview=null;$('placement').hidden=false;$('placement-text').textContent='移动'+TYPES[b.type].name+' · 点击空地';}
  if(action==='demolish')showDialog(`<h2>拆除${TYPES[b.type].name}？</h2><p>返还一半建造费用，库存留在原地，由村民清运售卖。升级费用不返还。</p><div class="dialog-actions"><button class="secondary" data-dialog="close">保留</button><button class="primary" data-dialog="demolish" data-id="${b.id}">拆除</button></div>`);
  if(action==='hire'){game.hire();refresh();}
  if(action==='buy')showDialog(`<h2>买下青溪庄田</h2><p>支付${game.landPrice}金币，田庄将归你所有。此后可以继续经营，无需再交租。</p><div class="dialog-actions"><button class="secondary" data-dialog="close">再等等</button><button class="primary" data-dialog="buy">购买地契</button></div>`);
});
 $('dialog').addEventListener('click',e=>{const el=e.target.closest('[data-dialog]');if(!el)return;const a=el.dataset.dialog;if(a==='close')closeDialog();if(a==='demolish'){const b=game.building(Number(el.dataset.id));if(b)game.demolish(b);selected=null;closeDialog();refresh();}if(a==='buy'){if(game.buyLand())toast('地契在手！青溪庄田归你所有');closeDialog();refresh();save();}if(a==='restart'){game=new Game();selected=null;placing=null;moving=null;shownFailure=false;$('placement').hidden=true;closeDialog();refresh();save();}if(a==='reset')showDialog('<h2>重新经营？</h2><p>会清除当前存档，重新从里正宅和2名村民开始。</p><div class="dialog-actions"><button class="secondary" data-dialog="close">取消</button><button class="primary" data-dialog="restart">确认重开</button></div>');});
$('cancel-placement').onclick=()=>{placing=null;moving=null;preview=null;$('placement').hidden=true;};
$('market-select').onclick=()=>{selected=game.buildings.find(b=>b.type==='market').id;renderPanel();};
document.addEventListener('dragstart',e=>{if(e.target.closest('[data-drag-type]')||e.target.closest('.building-icon')){e.preventDefault();e.stopPropagation();return false;}});
document.addEventListener('selectstart',e=>{if(e.target.closest('[data-drag-type]'))e.preventDefault();});
let touchDrag=null;
document.addEventListener('pointerdown',e=>{const card=e.target.closest('[data-drag-type]');if(!card||card.classList.contains('locked')||card.classList.contains('short'))return;e.preventDefault();touchDrag={type:card.dataset.dragType,moved:false};card.setPointerCapture?.(e.pointerId);});
document.addEventListener('pointermove',e=>{if(!touchDrag)return;const r=canvas.getBoundingClientRect();if(e.clientY<r.top){return;}touchDrag.moved=true;dragType=touchDrag.type;placing=dragType;preview=mapPoint(e);showDragGhost(dragType,e.clientX,e.clientY);$('placement').hidden=false;$('placement-text').textContent=TYPES[dragType].name+' · 拖到地图空地';});
document.addEventListener('pointerup',e=>{if(!touchDrag)return;const drag=touchDrag;touchDrag=null;if(!drag.moved){hideDragGhost();document.querySelector('.management').classList.remove('is-dragging');return;}if(dragType&&e.clientY>=canvas.getBoundingClientRect().top){const p=mapPoint(e);if(game.canPlace(dragType,p.x,p.y)){const b=game.build(dragType,p.x,p.y);if(b){selected=b.id;toast(TYPES[dragType].name+'已建造');}}else toast('这里不能放置，请留出通道');}dragType=null;placing=null;preview=null;hideDragGhost();document.querySelector('.management').classList.remove('is-dragging');$('placement').hidden=true;refresh();save();});
canvas.addEventListener('dragover',e=>{if(!dragType)return;e.preventDefault();preview=mapPoint(e);});
canvas.addEventListener('drop',e=>{if(!dragType)return;e.preventDefault();const p=mapPoint(e);if(game.canPlace(dragType,p.x,p.y)){const b=game.build(dragType,p.x,p.y);if(b){selected=b.id;toast(TYPES[dragType].name+'已建造');}}else toast('这里不能放置，请留出通道');dragType=null;placing=null;preview=null;hideDragGhost();$('placement').hidden=true;refresh();save();});
function mapPoint(e){const r=canvas.getBoundingClientRect(),tile=baseTile*mapZoom,ox=(width-game.cols*tile)/2+mapPanX,oy=(height-game.rows*tile)/2+mapPanY;return {x:Math.floor((e.clientX-r.left-ox)/tile),y:Math.floor((e.clientY-r.top-oy)/tile)};}
canvas.addEventListener('pointermove',e=>{if(mapPointer&&!pinch){const dx=e.clientX-mapPointer.x,dy=e.clientY-mapPointer.y;mapPointer.moved=mapPointer.moved||Math.hypot(e.clientX-mapPointer.sx,e.clientY-mapPointer.sy)>5;mapPanX+=dx;mapPanY+=dy;mapPointer.x=e.clientX;mapPointer.y=e.clientY;}if(placing)preview=mapPoint(e);});
canvas.addEventListener('touchstart',e=>{if(e.touches.length!==2)return;const [a,b]=e.touches;pinch={distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),zoom:mapZoom,cx:(a.clientX+b.clientX)/2,cy:(a.clientY+b.clientY)/2};mapPointer=null;e.preventDefault();},{passive:false});
canvas.addEventListener('touchmove',e=>{if(!pinch||e.touches.length!==2)return;const [a,b]=e.touches,cx=(a.clientX+b.clientX)/2,cy=(a.clientY+b.clientY)/2,distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),nextZoom=Math.max(.75,Math.min(2.2,pinch.zoom*distance/pinch.distance));mapPanX+=cx-pinch.cx;mapPanY+=cy-pinch.cy;mapZoom=nextZoom;pinch.distance=distance;pinch.cx=cx;pinch.cy=cy;pinch.zoom=nextZoom;e.preventDefault();},{passive:false});
canvas.addEventListener('touchend',e=>{if(e.touches.length<2)pinch=null;});
canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'&&e.isPrimary&&!placing){mapPointer={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false};canvas.setPointerCapture?.(e.pointerId);return;}
  const p=mapPoint(e);if(game.failed)return;
  if(placing){if(!game.canPlace(placing,p.x,p.y,moving)){preview=p;toast('这里不能放置，请留出通道');return;}if(moving){const b=game.building(moving);if(game.move(b,p.x,p.y))selected=b.id;}else{const b=game.build(placing,p.x,p.y);if(!b)return toast('金币或材料不足');selected=b.id;toast(TYPES[b.type].name+'已建造');}placing=null;moving=null;preview=null;$('placement').hidden=true;refresh();save();return;}
  const b=game.buildings.find(b=>p.x>=b.x&&p.x<b.x+TYPES[b.type].size&&p.y>=b.y&&p.y<b.y+TYPES[b.type].size);selected=b?.id??null;renderPanel();
});
canvas.addEventListener('pointerup',e=>{if(mapPointer){const wasTap=!mapPointer.moved&&!pinch;if(wasTap){const p=mapPoint(e),b=game.buildings.find(b=>p.x>=b.x&&p.x<b.x+TYPES[b.type].size&&p.y>=b.y&&p.y<b.y+TYPES[b.type].size);selected=b?.id??null;renderPanel();}mapPointer=null;canvas.releasePointerCapture?.(e.pointerId);}});
canvas.addEventListener('pointercancel',()=>{mapPointer=null;});
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
function drawGood(c,key,x,y,size=7){const g=GOODS[key];if(!g)return;c.fillStyle=g.color;c.strokeStyle='#3f493655';c.lineWidth=1;if(g.shape==='egg'){c.beginPath();c.ellipse(x,y,size*.38,size*.48,0,0,Math.PI*2);c.fill();c.stroke();}else if(g.shape==='log'){rect(c,x-size*.6,y-size*.25,size*1.2,size*.55,g.color);rect(c,x-size*.52,y-size*.15,size*.13,size*.35,'#dab781');}else if(g.shape==='coat'){rect(c,x-size*.45,y-size*.4,size*.9,size*.9,g.color);rect(c,x-size*.7,y-size*.35,size*1.4,size*.35,g.color);rect(c,x-size*.07,y-size*.3,size*.14,size*.6,'#d5e0d3');}else{rect(c,x-size*.4,y-size*.4,size*.8,size*.8,g.color);rect(c,x-size*.2,y-size*.3,size*.3,size*.16,'#ffffff55');}}
function drawBuilding(c,b,t,dx,dy,time,asIcon=false){
  const d=TYPES[b.type],sz=d.size,scale=asIcon?32:t,x=asIcon?0:dx+b.x*t,y=asIcon?0:dy+b.y*t,w=sz*scale,h=w;
  const r=(a,z,ww,hh,col)=>rect(c,x+a*w,y+z*h,ww*w,hh*h,col);
  if(b.type==='pile'){r(.15,.35,.7,.4,'#80744a');return;}
  r(.08,.77,.85,.14,'#334b3340');
  if(b.type==='farm'){
    r(.05,.05,.9,.9,'#816644');for(let row=0;row<4;row++){r(.09,.13+row*.2,.82,.09,'#6b5136');for(let col=0;col<5;col++){const xx=.15+col*.15,yy=.15+row*.2;r(xx,yy,.04,.1,'#436237');r(xx-.025,yy,.09,.04,'#d2c260');r(xx+.01,yy-.025,.035,.09,'#a0b35b');}}return;
  }
  if(['chicken','duck','rabbit'].includes(b.type)){
    r(.08,.3,.84,.57,b.type==='duck'?'#88aaa0':'#b6ac7c');r(.1,.35,.79,.51,b.type==='duck'?'#91b6ac':'#d0ba83');r(.08,.1,.48,.36,'#655d43');r(.04,.08,.54,.2,d.color);r(.09,.08,.43,.035,'#e0bf83');r(.25,.34,.14,.18,'#514b37');
    for(let i=0;i<4;i++){let ax=.29+(i%2)*.36+Math.sin(time*.45+i*3)*.035,ay=.56+Math.floor(i/2)*.21+Math.cos(time*.4+i)*.025;r(ax,ay,.11,.07,b.type==='rabbit'?'#dad0bf':'#fff4d6');r(ax+.07,ay-.025,.045,.055,b.type==='duck'?'#46664a':'#fff4d6');if(b.type==='rabbit'){r(ax+.08,ay-.07,.025,.09,'#e5d3cf');r(ax+.03,ay-.065,.025,.08,'#e5d3cf');}else r(ax+.11,ay,.04,.025,b.type==='chicken'?'#bf583e':'#e2b754');}
    for(let i=0;i<6;i++){r(.05+i*.16,.83,.035,.12,'#867353');r(.05+i*.16,.27,.035,.12,'#867353');}r(.05,.86,.9,.025,'#a78c60');r(.89,.29,.03,.57,'#8d7753');return;
  }
  if(b.type==='wood'){
    r(.07,.14,.48,.48,'#718352');r(.13,.2,.42,.38,'#526e41');r(.25,.39,.065,.34,'#795b3c');r(.12,.25,.42,.16,'#62884a');r(.55,.5,.4,.2,'#ab8051');r(.6,.55,.08,.13,'#e4c48b');r(.52,.73,.42,.13,'#97693f');r(.55,.74,.07,.12,'#e2bd85');r(.65,.12,.21,.26,'#547447');r(.73,.3,.04,.16,'#8b6741');return;
  }
  if(b.type==='stone'){
    r(.06,.18,.63,.53,'#737f79');r(.15,.1,.38,.4,'#a8b2a6');r(.42,.25,.25,.46,'#909c94');r(.1,.55,.32,.22,'#bdc5b6');r(.68,.6,.23,.23,'#a2aca4');r(.57,.74,.19,.15,'#ced1c1');r(.17,.13,.24,.04,'#d2d5c7');r(.73,.16,.065,.43,'#977444');r(.63,.19,.28,.06,'#535e55');return;
  }
  if(b.type==='compost'){
    r(.1,.17,.81,.67,'#7d694a');r(.16,.22,.29,.26,'#5c5537');r(.52,.22,.29,.26,'#6b7342');r(.16,.55,.29,.22,'#91a052');r(.52,.55,.29,.22,'#565437');r(.08,.17,.84,.035,'#b1a077');r(.48,.19,.035,.64,'#b1a077');r(.1,.5,.79,.035,'#b1a077');return;
  }
  r(.13,.35,.75,.5,'#e2d3aa');r(.15,.38,.09,.46,'#b79a68');r(.73,.38,.06,.46,'#b79a68');r(.38,.53,.21,.32,'#605b43');r(.13,.29,.76,.12,'#7c5740');r(.06,.15,.9,.18,d.color);r(.13,.07,.75,.12,d.color);r(.22,.03,.57,.06,d.color);r(.12,.12,.77,.026,'#d9a877');r(.05,.3,.92,.045,'#604b3d');
  for(let i=0;i<5;i++)r(.15+i*.16,.1,.023,.22,'#653e3425');r(.27,.47,.11,.13,'#748577');r(.64,.47,.11,.13,'#748577');
  if(b.type==='home'){r(.39,.065,.23,.045,'#ddd7ac');r(.42,.03,.17,.04,'#e3d9b4');r(.47,.52,.04,.31,'#ddbc70');r(.13,.85,.75,.06,'#96967f');}
  if(b.type==='market'){r(.13,.38,.75,.15,'#f1d794');for(let i=0;i<5;i++)r(.13+i*.15,.38,.075,.15,'#b55b41');r(.13,.76,.74,.08,'#81653f');r(.22,.67,.13,.08,'#d8b45a');r(.65,.65,.14,.1,'#788b53');}
  if(b.type==='pickle'){for(let i=0;i<3;i++){r(.15+i*.24,.69,.16,.17,'#9c7761');r(.17+i*.24,.65,.12,.05,'#564e40');}}
  if(b.type==='workshop'){r(.77,.53,.09,.32,'#b89560');r(.74,.5,.15,.04,'#61736b');r(.12,.65,.23,.16,'#9f7544');}
  if(b.type==='textile'){r(.35,.59,.29,.24,'#927f91');r(.41,.58,.17,.03,'#e3d8d7');r(.2,.74,.12,.12,'#ebe0c9');}
  if(b.type==='dye'){r(.16,.48,.1,.33,'#738ea8');r(.67,.48,.1,.33,'#9c7eac');r(.12,.46,.7,.025,'#a78c60');}
}
function draw(time){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);if(r.width!==width||r.height!==height){width=r.width;height=r.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);baseTile=Math.min(width/game.cols,height/game.rows);}
  const tile=baseTile*mapZoom,ox=(width-game.cols*tile)/2+mapPanX,oy=(height-game.rows*tile)/2+mapPanY;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,width,height);rect(ctx,0,0,width,height,'#a8b78e');
  const terrain=['#a7b684','#adbd8a','#a5b481','#b0bf8d','#a9b985'];
  for(let y=0;y<game.rows;y++)for(let x=0;x<game.cols;x++){const edge=x===0||y===0||x===game.cols-1||y===game.rows-1;rect(ctx,ox+x*tile,oy+y*tile,tile,tile,edge?'#94a478':terrain[(x*17+y*31)%5]);if(!edge){rect(ctx,ox+x*tile,oy+y*tile,tile,1,'#85976c19');rect(ctx,ox+x*tile,oy+y*tile,1,tile,'#85976c19');if((x*13+y*7)%9===0){rect(ctx,ox+(x+.3)*tile,oy+(y+.6)*tile,2,3,'#7f975e');rect(ctx,ox+(x+.65)*tile,oy+(y+.3)*tile,2,2,'#c1ca97');}}}
  for(let x=1;x<game.cols-1;x++){for(const y of [1,game.rows-1]){rect(ctx,ox+x*tile,oy+y*tile-3,tile,2,'#9a8762');rect(ctx,ox+x*tile,oy+y*tile-8,3,10,'#847654');}}
  for(let y=1;y<game.rows-1;y++){for(const x of [1,game.cols-1]){if(x===1&&y>=11)continue;rect(ctx,ox+x*tile-3,oy+y*tile,2,tile,'#9a8762');rect(ctx,ox+x*tile-7,oy+y*tile,9,3,'#847654');}}
  for(const b of [...game.buildings].sort((a,z)=>a.y-z.y)){
    const d=TYPES[b.type],s=d.size;if(b.id===selected){rect(ctx,ox+b.x*tile-2,oy+b.y*tile-2,s*tile+4,s*tile+4,'#f3dd89');rect(ctx,ox+b.x*tile,oy+b.y*tile,s*tile,s*tile,'#bbc993');}
    drawBuilding(ctx,b,tile,ox,oy,time);
    if(b.type!=='market'&&b.type!=='pile'){
      const x=ox+(b.x+.15)*tile,y=oy+(b.y+s)*tile-2,w=tile*s*.7;if(b.batch){rect(ctx,x,y,w,3,'#46603c');rect(ctx,x,y,w*b.progress/b.batch.cycle,3,'#d7cd76');}
      const n=game.workers.filter(w=>w.assigned===b.id).length;if(b.type!=='home'){rect(ctx,ox+(b.x+s-.3)*tile,oy+(b.y+.04)*tile,11,11,n?'#355a42':'#a15b44');ctx.fillStyle='#fff7db';ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillText(n||'!',ox+(b.x+s-.3)*tile+5.5,oy+(b.y+.04)*tile+8);}
      ctx.font='9px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillStyle='#354b33';ctx.fillText(d.name,ox+(b.x+s/2)*tile,oy+(b.y+s+.32)*tile);
      if(b.type!=='market'&&b.type!=='pile'&&b.level<5&&game.gold>=TYPES[b.type].upgrade[0]*2**(b.level-1)&&game.materials>=TYPES[b.type].upgrade[1]*2**(b.level-1)){ctx.fillStyle='#4f9a61';ctx.beginPath();ctx.moveTo(ox+(b.x+s-.1)*tile,oy+(b.y-.28)*tile);ctx.lineTo(ox+(b.x+s-.1)*tile+8,oy+(b.y-.28)*tile+8);ctx.lineTo(ox+(b.x+s-.1)*tile-2,oy+(b.y-.28)*tile+8);ctx.closePath();ctx.fill();}
    }
    let k=0;for(const [key,n]of Object.entries(b.output)){if(n>0){drawGood(ctx,key,ox+(b.x+.3+k*.4)*tile,oy+(b.y+.9)*tile,tile*.25);ctx.font='8px sans-serif';ctx.fillStyle='#2c3f2e';ctx.textAlign='left';ctx.fillText(n,ox+(b.x+.4+k*.4)*tile,oy+(b.y+1.05)*tile);k++;}}
  }
  const feedbackNow=performance.now();
  for(const f of floaters){
    const b=game.building(f.bId),age=(feedbackNow-f.born)/1200;if(!b||age>=1)continue;
    const y=oy+(b.y-.25)*tile-age*28;
    ctx.save();ctx.globalAlpha=Math.min(1,(1-age)*2);ctx.font='bold 12px sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
    const textWidth=ctx.measureText(f.text).width,x=ox+(b.x+TYPES[b.type].size/2)*tile-(textWidth+19)/2;
    ctx.lineWidth=1.5;
    if(f.type==='gold'){
      ctx.fillStyle='#e7b84d';ctx.strokeStyle='#9b7029';ctx.beginPath();ctx.arc(x+6,y,6,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#fff0b8';ctx.strokeRect(x+4,y-2,4,4);
    }else{
      ctx.fillStyle='#8cacaf';ctx.strokeStyle='#486b73';ctx.beginPath();ctx.moveTo(x+6,y-7);ctx.lineTo(x+13,y);ctx.lineTo(x+6,y+7);ctx.lineTo(x-1,y);ctx.closePath();ctx.fill();ctx.stroke();
    }
    ctx.strokeStyle='#f7f0df';ctx.lineWidth=3;ctx.strokeText(f.text,x+19,y);ctx.fillStyle=f.type==='material'?'#315e69':'#79521b';ctx.fillText(f.text,x+19,y);ctx.restore();
  }
  floaters=floaters.filter(f=>feedbackNow-f.born<1200);
  for(const w of [...game.workers].sort((a,z)=>a.y-z.y)){
    const x=ox+(w.x+.5)*tile,y=oy+(w.y+.6)*tile,sc=tile/30,step=Math.sin(time*10+w.id)*sc*1.5;
    rect(ctx,x-5*sc,y+4*sc,11*sc,3*sc,'#3a523744');rect(ctx,x-3*sc,y-2*sc,7*sc,7*sc,w.producing?'#b07351':w.id%2?'#547b83':'#667a9a');rect(ctx,x-4*sc,y-9*sc,8*sc,7*sc,'#e7c294');rect(ctx,x-5*sc,y-10*sc,10*sc,3*sc,'#4b4434');rect(ctx,x-3*sc,y+5*sc,2*sc,(w.route.length?4+step:4)*sc,'#534c40');rect(ctx,x+2*sc,y+5*sc,2*sc,(w.route.length?4-step:4)*sc,'#534c40');
    if(w.task?.phase==='delivery'){for(let i=0;i<Math.min(3,w.task.amount);i++)drawGood(ctx,w.task.key,x,y-16*sc-i*5*sc,8*sc);ctx.fillStyle='#304430';ctx.font='bold 9px sans-serif';ctx.textAlign='left';ctx.fillText(w.task.amount,x+6*sc,y-17*sc);}if(w.producing){ctx.fillStyle='#efdd94';ctx.font='10px sans-serif';ctx.fillText('·',x+6*sc,y-7*sc);}
  }
  if(placing&&preview){const p=preview,s=TYPES[placing].size,valid=game.canPlace(placing,p.x,p.y,moving);ctx.save();ctx.globalAlpha=.78;ctx.fillStyle=valid?'#6d9fc455':'#c96a5a55';ctx.strokeStyle=valid?'#457a9a':'#a9463d';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.fillRect(ox+p.x*tile,oy+p.y*tile,s*tile,s*tile);ctx.strokeRect(ox+p.x*tile+1,oy+p.y*tile+1,s*tile-2,s*tile-2);ctx.setLineDash([]);ctx.fillStyle=valid?'#3f718b':'#9c4138';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('蓝图',ox+(p.x+s/2)*tile,oy+(p.y+s/2)*tile+4);ctx.restore();}
  if(game.failed){rect(ctx,0,0,width,height,'#183a2722');}
}
function frame(t){const real=Math.min(1,(t-(last||t))/1000);last=t;if(!document.hidden&&!$('dialog').open&&!game.failed){let remaining=real;while(remaining>0){const step=Math.min(.05,remaining);game.tick(step);remaining-=step;}collectFeedback();}draw(t/1000);uiTime+=real;saveTime+=real;if(uiTime>.6){refresh();uiTime=0;}if(saveTime>8){save();saveTime=0;}if(t>toastUntil)$('toast').classList.remove('visible');requestAnimationFrame(frame);}
window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden)save();});
// Exposed only for deterministic local smoke tests and tuning the prototype.
window.demo={get game(){return game;},set game(value){game=value;selected=null;refresh();},refresh,draw,select(id){selected=id;renderPanel();}};
refresh();requestAnimationFrame(frame);
