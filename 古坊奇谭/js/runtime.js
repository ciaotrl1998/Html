var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GF = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  const SIZE = 25, CENTER = 12, DAY = 72, DUSK = 8, MAX_LEVEL = 9, SHRINE_MAX_LEVEL = 15;
  const worldSize = (s) => {
    var _a;
    return (_a = s == null ? void 0 : s.worldSize) != null ? _a : s ? 25 : 17;
  };
  const worldCenter = (s) => Math.floor(worldSize(s) / 2);
  const GROWTH = 2, HP_GROWTH = 1.55, UPGRADE_GROWTH = 2.15;
  const SHRINE_REQUIREMENTS = [0, 1, 2, 3, 5, 7, 9, 11, 13, 15];
  const TERRAIN = { plain: "平地", shore: "水岸", water: "水域", forest: "林地", mountain: "山地" };
  const DEFS = {};
  function def(id, name2, cat, cost, hp, extra) {
    DEFS[id] = __spreadValues({ id, name: name2, cat, cost, hp }, extra);
  }
  const chains = [
    ["tea", "inn", "bank", "茶肆", "客栈", "钱庄", "plain", "商", "#d6a450"],
    ["farm", "mill", "wine", "农田", "磨坊", "酒坊", "shore", "农", "#89a663"],
    ["mulberry", "weaver", "tailor", "桑园", "织坊", "成衣铺", "forest", "丝", "#b38ba7"],
    ["quarry", "kiln", "trade", "石场", "瓷窑", "商号", "mountain", "工", "#7b9fa2"]
  ];
  const CHAIN_BASE = [1, 0, 0, 1];
  const COIN_CHAIN_COSTS = [{ coins: 0, materials: 65 }, { coins: 110, materials: 240 }, { coins: 430, materials: 750 }];
  const MATERIAL_CHAIN_COSTS = [{ coins: 95, materials: 0 }, { coins: 290, materials: 70 }, { coins: 920, materials: 300 }];
  chains.forEach((a, ci) => {
    for (let i = 0; i < 3; i++) {
      const baseCost = (ci < 2 ? COIN_CHAIN_COSTS : MATERIAL_CHAIN_COSTS)[i], high = ci === 0 || ci === 3;
      const costFactor = (high ? 1.5 : 1) * (i === 2 ? high ? 40 / 9 : 4 : 1);
      def(a[i], a[i + 3], "economy", { coins: Math.ceil(baseCost.coins * costFactor), materials: Math.ceil(baseCost.materials * costFactor) }, [180, 250, 340][i], {
        income: (high ? [2, 5, 40] : [1, 3, 24])[i],
        resource: ci < 2 ? "coins" : "materials",
        terrain: i === 0 ? a[6] : null,
        prev: i ? a[i - 1] : null,
        chain: a[7],
        color: a[8],
        end: i === 2,
        tier: i,
        radius: CHAIN_BASE[ci] + i,
        limit: i === 0 ? [6, 8, 8, 6][ci] : i === 1 ? 3 : 1,
        names: [a[i + 3], i === 0 ? ["清茗茶肆", "临水良田", "葱郁桑园", "青石矿场"][ci] : "兴旺" + a[i + 3], "鼎盛" + a[i + 3]]
      });
    }
  });
  def("guild", "汇财会馆", "economy", { coins: 44572, materials: 66858 }, 600, { income: 240, resource: "coins", aura: 0.05, auraResource: "coins", required: ["bank", "wine"], radius: 4, limit: 1 });
  def("port", "百工院", "economy", { coins: 70500, materials: 37500 }, 900, { income: 300, resource: "materials", aura: 0.1, auraResource: "materials", required: ["tailor", "trade"], radius: 4, limit: 1 });
  def("tower", "箭塔", "defense", { coins: 95, materials: 70 }, 300, { damage: 22, range: 4, interval: 0.85, desc: "单体远射 · 射程 4 格" });
  def("rock", "擂石台", "defense", { coins: 260, materials: 190 }, 380, { damage: 46, range: 3.8, interval: 2.5, splash: 1.35, fortuneOnly: true, desc: "范围轰击 · 仅可由造化匣获得" });
  def("barracks", "兵营", "defense", { coins: 320, materials: 240 }, 420, { damage: 18, range: 4.5, interval: 0.8, desc: "自动派出民兵近战" });
  def("well", "水井", "support", { coins: 120, materials: 65 }, 250, { fortuneOnly: true, desc: "井旁平地可建农田 · 相邻农田收入 +20%" });
  def("stage", "戏台", "support", { coins: 400, materials: 300 }, 280, { aura: 0.03, fortuneOnly: true, desc: "全镇收入 +3%" });
  def("shrine", "祠堂", "temple", { coins: 0, materials: 0 }, 1800, { income: 0.4, resource: "coins", desc: "古坊之根 · 决定全坊升级上限", unique: true, upgradeBase: { coins: 120, materials: 90 }, upgradeGrowth: 1.65, names: ["古坊祠堂", "百福祠堂", "万安宗祠"] });
  def("earth", "土地庙", "temple", { coins: 140, materials: 95 }, 260, { guard: 0.2, range: 3, fortuneOnly: true, desc: "三格内建筑受到伤害 -20%" });
  def("zhong", "钟馗像", "temple", { coins: 250, materials: 180 }, 430, { slow: 0.4, pulseInterval: 12, slowDuration: 4, fortuneOnly: true, desc: "每 12 秒使全体怪物减速 40%，持续 4 秒" });
  def("tao", "道观", "temple", { coins: 450, materials: 330 }, 380, { powerAura: 0.15, fortuneOnly: true, desc: "全镇防御建筑攻击 +15%" });
  def("fortune", "造化匣", "mystery", { coins: 90, materials: 60 }, 1, { desc: "变化为随机建筑" });
  def("gate", "庄园城门", "defense", { coins: 95, materials: 120 }, 700, { fixed: true, desc: "庄园唯一入口 · 可升级与修复" });
  const ENEMIES = {
    bandit: { name: "山匪", hp: 100, speed: 0.65, damage: 14, reward: 8 },
    ghost: { name: "阴兵", hp: 220, speed: 0.42, damage: 23, reward: 12 },
    fox: { name: "妖狐", hp: 75, speed: 1.1, damage: 12, reward: 10 }
  };
  const SKILLS = { repel: { name: "驱鬼符", cooldown: 18 }, repair: { name: "回春诀", cooldown: 24 }, thunder: { name: "九霄天雷", cooldown: 22 } };
  const MISSIONS = [
    { title: "一盏茶，起一座坊", desc: "在平地建造一间茶肆", reward: 60, test: (s) => s.buildings.some((b) => b.type === "tea") },
    { title: "客来茶香，产业相连", desc: "紧挨茶肆建造客栈", reward: 90, test: (s) => s.buildings.some((b) => b.type === "inn") },
    { title: "立箭塔，护一方安宁", desc: "建造两座箭塔，准备入夜", reward: 100, test: (s) => s.buildings.filter((b) => b.type === "tower").length >= 2 },
    { title: "造化初开", desc: "开启一次造化匣", reward: 75, test: (s) => s.fortuneBuilt >= 1 },
    { title: "长夜过，古坊安", desc: "守住第一夜", reward: 120, test: (s) => s.day >= 2 },
    { title: "百业初兴", desc: "建成任意两种经济链终点建筑", reward: 200, test: (s) => new Set(s.buildings.filter((b) => DEFS[b.type].end).map((b) => b.type)).size >= 2 },
    { title: "四方会聚", desc: "建成一座汇财会馆", reward: 300, test: (s) => s.buildings.some((b) => b.type === "guild") },
    { title: "万家灯火", desc: "守过第七夜，迎来太平晨光", reward: 500, test: (s) => s.day >= 8 }
  ];
  function baseTerrain(x, y, s) {
    if ((s == null ? void 0 : s.mapSeed) !== void 0) return generatedTerrain(s)[y * worldSize(s) + x] || "plain";
    if (x >= 1 && x <= 4 && y >= 5 && y <= 12 || x >= 3 && x <= 6 && y >= 11 && y <= 14) return "water";
    if (x >= 10 && x <= 14 && y >= 2 && y <= 6 || x >= 2 && x <= 5 && y >= 1 && y <= 3) return "forest";
    if (x >= 11 && x <= 15 && y >= 11 && y <= 15) return "mountain";
    return "plain";
  }
  const inside = (x, y, s) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < worldSize(s) && y < worldSize(s);
  const dist8 = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const NEIGHBORS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const terrainCache = /* @__PURE__ */ new WeakMap();
  function generatedTerrain(s) {
    const cached = terrainCache.get(s);
    if ((cached == null ? void 0 : cached.seed) === s.mapSeed && cached.size === worldSize(s) && cached.generation === s.mapGeneration) return cached.cells;
    if (s.mapGeneration === 2) return variedTerrain(s);
    if (worldSize(s) === 25) return newTerrain(s);
    const SIZE2 = 17, CENTER2 = 8;
    let seed = s.mapSeed >>> 0;
    const rand = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const cells = Array(SIZE2 * SIZE2).fill("plain"), turn = Math.floor(rand() * 4);
    const index = (x, y) => {
      for (let i = 0; i < turn; i++) [x, y] = [SIZE2 - 1 - y, x];
      return y * SIZE2 + x;
    };
    let rx = 2 + Math.floor(rand() * 2);
    for (let y = 1; y < SIZE2 - 1; y++) {
      const next = Math.max(1, Math.min(4, rx + (rand() < 0.65 ? Math.floor(rand() * 3) - 1 : 0)));
      for (let x = Math.min(rx, next); x <= Math.max(rx, next); x++) cells[index(x, y)] = "water";
      rx = next;
      if (rand() < 0.4 && rx < 4) cells[index(rx + 1, y)] = "water";
    }
    const lakeCount = 1 + Math.floor(rand() * 2);
    for (let lake = 0; lake < lakeCount; lake++) {
      const candidates = [];
      for (let y = 2; y <= 14; y++) for (let x = 10; x <= 14; x++) {
        if (Math.max(Math.abs(x - CENTER2), Math.abs(y - CENTER2)) <= 3) continue;
        if (NEIGHBORS8.every(([dx, dy]) => cells[index(x + dx, y + dy)] !== "water") && cells[index(x, y)] !== "water") candidates.push([x, y]);
      }
      if (!candidates.length) continue;
      const patch = [candidates[Math.floor(rand() * candidates.length)]], own = /* @__PURE__ */ new Set();
      const target = 5 + Math.floor(rand() * 4);
      while (patch.length) {
        const [x, y] = patch.splice(Math.floor(rand() * patch.length), 1)[0], key = index(x, y);
        if (own.has(key) || x < 9 || x > 15 || y < 1 || y > 15 || Math.max(Math.abs(x - CENTER2), Math.abs(y - CENTER2)) <= 3) continue;
        if (cells[key] === "water" || NEIGHBORS8.some(([dx, dy]) => cells[index(x + dx, y + dy)] === "water" && !own.has(index(x + dx, y + dy)))) continue;
        own.add(key);
        cells[key] = "water";
        if (own.size >= target) break;
        patch.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      if (own.size < 5) for (const key of own) cells[key] = "plain";
    }
    const reached = /* @__PURE__ */ new Set([CENTER2 * SIZE2 + CENTER2]), queue = [CENTER2 * SIZE2 + CENTER2];
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i], x = key % SIZE2, y = Math.floor(key / SIZE2);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, next = ny * SIZE2 + nx;
        if (inside(nx, ny) && cells[next] !== "water" && !reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    for (let key = 0; key < cells.length; key++) if (!reached.has(key)) cells[key] = "water";
    for (const type of ["forest", "mountain"]) {
      const count = type === "forest" ? 3 : 2;
      for (let p = 0; p < count; p++) {
        const cx = 2 + rand() * 12, cy = rand() < 0.5 ? 2 + rand() * 3 : 12 + rand() * 2;
        const ax = 2 + rand() * 1.8, ay = 1.8 + rand() * 1.4;
        for (let y = 0; y < SIZE2; y++) for (let x = 0; x < SIZE2; x++) {
          const key = index(x, y);
          if (cells[key] !== "plain" || Math.max(Math.abs(x - CENTER2), Math.abs(y - CENTER2)) <= 2) continue;
          if (NEIGHBORS8.some(([dx, dy]) => inside(x + dx, y + dy) && cells[index(x + dx, y + dy)] === "water")) continue;
          if (((x - cx) / ax) ** 2 + ((y - cy) / ay) ** 2 < 0.8 + rand() * 0.4) cells[key] = type;
        }
      }
      if (!cells.includes(type)) {
        const candidates = [];
        for (let y = 1; y < SIZE2 - 1; y++) for (let x = 1; x < SIZE2 - 1; x++) {
          const key2 = index(x, y);
          if (Math.max(Math.abs(x - CENTER2), Math.abs(y - CENTER2)) > 3 && cells[key2] !== "water" && NEIGHBORS8.every(([dx, dy]) => cells[index(x + dx, y + dy)] !== "water")) candidates.push(key2);
        }
        const key = candidates[Math.floor(rand() * candidates.length)];
        if (key !== void 0) {
          cells[key] = type;
          const x = key % SIZE2, y = Math.floor(key / SIZE2);
          for (const [dx, dy] of NEIGHBORS8) {
            const nx = x + dx, ny = y + dy;
            if (inside(nx, ny) && Math.max(Math.abs(nx - CENTER2), Math.abs(ny - CENTER2)) > 2 && cells[ny * SIZE2 + nx] !== "water" && NEIGHBORS8.every(([sx, sy]) => !inside(nx + sx, ny + sy) || cells[(ny + sy) * SIZE2 + nx + sx] !== "water")) cells[ny * SIZE2 + nx] = type;
          }
        }
      }
    }
    terrainCache.set(s, { seed: s.mapSeed, size: SIZE2, cells });
    return cells;
  }
  function newTerrain(s) {
    let seed = s.mapSeed >>> 0;
    const rand = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const cells = Array(625).fill("plain");
    let rx = 7;
    for (let y = 1; y < 24; y++) {
      const next = Math.max(6, Math.min(8, rx + Math.floor(rand() * 3) - 1));
      for (let x = Math.min(rx, next); x <= Math.max(rx, next); x++) cells[y * 25 + x] = "water";
      rx = next;
    }
    const lakeX = 17 + Math.floor(rand() * 4), lakeY = 2 + Math.floor(rand() * 3);
    const target = 5 + Math.floor(rand() * 5), lake = /* @__PURE__ */ new Set(), frontier = [[lakeX, lakeY]];
    while (lake.size < target && frontier.length) {
      const [x, y] = frontier.splice(Math.floor(rand() * frontier.length), 1)[0], key = y * 25 + x;
      if (x < 16 || x > 22 || y < 1 || y > 7 || lake.has(key)) continue;
      lake.add(key);
      cells[key] = "water";
      frontier.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    for (const [type, anchors] of [["forest", [[10, 9], [16, 8], [4, 18]]], ["mountain", [[14, 15], [17, 16], [21, 12]]]]) {
      for (const [cx, cy] of anchors) {
        const radius = 1.4 + rand() * 1.3;
        for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
          if (!inside(x, y, s) || dist8(x, y, 12, 12) <= 2 || cells[y * 25 + x] !== "plain") continue;
          if (NEIGHBORS8.some(([dx, dy]) => cells[(y + dy) * 25 + x + dx] === "water")) continue;
          if (Math.hypot(x - cx, y - cy) < radius + rand() * 0.5) cells[y * 25 + x] = type;
        }
      }
    }
    terrainCache.set(s, { seed: s.mapSeed, size: 25, cells });
    return cells;
  }
  function variedTerrain(s) {
    let seed = s.mapSeed >>> 0;
    const rand = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const pick = (n) => Math.floor(rand() * n), cells = Array(625).fill("plain"), turn = pick(4);
    const index = (x, y) => {
      for (let i = 0; i < turn; i++) [x, y] = [24 - y, x];
      return y * 25 + x;
    };
    let rx = 2 + pick(8);
    for (let y = 1; y < 24; y++) {
      const limit = y >= 8 && y <= 16 ? 8 : 9;
      const target = y >= 10 && y <= 14 ? 8 : Math.max(2, Math.min(limit, rx + pick(5) - 2));
      const next = Math.min(limit, target);
      for (let x = Math.min(rx, next); x <= Math.max(rx, next); x++) cells[index(x, y)] = "water";
      rx = next;
    }
    const lakeCount = 1 + pick(3);
    for (let n = 0; n < lakeCount; n++) {
      const candidates = [];
      for (let y = 2; y <= 22; y++) for (let x = 2; x <= 22; x++) {
        if (dist8(x, y, 12, 12) <= 4 || cells[y * 25 + x] === "water") continue;
        if (NEIGHBORS8.every(([dx, dy]) => cells[(y + dy) * 25 + x + dx] !== "water")) candidates.push([x, y]);
      }
      if (!candidates.length) break;
      const frontier = [candidates[pick(candidates.length)]], lake = /* @__PURE__ */ new Set(), target = 5 + pick(5);
      while (frontier.length && lake.size < target) {
        const [x, y] = frontier.splice(pick(frontier.length), 1)[0], key = y * 25 + x;
        if (x < 1 || x > 23 || y < 1 || y > 23 || dist8(x, y, 12, 12) <= 3 || lake.has(key) || cells[key] === "water") continue;
        if (NEIGHBORS8.some(([dx, dy]) => cells[(y + dy) * 25 + x + dx] === "water" && !lake.has((y + dy) * 25 + x + dx))) continue;
        lake.add(key);
        cells[key] = "water";
        frontier.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      if (lake.size < 5) for (const key of lake) cells[key] = "plain";
    }
    const reached = /* @__PURE__ */ new Set([312]), queue = [312];
    for (let i = 0; i < queue.length; i++) {
      const x = queue[i] % 25, y = Math.floor(queue[i] / 25);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, key = ny * 25 + nx;
        if (inside(nx, ny, s) && cells[key] !== "water" && !reached.has(key)) {
          reached.add(key);
          queue.push(key);
        }
      }
    }
    for (let key = 0; key < 625; key++) if (!reached.has(key)) cells[key] = "water";
    const dry = (x, y) => inside(x, y, s) && dist8(x, y, 12, 12) > 2 && cells[y * 25 + x] === "plain" && NEIGHBORS8.every(([dx, dy]) => !inside(x + dx, y + dy, s) || cells[(y + dy) * 25 + x + dx] !== "water");
    const anchors = [];
    for (const type of ["forest", "mountain"]) {
      const candidates = [];
      for (let y2 = 9; y2 <= 15; y2++) for (let x2 = 9; x2 <= 15; x2++) if (dry(x2, y2)) candidates.push([x2, y2]);
      const [x, y] = candidates[pick(candidates.length)];
      cells[y * 25 + x] = type;
      anchors.push({ type, x, y });
    }
    for (const type of ["forest", "mountain"]) {
      const anchor = anchors.find((a) => a.type === type), patches = [anchor];
      for (let i = 0, n = 2 + pick(3); i < n; i++) patches.push({ x: 2 + pick(21), y: 2 + pick(21) });
      for (const { x: cx, y: cy } of patches) {
        const ax = 1.5 + rand() * 2.5, ay = 1.5 + rand() * 2.5;
        for (let y = Math.max(0, cy - 4); y <= Math.min(24, cy + 4); y++) for (let x = Math.max(0, cx - 4); x <= Math.min(24, cx + 4); x++) {
          if (dry(x, y) && ((x - cx) / ax) ** 2 + ((y - cy) / ay) ** 2 < 0.7 + rand() * 0.6) cells[y * 25 + x] = type;
        }
      }
    }
    terrainCache.set(s, { seed: s.mapSeed, size: 25, generation: s.mapGeneration, cells });
    return cells;
  }
  const estateCache = /* @__PURE__ */ new WeakMap();
  function estate(s) {
    if ((s == null ? void 0 : s.estateSeed) === void 0) return null;
    const cached = estateCache.get(s);
    if ((cached == null ? void 0 : cached.seed) === s.estateSeed && cached.mapSeed === s.mapSeed && cached.generation === s.mapGeneration) return cached.value;
    generatedTerrain(s);
    let seed = s.estateSeed >>> 0;
    const rand = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const size = worldSize(s), center = worldCenter(s), cells = /* @__PURE__ */ new Set(), walls = /* @__PURE__ */ new Set(), roads = /* @__PURE__ */ new Set(), rows = [];
    let top = 6, bottom = 18;
    if (s.mapGeneration === 2) {
      top = 6 + Math.floor(rand() * 3);
      bottom = 16 + Math.floor(rand() * 3);
      const west = 6 + Math.floor(rand() * 3), east = 16 + Math.floor(rand() * 3);
      const shape = Math.floor(rand() * 3), corners = Array.from({ length: 4 }, () => Math.floor(rand() * 4));
      for (let y = top; y <= bottom; y++) {
        const upper = y <= 12, t = Math.abs(y - 12) / (upper ? 12 - top : bottom - 12);
        const profile = shape === 0 ? t : shape === 1 ? t * t : Math.max(0, t - 0.5) * 2;
        rows[y] = [Math.min(9, west + Math.floor(profile * corners[upper ? 0 : 2])), Math.max(15, east - Math.floor(profile * corners[upper ? 1 : 3]))];
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
    const gates = [
      { x: center, y: top - 1, direction: 0 },
      { x: rows[12][1] + 1, y: center, direction: 1 },
      { x: center, y: bottom + 1, direction: 2 },
      { x: rows[12][0] - 1, y: center, direction: 3 }
    ];
    for (const g of gates) walls.delete(g.y * size + g.x);
    const root = center * size + center, parents = /* @__PURE__ */ new Map([[root, null]]), queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i];
      for (const offset of [-size, 1, size, -1]) {
        const next = key + offset;
        if (cells.has(next) && !parents.has(next)) {
          parents.set(next, key);
          queue.push(next);
        }
      }
    }
    const connect = (key) => {
      var _a;
      while (key !== null) {
        roads.add(key);
        key = (_a = parents.get(key)) != null ? _a : null;
      }
    };
    for (const [i, g] of gates.entries()) {
      const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][i];
      connect((g.y - dy) * size + g.x - dx);
      for (let x = g.x, y = g.y; inside(x, y, s); x += dx, y += dy) roads.add(y * size + x);
    }
    const value = { cells, walls, gates, roads };
    estateCache.set(s, { seed: s.estateSeed, mapSeed: s.mapSeed, generation: s.mapGeneration, value });
    return value;
  }
  function owns(s, x, y) {
    if (!inside(x, y, s)) return false;
    const land = estate(s), key = y * worldSize(s) + x;
    return !land || land.cells.has(key) || land.walls.has(key) || land.gates.some((g) => g.x === x && g.y === y);
  }
  function isWall(s, x, y) {
    var _a;
    return inside(x, y, s) && !!((_a = estate(s)) == null ? void 0 : _a.walls.has(y * worldSize(s) + x));
  }
  function walkable(s, x, y) {
    var _a;
    if (!inside(x, y, s) || isWall(s, x, y)) return false;
    return terrain(x, y, s) !== "water" || !!((_a = estate(s)) == null ? void 0 : _a.roads.has(y * worldSize(s) + x));
  }
  function terrain(x, y, s) {
    if (!inside(x, y, s)) return "plain";
    const base = baseTerrain(x, y, s);
    return base === "plain" && NEIGHBORS8.some(([dx, dy]) => inside(x + dx, y + dy, s) && baseTerrain(x + dx, y + dy, s) === "water") ? "shore" : base;
  }
  const at = (s, x, y) => s.buildings.find((b) => b.x === x && b.y === y);
  const adjacent = (s, x, y) => s.buildings.filter((b) => dist8(b.x, b.y, x, y) === 1);
  const dryFarm = (s, b) => b.type === "farm" && terrain(b.x, b.y, s) !== "shore" && !adjacent(s, b.x, b.y).some((n) => n.type === "well");
  const isPrereq = (d, nd) => {
    var _a;
    return d.chain ? nd.id === d.prev : !!((_a = d.required) == null ? void 0 : _a.includes(nd.id));
  };
  const RETIRED_TYPES = /* @__PURE__ */ new Set(["home", "market", "fence"]);
  const factor = (b) => Math.pow(GROWTH, b.level - 1);
  const incomeFactor = (b) => b.type === "shrine" ? Math.pow(2, Math.min(2, b.level - 1)) * (1 + 0.25 * Math.max(0, b.level - 3)) : Math.pow(2, Math.min(2, b.level - 1)) * Math.pow(1.65, Math.max(0, b.level - 3));
  const auraFactor = (b) => Math.pow(2, Math.min(2, b.level - 1)) * (1 + 0.2 * Math.max(0, b.level - 3));
  const hpFactor = (b) => Math.pow(HP_GROWTH, b.level - 1);
  const maxLevel = (b) => (b == null ? void 0 : b.type) === "shrine" ? SHRINE_MAX_LEVEL : MAX_LEVEL;
  const shrineLevel = (s) => {
    var _a;
    return ((_a = s.buildings.find((b) => b.type === "shrine")) == null ? void 0 : _a.level) || 0;
  };
  const requiredShrineLevel = (level) => SHRINE_REQUIREMENTS[Math.min(MAX_LEVEL, Math.max(1, level))];
  const unlockedBuildingLevel = (s) => {
    const level = shrineLevel(s);
    let unlocked = 1;
    for (let target = 2; target <= MAX_LEVEL; target++) if (level >= requiredShrineLevel(target)) unlocked = target;
    return unlocked;
  };
  const maxHP = (b) => Math.round(DEFS[b.type].hp * hpFactor(b));
  const visualLevel = (level) => Math.min(3, Math.floor((level - 1) / 3) + 1);
  const name = (b) => {
    var _a;
    return ((_a = DEFS[b.type].names) == null ? void 0 : _a[visualLevel(b.level) - 1]) || (visualLevel(b.level) === 1 ? DEFS[b.type].name : (visualLevel(b.level) === 2 ? "兴盛" : "鼎盛") + DEFS[b.type].name);
  };
  function addBuilding(s, type, x, y, level = 1, extra = {}) {
    const b = __spreadValues({ id: s.nextId++, type, x, y, level, hp: Math.round(DEFS[type].hp * Math.pow(HP_GROWTH, level - 1)), cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0 }, extra);
    s.buildings.push(b);
    s.revision++;
    return b;
  }
  function grantBuilding(s, type, x, y, level = unlockedBuildingLevel(s), originCost) {
    var _a;
    if (!DEFS[type] || type === "fortune" || DEFS[type].unique || DEFS[type].fixed || !owns(s, x, y) || isWall(s, x, y) || ((_a = estate(s)) == null ? void 0 : _a.gates.some((g) => g.x === x && g.y === y)) || terrain(x, y, s) === "water" || at(s, x, y)) return null;
    return addBuilding(s, type, x, y, Math.min(level, maxLevel({ type })), originCost ? { originCost } : {});
  }
  function createState(mapSeed = Math.floor(Math.random() * 4294967296), mapGeneration = 2) {
    var _a;
    const s = {
      version: mapSeed === null ? 4 : 5,
      worldSize: mapSeed === null ? 17 : 25,
      seed: 73193,
      nextId: 1,
      coins: 200,
      materials: mapSeed === null ? 120 : 220,
      fortuneBuilt: 0,
      day: 1,
      phase: "day",
      time: 0,
      elapsed: 0,
      repairTime: 0,
      direction: 0,
      buildings: [],
      enemies: [],
      projectiles: [],
      effects: [],
      events: [],
      kills: 0,
      wave: null,
      cooldowns: { repel: 0, repair: 0, thunder: 0 },
      mission: 0,
      revision: 0,
      over: false,
      celebrated: false
    };
    if (mapSeed !== null) {
      s.mapSeed = mapSeed >>> 0;
      s.estateSeed = (Math.imul(s.mapSeed, 2246822519) ^ 3266489917) >>> 0;
      s.gateLevel = 1;
    }
    if (mapSeed !== null && mapGeneration === 2) s.mapGeneration = 2;
    const center = worldCenter(s);
    addBuilding(s, "shrine", center, center);
    for (const g of ((_a = estate(s)) == null ? void 0 : _a.gates) || []) addBuilding(s, "gate", g.x, g.y, 1, { direction: g.direction });
    return s;
  }
  function random(s) {
    s.seed = Math.imul(s.seed, 1664525) + 1013904223 >>> 0;
    return s.seed / 4294967296;
  }
  function shortage(s, cost) {
    const missing = [];
    if (s.coins < cost.coins) missing.push(Math.ceil(cost.coins - s.coins) + " 铜钱");
    if (s.materials < cost.materials) missing.push(Math.ceil(cost.materials - s.materials) + " 工材");
    return missing.length ? "差 " + missing.join("、") : "";
  }
  function pay(s, cost) {
    s.coins -= cost.coins;
    s.materials -= cost.materials;
  }
  function buildCost(s, type) {
    var _a;
    if (type !== "fortune") return ((_a = DEFS[type]) == null ? void 0 : _a.cost) || { coins: 0, materials: 0 };
    const multiple = Math.pow(1.8, s.fortuneBuilt || 0);
    return { coins: Math.ceil(DEFS.fortune.cost.coins * multiple), materials: Math.ceil(DEFS.fortune.cost.materials * multiple) };
  }
  function fortuneCandidates(s, x, y) {
    var _a;
    if (!owns(s, x, y) || isWall(s, x, y) || ((_a = estate(s)) == null ? void 0 : _a.gates.some((g) => g.x === x && g.y === y)) || at(s, x, y) || terrain(x, y, s) === "water") return [];
    const plot = terrain(x, y, s);
    return Object.values(DEFS).filter((d) => {
      if (d.id === "fortune" || d.unique || d.fixed || d.income || d.limit && s.buildings.filter((b) => b.type === d.id).length >= d.limit) return false;
      if (d.cat === "economy" && plot === "forest" && d.id !== "mulberry") return false;
      if (d.cat === "economy" && plot === "mountain" && d.id !== "quarry") return false;
      if (d.id === "farm" && plot !== "shore" && !(plot === "plain" && adjacent(s, x, y).some((b) => b.type === "well"))) return false;
      if (d.id !== "farm" && d.terrain && plot !== d.terrain) return false;
      return true;
    });
  }
  function buildReason(s, type, x, y) {
    var _a;
    const d = DEFS[type];
    if (!d) return "未知建筑";
    if (s.over) return "古坊已失守";
    if (!owns(s, x, y) || isWall(s, x, y)) return "请选择庄园内地块";
    if (at(s, x, y)) return "此地已有建筑";
    if ((_a = estate(s)) == null ? void 0 : _a.gates.some((g) => g.x === x && g.y === y)) return "城门地块不可建造";
    const plot = terrain(x, y, s);
    if (plot === "water") return "水域不可建造";
    if (d.fixed) return "城门仅可由庄园生成";
    if (s.enemies.some((e) => Math.hypot(e.x - x, e.y - y) < 0.65)) return "敌人正在此地";
    if (d.unique) return "祠堂仅此一座";
    if (d.fortuneOnly) return "仅可由造化匣获得";
    if (type === "fortune") return fortuneCandidates(s, x, y).length ? shortage(s, buildCost(s, type)) : "此地无可造化建筑";
    if (d.limit && s.buildings.filter((b) => b.type === type).length >= d.limit) return "已达上限（" + d.limit + "座）";
    if (d.cat === "economy" && plot === "forest" && type !== "mulberry") return "林地仅可建桑园";
    if (d.cat === "economy" && plot === "mountain" && type !== "quarry") return "山地仅可建石场";
    if (type === "farm") {
      if (plot !== "shore" && !(plot === "plain" && adjacent(s, x, y).some((b) => b.type === "well"))) return "需水岸或水井旁平地";
    } else if (d.terrain && plot !== d.terrain) return "需" + TERRAIN[d.terrain];
    if (d.radius && s.buildings.some((b) => b.type === type && dist8(b.x, b.y, x, y) <= d.radius)) return "范围内已有相同建筑";
    if (d.prev && !adjacent(s, x, y).some((b) => b.type === d.prev)) return "需紧挨" + DEFS[d.prev].name;
    if (d.required) {
      const nearby = new Set(adjacent(s, x, y).map((b) => b.type));
      const missing = d.required.filter((id) => !nearby.has(id));
      if (missing.length) return "需紧邻" + missing.map((id) => DEFS[id].name).join("、");
    }
    return shortage(s, buildCost(s, type));
  }
  function event(s, text, kind = "info") {
    s.events.push({ text, kind });
    if (s.events.length > 30) s.events.shift();
  }
  function missions(s) {
    var _a;
    while ((_a = MISSIONS[s.mission]) == null ? void 0 : _a.test(s)) {
      const m = MISSIONS[s.mission++];
      s.coins += m.reward;
      event(s, "坊志达成：" + m.title + " · +" + m.reward + " 铜钱", "reward");
    }
  }
  function build(s, type, x, y) {
    const reason = buildReason(s, type, x, y);
    if (reason) return { ok: false, reason };
    const cost = buildCost(s, type);
    pay(s, cost);
    if (type === "fortune") {
      const candidates = fortuneCandidates(s, x, y), rolled = candidates[Math.floor(random(s) * candidates.length)], level = unlockedBuildingLevel(s);
      s.fortuneBuilt++;
      const b2 = grantBuilding(s, rolled.id, x, y, level, cost);
      event(s, "造化匣化为" + rolled.name + " Lv" + level, "reward");
      missions(s);
      return { ok: true, building: b2, rolled: rolled.id };
    }
    const b = addBuilding(s, type, x, y);
    missions(s);
    return { ok: true, building: b };
  }
  function upgradeCost(b) {
    const d = DEFS[b.type], base = d.upgradeBase || d.cost, multiple = 1.8 * Math.pow(d.upgradeGrowth || UPGRADE_GROWTH, b.level - 1) * Math.pow(b.type === "shrine" ? 1.08 : d.income ? 1.12 : 1, Math.max(0, b.level - (b.type === "shrine" ? 7 : 4)));
    return { coins: Math.ceil(base.coins * multiple), materials: Math.ceil(base.materials * multiple) };
  }
  function upgradeReason(s, b) {
    if (!b || !s.buildings.includes(b)) return "建筑已不存在";
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return "仅可升级庄园内建筑";
    if (s.over) return "古坊已失守";
    const d = DEFS[b.type];
    if (b.level >= maxLevel(b)) return "已达最高等级";
    if (b.type !== "shrine") {
      const required = requiredShrineLevel(b.level + 1), current = shrineLevel(s);
      if (current < required) return "需祠堂 Lv" + required + "（当前 Lv" + current + "）";
    }
    if (d.prev && !adjacent(s, b.x, b.y).some((n) => n.type === d.prev && n.level >= b.level + 1)) return "需邻" + DEFS[d.prev].name + " Lv" + (b.level + 1);
    if (d.required) {
      for (const id of d.required) if (!adjacent(s, b.x, b.y).some((n) => n.type === id && n.level >= b.level + 1)) return "需邻" + DEFS[id].name + " Lv" + (b.level + 1);
    }
    return shortage(s, upgradeCost(b));
  }
  function upgrade(s, b) {
    const reason = upgradeReason(s, b);
    if (reason) return { ok: false, reason };
    pay(s, upgradeCost(b));
    const targets = b.type === "gate" ? s.buildings.filter((n) => n.type === "gate") : [b];
    const level = b.level + 1;
    for (const target of targets) {
      const ratio = target.hp / maxHP(target);
      target.level = level;
      target.hp = maxHP(target) * ratio;
    }
    if (b.type === "gate") s.gateLevel = level;
    s.revision++;
    missions(s);
    return { ok: true };
  }
  function demolishReason(s, b) {
    if (!b || !s.buildings.includes(b) || b.type === "shrine") return "祠堂不可拆除";
    if (b.type === "gate") return "城门不可拆除";
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return "仅可拆除庄园内建筑";
    if (s.over) return "古坊已失守";
    return "";
  }
  function demolish(s, b) {
    const reason = demolishReason(s, b);
    if (reason) return { ok: false, reason };
    const cost = b.originCost || DEFS[b.type].cost, refund = { coins: Math.floor(cost.coins * 0.4), materials: Math.floor(cost.materials * 0.4) };
    s.coins += refund.coins;
    s.materials += refund.materials;
    s.buildings = s.buildings.filter((n) => n !== b);
    s.revision++;
    const dryFarms = b.type === "well" ? s.buildings.filter((n) => n.type === "farm" && dist8(n.x, n.y, b.x, b.y) === 1 && dryFarm(s, n)).length : 0;
    return { ok: true, refund, dryFarms };
  }
  function income(s, b) {
    const d = DEFS[b.type];
    if (!d.income) return 0;
    let bonus = 0;
    for (const n of s.buildings) {
      const nd = DEFS[n.type], dist = dist8(n.x, n.y, b.x, b.y);
      if (nd.aura && (!nd.auraResource || nd.auraResource === d.resource)) bonus += nd.aura * auraFactor(n);
      if (n.type === "well" && dist === 1 && b.type === "farm") bonus += 0.2 * auraFactor(n);
      if (d.radius && dist <= d.radius && isPrereq(d, nd)) bonus += 0.1 * auraFactor(n);
    }
    return d.income * incomeFactor(b) * (1 + Math.min(2, bonus)) * (s.day % 7 === 0 ? 1.25 : 1);
  }
  const rates = (s) => s.buildings.reduce((r, b) => {
    const d = DEFS[b.type];
    r[d.resource === "materials" ? "materials" : "coins"] += income(s, b);
    return r;
  }, { coins: 0, materials: 0 });
  function settleIncome(s, dt) {
    for (const b of s.buildings) {
      const d = DEFS[b.type];
      if (!d.income) continue;
      b.incomeTime += dt;
      if (d.resource === "materials") b.materialPending += income(s, b) * dt;
      else b.coinPending += income(s, b) * dt;
      if (b.incomeTime < 1 - 1e-8) continue;
      b.incomeTime = Math.max(0, b.incomeTime - 1);
      for (const [resource, pending] of [["coins", "coinPending"], ["materials", "materialPending"]]) {
        const paid = Math.floor(b[pending] + 1e-8);
        b[pending] = Math.max(0, b[pending] - paid);
        s[resource] += paid;
        if (paid > 0) s.effects.push({ type: "income", resource, buildingId: b.id, amount: paid, x: b.x, y: b.y, life: 0.95, total: 0.95 });
      }
    }
  }
  function dusk(s) {
    s.phase = "dusk";
    s.time = 0;
    s.direction = Math.floor(random(s) * 4);
    event(s, "暮色将至 · 今夜来敌在" + ["北", "东", "南", "西"][s.direction] + "方", "warning");
  }
  function startNight(s) {
    s.phase = "night";
    s.time = 0;
    const boss = s.day % 7 === 0;
    const opening = Math.min(1, 0.5 + 0.5 * (s.day - 1) / 9);
    s.wave = { total: Math.ceil(Math.min(120, 7 + s.day * 3 + Math.floor(s.day / 3) * 2 + (boss ? 12 : 0)) * opening), spawned: 0, timer: 0.35, boss };
    event(s, boss ? "百鬼夜行！妖将与群妖从四方来袭" : "入夜了 · 守住祠堂，灯火不熄", "warning");
  }
  function dawn(s) {
    s.day++;
    s.phase = "day";
    s.time = 0;
    s.wave = null;
    s.enemies = [];
    s.projectiles = [];
    s.repairTime = 0;
    const reward = 40 + s.day * 8;
    s.coins += reward;
    event(s, "平安入晓 · 守夜赏钱 +" + reward, "reward");
    if (s.day % 7 === 0) {
      s.coins += 180;
      event(s, "上元灯会 · 收入 +25%，获赠 180 铜钱", "reward");
    }
    if (s.day === 8 && !s.celebrated) {
      s.celebrated = true;
      event(s, "七夜长明！古坊立稳根基，可继续经营抵御更强来敌", "victory");
    }
    missions(s);
  }
  function spawnEnemy(s) {
    var _a, _b, _c, _d, _e;
    const w = s.wave, i = w.spawned++, dir = w.boss ? i % 4 : s.direction;
    const SIZE2 = worldSize(s), pos = 3 + Math.floor(random(s) * (SIZE2 - 6));
    const gate = (_a = estate(s)) == null ? void 0 : _a.gates[dir];
    const p = [[(_b = gate == null ? void 0 : gate.x) != null ? _b : pos, 0], [SIZE2 - 1, (_c = gate == null ? void 0 : gate.y) != null ? _c : pos], [(_d = gate == null ? void 0 : gate.x) != null ? _d : pos, SIZE2 - 1], [0, (_e = gate == null ? void 0 : gate.y) != null ? _e : pos]][dir];
    const type = s.day >= 5 && i % 4 === 2 ? "fox" : s.day >= 4 && i % 3 === 1 ? "ghost" : "bandit";
    const opening = Math.min(1, (s.day - 1) / 9);
    const d = ENEMIES[type], boss = w.boss && i === w.total - 1, late = Math.max(0, s.day - 14), scale = (0.45 + 0.55 * opening) * Math.pow(1.23, Math.min(13, s.day - 1)) * Math.pow(1.24, Math.min(7, late)) * Math.pow(1.18, Math.max(0, late - 7)) * (1 + 0.08 * late);
    s.enemies.push({
      id: s.nextId++,
      type,
      x: p[0],
      y: p[1],
      hp: d.hp * scale * (boss ? 4.5 : 1),
      maxHp: d.hp * scale * (boss ? 4.5 : 1),
      damage: d.damage * (0.3 + 0.7 * opening) * Math.pow(1.12, Math.min(13, s.day - 1)) * Math.pow(1.15, Math.min(7, late)) * Math.pow(1.12, Math.max(0, late - 7)) * (1 + 0.04 * late) * (boss ? 2 : 1),
      speed: d.speed * Math.min(1.22, Math.pow(1.012, s.day - 1)),
      attack: 0,
      repelled: 0,
      slowed: 0,
      slowFactor: 1,
      boss,
      path: [],
      pathRevision: -1
    });
  }
  function findPath(s, e) {
    const SIZE2 = worldSize(s);
    const base = s.buildings.find((b) => b.type === "shrine");
    if (!base) return [];
    const startX = Math.max(0, Math.min(SIZE2 - 1, Math.round(e.x))), startY = Math.max(0, Math.min(SIZE2 - 1, Math.round(e.y)));
    const start = startY * SIZE2 + startX, goal = base.y * SIZE2 + base.x, prev = Array(SIZE2 * SIZE2).fill(-1), queue = [start];
    prev[start] = start;
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (current === goal) break;
      const x = current % SIZE2, y = Math.floor(current / SIZE2);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!walkable(s, nx, ny)) continue;
        const next = ny * SIZE2 + nx;
        if (prev[next] !== -1) continue;
        prev[next] = current;
        queue.push(next);
      }
    }
    if (prev[goal] === -1) return [];
    const path = [];
    let n = goal;
    while (n !== start && n !== -1) {
      path.unshift({ x: n % SIZE2, y: Math.floor(n / SIZE2) });
      n = prev[n];
    }
    if (Math.hypot(e.x - startX, e.y - startY) > 0.03) path.unshift({ x: startX, y: startY });
    return path;
  }
  function buildingGuard(s, b) {
    let guard = 0;
    for (const n of s.buildings) if (n.type === "earth" && Math.hypot(n.x - b.x, n.y - b.y) <= DEFS.earth.range) guard += DEFS.earth.guard * factor(n);
    return Math.min(0.65, guard);
  }
  function defenseBoost(s) {
    let boost = 0;
    for (const b of s.buildings) if (b.type === "tao") boost += DEFS.tao.powerAura * factor(b);
    return 1 + Math.min(1.5, boost);
  }
  const zhongSlow = (b) => Math.min(0.65, DEFS.zhong.slow + 0.08 * (b.level - 1));
  function hurtBuilding(s, b, damage, raw = false) {
    if (b.hp <= 0 || isWall(s, b.x, b.y)) return;
    b.hp -= damage * (raw ? 1 : 1 - buildingGuard(s, b));
    if (b.hp > 0) return;
    if (b.type === "gate") b.hp = 0;
    else s.buildings = s.buildings.filter((n) => n !== b);
    s.revision++;
    event(s, DEFS[b.type].name + "被摧毁", "warning");
    if (b.type === "shrine") {
      s.over = true;
      event(s, "祠堂失守，古坊灯火暂熄", "defeat");
    }
  }
  function healBuilding(s, b, amount) {
    if (b.type === "gate" && b.hp === 0) {
      if (s.enemies.some((e) => e.hp > 0 && Math.abs(e.x - b.x) < 1 && Math.abs(e.y - b.y) < 1)) return;
      s.revision++;
      for (const e of s.enemies) {
        e.path = [];
        e.pathRevision = -1;
      }
    }
    b.hp = Math.min(maxHP(b), b.hp + amount);
  }
  function collectDead(s) {
    s.enemies = s.enemies.filter((e) => {
      if (e.hp > 0) return true;
      s.coins += ENEMIES[e.type].reward * (e.boss ? 5 : 1);
      s.kills++;
      s.effects.push({ type: "coin", amount: ENEMIES[e.type].reward * (e.boss ? 5 : 1), x: e.x, y: e.y, life: 0.7, total: 0.7 });
      return false;
    });
  }
  function combat(s, dt) {
    const w = s.wave;
    if (!w) return;
    w.timer -= dt;
    if (w.spawned < w.total && w.timer <= 0) {
      spawnEnemy(s);
      w.timer += Math.max(0.28, 1.35 - s.day * 0.045);
    }
    for (const b of s.buildings) if (b.type === "zhong") {
      b.cooldown -= dt;
      if (b.cooldown <= 0 && s.enemies.length) {
        b.cooldown += DEFS.zhong.pulseInterval;
        const slowFactor = 1 - zhongSlow(b);
        for (const e of s.enemies) {
          e.slowed = Math.max(e.slowed || 0, DEFS.zhong.slowDuration);
          e.slowFactor = Math.min(e.slowFactor || 1, slowFactor);
        }
        s.effects.push({ type: "zhong-pulse", x: b.x, y: b.y, life: 0.8, total: 0.8 });
      }
    }
    for (const b of s.buildings) {
      const d = DEFS[b.type];
      if (!d.damage) continue;
      b.cooldown -= dt;
      const range = d.range + (b.level - 1) * 0.35;
      const enemies = s.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - b.x, e.y - b.y) <= range).sort((a, z) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(z.x - b.x, z.y - b.y));
      const target = enemies[0];
      if (b.type === "barracks") {
        b.soldier || (b.soldier = { x: b.x, y: b.y });
        const dest = target || b, dist = Math.hypot(dest.x - b.soldier.x, dest.y - b.soldier.y), step2 = Math.min(dist, dt * 2.2);
        if (dist) {
          b.soldier.x += (dest.x - b.soldier.x) / dist * step2;
          b.soldier.y += (dest.y - b.soldier.y) / dist * step2;
        }
        if (!target || dist > 0.65) continue;
      }
      if (target && b.cooldown <= 0) {
        b.cooldown = d.interval;
        const damage = d.damage * factor(b) * defenseBoost(s);
        if (d.splash) for (const e of s.enemies) {
          if (Math.hypot(e.x - target.x, e.y - target.y) <= d.splash) e.hp -= damage * (e.type === "fox" ? 1.3 : 1);
        }
        else target.hp -= damage * (b.type === "barracks" && target.type === "fox" ? 1.5 : 1);
        s.projectiles.push({ x: b.type === "barracks" ? b.soldier.x : b.x, y: b.type === "barracks" ? b.soldier.y : b.y, tx: target.x, ty: target.y, type: b.type, life: 0.3, total: 0.3 });
      }
    }
    collectDead(s);
    for (const e of s.enemies) {
      if (s.over) break;
      e.attack = Math.max(0, e.attack - dt);
      e.slowed = Math.max(0, (e.slowed || 0) - dt);
      if (e.slowed === 0) e.slowFactor = 1;
      if (e.repelled > 0) {
        e.repelled -= dt;
        continue;
      }
      if (e.pathRevision !== s.revision || !e.path.length) {
        e.path = findPath(s, e);
        e.pathRevision = s.revision;
      }
      const p = e.path[0];
      if (!p) continue;
      const b = at(s, p.x, p.y), dist = Math.hypot(p.x - e.x, p.y - e.y);
      if (b && b.hp > 0 && dist <= 1.05) {
        if (e.attack === 0) {
          hurtBuilding(s, b, e.damage);
          e.attack = 1;
          s.effects.push({ type: "hit", x: b.x, y: b.y, life: 0.2, total: 0.2 });
        }
        continue;
      }
      const slow = e.slowed > 0 ? e.slowFactor : 1;
      const step2 = Math.min(dist, e.speed * dt * slow);
      if (dist > 1e-3) {
        e.x += (p.x - e.x) / dist * step2;
        e.y += (p.y - e.y) / dist * step2;
      }
      if (dist <= step2 + 1e-3) e.path.shift();
    }
    if (!s.over && w.spawned >= w.total && !s.enemies.length) dawn(s);
  }
  function skillReason(s, id) {
    const d = SKILLS[id];
    if (!d) return "未知神技";
    if (s.over || s.phase !== "night") return "神技仅在夜晚使用";
    if (s.cooldowns[id] > 0) return "还需 " + Math.ceil(s.cooldowns[id]) + " 秒";
    return "";
  }
  function skill(s, id) {
    const reason = skillReason(s, id);
    if (reason) return { ok: false, reason };
    s.cooldowns[id] = SKILLS[id].cooldown;
    if (id === "repair") for (const b of s.buildings) healBuilding(s, b, maxHP(b) * 0.35);
    if (id === "repel") for (const e of s.enemies) {
      e.repelled = 4;
      e.hp -= 20;
    }
    if (id === "thunder") for (const e of s.enemies) {
      e.hp -= e.type === "ghost" ? 350 : 240;
      s.effects.push({ type: "thunder", x: e.x, y: e.y, life: 0.7, total: 0.7 });
    }
    s.effects.push({ type: id, x: worldCenter(s), y: worldCenter(s), life: 1, total: 1 });
    collectDead(s);
    return { ok: true };
  }
  function step(s, dt) {
    if (s.over || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.25);
    s.time += dt;
    s.elapsed += dt;
    for (const id in s.cooldowns) s.cooldowns[id] = Math.max(0, s.cooldowns[id] - dt);
    for (const group of [s.effects, s.projectiles]) {
      for (const e of group) e.life -= dt;
    }
    s.effects = s.effects.filter((e) => e.life > 0);
    s.projectiles = s.projectiles.filter((e) => e.life > 0);
    for (const b of [...s.buildings]) if (dryFarm(s, b)) hurtBuilding(s, b, maxHP(b) * 0.05 * dt, true);
    settleIncome(s, dt);
    if (s.phase === "day") {
      s.repairTime += dt;
      if (s.repairTime >= 1 - 1e-8) {
        s.repairTime = Math.max(0, s.repairTime - 1);
        for (const b of s.buildings) if (!dryFarm(s, b)) healBuilding(s, b, maxHP(b) * 0.1);
      }
      if (s.time >= DAY) dusk(s);
    } else if (s.phase === "dusk" && s.time >= DUSK) startNight(s);
    else if (s.phase === "night") combat(s, dt);
    missions(s);
  }
  function serialize(s) {
    return JSON.stringify(__spreadProps(__spreadValues({}, s), { events: [], projectiles: [], effects: [] }));
  }
  function restore(raw) {
    var _a;
    try {
      const s = JSON.parse(raw), finite = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
      if (!s || typeof s !== "object") return null;
      if (s.worldSize === void 0) s.worldSize = 17;
      if (![17, 25].includes(s.worldSize)) return null;
      const SIZE2 = worldSize(s);
      if (s.mapGeneration !== void 0 && (s.mapGeneration !== 2 || SIZE2 !== 25 || s.version !== 5 || s.mapSeed === void 0 || s.estateSeed === void 0)) return null;
      if (s.estateSeed !== void 0 && (SIZE2 !== 25 || !Number.isInteger(s.estateSeed) || s.estateSeed < 0 || s.estateSeed > 4294967295 || s.mapSeed === void 0)) return null;
      if (s.version === 5 && (SIZE2 !== 25 || s.estateSeed === void 0)) return null;
      if (s.version < 5 && (SIZE2 !== 17 || s.estateSeed !== void 0)) return null;
      if (s.materials === void 0) s.materials = 120;
      delete s.prosperity;
      delete s.incense;
      if (s.fortuneBuilt === void 0) s.fortuneBuilt = 0;
      if (s.mapSeed !== void 0 && (!Number.isInteger(s.mapSeed) || s.mapSeed < 0 || s.mapSeed > 4294967295)) return null;
      if (![1, 2, 3, 4, 5].includes(s.version) || !finite(s.coins) || !finite(s.materials) || !Number.isInteger(s.fortuneBuilt) || s.fortuneBuilt < 0 || !Number.isInteger(s.day) || s.day < 1 || !["day", "dusk", "night"].includes(s.phase) || !finite(s.time) || !finite(s.elapsed) || !finite(s.repairTime) || !Number.isInteger(s.mission) || s.mission < 0 || s.mission > MISSIONS.length || !Number.isInteger(s.seed) || !Number.isInteger(s.direction) || s.direction < 0 || s.direction > 3 || !finite(s.kills) || typeof s.over !== "boolean") return null;
      if (!Array.isArray(s.buildings) || s.buildings.length > SIZE2 * SIZE2 || !Array.isArray(s.enemies) || s.enemies.length > 150 || !s.cooldowns || !Object.keys(SKILLS).every((k) => finite(s.cooldowns[k]))) return null;
      const retired = s.buildings.filter((b) => RETIRED_TYPES.has(b.type)).length;
      s.buildings = s.buildings.filter((b) => !RETIRED_TYPES.has(b.type));
      const cells = /* @__PURE__ */ new Set(), land = estate(s);
      for (const b of s.buildings) {
        if (!Object.prototype.hasOwnProperty.call(DEFS, b.type)) return null;
        const legacyGrowth = s.version === 1 ? 1.65 : 1.3;
        const savedMaxLevel = s.version === 1 ? DEFS[b.type].max || 3 : s.version === 2 ? MAX_LEVEL : maxLevel(b);
        const savedMaxHP = s.version < 3 ? Math.round(DEFS[b.type].hp * Math.pow(legacyGrowth, b.level - 1)) : maxHP(b);
        if (!inside(b.x, b.y, s) || !Number.isInteger(b.level) || b.level < 1 || b.level > savedMaxLevel || !finite(b.hp) || b.hp === 0 && b.type !== "gate" || b.hp > savedMaxHP + 1 || !Number.isInteger(b.id) || b.id < 1) return null;
        if (b.type === "gate") {
          if (!(land == null ? void 0 : land.gates.some((g) => g.x === b.x && g.y === b.y && g.direction === b.direction))) return null;
        } else if (land && (!land.cells.has(b.y * SIZE2 + b.x) || terrain(b.x, b.y, s) === "water")) return null;
        if (land && b.type === "shrine" && (b.x !== worldCenter(s) || b.y !== worldCenter(s))) return null;
        if (s.version < 3) b.hp = Math.max(1e-3, b.hp / savedMaxHP * maxHP(b));
        if (b.materialPending === void 0) {
          b.materialPending = DEFS[b.type].resource === "materials" ? b.coinPending || 0 : 0;
          if (DEFS[b.type].resource === "materials") b.coinPending = 0;
        }
        for (const field of ["incomeTime", "coinPending", "materialPending"]) {
          if (b[field] === void 0) b[field] = 0;
          if (!finite(b[field])) return null;
        }
        delete b.incensePending;
        if (b.originCost !== void 0 && (!b.originCost || !finite(b.originCost.coins) || !finite(b.originCost.materials))) return null;
        if (b.type === "port" && b.coinPending > 0) {
          b.materialPending += b.coinPending;
          b.coinPending = 0;
        }
        if (b.incomeTime >= 1) return null;
        const key = b.x + "," + b.y;
        if (cells.has(key)) return null;
        cells.add(key);
        b.cooldown = 0;
        delete b.soldier;
      }
      if (land && s.buildings.filter((b) => b.type === "gate").length !== 4) return null;
      if (land) {
        const gates = s.buildings.filter((b) => b.type === "gate");
        if (s.gateLevel !== void 0 && (!Number.isInteger(s.gateLevel) || s.gateLevel < 1 || s.gateLevel > MAX_LEVEL || gates.some((b) => b.level !== s.gateLevel))) return null;
        s.gateLevel = (_a = s.gateLevel) != null ? _a : Math.max(...gates.map((b) => b.level));
        for (const gate of gates) {
          const ratio = gate.hp / maxHP(gate);
          gate.level = s.gateLevel;
          gate.hp = maxHP(gate) * ratio;
        }
      }
      if (!s.over && s.buildings.filter((b) => b.type === "shrine").length !== 1 || s.buildings.filter((b) => b.type === "shrine").length > 1) return null;
      if (s.phase === "night" && (!s.wave || !Number.isInteger(s.wave.total) || s.wave.total < 1 || s.wave.total > 120 || !Number.isInteger(s.wave.spawned) || s.wave.spawned < 0 || s.wave.spawned > s.wave.total || !Number.isFinite(s.wave.timer))) return null;
      for (const e of s.enemies) {
        if (e.slowed === void 0) e.slowed = 0;
        if (e.slowFactor === void 0) e.slowFactor = 1;
        if (!Object.prototype.hasOwnProperty.call(ENEMIES, e.type) || !Number.isInteger(e.id) || e.id < 1 || !finite(e.x) || e.x >= SIZE2 || !finite(e.y) || e.y >= SIZE2 || !finite(e.hp) || e.hp <= 0 || !finite(e.maxHp) || e.hp > e.maxHp || !finite(e.speed) || e.speed <= 0 || !finite(e.damage) || e.damage <= 0 || !finite(e.attack) || !Number.isFinite(e.repelled) || !finite(e.slowed) || !Number.isFinite(e.slowFactor) || e.slowFactor <= 0 || e.slowFactor > 1) return null;
        if (!walkable(s, Math.round(e.x), Math.round(e.y))) {
          let nearest = null;
          for (let y = 0; y < SIZE2; y++) for (let x = 0; x < SIZE2; x++) if (walkable(s, x, y)) {
            const distance = (x - e.x) ** 2 + (y - e.y) ** 2;
            if (!nearest || distance < nearest.distance) nearest = { x, y, distance };
          }
          e.x = nearest.x;
          e.y = nearest.y;
        }
        e.path = [];
        e.pathRevision = -1;
      }
      const occupiedLand = new Set(s.buildings.filter((b) => terrain(b.x, b.y, s) !== "water").map((b) => b.x + "," + b.y));
      let moved = 0, stranded = 0;
      for (const b of s.buildings.filter((b2) => !land && terrain(b2.x, b2.y, s) === "water").sort((a, z) => Number(z.type === "farm") - Number(a.type === "farm") || a.id - z.id)) {
        const candidates = [];
        for (let y = 0; y < SIZE2; y++) for (let x = 0; x < SIZE2; x++) {
          const land2 = terrain(x, y, s);
          if (land2 === "water" || b.type === "farm" && land2 !== "shore" || occupiedLand.has(x + "," + y)) continue;
          candidates.push({ x, y, score: dist8(b.x, b.y, x, y) * 100 + (Math.abs(b.x - x) + Math.abs(b.y - y)) * 2 + (land2 === "shore" && b.type !== "farm" ? 1 : 0) });
        }
        candidates.sort((a, z) => a.score - z.score || a.y - z.y || a.x - z.x);
        if (!candidates.length) {
          stranded++;
          continue;
        }
        b.x = candidates[0].x;
        b.y = candidates[0].y;
        occupiedLand.add(b.x + "," + b.y);
        moved++;
      }
      s.events = retired ? [{ text: "旧存档中 " + retired + " 栋已退役建筑被移除", kind: "info" }] : [];
      if (moved) s.events.push({ text: "旧存档中 " + moved + " 栋建筑已迁出水域", kind: "info" });
      if (stranded) s.events.push({ text: "岸地已满，" + stranded + " 栋旧建筑暂保留原位", kind: "warning" });
      s.effects = [];
      s.projectiles = [];
      s.revision = 1;
      s.version = land ? 5 : 4;
      s.nextId = Math.max(0, ...s.buildings.map((b) => b.id), ...s.enemies.map((e) => e.id || 0)) + 1;
      return s;
    } catch (e) {
      return null;
    }
  }
  return { SIZE, CENTER, worldSize, worldCenter, estate, owns, isWall, walkable, DAY, DUSK, MAX_LEVEL, SHRINE_MAX_LEVEL, GROWTH, HP_GROWTH, UPGRADE_GROWTH, SHRINE_REQUIREMENTS, TERRAIN, DEFS, ENEMIES, SKILLS, MISSIONS, chains, terrain, dist8, at, adjacent, dryFarm, factor, incomeFactor, auraFactor, hpFactor, maxLevel, shrineLevel, requiredShrineLevel, unlockedBuildingLevel, maxHP, visualLevel, name, createState, buildCost, fortuneCandidates, grantBuilding, buildReason, build, upgradeCost, upgradeReason, upgrade, demolishReason, demolish, income, rates, buildingGuard, defenseBoost, zhongSlow, dusk, startNight, findPath, skillReason, skill, step, serialize, restore };
});

