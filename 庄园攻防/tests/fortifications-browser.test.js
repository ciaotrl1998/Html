'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {createServer}=require('../server');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'assets/generated/qa/fortifications-v8'),metrics=JSON.parse(fs.readFileSync(path.join(root,'assets/generated/fortifications-v8/metrics.json'),'utf8'));
(async()=>{
  const server=createServer();await new Promise(resolve=>server.server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});fs.mkdirSync(qa,{recursive:true});
  try{for(const offline of [false,true]){
    const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[],failed=[],external=[];
    const url=offline?pathToFileURL(path.join(root,'dist/庄园攻防.html')).href:`http://127.0.0.1:${server.server.address().port}`;
    page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    page.on('request',r=>{if(offline&&r.url()!==url&&!r.url().startsWith('data:'))external.push(r.url());});
    await page.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}));
    await page.goto(url);await page.waitForFunction(()=>window.GFArt&&window.Gufang);await page.locator('#start-single').click();await page.locator('#single-start').click();await page.locator('[data-choice="thunder"]').click();
    const result=await page.evaluate(async()=>{
      const paths=[...Array.from({length:16},(_,i)=>`assets/tiles/walls/${i.toString(16).padStart(2,'0')}.png`),'assets/sprites/buildings/gate/stages.png','assets/sprites/buildings/gate/stages-ew.png',...Array.from({length:3},(_,i)=>`assets/sprites/buildings/gate/level-${i+1}-ew.png`)];
      const loaded=[];for(const file of paths){const img=new Image();img.src=window.GF_ASSET_URLS?.[file]||file;await img.decode();loaded.push({file,width:img.naturalWidth,height:img.naturalHeight});}
      const previews=[];const game=Gufang.state;for(const p of game.players)p.controller='human';
      for(const b of game.buildings.filter(b=>b.type==='gate'&&b.owner===0))for(const level of [1,4,7,15]){
        b.level=level;b.hp=GF.maxHP(b);Gufang.select(b.x,b.y);Gufang.refresh();const img=document.querySelector('#detail-view img');await img.decode();previews.push({direction:b.direction,level,src:img.getAttribute('src'),expected:GFArt.thumbnail('gate',level,b.direction)});
      }
      const s=GF.createMatch({mode:'single',enemyCount:4,mapSeed:42,rotation:0});s.soldiers=[];s.effects=[];s.projectiles=[];
      const gates=s.buildings.filter(b=>b.type==='gate'&&b.owner===0).sort((a,b)=>a.direction-b.direction),host=document.createElement('div');
      host.id='fortification-contact';host.style='position:absolute;inset:0;z-index:10000;display:grid;grid-template-columns:repeat(4,320px);background:#d0d5b0;width:1280px;height:900px';document.body.append(host);
      const records=[],health=[],samples=[],joins=[];
      const sources=new Map(['stages.png','stages-ew.png'].map(name=>{const file=`assets/sprites/buildings/gate/${name}`;return [new URL(window.GF_ASSET_URLS?.[file]||file,document.baseURI).href,name];}));
      for(const level of [1,4,7])for(const gate of gates){
        for(const b of s.buildings)if(b.type==='gate'){b.level=level;b.hp=GF.maxHP(b)/2;}
        const cell=document.createElement('div');cell.style='height:300px;position:relative;border:1px solid #acaf8d';const title=document.createElement('div');title.textContent=`${['北门','东门','南门','西门'][gate.direction]} · 外观${Math.floor((level-1)/3)+1}`;title.style='position:absolute;z-index:1;left:10px;top:8px;font:14px sans-serif;color:#4a2e20';cell.append(title);
        const canvas=document.createElement('canvas');canvas.width=320;canvas.height=300;canvas.style='width:320px;height:300px';cell.append(canvas);host.append(cell);
        const cam={x:160-(gate.x*64+32)*2,y:190-(gate.y*64+32)*2,zoom:2},c=canvas.getContext('2d'),options={player:0,animationTime:0,reducedMotion:true,grid:true};
        const draw=()=>GFArt.render(canvas,s,cam,null,options);draw();await GFArt.ready();draw();
        const original=c.drawImage;
        c.drawImage=function(img,...args){const t=this.getTransform();if(Math.abs(t.e-160)<.01&&Math.abs(t.f-190)<.01){if(sources.has(img.src))records.push({direction:gate.direction,level,name:sources.get(img.src),args,matrix:[t.a,t.b,t.c,t.d,t.e,t.f]});if(img===GFUI.image('assets/ui/bars/health-track.png'))health.push({direction:gate.direction,level,y:args[1]});}return original.call(this,img,...args);};
        try{draw();}finally{c.drawImage=original;}
        if(level===1){
          const side=gate.direction%2===1,x=side?17:2,y=side?4:40,file=`assets/tiles/walls/${side?'05':'0a'}.png`,img=GFUI.image(file);await img.decode();
          const probe=document.createElement('canvas');probe.width=probe.height=64;const pc=probe.getContext('2d');pc.drawImage(img,0,0);
          joins.push({direction:gate.direction,actual:[...c.getImageData(160+(x-32)*2,190+(y-32)*2,1,1).data],expected:[...pc.getImageData(x,y,1,1).data]});
        }
        samples.push({canvas,s,gate,draw});
      }
      window.fortificationScene={s,gates,samples,host};return {loaded,previews,records,health,joins};
    });
    fs.writeFileSync(path.join(qa,`${offline?'offline':'source'}-draw-report.json`),JSON.stringify({records:result.records,health:result.health,joins:result.joins},null,2));
    await page.locator('#fortification-contact').screenshot({path:path.join(qa,`${offline?'offline':'source'}-gate-directions-levels.png`)});
    assert.equal(result.records.length,12);assert.equal(result.health.length,12);
    assert.equal(result.joins.length,4);for(const join of result.joins)assert.deepEqual(join.actual,join.expected,'Gate piers are joined to wall pixels, not grass');
    for(const r of result.records){const side=r.direction%2===1,stage=Math.floor((r.level-1)/3),profile=metrics.gateOrientations[side?'ew':'ns'];assert.equal(r.name,profile.image);assert.deepEqual(r.args,[stage*96,0,96,128,-48,profile.groundY-32-120,96,128]);assert.equal(r.matrix[0],r.matrix[3]);}
    for(const r of result.health){const profile=metrics.gateOrientations[r.direction%2?'ew':'ns'];assert.equal(r.y,profile.groundY-32-profile.heights[Math.floor((r.level-1)/3)]-7);}
    for(const p of result.previews){assert.equal(p.src,p.expected);const file=`assets/sprites/buildings/gate/level-${Math.min(3,Math.floor((p.level-1)/3)+1)}${p.direction%2?'-ew':''}.png`;assert.equal(p.src,offline?await page.evaluate(f=>GF_ASSET_URLS[f],file):file);}
    for(const l of result.loaded){assert.equal(l.width,l.file.includes('/walls/')?64:l.file.includes('/level-')?64:288);assert.equal(l.height,l.file.includes('/stages')?128:64);}
    await page.locator('#fortification-contact').screenshot({path:path.join(qa,`${offline?'offline':'source'}-gate-directions-levels.png`)});
    // Inspect a complete real estate and every join/corner in the live map.
    await page.evaluate(async()=>{
      const {s,host}=fortificationScene;host.remove();for(const b of s.buildings)if(b.type==='gate'){b.level=1;b.hp=GF.maxHP(b);}const home=s.buildings.find(b=>b.type==='shrine'&&b.owner===0);
      const canvas=document.createElement('canvas');canvas.id='fortification-estate';canvas.width=1200;canvas.height=900;canvas.style='position:absolute;inset:0;z-index:10001;width:1200px;height:900px';document.body.append(canvas);
      const cam={x:600-(home.x*64+32)*.55,y:450-(home.y*64+32)*.55,zoom:.55},draw=()=>GFArt.render(canvas,s,cam,null,{player:0,animationTime:0,reducedMotion:true,grid:true});draw();await GFArt.ready();draw();
    });
    await page.locator('#fortification-estate').screenshot({path:path.join(qa,`${offline?'offline':'source'}-estate.png`)});
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);console.log(`${offline?'Offline':'Source'}: four real gate directions x three stages, orientation-specific anchors/health, 16 wall assets, detail previews and self-contained loading passed`);await page.close();
  }}finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
