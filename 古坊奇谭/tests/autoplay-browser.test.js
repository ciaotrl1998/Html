'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const G=require('../js/game.js');
const root=path.join(__dirname,'..'),sourceOnly=process.argv.includes('--source-only')||!!process.env.GUFANG_SOURCE_ONLY;
const shots=process.env.GUFANG_SHOTS||path.join(os.tmpdir(),'gufang-screenshots');fs.mkdirSync(shots,{recursive:true});
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    for(const width of [320,390,1440]){
      const context=await browser.newContext({viewport:{width,height:width===320?568:844}}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await context.route('**/js/runtime.js',route=>route.fulfill({contentType:'application/javascript',body:['game','art','autoplay','app'].map(name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8')).join('\n;\n')}));
      await page.clock.install();
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()));
      await page.goto(pathToFileURL(path.join(root,sourceOnly||width===1440?'index.html':'dist/古坊奇谭.html')).href);
      await page.waitForFunction(()=>!!window.Gufang);await page.locator('#start-single').click();
      await page.locator('[data-choice="thunder"]').click();
      assert.equal(await page.evaluate(()=>Gufang.autoplay),false);
      assert.deepEqual(await page.evaluate(()=>[Gufang.state.coins,Gufang.state.materials]),[150,200]);
      assert.equal(await page.evaluate(()=>Gufang.state.selectedSkill),'thunder');
      await page.evaluate(()=>{Gufang.state.coins=Gufang.state.materials=1000;Gufang.refresh();});
      await page.locator('#menu-pause').click();await page.locator('[data-modal="autoplay"]').click();
      assert.equal(await page.evaluate(()=>Gufang.autoplay),true);assert(await page.locator('#modal').isHidden());
      await page.clock.runFor(20000);
      assert(await page.locator('#autoplay-status').isVisible());
      const report=await page.evaluate(()=>Gufang.autoplayReport);assert(report.builds>=2);assert(report.activeSeconds>=19);
      await page.locator('#menu-pause').click();
      const paused=await page.evaluate(()=>({save:GF.serialize(Gufang.state),report:Gufang.autoplayReport}));
      await page.clock.runFor(2500);
      assert.deepEqual(await page.evaluate(()=>({save:GF.serialize(Gufang.state),report:Gufang.autoplayReport})),paused);
      assert.equal(await page.locator('[data-modal="autoplay"]').getAttribute('aria-pressed'),'true');
      await page.screenshot({path:path.join(shots,`autoplay-menu-${width}.png`)});
      const downloadPromise=page.waitForEvent('download');await page.locator('[data-modal="autoplay-report"]').click();
      const download=await downloadPromise,exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
      assert(exported.actions.length>0);assert.equal(exported.builds,paused.report.builds);assert(G.restore(JSON.stringify(exported.finalSave)));
      await page.locator('[data-modal="autoplay"]').click();assert.equal(await page.evaluate(()=>Gufang.autoplay),false);
      await page.locator('[data-modal="close"]').click();
      const stopped=await page.evaluate(()=>Gufang.autoplayReport);await page.clock.runFor(2000);
      assert.deepEqual(await page.evaluate(()=>Gufang.autoplayReport.actions),stopped.actions);
      assert.equal(await page.evaluate(()=>Gufang.autoplayReport.activeSeconds),stopped.activeSeconds);
      assert(await page.locator('#autoplay-status').isHidden());
      await page.locator('#menu-pause').click();await page.locator('[data-modal="autoplay"]').click();
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
      const hidden=await page.evaluate(()=>({save:GF.serialize(Gufang.state),time:Gufang.autoplayReport.activeSeconds}));
      await page.clock.runFor(2000);assert.deepEqual(await page.evaluate(()=>({save:GF.serialize(Gufang.state),time:Gufang.autoplayReport.activeSeconds})),hidden);
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));Gufang.state.events.push({kind:'victory',text:'七夜长明'});});
      await page.clock.runFor(100);assert(await page.locator('#modal').isHidden());assert.equal(await page.evaluate(()=>Gufang.autoplay),true);
      await page.evaluate(()=>Gufang.save());await page.reload();await page.waitForFunction(()=>!!window.Gufang);await page.locator('#start-load').click();
      assert.equal(await page.evaluate(()=>Gufang.autoplay),false);assert.equal(await page.evaluate(()=>Gufang.autoplayReport),null);
      await page.locator('#menu-pause').click();await page.locator('[data-modal="autoplay"]').click();
      await page.evaluate(()=>{
        const s=Gufang.state,c=GF.worldCenter(s);GF.startNight(s);for(let i=0;i<10&&!s.enemies.length;i++)GF.step(s,.25);
        const shrine=s.buildings.find(b=>b.type==='shrine');shrine.hp=1;
        s.cooldowns.repair=s.cooldowns.thunder=s.cooldowns.repel=100;
        const enemy=s.enemies[0];enemy.x=c;enemy.y=c-1;enemy.path=[];enemy.pathRevision=-1;enemy.damage=1e6;enemy.attack=0;enemy.hp=enemy.maxHp=1e6;
      });
      await page.clock.runFor(1000);
      assert.equal(await page.evaluate(()=>Gufang.state.over),true);assert.equal(await page.evaluate(()=>Gufang.autoplay),false);
      assert.equal(await page.locator('#modal h2').textContent(),'古坊失守');assert(await page.locator('[data-modal="autoplay-report"]').isVisible());
      assert(await page.locator('[data-modal="autoplay"]').isDisabled());
      await page.locator('[data-modal="new"]').click();assert.equal(await page.evaluate(()=>Gufang.autoplay),false);assert.equal(await page.evaluate(()=>Gufang.autoplayReport),null);
      await page.locator('[data-choice="thunder"]').click();
      assert.deepEqual(errors,[]);await context.close();
      console.log(`PASS autoplay ${width}: enable, legitimate play, pause, takeover, background pause, victory, defeat, report, reload and reset`);
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
