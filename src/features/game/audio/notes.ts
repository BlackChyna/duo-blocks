/**
 * DUO BLOCKS — audio note maths (pure, testable).
 * All frequencies derive from MIDI note numbers / semitone offsets; no WebAudio
 * lives in this module so the composition can be unit-tested in node.
 */

export const MIDI_A4 = 69;
export const A4_HZ = 440;

export function midiToHz(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - MIDI_A4) / 12);
}

export function semitoneHz(semitones: number, baseMidi = MIDI_A4): number {
  return midiToHz(baseMidi + semitones);
}

/** Pentatonic rise ladder for combos — ascending, ~1 octave-ish spread. */
export const COMBO_LADDER = [0, 4, 7, 12, 16, 19, 24, 28, 31, 36];

/** Pitch (MIDI) for a combo streak value (2+). 1 or lower → base note. */
export function comboMidi(combo: number): number {
  const c = Math.max(2, combo);
  const idx = Math.min(COMBO_LADDER.length - 1, c - 2);
  return 74 + COMBO_LADDER[idx]; // F#5-ish base
}

/** Line-clear arpeggio: rising mallet notes, richer as `lines` climbs. */
export const CLEAR_ARP: number[][] = [
  [72, 76, 79],          // 1 line: C E G (sparkle 5)
  [72, 76, 79, 84],      // 2 lines: add octave C
  [72, 76, 79, 84, 88],  // 3+ lines: full sparkle fanfare
];

export function clearArp(lines: number): number[] {
  if (lines <= 0) return [];
  if (lines === 1) return CLEAR_ARP[0];
  if (lines === 2) return CLEAR_ARP[1];
  return CLEAR_ARP[2];
}

/** Victory fanfare notes (confidence: 5-note ascend). */
export const VICTORY_ARP = [64, 67, 71, 72, 79];

/** Defeat/stuck sting (low, slow: two-note descend). */
export const DEFEAT_ARP = [56, 49];

/**
 * Background music loop — warm 4-chord progression in A minor:
 * Am7 → Fmaj7 → Cmaj → G, with bass roots and an eighth-note arp pattern.
 * MIDI note numbers so voicing is stable across the loop.
 */
export interface MusicBar {
  pad: number[];      // sustained chord voicing
  bass: number;       // single bass root for the bar
  arp: number[];      // eighth-note arp over the chord (8 eighths)
}

export const MUSIC_BARS: MusicBar[] = [
  {
    pad: [57, 60, 64, 67],   // Am7
    bass: 33,                // A1
    arp: [69, 72, 76, 67, 72, 76, 79, 76],
  },
  {
    pad: [53, 57, 60, 64],   // Fmaj7
    bass: 29,                // F1
    arp: [65, 69, 72, 64, 69, 72, 76, 72],
  },
  {
    pad: [60, 64, 67, 71],   // Cmaj (opened up)
    bass: 36,                // C2
    arp: [60, 64, 67, 72, 64, 67, 71, 67],
  },
  {
    pad: [55, 59, 62, 65],   // G7 voicing
    bass: 31,                // G1
    arp: [67, 71, 74, 62, 67, 71, 74, 71],
  },
];

/** Seconds per beat at the background tempo (84 BPM). */
export const MUSIC_BPM = 84;

export function beatSeconds(bpm = MUSIC_BPM): number {
  return 60 / bpm;
}

/** Monotonic strictly-rising check — used to assert ladder/arp ordering. */
export function isRising(notes: number[]): boolean {
  for (let i = 1; i < notes.length; i++) if (notes[i] <= notes[i - 1]) return false;
  return true;
}
