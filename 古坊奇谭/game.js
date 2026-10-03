/* 古坊奇谭 · independent, deterministic simulation; no network dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SIZE = 17, CENTER = 8, DAY = 85, DUSK = 12;
  const TERRAIN = { plain: '平地', water: '水边', forest: '林地', mountain: '山地' };
  const DEFS = {};
  function def(id, name, cat, cost, hp, extra) { DEFS[id] = { id, name, cat, cost, hp, ...extra }; }
  const chains = [
    ['tea', 'inn', 'bank', '茶肆', '客栈', '钱庄', 'plain', '商', '#d6a450'],
    ['farm', 'mill', 'wine', '农田', '磨坊', '酒坊', 'water', '农', '#89a663'],
    ['mulberry', 'weaver', 'tailor', '桑园', '织坊', '成衣铺', 'forest', '丝', '#b38ba7'],
    ['quarry', 'kiln', 'trade', '石场', '瓷窑', '商号', 'mountain', '工', '#7b9fa2']
  ];
  for (const a of chains) for (let i = 0; i < 3; i++) def(a[i], a[i + 3], 'economy', [65, 115, 195][i], [180, 250, 340][i], {
    income: [3, 7, 13][i], terrain: i === 0 ? a[6] : null, prev: i ? a[i - 1] : null,
    chain: a[7], color: a[8], end: i === 2, prosperity: [8, 15, 24][i],
    names: [a[i + 3], i === 0 ? ['清茗茶肆', '临水良田', '葱郁桑园', '青石矿场'][chains.indexOf(a)] : '兴旺' + a[i + 3], '鼎盛' + a[i + 3]]
  });
  def('guild', '会馆', 'economy', 400, 600, { income: 26, aura: .05, neighbors: 2, max: 1, prosperity: 50 });
  def('port', '市舶司', 'economy', 800, 900, { income: 39, aura: .10, neighbors: 3, max: 1, prosperity: 90 });
  def('fence', '木栅', 'defense', 35, 650, { desc: '挡住来敌，守住街巷', prosperity: 2 });
  def('tower', '箭塔', 'defense', 95, 300, { damage: 22, range: 4, interval: .85, desc: '单体远射 · 射程 4 格', prosperity: 6 });
  def('rock', '擂石台', 'defense', 155, 380, { damage: 46, range: 3.8, interval: 2.5, splash: 1.35, unlock: 45, desc: '范围轰击 · 克制妖狐', prosperity: 9 });
  def('barracks', '兵营', 'defense', 165, 420, { damage: 18, range: 4.5, interval: .8, unlock: 65, desc: '自动派出民兵近战', prosperity: 9 });
  def('home', '民居', 'support', 70, 220, { desc: '相邻产业收入 +10%', prosperity: 12 });
  def('well', '水井', 'support', 55, 250, { desc: '相邻农田收入 +20%', prosperity: 5 });
  def('stage', '戏台', 'support', 160, 280, { aura: .03, desc: '全镇收入 +3%', prosperity: 18 });
  def('market', '集市', 'support', 110, 250, { desc: '周围 2 格收入 +5%', prosperity: 12 });
  def('shrine', '祠堂', 'temple', 0, 1800, { incense: .4, income: 1, desc: '古坊之根 · 失守则游戏结束', prosperity: 10, unique: true, names: ['古坊祠堂', '百福祠堂', '万安宗祠'] });
  def('earth', '土地庙', 'temple', 85, 260, { incense: 1.5, desc: '香火 +1.5 / 秒', prosperity: 8 });
  def('zhong', '钟馗像', 'temple', 125, 430, { range: 3, desc: '周围妖鬼减速 40%', prosperity: 10 });
  def('tao', '道观', 'temple', 180, 380, { incense: 3, unlock: 80, desc: '香火 +3 / 秒 · 解锁天雷', prosperity: 16 });
  const ENEMIES = {
    bandit: { name: '山匪', hp: 100, speed: .65, damage: 14, reward: 12 },
    ghost: { name: '阴兵', hp: 220, speed: .42, damage: 23, reward: 20 },
    fox: { name: '妖狐', hp: 75, speed: 1.1, damage: 12, reward: 16 }
  };
  const SKILLS = { repel: { name: '驱鬼符', cost: 30, cooldown: 18 }, repair: { name: '回春诀', cost: 45, cooldown: 24 }, thunder: { name: '九霄天雷', cost: 65, cooldown: 22 } };
  const MISSIONS = [
    { title: '一盏茶，起一座坊', desc: '在平地建造一间茶肆', reward: 60, test: s => s.buildings.some(b => b.type === 'tea') },
    { title: '客来茶香，产业相连', desc: '紧挨茶肆建造客栈', reward: 90, test: s => s.buildings.some(b => b.type === 'inn') },
    { title: '立箭塔，护一方安宁', desc: '建造两座箭塔，准备入夜', reward: 100, test: s => s.buildings.filter(b => b.type === 'tower').length >= 2 },
    { title: '香火不绝', desc: '建造土地庙，积攒神技香火', reward: 75, test: s => s.buildings.some(b => b.type === 'earth') },
    { title: '长夜过，古坊安', desc: '守住第一夜', reward: 120, test: s => s.day >= 2 },
    { title: '百业初兴', desc: '建成任意两种经济链终点建筑', reward: 200, test: s => new Set(s.buildings.filter(b => DEFS[b.type].end).map(b => b.type)).size >= 2 },
    { title: '四方会聚', desc: '建成一座会馆', reward: 300, test: s => s.buildings.some(b => b.type === 'guild') },
    { title: '万家灯火', desc: '守过第七夜，迎来太平晨光', reward: 500, test: s => s.day >= 8 }
  ];
  function terrain(x, y) {
    if ((x >= 1 && x <= 4 && y >= 5 && y <= 12) || (x >= 3 && x <= 6 && y >= 11 && y <= 14)) return 'water';
    if ((x >= 10 && x <= 14 && y >= 2 && y <= 6) || (x >= 2 && x <= 5 && y >= 1 && y <= 3)) return 'forest';
    if (x >= 11 && x <= 15 && y >= 11 && y <= 15) return 'mountain';
    return 'plain';
  }
  const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const at = (s, x, y) => s.buildings.find(b => b.x === x && b.y === y);
  const adjacent = (s, x, y) => s.buildings.filter(b => Math.abs(b.x - x) + Math.abs(b.y - y) === 1);
  const factor = b => Math.pow(1.65, b.level - 1);
  const maxHP = b => Math.round(DEFS[b.type].hp * factor(b));
  const name = b => DEFS[b.type].names?.[b.level - 1] || (b.level === 1 ? DEFS[b.type].name : ['','', '兴盛', '鼎盛'][b.level] + DEFS[b.type].name);
  function addBuilding(s, type, x, y) {
    const b = { id: s.nextId++, type, x, y, level: 1, hp: DEFS[type].hp, cooldown: 0 };
    s.buildings.push(b); s.revision++; return b;
  }
  function createState() {
    const s = { version: 1, seed: 73193, nextId: 1, coins: 420, incense: 40, day: 1, phase: 'day', time: 0, elapsed: 0, repairTime: 0,
      direction: 0, buildings: [], enemies: [], projectiles: [], effects: [], events: [], kills: 0, wave: null,
      cooldowns: { repel: 0, repair: 0, thunder: 0 }, mission: 0, revision: 0, over: false, celebrated: false };
    addBuilding(s, 'shrine', CENTER, CENTER); return s;
  }
  function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
  const prosperity = s => s.buildings.reduce((n, b) => n + (DEFS[b.type].prosperity || 0) * b.level, 0);
  const townName = s => { const p = prosperity(s); return p >= 450 ? '锦绣名镇' : p >= 230 ? '百业兴坊' : p >= 100 ? '烟火小镇' : '山野初坊'; };
  const terminalCount = (s, x, y) => new Set(adjacent(s, x, y).filter(b => DEFS[b.type].end).map(b => b.type)).size;
  function buildReason(s, type, x, y) {
    const d = DEFS[type];
    if (!d) return '未知建筑';
    if (s.over) return '古坊已失守';
    if (!inside(x, y)) return '请选择坊内地块';
    if (at(s, x, y)) return '此地已有建筑';
    if (s.enemies.some(e => Math.hypot(e.x - x, e.y - y) < .65)) return '敌人正在此地';
    if (d.unique) return '祠堂仅此一座';
    if (d.terrain && terrain(x, y) !== d.terrain) return '需' + TERRAIN[d.terrain];
    if (d.prev && !adjacent(s, x, y).some(b => b.type === d.prev)) return '需紧挨' + DEFS[d.prev].name;
    if (d.neighbors && terminalCount(s, x, y) < d.neighbors) return '邻终点 ' + terminalCount(s, x, y) + '/' + d.neighbors + ' 种';
    if (d.unlock && prosperity(s) < d.unlock) return '需繁荣 ' + d.unlock;
    if (s.coins < d.cost) return '差 ' + Math.ceil(d.cost - s.coins) + ' 钱';
    return '';
  }
  function event(s, text, kind = 'info') { s.events.push({ text, kind }); if (s.events.length > 30) s.events.shift(); }
  function missions(s) {
    while (MISSIONS[s.mission]?.test(s)) { const m = MISSIONS[s.mission++]; s.coins += m.reward; event(s, '坊志达成：' + m.title + ' · +' + m.reward + ' 铜钱', 'reward'); }
  }
  function build(s, type, x, y) {
    const reason = buildReason(s, type, x, y); if (reason) return { ok: false, reason };
    s.coins -= DEFS[type].cost; const b = addBuilding(s, type, x, y); missions(s); return { ok: true, building: b };
  }
  const upgradeCost = b => Math.ceil((DEFS[b.type].cost || 180) * (b.level === 1 ? 1.35 : 2.2));
  function upgradeReason(s, b) {
    if (!b || !s.buildings.includes(b)) return '建筑已不存在';
    if (s.over) return '古坊已失守';
    const d = DEFS[b.type]; if (b.level >= (d.max || 3)) return '已达最高等级';
    if (d.prev && !adjacent(s, b.x, b.y).some(n => n.type === d.prev && n.level >= b.level + 1)) return '需邻' + DEFS[d.prev].name + ' Lv' + (b.level + 1);
    if (s.coins < upgradeCost(b)) return '差 ' + Math.ceil(upgradeCost(b) - s.coins) + ' 钱';
    return '';
  }
  function upgrade(s, b) {
    const reason = upgradeReason(s, b); if (reason) return { ok: false, reason };
    const ratio = b.hp / maxHP(b); s.coins -= upgradeCost(b); b.level++; b.hp = maxHP(b) * ratio; s.revision++; missions(s); return { ok: true };
  }
  function demolish(s, b) {
    if (!b || !s.buildings.includes(b) || b.type === 'shrine' || s.over) return { ok: false, reason: '祠堂不可拆除' };
    const refund = Math.floor(DEFS[b.type].cost * .4); s.coins += refund; s.buildings = s.buildings.filter(n => n !== b); s.revision++; return { ok: true, refund };
  }
  function income(s, b) {
    const d = DEFS[b.type]; if (!d.income) return 0;
    let bonus = 0;
    for (const n of s.buildings) {
      const nd = DEFS[n.type], dist = Math.abs(n.x - b.x) + Math.abs(n.y - b.y);
      if (nd.aura) bonus += nd.aura * n.level;
      if (n.type === 'home' && dist === 1 && d.cat === 'economy') bonus += .1 * n.level;
      if (n.type === 'well' && dist === 1 && b.type === 'farm') bonus += .2 * n.level;
      if (n.type === 'market' && dist <= 2) bonus += .05 * n.level;
    }
    return d.income * factor(b) * (1 + bonus) * (s.day % 7 === 0 ? 1.25 : 1);
  }
  const rates = s => s.buildings.reduce((r, b) => ({ coins: r.coins + income(s, b), incense: r.incense + (DEFS[b.type].incense || 0) * factor(b) }), { coins: 0, incense: 0 });
  function dusk(s) { s.phase = 'dusk'; s.time = 0; s.direction = Math.floor(random(s) * 4); event(s, '暮色将至 · 今夜来敌在' + ['北', '东', '南', '西'][s.direction] + '方', 'warning'); }
  function startNight(s) {
    s.phase = 'night'; s.time = 0; const boss = s.day % 7 === 0;
    s.wave = { total: Math.min(75, 5 + s.day * 2 + (boss ? 9 : 0)), spawned: 0, timer: .5, boss };
    event(s, boss ? '百鬼夜行！妖将与群妖从四方来袭' : '入夜了 · 守住祠堂，灯火不熄', 'warning');
  }
  function dawn(s) {
    s.day++; s.phase = 'day'; s.time = 0; s.wave = null; s.enemies = []; s.projectiles = []; s.repairTime = 0;
    const reward = 65 + s.day * 15; s.coins += reward; event(s, '平安入晓 · 守夜赏钱 +' + reward, 'reward');
    if (s.day % 7 === 0) { s.coins += 250; s.incense += 70; event(s, '上元灯会 · 收入 +25%，获赠 250 钱与 70 香火', 'reward'); }
    if (s.day === 8 && !s.celebrated) { s.celebrated = true; event(s, '七夜长明！古坊立稳根基，可继续经营抵御更强来敌', 'victory'); }
    missions(s);
  }
  function spawnEnemy(s) {
    const w = s.wave, i = w.spawned++, dir = w.boss ? i % 4 : s.direction;
    const pos = 3 + Math.floor(random(s) * 11), p = [[pos, 0], [SIZE - 1, pos], [pos, SIZE - 1], [0, pos]][dir];
    const type = s.day >= 3 && i % 4 === 2 ? 'fox' : s.day >= 2 && i % 3 === 1 ? 'ghost' : 'bandit';
    const d = ENEMIES[type], boss = w.boss && i === w.total - 1, scale = 1 + (s.day - 1) * .16;
    s.enemies.push({ id: s.nextId++, type, x: p[0], y: p[1], hp: d.hp * scale * (boss ? 5 : 1), maxHp: d.hp * scale * (boss ? 5 : 1),
      damage: d.damage * (1 + (s.day - 1) * .1) * (boss ? 2 : 1), speed: d.speed, attack: 0, repelled: 0, boss, path: [], pathRevision: -1 });
  }
  // Weighted Dijkstra: buildings are destructible route costs, not impassable cells.
  function findPath(s, e) {
    const base = s.buildings.find(b => b.type === 'shrine'); if (!base) return [];
    const startX = Math.max(0, Math.min(SIZE - 1, Math.round(e.x))), startY = Math.max(0, Math.min(SIZE - 1, Math.round(e.y)));
    const start = startY * SIZE + startX, goal = base.y * SIZE + base.x, costs = Array(SIZE * SIZE).fill(Infinity), prev = Array(SIZE * SIZE).fill(-1), open = new Set([start]); costs[start] = 0;
    const occupied = new Map(s.buildings.map(b => [b.y * SIZE + b.x, b]));
    while (open.size) {
      let current = -1, best = Infinity; for (const n of open) if (costs[n] < best) { current = n; best = costs[n]; }
      open.delete(current); if (current === goal) break;
      const x = current % SIZE, y = Math.floor(current / SIZE);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!inside(nx, ny)) continue; const next = ny * SIZE + nx, b = occupied.get(next);
        const obstacle = b && next !== goal ? 1.8 + b.hp / (e.damage * (e.type === 'fox' ? 1 : 2.5)) : 0;
        const cost = best + 1 + obstacle; if (cost < costs[next]) { costs[next] = cost; prev[next] = current; open.add(next); }
      }
    }
    const path = []; let n = goal; while (n !== start && n !== -1) { path.unshift({ x: n % SIZE, y: Math.floor(n / SIZE) }); n = prev[n]; }
    // Return to the nearest grid center before turning after a route invalidation.
    if (Math.hypot(e.x - startX, e.y - startY) > .03) path.unshift({ x: startX, y: startY });
    return path;
  }
  function hurtBuilding(s, b, damage) {
    b.hp -= damage;
    if (b.hp > 0) return;
    s.buildings = s.buildings.filter(n => n !== b); s.revision++;
    event(s, DEFS[b.type].name + '被摧毁', 'warning');
    if (b.type === 'shrine') { s.over = true; event(s, '祠堂失守，古坊灯火暂熄', 'defeat'); }
  }
  function collectDead(s) {
    s.enemies = s.enemies.filter(e => {
      if (e.hp > 0) return true;
      s.coins += ENEMIES[e.type].reward * (e.boss ? 5 : 1); s.kills++;
      s.effects.push({ type: 'coin', x: e.x, y: e.y, life: .7, total: .7 }); return false;
    });
  }
  function combat(s, dt) {
    const w = s.wave; if (!w) return;
    w.timer -= dt;
    if (w.spawned < w.total && w.timer <= 0) { spawnEnemy(s); w.timer += Math.max(.55, 2.2 - s.day * .07); }
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
        b.cooldown = d.interval; const damage = d.damage * factor(b);
        if (d.splash) for (const e of s.enemies) { if (Math.hypot(e.x - target.x, e.y - target.y) <= d.splash) e.hp -= damage * (e.type === 'fox' ? 1.3 : 1); }
        else target.hp -= damage * (b.type === 'barracks' && target.type === 'fox' ? 1.5 : 1);
        s.projectiles.push({ x: b.type === 'barracks' ? b.soldier.x : b.x, y: b.type === 'barracks' ? b.soldier.y : b.y, tx: target.x, ty: target.y, type: b.type, life: .3, total: .3 });
      }
    }
    collectDead(s);
    for (const e of s.enemies) {
      if (s.over) break;
      e.attack = Math.max(0, e.attack - dt);
      if (e.repelled > 0) { e.repelled -= dt; continue; }
      if (e.pathRevision !== s.revision || !e.path.length) { e.path = findPath(s, e); e.pathRevision = s.revision; }
      const p = e.path[0]; if (!p) continue;
      const b = at(s, p.x, p.y), dist = Math.hypot(p.x - e.x, p.y - e.y);
      if (b && dist <= 1.05) {
        if (e.attack === 0) { hurtBuilding(s, b, e.damage); e.attack = 1; s.effects.push({ type: 'hit', x: b.x, y: b.y, life: .2, total: .2 }); }
        continue;
      }
      let slow = 1;
      for (const n of s.buildings) if (n.type === 'zhong' && Math.hypot(n.x - e.x, n.y - e.y) <= 3 + .3 * (n.level - 1)) slow = Math.min(slow, e.type === 'ghost' ? .78 : Math.max(.35, .6 - .08 * (n.level - 1)));
      const step = Math.min(dist, e.speed * dt * slow);
      if (dist > .001) { e.x += (p.x - e.x) / dist * step; e.y += (p.y - e.y) / dist * step; }
      if (dist <= step + .001) e.path.shift();
    }
    if (!s.over && w.spawned >= w.total && !s.enemies.length) dawn(s);
  }
  function skillReason(s, id) {
    const d = SKILLS[id]; if (!d) return '未知神技';
    if (s.over || s.phase !== 'night') return '神技仅在夜晚使用';
    if (id === 'thunder' && !s.buildings.some(b => b.type === 'tao')) return '建造道观以解锁天雷';
    if (s.cooldowns[id] > 0) return '还需 ' + Math.ceil(s.cooldowns[id]) + ' 秒';
    if (s.incense < d.cost) return '香火不足'; return '';
  }
  function skill(s, id) {
    const reason = skillReason(s, id); if (reason) return { ok: false, reason };
    s.incense -= SKILLS[id].cost; s.cooldowns[id] = SKILLS[id].cooldown;
    if (id === 'repair') for (const b of s.buildings) b.hp = Math.min(maxHP(b), b.hp + maxHP(b) * .35);
    if (id === 'repel') for (const e of s.enemies) { e.repelled = 4; e.hp -= 20; }
    if (id === 'thunder') for (const e of s.enemies) { e.hp -= e.type === 'ghost' ? 350 : 240; s.effects.push({ type: 'thunder', x: e.x, y: e.y, life: .7, total: .7 }); }
    s.effects.push({ type: id, x: CENTER, y: CENTER, life: 1, total: 1 }); collectDead(s);
    return { ok: true };
  }
  function step(s, dt) {
    if (s.over || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .25); s.time += dt; s.elapsed += dt;
    const r = rates(s); s.coins += r.coins * dt; s.incense += r.incense * dt;
    for (const id in s.cooldowns) s.cooldowns[id] = Math.max(0, s.cooldowns[id] - dt);
    for (const group of [s.effects, s.projectiles]) { for (const e of group) e.life -= dt; }
    s.effects = s.effects.filter(e => e.life > 0); s.projectiles = s.projectiles.filter(e => e.life > 0);
    if (s.phase === 'day') {
      s.repairTime += dt;
      if (s.repairTime >= 2) { s.repairTime -= 2; for (const b of s.buildings) b.hp = Math.min(maxHP(b), b.hp + maxHP(b) * .05); }
      if (s.time >= DAY) dusk(s);
    } else if (s.phase === 'dusk' && s.time >= DUSK) startNight(s);
    else if (s.phase === 'night') combat(s, dt);
    missions(s);
  }
  function serialize(s) { return JSON.stringify({ ...s, events: [], projectiles: [], effects: [] }); }
  function restore(raw) {
    try {
      const s = JSON.parse(raw), finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
      if (s.version !== 1 || !finite(s.coins) || !finite(s.incense) || !Number.isInteger(s.day) || s.day < 1 || !['day', 'dusk', 'night'].includes(s.phase) || !finite(s.time) || !finite(s.elapsed) || !finite(s.repairTime) || !Number.isInteger(s.mission) || s.mission < 0 || s.mission > MISSIONS.length || !Number.isInteger(s.seed) || !Number.isInteger(s.direction) || s.direction < 0 || s.direction > 3 || !finite(s.kills) || typeof s.over !== 'boolean') return null;
      if (!Array.isArray(s.buildings) || s.buildings.length > SIZE * SIZE || !Array.isArray(s.enemies) || s.enemies.length > 100 || !s.cooldowns || !Object.keys(SKILLS).every(k => finite(s.cooldowns[k]))) return null;
      const cells = new Set();
      for (const b of s.buildings) {
        if (!Object.hasOwn(DEFS,b.type) || !inside(b.x, b.y) || !Number.isInteger(b.level) || b.level < 1 || b.level > (DEFS[b.type].max || 3) || !finite(b.hp) || b.hp <= 0 || b.hp > maxHP(b) + 1 || !Number.isInteger(b.id) || b.id < 1) return null;
        const key = b.x + ',' + b.y; if (cells.has(key)) return null; cells.add(key); b.cooldown = 0; delete b.soldier;
      }
      if ((!s.over && s.buildings.filter(b => b.type === 'shrine').length !== 1) || s.buildings.filter(b => b.type === 'shrine').length > 1) return null;
      if (s.phase === 'night' && (!s.wave || !Number.isInteger(s.wave.total) || s.wave.total < 1 || s.wave.total > 75 || !Number.isInteger(s.wave.spawned) || s.wave.spawned < 0 || s.wave.spawned > s.wave.total || !Number.isFinite(s.wave.timer))) return null;
      for (const e of s.enemies) {
        if (!Object.hasOwn(ENEMIES,e.type) || !Number.isInteger(e.id) || e.id < 1 || !finite(e.x) || e.x >= SIZE || !finite(e.y) || e.y >= SIZE || !finite(e.hp) || e.hp <= 0 || !finite(e.maxHp) || e.hp > e.maxHp || !finite(e.speed) || e.speed <= 0 || !finite(e.damage) || e.damage <= 0 || !finite(e.attack) || !Number.isFinite(e.repelled)) return null;
        e.path = []; e.pathRevision = -1;
      }
      s.events = []; s.effects = []; s.projectiles = []; s.revision = 1;
      s.nextId = Math.max(0, ...s.buildings.map(b => b.id), ...s.enemies.map(e => e.id || 0)) + 1;
      return s;
    } catch { return null; }
  }
  return { SIZE, CENTER, DAY, DUSK, TERRAIN, DEFS, ENEMIES, SKILLS, MISSIONS, chains, terrain, at, adjacent, factor, maxHP, name, createState, prosperity, townName, terminalCount, buildReason, build, upgradeCost, upgradeReason, upgrade, demolish, income, rates, dusk, startNight, findPath, skillReason, skill, step, serialize, restore };
});
