import { evaluate, handName } from '/shared/poker.js';
import { tableTurnKey } from './table-actions.js';
import { renderWinnerResult } from './winner-display.js';
import { PlayerRoster } from './player-roster.js';

const $ = id => document.getElementById(id);
const playerRoster = new PlayerRoster($('player-strip'));
$('game').addEventListener('dragstart', event => {
  if (!event.target.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
});
const money = n => Number(n || 0).toLocaleString('zh-CN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ranks = '23456789TJQKA', suits = ['♣', '♦', '♥', '♠'];
const streets = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌' };
let ws, sessionId, room = null, scene = null, connected = false, superseded = false, retry = 0;
let toastTimer, clockOffset = 0, lastHandKey = '', lastActionCount = 0, finishKey = '';
let soundOn = localStorage.getItem('rp-sound') === 'on', lowQuality = localStorage.getItem('rp-quality') === 'low';
let audio;
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000); }
function sound(type) {
  if (!soundOn) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume();
    const t = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type === 'card' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(type === 'card' ? 320 : 920, t); osc.frequency.exponentialRampToValueAtTime(type === 'card' ? 120 : 360, t + .09);
    gain.gain.setValueAtTime(.045, t); gain.gain.exponentialRampToValueAtTime(.001, t + .14);
    osc.connect(gain); gain.connect(audio.destination); osc.start(t); osc.stop(t + .15);
  } catch { /* Sound is optional; blocked audio must never block a poker action. */ }
}
function send(type, data = {}) {
  if (!connected || ws?.readyState !== WebSocket.OPEN) { toast('正在连接服务器，请稍等'); return false; }
  ws.send(JSON.stringify({ type, ...data })); return true;
}
function setConnection(value) {
  connected = value;
  scene?.setActionConnection(value);
  $('connection').classList.toggle('offline', !value);
  $('connection').innerHTML = `<i></i> ${value ? '已连接' : '重连中'}`;
  $('create-button').disabled = !value;
  if (room) renderControls();
}
function connect() {
  if (superseded) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', token: sessionStorage.getItem('rp-token'), name: $('nickname').value }));
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'session') {
      sessionId = data.id; sessionStorage.setItem('rp-token', data.token); retry = 0; setConnection(true);
      if (!data.roomCode && room) { returnToMenu(); toast('房间已关闭，请创建或加入房间'); }
    } else if (data.type === 'state') {
      const previous = room;
      room = data.room; sessionId = data.you;
      clockOffset = room.serverTime - Date.now();
      render();
      if (previous?.phase === 'finished' && room.phase === 'lobby') $('finish-dialog').close();
      if (room.hand) {
        const key = `${room.code}:${room.hand.number}:${room.hand.board.length}`;
        if (lastHandKey && key !== lastHandKey) sound('card');
        if (room.hand.history.length !== lastActionCount) sound('chip');
        lastHandKey = key; lastActionCount = room.hand.history.length;
      }
      if (room.phase === 'finished' && (previous?.phase !== 'finished' || finishKey !== `${room.code}:${room.handNumber}`)) {
        finishKey = `${room.code}:${room.handNumber}`; showFinish();
      }
    } else if (data.type === 'error') { scene?.rejectTableAction(); toast(data.message); }
    else if (data.type === 'left') { returnToMenu(); }
    else if (data.type === 'room-closed') {
      const host = room?.hostId === sessionId;
      returnToMenu();
      toast(host ? '房间已关闭，已返回主菜单' : '房主已关闭房间，已返回主菜单');
    }
  };
  ws.onclose = event => {
    setConnection(false);
    if (event.code === 4001) { superseded = true; toast('此身份已在另一个页面连接，请保留一个页面游玩'); return; }
    setTimeout(connect, Math.min(1000 * 1.5 ** retry++, 10000));
  };
  ws.onerror = () => {};
}
setInterval(() => { if (connected) send('ping'); }, 20000);
window.addEventListener('online', () => { if (ws?.readyState === WebSocket.CLOSED && !superseded) connect(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && connected && room) send('sync'); });
function cardHTML(card) {
  if (card === null) return '<span class="card back" aria-label="未公开底牌"></span>';
  const suit = Math.floor(card / 13), rank = ranks[card % 13].replace('T', '10');
  return `<span class="card ${suit === 1 || suit === 2 ? 'red' : ''}" role="img" aria-label="${suits[suit]}${rank}"><span>${rank}</span><span class="corner-suit">${suits[suit]}</span><span class="center-suit">${suits[suit]}</span></span>`;
}
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }
function returnToMenu() {
  scene?.cancelViewInput();
  releaseCardHolds();
  room = null; lastHandKey = ''; lastActionCount = 0; finishKey = '';
  closeDialogs(); render();
  history.replaceState(null, '', location.pathname);
}
function showDialog(id) { scene?.cancelViewInput(); closeDialogs(); $(id).showModal(); }
document.querySelectorAll('.close-dialog').forEach(b => b.onclick = () => b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }));

