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
 * Background music loop — bouncy but soothing.
 * Bright 4-chord pop progression: Cmaj → Gmaj → Am7 → Fmaj7 ("I-V-vi-IV").
 * The arp bounces across octaves (root to 3rd to octave and back) so it hops
 * instead of droning; soft synthesized drums layer under it (kick on beats
 * 1 & 3, clap on 2 & 4, hats rolling every eighth — see DRUM_PATTERN).
 */
export interface MusicBar {
  pad: number[];      // sustained chord voicing
  bass: number;       // single bass root for the bar
  arp: number[];      // 8 eighth-notes over the chord (bouncy contour)
}

export const MUSIC_BARS: MusicBar[] = [
  {
    pad: [60, 64, 67, 71],   // Cmaj
    bass: 36,                // C2
    arp: [72, 76, 79, 76, 84, 79, 76, 72],  // octave-hop bounce up-down
  },
  {
    pad: [59, 62, 67, 71],   // Gmaj
    bass: 31,                // G1
    arp: [71, 74, 79, 74, 86, 79, 74, 71],  // little leap on 'and of 3'
  },
  {
    pad: [57, 60, 64, 67],   // Am7
    bass: 33,                // A1
    arp: [69, 72, 76, 72, 81, 76, 72, 69],  // warm softening section
  },
  {
    pad: [53, 57, 60, 64],   // Fmaj7
    bass: 29,                // F1
    arp: [69, 72, 77, 72, 81, 77, 72, 69],  // lifts into the loop turn
  },
];

/**
 * Soft boom-bap drums, one bar of 8 eighth-notes.
 * Index 0 & 4 = beats 1,3 (kick), 2 & 6 = beats 2,4 (clap);
 * an extra kick on the final eighth pushes the loop turn along.
 * Hats roll on every eighth; off-beats open up for bounce.
 */
export const DRUM_PATTERN = {
  kick: [true, false, false, false, true, false, false, false],
  extraKick: [false, false, false, false, false, false, false, true],
  snare: [false, false, true, false, false, false, true, false],
  hatOpen: [false, true, false, true, false, true, false, false],
} as const;

/** Calm but moving groove tempo. */
export const MUSIC_BPM = 88;

export function beatSeconds(bpm = MUSIC_BPM): number {
  return 60 / bpm;
}

/** Monotonic strictly-rising check — used to assert ladder/arp ordering. */
export function isRising(notes: number[]): boolean {
  for (let i = 1; i < notes.length; i++) if (notes[i] <= notes[i - 1]) return false;
  return true;
}
