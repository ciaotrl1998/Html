'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { WebSocket } = require('ws');
const prelude = path.resolve(__dirname, '..', 'prelude.js');

async function start(t, source, { file = 'server.js', env = {}, packageJson } = {}) {
  const root = fs.mkdtempSync(path.join(process.env.HTMLBOX_TEST_TMP || os.tmpdir(), 'htmlbox-server-'));
  const directory = path.join(root, '任意位置 🚀'); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, file), source);
  fs.writeFileSync(path.join(directory, 'marker.txt'), 'cwd-ok');
  if (packageJson) fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(packageJson));
  const statusFile = path.join(root, 'status.json'), configFile = path.join(root, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({ cwd: directory, title: '测试游戏', statusFile, nonce: 'test-nonce', env }));
  const moduleOptions = file.endsWith('.mjs') || packageJson?.type === 'module' ? ['--experimental-loader', pathToFileURL(path.join(__dirname, '..', 'esm-loader.mjs')).href] : [];
  const child = spawn(process.execPath, ['--require', prelude, ...moduleOptions, path.join(directory, file), 'custom-argument'], {
    env: { ...process.env, HTMLBOX_CONFIG: configFile }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = ''; child.stderr.on('data', data => { stderr += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (fs.existsSync(statusFile)) return { status: JSON.parse(fs.readFileSync(statusFile, 'utf8')), child, directory };
    if (child.exitCode !== null) throw new Error('No readiness report: ' + stderr);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Readiness timeout: ' + stderr);
}

test('arbitrary CommonJS entry retains require.main, cwd, environment and real bound port', async t => {
  const { status } = await start(t, `
    if (require.main !== module) throw Error('Not a main module');
    const text = require('fs').readFileSync('marker.txt','utf8') + ':' + process.env.EXAMPLE + ':' + process.argv[2];
    require('http').createServer((req,res)=>res.end(text)).listen(0, '0.0.0.0');
  `, { file: 'other-entry.cjs', env: { EXAMPLE: 'env-ok' } });
  assert.equal(status.phase, 'running'); assert.equal(status.nonce, 'test-nonce');
  assert(status.port > 0); assert.equal(status.localOnly, false);
  assert.equal(await (await fetch(`http://127.0.0.1:${status.port}`)).text(), 'cwd-ok:env-ok:custom-argument');
});

test('ESM server entries also execute as main programs', async t => {
  const { status } = await start(t, `
    import http from 'node:http';
    http.createServer((req,res)=>res.end('esm-ok')).listen(0,'127.0.0.1');
  `, { file: 'backend.mjs', packageJson: { type: 'module' } });
  assert.equal(status.phase, 'running', JSON.stringify(status));
  assert.equal(status.localOnly, true);
  assert.equal(await (await fetch(`http://127.0.0.1:${status.port}`)).text(), 'esm-ok');
});

test('bundled ws fallback supports servers whose directory contains no node_modules', async t => {
  const { status, directory } = await start(t, `
    const http=require('http'),{WebSocketServer}=require('ws');
    const server=http.createServer((req,res)=>res.end('ok'));
    new WebSocketServer({server}).on('connection',ws=>ws.on('message',data=>ws.send(data.toString())));
    server.listen(0,'0.0.0.0');
  `);
  assert(!fs.existsSync(path.join(directory, 'node_modules')));
  const socket = new WebSocket(`ws://127.0.0.1:${status.port}`); await once(socket, 'open');
  socket.send('建造与升级'); const [message] = await once(socket, 'message'); assert.equal(message.toString(), '建造与升级');
  socket.close(); await once(socket, 'close');
});

test('ESM game servers can import the bundled ws dependency without their own node_modules', async t => {
  const { status } = await start(t, `
    import http from 'node:http';
    import WebSocket, {WebSocketServer} from 'ws';
    const server=http.createServer((req,res)=>res.end(String(typeof WebSocket)));
    new WebSocketServer({server}).on('connection',socket=>socket.send('esm-ws-ok'));
    server.listen(0,'0.0.0.0');
  `, { file: 'server.mjs' });
  assert.equal(status.phase, 'running', JSON.stringify(status));
  assert.equal(await (await fetch(`http://127.0.0.1:${status.port}`)).text(), 'function');
});

test('missing dependencies report a failure rather than a false started address', async t => {
  const { status } = await start(t, `require('htmlbox-nonexistent-test-dependency');`);
  assert.equal(status.phase, 'failed'); assert.match(status.error, /Cannot find module/); assert(!status.port);
});

test('a later metrics listener does not replace the first public game address', async t => {
  const { status } = await start(t, `
    const http=require('http');
    http.createServer((req,res)=>res.end('game')).listen(0,'0.0.0.0');
    http.createServer((req,res)=>res.end('metrics')).listen(0,'0.0.0.0');
  `);
  assert.equal(await (await fetch(`http://127.0.0.1:${status.port}`)).text(), 'game');
});

test('occupied ports report EADDRINUSE rather than accepting an unrelated existing listener', async t => {
  const occupied = http.createServer((req, res) => res.end('other server'));
  await new Promise(resolve => occupied.listen(0, '0.0.0.0', resolve));
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const { status } = await start(t, `require('http').createServer().listen(Number(process.env.PORT),'0.0.0.0');`,
    { env: { PORT: String(occupied.address().port) } });
  assert.equal(status.phase, 'failed'); assert.match(status.error, /EADDRINUSE/);
});

test('clipboard polyfill supports Unicode copy/paste and rejects failed writes', async () => {
  let value = '', succeeds = true;
  const context = { Promise, navigator: {}, HtmlBoxClipboard: { writeText(text) { value = text; return succeeds; }, readText() { return value; } } };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'clipboard.js'), 'utf8'), context);
  await context.navigator.clipboard.writeText('http://192.168.1.100:8787 / 古坊🚀');
  assert.equal(await context.navigator.clipboard.readText(), value);
  succeeds = false;
  await assert.rejects(context.navigator.clipboard.writeText('fail'), /无法写入剪贴板/);
});
