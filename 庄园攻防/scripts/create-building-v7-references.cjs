'use strict';
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const work=path.resolve(__dirname,'../assets/generated/buildings-redesign'),out=path.join(work,'v7');
const batches={a:['shrine','gate','tower','guild','port','inn'],b:['barracks','well','tea','bank','mill','wine'],c:['mulberry','weaver','tailor','quarry','kiln','trade'],d:['farm','rock','stage','earth','zhong','tao','fortune']};
fs.mkdirSync(path.join(out,'sources'),{recursive:true});
for(const [name,types] of Object.entries(batches)){
  const sheet=new PNG({width:192,height:64*types.length});sheet.data.fill(0);
  types.forEach((type,i)=>{const p=PNG.sync.read(fs.readFileSync(path.join(work,'by-building',`${type}.png`)));PNG.bitblt(p,sheet,0,0,192,64,0,i*64);});
  fs.writeFileSync(path.join(out,`reference-${name}.png`),PNG.sync.write(sheet));
}
fs.writeFileSync(path.join(out,'batches.json'),JSON.stringify(batches,null,2)+'\n');
console.log(out);
