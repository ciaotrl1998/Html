const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'assets/generated/soldier-allied-four-directions-atlas-v4.png');
const maskPath = path.join(root, 'assets/generated/soldier-friendly-four-directions-atlas-v3.png');
const sourceMetadataPath = path.join(root, 'assets/generated/soldier-allied-four-directions-atlas-v4.json');
const highPath = path.join(root, 'assets/generated/soldier-enemy-purple-four-directions-atlas-v1.png');
const gamePath = path.join(root, 'assets/generated/soldier-enemy-purple-four-directions-atlas-game-v1.png');
const metadataPath = path.join(root, 'assets/generated/soldier-enemy-purple-four-directions-atlas-v1.json');

const source = PNG.sync.read(fs.readFileSync(sourcePath));
const mask = PNG.sync.read(fs.readFileSync(maskPath));
if (source.width !== mask.width || source.height !== mask.height) {
  throw new Error('Source and friendly mask atlases must have identical dimensions.');
}

const output = new PNG({ width: source.width, height: source.height });
source.data.copy(output.data);

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function hslToRgb(hue, saturation, lightness) {
  const h = hue / 360;
  if (!saturation) {
    const gray = Math.round(lightness * 255);
    return [gray, gray, gray];
  }
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = value => {
    let t = value;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}

let recoloredPixels = 0;
for (let offset = 0; offset < output.data.length; offset += 4) {
  if (!source.data[offset + 3]) continue;
  const isFactionAccent = source.data[offset] !== mask.data[offset]
    || source.data[offset + 1] !== mask.data[offset + 1]
    || source.data[offset + 2] !== mask.data[offset + 2];
  if (!isFactionAccent) continue;

  const [, saturation, lightness] = rgbToHsl(
    source.data[offset],
    source.data[offset + 1],
    source.data[offset + 2],
  );
  const purpleSaturation = Math.min(0.7, Math.max(0.38, saturation * 0.88));
  const purpleLightness = Math.max(0.07, Math.min(0.62, lightness * 0.84));
  const [r, g, b] = hslToRgb(282, purpleSaturation, purpleLightness);
  output.data[offset] = r;
  output.data[offset + 1] = g;
  output.data[offset + 2] = b;
  recoloredPixels++;
}

function nearestNeighbor(png, divisor) {
  const result = new PNG({ width: png.width / divisor, height: png.height / divisor });
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      const sourceOffset = ((y * divisor) * png.width + x * divisor) * 4;
      const targetOffset = (y * result.width + x) * 4;
      png.data.copy(result.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return result;
}

const gameScale = 4;
const game = nearestNeighbor(output, gameScale);
fs.writeFileSync(highPath, PNG.sync.write(output));
fs.writeFileSync(gamePath, PNG.sync.write(game));

const metadata = JSON.parse(fs.readFileSync(sourceMetadataPath, 'utf8'));
metadata.version = 1;
metadata.faction = 'enemy';
metadata.palette = {
  sourceAccent: 'vermilion red',
  accent: 'dark purple',
  accentHue: 282,
  recoloredPixels,
};
metadata.highResolution.image = path.basename(highPath);
metadata.gameResolution.image = path.basename(gamePath);
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');

console.log(JSON.stringify({
  source: sourcePath,
  highResolutionAtlas: highPath,
  gameResolutionAtlas: gamePath,
  metadata: metadataPath,
  recoloredPixels,
  frameCount: metadata.frames.length,
}, null, 2));
