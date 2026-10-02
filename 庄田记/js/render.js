(function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  var C = root.CFG;
  var G = C.GOODS;
  var T = C.TILE;
  var FONT = '"STKaiti","KaiTi","Kaiti SC","STSong","SimSun",serif';
  var CN = ['一', '二', '三', '四', '五'];

  var PAL = {
    grass: '#a7b77c',
    grassHi: 'rgba(240,244,200,0.07)',
    grassLo: 'rgba(70,95,50,0.07)',
    soil: '#c2a878',
    soilDark: '#a8895c',
    ink: '#3a2e20',
    inkSoft: '#6b5540',
    paper: '#f4ecd8',
    paperEdge: '#5a4630',
    wood: '#8a6238',
    woodDark: '#5a3b20',
    woodLight: '#b08a56',
    tileDark: '#3f4d5e',
    tileLight: '#60748a',
    tileInk: '#2a343f',
    ridge: '#28323e',
    red: '#a6362c',
    redDark: '#7d241e',
    redLight: '#c14a3a',
    gold: '#d4a94e',
    goldDeep: '#a87c24',
    straw: '#d9c08a',
    strawDark: '#b89a5e',
    jade: '#5e8a5a',
    water: '#8fb8c4'
  };

  var Render = {
    canvas: null,
    ctx: null,
    dpr: 1,
    cam: { x: 0, y: 0, s: 1 },
    ghost: null,
    selectedId: null,
    hoverTile: null,
    time: 0,
    staticLayer: null,
    moveGhost: null,
    hiddenBuildingId: null,
    cameraTouched: false
  };
  root.Render = Render;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function h2(x, y) {
    var n = (x * 374761393 + y * 668265263) | 0;
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  }

  function rrPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function fillRR(g, x, y, w, h, r, fill) {
    rrPath(g, x, y, w, h, r);
    g.fillStyle = fill;
    g.fill();
  }

  function strokeRR(g, x, y, w, h, r, stroke, lw) {
    rrPath(g, x, y, w, h, r);
    g.strokeStyle = stroke;
    g.lineWidth = lw || 1;
    g.stroke();
  }

  function inkText(g, text, x, y, size, color, align, bold) {
    g.font = (bold ? 'bold ' : '') + size + 'px ' + FONT;
    g.fillStyle = color;
    g.textAlign = align || 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y);
  }

  function resize() {
    var c = Render.canvas;
    var w = c.clientWidth || c.parentElement.clientWidth;
    var h = c.clientHeight || c.parentElement.clientHeight;
    var changed = Math.abs(w - Render.lastW) > 2 || Math.abs(h - Render.lastH) > 2;
    Render.lastW = w;
    Render.lastH = h;
    Render.dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(w * Render.dpr));
    c.height = Math.max(1, Math.round(h * Render.dpr));
    if (changed) {
      if (!Render.cameraTouched) Render.fit();
      else clampCam();
    }
  }

  Render.fit = function () {
    var c = Render.canvas;
    if (!c) return;
    var w = c.clientWidth || 360, h = c.clientHeight || 500;
    var mw = World.W * T, mh = World.H * T;
    var s = Math.min(w / mw, h / mh) * 0.985;
    Render.cam.s = s;
    Render.cam.x = (mw - w / s) / 2;
    Render.cam.y = (mh - h / s) / 2;
    Render.cameraTouched = false;
  };

  Render.getCam = function () {
    return { x: Render.cam.x, y: Render.cam.y, s: Render.cam.s, touched: !!Render.cameraTouched };
  };
  Render.setCam = function (cam) {
    if (!cam || typeof cam.s !== 'number' || !isFinite(cam.s)) return;
    Render.cam.s = clamp(cam.s, 0.4, 2.6);
    Render.cam.x = cam.x;
    Render.cam.y = cam.y;
    Render.cameraTouched = !!cam.touched;
    clampCam();
  };

  function clampCam() {
    var c = Render.canvas;
    if (!c) return;
    var w = c.clientWidth || 360, h = c.clientHeight || 500;
    var mw = World.W * T, mh = World.H * T;
    var vw = w / Render.cam.s, vh = h / Render.cam.s;
    if (vw >= mw + 4) Render.cam.x = (mw - vw) / 2;
    else Render.cam.x = clamp(Render.cam.x, -2, mw - vw + 2);
    if (vh >= mh + 4) Render.cam.y = (mh - vh) / 2;
    else Render.cam.y = clamp(Render.cam.y, -2, mh - vh + 2);
  }

  Render.screenToWorld = function (px, py) {
    return { x: px / Render.cam.s + Render.cam.x, y: py / Render.cam.s + Render.cam.y };
  };
  Render.screenToTile = function (px, py) {
    var w = Render.screenToWorld(px, py);
    return { x: Math.floor(w.x / T), y: Math.floor(w.y / T) };
  };
  Render.worldToScreen = function (wx, wy) {
    return { x: (wx - Render.cam.x) * Render.cam.s, y: (wy - Render.cam.y) * Render.cam.s };
  };

  Render.centerOn = function (tx, ty, scale) {
    var c = Render.canvas;
    if (!c) return;
    var w = c.clientWidth || 360, h = c.clientHeight || 500;
    if (scale) Render.cam.s = clamp(scale, 0.4, 2.6);
    Render.cam.x = tx * T - w / Render.cam.s / 2;
    Render.cam.y = ty * T - h / Render.cam.s / 2;
    clampCam();
  };

  Render.ensureVisible = function (tx, ty, th, reservedBottomPx) {
    var c = Render.canvas;
    if (!c) return;
    var h = c.clientHeight || 500;
    var usable = h - (reservedBottomPx || 0);
    var bottomScreen = ((ty + th) * T - Render.cam.y) * Render.cam.s;
    if (bottomScreen > usable - 10) {
      Render.cam.y += (bottomScreen - (usable - 10)) / Render.cam.s;
      clampCam();
    }
    var topScreen = (ty * T - Render.cam.y) * Render.cam.s;
    if (topScreen < 8) {
      Render.cam.y -= (8 - topScreen) / Render.cam.s;
      clampCam();
    }
  };

  function zoomAt(px, py, factor) {
    var before = Render.screenToWorld(px, py);
    Render.cameraTouched = true;
    Render.cam.s = clamp(Render.cam.s * factor, 0.4, 2.6);
    var after = Render.screenToWorld(px, py);
    Render.cam.x += before.x - after.x;
    Render.cam.y += before.y - after.y;
    clampCam();
  }

  Render.init = function (canvas, handlers) {
    Render.canvas = canvas;
    Render.ctx = canvas.getContext('2d');
    if (typeof handlers === 'function') handlers = { onTileTap: handlers };
    Render.handlers = handlers || {};
    resize();
    window.addEventListener('resize', resize);

    var pointers = new Map();
    var downPos = null, moved = false, pinchDist = 0, last = null;
    var drag = null, candidate = null;

    function local(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function tileAt(p) {
      return Render.screenToTile(p.x, p.y);
    }
    canvas.addEventListener('pointerdown', function (e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      var p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        downPos = p;
        last = p;
        moved = false;
        drag = null;
        candidate = null;
        if (Render.buildingDragEnabled !== false && Render.handlers && Render.handlers.onBuildingDragStart) {
          var t = tileAt(p);
          var b = World.buildingAt(t.x, t.y);
          if (b && b.type !== 'market' && b.id === Render.selectedId) candidate = b;
        }
      } else if (pointers.size === 2) {
        if (drag && drag.kind === 'building' && Render.handlers.onBuildingDragEnd) {
          Render.handlers.onBuildingDragEnd(drag.id, null, null);
        }
        drag = { kind: 'pinch' };
        candidate = null;
        moved = true;
        var a = Array.from(pointers.values());
        pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      var p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        if (!moved && Math.abs(p.x - downPos.x) + Math.abs(p.y - downPos.y) > 7) {
          moved = true;
          if (candidate && Render.handlers.onBuildingDragStart) {
            drag = { kind: 'building', id: candidate.id };
            Render.handlers.onBuildingDragStart(candidate.id);
          } else {
            drag = { kind: 'pan' };
          }
        }
        if (drag && drag.kind === 'building') {
          if (Render.handlers.onBuildingDragMove) {
            var t = tileAt(p);
            Render.handlers.onBuildingDragMove(drag.id, t.x, t.y);
          }
        } else if (drag && drag.kind === 'pan') {
          Render.cameraTouched = true;
          Render.cam.x -= (p.x - last.x) / Render.cam.s;
          Render.cam.y -= (p.y - last.y) / Render.cam.s;
          clampCam();
        }
        last = p;
      } else if (pointers.size === 2) {
        var a = Array.from(pointers.values());
        var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        var mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
        if (pinchDist > 0 && d > 0) zoomAt(mid.x, mid.y, d / pinchDist);
        pinchDist = d;
      }
    });
    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        if (drag && drag.kind === 'building' && Render.handlers.onBuildingDragEnd) {
          var p = local(e);
          var t = tileAt(p);
          Render.handlers.onBuildingDragEnd(drag.id, t.x, t.y);
        } else if (!moved && downPos && Render.handlers.onTileTap) {
          var t2 = tileAt(downPos);
          Render.handlers.onTileTap(t2.x, t2.y);
        }
        pinchDist = 0;
        downPos = null;
        drag = null;
        candidate = null;
        moved = false;
      } else if (pointers.size === 1) {
        if (drag && drag.kind === 'building' && Render.handlers.onBuildingDragEnd) {
          Render.handlers.onBuildingDragEnd(drag.id, null, null);
        }
        drag = { kind: 'pan' };
        downPos = Array.from(pointers.values())[0];
        last = downPos;
        moved = true;
      }
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = local(e);
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 0.89);
    }, { passive: false });
    canvas.addEventListener('dblclick', function (e) {
      e.preventDefault();
      Render.fit();
    });
  };

  function drawGrass(g) {
    var W = World.W, H = World.H;
    g.fillStyle = PAL.grass;
    g.fillRect(0, 0, W * T, H * T);
    var x, y;
    for (x = 0; x < W; x++) {
      for (y = 0; y < H; y++) {
        var v = h2(x, y);
        if (v > 0.72) {
          g.fillStyle = PAL.grassHi;
          g.fillRect(x * T, y * T, T, T);
        } else if (v < 0.28) {
          g.fillStyle = PAL.grassLo;
          g.fillRect(x * T, y * T, T, T);
        }
      }
    }
    var r = mulberry(7);
    var i;
    for (i = 0; i < 70; i++) {
      var cx = r() * W * T, cy = r() * H * T, rad = 22 + r() * 58;
      g.fillStyle = i % 2 ? 'rgba(120,150,80,0.075)' : 'rgba(232,238,180,0.06)';
      g.beginPath();
      g.ellipse(cx, cy, rad, rad * 0.7, 0, 0, Math.PI * 2);
      g.fill();
    }
    var r2 = mulberry(11);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(96,122,64,0.5)';
    for (i = 0; i < 320; i++) {
      x = r2() * W * T;
      y = r2() * H * T;
      var len = 4 + r2() * 4;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 1.5, y - len * 0.6, x + 3.5, y - len);
      g.stroke();
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x - 1.5, y - len * 0.55, x - 3, y - len * 0.9);
      g.stroke();
    }
    var r3 = mulberry(23);
    var colors = ['#f2e8cc', '#e0b84e', '#d07868'];
    for (i = 0; i < 46; i++) {
      x = r3() * W * T;
      y = r3() * H * T;
      g.fillStyle = colors[i % 3];
      g.beginPath();
      g.arc(x, y, 1.7, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawRoads(g) {
    var gap = World.gap, f = World.fence, m = World.market;
    g.fillStyle = PAL.soil;
    g.fillRect(gap.x * T, (f.y2 - 1) * T, gap.w * T, T * 2);
    g.fillRect((gap.x - 1) * T, (f.y2 + 1) * T, (gap.w + 2) * T, T);
    g.fillRect((m.x - 1) * T, (m.y - 1) * T, (m.w + 2) * T, T);
    var r = mulberry(31);
    function slab(cx, cy, w, h) {
      fillRR(g, cx - w / 2, cy - h / 2, w, h, 3, 'rgba(210,192,158,0.9)');
      strokeRR(g, cx - w / 2, cy - h / 2, w, h, 3, 'rgba(140,118,84,0.8)', 1);
    }
    for (var i = 0; i < 4; i++) {
      var sx = (gap.x + (i % 2)) * T + T / 2;
      var sy = (f.y2 + Math.floor(i / 2)) * T + T / 2;
      slab(sx + (r() - 0.5) * 4, sy + (r() - 0.5) * 4, 16 + r() * 6, 12 + r() * 5);
    }
    for (i = 0; i < 5; i++) {
      slab((m.x + 0.5 + i * 1.6) * T, (m.y - 0.5) * T, 18 + r() * 6, 13 + r() * 5);
    }
  }

  function drawLane(g) {
    var gap = World.gap, f = World.fence, plot = World.plot;
    var cx = (gap.x + gap.w / 2) * T;
    var top = (plot.y + 4) * T;
    var bottom = (f.y2 - 0.5) * T;
    g.save();
    g.fillStyle = 'rgba(194,168,120,0.5)';
    g.beginPath();
    g.moveTo(cx - T * 0.95, bottom);
    for (var y = bottom; y > top; y -= 12) {
      var w = T * 0.8 + Math.sin(y * 0.11) * T * 0.16;
      g.lineTo(cx - w, y);
    }
    for (y = top; y < bottom; y += 12) {
      var w2 = T * 0.8 + Math.cos(y * 0.09) * T * 0.16;
      g.lineTo(cx + w2, y);
    }
    g.lineTo(cx + T * 0.95, bottom);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(180,155,108,0.35)';
    g.beginPath();
    g.moveTo(cx - T * 0.55, bottom);
    for (y = bottom; y > top; y -= 16) g.lineTo(cx - T * 0.5 + Math.sin(y * 0.13) * 6, y);
    for (y = top; y < bottom; y += 16) g.lineTo(cx + T * 0.5 + Math.cos(y * 0.1) * 6, y);
    g.lineTo(cx + T * 0.55, bottom);
    g.closePath();
    g.fill();
    var r = mulberry(53);
    g.strokeStyle = 'rgba(140,118,84,0.5)';
    g.lineWidth = 1;
    for (var s = 0; s < 16; s++) {
      var sy = top + (bottom - top) * (s / 16) + r() * 8;
      var sx = cx + (r() - 0.5) * T * 1.4;
      rrPath(g, sx - 7, sy - 5, 14, 9 + r() * 4, 3);
      g.stroke();
    }
    g.restore();
  }

  function drawPine(g, px, py, s) {
    g.save();
    g.translate(px, py);
    g.scale(s, s);
    g.fillStyle = 'rgba(40,50,30,0.16)';
    g.beginPath();
    g.ellipse(2, 8, 12, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6b4a2a';
    g.fillRect(-2, -2, 4, 12);
    g.strokeStyle = '#3f3020';
    g.lineWidth = 1;
    g.strokeRect(-2, -2, 4, 12);
    function layer(yy, ww, color) {
      g.beginPath();
      g.moveTo(0, yy - 12);
      g.lineTo(-ww, yy);
      g.quadraticCurveTo(0, yy + 2.5, ww, yy);
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.strokeStyle = '#33452c';
      g.lineWidth = 1;
      g.stroke();
    }
    layer(-4, 11, '#3f5f38');
    layer(1, 9.5, '#4c7042');
    layer(6, 7.5, '#5d844e');
    g.restore();
  }

  function drawBamboo(g, px, py, s) {
    g.save();
    g.translate(px, py);
    g.scale(s, s);
    g.fillStyle = 'rgba(40,50,30,0.14)';
    g.beginPath();
    g.ellipse(0, 8, 10, 4, 0, 0, Math.PI * 2);
    g.fill();
    var stalks = [-6, 0, 6];
    for (var i = 0; i < stalks.length; i++) {
      var bx = stalks[i];
      var hgt = 18 + (i % 2) * 4;
      g.strokeStyle = '#8fae5a';
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(bx, 8);
      g.lineTo(bx + (i - 1) * 1.5, 8 - hgt);
      g.stroke();
      g.strokeStyle = 'rgba(60,80,40,0.7)';
      g.lineWidth = 1;
      for (var n = 0; n < 3; n++) {
        var ny = 8 - hgt * (0.3 + n * 0.25);
        g.beginPath();
        g.moveTo(bx - 1.6, ny);
        g.lineTo(bx + 1.6, ny);
        g.stroke();
      }
      g.fillStyle = '#6f9040';
      for (var lf = 0; lf < 3; lf++) {
        var ly = 8 - hgt + lf * 4;
        g.beginPath();
        g.ellipse(bx + (lf % 2 ? 4 : -4), ly, 4.5, 1.6, lf % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  function drawRock(g, px, py, s) {
    g.save();
    g.translate(px, py);
    g.scale(s, s);
    g.fillStyle = 'rgba(40,40,30,0.16)';
    g.beginPath();
    g.ellipse(0, 6, 11, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-10, 6);
    g.lineTo(-6, -6);
    g.lineTo(1, -9);
    g.lineTo(8, -4);
    g.lineTo(10, 6);
    g.closePath();
    g.fillStyle = '#9a978c';
    g.fill();
    g.strokeStyle = '#5f5c52';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.moveTo(-6, -6);
    g.lineTo(1, -9);
    g.lineTo(2, 0);
    g.lineTo(-4, 2);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(90,120,60,0.55)';
    g.beginPath();
    g.arc(5, 2, 1.6, 0, Math.PI * 2);
    g.arc(-3, 4, 1.2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawDecorStatic(g) {
    for (var i = 0; i < World.decor.length; i++) {
      var d = World.decor[i];
      var px = d.x * T + T / 2, py = d.y * T + T / 2;
      if (d.type === 'tree') {
        if (h2(d.x, d.y) > 0.68) drawBamboo(g, px, py, d.s);
        else drawPine(g, px, py, d.s);
      } else {
        drawRock(g, px, py, d.s);
      }
    }
  }

  function drawFence(g) {
    var f = World.fence, gap = World.gap;
    g.lineCap = 'round';
    function rail(x1, y1, x2, y2) {
      g.strokeStyle = '#7a5c30';
      g.lineWidth = 4.5;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.strokeStyle = '#c2a05e';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    var mid = T / 2;
    var x, y;
    for (x = f.x1; x <= f.x2; x++) {
      if (x >= gap.x && x < gap.x + gap.w) continue;
      rail(x * T, f.y1 * T + mid, (x + 1) * T, f.y1 * T + mid);
      rail(x * T, f.y2 * T + mid, (x + 1) * T, f.y2 * T + mid);
    }
    for (y = f.y1; y <= f.y2; y++) {
      rail(f.x1 * T + mid, y * T, f.x1 * T + mid, (y + 1) * T);
      rail(f.x2 * T + mid, y * T, f.x2 * T + mid, (y + 1) * T);
    }
    g.strokeStyle = 'rgba(120,92,48,0.75)';
    g.lineWidth = 1.2;
    for (x = f.x1; x <= f.x2; x++) {
      if (x >= gap.x && x < gap.x + gap.w) continue;
      for (var k = 0; k < 3; k++) {
        var sx = x * T + 6 + k * 10;
        g.beginPath();
        g.moveTo(sx, f.y1 * T + mid - 7);
        g.lineTo(sx, f.y1 * T + mid + 7);
        g.stroke();
        g.beginPath();
        g.moveTo(sx, f.y2 * T + mid - 7);
        g.lineTo(sx, f.y2 * T + mid + 7);
        g.stroke();
      }
    }
    for (y = f.y1; y <= f.y2; y++) {
      for (var k2 = 0; k2 < 3; k2++) {
        var sy = y * T + 6 + k2 * 10;
        g.beginPath();
        g.moveTo(f.x1 * T + mid - 7, sy);
        g.lineTo(f.x1 * T + mid + 7, sy);
        g.stroke();
        g.beginPath();
        g.moveTo(f.x2 * T + mid - 7, sy);
        g.lineTo(f.x2 * T + mid + 7, sy);
        g.stroke();
      }
    }
    function post(px, py) {
      fillRR(g, px - 4, py - 4, 8, 8, 2, '#8a8070');
      strokeRR(g, px - 4, py - 4, 8, 8, 2, '#4f4a40', 1.2);
    }
    for (x = f.x1; x <= f.x2; x += 4) {
      post(x * T + mid, f.y1 * T + mid);
      if (!(x >= gap.x && x < gap.x + gap.w)) post(x * T + mid, f.y2 * T + mid);
    }
    post(f.x1 * T + mid, f.y2 * T + mid);
    post(f.x2 * T + mid, f.y2 * T + mid);
    function gatePost(px, py) {
      g.fillStyle = '#a6362c';
      fillRR(g, px - 5, py - 14, 10, 24, 3, '#7a4a26');
      strokeRR(g, px - 5, py - 14, 10, 24, 3, '#3f2a15', 1.2);
      fillRR(g, px - 7, py - 18, 14, 6, 3, '#a6362c');
      strokeRR(g, px - 7, py - 18, 14, 6, 3, '#5a1a14', 1);
    }
    gatePost(gap.x * T + mid, f.y2 * T + mid);
    gatePost((gap.x + gap.w) * T - mid, f.y2 * T + mid);
  }

  Render.invalidateStatic = function () { Render.staticLayer = null; };

  function buildStatic() {
    var c = document.createElement('canvas');
    c.width = World.W * T;
    c.height = World.H * T;
    var g = c.getContext('2d');
    drawGrass(g);
    drawRoads(g);
    drawLane(g);
    drawDecorStatic(g);
    drawFence(g);
    drawInkWash(g);
    Render.staticLayer = c;
  }

  function drawInkWash(g) {
    var W = World.W * T, H = World.H * T;
    var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(45,32,15,0.26)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(245,238,215,0.10)';
    g.lineWidth = 2;
    g.lineCap = 'round';
    function cloud(cx, cy, s) {
      g.save();
      g.translate(cx, cy);
      g.scale(s, s);
      g.beginPath();
      g.arc(0, 0, 9, Math.PI * 0.15, Math.PI * 1.2);
      g.arc(11, -3, 7, Math.PI * 0.6, Math.PI * 1.6);
      g.arc(-11, -2, 6, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
      g.beginPath();
      g.moveTo(-20, 8);
      g.quadraticCurveTo(0, 13, 22, 7);
      g.stroke();
      g.restore();
    }
    var spots = [[0.6, 4.5], [World.W - 0.6, 12], [0.6, 19.5], [World.W - 0.6, 21], [3.5, World.H - 0.8]];
    for (var i = 0; i < spots.length; i++) cloud(spots[i][0] * T, spots[i][1] * T, 0.9 + (i % 3) * 0.25);
  }

  function drawRoof(g, px, py, pw, rh, tileDark, tileLight, ridgeColor) {
    fillRR(g, px - 1, py + rh - 5, pw + 2, 8, 3, 'rgba(35,28,16,0.18)');
    var inset = pw * 0.16;
    var grad = g.createLinearGradient(0, py, 0, py + rh);
    grad.addColorStop(0, tileLight);
    grad.addColorStop(1, tileDark);
    g.beginPath();
    g.moveTo(px - 2, py + rh);
    g.lineTo(px + pw + 2, py + rh);
    g.lineTo(px + pw - inset, py + 1.5);
    g.lineTo(px + inset, py + 1.5);
    g.closePath();
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = PAL.tileInk;
    g.lineWidth = 1.5;
    g.stroke();
    g.strokeStyle = 'rgba(18,26,36,0.22)';
    g.lineWidth = 1;
    var n = Math.max(4, Math.round(pw / 9));
    for (var i = 1; i < n; i++) {
      var t = i / n;
      var xt = px + inset + (pw - inset * 2) * t;
      var xb = px - 2 + (pw + 4) * t;
      g.beginPath();
      g.moveTo(xt, py + 2);
      g.lineTo(xb, py + rh - 0.5);
      g.stroke();
    }
    for (var yy = py + 5; yy < py + rh - 1; yy += 5) {
      var spread = (yy - py) * 0.06;
      g.beginPath();
      g.moveTo(px - 0.5 + spread, yy);
      g.lineTo(px + pw + 0.5 - spread, yy);
      g.stroke();
    }
    g.strokeStyle = ridgeColor;
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(px + inset, py + 2.5);
    g.lineTo(px + pw - inset, py + 2.5);
    g.stroke();
    g.fillStyle = ridgeColor;
    g.beginPath();
    g.arc(px + inset, py + 2.5, 2.2, 0, Math.PI * 2);
    g.arc(px + pw - inset, py + 2.5, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = tileDark;
    g.beginPath();
    g.moveTo(px - 2, py + rh);
    g.lineTo(px - 7, py + rh - 6);
    g.lineTo(px + 3, py + rh - 2);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(px + pw + 2, py + rh);
    g.lineTo(px + pw + 7, py + rh - 6);
    g.lineTo(px + pw - 3, py + rh - 2);
    g.closePath();
    g.fill();
  }

  function drawLantern(g, x, y, phase) {
    var sway = Math.sin(Render.time * 1.6 + phase) * 0.14;
    g.save();
    g.translate(x, y);
    g.rotate(sway);
    g.strokeStyle = '#5a3b20';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(0, -2);
    g.stroke();
    fillRR(g, -1.6, -5, 3.2, 3, 1, PAL.gold);
    g.beginPath();
    g.ellipse(0, 1.5, 4, 5, 0, 0, Math.PI * 2);
    g.fillStyle = '#b8342a';
    g.fill();
    g.strokeStyle = '#6b1a14';
    g.lineWidth = 1;
    g.stroke();
    g.strokeStyle = 'rgba(255,220,160,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(-1.2, 0.5, 2.2, Math.PI * 0.6, Math.PI * 1.4);
    g.stroke();
    fillRR(g, -1.6, 5.6, 3.2, 2.4, 1, PAL.gold);
    g.strokeStyle = '#b8342a';
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(0, 11);
    g.stroke();
    g.restore();
  }

  function drawWindow(g, x, y, s) {
    fillRR(g, x, y, s, s, 1.5, '#f7efdc');
    strokeRR(g, x, y, s, s, 1.5, PAL.paperEdge, 1);
    g.strokeStyle = 'rgba(90,70,48,0.75)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(x + s / 2, y);
    g.lineTo(x + s / 2, y + s);
    g.moveTo(x, y + s / 2);
    g.lineTo(x + s, y + s / 2);
    g.stroke();
  }

  function drawDoor(g, cx, bottomY, w, h) {
    fillRR(g, cx - w / 2, bottomY - h, w, h, w * 0.35, '#5a3a22');
    strokeRR(g, cx - w / 2, bottomY - h, w, h, w * 0.35, '#3a2513', 1.2);
    g.fillStyle = PAL.gold;
    g.beginPath();
    g.arc(cx, bottomY - h * 0.5, 1.3, 0, Math.PI * 2);
    g.fill();
  }

  function drawManor(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 3, py + 7, pw - 6, ph - 10, 5, '#d8c9a4');
    strokeRR(g, px + 3, py + 7, pw - 6, ph - 10, 5, '#8a7a58', 1.5);
    g.strokeStyle = 'rgba(138,122,88,0.5)';
    g.lineWidth = 1;
    for (var i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(px + 3, py + 7 + i * (ph - 10) / 4);
      g.lineTo(px + pw - 3, py + 7 + i * (ph - 10) / 4);
      g.stroke();
    }
    fillRR(g, px + 10, py + ph * 0.44, pw - 20, ph * 0.42, 3, '#f0e4c8');
    strokeRR(g, px + 10, py + ph * 0.44, pw - 20, ph * 0.42, 3, '#6b4a2a', 1.4);
    drawRoof(g, px + 2, py + ph * 0.30, pw - 4, ph * 0.26, PAL.tileDark, PAL.tileLight, PAL.ridge);
    drawRoof(g, px + 12, py + 2, pw - 24, ph * 0.30, '#43525f', '#657a8c', PAL.ridge);
    g.fillStyle = PAL.red;
    g.fillRect(px + 12, py + ph * 0.46, 5, ph * 0.38);
    g.fillRect(px + pw - 17, py + ph * 0.46, 5, ph * 0.38);
    g.fillStyle = PAL.redDark;
    g.fillRect(px + 15, py + ph * 0.46, 1.5, ph * 0.38);
    g.fillRect(px + pw - 15.5, py + ph * 0.46, 1.5, ph * 0.38);
    drawWindow(g, px + 20, py + ph * 0.52, 12);
    drawWindow(g, px + pw - 32, py + ph * 0.52, 12);
    drawDoor(g, px + pw / 2, py + ph * 0.86, 18, 20);
    fillRR(g, px + pw / 2 - 20, py + ph * 0.44, 40, 13, 2, '#3a2a1a');
    strokeRR(g, px + pw / 2 - 20, py + ph * 0.44, 40, 13, 2, PAL.goldDeep, 1.4);
    inkText(g, '里正宅', px + pw / 2, py + ph * 0.44 + 7, 9, PAL.gold, 'center', true);
    drawLantern(g, px + 12, py + ph * 0.62, b.id);
    drawLantern(g, px + pw - 12, py + ph * 0.62, b.id + 2);
    g.strokeStyle = '#5a3b20';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px + pw / 2 + 10, py + 3);
    g.lineTo(px + pw / 2 + 10, py - 10);
    g.stroke();
    g.fillStyle = PAL.red;
    g.beginPath();
    g.moveTo(px + pw / 2 + 10, py - 10);
    g.lineTo(px + pw / 2 + 26, py - 6);
    g.lineTo(px + pw / 2 + 10, py - 2);
    g.closePath();
    g.fill();
    inkText(g, '+' + C.BUILD.manor.income[b.level - 1].toFixed(1) + '/秒', px + pw / 2, py + ph - 3, 9, '#8a6a2a', 'center', true);
  }

  function drawLumber(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, '#cdb88c');
    strokeRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, '#8a7a58', 1.4);
    fillRR(g, px + 14, py + ph * 0.46, pw - 28, ph * 0.4, 3, '#d8c49a');
    strokeRR(g, px + 14, py + ph * 0.46, pw - 28, ph * 0.4, 3, '#6b4a2a', 1.3);
    drawDoor(g, px + pw / 2, py + ph * 0.86, 14, 15);
    drawRoof(g, px + 9, py + 5, pw - 18, ph * 0.42, '#55663f', '#728a52', '#3c4a2c');
    for (var i = 0; i < 6; i++) {
      var cx = px + 10 + (i % 3) * 9;
      var cy = py + ph - 9 + Math.floor(i / 3) * 8;
      g.beginPath();
      g.arc(cx, cy, 4.4, 0, Math.PI * 2);
      g.fillStyle = '#b07b45';
      g.fill();
      g.strokeStyle = '#6b4522';
      g.lineWidth = 1.2;
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, 2.1, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(90,58,28,0.8)';
      g.lineWidth = 0.9;
      g.stroke();
    }
    g.strokeStyle = '#5a3b20';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px + pw - 16, py + ph - 8);
    g.lineTo(px + pw - 6, py + ph - 18);
    g.stroke();
    fillRR(g, px + pw - 9, py + ph - 22, 7, 5, 1.5, '#8a8a86');
    strokeRR(g, px + pw - 9, py + ph - 22, 7, 5, 1.5, '#4f4f4a', 1);
  }

  function drawQuarry(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 2, py + 3, pw - 4, ph - 6, 4, '#b3ab9a');
    strokeRR(g, px + 2, py + 3, pw - 4, ph - 6, 4, '#7c7464', 1.4);
    g.beginPath();
    g.ellipse(px + pw * 0.42, py + ph * 0.56, pw * 0.3, ph * 0.3, 0, 0, Math.PI * 2);
    g.fillStyle = '#8a857a';
    g.fill();
    g.strokeStyle = '#5f5a50';
    g.lineWidth = 1.3;
    g.stroke();
    g.beginPath();
    g.ellipse(px + pw * 0.42, py + ph * 0.58, pw * 0.2, ph * 0.19, 0, 0, Math.PI * 2);
    g.fillStyle = '#6f6a60';
    g.fill();
    g.strokeStyle = 'rgba(50,46,40,0.7)';
    g.stroke();
    function block(bx, by, s) {
      g.fillStyle = '#c9c2b2';
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + s, by - s * 0.45);
      g.lineTo(bx + s * 1.8, by);
      g.lineTo(bx + s * 0.8, by + s * 0.45);
      g.closePath();
      g.fill();
      g.strokeStyle = '#6f6a60';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = '#a89f8c';
      g.beginPath();
      g.moveTo(bx + s * 0.8, by + s * 0.45);
      g.lineTo(bx + s * 1.8, by);
      g.lineTo(bx + s * 1.8, by + s * 0.5);
      g.lineTo(bx + s * 0.8, by + s * 0.95);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(80,74,64,0.8)';
      g.stroke();
    }
    block(px + pw - 30, py + ph - 16, 8);
    block(px + pw - 20, py + ph - 22, 7);
    block(px + pw - 34, py + ph - 24, 6);
    g.strokeStyle = '#5a3b20';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px + 12, py + 12);
    g.lineTo(px + 26, py + 24);
    g.stroke();
    g.strokeStyle = '#6f6f6a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(px + 20, py + 9);
    g.lineTo(px + 31, py + 17);
    g.stroke();
  }

  function drawWorkshop(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 2, py + 5, pw - 4, ph - 8, 4, '#cdb88c');
    strokeRR(g, px + 2, py + 5, pw - 4, ph - 8, 4, '#8a7a58', 1.4);
    fillRR(g, px + 9, py + ph * 0.44, pw - 18, ph * 0.44, 3, '#e0cba0');
    strokeRR(g, px + 9, py + ph * 0.44, pw - 18, ph * 0.44, 3, '#6b4a2a', 1.3);
    fillRR(g, px + 15, py + ph * 0.5, pw - 30, ph * 0.3, 3, '#4a3423');
    var glow = g.createRadialGradient(px + pw / 2, py + ph * 0.65, 2, px + pw / 2, py + ph * 0.65, 14);
    glow.addColorStop(0, 'rgba(240,170,70,0.55)');
    glow.addColorStop(1, 'rgba(240,170,70,0)');
    g.fillStyle = glow;
    g.fillRect(px + 12, py + ph * 0.46, pw - 24, ph * 0.4);
    drawRoof(g, px + 5, py + 4, pw - 10, ph * 0.42, '#6b4a2a', '#8a6238', '#4a3016');
    fillRR(g, px + pw - 20, py - 6, 7, 14, 2, '#7a5a3a');
    strokeRR(g, px + pw - 20, py - 6, 7, 14, 2, '#4a3016', 1);
    for (var i = 0; i < 3; i++) {
      var t = (Render.time * 0.5 + i * 0.4 + b.id * 0.13) % 1;
      var sy = py - 8 - t * 22;
      var sx = px + pw - 16.5 + Math.sin(t * 6 + b.id) * 4;
      g.fillStyle = 'rgba(220,215,205,' + (0.4 * (1 - t)) + ')';
      g.beginPath();
      g.arc(sx, sy, 3 + t * 4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#4f4f4a';
    g.beginPath();
    g.moveTo(px + 8, py + ph - 8);
    g.lineTo(px + 18, py + ph - 8);
    g.lineTo(px + 15, py + ph - 13);
    g.lineTo(px + 11, py + ph - 13);
    g.closePath();
    g.fill();
    g.fillRect(px + 10, py + ph - 13, 6, 3);
    g.strokeStyle = '#5a3b20';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px + 20, py + ph - 10);
    g.lineTo(px + 24, py + ph - 18);
    g.stroke();
  }

  function drawFarm(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 2, py + 2, pw - 4, ph - 4, 4, '#a5875a');
    strokeRR(g, px + 2, py + 2, pw - 4, ph - 4, 4, '#7a6238', 1.5);
    var rows = 4;
    for (var r = 0; r < rows; r++) {
      var ry = py + 6 + r * (ph - 12) / rows;
      fillRR(g, px + 5, ry, pw - 10, (ph - 12) / rows - 4, 3, '#8f6f45');
      g.strokeStyle = 'rgba(60,45,25,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px + 5, ry + (ph - 12) / rows - 4);
      g.lineTo(px + pw - 5, ry + (ph - 12) / rows - 4);
      g.stroke();
      var cols = 8;
      for (var cIdx = 0; cIdx < cols; cIdx++) {
        var cx = px + 10 + cIdx * (pw - 20) / (cols - 1);
        var sway = Math.sin(Render.time * 1.6 + cIdx * 0.9 + r * 1.7 + b.id) * 1.6;
        g.strokeStyle = '#5e8a3a';
        g.lineWidth = 1.3;
        g.beginPath();
        g.moveTo(cx, ry + 8);
        g.quadraticCurveTo(cx + sway * 0.5, ry + 4, cx + sway, ry + 0.5);
        g.stroke();
        g.beginPath();
        g.moveTo(cx, ry + 8);
        g.quadraticCurveTo(cx - 1.4, ry + 4.5, cx - 2.2 + sway * 0.4, ry + 1.5);
        g.stroke();
        if ((r + cIdx) % 3 === 0) {
          g.fillStyle = 'rgba(230,220,140,0.85)';
          g.beginPath();
          g.arc(cx + sway, ry + 1, 1.1, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.strokeStyle = '#5a3b20';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px + pw - 12, py + 8);
    g.lineTo(px + pw - 12, py + 22);
    g.stroke();
    g.beginPath();
    g.moveTo(px + pw - 17, py + 12);
    g.lineTo(px + pw - 7, py + 12);
    g.stroke();
    g.fillStyle = PAL.straw;
    g.beginPath();
    g.arc(px + pw - 12, py + 7, 3.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a6a3a';
    g.lineWidth = 1;
    g.stroke();
  }

  function drawShed(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, PAL.straw);
    strokeRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, '#8a6f3a', 1.4);
    fillRR(g, px + 6, py + ph * 0.42, pw - 12, ph * 0.46, 3, '#6b4a2a');
    strokeRR(g, px + 6, py + ph * 0.42, pw - 12, ph * 0.46, 3, '#3f2a15', 1.2);
    fillRR(g, px + 8, py + ph * 0.5, pw - 16, ph * 0.36, 3, '#3f2a15');
    drawRoof(g, px + 2, py + 3, pw - 4, ph * 0.42, '#b08f4e', '#d0b070', '#7a5c30');
    g.strokeStyle = 'rgba(122,92,48,0.5)';
    g.lineWidth = 1;
    for (var i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(px + 4 + i * (pw - 8) / 4, py + 4);
      g.lineTo(px + 4 + i * (pw - 8) / 4, py + ph * 0.42);
      g.stroke();
    }
    g.fillStyle = PAL.strawDark;
    g.beginPath();
    g.ellipse(px + 11, py + ph - 8, 7, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a6a3a';
    g.lineWidth = 1;
    g.stroke();
    var t = Render.time;
    if (b.type === 'chicken') drawChicken(g, px + pw - 20, py + ph - 12, b.id, t);
    if (b.type === 'chicken') drawChicken(g, px + pw - 33, py + ph - 9, b.id + 3, t + 1.2);
    if (b.type === 'duck') {
      g.beginPath();
      g.ellipse(px + 15, py + ph - 9, 8, 4.5, 0, 0, Math.PI * 2);
      g.fillStyle = PAL.water;
      g.fill();
      g.strokeStyle = '#5f8a96';
      g.lineWidth = 1;
      g.stroke();
      drawDuck(g, px + pw - 20, py + ph - 11, b.id, t);
      drawDuck(g, px + pw - 32, py + ph - 8, b.id + 5, t + 1.5);
    }
    if (b.type === 'rabbit') {
      drawRabbit(g, px + pw - 20, py + ph - 11, b.id, t);
      drawRabbit(g, px + pw - 32, py + ph - 9, b.id + 7, t + 2);
    }
  }

  function drawChicken(g, x, y, phase, t) {
    g.save();
    g.translate(x, y);
    var peck = Math.max(0, Math.sin(t * 2 + phase)) * 0.9;
    g.fillStyle = 'rgba(40,30,15,0.2)';
    g.beginPath();
    g.ellipse(0, 4, 6, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f7f3e8';
    g.beginPath();
    g.ellipse(0, 0, 5.5, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a7a5a';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#e8ddc4';
    g.beginPath();
    g.moveTo(-5, 0);
    g.lineTo(-9, -3);
    g.lineTo(-5, -2);
    g.closePath();
    g.fill();
    var hy = -4 + peck * 3.4;
    var hx = 4 + peck * 1.6;
    g.fillStyle = '#f7f3e8';
    g.beginPath();
    g.arc(hx, hy, 2.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a7a5a';
    g.stroke();
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.arc(hx, hy - 2.6, 1.4, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e0a030';
    g.beginPath();
    g.moveTo(hx + 1.8, hy - 0.4);
    g.lineTo(hx + 4.4, hy + 0.6);
    g.lineTo(hx + 1.8, hy + 1.4);
    g.closePath();
    g.fill();
    g.strokeStyle = '#e0a030';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-1.5, 4);
    g.lineTo(-1.5, 6.5);
    g.moveTo(1.5, 4);
    g.lineTo(1.5, 6.5);
    g.stroke();
    g.restore();
  }

  function drawDuck(g, x, y, phase, t) {
    g.save();
    g.translate(x, y + Math.sin(t * 1.5 + phase) * 0.6);
    g.fillStyle = 'rgba(40,30,15,0.2)';
    g.beginPath();
    g.ellipse(0, 4, 7, 2.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f5f2e8';
    g.beginPath();
    g.ellipse(-1, 0, 6.5, 4.2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a8a7a';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#cfc4a8';
    g.beginPath();
    g.ellipse(-1, -0.5, 3.6, 2.4, -0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f5f2e8';
    g.beginPath();
    g.arc(4.5, -4, 2.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a8a7a';
    g.stroke();
    g.fillStyle = '#e8a030';
    g.beginPath();
    g.moveTo(6.6, -4.3);
    g.lineTo(9.6, -3.4);
    g.lineTo(6.6, -2.6);
    g.closePath();
    g.fill();
    g.fillStyle = '#3a3a3a';
    g.beginPath();
    g.arc(5.2, -4.6, 0.7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawRabbit(g, x, y, phase, t) {
    g.save();
    g.translate(x, y + Math.sin(t * 1.8 + phase) * 0.5);
    g.fillStyle = 'rgba(40,30,15,0.2)';
    g.beginPath();
    g.ellipse(0, 4, 6, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#faf6ee';
    g.beginPath();
    g.ellipse(0, 1, 6, 4.4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#9a8a78';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#faf6ee';
    g.beginPath();
    g.ellipse(4.6, -1, 2.8, 2.6, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(5.6, -7, 1.5, 3.6, 0.15, 0, Math.PI * 2);
    g.fillStyle = '#faf6ee';
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(3.6, -7.4, 1.4, 3.4, -0.2, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#e8b8c0';
    g.beginPath();
    g.ellipse(5.5, -7, 0.7, 2.4, 0.15, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(3.7, -7.4, 0.65, 2.2, -0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a3a2a';
    g.beginPath();
    g.arc(5.8, -1.4, 0.7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8b8c0';
    g.beginPath();
    g.arc(7.2, -0.6, 0.9, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawCompost(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 3, py + 6, pw - 6, ph - 10, 4, '#cdb88c');
    strokeRR(g, px + 3, py + 6, pw - 6, ph - 10, 4, '#8a7a58', 1.4);
    fillRR(g, px + 7, py + 8, pw - 14, ph * 0.5, 3, '#8a6a42');
    strokeRR(g, px + 7, py + 8, pw - 14, ph * 0.5, 3, '#4a3420', 1.3);
    g.strokeStyle = 'rgba(74,52,32,0.6)';
    g.lineWidth = 1;
    for (var i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(px + 7, py + 8 + i * (ph * 0.5) / 4);
      g.lineTo(px + pw - 7, py + 8 + i * (ph * 0.5) / 4);
      g.stroke();
    }
    g.beginPath();
    g.ellipse(px + pw / 2, py + ph * 0.38, pw * 0.22, ph * 0.12, 0, 0, Math.PI * 2);
    g.fillStyle = '#4f3a24';
    g.fill();
    for (i = 0; i < 3; i++) {
      var t = (Render.time * 0.4 + i * 0.33 + b.id * 0.11) % 1;
      var sx = px + pw / 2 + Math.sin(t * 5 + i) * 6;
      var sy = py + ph * 0.3 - t * 18;
      g.strokeStyle = 'rgba(220,220,210,' + (0.45 * (1 - t)) + ')';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(sx, sy, 2.5, 0, Math.PI * 1.5);
      g.stroke();
    }
    g.strokeStyle = '#5e8a3a';
    g.lineWidth = 1.4;
    for (i = 0; i < 3; i++) {
      var gx = px + 12 + i * 6;
      g.beginPath();
      g.moveTo(gx, py + ph - 10);
      g.quadraticCurveTo(gx + 1, py + ph - 15, gx - 1, py + ph - 17);
      g.stroke();
    }
  }

  function drawPickling(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, '#d8c9a4');
    strokeRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, '#8a7a58', 1.4);
    fillRR(g, px + 15, py + 6, pw - 30, ph * 0.3, 2, '#e0cba0');
    strokeRR(g, px + 15, py + 6, pw - 30, ph * 0.3, 2, '#6b4a2a', 1.1);
    drawRoof(g, px + 12, py + 3, pw - 24, ph * 0.24, '#6b5a4a', '#8a7663', '#463a2e');
    function jar(cx, cy, open) {
      g.beginPath();
      g.ellipse(cx, cy, 8, 7, 0, 0, Math.PI * 2);
      g.fillStyle = '#9a6a42';
      g.fill();
      g.strokeStyle = '#54381f';
      g.lineWidth = 1.3;
      g.stroke();
      g.beginPath();
      g.ellipse(cx, cy - 1, 6.5, 5.5, 0, 0, Math.PI * 2);
      g.fillStyle = open ? '#4f3a24' : '#e8dcc0';
      g.fill();
      g.strokeStyle = open ? '#3a2a18' : '#a3946f';
      g.lineWidth = 1;
      g.stroke();
      if (!open) {
        g.strokeStyle = '#b8544a';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx - 6, cy - 1);
        g.lineTo(cx + 6, cy - 1);
        g.stroke();
      }
    }
    jar(px + 12, py + ph - 12, false);
    jar(px + 26, py + ph - 10, true);
    jar(px + 40, py + ph - 12, false);
    g.strokeStyle = '#5a3b20';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px + pw - 12, py + ph - 8);
    g.lineTo(px + pw - 12, py + ph - 18);
    g.stroke();
    g.fillStyle = '#8a8a86';
    g.beginPath();
    g.arc(px + pw - 12, py + ph - 20, 3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#4f4f4a';
    g.lineWidth = 1;
    g.stroke();
  }

  function drawTextile(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, '#d8cbe0');
    strokeRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, '#8a7a88', 1.4);
    fillRR(g, px + pw * 0.16, py + ph * 0.2, pw * 0.68, ph * 0.6, 3, '#8a6238');
    strokeRR(g, px + pw * 0.16, py + ph * 0.2, pw * 0.68, ph * 0.6, 3, '#4a3016', 1.4);
    fillRR(g, px + pw * 0.2, py + ph * 0.26, pw * 0.6, ph * 0.48, 2, '#f2e8d0');
    g.strokeStyle = 'rgba(180,150,110,0.8)';
    g.lineWidth = 0.9;
    for (var i = 1; i < 9; i++) {
      var xx = px + pw * 0.2 + i * pw * 0.6 / 9;
      g.beginPath();
      g.moveTo(xx, py + ph * 0.27);
      g.lineTo(xx, py + ph * 0.73);
      g.stroke();
    }
    g.strokeStyle = '#6b4a2a';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(px + pw * 0.2, py + ph * 0.26);
    g.lineTo(px + pw * 0.8, py + ph * 0.26);
    g.moveTo(px + pw * 0.2, py + ph * 0.74);
    g.lineTo(px + pw * 0.8, py + ph * 0.74);
    g.stroke();
    function spool(cx, cy, col) {
      g.beginPath();
      g.arc(cx, cy, 3.4, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = '#4a3016';
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, 1.2, 0, Math.PI * 2);
      g.fillStyle = '#f2e8d0';
      g.fill();
    }
    spool(px + 8, py + 10, '#3a5a8a');
    spool(px + 16, py + 8, '#a6362c');
    spool(px + pw - 9, py + 10, '#5e8a3a');
    spool(px + pw - 17, py + 8, '#c9862a');
  }

  function drawDyeing(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    fillRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, '#cdb8c0');
    strokeRR(g, px + 2, py + 4, pw - 4, ph - 7, 4, '#8a7480', 1.4);
    g.strokeStyle = '#5a3b20';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(px + 10, py + 12);
    g.lineTo(px + 10, py + ph - 8);
    g.moveTo(px + pw - 10, py + 12);
    g.lineTo(px + pw - 10, py + ph - 8);
    g.moveTo(px + 10, py + 14);
    g.lineTo(px + pw - 10, py + 14);
    g.stroke();
    var cloth = ['#3a5a8a', '#a6362c', '#6b8a3a'];
    for (var i = 0; i < 3; i++) {
      var cx = px + 16 + i * (pw - 32) / 2;
      var sway = Math.sin(Render.time * 1.5 + i * 1.9 + b.id) * 2;
      g.fillStyle = cloth[i];
      g.beginPath();
      g.moveTo(cx - 4, py + 15);
      g.lineTo(cx + 4, py + 15);
      g.quadraticCurveTo(cx + 6 + sway, py + ph * 0.62, cx + 3 + sway, py + ph - 10);
      g.lineTo(cx - 3 + sway, py + ph - 10);
      g.quadraticCurveTo(cx - 6 + sway, py + ph * 0.62, cx - 4, py + 15);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(60,40,30,0.5)';
      g.lineWidth = 1;
      g.stroke();
    }
    function vat(cx, cy, col) {
      g.beginPath();
      g.ellipse(cx, cy, 7.5, 6, 0, 0, Math.PI * 2);
      g.fillStyle = '#7a5a3a';
      g.fill();
      g.strokeStyle = '#46301c';
      g.lineWidth = 1.3;
      g.stroke();
      g.beginPath();
      g.ellipse(cx, cy - 0.5, 6, 4.6, 0, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = 'rgba(40,30,20,0.5)';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.ellipse(cx - 2, cy - 1.5, 2, 1.1, 0.4, 0, Math.PI * 2);
      g.fill();
    }
    vat(px + 13, py + ph - 12, '#2e4a74');
    vat(px + 27, py + ph - 10, '#8a2c24');
  }

  function drawMarket(b) {
    var g = Render.ctx;
    var m = World.market;
    var px = m.x * T, py = m.y * T, pw = m.w * T, ph = m.h * T;
    fillRR(g, px + 2, py + 4, pw - 4, ph - 6, 5, '#cfc1a0');
    strokeRR(g, px + 2, py + 4, pw - 4, ph - 6, 5, '#8a7a58', 1.5);
    g.strokeStyle = 'rgba(138,122,88,0.5)';
    g.lineWidth = 1;
    for (var sx = px + 16; sx < px + pw - 8; sx += 16) {
      g.beginPath();
      g.moveTo(sx, py + 6);
      g.lineTo(sx, py + ph - 4);
      g.stroke();
    }
    fillRR(g, px + 10, py + ph * 0.62, pw - 20, ph * 0.26, 3, '#8a6238');
    strokeRR(g, px + 10, py + ph * 0.62, pw - 20, ph * 0.26, 3, '#4a3016', 1.4);
    var mounds = [
      [px + 30, '#d8b83e'], [px + 62, '#f2e2c0'], [px + 96, '#cfe0ea'],
      [px + 130, '#b07b45'], [px + 164, '#cbb49a'], [px + 198, '#7fa05a']
    ];
    for (var i = 0; i < mounds.length; i++) {
      g.beginPath();
      g.ellipse(mounds[i][0], py + ph * 0.6, 9, 4, 0, 0, Math.PI * 2);
      g.fillStyle = mounds[i][1];
      g.fill();
      g.strokeStyle = 'rgba(70,50,30,0.6)';
      g.lineWidth = 1;
      g.stroke();
    }
    var segs = 5;
    var segW = (pw + 6) / segs;
    for (var s = 0; s < segs; s++) {
      var sx = px - 3 + s * segW;
      var sy = py - 9;
      var shades = s % 2 === 0
        ? ['#c1513f', '#8a2a20']
        : ['#e8d8b4', '#c9b184'];
      var grd = g.createLinearGradient(0, sy, 0, sy + 24);
      grd.addColorStop(0, shades[0]);
      grd.addColorStop(1, shades[1]);
      g.beginPath();
      g.moveTo(sx + 2, sy + 20);
      g.lineTo(sx + 2, sy + 7);
      g.quadraticCurveTo(sx + 2, sy, sx + 8, sy);
      g.lineTo(sx + segW - 8, sy);
      g.quadraticCurveTo(sx + segW - 2, sy, sx + segW - 2, sy + 7);
      g.lineTo(sx + segW - 2, sy + 20);
      g.quadraticCurveTo(sx + segW * 0.75, sy + 15, sx + segW / 2, sy + 20);
      g.quadraticCurveTo(sx + segW * 0.25, sy + 25, sx + 2, sy + 20);
      g.closePath();
      g.fillStyle = grd;
      g.fill();
      g.strokeStyle = s % 2 === 0 ? '#5a1a14' : '#8a7248';
      g.lineWidth = 1.3;
      g.stroke();
      g.strokeStyle = s % 2 === 0 ? 'rgba(255,220,170,0.55)' : 'rgba(255,255,255,0.5)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(sx + 5, sy + 5);
      g.lineTo(sx + segW - 5, sy + 5);
      g.stroke();
      var postX = sx + segW - 2;
      g.strokeStyle = '#5a3b20';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(postX, sy + 14);
      g.lineTo(postX, py + ph * 0.62);
      g.stroke();
    }
    g.fillStyle = '#8a2a20';
    g.beginPath();
    g.moveTo(px - 3, py - 9);
    g.lineTo(px - 12, py - 17);
    g.lineTo(px + 4, py - 11);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(px + pw + 3, py - 9);
    g.lineTo(px + pw + 12, py - 17);
    g.lineTo(px + pw - 4, py - 11);
    g.closePath();
    g.fill();
    fillRR(g, px + pw / 2 - 25, py - 7, 50, 15, 2, '#3a2a1a');
    strokeRR(g, px + pw / 2 - 25, py - 7, 50, 15, 2, PAL.goldDeep, 1.4);
    inkText(g, '市 集', px + pw / 2, py + 1, 10, PAL.gold, 'center', true);
    drawLantern(g, px + 6, py + 18, b.id);
    drawLantern(g, px + pw - 6, py + 18, b.id + 3);
  }

  function drawBuildingArt(b) {
    switch (b.type) {
      case 'manor': drawManor(b); break;
      case 'farm': drawFarm(b); break;
      case 'market': drawMarket(b); break;
      case 'lumber': drawLumber(b); break;
      case 'quarry': drawQuarry(b); break;
      case 'workshop': drawWorkshop(b); break;
      case 'chicken': case 'duck': case 'rabbit': drawShed(b); break;
      case 'compost': drawCompost(b); break;
      case 'pickling': drawPickling(b); break;
      case 'textile': drawTextile(b); break;
      case 'dyeing': drawDyeing(b); break;
      default:
        fillRR(Render.ctx, b.x * T + 3, b.y * T + 3, b.w * T - 6, b.h * T - 6, 4, '#d8c9a4');
        strokeRR(Render.ctx, b.x * T + 3, b.y * T + 3, b.w * T - 6, b.h * T - 6, 4, '#6b4a2a', 1.4);
    }
  }

  function drawConstruction(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    var p = clamp(b.buildProgress / (b.buildTime || 1), 0, 1);
    fillRR(g, px + 2, py + 2, pw - 4, ph - 4, 4, '#c9b489');
    strokeRR(g, px + 2, py + 2, pw - 4, ph - 4, 4, '#8a7a58', 1.5);
    fillRR(g, px + 6, py + 6, pw - 12, ph - 12, 3, 'rgba(150,125,85,0.45)');
    g.save();
    g.globalAlpha = 0.2 + 0.5 * p;
    drawBuildingArt(b);
    g.restore();
    g.save();
    g.strokeStyle = 'rgba(122,90,42,0.75)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(px + 4, py + 4);
    g.lineTo(px + pw - 4, py + ph - 4);
    g.moveTo(px + pw - 4, py + 4);
    g.lineTo(px + 4, py + ph - 4);
    g.stroke();
    g.strokeStyle = '#6b4a2a';
    g.lineWidth = 2;
    g.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
    g.restore();
    var posts = [[px + 3, py + 3], [px + pw - 3, py + 3], [px + 3, py + ph - 3], [px + pw - 3, py + ph - 3]];
    for (var i = 0; i < posts.length; i++) {
      fillRR(g, posts[i][0] - 3, posts[i][1] - 3, 6, 6, 1.5, '#8a6238');
      strokeRR(g, posts[i][0] - 3, posts[i][1] - 3, 6, 6, 1.5, '#4a3016', 1);
    }
    fillRR(g, px + 7, py + ph - 10, pw - 14, 6, 3, 'rgba(50,38,20,0.45)');
    fillRR(g, px + 7, py + ph - 10, (pw - 14) * p, 6, 3, '#d4a94e');
    inkText(g, '建造中 ' + Math.ceil(Math.max(0, b.buildTime - b.buildProgress)) + 's', px + pw / 2, py + ph / 2, 10.5, '#5a4630', 'center', true);
    var bx = px + pw - 9, by = py - 10;
    g.beginPath();
    g.arc(bx, by, 8.5, 0, Math.PI * 2);
    g.fillStyle = '#b8892f';
    g.fill();
    g.strokeStyle = 'rgba(50,35,18,0.85)';
    g.lineWidth = 1.4;
    g.stroke();
    inkText(g, '建', bx, by + 0.5, 9.5, '#fff8e8', 'center', true);
  }

  function drawBuilding(b) {
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    g.fillStyle = 'rgba(45,35,18,0.16)';
    g.beginPath();
    g.ellipse(px + pw / 2, py + ph - 4, pw * 0.44, ph * 0.14, 0, 0, Math.PI * 2);
    g.fill();
    if (b.constructing) {
      drawConstruction(b);
      return;
    }
    drawBuildingArt(b);
    drawModeBadge(b);
    if (b.batch) {
      var prog = clamp(b.batch.progress / b.batch.cycle, 0, 1);
      fillRR(g, px + 7, py + ph - 9, pw - 14, 5, 2.5, 'rgba(50,38,20,0.4)');
      fillRR(g, px + 7, py + ph - 9, (pw - 14) * prog, 5, 2.5, PAL.gold);
      strokeRR(g, px + 7, py + ph - 9, pw - 14, 5, 2.5, 'rgba(60,45,25,0.6)', 1);
    }
    if (b.level > 1 && b.type !== 'market') {
      fillRR(g, px + 3, py + 3, 22, 13, 3, 'rgba(74,48,22,0.9)');
      strokeRR(g, px + 3, py + 3, 22, 13, 3, PAL.goldDeep, 1);
      inkText(g, CN[b.level - 1] + '级', px + 14, py + 10, 8.5, PAL.gold, 'center', true);
    }
  }

  function drawModeBadge(b) {
    if (b.type === 'market') return;
    var g = Render.ctx;
    var px = b.x * T, py = b.y * T, pw = b.w * T, ph = b.h * T;
    var ch, col;
    if (b.type === 'manor') { ch = '金'; col = '#b8892f'; }
    else if (!World.canSell(b)) { ch = '材'; col = '#5e8a5a'; }
    else if (b.mode === 'sell') { ch = '售'; col = '#c07a2a'; }
    else { ch = '存'; col = '#5e8a5a'; }
    var bx = px + 10, by = py + ph - 17;
    g.beginPath();
    g.arc(bx, by, 8, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
    g.strokeStyle = 'rgba(50,35,18,0.85)';
    g.lineWidth = 1.3;
    g.stroke();
    inkText(g, ch, bx, by + 0.5, 9, '#fff8e8', 'center', true);
  }

  function drawMoveGhost() {
    if (!Render.moveGhost) return;
    var mg = Render.moveGhost;
    var b = null;
    for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].id === mg.id) b = World.buildings[i];
    if (!b) return;
    var g = Render.ctx;
    var px = mg.x * T, py = mg.y * T, pw = b.w * T, ph = b.h * T;
    g.fillStyle = mg.valid ? 'rgba(110,170,100,0.3)' : 'rgba(180,70,60,0.3)';
    fillRR(g, px, py, pw, ph, 5, g.fillStyle);
    g.strokeStyle = mg.valid ? 'rgba(70,120,60,0.95)' : 'rgba(150,50,40,0.95)';
    g.lineWidth = 2;
    g.setLineDash([7, 5]);
    rrPath(g, px, py, pw, ph, 5);
    g.stroke();
    g.setLineDash([]);
    g.save();
    g.globalAlpha = 0.85;
    drawBuildingArt(Object.assign({}, b, { x: mg.x, y: mg.y }));
    g.restore();
  }

  function drawGhost() {
    if (!Render.ghost) return;
    var g = Render.ctx;
    var gh = Render.ghost;
    var d = C.BUILD[gh.type];
    if (!d) return;
    var px = gh.x * T, py = gh.y * T, pw = d.size[0] * T, ph = d.size[1] * T;
    g.fillStyle = gh.valid ? 'rgba(110,170,100,0.32)' : 'rgba(180,70,60,0.32)';
    fillRR(g, px + 2, py + 2, pw - 4, ph - 4, 5, g.fillStyle);
    g.strokeStyle = gh.valid ? 'rgba(70,120,60,0.9)' : 'rgba(150,50,40,0.9)';
    g.lineWidth = 2;
    g.setLineDash([7, 5]);
    rrPath(g, px + 2, py + 2, pw - 4, ph - 4, 5);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(px + pw / 2, py + ph / 2, 13, 0, Math.PI * 2);
    g.fillStyle = gh.valid ? 'rgba(60,100,55,0.9)' : 'rgba(140,45,38,0.9)';
    g.fill();
    g.strokeStyle = 'rgba(240,225,180,0.9)';
    g.lineWidth = 1.4;
    g.stroke();
    inkText(g, C.SEAL[gh.type] || '建', px + pw / 2, py + ph / 2 + 0.5, 13, '#f8eeda', 'center', true);
  }

  function drawSelection() {
    if (!Render.selectedId) return;
    var b = null;
    for (var i = 0; i < World.buildings.length; i++) if (World.buildings[i].id === Render.selectedId) b = World.buildings[i];
    if (!b) { Render.selectedId = null; return; }
    var g = Render.ctx;
    var px = b.x * T - 3, py = b.y * T - 3, pw = b.w * T + 6, ph = b.h * T + 6;
    var pulse = 0.55 + Math.sin(Render.time * 4) * 0.45;
    g.save();
    g.strokeStyle = 'rgba(212,169,78,' + (0.45 + pulse * 0.45) + ')';
    g.lineWidth = 2;
    g.setLineDash([9, 6]);
    rrPath(g, px, py, pw, ph, 6);
    g.stroke();
    g.setLineDash([]);
    var len = 9;
    g.strokeStyle = PAL.gold;
    g.lineWidth = 3;
    var corners = [[px, py, 1, 1], [px + pw, py, -1, 1], [px, py + ph, 1, -1], [px + pw, py + ph, -1, -1]];
    for (var c = 0; c < 4; c++) {
      var cc = corners[c];
      g.beginPath();
      g.moveTo(cc[0] + cc[2] * len, cc[1]);
      g.lineTo(cc[0], cc[1]);
      g.lineTo(cc[0], cc[1] + cc[3] * len);
      g.stroke();
    }
    g.restore();
  }

  function drawFx() {
    var g = Render.ctx;
    for (var i = 0; i < World.fx.length; i++) {
      var f = World.fx[i];
      var a = clamp(f.life / 1.3, 0, 1);
      g.globalAlpha = a;
      g.font = 'bold ' + (T * 0.46) + 'px ' + FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(40,28,12,0.75)';
      g.strokeText(f.text, f.x * T, f.y * T - (1.3 - f.life) * 24);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x * T, f.y * T - (1.3 - f.life) * 24);
      g.globalAlpha = 1;
    }
  }

  Render.draw = function (dt) {
    Render.time += dt || 0.016;
    var ctx = Render.ctx;
    var c = Render.canvas;
    if (!ctx) return;
    if (!Render.staticLayer) buildStatic();
    ctx.setTransform(Render.dpr, 0, 0, Render.dpr, 0, 0);
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
    ctx.save();
    ctx.scale(Render.cam.s, Render.cam.s);
    ctx.translate(-Render.cam.x, -Render.cam.y);
    ctx.drawImage(Render.staticLayer, 0, 0);
    drawSelection();
    var list = World.buildings.slice().sort(function (a, b2) { return (a.y + a.h) - (b2.y + b2.h); });
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === Render.hiddenBuildingId) continue;
      drawBuilding(list[i]);
    }
    drawMoveGhost();
    drawGhost();
    drawFx();
    ctx.restore();
  };
})();
