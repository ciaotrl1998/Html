'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const launch = { executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true };
  // Separate processes, local HTML files, no HTTP or signaling server.
  const hostBrowser = await chromium.launch(launch), guestBrowser = await chromium.launch(launch);
  try {
    const host = await hostBrowser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const guest = await guestBrowser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    const errors = [], requests = [];
    for (const page of [host, guest]) { page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); }); }
    await Promise.all([host.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href), guest.goto(pathToFileURL(path.join(__dirname, '..', 'dist/古坊奇谭.html')).href)]);
    for (const page of [host, guest]) { await page.waitForFunction(() => !!window.Gufang); await page.locator('#start-coop').click(); await page.locator('#lan-controls summary').click(); }
    await host.locator('#direct-create').click();
    await host.waitForFunction(() => document.getElementById('direct-output').value.startsWith('GF-DIRECT-1:') && !document.getElementById('direct-qr').hidden);
    const invite = await host.locator('#direct-output').inputValue();
    const shots = path.join(os.tmpdir(),'gufang-screenshots'); fs.mkdirSync(shots,{recursive:true});
    await host.locator('#direct-output-area').screenshot({path:path.join(shots,'direct-invite.png')});
    assert(await host.evaluate(code => GFDirect.unpack(code).sdp.includes('typ host'), invite));
    await guest.locator('#direct-join').click();
    await guest.locator('#direct-input').fill('123456'); await guest.locator('#direct-apply').click();
    assert.match(await guest.locator('#direct-status').textContent(), /配对码无效/);
    const inviteQR = await host.locator('#direct-qr').getAttribute('src');
    await guest.locator('#direct-file').setInputFiles({ name: 'invite.png', mimeType: 'image/png', buffer: Buffer.from(inviteQR.split(',')[1], 'base64') });
    await guest.waitForFunction(() => document.getElementById('direct-output').value.startsWith('GF-DIRECT-1:') && !document.getElementById('direct-qr').hidden);
    const answer = await guest.locator('#direct-output').inputValue();
    assert.equal(await guest.evaluate(code => GFDirect.unpack(code).type, answer), 'answer');
    await host.locator('#direct-input').fill(invite); await host.locator('#direct-apply').click();
    assert.match(await host.locator('#direct-status').textContent(), /不匹配/);
    const answerQR = await guest.locator('#direct-qr').getAttribute('src');
    await host.locator('#direct-file').setInputFiles({ name: 'answer.png', mimeType: 'image/png', buffer: Buffer.from(answerQR.split(',')[1], 'base64') });
    await Promise.all([host.waitForFunction(() => Gufang.online?.peerConnected), guest.waitForFunction(() => Gufang.online?.peerConnected)]);
    assert(await host.locator('#coop-start').isEnabled());
    await host.locator('#coop-start').click();
    await guest.waitForFunction(() => Gufang.state.mode === 'coop' && document.getElementById('coop-lobby').hidden);
    assert.equal(await guest.evaluate(() => Gufang.online.kind), 'direct');
    assert.equal(await guest.evaluate(() => Gufang.state.mapSeed), await host.evaluate(() => Gufang.state.mapSeed));
    assert.equal(await guest.evaluate(() => Gufang.partnerReport), null);
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
    await host.waitForFunction(old => document.getElementById('direct-output').value.startsWith('GF-DIRECT-1:') && document.getElementById('direct-output').value !== old, invite);
    const reconnectInvite = await host.locator('#direct-output').inputValue();
    const rejoined = await guestBrowser.newPage({viewport:{width:390,height:844}});
    rejoined.on('pageerror',e=>errors.push(e.message));
    await rejoined.goto(pathToFileURL(path.join(__dirname,'..','dist/古坊奇谭.html')).href);
    await rejoined.locator('#start-coop').click(); await rejoined.locator('#lan-controls summary').click(); await rejoined.locator('#direct-join').click();
    await rejoined.locator('#direct-input').fill(reconnectInvite); await rejoined.locator('#direct-apply').click();
    await rejoined.waitForFunction(()=>document.getElementById('direct-output').value.startsWith('GF-DIRECT-1:'));
    await host.locator('#direct-input').fill(answer); await host.locator('#direct-apply').click();
    assert.match(await host.locator('#direct-status').textContent(),/不匹配/,'Old pairing answer cannot enter the new connection');
    await host.locator('#direct-input').fill(await rejoined.locator('#direct-output').inputValue()); await host.locator('#direct-apply').click();
    await rejoined.waitForFunction(seed=>Gufang.state.mode==='coop' && Gufang.state.mapSeed===seed && document.getElementById('coop-lobby').hidden,seed);
    assert(await rejoined.evaluate(p=>Gufang.state.buildings.some(b=>b.owner===1&&b.x===p.x&&b.y===p.y),target),'Re-pair retains guest buildings');
    assert(await host.locator('#coop-lobby').isHidden());
    assert.deepEqual(errors,[]); assert.deepEqual(requests,[],'Offline direct mode makes no HTTP requests');
    console.log('PASS serverless WebRTC: separate browsers, local files, QR invite/answer, invalid/stale codes, ownership, build, combat, skills, disconnect pause, re-pair without losing progress, no HTTP requests');
  } finally { await hostBrowser.close(); await guestBrowser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
