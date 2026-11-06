import { describe, it, expect } from 'vitest';
import {
  midiToHz,
  comboMidi,
  clearArp,
  COMBO_LADDER,
  MUSIC_BARS,
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
});
