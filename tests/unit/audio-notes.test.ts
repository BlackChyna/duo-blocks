import { describe, it, expect } from 'vitest';
import {
  midiToHz,
  comboMidi,
  clearArp,
  COMBO_LADDER,
  SONGS,
  DRUM_VARIANTS,
  expandSong,
  barSeconds,
  isRising,
} from '../../src/features/game/audio/notes';

describe('audio notes composition', () => {
  it('midiToHz anchors A4 = 440 Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 5);
    expect(midiToHz(81)).toBeCloseTo(880, 4);
    expect(midiToHz(57)).toBeCloseTo(220, 4);
  });

  it('combo ladder is strictly rising and mapping is monotonic', () => {
    expect(isRising(COMBO_LADDER)).toBe(true);
    expect(isRising([comboMidi(2), comboMidi(3), comboMidi(4)])).toBe(true);
    // saturates at the top of the ladder rather than climbing forever
    expect(comboMidi(5000)).toBe(74 + COMBO_LADDER[COMBO_LADDER.length - 1]);
  });

  it('line-clear arps get richer with more lines and are positive length on real clears', () => {
    expect(clearArp(0)).toEqual([]);
    expect(clearArp(1).length).toBe(3);
    expect(clearArp(2).length).toBeGreaterThan(clearArp(1).length);
    expect(clearArp(4).length).toBeGreaterThan(clearArp(2).length);
    expect(isRising(clearArp(3))).toBe(true);
  });

  it('music bars: every song phrase has pad/bass/8 arp notes in playable ranges', () => {
    for (const song of SONGS) {
      for (const bar of song.chords) {
        expect(bar.pad.length).toBe(4);
        expect(bar.arp).toHaveLength(8);
        expect(bar.bass).toBeLessThan(42); // real bass region
        for (const m of [...bar.pad, ...bar.arp]) expect(m).toBeGreaterThanOrEqual(28);
        expect(Math.max(...bar.arp)).toBeLessThanOrEqual(92);
      }
    }
  });

  it('tempo sits in a calm range (60-100 BPM)', () => {
    for (const song of SONGS) {
      const s = barSeconds(song.bpm) / 4; // beat seconds
      expect(s).toBeGreaterThan(60 / 100);
      expect(s).toBeLessThan(60 / 60);
    }
  });

  it('playlist: exactly SIX songs, each expands to a 3-4 minute loop', () => {
    expect(SONGS).toHaveLength(6);
    const ids = new Set(SONGS.map(s => s.id));
    expect(ids.size).toBe(6);
    for (const song of SONGS) {
      const bars = expandSong(song);
      expect(bars.length).toBe(song.totalBars);
      const seconds = song.totalBars * barSeconds(song.bpm);
      expect(seconds).toBeGreaterThanOrEqual(180); // ≥ 3 min
      expect(seconds).toBeLessThanOrEqual(240);     // ≤ 4 min
    }
  });

  it('expansion varies over the run: intro sparse, odd cycles lift an octave', () => {
    const bars = expandSong(SONGS[0]);
    const intro = bars[0];
    const normal = bars[4]; // first bar of cycle 1
    // intro uses rests on off-eighths, later bars do not
    expect(intro.arp.filter(n => n === null).length).toBeGreaterThan(0);
    expect(normal.arp.filter(n => n === null)).toHaveLength(0);
    // odd-cycle bar sits an octave above its base phrase
    expect(normal.arp.find(n => n !== null)!).toBeGreaterThan(
      SONGS[0].chords[0].arp[0],
    );
  });

  it('fills appear on the last bar of every 4th phrase', () => {
    const bars = expandSong(SONGS[1]);
    for (let i = 0; i < bars.length; i++) {
      const expectFill = Math.floor(i / 16) === (i + 1) / 16 - 1 && i % 16 === 15;
      expect(bars[i].fill).toBe(expectFill || ((i + 1) % 16 === 0 && i > 0));
    }
    expect(bars.some(b => b.fill)).toBe(true);
  });

  it('drum groove: kick 1&3, clap 2&4 in the standard variant', () => {
    const v = DRUM_VARIANTS.standard;
    expect(v.kick[0] && v.kick[4]).toBe(true);
    expect(v.snare[2] && v.snare[6]).toBe(true);
    expect(v.hatOpen.filter(Boolean).length).toBeGreaterThan(0);
  });

  it('each song carves its own groove + key identity', () => {
    const styles = new Set(SONGS.map(s => s.drums));
    expect(styles.size).toBe(SONGS.length);
    // every song starts on its own root note (own key center)
    const basses = SONGS.map(s => s.chords[0].bass * 12 + s.chords[0].pad[0]);
    expect(new Set(basses).size).toBe(SONGS.length);
    // the last song is the intense one
    expect(SONGS[5].drums).toBe('punchy');
    expect(SONGS[5].bpm).toBeGreaterThanOrEqual(96);
  });
});
