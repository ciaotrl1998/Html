'use strict';
const fs=require('node:fs'),path=require('node:path');
const {PNG}=require('pngjs');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    const page=await browser.newPage();
    await page.addScriptTag({path:path.join(__dirname,'interface-art-source.js')});
    const assets=await page.evaluate(()=>window.GFInterfaceExport);
    const referencePaths=['assets/sprites/buildings/shrine/level-2.png','assets/sprites/buildings/inn/level-1.png','assets/sprites/buildings/tea/level-1.png','assets/sprites/buildings/tower/level-1.png','assets/tiles/resources/border-tree.png'];
    const references=referencePaths.map(p=>'data:image/png;base64,'+fs.readFileSync(path.join(root,p)).toString('base64'));
    assets['assets/ui/backgrounds/title-town.png']=await page.evaluate(async sources=>{
      const imgs=await Promise.all(sources.map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=src;})));
      const cv=document.createElement('canvas');cv.width=256;cv.height=128;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;
      c.fillStyle='#c7b77e';c.fillRect(191,15,20,20);c.fillStyle='#aebda0';
      for(let i=0;i<5;i++){c.beginPath();c.moveTo(i*59-20,99);c.lineTo(i*59+24,30+(i%3)*12);c.lineTo(i*59+75,99);c.fill();}
      c.fillStyle='#c4cba9';c.fillRect(0,90,256,38);c.fillStyle='#d6ca9c';c.fillRect(97,95,62,33);c.fillRect(27,112,200,7);
      c.drawImage(imgs[4],0,54,64,64);c.drawImage(imgs[4],193,43,64,64);
      c.drawImage(imgs[1],39,62,64,64);c.drawImage(imgs[0],94,40,80,80);c.drawImage(imgs[2],160,63,64,64);c.drawImage(imgs[3],198,56,64,64);
      const pixels=c.getImageData(0,0,cv.width,cv.height);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]<128?0:255;c.putImageData(pixels,0,0);
      return {width:256,height:128,slice:0,data:cv.toDataURL('image/png')};
    },references);
    // Map labels retain the current panel artwork, with the four corner studs
    // replaced by continuous border/fill sampled from the same PNG.
    for(const name of ['primary','ally','enemy','paper']){
      const base=`assets/ui/panels/${name}.png`,target=path.join(root,base);
      const original=PNG.sync.read(fs.existsSync(target)?fs.readFileSync(target):Buffer.from(assets[base].data.split(',')[1],'base64'));
      const clean=new PNG({width:original.width,height:original.height});original.data.copy(clean.data);
      for(const x0 of [2,original.width-6])for(const y0 of [2,original.height-6])for(let y=y0;y<y0+4;y++)for(let x=x0;x<x0+4;x++){
        const dx=Math.min(x,original.width-1-x),dy=Math.min(y,original.height-1-y);
        const sx=dx<dy?x:Math.floor(original.width/2),sy=dx<dy?Math.floor(original.height/2):y;
        original.data.copy(clean.data,(y*clean.width+x)*4,(sy*original.width+sx)*4,(sy*original.width+sx)*4+4);
      }
      assets[`assets/ui/panels/map-${name}.png`]={width:clean.width,height:clean.height,slice:6,data:'data:image/png;base64,'+PNG.sync.write(clean).toString('base64')};
    }
    const overwrite=process.argv.includes('--overwrite');
    const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
    if(only&&!assets[only])throw Error('Unknown asset: '+only);
    const manifest={version:1,style:'古镇像素 / 二值透明 / 最近邻',assets:{}};
    for(const [relative,{data,...spec}] of Object.entries(assets)){
      const target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
      if((!only||only===relative)&&(overwrite||!fs.existsSync(target)))fs.writeFileSync(target,Buffer.from(data.split(',')[1],'base64'));
      manifest.assets[relative]=spec;
    }
    fs.writeFileSync(path.join(root,'assets/interface-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    console.log(`Interface pack: ${Object.keys(assets).length} PNGs (${overwrite?'overwrite':'preserve existing'}).`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
