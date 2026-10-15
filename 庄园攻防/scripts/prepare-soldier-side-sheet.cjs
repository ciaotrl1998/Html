const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const projectRoot = path.resolve(__dirname, '..');
const inputPath = path.resolve(process.argv[2] || path.join(projectRoot, 'assets/generated/soldier-allied-sides-source-v3.png'));
const highPath = path.resolve(process.argv[3] || path.join(projectRoot, 'assets/generated/soldier-allied-sides-atlas-v3.png'));
const gamePath = path.resolve(process.argv[4] || path.join(projectRoot, 'assets/generated/soldier-allied-sides-atlas-game-v3.png'));
const metadataPath = path.resolve(process.argv[5] || path.join(projectRoot, 'assets/generated/soldier-allied-sides-atlas-v3.json'));

const source = PNG.sync.read(fs.readFileSync(inputPath));
const sourceColumns = 6;
const sourceRows = 3;
const frameWidth = 256;
const frameHeight = 384;
const baseline = 360;
const alphaThreshold = 32;

if (source.width % sourceColumns !== 0) {
  throw new Error(`Source width ${source.width} is not divisible by ${sourceColumns}.`);
}

const sourceCellWidth = source.width / sourceColumns;
const high = new PNG({ width: frameWidth * sourceColumns, height: frameHeight * sourceRows });
high.data.fill(0);

function sourceCell(level) {
  const row = Math.floor((level - 1) / 3);
  const pair = (level - 1) % 3;
  return {
    row,
    column: pair * 2,
    x0: pair * 2 * sourceCellWidth,
    x1: (pair * 2 + 1) * sourceCellWidth,
    y0: Math.floor(row * source.height / sourceRows),
    y1: Math.floor((row + 1) * source.height / sourceRows),
  };
}

function spriteComponent(cell) {
  const width = cell.x1 - cell.x0;
  const height = cell.y1 - cell.y0;
  const visible = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = source.data[((cell.y0 + y) * source.width + cell.x0 + x) * 4 + 3];
      if (alpha >= alphaThreshold) visible[y * width + x] = 1;
    }
  }

  let largest = [];
  for (let start = 0; start < visible.length; start++) {
    if (!visible[start] || visited[start]) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (!visible[next] || visited[next]) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }

  if (!largest.length) throw new Error(`No visible sprite found in source cell ${cell.column},${cell.row}.`);
  const mask = new Uint8Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (const pixel of largest) {
    mask[pixel] = 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    mask,
    width,
    bounds: {
      minX: cell.x0 + minX,
      minY: cell.y0 + minY,
      maxX: cell.x0 + maxX,
      maxY: cell.y0 + maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
  };
}

function writePixel(target, x, y, rgba) {
  const offset = (y * target.width + x) * 4;
  target.data[offset] = rgba[0];
  target.data[offset + 1] = rgba[1];
  target.data[offset + 2] = rgba[2];
  target.data[offset + 3] = rgba[3];
}

const frames = [];
for (let level = 1; level <= 9; level++) {
  const cell = sourceCell(level);
  const sprite = spriteComponent(cell);
  const bounds = sprite.bounds;
  if (bounds.width > frameWidth || bounds.height > baseline) {
    throw new Error(`Level ${level} sprite (${bounds.width}x${bounds.height}) does not fit ${frameWidth}x${frameHeight}.`);
  }

  const row = Math.floor((level - 1) / 3);
  const pair = (level - 1) % 3;
  const localLeft = Math.floor((frameWidth - bounds.width) / 2);
  const localTop = baseline - bounds.height;

  for (const [direction, column, mirrored] of [
    ['left', pair * 2, false],
    ['right', pair * 2 + 1, true],
  ]) {
    const frameX = column * frameWidth;
    const frameY = row * frameHeight;
    for (let sy = bounds.minY; sy <= bounds.maxY; sy++) {
      for (let sx = bounds.minX; sx <= bounds.maxX; sx++) {
        const maskX = sx - cell.x0;
        const maskY = sy - cell.y0;
        if (!sprite.mask[maskY * sprite.width + maskX]) continue;
        const sourceOffset = (sy * source.width + sx) * 4;
        const relativeX = localLeft + sx - bounds.minX;
        const targetX = frameX + (mirrored ? frameWidth - 1 - relativeX : relativeX);
        const targetY = frameY + localTop + sy - bounds.minY;
        writePixel(high, targetX, targetY, [
          source.data[sourceOffset],
          source.data[sourceOffset + 1],
          source.data[sourceOffset + 2],
          255,
        ]);
      }
    }
    frames.push({
      name: `soldier_lv${level}_${direction}`,
      level,
      direction,
      row,
      column,
      frame: { x: frameX, y: frameY, width: frameWidth, height: frameHeight },
      content: {
        x: mirrored ? frameWidth - localLeft - bounds.width : localLeft,
        y: localTop,
        width: bounds.width,
        height: bounds.height,
      },
      pivot: { x: frameWidth / 2, y: baseline },
    });
  }
}

function nearestNeighbor(sourcePng, divisor) {
  const result = new PNG({ width: sourcePng.width / divisor, height: sourcePng.height / divisor });
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      const sourceOffset = ((y * divisor) * sourcePng.width + x * divisor) * 4;
      const targetOffset = (y * result.width + x) * 4;
      sourcePng.data.copy(result.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return result;
}

const gameScale = 4;
const game = nearestNeighbor(high, gameScale);
fs.mkdirSync(path.dirname(highPath), { recursive: true });
fs.writeFileSync(highPath, PNG.sync.write(high));
fs.writeFileSync(gamePath, PNG.sync.write(game));
fs.writeFileSync(metadataPath, JSON.stringify({
  version: 1,
  source: path.basename(inputPath),
  layout: {
    order: 'Each level is [left, right]; levels 1-3 top row, 4-6 middle row, 7-9 bottom row.',
    columns: sourceColumns,
    rows: sourceRows,
  },
  highResolution: {
    image: path.basename(highPath),
    width: high.width,
    height: high.height,
    frameWidth,
    frameHeight,
    pivot: { x: frameWidth / 2, y: baseline },
  },
  gameResolution: {
    image: path.basename(gamePath),
    width: game.width,
    height: game.height,
    frameWidth: frameWidth / gameScale,
    frameHeight: frameHeight / gameScale,
    pivot: { x: frameWidth / gameScale / 2, y: baseline / gameScale },
    scaleDivisor: gameScale,
  },
  alphaThreshold,
  frames,
}, null, 2) + '\n');

console.log(JSON.stringify({
  source: inputPath,
  highResolutionAtlas: highPath,
  gameResolutionAtlas: gamePath,
  metadata: metadataPath,
  highSize: `${high.width}x${high.height}`,
  gameSize: `${game.width}x${game.height}`,
  frameCount: frames.length,
}, null, 2));
