var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GFMaps = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  const worldSize = (s) => s.worldSize, worldWidth = worldSize, worldHeight = (s) => s.worldHeight || s.worldSize, worldCenter = (s) => Math.floor(s.worldSize / 2);
  const inside = (x, y, s) => x >= 0 && y >= 0 && x < worldWidth(s) && y < worldHeight(s);
  const dist8 = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const NEIGHBORS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const world = (s) => s, terrainCache = /* @__PURE__ */ new WeakMap(), coopMaps = /* @__PURE__ */ new WeakMap();
  function createTemplate(mapSeed) {
    return { mapSeed: mapSeed >>> 0, estateSeed: (Math.imul(mapSeed, 2246822519) ^ 3266489917) >>> 0, mapGeneration: 2, worldSize: 25 };
  }
  const generatedTerrain = (s) => {
    var _a;
    return ((_a = terrainCache.get(s)) == null ? void 0 : _a.cells) || variedTerrain(s);
  };
  const baseTerrain = (x, y, s) => generatedTerrain(s)[y * 25 + x] || "plain";
  function coopMap(s) {
    s = world(s);
    const cached = coopMaps.get(s);
    if (cached) return cached;
    const horizontal = s.coopLayout === "horizontal", gap = -1;
    const width = worldWidth(s), height = worldHeight(s);
    const sources = [createTemplate(s.mapSeed), createTemplate(Math.imul(s.mapSeed, 1664525) + 1013904223 >>> 0)];
    const originals = sources.map((source, owner) => {
      const original = estate(source), cells = new Set(original.cells);
      const axes = [...cells].map((k) => horizontal ? k % 25 : Math.floor(k / 25));
      const face = owner === 0 ? Math.max(...axes) : Math.min(...axes);
      for (const key of [...cells]) {
        const axis = horizontal ? key % 25 : Math.floor(key / 25), cross = horizontal ? Math.floor(key / 25) : key % 25;
        for (let n = Math.min(axis, face); n <= Math.max(axis, face); n++) cells.add(horizontal ? cross * 25 + n : n * 25 + cross);
      }
      const walls = /* @__PURE__ */ new Set();
      for (const k of cells) for (const [dx, dy] of NEIGHBORS8) if (!cells.has(k + dy * 25 + dx)) walls.add(k + dy * 25 + dx);
      for (const g of original.gates) walls.delete(g.y * 25 + g.x);
      return __spreadProps(__spreadValues({}, original), { cells, walls });
    });
    const bounds = originals.map((land) => {
      const keys = [...land.cells, ...land.walls, ...land.gates.map((g) => g.y * 25 + g.x)];
      return { min: Math.min(...keys.map((k) => horizontal ? k % 25 : Math.floor(k / 25))), max: Math.max(...keys.map((k) => horizontal ? k % 25 : Math.floor(k / 25))) };
    });
    const length = bounds.reduce((n, b) => n + b.max - b.min + 1, gap), start = Math.floor(((horizontal ? width : height) - length) / 2);
    const terrainCells = Array(width * height).fill("plain"), estates = [];
    let cursor = start;
    for (let owner = 0; owner < 2; owner++) {
      const original = originals[owner], source = sources[owner];
      const offset = cursor - bounds[owner].min, dx = horizontal ? offset : Math.floor(width / 2) - 12, dy = horizontal ? Math.floor(height / 2) - 12 : offset;
      cursor += bounds[owner].max - bounds[owner].min + 1 + gap;
      const convert = (key) => (Math.floor(key / 25) + dy) * width + key % 25 + dx;
      const cells = new Set([...original.cells].map(convert));
      const walls = new Set([...original.walls, ...original.gates.map((g) => g.y * 25 + g.x)].map(convert));
      const center = { x: 12 + dx, y: 12 + dy };
      const inward = horizontal ? owner === 0 ? 1 : 3 : owner === 0 ? 2 : 0;
      const gates = original.gates.filter((g) => g.direction !== inward).map((g) => __spreadProps(__spreadValues({}, g), { x: g.x + dx, y: g.y + dy, owner }));
      const inner = owner === 0 ? bounds[owner].max - 2 : bounds[owner].min + 2;
      for (const g of gates) {
        if (horizontal ? g.direction % 2 === 0 : g.direction % 2 === 1) {
          const line = [...original.cells].filter((k) => (horizontal ? k % 25 : Math.floor(k / 25)) === inner);
          if (horizontal) {
            g.x = inner + dx;
            g.y = (g.direction === 0 ? Math.min(...line.map((k) => Math.floor(k / 25))) - 1 : Math.max(...line.map((k) => Math.floor(k / 25))) + 1) + dy;
          } else {
            g.y = inner + dy;
            g.x = (g.direction === 3 ? Math.min(...line.map((k) => k % 25)) - 1 : Math.max(...line.map((k) => k % 25)) + 1) + dx;
          }
        }
        walls.delete(g.y * width + g.x);
      }
      const roads = new Set([...original.roads].filter((k) => original.cells.has(k)).map(convert));
      const root = center.y * width + center.x, queue = [root], parents = /* @__PURE__ */ new Map([[root, null]]);
      for (let i = 0; i < queue.length; i++) for (const delta of [-width, 1, width, -1]) {
        const next = queue[i] + delta;
        if (cells.has(next) && !parents.has(next)) {
          parents.set(next, queue[i]);
          queue.push(next);
        }
      }
      for (const g of gates) {
        const [gx, gy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][g.direction];
        let key = (g.y - gy) * width + g.x - gx;
        while (key != null) {
          roads.add(key);
          key = parents.get(key);
        }
        roads.add(g.y * width + g.x);
      }
      for (const key of [...original.cells, ...original.walls]) terrainCells[convert(key)] = baseTerrain(key % 25, Math.floor(key / 25), source);
      for (const g of gates) terrainCells[g.y * width + g.x] = "plain";
      estates.push({ owner, cells, walls, gates, roads, center });
    }
    const merge = (property) => [].concat(...estates.map((e) => Array.from(e[property])));
    const combined = { cells: new Set(merge("cells")), walls: new Set(merge("walls")), gates: merge("gates"), roads: new Set(merge("roads")), estates, gap: 0, sharedWall: new Set([...estates[0].walls].filter((k) => estates[1].walls.has(k))) };
    for (const g of combined.gates) {
      const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][g.direction];
      for (let x = g.x + dx, y = g.y + dy; x >= 0 && y >= 0 && x < width && y < height; x += dx, y += dy) {
        const key = y * width + x;
        if (combined.walls.has(key) || combined.cells.has(key)) break;
        combined.roads.add(key);
        terrainCells[key] = "plain";
      }
    }
    const value = { land: combined, terrain: terrainCells };
    coopMaps.set(s, value);
    return value;
  }
  function variedTerrain(s) {
    let seed = s.mapSeed >>> 0;
    const rand = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const pick = (n) => Math.floor(rand() * n), cells = Array(625).fill("plain"), turn = pick(4);
    const index = (x, y) => {
      for (let i = 0; i < turn; i++) [x, y] = [24 - y, x];
      return y * 25 + x;
    };
    let rx = 2 + pick(8);
    for (let y = 1; y < 24; y++) {
      const limit = y >= 8 && y <= 16 ? 8 : 9;
      const target = y >= 10 && y <= 14 ? 8 : Math.max(2, Math.min(limit, rx + pick(5) - 2));
      const next = Math.min(limit, target);
      for (let x = Math.min(rx, next); x <= Math.max(rx, next); x++) cells[index(x, y)] = "water";
      rx = next;
    }
    const lakeCount = 1 + pick(3);
    for (let n = 0; n < lakeCount; n++) {
      const candidates = [];
      for (let y = 2; y <= 22; y++) for (let x = 2; x <= 22; x++) {
        if (dist8(x, y, 12, 12) <= 4 || cells[y * 25 + x] === "water") continue;
        if (NEIGHBORS8.every(([dx, dy]) => cells[(y + dy) * 25 + x + dx] !== "water")) candidates.push([x, y]);
      }
      if (!candidates.length) break;
      const frontier = [candidates[pick(candidates.length)]], lake = /* @__PURE__ */ new Set(), target = 5 + pick(5);
      while (frontier.length && lake.size < target) {
        const [x, y] = frontier.splice(pick(frontier.length), 1)[0], key = y * 25 + x;
        if (x < 1 || x > 23 || y < 1 || y > 23 || dist8(x, y, 12, 12) <= 3 || lake.has(key) || cells[key] === "water") continue;
        if (NEIGHBORS8.some(([dx, dy]) => cells[(y + dy) * 25 + x + dx] === "water" && !lake.has((y + dy) * 25 + x + dx))) continue;
        lake.add(key);
        cells[key] = "water";
        frontier.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      if (lake.size < 5) for (const key of lake) cells[key] = "plain";
    }
    const reached = /* @__PURE__ */ new Set([312]), queue = [312];
    for (let i = 0; i < queue.length; i++) {
      const x = queue[i] % 25, y = Math.floor(queue[i] / 25);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, key = ny * 25 + nx;
        if (inside(nx, ny, s) && cells[key] !== "water" && !reached.has(key)) {
          reached.add(key);
          queue.push(key);
        }
      }
    }
    for (let key = 0; key < 625; key++) if (!reached.has(key)) cells[key] = "water";
    const dry = (x, y) => inside(x, y, s) && dist8(x, y, 12, 12) > 2 && cells[y * 25 + x] === "plain" && NEIGHBORS8.every(([dx, dy]) => !inside(x + dx, y + dy, s) || cells[(y + dy) * 25 + x + dx] !== "water");
    const anchors = [];
    for (const type of ["forest", "mountain"]) {
      const candidates = [];
      for (let y2 = 9; y2 <= 15; y2++) for (let x2 = 9; x2 <= 15; x2++) if (dry(x2, y2)) candidates.push([x2, y2]);
      const [x, y] = candidates[pick(candidates.length)];
      cells[y * 25 + x] = type;
      anchors.push({ type, x, y });
    }
    for (const type of ["forest", "mountain"]) {
      const anchor = anchors.find((a) => a.type === type), patches = [anchor];
      for (let i = 0, n = 2 + pick(3); i < n; i++) patches.push({ x: 2 + pick(21), y: 2 + pick(21) });
      for (const { x: cx, y: cy } of patches) {
        const ax = 1.5 + rand() * 2.5, ay = 1.5 + rand() * 2.5;
        for (let y = Math.max(0, cy - 4); y <= Math.min(24, cy + 4); y++) for (let x = Math.max(0, cx - 4); x <= Math.min(24, cx + 4); x++) {
          if (dry(x, y) && ((x - cx) / ax) ** 2 + ((y - cy) / ay) ** 2 < 0.7 + rand() * 0.6) cells[y * 25 + x] = type;
        }
      }
    }
    terrainCache.set(s, { seed: s.mapSeed, size: 25, generation: s.mapGeneration, cells });
    return cells;
  }
  const estateCache = /* @__PURE__ */ new WeakMap();
  function estate(s) {
    if ((s == null ? void 0 : s.estateSeed) === void 0) return null;
    const cached = estateCache.get(s);
    if ((cached == null ? void 0 : cached.seed) === s.estateSeed && cached.mapSeed === s.mapSeed && cached.generation === s.mapGeneration) return cached.value;
    generatedTerrain(s);
    let seed = s.estateSeed >>> 0;
    const rand = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const size = worldSize(s), center = worldCenter(s), cells = /* @__PURE__ */ new Set(), walls = /* @__PURE__ */ new Set(), roads = /* @__PURE__ */ new Set(), rows = [];
    let top = 6, bottom = 18;
    if (s.mapGeneration === 2) {
      top = 6 + Math.floor(rand() * 3);
      bottom = 16 + Math.floor(rand() * 3);
      const west = 6 + Math.floor(rand() * 3), east = 16 + Math.floor(rand() * 3);
      const shape = Math.floor(rand() * 3), corners = Array.from({ length: 4 }, () => Math.floor(rand() * 4));
      for (let y = top; y <= bottom; y++) {
        const upper = y <= 12, t = Math.abs(y - 12) / (upper ? 12 - top : bottom - 12);
        const profile = shape === 0 ? t : shape === 1 ? t * t : Math.max(0, t - 0.5) * 2;
        rows[y] = [Math.min(9, west + Math.floor(profile * corners[upper ? 0 : 2])), Math.max(15, east - Math.floor(profile * corners[upper ? 1 : 3]))];
      }
    } else {
      let left = 10, right = 14;
      for (let y = 6; y <= 12; y++) {
        left = Math.min(left, 6 + Math.floor((12 - y) / 2) + Math.floor(rand() * 2));
        right = Math.max(right, 18 - Math.floor((12 - y) / 2) - Math.floor(rand() * 2));
        rows[y] = [left, right];
      }
      for (let y = 13; y <= 18; y++) {
        left = Math.max(left, 6 + Math.floor((y - 12) / 2) + Math.floor(rand() * 2));
        right = Math.min(right, 18 - Math.floor((y - 12) / 2) - Math.floor(rand() * 2));
        rows[y] = [left, right];
      }
    }
    for (let y = top; y <= bottom; y++) for (let x = rows[y][0]; x <= rows[y][1]; x++) cells.add(y * size + x);
    for (const key of cells) for (const [dx, dy] of NEIGHBORS8) {
      const next = key + dy * size + dx;
      if (!cells.has(next)) walls.add(next);
    }
    const gates = [
      { x: center, y: top - 1, direction: 0 },
      { x: rows[12][1] + 1, y: center, direction: 1 },
      { x: center, y: bottom + 1, direction: 2 },
      { x: rows[12][0] - 1, y: center, direction: 3 }
    ];
    for (const g of gates) walls.delete(g.y * size + g.x);
    const root = center * size + center, parents = /* @__PURE__ */ new Map([[root, null]]), queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i];
      for (const offset of [-size, 1, size, -1]) {
        const next = key + offset;
        if (cells.has(next) && !parents.has(next)) {
          parents.set(next, key);
          queue.push(next);
        }
      }
    }
    const connect = (key) => {
      var _a;
      while (key !== null) {
        roads.add(key);
        key = (_a = parents.get(key)) != null ? _a : null;
      }
    };
    for (const [i, g] of gates.entries()) {
      const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][i];
      connect((g.y - dy) * size + g.x - dx);
      for (let x = g.x, y = g.y; inside(x, y, s); x += dx, y += dy) roads.add(y * size + x);
    }
    const value = { cells, walls, gates, roads };
    estateCache.set(s, { seed: s.estateSeed, mapSeed: s.mapSeed, generation: s.mapGeneration, value });
    return value;
  }
  const EDGE_CROP = 3;
  function layoutDimensions(mode, count) {
    return mode === "coop" ? [count === 2 ? 50 : 75, count === 6 ? 90 : 40] : [[0, 0], [50, 25], [75, 25], [75, 50], [75, 75]][count];
  }
  function dimensions(mode, count) {
    const [width, height] = layoutDimensions(mode, count);
    return [width - EDGE_CROP * 2, height - EDGE_CROP * 2];
  }
  function create(mapSeed, mode, count, rotation) {
    const [width, height] = layoutDimensions(mode, count), turned = rotation % 2;
    const outWidth = turned ? height : width, outHeight = turned ? width : height;
    const rotate = (x, y) => rotation === 0 ? [x, y] : rotation === 1 ? [height - 1 - y, x] : rotation === 2 ? [width - 1 - x, height - 1 - y] : [y, width - 1 - x];
    const index = (x, y) => {
      const [rx, ry] = rotate(x, y);
      return ry * outWidth + rx;
    };
    const slots = [];
    const single = (owner, x, y, gates) => slots.push({ owners: [owner], x, y, gates: [gates] });
    const pair = (owners2, x, y, gates) => slots.push({ owners: owners2, x, y, gates });
    if (mode === "single") {
      if (count === 1) {
        single(0, 0, 0, [1]);
        single(1, 25, 0, [3]);
      }
      if (count === 2) {
        single(0, 25, 0, [1, 3]);
        single(1, 0, 0, [1]);
        single(2, 50, 0, [3]);
      }
      if (count >= 3) {
        single(0, 25, 25, count === 3 ? [0, 1, 3] : [0, 1, 2, 3]);
        single(1, 25, 0, [2]);
        single(2, 0, 25, [1]);
        single(3, 50, 25, [3]);
        if (count === 4) single(4, 25, 50, [0]);
      }
    } else {
      const y = count === 6 ? 25 : 0;
      pair([0, 1], count === 2 ? 0 : 25, y, count === 2 ? [[1], [1]] : count === 4 ? [[1, 3], [1, 3]] : [[0, 1, 3], [1, 2, 3]]);
      pair([2, 3], count === 2 ? 25 : 0, y, count === 2 ? [[3], [3]] : [[1], [1]]);
      if (count >= 4) pair([4, 5], 50, y, [[3], [3]]);
      if (count === 6) {
        single(6, 25, 0, [2]);
        single(7, 25, 65, [0]);
      }
    }
    const terrain = Array(outWidth * outHeight).fill("plain"), estates = [];
    for (const slot of slots) {
      const seed = Math.imul(mapSeed ^ slot.owners[0] + 1, 2246822519) + 3266489917 >>> 0;
      const source = createTemplate(seed), isPair = slot.owners.length === 2;
      const template = isPair ? coopMap(__spreadProps(__spreadValues({}, source), { worldSize: 25, worldHeight: 40, coopLayout: "vertical" })) : { land: { estates: [estate(source)] }, terrain: generatedTerrain(source) };
      const convert = (k) => index(k % 25 + slot.x, Math.floor(k / 25) + slot.y);
      for (let y = 0; y < (isPair ? 40 : 25); y++) for (let x = 0; x < 25; x++) terrain[index(x + slot.x, y + slot.y)] = template.terrain[y * 25 + x];
      template.land.estates.forEach((land2, i) => {
        const owner = slot.owners[i], masks = slot.gates[i];
        const walls = new Set([...land2.walls, ...land2.gates.filter((g) => !masks.includes(g.direction)).map((g) => g.y * 25 + g.x)].map(convert));
        const gates = land2.gates.filter((g) => masks.includes(g.direction)).map((g) => {
          const [x, y] = rotate(g.x + slot.x, g.y + slot.y);
          return { x, y, owner, direction: (g.direction + rotation) % 4 };
        });
        const originalCenter = land2.center || { x: 12, y: 12 }, [cx, cy] = rotate(originalCenter.x + slot.x, originalCenter.y + slot.y);
        estates[owner] = { owner, cells: new Set([...land2.cells].map(convert)), walls, gates, roads: new Set([...land2.roads].map(convert)), center: { x: cx, y: cy } };
      });
    }
    const merge = (prop) => new Set(estates.flatMap((e) => [...e[prop]]));
    const land = { estates, cells: merge("cells"), walls: merge("walls"), roads: merge("roads"), gates: estates.flatMap((e) => e.gates) };
    land.sharedWall = /* @__PURE__ */ new Set();
    const seen = /* @__PURE__ */ new Set();
    for (const e of estates) for (const k of e.walls) {
      if (seen.has(k)) land.sharedWall.add(k);
      seen.add(k);
    }
    const exterior = (k) => k >= 0 && k < terrain.length && !land.cells.has(k) && !land.walls.has(k);
    const approaches = land.gates.map((g) => {
      const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][g.direction];
      return (g.y + dy) * outWidth + g.x + dx;
    });
    const root = approaches[0], parents = new Int32Array(terrain.length).fill(-1), queue = [root];
    parents[root] = root;
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i], x = k % outWidth, y = Math.floor(k / outWidth);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, n = ny * outWidth + nx;
        if (nx >= 0 && ny >= 0 && nx < outWidth && ny < outHeight && exterior(n) && parents[n] === -1) {
          parents[n] = k;
          queue.push(n);
        }
      }
    }
    for (const k of approaches) {
      if (parents[k] === -1) throw new Error("Unreachable estate approach");
      let next = k;
      while (next !== root) {
        land.roads.add(next);
        next = parents[next];
      }
      land.roads.add(root);
    }
    for (const g of land.gates) land.roads.add(g.y * outWidth + g.x);
    const owners = new Int16Array(terrain.length).fill(-1);
    for (const e of estates) for (const k of [...e.cells, ...e.gates.map((g) => g.y * outWidth + g.x)]) owners[k] = e.owner;
    const walk = new Uint8Array(terrain.length);
    for (let k = 0; k < terrain.length; k++) walk[k] = !land.walls.has(k) && (terrain[k] !== "water" || land.roads.has(k)) ? 1 : 0;
    const croppedWidth = outWidth - EDGE_CROP * 2, croppedHeight = outHeight - EDGE_CROP * 2;
    const cropKey = (k) => {
      const x = k % outWidth, y = Math.floor(k / outWidth);
      return x >= EDGE_CROP && y >= EDGE_CROP && x < outWidth - EDGE_CROP && y < outHeight - EDGE_CROP ? (y - EDGE_CROP) * croppedWidth + x - EDGE_CROP : null;
    };
    const cropSet = (set) => new Set([...set].map(cropKey).filter((k) => k !== null));
    const croppedEstates = estates.map((e) => ({ owner: e.owner, cells: cropSet(e.cells), walls: cropSet(e.walls), roads: cropSet(e.roads), gates: e.gates.map((g) => __spreadProps(__spreadValues({}, g), { x: g.x - EDGE_CROP, y: g.y - EDGE_CROP })), center: { x: e.center.x - EDGE_CROP, y: e.center.y - EDGE_CROP } }));
    const croppedLand = { estates: croppedEstates, cells: /* @__PURE__ */ new Set(), walls: /* @__PURE__ */ new Set(), roads: /* @__PURE__ */ new Set(), gates: croppedEstates.flatMap((e) => e.gates), sharedWall: cropSet(land.sharedWall) };
    for (const e of croppedEstates) for (const prop of ["cells", "walls", "roads"]) for (const k of e[prop]) croppedLand[prop].add(k);
    for (const k of cropSet(land.roads)) croppedLand.roads.add(k);
    const croppedTerrain = Array(croppedWidth * croppedHeight), croppedOwners = new Int16Array(croppedTerrain.length), croppedWalk = new Uint8Array(croppedTerrain.length);
    croppedOwners.fill(-1);
    for (let y = 0; y < croppedHeight; y++) for (let x = 0; x < croppedWidth; x++) {
      const next = y * croppedWidth + x, old = (y + EDGE_CROP) * outWidth + x + EDGE_CROP;
      croppedTerrain[next] = terrain[old];
      croppedOwners[next] = owners[old];
      croppedWalk[next] = walk[old];
    }
    return { terrain: croppedTerrain, land: croppedLand, owners: croppedOwners, walk: croppedWalk, width: croppedWidth, height: croppedHeight };
  }
  return { create, dimensions, layoutDimensions, EDGE_CROP };
});

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
(function(root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./maps.js") : root.GFMaps);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GF = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(Maps) {
  "use strict";
  const SIZE = 25, CENTER = 12, MAX_LEVEL = 9, SHRINE_MAX_LEVEL = 15, GATE_MAX_LEVEL = 15;
  const worldSize = (s) => {
    var _a;
    return (_a = s == null ? void 0 : s.worldSize) != null ? _a : s ? 25 : 17;
  };
  const worldWidth = worldSize;
  const worldHeight = (s) => {
    var _a;
    return (_a = s == null ? void 0 : s.worldHeight) != null ? _a : worldWidth(s);
  };
  const worldCenter = (s) => Math.floor(worldSize(s) / 2);
  const worldCenterY = (s) => Math.floor(worldHeight(s) / 2);
  const GROWTH = 2, HP_GROWTH = 1.55, UPGRADE_GROWTH = 5, MATERIAL_COST_FACTOR = 1.3;
  const SOLDIER_HP_GROWTH = 2;
  const ECONOMY_UPGRADE_WAIT = 7.5, ECONOMY_UPGRADE_GROWTH = 5;
  const SHRINE_REQUIREMENTS = [0, 1, 2, 3, 5, 7, 9, 11, 13, 15];
  const TERRAIN = { plain: "平地", shore: "水岸", water: "水域", forest: "林地", mountain: "山地" };
  const DEFS = {};
  function balancedCost(cost) {
    return { coins: cost.coins, materials: Math.ceil(cost.materials * MATERIAL_COST_FACTOR) };
  }
  function def(id, name2, cat, cost, hp, extra = {}) {
    if (extra.upgradeBase) extra = __spreadProps(__spreadValues({}, extra), { upgradeBase: balancedCost(extra.upgradeBase) });
    DEFS[id] = __spreadValues({ id, name: name2, cat, cost: balancedCost(cost), hp }, extra);
  }
  const chains = [
    ["tea", "inn", "bank", "茶肆", "客栈", "钱庄", "plain", "商", "#d6a450"],
    ["farm", "mill", "wine", "农田", "磨坊", "酒坊", "shore", "农", "#89a663"],
    ["mulberry", "weaver", "tailor", "桑园", "织坊", "成衣铺", "forest", "丝", "#b38ba7"],
    ["quarry", "kiln", "trade", "石场", "瓷窑", "商号", "mountain", "工", "#7b9fa2"]
  ];
  const COIN_CHAIN_COSTS = [{ coins: 0, materials: 50 }, { coins: 90, materials: 160 }, { coins: 430, materials: 750 }];
  const MATERIAL_CHAIN_COSTS = [{ coins: 75, materials: 0 }, { coins: 190, materials: 50 }, { coins: 920, materials: 300 }];
  chains.forEach((a, ci) => {
    for (let i = 0; i < 3; i++) {
      const coinChain = ci === 0 || ci === 2, baseCost = (coinChain ? COIN_CHAIN_COSTS : MATERIAL_CHAIN_COSTS)[i], high = ci === 0 || ci === 3;
      const costFactor = (high ? 1.5 : 1) * (i === 2 ? 2 : 1);
      def(a[i], a[i + 3], "economy", { coins: Math.ceil(baseCost.coins * costFactor), materials: Math.ceil(baseCost.materials * costFactor) }, [180, 250, 340][i], __spreadProps(__spreadValues({
        income: (high ? [2, 8, 48] : [1, 5, 30])[i],
        resource: coinChain ? "coins" : "materials",
        terrain: i === 0 ? a[6] : null,
        prev: i ? a[i - 1] : null,
        upgradeWeight: i === 0 ? high ? 7 / 6 : 11 / 15 : 1
      }, i === 0 && (ci === 1 || ci === 2) ? { buildCostScale: [0.1, 1.2] } : {}), {
        chain: a[7],
        color: a[8],
        end: i === 2,
        tier: i,
        radius: 1,
        limit: i === 0 ? [4, 6, 6, 4][ci] : i === 1 ? 2 : 1,
        names: [a[i + 3], i === 0 ? ["清茗茶肆", "临水良田", "葱郁桑园", "青石矿场"][ci] : "兴旺" + a[i + 3], "鼎盛" + a[i + 3]]
      }));
    }
  });
  def("guild", "汇财会馆", "economy", { coins: 18e3, materials: 24e3 }, 600, { income: 240, resource: "coins", aura: 0.05, auraResource: "coins", required: ["bank", "tailor"], radius: 1, limit: 1 });
  def("port", "百工院", "economy", { coins: 24e3, materials: 15e3 }, 900, { income: 300, resource: "materials", aura: 0.1, auraResource: "materials", required: ["wine", "trade"], radius: 1, limit: 1 });
  def("tower", "箭塔", "defense", { coins: 95, materials: 70 }, 300, { damage: 22, range: 4, interval: 0.85, desc: "单体远射 · 射程 4 格" });
  def("rock", "擂石台", "defense", { coins: 260, materials: 190 }, 380, { damage: 64, range: 3.8, interval: 2, splash: 1.5, fortuneOnly: true, desc: "范围轰击 · 仅可由造化匣获得" });
  def("barracks", "兵营", "defense", { coins: 240, materials: 180 }, 420, { damage: 18, range: 4.5, interval: 0.8, buildCostScale: [0.5, 2], buildCostSteps: 7, desc: "持续出兵 · 一级 5s/1兵" });
  def("well", "水井", "support", { coins: 100, materials: 60 }, 250, { farmAura: 0.2, fortuneOnly: true, desc: "全庄农田收入 +20% · 仅可由造化匣获得" });
  def("stage", "戏台", "support", { coins: 300, materials: 220 }, 280, { aura: 0.03, fortuneOnly: true, desc: "全镇收入 +3%" });
  def("shrine", "祠堂", "temple", { coins: 0, materials: 0 }, 1800, { income: 1, resource: "coins", desc: "古坊之根 · 决定全坊升级上限", unique: true, upgradeBase: { coins: 120, materials: 90 }, upgradeGrowth: 5, names: ["古坊祠堂", "百福祠堂", "万安宗祠"] });
  def("earth", "土地庙", "temple", { coins: 180, materials: 130 }, 260, { guard: 0.2, range: 3, fortuneOnly: true, desc: "三格内建筑受到伤害 -20% · 仅可由造化匣获得" });
  def("zhong", "钟馗像", "temple", { coins: 360, materials: 260 }, 430, { slow: 0.4, pulseInterval: 12, slowDuration: 4, fortuneOnly: true, desc: "每 12 秒全场减速 4 秒 · 仅可由造化匣获得" });
  def("tao", "道观", "temple", { coins: 600, materials: 440 }, 380, { powerAura: 0.15, fortuneOnly: true, desc: "全镇防御建筑攻击 +15% · 仅可由造化匣获得" });
  def("fortune", "造化匣", "mystery", { coins: 90, materials: 60 }, 1, { limit: 10, desc: "变化为随机建筑" });
  def("gate", "庄园城门", "defense", { coins: 95, materials: 120 }, 700, { fixed: true, upgradeBase: { coins: 150, materials: 120 }, upgradeGrowth: 5, desc: "庄园出入口 · 升级提高全庄建筑自动修复速度" });
  const SKILLS = { repel: { name: "驱鬼符", cooldown: 18 }, repair: { name: "回春诀", cooldown: 24 }, thunder: { name: "九霄天雷", cooldown: 120 } };
  const MISSIONS = [
    { title: "一盏茶，起一座坊", desc: "在平地建造一间茶肆", reward: 60, test: (s) => s.buildings.some((b) => b.type === "tea") },
    { title: "客来茶香，产业相连", desc: "紧挨茶肆建造客栈", reward: 90, test: (s) => s.buildings.some((b) => b.type === "inn") },
    { title: "立箭塔，护一方安宁", desc: "建造两座箭塔，保卫庄园", reward: 100, test: (s) => s.buildings.filter((b) => b.type === "tower").length >= 2 },
    { title: "造化初开", desc: "开启一次造化匣", reward: 75, test: (s) => s.fortuneBuilt >= 1 },
    { title: "百业初兴", desc: "建成任意两种经济链终点建筑", reward: 200, test: (s) => new Set(s.buildings.filter((b) => DEFS[b.type].end).map((b) => b.type)).size >= 2 },
    { title: "四方会聚", desc: "建成一座汇财会馆", reward: 300, test: (s) => s.buildings.some((b) => b.type === "guild") }
  ];
  const VERSION = 11, UNIT_CAP = 120, SOLDIER_SPEED = 0.8;
  const TROOPS = Object.freeze({
    infantry: Object.freeze({ name: "步兵", hp: 44, damage: 18, range: 0.75, interval: 1 }),
    archer: Object.freeze({ name: "弓兵", hp: 44 * 0.7, damage: 10, range: 3, interval: 1.5 })
  });
  const troopType = (entity) => (entity == null ? void 0 : entity.troopType) || "infantry";
  const troopDef = (entity) => TROOPS[troopType(entity)] || TROOPS.infantry;
  const soldierBaseDamage = (entity) => troopDef(entity).damage * factor(entity);
  const DIFFICULTIES = Object.freeze({
    beginner: Object.freeze({ id: "beginner", name: "入门", economy: 1, soldier: 1 }),
    hard: Object.freeze({ id: "hard", name: "困难", economy: 1.2, soldier: 1.1 }),
    extreme: Object.freeze({ id: "extreme", name: "极难", economy: 1.5, soldier: 1.25 }),
    hell: Object.freeze({ id: "hell", name: "地狱", economy: 2, soldier: 1.5 })
  });
  const world = (s) => s._world || s;
  const inside = (x, y, s) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < worldWidth(s) && y < worldHeight(s);
  const dist8 = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const NEIGHBORS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const mapCache = /* @__PURE__ */ new WeakMap(), viewCache = /* @__PURE__ */ new WeakMap(), indexCache = /* @__PURE__ */ new WeakMap();
  function map(s) {
    const w = world(s);
    let value = mapCache.get(w);
    if (!value) {
      value = Maps.create(w.mapSeed, w.mode, w.enemyCount, w.rotation);
      mapCache.set(w, value);
    }
    return value;
  }
  function buildingIndex(s) {
    const w = world(s);
    let index = indexCache.get(w);
    if (!index || index.revision !== w.revision || index.list !== w.buildings) {
      index = { revision: w.revision, list: w.buildings, tiles: /* @__PURE__ */ new Map(), ids: /* @__PURE__ */ new Map(), owners: w.players.map(() => []) };
      for (const b of w.buildings) {
        index.tiles.set(b.y * w.worldSize + b.x, b);
        index.ids.set(b.id, b);
        index.owners[b.owner].push(b);
      }
      indexCache.set(w, index);
    }
    return index;
  }
  const personalKeys = ["coins", "materials", "fortuneBuilt", "gateLevel", "cooldowns", "selectedSkill", "mission", "eliminated", "controller", "team", "ai", "recruitCursor", "kills"];
  function playerView(s, owner = 0) {
    const w = world(s);
    if (!w.players[owner]) throw new Error("Unknown estate");
    let views = viewCache.get(w);
    if (!views) {
      views = [];
      viewCache.set(w, views);
    }
    if (views[owner]) return views[owner];
    const view = { actorId: owner };
    Object.defineProperty(view, "_world", { value: w });
    const keys = /* @__PURE__ */ new Set([...Object.keys(w), ...personalKeys, "enemies"]);
    for (const key of keys) Object.defineProperty(view, key, {
      enumerable: true,
      get() {
        if (key === "buildings") return buildingIndex(w).owners[owner];
        if (key === "enemies") return hostileUnits(view);
        return personalKeys.includes(key) ? w.players[owner][key] : w[key];
      },
      set(value) {
        if (key === "buildings") {
          w.buildings = [...w.buildings.filter((b) => b.owner !== owner), ...value];
          w.revision++;
        } else if (personalKeys.includes(key)) w.players[owner][key] = value;
        else w[key] = value;
      }
    });
    return views[owner] = view;
  }
  const economicView = (s) => s.actorId === void 0 ? playerView(s) : s;
  const hostile = (s, a, b) => {
    var _a, _b;
    return ((_a = world(s).players[a]) == null ? void 0 : _a.team) !== ((_b = world(s).players[b]) == null ? void 0 : _b.team);
  };
  const hostileUnits = (s) => {
    const p = economicView(s);
    return world(s).soldiers.filter((u) => u.hp > 0 && hostile(s, p.actorId, u.owner));
  };
  function estate(s) {
    const land = map(s).land;
    return s.actorId === void 0 ? land : land.estates[s.actorId];
  }
  function owns(s, x, y) {
    if (!inside(x, y, s)) return false;
    const m = map(s), k = y * worldWidth(s) + x;
    if (s.actorId === void 0) return m.owners[k] >= 0 || m.land.walls.has(k);
    return !s.eliminated && (m.owners[k] === s.actorId || m.land.estates[s.actorId].walls.has(k));
  }
  const ownerAt = (s, x, y) => inside(x, y, s) ? map(s).owners[y * worldWidth(s) + x] : -1;
  const isWall = (s, x, y) => inside(x, y, s) && map(s).land.walls.has(y * worldWidth(s) + x);
  const walkable = (s, x, y) => inside(x, y, s) && !!map(s).walk[y * worldWidth(s) + x];
  function terrain(x, y, s) {
    if (!inside(x, y, s)) return "plain";
    const cells = map(s).terrain, base = cells[y * worldWidth(s) + x];
    return base === "plain" && NEIGHBORS8.some(([dx, dy]) => inside(x + dx, y + dy, s) && cells[(y + dy) * worldWidth(s) + x + dx] === "water") ? "shore" : base;
  }
  function createMatch({ mode = "single", enemyCount = mode === "coop" ? 2 : 1, difficulty = "beginner", mapSeed = Math.floor(Math.random() * 4294967296), rotation } = {}) {
    if (!["single", "coop"].includes(mode) || !(mode === "coop" ? [2, 4, 6] : [1, 2, 3, 4]).includes(enemyCount)) throw new Error("Invalid match configuration");
    if (!Object.prototype.hasOwnProperty.call(DIFFICULTIES, difficulty)) throw new Error("Invalid difficulty");
    if (!Number.isInteger(mapSeed) || mapSeed < 0 || mapSeed > 4294967295) throw new Error("Invalid map seed");
    rotation != null ? rotation : rotation = mapSeed % 4;
    if (![0, 1, 2, 3].includes(rotation)) throw new Error("Invalid rotation");
    const [width, height] = Maps.dimensions(mode, enemyCount), blue = mode === "coop" ? 2 : 1;
    const s = {
      version: VERSION,
      mode,
      enemyCount,
      difficulty,
      mapSeed,
      rotation,
      mapGeneration: 3,
      worldSize: rotation % 2 ? height : width,
      worldHeight: rotation % 2 ? width : height,
      seed: mapSeed,
      nextId: 1,
      elapsed: 0,
      time: 0,
      day: 1,
      phase: "day",
      revision: 0,
      over: false,
      result: null,
      kills: 0,
      players: [],
      buildings: [],
      soldiers: [],
      projectiles: [],
      effects: [],
      events: []
    };
    for (let id = 0; id < blue + enemyCount; id++) s.players.push({
      id,
      team: id < blue ? 0 : 1,
      controller: id === 0 ? "human" : "computer",
      eliminated: false,
      coins: 0,
      materials: 0,
      fortuneBuilt: 0,
      gateLevel: 1,
      cooldowns: { repel: 0, repair: 0, thunder: 0 },
      selectedSkill: id === 0 ? null : "thunder",
      mission: 0,
      kills: 0,
      recruitCursor: 0,
      ai: { clock: 0, armyTurn: true, activeSeconds: 0, decisions: 0, builds: 0, upgrades: 0, casts: 0, lastAction: "准备经营" }
    });
    for (const e of map(s).land.estates) {
      addBuilding(s, "shrine", e.center.x, e.center.y, 1, { owner: e.owner });
      for (const g of e.gates) addBuilding(s, "gate", g.x, g.y, 1, { owner: e.owner, direction: g.direction });
    }
    return s;
  }
  const createState = (mapSeed) => createMatch({ mapSeed });
  const createCoopState = (mapSeed) => createMatch({ mode: "coop", mapSeed });
  const at = (s, x, y) => {
    if (!inside(x, y, s)) return void 0;
    const b = buildingIndex(s).tiles.get(y * worldWidth(s) + x);
    return b && (s.actorId === void 0 || b.owner === s.actorId) ? b : void 0;
  };
  const adjacent = (s, x, y) => NEIGHBORS8.map(([dx, dy]) => at(s, x + dx, y + dy)).filter(Boolean);
  const dryFarm = () => false;
  const isPrereq = (d, nd) => {
    var _a;
    return d.chain ? nd.id === d.prev : !!((_a = d.required) == null ? void 0 : _a.includes(nd.id));
  };
  const RETIRED_TYPES = /* @__PURE__ */ new Set(["home", "market", "fence"]);
  const factor = (b) => Math.pow(GROWTH, b.level - 1);
  const incomeFactor = (b) => b.type === "shrine" ? Math.pow(2, Math.min(6, b.level - 1)) * Math.pow(1.5, Math.max(0, b.level - 7)) : Math.pow(GROWTH, b.level - 1);
  const auraFactor = (b) => Math.pow(2, Math.min(2, b.level - 1)) * (1 + 0.2 * Math.max(0, b.level - 3));
  const hpFactor = (b) => Math.pow(HP_GROWTH, b.level - 1);
  const maxLevel = (b) => (b == null ? void 0 : b.type) === "shrine" ? SHRINE_MAX_LEVEL : (b == null ? void 0 : b.type) === "gate" ? GATE_MAX_LEVEL : MAX_LEVEL;
  const shrineLevel = (s) => {
    var _a;
    return ((_a = economicView(s).buildings.find((b) => b.type === "shrine")) == null ? void 0 : _a.level) || 0;
  };
  const requiredShrineLevel = (level) => SHRINE_REQUIREMENTS[Math.min(MAX_LEVEL, Math.max(1, level))];
  const unlockedBuildingLevel = (s) => {
    const level = shrineLevel(s);
    let unlocked = 1;
    for (let target = 2; target <= MAX_LEVEL; target++) if (level >= requiredShrineLevel(target)) unlocked = target;
    return unlocked;
  };
  const maxHP = (b) => Math.round(DEFS[b.type].hp * hpFactor(b));
  const soldierTrainingTime = (level) => 5 - 4 * (Math.max(1, Math.min(SHRINE_MAX_LEVEL, level)) - 1) / (SHRINE_MAX_LEVEL - 1);
  const soldierRate = (s) => 1 / soldierTrainingTime(shrineLevel(s));
  function difficultyModifiers(s) {
    const p = economicView(s), d = DIFFICULTIES[world(s).difficulty] || DIFFICULTIES.beginner;
    return p.team === 1 && p.controller === "computer" ? d : DIFFICULTIES.beginner;
  }
  const difficultyEconomy = (s) => difficultyModifiers(s).economy;
  const difficultySoldier = (s) => difficultyModifiers(s).soldier;
  const soldierBoost = () => 1;
  function soldierHP(s, b) {
    if (b === void 0) {
      b = s;
      return Math.round(troopDef(b).hp * Math.pow(SOLDIER_HP_GROWTH, b.level - 1));
    }
    return Math.round(troopDef(b).hp * Math.pow(SOLDIER_HP_GROWTH, b.level - 1) * difficultySoldier(s));
  }
  const soldierDamage = (s, b) => soldierBaseDamage(b) * defenseBoost(s) * difficultySoldier(s);
  const soldierPower = (s, b) => Math.round(Math.sqrt(soldierHP(s, b) * soldierDamage(s, b)));
  function syncSoldierHealth(s) {
    var _a, _b;
    const index = buildingIndex(s);
    for (const u of s.soldiers) {
      u.troopType = troopType(u);
      (_a = u.attackAt) != null ? _a : u.attackAt = 0;
      (_b = u.targetBuildingId) != null ? _b : u.targetBuildingId = null;
      const barracks = index.ids.get(u.barracksId);
      if ((barracks == null ? void 0 : barracks.type) === "barracks" && troopType(barracks) === u.troopType) u.level = barracks.level;
      const nextMax = soldierHP(playerView(s, u.owner), u);
      if (u.maxHp !== nextMax) {
        u.hp = Math.min(nextMax, nextMax * u.hp / u.maxHp);
        u.maxHp = nextMax;
      }
      u.baseDamage = soldierBaseDamage(u);
    }
  }
  const visualLevel = (level) => Math.min(3, Math.floor((level - 1) / 3) + 1);
  const name = (b) => {
    var _a;
    return b.type === "barracks" ? b.level < 2 ? "兵营" : troopDef(b).name + "营" : ((_a = DEFS[b.type].names) == null ? void 0 : _a[visualLevel(b.level) - 1]) || (visualLevel(b.level) === 1 ? DEFS[b.type].name : (visualLevel(b.level) === 2 ? "兴盛" : "鼎盛") + DEFS[b.type].name);
  };
  function addBuilding(s, type, x, y, level = 1, extra = {}) {
    var _a, _b;
    const b = __spreadValues({ id: s.nextId++, type, x, y, level, hp: Math.round(DEFS[type].hp * Math.pow(HP_GROWTH, level - 1)), cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0, production: 0, lastHit: -10 }, extra);
    b.owner = (_b = (_a = extra.owner) != null ? _a : s.actorId) != null ? _b : 0;
    if (type === "barracks") b.troopType = "infantry";
    world(s).buildings.push(b);
    s.revision++;
    return b;
  }
  function grantBuilding(s, type, x, y, level = unlockedBuildingLevel(s), originCost) {
    var _a;
    s = economicView(s);
    if (!DEFS[type] || type === "fortune" || DEFS[type].unique || DEFS[type].fixed || !owns(s, x, y) || isWall(s, x, y) || ((_a = estate(s)) == null ? void 0 : _a.gates.some((g) => g.x === x && g.y === y)) || terrain(x, y, s) === "water" || at(s, x, y)) return null;
    return addBuilding(s, type, x, y, Math.min(level, maxLevel({ type })), originCost ? { originCost } : {});
  }
  function random(s) {
    s.seed = Math.imul(s.seed, 1664525) + 1013904223 >>> 0;
    return s.seed / 4294967296;
  }
  function shortage(s, cost) {
    const missing = [];
    if (s.coins < cost.coins) missing.push(Math.ceil(cost.coins - s.coins) + " 铜钱");
    if (s.materials < cost.materials) missing.push(Math.ceil(cost.materials - s.materials) + " 工材");
    return missing.length ? "差 " + missing.join("、") : "";
  }
  function pay(s, cost) {
    s.coins -= cost.coins;
    s.materials -= cost.materials;
  }
  function buildCost(s, type) {
    var _a;
    s = economicView(s);
    if (type !== "fortune") {
      const d = DEFS[type];
      if (!d) return { coins: 0, materials: 0 };
      let factor2 = 1;
      if (d.buildCostScale) {
        const steps = (_a = d.buildCostSteps) != null ? _a : d.limit - 1, built = s.buildings.filter((b) => b.type === type).length, count = d.buildCostSteps === void 0 ? Math.min(steps, built) : built, [start, end] = d.buildCostScale;
        factor2 = start + (end - start) * count / steps;
      }
      const scaled = (value) => value ? Math.ceil(value * factor2 - 1e-9) : 0;
      return { coins: scaled(d.cost.coins), materials: scaled(d.cost.materials) };
    }
    const multiple = Math.pow(1.55, s.fortuneBuilt || 0);
    return { coins: Math.ceil(DEFS.fortune.cost.coins * multiple), materials: Math.ceil(DEFS.fortune.cost.materials * multiple) };
  }
  function fortuneCandidates(s, x, y) {
    var _a;
    s = economicView(s);
    if (!owns(s, x, y) || isWall(s, x, y) || ((_a = estate(s)) == null ? void 0 : _a.gates.some((g) => g.x === x && g.y === y)) || at(s, x, y) || terrain(x, y, s) === "water") return [];
    const plot = terrain(x, y, s);
    return Object.values(DEFS).filter((d) => {
      if (d.id === "fortune" || d.unique || d.fixed || d.income || d.limit && s.buildings.filter((b) => b.type === d.id).length >= d.limit) return false;
      if (d.cat === "economy" && plot === "forest" && d.id !== "mulberry") return false;
      if (d.cat === "economy" && plot === "mountain" && d.id !== "quarry") return false;
      if (d.id === "farm" && plot !== "shore") return false;
      if (d.id !== "farm" && d.terrain && plot !== d.terrain) return false;
      return true;
    });
  }
  function buildReason(s, type, x, y, ignoreFunds = false, ignoreEnemies = false) {
    var _a;
    s = economicView(s);
    const d = DEFS[type];
    if (!d) return "未知建筑";
    if (s.over || s.eliminated) return "该庄园已出局";
    if (!owns(s, x, y) || isWall(s, x, y)) return "请选择庄园内地块";
    if (at(s, x, y)) return "此地已有建筑";
    if ((_a = estate(s)) == null ? void 0 : _a.gates.some((g) => g.x === x && g.y === y)) return "城门地块不可建造";
    const plot = terrain(x, y, s);
    if (plot === "water") return "水域不可建造";
    if (d.fixed) return "城门仅可由庄园生成";
    if (!ignoreEnemies && hostileUnits(s).some((e) => Math.hypot(e.x - x, e.y - y) < 0.65)) return "敌人正在此地";
    if (d.unique) return "祠堂仅此一座";
    if (d.fortuneOnly) return "仅可由造化匣获得";
    if (type === "fortune") return fortuneCandidates(s, x, y).length ? ignoreFunds ? "" : shortage(s, buildCost(s, type)) : "此地无可造化建筑";
    if (d.limit && s.buildings.filter((b) => b.type === type).length >= d.limit) return "已达上限（" + d.limit + "座）";
    if (d.cat === "economy" && plot === "forest" && type !== "mulberry") return "林地仅可建桑园";
    if (d.cat === "economy" && plot === "mountain" && type !== "quarry") return "山地仅可建石场";
    if (type === "farm") {
      if (plot !== "shore") return "需水岸";
    } else if (d.terrain && plot !== d.terrain) return "需" + TERRAIN[d.terrain];
    if (d.prev && !adjacent(s, x, y).some((b) => b.type === d.prev)) return "需紧挨" + DEFS[d.prev].name;
    if (d.required) {
      const nearby = new Set(adjacent(s, x, y).map((b) => b.type));
      const missing = d.required.filter((id) => !nearby.has(id));
      if (missing.length) return "需紧邻" + missing.map((id) => DEFS[id].name).join("、");
    }
    return ignoreFunds ? "" : shortage(s, buildCost(s, type));
  }
  function buildHints(s, x, y, ignoreEnemies = false) {
    return Object.values(DEFS).filter((d) => d.cat === "economy" && (d.tier >= 1 || d.required) && !buildReason(s, d.id, x, y, true, ignoreEnemies)).map((d) => ({ type: d.id, resource: d.resource, tier: d.required ? 3 : d.tier }));
  }
  function event(s, text, kind = "info") {
    s.events.push({ text, kind });
    if (s.events.length > 30) s.events.shift();
  }
  function missions(s) {
    var _a;
    if (s.actorId === void 0) {
      for (const p of s.players) if (!p.eliminated) missions(playerView(s, p.id));
      return;
    }
    while ((_a = MISSIONS[s.mission]) == null ? void 0 : _a.test(s)) {
      const m = MISSIONS[s.mission++];
      s.coins += m.reward;
      event(s, "坊志达成：" + m.title + " · +" + m.reward + " 铜钱", "reward");
    }
  }
  function build(s, type, x, y) {
    s = economicView(s);
    const reason = buildReason(s, type, x, y);
    if (reason) return { ok: false, reason };
    const cost = buildCost(s, type);
    pay(s, cost);
    if (type === "fortune") {
      const candidates = fortuneCandidates(s, x, y), rolled = candidates[Math.floor(random(s) * candidates.length)], level = unlockedBuildingLevel(s);
      s.fortuneBuilt++;
      const b2 = grantBuilding(s, rolled.id, x, y, level, cost);
      event(s, "造化匣化为" + rolled.name + " Lv" + level, "reward");
      missions(s);
      return { ok: true, building: b2, rolled: rolled.id };
    }
    const b = addBuilding(s, type, x, y, 1, { originCost: cost });
    missions(s);
    return { ok: true, building: b };
  }
  function upgradeCost(b) {
    var _a;
    const d = DEFS[b.type], base = d.upgradeBase || d.cost;
    if (d.cat === "economy" && d.income) {
      const tier = (_a = d.tier) != null ? _a : 3;
      const ownShare = [0, 0.2, 0.3, 0.4][tier], oppositeResource = d.resource === "coins" ? "materials" : "coins";
      const oppositeRate = Object.values(DEFS).filter((n) => {
        var _a2;
        return n.cat === "economy" && n.resource === oppositeResource && ((_a2 = n.tier) != null ? _a2 : 3) <= tier;
      }).reduce((sum, n) => sum + n.income * (n.limit || 1), 0);
      const oppositeBase = Math.ceil(oppositeRate * ECONOMY_UPGRADE_WAIT * (d.upgradeWeight || 1));
      const ownBase = Math.ceil(oppositeBase * ownShare / (1 - ownShare));
      const scale = Math.pow(ECONOMY_UPGRADE_GROWTH, b.level - 1);
      const scaled = (value) => value ? Math.ceil(value * scale - 1e-9) : 0;
      return d.resource === "materials" ? { coins: scaled(oppositeBase), materials: scaled(ownBase) } : { coins: scaled(ownBase), materials: scaled(oppositeBase) };
    }
    const foundation = b.type === "shrine" || b.type === "gate";
    const premium = b.type === "shrine" ? 1.18 : b.type === "gate" ? 1.06 : d.income ? 1.2 : 1.12;
    const multiple = 1.8 * Math.pow(d.upgradeGrowth || UPGRADE_GROWTH, b.level - 1) * Math.pow(premium, Math.max(0, b.level - (foundation ? 7 : 4)));
    return { coins: Math.ceil(base.coins * multiple), materials: Math.ceil(base.materials * multiple) };
  }
  function upgradeReason(s, b, ignoreFunds = false, options = {}) {
    var _a;
    s = economicView(s);
    if (!b || !s.buildings.includes(b)) return "建筑已不存在";
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return "仅可升级庄园内建筑";
    if (s.over || s.eliminated) return "该庄园已出局";
    const branch = options == null ? void 0 : options.troopType;
    if (branch !== void 0 && (!(b.type === "barracks" && b.level === 1) || typeof branch !== "string" || !Object.prototype.hasOwnProperty.call(TROOPS, branch))) return "无效的兵营分支选择";
    const d = DEFS[b.type];
    if (b.level >= maxLevel(b)) return "已达最高等级";
    if (estate(s) && (b.type === "shrine" || b.type === "gate")) {
      const otherType = b.type === "shrine" ? "gate" : "shrine";
      const current = ((_a = s.buildings.find((n) => n.type === otherType)) == null ? void 0 : _a.level) || 0;
      if (b.level + 1 > current + 1) return "需" + (otherType === "gate" ? "城门" : "祠堂") + " Lv" + b.level + "（当前 Lv" + current + "）";
    }
    if (b.type !== "shrine" && b.type !== "gate") {
      const required = requiredShrineLevel(b.level + 1), current = shrineLevel(s);
      if (current < required) return "需祠堂 Lv" + required + "（当前 Lv" + current + "）";
    }
    if (d.prev && !adjacent(s, b.x, b.y).some((n) => n.type === d.prev && n.level >= b.level + 1)) return "需邻" + DEFS[d.prev].name + " Lv" + (b.level + 1);
    if (d.required) {
      for (const id of d.required) if (!adjacent(s, b.x, b.y).some((n) => n.type === id && n.level >= b.level + 1)) return "需邻" + DEFS[id].name + " Lv" + (b.level + 1);
    }
    if (b.type === "barracks" && b.level === 1 && branch === void 0) return "请选择步兵营或弓兵营";
    return ignoreFunds ? "" : shortage(s, upgradeCost(b));
  }
  function upgradeOptions(s, b) {
    s = economicView(s);
    const result = { levels: 0, cost: { coins: 0, materials: 0 } };
    if (!b || !s.buildings.includes(b)) return result;
    if (b.type === "shrine" || b.type === "gate") {
      if (!upgradeReason(s, b, true)) {
        result.levels = 1;
        result.cost = upgradeCost(b);
      }
      return result;
    }
    const mapping = new Map(s.buildings.map((n) => [n, __spreadValues({}, n)]));
    const shadow = __spreadProps(__spreadValues({}, s), { buildings: [...mapping.values()] }), target = mapping.get(b);
    while (!upgradeReason(shadow, target, true)) {
      const cost = upgradeCost(target), level = target.level + 1;
      result.levels++;
      result.cost.coins += cost.coins;
      result.cost.materials += cost.materials;
      for (const n of target.type === "gate" ? shadow.buildings.filter((n2) => n2.type === "gate") : [target]) n.level = level;
      if (target.type === "gate") shadow.gateLevel = level;
    }
    return result;
  }
  function bulkUpgrade(s, b) {
    s = economicView(s);
    if ((b == null ? void 0 : b.type) === "shrine" || (b == null ? void 0 : b.type) === "gate") return { ok: false, levels: 0, reason: "仅可单级升级", costspent: { coins: 0, materials: 0 } };
    const options = upgradeOptions(s, b), cost = { coins: 0, materials: 0 };
    let levels = 0, reason = "";
    if (!options.levels) reason = upgradeReason(s, b);
    for (let i = 0; i < options.levels; i++) {
      const nextCost = upgradeCost(b), result = upgrade(s, b);
      if (!result.ok) {
        reason = result.reason;
        break;
      }
      levels++;
      cost.coins += nextCost.coins;
      cost.materials += nextCost.materials;
    }
    return { ok: levels > 0, levels, reason, costspent: cost };
  }
  function upgrade(s, b, options = {}) {
    s = economicView(s);
    const reason = upgradeReason(s, b, false, options);
    if (reason) return { ok: false, reason };
    if (b.type === "barracks") syncSoldierHealth(world(s));
    pay(s, upgradeCost(b));
    const targets = b.type === "gate" ? s.buildings.filter((n) => n.type === "gate") : [b];
    const level = b.level + 1;
    for (const target of targets) {
      const ratio = target.hp / maxHP(target);
      target.level = level;
      target.hp = maxHP(target) * ratio;
    }
    if (b.type === "barracks") {
      if (level === 2) b.troopType = options.troopType;
      syncSoldierHealth(world(s));
    }
    if (b.type === "gate") s.gateLevel = level;
    s.revision++;
    missions(s);
    return { ok: true };
  }
  function demolishReason(s, b) {
    s = economicView(s);
    if (!b || !s.buildings.includes(b) || b.type === "shrine") return "祠堂不可拆除";
    if (b.type === "gate") return "城门不可拆除";
    if (!owns(s, b.x, b.y) || isWall(s, b.x, b.y)) return "仅可拆除庄园内建筑";
    if (s.over || s.eliminated) return "该庄园已出局";
    return "";
  }
  function demolish(s, b) {
    s = economicView(s);
    const reason = demolishReason(s, b);
    if (reason) return { ok: false, reason };
    const cost = b.originCost || buildCost(s, b.type), refund = { coins: Math.floor(cost.coins * 0.4), materials: Math.floor(cost.materials * 0.4) };
    s.coins += refund.coins;
    s.materials += refund.materials;
    s.buildings = s.buildings.filter((n) => n !== b);
    s.revision++;
    return { ok: true, refund, dryFarms: 0 };
  }
  function income(s, b, buildings) {
    var _a;
    if (s.actorId === void 0 && s.players) s = playerView(s, (_a = b.owner) != null ? _a : 0);
    const d = DEFS[b.type];
    if (!d.income) return 0;
    let bonus = 0;
    for (const n of buildings || s.buildings) {
      const nd = DEFS[n.type], dist = dist8(n.x, n.y, b.x, b.y);
      if (nd.aura && (!nd.auraResource || nd.auraResource === d.resource)) bonus += nd.aura * auraFactor(n);
      if (n.type === "well" && b.type === "farm") bonus += DEFS.well.farmAura * auraFactor(n);
      if (d.radius && dist <= d.radius && isPrereq(d, nd)) bonus += 0.1 * auraFactor(n);
    }
    return d.income * incomeFactor(b) * (1 + Math.min(2, bonus)) * difficultyEconomy(s);
  }
  const rates = (s) => economicView(s).buildings.reduce((r, b) => {
    const d = DEFS[b.type];
    r[d.resource === "materials" ? "materials" : "coins"] += income(s, b);
    return r;
  }, { coins: 0, materials: 0 });
  const incomeCache = /* @__PURE__ */ new WeakMap();
  function settleIncome(s, dt, emitEffects = true) {
    var _a;
    const w = world(s), buildings = w.buildings;
    const signature = JSON.stringify([w.mode, w.difficulty, w.players.map((p) => [p.team, p.controller]), buildings.map((b) => [b.type, b.x, b.y, b.level, b.owner])]);
    let cached = incomeCache.get(w);
    const sameBuildings = ((_a = cached == null ? void 0 : cached.buildings) == null ? void 0 : _a.length) === buildings.length && buildings.every((b, i) => cached.buildings[i] === b);
    if (!sameBuildings || cached.signature !== signature) {
      const groups = /* @__PURE__ */ new Map();
      for (const b of buildings) {
        const owner = b.owner;
        if (!groups.has(owner)) groups.set(owner, []);
        groups.get(owner).push(b);
      }
      cached = { signature, buildings: [...buildings], groups, players: /* @__PURE__ */ new Map() };
      incomeCache.set(w, cached);
    }
    const players = s.actorId === void 0 ? w.players.filter((p) => !p.eliminated).map((p) => playerView(w, p.id)) : s.eliminated ? [] : [s];
    for (const player of players) {
      const owner = player.actorId;
      const owned = cached.groups.get(owner) || [];
      let values = cached.players.get(owner);
      if (!values) {
        values = owned.map((b) => income(player, b, owned));
        cached.players.set(owner, values);
      }
      for (const [i, b] of owned.entries()) {
        const d = DEFS[b.type];
        if (!d.income) continue;
        b.incomeTime += dt;
        if (d.resource === "materials") b.materialPending += values[i] * dt;
        else b.coinPending += values[i] * dt;
        if (b.incomeTime < 1 - 1e-8) continue;
        b.incomeTime = Math.max(0, b.incomeTime - 1);
        for (const [resource, pending] of [["coins", "coinPending"], ["materials", "materialPending"]]) {
          const paid = Math.floor(b[pending] + 1e-8);
          b[pending] = Math.max(0, b[pending] - paid);
          player[resource] += paid;
          if (emitEffects && paid > 0) player.effects.push({ type: "income", resource, buildingId: b.id, amount: paid, x: b.x, y: b.y, life: 0.95, total: 0.95 });
        }
      }
    }
  }
  const flowCache = /* @__PURE__ */ new WeakMap(), controllerCache = /* @__PURE__ */ new WeakMap();
  let controllerFactory = null;
  function setControllerFactory(factory) {
    controllerFactory = factory;
  }
  function ready(s) {
    return s.players.filter((p) => !p.eliminated && p.controller === "human").every((p) => !!p.selectedSkill);
  }
  function tickControllers(s, dt) {
    if (!controllerFactory) return;
    let pilots = controllerCache.get(s);
    if (!pilots) {
      pilots = /* @__PURE__ */ new Map();
      controllerCache.set(s, pilots);
    }
    for (const p of s.players) if (!p.eliminated && ["computer", "autoplay"].includes(p.controller)) {
      if (!pilots.has(p.id)) pilots.set(p.id, controllerFactory(playerView(s, p.id)));
      pilots.get(p.id).tick(dt);
    }
  }
  function buildingGuard(s, b) {
    return Math.min(0.65, playerView(s, b.owner).buildings.filter((n) => n.type === "earth" && Math.hypot(n.x - b.x, n.y - b.y) <= DEFS.earth.range).reduce((v, n) => v + DEFS.earth.guard * factor(n), 0));
  }
  function defenseBoost(s) {
    return 1 + Math.min(1.5, economicView(s).buildings.filter((b) => b.type === "tao").reduce((n, b) => n + DEFS.tao.powerAura * factor(b), 0));
  }
  const zhongSlow = (b) => Math.min(0.65, DEFS.zhong.slow + 0.08 * (b.level - 1));
  function eliminate(s, owner) {
    const p = s.players[owner];
    if (p.eliminated) return;
    p.eliminated = true;
    s.buildings = s.buildings.filter((b) => b.owner !== owner);
    s.soldiers = s.soldiers.filter((u) => u.owner !== owner);
    s.projectiles = s.projectiles.filter((a) => a.owner !== owner);
    s.revision++;
    event(s, `${p.team === 0 ? "我方" : "敌方"}庄园 ${owner + 1} 已出局`, "elimination");
  }
  function hurtBuilding(s, b, damage, raw = false) {
    s = world(s);
    if (b.hp <= 0 || s.players[b.owner].eliminated) return;
    b.lastHit = s.elapsed;
    b.hp = Math.max(0, b.hp - damage * (raw ? 1 : 1 - buildingGuard(s, b)));
    if (b.hp > 0) return;
    if (b.type === "shrine") {
      eliminate(s, b.owner);
      return;
    }
    if (b.type !== "gate") s.buildings = s.buildings.filter((n) => n.id !== b.id);
    s.revision++;
  }
  function healBuilding(s, b, amount) {
    s = world(s);
    if (s.players[b.owner].eliminated) return;
    if (b.type === "gate" && b.hp === 0 && s.soldiers.some((u) => u.hp > 0 && Math.abs(u.x - b.x) < 0.65 && Math.abs(u.y - b.y) < 0.65)) return;
    b.hp = Math.min(maxHP(b), b.hp + amount);
  }
  function checkResult(s) {
    const blue = s.players.some((p) => p.team === 0 && !p.eliminated), red = s.players.some((p) => p.team === 1 && !p.eliminated);
    if (blue && red) return;
    s.over = true;
    s.result = blue ? "victory" : red ? "defeat" : "draw";
    event(s, { victory: "敌方主城全部攻破！", defeat: "我方主城全部失守", draw: "双方主城同时失守 · 平局" }[s.result], "finished");
  }
  function collectDead(s) {
    s.soldiers = s.soldiers.filter((u) => {
      if (u.hp > 0 && !s.players[u.owner].eliminated) return true;
      if (u.hp <= 0 && Number.isInteger(u.killer) && hostile(s, u.killer, u.owner)) {
        s.players[u.killer].kills++;
        s.kills++;
      }
      return false;
    });
  }
  function damageUnit(u, damage, owner) {
    if (u.hp <= 0) return;
    u.hp -= damage;
    if (u.hp <= 0) u.killer = owner;
  }
  function recruit(s, dt) {
    const counts = s.players.map(() => 0);
    for (const u of s.soldiers) if (u.hp > 0) counts[u.owner]++;
    const index = buildingIndex(s);
    for (const p of s.players) {
      if (p.eliminated) continue;
      const barracks = index.owners[p.id].filter((b) => b.type === "barracks" && b.hp > 0).sort((a, b) => a.id - b.id);
      if (!barracks.length) continue;
      if (counts[p.id] >= UNIT_CAP) {
        for (const b of barracks) b.production = 0;
        continue;
      }
      for (const b of barracks) b.production = (b.production || 0) + soldierRate(playerView(s, p.id)) * dt;
      for (let n = 0; n < barracks.length && counts[p.id] < UNIT_CAP; n++) {
        const i = (p.recruitCursor + n) % barracks.length, b = barracks[i];
        if (b.production < 1 - 1e-8) continue;
        b.production = Math.max(0, b.production - 1);
        counts[p.id]++;
        const maxHp = soldierHP(playerView(s, p.id), b);
        s.soldiers.push({
          id: s.nextId++,
          owner: p.id,
          barracksId: b.id,
          troopType: troopType(b),
          x: b.x,
          y: b.y,
          level: b.level,
          hp: maxHp,
          maxHp,
          baseDamage: soldierBaseDamage(b),
          attack: 0,
          attackAt: 0,
          targetOwner: null,
          targetId: null,
          targetBuildingId: null,
          repelled: 0,
          slowed: 0,
          slowFactor: 1,
          waypoint: null
        });
        p.nextRecruit = (i + 1) % barracks.length;
      }
      if (p.nextRecruit !== void 0) {
        p.recruitCursor = p.nextRecruit;
        delete p.nextRecruit;
      }
      if (counts[p.id] >= UNIT_CAP) for (const b of barracks) b.production = 0;
    }
  }
  function flow(s, target) {
    const w = world(s), m = map(w), gx = Math.round(target.x), gy = Math.round(target.y), goal = gy * m.width + gx;
    if (!inside(gx, gy, w) || !m.walk[goal]) return null;
    let cache = flowCache.get(w);
    if (!cache) {
      cache = /* @__PURE__ */ new Map();
      flowCache.set(w, cache);
    }
    if (cache.has(goal)) return cache.get(goal);
    const distance = new Int16Array(m.walk.length).fill(-1), next = new Int32Array(m.walk.length).fill(-1), queue = new Int32Array(m.walk.length);
    let head = 0, tail = 1;
    queue[0] = goal;
    distance[goal] = 0;
    next[goal] = goal;
    while (head < tail) {
      const k = queue[head++], x = k % m.width, y = Math.floor(k / m.width);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, n = ny * m.width + nx;
        if (nx >= 0 && ny >= 0 && nx < m.width && ny < m.height && m.walk[n] && distance[n] === -1) {
          distance[n] = distance[k] + 1;
          next[n] = k;
          queue[tail++] = n;
        }
      }
    }
    const value = { distance, next, goal };
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(goal, value);
    return value;
  }
  function findPath(s, unit, target) {
    const f = flow(s, target), width = worldWidth(s);
    let k = Math.round(unit.y) * width + Math.round(unit.x);
    if (!f || f.distance[k] < 0) return null;
    const result = [];
    while (k !== f.goal) {
      k = f.next[k];
      result.push({ x: k % width, y: Math.floor(k / width) });
    }
    return result;
  }
  const findSoldierPath = findPath;
  function targetEstate(s, u) {
    var _a;
    const k = Math.round(u.y) * s.worldSize + Math.round(u.x);
    let best = null, distance = Infinity;
    for (const p of s.players) if (!p.eliminated && hostile(s, u.owner, p.id)) {
      const shrine = buildingIndex(s).owners[p.id].find((b) => b.type === "shrine"), f = shrine && flow(s, shrine), d = f == null ? void 0 : f.distance[k];
      if (d >= 0 && d < distance) {
        best = shrine;
        distance = d;
      }
    }
    u.targetOwner = (_a = best == null ? void 0 : best.owner) != null ? _a : null;
    return best;
  }
  function spatial(s) {
    const buckets = /* @__PURE__ */ new Map(), byId = /* @__PURE__ */ new Map();
    for (const u of s.soldiers) if (u.hp > 0) {
      const key = Math.floor(u.x / 3) + "," + Math.floor(u.y / 3);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(u);
      byId.set(u.id, u);
    }
    return { byId, near(x, y, r) {
      const result = [];
      for (let gy = Math.floor((y - r) / 3); gy <= Math.floor((y + r) / 3); gy++) for (let gx = Math.floor((x - r) / 3); gx <= Math.floor((x + r) / 3); gx++) for (const u of buckets.get(gx + "," + gy) || []) if (u.hp > 0 && Math.hypot(u.x - x, u.y - y) <= r) result.push(u);
      return result;
    } };
  }
  function clearSegment(s, u, x, y, allowedBuildingId = null) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x - u.x, y - u.y) * 8));
    for (let i = 1; i <= steps; i++) {
      const tx = Math.round(u.x + (x - u.x) * i / steps), ty = Math.round(u.y + (y - u.y) * i / steps), b = at(s, tx, ty);
      if (!walkable(s, tx, ty) || (b == null ? void 0 : b.hp) > 0 && b.id !== allowedBuildingId && hostile(s, u.owner, b.owner)) return false;
    }
    return true;
  }
  function localChase(s, u, target) {
    if (clearSegment(s, u, target.x, target.y)) return { x: target.x, y: target.y };
    const width = s.worldSize, start = Math.round(u.y) * width + Math.round(u.x), goal = Math.round(target.y) * width + Math.round(target.x), queue = [start], parents = /* @__PURE__ */ new Map([[start, start]]);
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      if (k === goal) {
        let next = k;
        while (parents.get(next) !== start && next !== start) next = parents.get(next);
        return { x: next % width, y: Math.floor(next / width) };
      }
      const x = k % width, y = Math.floor(k / width);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, n = ny * width + nx, b = at(s, nx, ny);
        if (Math.abs(nx - u.x) > 6 || Math.abs(ny - u.y) > 6 || !walkable(s, nx, ny) || parents.has(n) || (b == null ? void 0 : b.hp) > 0 && hostile(s, u.owner, b.owner)) continue;
        parents.set(n, k);
        queue.push(n);
      }
    }
    return null;
  }
  function move(s, u, goal, dt) {
    if (!goal) return;
    if (!clearSegment(s, u, goal.x, goal.y)) {
      const home = { x: Math.round(u.x), y: Math.round(u.y) };
      if (clearSegment(s, u, home.x, home.y)) goal = home;
      else return;
    }
    const distance = Math.hypot(goal.x - u.x, goal.y - u.y), stride = Math.min(distance, SOLDIER_SPEED * (u.slowed > 0 ? u.slowFactor : 1) * dt);
    if (distance > 1e-4) {
      u.x += (goal.x - u.x) / distance * stride;
      u.y += (goal.y - u.y) / distance * stride;
    }
  }
  function stepSoldierMovement(s, dt, grid = spatial(s), onAttack = () => {
  }) {
    var _a, _b;
    if (!Number.isFinite(dt) || dt <= 0 || s.over) return;
    function fire(u, target, targetType) {
      if (u.attack > 0) return;
      u.attack = troopDef(u).interval;
      u.attackAt = s.elapsed;
      onAttack(u, target, targetType);
    }
    for (const u of s.soldiers) {
      if (u.hp <= 0) continue;
      u.attack = Math.max(0, u.attack - dt);
      u.slowed = Math.max(0, u.slowed - dt);
      if (!u.slowed) u.slowFactor = 1;
      if (u.attack < 1e-8) u.attack = 0;
      const archer = troopType(u) === "archer", range = troopDef(u).range;
      u.targetBuildingId = null;
      if (u.repelled > 0) {
        u.repelled = Math.max(0, u.repelled - dt);
        continue;
      }
      let target = grid.byId.get(u.targetId);
      if (!target || target.hp <= 0 || !hostile(s, u.owner, target.owner) || Math.hypot(target.x - u.x, target.y - u.y) > 6) target = null;
      const canShoot = (target2) => archer && Math.hypot(target2.x - u.x, target2.y - u.y) <= range + 1e-8 && clearSegment(s, u, target2.x, target2.y);
      if (target && archer && !canShoot(target)) {
        const shootable = grid.near(u.x, u.y, range).filter((e) => hostile(s, u.owner, e.owner) && canShoot(e)).sort((a, b2) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b2.x - u.x, b2.y - u.y) || a.id - b2.id);
        if (shootable.length) target = shootable[0];
      }
      let chase = target && (canShoot(target) ? target : localChase(s, u, target));
      if (!chase) {
        target = null;
        const nearby = grid.near(u.x, u.y, 3).filter((e) => hostile(s, u.owner, e.owner)).sort((a, b2) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b2.x - u.x, b2.y - u.y) || a.id - b2.id);
        for (const e of nearby) {
          chase = canShoot(e) ? e : localChase(s, u, e);
          if (chase) {
            target = e;
            break;
          }
        }
      }
      u.targetId = (_a = target == null ? void 0 : target.id) != null ? _a : null;
      if (target) {
        u.waypoint = null;
        if (Math.hypot(target.x - u.x, target.y - u.y) <= range + 1e-8 && clearSegment(s, u, target.x, target.y)) fire(u, target, "unit");
        else move(s, u, chase, dt);
        continue;
      }
      let shrine = u.targetOwner !== null && !((_b = s.players[u.targetOwner]) == null ? void 0 : _b.eliminated) ? buildingIndex(s).owners[u.targetOwner].find((b2) => b2.type === "shrine") : null;
      if (!shrine) {
        u.waypoint = null;
        shrine = targetEstate(s, u);
      }
      if (!shrine) continue;
      const f = flow(s, shrine), tile = Math.round(u.y) * s.worldSize + Math.round(u.x);
      if (!f || f.distance[tile] < 0) {
        u.targetOwner = null;
        u.waypoint = null;
        continue;
      }
      if (archer) {
        let next = tile, obstacle = null;
        for (let step2 = 0; step2 < 6 && next !== f.goal; step2++) {
          next = f.next[next];
          const candidate = at(s, next % s.worldSize, Math.floor(next / s.worldSize));
          if ((candidate == null ? void 0 : candidate.hp) > 0 && hostile(s, u.owner, candidate.owner)) {
            obstacle = candidate;
            break;
          }
        }
        if (obstacle && Math.hypot(obstacle.x - u.x, obstacle.y - u.y) <= range + 1e-8 && clearSegment(s, u, obstacle.x, obstacle.y, obstacle.id)) {
          u.waypoint = null;
          u.targetBuildingId = obstacle.id;
          fire(u, obstacle, "building");
          continue;
        }
      }
      let goal = u.waypoint;
      if (!goal || Math.hypot(goal.x - u.x, goal.y - u.y) < 1e-3) {
        const next = f.next[tile];
        goal = { x: next % s.worldSize, y: Math.floor(next / s.worldSize) };
        u.waypoint = goal;
      }
      const b = at(s, goal.x, goal.y);
      if ((b == null ? void 0 : b.hp) > 0 && hostile(s, u.owner, b.owner)) {
        if (Math.hypot(b.x - u.x, b.y - u.y) <= 1.05) {
          u.targetBuildingId = b.id;
          fire(u, b, "building");
        } else {
          const dist = Math.hypot(goal.x - u.x, goal.y - u.y), step2 = Math.min(SOLDIER_SPEED * dt, Math.max(0, dist - 1));
          if (step2 > 0) move(s, u, { x: u.x + (goal.x - u.x) / dist * step2, y: u.y + (goal.y - u.y) / dist * step2 }, dt);
        }
      } else move(s, u, goal, dt);
    }
  }
  function combat(s, dt) {
    const grid = spatial(s), unitHits = [], buildingHits = [], boost = s.players.map((p) => defenseBoost(playerView(s, p.id))), armyBoost = s.players.map((p, i) => boost[i] * difficultySoldier(playerView(s, p.id)));
    const projectileTarget = (p) => p.targetType === "building" ? buildingIndex(s).ids.get(p.targetId) : grid.byId.get(p.targetId);
    for (const p of s.projectiles) {
      p.life -= dt;
      const target = projectileTarget(p);
      if ((target == null ? void 0 : target.hp) > 0 && !s.players[p.owner].eliminated) {
        p.tx = target.x;
        p.ty = target.y;
        if (p.life <= 1e-8 && hostile(s, p.owner, target.owner)) {
          if (p.targetType === "building") buildingHits.push([target, p.damage]);
          else unitHits.push([target, p.damage, p.owner]);
        }
      }
    }
    s.projectiles = s.projectiles.filter((p) => {
      var _a;
      return p.life > 1e-8 && ((_a = projectileTarget(p)) == null ? void 0 : _a.hp) > 0 && !s.players[p.owner].eliminated;
    });
    for (const b of s.buildings) {
      if (b.hp <= 0) continue;
      const d = DEFS[b.type];
      b.cooldown = Math.max(0, b.cooldown - dt);
      if (b.type === "zhong" && b.cooldown === 0) {
        const enemies = s.soldiers.filter((u) => u.hp > 0 && hostile(s, b.owner, u.owner));
        if (enemies.length) {
          for (const u of enemies) {
            u.slowed = Math.max(u.slowed, 4);
            u.slowFactor = Math.min(u.slowFactor, 1 - zhongSlow(b));
          }
          b.cooldown = 12;
          s.effects.push({ type: "zhong-pulse", x: b.x, y: b.y, life: 0.8, total: 0.8 });
        }
      }
      if (!d.damage || b.type === "barracks" || b.cooldown > 0) continue;
      const targets = grid.near(b.x, b.y, d.range + (b.level - 1) * 0.35).filter((u) => hostile(s, b.owner, u.owner)).sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y) || a.id - c.id);
      const target = targets[0];
      if (!target) continue;
      b.cooldown = d.interval;
      const damage = d.damage * factor(b) * boost[b.owner];
      if (d.splash) {
        for (const u of grid.near(target.x, target.y, d.splash)) if (hostile(s, b.owner, u.owner)) unitHits.push([u, damage, b.owner]);
      } else s.projectiles.push({ id: s.nextId++, owner: b.owner, type: b.type, x: b.x, y: b.y, tx: target.x, ty: target.y, targetId: target.id, damage, life: 0.3, total: 0.3 });
    }
    stepSoldierMovement(s, dt, grid, (u, target, targetType) => {
      const damage = u.baseDamage * armyBoost[u.owner];
      if (troopType(u) === "archer") s.projectiles.push({ id: s.nextId++, owner: u.owner, sourceId: u.id, type: "archer", targetType, x: u.x, y: u.y, tx: target.x, ty: target.y, targetId: target.id, damage, life: 0.3, total: 0.3 });
      else if (targetType === "building") buildingHits.push([target, damage]);
      else unitHits.push([target, damage, u.owner]);
    });
    for (const [u, damage, owner] of unitHits) damageUnit(u, damage, owner);
    for (const [b, damage] of buildingHits) hurtBuilding(s, b, damage);
    collectDead(s);
    checkResult(s);
  }
  const skillZoneCache = /* @__PURE__ */ new WeakMap();
  function inSkillZone(s, owner, u) {
    const w = world(s);
    let zones = skillZoneCache.get(w);
    if (!zones) {
      zones = [];
      skillZoneCache.set(w, zones);
    }
    if (!zones[owner]) {
      const e = map(s).land.estates[owner], zone = /* @__PURE__ */ new Set([...e.cells, ...e.walls]);
      for (const k of [...e.walls, ...e.gates.map((g) => g.y * w.worldSize + g.x)]) for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (dx * dx + dy * dy <= 25) {
        const x = k % w.worldSize + dx, y = Math.floor(k / w.worldSize) + dy;
        if (inside(x, y, w)) zone.add(y * w.worldSize + x);
      }
      zones[owner] = zone;
    }
    return zones[owner].has(Math.round(u.y) * w.worldSize + Math.round(u.x));
  }
  function chooseSkill(s, id) {
    s = economicView(s);
    if (!Object.prototype.hasOwnProperty.call(SKILLS, id) || typeof id !== "string") return { ok: false, reason: "未知神技" };
    if (s.selectedSkill || s.eliminated || s.over) return { ok: false, reason: "本局神技不可更换" };
    s.selectedSkill = id;
    return { ok: true };
  }
  function skillReason(s, id) {
    s = economicView(s);
    if (!Object.prototype.hasOwnProperty.call(SKILLS, id) || typeof id !== "string") return "未知神技";
    if (s.eliminated || s.over) return "该庄园已出局";
    if (!s.selectedSkill) return "请先选择神技";
    if (s.selectedSkill !== id) return "未选择此神技";
    return s.cooldowns[id] > 0 ? "还需 " + Math.ceil(s.cooldowns[id]) + " 秒" : "";
  }
  function skill(s, id) {
    s = economicView(s);
    const reason = skillReason(s, id);
    if (reason) return { ok: false, reason };
    const w = world(s);
    s.cooldowns[id] = SKILLS[id].cooldown;
    if (id === "repair") for (const b of s.buildings) healBuilding(w, b, maxHP(b) * 0.35);
    else for (const u of hostileUnits(s)) if (inSkillZone(s, s.actorId, u)) {
      if (id === "repel") u.repelled = 4;
      damageUnit(u, id === "repel" ? 20 : 240, s.actorId);
      if (id === "thunder") w.effects.push({ type: "thunder", x: u.x, y: u.y, life: 0.7, total: 0.7 });
    }
    const home = estate(s).center;
    w.effects.push({ type: id, x: home.x, y: home.y, life: 1, total: 1 });
    collectDead(w);
    return { ok: true };
  }
  function stepEconomy(s, dt, emitEffects = true) {
    s = economicView(s);
    if (!Number.isFinite(dt) || dt <= 0 || s.over || s.eliminated) return;
    dt = Math.min(dt, 0.25);
    settleIncome(s, dt, emitEffects);
    for (const id in s.cooldowns) s.cooldowns[id] = Math.max(0, s.cooldowns[id] - dt);
  }
  const gateRepairRate = (level = 1) => 0.02 + 2e-3 * (Math.max(1, Math.min(GATE_MAX_LEVEL, level)) - 1);
  function step(s, dt) {
    s = world(s);
    if (s.over || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.25);
    s.elapsed += dt;
    s.time = s.elapsed;
    tickControllers(s, dt);
    settleIncome(s, dt);
    for (const p of s.players) if (!p.eliminated) for (const id in p.cooldowns) p.cooldowns[id] = Math.max(0, p.cooldowns[id] - dt);
    for (const e of s.effects) e.life -= dt;
    s.effects = s.effects.filter((e) => e.life > 0);
    const repairRates = s.players.map((p) => gateRepairRate(p.gateLevel));
    for (const b of [...s.buildings]) {
      if (dryFarm(playerView(s, b.owner), b)) {
        hurtBuilding(s, b, maxHP(b) * 0.05 * dt, true);
        continue;
      }
      if (s.elapsed - b.lastHit < 10 - 1e-8) continue;
      if (b.type === "gate" && b.hp === 0 && s.soldiers.some((u) => u.hp > 0 && hostile(s, b.owner, u.owner) && Math.hypot(u.x - b.x, u.y - b.y) <= 3)) continue;
      healBuilding(s, b, maxHP(b) * repairRates[b.owner] * dt);
    }
    syncSoldierHealth(s);
    recruit(s, dt);
    combat(s, dt);
    missions(s);
  }
  function serialize(s) {
    s = world(s);
    return JSON.stringify(__spreadProps(__spreadValues({}, s), { events: [], effects: [] }));
  }
  function restore(raw) {
    try {
      const s = JSON.parse(raw), finite = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
      if (!s || ![9, 10, VERSION].includes(s.version) || !["single", "coop"].includes(s.mode) || !(s.mode === "coop" ? [2, 4, 6] : [1, 2, 3, 4]).includes(s.enemyCount) || ![0, 1, 2, 3].includes(s.rotation)) return null;
      const legacy = s.version === 9, oldVersion = s.version < VERSION;
      s.version = VERSION;
      if (!Object.prototype.hasOwnProperty.call(s, "difficulty")) s.difficulty = "beginner";
      if (!Object.prototype.hasOwnProperty.call(DIFFICULTIES, s.difficulty)) return null;
      if (!Number.isInteger(s.mapSeed) || s.mapSeed < 0 || s.mapSeed > 4294967295 || !Number.isInteger(s.seed) || s.seed < 0 || s.seed > 4294967295) return null;
      const [width, height] = Maps.dimensions(s.mode, s.enemyCount), [oldWidth, oldHeight] = Maps.layoutDimensions(s.mode, s.enemyCount), blue = s.mode === "coop" ? 2 : 1;
      const expectedWidth = s.rotation % 2 ? height : width, expectedHeight = s.rotation % 2 ? width : height, legacyWidth = s.rotation % 2 ? oldHeight : oldWidth, legacyHeight = s.rotation % 2 ? oldWidth : oldHeight;
      const cropped = oldVersion && s.worldSize === legacyWidth && s.worldHeight === legacyHeight;
      if (cropped) {
        s.worldSize = expectedWidth;
        s.worldHeight = expectedHeight;
        const shift = (point) => {
          if (point) {
            point.x -= Maps.EDGE_CROP;
            point.y -= Maps.EDGE_CROP;
          }
        };
        for (const b of s.buildings || []) shift(b);
        for (const u of s.soldiers || []) {
          shift(u);
          shift(u.waypoint);
        }
        for (const p of s.projectiles || []) {
          shift(p);
          p.tx -= Maps.EDGE_CROP;
          p.ty -= Maps.EDGE_CROP;
        }
      }
      if (s.worldSize !== expectedWidth || s.worldHeight !== expectedHeight || !finite(s.elapsed) || !Number.isInteger(s.nextId) || s.nextId < 1 || !Number.isInteger(s.revision) || s.revision < 0 || typeof s.over !== "boolean" || ![null, "victory", "defeat", "draw"].includes(s.result) || !finite(s.kills)) return null;
      if (!Array.isArray(s.players) || s.players.length !== blue + s.enemyCount || !Array.isArray(s.buildings) || !Array.isArray(s.soldiers) || !Array.isArray(s.projectiles)) return null;
      for (const [i, p] of s.players.entries()) {
        if (!p || p.id !== i || p.team !== (i < blue ? 0 : 1) || !["human", "computer", "autoplay"].includes(p.controller) || typeof p.eliminated !== "boolean" || !finite(p.coins) || !finite(p.materials) || !Number.isInteger(p.fortuneBuilt) || p.fortuneBuilt < 0 || p.fortuneBuilt > 10 || !Number.isInteger(p.gateLevel) || p.gateLevel < 1 || p.gateLevel > 15 || !Number.isInteger(p.mission) || p.mission < 0 || p.mission > MISSIONS.length || !finite(p.kills) || !Number.isInteger(p.recruitCursor) || p.recruitCursor < 0) return null;
        if (p.selectedSkill !== null && (!Object.prototype.hasOwnProperty.call(SKILLS, p.selectedSkill) || typeof p.selectedSkill !== "string")) return null;
        if (!p.cooldowns || !Object.keys(SKILLS).every((k) => finite(p.cooldowns[k])) || !p.ai || !["clock", "activeSeconds", "decisions", "builds", "upgrades", "casts"].every((k) => finite(p.ai[k])) || typeof p.ai.armyTurn !== "boolean" || typeof p.ai.lastAction !== "string") return null;
      }
      const ids = /* @__PURE__ */ new Set(), tiles = /* @__PURE__ */ new Set(), count = s.players.map(() => 0), shrine = s.players.map(() => 0), owner = (n) => Number.isInteger(n) && n >= 0 && n < s.players.length;
      const identity = (e) => {
        if (!e || !Number.isInteger(e.id) || e.id < 1 || e.id >= s.nextId || ids.has(e.id) || !owner(e.owner)) return false;
        ids.add(e.id);
        return true;
      };
      for (const b of s.buildings) {
        if ((b == null ? void 0 : b.type) === "barracks") {
          if (legacy) b.troopType = "infantry";
          if (typeof b.troopType !== "string" || !Object.prototype.hasOwnProperty.call(TROOPS, b.troopType) || b.level < 2 && b.troopType !== "infantry") return null;
        }
        if (!identity(b) || s.players[b.owner].eliminated || !Object.prototype.hasOwnProperty.call(DEFS, b.type) || !Number.isInteger(b.level) || b.level < 1 || b.level > maxLevel(b) || !inside(b.x, b.y, s) || ownerAt(s, b.x, b.y) !== b.owner || isWall(s, b.x, b.y) || !finite(b.hp) || b.hp > maxHP(b) + 1e-6 || !b.hp && b.type !== "gate") return null;
        const key = b.y * s.worldSize + b.x;
        if (tiles.has(key)) return null;
        tiles.add(key);
        if (!["cooldown", "incomeTime", "coinPending", "materialPending", "production"].every((k) => finite(b[k])) || typeof b.lastHit !== "number" || !Number.isFinite(b.lastHit) || b.lastHit > s.elapsed || b.lastHit < -10) return null;
        if (b.type === "shrine") shrine[b.owner]++;
        if (b.type === "gate" && !map(s).land.estates[b.owner].gates.some((g) => g.x === b.x && g.y === b.y && g.direction === b.direction)) return null;
      }
      if (s.players.some((p) => shrine[p.id] !== Number(!p.eliminated))) return null;
      for (const u of s.soldiers) {
        if (legacy) {
          u.troopType = "infantry";
          u.attackAt = 0;
          u.targetBuildingId = null;
        }
        if (cropped) {
          u.x = Math.max(0, Math.min(s.worldSize - 1, u.x));
          u.y = Math.max(0, Math.min(s.worldHeight - 1, u.y));
          if (!walkable(s, Math.round(u.x), Math.round(u.y))) {
            const cells = [];
            for (let y = 0; y < s.worldHeight; y++) for (let x = 0; x < s.worldSize; x++) if (walkable(s, x, y)) cells.push({ x, y, d: Math.hypot(x - u.x, y - u.y) });
            cells.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
            if (!cells.length) return null;
            u.x = cells[0].x;
            u.y = cells[0].y;
          }
          if (u.waypoint && !inside(u.waypoint.x, u.waypoint.y, s)) u.waypoint = null;
        }
        if (typeof (u == null ? void 0 : u.troopType) !== "string" || !Object.prototype.hasOwnProperty.call(TROOPS, u.troopType) || u.troopType === "archer" && u.level < 2) return null;
        if (!identity(u) || s.players[u.owner].eliminated || ++count[u.owner] > UNIT_CAP || !finite(u.x) || !finite(u.y) || !walkable(s, Math.round(u.x), Math.round(u.y)) || !Number.isInteger(u.level) || u.level < 1 || u.level > 9 || !finite(u.hp) || u.hp <= 0 || !finite(u.maxHp) || u.hp > u.maxHp || !finite(u.baseDamage) || !["attack", "repelled", "slowed", "slowFactor"].every((k) => finite(u[k])) || !Number.isInteger(u.barracksId)) return null;
        const nextMax = soldierHP(playerView(s, u.owner), u);
        if (u.maxHp !== nextMax) {
          u.hp = Math.min(nextMax, nextMax * u.hp / u.maxHp);
          u.maxHp = nextMax;
        }
        u.baseDamage = soldierBaseDamage(u);
        if (!finite(u.attackAt) || u.attackAt > s.elapsed || u.targetBuildingId !== null && (!Number.isInteger(u.targetBuildingId) || u.targetBuildingId < 1)) return null;
        if (u.targetOwner !== null && (!owner(u.targetOwner) || !hostile(s, u.owner, u.targetOwner))) return null;
        if (u.targetId !== null && (!Number.isInteger(u.targetId) || u.targetId < 1)) return null;
        if (u.waypoint !== null && (!u.waypoint || !inside(u.waypoint.x, u.waypoint.y, s) || !walkable(s, u.waypoint.x, u.waypoint.y))) return null;
      }
      for (const p of s.projectiles) {
        if (!identity(p) || !["tower", "rock", "archer"].includes(p.type) || !["x", "y", "tx", "ty", "damage", "life", "total"].every((k) => finite(p[k])) || !Number.isInteger(p.targetId)) return null;
        if (p.type === "archer" && (!["unit", "building"].includes(p.targetType) || !Number.isInteger(p.sourceId) || p.sourceId < 1)) return null;
      }
      const aliveBlue = s.players.some((p) => p.team === 0 && !p.eliminated), aliveRed = s.players.some((p) => p.team === 1 && !p.eliminated);
      if (s.over !== (!aliveBlue || !aliveRed) || s.result !== (aliveBlue && aliveRed ? null : aliveBlue ? "victory" : aliveRed ? "defeat" : "draw")) return null;
      s.phase = "day";
      s.day = 1;
      s.time = s.elapsed;
      s.events = [];
      s.effects = [];
      return s;
    } catch (e) {
      return null;
    }
  }
  return {
    VERSION,
    UNIT_CAP,
    SOLDIER_SPEED,
    TROOPS,
    troopType,
    troopDef,
    DIFFICULTIES,
    createMatch,
    createState,
    createCoopState,
    playerView,
    ownerAt,
    hostile,
    hostileUnits,
    inSkillZone,
    ready,
    setControllerFactory,
    gateRepairRate,
    stepSoldierMovement,
    SIZE,
    CENTER,
    worldSize,
    worldWidth,
    worldHeight,
    worldCenter,
    worldCenterY,
    estate,
    owns,
    isWall,
    walkable,
    MAX_LEVEL,
    SHRINE_MAX_LEVEL,
    GROWTH,
    HP_GROWTH,
    UPGRADE_GROWTH,
    MATERIAL_COST_FACTOR,
    ECONOMY_UPGRADE_WAIT,
    ECONOMY_UPGRADE_GROWTH,
    SHRINE_REQUIREMENTS,
    TERRAIN,
    DEFS,
    SKILLS,
    MISSIONS,
    chains,
    terrain,
    dist8,
    at,
    adjacent,
    dryFarm,
    factor,
    incomeFactor,
    auraFactor,
    hpFactor,
    maxLevel,
    shrineLevel,
    requiredShrineLevel,
    unlockedBuildingLevel,
    maxHP,
    soldierTrainingTime,
    soldierRate,
    difficultyModifiers,
    difficultyEconomy,
    difficultySoldier,
    soldierBoost,
    soldierHP,
    soldierDamage,
    soldierPower,
    findSoldierPath,
    visualLevel,
    name,
    buildCost,
    fortuneCandidates,
    grantBuilding,
    buildReason,
    buildHints,
    build,
    upgradeCost,
    upgradeReason,
    upgradeOptions,
    bulkUpgrade,
    upgrade,
    demolishReason,
    demolish,
    income,
    rates,
    buildingGuard,
    defenseBoost,
    zhongSlow,
    findPath,
    chooseSkill,
    skillReason,
    skill,
    stepEconomy,
    step,
    serialize,
    restore
  };
});

