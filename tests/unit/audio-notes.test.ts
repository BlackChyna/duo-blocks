import { describe, it, expect } from 'vitest';
import {
  midiToHz,
  comboMidi,
  clearArp,
  COMBO_LADDER,
  MUSIC_BARS,
  DRUM_PATTERN,
  beatSeconds,
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

  it('music loop: 4 bars, each bar has pad/bass/8 arp notes, stays in the same key area', () => {
    expect(MUSIC_BARS).toHaveLength(4);
    for (const bar of MUSIC_BARS) {
      expect(bar.pad.length).toBe(4);
      expect(bar.arp).toHaveLength(8);
      expect(bar.bass).toBeLessThan(40); // real bass region
      for (const m of [...bar.pad, ...bar.arp]) expect(m).toBeGreaterThanOrEqual(28);
    }
  });

  it('tempo sits in a calm range (60-100 BPM)', () => {
    const s = beatSeconds();
    expect(s).toBeGreaterThan(60 / 100);
    expect(s).toBeLessThan(60 / 60);
  });

  it('drum groove: kick 1&3, clap 2&4, push kick before the loop turn', () => {
    expect(DRUM_PATTERN.kick[0] && DRUM_PATTERN.kick[4]).toBe(true);
    expect(DRUM_PATTERN.snare[2] && DRUM_PATTERN.snare[6]).toBe(true);
    // closed hats roll every eighth as a fallback layer (engine plays hat always)
    expect(DRUM_PATTERN.hatOpen.filter(Boolean).length).toBeGreaterThan(0);
    expect(DRUM_PATTERN.extraKick[7]).toBe(true);
  });

  it('new loop: bright C-rooted progression, bass wide apart from arp octave', () => {
    expect(MUSIC_BARS[0].bass).toBe(36);  // C
    expect(MUSIC_BARS[1].bass).toBe(31);  // G
    expect(MUSIC_BARS[2].bass).toBe(33);  // A
    expect(MUSIC_BARS[3].bass).toBe(29);  // F
    // bouncing contour: no two adjacent identical notes in each bar arp
    for (const bar of MUSIC_BARS) {
      for (let i = 1; i < bar.arp.length; i++) expect(bar.arp[i]).not.toBe(bar.arp[i - 1]);
      const span = Math.max(...bar.arp) - Math.min(...bar.arp);
      expect(span).toBeGreaterThanOrEqual(12); // octave hops exist → "jumpy"
    }
  });
});
