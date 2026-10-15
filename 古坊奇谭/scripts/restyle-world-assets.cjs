'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'assets/generated/world-style');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/asset-manifest.json'),'utf8'));
const contour=[74,46,32],report=[];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const soldierHashes=Object.fromEntries(manifest.assets.filter(a=>a.path.startsWith('assets/sprites/soldiers/')).map(a=>[a.path,hash(a.path)]));
const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const clamp=n=>Math.max(0,Math.min(255,Math.round(n/8)*8));
function kind(file){
 if(file.startsWith('assets/sprites/buildings/'))return 'building';
 if(file==='assets/effects/rock.png')return 'resource';
 if(file==='assets/overlays/level-badge.png')return 'panel';
 if(file.startsWith('assets/tiles/terrain/')||file.endsWith('world-background.png'))return 'ground';
 if(file.startsWith('assets/tiles/resources/'))return 'resource';
 if(file.startsWith('assets/tiles/walls/'))return 'wall';
 if(file.startsWith('assets/tiles/roads/'))return 'road';
 if(file.startsWith('assets/scenery/'))return 'scenery';
 if(file.startsWith('assets/ui/panels/'))return 'panel';
 if(file.startsWith('assets/ui/icons/')||file.startsWith('assets/ui/controls/'))return 'icon';
 return 'functional';
}
const settings={
 building:{contrast:1.24,shift:-12,saturation:1.2},resource:{contrast:1.2,shift:-14,saturation:1.24},
 ground:{contrast:1.02,shift:-24,saturation:1.3},wall:{contrast:1.2,shift:-12,saturation:1.15},
 road:{contrast:1.12,shift:-12,saturation:1.15},scenery:{contrast:1.22,shift:-22,saturation:1.18},
 panel:{contrast:1.06,shift:-5,saturation:1.1},icon:{contrast:1.12,shift:-5,saturation:1.15},
 functional:{contrast:1.04,shift:-2,saturation:1.04}
};
function grade(r,g,b,category){
 const cfg=settings[category],light=luma(r,g,b),target=(light-128)*cfg.contrast+128+cfg.shift;
 return [r,g,b].map(value=>clamp(target+(value-light)*cfg.saturation));
}
for(const entry of manifest.assets){
 const file=entry.path;if(file.startsWith('assets/sprites/soldiers/'))continue;
 const target=path.join(root,file),backup=path.join(work,'before',file);
 fs.mkdirSync(path.dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.copyFileSync(target,backup);
 const png=PNG.sync.read(fs.readFileSync(backup)),original=Buffer.from(png.data),category=kind(file);let contours=0;
 const canContour=(['building','resource','wall','scenery','panel','icon'].includes(category)||category==='road'&&file.includes('/bridge-'))&&!file.endsWith('/reeds.png');
 const opaque=(x,y)=>x>=0&&x<png.width&&y>=0&&y<png.height&&original[(y*png.width+x)*4+3]>=128;
 for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
  const i=(y*png.width+x)*4;png.data[i+3]=original[i+3]<128?0:255;if(!original[i+3])continue;
  const color=grade(original[i],original[i+1],original[i+2],category);
  for(let c=0;c<3;c++)png.data[i+c]=color[c];
  if(!canContour||!opaque(x,y))continue;
  // Image edges are connection cuts on road/wall tiles, never contour seams.
  const neighbors=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
  const edge=neighbors.some(([nx,ny])=>nx>=0&&nx<png.width&&ny>=0&&ny<png.height&&!opaque(nx,ny));
  const mass=neighbors.filter(([nx,ny])=>opaque(nx,ny)).length;
  // Pale foundation/yard plates are ground decoration behind upgraded buildings,
  // not the house silhouette. Do not turn them into rectangular card borders.
  const [r,g,b]=original.subarray(i,i+3);
  const groundPlate=category==='building'&&y>=png.height*.55&&r>135&&r<210&&g>=r&&g-r<14&&g>150&&g-b>12;
  if(edge&&mass>=2&&!groundPlate){for(let c=0;c<3;c++)png.data[i+c]=contour[c];contours++;}
 }
 if(file==='assets/ui/backgrounds/title-town.png'){
  const source=PNG.sync.read(fs.readFileSync(path.join(work,'title-town-source-v1.png')));
  for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
   const sx=Math.min(source.width-1,Math.floor((x+.5)*source.width/png.width)),sy=Math.min(source.height-1,Math.floor((y+.5)*source.height/png.height));
   const from=(sy*source.width+sx)*4,to=(y*png.width+x)*4;source.data.copy(png.data,to,from,from+4);png.data[to+3]=png.data[to+3]<128?0:255;
  }
 }
 fs.writeFileSync(target,PNG.sync.write(png));
 let alphaChanges=0;for(let i=3;i<png.data.length;i+=4)if(png.data[i]!==original[i])alphaChanges++;
 report.push({path:file,category,width:png.width,height:png.height,contours,alphaPreserved:alphaChanges===0,alphaChanges,before:crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex'),after:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')});
}
for(const [file,before] of Object.entries(soldierHashes))if(hash(file)!==before)throw Error('Soldier atlas unexpectedly changed: '+file);
fs.writeFileSync(path.join(work,'manifest.json'),JSON.stringify({style:'重墨像素 / 材质明暗 / 一像素深焦棕外轮廓',contour:'#4a2e20',soldierHashes,assets:report},null,2)+'\n');
console.log(`Restyled ${report.length} non-soldier PNGs; original size and connectivity retained. Originals: assets/generated/world-style/before/`);
