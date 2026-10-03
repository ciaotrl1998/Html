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
  const SIZE = 17, CENTER = 8, DAY = 85, DUSK = 12;
  const TERRAIN = { plain: "平地", water: "水域", forest: "林地", mountain: "山地" };
  const DEFS = {};
  function def(id, name2, cat, cost, hp, extra) {
    DEFS[id] = __spreadValues({ id, name: name2, cat, cost, hp }, extra);
  }
  const chains = [
    ["tea", "inn", "bank", "茶肆", "客栈", "钱庄", "plain", "商", "#d6a450"],
    ["farm", "mill", "wine", "农田", "磨坊", "酒坊", "plain", "农", "#89a663"],
    ["mulberry", "weaver", "tailor", "桑园", "织坊", "成衣铺", "forest", "丝", "#b38ba7"],
    ["quarry", "kiln", "trade", "石场", "瓷窑", "商号", "mountain", "工", "#7b9fa2"]
  ];
  for (const a of chains) for (let i = 0; i < 3; i++) def(a[i], a[i + 3], "economy", [65, 115, 195][i], [180, 250, 340][i], {
    income: [3, 7, 13][i],
    terrain: i === 0 ? a[6] : null,
    prev: i ? a[i - 1] : null,
    chain: a[7],
    color: a[8],
    end: i === 2,
    prosperity: [8, 15, 24][i],
    names: [a[i + 3], i === 0 ? ["清茗茶肆", "临水良田", "葱郁桑园", "青石矿场"][chains.indexOf(a)] : "兴旺" + a[i + 3], "鼎盛" + a[i + 3]]
  });
  def("guild", "会馆", "economy", 400, 600, { income: 26, aura: 0.05, neighbors: 2, max: 1, prosperity: 50 });
  def("port", "市舶司", "economy", 800, 900, { income: 39, aura: 0.1, neighbors: 3, max: 1, prosperity: 90 });
  def("fence", "木栅", "defense", 35, 650, { desc: "挡住来敌，守住街巷", prosperity: 2 });
  def("tower", "箭塔", "defense", 95, 300, { damage: 22, range: 4, interval: 0.85, desc: "单体远射 · 射程 4 格", prosperity: 6 });
  def("rock", "擂石台", "defense", 155, 380, { damage: 46, range: 3.8, interval: 2.5, splash: 1.35, unlock: 45, desc: "范围轰击 · 克制妖狐", prosperity: 9 });
  def("barracks", "兵营", "defense", 165, 420, { damage: 18, range: 4.5, interval: 0.8, unlock: 65, desc: "自动派出民兵近战", prosperity: 9 });
  def("home", "民居", "support", 70, 220, { desc: "相邻产业收入 +10%", prosperity: 12 });
  def("well", "水井", "support", 55, 250, { desc: "相邻农田收入 +20%", prosperity: 5 });
  def("stage", "戏台", "support", 160, 280, { aura: 0.03, desc: "全镇收入 +3%", prosperity: 18 });
  def("market", "集市", "support", 110, 250, { desc: "周围 2 格收入 +5%", prosperity: 12 });
  def("shrine", "祠堂", "temple", 0, 1800, { incense: 0.4, income: 1, desc: "古坊之根 · 失守则游戏结束", prosperity: 10, unique: true, names: ["古坊祠堂", "百福祠堂", "万安宗祠"] });
  def("earth", "土地庙", "temple", 85, 260, { incense: 1.5, desc: "香火 +1.5 / 秒", prosperity: 8 });
  def("zhong", "钟馗像", "temple", 125, 430, { range: 3, desc: "周围妖鬼减速 40%", prosperity: 10 });
  def("tao", "道观", "temple", 180, 380, { incense: 3, unlock: 80, desc: "香火 +3 / 秒 · 解锁天雷", prosperity: 16 });
  const ENEMIES = {
    bandit: { name: "山匪", hp: 100, speed: 0.65, damage: 14, reward: 12 },
    ghost: { name: "阴兵", hp: 220, speed: 0.42, damage: 23, reward: 20 },
    fox: { name: "妖狐", hp: 75, speed: 1.1, damage: 12, reward: 16 }
  };
  const SKILLS = { repel: { name: "驱鬼符", cost: 30, cooldown: 18 }, repair: { name: "回春诀", cost: 45, cooldown: 24 }, thunder: { name: "九霄天雷", cost: 65, cooldown: 22 } };
  const MISSIONS = [
    { title: "一盏茶，起一座坊", desc: "在平地建造一间茶肆", reward: 60, test: (s) => s.buildings.some((b) => b.type === "tea") },
    { title: "客来茶香，产业相连", desc: "紧挨茶肆建造客栈", reward: 90, test: (s) => s.buildings.some((b) => b.type === "inn") },
    { title: "立箭塔，护一方安宁", desc: "建造两座箭塔，准备入夜", reward: 100, test: (s) => s.buildings.filter((b) => b.type === "tower").length >= 2 },
    { title: "香火不绝", desc: "建造土地庙，积攒神技香火", reward: 75, test: (s) => s.buildings.some((b) => b.type === "earth") },
    { title: "长夜过，古坊安", desc: "守住第一夜", reward: 120, test: (s) => s.day >= 2 },
    { title: "百业初兴", desc: "建成任意两种经济链终点建筑", reward: 200, test: (s) => new Set(s.buildings.filter((b) => DEFS[b.type].end).map((b) => b.type)).size >= 2 },
    { title: "四方会聚", desc: "建成一座会馆", reward: 300, test: (s) => s.buildings.some((b) => b.type === "guild") },
    { title: "万家灯火", desc: "守过第七夜，迎来太平晨光", reward: 500, test: (s) => s.day >= 8 }
  ];
  function terrain(x, y) {
    if (x >= 1 && x <= 4 && y >= 5 && y <= 12 || x >= 3 && x <= 6 && y >= 11 && y <= 14) return "water";
    if (x >= 10 && x <= 14 && y >= 2 && y <= 6 || x >= 2 && x <= 5 && y >= 1 && y <= 3) return "forest";
    if (x >= 11 && x <= 15 && y >= 11 && y <= 15) return "mountain";
    return "plain";
  }
  const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const bordersWater = (x, y) => [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]].some(([nx, ny]) => inside(nx, ny) && terrain(nx, ny) === "water");
  const at = (s, x, y) => s.buildings.find((b) => b.x === x && b.y === y);
  const adjacent = (s, x, y) => s.buildings.filter((b) => Math.abs(b.x - x) + Math.abs(b.y - y) === 1);
  const factor = (b) => Math.pow(1.65, b.level - 1);
  const maxHP = (b) => Math.round(DEFS[b.type].hp * factor(b));
  const name = (b) => {
    var _a;
    return ((_a = DEFS[b.type].names) == null ? void 0 : _a[b.level - 1]) || (b.level === 1 ? DEFS[b.type].name : ["", "", "兴盛", "鼎盛"][b.level] + DEFS[b.type].name);
  };
  function addBuilding(s, type, x, y) {
    const b = { id: s.nextId++, type, x, y, level: 1, hp: DEFS[type].hp, cooldown: 0, incomeTime: 0, coinPending: 0, incensePending: 0 };
    s.buildings.push(b);
    s.revision++;
    return b;
  }
  function createState() {
    const s = {
      version: 1,
      seed: 73193,
      nextId: 1,
      coins: 420,
      incense: 40,
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
    addBuilding(s, "shrine", CENTER, CENTER);
    return s;
  }
  function random(s) {
    s.seed = Math.imul(s.seed, 1664525) + 1013904223 >>> 0;
    return s.seed / 4294967296;
  }
  const prosperity = (s) => s.buildings.reduce((n, b) => n + (DEFS[b.type].prosperity || 0) * b.level, 0);
  const townName = (s) => {
    const p = prosperity(s);
    return p >= 450 ? "锦绣名镇" : p >= 230 ? "百业兴坊" : p >= 100 ? "烟火小镇" : "山野初坊";
  };
  const terminalCount = (s, x, y) => new Set(adjacent(s, x, y).filter((b) => DEFS[b.type].end).map((b) => b.type)).size;
  function buildReason(s, type, x, y) {
    const d = DEFS[type];
    if (!d) return "未知建筑";
    if (s.over) return "古坊已失守";
    if (s.phase === "night") return "夜晚不可建造";
    if (!inside(x, y)) return "请选择坊内地块";
    if (at(s, x, y)) return "此地已有建筑";
    if (s.enemies.some((e) => Math.hypot(e.x - x, e.y - y) < 0.65)) return "敌人正在此地";
    if (d.unique) return "祠堂仅此一座";
    if (type === "farm" && (terrain(x, y) !== "plain" || !bordersWater(x, y))) return "需临水平地";
    if (d.terrain && terrain(x, y) !== d.terrain) return "需" + TERRAIN[d.terrain];
    if (d.prev && !adjacent(s, x, y).some((b) => b.type === d.prev)) return "需紧挨" + DEFS[d.prev].name;
    if (d.neighbors && terminalCount(s, x, y) < d.neighbors) return "邻终点 " + terminalCount(s, x, y) + "/" + d.neighbors + " 种";
    if (d.unlock && prosperity(s) < d.unlock) return "需繁荣 " + d.unlock;
    if (s.coins < d.cost) return "差 " + Math.ceil(d.cost - s.coins) + " 钱";
    return "";
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
    s.coins -= DEFS[type].cost;
    const b = addBuilding(s, type, x, y);
    missions(s);
    return { ok: true, building: b };
  }
  const upgradeCost = (b) => Math.ceil((DEFS[b.type].cost || 180) * (b.level === 1 ? 1.35 : 2.2));
  function upgradeReason(s, b) {
    if (!b || !s.buildings.includes(b)) return "建筑已不存在";
    if (s.over) return "古坊已失守";
    if (s.phase === "night") return "夜晚不可升级";
    const d = DEFS[b.type];
    if (b.level >= (d.max || 3)) return "已达最高等级";
    if (d.prev && !adjacent(s, b.x, b.y).some((n) => n.type === d.prev && n.level >= b.level + 1)) return "需邻" + DEFS[d.prev].name + " Lv" + (b.level + 1);
    if (s.coins < upgradeCost(b)) return "差 " + Math.ceil(upgradeCost(b) - s.coins) + " 钱";
    return "";
  }
  function upgrade(s, b) {
    const reason = upgradeReason(s, b);
    if (reason) return { ok: false, reason };
    const ratio = b.hp / maxHP(b);
    s.coins -= upgradeCost(b);
    b.level++;
    b.hp = maxHP(b) * ratio;
    s.revision++;
    missions(s);
    return { ok: true };
  }
  function demolish(s, b) {
    if (!b || !s.buildings.includes(b) || b.type === "shrine" || s.over) return { ok: false, reason: "祠堂不可拆除" };
    if (s.phase === "night") return { ok: false, reason: "夜晚不可拆除" };
    const refund = Math.floor(DEFS[b.type].cost * 0.4);
    s.coins += refund;
    s.buildings = s.buildings.filter((n) => n !== b);
    s.revision++;
    return { ok: true, refund };
  }
  function income(s, b) {
    const d = DEFS[b.type];
    if (!d.income) return 0;
    let bonus = 0;
    for (const n of s.buildings) {
      const nd = DEFS[n.type], dist = Math.abs(n.x - b.x) + Math.abs(n.y - b.y);
      if (nd.aura) bonus += nd.aura * n.level;
      if (n.type === "home" && dist === 1 && d.cat === "economy") bonus += 0.1 * n.level;
      if (n.type === "well" && dist === 1 && b.type === "farm") bonus += 0.2 * n.level;
      if (n.type === "market" && dist <= 2) bonus += 0.05 * n.level;
    }
    return d.income * factor(b) * (1 + bonus) * (s.day % 7 === 0 ? 1.25 : 1);
  }
  const rates = (s) => s.buildings.reduce((r, b) => ({ coins: r.coins + income(s, b), incense: r.incense + (DEFS[b.type].incense || 0) * factor(b) }), { coins: 0, incense: 0 });
  function settleIncome(s, dt) {
    for (const b of s.buildings) {
      const d = DEFS[b.type];
      if (!d.income && !d.incense) continue;
      b.incomeTime += dt;
      b.coinPending += income(s, b) * dt;
      b.incensePending += (d.incense || 0) * factor(b) * dt;
      if (b.incomeTime < 1 - 1e-8) continue;
      b.incomeTime = Math.max(0, b.incomeTime - 1);
      const paid = Math.floor(b.coinPending + 1e-8);
      b.coinPending = Math.max(0, b.coinPending - paid);
      s.coins += paid;
      s.incense += b.incensePending;
      b.incensePending = 0;
      if (paid > 0) s.effects.push({ type: "income", buildingId: b.id, amount: paid, x: b.x, y: b.y, life: 0.95, total: 0.95 });
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
    s.wave = { total: Math.min(75, 5 + s.day * 2 + (boss ? 9 : 0)), spawned: 0, timer: 0.5, boss };
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
    const reward = 65 + s.day * 15;
    s.coins += reward;
    event(s, "平安入晓 · 守夜赏钱 +" + reward, "reward");
    if (s.day % 7 === 0) {
      s.coins += 250;
      s.incense += 70;
      event(s, "上元灯会 · 收入 +25%，获赠 250 钱与 70 香火", "reward");
    }
    if (s.day === 8 && !s.celebrated) {
      s.celebrated = true;
      event(s, "七夜长明！古坊立稳根基，可继续经营抵御更强来敌", "victory");
    }
    missions(s);
  }
  function spawnEnemy(s) {
    const w = s.wave, i = w.spawned++, dir = w.boss ? i % 4 : s.direction;
    const pos = 3 + Math.floor(random(s) * 11), p = [[pos, 0], [SIZE - 1, pos], [pos, SIZE - 1], [0, pos]][dir];
    const type = s.day >= 3 && i % 4 === 2 ? "fox" : s.day >= 2 && i % 3 === 1 ? "ghost" : "bandit";
    const d = ENEMIES[type], boss = w.boss && i === w.total - 1, scale = 1 + (s.day - 1) * 0.16;
    s.enemies.push({
      id: s.nextId++,
      type,
      x: p[0],
      y: p[1],
      hp: d.hp * scale * (boss ? 5 : 1),
      maxHp: d.hp * scale * (boss ? 5 : 1),
      damage: d.damage * (1 + (s.day - 1) * 0.1) * (boss ? 2 : 1),
      speed: d.speed,
      attack: 0,
      repelled: 0,
      boss,
      path: [],
      pathRevision: -1
    });
  }
  function findPath(s, e) {
    const base = s.buildings.find((b) => b.type === "shrine");
    if (!base) return [];
    const startX = Math.max(0, Math.min(SIZE - 1, Math.round(e.x))), startY = Math.max(0, Math.min(SIZE - 1, Math.round(e.y)));
    const start = startY * SIZE + startX, goal = base.y * SIZE + base.x, costs = Array(SIZE * SIZE).fill(Infinity), prev = Array(SIZE * SIZE).fill(-1), open = /* @__PURE__ */ new Set([start]);
    costs[start] = 0;
    const occupied = new Map(s.buildings.map((b) => [b.y * SIZE + b.x, b]));
    while (open.size) {
      let current = -1, best = Infinity;
      for (const n2 of open) if (costs[n2] < best) {
        current = n2;
        best = costs[n2];
      }
      open.delete(current);
      if (current === goal) break;
      const x = current % SIZE, y = Math.floor(current / SIZE);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!inside(nx, ny)) continue;
        const next = ny * SIZE + nx, b = occupied.get(next);
        const obstacle = b && next !== goal ? 1.8 + b.hp / (e.damage * (e.type === "fox" ? 1 : 2.5)) : 0;
        const cost = best + 1 + obstacle;
        if (cost < costs[next]) {
          costs[next] = cost;
          prev[next] = current;
          open.add(next);
        }
      }
    }
    const path = [];
    let n = goal;
    while (n !== start && n !== -1) {
      path.unshift({ x: n % SIZE, y: Math.floor(n / SIZE) });
      n = prev[n];
    }
    if (Math.hypot(e.x - startX, e.y - startY) > 0.03) path.unshift({ x: startX, y: startY });
    return path;
  }
  function hurtBuilding(s, b, damage) {
    b.hp -= damage;
    if (b.hp > 0) return;
    s.buildings = s.buildings.filter((n) => n !== b);
    s.revision++;
    event(s, DEFS[b.type].name + "被摧毁", "warning");
    if (b.type === "shrine") {
      s.over = true;
      event(s, "祠堂失守，古坊灯火暂熄", "defeat");
    }
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
      w.timer += Math.max(0.55, 2.2 - s.day * 0.07);
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
        const damage = d.damage * factor(b);
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
      if (b && dist <= 1.05) {
        if (e.attack === 0) {
          hurtBuilding(s, b, e.damage);
          e.attack = 1;
          s.effects.push({ type: "hit", x: b.x, y: b.y, life: 0.2, total: 0.2 });
        }
        continue;
      }
      let slow = 1;
      for (const n of s.buildings) if (n.type === "zhong" && Math.hypot(n.x - e.x, n.y - e.y) <= 3 + 0.3 * (n.level - 1)) slow = Math.min(slow, e.type === "ghost" ? 0.78 : Math.max(0.35, 0.6 - 0.08 * (n.level - 1)));
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
    if (id === "thunder" && !s.buildings.some((b) => b.type === "tao")) return "建造道观以解锁天雷";
    if (s.cooldowns[id] > 0) return "还需 " + Math.ceil(s.cooldowns[id]) + " 秒";
    if (s.incense < d.cost) return "香火不足";
    return "";
  }
  function skill(s, id) {
    const reason = skillReason(s, id);
    if (reason) return { ok: false, reason };
    s.incense -= SKILLS[id].cost;
    s.cooldowns[id] = SKILLS[id].cooldown;
    if (id === "repair") for (const b of s.buildings) b.hp = Math.min(maxHP(b), b.hp + maxHP(b) * 0.35);
    if (id === "repel") for (const e of s.enemies) {
      e.repelled = 4;
      e.hp -= 20;
    }
    if (id === "thunder") for (const e of s.enemies) {
      e.hp -= e.type === "ghost" ? 350 : 240;
      s.effects.push({ type: "thunder", x: e.x, y: e.y, life: 0.7, total: 0.7 });
    }
    s.effects.push({ type: id, x: CENTER, y: CENTER, life: 1, total: 1 });
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
    settleIncome(s, dt);
    if (s.phase === "day") {
      s.repairTime += dt;
      if (s.repairTime >= 2) {
        s.repairTime -= 2;
        for (const b of s.buildings) b.hp = Math.min(maxHP(b), b.hp + maxHP(b) * 0.05);
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
    try {
      const s = JSON.parse(raw), finite = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
      if (s.version !== 1 || !finite(s.coins) || !finite(s.incense) || !Number.isInteger(s.day) || s.day < 1 || !["day", "dusk", "night"].includes(s.phase) || !finite(s.time) || !finite(s.elapsed) || !finite(s.repairTime) || !Number.isInteger(s.mission) || s.mission < 0 || s.mission > MISSIONS.length || !Number.isInteger(s.seed) || !Number.isInteger(s.direction) || s.direction < 0 || s.direction > 3 || !finite(s.kills) || typeof s.over !== "boolean") return null;
      if (!Array.isArray(s.buildings) || s.buildings.length > SIZE * SIZE || !Array.isArray(s.enemies) || s.enemies.length > 100 || !s.cooldowns || !Object.keys(SKILLS).every((k) => finite(s.cooldowns[k]))) return null;
      const cells = /* @__PURE__ */ new Set();
      for (const b of s.buildings) {
        if (!Object.prototype.hasOwnProperty.call(DEFS, b.type) || !inside(b.x, b.y) || !Number.isInteger(b.level) || b.level < 1 || b.level > (DEFS[b.type].max || 3) || !finite(b.hp) || b.hp <= 0 || b.hp > maxHP(b) + 1 || !Number.isInteger(b.id) || b.id < 1) return null;
        for (const field of ["incomeTime", "coinPending", "incensePending"]) {
          if (b[field] === void 0) b[field] = 0;
          if (!finite(b[field])) return null;
        }
        if (b.incomeTime >= 1) return null;
        const key = b.x + "," + b.y;
        if (cells.has(key)) return null;
        cells.add(key);
        b.cooldown = 0;
        delete b.soldier;
      }
      if (!s.over && s.buildings.filter((b) => b.type === "shrine").length !== 1 || s.buildings.filter((b) => b.type === "shrine").length > 1) return null;
      if (s.phase === "night" && (!s.wave || !Number.isInteger(s.wave.total) || s.wave.total < 1 || s.wave.total > 75 || !Number.isInteger(s.wave.spawned) || s.wave.spawned < 0 || s.wave.spawned > s.wave.total || !Number.isFinite(s.wave.timer))) return null;
      for (const e of s.enemies) {
        if (!Object.prototype.hasOwnProperty.call(ENEMIES, e.type) || !Number.isInteger(e.id) || e.id < 1 || !finite(e.x) || e.x >= SIZE || !finite(e.y) || e.y >= SIZE || !finite(e.hp) || e.hp <= 0 || !finite(e.maxHp) || e.hp > e.maxHp || !finite(e.speed) || e.speed <= 0 || !finite(e.damage) || e.damage <= 0 || !finite(e.attack) || !Number.isFinite(e.repelled)) return null;
        e.path = [];
        e.pathRevision = -1;
      }
      s.events = [];
      s.effects = [];
      s.projectiles = [];
      s.revision = 1;
      s.nextId = Math.max(0, ...s.buildings.map((b) => b.id), ...s.enemies.map((e) => e.id || 0)) + 1;
      return s;
    } catch (e) {
      return null;
    }
  }
  return { SIZE, CENTER, DAY, DUSK, TERRAIN, DEFS, ENEMIES, SKILLS, MISSIONS, chains, terrain, at, adjacent, factor, maxHP, name, createState, prosperity, townName, terminalCount, buildReason, build, upgradeCost, upgradeReason, upgrade, demolish, income, rates, dusk, startNight, findPath, skillReason, skill, step, serialize, restore };
});

