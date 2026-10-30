Three.js 0.185.1 browser runtime, copied from the npm dependency's official
`build/three.module.min.js`, `build/three.core.min.js`, and `LICENSE`.
`BufferGeometryUtils.js` comes from `examples/jsm/utils/`; its Three.js import
uses the game's `/vendor/three.js` URL so it shares the same engine instance.

Run `node scripts/sync-client-vendor.js` after changing the installed Three.js
version. `npm install` and `npm ci` run this automatically. Keep the two builds
and `THREE-LICENSE.txt` together when distributing the game to mobile devices.
