'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../server');
const G = require('../js/game');
const fs=require('node:fs'),path=require('node:path');

(async () => {
  const service = createServer();
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${service.server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    const hostContext = await browser.newContext(phone);
    const guestContext = await browser.newContext(phone);
    const host = await hostContext.newPage(), guest = await guestContext.newPage(), errors = [];
    const choices=[]; let motionFrames=0, snapshots=0;
    guest.on('websocket',socket=>{
      socket.on('framesent',({payload})=>{
        const message=JSON.parse(String(payload));
        if(message.type==='action'&&message.kind==='choose-skill')choices.push(message);
      });
      socket.on('framereceived',({payload})=>{ try { const message=JSON.parse(String(payload));if(message.type==='delta')motionFrames++;if(message.type==='snapshot')snapshots++;assert.notEqual(message.type,'state'); } catch { /* Ignore non-JSON frames. */ } });
    });
    for(const context of [hostContext,guestContext]) await context.route('**/js/runtime.js',route=>route.fulfill({contentType:'application/javascript',body:['game','network','art','autoplay','app'].map(name=>fs.readFileSync(path.join(__dirname,'..','js',name+'.js'),'utf8')).join('\n;\n')}));
    host.on('pageerror', error => errors.push('host: ' + error.message));
    guest.on('pageerror', error => errors.push('guest: ' + error.message));
    await Promise.all([host.goto(address), guest.goto(address)]);
    await Promise.all([host.waitForFunction(() => !!window.Gufang), guest.waitForFunction(() => !!window.Gufang)]);
    await host.locator('#start-coop').click();
    await host.locator('#coop-host').click();
    await host.waitForFunction(() => /^\d{6}$/.test(Gufang.online?.code || ''));
    const code = await host.evaluate(() => Gufang.online.code);
    const room = service.rooms.get(code);
    assert.equal(await host.locator('#coop-code').inputValue(), code, 'Host shows the six-digit room code');
    assert(await host.locator('#coop-code').evaluate(el => el.readOnly), 'Host room code is read-only');
    await guest.locator('#start-coop').click();
    await guest.locator('#coop-code').fill(code);
    await guest.locator('#coop-join').click();
    await host.waitForFunction(() => Gufang.online?.peerConnected);
    assert(await guest.locator('#coop-code').evaluate(el => el.readOnly), 'Guest code locks once joined');
    assert(await host.locator('#coop-start').isEnabled());
    await host.locator('#coop-start').click();
    await guest.waitForFunction(() => Gufang.state.mode === 'coop' && Gufang.online?.role === 'guest');
    for(const page of [host,guest]) {
      await page.locator('[data-choice="thunder"]').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(),3);
      assert(await page.locator('#close-modal').isHidden());
      await page.keyboard.press('Escape');
      await page.locator('#modal').click({position:{x:1,y:1}});
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(),3);
    }
    assert.deepEqual(await host.evaluate(()=>[Gufang.state.selectedSkill,Gufang.state.partner.selectedSkill]),[null,null]);
    assert.equal(choices.length,0,'Guest does not select automatically');
    await host.locator('[data-choice="thunder"]').click();
    await guest.evaluate(()=>{
      window.skillAtModalClose=[];
      new MutationObserver(()=>{if(document.getElementById('modal').hidden)skillAtModalClose.push(Gufang.state.partner.selectedSkill);}).observe(document.getElementById('modal'),{attributes:true,attributeFilter:['hidden']});
    });
    await guest.locator('[data-choice="repel"]').click();
    try { await host.waitForFunction(()=>Gufang.state.partner.selectedSkill==='repel',{},{timeout:5000}); }
    catch(error) { throw new Error('LAN guest opening skill was not accepted: '+JSON.stringify({sent:choices,state:await host.evaluate(()=>({hostSkill:Gufang.state.selectedSkill,guestSkill:Gufang.state.partner.selectedSkill,elapsed:Gufang.state.elapsed}))})+'; '+error.message); }
    assert(choices.some(message=>message.skill==='repel'),'Guest sends its modal choice through the network');
    await guest.waitForFunction(()=>Gufang.state.partner.selectedSkill==='repel');
    await guest.locator('#modal').waitFor({state:'hidden'});
    assert.deepEqual(await guest.evaluate(()=>skillAtModalClose),['repel'],'Guest closes only after its confirmed skill arrives');
    assert.equal(await host.evaluate(()=>Gufang.state.selectedSkill),'thunder');
    assert.deepEqual([room.state.selectedSkill,room.state.partner.selectedSkill],['thunder','repel']);
    for(const page of [host,guest])await page.evaluate(()=>{
      window.liveState=Gufang.state;
      window.liveEstate=GF.estate(Gufang.state);
      window.liveShrine=Gufang.state.buildings.find(b=>b.type==='shrine');
      window.combatCalls=0;const original=GF.step;GF.step=function(...args){combatCalls++;return original(...args);};
      window.hintCalls=0;const hints=GF.buildHints;GF.buildHints=function(...args){hintCalls++;return hints(...args);};
    });
    const initialSnapshots=snapshots;
    await guest.waitForTimeout(1100);
    assert.equal(snapshots,initialSnapshots,'Running clients do not receive periodic full snapshots');
    for(const page of [host,guest]){
      assert(await page.evaluate(()=>liveState===Gufang.state&&liveEstate===GF.estate(Gufang.state)&&liveShrine===Gufang.state.buildings.find(b=>b.type==='shrine')),'Incremental updates preserve state, estate and building identity');
      assert.equal(await page.evaluate(()=>combatCalls),0,'Both host and guest are display clients');
      assert.equal(await page.evaluate(()=>hintCalls),0,'Motion and income updates reuse build hints');
    }
    assert.equal(await host.evaluate(()=>Gufang.state.partner.coins),0,'Host receives no guest balance');
    assert.equal(await guest.evaluate(()=>Gufang.state.coins),0,'Guest receives no host balance');
    const hostBuild=await host.evaluate(()=>{
      const s=Gufang.state,p=GF.playerView(s,0);
      for(const key of GF.estate(p).cells){const x=key%GF.worldWidth(s),y=Math.floor(key/GF.worldWidth(s));if(!GF.buildReason(p,'tower',x,y))return{x,y};}
    });
    assert(hostBuild,'Host also has a buildable tile');
    const predicted=await host.evaluate(({x,y})=>{
      Gufang.select(x,y);document.querySelector('[data-build="tower"]').click();return GF.at(Gufang.state,x,y).id;
    },hostBuild);
    assert(predicted<0,'Host responds locally before server confirmation');
    await guest.waitForFunction(({x,y})=>Gufang.state.buildings.some(b=>b.owner===0&&b.type==='tower'&&b.x===x&&b.y===y&&b.id>0),hostBuild);
    await host.locator('#menu-pause').click();
    await guest.waitForFunction(()=>document.getElementById('coop-action').textContent.includes('暂停'));
    room.state.partner.coins=room.state.partner.materials=1000;service.publish(room,true);
    await guest.waitForFunction(()=>Gufang.state.partner.materials>=1000);
    const hostMap = await host.evaluate(() => ({ seed: Gufang.state.mapSeed, width: GF.worldWidth(Gufang.state), height: GF.worldHeight(Gufang.state) }));
    const guestMap = await guest.evaluate(() => ({ seed: Gufang.state.mapSeed, width: GF.worldWidth(Gufang.state), height: GF.worldHeight(Gufang.state) }));
    assert.deepEqual(guestMap, hostMap);
    const target = await guest.evaluate(() => {
      const s = Gufang.state, mine = GF.playerView(s, 1);
      for (let y = 0; y < GF.worldHeight(s); y++) for (let x = 0; x < GF.worldWidth(s); x++)
        for (const type of ['tea', 'tower', 'mulberry', 'quarry']) if (!GF.buildReason(mine, type, x, y)) return { x, y, type };
      return null;
    });
    assert(target, 'Guest estate has a buildable tile');
    await guest.evaluate(()=>{
      window.heldActions=[];window.checkpoints=0;
      const create=GFNetwork.createReplica;GFNetwork.createReplica=function(...args){checkpoints++;return create(...args);};
      const send=WebSocket.prototype.send;window.releaseActions=()=>{for(const [socket,raw] of heldActions)send.call(socket,raw);};
      WebSocket.prototype.send=function(raw){
        const message=JSON.parse(raw);
        if(message.type==='action'){heldActions.push([this,raw]);return;}
        return send.call(this,raw);
      };
      window.resumeSending=()=>{WebSocket.prototype.send=send;releaseActions();};
    });
    await guest.evaluate(({ x, y }) => Gufang.select(x, y), target);
    await guest.locator(`[data-build="${target.type}"]`).click();
    await guest.evaluate(()=>heldActions[0][0].send(JSON.stringify({type:'resync'})));
    await guest.waitForFunction(()=>checkpoints===1);
    assert(await guest.evaluate(({x,y})=>GF.at(Gufang.state,x,y)?.id<0,target),'Recovery keeps unconfirmed predictions');
    await guest.evaluate(()=>{
      const s=Gufang.state,p=GF.playerView(s,1);
      for(const key of GF.estate(p).cells){const x=key%GF.worldWidth(s),y=Math.floor(key/GF.worldWidth(s));if(!GF.buildReason(p,'tower',x,y)){Gufang.select(x,y);document.querySelector('[data-build="tower"]').click();break;}}
    });
    const submitted=await guest.evaluate(()=>heldActions.map(([,raw])=>JSON.parse(raw).id));
    assert.equal(submitted.length,2);assert(submitted[1]>submitted[0],'Recovery never reuses an outstanding action ID');
    await guest.evaluate(()=>resumeSending());
    await host.waitForFunction(({ x, y }) => Gufang.state.buildings.some(b => b.owner === 1 && b.x === x && b.y === y), target);
    await guest.waitForFunction(({ x, y }) => Gufang.state.buildings.some(b => b.owner === 1 && b.x === x && b.y === y), target);
    await guest.waitForFunction(()=>Gufang.state.buildings.every(b=>b.id>0));
    await host.evaluate(({ x, y }) => Gufang.select(x, y), target);
    assert(await host.locator('#panel').isHidden(), 'Host cannot edit the guest estate');
    const guestFunds = await guest.evaluate(() => [Gufang.state.partner.coins, Gufang.state.partner.materials]);
    const hostFunds = [room.state.partner.coins,room.state.partner.materials];
    assert.deepEqual(guestFunds, hostFunds);
    room.state.partner.coins=room.state.partner.materials=10000;
    const shrine=room.state.buildings.find(b=>b.owner===1&&b.type==='shrine');shrine.level=2;shrine.hp=G.maxHP(shrine);service.publish(room,true);
    await guest.waitForFunction(() => Gufang.state.partner.coins === 10000 && Gufang.state.buildings.some(b => b.owner === 1 && b.type === 'shrine' && b.level === 2));
    await guest.evaluate(({ x, y }) => Gufang.select(x, y), target);
    await guest.locator('#upgrade-building').click();
    await host.waitForFunction(({ x, y }) => Gufang.state.buildings.some(b => b.owner === 1 && b.x === x && b.y === y && b.level === 2), target);
    await guest.locator('#demolish-building').click();
    await guest.locator('[data-modal="confirm-demolish"]').click();
    await host.waitForFunction(({ x, y }) => !Gufang.state.buildings.some(b => b.owner === 1 && b.x === x && b.y === y), target);
    const elapsed = room.state.elapsed;
    await host.waitForTimeout(350);
    assert.equal(room.state.elapsed, elapsed);
    G.startNight(room.state);room.state.wave.timer=0;G.step(room.state,.1);service.publish(room,true);
    await guest.waitForFunction(() => Gufang.state.phase === 'night');
    await guest.locator('[data-skill="repel"]').click();
    await guest.waitForFunction(() => Gufang.state.partner.cooldowns.repel > 0);
    assert(room.state.partner.cooldowns.repel>0);
    for(const page of [host,guest])await page.waitForFunction(()=>Gufang.state.enemies.length===2&&Gufang.state.enemies.every(e=>e.repelled>0));
    await host.locator('[data-modal="close"]').click();
    await guest.reload();
    await host.waitForFunction(() => Gufang.online && !Gufang.online.peerConnected);
    await guest.locator('#start-coop').click();
    await guest.locator('#coop-code').fill(code);
    await guest.locator('#coop-join').click();
    await guest.waitForFunction(() => Gufang.state.mode === 'coop' && Gufang.online?.peerConnected);
    assert.equal(await guest.evaluate(()=>Gufang.state.partner.selectedSkill),'repel');
    assert(await guest.locator('#modal').isHidden(),'Reconnect preserves the confirmed skill');
    assert(await host.evaluate(() => Gufang.online.peerConnected));
    const motionBefore = motionFrames;
    await guest.waitForTimeout(1000);
    assert(motionFrames - motionBefore >= 6, 'Guest receives incremental battle frames from the server');
    assert.equal(await host.evaluate(()=>combatCalls),0,'Host still does not simulate combat');
    const serverBefore=room.state.elapsed;
    await host.evaluate(()=>{
      const channel=new MessageChannel();channel.port1.onmessage=()=>{const end=performance.now()+600;while(performance.now()<end){};};channel.port2.postMessage(0);
    });
    await guest.waitForTimeout(250);
    assert(room.state.elapsed>serverBefore+.15,'Server advances while the host browser main thread is blocked');
    await host.waitForTimeout(700);
    await host.locator('#menu-pause').click();
    await host.locator('[data-modal="save"]').click();
    await host.waitForFunction(()=>!!localStorage.getItem('gufang-qitan-save-v1'));
    const save=await host.evaluate(()=>localStorage.getItem('gufang-qitan-save-v1'));assert(G.restore(save),'Explicit saves contain the full authoritative state');
    await host.locator('[data-modal="reset"]').click();
    await host.locator('[data-modal="new"]').click();
    await host.waitForFunction(seed=>Gufang.state.mapSeed!==seed,hostMap.seed);
    const newSeed = await host.evaluate(() => Gufang.state.mapSeed);
    await guest.waitForFunction(seed => Gufang.state.mapSeed === seed && Gufang.state.day === 1, newSeed);
    await host.locator('[data-choice="thunder"]').click();
    await guest.locator('[data-choice="repel"]').click();
    await guest.waitForFunction(()=>Gufang.state.partner.selectedSkill==='repel');
    await guest.locator('#modal').waitFor({state:'hidden'});
    await host.locator('#menu-pause').click();
    await host.locator('[data-modal="title"]').click();
    await guest.waitForFunction(() => !Gufang.online && !document.getElementById('start-menu').hidden);
    assert.deepEqual(errors, []);
    console.log('PASS LAN browser: server authority, both-client prediction, private economy, stable incremental caches, pending-action recovery, skills, pause, blocked host, save, reconnect, restart');
  } finally {
    await browser.close();
    await service.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
