'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const advance = (s, seconds) => { for (let i = 0; i < seconds * 10; i++) G.step(s, .1); };

test('all new game modes start with 150 coins, 200 materials and no selected skill', () => {
  for (const s of [G.createState(), G.createState(null), G.createState(42, 1), G.createState(42), G.createCoopState(42, 'horizontal'), G.createCoopState(42, 'vertical')]) {
    const players = s.mode === 'coop' ? [G.playerView(s), G.playerView(s, 1)] : [s];
    for (const p of players) {
      assert.deepEqual([p.coins, p.materials, p.selectedSkill], [150, 200, null]);
      assert.deepEqual(p.cooldowns, {repel:0, repair:0, thunder:0});
      assert.deepEqual(G.rates(p), {coins:1, materials:0});
    }
    advance(s, 1);
    for (const p of players) assert.deepEqual([p.coins, p.materials], [151, 200]);
  }
});

test('shrine doubles through level seven then grows by 1.5 and pays the advertised rate', () => {
  assert.equal(G.DEFS.shrine.income, 1);
  for (let level = 1; level <= 15; level++) {
    const s = G.createState(null), shrine = s.buildings[0];
    shrine.level = level; shrine.hp = G.maxHP(shrine);
    const rate = 2 ** Math.min(6,level-1) * 1.5 ** Math.max(0,level-7);
    assert.equal(G.incomeFactor(shrine), rate);
    assert.equal(G.income(s, shrine), rate);
    advance(s, 1); assert.equal(s.coins, 150 + Math.floor(rate));
    assert(Math.abs(shrine.coinPending-(rate-Math.floor(rate)))<1e-9, `Lv${level} retains fractional income`);
    s.day = 7;
    assert.equal(G.income(s, shrine), rate * 1.25);
  }
  assert.equal(G.incomeFactor({type:'tea', level:4}), 4 * 1.65);
});

test('skill choice is one-time, validates own keys and permits late old-save choices', () => {
  for (const phase of ['day', 'dusk', 'night']) for (const id of Object.keys(G.SKILLS)) {
    const s = G.createState(null); s.phase = phase;
    for (const invalid of ['unknown', 'toString', '__proto__', 'constructor', null, 0, ['repair'], {toString:()=>id}]) {
      const before = G.serialize(s);
      assert.equal(G.chooseSkill(s, invalid).ok, false);
      assert.equal(G.serialize(s), before);
    }
    assert(G.chooseSkill(s, id).ok);
    for (const next of Object.keys(G.SKILLS)) assert.equal(G.chooseSkill(s, next).ok, false);
    assert.equal(s.selectedSkill, id);
  }
  const over = G.createState(null); over.over = true;
  assert.equal(G.chooseSkill(over, 'repair').ok, false); assert.equal(over.selectedSkill, null);
});

test('unselected and nonchosen skills reject without effects, damage or cooldown cost', () => {
  for (const id of Object.keys(G.SKILLS)) {
    const s = G.createState(null); G.startNight(s); advance(s, 1);
    s.buildings[0].hp = 900;
    for (const skill of Object.keys(G.SKILLS)) {
      const before = G.serialize(s), effects = [...s.effects];
      assert.match(G.skillReason(s, skill), /先选择/);
      assert.equal(G.skill(s, skill).ok, false);
      assert.equal(G.serialize(s), before); assert.deepEqual(s.effects, effects);
    }
    assert(G.chooseSkill(s, id).ok);
    for (const other of Object.keys(G.SKILLS).filter(key => key !== id)) {
      const before = G.serialize(s);
      assert.match(G.skillReason(s, other), /未选择/);
      assert.equal(G.skill(s, other).ok, false); assert.equal(G.serialize(s), before);
    }
    assert(G.skill(s, id).ok); assert.equal(s.cooldowns[id], G.SKILLS[id].cooldown);
    assert.equal(G.skill(s, id).ok, false);
    for (const other of Object.keys(G.SKILLS).filter(key => key !== id)) assert.equal(s.cooldowns[other], 0);
    const loaded = G.restore(G.serialize(s)); assert(loaded);
    assert.equal(loaded.selectedSkill, id); assert.equal(G.chooseSkill(loaded, id).ok, false);
  }
});

test('coop players independently choose and persist skills and cooldowns', () => {
  const s = G.createCoopState(42), p = G.playerView(s, 1);
  assert(G.chooseSkill(s, 'repel').ok); assert.equal(p.selectedSkill, null);
  assert(G.chooseSkill(p, 'repair').ok);
  assert.deepEqual([s.selectedSkill, s.partner.selectedSkill], ['repel', 'repair']);
  G.startNight(s); advance(s, 1);
  assert(G.skill(s, 'repel').ok); assert(G.skill(p, 'repair').ok);
  assert.equal(G.skill(p, 'repel').ok, false); assert.equal(G.skill(s, 'repair').ok, false);
  assert.deepEqual(s.cooldowns, {repel:18, repair:0, thunder:0});
  assert.deepEqual(p.cooldowns, {repel:0, repair:24, thunder:0});
  const loaded = G.restore(G.serialize(s)); assert(loaded);
  assert.deepEqual([G.playerView(loaded).selectedSkill, G.playerView(loaded, 1).selectedSkill], ['repel', 'repair']);
  assert.deepEqual(loaded.partner.cooldowns, s.partner.cooldowns);
});

