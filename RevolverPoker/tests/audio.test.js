import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameAudio, SOUND_FILES, stagedChipSound } from '../client/audio.js';
import { SOUND_DATA } from '../client/audio-bank.js';
import { createPokerServer } from '../server/index.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

test('many chips requires an amount strictly above both the pot and 100', () => {
  for (const [amount, pot, expected] of [[100, 0, 'stageSmall'], [101, 0, 'stageLarge'],
    [101, 101, 'stageSmall'], [101, 102, 'stageSmall'], [102, 101, 'stageLarge'],
    [500, 1000, 'stageSmall'], [1001, 1000, 'stageLarge']]) {
    assert.equal(stagedChipSound(amount, pot), expected, `${amount} into ${pot}`);
  }
});

function fixture(random = Math.random, volume = 1) {
  const started = [], bankLoads = [], stopped = [];
  const keys = Object.keys(SOUND_FILES);
  const node = () => ({ connect(target) { return target; }, disconnect() {} });
  const context = { state: 'suspended', currentTime: 10, destination: node(),
    async resume() { this.state = 'running'; },
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createDynamicsCompressor: () => Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, { value: 0 }]).concat(Object.entries(node()))),
    async decodeAudioData(bytes) { return { name: keys[new Uint8Array(bytes)[0]] }; },
    createBufferSource: () => ({ ...node(), start(time) { started.push({ name: this.buffer.name, time }); },
      stop() { stopped.push(this); this.onended?.(); } }),
  };
  const audio = new GameAudio({ random, volume, createContext: () => context, now: () => 1000, visible: () => true,
    loadBank: async () => { bankLoads.push(true); return Object.fromEntries(keys.map((key, i) => [key, btoa(String.fromCharCode(i))])); } });
  return { audio, context, started, bankLoads, stopped };
}

test('each dealt card independently selects one of the two files; sources preload once', async () => {
  const choices = [0, .999, .2, .8], f = fixture(() => choices.shift());
  assert.equal(f.audio.play('deal'), false, 'no audio before the first gesture');
  assert.equal(await f.audio.unlock(), true);
  for (let i = 0; i < 4; i++) f.audio.play('deal');
  await flush();
  assert.deepEqual(f.started.map(source => source.name), ['deal1', 'deal2', 'deal1', 'deal2']);
  assert.equal(f.bankLoads.length, 1);
  await f.audio.unlock(); assert.equal(f.bankLoads.length, 1);
});

test('muting cancels scheduled and loading sounds, and disabled sounds never replay on enable', async () => {
  const f = fixture(); await f.audio.unlock();
  f.audio.play('push', { delay: .18 }); await flush();
  assert.equal(f.started[0].time, 10.18);
  f.audio.play('stage', { amount: 102, pot: 101 });
  f.audio.setEnabled(false); await flush();
  assert.equal(f.started.length, 1); assert.equal(f.stopped.length, 1);
  assert.equal(f.audio.play('deal'), false);
  f.audio.setEnabled(true); await flush();
  assert.equal(f.started.length, 1);
  f.audio.play('stage', { amount: 500, pot: 600 }); await flush();
  assert.equal(f.started.at(-1).name, 'stageSmall');
});

test('master volume restores the chosen level and updates active sounds without reloading', async () => {
  const f = fixture(undefined, .4); await f.audio.unlock();
  assert.equal(f.audio.master.gain.value, .72 * .4);
  f.audio.play('fold'); await flush();
  f.audio.setVolume(.75); await flush();
  assert.equal(f.audio.master.gain.value, .72 * .75);
  assert.equal(f.started.length, 1); assert.equal(f.stopped.length, 0);
  assert.equal(f.bankLoads.length, 1);
  f.audio.setVolume(2); assert.equal(f.audio.master.gain.value, .72);
});

test('zero volume cancels scheduled and pending sounds without replaying them when raised', async () => {
  const f = fixture(); await f.audio.unlock();
  f.audio.play('push', { delay: .18 }); await flush();
  f.audio.play('fold'); f.audio.setVolume(0); await flush();
  assert.equal(f.audio.master.gain.value, 0);
  assert.equal(f.started.length, 1); assert.equal(f.stopped.length, 1);
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.audio.play('check'), false);
  f.audio.setVolume(.35); await flush();
  assert.equal(f.started.length, 1); assert.equal(f.bankLoads.length, 1);
  f.audio.play('check'); await flush();
  assert.equal(f.started.at(-1).name, 'check');
});

