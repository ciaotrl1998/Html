'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'assets/generated/qa/gate-repair');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  for(const file of ['index.html','dist/庄园攻防.html'])for(const width of [320,1280]){
   const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
   await page.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}));
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.join(root,file)).href);await page.waitForFunction(()=>window.Gufang&&window.GFArt);
   await page.locator('#start-single').click();await page.locator('#single-start').click();await page.locator('[data-choice="thunder"]').click();
   await page.evaluate(()=>{
    const s=Gufang.state,p=GF.playerView(s,0);for(const player of s.players)player.controller='human';p.coins=p.materials=1e12;
    const gate=p.buildings.find(b=>b.type==='gate');Gufang.select(gate.x,gate.y);Gufang.refresh();
   });
   const repairRow=page.locator('.upgrade-stats > div').filter({hasText:'修复速度'});
   assert.match(await repairRow.innerText(),/2%\/秒\s*→\s*2\.2%\/秒/);
   await page.locator('#upgrade-building').click();
   assert.match(await repairRow.innerText(),/2\.2%\/秒\s*→\s*2\.4%\/秒/);
   assert.equal(await page.evaluate(()=>GF.playerView(Gufang.state,0).gateLevel),2);
   await page.evaluate(()=>{
    const p=GF.playerView(Gufang.state,0);p.gateLevel=15;
    for(const b of p.buildings)if(b.type==='gate'||b.type==='shrine'){b.level=15;b.hp=GF.maxHP(b);}
    Gufang.refresh();
   });
   const maxText=await repairRow.innerText();assert.match(maxText,/4\.8%\/秒/);assert(!maxText.includes('→'));
   if(width===320){fs.mkdirSync(qa,{recursive:true});await page.screenshot({path:path.join(qa,file==='index.html'?'source-detail.png':'offline-detail.png')});}
   const labels=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=600;canvas.style='width:900px;height:600px';document.body.append(canvas);
    const c=canvas.getContext('2d'),s=GF.createMatch({mode:'coop',enemyCount:2,mapSeed:42,rotation:0});
    s.soldiers=[];s.effects=[];s.projectiles=[];
    s.buildings=s.buildings.filter(b=>b.type==='shrine'||b.type==='gate'&&b.direction===0);
    s.buildings.forEach((b,i)=>{b.x=2+i%4*2;b.y=2+Math.floor(i/4)*3;if(b.type==='gate'&&b.owner===0)b.hp=0;});
    const draw=zoom=>GFArt.render(canvas,s,{x:0,y:0,zoom},null,{player:0,animationTime:0,reducedMotion:true});
    draw(1);await GFArt.ready();draw(1);
    const capture=zoom=>{const texts=[],original=c.fillText;c.fillText=function(text,...args){texts.push(String(text));return original.call(this,text,...args);};try{draw(zoom);}finally{c.fillText=original;}return texts;};
    return {overview:capture(.5),far:capture(.89),near:capture(.9),closer:capture(1.3)};
   });
   for(const texts of [labels.overview,labels.far]){
    assert(texts.includes('你的庄园'));assert(texts.includes('队友庄园'));assert(texts.some(t=>t.startsWith('敌方庄园')));
    assert(!texts.includes('祠堂'),'Zooming out shows estate labels and hides building names');
   }
   for(const texts of [labels.near,labels.closer]){
    assert(!texts.some(t=>t.includes('庄园')),'Zooming in hides estate labels');assert(texts.includes('祠堂'));
   }
   for(const texts of Object.values(labels))assert(!texts.some(t=>/城门|^[北东南西门]$|毁损/.test(t)),'Gates render no directional/name/damage text on the map');
   assert.deepEqual(errors,[]);console.log(`${file} ${width}px: zoomed-out estate labels, zoomed-in building names, text-free gates and repair upgrade preview passed`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
