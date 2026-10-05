'use strict';
const G = require('../js/game.js');
const crypto = require('node:crypto');
const fs = require('node:fs');

const round = n => +n.toFixed(3);
const {layout,coversGate} = require("../js/autoplay.js");
const key = p => `${p.x},${p.y}`;

function run(days=30,style='balanced',seed=73193,options={}) {
  if (!Number.isInteger(days) || days<1 || !['balanced','economy','defense'].includes(style) ||
      !Number.isInteger(seed) || seed<0 || seed>0xffffffff) throw new Error('Invalid days, style or uint32 seed');
  const towersPerGate = options.towersPerGate ?? 2;
  if (![2,3].includes(towersPerGate)) throw new Error('towersPerGate must be 2 or 3');
  const useSkills = options.useSkills ?? true;
  const reinforcementDay = options.reinforcementDay ?? null;
  if(typeof useSkills!=='boolean') throw new Error('useSkills must be boolean');
  if(reinforcementDay!==null && (!Number.isInteger(reinforcementDay) || reinforcementDay<1)) {
    throw new Error('reinforcementDay must be a positive integer');
  }
  const maxSeconds = options.maxSeconds ?? days*1200;
  if (!Number.isFinite(maxSeconds) || maxSeconds<=0) throw new Error('Invalid maxSeconds');
  const s = G.createState(seed,options.mapGeneration ?? 2);s.seed=seed;
  if (G.worldSize(s)!==25 || !G.estate(s)) throw new Error('Expected a 25-tile estate');
  const gameHash = crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../js/game.js'))).digest('hex');
  const delayed = towersPerGate===3 && reinforcementDay!==null;
  const planned = layout(s,delayed?2:towersPerGate),history=[],actions=[];
  const reinforcements = [];
  if(delayed) {
    const fortunePlot=planned.plots.find(p=>!planned.economy.some(q=>key(q)===key(p)) &&
      !planned.towers.some(q=>key(q)===key(p)));
    // Keep the two-tower economy layout intact, then reserve an extra land plot per gate.
    for(const gate of G.estate(s).gates) {
      const candidates=planned.plots.filter(p=>
        !planned.economy.some(q=>key(q)===key(p)) && !planned.towers.some(q=>key(q)===key(p)) &&
        (!fortunePlot || key(p)!==key(fortunePlot)) &&
        coversGate(p,gate));
      candidates.sort((a,b)=>score(a)-score(b) || a.y-b.y || a.x-b.x);
      function score(p) {
        return Math.hypot(p.x-gate.x,p.y-gate.y) +
          (G.estate(s).roads.has(p.y*G.worldSize(s)+p.x)?20:0) +
          (G.terrain(p.x,p.y,s)==='plain'?0:10);
      }
      if(!candidates.length) throw new Error(`No reinforcement plot for gate ${gate.direction}`);
      const p={...candidates[0],type:'tower',direction:gate.direction,availableDay:reinforcementDay};
      planned.towers.push(p);reinforcements.push(p);
    }
  }
  let firstLevel9Day=null,fullLevel9Day=null,shrine15Day=null,seconds=0,totalUpgrades=0;
  let daily;
  function reset() {
    daily={day:s.day,upgrades:0,builds:0,gateMinHPRatio:1,shrineMinHPRatio:1,
      nightDeaths:0,gateBreaks:0,nightSeconds:0,skills:{thunder:0,repair:0,repel:0}};
  }
  reset();
  function record(complete) {
    const rate=G.rates(s),eco=s.buildings.filter(b => G.DEFS[b.type].cat==='economy');
    // Dawn has already advanced the calendar; report the finished day's festival multiplier.
    if(complete) {
      const multiplier=(daily.day%7===0?1.25:1)/(s.day%7===0?1.25:1);
      rate.coins*=multiplier;rate.materials*=multiplier;
    }
    const defenses=s.buildings.filter(b => G.DEFS[b.type].damage);
    history.push({...daily,complete,seconds:round(seconds),coins:Math.floor(s.coins),materials:Math.floor(s.materials),
      coinRate:round(rate.coins),materialRate:round(rate.materials),totalUpgrades,
      averageProductionLevel:round(eco.reduce((n,b)=>n+b.level,0)/(eco.length||1)),
      highestLevel:Math.max(0,...s.buildings.filter(b=>b.type!=='shrine').map(b=>b.level)),
      shrineLevel:G.shrineLevel(s),gateLevel:s.gateLevel,
      defenseLevel:round(defenses.reduce((n,b)=>n+b.level,0)/(defenses.length||1)),
      defenseMinLevel:defenses.length?Math.min(...defenses.map(b=>b.level)):0,
      towers:s.buildings.filter(b=>b.type==='tower').length,economyBuildings:eco.length,
      economyTypes:[...new Set(eco.map(b=>b.type))],buildings:s.buildings.length,kills:s.kills,
      gateMinHPRatio:round(daily.gateMinHPRatio),shrineMinHPRatio:round(daily.shrineMinHPRatio),
      nightSeconds:round(daily.nightSeconds)});
  }
  function audit() { return {phase:s.phase,direction:s.direction,coins:s.coins,materials:s.materials}; }
  function upgrade(b) {
    if(b && ['shrine','gate'].includes(b.type)) {
      const reason=G.upgradeReason(s,b,true);
      const type=b.type==='shrine'&&reason.startsWith('需城门')?'gate':b.type==='gate'&&reason.startsWith('需祠堂')?'shrine':null;
      // Pay for one real upgrade of the lagging foundation, without recursion.
      if(type)b=s.buildings.find(n=>n.type===type && n.level<b.level);
    }
    if (!b || G.upgradeReason(s,b)) return false;
    if (!G.upgrade(s,b).ok) return false;
    totalUpgrades++;daily.upgrades++;
    if(b.type!=='shrine' && b.level===9 && firstLevel9Day===null) firstLevel9Day=s.day;
    if(b.type==='shrine' && b.level===15 && shrine15Day===null) shrine15Day=s.day;
    actions.push({second:seconds,day:s.day,kind:'upgrade',type:b.type,level:b.level,id:b.id,x:b.x,y:b.y,...audit()});return true;
  }
  function build(type,p) {
    if(G.buildReason(s,type,p.x,p.y)) return false;
    const r=G.build(s,type,p.x,p.y);if(!r.ok)return false;
    daily.builds++;actions.push({second:seconds,day:s.day,kind:'build',type:r.rolled||type,x:p.x,y:p.y,...audit()});return true;
  }
  function economy() {
    for(const p of planned.economy) if(!G.at(s,p.x,p.y) && build(p.type,p)) return true;
    const eco=s.buildings.filter(b=>G.DEFS[b.type].cat==='economy');
    const rates=G.rates(s),scarce=rates.coins<rates.materials?'coins':'materials';
    eco.sort((a,b)=>a.level-b.level || Number(G.DEFS[b.type].resource===scarce)-Number(G.DEFS[a.type].resource===scarce) || a.id-b.id);
    for(const b of eco) if(upgrade(b)) return true;
    return false;
  }
  function defense() {
    const alerted=s.phase!=='day';
    const incoming=p=>alerted && (s.day%7===0 || p.direction===s.direction);
    // Round-robin gate directions before adding the second/third ring.
    const plots=planned.towers.filter(p=>s.day>=(p.availableDay??1)).sort((a,b)=>
      Number(incoming(b))-Number(incoming(a)) ||
      planned.towers.filter(p=>p.direction===a.direction).indexOf(a)-planned.towers.filter(p=>p.direction===b.direction).indexOf(b) || a.direction-b.direction);
    const target=Math.min(G.MAX_LEVEL,2+Math.floor(s.day/2));
    if(alerted) {
      for(const p of plots.filter(incoming)) if(!G.at(s,p.x,p.y) && build('tower',p))return true;
      for(const p of plots.filter(incoming)) {
        const b=G.at(s,p.x,p.y);
        if(b?.type==='tower' && b.level<target && upgrade(b))return true;
      }
    }
    for(const p of plots) if(!G.at(s,p.x,p.y) && build('tower',p))return true;
    const gate=s.buildings.find(b=>b.type==='gate');
    if(gate.level<target && upgrade(gate))return true;
    const towers=s.buildings.filter(b=>G.DEFS[b.type].damage).sort((a,b)=>a.level-b.level || a.id-b.id);
    for(const b of towers) if(b.level<target && upgrade(b))return true;
    return false;
  }
  function shrine() {
    const b=s.buildings.find(b=>b.type==='shrine'),unlocked=G.unlockedBuildingLevel(s);
    const eco=s.buildings.filter(b=>G.DEFS[b.type].cat==='economy');
    const ready=style==='defense' || eco.filter(b=>b.level>=unlocked).length>=Math.max(1,eco.length/2);
    const target=Math.min(G.MAX_LEVEL,2+Math.floor(s.day/2));
    if(b && b.level<G.requiredShrineLevel(target) && ready)return upgrade(b);
    return false;
  }
  function skills() {
    if(!useSkills || style!=='balanced' || s.phase!=='night')return;
    const damaged=s.buildings.some(b=>b.hp/G.maxHP(b)<.6);
    const atGate=s.enemies.filter(e=>s.buildings.some(b=>b.type==='gate' && Math.hypot(e.x-b.x,e.y-b.y)<2)).length;
    const requests=[['repair',damaged],['thunder',s.enemies.length>=5],['repel',atGate>=3]];
    for(const [id,pressure] of requests) if(pressure && !G.skillReason(s,id) && G.skill(s,id).ok) {
      daily.skills[id]++;actions.push({second:seconds,day:s.day,kind:'skill',type:id});break;
    }
  }
  while(!s.over && s.day<=days && seconds<maxSeconds) {
    skills();
    const opening=style==='balanced' && s.buildings.filter(b=>G.DEFS[b.type].cat==='economy').length<2;
    const tasks=style==='economy'?[shrine,economy]:style==='defense'?[shrine,defense]:
      s.phase!=='day'?[defense,shrine,economy]:opening?[economy,defense,shrine]:seconds%3===0?[shrine,defense,economy]:[shrine,economy,defense];
    let acted=tasks.some(fn=>fn());
    // One optional fortune advances missions; failures never block normal actions.
    if(!acted && style==='balanced' && s.fortuneBuilt<(options.fortunes ?? 1)) {
      const p=planned.plots.find(p=>!planned.economy.some(q=>key(q)===key(p)) &&
        !planned.towers.some(q=>key(q)===key(p)) && !G.buildReason(s,'fortune',p.x,p.y));
      if(p)acted=build('fortune',p);
    }
    if(fullLevel9Day===null && s.gateLevel===G.MAX_LEVEL &&
      [...planned.economy,...planned.towers].every(p=>{
        const b=G.at(s,p.x,p.y);return b?.type===p.type && b.level===G.MAX_LEVEL;
      })) fullLevel9Day=s.day;
    for(let tick=0;tick<4 && !s.over && s.day<=days;tick++) {
      const oldDay=s.day,night=s.phase==='night';
      const before=s.buildings.map(b=>({id:b.id,type:b.type,hp:b.hp}));
      G.step(s,.25);seconds+=.25;
      if(night) {
        daily.nightSeconds+=.25;
        daily.nightDeaths+=before.filter(b=>!s.buildings.some(n=>n.id===b.id)).length;
        daily.gateBreaks+=before.filter(b=>b.type==='gate' && b.hp>0 && s.buildings.find(n=>n.id===b.id)?.hp===0).length;
      }
      const gates=s.buildings.filter(b=>b.type==='gate');
      daily.gateMinHPRatio=Math.min(daily.gateMinHPRatio,...gates.map(b=>b.hp/G.maxHP(b)));
      const base=s.buildings.find(b=>b.type==='shrine');
      daily.shrineMinHPRatio=Math.min(daily.shrineMinHPRatio,base?base.hp/G.maxHP(base):0);
      if(s.day!==oldDay) {record(true);reset();}
    }
  }
  if(s.day<=days)record(false);
  return {style,seed,days,worldSize:25,gameHash,options:{towersPerGate,useSkills,reinforcementDay,fortunes:options.fortunes??1,maxSeconds},
    over:s.over,day:s.day,seconds:round(seconds),stopReason:s.over?'defeat':s.day>days?'completed':'timeout',
     firstLevel9Day,fullLevel9Day,shrine15Day,history,actions,layout:{economy:planned.economy,towers:planned.towers,reinforcements},
    finalBuildings:s.buildings.map(b=>({type:b.type,x:b.x,y:b.y,level:b.level,hp:round(b.hp)}))};
}

