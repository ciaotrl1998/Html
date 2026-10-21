/* Shared wire protocol and client prediction. Combat is never advanced by a replica. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game'));
  else root.GFNetwork = factory(root.GF);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const personalKeys = ['coins', 'materials', 'fortuneBuilt', 'gateLevel', 'cooldowns', 'selectedSkill', 'mission'];
  const progressKeys = ['incomeTime', 'coinPending', 'materialPending'];
  const metaKeys = ['time','elapsed','kills','over','result','revision','nextId'];
  function economy(s, owner) {
    const player = G.playerView(s, owner), values = {};
    for (const key of personalKeys) values[key] = clone(player[key]);
    return { at: s.elapsed, player: values, buildings: player.buildings.map(b => [b.id, ...progressKeys.map(key => b[key] || 0)]) };
  }
  function snapshot(s, owner) {
    const next=JSON.parse(G.serialize(s));
    for(const p of next.players)if(p.id!==owner){p.coins=p.materials=p.fortuneBuilt=p.mission=0;p.cooldowns={repel:0,repair:0,thunder:0};}
    for (const b of next.buildings) if (b.owner !== owner) for (const key of progressKeys) b[key] = 0;
    return JSON.stringify(next);
  }
  function packed(entity, group, initial = false) {
    const row = {};
    const unitKeys=['id','x','y','hp','maxHp','level','troopType','baseDamage','targetId','targetBuildingId','attackAt',
      'attack','targetOwner','waypoint','repelled','slowed','slowFactor'];
    const keys = group==='buildings'?Object.keys(entity):initial?[...unitKeys,'owner','barracksId']:unitKeys;
    for (const key of keys) {
      if (['path', 'pathRevision', 'targetTile', 'chaseTile'].includes(key) ||
          (group === 'buildings' && (progressKeys.includes(key) || key === 'cooldown'))) continue;
      if (entity[key] !== undefined) row[key] = ['x', 'y'].includes(key) ? Math.round(entity[key] * 1000) / 1000 : entity[key];
    }
    return row;
  }
  function delta(s, previous = {}) {
    const next = {}, message = { meta: {}, players: s.players.map(p=>({id:p.id,team:p.team,controller:p.controller,selectedSkill:p.selectedSkill,gateLevel:p.gateLevel,eliminated:p.eliminated,kills:p.kills,ai:p.ai})) };
    for (const key of metaKeys) message.meta[key] = clone(s[key]);
    for (const key of ['buildings', 'soldiers']) {
      const before = previous[key] || new Map(), after = new Map(), upsert = [];
      for (const entity of s[key]) {
        const initial=!before.has(entity.id),row=packed(entity,key,initial),text=JSON.stringify(packed(entity,key));
        after.set(entity.id, text);
        if (before.get(entity.id) !== text) upsert.push(row);
      }
      message[key] = { upsert, remove: [...before.keys()].filter(id => !after.has(id)) };
      next[key] = after;
    }
    return { message, next };
  }
  function updateEntities(list, patch, building) {
    const removed = new Set(patch.remove), byId = new Map(list.map(e => [e.id, e]));
    const result = list.filter(e => !removed.has(e.id));
    for (const row of patch.upsert) {
      let entity = byId.get(row.id);
      if (!entity) {
        entity = building ? { cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0 } : { path: [], pathRevision: -1 };
        result.push(entity);
      }
      Object.assign(entity, clone(row));
    }
    return result;
  }
  function copyEntities(current, source) {
    const existing = new Map(current.map(entity => [entity.id, entity]));
    return source.map(row => {
      const entity = existing.get(row.id) || {};
      for (const key of Object.keys(entity)) if (!(key in row)) delete entity[key];
      Object.assign(entity, row);
      // Neither paths nor cooldowns in this display state are used to simulate combat.
      return entity;
    });
  }
  function predict(s, owner, action) {
    const player = G.playerView(s, owner), { kind, x, y } = action, b = G.at(s, x, y);
    if(player.eliminated||s.over)return {ok:false,reason:'该庄园已出局'};
    if(kind==='choose-skill')return G.chooseSkill(player,action.skill);
    if (kind === 'skill') {
      const reason = G.skillReason(player, action.skill);
      if (reason) return { ok: false, reason };
      player.cooldowns[action.skill] = G.SKILLS[action.skill].cooldown;
      return { ok: true };
    }
    const nextId=s.nextId;
    s.nextId=-action.id*10;
    try {
      if (kind === 'build' && action.building === 'fortune') {
        const reason = G.buildReason(player, 'fortune', x, y);
        if (reason) return { ok: false, reason };
        const cost = G.buildCost(player, 'fortune');
        player.coins -= cost.coins; player.materials -= cost.materials; player.fortuneBuilt++;
        s.buildings.push({ id: s.nextId, type: 'fortune', owner, x, y, level: 1, hp: 1, cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0, production: 0, lastHit: -10 }); s.revision++;
        return { ok: true };
      }
      if (kind === 'build') return G.build(player, action.building, x, y);
      if (!b || b.owner !== owner) return { ok: false, reason: '无法操作该地块' };
      if (kind === 'upgrade') return G.upgrade(player, b, {troopType:action.troopType});
      if (kind === 'bulk') return G.bulkUpgrade(player, b);
      if (kind === 'demolish') return G.demolish(player, b);
      return { ok: false, reason: '未知操作' };
    } finally { s.nextId=nextId; }
  }
  function createReplica(raw, owner, session, seq, ack = 0) {
    // Save imports may migrate currencies; live server deltas must already use
    // this version's units or their balances would overwrite converted values.
    try{if(JSON.parse(raw)?.version!==G.VERSION)return null;}catch{return null;}
    const base = G.restore(raw);
    if (!base || base.mode !== 'coop') return null;
    const state = clone(base), replica = { base, state, owner, session, seq, ack, pending: [], economic: economy(base, owner) };
    replica.reconcile = () => {
      const effects = state.effects, projectiles = state.projectiles;
      for (const key of metaKeys) state[key] = clone(base[key]);
      for (const key of ['buildings', 'soldiers']) state[key] = copyEntities(state[key], base[key]);
      for (const key of personalKeys) G.playerView(state, owner)[key] = clone(replica.economic.player[key]);
      for(const p of base.players){
        const target=state.players[p.id];
        for(const key of ['selectedSkill','gateLevel','eliminated','controller','kills','ai'])target[key]=clone(p[key]);
      }
      const byId = new Map(state.buildings.map(b => [b.id, b]));
      for (const [id, ...values] of replica.economic.buildings) {
        const b = byId.get(id);
        if (b) progressKeys.forEach((key, i) => { b[key] = values[i]; });
      }
      let remaining = Math.max(0, base.elapsed - replica.economic.at);
      while (remaining > 1e-8) { const dt = Math.min(.25, remaining); G.stepEconomy(G.playerView(state, owner), dt, false); remaining -= dt; }
      for (const action of replica.pending) predict(state, owner, action);
      state.effects = effects; state.projectiles = projectiles; state.events = [];
    };
    replica.apply = message => {
      if (message.session !== replica.session || message.seq <= replica.seq) return false;
      if (message.seq !== replica.seq + 1) return null;
      Object.assign(base, clone(message.meta));
      for (const key of ['buildings', 'soldiers']) base[key] = updateEntities(base[key], message[key], key === 'buildings');
      message.players.forEach((values, index) => Object.assign(base.players[index], values));
      if (message.economy) replica.economic = clone(message.economy);
      replica.ack = message.ack; replica.pending = replica.pending.filter(action => action.id > message.ack);
      replica.seq = message.seq; replica.reconcile();
      return true;
    };
    replica.act = action => {
      const result = predict(state, owner, action);
      if (result.ok) replica.pending.push(action);
      return result;
    };
    return replica;
  }
  // Predict a separate army, never the replica's authoritative/economic state.
  // The earliest observed arrival offset maps server simulation time onto the
  // local monotonic clock; jittered packets are advanced to that same timeline.
  function createMotionPredictor() {
    const horizon = .5, correctionTime = .18, teleportDistance = 2;
    let shadow = null, units = new Map(), offsets = new Map();
    let clockOffset = null, confirmedAt = 0, receivedAt = 0, displayAt = 0, running = false;
    function simulateTo(time) {
      while (shadow.elapsed + 1e-8 < time) {
        const dt = Math.min(1 / 30, time - shadow.elapsed);
        shadow.elapsed += dt;
        G.stepSoldierMovement(shadow, dt);
      }
    }
    function position(unit) {
      const predicted = units.get(unit.id);
      if (!predicted || unit.hp <= 0) return unit;
      const offset = offsets.get(unit.id);
      const blend = offset ? Math.pow(Math.max(0, 1 - (displayAt - receivedAt) / correctionTime), 2) : 0;
      return { x: predicted.x + (offset?.x || 0) * blend, y: predicted.y + (offset?.y || 0) * blend };
    }
    function advance(now, enabled = true) {
      if (!shadow || !running || !enabled) return;
      displayAt = Math.max(displayAt, now);
      simulateTo(Math.min(confirmedAt + horizon, Math.max(shadow.elapsed, now - clockOffset)));
    }
    function sync(state, now, paused = false, reset = false) {
      advance(now);
      const previous = new Map();
      if (!reset && !paused) for (const unit of shadow?.soldiers || []) previous.set(unit.id, position(unit));
      if (reset || paused || !running || clockOffset === null) clockOffset = now - state.elapsed;
      else clockOffset = Math.min(clockOffset, now - state.elapsed);
      // Preserve this world's terrain/flow caches across ordinary updates.
      if (!shadow || reset) shadow = {};
      Object.assign(shadow, state, { soldiers: state.soldiers.map(unit => clone(unit)) });
      units = new Map(shadow.soldiers.map(unit => [unit.id, unit]));
      confirmedAt = state.elapsed; receivedAt = displayAt = now; running = !paused && !state.over;
      if (running) simulateTo(Math.min(confirmedAt + horizon, Math.max(confirmedAt, now - clockOffset)));
      offsets = new Map();
      for (const unit of shadow.soldiers) {
        const before = previous.get(unit.id);
        if (!before) continue;
        const dx = before.x - unit.x, dy = before.y - unit.y;
        // Large discontinuities (teleports/resyncs) recover immediately.
        if (Math.hypot(dx, dy) < teleportDistance) offsets.set(unit.id, { x: dx, y: dy });
      }
    }
    return { sync, advance, position };
  }
  return { economy, snapshot, delta, createReplica, createMotionPredictor };
});
