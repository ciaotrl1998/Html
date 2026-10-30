// A classic script can run from file://; the ES-module game stays on its local
// HTTP service, keeping WebSockets, saved layouts and browser storage same-origin.
(function () {
  const loading = document.getElementById('loading');
  if (location.protocol !== 'file:') {
    const script = document.createElement('script'); script.type = 'module'; script.src = '/client/app.js';
    script.onerror = () => { loading.textContent = '游戏脚本加载失败，请刷新页面重试。'; };
    document.head.appendChild(script); return;
  }
  const params = new URLSearchParams(location.search), requestedPort = params.get('serverPort');
  const port = /^\d{1,5}$/.test(requestedPort || '') && Number(requestedPort) > 0 && Number(requestedPort) <= 65535 ? Number(requestedPort) : 3088;
  params.delete('serverPort');
  const target = new URL(`http://127.0.0.1:${port}/`); target.search = params.toString(); target.hash = location.hash;
  loading.classList.add('local-entry'); loading.replaceChildren();
  const title = document.createElement('strong'); title.textContent = 'RevolverPoker';
  const message = document.createElement('p');
  const retry = document.createElement('button'); retry.className = 'button primary'; retry.textContent = '重新连接';
  loading.append(title, message, retry);
  let attempt = 0;
  function connect() {
    const current = ++attempt; let finished = false;
    message.textContent = '正在连接本机游戏服务…'; retry.hidden = true;
    // Image loading works from file:// without weakening API/WebSocket origin
    // checks, and also works with game services started before this launcher.
    const probe = new Image(), timer = setTimeout(failed, 4000);
    function failed() {
      if (current !== attempt || finished) return;
      finished = true; clearTimeout(timer);
      message.textContent = '游戏服务尚未启动。请双击同目录的“启动游戏.cmd”，并保持服务器的 CMD 窗口开启。';
      retry.hidden = false;
    }
    probe.onerror = failed;
    probe.onload = () => {
      if (current !== attempt || finished) return;
      finished = true; clearTimeout(timer); location.replace(target.href);
    };
    probe.src = `${target.origin}/client/mark.svg?launch=${Date.now()}`;
  }
  retry.onclick = connect; connect();
})();