(function() {
  "use strict";
  const T = 64, palette = { plain: "#ced5af", shore: "#d9cda7", water: "#a9c9bd", forest: "#b4c49a", mountain: "#c3c5af" };
  const noise = (x, y, n = 0) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  function poly(c, points, fill, stroke, width = 1) {
    c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }
  function line(c, points, color, width = 1) {
    c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.stroke();
  }
  function ellipse(c, x, y, rx, ry, fill, stroke) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 0.8;
      c.stroke();
    }
  }
  function rect(c, x, y, w, h, fill, stroke) {
    c.fillStyle = fill;
    c.fillRect(x, y, w, h);
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 0.7;
      c.strokeRect(x, y, w, h);
    }
  }
  function tree(c, x, y, size = 1, autumn = false) {
    c.save();
    c.translate(x, y);
    c.scale(size, size);
    ellipse(c, 2, 4, 11, 4, "#4a674721");
    line(c, [[0, 2], [0, -18]], "#736e4b", 2);
    ellipse(c, -5, -15, 8, 9, autumn ? "#9aaf6e" : "#6a8b63", "#58755370");
    ellipse(c, 5, -20, 9, 10, autumn ? "#b1ba79" : "#7c9c6a", "#58755370");
    ellipse(c, -1, -27, 8, 9, autumn ? "#bec286" : "#8daa72");
    line(c, [[-6, -29], [-2, -33], [2, -33]], "#c4d69a55", 1.3);
    c.restore();
  }
  function bamboo(c, x, y, size = 1) {
    c.save();
    c.translate(x, y);
    c.scale(size, size);
    for (let i = -1; i <= 1; i++) {
      line(c, [[i * 5, 3], [i * 7, -30 - i * 4]], "#708660", 1.4);
      for (let j = 0; j < 3; j++) {
        const yy = -9 - j * 8;
        line(c, [[i * 6, yy], [i * 6 + 9, yy - 6]], "#658560", 1);
        ellipse(c, i * 6 + 8, yy - 5, 5, 1.6, "#6e9064");
        ellipse(c, i * 6 - 5, yy - 5, 5, 1.6, "#849e6b");
      }
    }
    c.restore();
  }
  function stone(c, x, y, size = 1) {
    c.save();
    c.translate(x, y);
    c.scale(size, size);
    ellipse(c, 0, 3, 12, 4, "#6d745425");
    poly(c, [[-12, 0], [-8, -12], [0, -17], [11, -9], [13, 3], [1, 6]], "#a4ac98", "#899680");
    poly(c, [[-8, -12], [0, -17], [11, -9], [2, -4]], "#bec5b0");
    poly(c, [[2, -4], [11, -9], [13, 3], [1, 6]], "#909d89");
    c.restore();
  }
  function roof(c, x, y, w, h, color = "#55786e", tier = 1) {
    const edge = color === "#aa6951" ? "#714e3d" : "#36564f";
    poly(c, [[x - w / 2 - 3, y + h], [x - w / 2 + 4, y + h - 5], [x - w / 2 + 9, y], [x + w / 2 - 9, y], [x + w / 2 - 4, y + h - 5], [x + w / 2 + 3, y + h], [x, y + h + 3]], color, edge, 0.9);
    for (let i = -w / 2 + 8; i < w / 2 - 3; i += 5) line(c, [[x + i * 0.73, y + 2], [x + i, y + h - 1]], "#d5e0bf42", 0.7);
    line(c, [[x - w / 2 + 8, y + 1], [x + w / 2 - 8, y + 1]], "#314e49", 2);
    line(c, [[x - w / 2 - 3, y + h - 2], [x - w / 2 - 2, y + h], [x, y + h + 2], [x + w / 2 + 2, y + h], [x + w / 2 + 3, y + h - 2]], tier >= 3 ? "#bda65f" : "#86a095", 1.4);
  }
  function lantern(c, x, y) {
    line(c, [[x, y - 5], [x, y + 6]], "#78663b", 0.6);
    ellipse(c, x, y, 2.7, 3.6, "#ba634b");
    line(c, [[x, y - 2], [x, y + 2]], "#e2a169", 0.6);
  }
  function house(c, level, kind, color) {
    const fancy = ["shrine", "earth", "tao", "guild", "port"].includes(kind), w = fancy ? 44 : 39, h = level > 1 ? 24 : 20;
    rect(c, -w / 2 - 3, 9, w + 6, 7, "#aaad92", "#8f997f");
    rect(c, -w / 2, -h + 14, w, h, "#e5d9b5", "#9a9475");
    rect(c, w / 2 - 8, -h + 15, 8, h - 1, "#cdc5a1");
    for (const x of [-w / 2 + 3, w / 2 - 4]) rect(c, x, -h + 13, 2, h + 1, fancy ? "#9b5947" : "#897c58");
    rect(c, -5, 2, 10, 12, fancy ? "#785345" : "#665f45");
    line(c, [[0, 3], [0, 13]], "#b1976a");
    for (const x of [-14, 10]) {
      rect(c, x, -1, 6, 6, "#7b8063", "#b8a47c");
      line(c, [[x + 3, 0], [x + 3, 4]], "#d2bf8b", 0.6);
    }
    roof(c, 0, -h - 2, w + 6, 16, color, level);
    if (level >= 2 || fancy) {
      rect(c, -11, -h - 9, 22, 10, "#d6c6a1", "#8b8668");
      roof(c, 0, -h - 17, 35, 10, color, level);
    }
    if (level === 3) {
      rect(c, -8, -h - 24, 16, 8, "#d6c6a1");
      roof(c, 0, -h - 30, 27, 9, color, level);
    }
    if (fancy) {
      lantern(c, -18, 5);
      lantern(c, 18, 5);
      rect(c, -8, -9, 16, 6, "#3c5750", "#b29d69");
      c.fillStyle = "#e4d6ad";
      c.font = "4px serif";
      c.textAlign = "center";
      c.fillText(GF.DEFS[kind].name, 0, -4.5);
    }
    rect(c, -9, 15, 18, 2, "#d6d6bc");
    rect(c, -11, 17, 22, 2, "#b6bca1");
  }
  function building(c, type, level = 1, time = 0) {
    level = GF.visualLevel(level);
    c.save();
    c.lineJoin = "round";
    ellipse(c, 2, 18, 26, 8, "#3b503728");
    if (level >= 2) {
      poly(c, [[-29, -20], [27, -20], [30, 23], [-28, 23]], "#bfc4a582", "#929f7f", 0.7);
      for (let i = 0; i < 4; i++) line(c, [[-26 + i * 17, 19], [-26 + i * 17, 23]], "#8b987b", 0.7);
    }
    if (level === 3) {
      for (const x of [-28, 28]) {
        line(c, [[x, -17], [x, 19]], "#aa985b", 1.2);
        ellipse(c, x, -17, 2, 2, "#c5ab66");
      }
      line(c, [[-26, 22], [27, 22]], "#c5ab66", 2);
    }
    if (type === "gate") {
      rect(c, -29, -12, 58, 34, "#999c8a", "#58675e");
      for (const x of [-27, 19]) {
        rect(c, x, -20, 8, 44, "#c1c4ae", "#687568");
        for (let y = -15; y < 24; y += 9) line(c, [[x, y], [x + 8, y]], "#84907d", 1);
      }
      rect(c, -18, -7, 36, 30, "#775638", "#4e4435");
      for (let x = -15; x < 18; x += 6) line(c, [[x, -6], [x, 22]], "#b29762", 1.3);
      line(c, [[0, -7], [0, 23]], "#423e31", 2);
      line(c, [[-17, 7], [17, 7]], "#5a4a33", 3);
      for (const x of [-5, 5]) ellipse(c, x, 10, 2, 2, "#d0af66");
      rect(c, -22, -23, 44, 13, "#dbccaa", "#887b5e");
      roof(c, 0, -39, 59, 17, "#55786e", level);
      if (level > 1) roof(c, 0, -49, 39, 11, "#55786e", level);
    } else if (type === "farm") {
      poly(c, [[-25, -18], [21, -18], [26, 16], [-23, 20]], "#8faf90", "#83926a", 1.2);
      for (let row = 0; row < 5; row++) {
        line(c, [[-22, -12 + row * 6], [23, -14 + row * 6]], "#bfd0a4", 1.3);
        for (let col = 0; col < 6; col++) {
          const x = -19 + col * 7, y = -9 + row * 6;
          line(c, [[x - 2, y - 5], [x, y], [x + 2, y - 5]], level === 1 ? "#62885b" : "#a29244", 1.3);
        }
      }
      if (level > 1) {
        rect(c, 19, -20, 3, 32, "#928465");
        line(c, [[14, -18], [25, -18]], "#928465", 2);
      }
      if (level === 3) houseTiny(c, -19, -16);
    } else if (type === "mulberry") {
      rect(c, -24, -14, 48, 34, "#acbb87");
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) tree(c, -16 + i * 16, -1 + j * 16, 0.58 + level * 0.06, true);
    } else if (type === "quarry") {
      poly(c, [[-25, 15], [-20, -14], [14, -20], [26, 5], [16, 19]], "#b5bba4", "#8d9882");
      stone(c, -8, 0, 0.9);
      stone(c, 11, 6, 0.9);
      stone(c, 1, -10, 0.7);
      line(c, [[-18, 15], [-12, 3]], "#7a7254", 2);
      line(c, [[-18, 5], [-7, 11]], "#687a70", 3);
      if (level > 1) stone(c, 10, -19, 0.7);
    } else if (type === "fortune") {
      ellipse(c, 0, 15, 25, 7, "#5d4e3b30");
      rect(c, -23, -10, 46, 27, "#8b5f48", "#5d493b");
      poly(c, [[-25, -10], [-18, -24], [18, -24], [25, -10]], "#527269", "#354f49", 1.2);
      rect(c, -5, -13, 10, 18, "#c4a35d", "#6f603d");
      ellipse(c, 0, -4, 3, 4, "#f0d991");
      for (const x of [-16, 16]) lantern(c, x, 8);
    } else if (type === "tower") {
      for (const x of [-15, 12]) {
        poly(c, [[x - 2, 18], [x + 1, -23], [x + 5, -23], [x + 5, 18]], "#9b865d", "#6e7356");
      }
      line(c, [[-14, 16], [16, -20]], "#a18b5e", 3);
      line(c, [[15, 16], [-12, -20]], "#a18b5e", 3);
      rect(c, -21, -25, 42, 11, "#af9866", "#6f7758");
      for (let i = -18; i <= 18; i += 9) rect(c, i, -29, 3, 14, "#746e4e");
      roof(c, 0, -42, 45, 13, "#52766d", level);
      if (level > 1) roof(c, 0, -50, 29, 9, "#52766d", level);
      line(c, [[0, -30], [17, -38]], "#624f39", 1.5);
      ellipse(c, 0, -29, 3, 4, "#48584e");
    } else if (type === "rock") {
      poly(c, [[-24, 16], [-20, -5], [20, -5], [24, 16]], "#b2b7a2", "#7e8d7b");
      rect(c, -18, -10, 36, 10, "#c8cbb3", "#8d987e");
      line(c, [[-13, 6], [0, -20], [13, 6]], "#8a7c56", 4);
      line(c, [[-9, -19], [14, -7]], "#756a4e", 4);
      stone(c, -12, -19, 0.5);
      if (level > 1) stone(c, 18, 12, 0.6);
    } else if (type === "well") {
      ellipse(c, 0, 10, 17, 9, "#afb7a3", "#7c8c7c");
      rect(c, -17, 2, 34, 9, "#adb5a0");
      ellipse(c, 0, 2, 17, 8, "#d1d6bb", "#7c8c7c");
      ellipse(c, 0, 2, 12, 5, "#638b87");
      rect(c, -19, -22, 3, 30, "#937e54");
      rect(c, 16, -22, 3, 30, "#937e54");
      roof(c, 0, -30, 45, 13, "#887c58", level);
      line(c, [[0, -14], [0, 0]], "#c4b087");
    } else if (type === "zhong") {
      rect(c, -16, 10, 32, 8, "#a7af9d", "#788978");
      rect(c, -12, 6, 24, 6, "#c3c9b1");
      poly(c, [[-12, 5], [-10, -20], [0, -28], [10, -20], [12, 5]], level === 3 ? "#b3a574" : "#7a9280", "#536c5e");
      ellipse(c, 0, -28, 7, 8, "#9bad93");
      rect(c, -8, -36, 16, 4, "#617a68");
      line(c, [[8, -11], [20, -29]], "#7a8267", 3);
      line(c, [[-6, -26], [0, -23], [5, -26]], "#4e6659", 2);
    } else {
      const color = ["wine", "kiln", "barracks"].includes(type) ? "#aa6951" : type === "tailor" ? "#85788b" : type === "tea" ? "#728260" : "#55786e";
      house(c, level, type, color);
      if (type === "tea") {
        line(c, [[24, -21], [24, 10]], "#837b51", 1.5);
        rect(c, 24, -20, 12, 18, "#e5d7ac", "#b9ad82");
        c.font = "8px serif";
        c.textAlign = "center";
        c.fillStyle = "#4b6950";
        c.fillText("茶", 30, -8);
      }
      if (type === "inn") {
        line(c, [[24, -24], [24, 13]], "#837b51", 1.5);
        rect(c, 24, -23, 10, 21, "#b17455");
        c.font = "7px serif";
        c.textAlign = "center";
        c.fillStyle = "#f1ddb1";
        c.fillText("宿", 29, -10);
      }
      if (type === "mill") {
        ellipse(c, 22, 6, 11, 11, "#8c8460", "#676d51");
        ellipse(c, 22, 6, 8, 8, null, "#c8ba87");
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + time * 0.4;
          line(c, [[22, 6], [22 + 10 * Math.cos(a), 6 + 10 * Math.sin(a)]], "#c2b180", 1.5);
        }
        ellipse(c, 22, 6, 2, 2, "#706949");
      }
      if (type === "wine" || type === "kiln") {
        for (let i = 0; i < 3; i++) {
          ellipse(c, 16 + i * 6, 13 - i * 2, 4, 5, type === "wine" ? "#a57c59" : "#b7c6b1", "#7b7d61");
          ellipse(c, 16 + i * 6, 8 - i * 2, 2.8, 1.5, "#616b57");
        }
      }
      if (type === "kiln") {
        rect(c, 16, -32, 6, 19, "#a18e6c");
        for (let i = 0; i < 3; i++) ellipse(c, 19 + Math.sin(time + i) * 3, -38 - i * 7, 3 + i, 3 + i, "#e7e7cf66");
      }
      if (type === "weaver" || type === "tailor") {
        line(c, [[-25, -14], [-25, 13]], "#8e7c59", 1.5);
        for (let i = 0; i < 3; i++) rect(c, -25 + i * 6, -12, 5, 18, ["#c3948d", "#b9b590", "#7f9e9c"][i]);
      }
      if (type === "barracks") {
        line(c, [[23, -37], [23, 13]], "#807449", 1.7);
        poly(c, [[24, -37], [39, -32], [24, -26]], "#ad6650");
      }
      if (type === "bank" || type === "trade") {
        for (let i = 0; i < 3; i++) {
          rect(c, 15 + i * 4, 13 - i * 4, 8, 5, "#ba9b56", "#9d8546");
          line(c, [[18 + i * 4, 14 - i * 4], [19 + i * 4, 16 - i * 4]], "#e0c377");
        }
      }
      if (type === "stage") {
        rect(c, -17, 0, 34, 14, "#977950");
        for (let i = -12; i <= 12; i += 12) {
          ellipse(c, i, 1, 2, 2, "#cfbb91");
          poly(c, [[i - 3, 5], [i + 3, 5], [i + 5, 13], [i - 5, 13]], i ? "#8e9b76" : "#b17360");
        }
      }
      if (type === "guild" || type === "port") {
        c.save();
        c.strokeStyle = "#c9ac65";
        c.lineWidth = 1.5;
        ellipse(c, 0, 19, 29, 9, null, "#c9ac65");
        if (type === "guild") {
          ellipse(c, 22, -20, 7, 7, "#ddb767", "#6f743d");
          rect(c, 20, -22, 4, 4, "#61724a", "#b18e4c");
        } else {
          c.translate(22, -21);
          c.rotate(-0.6);
          rect(c, -2, -1, 4, 12, "#b99764", "#665e47");
          rect(c, -8, -6, 16, 6, "#849a8b", "#4e695f");
        }
        c.restore();
      }
    }
    c.restore();
  }
  function houseTiny(c, x, y) {
    rect(c, x - 5, y, 10, 7, "#d6d0a6");
    roof(c, x, y - 5, 16, 7, "#887a52");
  }
  const thumbs = /* @__PURE__ */ new Map();
  function thumbnail(type, level = 1) {
    const key = type + GF.visualLevel(level);
    if (thumbs.has(key)) return thumbs.get(key);
    const c = document.createElement("canvas");
    c.width = 180;
    c.height = 150;
    const ctx = c.getContext("2d");
    ctx.translate(90, 99);
    ctx.scale(2, 2);
    building(ctx, type, level);
    const url = c.toDataURL();
    thumbs.set(key, url);
    return url;
  }
  function makeGround(s) {
    const size = GF.worldSize(s), center = GF.worldCenter(s), estate = GF.estate(s);
    const canvas = document.createElement("canvas");
    canvas.width = size * T;
    canvas.height = size * T;
    const c = canvas.getContext("2d");
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const type = GF.terrain(x, y, s), px = x * T, py = y * T;
      rect(c, px, py, T, T, palette[type]);
      if (type === "water") {
        rect(c, px, py, T, T, palette.shore);
        const north = GF.terrain(x, y - 1, s) === "water", east = GF.terrain(x + 1, y, s) === "water", south = GF.terrain(x, y + 1, s) === "water", west = GF.terrain(x - 1, y, s) === "water";
        const tl = !north && !west ? 18 : 0, tr = !north && !east ? 18 : 0, br = !south && !east ? 18 : 0, bl = !south && !west ? 18 : 0;
        c.beginPath();
        c.moveTo(px + tl, py);
        c.lineTo(px + T - tr, py);
        c.quadraticCurveTo(px + T, py, px + T, py + tr);
        c.lineTo(px + T, py + T - br);
        c.quadraticCurveTo(px + T, py + T, px + T - br, py + T);
        c.lineTo(px + bl, py + T);
        c.quadraticCurveTo(px, py + T, px, py + T - bl);
        c.lineTo(px, py + tl);
        c.quadraticCurveTo(px, py, px + tl, py);
        c.closePath();
        c.fillStyle = palette.water;
        c.fill();
        c.save();
        c.clip();
        c.beginPath();
        if (!north) {
          c.moveTo(px + tl, py);
          c.lineTo(px + T - tr, py);
        }
        if (!east) {
          c.moveTo(px + T, py + tr);
          c.lineTo(px + T, py + T - br);
        }
        if (!south) {
          c.moveTo(px + T - br, py + T);
          c.lineTo(px + bl, py + T);
        }
        if (!west) {
          c.moveTo(px, py + T - bl);
          c.lineTo(px, py + tl);
        }
        if (tl) {
          c.moveTo(px, py + tl);
          c.quadraticCurveTo(px, py, px + tl, py);
        }
        if (tr) {
          c.moveTo(px + T - tr, py);
          c.quadraticCurveTo(px + T, py, px + T, py + tr);
        }
        if (br) {
          c.moveTo(px + T, py + T - br);
          c.quadraticCurveTo(px + T, py + T, px + T - br, py + T);
        }
        if (bl) {
          c.moveTo(px + bl, py + T);
          c.quadraticCurveTo(px, py + T, px, py + T - bl);
        }
        c.strokeStyle = "#c6d1a6";
        c.lineWidth = 6;
        c.stroke();
        c.restore();
      } else rect(c, px, py, T, T, `rgba(248,245,213,${noise(x, y) * 0.1})`);
      for (let j = 0; j < 9; j++) {
        let gx = px + noise(x, y, j + 2) * 60 + 2, gy = py + noise(y, x, j + 31) * 60 + 2;
        if (type === "water") {
          line(c, [[gx - 3, gy], [gx + 4, gy]], "#d1e1c65c", 0.8);
        } else if (type === "shore") {
          ellipse(c, gx, gy, 1.2, 0.7, "#9eaa873f");
        } else {
          line(c, [[gx - 2, gy - 2], [gx, gy + 1], [gx + 2, gy - 3]], "#81986238", 0.8);
        }
      }
      if (type === "shore") {
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (GF.terrain(x + dx, y + dy, s) === "water") {
          const edge = dx === 1 ? [[px + T - 3, py + 4], [px + T - 3, py + T - 4]] : dx === -1 ? [[px + 3, py + 4], [px + 3, py + T - 4]] : dy === 1 ? [[px + 4, py + T - 3], [px + T - 4, py + T - 3]] : [[px + 4, py + 3], [px + T - 4, py + 3]];
          line(c, edge, "#f4e6bf9c", 2);
        }
        for (let j = 0; j < 3; j++) {
          const gx = px + 10 + noise(x, y, j + 65) * 44, gy = py + 10 + noise(y, x, j + 81) * 44;
          line(c, [[gx - 2, gy + 4], [gx, gy - 2], [gx + 2, gy + 4]], "#a9ad765c", 0.9);
        }
      }
      if (type === "water") {
        if (noise(x, y) > 0.3) {
          ellipse(c, px + 17, py + 38, 4, 2, "#9fb993");
          ellipse(c, px + 24, py + 41, 3, 1.8, "#9db88e");
        }
      }
      if (type === "mountain" && !GF.isWall(s, x, y) && !(estate == null ? void 0 : estate.roads.has(y * size + x)) && noise(x, y) > 0.7) {
        stone(c, px + 44, py + 19, 0.4);
      }
      if (estate && !GF.owns(s, x, y)) rect(c, px, py, T, T, "#34473e18");
    }
    if (!estate) {
      for (let y = center - 2; y <= center + 2; y++) rect(c, center * T + 25, y * T, 14, T, "#dcd8b74a");
      for (let x = center - 2; x <= center + 2; x++) rect(c, x * T, center * T + 27, T, 12, "#dcd8b74a");
    } else {
      const has = (set, x, y) => x >= 0 && y >= 0 && x < size && y < size && set.has(y * size + x);
      for (const index of estate.roads) {
        const x = index % size, y = Math.floor(index / size), px = x * T, py = y * T, water = GF.terrain(x, y, s) === "water";
        const north = has(estate.roads, x, y - 1), south = has(estate.roads, x, y + 1), east = has(estate.roads, x + 1, y), west = has(estate.roads, x - 1, y);
        c.save();
        c.beginPath();
        c.rect(px + 21, py + 21, 22, 22);
        if (north) c.rect(px + 21, py, 22, 32);
        if (south) c.rect(px + 21, py + 32, 22, 32);
        if (west) c.rect(px, py + 21, 32, 22);
        if (east) c.rect(px + 32, py + 21, 32, 22);
        c.clip();
        rect(c, px, py, T, T, water ? "#ad9063" : "#dfd5b494");
        if (water) {
          for (let i = 0; i < T; i += 7) {
            if (north || south || !east && !west) line(c, [[px + 19, py + i], [px + 45, py + i]], "#655c43", 1.5);
            if (east || west) line(c, [[px + i, py + 19], [px + i, py + 45]], "#655c43", 1.5);
          }
        }
        c.restore();
      }
      for (const index of estate.cells) {
        const x = index % size, y = Math.floor(index / size), px = x * T, py = y * T;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (!GF.owns(s, x + dx, y + dy)) {
          const edge = dx === 1 ? [[px + T - 2, py + 2], [px + T - 2, py + T - 2]] : dx === -1 ? [[px + 2, py + 2], [px + 2, py + T - 2]] : dy === 1 ? [[px + 2, py + T - 2], [px + T - 2, py + T - 2]] : [[px + 2, py + 2], [px + T - 2, py + 2]];
          line(c, edge, "#f3df9b99", 2);
        }
      }
      const connects = (x, y) => GF.isWall(s, x, y) || estate.gates.some((g) => g.x === x && g.y === y);
      for (const index of estate.walls) {
        const x = index % size, y = Math.floor(index / size), px = x * T, py = y * T;
        c.save();
        c.beginPath();
        c.rect(px + 19, py + 19, 26, 26);
        if (connects(x, y - 1)) c.rect(px + 19, py, 26, 32);
        if (connects(x, y + 1)) c.rect(px + 19, py + 32, 26, 32);
        if (connects(x - 1, y)) c.rect(px, py + 19, 32, 26);
        if (connects(x + 1, y)) c.rect(px + 32, py + 19, 32, 26);
        c.fillStyle = "#667367";
        c.shadowColor = "#34463866";
        c.shadowBlur = 4;
        c.shadowOffsetY = 3;
        c.fill();
        c.shadowColor = "transparent";
        c.strokeStyle = "#4b5c51";
        c.lineWidth = 3;
        c.stroke();
        c.clip();
        rect(c, px, py, T, T, "#b7bba7");
        for (let row = 0; row < 8; row++) {
          const yy = py + row * 8;
          line(c, [[px, yy], [px + T, yy]], "#788775", 1);
          for (let col = 0; col < 5; col++) {
            const xx = px + col * 16 + row % 2 * 8;
            line(c, [[xx, yy], [xx, yy + 8]], "#87927e", 1);
          }
        }
        c.restore();
      }
    }
    return canvas;
  }
  let ground, groundSeed;
  function healthBarY(b) {
    const type = b.type, level = GF.visualLevel(b.level);
    if (type === "gate") return level > 1 ? -56 : -46;
    if (type === "farm") return -26;
    if (type === "mulberry") return -31;
    if (type === "quarry" || type === "rock") return -34;
    if (type === "tower") return level > 1 ? -57 : -49;
    if (type === "well") return -37;
    if (type === "zhong") return -43;
    if (level === 3) return -61;
    if (level === 2) return -48;
    return ["shrine", "earth", "tao", "guild", "port", "barracks"].includes(type) ? -44 : -29;
  }
  function influenceBounds(s, b) {
    const d = GF.DEFS[b.type];
    if (d.cat !== "economy" && b.type !== "well" && b.type !== "earth") return null;
    const radius = d.cat === "economy" ? d.radius : b.type === "earth" ? d.range : 1;
    if (radius === 0) return null;
    const x = Math.max(2, (b.x - radius) * T + 2), y = Math.max(2, (b.y - radius) * T + 2);
    const right = Math.min(GF.worldSize(s) * T - 2, (b.x + radius + 1) * T - 2), bottom = Math.min(GF.worldSize(s) * T - 2, (b.y + radius + 1) * T - 2);
    return { x, y, width: right - x, height: bottom - y };
  }
  function directChainLink(consumer, producer) {
    var _a;
    const d = GF.DEFS[consumer.type];
    if (!d.radius || GF.dist8(consumer.x, consumer.y, producer.x, producer.y) > d.radius) return false;
    return d.prev === producer.type || !!((_a = d.required) == null ? void 0 : _a.includes(producer.type));
  }
  function selectedLinks(s, b) {
    return s.buildings.filter((n) => n !== b && (directChainLink(b, n) || directChainLink(n, b)));
  }
  function drawSelection(c, s, selected) {
    if (!selected) return;
    const b = GF.at(s, selected.x, selected.y);
    if (!b) return;
    const d = GF.DEFS[b.type], bounds = influenceBounds(s, b);
    c.save();
    if (b.type === "tower") {
      const radius = (d.range + (b.level - 1) * 0.35) * T;
      c.beginPath();
      c.arc(b.x * T + 32, b.y * T + 32, radius, 0, Math.PI * 2);
      c.fillStyle = "#8faa6518";
      c.fill();
      c.setLineDash([7, 5]);
      c.strokeStyle = s.phase === "night" ? "#c4dca4" : "#769258";
      c.lineWidth = 2;
      c.stroke();
    }
    if (bounds) {
      c.fillStyle = "#7f9b7510";
      c.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      c.setLineDash([7, 6]);
      c.lineWidth = 1.5;
      c.strokeStyle = s.phase === "night" ? "#bbca9db8" : "#69856eaa";
      c.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
    c.setLineDash([4, 5]);
    c.globalAlpha = s.phase === "night" ? 0.92 : 0.82;
    for (const n of selectedLinks(s, b)) {
      const nd = GF.DEFS[n.type], chain = d.chain || nd.chain;
      const color = { 商: "#9c8052", 农: "#6e875b", 丝: "#96758c", 工: "#648388" }[chain] || "#9b8660";
      const sx = b.x * T + 32, sy = b.y * T + 37, tx = n.x * T + 32, ty = n.y * T + 37, dx = tx - sx, dy = ty - sy, length = Math.hypot(dx, dy), trim = 12;
      line(c, [[sx + dx / length * trim, sy + dy / length * trim], [tx - dx / length * trim, ty - dy / length * trim]], color, 2.2);
    }
    c.restore();
  }
  function render(canvas, s, cam, selected, options = {}) {
    const size = GF.worldSize(s), center = GF.worldCenter(s), estate = GF.estate(s), cacheKey = JSON.stringify([s.mapSeed, s.estateSeed, size, s.mapGeneration]);
    if (!ground || groundSeed !== cacheKey) {
      ground = makeGround(s);
      groundSeed = cacheKey;
    }
    const c = canvas.getContext("2d"), w = canvas.clientWidth, h = canvas.clientHeight, dpr = canvas.width / w;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const night = s.phase === "night", dusk = s.phase === "dusk";
    c.fillStyle = night ? "#31494a" : dusk ? "#b9b89b" : "#d5dcc5";
    c.fillRect(0, 0, w, h);
    c.save();
    c.translate(cam.x, cam.y);
    c.scale(cam.zoom, cam.zoom);
    for (let i = 0; i < Math.ceil(size * T / 99) + 5; i++) {
      const x = i * 99 - 180;
      poly(c, [[x, -5], [x + 60, -110 - noise(i, 4) * 170], [x + 160, -5]], night ? "#3f5754" : "#aebda04d");
      poly(c, [[x - 90, size * T + 10], [x - 20, size * T + 100 + noise(i, 2) * 70], [x + 90, size * T + 10]], night ? "#3f5754" : "#aebda03b");
    }
    c.shadowColor = "#40583e18";
    c.shadowBlur = 35;
    c.shadowOffsetY = 8;
    c.drawImage(ground, 0, 0);
    c.shadowColor = "transparent";
    const left = Math.max(0, Math.floor(-cam.x / cam.zoom / T) - 1), right = Math.min(size - 1, Math.ceil((w - cam.x) / cam.zoom / T) + 1), top = Math.max(0, Math.floor(-cam.y / cam.zoom / T) - 1), bottom = Math.min(size - 1, Math.ceil((h - cam.y) / cam.zoom / T) + 1);
    const occupied = new Set(s.buildings.map((b) => b.x + "," + b.y));
    if (options.grid) {
      c.strokeStyle = "#5d78502b";
      c.lineWidth = 0.7;
      c.setLineDash([2, 4]);
      for (let i = 0; i <= size; i++) {
        line(c, [[i * T, 0], [i * T, size * T]], "#5d785026", 0.7);
        line(c, [[0, i * T], [size * T, i * T]], "#5d785026", 0.7);
      }
      c.setLineDash([]);
    }
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (occupied.has(x + "," + y) || GF.isWall(s, x, y) || (estate == null ? void 0 : estate.roads.has(y * size + x))) continue;
      const type = GF.terrain(x, y, s);
      c.save();
      c.translate(x * T + 32, y * T + 32);
      if (estate && !GF.owns(s, x, y)) c.globalAlpha = 0.78;
      if (type === "forest") {
        tree(c, -14, 7, 0.95);
        tree(c, 10, -8, 1.1);
        bamboo(c, 15, 19, 0.66);
      }
      if (type === "mountain") {
        stone(c, -9, 9, 1.1);
        stone(c, 15, -4, 1.2);
        stone(c, -13, -13, 0.6);
      }
      if (type === "plain" && (x === 0 || y === 0 || x === size - 1 || y === size - 1)) {
        if (noise(x, y) > 0.35) tree(c, 0, 8, 0.8 + noise(x, y) * 0.5, true);
      }
      if (type === "water") {
        const off = Math.sin(s.elapsed * 0.8 + x + y) * 2;
        line(c, [[-15 + off, -10], [1 + off, -10]], "#e1ebd880", 0.9);
        line(c, [[8 - off, 10], [19 - off, 10]], "#e1ebd860", 0.9);
        if (noise(x, y) > 0.65) {
          for (let i = 0; i < 4; i++) line(c, [[-23 + i * 3, 22], [-25 + i * 3, 9 + noise(x, y, i) * 7]], "#739575", 1.3);
        }
      }
      c.restore();
    }
    if (selected) {
      const px = selected.x * T, py = selected.y * T;
      rect(c, px + 2, py + 2, T - 4, T - 4, "#fbebaf30");
      c.strokeStyle = "#b59451";
      c.lineWidth = 1.5;
      c.strokeRect(px + 2, py + 2, T - 4, T - 4);
      if (!GF.at(s, selected.x, selected.y)) {
        c.font = "23px serif";
        c.textAlign = "center";
        c.fillStyle = "#9c8448";
        c.fillText("+", px + 32, py + 40);
      }
    }
    for (const b of [...s.buildings].sort((a, b2) => a.y - b2.y)) {
      if (b.x < left || b.x > right || b.y < top || b.y > bottom) continue;
      c.save();
      c.translate(b.x * T + 32, b.y * T + 32);
      building(c, b.type, b.level, s.elapsed);
      if (b.type === "gate") {
        if (b.hp <= 0) {
          poly(c, [[-16, -6], [-5, 1], [-10, 20], [12, 20], [5, 4], [17, -6]], "#34443bee");
          line(c, [[-14, 17], [-3, 9], [10, 21]], "#b19872", 3);
          c.font = 'bold 11px "Microsoft YaHei",sans-serif';
          c.textAlign = "center";
          rect(c, -19, -19, 38, 15, "#714a3be8");
          c.fillStyle = "#ffe0b0";
          c.fillText("毁损", 0, -8);
        } else {
          c.font = "bold 10px serif";
          c.textAlign = "center";
          c.fillStyle = "#f1dfae";
          c.fillText(["北", "东", "南", "西"][b.direction] || "门", 0, -13);
        }
      }
      if (b.type === "shrine" && s.buildings.length === 1) {
        c.strokeStyle = "#ead59a80";
        c.lineWidth = 1;
        ellipse(c, 0, 19, 32 + Math.sin(s.elapsed) * 2, 12, null, "#b99e6770");
      }
      if (b.hp < GF.maxHP(b)) {
        const y = healthBarY(b);
        rect(c, -21, y, 42, 3, "#61775c66");
        rect(c, -21, y, 42 * Math.max(0, b.hp / GF.maxHP(b)), 3, b.hp / GF.maxHP(b) > 0.35 ? "#819d64" : "#b06a4e");
      }
      if (!GF.upgradeReason(s, b)) poly(c, [[11, -5], [17, -11], [23, -5], [20, -5], [20, 0], [14, 0], [14, -5]], "#b4df63", "#496a38", 1.2);
      const levelLabel = String(b.level), badgeWidth = 16, badgeX = 25 - badgeWidth;
      c.beginPath();
      c.moveTo(badgeX + 2, 5);
      c.lineTo(23, 5);
      c.quadraticCurveTo(25, 5, 25, 7);
      c.lineTo(25, 19);
      c.quadraticCurveTo(25, 21, 23, 21);
      c.lineTo(badgeX + 2, 21);
      c.quadraticCurveTo(badgeX, 21, badgeX, 19);
      c.lineTo(badgeX, 7);
      c.quadraticCurveTo(badgeX, 5, badgeX + 2, 5);
      c.closePath();
      c.fillStyle = "#52685a";
      c.fill();
      c.fillStyle = "#f4ebd2";
      c.font = '900 11px "SimHei","Microsoft YaHei",sans-serif';
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(levelLabel, badgeX + badgeWidth / 2, 13);
      c.textBaseline = "alphabetic";
      if (cam.zoom >= 0.9) {
        const label = b.type === "gate" ? (["北", "东", "南", "西"][b.direction] || "") + "城门" : GF.DEFS[b.type].name;
        c.font = '9px "Microsoft YaHei",sans-serif';
        const labelWidth = c.measureText(label).width + 14;
        rect(c, -labelWidth / 2, 27, labelWidth, 14, "#f3f0daf0");
        c.fillStyle = "#52694e";
        c.fillText(label, 0, 37);
      }
      if (GF.DEFS[b.type].end) {
        poly(c, [[-23, 10], [-19, 14], [-23, 18], [-27, 14]], "#c5a25d");
      }
      c.restore();
      if (b.type === "barracks" && b.soldier && night) {
        c.save();
        c.translate(b.soldier.x * T + 32, b.soldier.y * T + 32);
        person(c, "soldier", s.elapsed);
        c.restore();
      }
    }
    for (const e of s.enemies) {
      c.save();
      c.translate(e.x * T + 32, e.y * T + 32);
      if (e.boss) c.scale(1.6, 1.6);
      person(c, e.type, s.elapsed, e.repelled > 0);
      if (e.slowed > 0) ellipse(c, 0, 2, 13, 18, "#8bb7a029", "#76a08f");
      rect(c, -13, -26, 26, 2.5, "#273e3480");
      rect(c, -13, -26, 26 * Math.max(0, e.hp / e.maxHp), 2.5, "#bb775a");
      c.restore();
    }
    if (night || dusk) {
      c.fillStyle = night ? "#19395878" : "#ac723222";
      c.fillRect(0, 0, T * size, T * size);
      if (night) {
        c.globalCompositeOperation = "screen";
        for (const b of s.buildings) {
          if (["shrine", "earth", "tao", "tower", "inn"].includes(b.type)) {
            const x = b.x * T + 32, y = b.y * T + 36, g = c.createRadialGradient(x, y, 2, x, y, 64);
            g.addColorStop(0, "#d4a34536");
            g.addColorStop(1, "#d4a34500");
            c.fillStyle = g;
            c.fillRect(x - 64, y - 64, 128, 128);
          }
        }
        c.globalCompositeOperation = "source-over";
      }
    }
    drawSelection(c, s, selected);
    for (const p of s.projectiles) {
      const f = 1 - p.life / p.total, x = (p.x + (p.tx - p.x) * f) * T + 32, y = (p.y + (p.ty - p.y) * f) * T + 22;
      if (p.type === "rock") {
        ellipse(c, x, y - Math.sin(f * Math.PI) * 35, 4, 4, "#c6c4a2");
      } else {
        line(c, [[x, y], [x - (p.tx - p.x) * 5, y - (p.ty - p.y) * 5]], p.type === "barracks" ? "#f5e5a1" : "#f6e8bf", 2);
      }
    }
    for (const e of s.effects) {
      const x = e.x * T + 32, y = e.y * T + 32, f = 1 - e.life / e.total;
      c.save();
      c.globalAlpha = 1 - f;
      if (e.type === "thunder") {
        line(c, [[x + 15, y - 120], [x - 10, y - 70], [x + 7, y - 70], [x - 5, y]], "#faf3b0", 3);
        ellipse(c, x, y, 22, 12, "#eee4a344");
      } else if (e.type === "zhong-pulse") {
        ellipse(c, x, y, 24 + f * 480, 16 + f * 480, null, "#8eb8a0");
      } else if (e.type === "income" || e.type === "coin") {
        c.globalAlpha = Math.min(1, (1 - f) * 3);
        c.translate(x, y - (e.type === "income" ? 4 : 20) - f * 24);
        c.scale(Math.max(1, 1 / cam.zoom), Math.max(1, 1 / cam.zoom));
        c.font = "bold 13px Georgia,serif";
        c.textAlign = "left";
        const label = "+" + e.amount, tw = c.measureText(label).width, start = -(tw + 18) / 2;
        c.lineWidth = 3;
        c.strokeStyle = "#3e573ae0";
        c.strokeText(label, start, 0);
        c.fillStyle = "#ffecb1";
        c.fillText(label, start, 0);
        const cx = start + tw + 10;
        if (e.resource === "materials") {
          c.save();
          c.translate(cx, -5);
          c.rotate(-0.6);
          rect(c, -2, -1, 4, 11, "#b99764", "#665e47");
          rect(c, -7, -6, 14, 5, "#849a8b", "#4e695f");
          line(c, [[-5, -4], [5, -4]], "#b6c7ad", 1);
          c.restore();
        } else {
          ellipse(c, cx, -5, 6, 6, "#ddb767", "#6f743d");
          ellipse(c, cx, -5, 4.2, 4.2, null, "#fae3a2");
          rect(c, cx - 1.7, -6.7, 3.4, 3.4, "#61724a", "#b18e4c");
        }
      } else if (e.type === "hit") {
        ellipse(c, x, y, 20, 20, "#ae674066");
      } else {
        ellipse(c, x, y, 20 + f * 450, 20 + f * 450, null, e.type === "repair" ? "#d0e8a4" : "#eee0a6");
      }
      c.restore();
    }
    if (s.phase !== "day") {
      const d = s.direction, mid = (center + 0.5) * T, positions = [[mid, 25], [size * T - 25, mid], [mid, size * T - 25], [25, mid]], p = positions[d];
      c.font = "bold 15px serif";
      c.textAlign = "center";
      c.fillStyle = night ? "#efd5a0" : "#a96045";
      c.fillText("⚠ 来袭", p[0], p[1]);
    }
    c.restore();
    if (!night) {
      for (let i = 0; i < 2; i++) {
        const x = (s.elapsed * 8 + i * 37 + w * 0.67) % (w + 100) - 50, y = h * 0.31 + Math.sin(s.elapsed * 0.12 + i) * 15 + i * 12;
        line(c, [[x - 6, y - 2], [x, y + Math.sin(s.elapsed * 4 + i) * 2], [x + 6, y - 2]], "#5d73596a", 1);
      }
    }
  }
  function person(c, type, time, frozen) {
    const bob = frozen ? 0 : Math.sin(time * 8) * 1.5;
    ellipse(c, 1, 10, 9, 3, "#273d3b38");
    if (type === "fox") {
      poly(c, [[-6, 4], [-17, -5], [-13, 7], [-5, 10]], "#c5a381");
      ellipse(c, 1, 3 + bob, 8, 5, "#c69a77");
      poly(c, [[4, 0 + bob], [5, -9 + bob], [9, -4 + bob], [13, -9 + bob], [13, 1 + bob]], "#d8b891", "#996d56");
      rect(c, 7, -2 + bob, 1.5, 1.5, "#565246");
    } else {
      const color = type === "ghost" ? "#849b9c" : type === "soldier" ? "#818967" : "#916b60";
      poly(c, [[-5, -3 + bob], [5, -3 + bob], [8, 9], [-7, 9]], color, "#52605b");
      ellipse(c, 0, -8 + bob, 4.5, 5, type === "ghost" ? "#b4c8bb" : "#c6b592");
      rect(c, -5, -13 + bob, 10, 3, type === "soldier" ? "#526d60" : "#5a625b");
      line(c, [[-3, 9], [-4, 14 + bob]], "#4c5851", 2);
      line(c, [[3, 9], [5, 14 - bob]], "#4c5851", 2);
      line(c, [[7, 1], [10, -11]], type === "ghost" ? "#a5c3b5" : "#bec1a7", 2);
    }
    if (frozen) {
      ellipse(c, 0, -1, 14, 19, null, "#e9d28d");
      c.fillStyle = "#eddda5";
      c.font = "10px serif";
      c.textAlign = "center";
      c.fillText("封", 0, -18);
    }
  }
  window.GFArt = { T, thumbnail, render };
})();

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
(function(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./game.js"));
  else root.GFAutoplay = factory(root.GF);
})(typeof globalThis !== "undefined" ? globalThis : this, function(G) {
  "use strict";
  const key = (p) => `${p.x},${p.y}`;
  const near = (a, b) => G.dist8(a.x, a.y, b.x, b.y) === 1;
  const coversGate = (p, gate) => {
    const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][gate.direction];
    return Math.hypot(p.x - gate.x, p.y - gate.y) <= G.DEFS.tower.range && Math.hypot(p.x - gate.x - dx, p.y - gate.y - dy) <= G.DEFS.tower.range;
  };
  function layout(s, towersPerGate) {
    const size = G.worldSize(s), center = G.worldCenter(s);
    const plots = [...G.estate(s).cells].map((k) => ({ x: k % size, y: Math.floor(k / size) })).filter((p) => G.terrain(p.x, p.y, s) !== "water" && !G.at(s, p.x, p.y));
    const reserved = /* @__PURE__ */ new Set(), towers = [];
    for (const gate of G.estate(s).gates) {
      let score = function(p) {
        return Math.hypot(p.x - gate.x, p.y - gate.y) + (G.estate(s).roads.has(p.y * size + p.x) ? 20 : 0) + (G.terrain(p.x, p.y, s) === "plain" ? 0 : 10);
      };
      const candidates = plots.filter((p) => coversGate(p, gate)).sort((a, b) => score(a) - score(b) || a.y - b.y || a.x - b.x);
      for (let i = 0; i < towersPerGate; i++) {
        const p = candidates.find((p2) => !reserved.has(key(p2)));
        if (!p) throw new Error(`No land tower coverage for gate ${gate.direction}`);
        reserved.add(key(p));
        towers.push(__spreadProps(__spreadValues({}, p), { type: "tower", direction: gate.direction }));
      }
    }
    const available = plots.filter((p) => !reserved.has(key(p)));
    const neighbors = (p) => available.filter((q) => near(p, q));
    const ordinary = (p) => ["plain", "shore"].includes(G.terrain(p.x, p.y, s));
    const used = new Set(reserved), plan = [];
    function pair(chainA, chainB, final) {
      const connectors = available.filter(ordinary).sort((a, b) => G.dist8(a.x, a.y, center, center) - G.dist8(b.x, b.y, center, center) || a.y - b.y || a.x - b.x);
      function triples(chain, connector) {
        const [root, middle, end] = chain, found = [];
        for (const e of neighbors(connector).filter(ordinary)) {
          if (used.has(key(e))) continue;
          for (const m of neighbors(e).filter(ordinary)) {
            if (used.has(key(m)) || key(m) === key(connector)) continue;
            for (const r of neighbors(m)) {
              if (used.has(key(r)) || key(r) === key(e) || key(r) === key(connector)) continue;
              if (G.terrain(r.x, r.y, s) !== G.DEFS[root].terrain) continue;
              found.push([__spreadProps(__spreadValues({}, r), { type: root }), __spreadProps(__spreadValues({}, m), { type: middle }), __spreadProps(__spreadValues({}, e), { type: end })]);
            }
          }
        }
        return found;
      }
      for (const c of connectors) {
        if (used.has(key(c))) continue;
        for (const a of triples(chainA, c)) {
          a.forEach((p) => used.add(key(p)));
          const b = triples(chainB, c)[0];
          if (b) {
            b.forEach((p) => used.add(key(p)));
            used.add(key(c));
            plan.push(...a, ...b, __spreadProps(__spreadValues({}, c), { type: final }));
            return true;
          }
          a.forEach((p) => used.delete(key(p)));
        }
      }
      return false;
    }
    if (!pair(["tea", "inn", "bank"], ["farm", "mill", "wine"], "guild") || !pair(["mulberry", "weaver", "tailor"], ["quarry", "kiln", "trade"], "port")) {
      throw new Error(`Cannot fit complete economy layout for seed ${s.mapSeed}`);
    }
    plan.sort((a, b) => {
      var _a, _b;
      return ((_a = G.DEFS[a.type].tier) != null ? _a : 3) - ((_b = G.DEFS[b.type].tier) != null ? _b : 3) || ["tea", "mulberry", "quarry", "farm"].indexOf(a.type) - ["tea", "mulberry", "quarry", "farm"].indexOf(b.type);
    });
    return { economy: plan, towers, plots };
  }
  function create(s) {
    var _a, _b;
    const size = G.worldSize(s), center = G.worldCenter(s), land = G.estate(s);
    const plots = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (G.owns(s, x, y) && !G.isWall(s, x, y) && G.terrain(x, y, s) !== "water" && !(land == null ? void 0 : land.gates.some((g) => g.x === x && g.y === y))) plots.push({ x, y });
    }
    let planned = null;
    if (land && s.buildings.every((b) => ["shrine", "gate"].includes(b.type))) {
      try {
        planned = layout(s, 1);
      } catch (e) {
      }
    }
    const gates = (land == null ? void 0 : land.gates) || [{ x: center, y: center - 3, direction: 0 }, { x: center + 3, y: center, direction: 1 }, { x: center, y: center + 3, direction: 2 }, { x: center - 3, y: center, direction: 3 }];
    const stats = { activeSeconds: 0, decisions: 0, builds: 0, upgrades: 0, skills: { repair: 0, thunder: 0, repel: 0 }, lastAction: "等待开始", startDay: s.day, startElapsed: s.elapsed, mapSeed: (_a = s.mapSeed) != null ? _a : null, mapGeneration: (_b = s.mapGeneration) != null ? _b : 1, actions: [], droppedActions: 0 };
    let clock = 1, forecastDay = 0, forecast = null, decisionReason = "发展产业", defenseBudget = { coins: 0, materials: 0 };
    function record(kind, type, building) {
      const name = kind === "skill" ? G.SKILLS[type].name : G.DEFS[type].name;
      stats.lastAction = (kind === "build" ? "建造" : kind === "upgrade" ? "升级" : "施放") + name + (kind === "upgrade" ? " Lv." + building.level : "");
      const entry = { second: +stats.activeSeconds.toFixed(1), day: s.day, phase: s.phase, kind, type, reason: decisionReason, coins: s.coins, materials: s.materials };
      if (building) Object.assign(entry, { x: building.x, y: building.y, level: building.level });
      stats.actions.push(entry);
      if (stats.actions.length > 2e3) {
        stats.actions.shift();
        stats.droppedActions++;
      }
      if (kind === "skill") stats.skills[type]++;
      else if (kind === "build") stats.builds++;
      else stats.upgrades++;
      return true;
    }
    function build(type, p) {
      if (!p || G.buildReason(s, type, p.x, p.y)) return false;
      const r = G.build(s, type, p.x, p.y);
      return r.ok && record("build", r.rolled || type, r.building);
    }
    function upgrade(b) {
      return b && !G.upgradeReason(s, b) && G.upgrade(s, b).ok && record("upgrade", b.type, b);
    }
    function towerPlots() {
      if (planned == null ? void 0 : planned.towers.some((p) => {
        const b = G.at(s, p.x, p.y);
        return b && b.type !== "tower";
      })) planned = null;
      if (planned) return planned.towers;
      const reserved = /* @__PURE__ */ new Set(), result = [];
      for (const gate of gates) {
        let score = function(p) {
          return Math.hypot(p.x - gate.x, p.y - gate.y) + ((land == null ? void 0 : land.roads.has(p.y * size + p.x)) ? 20 : 0) + (G.terrain(p.x, p.y, s) === "plain" ? 0 : 10);
        };
        const present = s.buildings.filter((b) => b.type === "tower" && coversGate(b, gate)).length;
        const choices = plots.filter((p) => !G.at(s, p.x, p.y) && coversGate(p, gate) && !reserved.has(key(p)));
        choices.sort((a, b) => score(a) - score(b));
        for (const p of choices.slice(0, Math.max(0, 1 - present))) {
          reserved.add(key(p));
          result.push(__spreadProps(__spreadValues({}, p), { type: "tower", direction: gate.direction }));
        }
      }
      return result;
    }
    function economy(towers) {
      if (planned == null ? void 0 : planned.economy.some((p) => {
        const b = G.at(s, p.x, p.y);
        return b && b.type !== p.type;
      })) planned = null;
      const rates = G.rates(s), weights = { coins: 1 / Math.max(0.5, rates.coins), materials: 1 / Math.max(0.5, rates.materials) };
      const value = (cost) => cost.coins * weights.coins + cost.materials * weights.materials;
      const options = [], base = G.rates(s);
      const reserve = s.phase === "day" && s.time > G.DAY - 18 ? G.DEFS.tower.cost : defenseBudget;
      const affordable = (cost) => s.coins >= cost.coins + reserve.coins && s.materials >= cost.materials + reserve.materials;
      function gain(buildings) {
        const next = G.rates(__spreadProps(__spreadValues({}, s), { buildings }));
        return (next.coins - base.coins) * weights.coins + (next.materials - base.materials) * weights.materials;
      }
      for (const d of Object.values(G.DEFS).filter((d2) => d2.cat === "economy")) {
        if (d.limit && s.buildings.filter((b) => b.type === d.id).length >= d.limit) continue;
        const cost = G.buildCost(s, d.id);
        let best2 = null;
        for (const p of plots) {
          if (towers.some((t) => key(t) === key(p))) continue;
          if (planned == null ? void 0 : planned.economy.some((q) => key(q) === key(p) && q.type !== d.id)) continue;
          const reason = G.buildReason(s, d.id, p.x, p.y);
          if (reason && !reason.startsWith("差 ")) continue;
          const b = __spreadProps(__spreadValues({}, p), { type: d.id, level: 1 }), increase = gain([...s.buildings, b]);
          let open = 0;
          for (const q of plots) if (near(p, q) && !G.at(s, q.x, q.y) && ["plain", "shore"].includes(G.terrain(q.x, q.y, s))) open++;
          const plannedPlot = planned == null ? void 0 : planned.economy.some((q) => q.type === d.id && key(q) === key(p));
          const score = increase / Math.max(1, value(cost)) * (plannedPlot ? 1.12 : 1) * (1 + open * 5e-3);
          if (!best2 || score > best2.score) best2 = { score, cost, run: () => build(d.id, p), reason: "扩建" + d.name + "，提高" + (d.resource === "materials" ? "工材" : "铜钱") + "收入" };
        }
        if (best2) options.push(best2);
      }
      const shrineBuilding = s.buildings.find((b) => b.type === "shrine");
      for (const b of s.buildings.filter((b2) => G.DEFS[b2.type].income)) {
        if (b.level >= G.maxLevel(b)) continue;
        const reason = G.upgradeReason(s, b), next = __spreadProps(__spreadValues({}, b), { level: b.level + 1 }), cost = G.upgradeCost(b);
        const increase = gain(s.buildings.map((n) => n === b ? next : n));
        if (!reason || reason.startsWith("差 ")) options.push({ score: increase / Math.max(1, value(cost)), cost, run: () => upgrade(b), reason: "升级" + G.DEFS[b.type].name + "，提高单位投入收益" });
        else if (reason.startsWith("需祠堂") && shrineBuilding && !G.upgradeReason(s, shrineBuilding)) {
          const required = G.requiredShrineLevel(next.level), total = __spreadValues({}, cost);
          for (let level = shrineBuilding.level; level < required; level++) {
            const c = G.upgradeCost(__spreadProps(__spreadValues({}, shrineBuilding), { level }));
            total.coins += c.coins;
            total.materials += c.materials;
          }
          options.push({ score: increase / Math.max(1, value(total)), cost: G.upgradeCost(shrineBuilding), run: () => upgrade(shrineBuilding), reason: "提升祠堂，解锁产业升级" });
        }
      }
      options.sort((a, b) => b.score - a.score);
      const best = options[0], ready = options.find((o) => affordable(o.cost));
      if (best && ready && best.score > ready.score * 1.5 && !affordable(best.cost)) {
        const wait = Math.max(Math.max(0, best.cost.coins + reserve.coins - s.coins) / (rates.coins || 1e-4), Math.max(0, best.cost.materials + reserve.materials - s.materials) / (rates.materials || 1e-4));
        if (wait <= 8) return false;
      }
      if (ready) {
        decisionReason = ready.reason;
        return ready.run();
      }
      return false;
    }
    function defense(towers) {
      var _a2, _b2, _c, _d, _e, _f;
      if (s.phase === "day") return false;
      if (forecastDay !== s.day) {
        const probe = G.restore(G.serialize(s));
        if (probe) {
          probe.enemies = [];
          probe.buildings = probe.buildings.filter((b) => !G.DEFS[b.type].damage);
          G.startNight(probe);
          G.step(probe, 0.25);
          G.step(probe, 0.25);
          forecast = { hp: ((_a2 = probe.enemies[0]) == null ? void 0 : _a2.maxHp) || 45, total: ((_b2 = probe.wave) == null ? void 0 : _b2.total) || 5, interval: (((_c = probe.wave) == null ? void 0 : _c.timer) || 1) + 0.15 };
        } else forecast = { hp: 45, total: 5, interval: 1.3 };
        forecastDay = s.day;
      }
      const boss = s.day % 7 === 0, pending = s.phase === "night" ? Math.max(0, (((_d = s.wave) == null ? void 0 : _d.total) || 0) - (((_e = s.wave) == null ? void 0 : _e.spawned) || 0)) : forecast.total;
      const damage = (b) => G.DEFS[b.type].damage * G.factor(b) * G.defenseBoost(s) / G.DEFS[b.type].interval;
      const covers = (b, g) => Math.hypot(b.x - g.x, b.y - g.y) <= G.DEFS[b.type].range + (b.level - 1) * 0.35;
      const needs = [];
      for (const gate of gates) {
        const enemies = s.enemies.filter((e) => gates.reduce((a, b) => Math.hypot(e.x - a.x, e.y - a.y) <= Math.hypot(e.x - b.x, e.y - b.y) ? a : b) === gate);
        if (!boss && gate.direction !== s.direction && !enemies.length) continue;
        if (!pending && !enemies.length) continue;
        const defenders = s.buildings.filter((b) => G.DEFS[b.type].damage && covers(b, gate)), firepower = defenders.reduce((n, b) => n + damage(b), 0);
        const nearEnemies = enemies.filter((e) => Math.hypot(e.x - gate.x, e.y - gate.y) < 4);
        const gateBuilding = s.buildings.find((b) => b.type === "gate" && b.direction === gate.direction), health = gateBuilding ? gateBuilding.hp / G.maxHP(gateBuilding) : 1;
        const remaining = (boss ? pending / 4 : pending) + enemies.length;
        const sustained = forecast.hp * (s.day >= 4 ? 1.45 : 1) / forecast.interval * 0.6 * (boss ? 0.6 : 1) * Math.min(1, remaining / 5);
        const urgent = nearEnemies.reduce((n, e) => n + e.hp, 0) / (health < 0.5 ? 4 : 10);
        const target = Math.max(sustained, urgent);
        if (firepower >= target) continue;
        needs.push({ gate, defenders, missing: target - firepower, urgent: health < 0.5 && nearEnemies.length > 0 });
      }
      needs.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.missing - a.missing);
      for (const { gate, defenders, missing, urgent } of needs) {
        decisionReason = ["北", "东", "南", "西"][gate.direction] + "方" + (urgent ? "城门受压" : "来袭火力不足") + "，补强防守";
        const choices = [];
        for (const b of defenders) {
          if (!G.upgradeReason(s, b)) {
            const cost = G.upgradeCost(b), gain = damage(__spreadProps(__spreadValues({}, b), { level: b.level + 1 })) - damage(b);
            choices.push({ score: Math.min(missing, gain) * 1.5 / (cost.coins + cost.materials), run: () => upgrade(b) });
          }
        }
        choices.sort((a, b) => b.score - a.score);
        if ((_f = choices[0]) == null ? void 0 : _f.run()) return true;
        const shrineBuilding = s.buildings.find((b) => b.type === "shrine");
        const locked = defenders.some((b) => G.upgradeReason(s, b).startsWith("需祠堂"));
        if (locked && upgrade(shrineBuilding)) return true;
        if (defenders.some((b) => b.level < G.maxLevel(b)) && !urgent) {
          const costs = locked && shrineBuilding ? [G.upgradeCost(shrineBuilding)] : defenders.filter((b) => b.level < G.maxLevel(b)).map(G.upgradeCost);
          costs.sort((a, b) => a.coins + a.materials - b.coins - b.materials);
          defenseBudget = costs[0] || G.DEFS.tower.cost;
          continue;
        }
        const candidates = plots.filter((p) => coversGate(p, gate) && !G.buildReason(s, "tower", p.x, p.y) && !(planned == null ? void 0 : planned.economy.some((q) => key(q) === key(p))));
        candidates.sort((a, b) => Number(towers.some((t) => key(t) === key(b))) - Number(towers.some((t) => key(t) === key(a))) || Math.hypot(a.x - gate.x, a.y - gate.y) - Math.hypot(b.x - gate.x, b.y - gate.y));
        if (candidates.length && build("tower", candidates[0])) return true;
        defenseBudget = G.DEFS.tower.cost;
        const gateBuilding = s.buildings.find((b) => b.type === "gate" && b.direction === gate.direction);
        if (urgent && (gateBuilding == null ? void 0 : gateBuilding.hp) > 0 && upgrade(gateBuilding)) return true;
      }
      return false;
    }
    function skills() {
      if (s.phase !== "night") return false;
      const damaged = s.buildings.some((b) => b.hp / G.maxHP(b) < 0.6);
      const pressure = s.enemies.filter((e) => gates.some((g) => Math.hypot(e.x - g.x, e.y - g.y) < 2)).length;
      const nearShrine = s.enemies.some((e) => Math.hypot(e.x - center, e.y - center) < 3);
      for (const [id, wanted] of [["repair", damaged], ["thunder", s.enemies.length >= 5 || nearShrine], ["repel", pressure >= 3 || nearShrine]]) {
        if (wanted && !G.skillReason(s, id) && G.skill(s, id).ok) {
          decisionReason = "按当前战况施法";
          return record("skill", id);
        }
      }
      return false;
    }
    function tick(dt) {
      if (s.over || !Number.isFinite(dt) || dt <= 0) return false;
      stats.activeSeconds += dt;
      clock += dt;
      if (clock < 1) return false;
      clock %= 1;
      stats.decisions++;
      const cast = skills(), towers = towerPlots();
      defenseBudget = { coins: 0, materials: 0 };
      const acted = defense(towers) || economy(towers);
      return !!(acted || cast);
    }
    function report() {
      return __spreadProps(__spreadValues({ schema: 1, controller: "income-pressure-v2" }, stats), { activeSeconds: +stats.activeSeconds.toFixed(1), day: s.day, phase: s.phase, over: s.over, kills: s.kills, buildings: s.buildings.length, rates: G.rates(s), skills: __spreadValues({}, stats.skills), actions: stats.actions.map((a) => __spreadValues({}, a)) });
    }
    return { tick, report, get lastAction() {
      return stats.lastAction;
    } };
  }
  return { create, layout, coversGate };
});

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
(function() {
  "use strict";
  const $ = (id) => document.getElementById(id), canvas = $("map"), KEY = "gufang-qitan-save-v1";
  let storageWarning = false, saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch (e) {
    storageWarning = true;
  }
  const SOUND_KEY = "gufang-qitan-sound";
  let state = saved && GF.restore(saved) || GF.createState(), selected = null, paused = true, sound = false, started = false;
  try {
    sound = localStorage.getItem(SOUND_KEY) === "on";
  } catch (e) {
  }
  let saveStatus = storageWarning ? "本地存档不可用" : "本地自动存档";
  let autoplay = false, pilot = null;
  let panelKey = "", lastPhase = "", lastFrame = 0, uiClock = 0, saveClock = 0, toastTimer, audioContext, hiddenPause = document.hidden, demolishTarget = null;
  const cam = { x: 0, y: 0, zoom: 1 }, pointers = /* @__PURE__ */ new Map();
  const view = { width: 390, height: 844 };
  function center() {
    cam.zoom = Math.max(0.55, Math.min(0.86, view.width / 550));
    cam.x = view.width * 0.5 - (GF.worldCenter(state) + 0.5) * GFArt.T * cam.zoom;
    cam.y = view.height * 0.48 - (GF.worldCenter(state) + 0.5) * GFArt.T * cam.zoom;
    clampCamera();
  }
  function resize() {
    GufangBoot.layout();
    const ratio = Math.min(devicePixelRatio || 1, 2), oldW = view.width, oldH = view.height;
    view.width = $("game").clientWidth;
    view.height = $("game").clientHeight;
    canvas.width = Math.round(view.width * ratio);
    canvas.height = Math.round(view.height * ratio);
    if (!canvas._ready) {
      center();
      canvas._ready = true;
    } else {
      cam.x += (view.width - oldW) / 2;
      cam.y += (view.height - oldH) / 2;
      clampCamera();
    }
  }
  function clampCamera() {
    const size = GF.worldSize(state) * GFArt.T * cam.zoom, marginX = view.width * 0.3, marginY = Math.min(view.height * 0.3, 160);
    cam.x = Math.max(marginX - size, Math.min(view.width - marginX, cam.x));
    cam.y = Math.max(150 - size, Math.min(view.height - marginY, cam.y));
  }
  function zoom(factor, x = view.width / 2, y = view.height / 2) {
    const old = cam.zoom;
    cam.zoom = Math.max(0.36, Math.min(1.8, old * factor));
    cam.x = x - (x - cam.x) * cam.zoom / old;
    cam.y = y - (y - cam.y) * cam.zoom / old;
    clampCamera();
  }
  function screenPoint(x, y) {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + cam.x + (x + 0.5) * GFArt.T * cam.zoom, y: r.top + cam.y + (y + 0.5) * GFArt.T * cam.zoom };
  }
  function localPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function toast(text, kind = "info") {
    clearTimeout(toastTimer);
    $("toast").textContent = text;
    $("toast").className = "show " + kind;
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3200);
  }
  function tone(kind = "build") {
    if (!sound) return;
    try {
      audioContext || (audioContext = new (window.AudioContext || window.webkitAudioContext)());
      audioContext.resume();
      const o = audioContext.createOscillator(), g = audioContext.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(kind === "build" ? 560 : kind === "skill" ? 260 : 740, audioContext.currentTime);
      o.frequency.exponentialRampToValueAtTime(kind === "skill" ? 80 : 880, audioContext.currentTime + 0.15);
      g.gain.setValueAtTime(0.055, audioContext.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-3, audioContext.currentTime + 0.22);
      o.connect(g);
      g.connect(audioContext.destination);
      o.start();
      o.stop(audioContext.currentTime + 0.24);
    } catch (e) {
    }
  }
  function save(notify = false) {
    if (!started) return false;
    try {
      localStorage.setItem(KEY, GF.serialize(state));
      saveStatus = "已存档 · 此设备";
      if ($("save-status")) $("save-status").textContent = saveStatus;
      if (notify) toast("已保存");
      return true;
    } catch (e) {
      saveStatus = "本地存档不可用";
      if ($("save-status")) $("save-status").textContent = saveStatus;
      if (notify || !storageWarning) toast("无法保存，可在菜单导出存档", "warning");
      storageWarning = true;
      return false;
    }
  }
  function select(x, y) {
    if (!started) return;
    if (x < 0 || y < 0 || x >= GF.worldSize(state) || y >= GF.worldSize(state) || state.over) return;
    if (GF.isWall(state, x, y)) {
      closePanel();
      toast("庄园城墙 · 不可建设、升级或拆除");
      return;
    }
    if (!GF.owns(state, x, y)) {
      closePanel();
      toast("庄园外区域 · 不可建设或操作", "warning");
      return;
    }
    selected = { x, y };
    panelKey = "";
    $("cards").scrollLeft = 0;
    $("panel").hidden = false;
    $("game").classList.add("has-panel");
    refresh();
  }
  function closePanel() {
    selected = null;
    panelKey = "";
    $("panel").hidden = true;
    $("game").classList.remove("has-panel");
  }
  const rateText = (value) => String(Math.round((value + Number.EPSILON) * 10) / 10);
  const costText = (cost) => [cost.coins ? cost.coins + " 铜钱" : "", cost.materials ? cost.materials + " 工材" : ""].filter(Boolean).join(" · ") || "免费";
  const costHTML = (cost, markMissing = false) => `<span class="cost-parts">${cost.coins ? `<span class="cost-part"><i class="coin-icon"></i><b class="cost-number${markMissing && state.coins < cost.coins ? " insufficient" : ""}">${cost.coins}</b></span>` : ""}${cost.materials ? `<span class="cost-part"><i class="material-icon"></i><b class="cost-number${markMissing && state.materials < cost.materials ? " insufficient" : ""}">${cost.materials}</b></span>` : ""}</span>`;
  function productionLine(resource, base, total) {
    const bonus = rateText(Math.max(0, total - base));
    return `${resource} +${rateText(base)}${bonus === "0" ? "" : `<span class="income-bonus">（+${bonus}）</span>`}/秒`;
  }
  function effect(d, b) {
    var _a, _b;
    if (!d.income) return d.desc || "";
    const building = b || { type: d.id, x: (_a = selected == null ? void 0 : selected.x) != null ? _a : GF.worldCenter(state), y: (_b = selected == null ? void 0 : selected.y) != null ? _b : GF.worldCenter(state), level: 1 };
    const preview = b ? state : __spreadProps(__spreadValues({}, state), { buildings: [...state.buildings, building] });
    const lines = [];
    if (d.income) lines.push(productionLine(d.resource === "materials" ? "工材" : "铜钱", d.income * GF.incomeFactor(building), GF.income(preview, building)));
    if (d.required) lines.push("全镇" + (d.auraResource === "materials" ? "工材" : "铜钱") + "收入 +" + rateText(d.aura * GF.auraFactor(building) * 100) + "%");
    return lines.join("<br>");
  }
  function cardHTML(d) {
    const description = d.id === "well" ? "井旁平地可建农田<br>相邻农田收入 +20%" : effect(d);
    const tag = d.chain || (d.required ? "终" : d.id === "fortune" ? "造" : { defense: "防", support: "民", temple: "神" }[d.cat] || "坊");
    const count = d.id === "fortune" ? `次数${state.fortuneBuilt}` : `${state.buildings.filter((b) => b.type === d.id).length}/${d.limit || "∞"}`;
    return `<button class="build-card" data-build="${d.id}" aria-label="建造${d.name}"><span class="chain-tag">${tag}</span><span class="card-count">${count}</span><img src="${GFArt.thumbnail(d.id)}" alt=""><span class="card-reason" hidden></span><strong>${d.name}</strong><span class="card-price">${costHTML(GF.buildCost(state, d.id))}</span><span class="card-effect">${description}</span></button>`;
  }
  function hideBuildCard(d, x, y) {
    const plot = GF.terrain(x, y, state), nearby = GF.adjacent(state, x, y);
    if (plot === "water") return true;
    if (d.cat === "economy" && plot === "forest" && d.id !== "mulberry") return true;
    if (d.cat === "economy" && plot === "mountain" && d.id !== "quarry") return true;
    if (d.id === "farm") {
      if (plot !== "shore" && !(plot === "plain" && nearby.some((b) => b.type === "well"))) return true;
    } else if (d.terrain && plot !== d.terrain) return true;
    if (d.prev && !nearby.some((b) => b.type === d.prev)) return true;
    if (d.required && d.required.some((type) => !nearby.some((b) => b.type === type))) return true;
    return false;
  }
  function buildListOrder(d) {
    if (d.required) return 0;
    if (d.cat === "economy") return 3 - (d.tier || 0);
    if (d.cat === "defense") return 4;
    if (d.id === "fortune") return 5;
    return 6;
  }
  function detailHTML(b) {
    const d = GF.DEFS[b.type], max = b.level >= GF.maxLevel(b), hp = GF.maxHP(b), f = GF.factor(b), next = __spreadProps(__spreadValues({}, b), { level: b.level + 1 }), nextF = GF.factor(next);
    const description = b.type === "gate" ? b.hp <= 0 ? "城门毁损 · 通道已敞开，升级不恢复耐久，修复后可继续守护庄园" : "四座城门共用等级 · 升级一次同步提升四门，费用仅扣一次" : GF.dryFarm(state, b) ? "缺水：耐久每秒 -5%" : "";
    const name = b.type === "gate" ? (["北", "东", "南", "西"][b.direction] || "") + "城门" : GF.name(b), demolishReason = GF.demolishReason(state, b);
    const base = d.income ? d.income * GF.incomeFactor(b) : 0;
    const bonus = d.income ? rateText(Math.max(0, GF.income(state, b) - base)) : "0";
    const revenue = d.income ? `<span class="detail-revenue"><i class="${d.resource === "materials" ? "material-icon" : "coin-icon"}" aria-hidden="true"></i><strong>+${rateText(base)}${bonus === "0" ? "" : `<span class="income-bonus">（+${bonus}）</span>`}</strong><small>/秒</small></span>` : "";
    let stats = `<div>耐久上限<strong>${hp}${max ? "" : " → " + GF.maxHP(next)}</strong></div>`;
    if (d.income) stats += `<div>${d.resource === "materials" ? "工材" : "铜钱"} / 秒<strong>${GF.income(state, b).toFixed(1)}${max ? "" : " → " + GF.income(state, next).toFixed(1)}</strong></div>`;
    else if (d.damage) stats += `<div>攻击伤害<strong>${Math.round(d.damage * f)}${max ? "" : " → " + Math.round(d.damage * nextF)}</strong></div>`;
    else if (["well", "stage"].includes(b.type)) {
      const v = { well: 20, stage: 3 }[b.type];
      stats += `<div>收入加成<strong>${rateText(v * GF.auraFactor(b))}%${max ? "" : " → " + rateText(v * GF.auraFactor(next)) + "%"}</strong></div>`;
    } else if (b.type === "earth") stats += `<div>范围减伤<strong>${Math.min(65, 20 * f)}%${max ? "" : " → " + Math.min(65, 20 * nextF) + "%"}</strong></div>`;
    else if (b.type === "tao") stats += `<div>防御攻击加成<strong>${Math.min(150, 15 * f)}%${max ? "" : " → " + Math.min(150, 15 * nextF) + "%"}</strong></div>`;
    else if (b.type === "zhong") stats += `<div>全体减速<strong>${Math.round(GF.zhongSlow(b) * 100)}%${max ? "" : " → " + Math.round(GF.zhongSlow(next) * 100) + "%"}</strong></div><div>镇煞周期<strong>每 ${d.pulseInterval} 秒 · 持续 ${d.slowDuration} 秒</strong></div>`;
    if (d.required) stats += `<div>全镇${d.auraResource === "materials" ? "工材" : "铜钱"}收入加成<strong>${rateText(d.aura * GF.auraFactor(b) * 100)}%${max ? "" : " → " + rateText(d.aura * GF.auraFactor(next) * 100) + "%"}</strong></div>`;
    return `<div class="detail"><div class="detail-title"><h3>${name}</h3><span class="level-badge">Lv.${b.level}</span>${revenue}<button class="demolish-button" id="demolish-building" ${demolishReason ? "disabled" : ""}>${demolishReason ? "不可拆除" : "拆除"}</button></div><div class="detail-art"><img src="${GFArt.thumbnail(b.type, b.level)}" alt="${name}"><span>${b.type === "gate" ? name + " · 守护庄园" : d.chain ? d.chain + "业兴旺" : d.required ? d.resource === "materials" ? "百工汇聚" : "财源广进" : d.cat === "defense" ? "守望古坊" : "人间烟火"}</span></div><div class="detail-info"><p class="detail-description" ${description ? "" : "hidden"}>${description}</p><div class="health-row"><span>耐久</span><div class="health-track"><i id="detail-hp-fill"></i></div><span id="detail-hp"></span></div><div class="upgrade-stats">${stats}</div></div><div class="detail-actions"><button class="upgrade-button" id="upgrade-building">${max ? "已臻化境" : "升级至 Lv." + (b.level + 1)}<small id="upgrade-label"></small></button></div></div>`;
  }
  function renderPanel() {
    if (!selected) return;
    const { x, y } = selected, b = GF.at(state, x, y);
    if (GF.isWall(state, x, y) || !GF.owns(state, x, y)) {
      closePanel();
      return;
    }
    const buildableDefs = Object.values(GF.DEFS).filter((d) => !d.unique && !d.fortuneOnly && !d.fixed);
    const key = `${x},${y},${(b == null ? void 0 : b.id) || ""}`;
    $("plot-label").textContent = b ? b.type === "gate" ? (["北", "东", "南", "西"][b.direction] || "") + "城门" : GF.DEFS[b.type].name : GF.TERRAIN[GF.terrain(x, y, state)] + " · 可兴建";
    $("build-view").hidden = !!b;
    $("detail-view").hidden = !b;
    if (key !== panelKey) {
      panelKey = key;
      if (b) $("detail-view").innerHTML = detailHTML(b);
      else {
        const defs = buildableDefs.map((d, index) => ({ d, index, reason: GF.buildReason(state, d.id, x, y) })).filter((item) => !hideBuildCard(item.d, x, y)).sort((a, b2) => Number(!!a.reason) - Number(!!b2.reason) || buildListOrder(a.d) - buildListOrder(b2.d) || a.index - b2.index).map((item) => item.d);
        const scroll = $("cards").scrollLeft;
        $("cards").innerHTML = defs.map(cardHTML).join("");
        $("cards").scrollLeft = scroll;
      }
    }
    if (b) {
      $("detail-hp").textContent = Math.ceil(Math.max(0, b.hp)) + " / " + GF.maxHP(b);
      $("detail-hp-fill").style.width = Math.max(0, b.hp / GF.maxHP(b) * 100) + "%";
      const reason = GF.upgradeReason(state, b), max = b.level >= GF.maxLevel(b);
      $("upgrade-building").classList.toggle("blocked", !!reason);
      $("upgrade-building").setAttribute("aria-disabled", String(!!reason));
      $("upgrade-building").title = reason || "";
      const demolishReason = GF.demolishReason(state, b);
      $("demolish-building").disabled = !!demolishReason;
      $("demolish-building").title = demolishReason || "";
      $("demolish-building").textContent = demolishReason ? "不可拆除" : "拆除";
      if (b.type === "gate") {
        $("detail-view").querySelector(".detail-description").textContent = b.hp <= 0 ? "城门毁损 · 通道已敞开，升级不恢复耐久，修复后可继续守护庄园" : "四座城门共用等级 · 升级一次同步提升四门，费用仅扣一次";
        $("upgrade-building").firstChild.textContent = max ? "已臻化境" : "统一升级四门至 Lv." + (b.level + 1);
      }
      $("upgrade-label").innerHTML = max ? "" : costHTML(GF.upgradeCost(b), true);
    } else for (const el of $("cards").children) {
      const reason = GF.buildReason(state, el.dataset.build, x, y);
      el.classList.toggle("locked", !!reason);
      el.classList.toggle("poor", reason.startsWith("差 "));
      el.setAttribute("aria-disabled", String(!!reason));
      const label = el.querySelector(".card-reason");
      label.hidden = !reason || reason.startsWith("差 ");
      label.textContent = label.hidden ? "" : reason;
      const cost = GF.buildCost(state, el.dataset.build);
      for (const part of el.querySelectorAll(".card-price .cost-part")) {
        const resource = part.querySelector(".coin-icon") ? "coins" : "materials";
        part.querySelector(".cost-number").classList.toggle("insufficient", state[resource] < cost[resource]);
      }
    }
  }
  const fmt = (n) => n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, "") + "万" : Math.floor(n).toLocaleString("en-US");
  function refresh() {
    var _a, _b, _c, _d, _e, _f;
    $("autoplay-status").hidden = !autoplay || !started;
    $("autoplay-status").querySelector("strong").textContent = paused ? "托管已暂停" : "托管中";
    $("autoplay-action").textContent = (pilot == null ? void 0 : pilot.lastAction) || "准备经营";
    $("coins").textContent = fmt(state.coins);
    $("materials").textContent = fmt(state.materials);
    $("day-label").textContent = "第 " + state.day + " 日 · " + { day: "白昼", dusk: "黄昏", night: "长夜" }[state.phase] + (state.day % 7 === 0 ? " · 灯会" : "");
    $("phase-icon").textContent = { day: "☀", dusk: "◒", night: "☾" }[state.phase];
    const remaining = state.phase === "day" ? GF.DAY - state.time : GF.DUSK - state.time;
    $("day-fill").style.width = state.phase === "night" ? Math.max(0, 100 * ((((_a = state.wave) == null ? void 0 : _a.total) || 1) - (((_b = state.wave) == null ? void 0 : _b.spawned) || 0) + state.enemies.length) / (((_c = state.wave) == null ? void 0 : _c.total) || 1)) + "%" : Math.max(0, remaining / (state.phase === "day" ? GF.DAY : GF.DUSK) * 100) + "%";
    $("countdown").textContent = state.phase === "night" ? state.enemies.length + " 敌" : Math.max(0, Math.ceil(remaining)) + "s";
    $("night-warning").hidden = state.phase === "day";
    $("night-warning").textContent = state.phase === "dusk" ? ["北", "东", "南", "西"][state.direction] + "方即将来袭" : (((_d = state.wave) == null ? void 0 : _d.boss) ? "四方来袭" : ["北", "东", "南", "西"][state.direction] + "方来袭") + " · " + (((_e = state.wave) == null ? void 0 : _e.spawned) || 0) + " / " + (((_f = state.wave) == null ? void 0 : _f.total) || 0);
    $("skills").hidden = state.phase !== "night" || state.over;
    for (const el of document.querySelectorAll("[data-skill]")) {
      const id = el.dataset.skill, reason = GF.skillReason(state, id);
      el.classList.toggle("unavailable", !!reason);
      el.setAttribute("aria-disabled", String(!!reason));
      el.querySelector("small").textContent = state.cooldowns[id] > 0 ? Math.ceil(state.cooldowns[id]) + " 秒" : "可施展";
    }
    if (lastPhase !== state.phase) {
      document.body.classList.toggle("night", state.phase === "night");
      lastPhase = state.phase;
    }
    renderPanel();
  }
  function handleEvents() {
    const events = state.events.splice(0);
    if (!events.length) return;
    const important = events.find((e) => ["victory", "defeat"].includes(e.kind));
    if ((important == null ? void 0 : important.kind) === "defeat") {
      save();
      showEnd();
    } else if ((important == null ? void 0 : important.kind) === "victory") {
      save();
      if (autoplay) toast("七夜长明 · 托管继续跑测", "reward");
      else showVictory();
    } else {
      const e = events[events.length - 1];
      if (!e.text.startsWith("坊志达成")) toast(e.text, e.kind);
      if (e.kind === "reward") tone("reward");
    }
  }
  function blocked(el, reason) {
    el == null ? void 0 : el.classList.remove("shake");
    if (el) {
      void el.offsetWidth;
      el.classList.add("shake");
    }
    toast(reason, "warning");
  }
  function performBuild(type, el) {
    var _a;
    if (!selected) return;
    if (!GF.owns(state, selected.x, selected.y) || GF.isWall(state, selected.x, selected.y)) {
      closePanel();
      toast("仅可在庄园内部建设", "warning");
      return;
    }
    if ((_a = GF.DEFS[type]) == null ? void 0 : _a.fixed) return blocked(el, "庄园固定建筑不可建造");
    const r = GF.build(state, type, selected.x, selected.y);
    if (!r.ok) return blocked(el, r.reason);
    tone();
    panelKey = "";
    toast(type === "fortune" ? "造化匣化为" + GF.name(r.building) : GF.DEFS[type].name + "已建成");
    handleEvents();
    save();
    refresh();
  }
  $("cards").addEventListener("click", (e) => {
    const el = e.target.closest("[data-build]");
    if (el && !cardDrag.suppress) performBuild(el.dataset.build, el);
  });
  $("detail-view").addEventListener("click", (e) => {
    if (!selected) return;
    const b = GF.at(state, selected.x, selected.y);
    if (!b) return;
    if (e.target.closest("#upgrade-building")) {
      const r = GF.upgrade(state, b);
      if (!r.ok) return blocked($("upgrade-building"), r.reason);
      tone();
      toast(GF.name(b) + " · 升至 Lv." + b.level);
      panelKey = "";
      handleEvents();
      save();
      refresh();
    } else if (e.target.closest("#demolish-building")) {
      const reason = GF.demolishReason(state, b);
      if (reason) return blocked($("demolish-building"), reason);
      demolishTarget = b;
      const cost = b.originCost || GF.DEFS[b.type].cost, refund = { coins: Math.floor(cost.coins * 0.4), materials: Math.floor(cost.materials * 0.4) };
      modal('<p class="modal-kicker">拆除建筑</p><h2>拆除' + GF.name(b) + "？</h2><p>拆除后返还 " + costText(refund) + "，且无法恢复。</p>" + (b.type === "well" ? "<p>失去水井的非水岸农田会持续掉耐久。</p>" : "") + '<button class="modal-primary" data-modal="confirm-demolish">确认拆除</button><button class="modal-secondary" data-modal="cancel-demolish">返回</button>');
    }
  });
  for (const el of document.querySelectorAll("[data-skill]")) el.addEventListener("click", () => {
    const r = GF.skill(state, el.dataset.skill);
    if (!r.ok) return blocked(el, r.reason);
    tone("skill");
    toast(GF.SKILLS[el.dataset.skill].name + " · 已施展");
    save();
    refresh();
  });
  $("close-panel").onclick = closePanel;
  $("menu-pause").onclick = showMenu;
  function updateSound() {
    $("start-sound").setAttribute("aria-checked", String(sound));
    $("start-sound-label").textContent = sound ? "已开启" : "已关闭";
  }
  function toggleSound() {
    sound = !sound;
    try {
      localStorage.setItem(SOUND_KEY, sound ? "on" : "off");
    } catch (e) {
    }
    updateSound();
    tone();
  }
  function readSave() {
    try {
      saved = localStorage.getItem(KEY);
      storageWarning = false;
    } catch (e) {
      saved = null;
      storageWarning = true;
    }
    return saved && GF.restore(saved);
  }
  function updateStartMenu() {
    const loaded = readSave();
    $("start-load").disabled = !loaded;
    $("start-save-detail").textContent = loaded ? "第 " + loaded.day + " 日 · " + { day: "白昼", dusk: "黄昏", night: "长夜" }[loaded.phase] + (loaded.over ? " · 已失守" : " · 继续故事") : storageWarning ? "本地存档不可用" : saved ? "存档损坏或版本不兼容" : "暂无本地存档";
    updateSound();
  }
  function showStartMenu() {
    if (started) save();
    autoplay = false;
    started = false;
    paused = true;
    closePanel();
    $("modal").hidden = true;
    $("start-menu").hidden = false;
    $("game").classList.add("at-title");
    $("menu-pause").setAttribute("aria-expanded", "false");
    updateStartMenu();
    $("start-single").focus();
  }
  function enterGame(next) {
    autoplay = false;
    pilot = null;
    state = next;
    started = true;
    saveClock = 0;
    $("start-menu").hidden = true;
    $("game").classList.remove("at-title");
    closePanel();
    center();
    closeModal();
  }
  $("start-single").onclick = () => {
    readSave();
    if (saved) modal('<p class="modal-kicker">另起新篇</p><h2>开启新的古坊？</h2><p>单人模式将新建古坊，并替换本地存档。想继续原来的故事，请返回并选择“读档”。</p><button class="modal-primary" data-modal="new">新建古坊</button><button class="modal-secondary" data-modal="close">返回开始菜单</button>');
    else newGame();
  };
  $("start-load").onclick = () => {
    const loaded = readSave();
    if (!loaded) {
      updateStartMenu();
      toast("无法读取本地存档", "warning");
      return;
    }
    enterGame(loaded);
    toast("故人归坊 · 已续接第 " + state.day + " 日的灯火");
    if (state.over) showEnd();
  };
  $("start-sound").onclick = toggleSound;
  function modal(html) {
    paused = true;
    $("modal-content").innerHTML = html;
    $("modal").hidden = false;
    $("menu-pause").setAttribute("aria-expanded", "true");
    $("close-modal").focus();
    refresh();
  }
  function closeModal() {
    $("modal").hidden = true;
    paused = !started;
    $("menu-pause").setAttribute("aria-expanded", "false");
    (started ? $("menu-pause") : $("start-single")).focus();
    lastFrame = performance.now();
    refresh();
  }
  $("close-modal").onclick = closeModal;
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });
  function showMenu() {
    if (!started) return;
    modal('<p class="modal-kicker">古坊奇谭</p><h2>已暂停</h2><p>第 ' + state.day + " 日</p>" + (GF.estate(state) ? "<p>在庄园内建设经营，升级四方城门抵御来敌。城墙与庄园外不可操作；水上道路为桥栈道。拖拽巡视，双指或滚轮缩放。</p>" : "") + '<button class="modal-primary" data-modal="close">继续游戏</button>' + autoplaySettings() + '<button class="modal-secondary" data-modal="save">保存进度</button><button class="modal-secondary" data-modal="sound">音效：' + (sound ? "开" : "关") + '</button><div class="modal-row"><button class="modal-secondary" data-modal="export">导出存档</button><button class="modal-secondary" data-modal="import">导入存档</button></div><input id="save-file" type="file" accept=".json,application/json" hidden><button class="modal-secondary danger" data-modal="reset">重新开始</button><button class="modal-secondary" data-modal="title">返回开始菜单</button><p id="save-status">' + saveStatus + "</p>");
  }
  function autoplaySettings() {
    const r = pilot == null ? void 0 : pilot.report(), seconds = Math.floor((r == null ? void 0 : r.activeSeconds) || 0);
    return '<section class="autoplay-settings" aria-label="托管跑测"><button class="modal-secondary" data-modal="autoplay" aria-pressed="' + autoplay + '" ' + (state.over ? "disabled" : "") + ">" + (autoplay ? "关闭托管 · 手动接管" : "启用托管 · 电脑游玩") + "</button><p>自动经营、升级、防守与施法。启用即继续游戏；打开菜单或切到后台会暂停，失守后停止。</p>" + (r ? "<p>累计托管 " + Math.floor(seconds / 60) + " 分 " + seconds % 60 + " 秒 · 建造 " + r.builds + " · 升级 " + r.upgrades + " · 施法 " + Object.values(r.skills).reduce((a, b) => a + b, 0) + " 次<br>最近操作：" + r.lastAction + '</p><button class="modal-secondary autoplay-report" data-modal="autoplay-report">导出托管报告</button>' : "") + "</section>";
  }
  function toggleAutoplay() {
    if (state.over) return;
    if (autoplay) {
      autoplay = false;
      showMenu();
      toast("托管已关闭，可手动接管");
      return;
    }
    if (!pilot) pilot = GFAutoplay.create(state);
    autoplay = true;
    closePanel();
    closeModal();
    toast("托管已启用 · 电脑开始经营");
  }
  function showEnd() {
    autoplay = false;
    modal('<p class="modal-kicker">第 ' + state.day + ' 夜</p><h2>古坊失守</h2><div class="modal-stats"><div><strong>' + (state.day - 1) + "</strong><span>守过长夜</span></div><div><strong>" + state.kills + "</strong><span>击退来敌</span></div></div>" + (pilot ? autoplaySettings() : "") + '<button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="close">返回古坊</button>');
  }
  function showVictory() {
    modal('<p class="modal-kicker">七夜长明</p><h2>古坊初兴</h2><div class="modal-stats"><div><strong>' + state.buildings.length + "</strong><span>现存建筑</span></div><div><strong>" + state.kills + '</strong><span>击退来敌</span></div></div><button class="modal-primary" data-modal="close">继续游戏</button>');
  }
  function newGame() {
    enterGame(GF.createState());
    save();
    toast("青溪新雨 · 古坊的故事重新开始");
  }
  $("modal-content").addEventListener("click", (e) => {
    var _a;
    const action = (_a = e.target.closest("[data-modal]")) == null ? void 0 : _a.dataset.modal;
    if (!action) return;
    if (action === "close") closeModal();
    if (action === "save") save(true);
    if (action === "sound") {
      toggleSound();
      e.target.closest("[data-modal]").textContent = "音效：" + (sound ? "开" : "关");
    }
    if (action === "title") showStartMenu();
    if (action === "autoplay") toggleAutoplay();
    if (action === "autoplay-report" && pilot) {
      const report = __spreadProps(__spreadValues({}, pilot.report()), { enabled: autoplay, finalSave: JSON.parse(GF.serialize(state)) }), blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url;
      a.download = "古坊奇谭-托管报告-第" + state.day + "日.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
      toast("托管报告已导出");
    }
    if (action === "confirm-demolish") {
      const b = demolishTarget;
      demolishTarget = null;
      const r = b ? GF.demolish(state, b) : { ok: false };
      closeModal();
      if (r.ok) {
        toast(r.dryFarms ? "已拆除，" + r.dryFarms + " 块农田缺水，耐久持续下降" : "已拆除，返还 " + costText(r.refund), r.dryFarms ? "warning" : "info");
        panelKey = "";
        handleEvents();
        save();
      }
      refresh();
    }
    if (action === "cancel-demolish") {
      demolishTarget = null;
      closeModal();
    }
    if (action === "reset") modal(`<p class="modal-kicker">另起新篇</p><h2>重建古坊</h2><p>重新开始会替换此浏览器中的现有进度。可先返回菜单导出存档。</p><button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="menu">返回，保留当前古坊</button>`);
    if (action === "new") newGame();
    if (action === "menu") showMenu();
    if (action === "export") {
      const blob = new Blob([GF.serialize(state)], { type: "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url;
      a.download = "古坊奇谭-第" + state.day + "日.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
      toast("存档已导出");
    }
    if (action === "import") {
      const input = $("save-file");
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 2e6) {
          toast("存档文件过大", "warning");
          return;
        }
        const loaded = GF.restore(await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsText(file);
        }));
        if (!loaded) {
          toast("存档无效或版本不兼容，现有进度已保留", "warning");
          return;
        }
        const backup = GF.serialize(state);
        try {
          localStorage.setItem(KEY + "-backup", backup);
        } catch (e2) {
        }
        enterGame(loaded);
        save();
        refresh();
        toast("已载入第 " + state.day + " 日的古坊");
        if (state.over) showEnd();
      };
      input.click();
    }
  });
  let gesture = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    canvas.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) gesture = { x: p.x, y: p.y, lastX: p.x, lastY: p.y, dragged: false, multi: false };
    else {
      gesture.multi = true;
      gesture.dragged = true;
      const a = [...pointers.values()];
      gesture.pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      gesture.mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const p = localPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2) {
      const a = [...pointers.values()], mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }, dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      if (gesture.pinchDist > 0) zoom(dist / gesture.pinchDist, gesture.mid.x, gesture.mid.y);
      cam.x += mid.x - gesture.mid.x;
      cam.y += mid.y - gesture.mid.y;
      gesture.pinchDist = dist;
      gesture.mid = mid;
      clampCamera();
    } else {
      if (Math.hypot(p.x - gesture.x, p.y - gesture.y) > 5) gesture.dragged = true;
      if (gesture.dragged) {
        cam.x += p.x - gesture.lastX;
        cam.y += p.y - gesture.lastY;
        clampCamera();
      }
      gesture.lastX = p.x;
      gesture.lastY = p.y;
    }
  });
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    const click = gesture && !gesture.dragged && !gesture.multi && e.type !== "pointercancel";
    pointers.delete(e.pointerId);
    if (click) {
      const p = localPoint(e), x = Math.floor((p.x - cam.x) / cam.zoom / GFArt.T), y = Math.floor((p.y - cam.y) / cam.zoom / GFArt.T);
      select(x, y);
    }
    if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      gesture.lastX = p.x;
      gesture.lastY = p.y;
    }
    if (!pointers.size) gesture = null;
  }
  canvas.addEventListener("pointerup", pointerEnd);
  canvas.addEventListener("pointercancel", pointerEnd);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = localPoint(e);
    zoom(Math.exp(-e.deltaY * 1e-3), p.x, p.y);
  }, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  const cardDrag = { active: false, moved: false, suppress: false, x: 0, scroll: 0 };
  $("cards").addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    cardDrag.active = true;
    cardDrag.moved = false;
    cardDrag.suppress = false;
    cardDrag.x = e.clientX;
    cardDrag.scroll = $("cards").scrollLeft;
  });
  window.addEventListener("pointermove", (e) => {
    if (!cardDrag.active) return;
    if (Math.abs(e.clientX - cardDrag.x) > 5) cardDrag.moved = true;
    if (cardDrag.moved) {
      $("cards").scrollLeft = cardDrag.scroll - (e.clientX - cardDrag.x);
      cardDrag.suppress = true;
    }
  });
  window.addEventListener("pointerup", () => {
    if (!cardDrag.active) return;
    cardDrag.active = false;
    setTimeout(() => cardDrag.suppress = false, 0);
  });
  window.addEventListener("pointercancel", () => {
    cardDrag.active = false;
    cardDrag.suppress = false;
  });
  window.addEventListener("keydown", (e) => {
    const overlay = !$("modal").hidden ? $("modal") : !started ? $("start-menu") : null;
    if (e.key === "Tab" && overlay) {
      const buttons = [...overlay.querySelectorAll("button:not(:disabled)")].filter((el) => !el.hidden), first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
        e.preventDefault();
        last == null ? void 0 : last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
        e.preventDefault();
        first == null ? void 0 : first.focus();
      }
    }
    if (e.code === "Space" && started && !e.target.closest("button,input")) {
      e.preventDefault();
      if (paused) closeModal();
      else showMenu();
    }
    if (e.key === "Escape") {
      if (!$("modal").hidden) closeModal();
      else if (started) closePanel();
    }
  });
  document.addEventListener("visibilitychange", () => {
    hiddenPause = document.hidden;
    if (hiddenPause) save();
    lastFrame = performance.now();
  });
  window.addEventListener("pagehide", () => save());
  window.addEventListener("resize", resize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
  function frame(now) {
    const dt = lastFrame ? Math.max(0, Math.min(1, (now - lastFrame) / 1e3)) : 0;
    lastFrame = now;
    if (started && !paused && !hiddenPause && !state.over) {
      let remaining = dt;
      while (remaining > 0 && !paused && !state.over) {
        const tick = Math.min(0.1, remaining);
        if (autoplay) {
          try {
            if (pilot.tick(tick)) panelKey = "";
          } catch (error) {
            autoplay = false;
            showMenu();
            toast("托管已停止：" + error.message, "warning");
            break;
          }
        }
        GF.step(state, tick);
        remaining -= tick;
      }
      handleEvents();
    }
    uiClock += dt;
    saveClock += dt;
    if (uiClock > 0.2) {
      refresh();
      uiClock = 0;
    }
    if (saveClock > 8) {
      if (!state.over) save();
      saveClock = 0;
    }
    if (started) GFArt.render(canvas, state, cam, selected, { grid: false });
    requestAnimationFrame(frame);
  }
  resize();
  refresh();
  requestAnimationFrame(frame);
  showStartMenu();
  window.Gufang = { get state() {
    return state;
  }, get camera() {
    return __spreadValues({}, cam);
  }, get paused() {
    return paused;
  }, get autoplay() {
    return autoplay;
  }, get autoplayReport() {
    return (pilot == null ? void 0 : pilot.report()) || null;
  }, select, refresh, screenPoint, save, setPaused(value) {
    if (value) showMenu();
    else closeModal();
  } };
})();
