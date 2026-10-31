const editable = node => !!node && (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) || node.isContentEditable ||
  !!node.closest?.('[contenteditable="true"], [contenteditable=""]'));

export class FullscreenControl {
  constructor({ doc = document, storage = localStorage, button, status, change = () => {} } = {}) {
    this.doc = doc; this.target = doc.documentElement; this.storage = storage;
    this.button = button; this.status = status; this.change = change;
    this.enabled = storage.getItem('rp-fullscreen') !== 'off'; this.pending = false; this.blocked = false; this.wasActive = this.active;
    this.gesture = event => {
      if (event.isTrusted === false || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.key === 'Escape' ||
          this.button?.contains(event.target) || editable(event.target) || editable(doc.activeElement)) return;
      this.enter(true);
    };
    this.changed = () => {
      const active = this.active;
      // Respect Esc / browser Back. A background suspension can be restored on
      // the next interaction without rewriting the user's saved preference.
      if (this.wasActive && !active && !doc.hidden && this.enabled) {
        this.enabled = false; storage.setItem('rp-fullscreen', 'off');
      }
      this.wasActive = active; this.render(); change();
      if (active && !this.enabled) this.exit();
    };
    for (const name of ['pointerup', 'keydown']) doc.addEventListener(name, this.gesture);
    for (const name of ['fullscreenchange', 'webkitfullscreenchange']) doc.addEventListener(name, this.changed);
    if (button) button.onclick = () => this.setEnabled(!this.enabled);
    this.render();
    if (this.enabled) this.enter(); else if (this.active) this.exit();
  }
  get active() { return (this.doc.fullscreenElement || this.doc.webkitFullscreenElement) === this.target; }
  get request() { return this.target.requestFullscreen || this.target.webkitRequestFullscreen || this.target.webkitRequestFullScreen; }
  get supported() {
    return typeof this.request === 'function' && (this.target.requestFullscreen ? this.doc.fullscreenEnabled !== false : this.doc.webkitFullscreenEnabled !== false);
  }
  async enter(fromGesture = false) {
    if (!this.enabled || this.active || this.pending || this.blocked || !this.supported) return;
    this.pending = true;
    try {
      const request = this.request;
      await (request === this.target.requestFullscreen ? request.call(this.target, { navigationUI: 'hide' }) : request.call(this.target));
      // A settings click can disable fullscreen while the browser is entering.
      if (!this.enabled && this.active) await this.exit();
    } catch {
      // Retry a startup activation rejection once the player interacts. If the
      // host also refuses a real gesture, avoid retrying on every poker action.
      if (fromGesture) this.blocked = true;
    }
    finally { this.pending = false; this.render(); }
  }
  async exit() {
    if (!this.active) return;
    try { await (this.doc.exitFullscreen || this.doc.webkitExitFullscreen || this.doc.webkitCancelFullScreen)?.call(this.doc); }
    catch { /* Keep the actual state visible if the host refuses to exit. */ }
    this.render();
  }
  setEnabled(enabled) {
    this.enabled = enabled; this.blocked = false; this.storage.setItem('rp-fullscreen', enabled ? 'on' : 'off'); this.render();
    if (enabled) this.enter(true); else this.exit();
  }
  render() {
    this.target.setAttribute('data-game-fullscreen', this.active ? 'true' : 'false');
    if (this.button) {
      this.button.setAttribute('aria-checked', String(this.enabled));
      this.button.title = !this.supported || this.blocked ? '当前浏览器限制原生全屏，游戏仍适配可用屏幕' : this.enabled && !this.active ? '首次点击游戏后进入全屏；输入昵称时不切换画面' : '切换全屏并记住选择，也可按 Esc 退出';
    }
    if (this.status) this.status.textContent = !this.enabled ? this.active ? '待退出' : '关闭' : this.active ? '开启' : this.supported && !this.blocked ? '待进入' : '浏览器限制';
  }
  dispose() {
    for (const name of ['pointerup', 'keydown']) this.doc.removeEventListener(name, this.gesture);
    for (const name of ['fullscreenchange', 'webkitfullscreenchange']) this.doc.removeEventListener(name, this.changed);
    if (this.button) this.button.onclick = null;
  }
}
