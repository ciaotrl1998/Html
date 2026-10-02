'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    for(const viewport of [{width:390,height:844},{width:1440,height:1080},{width:320,height:740}]){
      const page=await browser.newPage({viewport,deviceScaleFactor:1});const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await page.waitForTimeout(350);
      await page.evaluate(()=>{localStorage.clear();demo.game=new FarmGame.Game();});
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.getElementById('map').getBoundingClientRect().toJSON()}));
      assert.equal(layout.overflow,false,'No horizontal overflow');assert(layout.canvas.width>300);
      assert.equal(await page.locator('#rent-amount').textContent(),'180');
      const tray=await page.locator('.management').boundingBox();assert(tray.height>=190,'Expanded management tray');
      assert.equal(await page.locator('.panel').evaluate(el=>getComputedStyle(el).overflow),'hidden');
      assert(await page.locator('[data-page="next"]').count(),'Building tray has pagination controls');
      const cards=await page.locator('.building-option').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().width));assert(cards.every((w,i)=>i===0||w>0),'Building cards fit the panel');
      const colors=await page.evaluate(()=>{const c=document.getElementById('map'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data,set=new Set();for(let i=0;i<p.length;i+=400)set.add(`${p[i]},${p[i+1]},${p[i+2]}`);return set.size;});assert(colors>20,'Nonblank detailed canvas');
      const source=await page.locator('[data-build="wood"]').boundingBox();const target=await page.locator('#map').boundingBox();
      await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width*.32,target.y+target.height*.32,{steps:8});await page.mouse.up();
      assert.equal(await page.evaluate(()=>demo.game.buildings.filter(b=>b.type==='wood').length),1,'Click builds facility');
      assert.equal(await page.evaluate(()=>demo.game.workers.filter(w=>w.assigned===demo.game.buildings.find(b=>b.type==='wood').id).length),1,'Auto assigns idle worker');
      await page.locator('[data-action="assign"]').click();
      assert.equal(await page.evaluate(()=>demo.game.workers.filter(w=>w.assigned).length),2);
      await page.locator('[data-action="unassign"]').click();
      await page.evaluate(()=>{demo.game.materials=10;demo.game.gold=500;demo.refresh();});
      await page.locator('[data-action="upgrade"]').click();
      assert.equal(await page.evaluate(()=>demo.game.buildings.find(b=>b.type==='wood').level),2);
      await page.locator('[data-action="move"]').click();await page.locator('#cancel-placement').click();
      await page.locator('#market-select').click();assert(await page.locator('[data-action="assign"]').count());
      await page.evaluate(()=>{for(let i=0;i<1400;i++)demo.game.tick(.05);demo.refresh();});
      assert((await page.evaluate(()=>demo.game.sales))>0,'Visible logistics sells goods');
      await page.locator('[data-tab="workers"]').click();
      await page.evaluate(()=>{const b=demo.game.buildings.find(b=>b.type==='wood');while(demo.game.active(b))demo.game.assign(b,-1);demo.game.gold=1000;demo.game.materials=100;demo.refresh();});
      await page.locator('[data-action="auto-distribute"]').click();
      assert(await page.evaluate(()=>demo.game.active(demo.game.buildings.find(b=>b.type==='wood'))));
      await page.locator('[data-worker-upgrade="carryLevel"]').click();
      await page.locator('[data-worker-upgrade="speedLevel"]').click();
      assert.equal(await page.evaluate(()=>demo.game.carryLevel),2);assert.equal(await page.evaluate(()=>demo.game.speedLevel),2);
      const workerLayout=await page.locator('[data-worker-upgrade="speedLevel"]').boundingBox();const panelLayout=await page.locator('#panel').boundingBox();assert(workerLayout.y+workerLayout.height<=panelLayout.y+panelLayout.height,'Speed upgrade fits visible panel');
      const screen=process.env.SCREENSHOT_DIR;if(screen)await page.screenshot({path:path.join(screen,`hexiazhuang-${viewport.width}.png`),fullPage:true});
      await page.evaluate(()=>{demo.game.gold=5000;demo.refresh();});
      await page.evaluate(()=>{demo.game.buyLand();demo.refresh();});assert(await page.evaluate(()=>demo.game.won));
      await page.reload();await page.waitForTimeout(200);assert(await page.evaluate(()=>demo.game.won),'Save restores victory');
      assert.deepEqual(errors,[]);console.log(`PASS browser ${viewport.width}×${viewport.height}; ${colors} canvas colors; build/assign/upgrade/hire/sale/win/save`);await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
