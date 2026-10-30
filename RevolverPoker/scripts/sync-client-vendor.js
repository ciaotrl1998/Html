// Ship the browser engine with the game: HTML 游戏盒子 supplies ws for its Node
// server, but a copied game directory must also contain Three.js for the client.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../node_modules/three/', import.meta.url);
const target = new URL('../client/vendor/', import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ['three.module.min.js', 'three.core.min.js']) {
  await copyFile(new URL(`build/${file}`, source), new URL(file, target));
}
await copyFile(new URL('LICENSE', source), new URL('THREE-LICENSE.txt', target));
const geometryUtils = await readFile(new URL('examples/jsm/utils/BufferGeometryUtils.js', source), 'utf8');
await writeFile(new URL('BufferGeometryUtils.js', target), geometryUtils.replace("from 'three'", "from '/vendor/three.js'"));
