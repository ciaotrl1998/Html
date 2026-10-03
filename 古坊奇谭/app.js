(function () {
  'use strict';
  const $ = id => document.getElementById(id), canvas = $('map'), KEY = 'gufang-qitan-save-v1';
  let storageWarning = false, saved = null;
  try { saved = localStorage.getItem(KEY); } catch { storageWarning = true; }
  let state = (saved && GF.restore(saved)) || GF.createState(), selected = null, category = 'economy', paused = false, speed = 1, grid = true, sound = false;
  let panelKey = '', lastPhase = '', lastFrame = 0, uiClock = 0, saveClock = 0, toastTimer, audioContext, hiddenPause = document.hidden;
  const cam = { x: 0, y: 0, zoom: 1 }, pointers = new Map();
  function center() {
    const mobile = innerWidth <= 600;
    cam.zoom = mobile ? .71 : Math.max(.7, Math.min(1.05, innerHeight / 980));
    cam.x = innerWidth * (mobile ? .5 : .55) - (GF.CENTER + .5) * GFArt.T * cam.zoom;
    cam.y = innerHeight * (mobile ? .59 : .56) - (GF.CENTER + .5) * GFArt.T * cam.zoom;
    clampCamera();
  }
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2), oldW = canvas.width / (canvas._ratio || ratio), oldH = canvas.height / (canvas._ratio || ratio);
    canvas.width = Math.round(innerWidth * ratio); canvas.height = Math.round(innerHeight * ratio); canvas._ratio = ratio;
    if (!canvas._ready) { center(); canvas._ready = true; } else { cam.x += (innerWidth - oldW) / 2; cam.y += (innerHeight - oldH) / 2; clampCamera(); }
  }
  function clampCamera() {
    const size = GF.SIZE * GFArt.T * cam.zoom, marginX = Math.min(innerWidth * .3, 180), marginY = Math.min(innerHeight * .3, 160);
    cam.x = Math.max(marginX - size, Math.min(innerWidth - marginX, cam.x));
    cam.y = Math.max(150 - size, Math.min(innerHeight - marginY, cam.y));
  }
  function zoom(factor, x = innerWidth / 2, y = innerHeight / 2) {
    const old = cam.zoom; cam.zoom = Math.max(.36, Math.min(1.8, old * factor));
    cam.x = x - (x - cam.x) * cam.zoom / old; cam.y = y - (y - cam.y) * cam.zoom / old; clampCamera();
  }
  function screenPoint(x, y) { return { x: cam.x + (x + .5) * GFArt.T * cam.zoom, y: cam.y + (y + .5) * GFArt.T * cam.zoom }; }
  function toast(text, kind = 'info') { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').className = 'show ' + kind; toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200); }
  function tone(kind = 'build') {
    if (!sound) return;
    try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); const o = audioContext.createOscillator(), g = audioContext.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(kind === 'build' ? 560 : kind === 'skill' ? 260 : 740, audioContext.currentTime); o.frequency.exponentialRampToValueAtTime(kind === 'skill' ? 80 : 880, audioContext.currentTime + .15); g.gain.setValueAtTime(.055, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .22); o.connect(g); g.connect(audioContext.destination); o.start(); o.stop(audioContext.currentTime + .24); } catch { /* Audio is optional. */ }
  }
  function save(notify = false) {
    try { localStorage.setItem(KEY, GF.serialize(state)); $('save-status').textContent = '已存档 · 此设备'; if (notify) toast('古坊已存档，下次打开即可继续'); return true; }
    catch { $('save-status').textContent = '存档不可用 · 可在菜单导出'; if (notify || !storageWarning) toast('浏览器未允许本地存档，请在菜单导出存档', 'warning'); storageWarning = true; return false; }
  }
  function select(x, y) {
    if (x < 0 || y < 0 || x >= GF.SIZE || y >= GF.SIZE || state.over) return;
    selected = { x, y }; panelKey = ''; category = 'economy'; $('cards').scrollLeft = 0; $('panel').hidden = false; $('idle-hint').hidden = true; $('game').classList.add('has-panel'); refresh();
  }
  function closePanel() { selected = null; panelKey = ''; $('panel').hidden = true; $('idle-hint').hidden = false; $('game').classList.remove('has-panel'); }
  function effect(d, b) {
    if (d.neighbors) return '收入 +' + d.income + '/秒 · 全镇 +' + d.aura * 100 + '%';
    if (d.cat === 'economy') return '铜钱 +' + (b ? GF.income(state, b).toFixed(1) : d.income) + ' / 秒';
    return d.desc || '';
  }
  function cardHTML(d) {
    return `<button class="build-card" data-build="${d.id}" aria-label="建造${d.name}"><span class="chain-tag">${d.chain ? d.chain + '业' : d.neighbors ? '终极' : ''}</span><img src="${GFArt.thumbnail(d.id)}" alt=""><span class="card-reason" hidden></span><strong>${d.name}</strong><span class="card-price">◎ ${d.cost} 铜钱</span><span class="card-effect">${effect(d)}</span></button>`;
  }
  function detailHTML(b) {
    const d = GF.DEFS[b.type], max = b.level >= (d.max || 3), hp = GF.maxHP(b), f = GF.factor(b), nextF = f * 1.65;
    let stats = `<div>耐久上限<strong>${hp}${max ? '' : ' → ' + Math.round(hp * 1.65)}</strong></div>`;
    if (d.income) stats += `<div>铜钱 / 秒<strong>${GF.income(state, b).toFixed(1)}${max ? '' : ' → ' + (GF.income(state, b) * 1.65).toFixed(1)}</strong></div>`;
    else if (d.damage) stats += `<div>攻击伤害<strong>${Math.round(d.damage * f)}${max ? '' : ' → ' + Math.round(d.damage * nextF)}</strong></div>`;
    else if (d.incense) stats += `<div>香火 / 秒<strong>${(d.incense * f).toFixed(1)}${max ? '' : ' → ' + (d.incense * nextF).toFixed(1)}</strong></div>`;
    else if (['home', 'well', 'stage', 'market'].includes(b.type)) { const v = { home: 10, well: 20, stage: 3, market: 5 }[b.type]; stats += `<div>收入加成<strong>${v * b.level}%${max ? '' : ' → ' + v * (b.level + 1) + '%'}</strong></div>`; }
    else if (b.type === 'zhong') stats += `<div>普通敌人减速<strong>${40 + (b.level - 1) * 8}%${max ? '' : ' → ' + (40 + b.level * 8) + '%'}</strong></div>`;
    if (d.income && d.incense) stats += `<div>香火 / 秒<strong>${(d.incense * f).toFixed(1)}${max ? '' : ' → ' + (d.incense * nextF).toFixed(1)}</strong></div>`;
    return `<div class="detail"><div class="detail-art"><img src="${GFArt.thumbnail(b.type, b.level)}" alt="${d.name}"><span>${d.chain ? d.chain + '业兴旺' : d.neighbors ? '四方来客' : d.cat === 'defense' ? '守望古坊' : '人间烟火'}</span></div><div class="detail-info"><div class="detail-title"><h3>${GF.name(b)}</h3><span class="level-badge">Lv.${b.level}${max ? ' · 满级' : ''}</span></div><p class="detail-description">${effect(d, b)}</p><div class="health-row"><span>耐久</span><div class="health-track"><i id="detail-hp-fill"></i></div><span id="detail-hp"></span></div><div class="upgrade-stats">${stats}</div></div><div class="detail-actions"><button class="upgrade-button" id="upgrade-building">${max ? '已臻化境' : '升级至 Lv.' + (b.level + 1)}<small id="upgrade-label"></small></button><button class="demolish-button" id="demolish-building" ${b.type === 'shrine' ? 'disabled' : ''}>${b.type === 'shrine' ? '古坊根基 · 不可拆除' : '拆除 · 返还 ' + Math.floor(d.cost * .4) + ' 铜钱'}</button></div></div>`;
  }
  function renderPanel() {
    if (!selected) return;
    const { x, y } = selected, b = GF.at(state, x, y);
    const availability = b ? '' : Object.values(GF.DEFS).filter(d => d.cat === category && !d.unique).map(d => GF.buildReason(state, d.id, x, y) ? 0 : 1).join('');
    const key = `${x},${y},${category},${state.revision},${b?.id || ''},${availability}`;
    $('plot-label').textContent = b ? GF.DEFS[b.type].name : GF.TERRAIN[GF.terrain(x, y)] + ' · 可兴建';
    $('plot-coord').textContent = '地块 ' + (x + 1) + ' · ' + (y + 1);
    $('panel-tip').textContent = b ? (state.phase === 'day' ? '白昼自动修复 · 每 2 秒恢复 5%' : '长夜守坊 · 建筑自动迎敌') : '起点看地形，后面挨着建';
    $('build-view').hidden = !!b; $('detail-view').hidden = !b;
    if (key !== panelKey) {
      panelKey = key;
      if (b) $('detail-view').innerHTML = detailHTML(b);
      else {
        for (const el of document.querySelectorAll('[data-category]')) el.classList.toggle('active', el.dataset.category === category);
        const defs = Object.values(GF.DEFS).filter(d => d.cat === category && !d.unique);
        defs.sort((a, b) => Number(!!GF.buildReason(state, a.id, x, y)) - Number(!!GF.buildReason(state, b.id, x, y)));
        const scroll = $('cards').scrollLeft; $('cards').innerHTML = defs.map(cardHTML).join(''); $('cards').scrollLeft = scroll;
      }
    }
    if (b) {
      $('detail-hp').textContent = Math.ceil(Math.max(0, b.hp)) + ' / ' + GF.maxHP(b); $('detail-hp-fill').style.width = Math.max(0, b.hp / GF.maxHP(b) * 100) + '%';
      const reason = GF.upgradeReason(state, b), max = b.level >= (GF.DEFS[b.type].max || 3);
      $('upgrade-building').classList.toggle('blocked', !!reason); $('upgrade-building').setAttribute('aria-disabled', String(!!reason));
      $('upgrade-label').textContent = max ? '本建筑已达最高等级' : reason || '◎ ' + GF.upgradeCost(b) + ' 铜钱';
    } else for (const el of $('cards').children) {
      const reason = GF.buildReason(state, el.dataset.build, x, y); el.classList.toggle('locked', !!reason); el.classList.toggle('poor', reason.startsWith('差 ')); el.setAttribute('aria-disabled', String(!!reason));
      const label = el.querySelector('.card-reason'); label.hidden = !reason; label.textContent = reason;
    }
  }
  const fmt = n => Math.floor(n).toLocaleString('en-US');
  function refresh() {
    const r = GF.rates(state), p = GF.prosperity(state);
    $('coins').textContent = fmt(state.coins); $('incense').textContent = fmt(state.incense);
    $('coin-rate').textContent = '+' + r.coins.toFixed(1) + ' / 秒'; $('incense-rate').textContent = '+' + r.incense.toFixed(1) + ' / 秒';
    $('town-name').textContent = GF.townName(state); $('prosperity').textContent = p;
    const next = p < 100 ? 100 : p < 230 ? 230 : p < 450 ? 450 : p;
    $('town-next').textContent = '/ ' + next; $('prosperity-fill').style.width = Math.min(100, p / next * 100) + '%';
    $('unlock-hint').textContent = p < 45 ? '繁荣 45 · 解锁擂石台' : p < 65 ? '繁荣 65 · 解锁兵营' : p < 80 ? '繁荣 80 · 解锁道观' : '百业皆可兴 · 邻接终点建会馆';
    $('day-label').textContent = '第 ' + state.day + ' 日 · ' + ({ day: '白昼', dusk: '黄昏', night: '长夜' }[state.phase]) + (state.day % 7 === 0 ? ' · 灯会' : '');
    $('phase-icon').textContent = { day: '☀', dusk: '◒', night: '☾' }[state.phase];
    $('phase-hint').textContent = state.phase === 'day' ? (state.day % 7 === 0 ? '上元灯会，今日收入增加 25%' : '万物生长，宜兴业筑坊') : state.phase === 'dusk' ? ['北','东','南','西'][state.direction] + '方有异动，请布置防御' : '护住祠堂，候一场晨光';
    const remaining = state.phase === 'day' ? GF.DAY - state.time : GF.DUSK - state.time;
    $('day-fill').style.width = state.phase === 'night' ? Math.max(0, 100 * ((state.wave?.total || 1) - (state.wave?.spawned || 0) + state.enemies.length) / (state.wave?.total || 1)) + '%' : Math.max(0, remaining / (state.phase === 'day' ? GF.DAY : GF.DUSK) * 100) + '%';
    $('countdown').textContent = state.phase === 'night' ? state.enemies.length + ' 敌' : Math.max(0, Math.ceil(remaining)) + 's';
    $('night-warning').hidden = state.phase === 'day';
    $('night-warning').textContent = state.phase === 'dusk' ? '⚑ 今夜来敌在' + ['北','东','南','西'][state.direction] + '方 · 备好箭塔与香火' : (state.wave?.boss ? '百鬼夜行 · 四方来袭' : ['北','东','南','西'][state.direction] + '方来袭') + ' · 已出现 ' + (state.wave?.spawned || 0) + ' / ' + (state.wave?.total || 0);
    $('skills').hidden = state.phase !== 'night' || state.over;
    for (const el of document.querySelectorAll('[data-skill]')) {
      const id = el.dataset.skill, reason = GF.skillReason(state, id); el.classList.toggle('unavailable', !!reason); el.setAttribute('aria-disabled', String(!!reason));
      el.querySelector('small').textContent = state.cooldowns[id] > 0 ? Math.ceil(state.cooldowns[id]) + ' 秒' : id === 'thunder' && !state.buildings.some(b => b.type === 'tao') ? '需道观' : GF.SKILLS[id].cost + ' 香火';
      el.title = reason || ({ repel: '全体敌人定身 4 秒，造成 20 伤害', repair: '所有建筑立即恢复 35% 耐久', thunder: '全图天雷造成 240 伤害，对阴兵造成 350 伤害' }[id]);
    }
    const mission = GF.MISSIONS[state.mission];
    $('mission-number').textContent = String(Math.min(state.mission + 1, 8)).padStart(2, '0') + ' / 08';
    $('mission-title').textContent = mission?.title || '古坊灯火，生生不息'; $('mission-desc').textContent = mission?.desc || '继续兴建产业，迎战更强妖鬼'; $('mission-reward').textContent = mission ? '赏 · ' + mission.reward + ' 铜钱' : '八则坊志 · 悉数写成'; $('mission-locate').textContent = mission ? (state.mission === 4 || state.mission === 7 ? '查看布防 ↗' : '去建造 ↗') : '查看古坊 ↗';
    $('zoom-label').textContent = Math.round(cam.zoom * 100) + '%'; $('speed').textContent = speed + '×'; $('pause').textContent = paused ? '▶' : 'Ⅱ'; $('pause').setAttribute('aria-label', paused ? '继续' : '暂停'); $('paused-indicator').hidden = !paused || $('modal').open || state.over;
    if (lastPhase !== state.phase) { document.body.classList.toggle('night', state.phase === 'night'); lastPhase = state.phase; }
    renderPanel();
  }
  function handleEvents() {
    const events = state.events.splice(0); if (!events.length) return;
    const important = events.find(e => ['victory', 'defeat'].includes(e.kind));
    if (important?.kind === 'defeat') { save(); showEnd(); }
    else if (important?.kind === 'victory') { save(); showVictory(); }
    else { const e = events[events.length - 1]; toast(e.text, e.kind); if (e.kind === 'reward') tone('reward'); }
  }
  function blocked(el, reason) { el?.classList.remove('shake'); if (el) { void el.offsetWidth; el.classList.add('shake'); } toast(reason, 'warning'); }
  function performBuild(type, el) {
    if (!selected) return; const r = GF.build(state, type, selected.x, selected.y);
    if (!r.ok) return blocked(el, r.reason);
    tone(); panelKey = ''; toast(GF.DEFS[type].name + '落成 · ' + effect(GF.DEFS[type])); handleEvents(); save(); refresh();
  }
  $('cards').addEventListener('click', e => { const el = e.target.closest('[data-build]'); if (el && !cardDrag.suppress) performBuild(el.dataset.build, el); });
  $('detail-view').addEventListener('click', e => {
    if (!selected) return; const b = GF.at(state, selected.x, selected.y); if (!b) return;
    if (e.target.closest('#upgrade-building')) { const r = GF.upgrade(state, b); if (!r.ok) return blocked($('upgrade-building'), r.reason); tone(); toast(GF.name(b) + ' · 升至 Lv.' + b.level); }
    else if (e.target.closest('#demolish-building')) { const r = GF.demolish(state, b); if (!r.ok) return; toast('已拆除，返还 ' + r.refund + ' 铜钱'); }
    else return;
    panelKey = ''; handleEvents(); save(); refresh();
  });
  for (const el of document.querySelectorAll('[data-category]')) el.addEventListener('click', () => { category = el.dataset.category; panelKey = ''; $('cards').scrollLeft = 0; renderPanel(); });
  for (const el of document.querySelectorAll('[data-skill]')) el.addEventListener('click', () => { const r = GF.skill(state, el.dataset.skill); if (!r.ok) return blocked(el, r.reason); tone('skill'); toast(GF.SKILLS[el.dataset.skill].name + ' · 已施展'); save(); refresh(); });
  function locateMission() {
    if (state.mission === 4 || state.mission >= 7) { center(); select(8, 8); return; }
    const type = ['tea','inn','tower','earth',null,'bank','guild'][state.mission] || 'tea';
    let candidates = [];
    for (let y=1;y<GF.SIZE-1;y++) for(let x=1;x<GF.SIZE-1;x++) {
      if (GF.at(state,x,y)) continue;
      const d = GF.DEFS[type]; if(d.terrain && GF.terrain(x,y)!==d.terrain) continue;
      if(d.prev && !GF.adjacent(state,x,y).some(b=>b.type===d.prev)) continue;
      candidates.push({x,y,score: Math.hypot(x-7,y-8) + (d.neighbors ? (d.neighbors-GF.terminalCount(state,x,y))*10 : 0)});
    }
    candidates.sort((a,b)=>a.score-b.score); const p=candidates[0] || {x:7,y:8};
    select(p.x,p.y);category=GF.DEFS[type].cat;panelKey='';refresh();
    // Only this explicit locate action moves the view; opening a tray never shifts the map.
    cam.x=innerWidth*(innerWidth>600?.55:.5)-(p.x+.5)*GFArt.T*cam.zoom;
    cam.y=(innerWidth>600?innerHeight*.48:Math.min(innerHeight-325,Math.max(230,(innerHeight-280+270)/2)))-(p.y+.5)*GFArt.T*cam.zoom;clampCamera();
  }
  $('start-build').onclick=locateMission; $('mission-locate').onclick=locateMission; $('close-panel').onclick=closePanel;
  $('pause').onclick=()=>{paused=!paused;refresh();}; $('speed').onclick=()=>{speed=speed===1?2:speed===2?3:1;refresh();};
  $('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('recenter').onclick=center;
  $('grid-toggle').onclick=()=>{grid=!grid;$('grid-toggle').setAttribute('aria-pressed',String(grid));toast(grid?'地块网格已显示':'地块网格已隐藏');};
  $('sound').onclick=()=>{sound=!sound;$('sound').title=sound?'关闭音效':'开启音效';$('sound').setAttribute('aria-label',$('sound').title);toast(sound?'音效已开启':'音效已关闭');tone();};
  $('help').onclick=showHelp; $('menu').onclick=showMenu; $('quick-menu').onclick=showMenu;
  function modal(html) { $('modal-content').innerHTML=html;if(!$('modal').open)$('modal').showModal();refresh(); }
  function closeModal(){ $('modal').close();lastFrame=performance.now();refresh(); }
  $('close-modal').onclick=closeModal; $('modal').addEventListener('close',()=>{lastFrame=performance.now();refresh();});
  $('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
  function showHelp(){modal(`<p class="modal-kicker">GU FANG QI TAN · 游玩指南</p><h2>从一盏灯火开始</h2><p>日间兴百业，夜里守一方。守过七夜，见证古坊初兴；此后仍可继续经营。</p><div class="help-row"><b>壹</b><div><strong>起点看地形，后面挨着建</strong><p>平地茶肆 → 客栈 → 钱庄<br>水边农田 → 磨坊 → 酒坊<br>林地桑园 → 织坊 → 成衣铺<br>山地石场 → 瓷窑 → 商号<br>相邻只算上下左右。升级时，相邻前置也需达到目标等级。</p></div></div><div class="help-row"><b>贰</b><div><strong>白昼置业，黄昏布防</strong><p>白昼 85 秒，黄昏 12 秒。铜钱与香火持续自动产出。白天每 2 秒修复建筑 5% 耐久。先建两座箭塔，再发展产业更稳妥。</p></div></div><div class="help-row"><b>叁</b><div><strong>长夜守坊，借神力退敌</strong><p>防御建筑自动攻击，兵营自动派民兵。夜间消耗香火施展驱鬼、修复；道观解锁天雷。祠堂被毁则失守。每逢第七日，灯会赏钱与强敌一同到来。</p></div></div><div class="help-row"><b>肆</b><div><strong>会四方客，兴一座城</strong><p>会馆需相邻 2 种产业终点，市舶司需 3 种，Lv.1 即可。建成后即使前置拆除，建筑也能继续运转。</p></div></div><div class="modal-rule"></div><p>拖动移动地图，滚轮缩放；手机支持单指拖动、双指缩放。空格暂停，Esc 关闭面板。存档保存在此浏览器，离开期间游戏暂停。</p><button class="modal-primary" data-modal="close">入坊，点亮灯火</button>`);}
  function showMenu(){modal(`<p class="modal-kicker">一方烟火 · 长夜灯明</p><h2>坊中小憩</h2><p>第 ${state.day} 日 · ${GF.townName(state)} · 繁荣 ${GF.prosperity(state)}<br>此刻时光已暂停，关闭窗口即可继续。</p><button class="modal-primary" data-modal="save">保存古坊进度</button><button class="modal-secondary" data-modal="help">游玩指南与产业链</button><button class="modal-secondary" data-modal="sound">${sound?'关闭':'开启'}音效</button><div style="display:flex;gap:10px"><button class="modal-secondary" data-modal="export">导出存档</button><button class="modal-secondary" data-modal="import">导入存档</button></div><input id="save-file" type="file" accept=".json,application/json" hidden><p style="margin-top:10px;font-size:10px">自动存档每 8 秒保存一次。更换浏览器或设备前，可导出备份。</p><div class="modal-rule"></div><button class="modal-secondary danger" data-modal="reset">另起一座古坊</button>`);}
  function showEnd(){modal(`<p class="modal-kicker">灯火暂歇 · 来日再兴</p><h2>古坊失守</h2><p>祠堂在第 ${state.day} 夜失守。青山仍在，下次从更稳固的布防开始。</p><div class="modal-stats"><div><strong>${state.day-1}</strong><span>守过长夜</span></div><div><strong>${state.kills}</strong><span>击退来敌</span></div><div><strong>${GF.prosperity(state)}</strong><span>现有繁荣</span></div></div><p>两座箭塔配合木栅守住祠堂，再用土地庙供奉香火，危急时以回春诀修复。</p><button class="modal-primary" data-modal="new">重新点亮古坊</button><button class="modal-secondary" data-modal="close">看看最后的古坊</button>`);}
  function showVictory(){modal(`<p class="modal-kicker">七夜长明 · 百业初兴</p><h2>万家灯火，为你而明</h2><p>第七夜的群妖终于散去，你守住了古坊的第一场灯会。青溪两岸，故事还会继续。</p><div class="modal-stats"><div><strong>${GF.prosperity(state)}</strong><span>古坊繁荣</span></div><div><strong>${state.kills}</strong><span>累计退敌</span></div></div><button class="modal-primary" data-modal="close">继续经营，迎接下一场灯会</button>`);}
  function newGame(){state=GF.createState();paused=false;speed=1;closePanel();center();closeModal();save();refresh();toast('青溪新雨 · 古坊的故事重新开始');}
  $('modal-content').addEventListener('click',e=>{
    const action=e.target.closest('[data-modal]')?.dataset.modal;if(!action)return;
    if(action==='close')closeModal();if(action==='help')showHelp();if(action==='save')save(true);if(action==='sound'){sound=!sound;tone();showMenu();}
    if(action==='reset')modal(`<p class="modal-kicker">另起新篇</p><h2>重建古坊</h2><p>重新开始会替换此浏览器中的现有进度。可先返回菜单导出存档。</p><button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="menu">返回，保留当前古坊</button>`);
    if(action==='new')newGame();if(action==='menu')showMenu();
    if(action==='export'){const blob=new Blob([GF.serialize(state)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='古坊奇谭-第'+state.day+'日.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('存档已导出');}
    if(action==='import'){
      const input=$('save-file');input.onchange=async()=>{const file=input.files[0];if(!file)return;if(file.size>2e6){toast('存档文件过大','warning');return;}
        const loaded=GF.restore(await file.text());if(!loaded){toast('存档无效或版本不兼容，现有进度已保留','warning');return;}
        const backup=GF.serialize(state);try{localStorage.setItem(KEY+'-backup',backup);}catch{}
        state=loaded;paused=false;closePanel();center();closeModal();save();refresh();toast('已载入第 '+state.day+' 日的古坊');if(state.over)showEnd();};input.click();
    }
  });
  let gesture=null;
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1)gesture={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,dragged:false,multi:false};
    else{gesture.multi=true;gesture.dragged=true;const a=[...pointers.values()];gesture.pinchDist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);gesture.mid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};}
  });
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){const a=[...pointers.values()],mid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(gesture.pinchDist>0)zoom(dist/gesture.pinchDist,gesture.mid.x,gesture.mid.y);cam.x+=mid.x-gesture.mid.x;cam.y+=mid.y-gesture.mid.y;gesture.pinchDist=dist;gesture.mid=mid;clampCamera();}
    else{if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>5)gesture.dragged=true;if(gesture.dragged){cam.x+=e.clientX-gesture.lastX;cam.y+=e.clientY-gesture.lastY;clampCamera();}gesture.lastX=e.clientX;gesture.lastY=e.clientY;}
  });
  function pointerEnd(e){
    if(!pointers.has(e.pointerId))return;const click=gesture&&!gesture.dragged&&!gesture.multi&&e.type!=='pointercancel';pointers.delete(e.pointerId);
    if(click){const x=Math.floor((e.clientX-cam.x)/cam.zoom/GFArt.T),y=Math.floor((e.clientY-cam.y)/cam.zoom/GFArt.T);select(x,y);}
    if(pointers.size===1){const p=[...pointers.values()][0];gesture.lastX=p.x;gesture.lastY=p.y;}
    if(!pointers.size)gesture=null;
  }
  canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.001),e.clientX,e.clientY);},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  // Native touch scrolling + desktop mouse dragging for the horizontal card strip.
  const cardDrag={active:false,moved:false,suppress:false,x:0,scroll:0};
  $('cards').addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;cardDrag.active=true;cardDrag.moved=false;cardDrag.suppress=false;cardDrag.x=e.clientX;cardDrag.scroll=$('cards').scrollLeft;});
  window.addEventListener('pointermove',e=>{if(!cardDrag.active)return;if(Math.abs(e.clientX-cardDrag.x)>5)cardDrag.moved=true;if(cardDrag.moved){$('cards').scrollLeft=cardDrag.scroll-(e.clientX-cardDrag.x);cardDrag.suppress=true;}});
  window.addEventListener('pointerup',()=>{if(!cardDrag.active)return;cardDrag.active=false;setTimeout(()=>cardDrag.suppress=false,0);});
  window.addEventListener('pointercancel',()=>{cardDrag.active=false;cardDrag.suppress=false;});
  window.addEventListener('keydown',e=>{if($('modal').open)return;if(e.code==='Space'){e.preventDefault();paused=!paused;refresh();}if(e.key==='Escape')closePanel();if(e.key==='+')zoom(1.15);if(e.key==='-')zoom(1/1.15);});
  document.addEventListener('visibilitychange',()=>{hiddenPause=document.hidden;if(hiddenPause)save();lastFrame=performance.now();});
  window.addEventListener('pagehide',()=>save());window.addEventListener('resize',resize);
  function frame(now){
    const dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):0;lastFrame=now;
    if(!paused&&!$('modal').open&&!hiddenPause&&!state.over){let remaining=dt*speed;while(remaining>0){const tick=Math.min(.1,remaining);GF.step(state,tick);remaining-=tick;}handleEvents();}
    uiClock+=dt;saveClock+=dt;if(uiClock>.2){refresh();uiClock=0;}if(saveClock>8){if(!state.over)save();saveClock=0;}
    GFArt.render(canvas,state,cam,selected,{grid});requestAnimationFrame(frame);
  }
  resize();refresh();requestAnimationFrame(frame);
  if(saved&&!GF.restore(saved))toast('旧存档无法读取，已创建新古坊；原数据将在首次存档时替换','warning');
  else if(saved)toast('故人归坊 · 已续接第 '+state.day+' 日的灯火');
  if(storageWarning)$('save-status').textContent='本地存档不可用 · 可在菜单导出';
  if(state.over)showEnd();
  // Small public surface for regression tests and local debugging.
  window.Gufang={get state(){return state;},get camera(){return {...cam};},get paused(){return paused;},select,refresh,screenPoint,save,setPaused(value){paused=!!value;refresh();}};
})();
