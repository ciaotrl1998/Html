'use strict';
// Deterministic economy-and-defense playthroughs used while tuning the game.
const G = require('../js/game.js');

const opening = [
  ['tea',7,8],['mulberry',10,6],['tower',7,7],['tower',9,7],
  ['weaver',10,7],['quarry',11,11],['kiln',10,10],['inn',7,9],
  ['farm',5,8],['mill',6,9],['bank',8,10],['wine',7,10],
  ['tailor',10,8],['trade',10,9],['guild',8,9],['port',9,9]
];
const towerPlots = [[8,6],[9,6],[7,6],[8,5],[9,5]];
function run(days=10,style='build',seed=73193) {
  const s=G.createState(),history=[];s.seed=seed;let next=0,seconds=0,lastDay=s.day,actions=[];
  while(!s.over && s.day<=days && seconds<days*230){
    while(next<opening.length&&s.buildings.some(b=>b.type===opening[next][0]&&b.x===opening[next][1]&&b.y===opening[next][2]))next++;
    let defended=false;
    if(style==='balanced'&&s.phase==='night'){
      const shrine=s.buildings.find(b=>b.type==='shrine');
      if(s.enemies.length>=8&&!G.skillReason(s,'thunder')){G.skill(s,'thunder');actions.push(`第${s.day}夜天雷`);}
      else if(shrine&&shrine.hp<G.maxHP(shrine)*.55&&!G.skillReason(s,'repair')){G.skill(s,'repair');actions.push(`第${s.day}夜回春`);}
      else if(s.enemies.length>=8&&!G.skillReason(s,'repel')){G.skill(s,'repel');actions.push(`第${s.day}夜驱鬼`);}
    }
    if(style==='balanced'&&next>=4){
      const target=Math.min(G.MAX_LEVEL,1+Math.floor((s.day+1)/3)),shrine=s.buildings.find(b=>b.type==='shrine');
      const shrineTarget=G.requiredShrineLevel(target);
      if(shrine.level<shrineTarget){
        if(!G.upgradeReason(s,shrine)){G.upgrade(s,shrine);actions.push(`第${s.day}日升祠堂${shrine.level}`);}
        defended=true;
      }
      if(!defended&&s.day>=3&&!s.buildings.some(b=>b.type==='weaver')){
        const r=G.build(s,'weaver',10,7);if(r.ok)actions.push(`第${s.day}日建织坊`);defended=true;
      }
      const towerTarget=Math.min(7,2+Math.floor(s.day/3)),towers=s.buildings.filter(b=>b.type==='tower');
      if(!defended&&towers.length<towerTarget){
        const plot=towerPlots.find(([x,y])=>!G.at(s,x,y));
        if(plot){const r=G.build(s,'tower',...plot);if(r.ok){actions.push(`第${s.day}日建箭塔`);defended=true;}}
      }
      if(!defended)for(const b of towers.filter(b=>b.level<target))if(!G.upgradeReason(s,b)){
        G.upgrade(s,b);actions.push(`第${s.day}日升箭塔${b.level}`);defended=true;break;
      }
      if(!defended&&s.day>=3&&!s.buildings.some(b=>b.type==='rock')){
        const r=G.build(s,'rock',8,7);if(r.ok){actions.push(`第${s.day}日建擂石台`);defended=true;}
      }
      if(!defended&&s.day>=5&&!s.buildings.some(b=>b.type==='tao')){
        const r=G.build(s,'tao',6,7);if(r.ok)actions.push(`第${s.day}日建道观`);defended=true;
      }
    }
    if(!defended&&next<opening.length){
      const [type,x,y]=opening[next],result=G.build(s,type,x,y);
      if(result.ok){actions.push(`第${s.day}日建${G.DEFS[type].name}`);next++;}
      else if(!result.reason.startsWith('差 ') && result.reason!=='敌人正在此地')throw Error(`${type} (${x},${y}): ${result.reason}`);
    }else if(!defended&&style!=='build'){
      const candidates=s.buildings.filter(b=>b.level<G.maxLevel(b) && !G.upgradeReason(s,b));
      candidates.sort((a,b)=>G.upgradeCost(a).coins+G.upgradeCost(a).materials-G.upgradeCost(b).coins-G.upgradeCost(b).materials);
      if(candidates.length){const b=candidates[0];G.upgrade(s,b);actions.push(`第${s.day}日升${G.DEFS[b.type].name}${b.level}`);}
    }
    for(let i=0;i<4;i++)G.step(s,.25);
    seconds++;
    if(s.day!==lastDay){
      const rate=G.rates(s);
      const shrine=s.buildings.find(b=>b.type==='shrine');
      history.push({day:lastDay,seconds,coins:Math.floor(s.coins),materials:Math.floor(s.materials),incense:Math.floor(s.incense),coinRate:+rate.coins.toFixed(1),materialRate:+rate.materials.toFixed(1),buildings:s.buildings.length,levels:s.buildings.reduce((n,b)=>n+b.level-1,0),kills:s.kills,shrineLevel:shrine?.level||0,shrineHP:Math.floor(shrine?.hp||0)});
      lastDay=s.day;
    }
  }
  if(!history.length||history[history.length-1].day!==s.day) {
    const rate=G.rates(s),shrine=s.buildings.find(b=>b.type==='shrine');
    history.push({day:s.day,seconds,coins:Math.floor(s.coins),materials:Math.floor(s.materials),incense:Math.floor(s.incense),coinRate:+rate.coins.toFixed(1),materialRate:+rate.materials.toFixed(1),buildings:s.buildings.length,levels:s.buildings.reduce((n,b)=>n+b.level-1,0),kills:s.kills,shrineLevel:shrine?.level||0,shrineHP:Math.floor(shrine?.hp||0)});
  }
  return {style,seed,over:s.over,day:s.day,seconds,nextPlan:next,history,actions};
}
if(require.main===module){for(const style of ['build','upgrade','balanced']){const result=run(Number(process.argv[2]||10),style);console.log(JSON.stringify(result));}}
module.exports={run,opening};
