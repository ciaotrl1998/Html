import test from 'node:test';
import assert from 'node:assert/strict';
import { FullscreenControl } from '../client/fullscreen.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function surface(stored = null, mode = 'standard') {
  const handlers = new Map(), saved = new Map(stored === null ? [] : [['rp-fullscreen', stored]]);
  const node = () => ({ attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, contains(target) { return target === this || target?.parent === this; } });
  const root = node(), button = node(), status = {}, calls = { enter: 0, exit: 0, change: 0 }, table = { tagName: 'CANVAS' };
  const doc = { documentElement: root, hidden: false, activeElement: null, fullscreenEnabled: true,
    addEventListener(name, handler) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(handler); },
    removeEventListener(name, handler) { handlers.get(name)?.delete(handler); } };
  const emit = (name, event = {}) => { for (const handler of handlers.get(name) || []) handler({ isTrusted: true, target: table, ...event }); };
  let allowed = false;
  const key = mode === 'webkit' ? 'webkitFullscreenElement' : 'fullscreenElement';
  const event = mode === 'webkit' ? 'webkitfullscreenchange' : 'fullscreenchange';
  const request = () => {
    calls.enter++;
    if (!allowed) return Promise.reject(new Error('User activation required'));
    doc[key] = root; emit(event); return Promise.resolve();
  };
  const exit = () => { calls.exit++; doc[key] = null; emit(event); return Promise.resolve(); };
  if (mode === 'standard') { root.requestFullscreen = request; doc.exitFullscreen = exit; }
  if (mode === 'webkit') { root.webkitRequestFullscreen = request; doc.webkitExitFullscreen = exit; }
  const control = new FullscreenControl({ doc, button, status, storage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) }, change: () => calls.change++ });
  return { control, doc, root, button, status, calls, saved, table, emit, allow: () => { allowed = true; } };
}

test('fullscreen is enabled by default, retries on the first gesture, and settings exit persists', async t => {
  const s = surface(); t.after(() => s.control.dispose()); await flush();
  assert.equal(s.calls.enter, 1); assert.equal(s.control.enabled, true);
  assert.equal(s.status.textContent, '待进入'); assert.equal(s.button.attributes['aria-checked'], 'true');
  s.allow(); s.emit('pointerup'); await flush();
  assert.equal(s.control.active, true); assert.equal(s.status.textContent, '开启');
  assert.equal(s.root.attributes['data-game-fullscreen'], 'true'); assert.ok(s.calls.change > 0);
  s.button.onclick(); await flush();
  assert.equal(s.control.active, false); assert.equal(s.calls.exit, 1);
  assert.equal(s.status.textContent, '关闭'); assert.equal(s.saved.get('rp-fullscreen'), 'off');
  const entries = s.calls.enter; s.emit('pointerup'); await flush(); assert.equal(s.calls.enter, entries);
  const restored = surface(s.saved.get('rp-fullscreen')); t.after(() => restored.control.dispose()); await flush();
  assert.equal(restored.calls.enter, 0); assert.equal(restored.control.enabled, false);
});

test('saved-off mode can be enabled from settings without its pointer event causing a second toggle', async t => {
  const s = surface('off'); t.after(() => s.control.dispose()); s.allow();
  s.emit('pointerup', { target: { parent: s.button } }); assert.equal(s.calls.enter, 0);
  s.button.onclick(); await flush();
  assert.equal(s.calls.enter, 1); assert.equal(s.control.active, true); assert.equal(s.saved.get('rp-fullscreen'), 'on');
});

test('typing, input focus, Escape and synthetic input never trigger automatic fullscreen', async t => {
  const s = surface(); t.after(() => s.control.dispose()); await flush(); s.allow(); const before = s.calls.enter;
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) s.emit('pointerup', { target: { tagName } });
  s.emit('pointerup', { target: { isContentEditable: true } });
  s.doc.activeElement = { tagName: 'INPUT' }; s.emit('pointerup'); s.doc.activeElement = null;
  s.emit('keydown', { key: 'Escape' }); s.emit('keydown', { key: 'Enter', repeat: true });
  s.emit('pointerup', { isTrusted: false }); await flush(); assert.equal(s.calls.enter, before);
  s.emit('keydown', { key: 'Enter' }); await flush(); assert.equal(s.control.active, true);
});

test('manual browser exit is respected; background suspension keeps the preference for the next interaction', async t => {
  const s = surface(); t.after(() => s.control.dispose()); await flush(); s.allow(); s.emit('pointerup'); await flush();
  s.doc.hidden = true; s.doc.fullscreenElement = null; s.emit('fullscreenchange');
  assert.equal(s.control.enabled, true);
  s.doc.hidden = false; s.emit('pointerup'); await flush(); assert.equal(s.control.active, true);
  s.doc.fullscreenElement = null; s.emit('fullscreenchange');
  assert.equal(s.control.enabled, false); assert.equal(s.saved.get('rp-fullscreen'), 'off');
  const before = s.calls.enter; s.emit('pointerup'); await flush(); assert.equal(s.calls.enter, before, 'Esc exit does not bounce back into fullscreen');
});

test('WebKit-prefixed hosts work and unsupported/restricted hosts leave the game usable', async t => {
  const safari = surface('off', 'webkit'); t.after(() => safari.control.dispose()); safari.allow(); safari.button.onclick(); await flush();
  assert.equal(safari.control.active, true); safari.button.onclick(); await flush(); assert.equal(safari.calls.exit, 1);
  const unsupported = surface(null, 'unsupported'); t.after(() => unsupported.control.dispose());
  assert.equal(unsupported.status.textContent, '浏览器限制'); unsupported.emit('pointerup');
  unsupported.button.onclick(); assert.equal(unsupported.status.textContent, '关闭'); assert.equal(unsupported.calls.enter, 0);
  const restricted = surface('off'); t.after(() => restricted.control.dispose()); restricted.doc.fullscreenEnabled = false;
  restricted.button.onclick(); await flush(); assert.equal(restricted.calls.enter, 0); assert.equal(restricted.status.textContent, '浏览器限制');
});

test('disabling fullscreen while an entry is pending also exits a late browser entry', async t => {
  const s = surface('off'); t.after(() => s.control.dispose());
  let finish;
  s.root.requestFullscreen = () => new Promise(resolve => { finish = resolve; });
  s.control.setEnabled(true); assert.equal(s.control.pending, true);
  s.control.setEnabled(false);
  s.doc.fullscreenElement = s.root; s.emit('fullscreenchange'); finish(); await flush();
  assert.equal(s.control.active, false); assert.equal(s.control.enabled, false); assert.equal(s.status.textContent, '关闭');
});

test('a host that refuses trusted entry is not retried on every gesture and can be retried from settings', async t => {
  const s = surface(); t.after(() => s.control.dispose()); await flush();
  s.emit('pointerup'); await flush(); assert.equal(s.status.textContent, '浏览器限制');
  const before = s.calls.enter;
  for (let i = 0; i < 20; i++) s.emit('pointerup');
  await flush(); assert.equal(s.calls.enter, before);
  s.button.onclick(); s.allow(); s.button.onclick(); await flush(); assert.equal(s.control.active, true);
});
