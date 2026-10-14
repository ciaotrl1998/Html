'use strict';
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const dataUrl = name => 'data:image/png;base64,' + fs.readFileSync(path.join(root, name)).toString('base64');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => '<style>\n' + read('css/style.css') + '\n</style>');
const sources = ['js/maps.js', 'js/game.js', 'js/network.js', 'js/art.js', 'js/autoplay.js', 'js/app.js'];
const runtime = sources.map(file => esbuild.transformSync(read(file), { target: 'es2017', charset: 'utf8', sourcefile: path.basename(file) }).code).join('\n');
fs.writeFileSync(path.join(root, 'js/runtime.js'), runtime, 'utf8');
const embeddedRuntime = [
  ['assets/sprites/soldiers/player-red.png', 'assets/sprites/soldiers/player-red.png'],
  ['assets/sprites/soldiers/ally-green.png', 'assets/sprites/soldiers/ally-green.png'],
  ['assets/sprites/soldiers/enemy-purple.png', 'assets/sprites/soldiers/enemy-purple.png']
].reduce((code, [source, asset]) => code.replaceAll(source, dataUrl(asset)), runtime);
const scripts = ['js/boot.js', 'js/runtime.js'];
for (const file of scripts) html = html.replace(`<script defer src="${file}"></script>`, '');
html = html.replace('</body>', () => scripts.map(file => '<script>\n' + (file === 'js/runtime.js' ? embeddedRuntime : read(file)).replace(/<\/script/gi, '<\\/script') + '\n</script>').join('\n') + '\n</body>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const target = path.join(root, 'dist/古坊奇谭.html');
fs.writeFileSync(target, html, 'utf8');
console.log('已生成离线单文件：' + target);
