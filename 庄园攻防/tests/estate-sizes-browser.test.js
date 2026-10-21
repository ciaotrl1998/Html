'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),G=require('../js/game'),{createServer}=require('../server');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'assets/generated/qa/estate-sizes');
fs.mkdirSync(qa,{recursive:true});
(async()=>{
  const service=createServer();await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const address=`http://127.0.0.1:${service.server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    for(const file of ['/index.html','/dist/庄园攻防.html'])for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1280,height:900}]){
      for(const mode of ['single','coop'])for(const estateSize of Object.keys(G.ESTATE_SIZES)){
        const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
        await context.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}));
        page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>errors.push(request.url()));
        await page.goto(address+file);await page.waitForFunction(()=>!!window.Gufang);
        await page.locator(mode==='single'?'#start-single':'#start-coop').click();
        if(mode==='single'){
          await page.locator('input[name="single-enemies"][value="4"]').check();
          await page.locator('input[name="single-difficulty"][value="hard"]').check();
          await page.locator(`input[name="single-estate-size"][value="${estateSize}"]`).check();
        }else{
          await page.locator('#coop-enemies').selectOption('6');await page.locator('#coop-difficulty').selectOption('hard');
          await page.locator('#coop-estate-size').selectOption(estateSize);await page.locator('#coop-seat').click();
        }
        const menu=await page.locator(mode==='single'?'#single-settings':'#coop-lobby').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight}));
        assert(menu.scrollWidth<=menu.width,`${mode} ${viewport.width}: horizontal overflow`);
        assert(menu.scrollHeight<=menu.height+1,`${mode} ${viewport.width}: vertical overflow ${JSON.stringify(menu)}`);
        if(viewport.width===390&&estateSize==='large')await page.screenshot({path:path.join(qa,`${file.includes('dist')?'offline':'source'}-${mode}-settings.png`)});
        await page.locator(mode==='single'?'#single-start':'#coop-start').click();await page.locator('[data-choice="thunder"]').click();
        const state=await page.evaluate(()=>({size:Gufang.state.estateSize,mode:Gufang.state.mode,count:Gufang.state.enemyCount,difficulty:Gufang.state.difficulty,width:Gufang.state.worldSize,height:Gufang.state.worldHeight,rotation:Gufang.state.rotation,areas:GF.estate(Gufang.state).estates.map(e=>e.cells.size),save:GF.serialize(Gufang.state)}));
        assert.equal(state.size,estateSize);assert.equal(state.mode,mode);assert.equal(state.count,mode==='single'?4:6);assert.equal(state.difficulty,'hard');assert(G.restore(state.save));
        const rendered=await page.evaluate(async()=>{
          const canvas=document.getElementById('map'),draw=()=>GFArt.render(canvas,Gufang.state,Gufang.camera,null,{player:0,grid:true,animationTime:0,reducedMotion:true});
          draw();await GFArt.ready();draw();await GFArt.ready();
          const ctx=canvas.getContext('2d'),original=ctx.drawImage,shrine=GFUI.url('assets/sprites/buildings/shrine/stages.png');let shrineDrawn=false;
          ctx.drawImage=function(image,...args){if(image.src===shrine)shrineDrawn=true;return original.call(this,image,...args);};
          try{draw();}finally{ctx.drawImage=original;}return shrineDrawn;
        });
        assert(rendered,'The selected map renders its shrine from the actual building image');
        if(viewport.width===390&&['mini','large'].includes(estateSize))await page.screenshot({path:path.join(qa,`${file.includes('dist')?'offline':'source'}-${mode}-${estateSize}.png`)});
        if(viewport.width===390&&estateSize==='large'){
          await page.locator('#menu-pause').click();await page.locator('[data-modal="reset"]').click();await page.locator('[data-modal="new"]').click();
          assert.equal(await page.evaluate(()=>Gufang.state.estateSize),'large','Restart retains the selected estate size');
        }
        assert.deepEqual(errors,[]);await context.close();
      }
      console.log(`PASS ${file} ${viewport.width}x${viewport.height}: four sizes, both modes, setup layout and saved maps`);
    }
    const context=await browser.newContext({viewport:{width:390,height:844}}),host=await context.newPage(),guest=await context.newPage();
    await context.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}));
    for(const page of [host,guest]){await page.goto(address);await page.waitForFunction(()=>!!window.Gufang);await page.locator('#start-coop').click();}
    await host.locator('#coop-estate-size').selectOption('small');await host.locator('#coop-host').click();
    await host.waitForFunction(()=>/^\d{6}$/.test(document.getElementById('coop-code').value));
    const code=await host.locator('#coop-code').inputValue();await guest.locator('#coop-code').fill(code);await guest.locator('#coop-join').click();
    await guest.waitForFunction(()=>document.getElementById('coop-estate-size').value==='small');assert(await guest.locator('#coop-estate-size').isDisabled());
    await host.locator('#coop-estate-size').selectOption('large');await guest.waitForFunction(()=>document.getElementById('coop-estate-size').value==='large');
    await host.locator('#coop-start').click();await Promise.all([host,guest].map(page=>page.waitForFunction(()=>Gufang.state.mode==='coop'&&Gufang.state.estateSize==='large')));
    const geometry=await Promise.all([host,guest].map(page=>page.evaluate(()=>[Gufang.state.worldSize,Gufang.state.worldHeight,[...GF.estate(Gufang.state).cells]])));
    assert.deepEqual(geometry[0],geometry[1]);await context.close();console.log('PASS LAN: host size selection, guest synchronization, locked control and identical authoritative map');
  }finally{await browser.close();await service.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
