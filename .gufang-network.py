from pathlib import Path
root=Path('F:/Html/古坊奇谭')
p=root/'js/network.js';s=p.read_text(encoding='utf-8')
s=s.replace("const metaKeys = ['day', 'phase', 'time', 'elapsed', 'direction', 'kills', 'wave', 'over', 'celebrated', 'revision', 'nextId'];", "const metaKeys = ['time','elapsed','kills','over','result','revision','nextId'];")
a=s.index('    const next = JSON.parse(G.serialize(s)), other');b=s.index("    for (const b of next.buildings)",a)
s=s[:a]+'''    const next=JSON.parse(G.serialize(s));
    for(const p of next.players)if(p.id!==owner){p.coins=p.materials=p.fortuneBuilt=p.mission=0;p.cooldowns={repel:0,repair:0,thunder:0};}
'''+s[b:]
a=s.index("    const keys = group === 'buildings'");b=s.index('    for (const key of keys)',a)
s=s[:a]+'''    const keys = group==='buildings'?Object.keys(entity):['id','owner','barracksId','x','y','hp','maxHp','level','baseDamage','repelled','slowed','slowFactor'];
'''+s[b:]
s=s.replace("const next = {}, message = { meta: {}, players: [0, 1].map(owner => {\n      const player = G.playerView(s, owner);\n      return { selectedSkill: player.selectedSkill, gateLevel: player.gateLevel };\n    }) };", "const next = {}, message = { meta: {}, players: s.players.map(p=>({id:p.id,team:p.team,controller:p.controller,selectedSkill:p.selectedSkill,gateLevel:p.gateLevel,eliminated:p.eliminated,kills:p.kills,ai:p.ai})) };")
s=s.replace("['buildings', 'enemies', 'soldiers']", "['buildings', 'soldiers']")
s=s.replace("if (kind === 'choose-skill') return { ok: !player.selectedSkill };", "if(player.eliminated||s.over)return {ok:false,reason:'该庄园已出局'};\n    if(kind==='choose-skill')return G.chooseSkill(player,action.skill);")
s=s.replace("    const phase = s.phase;\n    // Economic prediction must not muster soldiers or run attacks, even at night.\n    s.phase = 'day'; s.nextId = -action.id * 10;", "    const nextId=s.nextId;\n    s.nextId=-action.id*10;")
s=s.replace('materialPending: 0 });', 'materialPending: 0, production: 0, lastHit: -10 }); s.revision++;')
s=s.replace('} finally { s.phase = phase; }', '} finally { s.nextId=nextId; }')
a=s.index('      for (const other of [0, 1])');b=s.index('      const byId =',a)
s=s[:a]+'''      for(const p of base.players){
        const target=state.players[p.id];
        for(const key of ['selectedSkill','gateLevel','eliminated','controller','kills','ai'])target[key]=clone(p[key]);
      }
'''+s[b:]
s=s.replace("Object.assign(G.playerView(base, index), values)", "Object.assign(base.players[index], values)")
p.write_text(s,encoding='utf-8')
p=root/'server.js';s=p.read_text(encoding='utf-8')
s=s.replace("...['boot', 'runtime', 'game'", "...['boot', 'runtime', 'maps', 'game'")
# Register shared computer controllers in the authoritative simulation process.
where=s.index("const ",s.index("'use strict';")+1)
s=s[:where]+"require('./js/autoplay');\n"+s[where:]
s=s.replace("!room.state.selectedSkill || !room.state.partner.selectedSkill", "!G.ready(room.state)")
s=s.replace("participants(room).some(socket => socket.paused || socket.hidden || socket.readyState !== WebSocket.OPEN)", "participants(room).some(socket => !room.state.players[ownerOf(socket)].eliminated && (socket.paused || socket.hidden || socket.readyState !== WebSocket.OPEN))")
s=s.replace("room.state = G.createCoopState(); room.started = true;", "room.state=G.createMatch({mode:'coop',enemyCount:room.enemyCount});room.state.players[1].controller='human';room.state.players[1].selectedSkill=null;room.started=true;")
s=s.replace("if (s.over) result.reason = '古坊已失守';", "if (s.over||player.eliminated) result.reason = '该庄园已出局';")
s=s.replace("const room = { code, host: socket, guest: null, started: false, session: 0 };", "const room = { code, host: socket, guest: null, started: false, session: 0, enemyCount:[2,4,6].includes(message.enemyCount)?message.enemyCount:2 };")
s=s.replace("{ type: 'created', code }", "{ type: 'created', code, enemyCount:room.enemyCount }").replace("{ type: 'joined', code }", "{ type: 'joined', code, enemyCount:room.enemyCount }")
s=s.replace("      } else if (message.type === 'start'", "      } else if(message.type==='settings'&&socket.role==='host'&&!socket.room?.started&&[2,4,6].includes(message.enemyCount)){\n        socket.room.enemyCount=message.enemyCount;for(const peer of participants(socket.room))send(peer,{type:'settings',enemyCount:message.enemyCount});\n      } else if (message.type === 'start'")
p.write_text(s,encoding='utf-8')
