/* Local test player. All actions go through the same rules as player input. */
(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory(require('./game.js'));
  else root.GFAutoplay=factory(root.GF);
})(typeof globalThis!=='undefined'?globalThis:this,function(G){
  'use strict';
  const key = p => `${p.x},${p.y}`;
const near = (a, b) => G.dist8(a.x, a.y, b.x, b.y) === 1;
const coversGate = (p, gate) => {
  const [dx,dy] = [[0,-1],[1,0],[0,1],[-1,0]][gate.direction];
  // Reserve coverage for both the gate and the grid tile on its outer approach.
  return Math.hypot(p.x-gate.x,p.y-gate.y) <= G.DEFS.tower.range &&
    Math.hypot(p.x-gate.x-dx,p.y-gate.y-dy) <= G.DEFS.tower.range;
};

function layout(s, towersPerGate) {
  const size = G.worldSize(s), center = G.worldCenter(s);
  const plots = [...G.estate(s).cells].map(k => ({x:k % size,y:Math.floor(k / size)}))
    .filter(p => G.terrain(p.x,p.y,s) !== 'water' && !G.at(s,p.x,p.y));
  const reserved = new Set(), towers = [];
  for (const gate of G.estate(s).gates) {
    const candidates = plots.filter(p => coversGate(p,gate))
      .sort((a,b) => score(a)-score(b) || a.y-b.y || a.x-b.x);
    function score(p) {
      return Math.hypot(p.x-gate.x,p.y-gate.y) +
        (G.estate(s).roads.has(p.y*size+p.x) ? 20 : 0) +
        (G.terrain(p.x,p.y,s) === 'plain' ? 0 : 10);
    }
    for (let i=0;i<towersPerGate;i++) {
      const p = candidates.find(p => !reserved.has(key(p)));
      if (!p) throw new Error(`No land tower coverage for gate ${gate.direction}`);
      reserved.add(key(p));towers.push({...p,type:'tower',direction:gate.direction});
    }
  }
  const available = plots.filter(p => !reserved.has(key(p)));
  const neighbors = p => available.filter(q => near(p,q));
  const ordinary = p => ['plain','shore'].includes(G.terrain(p.x,p.y,s));
  const used = new Set(reserved), plan = [];
  // Search both chains around a common final building, reserving all seven tiles.
  function pair(chainA,chainB,final) {
    const connectors = available.filter(ordinary).sort((a,b) =>
      G.dist8(a.x,a.y,center,center)-G.dist8(b.x,b.y,center,center) || a.y-b.y || a.x-b.x);
    function triples(chain,connector) {
      const [root,middle,end] = chain, found = [];
      for (const e of neighbors(connector).filter(ordinary)) {
        if (used.has(key(e))) continue;
        for (const m of neighbors(e).filter(ordinary)) {
          if (used.has(key(m)) || key(m) === key(connector)) continue;
          for (const r of neighbors(m)) {
            if (used.has(key(r)) || key(r) === key(e) || key(r) === key(connector)) continue;
            if (G.terrain(r.x,r.y,s) !== G.DEFS[root].terrain) continue;
            found.push([{...r,type:root},{...m,type:middle},{...e,type:end}]);
          }
        }
      }
      return found;
    }
    for (const c of connectors) {
      if (used.has(key(c))) continue;
      for (const a of triples(chainA,c)) {
        a.forEach(p => used.add(key(p)));
        const b = triples(chainB,c)[0];
        if (b) {
          b.forEach(p => used.add(key(p)));used.add(key(c));
          plan.push(...a,...b,{...c,type:final});return true;
        }
        a.forEach(p => used.delete(key(p)));
      }
    }
    return false;
  }
  if (!pair(['tea','inn','bank'],['farm','mill','wine'],'guild') ||
      !pair(['mulberry','weaver','tailor'],['quarry','kiln','trade'],'port')) {
    throw new Error(`Cannot fit complete economy layout for seed ${s.mapSeed}`);
  }
  // Starters first, then processors, endpoints, and the two final buildings.
  plan.sort((a,b) => (G.DEFS[a.type].tier ?? 3)-(G.DEFS[b.type].tier ?? 3) ||
    ['tea','mulberry','quarry','farm'].indexOf(a.type)-['tea','mulberry','quarry','farm'].indexOf(b.type));
  return {economy:plan,towers,plots};
}



  function create(s) {
    const size=G.worldSize(s),center=G.worldCenter(s),land=G.estate(s);
    const plots=[];
    for(let y=0;y<G.worldHeight(s);y++)for(let x=0;x<size;x++){
      if(G.owns(s,x,y) && !G.isWall(s,x,y) && G.terrain(x,y,s)!=='water' && !land?.gates.some(g=>g.x===x&&g.y===y))plots.push({x,y});
    }
    let planned=null;
    if(land && s.buildings.every(b=>['shrine','gate'].includes(b.type))){
      try {planned=layout(s,1);} catch { /* Crowded or unusual maps use adaptive placement. */ }
    }
    const gates=land?.gates || [{x:center,y:center-3,direction:0},{x:center+3,y:center,direction:1},{x:center,y:center+3,direction:2},{x:center-3,y:center,direction:3}];
    const stats={activeSeconds:0,decisions:0,builds:0,upgrades:0,skills:{repair:0,thunder:0,repel:0},lastAction:'等待开始',startDay:s.day,startElapsed:s.elapsed,mapSeed:s.mapSeed??null,mapGeneration:s.mapGeneration??1,actions:[],droppedActions:0};
    let clock=1,forecastDay=0,forecast=null,decisionReason='发展产业',defenseBudget={coins:0,materials:0};
    function record(kind,type,building){
      const name=kind==='skill'?G.SKILLS[type].name:G.DEFS[type].name;
      stats.lastAction=(kind==='build'?'建造':kind==='upgrade'?'升级':'施放')+name+(kind==='upgrade'?' Lv.'+building.level:'');
      const entry={second:+stats.activeSeconds.toFixed(1),day:s.day,phase:s.phase,kind,type,reason:decisionReason,coins:s.coins,materials:s.materials};
      if(building)Object.assign(entry,{x:building.x,y:building.y,level:building.level});
      stats.actions.push(entry);
      if(stats.actions.length>2000){stats.actions.shift();stats.droppedActions++;}
      if(kind==='skill')stats.skills[type]++;else if(kind==='build')stats.builds++;else stats.upgrades++;
      return true;
    }
    function build(type,p){
      if(!p || G.buildReason(s,type,p.x,p.y))return false;
      const r=G.build(s,type,p.x,p.y);return r.ok && record('build',r.rolled||type,r.building);
    }
    function upgradeFoundation(b){
      if(!b || !['shrine','gate'].includes(b.type))return b;
      const reason=G.upgradeReason(s,b,true);
      const type=b.type==='shrine'&&reason.startsWith('需城门')?'gate':b.type==='gate'&&reason.startsWith('需祠堂')?'shrine':null;
      if(!type)return b;
      // Only advance the lagging counterpart, once per decision.
      return s.buildings.find(n=>n.type===type&&n.level<b.level);
    }
    function upgrade(b){
      b=upgradeFoundation(b);
      return b && !G.upgradeReason(s,b) && G.upgrade(s,b).ok && record('upgrade',b.type,b);
    }
    function towerPlots(){
      if(planned?.towers.some(p=>{const b=G.at(s,p.x,p.y);return b&&b.type!=='tower';}))planned=null;
      if(planned)return planned.towers;
      const reserved=new Set(),result=[];
      for(const gate of gates){
        const present=s.buildings.filter(b=>b.type==='tower'&&coversGate(b,gate)).length;
        const choices=plots.filter(p=>!G.at(s,p.x,p.y)&&coversGate(p,gate)&&!reserved.has(key(p)));
        choices.sort((a,b)=>score(a)-score(b));
        function score(p){return Math.hypot(p.x-gate.x,p.y-gate.y)+(land?.roads.has(p.y*size+p.x)?20:0)+(G.terrain(p.x,p.y,s)==='plain'?0:10);}
        for(const p of choices.slice(0,Math.max(0,1-present))){reserved.add(key(p));result.push({...p,type:'tower',direction:gate.direction});}
      }
      return result;
    }
    function economy(towers){
      if(planned?.economy.some(p=>{const b=G.at(s,p.x,p.y);return b&&b.type!==p.type;}))planned=null;
      const rates=G.rates(s),weights={coins:1/Math.max(.5,rates.coins),materials:1/Math.max(.5,rates.materials)};
      const value=cost=>cost.coins*weights.coins+cost.materials*weights.materials;
      const options=[],base=G.rates(s);
      // Keep enough for one emergency tower as dusk approaches; don't spend the
      // reserve on upgrades or a fortune box before the incoming side is known.
      const reserve=s.phase==='day'&&s.time>G.DAY-18?G.DEFS.tower.cost:defenseBudget;
      const affordable=cost=>s.coins>=cost.coins+reserve.coins&&s.materials>=cost.materials+reserve.materials;
      function gain(buildings){const next=G.rates({...s,buildings});return (next.coins-base.coins)*weights.coins+(next.materials-base.materials)*weights.materials;}
      for(const d of Object.values(G.DEFS).filter(d=>d.cat==='economy')){
        if(d.limit&&s.buildings.filter(b=>b.type===d.id).length>=d.limit)continue;
        const cost=G.buildCost(s,d.id);
        // Preserve future chain connections, while allowing additional buildings
        // of every type up to the game's actual limit and spacing rules.
        let best=null;
        for(const p of plots){
          if(towers.some(t=>key(t)===key(p)))continue;
          if(planned?.economy.some(q=>key(q)===key(p)&&q.type!==d.id))continue;
          const reason=G.buildReason(s,d.id,p.x,p.y);if(reason&&!reason.startsWith('差 '))continue;
          const b={...p,type:d.id,level:1},increase=gain([...s.buildings,b]);
          let open=0;for(const q of plots)if(near(p,q)&&!G.at(s,q.x,q.y)&&['plain','shore'].includes(G.terrain(q.x,q.y,s)))open++;
          const plannedPlot=planned?.economy.some(q=>q.type===d.id&&key(q)===key(p));
          const score=increase/Math.max(1,value(cost))*(plannedPlot?1.12:1)*(1+open*.005);
          if(!best||score>best.score)best={score,cost,run:()=>build(d.id,p),reason:'扩建'+d.name+'，提高'+(d.resource==='materials'?'工材':'铜钱')+'收入'};
        }
        if(best)options.push(best);
      }
      const shrineBuilding=s.buildings.find(b=>b.type==='shrine');
      for(const b of s.buildings.filter(b=>G.DEFS[b.type].income)){
        if(b.level>=G.maxLevel(b))continue;
        const reason=G.upgradeReason(s,b),next={...b,level:b.level+1},cost=G.upgradeCost(b);
        const increase=gain(s.buildings.map(n=>n===b?next:n));
        if(!reason||reason.startsWith('差 '))options.push({score:increase/Math.max(1,value(cost)),cost,run:()=>upgrade(b),reason:'升级'+G.DEFS[b.type].name+'，提高单位投入收益'});
        else if(reason.startsWith('需祠堂')&&shrineBuilding){
          const foundation=upgradeFoundation(shrineBuilding);
          if(!foundation||G.upgradeReason(s,foundation,true))continue;
          const required=G.requiredShrineLevel(next.level),total={...cost};
          for(let level=shrineBuilding.level;level<required;level++){const c=G.upgradeCost({...shrineBuilding,level});total.coins+=c.coins;total.materials+=c.materials;}
          const gate=s.buildings.find(n=>n.type==='gate');
          if(gate)for(let level=gate.level;level<required-1;level++){const c=G.upgradeCost({...gate,level});total.coins+=c.coins;total.materials+=c.materials;}
          options.push({score:increase/Math.max(1,value(total)),cost:G.upgradeCost(foundation),run:()=>upgrade(shrineBuilding),reason:'提升祠堂与城门，解锁产业升级'});
        }
      }
      options.sort((a,b)=>b.score-a.score);
      const best=options[0],ready=options.find(o=>affordable(o.cost));
      // Save briefly for a clearly better investment instead of spending every
      // spare coin on a lower-value action. Zero production never causes a wait.
      if(best&&ready&&best.score>ready.score*1.5&&!affordable(best.cost)){
        const wait=Math.max(Math.max(0,best.cost.coins+reserve.coins-s.coins)/(rates.coins||.0001),Math.max(0,best.cost.materials+reserve.materials-s.materials)/(rates.materials||.0001));
        if(wait<=8)return false;
      }
      if(ready){decisionReason=ready.reason;return ready.run();}
      return false;
    }
    function defense(towers){
      if(s.phase==='day')return false;
      if(forecastDay!==s.day){
        // Ask the actual simulation for a sample wave; only the copy is advanced.
        const probe=G.restore(G.serialize(s));
        if(probe){probe.enemies=[];probe.buildings=probe.buildings.filter(b=>!G.DEFS[b.type].damage);G.startNight(probe);G.step(probe,.25);G.step(probe,.25);forecast={hp:probe.enemies[0]?.maxHp||45,total:probe.wave?.total||5,interval:(probe.wave?.timer||1)+.15};}
        else forecast={hp:45,total:5,interval:1.3};
        forecastDay=s.day;
      }
      const boss=s.day%7===0&&s.mode!=='coop',directions=G.raidDirections(s),pending=s.phase==='night'?Math.max(0,(s.wave?.total||0)-(s.wave?.spawned||0)):forecast.total;
      const damage=b=>G.DEFS[b.type].damage*G.factor(b)*G.defenseBoost(s)/G.DEFS[b.type].interval;
      const covers=(b,g)=>Math.hypot(b.x-g.x,b.y-g.y)<=G.DEFS[b.type].range+(b.level-1)*.35;
      const needs=[];
      for(const gate of gates){
        const enemies=s.enemies.filter(e=>e.targetGateId!=null
          ? s.buildings.some(b=>b.id===e.targetGateId&&b.x===gate.x&&b.y===gate.y)
          : gates.reduce((a,b)=>Math.hypot(e.x-a.x,e.y-a.y)<=Math.hypot(e.x-b.x,e.y-b.y)?a:b)===gate);
        if(!directions.includes(gate.direction)&&!enemies.length)continue;
        if(!pending&&!enemies.length)continue;
        const defenders=s.buildings.filter(b=>G.DEFS[b.type].damage&&covers(b,gate)),firepower=defenders.reduce((n,b)=>n+damage(b),0);
        const nearEnemies=enemies.filter(e=>Math.hypot(e.x-gate.x,e.y-gate.y)<4);
        const gateBuilding=s.buildings.find(b=>b.type==='gate'&&b.direction===gate.direction),health=gateBuilding?gateBuilding.hp/G.maxHP(gateBuilding):1;
        const remaining=pending/(s.mode==='coop'?2:boss?4:1)+enemies.length;
        const sustained=forecast.hp*(s.day>=4?1.45:1)/forecast.interval*.6*(boss?.6:1)*Math.min(1,remaining/5);
        const urgent=nearEnemies.reduce((n,e)=>n+e.hp,0)/(health<.5?4:10);
        const target=Math.max(sustained,urgent);
        if(firepower>=target)continue;
        needs.push({gate,defenders,missing:target-firepower,urgent:health<.5&&nearEnemies.length>0});
      }
      needs.sort((a,b)=>Number(b.urgent)-Number(a.urgent)||b.missing-a.missing);
      for(const {gate,defenders,missing,urgent} of needs){
        decisionReason=['北','东','南','西'][gate.direction]+'方'+(urgent?'城门受压':'来袭火力不足')+'，补强防守';
        const choices=[];
        for(const b of defenders){
          if(!G.upgradeReason(s,b)){const cost=G.upgradeCost(b),gain=damage({...b,level:b.level+1})-damage(b);choices.push({score:Math.min(missing,gain)*1.5/(cost.coins+cost.materials),run:()=>upgrade(b)});}
        }
        choices.sort((a,b)=>b.score-a.score);if(choices[0]?.run())return true;
        const shrineBuilding=s.buildings.find(b=>b.type==='shrine');
        const locked=defenders.some(b=>G.upgradeReason(s,b).startsWith('需祠堂'));
        if(locked&&upgrade(shrineBuilding))return true;
        // Expand defensive footprint only if the existing defenders cannot be
        // improved, or the gate is under immediate pressure. Otherwise save.
        if(defenders.some(b=>b.level<G.maxLevel(b))&&!urgent){
          const foundation=locked&&upgradeFoundation(shrineBuilding);
          const costs=foundation?[G.upgradeCost(foundation)]:defenders.filter(b=>b.level<G.maxLevel(b)).map(G.upgradeCost);
          costs.sort((a,b)=>a.coins+a.materials-b.coins-b.materials);defenseBudget=costs[0]||G.DEFS.tower.cost;continue;
        }
        const candidates=plots.filter(p=>coversGate(p,gate)&&!G.buildReason(s,'tower',p.x,p.y)&&!planned?.economy.some(q=>key(q)===key(p)));
        candidates.sort((a,b)=>Number(towers.some(t=>key(t)===key(b)))-Number(towers.some(t=>key(t)===key(a))) || Math.hypot(a.x-gate.x,a.y-gate.y)-Math.hypot(b.x-gate.x,b.y-gate.y));
        if(candidates.length&&build('tower',candidates[0]))return true;
        defenseBudget=G.DEFS.tower.cost;
        const gateBuilding=s.buildings.find(b=>b.type==='gate'&&b.direction===gate.direction);
        if(urgent&&gateBuilding?.hp>0&&upgrade(gateBuilding))return true;
      }
      return false;
    }
    function skills(){
      if(s.phase!=='night')return false;
      const damaged=s.buildings.some(b=>b.hp/G.maxHP(b)<.6);
      const pressure=s.enemies.filter(e=>gates.some(g=>Math.hypot(e.x-g.x,e.y-g.y)<2)).length;
      const shrine=s.buildings.find(b=>b.type==='shrine');
      const nearShrine=shrine&&s.enemies.some(e=>Math.hypot(e.x-shrine.x,e.y-shrine.y)<3);
      for(const [id,wanted] of [['repair',damaged],['thunder',s.enemies.length>=5||nearShrine],['repel',pressure>=3||nearShrine]]){
        if(wanted&&!G.skillReason(s,id)&&G.skill(s,id).ok){decisionReason='按当前战况施法';return record('skill',id);}
      }
      return false;
    }
    function tick(dt){
      if(s.over||!Number.isFinite(dt)||dt<=0)return false;
      stats.activeSeconds+=dt;clock+=dt;if(clock<1)return false;clock%=1;stats.decisions++;
      const cast=skills(),towers=towerPlots();defenseBudget={coins:0,materials:0};
      const acted=defense(towers)||economy(towers);
      return !!(acted||cast);
    }
    function report(){
      return {schema:1,controller:'income-pressure-v2',...stats,activeSeconds:+stats.activeSeconds.toFixed(1),day:s.day,phase:s.phase,over:s.over,kills:s.kills,buildings:s.buildings.length,rates:G.rates(s),skills:{...stats.skills},actions:stats.actions.map(a=>({...a}))};
    }
    return {tick,report,get lastAction(){return stats.lastAction;}};
  }
  return {create,layout,coversGate};
});