test('a saved muted volume defers audio loading until the slider is raised', async () => {
  const f = fixture(undefined, 0);
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.audio.context, undefined); assert.equal(f.bankLoads.length, 0);
  assert.equal(f.audio.play('fold'), false);
  f.audio.setVolume(.5); await flush();
  assert.equal(f.audio.master.gain.value, .72 * .5);
  assert.equal(f.bankLoads.length, 1); assert.equal(f.started.length, 0);
});

test('blocked contexts and unavailable files remain optional', async () => {
  const f = fixture(); f.context.resume = async () => { throw new Error('blocked'); };
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.audio.play('check'), false);
  const broken = new GameAudio({ createContext: () => { throw new Error('unsupported'); } });
  assert.equal(await broken.unlock(), false);
  const missing = fixture(); missing.audio.loadBank = async () => ({});
  await missing.audio.unlock(); missing.audio.play('fold'); await flush();
  assert.deepEqual(missing.started, []);
});

test('a failed bank is requested once even through repeated clicks and sound toggles', async () => {
  const f = fixture(); let attempts = 0;
  f.audio.loadBank = async () => { attempts++; throw new Error('unavailable'); };
  for (let i = 0; i < 8; i++) { await f.audio.unlock(); f.audio.play('deal'); }
  f.audio.setEnabled(false); f.audio.setEnabled(true); await flush();
  assert.equal(attempts, 1); assert.deepEqual(f.started, []);
});

test('the script bank matches every production WAV without separate media requests', async () => {
  assert.deepEqual(Object.keys(SOUND_DATA), Object.keys(SOUND_FILES));
  for (const [name, path] of Object.entries(SOUND_FILES)) {
    assert.deepEqual(Buffer.from(SOUND_DATA[name], 'base64'), await readFile(new URL('..' + path, import.meta.url)));
  }
  const source = await readFile(new URL('../client/audio.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test('confirmed actions and blinds play once; reconnects, old actions and All in have no voice', () => {
  const f = fixture(), played = [];
  f.audio.play = (type, options) => played.push({ type, options });
  const room = { code: 'A', serverTime: 1000, hand: { number: 1 } };
  f.audio.sync(room);
  room.actionPresentation = { id: 'a', type: 'allin', startedAt: 1000, endsAt: 1900 };
  f.audio.sync(room); f.audio.sync(room);
  assert.deepEqual(played, [{ type: 'push', options: { delay: .18 } }]);
  room.actionPresentation = { id: 'b', type: 'fold', startedAt: 100, endsAt: 900 };
  f.audio.sync(room); assert.equal(played.length, 1);
  f.audio.sync(null); room.actionPresentation = { id: 'c', type: 'check', startedAt: 1000, endsAt: 1900 };
  f.audio.sync(room); assert.equal(played.length, 1, 'first reconnect snapshot is silent');
  room.actionPresentation = { id: 'd', type: 'check', startedAt: 1000, endsAt: 1900 };
  f.audio.sync(room); assert.equal(played.at(-1).type, 'check');
  room.actionPresentation = null;
  room.opening = { stage: 'smallBlind', smallBlindAt: 1000, bigBlindAt: 2000 };
  f.audio.sync(room); f.audio.sync(room);
  assert.equal(played.filter(sound => sound.options.volume === .8).length, 1);
  room.serverTime = 2000; room.opening.stage = 'bigBlind'; f.audio.sync(room);
  assert.equal(played.filter(sound => sound.options.volume === .8).length, 2);
});

test('all seven production assets serve as 48 kHz mono PCM WAV; originals stay private', async t => {
  const app = createPokerServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  for (const path of Object.values(SOUND_FILES)) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('Content-Type'), 'audio/wav');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt16LE(20), 1); assert.equal(bytes.readUInt16LE(22), 1);
    assert.equal(bytes.readUInt32LE(24), 48000); assert.equal(bytes.readUInt16LE(34), 16);
    assert.deepEqual(bytes, await readFile(new URL('..' + path, import.meta.url)));
  }
  assert.equal((await fetch(base + '/art/audio/source/card-deal-01.mp3')).status, 404);
});
