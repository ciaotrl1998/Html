'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const shots=process.env.GUFANG_SHOTS||path.join(os.tmpdir(),'gufang-screenshots');
fs.mkdirSync(shots,{recursive:true});
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740},{width:375,height:667}]){
      const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:true});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
      await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await page.waitForTimeout(250);
      await page.evaluate(()=>Gufang.setPaused(true));
      await page.addStyleTag({content:'#paused-indicator{display:none!important}'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
      await page.evaluate(()=>document.getElementById('paused-indicator').hidden=true);
      await page.screenshot({path:path.join(shots,`initial-${viewport.width}.png`)});
      // A real map click must open the construction overlay, without changing its canvas or camera.
      const mapBefore=await page.locator('#map').boundingBox(),cameraBefore=await page.evaluate(()=>Gufang.camera);
      const p=await page.evaluate(()=>Gufang.screenPoint(7,8));await page.mouse.click(p.x,p.y);
      assert(await page.locator('#panel').isVisible());assert(await page.locator('#build-view').isVisible());
      assert.deepEqual(await page.locator('#map').boundingBox(),mapBefore);assert.deepEqual(await page.evaluate(()=>Gufang.camera),cameraBefore);
      const buildHeight=(await page.locator('#panel').boundingBox()).height;
      // Terrain feedback is non-modal and a valid card builds immediately.
      await page.locator('[data-build="farm"]').click({force:true});assert.equal(await page.evaluate(()=>Gufang.state.buildings.length),1);
      assert((await page.locator('#toast').textContent()).includes('需水边'));
      await page.locator('[data-build="tea"]').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='tea').length),1);
      assert(await page.locator('#detail-view').isVisible());assert(Math.abs((await page.locator('#panel').boundingBox()).height-buildHeight)<.1);
      await page.locator('#upgrade-building').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='tea').level),2);
      await page.screenshot({path:path.join(shots,`detail-${viewport.width}.png`)});
      await page.evaluate(()=>{Gufang.state.coins=1000;Gufang.select(7,7);});await page.locator('[data-build="inn"]').click();
      assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='inn').length),1);
      await page.locator('#upgrade-building').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='inn').level),2);
      await page.locator('#demolish-building').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='inn').length),0);
      assert(await page.locator('#build-view').isVisible());assert(Math.abs((await page.locator('#panel').boundingBox()).height-buildHeight)<.1);
      const scrollable=await page.locator('#cards').evaluate(el=>el.scrollWidth>el.clientWidth);assert(scrollable,'Cards scroll horizontally');
      await page.screenshot({path:path.join(shots,`build-${viewport.width}.png`)});
      await page.locator('#close-panel').click();
      const beforePan=await page.evaluate(()=>Gufang.camera);
      await page.mouse.move(viewport.width*.5,viewport.height*.48);await page.mouse.down();await page.mouse.move(viewport.width*.5+45,viewport.height*.48+28,{steps:6});await page.mouse.up();
      const afterPan=await page.evaluate(()=>Gufang.camera);assert(afterPan.x!==beforePan.x&&afterPan.y!==beforePan.y,'Mouse drag pans');
      await page.mouse.wheel(0,-250);await page.waitForTimeout(80);assert((await page.evaluate(()=>Gufang.camera.zoom))>afterPan.zoom,'Wheel zooms');
      if(viewport.width===390){
        const cdp=await context.newCDPSession(page),z=await page.evaluate(()=>Gufang.camera.zoom);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:390,id:1},{x:230,y:390,id:2}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:95,y:400,id:1},{x:275,y:400,id:2}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert((await page.evaluate(()=>Gufang.camera.zoom))>z,'Two-finger pinch zooms');
      }
      await page.locator('#recenter').click();
      // Construction persisted from disk, not just the current JS objects.
      await page.evaluate(()=>Gufang.save());await page.reload();await page.waitForTimeout(150);await page.evaluate(()=>Gufang.setPaused(true));
      await page.addStyleTag({content:'#paused-indicator{display:none!important}'});
      assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='tea').level),2);
      await page.locator('#quick-menu').click();assert(await page.locator('#modal').isVisible());await page.locator('[data-modal="help"]').click();assert((await page.locator('#modal-content').textContent()).includes('起点看地形'));await page.locator('[data-modal="close"]').click();
      // Seed a legal developed town, then exercise actual skill buttons and automatic combat.
      await page.evaluate(()=>{
        const s=Gufang.state;s.coins=10000;s.incense=250;
        const builds=[['inn',7,7],['bank',6,7],['farm',4,8],['mill',5,8],['wine',6,8],['home',7,9],['tower',8,7],['tower',9,8],['earth',9,9],['mulberry',10,6],['weaver',9,6],['tailor',8,6],['tao',6,9],['zhong',8,9]];
        for(const [type,x,y]of builds){const r=GF.build(s,type,x,y);if(!r.ok)throw Error(type+': '+r.reason);}
        GF.dusk(s);GF.startNight(s);for(let i=0;i<170;i++)GF.step(s,.1);Gufang.refresh();document.getElementById('paused-indicator').hidden=true;
      });
      assert(await page.locator('#skills').isVisible());const incenseBefore=await page.evaluate(()=>Gufang.state.incense);
      await page.locator('[data-skill="repel"]').click();assert.equal(await page.evaluate(()=>Gufang.state.incense),incenseBefore-30);
      assert.equal(await page.locator('[data-skill="repel"]').getAttribute('aria-disabled'),'true','Cooldown is displayed');
      await page.screenshot({path:path.join(shots,`night-${viewport.width}.png`)});
      await page.locator('[data-skill="thunder"]').click();await page.locator('[data-skill="repair"]').click();
      assert.deepEqual(errors,[],`No JS errors at ${viewport.width}px`);
      console.log(`PASS ${viewport.width}×${viewport.height}: map, build, upgrade, demolish, layout, pan, zoom, save, help, night skills`);
      await context.close();
    }
    const standalone=await browser.newPage({viewport:{width:390,height:844}}),standaloneErrors=[];
    standalone.on('pageerror',e=>standaloneErrors.push(e.message));
    await standalone.goto(pathToFileURL(path.join(__dirname,'古坊奇谭.html')).href);
    await standalone.waitForTimeout(150);await standalone.evaluate(()=>Gufang.setPaused(true));
    await standalone.locator('#start-build').click();await standalone.locator('[data-build="tea"]').click();
    assert.equal(await standalone.evaluate(()=>Gufang.state.buildings.some(b=>b.type==='tea')),true);
    assert.deepEqual(standaloneErrors,[]);console.log('PASS standalone HTML: offline scripts, map and construction');
    await standalone.close();
  }finally{await browser.close();}
  console.log('Screenshots: '+shots);
})().catch(e=>{console.error(e);process.exitCode=1;});