test('existing save versions migrate missing choices to null without resetting stock or cooldowns', () => {
  const saves = [G.createState(null), G.createState(42), G.createCoopState(42), ...require('./fixtures/coop-v6.json')];
  for (const source of saves) {
    const raw = JSON.parse(G.serialize(source));
    const players = raw.mode === 'coop' ? [raw, raw.partner] : [raw];
    for (const [i, p] of players.entries()) {
      delete p.selectedSkill; p.coins = 234.5 + i; p.materials = 678.25 + i;
      p.cooldowns = {repel:3.5, repair:7, thunder:11};
    }
    const loaded = G.restore(JSON.stringify(raw)); assert(loaded); assert.equal(loaded.version, raw.version);
    const restored = loaded.mode === 'coop' ? [loaded, loaded.partner] : [loaded];
    for (const [i, p] of restored.entries()) {
      assert.equal(p.selectedSkill, null);
      assert.deepEqual([p.coins, p.materials, p.cooldowns], [players[i].coins, players[i].materials, players[i].cooldowns]);
    }
    loaded.phase = 'night'; assert(G.chooseSkill(loaded, 'thunder').ok);
    assert.match(G.skillReason(loaded, 'thunder'), /11 秒/);
  }
  for (const version of [1, 2, 3]) {
    const raw = JSON.parse(G.serialize(G.createState(null))); raw.version = version;
    delete raw.selectedSkill; raw.coins = 321; raw.materials = 123; raw.cooldowns.repair = 8;
    const loaded = G.restore(JSON.stringify(raw)); assert(loaded);
    assert.deepEqual([loaded.selectedSkill, loaded.coins, loaded.materials, loaded.cooldowns.repair], [null, 321, 123, 8]);
  }
});

test('save validation accepts only null or valid skill strings for each player', () => {
  for (const source of [G.createState(null), G.createState(42), G.createCoopState(42)]) {
    for (const owner of source.mode === 'coop' ? [0, 1] : [0]) {
      for (const value of [null, ...Object.keys(G.SKILLS), 'unknown', 'toString', '__proto__', 'constructor', '', 1, false, [], {}]) {
        const raw = JSON.parse(G.serialize(source)), p = owner ? raw.partner : raw;
        p.selectedSkill = value;
        const loaded = G.restore(JSON.stringify(raw));
        if (value === null || Object.keys(G.SKILLS).includes(value)) {
          assert(loaded); assert.equal(owner ? loaded.partner.selectedSkill : loaded.selectedSkill, value);
        } else assert.equal(loaded, null);
      }
    }
  }
});

test('shorter daylight retains one coin per second before the first night and funds opening buildings', () => {
  assert.equal(G.DAY,60);assert.equal(G.DUSK,8);
  for (const seed of [null, 1, 7, 42, 73193, 99991]) {
    const s = G.createState(seed); advance(s, G.DAY + G.DUSK + .2);
    const openingCoins=150+G.DAY+G.DUSK;
    assert.equal(s.phase, 'night'); assert.deepEqual([s.coins, s.materials], [openingCoins, 200]);
    const size = G.worldSize(s), plots = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) plots.push([x,y]);
    for (const type of ['tea', 'tower', 'mulberry', 'quarry']) {
      const plot = plots.find(([x,y]) => !G.buildReason(s, type, x, y, true)); assert(plot);
      const opening = G.restore(G.serialize(s)), cost = G.buildCost(opening, type);
      assert.equal(G.buildReason(opening, type, ...plot), '');
      assert(G.build(opening, type, ...plot).ok);
      const reward = G.MISSIONS.slice(s.mission, opening.mission).reduce((sum, m) => sum + m.reward, 0);
      assert.deepEqual([opening.coins, opening.materials], [openingCoins - cost.coins + reward, 200 - cost.materials]);
      for (const resource of ['coins', 'materials'].filter(key => cost[key] > 0)) {
        const poor = G.restore(G.serialize(s)); poor[resource] = cost[resource] - 1;
        const before = G.serialize(poor);
        assert.match(G.buildReason(poor, type, ...plot), /^差/);
        assert.equal(G.build(poor, type, ...plot).ok, false);
        assert.equal(G.serialize(poor), before);
      }
    }
  }
});
