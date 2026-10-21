'use strict';
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const dataUrl = name => 'data:image/png;base64,' + fs.readFileSync(path.join(root, name)).toString('base64');
function pngAssets(directory = 'assets') {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) result.push(...pngAssets(relative));
    else if (entry.isFile() && entry.name.endsWith('.png')) result.push(relative);
  }
  return result;
}
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => '<style>\n' + read('css/style.css') + '\n</style>');
html = html.replace('<link rel="stylesheet" href="css/png-interface.css">', () => '<style>\n' + read('css/png-interface.css') + '\n</style>');
html = html.replace('src="assets/ui/backgrounds/title-town.png"', () => 'src="' + dataUrl('assets/ui/backgrounds/title-town.png') + '"');
html = html.replace('href="icon.png"', () => 'href="' + dataUrl('icon.png') + '"');
const sources = ['js/maps.js', 'js/game.js', 'js/network.js', 'js/art.js', 'js/autoplay.js', 'js/app.js'];
const geometry = JSON.parse(read('js/art.js').match(/\/\* building-art:start \*\/([\s\S]*?)\/\* building-art:end \*\//)[1]);
// Art-production sources are local-only. Keep the extra consistency check on
// the development machine, but let play-only checkouts build the shipped PNGs.
const localMetrics = 'assets/generated/gate-destruction-v9/metrics.json';
if (fs.existsSync(path.join(root, localMetrics))) {
  const buildingArt = JSON.parse(read(localMetrics));
  require('node:assert/strict').deepEqual(geometry, buildingArt, 'Renderer geometry must match the installed building PNG metrics');
} else {
  console.log('未发现本机美术制作元数据，使用已提交的建筑渲染配置。');
}
const runtime = sources.map(file => esbuild.transformSync(read(file), { target: 'es2017', charset: 'utf8', sourcefile: path.basename(file) }).code).join('\n');
fs.writeFileSync(path.join(root, 'js/runtime.js'), runtime, 'utf8');
const packagedAssets = ['assets/sprites/soldiers', 'assets/sprites/buildings', 'assets/tiles', 'assets/ui', 'assets/overlays', 'assets/effects', 'assets/scenery'].flatMap(directory => pngAssets(directory));
const assetMap = Object.fromEntries(packagedAssets.map(asset => [asset, dataUrl(asset)]));
const embeddedUI = 'window.GF_ASSET_URLS=' + JSON.stringify(assetMap) + ';\n' + read('js/ui.js');
const scripts = ['js/boot.js', 'js/ui.js', 'js/runtime.js'];
for (const file of scripts) html = html.replace(`<script defer src="${file}"></script>`, '');
html = html.replace('</body>', () => scripts.map(file => '<script>\n' + (file === 'js/runtime.js' ? runtime : file === 'js/ui.js' ? embeddedUI : read(file)).replace(/<\/script/gi, '<\\/script') + '\n</script>').join('\n') + '\n</body>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
// 图标保留为本地文件，供 HTML 游戏盒扫描读取。
fs.copyFileSync(path.join(root, 'icon.png'), path.join(root, 'dist/icon.png'));
const target = path.join(root, 'dist/庄园攻防.html');
const output = html.replace(/[\t ]+$/gm, '');
fs.writeFileSync(target, output, 'utf8');
console.log('已生成离线单文件：' + target);
