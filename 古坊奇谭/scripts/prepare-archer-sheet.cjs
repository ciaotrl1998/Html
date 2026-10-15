const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const workDirectory = path.join(root, 'assets/generated/archers');

function enlarge(png, scale) {
  const result = new PNG({ width: png.width * scale, height: png.height * scale });
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      const from = (Math.floor(y / scale) * png.width + Math.floor(x / scale)) * 4;
      png.data.copy(result.data, (y * result.width + x) * 4, from, from + 4);
    }
  }
  return result;
}

function writePng(filename, png) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, PNG.sync.write(png));
}

function extractSprite(png, rectangle) {
  const width = rectangle.x1 - rectangle.x0;
  const height = rectangle.y1 - rectangle.y0;
  const visible = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (png.data[((rectangle.y0 + y) * png.width + rectangle.x0 + x) * 4 + 3] >= 128) {
        visible[y * width + x] = 1;
      }
    }
  }
  const components = [];
  for (let start = 0; start < visible.length; start++) {
    if (!visible[start] || visited[start]) continue;
    const pixels = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const current = stack.pop();
      pixels.push(current);
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
    components.push(pixels);
  }
  components.sort((a, b) => b.length - a.length);
  if (!components.length) throw new Error('An expected archer cell is empty.');
  const retained = components.filter((component, index) => index === 0 || component.length >= 20);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (const pixels of retained) {
    for (const pixel of pixels) {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const result = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });
  result.data.fill(0);
  for (const pixels of retained) {
    for (const pixel of pixels) {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const from = ((rectangle.y0 + y) * png.width + rectangle.x0 + x) * 4;
      const to = ((y - minY) * result.width + x - minX) * 4;
      png.data.copy(result.data, to, from, from + 3);
      result.data[to + 3] = 255;
    }
  }
  return result;
}

function fitFrame(sprite, frameWidth, frameHeight, scale) {
  const frame = new PNG({ width: frameWidth, height: frameHeight });
  frame.data.fill(0);
  const width = Math.max(1, Math.round(sprite.width * scale));
  const height = Math.max(1, Math.round(sprite.height * scale));
  const left = Math.floor((frameWidth - width) / 2);
  const top = 28 - height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const leftEdge = x * sprite.width / width;
      const rightEdge = (x + 1) * sprite.width / width;
      const topEdge = y * sprite.height / height;
      const bottomEdge = (y + 1) * sprite.height / height;
      let coverage = 0;
      const channels = [0, 0, 0];
      for (let sy = Math.floor(topEdge); sy < Math.ceil(bottomEdge); sy++) {
        for (let sx = Math.floor(leftEdge); sx < Math.ceil(rightEdge); sx++) {
          if (sx >= sprite.width || sy >= sprite.height) continue;
          const from = (sy * sprite.width + sx) * 4;
          if (!sprite.data[from + 3]) continue;
          const area = (Math.min(sx + 1, rightEdge) - Math.max(sx, leftEdge))
            * (Math.min(sy + 1, bottomEdge) - Math.max(sy, topEdge));
          coverage += area;
          for (let channel = 0; channel < 3; channel++) channels[channel] += sprite.data[from + channel] * area;
        }
      }
      const area = (rightEdge - leftEdge) * (bottomEdge - topEdge);
      if (coverage / area < 0.23) continue;
      const to = ((top + y) * frameWidth + left + x) * 4;
      for (let channel = 0; channel < 3; channel++) frame.data[to + channel] = Math.round(channels[channel] / coverage);
      frame.data[to + 3] = 255;
    }
  }
  return frame;
}

function copyFrame(source, target, left, top, mirror = false) {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const from = (y * source.width + x) * 4;
      const targetX = mirror ? source.width - 1 - x : x;
      const to = ((top + y) * target.width + left + targetX) * 4;
      source.data.copy(target.data, to, from, from + 4);
    }
  }
}

function pack(input) {
  const source = PNG.sync.read(fs.readFileSync(input));
  const atlas = new PNG({ width: 240, height: 90 });
  atlas.data.fill(0);
  const frameWidth = 20;
  const frameHeight = 30;
  const directions = ['front', 'back', 'left', 'right'];
  const frames = [];
  for (let level = 1; level <= 9; level++) {
    const groupX = (level - 1) % 3;
    const groupY = Math.floor((level - 1) / 3);
    const extracted = directions.slice(0, 3).map((direction, index) => {
      const sourceColumn = groupX * 2 + index % 2;
      const sourceRow = groupY * 2 + Math.floor(index / 2);
      const rect = {
        x0: Math.floor(sourceColumn * source.width / 6),
        x1: Math.floor((sourceColumn + 1) * source.width / 6),
        y0: Math.floor(sourceRow * source.height / 6),
        y1: Math.floor((sourceRow + 1) * source.height / 6),
      };
      const sprite = extractSprite(source, rect);
      return { sprite, rect };
    });
    const targetHeight = level >= 8 ? 26 : level >= 6 ? 25 : 23;
    const scale = Math.min(...extracted.map(({ sprite }) => Math.min((frameWidth - 2) / sprite.width, targetHeight / sprite.height)));
    let leftFrame;
    for (const [index, direction] of directions.entries()) {
      const { sprite, rect } = extracted[Math.min(index, 2)];
      const frame = fitFrame(sprite, frameWidth, frameHeight, scale);
      if (direction === 'left') leftFrame = frame;
      const column = groupX * 4 + index;
      const x = column * frameWidth;
      const y = groupY * frameHeight;
      // Keep both side directions pixel-exact counterparts at a single pivot.
      copyFrame(direction === 'right' ? leftFrame : frame, atlas, x, y, direction === 'right');
      frames.push({
        name: `archer_lv${level}_${direction}`,
        level,
        direction,
        frame: { x, y, width: frameWidth, height: frameHeight },
        pivot: { x: 10, y: 28 },
        source: rect,
        mirrored: direction === 'right',
      });
    }
  }
  const output = path.join(root, 'assets/sprites/soldiers/archer_player-red.png');
  const preview = path.join(workDirectory, 'archer-player-red-preview-8x.png');
  const metadata = path.join(workDirectory, 'archer-player-red.json');
  writePng(output, atlas);
  writePng(preview, enlarge(atlas, 8));
  fs.writeFileSync(metadata, JSON.stringify({
    image: 'assets/sprites/soldiers/archer_player-red.png',
    type: 'archer',
    faction: 'player',
    width: atlas.width,
    height: atlas.height,
    frameWidth,
    frameHeight,
    columns: 12,
    rows: 3,
    directionOrder: directions,
    levels: 9,
    pivot: { x: 10, y: 28 },
    frames,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ output, preview, metadata, frameCount: frames.length }, null, 2));
}

if (process.argv[2] === 'reference') {
  const input = path.join(root, 'assets/sprites/soldiers/infantry_player-red.png');
  const output = path.join(workDirectory, 'player-red-reference-8x.png');
  writePng(output, enlarge(PNG.sync.read(fs.readFileSync(input)), 8));
  console.log(output);
} else if (process.argv[2] === 'pack') {
  pack(path.resolve(process.argv[3] || path.join(workDirectory, 'player-red-source-v1.png')));
} else {
  throw new Error('Use: node scripts/prepare-archer-sheet.cjs reference | pack [source.png]');
}
