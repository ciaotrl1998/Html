const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const frontBackPath = path.join(root, 'assets/generated/soldier-allied-front-back-source-v2.png');
const sidePath = path.join(root, 'assets/generated/soldier-allied-sides-atlas-aligned-v3.png');
const highPath = path.join(root, 'assets/generated/soldier-allied-four-directions-atlas-v4.png');
const gamePath = path.join(root, 'assets/generated/soldier-allied-four-directions-atlas-game-v4.png');
const metadataPath = path.join(root, 'assets/generated/soldier-allied-four-directions-atlas-v4.json');

const frontBack = PNG.sync.read(fs.readFileSync(frontBackPath));
const sides = PNG.sync.read(fs.readFileSync(sidePath));
const sourceColumns = 6;
const sourceRows = 3;
const outputColumns = 12;
const frameWidth = 256;
const frameHeight = 384;
const baseline = 360;
const alphaThreshold = 32;
const high = new PNG({ width: outputColumns * frameWidth, height: sourceRows * frameHeight });
high.data.fill(0);

function sourceRect(png, row, column) {
  return {
    x0: Math.floor(column * png.width / sourceColumns),
    x1: Math.floor((column + 1) * png.width / sourceColumns),
    y0: Math.floor(row * png.height / sourceRows),
    y1: Math.floor((row + 1) * png.height / sourceRows),
  };
}

function largestComponent(png, rect) {
  const width = rect.x1 - rect.x0;
  const height = rect.y1 - rect.y0;
  const visible = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = png.data[((rect.y0 + y) * png.width + rect.x0 + x) * 4 + 3];
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
  if (!largest.length) throw new Error('No visible sprite found.');

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
  return { mask, width, minX, minY, maxX, maxY, contentWidth: maxX - minX + 1, contentHeight: maxY - minY + 1 };
}

function writePixel(target, x, y, source, sourceOffset) {
  const targetOffset = (y * target.width + x) * 4;
  target.data[targetOffset] = source.data[sourceOffset];
  target.data[targetOffset + 1] = source.data[sourceOffset + 1];
  target.data[targetOffset + 2] = source.data[sourceOffset + 2];
  target.data[targetOffset + 3] = 255;
}

function placeGeneratedFrame(source, rect, row, column) {
  const component = largestComponent(source, rect);
  if (component.contentWidth > frameWidth || component.contentHeight > baseline) {
    throw new Error(`Sprite ${component.contentWidth}x${component.contentHeight} does not fit the output frame.`);
  }
  const left = Math.floor((frameWidth - component.contentWidth) / 2);
  const top = baseline - component.contentHeight;
  const frameX = column * frameWidth;
  const frameY = row * frameHeight;
  for (let y = component.minY; y <= component.maxY; y++) {
    for (let x = component.minX; x <= component.maxX; x++) {
      if (!component.mask[y * component.width + x]) continue;
      const sourceX = rect.x0 + x;
      const sourceY = rect.y0 + y;
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      writePixel(high, frameX + left + x - component.minX, frameY + top + y - component.minY, source, sourceOffset);
    }
  }
  return { x: left, y: top, width: component.contentWidth, height: component.contentHeight };
}

function placeAlignedFrame(source, rect, row, column) {
  const frameX = column * frameWidth;
  const frameY = row * frameHeight;
  let minX = frameWidth;
  let minY = frameHeight;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      const sourceOffset = ((rect.y0 + y) * source.width + rect.x0 + x) * 4;
      if (!source.data[sourceOffset + 3]) continue;
      writePixel(high, frameX + x, frameY + y, source, sourceOffset);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const frames = [];
for (let level = 1; level <= 9; level++) {
  const row = Math.floor((level - 1) / 3);
  const group = (level - 1) % 3;
  const firstColumn = group * 4;
  const sourcePair = group * 2;
  const directions = [
    ['front', frontBack, sourceRect(frontBack, row, sourcePair), placeGeneratedFrame],
    ['back', frontBack, sourceRect(frontBack, row, sourcePair + 1), placeGeneratedFrame],
    ['left', sides, sourceRect(sides, row, sourcePair), placeAlignedFrame],
    ['right', sides, sourceRect(sides, row, sourcePair + 1), placeAlignedFrame],
  ];
  directions.forEach(([direction, source, rect, place], index) => {
    const column = firstColumn + index;
    const content = place(source, rect, row, column);
    frames.push({
      name: `soldier_lv${level}_${direction}`,
      level,
      direction,
      row,
      column,
      frame: { x: column * frameWidth, y: row * frameHeight, width: frameWidth, height: frameHeight },
      content,
      pivot: { x: frameWidth / 2, y: baseline },
    });
  });
}

function nearestNeighbor(source, divisor) {
  const result = new PNG({ width: source.width / divisor, height: source.height / divisor });
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      const sourceOffset = ((y * divisor) * source.width + x * divisor) * 4;
      const targetOffset = (y * result.width + x) * 4;
      source.data.copy(result.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return result;
}

const gameScale = 4;
const game = nearestNeighbor(high, gameScale);
fs.writeFileSync(highPath, PNG.sync.write(high));
fs.writeFileSync(gamePath, PNG.sync.write(game));
fs.writeFileSync(metadataPath, JSON.stringify({
  version: 1,
  directionOrder: ['front', 'back', 'left', 'right'],
  layout: {
    order: 'Each level is [front, back, left, right]; levels 1-3 top row, 4-6 middle row, 7-9 bottom row.',
    columns: outputColumns,
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
  frames,
}, null, 2) + '\n');

console.log(JSON.stringify({
  highResolutionAtlas: highPath,
  gameResolutionAtlas: gamePath,
  metadata: metadataPath,
  highSize: `${high.width}x${high.height}`,
  gameSize: `${game.width}x${game.height}`,
  frameCount: frames.length,
}, null, 2));
