(function(){
  'use strict';
  const images=new Map();let version=0;
  const patterns=new WeakMap();
  // Absolute URLs also work when CSS custom properties are consumed by an external stylesheet.
  const url=path=>window.GF_ASSET_URLS?.[path]||new URL(path,document.baseURI).href;
  function image(path){if(!images.has(path)){const img=new Image();img.onload=img.onerror=()=>version++;img.src=url(path);images.set(path,img);}return images.get(path);}
  function draw(c,path,x,y,w,h){const img=image(path);if(!img.complete||!img.naturalWidth)return;c.imageSmoothingEnabled=false;c.drawImage(img,x,y,w,h);}
  function tile(c,path,x,y,w,h){
    const img=image(path);if(!img.complete||!img.naturalWidth)return;
    let cache=patterns.get(c);if(!cache){cache=new Map();patterns.set(c,cache);}
    let pattern=cache.get(path);if(!pattern){pattern=c.createPattern(img,'repeat');cache.set(path,pattern);}
    c.save();c.translate(x,y);c.imageSmoothingEnabled=false;c.fillStyle=pattern;c.fillRect(0,0,w,h);c.restore();
  }
  function panel(c,name,x,y,w,h){
    const img=image(`assets/ui/panels/${name}.png`);if(!img.complete||!img.naturalWidth)return;
    const n=6,sw=img.naturalWidth,sh=img.naturalHeight,k=Math.min(1,w/12,h/12),d=n*k;
    const xs=[0,n,sw-n,sw],ys=[0,n,sh-n,sh],dx=[x,x+d,x+w-d,x+w],dy=[y,y+d,y+h-d,y+h];
    c.imageSmoothingEnabled=false;for(let j=0;j<3;j++)for(let i=0;i<3;i++)if(dx[i+1]>dx[i]&&dy[j+1]>dy[j])c.drawImage(img,xs[i],ys[j],xs[i+1]-xs[i],ys[j+1]-ys[j],dx[i],dy[j],dx[i+1]-dx[i],dy[j+1]-dy[j]);
  }
  const css=document.createElement('style');css.id='png-art-urls';
  const paths={};
  for(const name of ['paper','card','inset','dark','primary','secondary','disabled','danger','warning','ally','enemy','night','seal','ornament-border'])paths[`panel-${name}`]=`assets/ui/panels/${name}.png`;
  for(const name of ['coin','materials','close','arrow-right','upgrade','invasion','grip','diamond','repel','repair','thunder','single','coop','load','sound-off','sound-on'])paths[`icon-${name}`]=`assets/ui/icons/${name}.png`;
  for(const name of ['off','on'])paths[`switch-${name}`]=`assets/ui/controls/switch-${name}.png`;
  for(const name of ['track','player','enemy','building','critical'])paths[`health-${name}`]=`assets/ui/bars/health-${name}.png`;
  paths.paper='assets/ui/backgrounds/paper.png';paths.landscape='assets/ui/backgrounds/title-town.png';
  paths.dimmer='assets/ui/backgrounds/dimmer.png';
  css.textContent=':root{'+Object.entries(paths).map(([key,path])=>`--art-${key}:url("${url(path)}")`).join(';')+'}';document.head.append(css);
  // Preload overlays so opening a panel cannot delay the first map frame.
  for(const path of Object.values(paths))image(path);
  for(const name of ['primary','ally','enemy','paper'])image(`assets/ui/panels/map-${name}.png`);
  for(const name of ['selection','placement','range','level-badge','gate-broken','pulse','repair','repel','freeze','slow','aura','grid'])image(`assets/overlays/${name}.png`);
  for(const r of ['coins','materials'])for(let t=1;t<=3;t++)image(`assets/overlays/hints/${r}-tier-${t}.png`);
  image('assets/overlays/hints/starter-white.png');
  for(const name of ['rock','arrow','bolt','thunder','soldier-hit','hit','swallow','shadow','water-ripple'])image(`assets/effects/${name}.png`);
  window.GFUI={draw,tile,panel,image,url,version:()=>version};
})();
