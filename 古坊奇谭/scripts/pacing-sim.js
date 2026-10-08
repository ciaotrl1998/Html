'use strict';
const G = require('../js/game.js');
const A = require('../js/autoplay.js');
const fs = require('node:fs');
const crypto = require('node:crypto');

const SEEDS = [1, 7, 42, 73193, 99991];
const DT = .1;
const round = n => +n.toFixed(4);
const same = (a, b) => a.x === b.x && a.y === b.y;

function buildingCost(type, level) {
  const cost = {...G.DEFS[type].cost};
  for (let k = 1; k < level; k++) {
    const next = G.upgradeCost({type, level:k});
    cost.coins += next.coins; cost.materials += next.materials;
  }
  return cost;
}

function runCombat({day, seed, direction, mode, maxSeconds = 600}) {
  if (![1, 27, 28].includes(day) || !SEEDS.includes(seed) || !Number.isInteger(direction) || direction < 0 || direction > 3 ||
      !(day === 1 ? ['one', 'two'] : ['arrows', 'core', 'mix', 'arrowsTao']).includes(mode) ||
      !Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new Error('Invalid combat scenario');
  const s = G.createState(seed); s.seed = seed; s.day = day; s.direction = direction;
  const foundation = day === 1 ? 1 : 15;
  s.gateLevel = foundation;
  for (const b of s.buildings) { b.level = foundation; b.hp = G.maxHP(b); }
  const plan = A.layout(s, day === 1 ? (mode === 'one' ? 1 : 2) : 3);
  const cost = {coins:0, materials:0}, placements = [];
  function add(type, p, level) {
    const b = p && G.grantBuilding(s, type, p.x, p.y, level);
    if (!b) throw new Error(`Cannot place ${type}: seed ${seed}, direction ${direction}`);
    const c = buildingCost(type, level);
    cost.coins += c.coins; cost.materials += c.materials;
    placements.push({type, x:p.x, y:p.y, level});
  }
  function freePlots() {
    return plan.plots.filter(p => !G.at(s,p.x,p.y) && !plan.economy.some(q => same(p,q)));
  }
  if (day === 1) {
    for (const p of plan.towers.filter(p => p.direction === direction)) add('tower',p,1);
  } else {
    for (const gate of G.estate(s).gates) {
      plan.towers.filter(p => p.direction === gate.direction).forEach((p,i) => {
        const mixed = ['core','mix'].includes(mode);
        add(mixed ? ['tower','rock','barracks'][i] : 'tower',p,mixed ? [9,8,7][i] : 9);
      });
      if (mode === 'mix') {
        const p = freePlots().filter(p => Math.hypot(p.x-gate.x,p.y-gate.y) <= G.DEFS.earth.range)
          .sort((a,b) => Math.hypot(a.x-gate.x,a.y-gate.y)-Math.hypot(b.x-gate.x,b.y-gate.y) || a.y-b.y || a.x-b.x)[0];
        add('earth',p,3);
      }
    }
    for (const type of mode === 'mix' ? ['tao','zhong'] : mode === 'arrowsTao' ? ['tao'] : []) {
      const p = freePlots().sort((a,b) => Math.hypot(a.x-12,a.y-12)-Math.hypot(b.x-12,b.y-12) || a.y-b.y || a.x-b.x)[0];
      add(type,p,type === 'tao' ? 4 : 3);
    }
  }
  const gates = s.buildings.filter(b => b.type === 'gate'), minima = gates.map(b => b.hp), broken = new Set();
  const initialIds = new Set(s.buildings.map(b => b.id));
  G.startNight(s); const total = s.wave.total;
  let ticks = 0;
  while (s.phase === 'night' && !s.over && ticks * DT < maxSeconds) {
    G.step(s,DT); ticks++;
    gates.forEach((b,i) => { minima[i] = Math.min(minima[i],b.hp); if (b.hp === 0) broken.add(b.id); });
  }
  const selected = day === 1 ? gates.map((b,i) => b.direction === direction ? i : -1).filter(i => i >= 0) : gates.map((b,i) => i);
  return {day,seed,direction,mode,foundation,cost,placements,total,kills:s.kills,
    complete:s.day > day,over:s.over,timeout:s.phase === 'night' && !s.over,
    nightSeconds:round(ticks*DT),brokenGates:broken.size,
    destroyedBuildings:[...initialIds].filter(id => !s.buildings.some(b => b.id === id)).length,
    minGateHP:round(Math.min(...selected.map(i => minima[i]))),
    minGateRatio:round(Math.min(...selected.map(i => minima[i]/G.maxHP(gates[i])))),
    gates:gates.map((b,i) => ({direction:b.direction,maxHP:G.maxHP(b),minHP:round(minima[i])}))};
}

function summarize(rows) {
  if (!rows.length) throw new Error('Empty results');
  const range = key => [Math.min(...rows.map(r => r[key])),Math.max(...rows.map(r => r[key]))];
  const mean = key => round(rows.reduce((n,r) => n+r[key],0)/rows.length);
  return {day:rows[0].day,mode:rows[0].mode,runs:rows.length,cost:rows[0].cost,
    complete:rows.filter(r => r.complete).length,defeats:rows.filter(r => r.over).length,
    timeouts:rows.filter(r => r.timeout).length,breakRuns:rows.filter(r => r.brokenGates > 0).length,
    brokenGates:rows.reduce((n,r) => n+r.brokenGates,0),destroyedBuildings:rows.reduce((n,r) => n+r.destroyedBuildings,0),
    minGateHP:range('minGateHP'),minGateRatio:range('minGateRatio'),
    nightSeconds:range('nightSeconds'),meanNightSeconds:mean('nightSeconds')};
}

// Sample the actual spawn API indirectly, removing each spawn before combat can alter it.
function waveProfile(day) {
  const s = G.createState(1); s.seed = 1; s.day = day; G.startNight(s);
  const total = s.wave.total, groups = {}, seen = new Set();
  let ticks = 0;
  while (seen.size < total && ticks++ < 10000) {
    G.step(s,DT);
    for (const e of s.enemies) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const key = e.type + (e.boss ? '-boss' : '');
      const group = groups[key] ||= {type:e.type,boss:e.boss,count:0,hp:round(e.maxHp),damage:round(e.damage)};
      group.count++;
    }
    s.enemies = [];
  }
  if (seen.size !== total) throw new Error(`Incomplete wave sample: day ${day}`);
  return {day,total,directions:G.raidDirections(s),groups:Object.values(groups),
    totalHP:round(Object.values(groups).reduce((n,g) => n+g.count*g.hp,0))};
}

