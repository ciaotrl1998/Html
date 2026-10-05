'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    const files=process.argv.includes('--source-only')?['index.html']:['index.html','dist/古坊奇谭.html'];
    for(const file of files)for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1440,height:1000}]){
      const context=await browser.newContext({viewport,hasTouch:viewport.width<500}),page=await context.newPage(),errors=[];
      await context.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}));
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(pathToFileURL(path.join(__dirname,'..',file)).href);await page.waitForFunction(()=>!!window.Gufang);
      await page.locator('#start-single').click();
      assert.equal(await page.locator('[data-choice]:visible').count(),3);
      assert.equal(await page.locator('#close-modal').isVisible(),false);
      assert.deepEqual(await page.evaluate(()=>[Gufang.state.elapsed,Gufang.state.selectedSkill,Gufang.paused]),[0,null,true]);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-choice]:visible').count(),3);
      await page.evaluate(()=>GFArt.render(document.getElementById('map'),Gufang.state,Gufang.camera,null,{grid:true}));
      await page.screenshot({path:path.join(os.tmpdir(),`gufang-skill-choice-${viewport.width}.png`)});
      await page.locator('[data-choice="repel"]').click();
      assert.deepEqual(await page.evaluate(()=>[Gufang.state.coins,Gufang.state.materials,Gufang.state.selectedSkill]),[150,200,'repel']);
      assert.equal(await page.evaluate(()=>GF.rates(Gufang.state).coins),1);
      await page.evaluate(()=>{GF.startNight(Gufang.state);Gufang.refresh();});
      assert.equal(await page.locator('[data-skill]:visible').count(),1);
      assert.equal(await page.locator('[data-skill]:visible').getAttribute('data-skill'),'repel');
      await page.locator('[data-skill="repel"]').click();
      assert.equal(await page.evaluate(()=>Gufang.state.cooldowns.repel),18);
      assert.equal(await page.evaluate(()=>GF.skill(Gufang.state,'thunder').ok),false);
      await page.evaluate(()=>{const b=Gufang.state.buildings.find(b=>b.type==='shrine');b.level=6;b.hp=GF.maxHP(b);Gufang.save();});
      await page.reload();await page.waitForFunction(()=>!!window.Gufang);await page.locator('#start-load').click();
      assert.equal(await page.evaluate(()=>Gufang.state.selectedSkill),'repel');
      assert.equal(await page.evaluate(()=>GF.income(Gufang.state,Gufang.state.buildings.find(b=>b.type==='shrine'))),32);
      assert.equal(await page.locator('[data-modal="choose-skill"]').count(),0);
      await context.addInitScript(()=>{const raw=JSON.parse(localStorage.getItem('gufang-qitan-save-v1'));if(raw){delete raw.selectedSkill;raw.coins=321;raw.materials=123;localStorage.setItem('gufang-qitan-save-v1',JSON.stringify(raw));}});
      await page.reload();await page.waitForFunction(()=>!!window.Gufang);await page.locator('#start-load').click();
      assert.equal(await page.locator('[data-modal="choose-skill"]').count(),3);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(),3,'Old-save selection cannot be dismissed');
      await page.locator('[data-choice="repair"]').click();
      assert.deepEqual(await page.evaluate(()=>[Gufang.state.coins,Gufang.state.materials,Gufang.state.selectedSkill]),[321,123,'repair']);
      await page.evaluate(()=>Gufang.refresh());
      assert.equal(await page.locator('[data-skill]:visible').getAttribute('data-skill'),'repair');
      await page.evaluate(()=>GFArt.render(document.getElementById('map'),Gufang.state,Gufang.camera,null,{grid:true}));
      await page.screenshot({path:path.join(os.tmpdir(),`gufang-skill-${viewport.width}.png`)});
      assert.deepEqual(errors,[]);console.log('PASS '+file+' '+viewport.width+': 150 coins / 200 materials, opening choice, single skill, exponential income, save and old-save selection');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
