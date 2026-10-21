/* Deterministic estate templates and attack/defence layouts. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GFMaps=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const worldSize=s=>s.worldSize, worldWidth=worldSize, worldHeight=s=>s.worldHeight||s.worldSize, worldCenter=s=>Math.floor(s.worldSize/2);
  const inside=(x,y,s)=>x>=0&&y>=0&&x<worldWidth(s)&&y<worldHeight(s);
  const dist8=(ax,ay,bx,by)=>Math.max(Math.abs(ax-bx),Math.abs(ay-by));
  const NEIGHBORS8=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  const world=s=>s, terrainCache=new WeakMap(), coopMaps=new WeakMap();
  function createTemplate(mapSeed){return {mapSeed:mapSeed>>>0,estateSeed:(Math.imul(mapSeed,2246822519)^3266489917)>>>0,mapGeneration:2,worldSize:25};}
  const generatedTerrain=s=>terrainCache.get(s)?.cells||variedTerrain(s);
  const baseTerrain=(x,y,s)=>generatedTerrain(s)[y*25+x]||'plain';
  function coopMap(s) {
    s = world(s);
    const cached = coopMaps.get(s); if (cached) return cached;
    // Facing wall lines overlap by exactly one tile: one shared divider, no lane.
    const horizontal = s.coopLayout === 'horizontal', gap = -1;
    const width = worldWidth(s), height = worldHeight(s);
    const sources = [createTemplate(s.mapSeed), createTemplate((Math.imul(s.mapSeed, 1664525) + 1013904223) >>> 0)];
    const originals = sources.map((source, owner) => {
      const original = estate(source), cells = new Set(original.cells);
      const axes = [...cells].map(k => horizontal ? k % 25 : Math.floor(k / 25));
      const face = owner === 0 ? Math.max(...axes) : Math.min(...axes);
      // Straighten only the common face; the other three edges keep their random contour.
      for (const key of [...cells]) {
        const axis = horizontal ? key % 25 : Math.floor(key / 25), cross = horizontal ? Math.floor(key / 25) : key % 25;
        for (let n = Math.min(axis, face); n <= Math.max(axis, face); n++) cells.add(horizontal ? cross * 25 + n : n * 25 + cross);
      }
      const walls = new Set();
      for (const k of cells) for (const [dx, dy] of NEIGHBORS8) if (!cells.has(k + dy * 25 + dx)) walls.add(k + dy * 25 + dx);
      for (const g of original.gates) walls.delete(g.y * 25 + g.x);
      return { ...original, cells, walls };
    });
    const bounds = originals.map(land => {
      const keys = [...land.cells, ...land.walls, ...land.gates.map(g => g.y * 25 + g.x)];
      return { min: Math.min(...keys.map(k => horizontal ? k % 25 : Math.floor(k / 25))), max: Math.max(...keys.map(k => horizontal ? k % 25 : Math.floor(k / 25))) };
    });
    const length = bounds.reduce((n, b) => n + b.max - b.min + 1, gap), start = Math.floor(((horizontal ? width : height) - length) / 2);
    const terrainCells = Array(width * height).fill('plain'), estates = [];
    let cursor = start;
    for (let owner = 0; owner < 2; owner++) {
      const original = originals[owner], source = sources[owner];
      const offset = cursor - bounds[owner].min, dx = horizontal ? offset : Math.floor(width / 2) - 12, dy = horizontal ? Math.floor(height / 2) - 12 : offset;
      cursor += bounds[owner].max - bounds[owner].min + 1 + gap;
      const convert = key => (Math.floor(key / 25) + dy) * width + key % 25 + dx;
      const cells = new Set([...original.cells].map(convert));
      const walls = new Set([...original.walls, ...original.gates.map(g => g.y * 25 + g.x)].map(convert));
      const center = { x: 12 + dx, y: 12 + dy };
      const inward = horizontal ? (owner === 0 ? 1 : 3) : (owner === 0 ? 2 : 0);
      const gates = original.gates.filter(g => g.direction !== inward).map(g => ({ ...g, x: g.x + dx, y: g.y + dy, owner }));
      const inner = owner === 0 ? bounds[owner].max - 2 : bounds[owner].min + 2;
      for (const g of gates) {
        if (horizontal ? g.direction % 2 === 0 : g.direction % 2 === 1) {
          const line = [...original.cells].filter(k => (horizontal ? k % 25 : Math.floor(k / 25)) === inner);
          if (horizontal) { g.x = inner + dx; g.y = (g.direction === 0 ? Math.min(...line.map(k => Math.floor(k / 25))) - 1 : Math.max(...line.map(k => Math.floor(k / 25))) + 1) + dy; }
          else { g.y = inner + dy; g.x = (g.direction === 3 ? Math.min(...line.map(k => k % 25)) - 1 : Math.max(...line.map(k => k % 25)) + 1) + dx; }
        }
        walls.delete(g.y * width + g.x);
      }
      const roads = new Set([...original.roads].filter(k => original.cells.has(k)).map(convert));
      const root = center.y * width + center.x, queue = [root], parents = new Map([[root, null]]);
      for (let i = 0; i < queue.length; i++) for (const delta of [-width, 1, width, -1]) {
        const next = queue[i] + delta;
        if (cells.has(next) && !parents.has(next)) { parents.set(next, queue[i]); queue.push(next); }
      }
      for (const g of gates) {
        const [gx, gy] = [[0,-1],[1,0],[0,1],[-1,0]][g.direction];
        let key = (g.y - gy) * width + g.x - gx;
        while (key != null) { roads.add(key); key = parents.get(key); }
        roads.add(g.y * width + g.x);
      }
      for (const key of [...original.cells, ...original.walls]) terrainCells[convert(key)] = baseTerrain(key % 25, Math.floor(key / 25), source);
      for (const g of gates) terrainCells[g.y * width + g.x] = 'plain';
      estates.push({ owner, cells, walls, gates, roads, center });
    }
    const merge = property => [].concat(...estates.map(e => Array.from(e[property])));
    const combined = { cells: new Set(merge('cells')), walls: new Set(merge('walls')), gates: merge('gates'), roads: new Set(merge('roads')), estates, gap: 0, sharedWall: new Set([...estates[0].walls].filter(k => estates[1].walls.has(k))) };
    for (const g of combined.gates) {
      const [dx, dy] = [[0,-1],[1,0],[0,1],[-1,0]][g.direction];
      for (let x = g.x + dx, y = g.y + dy; x >= 0 && y >= 0 && x < width && y < height; x += dx, y += dy) {
        const key = y * width + x;
        if (combined.walls.has(key) || combined.cells.has(key)) break;
        combined.roads.add(key); terrainCells[key] = 'plain';
      }
    }
    const value = { land: combined, terrain: terrainCells }; coopMaps.set(s, value); return value;
  }
  function variedTerrain(s) {
    let seed = s.mapSeed >>> 0;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = n => Math.floor(rand() * n), cells = Array(625).fill('plain'), turn = pick(4);
    const index = (x, y) => {
      for (let i = 0; i < turn; i++) [x, y] = [24 - y, x];
      return y * 25 + x;
    };
    // Random endpoints and bends; rotate the river to any of the four sides.
    // Near the shrine it passes within reach of the estate without flooding its core.
    let rx = 2 + pick(8);
    for (let y = 1; y < 24; y++) {
      const limit = y >= 8 && y <= 16 ? 8 : 9;
      const target = y >= 10 && y <= 14 ? 8 : Math.max(2, Math.min(limit, rx + pick(5) - 2));
      const next = Math.min(limit, target);
      for (let x = Math.min(rx, next); x <= Math.max(rx, next); x++) cells[index(x,y)] = 'water';
      rx = next;
    }
    // Lakes may occur in every quadrant, separate from the river and each other.
    const lakeCount = 1 + pick(3);
    for (let n = 0; n < lakeCount; n++) {
      const candidates = [];
      for (let y = 2; y <= 22; y++) for (let x = 2; x <= 22; x++) {
        if (dist8(x,y,12,12) <= 4 || cells[y*25+x] === 'water') continue;
        if (NEIGHBORS8.every(([dx,dy]) => cells[(y+dy)*25+x+dx] !== 'water')) candidates.push([x,y]);
      }
      if (!candidates.length) break;
      const frontier = [candidates[pick(candidates.length)]], lake = new Set(), target = 5 + pick(5);
      while (frontier.length && lake.size < target) {
        const [x,y] = frontier.splice(pick(frontier.length),1)[0], key = y*25+x;
        if (x<1 || x>23 || y<1 || y>23 || dist8(x,y,12,12)<=3 || lake.has(key) || cells[key]==='water') continue;
        if (NEIGHBORS8.some(([dx,dy]) => cells[(y+dy)*25+x+dx]==='water' && !lake.has((y+dy)*25+x+dx))) continue;
        lake.add(key); cells[key]='water';
        frontier.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);
      }
      if (lake.size<5) for (const key of lake) cells[key]='plain';
    }
    // Fill tiny dry pockets enclosed by bends, preserving a connected land mass.
    const reached = new Set([312]), queue = [312];
    for (let i=0;i<queue.length;i++) {
      const x=queue[i]%25,y=Math.floor(queue[i]/25);
      for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const nx=x+dx,ny=y+dy,key=ny*25+nx;
        if (inside(nx,ny,s) && cells[key]!=='water' && !reached.has(key)) {reached.add(key);queue.push(key);}
      }
    }
    for (let key=0;key<625;key++) if (!reached.has(key)) cells[key]='water';
    const dry = (x,y) => inside(x,y,s) && dist8(x,y,12,12)>2 && cells[y*25+x]==='plain' && NEIGHBORS8.every(([dx,dy]) => !inside(x+dx,y+dy,s) || cells[(y+dy)*25+x+dx]!=='water');
    // Guarantee both resource terrains in the shared buildable ring, at random sites.
    const anchors = [];
    for (const type of ['forest','mountain']) {
      const candidates = [];
      for (let y=9;y<=15;y++) for (let x=9;x<=15;x++) if (dry(x,y)) candidates.push([x,y]);
      const [x,y] = candidates[pick(candidates.length)]; cells[y*25+x]=type;
      anchors.push({type,x,y});
    }
    for (const type of ['forest','mountain']) {
      const anchor=anchors.find(a=>a.type===type), patches=[anchor];
      for(let i=0,n=2+pick(3);i<n;i++) patches.push({x:2+pick(21),y:2+pick(21)});
      for (const {x:cx,y:cy} of patches) {
        const ax=1.5+rand()*2.5,ay=1.5+rand()*2.5;
        for (let y=Math.max(0,cy-4);y<=Math.min(24,cy+4);y++) for (let x=Math.max(0,cx-4);x<=Math.min(24,cx+4);x++) {
          if (dry(x,y) && ((x-cx)/ax)**2+((y-cy)/ay)**2<.7+rand()*.6) cells[y*25+x]=type;
        }
      }
    }
    terrainCache.set(s,{seed:s.mapSeed,size:25,generation:s.mapGeneration,cells});
    return cells;
  }
  const estateCache = new WeakMap();
  function estate(s) {
    if (s?.estateSeed === undefined) return null;
    const cached = estateCache.get(s);
    if (cached?.seed === s.estateSeed && cached.mapSeed === s.mapSeed && cached.generation === s.mapGeneration) return cached.value;
    generatedTerrain(s);
    let seed = s.estateSeed >>> 0;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const size = worldSize(s), center = worldCenter(s), cells = new Set(), walls = new Set(), roads = new Set(), rows = [];
    let top = 6, bottom = 18;
    if (s.mapGeneration === 2) {
      top=6+Math.floor(rand()*3);bottom=16+Math.floor(rand()*3);
      const west=6+Math.floor(rand()*3),east=16+Math.floor(rand()*3);
      const shape=Math.floor(rand()*3),corners=Array.from({length:4},()=>Math.floor(rand()*4));
      for(let y=top;y<=bottom;y++) {
        const upper=y<=12,t=Math.abs(y-12)/(upper?12-top:bottom-12);
        const profile=shape===0?t:shape===1?t*t:Math.max(0,t-.5)*2;
        rows[y]=[Math.min(9,west+Math.floor(profile*corners[upper?0:2])),Math.max(15,east-Math.floor(profile*corners[upper?1:3]))];
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
    const gates = [{ x: center, y: top - 1, direction: 0 }, { x: rows[12][1] + 1, y: center, direction: 1 },
      { x: center, y: bottom + 1, direction: 2 }, { x: rows[12][0] - 1, y: center, direction: 3 }];
    for (const g of gates) walls.delete(g.y * size + g.x);
    // Only the four gate roads may cross water; other water stays unobstructed.
    const root = center * size + center, parents = new Map([[root, null]]), queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i];
      for (const offset of [-size, 1, size, -1]) {
        const next = key + offset;
        if (cells.has(next) && !parents.has(next)) { parents.set(next, key); queue.push(next); }
      }
    }
    const connect = key => {
      while (key !== null) {
        roads.add(key);
        key = parents.get(key) ?? null;
      }
    };
    for (const [i, g] of gates.entries()) {
      const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][i];
      connect((g.y - dy) * size + g.x - dx);
      for (let x = g.x, y = g.y; inside(x, y, s); x += dx, y += dy) roads.add(y * size + x);
    }
    const value = { cells, walls, gates, roads };
    estateCache.set(s, { seed: s.estateSeed, mapSeed: s.mapSeed, generation:s.mapGeneration, value });
    return value;
  }

  const EDGE_CROP=3;
  const ESTATE_SIZES=Object.freeze({
    mini:Object.freeze({name:'迷你',area:30,tile:19,pair:28}),
    small:Object.freeze({name:'小',area:60,tile:21,pair:32}),
    medium:Object.freeze({name:'中',area:110,tile:25,pair:40}),
    large:Object.freeze({name:'大',area:200,tile:31,pair:52})
  });
  function sizedTemplate(seed,config,paired){
    const width=config.tile,height=paired?config.pair:width;
    let randomSeed=seed>>>0;
    const rand=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
    const shapes=Array.from({length:paired?2:1},()=>{
      const area=Math.round(config.area*(.92+rand()*.16)),w=Math.max(5,Math.round(Math.sqrt(area)*(.9+rand()*.2))),h=Math.ceil(area/w);
      const rows=Array.from({length:h},()=>[-Math.floor(w/2),w-1-Math.floor(w/2)]);
      let excess=w*h-area,turn=0;
      while(excess>0){const y=turn%2?h-1-Math.floor(turn/2)%h:Math.floor(turn/2)%h,row=rows[y];
        if(Math.abs(y-Math.floor(h/2))>1&&row[1]-row[0]>=3){if((rand()<.5&&row[0]<0)||row[1]===0)row[0]++;else row[1]--;excess--;}
        turn++;
      }
      return {rows,h,terrain:generatedTerrain(createTemplate((randomSeed^seed)>>>0))};
    });
    const firstTop=paired?Math.floor((height-shapes[0].h-shapes[1].h-3)/2)+1:Math.floor((height-shapes[0].h)/2);
    const estates=shapes.map((shape,i)=>{
      const top=i?firstTop+shapes[0].h+1:firstTop,cx=Math.floor(width/2),cy=top+Math.floor(shape.h/2),cells=new Set(),walls=new Set(),roads=new Set();
      for(const [y,row] of shape.rows.entries())for(let x=row[0];x<=row[1];x++)cells.add((top+y)*width+cx+x);
      for(const k of cells)for(const [dx,dy] of NEIGHBORS8){const next=k+dy*width+dx;if(!cells.has(next))walls.add(next);}
      const centerRow=shape.rows[Math.floor(shape.h/2)];
      const gates=[{x:cx,y:top-1,direction:0},{x:cx+centerRow[1]+1,y:cy,direction:1},{x:cx,y:top+shape.h,direction:2},{x:cx+centerRow[0]-1,y:cy,direction:3}];
      for(const g of gates)walls.delete(g.y*width+g.x);
      const root=cy*width+cx,parents=new Map([[root,null]]),queue=[root];
      for(let n=0;n<queue.length;n++)for(const delta of [-width,1,width,-1]){const next=queue[n]+delta;if(cells.has(next)&&!parents.has(next)){parents.set(next,queue[n]);queue.push(next);}}
      for(const g of gates){const [dx,dy]=[[0,-1],[1,0],[0,1],[-1,0]][g.direction];let k=(g.y-dy)*width+g.x-dx;while(k!==null&&k!==undefined){roads.add(k);k=parents.get(k);}roads.add(g.y*width+g.x);}
      return {cells,walls,roads,gates,center:{x:cx,y:cy}};
    });
    const terrain=Array(width*height).fill('plain'),scale=Math.sqrt(config.area/110);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=paired&&y>=firstTop+shapes[0].h+1?1:0,e=estates[i];
      const sx=Math.max(0,Math.min(24,Math.round(12+(x-e.center.x)/scale))),sy=Math.max(0,Math.min(24,Math.round(12+(y-e.center.y)/scale)));
      terrain[y*width+x]=shapes[i].terrain[sy*25+sx];
    }
    for(const e of estates){
      const root=e.center.y*width+e.center.x;terrain[root]='plain';
      const plots=[...e.cells].filter(k=>!e.roads.has(k)).sort((a,b)=>Math.abs(a%width-e.center.x)+Math.abs(Math.floor(a/width)-e.center.y)-Math.abs(b%width-e.center.x)-Math.abs(Math.floor(b/width)-e.center.y)||a-b);
      if(plots.length>=3){terrain[plots[0]]='forest';terrain[plots[1]]='mountain';terrain[plots[plots.length-1]]='water';}
    }
    return {land:{estates},terrain};
  }
  function layoutDimensions(mode, count, estateSize='medium') {
    const {tile,pair}=ESTATE_SIZES[estateSize];
    return mode === 'coop' ? [count === 2 ? tile*2 : tile*3, count === 6 ? tile*2+pair : pair] : [[0,0],[tile*2,tile],[tile*3,tile],[tile*3,tile*2],[tile*3,tile*3]][count];
  }
  function dimensions(mode, count, estateSize='medium') {
    const [width,height]=layoutDimensions(mode,count,estateSize);return [width-EDGE_CROP*2,height-EDGE_CROP*2];
  }
  function create(mapSeed, mode, count, rotation, estateSize='medium') {
    const config=ESTATE_SIZES[estateSize],tile=config.tile,pairHeight=config.pair;
    const [width,height] = layoutDimensions(mode,count,estateSize), turned=rotation%2;
    const outWidth=turned?height:width, outHeight=turned?width:height;
    const rotate=(x,y)=>rotation===0?[x,y]:rotation===1?[height-1-y,x]:rotation===2?[width-1-x,height-1-y]:[y,width-1-x];
    const index=(x,y)=>{const [rx,ry]=rotate(x,y);return ry*outWidth+rx;};
    const slots=[];
    const single=(owner,x,y,gates)=>slots.push({owners:[owner],x,y,gates:[gates]});
    const pair=(owners,x,y,gates)=>slots.push({owners,x,y,gates});
    if(mode==='single') {
      if(count===1){single(0,0,0,[1]);single(1,tile,0,[3]);}
      if(count===2){single(0,tile,0,[1,3]);single(1,0,0,[1]);single(2,tile*2,0,[3]);}
      if(count>=3){
        single(0,tile,tile,count===3?[0,1,3]:[0,1,2,3]);
        single(1,tile,0,[2]);single(2,0,tile,[1]);single(3,tile*2,tile,[3]);
        if(count===4)single(4,tile,tile*2,[0]);
      }
    } else {
      const y=count===6?tile:0;
      pair([0,1],count===2?0:tile,y,count===2?[[1],[1]]:count===4?[[1,3],[1,3]]:[[0,1,3],[1,2,3]]);
      pair([2,3],count===2?tile:0,y,count===2?[[3],[3]]:[[1],[1]]);
      if(count>=4)pair([4,5],tile*2,y,[[3],[3]]);
      if(count===6){single(6,tile,0,[2]);single(7,tile,tile+pairHeight,[0]);}
    }
    const terrain=Array(outWidth*outHeight).fill('plain'), estates=[];
    for(const slot of slots) {
      const seed=(Math.imul(mapSeed ^ (slot.owners[0]+1),2246822519)+3266489917)>>>0;
      const source=createTemplate(seed), isPair=slot.owners.length===2;
      const template=estateSize!=='medium'?sizedTemplate(seed,config,isPair):isPair?coopMap({...source,worldSize:25,worldHeight:40,coopLayout:'vertical'}):{land:{estates:[estate(source)]},terrain:generatedTerrain(source)};
      const convert=k=>index(k%tile+slot.x,Math.floor(k/tile)+slot.y);
      for(let y=0;y<(isPair?pairHeight:tile);y++)for(let x=0;x<tile;x++)terrain[index(x+slot.x,y+slot.y)]=template.terrain[y*tile+x];
      template.land.estates.forEach((land,i)=>{
        const owner=slot.owners[i], masks=slot.gates[i];
        const walls=new Set([...land.walls,...land.gates.filter(g=>!masks.includes(g.direction)).map(g=>g.y*tile+g.x)].map(convert));
        const gates=land.gates.filter(g=>masks.includes(g.direction)).map(g=>{
          const [x,y]=rotate(g.x+slot.x,g.y+slot.y);return {x,y,owner,direction:(g.direction+rotation)%4};
        });
        const originalCenter=land.center||{x:Math.floor(tile/2),y:Math.floor(tile/2)}, [cx,cy]=rotate(originalCenter.x+slot.x,originalCenter.y+slot.y);
        estates[owner]={owner,cells:new Set([...land.cells].map(convert)),walls,gates,roads:new Set([...land.roads].map(convert)),center:{x:cx,y:cy}};
      });
    }
    const merge=prop=>new Set(estates.flatMap(e=>[...e[prop]]));
    const land={estates,cells:merge('cells'),walls:merge('walls'),roads:merge('roads'),gates:estates.flatMap(e=>e.gates)};
    land.sharedWall=new Set();
    const seen=new Set();for(const e of estates)for(const k of e.walls){if(seen.has(k))land.sharedWall.add(k);seen.add(k);}
    // Join gate approaches through the public battlefield. Only roads bridge water;
    // no route can cut through an estate or its retained wall.
    const exterior=k=>k>=0&&k<terrain.length&&!land.cells.has(k)&&!land.walls.has(k);
    const approaches=land.gates.map(g=>{const [dx,dy]=[[0,-1],[1,0],[0,1],[-1,0]][g.direction];return (g.y+dy)*outWidth+g.x+dx;});
    const root=approaches[0], parents=new Int32Array(terrain.length).fill(-1),queue=[root];parents[root]=root;
    for(let i=0;i<queue.length;i++){
      const k=queue[i],x=k%outWidth,y=Math.floor(k/outWidth);
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
        const nx=x+dx,ny=y+dy,n=ny*outWidth+nx;
        if(nx>=0&&ny>=0&&nx<outWidth&&ny<outHeight&&exterior(n)&&parents[n]===-1){parents[n]=k;queue.push(n);}
      }
    }
    for(const k of approaches){
      if(parents[k]===-1)throw new Error('Unreachable estate approach');
      let next=k;while(next!==root){land.roads.add(next);next=parents[next];}land.roads.add(root);
    }
    // Original interior roads keep every retained gate connected to its shrine.
    for(const g of land.gates)land.roads.add(g.y*outWidth+g.x);
    const owners=new Int16Array(terrain.length).fill(-1);
    for(const e of estates)for(const k of [...e.cells,...e.gates.map(g=>g.y*outWidth+g.x)])owners[k]=e.owner;
    const walk=new Uint8Array(terrain.length);
    for(let k=0;k<terrain.length;k++)walk[k]=!land.walls.has(k)&&(terrain[k]!=='water'||land.roads.has(k))?1:0;
    const croppedWidth=outWidth-EDGE_CROP*2,croppedHeight=outHeight-EDGE_CROP*2;
    const cropKey=k=>{const x=k%outWidth,y=Math.floor(k/outWidth);return x>=EDGE_CROP&&y>=EDGE_CROP&&x<outWidth-EDGE_CROP&&y<outHeight-EDGE_CROP?(y-EDGE_CROP)*croppedWidth+x-EDGE_CROP:null;};
    const cropSet=set=>new Set([...set].map(cropKey).filter(k=>k!==null));
    const croppedEstates=estates.map(e=>({owner:e.owner,cells:cropSet(e.cells),walls:cropSet(e.walls),roads:cropSet(e.roads),gates:e.gates.map(g=>({...g,x:g.x-EDGE_CROP,y:g.y-EDGE_CROP})),center:{x:e.center.x-EDGE_CROP,y:e.center.y-EDGE_CROP}}));
    const croppedLand={estates:croppedEstates,cells:new Set(),walls:new Set(),roads:new Set(),gates:croppedEstates.flatMap(e=>e.gates),sharedWall:cropSet(land.sharedWall)};
    for(const e of croppedEstates)for(const prop of ['cells','walls','roads'])for(const k of e[prop])croppedLand[prop].add(k);
    for(const k of cropSet(land.roads))croppedLand.roads.add(k);
    const croppedTerrain=Array(croppedWidth*croppedHeight),croppedOwners=new Int16Array(croppedTerrain.length),croppedWalk=new Uint8Array(croppedTerrain.length);croppedOwners.fill(-1);
    for(let y=0;y<croppedHeight;y++)for(let x=0;x<croppedWidth;x++){const next=y*croppedWidth+x,old=(y+EDGE_CROP)*outWidth+x+EDGE_CROP;croppedTerrain[next]=terrain[old];croppedOwners[next]=owners[old];croppedWalk[next]=walk[old];}
    return {terrain:croppedTerrain,land:croppedLand,owners:croppedOwners,walk:croppedWalk,width:croppedWidth,height:croppedHeight};
  }
  return {create,dimensions,layoutDimensions,EDGE_CROP,ESTATE_SIZES};
});
