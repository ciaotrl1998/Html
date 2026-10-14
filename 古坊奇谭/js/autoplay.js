/* One normal-resource controller for enemies, allies and optional player autoplay. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./game'):root.GF);if(typeof module==='object'&&module.exports)module.exports=api;else root.GFAutoplay=api;})(typeof globalThis!=='undefined'?globalThis:this,function(G){
  'use strict';
  const coversGate=(p,g)=>Math.hypot(p.x-g.x,p.y-g.y)<=3.5;
  function create(s){
    const land=G.estate(s),width=G.worldWidth(s),stats=s.ai;
    const plots=[...land.cells].map(k=>({x:k%width,y:Math.floor(k/width)})).filter(p=>G.terrain(p.x,p.y,s)!=='water');
    const actions=[];
    function record(kind,type){
      const text=(kind==='build'?'建造':kind==='upgrade'?'升级':'施放')+(G.DEFS[type]?.name||G.SKILLS[type].name);
      stats.lastAction=text;if(kind==='build')stats.builds++;else if(kind==='upgrade')stats.upgrades++;else stats.casts++;
      actions.push({second:s.elapsed,kind,type});if(actions.length>200)actions.shift();return true;
    }
    const build=(type,p)=>p&&G.build(s,type,p.x,p.y).ok&&record('build',type);
    const upgrade=b=>b&&G.upgrade(s,b).ok&&record('upgrade',b.type);
    function foundation(b){
      if(!b)return false;const reason=G.upgradeReason(s,b,true);
      if(reason.startsWith('需祠堂'))return foundation(s.buildings.find(n=>n.type==='shrine'));
      if(reason.startsWith('需城门'))return foundation(s.buildings.find(n=>n.type==='gate'));
      return upgrade(b);
    }
    function available(type){return plots.filter(p=>!G.buildReason(s,type,p.x,p.y,true));}
    function defense(){
      const enemies=G.hostileUnits(s);
      for(const g of land.gates){
        const nearby=enemies.filter(u=>Math.hypot(u.x-g.x,u.y-g.y)<=5),gate=G.at(s,g.x,g.y);
        if(!nearby.length)continue;
        const towers=s.buildings.filter(b=>b.type==='tower'&&coversGate(b,g));
        const force=nearby.reduce((n,u)=>n+u.baseDamage,0),power=towers.reduce((n,b)=>n+G.DEFS.tower.damage*G.factor(b)/G.DEFS.tower.interval,0);
        if(power>=force&&gate?.hp>G.maxHP(gate)*.5)continue;
        const existing=towers.find(b=>!G.upgradeReason(s,b));if(existing&&upgrade(existing))return true;
        if(towers.length<2){const p=available('tower').filter(p=>coversGate(p,g)).sort((a,b)=>Math.hypot(a.x-g.x,a.y-g.y)-Math.hypot(b.x-g.x,b.y-g.y))[0];if(build('tower',p))return true;}
        if(gate?.hp<G.maxHP(gate)*.5&&foundation(gate))return true;
      }return false;
    }
    function economy(){
      const rates=G.rates(s),weights={coins:1/Math.max(.5,rates.coins),materials:1/Math.max(.5,rates.materials)};
      const value=c=>c.coins*weights.coins+c.materials*weights.materials,options=[];
      for(const d of Object.values(G.DEFS).filter(d=>d.cat==='economy')){
        let best=null;
        for(const p of available(d.id)){
          const b={...p,type:d.id,level:1,owner:s.actorId},gain=G.income(s,b)*weights[d.resource];
          const score=gain/Math.max(1,value(G.buildCost(s,d.id)))*(land.roads.has(p.y*width+p.x)?.85:1);
          if(!best||score>best.score)best={score,run:()=>build(d.id,p)};
        }if(best)options.push(best);
      }
      for(const b of s.buildings.filter(b=>G.DEFS[b.type].income)){
        if(b.level>=G.maxLevel(b))continue;
        const next={...b,level:b.level+1},d=G.DEFS[b.type],reason=G.upgradeReason(s,b,true);
        const gain=(G.income(s,next)-G.income(s,b))*weights[d.resource],score=gain/Math.max(1,value(G.upgradeCost(b)));
        if(!reason)options.push({score,run:()=>upgrade(b)});
        else if(reason.startsWith('需祠堂'))options.push({score:score*.3,run:()=>foundation(s.buildings.find(n=>n.type==='shrine'))});
      }
      options.sort((a,b)=>b.score-a.score);for(const option of options)if(option.run())return true;return false;
    }
    function army(){
      const barracks=s.buildings.filter(b=>b.type==='barracks').sort((a,b)=>a.level-b.level||a.id-b.id),rates=G.rates(s);
      if(!barracks.length&&(rates.coins<3||rates.materials<2))return false;
      if(barracks.length){
        const b=barracks.find(b=>b.level<9&&!G.upgradeReason(s,b,true));
        if(b){if(upgrade(b))return true;stats.lastAction='为升级兵营留资';return 'saving';}
        if(barracks.length>=3){if(foundation(s.buildings.find(b=>b.type==='shrine')))return true;return false;}
      }
      const p=available('barracks').sort((a,b)=>Math.min(...land.gates.map(g=>Math.hypot(a.x-g.x,a.y-g.y)))-Math.min(...land.gates.map(g=>Math.hypot(b.x-g.x,b.y-g.y))))[0];
      if(!p)return false;if(build('barracks',p))return true;stats.lastAction='为新兵营留资';return 'saving';
    }
    function skills(){
      const id=s.selectedSkill;if(!id||G.skillReason(s,id))return false;
      const enemies=G.hostileUnits(s).filter(u=>G.inSkillZone(s,s.actorId,u));
      const wanted=id==='repair'?s.buildings.some(b=>b.hp/G.maxHP(b)<.6):enemies.length>=3||enemies.some(u=>Math.hypot(u.x-land.center.x,u.y-land.center.y)<3);
      return wanted&&G.skill(s,id).ok&&record('skill',id);
    }
    function tick(dt){
      if(s.over||s.eliminated||!Number.isFinite(dt)||dt<=0)return false;
      stats.activeSeconds+=dt;stats.clock+=dt;if(stats.clock<1-1e-8)return false;stats.clock=Math.max(0,stats.clock-1);stats.decisions++;
      const cast=skills();if(defense())return true;
      if(!s.buildings.some(b=>b.type==='barracks')||stats.armyTurn){const action=army();if(action){if(action===true)stats.armyTurn=false;return action===true||cast;}}
      if(economy()){stats.armyTurn=true;return true;}
      return !!army()||cast;
    }
    const report=()=>({schema:2,controller:'estate-attack-v1',...stats,skills:{total:stats.casts},actions:[...actions],mapSeed:s.mapSeed,owner:s.actorId,over:s.over,eliminated:s.eliminated,rates:G.rates(s)});
    return {tick,report,get lastAction(){return stats.lastAction;}};
  }
  G.setControllerFactory(create);
  return {create,coversGate};
});
