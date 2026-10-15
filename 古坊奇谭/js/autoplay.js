/* Balanced economy and military controller for computer estates and player autoplay. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./game'):root.GF);if(typeof module==='object'&&module.exports)module.exports=api;else root.GFAutoplay=api;})(typeof globalThis!=='undefined'?globalThis:this,function(G){
  'use strict';
  const coversGate=(p,g)=>Math.hypot(p.x-g.x,p.y-g.y)<=3.5;
  const NEXT={tea:'inn',inn:'bank',farm:'mill',mill:'wine',mulberry:'weaver',weaver:'tailor',quarry:'kiln',kiln:'trade'};
  const PARTNER={bank:'tailor',tailor:'bank',wine:'trade',trade:'wine'};
  const ULTIMATES=Object.values(G.DEFS).filter(d=>d.required);
  const REPORTS=new WeakMap();
  const MILITARY_INCOME_THRESHOLDS=[0,10,18,36,72,144,288,576,1152];
  const desiredMilitaryLevel=minimum=>MILITARY_INCOME_THRESHOLDS.reduce((level,threshold,index)=>minimum>=threshold?index+1:level,1);
  function nextBarracksTroop(buildings){
    const specialized=buildings.filter(b=>b.type==='barracks'&&b.level>=2);
    return specialized.filter(b=>G.troopType(b)==='archer').length<Math.floor((specialized.length+1)/3)?'archer':'infantry';
  }

  function create(state){
    const s=state.actorId===undefined&&state.players?G.playerView(state,0):state;
    const land=G.estate(s),width=G.worldWidth(s),stats=s.ai||(s.ai={});
    const defaults={clock:0,armyTurn:true,activeSeconds:0,decisions:0,builds:0,upgrades:0,casts:0,lastAction:'准备经营'};
    for(const [key,value] of Object.entries(defaults))if(stats[key]===undefined)stats[key]=value;
    const plots=[...land.cells].map(k=>({x:k%width,y:Math.floor(k/width)})).filter(p=>G.terrain(p.x,p.y,s)!=='water');
    const plotKeys=new Set(plots.map(p=>p.y*width+p.x));
    let telemetry=REPORTS.get(stats);if(!telemetry){telemetry={actions:[],skills:{repel:0,repair:0,thunder:0}};REPORTS.set(stats,telemetry);}
    let strategicLayout=null;

    function record(kind,type,reason){
      const text=(kind==='build'?'建造':kind==='upgrade'?'升级':'施放')+(G.DEFS[type]?.name||G.SKILLS[type].name);
      stats.lastAction=text;if(kind==='build')stats.builds++;else if(kind==='upgrade')stats.upgrades++;else{stats.casts++;telemetry.skills[type]++;}
      telemetry.actions.push({second:s.elapsed,kind,type,reason});if(telemetry.actions.length>240)telemetry.actions.shift();return true;
    }
    function build(type,p,reason){const result=p&&G.build(s,type,p.x,p.y);return !!result?.ok&&record('build',type,reason);}
    const upgradeChoice=b=>b?.type==='barracks'&&b.level===1?{troopType:nextBarracksTroop(s.buildings)}:{};
    function upgrade(b,reason){const result=b&&G.upgrade(s,b,upgradeChoice(b));return !!result?.ok&&record('upgrade',b.type,reason);}
    const count=type=>s.buildings.filter(b=>b.type===type).length;
    const canAfford=cost=>s.coins>=cost.coins&&s.materials>=cost.materials;
    function waitSeconds(cost,rates=G.rates(s)){
      const coin=Math.max(0,cost.coins-s.coins)/(rates.coins||Number.EPSILON);
      const material=Math.max(0,cost.materials-s.materials)/(rates.materials||Number.EPSILON);
      return Math.max(coin,material);
    }
    function available(type){return plots.filter(p=>!G.buildReason(s,type,p.x,p.y,true));}
    function neighbors(p){
      const result=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)result.push({x:p.x+dx,y:p.y+dy});return result;
    }
    function futureEconomyCell(p,excluded=[]){
      const key=p.y*width+p.x,terrain=G.terrain(p.x,p.y,s);
      return plotKeys.has(key)&&!land.roads.has(key)&&!land.gates.some(g=>g.x===p.x&&g.y===p.y)&&!G.at(s,p.x,p.y)&&
        !excluded.some(n=>n.x===p.x&&n.y===p.y)&&terrain!=='water'&&terrain!=='forest'&&terrain!=='mountain';
    }
    function commonFuture(a,b,excluded=[]){return neighbors(a).some(p=>Math.max(Math.abs(p.x-b.x),Math.abs(p.y-b.y))<=1&&futureEconomyCell(p,[a,b,...excluded]));}
    function chainPotential(type,p){
      const d=G.DEFS[type],counterpart=PARTNER[type]&&s.buildings.find(b=>b.type===PARTNER[type]);
      if(d.end)return counterpart&&commonFuture(p,counterpart)?30:neighbors(p).filter(n=>futureEconomyCell(n,[p])).length;
      const next=NEXT[type];if(!next)return 0;
      let best=0;
      for(const middle of neighbors(p).filter(n=>futureEconomyCell(n,[p]))){
        if(G.DEFS[next].end){
          const other=PARTNER[next]&&s.buildings.find(b=>b.type===PARTNER[next]);
          const ends=neighbors(middle).filter(n=>futureEconomyCell(n,[p,middle]));
          best=Math.max(best,...ends.map(end=>other&&commonFuture(end,other,[p,middle])?30:neighbors(end).filter(n=>futureEconomyCell(n,[p,middle,end])).length));
        }else best=Math.max(best,neighbors(middle).filter(n=>futureEconomyCell(n,[p,middle])).length);
      }
      return best;
    }
    const supports=(type,target)=>G.DEFS[target].prev===type||G.DEFS[target].required?.includes(type);
    function placementScore(type,p){
      const d=G.DEFS[type],key=p.y*width+p.x;
      let score=-Math.hypot(p.x-land.center.x,p.y-land.center.y)*.08+(land.roads.has(key)?-8:0);
      score+=neighbors(p).filter(n=>futureEconomyCell(n,[p])).length*.35;
      if(d.cat==='economy'){
        if(count(type)===0||d.tier>0)score+=chainPotential(type,p)*1.5;
        if(d.prev)score+=s.buildings.filter(b=>b.type===d.prev&&Math.max(Math.abs(b.x-p.x),Math.abs(b.y-p.y))<=1).reduce((n,b)=>n+b.level*3,0);
        score+=s.buildings.filter(b=>supports(type,b.type)&&Math.max(Math.abs(b.x-p.x),Math.abs(b.y-p.y))<=1)
          .reduce((total,b)=>total+3+b.level*2+Math.log2(1+G.income(s,b)),0);
      }
      return score;
    }
    function bestPlot(type,filter){
      const choices=available(type).filter(filter||(()=>true));
      return choices.sort((a,b)=>placementScore(type,b)-placementScore(type,a)||a.y-b.y||a.x-b.x)[0];
    }
    function buildPlan(type,p,reason){return p&&{type,cost:G.buildCost(s,type),reason,run:()=>build(type,p,reason)};}
    function upgradePlan(b,reason){return b&&{type:b.type,cost:G.upgradeCost(b),reason,run:()=>upgrade(b,reason)};}
    function perform(plan,saveLimit=0,forceSave=false){
      if(!plan)return null;
      if(canAfford(plan.cost))return plan.run()?'acted':null;
      const wait=waitSeconds(plan.cost);
      if(Number.isFinite(wait)&&(forceSave||wait<=saveLimit)){stats.lastAction=`储备资源 · ${plan.reason}`;return 'saving';}
      return null;
    }
    function foundationTarget(b){
      if(!b)return null;const reason=G.upgradeReason(s,b,true);
      if(reason.startsWith('需祠堂'))return foundationTarget(s.buildings.find(n=>n.type==='shrine'));
      if(reason.startsWith('需城门'))return foundationTarget(s.buildings.find(n=>n.type==='gate'));
      return reason?null:b;
    }
    function resourceIncome(buildings,resource){
      return buildings.reduce((total,b)=>G.DEFS[b.type].resource===resource?total+G.income(s,b,buildings):total,0);
    }
    function buildIncomeGain(d,p){
      const next={...p,id:-1,type:d.id,level:1,owner:s.actorId};
      return resourceIncome([...s.buildings,next],d.resource)-resourceIncome(s.buildings,d.resource);
    }
    function upgradeIncomeGain(b){
      const d=G.DEFS[b.type],buildings=s.buildings.map(n=>n===b?{...n,level:n.level+1}:n);
      return resourceIncome(buildings,d.resource)-resourceIncome(s.buildings,d.resource);
    }
    function chainTypes(type,result=new Set()){
      if(result.has(type))return result;result.add(type);
      const d=G.DEFS[type];if(d.prev)chainTypes(d.prev,result);for(const required of d.required||[])chainTypes(required,result);
      return result;
    }
    const cellKey=p=>p.y*width+p.x;
    function terrainFits(type,p){
      const terrain=G.terrain(p.x,p.y,s),d=G.DEFS[type];
      if(terrain==='water')return false;
      if(terrain==='forest')return type==='mulberry';
      if(terrain==='mountain')return type==='quarry';
      if(type==='farm')return terrain==='shore';
      return !d.terrain||terrain===d.terrain;
    }
    function layoutCell(type,p,used=new Set()){
      const key=cellKey(p);if(used.has(key)||!plotKeys.has(key))return false;
      const existing=G.at(s,p.x,p.y);if(existing)return existing.type===type;
      const d=G.DEFS[type];
      return !land.roads.has(key)&&!land.gates.some(g=>g.x===p.x&&g.y===p.y)&&terrainFits(type,p)&&(!d.limit||count(type)<d.limit);
    }
    function pathOptions(endType,site,reserved){
      const middleType=G.DEFS[endType].prev,startType=G.DEFS[middleType].prev,result=[];
      for(const end of neighbors(site).filter(p=>layoutCell(endType,p,reserved))){
        const endUsed=new Set([...reserved,cellKey(end)]);
        for(const middle of neighbors(end).filter(p=>layoutCell(middleType,p,endUsed))){
          const middleUsed=new Set([...endUsed,cellKey(middle)]);
          for(const start of neighbors(middle).filter(p=>layoutCell(startType,p,middleUsed))){
            const steps=[{type:startType,...start},{type:middleType,...middle},{type:endType,...end}];
            const reuse=steps.reduce((total,step)=>total+(G.at(s,step.x,step.y)?.type===step.type?24:0),0);
            const supply=neighbors(middle).filter(p=>layoutCell(startType,p,new Set([cellKey(middle),cellKey(end),cellKey(site)]))).length;
            result.push({steps,score:reuse+supply*2-Math.hypot(start.x-site.x,start.y-site.y)});
          }
        }
      }
      return result.sort((a,b)=>b.score-a.score);
    }
    function findUltimateLayout(goal){
      let best=null;
      for(const site of plots.filter(p=>layoutCell(goal.id,p))){
        const siteKey=cellKey(site),first=pathOptions(goal.required[0],site,new Set([siteKey])).slice(0,16);
        for(const a of first){
          const used=new Set([siteKey,...a.steps.map(cellKey)]);
          for(const b of pathOptions(goal.required[1],site,used).slice(0,16)){
            const score=a.score+b.score-Math.hypot(site.x-land.center.x,site.y-land.center.y)*.1;
            if(!best||score>best.score)best={goal:goal.id,site,paths:[a.steps,b.steps],score};
          }
        }
      }
      return best;
    }
    function validLayout(layout){
      if(!layout)return false;const used=new Set();
      for(const step of [{type:layout.goal,...layout.site},...layout.paths.flat()]){
        if(!layoutCell(step.type,step,used))return false;used.add(cellKey(step));
      }
      return true;
    }
    function selectUltimate(){
      const remaining=ULTIMATES.filter(d=>!count(d.id));if(!remaining.length)return null;
      const rates=G.rates(s),progress=d=>[...chainTypes(d.id)].filter(type=>count(type)).length;
      remaining.sort((a,b)=>progress(b)-progress(a)||
        (a.resource==='coins'?rates.coins-rates.materials:rates.materials-rates.coins)-
        (b.resource==='coins'?rates.coins-rates.materials:rates.materials-rates.coins)||a.id.localeCompare(b.id));
      return remaining[0];
    }
    function ultimatePlan(){
      let goal=ULTIMATES.find(d=>d.id===stats.ultimateGoal&&!count(d.id));
      if(!goal){goal=selectUltimate();stats.ultimateGoal=goal?.id||null;strategicLayout=null;}
      if(!goal)return null;
      let reason=`筹建${goal.name}`;
      const finalPlot=bestPlot(goal.id);if(finalPlot)return buildPlan(goal.id,finalPlot,reason);
      if(strategicLayout?.goal!==goal.id||!validLayout(strategicLayout))strategicLayout=findUltimateLayout(goal);
      if(!strategicLayout){
        for(const alternative of ULTIMATES.filter(d=>d.id!==goal.id&&!count(d.id))){
          const layout=findUltimateLayout(alternative);if(!layout)continue;
          goal=alternative;stats.ultimateGoal=goal.id;strategicLayout=layout;break;
        }
      }
      if(!strategicLayout)return null;
      reason=`筹建${goal.name}`;
      for(const path of strategicLayout.paths)for(const step of path){
        const existing=G.at(s,step.x,step.y);if(existing?.type===step.type)continue;
        if(!G.buildReason(s,step.type,step.x,step.y,true))return buildPlan(step.type,step,reason);
      }
      if(!G.buildReason(s,goal.id,strategicLayout.site.x,strategicLayout.site.y,true))return buildPlan(goal.id,strategicLayout.site,reason);
      return null;
    }

    function opening(){
      const firstFarm=count('farm')===0&&bestPlot('farm');
      if(firstFarm)return perform(buildPlan('farm',firstFarm,'建立工材来源'),0,true);
      const firstMulberry=count('mulberry')===0&&bestPlot('mulberry');
      if(firstMulberry)return perform(buildPlan('mulberry',firstMulberry,'建立铜钱来源'),0,true);
      const rates=G.rates(s),plans=[];
      for(const type of ['farm','mulberry'])if(count(type)<4){
        const p=bestPlot(type);if(p)plans.push(buildPlan(type,p,type==='farm'?'扩充基础工材':'扩充基础铜钱'));
      }
      if(!plans.length)return null;
      const affordable=plans.filter(plan=>canAfford(plan.cost));
      const selected=(affordable.length?affordable:plans).sort((a,b)=>{
        const ar=a.reason.includes('工材')?rates.materials:rates.coins,br=b.reason.includes('工材')?rates.materials:rates.coins;
        return ar-br||waitSeconds(a.cost,rates)-waitSeconds(b.cost,rates);
      })[0];
      return perform(selected,0,true);
    }

    function gateTowerPlot(gate){
      return bestPlot('tower',p=>coversGate(p,gate))||bestPlot('tower',p=>Math.hypot(p.x-gate.x,p.y-gate.y)<=5);
    }
    function primaryGate(){
      const enemies=G.hostileUnits(s);
      return [...land.gates].sort((a,b)=>{
        const da=enemies.length?Math.min(...enemies.map(u=>Math.hypot(u.x-a.x,u.y-a.y))):Math.hypot(a.x-land.center.x,a.y-land.center.y);
        const db=enemies.length?Math.min(...enemies.map(u=>Math.hypot(u.x-b.x,u.y-b.y))):Math.hypot(b.x-land.center.x,b.y-land.center.y);
        return da-db;
      })[0];
    }
    function firstArmy(){
      if(!count('barracks')){
        const gate=primaryGate(),p=bestPlot('barracks',n=>Math.hypot(n.x-gate.x,n.y-gate.y)<=6)||bestPlot('barracks');
        return perform(buildPlan('barracks',p,'组建首支守军'),0,true);
      }
      if(!count('tower')){
        const gate=primaryGate();return perform(buildPlan('tower',gateTowerPlot(gate),'建立城门基础防线'),0,true);
      }
      return null;
    }

    function skills(){
      const id=s.selectedSkill;if(!id||G.skillReason(s,id))return false;
      const enemies=G.hostileUnits(s).filter(u=>G.inSkillZone(s,s.actorId,u));
      const damaged=s.buildings.some(b=>b.hp/G.maxHP(b)<.65);
      const urgent=enemies.some(u=>Math.hypot(u.x-land.center.x,u.y-land.center.y)<5||land.gates.some(g=>Math.hypot(u.x-g.x,u.y-g.y)<4));
      const wanted=id==='repair'?damaged:enemies.length>=2||urgent;
      return wanted&&G.skill(s,id).ok&&record('skill',id,id==='repair'?'修复受损建筑':'压制入侵部队');
    }
    function defense(){
      const enemies=G.hostileUnits(s),threats=[];
      for(const gate of land.gates){
        const nearby=enemies.filter(u=>Math.hypot(u.x-gate.x,u.y-gate.y)<=9);
        if(nearby.length)threats.push({gate,nearby,closest:Math.min(...nearby.map(u=>Math.hypot(u.x-gate.x,u.y-gate.y)))});
      }
      threats.sort((a,b)=>a.closest-b.closest||b.nearby.length-a.nearby.length);
      for(const threat of threats){
        const {gate,nearby,closest}=threat,towers=s.buildings.filter(b=>b.type==='tower'&&coversGate(b,gate)).sort((a,b)=>a.level-b.level),gateBuilding=G.at(s,gate.x,gate.y);
        if(!towers.length){
          const result=perform(buildPlan('tower',gateTowerPlot(gate),'敌军逼近，补建箭塔'),4,closest<=5);if(result)return result;
        }
        const strength=towers.reduce((sum,b)=>sum+b.level,0);
        if(towers.length&&nearby.length>strength*2){
          const target=towers.find(b=>!G.upgradeReason(s,b,true));
          const result=perform(upgradePlan(target,'敌军集结，强化箭塔'),5,closest<=4);if(result)return result;
          if(towers.length<2){const result2=perform(buildPlan('tower',gateTowerPlot(gate),'敌军集结，增设箭塔'),5,closest<=4);if(result2)return result2;}
        }
        if(gateBuilding&&gateBuilding.hp/G.maxHP(gateBuilding)<.6){
          const target=foundationTarget(gateBuilding),result=perform(upgradePlan(target,'城门受损，提升耐久'),4,closest<=3);if(result)return result;
        }
      }
      return null;
    }

    function economyPlan(){
      const rates=G.rates(s),options=[],resourceWeight=resource=>{
        const own=Math.max(.5,rates[resource]),other=Math.max(.5,rates[resource==='coins'?'materials':'coins']);
        return Math.max(.7,Math.min(2.2,other/own));
      };
      function score(gain,cost,d,multiplier=1){
        const productionSeconds=cost.coins/Math.max(1,rates.coins)+cost.materials/Math.max(1,rates.materials);
        return gain*resourceWeight(d.resource)*multiplier/Math.max(1,productionSeconds);
      }
      const reserved=strategicLayout&&stats.ultimateGoal===strategicLayout.goal?chainTypes(strategicLayout.goal):new Set();
      for(const d of Object.values(G.DEFS).filter(d=>d.cat==='economy')){
        if(reserved.has(d.id)&&d.tier!==0)continue;
        const p=bestPlot(d.id);if(!p)continue;
        const gain=buildIncomeGain(d,p),cost=G.buildCost(s,d.id),first=count(d.id)===0;
        let multiplier=first?1.8:1;
        if(d.tier===0&&((d.id==='farm'||d.id==='mulberry')?count(d.id)<6:count(d.id)<2))multiplier*=1.25;
        if(d.tier===1)multiplier*=1.3;if(d.end)multiplier*=1.5;if(d.required)multiplier*=2;
        options.push({score:score(gain,cost,d,multiplier),cost,reason:`发展${d.name}产业`,run:()=>build(d.id,p,`发展${d.name}产业`)});
      }
      for(const b of s.buildings.filter(b=>G.DEFS[b.type].income&&b.type!=='shrine')){
        if(b.level>=G.maxLevel(b)||G.upgradeReason(s,b,true))continue;
        const d=G.DEFS[b.type],gain=upgradeIncomeGain(b),cost=G.upgradeCost(b);
        options.push({score:score(gain,cost,d,b.level===1?1.18:1),cost,reason:`提升${d.name}产能`,run:()=>upgrade(b,`提升${d.name}产能`)});
      }
      if(!options.length)return null;
      options.sort((a,b)=>b.score-a.score);
      const best=options[0],affordable=options.find(option=>canAfford(option.cost));
      return waitSeconds(best.cost,rates)<=9?best:(affordable||best);
    }
    function diversificationPlan(){
      const rates=G.rates(s),plans=Object.values(G.DEFS).filter(d=>d.cat==='economy'&&d.tier===1&&!count(d.id))
        .map(d=>({definition:d,plot:bestPlot(d.id)})).filter(option=>option.plot)
        .map(option=>buildPlan(option.definition.id,option.plot,`完善${option.definition.chain}产业链`));
      return plans.sort((a,b)=>waitSeconds(a.cost,rates)-waitSeconds(b.cost,rates))[0]||null;
    }
    function basicSupplyPlan(){
      const rates=G.rates(s),plans=['farm','mulberry','tea','quarry'].filter(type=>count(type)<(type==='farm'||type==='mulberry'?G.DEFS[type].limit:2))
        .map(type=>({type,plot:bestPlot(type)})).filter(option=>option.plot)
        .map(option=>buildPlan(option.type,option.plot,G.DEFS[option.type].resource==='materials'?'扩充前置工材建筑':'扩充前置铜钱建筑'));
      return plans.sort((a,b)=>{
        const ar=G.DEFS[a.type].resource==='materials'?rates.materials:rates.coins,br=G.DEFS[b.type].resource==='materials'?rates.materials:rates.coins;
        return ar-br||waitSeconds(a.cost,rates)-waitSeconds(b.cost,rates);
      })[0]||null;
    }

    function militaryPlan(){
      const rates=G.rates(s),minimum=Math.min(rates.coins,rates.materials),barracks=s.buildings.filter(b=>b.type==='barracks').sort((a,b)=>a.level-b.level||a.id-b.id);
      const desiredBarracks=1+(minimum>=8?1:0)+(minimum>=16?1:0);
      if(barracks.length<desiredBarracks){
        const gate=primaryGate(),p=bestPlot('barracks',n=>Math.hypot(n.x-gate.x,n.y-gate.y)<=7)||bestPlot('barracks');
        if(p)return buildPlan('barracks',p,'扩大常备军规模');
      }
      const desiredBarracksLevel=desiredMilitaryLevel(minimum);
      // Train the army up to the already unlocked tier before saving for expensive foundations.
      const training=barracks.find(b=>b.level<Math.min(desiredBarracksLevel,G.unlockedBuildingLevel(s))&&!G.upgradeReason(s,b,true,upgradeChoice(b)));
      if(training)return upgradePlan(training,'提升士兵训练质量');
      const shrine=s.buildings.find(b=>b.type==='shrine'),desiredShrine=Math.max(Math.min(5,1+Math.floor(minimum/7)),G.requiredShrineLevel(desiredBarracksLevel));
      if(shrine&&shrine.level<desiredShrine){
        const target=foundationTarget(shrine);if(target)return upgradePlan(target,target.type==='shrine'?'升级主城，强化全军':'同步强化城门');
      }
      const desiredTowerLevel=1+(minimum>=12?1:0),tower=s.buildings.filter(b=>b.type==='tower').sort((a,b)=>a.level-b.level)[0];
      if(tower&&tower.level<desiredTowerLevel&&!G.upgradeReason(s,tower,true))return upgradePlan(tower,'巩固常备防线');
      return null;
    }

    function tick(dt){
      if(s.over||s.eliminated||!Number.isFinite(dt)||dt<=0)return false;
      stats.activeSeconds+=dt;stats.clock+=dt;if(stats.clock<1-1e-8)return false;stats.clock=Math.max(0,stats.clock-1);stats.decisions++;
      const cast=skills(),danger=defense();if(danger)return danger==='acted'||cast;
      const start=opening();if(start)return start==='acted'||cast;
      const armyStart=firstArmy();if(armyStart)return armyStart==='acted'||cast;
      const supply=basicSupplyPlan(),supplyResult=perform(supply,9);
      if(supplyResult){if(supplyResult==='acted')stats.armyTurn=true;return supplyResult==='acted'||cast;}
      const strategic=ultimatePlan(),strategicDef=G.DEFS[strategic?.type],strategicRates=G.rates(s),strategicBase=Math.min(strategicRates.coins,strategicRates.materials);
      const strategicWait=strategicDef?.required?(strategicBase>=100?45:12):strategicDef?.end?(strategicBase>=85?70:12):strategicDef?.tier===1?(strategicBase>=15?12:4):strategicBase>=10?9:4;
      if(stats.armyTurn){
        const plan=militaryPlan(),result=perform(plan,7);if(result){if(result==='acted')stats.armyTurn=false;return result==='acted'||cast;}
      }
      const strategicResult=perform(strategic,strategicWait);
      if(strategicResult){if(strategicResult==='acted')stats.armyTurn=true;return strategicResult==='acted'||cast;}
      const diversification=diversificationPlan(),diversificationResult=perform(diversification,12);
      if(diversificationResult){if(diversificationResult==='acted')stats.armyTurn=true;return diversificationResult==='acted'||cast;}
      const economy=economyPlan(),economicResult=perform(economy,9);
      if(economicResult){if(economicResult==='acted')stats.armyTurn=true;return economicResult==='acted'||cast;}
      const military=militaryPlan(),militaryResult=perform(military,0,true);
      if(militaryResult==='acted')stats.armyTurn=false;
      return militaryResult==='acted'||cast;
    }
    const report=()=>({schema:3,controller:'balanced-estate-v2',...stats,skills:{...telemetry.skills},actions:telemetry.actions.map(a=>({...a})),mapSeed:s.mapSeed,owner:s.actorId,over:s.over,eliminated:s.eliminated,rates:G.rates(s)});
    return {tick,report,get lastAction(){return stats.lastAction;}};
  }
  G.setControllerFactory(create);
  return {create,coversGate,desiredMilitaryLevel,nextBarracksTroop};
});