function runAutoplay(seed, days = 7, maxSeconds = 6000) {
  const s = G.createState(seed); s.seed = seed;
  const bot = A.create(s), history = [], milestones = {};
  let ticks = 0, nightTicks = 0, min = 1, broken = new Set();
  while (!s.over && s.day <= days && ticks*DT < maxSeconds) {
    const day = s.day, night = s.phase === 'night';
    bot.tick(DT); G.step(s,DT); ticks++;
    if (night) {
      nightTicks++;
      for (const b of s.buildings.filter(b => b.type === 'gate')) {
        min = Math.min(min,b.hp/G.maxHP(b)); if (!b.hp) broken.add(b.id);
      }
    }
    if (s.day !== day) {
      history.push({day,nightSeconds:round(nightTicks*DT),minGateRatio:round(min),brokenGates:broken.size,
        shrine:G.shrineLevel(s),gate:s.gateLevel,towerLevels:s.buildings.filter(b => b.type === 'tower').map(b => b.level),rates:G.rates(s)});
      nightTicks = 0; min = 1; broken = new Set();
    }
  }
  const report = bot.report();
  for (const a of report.actions.filter(a => a.kind === 'upgrade' && ['shrine','gate','tower'].includes(a.type))) {
    const key = `${a.type}L${a.level}`; milestones[key] ??= a.day;
  }
  return {seed,day:s.day,complete:s.day > days,over:s.over,seconds:round(ticks*DT),
    skills:report.skills,builds:report.builds,upgrades:report.upgrades,milestones,history};
}

function run() {
  const combat = [];
  for (const day of [1,27,28]) for (const mode of day === 1 ? ['one','two'] : ['arrows','core','mix','arrowsTao']) {
    const rows = [];
    for (const seed of SEEDS) for (let direction = 0; direction < 4; direction++) rows.push(runCombat({day,seed,direction,mode}));
    combat.push({summary:summarize(rows),rows});
  }
  return {schema:1,dt:DT,seeds:SEEDS,gameHash:crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../js/game.js'))).digest('hex'),
    costBasis:'DEFS base cost + normal cumulative upgrades; excludes fortune acquisition and common foundations',
    buildings:Object.values(G.DEFS).map(d => ({type:d.id,name:d.name,cost:d.cost,hp:d.hp,income:d.income,resource:d.resource,fortuneOnly:!!d.fortuneOnly})),
    waves:[1,2,3,4,7,10,15,21,27,28].map(waveProfile),combat,autoplay:SEEDS.map(seed => runAutoplay(seed))};
}

if (require.main === module) {
  const result = run();
  if (process.argv.includes('--full')) console.log(JSON.stringify(result));
  else console.log(JSON.stringify({...result,combat:result.combat.map(c => c.summary)},null,2));
}
module.exports = {SEEDS,DT,buildingCost,runCombat,summarize,waveProfile,runAutoplay,run};
