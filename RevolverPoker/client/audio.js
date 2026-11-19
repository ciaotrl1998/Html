import { ACTION_TIMING } from '../shared/action-timing.js';

export const SOUND_FILES = Object.freeze({
  deal1: '/client/assets/audio/card-deal-01.wav',
  deal2: '/client/assets/audio/card-deal-02.wav',
  fold: '/client/assets/audio/card-fold.wav',
  check: '/client/assets/audio/table-check.wav',
  push: '/client/assets/audio/chips-push.wav',
  stageSmall: '/client/assets/audio/chips-stage-small.wav',
  stageLarge: '/client/assets/audio/chips-stage-large.wav',
  allInMaleFirst: '/client/assets/audio/all-in-male-01.wav',
  allInMaleFollow: '/client/assets/audio/all-in-male-02.wav',
  allInFemaleFirst: '/client/assets/audio/all-in-female-01.wav',
  allInFemaleFollow: '/client/assets/audio/all-in-female-02.wav',
});

const ALL_IN_VOICES = {
  male: { first: 'allInMaleFirst', follow: 'allInMaleFollow' },
  female: { first: 'allInFemaleFirst', follow: 'allInFemaleFollow' },
};

export function stagedChipSound(amount, pot) {
  return amount > 100 && amount > Math.max(0, Number(pot) || 0) ? 'stageLarge' : 'stageSmall';
}

// One shared, gesture-unlocked context. Audio failures never interrupt play.
export class GameAudio {
  constructor({ enabled = true, volume = 1, random = Math.random,
    loadBank = () => import('./audio-bank.js').then(module => module.SOUND_DATA),
    createContext = () => new (window.AudioContext || window.webkitAudioContext)(),
    now = () => performance.now(), visible = () => !globalThis.document?.hidden } = {}) {
    this.enabled = enabled; this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
    this.random = random; this.loadBank = loadBank;
    this.createContext = createContext; this.now = now; this.visible = visible;
    this.buffers = new Map(); this.active = new Set(); this.generation = 0;
    this.handKey = null; this.actionId = null; this.openingStage = null;
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop();
    else void this.unlock();
  }
  setVolume(volume) {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
    if (this.master) this.master.gain.value = .72 * this.volume;
    if (!this.volume) this.stop();
    else if (this.enabled) void this.unlock();
  }
  async unlock() {
    if (!this.enabled || !this.volume) return false;
    try {
      if (!this.context) {
        this.context = this.createContext();
        this.master = this.context.createGain(); this.master.gain.value = .72 * this.volume;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -8; limiter.knee.value = 12; limiter.ratio.value = 4;
        limiter.attack.value = .003; limiter.release.value = .10;
        this.master.connect(limiter).connect(this.context.destination);
      }
      const resumed = this.context.state === 'running' ? Promise.resolve() : this.context.resume();
      this.loading ||= Promise.all(Object.keys(SOUND_FILES).map(name => this.load(name)));
      await resumed; await this.loading;
      return this.context.state === 'running';
    } catch { return false; }
  }
  load(name) {
    if (!this.buffers.has(name)) {
      const loaded = Promise.resolve().then(async () => {
        // A JS bank avoids download-manager interception of audio URLs.
        // Cache failures too: further clicks must never restart downloads.
        this.bankPromise ||= Promise.resolve().then(() => this.loadBank());
        const data = await this.bankPromise;
        if (!data[name]) throw new Error('Sound unavailable');
        const bytes = Uint8Array.from(atob(data[name]), char => char.charCodeAt(0));
        return this.context.decodeAudioData(bytes.buffer);
      }).catch(() => null);
      this.buffers.set(name, loaded);
    }
    return this.buffers.get(name);
  }
  play(type, { amount = 0, pot = 0, delay = 0, volume = 1 } = {}) {
    if (!this.enabled || !this.volume || !this.visible() || this.context?.state !== 'running') return false;
    const name = type === 'deal' ? this.random() < .5 ? 'deal1' : 'deal2'
      : type === 'stage' ? stagedChipSound(amount, pot) : type;
    if (!SOUND_FILES[name]) return false;
    const generation = this.generation, at = this.now() + delay * 1000;
    void this.load(name).then(buffer => {
      // Never play stale actions after loading, unmuting, or leaving a room.
      if (!buffer || !this.enabled || !this.volume || !this.visible() || generation !== this.generation ||
          this.context.state !== 'running' || this.now() - at > 120) return;
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; gain.gain.value = Math.max(0, Math.min(1, volume));
      source.connect(gain).connect(this.master); this.active.add(source);
      source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
      source.start(this.context.currentTime + Math.max(0, at - this.now()) / 1000);
    }).catch(() => {});
    return true;
  }
  sync(room) {
    const key = room?.hand ? `${room.code}:${room.hand.number}` : null;
    if (!key || key !== this.handKey) {
      this.stop(); this.handKey = key;
      // A first snapshot restores the table silently, including on reconnect.
      this.actionId = room?.actionPresentation?.id;
      this.openingStage = room?.opening?.stage;
      return;
    }
    const opening = room.opening;
    if (opening?.stage !== this.openingStage) {
      this.openingStage = opening?.stage;
      const start = opening?.stage === 'smallBlind' ? opening.smallBlindAt
        : opening?.stage === 'bigBlind' ? opening.bigBlindAt : null;
      if (start != null && room.serverTime - start <= 120) this.play('push', { volume: .8 });
    }
    const action = room.actionPresentation;
    if (!action || action.id === this.actionId) return;
    this.actionId = action.id;
    const type = { check: 'check', fold: 'fold', call: 'push', raise: 'push', allin: 'push' }[action.type];
    const at = action.startedAt + ACTION_TIMING.release;
    if (type && room.serverTime <= at + 120 && room.serverTime < action.endsAt) {
      const delay = Math.max(0, at - room.serverTime) / 1000;
      this.play(type, { delay });
      if (action.type === 'allin') {
        const voice = ALL_IN_VOICES[action.gender]?.[action.allInVoice];
        if (voice) this.play(voice, { delay });
      }
    }
  }
  stop() {
    this.generation++;
    for (const source of this.active) { try { source.stop(); } catch { /* Already ended. */ } }
    this.active.clear();
  }
}
