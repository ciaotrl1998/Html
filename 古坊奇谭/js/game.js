/* 古坊奇谭 · independent, deterministic simulation; no network dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SIZE = 25, CENTER = 12, DAY = 72, DUSK = 8, MAX_LEVEL = 9, SHRINE_MAX_LEVEL = 15;
  const worldSize = s => s?.worldSize ?? (s ? 25 : 17);
  const worldCenter = s => Math.floor(worldSize(s) / 2);
  const GROWTH = 2, HP_GROWTH = 1.55, UPGRADE_GROWTH = 2.15;
  const SHRINE_REQUIREMENTS = [0, 1, 2, 3, 5, 7, 9, 11, 13, 15];
  const TERRAIN = { plain: '平地', shore: '水岸', water: '水域', forest: '林地', mountain: '山地' };
  const DEFS = {};
  function def(id, name, cat, cost, hp, extra) { DEFS[id] = { id, name, cat, cost, hp, ...extra }; }
  const chains = [
    ['tea', 'inn', 'bank', '茶肆', '客栈', '钱庄', 'plain', '商', '#d6a450'],
    ['farm', 'mill', 'wine', '农田', '磨坊', '酒坊', 'shore', '农', '#89a663'],
    ['mulberry', 'weaver', 'tailor', '桑园', '织坊', '成衣铺', 'forest', '丝', '#b38ba7'],
    ['quarry', 'kiln', 'trade', '石场', '瓷窑', '商号', 'mountain', '工', '#7b9fa2']
  ];
  // 辐射范围：茶肆/石场链自 1 起，农田/桑园链自 0 起，每段 +1；终极建筑为 4。
  const CHAIN_BASE = [1, 0, 0, 1];
  const COIN_CHAIN_COSTS = [{ coins: 0, materials: 65 }, { coins: 110, materials: 240 }, { coins: 430, materials: 750 }];
  const MATERIAL_CHAIN_COSTS = [{ coins: 95, materials: 0 }, { coins: 290, materials: 70 }, { coins: 920, materials: 300 }];
  chains.forEach((a, ci) => { for (let i = 0; i < 3; i++) {
    const baseCost = (ci < 2 ? COIN_CHAIN_COSTS : MATERIAL_CHAIN_COSTS)[i], high = ci === 0 || ci === 3;
    const costFactor = (high ? 1.5 : 1) * (i === 2 ? (high ? 40 / 9 : 4) : 1);
    def(a[i], a[i + 3], 'economy', { coins: Math.ceil(baseCost.coins * costFactor), materials: Math.ceil(baseCost.materials * costFactor) }, [180, 250, 340][i], {
    income: (high ? [2, 5, 40] : [1, 3, 24])[i], resource: ci < 2 ? 'coins' : 'materials', terrain: i === 0 ? a[6] : null, prev: i ? a[i - 1] : null,
    chain: a[7], color: a[8], end: i === 2, tier: i, radius: CHAIN_BASE[ci] + i, limit: i === 0 ? [6, 8, 8, 6][ci] : i === 1 ? 3 : 1,
    names: [a[i + 3], i === 0 ? ['清茗茶肆', '临水良田', '葱郁桑园', '青石矿场'][ci] : '兴旺' + a[i + 3], '鼎盛' + a[i + 3]]
  }); } });
  def('guild', '汇财会馆', 'economy', { coins: 44572, materials: 66858 }, 600, { income: 240, resource: 'coins', aura: .05, auraResource: 'coins', required: ['bank', 'wine'], radius: 4, limit: 1 });
  def('port', '百工院', 'economy', { coins: 70500, materials: 37500 }, 900, { income: 300, resource: 'materials', aura: .10, auraResource: 'materials', required: ['tailor', 'trade'], radius: 4, limit: 1 });
  def('tower', '箭塔', 'defense', { coins: 95, materials: 70 }, 300, { damage: 22, range: 4, interval: .85, desc: '单体远射 · 射程 4 格' });
  def('rock', '擂石台', 'defense', { coins: 260, materials: 190 }, 380, { damage: 46, range: 3.8, interval: 2.5, splash: 1.35, fortuneOnly: true, desc: '范围轰击 · 仅可由造化匣获得' });
  def('barracks', '兵营', 'defense', { coins: 320, materials: 240 }, 420, { damage: 18, range: 4.5, interval: .8, desc: '自动派出民兵近战' });
  def('well', '水井', 'support', { coins: 120, materials: 65 }, 250, { fortuneOnly: true, desc: '井旁平地可建农田 · 相邻农田收入 +20%' });
  def('stage', '戏台', 'support', { coins: 400, materials: 300 }, 280, { aura: .03, fortuneOnly: true, desc: '全镇收入 +3%' });
  def('shrine', '祠堂', 'temple', { coins: 0, materials: 0 }, 1800, { income: .4, resource: 'coins', desc: '古坊之根 · 决定全坊升级上限', unique: true, upgradeBase: { coins: 120, materials: 90 }, upgradeGrowth: 1.65, names: ['古坊祠堂', '百福祠堂', '万安宗祠'] });
  def('earth', '土地庙', 'temple', { coins: 140, materials: 95 }, 260, { guard: .2, range: 3, fortuneOnly: true, desc: '三格内建筑受到伤害 -20%' });
  def('zhong', '钟馗像', 'temple', { coins: 250, materials: 180 }, 430, { slow: .4, pulseInterval: 12, slowDuration: 4, fortuneOnly: true, desc: '每 12 秒使全体怪物减速 40%，持续 4 秒' });
  def('tao', '道观', 'temple', { coins: 450, materials: 330 }, 380, { powerAura: .15, fortuneOnly: true, desc: '全镇防御建筑攻击 +15%' });
  def('fortune', '造化匣', 'mystery', { coins: 90, materials: 60 }, 1, { desc: '变化为随机建筑' });
  def('gate', '庄园城门', 'defense', { coins: 95, materials: 120 }, 700, { fixed: true, desc: '庄园唯一入口 · 可升级与修复' });
  const ENEMIES = {
    bandit: { name: '山匪', hp: 100, speed: .65, damage: 14, reward: 8 },
    ghost: { name: '阴兵', hp: 220, speed: .42, damage: 23, reward: 12 },
    fox: { name: '妖狐', hp: 75, speed: 1.1, damage: 12, reward: 10 }
  };
  const SKILLS = { repel: { name: '驱鬼符', cooldown: 18 }, repair: { name: '回春诀', cooldown: 24 }, thunder: { name: '九霄天雷', cooldown: 22 } };
  const MISSIONS = [
    { title: '一盏茶，起一座坊', desc: '在平地建造一间茶肆', reward: 60, test: s => s.buildings.some(b => b.type === 'tea') },
    { title: '客来茶香，产业相连', desc: '紧挨茶肆建造客栈', reward: 90, test: s => s.buildings.some(b => b.type === 'inn') },
    { title: '立箭塔，护一方安宁', desc: '建造两座箭塔，准备入夜', reward: 100, test: s => s.buildings.filter(b => b.type === 'tower').length >= 2 },
    { title: '造化初开', desc: '开启一次造化匣', reward: 75, test: s => s.fortuneBuilt >= 1 },
    { title: '长夜过，古坊安', desc: '守住第一夜', reward: 120, test: s => s.day >= 2 },
    { title: '百业初兴', desc: '建成任意两种经济链终点建筑', reward: 200, test: s => new Set(s.buildings.filter(b => DEFS[b.type].end).map(b => b.type)).size >= 2 },
    { title: '四方会聚', desc: '建成一座汇财会馆', reward: 300, test: s => s.buildings.some(b => b.type === 'guild') },
    { title: '万家灯火', desc: '守过第七夜，迎来太平晨光', reward: 500, test: s => s.day >= 8 }
  ];
  function baseTerrain(x, y, s) {
    if (s?.mapSeed !== undefined) return generatedTerrain(s)[y * worldSize(s) + x] || 'plain';
    if ((x >= 1 && x <= 4 && y >= 5 && y <= 12) || (x >= 3 && x <= 6 && y >= 11 && y <= 14)) return 'water';
    if ((x >= 10 && x <= 14 && y >= 2 && y <= 6) || (x >= 2 && x <= 5 && y >= 1 && y <= 3)) return 'forest';
    if (x >= 11 && x <= 15 && y >= 11 && y <= 15) return 'mountain';
    return 'plain';
  }
  const inside = (x, y, s) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < worldSize(s) && y < worldSize(s);
  // 相邻含斜角：切比雪夫距离 1。
  const dist8 = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const NEIGHBORS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const terrainCache = new WeakMap();
  function generatedTerrain(s) {
    const cached = terrainCache.get(s);
    if (cached?.seed === s.mapSeed && cached.size === worldSize(s) && cached.generation === s.mapGeneration) return cached.cells;
    if (s.mapGeneration === 2) return variedTerrain(s);
    if (worldSize(s) === 25) return newTerrain(s);
    const SIZE = 17, CENTER = 8;
    let seed = s.mapSeed >>> 0;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const cells = Array(SIZE * SIZE).fill('plain'), turn = Math.floor(rand() * 4);
    const index = (x, y) => {
      for (let i = 0; i < turn; i++) [x, y] = [SIZE - 1 - y, x];
      return y * SIZE + x;
    };
    // Keep the river inside the boundary so every bank remains reachable on foot.
    let rx = 2 + Math.floor(rand() * 2);
    for (let y = 1; y < SIZE - 1; y++) {
      const next = Math.max(1, Math.min(4, rx + (rand() < .65 ? Math.floor(rand() * 3) - 1 : 0)));
      for (let x = Math.min(rx, next); x <= Math.max(rx, next); x++) cells[index(x, y)] = 'water';
      rx = next;
      if (rand() < .4 && rx < 4) cells[index(rx + 1, y)] = 'water';
    }
    // Grow each lake from a four-connected frontier, separated even diagonally from other water.
    const lakeCount = 1 + Math.floor(rand() * 2);
    for (let lake = 0; lake < lakeCount; lake++) {
      const candidates = [];
      for (let y = 2; y <= 14; y++) for (let x = 10; x <= 14; x++) {
        if (Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER)) <= 3) continue;
        if (NEIGHBORS8.every(([dx, dy]) => cells[index(x + dx, y + dy)] !== 'water') && cells[index(x, y)] !== 'water') candidates.push([x, y]);
      }
      if (!candidates.length) continue;
      const patch = [candidates[Math.floor(rand() * candidates.length)]], own = new Set();
      const target = 5 + Math.floor(rand() * 4); // Leave one tile of room if a lake encloses a dry pocket.
      while (patch.length) {
        const [x, y] = patch.splice(Math.floor(rand() * patch.length), 1)[0], key = index(x, y);
        if (own.has(key) || x < 9 || x > 15 || y < 1 || y > 15 || Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER)) <= 3) continue;
        if (cells[key] === 'water' || NEIGHBORS8.some(([dx, dy]) => cells[index(x + dx, y + dy)] === 'water' && !own.has(index(x + dx, y + dy)))) continue;
        own.add(key); cells[key] = 'water';
        if (own.size >= target) break;
        patch.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      if (own.size < 5) for (const key of own) cells[key] = 'plain';
    }
    // Fill enclosed land pockets so river bends cannot trap walkers on tiny islands.
    const reached = new Set([CENTER * SIZE + CENTER]), queue = [CENTER * SIZE + CENTER];
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i], x = key % SIZE, y = Math.floor(key / SIZE);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, next = ny * SIZE + nx;
        if (inside(nx, ny) && cells[next] !== 'water' && !reached.has(next)) { reached.add(next); queue.push(next); }
      }
    }
    for (let key = 0; key < cells.length; key++) if (!reached.has(key)) cells[key] = 'water';
    // Overlapping noisy ellipses make irregular woodland and mountain contours.
    for (const type of ['forest', 'mountain']) {
      const count = type === 'forest' ? 3 : 2;
      for (let p = 0; p < count; p++) {
        const cx = 2 + rand() * 12, cy = rand() < .5 ? 2 + rand() * 3 : 12 + rand() * 2;
        const ax = 2 + rand() * 1.8, ay = 1.8 + rand() * 1.4;
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const key = index(x, y);
          if (cells[key] !== 'plain' || Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER)) <= 2) continue;
          if (NEIGHBORS8.some(([dx, dy]) => inside(x + dx, y + dy) && cells[index(x + dx, y + dy)] === 'water')) continue;
          if (((x - cx) / ax) ** 2 + ((y - cy) / ay) ** 2 < .8 + rand() * .4) cells[key] = type;
        }
      }
      if (!cells.includes(type)) {
        const candidates = [];
        for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
          const key = index(x, y);
          if (Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER)) > 3 && cells[key] !== 'water' && NEIGHBORS8.every(([dx, dy]) => cells[index(x + dx, y + dy)] !== 'water')) candidates.push(key);
        }
        const key = candidates[Math.floor(rand() * candidates.length)];
        if (key !== undefined) {
          cells[key] = type;
          const x = key % SIZE, y = Math.floor(key / SIZE);
          for (const [dx, dy] of NEIGHBORS8) {
            const nx = x + dx, ny = y + dy;
            if (inside(nx, ny) && Math.max(Math.abs(nx - CENTER), Math.abs(ny - CENTER)) > 2 && cells[ny * SIZE + nx] !== 'water' && NEIGHBORS8.every(([sx, sy]) => !inside(nx + sx, ny + sy) || cells[(ny + sy) * SIZE + nx + sx] !== 'water')) cells[ny * SIZE + nx] = type;
          }
        }
      }
    }
    terrainCache.set(s, { seed: s.mapSeed, size: SIZE, cells });
    return cells;
  }
  function newTerrain(s) {
    let seed = s.mapSeed >>> 0;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const cells = Array(625).fill('plain');
    // A continuous edge river leaves the central core dry before the estate is generated.
    let rx = 7;
    for (let y = 1; y < 24; y++) {
      const next = Math.max(6, Math.min(8, rx + Math.floor(rand() * 3) - 1));
      for (let x = Math.min(rx, next); x <= Math.max(rx, next); x++) cells[y * 25 + x] = 'water';
      rx = next;
    }
    const lakeX = 17 + Math.floor(rand() * 4), lakeY = 2 + Math.floor(rand() * 3);
    const target = 5 + Math.floor(rand() * 5), lake = new Set(), frontier = [[lakeX, lakeY]];
    while (lake.size < target && frontier.length) {
      const [x, y] = frontier.splice(Math.floor(rand() * frontier.length), 1)[0], key = y * 25 + x;
      if (x < 16 || x > 22 || y < 1 || y > 7 || lake.has(key)) continue;
      lake.add(key); cells[key] = 'water';
      frontier.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    for (const [type, anchors] of [['forest', [[10, 9], [16, 8], [4, 18]]], ['mountain', [[14, 15], [17, 16], [21, 12]]]]) {
      for (const [cx, cy] of anchors) {
        const radius = 1.4 + rand() * 1.3;
        for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
          if (!inside(x, y, s) || dist8(x, y, 12, 12) <= 2 || cells[y * 25 + x] !== 'plain') continue;
          if (NEIGHBORS8.some(([dx, dy]) => cells[(y + dy) * 25 + x + dx] === 'water')) continue;
          if (Math.hypot(x - cx, y - cy) < radius + rand() * .5) cells[y * 25 + x] = type;
        }
      }
    }
    terrainCache.set(s, { seed: s.mapSeed, size: 25, cells });
    return cells;
  }
  // Generation is saved separately: existing towns keep their original geography.
  function variedTerrain(s) {
    let seed = s.mapSeed >>> 0;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = n => Math.floor(rand() * n), cells = Array(625).fill('plain'), turn = pick(4);
    const index = (x, y) => {
      for (let i = 0; i < turn; i++) [x, y] = [24 - y, x];
      return y * 25 + x;
    };
    // Random endpoints and bends; rotate the river to any of the four sides.
    // Near the shrine it passes within reach of the estate without flooding its core.
    let rx = 2 + pick(8);
    for (let y = 1; y < 24; y++) {
      const limit = y >= 8 && y <= 16 ? 8 : 9;
      const target = y >= 10 && y <= 14 ? 8 : Math.max(2, Math.min(limit, rx + pick(5) - 2));
      const next = Math.min(limit, target);
      for (let x = Math.min(rx, next); x <= Math.max(rx, next); x++) cells[index(x,y)] = 'water';
      rx = next;
    }
    // Lakes may occur in every quadrant, separate from the river and each other.
    const lakeCount = 1 + pick(3);
    for (let n = 0; n < lakeCount; n++) {
      const candidates = [];
      for (let y = 2; y <= 22; y++) for (let x = 2; x <= 22; x++) {
        if (dist8(x,y,12,12) <= 4 || cells[y*25+x] === 'water') continue;
        if (NEIGHBORS8.every(([dx,dy]) => cells[(y+dy)*25+x+dx] !== 'water')) candidates.push([x,y]);
      }
      if (!candidates.length) break;
      const frontier = [candidates[pick(candidates.length)]], lake = new Set(), target = 5 + pick(5);
      while (frontier.length && lake.size < target) {
        const [x,y] = frontier.splice(pick(frontier.length),1)[0], key = y*25+x;
        if (x<1 || x>23 || y<1 || y>23 || dist8(x,y,12,12)<=3 || lake.has(key) || cells[key]==='water') continue;
        if (NEIGHBORS8.some(([dx,dy]) => cells[(y+dy)*25+x+dx]==='water' && !lake.has((y+dy)*25+x+dx))) continue;
        lake.add(key); cells[key]='water';
        frontier.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);
      }
      if (lake.size<5) for (const key of lake) cells[key]='plain';
    }
    // Fill tiny dry pockets enclosed by bends, preserving a connected land mass.
    const reached = new Set([312]), queue = [312];
    for (let i=0;i<queue.length;i++) {
      const x=queue[i]%25,y=Math.floor(queue[i]/25);
      for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const nx=x+dx,ny=y+dy,key=ny*25+nx;
        if (inside(nx,ny,s) && cells[key]!=='water' && !reached.has(key)) {reached.add(key);queue.push(key);}
      }
    }
    for (let key=0;key<625;key++) if (!reached.has(key)) cells[key]='water';
    const dry = (x,y) => inside(x,y,s) && dist8(x,y,12,12)>2 && cells[y*25+x]==='plain' && NEIGHBORS8.every(([dx,dy]) => !inside(x+dx,y+dy,s) || cells[(y+dy)*25+x+dx]!=='water');
    // Guarantee both resource terrains in the shared buildable ring, at random sites.
    const anchors = [];
    for (const type of ['forest','mountain']) {
      const candidates = [];
      for (let y=9;y<=15;y++) for (let x=9;x<=15;x++) if (dry(x,y)) candidates.push([x,y]);
      const [x,y] = candidates[pick(candidates.length)]; cells[y*25+x]=type;
      anchors.push({type,x,y});
    }
    for (const type of ['forest','mountain']) {
      const anchor=anchors.find(a=>a.type===type), patches=[anchor];
      for(let i=0,n=2+pick(3);i<n;i++) patches.push({x:2+pick(21),y:2+pick(21)});
      for (const {x:cx,y:cy} of patches) {
        const ax=1.5+rand()*2.5,ay=1.5+rand()*2.5;
        for (let y=Math.max(0,cy-4);y<=Math.min(24,cy+4);y++) for (let x=Math.max(0,cx-4);x<=Math.min(24,cx+4);x++) {
          if (dry(x,y) && ((x-cx)/ax)**2+((y-cy)/ay)**2<.7+rand()*.6) cells[y*25+x]=type;
        }
      }
    }
    terrainCache.set(s,{seed:s.mapSeed,size:25,generation:s.mapGeneration,cells});
    return cells;
  }
  const estateCache = new WeakMap();
  function estate(s) {
    if (s?.estateSeed === undefined) return null;
    const cached = estateCache.get(s);
    if (cached?.seed === s.estateSeed && cached.mapSeed === s.mapSeed && cached.generation === s.mapGeneration) return cached.value;
    generatedTerrain(s);
    let seed = s.estateSeed >>> 0;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const size = worldSize(s), center = worldCenter(s), cells = new Set(), walls = new Set(), roads = new Set(), rows = [];
    let top = 6, bottom = 18;
    if (s.mapGeneration === 2) {
      top=6+Math.floor(rand()*3);bottom=16+Math.floor(rand()*3);
      const west=6+Math.floor(rand()*3),east=16+Math.floor(rand()*3);
      const shape=Math.floor(rand()*3),corners=Array.from({length:4},()=>Math.floor(rand()*4));
      for(let y=top;y<=bottom;y++) {
        const upper=y<=12,t=Math.abs(y-12)/(upper?12-top:bottom-12);
        const profile=shape===0?t:shape===1?t*t:Math.max(0,t-.5)*2;
        rows[y]=[Math.min(9,west+Math.floor(profile*corners[upper?0:2])),Math.max(15,east-Math.floor(profile*corners[upper?1:3]))];
      }
    } else {
    let left = 10, right = 14;
    for (let y = 6; y <= 12; y++) {
      left = Math.min(left, 6 + Math.floor((12 - y) / 2) + Math.floor(rand() * 2));
      right = Math.max(right, 18 - Math.floor((12 - y) / 2) - Math.floor(rand() * 2));
      rows[y] = [left, right];
    }
    for (let y = 13; y <= 18; y++) {
      left = Math.max(left, 6 + Math.floor((y - 12) / 2) + Math.floor(rand() * 2));
      right = Math.min(right, 18 - Math.floor((y - 12) / 2) - Math.floor(rand() * 2));
      rows[y] = [left, right];
    }
    }
    for (let y = top; y <= bottom; y++) for (let x = rows[y][0]; x <= rows[y][1]; x++) cells.add(y * size + x);
    for (const key of cells) for (const [dx, dy] of NEIGHBORS8) {
      const next = key + dy * size + dx;
      if (!cells.has(next)) walls.add(next);
    }
    const gates = [{ x: center, y: top - 1, direction: 0 }, { x: rows[12][1] + 1, y: center, direction: 1 },
      { x: center, y: bottom + 1, direction: 2 }, { x: rows[12][0] - 1, y: center, direction: 3 }];
    for (const g of gates) walls.delete(g.y * size + g.x);
    // Only the four gate roads may cross water; other water stays unobstructed.
    const root = center * size + center, parents = new Map([[root, null]]), queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i];
      for (const offset of [-size, 1, size, -1]) {
        const next = key + offset;
        if (cells.has(next) && !parents.has(next)) { parents.set(next, key); queue.push(next); }
      }
    }
    const connect = key => {
      while (key !== null) {
        roads.add(key);
        key = parents.get(key) ?? null;
      }
    };
    for (const [i, g] of gates.entries()) {
      const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][i];
      connect((g.y - dy) * size + g.x - dx);
      for (let x = g.x, y = g.y; inside(x, y, s); x += dx, y += dy) roads.add(y * size + x);
    }
    const value = { cells, walls, gates, roads };
    estateCache.set(s, { seed: s.estateSeed, mapSeed: s.mapSeed, generation:s.mapGeneration, value });
    return value;
  }
  function owns(s, x, y) {
    if (!inside(x, y, s)) return false;
    const land = estate(s), key = y * worldSize(s) + x;
    return !land || land.cells.has(key) || land.walls.has(key) || land.gates.some(g => g.x === x && g.y === y);
  }
  function isWall(s, x, y) { return inside(x, y, s) && !!estate(s)?.walls.has(y * worldSize(s) + x); }
  function walkable(s, x, y) {
    if (!inside(x, y, s) || isWall(s, x, y)) return false;
    return terrain(x, y, s) !== 'water' || !!estate(s)?.roads.has(y * worldSize(s) + x);
  }
  function terrain(x, y, s) {
    if (!inside(x, y, s)) return 'plain';
    const base = baseTerrain(x, y, s);
    return base === 'plain' && NEIGHBORS8.some(([dx, dy]) => inside(x + dx, y + dy, s) && baseTerrain(x + dx, y + dy, s) === 'water') ? 'shore' : base;
  }
  const at = (s, x, y) => s.buildings.find(b => b.x === x && b.y === y);
  const adjacent = (s, x, y) => s.buildings.filter(b => dist8(b.x, b.y, x, y) === 1);
  const dryFarm = (s, b) => b.type === 'farm' && terrain(b.x, b.y, s) !== 'shore' && !adjacent(s, b.x, b.y).some(n => n.type === 'well');
  const isPrereq = (d, nd) => d.chain ? nd.id === d.prev : !!d.required?.includes(nd.id);
  const RETIRED_TYPES = new Set(['home', 'market', 'fence']);
  const factor = b => Math.pow(GROWTH, b.level - 1);
  const incomeFactor = b => b.type === 'shrine' ? Math.pow(2, Math.min(2, b.level - 1)) * (1 + .25 * Math.max(0, b.level - 3)) : Math.pow(2, Math.min(2, b.level - 1)) * Math.pow(1.65, Math.max(0, b.level - 3));
  const auraFactor = b => Math.pow(2, Math.min(2, b.level - 1)) * (1 + .2 * Math.max(0, b.level - 3));
  const hpFactor = b => Math.pow(HP_GROWTH, b.level - 1);
  const maxLevel = b => b?.type === 'shrine' ? SHRINE_MAX_LEVEL : MAX_LEVEL;
  const shrineLevel = s => s.buildings.find(b => b.type === 'shrine')?.level || 0;
  const requiredShrineLevel = level => SHRINE_REQUIREMENTS[Math.min(MAX_LEVEL, Math.max(1, level))];
  const unlockedBuildingLevel = s => {
    const level = shrineLevel(s); let unlocked = 1;
    for (let target = 2; target <= MAX_LEVEL; target++) if (level >= requiredShrineLevel(target)) unlocked = target;
    return unlocked;
  };
  const maxHP = b => Math.round(DEFS[b.type].hp * hpFactor(b));
  const visualLevel = level => Math.min(3, Math.floor((level - 1) / 3) + 1);
  const name = b => DEFS[b.type].names?.[visualLevel(b.level) - 1] || (visualLevel(b.level) === 1 ? DEFS[b.type].name : (visualLevel(b.level) === 2 ? '兴盛' : '鼎盛') + DEFS[b.type].name);
  function addBuilding(s, type, x, y, level = 1, extra = {}) {
    const b = { id: s.nextId++, type, x, y, level, hp: Math.round(DEFS[type].hp * Math.pow(HP_GROWTH, level - 1)), cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0, ...extra };
    s.buildings.push(b); s.revision++; return b;
  }
  function grantBuilding(s, type, x, y, level = unlockedBuildingLevel(s), originCost) {
    if (!DEFS[type] || type === 'fortune' || DEFS[type].unique || DEFS[type].fixed || !owns(s, x, y) || isWall(s, x, y) || estate(s)?.gates.some(g => g.x === x && g.y === y) || terrain(x, y, s) === 'water' || at(s, x, y)) return null;
    return addBuilding(s, type, x, y, Math.min(level, maxLevel({ type })), originCost ? { originCost } : {});
  }
  function createState(mapSeed = Math.floor(Math.random() * 4294967296), mapGeneration = 2) {
    const s = { version: mapSeed === null ? 4 : 5, worldSize: mapSeed === null ? 17 : 25, seed: 73193, nextId: 1, coins: 200, materials: mapSeed === null ? 120 : 220, fortuneBuilt: 0, day: 1, phase: 'day', time: 0, elapsed: 0, repairTime: 0,
      direction: 0, buildings: [], enemies: [], projectiles: [], effects: [], events: [], kills: 0, wave: null,
      cooldowns: { repel: 0, repair: 0, thunder: 0 }, mission: 0, revision: 0, over: false, celebrated: false };
    if (mapSeed !== null) { s.mapSeed = mapSeed >>> 0; s.estateSeed = (Math.imul(s.mapSeed, 2246822519) ^ 3266489917) >>> 0; s.gateLevel = 1; }
    if (mapSeed !== null && mapGeneration === 2) s.mapGeneration = 2;
    const center = worldCenter(s);
    addBuilding(s, 'shrine', center, center);
    for (const g of estate(s)?.gates || []) addBuilding(s, 'gate', g.x, g.y, 1, { direction: g.direction });
    return s;
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
    if (type !== 'fortune') return DEFS[type]?.cost || { coins: 0, materials: 0 };
    const multiple = Math.pow(1.8, s.fortuneBuilt || 0);
    return { coins: Math.ceil(DEFS.fortune.cost.coins * multiple), materials: Math.ceil(DEFS.fortune.cost.materials * multiple) };
  }
  function fortuneCandidates(s, x, y) {
    if (!owns(s, x, y) || isWall(s, x, y) || estate(s)?.gates.some(g => g.x === x && g.y === y) || at(s, x, y) || terrain(x, y, s) === 'water') return [];
    const plot = terrain(x, y, s);
    return Object.values(DEFS).filter(d => {
      if (d.id === 'fortune' || d.unique || d.fixed || d.income || (d.limit && s.buildings.filter(b => b.type === d.id).length >= d.limit)) return false;
      if (d.cat === 'economy' && plot === 'forest' && d.id !== 'mulberry') return false;
      if (d.cat === 'economy' && plot === 'mountain' && d.id !== 'quarry') return false;
      if (d.id === 'farm' && plot !== 'shore' && !(plot === 'plain' && adjacent(s, x, y).some(b => b.type === 'well'))) return false;
      if (d.id !== 'farm' && d.terrain && plot !== d.terrain) return false;
      return true;
    });
  }
  function buildReason(s, type, x, y) {
    const d = DEFS[type];
    if (!d) return '未知建筑';
    if (s.over) return '古坊已失守';
    if (!owns(s, x, y) || isWall(s, x, y)) return '请选择庄园内地块';
    if (at(s, x, y)) return '此地已有建筑';
    if (estate(s)?.gates.some(g => g.x === x && g.y === y)) return '城门地块不可建造';
    const plot = terrain(x, y, s);
    if (plot === 'water') return '水域不可建造';
    if (d.fixed) return '城门仅可由庄园生成';
    if (s.enemies.some(e => Math.hypot(e.x - x, e.y - y) < .65)) return '敌人正在此地';
    if (d.unique) return '祠堂仅此一座';
    if (d.fortuneOnly) return '仅可由造化匣获得';
    if (type === 'fortune') return fortuneCandidates(s, x, y).length ? shortage(s, buildCost(s, type)) : '此地无可造化建筑';
    if (d.limit && s.buildings.filter(b => b.type === type).length >= d.limit) return '已达上限（' + d.limit + '座）';
    if (d.cat === 'economy' && plot === 'forest' && type !== 'mulberry') return '林地仅可建桑园';
    if (d.cat === 'economy' && plot === 'mountain' && type !== 'quarry') return '山地仅可建石场';
    if (type === 'farm') {
      if (plot !== 'shore' && !(plot === 'plain' && adjacent(s, x, y).some(b => b.type === 'well'))) return '需水岸或水井旁平地';
    } else if (d.terrain && plot !== d.terrain) return '需' + TERRAIN[d.terrain];
    if (d.radius && s.buildings.some(b => b.type === type && dist8(b.x, b.y, x, y) <= d.radius)) return '范围内已有相同建筑';
    if (d.prev && !adjacent(s, x, y).some(b => b.type === d.prev)) return '需紧挨' + DEFS[d.prev].name;
    if (d.required) {
      const nearby = new Set(adjacent(s, x, y).map(b => b.type));
      const missing = d.required.filter(id => !nearby.has(id));
      if (missing.length) return '需紧邻' + missing.map(id => DEFS[id].name).join('、');
    }
    return shortage(s, buildCost(s, type));
  }
  function event(s, text, kind = 'info') { s.events.push({ text, kind }); if (s.events.length > 30) s.events.shift(); }
  function missions(s) {
    while (MISSIONS[s.mission]?.test(s)) { const m = MISSIONS[s.mission++]; s.coins += m.reward; event(s, '坊志达成：' + m.title + ' · +' + m.reward + ' 铜钱', 'reward'); }
  }
  function build(s, type, x, y) {
    const reason = buildReason(s, type, x, y); if (reason) return { ok: false, reason };
    const cost = buildCost(s, type); pay(s, cost);
    if (type === 'fortune') {
      const candidates = fortuneCandidates(s, x, y), rolled = candidates[Math.floor(random(s) * candidates.length)], level = unlockedBuildingLevel(s);
      s.fortuneBuilt++; const b = grantBuilding(s, rolled.id, x, y, level, cost);
      event(s, '造化匣化为' + rolled.name + ' Lv' + level, 'reward'); missions(s); return { ok: true, building: b, rolled: rolled.id };
    }
    const b = addBuilding(s, type, x, y); missions(s); return { ok: true, building: b };
  }
  function upgradeCost(b) {
    const d = DEFS[b.type], base = d.upgradeBase || d.cost, multiple = 1.8 * Math.pow(d.upgradeGrowth || UPGRADE_GROWTH, b.level - 1) * Math.pow(b.type === 'shrine' ? 1.08 : d.income ? 1.12 : 1, Math.max(0, b.level - (b.type === 'shrine' ? 7 : 4)));
    return { coins: Math.ceil(base.coins * multiple), materials: Math.ceil(base.materials * multiple) };
  }
  function upgradeReason(s, b) {
    if (!b || !s.buildings.includes(b)) return '建筑已不存在';
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return '仅可升级庄园内建筑';
    if (s.over) return '古坊已失守';
    const d = DEFS[b.type]; if (b.level >= maxLevel(b)) return '已达最高等级';
    if (b.type !== 'shrine') {
      const required = requiredShrineLevel(b.level + 1), current = shrineLevel(s);
      if (current < required) return '需祠堂 Lv' + required + '（当前 Lv' + current + '）';
    }
    if (d.prev && !adjacent(s, b.x, b.y).some(n => n.type === d.prev && n.level >= b.level + 1)) return '需邻' + DEFS[d.prev].name + ' Lv' + (b.level + 1);
    if (d.required) for (const id of d.required) if (!adjacent(s, b.x, b.y).some(n => n.type === id && n.level >= b.level + 1)) return '需邻' + DEFS[id].name + ' Lv' + (b.level + 1);
    return shortage(s, upgradeCost(b));
  }
  function upgrade(s, b) {
    const reason = upgradeReason(s, b); if (reason) return { ok: false, reason };
    pay(s, upgradeCost(b));
    const targets = b.type === 'gate' ? s.buildings.filter(n => n.type === 'gate') : [b];
    const level = b.level + 1;
    for (const target of targets) {
      const ratio = target.hp / maxHP(target); target.level = level; target.hp = maxHP(target) * ratio;
    }
    if (b.type === 'gate') s.gateLevel = level;
    s.revision++; missions(s); return { ok: true };
  }
  function demolishReason(s, b) {
    if (!b || !s.buildings.includes(b) || b.type === 'shrine') return '祠堂不可拆除';
    if (b.type === 'gate') return '城门不可拆除';
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return '仅可拆除庄园内建筑';
    if (s.over) return '古坊已失守';
    return '';
  }
  function demolish(s, b) {
    const reason = demolishReason(s, b); if (reason) return { ok: false, reason };
    const cost = b.originCost || DEFS[b.type].cost, refund = { coins: Math.floor(cost.coins * .4), materials: Math.floor(cost.materials * .4) };
    s.coins += refund.coins; s.materials += refund.materials; s.buildings = s.buildings.filter(n => n !== b); s.revision++;
    const dryFarms = b.type === 'well' ? s.buildings.filter(n => n.type === 'farm' && dist8(n.x, n.y, b.x, b.y) === 1 && dryFarm(s, n)).length : 0;
    return { ok: true, refund, dryFarms };
  }
  function income(s, b) {
    const d = DEFS[b.type]; if (!d.income) return 0;
    let bonus = 0;
    for (const n of s.buildings) {
      const nd = DEFS[n.type], dist = dist8(n.x, n.y, b.x, b.y);
      if (nd.aura && (!nd.auraResource || nd.auraResource === d.resource)) bonus += nd.aura * auraFactor(n);
      if (n.type === 'well' && dist === 1 && b.type === 'farm') bonus += .2 * auraFactor(n);
      if (d.radius && dist <= d.radius && isPrereq(d, nd)) bonus += .1 * auraFactor(n);
    }
    return d.income * incomeFactor(b) * (1 + Math.min(2, bonus)) * (s.day % 7 === 0 ? 1.25 : 1);
  }
  const rates = s => s.buildings.reduce((r, b) => {
    const d = DEFS[b.type];
    r[d.resource === 'materials' ? 'materials' : 'coins'] += income(s, b);
    return r;
  }, { coins: 0, materials: 0 });
  function settleIncome(s, dt) {
    for (const b of s.buildings) {
      const d = DEFS[b.type]; if (!d.income) continue;
      b.incomeTime += dt;
      if (d.resource === 'materials') b.materialPending += income(s, b) * dt;
      else b.coinPending += income(s, b) * dt;
      if (b.incomeTime < 1 - 1e-8) continue;
      b.incomeTime = Math.max(0, b.incomeTime - 1);
      // Keep fractional resources on each building so floating amounts equal actual payouts.
      for (const [resource, pending] of [['coins', 'coinPending'], ['materials', 'materialPending']]) {
        const paid = Math.floor(b[pending] + 1e-8);
        b[pending] = Math.max(0, b[pending] - paid);
        s[resource] += paid;
        if (paid > 0) s.effects.push({ type: 'income', resource, buildingId: b.id, amount: paid, x: b.x, y: b.y, life: .95, total: .95 });
      }
    }
  }
  function dusk(s) { s.phase = 'dusk'; s.time = 0; s.direction = Math.floor(random(s) * 4); event(s, '暮色将至 · 今夜来敌在' + ['北', '东', '南', '西'][s.direction] + '方', 'warning'); }
  function startNight(s) {
    s.phase = 'night'; s.time = 0; const boss = s.day % 7 === 0;
    const opening = Math.min(1, .5 + .5 * (s.day - 1) / 9);
    s.wave = { total: Math.ceil(Math.min(120, 7 + s.day * 3 + Math.floor(s.day / 3) * 2 + (boss ? 12 : 0)) * opening), spawned: 0, timer: .35, boss };
    event(s, boss ? '百鬼夜行！妖将与群妖从四方来袭' : '入夜了 · 守住祠堂，灯火不熄', 'warning');
  }
  function dawn(s) {
    s.day++; s.phase = 'day'; s.time = 0; s.wave = null; s.enemies = []; s.projectiles = []; s.repairTime = 0;
    const reward = 40 + s.day * 8; s.coins += reward; event(s, '平安入晓 · 守夜赏钱 +' + reward, 'reward');
    if (s.day % 7 === 0) { s.coins += 180; event(s, '上元灯会 · 收入 +25%，获赠 180 铜钱', 'reward'); }
    if (s.day === 8 && !s.celebrated) { s.celebrated = true; event(s, '七夜长明！古坊立稳根基，可继续经营抵御更强来敌', 'victory'); }
    missions(s);
  }
  function spawnEnemy(s) {
    const w = s.wave, i = w.spawned++, dir = w.boss ? i % 4 : s.direction;
    const SIZE = worldSize(s), pos = 3 + Math.floor(random(s) * (SIZE - 6));
    const gate = estate(s)?.gates[dir];
    const p = [[gate?.x ?? pos, 0], [SIZE - 1, gate?.y ?? pos], [gate?.x ?? pos, SIZE - 1], [0, gate?.y ?? pos]][dir];
    const type = s.day >= 5 && i % 4 === 2 ? 'fox' : s.day >= 4 && i % 3 === 1 ? 'ghost' : 'bandit';
    const opening = Math.min(1, (s.day - 1) / 9);
    const d = ENEMIES[type], boss = w.boss && i === w.total - 1, late = Math.max(0, s.day - 14), scale = (.45 + .55 * opening) * Math.pow(1.23, Math.min(13, s.day - 1)) * Math.pow(1.24, Math.min(7, late)) * Math.pow(1.18, Math.max(0, late - 7)) * (1 + .08 * late);
    s.enemies.push({ id: s.nextId++, type, x: p[0], y: p[1], hp: d.hp * scale * (boss ? 4.5 : 1), maxHp: d.hp * scale * (boss ? 4.5 : 1),
      damage: d.damage * (.3 + .7 * opening) * Math.pow(1.12, Math.min(13, s.day - 1)) * Math.pow(1.15, Math.min(7, late)) * Math.pow(1.12, Math.max(0, late - 7)) * (1 + .04 * late) * (boss ? 2 : 1), speed: d.speed * Math.min(1.22, Math.pow(1.012, s.day - 1)), attack: 0, repelled: 0, slowed: 0, slowFactor: 1, boss, path: [], pathRevision: -1 });
  }
  // Breadth-first search selects the shortest route to the shrine, regardless of building durability.
  function findPath(s, e) {
    const SIZE = worldSize(s);
    const base = s.buildings.find(b => b.type === 'shrine'); if (!base) return [];
    const startX = Math.max(0, Math.min(SIZE - 1, Math.round(e.x))), startY = Math.max(0, Math.min(SIZE - 1, Math.round(e.y)));
    const start = startY * SIZE + startX, goal = base.y * SIZE + base.x, prev = Array(SIZE * SIZE).fill(-1), queue = [start]; prev[start] = start;
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]; if (current === goal) break;
      const x = current % SIZE, y = Math.floor(current / SIZE);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!walkable(s, nx, ny)) continue; const next = ny * SIZE + nx;
        if (prev[next] !== -1) continue;
        prev[next] = current; queue.push(next);
      }
    }
    if (prev[goal] === -1) return [];
    const path = []; let n = goal; while (n !== start && n !== -1) { path.unshift({ x: n % SIZE, y: Math.floor(n / SIZE) }); n = prev[n]; }
    // Return to the nearest grid center before turning after a route invalidation.
    if (Math.hypot(e.x - startX, e.y - startY) > .03) path.unshift({ x: startX, y: startY });
    return path;
  }
  function buildingGuard(s, b) {
    let guard = 0;
    for (const n of s.buildings) if (n.type === 'earth' && Math.hypot(n.x - b.x, n.y - b.y) <= DEFS.earth.range) guard += DEFS.earth.guard * factor(n);
    return Math.min(.65, guard);
  }
  function defenseBoost(s) {
    let boost = 0;
    for (const b of s.buildings) if (b.type === 'tao') boost += DEFS.tao.powerAura * factor(b);
    return 1 + Math.min(1.5, boost);
  }
  const zhongSlow = b => Math.min(.65, DEFS.zhong.slow + .08 * (b.level - 1));
  function hurtBuilding(s, b, damage, raw = false) {
    if (b.hp <= 0 || isWall(s, b.x, b.y)) return;
    b.hp -= damage * (raw ? 1 : 1 - buildingGuard(s, b));
    if (b.hp > 0) return;
    if (b.type === 'gate') b.hp = 0;
    else s.buildings = s.buildings.filter(n => n !== b);
    s.revision++;
    event(s, DEFS[b.type].name + '被摧毁', 'warning');
    if (b.type === 'shrine') { s.over = true; event(s, '祠堂失守，古坊灯火暂熄', 'defeat'); }
  }
  function healBuilding(s, b, amount) {
    if (b.type === 'gate' && b.hp === 0) {
      // Delay resurrection while an enemy overlaps the gate or crosses into its tile.
      if (s.enemies.some(e => e.hp > 0 && Math.abs(e.x - b.x) < 1 && Math.abs(e.y - b.y) < 1)) return;
      s.revision++;
      for (const e of s.enemies) { e.path = []; e.pathRevision = -1; }
    }
    b.hp = Math.min(maxHP(b), b.hp + amount);
  }
  function collectDead(s) {
    s.enemies = s.enemies.filter(e => {
      if (e.hp > 0) return true;
      s.coins += ENEMIES[e.type].reward * (e.boss ? 5 : 1); s.kills++;
      s.effects.push({ type: 'coin', amount: ENEMIES[e.type].reward * (e.boss ? 5 : 1), x: e.x, y: e.y, life: .7, total: .7 }); return false;
    });
  }
  function combat(s, dt) {
    const w = s.wave; if (!w) return;
    w.timer -= dt;
    if (w.spawned < w.total && w.timer <= 0) { spawnEnemy(s); w.timer += Math.max(.28, 1.35 - s.day * .045); }
    for (const b of s.buildings) if (b.type === 'zhong') {
      b.cooldown -= dt;
      if (b.cooldown <= 0 && s.enemies.length) {
        b.cooldown += DEFS.zhong.pulseInterval;
        const slowFactor = 1 - zhongSlow(b);
        for (const e of s.enemies) { e.slowed = Math.max(e.slowed || 0, DEFS.zhong.slowDuration); e.slowFactor = Math.min(e.slowFactor || 1, slowFactor); }
        s.effects.push({ type: 'zhong-pulse', x: b.x, y: b.y, life: .8, total: .8 });
      }
    }
    for (const b of s.buildings) {
      const d = DEFS[b.type]; if (!d.damage) continue;
      b.cooldown -= dt;
      const range = d.range + (b.level - 1) * .35;
      const enemies = s.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - b.x, e.y - b.y) <= range).sort((a, z) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(z.x - b.x, z.y - b.y));
      const target = enemies[0];
      if (b.type === 'barracks') {
        b.soldier ||= { x: b.x, y: b.y };
        const dest = target || b, dist = Math.hypot(dest.x - b.soldier.x, dest.y - b.soldier.y), step = Math.min(dist, dt * 2.2);
        if (dist) { b.soldier.x += (dest.x - b.soldier.x) / dist * step; b.soldier.y += (dest.y - b.soldier.y) / dist * step; }
        if (!target || dist > .65) continue;
      }
      if (target && b.cooldown <= 0) {
        b.cooldown = d.interval; const damage = d.damage * factor(b) * defenseBoost(s);
        if (d.splash) for (const e of s.enemies) { if (Math.hypot(e.x - target.x, e.y - target.y) <= d.splash) e.hp -= damage * (e.type === 'fox' ? 1.3 : 1); }
        else target.hp -= damage * (b.type === 'barracks' && target.type === 'fox' ? 1.5 : 1);
        s.projectiles.push({ x: b.type === 'barracks' ? b.soldier.x : b.x, y: b.type === 'barracks' ? b.soldier.y : b.y, tx: target.x, ty: target.y, type: b.type, life: .3, total: .3 });
      }
    }
    collectDead(s);
    for (const e of s.enemies) {
      if (s.over) break;
      e.attack = Math.max(0, e.attack - dt);
      e.slowed = Math.max(0, (e.slowed || 0) - dt);
      if (e.slowed === 0) e.slowFactor = 1;
      if (e.repelled > 0) { e.repelled -= dt; continue; }
      if (e.pathRevision !== s.revision || !e.path.length) { e.path = findPath(s, e); e.pathRevision = s.revision; }
      const p = e.path[0]; if (!p) continue;
      const b = at(s, p.x, p.y), dist = Math.hypot(p.x - e.x, p.y - e.y);
      if (b && b.hp > 0 && dist <= 1.05) {
        if (e.attack === 0) { hurtBuilding(s, b, e.damage); e.attack = 1; s.effects.push({ type: 'hit', x: b.x, y: b.y, life: .2, total: .2 }); }
        continue;
      }
      const slow = e.slowed > 0 ? e.slowFactor : 1;
      const step = Math.min(dist, e.speed * dt * slow);
      if (dist > .001) { e.x += (p.x - e.x) / dist * step; e.y += (p.y - e.y) / dist * step; }
      if (dist <= step + .001) e.path.shift();
    }
    if (!s.over && w.spawned >= w.total && !s.enemies.length) dawn(s);
  }
  function skillReason(s, id) {
    const d = SKILLS[id]; if (!d) return '未知神技';
    if (s.over || s.phase !== 'night') return '神技仅在夜晚使用';
    if (s.cooldowns[id] > 0) return '还需 ' + Math.ceil(s.cooldowns[id]) + ' 秒';
    return '';
  }
  function skill(s, id) {
    const reason = skillReason(s, id); if (reason) return { ok: false, reason };
    s.cooldowns[id] = SKILLS[id].cooldown;
    if (id === 'repair') for (const b of s.buildings) healBuilding(s, b, maxHP(b) * .35);
    if (id === 'repel') for (const e of s.enemies) { e.repelled = 4; e.hp -= 20; }
    if (id === 'thunder') for (const e of s.enemies) { e.hp -= e.type === 'ghost' ? 350 : 240; s.effects.push({ type: 'thunder', x: e.x, y: e.y, life: .7, total: .7 }); }
    s.effects.push({ type: id, x: worldCenter(s), y: worldCenter(s), life: 1, total: 1 }); collectDead(s);
    return { ok: true };
  }
  function step(s, dt) {
    if (s.over || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .25); s.time += dt; s.elapsed += dt;
    for (const id in s.cooldowns) s.cooldowns[id] = Math.max(0, s.cooldowns[id] - dt);
    for (const group of [s.effects, s.projectiles]) { for (const e of group) e.life -= dt; }
    s.effects = s.effects.filter(e => e.life > 0); s.projectiles = s.projectiles.filter(e => e.life > 0);
    for (const b of [...s.buildings]) if (dryFarm(s, b)) hurtBuilding(s, b, maxHP(b) * .05 * dt, true);
    settleIncome(s, dt);
    if (s.phase === 'day') {
      s.repairTime += dt;
      if (s.repairTime >= 1 - 1e-8) { s.repairTime = Math.max(0, s.repairTime - 1); for (const b of s.buildings) if (!dryFarm(s, b)) healBuilding(s, b, maxHP(b) * .1); }
      if (s.time >= DAY) dusk(s);
    } else if (s.phase === 'dusk' && s.time >= DUSK) startNight(s);
    else if (s.phase === 'night') combat(s, dt);
    missions(s);
  }
  function serialize(s) { return JSON.stringify({ ...s, events: [], projectiles: [], effects: [] }); }
  function restore(raw) {
    try {
      const s = JSON.parse(raw), finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
      if (!s || typeof s !== 'object') return null;
      if (s.worldSize === undefined) s.worldSize = 17;
      if (![17, 25].includes(s.worldSize)) return null;
      const SIZE = worldSize(s);
      if (s.mapGeneration !== undefined && (s.mapGeneration !== 2 || SIZE !== 25 || s.version !== 5 || s.mapSeed === undefined || s.estateSeed === undefined)) return null;
      if (s.estateSeed !== undefined && (SIZE !== 25 || !Number.isInteger(s.estateSeed) || s.estateSeed < 0 || s.estateSeed > 4294967295 || s.mapSeed === undefined)) return null;
      if (s.version === 5 && (SIZE !== 25 || s.estateSeed === undefined)) return null;
      if (s.version < 5 && (SIZE !== 17 || s.estateSeed !== undefined)) return null;
      if (s.materials === undefined) s.materials = 120; // Pre-material saves receive starting stock.
      delete s.prosperity; delete s.incense;
      if (s.fortuneBuilt === undefined) s.fortuneBuilt = 0;
      if (s.mapSeed !== undefined && (!Number.isInteger(s.mapSeed) || s.mapSeed < 0 || s.mapSeed > 4294967295)) return null;
      if (![1, 2, 3, 4, 5].includes(s.version) || !finite(s.coins) || !finite(s.materials) || !Number.isInteger(s.fortuneBuilt) || s.fortuneBuilt < 0 || !Number.isInteger(s.day) || s.day < 1 || !['day', 'dusk', 'night'].includes(s.phase) || !finite(s.time) || !finite(s.elapsed) || !finite(s.repairTime) || !Number.isInteger(s.mission) || s.mission < 0 || s.mission > MISSIONS.length || !Number.isInteger(s.seed) || !Number.isInteger(s.direction) || s.direction < 0 || s.direction > 3 || !finite(s.kills) || typeof s.over !== 'boolean') return null;
      if (!Array.isArray(s.buildings) || s.buildings.length > SIZE * SIZE || !Array.isArray(s.enemies) || s.enemies.length > 150 || !s.cooldowns || !Object.keys(SKILLS).every(k => finite(s.cooldowns[k]))) return null;
      const retired = s.buildings.filter(b => RETIRED_TYPES.has(b.type)).length;
      s.buildings = s.buildings.filter(b => !RETIRED_TYPES.has(b.type));
      const cells = new Set(), land = estate(s);
      for (const b of s.buildings) {
        if (!Object.prototype.hasOwnProperty.call(DEFS,b.type)) return null;
        const legacyGrowth = s.version === 1 ? 1.65 : 1.3;
        const savedMaxLevel = s.version === 1 ? (DEFS[b.type].max || 3) : s.version === 2 ? MAX_LEVEL : maxLevel(b);
        const savedMaxHP = s.version < 3 ? Math.round(DEFS[b.type].hp * Math.pow(legacyGrowth, b.level - 1)) : maxHP(b);
        if (!inside(b.x, b.y, s) || !Number.isInteger(b.level) || b.level < 1 || b.level > savedMaxLevel || !finite(b.hp) || (b.hp === 0 && b.type !== 'gate') || b.hp > savedMaxHP + 1 || !Number.isInteger(b.id) || b.id < 1) return null;
        if (b.type === 'gate') {
          if (!land?.gates.some(g => g.x === b.x && g.y === b.y && g.direction === b.direction)) return null;
        } else if (land && (!land.cells.has(b.y * SIZE + b.x) || terrain(b.x, b.y, s) === 'water')) return null;
        if (land && b.type === 'shrine' && (b.x !== worldCenter(s) || b.y !== worldCenter(s))) return null;
        if (s.version < 3) b.hp = Math.max(.001, b.hp / savedMaxHP * maxHP(b));
        if (b.materialPending === undefined) {
          b.materialPending = DEFS[b.type].resource === 'materials' ? (b.coinPending || 0) : 0;
          if (DEFS[b.type].resource === 'materials') b.coinPending = 0;
        }
        for (const field of ['incomeTime', 'coinPending', 'materialPending']) {
          if (b[field] === undefined) b[field] = 0; // Migrate existing v1 saves without losing the town.
          if (!finite(b[field])) return null;
        }
        delete b.incensePending;
        if (b.originCost !== undefined && (!b.originCost || !finite(b.originCost.coins) || !finite(b.originCost.materials))) return null;
        if (b.type === 'port' && b.coinPending > 0) {
          b.materialPending += b.coinPending; b.coinPending = 0; // Former port earnings now settle as materials.
        }
        if (b.incomeTime >= 1) return null;
        const key = b.x + ',' + b.y; if (cells.has(key)) return null; cells.add(key); b.cooldown = 0; delete b.soldier;
      }
      if (land && s.buildings.filter(b => b.type === 'gate').length !== 4) return null;
      if (land) {
        const gates = s.buildings.filter(b => b.type === 'gate');
        if (s.gateLevel !== undefined && (!Number.isInteger(s.gateLevel) || s.gateLevel < 1 || s.gateLevel > MAX_LEVEL || gates.some(b => b.level !== s.gateLevel))) return null;
        // Older estate saves upgraded each gate separately; keep their highest purchased level.
        s.gateLevel = s.gateLevel ?? Math.max(...gates.map(b => b.level));
        for (const gate of gates) {
          const ratio = gate.hp / maxHP(gate); gate.level = s.gateLevel; gate.hp = maxHP(gate) * ratio;
        }
      }
      if ((!s.over && s.buildings.filter(b => b.type === 'shrine').length !== 1) || s.buildings.filter(b => b.type === 'shrine').length > 1) return null;
      if (s.phase === 'night' && (!s.wave || !Number.isInteger(s.wave.total) || s.wave.total < 1 || s.wave.total > 120 || !Number.isInteger(s.wave.spawned) || s.wave.spawned < 0 || s.wave.spawned > s.wave.total || !Number.isFinite(s.wave.timer))) return null;
      for (const e of s.enemies) {
        if (e.slowed === undefined) e.slowed = 0;
        if (e.slowFactor === undefined) e.slowFactor = 1;
        if (!Object.prototype.hasOwnProperty.call(ENEMIES,e.type) || !Number.isInteger(e.id) || e.id < 1 || !finite(e.x) || e.x >= SIZE || !finite(e.y) || e.y >= SIZE || !finite(e.hp) || e.hp <= 0 || !finite(e.maxHp) || e.hp > e.maxHp || !finite(e.speed) || e.speed <= 0 || !finite(e.damage) || e.damage <= 0 || !finite(e.attack) || !Number.isFinite(e.repelled) || !finite(e.slowed) || !Number.isFinite(e.slowFactor) || e.slowFactor <= 0 || e.slowFactor > 1) return null;
        if (!walkable(s, Math.round(e.x), Math.round(e.y))) {
          let nearest = null;
          for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (walkable(s, x, y)) {
            const distance = (x - e.x) ** 2 + (y - e.y) ** 2;
            if (!nearest || distance < nearest.distance) nearest = { x, y, distance };
          }
          e.x = nearest.x; e.y = nearest.y;
        }
        e.path = []; e.pathRevision = -1;
      }
      // Older saves could contain buildings in water. Move them without losing their level or earnings.
      // Reserve shore cells for farms before relocating other buildings.
      const occupiedLand = new Set(s.buildings.filter(b => terrain(b.x, b.y, s) !== 'water').map(b => b.x + ',' + b.y));
      let moved = 0, stranded = 0;
      for (const b of s.buildings.filter(b => !land && terrain(b.x, b.y, s) === 'water').sort((a, z) => Number(z.type === 'farm') - Number(a.type === 'farm') || a.id - z.id)) {
        const candidates = [];
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const land = terrain(x, y, s);
          if (land === 'water' || (b.type === 'farm' && land !== 'shore') || occupiedLand.has(x + ',' + y)) continue;
          candidates.push({ x, y, score: dist8(b.x, b.y, x, y) * 100 + (Math.abs(b.x - x) + Math.abs(b.y - y)) * 2 + (land === 'shore' && b.type !== 'farm' ? 1 : 0) });
        }
        candidates.sort((a, z) => a.score - z.score || a.y - z.y || a.x - z.x);
        if (!candidates.length) { stranded++; continue; }
        b.x = candidates[0].x; b.y = candidates[0].y;
        occupiedLand.add(b.x + ',' + b.y); moved++;
      }
      s.events = retired ? [{ text: '旧存档中 ' + retired + ' 栋已退役建筑被移除', kind: 'info' }] : [];
      if (moved) s.events.push({ text: '旧存档中 ' + moved + ' 栋建筑已迁出水域', kind: 'info' });
      if (stranded) s.events.push({ text: '岸地已满，' + stranded + ' 栋旧建筑暂保留原位', kind: 'warning' });
      s.effects = []; s.projectiles = []; s.revision = 1; s.version = land ? 5 : 4;
      s.nextId = Math.max(0, ...s.buildings.map(b => b.id), ...s.enemies.map(e => e.id || 0)) + 1;
      return s;
    } catch { return null; }
  }
  return { SIZE, CENTER, worldSize, worldCenter, estate, owns, isWall, walkable, DAY, DUSK, MAX_LEVEL, SHRINE_MAX_LEVEL, GROWTH, HP_GROWTH, UPGRADE_GROWTH, SHRINE_REQUIREMENTS, TERRAIN, DEFS, ENEMIES, SKILLS, MISSIONS, chains, terrain, dist8, at, adjacent, dryFarm, factor, incomeFactor, auraFactor, hpFactor, maxLevel, shrineLevel, requiredShrineLevel, unlockedBuildingLevel, maxHP, visualLevel, name, createState, buildCost, fortuneCandidates, grantBuilding, buildReason, build, upgradeCost, upgradeReason, upgrade, demolishReason, demolish, income, rates, buildingGuard, defenseBoost, zhongSlow, dusk, startNight, findPath, skillReason, skill, step, serialize, restore };
});
