'use strict';
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const work=path.resolve(__dirname,'../assets/generated/buildings-redesign'),types=['shrine','gate','tower','guild','port','inn'];
const out=new PNG({width:192,height:64*types.length});out.data.fill(0);
types.forEach((type,i)=>{const sheet=PNG.sync.read(fs.readFileSync(path.join(work,'by-building',`${type}.png`)));PNG.bitblt(sheet,out,0,0,192,64,0,i*64);});
fs.writeFileSync(path.join(work,'original-style-key-buildings.png'),PNG.sync.write(out));
console.log(path.join(work,'original-style-key-buildings.png'));
