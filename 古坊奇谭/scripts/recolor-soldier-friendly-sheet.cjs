const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'assets/generated/soldier-allied-four-directions-atlas-v4.png');
const sourceMetadataPath = path.join(root, 'assets/generated/soldier-allied-four-directions-atlas-v4.json');
const highPath = path.join(root, 'assets/generated/soldier-friendly-four-directions-atlas-v3.png');
const gamePath = path.join(root, 'assets/generated/soldier-friendly-four-directions-atlas-game-v3.png');
const metadataPath = path.join(root, 'assets/generated/soldier-friendly-four-directions-atlas-v3.json');

const source = PNG.sync.read(fs.readFileSync(sourcePath));
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

function isCoreRed(r, g, b, hue, saturation, lightness) {
  if (lightness < 0.06 || saturation < 0.28) return false;
  const redHue = hue <= 15 || hue >= 342;
  const redDominance = r - Math.max(g, b) >= 16;
  return redHue && redDominance;
}

function isAdjacentRedHighlight(r, g, b, hue, saturation, lightness) {
  if (lightness < 0.06 || saturation < 0.32) return false;
  const redHue = hue <= 26 || hue >= 335;
  const redDominance = r - Math.max(g, b) >= 12;
  const skinLike = hue > 10 && hue < 38 && r > 130 && g > 80 && b > 55;
  return redHue && redDominance && !skinLike;
}

const seedMask = new Uint8Array(source.width * source.height);
for (let pixel = 0, offset = 0; offset < output.data.length; pixel++, offset += 4) {
  if (!output.data[offset + 3]) continue;
  const r = output.data[offset];
  const g = output.data[offset + 1];
  const b = output.data[offset + 2];
  const [hue, saturation, lightness] = rgbToHsl(r, g, b);
  if (isCoreRed(r, g, b, hue, saturation, lightness)) seedMask[pixel] = 1;
}

function hasNearbySeed(x, y) {
  const radius = 3;
  for (let dy = -radius; dy <= radius; dy++) {
    const nextY = y + dy;
    if (nextY < 0 || nextY >= source.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const nextX = x + dx;
      if (nextX < 0 || nextX >= source.width) continue;
      if (seedMask[nextY * source.width + nextX]) return true;
    }
  }
  return false;
}

let recoloredPixels = 0;
for (let pixel = 0, offset = 0; offset < output.data.length; pixel++, offset += 4) {
  if (!output.data[offset + 3]) continue;
  const r = output.data[offset];
  const g = output.data[offset + 1];
  const b = output.data[offset + 2];
  const [hue, saturation, lightness] = rgbToHsl(r, g, b);
  const x = pixel % source.width;
  const y = Math.floor(pixel / source.width);
  const shouldRecolor = seedMask[pixel]
    || (isAdjacentRedHighlight(r, g, b, hue, saturation, lightness) && hasNearbySeed(x, y));
  if (!shouldRecolor) continue;
  const tealSaturation = Math.min(0.66, Math.max(0.34, saturation * 0.82));
  const tealLightness = Math.max(0.08, Math.min(0.68, lightness * 0.91));
  const [nextR, nextG, nextB] = hslToRgb(171, tealSaturation, tealLightness);
  output.data[offset] = nextR;
  output.data[offset + 1] = nextG;
  output.data[offset + 2] = nextB;
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
metadata.version = 3;
metadata.faction = 'friendly';
metadata.palette = {
  sourceAccent: 'vermilion red',
  accent: 'teal green',
  accentHue: 171,
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
