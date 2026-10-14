from pathlib import Path
p=Path('F:/Html/古坊奇谭/js/art.js');s=p.read_text(encoding='utf-8')
a=s.index('  function makeGround(');b=s.index('  function drawGroundDecorations(',a)
chunk=s[a:b]
chunk=chunk.replace('function makeGround(s,occupied)', 'function makeGround(s,occupied,left,top,right,bottom,scale)')
chunk=chunk.replace("canvas.width=size*T;canvas.height=height*T;const c=canvas.getContext('2d');", "canvas.width=Math.ceil(((right-left+1)*T+96)*scale);canvas.height=Math.ceil(((bottom-top+1)*T+96)*scale);const c=canvas.getContext('2d');c.scale(scale,scale);c.translate(48-left*T,48-top*T);")
chunk=chunk.replace('for(let y=0;y<height;y++)for(let x=0;x<size;x++){', 'for(let y=Math.max(0,top-1);y<=Math.min(height-1,bottom+1);y++)for(let x=Math.max(0,left-1);x<=Math.min(size-1,right+1);x++){',1)
chunk=chunk.replace("const x=index%size,y=Math.floor(index/size),px=x*T,py=y*T,water=", "const x=index%size,y=Math.floor(index/size);if(x<left-1||x>right+1||y<top-1||y>bottom+1)continue;const px=x*T,py=y*T,water=")
chunk=chunk.replace("const x=index%size,y=Math.floor(index/size),px=x*T,py=y*T;", "const x=index%size,y=Math.floor(index/size);if(x<left-1||x>right+1||y<top-1||y>bottom+1)continue;const px=x*T,py=y*T;")
tail=chunk.index('    // Bake the large map shadow')
chunk=chunk[:tail]+'''    drawGroundDecorations(c,s,occupied,Math.max(0,left-2),Math.max(0,top-2),Math.min(size-1,right+2),Math.min(height-1,bottom+2));
    return {canvas,left,top,right,bottom,scale};
  }
  function newGround(s,occupied){
    const size=GF.worldWidth(s),height=GF.worldHeight(s),estate=GF.estate(s),waterRows=Array.from({length:height},()=>[]);
    for(let y=0;y<height;y++)for(let x=0;x<size;x++)if(GF.terrain(x,y,s)==='water'&&!GF.isWall(s,x,y)&&!estate.roads.has(y*size+x))waterRows[y].push({x,outside:!GF.owns(s,x,y)});
    return {occupied:new Set(occupied),chunks:new Map(),waterRows};
  }
'''
s=s[:a]+chunk+s[b:]
a=s.index('  function updateGround(');b=s.index('  let ground, groundSeed;',a)
s=s[:a]+'''  function updateGround(s,occupied){
    const changed=[...ground.occupied].filter(k=>!occupied.has(k)).concat([...occupied].filter(k=>!ground.occupied.has(k)));
    for(const key of changed){const [x,y]=key.split(',').map(Number);for(const [id,tile] of ground.chunks)if(x>=tile.left-2&&x<=tile.right+2&&y>=tile.top-2&&y<=tile.bottom+2)ground.chunks.delete(id);}
    ground.occupied=new Set(occupied);
  }
'''+s[b:]
s=s.replace('ground=makeGround(s,occupied)', 'ground=newGround(s,occupied)')
a=s.index('    // Crop in world space');b=s.index('    if(options.grid)',a)
s=s[:a]+'''    // Bounded, zoom-aware chunks avoid allocating several full 75x90 map canvases.
    const scale=cam.zoom<.3?.25:cam.zoom<.65?.5:1;
    for(let cy=Math.floor(top/16);cy<=Math.floor(bottom/16);cy++)for(let cx=Math.floor(left/16);cx<=Math.floor(right/16);cx++){
      const key=cx+','+cy+','+scale;let tile=ground.chunks.get(key);
      if(!tile){tile=makeGround(s,occupied,cx*16,cy*16,Math.min(size-1,cx*16+15),Math.min(height-1,cy*16+15),scale);ground.chunks.set(key,tile);}
      else{ground.chunks.delete(key);ground.chunks.set(key,tile);}
      const tw=(tile.right-tile.left+1)*T,th=(tile.bottom-tile.top+1)*T;
      c.drawImage(tile.canvas,48*scale,48*scale,tw*scale,th*scale,tile.left*T,tile.top*T,tw,th);
    }
    while(ground.chunks.size>40)ground.chunks.delete(ground.chunks.keys().next().value);
'''+s[b:]
s=s.replace('window.GFArt={T,thumbnail,render};', "window.GFArt={T,thumbnail,render,cacheStats:()=>({chunks:ground?.chunks.size||0,pixels:[...(ground?.chunks.values()||[])].reduce((n,t)=>n+t.canvas.width*t.canvas.height,0),largestSide:Math.max(0,...[...(ground?.chunks.values()||[])].map(t=>Math.max(t.canvas.width,t.canvas.height)))})};")
# Cross-estate buildings must never display industry prerequisite links.
s=s.replace('if(!d.radius||GF.dist8', 'if(consumer.owner!==producer.owner||!d.radius||GF.dist8')
p.write_text(s,encoding='utf-8')
