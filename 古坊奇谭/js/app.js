(function () {
  'use strict';
  const $ = id => document.getElementById(id), canvas = $('map'), KEY = 'gufang-qitan-save-v1';
  let storageWarning = false, saved = null;
  try { saved = localStorage.getItem(KEY); } catch { storageWarning = true; }
  const SOUND_KEY = 'gufang-qitan-sound';
  const GRID_KEY = 'gufang-qitan-grid';
  let grid = true;
  try { grid = localStorage.getItem(GRID_KEY) !== 'off'; } catch { /* Settings are optional. */ }
  let state = (saved && GF.restore(saved)) || GF.createState(), selected = null, paused = true, sound = false, started = false;
  try { sound = localStorage.getItem(SOUND_KEY) === 'on'; } catch { /* Settings are optional. */ }
  let saveStatus = storageWarning ? '本地存档不可用' : '本地自动存档';
  let autoplay = false, pilot = null, partnerPilot = null, computerSeat = false;
  let online = null, syncClock = 0, actionId = 0;
  let remoteMotion = new Map(), remoteAt = 0, remoteSpan = 100, remoteEffects = [], remoteProjectiles = [];
  function remotePosition(unit, soldier) {
    const motion = remoteMotion.get((soldier ? 's' : 'e') + unit.id);
    if (!motion) return unit;
    const fraction = Math.max(0, Math.min(1, (performance.now() - remoteAt) / remoteSpan));
    return { x: motion.x + (unit.x - motion.x) * fraction, y: motion.y + (unit.y - motion.y) * fraction };
  }
  function receiveVisuals(next, message, reset) {
    const now = performance.now(), positions = new Map();
    if (!reset) for (const [units, soldier] of [[state.enemies,false],[state.soldiers,true]]) for (const unit of units) positions.set((soldier?'s':'e')+unit.id,remotePosition(unit,soldier));
    remoteMotion = positions; remoteSpan = Math.max(60,Math.min(200,now-remoteAt)); remoteAt = now;
    const clean = (items, projectile) => Array.isArray(items) ? items.slice(-500).filter(e => e && typeof e.type==='string' && e.type.length<24 && ['x','y','life','total'].every(k=>Number.isFinite(e[k])) && Math.abs(e.x)<100 && Math.abs(e.y)<100 && e.life>0 && e.total>0 && e.total<=10 && e.life<=e.total && (!projectile || ['tx','ty'].every(k=>Number.isFinite(e[k])&&Math.abs(e[k])<100))).map(e=>({type:e.type,x:e.x,y:e.y,life:e.life,total:e.total,tx:e.tx,ty:e.ty,amount:Number.isFinite(e.amount)?e.amount:0,resource:e.resource==='materials'?'materials':'coins'})) : [];
    remoteEffects = clean(message.visuals?.effects, false);
    remoteProjectiles = clean(message.visuals?.projectiles || next.projectiles, true);
  }
  const playerOwner = () => online?.role === 'guest' ? 1 : 0;
  const playerState = () => state.mode === 'coop' ? GF.playerView(state, playerOwner()) : state;
  const onlineSend = message => { if (online?.socket?.readyState === WebSocket.OPEN) online.socket.send(JSON.stringify(message)); };
  function sendSnapshot() {
    if (online?.role !== 'host' || !online.peerConnected || !started || online.socket.readyState !== WebSocket.OPEN || online.socket.bufferedAmount > 300000) return;
    onlineSend({ type: 'state', snapshot: GF.serialize(state), paused: paused || hiddenPause, visuals: { effects: state.effects.slice(-300), projectiles: state.projectiles.slice(-500) } });
  }
  function leaveOnline() {
    if (!online) return;
    const { socket, kind } = online; online = null;
    if (kind === 'direct') { if (socket?.readyState === 1) socket.send(JSON.stringify({type:'leave'})); setTimeout(() => socket?.close(), 100); return; }
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }
  function guestAction(kind, extras = {}) {
    if (!online || online.role !== 'guest' || !online.peerConnected || !started) { toast('与主机连接中，请稍候', 'warning'); return; }
    onlineSend({ type: 'action', id: ++actionId, kind, x: selected?.x ?? 0, y: selected?.y ?? 0, ...extras });
  }
  function hostAction(message) {
    if (online?.role !== 'host' || !online.peerConnected || !started || state.over) return;
    if (!Number.isSafeInteger(message.id) || !Number.isInteger(message.x) || !Number.isInteger(message.y) ||
        !['build','upgrade','bulk','demolish','skill'].includes(message.kind) ||
        (message.kind === 'build' && !Object.prototype.hasOwnProperty.call(GF.DEFS, message.building)) ||
        (message.kind === 'skill' && !Object.prototype.hasOwnProperty.call(GF.SKILLS, message.skill))) return;
    const { x, y, kind } = message, mine = GF.playerView(state, 1), b = GF.at(state, x, y);
    let result = { ok: false, reason: '无法操作该地块' };
    if (kind === 'skill') result = GF.skill(mine, message.skill);
    else if (GF.owns(mine, x, y) && !GF.isWall(state, x, y)) {
      if (kind === 'build') result = GF.build(mine, message.building, x, y);
      else if (b && b.owner === 1 && kind === 'upgrade') result = GF.upgrade(mine, b);
      else if (b && b.owner === 1 && kind === 'bulk') result = GF.bulkUpgrade(mine, b);
      else if (b && b.owner === 1 && kind === 'demolish') result = GF.demolish(mine, b);
    }
    onlineSend({ type: 'result', id: message.id, ok: !!result.ok, reason: result.reason || '' });
    if (result.ok) { panelKey = ''; handleEvents(); save(); refresh(); sendSnapshot(); }
  }
  function receiveOnline(message) {
    if (!online) return;
    if (message.type === 'started' && online.role === 'guest') {
      online.started = true; online.awaitingState = true; updateCoopSeat();
    } else if (message.type === 'state' && online.role === 'guest') {
      const next = GF.restore(message.snapshot);
      if (!next || next.mode !== 'coop') return;
      const first = !started || online.awaitingState || state.mapSeed !== next.mapSeed || state.estateSeed !== next.estateSeed;
      const ended = !state.over && next.over;
      receiveVisuals(next, message, first);
      state = next; online.hostPaused = !!message.paused; online.awaitingState = false;
      if (first) { enterGame(next); center(1); }
      if (selected && !GF.owns(playerState(), selected.x, selected.y)) closePanel();
      refresh();
      if (ended || (first && state.over)) showEnd();
    } else if (message.type === 'action' && online.role === 'host') hostAction(message);
    else if (message.type === 'result' && online.role === 'guest') {
      if (!message.ok) toast(message.reason || '操作未成功', 'warning');
      else { tone(); toast('操作成功'); }
    } else if (message.type === 'leave' && online.kind === 'direct') {
      online.peerConnected = false;
      if (online.role === 'guest') { showStartMenu(); toast('主机已退出直连'); }
      else { updateCoopSeat(); toast('队友已退出，游戏暂停等待重新配对', 'warning'); }
    } else if (message.type === 'error' && online.kind === 'server') { toast(message.message || '联机失败', 'warning'); if (started) showStartMenu(); else { leaveOnline(); updateCoopSeat(); } }
  }
  function connectOnline(kind, code = '') {
    if (!/^https?:$/.test(location.protocol)) { toast('联机需要通过局域网服务器打开游戏', 'warning'); return; }
    leaveOnline();
    const socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    online = { kind:'server', socket, role: kind === 'create' ? 'host' : 'guest', code, peerConnected: false, started: false };
    socket.onopen = () => { if (online?.socket === socket) onlineSend({ type: kind, code }); };
    socket.onmessage = event => {
      if (online?.socket !== socket) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'created' || message.type === 'joined') {
        online.code = message.code; online.peerConnected = message.type === 'created' ? false : true;
        $('lan-code').value = message.code; updateCoopSeat();
        toast(message.type === 'created' ? '房间已创建，请把房间号告诉队友' : '已加入房间，等待主机开始');
      } else if (message.type === 'peer_joined') {
        online.peerConnected = true; updateCoopSeat(); toast('队友已加入'); if (started) sendSnapshot();
      } else if (message.type === 'peer_left') {
        online.peerConnected = false; updateCoopSeat(); toast('队友已断开，游戏已暂停等待重连', 'warning');
      } else if (message.type === 'host_left') {
        toast('主机已离开房间', 'warning'); leaveOnline(); if (started) showStartMenu(); else updateCoopSeat();
      } else receiveOnline(message);
    };
    socket.onclose = () => {
      if (online?.socket !== socket) return;
      const role = online.role, code = online.code;
      online.peerConnected = false;
      if (role === 'guest' && code) {
        toast('连接中断，正在重新加入房间', 'warning');
        setTimeout(() => { if (online?.socket === socket) connectOnline('join', code); }, 1500);
      } else { toast('联机已断开，请返回等待界面重新创建房间', 'warning'); if (!started) leaveOnline(); }
      updateCoopSeat();
    };
    socket.onerror = () => { if (online?.socket === socket) toast('无法连接联机服务器，请确认设备已连接同一局域网', 'warning'); };
    updateCoopSeat();
  }
  async function showDirectCode(session, code, label) {
    if (online !== session) return;
    $('direct-output-area').hidden = false; $('direct-output-label').textContent = label;
    $('direct-output').value = code; $('direct-qr').hidden = true;
    try { const url = await GFDirect.qr(code); if (online === session) { $('direct-qr').src = url; $('direct-qr').hidden = false; $('direct-output-area').scrollIntoView({block:'start',behavior:'smooth'}); } }
    catch { if (online === session) $('direct-status').textContent = '二维码生成失败，请复制下方配对码发给对方'; }
  }
  async function beginDirect(role) {
    leaveOnline(); computerSeat = false;
    const session = { kind: 'direct', role, code: '', socket: null, peerConnected: false, started, awaitingState: role === 'guest' };
    online = session;
    $('server-controls').hidden = true; $('direct-input').value = ''; $('direct-output').value = ''; $('direct-output-area').hidden = true;
    $('direct-status').textContent = role === 'host' ? '正在生成邀请，请稍候…' : '拍摄或导入主机的邀请二维码，也可以粘贴邀请配对码';
    $('direct-input-label').textContent = role === 'host' ? '识别队友的回应二维码，或粘贴回应配对码' : '识别主机的邀请二维码，或粘贴邀请配对码';
    $('direct-apply').textContent = role === 'host' ? '使用回应码 · 完成配对' : '使用邀请码 · 生成回应';
    $('direct-apply').disabled = role === 'host';
    try {
      session.direct = GFDirect.create(role, {
        message: message => { if (online === session) receiveOnline(message); },
        status: text => { if (online === session) $('direct-status').textContent = text; },
        connected: value => {
          if (online !== session) return;
          session.peerConnected = value; updateCoopSeat(); refresh();
          if (value) {
            toast('两部手机已直连');
            if (role === 'host' && started) { enterGame(state); onlineSend({type:'started'}); sendSnapshot(); }
          } else toast('连接中断，游戏暂停等待恢复', 'warning');
        }
      });
      session.socket = session.direct.transport;
      updateCoopSeat();
      if (role === 'host') {
        const code = await session.direct.offer();
        if (online !== session) return;
        await showDirectCode(session, code, '第一步：让队友识别此邀请二维码');
        if (online !== session) return;
        $('direct-status').textContent = '邀请已生成。队友识别后会生成回应二维码，再用本机识别回应即可直连。';
        $('direct-apply').disabled = false;
      }
    } catch (error) {
      if (online === session) { $('direct-status').textContent = error.message; toast(error.message, 'warning'); leaveOnline(); updateCoopSeat(); }
    }
  }
  async function applyDirect() {
    const session = online;
    if (session?.kind !== 'direct' || !session.direct) return;
    $('direct-apply').disabled = true;
    try {
      if (session.role === 'host') await session.direct.accept($('direct-input').value);
      else {
        const code = await session.direct.answer($('direct-input').value);
        if (online !== session) return;
        await showDirectCode(session, code, '第二步：让主机识别此回应二维码');
        if (online !== session) return;
        $('direct-status').textContent = '回应已生成。请主机识别上方二维码，或把回应配对码交给主机。';
      }
    } catch (error) { if (online === session) { $('direct-status').textContent = error.message; toast(error.message, 'warning'); } }
    finally { if (online === session) $('direct-apply').disabled = false; }
  }
  function repairDirect() {
    if (online?.kind !== 'direct') return;
    const role = online.role;
    paused = true; $('modal').hidden = true; $('coop-lobby').hidden = false; $('game').classList.add('at-title'); $('lan-controls').open = true;
    beginDirect(role);
  }
  let panelKey = '', lastPhase = '', lastFrame = 0, uiClock = 0, saveClock = 0, toastTimer, audioContext, hiddenPause = document.hidden, demolishTarget = null;
  const cam = { x: 0, y: 0, zoom: 1 }, pointers = new Map();
  const view = { width: 390, height: 844 };
  function center(owner = 0) {
    cam.zoom = Math.max(.55, Math.min(.86, view.width / 550));
    const home = state.mode === 'coop' ? GF.estate(GF.playerView(state, owner)).center : {x:GF.worldCenter(state),y:GF.worldCenter(state)};
    cam.x = view.width * .5 - (home.x + .5) * GFArt.T * cam.zoom;
    cam.y = view.height * .48 - (home.y + .5) * GFArt.T * cam.zoom;
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
    const size = GF.worldWidth(state) * GFArt.T * cam.zoom, height = GF.worldHeight(state) * GFArt.T * cam.zoom, marginX = view.width * .3, marginY = Math.min(view.height * .3, 160);
    cam.x = Math.max(marginX - size, Math.min(view.width - marginX, cam.x));
    cam.y = Math.max(150 - height, Math.min(view.height - marginY, cam.y));
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
    if (!started) return false;
    if (online?.role === 'guest') { if (notify) toast('联机进度保存在主机设备上'); return false; }
    try { localStorage.setItem(KEY, GF.serialize(state)); saveStatus = '已存档 · 此设备'; if($('save-status'))$('save-status').textContent=saveStatus; if (notify) toast('已保存'); return true; }
    catch { saveStatus = '本地存档不可用'; if($('save-status'))$('save-status').textContent=saveStatus; if (notify || !storageWarning) toast('无法保存，可在菜单导出存档', 'warning'); storageWarning = true; return false; }
  }
  function select(x, y) {
    if (!started) return;
    if (x < 0 || y < 0 || x >= GF.worldWidth(state) || y >= GF.worldHeight(state) || state.over) return;
    if (GF.isWall(state, x, y)) { closePanel(); toast('庄园城墙 · 不可建设、升级或拆除'); return; }
    if (!GF.owns(playerState(), x, y)) { closePanel(); toast(state.mode === 'coop' && GF.owns(state, x, y) ? '队友的庄园 · 由队友自行经营' : '庄园外区域 · 不可建设或操作', 'warning'); return; }
    selected = { x, y }; panelKey = ''; $('cards').scrollLeft = 0; $('panel').hidden = false; $('game').classList.add('has-panel'); refresh();
  }
  function closePanel() { selected = null; panelKey = ''; $('panel').hidden = true; $('game').classList.remove('has-panel'); }
  const rateText = value => String(Math.round((value + Number.EPSILON) * 10) / 10);
  const costText = cost => [cost.coins ? cost.coins + ' 铜钱' : '', cost.materials ? cost.materials + ' 工材' : ''].filter(Boolean).join(' · ') || '免费';
  const costHTML = (cost, markMissing = false) => `<span class="cost-parts">${cost.coins ? `<span class="cost-part"><i class="coin-icon"></i><b class="cost-number${markMissing && playerState().coins < cost.coins ? ' insufficient' : ''}">${cost.coins}</b></span>` : ''}${cost.materials ? `<span class="cost-part"><i class="material-icon"></i><b class="cost-number${markMissing && playerState().materials < cost.materials ? ' insufficient' : ''}">${cost.materials}</b></span>` : ''}</span>`;
  function productionLine(resource, base, total) {
    const bonus = rateText(Math.max(0, total - base));
    return `${resource} +${rateText(base)}${bonus === '0' ? '' : `<span class="income-bonus">（+${bonus}）</span>`}/秒`;
  }
  function effect(d, b) {
    if (d.id === 'barracks') return `自动派出${GF.soldierLimit(b || { type: d.id, level: 1 })}名民兵`;
    if (!d.income) return d.desc || '';
    const building = b || { type: d.id, x: selected?.x ?? GF.worldCenter(state), y: selected?.y ?? GF.worldCenter(state), level: 1 };
    const economic = playerState(), preview = b ? economic : { ...economic, buildings: [...economic.buildings, building] };
    const lines = [];
    if (d.income) lines.push(productionLine(d.resource === 'materials' ? '工材' : '铜钱', d.income * GF.incomeFactor(building), GF.income(preview, building)));
    if (d.required) lines.push('全镇' + (d.auraResource === 'materials' ? '工材' : '铜钱') + '收入 +' + rateText(d.aura * GF.auraFactor(building) * 100) + '%');
    return lines.join('<br>');
  }
  function cardHTML(d) {
    const description = d.id === 'well' ? '井旁平地可建农田<br>相邻农田收入 +20%' : effect(d);
    const tag = d.chain || (d.required ? '终' : d.id === 'fortune' ? '造' : { defense: '防', support: '民', temple: '神' }[d.cat] || '坊');
    const count = d.id === 'fortune' ? `次数${playerState().fortuneBuilt}` : `${playerState().buildings.filter(b => b.type === d.id).length}/${d.limit || '∞'}`;
    return `<button class="build-card" data-build="${d.id}" aria-label="建造${d.name}"><span class="chain-tag">${tag}</span><span class="card-count">${count}</span><img src="${GFArt.thumbnail(d.id)}" alt=""><span class="card-reason" hidden></span><strong>${d.name}</strong><span class="card-price">${costHTML(GF.buildCost(playerState(), d.id))}</span><span class="card-effect">${description}</span></button>`;
  }
  function hideBuildCard(d, x, y) {
    const plot = GF.terrain(x, y, state), nearby = GF.adjacent(state, x, y);
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
    const name = b.type === 'gate' ? (['北','东','南','西'][b.direction] || '') + '城门' : GF.name(b), demolishReason = GF.demolishReason(playerState(), b);
    const base = d.income ? d.income * GF.incomeFactor(b) : 0;
    const bonus = d.income ? rateText(Math.max(0, GF.income(playerState(), b) - base)) : '0';
    const revenue = d.income ? `<span class="detail-revenue"><i class="${d.resource === 'materials' ? 'material-icon' : 'coin-icon'}" aria-hidden="true"></i><strong>+${rateText(base)}${bonus === '0' ? '' : `<span class="income-bonus">（+${bonus}）</span>`}</strong><small>/秒</small></span>` : '';
    let stats = `<div>耐久上限<strong>${hp}${max ? '' : ' → ' + GF.maxHP(next)}</strong></div>`;
    if (d.income) stats += `<div>${d.resource === 'materials' ? '工材' : '铜钱'} / 秒<strong>${GF.income(playerState(), b).toFixed(1)}${max ? '' : ' → ' + GF.income(playerState(), next).toFixed(1)}</strong></div>`;
    else if (b.type === 'barracks') stats += `<div>出兵上限<strong>${GF.soldierLimit(b)}${max ? '' : ' → ' + GF.soldierLimit(next)}</strong></div><div>士兵战力<strong>${GF.soldierPower(playerState(), b)}${max ? '' : ' → ' + GF.soldierPower(playerState(), next)}</strong></div>`;
    else if (d.damage) stats += `<div>攻击伤害<strong>${Math.round(d.damage * f)}${max ? '' : ' → ' + Math.round(d.damage * nextF)}</strong></div>`;
    else if (['well', 'stage'].includes(b.type)) { const v = { well: 20, stage: 3 }[b.type]; stats += `<div>收入加成<strong>${rateText(v * GF.auraFactor(b))}%${max ? '' : ' → ' + rateText(v * GF.auraFactor(next)) + '%'}</strong></div>`; }
    else if (b.type === 'earth') stats += `<div>范围减伤<strong>${Math.min(65, 20 * f)}%${max ? '' : ' → ' + Math.min(65, 20 * nextF) + '%'}</strong></div>`;
    else if (b.type === 'tao') stats += `<div>防御攻击加成<strong>${Math.min(150, 15 * f)}%${max ? '' : ' → ' + Math.min(150, 15 * nextF) + '%'}</strong></div>`;
    else if (b.type === 'zhong') stats += `<div>全体减速<strong>${Math.round(GF.zhongSlow(b) * 100)}%${max ? '' : ' → ' + Math.round(GF.zhongSlow(next) * 100) + '%'}</strong></div><div>镇煞周期<strong>每 ${d.pulseInterval} 秒 · 持续 ${d.slowDuration} 秒</strong></div>`;
    if (d.required) stats += `<div>全镇${d.auraResource === 'materials' ? '工材' : '铜钱'}收入加成<strong>${rateText(d.aura * GF.auraFactor(b) * 100)}%${max ? '' : ' → ' + rateText(d.aura * GF.auraFactor(next) * 100) + '%'}</strong></div>`;
    return `<div class="detail"><div class="detail-title"><h3>${name}</h3><span class="level-badge">Lv.${b.level}</span>${revenue}<button class="demolish-button" id="demolish-building" ${demolishReason ? 'disabled' : ''}>${demolishReason ? '不可拆除' : '拆除'}</button></div><div class="detail-art"><img src="${GFArt.thumbnail(b.type, b.level)}" alt="${name}"></div><div class="detail-info"><div class="health-row"><span>耐久</span><div class="health-track"><i id="detail-hp-fill"></i></div><span id="detail-hp"></span></div><div class="upgrade-stats">${stats}</div></div><div class="detail-actions"><button class="upgrade-button" id="upgrade-building">${max ? '已臻化境' : '升级'}<small id="upgrade-label"></small></button><button class="upgrade-button" id="bulk-upgrade-building" hidden>连升<small id="bulk-upgrade-label"></small></button></div></div>`;
  }
  function renderPanel() {
    if (!selected) return;
    const { x, y } = selected, b = GF.at(state, x, y);
    if (GF.isWall(state, x, y) || !GF.owns(playerState(), x, y)) { closePanel(); return; }
    const buildableDefs = Object.values(GF.DEFS).filter(d => !d.unique && !d.fortuneOnly && !d.fixed);
    const key = `${x},${y},${b?.id || ''},${b?.level || ''},${b?.type === 'barracks' ? GF.soldierPower(playerState(), b) : ''}`;
    $('plot-label').textContent = b ? (b.type === 'gate' ? (['北','东','南','西'][b.direction] || '') + '城门' : GF.DEFS[b.type].name) : GF.TERRAIN[GF.terrain(x, y, state)] + ' · 可兴建';
    $('build-view').hidden = !!b; $('detail-view').hidden = !b;
    if (key !== panelKey) {
      panelKey = key;
      if (b) $('detail-view').innerHTML = detailHTML(b);
      else {
        const defs = buildableDefs.map((d, index) => ({ d, index, reason: GF.buildReason(playerState(), d.id, x, y) }))
          .filter(item => !hideBuildCard(item.d, x, y))
          .sort((a, b) => Number(!!a.reason) - Number(!!b.reason) || buildListOrder(a.d) - buildListOrder(b.d) || a.index - b.index)
          .map(item => item.d);
        const scroll = $('cards').scrollLeft; $('cards').innerHTML = defs.map(cardHTML).join(''); $('cards').scrollLeft = scroll;
      }
    }
    if (b) {
      $('detail-hp').textContent = Math.ceil(Math.max(0, b.hp)) + ' / ' + GF.maxHP(b); $('detail-hp-fill').style.width = Math.max(0, b.hp / GF.maxHP(b) * 100) + '%';
      const options = GF.upgradeOptions(playerState(), b), reason = GF.upgradeReason(playerState(), b), max = b.level >= GF.maxLevel(b);
      $('upgrade-building').classList.toggle('blocked', !!reason); $('upgrade-building').setAttribute('aria-disabled', String(!!reason));
      $('upgrade-building').title = reason || '';
      $('upgrade-building').firstChild.textContent = max ? '已臻化境' : '升级';
      const bulk = $('bulk-upgrade-building');
      bulk.hidden = b.type === 'shrine' || b.type === 'gate' || options.levels < 2;
      bulk.parentElement.classList.toggle('bulk', !bulk.hidden);
      bulk.firstChild.textContent = '连升' + options.levels + '级';
      bulk.classList.toggle('blocked', !!reason); bulk.setAttribute('aria-disabled', String(!!reason));
      bulk.title = reason || '';
      const demolishReason = GF.demolishReason(playerState(), b);
      $('demolish-building').disabled = !!demolishReason; $('demolish-building').title = demolishReason || ''; $('demolish-building').textContent = demolishReason ? '不可拆除' : '拆除';
      for (const [id, html] of [['upgrade-label', max ? '' : costHTML(GF.upgradeCost(b), true)], ['bulk-upgrade-label', bulk.hidden ? '' : costHTML(options.cost, true)]]) {
        const label = $(id);
        if (label._costHTML !== html) { label.innerHTML = html; label._costHTML = html; }
      }
    } else for (const el of $('cards').children) {
      const reason = GF.buildReason(playerState(), el.dataset.build, x, y); el.classList.toggle('locked', !!reason); el.classList.toggle('poor', reason.startsWith('差 ')); el.setAttribute('aria-disabled', String(!!reason));
      const label = el.querySelector('.card-reason'); label.hidden = !reason || reason.startsWith('差 '); label.textContent = label.hidden ? '' : reason;
      const cost = GF.buildCost(playerState(), el.dataset.build);
      for (const part of el.querySelectorAll('.card-price .cost-part')) {
        const resource = part.querySelector('.coin-icon') ? 'coins' : 'materials';
        part.querySelector('.cost-number').classList.toggle('insufficient', playerState()[resource] < cost[resource]);
      }
    }
  }
  const fmt = n => n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : Math.floor(n).toLocaleString('en-US');
  function refresh() {
    const invasion = started && state.phase !== 'day';
    const directions = GF.raidDirections(state);
    $('invasion-indicators').hidden = !invasion;
    for (const el of $('invasion-indicators').children) el.hidden = !invasion || !directions.includes(Number(el.dataset.direction));
    $('coop-status').hidden = !started || state.mode !== 'coop';
    $('coop-action').textContent = online ? (online.peerConnected ? (online.hostPaused || (online.role==='host' && paused) ? '主机已暂停 · ' : '联机中 · ') + (online.kind==='direct' ? '手机直连' : '房间 ' + online.code) : '等待队友重新连接') : (paused ? '队友已暂停' : '电脑队友：' + (partnerPilot?.lastAction || '准备经营'));
    $('coop-home').textContent = '我的庄园'; $('coop-ally').textContent = online ? '队友庄园' : '电脑庄园';
    $('autoplay-status').hidden = !autoplay || !started;
    $('autoplay-status').querySelector('strong').textContent = paused ? '托管已暂停' : '托管中';
    $('autoplay-action').textContent = pilot?.lastAction || '准备经营';
    $('coins').textContent = fmt(playerState().coins); $('materials').textContent = fmt(playerState().materials);
    $('day-label').textContent = '第 ' + state.day + ' 日 · ' + ({ day: '白昼', dusk: '黄昏', night: '长夜' }[state.phase]) + (state.day % 7 === 0 ? ' · 灯会' : '');
    $('phase-icon').textContent = { day: '☀', dusk: '◒', night: '☾' }[state.phase];
    const remaining = state.phase === 'day' ? GF.DAY - state.time : GF.DUSK - state.time;
    $('day-fill').style.width = state.phase === 'night' ? Math.max(0, 100 * ((state.wave?.total || 1) - (state.wave?.spawned || 0) + state.enemies.length) / (state.wave?.total || 1)) + '%' : Math.max(0, remaining / (state.phase === 'day' ? GF.DAY : GF.DUSK) * 100) + '%';
    $('countdown').textContent = state.phase === 'night' ? '' : Math.max(0, Math.ceil(remaining)) + 's';
    $('skills').hidden = state.phase !== 'night' || state.over;
    for (const el of document.querySelectorAll('[data-skill]')) {
      const id = el.dataset.skill, reason = GF.skillReason(playerState(), id);
      el.classList.toggle('unavailable', !!reason); el.setAttribute('aria-disabled', String(!!reason));
      el.querySelector('small').textContent = playerState().cooldowns[id] > 0 ? Math.ceil(playerState().cooldowns[id]) + ' 秒' : '可施展';
    }
    if (lastPhase !== state.phase) { document.body.classList.toggle('night', state.phase === 'night'); lastPhase = state.phase; }
    renderPanel();
  }
  function handleEvents() {
    const events = state.events.splice(0); if (!events.length) return;
    const important = events.find(e => ['victory', 'defeat'].includes(e.kind));
    if (important?.kind === 'defeat') { save(); showEnd(); }
    else if (important?.kind === 'victory') { save(); if(autoplay)toast('七夜长明 · 托管继续跑测','reward');else showVictory(); }
    else { const e = events[events.length - 1]; if (!e.text.startsWith('坊志达成')) toast(e.text, e.kind); if (e.kind === 'reward') tone('reward'); }
  }
  function blocked(el, reason) { el?.classList.remove('shake'); if (el) { void el.offsetWidth; el.classList.add('shake'); } toast(reason, 'warning'); }
  function performBuild(type, el) {
    if (!selected) return;
    if (!GF.owns(playerState(), selected.x, selected.y) || GF.isWall(state, selected.x, selected.y)) { closePanel(); toast('仅可在庄园内部建设', 'warning'); return; }
    if (GF.DEFS[type]?.fixed) return blocked(el, '庄园固定建筑不可建造');
    if (online?.role === 'guest') { const reason = GF.buildReason(playerState(), type, selected.x, selected.y); if (reason) return blocked(el, reason); guestAction('build', { building: type }); return; }
    const r = GF.build(state, type, selected.x, selected.y);
    if (!r.ok) return blocked(el, r.reason);
    tone(); panelKey = ''; toast(type === 'fortune' ? '造化匣化为' + GF.name(r.building) : GF.DEFS[type].name + '已建成'); handleEvents(); save(); refresh();
  }
  $('cards').addEventListener('click', e => { const el = e.target.closest('[data-build]'); if (el && !cardDrag.suppress) performBuild(el.dataset.build, el); });
  $('detail-view').addEventListener('click', e => {
    if (!selected) return; const b = GF.at(state, selected.x, selected.y); if (!b) return;
    if (e.target.closest('#upgrade-building')) {
      const reason = GF.upgradeReason(playerState(), b); if (reason) return blocked($('upgrade-building'), reason);
      if (online?.role === 'guest') { guestAction('upgrade'); return; }
      const r = GF.upgrade(state, b); if (!r.ok) return blocked($('upgrade-building'), r.reason);
      tone(); toast(GF.name(b) + ' · 升至 Lv.' + b.level);
      panelKey = ''; handleEvents(); save(); refresh();
    } else if (e.target.closest('#bulk-upgrade-building')) {
      if (b.type === 'shrine' || b.type === 'gate') return;
      if (online?.role === 'guest') { const reason = GF.upgradeReason(playerState(), b); if (reason) return blocked($('bulk-upgrade-building'), reason); guestAction('bulk'); return; }
      const r = GF.bulkUpgrade(state, b); if (!r.ok) return blocked($('bulk-upgrade-building'), r.reason);
      tone(); panelKey = ''; handleEvents(); save(); refresh();
      toast((b.type === 'gate' ? '四座城门' : GF.name(b)) + ' · 已连升' + r.levels + '级' + (r.reason ? ' · ' + r.reason : ''), r.reason ? 'warning' : 'info');
    } else if (e.target.closest('#demolish-building')) {
      const reason = GF.demolishReason(playerState(), b); if (reason) return blocked($('demolish-building'), reason);
      demolishTarget = b;
      const cost=b.originCost||GF.DEFS[b.type].cost,refund={coins:Math.floor(cost.coins*.4),materials:Math.floor(cost.materials*.4)};
      modal('<p class="modal-kicker">拆除建筑</p><h2>拆除' + GF.name(b) + '？</h2><p>拆除后返还 ' + costText(refund) + '，且无法恢复。</p>' + (b.type === 'well' ? '<p>失去水井的非水岸农田会持续掉耐久。</p>' : '') + '<button class="modal-primary" data-modal="confirm-demolish">确认拆除</button><button class="modal-secondary" data-modal="cancel-demolish">返回</button>');
    }
  });
  for (const el of document.querySelectorAll('[data-skill]')) el.addEventListener('click', () => { const reason = GF.skillReason(playerState(), el.dataset.skill); if (reason) return blocked(el, reason); if (online?.role === 'guest') { guestAction('skill', { skill: el.dataset.skill }); return; } const r = GF.skill(state, el.dataset.skill); if (!r.ok) return blocked(el, r.reason); tone('skill'); toast(GF.SKILLS[el.dataset.skill].name + ' · 已施展'); save(); refresh(); sendSnapshot(); });
  $('close-panel').onclick = closePanel;
  $('menu-pause').onclick = showMenu;
  function updateSound() {
    $('start-sound').setAttribute('aria-checked', String(sound));
    $('start-sound-label').textContent = sound ? '已开启' : '已关闭';
  }
  function toggleSound() {
    sound = !sound;
    try { localStorage.setItem(SOUND_KEY, sound ? 'on' : 'off'); } catch { /* Keep the setting for this session. */ }
    updateSound(); tone();
  }
  function readSave() {
    try { saved = localStorage.getItem(KEY); storageWarning = false; }
    catch { saved = null; storageWarning = true; }
    return saved && GF.restore(saved);
  }
  function updateStartMenu() {
    const loaded = readSave();
    $('start-load').disabled = !loaded;
    $('start-save-detail').textContent = loaded ? '第 ' + loaded.day + ' 日 · ' + ({ day: '白昼', dusk: '黄昏', night: '长夜' }[loaded.phase]) + (loaded.over ? ' · 已失守' : ' · 继续故事') : storageWarning ? '本地存档不可用' : saved ? '存档损坏或版本不兼容' : '暂无本地存档';
    updateSound();
  }
  function showStartMenu() {
    if (started) save();
    leaveOnline();
    autoplay = false; partnerPilot = null;
    started = false; paused = true; closePanel();
    $('modal').hidden = true; $('start-menu').hidden = false; $('coop-lobby').hidden = true;
    $('game').classList.add('at-title');
    $('menu-pause').setAttribute('aria-expanded', 'false');
    updateStartMenu(); $('start-single').focus();
    refresh();
  }
  function enterGame(next) {
    autoplay = false; pilot = null;
    state = next; started = true; saveClock = 0;
    partnerPilot = state.mode === 'coop' && !online ? GFAutoplay.create(GF.playerView(state, 1)) : null;
    $('start-menu').hidden = true; $('coop-lobby').hidden = true; $('game').classList.remove('at-title');
    closePanel(); center(playerOwner()); closeModal();
  }
  $('start-single').onclick = () => {
    readSave();
    if (saved) modal('<p class="modal-kicker">另起新篇</p><h2>开启新的古坊？</h2><p>单人模式将新建古坊，并替换本地存档。想继续原来的故事，请返回并选择“读档”。</p><button class="modal-primary" data-modal="new">新建古坊</button><button class="modal-secondary" data-modal="close">返回开始菜单</button>');
    else newGame();
  };
  $('start-load').onclick = () => {
    const loaded = readSave();
    if (!loaded) { updateStartMenu(); toast('无法读取本地存档', 'warning'); return; }
    enterGame(loaded); toast('故人归坊 · 已续接第 ' + state.day + ' 日的灯火');
    if (state.over) showEnd();
  };
  $('start-sound').onclick = toggleSound;
  function updateCoopSeat() {
    const linked = online?.role === 'host' && online.peerConnected, joining = online?.role === 'guest' && online.peerConnected, direct = online?.kind === 'direct';
    $('coop-seat').setAttribute('aria-pressed', String(computerSeat));
    $('coop-seat').disabled = !!online;
    $('coop-seat').classList.toggle('is-ready', computerSeat || linked || joining);
    $('coop-avatar').textContent = computerSeat ? '智' : linked || joining ? '友' : '候';
    $('coop-seat-title').innerHTML = computerSeat ? '电脑队友<small>已就绪 · 点击切换为等待玩家</small>' : linked || joining ? '联机队友<small>已加入房间</small>' : '等待其它玩家<small>点击席位，切换为电脑</small>';
    $('coop-note').textContent = computerSeat ? '电脑将独立经营另一座庄园，与你共同抵御敌袭。' : joining ? '已连接，等待主机开始。' : linked ? '队友已就绪，可以开始合作。' : direct ? '请在下方交换邀请与回应二维码，完成手机直连。' : online?.code ? '房间号 ' + online.code + ' · 等待队友加入。' : '点击席位切换电脑队友，或展开下方进行手机直连。';
    $('lan-room').textContent = direct ? (online.peerConnected ? '两部手机已直连' : '') : online?.code ? '房间号：' + online.code + (online.peerConnected ? ' · 已连接' : ' · 等待连接') : '';
    $('direct-pair').hidden = !direct || online.peerConnected;
    $('direct-create').disabled = !!online; $('direct-join').disabled = !!online;
    $('lan-leave').hidden = !online;
    $('lan-create').disabled = !!online;
    $('lan-join').disabled = !!online;
    $('coop-start').disabled = !computerSeat && !linked;
    $('coop-start').textContent = computerSeat || linked ? '开始合作' : joining ? '等待主机开始' : '等待队友就绪';
  }
  $('start-coop').onclick = () => { computerSeat = false; $('start-menu').hidden = true; $('coop-lobby').hidden = false; $('lan-controls').open = false; updateCoopSeat(); $('coop-seat').focus(); };
  $('coop-seat').onclick = () => { if (online) return; computerSeat = !computerSeat; updateCoopSeat(); };
  $('direct-create').onclick = () => beginDirect('host');
  $('direct-join').onclick = () => beginDirect('guest');
  $('direct-apply').onclick = applyDirect;
  $('direct-photo-button').onclick = () => $('direct-photo').click();
  $('direct-file-button').onclick = () => $('direct-file').click();
  for (const id of ['direct-photo','direct-file']) $(id).onchange = async () => {
    const file = $(id).files[0], session = online; $(id).value = ''; if (!file) return;
    try { const code = await GFDirect.readImage(file); if (online === session) { $('direct-input').value = code; await applyDirect(); } }
    catch (error) { if (online === session) { $('direct-status').textContent = error.message; toast(error.message, 'warning'); } }
  };
  $('direct-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('direct-output').value); toast('配对码已复制'); }
    catch { $('direct-output').focus(); $('direct-output').select(); toast(document.execCommand('copy') ? '配对码已复制' : '请长按复制已选中的完整配对码'); }
  };
  $('server-toggle').onclick = () => { $('server-controls').hidden = !$('server-controls').hidden; };
  $('lan-create').onclick = () => { computerSeat = false; connectOnline('create'); };
  $('lan-join').onclick = () => { const code = $('lan-code').value.trim(); if (!/^\d{6}$/.test(code)) return toast('请输入六位房间号', 'warning'); computerSeat = false; connectOnline('join', code); };
  $('lan-leave').onclick = () => { if(started){showStartMenu();return;}leaveOnline(); updateCoopSeat(); toast('配对／房间已关闭'); };
  $('coop-back').onclick = showStartMenu;
  $('coop-start').onclick = () => {
    if (!computerSeat && !(online?.role === 'host' && online.peerConnected)) return;
    readSave();
    if (saved) modal('<p class="modal-kicker">双庄共守</p><h2>开启合作新局？</h2><p>将与' + (online ? '联机' : '电脑') + '队友开始合作，并替换本地存档。</p><button class="modal-primary" data-modal="coop-new">开始合作</button><button class="modal-secondary" data-modal="close">返回等待界面</button>');
    else newGame(true);
  };
  $('coop-home').onclick = () => { closePanel(); center(playerOwner()); };
  $('coop-ally').onclick = () => { closePanel(); center(1 - playerOwner()); };
  function modal(html) {
    paused = true;
    $('modal-content').innerHTML = html;
    $('modal').hidden = false;
    $('menu-pause').setAttribute('aria-expanded', 'true');
    $('close-modal').focus(); refresh(); sendSnapshot();
  }
  function closeModal() {
    $('modal').hidden = true; paused = !started;
    $('menu-pause').setAttribute('aria-expanded', 'false');
    (started ? $('menu-pause') : !$('coop-lobby').hidden ? $('coop-seat') : $('start-single')).focus(); lastFrame = performance.now(); refresh(); sendSnapshot();
  }
  $('close-modal').onclick = closeModal;
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  function showMenu() {
    if (!started) return;
    if (online?.role === 'guest') { modal('<p class="modal-kicker">双庄共守</p><h2>联机菜单</h2><p>' + (online.kind==='direct'?'手机直连':'房间 '+online.code) + ' · 进度保存在主机设备</p><button class="modal-primary" data-modal="close">继续游戏</button>' + (online.kind==='direct'?'<button class="modal-secondary" data-modal="direct-repair">重新配对 · 保留本局</button>':'') + '<button class="modal-secondary" data-modal="sound">音效：' + (sound ? '开' : '关') + '</button><button class="modal-secondary" data-modal="grid" aria-pressed="' + grid + '">地图网格：' + (grid ? '开' : '关') + '</button><button class="modal-secondary" data-modal="title">离开房间</button>'); return; }
    modal('<p class="modal-kicker">古坊奇谭</p><h2>已暂停</h2><p>第 ' + state.day + ' 日</p><button class="modal-primary" data-modal="close">继续游戏</button>' + autoplaySettings() + '<button class="modal-secondary" data-modal="save">保存进度</button><button class="modal-secondary" data-modal="sound">音效：' + (sound ? '开' : '关') + '</button><button class="modal-secondary" data-modal="grid" aria-pressed="' + grid + '">地图网格：' + (grid ? '开' : '关') + '</button><div class="modal-row"><button class="modal-secondary" data-modal="export">导出存档</button><button class="modal-secondary" data-modal="import">导入存档</button></div><input id="save-file" type="file" accept=".json,application/json" hidden><button class="modal-secondary danger" data-modal="reset">重新开始</button><button class="modal-secondary" data-modal="title">返回开始菜单</button><p id="save-status">' + saveStatus + '</p>');
    if (online?.kind === 'direct') $('modal-content').insertAdjacentHTML('beforeend','<button class="modal-secondary" data-modal="direct-repair">重新配对 · 保留本局</button>');
  }
  function autoplaySettings() {
    const r=pilot?.report(),seconds=Math.floor(r?.activeSeconds||0);
    return '<section class="autoplay-settings" aria-label="托管跑测"><button class="modal-secondary" data-modal="autoplay" aria-pressed="'+autoplay+'" '+(state.over?'disabled':'')+'>'+(autoplay?'关闭托管 · 手动接管':'启用托管 · 电脑游玩')+'</button><p>自动经营、升级、防守与施法。启用即继续游戏；打开菜单或切到后台会暂停，失守后停止。</p>'+(r?'<p>累计托管 '+Math.floor(seconds/60)+' 分 '+seconds%60+' 秒 · 建造 '+r.builds+' · 升级 '+r.upgrades+' · 施法 '+Object.values(r.skills).reduce((a,b)=>a+b,0)+' 次<br>最近操作：'+r.lastAction+'</p><button class="modal-secondary autoplay-report" data-modal="autoplay-report">导出托管报告</button>':'')+'</section>';
  }
  function toggleAutoplay() {
    if(state.over)return;
    if(autoplay){autoplay=false;showMenu();toast('托管已关闭，可手动接管');return;}
    if(!pilot)pilot=GFAutoplay.create(GF.playerView(state));
    autoplay=true;closePanel();closeModal();toast('托管已启用 · 电脑开始经营');
  }
  function showEnd() {
    autoplay=false;
    if (online?.role === 'guest') { modal('<p class="modal-kicker">第 ' + state.day + ' 夜</p><h2>古坊失守</h2><p>等待主机重新开始，或返回庄园查看战况。</p><button class="modal-primary" data-modal="close">返回古坊</button><button class="modal-secondary" data-modal="title">离开房间</button>'); return; }
    modal('<p class="modal-kicker">第 ' + state.day + ' 夜</p><h2>古坊失守</h2><div class="modal-stats"><div><strong>' + (state.day - 1) + '</strong><span>守过长夜</span></div><div><strong>' + state.kills + '</strong><span>击退来敌</span></div></div>'+(pilot?autoplaySettings():'')+'<button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="close">返回古坊</button>');
  }
  function showVictory() {
    modal('<p class="modal-kicker">七夜长明</p><h2>古坊初兴</h2><div class="modal-stats"><div><strong>' + state.buildings.length + '</strong><span>现存建筑</span></div><div><strong>' + state.kills + '</strong><span>击退来敌</span></div></div><button class="modal-primary" data-modal="close">继续游戏</button>');
  }
  function newGame(coop = started && state.mode === 'coop'){if(online?.role==='guest')return;enterGame(coop ? GF.createCoopState() : GF.createState());if(online?.role==='host'){online.started=true;onlineSend({type:online.kind==='direct'?'started':'start'});sendSnapshot();}save();toast(coop ? '双庄共守 · 你与' + (online ? '联机' : '电脑') + '队友各守一庄' : '青溪新雨 · 古坊的故事重新开始');}
  $('modal-content').addEventListener('click',e=>{
    const action=e.target.closest('[data-modal]')?.dataset.modal;if(!action)return;
    if(action==='close')closeModal();if(action==='save')save(true);if(action==='sound'){toggleSound();e.target.closest('[data-modal]').textContent='音效：'+(sound?'开':'关');}
    if(action==='title')showStartMenu();
    if(action==='direct-repair')repairDirect();
    if(action==='grid'){
      grid=!grid;
      try{localStorage.setItem(GRID_KEY,grid?'on':'off');}catch{ /* Keep the setting for this session. */ }
      const button=e.target.closest('[data-modal]');button.textContent='地图网格：'+(grid?'开':'关');button.setAttribute('aria-pressed',String(grid));
    }
    if(action==='autoplay')toggleAutoplay();
    if(action==='autoplay-report'&&pilot){const report={...pilot.report(),enabled:autoplay,finalSave:JSON.parse(GF.serialize(state))},blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='古坊奇谭-托管报告-第'+state.day+'日.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('托管报告已导出');}
    if(action==='confirm-demolish'){const b=demolishTarget;demolishTarget=null;if(online?.role==='guest'){closeModal();if(b)guestAction('demolish',{x:b.x,y:b.y});return;}const r=b?GF.demolish(state,b):{ok:false};closeModal();if(r.ok){toast(r.dryFarms ? '已拆除，' + r.dryFarms + ' 块农田缺水，耐久持续下降' : '已拆除，返还 ' + costText(r.refund), r.dryFarms ? 'warning' : 'info');panelKey='';handleEvents();save();sendSnapshot();}refresh();}
    if(action==='cancel-demolish'){demolishTarget=null;closeModal();}
    if(action==='reset')modal(`<p class="modal-kicker">另起新篇</p><h2>重建古坊</h2><p>重新开始会替换此浏览器中的现有进度。可先返回菜单导出存档。</p><button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="menu">返回，保留当前古坊</button>`);
    if(action==='new')newGame();if(action==='coop-new')newGame(true);if(action==='menu')showMenu();
    if(action==='export'){const blob=new Blob([GF.serialize(state)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='古坊奇谭-第'+state.day+'日.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('存档已导出');}
    if(action==='import'){
      if(online){toast('请先退出联机，再导入存档','warning');return;}
      const input=$('save-file');input.onchange=async()=>{const file=input.files[0];if(!file)return;if(file.size>2e6){toast('存档文件过大','warning');return;}
        const loaded=GF.restore(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(file);}));if(!loaded){toast('存档无效或版本不兼容，现有进度已保留','warning');return;}
        const backup=GF.serialize(state);try{localStorage.setItem(KEY+'-backup',backup);}catch{}
        enterGame(loaded);save();refresh();toast('已载入第 '+state.day+' 日的古坊');if(state.over)showEnd();};input.click();
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
  window.addEventListener('keydown',e=>{
    const overlay = !$('modal').hidden ? $('modal') : !$('coop-lobby').hidden ? $('coop-lobby') : !started ? $('start-menu') : null;
    if(e.key==='Tab' && overlay){
      const buttons=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(el=>!el.hidden&&el.getClientRects().length),first=buttons[0],last=buttons[buttons.length-1];
      if(e.shiftKey && (document.activeElement===first || !overlay.contains(document.activeElement))){e.preventDefault();last?.focus();}
      else if(!e.shiftKey && (document.activeElement===last || !overlay.contains(document.activeElement))){e.preventDefault();first?.focus();}
    }
    if(e.code==='Space' && started && !e.target.closest('button,input')){e.preventDefault();if(paused)closeModal();else showMenu();}
    if(e.key==='Escape'){if(!$('modal').hidden)closeModal();else if(!$('coop-lobby').hidden)showStartMenu();else if(started)closePanel();}
  });
  document.addEventListener('visibilitychange',()=>{hiddenPause=document.hidden;if(hiddenPause)save();sendSnapshot();lastFrame=performance.now();});
  window.addEventListener('pagehide',()=>save());window.addEventListener('resize',resize);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',resize);
  function frame(now){
    const dt=lastFrame?Math.max(0,Math.min(1,(now-lastFrame)/1000)):0;lastFrame=now;
    if(started&&!paused&&!hiddenPause&&!state.over&&online?.role!=='guest'&&(!online||online.peerConnected)){let remaining=dt;while(remaining>0&&!paused&&!state.over){const tick=Math.min(.1,remaining);if(autoplay){try{if(pilot.tick(tick))panelKey='';}catch(error){autoplay=false;showMenu();toast('托管已停止：'+error.message,'warning');break;}}if(partnerPilot){try{partnerPilot.tick(tick);}catch(error){showMenu();toast('电脑队友已暂停：'+error.message,'warning');break;}}GF.step(state,tick);remaining-=tick;}handleEvents();}
    syncClock+=dt;if(syncClock>(online?.kind==='direct' ? 0.1 : 0.25)){sendSnapshot();syncClock=0;}
    uiClock+=dt;saveClock+=dt;if(uiClock>.2){refresh();uiClock=0;}if(saveClock>8){if(!state.over)save();saveClock=0;}
    if(started){const guest=online?.role==='guest',offset=guest&&!online.hostPaused&&online.peerConnected?Math.min(.2,Math.max(0,(now-remoteAt)/1000)):0;
      GFArt.render(canvas,state,cam,selected,{grid,player:playerOwner(),online:!!online,...(guest?{unitPosition:remotePosition,animationTime:state.elapsed+offset,effects:remoteEffects.map(e=>({...e,life:e.life-offset})).filter(e=>e.life>0),projectiles:remoteProjectiles.map(e=>({...e,life:e.life-offset})).filter(e=>e.life>0)}:{})});}requestAnimationFrame(frame);
  }
  resize();refresh();requestAnimationFrame(frame);
  showStartMenu();
  // Small public surface for regression tests and local debugging.
  window.Gufang={get state(){return state;},get online(){return online && {kind:online.kind,role:online.role,code:online.code,peerConnected:online.peerConnected};},get camera(){return {...cam};},get paused(){return paused;},get autoplay(){return autoplay;},get autoplayReport(){return pilot?.report()||null;},get partnerReport(){return partnerPilot?.report()||null;},select,refresh,screenPoint,save,setPaused(value){if(value)showMenu();else closeModal();}};
})();
