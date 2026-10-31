import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('a copied mobile game serves its complete Three.js runtime without node_modules/three', async t => {
  const parent = path.resolve(root, '.cache');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'mobile-runtime-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    await rm(directory, { recursive: true, force: true });
  });
  for (const folder of ['server', 'shared', 'client', 'node_modules/ws']) {
    await cp(path.join(root, folder), path.join(directory, folder), { recursive: true });
  }
  for (const file of ['index.html', 'package.json']) await copyFile(path.join(root, file), path.join(directory, file));
  await assert.rejects(stat(path.join(directory, 'node_modules/three')), { code: 'ENOENT' });
  const { createPokerServer } = await import(pathToFileURL(path.join(directory, 'server/index.js')));
  const app = createPokerServer();
  t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await (await fetch(`${base}/health`)).json()).ok, true);
  const response = await fetch(`${base}/vendor/three.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  const renderer = await response.text();
  const dependency = renderer.match(/from\s*["'](\.\/three\.core\.min\.js)["']/);
  assert.ok(dependency, 'the shipped renderer imports the shipped matching core');
  const core = await fetch(new URL(dependency[1], `${base}/vendor/three.js`));
  assert.equal(core.status, 200);
  assert.match(await core.text(), /REVISION/);
  for (const url of ['/', '/client/boot.js', '/client/app.js', '/client/scene.js', '/client/frame-clock.js', '/client/render-budget.js', '/client/mesh-batching.js', '/client/chip-slider.js', '/client/bet-sizing.js', '/client/vendor/BufferGeometryUtils.js', '/client/style.css', '/vendor/three.core.js']) {
    assert.equal((await fetch(base + url)).status, 200, url);
  }
  for (const name of [...Array.from({ length: 52 }, (_, card) => String(card).padStart(2, '0')), 'back', 'display']) {
    const response = await fetch(`${base}/client/assets/cards/${name}.png`);
    assert.equal(response.status, 200, name); assert.equal(response.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
  assert.equal((await fetch(`${base}/client/card-artwork.js`)).status, 200);
  assert.equal((await fetch(`${base}/client/fullscreen.js`)).status, 200);
});
