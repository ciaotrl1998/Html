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
      assert.match(await page.locator('.upgrade-stats').innerText(),/本营兵力\s*0 \/ 3 → 上限 4/);
      const progress=page.getByRole('progressbar',{name:'补员进度'});
      assert.equal(await progress.getAttribute('aria-valuenow'),'75');
      assert.match(await progress.getAttribute('aria-valuetext'),/补员 75%/);
      assert.equal(await progress.locator('.recruit-slot').count(),3);
      assert.equal(await progress.locator('[data-state="training"]').count(),1);
      assert.equal(await progress.locator('[data-state="empty"]').count(),2);
      assert.equal(await progress.locator('.recruit-fill').first().evaluate(el=>el.style.clipPath),'inset(7px 0px 0px)');
      assert.equal(await progress.locator('.recruit-fill').evaluateAll(els=>els.flatMap(el=>el.getAnimations()).length),0,'Opening existing recruitment does not flash');
      const progressLayout=await page.evaluate(()=>{
        const bar=document.getElementById('detail-recruit'),badge=document.querySelector('.detail-title .level-badge'),button=document.getElementById('demolish-building');
        const bounds=bar.getBoundingClientRect(),title=bar.parentElement.getBoundingClientRect();
        const selectors=['.detail','.detail-title h3','.detail-title .level-badge','.demolish-button','.detail-art','.detail-info','.detail-actions'];
        const measure=()=>selectors.map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
        const before=measure();bar.style.display='none';const without=measure();bar.style.display='';
        return {before,without,inside:bounds.left>=badge.getBoundingClientRect().right&&bounds.right<=button.getBoundingClientRect().left&&bounds.top>=title.top&&bounds.bottom<=title.bottom,overflow:bar.scrollWidth>bar.clientWidth};
      });
      assert.deepEqual(progressLayout.before,progressLayout.without,'Progress fits the existing title gap without moving or resizing other UI');
      assert(progressLayout.inside&&!progressLayout.overflow,`Recruitment progress fits at ${width}px`);
      await page.evaluate(()=>{const b=Gufang.state.buildings.find(b=>b.type==='barracks');GF.step(Gufang.state,.05);Gufang.refresh();});
      assert.equal(await progress.getAttribute('aria-valuenow'),'80');
      await page.evaluate(()=>{Gufang.state.buildings.find(b=>b.type==='barracks').production=.75;Gufang.refresh();});
      assert.equal(await page.locator('#upgrade-building').count(),0);assert.equal(await page.locator('#bulk-upgrade-building').count(),0);
      assert.match(await branches.nth(0).innerText(),/升级为步兵营/);assert.match(await branches.nth(1).innerText(),/升级为弓兵营/);
      const quotes=await branches.evaluateAll(buttons=>buttons.map(button=>[...button.querySelectorAll('.cost-number')].map(e=>Number(e.textContent))));
      assert.deepEqual(quotes,[[1520,456],[2280,304]]);
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
      for(const [coins,materials,affordable] of [[1520,456,'infantry'],[2280,304,'archer']]){
        await page.evaluate(({coins,materials})=>{const p=GF.playerView(Gufang.state,0);p.coins=coins;p.materials=materials;Gufang.refresh();},{coins,materials});
        assert.equal(await branchMarker(),true,'Either affordable branch shows the upgrade marker');
        for(const branch of ['infantry','archer'])assert.equal(await page.locator(`[data-barracks-branch="${branch}"]`).getAttribute('aria-disabled'),String(branch!==affordable));
      }
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
      const branchStock=await page.evaluate(()=>{const p=GF.playerView(Gufang.state,0);return [p.coins,p.materials];});
      await page.locator('[data-barracks-branch="archer"]').click();
      assert.deepEqual(await page.evaluate(()=>{const p=GF.playerView(Gufang.state,0);return [p.coins,p.materials];}),[branchStock[0]-2280,branchStock[1]-304]);
      const changed=await page.evaluate(id=>{const b=Gufang.state.buildings.find(n=>n.id===id);return {level:b.level,troop:b.troopType,progress:b.production,name:GF.name(b)};},building.id);
      assert.deepEqual(changed,{level:2,troop:'archer',progress:.75,name:'弓兵营'});
      assert.equal(await branches.count(),0);assert.equal(await page.locator('#upgrade-building').count(),1);
      assert.match(await page.locator('.detail-title h3').innerText(),/弓兵营/);
      assert.equal(await page.locator('#bulk-upgrade-building').isVisible(),true);
      const completion=await page.evaluate(id=>{
        const b=Gufang.state.buildings.find(n=>n.id===id);b.production=.99;GF.step(Gufang.state,.05);Gufang.refresh();
        const slots=[...document.querySelectorAll('.recruit-slot')],finished=slots[0].querySelector('.recruit-fill'),animation=finished.getAnimations()[0];
        return {states:slots.map(el=>el.dataset.state),clips:slots.map(el=>el.firstElementChild.style.clipPath),flash:animation?.id,filter:animation?.effect.getKeyframes()[0].filter,duration:animation?.effect.getTiming().duration};
      },building.id);
      assert.deepEqual(completion.states,['full','training','empty','empty']);
      assert.equal(completion.clips[0],'inset(0px)');assert.equal(completion.clips[2],'inset(27px 0px 0px)');
      assert.equal(completion.flash,'recruit-trained');assert.equal(completion.filter,'brightness(0) invert(1)');assert.equal(completion.duration,280);
      await page.waitForFunction(()=>[...document.querySelectorAll('.recruit-fill')].every(el=>el.getAnimations().length===0));
      await page.evaluate(()=>Gufang.refresh());
      assert.equal(await progress.locator('.recruit-fill').evaluateAll(els=>els.flatMap(el=>el.getAnimations()).length),0,'Completion flashes once and restores the original colors');
      assert.equal(await page.evaluate(()=>Gufang.state.soldiers.find(n=>n.troopType==='archer').level),2);
      await page.evaluate(()=>{
        for(let i=0;i<100;i++){for(const u of Gufang.state.soldiers)u.repelled=100;GF.step(Gufang.state,.05);}
        Gufang.refresh();
      });
      assert.match(await page.locator('.upgrade-stats').innerText(),/本营兵力\s*4 \/ 4 → 上限 5/);
      assert.doesNotMatch(await page.locator('.upgrade-stats').innerText(),/补员状态|满员暂停/);
      assert.equal(await progress.getAttribute('aria-valuenow'),'100');assert.match(await progress.getAttribute('aria-valuetext'),/已满员/);
      assert.equal(await progress.locator('[data-state="full"]').count(),4);
      await page.evaluate(()=>{Gufang.state.soldiers[0].hp=0;GF.step(Gufang.state,.05);Gufang.refresh();});
      assert.match(await page.locator('.upgrade-stats').innerText(),/本营兵力\s*3 \/ 4 → 上限 5/);
      assert.doesNotMatch(await page.locator('.upgrade-stats').innerText(),/满员暂停/);
      assert.equal(await progress.getAttribute('aria-valuenow'),'5');
      assert.equal(await progress.locator('[data-state="full"]').count(),3);
      assert.equal(await progress.locator('[data-state="training"]').count(),1);
      const replacement=await page.evaluate(()=>{
        const s=Gufang.state,b=s.buildings.find(b=>b.type==='barracks');
        s.soldiers[0].hp=0;b.production=.99;GF.step(s,.05);Gufang.refresh();
        const slots=[...document.querySelectorAll('.recruit-slot')];
        return {full:slots.filter(el=>el.dataset.state==='full').length,flashes:slots.flatMap(el=>el.firstElementChild.getAnimations()).map(a=>a.id)};
      });
      assert.equal(replacement.full,3);assert.deepEqual(replacement.flashes,['recruit-trained'],'Replacement flashes even when one casualty and one recruit keep the count unchanged');
      for(const troopType of ['archer','infantry']){
        const id=await page.evaluate(({troopType,id})=>{
          const s=Gufang.state,p=GF.playerView(s,0);p.coins=p.materials=1e12;
          let b=s.buildings.find(b=>b.id===id);
          if(troopType==='infantry')for(const k of GF.estate(p).cells){const x=k%GF.worldWidth(s),y=Math.floor(k/GF.worldWidth(s));if(GF.buildReason(p,'barracks',x,y))continue;const result=GF.build(p,'barracks',x,y);if(result.ok){b=result.building;break;}}
          Gufang.select(b.x,b.y);Gufang.refresh();return b.id;
        },{troopType,id:building.id});
        if(troopType==='infantry')await page.locator('[data-barracks-branch="infantry"]').click();
        const before=await page.evaluate(id=>{const p=GF.playerView(Gufang.state,0),b=p.buildings.find(b=>b.id===id);return {coins:p.coins,materials:p.materials,cost:GF.upgradeCost(b),shown:[...document.querySelectorAll('#upgrade-label .cost-number')].map(e=>Number(e.textContent))};},id);
        assert.deepEqual(before.shown,[before.cost.coins,before.cost.materials]);
        assert.equal(before.cost.coins/G.COIN_VALUE/(before.cost.coins/G.COIN_VALUE+before.cost.materials),troopType==='archer'?.6:.4);
        await page.locator('#upgrade-building').click();
        assert.deepEqual(await page.evaluate(()=>{const p=GF.playerView(Gufang.state,0);return [p.coins,p.materials];}),[before.coins-before.cost.coins,before.materials-before.cost.materials]);
        const bulk=await page.evaluate(id=>{const p=GF.playerView(Gufang.state,0),b=p.buildings.find(b=>b.id===id);return {coins:p.coins,materials:p.materials,cost:GF.upgradeOptions(p,b).cost};},id);
        await page.locator('#bulk-upgrade-building').click();
        assert.deepEqual(await page.evaluate(id=>{const p=GF.playerView(Gufang.state,0);return [p.buildings.find(b=>b.id===id).level,p.coins,p.materials];},id),[9,bulk.coins-bulk.cost.coins,bulk.materials-bulk.cost.materials]);
        const iconLayout=await page.evaluate(async()=>{
          await Promise.all(['full','outline'].map(type=>{const image=GFUI.image('assets/ui/icons/recruit-soldier-'+type+'.png');return image.decode();}));
          const group=document.getElementById('detail-recruit'),r=group.getBoundingClientRect();
          return {slots:group.children.length,overflow:group.scrollWidth>group.clientWidth,icons:[...group.children].map(el=>{const b=el.getBoundingClientRect();return {width:b.width,height:b.height,inside:b.left>=r.left&&b.right<=r.right};})};
        });
        assert.equal(iconLayout.slots,11);assert(!iconLayout.overflow);
        assert(iconLayout.icons.every(icon=>icon.width===12&&icon.height===27&&icon.inside),`All eleven icons fit at ${width}px: ${JSON.stringify(iconLayout)}`);
      }
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
    await guest.waitForFunction(()=>Gufang.state.version===GF.VERSION&&Gufang.state.soldiers.some(u=>u.troopType==='archer'&&u.level===2));
    const stock=[room.state.players[0].coins,room.state.players[0].materials];
    const rejected=await host.evaluate(camp=>new Promise(resolve=>{
      const socket=window.__testSocket,listener=event=>{const message=JSON.parse(event.data);if(message.type==='result'&&message.id===1000){socket.removeEventListener('message',listener);resolve(message);}};
      socket.addEventListener('message',listener);socket.send(JSON.stringify({type:'action',id:1000,session:camp.roomSession,kind:'upgrade',x:camp.x,y:camp.y,troopType:'infantry'}));
    }),{...camp,roomSession:room.session});
    assert.equal(rejected.ok,false);assert.deepEqual([room.state.players[0].coins,room.state.players[0].materials],stock);assert.equal(camp.level,2);
    const disconnected=room.guest;disconnected.terminate();
    await host.waitForFunction(()=>!Gufang.online?.peerConnected);
    await guest.waitForFunction(()=>Gufang.online?.peerConnected&&!Gufang.online?.awaitingState&&Gufang.state.version===GF.VERSION&&Gufang.state.soldiers.some(u=>u.troopType==='archer'&&u.level===2));
    await host.waitForFunction(()=>Gufang.online?.peerConnected);assert.notEqual(room.guest,disconnected);
    assert.deepEqual(errors,[]);console.log('PASS LAN: authoritative branch upgrade, atomic rejection, archer sync, read-only ally detail, checkpoint and disconnect/reconnect recovery');
    await Promise.all(contexts.map(context=>context.close()));
  }finally{if(browser)await browser.close();await service.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