const seatButtons = [];
function handleSeatClick(i) {
  if (!room) return;
  const s = room.seats[i];
  if (room.phase === 'lobby' && s.kind === 'human' && s.id === sessionId) {
    send('stand'); return;
  }
  if (room.phase === 'lobby' && s.kind !== 'human') {
    if (s.kind === 'ai' && room.hostId !== sessionId) toast('这是 AI 座位，请选择开放空座');
    else send('seat', { seat: i });
  } else if (s.kind === 'human' || s.kind === 'ai') {
    const p = room.hand?.players.find(p => p.id === s.id);
    toast(`${s.name}${s.id === sessionId ? '（你）' : ''} · ${s.kind === 'ai' ? '电脑' : s.connected ? '在线' : '暂时断线'}${p ? ` · 剩余 ${money(p.chips)} · 本轮投入 ${money(p.bet)}` : ''}`);
  } else toast('比赛进行中，下一场可入座');
}
for (let i = 0; i < 8; i++) {
  const button = document.createElement('button'); button.className = 'seat open'; button.dataset.seat = i;
  button.addEventListener('click', () => handleSeatClick(i));
  $('seat-layer').appendChild(button); seatButtons.push(button);
}
// Only used if WebGL cannot initialize. The 3D view uses world-space sprites and raycasting.
function positionFallbackSeats() {
  if (!room) return;
  const mine = room.seats.find(s => s.id === sessionId);
  for (let i = 0; i < 8; i++) {
    const relative = (i - (mine?.seat || 0) + 8) % 8;
    const point = { x: [50, 15, 12, 25, 50, 75, 88, 85][relative], y: [66, 53, 40, 29, 25, 29, 40, 53][relative] };
    seatButtons[i].style.left = `${point.x}%`; seatButtons[i].style.top = `${point.y}%`;
    seatButtons[i].hidden = mine?.seat === i && room.phase !== 'lobby';
  }
}
function renderSeats() {
  $('seat-layer').hidden = !!scene;
  if (scene) return;
  const h = room.hand, host = room.hostId === sessionId;
  room.seats.forEach((s, i) => {
    const b = seatButtons[i], p = h?.players.find(p => p.id === s.id), mine = s.id === sessionId;
    b.className = `seat ${s.kind === 'open' ? 'open' : s.kind === 'ai' ? 'ai' : ''}${mine ? ' mine' : ''}${p?.folded ? ' folded' : ''}${p && h.actor === i && !h.done ? ' active' : ''}`;
    if (s.kind === 'open') {
      b.innerHTML = `<span class="seat-name"><span class="seat-number">0${i + 1}</span>开放</span><span class="seat-value">＋</span>`;
      b.setAttribute('aria-label', `${i + 1} 号开放座位${host && room.seats.some(s => s.id === sessionId) ? '，切换为 AI' : '，点击入座'}`);
    } else {
      const state = room.phase === 'lobby' ? s.kind === 'ai' ? host && room.seats.some(s => s.id === sessionId) ? 'AI · 点击切换' : 'AI · 电脑对手' : mine ? '你 · 点击起身' : s.id === room.hostId ? '房主' : '已入座' : money(p?.chips ?? s.chips);
      let markers = '';
      if (h && p) markers = `<div class="seat-dot">${h.button === i ? '<b>D</b>' : ''}${h.sbSeat === i ? '<b class="blind">S</b>' : ''}${h.bbSeat === i ? '<b class="blind">B</b>' : ''}</div>`;
      let action = p?.action || '';
      if (s.kind === 'human' && !s.connected) action = '断线';
      if (p?.chips === 0 && !h.done && !p.folded) action = '全下';
      const cards = h?.done && h.result.showdown && p && !p.folded ? `<div class="tiny-cards">${p.cards.map(cardHTML).join('')}</div>` : '';
      b.innerHTML = `${markers}<span class="seat-name">${s.kind === 'ai' ? '<span class="seat-number">AI</span>' : ''}${esc(s.name)}</span><span class="seat-value">${esc(state)}</span>${cards}${action ? `<span class="seat-action">${esc(action)}</span>` : ''}`;
      b.setAttribute('aria-label', `${i + 1} 号座位，${s.name}，${state}`);
    }
  });
  positionFallbackSeats();
}
function render() {
  $('entry').hidden = !!room; $('table-ui').hidden = !room;
  $('room-header').hidden = !room;
  $('player-roster').hidden = !room;
  playerRoster.render(room, sessionId);
  $('game').classList.toggle('physical-cards', !!scene);
  $('look-controls').hidden = !scene || !room;
  $('game').classList.toggle('table-ui-small', $('game').clientWidth < 380);
  scene?.update(room, sessionId);
  if (!room) { renderWinnerResult($('result-banner'), null); lastHandKey = ''; return; }
  $('room-code-display').textContent = room.code;
  const h = room.hand;
  renderWinnerResult($('result-banner'), h, { nextHand: room.phase === 'playing' && !room.finishing });
  renderSeats(); renderControls();
  $('board-area').hidden = !h;
  const mine = h?.players.find(p => p.id === sessionId);
  $('hand-area').hidden = !mine;
  if (h) {
    $('pot-value').textContent = money(h.pot);
    $('street-label').textContent = h.done ? '本手结束' : streets[h.street];
    $('community').hidden = !!scene;
    if (!scene) $('community').innerHTML = [...h.board.map(cardHTML), ...Array(5 - h.board.length).fill('<span class="card ghost"></span>')].join('');
    const allInCount = h.players.filter(p => !p.folded && !p.chips).length;
    $('pot-detail').textContent = h.done && h.result.pots.length > 1 ? `主池 ${money(h.result.pots[0].amount)} · ${h.result.pots.length - 1} 个边池` : allInCount ? `${allInCount} 人全下 · 按投入分别结算` : '';
    if (mine) {
      $('hand-area').hidden = !!scene;
      if (!scene) $('my-cards').innerHTML = mine.cards.map(cardHTML).join('');
      $('my-cards').style.opacity = mine.folded ? '.55' : '1';
      $('my-hand-name').textContent = mine.folded ? '已弃牌' : h.board.length >= 3 ? handName(evaluate([...mine.cards, ...h.board])) : '你的底牌';
    }
  }
}
function renderControls() {
  if (!room) return;
  const me = room.seats.find(s => s.id === sessionId), host = room.hostId === sessionId;
  const h = room.hand, p = h?.players.find(p => p.id === sessionId), lobby = room.phase === 'lobby';
  $('dock').classList.toggle('in-game', !lobby);
  $('my-chips').textContent = me ? money(p?.chips ?? (lobby ? room.config.startingChips : me.chips)) : '—';
  $('lobby-controls').hidden = !lobby; $('play-controls').hidden = lobby;
  if (lobby) {
    const n = room.seats.filter(s => s.kind !== 'open').length;
    const humans = room.seats.filter(s => s.kind === 'human').length, bots = n - humans;
    $('lobby-message').textContent = !me ? '请选择空座入座。' : host ? `已入座 ${n} / 8 · ${humans} 位玩家${bots ? ` · ${bots} 位 AI` : ''}` : `${humans} 位玩家${bots ? ` · ${bots} 位 AI` : ''}已入座，等待房主开始。`;
    $('start-button').disabled = !connected || !host || !me || n < 2;
    $('start-button').innerHTML = host ? '开始牌局 <span>→</span>' : '等待房主开始';
    $('rule-summary').textContent = `每人 ${money(room.config.startingChips)} · ${room.config.raiseEvery ? `每 ${room.config.raiseEvery} 手升盲` : '固定盲注'} · 无限注`;
  } else {
    const legal = h?.legal, actor = h?.players.find(p => p.seat === h.actor);
    const dealing = !!room.dealing || !!scene?.dealing;
    const mineTurn = !!legal && connected && room.phase === 'playing' && !dealing;
    $('turn-label').textContent = dealing ? room.settling ? '等待结算' : '正在发牌' : room.phase === 'finished' ? '本场已结束 · 可在菜单查看结果' : h?.done ? room.finishing ? '本手已结算 · 等待最终结算' : '本手已结算 · 等待下一手' : room.stopAfterHand ? '本手结束后结算本场' : mineTurn ? '轮到你行动' : p?.folded ? `已弃牌 · 等待${actor?.name || ''}行动` : p?.chips === 0 ? `你已全下 · 等待摊牌` : `等待${actor?.name || '其他玩家'}行动`;
    $('action-prompt').hidden = !mineTurn;
    $('action-prompt').textContent = mineTurn ? legal.toCall ? `需跟注 ${money(legal.callAmount)}` : '可以过牌或下注' : '';
  }
  $('stand-button').hidden = !lobby || !me;
  $('stop-button').hidden = !host || !me || room.phase !== 'playing' || room.finishing;
  $('close-room-button').hidden = !host;
  $('close-room-button').disabled = !connected;
  $('leave-button').hidden = host || (room.phase === 'playing' && !!p);
  $('menu-results').hidden = room.phase !== 'finished';
}

