/* 古坊奇谭 · independent, deterministic simulation; no network dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SIZE = 25, CENTER = 12, DAY = 72, DUSK = 8, MAX_LEVEL = 9, SHRINE_MAX_LEVEL = 15, GATE_MAX_LEVEL = 15;
  const worldSize = s => s?.worldSize ?? (s ? 25 : 17);
  // worldSize remains the row stride (width) for existing callers and square saves.
  const worldWidth = worldSize;
  const worldHeight = s => s?.worldHeight ?? worldWidth(s);
  const worldCenter = s => Math.floor(worldSize(s) / 2);
  const worldCenterY = s => Math.floor(worldHeight(s) / 2);
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
  // 所有生产建筑的影响范围统一为 1（仅影响相邻格）。
  const COIN_CHAIN_COSTS = [{ coins: 0, materials: 65 }, { coins: 110, materials: 240 }, { coins: 430, materials: 750 }];
  const MATERIAL_CHAIN_COSTS = [{ coins: 95, materials: 0 }, { coins: 290, materials: 70 }, { coins: 920, materials: 300 }];
  chains.forEach((a, ci) => { for (let i = 0; i < 3; i++) {
    const baseCost = (ci < 2 ? COIN_CHAIN_COSTS : MATERIAL_CHAIN_COSTS)[i], high = ci === 0 || ci === 3;
    const costFactor = (high ? 1.5 : 1) * (i === 2 ? (high ? 40 / 9 : 4) : 1);
    def(a[i], a[i + 3], 'economy', { coins: Math.ceil(baseCost.coins * costFactor), materials: Math.ceil(baseCost.materials * costFactor) }, [180, 250, 340][i], {
    income: (high ? [2, 5, 40] : [1, 3, 24])[i], resource: ci < 2 ? 'coins' : 'materials', terrain: i === 0 ? a[6] : null, prev: i ? a[i - 1] : null,
    chain: a[7], color: a[8], end: i === 2, tier: i, radius: 1, limit: i === 0 ? [6, 8, 8, 6][ci] : i === 1 ? 3 : 1,
    names: [a[i + 3], i === 0 ? ['清茗茶肆', '临水良田', '葱郁桑园', '青石矿场'][ci] : '兴旺' + a[i + 3], '鼎盛' + a[i + 3]]
  }); } });
  def('guild', '汇财会馆', 'economy', { coins: 44572, materials: 66858 }, 600, { income: 240, resource: 'coins', aura: .05, auraResource: 'coins', required: ['bank', 'wine'], radius: 1, limit: 1 });
  def('port', '百工院', 'economy', { coins: 70500, materials: 37500 }, 900, { income: 300, resource: 'materials', aura: .10, auraResource: 'materials', required: ['tailor', 'trade'], radius: 1, limit: 1 });
  def('tower', '箭塔', 'defense', { coins: 95, materials: 70 }, 300, { damage: 22, range: 4, interval: .85, desc: '单体远射 · 射程 4 格' });
  def('rock', '擂石台', 'defense', { coins: 260, materials: 190 }, 380, { damage: 46, range: 3.8, interval: 2.5, splash: 1.35, fortuneOnly: true, desc: '范围轰击 · 仅可由造化匣获得' });
  def('barracks', '兵营', 'defense', { coins: 320, materials: 240 }, 420, { damage: 18, range: 4.5, interval: .8, desc: '自动派出民兵近战' });
  def('well', '水井', 'support', { coins: 120, materials: 65 }, 250, { fortuneOnly: true, desc: '井旁平地可建农田 · 相邻农田收入 +20%' });
  def('stage', '戏台', 'support', { coins: 400, materials: 300 }, 280, { aura: .03, fortuneOnly: true, desc: '全镇收入 +3%' });
  def('shrine', '祠堂', 'temple', { coins: 0, materials: 0 }, 1800, { income: 1, resource: 'coins', desc: '古坊之根 · 决定全坊升级上限', unique: true, upgradeBase: { coins: 120, materials: 90 }, upgradeGrowth: 1.65, names: ['古坊祠堂', '百福祠堂', '万安宗祠'] });
  def('earth', '土地庙', 'temple', { coins: 140, materials: 95 }, 260, { guard: .2, range: 3, fortuneOnly: true, desc: '三格内建筑受到伤害 -20%' });
  def('zhong', '钟馗像', 'temple', { coins: 250, materials: 180 }, 430, { slow: .4, pulseInterval: 12, slowDuration: 4, fortuneOnly: true, desc: '每 12 秒使全体怪物减速 40%，持续 4 秒' });
  def('tao', '道观', 'temple', { coins: 450, materials: 330 }, 380, { powerAura: .15, fortuneOnly: true, desc: '全镇防御建筑攻击 +15%' });
  def('fortune', '造化匣', 'mystery', { coins: 90, materials: 60 }, 1, { limit: 10, desc: '变化为随机建筑' });
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
  const inside = (x, y, s) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < worldWidth(s) && y < worldHeight(s);
  // 相邻含斜角：切比雪夫距离 1。
  const dist8 = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const NEIGHBORS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  // Player views share the battlefield but expose only one estate's economy.
  const playerViews = new WeakMap(), coopMaps = new WeakMap();
  const world = s => s?._world || s;
  function playerView(s, owner = 0) {
    s = world(s);
    if (s.mode !== 'coop') return s;
    let views = playerViews.get(s);
    if (!views) { views = []; playerViews.set(s, views); }
    if (views[owner]) return views[owner];
    const view = { actorId: owner }, personal = new Set(['coins', 'materials', 'fortuneBuilt', 'gateLevel', 'cooldowns', 'selectedSkill', 'mission']);
    Object.defineProperty(view, '_world', { value: s });
    for (const key of Object.keys(s)) Object.defineProperty(view, key, { enumerable: true,
      get() { return key === 'buildings' ? s.buildings.filter(b => b.owner === owner) : personal.has(key) && owner === 1 ? s.partner[key] : s[key]; },
      set(value) {
        if (key === 'buildings') s.buildings = [...s.buildings.filter(b => b.owner !== owner), ...value];
        else if (personal.has(key) && owner === 1) s.partner[key] = value;
        else s[key] = value;
      }
    });
    return views[owner] = view;
  }
  const economicView = s => s.mode === 'coop' && s.actorId === undefined ? playerView(s) : s;
  function coopMap(s) {
    s = world(s);
    const cached = coopMaps.get(s); if (cached) return cached;
    // Facing wall lines overlap by exactly one tile: one shared divider, no lane.
    const horizontal = s.coopLayout === 'horizontal', gap = -1;
    const width = worldWidth(s), height = worldHeight(s);
    const sources = [createState(s.mapSeed), createState((Math.imul(s.mapSeed, 1664525) + 1013904223) >>> 0)];
    const originals = sources.map((source, owner) => {
      const original = estate(source), cells = new Set(original.cells);
      const axes = [...cells].map(k => horizontal ? k % 25 : Math.floor(k / 25));
      const face = owner === 0 ? Math.max(...axes) : Math.min(...axes);
      // Straighten only the common face; the other three edges keep their random contour.
      for (const key of [...cells]) {
        const axis = horizontal ? key % 25 : Math.floor(key / 25), cross = horizontal ? Math.floor(key / 25) : key % 25;
        for (let n = Math.min(axis, face); n <= Math.max(axis, face); n++) cells.add(horizontal ? cross * 25 + n : n * 25 + cross);
      }
      const walls = new Set();
      for (const k of cells) for (const [dx, dy] of NEIGHBORS8) if (!cells.has(k + dy * 25 + dx)) walls.add(k + dy * 25 + dx);
      for (const g of original.gates) walls.delete(g.y * 25 + g.x);
      return { ...original, cells, walls };
    });
    const bounds = originals.map(land => {
      const keys = [...land.cells, ...land.walls, ...land.gates.map(g => g.y * 25 + g.x)];
      return { min: Math.min(...keys.map(k => horizontal ? k % 25 : Math.floor(k / 25))), max: Math.max(...keys.map(k => horizontal ? k % 25 : Math.floor(k / 25))) };
    });
    const length = bounds.reduce((n, b) => n + b.max - b.min + 1, gap), start = Math.floor(((horizontal ? width : height) - length) / 2);
    const terrainCells = Array(width * height).fill('plain'), estates = [];
    let cursor = start;
    for (let owner = 0; owner < 2; owner++) {
      const original = originals[owner], source = sources[owner];
      const offset = cursor - bounds[owner].min, dx = horizontal ? offset : Math.floor(width / 2) - 12, dy = horizontal ? Math.floor(height / 2) - 12 : offset;
      cursor += bounds[owner].max - bounds[owner].min + 1 + gap;
      const convert = key => (Math.floor(key / 25) + dy) * width + key % 25 + dx;
      const cells = new Set([...original.cells].map(convert));
      const walls = new Set([...original.walls, ...original.gates.map(g => g.y * 25 + g.x)].map(convert));
      const center = { x: 12 + dx, y: 12 + dy };
      const inward = horizontal ? (owner === 0 ? 1 : 3) : (owner === 0 ? 2 : 0);
      const gates = original.gates.filter(g => g.direction !== inward).map(g => ({ ...g, x: g.x + dx, y: g.y + dy, owner }));
      const inner = owner === 0 ? bounds[owner].max - 2 : bounds[owner].min + 2;
      for (const g of gates) {
        if (horizontal ? g.direction % 2 === 0 : g.direction % 2 === 1) {
          const line = [...original.cells].filter(k => (horizontal ? k % 25 : Math.floor(k / 25)) === inner);
          if (horizontal) { g.x = inner + dx; g.y = (g.direction === 0 ? Math.min(...line.map(k => Math.floor(k / 25))) - 1 : Math.max(...line.map(k => Math.floor(k / 25))) + 1) + dy; }
          else { g.y = inner + dy; g.x = (g.direction === 3 ? Math.min(...line.map(k => k % 25)) - 1 : Math.max(...line.map(k => k % 25)) + 1) + dx; }
        }
        walls.delete(g.y * width + g.x);
      }
      const roads = new Set([...original.roads].filter(k => original.cells.has(k)).map(convert));
      const root = center.y * width + center.x, queue = [root], parents = new Map([[root, null]]);
      for (let i = 0; i < queue.length; i++) for (const delta of [-width, 1, width, -1]) {
        const next = queue[i] + delta;
        if (cells.has(next) && !parents.has(next)) { parents.set(next, queue[i]); queue.push(next); }
      }
      for (const g of gates) {
        const [gx, gy] = [[0,-1],[1,0],[0,1],[-1,0]][g.direction];
        let key = (g.y - gy) * width + g.x - gx;
        while (key != null) { roads.add(key); key = parents.get(key); }
        roads.add(g.y * width + g.x);
      }
      for (const key of [...original.cells, ...original.walls]) terrainCells[convert(key)] = baseTerrain(key % 25, Math.floor(key / 25), source);
      for (const g of gates) terrainCells[g.y * width + g.x] = 'plain';
      estates.push({ owner, cells, walls, gates, roads, center });
    }
    const merge = property => [].concat(...estates.map(e => Array.from(e[property])));
    const combined = { cells: new Set(merge('cells')), walls: new Set(merge('walls')), gates: merge('gates'), roads: new Set(merge('roads')), estates, gap: 0, sharedWall: new Set([...estates[0].walls].filter(k => estates[1].walls.has(k))) };
    for (const g of combined.gates) {
      const [dx, dy] = [[0,-1],[1,0],[0,1],[-1,0]][g.direction];
      for (let x = g.x + dx, y = g.y + dy; x >= 0 && y >= 0 && x < width && y < height; x += dx, y += dy) {
        const key = y * width + x;
        if (combined.walls.has(key) || combined.cells.has(key)) break;
        combined.roads.add(key); terrainCells[key] = 'plain';
      }
    }
    const value = { land: combined, terrain: terrainCells }; coopMaps.set(s, value); return value;
  }
  function createCoopState(mapSeed = Math.floor(Math.random() * 4294967296), layout) {
    const s = createState(mapSeed);
    const coopLayout = layout || (s.estateSeed % 2 ? 'horizontal' : 'vertical');
    Object.assign(s, { version: 7, mode: 'coop', worldSize: coopLayout === 'horizontal' ? 40 : 25, worldHeight: coopLayout === 'horizontal' ? 25 : 40, coopLayout, partner: { controller: 'computer', coins: 150, materials: 200, fortuneBuilt: 0, gateLevel: 1, cooldowns: { repel: 0, repair: 0, thunder: 0 }, selectedSkill: null, mission: 0 }, buildings: [], nextId: 1 });
    for (const e of coopMap(s).land.estates) {
      addBuilding(s, 'shrine', e.center.x, e.center.y, 1, { owner: e.owner });
      for (const g of e.gates) addBuilding(s, 'gate', g.x, g.y, 1, { direction: g.direction, owner: e.owner });
    }
    return s;
  }
  function raidOptions(s) { return s.coopLayout === 'horizontal' ? [[0], [2], [3, 1]] : [[3], [1], [0, 2]]; }
  function raidDirections(s) {
    if (s.mode === 'coop') return raidOptions(s)[s.direction];
    return (s.phase === 'dusk' ? s.day % 7 === 0 : s.wave?.boss) ? [0, 1, 2, 3] : [s.direction];
  }
  const terrainCache = new WeakMap();
  function generatedTerrain(s) {
    if (s.mode === 'coop') return coopMap(s).terrain;
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
    if (s?.mode === 'coop') { const land = coopMap(s).land; return s.actorId === undefined ? land : land.estates[s.actorId]; }
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
  function isWall(s, x, y) { return inside(x, y, s) && !!estate(world(s))?.walls.has(y * worldSize(s) + x); }
  function walkable(s, x, y) {
    if (!inside(x, y, s) || isWall(s, x, y)) return false;
    return terrain(x, y, s) !== 'water' || !!estate(world(s))?.roads.has(y * worldSize(s) + x);
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
  const incomeFactor = b => b.type === 'shrine' ? Math.pow(2, b.level - 1) : Math.pow(2, Math.min(2, b.level - 1)) * Math.pow(1.65, Math.max(0, b.level - 3));
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
  const soldierLimit = b => Math.max(1, Math.min(MAX_LEVEL, b.level));
  const soldierHP = b => Math.round(120 * hpFactor(b));
  const soldierDamage = (s, b) => 18 * factor(b) * defenseBoost(s);
  const soldierPower = (s, b) => Math.round(Math.sqrt(soldierHP(b) * soldierDamage(s, b)));
  function muster(s, b) {
    if (s.phase !== 'night' || b.type !== 'barracks' || b.hp <= 0 || !walkable(s, b.x, b.y)) return;
    s.soldiers ||= []; b.musteredCount ??= 0;
    while (b.musteredCount < soldierLimit(b)) {
      s.soldiers.push({ id: s.nextId++, barracksId: b.id, x: b.x, y: b.y, hp: soldierHP(b), maxHp: soldierHP(b), level: b.level,
        attack: 0, path: [], pathRevision: -1, targetId: null });
      b.musteredCount++;
    }
  }
  function cleanSoldiers(s) {
    s.soldiers = (s.soldiers || []).filter(u => u.hp > 0 && s.buildings.some(b => b.id === u.barracksId && b.type === 'barracks' && b.hp > 0));
    for (const e of s.enemies) if (e.soldierTargetId != null && !s.soldiers.some(u => u.id === e.soldierTargetId)) {
      delete e.soldierTargetId; e.path = []; e.pathRevision = -1; delete e.chaseTile;
    }
  }
  const visualLevel = level => Math.min(3, Math.floor((level - 1) / 3) + 1);
  const name = b => DEFS[b.type].names?.[visualLevel(b.level) - 1] || (visualLevel(b.level) === 1 ? DEFS[b.type].name : (visualLevel(b.level) === 2 ? '兴盛' : '鼎盛') + DEFS[b.type].name);
  function addBuilding(s, type, x, y, level = 1, extra = {}) {
    const b = { id: s.nextId++, type, x, y, level, hp: Math.round(DEFS[type].hp * Math.pow(HP_GROWTH, level - 1)), cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0, ...extra };
    if (s.mode === 'coop') b.owner = extra.owner ?? s.actorId ?? 0;
    world(s).buildings.push(b); s.revision++; muster(s, b); return b;
  }
  function grantBuilding(s, type, x, y, level = unlockedBuildingLevel(s), originCost) {
    s = economicView(s);
    if (!DEFS[type] || type === 'fortune' || DEFS[type].unique || DEFS[type].fixed || !owns(s, x, y) || isWall(s, x, y) || estate(s)?.gates.some(g => g.x === x && g.y === y) || terrain(x, y, s) === 'water' || at(s, x, y)) return null;
    return addBuilding(s, type, x, y, Math.min(level, maxLevel({ type })), originCost ? { originCost } : {});
  }
  function createState(mapSeed = Math.floor(Math.random() * 4294967296), mapGeneration = 2) {
    const s = { version: mapSeed === null ? 4 : 5, worldSize: mapSeed === null ? 17 : 25, seed: 73193, nextId: 1, coins: 150, materials: 200, fortuneBuilt: 0, day: 1, phase: 'day', time: 0, elapsed: 0, repairTime: 0,
      direction: 0, buildings: [], enemies: [], soldiers: [], projectiles: [], effects: [], events: [], kills: 0, wave: null,
      cooldowns: { repel: 0, repair: 0, thunder: 0 }, selectedSkill: null, mission: 0, revision: 0, over: false, celebrated: false };
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
    s = economicView(s);
    if (type !== 'fortune') return DEFS[type]?.cost || { coins: 0, materials: 0 };
    const multiple = Math.pow(1.8, s.fortuneBuilt || 0);
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
      if (d.id === 'farm' && plot !== 'shore' && !(plot === 'plain' && adjacent(s, x, y).some(b => b.type === 'well'))) return false;
      if (d.id !== 'farm' && d.terrain && plot !== d.terrain) return false;
      return true;
    });
  }
  function buildReason(s, type, x, y, ignoreFunds = false) {
    s = economicView(s);
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
    if (type === 'fortune') return fortuneCandidates(s, x, y).length ? (ignoreFunds ? '' : shortage(s, buildCost(s, type))) : '此地无可造化建筑';
    if (d.limit && s.buildings.filter(b => b.type === type).length >= d.limit) return '已达上限（' + d.limit + '座）';
    if (d.cat === 'economy' && plot === 'forest' && type !== 'mulberry') return '林地仅可建桑园';
    if (d.cat === 'economy' && plot === 'mountain' && type !== 'quarry') return '山地仅可建石场';
    if (type === 'farm') {
      if (plot !== 'shore' && !(plot === 'plain' && adjacent(s, x, y).some(b => b.type === 'well'))) return '需水岸或水井旁平地';
    } else if (d.terrain && plot !== d.terrain) return '需' + TERRAIN[d.terrain];
    if (d.prev && !adjacent(s, x, y).some(b => b.type === d.prev)) return '需紧挨' + DEFS[d.prev].name;
    if (d.required) {
      const nearby = new Set(adjacent(s, x, y).map(b => b.type));
      const missing = d.required.filter(id => !nearby.has(id));
      if (missing.length) return '需紧邻' + missing.map(id => DEFS[id].name).join('、');
    }
    return ignoreFunds ? '' : shortage(s, buildCost(s, type));
  }
  function buildHints(s, x, y) {
    return Object.values(DEFS).filter(d => d.cat === 'economy' && (d.tier >= 1 || d.required) && !buildReason(s, d.id, x, y, true))
      .map(d => ({ type: d.id, resource: d.resource, tier: d.required ? 3 : d.tier }));
  }
  function event(s, text, kind = 'info') { s.events.push({ text, kind }); if (s.events.length > 30) s.events.shift(); }
  function missions(s) {
    if (s.mode === 'coop' && s.actorId === undefined) { missions(playerView(s, 0)); missions(playerView(s, 1)); return; }
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
    const b = addBuilding(s, type, x, y); missions(s); return { ok: true, building: b };
  }
  function upgradeCost(b) {
    const d = DEFS[b.type], base = d.upgradeBase || d.cost, multiple = 1.8 * Math.pow(d.upgradeGrowth || UPGRADE_GROWTH, b.level - 1) * Math.pow(b.type === 'shrine' ? 1.08 : d.income ? 1.12 : 1, Math.max(0, b.level - (b.type === 'shrine' ? 7 : 4)));
    return { coins: Math.ceil(base.coins * multiple), materials: Math.ceil(base.materials * multiple) };
  }
  function upgradeReason(s, b, ignoreFunds = false) {
    s = economicView(s);
    if (!b || !s.buildings.includes(b)) return '建筑已不存在';
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return '仅可升级庄园内建筑';
    if (s.over) return '古坊已失守';
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
  function upgrade(s, b) {
    s = economicView(s);
    const reason = upgradeReason(s, b); if (reason) return { ok: false, reason };
    pay(s, upgradeCost(b));
    const targets = b.type === 'gate' ? s.buildings.filter(n => n.type === 'gate') : [b];
    const level = b.level + 1;
    for (const target of targets) {
      const ratio = target.hp / maxHP(target); target.level = level; target.hp = maxHP(target) * ratio;
    }
    if (b.type === 'gate') s.gateLevel = level;
    if (b.type === 'barracks') {
      for (const u of s.soldiers || []) if (u.barracksId === b.id) {
        const ratio = u.hp / u.maxHp; u.level = b.level; u.maxHp = soldierHP(b); u.hp = u.maxHp * ratio;
      }
      muster(s, b);
    }
    s.revision++; missions(s); return { ok: true };
  }
  function demolishReason(s, b) {
    s = economicView(s);
    if (!b || !s.buildings.includes(b) || b.type === 'shrine') return '祠堂不可拆除';
    if (b.type === 'gate') return '城门不可拆除';
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return '仅可拆除庄园内建筑';
    if (s.over) return '古坊已失守';
    return '';
  }
  function demolish(s, b) {
    s = economicView(s);
    const reason = demolishReason(s, b); if (reason) return { ok: false, reason };
    const cost = b.originCost || DEFS[b.type].cost, refund = { coins: Math.floor(cost.coins * .4), materials: Math.floor(cost.materials * .4) };
    s.coins += refund.coins; s.materials += refund.materials; s.buildings = s.buildings.filter(n => n !== b); s.revision++;
    if (b.type === 'barracks') cleanSoldiers(world(s));
    const dryFarms = b.type === 'well' ? s.buildings.filter(n => n.type === 'farm' && dist8(n.x, n.y, b.x, b.y) === 1 && dryFarm(s, n)).length : 0;
    return { ok: true, refund, dryFarms };
  }
  function income(s, b, buildings) {
    if (s.mode === 'coop' && s.actorId === undefined) s = playerView(s, b.owner ?? 0);
    const d = DEFS[b.type]; if (!d.income) return 0;
    let bonus = 0;
    for (const n of buildings || s.buildings) {
      const nd = DEFS[n.type], dist = dist8(n.x, n.y, b.x, b.y);
      if (nd.aura && (!nd.auraResource || nd.auraResource === d.resource)) bonus += nd.aura * auraFactor(n);
      if (n.type === 'well' && dist === 1 && b.type === 'farm') bonus += .2 * auraFactor(n);
      if (d.radius && dist <= d.radius && isPrereq(d, nd)) bonus += .1 * auraFactor(n);
    }
    return d.income * incomeFactor(b) * (1 + Math.min(2, bonus)) * (s.day % 7 === 0 ? 1.25 : 1);
  }
  const rates = s => economicView(s).buildings.reduce((r, b) => {
    const d = DEFS[b.type];
    r[d.resource === 'materials' ? 'materials' : 'coins'] += income(s, b);
    return r;
  }, { coins: 0, materials: 0 });
  const incomeCache = new WeakMap();
  function settleIncome(s, dt) {
    const w = world(s), buildings = w.buildings;
    // Inspect dependencies once, including direct edits that do not bump revision.
    const signature = JSON.stringify([w.mode, w.day, buildings.map(b => [b.type, b.x, b.y, b.level, b.owner])]);
    let cached = incomeCache.get(w);
    const sameBuildings = cached?.buildings?.length === buildings.length && buildings.every((b, i) => cached.buildings[i] === b);
    if (!sameBuildings || cached.signature !== signature) {
      const groups = new Map();
      for (const b of buildings) {
        const owner = w.mode === 'coop' ? b.owner : undefined;
        if (!groups.has(owner)) groups.set(owner, []);
        groups.get(owner).push(b);
      }
      cached = { signature, buildings: [...buildings], groups, players: new Map() }; incomeCache.set(w, cached);
    }
    const players = s.mode === 'coop' && s.actorId === undefined ? [playerView(s, 0), playerView(s, 1)] : [s];
    for (const player of players) {
      const owner = player.actorId;
      const owned = cached.groups.get(w.mode === 'coop' ? owner : undefined) || [];
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
          if (paid > 0) player.effects.push({ type: 'income', resource, buildingId: b.id, amount: paid, x: b.x, y: b.y, life: .95, total: .95 });
        }
      }
    }
  }
  function dusk(s) { s.phase = 'dusk'; s.time = 0; s.direction = Math.floor(random(s) * (s.mode === 'coop' ? 3 : 4)); event(s, '暮色将至 · 今夜来敌在' + raidDirections(s).map(d => ['北', '东', '南', '西'][d]).join('、') + '方', 'warning'); }
  function startNight(s) {
    s.phase = 'night'; s.time = 0; const boss = s.day % 7 === 0;
    s.soldiers = []; cleanSoldiers(s);
    for (const b of s.buildings) if (b.type === 'barracks') { b.musteredCount = 0; muster(s, b); }
    const opening = Math.min(1, .5 + .5 * (s.day - 1) / 9);
    const escalation = 2 * (s.day - 1) + Math.floor(.35 * (s.day - 1) ** 2);
    s.wave = { total: Math.ceil(Math.min(120, 7 + s.day * 3 + Math.floor(s.day / 3) * 2 + escalation + (boss ? 12 : 0)) * opening), spawned: 0, timer: .35, boss };
    if (s.mode === 'coop') s.wave.total *= 2;
    event(s, boss ? '百鬼夜行！妖将与群妖从' + raidDirections(s).map(d => ['北','东','南','西'][d]).join('、') + '方来袭' : '入夜了 · 守住祠堂，灯火不熄', 'warning');
  }
  function dawn(s) {
    s.day++; s.phase = 'day'; s.time = 0; s.wave = null; s.enemies = []; s.projectiles = []; s.repairTime = 0;
    s.soldiers = []; for (const b of s.buildings) delete b.musteredCount;
    const reward = 40 + s.day * 8; s.coins += reward; event(s, '平安入晓 · 守夜赏钱 +' + reward, 'reward');
    if (s.mode === 'coop') s.partner.coins += reward + (s.day % 7 === 0 ? 180 : 0);
    if (s.day % 7 === 0) { s.coins += 180; event(s, '上元灯会 · 收入 +25%，获赠 180 铜钱', 'reward'); }
    if (s.day === 8 && !s.celebrated) { s.celebrated = true; event(s, '七夜长明！古坊立稳根基，可继续经营抵御更强来敌', 'victory'); }
    missions(s);
  }
  function spawnPlots(s, direction) {
    if (!Number.isInteger(direction) || direction < 0 || direction > 3) return [];
    const size = worldWidth(s), height = worldHeight(s), center = direction % 2 ? worldCenterY(s) : worldCenter(s), plots = [];
    for (let pos = center - 2; pos <= center + 2; pos++) {
      const [x, y] = [[pos, 0], [size - 1, pos], [pos, height - 1], [0, pos]][direction];
      if (terrain(x, y, s) !== 'water' && walkable(s, x, y) && !at(s, x, y)?.hp && findPath(s, { x, y }).length) plots.push({ x, y });
    }
    return plots;
  }
  function enemyLane(e) {
    // Old saves and injected enemies gain stable lanes without advancing the simulation RNG.
    if (e.laneX === undefined) e.laneX = ((Math.imul(e.id, 1664525) + 1013904223) >>> 0) / 4294967296 * .5 - .25;
    if (e.laneY === undefined) e.laneY = ((Math.imul(e.id, 2246822519) + 3266489917) >>> 0) / 4294967296 * .5 - .25;
  }
  function raidGates(s, direction) {
    return s.buildings.filter(b => b.type === 'gate' && b.direction === direction)
      .sort((a, b) => (a.owner ?? 0) - (b.owner ?? 0) || a.id - b.id);
  }
  function spawnEnemy(s) {
    const w = s.wave, i = w.spawned, directions = raidDirections(s), dir = directions[i % directions.length];
    const plots = spawnPlots(s, dir); if (!plots.length) { w.spawned++; return; }
    w.spawned++;
    // A shared-side wave alternates exactly between the two corresponding gates.
    // Split-side waves have one eligible gate per direction, so ownership is fixed.
    const gates = s.mode === 'coop' ? raidGates(s, dir) : [];
    const targetGate = gates.length ? gates[Math.floor(i / directions.length) % gates.length] : null;
    const SIZE = worldSize(s), p = plots[Math.floor(random(s) * plots.length)];
    const jitter = (value, limit) => value === 0 ? random(s) * .2 : value === limit - 1 ? value - random(s) * .2 : value + (random(s) * 2 - 1) * .28;
    const x = jitter(p.x, SIZE), y = jitter(p.y, worldHeight(s)), laneX = random(s) * .5 - .25, laneY = random(s) * .5 - .25;
    const type = s.day >= 5 && i % 4 === 2 ? 'fox' : s.day >= 4 && i % 3 === 1 ? 'ghost' : 'bandit';
    const opening = Math.min(1, (s.day - 1) / 9);
    const d = ENEMIES[type], boss = w.boss && i >= w.total - (s.mode === 'coop' ? 2 : 1), late = Math.max(0, s.day - 14), scale = (.6 + .4 * opening) * Math.pow(1.26, Math.min(13, s.day - 1)) * Math.pow(1.32, Math.min(7, late)) * Math.pow(1.25, Math.max(0, late - 7)) * (1 + .08 * late);
    s.enemies.push({ id: s.nextId++, type, x, y, laneX, laneY, hp: d.hp * scale * (boss ? 4.5 : 1), maxHp: d.hp * scale * (boss ? 4.5 : 1),
      damage: d.damage * (.45 + .55 * opening) * Math.pow(1.15, Math.min(13, s.day - 1)) * Math.pow(1.22, Math.min(7, late)) * Math.pow(1.18, Math.max(0, late - 7)) * (1 + .04 * late) * (boss ? 2 : 1), speed: d.speed * Math.min(1.22, Math.pow(1.012, s.day - 1)), attack: 0, repelled: 0, slowed: 0, slowFactor: 1, boss, path: [], pathRevision: -1 });
    if (targetGate) Object.assign(s.enemies[s.enemies.length - 1], { targetGateId: targetGate.id, targetOwner: targetGate.owner });
  }
  // Breadth-first search selects the shortest route to the shrine, regardless of building durability.
  function findPath(s, e, destination, passBuildings = true) {
    s = world(s);
    const SIZE = worldWidth(s), height = worldHeight(s);
    if (s.mode === 'coop' && !destination) {
      const land = estate(s), key = Math.round(e.y) * SIZE + Math.round(e.x);
      const entered = land.estates.find(a => a.cells.has(key));
      if (entered) {
        const owner = Number.isInteger(e.targetOwner) ? e.targetOwner : entered.owner;
        const shrine = s.buildings.find(b => b.type === 'shrine' && b.owner === owner);
        return shrine ? findPath(s, e, shrine) : [];
      }
      // New enemies keep their assigned gate through every path refresh. Enemies
      // from older saves select one reachable gate once, then lock to it as well.
      const assigned = s.buildings.find(b => b.type === 'gate' && b.id === e.targetGateId);
      const choices = assigned ? [assigned] : s.buildings.filter(b => b.type === 'gate');
      const queue = [key], parents = new Map([[key, null]]), gates = new Map(choices.map(g => [g.y * SIZE + g.x, g]));
      for (let i = 0; i < queue.length; i++) {
        const k = queue[i], gate = gates.get(k);
        if (gate) {
          const path = []; let p = k;
          while (parents.get(p) != null) { path.unshift({ x: p % SIZE, y: Math.floor(p / SIZE) }); p = parents.get(p); }
          const shrine = s.buildings.find(b => b.type === 'shrine' && b.owner === gate.owner);
          e.targetGateId = gate.id; e.targetOwner = gate.owner;
          return shrine ? path.concat(findPath(s, gate, shrine) || []) : [];
        }
        for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
          const x = k % SIZE + dx, y = Math.floor(k / SIZE) + dy, next = y * SIZE + x;
          if (walkable(s, x, y) && !parents.has(next) && !land.cells.has(next)) { parents.set(next, k); queue.push(next); }
        }
      }
      return [];
    }
    const base = destination || s.buildings.find(b => b.type === 'shrine'); if (!base) return [];
    const startX = Math.max(0, Math.min(SIZE - 1, Math.round(e.x))), startY = Math.max(0, Math.min(height - 1, Math.round(e.y)));
    const start = startY * SIZE + startX, goal = Math.round(base.y) * SIZE + Math.round(base.x), prev = Array(SIZE * height).fill(-1), queue = [start]; prev[start] = start;
    if (!walkable(s, startX, startY) || !walkable(s, Math.round(base.x), Math.round(base.y))) return destination ? null : [];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]; if (current === goal) break;
      const x = current % SIZE, y = Math.floor(current / SIZE);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!walkable(s, nx, ny)) continue; const next = ny * SIZE + nx;
        if (!passBuildings && at(s, nx, ny)?.hp > 0) continue;
        if (prev[next] !== -1) continue;
        prev[next] = current; queue.push(next);
      }
    }
    if (prev[goal] === -1) return destination ? null : [];
    const path = []; let n = goal; while (n !== start && n !== -1) { path.unshift({ x: n % SIZE, y: Math.floor(n / SIZE) }); n = prev[n]; }
    return path;
  }
  function findSoldierPath(s, unit, target) { return findPath(s, unit, target, true); }
  function safeUnitSegment(s, unit, x, y, passBuildings) {
    const clear = (tx, ty) => walkable(s, tx, ty) && (passBuildings || !(at(s, tx, ty)?.hp > 0));
    const samples = Math.max(1, Math.ceil(Math.hypot(x - unit.x, y - unit.y) / .025));
    let lastX = Math.round(unit.x), lastY = Math.round(unit.y);
    for (let i = 0; i <= samples; i++) {
      const px = unit.x + (x - unit.x) * i / samples, py = unit.y + (y - unit.y) * i / samples;
      const tx = Math.round(px), ty = Math.round(py);
      if (px < 0 || py < 0 || px > worldWidth(s) - 1 || py > worldHeight(s) - 1 || !clear(tx, ty)) return false;
      if (tx !== lastX && ty !== lastY && (!clear(tx, lastY) || !clear(lastX, ty))) return false;
      lastX = tx; lastY = ty;
    }
    return true;
  }
  function moveUnit(s, unit, target, speed, dt, passBuildings) {
    let goal = unit.path[0] || target;
    if (!safeUnitSegment(s, unit, goal.x, goal.y, passBuildings)) {
      const tile = { x: Math.round(unit.x), y: Math.round(unit.y) };
      if (tile.x !== goal.x || tile.y !== goal.y) goal = tile;
    }
    const distance = Math.hypot(goal.x - unit.x, goal.y - unit.y), step = Math.min(distance, speed * dt);
    if (distance > .001) {
      const x = unit.x + (goal.x - unit.x) / distance * step, y = unit.y + (goal.y - unit.y) / distance * step;
      if (safeUnitSegment(s, unit, x, y, passBuildings)) { unit.x = x; unit.y = y; }
    }
    if (unit.path.length && Math.hypot(unit.path[0].x - unit.x, unit.path[0].y - unit.y) <= .001) unit.path.shift();
  }
  function soldierCombat(s, dt) {
    cleanSoldiers(s);
    for (const u of s.soldiers) {
      u.attack = Math.max(0, u.attack - dt);
      const candidates = s.enemies.filter(e => e.hp > 0).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
      let target = null;
      for (const e of candidates) {
        const tile = Math.round(e.x) + ',' + Math.round(e.y);
        if (u.targetId === e.id && u.targetTile === tile && u.pathRevision === s.revision) { target = e; break; }
        const path = findSoldierPath(s, u, e);
        if (path !== null) { target = e; u.path = path; u.pathRevision = s.revision; u.targetTile = tile; break; }
      }
      u.targetId = target?.id ?? null;
      if (!target) { u.path = []; continue; }
      if (Math.hypot(target.x - u.x, target.y - u.y) > .75 || !safeUnitSegment(s, u, target.x, target.y, true)) moveUnit(s, u, target, 2.2, dt, true);
      if (u.attack <= 1e-8 && Math.hypot(target.x - u.x, target.y - u.y) <= .75 && safeUnitSegment(s, u, target.x, target.y, true)) {
        const b = s.buildings.find(b => b.id === u.barracksId);
        target.hp -= soldierDamage(s, b) * (target.type === 'fox' ? 1.5 : 1); u.attack = 1;
        if (target.soldierTargetId !== u.id) { target.path = []; target.pathRevision = -1; delete target.chaseTile; }
        target.soldierTargetId = u.id;
        s.projectiles.push({ x: u.x, y: u.y, tx: target.x, ty: target.y, type: 'barracks', life: .3, total: .3 });
      }
    }
  }
  function chaseSoldier(s, e, dt) {
    const u = s.soldiers.find(u => u.id === e.soldierTargetId && u.hp > 0);
    if (!u || Math.hypot(u.x - e.x, u.y - e.y) > 8) return false;
    const tile = Math.round(u.x) + ',' + Math.round(u.y);
    if (e.chaseTile !== tile || e.pathRevision !== s.revision) {
      let path = findPath(s, e, u, false);
      if (path === null) {
        const candidates = [];
        for (const [dx, dy] of NEIGHBORS8) {
          const x = Math.round(u.x) + dx, y = Math.round(u.y) + dy;
          if (walkable(s, x, y) && !(at(s, x, y)?.hp > 0)) candidates.push({ x, y });
        }
        candidates.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
        for (const p of candidates) { path = findPath(s, e, p, false); if (path !== null) break; }
      }
      if (path === null) return false;
      e.path = path; e.pathRevision = s.revision; e.chaseTile = tile;
    }
    if (Math.hypot(u.x - e.x, u.y - e.y) <= .75 && safeUnitSegment(s, e, u.x, u.y, false)) {
      if (e.attack <= 1e-8) { u.hp -= e.damage; e.attack = 1; s.effects.push({ type: 'hit', x: u.x, y: u.y, life: .2, total: .2 }); }
      return true;
    }
    if (!e.path.length && !safeUnitSegment(s, e, u.x, u.y, false)) return false;
    moveUnit(s, e, u, e.speed * (e.slowed > 0 ? e.slowFactor : 1), dt, false);
    return true;
  }
  function safeEnemySegment(s, e, x, y) {
    const size = worldSize(s), sx = Math.round(e.x), sy = Math.round(e.y);
    const clear = (tx, ty) => walkable(s, tx, ty) && !(at(s, tx, ty)?.hp > 0 && (tx !== sx || ty !== sy));
    const samples = Math.max(1, Math.ceil(Math.hypot(x - e.x, y - e.y) / .05));
    let lastX = sx, lastY = sy;
    for (let i = 0; i <= samples; i++) {
      const px = i === samples ? x : e.x + (x - e.x) * i / samples, py = i === samples ? y : e.y + (y - e.y) * i / samples;
      if (px < 0 || py < 0 || px > size - 1 || py > worldHeight(s) - 1) return false;
      const tx = Math.round(px), ty = Math.round(py);
      if (!clear(tx, ty)) return false;
      // A tiny diagonal corner crossing must not slip between consecutive samples.
      if (tx !== lastX && ty !== lastY && (!clear(tx, lastY) || !clear(lastX, ty))) return false;
      lastX = tx; lastY = ty;
    }
    return true;
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
    if (b.type === 'barracks') cleanSoldiers(s);
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
    s = world(s);
    s.enemies = s.enemies.filter(e => {
      if (e.hp > 0) return true;
      const reward = ENEMIES[e.type].reward * (e.boss ? 5 : 1);
      if (s.mode === 'coop') { s.coins += reward / 2; s.partner.coins += reward / 2; }
      else s.coins += reward;
      s.kills++;
      s.effects.push({ type: 'coin', amount: ENEMIES[e.type].reward * (e.boss ? 5 : 1), x: e.x, y: e.y, life: .7, total: .7 }); return false;
    });
  }
  function combat(s, dt) {
    s.projectiles = s.projectiles.filter(p => {
      if (p.type !== 'tower') return true;
      const target = s.enemies.find(e => e.id === p.targetId && e.hp > 0);
      if (!target) return false;
      p.tx = target.x; p.ty = target.y;
      if (p.life > 0) return true;
      target.hp -= p.damage;
      return false;
    });
    collectDead(s);
    const w = s.wave; if (!w) return;
    w.timer -= dt;
    if (w.spawned < w.total && w.timer <= 0) {
      spawnEnemy(s);
      if (s.mode === 'coop' && w.spawned < w.total) spawnEnemy(s);
      w.timer += Math.max(.28, 1.35 - s.day * .045);
    }
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
      const d = DEFS[b.type]; if (!d.damage || b.type === 'barracks') continue;
      b.cooldown -= dt;
      if (b.cooldown > 0) continue;
      const range = d.range + (b.level - 1) * .35;
      let target, nearest = Infinity;
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        const distance = Math.hypot(e.x - b.x, e.y - b.y);
        if (distance <= range && distance < nearest) { target = e; nearest = distance; }
      }
      if (target && b.cooldown <= 0) {
        b.cooldown = d.interval; const damage = d.damage * factor(b) * defenseBoost(s);
        if (d.splash) for (const e of s.enemies) { if (Math.hypot(e.x - target.x, e.y - target.y) <= d.splash) e.hp -= damage * (e.type === 'fox' ? 1.3 : 1); }
        else if (b.type !== 'tower') target.hp -= damage;
        s.projectiles.push({ x: b.x, y: b.y, tx: target.x, ty: target.y, type: b.type, life: .3, total: .3, ...(b.type === 'tower' ? { targetId: target.id, damage } : {}) });
      }
    }
    soldierCombat(s, dt);
    collectDead(s);
    for (const e of s.enemies) {
      if (s.over) break;
      e.attack = Math.max(0, e.attack - dt);
      e.slowed = Math.max(0, (e.slowed || 0) - dt);
      if (e.slowed === 0) e.slowFactor = 1;
      if (e.repelled > 0) { e.repelled -= dt; continue; }
      enemyLane(e);
      const nearby = s.soldiers.filter(u => u.hp > 0 && Math.hypot(u.x - e.x, u.y - e.y) <= 1 && safeUnitSegment(s, e, u.x, u.y, false))
        .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      if (nearby && e.soldierTargetId !== nearby.id) {
        e.soldierTargetId = nearby.id; e.path = []; e.pathRevision = -1; delete e.chaseTile;
      }
      if (e.soldierTargetId != null) {
        if (chaseSoldier(s, e, dt)) continue;
        delete e.soldierTargetId; delete e.chaseTile; e.path = []; e.pathRevision = -1;
      }
      const size = worldWidth(s), laneGoal = p => ({ x: Math.max(0, Math.min(size - 1, p.x + e.laneX)), y: Math.max(0, Math.min(worldHeight(s) - 1, p.y + e.laneY)) });
      if (e.pathRevision !== s.revision || !e.path.length) {
        e.path = findPath(s, e); e.pathRevision = s.revision;
      }
      let p = e.path[0]; if (!p) continue;
      let b = at(s, p.x, p.y), goal = laneGoal(p);
      const attacking = b && b.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) <= 1.05;
      if (attacking) {
        if (e.attack === 0) { hurtBuilding(s, b, e.damage); e.attack = 1; s.effects.push({ type: 'hit', x: b.x, y: b.y, life: .2, total: .2 }); }
      }
      const slow = e.slowed > 0 ? e.slowFactor : 1;
      if (!attacking) {
        // Rejoin the lane inside the current tile before a turn that would cut a corner.
        if (!(b?.hp > 0) && !safeEnemySegment(s, e, goal.x, goal.y)) {
          const tile = { x: Math.round(e.x), y: Math.round(e.y) };
          if (tile.x !== p.x || tile.y !== p.y) { e.path.unshift(tile); p = tile; b = at(s, p.x, p.y); goal = laneGoal(p); }
        }
        const dist = Math.hypot(goal.x - e.x, goal.y - e.y), step = Math.min(dist, e.speed * dt * slow);
        if (dist > .001) {
          const x = step === dist ? goal.x : e.x + (goal.x - e.x) / dist * step, y = step === dist ? goal.y : e.y + (goal.y - e.y) / dist * step;
          if (safeEnemySegment(s, e, x, y)) { e.x = x; e.y = y; }
          else {
            const tile = { x: Math.round(e.x), y: Math.round(e.y) };
            if (tile.x !== p.x || tile.y !== p.y) e.path.unshift(tile);
          }
        }
        if (Math.hypot(goal.x - e.x, goal.y - e.y) <= .001) e.path.shift();
      }
      // Small perpendicular nudges spread a queue without changing its forward speed.
      const dx = (attacking ? b.x : goal.x) - e.x, dy = (attacking ? b.y : goal.y) - e.y, length = Math.hypot(dx, dy);
      if (length > .001) {
        const nx = -dy / length, ny = dx / length; let push = 0;
        for (const other of s.enemies) {
          if (other === e || other.hp <= 0) continue;
          const ox = e.x - other.x, oy = e.y - other.y, distance = Math.hypot(ox, oy);
          if (distance < .3) push += (Math.sign(ox * nx + oy * ny) || (e.id < other.id ? -1 : 1)) * (1 - distance / .3);
        }
        const offset = Math.max(-1, Math.min(1, push)) * .08 * dt;
        const x = e.x + nx * offset, y = e.y + ny * offset;
        if (offset && (!attacking || Math.hypot(x - b.x, y - b.y) <= 1.05) && safeEnemySegment(s, e, x, y)) { e.x = x; e.y = y; }
      }
    }
    cleanSoldiers(s);
    s.projectiles = s.projectiles.filter(p => {
      if (p.type !== 'tower') return true;
      const target = s.enemies.find(e => e.id === p.targetId && e.hp > 0);
      if (!target) return false;
      p.tx = target.x; p.ty = target.y;
      return true;
    });
    if (!s.over && w.spawned >= w.total && !s.enemies.length) dawn(s);
  }
  function chooseSkill(s, id) {
    s = economicView(s);
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(SKILLS, id)) return { ok: false, reason: '未知神技' };
    if (s.selectedSkill !== null) return { ok: false, reason: '神技已选择，不可更换' };
    if (s.over) return { ok: false, reason: '古坊已失守' };
    s.selectedSkill = id;
    return { ok: true };
  }
  function skillReason(s, id) {
    s = economicView(s);
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(SKILLS, id)) return '未知神技';
    if (s.selectedSkill === null) return '请先选择神技';
    if (s.selectedSkill !== id) return '未选择此神技';
    if (s.over || s.phase !== 'night') return '神技仅在夜晚使用';
    if (s.cooldowns[id] > 0) return '还需 ' + Math.ceil(s.cooldowns[id]) + ' 秒';
    return '';
  }
  function skill(s, id) {
    s = economicView(s);
    const reason = skillReason(s, id); if (reason) return { ok: false, reason };
    s.cooldowns[id] = SKILLS[id].cooldown;
    if (id === 'repair') for (const b of s.buildings) healBuilding(s, b, maxHP(b) * .35);
    if (id === 'repel') for (const e of s.enemies) { e.repelled = 4; e.hp -= 20; }
    if (id === 'thunder') for (const e of s.enemies) { e.hp -= e.type === 'ghost' ? 350 : 240; s.effects.push({ type: 'thunder', x: e.x, y: e.y, life: .7, total: .7 }); }
    s.effects.push({ type: id, x: worldCenter(s), y: worldCenterY(s), life: 1, total: 1 }); collectDead(s);
    return { ok: true };
  }
  function step(s, dt) {
    if (s.over || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .25); s.time += dt; s.elapsed += dt;
    for (const id in s.cooldowns) s.cooldowns[id] = Math.max(0, s.cooldowns[id] - dt);
    if (s.mode === 'coop') for (const id in s.partner.cooldowns) s.partner.cooldowns[id] = Math.max(0, s.partner.cooldowns[id] - dt);
    for (const group of [s.effects, s.projectiles]) { for (const e of group) { e.life -= dt; if (e.type === 'tower' && e.life < 1e-8) e.life = 0; } }
    s.effects = s.effects.filter(e => e.life > 0); s.projectiles = s.projectiles.filter(e => e.type === 'tower' || e.life > 0);
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
  function serialize(s) {
    s = world(s);
    const projectiles = s.projectiles.filter(p => p.type === 'tower' && p.life > 0 && s.enemies.some(e => e.id === p.targetId && e.hp > 0))
      .map(({ type, targetId, damage, life, total, x, y, tx, ty }) => ({ type, targetId, damage, life, total, x, y, tx, ty }));
    return JSON.stringify({ ...s, events: [], projectiles, effects: [] });
  }
  function restore(raw) {
    try {
      const s = JSON.parse(raw), finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
      if (!s || typeof s !== 'object') return null;
      for (const player of s.mode === 'coop' ? [s, s.partner] : [s]) {
        if (!player || typeof player !== 'object') return null;
        if (!Object.prototype.hasOwnProperty.call(player, 'selectedSkill')) player.selectedSkill = null;
        if (player.selectedSkill !== null && (typeof player.selectedSkill !== 'string' || !Object.prototype.hasOwnProperty.call(SKILLS, player.selectedSkill))) return null;
      }
      if (s.worldSize === undefined) s.worldSize = 17;
      const coop = s.mode === 'coop';
      if (s.mode !== undefined && !coop) return null;
      if (s.actorId !== undefined || s._world !== undefined) return null;
      if (coop !== [6, 7].includes(s.version)) return null;
      if (coop) {
        if (s.version === 6) { if (s.worldSize !== 40 || (s.worldHeight !== undefined && s.worldHeight !== 40)) return null; }
        else {
          // Dimensions are part of the save; retain the earlier 50-tile rectangles.
          const longSide = Math.max(s.worldSize, s.worldHeight);
          if (![40, 50].includes(longSide) || s.worldSize !== (s.coopLayout === 'horizontal' ? longSide : 25) || s.worldHeight !== (s.coopLayout === 'horizontal' ? 25 : longSide)) return null;
        }
      } else if (![17, 25].includes(s.worldSize) || (s.worldHeight !== undefined && s.worldHeight !== s.worldSize)) return null;
      if (coop) {
        const p = s.partner;
        if (s.mapGeneration !== 2 || !['horizontal', 'vertical'].includes(s.coopLayout) || !p || p.controller !== 'computer' ||
            !['coins','materials'].every(k => finite(p[k])) || !Number.isInteger(p.fortuneBuilt) || p.fortuneBuilt < 0 ||
            !Number.isInteger(p.mission) || p.mission < 0 || p.mission > MISSIONS.length || !p.cooldowns || !Object.keys(SKILLS).every(k => finite(p.cooldowns[k])) ||
            !Number.isInteger(p.gateLevel) || p.gateLevel < 1 || p.gateLevel > GATE_MAX_LEVEL || s.direction > 2) return null;
      }
      const SIZE = worldWidth(s), HEIGHT = worldHeight(s);
      if (s.mapGeneration !== undefined && (s.mapGeneration !== 2 || (!coop && (SIZE !== 25 || s.version !== 5)) || s.mapSeed === undefined || s.estateSeed === undefined)) return null;
      if (s.estateSeed !== undefined && ((!coop && SIZE !== 25) || !Number.isInteger(s.estateSeed) || s.estateSeed < 0 || s.estateSeed > 4294967295 || s.mapSeed === undefined)) return null;
      if (s.version === 5 && (SIZE !== 25 || s.estateSeed === undefined)) return null;
      if (s.version < 5 && (SIZE !== 17 || s.estateSeed !== undefined)) return null;
      if (s.materials === undefined) s.materials = 120; // Pre-material saves receive starting stock.
      delete s.prosperity; delete s.incense;
      if (s.fortuneBuilt === undefined) s.fortuneBuilt = 0;
      if (s.mapSeed !== undefined && (!Number.isInteger(s.mapSeed) || s.mapSeed < 0 || s.mapSeed > 4294967295)) return null;
      if (![1, 2, 3, 4, 5, 6, 7].includes(s.version) || !finite(s.coins) || !finite(s.materials) || !Number.isInteger(s.fortuneBuilt) || s.fortuneBuilt < 0 || !Number.isInteger(s.day) || s.day < 1 || !['day', 'dusk', 'night'].includes(s.phase) || !finite(s.time) || !finite(s.elapsed) || !finite(s.repairTime) || !Number.isInteger(s.mission) || s.mission < 0 || s.mission > MISSIONS.length || !Number.isInteger(s.seed) || !Number.isInteger(s.direction) || s.direction < 0 || s.direction > 3 || !finite(s.kills) || typeof s.over !== 'boolean') return null;
      if (!Array.isArray(s.buildings) || s.buildings.length > SIZE * HEIGHT || !Array.isArray(s.enemies) || s.enemies.length > (coop ? 300 : 150) || !s.cooldowns || !Object.keys(SKILLS).every(k => finite(s.cooldowns[k]))) return null;
      const legacySoldiers = s.soldiers === undefined;
      if (legacySoldiers) s.soldiers = [];
      if (!Array.isArray(s.soldiers) || s.soldiers.length > Math.min(SIZE * HEIGHT * MAX_LEVEL, 1500)) return null;
      const ids = new Set();
      for (const entity of [...s.buildings, ...s.enemies, ...s.soldiers]) {
        if (!entity || !Number.isSafeInteger(entity.id) || entity.id < 1 || ids.has(entity.id)) return null;
        ids.add(entity.id);
      }
      const retired = s.buildings.filter(b => RETIRED_TYPES.has(b.type)).length;
      s.buildings = s.buildings.filter(b => !RETIRED_TYPES.has(b.type));
      const cells = new Set(), land = estate(s);
      for (const b of s.buildings) {
        if (!Object.prototype.hasOwnProperty.call(DEFS,b.type)) return null;
        if (coop && (![0, 1].includes(b.owner) || !owns(playerView(s, b.owner), b.x, b.y))) return null;
        const legacyGrowth = s.version === 1 ? 1.65 : 1.3;
        const savedMaxLevel = s.version === 1 ? (DEFS[b.type].max || 3) : s.version === 2 ? MAX_LEVEL : maxLevel(b);
        const savedMaxHP = s.version < 3 ? Math.round(DEFS[b.type].hp * Math.pow(legacyGrowth, b.level - 1)) : maxHP(b);
        if (!inside(b.x, b.y, s) || !Number.isInteger(b.level) || b.level < 1 || b.level > savedMaxLevel || !finite(b.hp) || (b.hp === 0 && b.type !== 'gate') || b.hp > savedMaxHP + 1 || !Number.isInteger(b.id) || b.id < 1) return null;
        if (b.type === 'gate') {
          if (!land?.gates.some(g => g.x === b.x && g.y === b.y && g.direction === b.direction)) return null;
        } else if (land && (!land.cells.has(b.y * SIZE + b.x) || terrain(b.x, b.y, s) === 'water')) return null;
        const shrineCenter = coop ? land.estates[b.owner].center : { x: worldCenter(s), y: worldCenter(s) };
        if (land && b.type === 'shrine' && (b.x !== shrineCenter.x || b.y !== shrineCenter.y)) return null;
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
        if (b.type === 'barracks') {
          if (b.musteredCount === undefined) {
            if (!legacySoldiers && s.phase === 'night') return null;
            b.musteredCount = s.phase === 'night' ? soldierLimit(b) : 0;
          }
          if (!Number.isInteger(b.musteredCount) || b.musteredCount < 0 || b.musteredCount > soldierLimit(b)) return null;
          if (s.phase !== 'night') delete b.musteredCount;
        } else delete b.musteredCount;
      }
      if (land && s.buildings.filter(b => b.type === 'gate').length !== (coop ? 6 : 4)) return null;
      if (coop) {
        for (const owner of [0, 1]) {
          const p = playerView(s, owner), gates = p.buildings.filter(b => b.type === 'gate');
          if (gates.length !== 3 || !Number.isInteger(p.gateLevel) || p.gateLevel < 1 || p.gateLevel > GATE_MAX_LEVEL || gates.some(b => b.level !== p.gateLevel)) return null;
          const count = p.buildings.filter(b => b.type === 'shrine').length;
          if (count > 1 || (!s.over && count !== 1)) return null;
        }
      }
      if (land && !coop) {
        const gates = s.buildings.filter(b => b.type === 'gate');
        if (s.gateLevel !== undefined && (!Number.isInteger(s.gateLevel) || s.gateLevel < 1 || s.gateLevel > GATE_MAX_LEVEL || gates.some(b => b.level !== s.gateLevel))) return null;
        // Older estate saves upgraded each gate separately; keep their highest purchased level.
        s.gateLevel = s.gateLevel ?? Math.max(...gates.map(b => b.level));
        for (const gate of gates) {
          const ratio = gate.hp / maxHP(gate); gate.level = s.gateLevel; gate.hp = maxHP(gate) * ratio;
        }
      }
      if (!coop && ((!s.over && s.buildings.filter(b => b.type === 'shrine').length !== 1) || s.buildings.filter(b => b.type === 'shrine').length > 1)) return null;
      if (s.phase === 'night' && (!s.wave || !Number.isInteger(s.wave.total) || s.wave.total < 1 || s.wave.total > (coop ? 240 : 120) || !Number.isInteger(s.wave.spawned) || s.wave.spawned < 0 || s.wave.spawned > s.wave.total || !Number.isFinite(s.wave.timer))) return null;
      for (const e of s.enemies) {
        enemyLane(e);
        if (coop) {
          if (e.targetGateId !== undefined) {
            const gate = s.buildings.find(b => b.id === e.targetGateId && b.type === 'gate');
            if (!gate || e.targetOwner !== gate.owner) return null;
          } else if (e.targetOwner !== undefined && ![0, 1].includes(e.targetOwner)) return null;
        } else if (e.targetGateId !== undefined || e.targetOwner !== undefined) return null;
        if (![e.laneX, e.laneY].every(n => Number.isFinite(n) && Math.abs(n) <= .3)) return null;
        if (e.slowed === undefined) e.slowed = 0;
        if (e.slowFactor === undefined) e.slowFactor = 1;
        if (!Object.prototype.hasOwnProperty.call(ENEMIES,e.type) || !Number.isInteger(e.id) || e.id < 1 || !finite(e.x) || e.x >= SIZE || !finite(e.y) || e.y >= HEIGHT || !finite(e.hp) || e.hp <= 0 || !finite(e.maxHp) || e.hp > e.maxHp || !finite(e.speed) || e.speed <= 0 || !finite(e.damage) || e.damage <= 0 || !finite(e.attack) || !Number.isFinite(e.repelled) || !finite(e.slowed) || !Number.isFinite(e.slowFactor) || e.slowFactor <= 0 || e.slowFactor > 1) return null;
        if (!walkable(s, Math.round(e.x), Math.round(e.y))) {
          let nearest = null;
          for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < SIZE; x++) if (walkable(s, x, y)) {
            const distance = (x - e.x) ** 2 + (y - e.y) ** 2;
            if (!nearest || distance < nearest.distance) nearest = { x, y, distance };
          }
          e.x = nearest.x; e.y = nearest.y;
        }
        e.path = []; e.pathRevision = -1;
      }
      if (s.projectiles === undefined) s.projectiles = [];
      if (!Array.isArray(s.projectiles) || s.projectiles.length > 1000) return null;
      const projectiles = [];
      for (const p of s.projectiles) {
        if (!p || p.type !== 'tower' || !Number.isInteger(p.targetId) || p.targetId < 1 || !finite(p.damage) || !finite(p.life) || p.life <= 0 || p.life > .3 || p.total !== .3 || ![p.x, p.tx].every(n => finite(n) && n < SIZE) || ![p.y, p.ty].every(n => finite(n) && n < HEIGHT)) return null;
        const target = s.enemies.find(e => e.id === p.targetId && e.hp > 0);
        if (target) projectiles.push({ type: 'tower', targetId: p.targetId, damage: p.damage, life: p.life, total: .3, x: p.x, y: p.y, tx: target.x, ty: target.y });
      }
      // Older saves could contain buildings in water. Move them without losing their level or earnings.
      // Reserve shore cells for farms before relocating other buildings.
      const occupiedLand = new Set(s.buildings.filter(b => terrain(b.x, b.y, s) !== 'water').map(b => b.x + ',' + b.y));
      let moved = 0, stranded = 0;
      for (const b of s.buildings.filter(b => !land && terrain(b.x, b.y, s) === 'water').sort((a, z) => Number(z.type === 'farm') - Number(a.type === 'farm') || a.id - z.id)) {
        const candidates = [];
        for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < SIZE; x++) {
          const land = terrain(x, y, s);
          if (land === 'water' || (b.type === 'farm' && land !== 'shore') || occupiedLand.has(x + ',' + y)) continue;
          candidates.push({ x, y, score: dist8(b.x, b.y, x, y) * 100 + (Math.abs(b.x - x) + Math.abs(b.y - y)) * 2 + (land === 'shore' && b.type !== 'farm' ? 1 : 0) });
        }
        candidates.sort((a, z) => a.score - z.score || a.y - z.y || a.x - z.x);
        if (!candidates.length) { stranded++; continue; }
        b.x = candidates[0].x; b.y = candidates[0].y;
        occupiedLand.add(b.x + ',' + b.y); moved++;
      }
      if (s.phase !== 'night' && s.soldiers.length) return null;
      const livingCounts = new Map();
      for (const u of s.soldiers) {
        const b = s.buildings.find(b => b.id === u.barracksId && b.type === 'barracks' && b.hp > 0);
        if (!b || !Number.isSafeInteger(u.barracksId) || !finite(u.x) || u.x > SIZE - 1 || !finite(u.y) || u.y > HEIGHT - 1 || u.level !== b.level ||
            u.maxHp !== soldierHP(b) || !finite(u.hp) || u.hp <= 0 || u.hp > u.maxHp || !finite(u.attack) || u.attack > 1 ||
            (u.targetId != null && (!Number.isSafeInteger(u.targetId) || u.targetId < 1))) return null;
        const count = (livingCounts.get(b.id) || 0) + 1; livingCounts.set(b.id, count);
        if (count > b.musteredCount || count > soldierLimit(b)) return null;
        if (!walkable(s, Math.round(u.x), Math.round(u.y))) {
          if (!walkable(s, b.x, b.y)) return null;
          u.x = b.x; u.y = b.y;
        }
        if (!s.enemies.some(e => e.id === u.targetId)) u.targetId = null;
        u.path = []; u.pathRevision = -1; delete u.targetTile;
      }
      for (const e of s.enemies) {
        if (e.soldierTargetId != null && (!Number.isSafeInteger(e.soldierTargetId) || e.soldierTargetId < 1)) return null;
        if (!s.soldiers.some(u => u.id === e.soldierTargetId)) delete e.soldierTargetId;
        delete e.chaseTile;
      }
      s.events = retired ? [{ text: '旧存档中 ' + retired + ' 栋已退役建筑被移除', kind: 'info' }] : [];
      if (moved) s.events.push({ text: '旧存档中 ' + moved + ' 栋建筑已迁出水域', kind: 'info' });
      if (stranded) s.events.push({ text: '岸地已满，' + stranded + ' 栋旧建筑暂保留原位', kind: 'warning' });
      s.effects = []; s.projectiles = projectiles; s.revision = 1; s.version = coop ? s.version : land ? 5 : 4;
      s.nextId = Math.max(0, ...ids) + 1;
      if (!Number.isSafeInteger(s.nextId)) return null;
      return s;
    } catch { return null; }
  }
  return { createCoopState, playerView, raidDirections, SIZE, CENTER, worldSize, worldWidth, worldHeight, worldCenter, worldCenterY, estate, owns, isWall, walkable, DAY, DUSK, MAX_LEVEL, SHRINE_MAX_LEVEL, GROWTH, HP_GROWTH, UPGRADE_GROWTH, SHRINE_REQUIREMENTS, TERRAIN, DEFS, ENEMIES, SKILLS, MISSIONS, chains, terrain, dist8, at, adjacent, dryFarm, factor, incomeFactor, auraFactor, hpFactor, maxLevel, shrineLevel, requiredShrineLevel, unlockedBuildingLevel, maxHP, soldierLimit, soldierHP, soldierDamage, soldierPower, findSoldierPath, visualLevel, name, createState, buildCost, fortuneCandidates, grantBuilding, buildReason, buildHints, build, upgradeCost, upgradeReason, upgradeOptions, bulkUpgrade, upgrade, demolishReason, demolish, income, rates, buildingGuard, defenseBoost, zhongSlow, dusk, startNight, spawnPlots, findPath, chooseSkill, skillReason, skill, step, serialize, restore };
});
