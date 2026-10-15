'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const imageUrl = name => 'data:image/png;base64,' + fs.readFileSync(path.join(root, name)).toString('base64');
const near = (actual, expected, label) => assert(Math.abs(actual - expected) < .001, `${label}: ${actual} != ${expected}`);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent('<canvas id="map" width="800" height="600" style="width:800px;height:600px"></canvas>');
    await page.evaluate(assets => { window.GF_ASSET_URLS = assets; }, {
      'assets/sprites/soldiers/player-red.png': imageUrl('assets/sprites/soldiers/player-red.png'),
      'assets/sprites/soldiers/ally-green.png': imageUrl('assets/sprites/soldiers/ally-green.png'),
      'assets/sprites/soldiers/enemy-purple.png': imageUrl('assets/sprites/soldiers/enemy-purple.png')
    });
    for (const file of ['maps.js', 'game.js', 'art.js']) await page.addScriptTag({ path: path.join(root, 'js', file) });
    await page.waitForFunction(() => GFArt.spriteVersion() >= 3);
    const frames = await page.evaluate(() => {
      const s = GF.createState(12345), canvas = document.getElementById('map'), c = canvas.getContext('2d');
      const u = { id: 999999, owner: 0, barracksId: 999998, x: 8, y: 8, level: 1, hp: 100, maxHp: 100,
        baseDamage: 18, attack: 0, targetOwner: 1, targetId: null, repelled: 0, slowed: 0, slowFactor: 1,
        waypoint: { x: 9, y: 8 } };
      s.soldiers = [u]; s.elapsed = 10;
      const camera = { x: canvas.clientWidth / 2 - (u.x * GFArt.T + 32),
        y: canvas.clientHeight / 2 - (u.y * GFArt.T + 32), zoom: 1 };
      const captureAll = (animationTime, extras = {}) => {
        const draws = [], original = c.drawImage;
        c.drawImage = function (...args) {
          if (args.length === 9 && args[3] === 20 && args[4] === 30) {
            const m = this.getTransform(); draws.push({ x: m.e, y: m.f, angle: Math.atan2(m.b, m.a), direction: (args[1] / 20) % 4 });
          }
          return original.apply(this, args);
        };
        try { GFArt.render(canvas, s, camera, null, { player: 0, animationTime, ...extras }); }
        finally { c.drawImage = original; }
        return draws;
      };
      const capture = animationTime => {
        const draws = captureAll(animationTime);
        if (draws.length !== 1) throw Error('Expected one soldier sprite, got ' + draws.length);
        return draws[0];
      };
      const initial = capture(10);
      u.x = 8.08; s.elapsed = 10.1;
      const moveStart = capture(10.1), moveHalf = capture(10.15), moveEnd = capture(10.2);
      u.attack = 1; s.elapsed = 10.2;
      const attackStart = capture(10.2), attackPeak = capture(10.25), attackEnd = capture(10.3);
      const remoteStart = captureAll(10.3, { online: true, unitPosition: unit => ({ x: unit.x - .2, y: unit.y }) })[0];
      const remoteHalf = captureAll(10.35, { online: true, unitPosition: unit => ({ x: unit.x - .1, y: unit.y }) })[0];
      const remoteEnd = captureAll(10.4, { online: true, unitPosition: unit => ({ x: unit.x, y: unit.y }) })[0];
      const diagonal={...u,id:1000002,x:8,y:8,waypoint:{x:9,y:9}};
      s.soldiers=[diagonal];
      const diagonalStart=captureAll(10.4,{online:true,unitPosition:()=>({x:8,y:8})})[0];
      const diagonalXLead=captureAll(10.45,{online:true,unitPosition:()=>({x:8.04,y:8.039})})[0];
      const diagonalYLead=captureAll(10.5,{online:true,unitPosition:()=>({x:8.079,y:8.08})})[0];
      s.soldiers = [u, { ...u, id: 1000000, x: u.x, level: 2 }, { ...u, id: 1000001, x: u.x, level: 3 }];
      captureAll(10.4); captureAll(10.5);
      const spaced = captureAll(10.6);
      return { initial, moveStart, moveHalf, moveEnd, attackStart, attackPeak, attackEnd, spaced, remoteStart, remoteHalf, remoteEnd, diagonalStart, diagonalXLead, diagonalYLead };
    });
    near(frames.moveStart.x, frames.initial.x, 'Movement begins at the previous simulation position');
    near(frames.moveHalf.x, (frames.moveStart.x + frames.moveEnd.x) / 2, 'Movement interpolates halfway between ticks');
    assert(frames.moveEnd.x > frames.moveHalf.x, 'Movement reaches the current simulation position smoothly');
    near(frames.attackStart.angle, 0, 'Attack begins without a rotation jump');
    near(Math.abs(frames.attackPeak.angle), 20 * Math.PI / 180, 'Attack reaches its peak on the render clock');
    near(frames.attackEnd.angle, 0, 'Attack returns smoothly to rest');
    assert.equal(frames.spaced.length, 3);
    let largestOffset=0;
    const center=frames.spaced.reduce((point,unit)=>({x:point.x+unit.x/3,y:point.y+unit.y/3}),{x:0,y:0});
    for(const unit of frames.spaced)largestOffset=Math.max(largestOffset,Math.hypot(unit.x-center.x,unit.y-center.y));
    for(let i=0;i<frames.spaced.length;i++)for(let j=i+1;j<frames.spaced.length;j++){
      assert(Math.hypot(frames.spaced[i].x-frames.spaced[j].x,frames.spaced[i].y-frames.spaced[j].y)>=8,'Overlapping soldiers are softly pushed apart');
    }
    assert(largestOffset<=11,'Separation stays a small visual offset instead of forming a fixed formation');
    assert.equal(frames.diagonalStart.direction,frames.diagonalXLead.direction,'A slight horizontal diagonal lead does not flip the sprite axis');
    assert.equal(frames.diagonalXLead.direction,frames.diagonalYLead.direction,'A slight vertical diagonal lead does not flip the sprite axis');
    near(frames.remoteHalf.x, (frames.remoteStart.x + frames.remoteEnd.x) / 2, 'Online positions remain linear between server frames');
    console.log('PASS soldier movement interpolation and continuous attack animation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
