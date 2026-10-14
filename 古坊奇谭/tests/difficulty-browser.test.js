'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../server');

(async()=>{
  const service=createServer();await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}}),host=await context.newPage(),guest=await context.newPage(),errors=[];
    host.on('pageerror',error=>errors.push('host: '+error.message));guest.on('pageerror',error=>errors.push('guest: '+error.message));
    const address=`http://127.0.0.1:${service.server.address().port}`;await Promise.all([host.goto(address),guest.goto(address)]);
    await host.locator('#start-coop').click();await host.locator('#coop-enemies').selectOption('4');await host.locator('#coop-difficulty').selectOption('extreme');await host.locator('#coop-host').click();
    await host.waitForFunction(()=>/^\d{6}$/.test(Gufang.online?.code||''));const code=await host.evaluate(()=>Gufang.online.code);
    await guest.locator('#start-coop').click();await guest.locator('#coop-code').fill(code);await guest.locator('#coop-join').click();await host.waitForFunction(()=>Gufang.online?.peerConnected);
    assert.deepEqual(await guest.evaluate(()=>[document.getElementById('coop-enemies').value,document.getElementById('coop-difficulty').value,document.getElementById('coop-difficulty').disabled]),['4','extreme',true]);
    await host.locator('#coop-enemies').selectOption('6');await host.locator('#coop-difficulty').selectOption('hell');
    await guest.waitForFunction(()=>document.getElementById('coop-enemies').value==='6'&&document.getElementById('coop-difficulty').value==='hell');
    await host.locator('#coop-start').click();await guest.waitForFunction(()=>Gufang.state.mode==='coop'&&Gufang.online?.role==='guest');
    assert.deepEqual(await host.evaluate(()=>[Gufang.state.enemyCount,Gufang.state.difficulty]),[6,'hell']);
    assert.deepEqual(await guest.evaluate(()=>[Gufang.state.enemyCount,Gufang.state.difficulty]),[6,'hell']);
    assert.deepEqual(await host.evaluate(()=>[document.querySelectorAll('.daybar').length,document.querySelectorAll('#coop-status').length]),[0,0]);
    assert.deepEqual(await guest.evaluate(()=>[document.querySelectorAll('.daybar').length,document.querySelectorAll('#coop-status').length]),[0,0]);
    assert.equal(service.rooms.get(code).state.difficulty,'hell');assert.deepEqual(errors,[]);
    const local=await context.newPage();await local.goto(address);await local.locator('#start-single').click();await local.locator('input[name="single-difficulty"][value="hard"]').check();await local.locator('#single-start').click();await local.locator('[data-choice="thunder"]').click();
    assert.equal(await local.locator('.topbar > #menu-pause').count(),1);assert.equal(await local.locator('.daybar').count(),0);
    const oldSeed=await local.evaluate(()=>Gufang.state.mapSeed);await local.locator('#menu-pause').click();assert.equal(await local.locator('#modal-content p',{hasText:'难度 困难'}).count(),1);
    await local.locator('[data-modal="reset"]').click();await local.locator('[data-modal="new"]').click();await local.waitForFunction(seed=>Gufang.state.mapSeed!==seed,oldSeed);assert.equal(await local.evaluate(()=>Gufang.state.difficulty),'hard');
    console.log('PASS difficulty browser: host selection, guest sync, locked settings and authoritative start');
  }finally{await browser.close();await service.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
