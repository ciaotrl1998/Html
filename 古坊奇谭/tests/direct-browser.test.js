'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root=path.join(__dirname,'..'),sourceOnly=process.argv.includes('--source-only')||!!process.env.GUFANG_SOURCE_ONLY;
async function sourceContext(context){
  // Retain the bundled WebRTC dependency without rebuilding the game runtime.
  const runtime=fs.readFileSync(path.join(root,'js/runtime.js'),'utf8'),direct=runtime.slice(0,runtime.indexOf('\nvar __defProp'));
  assert(direct.includes('GFDirect'),'Existing runtime contains the direct dependency bundle');
  await context.route('**/js/runtime.js',route=>route.fulfill({contentType:'application/javascript',body:direct+'\n;\n'+['game','art','autoplay','app'].map(name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8')).join('\n;\n')}));
}

(async () => {
  const launch = { executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true };
  // Separate processes, local HTML files, no HTTP or signaling server.
  const hostBrowser = await chromium.launch(launch), guestBrowser = await chromium.launch(launch);
  try {
    const host = await hostBrowser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const guest = await guestBrowser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    const errors = [], requests = [];
    for(const page of [host,guest]) await sourceContext(page.context());
    for (const page of [host, guest]) { page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); }); }
    await Promise.all([host.goto(pathToFileURL(path.join(root, 'index.html')).href), guest.goto(pathToFileURL(path.join(root, sourceOnly?'index.html':'dist/古坊奇谭.html')).href)]);
    for (const page of [host, guest]) { await page.waitForFunction(() => !!window.Gufang); await page.locator('#start-coop').click(); }
    // Host generates an invite code into the shared text box; no QR or scanning is involved.
    await host.locator('#coop-host').click();
    await host.waitForFunction(() => document.getElementById('coop-code').value.startsWith('GF-DIRECT-1:'));
    const invite = await host.locator('#coop-code').inputValue();
    const shots = path.join(os.tmpdir(),'gufang-screenshots'); fs.mkdirSync(shots,{recursive:true});
    await host.locator('.coop-connect').screenshot({path:path.join(shots,'direct-invite.png')});
    assert(await host.evaluate(code => GFDirect.unpack(code).sdp.includes('typ host'), invite));
    // Invalid text is rejected before any peer connection is created.
    await guest.locator('#coop-code').fill('123456'); await guest.locator('#coop-join').click();
    await guest.waitForFunction(() => document.getElementById('toast').textContent.includes('邀请码'));
    assert.equal(await guest.evaluate(() => Gufang.online), null, 'Invalid pairing text does not start a session');
    // Copy stores the box text and paste restores it into the box.
    await guest.evaluate(() => { window.__clip = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__clip = String(t); }, readText: async () => window.__clip } }); });
    await guest.locator('#coop-code').fill(invite);
    await guest.locator('#coop-copy').click();
    await guest.locator('#coop-code').fill('x');
    await guest.locator('#coop-paste').click();
    assert.equal(await guest.locator('#coop-code').inputValue(), invite, 'Paste restores the copied pairing code');
    // Guest pastes the invite and produces an answer code.
    await guest.locator('#coop-join').click();
    await guest.waitForFunction(old => { const value = document.getElementById('coop-code').value; return value.startsWith('GF-DIRECT-1:') && value !== old; }, invite);
    const answer = await guest.locator('#coop-code').inputValue();
    assert.equal(await guest.evaluate(code => GFDirect.unpack(code).type, answer), 'answer');
    // Host pastes the answer; the input listener completes the handshake automatically.
    await host.locator('#coop-code').fill(answer);
    await Promise.all([host.waitForFunction(() => Gufang.online?.peerConnected), guest.waitForFunction(() => Gufang.online?.peerConnected)]);
    assert(await host.locator('#coop-start').isEnabled());
    await host.locator('#coop-start').click();
    await guest.waitForFunction(() => Gufang.state.mode === 'coop' && document.getElementById('coop-lobby').hidden);
    assert.equal(await guest.evaluate(() => Gufang.online.kind), 'direct');
    assert.equal(await guest.evaluate(() => Gufang.state.mapSeed), await host.evaluate(() => Gufang.state.mapSeed));
    assert.equal(await guest.evaluate(() => Gufang.partnerReport), null);
    for(const page of [host,guest]) {
      await page.locator('[data-choice="thunder"]').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(),3);
      assert(await page.locator('#close-modal').isHidden());
      await page.keyboard.press('Escape');
      await page.locator('#modal').click({position:{x:1,y:1}});
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(),3);
    }
    assert.deepEqual(await host.evaluate(()=>[Gufang.state.selectedSkill,Gufang.state.partner.selectedSkill]),[null,null]);
    await host.locator('[data-choice="thunder"]').click();
    await guest.evaluate(()=>{
      window.skillAtModalClose=[];
      new MutationObserver(()=>{if(document.getElementById('modal').hidden)skillAtModalClose.push(Gufang.state.partner.selectedSkill);}).observe(document.getElementById('modal'),{attributes:true,attributeFilter:['hidden']});
    });
    await guest.locator('[data-choice="repel"]').click();
    await host.waitForFunction(()=>Gufang.state.partner.selectedSkill==='repel');
    await guest.waitForFunction(()=>Gufang.state.partner.selectedSkill==='repel');
    await guest.locator('#modal').waitFor({state:'hidden'});
    assert.deepEqual(await guest.evaluate(()=>skillAtModalClose),['repel'],'Guest closes only after its confirmed skill arrives');
    assert.equal(await host.evaluate(()=>Gufang.state.selectedSkill),'thunder');
    await host.evaluate(()=>{Gufang.state.partner.coins=Gufang.state.partner.materials=1000;});
    await guest.waitForFunction(()=>Gufang.state.partner.materials>=1000);
    const target = await guest.evaluate(() => {
      const s = Gufang.state, mine = GF.playerView(s, 1);
      for(let y=0;y<GF.worldHeight(s);y++)for(let x=0;x<GF.worldWidth(s);x++) if(!GF.buildReason(mine,'tower',x,y)) { Gufang.select(x,y); return {x,y}; }
    });
    assert(target); await guest.locator('[data-build="tower"]').click();
    await host.waitForFunction(p => Gufang.state.buildings.some(b => b.x===p.x && b.y===p.y && b.owner===1 && b.type==='tower'), target);
    await guest.waitForFunction(p => Gufang.state.buildings.some(b => b.x===p.x && b.y===p.y && b.owner===1 && b.type==='tower'), target);
    await host.locator('#menu-pause').click();
    await host.evaluate(() => { const s=Gufang.state; while(s.phase!=='night') GF.step(s,.25); for(let i=0;i<30;i++)GF.step(s,.1); });
    await guest.waitForFunction(() => Gufang.state.phase==='night' && Gufang.state.enemies.length>0);
    await guest.evaluate(()=>{const render=GFArt.render;window.directVisuals={effect:false,smooth:false};GFArt.render=(canvas,s,cam,selected,options)=>{if(options.effects?.some(e=>e.type==='repel'))directVisuals.effect=true;for(const e of s.enemies){const p=options.unitPosition?.(e,false);if(p&&Math.hypot(p.x-e.x,p.y-e.y)>0.0001)directVisuals.smooth=true;}return render(canvas,s,cam,selected,options);};});
    await guest.locator('[data-skill="repel"]').click();
    await host.waitForFunction(() => Gufang.state.partner.cooldowns.repel>0);
    await guest.waitForFunction(()=>directVisuals.effect);
    assert.equal(await guest.evaluate(() => localStorage.getItem('gufang-qitan-save-v1')), null, 'Guest does not overwrite local saves');
    await guest.screenshot({path:path.join(shots,'direct-guest-320.png')});
    await host.locator('[data-modal="close"]').click();
    await host.evaluate(()=>{for(const e of Gufang.state.enemies)e.repelled=0;});
    await guest.waitForFunction(()=>directVisuals.smooth);
    await guest.close();
    await host.waitForFunction(() => !Gufang.online.peerConnected);
    const elapsed = await host.evaluate(() => Gufang.state.elapsed);
    await host.waitForTimeout(350);
    assert.equal(await host.evaluate(() => Gufang.state.elapsed),elapsed,'Host pauses after peer disconnects');
    const seed = await host.evaluate(() => Gufang.state.mapSeed);
    await host.locator('#menu-pause').click();
    await host.locator('[data-modal="direct-repair"]').click();
    await host.waitForFunction(old => document.getElementById('coop-code').value.startsWith('GF-DIRECT-1:') && document.getElementById('coop-code').value !== old, invite);
    const reconnectInvite = await host.locator('#coop-code').inputValue();
    const rejoined = await guestBrowser.newPage({viewport:{width:390,height:844}});
    await sourceContext(rejoined.context());
    rejoined.on('pageerror',e=>errors.push(e.message));
    await rejoined.goto(pathToFileURL(path.join(root,sourceOnly?'index.html':'dist/古坊奇谭.html')).href);
    await rejoined.locator('#start-coop').click();
    await rejoined.locator('#coop-code').fill(reconnectInvite); await rejoined.locator('#coop-join').click();
    await rejoined.waitForFunction(old => { const value = document.getElementById('coop-code').value; return value.startsWith('GF-DIRECT-1:') && value !== old; }, reconnectInvite);
    await host.locator('#coop-code').fill(await rejoined.locator('#coop-code').inputValue());
    await rejoined.waitForFunction(seed=>Gufang.state.mode==='coop' && Gufang.state.mapSeed===seed && document.getElementById('coop-lobby').hidden,seed);
    assert(await rejoined.evaluate(p=>Gufang.state.buildings.some(b=>b.owner===1&&b.x===p.x&&b.y===p.y),target),'Re-pair retains guest buildings');
    assert.equal(await rejoined.evaluate(()=>Gufang.state.partner.selectedSkill),'repel','Re-pair preserves the confirmed skill');
    assert(await rejoined.locator('#modal').isHidden());
    assert(await host.locator('#coop-lobby').isHidden());
    assert.deepEqual(errors,[]); assert.deepEqual(requests,[],'Offline direct mode makes no HTTP requests');
    console.log('PASS serverless WebRTC: separate browsers, local files, pasted pairing codes, invalid codes, ownership, build, combat, skills, disconnect pause, re-pair without losing progress, no HTTP requests');
  } finally { await hostBrowser.close(); await guestBrowser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
