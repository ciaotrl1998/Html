import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { GameMusic, MUSIC_TRACK } from '../client/music.js';
import { createPokerServer } from '../server/index.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const sources = [], loaded = [];
  const context = {
    state: 'suspended', currentTime: 10,
    async resume() { this.state = 'running'; },
    createGain: () => ({ gain: { value: 1 }, connect() {} }),
    createBufferSource: () => ({
      connect() {},
      disconnect() {},
      start(when, offset) { this.offset = offset; sources.push(this); },
      stop() { this.stopped = true; },
    }),
  };
  const music = new GameMusic({
    volume: .25, createContext: () => context,
    async loadTrack(track) { loaded.push(track); return { track, duration: 100 }; },
    ...options,
  });
  return { music, context, sources, loaded };
}

test('music starts once after a gesture and loops the 01 track on one source', async () => {
  const { music, sources, loaded } = fixture();
  assert.equal(sources.length, 0);
  await Promise.all([music.unlock(), music.unlock()]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].loop, true);
  assert.equal(sources[0].buffer.track, MUSIC_TRACK);
  assert.deepEqual(loaded, [MUSIC_TRACK]);
});

test('music changes volume live and resumes from the same offset after mute or hiding the page', async () => {
  const { music, context, sources, loaded } = fixture({ volume: 0 });
  await music.unlock();
  assert.deepEqual(loaded, []);
  music.setVolume(.3);
  await flush();
  music.setVolume(.6);
  assert.equal(music.gain.gain.value, .6);
  assert.equal(sources.length, 1);
  context.currentTime += 5;
  music.setVolume(0);
  assert.equal(sources[0].stopped, true);
  context.currentTime += 10;
  music.setVolume(.25);
  await flush();
  assert.equal(sources[1].offset, 5);
  context.currentTime += 103;
  music.setVisible(false);
  await music.unlock();
  assert.equal(sources[1].stopped, true);
  assert.equal(sources.length, 2);
  music.setVisible(true);
  await flush();
  assert.equal(sources[2].offset, 8);
  assert.equal(sources[2].buffer, sources[0].buffer);
  assert.equal(loaded.length, 1);
});

test('a track that finishes loading while hidden waits to play', async () => {
  let finishLoad;
  const { music, sources } = fixture({
    loadTrack: () => new Promise(resolve => { finishLoad = resolve; }),
  });
  const starting = music.unlock();
  await flush();
  music.setVisible(false);
  finishLoad({ duration: 100 });
  await starting;
  assert.equal(sources.length, 0);
  music.setVisible(true);
  await flush();
  assert.equal(sources.length, 1);
});

test('an unavailable track stays silent without repeated requests', async () => {
  const requests = [];
  const { music, sources } = fixture({
    async loadTrack(track) {
      requests.push(track);
      throw new Error('Track unavailable');
    },
  });
  await music.unlock();
  await music.unlock();
  assert.equal(sources.length, 0);
  assert.deepEqual(requests, [MUSIC_TRACK]);
});

test('the game bundles and serves only the 01 background track', async t => {
  const app = createPokerServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const response = await fetch(base + MUSIC_TRACK);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(`..${MUSIC_TRACK}.mp3`, import.meta.url)));
  assert.deepEqual(await readdir(new URL('../client/assets/music/', import.meta.url)), ['saloon-americana-01.mp3']);
  for (const number of ['02', '03', '04']) {
    const track = `/client/assets/music/saloon-americana-${number}`;
    const response = await fetch(base + track);
    assert.equal(response.status, 404);
  }
});
