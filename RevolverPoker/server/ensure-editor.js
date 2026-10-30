import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function running() {
  try { const r = await fetch('http://127.0.0.1:3090/health', { signal: AbortSignal.timeout(1500) }); return (await r.json()).sceneEditor === true; } catch { return false; }
}
if (!await running()) {
  mkdirSync(new URL('../.cache/', import.meta.url), { recursive: true });
  const log = openSync(new URL('../.cache/editor.log', import.meta.url), 'a');
  const child = spawn(process.execPath, ['server/editor.js'], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  child.unref(); closeSync(log);
  let ready = false;
  for (let i = 0; i < 30; i++) { if (await running()) { ready = true; break; } await new Promise(r => setTimeout(r, 200)); }
  if (!ready) { console.error('编辑器启动失败，请检查 .cache/editor.log 或 3090 端口占用。'); process.exit(1); }
}
console.log('场景编辑器已就绪：http://127.0.0.1:3090/editor');
