// Keep this launcher compatible with older WebViews so failures remain visible
// even when the browser cannot parse the ES-module game itself.
(function () {
  var loading = document.getElementById('loading');
  var game = document.getElementById('game');
  var ready = false;
  var agent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(agent) ||
    (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
  var phoneRatio = 1200 / 2652;
  function fitViewport() {
    var height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var width = window.visualViewport && window.visualViewport.width || window.innerWidth;
    if (!(height > 0)) return;
    if (!mobile && width > 0) {
      var frameWidth = Math.min(width, 540, height * phoneRatio);
      var frameHeight = frameWidth / phoneRatio;
      game.style.width = frameWidth + 'px'; game.style.height = frameHeight + 'px';
      game.style.marginTop = Math.max(0, (height - frameHeight) / 2) + 'px';
      game.setAttribute('data-phone-frame', 'true');
    } else {
      game.style.width = ''; game.style.height = Math.round(height) + 'px';
      game.style.marginTop = ''; game.setAttribute('data-phone-frame', 'false');
    }
  }
  fitViewport();
  window.addEventListener('resize', fitViewport);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitViewport);
  function panel(message) {
    loading.hidden = false;
    loading.className = 'loading local-entry';
    while (loading.firstChild) loading.removeChild(loading.firstChild);
    var title = document.createElement('strong'); title.textContent = 'RevolverPoker';
    var text = document.createElement('p'); text.textContent = message;
    var retry = document.createElement('button'); retry.className = 'button primary'; retry.textContent = '重新连接';
    loading.appendChild(title); loading.appendChild(text); loading.appendChild(retry);
    return { text: text, retry: retry };
  }
  function fail(message) {
    if (ready) return;
    var error = panel(message);
    error.retry.textContent = '重新加载';
    error.retry.onclick = function () { location.reload(); };
  }
  window.RevolverPokerBoot = { ready: function () { ready = true; } };
  window.addEventListener('error', function (event) {
    if (event.message) fail('启动失败：' + event.message);
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    fail('启动失败：' + (reason && reason.message ? reason.message : String(reason)));
  });
  if (location.protocol !== 'file:' && location.protocol !== 'content:') {
    var script = document.createElement('script');
    if (!('noModule' in script)) {
      fail('当前游戏盒的 WebView 不支持 JavaScript 模块，无法运行游戏。请更新 Android System WebView 或使用新版浏览器。');
      return;
    }
    script.type = 'module'; script.src = '/client/app.js';
    script.onerror = function () { fail('游戏脚本加载失败。请确认复制了完整游戏目录；若仍失败，请检查游戏盒的 WebView 版本。'); };
    document.head.appendChild(script); return;
  }
  // Preserve room links without requiring URL/URLSearchParams in the launcher.
  var query = location.search.replace(/^\?/, '').split('&');
  var kept = [], requestedPort = '';
  for (var i = 0; i < query.length; i++) {
    if (!query[i]) continue;
    var pair = query[i].split('='), key;
    try { key = decodeURIComponent(pair[0]); } catch (_) { key = pair[0]; }
    if (key === 'serverPort') {
      try { requestedPort = decodeURIComponent(pair[1] || ''); } catch (_) { requestedPort = ''; }
    } else kept.push(query[i]);
  }
  var port = /^\d{1,5}$/.test(requestedPort) && Number(requestedPort) > 0 && Number(requestedPort) <= 65535 ? Number(requestedPort) : 3088;
  var origin = 'http://127.0.0.1:' + port;
  var target = origin + '/' + (kept.length ? '?' + kept.join('&') : '') + location.hash;
  var local = panel('正在连接本机游戏服务…');
  var attempt = 0;
  function connect() {
    var current = ++attempt, finished = false;
    local.text.textContent = '正在连接本机游戏服务…'; local.retry.hidden = true;
    var probe = new Image(), timer = setTimeout(failed, 4000);
    function failed() {
      if (current !== attempt || finished) return;
      finished = true; clearTimeout(timer);
      var android = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
      local.text.textContent = android
        ? '本机游戏服务尚未启动。请返回 HTML 游戏盒子，点击“建立服务器”，再点“进入游戏”。请保留完整游戏目录。'
        : '游戏服务尚未启动。请双击同目录的“启动游戏.cmd”，并保持服务器的 CMD 窗口开启。';
      local.retry.hidden = false;
    }
    probe.onerror = failed;
    probe.onload = function () {
      if (current !== attempt || finished) return;
      finished = true; clearTimeout(timer); location.replace(target);
    };
    probe.src = origin + '/client/mark.svg?launch=' + Date.now();
  }
  local.retry.onclick = connect; connect();
})();
