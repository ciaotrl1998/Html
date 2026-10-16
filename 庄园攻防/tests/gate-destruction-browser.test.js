'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {createServer}=require('../server');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'assets/generated/qa/gate-destruction-v9'),metrics=JSON.parse(fs.readFileSync(path.join(root,'assets/generated/gate-destruction-v9/metrics.json'),'utf8'));
(async()=>{
 const server=createServer();await new Promise(resolve=>server.server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});fs.mkdirSync(qa,{recursive:true});
 try{for(const offline of [false,true]){
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[],external=[],target=offline?pathToFileURL(path.join(root,'dist/庄园攻防.html')).href:`http://127.0.0.1:${server.server.address().port}`;
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});page.on('request',r=>{if(offline&&r.url()!==target&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}));await page.goto(target);await page.waitForFunction(()=>window.Gufang&&window.GFArt);await page.locator('#start-single').click();await page.locator('#single-start').click();await page.locator('[data-choice="thunder"]').click();
  const result=await page.evaluate(async()=>{
   const s=GF.createMatch({mode:'single',enemyCount:4,mapSeed:42,rotation:0});s.soldiers=[];s.effects=[];s.projectiles=[];
   const gates=s.buildings.filter(b=>b.type==='gate'&&b.owner===0).sort((a,b)=>a.direction-b.direction),paths=['stages.png','stages-ew.png','destroyed.png','destroyed-ew.png'],sources=new Map();
   for(const name of paths){const file=`assets/sprites/buildings/gate/${name}`;sources.set(new URL(window.GF_ASSET_URLS?.[file]||file,document.baseURI).href,name);}
   const host=document.createElement('div');host.id='destroyed-gate-contact';host.style='position:absolute;inset:0;z-index:10000;display:grid;grid-template-columns:repeat(4,320px);grid-template-rows:repeat(4,225px);width:1280px;height:900px;background:#d0d5b0';document.body.append(host);
   const records=[],bars=[],cells=[];let overlayDraws=0;
   for(const row of [{level:1,hp:1,label:'完整'},{level:1,hp:0,label:'损毁 Lv1'},{level:4,hp:0,label:'损毁 Lv4'},{level:7,hp:0,label:'损毁 Lv7'}])for(const gate of gates){
    for(const b of s.buildings)if(b.type==='gate'){b.level=row.level;b.hp=row.hp?GF.maxHP(b):0;}
    const cell=document.createElement('div');cell.style='position:relative;height:225px;border:1px solid #acaf8d';const title=document.createElement('div');title.textContent=`${['北门','东门','南门','西门'][gate.direction]} · ${row.label}`;title.style='position:absolute;left:8px;top:6px;z-index:1;font:13px sans-serif;color:#4a2e20';cell.append(title);
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=225;canvas.style='width:320px;height:225px';cell.append(canvas);host.append(cell);
    const c=canvas.getContext('2d'),cam={x:160-(gate.x*64+32)*2,y:140-(gate.y*64+32)*2,zoom:2},draw=()=>GFArt.render(canvas,s,cam,null,{player:0,animationTime:0,reducedMotion:true});draw();await GFArt.ready();draw();
    const original=c.drawImage,oldOverlay=GFUI.image('assets/overlays/gate-broken.png');
    c.drawImage=function(img,...args){const m=this.getTransform();if(img===oldOverlay)overlayDraws++;if(Math.abs(m.e-160)<.001&&Math.abs(m.f-140)<.001){if(sources.has(img.src))records.push({direction:gate.direction,level:row.level,hp:row.hp,name:sources.get(img.src),args});if(img===GFUI.image('assets/ui/bars/health-track.png'))bars.push({direction:gate.direction,level:row.level,y:args[1]});}return original.call(this,img,...args);};
    try{draw();}finally{c.drawImage=original;}cells.push({canvas,gate});
   }
   // Exercise all 15 logical levels without changing the screenshot matrix.
   const probe=document.createElement('canvas');probe.width=320;probe.height=225;probe.style='width:320px;height:225px';host.append(probe);const c=probe.getContext('2d'),allLevels=[];
   const b=gates[0],cam={x:160-(b.x*64+32)*2,y:140-(b.y*64+32)*2,zoom:2},draw=()=>GFArt.render(probe,s,cam,null,{player:0,animationTime:0,reducedMotion:true}),original=c.drawImage;
   for(const gate of gates)gate.hp=0;
   c.drawImage=function(img,...args){const m=this.getTransform();if(sources.has(img.src)&&Math.abs(m.e-160)<.001&&Math.abs(m.f-140)<.001)allLevels.push({level:b.level,name:sources.get(img.src),args});return original.call(this,img,...args);};
   try{for(let level=1;level<=15;level++){b.level=level;draw();}}finally{c.drawImage=original;}
   const healed=[];for(const gate of gates){gate.hp=1;const cam={x:160-(gate.x*64+32)*2,y:140-(gate.y*64+32)*2,zoom:2};const old=c.drawImage;c.drawImage=function(img,...args){const m=this.getTransform();if(sources.has(img.src)&&Math.abs(m.e-160)<.001&&Math.abs(m.f-140)<.001)healed.push({direction:gate.direction,name:sources.get(img.src)});return old.call(this,img,...args);};try{GFArt.render(probe,s,cam,null,{player:0,animationTime:0,reducedMotion:true});}finally{c.drawImage=old;}}
   probe.remove();
   // Detail art must switch on hp crossing zero, without reselecting the gate.
   const game=Gufang.state;for(const p of game.players)p.controller='human';const gate=game.buildings.find(g=>g.type==='gate'&&g.owner===0),ui=[];Gufang.select(gate.x,gate.y);
   for(const hp of [GF.maxHP(gate),0,1,0]){gate.hp=hp;Gufang.refresh();const img=document.querySelector('#detail-view img');await img.decode();ui.push({hp,src:img.getAttribute('src'),expected:GFArt.thumbnail('gate',gate.level,gate.direction,hp<=0)});}
   return {records,bars,allLevels,healed,ui,overlayDraws};
  });
  assert.equal(result.records.length,16);assert.equal(result.overlayDraws,0,'Collapsed gates replace the intact building, without the obsolete crack overlay');
  for(const r of result.records){const p=metrics.gateOrientations[r.direction%2?'ew':'ns'];assert.equal(r.name,r.hp?p.image:p.destroyed.image);assert.deepEqual(r.args,[r.hp?Math.floor((r.level-1)/3)*96:0,0,96,128,-48,p.groundY-32-120,96,128]);}
  assert.equal(result.bars.length,12);for(const b of result.bars){const p=metrics.gateOrientations[b.direction%2?'ew':'ns'];assert.equal(b.y,p.groundY-32-p.destroyed.height-7);}
  assert.equal(result.allLevels.length,15);for(const r of result.allLevels){assert.equal(r.name,'destroyed.png');assert.equal(r.args[0],0);}
  assert.equal(result.healed.length,4);for(const r of result.healed)assert.equal(r.name,metrics.gateOrientations[r.direction%2?'ew':'ns'].image);
  for(const r of result.ui)assert.equal(r.src,r.expected,'Selected detail art follows destruction/repair without another selection');assert.notEqual(result.ui[0].src,result.ui[1].src);assert.equal(result.ui[0].src,result.ui[2].src);assert.equal(result.ui[1].src,result.ui[3].src);
  fs.writeFileSync(path.join(qa,`${offline?'offline':'source'}-report.json`),JSON.stringify({records:result.records,bars:result.bars,allLevels:result.allLevels,healed:result.healed},null,2));
  await page.locator('#destroyed-gate-contact').screenshot({path:path.join(qa,`${offline?'offline':'source'}-gate-destruction.png`)});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(`${offline?'Offline':'Source'}: four directions, shared ruins for Lv1-15, intact art restored at hp>0, zero crack overlays and live detail refresh passed`);await page.close();
 }}finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
