(function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  var C = (typeof window !== 'undefined' && window.CFG) ? window.CFG : require('./config.js');
  var G = C.GOODS;

  var World = {
    W: C.MAP.W,
    H: C.MAP.H,
    fence: C.MAP.fence,
    gap: C.MAP.gap,
    plot: C.MAP.plot,
    market: C.MAP.market,
    buildings: [],
    store: {},
    gold: 0,
    material: 0,
    rentIndex: 0,
    rentTimer: C.RENT.interval,
    overdue: null,
    missedBefore: false,
    unlocked: {},
    time: 0,
    victory: false,
    gameOver: false,
    gameOverReason: '',
    paused: false,
    speed: 1,
    nextId: 1,
    totalEarned: 0,
    stats: { batches: 0, builds: 0, sold: 0 },
    fx: [],
    toasts: [],
    decor: []
  };
  root.World = World;

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function sumObj(o) { var s = 0; for (var k in o) s += o[k] || 0; return s; }
  function byId(id) { for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].id === id) return World.buildings[i]; return null; }
  function lvIdx(b) { return b.level - 1; }
  function inRect(x, y, r) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
  function inMarket(x, y) { return inRect(x, y, World.market); }

  function buildingAt(x, y) {
    for (var i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) return b;
    }
    return null;
  }

  function canPlace(type, x, y, ignoreId) {
    var d = C.BUILD[type];
    if (!d || !d.buildable) return { ok: false, msg: '不可建造' };
    var w = d.size[0], h = d.size[1];
    var p = World.plot;
    if (x < p.x || y < p.y || x + w > p.x + p.w || y + h > p.y + p.h) return { ok: false, msg: '超出地块范围' };
    for (var i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (b.id === ignoreId) continue;
      if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return { ok: false, msg: '与建筑重叠' };
    }
    return { ok: true };
  }

  function addBuilding(type, x, y, level, complete) {
    var d = C.BUILD[type];
    var w = d.size[0], h = d.size[1];
    var bt = complete ? 0 : (C.BUILD_TIME[type] || 0);
    var b = {
      id: World.nextId++, type: type, x: x, y: y, w: w, h: h,
      level: level || 1,
      mode: 'store',
      batch: null, rr: 0,
      incomeAcc: 0,
      constructing: bt > 0,
      buildProgress: 0,
      buildTime: bt
    };
    World.buildings.push(b);
    return b;
  }

  function getRecipes(b) {
    var d = C.BUILD[b.type];
    if (!d || !d.buildable || b.type === 'manor' || b.type === 'market') return [];
    var i = lvIdx(b);
    var result = [];
    if (d.variants) {
      for (var vi = 0; vi < d.variants.length; vi++) {
        var v = d.variants[vi];
        var inp = {}, outp = {};
        if (v.in) inp[v.in] = v.inQty ? v.inQty[i] : d.inQty[i];
        outp[v.out] = v.outQty ? v.outQty[i] : d.outQty[i];
        result.push({ in: inp, out: outp, cycle: d.cycle[i], material: 0 });
      }
      return result;
    }
    var inputs = {};
    if (d.inputs) for (var k in d.inputs) inputs[k] = d.inputs[k][i];
    var outputs = {};
    if (d.outputs) for (var k2 in d.outputs) outputs[k2] = d.outputs[k2][i];
    result.push({
      in: inputs, out: outputs, cycle: d.cycle[i],
      material: d.material ? d.material[i] : 0,
      mixedTotal: d.mixedTotal ? d.mixedTotal[i] : null,
      mixedGoods: d.mixedGoods || null
    });
    return result;
  }

  function pickDisplayRecipe(b, rs) {
    for (var i = 0; i < rs.length; i++) if (sumObj(rs[i].in) === 0) return rs[i];
    return rs[(b.rr || 0) % rs.length];
  }

  function chooseRecipe(b, dry) {
    var rs = getRecipes(b);
    if (!rs.length) return null;
    var start = b.rr || 0;
    for (var k = 0; k < rs.length; k++) {
      var idx = (start + k) % rs.length;
      var r = rs[idx];
      var ok = true;
      if (r.mixedTotal) {
        var tot = 0;
        for (var mg = 0; mg < r.mixedGoods.length; mg++) tot += World.store[r.mixedGoods[mg]] || 0;
        if (tot < r.mixedTotal) ok = false;
      } else {
        for (var gk in r.in) if ((World.store[gk] || 0) < r.in[gk]) { ok = false; break; }
      }
      if (ok) {
        if (!dry) b.rr = (idx + 1) % rs.length;
        return { idx: idx, r: r };
      }
    }
    return null;
  }

  function consumeInputs(r) {
    if (r.mixedTotal) {
      var need = r.mixedTotal;
      var order = r.mixedGoods.slice().sort(function (a, b) {
        return (World.store[b] || 0) - (World.store[a] || 0);
      });
      for (var i = 0; i < order.length && need > 0; i++) {
        var good = order[i];
        var take = Math.min(need, World.store[good] || 0);
        if (take > 0) { World.store[good] -= take; need -= take; }
      }
      return;
    }
    for (var k in r.in) World.store[k] = Math.max(0, (World.store[k] || 0) - r.in[k]);
  }

  function startBatch(b, pick) {
    consumeInputs(pick.r);
    b.batch = { out: pick.r.out, material: pick.r.material || 0, cycle: pick.r.cycle, progress: 0 };
  }

  function completeBatch(b) {
    var bat = b.batch;
    b.batch = null;
    var g, gain = 0, i = 0;
    if (b.mode === 'sell') {
      for (g in bat.out) gain += (G[g].sell || 0) * bat.out[g];
    } else {
      for (g in bat.out) {
        World.store[g] = (World.store[g] || 0) + bat.out[g];
        spawnFx(b.x + b.w / 2, b.y + b.h / 2 - i * 0.6, '+' + bat.out[g] + ' ' + G[g].name, G[g].color);
        i++;
      }
    }
    if (bat.material) {
      World.material += bat.material;
      spawnFx(b.x + b.w / 2, b.y + b.h / 2 - i * 0.6, '+' + bat.material + ' 材料', '#c9e36a');
    }
    if (gain > 0) {
      World.gold += gain;
      World.totalEarned += gain;
      World.stats.sold++;
      spawnFx(b.x + b.w / 2, b.y + b.h / 2, '+' + Math.round(gain), '#e8cd82');
      if (root.SFX) root.SFX('sale');
    }
    World.stats.batches++;
  }

  function getYield(b) {
    if (b.type === 'manor') {
      return { storeText: '+' + C.BUILD.manor.income[lvIdx(b)].toFixed(1) + ' 金/秒', sellText: null, gold: C.BUILD.manor.income[lvIdx(b)] };
    }
    var rs = getRecipes(b);
    if (!rs.length) return null;
    var r = pickDisplayRecipe(b, rs);
    var parts = [];
    var gold = 0;
    for (var g in r.out) {
      var q = r.out[g] / r.cycle;
      parts.push({ good: g, text: '+' + (Math.round(q * 100) / 100) + G[g].name });
      gold += q * (G[g].sell || 0);
    }
    if (r.material) {
      parts.push({ good: null, text: '+' + (Math.round(r.material / r.cycle * 100) / 100) + '材料' });
    }
    var storeText = parts.map(function (p) { return p.text; }).join(' ');
    if (parts.length) storeText += (parts.length > 1 ? ' /秒' : '/秒');
    return {
      storeParts: parts,
      storeText: storeText,
      sellText: gold > 0 ? '+' + (Math.round(gold * 100) / 100) + '金/秒' : null,
      gold: gold
    };
  }

  function canSell(b) {
    var rs = getRecipes(b);
    if (!rs.length) return false;
    for (var i = 0; i < rs.length; i++) {
      if (sumObj(rs[i].out) > 0) return true;
    }
    return false;
  }

  function setMode(id, mode) {
    var b = byId(id);
    if (!b) return { ok: false, msg: '无效建筑' };
    if (mode === 'sell' && !canSell(b)) return { ok: false, msg: '该建筑产物不可出售' };
    b.mode = mode;
    return { ok: true };
  }

  function constructionTick(dt) {
    for (var i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (!b.constructing) continue;
      b.buildProgress += dt;
      if (b.buildProgress >= b.buildTime) {
        b.constructing = false;
        b.buildProgress = b.buildTime;
        World.stats.builds++;
        spawnFx(b.x + b.w / 2, b.y + b.h / 2, '建成', '#e8cd82');
        toast(C.BUILD[b.type].name + ' 建成，已开始生产');
        checkUnlocks();
        if (root.SFX) root.SFX('upgrade');
      }
    }
  }

  function productionTick(dt) {
    for (var i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (b.type === 'manor') {
        b.incomeAcc += C.BUILD.manor.income[lvIdx(b)] * dt;
        var whole = Math.floor(b.incomeAcc);
        if (whole > 0) {
          b.incomeAcc -= whole;
          World.gold += whole;
          World.totalEarned += whole;
        }
        continue;
      }
      if (b.type === 'market' || b.constructing) continue;
      if (b.batch) {
        b.batch.progress += dt;
        if (b.batch.progress >= b.batch.cycle) completeBatch(b);
      } else {
        var pick = chooseRecipe(b, false);
        if (pick) startBatch(b, pick);
      }
    }
  }

  function currentRent() {
    var t = C.RENT.table;
    if (World.rentIndex < t.length) return t[World.rentIndex];
    return Math.round(t[t.length - 1] * Math.pow(1.3, World.rentIndex - t.length + 1));
  }

  function rentTick(dt) {
    if (World.victory) return;
    if (World.overdue) {
      var need = currentRent();
      if (World.gold >= need) {
        World.gold -= need;
        World.overdue = null;
        World.rentIndex++;
        World.rentTimer = C.RENT.interval;
        toast('已补交租金 ' + need);
        if (root.SFX) root.SFX('pay');
      } else if (World.time >= World.overdue.deadline) {
        World.gameOver = true;
        World.gameOverReason = '欠租失败，经营结束';
      }
      return;
    }
    World.rentTimer -= dt;
    if (World.rentTimer <= 0) {
      var need2 = currentRent();
      if (World.gold >= need2) {
        World.gold -= need2;
        World.rentIndex++;
        World.rentTimer = C.RENT.interval;
        toast('自动交租 ' + need2);
        spawnFx(World.market.x + World.market.w / 2, World.market.y - 1, '-' + need2, '#ff9a8a');
        if (root.SFX) root.SFX('pay');
      } else {
        var first = !World.missedBefore;
        var grace = first ? C.RENT.graceFirst : C.RENT.graceLater;
        World.missedBefore = true;
        World.overdue = { deadline: World.time + grace, rent: need2, first: first };
        if (root.SFX) root.SFX('alarm');
      }
    }
  }

  function tick(dt) {
    if (World.gameOver || World.paused) return;
    dt *= World.speed;
    World.time += dt;
    rentTick(dt);
    constructionTick(dt);
    productionTick(dt);
    for (var i = World.fx.length - 1; i >= 0; i--) {
      World.fx[i].life -= dt;
      if (World.fx[i].life <= 0) World.fx.splice(i, 1);
    }
  }

  function canAfford(cost) {
    if (!cost) return true;
    return (cost.gold || 0) <= World.gold && (cost.material || 0) <= World.material;
  }

  function payCost(cost) {
    if (!canAfford(cost)) return false;
    World.gold -= cost.gold || 0;
    World.material -= cost.material || 0;
    return true;
  }

  function checkUnlocks() {
    var changed = [];
    for (var type in C.UNLOCK) {
      if (World.unlocked[type]) continue;
      var pre = C.UNLOCK[type];
      var ok = pre.length === 0;
      for (var i = 0; i < pre.length && !ok; i++) {
        for (var j = 0; j < World.buildings.length; j++) if (World.buildings[j].type === pre[i]) { ok = true; break; }
      }
      if (ok) { World.unlocked[type] = 1; changed.push(C.BUILD[type].name); }
    }
    for (i = 0; i < changed.length; i++) toast('解锁新建筑：' + changed[i]);
    return changed;
  }

  function tryBuild(type, x, y) {
    var d = C.BUILD[type];
    if (!d || !d.buildable) return { ok: false, msg: '该建筑不可建造' };
    if (!World.unlocked[type]) return { ok: false, msg: '尚未解锁：' + d.name };
    if (!canAfford(d.cost)) return { ok: false, msg: '资源不足' };
    var chk = canPlace(type, x, y, -1);
    if (!chk.ok) return { ok: false, msg: chk.msg };
    payCost(d.cost);
    var b = addBuilding(type, x, y, 1, false);
    if (root.SFX) root.SFX('build');
    return { ok: true, building: b };
  }

  function tryMove(id, x, y) {
    var b = byId(id);
    if (!b || !C.BUILD[b.type].buildable) return { ok: false, msg: '不可移动' };
    var chk = canPlace(b.type, x, y, id);
    if (!chk.ok) return { ok: false, msg: chk.msg };
    b.x = x;
    b.y = y;
    return { ok: true };
  }

  function tryDemolish(id) {
    var b = byId(id);
    if (!b || !C.BUILD[b.type].buildable) return { ok: false, msg: '不可拆除' };
    World.buildings = World.buildings.filter(function (x2) { return x2.id !== id; });
    var cost = C.BUILD[b.type].cost || {};
    var rg = Math.floor((cost.gold || 0) * C.REFUND);
    var rm = Math.floor((cost.material || 0) * C.REFUND);
    World.gold += rg;
    World.material += rm;
    return { ok: true, refundGold: rg, refundMat: rm };
  }

  function tryUpgrade(id) {
    var b = byId(id);
    if (!b) return { ok: false, msg: '无效建筑' };
    var d = C.BUILD[b.type];
    if (!d.upgrade) return { ok: false, msg: '不可升级' };
    if (b.level >= 5) return { ok: false, msg: '已达最高等级' };
    var cost = d.upgrade[b.level - 1];
    if (!canAfford({ gold: cost[0], material: cost[1] })) return { ok: false, msg: '金币或材料不足' };
    payCost({ gold: cost[0], material: cost[1] });
    b.level++;
    if (root.SFX) root.SFX('upgrade');
    return { ok: true };
  }

  function upgradeLines(b) {
    var d = C.BUILD[b.type];
    if (!d.upgrade || b.level >= 5) return [];
    var i = b.level - 1;
    var lines = [];
    function add(label, cur, next, suffix) {
      if (cur !== next) lines.push(label + ' ' + cur + ' → ' + next + (suffix || ''));
    }
    if (b.type === 'manor') {
      lines.push('金币/秒 ' + d.income[i] + ' → ' + d.income[i + 1]);
      return lines;
    }
    add('周期', d.cycle[i], d.cycle[i + 1], ' 秒');
    var g;
    if (d.mixedTotal) {
      add('材料', d.material[i], d.material[i + 1], ' /批');
      return lines;
    }
    if (b.type === 'farm') {
      var base = null;
      for (var fi = 0; fi < d.variants.length; fi++) if (!d.variants[fi].in) base = d.variants[fi];
      add('谷物', base.outQty[i], base.outQty[i + 1], ' /批');
      return lines;
    }
    if (d.variants) {
      var vv = d.variants[0];
      var inA = vv.inQty ? vv.inQty : d.inQty;
      var outA = vv.outQty ? vv.outQty : d.outQty;
      add('处理', inA[i], inA[i + 1]);
      add('产出', outA[i], outA[i + 1], ' /批');
      return lines;
    }
    if (d.outputs) for (g in d.outputs) add(G[g].name, d.outputs[g][i], d.outputs[g][i + 1], ' /批');
    if (d.inputs) for (g in d.inputs) add('耗' + G[g].name, d.inputs[g][i], d.inputs[g][i + 1]);
    return lines.slice(0, 4);
  }

  function getStatus(b) {
    if (b.type === 'manor') return { text: '被动收入', icon: '利', color: '#c9a04e' };
    if (b.type === 'market') return { text: '自动收购', icon: '市', color: '#7fa8b8' };
    if (b.constructing) return { text: '建造中', icon: '建', color: '#b8892f' };
    if (b.batch) return { text: b.mode === 'sell' ? '生产并出售' : '生产中', icon: '工', color: '#7fa8b8' };
    if (chooseRecipe(b, true)) return { text: '待生产', icon: '备', color: '#7ba05a' };
    return { text: '缺原料', icon: '缺', color: '#b8544a' };
  }

  function tryBuyLand() {
    if (World.victory) return { ok: false, msg: '已经买下土地' };
    if (World.overdue) return { ok: false, msg: '欠租期间不能买地' };
    if (World.gold < C.RENT.landPrice) return { ok: false, msg: '金币不足' };
    World.gold -= C.RENT.landPrice;
    World.victory = true;
    return { ok: true };
  }

  function sellGood(good) {
    var qty = World.store[good] || 0;
    if (qty <= 0) return { ok: false, msg: '仓库中没有' + G[good].name };
    var gain = (G[good].sell || 0) * qty;
    World.gold += gain;
    World.totalEarned += gain;
    World.stats.sold++;
    World.store[good] = 0;
    return { ok: true, gain: gain, qty: qty };
  }

  function storeValue() {
    var v = 0;
    for (var g in World.store) v += (World.store[g] || 0) * (G[g].sell || 0);
    return v;
  }

  function spawnFx(x, y, text, color) {
    World.fx.push({ x: x, y: y, text: text, color: color || '#ffe08a', life: 1.3 });
  }
  function toast(text) {
    World.toasts.push({ text: text, age: 0, born: Date.now() });
  }

  function makeDecor() {
    var r = rng(20261002);
    var d = [];
    var f = World.fence;
    var tries = 0;
    while (d.length < 34 && tries++ < 500) {
      var x = Math.floor(r() * World.W), y = Math.floor(r() * World.H);
      if (x >= f.x1 - 1 && x <= f.x2 + 1 && y >= f.y1 - 1 && y <= f.y2 + 2) continue;
      if (inMarket(x, y)) continue;
      d.push({ x: x, y: y, type: r() < 0.6 ? 'tree' : 'rock', s: 0.7 + r() * 0.5 });
    }
    World.decor = d;
  }

  World.reset = function () {
    World.buildings = [];
    World.store = {};
    World.fx = [];
    World.toasts = [];
    World.gold = C.RENT.initialGold;
    World.material = 0;
    World.rentIndex = 0;
    World.rentTimer = C.RENT.interval;
    World.overdue = null;
    World.missedBefore = false;
    World.unlocked = { lumber: 1, quarry: 1, workshop: 1, farm: 1 };
    World.time = 0;
    World.victory = false;
    World.gameOver = false;
    World.gameOverReason = '';
    World.paused = false;
    World.speed = 1;
    World.nextId = 1;
    World.totalEarned = 0;
    World.stats = { batches: 0, builds: 0, sold: 0 };
    makeDecor();
    addBuilding('manor', C.MAP.manorAt.x, C.MAP.manorAt.y, 1, true);
    checkUnlocks();
  };

  World.serialize = function () {
    return {
      buildings: World.buildings,
      store: World.store,
      gold: World.gold, material: World.material,
      rentIndex: World.rentIndex, rentTimer: World.rentTimer, overdue: World.overdue, missedBefore: World.missedBefore,
      unlocked: World.unlocked, time: World.time, victory: World.victory, gameOver: World.gameOver,
      gameOverReason: World.gameOverReason, nextId: World.nextId, totalEarned: World.totalEarned, stats: World.stats
    };
  };

  World.load = function (s) {
    if (!s || !s.buildings || !s.buildings.length) return false;
    World.buildings = s.buildings;
    World.store = s.store || {};
    World.gold = s.gold || 0;
    World.material = s.material || 0;
    World.rentIndex = s.rentIndex || 0;
    World.rentTimer = s.rentTimer === undefined ? C.RENT.interval : s.rentTimer;
    World.overdue = s.overdue || null;
    World.missedBefore = !!s.missedBefore;
    World.unlocked = s.unlocked || {};
    World.time = s.time || 0;
    World.victory = !!s.victory;
    World.gameOver = !!s.gameOver;
    World.gameOverReason = s.gameOverReason || '';
    World.nextId = s.nextId || (Date.now() % 100000);
    World.totalEarned = s.totalEarned || 0;
    World.stats = s.stats || { batches: 0, builds: 0, sold: 0 };
    World.paused = false;
    World.speed = 1;
    World.fx = [];
    World.toasts = [];
    makeDecor();
    for (var i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (b.constructing === undefined) b.constructing = false;
      if (b.buildProgress === undefined) b.buildProgress = 0;
      if (b.buildTime === undefined) b.buildTime = C.BUILD_TIME[b.type] || 0;
      if (b.incomeAcc === undefined) b.incomeAcc = 0;
      if (b.rr === undefined) b.rr = 0;
      if (b.mode === undefined) b.mode = 'store';
    }
    return true;
  };

  World.tick = tick;
  World.tryBuild = tryBuild;
  World.tryMove = tryMove;
  World.tryDemolish = tryDemolish;
  World.tryUpgrade = tryUpgrade;
  World.upgradeLines = upgradeLines;
  World.getStatus = getStatus;
  World.tryBuyLand = tryBuyLand;
  World.currentRent = currentRent;
  World.canPlace = canPlace;
  World.canAfford = canAfford;
  World.getRecipes = getRecipes;
  World.pickDisplayRecipe = pickDisplayRecipe;
  World.getYield = getYield;
  World.canSell = canSell;
  World.setMode = setMode;
  World.sellGood = sellGood;
  World.storeValue = storeValue;
  World.sumObj = sumObj;
  World.spawnFx = spawnFx;
  World.toast = toast;
  World.checkUnlocks = checkUnlocks;
  World.buildingAt = buildingAt;
  if (typeof module !== 'undefined') module.exports = World;
})();
