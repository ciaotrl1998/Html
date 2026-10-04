(function () {
  'use strict';
  const $ = id => document.getElementById(id), canvas = $('map'), KEY = 'gufang-qitan-save-v1';
  let storageWarning = false, saved = null;
  try { saved = localStorage.getItem(KEY); } catch { storageWarning = true; }
  let state = (saved && GF.restore(saved)) || GF.createState(), selected = null, paused = false, sound = false;
  let saveStatus = storageWarning ? '本地存档不可用' : '本地自动存档';
  let panelKey = '', lastPhase = '', lastFrame = 0, uiClock = 0, saveClock = 0, toastTimer, audioContext, hiddenPause = document.hidden, demolishTarget = null;
  const cam = { x: 0, y: 0, zoom: 1 }, pointers = new Map();
  const view = { width: 390, height: 844 };
  function center() {
    cam.zoom = Math.max(.55, Math.min(.86, view.width / 550));
    cam.x = view.width * .5 - (GF.CENTER + .5) * GFArt.T * cam.zoom;
    cam.y = view.height * .48 - (GF.CENTER + .5) * GFArt.T * cam.zoom;
    clampCamera();
  }
  function resize() {
    GufangBoot.layout();
    const ratio = Math.min(devicePixelRatio || 1, 2), oldW = view.width, oldH = view.height;
    view.width = $('game').clientWidth; view.height = $('game').clientHeight;
    canvas.width = Math.round(view.width * ratio); canvas.height = Math.round(view.height * ratio);
    if (!canvas._ready) { center(); canvas._ready = true; } else { cam.x += (view.width - oldW) / 2; cam.y += (view.height - oldH) / 2; clampCamera(); }
  }
  function clampCamera() {
    const size = GF.SIZE * GFArt.T * cam.zoom, marginX = view.width * .3, marginY = Math.min(view.height * .3, 160);
    cam.x = Math.max(marginX - size, Math.min(view.width - marginX, cam.x));
    cam.y = Math.max(150 - size, Math.min(view.height - marginY, cam.y));
  }
  function zoom(factor, x = view.width / 2, y = view.height / 2) {
    const old = cam.zoom; cam.zoom = Math.max(.36, Math.min(1.8, old * factor));
    cam.x = x - (x - cam.x) * cam.zoom / old; cam.y = y - (y - cam.y) * cam.zoom / old; clampCamera();
  }
  function screenPoint(x, y) { const r=canvas.getBoundingClientRect();return { x: r.left + cam.x + (x + .5) * GFArt.T * cam.zoom, y: r.top + cam.y + (y + .5) * GFArt.T * cam.zoom }; }
  function localPoint(e) { const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}; }
  function toast(text, kind = 'info') { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').className = 'show ' + kind; toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200); }
  function tone(kind = 'build') {
    if (!sound) return;
    try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); const o = audioContext.createOscillator(), g = audioContext.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(kind === 'build' ? 560 : kind === 'skill' ? 260 : 740, audioContext.currentTime); o.frequency.exponentialRampToValueAtTime(kind === 'skill' ? 80 : 880, audioContext.currentTime + .15); g.gain.setValueAtTime(.055, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .22); o.connect(g); g.connect(audioContext.destination); o.start(); o.stop(audioContext.currentTime + .24); } catch { /* Audio is optional. */ }
  }
  function save(notify = false) {
    try { localStorage.setItem(KEY, GF.serialize(state)); saveStatus = '已存档 · 此设备'; if($('save-status'))$('save-status').textContent=saveStatus; if (notify) toast('已保存'); return true; }
    catch { saveStatus = '本地存档不可用'; if($('save-status'))$('save-status').textContent=saveStatus; if (notify || !storageWarning) toast('无法保存，可在菜单导出存档', 'warning'); storageWarning = true; return false; }
  }
  function select(x, y) {
    if (x < 0 || y < 0 || x >= GF.SIZE || y >= GF.SIZE || state.over) return;
    selected = { x, y }; panelKey = ''; $('cards').scrollLeft = 0; $('panel').hidden = false; $('game').classList.add('has-panel'); refresh();
  }
  function closePanel() { selected = null; panelKey = ''; $('panel').hidden = true; $('game').classList.remove('has-panel'); }
  const rateText = value => String(Math.round((value + Number.EPSILON) * 10) / 10);
  const costText = cost => [cost.coins ? cost.coins + ' 铜钱' : '', cost.materials ? cost.materials + ' 工材' : ''].filter(Boolean).join(' · ') || '免费';
  const costHTML = (cost, markMissing = false) => `<span class="cost-parts">${cost.coins ? `<span class="cost-part"><i class="coin-icon"></i><b class="cost-number${markMissing && state.coins < cost.coins ? ' insufficient' : ''}">${cost.coins}</b></span>` : ''}${cost.materials ? `<span class="cost-part"><i class="material-icon"></i><b class="cost-number${markMissing && state.materials < cost.materials ? ' insufficient' : ''}">${cost.materials}</b></span>` : ''}</span>`;
  function productionLine(resource, base, total) {
    const bonus = rateText(Math.max(0, total - base));
    return `${resource} +${rateText(base)}${bonus === '0' ? '' : `<span class="income-bonus">（+${bonus}）</span>`}/秒`;
  }
  function effect(d, b) {
    if (!d.income) return d.desc || '';
    const building = b || { type: d.id, x: selected?.x ?? GF.CENTER, y: selected?.y ?? GF.CENTER, level: 1 };
    const preview = b ? state : { ...state, buildings: [...state.buildings, building] };
    const lines = [];
    if (d.income) lines.push(productionLine(d.resource === 'materials' ? '工材' : '铜钱', d.income * GF.factor(building), GF.income(preview, building)));
    if (d.required) lines.push('全镇' + (d.auraResource === 'materials' ? '工材' : '铜钱') + '收入 +' + rateText(d.aura * 100) + '%');
    return lines.join('<br>');
  }
  function cardHTML(d) {
    const description = d.id === 'well' ? '井旁平地可建农田<br>相邻农田收入 +20%' : effect(d);
    const tag = d.chain || (d.required ? '终' : d.id === 'fortune' ? '造' : { defense: '防', support: '民', temple: '神' }[d.cat] || '坊');
    const count = d.id === 'fortune' ? `次数${state.fortuneBuilt}` : `${state.buildings.filter(b => b.type === d.id).length}/${d.limit || '∞'}`;
    return `<button class="build-card" data-build="${d.id}" aria-label="建造${d.name}"><span class="chain-tag">${tag}</span><span class="card-count">${count}</span><img src="${GFArt.thumbnail(d.id)}" alt=""><span class="card-reason" hidden></span><strong>${d.name}</strong><span class="card-price">${costHTML(GF.buildCost(state, d.id))}</span><span class="card-effect">${description}</span></button>`;
  }
  function hideBuildCard(d, x, y) {
    const plot = GF.terrain(x, y), nearby = GF.adjacent(state, x, y);
    if (plot === 'water') return true;
    if (d.cat === 'economy' && plot === 'forest' && d.id !== 'mulberry') return true;
    if (d.cat === 'economy' && plot === 'mountain' && d.id !== 'quarry') return true;
    if (d.id === 'farm') {
      if (plot !== 'shore' && !(plot === 'plain' && nearby.some(b => b.type === 'well'))) return true;
    } else if (d.terrain && plot !== d.terrain) return true;
    if (d.prev && !nearby.some(b => b.type === d.prev)) return true;
    if (d.required && d.required.some(type => !nearby.some(b => b.type === type))) return true;
    return false;
  }
  function buildListOrder(d) {
    if (d.required) return 0;
    if (d.cat === 'economy') return 3 - (d.tier || 0);
    if (d.cat === 'defense') return 4;
    if (d.id === 'fortune') return 5;
    return 6;
  }
  function detailHTML(b) {
    const d = GF.DEFS[b.type], max = b.level >= GF.maxLevel(b), hp = GF.maxHP(b), f = GF.factor(b), next = { ...b, level: b.level + 1 }, nextF = GF.factor(next);
    const description = GF.dryFarm(state, b) ? '缺水：耐久每秒 -5%' : '';
    const bonus = d.income ? rateText(Math.max(0, GF.income(state, b) - d.income * f)) : '0';
    const revenue = d.income ? `<span class="detail-revenue"><i class="${d.resource === 'materials' ? 'material-icon' : 'coin-icon'}" aria-hidden="true"></i><strong>+${rateText(d.income * f)}${bonus === '0' ? '' : `<span class="income-bonus">（+${bonus}）</span>`}</strong><small>/秒</small></span>` : '';
    let stats = `<div>耐久上限<strong>${hp}${max ? '' : ' → ' + GF.maxHP(next)}</strong></div>`;
    if (d.income) stats += `<div>${d.resource === 'materials' ? '工材' : '铜钱'} / 秒<strong>${GF.income(state, b).toFixed(1)}${max ? '' : ' → ' + GF.income(state, next).toFixed(1)}</strong></div>`;
    else if (d.damage) stats += `<div>攻击伤害<strong>${Math.round(d.damage * f)}${max ? '' : ' → ' + Math.round(d.damage * nextF)}</strong></div>`;
    else if (['well', 'stage'].includes(b.type)) { const v = { well: 20, stage: 3 }[b.type]; stats += `<div>收入加成<strong>${v * f}%${max ? '' : ' → ' + v * nextF + '%'}</strong></div>`; }
    else if (b.type === 'earth') stats += `<div>范围减伤<strong>${Math.min(65, 20 * f)}%${max ? '' : ' → ' + Math.min(65, 20 * nextF) + '%'}</strong></div>`;
    else if (b.type === 'tao') stats += `<div>防御攻击加成<strong>${Math.min(150, 15 * f)}%${max ? '' : ' → ' + Math.min(150, 15 * nextF) + '%'}</strong></div>`;
    else if (b.type === 'zhong') stats += `<div>全体减速<strong>${Math.round(GF.zhongSlow(b) * 100)}%${max ? '' : ' → ' + Math.round(GF.zhongSlow(next) * 100) + '%'}</strong></div><div>镇煞周期<strong>每 ${d.pulseInterval} 秒 · 持续 ${d.slowDuration} 秒</strong></div>`;
    return `<div class="detail"><div class="detail-title"><h3>${GF.name(b)}</h3><span class="level-badge">Lv.${b.level}</span>${revenue}<button class="demolish-button" id="demolish-building" ${b.type === 'shrine' ? 'disabled' : ''}>${b.type === 'shrine' ? '不可拆除' : '拆除'}</button></div><div class="detail-art"><img src="${GFArt.thumbnail(b.type, b.level)}" alt="${d.name}"><span>${d.chain ? d.chain + '业兴旺' : d.required ? (d.resource === 'materials' ? '百工汇聚' : '财源广进') : d.cat === 'defense' ? '守望古坊' : '人间烟火'}</span></div><div class="detail-info"><p class="detail-description" ${description ? '' : 'hidden'}>${description}</p><div class="health-row"><span>耐久</span><div class="health-track"><i id="detail-hp-fill"></i></div><span id="detail-hp"></span></div><div class="upgrade-stats">${stats}</div></div><div class="detail-actions"><button class="upgrade-button" id="upgrade-building">${max ? '已臻化境' : '升级至 Lv.' + (b.level + 1)}<small id="upgrade-label"></small></button></div></div>`;
  }
  function renderPanel() {
    if (!selected) return;
    const { x, y } = selected, b = GF.at(state, x, y);
    const buildableDefs = Object.values(GF.DEFS).filter(d => !d.unique && !d.fortuneOnly);
    const key = `${x},${y},${b?.id || ''}`;
    $('plot-label').textContent = b ? GF.DEFS[b.type].name : GF.TERRAIN[GF.terrain(x, y)] + ' · 可兴建';
    $('build-view').hidden = !!b; $('detail-view').hidden = !b;
    if (key !== panelKey) {
      panelKey = key;
      if (b) $('detail-view').innerHTML = detailHTML(b);
      else {
        const defs = buildableDefs.map((d, index) => ({ d, index, reason: GF.buildReason(state, d.id, x, y) }))
          .filter(item => !hideBuildCard(item.d, x, y))
          .sort((a, b) => Number(!!a.reason) - Number(!!b.reason) || buildListOrder(a.d) - buildListOrder(b.d) || a.index - b.index)
          .map(item => item.d);
        const scroll = $('cards').scrollLeft; $('cards').innerHTML = defs.map(cardHTML).join(''); $('cards').scrollLeft = scroll;
      }
    }
    if (b) {
      $('detail-hp').textContent = Math.ceil(Math.max(0, b.hp)) + ' / ' + GF.maxHP(b); $('detail-hp-fill').style.width = Math.max(0, b.hp / GF.maxHP(b) * 100) + '%';
      const reason = GF.upgradeReason(state, b), max = b.level >= GF.maxLevel(b);
      $('upgrade-building').classList.toggle('blocked', !!reason); $('upgrade-building').setAttribute('aria-disabled', String(!!reason));
      $('upgrade-label').innerHTML = max ? '' : costHTML(GF.upgradeCost(b), true);
    } else for (const el of $('cards').children) {
      const reason = GF.buildReason(state, el.dataset.build, x, y); el.classList.toggle('locked', !!reason); el.classList.toggle('poor', reason.startsWith('差 ')); el.setAttribute('aria-disabled', String(!!reason));
      const label = el.querySelector('.card-reason'); label.hidden = !reason || reason.startsWith('差 '); label.textContent = label.hidden ? '' : reason;
      const cost = GF.buildCost(state, el.dataset.build);
      for (const part of el.querySelectorAll('.card-price .cost-part')) {
        const resource = part.querySelector('.coin-icon') ? 'coins' : 'materials';
        part.querySelector('.cost-number').classList.toggle('insufficient', state[resource] < cost[resource]);
      }
    }
  }
  const fmt = n => n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : Math.floor(n).toLocaleString('en-US');
  function refresh() {
    $('coins').textContent = fmt(state.coins); $('materials').textContent = fmt(state.materials);
    $('day-label').textContent = '第 ' + state.day + ' 日 · ' + ({ day: '白昼', dusk: '黄昏', night: '长夜' }[state.phase]) + (state.day % 7 === 0 ? ' · 灯会' : '');
    $('phase-icon').textContent = { day: '☀', dusk: '◒', night: '☾' }[state.phase];
    const remaining = state.phase === 'day' ? GF.DAY - state.time : GF.DUSK - state.time;
    $('day-fill').style.width = state.phase === 'night' ? Math.max(0, 100 * ((state.wave?.total || 1) - (state.wave?.spawned || 0) + state.enemies.length) / (state.wave?.total || 1)) + '%' : Math.max(0, remaining / (state.phase === 'day' ? GF.DAY : GF.DUSK) * 100) + '%';
    $('countdown').textContent = state.phase === 'night' ? state.enemies.length + ' 敌' : Math.max(0, Math.ceil(remaining)) + 's';
    $('night-warning').hidden = state.phase === 'day';
    $('night-warning').textContent = state.phase === 'dusk' ? ['北','东','南','西'][state.direction] + '方即将来袭' : (state.wave?.boss ? '四方来袭' : ['北','东','南','西'][state.direction] + '方来袭') + ' · ' + (state.wave?.spawned || 0) + ' / ' + (state.wave?.total || 0);
    $('skills').hidden = state.phase !== 'night' || state.over;
    for (const el of document.querySelectorAll('[data-skill]')) {
      const id = el.dataset.skill, reason = GF.skillReason(state, id);
      el.classList.toggle('unavailable', !!reason); el.setAttribute('aria-disabled', String(!!reason));
      el.querySelector('small').textContent = state.cooldowns[id] > 0 ? Math.ceil(state.cooldowns[id]) + ' 秒' : '可施展';
    }
    if (lastPhase !== state.phase) { document.body.classList.toggle('night', state.phase === 'night'); lastPhase = state.phase; }
    renderPanel();
  }
  function handleEvents() {
    const events = state.events.splice(0); if (!events.length) return;
    const important = events.find(e => ['victory', 'defeat'].includes(e.kind));
    if (important?.kind === 'defeat') { save(); showEnd(); }
    else if (important?.kind === 'victory') { save(); showVictory(); }
    else { const e = events[events.length - 1]; if (!e.text.startsWith('坊志达成')) toast(e.text, e.kind); if (e.kind === 'reward') tone('reward'); }
  }
  function blocked(el, reason) { el?.classList.remove('shake'); if (el) { void el.offsetWidth; el.classList.add('shake'); } toast(reason, 'warning'); }
  function performBuild(type, el) {
    if (!selected) return; const r = GF.build(state, type, selected.x, selected.y);
    if (!r.ok) return blocked(el, r.reason);
    tone(); panelKey = ''; toast(type === 'fortune' ? '造化匣化为' + GF.name(r.building) : GF.DEFS[type].name + '已建成'); handleEvents(); save(); refresh();
  }
  $('cards').addEventListener('click', e => { const el = e.target.closest('[data-build]'); if (el && !cardDrag.suppress) performBuild(el.dataset.build, el); });
  $('detail-view').addEventListener('click', e => {
    if (!selected) return; const b = GF.at(state, selected.x, selected.y); if (!b) return;
    if (e.target.closest('#upgrade-building')) {
      const r = GF.upgrade(state, b); if (!r.ok) return blocked($('upgrade-building'), r.reason);
      tone(); toast(GF.name(b) + ' · 升至 Lv.' + b.level);
      panelKey = ''; handleEvents(); save(); refresh();
    } else if (e.target.closest('#demolish-building')) {
      const reason = GF.demolishReason(state, b); if (reason) return blocked($('demolish-building'), reason);
      demolishTarget = b;
      const cost=b.originCost||GF.DEFS[b.type].cost,refund={coins:Math.floor(cost.coins*.4),materials:Math.floor(cost.materials*.4)};
      modal('<p class="modal-kicker">拆除建筑</p><h2>拆除' + GF.name(b) + '？</h2><p>拆除后返还 ' + costText(refund) + '，且无法恢复。</p>' + (b.type === 'well' ? '<p>失去水井的非水岸农田会持续掉耐久。</p>' : '') + '<button class="modal-primary" data-modal="confirm-demolish">确认拆除</button><button class="modal-secondary" data-modal="cancel-demolish">返回</button>');
    }
  });
  for (const el of document.querySelectorAll('[data-skill]')) el.addEventListener('click', () => { const r = GF.skill(state, el.dataset.skill); if (!r.ok) return blocked(el, r.reason); tone('skill'); toast(GF.SKILLS[el.dataset.skill].name + ' · 已施展'); save(); refresh(); });
  $('close-panel').onclick = closePanel;
  $('menu-pause').onclick = showMenu;
  function modal(html) {
    paused = true;
    $('modal-content').innerHTML = html;
    $('modal').hidden = false;
    $('menu-pause').setAttribute('aria-expanded', 'true');
    $('close-modal').focus(); refresh();
  }
  function closeModal() {
    $('modal').hidden = true; paused = false;
    $('menu-pause').setAttribute('aria-expanded', 'false');
    $('menu-pause').focus(); lastFrame = performance.now(); refresh();
  }
  $('close-modal').onclick = closeModal;
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  function showMenu() {
    modal('<p class="modal-kicker">古坊奇谭</p><h2>已暂停</h2><p>第 ' + state.day + ' 日</p><button class="modal-primary" data-modal="close">继续游戏</button><button class="modal-secondary" data-modal="save">保存进度</button><button class="modal-secondary" data-modal="sound">音效：' + (sound ? '开' : '关') + '</button><div class="modal-row"><button class="modal-secondary" data-modal="export">导出存档</button><button class="modal-secondary" data-modal="import">导入存档</button></div><input id="save-file" type="file" accept=".json,application/json" hidden><button class="modal-secondary danger" data-modal="reset">重新开始</button><p id="save-status">' + saveStatus + '</p>');
  }
  function showEnd() {
    modal('<p class="modal-kicker">第 ' + state.day + ' 夜</p><h2>古坊失守</h2><div class="modal-stats"><div><strong>' + (state.day - 1) + '</strong><span>守过长夜</span></div><div><strong>' + state.kills + '</strong><span>击退来敌</span></div></div><button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="close">返回古坊</button>');
  }
  function showVictory() {
    modal('<p class="modal-kicker">七夜长明</p><h2>古坊初兴</h2><div class="modal-stats"><div><strong>' + state.buildings.length + '</strong><span>现存建筑</span></div><div><strong>' + state.kills + '</strong><span>击退来敌</span></div></div><button class="modal-primary" data-modal="close">继续游戏</button>');
  }
  function newGame(){state=GF.createState();paused=false;closePanel();center();closeModal();save();refresh();toast('青溪新雨 · 古坊的故事重新开始');}
  $('modal-content').addEventListener('click',e=>{
    const action=e.target.closest('[data-modal]')?.dataset.modal;if(!action)return;
    if(action==='close')closeModal();if(action==='save')save(true);if(action==='sound'){sound=!sound;tone();showMenu();}
    if(action==='confirm-demolish'){const b=demolishTarget;demolishTarget=null;const r=b?GF.demolish(state,b):{ok:false};closeModal();if(r.ok){toast(r.dryFarms ? '已拆除，' + r.dryFarms + ' 块农田缺水，耐久持续下降' : '已拆除，返还 ' + costText(r.refund), r.dryFarms ? 'warning' : 'info');panelKey='';handleEvents();save();}refresh();}
    if(action==='cancel-demolish'){demolishTarget=null;closeModal();}
    if(action==='reset')modal(`<p class="modal-kicker">另起新篇</p><h2>重建古坊</h2><p>重新开始会替换此浏览器中的现有进度。可先返回菜单导出存档。</p><button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="menu">返回，保留当前古坊</button>`);
    if(action==='new')newGame();if(action==='menu')showMenu();
    if(action==='export'){const blob=new Blob([GF.serialize(state)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='古坊奇谭-第'+state.day+'日.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('存档已导出');}
    if(action==='import'){
      const input=$('save-file');input.onchange=async()=>{const file=input.files[0];if(!file)return;if(file.size>2e6){toast('存档文件过大','warning');return;}
        const loaded=GF.restore(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(file);}));if(!loaded){toast('存档无效或版本不兼容，现有进度已保留','warning');return;}
        const backup=GF.serialize(state);try{localStorage.setItem(KEY+'-backup',backup);}catch{}
        state=loaded;paused=false;closePanel();center();closeModal();save();refresh();toast('已载入第 '+state.day+' 日的古坊');if(state.over)showEnd();};input.click();
    }
  });
  let gesture=null;
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;canvas.setPointerCapture(e.pointerId);const p=localPoint(e);pointers.set(e.pointerId,p);
    if(pointers.size===1)gesture={x:p.x,y:p.y,lastX:p.x,lastY:p.y,dragged:false,multi:false};
    else{gesture.multi=true;gesture.dragged=true;const a=[...pointers.values()];gesture.pinchDist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);gesture.mid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};}
  });
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;const p=localPoint(e);pointers.set(e.pointerId,p);
    if(pointers.size>=2){const a=[...pointers.values()],mid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(gesture.pinchDist>0)zoom(dist/gesture.pinchDist,gesture.mid.x,gesture.mid.y);cam.x+=mid.x-gesture.mid.x;cam.y+=mid.y-gesture.mid.y;gesture.pinchDist=dist;gesture.mid=mid;clampCamera();}
    else{if(Math.hypot(p.x-gesture.x,p.y-gesture.y)>5)gesture.dragged=true;if(gesture.dragged){cam.x+=p.x-gesture.lastX;cam.y+=p.y-gesture.lastY;clampCamera();}gesture.lastX=p.x;gesture.lastY=p.y;}
  });
  function pointerEnd(e){
    if(!pointers.has(e.pointerId))return;const click=gesture&&!gesture.dragged&&!gesture.multi&&e.type!=='pointercancel';pointers.delete(e.pointerId);
    if(click){const p=localPoint(e),x=Math.floor((p.x-cam.x)/cam.zoom/GFArt.T),y=Math.floor((p.y-cam.y)/cam.zoom/GFArt.T);select(x,y);}
    if(pointers.size===1){const p=[...pointers.values()][0];gesture.lastX=p.x;gesture.lastY=p.y;}
    if(!pointers.size)gesture=null;
  }
  canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=localPoint(e);zoom(Math.exp(-e.deltaY*.001),p.x,p.y);},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  // Native touch scrolling + desktop mouse dragging for the horizontal card strip.
  const cardDrag={active:false,moved:false,suppress:false,x:0,scroll:0};
  $('cards').addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;cardDrag.active=true;cardDrag.moved=false;cardDrag.suppress=false;cardDrag.x=e.clientX;cardDrag.scroll=$('cards').scrollLeft;});
  window.addEventListener('pointermove',e=>{if(!cardDrag.active)return;if(Math.abs(e.clientX-cardDrag.x)>5)cardDrag.moved=true;if(cardDrag.moved){$('cards').scrollLeft=cardDrag.scroll-(e.clientX-cardDrag.x);cardDrag.suppress=true;}});
  window.addEventListener('pointerup',()=>{if(!cardDrag.active)return;cardDrag.active=false;setTimeout(()=>cardDrag.suppress=false,0);});
  window.addEventListener('pointercancel',()=>{cardDrag.active=false;cardDrag.suppress=false;});
  window.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();if(paused)closeModal();else showMenu();}if(e.key==='Escape'){if(paused)closeModal();else closePanel();}});
  document.addEventListener('visibilitychange',()=>{hiddenPause=document.hidden;if(hiddenPause)save();lastFrame=performance.now();});
  window.addEventListener('pagehide',()=>save());window.addEventListener('resize',resize);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',resize);
  function frame(now){
    const dt=lastFrame?Math.max(0,Math.min(1,(now-lastFrame)/1000)):0;lastFrame=now;
    if(!paused&&!hiddenPause&&!state.over){let remaining=dt;while(remaining>0){const tick=Math.min(.1,remaining);GF.step(state,tick);remaining-=tick;}handleEvents();}
    uiClock+=dt;saveClock+=dt;if(uiClock>.2){refresh();uiClock=0;}if(saveClock>8){if(!state.over)save();saveClock=0;}
    GFArt.render(canvas,state,cam,selected,{grid:false});requestAnimationFrame(frame);
  }
  resize();refresh();requestAnimationFrame(frame);
  if(saved&&!GF.restore(saved))toast('旧存档无法读取，已创建新古坊；原数据将在首次存档时替换','warning');
  else if(saved)toast('故人归坊 · 已续接第 '+state.day+' 日的灯火');
  
  if(state.over)showEnd();
  // Small public surface for regression tests and local debugging.
  window.Gufang={get state(){return state;},get camera(){return {...cam};},get paused(){return paused;},select,refresh,screenPoint,save,setPaused(value){if(value)showMenu();else closeModal();}};
})();
