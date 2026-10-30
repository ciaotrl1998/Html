'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const Module = require('node:module');
const os = require('node:os');
const config = JSON.parse(fs.readFileSync(process.env.HTMLBOX_CONFIG, 'utf8'));

// Run the selected entry as Node's real main module, so require.main === module and ESM work.
// Node also loads --require modules in ESM loader workers; cwd is process-wide and
// already set by JNI, and worker_threads deliberately do not expose chdir().
if (require('node:worker_threads').isMainThread) process.chdir(config.cwd);
Object.assign(process.env, config.env || {});
process.env.NODE_PATH = path.join(__dirname, 'node_modules') +
  (process.env.NODE_PATH ? path.delimiter + process.env.NODE_PATH : '');
Module._initPaths();
if (process.platform === 'android') {
  const enumerate = os.networkInterfaces;
  os.networkInterfaces = () => {
    try { return enumerate(); }
    catch (_) { return config.interfaces || {}; }
  };
}

function report(value) {
  const temporary = config.statusFile + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify({ nonce: config.nonce, title: config.title, ...value }));
  fs.renameSync(temporary, config.statusFile);
}
let published = false, onlyLocal = false;
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const webServer = this instanceof http.Server || this instanceof https.Server;
  if (webServer) {
    this.once('listening', () => {
      const address = this.address();
      if (!address || typeof address === 'string') return;
      const localOnly = address.address === '127.0.0.1' || address.address === '::1';
      // Prefer the public game listener over a loopback-only administrative endpoint.
      if (!published || (onlyLocal && !localOnly)) {
        published = true; onlyLocal = localOnly;
        report({ phase: 'running', port: address.port, localOnly, bindAddress: address.address,
          protocol: this instanceof https.Server ? 'https' : 'http' });
      }
    });
  }
  return listen.apply(this, args);
};
process.on('uncaughtException', error => {
  report({ phase: 'failed', error: error.message || String(error) });
  console.error(error);
  process.exit(1); // Only the dedicated :game_server Android process exits.
});
process.on('unhandledRejection', error => {
  report({ phase: 'failed', error: error?.message || String(error) });
  console.error(error);
  process.exit(1);
});
