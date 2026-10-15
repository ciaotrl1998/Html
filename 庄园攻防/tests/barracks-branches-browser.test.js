'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {createServer}=require('../server');
const G=require('../js/game');
const root=path.resolve(__dirname,'..');

function prepareBarracks(s,owner){
  const p=G.playerView(s,owner);p.coins=p.materials=1e12;p.gateLevel=15;
  for(const b of p.buildings)if(b.type==='shrine'||b.type==='gate'){b.level=15;b.hp=G.maxHP(b);}
  for(const k of G.estate(p).cells){const x=k%s.worldSize,y=Math.floor(k/s.worldSize);if(!G.at(s,x,y)&&G.terrain(x,y,s)!=='water'){const b=G.grantBuilding(p,'barracks',x,y,1);if(b)return b;}}
  throw Error('No plot');
}

(async()=>{
  const service=createServer();await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const address=`http://127.0.0.1:${service.server.address().port}`;
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
    for(const file of ['/index.html','/dist/庄园攻防.html'])for(const width of [320,390,1280]){
      const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),errors=[];
      await context.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}));
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(address+file);await page.waitForFunction(()=>!!window.Gufang);
      await page.locator('#start-single').click();await page.locator('#single-start').click();await page.locator('[data-choice="thunder"]').click();
      const building=await page.evaluate(()=>{
        const s=Gufang.state,p=GF.playerView(s,0);for(const player of s.players)player.controller='human';p.coins=p.materials=1e12;p.gateLevel=15;
        for(const b of p.buildings)if(b.type==='shrine'||b.type==='gate'){b.level=15;b.hp=GF.maxHP(b);}
        for(const k of GF.estate(p).cells){const x=k%s.worldSize,y=Math.floor(k/s.worldSize);if(!GF.at(s,x,y)&&GF.terrain(x,y,s)!=='water'){const b=GF.grantBuilding(p,'barracks',x,y,1);if(b){b.production=.75;Gufang.select(x,y);return {id:b.id,x,y};}}}
      });
      const branches=page.locator('[data-barracks-branch]');assert.equal(await branches.count(),2);
      assert.equal(await page.locator('#upgrade-building').count(),0);assert.equal(await page.locator('#bulk-upgrade-building').count(),0);
      assert.match(await branches.nth(0).innerText(),/升级为步兵营/);assert.match(await branches.nth(1).innerText(),/升级为弓兵营/);
      const layout=await branches.evaluateAll(buttons=>buttons.map(button=>{const a=button.getBoundingClientRect(),b=button.parentElement.getBoundingClientRect();return {inside:a.left>=b.left-.1&&a.right<=b.right+.1,overflow:button.scrollWidth>button.clientWidth};}));
      assert(layout.every(item=>item.inside&&!item.overflow),`Buttons fit at ${width}px: ${JSON.stringify(layout)}`);
      const branchMarker=()=>page.evaluate(async ({x,y})=>{
        const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.style.cssText='position:fixed;left:-10000px;width:390px;height:844px';document.body.append(canvas);
        const context=canvas.getContext('2d'),draw=context.drawImage,icon=GFUI.image('assets/ui/icons/upgrade.png');let marker=false;
        if(!icon.complete)await new Promise(resolve=>icon.addEventListener('load',resolve,{once:true}));
        context.drawImage=function(image){if(image===icon)marker=true;return draw.apply(this,arguments);};
        GFArt.render(canvas,Gufang.state,{x:195-(x*64+32),y:400-(y*64+32),zoom:1},null,{player:0});
        canvas.remove();return marker;
      },building);
      assert.equal(await branchMarker(),true,'Level-one barracks shows an upgrade marker when a branch is affordable');
      await page.evaluate(()=>{const p=GF.playerView(Gufang.state,0);p.coins=p.materials=0;Gufang.refresh();});
      assert.equal(await branchMarker(),false,'Level-one barracks hides the upgrade marker when neither branch is affordable');
      for(const button of await branches.all())assert.equal(await button.getAttribute('aria-disabled'),'true');
      await page.evaluate(()=>{const p=GF.playerView(Gufang.state,0);p.coins=p.materials=1e12;Gufang.refresh();});
      if(width===390&&file==='/index.html'){
        const qa=path.join(root,'assets/generated/qa');fs.mkdirSync(qa,{recursive:true});
        await page.evaluate(({x,y})=>{
          const s=Gufang.state,p=GF.playerView(s,0);p.coins=p.materials=20000;Gufang.refresh();
          for(const animation of document.getAnimations())animation.finish();
          GFArt.render(document.getElementById('map'),s,{x:innerWidth/2-(x*64+32)*.8,y:innerHeight*.42-(y*64+32)*.8,zoom:.8},null,{player:0,grid:true,animationTime:s.elapsed});
        },building);
        await page.screenshot({path:path.join(qa,'barracks-branch-buttons.png')});
      }
      await page.locator('[data-barracks-branch="archer"]').click();
      const changed=await page.evaluate(id=>{const b=Gufang.state.buildings.find(n=>n.id===id);return {level:b.level,troop:b.troopType,progress:b.production,name:GF.name(b)};},building.id);
      assert.deepEqual(changed,{level:2,troop:'archer',progress:.75,name:'弓兵营'});
      assert.equal(await branches.count(),0);assert.equal(await page.locator('#upgrade-building').count(),1);
      assert.match(await page.locator('.detail-title h3').innerText(),/弓兵营/);
      assert.equal(await page.locator('#bulk-upgrade-building').isVisible(),true);
      await page.evaluate(id=>{const b=Gufang.state.buildings.find(n=>n.id===id);b.production=.99;GF.step(Gufang.state,.05);Gufang.refresh();},building.id);
      assert.equal(await page.evaluate(()=>Gufang.state.soldiers.find(n=>n.troopType==='archer').level),2);
      // Render a controlled coop scene to inspect all six sprite sources in both packaging modes.
      const rendered=await page.evaluate(async()=>{
        await new Promise(resolve=>{const check=()=>GFArt.spriteVersion()>=6?resolve():setTimeout(check,10);check();});
        const s=GF.createMatch({mode:'coop',mapSeed:42,rotation:0}),home=GF.estate(GF.playerView(s,0)).center;s.elapsed=1;
        for(let owner=0;owner<3;owner++)for(const troopType of ['infantry','archer']){
          const level=4,hp=GF.soldierHP(GF.playerView(s,owner),{troopType,level});
          s.soldiers.push({id:s.nextId++,owner,barracksId:99999,troopType,level,hp,maxHp:hp,x:home.x+owner*.4,y:home.y,attack:GF.TROOPS[troopType].interval,attackAt:1,targetId:null,targetBuildingId:null,waypoint:null});
        }
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;document.body.appendChild(canvas);canvas.style.cssText='position:fixed;width:640px;height:480px;left:0;top:0;visibility:hidden';
        const c=canvas.getContext('2d'),original=c.drawImage,used=[];
        c.drawImage=function(image,...args){if(args.length===8&&args[2]===20&&args[3]===30){const matrix=this.getTransform();used.push({src:image.src,angle:Math.atan2(matrix.b,matrix.a)});}return original.call(this,image,...args);};
        GFArt.render(canvas,s,{x:320-(home.x*64+32),y:240-(home.y*64+32),zoom:1},null,{player:0,animationTime:1.05});canvas.remove();
        const paths=['infantry','archer'].flatMap(type=>['player-red','ally-green','enemy-purple'].map(faction=>`assets/sprites/soldiers/${type}_${faction}.png`));
        const draws=paths.map(name=>used.find(draw=>draw.src===(window.GF_ASSET_URLS?.[name]||new URL(name,location.href).href)));
        return {matches:draws.map(Boolean),infantryAngles:draws.slice(0,3).map(draw=>draw?.angle),archerAngles:draws.slice(3).map(draw=>draw?.angle)};
      });
      assert(rendered.matches.every(Boolean),`All six atlases rendered: ${rendered.matches}`);
      assert(rendered.infantryAngles.every(angle=>Math.abs(angle)>.1));assert(rendered.archerAngles.every(angle=>Math.abs(angle)<.0001));assert.deepEqual(errors,[]);
      console.log(`PASS ${file} ${width}px: branches, costs, level-two archers and six sprite atlases`);
      await context.close();
    }

    const contexts=await Promise.all([browser.newContext({viewport:{width:390,height:844}}),browser.newContext({viewport:{width:390,height:844}})]);
    for(const context of contexts)await context.addInitScript(()=>{const NativeWebSocket=window.WebSocket;window.WebSocket=class extends NativeWebSocket{constructor(...args){super(...args);window.__testSocket=this;}};});
    const [host,guest]=await Promise.all(contexts.map(context=>context.newPage())),errors=[];
    for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
    await Promise.all([host.goto(address),guest.goto(address)]);
    await host.locator('#start-coop').click();await host.locator('#coop-host').click();
    await host.waitForFunction(()=>/^\d{6}$/.test(Gufang.online?.code||''));const code=await host.evaluate(()=>Gufang.online.code);
    await guest.locator('#start-coop').click();await guest.locator('#coop-code').fill(code);await guest.locator('#coop-join').click();
    await host.waitForFunction(()=>Gufang.online?.peerConnected);await host.locator('#coop-start').click();
    for(const page of [host,guest])await page.locator('[data-choice="thunder"]').click();
    await Promise.all([host.locator('#modal').waitFor({state:'hidden'}),guest.locator('#modal').waitFor({state:'hidden'})]);
    const room=service.rooms.get(code);room.host.paused=room.guest.paused=true;for(const player of room.state.players)player.controller='human';
    const camp=prepareBarracks(room.state,0);service.publish(room,true);
    await host.waitForFunction(id=>Gufang.state.buildings.some(b=>b.id===id&&b.level===1),camp.id);
    await host.evaluate(({x,y})=>Gufang.select(x,y),camp);await host.locator('[data-barracks-branch="archer"]').click();
    await guest.waitForFunction(id=>Gufang.state.buildings.some(b=>b.id===id&&b.level===2&&b.troopType==='archer'),camp.id);
    assert.equal(camp.troopType,'archer');assert.equal(camp.level,2);
    camp.production=.99;G.step(room.state,.05);service.publish(room,true);
    await Promise.all([host,guest].map(page=>page.waitForFunction(()=>Gufang.state.soldiers.some(u=>u.troopType==='archer'&&u.level===2))));
    await guest.evaluate(({x,y})=>Gufang.select(x,y),camp);assert.equal(await guest.locator('[data-barracks-branch]:visible').count(),0);assert.equal(await guest.locator('#upgrade-building').isVisible(),false);
    room.guest.needsSnapshot=true;service.publish(room,true);
    await guest.waitForFunction(()=>Gufang.state.version===11&&Gufang.state.soldiers.some(u=>u.troopType==='archer'&&u.level===2));
    const stock=[room.state.players[0].coins,room.state.players[0].materials];
    const rejected=await host.evaluate(camp=>new Promise(resolve=>{
      const socket=window.__testSocket,listener=event=>{const message=JSON.parse(event.data);if(message.type==='result'&&message.id===1000){socket.removeEventListener('message',listener);resolve(message);}};
      socket.addEventListener('message',listener);socket.send(JSON.stringify({type:'action',id:1000,session:camp.roomSession,kind:'upgrade',x:camp.x,y:camp.y,troopType:'infantry'}));
    }),{...camp,roomSession:room.session});
    assert.equal(rejected.ok,false);assert.deepEqual([room.state.players[0].coins,room.state.players[0].materials],stock);assert.equal(camp.level,2);
    const disconnected=room.guest;disconnected.terminate();
    await host.waitForFunction(()=>!Gufang.online?.peerConnected);
    await guest.waitForFunction(()=>Gufang.online?.peerConnected&&!Gufang.online?.awaitingState&&Gufang.state.version===11&&Gufang.state.soldiers.some(u=>u.troopType==='archer'&&u.level===2));
    await host.waitForFunction(()=>Gufang.online?.peerConnected);assert.notEqual(room.guest,disconnected);
    assert.deepEqual(errors,[]);console.log('PASS LAN: authoritative branch upgrade, atomic rejection, archer sync, read-only ally detail, checkpoint and disconnect/reconnect recovery');
    await Promise.all(contexts.map(context=>context.close()));
  }finally{if(browser)await browser.close();await service.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
