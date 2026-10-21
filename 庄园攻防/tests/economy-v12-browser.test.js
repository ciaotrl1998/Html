'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright'),G=require('../js/game'),{createServer}=require('../server');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'assets/generated/qa/economy-v12');fs.mkdirSync(qa,{recursive:true});
(async()=>{
  const server=createServer();await new Promise(resolve=>server.server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  const results=[];
  try{
    for(const offline of [false,true])for(const width of [320,390,1366]){
      const page=await browser.newPage({viewport:{width,height:800},reducedMotion:'reduce'}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
      const old=G.createState(42);old.version=11;old.players[0].coins=1234;old.players[0].materials=123;old.players[0].selectedSkill='thunder';
      await page.addInitScript(raw=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});localStorage.setItem('gufang-qitan-match-v9',raw);},JSON.stringify(old));
      await page.goto(offline?pathToFileURL(path.join(root,'dist/庄园攻防.html')).href:`http://127.0.0.1:${server.server.address().port}`);
      await page.waitForFunction(()=>window.Gufang&&window.GFUI);await page.locator('#start-load').click();
      const migrated=await page.evaluate(()=>({version:Gufang.state.version,coins:Gufang.state.players[0].coins,materials:Gufang.state.players[0].materials,
        coinRate:document.getElementById('coins-rate').textContent,materialRate:document.getElementById('materials-rate').textContent}));
      assert.deepEqual(migrated,{version:G.VERSION,coins:6170,materials:123,coinRate:'+5/秒',materialRate:'+0/秒'});
      await page.evaluate(()=>Gufang.save());
      const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('gufang-qitan-match-v9')));
      assert.equal(persisted.version,G.VERSION);assert.equal(persisted.players[0].coins,6170);
      for(const type of ['shrine','gate','shrine']){
        const before=await page.evaluate(type=>{const s=Gufang.state,p=GF.playerView(s,0);p.coins=p.materials=1e7;
          const b=p.buildings.find(b=>b.type===type);Gufang.select(b.x,b.y);Gufang.refresh();
          return {id:b.id,level:b.level,cost:GF.upgradeCost(b),coins:p.coins,materials:p.materials,shown:[...document.querySelectorAll('#upgrade-label .cost-number')].map(e=>Number(e.textContent))};},type);
        assert.deepEqual(before.shown,[before.cost.coins,before.cost.materials]);
        await page.locator('#upgrade-building').click();
        const after=await page.evaluate(id=>{const s=Gufang.state,p=GF.playerView(s,0);return {level:s.buildings.find(b=>b.id===id).level,coins:p.coins,materials:p.materials};},before.id);
        assert.equal(after.level,before.level+1);assert.equal(after.coins,before.coins-before.cost.coins);assert.equal(after.materials,before.materials-before.cost.materials);
      }
      const rates=await page.evaluate(async()=>{
        const s=Gufang.state,p=GF.playerView(s,0);for(const type of ['farm','mulberry']){
          for(let y=0;y<GF.worldHeight(s);y++){let done=false;for(let x=0;x<GF.worldWidth(s);x++)if(!GF.buildReason(p,type,x,y)){if(!GF.build(p,type,x,y).ok)throw Error('Build failed');done=true;break;}if(done)break;}
        }
        Gufang.refresh();const rate=GF.rates(p),header=document.querySelector('.topbar').getBoundingClientRect();
        const fits=[...document.querySelectorAll('.topbar .resource strong,.resource-rate')].every(e=>{const r=e.getBoundingClientRect();return r.top>=header.top&&r.bottom<=header.bottom&&r.right<=header.right;});
        const canvas=document.getElementById('map'),draw=()=>GFArt.render(canvas,s,Gufang.camera,null,{player:0,grid:true,animationTime:0,reducedMotion:true});draw();await GFArt.ready();draw();
        return {rate,text:[document.getElementById('coins-rate').textContent,document.getElementById('materials-rate').textContent],fits};
      });
      assert(rates.rate.coins>=25&&rates.rate.materials>=1);assert(rates.text.every(t=>/^\+[\d.万]+\/秒$/.test(t)));assert(rates.fits,'Resource counters/rates fit the header');
      assert.deepEqual(errors,[]);await page.screenshot({path:path.join(qa,`${offline?'offline':'source'}-${width}.png`)});
      results.push({offline,width,migrated,rates});await page.close();
      console.log(`${offline?'Offline':'Source'} ${width}: old-save conversion, live income, alternating UI prices and actual upgrade deductions passed`);
    }
    fs.writeFileSync(path.join(qa,'browser-report.json'),JSON.stringify(results,null,2));
  }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
