from pathlib import Path
root=Path('F:/Html/古坊奇谭')
p=root/'js/app.js';s=p.read_text(encoding='utf-8')
s=s.replace("KEY = 'gufang-qitan-save-v1'", "KEY = 'gufang-qitan-match-v8'")
s=s.replace('try { saved = localStorage.getItem(KEY); }', "try { localStorage.removeItem('gufang-qitan-save-v1'); localStorage.removeItem('gufang-qitan-save-v1-backup'); saved = localStorage.getItem(KEY); }")
s=s.replace("const playerState = () => state.mode === 'coop' ? GF.playerView(state, playerOwner()) : state;", "const playerState = () => GF.playerView(state, playerOwner());")
s=s.replace('[[state.enemies,false],[state.soldiers,true]]', '[[state.soldiers,true]]')
s=s.replace("const home = state.mode === 'coop' ? GF.estate(GF.playerView(state, owner)).center : {x:GF.worldCenter(state),y:GF.worldCenter(state)};", "const home = GF.estate(GF.playerView(state,owner)).center;")
s=s.replace("if (!GF.owns(playerState(), x, y)) { closePanel(); toast(state.mode === 'coop' && GF.owns(state, x, y) ? '队友的庄园 · 由队友自行经营' : '庄园外区域 · 不可建设或操作', 'warning'); return; }", "if (!GF.owns(playerState(), x, y) && !GF.at(state,x,y)) { closePanel(); toast('庄园外或遗址 · 不可建设', 'warning'); return; }")
s=s.replace('GF.soldierLimit','GF.soldierRate').replace('出兵上限','出兵效率（人/秒）').replace("['士兵', GF.soldierRate({ type: 'barracks', level: 1 })]", "['出兵效率', GF.soldierRate({ type: 'barracks', level: 1 })+'人/秒']")
s=s.replace('自动派出${GF.soldierRate(b || { type: d.id, level: 1 })}名民兵', '每秒派出${GF.soldierRate(b || { type: d.id, level: 1 })}名民兵 · 本庄上限120人')
a=s.index('  function detailHTML(b)');b=s.index('  function renderPanel()',a)
chunk=s[a:b].replace("const d = GF.DEFS[b.type],", "const context=GF.playerView(state,b.owner), d = GF.DEFS[b.type],").replace('GF.income(playerState(),', 'GF.income(context,').replace('GF.soldierPower(playerState(),','GF.soldierPower(context,')
s=s[:a]+chunk+s[b:]
s=s.replace("if (GF.isWall(state, x, y) || !GF.owns(playerState(), x, y)) { closePanel(); return; }", "if (GF.isWall(state,x,y)||(!b&&!GF.owns(playerState(),x,y))) {closePanel();return;}")
s=s.replace("    if (b) {\n      $('detail-hp')", "    if (b) {\n      const readonly=b.owner!==playerOwner()||playerState().eliminated;\n      $('detail-view').classList.toggle('readonly',readonly);\n      if(readonly)$('plot-label').textContent=(state.players[b.owner].team===0?'友方':'敌方')+'庄园 '+(b.owner+1)+' · 仅查看';\n      $('detail-hp')")
a=s.index("    const invasion = started");b=s.index("    for (const el of document.querySelectorAll('[data-skill]'))",a)
s=s[:a]+'''    $('coop-status').hidden = !started;
    $('coop-action').textContent = playerState().eliminated ? '你的庄园已出局 · 观战中' : online ? (online.serverPaused?'对局已暂停 · ':'服务器联机 · ')+'房间 '+online.code : state.mode==='coop'?'电脑队友：'+state.players[1].ai.lastAction:'自动出征 · 攻破所有敌方主城';
    $('coop-home').textContent='我的庄园';$('coop-ally').hidden=state.mode!=='coop';
    $('coop-ally').textContent=state.players[1]?.eliminated?'队友遗址':'队友庄园';
    $('autoplay-status').hidden=!autoplay||!started||playerState().eliminated;
    $('autoplay-status').querySelector('strong').textContent=paused?'托管已暂停':'托管中';
    $('autoplay-action').textContent=playerState().ai.lastAction;
    $('coins').textContent=fmt(playerState().coins);$('materials').textContent=fmt(playerState().materials);
    const elapsed=online?guestLive():state.elapsed;
    $('day-label').textContent='对局 '+duration(elapsed);
    $('countdown').textContent='敌庄 '+state.players.filter(p=>p.team===1&&!p.eliminated).length+' / '+state.enemyCount;
    $('skills').hidden=!started||state.over||playerState().eliminated;
''' + s[b:]
s=s.replace("    if (lastPhase !== state.phase) { document.body.classList.toggle('night', state.phase === 'night'); lastPhase = state.phase; }\n",'')
s=s.replace("  const fmt =", "  const duration=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');\n  const fmt =")
a=s.index('  function handleEvents()');b=s.index('  function blocked(',a)
s=s[:a]+'''  function handleEvents() {
    const events=state.events.splice(0);
    if(events.some(e=>e.kind==='finished')){save();showEnd();return;}
    if(playerState().eliminated){autoplay=false;if(selected&&!GF.at(state,selected.x,selected.y))closePanel();}
    const e=events.filter(e=>!e.text.startsWith('坊志达成')).pop();if(e)toast(e.text,e.kind);
  }
'''+s[b:]
s=s.replace("$('start-save-detail').textContent = loaded ? '第 ' + loaded.day + ' 日 · ' + ({ day: '白昼', dusk: '黄昏', night: '长夜' }[loaded.phase]) + (loaded.over ? ' · 已失守' : ' · 继续故事')", "$('start-save-detail').textContent = loaded ? duration(loaded.elapsed)+' · '+loaded.enemyCount+'个敌庄'+(loaded.over?' · 已结束':' · 继续对局')")
s=s.replace("    state = next; started = true; saveClock = 0;", "    state = next; started = true; saveClock = 0;\n    if(!online){state.players[0].controller='human';for(const p of state.players.slice(1)){p.controller='computer';p.selectedSkill||='thunder';}}")
s=s.replace("thunder:'全场雷击，阴兵 350、其余 240 伤害'", "thunder:'本庄及墙外5格内敌兵受到240伤害'").replace("repel:'封住敌人 4 秒，造成 20 伤害'", "repel:'本庄及墙外5格敌兵定身4秒、受到20伤害'").replace("repair:'全体建筑恢复 35% 耐久'", "repair:'本庄建筑恢复35%耐久'")
s=s.replace("toast('故人归坊 · 已续接第 ' + state.day + ' 日的灯火')", "toast('已恢复对局 · '+duration(state.elapsed))")
s=s.replace("    $('coop-seat').disabled = !!online;", "    $('coop-seat').disabled = !!online;\n    $('coop-enemies').disabled=online?.role==='guest'||!!online?.started;")
s=s.replace("  $('coop-back').onclick = showStartMenu;", "  $('coop-enemies').onchange=()=>{if(online?.role==='host')onlineSend({type:'settings',enemyCount:Number($('coop-enemies').value)});};\n  $('coop-back').onclick = showStartMenu;")
s=s.replace("onlineSend({ type: kind, code });", "onlineSend({ type: kind, code, enemyCount:Number($('coop-enemies').value) });")
s=s.replace("      if (message.type === 'created' || message.type === 'joined') {", "      if(message.type==='settings'){$('coop-enemies').value=String(message.enemyCount);updateCoopSeat();return;}\n      if (message.type === 'created' || message.type === 'joined') {\n        $('coop-enemies').value=String(message.enemyCount);")
s=s.replace("<p>第 ' + state.day + ' 日'", "<p>对局 ' + duration(state.elapsed)")
s=s.replace("if(state.over)return;", "if(state.over||playerState().eliminated)return;")
s=s.replace("if(autoplay){autoplay=false;showMenu();", "if(autoplay){autoplay=false;playerState().controller='human';showMenu();")
s=s.replace("autoplay=true;closePanel();", "autoplay=true;playerState().controller='autoplay';closePanel();")
a=s.index('  function showEnd()');b=s.index('  function downloadSave(',a)
s=s[:a]+'''  function showEnd() {
    autoplay=false;
    const title={victory:'攻城告捷',defeat:'古坊失守',draw:'双方同归'}[state.result]||'对局结束';
    modal('<p class="modal-kicker">庄园攻防</p><h2>'+title+'</h2><div class="modal-stats"><div><strong>'+duration(state.elapsed)+'</strong><span>对局时长</span></div><div><strong>'+state.players.filter(p=>p.team===0).reduce((n,p)=>n+p.kills,0)+'</strong><span>我方击杀</span></div></div>'+(online?.role==='guest'?'':'<button class="modal-primary" data-modal="new">重新开始</button>')+'<button class="modal-secondary" data-modal="close">查看战场</button><button class="modal-secondary" data-modal="title">返回开始菜单</button>');
  }
  function newGame(coop = started && state.mode === 'coop'){
    if(online){if(online.role==='host'){online.awaitingState=true;onlineSend({type:'start'});}return;}
    const enemyCount=started&&state.mode===(coop?'coop':'single')?state.enemyCount:Number($(coop?'coop-enemies':'single-enemies').value);
    enterGame(GF.createMatch({mode:coop?'coop':'single',enemyCount}));save();
  }
'''+s[b:]
s=s.replace("'古坊奇谭-第'+state.day+'日.json'", "'古坊奇谭-攻防-'+Math.floor(state.elapsed)+'秒.json'").replace("'古坊奇谭-托管报告-第'+state.day+'日.json'", "'古坊奇谭-攻防托管报告.json'")
s=s.replace("if(file.size>2e6)", "if(file.size>8e6)")
s=s.replace("存档无效或版本不兼容，现有进度已保留", "存档无效；旧版防守存档不再支持，请重开")
s=s.replace("        const backup=GF.serialize(state);try{localStorage.setItem(KEY+'-backup',backup);}catch{}\n",'')
s=s.replace("toast('已载入第 '+state.day+' 日的古坊')", "toast('已载入攻防对局')")
s=s.replace("&&!!state.selectedSkill&&(state.mode!=='coop'||!!state.partner.selectedSkill)", "&&GF.ready(state)")
a=s.index("if(autoplay){try{if(pilot.tick(tick))");b=s.index('GF.step(state,tick);',a)
s=s[:a]+s[b:]
s=s.replace('state.enemies.find(', 'state.soldiers.find(').replace('remotePosition(target,false)', 'remotePosition(target,true)')
s=s.replace("Math.max(.36,", "Math.max(.12,")
s=s.replace("if (selected && !GF.owns(playerState(), selected.x, selected.y)) closePanel();", "if(selected&&!GF.at(state,selected.x,selected.y)&&!GF.owns(playerState(),selected.x,selected.y))closePanel();")
p.write_text(s,encoding='utf-8')
p=root/'index.html';s=p.read_text(encoding='utf-8')
s=s.replace('一方烟火 · 一夜奇谭','一方烟火 · 四方争鸣').replace('昼营百业，夜守长明。','经营百业，出征守坊。').replace('两庄相邻 · 一同守夜','两庄相邻 · 携手出征')
s=s.replace('<nav class="start-actions" aria-label="开始菜单">','<nav class="start-actions" aria-label="开始菜单"><label class="enemy-setting" for="single-enemies">敌方庄园<select id="single-enemies"><option value="1">1 座</option><option value="2">2 座</option><option value="3">3 座</option><option value="4">4 座</option></select></label>')
s=s.replace('<div class="coop-connect">','<label class="enemy-setting coop-enemy-setting" for="coop-enemies">敌方庄园<select id="coop-enemies"><option value="2">2 座</option><option value="4">4 座</option><option value="6">6 座</option></select></label><div class="coop-connect">')
a=s.index('    <div id="invasion-indicators"');b=s.index('    <header class="topbar">',a);s=s[:a]+s[b:]
s=s.replace('第 1 日 · 白昼','对局 0:00').replace('<div class="day-progress"><i id="day-fill"></i></div>','<div class="battle-spacer"></div>').replace('72s','敌庄 1 / 1')
p.write_text(s,encoding='utf-8')
p=root/'build.js';s=p.read_text(encoding='utf-8').replace("const sources = ['js/game.js'", "const sources = ['js/maps.js', 'js/game.js'");p.write_text(s,encoding='utf-8')
p=root/'js/art.js';s=p.read_text(encoding='utf-8')
s=s.replace("s.estateSeed,size,height,s.mapGeneration,s.coopLayout", "s.rotation,size,height,s.mapGeneration,s.mode,s.enemyCount")
s=s.replace("player=s.mode==='coop'?GF.playerView(s,options.player||0):s", "player=GF.playerView(s,options.player||0)")
s=s.replace('for(const e of s.enemies)', 'for(const e of GF.hostileUnits(player))')
s=s.replace("[...s.enemies.map(unit=>({unit,soldier:false})),...s.soldiers.filter(unit=>unit.hp>0).map(unit=>({unit,soldier:true}))]", "s.soldiers.filter(unit=>unit.hp>0).map(unit=>({unit,soldier:s.players[unit.owner].team===0}))")
s=s.replace("person(c,soldier?'soldier':e.type", "person(c,soldier?'soldier':'enemy-soldier'")
s=s.replace("if(s.mode==='coop'&&b.type==='shrine')", "if(b.type==='shrine')")
s=s.replace("b.owner===options.player?'#3d685deb':'#8a6647eb'", "s.players[b.owner].team===1?'#a74e3ceb':b.owner===options.player?'#3d685deb':'#597f96eb'")
s=s.replace("b.owner===options.player?'你的庄园':options.online?'队友庄园':'电脑庄园'", "b.owner===options.player?'你的庄园':s.players[b.owner].team===0?'队友庄园':'敌方庄园 '+(b.owner+1)")
s=s.replace("type==='soldier'?'#818967':'#916b60'", "type==='soldier'?'#4f8b9a':'#b75548'").replace("type==='soldier'?'#526d60':'#5a625b'", "type==='soldier'?'#32677c':'#8c3f35'")
s=s.replace("const night=s.phase==='night',dusk=s.phase==='dusk';", "const night=false,dusk=false;")
p.write_text(s,encoding='utf-8')
