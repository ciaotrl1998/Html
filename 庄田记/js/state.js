(function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  var C = (typeof window !== 'undefined' && window.CFG) ? window.CFG : require('./config.js');
  var G = C.GOODS;
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  var World = {
    W: C.MAP.W,
    H: C.MAP.H,
    fence: C.MAP.fence,
    gap: C.MAP.gap,
    plot: C.MAP.plot,
    market: C.MAP.market,
    marketDrop: C.MAP.marketDrop,
    buildings: [],
    villagers: [],
    tasks: [],
    piles: [],
    fx: [],
    toasts: [],
    decor: [],
    gold: 0,
    material: 0,
    hired: 0,
    carryLv: 1,
    speedLv: 1,
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
    taskTimer: 0,
    totalEarned: 0,
    stats: { sales: 0, batches: 0, builds: 0 }
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
  function pileById(id) { for (var i = 0; i < World.piles.length; i++) if (World.piles[i].id === id) return World.piles[i]; return null; }
  function villagerById(id) { for (var i = 0; i < World.villagers.length; i++) if (World.villagers[i].id === id) return World.villagers[i]; return null; }
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

  function onFence(x, y) {
    var f = World.fence;
    var edge = false;
    if ((x === f.x1 || x === f.x2) && y >= f.y1 && y <= f.y2) edge = true;
    if ((y === f.y1 || y === f.y2) && x >= f.x1 && x <= f.x2) edge = true;
    if (!edge) return false;
    if (y === f.y2 && x >= World.gap.x && x < World.gap.x + World.gap.w) return false;
    return true;
  }

  function walkable(x, y) {
    if (x < 0 || y < 0 || x >= World.W || y >= World.H) return false;
    if (onFence(x, y)) return false;
    if (inMarket(x, y)) return false;
    if (buildingAt(x, y)) return false;
    return true;
  }

  function computePost(x, y, w, h) {
    var cand = [
      [Math.floor(x + w / 2), y + h],
      [x + w, Math.floor(y + h / 2)],
      [x - 1, Math.floor(y + h / 2)],
      [Math.floor(x + w / 2), y - 1]
    ];
    var i;
    for (i = 0; i < cand.length; i++) if (walkable(cand[i][0], cand[i][1])) return { x: cand[i][0], y: cand[i][1] };
    for (var r = 1; r < 16; r++) {
      for (var dx = -r; dx < w + r; dx++) {
        for (var dy = -r; dy < h + r; dy++) {
          if (!(dx === -r || dx === w + r - 1 || dy === -r || dy === h + r - 1)) continue;
          var px = x + dx, py = y + dy;
          if (walkable(px, py)) return { x: px, y: py };
        }
      }
    }
    return { x: x, y: y };
  }

  function findPath(sx, sy, tx, ty) {
    if (!walkable(tx, ty)) return null;
    var W = World.W;
    function key(x, y) { return y * W + x; }
    var open = [{ x: sx, y: sy, g: 0, f: Math.abs(tx - sx) + Math.abs(ty - sy), p: null }];
    var best = {};
    best[key(sx, sy)] = 0;
    var closed = {};
    var guard = 0;
    while (open.length && guard++ < 6000) {
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0];
      var ck = key(cur.x, cur.y);
      if (closed[ck]) continue;
      closed[ck] = true;
      if (cur.x === tx && cur.y === ty) {
        var path = [];
        var n = cur;
        while (n) { path.push({ x: n.x, y: n.y }); n = n.p; }
        path.reverse();
        return path;
      }
      for (var d = 0; d < 4; d++) {
        var nx = cur.x + DIRS[d][0], ny = cur.y + DIRS[d][1];
        if (!walkable(nx, ny)) continue;
        var nk = key(nx, ny);
        if (closed[nk]) continue;
        var ng = cur.g + 1;
        if (best[nk] !== undefined && best[nk] <= ng) continue;
        best[nk] = ng;
        open.push({ x: nx, y: ny, g: ng, f: ng + Math.abs(tx - nx) + Math.abs(ty - ny), p: cur });
      }
    }
    return null;
  }

  function blockCheck(extra) {
    var blocked = {};
    function mark(x, y) { blocked[y * World.W + x] = true; }
    var f = World.fence;
    for (var x = f.x1; x <= f.x2; x++) { mark(x, f.y1); mark(x, f.y2); }
    for (var y = f.y1; y <= f.y2; y++) { mark(f.x1, y); mark(f.x2, y); }
    for (var gi = 0; gi < World.gap.w; gi++) delete blocked[f.y2 * World.W + (World.gap.x + gi)];
    for (var i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (extra && extra.ignore === b.id) continue;
      for (var bx = b.x; bx < b.x + b.w; bx++) for (var by = b.y; by < b.y + b.h; by++) mark(bx, by);
    }
    for (var mx = 0; mx < World.market.w; mx++) for (var my = 0; my < World.market.h; my++) mark(World.market.x + mx, World.market.y + my);
    if (extra) for (var ex = extra.x; ex < extra.x + extra.w; ex++) for (var ey = extra.y; ey < extra.y + extra.h; ey++) mark(ex, ey);
    var seen = {};
    var q = [[World.marketDrop.x, World.marketDrop.y]];
    seen[World.marketDrop.y * World.W + World.marketDrop.x] = true;
    while (q.length) {
      var p = q.shift();
      for (var d = 0; d < 4; d++) {
        var nx2 = p[0] + DIRS[d][0], ny2 = p[1] + DIRS[d][1];
        if (nx2 < 0 || ny2 < 0 || nx2 >= World.W || ny2 >= World.H) continue;
        var k = ny2 * World.W + nx2;
        if (blocked[k] || seen[k]) continue;
        seen[k] = true;
        q.push([nx2, ny2]);
      }
    }
    for (i = 0; i < World.buildings.length; i++) {
      b = World.buildings[i];
      if (extra && extra.ignore === b.id) continue;
      if (!seen[b.post.y * World.W + b.post.x]) return false;
    }
    if (extra && extra.post && !seen[extra.post.y * World.W + extra.post.x]) return false;
    return true;
  }

  function canPlace(type, x, y, ignoreId) {
    var d = C.BUILD[type];
    if (!d || !d.buildable) return { ok: false, msg: '不可建造' };
    var w = d.size[0], h = d.size[1];
    var p = World.plot;
    if (x < p.x || y < p.y || x + w > p.x + p.w || y + h > p.y + p.h) return { ok: false, msg: '超出地块范围' };
    var i;
    for (i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (b.id === ignoreId) continue;
      if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return { ok: false, msg: '与建筑重叠' };
      if (b.post.x >= x && b.post.x < x + w && b.post.y >= y && b.post.y < y + h) return { ok: false, msg: '挡住通道' };
    }
    if (World.marketDrop.x >= x && World.marketDrop.x < x + w && World.marketDrop.y >= y && World.marketDrop.y < y + h) return { ok: false, msg: '挡住市场通道' };
    for (i = 0; i < World.piles.length; i++) {
      var pl = World.piles[i];
      if (pl.x >= x && pl.x < x + w && pl.y >= y && pl.y < y + h) return { ok: false, msg: '料堆待清理' };
    }
    for (i = 0; i < World.villagers.length; i++) {
      var v = World.villagers[i];
      var vx = Math.round(v.x), vy = Math.round(v.y);
      if (vx >= x && vx < x + w && vy >= y && vy < y + h) return { ok: false, msg: '有人占位' };
    }
    var post = computePost(x, y, w, h);
    if (post.x >= x && post.x < x + w && post.y >= y && post.y < y + h) return { ok: false, msg: '没有可通行的交互位置' };
    if (!blockCheck({ x: x, y: y, w: w, h: h, ignore: ignoreId, post: post })) return { ok: false, msg: '会封死出行路线' };
    return { ok: true, post: post };
  }

  function addBuilding(type, x, y, level) {
    var d = C.BUILD[type];
    var w = d.size[0], h = d.size[1];
    var b = {
      id: World.nextId++, type: type, x: x, y: y, w: w, h: h,
      level: level || 1,
      input: {}, out: {}, reservedIn: {}, reservedOut: {},
      batch: null, rr: 0,
      post: computePost(x, y, w, h),
      incomeAcc: 0
    };
    World.buildings.push(b);
    if (d.buildable) World.stats.builds++;
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

  function inCap(b) { var d = C.BUILD[b.type]; return d && d.inCap ? d.inCap[lvIdx(b)] : 0; }
  function outCap(b) { var d = C.BUILD[b.type]; return d && d.outCap ? d.outCap[lvIdx(b)] : 0; }
  function inputFree(b) { return Math.max(0, inCap(b) - sumObj(b.input) - sumObj(b.reservedIn)); }

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
        for (var mg = 0; mg < r.mixedGoods.length; mg++) tot += b.input[r.mixedGoods[mg]] || 0;
        if (tot < r.mixedTotal) ok = false;
      } else {
        for (var gk in r.in) if ((b.input[gk] || 0) < r.in[gk]) { ok = false; break; }
      }
      if (ok) {
        var need = sumObj(r.out);
        if (need > 0 && sumObj(b.out) + need > outCap(b)) ok = false;
      }
      if (ok) {
        if (!dry) b.rr = (idx + 1) % rs.length;
        return { idx: idx, r: r };
      }
    }
    return null;
  }

  function consumeInputs(b, r) {
    if (r.mixedTotal) {
      var need = r.mixedTotal;
      for (var g = 0; g < r.mixedGoods.length && need > 0; g++) {
        var good = r.mixedGoods[g];
        var take = Math.min(need, b.input[good] || 0);
        if (take > 0) { b.input[good] -= take; need -= take; }
      }
      return;
    }
    for (var k in r.in) b.input[k] = Math.max(0, (b.input[k] || 0) - r.in[k]);
  }

  function startBatch(b, pick) {
    consumeInputs(b, pick.r);
    b.batch = { out: pick.r.out, material: pick.r.material || 0, cycle: pick.r.cycle, progress: 0 };
  }

  function completeBatch(b) {
    var bat = b.batch;
    b.batch = null;
    for (var g in bat.out) b.out[g] = (b.out[g] || 0) + bat.out[g];
    if (bat.material) {
      World.material += bat.material;
      spawnFx(b.x + b.w / 2, b.y + b.h / 2, '+' + bat.material + '材料', '#c9e36a');
    }
    World.stats.batches++;
  }

  function carryCap() { return C.VILLAGER.carry[World.carryLv - 1]; }
  function speedMult() { return C.VILLAGER.speed[World.speedLv - 1]; }
  function distTiles(x1, y1, x2, y2) { return Math.abs(x1 - x2) + Math.abs(y1 - y2); }

  function entity(kind, id) {
    if (kind === 'building') return byId(id);
    if (kind === 'pile') return pileById(id);
    return null;
  }

  function availableOut(e, g) {
    if (!e) return 0;
    var stock = e.out ? (e.out[g] || 0) : (e.goods ? (e.goods[g] || 0) : 0);
    var res = e.reservedOut ? (e.reservedOut[g] || 0) : 0;
    return Math.max(0, stock - res);
  }

  function reserveSrc(t) {
    var e = entity(t.src.kind, t.src.id);
    if (e) { e.reservedOut = e.reservedOut || {}; e.reservedOut[t.good] = (e.reservedOut[t.good] || 0) + t.qty; }
  }
  function releaseSrc(t) {
    var e = entity(t.src.kind, t.src.id);
    if (e && e.reservedOut && e.reservedOut[t.good]) e.reservedOut[t.good] = Math.max(0, e.reservedOut[t.good] - t.qty);
  }
  function reserveDst(t) {
    if (t.dst.kind !== 'building') return;
    var e = byId(t.dst.id);
    if (e) e.reservedIn[t.good] = (e.reservedIn[t.good] || 0) + t.qty;
  }
  function releaseDst(t) {
    if (t.dst.kind !== 'building') return;
    var e = byId(t.dst.id);
    if (e && e.reservedIn[t.good]) e.reservedIn[t.good] = Math.max(0, e.reservedIn[t.good] - t.qty);
  }

  function taskExists(sk, sid, dk, did, good) {
    for (var i = 0; i < World.tasks.length; i++) {
      var t = World.tasks[i];
      if (t.src.kind === sk && t.src.id === sid && t.dst.kind === dk && t.dst.id === did && t.good === good) return true;
    }
    return false;
  }

  function createHaul(sk, sid, dk, did, good, qty) {
    var t = { id: World.nextId++, src: { kind: sk, id: sid }, dst: { kind: dk, id: did }, good: good, qty: qty, claimedBy: null };
    reserveSrc(t);
    reserveDst(t);
    World.tasks.push(t);
    return t;
  }

  function finishTask(t) {
    World.tasks = World.tasks.filter(function (x) { return x.id !== t.id; });
  }

  function cancelTask(t) {
    releaseSrc(t);
    releaseDst(t);
    if (t.claimedBy) {
      var v = villagerById(t.claimedBy);
      if (v && v.taskId === t.id) {
        v.taskId = null;
        if (!v.carry) { v.state = 'idle'; v.path = null; }
      }
    }
    finishTask(t);
  }

  function retargetToMarket(t) {
    releaseDst(t);
    t.dst = { kind: 'market', id: 0 };
  }

  function accepts(d, g) {
    var rs = getRecipes(d);
    for (var i = 0; i < rs.length; i++) {
      if (rs[i].mixedGoods && rs[i].mixedGoods.indexOf(g) >= 0) return true;
      if (rs[i].in[g]) return true;
    }
    return false;
  }

  function needFor(d, g) {
    var rs = getRecipes(d);
    var need = 0;
    for (var i = 0; i < rs.length; i++) {
      if (rs[i].mixedGoods && rs[i].mixedGoods.indexOf(g) >= 0) need = Math.max(need, rs[i].mixedTotal);
      if (rs[i].in[g]) need = Math.max(need, rs[i].in[g]);
    }
    return need;
  }

  function hasWorkers(b) {
    for (var i = 0; i < World.villagers.length; i++) if (World.villagers[i].assigned === b.id) return true;
    return false;
  }

  function marketWorkerCount() {
    var n = 0;
    for (var i = 0; i < World.villagers.length; i++) if (World.villagers[i].assigned === 'market') n++;
    return n;
  }

  function fillNeed(b, g, deficit) {
    for (var si = 0; si < World.buildings.length && deficit > 0; si++) {
      var s = World.buildings[si];
      if (s.id === b.id) continue;
      var av = availableOut(s, g);
      if (av <= 0) continue;
      if (taskExists('building', s.id, 'building', b.id, g)) continue;
      var free = inputFree(b);
      if (free <= 0) break;
      var q = Math.min(deficit, av, carryCap(), free);
      if (q <= 0) continue;
      createHaul('building', s.id, 'building', b.id, g, q);
      deficit -= q;
    }
    return deficit;
  }

  function updateTasks() {
    var mw = marketWorkerCount();
    var bi, ri, di;
    for (bi = 0; bi < World.buildings.length; bi++) {
      var b = World.buildings[bi];
      var d = C.BUILD[b.type];
      if (!d.buildable) continue;
      var workers = hasWorkers(b);
      var rs = getRecipes(b);
      if (workers) {
        for (ri = 0; ri < rs.length; ri++) {
          var r = rs[ri];
          if (r.mixedTotal) {
            var total = 0, inRes = 0, mg;
            for (mg = 0; mg < r.mixedGoods.length; mg++) {
              total += b.input[r.mixedGoods[mg]] || 0;
              inRes += b.reservedIn[r.mixedGoods[mg]] || 0;
            }
            var deficit = Math.min(r.mixedTotal, carryCap()) - total - inRes;
            for (mg = 0; mg < r.mixedGoods.length && deficit > 0; mg++) {
              deficit = fillNeed(b, r.mixedGoods[mg], deficit);
            }
          } else {
            for (var gk in r.in) {
              var def = Math.min(r.in[gk], carryCap()) - (b.input[gk] || 0) - (b.reservedIn[gk] || 0);
              if (def > 0) fillNeed(b, gk, def);
            }
          }
        }
      }
      var allowSell = workers || mw > 0;
      for (var og in b.out) {
        var av = availableOut(b, og);
        if (av <= 0) continue;
        for (di = 0; di < World.buildings.length && av > 0; di++) {
          var dst = World.buildings[di];
          if (dst.id === b.id) continue;
          if (!hasWorkers(dst)) continue;
          if (!accepts(dst, og)) continue;
          var target = needFor(dst, og);
          var room = target - (dst.input[og] || 0) - (dst.reservedIn[og] || 0);
          var free = inputFree(dst);
          if (room <= 0 || free <= 0) continue;
          var q = Math.min(av, room, free, carryCap());
          if (q > 0 && !taskExists('building', b.id, 'building', dst.id, og)) {
            createHaul('building', b.id, 'building', dst.id, og, q);
            av -= q;
          }
        }
        if (allowSell && av > 0 && !taskExists('building', b.id, 'market', 0, og)) {
          createHaul('building', b.id, 'market', 0, og, Math.min(av, carryCap()));
        }
      }
    }
    for (var pi = 0; pi < World.piles.length; pi++) {
      var pile = World.piles[pi];
      for (var pg in pile.goods) {
        var pav = availableOut(pile, pg);
        if (pav > 0 && !taskExists('pile', pile.id, 'market', 0, pg)) {
          createHaul('pile', pile.id, 'market', 0, pg, Math.min(pav, carryCap()));
        }
      }
    }
    World.tasks = World.tasks.filter(function (t) {
      if (t.src.kind === 'building' && !byId(t.src.id)) return false;
      if (t.src.kind === 'pile' && !pileById(t.src.id)) return false;
      if (t.dst.kind === 'building' && !byId(t.dst.id)) return false;
      return true;
    });
  }

  function spawnFx(x, y, text, color) {
    World.fx.push({ x: x, y: y, text: text, color: color || '#ffe08a', life: 1.3 });
  }
  function toast(text) {
    World.toasts.push({ text: text, age: 0, born: Date.now() });
  }

  function goTo(v, tx, ty) {
    var path = findPath(Math.round(v.x), Math.round(v.y), tx, ty);
    if (path && path.length) { v.path = path; return true; }
    v.path = null;
    return false;
  }

  function pickupTile(t) {
    if (t.src.kind === 'building') { var b = byId(t.src.id); return b ? b.post : null; }
    var p = pileById(t.src.id);
    return p ? { x: p.x, y: p.y } : null;
  }

  function dropTile(t) {
    if (t.dst.kind === 'building') { var b = byId(t.dst.id); return b ? b.post : World.marketDrop; }
    return World.marketDrop;
  }

  function claimableTasks(v) {
    var out = [];
    for (var i = 0; i < World.tasks.length; i++) {
      var t = World.tasks[i];
      if (t.claimedBy) continue;
      if (v.assigned === 'market') {
        if (t.dst.kind === 'market') out.push(t);
      } else if (v.assigned) {
        if (t.dst.kind === 'building' && t.dst.id === v.assigned) out.push(t);
        else if (t.src.kind === 'building' && t.src.id === v.assigned) out.push(t);
        else if (t.src.kind === 'pile' && t.dst.kind === 'market') out.push(t);
      }
    }
    return out;
  }

  function taskScore(v, t) {
    var s = 0;
    if (v.assigned === 'market') {
      if (t.src.kind === 'building') {
        var b = byId(t.src.id);
        if (b && outCap(b) > 0 && sumObj(b.out) >= outCap(b) * 0.85) s -= 60;
      }
    } else if (v.assigned) {
      if (t.dst.kind === 'building' && t.dst.id === v.assigned) s -= 100;
      else if (t.src.kind === 'building' && t.src.id === v.assigned) s -= 50;
      else s += 40;
    }
    var p = pickupTile(t);
    if (p) s += distTiles(v.x, v.y, p.x, p.y);
    return s;
  }

  function claim(v) {
    var list = claimableTasks(v);
    if (!list.length) return false;
    list.sort(function (a, b) { return taskScore(v, a) - taskScore(v, b); });
    var t = list[0];
    var p = pickupTile(t);
    if (!p) { cancelTask(t); return false; }
    if (!goTo(v, p.x, p.y)) return false;
    t.claimedBy = v.id;
    v.taskId = t.id;
    v.state = 'toPickup';
    return true;
  }

  function decide(v) {
    if (v.taskId) return;
    if (v.assigned === 'market') { claim(v); return; }
    if (v.assigned) {
      var b = byId(v.assigned);
      if (!b) { v.assigned = null; return; }
      if (v.state === 'post' || v.state === 'toPost') return;
      claim(v);
    }
  }

  function onArrive(v) {
    if (v.state === 'toPost') { v.state = 'post'; return; }
    if (v.state === 'toPickup') { doPickup(v); return; }
    if (v.state === 'toDrop') { doDrop(v); return; }
    v.state = 'idle';
  }

  function doPickup(v) {
    var t = null;
    for (var i = 0; i < World.tasks.length; i++) if (World.tasks[i].id === v.taskId) t = World.tasks[i];
    if (!t) { v.taskId = null; v.state = 'idle'; return; }
    var se = entity(t.src.kind, t.src.id);
    if (!se) { cancelTask(t); v.taskId = null; v.state = 'idle'; return; }
    var take = Math.min(t.qty, availableOut(se, t.good), carryCap());
    if (take <= 0) { cancelTask(t); v.taskId = null; v.state = 'idle'; return; }
    if (t.src.kind === 'building') se.out[t.good] = Math.max(0, (se.out[t.good] || 0) - take);
    else se.goods[t.good] = Math.max(0, (se.goods[t.good] || 0) - take);
    se.reservedOut[t.good] = Math.max(0, (se.reservedOut[t.good] || 0) - take);
    t.qty -= take;
    v.carry = { good: t.good, qty: take };
    if (se.goods) {
      var empty = true;
      for (var g in se.goods) if (se.goods[g] > 0) empty = false;
      if (empty) World.piles = World.piles.filter(function (p) { return p.id !== se.id; });
    }
    var dp = dropTile(t);
    if (dp && goTo(v, dp.x, dp.y)) { v.state = 'toDrop'; return; }
    doDrop(v);
  }

  function doDrop(v) {
    var t = null;
    for (var i = 0; i < World.tasks.length; i++) if (World.tasks[i].id === v.taskId) t = World.tasks[i];
    if (!v.carry) { if (t) cancelTask(t); v.taskId = null; v.state = 'idle'; return; }
    if (!t) {
      var gain = G[v.carry.good].sell * v.carry.qty;
      World.gold += gain;
      World.totalEarned += gain;
      v.carry = null;
      v.state = 'idle';
      return;
    }
    if (t.dst.kind === 'market') {
      var g1 = G[v.carry.good].sell * v.carry.qty;
      World.gold += g1;
      World.totalEarned += g1;
      World.stats.sales++;
      spawnFx(World.marketDrop.x, World.marketDrop.y - 0.6, '+' + g1, '#ffe08a');
      if (root.SFX) root.SFX('sale');
    } else {
      var de = byId(t.dst.id);
      if (de) {
        de.input[v.carry.good] = (de.input[v.carry.good] || 0) + v.carry.qty;
        de.reservedIn[v.carry.good] = Math.max(0, (de.reservedIn[v.carry.good] || 0) - v.carry.qty);
      } else {
        var g2 = G[v.carry.good].sell * v.carry.qty;
        World.gold += g2;
        World.totalEarned += g2;
      }
    }
    v.carry = null;
    if (t.qty > 0) {
      var p = pickupTile(t);
      if (p && goTo(v, p.x, p.y)) { v.state = 'toPickup'; return; }
    }
    finishTask(t);
    v.taskId = null;
    v.state = 'idle';
  }

  function villagerTick(v, dt) {
    if (v.assigned && v.assigned !== 'market' && !byId(v.assigned)) v.assigned = null;
    if (v.state === 'post' && (!v.assigned || v.assigned !== v.postId)) { v.state = 'idle'; v.path = null; }
    if (v.path && v.path.length) {
      var remain = C.VILLAGER.baseSpeed * speedMult() * dt;
      while (remain > 0 && v.path.length) {
        var t = v.path[0];
        var dx = t.x - v.x, dy = t.y - v.y;
        var d = Math.hypot(dx, dy);
        if (d <= remain) { v.x = t.x; v.y = t.y; remain -= d; v.path.shift(); }
        else { v.x += dx / d * remain; v.y += dy / d * remain; remain = 0; }
      }
      if (v.path && v.path.length === 0) { v.path = null; onArrive(v); }
      if (v.path && v.path.length) return;
      if (v.state === 'toPickup' || v.state === 'toDrop' || v.state === 'toPost') return;
    }
    if (v.path && v.path.length === 0) v.path = null;
    if (v.state === 'post') return;
    if (v.state === 'idle' && !v.taskId) decide(v);
  }

  function wantsProducer(b) {
    if (b.batch) return true;
    return !!chooseRecipe(b, true);
  }

  function producerTick() {
    for (var i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (b.type === 'manor' || b.type === 'market' || !C.BUILD[b.type].buildable) continue;
      var workers = [];
      for (var j = 0; j < World.villagers.length; j++) if (World.villagers[j].assigned === b.id) workers.push(World.villagers[j]);
      var want = wantsProducer(b);
      if (want) {
        var has = false;
        for (j = 0; j < workers.length; j++) if (workers[j].state === 'post' || workers[j].state === 'toPost') { has = true; break; }
        if (!has) {
          var best = null, bd = 1e9;
          for (j = 0; j < workers.length; j++) {
            var w = workers[j];
            if (w.state !== 'idle' || w.taskId || w.carry) continue;
            var dd = distTiles(w.x, w.y, b.post.x, b.post.y);
            if (dd < bd) { bd = dd; best = w; }
          }
          if (best && goTo(best, b.post.x, b.post.y)) { best.state = 'toPost'; best.postId = b.id; }
        }
      } else {
        for (j = 0; j < workers.length; j++) {
          var w2 = workers[j];
          if (w2.state === 'post' || w2.state === 'toPost') { w2.state = 'idle'; w2.path = null; w2.postId = null; }
        }
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
      if (b.type === 'market') continue;
      var attending = false;
      for (var j = 0; j < World.villagers.length; j++) {
        if (World.villagers[j].assigned === b.id && World.villagers[j].state === 'post') { attending = true; break; }
      }
      if (b.batch) {
        if (attending) {
          b.batch.progress += dt;
          if (b.batch.progress >= b.batch.cycle) completeBatch(b);
        }
      } else if (attending) {
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
        spawnFx(World.marketDrop.x, World.marketDrop.y - 1, '-' + need2, '#ff9a8a');
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
    World.taskTimer -= dt;
    if (World.taskTimer <= 0) { updateTasks(); World.taskTimer = 0.3; }
    producerTick();
    for (var i = 0; i < World.villagers.length; i++) villagerTick(World.villagers[i], dt);
    productionTick(dt);
    for (i = World.fx.length - 1; i >= 0; i--) {
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
    var b = addBuilding(type, x, y, 1);
    checkUnlocks();
    if (root.SFX) root.SFX('build');
    return { ok: true, building: b };
  }

  function rerouteBuilding(id) {
    var i;
    for (i = 0; i < World.villagers.length; i++) {
      var v = World.villagers[i];
      if (v.assigned !== id) continue;
      if (v.state === 'post') v.state = 'idle';
      if (v.state === 'toPost') { v.state = 'idle'; v.path = null; }
    }
    for (i = 0; i < World.tasks.length; i++) {
      var t = World.tasks[i];
      if (!t.claimedBy) continue;
      var isSrc = t.src.kind === 'building' && t.src.id === id;
      var isDst = t.dst.kind === 'building' && t.dst.id === id;
      if (!isSrc && !isDst) continue;
      var vv = villagerById(t.claimedBy);
      if (!vv) continue;
      var target = vv.state === 'toDrop' ? dropTile(t) : (vv.state === 'toPickup' ? pickupTile(t) : null);
      if (target) goTo(vv, target.x, target.y);
    }
  }

  function tryMove(id, x, y) {
    var b = byId(id);
    if (!b || !C.BUILD[b.type].buildable) return { ok: false, msg: '不可移动' };
    var chk = canPlace(b.type, x, y, id);
    if (!chk.ok) return { ok: false, msg: chk.msg };
    b.x = x; b.y = y;
    b.post = computePost(x, y, b.w, b.h);
    rerouteBuilding(b.id);
    return { ok: true };
  }

  function tryDemolish(id) {
    var b = byId(id);
    if (!b || !C.BUILD[b.type].buildable) return { ok: false, msg: '不可拆除' };
    var i;
    for (i = World.tasks.length - 1; i >= 0; i--) {
      var t = World.tasks[i];
      var hit = (t.src.kind === 'building' && t.src.id === id) || (t.dst.kind === 'building' && t.dst.id === id);
      if (!hit) continue;
      if (t.claimedBy) {
        var v = villagerById(t.claimedBy);
        if (v && v.carry && t.dst.kind === 'building' && t.dst.id === id) { retargetToMarket(t); continue; }
        if (v && v.carry && t.src.kind === 'building' && t.src.id === id) { finishTask(t); continue; }
      }
      cancelTask(t);
    }
    for (i = 0; i < World.villagers.length; i++) {
      var v2 = World.villagers[i];
      if (v2.assigned !== id) continue;
      v2.assigned = null; v2.state = 'idle'; v2.path = null; v2.postId = null;
      if (v2.carry) {
        var gain0 = G[v2.carry.good].sell * v2.carry.qty;
        World.gold += gain0;
        World.totalEarned += gain0;
        v2.carry = null;
      }
    }
    var goods = {};
    var g;
    for (g in b.input) goods[g] = (goods[g] || 0) + b.input[g];
    for (g in b.out) goods[g] = (goods[g] || 0) + b.out[g];
    if (b.batch) for (g in b.batch.out) goods[g] = (goods[g] || 0) + b.batch.out[g];
    var has = false;
    for (g in goods) if (goods[g] > 0) has = true;
    if (has) World.piles.push({ id: World.nextId++, x: Math.floor(b.x + b.w / 2), y: Math.floor(b.y + b.h / 2), goods: goods, reservedOut: {} });
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

  function upgradePreview(b) {
    var d = C.BUILD[b.type];
    if (!d.upgrade || b.level >= 5) return '已满级';
    var i = b.level - 1;
    if (b.type === 'manor') return '金币/秒 ' + d.income[i] + ' → ' + d.income[i + 1];
    if (d.mixedTotal) return '周期 ' + d.cycle[i] + '→' + d.cycle[i + 1] + '秒，材料 ' + d.material[i] + '→' + d.material[i + 1] + '/批，输入容量 ' + d.inCap[i] + '→' + d.inCap[i + 1];
    if (b.type === 'farm') {
      var base = null;
      for (var fi = 0; fi < d.variants.length; fi++) if (!d.variants[fi].in) base = d.variants[fi];
      return '周期 ' + d.cycle[i] + '→' + d.cycle[i + 1] + '秒，谷物 ' + base.outQty[i] + '→' + base.outQty[i + 1] + '/批，施肥+2';
    }
    if (d.variants) {
      var vv = d.variants[0];
      for (var vi = 0; vi < d.variants.length; vi++) if (!d.variants[vi].in) vv = d.variants[vi];
      var inA = vv.inQty ? vv.inQty : d.inQty;
      var outA = vv.outQty ? vv.outQty : d.outQty;
      return '周期 ' + d.cycle[i] + '→' + d.cycle[i + 1] + '秒，处理 ' + inA[i] + '→' + inA[i + 1] + '，产出 ' + outA[i] + '→' + outA[i + 1] + '/批';
    }
    var parts = ['周期 ' + d.cycle[i] + '→' + d.cycle[i + 1] + '秒'];
    var g;
    for (g in d.outputs) parts.push(G[g].name + ' ' + d.outputs[g][i] + '→' + d.outputs[g][i + 1] + '/批');
    if (d.inputs) for (g in d.inputs) parts.push('耗' + G[g].name + ' ' + d.inputs[g][i] + '→' + d.inputs[g][i + 1]);
    if (d.outCap) parts.push('输出容量 ' + d.outCap[i] + '→' + d.outCap[i + 1]);
    return parts.join('，');
  }

  function hireCost() { return C.RENT.hireBase + C.RENT.hireStep * Math.max(0, World.hired - 2); }

  function spawnVillager() {
    var manor = null;
    for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].type === 'manor') manor = World.buildings[i];
    var px = manor ? manor.x - 1 : World.plot.x + 1;
    var py = manor ? manor.y + manor.h : World.plot.y + 2;
    var name = C.VILLAGER.names[(World.hired + World.nextId) % C.VILLAGER.names.length];
    var v = {
      id: World.nextId++, name: name, x: px, y: py, path: null,
      assigned: null, state: 'idle', taskId: null, carry: null, postId: null, bob: Math.random() * Math.PI * 2
    };
    World.villagers.push(v);
    return v;
  }

  function hireVillager() {
    var cost = hireCost();
    if (World.gold < cost) return { ok: false, msg: '金币不足' };
    World.gold -= cost;
    World.hired++;
    spawnVillager();
    if (root.SFX) root.SFX('hire');
    return { ok: true };
  }

  function assignTo(bid) {
    var target;
    if (bid === 'market') target = World.marketDrop;
    else {
      var b = byId(bid);
      if (!b) return { ok: false, msg: '无效建筑' };
      target = b.post;
    }
    var best = null, bd = 1e9;
    for (var i = 0; i < World.villagers.length; i++) {
      var v = World.villagers[i];
      if (v.assigned) continue;
      var d = distTiles(v.x, v.y, target.x, target.y);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return { ok: false, msg: '没有空闲村民' };
    best.assigned = bid;
    best.state = 'idle';
    best.postId = null;
    best.path = null;
    if (bid === 'market') goTo(best, World.marketDrop.x, World.marketDrop.y);
    else goTo(best, target.x, target.y);
    return { ok: true, villager: best };
  }

  function unassignFrom(bid) {
    for (var i = World.villagers.length - 1; i >= 0; i--) {
      var v = World.villagers[i];
      if (v.assigned !== bid) continue;
      v.assigned = null;
      v.state = 'idle';
      v.path = null;
      v.postId = null;
      return { ok: true, villager: v };
    }
    return { ok: false, msg: '没有可撤回的村民' };
  }

  function assignedCount(bid) {
    var n = 0;
    for (var i = 0; i < World.villagers.length; i++) if (World.villagers[i].assigned === bid) n++;
    return n;
  }

  function idleCount() {
    var n = 0;
    for (var i = 0; i < World.villagers.length; i++) if (!World.villagers[i].assigned) n++;
    return n;
  }

  function tryUpgradeCarry() {
    if (World.carryLv >= 5) return { ok: false, msg: '载重已满级' };
    var c = C.VILLAGER.upgrade[World.carryLv - 1];
    if (!canAfford({ gold: c[0], material: c[1] })) return { ok: false, msg: '金币或材料不足' };
    payCost({ gold: c[0], material: c[1] });
    World.carryLv++;
    if (root.SFX) root.SFX('upgrade');
    return { ok: true };
  }

  function tryUpgradeSpeed() {
    if (World.speedLv >= 5) return { ok: false, msg: '速度已满级' };
    var c = C.VILLAGER.upgrade[World.speedLv - 1];
    if (!canAfford({ gold: c[0], material: c[1] })) return { ok: false, msg: '金币或材料不足' };
    payCost({ gold: c[0], material: c[1] });
    World.speedLv++;
    if (root.SFX) root.SFX('upgrade');
    return { ok: true };
  }

  function getStatus(b) {
    if (b.type === 'manor') return { text: '被动收入中', icon: '利', color: '#c9a04e' };
    if (b.type === 'market') return { text: World.villagers.some(function (v) { return v.assigned === 'market'; }) ? '市场运转中' : '无人指派', icon: '市', color: '#7fa8b8' };
    var workers = assignedCount(b.id);
    if (!workers) return { text: '无人指派', icon: '闲', color: '#a89a80' };
    if (b.batch) return { text: '生产中', icon: '工', color: '#7fa8b8' };
    var rs = getRecipes(b);
    var missing = false, outFull = false;
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      var ok = true;
      if (r.mixedTotal) {
        var tot = 0;
        for (var mg = 0; mg < r.mixedGoods.length; mg++) tot += b.input[r.mixedGoods[mg]] || 0;
        if (tot < r.mixedTotal) ok = false;
      } else {
        for (var gk in r.in) if ((b.input[gk] || 0) < r.in[gk]) ok = false;
      }
      if (ok) {
        if (sumObj(b.out) + sumObj(r.out) <= outCap(b)) return { text: '待开工', icon: '备', color: '#7ba05a' };
        outFull = true;
      } else missing = true;
    }
    if (outFull) return { text: '输出空间不足', icon: '满', color: '#c07a4a' };
    if (missing) return { text: '缺输入', icon: '缺', color: '#b8544a' };
    return { text: '等待生产者', icon: '等', color: '#9a8a70' };
  }

  function tryBuyLand() {
    if (World.victory) return { ok: false, msg: '已经买下土地' };
    if (World.overdue) return { ok: false, msg: '欠租期间不能买地' };
    if (World.gold < C.RENT.landPrice) return { ok: false, msg: '金币不足' };
    World.gold -= C.RENT.landPrice;
    World.victory = true;
    return { ok: true };
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
    World.villagers = [];
    World.tasks = [];
    World.piles = [];
    World.fx = [];
    World.toasts = [];
    World.gold = C.RENT.initialGold;
    World.material = 0;
    World.hired = 0;
    World.carryLv = 1;
    World.speedLv = 1;
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
    World.taskTimer = 0;
    World.totalEarned = 0;
    World.stats = { sales: 0, batches: 0, builds: 0 };
    makeDecor();
    addBuilding('manor', C.MAP.manorAt.x, C.MAP.manorAt.y, 1);
    spawnVillager();
    spawnVillager();
    checkUnlocks();
    updateTasks();
  };

  World.serialize = function () {
    return {
      buildings: World.buildings, villagers: World.villagers, tasks: World.tasks, piles: World.piles,
      gold: World.gold, material: World.material, hired: World.hired, carryLv: World.carryLv, speedLv: World.speedLv,
      rentIndex: World.rentIndex, rentTimer: World.rentTimer, overdue: World.overdue, missedBefore: World.missedBefore,
      unlocked: World.unlocked, time: World.time, victory: World.victory, gameOver: World.gameOver,
      gameOverReason: World.gameOverReason, nextId: World.nextId, totalEarned: World.totalEarned, stats: World.stats
    };
  };

  World.load = function (s) {
    if (!s || !s.buildings || !s.buildings.length) return false;
    World.buildings = s.buildings;
    World.villagers = s.villagers || [];
    World.tasks = s.tasks || [];
    World.piles = s.piles || [];
    World.gold = s.gold || 0;
    World.material = s.material || 0;
    World.hired = s.hired || 0;
    World.carryLv = s.carryLv || 1;
    World.speedLv = s.speedLv || 1;
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
    World.stats = s.stats || { sales: 0, batches: 0, builds: 0 };
    World.paused = false;
    World.speed = 1;
    World.taskTimer = 0;
    World.fx = [];
    World.toasts = [];
    makeDecor();
    for (var i = 0; i < World.villagers.length; i++) {
      var v = World.villagers[i];
      if (v.bob === undefined) v.bob = Math.random() * Math.PI * 2;
      if (v.path === undefined) v.path = null;
    }
    return true;
  };

  World.tick = tick;
  World.tryBuild = tryBuild;
  World.tryMove = tryMove;
  World.tryDemolish = tryDemolish;
  World.tryUpgrade = tryUpgrade;
  World.upgradePreview = upgradePreview;
  World.tryUpgradeCarry = tryUpgradeCarry;
  World.tryUpgradeSpeed = tryUpgradeSpeed;
  World.hireVillager = hireVillager;
  World.hireCost = hireCost;
  World.assignTo = assignTo;
  World.unassignFrom = unassignFrom;
  World.assignedCount = assignedCount;
  World.idleCount = idleCount;
  World.getStatus = getStatus;
  World.tryBuyLand = tryBuyLand;
  World.currentRent = currentRent;
  World.canPlace = canPlace;
  World.canAfford = canAfford;
  World.getRecipes = getRecipes;
  World.inCap = inCap;
  World.outCap = outCap;
  World.sumObj = sumObj;
  World.availableOut = availableOut;
  World.carryCap = carryCap;
  World.speedMult = speedMult;
  World.spawnFx = spawnFx;
  World.toast = toast;
  World.checkUnlocks = checkUnlocks;
  World.findPath = findPath;
  World.walkable = walkable;
  World.computePost = computePost;
  World.buildingAt = buildingAt;
  World.inMarketTile = inMarket;
  if (typeof module !== 'undefined') module.exports = World;
})();
