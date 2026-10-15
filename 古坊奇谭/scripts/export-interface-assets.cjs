'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    const page=await browser.newPage();
    await page.addScriptTag({path:path.join(__dirname,'interface-art-source.js')});
    const assets=await page.evaluate(()=>window.GFInterfaceExport);
    const overwrite=process.argv.includes('--overwrite');
    const manifest={version:1,style:'古镇像素 / 二值透明 / 最近邻',assets:{}};
    for(const [relative,{data,...spec}] of Object.entries(assets)){
      const target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
      if(overwrite||!fs.existsSync(target))fs.writeFileSync(target,Buffer.from(data.split(',')[1],'base64'));
      manifest.assets[relative]=spec;
    }
    fs.writeFileSync(path.join(root,'assets/interface-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    console.log(`Interface pack: ${Object.keys(assets).length} PNGs (${overwrite?'overwrite':'preserve existing'}).`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
