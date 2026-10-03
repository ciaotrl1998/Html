/* ES5 bootstrap for older Android WebViews. */
(function () {
  'use strict';
  function layout() {
    var game = document.getElementById('game');
    if (!game) return;
    var h = Math.max(1, Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight || document.documentElement.clientHeight));
    var w = Math.max(1, Math.floor(Math.min(document.documentElement.clientWidth || window.innerWidth, 480, h * 9 / 16)));
    game.style.width = w + 'px'; game.style.height = h + 'px';
  }
  function report(message) {
    var box = document.getElementById('startup-error'), label = document.getElementById('startup-error-message');
    if (box && label) { label.textContent = message; box.hidden = false; }
  }
  window.GufangBoot = { layout: layout, report: report };
  layout(); window.addEventListener('resize', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  window.addEventListener('error', function (e) {
    if (!window.Gufang) report('加载失败：' + (e.message || '游戏脚本未能读取') + '。请用浏览器打开完整的“古坊奇谭.html”文件。');
  });
  window.addEventListener('load', function () {
    if (!window.Gufang) report('游戏脚本未加载。请用浏览器打开“古坊奇谭.html”单文件版本，或保留 index.html 同目录的 runtime.js 和 boot.js。');
  });
})();