(function(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./game"));
  else root.GFNetwork = factory(root.GF);
})(typeof globalThis !== "undefined" ? globalThis : this, function(G) {
  "use strict";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const personalKeys = ["coins", "materials", "fortuneBuilt", "gateLevel", "cooldowns", "selectedSkill", "mission"];
  const progressKeys = ["incomeTime", "coinPending", "materialPending"];
  const metaKeys = ["time", "elapsed", "kills", "over", "result", "revision", "nextId"];
  function economy(s, owner) {
    const player = G.playerView(s, owner), values = {};
    for (const key of personalKeys) values[key] = clone(player[key]);
    return { at: s.elapsed, player: values, buildings: player.buildings.map((b) => [b.id, ...progressKeys.map((key) => b[key] || 0)]) };
  }
  function snapshot(s, owner) {
    const next = JSON.parse(G.serialize(s));
    for (const p of next.players) if (p.id !== owner) {
      p.coins = p.materials = p.fortuneBuilt = p.mission = 0;
      p.cooldowns = { repel: 0, repair: 0, thunder: 0 };
    }
    for (const b of next.buildings) if (b.owner !== owner) for (const key of progressKeys) b[key] = 0;
    return JSON.stringify(next);
  }
  function packed(entity, group, initial = false) {
    const row = {};
    const unitKeys = [
      "id",
      "x",
      "y",
      "hp",
      "maxHp",
      "level",
      "troopType",
      "baseDamage",
      "targetId",
      "targetBuildingId",
      "attackAt",
      "attack",
      "targetOwner",
      "waypoint",
      "repelled",
      "slowed",
      "slowFactor"
    ];
    const keys = group === "buildings" ? Object.keys(entity) : initial ? [...unitKeys, "owner", "barracksId"] : unitKeys;
    for (const key of keys) {
      if (["path", "pathRevision", "targetTile", "chaseTile"].includes(key) || group === "buildings" && (progressKeys.includes(key) || key === "cooldown")) continue;
      if (entity[key] !== void 0) row[key] = ["x", "y"].includes(key) ? Math.round(entity[key] * 1e3) / 1e3 : entity[key];
    }
    return row;
  }
  function delta(s, previous = {}) {
    const next = {}, message = { meta: {}, players: s.players.map((p) => ({ id: p.id, team: p.team, controller: p.controller, selectedSkill: p.selectedSkill, gateLevel: p.gateLevel, eliminated: p.eliminated, kills: p.kills, ai: p.ai })) };
    for (const key of metaKeys) message.meta[key] = clone(s[key]);
    for (const key of ["buildings", "soldiers"]) {
      const before = previous[key] || /* @__PURE__ */ new Map(), after = /* @__PURE__ */ new Map(), upsert = [];
      for (const entity of s[key]) {
        const initial = !before.has(entity.id), row = packed(entity, key, initial), text = JSON.stringify(packed(entity, key));
        after.set(entity.id, text);
        if (before.get(entity.id) !== text) upsert.push(row);
      }
      message[key] = { upsert, remove: [...before.keys()].filter((id) => !after.has(id)) };
      next[key] = after;
    }
    return { message, next };
  }
  function updateEntities(list, patch, building) {
    const removed = new Set(patch.remove), byId = new Map(list.map((e) => [e.id, e]));
    const result = list.filter((e) => !removed.has(e.id));
    for (const row of patch.upsert) {
      let entity = byId.get(row.id);
      if (!entity) {
        entity = building ? { cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0 } : { path: [], pathRevision: -1 };
        result.push(entity);
      }
      Object.assign(entity, clone(row));
    }
    return result;
  }
  function copyEntities(current, source) {
    const existing = new Map(current.map((entity) => [entity.id, entity]));
    return source.map((row) => {
      const entity = existing.get(row.id) || {};
      for (const key of Object.keys(entity)) if (!(key in row)) delete entity[key];
      Object.assign(entity, row);
      return entity;
    });
  }
  function predict(s, owner, action) {
    const player = G.playerView(s, owner), { kind, x, y } = action, b = G.at(s, x, y);
    if (player.eliminated || s.over) return { ok: false, reason: "该庄园已出局" };
    if (kind === "choose-skill") return G.chooseSkill(player, action.skill);
    if (kind === "skill") {
      const reason = G.skillReason(player, action.skill);
      if (reason) return { ok: false, reason };
      player.cooldowns[action.skill] = G.SKILLS[action.skill].cooldown;
      return { ok: true };
    }
    const nextId = s.nextId;
    s.nextId = -action.id * 10;
    try {
      if (kind === "build" && action.building === "fortune") {
        const reason = G.buildReason(player, "fortune", x, y);
        if (reason) return { ok: false, reason };
        const cost = G.buildCost(player, "fortune");
        player.coins -= cost.coins;
        player.materials -= cost.materials;
        player.fortuneBuilt++;
        s.buildings.push({ id: s.nextId, type: "fortune", owner, x, y, level: 1, hp: 1, cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0, production: 0, lastHit: -10 });
        s.revision++;
        return { ok: true };
      }
      if (kind === "build") return G.build(player, action.building, x, y);
      if (!b || b.owner !== owner) return { ok: false, reason: "无法操作该地块" };
      if (kind === "upgrade") return G.upgrade(player, b, { troopType: action.troopType });
      if (kind === "bulk") return G.bulkUpgrade(player, b);
      if (kind === "demolish") return G.demolish(player, b);
      return { ok: false, reason: "未知操作" };
    } finally {
      s.nextId = nextId;
    }
  }
  function createReplica(raw, owner, session, seq, ack = 0) {
    const base = G.restore(raw);
    if (!base || base.mode !== "coop") return null;
    const state = clone(base), replica = { base, state, owner, session, seq, ack, pending: [], economic: economy(base, owner) };
    replica.reconcile = () => {
      const effects = state.effects, projectiles = state.projectiles;
      for (const key of metaKeys) state[key] = clone(base[key]);
      for (const key of ["buildings", "soldiers"]) state[key] = copyEntities(state[key], base[key]);
      for (const key of personalKeys) G.playerView(state, owner)[key] = clone(replica.economic.player[key]);
      for (const p of base.players) {
        const target = state.players[p.id];
        for (const key of ["selectedSkill", "gateLevel", "eliminated", "controller", "kills", "ai"]) target[key] = clone(p[key]);
      }
      const byId = new Map(state.buildings.map((b) => [b.id, b]));
      for (const [id, ...values] of replica.economic.buildings) {
        const b = byId.get(id);
        if (b) progressKeys.forEach((key, i) => {
          b[key] = values[i];
        });
      }
      let remaining = Math.max(0, base.elapsed - replica.economic.at);
      while (remaining > 1e-8) {
        const dt = Math.min(0.25, remaining);
        G.stepEconomy(G.playerView(state, owner), dt, false);
        remaining -= dt;
      }
      for (const action of replica.pending) predict(state, owner, action);
      state.effects = effects;
      state.projectiles = projectiles;
      state.events = [];
    };
    replica.apply = (message) => {
      if (message.session !== replica.session || message.seq <= replica.seq) return false;
      if (message.seq !== replica.seq + 1) return null;
      Object.assign(base, clone(message.meta));
      for (const key of ["buildings", "soldiers"]) base[key] = updateEntities(base[key], message[key], key === "buildings");
      message.players.forEach((values, index) => Object.assign(base.players[index], values));
      if (message.economy) replica.economic = clone(message.economy);
      replica.ack = message.ack;
      replica.pending = replica.pending.filter((action) => action.id > message.ack);
      replica.seq = message.seq;
      replica.reconcile();
      return true;
    };
    replica.act = (action) => {
      const result = predict(state, owner, action);
      if (result.ok) replica.pending.push(action);
      return result;
    };
    return replica;
  }
  function createMotionPredictor() {
    const horizon = 0.5, correctionTime = 0.18, teleportDistance = 2;
    let shadow = null, units = /* @__PURE__ */ new Map(), offsets = /* @__PURE__ */ new Map();
    let clockOffset = null, confirmedAt = 0, receivedAt = 0, displayAt = 0, running = false;
    function simulateTo(time) {
      while (shadow.elapsed + 1e-8 < time) {
        const dt = Math.min(1 / 30, time - shadow.elapsed);
        shadow.elapsed += dt;
        G.stepSoldierMovement(shadow, dt);
      }
    }
    function position(unit) {
      const predicted = units.get(unit.id);
      if (!predicted || unit.hp <= 0) return unit;
      const offset = offsets.get(unit.id);
      const blend = offset ? Math.pow(Math.max(0, 1 - (displayAt - receivedAt) / correctionTime), 2) : 0;
      return { x: predicted.x + ((offset == null ? void 0 : offset.x) || 0) * blend, y: predicted.y + ((offset == null ? void 0 : offset.y) || 0) * blend };
    }
    function advance(now, enabled = true) {
      if (!shadow || !running || !enabled) return;
      displayAt = Math.max(displayAt, now);
      simulateTo(Math.min(confirmedAt + horizon, Math.max(shadow.elapsed, now - clockOffset)));
    }
    function sync(state, now, paused = false, reset = false) {
      advance(now);
      const previous = /* @__PURE__ */ new Map();
      if (!reset && !paused) for (const unit of (shadow == null ? void 0 : shadow.soldiers) || []) previous.set(unit.id, position(unit));
      if (reset || paused || !running || clockOffset === null) clockOffset = now - state.elapsed;
      else clockOffset = Math.min(clockOffset, now - state.elapsed);
      if (!shadow || reset) shadow = {};
      Object.assign(shadow, state, { soldiers: state.soldiers.map((unit) => clone(unit)) });
      units = new Map(shadow.soldiers.map((unit) => [unit.id, unit]));
      confirmedAt = state.elapsed;
      receivedAt = displayAt = now;
      running = !paused && !state.over;
      if (running) simulateTo(Math.min(confirmedAt + horizon, Math.max(confirmedAt, now - clockOffset)));
      offsets = /* @__PURE__ */ new Map();
      for (const unit of shadow.soldiers) {
        const before = previous.get(unit.id);
        if (!before) continue;
        const dx = before.x - unit.x, dy = before.y - unit.y;
        if (Math.hypot(dx, dy) < teleportDistance) offsets.set(unit.id, { x: dx, y: dy });
      }
    }
    return { sync, advance, position };
  }
  return { economy, snapshot, delta, createReplica, createMotionPredictor };
});

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
(function() {
  "use strict";
  const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const T = 64, palette = { plain: "#ced5af", shore: "#d9cda7", water: "#a9c9bd", forest: "#b4c49a", mountain: "#c3c5af" };
  const png = (c, name, x, y, w, h) => GFUI.draw(c, `assets/${name}.png`, x, y, w, h);
  const panel = (c, name, x, y, w, h) => GFUI.panel(c, name, x, y, w, h);
  function health(c, x, y, w, h, fraction, kind) {
    png(c, "ui/bars/health-track", x, y, w, h);
    const value = Math.max(0, Math.min(1, fraction));
    if (value > 0) png(c, "ui/bars/health-" + kind, x + 1, y + 1, (w - 2) * value, Math.max(1, h - 2));
  }
  const hintCaches = /* @__PURE__ */ new WeakMap();
  const sprites = /* @__PURE__ */ new Map();
  const assetUrl = (path) => {
    var _a;
    return ((_a = window.GF_ASSET_URLS) == null ? void 0 : _a[path]) || path;
  };
  let artAssetVersion = 0;
  const artImages = /* @__PURE__ */ new Map();
  function artImage(path) {
    if (artImages.has(path)) return artImages.get(path);
    const image = new Image();
    image.onload = image.onerror = () => {
      artAssetVersion++;
      groundSeed = null;
    };
    image.src = assetUrl(path);
    artImages.set(path, image);
    return image;
  }
  const buildingPath = (type, level) => `assets/sprites/buildings/${type}/level-${GF.visualLevel(level)}.png`;
  const maskName = (mask) => mask.toString(16).padStart(2, "0");
  const soldierAtlasSources = {
    infantry_player: "assets/sprites/soldiers/infantry_player-red.png",
    infantry_ally: "assets/sprites/soldiers/infantry_ally-green.png",
    infantry_enemy: "assets/sprites/soldiers/infantry_enemy-purple.png",
    archer_player: "assets/sprites/soldiers/archer_player-red.png",
    archer_ally: "assets/sprites/soldiers/archer_ally-green.png",
    archer_enemy: "assets/sprites/soldiers/archer_enemy-purple.png"
  };
  const soldierAtlases = {};
  const soldierMotionCaches = /* @__PURE__ */ new WeakMap();
  function soldierFacing(dx, dy, current = "front") {
    const ax = Math.abs(dx), ay = Math.abs(dy), horizontal = current === "left" || current === "right";
    const useHorizontal = horizontal ? ay <= ax * 1.35 : ax > ay * 1.35;
    return useHorizontal ? dx < 0 ? "left" : "right" : dy < 0 ? "back" : "front";
  }
  let soldierSpriteVersion = 0;
  for (const [faction, source] of Object.entries(soldierAtlasSources)) {
    const image = new Image();
    image.onload = image.onerror = () => soldierSpriteVersion++;
    image.src = assetUrl(source);
    soldierAtlases[faction] = image;
  }
  let glowSprite = null;
  function nightGlow() {
    if (glowSprite) return glowSprite;
    const size = 128, cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const g = cv.getContext("2d"), grad = g.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "#d4a34536");
    grad.addColorStop(1, "#d4a34500");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return glowSprite = cv;
  }
  function drawBaked(c, key, paint) {
    let sprite = sprites.get(key);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = 256;
      sprite.height = 256;
      const ctx = sprite.getContext("2d");
      ctx.scale(2, 2);
      ctx.translate(64, 96);
      paint(ctx);
      sprites.set(key, sprite);
    }
    c.drawImage(sprite, -64, -96, 128, 128);
  }
  const noise = (x, y, n = 0) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  function poly(c, points, fill, stroke, width = 1) {
    c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }
  function line(c, points, color, width = 1) {
    c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.stroke();
  }
  function ellipse(c, x, y, rx, ry, fill, stroke) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 0.8;
      c.stroke();
    }
  }
  function rect(c, x, y, w, h, fill, stroke) {
    c.fillStyle = fill;
    c.fillRect(x, y, w, h);
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 0.7;
      c.strokeRect(x, y, w, h);
    }
  }
  function tree(c, x, y, size = 1, autumn = false) {
    c.save();
    c.translate(x, y);
    c.scale(size, size);
    ellipse(c, 2, 4, 11, 4, "#4a674721");
    line(c, [[0, 2], [0, -18]], "#736e4b", 2);
    ellipse(c, -5, -15, 8, 9, autumn ? "#9aaf6e" : "#6a8b63", "#58755370");
    ellipse(c, 5, -20, 9, 10, autumn ? "#b1ba79" : "#7c9c6a", "#58755370");
    ellipse(c, -1, -27, 8, 9, autumn ? "#bec286" : "#8daa72");
    line(c, [[-6, -29], [-2, -33], [2, -33]], "#c4d69a55", 1.3);
    c.restore();
  }
  function bamboo(c, x, y, size = 1) {
    c.save();
    c.translate(x, y);
    c.scale(size, size);
    for (let i = -1; i <= 1; i++) {
      line(c, [[i * 5, 3], [i * 7, -30 - i * 4]], "#708660", 1.4);
      for (let j = 0; j < 3; j++) {
        const yy = -9 - j * 8;
        line(c, [[i * 6, yy], [i * 6 + 9, yy - 6]], "#658560", 1);
        ellipse(c, i * 6 + 8, yy - 5, 5, 1.6, "#6e9064");
        ellipse(c, i * 6 - 5, yy - 5, 5, 1.6, "#849e6b");
      }
    }
    c.restore();
  }
  function stone(c, x, y, size = 1) {
    c.save();
    c.translate(x, y);
    c.scale(size, size);
    ellipse(c, 0, 3, 12, 4, "#6d745425");
    poly(c, [[-12, 0], [-8, -12], [0, -17], [11, -9], [13, 3], [1, 6]], "#a4ac98", "#899680");
    poly(c, [[-8, -12], [0, -17], [11, -9], [2, -4]], "#bec5b0");
    poly(c, [[2, -4], [11, -9], [13, 3], [1, 6]], "#909d89");
    c.restore();
  }
  function roof(c, x, y, w, h, color = "#55786e", tier = 1) {
    const edge = color === "#aa6951" ? "#714e3d" : "#36564f";
    poly(c, [[x - w / 2 - 3, y + h], [x - w / 2 + 4, y + h - 5], [x - w / 2 + 9, y], [x + w / 2 - 9, y], [x + w / 2 - 4, y + h - 5], [x + w / 2 + 3, y + h], [x, y + h + 3]], color, edge, 0.9);
    for (let i = -w / 2 + 8; i < w / 2 - 3; i += 5) line(c, [[x + i * 0.73, y + 2], [x + i, y + h - 1]], "#d5e0bf42", 0.7);
    line(c, [[x - w / 2 + 8, y + 1], [x + w / 2 - 8, y + 1]], "#314e49", 2);
    line(c, [[x - w / 2 - 3, y + h - 2], [x - w / 2 - 2, y + h], [x, y + h + 2], [x + w / 2 + 2, y + h], [x + w / 2 + 3, y + h - 2]], tier >= 3 ? "#bda65f" : "#86a095", 1.4);
  }
  function lantern(c, x, y) {
    line(c, [[x, y - 5], [x, y + 6]], "#78663b", 0.6);
    ellipse(c, x, y, 2.7, 3.6, "#ba634b");
    line(c, [[x, y - 2], [x, y + 2]], "#e2a169", 0.6);
  }
  function house(c, level, kind, color) {
    const fancy = ["shrine", "earth", "tao", "guild", "port"].includes(kind), w = fancy ? 44 : 39, h = level > 1 ? 24 : 20;
    rect(c, -w / 2 - 3, 9, w + 6, 7, "#aaad92", "#8f997f");
    rect(c, -w / 2, -h + 14, w, h, "#e5d9b5", "#9a9475");
    rect(c, w / 2 - 8, -h + 15, 8, h - 1, "#cdc5a1");
    for (const x of [-w / 2 + 3, w / 2 - 4]) rect(c, x, -h + 13, 2, h + 1, fancy ? "#9b5947" : "#897c58");
    rect(c, -5, 2, 10, 12, fancy ? "#785345" : "#665f45");
    line(c, [[0, 3], [0, 13]], "#b1976a");
    for (const x of [-14, 10]) {
      rect(c, x, -1, 6, 6, "#7b8063", "#b8a47c");
      line(c, [[x + 3, 0], [x + 3, 4]], "#d2bf8b", 0.6);
    }
    roof(c, 0, -h - 2, w + 6, 16, color, level);
    if (level >= 2 || fancy) {
      rect(c, -11, -h - 9, 22, 10, "#d6c6a1", "#8b8668");
      roof(c, 0, -h - 17, 35, 10, color, level);
    }
    if (level === 3) {
      rect(c, -8, -h - 24, 16, 8, "#d6c6a1");
      roof(c, 0, -h - 30, 27, 9, color, level);
    }
    if (fancy) {
      lantern(c, -18, 5);
      lantern(c, 18, 5);
      rect(c, -8, -9, 16, 6, "#3c5750", "#b29d69");
      c.fillStyle = "#e4d6ad";
      c.font = '4px "SimHei","Microsoft YaHei",sans-serif';
      c.textAlign = "center";
      c.fillText(GF.DEFS[kind].name, 0, -4.5);
    }
    rect(c, -9, 15, 18, 2, "#d6d6bc");
    rect(c, -11, 17, 22, 2, "#b6bca1");
  }
  function building(c, type, level = 1, time = 0, baked = false, entityOnly = false) {
    level = GF.visualLevel(level);
    c.save();
    c.lineJoin = "round";
    if (!entityOnly) ellipse(c, 2, 18, 26, 8, "#3b503728");
    if (level >= 2 && !entityOnly) {
      poly(c, [[-29, -20], [27, -20], [30, 23], [-28, 23]], "#bfc4a582", "#929f7f", 0.7);
      for (let i = 0; i < 4; i++) line(c, [[-26 + i * 17, 19], [-26 + i * 17, 23]], "#8b987b", 0.7);
    }
    if (level === 3) {
      for (const x of [-28, 28]) {
        line(c, [[x, -17], [x, 19]], "#aa985b", 1.2);
        ellipse(c, x, -17, 2, 2, "#c5ab66");
      }
      line(c, [[-26, 22], [27, 22]], "#c5ab66", 2);
    }
    if (type === "gate") {
      rect(c, -29, -12, 58, 34, "#999c8a", "#58675e");
      for (const x of [-27, 19]) {
        rect(c, x, -20, 8, 44, "#c1c4ae", "#687568");
        for (let y = -15; y < 24; y += 9) line(c, [[x, y], [x + 8, y]], "#84907d", 1);
      }
      rect(c, -18, -7, 36, 30, "#775638", "#4e4435");
      for (let x = -15; x < 18; x += 6) line(c, [[x, -6], [x, 22]], "#b29762", 1.3);
      line(c, [[0, -7], [0, 23]], "#423e31", 2);
      line(c, [[-17, 7], [17, 7]], "#5a4a33", 3);
      for (const x of [-5, 5]) ellipse(c, x, 10, 2, 2, "#d0af66");
      rect(c, -22, -23, 44, 13, "#dbccaa", "#887b5e");
      roof(c, 0, -39, 59, 17, "#55786e", level);
      if (level > 1) roof(c, 0, -49, 39, 11, "#55786e", level);
    } else if (type === "farm") {
      poly(c, [[-25, -18], [21, -18], [26, 16], [-23, 20]], "#8faf90", "#83926a", 1.2);
      for (let row = 0; row < 5; row++) {
        line(c, [[-22, -12 + row * 6], [23, -14 + row * 6]], "#bfd0a4", 1.3);
        for (let col = 0; col < 6; col++) {
          const x = -19 + col * 7, y = -9 + row * 6;
          line(c, [[x - 2, y - 5], [x, y], [x + 2, y - 5]], level === 1 ? "#62885b" : "#a29244", 1.3);
        }
      }
      if (level > 1) {
        rect(c, 19, -20, 3, 32, "#928465");
        line(c, [[14, -18], [25, -18]], "#928465", 2);
      }
      if (level === 3) houseTiny(c, -19, -16);
    } else if (type === "mulberry") {
      rect(c, -24, -14, 48, 34, "#acbb87");
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) tree(c, -16 + i * 16, -1 + j * 16, 0.58 + level * 0.06, true);
    } else if (type === "quarry") {
      poly(c, [[-25, 15], [-20, -14], [14, -20], [26, 5], [16, 19]], "#b5bba4", "#8d9882");
      stone(c, -8, 0, 0.9);
      stone(c, 11, 6, 0.9);
      stone(c, 1, -10, 0.7);
      line(c, [[-18, 15], [-12, 3]], "#7a7254", 2);
      line(c, [[-18, 5], [-7, 11]], "#687a70", 3);
      if (level > 1) stone(c, 10, -19, 0.7);
    } else if (type === "fortune") {
      ellipse(c, 0, 15, 25, 7, "#5d4e3b30");
      rect(c, -23, -10, 46, 27, "#8b5f48", "#5d493b");
      poly(c, [[-25, -10], [-18, -24], [18, -24], [25, -10]], "#527269", "#354f49", 1.2);
      rect(c, -5, -13, 10, 18, "#c4a35d", "#6f603d");
      ellipse(c, 0, -4, 3, 4, "#f0d991");
      for (const x of [-16, 16]) lantern(c, x, 8);
    } else if (type === "tower") {
      for (const x of [-15, 12]) {
        poly(c, [[x - 2, 18], [x + 1, -23], [x + 5, -23], [x + 5, 18]], "#9b865d", "#6e7356");
      }
      line(c, [[-14, 16], [16, -20]], "#a18b5e", 3);
      line(c, [[15, 16], [-12, -20]], "#a18b5e", 3);
      rect(c, -21, -25, 42, 11, "#af9866", "#6f7758");
      for (let i = -18; i <= 18; i += 9) rect(c, i, -29, 3, 14, "#746e4e");
      roof(c, 0, -42, 45, 13, "#52766d", level);
      if (level > 1) roof(c, 0, -50, 29, 9, "#52766d", level);
      line(c, [[0, -30], [17, -38]], "#624f39", 1.5);
      ellipse(c, 0, -29, 3, 4, "#48584e");
    } else if (type === "rock") {
      poly(c, [[-24, 16], [-20, -5], [20, -5], [24, 16]], "#b2b7a2", "#7e8d7b");
      rect(c, -18, -10, 36, 10, "#c8cbb3", "#8d987e");
      line(c, [[-13, 6], [0, -20], [13, 6]], "#8a7c56", 4);
      line(c, [[-9, -19], [14, -7]], "#756a4e", 4);
      stone(c, -12, -19, 0.5);
      if (level > 1) stone(c, 18, 12, 0.6);
    } else if (type === "well") {
      ellipse(c, 0, 10, 17, 9, "#afb7a3", "#7c8c7c");
      rect(c, -17, 2, 34, 9, "#adb5a0");
      ellipse(c, 0, 2, 17, 8, "#d1d6bb", "#7c8c7c");
      ellipse(c, 0, 2, 12, 5, "#638b87");
      rect(c, -19, -22, 3, 30, "#937e54");
      rect(c, 16, -22, 3, 30, "#937e54");
      roof(c, 0, -30, 45, 13, "#887c58", level);
      line(c, [[0, -14], [0, 0]], "#c4b087");
    } else if (type === "zhong") {
      rect(c, -16, 10, 32, 8, "#a7af9d", "#788978");
      rect(c, -12, 6, 24, 6, "#c3c9b1");
      poly(c, [[-12, 5], [-10, -20], [0, -28], [10, -20], [12, 5]], level === 3 ? "#b3a574" : "#7a9280", "#536c5e");
      ellipse(c, 0, -28, 7, 8, "#9bad93");
      rect(c, -8, -36, 16, 4, "#617a68");
      line(c, [[8, -11], [20, -29]], "#7a8267", 3);
      line(c, [[-6, -26], [0, -23], [5, -26]], "#4e6659", 2);
    } else {
      const color = ["wine", "kiln", "barracks"].includes(type) ? "#aa6951" : type === "tailor" ? "#85788b" : type === "tea" ? "#728260" : "#55786e";
      house(c, level, type, color);
      if (type === "tea") {
        line(c, [[24, -21], [24, 10]], "#837b51", 1.5);
        rect(c, 24, -20, 12, 18, "#e5d7ac", "#b9ad82");
        c.font = '8px "SimHei","Microsoft YaHei",sans-serif';
        c.textAlign = "center";
        c.fillStyle = "#4b6950";
        c.fillText("茶", 30, -8);
      }
      if (type === "inn") {
        line(c, [[24, -24], [24, 13]], "#837b51", 1.5);
        rect(c, 24, -23, 10, 21, "#b17455");
        c.font = '7px "SimHei","Microsoft YaHei",sans-serif';
        c.textAlign = "center";
        c.fillStyle = "#f1ddb1";
        c.fillText("宿", 29, -10);
      }
      if (type === "mill") {
        ellipse(c, 22, 6, 11, 11, "#8c8460", "#676d51");
        ellipse(c, 22, 6, 8, 8, null, "#c8ba87");
        if (!baked) buildingAnimation(c, type, time);
      }
      if (type === "wine" || type === "kiln") {
        for (let i = 0; i < 3; i++) {
          ellipse(c, 16 + i * 6, 13 - i * 2, 4, 5, type === "wine" ? "#a57c59" : "#b7c6b1", "#7b7d61");
          ellipse(c, 16 + i * 6, 8 - i * 2, 2.8, 1.5, "#616b57");
        }
      }
      if (type === "kiln") {
        rect(c, 16, -32, 6, 19, "#a18e6c");
        if (!baked) buildingAnimation(c, type, time);
      }
      if (type === "weaver" || type === "tailor") {
        line(c, [[-25, -14], [-25, 13]], "#8e7c59", 1.5);
        for (let i = 0; i < 3; i++) rect(c, -25 + i * 6, -12, 5, 18, ["#c3948d", "#b9b590", "#7f9e9c"][i]);
      }
      if (type === "barracks") {
        line(c, [[23, -37], [23, 13]], "#807449", 1.7);
        poly(c, [[24, -37], [39, -32], [24, -26]], "#ad6650");
      }
      if (type === "bank" || type === "trade") {
        for (let i = 0; i < 3; i++) {
          rect(c, 15 + i * 4, 13 - i * 4, 8, 5, "#ba9b56", "#9d8546");
          line(c, [[18 + i * 4, 14 - i * 4], [19 + i * 4, 16 - i * 4]], "#e0c377");
        }
      }
      if (type === "stage") {
        rect(c, -17, 0, 34, 14, "#977950");
        for (let i = -12; i <= 12; i += 12) {
          ellipse(c, i, 1, 2, 2, "#cfbb91");
          poly(c, [[i - 3, 5], [i + 3, 5], [i + 5, 13], [i - 5, 13]], i ? "#8e9b76" : "#b17360");
        }
      }
      if (type === "guild" || type === "port") {
        c.save();
        c.strokeStyle = "#c9ac65";
        c.lineWidth = 1.5;
        ellipse(c, 0, 19, 29, 9, null, "#c9ac65");
        if (type === "guild") {
          ellipse(c, 22, -20, 7, 7, "#ddb767", "#6f743d");
          rect(c, 20, -22, 4, 4, "#61724a", "#b18e4c");
        } else {
          c.translate(22, -21);
          c.rotate(-0.6);
          rect(c, -2, -1, 4, 12, "#b99764", "#665e47");
          rect(c, -8, -6, 16, 6, "#849a8b", "#4e695f");
        }
        c.restore();
      }
    }
    c.restore();
  }
  function buildingAnimation(c, type, time) {
    if (type === "mill") {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + time * 0.4;
        line(c, [[22, 6], [22 + 10 * Math.cos(a), 6 + 10 * Math.sin(a)]], "#c2b180", 1.5);
      }
      ellipse(c, 22, 6, 2, 2, "#706949");
    }
    if (type === "kiln") for (let i = 0; i < 3; i++) ellipse(c, 19 + Math.sin(time + i) * 3, -38 - i * 7, 3 + i, 3 + i, "#e7e7cf66");
  }
  function houseTiny(c, x, y) {
    rect(c, x - 5, y, 10, 7, "#d6d0a6");
    roof(c, x, y - 5, 16, 7, "#887a52");
  }
  function thumbnail(type, level = 1) {
    return assetUrl(buildingPath(type, level));
  }
  function makeGround(s, occupied, left, top, right, bottom, scale) {
    const size = GF.worldWidth(s), height = GF.worldHeight(s), center = GF.worldCenter(s), estate = GF.estate(s);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(((right - left + 1) * T + 96) * scale);
    canvas.height = Math.ceil(((bottom - top + 1) * T + 96) * scale);
    const c = canvas.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.scale(scale, scale);
    c.translate(48 - left * T, 48 - top * T);
    for (let y = Math.max(0, top - 1); y <= Math.min(height - 1, bottom + 1); y++) for (let x = Math.max(0, left - 1); x <= Math.min(size - 1, right + 1); x++) {
      const type = GF.terrain(x, y, s), px = x * T, py = y * T, image = artImage(`assets/tiles/terrain/${type}.png`);
      if (image.complete && image.naturalWidth) c.drawImage(image, px, py, T, T);
      if (estate && !GF.owns(s, x, y)) {
        c.save();
        c.globalAlpha = 0.095;
        const shade = artImage("assets/overlays/territory-shade.png");
        if (shade.complete && shade.naturalWidth) c.drawImage(shade, px, py, T, T);
        c.restore();
      }
    }
    if (!estate) {
      const vertical = artImage("assets/tiles/roads/ground-05.png"), horizontal = artImage("assets/tiles/roads/ground-0a.png");
      for (let y = center - 2; y <= center + 2; y++) if (vertical.complete && vertical.naturalWidth) c.drawImage(vertical, center * T, y * T, T, T);
      for (let x = center - 2; x <= center + 2; x++) if (horizontal.complete && horizontal.naturalWidth) c.drawImage(horizontal, x * T, center * T, T, T);
    } else {
      const has = (set, x, y) => x >= 0 && y >= 0 && x < size && y < height && set.has(y * size + x);
      for (const index of estate.roads) {
        const x = index % size, y = Math.floor(index / size);
        if (x < left - 1 || x > right + 1 || y < top - 1 || y > bottom + 1) continue;
        const px = x * T, py = y * T, water = GF.terrain(x, y, s) === "water";
        const north = has(estate.roads, x, y - 1), south = has(estate.roads, x, y + 1), east = has(estate.roads, x + 1, y), west = has(estate.roads, x - 1, y);
        const mask = Number(north) | Number(east) * 2 | Number(south) * 4 | Number(west) * 8, image = artImage(`assets/tiles/roads/${water ? "bridge" : "ground"}-${maskName(mask)}.png`);
        if (image.complete && image.naturalWidth) c.drawImage(image, px, py, T, T);
      }
      for (const index of estate.cells) {
        const x = index % size, y = Math.floor(index / size);
        if (x < left - 1 || x > right + 1 || y < top - 1 || y > bottom + 1) continue;
        const px = x * T, py = y * T;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (!GF.owns(s, x + dx, y + dy)) {
          const edge = artImage("assets/overlays/territory-edge.png");
          if (edge.complete && edge.naturalWidth) {
            c.save();
            c.globalAlpha = 0.6;
            if (dx) {
              c.translate(px + (dx === 1 ? T - 2 : 2), py);
              c.rotate(Math.PI / 2);
              c.drawImage(edge, 0, -2, T, 4);
            } else c.drawImage(edge, px, py + (dy === 1 ? T - 4 : 0), T, 4);
            c.restore();
          }
        }
      }
      const connects = (x, y) => GF.isWall(s, x, y) || estate.gates.some((g) => g.x === x && g.y === y);
      for (const index of estate.walls) {
        const x = index % size, y = Math.floor(index / size);
        if (x < left - 1 || x > right + 1 || y < top - 1 || y > bottom + 1) continue;
        const px = x * T, py = y * T;
        const mask = Number(connects(x, y - 1)) | Number(connects(x + 1, y)) * 2 | Number(connects(x, y + 1)) * 4 | Number(connects(x - 1, y)) * 8, image = artImage(`assets/tiles/walls/${maskName(mask)}.png`);
        if (image.complete && image.naturalWidth) c.drawImage(image, px, py, T, T);
      }
    }
    drawGroundDecorations(c, s, occupied, Math.max(0, left - 2), Math.max(0, top - 2), Math.min(size - 1, right + 2), Math.min(height - 1, bottom + 2));
    return { canvas, left, top, right, bottom, scale };
  }
  function newGround(s, occupied) {
    const size = GF.worldWidth(s), height = GF.worldHeight(s), estate = GF.estate(s), waterRows = Array.from({ length: height }, () => []);
    for (let y = 0; y < height; y++) for (let x = 0; x < size; x++) if (GF.terrain(x, y, s) === "water" && !GF.isWall(s, x, y) && !estate.roads.has(y * size + x)) waterRows[y].push({ x, outside: !GF.owns(s, x, y) });
    return { occupied: new Set(occupied), chunks: /* @__PURE__ */ new Map(), waterRows };
  }
  function drawGroundDecorations(ctx, s, occupied, left, top, right, bottom) {
    const size = GF.worldWidth(s), height = GF.worldHeight(s), estate = GF.estate(s);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (occupied.has(x + "," + y) || GF.isWall(s, x, y) || (estate == null ? void 0 : estate.roads.has(y * size + x))) continue;
      const type = GF.terrain(x, y, s);
      ctx.save();
      ctx.translate(x * T + 32, y * T + 32);
      const outside = !!estate && !GF.owns(s, x, y);
      if (outside) ctx.globalAlpha = 0.78;
      if (type === "forest") {
        const image = artImage("assets/tiles/resources/forest.png");
        if (image.complete && image.naturalWidth) ctx.drawImage(image, -64, -64, 128, 128);
      }
      if (type === "mountain") {
        const image = artImage("assets/tiles/resources/mountain.png");
        if (image.complete && image.naturalWidth) ctx.drawImage(image, -64, -64, 128, 128);
      }
      if (type === "plain" && (x === 0 || y === 0 || x === size - 1 || y === height - 1) && noise(x, y) > 0.35) {
        ctx.translate(0, 8);
        const scale = 0.8 + noise(x, y) * 0.5;
        ctx.scale(scale, scale);
        const image = artImage("assets/tiles/resources/border-tree.png");
        if (image.complete && image.naturalWidth) ctx.drawImage(image, -64, -72, 128, 128);
      }
      if (type === "water") {
        if (noise(x, y) > 0.65) {
          const image = artImage("assets/tiles/resources/reeds.png");
          if (image.complete && image.naturalWidth) ctx.drawImage(image, -32, -32, 64, 64);
        }
      }
      ctx.restore();
    }
  }
  function updateGround(s, occupied) {
    const changed = [...ground.occupied].filter((k) => !occupied.has(k)).concat([...occupied].filter((k) => !ground.occupied.has(k)));
    for (const key of changed) {
      const [x, y] = key.split(",").map(Number);
      for (const [id, tile] of ground.chunks) if (x >= tile.left - 2 && x <= tile.right + 2 && y >= tile.top - 2 && y <= tile.bottom + 2) ground.chunks.delete(id);
    }
    ground.occupied = new Set(occupied);
  }
  let ground, groundSeed;
  function healthBarY(b) {
    const type = b.type, level = GF.visualLevel(b.level);
    if (type === "gate") return level > 1 ? -56 : -46;
    if (type === "farm") return -26;
    if (type === "mulberry") return -31;
    if (type === "quarry" || type === "rock") return -34;
    if (type === "tower") return level > 1 ? -57 : -49;
    if (type === "well") return -37;
    if (type === "zhong") return -43;
    if (level === 3) return -61;
    if (level === 2) return -48;
    return ["shrine", "earth", "tao", "guild", "port", "barracks"].includes(type) ? -44 : -29;
  }
  function influenceBounds(s, b) {
    const d = GF.DEFS[b.type];
    if (d.cat !== "economy" && b.type !== "well" && b.type !== "earth") return null;
    const radius = d.cat === "economy" ? d.radius : b.type === "earth" ? d.range : 1;
    if (radius === 0) return null;
    const x = Math.max(2, (b.x - radius) * T + 2), y = Math.max(2, (b.y - radius) * T + 2);
    const right = Math.min(GF.worldWidth(s) * T - 2, (b.x + radius + 1) * T - 2), bottom = Math.min(GF.worldHeight(s) * T - 2, (b.y + radius + 1) * T - 2);
    return { x, y, width: right - x, height: bottom - y };
  }
  function directChainLink(consumer, producer) {
    var _a;
    const d = GF.DEFS[consumer.type];
    if (consumer.owner !== producer.owner || !d.radius || GF.dist8(consumer.x, consumer.y, producer.x, producer.y) > d.radius) return false;
    return d.prev === producer.type || !!((_a = d.required) == null ? void 0 : _a.includes(producer.type));
  }
  function selectedLinks(s, b) {
    return s.buildings.filter((n) => n !== b && (directChainLink(b, n) || directChainLink(n, b)));
  }
  function drawLinks(c, s, visible) {
    c.save();
    c.setLineDash([4, 5]);
    c.globalAlpha = s.phase === "night" ? 0.92 : 0.82;
    const list = s.buildings;
    for (let i = 0; i < list.length; i++) {
      const b = list[i], d = GF.DEFS[b.type];
      if (!d.radius) continue;
      for (let j = i + 1; j < list.length; j++) {
        const n = list[j];
        if (!directChainLink(b, n) && !directChainLink(n, b)) continue;
        if (visible && !visible(b.x * T + 32, b.y * T + 32, 120) && !visible(n.x * T + 32, n.y * T + 32, 120)) continue;
        const nd = GF.DEFS[n.type], chain = d.chain || nd.chain;
        const color = { 商: "#9c8052", 农: "#6e875b", 丝: "#96758c", 工: "#648388" }[chain] || "#9b8660";
        const sx = b.x * T + 32, sy = b.y * T + 37, tx = n.x * T + 32, ty = n.y * T + 37, dx = tx - sx, dy = ty - sy, length = Math.hypot(dx, dy), trim = 12;
        if (length > trim * 2) {
          c.save();
          c.translate(sx + dx / length * trim, sy + dy / length * trim);
          c.rotate(Math.atan2(dy, dx));
          const name = { 商: "commerce", 农: "farm", 丝: "silk", 工: "industry" }[chain] || "default";
          GFUI.tile(c, "assets/overlays/links/" + name + ".png", 0, -2, length - trim * 2, 4);
          c.restore();
        }
      }
    }
    c.restore();
  }
  function drawSelection(c, s, selected) {
    if (!selected) return;
    const b = GF.at(s, selected.x, selected.y);
    if (!b || b.type !== "tower") return;
    const radius = (GF.DEFS.tower.range + (b.level - 1) * 0.35) * T;
    c.save();
    c.globalAlpha = 0.3;
    png(c, "overlays/range", b.x * T + 32 - radius, b.y * T + 32 - radius, radius * 2, radius * 2);
    c.restore();
  }
  function render(canvas, s, cam, selected, options = {}) {
    var _a, _b;
    const size = GF.worldWidth(s), height = GF.worldHeight(s), estate = GF.estate(s), cacheKey = JSON.stringify([s.mapSeed, s.rotation, size, height, s.mapGeneration, s.mode, s.enemyCount]);
    const animationTime = (_a = options.animationTime) != null ? _a : s.elapsed, playerOwner = (_b = options.player) != null ? _b : 0, player = GF.playerView(s, playerOwner);
    const upgradeBob = reducedMotion || options.reducedMotion === true ? 0 : Math.sin(animationTime * Math.PI) * 3;
    const hintKey = JSON.stringify([cacheKey, player.actorId, s.over, s.day, player.buildings.map((b) => [b.type, b.x, b.y, b.level, b.owner])]);
    let hints = hintCaches.get(s);
    if (!hints || hints.key !== hintKey) {
      hints = { key: hintKey, tiles: /* @__PURE__ */ new Map() };
      hintCaches.set(s, hints);
    }
    const blockedHints = /* @__PURE__ */ new Set();
    for (const e of GF.hostileUnits(player)) for (let y = Math.floor(e.y) - 1; y <= Math.ceil(e.y) + 1; y++) for (let x = Math.floor(e.x) - 1; x <= Math.ceil(e.x) + 1; x++) {
      if (Math.hypot(e.x - x, e.y - y) < 0.65) blockedHints.add(y * size + x);
    }
    const occupied = new Set(s.buildings.map((b) => b.x + "," + b.y));
    if (!ground || groundSeed !== cacheKey) {
      ground = newGround(s, occupied);
      groundSeed = cacheKey;
    } else updateGround(s, occupied);
    const c = canvas.getContext("2d"), w = canvas.clientWidth, h = canvas.clientHeight, dpr = canvas.width / w;
    const night = false, dusk = false;
    const left = Math.max(0, Math.floor(-cam.x / cam.zoom / T) - 1), right = Math.min(size - 1, Math.ceil((w - cam.x) / cam.zoom / T) + 1), top = Math.max(0, Math.floor(-cam.y / cam.zoom / T) - 1), bottom = Math.min(height - 1, Math.ceil((h - cam.y) / cam.zoom / T) + 1);
    const visible = (x, y, rx, ry = rx) => x + rx >= -cam.x / cam.zoom && x - rx <= (w - cam.x) / cam.zoom && y + ry >= -cam.y / cam.zoom && y - ry <= (h - cam.y) / cam.zoom;
    const showBuildingLabels = cam.zoom >= 0.9;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    png(c, "scenery/world-background", 0, 0, w, h);
    c.save();
    c.translate(cam.x, cam.y);
    c.scale(cam.zoom, cam.zoom);
    if (cam.y / cam.zoom > -1 || (h - cam.y) / cam.zoom > height * T) {
      c.save();
      c.globalAlpha = 0.3;
      for (let i = Math.max(0, Math.floor((-cam.x / cam.zoom + 20) / 99)); i < Math.ceil(size * T / 99) + 5 && i * 99 - 180 < (w - cam.x) / cam.zoom; i++) {
        const x = i * 99 - 180;
        if (cam.y / cam.zoom > -1) png(c, "scenery/mountain-" + (i % 4 + 1), x, -245, 160, 240);
        if ((h - cam.y) / cam.zoom > height * T) png(c, "scenery/mountain-" + (i % 4 + 1), x - 90, height * T + 10, 180, 170);
      }
      c.restore();
    }
    const scale = cam.zoom < 0.3 ? 0.25 : cam.zoom < 0.65 ? 0.5 : 1;
    for (let cy = Math.floor(top / 16); cy <= Math.floor(bottom / 16); cy++) for (let cx = Math.floor(left / 16); cx <= Math.floor(right / 16); cx++) {
      const key = cx + "," + cy + "," + scale;
      let tile = ground.chunks.get(key);
      if (!tile) {
        tile = makeGround(s, occupied, cx * 16, cy * 16, Math.min(size - 1, cx * 16 + 15), Math.min(height - 1, cy * 16 + 15), scale);
        ground.chunks.set(key, tile);
      } else {
        ground.chunks.delete(key);
        ground.chunks.set(key, tile);
      }
      const tw = (tile.right - tile.left + 1) * T, th = (tile.bottom - tile.top + 1) * T;
      c.drawImage(tile.canvas, 48 * scale, 48 * scale, tw * scale, th * scale, tile.left * T, tile.top * T, tw, th);
    }
    while (ground.chunks.size > 40) ground.chunks.delete(ground.chunks.keys().next().value);
    if (options.grid) {
      c.save();
      c.globalAlpha = 0.45;
      GFUI.tile(c, "assets/overlays/grid.png", left * T, top * T, (right - left + 1) * T, (bottom - top + 1) * T);
      c.restore();
    }
    c.save();
    for (const outside of [false, true]) {
      c.globalAlpha = outside ? 0.38 : 0.5;
      for (let y = top; y <= bottom; y++) for (const tile of ground.waterRows[y]) {
        const x = tile.x, cx = x * T + 32, cy = y * T + 32;
        if (tile.outside !== outside || x < left || x > right || occupied.has(x + "," + y) || !visible(cx, cy, 22, 11)) continue;
        const off = Math.sin(animationTime * 0.8 + x + y) * 2;
        png(c, "effects/water-ripple", cx - 16 + off, cy - 10, 32, 20);
      }
    }
    c.restore();
    drawLinks(c, s, visible);
    if (selected) {
      const px = selected.x * T, py = selected.y * T;
      png(c, "overlays/selection", px, py, T, T);
      if (!GF.at(s, selected.x, selected.y)) png(c, "overlays/placement", px, py, T, T);
    }
    for (const b of s.buildings.filter((b2) => visible(b2.x * T + 32, b2.y * T + 32, 64, 96)).sort((a, b2) => a.y - b2.y)) {
      c.save();
      c.translate(b.x * T + 32, b.y * T + 32);
      const buildingImage = artImage(buildingPath(b.type, b.level));
      if (buildingImage.complete && buildingImage.naturalWidth) {
        c.imageSmoothingEnabled = false;
        c.drawImage(buildingImage, -64, -96, 128, 128);
      }
      if (b.type === "shrine" && !showBuildingLabels) {
        panel(c, s.players[b.owner].team === 1 ? "map-enemy" : b.owner === options.player ? "map-primary" : "map-ally", -38, -57, 76, 19);
        c.font = 'bold 12px "SimHei","Microsoft YaHei",sans-serif';
        c.textAlign = "center";
        c.fillStyle = "#fff4d9";
        c.fillText(b.owner === options.player ? "你的庄园" : s.players[b.owner].team === 0 ? "队友庄园" : "敌方庄园 " + (b.owner + 1), 0, -43);
      }
      if (b.type === "gate" && b.hp <= 0) png(c, "overlays/gate-broken", -32, -17, 64, 48);
      if (b.type === "shrine" && s.buildings.length === 1) {
        const r = 32 + Math.sin(s.elapsed) * 2;
        png(c, "overlays/aura", -r, 7, r * 2, 24);
      }
      if (b.hp < GF.maxHP(b)) {
        const y = healthBarY(b);
        health(c, -21, y, 42, 4, b.hp / GF.maxHP(b), b.hp / GF.maxHP(b) > 0.35 ? "building" : "critical");
      }
      const canUpgrade = b.type === "barracks" && b.level === 1 ? ["infantry", "archer"].some((troopType) => !GF.upgradeReason(player, b, false, { troopType })) : !GF.upgradeReason(player, b);
      if (canUpgrade) {
        png(c, "ui/icons/upgrade", 6, -23 + upgradeBob, 24, 24);
      }
      const levelLabel = String(b.level), badgeWidth = 16, badgeX = 25 - badgeWidth;
      png(c, "overlays/level-badge", badgeX, 5, 16, 16);
      c.fillStyle = "#f4ebd2";
      c.font = '900 11px "SimHei","Microsoft YaHei",sans-serif';
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(levelLabel, badgeX + badgeWidth / 2, 13);
      c.textBaseline = "alphabetic";
      if (showBuildingLabels && b.type !== "gate") {
        const label = b.type === "barracks" ? GF.name(b) : GF.DEFS[b.type].name;
        c.font = '9px "SimHei","Microsoft YaHei",sans-serif';
        c.textAlign = "center";
        const text = c.measureText(label), labelWidth = text.width + 14, labelTop = 18, labelHeight = 20;
        panel(c, "map-paper", -labelWidth / 2, labelTop, labelWidth, labelHeight);
        c.fillStyle = "#4a2e20";
        c.fillText(label, 0, labelTop + (labelHeight + text.actualBoundingBoxAscent - text.actualBoundingBoxDescent) / 2);
      }
      if (GF.DEFS[b.type].end) png(c, "ui/icons/diamond", -29, 8, 12, 12);
      c.restore();
    }
    let soldierMotion = soldierMotionCaches.get(s);
    if (!soldierMotion) {
      soldierMotion = { facing: /* @__PURE__ */ new Map(), positions: /* @__PURE__ */ new Map(), walking: /* @__PURE__ */ new Map(), health: /* @__PURE__ */ new Map(), hitUntil: /* @__PURE__ */ new Map(), attacks: /* @__PURE__ */ new Map(), attackCooldowns: /* @__PURE__ */ new Map(), samples: /* @__PURE__ */ new Map(), spacing: /* @__PURE__ */ new Map() };
      soldierMotionCaches.set(s, soldierMotion);
    }
    soldierMotion.spacing || (soldierMotion.spacing = /* @__PURE__ */ new Map());
    const allUnits = [];
    for (const source of s.soldiers) {
      if (source.hp <= 0) continue;
      let unit = source;
      if (options.unitPosition) {
        const position = options.unitPosition(source, s.players[source.owner].team === 0);
        unit = __spreadValues(__spreadValues({}, source), position);
      } else if (options.animationTime !== void 0) {
        let sample = soldierMotion.samples.get(source.id);
        if (!sample) sample = { fromX: source.x, fromY: source.y, x: source.x, y: source.y, time: s.elapsed, duration: 0 };
        else if (source.x !== sample.x || source.y !== sample.y) {
          const duration = Math.max(1 / 120, s.elapsed - sample.time);
          sample = { fromX: sample.x, fromY: sample.y, x: source.x, y: source.y, time: s.elapsed, duration };
        } else if (s.elapsed !== sample.time) sample = { fromX: source.x, fromY: source.y, x: source.x, y: source.y, time: s.elapsed, duration: 0 };
        soldierMotion.samples.set(source.id, sample);
        const progress = sample.duration ? Math.max(0, Math.min(1, (animationTime - sample.time) / sample.duration)) : 1;
        unit = __spreadProps(__spreadValues({}, source), { x: sample.fromX + (sample.x - sample.fromX) * progress, y: sample.fromY + (sample.y - sample.fromY) * progress });
      }
      allUnits.push({ unit, base: { x: unit.x, y: unit.y }, soldier: s.players[source.owner].team === 0 });
    }
    const pushes = allUnits.map(() => ({ x: 0, y: 0 }));
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < allUnits.length; i++) for (let j = i + 1; j < allUnits.length; j++) {
      let dx = (allUnits[i].unit.x - allUnits[j].unit.x) * T + pushes[i].x - pushes[j].x;
      let dy = (allUnits[i].unit.y - allUnits[j].unit.y) * T + pushes[i].y - pushes[j].y;
      let distance = Math.hypot(dx, dy);
      const minimum = allUnits[i].unit.boss || allUnits[j].unit.boss ? 22 : 18;
      if (distance >= minimum) continue;
      if (distance < 1e-3) {
        const hash = (Math.imul((allUnits[i].unit.id || i) + 1, 1103515245) ^ Math.imul((allUnits[j].unit.id || j) + 1, 12345)) >>> 0;
        const angle = hash / 4294967296 * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }
      const force = (minimum - distance) * 0.5 / distance;
      pushes[i].x += dx * force;
      pushes[i].y += dy * force;
      pushes[j].x -= dx * force;
      pushes[j].y -= dy * force;
    }
    for (let i = 0; i < allUnits.length; i++) {
      const item = allUnits[i], limit = item.unit.boss ? 14 : 10, length = Math.hypot(pushes[i].x, pushes[i].y);
      if (length > limit) {
        pushes[i].x *= limit / length;
        pushes[i].y *= limit / length;
      }
      const target = { x: pushes[i].x / T, y: pushes[i].y / T }, previous = soldierMotion.spacing.get(item.unit.id);
      let spacing = target;
      if (previous) {
        const dt = Math.max(0, Math.min(0.1, animationTime - previous.time)), blend = 1 - Math.exp(-dt * 18);
        spacing = { x: previous.x + (target.x - previous.x) * blend, y: previous.y + (target.y - previous.y) * blend };
      }
      soldierMotion.spacing.set(item.unit.id, __spreadProps(__spreadValues({}, spacing), { time: animationTime }));
      item.unit = __spreadProps(__spreadValues({}, item.unit), { x: item.unit.x + spacing.x, y: item.unit.y + spacing.y });
    }
    const units = allUnits.filter(({ unit }) => visible(unit.x * T + 32, unit.y * T + 32, unit.boss ? 38 : 24, unit.boss ? 76 : 52));
    units.sort((a, b) => a.unit.y - b.unit.y);
    const unitById = new Map(s.soldiers.map((unit) => [unit.id, unit])), buildingById = new Map(s.buildings.map((building2) => [building2.id, building2]));
    for (const { unit } of units) {
      const previousHp = soldierMotion.health.get(unit.id);
      if (previousHp !== void 0 && unit.hp < previousHp) {
        soldierMotion.hitUntil.set(unit.id, animationTime + 0.2);
        if (options.online) {
          let attacker = null, best = 0.8;
          for (const item of units) {
            if (s.players[item.unit.owner].team === s.players[unit.owner].team) continue;
            const distance = Math.hypot(item.unit.x - unit.x, item.unit.y - unit.y);
            if (distance < best || distance === best && (!attacker || item.unit.id < attacker.id)) {
              attacker = item.unit;
              best = distance;
            }
          }
          if (attacker) soldierMotion.attacks.set(attacker.id, animationTime);
        }
      }
      soldierMotion.health.set(unit.id, unit.hp);
    }
    for (const { unit: e, base, soldier } of units) {
      const archer = GF.troopType(e) === "archer", interval = GF.troopDef(e).interval;
      const previousAttack = soldierMotion.attackCooldowns.get(e.id);
      if (options.online) {
        if (e.attackAt > 0 && e.attackAt !== previousAttack) soldierMotion.attacks.set(e.id, animationTime - Math.max(0, s.elapsed - e.attackAt));
        soldierMotion.attackCooldowns.set(e.id, e.attackAt);
      } else {
        if (e.attack > 0 && (previousAttack === void 0 || e.attack > previousAttack + 1e-4)) soldierMotion.attacks.set(e.id, s.elapsed - (interval - e.attack));
        soldierMotion.attackCooldowns.set(e.id, e.attack);
      }
      const previous = soldierMotion.positions.get(e.id), goal = unitById.get(e.targetId) || buildingById.get(e.targetBuildingId) || e.waypoint;
      let dx = previous ? base.x - previous.x : 0, dy = previous ? base.y - previous.y : 0;
      if ((Math.abs(dx) + Math.abs(dy) <= 1e-3 || archer) && goal) {
        dx = goal.x - base.x;
        dy = goal.y - base.y;
      }
      if (Math.abs(dx) + Math.abs(dy) > 1e-3) {
        const current = soldierMotion.facing.get(e.id) || "front";
        soldierMotion.facing.set(e.id, soldierFacing(dx, dy, current));
      }
      const moved = !!previous && Math.hypot(base.x - previous.x, base.y - previous.y) > 1e-4;
      let walk = soldierMotion.walking.get(e.id);
      if (moved && !e.repelled) {
        if (!walk || animationTime >= walk.until) walk = { started: animationTime, until: animationTime + 0.3 };
        else walk.until = walk.started + (Math.floor((animationTime - walk.started) / 0.3) + 1) * 0.3;
        soldierMotion.walking.set(e.id, walk);
      }
      soldierMotion.positions.set(e.id, { x: base.x, y: base.y });
      const bounce = walk && animationTime < walk.until && !e.repelled && !reducedMotion ? soldierWalkBounce(animationTime - walk.started) : { stretch: 0, lift: 0 };
      const faction = s.players[e.owner].team !== s.players[playerOwner].team ? "enemy" : e.owner === playerOwner ? "player" : "ally";
      const direction = soldierMotion.facing.get(e.id) || "front", localAttack = soldierMotion.attacks.get(e.id), attackCooldown = localAttack !== void 0 ? 1 - (animationTime - localAttack) : archer ? 0 : e.attack;
      const attackAngle = !archer && !reducedMotion && !e.repelled ? soldierAttackAngle(attackCooldown, direction) : 0, hit = animationTime < (soldierMotion.hitUntil.get(e.id) || 0);
      c.save();
      c.translate(e.x * T + 32, e.y * T + 32);
      if (e.boss) c.scale(1.6, 1.6);
      c.save();
      c.rotate(attackAngle);
      if (archer && !reducedMotion && !e.repelled && localAttack !== void 0) {
        const elapsed = animationTime - localAttack, recoil = elapsed >= 0 && elapsed < 0.15 ? 2 * Math.sin(elapsed / 0.15 * Math.PI) : 0;
        c.translate(direction === "left" ? recoil : direction === "right" ? -recoil : 0, direction === "back" ? recoil : direction === "front" ? -recoil : 0);
      }
      soldierSprite(c, soldierAtlases[GF.troopType(e) + "_" + faction], e.level, direction, soldier ? "soldier" : "enemy-soldier", animationTime, e.repelled > 0, bounce, hit);
      c.restore();
      if (e.slowed > 0) png(c, "overlays/slow", -13, -3, 26, 10);
      c.restore();
    }
    for (const { unit: e, soldier } of units) {
      c.save();
      c.translate(e.x * T + 32, e.y * T + 32);
      if (e.boss) c.scale(1.6, 1.6);
      health(c, -14, -43, 28, 5, e.hp / e.maxHp, soldier ? "player" : "enemy");
      c.restore();
    }
    if (night || dusk) {
      c.fillStyle = night ? "#19395878" : "#ac723222";
      c.fillRect(left * T, top * T, (right - left + 1) * T, (bottom - top + 1) * T);
      if (night) {
        const glow = nightGlow();
        c.globalCompositeOperation = "screen";
        for (const b of s.buildings) {
          if (!visible(b.x * T + 32, b.y * T + 36, 64)) continue;
          if (["shrine", "earth", "tao", "tower", "inn"].includes(b.type)) c.drawImage(glow, b.x * T + 32 - 64, b.y * T + 36 - 64, 128, 128);
        }
        c.globalCompositeOperation = "source-over";
      }
    }
    const hintPulse = reducedMotion || options.reducedMotion === true ? 1 : 1 + 0.035 * Math.sin(animationTime * 2.4);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const tile = y * size + x;
      if (occupied.has(x + "," + y) || blockedHints.has(tile) || !visible(x * T + 32, y * T + 32, 29)) continue;
      let best = hints.tiles.get(tile);
      if (!hints.tiles.has(tile)) {
        let bestIncome = -Infinity;
        best = null;
        const town = player;
        for (const hint of GF.buildHints(town, x, y, true)) {
          if (hint.resource !== "coins" && hint.resource !== "materials") continue;
          const preview = { type: hint.type, x, y, level: 1 };
          const shadow = __spreadProps(__spreadValues({}, town), { buildings: [...town.buildings, preview] }), income = GF.income(shadow, preview);
          if (!best || income > bestIncome || income === bestIncome && (hint.tier > best.tier || hint.tier === best.tier && hint.resource === "coins" && best.resource !== "coins")) {
            best = hint;
            bestIncome = income;
          }
        }
        hints.tiles.set(tile, best);
      }
      if (!best) continue;
      c.save();
      c.translate(x * T + 32, y * T + 32);
      c.scale(hintPulse, hintPulse);
      c.globalAlpha = 0.7;
      png(c, `overlays/hints/${best.resource}-tier-${best.tier}`, -32, -32, 64, 64);
      c.restore();
    }
    drawSelection(c, s, selected);
    for (const p of options.projectiles || s.projectiles) {
      const f = 1 - p.life / p.total, x = (p.x + (p.tx - p.x) * f) * T + 32, y = (p.y + (p.ty - p.y) * f) * T + 22;
      if (!visible(x, y, Math.abs((p.tx - p.x) * 5) + 5, Math.abs((p.ty - p.y) * 5) + 40)) continue;
      if (p.type === "rock") png(c, "effects/rock", x - 4, y - 4 - Math.sin(f * Math.PI) * 35, 8, 8);
      else {
        c.save();
        c.translate(x, y);
        c.rotate(Math.atan2(p.ty - p.y, p.tx - p.x));
        png(c, "effects/" + (p.type === "archer" ? "arrow" : "bolt"), -18, -2, 20, 5);
        c.restore();
      }
    }
    for (const e of options.effects || s.effects) {
      const x = e.x * T + 32, y = e.y * T + 32, f = 1 - e.life / e.total;
      const radius = ["income", "coin"].includes(e.type) ? Math.max(64, ("+" + e.amount).length * 14 / cam.zoom) : ["hit", "soldier-hit"].includes(e.type) ? 24 : e.type === "thunder" ? 120 : 24 + f * 480;
      if (!visible(x, y, radius)) continue;
      c.save();
      c.globalAlpha = 1 - f;
      if (e.type === "thunder") png(c, "effects/thunder", x - 26, y - 120, 52, 120);
      else if (e.type === "zhong-pulse") {
        const rx = 24 + f * 480, ry = 16 + f * 480;
        png(c, "overlays/pulse", x - rx, y - ry, rx * 2, ry * 2);
      } else if (e.type === "income" || e.type === "coin") {
        c.globalAlpha = Math.min(1, (1 - f) * 3);
        c.translate(x, y - (e.type === "income" ? 4 : 20) - f * 24);
        c.scale(Math.max(1, 1 / cam.zoom), Math.max(1, 1 / cam.zoom));
        c.font = 'bold 13px "SimHei","Microsoft YaHei",sans-serif';
        c.textAlign = "left";
        const label = "+" + e.amount, tw = c.measureText(label).width, start = -(tw + 18) / 2;
        c.lineWidth = 3;
        c.strokeStyle = "#3e573ae0";
        c.strokeText(label, start, 0);
        c.fillStyle = "#ffecb1";
        c.fillText(label, start, 0);
        const cx = start + tw + 10;
        png(c, "ui/icons/" + (e.resource === "materials" ? "materials" : "coin"), cx - 8, -13, 16, 16);
      } else if (e.type === "soldier-hit") png(c, "effects/soldier-hit", x - 12 + f * 4, y - 14 + f * 4, 24, 24);
      else if (e.type === "hit") png(c, "effects/hit", x - 20, y - 20, 40, 40);
      else {
        const r = 20 + f * 450;
        png(c, "overlays/" + (e.type === "repair" ? "repair" : "repel"), x - r, y - r, r * 2, r * 2);
      }
      c.restore();
    }
    c.restore();
    if (!night) {
      c.save();
      c.globalAlpha = 0.6;
      for (let i = 0; i < 2; i++) {
        const x = (animationTime * 8 + i * 37 + w * 0.67) % (w + 100) - 50, y = h * 0.31 + Math.sin(animationTime * 0.12 + i) * 15 + i * 12;
        png(c, "effects/swallow", x - 8, y - 4, 16, 8);
      }
      c.restore();
    }
  }
  function person(c, type, time, frozen) {
    const bob = frozen ? 0 : Math.sin(time * 8) * 1.5;
    ellipse(c, 1, 10, 9, 3, "#273d3b38");
    if (type === "fox") {
      poly(c, [[-6, 4], [-17, -5], [-13, 7], [-5, 10]], "#c5a381");
      ellipse(c, 1, 3 + bob, 8, 5, "#c69a77");
      poly(c, [[4, 0 + bob], [5, -9 + bob], [9, -4 + bob], [13, -9 + bob], [13, 1 + bob]], "#d8b891", "#996d56");
      rect(c, 7, -2 + bob, 1.5, 1.5, "#565246");
    } else {
      const color = type === "ghost" ? "#849b9c" : type === "soldier" ? "#4f8b9a" : "#b75548";
      poly(c, [[-5, -3 + bob], [5, -3 + bob], [8, 9], [-7, 9]], color, "#52605b");
      ellipse(c, 0, -8 + bob, 4.5, 5, type === "ghost" ? "#b4c8bb" : "#c6b592");
      rect(c, -5, -13 + bob, 10, 3, type === "soldier" ? "#32677c" : "#8c3f35");
      line(c, [[-3, 9], [-4, 14 + bob]], "#4c5851", 2);
      line(c, [[3, 9], [5, 14 - bob]], "#4c5851", 2);
      line(c, [[7, 1], [10, -11]], type === "ghost" ? "#a5c3b5" : "#bec1a7", 2);
    }
    if (frozen) {
      ellipse(c, 0, -1, 14, 19, null, "#e9d28d");
      c.fillStyle = "#eddda5";
      c.font = '10px "SimHei","Microsoft YaHei",sans-serif';
      c.textAlign = "center";
      c.fillText("封", 0, -18);
    }
  }
  function soldierWalkBounce(time) {
    const phase = (time % 0.3 + 0.3) % 0.3, amount = phase < 0.1 ? phase / 0.1 : 1 - (phase - 0.1) / 0.2, value = 2 * Math.max(0, Math.min(1, amount));
    return { stretch: value, lift: value };
  }
  function soldierAttackAngle(cooldown, direction) {
    if (!(cooldown > 0 && cooldown <= 1)) return 0;
    const elapsed = 1 - cooldown, amount = elapsed < 0.05 ? elapsed / 0.05 : elapsed < 0.1 ? 1 - (elapsed - 0.05) / 0.05 : 0, degrees = 20 * Math.max(0, amount);
    return degrees * (direction === "left" || direction === "back" ? -1 : 1) * Math.PI / 180;
  }
  function soldierSprite(c, atlas, level, direction, fallback, time, frozen, bounce = { stretch: 0, lift: 0 }, hit = false) {
    if (!atlas.complete || !atlas.naturalWidth) return;
    const directionIndex = { front: 0, back: 1, left: 2, right: 3 }, safeLevel = Math.max(1, Math.min(9, level || 1));
    const row = Math.floor((safeLevel - 1) / 3), col = (safeLevel - 1) % 3 * 4 + directionIndex[direction];
    c.save();
    c.imageSmoothingEnabled = false;
    if (hit) c.filter = "brightness(0) invert(1)";
    c.drawImage(atlas, col * 20, row * 30, 20, 30, -16, -45 - bounce.stretch - bounce.lift, 32, 48 + bounce.stretch);
    c.restore();
    if (frozen) {
      png(c, "overlays/freeze", -14, -40, 28, 48);
      c.fillStyle = "#eddda5";
      c.font = '8px "SimHei","Microsoft YaHei",sans-serif';
      c.textAlign = "center";
      c.fillText("封", 0, -43);
    }
  }
  function assetCanvas(width, height, paint) {
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    paint(source.getContext("2d"));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const c = canvas.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.drawImage(source, 0, 0, width, height, 0, 0, 64, 64);
    const pixels = c.getImageData(0, 0, 64, 64);
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = pixels.data[i] < 128 ? 0 : 255;
    c.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  }
  function paintTerrainTile(c, type) {
    rect(c, 0, 0, T, T, palette[type]);
    for (let j = 0; j < 9; j++) {
      const gx = noise(3, 7, j + 2) * 60 + 2, gy = noise(7, 3, j + 31) * 60 + 2;
      if (type === "water") line(c, [[gx - 3, gy], [gx + 4, gy]], "#d1e1c65c", 0.8);
      else if (type === "shore") ellipse(c, gx, gy, 1.2, 0.7, "#9eaa873f");
      else line(c, [[gx - 2, gy - 2], [gx, gy + 1], [gx + 2, gy - 3]], "#81986238", 0.8);
    }
    if (type === "shore") for (let j = 0; j < 3; j++) {
      const gx = 10 + noise(3, 7, j + 65) * 44, gy = 10 + noise(7, 3, j + 81) * 44;
      line(c, [[gx - 2, gy + 4], [gx, gy - 2], [gx + 2, gy + 4]], "#a9ad765c", 0.9);
    }
    if (type === "water") {
      ellipse(c, 17, 38, 4, 2, "#9fb993");
      ellipse(c, 24, 41, 3, 1.8, "#9db88e");
    }
  }
  function paintConnectedTile(c, mask, kind) {
    const north = mask & 1, east = mask & 2, south = mask & 4, west = mask & 8;
    if (kind === "wall") {
      c.beginPath();
      c.rect(19, 19, 26, 26);
      if (north) c.rect(19, 0, 26, 32);
      if (south) c.rect(19, 32, 26, 32);
      if (west) c.rect(0, 19, 32, 26);
      if (east) c.rect(32, 19, 32, 26);
      c.fillStyle = "#667367";
      c.shadowColor = "#34463866";
      c.shadowBlur = 4;
      c.shadowOffsetY = 3;
      c.fill();
      c.shadowColor = "transparent";
      c.strokeStyle = "#4b5c51";
      c.lineWidth = 3;
      c.stroke();
      c.clip();
      rect(c, 0, 0, T, T, "#b7bba7");
      for (let row = 0; row < 8; row++) {
        const yy = row * 8;
        line(c, [[0, yy], [T, yy]], "#788775", 1);
        for (let col = 0; col < 5; col++) {
          const xx = col * 16 + row % 2 * 8;
          line(c, [[xx, yy], [xx, yy + 8]], "#87927e", 1);
        }
      }
      return;
    }
    c.beginPath();
    c.rect(21, 21, 22, 22);
    if (north) c.rect(21, 0, 22, 32);
    if (south) c.rect(21, 32, 22, 32);
    if (west) c.rect(0, 21, 32, 22);
    if (east) c.rect(32, 21, 32, 22);
    c.clip();
    rect(c, 0, 0, T, T, kind === "bridge" ? "#ad9063" : "#dfd5b494");
    if (kind === "bridge") for (let i = 0; i < T; i += 7) {
      if (north || south || !east && !west) line(c, [[19, i], [45, i]], "#655c43", 1.5);
      if (east || west) line(c, [[i, 19], [i, 45]], "#655c43", 1.5);
    }
  }
  function exportPngAssets(options = {}) {
    const assets = {};
    for (const type of options.buildingType ? [options.buildingType] : Object.keys(GF.DEFS)) for (let level = 1; level <= 3; level++) assets[`assets/sprites/buildings/${type}/level-${level}.png`] = assetCanvas(128, 128, (c) => {
      c.translate(64, 96);
      building(c, type, (level - 1) * 3 + 1, 0, true, options.entityOnly === true);
    });
    if (options.buildingType) return assets;
    for (const type of Object.keys(palette)) assets[`assets/tiles/terrain/${type}.png`] = assetCanvas(T, T, (c) => paintTerrainTile(c, type));
    assets["assets/tiles/resources/forest.png"] = assetCanvas(128, 128, (c) => {
      c.translate(64, 64);
      tree(c, -14, 7, 0.95);
      tree(c, 10, -8, 1.1);
      bamboo(c, 15, 19, 0.66);
    });
    assets["assets/tiles/resources/mountain.png"] = assetCanvas(128, 128, (c) => {
      c.translate(64, 64);
      stone(c, -9, 9, 1.1);
      stone(c, 15, -4, 1.2);
      stone(c, -13, -13, 0.6);
    });
    assets["assets/tiles/resources/border-tree.png"] = assetCanvas(128, 128, (c) => {
      c.translate(64, 72);
      tree(c, 0, 0, 1, true);
    });
    assets["assets/tiles/resources/reeds.png"] = assetCanvas(64, 64, (c) => {
      for (let i = 0; i < 4; i++) line(c, [[9 + i * 3, 54], [7 + i * 3, 39 + i % 2 * 4]], "#739575", 1.3);
    });
    for (let mask = 0; mask < 16; mask++) {
      const name = mask.toString(16).padStart(2, "0");
      assets[`assets/tiles/walls/${name}.png`] = assetCanvas(T, T, (c) => paintConnectedTile(c, mask, "wall"));
      assets[`assets/tiles/roads/ground-${name}.png`] = assetCanvas(T, T, (c) => paintConnectedTile(c, mask, "ground"));
      assets[`assets/tiles/roads/bridge-${name}.png`] = assetCanvas(T, T, (c) => paintConnectedTile(c, mask, "bridge"));
    }
    return assets;
  }
  window.GFArt = { T, thumbnail, render, exportPngAssets, spriteVersion: () => soldierSpriteVersion + artAssetVersion + GFUI.version(), cacheStats: () => ({ chunks: (ground == null ? void 0 : ground.chunks.size) || 0, pixels: [...(ground == null ? void 0 : ground.chunks.values()) || []].reduce((n, t) => n + t.canvas.width * t.canvas.height, 0), largestSide: Math.max(0, ...[...(ground == null ? void 0 : ground.chunks.values()) || []].map((t) => Math.max(t.canvas.width, t.canvas.height))) }) };
  window.GFArt.ready = () => Promise.all([...artImages.values(), ...Object.values(soldierAtlases)].map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
  })));
})();

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
(function(root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./game") : root.GF);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GFAutoplay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(G) {
  "use strict";
  const coversGate = (p, g) => Math.hypot(p.x - g.x, p.y - g.y) <= 3.5;
  const NEXT = { tea: "inn", inn: "bank", farm: "mill", mill: "wine", mulberry: "weaver", weaver: "tailor", quarry: "kiln", kiln: "trade" };
  const PARTNER = { bank: "tailor", tailor: "bank", wine: "trade", trade: "wine" };
  const ULTIMATES = Object.values(G.DEFS).filter((d) => d.required);
  const REPORTS = /* @__PURE__ */ new WeakMap();
  const MILITARY_INCOME_THRESHOLDS = [0, 10, 18, 36, 72, 144, 288, 576, 1152];
  const desiredMilitaryLevel = (minimum) => MILITARY_INCOME_THRESHOLDS.reduce((level, threshold, index) => minimum >= threshold ? index + 1 : level, 1);
  function nextBarracksTroop(buildings) {
    const specialized = buildings.filter((b) => b.type === "barracks" && b.level >= 2);
    return specialized.filter((b) => G.troopType(b) === "archer").length < Math.floor((specialized.length + 1) / 3) ? "archer" : "infantry";
  }
  function create(state) {
    const s = state.actorId === void 0 && state.players ? G.playerView(state, 0) : state;
    const land = G.estate(s), width = G.worldWidth(s), stats = s.ai || (s.ai = {});
    const defaults = { clock: 0, armyTurn: true, activeSeconds: 0, decisions: 0, builds: 0, upgrades: 0, casts: 0, lastAction: "准备经营" };
    for (const [key, value] of Object.entries(defaults)) if (stats[key] === void 0) stats[key] = value;
    const plots = [...land.cells].map((k) => ({ x: k % width, y: Math.floor(k / width) })).filter((p) => G.terrain(p.x, p.y, s) !== "water");
    const plotKeys = new Set(plots.map((p) => p.y * width + p.x));
    let telemetry = REPORTS.get(stats);
    if (!telemetry) {
      telemetry = { actions: [], skills: { repel: 0, repair: 0, thunder: 0 } };
      REPORTS.set(stats, telemetry);
    }
    let strategicLayout = null;
    function record(kind, type, reason) {
      var _a;
      const text = (kind === "build" ? "建造" : kind === "upgrade" ? "升级" : "施放") + (((_a = G.DEFS[type]) == null ? void 0 : _a.name) || G.SKILLS[type].name);
      stats.lastAction = text;
      if (kind === "build") stats.builds++;
      else if (kind === "upgrade") stats.upgrades++;
      else {
        stats.casts++;
        telemetry.skills[type]++;
      }
      telemetry.actions.push({ second: s.elapsed, kind, type, reason });
      if (telemetry.actions.length > 240) telemetry.actions.shift();
      return true;
    }
    function build(type, p, reason) {
      const result = p && G.build(s, type, p.x, p.y);
      return !!(result == null ? void 0 : result.ok) && record("build", type, reason);
    }
    const upgradeChoice = (b) => (b == null ? void 0 : b.type) === "barracks" && b.level === 1 ? { troopType: nextBarracksTroop(s.buildings) } : {};
    function upgrade(b, reason) {
      const result = b && G.upgrade(s, b, upgradeChoice(b));
      return !!(result == null ? void 0 : result.ok) && record("upgrade", b.type, reason);
    }
    const count = (type) => s.buildings.filter((b) => b.type === type).length;
    const canAfford = (cost) => s.coins >= cost.coins && s.materials >= cost.materials;
    function waitSeconds(cost, rates = G.rates(s)) {
      const coin = Math.max(0, cost.coins - s.coins) / (rates.coins || Number.EPSILON);
      const material = Math.max(0, cost.materials - s.materials) / (rates.materials || Number.EPSILON);
      return Math.max(coin, material);
    }
    function available(type) {
      return plots.filter((p) => !G.buildReason(s, type, p.x, p.y, true));
    }
    function neighbors(p) {
      const result = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) result.push({ x: p.x + dx, y: p.y + dy });
      return result;
    }
    function futureEconomyCell(p, excluded = []) {
      const key = p.y * width + p.x, terrain = G.terrain(p.x, p.y, s);
      return plotKeys.has(key) && !land.roads.has(key) && !land.gates.some((g) => g.x === p.x && g.y === p.y) && !G.at(s, p.x, p.y) && !excluded.some((n) => n.x === p.x && n.y === p.y) && terrain !== "water" && terrain !== "forest" && terrain !== "mountain";
    }
    function commonFuture(a, b, excluded = []) {
      return neighbors(a).some((p) => Math.max(Math.abs(p.x - b.x), Math.abs(p.y - b.y)) <= 1 && futureEconomyCell(p, [a, b, ...excluded]));
    }
    function chainPotential(type, p) {
      const d = G.DEFS[type], counterpart = PARTNER[type] && s.buildings.find((b) => b.type === PARTNER[type]);
      if (d.end) return counterpart && commonFuture(p, counterpart) ? 30 : neighbors(p).filter((n) => futureEconomyCell(n, [p])).length;
      const next = NEXT[type];
      if (!next) return 0;
      let best = 0;
      for (const middle of neighbors(p).filter((n) => futureEconomyCell(n, [p]))) {
        if (G.DEFS[next].end) {
          const other = PARTNER[next] && s.buildings.find((b) => b.type === PARTNER[next]);
          const ends = neighbors(middle).filter((n) => futureEconomyCell(n, [p, middle]));
          best = Math.max(best, ...ends.map((end) => other && commonFuture(end, other, [p, middle]) ? 30 : neighbors(end).filter((n) => futureEconomyCell(n, [p, middle, end])).length));
        } else best = Math.max(best, neighbors(middle).filter((n) => futureEconomyCell(n, [p, middle])).length);
      }
      return best;
    }
    const supports = (type, target) => {
      var _a;
      return G.DEFS[target].prev === type || ((_a = G.DEFS[target].required) == null ? void 0 : _a.includes(type));
    };
    function placementScore(type, p) {
      const d = G.DEFS[type], key = p.y * width + p.x;
      let score = -Math.hypot(p.x - land.center.x, p.y - land.center.y) * 0.08 + (land.roads.has(key) ? -8 : 0);
      score += neighbors(p).filter((n) => futureEconomyCell(n, [p])).length * 0.35;
      if (d.cat === "economy") {
        if (count(type) === 0 || d.tier > 0) score += chainPotential(type, p) * 1.5;
        if (d.prev) score += s.buildings.filter((b) => b.type === d.prev && Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)) <= 1).reduce((n, b) => n + b.level * 3, 0);
        score += s.buildings.filter((b) => supports(type, b.type) && Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)) <= 1).reduce((total, b) => total + 3 + b.level * 2 + Math.log2(1 + G.income(s, b)), 0);
      }
      return score;
    }
    function bestPlot(type, filter) {
      const choices = available(type).filter(filter || (() => true));
      return choices.sort((a, b) => placementScore(type, b) - placementScore(type, a) || a.y - b.y || a.x - b.x)[0];
    }
    function buildPlan(type, p, reason) {
      return p && { type, cost: G.buildCost(s, type), reason, run: () => build(type, p, reason) };
    }
    function upgradePlan(b, reason) {
      return b && { type: b.type, cost: G.upgradeCost(b), reason, run: () => upgrade(b, reason) };
    }
    function perform(plan, saveLimit = 0, forceSave = false) {
      if (!plan) return null;
      if (canAfford(plan.cost)) return plan.run() ? "acted" : null;
      const wait = waitSeconds(plan.cost);
      if (Number.isFinite(wait) && (forceSave || wait <= saveLimit)) {
        stats.lastAction = `储备资源 · ${plan.reason}`;
        return "saving";
      }
      return null;
    }
    function foundationTarget(b) {
      if (!b) return null;
      const reason = G.upgradeReason(s, b, true);
      if (reason.startsWith("需祠堂")) return foundationTarget(s.buildings.find((n) => n.type === "shrine"));
      if (reason.startsWith("需城门")) return foundationTarget(s.buildings.find((n) => n.type === "gate"));
      return reason ? null : b;
    }
    function resourceIncome(buildings, resource) {
      return buildings.reduce((total, b) => G.DEFS[b.type].resource === resource ? total + G.income(s, b, buildings) : total, 0);
    }
    function buildIncomeGain(d, p) {
      const next = __spreadProps(__spreadValues({}, p), { id: -1, type: d.id, level: 1, owner: s.actorId });
      return resourceIncome([...s.buildings, next], d.resource) - resourceIncome(s.buildings, d.resource);
    }
    function upgradeIncomeGain(b) {
      const d = G.DEFS[b.type], buildings = s.buildings.map((n) => n === b ? __spreadProps(__spreadValues({}, n), { level: n.level + 1 }) : n);
      return resourceIncome(buildings, d.resource) - resourceIncome(s.buildings, d.resource);
    }
    function chainTypes(type, result = /* @__PURE__ */ new Set()) {
      if (result.has(type)) return result;
      result.add(type);
      const d = G.DEFS[type];
      if (d.prev) chainTypes(d.prev, result);
      for (const required of d.required || []) chainTypes(required, result);
      return result;
    }
    const cellKey = (p) => p.y * width + p.x;
    function terrainFits(type, p) {
      const terrain = G.terrain(p.x, p.y, s), d = G.DEFS[type];
      if (terrain === "water") return false;
      if (terrain === "forest") return type === "mulberry";
      if (terrain === "mountain") return type === "quarry";
      if (type === "farm") return terrain === "shore";
      return !d.terrain || terrain === d.terrain;
    }
    function layoutCell(type, p, used = /* @__PURE__ */ new Set()) {
      const key = cellKey(p);
      if (used.has(key) || !plotKeys.has(key)) return false;
      const existing = G.at(s, p.x, p.y);
      if (existing) return existing.type === type;
      const d = G.DEFS[type];
      return !land.roads.has(key) && !land.gates.some((g) => g.x === p.x && g.y === p.y) && terrainFits(type, p) && (!d.limit || count(type) < d.limit);
    }
    function pathOptions(endType, site, reserved) {
      const middleType = G.DEFS[endType].prev, startType = G.DEFS[middleType].prev, result = [];
      for (const end of neighbors(site).filter((p) => layoutCell(endType, p, reserved))) {
        const endUsed = /* @__PURE__ */ new Set([...reserved, cellKey(end)]);
        for (const middle of neighbors(end).filter((p) => layoutCell(middleType, p, endUsed))) {
          const middleUsed = /* @__PURE__ */ new Set([...endUsed, cellKey(middle)]);
          for (const start of neighbors(middle).filter((p) => layoutCell(startType, p, middleUsed))) {
            const steps = [__spreadValues({ type: startType }, start), __spreadValues({ type: middleType }, middle), __spreadValues({ type: endType }, end)];
            const reuse = steps.reduce((total, step) => {
              var _a;
              return total + (((_a = G.at(s, step.x, step.y)) == null ? void 0 : _a.type) === step.type ? 24 : 0);
            }, 0);
            const supply = neighbors(middle).filter((p) => layoutCell(startType, p, /* @__PURE__ */ new Set([cellKey(middle), cellKey(end), cellKey(site)]))).length;
            result.push({ steps, score: reuse + supply * 2 - Math.hypot(start.x - site.x, start.y - site.y) });
          }
        }
      }
      return result.sort((a, b) => b.score - a.score);
    }
    function findUltimateLayout(goal) {
      let best = null;
      for (const site of plots.filter((p) => layoutCell(goal.id, p))) {
        const siteKey = cellKey(site), first = pathOptions(goal.required[0], site, /* @__PURE__ */ new Set([siteKey])).slice(0, 16);
        for (const a of first) {
          const used = /* @__PURE__ */ new Set([siteKey, ...a.steps.map(cellKey)]);
          for (const b of pathOptions(goal.required[1], site, used).slice(0, 16)) {
            const score = a.score + b.score - Math.hypot(site.x - land.center.x, site.y - land.center.y) * 0.1;
            if (!best || score > best.score) best = { goal: goal.id, site, paths: [a.steps, b.steps], score };
          }
        }
      }
      return best;
    }
    function validLayout(layout) {
      if (!layout) return false;
      const used = /* @__PURE__ */ new Set();
      for (const step of [__spreadValues({ type: layout.goal }, layout.site), ...layout.paths.flat()]) {
        if (!layoutCell(step.type, step, used)) return false;
        used.add(cellKey(step));
      }
      return true;
    }
    function selectUltimate() {
      const remaining = ULTIMATES.filter((d) => !count(d.id));
      if (!remaining.length) return null;
      const rates = G.rates(s), progress = (d) => [...chainTypes(d.id)].filter((type) => count(type)).length;
      remaining.sort((a, b) => progress(b) - progress(a) || (a.resource === "coins" ? rates.coins - rates.materials : rates.materials - rates.coins) - (b.resource === "coins" ? rates.coins - rates.materials : rates.materials - rates.coins) || a.id.localeCompare(b.id));
      return remaining[0];
    }
    function ultimatePlan() {
      let goal = ULTIMATES.find((d) => d.id === stats.ultimateGoal && !count(d.id));
      if (!goal) {
        goal = selectUltimate();
        stats.ultimateGoal = (goal == null ? void 0 : goal.id) || null;
        strategicLayout = null;
      }
      if (!goal) return null;
      let reason = `筹建${goal.name}`;
      const finalPlot = bestPlot(goal.id);
      if (finalPlot) return buildPlan(goal.id, finalPlot, reason);
      if ((strategicLayout == null ? void 0 : strategicLayout.goal) !== goal.id || !validLayout(strategicLayout)) strategicLayout = findUltimateLayout(goal);
      if (!strategicLayout) {
        for (const alternative of ULTIMATES.filter((d) => d.id !== goal.id && !count(d.id))) {
          const layout = findUltimateLayout(alternative);
          if (!layout) continue;
          goal = alternative;
          stats.ultimateGoal = goal.id;
          strategicLayout = layout;
          break;
        }
      }
      if (!strategicLayout) return null;
      reason = `筹建${goal.name}`;
      for (const path of strategicLayout.paths) for (const step of path) {
        const existing = G.at(s, step.x, step.y);
        if ((existing == null ? void 0 : existing.type) === step.type) continue;
        if (!G.buildReason(s, step.type, step.x, step.y, true)) return buildPlan(step.type, step, reason);
      }
      if (!G.buildReason(s, goal.id, strategicLayout.site.x, strategicLayout.site.y, true)) return buildPlan(goal.id, strategicLayout.site, reason);
      return null;
    }
    function opening() {
      const firstFarm = count("farm") === 0 && bestPlot("farm");
      if (firstFarm) return perform(buildPlan("farm", firstFarm, "建立工材来源"), 0, true);
      const firstMulberry = count("mulberry") === 0 && bestPlot("mulberry");
      if (firstMulberry) return perform(buildPlan("mulberry", firstMulberry, "建立铜钱来源"), 0, true);
      const rates = G.rates(s), plans = [];
      for (const type of ["farm", "mulberry"]) if (count(type) < 4) {
        const p = bestPlot(type);
        if (p) plans.push(buildPlan(type, p, type === "farm" ? "扩充基础工材" : "扩充基础铜钱"));
      }
      if (!plans.length) return null;
      const affordable = plans.filter((plan) => canAfford(plan.cost));
      const selected = (affordable.length ? affordable : plans).sort((a, b) => {
        const ar = a.reason.includes("工材") ? rates.materials : rates.coins, br = b.reason.includes("工材") ? rates.materials : rates.coins;
        return ar - br || waitSeconds(a.cost, rates) - waitSeconds(b.cost, rates);
      })[0];
      return perform(selected, 0, true);
    }
    function gateTowerPlot(gate) {
      return bestPlot("tower", (p) => coversGate(p, gate)) || bestPlot("tower", (p) => Math.hypot(p.x - gate.x, p.y - gate.y) <= 5);
    }
    function primaryGate() {
      const enemies = G.hostileUnits(s);
      return [...land.gates].sort((a, b) => {
        const da = enemies.length ? Math.min(...enemies.map((u) => Math.hypot(u.x - a.x, u.y - a.y))) : Math.hypot(a.x - land.center.x, a.y - land.center.y);
        const db = enemies.length ? Math.min(...enemies.map((u) => Math.hypot(u.x - b.x, u.y - b.y))) : Math.hypot(b.x - land.center.x, b.y - land.center.y);
        return da - db;
      })[0];
    }
    function firstArmy() {
      if (!count("barracks")) {
        const gate = primaryGate(), p = bestPlot("barracks", (n) => Math.hypot(n.x - gate.x, n.y - gate.y) <= 6) || bestPlot("barracks");
        return perform(buildPlan("barracks", p, "组建首支守军"), 0, true);
      }
      if (!count("tower")) {
        const gate = primaryGate();
        return perform(buildPlan("tower", gateTowerPlot(gate), "建立城门基础防线"), 0, true);
      }
      return null;
    }
    function skills() {
      const id = s.selectedSkill;
      if (!id || G.skillReason(s, id)) return false;
      const enemies = G.hostileUnits(s).filter((u) => G.inSkillZone(s, s.actorId, u));
      const damaged = s.buildings.some((b) => b.hp / G.maxHP(b) < 0.65);
      const urgent = enemies.some((u) => Math.hypot(u.x - land.center.x, u.y - land.center.y) < 5 || land.gates.some((g) => Math.hypot(u.x - g.x, u.y - g.y) < 4));
      const wanted = id === "repair" ? damaged : enemies.length >= 2 || urgent;
      return wanted && G.skill(s, id).ok && record("skill", id, id === "repair" ? "修复受损建筑" : "压制入侵部队");
    }
    function defense() {
      const enemies = G.hostileUnits(s), threats = [];
      for (const gate of land.gates) {
        const nearby = enemies.filter((u) => Math.hypot(u.x - gate.x, u.y - gate.y) <= 9);
        if (nearby.length) threats.push({ gate, nearby, closest: Math.min(...nearby.map((u) => Math.hypot(u.x - gate.x, u.y - gate.y))) });
      }
      threats.sort((a, b) => a.closest - b.closest || b.nearby.length - a.nearby.length);
      for (const threat of threats) {
        const { gate, nearby, closest } = threat, towers = s.buildings.filter((b) => b.type === "tower" && coversGate(b, gate)).sort((a, b) => a.level - b.level), gateBuilding = G.at(s, gate.x, gate.y);
        if (!towers.length) {
          const result = perform(buildPlan("tower", gateTowerPlot(gate), "敌军逼近，补建箭塔"), 4, closest <= 5);
          if (result) return result;
        }
        const strength = towers.reduce((sum, b) => sum + b.level, 0);
        if (towers.length && nearby.length > strength * 2) {
          const target = towers.find((b) => !G.upgradeReason(s, b, true));
          const result = perform(upgradePlan(target, "敌军集结，强化箭塔"), 5, closest <= 4);
          if (result) return result;
          if (towers.length < 2) {
            const result2 = perform(buildPlan("tower", gateTowerPlot(gate), "敌军集结，增设箭塔"), 5, closest <= 4);
            if (result2) return result2;
          }
        }
        if (gateBuilding && gateBuilding.hp / G.maxHP(gateBuilding) < 0.6) {
          const target = foundationTarget(gateBuilding), result = perform(upgradePlan(target, "城门受损，提升耐久"), 4, closest <= 3);
          if (result) return result;
        }
      }
      return null;
    }
    function economyPlan() {
      const rates = G.rates(s), options = [], resourceWeight = (resource) => {
        const own = Math.max(0.5, rates[resource]), other = Math.max(0.5, rates[resource === "coins" ? "materials" : "coins"]);
        return Math.max(0.7, Math.min(2.2, other / own));
      };
      function score(gain, cost, d, multiplier = 1) {
        const productionSeconds = cost.coins / Math.max(1, rates.coins) + cost.materials / Math.max(1, rates.materials);
        return gain * resourceWeight(d.resource) * multiplier / Math.max(1, productionSeconds);
      }
      const reserved = strategicLayout && stats.ultimateGoal === strategicLayout.goal ? chainTypes(strategicLayout.goal) : /* @__PURE__ */ new Set();
      for (const d of Object.values(G.DEFS).filter((d2) => d2.cat === "economy")) {
        if (reserved.has(d.id) && d.tier !== 0) continue;
        const p = bestPlot(d.id);
        if (!p) continue;
        const gain = buildIncomeGain(d, p), cost = G.buildCost(s, d.id), first = count(d.id) === 0;
        let multiplier = first ? 1.8 : 1;
        if (d.tier === 0 && (d.id === "farm" || d.id === "mulberry" ? count(d.id) < 6 : count(d.id) < 2)) multiplier *= 1.25;
        if (d.tier === 1) multiplier *= 1.3;
        if (d.end) multiplier *= 1.5;
        if (d.required) multiplier *= 2;
        options.push({ score: score(gain, cost, d, multiplier), cost, reason: `发展${d.name}产业`, run: () => build(d.id, p, `发展${d.name}产业`) });
      }
      for (const b of s.buildings.filter((b2) => G.DEFS[b2.type].income && b2.type !== "shrine")) {
        if (b.level >= G.maxLevel(b) || G.upgradeReason(s, b, true)) continue;
        const d = G.DEFS[b.type], gain = upgradeIncomeGain(b), cost = G.upgradeCost(b);
        options.push({ score: score(gain, cost, d, b.level === 1 ? 1.18 : 1), cost, reason: `提升${d.name}产能`, run: () => upgrade(b, `提升${d.name}产能`) });
      }
      if (!options.length) return null;
      options.sort((a, b) => b.score - a.score);
      const best = options[0], affordable = options.find((option) => canAfford(option.cost));
      return waitSeconds(best.cost, rates) <= 9 ? best : affordable || best;
    }
    function diversificationPlan() {
      const rates = G.rates(s), plans = Object.values(G.DEFS).filter((d) => d.cat === "economy" && d.tier === 1 && !count(d.id)).map((d) => ({ definition: d, plot: bestPlot(d.id) })).filter((option) => option.plot).map((option) => buildPlan(option.definition.id, option.plot, `完善${option.definition.chain}产业链`));
      return plans.sort((a, b) => waitSeconds(a.cost, rates) - waitSeconds(b.cost, rates))[0] || null;
    }
    function basicSupplyPlan() {
      const rates = G.rates(s), plans = ["farm", "mulberry", "tea", "quarry"].filter((type) => count(type) < (type === "farm" || type === "mulberry" ? G.DEFS[type].limit : 2)).map((type) => ({ type, plot: bestPlot(type) })).filter((option) => option.plot).map((option) => buildPlan(option.type, option.plot, G.DEFS[option.type].resource === "materials" ? "扩充前置工材建筑" : "扩充前置铜钱建筑"));
      return plans.sort((a, b) => {
        const ar = G.DEFS[a.type].resource === "materials" ? rates.materials : rates.coins, br = G.DEFS[b.type].resource === "materials" ? rates.materials : rates.coins;
        return ar - br || waitSeconds(a.cost, rates) - waitSeconds(b.cost, rates);
      })[0] || null;
    }
    function militaryPlan() {
      const rates = G.rates(s), minimum = Math.min(rates.coins, rates.materials), barracks = s.buildings.filter((b) => b.type === "barracks").sort((a, b) => a.level - b.level || a.id - b.id);
      const desiredBarracks = 1 + (minimum >= 8 ? 1 : 0) + (minimum >= 16 ? 1 : 0);
      if (barracks.length < desiredBarracks) {
        const gate = primaryGate(), p = bestPlot("barracks", (n) => Math.hypot(n.x - gate.x, n.y - gate.y) <= 7) || bestPlot("barracks");
        if (p) return buildPlan("barracks", p, "扩大常备军规模");
      }
      const desiredBarracksLevel = desiredMilitaryLevel(minimum);
      const training = barracks.find((b) => b.level < Math.min(desiredBarracksLevel, G.unlockedBuildingLevel(s)) && !G.upgradeReason(s, b, true, upgradeChoice(b)));
      if (training) return upgradePlan(training, "提升士兵训练质量");
      const shrine = s.buildings.find((b) => b.type === "shrine"), desiredShrine = Math.max(Math.min(5, 1 + Math.floor(minimum / 7)), G.requiredShrineLevel(desiredBarracksLevel));
      if (shrine && shrine.level < desiredShrine) {
        const target = foundationTarget(shrine);
        if (target) return upgradePlan(target, target.type === "shrine" ? "升级主城，强化全军" : "同步强化城门");
      }
      const desiredTowerLevel = 1 + (minimum >= 12 ? 1 : 0), tower = s.buildings.filter((b) => b.type === "tower").sort((a, b) => a.level - b.level)[0];
      if (tower && tower.level < desiredTowerLevel && !G.upgradeReason(s, tower, true)) return upgradePlan(tower, "巩固常备防线");
      return null;
    }
    function tick(dt) {
      if (s.over || s.eliminated || !Number.isFinite(dt) || dt <= 0) return false;
      stats.activeSeconds += dt;
      stats.clock += dt;
      if (stats.clock < 1 - 1e-8) return false;
      stats.clock = Math.max(0, stats.clock - 1);
      stats.decisions++;
      const cast = skills(), danger = defense();
      if (danger) return danger === "acted" || cast;
      const start = opening();
      if (start) return start === "acted" || cast;
      const armyStart = firstArmy();
      if (armyStart) return armyStart === "acted" || cast;
      const supply = basicSupplyPlan(), supplyResult = perform(supply, 9);
      if (supplyResult) {
        if (supplyResult === "acted") stats.armyTurn = true;
        return supplyResult === "acted" || cast;
      }
      const strategic = ultimatePlan(), strategicDef = G.DEFS[strategic == null ? void 0 : strategic.type], strategicRates = G.rates(s), strategicBase = Math.min(strategicRates.coins, strategicRates.materials);
      const strategicWait = (strategicDef == null ? void 0 : strategicDef.required) ? strategicBase >= 100 ? 45 : 12 : (strategicDef == null ? void 0 : strategicDef.end) ? strategicBase >= 85 ? 70 : 12 : (strategicDef == null ? void 0 : strategicDef.tier) === 1 ? strategicBase >= 15 ? 12 : 4 : strategicBase >= 10 ? 9 : 4;
      if (stats.armyTurn) {
        const plan = militaryPlan(), result = perform(plan, 7);
        if (result) {
          if (result === "acted") stats.armyTurn = false;
          return result === "acted" || cast;
        }
      }
      const strategicResult = perform(strategic, strategicWait);
      if (strategicResult) {
        if (strategicResult === "acted") stats.armyTurn = true;
        return strategicResult === "acted" || cast;
      }
      const diversification = diversificationPlan(), diversificationResult = perform(diversification, 12);
      if (diversificationResult) {
        if (diversificationResult === "acted") stats.armyTurn = true;
        return diversificationResult === "acted" || cast;
      }
      const economy = economyPlan(), economicResult = perform(economy, 9);
      if (economicResult) {
        if (economicResult === "acted") stats.armyTurn = true;
        return economicResult === "acted" || cast;
      }
      const military = militaryPlan(), militaryResult = perform(military, 0, true);
      if (militaryResult === "acted") stats.armyTurn = false;
      return militaryResult === "acted" || cast;
    }
    const report = () => __spreadProps(__spreadValues({ schema: 3, controller: "balanced-estate-v2" }, stats), { skills: __spreadValues({}, telemetry.skills), actions: telemetry.actions.map((a) => __spreadValues({}, a)), mapSeed: s.mapSeed, owner: s.actorId, over: s.over, eliminated: s.eliminated, rates: G.rates(s) });
    return { tick, report, get lastAction() {
      return stats.lastAction;
    } };
  }
  G.setControllerFactory(create);
  return { create, coversGate, desiredMilitaryLevel, nextBarracksTroop };
});

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
(function() {
  "use strict";
  const $ = (id) => document.getElementById(id), canvas = $("map"), KEY = "gufang-qitan-match-v9";
  let storageWarning = false, saved = null;
  try {
    localStorage.removeItem("gufang-qitan-save-v1");
    localStorage.removeItem("gufang-qitan-save-v1-backup");
    localStorage.removeItem("gufang-qitan-match-v8");
    saved = localStorage.getItem(KEY);
  } catch (e) {
    storageWarning = true;
  }
  const SOUND_KEY = "gufang-qitan-sound";
  const GRID_KEY = "gufang-qitan-grid";
  let grid = true;
  try {
    grid = localStorage.getItem(GRID_KEY) !== "off";
  } catch (e) {
  }
  let state = saved && GF.restore(saved) || GF.createState(), selected = null, paused = true, sound = false, started = false;
  try {
    sound = localStorage.getItem(SOUND_KEY) === "on";
  } catch (e) {
  }
  let saveStatus = storageWarning ? "本地存档不可用" : "本地自动存档";
  let autoplay = false, pilot = null, partnerPilot = null, computerSeat = false;
  let online = null, replica = null, actionId = 0;
  let remoteMotion = null, remoteAt = 0;
  let guestClockBase = 0, guestTimeBase = 0, guestClockAt = 0;
  const guestLive = () => online && !online.serverPaused && online.peerConnected && !online.awaitingState ? guestClockBase + Math.min(0.5, (performance.now() - guestClockAt) / 1e3) : guestClockBase;
  const remotePosition = (unit) => (remoteMotion == null ? void 0 : remoteMotion.position(unit)) || unit;
  const playerOwner = () => (online == null ? void 0 : online.role) === "guest" ? 1 : 0;
  const playerState = () => GF.playerView(state, playerOwner());
  const difficultyName = (value) => {
    var _a;
    return ((_a = GF.DIFFICULTIES[value]) == null ? void 0 : _a.name) || GF.DIFFICULTIES.beginner.name;
  };
  const onlineSend = (message) => {
    var _a;
    if (((_a = online == null ? void 0 : online.socket) == null ? void 0 : _a.readyState) === WebSocket.OPEN) online.socket.send(JSON.stringify(message));
  };
  function sendPresence() {
    if (!online || !replica || online.awaitingState || !started) return;
    onlineSend({ type: "presence", session: replica.session, paused, hidden: hiddenPause });
  }
  function leaveOnline() {
    if (!online) return;
    const { socket } = online;
    online = null;
    replica = null;
    remoteMotion = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    const input = $("coop-code");
    if (input) {
      input.readOnly = false;
      input.value = "";
    }
  }
  function onlineAction(kind, extras = {}) {
    var _a, _b, _c, _d;
    if (!(online == null ? void 0 : online.peerConnected) || !replica || online.awaitingState || !started) {
      toast("与服务器连接中，请稍候", "warning");
      return { ok: false };
    }
    const action = __spreadValues({ id: ++actionId, kind, x: (_b = (_a = extras.x) != null ? _a : selected == null ? void 0 : selected.x) != null ? _b : 0, y: (_d = (_c = extras.y) != null ? _c : selected == null ? void 0 : selected.y) != null ? _d : 0 }, extras);
    const result = replica.act(action);
    if (result.ok) {
      onlineSend(__spreadValues({ type: "action", session: replica.session }, action));
      panelKey = "";
      refresh();
    } else if (result.reason) toast(result.reason, "warning");
    return result;
  }
  function updateOnlineClock(message, resetMotion = false) {
    online.serverPaused = !!message.paused;
    guestClockBase = state.elapsed;
    guestTimeBase = state.time;
    guestClockAt = performance.now();
    remoteMotion || (remoteMotion = GFNetwork.createMotionPredictor());
    remoteMotion.sync(state, guestClockAt / 1e3, online.serverPaused, resetMotion);
    remoteAt = guestClockAt;
  }
  function receiveOnline(message) {
    if (!online) return;
    if (message.type === "snapshot") {
      const next = GFNetwork.createReplica(message.snapshot, playerOwner(), message.session, message.seq, message.ack);
      if (!next) return;
      const first = !started || !replica || replica.session !== message.session;
      if (!first) {
        next.pending = replica.pending.filter((action) => action.id > message.ack);
        next.reconcile();
      }
      replica = next;
      state = next.state;
      actionId = first ? message.ack : Math.max(actionId, message.ack);
      online.started = true;
      online.awaitingState = false;
      updateOnlineClock(message, true);
      if (first) enterGame(state);
      else if (playerState().selectedSkill && !$("modal").hidden && $("modal-content").querySelector(".skill-selection")) closeModal();
      sendPresence();
      refresh();
      if (state.over) showEnd();
    } else if (message.type === "delta" && replica) {
      if (message.session !== replica.session || online.awaitingState) return;
      if (message.seq <= replica.seq) return;
      if (message.seq !== replica.seq + 1) {
        online.awaitingState = true;
        onlineSend({ type: "resync" });
        return;
      }
      const applied = replica.apply(message);
      if (applied === null) {
        online.awaitingState = true;
        onlineSend({ type: "resync" });
        return;
      }
      if (!applied) return;
      updateOnlineClock(message);
      state.effects.push(...message.effects);
      state.projectiles.push(...message.projectiles);
      state.events.push(...message.events);
      if (playerState().selectedSkill && !$("modal").hidden && $("modal-content").querySelector(".skill-selection")) closeModal();
      if (selected && !GF.at(state, selected.x, selected.y) && !GF.owns(playerState(), selected.x, selected.y)) closePanel();
      handleEvents();
      refresh();
    } else if (message.type === "result" && replica && message.session === replica.session) {
      if (!message.ok) {
        toast(message.reason || "操作未成功", "warning");
        for (const el of $("modal-content").querySelectorAll("[data-choice]")) el.disabled = false;
      } else {
        tone();
        toast("操作成功");
      }
    } else if (message.type === "saved") {
      try {
        localStorage.setItem(KEY, message.snapshot);
        saveStatus = "已保存服务器进度 · 此设备";
        toast("已保存");
      } catch (e) {
        toast("无法保存，可导出存档", "warning");
      }
      if (message.export) downloadSave(message.snapshot);
    } else if (message.type === "error") {
      toast(message.message || "联机失败", "warning");
      if (started) showStartMenu();
      else {
        leaveOnline();
        updateCoopSeat();
      }
    }
  }
  function connectOnline(kind, code = "") {
    if (!/^https?:$/.test(location.protocol)) {
      toast("联机需要通过局域网服务器打开游戏", "warning");
      return;
    }
    leaveOnline();
    const socket = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    online = { kind: "server", socket, role: kind === "create" ? "host" : "guest", code, peerConnected: false, started: false, serverPaused: true };
    socket.onopen = () => {
      if ((online == null ? void 0 : online.socket) === socket) onlineSend({ type: kind, code, enemyCount: Number($("coop-enemies").value), difficulty: $("coop-difficulty").value });
    };
    socket.onmessage = (event) => {
      if ((online == null ? void 0 : online.socket) !== socket) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (message.type === "settings") {
        $("coop-enemies").value = String(message.enemyCount);
        $("coop-difficulty").value = message.difficulty;
        updateCoopSeat();
        return;
      }
      if (message.type === "created" || message.type === "joined") {
        $("coop-enemies").value = String(message.enemyCount);
        $("coop-difficulty").value = message.difficulty;
        online.code = message.code;
        online.peerConnected = message.type === "created" ? false : true;
        $("coop-code").value = message.code;
        $("coop-code").readOnly = true;
        updateCoopSeat();
        toast(message.type === "created" ? "主机已创建，配对码 " + message.code : "已加入房间，等待主机开始");
      } else if (message.type === "peer_joined") {
        online.peerConnected = true;
        updateCoopSeat();
        toast("队友已加入");
      } else if (message.type === "peer_left") {
        online.peerConnected = false;
        updateCoopSeat();
        toast("队友已断开，游戏已暂停等待重连", "warning");
      } else if (message.type === "host_left") {
        toast("主机已离开房间", "warning");
        leaveOnline();
        if (started) showStartMenu();
        else updateCoopSeat();
      } else receiveOnline(message);
    };
    socket.onclose = () => {
      if ((online == null ? void 0 : online.socket) !== socket) return;
      const role = online.role, code2 = online.code;
      online.peerConnected = false;
      if (role === "guest" && code2) {
        toast("连接中断，正在重新加入房间", "warning");
        setTimeout(() => {
          if ((online == null ? void 0 : online.socket) === socket) connectOnline("join", code2);
        }, 1500);
      } else {
        toast("联机已断开，请返回等待界面重新创建房间", "warning");
        if (!started) leaveOnline();
      }
      updateCoopSeat();
    };
    socket.onerror = () => {
      if ((online == null ? void 0 : online.socket) === socket) toast("无法连接联机服务器，请确认设备已连接同一局域网", "warning");
    };
    updateCoopSeat();
  }
  let panelKey = "", lastPhase = "", lastFrame = 0, uiClock = 0, saveClock = 0, toastTimer, audioContext, hiddenPause = document.hidden, demolishTarget = null;
  const cam = { x: 0, y: 0, zoom: 1 }, pointers = /* @__PURE__ */ new Map();
  const view = { width: 390, height: 844 };
  const mobileRendering = window.matchMedia("(pointer: coarse)").matches;
  let simulationClock = 0, lastRenderKey = "", lastRenderAt = 0;
  const renderInterval = 1e3 / 60;
  function center(owner = 0) {
    cam.zoom = Math.max(0.55, Math.min(0.86, view.width / 550));
    const home = GF.estate(GF.playerView(state, owner)).center;
    cam.x = view.width * 0.5 - (home.x + 0.5) * GFArt.T * cam.zoom;
    cam.y = view.height * 0.48 - (home.y + 0.5) * GFArt.T * cam.zoom;
    clampCamera();
  }
  function resize() {
    GufangBoot.layout();
    const ratio = Math.min(devicePixelRatio || 1, mobileRendering ? 1 : 1.5), oldW = view.width, oldH = view.height;
    view.width = $("game").clientWidth;
    view.height = $("game").clientHeight;
    canvas.width = Math.round(view.width * ratio);
    canvas.height = Math.round(view.height * ratio);
    lastRenderKey = "";
    if (!canvas._ready) {
      center();
      canvas._ready = true;
    } else {
      cam.x += (view.width - oldW) / 2;
      cam.y += (view.height - oldH) / 2;
      clampCamera();
    }
  }
  function clampCamera() {
    const size = GF.worldWidth(state) * GFArt.T * cam.zoom, height = GF.worldHeight(state) * GFArt.T * cam.zoom, marginX = view.width * 0.3, marginY = Math.min(view.height * 0.3, 160);
    cam.x = Math.max(marginX - size, Math.min(view.width - marginX, cam.x));
    cam.y = Math.max(150 - height, Math.min(view.height - marginY, cam.y));
  }
  function zoom(factor, x = view.width / 2, y = view.height / 2) {
    const old = cam.zoom;
    cam.zoom = Math.max(0.12, Math.min(1.8, old * factor));
    cam.x = x - (x - cam.x) * cam.zoom / old;
    cam.y = y - (y - cam.y) * cam.zoom / old;
    clampCamera();
  }
  function screenPoint(x, y) {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + cam.x + (x + 0.5) * GFArt.T * cam.zoom, y: r.top + cam.y + (y + 0.5) * GFArt.T * cam.zoom };
  }
  function localPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function toast(text, kind = "info") {
    clearTimeout(toastTimer);
    $("toast").textContent = text;
    $("toast").className = "show " + kind;
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3200);
  }
  function tone(kind = "build") {
    if (!sound) return;
    try {
      audioContext || (audioContext = new (window.AudioContext || window.webkitAudioContext)());
      audioContext.resume();
      const o = audioContext.createOscillator(), g = audioContext.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(kind === "build" ? 560 : kind === "skill" ? 260 : 740, audioContext.currentTime);
      o.frequency.exponentialRampToValueAtTime(kind === "skill" ? 80 : 880, audioContext.currentTime + 0.15);
      g.gain.setValueAtTime(0.055, audioContext.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-3, audioContext.currentTime + 0.22);
      o.connect(g);
      g.connect(audioContext.destination);
      o.start();
      o.stop(audioContext.currentTime + 0.24);
    } catch (e) {
    }
  }
  function save(notify = false) {
    if (!started) return false;
    if (online) {
      if (notify && online.role === "host") onlineSend({ type: "save" });
      else if (notify) toast("本局由服务器运行，房主可保存完整进度");
      return false;
    }
    try {
      localStorage.setItem(KEY, GF.serialize(state));
      saveStatus = "已存档 · 此设备";
      if ($("save-status")) $("save-status").textContent = saveStatus;
      if (notify) toast("已保存");
      return true;
    } catch (e) {
      saveStatus = "本地存档不可用";
      if ($("save-status")) $("save-status").textContent = saveStatus;
      if (notify || !storageWarning) toast("无法保存，可在菜单导出存档", "warning");
      storageWarning = true;
      return false;
    }
  }
  function select(x, y) {
    if (!started) return;
    if (x < 0 || y < 0 || x >= GF.worldWidth(state) || y >= GF.worldHeight(state) || state.over) return;
    if (GF.isWall(state, x, y)) {
      closePanel();
      toast("庄园城墙 · 不可建设、升级或拆除");
      return;
    }
    if (!GF.owns(playerState(), x, y) && !GF.at(state, x, y)) {
      closePanel();
      toast("庄园外或遗址 · 不可建设", "warning");
      return;
    }
    selected = { x, y };
    panelKey = "";
    $("cards").scrollLeft = 0;
    $("panel").hidden = false;
    $("game").classList.add("has-panel");
    refresh();
  }
  function closePanel() {
    selected = null;
    panelKey = "";
    $("panel").hidden = true;
    $("game").classList.remove("has-panel");
  }
  const rateText = (value) => String(Math.round((value + Number.EPSILON) * 10) / 10);
  const soldierTrainingText = (level) => {
    const seconds = GF.soldierTrainingTime(level), rounded = Math.round(seconds);
    return `${Math.abs(seconds - rounded) < 1e-8 ? rounded : rateText(seconds)}s`;
  };
  const costText = (cost) => [cost.coins ? cost.coins + " 铜钱" : "", cost.materials ? cost.materials + " 工材" : ""].filter(Boolean).join(" · ") || "免费";
  const costHTML = (cost, markMissing = false) => `<span class="cost-parts">${cost.coins ? `<span class="cost-part"><i class="coin-icon"></i><b class="cost-number${markMissing && playerState().coins < cost.coins ? " insufficient" : ""}">${cost.coins}</b></span>` : ""}${cost.materials ? `<span class="cost-part"><i class="material-icon"></i><b class="cost-number${markMissing && playerState().materials < cost.materials ? " insufficient" : ""}">${cost.materials}</b></span>` : ""}</span>`;
  function productionLine(resource, base, total) {
    const bonus = rateText(Math.max(0, total - base));
    return `${resource} +${rateText(base)}${bonus === "0" ? "" : `<span class="income-bonus">（+${bonus}）</span>`}/秒`;
  }
  function effect(d, b) {
    var _a, _b;
    if (d.id === "barracks") return "训练士兵";
    if (!d.income) return d.desc || "";
    const building = b || { type: d.id, x: (_a = selected == null ? void 0 : selected.x) != null ? _a : GF.worldCenter(state), y: (_b = selected == null ? void 0 : selected.y) != null ? _b : GF.worldCenter(state), level: 1 };
    const economic = playerState(), preview = b ? economic : __spreadProps(__spreadValues({}, economic), { buildings: [...economic.buildings, building] });
    const lines = [];
    if (d.income) lines.push(productionLine(d.resource === "materials" ? "工材" : "铜钱", d.income * GF.incomeFactor(building), GF.income(preview, building)));
    if (d.required) lines.push("全镇" + (d.auraResource === "materials" ? "工材" : "铜钱") + "收入 +" + rateText(d.aura * GF.auraFactor(building) * 100) + "%");
    return lines.join("<br>");
  }
  function effectHTML(d, x, y) {
    const icon = (resource) => `<i class="${resource === "materials" ? "material-icon" : "coin-icon"}"></i>`;
    const label = (text) => `<span class="effect-line"><span>${text}</span></span>`;
    const figure = (html) => `<span class="effect-line effect-figure">${html}</span>`;
    const rows = (pairs) => `<div class="card-effect rows">${pairs.map(([name, value]) => `<span class="effect-line"><span>${name}</span><span class="effect-value">${value}</span></span>`).join("")}</div>`;
    const center2 = (lines) => `<div class="card-effect production">${lines.join("")}</div>`;
    if (d.income) {
      const building = { type: d.id, x, y, level: 1 }, economic = playerState(), preview = __spreadProps(__spreadValues({}, economic), { buildings: [...economic.buildings, building] });
      return center2([label("生产"), figure(`<span class="effect-value effect-total">${rateText(GF.income(preview, building))}</span>${icon(d.resource)}/秒`)]);
    }
    if (d.id === "tower") return rows([["攻击", d.damage], ["射程", d.range]]);
    if (d.id === "barracks") return center2([figure('<span class="effect-value">训练士兵</span>')]);
    if (d.id === "rock") return rows([["攻击范围", d.range], ["溅射", d.splash]]);
    if (d.id === "well") return center2([label("全庄农田"), figure(`${icon("coins")}<span class="effect-value">+20%</span>`)]);
    if (d.id === "stage") return center2([label("全镇"), figure(`${icon("coins")}<span class="effect-value">+3%</span> ${icon("materials")}<span class="effect-value">+3%</span>`)]);
    if (d.id === "earth") return center2([label("守护"), figure('<span class="effect-value">-20%</span>')]);
    if (d.id === "tao") return center2([label("道法"), figure('<span class="effect-value">+15%</span>')]);
    if (d.id === "zhong") return center2([label("镇煞"), figure('<span class="effect-value">减速40%</span>')]);
    if (d.id === "shrine") return center2([label("祠堂"), figure(`${icon("coins")}<span class="effect-value">+1/秒</span>`)]);
    if (d.id === "fortune") return center2([label("造化"), figure('<span class="effect-value">随机建筑</span>')]);
    return center2([label(d.name), figure(d.desc || "")]);
  }
  function cardHTML(d, x, y) {
    const built = playerState().buildings.filter((b) => b.type === d.id).length;
    const count = d.id === "fortune" ? `次数：${playerState().fortuneBuilt}/${d.limit}` : d.limit ? `数量：${built}/${d.limit}` : "";
    return `<div class="build-card" data-build="${d.id}" aria-label="建造${d.name}"><span class="card-count">${count}</span><div class="card-image"><img src="${GFArt.thumbnail(d.id)}" alt=""></div><strong>${d.name}</strong>${effectHTML(d, x, y)}<div class="card-price">${costHTML(GF.buildCost(playerState(), d.id))}</div></div>`;
  }
  function hideBuildCard(d, x, y) {
    const plot = GF.terrain(x, y, state), nearby = GF.adjacent(state, x, y);
    if (plot === "water") return true;
    if (d.cat === "economy" && plot === "forest" && d.id !== "mulberry") return true;
    if (d.cat === "economy" && plot === "mountain" && d.id !== "quarry") return true;
    if (d.id === "farm") {
      if (plot !== "shore") return true;
    } else if (d.terrain && plot !== d.terrain) return true;
    if (d.prev && !nearby.some((b) => b.type === d.prev)) return true;
    if (d.required && d.required.some((type) => !nearby.some((b) => b.type === type))) return true;
    return false;
  }
  function buildListOrder(d) {
    if (d.required) return 0;
    if (d.cat === "economy") return 3 - (d.tier || 0);
    if (d.cat === "defense") return 4;
    if (d.id === "fortune") return 5;
    return 6;
  }
  function detailHTML(b) {
    const context = GF.playerView(state, b.owner), d = GF.DEFS[b.type], max = b.level >= GF.maxLevel(b), hp = GF.maxHP(b), f = GF.factor(b), next = __spreadProps(__spreadValues({}, b), { level: b.level + 1 }), nextF = GF.factor(next);
    const name = b.type === "gate" ? (["北", "东", "南", "西"][b.direction] || "") + "城门" : GF.name(b), demolishReason = GF.demolishReason(playerState(), b);
    const base = d.income ? d.income * GF.incomeFactor(b) : 0;
    const bonus = d.income ? rateText(Math.max(0, GF.income(context, b) - base)) : "0";
    const revenue = d.income ? `<span class="detail-revenue"><i class="${d.resource === "materials" ? "material-icon" : "coin-icon"}" aria-hidden="true"></i><strong>+${rateText(base)}${bonus === "0" ? "" : `<span class="income-bonus">（+${bonus}）</span>`}</strong><small>/秒</small></span>` : "";
    let stats = `<div>耐久上限<strong>${hp}${max ? "" : " → " + GF.maxHP(next)}</strong></div>`;
    if (b.type === "gate") stats += `<div>修复速度<strong>${rateText(GF.gateRepairRate(b.level) * 100)}%/秒${max ? "" : " → " + rateText(GF.gateRepairRate(next.level) * 100) + "%/秒"}</strong></div>`;
    if (d.income) {
      stats += `<div>${d.resource === "materials" ? "工材" : "铜钱"} / 秒<strong>${GF.income(context, b).toFixed(1)}${max ? "" : " → " + GF.income(context, next).toFixed(1)}</strong></div>`;
      if (b.type === "shrine") stats += `<div>训练时间<strong>${soldierTrainingText(b.level)}${max ? "" : " → " + soldierTrainingText(next.level)}</strong></div>`;
    } else if (b.type === "barracks") stats += `<div>训练兵种<strong>${GF.troopDef(b).name}${b.level === 1 ? " · 下级可分支" : ""}</strong></div><div>士兵等级<strong>${b.level}${max ? "" : " → " + next.level}</strong></div>`;
    else if (d.damage) stats += `<div>攻击伤害<strong>${Math.round(d.damage * f)}${max ? "" : " → " + Math.round(d.damage * nextF)}</strong></div>`;
    else if (["well", "stage"].includes(b.type)) {
      const v = { well: 20, stage: 3 }[b.type];
      stats += `<div>收入加成<strong>${rateText(v * GF.auraFactor(b))}%${max ? "" : " → " + rateText(v * GF.auraFactor(next)) + "%"}</strong></div>`;
    } else if (b.type === "earth") stats += `<div>范围减伤<strong>${Math.min(65, 20 * f)}%${max ? "" : " → " + Math.min(65, 20 * nextF) + "%"}</strong></div>`;
    else if (b.type === "tao") stats += `<div>防御攻击加成<strong>${Math.min(150, 15 * f)}%${max ? "" : " → " + Math.min(150, 15 * nextF) + "%"}</strong></div>`;
    else if (b.type === "zhong") stats += `<div>全体减速<strong>${Math.round(GF.zhongSlow(b) * 100)}%${max ? "" : " → " + Math.round(GF.zhongSlow(next) * 100) + "%"}</strong></div><div>镇煞周期<strong>每 ${d.pulseInterval} 秒 · 持续 ${d.slowDuration} 秒</strong></div>`;
    if (d.required) stats += `<div>全镇${d.auraResource === "materials" ? "工材" : "铜钱"}收入加成<strong>${rateText(d.aura * GF.auraFactor(b) * 100)}%${max ? "" : " → " + rateText(d.aura * GF.auraFactor(next) * 100) + "%"}</strong></div>`;
    const branches = b.type === "barracks" && b.level === 1;
    const actions = branches ? ["infantry", "archer"].map((type) => `<button class="upgrade-button" data-barracks-branch="${type}">升级为${GF.TROOPS[type].name}营<small></small></button>`).join("") : `<button class="upgrade-button" id="upgrade-building">${max ? "已臻化境" : "升级"}<small id="upgrade-label"></small></button><button class="upgrade-button" id="bulk-upgrade-building" hidden>连升<small id="bulk-upgrade-label"></small></button>`;
    return `<div class="detail"><div class="detail-title"><h3>${name}</h3><span class="level-badge">Lv.${b.level}</span>${revenue}<button class="demolish-button" id="demolish-building" ${demolishReason ? "disabled" : ""}>${demolishReason ? "不可拆除" : "拆除"}</button></div><div class="detail-art"><img src="${GFArt.thumbnail(b.type, b.level)}" alt="${name}"></div><div class="detail-info"><div class="health-row"><span>耐久</span><div class="health-track"><i id="detail-hp-fill"></i></div><span id="detail-hp"></span></div><div class="upgrade-stats">${stats}</div></div><div class="detail-actions${branches ? " branches" : ""}">${actions}</div></div>`;
  }
  function renderPanel() {
    if (!selected) return;
    const { x, y } = selected, b = GF.at(state, x, y);
    if (GF.isWall(state, x, y) || !b && !GF.owns(playerState(), x, y)) {
      closePanel();
      return;
    }
    const buildableDefs = Object.values(GF.DEFS).filter((d) => !d.unique && !d.fortuneOnly && !d.fixed);
    const key = `${x},${y},${(b == null ? void 0 : b.id) || ""},${(b == null ? void 0 : b.level) || ""},${(b == null ? void 0 : b.troopType) || ""},${(b == null ? void 0 : b.type) === "barracks" ? GF.soldierPower(playerState(), b) : ""}`;
    $("plot-label").textContent = b ? b.type === "gate" ? (["北", "东", "南", "西"][b.direction] || "") + "城门" : b.type === "barracks" ? GF.name(b) : GF.DEFS[b.type].name : GF.TERRAIN[GF.terrain(x, y, state)] + " · 可兴建";
    $("build-view").hidden = !!b;
    $("detail-view").hidden = !b;
    if (key !== panelKey) {
      panelKey = key;
      if (b) $("detail-view").innerHTML = detailHTML(b);
      else {
        const defs = buildableDefs.map((d, index) => ({ d, index, reason: GF.buildReason(playerState(), d.id, x, y) })).filter((item) => !hideBuildCard(item.d, x, y)).sort((a, b2) => Number(!!a.reason) - Number(!!b2.reason) || buildListOrder(a.d) - buildListOrder(b2.d) || a.index - b2.index).map((item) => item.d);
        const scroll = $("cards").scrollLeft;
        $("cards").innerHTML = defs.map((d) => cardHTML(d, x, y)).join("");
        $("cards").scrollLeft = scroll;
      }
    }
    if (b) {
      const readonly = b.owner !== playerOwner() || playerState().eliminated;
      $("detail-view").classList.toggle("readonly", readonly);
      if (readonly) $("plot-label").textContent = (state.players[b.owner].team === 0 ? "友方" : "敌方") + "庄园 " + (b.owner + 1) + " · 仅查看";
      $("detail-hp").textContent = Math.ceil(Math.max(0, b.hp)) + " / " + GF.maxHP(b);
      $("detail-hp-fill").style.width = Math.max(0, b.hp / GF.maxHP(b) * 100) + "%";
      if (b.type === "barracks" && b.level === 1) {
        for (const button of $("detail-view").querySelectorAll("[data-barracks-branch]")) {
          const reason3 = GF.upgradeReason(playerState(), b, false, { troopType: button.dataset.barracksBranch });
          button.classList.toggle("blocked", !!reason3);
          button.setAttribute("aria-disabled", String(!!reason3));
          button.title = reason3 || "";
          const label = button.querySelector("small"), html = costHTML(GF.upgradeCost(b), true);
          if (label._costHTML !== html) {
            label.innerHTML = html;
            label._costHTML = html;
          }
        }
        const reason2 = GF.demolishReason(playerState(), b);
        $("demolish-building").disabled = !!reason2;
        $("demolish-building").title = reason2 || "";
        return;
      }
      const options = GF.upgradeOptions(playerState(), b), reason = GF.upgradeReason(playerState(), b), max = b.level >= GF.maxLevel(b);
      $("upgrade-building").classList.toggle("blocked", !!reason);
      $("upgrade-building").setAttribute("aria-disabled", String(!!reason));
      $("upgrade-building").title = reason || "";
      $("upgrade-building").firstChild.textContent = max ? "已臻化境" : "升级";
      const bulk = $("bulk-upgrade-building");
      bulk.hidden = b.type === "shrine" || b.type === "gate" || options.levels < 2;
      bulk.parentElement.classList.toggle("bulk", !bulk.hidden);
      bulk.firstChild.textContent = "连升" + options.levels + "级";
      bulk.classList.toggle("blocked", !!reason);
      bulk.setAttribute("aria-disabled", String(!!reason));
      bulk.title = reason || "";
      const demolishReason = GF.demolishReason(playerState(), b);
      $("demolish-building").disabled = !!demolishReason;
      $("demolish-building").title = demolishReason || "";
      $("demolish-building").textContent = demolishReason ? "不可拆除" : "拆除";
      for (const [id, html] of [["upgrade-label", max ? "" : costHTML(GF.upgradeCost(b), true)], ["bulk-upgrade-label", bulk.hidden ? "" : costHTML(options.cost, true)]]) {
        const label = $(id);
        if (label._costHTML !== html) {
          label.innerHTML = html;
          label._costHTML = html;
        }
      }
    } else for (const el of $("cards").children) {
      const reason = GF.buildReason(playerState(), el.dataset.build, x, y);
      el.classList.toggle("locked", !!reason);
      el.classList.toggle("poor", reason.startsWith("差"));
      el.setAttribute("aria-disabled", String(!!reason));
      const cost = GF.buildCost(playerState(), el.dataset.build);
      for (const part of el.querySelectorAll(".card-price .cost-part")) {
        const resource = part.querySelector(".coin-icon") ? "coins" : "materials";
        part.querySelector(".cost-number").classList.toggle("insufficient", playerState()[resource] < cost[resource]);
      }
    }
  }
  const duration = (n) => Math.floor(n / 60) + ":" + String(Math.floor(n % 60)).padStart(2, "0");
  const fmt = (n) => n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, "") + "万" : Math.floor(n).toLocaleString("en-US");
  function refresh() {
    $("autoplay-status").hidden = !autoplay || !started || playerState().eliminated;
    $("autoplay-status").querySelector("strong").textContent = paused ? "托管已暂停" : "托管中";
    $("autoplay-action").textContent = playerState().ai.lastAction;
    $("coins").textContent = fmt(playerState().coins);
    $("materials").textContent = fmt(playerState().materials);
    $("skills").hidden = !started || state.over || playerState().eliminated;
    for (const el of document.querySelectorAll("[data-skill]")) {
      el.hidden = el.dataset.skill !== playerState().selectedSkill;
      const id = el.dataset.skill, reason = GF.skillReason(playerState(), id);
      el.classList.toggle("unavailable", !!reason);
      el.setAttribute("aria-disabled", String(!!reason));
      el.querySelector("small").textContent = playerState().cooldowns[id] > 0 ? Math.ceil(playerState().cooldowns[id]) + " 秒" : "可施展";
    }
    renderPanel();
  }
  function handleEvents() {
    const events = state.events.splice(0);
    if (events.some((e2) => e2.kind === "finished")) {
      save();
      showEnd();
      return;
    }
    if (playerState().eliminated) {
      autoplay = false;
      if (selected && !GF.at(state, selected.x, selected.y)) closePanel();
    }
    const e = events.filter((e2) => !e2.text.startsWith("坊志达成")).pop();
    if (e) toast(e.text, e.kind);
  }
  function blocked(el, reason) {
    el == null ? void 0 : el.classList.remove("shake");
    if (el) {
      void el.offsetWidth;
      el.classList.add("shake");
    }
    toast(reason, "warning");
  }
  function performBuild(type, el) {
    var _a;
    if (!selected) return;
    if (!GF.owns(playerState(), selected.x, selected.y) || GF.isWall(state, selected.x, selected.y)) {
      closePanel();
      toast("仅可在庄园内部建设", "warning");
      return;
    }
    if ((_a = GF.DEFS[type]) == null ? void 0 : _a.fixed) return blocked(el, "庄园固定建筑不可建造");
    if (online) {
      const reason = GF.buildReason(playerState(), type, selected.x, selected.y);
      if (reason) return blocked(el, reason);
      onlineAction("build", { building: type });
      closePanel();
      refresh();
      return;
    }
    const r = GF.build(state, type, selected.x, selected.y);
    if (!r.ok) return blocked(el, r.reason);
    tone();
    const name = type === "fortune" ? "造化匣化为" + GF.name(r.building) : GF.DEFS[type].name + "已建成";
    handleEvents();
    save();
    closePanel();
    refresh();
    toast(name);
  }
  $("cards").addEventListener("click", (e) => {
    if (cardDrag.suppress) return;
    const card = e.target.closest(".build-card");
    if (card) performBuild(card.dataset.build, card);
  });
  $("detail-view").addEventListener("click", (e) => {
    if (!selected) return;
    const b = GF.at(state, selected.x, selected.y);
    if (!b) return;
    const branchButton = e.target.closest("[data-barracks-branch]");
    if (branchButton) {
      const options = { troopType: branchButton.dataset.barracksBranch }, reason = GF.upgradeReason(playerState(), b, false, options);
      if (reason) return blocked(branchButton, reason);
      if (online) {
        onlineAction("upgrade", options);
        return;
      }
      const result = GF.upgrade(playerState(), b, options);
      if (!result.ok) return blocked(branchButton, result.reason);
      tone();
      toast(GF.name(b) + " · 升至 Lv." + b.level);
      panelKey = "";
      handleEvents();
      save();
      refresh();
    } else if (e.target.closest("#upgrade-building")) {
      const reason = GF.upgradeReason(playerState(), b);
      if (reason) return blocked($("upgrade-building"), reason);
      if (online) {
        onlineAction("upgrade");
        return;
      }
      const r = GF.upgrade(state, b);
      if (!r.ok) return blocked($("upgrade-building"), r.reason);
      tone();
      toast(GF.name(b) + " · 升至 Lv." + b.level);
      panelKey = "";
      handleEvents();
      save();
      refresh();
    } else if (e.target.closest("#bulk-upgrade-building")) {
      if (b.type === "shrine" || b.type === "gate") return;
      if (online) {
        const reason = GF.upgradeReason(playerState(), b);
        if (reason) return blocked($("bulk-upgrade-building"), reason);
        onlineAction("bulk");
        return;
      }
      const r = GF.bulkUpgrade(state, b);
      if (!r.ok) return blocked($("bulk-upgrade-building"), r.reason);
      tone();
      panelKey = "";
      handleEvents();
      save();
      refresh();
      toast((b.type === "gate" ? "四座城门" : GF.name(b)) + " · 已连升" + r.levels + "级" + (r.reason ? " · " + r.reason : ""), r.reason ? "warning" : "info");
    } else if (e.target.closest("#demolish-building")) {
      const reason = GF.demolishReason(playerState(), b);
      if (reason) return blocked($("demolish-building"), reason);
      demolishTarget = b;
      const cost = b.originCost || GF.buildCost(playerState(), b.type), refund = { coins: Math.floor(cost.coins * 0.4), materials: Math.floor(cost.materials * 0.4) };
      modal('<p class="modal-kicker">拆除建筑</p><h2>拆除' + GF.name(b) + "？</h2><p>拆除后返还 " + costText(refund) + '，且无法恢复。</p><button class="modal-primary" data-modal="confirm-demolish">确认拆除</button><button class="modal-secondary" data-modal="cancel-demolish">返回</button>');
    }
  });
  for (const el of document.querySelectorAll("[data-skill]")) el.addEventListener("click", () => {
    const reason = GF.skillReason(playerState(), el.dataset.skill);
    if (reason) return blocked(el, reason);
    if (online) {
      onlineAction("skill", { skill: el.dataset.skill });
      return;
    }
    const r = GF.skill(state, el.dataset.skill);
    if (!r.ok) return blocked(el, r.reason);
    tone("skill");
    toast(GF.SKILLS[el.dataset.skill].name + " · 已施展");
    save();
    refresh();
  });
  $("close-panel").onclick = closePanel;
  $("menu-pause").onclick = showMenu;
  function updateSound() {
    $("start-sound").setAttribute("aria-checked", String(sound));
    $("start-sound-label").textContent = sound ? "已开启" : "已关闭";
  }
  function toggleSound() {
    sound = !sound;
    try {
      localStorage.setItem(SOUND_KEY, sound ? "on" : "off");
    } catch (e) {
    }
    updateSound();
    tone();
  }
  function readSave() {
    try {
      saved = localStorage.getItem(KEY);
      storageWarning = false;
    } catch (e) {
      saved = null;
      storageWarning = true;
    }
    return saved && GF.restore(saved);
  }
  function updateStartMenu() {
    const loaded = readSave();
    $("start-load").disabled = !loaded;
    $("start-save-detail").textContent = loaded ? duration(loaded.elapsed) + " · " + loaded.enemyCount + "个敌庄 · " + difficultyName(loaded.difficulty) + (loaded.over ? " · 已结束" : " · 继续对局") : storageWarning ? "本地存档不可用" : saved ? "存档损坏或版本不兼容" : "暂无本地存档";
    updateSound();
  }
  function showStartMenu() {
    if (started) save();
    leaveOnline();
    autoplay = false;
    partnerPilot = null;
    started = false;
    paused = true;
    closePanel();
    $("modal").hidden = true;
    $("start-menu").hidden = false;
    $("single-settings").hidden = true;
    $("coop-lobby").hidden = true;
    $("game").classList.add("at-title");
    $("menu-pause").setAttribute("aria-expanded", "false");
    updateStartMenu();
    $("start-single").focus();
    refresh();
  }
  function enterGame(next) {
    autoplay = false;
    pilot = null;
    state = next;
    started = true;
    saveClock = 0;
    if (!online) {
      state.players[0].controller = "human";
      for (const p of state.players.slice(1)) {
        p.controller = "computer";
        p.selectedSkill || (p.selectedSkill = "thunder");
      }
    }
    if (online) saveStatus = "服务器运行中 · 可手动保存完整进度";
    partnerPilot = state.mode === "coop" && !online ? GFAutoplay.create(GF.playerView(state, 1)) : null;
    $("start-menu").hidden = true;
    $("single-settings").hidden = true;
    $("coop-lobby").hidden = true;
    $("game").classList.remove("at-title");
    closePanel();
    center(playerOwner());
    closeModal();
  }
  function showSkillChoice() {
    const descriptions = { repel: "本庄及墙外5格敌兵定身4秒、受到20伤害", repair: "本庄建筑恢复35%耐久", thunder: "本庄及墙外5格内敌兵受到240伤害" }, symbols = { repel: "符", repair: "愈", thunder: "雷" };
    modal('<div class="skill-selection"><p class="modal-kicker">本局神技 · 三选一</p><h2>择一守坊</h2><div class="skill-options">' + Object.entries(GF.SKILLS).map(([id, d]) => `<button data-modal="choose-skill" data-choice="${id}" class="skill-option"><i aria-hidden="true">${symbols[id]}</i><strong>${d.name}</strong><span>${descriptions[id]}</span><small>冷却 ${d.cooldown} 秒</small></button>`).join("") + "</div></div>");
    $("close-modal").hidden = true;
    $("modal-content").querySelector("[data-choice]").focus();
  }
  function showSingleSettings() {
    $("start-menu").hidden = true;
    $("coop-lobby").hidden = true;
    $("single-settings").hidden = false;
    $("single-start").focus();
  }
  $("start-single").onclick = showSingleSettings;
  $("single-back").onclick = showStartMenu;
  $("single-start").onclick = () => {
    readSave();
    if (saved) modal('<p class="modal-kicker">另起新篇</p><h2>开启新的古坊？</h2><p>单人模式将新建古坊，并替换本地存档。想继续原来的故事，请返回并选择“读档”。</p><button class="modal-primary" data-modal="new">新建古坊</button><button class="modal-secondary" data-modal="close">返回开局设置</button>');
    else newGame();
  };
  $("start-load").onclick = () => {
    const loaded = readSave();
    if (!loaded) {
      updateStartMenu();
      toast("无法读取本地存档", "warning");
      return;
    }
    enterGame(loaded);
    toast("已恢复对局 · " + duration(state.elapsed));
    if (state.over) showEnd();
  };
  $("start-sound").onclick = toggleSound;
  function updateCoopSeat() {
    const linked = (online == null ? void 0 : online.role) === "host" && online.peerConnected, joining = (online == null ? void 0 : online.role) === "guest" && online.peerConnected;
    $("coop-seat").setAttribute("aria-pressed", String(computerSeat));
    $("coop-seat").disabled = !!online;
    $("coop-enemies").disabled = (online == null ? void 0 : online.role) === "guest" || !!(online == null ? void 0 : online.started);
    $("coop-difficulty").disabled = (online == null ? void 0 : online.role) === "guest" || !!(online == null ? void 0 : online.started);
    $("coop-seat").classList.toggle("is-ready", computerSeat || linked || joining);
    $("coop-avatar").textContent = computerSeat ? "智" : linked || joining ? "友" : "候";
    $("coop-seat-title").innerHTML = computerSeat ? "电脑队友<small>已就绪 · 点击切换为等待玩家</small>" : linked || joining ? "联机队友<small>已加入房间</small>" : "等待其它玩家<small>点击席位，切换为电脑</small>";
    $("coop-host").disabled = !!online;
    $("coop-join").disabled = !!online;
    $("coop-code").readOnly = !!online;
    $("coop-start").disabled = !computerSeat && !linked;
    $("coop-start").textContent = computerSeat || linked ? "开始合作" : joining ? "等待主机开始" : "等待队友就绪";
  }
  $("start-coop").onclick = () => {
    computerSeat = false;
    $("start-menu").hidden = true;
    $("single-settings").hidden = true;
    $("coop-lobby").hidden = false;
    updateCoopSeat();
    $("coop-seat").focus();
  };
  $("coop-seat").onclick = () => {
    if (online) return;
    computerSeat = !computerSeat;
    updateCoopSeat();
  };
  $("coop-host").onclick = () => {
    computerSeat = false;
    connectOnline("create");
  };
  $("coop-join").onclick = () => {
    const code = $("coop-code").value.trim();
    if (!/^\d{6}$/.test(code)) return toast("请输入六位房号", "warning");
    computerSeat = false;
    connectOnline("join", code);
  };
  function sendCoopSettings() {
    if ((online == null ? void 0 : online.role) === "host") onlineSend({ type: "settings", enemyCount: Number($("coop-enemies").value), difficulty: $("coop-difficulty").value });
  }
  $("coop-enemies").onchange = sendCoopSettings;
  $("coop-difficulty").onchange = sendCoopSettings;
  $("coop-back").onclick = showStartMenu;
  $("coop-start").onclick = () => {
    if (!computerSeat && !((online == null ? void 0 : online.role) === "host" && online.peerConnected)) return;
    readSave();
    if (saved) modal('<p class="modal-kicker">双庄共守</p><h2>开启合作新局？</h2><p>将与' + (online ? "联机" : "电脑") + '队友开始合作，并替换本地存档。</p><button class="modal-primary" data-modal="coop-new">开始合作</button><button class="modal-secondary" data-modal="close">返回等待界面</button>');
    else newGame(true);
  };
  function modal(html) {
    paused = true;
    $("close-modal").hidden = false;
    $("modal-content").innerHTML = html;
    $("modal").hidden = false;
    $("menu-pause").setAttribute("aria-expanded", "true");
    $("close-modal").focus();
    refresh();
    sendPresence();
  }
  function closeModal() {
    if (started && !state.over && !playerState().selectedSkill) {
      showSkillChoice();
      return;
    }
    $("modal").hidden = true;
    paused = !started;
    $("close-modal").hidden = false;
    $("menu-pause").setAttribute("aria-expanded", "false");
    (started ? $("menu-pause") : !$("single-settings").hidden ? $("single-start") : !$("coop-lobby").hidden ? $("coop-seat") : $("start-single")).focus();
    lastFrame = performance.now();
    refresh();
    sendPresence();
  }
  $("close-modal").onclick = closeModal;
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });
  function showMenu() {
    if (!started) return;
    if ((online == null ? void 0 : online.role) === "guest") {
      modal('<p class="modal-kicker">双庄共守</p><h2>联机菜单</h2><p>房间 ' + online.code + " · 难度 " + difficultyName(state.difficulty) + ' · 战斗由服务器统一计算</p><button class="modal-primary" data-modal="close">继续游戏</button><button class="modal-secondary" data-modal="sound">音效：' + (sound ? "开" : "关") + '</button><button class="modal-secondary" data-modal="grid" aria-pressed="' + grid + '">地图网格：' + (grid ? "开" : "关") + '</button><button class="modal-secondary" data-modal="title">离开房间</button>');
      return;
    }
    modal('<p class="modal-kicker">庄园攻防</p><h2>已暂停</h2><p>对局 ' + duration(state.elapsed) + " · 难度 " + difficultyName(state.difficulty) + (online ? " · 战斗由服务器统一计算" : "") + '</p><button class="modal-primary" data-modal="close">继续游戏</button>' + (online ? "" : autoplaySettings()) + '<button class="modal-secondary" data-modal="save">保存进度</button><button class="modal-secondary" data-modal="sound">音效：' + (sound ? "开" : "关") + '</button><button class="modal-secondary" data-modal="grid" aria-pressed="' + grid + '">地图网格：' + (grid ? "开" : "关") + '</button><div class="modal-row"><button class="modal-secondary" data-modal="export">导出存档</button><button class="modal-secondary" data-modal="import">导入存档</button></div><input id="save-file" type="file" accept=".json,application/json" hidden><button class="modal-secondary danger" data-modal="reset">重新开始</button><button class="modal-secondary" data-modal="title">返回开始菜单</button><p id="save-status">' + saveStatus + "</p>");
  }
  function autoplaySettings() {
    const r = pilot == null ? void 0 : pilot.report(), seconds = Math.floor((r == null ? void 0 : r.activeSeconds) || 0);
    return '<section class="autoplay-settings" aria-label="托管跑测"><button class="modal-secondary" data-modal="autoplay" aria-pressed="' + autoplay + '" ' + (state.over ? "disabled" : "") + ">" + (autoplay ? "关闭托管 · 手动接管" : "启用托管 · 电脑游玩") + "</button><p>自动经营、升级、防守与施法。启用即继续游戏；打开菜单或切到后台会暂停，失守后停止。</p>" + (r ? "<p>累计托管 " + Math.floor(seconds / 60) + " 分 " + seconds % 60 + " 秒 · 建造 " + r.builds + " · 升级 " + r.upgrades + " · 施法 " + Object.values(r.skills).reduce((a, b) => a + b, 0) + " 次<br>最近操作：" + r.lastAction + '</p><button class="modal-secondary autoplay-report" data-modal="autoplay-report">导出托管报告</button>' : "") + "</section>";
  }
  function toggleAutoplay() {
    if (state.over || playerState().eliminated) return;
    if (autoplay) {
      autoplay = false;
      playerState().controller = "human";
      showMenu();
      toast("托管已关闭，可手动接管");
      return;
    }
    if (!pilot) pilot = GFAutoplay.create(GF.playerView(state));
    autoplay = true;
    playerState().controller = "autoplay";
    closePanel();
    closeModal();
    toast("托管已启用 · 电脑开始经营");
  }
  function showEnd() {
    autoplay = false;
    const title = { victory: "攻城告捷", defeat: "古坊失守", draw: "双方同归" }[state.result] || "对局结束";
    modal('<p class="modal-kicker">庄园攻防</p><h2>' + title + '</h2><div class="modal-stats"><div><strong>' + duration(state.elapsed) + "</strong><span>对局时长</span></div><div><strong>" + state.players.filter((p) => p.team === 0).reduce((n, p) => n + p.kills, 0) + "</strong><span>我方击杀</span></div></div>" + ((online == null ? void 0 : online.role) === "guest" ? "" : '<button class="modal-primary" data-modal="new">重新开始</button>') + '<button class="modal-secondary" data-modal="close">查看战场</button><button class="modal-secondary" data-modal="title">返回开始菜单</button>');
  }
  function newGame(coop = started && state.mode === "coop") {
    if (online) {
      if (online.role === "host") {
        online.awaitingState = true;
        onlineSend({ type: "start" });
      }
      return;
    }
    const selectedEnemies = document.querySelector('input[name="single-enemies"]:checked');
    const selectedDifficulty = document.querySelector('input[name="single-difficulty"]:checked');
    const enemyCount = started && state.mode === (coop ? "coop" : "single") ? state.enemyCount : Number(coop ? $("coop-enemies").value : (selectedEnemies == null ? void 0 : selectedEnemies.value) || 1);
    const difficulty = started && state.mode === (coop ? "coop" : "single") ? state.difficulty : coop ? $("coop-difficulty").value : (selectedDifficulty == null ? void 0 : selectedDifficulty.value) || "beginner";
    enterGame(GF.createMatch({ mode: coop ? "coop" : "single", enemyCount, difficulty }));
    save();
  }
  function downloadSave(raw) {
    const blob = new Blob([raw], { type: "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url;
    a.download = "庄园攻防-" + Math.floor(state.elapsed) + "秒.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  $("modal-content").addEventListener("click", (e) => {
    var _a;
    const action = (_a = e.target.closest("[data-modal]")) == null ? void 0 : _a.dataset.modal;
    if (!action) return;
    if (action === "choose-skill") {
      const id = e.target.closest("[data-choice]").dataset.choice;
      if (online) {
        for (const el of $("modal-content").querySelectorAll("[data-choice]")) el.disabled = true;
        const result2 = onlineAction("choose-skill", { skill: id });
        if (!result2.ok) for (const el of $("modal-content").querySelectorAll("[data-choice]")) el.disabled = false;
        return;
      }
      const result = GF.chooseSkill(playerState(), id);
      if (result.ok) {
        save();
        closeModal();
      }
      return;
    }
    if (action === "close") closeModal();
    if (action === "save") save(true);
    if (action === "sound") {
      toggleSound();
      e.target.closest("[data-modal]").textContent = "音效：" + (sound ? "开" : "关");
    }
    if (action === "title") showStartMenu();
    if (action === "grid") {
      grid = !grid;
      try {
        localStorage.setItem(GRID_KEY, grid ? "on" : "off");
      } catch (e2) {
      }
      const button = e.target.closest("[data-modal]");
      button.textContent = "地图网格：" + (grid ? "开" : "关");
      button.setAttribute("aria-pressed", String(grid));
    }
    if (action === "autoplay") toggleAutoplay();
    if (action === "autoplay-report" && pilot) {
      const report = __spreadProps(__spreadValues({}, pilot.report()), { enabled: autoplay, finalSave: JSON.parse(GF.serialize(state)) }), blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url;
      a.download = "庄园攻防-托管报告.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
      toast("托管报告已导出");
    }
    if (action === "confirm-demolish") {
      const b = demolishTarget;
      demolishTarget = null;
      if (online) {
        closeModal();
        if (b) onlineAction("demolish", { x: b.x, y: b.y });
        return;
      }
      const r = b ? GF.demolish(state, b) : { ok: false };
      closeModal();
      if (r.ok) {
        toast("已拆除，返还 " + costText(r.refund));
        panelKey = "";
        handleEvents();
        save();
      }
      refresh();
    }
    if (action === "cancel-demolish") {
      demolishTarget = null;
      closeModal();
    }
    if (action === "reset") modal(`<p class="modal-kicker">另起新篇</p><h2>重建古坊</h2><p>重新开始会替换此浏览器中的现有进度。可先返回菜单导出存档。</p><button class="modal-primary" data-modal="new">重新开始</button><button class="modal-secondary" data-modal="menu">返回，保留当前古坊</button>`);
    if (action === "new") newGame();
    if (action === "coop-new") newGame(true);
    if (action === "menu") showMenu();
    if (action === "export") {
      if (online) onlineSend({ type: "save", export: true });
      else {
        downloadSave(GF.serialize(state));
        toast("存档已导出");
      }
    }
    if (action === "import") {
      if (online) {
        toast("请先退出联机，再导入存档", "warning");
        return;
      }
      const input = $("save-file");
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 8e6) {
          toast("存档文件过大", "warning");
          return;
        }
        const loaded = GF.restore(await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsText(file);
        }));
        if (!loaded) {
          toast("存档无效；旧版防守存档不再支持，请重开", "warning");
          return;
        }
        enterGame(loaded);
        save();
        refresh();
        toast("已载入攻防对局");
        if (state.over) showEnd();
      };
      input.click();
    }
  });
  let gesture = null, suppressMapClick = false;
  document.addEventListener("pointerdown", () => {
    suppressMapClick = false;
  }, true);
  document.addEventListener("click", (e) => {
    if (suppressMapClick && e.detail > 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    canvas.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) gesture = { x: p.x, y: p.y, lastX: p.x, lastY: p.y, dragged: false, multi: false };
    else {
      gesture.multi = true;
      gesture.dragged = true;
      const a = [...pointers.values()];
      gesture.pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      gesture.mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const p = localPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2) {
      const a = [...pointers.values()], mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }, dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      if (gesture.pinchDist > 0) zoom(dist / gesture.pinchDist, gesture.mid.x, gesture.mid.y);
      cam.x += mid.x - gesture.mid.x;
      cam.y += mid.y - gesture.mid.y;
      gesture.pinchDist = dist;
      gesture.mid = mid;
      clampCamera();
    } else {
      if (Math.hypot(p.x - gesture.x, p.y - gesture.y) > 5) gesture.dragged = true;
      if (gesture.dragged) {
        cam.x += p.x - gesture.lastX;
        cam.y += p.y - gesture.lastY;
        clampCamera();
      }
      gesture.lastX = p.x;
      gesture.lastY = p.y;
    }
  });
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    const click = gesture && !gesture.dragged && !gesture.multi && e.type !== "pointercancel";
    pointers.delete(e.pointerId);
    if (click) {
      suppressMapClick = true;
      const p = localPoint(e), x = Math.floor((p.x - cam.x) / cam.zoom / GFArt.T), y = Math.floor((p.y - cam.y) / cam.zoom / GFArt.T);
      select(x, y);
    }
    if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      gesture.lastX = p.x;
      gesture.lastY = p.y;
    }
    if (!pointers.size) gesture = null;
  }
  canvas.addEventListener("pointerup", pointerEnd);
  canvas.addEventListener("pointercancel", pointerEnd);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = localPoint(e);
    zoom(Math.exp(-e.deltaY * 1e-3), p.x, p.y);
  }, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  const cardDrag = { active: false, moved: false, suppress: false, x: 0, y: 0, scroll: 0 };
  $("cards").addEventListener("pointerdown", (e) => {
    cardDrag.active = true;
    cardDrag.moved = false;
    cardDrag.suppress = false;
    cardDrag.x = e.clientX;
    cardDrag.y = e.clientY;
    cardDrag.scroll = $("cards").scrollLeft;
  });
  $("cards").addEventListener("dragstart", (e) => e.preventDefault());
  window.addEventListener("pointermove", (e) => {
    var _a;
    if (!cardDrag.active) return;
    if (Math.abs(e.clientX - cardDrag.x) > 6 || Math.abs(e.clientY - cardDrag.y) > 6) cardDrag.moved = true;
    if (cardDrag.moved && e.pointerType === "mouse") {
      e.preventDefault();
      (_a = window.getSelection()) == null ? void 0 : _a.removeAllRanges();
      $("cards").scrollLeft = cardDrag.scroll - (e.clientX - cardDrag.x);
      cardDrag.suppress = true;
    }
  });
  window.addEventListener("pointerup", () => {
    if (!cardDrag.active) return;
    cardDrag.active = false;
    if (cardDrag.moved) {
      cardDrag.suppress = true;
      setTimeout(() => cardDrag.suppress = false, 0);
    }
  });
  window.addEventListener("pointercancel", () => {
    if (!cardDrag.active) return;
    cardDrag.active = false;
    cardDrag.moved = true;
    cardDrag.suppress = true;
    setTimeout(() => cardDrag.suppress = false, 0);
  });
  window.addEventListener("keydown", (e) => {
    const overlay = !$("modal").hidden ? $("modal") : !$("single-settings").hidden ? $("single-settings") : !$("coop-lobby").hidden ? $("coop-lobby") : !started ? $("start-menu") : null;
    if (e.key === "Tab" && overlay) {
      const buttons = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter((el) => !el.hidden && el.getClientRects().length), first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
        e.preventDefault();
        last == null ? void 0 : last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
        e.preventDefault();
        first == null ? void 0 : first.focus();
      }
    }
    if (e.code === "Space" && started && !e.target.closest("button,input")) {
      e.preventDefault();
      if (paused) closeModal();
      else showMenu();
    }
    if (e.key === "Escape") {
      if (!$("modal").hidden) closeModal();
      else if (!$("single-settings").hidden || !$("coop-lobby").hidden) showStartMenu();
      else if (started) closePanel();
    }
  });
  document.addEventListener("visibilitychange", () => {
    hiddenPause = document.hidden;
    if (hiddenPause) save();
    sendPresence();
    lastFrame = performance.now();
  });
  window.addEventListener("pagehide", () => save());
  window.addEventListener("resize", resize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
  function frame(now) {
    const dt = lastFrame ? Math.max(0, Math.min(1, (now - lastFrame) / 1e3)) : 0;
    lastFrame = now;
    const running = started && !paused && !hiddenPause && !state.over && GF.ready(state) && !online;
    if (running) {
      simulationClock += dt;
      if (simulationClock + 1e-8 >= 1 / 30) {
        let remaining = simulationClock;
        simulationClock = 0;
        while (remaining > 0 && !paused && !state.over) {
          const tick = Math.min(0.1, remaining);
          GF.step(state, tick);
          remaining -= tick;
        }
        handleEvents();
      }
    } else simulationClock = 0;
    if (online && started && !hiddenPause) {
      remoteMotion == null ? void 0 : remoteMotion.advance(now / 1e3, online.peerConnected && !online.serverPaused && !online.awaitingState && !state.over);
      const live = online.peerConnected && !online.serverPaused && !online.awaitingState && performance.now() - guestClockAt < 250;
      if (live) GF.stepEconomy(playerState(), Math.min(dt, 0.1));
      if (live) for (const group of [state.effects, state.projectiles]) for (const effect2 of group) effect2.life -= dt;
      state.effects = state.effects.filter((e) => e.life > 0);
      const projectileTargets = new Map([...state.soldiers, ...state.buildings].map((e) => [e.id, e]));
      state.projectiles = state.projectiles.filter((e) => {
        var _a;
        return e.life > 0 && ((_a = projectileTargets.get(e.targetId)) == null ? void 0 : _a.hp) > 0;
      });
      for (const projectile of state.projectiles) {
        const target = projectileTargets.get(projectile.targetId), p = projectile.targetType === "building" ? target : remotePosition(target, true);
        projectile.tx = p.x;
        projectile.ty = p.y;
      }
    }
    uiClock += dt;
    saveClock += dt;
    if (uiClock > 0.2) {
      refresh();
      uiClock = 0;
    }
    if (saveClock > 8) {
      if (!state.over) save();
      saveClock = 0;
    }
    if (started && !hiddenPause) {
      const remote = !!online;
      const animationTime = remote ? guestLive() : state.elapsed + (running && !paused && !state.over ? simulationClock : 0);
      const renderKey = [state.mapSeed, state.estateSeed, state.day, animationTime, state.revision, state.phase, state.over, playerState().coins, playerState().materials, cam.x, cam.y, cam.zoom, selected == null ? void 0 : selected.x, selected == null ? void 0 : selected.y, grid, playerOwner(), remoteAt, GFArt.spriteVersion()].join("|");
      if (renderKey !== lastRenderKey && (!renderInterval || now - lastRenderAt >= renderInterval - 1)) {
        GFArt.render(canvas, state, cam, selected, __spreadValues({ grid, player: playerOwner(), online: !!online, animationTime }, remote ? { unitPosition: remotePosition } : {}));
        lastRenderKey = renderKey;
        lastRenderAt = now;
      }
    }
    requestAnimationFrame(frame);
  }
  resize();
  refresh();
  requestAnimationFrame(frame);
  showStartMenu();
  window.Gufang = { get state() {
    return state;
  }, get online() {
    return online && { kind: online.kind, role: online.role, code: online.code, peerConnected: online.peerConnected };
  }, get camera() {
    return __spreadValues({}, cam);
  }, get paused() {
    return paused;
  }, get autoplay() {
    return autoplay;
  }, get autoplayReport() {
    return (pilot == null ? void 0 : pilot.report()) || null;
  }, get partnerReport() {
    return (partnerPilot == null ? void 0 : partnerPilot.report()) || null;
  }, select, refresh, screenPoint, save, setPaused(value) {
    if (value) showMenu();
    else closeModal();
  } };
})();
