'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'assets/generated/qa/upgrade-markers');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  for(const file of ['index.html','dist/庄园攻防.html']){
   const page=await browser.newPage({viewport:{width:640,height:420},reducedMotion:'no-preference'});
   await page.goto(pathToFileURL(path.join(root,file)).href);
   await page.waitForFunction(()=>window.GFArt&&window.GFUI&&window.GF);
   const result=await page.evaluate(async()=>{
    Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));
    document.body.innerHTML='<canvas width="640" height="420" style="position:fixed;inset:0;width:640px;height:420px"></canvas>';
    const canvas=document.querySelector('canvas'),c=canvas.getContext('2d'),s=GF.createState(12345),base=s.buildings[0];
    s.buildings=['inn','farm','quarry','mulberry'].map((type,i)=>({...base,id:100+i*37,type,owner:0,level:1,x:2+i*1.6,y:3}));
    s.soldiers=[];s.enemies=[];s.effects=[];s.projectiles=[];s.elapsed=10;
    const camera={x:0,y:0,zoom:1},originalReason=GF.upgradeReason;
    let enabled=4;GF.upgradeReason=(_p,b)=>s.buildings.indexOf(b)<enabled?null:'not available';
    const render=(time,reducedMotion=false)=>GFArt.render(canvas,s,camera,null,{player:0,animationTime:time,reducedMotion});
    render(.5);await GFArt.ready();await GFUI.image('assets/ui/icons/upgrade.png').decode();render(.5);
    const capture=(time,reducedMotion=false)=>{
     const draws=[],draw=c.drawImage,sine=Math.sin;let sineCalls=0;
     c.drawImage=function(img,...args){if(img===GFUI.image('assets/ui/icons/upgrade.png'))draws.push({x:args[0],y:args[1],w:args[2],h:args[3]});return draw.call(this,img,...args);};
     Math.sin=function(value){sineCalls++;return sine(value);};
     try{render(time,reducedMotion);}finally{c.drawImage=draw;Math.sin=sine;}
     return {draws,sineCalls};
    };
    try{
     const down=capture(.5),up=capture(1.5),rest=capture(0),reduced=capture(.5,true);
     enabled=1;const single=capture(.5);enabled=4;
     render(1.5);return {down,up,rest,reduced,single};
    }finally{GF.upgradeReason=originalReason;}
   });
   for(const sample of [result.down,result.up,result.rest,result.reduced]){
    assert.equal(sample.draws.length,4);
    assert.equal(new Set(sample.draws.map(d=>d.y)).size,1,'Every building uses the same vertical offset');
    for(const draw of sample.draws){assert.equal(draw.w,24);assert.equal(draw.h,24);}
   }
   assert.equal(result.single.draws.length,1);
   assert.equal(result.single.sineCalls,result.down.sineCalls,'Adding markers does not add sine calculations');
   assert.equal(result.down.draws[0].y-result.up.draws[0].y,6,'Markers float over a six-pixel vertical range');
   assert.equal(result.reduced.draws[0].y,result.rest.draws[0].y,'Reduced motion keeps a stable resting position');
   fs.mkdirSync(qa,{recursive:true});await page.screenshot({path:path.join(qa,file==='index.html'?'source.png':'offline.png')});
   console.log(`${file}: larger markers, synchronized float, shared animation cost and reduced motion passed`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
