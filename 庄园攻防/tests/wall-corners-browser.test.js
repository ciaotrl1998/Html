'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {createServer}=require('../server');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'assets/generated/qa/wall-corners-v10');
const before=Array.from({length:16},(_,m)=>'data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/generated/wall-corner-fix-v10/before/assets/tiles/walls',m.toString(16).padStart(2,'0')+'.png')).toString('base64'));
(async()=>{
  const server=createServer();await new Promise(resolve=>server.server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});fs.mkdirSync(qa,{recursive:true});
  try{for(const offline of [false,true]){
    const name=offline?'offline':'source',page=await browser.newPage({viewport:{width:1280,height:1040},reducedMotion:'reduce'}),errors=[],external=[];
    const url=offline?pathToFileURL(path.join(root,'dist/庄园攻防.html')).href:`http://127.0.0.1:${server.server.address().port}`;
    page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    page.on('request',r=>{if(offline&&r.url()!==url&&!r.url().startsWith('data:'))external.push(r.url());});
    await page.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}));
    await page.goto(url);await page.waitForFunction(()=>window.GFArt&&window.Gufang);
    const report=await page.evaluate(async oldUrls=>{
      const load=async url=>{const img=new Image();img.src=url;await img.decode();return img;};
      const after=await Promise.all(Array.from({length:16},(_,m)=>{const file=`assets/tiles/walls/${m.toString(16).padStart(2,'0')}.png`;return load(window.GF_ASSET_URLS?.[file]||file);}));
      const before=await Promise.all(oldUrls.map(load));
      const options={player:0,animationTime:0,reducedMotion:true,grid:false};
      const host=document.createElement('div');host.id='wall-corner-contact';host.style='position:absolute;inset:0;z-index:10000;width:1024px;background:#c5caa4;display:grid;grid-template-columns:repeat(2,512px)';document.body.append(host);
      const s=GF.createMatch({mode:'single',enemyCount:4,mapSeed:42,rotation:0});s.soldiers=[];s.effects=[];s.projectiles=[];
      const land=GF.estate(s),size=GF.worldWidth(s),connect=(x,y)=>GF.isWall(s,x,y)||land.gates.some(g=>g.x===x&&g.y===y);
      const maskAt=(x,y)=>Number(connect(x,y-1))|Number(connect(x+1,y))*2|Number(connect(x,y+1))*4|Number(connect(x-1,y))*8;
      const corners=[...land.walls].map(k=>({x:k%size,y:Math.floor(k/size)})).map(p=>({...p,mask:maskAt(p.x,p.y)})).filter(p=>[3,6,9,12].includes(p.mask));
      const make=(parent,w,h,title)=>{const cell=document.createElement('div'),label=document.createElement('div'),canvas=document.createElement('canvas');label.textContent=title;label.style='height:28px;font:16px sans-serif;padding:7px 12px;color:#4a2e20;box-sizing:border-box';canvas.width=w;canvas.height=h;canvas.style=`display:block;width:${w}px;height:${h}px`;cell.append(label,canvas);parent.append(cell);return canvas;};
      // Four real clusters include both inside and outside corners, with actual
      // one-cell staircase offsets instead of isolated enlarged tiles.
      for(const [x,y,title] of [[29,28,'西北：连续阶梯拐角'],[39,28,'东北：连续阶梯拐角'],[29,39,'西南：连续阶梯拐角'],[40,39,'东南：连续阶梯拐角']]){
        const canvas=make(host,512,384,title),cam={x:256-(x*64+32)*2,y:192-(y*64+32)*2,zoom:2};
        GFArt.render(canvas,s,cam,null,{...options,grid:true});await GFArt.ready();GFArt.render(canvas,s,cam,null,{...options,grid:true});
      }
      const probe=make(document.body,256,256,'');probe.parentElement.style='position:absolute;left:-10000px;top:0';
      const expected=document.createElement('canvas');expected.width=expected.height=64;const ec=expected.getContext('2d'),pc=probe.getContext('2d'),pixelChecks=[],chunkCorners=[];
      for(const p of corners){
        const cam={x:128-(p.x*64+32)*2,y:128-(p.y*64+32)*2,zoom:2};GFArt.render(probe,s,cam,null,options);await GFArt.ready();GFArt.render(probe,s,cam,null,options);
        ec.clearRect(0,0,64,64);ec.drawImage(after[p.mask],0,0);
        const samples=[[32,27],[20,20],[43,20],[20,39],[43,39]];if(p.mask&1)samples.push([32,20]);if(p.mask&2)samples.push([44,27],[54,47]);if(p.mask&4)samples.push([32,42]);else samples.push([32,47]);if(p.mask&8)samples.push([20,27],[8,47]);
        for(const [x,y] of samples){const expected=[...ec.getImageData(x,y,1,1).data];if(expected[3]===255)pixelChecks.push({worldX:p.x,worldY:p.y,mask:p.mask,x,y,actual:[...pc.getImageData(128+(x-32)*2,128+(y-32)*2,1,1).data],expected});}
        if(p.x%16===0||p.y%16===0||p.x%16===15||p.y%16===15)chunkCorners.push(p);
      }
      // A controlled staircase crosses both 16-cell chunk boundaries. It uses
      // the real renderer and real mask lookup, without a dedicated corner path.
      const fixture=GF.createMatch({mode:'single',enemyCount:4,mapSeed:73,rotation:0}),f=GF.estate(fixture),fw=GF.worldWidth(fixture);
      fixture.buildings=[];fixture.soldiers=[];fixture.effects=[];fixture.projectiles=[];fixture.revision++;f.walls.clear();f.gates=[];f.roads.clear();f.cells.clear();
      const path=[[1,0],[1,1],[2,1],[3,1],[3,2],[4,2],[4,3],[4,4]];
      for(const [x,y] of path)f.walls.add((y+14)*fw+x+13);
      const fc=make(document.body,640,600,'跨地形缓存分块的连续拐角');fc.parentElement.style='position:absolute;left:-10000px;top:0';
      const cam={x:32-13*64*1.5,y:32-14*64*1.5,zoom:1.5};GFArt.render(fc,fixture,cam,null,options);await GFArt.ready();GFArt.render(fc,fixture,cam,null,options);
      const chunkChecks=[];
      for(const k of f.walls){const x=k%fw,y=Math.floor(k/fw),mask=Number(f.walls.has(k-fw))|Number(f.walls.has(k+1))*2|Number(f.walls.has(k+fw))*4|Number(f.walls.has(k-1))*8;ec.clearRect(0,0,64,64);ec.drawImage(after[mask],0,0);chunkChecks.push({x,y,mask,actual:[...fc.getContext('2d').getImageData(Math.floor(cam.x+(x*64+32.5)*1.5),Math.floor(cam.y+(y*64+27.5)*1.5),1,1).data],expected:[...ec.getImageData(32,27,1,1).data]});}
      const comparison=document.createElement('div');comparison.id='wall-before-after';comparison.style='position:absolute;inset:0;z-index:10001;width:1280px;background:#c5caa4;display:grid;grid-template-columns:repeat(2,640px)';comparison.hidden=true;document.body.append(comparison);
      for(const mirror of [false,true])for(const [label,images] of [['修复前',before],['修复后',after]]){
        const canvas=make(comparison,640,480,`${label} · ${mirror?'反向':'正向'}阶梯墙`),c=canvas.getContext('2d');c.fillStyle='#b8c195';c.fillRect(0,0,640,480);c.imageSmoothingEnabled=false;
        const cells=path.map(([x,y])=>[mirror?5-x:x,y]),keys=new Set(cells.map(([x,y])=>`${x},${y}`)),has=(x,y)=>keys.has(`${x},${y}`);
        c.save();c.translate(32,0);c.scale(1.5,1.5);
        for(const [x,y] of cells){const m=Number(has(x,y-1))|Number(has(x+1,y))*2|Number(has(x,y+1))*4|Number(has(x-1,y))*8;c.drawImage(images[m],x*64,y*64);}
        c.restore();
      }
      window.wallCornerQA={host,comparison,fc};return {corners:corners.length,masks:[...new Set(corners.map(p=>p.mask))].sort((a,b)=>a-b),pixelChecks,chunkChecks,chunkCorners};
    },before);
    await page.locator('#wall-corner-contact').screenshot({path:path.join(qa,`${name}-real-corners.png`)});
    await page.evaluate(()=>{wallCornerQA.host.remove();wallCornerQA.comparison.hidden=false;});
    await page.locator('#wall-before-after').screenshot({path:path.join(qa,`${name}-before-after.png`)});
    await page.evaluate(()=>{wallCornerQA.comparison.remove();wallCornerQA.fc.parentElement.style='position:absolute;inset:0;z-index:10002;width:640px;background:#c5caa4';});
    await page.locator('canvas').last().screenshot({path:path.join(qa,`${name}-chunk-staircase.png`)});
    assert.deepEqual(report.masks,[3,6,9,12]);assert(report.corners>=16);assert.equal(report.chunkChecks.length,8);
    for(const p of [...report.pixelChecks,...report.chunkChecks])assert.deepEqual(p.actual,p.expected,`Rendered wall top is continuous at ${JSON.stringify(p)}`);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);fs.writeFileSync(path.join(qa,`${name}-report.json`),JSON.stringify(report,null,2));
    console.log(`${name}: ${report.corners} real corners, ${report.pixelChecks.length} live surface samples, all four bends and 8 staircase tiles across chunk boundaries passed`);await page.close();
  }}finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
