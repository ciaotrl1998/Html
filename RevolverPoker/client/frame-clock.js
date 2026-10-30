// Keep deadlines aligned to the display clock. Resetting a deadline to `now`
// would turn small RAF timing differences into repeated skipped frames.
export class FrameClock {
  constructor(fps = 60) { this.setRate(fps); }
  setRate(fps) { this.fps = fps === 30 ? 30 : 60; this.interval = 1000 / this.fps; this.reset(); }
  reset() { this.last = null; this.next = null; }
  step(time) {
    if (this.next === null) { this.last = time; this.next = time + this.interval; return this.interval / 1000; }
    const tolerance = .5;
    if (time + tolerance < this.next) return null;
    const seconds = Math.max(0, Math.min(.1, (time - this.last) / 1000));
    this.next += Math.max(1, Math.floor((time - this.next + tolerance) / this.interval) + 1) * this.interval;
    this.last = time;
    return seconds;
  }
}
