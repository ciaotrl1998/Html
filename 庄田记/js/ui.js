(function () {
  var C = window.CFG;
  var G = C.GOODS;
  var World = window.World;

  var el = {};
  var soundOn = true;
  var audioCtx = null;
  var lastRefresh = 0, lastSave = 0;
  var overlayShown = null;

  var UI = {
    selectedId: null,
    panelSig: '',
    villageSig: '',
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
    el.villagePanel.classList.toggle('hidden', which !== 'village');
    el.buildPanel.classList.toggle('hidden', which !== 'building');
    syncTabs();
  }

  function syncTabs() {
    el.tabBuild.classList.toggle('active', !el.buildMenu.classList.contains('hidden'));
    el.tabVillage.classList.toggle('active', !el.villagePanel.classList.contains('hidden'));
  }

  function sheetReserve() {
    var h = 0;
    [el.buildPanel, el.buildMenu, el.villagePanel].forEach(function (p) {
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
    selectBuilding(b ? b.id : null);
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

  function invDots(map) {
    var html = '';
    for (var k in map) {
      if (map[k] > 0) html += '<span class="dot" style="background:' + G[k].color + '"></span>' + G[k].name + ' ' + Math.round(map[k] * 10) / 10 + ' ';
    }
    return html || '空';
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
    hint.textContent = '按住建筑拖到地图空地建造 · 建筑可直接拖动移位 · 建造需要时间';
    el.buildMenu.appendChild(hint);
  }

  function renderBuildPanel(force) {
    var b = getSelected();
    if (!b) return;
    var d = C.BUILD[b.type];
    var sig = b.id + ':' + b.level + ':' + b.type + ':' + (b.constructing ? 1 : 0);
    if (!force && sig === UI.panelSig) return;
    UI.panelSig = sig;
    var isMarket = b.type === 'market';
    var isManor = b.type === 'manor';
    var aid = isMarket ? 'market' : b.id;
    var assigned = World.assignedCount(aid);
    var st = World.getStatus(b);
    var html = '';
    html += '<div class="pHead"><span class="pSeal">' + (C.SEAL[b.type] || '庄') + '</span><span class="pName">' + d.name + '</span>';
    if (b.level > 1 && !isMarket && !b.constructing) html += '<span class="pLv">' + b.level + ' 级</span>';
    html += '<span class="pStatus"><i class="statusDot" style="background:' + st.color + '"></i>' + st.text + '</span>';
    html += '<button class="pClose" data-action="close">✕</button></div>';
    if (b.constructing) {
      var pct = Math.min(100, b.buildProgress / (b.buildTime || 1) * 100);
      html += '<div class="pProgress big"><i style="width:' + pct + '%"></i></div>';
      html += '<div class="pRow"><span>还需</span><span class="pInv">' + Math.ceil(Math.max(0, b.buildTime - b.buildProgress)) + ' 秒建成</span></div>';
      html += '<div class="pRow dim">建成后闲置村民会自动前来工作，也可以手动指派。</div>';
      html += '<div class="pBottom"><button data-action="demolish" class="danger">拆除（返还一半）</button></div>';
      el.buildPanel.innerHTML = html;
      return;
    }
    if (isManor) {
      html += '<div class="pRow"><span>金币收入</span><span class="pInv"><b>' + d.income[b.level - 1].toFixed(1) + '</b> /秒</span></div>';
      html += '<div class="pRow dim">里正宅提供保底收入，不可拆除；拖动可直接移动位置。</div>';
    } else {
      html += '<div class="pRow"><span>指派村民</span><span class="pAssigned">' + assigned + ' 人</span>';
      html += '<span class="pBtns"><button data-action="assignDown" ' + (assigned ? '' : 'disabled') + '>−</button>';
      html += '<button data-action="assignUp" ' + (World.idleCount() ? '' : 'disabled') + '>＋</button></span></div>';
      if (isMarket) {
        html += '<div class="pRow dim">市场为场外固定设施，指派村民可跨建筑收集物料售卖。</div>';
      } else {
        if (b.batch) html += '<div class="pProgress"><i style="width:' + Math.min(100, b.batch.progress / b.batch.cycle * 100) + '%"></i></div>';
        html += '<div class="pRow"><span>输入 ' + Math.round(World.sumObj(b.input) * 10) / 10 + '/' + World.inCap(b) + '</span><span class="pInv" data-ref="in">' + invDots(b.input) + '</span></div>';
        html += '<div class="pRow"><span>输出 ' + Math.round(World.sumObj(b.out) * 10) / 10 + '/' + World.outCap(b) + '</span><span class="pInv" data-ref="out">' + invDots(b.out) + '</span></div>';
        html += '<div class="pRow dim">' + d.desc + ' · 拖动建筑可移位</div>';
      }
    }
    if (d.upgrade && b.level < 5) {
      var cost = d.upgrade[b.level - 1];
      var afford = World.canAfford({ gold: cost[0], material: cost[1] });
      html += '<div class="pUpgrade"><div class="pEffect">下一级：' + World.upgradePreview(b) + '</div>';
      html += '<button class="actUpgrade" data-action="upgrade" ' + (afford ? '' : 'disabled') + '>升级到 ' + (b.level + 1) + ' 级（' + cost[0] + '金 ' + cost[1] + '材料）</button></div>';
    } else if (d.upgrade) {
      html += '<div class="pRow dim">已达到最高等级</div>';
    }
    if (!isManor && !isMarket) {
      html += '<div class="pBottom"><button data-action="demolish" class="danger">拆除（返还一半）</button></div>';
    }
    el.buildPanel.innerHTML = html;
  }

  function updateBuildPanelDynamic() {
    var b = getSelected();
    if (!b || el.buildPanel.classList.contains('hidden')) return;
    var st = World.getStatus(b);
    var statusEl = el.buildPanel.querySelector('.pStatus');
    if (statusEl) statusEl.innerHTML = '<i class="statusDot" style="background:' + st.color + '"></i>' + st.text;
    var prog = el.buildPanel.querySelector('.pProgress i');
    if (prog) {
      if (b.constructing) prog.style.width = Math.min(100, b.buildProgress / (b.buildTime || 1) * 100) + '%';
      else if (b.batch) prog.style.width = Math.min(100, b.batch.progress / b.batch.cycle * 100) + '%';
      else prog.style.width = '0%';
    }
    var inEl = el.buildPanel.querySelector('[data-ref="in"]');
    if (inEl) inEl.innerHTML = invDots(b.input);
    var outEl = el.buildPanel.querySelector('[data-ref="out"]');
    if (outEl) outEl.innerHTML = invDots(b.out);
    var signed = el.buildPanel.querySelector('.pAssigned');
    if (signed) signed.textContent = World.assignedCount(b.type === 'market' ? 'market' : b.id) + ' 人';
  }

  function renderVillagePanel(force) {
    var sig = World.villagers.length + ':' + World.carryLv + ':' + World.speedLv + ':' + World.idleCount() + ':' + (World.gold >= World.hireCost() ? 1 : 0);
    if (!force && sig === UI.villageSig) return;
    UI.villageSig = sig;
    var html = '';
    html += '<div class="pHead"><span class="pSeal">民</span><span class="pName">村民</span>';
    html += '<span class="pStatus"><i class="statusDot" style="background:#5e8a5a"></i>共 ' + World.villagers.length + ' 人 · 空闲 ' + World.idleCount() + '</span>';
    html += '<button class="pClose" data-action="close">✕</button></div>';
    html += '<div class="pRow"><span>雇佣村民</span><span class="pInv">每人 ' + World.hireCost() + ' 金</span></div>';
    html += '<button class="actUpgrade" data-action="hire" ' + (World.gold >= World.hireCost() ? '' : 'disabled') + '>雇佣一名村民（' + World.hireCost() + ' 金）</button>';
    html += '<div class="pRow dim">闲置村民会自动前往没有工人的建筑工作（市场除外）。</div>';
    html += '<div class="pRow"><span>载重 Lv' + World.carryLv + '</span><span class="pInv">当前每人每趟 ' + C.VILLAGER.carry[World.carryLv - 1] + ' 单位</span></div>';
    if (World.carryLv < 5) {
      var cc = C.VILLAGER.upgrade[World.carryLv - 1];
      html += '<button class="actUpgrade" data-action="carryUp" ' + (World.canAfford({ gold: cc[0], material: cc[1] }) ? '' : 'disabled') + '>升级载重 +1（' + cc[0] + '金 ' + cc[1] + '材料）</button>';
    } else {
      html += '<button class="actUpgrade" disabled>载重已满级</button>';
    }
    html += '<div class="pRow"><span>移速 Lv' + World.speedLv + '</span><span class="pInv">当前 ' + Math.round(C.VILLAGER.speed[World.speedLv - 1] * 100) + '% · 下一级 ' + (World.speedLv < 5 ? Math.round(C.VILLAGER.speed[World.speedLv] * 100) + '%' : '—') + '</span></div>';
    if (World.speedLv < 5) {
      var sc = C.VILLAGER.upgrade[World.speedLv - 1];
      html += '<button class="actUpgrade" data-action="speedUp" ' + (World.canAfford({ gold: sc[0], material: sc[1] }) ? '' : 'disabled') + '>升级移速（' + sc[0] + '金 ' + sc[1] + '材料）</button>';
    } else {
      html += '<button class="actUpgrade" disabled>移速已满级</button>';
    }
    el.villagePanel.innerHTML = html;
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
    var price = C.RENT.landPrice;
    var pct = Math.min(100, Math.floor(World.gold / price * 100));
    el.btnBuyLand.textContent = World.victory ? '已买地' : '买地 ' + pct + '%';
    el.btnBuyLand.classList.toggle('ready', !World.victory && !World.overdue && World.gold >= price);
    el.btnBuyLand.disabled = World.victory;

    if (World.overdue) {
      var lack = Math.max(0, World.overdue.rent - World.gold);
      el.overdueBar.classList.remove('hidden');
      el.overdueBar.textContent = (World.overdue.first ? '欠租！首次宽限期 ' : '欠租！募集期 ') + Math.max(0, Math.ceil(World.overdue.deadline - World.time)) + ' 秒，还差 ' + fmt(lack) + ' 金币（无人可求助，可自行补足）';
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
    openModal('欢迎来到庄田记', '<p>你受托经营一块租来的庄田。布置产业，村民会自动生产、搬运和售卖；按时交租，攒够金币买下土地即可通关。</p><ul><li>按住建筑栏里的建筑<b>拖到地图</b>空地上建造</li><li>直接<b>拖动地图上的建筑</b>即可移动位置</li><li>点一下建筑可查看状态、指派村民和升级</li><li>建成后闲置村民会自动上岗（市场除外）</li><li>单指拖动地图，双指缩放，双击复位</li></ul>', [
      { text: '开始经营', cls: 'primary' }
    ]);
  }

  function showHelp() {
    openModal('玩法说明', '<ul><li><b>金币</b>：里正宅被动收入与市场售卖所得，用于雇佣、租金、买地与升级。</li><li><b>材料</b>：工坊混合木头或石头产生，用于中后期建筑与升级。</li><li><b>物料</b>：农田→养殖→加工→市场，加工后售价更高。</li><li>建筑有建造时间，建成后才会生产。</li><li>下游建筑若无人指派则不会收货；有下游可加工的数量会预留，其余自动出售。</li><li>多配方建筑按等待顺序轮流处理，批次中途不切换。</li></ul>', [{ text: '知道了', cls: 'primary' }]);
  }

  function showMenu() {
    openModal('菜单', '<div class="pRow dim">存档自动保存在本机浏览器中，缩放位置也会一起保存。</div>', [
      { text: '新游戏', cls: 'danger', keepOpen: true, onClick: function () { confirmModal('开始新游戏？', '当前进度将被清除。', function () { newGame(); }); } },
      { text: '重置视角', keepOpen: true, onClick: function () { Render.fit(); closeModal(); } },
      { text: '关闭' }
    ]);
  }

  function newGame() {
    try {
      localStorage.removeItem(C.SAVE_KEY);
      localStorage.removeItem(C.SAVE_KEY + '_cam');
    } catch (e) {}
    World.reset();
    overlayShown = null;
    UI.panelSig = '';
    UI.villageSig = '';
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

  function save() {
    try {
      localStorage.setItem(C.SAVE_KEY, JSON.stringify(World.serialize()));
      localStorage.setItem(C.SAVE_KEY + '_cam', JSON.stringify(Render.getCam()));
    } catch (e) {}
  }

  var lastRefreshLoop = performance.now();
  function loop(now) {
    var dt = Math.min(0.1, (now - lastRefreshLoop) / 1000);
    lastRefreshLoop = now;
    World.tick(dt);
    Render.draw(dt);
    if (now - lastRefresh > 120) {
      lastRefresh = now;
      refreshTop();
      syncToasts();
      updateBuildPanelDynamic();
      if (!el.buildPanel.classList.contains('hidden')) renderBuildPanel(false);
      if (!el.villagePanel.classList.contains('hidden')) renderVillagePanel(false);
    }
    if (now - lastSave > 8000) { lastSave = now; save(); }
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
    el.tabVillage.onclick = function () {
      sfx('ui');
      if (el.villagePanel.classList.contains('hidden')) {
        selectBuilding(null);
        renderVillagePanel(true);
        showOnly('village');
      } else {
        showOnly(null);
      }
    };
    el.btnHelp.onclick = showHelp;
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
    el.btnSound.onclick = function () {
      soundOn = !soundOn;
      el.btnSound.textContent = soundOn ? '音' : '静';
    };
    el.btnBuyLand.onclick = function () {
      if (World.victory) return;
      if (World.overdue) { toast('欠租期间不能买地'); return; }
      if (World.gold < C.RENT.landPrice) { toast('还差 ' + fmt(C.RENT.landPrice - World.gold) + ' 金币'); return; }
      confirmModal('买下庄田', '<p>支付 <b>' + C.RENT.landPrice + ' 金币</b> 买下这块土地，立即通关并免除后续租金。是否确认？</p>', function () {
        var r = World.tryBuyLand();
        if (r.ok) save();
        else toast(r.msg);
      });
    };
    el.buildPanel.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var b = getSelected();
      if (!b) return;
      var action = btn.dataset.action;
      var r;
      if (action === 'close') { selectBuilding(null); return; }
      if (action === 'assignUp') {
        r = World.assignTo(b.type === 'market' ? 'market' : b.id);
        if (!r.ok) toast(r.msg);
        UI.panelSig = '';
        renderBuildPanel(true);
        return;
      }
      if (action === 'assignDown') {
        r = World.unassignFrom(b.type === 'market' ? 'market' : b.id);
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
        confirmModal('拆除 ' + d.name, '<p>拆除将返还一半建造费（' + costText(d.cost) + ' 的一半），建筑内库存会留在原地，由村民自动清理出售。确认拆除？</p>', function () {
          r = World.tryDemolish(b.id);
          if (r.ok) {
            toast('已拆除，返还 ' + r.refundGold + '金 ' + r.refundMat + '材料');
            selectBuilding(null);
          } else toast(r.msg);
        });
        return;
      }
    });
    el.villagePanel.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      var r;
      if (action === 'close') { showOnly(null); return; }
      if (action === 'hire') {
        r = World.hireVillager();
        if (!r.ok) toast(r.msg);
        else toast('已雇佣新村民');
        renderVillagePanel(true);
        return;
      }
      if (action === 'carryUp') {
        r = World.tryUpgradeCarry();
        if (!r.ok) toast(r.msg);
        else toast('全体村民载重 +1，当前 Lv' + World.carryLv);
        renderVillagePanel(true);
        return;
      }
      if (action === 'speedUp') {
        r = World.tryUpgradeSpeed();
        if (!r.ok) toast(r.msg);
        else toast('全体村民移速提升至 Lv' + World.speedLv);
        renderVillagePanel(true);
        return;
      }
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!el.modal.classList.contains('hidden')) closeModal();
        else selectBuilding(null);
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) save();
    });
    window.addEventListener('beforeunload', save);
  }

  function boot() {
    el.canvas = $('game');
    el.goldVal = $('goldVal');
    el.matVal = $('matVal');
    el.rentVal = $('rentVal');
    el.rentTime = $('rentTime');
    el.overdueBar = $('overdueBar');
    el.btnBuyLand = $('btnBuyLand');
    el.btnHelp = $('btnHelp');
    el.btnPause = $('btnPause');
    el.btnSpeed = $('btnSpeed');
    el.btnSound = $('btnSound');
    el.btnMenu = $('btnMenu');
    el.tabBuild = $('tabBuild');
    el.tabVillage = $('tabVillage');
    el.buildMenu = $('buildMenu');
    el.villagePanel = $('villagePanel');
    el.buildPanel = $('buildPanel');
    el.toasts = $('toasts');
    el.modal = $('modal');
    el.modalBox = $('modalBox');

    window.SFX = sfx;
    Render.init(el.canvas, {
      onTileTap: onTileTap,
      onBuildingDragStart: onBuildingDragStart,
      onBuildingDragMove: onBuildingDragMove,
      onBuildingDragEnd: onBuildingDragEnd
    });
    bind();

    var loaded = false;
    try {
      var raw = localStorage.getItem(C.SAVE_KEY);
      if (raw) loaded = World.load(JSON.parse(raw));
    } catch (e) { loaded = false; }
    if (!loaded) World.reset();
    else toast('已载入本机存档');

    Render.invalidateStatic();
    var restoredCam = false;
    if (loaded) {
      try {
        var cam = JSON.parse(localStorage.getItem(C.SAVE_KEY + '_cam'));
        if (cam) { Render.setCam(cam); restoredCam = true; }
      } catch (e) {}
    }
    if (!restoredCam) Render.fit();

    refreshTop();
    if (!loaded) showWelcome();
    requestAnimationFrame(loop);
  }

  boot();
})();
