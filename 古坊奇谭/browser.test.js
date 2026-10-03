'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const G=require('./game.js');
const shots=process.env.GUFANG_SHOTS||path.join(os.tmpdir(),'gufang-screenshots');
fs.mkdirSync(shots,{recursive:true});
const url=file=>pathToFileURL(path.join(__dirname,file)).href;
const freeze=page=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
async function mapClick(page,x,y){const p=await page.evaluate(([x,y])=>Gufang.screenPoint(x,y),[x,y]);await page.mouse.click(p.x,p.y);}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740},{width:375,height:667}]){
      const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:true}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.stack));
      await page.goto(url('index.html'));await page.waitForFunction(()=>!!window.Gufang);await page.waitForTimeout(200);
      const frame=await page.locator('#game').boundingBox();
      assert(frame.width<=480&&frame.height/frame.width>=16/9,'Always a phone-shaped portrait frame');
      assert(Math.abs(frame.x-(viewport.width-frame.width)/2)<1,'Desktop frame is centered');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.locator('#game button:visible').count(),1,'Only the pause/menu button is visible at startup');
      assert.equal(await page.locator('#speed,#map-tools,.map-tools,#grid-toggle,.mission-card,#idle-hint,#help').count(),0);
      assert(await page.locator('#startup-error').isHidden());
      // Menu and pause are the same action. Time, payouts and income counters must all stop.
      await page.locator('#menu-pause').click();assert(await page.locator('#modal').isVisible());
      const paused=await page.evaluate(()=>({time:Gufang.state.time,coins:Gufang.state.coins,counter:Gufang.state.buildings[0].incomeTime}));
      await page.waitForTimeout(1100);
      assert.deepEqual(await page.evaluate(()=>({time:Gufang.state.time,coins:Gufang.state.coins,counter:Gufang.state.buildings[0].incomeTime})),paused);
      await page.screenshot({path:path.join(shots,`menu-v2-${viewport.width}.png`)});
      await page.locator('[data-modal="close"]').click();const resume=await page.evaluate(()=>Gufang.state.time);
      await page.waitForTimeout(1250);const elapsed=await page.evaluate(()=>Gufang.state.time)-resume;
      assert(elapsed>.9&&elapsed<1.6,'Time runs at fixed 1× speed');
      // Freeze via the background-tab mechanism for deterministic construction and screenshots.
      await freeze(page);await page.screenshot({path:path.join(shots,`initial-v2-${viewport.width}.png`)});
      const camera=await page.evaluate(()=>Gufang.camera),canvasBefore=await page.locator('#map').boundingBox();
      await mapClick(page,7,8);assert(await page.locator('#build-view').isVisible());
      await page.locator('[data-category="defense"]').click();
      await mapClick(page,6,8);
      assert(await page.locator('[data-category="defense"]').evaluate(e=>e.classList.contains('active')),'Selected tab survives another plot');
      assert.equal(await page.locator('[data-build="tea"]').count(),0);
      assert(await page.locator('[data-build="tower"]').count());
      await mapClick(page,7,8);
      assert(await page.locator('[data-category="defense"]').evaluate(e=>e.classList.contains('active')));
      await page.locator('[data-category="economy"]').click();
      assert.deepEqual(await page.evaluate(()=>Gufang.camera),camera,'Panel never moves the camera');
      assert.deepEqual(await page.locator('#map').boundingBox(),canvasBefore,'Panel overlays the map');
      const height=(await page.locator('#panel').boundingBox()).height;
      await page.locator('[data-build="farm"]').click({force:true});assert.equal(await page.evaluate(()=>Gufang.state.buildings.length),1);
      assert((await page.locator('#toast').textContent()).includes('需临水平地'));
      await page.locator('[data-build="tea"]').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='tea').length),1);
      assert(Math.abs((await page.locator('#panel').boundingBox()).height-height)<.1);
      await page.locator('#upgrade-building').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='tea').level),2);
      await page.screenshot({path:path.join(shots,`detail-v2-${viewport.width}.png`)});
      await page.evaluate(()=>{Gufang.state.coins=2000;Gufang.select(7,7);});await page.locator('[data-build="inn"]').click();
      await page.locator('#upgrade-building').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='inn').level),2);
      await page.locator('#demolish-building').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='inn').length),0);
      assert(await page.locator('#cards').evaluate(e=>e.scrollWidth>e.clientWidth));
      await page.screenshot({path:path.join(shots,`build-v2-${viewport.width}.png`)});
      await page.locator('#close-panel').click();
      await mapClick(page,5,8);
      assert.equal(await page.locator('[data-build="farm"]').getAttribute('aria-disabled'),'false','The flat tile touching water accepts a farm');
      await page.locator('[data-build="farm"]').click();
      assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='farm').length),1);
      await page.locator('#close-panel').click();
      // Multiple buildings each get an actual integer payout and a matching floating coin amount.
      await page.evaluate(()=>{const s=Gufang.state;GF.build(s,'inn',7,7);GF.build(s,'tower',8,7);GF.build(s,'earth',9,8);s.effects=[];for(let i=0;i<10;i++)GF.step(s,.1);Gufang.refresh();document.getElementById('toast').className='';});
      const floats=await page.evaluate(()=>Gufang.state.effects.filter(e=>e.type==='income').map(e=>({amount:e.amount,id:e.buildingId})));
      assert(floats.length>=2);assert(floats.every(e=>Number.isInteger(e.amount)&&e.amount>0));
      await page.screenshot({path:path.join(shots,`income-v2-${viewport.width}.png`)});
      const beforePan=await page.evaluate(()=>Gufang.camera),cx=frame.x+frame.width*.5,cy=frame.height*.48;
      await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+36,cy+24,{steps:6});await page.mouse.up();
      const afterPan=await page.evaluate(()=>Gufang.camera);assert(afterPan.x!==beforePan.x&&afterPan.y!==beforePan.y);
      await page.mouse.wheel(0,-200);await page.waitForTimeout(80);assert((await page.evaluate(()=>Gufang.camera.zoom))>afterPan.zoom);
      if(viewport.width===390){
        const cdp=await context.newCDPSession(page),z=await page.evaluate(()=>Gufang.camera.zoom);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:390,id:1},{x:230,y:390,id:2}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:95,y:400,id:1},{x:275,y:400,id:2}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert((await page.evaluate(()=>Gufang.camera.zoom))>z);
      }
      await page.evaluate(()=>Gufang.select(6,6));await page.locator('[data-category="defense"]').click();await page.locator('#close-panel').click();
      await page.evaluate(()=>Gufang.save());await page.reload();await page.waitForFunction(()=>!!window.Gufang);await freeze(page);
      assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='tea').level),2);
      await page.evaluate(()=>Gufang.select(6,6));
      assert(await page.locator('[data-category="defense"]').evaluate(e=>e.classList.contains('active')),'Selected tab survives reload');
      await page.locator('#close-panel').click();
      await page.evaluate(()=>{const s=Gufang.state;s.coins=10000;s.incense=250;GF.startNight(s);for(let i=0;i<100;i++)GF.step(s,.1);Gufang.refresh();});
      const inc=await page.evaluate(()=>Gufang.state.incense);await page.locator('[data-skill="repel"]').click();assert.equal(await page.evaluate(()=>Gufang.state.incense),inc-30);
      if(viewport.width===390){
        await page.evaluate(()=>Gufang.select(6,6));
        await page.locator('[data-category="defense"]').click();
        const count=await page.evaluate(()=>Gufang.state.buildings.length);
        assert.equal(await page.locator('[data-build="tower"]').getAttribute('aria-disabled'),'true');
        await page.locator('[data-build="tower"]').click({force:true});
        assert.equal(await page.evaluate(()=>Gufang.state.buildings.length),count);
        assert((await page.locator('#toast').textContent()).includes('夜晚不可建造'));
        await page.evaluate(()=>Gufang.select(8,7));
        assert((await page.locator('#upgrade-label').textContent()).includes('夜晚不可升级'));
        await page.locator('#upgrade-building').click({force:true});
        assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='tower').level),1);
        await page.locator('#demolish-building').click();
        assert.equal(await page.evaluate(()=>Gufang.state.buildings.length),count);
      }
      await page.screenshot({path:path.join(shots,`night-v2-${viewport.width}.png`)});
      assert.deepEqual(errors,[],`No JS errors at ${viewport.width}px`);
      console.log(`PASS ${viewport.width}×${viewport.height}: portrait UI, menu/pause, 1× time, build, upgrade, floats, pan/pinch, save, skills`);
      await context.close();
    }
    // Reproduce the old failure in a WebView that rejects dvh, then verify both CSS and JS fallbacks.
    const compat=await browser.newPage({viewport:{width:390,height:844}}),compatErrors=[];
    compat.on('pageerror',e=>compatErrors.push(e.message));
    await compat.setContent('<style>html,body{margin:0}#game{position:relative;height:100unsupported;overflow:hidden}#map{position:absolute;height:100%}</style><main id="game"><canvas id="map"></canvas></main>');
    assert.equal(await compat.locator('#game').evaluate(e=>e.clientHeight),0,'Old dvh-only layout collapses to zero');
    const html=fs.readFileSync(path.join(__dirname,'古坊奇谭.html'),'utf8').replace(/100dvh/g,'100unsupported');
    await compat.setContent(html.replace(/<script[\s\S]*?<\/script>/gi,''));
    assert.equal(await compat.locator('#game').evaluate(e=>e.clientHeight),844,'CSS vh fallback works before JS starts');
    await compat.evaluate(()=>{Object.hasOwn=undefined;HTMLDialogElement.prototype.showModal=undefined;Object.defineProperty(window,'visualViewport',{value:undefined,configurable:true});});
    await compat.setContent(html);await compat.waitForFunction(()=>!!window.Gufang);
    assert.equal(await compat.locator('#game').evaluate(e=>e.clientHeight),844,'Pixel fallback works without visualViewport');
    assert(await compat.locator('#startup-error').isHidden());await mapClick(compat,7,8);await compat.locator('[data-build="tea"]').click();
    await compat.locator('#menu-pause').click();assert(await compat.locator('#modal').isVisible());
    assert.deepEqual(compatErrors,[]);console.log('PASS legacy Android compatibility simulation: no dvh, no Object.hasOwn, no native dialog, no visualViewport');
    await compat.close();
    const standalone=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    standalone.on('pageerror',e=>errors.push(e.message));
    const old=G.createState();old.coins=1234;for(const b of old.buildings){delete b.incomeTime;delete b.coinPending;delete b.incensePending;}
    await standalone.addInitScript(raw=>localStorage.setItem('gufang-qitan-save-v1',raw),JSON.stringify(old));
    await standalone.goto(url('古坊奇谭.html'));await standalone.waitForFunction(()=>!!window.Gufang);await freeze(standalone);
    assert.equal(await standalone.evaluate(()=>Gufang.state.coins),1234);assert.equal(await standalone.evaluate(()=>Gufang.state.buildings[0].type),'shrine');
    await mapClick(standalone,7,8);await standalone.locator('[data-build="tea"]').click();assert.equal(await standalone.evaluate(()=>Gufang.state.buildings.length),2);
    assert.deepEqual(errors,[]);console.log('PASS offline single-file HTML and old save migration');await standalone.close();
  }finally{await browser.close();}
  console.log('Screenshots: '+shots);
})().catch(e=>{console.error(e);process.exitCode=1;});
