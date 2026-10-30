import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../client/boot.js', import.meta.url), 'utf8');
function boot(protocol = 'file:', search = '', hash = '') {
  const elements = [], scripts = [], images = [], replaced = [], timers = new Map(); let nextTimer = 0;
  const node = () => ({ children: [], classList: { add() {} }, append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; } });
  const loading = node();
  const document = { getElementById: () => loading, createElement() { const result = node(); elements.push(result); return result; }, head: { appendChild: script => scripts.push(script) } };
  const location = { protocol, search, hash, replace: url => replaced.push(url) };
  vm.runInNewContext(source, { document, location, URL, URLSearchParams, Date, Image: class { constructor() { images.push(this); } },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  return { loading, elements, scripts, images, replaced, timers };
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
    page.scripts[0].onerror(); assert.match(page.loading.textContent, /脚本加载失败/);
  }
});
