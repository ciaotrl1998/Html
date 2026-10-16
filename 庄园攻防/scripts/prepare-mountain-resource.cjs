'use strict';
// Export the generated mountain to the game's existing pixel grid and palette.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const work = path.join(root, 'assets/generated/mountain');
const target = path.join(root, 'assets/tiles/resources/mountain.png');
fs.mkdirSync(work, { recursive: true });
if (!fs.existsSync(path.join(work, 'before.png'))) fs.copyFileSync(target, path.join(work, 'before.png'));
const source = PNG.sync.read(fs.readFileSync(path.join(work, 'source.png')));
let left = source.width, top = source.height, right = -1, bottom = -1;
for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
  if (source.data[(y * source.width + x) * 4 + 3] < 128) continue;
  left = Math.min(left, x); right = Math.max(right, x);
  top = Math.min(top, y); bottom = Math.max(bottom, y);
}
if (right < left) throw Error('Generated source has no opaque mountain');
const palette = [[74,46,32], [192,200,168], [160,168,144], [136,152,128], [144,152,112]];
const output = new PNG({ width: 64, height: 64 });
// Retain the original base row (39); taller peaks remain within one tile footprint.
const box = { x: 18, y: 14, width: 30, height: 26 };
for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
  const sx = left + Math.min(right - left, Math.floor((x + .5) * (right - left + 1) / box.width));
  const sy = top + Math.min(bottom - top, Math.floor((y + .5) * (bottom - top + 1) / box.height));
  const from = (sy * source.width + sx) * 4;
  if (source.data[from + 3] < 128) continue;
  const nearest = palette.reduce((best, color) => {
    const distance = color.reduce((sum, value, channel) => sum + (value - source.data[from + channel]) ** 2, 0);
    return distance < best.distance ? { color, distance } : best;
  }, { distance: Infinity });
  const to = ((y + box.y) * output.width + x + box.x) * 4;
  output.data.set([...nearest.color, 255], to);
}
fs.writeFileSync(target, PNG.sync.write(output));
console.log('Exported mountain.png: 64x64, binary transparency, five matching colors');
