(function () {
  'use strict';
  const $ = id => document.getElementById(id), canvas = $('map'), KEY = 'gufang-qitan-save-v1';
  let storageWarning = false, saved = null;
  try { saved = localStorage.getItem(KEY); } catch { storageWarning = true; }
  const categories = ['economy', 'defense', 'support', 'temple'];
  let savedCategory = null;
  try { savedCategory = localStorage.getItem(KEY + '-category'); } catch { /* Session selection still works. */ }
  let state = (saved && GF.restore(saved)) || GF.createState(), selected = null, category = categories.includes(savedCategory) ? savedCategory : 'economy', paused = false, sound = false;
  let saveStatus = storageWarning ? '本地存档不可用' : '本地自动存档';
  let panelKey = '', lastPhase = '', lastFrame = 0, uiClock = 0, saveClock = 0, toastTimer, audioContext, hiddenPause = document.hidden;
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
  function effect(d, b) {
    if (d.neighbors) return '收入 +' + d.income + '/秒 · 全镇 +' + d.aura * 100 + '%';
    if (d.cat === 'economy') return '铜钱 +' + (b ? GF.income(state, b).toFixed(1) : d.income) + ' / 秒';
    return d.desc || '';
  }
  function cardHTML(d) {
    return `<button class="build-card" data-build="${d.id}" aria-label="建造${d.name}"><span class="chain-tag">${d.chain ? d.chain + '业' : d.neighbors ? '终极' : ''}</span><img src="${GFArt.thumbnail(d.id)}" alt=""><span class="card-reason" hidden></span><strong>${d.name}</strong><span class="card-price"><i class="coin-icon"></i> ${d.cost}</span><span class="card-effect">${effect(d)}</span></button>`;
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
    return `<div class="detail"><div class="detail-art"><img src="${GFArt.thumbnail(b.type, b.level)}" alt="${d.name}"><span>${d.chain ? d.chain + '业兴旺' : d.neighbors ? '四方来客' : d.cat === 'defense' ? '守望古坊' : '人间烟火'}</span></div><div class="detail-info"><div class="detail-title"><h3>${GF.name(b)}</h3><span class="level-badge">Lv.${b.level}${max ? ' · 满级' : ''}</span></div><p class="detail-description">${effect(d, b)}</p><div class="health-row"><span>耐久</span><div class="health-track"><i id="detail-hp-fill"></i></div><span id="detail-hp"></span></div><div class="upgrade-stats">${stats}</div></div><div class="detail-actions"><button class="upgrade-button" id="upgrade-building">${max ? '已臻化境' : '升级至 Lv.' + (b.level + 1)}<small id="upgrade-label"></small></button><button class="demolish-button${state.phase === 'night' ? ' night-restricted' : ''}" id="demolish-building" ${b.type === 'shrine' ? 'disabled' : ''}>${b.type === 'shrine' ? '古坊根基 · 不可拆除' : state.phase === 'night' ? '夜晚不可拆除' : '拆除 · 返还 ' + Math.floor(d.cost * .4) + ' 铜钱'}</button></div></div>`;
  }
  function renderPanel() {
    if (!selected) return;
    const { x, y } = selected, b = GF.at(state, x, y);
    const availability = b ? '' : Object.values(GF.DEFS).filter(d => d.cat === category && !d.unique).map(d => GF.buildReason(state, d.id, x, y) ? 0 : 1).join('');
    const key = `${x},${y},${category},${state.revision},${b?.id || ''},${availability},${state.phase}`;
    $('plot-label').textContent = b ? GF.DEFS[b.type].name : GF.TERRAIN[GF.terrain(x, y)] + (state.phase === 'night' ? ' · 夜晚停工' : ' · 可兴建');
    $('plot-coord').textContent = '地块 ' + (x + 1) + ' · ' + (y + 1);
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
    $('coins').textContent = fmt(state.coins); $('incense').textContent = fmt(state.incense);
    $('prosperity').textContent = GF.prosperity(state);
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
      el.querySelector('small').textContent = state.cooldowns[id] > 0 ? Math.ceil(state.cooldowns[id]) + ' 秒' : id === 'thunder' && !state.buildings.some(b => b.type === 'tao') ? '需道观' : GF.SKILLS[id].cost + ' 香火';
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
    tone(); panelKey = ''; toast(GF.DEFS[type].name + '已建成'); handleEvents(); save(); refresh();
  }
  $('cards').addEventListener('click', e => { const el = e.target.closest('[data-build]'); if (el && !cardDrag.suppress) performBuild(el.dataset.build, el); });
  $('detail-view').addEventListener('click', e => {
    if (!selected) return; const b = GF.at(state, selected.x, selected.y); if (!b) return;
    if (e.target.closest('#upgrade-building')) { const r = GF.upgrade(state, b); if (!r.ok) return blocked($('upgrade-building'), r.reason); tone(); toast(GF.name(b) + ' · 升至 Lv.' + b.level); }
    else if (e.target.closest('#demolish-building')) { const r = GF.demolish(state, b); if (!r.ok) return blocked($('demolish-building'), r.reason); toast('已拆除，返还 ' + r.refund + ' 铜钱'); }
    else return;
    panelKey = ''; handleEvents(); save(); refresh();
  });
  for (const el of document.querySelectorAll('[data-category]')) el.addEventListener('click', () => { category = el.dataset.category; try { localStorage.setItem(KEY + '-category', category); } catch { /* Keep the tab for this session. */ } panelKey = ''; $('cards').scrollLeft = 0; renderPanel(); });
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
    modal('<p class="modal-kicker">古坊奇谭</p><h2>已暂停</h2><p>第 ' + state.day + ' 日 · ' + GF.townName(state) + '</p><button class="modal-primary" data-modal="close">继续游戏</button><button class="modal-secondary" data-modal="save">保存进度</button><button class="modal-secondary" data-modal="sound">音效：' + (sound ? '开' : '关') + '</button><div class="modal-row"><button class="modal-secondary" data-modal="export">导出存档</button><button class="modal-secondary" data-modal="import">导入存档</button></div><input id="save-file" type="file" accept=".json,application/json" hidden><button class="modal-secondary danger" data-modal="reset">重新开始</button><p id="save-status">' + saveStatus + '</p>');
  }
  function showEnd() {
    modal('<p class="modal-kicker">第 ' + state.day + ' 夜</p><h2>古坊失守</h2><div class="modal-stats"><div><strong>' + (state.day - 1) + '</strong><span>守过长夜</span></div><div><strong>' + state.kills + '</strong><span>击退来敌</span></div></div><button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="close">返回古坊</button>');
  }
  function showVictory() {
    modal('<p class="modal-kicker">七夜长明</p><h2>古坊初兴</h2><div class="modal-stats"><div><strong>' + GF.prosperity(state) + '</strong><span>繁荣</span></div><div><strong>' + state.kills + '</strong><span>击退来敌</span></div></div><button class="modal-primary" data-modal="close">继续游戏</button>');
  }
  function newGame(){state=GF.createState();paused=false;closePanel();center();closeModal();save();refresh();toast('青溪新雨 · 古坊的故事重新开始');}
  $('modal-content').addEventListener('click',e=>{
    const action=e.target.closest('[data-modal]')?.dataset.modal;if(!action)return;
    if(action==='close')closeModal();if(action==='save')save(true);if(action==='sound'){sound=!sound;tone();showMenu();}
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