$('nickname').value = localStorage.getItem('rp-name') || `玩家${Math.floor(Math.random() * 900 + 100)}`;
function saveName() { const name = $('nickname').value.trim() || '玩家'; localStorage.setItem('rp-name', name); return name; }
$('create-button').onclick = () => send('create', { name: saveName(), password: $('create-password').value });
$('join-toggle').onclick = () => { $('join-form').hidden = !$('join-form').hidden; if (!$('join-form').hidden) $('room-code').focus(); };
$('join-form').onsubmit = e => { e.preventDefault(); if (!/^\d{6}$/.test($('room-code').value.trim())) { toast('请输入六位房间码'); return; } send('join', { code: $('room-code').value.trim(), name: saveName(), password: $('join-password').value }); };
$('start-button').onclick = () => send('start');
$('reset-view').onclick = () => scene?.resetView();
function releaseCardHolds() { scene?.endCardPeek(); }
window.addEventListener('blur', releaseCardHolds);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseCardHolds(); });
function showRules() {
  if (!room) { toast('请先创建或加入房间'); return; }
  const editable = room.hostId === sessionId && room.phase === 'lobby';
  for (const [key, value] of Object.entries(room.config)) { const el = $('rules-form').elements.namedItem(key); if (el) { el.value = value; el.disabled = !editable; } }
  $('save-rules').hidden = !editable;
  showDialog('rules-dialog');
}
$('rules-button').onclick = showRules; $('menu-rules').onclick = showRules;
$('rules-form').onsubmit = e => {
  e.preventDefault();
  const c = Object.fromEntries([...new FormData(e.target)].map(([k, v]) => [k, k === 'difficulty' ? v : Number(v)]));
  if (c.startingChips < c.ante + c.smallBlind * 2) { toast('初始筹码需至少覆盖前注与大盲'); return; }
  if (send('configure', { config: c })) { $('rules-dialog').close(); }
};
$('menu-button').onclick = () => { $('menu-rules').hidden = !room; $('menu-results').hidden = room?.phase !== 'finished'; $('stand-button').hidden = !room || room.phase !== 'lobby' || !room.seats.some(s => s.id === sessionId); $('stop-button').hidden = !room || room.hostId !== sessionId || room.phase !== 'playing' || room.finishing; $('close-room-button').hidden = !room || room.hostId !== sessionId; $('close-room-button').disabled = !connected; $('leave-button').hidden = !room || room.hostId === sessionId || (room.phase === 'playing' && room.hand?.players.some(p => p.id === sessionId)); showDialog('menu-dialog'); };
$('menu-results').onclick = showFinish;
$('stand-button').onclick = () => { send('stand'); closeDialogs(); };
$('leave-button').onclick = () => { send('leave'); closeDialogs(); };
$('close-room-button').onclick = () => { if (send('close-room')) closeDialogs(); };
$('stop-button').onclick = () => { send('stop'); closeDialogs(); toast('将在本手结束后结算，当前底池继续正常进行'); };
$('help-button').onclick = () => showDialog('help-dialog');
$('sound-state').textContent = soundOn ? '开启' : '关闭';
$('sound-button').onclick = () => { soundOn = !soundOn; localStorage.setItem('rp-sound', soundOn ? 'on' : 'off'); $('sound-state').textContent = soundOn ? '开启' : '关闭'; sound('chip'); };
$('quality-state').textContent = lowQuality ? '省电' : '标准';
$('quality-button').onclick = () => { lowQuality = !lowQuality; localStorage.setItem('rp-quality', lowQuality ? 'low' : 'standard'); $('quality-state').textContent = lowQuality ? '省电' : '标准'; scene?.setQuality(lowQuality); };
function act(type, amount, expectedKey) {
  if (!connected || room?.phase !== 'playing' || room.dealing || scene?.dealing || room.hand?.done || !room.hand?.legal || expectedKey !== tableTurnKey(room)) return false;
  const bytes = new Uint32Array(4); crypto.getRandomValues(bytes);
  return send('action', { hand: room.handNumber, turnId: room.turnId, requestId: [...bytes].map(n => n.toString(16)).join('-'), action: type, amount });
}
$('my-cards').onclick = () => $('my-cards').classList.toggle('zoom');
function showFinish() {
  if (room?.phase !== 'finished') return;
  $('standings').innerHTML = (room.standings || []).filter(p => p.rank === 1).map(p => `<div class="rank-row champion-row"><b>冠军</b><span>${esc(p.name)}${p.id === sessionId ? ' · 你' : ''}</span><strong>${money(p.chips)}</strong></div>`).join('');
  $('again-button').hidden = room.hostId !== sessionId;
  showDialog('finish-dialog');
}
$('again-button').onclick = () => { send('reset'); closeDialogs(); };
setInterval(() => {
  if (!room?.hand) return;
  if (room.phase === 'finished') { $('countdown').textContent = ''; $('timer-fill').style.width = '0%'; return; }
  if (room.dealing || scene?.dealing) {
    $('countdown').textContent = room.settling ? '结算前稍候' : '发牌中';
    const deal = room.deal, remaining = deal ? Math.max(0, deal.endsAt - Date.now() - clockOffset) / Math.max(1, deal.endsAt - deal.startedAt) : 1;
    $('timer-fill').style.width = `${Math.min(100, remaining * 100)}%`; return;
  }
  const remaining = room.deadline ? Math.max(0, (room.deadline - Date.now() - clockOffset) / 1000) : null;
  $('countdown').textContent = remaining === null ? '不限时' : `${Math.ceil(remaining)}s`;
  const max = (room.hand.done ? room.resultDuration ?? 6500 : room.config.actionSeconds * 1000) / 1000 || 30;
  $('timer-fill').style.width = remaining === null ? '100%' : `${Math.min(100, remaining / max * 100)}%`;
}, 100);
window.addEventListener('resize', () => { $('game').classList.toggle('table-ui-small', $('game').clientWidth < 380); if (!scene) positionFallbackSeats(); });
const invite = new URLSearchParams(location.search).get('room');
if (invite && /^\d{6}$/.test(invite)) { $('join-form').hidden = false; $('room-code').value = invite; }
connect();
try {
  const { SaloonScene } = await import('/client/scene.js');
  scene = new SaloonScene($('scene')); scene.onSeatSelect = handleSeatClick; scene.onPokerAction = act; scene.onDealFinished = renderControls; scene.setActionConnection(connected);
  playerRoster.setPortraits(scene.portraits);
  scene.setQuality(lowQuality);
  $('seat-layer').hidden = true; $('look-controls').hidden = !room; render();
} catch (error) {
  console.error('3D scene:', error);
  const detail = String(error?.message || error), graphicsError = /WebGL|graphics context|hardware acceleration/i.test(detail);
  const message = document.createElement('div'); message.className = 'scene-error';
  message.textContent = graphicsError ? '3D 场景需要 WebGL 2，请使用支持硬件加速的浏览器。' : `3D 场景加载失败：${detail.slice(0, 180)}`; $('game').appendChild(message);
  toast(graphicsError ? '3D 场景未能加载，请检查 WebGL 2 支持' : '3D 场景加载失败，桌面手势暂不可用；请刷新页面重试');
} finally { window.RevolverPokerBoot?.ready(); $('loading').hidden = true; }
