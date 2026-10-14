from pathlib import Path
root = Path('F:/Html/古坊奇谭')
src = (root/'js/game.js').read_text(encoding='utf-8')
def cut(a,b): return src[src.index(a):src.index(b)]
maps = '''/* Deterministic estate templates and attack/defence layouts. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GFMaps=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const worldSize=s=>s.worldSize, worldWidth=worldSize, worldHeight=s=>s.worldHeight||s.worldSize, worldCenter=s=>Math.floor(s.worldSize/2);
  const inside=(x,y,s)=>x>=0&&y>=0&&x<worldWidth(s)&&y<worldHeight(s);
  const dist8=(ax,ay,bx,by)=>Math.max(Math.abs(ax-bx),Math.abs(ay-by));
  const NEIGHBORS8=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  const world=s=>s, terrainCache=new WeakMap(), coopMaps=new WeakMap();
  function createTemplate(mapSeed){return {mapSeed:mapSeed>>>0,estateSeed:(Math.imul(mapSeed,2246822519)^3266489917)>>>0,mapGeneration:2,worldSize:25};}
  const generatedTerrain=s=>terrainCache.get(s)?.cells||variedTerrain(s);
  const baseTerrain=(x,y,s)=>generatedTerrain(s)[y*25+x]||'plain';
'''
maps += cut('  function coopMap(s)', '  function createCoopState').replace('createState(', 'createTemplate(')
maps += cut('  function variedTerrain(s)', '  function owns(s, x, y)').replace("    if (s?.mode === 'coop') { const land = coopMap(s).land; return s.actorId === undefined ? land : land.estates[s.actorId]; }\n", '')
maps += '\n  /* MATCH_LAYOUT */\n});\n'
(root/'js/maps.js').write_text(maps,encoding='utf-8')
head=cut('  const SIZE =', '  const ENEMIES =')
head=head.replace('DAY = 60, DUSK = 8, ', '')
head=head.replace("desc: '自动派出民兵近战'", "desc: '持续出兵 · 自动出征攻城'")
head=head.replace("'庄园唯一入口 · 可升级与修复'", "'庄园出入口 · 可升级与修复'")
missions=cut('  const SKILLS =', '  function baseTerrain')
missions='\n'.join(line for line in missions.splitlines() if "test: s => s.day" not in line).replace('准备入夜','保卫庄园')+'\n'
economic=cut('  const at =', '  function dusk(s)')
economic=economic[:economic.index('  function createState(')]+economic[economic.index('  function random(s)'):]
start=economic.index('  const soldierLimit =')
end=economic.index('  const visualLevel =')
economic=economic[:start]+'''  const soldierRate = b => 1 + .25 * (b.level - 1);
  const soldierHP = b => Math.round(120 * hpFactor(b));
  const soldierDamage = (s,b) => 18 * factor(b) * defenseBoost(s);
  const soldierPower = (s,b) => Math.round(Math.sqrt(soldierHP(b)*soldierDamage(s,b)));
'''+economic[end:]
economic=economic.replace("cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0", "cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0, production: 0, lastHit: -10")
economic=economic.replace("    if (s.mode === 'coop') b.owner = extra.owner ?? s.actorId ?? 0;", "    b.owner = extra.owner ?? s.actorId ?? 0;")
economic=economic.replace('s.revision++; muster(s, b); return b;', 's.revision++; return b;')
start=economic.index("    if (b.type === 'barracks') {")
end=economic.index('    s.revision++; missions(s); return',start)
economic=economic[:start]+economic[end:]
economic=economic.replace("    if (b.type === 'barracks') cleanSoldiers(world(s));\n",'')
economic=economic.replace("if (s.over) return '古坊已失守';", "if (s.over || s.eliminated) return '该庄园已出局';")
economic=economic.replace("!ignoreEnemies && s.enemies.some(e =>", "!ignoreEnemies && hostileUnits(s).some(e =>")
economic=economic.replace("    if (s.mode === 'coop' && s.actorId === undefined) s = playerView(s, b.owner ?? 0);", "    if (s.actorId === undefined && s.players) s = playerView(s, b.owner ?? 0);")
economic=economic.replace(" * (s.day % 7 === 0 ? 1.25 : 1)", '')
economic=economic.replace("w.mode, w.day,", "w.mode,")
economic=economic.replace("w.mode === 'coop' ? b.owner : undefined", 'b.owner')
economic=economic.replace("const players = s.mode === 'coop' && s.actorId === undefined ? [playerView(s, 0), playerView(s, 1)] : [s];", "const players = s.actorId === undefined ? w.players.filter(p=>!p.eliminated).map(p=>playerView(w,p.id)) : s.eliminated ? [] : [s];")
economic=economic.replace("cached.groups.get(w.mode === 'coop' ? owner : undefined)", 'cached.groups.get(owner)')
economic=economic.replace("    const buildings = s.buildings;", "    const buildings = s.buildings;")
game='''/* 古坊奇谭 · deterministic multi-estate simulation. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./maps.js'):root.GFMaps);if(typeof module==='object'&&module.exports)module.exports=api;else root.GF=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Maps){
  'use strict';
'''+head+missions+'\n  /* MATCH_STATE */\n'+economic+'\n  /* MATCH_COMBAT */\n});\n'
(root/'js/game.js').write_text(game,encoding='utf-8')
