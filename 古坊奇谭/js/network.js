/* Shared wire protocol and client prediction. Combat is never advanced by a replica. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game'));
  else root.GFNetwork = factory(root.GF);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const personalKeys = ['coins', 'materials', 'fortuneBuilt', 'gateLevel', 'cooldowns', 'selectedSkill', 'mission'];
  const progressKeys = ['incomeTime', 'coinPending', 'materialPending'];
  const metaKeys = ['day', 'phase', 'time', 'elapsed', 'direction', 'kills', 'wave', 'over', 'celebrated', 'revision', 'nextId'];
  function economy(s, owner) {
    const player = G.playerView(s, owner), values = {};
    for (const key of personalKeys) values[key] = clone(player[key]);
    return { at: s.elapsed, player: values, buildings: player.buildings.map(b => [b.id, ...progressKeys.map(key => b[key] || 0)]) };
  }
  function snapshot(s, owner) {
    const next = JSON.parse(G.serialize(s)), other = owner === 0 ? next.partner : next;
    other.coins = other.materials = other.fortuneBuilt = other.mission = 0;
    other.cooldowns = { repel: 0, repair: 0, thunder: 0 };
    for (const b of next.buildings) if (b.owner !== owner) for (const key of progressKeys) b[key] = 0;
    return JSON.stringify(next);
  }
  function packed(entity, group) {
    const row = {};
    const keys = group === 'buildings' ? Object.keys(entity) : group === 'enemies' ?
      ['id', 'type', 'x', 'y', 'hp', 'maxHp', 'boss', 'repelled', 'slowed', 'slowFactor'] :
      ['id', 'barracksId', 'x', 'y', 'hp', 'maxHp', 'level'];
    for (const key of keys) {
      if (['path', 'pathRevision', 'targetTile', 'chaseTile'].includes(key) ||
          (group === 'buildings' && (progressKeys.includes(key) || key === 'cooldown'))) continue;
      if (entity[key] !== undefined) row[key] = ['x', 'y'].includes(key) ? Math.round(entity[key] * 1000) / 1000 : entity[key];
    }
    return row;
  }
  function delta(s, previous = {}) {
    const next = {}, message = { meta: {}, players: [0, 1].map(owner => {
      const player = G.playerView(s, owner);
      return { selectedSkill: player.selectedSkill, gateLevel: player.gateLevel };
    }) };
    for (const key of metaKeys) message.meta[key] = clone(s[key]);
    for (const key of ['buildings', 'enemies', 'soldiers']) {
      const before = previous[key] || new Map(), after = new Map(), upsert = [];
      for (const entity of s[key]) {
        const row = packed(entity, key), text = JSON.stringify(row);
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
      } else if (!building) {
        for (const key of Object.keys(entity)) if (!(key in row) && !['path', 'pathRevision'].includes(key)) delete entity[key];
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
    if (kind === 'choose-skill') return { ok: !player.selectedSkill };
    if (kind === 'skill') {
      const reason = G.skillReason(player, action.skill);
      if (reason) return { ok: false, reason };
      player.cooldowns[action.skill] = G.SKILLS[action.skill].cooldown;
      return { ok: true };
    }
    const phase = s.phase;
    // Economic prediction must not muster soldiers or run attacks, even at night.
    s.phase = 'day'; s.nextId = -action.id * 10;
    try {
      if (kind === 'build' && action.building === 'fortune') {
        const reason = G.buildReason(player, 'fortune', x, y);
        if (reason) return { ok: false, reason };
        const cost = G.buildCost(player, 'fortune');
        player.coins -= cost.coins; player.materials -= cost.materials; player.fortuneBuilt++;
        s.buildings.push({ id: s.nextId, type: 'fortune', owner, x, y, level: 1, hp: 1, cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0 });
        return { ok: true };
      }
      if (kind === 'build') return G.build(player, action.building, x, y);
      if (!b || b.owner !== owner) return { ok: false, reason: '无法操作该地块' };
      if (kind === 'upgrade') return G.upgrade(player, b);
      if (kind === 'bulk') return G.bulkUpgrade(player, b);
      if (kind === 'demolish') return G.demolish(player, b);
      return { ok: false, reason: '未知操作' };
    } finally { s.phase = phase; }
  }
  function createReplica(raw, owner, session, seq, ack = 0) {
    const base = G.restore(raw);
    if (!base || base.mode !== 'coop') return null;
    const state = clone(base), replica = { base, state, owner, session, seq, ack, pending: [], economic: economy(base, owner) };
    replica.reconcile = () => {
      const effects = state.effects, projectiles = state.projectiles;
      for (const key of metaKeys) state[key] = clone(base[key]);
      for (const key of ['buildings', 'enemies', 'soldiers']) state[key] = copyEntities(state[key], base[key]);
      for (const key of personalKeys) G.playerView(state, owner)[key] = clone(replica.economic.player[key]);
      for (const other of [0, 1]) {
        const source = G.playerView(base, other), target = G.playerView(state, other);
        target.selectedSkill = source.selectedSkill; target.gateLevel = source.gateLevel;
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
      for (const key of ['buildings', 'enemies', 'soldiers']) base[key] = updateEntities(base[key], message[key], key === 'buildings');
      message.players.forEach((values, index) => Object.assign(G.playerView(base, index), values));
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
  return { economy, snapshot, delta, createReplica };
});
