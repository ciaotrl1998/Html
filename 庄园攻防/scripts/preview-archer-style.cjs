'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const data=file=>'data:image/png;base64,'+fs.readFileSync(path.join(root,file)).toString('base64');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1060,height:680},deviceScaleFactor:1});
  await page.setContent('<body style="margin:0"><canvas width="1060" height="680"></canvas></body>');
  await page.evaluate(async sources=>{
   const images=await Promise.all(sources.map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.src=src;})));
   const c=document.querySelector('canvas').getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#ced5af';c.fillRect(0,0,1060,680);c.font='20px Microsoft YaHei';c.fillStyle='#3b5148';
   ['旧步兵','新步兵','新弓兵（统一风格）'].forEach((text,i)=>c.fillText(text,65+i*345,34));
   [1,3,6,9].forEach((level,row)=>{const sx=((level-1)%3)*80,sy=Math.floor((level-1)/3)*30,y=62+row*150;c.fillStyle='#3b5148';c.fillText('Lv.'+level,6,y+62);images.forEach((img,col)=>{for(let dir=0;dir<4;dir++)c.drawImage(img,sx+dir*20,sy,20,30,65+col*345+dir*78,y,60,90);});});
  },['assets/generated/infantry/before-approved-style/infantry_player-red.png','assets/sprites/soldiers/infantry_player-red.png','assets/sprites/soldiers/archer_player-red.png'].map(data));
  const dir=path.join(root,'assets/generated/qa/archer-style');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'infantry-archer-comparison.png')});
  await page.setViewportSize({width:1120,height:440});
  await page.setContent('<body style="margin:0"><canvas width="1120" height="440"></canvas></body>');
  await page.evaluate(async sources=>{
   const imgs=await Promise.all(sources.map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.src=src;})));
   const c=document.querySelector('canvas').getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#ced5af';c.fillRect(0,0,1120,440);c.fillStyle='#3b5148';c.font='20px Microsoft YaHei';c.fillText('统一兵种风格 · 九级装备成长',20,30);c.font='15px Microsoft YaHei';
   const names=['布衣','布帽 / 护腕','绗缝布甲','皮革背心','皮革肩甲','全套皮甲','白银甲','银金混合甲','黄金甲'];
   for(let l=1;l<=9;l++){const x=30+(l-1)*120,sx=((l-1)%3)*80,sy=Math.floor((l-1)/3)*30;c.fillText('Lv.'+l+' '+names[l-1],x,64);imgs.forEach((img,i)=>{const y=95+i*167;c.drawImage(img,sx,sy,20,30,x,y,60,90);c.drawImage(img,sx+20,sy,20,30,x+55,y,60,90);});}
   c.fillText('步兵 · 矛 / 盾',20,221);c.fillText('弓兵 · 弓 / 箭囊',20,402);
  },['assets/sprites/soldiers/infantry_player-red.png','assets/sprites/soldiers/archer_player-red.png'].map(data));
  await page.screenshot({path:path.join(dir,'equipment-progression.png')});
  await page.setViewportSize({width:1040,height:400});
  await page.setContent('<body style="margin:0"><canvas width="1040" height="400"></canvas></body>');
  await page.evaluate(async sources=>{
   const imgs=await Promise.all(sources.map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=src;})));
   const c=document.querySelector('canvas').getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#ced5af';c.fillRect(0,0,1040,400);c.fillStyle='#4a2e20';c.font='19px Microsoft YaHei';c.fillText('改前 → 改后：恢复内部材质，只保留一像素深棕外轮廓',20,30);c.font='16px Microsoft YaHei';
   [1,4,7,9].forEach((l,col)=>{const x=60+col*250,sx=((l-1)%3)*80,sy=Math.floor((l-1)/3)*30;c.fillText('Lv.'+l+'  改前       改后',x,65);for(let type=0;type<2;type++){const y=76+type*155;for(let variant=0;variant<2;variant++)c.drawImage(imgs[type*2+variant],sx,sy,20,30,x+variant*95,y,80,120);}});
   c.fillText('步兵',8,142);c.fillText('弓兵',8,297);
  },['assets/generated/outline-before-exterior-only/infantry_player-red.png','assets/sprites/soldiers/infantry_player-red.png','assets/generated/outline-before-exterior-only/archer_player-red.png','assets/sprites/soldiers/archer_player-red.png'].map(data));
  await page.screenshot({path:path.join(dir,'outline-before-after.png')});
  await page.setViewportSize({width:1000,height:720});
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>window.GFArt&&window.GF);
  await page.evaluate(async()=>{
   Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));
   const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=720;canvas.style='position:fixed;inset:0;width:1000px;height:720px;z-index:100;background:#ced5af';document.body.append(canvas);
   const s=GF.createMatch({mode:'coop',enemyCount:2});s.soldiers=[];s.buildings=[];s.effects=[];s.projectiles=[];
   for(let row=0;row<6;row++)for(let level=1;level<=9;level++){const x=2+(level-1)*1.3,y=2+row*1.45;s.soldiers.push({id:10000+row*10+level,owner:row%3,x,y,level,troopType:row<3?'infantry':'archer',hp:100,maxHp:100,attack:0,repelled:0,slowed:0,waypoint:{x,y:y+1}});}
   const cam={x:90-(2*64+32),y:130-(2*64+32),zoom:1};
   const draw=()=>GFArt.render(canvas,s,cam,null,{player:0,grid:false,animationTime:0});draw();await GFArt.ready();draw();
   const c=canvas.getContext('2d');c.font='18px Microsoft YaHei';c.fillStyle='#634534';c.fillText('实际游戏渲染 · 棕色描边 · 布衣 → 皮革 → 白银 → 黄金',20,30);
   for(let level=1;level<=9;level++)c.fillText('Lv.'+level,70+(level-1)*83.2,65);
   for(let row=0;row<6;row++)c.fillText((row<3?'步兵':'弓兵')+' '+['己','友','敌'][row%3],8,130+row*92.8);
  });
  await page.screenshot({path:path.join(dir,'in-game-factions.png')});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
