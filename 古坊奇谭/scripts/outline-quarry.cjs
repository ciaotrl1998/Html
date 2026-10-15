'use strict';
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const root=path.resolve(__dirname,'..');
function applyEntityContour(png,mask,color=[74,46,32]){
  if(png.width!==mask.width||png.height!==mask.height)throw Error('Entity mask dimensions differ');
  const opaque=(x,y)=>x>=0&&y>=0&&x<mask.width&&y<mask.height&&mask.data[(y*mask.width+x)*4+3]>=128;
  let changed=0;
  for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
    const i=(y*png.width+x)*4;
    if(!png.data[i+3]||!opaque(x,y))continue;
    if([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([nx,ny])=>!opaque(nx,ny))){
      for(let c=0;c<3;c++)png.data[i+c]=color[c];changed++;
    }
  }
  return changed;
}
module.exports={applyEntityContour};
if(require.main===module)(async()=>{
  const {chromium}=require('playwright'),{pathToFileURL}=require('node:url');
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try{
    const page=await browser.newPage();
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.waitForFunction(()=>window.GFArt&&GFArt.exportPngAssets);
    await page.addScriptTag({path:path.join(root,'js/art.js')});
    const masks=await page.evaluate(()=>GFArt.exportPngAssets({buildingType:'quarry',entityOnly:true}));
    const expected=[1,2,3].map(level=>`assets/sprites/buildings/quarry/level-${level}.png`);
    if(Object.keys(masks).length!==3||expected.some(file=>!masks[file]))throw Error('Expected exactly three quarry entity masks; no assets were written');
    const dir=path.join(root,'assets/generated/world-style/entity-masks/quarry'),before=path.join(root,'assets/generated/qa/quarry-outline/before');
    fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(before,{recursive:true});
    for(const [file,url] of Object.entries(masks)){
      const bytes=Buffer.from(url.split(',')[1],'base64'),mask=PNG.sync.read(bytes),target=path.join(root,file),backup=path.join(before,path.basename(file));
      fs.writeFileSync(path.join(dir,path.basename(file)),bytes);
      if(!fs.existsSync(backup))fs.copyFileSync(target,backup);
      const png=PNG.sync.read(fs.readFileSync(target)),count=applyEntityContour(png,mask);
      fs.writeFileSync(target,PNG.sync.write(png));console.log(`${file}: ${count} entity contour pixels`);
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
