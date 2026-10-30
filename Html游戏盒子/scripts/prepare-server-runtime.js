'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { unzipSync } = require('../server-runtime/node_modules/fflate');
const root = path.resolve(__dirname, '..');
const version = '18.20.4';
const checksum = 'bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af';
const url = `https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${version}/nodejs-mobile-v${version}-android.zip`;

(async () => {
  const cache = path.join(root, '.cache'), destination = path.join(root, 'app', 'build', 'nodejs-mobile');
  fs.mkdirSync(cache, { recursive: true });
  const archive = path.join(cache, `nodejs-mobile-${version}-android.zip`);
  if (!fs.existsSync(archive)) {
    console.log(`Downloading Node.js Mobile ${version} Android runtime`);
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Runtime download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(archive + '.download', bytes);
    fs.renameSync(archive + '.download', archive);
  }
  const bytes = fs.readFileSync(archive);
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== checksum) throw new Error(`Runtime archive checksum mismatch: ${actual}`);
  console.log('Archive SHA-256:', actual);
  fs.mkdirSync(destination, { recursive: true });
  for (const [name, content] of Object.entries(unzipSync(bytes))) {
    const target = path.resolve(destination, name);
    if (!target.startsWith(destination + path.sep)) throw new Error(`Invalid archive path: ${name}`);
    if (name.endsWith('/')) fs.mkdirSync(target, { recursive: true });
    else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
  }
  for (const abi of ['armeabi-v7a', 'arm64-v8a', 'x86_64']) {
    if (!fs.existsSync(path.join(destination, 'bin', abi, 'libnode.so'))) throw new Error(`Missing native runtime for ${abi}`);
  }
  if (!fs.existsSync(path.join(destination, 'include', 'node', 'node.h'))) throw new Error('Missing Node.js Mobile headers');
  console.log('Node.js Mobile ready:', destination);
})().catch(error => { console.error(error); process.exitCode = 1; });
