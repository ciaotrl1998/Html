import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { EMPTY_LAYOUT, validateLayout, parseLayoutModule, layoutModule } from '../shared/scene-layout.js';

export function sceneStore(filename) {
  let queue = Promise.resolve();
  async function read() {
    let source;
    try { source = await readFile(filename, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; source = layoutModule(EMPTY_LAYOUT); }
    return { layout: parseLayoutModule(source), revision: createHash('sha256').update(source).digest('hex') };
  }
  function save(layout, revision) {
    const validated = validateLayout(layout);
    const operation = queue.then(async () => {
      const before = await read();
      if (revision !== before.revision) { const error = new Error('场景已被其他编辑页更新，请先重新载入'); error.status = 409; throw error; }
      await mkdir(path.dirname(filename), { recursive: true });
      const temporary = `${filename}.${randomUUID()}.tmp`;
      await writeFile(temporary, layoutModule(validated), 'utf8');
      await rename(temporary, filename);
      return read();
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { read, save };
}

export async function handleSceneRequest(req, res, store) {
  const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const remote = req.socket.remoteAddress;
  const hostname = new URL(`http://${req.headers.host}`).hostname;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) || !['localhost', '127.0.0.1', '[::1]'].includes(hostname)) { json(403, { error: '场景编辑仅允许在服务器电脑上保存' }); return; }
  try {
    if (req.method === 'GET') { json(200, await store.read()); return; }
    if (req.method !== 'POST') { json(405, { error: '不支持的请求方式' }); return; }
    if (req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) { json(403, { error: '请求来源无效' }); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { json(415, { error: '需要 JSON 格式' }); return; }
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 512 * 1024) { json(413, { error: '场景配置过大' }); return; } chunks.push(chunk); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    json(200, await store.save(body.layout, body.revision));
  } catch (error) { json(error.status || 400, { error: error.message }); }
}
