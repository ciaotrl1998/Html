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
  for (const url of ['/', '/client/boot.js', '/client/app.js', '/client/scene.js', '/client/style.css', '/vendor/three.core.js']) {
    assert.equal((await fetch(base + url)).status, 200, url);
  }
});
