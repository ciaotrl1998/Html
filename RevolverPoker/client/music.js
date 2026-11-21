export const MUSIC_TRACK = '/client/assets/music/saloon-americana-01';

async function loadMusicTrack(track, context) {
  // Load an extensionless binary URL so download managers do not intercept MP3 playback.
  const response = await fetch(track);
  if (!response.ok) throw new Error('Music track unavailable');
  return context.decodeAudioData(await response.arrayBuffer());
}

export class GameMusic {
  constructor({ volume, createContext, loadTrack = loadMusicTrack, visible = true }) {
    this.volume = volume;
    this.createContext = createContext;
    this.loadTrack = loadTrack;
    this.visible = visible;
    this.offset = 0;
  }

  setVolume(volume) {
    this.volume = volume;
    if (this.gain) this.gain.gain.value = volume;
    if (volume) void this.unlock();
    else this.pause();
  }

  setVisible(visible) {
    this.visible = visible;
    if (!visible) this.pause();
    else if (this.context) void this.unlock();
  }

  async unlock() {
    if (!this.volume || !this.visible) return;
    try {
      if (!this.gain) {
        this.context = this.createContext();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.volume;
        this.gain.connect(this.context.destination);
      }
      if (this.context.state !== 'running') await this.context.resume();
      if (this.source) return;
      this.bufferPromise ||= Promise.resolve().then(() => this.loadTrack(MUSIC_TRACK, this.context));
      const buffer = await this.bufferPromise;
      if (this.source || !this.volume || !this.visible || this.context.state !== 'running') return;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.gain);
      this.startedAt = this.context.currentTime;
      source.start(0, this.offset);
      this.source = source;
    } catch { /* Music is optional when the browser or audio system blocks playback. */ }
  }

  pause() {
    if (!this.source) return;
    const elapsed = this.context.currentTime - this.startedAt;
    this.offset = (this.offset + elapsed) % this.source.buffer.duration;
    this.source.stop();
    this.source.disconnect();
    this.source = null;
  }
}
