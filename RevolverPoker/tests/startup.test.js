import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createPokerServer } from '../server/index.js';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
function start(port) {
  return run(process.execPath, ['server/index.js'], {
    cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    timeout: 6000, windowsHide: true, encoding: 'utf8'
  });
}

test('starting again reports the existing game service and leaves it running', async t => {
  const app = createPokerServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const port = app.server.address().port;
  const result = await start(port);
  assert.match(result.stdout, /服务已在运行/);
  assert.ok(result.stdout.includes(`http://127.0.0.1:${port}`));
  assert.equal(result.stderr, '');
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal((await response.json()).ok, true);
});

test('an unrelated program on the port produces an actionable error without an unhandled crash', async t => {
  const other = http.createServer((req, res) => { res.end('Another application'); });
  await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => other.close(resolve)));
  const port = other.address().port;
  await assert.rejects(start(port), error => {
    assert.equal(error.code, 1);
    assert.ok(error.stderr.includes(`端口 ${port} 已被其他程序占用`));
    assert.match(error.stderr, /\$env:PORT=3089/);
    assert.doesNotMatch(error.stderr, /Unhandled 'error' event|node:events/);
    return true;
  });
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'Another application');
});
