'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const {createServer}=require('../server'),G=require('../js/game');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{pathToFileURL}=require('node:url');
const shots=path.join(os.tmpdir(),'gufang-attack-shots');fs.mkdirSync(shots,{recursive:true});
(async()=>{
 const service=createServer();await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
 const address='http://127.0.0.1:'+service.server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[];
 const context=async(options={})=>{const c=await browser.newContext(options);c.on('page',p=>p.on('pageerror',e=>errors.push(e.stack)));return c;};
 try{
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:1366,height:768}]){
   const c=await context({viewport,deviceScaleFactor:1,isMobile:viewport.width<500,hasTouch:viewport.width<500});
   await c.addInitScript(()=>{localStorage.setItem('gufang-qitan-save-v1','old');localStorage.setItem('gufang-qitan-save-v1-backup','backup');});
   const p=await c.newPage();await p.goto(address);
   assert.deepEqual(await p.evaluate(()=>[localStorage.getItem('gufang-qitan-save-v1'),localStorage.getItem('gufang-qitan-save-v1-backup')]),[null,null]);
   await p.locator('#single-enemies').selectOption('4');await p.locator('#start-single').click();await p.locator('[data-choice="thunder"]').click();
   assert.equal(await p.evaluate(()=>Gufang.state.enemyCount),4);
   const skill=p.locator('[data-skill="thunder"]'),before=await skill.boundingBox();assert(before);
   const plot=await p.evaluate(()=>{const s=Gufang.state,v=GF.playerView(s),h=GF.estate(v).center;const k=[...GF.estate(v).cells].map(k=>({x:k%s.worldSize,y:Math.floor(k/s.worldSize)})).filter(p=>!GF.buildReason(v,'tea',p.x,p.y)).sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y))[0];Gufang.select(k.x,k.y);return k;});
   await p.locator('#panel').waitFor({state:'visible'});const after=await skill.boundingBox();assert(Math.abs(before.x-after.x)<.1&&Math.abs(before.y-after.y)<.1,'panel never pushes the skill');
   await p.screenshot({path:path.join(shots,'panel-'+viewport.width+'.png')});
   await p.locator('[data-build="tea"]').click();await p.waitForFunction(({x,y})=>GF.at(Gufang.state,x,y)?.type==='tea',plot);
   assert(await p.locator('#panel').isHidden());
   await p.evaluate(()=>{const b=Gufang.state.buildings.find(b=>b.owner===1&&b.type==='shrine');Gufang.select(b.x,b.y);});
   assert(await p.locator('#upgrade-building').isHidden());assert(await p.locator('#demolish-building').isHidden());
   await p.locator('#close-panel').click();await p.locator('#menu-pause').click();const pausedAt=await p.evaluate(()=>Gufang.state.elapsed);await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>Gufang.state.elapsed),pausedAt);
   await p.locator('[data-modal="save"]').click();const stored=await p.evaluate(()=>localStorage.getItem('gufang-qitan-match-v8'));assert(G.restore(stored));
   await p.reload();await p.locator('#start-load').click();assert.equal(await p.evaluate(()=>Gufang.state.enemyCount),4);
   await c.close();console.log('PASS responsive play / fixed skill / read-only enemy / save '+viewport.width);
  }
  // Maximum map: actual offline file, all units rendered, bounded terrain canvases.
  {
   const c=await context({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),p=await c.newPage();
   await p.goto(pathToFileURL(path.join(__dirname,'../dist/古坊奇谭.html')).href);await p.locator('#start-coop').click();await p.locator('#coop-seat').click();await p.locator('#coop-enemies').selectOption('6');await p.locator('#coop-start').click();await p.locator('[data-choice="repair"]').click();
   assert.equal(await p.evaluate(()=>Gufang.state.players.length),8);
   const stats=await p.evaluate(async()=>{
    Gufang.setPaused(true);document.getElementById('modal').hidden=true;await new Promise(requestAnimationFrame);
    const s=Gufang.state;for(const estate of GF.estate(s).estates)for(let i=0;i<120;i++)s.soldiers.push({id:s.nextId++,owner:estate.owner,x:estate.center.x+(i%5)*.12,y:estate.center.y+Math.floor(i/5)*.04,hp:120,maxHp:120,repelled:0,slowed:0});
    const canvas=document.getElementById('map'),zoom=Math.min(350/(s.worldSize*64),620/(s.worldHeight*64));
    const camera={x:(390-s.worldSize*64*zoom)/2,y:155,zoom};
    const times=[];for(let i=0;i<40;i++){const start=performance.now();GFArt.render(canvas,s,camera,null,{player:0,animationTime:i/30});times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);return {...GFArt.cacheStats(),renderP95:times[38]};
   });
   console.log('Render measurements '+JSON.stringify(stats));assert(stats.largestSide<=1120);assert(stats.chunks<=40);assert(stats.renderP95<100);console.log('PASS offline 8-estate 960-unit render');
   await p.screenshot({path:path.join(shots,'eight-estates.png')});await c.close();
  }
  // Two independent clients, server-owned settings and simulation.
  {
   const hc=await context({viewport:{width:390,height:844}}),gc=await context({viewport:{width:390,height:844}}),host=await hc.newPage(),guest=await gc.newPage();
   await Promise.all([host.goto(address),guest.goto(address)]);
   await host.locator('#start-coop').click();await host.locator('#coop-enemies').selectOption('4');await host.locator('#coop-host').click();await host.waitForFunction(()=>Gufang.online?.code);
   const code=await host.evaluate(()=>Gufang.online.code);await guest.locator('#start-coop').click();await guest.locator('#coop-code').fill(code);await guest.locator('#coop-join').click();await guest.waitForFunction(()=>Gufang.online?.peerConnected);
   assert.equal(await guest.locator('#coop-enemies').inputValue(),'4');assert(await guest.locator('#coop-enemies').isDisabled());
   await host.locator('#coop-enemies').selectOption('6');await guest.waitForFunction(()=>document.getElementById('coop-enemies').value==='6');
   await host.locator('#coop-start').click();await host.locator('[data-choice="repair"]').click();await guest.locator('[data-choice="repel"]').click();
   await host.waitForFunction(()=>Gufang.state.elapsed>.2);const room=service.rooms.get(code);assert.equal(room.state.players.length,8);
   const saved=G.serialize(room.state);assert(G.restore(saved));
   await guest.locator('[data-skill="repel"]').click();await host.waitForTimeout(150);assert(room.state.players[1].cooldowns.repel>0);assert.equal(room.state.players[0].cooldowns.repel,0);
   await host.locator('#menu-pause').click();await host.waitForTimeout(150);const frozen=room.state.elapsed;await host.waitForTimeout(150);assert.equal(room.state.elapsed,frozen);await host.locator('[data-modal="close"]').click();
   const dead=room.state.buildings.find(b=>b.owner===0&&b.type==='shrine');dead.hp=1;dead.lastHit=room.state.elapsed;
   room.state.soldiers.push({id:room.state.nextId++,owner:2,barracksId:9999,x:dead.x,y:dead.y-1,hp:120,maxHp:120,level:1,baseDamage:1e6,attack:0,targetOwner:0,targetId:null,repelled:0,slowed:0,slowFactor:1,waypoint:null});
   await host.waitForFunction(()=>Gufang.state.players[0].eliminated);await guest.waitForFunction(()=>Gufang.state.players[0].eliminated);
   assert(!room.state.over);assert(await host.locator('#skills').isHidden());const moving=room.state.elapsed;await host.locator('#menu-pause').click();await host.waitForTimeout(200);assert(room.state.elapsed>moving,'eliminated spectator menu does not pause survivors');
   await host.locator('[data-modal="reset"]').click();await host.locator('[data-modal="new"]').click();await host.locator('[data-choice="thunder"]').waitFor();await guest.locator('[data-choice="repair"]').waitFor();assert.equal(room.state.enemyCount,6);assert(room.state.players.every(p=>!p.eliminated));
   await hc.close();await gc.close();console.log('PASS LAN settings / skills / pause / elimination / restart');
  }
  assert.deepEqual(errors,[]);console.log('Screenshots: '+shots);
 }finally{await browser.close();await service.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
