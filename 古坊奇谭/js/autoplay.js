/* Balanced economy and military controller for computer estates and player autoplay. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./game'):root.GF);if(typeof module==='object'&&module.exports)module.exports=api;else root.GFAutoplay=api;})(typeof globalThis!=='undefined'?globalThis:this,function(G){
  'use strict';
  const coversGate=(p,g)=>Math.hypot(p.x-g.x,p.y-g.y)<=3.5;
  const NEXT={tea:'inn',inn:'bank',farm:'mill',mill:'wine',mulberry:'weaver',weaver:'tailor',quarry:'kiln',kiln:'trade'};
  const PARTNER={bank:'tailor',tailor:'bank',wine:'trade',trade:'wine'};
  const REPORTS=new WeakMap();

  function create(state){
    const s=state.actorId===undefined&&state.players?G.playerView(state,0):state;
    const land=G.estate(s),width=G.worldWidth(s),stats=s.ai||(s.ai={});
    const defaults={clock:0,armyTurn:true,activeSeconds:0,decisions:0,builds:0,upgrades:0,casts:0,lastAction:'准备经营'};
    for(const [key,value] of Object.entries(defaults))if(stats[key]===undefined)stats[key]=value;
    const plots=[...land.cells].map(k=>({x:k%width,y:Math.floor(k/width)})).filter(p=>G.terrain(p.x,p.y,s)!=='water');
    const plotKeys=new Set(plots.map(p=>p.y*width+p.x));
    let telemetry=REPORTS.get(stats);if(!telemetry){telemetry={actions:[],skills:{repel:0,repair:0,thunder:0}};REPORTS.set(stats,telemetry);}

    function record(kind,type,reason){
      const text=(kind==='build'?'建造':kind==='upgrade'?'升级':'施放')+(G.DEFS[type]?.name||G.SKILLS[type].name);
      stats.lastAction=text;if(kind==='build')stats.builds++;else if(kind==='upgrade')stats.upgrades++;else{stats.casts++;telemetry.skills[type]++;}
      telemetry.actions.push({second:s.elapsed,kind,type,reason});if(telemetry.actions.length>240)telemetry.actions.shift();return true;
    }
    function build(type,p,reason){const result=p&&G.build(s,type,p.x,p.y);return !!result?.ok&&record('build',type,reason);}
    function upgrade(b,reason){const result=b&&G.upgrade(s,b);return !!result?.ok&&record('upgrade',b.type,reason);}
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
    function placementScore(type,p){
      const d=G.DEFS[type],key=p.y*width+p.x;
      let score=-Math.hypot(p.x-land.center.x,p.y-land.center.y)*.08+(land.roads.has(key)?-8:0);
      score+=neighbors(p).filter(n=>futureEconomyCell(n,[p])).length*.35;
      if(d.cat==='economy'){
        if(count(type)===0||d.tier>0)score+=chainPotential(type,p)*1.5;
        if(d.prev)score+=s.buildings.filter(b=>b.type===d.prev&&Math.max(Math.abs(b.x-p.x),Math.abs(b.y-p.y))<=1).reduce((n,b)=>n+b.level*2,0);
      }
      return score;
    }
    function bestPlot(type,filter){
      const choices=available(type).filter(filter||(()=>true));
      return choices.sort((a,b)=>placementScore(type,b)-placementScore(type,a)||a.y-b.y||a.x-b.x)[0];
    }
    function buildPlan(type,p,reason){return p&&{cost:G.buildCost(s,type),reason,run:()=>build(type,p,reason)};}
    function upgradePlan(b,reason){return b&&{cost:G.upgradeCost(b),reason,run:()=>upgrade(b,reason)};}
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
      for(const d of Object.values(G.DEFS).filter(d=>d.cat==='economy')){
        const p=bestPlot(d.id);if(!p)continue;
        const hypothetical={...p,type:d.id,level:1,owner:s.actorId},gain=G.income(s,hypothetical),cost=G.buildCost(s,d.id),first=count(d.id)===0;
        let multiplier=first?1.25:1;
        if(d.tier===0&&((d.id==='farm'||d.id==='mulberry')?count(d.id)<6:count(d.id)<2))multiplier*=1.25;
        if(d.tier===1)multiplier*=1.15;if(d.end)multiplier*=1.35;if(d.required)multiplier*=1.5;
        options.push({score:score(gain,cost,d,multiplier),cost,reason:`发展${d.name}产业`,run:()=>build(d.id,p,`发展${d.name}产业`)});
      }
      for(const b of s.buildings.filter(b=>G.DEFS[b.type].income&&b.type!=='shrine')){
        if(b.level>=G.maxLevel(b)||G.upgradeReason(s,b,true))continue;
        const d=G.DEFS[b.type],next={...b,level:b.level+1},gain=G.income(s,next)-G.income(s,b),cost=G.upgradeCost(b);
        options.push({score:score(gain,cost,d,b.level===1?1.18:1),cost,reason:`提升${d.name}产能`,run:()=>upgrade(b,`提升${d.name}产能`)});
      }
      if(!options.length)return null;
      options.sort((a,b)=>b.score-a.score);
      const best=options[0],affordable=options.find(option=>canAfford(option.cost));
      return waitSeconds(best.cost,rates)<=9?best:(affordable||best);
    }

    function militaryPlan(){
      const rates=G.rates(s),minimum=Math.min(rates.coins,rates.materials),barracks=s.buildings.filter(b=>b.type==='barracks').sort((a,b)=>a.level-b.level||a.id-b.id);
      const desiredBarracks=1+(minimum>=8?1:0)+(minimum>=16?1:0);
      if(barracks.length<desiredBarracks){
        const gate=primaryGate(),p=bestPlot('barracks',n=>Math.hypot(n.x-gate.x,n.y-gate.y)<=7)||bestPlot('barracks');
        if(p)return buildPlan('barracks',p,'扩大常备军规模');
      }
      const shrine=s.buildings.find(b=>b.type==='shrine'),desiredShrine=Math.min(5,1+Math.floor(minimum/7));
      if(shrine&&shrine.level<desiredShrine){
        const target=foundationTarget(shrine);if(target)return upgradePlan(target,target.type==='shrine'?'升级主城，强化全军':'同步强化城门');
      }
      const desiredBarracksLevel=1+(minimum>=10?1:0)+(minimum>=18?1:0),training=barracks.find(b=>b.level<desiredBarracksLevel&&!G.upgradeReason(s,b,true));
      if(training)return upgradePlan(training,'提升士兵训练质量');
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
      if(stats.armyTurn){
        const plan=militaryPlan(),result=perform(plan,7);if(result){if(result==='acted')stats.armyTurn=false;return result==='acted'||cast;}
      }
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
  return {create,coversGate};
});
