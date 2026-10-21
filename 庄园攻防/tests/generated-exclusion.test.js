'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
function copy(source,target){
  if(fs.statSync(source).isDirectory()){
    fs.mkdirSync(target,{recursive:true});for(const entry of fs.readdirSync(source))copy(path.join(source,entry),path.join(target,entry));
  }else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
}

test('play-only checkout builds and runs without generated, while local art validation remains strict',async()=>{
  const results=path.join(root,'test-results');fs.mkdirSync(results,{recursive:true});
  const tempRoot=fs.realpathSync(results),play=fs.mkdtempSync(path.join(tempRoot,'zhuangyuan-no-generated-'));
  let browser;
  try{
    for(const file of ['build.js','index.html','icon.png','css','js'])copy(path.join(root,file),path.join(play,file));
    for(const dir of ['sprites','tiles','ui','overlays','effects','scenery'])copy(path.join(root,'assets',dir),path.join(play,'assets',dir));
    assert.equal(fs.existsSync(path.join(play,'assets/generated')),false);
    const run=()=>spawnSync(process.execPath,['build.js'],{cwd:play,encoding:'utf8',env:{...process.env,NODE_PATH:[path.join(root,'node_modules'),process.env.NODE_PATH].filter(Boolean).join(path.delimiter)}});
    const built=run();assert.equal(built.status,0,built.stderr);assert.match(built.stdout,/使用已提交的建筑渲染配置/);
    assert(fs.existsSync(path.join(play,'dist/庄园攻防.html')));assert.equal(fs.existsSync(path.join(play,'assets/generated')),false);
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
    for(const entry of ['index.html','dist/庄园攻防.html']){
      const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});page.on('request',r=>requests.push(r.url()));
      await page.goto(pathToFileURL(path.join(play,entry)).href);await page.waitForFunction(()=>window.Gufang&&window.GFArt);
      await page.locator('#start-single').click();await page.locator('#single-start').click();await page.locator('[data-choice="thunder"]').click();
      await page.evaluate(async()=>{Gufang.refresh();await GFArt.ready();Gufang.refresh();});
      assert.deepEqual(errors,[],entry);assert.equal(requests.some(url=>url.includes('/assets/generated/')),false,entry);
      if(entry.startsWith('dist/'))assert(requests.every(url=>url===pathToFileURL(path.join(play,entry)).href||url.startsWith('data:')),'Offline play has no external resources');
      await page.close();
    }
    // Presence must not silently bypass malformed or inconsistent developer data.
    const metrics=path.join(play,'assets/generated/gate-destruction-v9/metrics.json');fs.mkdirSync(path.dirname(metrics),{recursive:true});
    fs.writeFileSync(metrics,JSON.stringify({version:-1}));const mismatch=run();assert.notEqual(mismatch.status,0);assert.match(mismatch.stderr,/Renderer geometry must match/);
    fs.writeFileSync(metrics,'{invalid-json');const malformed=run();assert.notEqual(malformed.status,0);assert.match(malformed.stderr,/SyntaxError/);
    const geometry=JSON.parse(fs.readFileSync(path.join(play,'js/art.js'),'utf8').match(/\/\* building-art:start \*\/([\s\S]*?)\/\* building-art:end \*\//)[1]);
    fs.writeFileSync(metrics,JSON.stringify(geometry));const valid=run();assert.equal(valid.status,0,valid.stderr);
  }finally{
    if(browser)await browser.close();
    // Only remove the uniquely created fixture, never the workspace or temp root.
    assert.equal(path.dirname(play),tempRoot);assert(path.basename(play).startsWith('zhuangyuan-no-generated-'));fs.rmSync(play,{recursive:true,force:true});
  }
});
