'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),shots=path.join(root,'assets/generated/qa/png-interface');
fs.mkdirSync(shots,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/interface-manifest.json'))).assets;
  for(const file of Object.keys(manifest))assert(fs.existsSync(path.join(root,file)),file);
  for(const offline of [false,true])for(const viewport of [{width:390,height:844},{width:320,height:568},{width:1440,height:1000}]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],external=[],failed=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('requestfailed',r=>failed.push(r.url()));
   page.on('request',r=>{if(offline&&!r.url().startsWith('data:')&&r.url()!==pathToFileURL(path.join(root,'dist/庄园攻防.html')).href)external.push(r.url());});
   await page.goto(pathToFileURL(path.join(root,offline?'dist/庄园攻防.html':'index.html')).href);
   await page.waitForFunction(()=>window.Gufang&&window.GFUI);
   await page.evaluate(async manifest=>{
    await Promise.all(Object.keys(manifest).map(file=>new Promise((resolve,reject)=>{const img=GFUI.image(file);if(img.complete){img.naturalWidth?resolve():reject(Error(file));return;}img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(Error(file)),{once:true});})));
   },manifest);
   if(offline&&viewport.width===390)await page.evaluate(manifest=>{
    const cv=document.createElement('canvas'),c=cv.getContext('2d',{willReadFrequently:true});
    for(const [file,spec] of Object.entries(manifest)){const img=GFUI.image(file);if(img.naturalWidth!==spec.width||img.naturalHeight!==spec.height)throw Error('Wrong dimensions: '+file);cv.width=spec.width;cv.height=spec.height;c.drawImage(img,0,0);const pixels=c.getImageData(0,0,cv.width,cv.height).data;for(let n=3;n<pixels.length;n+=4)if(pixels[n]!==0&&pixels[n]!==255)throw Error('Non-binary alpha: '+file);}
   },manifest);
   assert.equal(await page.locator('svg').count(),0,'No SVG artwork remains');
   const bg=await page.locator('.coin-icon').first().evaluate(el=>getComputedStyle(el).backgroundImage);
   assert(bg.includes(offline?'data:image/png':'assets/ui/icons/coin.png'));
   assert.equal(await page.locator('.coin-icon').first().evaluate(el=>getComputedStyle(el,'::after').display),'none');
   for(const el of ['#start-menu']){
    const size=await page.locator(el).evaluate(e=>[e.clientWidth,e.scrollWidth]);assert.equal(size[0],size[1]);
   }
   await page.screenshot({path:path.join(shots,`${offline?'offline':'source'}-title-${viewport.width}.png`)});
   await page.locator('#start-single').click();await page.locator('#single-start').click();
   await page.locator('[data-choice="thunder"]').click();
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));const s=Gufang.state,p=GF.playerView(s,0);p.coins=p.materials=100000;Gufang.select(s.buildings[0].x,s.buildings[0].y);Gufang.refresh();});
   await page.waitForFunction(()=>[...document.querySelectorAll('#detail-view img')].every(i=>i.complete&&i.naturalWidth));
   await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
   await page.evaluate(async()=>{const draw=()=>GFArt.render(document.getElementById('map'),Gufang.state,Gufang.camera,null,{player:0,grid:true});draw();await GFArt.ready();draw();});
   await page.screenshot({path:path.join(shots,`${offline?'offline':'source'}-detail-${viewport.width}.png`)});
   await page.evaluate(()=>{const s=Gufang.state,p=GF.playerView(s,0);for(let y=0;y<GF.worldHeight(s);y++)for(let x=0;x<GF.worldWidth(s);x++)if(GF.owns(p,x,y)&&!GF.at(s,x,y)&&!GF.buildReason(p,'barracks',x,y)){Gufang.select(x,y);return;}throw Error('No buildable plot');});
   assert(await page.locator('#build-view').isVisible());
   await page.waitForFunction(()=>[...document.querySelectorAll('#cards img')].every(i=>i.complete&&i.naturalWidth));
   await page.screenshot({path:path.join(shots,`${offline?'offline':'source'}-cards-${viewport.width}.png`)});
   await page.locator('#menu-pause').click();assert(await page.locator('#modal').isVisible());
   await page.screenshot({path:path.join(shots,`${offline?'offline':'source'}-menu-${viewport.width}.png`)});
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[],'No missing CSS or PNG requests');if(offline)assert.deepEqual(external,[],'Offline HTML has no external file requests');
   // Changing the PNG URL changes both CSS icons and canvas sprites without editing painters.
   await page.evaluate(()=>{const cv=document.createElement('canvas');cv.width=cv.height=32;const c=cv.getContext('2d');c.fillStyle='#ff00ff';c.fillRect(0,0,32,32);window.GF_ASSET_URLS||={};window.GF_ASSET_URLS['assets/ui/icons/coin.png']=cv.toDataURL();document.querySelector('#png-art-urls').remove();});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/ui.js'),'utf8')});
   assert((await page.locator('.coin-icon').first().evaluate(el=>getComputedStyle(el).backgroundImage)).includes('data:image/png'));
   await page.evaluate(async()=>{const img=GFUI.image('assets/ui/icons/coin.png');if(!img.complete)await new Promise(resolve=>img.onload=resolve);const cv=document.createElement('canvas');cv.width=cv.height=32;GFUI.draw(cv.getContext('2d'),'assets/ui/icons/coin.png',0,0,32,32);if([...cv.getContext('2d').getImageData(16,16,1,1).data].join(',')!=='255,0,255,255')throw Error('Replacement not consumed');});
   console.log(`${offline?'offline':'source'} ${viewport.width}: PNG loading, menu, cards, detail, substitution OK`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
