'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),entries=[];
const ui=JSON.parse(fs.readFileSync(path.join(root,'assets/interface-manifest.json'),'utf8')).assets;
function scan(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
  const file=path.posix.join(dir,e.name);if(e.isDirectory()){if(e.name!=='generated')scan(file);continue;}if(!e.name.endsWith('.png'))continue;
  const data=fs.readFileSync(path.join(root,file));
  entries.push({path:file,width:data.readUInt32BE(16),height:data.readUInt32BE(20),...(ui[file]?{slice:ui[file].slice}:{}),usage:file.startsWith('assets/ui/panels/')?'界面九宫格边框；四边切片 6px':file.includes('/icons/')?'界面图标':file.includes('/hints/')?'资源增益提示':file.includes('/soldiers/')?'士兵图集，20×30 帧，12列×3行':file.includes('/buildings/')?'建筑精灵；锚点 (32,48)':file.includes('/bars/')?'血条，可水平拉伸':file.startsWith('assets/effects/')?'特效，由程序控制位置、旋转和淡出':file.startsWith('assets/overlays/')?'地图叠加标记':file.startsWith('assets/scenery/')?'地图背景':file.includes('/backgrounds/')?'界面底纹／首页场景':'地图瓦片'});
}}
scan('assets');
fs.writeFileSync(path.join(root,'assets/asset-manifest.json'),JSON.stringify({version:1,count:entries.length,assets:entries},null,2)+'\n');
const groups=Object.groupBy(entries,e=>e.path.split('/').slice(1,e.path.includes('/sprites/')||e.path.includes('/ui/')||e.path.includes('/tiles/')?3:2).join('/'));
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>古坊奇谭 · PNG 资源总览</title><style>body{margin:32px;background:#e9dfbe;color:#3b5148;font:14px/1.6 system-ui}h1{font-size:26px}h2{border-bottom:1px solid #a99d74;margin-top:40px}section{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}article{background:#f3ecd4;border:1px solid #b6ac83;padding:12px;overflow-wrap:anywhere}figure{height:128px;margin:0 0 10px;display:grid;place-items:center;background:repeating-conic-gradient(#c6c9b3 0% 25%,#dce0cc 0% 50%) 0/16px 16px}img{image-rendering:pixelated;max-width:100%;max-height:120px;object-fit:contain}code{font-size:11px}small{color:#7c775a}</style><h1>古坊奇谭 · PNG 资源总览</h1><p>共 ${entries.length} 张运行时图片。点击图片打开原文件；按原尺寸替换同名文件即可。UI 文字和动态数字保留为文本。面板切片 6px，避免修改最外侧 6px 的结构。</p><p><a href="ART_ASSETS.md">资源规范</a> · <a href="asset-manifest.json">完整机器可读清单</a></p>${Object.entries(groups).map(([group,list])=>`<h2>${group} · ${list.length}</h2><section>${list.map(e=>`<article><figure><a href="${e.path.slice(7)}"><img loading="lazy" src="${e.path.slice(7)}" alt="${path.basename(e.path)}" style="width:${Math.min(e.width*3,280)}px"></a></figure><code>${e.path}</code><br><strong>${e.width} × ${e.height}</strong><br><small>${e.usage}</small></article>`).join('')}</section>`).join('')}</html>`;
fs.writeFileSync(path.join(root,'assets/ART_CATALOG.html'),html);
console.log(`Catalog: ${entries.length} runtime PNGs.`);
