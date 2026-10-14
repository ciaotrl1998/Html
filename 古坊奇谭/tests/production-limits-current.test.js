'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../js/game');

const limits={mulberry:6,farm:6,quarry:4,tea:4,mill:2,weaver:2,kiln:2,inn:2};

function emptyPlot(s){
  const width=G.worldWidth(s),gates=G.estate(s).gates;
  for(const k of G.estate(s).cells){
    const x=k%width,y=Math.floor(k/width);
    if(!G.at(s,x,y)&&!G.isWall(s,x,y)&&G.terrain(x,y,s)!=='water'&&!gates.some(g=>g.x===x&&g.y===y))return {x,y};
  }
  throw new Error('No empty plot');
}

test('production building limits match the current balance and block excess construction',()=>{
  for(const [type,limit] of Object.entries(limits)){
    const s=G.playerView(G.createMatch({mapSeed:42,rotation:0}),0);
    assert.equal(G.DEFS[type].limit,limit,type);
    for(let i=0;i<limit;i++){
      const plot=emptyPlot(s);
      assert(G.grantBuilding(s,type,plot.x,plot.y),type+' grant '+i);
    }
    const plot=emptyPlot(s);
    assert.equal(G.buildReason(s,type,plot.x,plot.y),`已达上限（${limit}座）`,type);
  }
});