function summary(result) {
  return {style:result.style,seed:result.seed,options:result.options,over:result.over,day:result.day,stopReason:result.stopReason,
    firstLevel9Day:result.firstLevel9Day,fullLevel9Day:result.fullLevel9Day,shrine15Day:result.shrine15Day,
    milestones:result.history.filter(h=>[5,10,15,20,25,30,35].includes(h.day) || !h.complete).map(h=>({
      day:h.day,complete:h.complete,coins:h.coins,materials:h.materials,rates:[h.coinRate,h.materialRate],
      upgrades:h.upgrades,productionLevel:h.averageProductionLevel,maxLevel:h.highestLevel,
      shrine:h.shrineLevel,gate:h.gateLevel,defense:h.defenseLevel,towers:h.towers,economy:h.economyBuildings,
      gateHP:h.gateMinHPRatio,shrineHP:h.shrineMinHPRatio,deaths:h.nightDeaths,gateBreaks:h.gateBreaks,
      nightSeconds:h.nightSeconds,skills:h.skills}))};
}

if(require.main===module) {
  const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const [k,...v]=arg.replace(/^--/,'').split('=');return [k,v.join('=')||true];}));
  const days=Number(args.days??30),style=args.style??'balanced';
  const seeds=String(args.seeds??'1,7,42,73193,99991').split(',').map(Number);
  const options={};
  if(args.useSkills!==undefined) {
    if(!['true','false'].includes(args.useSkills)) throw new Error('--useSkills must be true or false');
    options.useSkills=args.useSkills==='true';
  }
  for(const name of ['towersPerGate','reinforcementDay','fortunes','maxSeconds']) {
    if(args[name]!==undefined) options[name]=Number(args[name]);
  }
  const results=seeds.map(seed=>run(days,style,seed,options));
  // Artifact data goes to stdout; workspace artifacts are saved through apply_patch.
  if(args.baseline)console.log(JSON.stringify({schema:1,kind:'estate-baseline',results}));
  else for(const result of results)console.log(JSON.stringify(summary(result)));
}
module.exports={run,summary};
