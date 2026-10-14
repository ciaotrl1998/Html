const {chromium}=require('playwright');
const {createServer}=require('../server');
const path=require('node:path'),os=require('node:os');
(async()=>{
 const service=createServer();await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.goto('http://127.0.0.1:'+service.server.address().port);
  await page.locator('#single-enemies').selectOption('4');await page.locator('#start-single').click();
  await page.locator('[data-choice="thunder"]').click();await page.waitForTimeout(1500);
  console.log(JSON.stringify({errors,state:await page.evaluate(()=>({players:Gufang.state.players.length,elapsed:Gufang.state.elapsed,buildings:Gufang.state.buildings.length,body:document.body.innerText.slice(-1000)}))}));
  const shot=path.join(os.tmpdir(),'gufang-attack-smoke.png');await page.screenshot({path:shot});console.log(shot);
 }finally{await browser.close();await service.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
