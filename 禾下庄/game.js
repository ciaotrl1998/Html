/* Shared simulation is DOM-independent so logistics can be tested deterministically. */
(function (root) {
  'use strict';
  const TYPES = {
    home:{name:'里正宅',group:'基础',size:2,cost:[0,0],upgrade:[120,12],color:'#ae5b43'},
    wood:{name:'伐木场',group:'基础',size:2,cost:[35,0],upgrade:[30,3],color:'#907653'},
    stone:{name:'采石场',group:'基础',size:2,cost:[35,0],upgrade:[30,3],color:'#929c93'},
    workshop:{name:'工坊',group:'基础',size:2,cost:[45,0],upgrade:[40,4],color:'#6e8982'},
    farm:{name:'农田',group:'种养',size:2,cost:[30,0],upgrade:[25,2],color:'#728e43'},
    chicken:{name:'养鸡棚',group:'种养',size:2,cost:[10,4],upgrade:[45,4],requires:['stone'],color:'#c09a55'},
    duck:{name:'养鸭棚',group:'种养',size:2,cost:[10,5],upgrade:[50,5],requires:['wood'],color:'#699ca0'},
    rabbit:{name:'兔棚',group:'种养',size:2,cost:[10,4],upgrade:[45,4],requires:['workshop'],color:'#b79b92'},
    compost:{name:'堆肥厂',group:'加工',size:2,cost:[0,5],upgrade:[35,3],requires:['chicken','duck','rabbit'],color:'#8a8754'},
    pickle:{name:'腌制厂',group:'加工',size:2,cost:[0,7],upgrade:[50,5],requires:['chicken','duck'],color:'#b77561'},
    textile:{name:'纺织厂',group:'加工',size:2,cost:[0,9],upgrade:[60,6],requires:['duck','rabbit'],color:'#8c819f'},
    dye:{name:'织染坊',group:'加工',size:2,cost:[0,12],upgrade:[80,8],requires:['textile'],color:'#567b9d'},
    market:{name:'集市',group:'',size:2,cost:[0,0],upgrade:null,color:'#b65946'},
    pile:{name:'临时料堆',group:'',size:1,cost:[0,0],upgrade:null,color:'#8a8754'}
  };
  const GOODS = {
    wood:{name:'木头',price:3,color:'#a87645',shape:'log'},stone:{name:'石头',price:4,color:'#9aa5a5',shape:'stone'},
    grain:{name:'谷物',price:3,color:'#e2bf5b',shape:'grain'},egg:{name:'鸡蛋',price:7,color:'#f3eee2',shape:'egg'},
    duckegg:{name:'鸭蛋',price:6,color:'#c4ded2',shape:'egg'},dung:{name:'粪便',price:1,color:'#876448',shape:'stone'},
    feather:{name:'鸭毛',price:6,color:'#e8f3df',shape:'feather'},fur:{name:'兔毛',price:7,color:'#d4bdc5',shape:'feather'},
    fertilizer:{name:'肥料',price:4,color:'#53794a',shape:'bag'},century:{name:'皮蛋',price:20,color:'#626b52',shape:'egg'},
    salted:{name:'咸鸭蛋',price:17,color:'#e5e3c8',shape:'egg'},down:{name:'羽绒',price:18,color:'#e9f5e7',shape:'bag'},
    plush:{name:'毛绒',price:20,color:'#dabbd0',shape:'bag'},coat:{name:'冬衣',price:55,color:'#5c8c9e',shape:'coat'}
  };
  const sum = obj => Object.values(obj).reduce((a,b)=>a+b,0);
  const dist = (a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  function stats(b) {
    const l=b.level, i=l-1, n=l;
    const inCap=[4,6,8,10,12][i], outCap=[6,9,12,15,18][i];
    if(b.type==='home')return {income:1+i*.2,input:0,output:0,cycle:0,recipes:[]};
    if(b.type==='market'||b.type==='pile')return {input:0,output:999,cycle:0,recipes:[]};
    if(b.type==='wood'||b.type==='stone')return {input:0,output:outCap,cycle:(b.type==='wood'?8:10)-i,recipes:[{inputs:[],amount:0,out:{[b.type]:n}}]};
    if(b.type==='workshop')return {input:inCap,output:0,cycle:8-i,recipes:[{inputs:['wood','stone'],amount:2*n,out:{},materials:n}]};
    if(b.type==='farm')return {input:inCap,output:outCap,cycle:[8,8,7,7,6][i],recipes:[{inputs:[],amount:0,out:{grain:n}}],optional:['fertilizer']};
    if(['chicken','duck','rabbit'].includes(b.type)) {
      const outputs={chicken:{egg:n,dung:n},duck:{duckegg:n,feather:n,dung:n},rabbit:{fur:n,dung:n}};
      return {input:inCap,output:outCap,cycle:{chicken:10,duck:14,rabbit:12}[b.type],recipes:[{inputs:['grain'],amount:n*(b.type==='duck'?2:1),out:outputs[b.type]}]};
    }
    const pairs={compost:[['dung','fertilizer']],pickle:[['egg','century'],['duckegg','salted']],textile:[['feather','down'],['fur','plush']],dye:[['down','coat'],['plush','coat']]}[b.type];
    return {input:inCap,output:outCap,cycle:({compost:8,pickle:10,textile:10,dye:12}[b.type])-i,recipes:pairs.map(([a,z])=>({inputs:[a],amount:2*n,out:{[z]:n}}))};
  }
  class Game {
    constructor(data) {
      this.cols=14;this.rows=15;this.gold=320;this.materials=0;this.elapsed=0;this.rentTime=60;this.round=1;this.rent=180;
      this.landPrice=4200;this.grace=null;this.firstDebt=false;this.won=false;this.failed=false;this.carryLevel=1;this.speedLevel=1;
      this.nextId=1;this.buildings=[];this.workers=[];this.logs=[];this.unlocked=['home','wood','stone','workshop','farm'];this.sales=0;this.feedback=[];this.events=[];this.homeClock=0;this.speed=1.6;
      if(data){Object.assign(this,data);this.rentTime=Math.min(this.rentTime,60);}
      else {this.addBuilding('home',6,2);this.addBuilding('market',1,12);this.hire(true);this.hire(true);this.log('来到青溪庄田，里正宅开始收取杂项收入');}
    }
    log(text){this.logs.unshift({time:this.elapsed,text});this.logs=this.logs.slice(0,60);}
    serialize(){const {feedback,events,...state}=this;return JSON.parse(JSON.stringify(state));}
    building(id){return this.buildings.find(b=>b.id===id);}
    addBuilding(type,x,y){const b={id:this.nextId++,type,x,y,level:1,input:{},output:{},batch:null,progress:0,lastRecipe:-1};this.buildings.push(b);this.unlock();return b;}
    unlock(){for(const [type,d] of Object.entries(TYPES))if(d.requires?.some(r=>this.buildings.some(b=>b.type===r))&&!this.unlocked.includes(type))this.unlocked.push(type);}
    hire(free=false){const cost=45+Math.max(0,this.workers.length-2)*15;if(!free&&this.gold<cost)return false;if(this.workers.length>=24)return false;if(!free)this.gold-=cost;this.workers.push({id:this.nextId++,x:6,y:5,assigned:null,task:null,route:[],producing:false});if(!free){this.autoAssign();this.log('雇佣了一名村民');}return true;}
    blocked(x,y,ignore){const ok=id=>Array.isArray(ignore)?ignore.includes(id):id===ignore;return x<1||y<1||x>=this.cols-1||y>=this.rows-1||this.buildings.some(b=>!ok(b.id)&&b.type!=='pile'&&x>=b.x&&y>=b.y&&x<b.x+TYPES[b.type].size&&y<b.y+TYPES[b.type].size);}
    buildingAt(x,y){return this.buildings.find(b=>b.type!=='pile'&&Math.floor(x)>=b.x&&Math.floor(x)<b.x+TYPES[b.type].size&&Math.floor(y)>=b.y&&Math.floor(y)<b.y+TYPES[b.type].size)||null;}
    spots(b){const s=TYPES[b.type].size,a=[];if(b.type==='pile')a.push({x:b.x,y:b.y});for(let k=0;k<s;k++)a.push({x:b.x+k,y:b.y-1},{x:b.x+k,y:b.y+s},{x:b.x-1,y:b.y+k},{x:b.x+s,y:b.y+k});return a.filter(p=>!this.blocked(p.x,p.y));}
    workSpot(b){const s=TYPES[b.type].size;return {x:b.x+s/2-.5,y:b.y+s/2-.5};}
    atWork(w,b){const p=this.workSpot(b);return Math.hypot(w.x-p.x,w.y-p.y)<.5;}
    blockedPoint(x,y,ignore){for(const dx of [-.22,.22])for(const dy of [-.22,.22])if(this.blocked(Math.floor(x+dx),Math.floor(y+dy),ignore))return true;return false;}
    clearLine(x0,y0,x1,y1,ignore){const d=Math.hypot(x1-x0,y1-y0),steps=Math.max(1,Math.ceil(d*3));for(let s=0;s<=steps;s++){const t=s/steps,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;if(this.blockedPoint(x,y,ignore))return false;}return true;}
    simplify(start,pts,ignore){const out=[];let cx=start.x,cy=start.y,i=0;while(i<pts.length){let j=pts.length-1;for(;j>i;j--)if(this.clearLine(cx,cy,pts[j].x,pts[j].y,ignore))break;out.push(pts[j]);cx=pts[j].x;cy=pts[j].y;i=j+1;}return out;}
    routeTo(w,b){const src=this.buildingAt(w.x,w.y),ignore=[src&&src.id,(b.type==='market'||b.type==='pile')?null:b.id].filter(v=>v!=null);const path=this.path(w,this.spots(b),ignore.length?ignore:null);if(path===null)return null;const route=this.simplify(w,path,ignore);if(b.type!=='market'&&b.type!=='pile')route.push(this.workSpot(b));w.ignore=ignore.length?ignore:null;return route;}
    path(start,targets,ignore){
      if(ignore===undefined){const bb=this.buildingAt(start.x,start.y);ignore=bb?bb.id:null;}
      const sx=Math.floor(start.x),sy=Math.floor(start.y),keys=new Set(targets.map(p=>Math.floor(p.x)+','+Math.floor(p.y))),q=[{x:sx,y:sy}],seen=new Map([[sx+','+sy,null]]);let end;
      for(let h=0;h<q.length;h++){const p=q[h];if(keys.has(p.x+','+p.y)){end=p;break;}for(const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0]]){const x=p.x+dx,y=p.y+dy,k=x+','+y;if(!seen.has(k)&&!this.blocked(x,y,ignore)){seen.set(k,p);q.push({x,y});}}}
      if(!end)return null;const a=[];while(end&&(end.x!==sx||end.y!==sy)){a.unshift({x:end.x+.5,y:end.y+.5});end=seen.get(end.x+','+end.y);}return a;
    }
    canPlace(type,x,y,ignore){
      const s=TYPES[type].size;if(x<1||y<1||x+s>this.cols-1||y+s>this.rows-1)return false;
      if(this.buildings.some(b=>b.id!==ignore&&x<b.x+TYPES[b.type].size&&x+s>b.x&&y<b.y+TYPES[b.type].size&&y+s>b.y))return false;
      if(this.workers.some(w=>w.x>=x-.35&&w.x<x+s-.35&&w.y>=y-.35&&w.y<y+s-.35))return false;
      const old=this.buildings,probe={id:-1,type,x,y,level:1};this.buildings=old.filter(b=>b.id!==ignore).concat(probe);
      const origin=this.spots(this.buildings.find(b=>b.type==='market'))[0];
      const valid=!!origin&&this.buildings.every(b=>this.path(origin,this.spots(b))!==null)
        &&this.workers.every(w=>this.path(w,this.spots(this.buildings.find(b=>b.id===w.assigned)||this.buildings.find(b=>b.type==='market')))!==null);
      this.buildings=old;return valid;
    }
    build(type,x,y){const d=TYPES[type];if(!this.unlocked.includes(type)||this.gold<d.cost[0]||this.materials<d.cost[1]||!this.canPlace(type,x,y))return null;this.gold-=d.cost[0];this.materials-=d.cost[1];const b=this.addBuilding(type,x,y);for(const w of this.workers)w.route=[];this.assign(b,1);this.log('建造'+d.name);return b;}
    upgrade(b){if(!TYPES[b.type].upgrade||b.level>=5)return false;const [g,m]=TYPES[b.type].upgrade.map(n=>n*2**(b.level-1));if(this.gold<g||this.materials<m)return false;this.gold-=g;this.materials-=m;b.level++;this.log(TYPES[b.type].name+'升至'+b.level+'级');return true;}
    upgradeWorkers(key){const l=this[key];if(l>=5||this.gold<60*2**(l-1)||this.materials<6*2**(l-1))return false;this.gold-=60*2**(l-1);this.materials-=6*2**(l-1);this[key]++;this.log(key==='carryLevel'?'全体村民载重提升':'全体村民移速提升');return true;}
    assign(b,delta){if(delta>0){const w=this.workers.find(w=>!w.assigned&&!w.task);if(!w)return false;w.assigned=b.id;w.route=[];return true;}const w=this.workers.filter(w=>w.assigned===b.id).sort((a,z)=>Number(a.producing)-Number(z.producing))[0];if(!w)return false;w.assigned=null;w.producing=false;if(w.task?.phase==='pickup')this.cancel(w);return true;}
    autoAssign(even=false){
      const idle=()=>this.workers.find(w=>!w.assigned&&!w.task);
      const buildings=this.buildings.filter(b=>!['home','pile','market'].includes(b.type)&&!this.active(b));
      let count=0;
      do{for(const b of buildings){const w=idle();if(!w)return count;w.assigned=b.id;w.route=[];count++;}}while(even&&buildings.length&&idle());
      return count;
    }
    cancel(w){w.task=null;w.route=[];w.producing=false;}
    move(b,x,y){if(b.type==='market'||!this.canPlace(b.type,x,y,b.id))return false;b.x=x;b.y=y;for(const w of this.workers){w.route=[];if(w.task?.phase==='pickup')this.cancel(w);}return true;}
    demolish(b){if(['home','market'].includes(b.type))return false;const [g,m]=TYPES[b.type].cost;this.gold+=Math.floor(g*.5);this.materials+=Math.floor(m*.5);const goods={...b.output};for(const [k,n] of Object.entries(b.input))goods[k]=(goods[k]||0)+n;for(const w of this.workers){if(w.assigned===b.id)w.assigned=null;if(w.task?.source===b.id&&w.task.phase==='pickup')this.cancel(w);if(w.task?.dest===b.id){if(w.task.phase==='pickup')this.cancel(w);else{w.task.dest=this.buildings.find(b=>b.type==='market').id;w.route=[];}}}this.buildings=this.buildings.filter(z=>z!==b);if(sum(goods)){const p=this.addBuilding('pile',b.x,b.y);p.output=goods;}this.log('拆除'+TYPES[b.type].name+'，返还一半建造费用');return true;}
    reservedOutput(b,key){return this.workers.reduce((n,w)=>n+(w.task?.source===b.id&&w.task.key===key&&w.task.phase==='pickup'?w.task.amount:0),0);}
    incoming(b,key){return this.workers.reduce((n,w)=>n+(w.task?.dest===b.id&&(!key||w.task.key===key)?(w.task.reserved??w.task.amount):0),0);}
    available(b,key){return Math.max(0,(b.output[key]||0)-this.reservedOutput(b,key));}
    active(b){return this.workers.some(w=>w.assigned===b.id);}
    accepts(b,key){const s=stats(b);return b.type!=='market'&&this.active(b)&&(s.optional?.includes(key)||s.recipes.some(r=>r.inputs.includes(key)))&&s.input-sum(b.input)-this.incoming(b)>0&&(b.input[key]||0)+this.incoming(b,key)<s.input;}
    demand(b,key){const s=stats(b),r=s.recipes.find(r=>r.inputs.includes(key)),keyRoom=Math.max(0,s.input-(b.input[key]||0)-this.incoming(b,key));if(s.optional?.includes(key))return Math.min(2,keyRoom);if(!r)return 0;const existing=r.inputs.reduce((n,k)=>n+(b.input[k]||0)+this.incoming(b,k),0);return Math.max(0,Math.min(r.amount*2-existing,keyRoom,s.input-sum(b.input)-this.incoming(b)));}
    consumers(source,key){return this.buildings.filter(b=>b.id!==source.id&&this.accepts(b,key)).sort((a,b)=>dist(source,a)-dist(source,b));}
    createTask(w,source,dest,key,limit){
      let n=Math.min(this.available(source,key),[5,7,9,12,15][this.carryLevel-1],limit??Infinity);
      if(dest.type!=='market')n=Math.min(n,stats(dest).input-sum(dest.input)-this.incoming(dest));
      if(n<=0||!this.path(w,this.spots(source))||!this.path(this.spots(source)[0],this.spots(dest)))return false;
      const route=this.routeOutside(w,source);if(!route)return false;
      w.task={source:source.id,dest:dest.id,key,amount:n,reserved:n,phase:'pickup'};w.route=route;return true;
    }
    supply(w,b){const s=stats(b),keys=[...new Set([...s.recipes.flatMap(r=>r.inputs),...(s.optional||[])])];keys.sort((a,z)=>this.demand(b,z)-this.demand(b,a));for(const key of keys){const need=this.demand(b,key);if(need<=0)continue;const sources=this.buildings.filter(z=>this.available(z,key)>0).sort((a,z)=>dist(w,a)-dist(w,z));for(const src of sources)if(this.createTask(w,src,b,key,need))return true;}return false;}
    dispatch(w,b,salesOnly=false){
      const keys=Object.keys(b.output).filter(k=>this.available(b,k)>0);
      for(const key of keys){const consumers=this.consumers(b,key);if(consumers.length){if(!salesOnly)for(const d of consumers)if(this.createTask(w,b,d,key,this.demand(d,key)||Infinity))return true;continue;}if(this.createTask(w,b,this.buildings.find(z=>z.type==='market'),key))return true;}return false;
    }
    onSite(w,b){return this.spots(b).some(p=>Math.abs(w.x-p.x)<.05&&Math.abs(w.y-p.y)<.05);}
    routeOutside(w,b){const src=this.buildingAt(w.x,w.y),ignore=src?[src.id]:null;const path=this.path(w,this.spots(b),ignore);if(path===null)return null;w.ignore=ignore;return this.simplify(w,path,ignore);}
    assignDelivery(w,b,key,amount,type){
      const cap=[5,7,9,12,15][this.carryLevel-1],carry=Math.min(amount,cap);
      if(carry<=0)return 0;
      let dest=null,reserved=0;
      for(const c of this.consumers(b,key)){const room=stats(c).input-sum(c.input)-this.incoming(c);if(room>0){dest=c;reserved=Math.min(carry,room);break;}}
      if(!dest){dest=this.buildings.find(z=>z.type==='market');reserved=carry;}
      const route=(dest.type==='market'||dest.type==='pile')?this.routeOutside(w,dest):this.routeTo(w,dest);
      if(!route)return 0;
      w.task={source:b.id,dest:dest.id,key,amount:carry,reserved,phase:'delivery'};w.route=route;
      this.events.push({type,building:b.id,worker:w.id,key,amount:carry});
      return carry;
    }
    directDeliver(b,w,key,amount){return this.assignDelivery(w,b,key,amount,'produceTo');}
    takeOutput(w,b){for(const key of Object.keys(b.output)){const have=b.output[key]||0;if(have<=0)continue;const take=this.assignDelivery(w,b,key,have,'pickup');if(take>0){b.output[key]=have-take;return true;}}return false;}
    recipe(b){const s=stats(b);for(let j=1;j<=s.recipes.length;j++){const ix=(b.lastRecipe+j)%s.recipes.length,r=s.recipes[ix];if(r.inputs.reduce((n,k)=>n+(b.input[k]||0),0)>=r.amount&&sum(b.output)+sum(r.out)<=s.output)return {r,ix};}return null;}
    startBatch(b){const choice=this.recipe(b);if(!choice)return false;const r=JSON.parse(JSON.stringify(choice.r)),consumed={};for(const key of r.inputs){const take=Math.min(b.input[key]||0,r.amount);b.input[key]=(b.input[key]||0)-take;r.amount-=take;if(take>0)consumed[key]=(consumed[key]||0)+take;}if(b.type==='farm'&&(b.input.fertilizer||0)>0&&sum(b.output)+r.out.grain+2<=stats(b).output){b.input.fertilizer--;r.out.grain+=2;consumed.fertilizer=(consumed.fertilizer||0)+1;}b.batch={out:r.out,materials:r.materials||0,cycle:stats(b).cycle};b.lastRecipe=choice.ix;b.progress=0;this.events.push({type:'consume',building:b.id,items:consumed});return true;}
    status(b){if(b.type==='home')return '每秒收入 '+stats(b).income.toFixed(1);if(b.type==='market')return '自动售卖';if(b.type==='pile')return '等待清运';if(!this.active(b))return '无人指派';if(b.batch)return this.workers.some(w=>w.assigned===b.id&&w.producing)?'生产中':'等待生产者';if(sum(b.output)+Math.min(...stats(b).recipes.map(r=>sum(r.out)))>stats(b).output)return '输出空间不足';if(!this.recipe(b))return '缺少输入';return '等待生产者';}
    walk(w,dt){
      const target=w.route[0];if(!target)return;
      const dx=target.x-w.x,dy=target.y-w.y,d=Math.hypot(dx,dy),v=this.speed*(1+(this.speedLevel-1)*.15)*dt;
      const here=this.buildingAt(w.x,w.y);let ignore=w.ignore;
      if(here)ignore=Array.isArray(ignore)?(ignore.includes(here.id)?ignore:[...ignore,here.id]):(ignore===here.id?ignore:[ignore,here.id].filter(v2=>v2!=null));
      if(d<=v+1e-6){w.x=target.x;w.y=target.y;w.route.shift();if(!w.route.length)w.ignore=null;return;}
      const base=Math.atan2(dy,dx);
      for(const off of [0,.35,-.35,.7,-.7,1.05,-1.05,1.4,-1.4,1.75,-1.75,2.1,-2.1,2.45,-2.45,Math.PI]){
        const a=base+off,nx=w.x+Math.cos(a)*v,ny=w.y+Math.sin(a)*v;
        if(!this.blockedPoint(nx,ny,ignore)){w.x=nx;w.y=ny;return;}
      }
      // Fully boxed in: stay put rather than clipping through.
    }
    tick(dt){
      if(this.failed)return;this.elapsed+=dt;this.homeClock+=dt;
      const home=this.buildings.find(b=>b.type==='home');
      while(this.homeClock>=1-1e-9){this.homeClock=Math.max(0,this.homeClock-1);const income=stats(home).income;this.gold+=income;this.feedback.push({building:home.id,type:'gold',amount:income});}
      if(!this.won){this.rentTime-=dt;if(this.grace!==null){this.grace-=dt;if(this.gold>=this.rent)this.payRent();else if(this.grace<=0){this.failed=true;this.log('未能付清租金，经营结束');}}else if(this.rentTime<=0){if(this.gold>=this.rent)this.payRent();else{this.grace=this.firstDebt?10:30;this.firstDebt=true;this.log('金币不足，进入'+this.grace+'秒宽限');}}}
      if(this.failed)return;
      for(const w of this.workers)w.producing=false;
      // A shared task list reserves both ends before either upstream or downstream departs.
      for(const w of this.workers){
        if(!w.task)continue;
        const t=w.task,src=this.building(t.source);
        if(!src&&t.phase==='pickup'){this.cancel(w);continue;}
        let d=this.building(t.dest);
        if(!d){t.dest=this.buildings.find(b=>b.type==='market').id;w.route=[];d=this.building(t.dest);}
        if(!w.route.length){
          if(t.phase==='pickup'){
            const p=this.routeOutside(w,src);
            if(p===null){this.cancel(w);continue;}
            w.route=p;
            if(!p.length){
              t.amount=Math.min(t.amount,src.output[t.key]||0);src.output[t.key]-=t.amount;t.phase='delivery';
              if(!t.amount){this.cancel(w);continue;}
              this.events.push({type:'pickup',building:src.id,worker:w.id,key:t.key,amount:t.amount});
              const r2=(d.type==='market'||d.type==='pile')?this.routeOutside(w,d):this.routeTo(w,d);
              if(r2===null){this.cancel(w);continue;}
              w.route=r2;
            }
          }else if(d.type==='market'||d.type==='pile'){
            const p=this.routeOutside(w,d);
            if(p===null)continue;
            w.route=p;
            if(!p.length){const money=GOODS[t.key].price*t.amount;this.gold+=money;this.sales+=money;this.events.push({type:'sell',building:d.id,worker:w.id,key:t.key,amount:t.amount});this.cancel(w);continue;}
          }else{
            const arrive=()=>{const put=Math.min(t.reserved??t.amount,t.amount);d.input[t.key]=(d.input[t.key]||0)+put;this.events.push({type:'deliver',building:d.id,worker:w.id,key:t.key,amount:put});const leftover=t.amount-put;if(leftover>0){const mk=this.buildings.find(z=>z.type==='market');t.dest=mk.id;t.amount=leftover;t.reserved=leftover;const rr=this.routeOutside(w,mk);if(rr===null)this.cancel(w);else w.route=rr;}else this.cancel(w);};
            if(this.atWork(w,d)){arrive();continue;}
            const r=this.routeTo(w,d);
            if(r===null)continue;
            w.route=r;
            if(!r.length){arrive();continue;}
          }
        }
        this.walk(w,dt);
      }
      for(const b of this.buildings){if(['home','market','pile'].includes(b.type))continue;const members=this.workers.filter(w=>w.assigned===b.id&&!w.task);if(!members.length)continue;
        const inside=members.filter(w=>this.atWork(w,b)),producer=inside[0]||members[0];
        if(!inside.length){if(!producer.route.length){const r=this.routeTo(producer,b);if(r)producer.route=r;}this.walk(producer,dt);}
        else if(b.batch||this.recipe(b)){producer.producing=true;producer.route=[];if(!b.batch)this.startBatch(b);if(b.batch){b.progress+=dt;if(b.progress>=b.batch.cycle){const out=b.batch.out;if(b.batch.materials){this.materials+=b.batch.materials;this.feedback.push({building:b.id,type:'material',amount:b.batch.materials});}for(const key of Object.keys(out)){while(out[key]>0){const cand=inside.find(w=>!w.producing&&!w.task&&w.route.length===0);if(!cand)break;const taken=this.directDeliver(b,cand,key,out[key]);if(taken<=0)break;out[key]-=taken;}}for(const [k,n] of Object.entries(out)){if(n>0){b.output[k]=(b.output[k]||0)+n;this.events.push({type:'produceOut',building:b.id,key:k,amount:n});}}b.batch=null;b.progress=0;}}}
        for(const w of members){if(w.producing||w.task||w.route.length)continue;if(this.atWork(w,b)&&this.takeOutput(w,b))continue;if(this.supply(w,b))continue;if(!this.atWork(w,b)){const r=this.routeTo(w,b);if(r)w.route=r;}}
      }
      for(const w of this.workers)if(!w.task&&!w.producing){const b=this.building(w.assigned);if(b?.type==='market'){const sources=this.buildings.filter(z=>sum(z.output)).sort((a,z)=>(sum(z.output)/Math.max(1,stats(z).output))-(sum(a.output)/Math.max(1,stats(a).output))||dist(w,a)-dist(w,z));for(const src of sources)if(this.dispatch(w,src,true))break;}else if(!b){for(const pile of this.buildings.filter(z=>z.type==='pile'&&sum(z.output)))if(this.dispatch(w,pile,true))break;}}
      this.buildings=this.buildings.filter(b=>b.type!=='pile'||sum(b.output)>0||this.workers.some(w=>w.task?.source===b.id));
    }
    payRent(){this.gold-=this.rent;this.log('付清第'+this.round+'轮租金：'+this.rent+'金币');this.round++;this.rent=Math.round(180*1.7**(this.round-1));this.rentTime=60;this.grace=null;}
    buyLand(){if(this.won||this.failed||this.grace!==null||this.gold<this.landPrice)return false;this.gold-=this.landPrice;this.won=true;this.log('买下青溪庄田，从此不再交租');return true;}
  }
  root.FarmGame={Game,TYPES,GOODS,stats,sum};
  if(typeof module!=='undefined')module.exports=root.FarmGame;
})(typeof globalThis!=='undefined'?globalThis:this);
