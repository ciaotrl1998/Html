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
    mode: null,
    buildType: null,
    moveId: null,
    pending: null,
    selectedId: null,
    panelSig: '',
    villageSig: '',
    rentWarned: null
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

  function unlockHint(type) {
    var pre = C.UNLOCK[type] || [];
    var names = pre.map(function (t) { return C.BUILD[t].name; });
    return '需建成：' + names.join('或');
  }

  function getSelected() {
    for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].id === UI.selectedId) return World.buildings[i];
    return null;
  }

  function showOnly(which) {
    el.placeBar.classList.toggle('hidden', which !== 'place');
    el.actions.classList.toggle('hidden', which === 'place');
    el.buildMenu.classList.toggle('hidden', which !== 'build');
    el.villagePanel.classList.toggle('hidden', which !== 'village');
    el.buildPanel.classList.toggle('hidden', which !== 'building');
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
    } else if (!UI.mode) {
      showOnly(null);
    }
  }

  function startBuild(type) {
    UI.mode = 'build';
    UI.buildType = type;
    UI.pending = null;
    Render.ghost = null;
    selectBuilding(null);
    showOnly('place');
    el.placeInfo.textContent = '点击地图选择 ' + C.BUILD[type].name + ' 的位置';
    el.btnPlaceConfirm.disabled = true;
  }

  function startMove(id) {
    var b = null;
    for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].id === id) b = World.buildings[i];
    if (!b) return;
    UI.mode = 'move';
    UI.moveId = id;
    UI.pending = null;
    Render.ghost = null;
    showOnly('place');
    el.placeInfo.textContent = '点击地图选择 ' + C.BUILD[b.type].name + ' 的新位置';
    el.btnPlaceConfirm.disabled = true;
  }

  function exitMode() {
    UI.mode = null;
    UI.buildType = null;
    UI.moveId = null;
    UI.pending = null;
    Render.ghost = null;
    el.btnPlaceConfirm.disabled = false;
    showOnly(null);
  }

  function updateGhost() {
    if (!UI.pending || !UI.mode) { Render.ghost = null; return; }
    var type = UI.mode === 'build' ? UI.buildType : (getSelected() ? getSelected().type : null);
    if (UI.mode === 'move') {
      for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].id === UI.moveId) type = World.buildings[i].type;
    }
    if (!type) return;
    var chk = World.canPlace(type, UI.pending.x, UI.pending.y, UI.mode === 'move' ? UI.moveId : -1);
    Render.ghost = { type: type, x: UI.pending.x, y: UI.pending.y, valid: chk.ok };
    el.placeInfo.textContent = (UI.mode === 'build' ? '建造 ' : '移动 ') + C.BUILD[type].name + '：' + (chk.ok ? '可放置，点确认' : chk.msg);
    el.btnPlaceConfirm.disabled = !chk.ok;
  }

  function onTileTap(tx, ty) {
    if (UI.mode) {
      var type = UI.mode === 'build' ? UI.buildType : null;
      if (UI.mode === 'move') {
        for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].id === UI.moveId) type = World.buildings[i].type;
      }
      if (!type) return;
      var d = C.BUILD[type];
      UI.pending = { x: tx - Math.floor(d.size[0] / 2), y: ty - Math.floor(d.size[1] / 2) };
      updateGhost();
      return;
    }
    if (tx < 0 || ty < 0 || tx >= World.W || ty >= World.H) return;
    var b = World.buildingAt(tx, ty);
    selectBuilding(b ? b.id : null);
  }

  function confirmPlace() {
    if (!UI.pending || !UI.mode) return;
    if (UI.mode === 'build') {
      var r = World.tryBuild(UI.buildType, UI.pending.x, UI.pending.y);
      if (r.ok) {
        toast('建成 ' + C.BUILD[UI.buildType].name);
        var id = r.building.id;
        exitMode();
        selectBuilding(id);
      } else toast(r.msg);
    } else if (UI.mode === 'move') {
      var r2 = World.tryMove(UI.moveId, UI.pending.x, UI.pending.y);
      if (r2.ok) {
        var mid = UI.moveId;
        toast('已移动');
        exitMode();
        selectBuilding(mid);
      } else toast(r2.msg);
    }
  }

  function invText(map) {
    var parts = [];
    var any = false;
    for (var k in map) {
      if (map[k] > 0) { parts.push(G[k].name + Math.round(map[k] * 10) / 10); any = true; }
    }
    return any ? parts.join('、') : '空';
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
      var btn = document.createElement('button');
      btn.className = 'buildItem' + (unlocked ? '' : ' locked') + (unlocked && !afford ? ' unaffordable' : '');
      var sub = unlocked ? costText(d.cost) : unlockHint(type);
      btn.innerHTML = '<span class="sealBig">' + (C.SEAL[type] || '建') + '</span><span class="bn">' + d.name + '</span><span class="bc">' + sub + '</span>';
      btn.onclick = function () {
        sfx('ui');
        if (!unlocked) { toast('未解锁：' + unlockHint(type)); return; }
        startBuild(type);
      };
      grid.appendChild(btn);
    });
    var note = document.createElement('div');
    note.className = 'pRow dim';
    note.style.marginTop = '7px';
    note.textContent = '前期建筑只用金币；中后期建筑需材料。建筑免费移动、可拆除返还一半。';
    el.buildMenu.innerHTML = '';
    el.buildMenu.appendChild(grid);
    el.buildMenu.appendChild(note);
  }

  function renderBuildPanel(force) {
    var b = getSelected();
    if (!b) return;
    var d = C.BUILD[b.type];
    var sig = b.id + ':' + b.level + ':' + b.type;
    if (!force && sig === UI.panelSig) return;
    UI.panelSig = sig;
    var isMarket = b.type === 'market';
    var isManor = b.type === 'manor';
    var aid = isMarket ? 'market' : b.id;
    var assigned = World.assignedCount(aid);
    var st = World.getStatus(b);
    var html = '';
    html += '<div class="pHead"><span class="pSeal">' + (C.SEAL[b.type] || '庄') + '</span><span class="pName">' + d.name + '</span>';
    if (b.level > 1 && !isMarket) html += '<span class="pLv">' + b.level + ' 级</span>';
    html += '<span class="pStatus"><i class="statusDot" style="background:' + st.color + '"></i>' + st.text + '</span>';
    html += '<button class="pClose" data-action="close">✕</button></div>';
    if (isManor) {
      html += '<div class="pRow"><span>金币收入</span><span class="pInv"><b>' + d.income[b.level - 1].toFixed(1) + '</b> /秒</span></div>';
      html += '<div class="pRow dim">里正宅提供保底收入，不可拆除与指派。</div>';
    } else {
      html += '<div class="pRow"><span>指派村民</span><span class="pAssigned">' + assigned + ' 人</span>';
      html += '<span class="pBtns"><button data-action="assignDown" ' + (assigned ? '' : 'disabled') + '>−</button>';
      html += '<button data-action="assignUp" ' + (World.idleCount() ? '' : 'disabled') + '>＋</button></span></div>';
      if (isMarket) {
        html += '<div class="pRow dim">市场为场外固定设施，不可升级与移动；指派村民可跨建筑收集可售物料。</div>';
      } else {
        if (b.batch) html += '<div class="pProgress"><i style="width:' + Math.min(100, b.batch.progress / b.batch.cycle * 100) + '%"></i></div>';
        html += '<div class="pRow"><span>输入 ' + Math.round(World.sumObj(b.input) * 10) / 10 + '/' + World.inCap(b) + '</span><span class="pInv" data-ref="in">' + invDots(b.input) + '</span></div>';
        html += '<div class="pRow"><span>输出 ' + Math.round(World.sumObj(b.out) * 10) / 10 + '/' + World.outCap(b) + '</span><span class="pInv" data-ref="out">' + invDots(b.out) + '</span></div>';
        html += '<div class="pRow dim">' + d.desc + '</div>';
      }
    }
    if (d.upgrade && b.level < 5) {
      var cost = d.upgrade[b.level - 1];
      var afford = World.canAfford({ gold: cost[0], material: cost[1] });
      html += '<div class="pUpgrade"><div class="pEffect">下一级：' + World.upgradePreview(b) + '</div>';
      html += '<button class="actUpgrade" data-action="upgrade" ' + (afford ? '' : 'disabled') + '>升级到 Lv' + (b.level + 1) + '（' + cost[0] + '金 ' + cost[1] + '材料）</button></div>';
    } else if (d.upgrade) {
      html += '<div class="pRow dim">已达到最高等级</div>';
    }
    if (!isManor && !isMarket) {
      html += '<div class="pBottom"><button data-action="move">移动</button><button data-action="demolish" class="danger">拆除</button></div>';
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
      if (b.batch) prog.style.width = Math.min(100, b.batch.progress / b.batch.cycle * 100) + '%';
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
    html += '<div class="pRow"><span>雇佣村民</span><span class="pInv">' + World.hireCost() + ' 金</span>';
    html += '<span class="pBtns"><button data-action="hire" ' + (World.gold >= World.hireCost() ? '' : 'disabled') + '>＋</button></span></div>';
    html += '<div class="pRow dim">通过建筑面板指派村民；空闲村民不会自行工作。</div>';
    html += villageUpgradeRow('载重', 'carry', World.carryLv, C.VILLAGER.carry[World.carryLv - 1]);
    html += villageUpgradeRow('移速', 'speed', World.speedLv, Math.round(C.VILLAGER.speed[World.speedLv - 1] * 100) + '%');
    el.villagePanel.innerHTML = html;
  }

  function villageUpgradeRow(name, key, lv, cur) {
    var html = '<div class="pRow"><span>' + name + ' Lv' + lv + '</span><span class="pInv">当前 ' + cur + '</span>';
    if (lv >= 5) {
      html += '<span class="pBtns"><button disabled>满</button></span></div>';
    } else {
      var cost = C.VILLAGER.upgrade[lv - 1];
      var afford = World.canAfford({ gold: cost[0], material: cost[1] });
      var next = key === 'carry' ? C.VILLAGER.carry[lv] : Math.round(C.VILLAGER.speed[lv] * 100) + '%';
      html += '<span class="pBtns"><button data-action="' + (key === 'carry' ? 'carryUp' : 'speedUp') + '" ' + (afford ? '' : 'disabled') + '>' + cost[0] + '金' + cost[1] + '材 → ' + next + '</button></span></div>';
    }
    return html;
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
    el.hireCost.textContent = World.hireCost() + '金';
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
    openModal('欢迎来到庄田记', '<p>你受托经营一块租来的庄田。布置产业，村民会自动生产、搬运和售卖；按时交租，攒够金币买下土地即可通关。</p><ul><li>点「建造」放置建筑，再点建筑面板指派村民</li><li>1 名村民时他会离岗搬运导致停产，多雇人可保持生产</li><li>建筑可升级（金币+材料），村民可升级载重与移速</li><li>租金每 3 分钟自动扣除，欠租有短暂时限</li><li>单指拖动地图，双指缩放，双击复位</li></ul>', [
      { text: '开始经营', cls: 'primary' }
    ]);
  }

  function showHelp() {
    openModal('玩法说明', '<ul><li><b>金币</b>：里正宅被动收入与市场售卖所得，用于雇佣、租金、买地与升级。</li><li><b>材料</b>：工坊混合木头或石头产生，用于中后期建筑与升级。</li><li><b>物料</b>：农田→养殖→加工→市场，加工后售价更高。</li><li>下游建筑若无人指派则不会收货；有下游可加工的数量会预留，其余自动出售。</li><li>养殖棚的动物只是表现，产物由建筑整体结算。</li><li>多配方建筑按等待顺序轮流处理，批次中途不切换。</li></ul>', [{ text: '知道了', cls: 'primary' }]);
  }

  function showMenu() {
    openModal('菜单', '<div class="pRow dim">存档自动保存在本机浏览器中。单人退出后计时会暂停，没有离线收益。</div>', [
      { text: '新游戏', cls: 'danger', keepOpen: true, onClick: function () { confirmModal('开始新游戏？', '当前进度将被清除。', function () { newGame(); }); } },
      { text: '重置视角', keepOpen: true, onClick: function () { Render.fit(); closeModal(); } },
      { text: '关闭' }
    ]);
  }

  function newGame() {
    try { localStorage.removeItem(C.SAVE_KEY); } catch (e) {}
    World.reset();
    overlayShown = null;
    UI.panelSig = '';
    UI.villageSig = '';
    UI.rentWarned = null;
    selectBuilding(null);
    exitMode();
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
    try { localStorage.setItem(C.SAVE_KEY, JSON.stringify(World.serialize())); } catch (e) {}
  }

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
  var lastRefreshLoop = performance.now();

  function bind() {
    el.btnBuild.onclick = function () {
      sfx('ui');
      selectBuilding(null);
      if (el.buildMenu.classList.contains('hidden')) { renderBuildMenu(); showOnly('build'); }
      else showOnly(null);
    };
    el.btnHire.onclick = function () {
      var r = World.hireVillager();
      if (!r.ok) toast(r.msg);
      else toast('已雇佣新村民');
    };
    el.btnVillagers.onclick = function () {
      sfx('ui');
      selectBuilding(null);
      if (el.villagePanel.classList.contains('hidden')) { renderVillagePanel(true); showOnly('village'); }
      else showOnly(null);
    };
    el.btnPlaceConfirm.onclick = confirmPlace;
    el.btnPlaceCancel.onclick = function () { sfx('ui'); exitMode(); };
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
        if (r.ok) { save(); }
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
        else toast(C.BUILD[b.type].name + ' 升至 Lv' + b.level);
        UI.panelSig = '';
        renderBuildPanel(true);
        return;
      }
      if (action === 'move') { startMove(b.id); return; }
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
        else toast('全体村民载重提升至 Lv' + World.carryLv);
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
        else if (UI.mode) exitMode();
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
    el.actions = $('actions');
    el.btnBuild = $('btnBuild');
    el.btnHire = $('btnHire');
    el.btnVillagers = $('btnVillagers');
    el.hireCost = $('hireCost');
    el.buildMenu = $('buildMenu');
    el.villagePanel = $('villagePanel');
    el.buildPanel = $('buildPanel');
    el.placeBar = $('placeBar');
    el.placeInfo = $('placeInfo');
    el.btnPlaceConfirm = $('btnPlaceConfirm');
    el.btnPlaceCancel = $('btnPlaceCancel');
    el.toasts = $('toasts');
    el.modal = $('modal');
    el.modalBox = $('modalBox');

    window.SFX = sfx;
    Render.init(el.canvas, onTileTap);
    bind();

    var loaded = false;
    try {
      var raw = localStorage.getItem(C.SAVE_KEY);
      if (raw) loaded = World.load(JSON.parse(raw));
    } catch (e) { loaded = false; }
    if (!loaded) World.reset();
    else toast('已载入本机存档');

    Render.invalidateStatic();
    Render.fit();
    refreshTop();
    if (!loaded) showWelcome();
    requestAnimationFrame(loop);
  }

  boot();
})();
