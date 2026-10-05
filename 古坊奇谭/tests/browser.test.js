'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const G=require('../js/game.js');
const legacySave=JSON.stringify({...G.createState(null),selectedSkill:'repel',coins:200,materials:120});
const initLegacySave=raw=>{if(localStorage.getItem('gufang-qitan-save-v1')===null)localStorage.setItem('gufang-qitan-save-v1',raw);};
const root=path.join(__dirname,'..');
const sourceOnly=process.argv.includes('--source-only')||!!process.env.GUFANG_SOURCE_ONLY;
const shots=process.env.GUFANG_SHOTS||path.join(os.tmpdir(),'gufang-screenshots');
fs.mkdirSync(shots,{recursive:true});
const url=file=>pathToFileURL(path.join(root,sourceOnly?'index.html':file)).href;
async function sourceContext(context){await context.route('**/js/runtime.js',route=>route.fulfill({contentType:'application/javascript',body:['game','art','autoplay','app'].map(name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8')).join('\n;\n')}));}
const freeze=page=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
async function enterFromMenu(page){if(await page.locator("#start-menu").isVisible()){if(await page.locator("#start-load").isEnabled())await page.locator("#start-load").click();else {await page.locator("#start-single").click();await page.locator('[data-choice="thunder"]').click();}}}
async function mapClick(page,x,y){const p=await page.evaluate(([x,y])=>Gufang.screenPoint(x,y),[x,y]);await page.mouse.click(p.x,p.y);}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    const incomeContext=await browser.newContext({viewport:{width:390,height:844}}),incomePage=await incomeContext.newPage();
    await sourceContext(incomeContext);
    const incomeState=G.createState(null);incomeState.selectedSkill='thunder';incomeState.coins=incomeState.materials=100000;
    await incomeContext.addInitScript(initLegacySave,JSON.stringify(incomeState));
    await incomePage.goto(url('index.html'));await incomePage.waitForFunction(()=>!!window.Gufang);await enterFromMenu(incomePage);await freeze(incomePage);
    for(const [types,cells,resource,incomes,costs] of [
      [['tea','inn','bank'],[[6,5],[6,4],[7,4]],'铜钱',[2,5,40],[[0,98],[165,360],[2867,5000]]],
      [['farm','mill','wine'],[[5,8],[6,9],[7,8]],'铜钱',[1,3,24],[[0,65],[110,240],[1720,3000]]],
      [['mulberry','weaver','tailor'],[[10,6],[10,7],[10,8]],'工材',[1,3,24],[[95,0],[290,70],[3680,1200]]],
      [['quarry','kiln','trade'],[[11,11],[10,10],[10,9]],'工材',[2,5,40],[[143,0],[435,105],[6134,2000]]]
    ])for(const [i,type] of types.entries()){
      await incomePage.evaluate(([x,y])=>Gufang.select(x,y),cells[i]);
      const card=incomePage.locator(`[data-build="${type}"]`),bonus=i?`（+${incomes[i]/10}）`:'';
      assert.equal(await card.locator('.card-effect').innerText(),`${resource} +${incomes[i]}${bonus}/秒`,type+' income card');
      for(const [j,icon] of ['coin-icon','material-icon'].entries()){
        const number=card.locator(`.cost-part:has(.${icon}) .cost-number`);
        if(costs[i][j])assert.equal(await number.textContent(),String(costs[i][j]),type+' cost');
        else assert.equal(await number.count(),0);
      }
      await incomePage.evaluate(([type,x,y])=>{if(!GF.grantBuilding(Gufang.state,type,x,y))throw Error(type+' income fixture failed');},[type,...cells[i]]);
    }
    await incomePage.evaluate(()=>{
      const s=Gufang.state;s.day=7;
      for(const [type,x,y] of [['stage',8,6],['well',9,9],['guild',9,6],['port',9,7]]){
        const b=GF.grantBuilding(s,type,x,y,6);if(!b)throw Error(type+' aura fixture failed');
      }
    });
    for(const [type,level] of [['tea',6],['bank',6],['wine',6],['tailor',6],['trade',6],['guild',6],['port',6],['shrine',14],['shrine',15]]){
      const raw=await incomePage.evaluate(([type,level])=>{
        const s=Gufang.state,b=s.buildings.find(b=>b.type===type);b.level=level;b.hp=GF.maxHP(b);
        Gufang.select(b.x,b.y);return GF.serialize(s);
      },[type,level]);
      const s=G.restore(raw),b=s.buildings.find(b=>b.type===type),next={...b,level:level+1};
      const base=G.DEFS[type].income*(type==='shrine'?2**(level-1):4*1.65**(level-3));
      const total=G.income(s,b),round=n=>String(Math.round((n+Number.EPSILON)*10)/10),bonus=round(total-base);
      if(type!=='shrine')assert.notEqual(base,G.DEFS[type].income*G.factor(b),type+' high-level base must avoid attack factor');
      assert.equal(await incomePage.locator('.detail-revenue').textContent(),`+${round(base)}${bonus==='0'?'':`（+${bonus}）`}/秒`,type+' base and bonus');
      assert.equal(await incomePage.locator('.detail-revenue .income-bonus').count(),1,type+' festival/aura bonus remains visible');
      assert.equal(await incomePage.evaluate(type=>GF.income(Gufang.state,Gufang.state.buildings.find(b=>b.type===type)),type),total,type+' actual income matches core');
      const max=level>=G.maxLevel(b);
      const resource=G.DEFS[type].resource==='materials'?'工材':'铜钱';
      assert.equal(await incomePage.locator('.upgrade-stats div').filter({hasText:resource+' / 秒'}).locator('strong').textContent(),total.toFixed(1)+(max?'':' → '+G.income(s,next).toFixed(1)),type+' income upgrade preview');
      if(max){
        assert.equal(await incomePage.locator('#upgrade-building').evaluate(el=>el.firstChild.textContent),'已臻化境');
        assert.equal(await incomePage.locator('#upgrade-label .cost-number').count(),0);
      }else{
        assert.equal(await incomePage.locator('#upgrade-building').evaluate(el=>el.firstChild.textContent),'升级');
        const cost=G.upgradeCost(b);
        for(const [resource,icon] of [['coins','coin-icon'],['materials','material-icon']]){
          const number=incomePage.locator(`#upgrade-label .cost-part:has(.${icon}) .cost-number`);
          if(cost[resource])assert.equal(await number.textContent(),String(cost[resource]),type+' upgrade '+resource);
          else assert.equal(await number.count(),0);
        }
      }
    }
    for(const [type,label,expected] of [['well','收入加成','128% → 144%'],['stage','收入加成','19.2% → 21.6%'],['guild','全镇铜钱收入加成','32% → 36%'],['port','全镇工材收入加成','64% → 72%']]){
      await incomePage.evaluate(type=>{const b=Gufang.state.buildings.find(b=>b.type===type);Gufang.select(b.x,b.y);},type);
      assert.equal(await incomePage.locator('.upgrade-stats div').filter({hasText:label}).locator('strong').textContent(),expected,type+' linear aura preview');
    }
    await incomeContext.close();console.log('PASS all twelve industry income cards, high-level income details, linear auras and upgrade costs');
    for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740},{width:375,height:667}]){
      const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:true}),page=await context.newPage(),errors=[];
      await sourceContext(context);
      await context.addInitScript(initLegacySave,legacySave);
      page.on('pageerror',e=>errors.push(e.stack));
      await page.goto(url('index.html'));await page.waitForFunction(()=>!!window.Gufang);await enterFromMenu(page);await page.waitForTimeout(200);
      const frame=await page.locator('#game').boundingBox();
      assert(frame.width<=480&&frame.height/frame.width>=16/9,'Always a phone-shaped portrait frame');
      assert(Math.abs(frame.x-(viewport.width-frame.width)/2)<1,'Desktop frame is centered');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.locator('#game button:visible').count(),1,'Only the pause/menu button is visible after entering the game');
      assert.deepEqual(await page.locator('.topbar .resource small').allTextContents(),['铜钱','工材']);
      assert.equal(await page.locator('.topbar .material-icon').count(),1);
      assert.equal(await page.locator('#prosperity').count(),0);
      assert(await page.evaluate(()=>GFArt.thumbnail('tea',1)===GFArt.thumbnail('tea',3)&&GFArt.thumbnail('tea',4)===GFArt.thumbnail('tea',6)&&GFArt.thumbnail('tea',7)===GFArt.thumbnail('tea',9)&&GFArt.thumbnail('tea',3)!==GFArt.thumbnail('tea',4)&&GFArt.thumbnail('tea',6)!==GFArt.thumbnail('tea',7)),'Nine levels reuse three distinct sprite stages');
      const mapMarkers=await page.evaluate(()=>{
        const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.style.cssText='position:fixed;left:-10000px;width:390px;height:844px';document.body.append(canvas);
        const ctx=canvas.getContext('2d'),oldText=ctx.fillText,oldFill=ctx.fill,oldRect=ctx.fillRect;let texts=[],fills=[];
        ctx.fillText=function(text,x,y){texts.push({text:String(text),font:this.font,color:this.fillStyle});return oldText.apply(this,arguments);};
        ctx.fill=function(){fills.push(this.fillStyle);return oldFill.apply(this,arguments);};
        ctx.fillRect=function(){fills.push(this.fillStyle);return oldRect.apply(this,arguments);};
        const capture=(zoom,rich,level=1)=>{texts=[];fills=[];const s=GF.createState(null),shrine=s.buildings[0];shrine.level=level;shrine.hp=GF.maxHP(shrine);if(rich)s.coins=s.materials=10000;GFArt.render(canvas,s,{x:195-(GF.worldCenter(s)+.5)*GFArt.T*zoom,y:400-(GF.worldCenter(s)+.5)*GFArt.T*zoom,zoom},null);return {name:texts.some(t=>t.text==='祠堂'&&t.font.includes('Microsoft YaHei')),level:texts.some(t=>t.text==='1'&&t.font.includes('900 11px')&&t.font.includes('SimHei')&&t.color==='#f4ebd2'),level15:texts.some(t=>t.text==='15'&&t.font.includes('900 11px')&&t.color==='#f4ebd2'),levelBackground:fills.includes('#52685a'),arrow:fills.includes('#b4df63')};};
        const result={far:capture(.8,false),near:capture(1,false),level15:capture(1,false,15),upgradable:capture(1,true)};canvas.remove();return result;
      });
      assert.equal(mapMarkers.far.name,false,'Building names stay hidden until the camera is close');
      assert.equal(mapMarkers.near.name,true,'Building names appear after zooming in');
      assert(mapMarkers.far.level&&mapMarkers.near.level,'A bold cream-colored Arabic level remains visible');
      assert(mapMarkers.level15.level15,'Two-digit levels render correctly');
      assert.equal(mapMarkers.far.levelBackground,true,'Level text has a muted gray-green background');
      assert.equal(mapMarkers.far.arrow,false);assert.equal(mapMarkers.upgradable.arrow,true,'Upgradeable buildings show the green arrow');
      assert.equal(await page.locator('#speed,#map-tools,.map-tools,#grid-toggle,.mission-card,#idle-hint,#help').count(),0);
      assert(await page.locator('#startup-error').isHidden());
      // Menu and pause are the same action. Time, payouts and income counters must all stop.
      await page.locator('#menu-pause').click();assert(await page.locator('#modal').isVisible());
      const paused=await page.evaluate(()=>({time:Gufang.state.time,coins:Gufang.state.coins,counter:Gufang.state.buildings[0].incomeTime}));
      await page.waitForTimeout(1100);
      assert.deepEqual(await page.evaluate(()=>({time:Gufang.state.time,coins:Gufang.state.coins,counter:Gufang.state.buildings[0].incomeTime})),paused);
      await page.screenshot({path:path.join(shots,`menu-v2-${viewport.width}.png`)});
      await page.locator('[data-modal="close"]').click();const resume=await page.evaluate(()=>Gufang.state.time);
      await page.waitForTimeout(1250);const elapsed=await page.evaluate(()=>Gufang.state.time)-resume;
      assert(elapsed>.9&&elapsed<1.6,'Time runs at fixed 1× speed');
      // Freeze via the background-tab mechanism for deterministic construction and screenshots.
      await freeze(page);await page.screenshot({path:path.join(shots,`initial-v2-${viewport.width}.png`)});
      const camera=await page.evaluate(()=>Gufang.camera),canvasBefore=await page.locator('#map').boundingBox();
      await mapClick(page,7,8);assert(await page.locator('#build-view').isVisible());
      assert.equal(await page.locator('[data-category],.categories').count(),0,'All buildings share one list');
      for(const type of ['home','market','fence','earth','tao','stage','well','rock','zhong'])assert.equal(await page.locator(`[data-build="${type}"]`).count(),0,type+' is not directly buildable');
      assert(await page.locator('[data-build="tea"]').count());assert(await page.locator('[data-build="tower"]').count());assert(await page.locator('[data-build="fortune"]').count());
      assert.deepEqual(await page.locator('.build-card').evaluateAll(cards=>cards.map(card=>card.dataset.build)),['tea','tower','fortune','barracks'],'Buildable cards lead the selection snapshot in industry, defense, fortune order');
      assert.equal(await page.locator('[data-build="fortune"] .card-effect').innerText(),'变化为随机建筑');
      assert(await page.locator('[data-build="barracks"] .card-reason').isHidden());
      assert.equal(await page.locator('[data-build="barracks"] .cost-number.insufficient').count(),2);
      const cardFit=await page.evaluate(()=>{const cards=document.getElementById('cards'),card=cards.querySelector('.build-card'),style=getComputedStyle(cards);return (cards.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)+6)/(card.getBoundingClientRect().width+6);});
      assert(cardFit>4.25&&cardFit<4.6,`One screen shows about 4.4 cards, got ${cardFit}`);
      assert.equal(await page.locator('[data-build="fortune"] .chain-tag').textContent(),'造');
      const fortuneBadges=await page.locator('[data-build="fortune"]').evaluate(el=>{const tag=el.querySelector('.chain-tag').getBoundingClientRect(),count=el.querySelector('.card-count').getBoundingClientRect();return {tagWidth:tag.width,overlap:tag.right>count.left};});
      assert(fortuneBadges.tagWidth<30&&!fortuneBadges.overlap,'Type badge stays compact and clear of the count');
      assert((await page.locator('[data-build="tea"] .card-count').textContent()).includes('0/6'));
      await mapClick(page,6,8);
      assert(await page.locator('[data-build="tea"]').count());assert(await page.locator('[data-build="tower"]').count());
      await mapClick(page,7,8);
      await page.evaluate(()=>{const s=Gufang.state;for(const [type,x,y] of [['bank',14,7],['wine',14,8],['tailor',15,7],['trade',15,9]])GF.grantBuilding(s,type,x,y);Gufang.select(15,8);});
      assert.equal(await page.locator('[data-build="guild"] strong').textContent(),'汇财会馆');
      assert.equal(await page.locator('[data-build="port"] strong').textContent(),'百工院');
      assert((await page.locator('[data-build="guild"] .card-effect').innerText()).includes('全镇铜钱收入 +5%'));
      assert((await page.locator('[data-build="port"] .card-effect').innerText()).includes('全镇工材收入 +10%'));
      for(const type of ['guild','port']){
        const raw=await page.evaluate(()=>GF.serialize(Gufang.state)),s=G.restore(raw),d=G.DEFS[type];
        const b={type,x:15,y:8,level:1};s.buildings.push(b);
        const total=G.income(s,b),bonus=String(Math.round((total-d.income+Number.EPSILON)*10)/10);
        const resource=d.resource==='materials'?'工材':'铜钱';
        assert.equal((await page.locator(`[data-build="${type}"] .card-effect`).innerText()).split('\n')[0],`${resource} +${d.income}（+${bonus}）/秒`,type+' ultimate card matches core');
        for(const [resource,icon] of [['coins','coin-icon'],['materials','material-icon']]){
          assert.equal(await page.locator(`[data-build="${type}"] .cost-part:has(.${icon}) .cost-number`).textContent(),String(d.cost[resource]),type+' two-resource card cost');
        }
        assert(type==='guild'?d.cost.materials>d.cost.coins:d.cost.coins>d.cost.materials);
      }
      assert.deepEqual(await page.evaluate(()=>Gufang.camera),camera,'Panel never moves the camera');
      assert.deepEqual(await page.locator('#map').boundingBox(),canvasBefore,'Panel overlays the map');
      await page.evaluate(()=>Gufang.select(12,4));
      assert.equal(await page.locator('[data-build="mulberry"]').getAttribute('aria-disabled'),'false');
      assert.equal(await page.locator('[data-build="weaver"]').count(),0,'Terrain-invalid buildings are hidden');
      await page.evaluate(()=>Gufang.select(13,13));
      assert.equal(await page.locator('[data-build="quarry"]').getAttribute('aria-disabled'),'false');
      assert.equal(await page.locator('[data-build="kiln"]').count(),0,'Terrain-invalid buildings are hidden');
      await page.evaluate(()=>Gufang.select(6,11));
      assert((await page.locator('#plot-label').textContent()).startsWith('水域'));
      assert.equal(await page.locator('.build-card').count(),0,'Water hides every construction card');
      await page.evaluate(()=>Gufang.select(7,8));
      const height=(await page.locator('#panel').boundingBox()).height;
      assert.equal(await page.locator('[data-build="farm"]').count(),0,'A farm is hidden where terrain and water access reject it');
       assert.equal(await page.locator('[data-build="tea"] .card-effect').innerText(),'铜钱 +2/秒');
      await page.locator('[data-build="tea"]').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='tea').length),1);
      assert(Math.abs((await page.locator('#panel').boundingBox()).height-height)<.1);
      assert.equal(await page.locator('#upgrade-building').evaluate(el=>el.firstChild.textContent),'升级');
      assert.equal(await page.locator('#upgrade-label .material-icon').count(),1);
      assert.equal(await page.locator('#upgrade-label').evaluate(el=>/铜钱|工材|差/.test(el.textContent)),false,'Upgrade cost uses icons without resource names or shortage text');
      assert.equal(await page.locator('#upgrade-label .cost-number.insufficient').count(),1,'Only the insufficient resource number turns red');
      const shortageStyle=await page.evaluate(()=>{const el=document.querySelector('#upgrade-label .cost-number.insufficient'),s=getComputedStyle(el);return {color:s.color,background:s.backgroundColor,padding:s.padding,fontWeight:s.fontWeight};});
      assert.equal(shortageStyle.background,'rgba(0, 0, 0, 0)');assert.equal(shortageStyle.padding,'0px');assert.equal(shortageStyle.fontWeight,'400');
      await page.evaluate(()=>{const s=Gufang.state;s.materials=1000;const shrine=s.buildings.find(b=>b.type==='shrine');shrine.level=2;shrine.hp=GF.maxHP(shrine);Gufang.refresh();});
      assert.equal(await page.locator('#upgrade-label .cost-number.insufficient').count(),0);
      await page.locator('#upgrade-building').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='tea').level),2);
       assert((await page.locator('.detail-revenue').textContent()).includes('+4/秒'));
      assert.equal(await page.locator('.detail-revenue .coin-icon').count(),1);
      await page.screenshot({path:path.join(shots,`detail-v2-${viewport.width}.png`)});
      await page.evaluate(()=>{Gufang.state.coins=0;Gufang.state.materials=0;Gufang.select(7,7);});
      const poorOrder=await page.locator('.build-card').evaluateAll(cards=>cards.map(card=>card.dataset.build));
      assert.deepEqual(poorOrder.slice(0,2),['inn','tea'],'Higher industry tiers lead within the same availability state');
      assert.equal(await page.locator('[data-build="inn"]').getAttribute('aria-disabled'),'true');
      assert(await page.locator('[data-build="inn"] .card-reason').isHidden());
      assert.equal(await page.locator('[data-build="inn"] .cost-number.insufficient').count(),2);
      await page.evaluate(()=>{Gufang.state.coins=2000;Gufang.refresh();});
      assert.equal(await page.locator('[data-build="inn"] .cost-part:has(.coin-icon) .cost-number.insufficient').count(),0);
      assert.equal(await page.locator('[data-build="inn"] .cost-part:has(.material-icon) .cost-number.insufficient').count(),1);
      await page.evaluate(()=>{Gufang.state.coins=2000;Gufang.state.materials=2000;Gufang.refresh();});
      assert.equal(await page.locator('[data-build="inn"]').getAttribute('aria-disabled'),'false');
      assert.equal(await page.locator('[data-build="inn"] .cost-number.insufficient').count(),0);
      assert.deepEqual(await page.locator('.build-card').evaluateAll(cards=>cards.map(card=>card.dataset.build)),poorOrder,'Resource changes unlock cards without moving them');
      await page.evaluate(()=>Gufang.select(7,7));
      const refreshedOrder=await page.locator('.build-card').evaluateAll(cards=>cards.map(card=>card.dataset.build));
      assert(refreshedOrder.indexOf('fortune')<poorOrder.indexOf('fortune'),'Reselecting the tile moves newly buildable cards forward');
      await page.locator('[data-build="inn"]').click();
      await page.locator('#upgrade-building').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='inn').level),2);
      const overlays=await page.evaluate(()=>{
        const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.style.cssText='position:fixed;left:-10000px;width:390px;height:844px';document.body.append(canvas);
        const ctx=canvas.getContext('2d'),oldStroke=ctx.stroke,oldRect=ctx.strokeRect,oldBegin=ctx.beginPath,oldLineTo=ctx.lineTo;let lines=0,frames=0,segments=[],frameSizes=[],pathSegments=0;
        ctx.beginPath=function(){pathSegments=0;return oldBegin.apply(this,arguments);};
        ctx.lineTo=function(){pathSegments++;return oldLineTo.apply(this,arguments);};
        ctx.stroke=function(){if(this.getLineDash().length&&pathSegments&&Math.abs(this.lineWidth-1.4)>1e-6){lines++;segments.push(pathSegments);}return oldStroke.apply(this,arguments);};
        ctx.strokeRect=function(x,y,w,h){if(this.getLineDash().length){frames++;frameSizes.push([w,h]);}return oldRect.apply(this,arguments);};
        const capture=(selected,state=Gufang.state)=>{lines=0;frames=0;segments=[];frameSizes=[];GFArt.render(canvas,state,Gufang.camera,selected);return {lines,frames,segments,frameSizes};};
        const result={none:capture(null),empty:capture({x:6,y:6}),tea:capture({x:7,y:8}),inn:capture({x:7,y:7})};
        const sample=GF.createState(null);sample.coins=sample.materials=1000000;
        GF.build(sample,'tea',9,7);GF.build(sample,'inn',9,8);GF.build(sample,'bank',9,9);
        for(const [type,x,y] of [['farm',5,8],['mill',6,9],['wine',7,8],['mulberry',11,3],['tower',8,7]]){
          const built=GF.build(sample,type,x,y);if(!built.ok)throw Error(type+': '+built.reason);
        }
        for(const [type,x,y] of [['well',10,10],['stage',10,9],['earth',6,6]])if(!GF.grantBuilding(sample,type,x,y))throw Error(type+' grant failed');
        result.bank=capture({x:9,y:9},sample);
        for(const [type,x,y] of [['farm',5,8],['mill',6,9],['wine',7,8],['mulberry',11,3],['well',10,10],['tower',8,7],['stage',10,9],['earth',6,6],['shrine',8,8]])result[type]=capture({x,y},sample);
        const guild=GF.build(sample,'guild',8,9);if(!guild.ok)throw Error('guild: '+guild.reason);
        result.guild=capture({x:8,y:9},sample);
        canvas.remove();return result;
      });
      assert.deepEqual(overlays.none,{lines:0,frames:0,segments:[],frameSizes:[]});assert.deepEqual(overlays.empty,{lines:0,frames:0,segments:[],frameSizes:[]});
      assert(overlays.tea.lines>=1&&overlays.tea.frames>=1,'Selected tea shows its inn link and range frame');
      assert(overlays.inn.lines>=1&&overlays.inn.frames>=1,'Selected inn shows its tea link and range frame');
      assert.equal(overlays.bank.lines,1,'Bank links to the inn but not tea two tiers earlier');
      assert.equal(overlays.farm.lines,1,'Farm links only to the mill');
      assert.equal(overlays.mill.lines,2,'Mill links to farm and winery');
      assert.equal(overlays.wine.lines,1,'Winery links to mill but not farm');
      assert.equal(overlays.guild.lines,2,'Copper ultimate links only to bank and winery');
      for(const type of ['bank','farm','mill','wine','guild'])assert(overlays[type].segments.every(n=>n===1),type+' uses only straight segments');
      for(const type of ['farm','mulberry'])assert.equal(overlays[type].frames,0,type+' has no zero-range frame');
      assert.deepEqual(overlays.well.frameSizes,[[188,188]],'well has a one-tile radius');
      assert.equal(overlays.earth.frames,1,'earth shows its three-tile guard radius');
      for(const type of ['tower','stage','shrine'])assert.equal(overlays[type].frames,0,type+' has no range frame');
      const shootingRange=await page.evaluate(()=>{
        const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.style.cssText='position:fixed;left:-10000px;width:390px;height:844px';document.body.append(canvas);
        const ctx=canvas.getContext('2d'),oldArc=ctx.arc,s=GF.createState(null);GF.grantBuilding(s,'tower',8,7,3);let radii=[];
        ctx.arc=function(x,y,r){radii.push(r);return oldArc.apply(this,arguments);};
        GFArt.render(canvas,s,Gufang.camera,{x:8,y:7});const selected=[...radii];radii=[];GFArt.render(canvas,s,Gufang.camera,null);canvas.remove();return {selected,closed:radii};
      });
      assert(shootingRange.selected.includes((G.DEFS.tower.range+2*.35)*64),'Selected tower displays the actual level-scaled circular shooting range');
      assert.equal(shootingRange.closed.length,0,'Closing selection hides the shooting range');
      await page.evaluate(()=>Gufang.select(7,8));
      await page.screenshot({path:path.join(shots,`selection-range-${viewport.width}.png`)});
      await page.evaluate(()=>Gufang.select(7,7));
      await page.locator('#demolish-building').click();assert(await page.locator('[data-modal="confirm-demolish"]').isVisible(),'Demolish asks for confirmation');
      await page.locator('[data-modal="confirm-demolish"]').click();assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='inn').length),0);
      assert(await page.locator('#cards').evaluate(e=>e.scrollWidth>e.clientWidth));
      await page.screenshot({path:path.join(shots,`build-v2-${viewport.width}.png`)});
      await page.locator('#close-panel').click();
      await mapClick(page,5,8);
      assert((await page.locator('#plot-label').textContent()).startsWith('水岸'));
      assert.equal(await page.locator('[data-build="farm"]').getAttribute('aria-disabled'),'false','A shore tile accepts a farm');
      await page.locator('[data-build="farm"]').click();
      assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='farm').length),1);
      await page.locator('#close-panel').click();
      await page.evaluate(()=>Gufang.select(9,9));
      assert.equal(await page.locator('[data-build="farm"]').count(),0,'An inland farm without a well is hidden');
      await page.evaluate(()=>{GF.grantBuilding(Gufang.state,'well',10,10);Gufang.select(9,9);});
      assert.equal(await page.locator('[data-build="farm"]').getAttribute('aria-disabled'),'false','A plain tile diagonally adjacent to a well accepts a farm');
      assert.equal(await page.locator('[data-build="farm"] .card-effect').innerText(),'铜钱 +1（+0.4）/秒');
      await page.locator('[data-build="farm"]').click();
      assert.equal(await page.evaluate(()=>Gufang.state.buildings.filter(b=>b.type==='farm').length),2);
      assert((await page.locator('.detail-revenue').textContent()).includes('+1（+0.4）/秒'));
      assert.equal(await page.locator('.detail-revenue .income-bonus').evaluate(e=>getComputedStyle(e).color),'rgb(58, 135, 78)');
      await page.locator('#close-panel').click();
      if(viewport.width===390){
        const hp=await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='farm'&&b.x===9&&b.y===9).hp);
        await page.evaluate(()=>Gufang.select(10,10));await page.locator('#demolish-building').click();
        assert((await page.locator('#modal-content').textContent()).includes('持续掉耐久'));
        await page.locator('[data-modal="confirm-demolish"]').click();
        await page.evaluate(()=>{for(let i=0;i<10;i++)GF.step(Gufang.state,.1);Gufang.refresh();});
        assert((await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='farm'&&b.x===9&&b.y===9).hp))<hp);
        await page.evaluate(()=>Gufang.select(9,9));
        assert.equal(await page.locator('.detail-description').count(),0);
        assert((await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='farm'&&b.x===9&&b.y===9).hp))<hp,'Dry farm damage remains in the core');
        await page.evaluate(()=>{GF.grantBuilding(Gufang.state,'well',10,10);GF.grantBuilding(Gufang.state,'stage',10,9);Gufang.select(8,8);});
        assert((await page.locator('.detail-revenue').textContent()).includes('+2（+0.1）/秒'));
        assert.equal(await page.locator('.detail-revenue .income-bonus').count(),1,'Shrine stage bonus remains visible with doubled income');
        await page.locator('#close-panel').click();
      }
      // Multiple buildings each get an actual integer payout and a matching floating coin amount.
      await page.evaluate(()=>{const s=Gufang.state;GF.build(s,'inn',7,7);GF.build(s,'tower',8,7);GF.grantBuilding(s,'earth',9,8);GF.build(s,'mulberry',11,3);s.effects=[];for(let i=0;i<10;i++)GF.step(s,.1);Gufang.refresh();document.getElementById('toast').className='';});
      const floats=await page.evaluate(()=>Gufang.state.effects.filter(e=>e.type==='income').map(e=>({amount:e.amount,id:e.buildingId,resource:e.resource})));
      assert(floats.length>=2);assert(floats.every(e=>Number.isInteger(e.amount)&&e.amount>0));
      assert(floats.some(e=>e.resource==='materials'),'Material income floats above its producer');
      await page.screenshot({path:path.join(shots,`income-v2-${viewport.width}.png`)});
      const beforePan=await page.evaluate(()=>Gufang.camera),cx=frame.x+frame.width*.5,cy=frame.height*.48;
      await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+36,cy+24,{steps:6});await page.mouse.up();
      const afterPan=await page.evaluate(()=>Gufang.camera);assert(afterPan.x!==beforePan.x&&afterPan.y!==beforePan.y);
      await page.mouse.wheel(0,-200);await page.waitForTimeout(80);assert((await page.evaluate(()=>Gufang.camera.zoom))>afterPan.zoom);
      if(viewport.width===390){
        const cdp=await context.newCDPSession(page),z=await page.evaluate(()=>Gufang.camera.zoom);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:390,id:1},{x:230,y:390,id:2}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:95,y:400,id:1},{x:275,y:400,id:2}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert((await page.evaluate(()=>Gufang.camera.zoom))>z);
      }
      await page.evaluate(()=>Gufang.select(6,6));await page.locator('#close-panel').click();
      await page.evaluate(()=>Gufang.save());await page.reload();await page.waitForFunction(()=>!!window.Gufang);await enterFromMenu(page);await freeze(page);
      assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='tea').level),2);
      await page.evaluate(()=>Gufang.select(6,6));
      assert(await page.locator('[data-build="tower"]').count());assert.equal(await page.locator('[data-category]').count(),0);
      await page.locator('#close-panel').click();
       await page.evaluate(()=>{const s=Gufang.state;s.coins=10000;s.materials=10000;GF.startNight(s);for(let i=0;i<100;i++)GF.step(s,.1);Gufang.refresh();});
       assert.deepEqual(await page.locator('[data-skill]:visible').evaluateAll(els=>els.map(el=>el.dataset.skill)),['repel']);
      await page.locator('[data-skill="repel"]').click();assert((await page.evaluate(()=>Gufang.state.cooldowns.repel))>0);assert.equal(await page.evaluate(()=>'incense' in Gufang.state),false);
      if(viewport.width===390){
        await page.evaluate(()=>Gufang.select(6,6));
        const count=await page.evaluate(()=>Gufang.state.buildings.length);
        assert((await page.locator('#plot-label').textContent()).includes('可兴建'));
        assert.equal(await page.locator('[data-build="tower"]').getAttribute('aria-disabled'),'false');
        await page.locator('[data-build="tower"]').click();
        assert.equal(await page.evaluate(()=>Gufang.state.buildings.length),count+1);
        await page.evaluate(()=>Gufang.select(8,7));
        assert.equal(await page.locator('#upgrade-building').getAttribute('aria-disabled'),'false');
        await page.locator('#upgrade-building').click();
        assert.equal(await page.evaluate(()=>Gufang.state.buildings.find(b=>b.type==='tower'&&b.x===8&&b.y===7).level),2);
        await page.locator('#demolish-building').click();
        assert(await page.locator('[data-modal="confirm-demolish"]').isVisible());
        await page.locator('[data-modal="confirm-demolish"]').click();
        assert.equal(await page.evaluate(()=>Gufang.state.buildings.length),count);
      }
      await page.screenshot({path:path.join(shots,`night-v2-${viewport.width}.png`)});
      assert.deepEqual(errors,[],`No JS errors at ${viewport.width}px`);
      console.log(`PASS ${viewport.width}×${viewport.height}: portrait UI, menu/pause, 1× time, build, upgrade, floats, pan/pinch, save, skills`);
      await context.close();
    }
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
      const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:viewport.width===390}),page=await context.newPage(),errors=[];
      await sourceContext(context);
       // Freeze simulation, not rendering: hidden pages intentionally skip all drawing.
       await context.addInitScript(()=>{
         window.startedWithoutSave=localStorage.getItem('gufang-qitan-save-v1')===null;
         Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});
         let game;Object.defineProperty(window,'GF',{configurable:true,get:()=>game,set(value){value.step=()=>{};game=value;}});
       });
      page.on('pageerror',e=>errors.push(e.stack));
      await page.goto(url('dist/古坊奇谭.html'));await page.waitForFunction(()=>!!window.Gufang);await enterFromMenu(page);
      assert.equal(await page.evaluate(()=>window.startedWithoutSave),true,'Default estate starts without an old localStorage save');
       assert.deepEqual(await page.evaluate(()=>[Gufang.state.coins,Gufang.state.materials]),[150,200],'New estate starts with 150 coins and 200 materials');
       assert.equal(await page.evaluate(()=>Gufang.state.selectedSkill),'thunder');
       await page.evaluate(()=>{GF.startNight(Gufang.state);Gufang.refresh();});
       assert.deepEqual(await page.locator('[data-skill]:visible').evaluateAll(els=>els.map(el=>el.dataset.skill)),['thunder']);
       await page.locator('[data-skill="thunder"]').click();
       assert(await page.evaluate(()=>Gufang.state.cooldowns.thunder>0));
       await page.evaluate(()=>{Gufang.state.phase='day';Gufang.state.wave=null;Gufang.refresh();});
       await page.evaluate(()=>{Gufang.state.coins=Gufang.state.materials=10000;Gufang.refresh();});
      assert.deepEqual(await page.evaluate(()=>({size:GF.SIZE,center:GF.CENTER,worldSize:GF.worldSize(Gufang.state),worldCenter:GF.worldCenter(Gufang.state),legacySize:GF.worldSize(GF.createState(null)),legacyCenter:GF.worldCenter(GF.createState(null)),gates:Gufang.state.buildings.filter(b=>b.type==='gate').length})),{size:25,center:12,worldSize:25,worldCenter:12,legacySize:17,legacyCenter:8,gates:4});
      assert(await page.locator('#startup-error').isHidden());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const plots=await page.evaluate(()=>{
        const s=Gufang.state,size=GF.worldSize(s),land=GF.estate(s),center=GF.worldCenter(s),point=key=>({x:key%size,y:Math.floor(key/size)});
        const find=(terrain,type)=>{
          const key=[...land.cells].sort((a,b)=>Math.abs(a%size-center)+Math.abs(Math.floor(a/size)-center)-Math.abs(b%size-center)-Math.abs(Math.floor(b/size)-center)).find(key=>GF.terrain(key%size,Math.floor(key/size),s)===terrain&&!GF.buildReason(s,type,key%size,Math.floor(key/size)));
          if(key===undefined)throw Error('No estate plot for '+terrain+'/'+type+'; seed '+s.mapSeed);
          return point(key);
        };
        return {tea:find('plain','tea'),forest:find('forest','mulberry'),mountain:find('mountain','quarry'),wall:point([...land.walls][0]),outside:{x:0,y:0},gates:land.gates};
      });
      await page.evaluate(()=>{
        const render=GFArt.render;
        GFArt.render=function(canvas,s,cam,...args){
          cam.zoom=.22;cam.x=(canvas.clientWidth-GF.worldSize(s)*GFArt.T*cam.zoom)/2;cam.y=canvas.clientHeight*.48-GF.worldSize(s)*GFArt.T*cam.zoom/2;
          GFArt.render=render;return render(canvas,s,cam,...args);
        };
      });
      await page.waitForFunction(()=>Gufang.camera.zoom===.22);
      assert.equal(await page.evaluate(()=>{const cam=Gufang.camera,canvas=document.getElementById('map');return cam.x>=0&&cam.x+GF.worldSize(Gufang.state)*GFArt.T*cam.zoom<=canvas.clientWidth&&cam.y>=0&&cam.y+GF.worldSize(Gufang.state)*GFArt.T*cam.zoom<=canvas.clientHeight;}),true,'All 25 rows and columns fit in the runtime camera');
      await page.screenshot({path:path.join(shots,`estate-full-${viewport.width}.png`)});
      for(const [plot,hint] of [[plots.outside,'庄园外区域'],[plots.wall,'庄园城墙']]){
        await mapClick(page,plots.tea.x,plots.tea.y);assert(await page.locator('#build-view').isVisible());
        await mapClick(page,plot.x,plot.y);
        assert(await page.locator('#panel').isHidden());assert(await page.locator('#toast').isVisible());
        assert((await page.locator('#toast').textContent()).includes(hint));
      }
      await mapClick(page,plots.tea.x,plots.tea.y);
      assert.equal(await page.locator('[data-build="gate"]').count(),0,'Fixed gates never appear as build cards');
      assert.equal(await page.locator('[data-build="tea"]').getAttribute('aria-disabled'),'false');
      await page.locator('[data-build="tea"]').click();
      assert.equal(await page.evaluate(p=>GF.at(Gufang.state,p.x,p.y)?.type,plots.tea),'tea');
      assert(await page.locator('#detail-view').isVisible());await page.locator('#close-panel').click();
      for(const [plot,type,hidden] of [[plots.forest,'mulberry','weaver'],[plots.mountain,'quarry','kiln']]){
        await mapClick(page,plot.x,plot.y);
        assert.equal(await page.locator('[data-build="'+type+'"]').getAttribute('aria-disabled'),'false');
        assert.equal(await page.locator('[data-build="'+hidden+'"]').count(),0,'Invalid terrain card is hidden');
        assert.equal(await page.locator('[data-build="tea"],[data-build="gate"]').count(),0);
        await page.locator('#close-panel').click();
      }
      await page.evaluate(()=>{const s=Gufang.state,shrine=s.buildings.find(b=>b.type==='shrine');shrine.level=2;shrine.hp=GF.maxHP(shrine);s.coins=s.materials=10000;Gufang.refresh();});
       const gateCost=await page.evaluate(()=>GF.upgradeCost(Gufang.state.buildings.find(b=>b.type==='gate')));
       for(const [i,gate] of plots.gates.entries()){
        await mapClick(page,gate.x,gate.y);
        assert(await page.locator('#detail-view').isVisible());assert(await page.locator('#build-view').isHidden());
        assert.equal(await page.locator('#plot-label').textContent(),['北','东','南','西'][gate.direction]+'城门');
        assert(await page.locator('#demolish-building').isDisabled());
         if(i===0){
           assert.equal(await page.locator('#upgrade-building').getAttribute('aria-disabled'),'false');
            assert.equal(await page.locator('#upgrade-building').evaluate(el=>el.firstChild.textContent),'升级');
           await page.locator('#upgrade-building').click();
           assert.deepEqual(await page.evaluate(()=>({gateLevel:Gufang.state.gateLevel,levels:Gufang.state.buildings.filter(b=>b.type==='gate').map(b=>b.level),coins:Gufang.state.coins,materials:Gufang.state.materials})),{gateLevel:2,levels:[2,2,2,2],coins:10000-gateCost.coins,materials:10000-gateCost.materials});
         }
         assert.equal(await page.locator('#upgrade-building').evaluate(el=>el.firstChild.textContent),'升级');
        assert.equal(await page.evaluate(g=>GF.at(Gufang.state,g.x,g.y).level,gate),2);
        assert.equal(await page.locator('.level-badge').textContent(),'Lv.2');
        await page.locator('#close-panel').click();
      }
      await page.evaluate(()=>{const gates=Gufang.state.buildings.filter(b=>b.type==='gate');gates.forEach((g,i)=>{g.hp=i===0?0:GF.maxHP(g)-i*73;});});
      await mapClick(page,plots.gates[0].x,plots.gates[0].y);
      assert.equal(await page.locator('.detail-description').count(),0);
      assert((await page.locator('#detail-hp').textContent()).startsWith('0 / '));
      assert(await page.locator('#demolish-building').isDisabled());assert(await page.locator('#build-view').isHidden());
      await page.screenshot({path:path.join(shots,`estate-gate-destroyed-${viewport.width}.png`)});
       const snapshot=()=>{const s=Gufang.state,land=GF.estate(s);return {mapSeed:s.mapSeed,estateSeed:s.estateSeed,gateLevel:s.gateLevel,size:GF.worldSize(s),cells:[...land.cells],walls:[...land.walls],roads:[...land.roads],gates:s.buildings.filter(b=>b.type==='gate').map(b=>({id:b.id,x:b.x,y:b.y,direction:b.direction,level:b.level,hp:b.hp})),tea:s.buildings.filter(b=>b.type==='tea').map(b=>({x:b.x,y:b.y,level:b.level,hp:b.hp}))};};
      const saved=await page.evaluate(snapshot);assert.equal(await page.evaluate(()=>Gufang.save()),true);
      await page.reload();await page.waitForFunction(()=>!!window.Gufang);await enterFromMenu(page);
      assert.deepEqual(await page.evaluate(snapshot),saved,'Estate seeds, walls, roads, four upgraded gates and damaged HP survive reload');
      await page.evaluate(g=>Gufang.select(g.x,g.y),plots.gates[0]);
      assert.equal(await page.locator('.detail-description').count(),0);
      assert((await page.locator('#detail-hp').textContent()).startsWith('0 / '));
      assert(await page.locator('#demolish-building').isDisabled());
      assert.deepEqual(errors,[],`No single-file estate JS errors at ${viewport.width}px`);
      console.log(`PASS default ${sourceOnly?'source':'single-file'} estate ${viewport.width}: 25 tiles, four gates, plot restrictions, tea, terrain UI, gate upgrades/destruction, save/reload`);
      await context.close();
    }
    // Reproduce the old failure in a WebView that rejects dvh, then verify both CSS and JS fallbacks.
    const compat=await browser.newPage({viewport:{width:390,height:844}}),compatErrors=[];
    await sourceContext(compat.context());
    compat.on('pageerror',e=>compatErrors.push(e.message));
    await compat.context().addInitScript(initLegacySave,legacySave);
    await compat.goto(url('index.html'));await compat.waitForFunction(()=>!!window.Gufang);await enterFromMenu(compat);
    await compat.setContent('<style>html,body{margin:0}#game{position:relative;height:100unsupported;overflow:hidden}#map{position:absolute;height:100%}</style><main id="game"><canvas id="map"></canvas></main>');
    assert.equal(await compat.locator('#game').evaluate(e=>e.clientHeight),0,'Old dvh-only layout collapses to zero');
    const html=(sourceOnly?fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<link[^>]+href="css\/style.css"[^>]*>/,()=>'<style>'+fs.readFileSync(path.join(root,'css','style.css'),'utf8')+'</style>').replace(/<script[^>]+src="js\/(boot|runtime).js"[^>]*><\/script>/g,'').replace('</body>',()=>'<script>'+['boot','game','art','autoplay','app'].map(name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8')).join('\n;\n')+'</script></body>'):fs.readFileSync(path.join(root,'dist','古坊奇谭.html'),'utf8')).replace(/100dvh/g,'100unsupported');
    await compat.setContent(html.replace(/<script[\s\S]*?<\/script>/gi,''));
    assert.equal(await compat.locator('#game').evaluate(e=>e.clientHeight),844,'CSS vh fallback works before JS starts');
    await compat.evaluate(()=>{Object.hasOwn=undefined;HTMLDialogElement.prototype.showModal=undefined;Object.defineProperty(window,'visualViewport',{value:undefined,configurable:true});});
    await compat.setContent(html);await compat.waitForFunction(()=>!!window.Gufang);await enterFromMenu(compat);
    assert.equal(await compat.locator('#game').evaluate(e=>e.clientHeight),844,'Pixel fallback works without visualViewport');
    assert(await compat.locator('#startup-error').isHidden());await mapClick(compat,7,8);await compat.locator('[data-build="tea"]').click();
    await compat.locator('#menu-pause').click();assert(await compat.locator('#modal').isVisible());
    assert.deepEqual(compatErrors,[]);console.log('PASS legacy Android compatibility simulation: no dvh, no Object.hasOwn, no native dialog, no visualViewport');
    await compat.close();
    const standalone=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    await sourceContext(standalone.context());
    standalone.on('pageerror',e=>errors.push(e.message));
    const old=G.createState(null);old.coins=1234;delete old.selectedSkill;delete old.materials;old.prosperity=77;for(const b of old.buildings){delete b.incomeTime;delete b.coinPending;delete b.materialPending;delete b.incensePending;}
    await standalone.addInitScript(raw=>localStorage.setItem('gufang-qitan-save-v1',raw),JSON.stringify(old));
    await standalone.goto(url('dist/古坊奇谭.html'));await standalone.waitForFunction(()=>!!window.Gufang);await enterFromMenu(standalone);await freeze(standalone);
    assert.equal(await standalone.evaluate(()=>Gufang.state.selectedSkill),null);
    assert(await standalone.locator('[data-modal="choose-skill"]').first().isVisible());
    assert.equal(await standalone.evaluate(()=>Gufang.paused),true);
    assert(await standalone.locator('#close-modal').isHidden());
    await standalone.keyboard.press('Escape');
    await standalone.locator('#modal').click({position:{x:1,y:1}});
    assert.equal(await standalone.locator('[data-modal="choose-skill"]:visible').count(),3);
    await standalone.locator('[data-modal="choose-skill"][data-choice="repair"]').click();
    assert.equal(await standalone.evaluate(()=>Gufang.state.selectedSkill),'repair');
    assert(await standalone.locator('#modal').isHidden());
    await standalone.evaluate(()=>{GF.startNight(Gufang.state);Gufang.refresh();});
    assert.deepEqual(await standalone.locator('[data-skill]:visible').evaluateAll(els=>els.map(el=>el.dataset.skill)),['repair']);
    await standalone.locator('[data-skill="repair"]').click();
    assert(await standalone.evaluate(()=>Gufang.state.cooldowns.repair>0));
    await standalone.evaluate(()=>{Gufang.state.phase='day';Gufang.state.wave=null;Gufang.refresh();});
    assert.equal(await standalone.evaluate(()=>Gufang.state.coins),1234);assert.equal(await standalone.evaluate(()=>Gufang.state.materials),120);assert.equal(await standalone.evaluate(()=>'prosperity' in Gufang.state),false);assert.equal(await standalone.evaluate(()=>Gufang.state.buildings[0].type),'shrine');
    await mapClick(standalone,7,8);await standalone.locator('[data-build="tea"]').click();assert.equal(await standalone.evaluate(()=>Gufang.state.buildings.length),2);
    assert.deepEqual(errors,[]);console.log(sourceOnly?'PASS source HTML and old save migration':'PASS offline single-file HTML and old save migration');await standalone.close();
  }finally{await browser.close();}
  console.log('Screenshots: '+shots);
})().catch(e=>{console.error(e);process.exitCode=1;});
