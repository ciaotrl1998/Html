'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {createServer}=require('../server');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'assets/generated/qa/building-redesign/v8');
const metrics=JSON.parse(fs.readFileSync(path.join(root,'assets/generated/fortifications-v8/metrics.json'),'utf8'));
const designs=JSON.parse(fs.readFileSync(path.join(root,'assets/generated/buildings-redesign/designs.json'),'utf8'));
(async()=>{
  const server=createServer();await new Promise(resolve=>server.server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
    fs.mkdirSync(qa,{recursive:true});
    for(const offline of [false,true]){
      const page=await browser.newPage({viewport:{width:1344,height:1024},reducedMotion:'reduce'}),errors=[],failed=[],external=[];
      const target=offline?pathToFileURL(path.join(root,'dist/庄园攻防.html')).href:`http://127.0.0.1:${server.server.address().port}`;
      page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
      page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
      page.on('request',r=>{if(offline&&!r.url().startsWith('data:')&&r.url()!==target)external.push(r.url());});
      await page.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}));
      await page.goto(target);await page.waitForFunction(()=>window.Gufang&&window.GFArt);
      await page.locator('#start-single').click();await page.locator('#single-start').click();await page.locator('[data-choice="thunder"]').click();
      const ui=await page.evaluate(async()=>{
        const s=Gufang.state,p=GF.playerView(s,0),home=p.buildings.find(b=>b.type==='shrine');
        p.coins=p.materials=1e12;
        const stages=[];
        for(const level of [1,3,4,6,7,9,15]){
          home.level=level;home.hp=GF.maxHP(home);Gufang.select(home.x,home.y);Gufang.refresh();
          const image=document.querySelector('#detail-view img');await image.decode();
          stages.push({level,src:image.getAttribute('src'),width:image.naturalWidth,height:image.naturalHeight,transform:getComputedStyle(image).transform});
        }
        return stages;
      });
      for(const item of ui){
        const file=`assets/sprites/buildings/shrine/level-${Math.min(3,Math.floor((item.level-1)/3)+1)}.png`;
        assert.equal(item.src,offline?await page.evaluate(file=>GF_ASSET_URLS[file],file):file);
        assert.equal(item.width,64);assert.equal(item.height,64);assert.equal(item.transform,'none','New detail sprites must not be enlarged and clipped');
      }
      for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1440,height:1000}]){
        await page.setViewportSize(viewport);
        await page.evaluate(async()=>{
          const s=Gufang.state,home=GF.playerView(s,0).buildings.find(b=>b.type==='shrine');
          Gufang.select(home.x,home.y);Gufang.refresh();await document.querySelector('#detail-view img').decode();
        });
        await page.screenshot({path:path.join(qa,`${offline?'offline':'source'}-detail-${viewport.width}.png`)});
        await page.evaluate(async()=>{
          const s=Gufang.state,p=GF.playerView(s,0);
          for(let y=0;y<GF.worldHeight(s);y++)for(let x=0;x<GF.worldWidth(s);x++)if(GF.owns(p,x,y)&&!GF.at(s,x,y)&&!GF.buildReason(p,'barracks',x,y)){
            Gufang.select(x,y);Gufang.refresh();await Promise.all([...document.querySelectorAll('#cards img')].map(img=>img.decode()));return;
          }
          throw Error('No buildable plot for card check');
        });
        const cards=await page.locator('#cards img').evaluateAll(images=>images.map(img=>({width:img.naturalWidth,height:img.naturalHeight,transform:getComputedStyle(img).transform})));
        assert(cards.length>0);for(const image of cards){assert.equal(image.width,64);assert.equal(image.height,64);assert.equal(image.transform,'none');}
        await page.screenshot({path:path.join(qa,`${offline?'offline':'source'}-cards-${viewport.width}.png`)});
      }
      await page.setViewportSize({width:1344,height:1024});
      const result=await page.evaluate(async types=>{
        const canvas=document.createElement('canvas');canvas.width=1344;canvas.height=1024;
        canvas.style='position:fixed;inset:0;width:1344px;height:1024px;z-index:9999';document.body.append(canvas);
        const s=GF.createMatch({mode:'single',enemyCount:2,mapSeed:42});s.buildings=[];s.soldiers=[];s.effects=[];s.projectiles=[];
        for(const [index,type] of types.entries())for(let stage=0;stage<3;stage++){
          const b={id:1000+index*3+stage,type,owner:0,x:1+index%5*4+stage,y:2+Math.floor(index/5)*3,level:[1,4,7][stage]};b.hp=GF.maxHP(b);s.buildings.push(b);
        }
        const cam={x:0,y:0,zoom:1},options={player:0,animationTime:0,reducedMotion:true,grid:true};
        const draw=()=>GFArt.render(canvas,s,cam,null,options);draw();await GFArt.ready();draw();
        const c=canvas.getContext('2d'),original=c.drawImage,records=[];
        const sources=new Map(types.map(type=>{const file=`assets/sprites/buildings/${type}/stages.png`;return [new URL(window.GF_ASSET_URLS?.[file]||file,document.baseURI).href,type];}));
        c.drawImage=function(img,...args){if(sources.has(img.src)){const m=this.getTransform();records.push({type:sources.get(img.src),args,width:img.naturalWidth,height:img.naturalHeight,smoothing:this.imageSmoothingEnabled,matrix:[m.a,m.b,m.c,m.d,m.e,m.f]});}return original.call(this,img,...args);};
        try{draw();}finally{c.drawImage=original;}
        const healthbars=[],track=GFUI.image('assets/ui/bars/health-track.png');await track.decode();
        for(const b of s.buildings)b.hp=GF.maxHP(b)/2;
        c.drawImage=function(img,...args){if(img===track)healthbars.push(args);return original.call(this,img,...args);};
        try{draw();}finally{c.drawImage=original;for(const b of s.buildings)b.hp=GF.maxHP(b);}
        const thumbnails=[];
        for(const type of types)for(const level of [1,4,7]){
          const image=new Image();image.src=GFArt.thumbnail(type,level);await image.decode();thumbnails.push({type,level,width:image.naturalWidth,height:image.naturalHeight});
        }
        // Exercise every level boundary with the actual map renderer, including Lv10–15.
        const levels=[];s.buildings=s.buildings.slice(0,1);
        c.drawImage=function(img,...args){if(sources.has(img.src))levels.push({level:s.buildings[0].level,args});return original.call(this,img,...args);};
        try{for(let level=1;level<=15;level++){s.buildings[0].level=level;draw();}}finally{c.drawImage=original;}
        window.buildingSheetScene={s,canvas,draw};
        return {records,healthbars,thumbnails,levels};
      },designs.buildings.map(b=>b.id));
      assert.equal(result.records.length,75);assert.equal(new Set(result.records.map(r=>r.type)).size,25);
      for(const type of designs.buildings.map(b=>b.id)){
        const family=result.records.filter(r=>r.type===type);assert.equal(family.length,3);
        for(const [stage,r] of family.entries()){
          assert.equal(r.width,288);assert.equal(r.height,128);assert.equal(r.smoothing,false);
          assert.deepEqual(r.args,[stage*96,0,96,128,-48,22-120,96,128],'Map must draw native pixels without runtime stretching or per-type scaling');
          const index=designs.buildings.findIndex(b=>b.id===type),x=1+index%5*4+stage,y=2+Math.floor(index/5)*3;
          const pivotX=r.matrix[4]+r.args[4]+48*r.args[6]/96,pivotY=r.matrix[5]+r.args[5]+120*r.args[7]/128;
          assert(Math.abs(pivotX-(x*64+32))<1e-8,'Source pivot remains horizontally centered');
          assert(Math.abs(pivotY-(y*64+54))<1e-8,'All tiers must land ten pixels above the tile bottom, not at its center');
        }
      }
      assert.equal(result.healthbars.length,75);
      assert.deepEqual(result.healthbars.map(args=>args[1]),result.records.map(r=>22-metrics.heights[r.type][r.args[0]/96]-7),'Health bars must follow actual PNG roof heights');
      assert.equal(result.thumbnails.length,75);for(const t of result.thumbnails){assert.equal(t.width,64);assert.equal(t.height,64);}
      for(const r of result.levels)assert.equal(r.args[0],Math.min(2,Math.floor((r.level-1)/3))*96);
      // Restore the full 75-building contact scene for visual inspection.
      await page.evaluate(types=>{
        const {s,draw}=buildingSheetScene;s.buildings=[];
        for(const [index,type] of types.entries())for(let stage=0;stage<3;stage++){
          const b={id:1000+index*3+stage,type,owner:0,x:1+index%5*4+stage,y:2+Math.floor(index/5)*3,level:[1,4,7][stage]};b.hp=GF.maxHP(b);s.buildings.push(b);
        }
        draw();
      },designs.buildings.map(b=>b.id));
      await page.locator('canvas').last().screenshot({path:path.join(qa,`${offline?'offline':'source'}-all-buildings.png`)});
      await page.setViewportSize({width:800,height:720});
      await page.evaluate(async()=>{
        const {s,canvas}=buildingSheetScene;canvas.width=800;canvas.height=720;canvas.style.width='800px';canvas.style.height='720px';s.buildings=[];
        const types=['shrine','inn','tower','farm','mulberry','barracks','mill','wine','tao','trade','guild','port','weaver','quarry','bank','gate'];
        for(const [index,type] of types.entries()){
          const b={id:2000+index,type,owner:0,x:3+index%4,y:2+Math.floor(index/4),level:[1,4,7][index%3]};b.hp=GF.maxHP(b)*(index%4===2?.5:1);s.buildings.push(b);
        }
        const cam={x:100-3*64*1.5,y:120-2*64*1.5,zoom:1.5};
        const draw=()=>GFArt.render(canvas,s,cam,null,{player:0,animationTime:0,reducedMotion:true,grid:true});draw();await GFArt.ready();draw();
      });
      await page.locator('canvas').last().screenshot({path:path.join(qa,`${offline?'offline':'source'}-dense-buildings.png`)});
      assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[],'Offline game must never fetch external sprite files');
      console.log(`${offline?'Offline':'Source'}: 25 sheets / 75 stages, Lv1–15 boundaries, native 96x128 art (no stretching), unchanged tile anchor (32,54), 75 thumbnails, 320/390/1440px cards/details and self-contained loading passed`);
      await page.close();
    }
  }finally{if(browser)await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
