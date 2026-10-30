import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../client/boot.js', import.meta.url), 'utf8');
function boot(protocol = 'file:', search = '', hash = '', options = {}) {
  const elements = [], scripts = [], images = [], replaced = [], timers = new Map(); let nextTimer = 0;
  const node = () => ({ children: [], style: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, get firstChild() { return this.children[0]; }, appendChild(child) { this.children.push(child); }, removeChild(child) { this.children.splice(this.children.indexOf(child), 1); } });
  const loading = node(), game = node(), listeners = {};
  const window = { innerHeight: 736, addEventListener(name, handler) { listeners[name] = handler; }, ...options.window };
  const document = { getElementById: id => id === 'game' ? game : loading, createElement(tag) { const result = node(); if (tag === 'script' && options.modules !== false) result.noModule = false; elements.push(result); return result; }, head: { appendChild: script => scripts.push(script) } };
  const location = { protocol, search, hash, replace: url => replaced.push(url) };
  vm.runInNewContext(source, { window, document, location, navigator: { userAgent: options.userAgent || '' }, Date, Image: class { constructor() { images.push(this); } },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  return { window, game, listeners, loading, elements, scripts, images, replaced, timers };
}

test('local index loads a classic bootstrap and uses relative local styles without loading file-origin ES modules', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script defer src="client\/boot\.js"><\/script>/);
  assert.doesNotMatch(html, /<script[^>]+type="module"/);
  assert.match(html, /href="client\/style\.css"/);
  const style = await readFile(new URL('../client/style.css', import.meta.url), 'utf8');
  assert.match(style, /@import url\('\.\/theme\.css'\)/);
  const page = boot('file:', '?room=198044&serverPort=3091', '#table');
  assert.equal(page.scripts.length, 0); assert.equal(page.replaced.length, 0);
  assert.match(page.images[0].src, /^http:\/\/127\.0\.0\.1:3091\/client\/mark\.svg\?launch=/);
  page.images[0].onload();
  assert.equal(page.replaced[0], 'http://127.0.0.1:3091/?room=198044#table');
  assert.equal(page.timers.size, 0);
});

test('unavailable service shows recovery instructions and retry does not accept stale probes', () => {
  const page = boot(); const [, message, retry] = page.loading.children;
  assert.equal(retry.hidden, true);
  page.images[0].onerror();
  assert.equal(retry.hidden, false); assert.match(message.textContent, /启动游戏\.cmd/); assert.equal(page.replaced.length, 0);
  assert.match(message.textContent, /保持.*CMD 窗口开启/);
  retry.onclick(); assert.equal(retry.hidden, true);
  page.images[0].onload(); assert.equal(page.replaced.length, 0);
  page.images[1].onload(); assert.equal(page.replaced[0], 'http://127.0.0.1:3088/');
});

test('timeout and invalid port values never navigate to an arbitrary host or port', () => {
  for (const port of ['0', '65536', 'https://example.com', '3088;bad', '-1']) {
    const page = boot('file:', `?serverPort=${encodeURIComponent(port)}`);
    assert.match(page.images[0].src, /^http:\/\/127\.0\.0\.1:3088\//);
    [...page.timers.values()][0](); assert.equal(page.loading.children[2].hidden, false);
    page.images[0].onload(); assert.equal(page.replaced.length, 0, 'late success cannot redirect after a timeout');
  }
});

test('HTTP and HTTPS pages load the normal same-origin game module directly', () => {
  for (const protocol of ['http:', 'https:']) {
    const page = boot(protocol); assert.equal(page.images.length, 0); assert.equal(page.replaced.length, 0);
    assert.equal(page.scripts.length, 1); assert.equal(page.scripts[0].type, 'module'); assert.equal(page.scripts[0].src, '/client/app.js');
    page.scripts[0].onerror(); assert.match(page.loading.children[1].textContent, /脚本加载失败/);
  }
});

test('legacy viewport units cannot collapse the game, and viewport resizing updates its height', async () => {
  const css = await readFile(new URL('../client/style.css', import.meta.url), 'utf8');
  assert.match(css, /#game\{height:100vh;height:100dvh;width:100%;max-width:540px/);
  const page = boot();
  assert.equal(page.game.style.height, '736px');
  page.window.innerHeight = 812; page.listeners.resize();
  assert.equal(page.game.style.height, '812px');
  let resize;
  const viewport = { height: 701.4, addEventListener(name, handler) { resize = handler; } };
  const visual = boot('http:', '', '', { window: { visualViewport: viewport } });
  assert.equal(visual.game.style.height, '701px');
  viewport.height = 420; resize(); assert.equal(visual.game.style.height, '420px');
});

test('desktop frames match the phone aspect ratio and fit wide, narrow and tall windows after resizing', () => {
  const page = boot('http:', '', '', { window: { innerWidth: 1440, innerHeight: 900 } });
  for (const [width, height] of [[1440, 900], [300, 1000], [960, 1600]]) {
    page.window.innerWidth = width; page.window.innerHeight = height; page.listeners.resize();
    const frameWidth = parseFloat(page.game.style.width), frameHeight = parseFloat(page.game.style.height);
    assert.ok(Math.abs(frameWidth / frameHeight - 1200 / 2652) < 1e-9);
    assert.ok(frameWidth <= Math.min(width, 540) && frameHeight <= height + 1e-6);
    assert.ok(Math.abs(parseFloat(page.game.style.marginTop) - (height - frameHeight) / 2) < 1e-6);
    assert.equal(page.game.attributes['data-phone-frame'], 'true');
  }
});

test('mobile screens retain their own full viewport instead of receiving the desktop phone frame', () => {
  for (const userAgent of ['Mozilla/5.0 (Linux; Android 12)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)']) {
    const page = boot('http:', '', '', { userAgent, window: { innerWidth: 390, innerHeight: 844 } });
    assert.equal(page.game.style.width, ''); assert.equal(page.game.style.height, '844px');
    assert.equal(page.game.attributes['data-phone-frame'], 'false');
  }
});

test('old WebViews get an explicit message instead of silently ignoring module scripts', () => {
  const page = boot('http:', '', '', { modules: false });
  assert.equal(page.scripts.length, 0);
  assert.match(page.loading.children[1].textContent, /WebView.*不支持/);
  assert.equal(page.loading.hidden, false);
});

test('initialization errors before the scene try/catch remain visible, without replacing an initialized game', () => {
  const page = boot('http:');
  page.listeners.unhandledrejection({ reason: new Error('startup storage unavailable') });
  assert.match(page.loading.children[1].textContent, /startup storage unavailable/);
  page.listeners.error({ message: 'Unsupported syntax' });
  assert.match(page.loading.children[1].textContent, /Unsupported syntax/);
  page.window.RevolverPokerBoot.ready();
  page.loading.hidden = true;
  page.listeners.error({ message: 'later unrelated error' });
  assert.equal(page.loading.hidden, true);
});

test('Android local entries explain the game box server flow, including content URLs', () => {
  for (const protocol of ['file:', 'content:']) {
    const page = boot(protocol, '', '', { userAgent: 'Mozilla/5.0 (Linux; Android 12)' });
    page.images[0].onerror();
    assert.match(page.loading.children[1].textContent, /建立服务器.*进入游戏/);
    assert.doesNotMatch(page.loading.children[1].textContent, /\.cmd/);
  }
});
