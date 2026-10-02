(function () {
  var C = window.CFG;
  var G = C.GOODS;
  var World = window.World;

  var el = {};
  var soundOn = true;
  var audioCtx = null;
  var lastRefresh = 0;
  var overlayShown = null;

  var UI = {
    selectedId: null,
    panelSig: '',
    deedSig: '',
    rentWarned: null,
    dragBuild: null,
    dragMove: null
  };
  window.UI = UI;

  function $(id) { return document.getElementById(id); }

  function sfx(name) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var freqs = {
        sale: [880, 0.07, 'sine'], pay: [440, 0.12, 'sine'], build: [330, 0.1, 'triangle'],
        upgrade: [660, 0.16, 'sine'], hire: [520, 0.1, 'sine'], alarm: [220, 0.3, 'square'],
        ui: [600, 0.04, 'sine']
      };
      var f = freqs[name] || freqs.ui;
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = f[2];
      o.frequency.value = f[0];
      g.gain.setValueAtTime(name === 'sale' ? 0.045 : 0.06, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + f[1]);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + f[1]);
    } catch (e) {}
  }

  function fmt(n) { return String(Math.floor(n)); }

  function fmtTime(s) {
    s = Math.max(0, s);
    var m = Math.floor(s / 60);
    var ss = Math.ceil(s % 60);
    if (ss === 60) { m++; ss = 0; }
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function toast(text) { World.toast(text); }

  function costText(cost) {
    if (!cost) return '免费';
    var parts = [];
    if (cost.gold) parts.push(cost.gold + '金');
    if (cost.material) parts.push(cost.material + '材料');
    return parts.join(' ');
  }

  function costHTML(cost) {
    var s = '';
    if (cost && cost.gold) s += '<span class="cg">' + cost.gold + '金</span>';
    if (cost && cost.material) s += '<span class="cm">' + cost.material + '材</span>';
    return s || '<span class="cg">免费</span>';
  }

  function unlockHint(type) {
    var pre = C.UNLOCK[type] || [];
    var names = pre.map(function (t) { return C.BUILD[t].name; });
    return '需先建成 ' + names.join(' 或 ');
  }

  function getSelected() {
    for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].id === UI.selectedId) return World.buildings[i];
    return null;
  }

  function findBuilding(id) {
    for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].id === id) return World.buildings[i];
    return null;
  }

  function showOnly(which) {
    el.buildMenu.classList.toggle('hidden', which !== 'build');
    el.deedPanel.classList.toggle('hidden', which !== 'deed');
    el.buildPanel.classList.toggle('hidden', which !== 'building');
    syncTabs();
  }

  function syncTabs() {
    el.tabBuild.classList.toggle('active', !el.buildMenu.classList.contains('hidden'));
    el.tabDeed.classList.toggle('active', !el.deedPanel.classList.contains('hidden'));
  }

  function sheetReserve() {
    var h = 0;
    [el.buildPanel, el.buildMenu, el.deedPanel].forEach(function (p) {
      if (!p.classList.contains('hidden')) h = Math.max(h, p.offsetHeight);
    });
    return h + 16;
  }

  function selectBuilding(id) {
    UI.selectedId = id;
    Render.selectedId = id;
    UI.panelSig = '';
    if (id) {
      showOnly('building');
      renderBuildPanel(true);
      var b = getSelected();
      if (b) {
        requestAnimationFrame(function () {
          Render.ensureVisible(b.x, b.y, b.h, sheetReserve());
        });
      }
    } else if (!el.buildPanel.classList.contains('hidden')) {
      showOnly(null);
    }
  }

  function onTileTap(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= World.W || ty >= World.H) return;
    var b = World.buildingAt(tx, ty);
    if (b && b.id === UI.selectedId) selectBuilding(null);
    else selectBuilding(b ? b.id : null);
  }

  function onBuildingDragStart(id) {
    var b = findBuilding(id);
    if (!b) return;
    UI.dragMove = { id: id, x: b.x, y: b.y, valid: true, msg: '' };
    Render.hiddenBuildingId = id;
    Render.moveGhost = { id: id, x: b.x, y: b.y, valid: true };
  }

  function onBuildingDragMove(id, tx, ty) {
    var b = findBuilding(id);
    if (!b) return;
    var gx = tx - Math.floor(b.w / 2);
    var gy = ty - Math.floor(b.h / 2);
    var chk = World.canPlace(b.type, gx, gy, id);
    UI.dragMove = { id: id, x: gx, y: gy, valid: chk.ok, msg: chk.msg || '' };
    Render.moveGhost = { id: id, x: gx, y: gy, valid: chk.ok };
  }

  function onBuildingDragEnd(id, tx, ty) {
    var dm = UI.dragMove;
    Render.hiddenBuildingId = null;
    Render.moveGhost = null;
    UI.dragMove = null;
    if (!dm) return;
    if (tx === null || ty === null) return;
    if (dm.valid) {
      var r = World.tryMove(id, dm.x, dm.y);
      var nb = findBuilding(id);
      if (r.ok) toast(nb ? '已移动 ' + C.BUILD[nb.type].name : '已移动');
      else toast(r.msg);
    } else {
      toast('此处不能放置：' + dm.msg);
    }
  }

  function renderBuildMenu() {
    var grid = document.createElement('div');
    grid.className = 'grid';
    C.BUILD_ORDER.forEach(function (type) {
      var d = C.BUILD[type];
      var unlocked = !!World.unlocked[type];
      var afford = World.canAfford(d.cost);
      var item = document.createElement('button');
      item.className = 'buildItem' + (unlocked ? '' : ' locked') + (unlocked && !afford ? ' unaffordable' : '');
      item.innerHTML =
        '<span class="sealBig">' + (C.SEAL[type] || '建') + '</span>' +
        '<span class="bn">' + d.name + '</span>' +
        '<span class="bc">' + (unlocked ? costHTML(d.cost) : '未解锁') + '</span>';
      item.addEventListener('pointerdown', function (e) {
        if (!unlocked) { toast('未解锁：' + unlockHint(type)); return; }
        e.preventDefault();
        UI.dragBuild = { type: type, pid: e.pointerId, active: false, x: 0, y: 0, valid: false, msg: '' };
        try { item.setPointerCapture(e.pointerId); } catch (err) {}
      });
      item.addEventListener('pointermove', function (e) {
        var db = UI.dragBuild;
        if (!db || db.pid !== e.pointerId) return;
        var rect = Render.canvas.getBoundingClientRect();
        var px = e.clientX - rect.left, py = e.clientY - rect.top;
        if (px < 0 || py < 0 || px > rect.width || py > rect.height) {
          db.active = false;
          Render.ghost = null;
          return;
        }
        var t = Render.screenToTile(px, py);
        var dd = C.BUILD[type];
        var gx = t.x - Math.floor(dd.size[0] / 2);
        var gy = t.y - Math.floor(dd.size[1] / 2);
        var chk = World.canPlace(type, gx, gy, -1);
        db.active = true;
        db.x = gx;
        db.y = gy;
        db.valid = chk.ok;
        db.msg = chk.msg || '';
        Render.ghost = { type: type, x: gx, y: gy, valid: chk.ok };
      });
      function finish(cancelled) {
        var db = UI.dragBuild;
        if (!db) return;
        UI.dragBuild = null;
        Render.ghost = null;
        if (cancelled) return;
        if (!db.active) { toast('按住建筑拖到地图空地上建造'); return; }
        var r = World.tryBuild(db.type, db.x, db.y);
        if (r.ok) toast('开始建造 ' + C.BUILD[db.type].name + '（' + (C.BUILD_TIME[db.type] || 0) + '秒）');
        else toast(r.msg);
      }
      item.addEventListener('pointerup', function () { finish(false); });
      item.addEventListener('pointercancel', function () { finish(true); });
      grid.appendChild(item);
    });
    el.buildMenu.innerHTML = '';
    el.buildMenu.appendChild(grid);
    var hint = document.createElement('div');
    hint.className = 'menuHint';
    hint.textContent = '按住建筑拖到地图空地建造 · 原料只在相邻建筑间输送，富余自动卖出';
    el.buildMenu.appendChild(hint);
  }

  function capText(b, g) {
    var cap = 0;
    var rs = World.getRecipes(b);
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (r.mixedGoods && r.mixedGoods.indexOf(g) >= 0) cap = Math.max(cap, r.mixedTotal);
      else if (r.in[g]) cap = Math.max(cap, r.in[g]);
    }
    return cap;
  }

  function recipeHTML(b) {
    var rs = World.getRecipes(b);
    if (!rs.length) return '不进行物料生产';
    var r = World.pickDisplayRecipe(b, rs);
    var g;
    var inp = [];
    var missing = [];
    if (r.mixedTotal) {
      var tot = 0;
      for (var i = 0; i < r.mixedGoods.length; i++) {
        tot += Math.floor(b.input[r.mixedGoods[i]] || 0);
      }
      inp.push('<span class="stok ' + (tot >= r.mixedTotal ? 'ok' : 'bad') + '">' + r.mixedGoods.map(function (x) { return G[x].name; }).join('/') + ' ' + r.mixedTotal + '（' + tot + '/' + r.mixedTotal + '）</span>');
      if (tot < r.mixedTotal) missing.push(r.mixedGoods[0]);
    } else {
      for (g in r.in) {
        var have = Math.floor(b.input[g] || 0);
        var cap = capText(b, g);
        inp.push('<span class="stok ' + (have >= r.in[g] ? 'ok' : 'bad') + '">' + G[g].name + ' ' + r.in[g] + '（' + have + '/' + cap + '）</span>');
        if (have < r.in[g]) missing.push(g);
      }
      if (!inp.length) inp.push('<span class="stok ok">无需原料</span>');
    }
    var outs = [];
    for (g in r.out) outs.push(G[g].name + ' ' + r.out[g]);
    if (r.material) outs.push('材料 ' + r.material + '（' + Math.floor(World.material) + '）');
    var html = inp.join(' ') + ' <b class="arrow">→</b> ' + outs.join('、');
    var noSource = [];
    for (i = 0; i < missing.length; i++) {
      if (World.suppliersOf(b, missing[i]).length === 0 && noSource.indexOf(G[missing[i]].name) < 0) noSource.push(G[missing[i]].name);
    }
    if (noSource.length) html += '<div class="stockNote">缺少相邻的 ' + noSource.join('、') + ' 来源</div>';
    return html;
  }

  function toggleLabel(b) {
    if (!World.canSell(b)) return '材料不可出售';
    return b.mode === 'sell' ? '直接卖出 ⇄' : '供给下游 ⇄';
  }

  function renderBuildPanel(force) {
    var b = getSelected();
    if (!b) return;
    var d = C.BUILD[b.type];
    var sig = b.id + ':' + b.level + ':' + b.type + ':' + (b.constructing ? 1 : 0) + ':' + b.mode;
    if (!force && sig === UI.panelSig) return;
    UI.panelSig = sig;
    var isMarket = b.type === 'market';
    var isManor = b.type === 'manor';
    var y = World.getYield(b);
    var isSell = !isManor && b.mode === 'sell' && World.canSell(b);
    var yieldText = y ? (isSell && y.sellText ? y.sellText : y.storeText) : '';
    var html = '';
    html += '<div class="pHead"><span class="pSeal">' + (C.SEAL[b.type] || '庄') + '</span><span class="pName">' + d.name + '</span>';
    if (b.level > 1 && !isMarket) html += '<span class="pLv">' + b.level + ' 级</span>';
    if (yieldText) html += '<span class="pYield' + (isManor || isSell ? ' gold' : '') + '" data-ref="yield">' + yieldText + '</span>';
    if (d.buildable) html += '<button class="pfDemolish" data-action="demolish">拆除</button>';
    html += '</div>';

    if (isMarket) {
      html += '<div class="pfFlow">市场自动收购各地余料：建筑把上下游都送不出去的物料直接卖成金币。</div>';
      el.buildPanel.innerHTML = html;
      return;
    }

    if (!isManor) {
      html += '<div class="pfRow"><div class="pfFlow" data-ref="recipe">' + recipeHTML(b) + '</div>';
      html += '<button class="pfToggle' + (isSell ? ' sell' : '') + '" data-action="toggleMode"' + (World.canSell(b) ? '' : ' disabled') + '>' + toggleLabel(b) + '</button></div>';
    } else {
      html += '<div class="pfFlow"><span class="stok ok">无需原料</span> <b class="arrow">→</b> 金币（被动收入）</div>';
    }

    if (d.upgrade) {
      var rows = [];
      if (b.level < 5) rows = World.upgradeLines(b);
      else rows = ['已达到最高等级'];
      while (rows.length < 4) rows.push('—');
      html += '<div class="pfUpList">';
      for (var li = 0; li < 4; li++) {
        html += '<div class="upLine' + (rows[li] === '—' ? ' empty' : '') + '">' + rows[li] + '</div>';
      }
      html += '</div>';
      if (b.level < 5) {
        var cost = d.upgrade[b.level - 1];
        var afford = World.canAfford({ gold: cost[0], material: cost[1] });
        html += '<button class="actUpgrade" data-action="upgrade" ' + (afford ? '' : 'disabled') + '>升级到 ' + (b.level + 1) + ' 级（' + cost[0] + '金 ' + cost[1] + '材料）</button>';
      }
    }
    el.buildPanel.innerHTML = html;
  }

  function updateBuildPanelDynamic() {
    var b = getSelected();
    if (!b || el.buildPanel.classList.contains('hidden')) return;
    var y = World.getYield(b);
    var yieldEl = el.buildPanel.querySelector('[data-ref="yield"]');
    if (yieldEl && y) {
      var isManor = b.type === 'manor';
      var isSell = !isManor && b.mode === 'sell' && World.canSell(b);
      yieldEl.textContent = (isSell && y.sellText) ? y.sellText : y.storeText;
      yieldEl.classList.toggle('gold', isManor || isSell);
    }
    var recEl = el.buildPanel.querySelector('[data-ref="recipe"]');
    if (recEl && b.type !== 'manor' && b.type !== 'market') recEl.innerHTML = recipeHTML(b);
  }

  function renderDeedPanel(force) {
    var price = C.RENT.landPrice;
    var pct = Math.min(100, Math.floor(World.gold / price * 100));
    var afford = World.gold >= price && !World.overdue && !World.victory;
    var sig = [World.victory ? 1 : 0, pct, World.overdue ? 1 : 0].join(':');
    if (!force && sig === UI.deedSig) return;
    UI.deedSig = sig;
    var html = '';
    html += '<div class="pHead"><span class="pSeal">契</span><span class="pName">地契</span>';
    html += '<span class="pStatus"><i class="statusDot" style="background:' + (World.victory ? '#5e8a5a' : '#c9a04e') + '"></i>' + (World.victory ? '已买下' : '未买下') + '</span>';
    html += '<button class="pClose" data-action="close">✕</button></div>';
    html += '<div class="pfFlow">买下这块租来的庄田即可通关，免除后续租金，并可继续经营。</div>';
    html += '<div class="deedBox">';
    html += '<div class="deedRow"><span>地价</span><b>' + price + ' 金</b></div>';
    html += '<div class="deedRow"><span>现有金币</span><b data-ref="deedGold">' + fmt(World.gold) + ' 金</b></div>';
    html += '<div class="deedProgress"><i data-ref="deedFill" style="width:' + pct + '%"></i></div>';
    html += '<div class="deedNote">' + (World.victory ? '你已成为这块土地的主人。' : (World.overdue ? '欠租期间不能买地。' : '金币足够时即可买地通关。')) + '</div>';
    html += '</div>';
    if (!World.victory) {
      html += '<button class="actUpgrade" data-action="buyLand" ' + (afford ? '' : 'disabled') + '>' + (World.overdue ? '欠租中，暂不能买地' : '买下庄田（' + price + ' 金）') + '</button>';
    }
    el.deedPanel.innerHTML = html;
  }

  function updateDeedPanelDynamic() {
    if (el.deedPanel.classList.contains('hidden')) return;
    var price = C.RENT.landPrice;
    var pct = Math.min(100, Math.floor(World.gold / price * 100));
    var sig = [World.victory ? 1 : 0, pct, World.overdue ? 1 : 0].join(':');
    if (sig !== UI.deedSig) {
      renderDeedPanel(true);
      return;
    }
    var goldEl = el.deedPanel.querySelector('[data-ref="deedGold"]');
    if (goldEl) goldEl.textContent = fmt(World.gold) + ' 金';
    var fill = el.deedPanel.querySelector('[data-ref="deedFill"]');
    if (fill) fill.style.width = pct + '%';
  }

  function refreshTop() {
    el.goldVal.textContent = fmt(World.gold);
    el.matVal.textContent = fmt(World.material);
    if (World.victory) {
      el.rentVal.textContent = '已买地';
      el.rentTime.textContent = '免租';
    } else {
      el.rentVal.textContent = World.currentRent();
      if (World.overdue) {
        el.rentTime.textContent = '欠租 ' + Math.max(0, Math.ceil(World.overdue.deadline - World.time)) + 's';
      } else {
        el.rentTime.textContent = fmtTime(World.rentTimer);
      }
    }
    if (World.overdue) {
      var lack = Math.max(0, World.overdue.rent - World.gold);
      el.overdueBar.classList.remove('hidden');
      el.overdueBar.textContent = (World.overdue.first ? '欠租！首次宽限期 ' : '欠租！募集期 ') + Math.max(0, Math.ceil(World.overdue.deadline - World.time)) + ' 秒，还差 ' + fmt(lack) + ' 金币';
    } else {
      el.overdueBar.classList.add('hidden');
    }
    el.rentTime.classList.toggle('warn', !World.victory && !World.overdue && World.rentTimer <= 30);
    if (!World.victory && !World.overdue && World.rentTimer <= 30 && UI.rentWarned !== World.rentIndex) {
      UI.rentWarned = World.rentIndex;
      toast('提示：30 秒后收租 ' + World.currentRent() + ' 金');
    }
  }

  var toastSeq = 0;
  function syncToasts() {
    var now = Date.now();
    var active = World.toasts.filter(function (t) { return now - t.born < 3200; });
    var i;
    for (i = el.toasts.children.length - 1; i >= 0; i--) {
      var node = el.toasts.children[i];
      if (!active.some(function (t) { return String(t.id) === node.dataset.id; })) node.remove();
    }
    active.forEach(function (t) {
      if (!t.id) t.id = ++toastSeq;
      if (!el.toasts.querySelector('[data-id="' + t.id + '"]')) {
        var d = document.createElement('div');
        d.className = 'toast';
        d.dataset.id = t.id;
        d.textContent = t.text;
        el.toasts.appendChild(d);
      }
    });
  }

  function openModal(title, bodyHTML, buttons) {
    el.modal.classList.remove('hidden');
    el.modalBox.innerHTML = '<h3>' + title + '</h3><div class="mBody">' + bodyHTML + '</div>';
    var bar = document.createElement('div');
    bar.className = 'mBtns';
    (buttons || [{ text: '关闭' }]).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'act' + (b.cls ? ' ' + b.cls : '');
      btn.textContent = b.text;
      btn.onclick = function () {
        sfx('ui');
        if (b.onClick) b.onClick();
        if (b.keepOpen !== true) closeModal();
      };
      bar.appendChild(btn);
    });
    el.modalBox.appendChild(bar);
  }

  function closeModal() { el.modal.classList.add('hidden'); }

  function confirmModal(title, body, onYes) {
    openModal(title, body, [
      { text: '确认', cls: 'primary', onClick: onYes },
      { text: '取消' }
    ]);
  }

  function showWelcome() {
    openModal('欢迎来到庄田记', '<p>你受托经营一块租来的庄田。建造产业自动生产，物料在相邻建筑间直接输送，按时交租，买下土地即可通关。</p><ul><li>按住建筑栏里的建筑<b>拖到地图</b>空地上建造</li><li>上游建筑会直接把原料送给<b>相邻</b>的下游建筑</li><li>下游装满后，多余的物料<b>自动卖成金币</b></li><li>点建筑可查看详情、切换供给下游或直接卖出</li><li>「地契」页签可以买地通关</li></ul>', [
      { text: '开始经营', cls: 'primary' }
    ]);
  }

  function showHelp() {
    openModal('玩法说明', '<ul><li><b>金币</b>：里正宅被动收入与物料出售所得，用于建造、升级、租金与买地。</li><li><b>材料</b>：工坊消耗木头或石头产生，用于中后期建筑与升级，不可出售。</li><li><b>相邻输送</b>：建筑完成一批生产后，产物先送给相邻且需要它的建筑，送不出去的自动卖出。</li><li><b>原料预存</b>：每座建筑原料只存一批，生产中可继续被相邻上游补满。</li><li><b>供给下游</b>：默认模式，优先输送；<b>直接卖出</b>则跳过输送全部换金币。</li><li>选中建筑后，蓝色虚线框标出相邻的上游建筑。</li></ul>', [{ text: '知道了', cls: 'primary' }]);
  }

  function showMenu() {
    var body = '' +
      '<div class="menuList">' +
      '<button class="menuItem" data-menu="sound"><span>音效</span><b id="menuSoundVal">' + (soundOn ? '开' : '关') + '</b></button>' +
      '<button class="menuItem" data-menu="help"><span>玩法帮助</span><b>查看</b></button>' +
      '<button class="menuItem" data-menu="reset"><span>重置视角</span><b>↺</b></button>' +
      '<button class="menuItem danger" data-menu="new"><span>新游戏</span><b>重新开始</b></button>' +
      '</div>' +
      '<div class="pRow dim">本局不自动保存，刷新或关闭页面后重新开始。</div>';
    openModal('菜单', body, [{ text: '关闭' }]);
  }

  function newGame() {
    World.reset();
    overlayShown = null;
    UI.panelSig = '';
    UI.deedSig = '';
    UI.rentWarned = null;
    selectBuilding(null);
    Render.invalidateStatic();
    Render.fit();
    closeModal();
    toast('新的租期开始了');
  }

  function showVictory() {
    openModal('买下庄田', '<p>恭喜！你买下了这块土地，从此不必再交租，可以继续经营、试试把所有产业升至满级。</p><div class="statChips"><span class="statChip">经营时长 ' + fmtTime(World.time) + '</span><span class="statChip">累计收入 ' + fmt(World.totalEarned) + ' 金</span><span class="statChip">生产批次 ' + World.stats.batches + '</span></div>', [
      { text: '继续经营', cls: 'primary' },
      { text: '开始新局', keepOpen: true, onClick: function () { confirmModal('开始新游戏？', '当前进度将被清除。', newGame); } }
    ]);
  }

  function showGameOver() {
    openModal('经营结束', '<p>' + World.gameOverReason + '。你没能按时交租，庄田被收回。</p><div class="statChips"><span class="statChip">坚持时长 ' + fmtTime(World.time) + '</span><span class="statChip">累计收入 ' + fmt(World.totalEarned) + ' 金</span><span class="statChip">生产批次 ' + World.stats.batches + '</span></div>', [
      { text: '重新开始', cls: 'primary', onClick: newGame }
    ]);
  }

  function checkOverlays() {
    if (World.gameOver && overlayShown !== 'over') { overlayShown = 'over'; showGameOver(); }
    if (World.victory && overlayShown !== 'win') { overlayShown = 'win'; showVictory(); }
  }

  var lastAppHeight = 0;
  function setAppHeight() {
    if (!el.app) return;
    var h = window.innerHeight || document.documentElement.clientHeight || 0;
    if (h > 0 && h !== lastAppHeight) {
      lastAppHeight = h;
      el.app.style.height = h + 'px';
      if (Render.refreshSize) Render.refreshSize();
    }
  }

  var lastRefreshLoop = performance.now();
  function loop(now) {
    var dt = Math.min(0.1, (now - lastRefreshLoop) / 1000);
    lastRefreshLoop = now;
    World.tick(dt);
    Render.draw(dt);
    if (now - lastRefresh > 150) {
      lastRefresh = now;
      refreshTop();
      syncToasts();
      if (!el.buildPanel.classList.contains('hidden')) {
        renderBuildPanel(false);
        updateBuildPanelDynamic();
      }
      if (!el.deedPanel.classList.contains('hidden')) updateDeedPanelDynamic();
    }
    checkOverlays();
    requestAnimationFrame(loop);
  }

  function bind() {
    el.tabBuild.onclick = function () {
      sfx('ui');
      if (el.buildMenu.classList.contains('hidden')) {
        selectBuilding(null);
        renderBuildMenu();
        showOnly('build');
      } else {
        showOnly(null);
      }
    };
    el.tabDeed.onclick = function () {
      sfx('ui');
      if (el.deedPanel.classList.contains('hidden')) {
        selectBuilding(null);
        UI.deedSig = '';
        renderDeedPanel(true);
        showOnly('deed');
      } else {
        showOnly(null);
      }
    };
    el.btnMenu.onclick = showMenu;
    el.btnPause.onclick = function () {
      World.paused = !World.paused;
      el.btnPause.textContent = World.paused ? '行' : '停';
      toast(World.paused ? '已暂停' : '继续经营');
    };
    el.btnSpeed.onclick = function () {
      World.speed = World.speed === 1 ? 2 : (World.speed === 2 ? 3 : 1);
      el.btnSpeed.textContent = World.speed + '×';
    };
    el.modalBox.addEventListener('click', function (e) {
      var item = e.target.closest('[data-menu]');
      if (!item) return;
      var action = item.dataset.menu;
      if (action === 'sound') {
        soundOn = !soundOn;
        var label = document.getElementById('menuSoundVal');
        if (label) label.textContent = soundOn ? '开' : '关';
        sfx('ui');
        return;
      }
      if (action === 'help') { showHelp(); return; }
      if (action === 'reset') { Render.fit(); closeModal(); return; }
      if (action === 'new') {
        confirmModal('开始新游戏？', '当前进度将被清除。', newGame);
        return;
      }
    });
    el.buildPanel.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var b = getSelected();
      if (!b) return;
      var action = btn.dataset.action;
      var r;
      if (action === 'toggleMode') {
        r = World.setMode(b.id, b.mode === 'sell' ? 'supply' : 'sell');
        if (!r.ok) toast(r.msg);
        UI.panelSig = '';
        renderBuildPanel(true);
        return;
      }
      if (action === 'upgrade') {
        r = World.tryUpgrade(b.id);
        if (!r.ok) toast(r.msg);
        else toast(C.BUILD[b.type].name + ' 升至 ' + b.level + ' 级');
        UI.panelSig = '';
        renderBuildPanel(true);
        return;
      }
      if (action === 'demolish') {
        var d = C.BUILD[b.type];
        confirmModal('拆除 ' + d.name, '<p>拆除将返还一半建造费（' + costText(d.cost) + ' 的一半）。确认拆除？</p>', function () {
          r = World.tryDemolish(b.id);
          if (r.ok) {
            toast('已拆除，返还 ' + r.refundGold + '金 ' + r.refundMat + '材料');
            selectBuilding(null);
          } else toast(r.msg);
        });
        return;
      }
    });
    el.deedPanel.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'close') { showOnly(null); return; }
      if (action === 'buyLand') {
        if (World.victory) return;
        if (World.overdue) { toast('欠租期间不能买地'); return; }
        if (World.gold < C.RENT.landPrice) { toast('还差 ' + fmt(C.RENT.landPrice - World.gold) + ' 金币'); return; }
        confirmModal('买下庄田', '<p>支付 <b>' + C.RENT.landPrice + ' 金币</b> 买下这块土地，立即通关并免除后续租金。是否确认？</p>', function () {
          var r = World.tryBuyLand();
          if (!r.ok) toast(r.msg);
          UI.deedSig = '';
          renderDeedPanel(true);
        });
        return;
      }
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!el.modal.classList.contains('hidden')) closeModal();
        else selectBuilding(null);
      }
    });
    window.addEventListener('resize', function () {
      setAppHeight();
      setTimeout(setAppHeight, 300);
    });
    window.addEventListener('orientationchange', function () {
      setAppHeight();
      setTimeout(setAppHeight, 300);
    });
  }

  function boot() {
    el.app = $('app');
    el.canvas = $('game');
    el.goldVal = $('goldVal');
    el.matVal = $('matVal');
    el.rentVal = $('rentVal');
    el.rentTime = $('rentTime');
    el.overdueBar = $('overdueBar');
    el.btnPause = $('btnPause');
    el.btnSpeed = $('btnSpeed');
    el.btnMenu = $('btnMenu');
    el.tabBuild = $('tabBuild');
    el.tabDeed = $('tabDeed');
    el.buildMenu = $('buildMenu');
    el.deedPanel = $('deedPanel');
    el.buildPanel = $('buildPanel');
    el.toasts = $('toasts');
    el.modal = $('modal');
    el.modalBox = $('modalBox');

    window.SFX = sfx;
    setAppHeight();
    Render.init(el.canvas, {
      onTileTap: onTileTap,
      onBuildingDragStart: onBuildingDragStart,
      onBuildingDragMove: onBuildingDragMove,
      onBuildingDragEnd: onBuildingDragEnd
    });
    bind();

    World.reset();
    Render.invalidateStatic();
    Render.fit();

    refreshTop();
    showWelcome();
    requestAnimationFrame(loop);
  }

  boot();
})();
