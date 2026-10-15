/* 古坊奇谭 · deterministic multi-estate simulation. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./maps.js'):root.GFMaps);if(typeof module==='object'&&module.exports)module.exports=api;else root.GF=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Maps){
  'use strict';
  const SIZE = 25, CENTER = 12, MAX_LEVEL = 9, SHRINE_MAX_LEVEL = 15, GATE_MAX_LEVEL = 15;
  const worldSize = s => s?.worldSize ?? (s ? 25 : 17);
  // worldSize remains the row stride (width) for existing callers and square saves.
  const worldWidth = worldSize;
  const worldHeight = s => s?.worldHeight ?? worldWidth(s);
  const worldCenter = s => Math.floor(worldSize(s) / 2);
  const worldCenterY = s => Math.floor(worldHeight(s) / 2);
  const GROWTH = 2, HP_GROWTH = 1.55, UPGRADE_GROWTH = 5, MATERIAL_COST_FACTOR = 1.3;
  const ECONOMY_UPGRADE_WAIT = 7.5, ECONOMY_UPGRADE_GROWTH = 5;
  const SHRINE_REQUIREMENTS = [0, 1, 2, 3, 5, 7, 9, 11, 13, 15];
  const TERRAIN = { plain: '平地', shore: '水岸', water: '水域', forest: '林地', mountain: '山地' };
  const DEFS = {};
  function balancedCost(cost) {
    return { coins: cost.coins, materials: Math.ceil(cost.materials * MATERIAL_COST_FACTOR) };
  }
  function def(id, name, cat, cost, hp, extra = {}) {
    if (extra.upgradeBase) extra = { ...extra, upgradeBase: balancedCost(extra.upgradeBase) };
    DEFS[id] = { id, name, cat, cost: balancedCost(cost), hp, ...extra };
  }
  const chains = [
    ['tea', 'inn', 'bank', '茶肆', '客栈', '钱庄', 'plain', '商', '#d6a450'],
    ['farm', 'mill', 'wine', '农田', '磨坊', '酒坊', 'shore', '农', '#89a663'],
    ['mulberry', 'weaver', 'tailor', '桑园', '织坊', '成衣铺', 'forest', '丝', '#b38ba7'],
    ['quarry', 'kiln', 'trade', '石场', '瓷窑', '商号', 'mountain', '工', '#7b9fa2']
  ];
  // 所有生产建筑的影响范围统一为 1（仅影响相邻格）。
  const COIN_CHAIN_COSTS = [{ coins: 0, materials: 50 }, { coins: 90, materials: 160 }, { coins: 430, materials: 750 }];
  const MATERIAL_CHAIN_COSTS = [{ coins: 75, materials: 0 }, { coins: 190, materials: 50 }, { coins: 920, materials: 300 }];
  chains.forEach((a, ci) => { for (let i = 0; i < 3; i++) {
    const coinChain = ci === 0 || ci === 2, baseCost = (coinChain ? COIN_CHAIN_COSTS : MATERIAL_CHAIN_COSTS)[i], high = ci === 0 || ci === 3;
    const costFactor = (high ? 1.5 : 1) * (i === 2 ? 2 : 1);
    def(a[i], a[i + 3], 'economy', { coins: Math.ceil(baseCost.coins * costFactor), materials: Math.ceil(baseCost.materials * costFactor) }, [180, 250, 340][i], {
    income: (high ? [2, 8, 48] : [1, 5, 30])[i], resource: coinChain ? 'coins' : 'materials', terrain: i === 0 ? a[6] : null, prev: i ? a[i - 1] : null,
    upgradeWeight: i === 0 ? (high ? 7 / 6 : 11 / 15) : 1,
    ...(i === 0 && (ci === 1 || ci === 2) ? { buildCostScale: [.1, 1.2] } : {}),
    chain: a[7], color: a[8], end: i === 2, tier: i, radius: 1, limit: i === 0 ? [4, 6, 6, 4][ci] : i === 1 ? 2 : 1,
    names: [a[i + 3], i === 0 ? ['清茗茶肆', '临水良田', '葱郁桑园', '青石矿场'][ci] : '兴旺' + a[i + 3], '鼎盛' + a[i + 3]]
  }); } });
  def('guild', '汇财会馆', 'economy', { coins: 18000, materials: 24000 }, 600, { income: 240, resource: 'coins', aura: .05, auraResource: 'coins', required: ['bank', 'tailor'], radius: 1, limit: 1 });
  def('port', '百工院', 'economy', { coins: 24000, materials: 15000 }, 900, { income: 300, resource: 'materials', aura: .10, auraResource: 'materials', required: ['wine', 'trade'], radius: 1, limit: 1 });
  def('tower', '箭塔', 'defense', { coins: 95, materials: 70 }, 300, { damage: 22, range: 4, interval: .85, desc: '单体远射 · 射程 4 格' });
  def('rock', '擂石台', 'defense', { coins: 260, materials: 190 }, 380, { damage: 64, range: 3.8, interval: 2, splash: 1.5, fortuneOnly: true, desc: '范围轰击 · 仅可由造化匣获得' });
  def('barracks', '兵营', 'defense', { coins: 240, materials: 180 }, 420, { damage: 18, range: 4.5, interval: .8, limit: 8, buildCostScale: [.5, 2], desc: '持续出兵 · 一级 5s/1兵' });
  def('well', '水井', 'support', { coins: 100, materials: 60 }, 250, { farmAura: .2, fortuneOnly: true, desc: '全庄农田收入 +20% · 仅可由造化匣获得' });
  def('stage', '戏台', 'support', { coins: 300, materials: 220 }, 280, { aura: .03, fortuneOnly: true, desc: '全镇收入 +3%' });
  def('shrine', '祠堂', 'temple', { coins: 0, materials: 0 }, 1800, { income: 1, resource: 'coins', desc: '古坊之根 · 决定全坊升级上限', unique: true, upgradeBase: { coins: 120, materials: 90 }, upgradeGrowth: 5, names: ['古坊祠堂', '百福祠堂', '万安宗祠'] });
  def('earth', '土地庙', 'temple', { coins: 180, materials: 130 }, 260, { guard: .2, range: 3, fortuneOnly: true, desc: '三格内建筑受到伤害 -20% · 仅可由造化匣获得' });
  def('zhong', '钟馗像', 'temple', { coins: 360, materials: 260 }, 430, { slow: .4, pulseInterval: 12, slowDuration: 4, fortuneOnly: true, desc: '每 12 秒全场减速 4 秒 · 仅可由造化匣获得' });
  def('tao', '道观', 'temple', { coins: 600, materials: 440 }, 380, { powerAura: .15, fortuneOnly: true, desc: '全镇防御建筑攻击 +15% · 仅可由造化匣获得' });
  def('fortune', '造化匣', 'mystery', { coins: 90, materials: 60 }, 1, { limit: 10, desc: '变化为随机建筑' });
  def('gate', '庄园城门', 'defense', { coins: 95, materials: 120 }, 700, { fixed: true, upgradeBase: { coins: 150, materials: 120 }, upgradeGrowth: 5, desc: '庄园出入口 · 可升级与修复' });
  const SKILLS = { repel: { name: '驱鬼符', cooldown: 18 }, repair: { name: '回春诀', cooldown: 24 }, thunder: { name: '九霄天雷', cooldown: 120 } };
  const MISSIONS = [
    { title: '一盏茶，起一座坊', desc: '在平地建造一间茶肆', reward: 60, test: s => s.buildings.some(b => b.type === 'tea') },
    { title: '客来茶香，产业相连', desc: '紧挨茶肆建造客栈', reward: 90, test: s => s.buildings.some(b => b.type === 'inn') },
    { title: '立箭塔，护一方安宁', desc: '建造两座箭塔，保卫庄园', reward: 100, test: s => s.buildings.filter(b => b.type === 'tower').length >= 2 },
    { title: '造化初开', desc: '开启一次造化匣', reward: 75, test: s => s.fortuneBuilt >= 1 },
    { title: '百业初兴', desc: '建成任意两种经济链终点建筑', reward: 200, test: s => new Set(s.buildings.filter(b => DEFS[b.type].end).map(b => b.type)).size >= 2 },
    { title: '四方会聚', desc: '建成一座汇财会馆', reward: 300, test: s => s.buildings.some(b => b.type === 'guild') },
  ];

  const VERSION=10, UNIT_CAP=120, SOLDIER_SPEED=.8;
  const TROOPS=Object.freeze({
    infantry:Object.freeze({name:'步兵',hp:44,damage:18,range:.75,interval:1}),
    archer:Object.freeze({name:'弓兵',hp:44*.7,damage:18*.75,range:3,interval:1.5})
  });
  const troopType=entity=>entity?.troopType||'infantry';
  const troopDef=entity=>TROOPS[troopType(entity)]||TROOPS.infantry;
  const soldierBaseDamage=entity=>troopDef(entity).damage*factor(entity);
  const DIFFICULTIES=Object.freeze({
    beginner:Object.freeze({id:'beginner',name:'入门',economy:1,soldier:1}),
    hard:Object.freeze({id:'hard',name:'困难',economy:1.2,soldier:1.1}),
    extreme:Object.freeze({id:'extreme',name:'极难',economy:1.5,soldier:1.25}),
    hell:Object.freeze({id:'hell',name:'地狱',economy:2,soldier:1.5})
  });
  const world=s=>s._world||s;
  const inside=(x,y,s)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<worldWidth(s)&&y<worldHeight(s);
  const dist8=(ax,ay,bx,by)=>Math.max(Math.abs(ax-bx),Math.abs(ay-by));
  const NEIGHBORS8=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  const mapCache=new WeakMap(),viewCache=new WeakMap(),indexCache=new WeakMap();
  function map(s){const w=world(s);let value=mapCache.get(w);if(!value){value=Maps.create(w.mapSeed,w.mode,w.enemyCount,w.rotation);mapCache.set(w,value);}return value;}
  function buildingIndex(s){
    const w=world(s);let index=indexCache.get(w);
    if(!index||index.revision!==w.revision||index.list!==w.buildings){
      index={revision:w.revision,list:w.buildings,tiles:new Map(),ids:new Map(),owners:w.players.map(()=>[])};
      for(const b of w.buildings){index.tiles.set(b.y*w.worldSize+b.x,b);index.ids.set(b.id,b);index.owners[b.owner].push(b);}
      indexCache.set(w,index);
    }return index;
  }
  const personalKeys=['coins','materials','fortuneBuilt','gateLevel','cooldowns','selectedSkill','mission','eliminated','controller','team','ai','recruitCursor','kills'];
  function playerView(s,owner=0){
    const w=world(s);if(!w.players[owner])throw new Error('Unknown estate');
    let views=viewCache.get(w);if(!views){views=[];viewCache.set(w,views);}if(views[owner])return views[owner];
    const view={actorId:owner};Object.defineProperty(view,'_world',{value:w});
    const keys=new Set([...Object.keys(w),...personalKeys,'enemies']);
    for(const key of keys)Object.defineProperty(view,key,{enumerable:true,
      get(){if(key==='buildings')return buildingIndex(w).owners[owner];if(key==='enemies')return hostileUnits(view);return personalKeys.includes(key)?w.players[owner][key]:w[key];},
      set(value){if(key==='buildings'){w.buildings=[...w.buildings.filter(b=>b.owner!==owner),...value];w.revision++;}else if(personalKeys.includes(key))w.players[owner][key]=value;else w[key]=value;}
    });return views[owner]=view;
  }
  const economicView=s=>s.actorId===undefined?playerView(s):s;
  const hostile=(s,a,b)=>world(s).players[a]?.team!==world(s).players[b]?.team;
  const hostileUnits=s=>{const p=economicView(s);return world(s).soldiers.filter(u=>u.hp>0&&hostile(s,p.actorId,u.owner));};
  function estate(s){const land=map(s).land;return s.actorId===undefined?land:land.estates[s.actorId];}
  function owns(s,x,y){if(!inside(x,y,s))return false;const m=map(s),k=y*worldWidth(s)+x;if(s.actorId===undefined)return m.owners[k]>=0||m.land.walls.has(k);return !s.eliminated&&(m.owners[k]===s.actorId||m.land.estates[s.actorId].walls.has(k));}
  const ownerAt=(s,x,y)=>inside(x,y,s)?map(s).owners[y*worldWidth(s)+x]:-1;
  const isWall=(s,x,y)=>inside(x,y,s)&&map(s).land.walls.has(y*worldWidth(s)+x);
  const walkable=(s,x,y)=>inside(x,y,s)&&!!map(s).walk[y*worldWidth(s)+x];
  function terrain(x,y,s){
    if(!inside(x,y,s))return 'plain';const cells=map(s).terrain,base=cells[y*worldWidth(s)+x];
    return base==='plain'&&NEIGHBORS8.some(([dx,dy])=>inside(x+dx,y+dy,s)&&cells[(y+dy)*worldWidth(s)+x+dx]==='water')?'shore':base;
  }
  function createMatch({mode='single',enemyCount=mode==='coop'?2:1,difficulty='beginner',mapSeed=Math.floor(Math.random()*4294967296),rotation}={}){
    if(!['single','coop'].includes(mode)||!(mode==='coop'?[2,4,6]:[1,2,3,4]).includes(enemyCount))throw new Error('Invalid match configuration');
    if(!Object.prototype.hasOwnProperty.call(DIFFICULTIES,difficulty))throw new Error('Invalid difficulty');
    if(!Number.isInteger(mapSeed)||mapSeed<0||mapSeed>4294967295)throw new Error('Invalid map seed');
    rotation??=mapSeed%4;if(![0,1,2,3].includes(rotation))throw new Error('Invalid rotation');
    const [width,height]=Maps.dimensions(mode,enemyCount),blue=mode==='coop'?2:1;
    const s={version:VERSION,mode,enemyCount,difficulty,mapSeed,rotation,mapGeneration:3,worldSize:rotation%2?height:width,worldHeight:rotation%2?width:height,
      seed:mapSeed,nextId:1,elapsed:0,time:0,day:1,phase:'day',revision:0,over:false,result:null,kills:0,
      players:[],buildings:[],soldiers:[],projectiles:[],effects:[],events:[]};
    for(let id=0;id<blue+enemyCount;id++)s.players.push({id,team:id<blue?0:1,controller:id===0?'human':'computer',eliminated:false,
      coins:0,materials:0,fortuneBuilt:0,gateLevel:1,cooldowns:{repel:0,repair:0,thunder:0},selectedSkill:id===0?null:'thunder',mission:0,kills:0,recruitCursor:0,
      ai:{clock:0,armyTurn:true,activeSeconds:0,decisions:0,builds:0,upgrades:0,casts:0,lastAction:'准备经营'}});
    for(const e of map(s).land.estates){addBuilding(s,'shrine',e.center.x,e.center.y,1,{owner:e.owner});for(const g of e.gates)addBuilding(s,'gate',g.x,g.y,1,{owner:e.owner,direction:g.direction});}
    return s;
  }
  // Version 9 matches are migrated by restore; older map formats remain unsupported.
  const createState=(mapSeed)=>createMatch({mapSeed});
  const createCoopState=(mapSeed)=>createMatch({mode:'coop',mapSeed});
  const at = (s,x,y) => {if(!inside(x,y,s))return undefined;const b=buildingIndex(s).tiles.get(y*worldWidth(s)+x);return b&&(s.actorId===undefined||b.owner===s.actorId)?b:undefined;};
  const adjacent = (s,x,y) => NEIGHBORS8.map(([dx,dy])=>at(s,x+dx,y+dy)).filter(Boolean);
  const dryFarm = () => false;
  const isPrereq = (d, nd) => d.chain ? nd.id === d.prev : !!d.required?.includes(nd.id);
  const RETIRED_TYPES = new Set(['home', 'market', 'fence']);
  const factor = b => Math.pow(GROWTH, b.level - 1);
  const incomeFactor = b => b.type === 'shrine' ? Math.pow(2, Math.min(6, b.level - 1)) * Math.pow(1.5, Math.max(0, b.level - 7)) : Math.pow(GROWTH, b.level - 1);
  const auraFactor = b => Math.pow(2, Math.min(2, b.level - 1)) * (1 + .2 * Math.max(0, b.level - 3));
  const hpFactor = b => Math.pow(HP_GROWTH, b.level - 1);
  const maxLevel = b => b?.type === 'shrine' ? SHRINE_MAX_LEVEL : b?.type === 'gate' ? GATE_MAX_LEVEL : MAX_LEVEL;
  const shrineLevel = s => economicView(s).buildings.find(b => b.type === 'shrine')?.level || 0;
  const requiredShrineLevel = level => SHRINE_REQUIREMENTS[Math.min(MAX_LEVEL, Math.max(1, level))];
  const unlockedBuildingLevel = s => {
    const level = shrineLevel(s); let unlocked = 1;
    for (let target = 2; target <= MAX_LEVEL; target++) if (level >= requiredShrineLevel(target)) unlocked = target;
    return unlocked;
  };
  const maxHP = b => Math.round(DEFS[b.type].hp * hpFactor(b));
  const soldierTrainingTime = level => 5 - 4 * (Math.max(1, Math.min(SHRINE_MAX_LEVEL, level)) - 1) / (SHRINE_MAX_LEVEL - 1);
  const soldierRate = s => 1 / soldierTrainingTime(shrineLevel(s));
  function difficultyModifiers(s){
    const p=economicView(s),d=DIFFICULTIES[world(s).difficulty]||DIFFICULTIES.beginner;
    return p.team===1&&p.controller==='computer'?d:DIFFICULTIES.beginner;
  }
  const difficultyEconomy=s=>difficultyModifiers(s).economy;
  const difficultySoldier=s=>difficultyModifiers(s).soldier;
  const soldierBoost = () => 1;
  function soldierHP(s,b){if(b===undefined){b=s;return Math.round(troopDef(b).hp*hpFactor(b));}return Math.round(troopDef(b).hp*hpFactor(b)*difficultySoldier(s));}
  const soldierDamage = (s,b) => soldierBaseDamage(b) * defenseBoost(s) * difficultySoldier(s);
  const soldierPower = (s,b) => Math.round(Math.sqrt(soldierHP(s,b)*soldierDamage(s,b)));
  function syncSoldierHealth(s){const index=buildingIndex(s);for(const u of s.soldiers){u.troopType=troopType(u);u.attackAt??=0;u.targetBuildingId??=null;const barracks=index.ids.get(u.barracksId);if(barracks?.type==='barracks'&&troopType(barracks)===u.troopType)u.level=barracks.level;const nextMax=soldierHP(playerView(s,u.owner),u);if(u.maxHp!==nextMax){u.hp=Math.min(nextMax,nextMax*u.hp/u.maxHp);u.maxHp=nextMax;}u.baseDamage=soldierBaseDamage(u);}}
  const visualLevel = level => Math.min(3, Math.floor((level - 1) / 3) + 1);
  const name = b => b.type==='barracks'?(b.level<4?'兵营':troopDef(b).name+'营'):(DEFS[b.type].names?.[visualLevel(b.level) - 1] || (visualLevel(b.level) === 1 ? DEFS[b.type].name : (visualLevel(b.level) === 2 ? '兴盛' : '鼎盛') + DEFS[b.type].name));
  function addBuilding(s, type, x, y, level = 1, extra = {}) {
    const b = { id: s.nextId++, type, x, y, level, hp: Math.round(DEFS[type].hp * Math.pow(HP_GROWTH, level - 1)), cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0, production: 0, lastHit: -10, ...extra };
    b.owner = extra.owner ?? s.actorId ?? 0;
    if(type==='barracks')b.troopType='infantry';
    world(s).buildings.push(b); s.revision++; return b;
  }
  function grantBuilding(s, type, x, y, level = unlockedBuildingLevel(s), originCost) {
    s = economicView(s);
    if (!DEFS[type] || type === 'fortune' || DEFS[type].unique || DEFS[type].fixed || !owns(s, x, y) || isWall(s, x, y) || estate(s)?.gates.some(g => g.x === x && g.y === y) || terrain(x, y, s) === 'water' || at(s, x, y)) return null;
    return addBuilding(s, type, x, y, Math.min(level, maxLevel({ type })), originCost ? { originCost } : {});
  }
  function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
  function shortage(s, cost) {
    const missing = [];
    if (s.coins < cost.coins) missing.push(Math.ceil(cost.coins - s.coins) + ' 铜钱');
    if (s.materials < cost.materials) missing.push(Math.ceil(cost.materials - s.materials) + ' 工材');
    return missing.length ? '差 ' + missing.join('、') : '';
  }
  function pay(s, cost) { s.coins -= cost.coins; s.materials -= cost.materials; }
  function buildCost(s, type) {
    s = economicView(s);
    if (type !== 'fortune') {
      const d=DEFS[type];if(!d)return {coins:0,materials:0};let factor=1;
      if(d.buildCostScale){const count=Math.min(d.limit-1,s.buildings.filter(b=>b.type===type).length),[start,end]=d.buildCostScale;factor=start+(end-start)*count/(d.limit-1);}
      const scaled=value=>value?Math.ceil(value*factor-1e-9):0;
      return {coins:scaled(d.cost.coins),materials:scaled(d.cost.materials)};
    }
    const multiple = Math.pow(1.55, s.fortuneBuilt || 0);
    return { coins: Math.ceil(DEFS.fortune.cost.coins * multiple), materials: Math.ceil(DEFS.fortune.cost.materials * multiple) };
  }
  function fortuneCandidates(s, x, y) {
    s = economicView(s);
    if (!owns(s, x, y) || isWall(s, x, y) || estate(s)?.gates.some(g => g.x === x && g.y === y) || at(s, x, y) || terrain(x, y, s) === 'water') return [];
    const plot = terrain(x, y, s);
    return Object.values(DEFS).filter(d => {
      if (d.id === 'fortune' || d.unique || d.fixed || d.income || (d.limit && s.buildings.filter(b => b.type === d.id).length >= d.limit)) return false;
      if (d.cat === 'economy' && plot === 'forest' && d.id !== 'mulberry') return false;
      if (d.cat === 'economy' && plot === 'mountain' && d.id !== 'quarry') return false;
      if (d.id === 'farm' && plot !== 'shore') return false;
      if (d.id !== 'farm' && d.terrain && plot !== d.terrain) return false;
      return true;
    });
  }
  function buildReason(s, type, x, y, ignoreFunds = false, ignoreEnemies = false) {
    s = economicView(s);
    const d = DEFS[type];
    if (!d) return '未知建筑';
    if (s.over || s.eliminated) return '该庄园已出局';
    if (!owns(s, x, y) || isWall(s, x, y)) return '请选择庄园内地块';
    if (at(s, x, y)) return '此地已有建筑';
    if (estate(s)?.gates.some(g => g.x === x && g.y === y)) return '城门地块不可建造';
    const plot = terrain(x, y, s);
    if (plot === 'water') return '水域不可建造';
    if (d.fixed) return '城门仅可由庄园生成';
    if (!ignoreEnemies && hostileUnits(s).some(e => Math.hypot(e.x - x, e.y - y) < .65)) return '敌人正在此地';
    if (d.unique) return '祠堂仅此一座';
    if (d.fortuneOnly) return '仅可由造化匣获得';
    if (type === 'fortune') return fortuneCandidates(s, x, y).length ? (ignoreFunds ? '' : shortage(s, buildCost(s, type))) : '此地无可造化建筑';
    if (d.limit && s.buildings.filter(b => b.type === type).length >= d.limit) return '已达上限（' + d.limit + '座）';
    if (d.cat === 'economy' && plot === 'forest' && type !== 'mulberry') return '林地仅可建桑园';
    if (d.cat === 'economy' && plot === 'mountain' && type !== 'quarry') return '山地仅可建石场';
    if (type === 'farm') {
      if (plot !== 'shore') return '需水岸';
    } else if (d.terrain && plot !== d.terrain) return '需' + TERRAIN[d.terrain];
    if (d.prev && !adjacent(s, x, y).some(b => b.type === d.prev)) return '需紧挨' + DEFS[d.prev].name;
    if (d.required) {
      const nearby = new Set(adjacent(s, x, y).map(b => b.type));
      const missing = d.required.filter(id => !nearby.has(id));
      if (missing.length) return '需紧邻' + missing.map(id => DEFS[id].name).join('、');
    }
    return ignoreFunds ? '' : shortage(s, buildCost(s, type));
  }
  function buildHints(s, x, y, ignoreEnemies = false) {
    return Object.values(DEFS).filter(d => d.cat === 'economy' && (d.tier >= 1 || d.required) && !buildReason(s, d.id, x, y, true, ignoreEnemies))
      .map(d => ({ type: d.id, resource: d.resource, tier: d.required ? 3 : d.tier }));
  }
  function event(s, text, kind = 'info') { s.events.push({ text, kind }); if (s.events.length > 30) s.events.shift(); }
  function missions(s) {
    if(s.actorId===undefined){for(const p of s.players)if(!p.eliminated)missions(playerView(s,p.id));return;}
    while (MISSIONS[s.mission]?.test(s)) { const m = MISSIONS[s.mission++]; s.coins += m.reward; event(s, '坊志达成：' + m.title + ' · +' + m.reward + ' 铜钱', 'reward'); }
  }
  function build(s, type, x, y) {
    s = economicView(s);
    const reason = buildReason(s, type, x, y); if (reason) return { ok: false, reason };
    const cost = buildCost(s, type); pay(s, cost);
    if (type === 'fortune') {
      const candidates = fortuneCandidates(s, x, y), rolled = candidates[Math.floor(random(s) * candidates.length)], level = unlockedBuildingLevel(s);
      s.fortuneBuilt++; const b = grantBuilding(s, rolled.id, x, y, level, cost);
      event(s, '造化匣化为' + rolled.name + ' Lv' + level, 'reward'); missions(s); return { ok: true, building: b, rolled: rolled.id };
    }
    const b = addBuilding(s, type, x, y, 1, { originCost: cost }); missions(s); return { ok: true, building: b };
  }
  function upgradeCost(b) {
    const d = DEFS[b.type], base = d.upgradeBase || d.cost;
    if (d.cat === 'economy' && d.income) {
      const tier = d.tier ?? 3;
      const ownShare = [0, .2, .3, .4][tier], oppositeResource = d.resource === 'coins' ? 'materials' : 'coins';
      const oppositeRate = Object.values(DEFS)
        .filter(n => n.cat === 'economy' && n.resource === oppositeResource && (n.tier ?? 3) <= tier)
        .reduce((sum, n) => sum + n.income * (n.limit || 1), 0);
      const oppositeBase = Math.ceil(oppositeRate * ECONOMY_UPGRADE_WAIT * (d.upgradeWeight || 1));
      const ownBase = Math.ceil(oppositeBase * ownShare / (1 - ownShare));
      const scale = Math.pow(ECONOMY_UPGRADE_GROWTH, b.level - 1);
      const scaled = value => value ? Math.ceil(value * scale - 1e-9) : 0;
      return d.resource === 'materials'
        ? { coins: scaled(oppositeBase), materials: scaled(ownBase) }
        : { coins: scaled(ownBase), materials: scaled(oppositeBase) };
    }
    const foundation = b.type === 'shrine' || b.type === 'gate';
    const premium = b.type === 'shrine' ? 1.18 : b.type === 'gate' ? 1.06 : d.income ? 1.20 : 1.12;
    const multiple = 1.8 * Math.pow(d.upgradeGrowth || UPGRADE_GROWTH, b.level - 1) * Math.pow(premium, Math.max(0, b.level - (foundation ? 7 : 4)));
    return { coins: Math.ceil(base.coins * multiple), materials: Math.ceil(base.materials * multiple) };
  }
  function upgradeReason(s, b, ignoreFunds = false, options = {}) {
    s = economicView(s);
    if (!b || !s.buildings.includes(b)) return '建筑已不存在';
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return '仅可升级庄园内建筑';
    if (s.over || s.eliminated) return '该庄园已出局';
    const branch=options?.troopType;
    if(branch!==undefined&&(!(b.type==='barracks'&&b.level===3)||typeof branch!=='string'||!Object.prototype.hasOwnProperty.call(TROOPS,branch)))return '无效的兵营分支选择';
    const d = DEFS[b.type]; if (b.level >= maxLevel(b)) return '已达最高等级';
    if (estate(s) && (b.type === 'shrine' || b.type === 'gate')) {
      const otherType = b.type === 'shrine' ? 'gate' : 'shrine';
      const current = s.buildings.find(n => n.type === otherType)?.level || 0;
      if (b.level + 1 > current + 1) return '需' + (otherType === 'gate' ? '城门' : '祠堂') + ' Lv' + b.level + '（当前 Lv' + current + '）';
    }
    if (b.type !== 'shrine' && b.type !== 'gate') {
      const required = requiredShrineLevel(b.level + 1), current = shrineLevel(s);
      if (current < required) return '需祠堂 Lv' + required + '（当前 Lv' + current + '）';
    }
    if (d.prev && !adjacent(s, b.x, b.y).some(n => n.type === d.prev && n.level >= b.level + 1)) return '需邻' + DEFS[d.prev].name + ' Lv' + (b.level + 1);
    if (d.required) for (const id of d.required) if (!adjacent(s, b.x, b.y).some(n => n.type === id && n.level >= b.level + 1)) return '需邻' + DEFS[id].name + ' Lv' + (b.level + 1);
    if(b.type==='barracks'&&b.level===3&&branch===undefined)return '请选择步兵营或弓兵营';
    return ignoreFunds ? '' : shortage(s, upgradeCost(b));
  }
  function upgradeOptions(s, b) {
    s = economicView(s);
    const result = { levels: 0, cost: { coins: 0, materials: 0 } };
    if (!b || !s.buildings.includes(b)) return result;
    if (b.type === 'shrine' || b.type === 'gate') {
      if (!upgradeReason(s, b, true)) { result.levels = 1; result.cost = upgradeCost(b); }
      return result;
    }
    const mapping = new Map(s.buildings.map(n => [n, { ...n }]));
    const shadow = { ...s, buildings: [...mapping.values()] }, target = mapping.get(b);
    while (!upgradeReason(shadow, target, true)) {
      const cost = upgradeCost(target), level = target.level + 1;
      result.levels++; result.cost.coins += cost.coins; result.cost.materials += cost.materials;
      for (const n of target.type === 'gate' ? shadow.buildings.filter(n => n.type === 'gate') : [target]) n.level = level;
      if (target.type === 'gate') shadow.gateLevel = level;
    }
    return result;
  }
  function bulkUpgrade(s, b) {
    s = economicView(s);
    if (b?.type === 'shrine' || b?.type === 'gate') return { ok: false, levels: 0, reason: '仅可单级升级', costspent: { coins: 0, materials: 0 } };
    const options = upgradeOptions(s, b), cost = { coins: 0, materials: 0 };
    let levels = 0, reason = '';
    if (!options.levels) reason = upgradeReason(s, b);
    for (let i = 0; i < options.levels; i++) {
      const nextCost = upgradeCost(b), result = upgrade(s, b);
      if (!result.ok) { reason = result.reason; break; }
      levels++; cost.coins += nextCost.coins; cost.materials += nextCost.materials;
    }
    return { ok: levels > 0, levels, reason, costspent: cost };
  }
  function upgrade(s, b, options = {}) {
    s = economicView(s);
    const reason = upgradeReason(s, b, false, options); if (reason) return { ok: false, reason };
    // Catch up the old infantry before freezing their level at the branch point.
    if(b.type==='barracks')syncSoldierHealth(world(s));
    pay(s, upgradeCost(b));
    const targets = b.type === 'gate' ? s.buildings.filter(n => n.type === 'gate') : [b];
    const level = b.level + 1;
    for (const target of targets) {
      const ratio = target.hp / maxHP(target); target.level = level; target.hp = maxHP(target) * ratio;
    }
    if(b.type==='barracks'){
      if(level===4)b.troopType=options.troopType;
      syncSoldierHealth(world(s));
    }
    if (b.type === 'gate') s.gateLevel = level;
    s.revision++; missions(s); return { ok: true };
  }
  function demolishReason(s, b) {
    s = economicView(s);
    if (!b || !s.buildings.includes(b) || b.type === 'shrine') return '祠堂不可拆除';
    if (b.type === 'gate') return '城门不可拆除';
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return '仅可拆除庄园内建筑';
    if (s.over || s.eliminated) return '该庄园已出局';
    return '';
  }
  function demolish(s, b) {
    s = economicView(s);
    const reason = demolishReason(s, b); if (reason) return { ok: false, reason };
    const cost = b.originCost || buildCost(s, b.type), refund = { coins: Math.floor(cost.coins * .4), materials: Math.floor(cost.materials * .4) };
    s.coins += refund.coins; s.materials += refund.materials; s.buildings = s.buildings.filter(n => n !== b); s.revision++;
    return { ok: true, refund, dryFarms: 0 };
  }
  function income(s, b, buildings) {
    if (s.actorId === undefined && s.players) s = playerView(s, b.owner ?? 0);
    const d = DEFS[b.type]; if (!d.income) return 0;
    let bonus = 0;
    for (const n of buildings || s.buildings) {
      const nd = DEFS[n.type], dist = dist8(n.x, n.y, b.x, b.y);
      if (nd.aura && (!nd.auraResource || nd.auraResource === d.resource)) bonus += nd.aura * auraFactor(n);
      if (n.type === 'well' && b.type === 'farm') bonus += DEFS.well.farmAura * auraFactor(n);
      if (d.radius && dist <= d.radius && isPrereq(d, nd)) bonus += .1 * auraFactor(n);
    }
    return d.income * incomeFactor(b) * (1 + Math.min(2, bonus)) * difficultyEconomy(s);
  }
  const rates = s => economicView(s).buildings.reduce((r, b) => {
    const d = DEFS[b.type];
    r[d.resource === 'materials' ? 'materials' : 'coins'] += income(s, b);
    return r;
  }, { coins: 0, materials: 0 });
  const incomeCache = new WeakMap();
  function settleIncome(s, dt, emitEffects = true) {
    const w = world(s), buildings = w.buildings;
    // Inspect dependencies once, including direct edits that do not bump revision.
    const signature = JSON.stringify([w.mode,w.difficulty,w.players.map(p=>[p.team,p.controller]),buildings.map(b => [b.type, b.x, b.y, b.level, b.owner])]);
    let cached = incomeCache.get(w);
    const sameBuildings = cached?.buildings?.length === buildings.length && buildings.every((b, i) => cached.buildings[i] === b);
    if (!sameBuildings || cached.signature !== signature) {
      const groups = new Map();
      for (const b of buildings) {
        const owner = b.owner;
        if (!groups.has(owner)) groups.set(owner, []);
        groups.get(owner).push(b);
      }
      cached = { signature, buildings: [...buildings], groups, players: new Map() }; incomeCache.set(w, cached);
    }
    const players = s.actorId === undefined ? w.players.filter(p=>!p.eliminated).map(p=>playerView(w,p.id)) : s.eliminated ? [] : [s];
    for (const player of players) {
      const owner = player.actorId;
      const owned = cached.groups.get(owner) || [];
      let values = cached.players.get(owner);
      if (!values) {
        values = owned.map(b => income(player, b, owned)); cached.players.set(owner, values);
      }
      for (const [i, b] of owned.entries()) {
        const d = DEFS[b.type]; if (!d.income) continue;
        b.incomeTime += dt;
        if (d.resource === 'materials') b.materialPending += values[i] * dt;
        else b.coinPending += values[i] * dt;
        if (b.incomeTime < 1 - 1e-8) continue;
        b.incomeTime = Math.max(0, b.incomeTime - 1);
        // Keep fractional resources on each building so floating amounts equal actual payouts.
        for (const [resource, pending] of [['coins', 'coinPending'], ['materials', 'materialPending']]) {
          const paid = Math.floor(b[pending] + 1e-8);
          b[pending] = Math.max(0, b[pending] - paid);
          player[resource] += paid;
          if (emitEffects && paid > 0) player.effects.push({ type: 'income', resource, buildingId: b.id, amount: paid, x: b.x, y: b.y, life: .95, total: .95 });
        }
      }
    }
  }

  const flowCache=new WeakMap(),controllerCache=new WeakMap();
  let controllerFactory=null;
  function setControllerFactory(factory){controllerFactory=factory;}
  function ready(s){return s.players.filter(p=>!p.eliminated&&p.controller==='human').every(p=>!!p.selectedSkill);}
  function tickControllers(s,dt){
    if(!controllerFactory)return;
    let pilots=controllerCache.get(s);if(!pilots){pilots=new Map();controllerCache.set(s,pilots);}
    for(const p of s.players)if(!p.eliminated&&['computer','autoplay'].includes(p.controller)){
      if(!pilots.has(p.id))pilots.set(p.id,controllerFactory(playerView(s,p.id)));
      pilots.get(p.id).tick(dt);
    }
  }
  function buildingGuard(s,b){return Math.min(.65,playerView(s,b.owner).buildings.filter(n=>n.type==='earth'&&Math.hypot(n.x-b.x,n.y-b.y)<=DEFS.earth.range).reduce((v,n)=>v+DEFS.earth.guard*factor(n),0));}
  function defenseBoost(s){return 1+Math.min(1.5,economicView(s).buildings.filter(b=>b.type==='tao').reduce((n,b)=>n+DEFS.tao.powerAura*factor(b),0));}
  const zhongSlow=b=>Math.min(.65,DEFS.zhong.slow+.08*(b.level-1));
  function eliminate(s,owner){
    const p=s.players[owner];if(p.eliminated)return;
    p.eliminated=true;s.buildings=s.buildings.filter(b=>b.owner!==owner);s.soldiers=s.soldiers.filter(u=>u.owner!==owner);
    s.projectiles=s.projectiles.filter(a=>a.owner!==owner);s.revision++;
    event(s,`${p.team===0?'我方':'敌方'}庄园 ${owner+1} 已出局`,'elimination');
  }
  function hurtBuilding(s,b,damage,raw=false){
    s=world(s);if(b.hp<=0||s.players[b.owner].eliminated)return;
    b.lastHit=s.elapsed;b.hp=Math.max(0,b.hp-damage*(raw?1:1-buildingGuard(s,b)));
    if(b.hp>0)return;
    if(b.type==='shrine'){eliminate(s,b.owner);return;}
    if(b.type!=='gate')s.buildings=s.buildings.filter(n=>n.id!==b.id);
    s.revision++;
  }
  function healBuilding(s,b,amount){
    s=world(s);if(s.players[b.owner].eliminated)return;
    if(b.type==='gate'&&b.hp===0&&s.soldiers.some(u=>u.hp>0&&Math.abs(u.x-b.x)<.65&&Math.abs(u.y-b.y)<.65))return;
    b.hp=Math.min(maxHP(b),b.hp+amount);
  }
  function checkResult(s){
    const blue=s.players.some(p=>p.team===0&&!p.eliminated),red=s.players.some(p=>p.team===1&&!p.eliminated);
    if(blue&&red)return;s.over=true;s.result=blue?'victory':red?'defeat':'draw';event(s,{victory:'敌方主城全部攻破！',defeat:'我方主城全部失守',draw:'双方主城同时失守 · 平局'}[s.result],'finished');
  }
  function collectDead(s){
    s.soldiers=s.soldiers.filter(u=>{
      if(u.hp>0&&!s.players[u.owner].eliminated)return true;
      if(u.hp<=0&&Number.isInteger(u.killer)&&hostile(s,u.killer,u.owner)){s.players[u.killer].kills++;s.kills++;}
      return false;
    });
  }
  function damageUnit(u,damage,owner){if(u.hp<=0)return;u.hp-=damage;if(u.hp<=0)u.killer=owner;}
  function recruit(s,dt){
    const counts=s.players.map(()=>0);for(const u of s.soldiers)if(u.hp>0)counts[u.owner]++;
    const index=buildingIndex(s);
    for(const p of s.players){
      if(p.eliminated)continue;const barracks=index.owners[p.id].filter(b=>b.type==='barracks'&&b.hp>0).sort((a,b)=>a.id-b.id);
      if(!barracks.length)continue;
      if(counts[p.id]>=UNIT_CAP){for(const b of barracks)b.production=0;continue;}
      for(const b of barracks)b.production=(b.production||0)+soldierRate(playerView(s,p.id))*dt;
      for(let n=0;n<barracks.length&&counts[p.id]<UNIT_CAP;n++){
        const i=(p.recruitCursor+n)%barracks.length,b=barracks[i];
        if(b.production<1-1e-8)continue;
        b.production=Math.max(0,b.production-1);counts[p.id]++;
        const maxHp=soldierHP(playerView(s,p.id),b);
        s.soldiers.push({id:s.nextId++,owner:p.id,barracksId:b.id,troopType:troopType(b),x:b.x,y:b.y,level:b.level,hp:maxHp,maxHp,baseDamage:soldierBaseDamage(b),attack:0,attackAt:0,
          targetOwner:null,targetId:null,targetBuildingId:null,repelled:0,slowed:0,slowFactor:1,waypoint:null});
        p.nextRecruit=(i+1)%barracks.length;
      }
      if(p.nextRecruit!==undefined){p.recruitCursor=p.nextRecruit;delete p.nextRecruit;}
      if(counts[p.id]>=UNIT_CAP)for(const b of barracks)b.production=0;
    }
  }
  // Static reverse fields are shared by an army. Buildings are attackable obstacles;
  // only retained walls and unbridged water invalidate terrain reachability.
  function flow(s,target){
    const w=world(s),m=map(w),gx=Math.round(target.x),gy=Math.round(target.y),goal=gy*m.width+gx;
    if(!inside(gx,gy,w)||!m.walk[goal])return null;
    let cache=flowCache.get(w);if(!cache){cache=new Map();flowCache.set(w,cache);}if(cache.has(goal))return cache.get(goal);
    const distance=new Int16Array(m.walk.length).fill(-1),next=new Int32Array(m.walk.length).fill(-1),queue=new Int32Array(m.walk.length);
    let head=0,tail=1;queue[0]=goal;distance[goal]=0;next[goal]=goal;
    while(head<tail){const k=queue[head++],x=k%m.width,y=Math.floor(k/m.width);
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const nx=x+dx,ny=y+dy,n=ny*m.width+nx;
        if(nx>=0&&ny>=0&&nx<m.width&&ny<m.height&&m.walk[n]&&distance[n]===-1){distance[n]=distance[k]+1;next[n]=k;queue[tail++]=n;}
      }
    }
    const value={distance,next,goal};if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(goal,value);return value;
  }
  function findPath(s,unit,target){
    const f=flow(s,target),width=worldWidth(s);let k=Math.round(unit.y)*width+Math.round(unit.x);
    if(!f||f.distance[k]<0)return null;const result=[];
    while(k!==f.goal){k=f.next[k];result.push({x:k%width,y:Math.floor(k/width)});}return result;
  }
  const findSoldierPath=findPath;
  function targetEstate(s,u){
    const k=Math.round(u.y)*s.worldSize+Math.round(u.x);let best=null,distance=Infinity;
    for(const p of s.players)if(!p.eliminated&&hostile(s,u.owner,p.id)){
      const shrine=buildingIndex(s).owners[p.id].find(b=>b.type==='shrine'),f=shrine&&flow(s,shrine),d=f?.distance[k];
      if(d>=0&&d<distance){best=shrine;distance=d;}
    }u.targetOwner=best?.owner??null;return best;
  }
  function spatial(s){
    const buckets=new Map(),byId=new Map();
    for(const u of s.soldiers)if(u.hp>0){const key=Math.floor(u.x/3)+','+Math.floor(u.y/3);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(u);byId.set(u.id,u);}
    return {byId,near(x,y,r){const result=[];for(let gy=Math.floor((y-r)/3);gy<=Math.floor((y+r)/3);gy++)for(let gx=Math.floor((x-r)/3);gx<=Math.floor((x+r)/3);gx++)for(const u of buckets.get(gx+','+gy)||[])if(u.hp>0&&Math.hypot(u.x-x,u.y-y)<=r)result.push(u);return result;}};
  }
  function clearSegment(s,u,x,y,allowedBuildingId=null){
    const steps=Math.max(1,Math.ceil(Math.hypot(x-u.x,y-u.y)*8));
    for(let i=1;i<=steps;i++){const tx=Math.round(u.x+(x-u.x)*i/steps),ty=Math.round(u.y+(y-u.y)*i/steps),b=at(s,tx,ty);
      if(!walkable(s,tx,ty)||(b?.hp>0&&b.id!==allowedBuildingId&&hostile(s,u.owner,b.owner)))return false;
    }return true;
  }
  function localChase(s,u,target){
    if(clearSegment(s,u,target.x,target.y))return {x:target.x,y:target.y};
    const width=s.worldSize,start=Math.round(u.y)*width+Math.round(u.x),goal=Math.round(target.y)*width+Math.round(target.x),queue=[start],parents=new Map([[start,start]]);
    for(let i=0;i<queue.length;i++){
      const k=queue[i];if(k===goal){let next=k;while(parents.get(next)!==start&&next!==start)next=parents.get(next);return {x:next%width,y:Math.floor(next/width)};}
      const x=k%width,y=Math.floor(k/width);
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const nx=x+dx,ny=y+dy,n=ny*width+nx,b=at(s,nx,ny);
        if(Math.abs(nx-u.x)>6||Math.abs(ny-u.y)>6||!walkable(s,nx,ny)||parents.has(n)||(b?.hp>0&&hostile(s,u.owner,b.owner)))continue;
        parents.set(n,k);queue.push(n);
      }
    }return null;
  }
  function move(s,u,goal,dt){
    if(!goal)return;
    // First return to the current tile centre when a route changes mid-edge.
    if(!clearSegment(s,u,goal.x,goal.y)){const home={x:Math.round(u.x),y:Math.round(u.y)};if(clearSegment(s,u,home.x,home.y))goal=home;else return;}
    const distance=Math.hypot(goal.x-u.x,goal.y-u.y),stride=Math.min(distance,SOLDIER_SPEED*(u.slowed>0?u.slowFactor:1)*dt);
    if(distance>.0001){u.x+=(goal.x-u.x)/distance*stride;u.y+=(goal.y-u.y)/distance*stride;}
  }
  function combat(s,dt){
    const grid=spatial(s),unitHits=[],buildingHits=[],boost=s.players.map(p=>defenseBoost(playerView(s,p.id))),armyBoost=s.players.map((p,i)=>boost[i]*difficultySoldier(playerView(s,p.id)));
    const projectileTarget=p=>p.targetType==='building'?buildingIndex(s).ids.get(p.targetId):grid.byId.get(p.targetId);
    for(const p of s.projectiles){p.life-=dt;const target=projectileTarget(p);if(target?.hp>0&&!s.players[p.owner].eliminated){p.tx=target.x;p.ty=target.y;if(p.life<=1e-8&&hostile(s,p.owner,target.owner)){if(p.targetType==='building')buildingHits.push([target,p.damage]);else unitHits.push([target,p.damage,p.owner]);}}}
    s.projectiles=s.projectiles.filter(p=>p.life>1e-8&&projectileTarget(p)?.hp>0&&!s.players[p.owner].eliminated);
    function fire(u,target,targetType){
      if(u.attack>0)return;
      u.attack=troopDef(u).interval;u.attackAt=s.elapsed;
      s.projectiles.push({id:s.nextId++,owner:u.owner,sourceId:u.id,type:'archer',targetType,x:u.x,y:u.y,tx:target.x,ty:target.y,targetId:target.id,damage:u.baseDamage*armyBoost[u.owner],life:.3,total:.3});
    }
    for(const b of s.buildings){
      if(b.hp<=0)continue;const d=DEFS[b.type];b.cooldown=Math.max(0,b.cooldown-dt);
      if(b.type==='zhong'&&b.cooldown===0){
        const enemies=s.soldiers.filter(u=>u.hp>0&&hostile(s,b.owner,u.owner));
        if(enemies.length){for(const u of enemies){u.slowed=Math.max(u.slowed,4);u.slowFactor=Math.min(u.slowFactor,1-zhongSlow(b));}b.cooldown=12;s.effects.push({type:'zhong-pulse',x:b.x,y:b.y,life:.8,total:.8});}
      }
      if(!d.damage||b.type==='barracks'||b.cooldown>0)continue;
      const targets=grid.near(b.x,b.y,d.range+(b.level-1)*.35).filter(u=>hostile(s,b.owner,u.owner)).sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y)||a.id-c.id);
      const target=targets[0];if(!target)continue;b.cooldown=d.interval;const damage=d.damage*factor(b)*boost[b.owner];
      if(d.splash){for(const u of grid.near(target.x,target.y,d.splash))if(hostile(s,b.owner,u.owner))unitHits.push([u,damage,b.owner]);}
      else s.projectiles.push({id:s.nextId++,owner:b.owner,type:b.type,x:b.x,y:b.y,tx:target.x,ty:target.y,targetId:target.id,damage,life:.3,total:.3});
    }
    for(const u of s.soldiers){
      if(u.hp<=0)continue;u.attack=Math.max(0,u.attack-dt);u.slowed=Math.max(0,u.slowed-dt);if(!u.slowed)u.slowFactor=1;
      if(u.attack<1e-8)u.attack=0;
      const archer=troopType(u)==='archer',range=troopDef(u).range;
      u.targetBuildingId=null;
      if(u.repelled>0){u.repelled=Math.max(0,u.repelled-dt);continue;}
      let target=grid.byId.get(u.targetId);
      if(!target||target.hp<=0||!hostile(s,u.owner,target.owner)||Math.hypot(target.x-u.x,target.y-u.y)>6)target=null;
      const canShoot=target=>archer&&Math.hypot(target.x-u.x,target.y-u.y)<=range+1e-8&&clearSegment(s,u,target.x,target.y);
      let chase=target&&(canShoot(target)?target:localChase(s,u,target));
      if(!chase){target=null;const nearby=grid.near(u.x,u.y,3).filter(e=>hostile(s,u.owner,e.owner)).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y)||a.id-b.id);
        for(const e of nearby){chase=canShoot(e)?e:localChase(s,u,e);if(chase){target=e;break;}}
      }
      u.targetId=target?.id??null;
      if(target){
        u.waypoint=null;
        if(Math.hypot(target.x-u.x,target.y-u.y)<=range+1e-8&&clearSegment(s,u,target.x,target.y)){if(archer)fire(u,target,'unit');else if(u.attack===0){unitHits.push([target,u.baseDamage*armyBoost[u.owner],u.owner]);u.attack=1;u.attackAt=s.elapsed;}}
        else move(s,u,chase,dt);
        continue;
      }
      let shrine=u.targetOwner!==null&&!s.players[u.targetOwner]?.eliminated?buildingIndex(s).owners[u.targetOwner].find(b=>b.type==='shrine'):null;
      if(!shrine){u.waypoint=null;shrine=targetEstate(s,u);}if(!shrine)continue;
      const f=flow(s,shrine),tile=Math.round(u.y)*s.worldSize+Math.round(u.x);
      if(!f||f.distance[tile]<0){u.targetOwner=null;u.waypoint=null;continue;}
      if(archer){
        let next=tile,obstacle=null;
        for(let step=0;step<6&&next!==f.goal;step++){
          next=f.next[next];const candidate=at(s,next%s.worldSize,Math.floor(next/s.worldSize));
          if(candidate?.hp>0&&hostile(s,u.owner,candidate.owner)){obstacle=candidate;break;}
        }
        if(obstacle&&Math.hypot(obstacle.x-u.x,obstacle.y-u.y)<=range+1e-8&&clearSegment(s,u,obstacle.x,obstacle.y,obstacle.id)){
          u.waypoint=null;u.targetBuildingId=obstacle.id;fire(u,obstacle,'building');continue;
        }
      }
      let goal=u.waypoint;
      if(!goal||Math.hypot(goal.x-u.x,goal.y-u.y)<.001){const next=f.next[tile];goal={x:next%s.worldSize,y:Math.floor(next/s.worldSize)};u.waypoint=goal;}
      const b=at(s,goal.x,goal.y);
      if(b?.hp>0&&hostile(s,u.owner,b.owner)){
        if(Math.hypot(b.x-u.x,b.y-u.y)<=1.05){u.targetBuildingId=b.id;if(u.attack===0){if(archer)fire(u,b,'building');else{buildingHits.push([b,u.baseDamage*armyBoost[u.owner]]);u.attack=1;u.attackAt=s.elapsed;}}}else{
          const dist=Math.hypot(goal.x-u.x,goal.y-u.y),step=Math.min(SOLDIER_SPEED*dt,Math.max(0,dist-1));
          if(step>0)move(s,u,{x:u.x+(goal.x-u.x)/dist*step,y:u.y+(goal.y-u.y)/dist*step},dt);
        }
      }else move(s,u,goal,dt);
    }
    // Resolve attacks together so destruction order does not decide a simultaneous draw.
    for(const [u,damage,owner] of unitHits)damageUnit(u,damage,owner);
    for(const [b,damage] of buildingHits)hurtBuilding(s,b,damage);
    collectDead(s);checkResult(s);
  }
  const skillZoneCache=new WeakMap();
  function inSkillZone(s,owner,u){
    const w=world(s);let zones=skillZoneCache.get(w);if(!zones){zones=[];skillZoneCache.set(w,zones);}
    if(!zones[owner]){const e=map(s).land.estates[owner],zone=new Set([...e.cells,...e.walls]);
      for(const k of [...e.walls,...e.gates.map(g=>g.y*w.worldSize+g.x)])for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++)if(dx*dx+dy*dy<=25){const x=k%w.worldSize+dx,y=Math.floor(k/w.worldSize)+dy;if(inside(x,y,w))zone.add(y*w.worldSize+x);}
      zones[owner]=zone;
    }return zones[owner].has(Math.round(u.y)*w.worldSize+Math.round(u.x));
  }
  function chooseSkill(s,id){s=economicView(s);if(!Object.prototype.hasOwnProperty.call(SKILLS,id)||typeof id!=='string')return {ok:false,reason:'未知神技'};if(s.selectedSkill||s.eliminated||s.over)return {ok:false,reason:'本局神技不可更换'};s.selectedSkill=id;return {ok:true};}
  function skillReason(s,id){s=economicView(s);if(!Object.prototype.hasOwnProperty.call(SKILLS,id)||typeof id!=='string')return '未知神技';if(s.eliminated||s.over)return '该庄园已出局';if(!s.selectedSkill)return '请先选择神技';if(s.selectedSkill!==id)return '未选择此神技';return s.cooldowns[id]>0?'还需 '+Math.ceil(s.cooldowns[id])+' 秒':'';}
  function skill(s,id){
    s=economicView(s);const reason=skillReason(s,id);if(reason)return {ok:false,reason};const w=world(s);s.cooldowns[id]=SKILLS[id].cooldown;
    if(id==='repair')for(const b of s.buildings)healBuilding(w,b,maxHP(b)*.35);
    else for(const u of hostileUnits(s))if(inSkillZone(s,s.actorId,u)){
      if(id==='repel')u.repelled=4;damageUnit(u,id==='repel'?20:240,s.actorId);
      if(id==='thunder')w.effects.push({type:'thunder',x:u.x,y:u.y,life:.7,total:.7});
    }
    const home=estate(s).center;w.effects.push({type:id,x:home.x,y:home.y,life:1,total:1});collectDead(w);return {ok:true};
  }
  function stepEconomy(s,dt,emitEffects=true){s=economicView(s);if(!Number.isFinite(dt)||dt<=0||s.over||s.eliminated)return;dt=Math.min(dt,.25);settleIncome(s,dt,emitEffects);for(const id in s.cooldowns)s.cooldowns[id]=Math.max(0,s.cooldowns[id]-dt);}
  function step(s,dt){
    s=world(s);if(s.over||!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.25);s.elapsed+=dt;s.time=s.elapsed;
    tickControllers(s,dt);settleIncome(s,dt);
    for(const p of s.players)if(!p.eliminated)for(const id in p.cooldowns)p.cooldowns[id]=Math.max(0,p.cooldowns[id]-dt);
    for(const e of s.effects)e.life-=dt;s.effects=s.effects.filter(e=>e.life>0);
    for(const b of [...s.buildings]){
      if(dryFarm(playerView(s,b.owner),b)){hurtBuilding(s,b,maxHP(b)*.05*dt,true);continue;}
      if(s.elapsed-b.lastHit<10-1e-8)continue;
      if(b.type==='gate'&&b.hp===0&&s.soldiers.some(u=>u.hp>0&&hostile(s,b.owner,u.owner)&&Math.hypot(u.x-b.x,u.y-b.y)<=3))continue;
      healBuilding(s,b,maxHP(b)*.02*dt);
    }
    syncSoldierHealth(s);recruit(s,dt);combat(s,dt);missions(s);
  }
  function serialize(s){s=world(s);return JSON.stringify({...s,events:[],effects:[]});}
  function restore(raw){
    try{
      const s=JSON.parse(raw),finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
      if(!s||![9,VERSION].includes(s.version)||!['single','coop'].includes(s.mode)||!(s.mode==='coop'?[2,4,6]:[1,2,3,4]).includes(s.enemyCount)||![0,1,2,3].includes(s.rotation))return null;
      const legacy=s.version===9;s.version=VERSION;
      if(!Object.prototype.hasOwnProperty.call(s,'difficulty'))s.difficulty='beginner';
      if(!Object.prototype.hasOwnProperty.call(DIFFICULTIES,s.difficulty))return null;
      if(!Number.isInteger(s.mapSeed)||s.mapSeed<0||s.mapSeed>4294967295||!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295)return null;
      const [width,height]=Maps.dimensions(s.mode,s.enemyCount),blue=s.mode==='coop'?2:1;
      if(s.worldSize!==(s.rotation%2?height:width)||s.worldHeight!==(s.rotation%2?width:height)||!finite(s.elapsed)||!Number.isInteger(s.nextId)||s.nextId<1||!Number.isInteger(s.revision)||s.revision<0||typeof s.over!=='boolean'||![null,'victory','defeat','draw'].includes(s.result)||!finite(s.kills))return null;
      if(!Array.isArray(s.players)||s.players.length!==blue+s.enemyCount||!Array.isArray(s.buildings)||!Array.isArray(s.soldiers)||!Array.isArray(s.projectiles))return null;
      for(const [i,p] of s.players.entries()){
        if(!p||p.id!==i||p.team!==(i<blue?0:1)||!['human','computer','autoplay'].includes(p.controller)||typeof p.eliminated!=='boolean'||!finite(p.coins)||!finite(p.materials)||!Number.isInteger(p.fortuneBuilt)||p.fortuneBuilt<0||p.fortuneBuilt>10||!Number.isInteger(p.gateLevel)||p.gateLevel<1||p.gateLevel>15||!Number.isInteger(p.mission)||p.mission<0||p.mission>MISSIONS.length||!finite(p.kills)||!Number.isInteger(p.recruitCursor)||p.recruitCursor<0)return null;
        if(p.selectedSkill!==null&&(!Object.prototype.hasOwnProperty.call(SKILLS,p.selectedSkill)||typeof p.selectedSkill!=='string'))return null;
        if(!p.cooldowns||!Object.keys(SKILLS).every(k=>finite(p.cooldowns[k]))||!p.ai||!['clock','activeSeconds','decisions','builds','upgrades','casts'].every(k=>finite(p.ai[k]))||typeof p.ai.armyTurn!=='boolean'||typeof p.ai.lastAction!=='string')return null;
      }
      const ids=new Set(),tiles=new Set(),count=s.players.map(()=>0),shrine=s.players.map(()=>0),owner=n=>Number.isInteger(n)&&n>=0&&n<s.players.length;
      const identity=e=>{if(!e||!Number.isInteger(e.id)||e.id<1||e.id>=s.nextId||ids.has(e.id)||!owner(e.owner))return false;ids.add(e.id);return true;};
      for(const b of s.buildings){
        if(b?.type==='barracks'){
          if(legacy)b.troopType='infantry';
          if(typeof b.troopType!=='string'||!Object.prototype.hasOwnProperty.call(TROOPS,b.troopType)||b.level<4&&b.troopType!=='infantry')return null;
        }
        if(!identity(b)||s.players[b.owner].eliminated||!Object.prototype.hasOwnProperty.call(DEFS,b.type)||!Number.isInteger(b.level)||b.level<1||b.level>maxLevel(b)||!inside(b.x,b.y,s)||ownerAt(s,b.x,b.y)!==b.owner||isWall(s,b.x,b.y)||!finite(b.hp)||b.hp>maxHP(b)+1e-6||(!b.hp&&b.type!=='gate'))return null;
        const key=b.y*s.worldSize+b.x;if(tiles.has(key))return null;tiles.add(key);
        if(!['cooldown','incomeTime','coinPending','materialPending','production'].every(k=>finite(b[k]))||typeof b.lastHit!=='number'||!Number.isFinite(b.lastHit)||b.lastHit>s.elapsed||b.lastHit< -10)return null;
        if(b.type==='shrine')shrine[b.owner]++;
        if(b.type==='gate'&&!map(s).land.estates[b.owner].gates.some(g=>g.x===b.x&&g.y===b.y&&g.direction===b.direction))return null;
      }
      if(s.players.some(p=>shrine[p.id]!==Number(!p.eliminated)))return null;
      for(const u of s.soldiers){
        if(legacy){u.troopType='infantry';u.attackAt=0;u.targetBuildingId=null;}
        if(typeof u?.troopType!=='string'||!Object.prototype.hasOwnProperty.call(TROOPS,u.troopType)||u.troopType==='archer'&&u.level<4)return null;
        if(!identity(u)||s.players[u.owner].eliminated||++count[u.owner]>UNIT_CAP||!finite(u.x)||!finite(u.y)||!walkable(s,Math.round(u.x),Math.round(u.y))||!Number.isInteger(u.level)||u.level<1||u.level>9||!finite(u.hp)||u.hp<=0||!finite(u.maxHp)||u.hp>u.maxHp||!finite(u.baseDamage)||!['attack','repelled','slowed','slowFactor'].every(k=>finite(u[k]))||!Number.isInteger(u.barracksId))return null;
        const nextMax=soldierHP(playerView(s,u.owner),u);if(u.maxHp!==nextMax){u.hp=Math.min(nextMax,nextMax*u.hp/u.maxHp);u.maxHp=nextMax;}u.baseDamage=soldierBaseDamage(u);
        if(!finite(u.attackAt)||u.attackAt>s.elapsed||u.targetBuildingId!==null&&(!Number.isInteger(u.targetBuildingId)||u.targetBuildingId<1))return null;
        if(u.targetOwner!==null&&(!owner(u.targetOwner)||!hostile(s,u.owner,u.targetOwner)))return null;
        if(u.targetId!==null&&(!Number.isInteger(u.targetId)||u.targetId<1))return null;
        if(u.waypoint!==null&&(!u.waypoint||!inside(u.waypoint.x,u.waypoint.y,s)||!walkable(s,u.waypoint.x,u.waypoint.y)))return null;
      }
      for(const p of s.projectiles){
        if(!identity(p)||!['tower','rock','archer'].includes(p.type)||!['x','y','tx','ty','damage','life','total'].every(k=>finite(p[k]))||!Number.isInteger(p.targetId))return null;
        if(p.type==='archer'&&(!['unit','building'].includes(p.targetType)||!Number.isInteger(p.sourceId)||p.sourceId<1))return null;
      }
      const aliveBlue=s.players.some(p=>p.team===0&&!p.eliminated),aliveRed=s.players.some(p=>p.team===1&&!p.eliminated);
      if(s.over!==( !aliveBlue||!aliveRed)||s.result!==(aliveBlue&&aliveRed?null:aliveBlue?'victory':aliveRed?'defeat':'draw'))return null;
      s.phase='day';s.day=1;s.time=s.elapsed;s.events=[];s.effects=[];return s;
    }catch{return null;}
  }
  return {VERSION,UNIT_CAP,SOLDIER_SPEED,TROOPS,troopType,troopDef,DIFFICULTIES,createMatch,createState,createCoopState,playerView,ownerAt,hostile,hostileUnits,inSkillZone,ready,setControllerFactory,
    SIZE,CENTER,worldSize,worldWidth,worldHeight,worldCenter,worldCenterY,estate,owns,isWall,walkable,MAX_LEVEL,SHRINE_MAX_LEVEL,GROWTH,HP_GROWTH,UPGRADE_GROWTH,MATERIAL_COST_FACTOR,ECONOMY_UPGRADE_WAIT,ECONOMY_UPGRADE_GROWTH,SHRINE_REQUIREMENTS,TERRAIN,DEFS,SKILLS,MISSIONS,chains,terrain,dist8,at,adjacent,dryFarm,factor,incomeFactor,auraFactor,hpFactor,maxLevel,shrineLevel,requiredShrineLevel,unlockedBuildingLevel,maxHP,soldierTrainingTime,soldierRate,difficultyModifiers,difficultyEconomy,difficultySoldier,soldierBoost,soldierHP,soldierDamage,soldierPower,findSoldierPath,visualLevel,name,buildCost,fortuneCandidates,grantBuilding,buildReason,buildHints,build,upgradeCost,upgradeReason,upgradeOptions,bulkUpgrade,upgrade,demolishReason,demolish,income,rates,buildingGuard,defenseBoost,zhongSlow,findPath,chooseSkill,skillReason,skill,stepEconomy,step,serialize,restore};
});
