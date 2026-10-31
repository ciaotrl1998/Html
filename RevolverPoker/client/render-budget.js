// Keep the 3D buffer bounded independently of the native-resolution HTML UI.
export const normalizeQuality = value => value === 'low' || value === true ? 'low' : value === 'medium' ? 'medium' : 'high';
export const QUALITY_PRESETS = {
  high: { shadowSize: 1024, shadowFps: 30, idleShadowFps: 4, resolutionScale: 1, minimumScale: .65 },
  medium: { shadowSize: 512, shadowFps: 15, idleShadowFps: 2, resolutionScale: .9, minimumScale: .95 },
  low: { shadowSize: 512, shadowFps: 0, idleShadowFps: 0, resolutionScale: 1, minimumScale: 1 }
};
export class RenderBudget {
  constructor({ pixelRatio = 1, mobile = false, editor = false } = {}) {
    this.deviceRatio = pixelRatio; this.mobile = mobile; this.editor = editor;
    this.baseRatio = Math.min(pixelRatio, editor ? 1.7 : mobile ? 1.5 : 1.7);
    this.scale = 1; this.quality = 'high'; this.reset();
  }
  resize(width, height) {
    const cap = this.editor ? Infinity : this.mobile ? 900000 : 1400000;
    this.baseRatio = Math.min(this.deviceRatio, this.editor ? 1.7 : this.mobile ? 1.5 : 1.7, Math.sqrt(cap / Math.max(1, width * height)));
  }
  get maximumRatio() { return this.baseRatio * (this.editor ? 1 : this.settings.resolutionScale); }
  get ratio() {
    if (this.quality === 'low') return Math.min(1, this.baseRatio);
    const maximum = this.maximumRatio;
    return Math.min(maximum, Math.max(Math.min(.75, maximum), maximum * this.scale));
  }
  get settings() { return QUALITY_PRESETS[this.quality]; }
  setQuality(value) {
    const quality = normalizeQuality(value);
    if (this.quality === quality) return;
    this.quality = quality; this.scale = 1; this.reset();
  }
  reset() { this.start = null; this.last = null; this.frames = 0; this.stable = 0; }
  sample(time, fps) {
    if (this.editor || this.quality === 'low') return false;
    // Some mobile browsers suspend RAF before a hidden-page tick is delivered.
    if (this.last !== null && time - this.last > 1000) this.reset();
    this.last = time;
    if (this.start === null) { this.start = time; this.frames = 0; return false; }
    this.frames++;
    const elapsed = time - this.start;
    if (elapsed < 2000) return false;
    const achieved = this.frames * 1000 / elapsed, previous = this.ratio;
    if (achieved < fps * .88) {
      this.scale = Math.max(Math.min(1, Math.max(this.settings.minimumScale, .75 / this.maximumRatio)), this.scale - .1);
      this.stable = 0;
    } else if (achieved >= fps * .98) {
      if (++this.stable >= 4) { this.scale = Math.min(1, this.scale + .05); this.stable = 0; }
    } else this.stable = 0;
    this.start = time; this.frames = 0;
    return Math.abs(this.ratio - previous) > .001;
  }
}
