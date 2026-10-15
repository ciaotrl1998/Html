'use strict';
const fs=require('node:fs'),path=require('node:path');
const {PNG}=require('pngjs'),{chromium}=require('playwright'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),work=path.join(root,'assets/generated/world-style'),qa=path.join(root,'assets/generated/qa/world-style');
fs.mkdirSync(qa,{recursive:true});
const data=file=>'data:image/png;base64,'+fs.readFileSync(file).toString('base64');
const files=JSON.parse(fs.readFileSync(path.join(root,'assets/asset-manifest.json'))).assets.map(a=>a.path);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const paths=['assets/sprites/buildings/shrine/level-3.png','assets/sprites/buildings/barracks/level-2.png','assets/sprites/buildings/inn/level-1.png','assets/sprites/buildings/gate/level-2.png','assets/tiles/resources/forest.png','assets/tiles/resources/mountain.png','assets/tiles/terrain/plain.png','assets/tiles/terrain/water.png','assets/tiles/walls/0f.png','assets/tiles/roads/bridge-05.png','assets/ui/panels/primary.png','assets/scenery/mountain-1.png'];
  const page=await browser.newPage({viewport:{width:1100,height:830}});
  await page.setContent('<body style="margin:0"><canvas width="1100" height="830"></canvas></body>');
  await page.evaluate(async sources=>{
   const c=document.querySelector('canvas').getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#d5cfb0';c.fillRect(0,0,1100,830);c.fillStyle='#4a2e20';c.font='23px Microsoft YaHei';c.fillText('图素风格统一 · 改前 / 改后',24,38);c.font='13px Microsoft YaHei';
   for(let i=0;i<sources.length;i++){
    const x=20+i%4*275,y=70+Math.floor(i/4)*245;
    const imgs=await Promise.all(sources[i].urls.map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.src=src;})));
    c.fillStyle='#b6c292';c.fillRect(x,y,256,190);imgs.forEach((img,j)=>{const size=Math.min(118/img.width,118/img.height),w=img.width*size,h=img.height*size;c.drawImage(img,x+j*130+(126-w)/2,y+25+(120-h)/2,w,h);});
    c.fillStyle='#4a2e20';c.fillText(sources[i].name,x,y+212);c.fillText('改前',x+43,y+174);c.fillText('改后',x+175,y+174);
   }
  },paths.map(file=>({name:file.split('/').slice(2).join('/'),urls:[data(path.join(work,'before',file)),data(path.join(root,file))]})));
  await page.screenshot({path:path.join(qa,'assets-before-after.png')});await page.close();
  for(const before of [true,false]){
   const context=await browser.newContext({viewport:{width:800,height:720},reducedMotion:'reduce'}),scene=await context.newPage();
   const urls=Object.fromEntries(files.map(file=>[file,data(before&&fs.existsSync(path.join(work,'before',file))?path.join(work,'before',file):path.join(root,file))]));
   await context.addInitScript(urls=>{window.GF_ASSET_URLS=urls;Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});},urls);
   await scene.goto(pathToFileURL(path.join(root,'index.html')).href);await scene.waitForFunction(()=>window.Gufang);
   await scene.evaluate(async before=>{
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=720;canvas.style='position:fixed;inset:0;width:800px;height:720px;z-index:100';document.body.append(canvas);
    const s=GF.createMatch({mode:'single',enemyCount:1,mapSeed:42});s.buildings=[];s.soldiers=[];s.effects=[];s.projectiles=[];
    const types=['shrine','barracks','inn','farm','quarry','gate','tower','tea','bank'];
    types.forEach((type,i)=>{const b={id:1000+i,type,x:4+i%3*3,y:4+Math.floor(i/3)*2.5,level:[1,4,7][i%3],owner:0,direction:0};b.hp=GF.maxHP(b);s.buildings.push(b);});
    for(let i=0;i<6;i++)s.soldiers.push({id:2000+i,owner:0,x:3.5+i*1.3,y:11.5,level:[1,4,7,8,9,9][i],troopType:i%2?'archer':'infantry',hp:100,maxHp:100,attack:0,repelled:0,slowed:0,waypoint:{x:3.5+i*1.3,y:12.5}});
    const cam={x:150-(4*64+32),y:130-(4*64+32),zoom:1};
    const draw=()=>GFArt.render(canvas,s,cam,null,{player:0,grid:false,animationTime:0});draw();await GFArt.ready();draw();
    const c=canvas.getContext('2d');c.fillStyle='#4a2e20';c.font='22px Microsoft YaHei';c.fillText(before?'改前：轻水墨场景 / 新士兵':'改后：重墨像素 / 同色细外轮廓',24,36);
   },before);
   await scene.screenshot({path:path.join(qa,before?'scene-before.png':'scene-after.png')});await context.close();
  }
  const left=PNG.sync.read(fs.readFileSync(path.join(qa,'scene-before.png'))),right=PNG.sync.read(fs.readFileSync(path.join(qa,'scene-after.png'))),both=new PNG({width:1600,height:720});
  PNG.bitblt(left,both,0,0,800,720,0,0);PNG.bitblt(right,both,0,0,800,720,800,0);fs.writeFileSync(path.join(qa,'scene-before-after.png'),PNG.sync.write(both));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
