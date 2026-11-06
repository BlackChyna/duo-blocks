/**
 * DUO BLOCKS — synthesised audio engine (WebAudio, zero asset files).
 *
 * Lazy-singleton module: `ensure()` must first be called from a user-gesture
 * handler (browser autoplay policy) — sign-in button / any tray pointer-down.
 * SFX: mallet placement, rising combo ladder, richer line-clear arpeggios,
 * victory fanfare, defeat sting. Music: 84 BPM A-minor 4-bar loop scheduled
 * with a look-ahead scheduler; silent when mode is 'off' or 'sfx'.
 *
 * Mode cycles: 'all' (music + sfx) → 'sfx' → 'off' (mute) → 'all'.
 * Persisted in localStorage under 'duo-blocks:audio'.
 */
import {
  midiToHz,
  clearArp,
  comboMidi,
  VICTORY_ARP,
  DEFEAT_ARP,
  SONGS,
  DRUM_VARIANTS,
  expandSong,
  beatSeconds,
  type SequencedBar,
  type DrumPattern,
} from './notes';

export type AudioMode = 'all' | 'sfx' | 'off';

const STORAGE_KEY = 'duo-blocks:audio';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private drumBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private mode: AudioMode = 'all';
  private schedulerId: number | null = null;
  private nextBarTime = 0;
  private barIndex = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as
        | { mode?: AudioMode }
        | null;
      if (saved && (saved.mode === 'all' || saved.mode === 'sfx' || saved.mode === 'off')) {
        this.mode = saved.mode;
      }
    } catch {
      /* ignore corrupted settings */
    }
  }

  getMode(): AudioMode {
    return this.mode;
  }

  setMode(mode: AudioMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode }));
    } catch {
      /* private mode */
    }
    if (mode === 'off' || mode === 'sfx') this.stopMusic();
    if (this.ctx) { // reflect mute on the graph immediately
      const targets = this.master;
      if (targets) targets.gain.value = this.gainFor();
    }
  }

  cycleMode(): AudioMode {
    const next: AudioMode = this.mode === 'all' ? 'sfx' : this.mode === 'sfx' ? 'off' : 'all';
    this.setMode(next);
    if (next === 'all') this.startMusic();
    return next;
  }

  private gainFor(): number {
    return this.mode === 'off' ? 0 : 1;
  }

  /** Create/resume the graph; true when audio can actually play (iOS-safe: call from a gesture). */
  ensure(): boolean {
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        const ctx = new AC();
        const master = ctx.createGain();
        master.gain.value = this.gainFor();

        const musicFilter = ctx.createBiquadFilter();
        musicFilter.type = 'lowpass';
        musicFilter.frequency.value = 2400;

        const sfxBus = ctx.createGain();
        sfxBus.gain.value = 0.9;
        sfxBus.connect(master);

        const musicBus = ctx.createGain();
        musicBus.gain.value = 0.8;
        musicBus.connect(musicFilter);
        musicFilter.connect(master);

        const drumBus = ctx.createGain();
        drumBus.gain.value = 0.65;
        drumBus.connect(musicFilter);

        // shared 1-second white noise buffer for the percussive voices
        const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        master.connect(ctx.destination);

        this.ctx = ctx;
        this.master = master;
        this.sfxBus = sfxBus;
        this.musicBus = musicBus;
        this.drumBus = drumBus;
        this.noiseBuf = noise;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------- SFX primitives
  private tone(
    freq: number,
    start: number,
    dur: number,
    opts: { type?: OscillatorType; peak?: number; bus?: GainNode } = {},
  ): void {
    if (!this.ctx || !this.sfxBus) return;
    const { type = 'triangle', peak = 0.15, bus = this.sfxBus } = opts;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** Soft mallet "thock" for every placed piece. */
  place(): void {
    if (this.mode === 'off' || !this.ensure()) return;
    const t = this.ctx!.currentTime;
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    this.tone(200 * jitter, t, 0.12, { type: 'sine', peak: 0.2 });
    this.tone(520 * jitter, t, 0.05, { type: 'triangle', peak: 0.08 });
  }

  /** Line clear: rising arpeggio; pitch climbs on hot combo streaks. */
  clear(lines: number, combo: number): void {
    if (lines <= 0 || this.mode === 'off' || !this.ensure()) return;
    const t0 = this.ctx!.currentTime;
    const notes = clearArp(lines);
    const step = 0.085;
    notes.forEach((midi, i) => {
      this.tone(midiToHz(midi), t0 + i * step, 0.28, { type: 'triangle', peak: 0.14 });
    });
    if (combo >= 2) {
      // sparkle cap note riding the combo ladder
      this.tone(midiToHz(comboMidi(combo)), t0 + notes.length * step, 0.35, {
        type: 'sine',
        peak: 0.12,
      });
    }
  }

  victory(): void {
    if (this.mode === 'off' || !this.ensure()) return;
    const t0 = this.ctx!.currentTime;
    VICTORY_ARP.forEach((midi, i) => {
      this.tone(midiToHz(midi), t0 + i * 0.13, 0.4, { type: 'triangle', peak: 0.16 });
    });
    // final chord
    [72, 76, 79, 84].forEach(m => this.tone(midiToHz(m), t0 + 0.75, 0.9, { type: 'sine', peak: 0.08 }));
  }

  defeat(): void {
    if (this.mode === 'off' || !this.ensure()) return;
    const t0 = this.ctx!.currentTime;
    DEFEAT_ARP.forEach((midi, i) => {
      this.tone(midiToHz(midi), t0 + i * 0.22, 0.5, { type: 'sine', peak: 0.16 });
    });
  }

  /** Soft two-note chime when the objective turns "technically cleared". */
  objectiveGlow(): void {
    if (this.mode === 'off' || !this.ensure()) return;
    const t0 = this.ctx!.currentTime;
    this.tone(midiToHz(88), t0, 0.5, { type: 'sine', peak: 0.09 });
    this.tone(midiToHz(93), t0 + 0.12, 0.55, { type: 'triangle', peak: 0.08 });
  }

  // -------------------------------------------------------- background loop
  startMusic(): void {
    if (this.mode === 'off' || this.mode === 'sfx') return;
    if (!this.ensure() || !this.ctx || !this.musicBus) return;
    if (this.schedulerId !== null) return; // already playing
    // every music session starts from song one, then the playlist rolls on
    this.songIdx = 0;
    this.barCursor = 0;
    this.barsCacheSong = -1;
    this.nextBarTime = this.ctx.currentTime + 0.15;
    // slightly warm up with a first soft pad, then keeps rolling
    this.schedulerId = window.setInterval(() => this.scheduleAhead(), 150);
    this.scheduleAhead();
  }

  stopMusic(): void {
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  /**
   * Arms a one-shot first-gesture fallback: browsers may block the initial
   * resume() before any interaction, so the very next pointerdown / key
   * presses music back on. Idempotent; no-op once music is already rolling.
   */
  private armed = false;
  armAutoplay(): void {
    if (this.armed) return;
    this.armed = true;
    const kick = () => {
      if (this.mode === 'all' && this.schedulerId === null) this.startMusic();
    };
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('pointermove', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });
  }

  isMusicPlaying(): boolean {
    return this.schedulerId !== null;
  }

  // -------------------------------------------------------- percussion
  /** Soft synthesized kick: pitch-dropping sine thump. */
  private kick(start: number): void {
    if (!this.ctx || !this.drumBus) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, start);
    osc.frequency.exponentialRampToValueAtTime(44, start + 0.11);
    g.gain.setValueAtTime(0.5, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
    osc.connect(g);
    g.connect(this.drumBus);
    osc.start(start);
    osc.stop(start + 0.16);
  }

  /** Gentle clap/snare: filtered noise burst + a small tonal body. */
  private snare(start: number): void {
    if (!this.ctx || !this.drumBus || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.11);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.drumBus);
    src.start(start, Math.random() * 0.4, 0.12);
    // body
    const osc = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, start);
    bg.gain.setValueAtTime(0.07, start);
    bg.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
    osc.connect(bg);
    bg.connect(this.drumBus);
    osc.start(start);
    osc.stop(start + 0.08);
  }

  /** Closed/open hat: short high-passed tick; open decays longer for bounce. */
  private hat(start: number, open: boolean): void {
    if (!this.ctx || !this.drumBus || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = this.ctx.createGain();
    const peak = open ? 0.055 : 0.04;
    const decay = open ? 0.12 : 0.035;
    g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + decay);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.drumBus);
    src.start(start, Math.random() * 0.4, 0.13);
  }

  private scheduleDrums(barStart: number, pattern: DrumPattern, eighth: number, fill: boolean): void {
    for (let i = 0; i < 8; i++) {
      const t = barStart + i * eighth;
      if (pattern.kick[i]) this.kick(t);
      if (pattern.snare[i]) this.snare(t);
      if (pattern.hatOpen[i]) this.hat(t, true);
      else this.hat(t, false);
      if (fill && i >= 5) this.snare(t); // tiny clap roll into the next phrase
    }
  }

  private songIdx = 0;
  private barCursor = 0;
  private barsCacheSong = -1;
  private barsCache: SequencedBar[] = [];

  private songBuffer(): SequencedBar[] {
    if (this.barsCacheSong !== this.songIdx) {
      this.barsCache = expandSong(SONGS[this.songIdx]);
      this.barsCacheSong = this.songIdx;
    }
    return this.barsCache;
  }

  private scheduleAhead(): void {
    if (!this.ctx || !this.musicBus) return;
    const musicBus = this.musicBus;
    while (this.nextBarTime < this.ctx.currentTime + 0.6) {
      // advance to the next song when the current one runs out of bars —
      // seamless: the scheduler keeps streaming, the clock never stops
      let bars = this.songBuffer();
      if (this.barCursor >= bars.length) {
        this.songIdx = (this.songIdx + 1) % SONGS.length;
        this.barCursor = 0;
        bars = this.songBuffer();
      }
      const song = SONGS[this.songIdx];
      const info = bars[this.barCursor];
      const beat = beatSeconds(song.bpm);
      const beatQ = beat / 2; // eighth
      const bar = 4 * beat;
      const start = this.nextBarTime;
      // pad chord — slow swell, long release
      info.pad.forEach((m, i) => {
        this.tone(midiToHz(m), start + i * 0.02, bar * 1.05, {
          type: 'sine',
          peak: 0.035,
          bus: musicBus,
        });
      });
      // bass root (whole bar)
      this.tone(midiToHz(info.bass), start, bar * 0.98, {
        type: 'sine',
        peak: 0.11,
        bus: musicBus,
      });
      // bouncy eighth-note arp (rests in the intro), gentle accents
      info.arp.forEach((n, i) => {
        if (n === null) return;
        const accent = i % 4 === 0 ? 0.075 : 0.05;
        this.tone(midiToHz(n + 12), start + i * beatQ, 0.30, {
          type: 'triangle',
          peak: accent,
          bus: musicBus,
        });
      });
      // occasional high shimmer on alternate bars
      if (this.barCursor % 4 === 2) {
        this.tone(midiToHz(info.pad[3] + 24), start + bar * 0.5, 0.8, {
          type: 'sine',
          peak: 0.03,
          bus: musicBus,
        });
      }
      // soft drum groove under everything (this song's variant)
      this.scheduleDrums(start, DRUM_VARIANTS[song.drums], beatQ, info.fill);
      this.nextBarTime = start + bar;
      this.barCursor += 1;
    }
  }
}

export const audio = new AudioEngine();
