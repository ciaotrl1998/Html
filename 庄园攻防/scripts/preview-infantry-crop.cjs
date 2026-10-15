'use strict';
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'assets/generated/qa/infantry-crop');
fs.mkdirSync(out,{recursive:true});
const data=file=>'data:image/png;base64,'+fs.readFileSync(path.join(root,file)).toString('base64');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1240,height:1050}});
  await page.setContent('<body style="margin:0"><canvas width="1240" height="1050"></canvas></body>');
  await page.evaluate(async urls=>{
   const imgs=await Promise.all(urls.map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=src;})));
   const c=document.querySelector('canvas').getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#d5cfb0';c.fillRect(0,0,1240,1050);c.fillStyle='#4a2e20';c.font='24px Microsoft YaHei';
   c.fillText('步兵裁切修复 · 敌方图集（每级正 / 背 / 左 / 右）',20,34);
   imgs.forEach((img,variant)=>{const top=105+variant*495;c.fillStyle='#4a2e20';c.fillText(variant?'修复后：保留完整腿部、靴子与统一脚底位置':'修复前：固定六等分截断源图下半身',20,top-20);
    for(let row=0;row<3;row++){
     for(let y=0;y<150;y+=10)for(let x=0;x<1200;x+=10){c.fillStyle=(x/10+y/10)%2?'#dddccf':'#eeecdf';c.fillRect(20+x,top+row*150+y,10,10);}
     c.drawImage(img,0,row*30,240,30,20,top+row*150,1200,150);
     c.fillStyle='#4a2e20';c.font='16px Microsoft YaHei';for(let g=0;g<3;g++)c.fillText('Lv.'+(row*3+g+1),24+g*400,top+row*150+16);
    }
   });
  },['assets/generated/infantry/before-row-crop-fix/infantry_enemy-purple.png','assets/sprites/soldiers/infantry_enemy-purple.png'].map(data));
  await page.screenshot({path:path.join(out,'before-after.png')});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