(function() {
  "use strict";
  const T = 64, palette = { plain: "#ced5af", water: "#a9c9bd", forest: "#b4c49a", mountain: "#c3c5af" };
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
    if (type === "farm") {
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
    } else if (type === "fence") {
      for (let i = 0; i < 6; i++) {
        let x = -24 + i * 9;
        poly(c, [[x, 14], [x, -11 - level * 2], [x + 3, -17 - level * 2], [x + 6, -11 - level * 2], [x + 6, 14]], level === 3 ? "#939b87" : "#a79466", "#776f4d");
      }
      rect(c, -26, -7, 56, 4, "#807351", "#625d41");
      rect(c, -26, 7, 56, 4, "#807351", "#625d41");
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
    } else if (type === "market") {
      rect(c, -24, 3, 48, 12, "#b8a278", "#897d5c");
      for (let i = -20; i <= 20; i += 40) rect(c, i, -20, 2, 28, "#867852");
      poly(c, [[-23, -22], [23, -22], [29, -6], [-29, -6]], "#b39a68", "#8a7c54");
      for (let i = -20; i <= 20; i += 10) poly(c, [[i, -21], [i + 5, -21], [i + 8, -7], [i - 2, -7]], "#e0ce98");
      for (let i = 0; i < 5; i++) ellipse(c, -17 + i * 8, 5, 3.7, 3.6, ["#97a165", "#b87755", "#d0b573"][i % 3]);
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
      if (type === "home") {
        tree(c, -25, 11, 0.7, true);
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
    const key = type + level;
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
  function makeGround() {
    const canvas = document.createElement("canvas");
    canvas.width = GF.SIZE * T;
    canvas.height = GF.SIZE * T;
    const c = canvas.getContext("2d");
    for (let y = 0; y < GF.SIZE; y++) for (let x = 0; x < GF.SIZE; x++) {
      const type = GF.terrain(x, y), px = x * T, py = y * T;
      rect(c, px, py, T, T, palette[type]);
      rect(c, px, py, T, T, `rgba(248,245,213,${noise(x, y) * 0.1})`);
      for (let j = 0; j < 9; j++) {
        let gx = px + noise(x, y, j + 2) * 60 + 2, gy = py + noise(y, x, j + 31) * 60 + 2;
        if (type === "water") {
          line(c, [[gx - 3, gy], [gx + 4, gy]], "#d1e1c65c", 0.8);
        } else {
          line(c, [[gx - 2, gy - 2], [gx, gy + 1], [gx + 2, gy - 3]], "#81986238", 0.8);
        }
      }
      if (type === "water") {
        const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        for (let i = 0; i < 4; i++) {
          const nx = x + neighbors[i][0], ny = y + neighbors[i][1];
          if (GF.terrain(nx, ny) !== "water") {
            const edges = [[[px, py + 4], [px + T, py + 4]], [[px + T - 4, py], [px + T - 4, py + T]], [[px, py + T - 4], [px + T, py + T - 4]], [[px + 4, py], [px + 4, py + T]]];
            line(c, edges[i], "#c6d1a6", 8);
            line(c, edges[i], "#b3cba8", 2);
          }
        }
        if (noise(x, y) > 0.3) {
          ellipse(c, px + 17, py + 38, 4, 2, "#9fb993");
          ellipse(c, px + 24, py + 41, 3, 1.8, "#9db88e");
        }
      }
      if (type === "mountain" && noise(x, y) > 0.7) {
        stone(c, px + 44, py + 19, 0.4);
      }
    }
    for (let y = 6; y <= 10; y++) rect(c, 8 * T + 25, y * T, 14, T, "#dcd8b74a");
    for (let x = 6; x <= 10; x++) rect(c, x * T, 8 * T + 27, T, 12, "#dcd8b74a");
    return canvas;
  }
  const ground = makeGround();
  function render(canvas, s, cam, selected, options = {}) {
    const c = canvas.getContext("2d"), w = canvas.clientWidth, h = canvas.clientHeight, dpr = canvas.width / w;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const night = s.phase === "night", dusk = s.phase === "dusk";
    c.fillStyle = night ? "#31494a" : dusk ? "#b9b89b" : "#d5dcc5";
    c.fillRect(0, 0, w, h);
    c.save();
    c.translate(cam.x, cam.y);
    c.scale(cam.zoom, cam.zoom);
    for (let i = 0; i < 16; i++) {
      const x = i * 99 - 180;
      poly(c, [[x, -5], [x + 60, -110 - noise(i, 4) * 170], [x + 160, -5]], night ? "#3f5754" : "#aebda04d");
      poly(c, [[x - 90, GF.SIZE * T + 10], [x - 20, GF.SIZE * T + 100 + noise(i, 2) * 70], [x + 90, GF.SIZE * T + 10]], night ? "#3f5754" : "#aebda03b");
    }
    c.shadowColor = "#40583e18";
    c.shadowBlur = 35;
    c.shadowOffsetY = 8;
    c.drawImage(ground, 0, 0);
    c.shadowColor = "transparent";
    const left = Math.max(0, Math.floor(-cam.x / cam.zoom / T) - 1), right = Math.min(GF.SIZE - 1, Math.ceil((w - cam.x) / cam.zoom / T) + 1), top = Math.max(0, Math.floor(-cam.y / cam.zoom / T) - 1), bottom = Math.min(GF.SIZE - 1, Math.ceil((h - cam.y) / cam.zoom / T) + 1);
    const occupied = new Set(s.buildings.map((b) => b.x + "," + b.y));
    if (options.grid) {
      c.strokeStyle = "#5d78502b";
      c.lineWidth = 0.7;
      c.setLineDash([2, 4]);
      for (let i = 0; i <= GF.SIZE; i++) {
        line(c, [[i * T, 0], [i * T, GF.SIZE * T]], "#5d785026", 0.7);
        line(c, [[0, i * T], [GF.SIZE * T, i * T]], "#5d785026", 0.7);
      }
      c.setLineDash([]);
    }
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (occupied.has(x + "," + y)) continue;
      const type = GF.terrain(x, y);
      c.save();
      c.translate(x * T + 32, y * T + 32);
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
      if (type === "plain" && (x === 0 || y === 0 || x === 16 || y === 16)) {
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
    c.setLineDash([4, 5]);
    for (const b of s.buildings) {
      const d = GF.DEFS[b.type];
      if (!d.prev) continue;
      for (const n of GF.adjacent(s, b.x, b.y)) {
        if (n.type === d.prev) line(c, [[b.x * T + 32, b.y * T + 42], [n.x * T + 32, n.y * T + 42]], d.color, 2.2);
      }
    }
    c.setLineDash([]);
    if (selected) {
      const px = selected.x * T, py = selected.y * T;
      rect(c, px + 2, py + 2, T - 4, T - 4, "#fbebaf30");
      c.strokeStyle = "#b59451";
      c.lineWidth = 1.5;
      c.strokeRect(px + 2, py + 2, T - 4, T - 4);
      const b = GF.at(s, selected.x, selected.y);
      if (b && GF.DEFS[b.type].range) {
        c.setLineDash([5, 7]);
        ellipse(c, px + 32, py + 32, (GF.DEFS[b.type].range + (b.level - 1) * 0.35) * T, (GF.DEFS[b.type].range + (b.level - 1) * 0.35) * T, "#d7c7810a", "#b4a46b70");
        c.setLineDash([]);
      }
      if (!b) {
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
      if (b.type === "shrine" && s.buildings.length === 1) {
        c.strokeStyle = "#ead59a80";
        c.lineWidth = 1;
        ellipse(c, 0, 19, 32 + Math.sin(s.elapsed) * 2, 12, null, "#b99e6770");
      }
      if (b.hp < GF.maxHP(b)) {
        rect(c, -21, -51, 42, 3, "#61775c66");
        rect(c, -21, -51, 42 * Math.max(0, b.hp / GF.maxHP(b)), 3, b.hp / GF.maxHP(b) > 0.35 ? "#819d64" : "#b06a4e");
      }
      const label = GF.DEFS[b.type].name;
      c.font = '9px "Microsoft YaHei",sans-serif';
      c.textAlign = "center";
      const labelWidth = c.measureText(label).width + 18;
      rect(c, -labelWidth / 2, 22, labelWidth, 14, "#f3f0daf0");
      c.fillStyle = "#52694e";
      c.fillText(label, -3, 32);
      c.fillStyle = "#a78e55";
      c.font = "7px Georgia";
      c.fillText(b.level, labelWidth / 2 - 6, 31);
      if (GF.DEFS[b.type].end) {
        poly(c, [[23, 10], [27, 14], [23, 18], [19, 14]], "#c5a25d");
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
      rect(c, -13, -26, 26, 2.5, "#273e3480");
      rect(c, -13, -26, 26 * Math.max(0, e.hp / e.maxHp), 2.5, "#bb775a");
      c.restore();
    }
    if (night || dusk) {
      c.fillStyle = night ? "#19395878" : "#ac723222";
      c.fillRect(0, 0, T * GF.SIZE, T * GF.SIZE);
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
      } else if (e.type === "income" || e.type === "coin") {
        c.globalAlpha = Math.min(1, (1 - f) * 3);
        c.translate(x, y - (e.type === "income" ? 53 : 20) - f * 30);
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
        ellipse(c, cx, -5, 6, 6, "#ddb767", "#6f743d");
        ellipse(c, cx, -5, 4.2, 4.2, null, "#fae3a2");
        rect(c, cx - 1.7, -6.7, 3.4, 3.4, "#61724a", "#b18e4c");
      } else if (e.type === "hit") {
        ellipse(c, x, y, 20, 20, "#ae674066");
      } else {
        ellipse(c, x, y, 20 + f * 450, 20 + f * 450, null, e.type === "repair" ? "#d0e8a4" : "#eee0a6");
      }
      c.restore();
    }
    if (s.phase !== "day") {
      const d = s.direction, positions = [[8.5 * T, 25], [GF.SIZE * T - 25, 8.5 * T], [8.5 * T, GF.SIZE * T - 25], [25, 8.5 * T]], p = positions[d];
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
(function() {
  "use strict";
  const $ = (id) => document.getElementById(id), canvas = $("map"), KEY = "gufang-qitan-save-v1";
  let storageWarning = false, saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch (e) {
    storageWarning = true;
  }
  const categories = ["economy", "defense", "support", "temple"];
  let savedCategory = null;
  try {
    savedCategory = localStorage.getItem(KEY + "-category");
  } catch (e) {
  }
  let state = saved && GF.restore(saved) || GF.createState(), selected = null, category = categories.includes(savedCategory) ? savedCategory : "economy", paused = false, sound = false;
  let saveStatus = storageWarning ? "本地存档不可用" : "本地自动存档";
  let panelKey = "", lastPhase = "", lastFrame = 0, uiClock = 0, saveClock = 0, toastTimer, audioContext, hiddenPause = document.hidden;
  const cam = { x: 0, y: 0, zoom: 1 }, pointers = /* @__PURE__ */ new Map();
  const view = { width: 390, height: 844 };
  function center() {
    cam.zoom = Math.max(0.55, Math.min(0.86, view.width / 550));
    cam.x = view.width * 0.5 - (GF.CENTER + 0.5) * GFArt.T * cam.zoom;
    cam.y = view.height * 0.48 - (GF.CENTER + 0.5) * GFArt.T * cam.zoom;
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
    const size = GF.SIZE * GFArt.T * cam.zoom, marginX = view.width * 0.3, marginY = Math.min(view.height * 0.3, 160);
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
    if (x < 0 || y < 0 || x >= GF.SIZE || y >= GF.SIZE || state.over) return;
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
  function effect(d, b) {
    if (d.neighbors) return "收入 +" + d.income + "/秒 · 全镇 +" + d.aura * 100 + "%";
    if (d.cat === "economy") return "铜钱 +" + (b ? GF.income(state, b).toFixed(1) : d.income) + " / 秒";
    return d.desc || "";
  }
  function cardHTML(d) {
    return `<button class="build-card" data-build="${d.id}" aria-label="建造${d.name}"><span class="chain-tag">${d.chain ? d.chain + "业" : d.neighbors ? "终极" : ""}</span><img src="${GFArt.thumbnail(d.id)}" alt=""><span class="card-reason" hidden></span><strong>${d.name}</strong><span class="card-price"><i class="coin-icon"></i> ${d.cost}</span><span class="card-effect">${effect(d)}</span></button>`;
  }
  function detailHTML(b) {
    const d = GF.DEFS[b.type], max = b.level >= (d.max || 3), hp = GF.maxHP(b), f = GF.factor(b), nextF = f * 1.65;
    let stats = `<div>耐久上限<strong>${hp}${max ? "" : " → " + Math.round(hp * 1.65)}</strong></div>`;
    if (d.income) stats += `<div>铜钱 / 秒<strong>${GF.income(state, b).toFixed(1)}${max ? "" : " → " + (GF.income(state, b) * 1.65).toFixed(1)}</strong></div>`;
    else if (d.damage) stats += `<div>攻击伤害<strong>${Math.round(d.damage * f)}${max ? "" : " → " + Math.round(d.damage * nextF)}</strong></div>`;
    else if (d.incense) stats += `<div>香火 / 秒<strong>${(d.incense * f).toFixed(1)}${max ? "" : " → " + (d.incense * nextF).toFixed(1)}</strong></div>`;
    else if (["home", "well", "stage", "market"].includes(b.type)) {
      const v = { home: 10, well: 20, stage: 3, market: 5 }[b.type];
      stats += `<div>收入加成<strong>${v * b.level}%${max ? "" : " → " + v * (b.level + 1) + "%"}</strong></div>`;
    } else if (b.type === "zhong") stats += `<div>普通敌人减速<strong>${40 + (b.level - 1) * 8}%${max ? "" : " → " + (40 + b.level * 8) + "%"}</strong></div>`;
    if (d.income && d.incense) stats += `<div>香火 / 秒<strong>${(d.incense * f).toFixed(1)}${max ? "" : " → " + (d.incense * nextF).toFixed(1)}</strong></div>`;
    return `<div class="detail"><div class="detail-art"><img src="${GFArt.thumbnail(b.type, b.level)}" alt="${d.name}"><span>${d.chain ? d.chain + "业兴旺" : d.neighbors ? "四方来客" : d.cat === "defense" ? "守望古坊" : "人间烟火"}</span></div><div class="detail-info"><div class="detail-title"><h3>${GF.name(b)}</h3><span class="level-badge">Lv.${b.level}${max ? " · 满级" : ""}</span></div><p class="detail-description">${effect(d, b)}</p><div class="health-row"><span>耐久</span><div class="health-track"><i id="detail-hp-fill"></i></div><span id="detail-hp"></span></div><div class="upgrade-stats">${stats}</div></div><div class="detail-actions"><button class="upgrade-button" id="upgrade-building">${max ? "已臻化境" : "升级至 Lv." + (b.level + 1)}<small id="upgrade-label"></small></button><button class="demolish-button${state.phase === "night" ? " night-restricted" : ""}" id="demolish-building" ${b.type === "shrine" ? "disabled" : ""}>${b.type === "shrine" ? "古坊根基 · 不可拆除" : state.phase === "night" ? "夜晚不可拆除" : "拆除 · 返还 " + Math.floor(d.cost * 0.4) + " 铜钱"}</button></div></div>`;
  }
  function renderPanel() {
    if (!selected) return;
    const { x, y } = selected, b = GF.at(state, x, y);
    const availability = b ? "" : Object.values(GF.DEFS).filter((d) => d.cat === category && !d.unique).map((d) => GF.buildReason(state, d.id, x, y) ? 0 : 1).join("");
    const key = `${x},${y},${category},${state.revision},${(b == null ? void 0 : b.id) || ""},${availability},${state.phase}`;
    $("plot-label").textContent = b ? GF.DEFS[b.type].name : GF.TERRAIN[GF.terrain(x, y)] + (state.phase === "night" ? " · 夜晚停工" : " · 可兴建");
    $("plot-coord").textContent = "地块 " + (x + 1) + " · " + (y + 1);
    $("build-view").hidden = !!b;
    $("detail-view").hidden = !b;
    if (key !== panelKey) {
      panelKey = key;
      if (b) $("detail-view").innerHTML = detailHTML(b);
      else {
        for (const el of document.querySelectorAll("[data-category]")) el.classList.toggle("active", el.dataset.category === category);
        const defs = Object.values(GF.DEFS).filter((d) => d.cat === category && !d.unique);
        defs.sort((a, b2) => Number(!!GF.buildReason(state, a.id, x, y)) - Number(!!GF.buildReason(state, b2.id, x, y)));
        const scroll = $("cards").scrollLeft;
        $("cards").innerHTML = defs.map(cardHTML).join("");
        $("cards").scrollLeft = scroll;
      }
    }
    if (b) {
      $("detail-hp").textContent = Math.ceil(Math.max(0, b.hp)) + " / " + GF.maxHP(b);
      $("detail-hp-fill").style.width = Math.max(0, b.hp / GF.maxHP(b) * 100) + "%";
      const reason = GF.upgradeReason(state, b), max = b.level >= (GF.DEFS[b.type].max || 3);
      $("upgrade-building").classList.toggle("blocked", !!reason);
      $("upgrade-building").setAttribute("aria-disabled", String(!!reason));
      $("upgrade-label").textContent = max ? "本建筑已达最高等级" : reason || "◎ " + GF.upgradeCost(b) + " 铜钱";
    } else for (const el of $("cards").children) {
      const reason = GF.buildReason(state, el.dataset.build, x, y);
      el.classList.toggle("locked", !!reason);
      el.classList.toggle("poor", reason.startsWith("差 "));
      el.setAttribute("aria-disabled", String(!!reason));
      const label = el.querySelector(".card-reason");
      label.hidden = !reason;
      label.textContent = reason;
    }
  }
  const fmt = (n) => Math.floor(n).toLocaleString("en-US");
  function refresh() {
    var _a, _b, _c, _d, _e, _f;
    $("coins").textContent = fmt(state.coins);
    $("incense").textContent = fmt(state.incense);
    $("prosperity").textContent = GF.prosperity(state);
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
      el.querySelector("small").textContent = state.cooldowns[id] > 0 ? Math.ceil(state.cooldowns[id]) + " 秒" : id === "thunder" && !state.buildings.some((b) => b.type === "tao") ? "需道观" : GF.SKILLS[id].cost + " 香火";
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
      showVictory();
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
    if (!selected) return;
    const r = GF.build(state, type, selected.x, selected.y);
    if (!r.ok) return blocked(el, r.reason);
    tone();
    panelKey = "";
    toast(GF.DEFS[type].name + "已建成");
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
    } else if (e.target.closest("#demolish-building")) {
      const r = GF.demolish(state, b);
      if (!r.ok) return blocked($("demolish-building"), r.reason);
      toast("已拆除，返还 " + r.refund + " 铜钱");
    } else return;
    panelKey = "";
    handleEvents();
    save();
    refresh();
  });
  for (const el of document.querySelectorAll("[data-category]")) el.addEventListener("click", () => {
    category = el.dataset.category;
    try {
      localStorage.setItem(KEY + "-category", category);
    } catch (e) {
    }
    panelKey = "";
    $("cards").scrollLeft = 0;
    renderPanel();
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
    paused = false;
    $("menu-pause").setAttribute("aria-expanded", "false");
    $("menu-pause").focus();
    lastFrame = performance.now();
    refresh();
  }
  $("close-modal").onclick = closeModal;
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });
  function showMenu() {
    modal('<p class="modal-kicker">古坊奇谭</p><h2>已暂停</h2><p>第 ' + state.day + " 日 · " + GF.townName(state) + '</p><button class="modal-primary" data-modal="close">继续游戏</button><button class="modal-secondary" data-modal="save">保存进度</button><button class="modal-secondary" data-modal="sound">音效：' + (sound ? "开" : "关") + '</button><div class="modal-row"><button class="modal-secondary" data-modal="export">导出存档</button><button class="modal-secondary" data-modal="import">导入存档</button></div><input id="save-file" type="file" accept=".json,application/json" hidden><button class="modal-secondary danger" data-modal="reset">重新开始</button><p id="save-status">' + saveStatus + "</p>");
  }
  function showEnd() {
    modal('<p class="modal-kicker">第 ' + state.day + ' 夜</p><h2>古坊失守</h2><div class="modal-stats"><div><strong>' + (state.day - 1) + "</strong><span>守过长夜</span></div><div><strong>" + state.kills + '</strong><span>击退来敌</span></div></div><button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="close">返回古坊</button>');
  }
  function showVictory() {
    modal('<p class="modal-kicker">七夜长明</p><h2>古坊初兴</h2><div class="modal-stats"><div><strong>' + GF.prosperity(state) + "</strong><span>繁荣</span></div><div><strong>" + state.kills + '</strong><span>击退来敌</span></div></div><button class="modal-primary" data-modal="close">继续游戏</button>');
  }
  function newGame() {
    state = GF.createState();
    paused = false;
    closePanel();
    center();
    closeModal();
    save();
    refresh();
    toast("青溪新雨 · 古坊的故事重新开始");
  }
  $("modal-content").addEventListener("click", (e) => {
    var _a;
    const action = (_a = e.target.closest("[data-modal]")) == null ? void 0 : _a.dataset.modal;
    if (!action) return;
    if (action === "close") closeModal();
    if (action === "save") save(true);
    if (action === "sound") {
      sound = !sound;
      tone();
      showMenu();
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
        state = loaded;
        paused = false;
        closePanel();
        center();
        closeModal();
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
    if (e.code === "Space") {
      e.preventDefault();
      if (paused) closeModal();
      else showMenu();
    }
    if (e.key === "Escape") {
      if (paused) closeModal();
      else closePanel();
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
    if (!paused && !hiddenPause && !state.over) {
      let remaining = dt;
      while (remaining > 0) {
        const tick = Math.min(0.1, remaining);
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
    GFArt.render(canvas, state, cam, selected, { grid: false });
    requestAnimationFrame(frame);
  }
  resize();
  refresh();
  requestAnimationFrame(frame);
  if (saved && !GF.restore(saved)) toast("旧存档无法读取，已创建新古坊；原数据将在首次存档时替换", "warning");
  else if (saved) toast("故人归坊 · 已续接第 " + state.day + " 日的灯火");
  if (state.over) showEnd();
  window.Gufang = { get state() {
    return state;
  }, get camera() {
    return __spreadValues({}, cam);
  }, get paused() {
    return paused;
  }, select, refresh, screenPoint, save, setPaused(value) {
    if (value) showMenu();
    else closeModal();
  } };
})();
