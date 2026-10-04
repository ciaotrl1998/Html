'use strict';
// Deterministic economy-and-defense playthroughs used while tuning the game.
const G = require('../js/game.js');

const opening = [
  ['tea',7,8],['mulberry',10,6],['tower',7,7],['tower',9,7],
  ['weaver',10,7],['quarry',11,11],['kiln',10,10],['inn',7,9],
  ['farm',5,8],['mill',6,9],['bank',8,10],['wine',7,10],
  ['tailor',10,8],['trade',10,9],['guild',8,9],['port',9,9]
];
const towerPlots = [[9,8],[8,9],[6,8],[8,6],[9,6]];
const fortunePlots = [[8,7],[6,7],[10,8]];
function run(days=10,style='build',seed=73193) {
  const s=G.createState(null),history=[];s.seed=seed;let next=0,seconds=0,lastDay=s.day,actions=[];
  while(!s.over && s.day<=days && seconds<days*230){
    while(next<opening.length&&s.buildings.some(b=>b.type===opening[next][0]&&b.x===opening[next][1]&&b.y===opening[next][2]))next++;
    let defended=false;
    if(style==='balanced'&&s.phase==='night'){
      const shrine=s.buildings.find(b=>b.type==='shrine');
      if(s.enemies.length>=6&&!G.skillReason(s,'thunder')){G.skill(s,'thunder');actions.push(`第${s.day}夜天雷`);}
      else if(shrine&&shrine.hp<G.maxHP(shrine)*.55&&!G.skillReason(s,'repair')){G.skill(s,'repair');actions.push(`第${s.day}夜回春`);}
      else if(s.enemies.length>=6&&!G.skillReason(s,'repel')){G.skill(s,'repel');actions.push(`第${s.day}夜驱鬼`);}
    }
    if(style==='balanced'){
      // Shortest routes hit producers directly; fund defense and raise their HP early.
      const b=s.buildings.find(b=>['tea','mulberry','quarry','weaver'].includes(b.type)&&b.level<3&&!G.upgradeReason(s,b));
      if(b){G.upgrade(s,b);actions.push(`第${s.day}日升${G.DEFS[b.type].name}${b.level}`);defended=true;}
    }
    if(style==='balanced'&&next>=4){
      const target=Math.min(G.MAX_LEVEL,1+Math.floor((s.day+1)/3)),shrine=s.buildings.find(b=>b.type==='shrine');
      const shrineTarget=G.requiredShrineLevel(target);
      if(!defended&&shrine.level<shrineTarget){
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
      const fortuneTarget=Math.min(fortunePlots.length,Math.floor(s.day/4));
      if(!defended&&s.fortuneBuilt<fortuneTarget){
        const plot=fortunePlots.find(([x,y])=>!G.at(s,x,y));
        if(plot){const r=G.build(s,'fortune',...plot);if(r.ok)actions.push(`第${s.day}日造化${G.DEFS[r.rolled].name}`);defended=true;}
      }
    }
    if(!defended&&next<opening.length){
      const [type,x,y]=opening[next],result=G.build(s,type,x,y);
      if(result.ok){actions.push(`第${s.day}日建${G.DEFS[type].name}`);next++;}
      else if(!result.reason.startsWith('差 ') && result.reason!=='敌人正在此地'){
        actions.push(`第${s.day}日跳过${G.DEFS[type].name}：${result.reason}`);next++;
      }
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
      history.push({day:lastDay,seconds,coins:Math.floor(s.coins),materials:Math.floor(s.materials),fortunes:s.fortuneBuilt,coinRate:+rate.coins.toFixed(1),materialRate:+rate.materials.toFixed(1),buildings:s.buildings.length,levels:s.buildings.reduce((n,b)=>n+b.level-1,0),kills:s.kills,shrineLevel:shrine?.level||0,shrineHP:Math.floor(shrine?.hp||0)});
      lastDay=s.day;
    }
  }
  if(!history.length||history[history.length-1].day!==s.day) {
    const rate=G.rates(s),shrine=s.buildings.find(b=>b.type==='shrine');
    history.push({day:s.day,seconds,coins:Math.floor(s.coins),materials:Math.floor(s.materials),fortunes:s.fortuneBuilt,coinRate:+rate.coins.toFixed(1),materialRate:+rate.materials.toFixed(1),buildings:s.buildings.length,levels:s.buildings.reduce((n,b)=>n+b.level-1,0),kills:s.kills,shrineLevel:shrine?.level||0,shrineHP:Math.floor(shrine?.hp||0)});
  }
  return {style,seed,over:s.over,day:s.day,seconds,nextPlan:next,history,actions};
}
if(require.main===module){for(const style of ['build','upgrade','balanced']){const result=run(Number(process.argv[2]||10),style);console.log(JSON.stringify(result));}}
module.exports={run,opening};
