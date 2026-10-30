const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function chipSliderBounds(height, headerBottom = height * .12) {
  const bottom = Math.max(80, Math.min(height - 70, height * .68));
  const top = clamp(headerBottom + 10, 10, Math.max(10, bottom - 60));
  return { top, bottom, travel: Math.max(1, bottom - top) };
}

export class ChipSlider {
  constructor(container) {
    this.container = container;
    this.host = container.parentElement?.id === 'game' ? container.parentElement : container;
    this.header = this.host.querySelector?.('.topbar'); this.bounds = null;
    this.root = document.createElement('div'); this.root.className = 'chip-selector'; this.root.hidden = true;
    this.root.setAttribute('role', 'slider'); this.root.setAttribute('aria-label', '预下筹码');
    this.root.setAttribute('aria-orientation', 'vertical'); this.root.setAttribute('aria-readonly', 'true');
    this.root.innerHTML = '<div class="chip-selector-label"><small class="chip-selector-preset" hidden></small><strong class="chip-selector-value"></strong></div><div class="chip-selector-track"><i></i><em class="chip-stop-quarter"></em><em class="chip-stop-half"></em><em class="chip-stop-full"></em><b></b></div><span class="chip-selector-max"></span>';
    this.host.appendChild(this.root);
    const query = selector => this.root.querySelector(selector);
    this.label = query('.chip-selector-label'); this.value = query('.chip-selector-value'); this.preset = query('.chip-selector-preset');
    this.fill = query('i'); this.thumb = query('b'); this.track = query('.chip-selector-track'); this.maximum = query('.chip-selector-max');
    this.stops = ['quarter', 'half', 'full'].map(name => query(`.chip-stop-${name}`));
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { this.bounds = null; if (!this.root.hidden) this.layout(); }) : null;
    this.resizeObserver?.observe(container); if (this.header) this.resizeObserver?.observe(this.header);

  }
  render(state, active) {
    this.state = state;
    this.root.hidden = !active || !state.enabled || !state.selecting || state.inFlight || !(state.maximum > 0);
    if (this.root.hidden) return;
    const selected = state.selecting ? state.selected : state.pending, ratio = state.ratio || 0;
    const preset = selected > 0 && selected === state.bankroll ? 'ALL IN' : state.preset || '';
    this.value.textContent = Number(selected || 0).toLocaleString('zh-CN');
    this.preset.textContent = preset; this.preset.hidden = !preset;
    this.fill.style.height = `${ratio * 100}%`; this.thumb.style.bottom = `${ratio * 100}%`;
    this.maximum.textContent = `最大 ${state.maximum.toLocaleString('zh-CN')}`;
    this.root.setAttribute('aria-valuemin', '0'); this.root.setAttribute('aria-valuemax', String(state.maximum));
    this.root.setAttribute('aria-valuenow', String(selected || 0)); this.root.setAttribute('aria-valuetext', `${preset} ${this.value.textContent}`.trim());
    for (let i = 0; i < this.stops.length; i++) {
      const stop = (state.stops || []).find(item => item.label === ['1/4池', '半池', '满池'][i]), node = this.stops[i];
      node.hidden = !stop;
      if (stop) { node.style.bottom = `${stop.ratio * 100}%`; node.className = `chip-selector-stop chip-stop-${['quarter', 'half', 'full'][i]}${selected === stop.amount ? ' snapped' : ''}`; }
    }
    this.layout(false);
  }
  layout(force = true) {
    if (!this.bounds || force) {
      const rect = this.container.getBoundingClientRect(), header = this.header?.getBoundingClientRect();
      this.bounds = chipSliderBounds(rect.height, Number.isFinite(header?.bottom) ? header.bottom - rect.top : undefined);
      this.root.style.top = `${this.bounds.top}px`; this.root.style.height = `${this.bounds.travel}px`;
      this.track.style.height = `${this.bounds.travel}px`;
    }
    const height = this.preset.hidden ? 28 : 44;
    this.label.style.top = `${clamp((1 - (this.state?.ratio || 0)) * this.bounds.travel - 14 - (this.preset.hidden ? 0 : 16), 0, Math.max(0, this.bounds.travel - height))}px`;
    return this.bounds.travel;
  }
}
