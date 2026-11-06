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
 * Background music playlist — SIX songs, each 3–4 minutes, played in order
 * with seamless blending (the scheduler streams bar-by-bar into the next song
 * with no gap), then loops back to song one.
 * Bright/bouncy pop progressions; the arp bounces across octaves; each song
 * carries its own soft drum groove (see DRUM_VARIANTS) and its own key/tempo.
 */
export interface MusicBar {
  pad: number[];      // sustained chord voicing
  bass: number;       // single bass root for the bar
  arp: number[];      // 8 eighth-notes over the chord (bouncy contour)
}

export type DrumStyle = 'standard' | 'halftime' | 'driving' | 'sparse' | 'syncopated' | 'punchy';

/** One bar of 8 eighth-notes per drum voice. */
export interface DrumPattern {
  kick: boolean[];       // beats 1 & 3 (index 0,4) typically
  snare: boolean[];      // clap/backbeat (index 2,6) typically
  hatOpen: boolean[];    // open hat on off-eighths for bounce
}

export const DRUM_VARIANTS: Record<DrumStyle, DrumPattern> = {
  standard: {
    kick: [true, false, false, false, true, false, false, false],
    snare: [false, false, true, false, false, false, true, false],
    hatOpen: [false, true, false, true, false, true, false, false],
  },
  halftime: {
    kick: [true, false, false, false, false, false, false, false],
    snare: [false, false, false, false, true, false, false, false],
    hatOpen: [false, false, true, false, false, false, true, false],
  },
  driving: {
    kick: [true, false, false, false, true, false, false, true],
    snare: [false, false, true, false, false, false, true, false],
    hatOpen: [false, true, false, true, false, true, false, true],
  },
  sparse: {
    kick: [true, false, false, false, false, false, false, false],
    snare: [false, false, true, false, false, false, false, false],
    hatOpen: [false, false, false, true, false, false, false, true],
  },
  syncopated: {
    kick: [true, false, false, true, false, false, true, false],
    snare: [false, false, true, false, false, false, true, false],
    hatOpen: [true, false, true, false, true, false, true, true],
  },
  // the intense closer: kick pushes on every quarter + an extra 8th-note
  // pickup, snare keeps the backbeat, open hats ride hard
  punchy: {
    kick: [true, false, false, true, true, false, false, true],
    snare: [false, false, true, false, false, false, true, false],
    hatOpen: [false, true, false, true, false, true, true, true],
  },
};

export interface SongDef {
  id: string;
  name: string;
  bpm: number;
  drums: DrumStyle;
  /** Loop length in bars (4 beats each) — sized for a 3–4 minute runtime. */
  totalBars: number;
  /** The 4-bar phrase the whole song is built from. */
  chords: MusicBar[];
}

export const SONGS: SongDef[] = [
  {
    id: 'S1', name: 'Cyril Hop', bpm: 88, drums: 'standard', totalBars: 80,
    chords: [ // C – G – Am – F
      { pad: [60, 64, 67, 71], bass: 36, arp: [72, 76, 79, 76, 84, 79, 76, 72] },
      { pad: [59, 62, 67, 71], bass: 31, arp: [71, 74, 79, 74, 86, 79, 74, 71] },
      { pad: [57, 60, 64, 67], bass: 33, arp: [69, 72, 76, 72, 81, 76, 72, 69] },
      { pad: [53, 57, 60, 64], bass: 29, arp: [69, 72, 77, 72, 81, 77, 72, 69] },
    ],
  },
  {
    id: 'S2', name: 'Yayra Dusk', bpm: 86, drums: 'sparse', totalBars: 78,
    chords: [ // Am – F – C – G
      { pad: [57, 60, 64, 67], bass: 33, arp: [69, 72, 76, 72, 81, 76, 72, 69] },
      { pad: [53, 57, 60, 64], bass: 29, arp: [65, 69, 72, 69, 77, 72, 69, 65] },
      { pad: [60, 64, 67, 71], bass: 36, arp: [72, 76, 79, 76, 84, 79, 76, 72] },
      { pad: [59, 62, 67, 71], bass: 31, arp: [67, 71, 74, 71, 79, 74, 71, 67] },
    ],
  },
  {
    id: 'S3', name: 'Duo Dexter', bpm: 92, drums: 'syncopated', totalBars: 82,
    chords: [ // G – D – Em – C
      { pad: [59, 62, 67, 71], bass: 31, arp: [71, 74, 79, 74, 86, 79, 74, 71] },
      { pad: [50, 54, 57, 62], bass: 38, arp: [74, 78, 81, 74, 86, 81, 78, 74] },
      { pad: [52, 55, 59, 64], bass: 40, arp: [76, 79, 83, 79, 88, 83, 79, 76] },
      { pad: [60, 64, 67, 71], bass: 36, arp: [72, 76, 79, 76, 84, 79, 76, 72] },
    ],
  },
  {
    id: 'S4', name: 'Grid Runner', bpm: 90, drums: 'driving', totalBars: 80,
    chords: [ // F – C – Dm – Bb
      { pad: [53, 57, 60, 64], bass: 29, arp: [69, 72, 77, 72, 81, 77, 72, 69] },
      { pad: [60, 64, 67, 71], bass: 36, arp: [72, 76, 79, 76, 84, 79, 76, 72] },
      { pad: [50, 53, 57, 62], bass: 38, arp: [74, 77, 81, 77, 86, 77, 74, 77] },
      { pad: [46, 50, 53, 58], bass: 34, arp: [70, 74, 77, 74, 82, 77, 74, 70] },
    ],
  },
  {
    id: 'S5', name: 'Night Duo', bpm: 84, drums: 'halftime', totalBars: 76,
    chords: [ // D – A – Bm – G
      { pad: [50, 54, 57, 62], bass: 38, arp: [74, 78, 81, 78, 86, 81, 78, 74] },
      { pad: [57, 61, 64, 69], bass: 33, arp: [73, 77, 81, 77, 85, 81, 77, 73] },
      { pad: [59, 62, 66, 71], bass: 35, arp: [71, 75, 78, 75, 83, 78, 75, 71] },
      { pad: [55, 59, 62, 67], bass: 31, arp: [67, 71, 74, 71, 79, 74, 71, 67] },
    ],
  },
  {
    id: 'S6', name: 'Rhyme Duel', bpm: 96, drums: 'punchy', totalBars: 80,
    chords: [ // Em – C – G – D (the intense closer before the loop restarts)
      { pad: [52, 55, 59, 64], bass: 40, arp: [76, 79, 83, 79, 88, 83, 79, 76] },
      { pad: [55, 60, 64, 67], bass: 36, arp: [72, 76, 79, 76, 84, 79, 76, 72] },
      { pad: [55, 59, 62, 67], bass: 31, arp: [71, 74, 79, 74, 86, 79, 74, 71] },
      { pad: [50, 54, 57, 62], bass: 38, arp: [74, 78, 81, 74, 86, 81, 78, 74] },
    ],
  },
];

/**
 * Deterministic song expansion: cycles of the 4-bar phrase with gentle
 * variation so ~80 bars never feel like a flat copy:
 *  - cycle 0 = intro: pads only, arp halved (settles into the groove)
 *  - every second cycle answers an octave up (capped high)
 *  - every 4th phrase ends with a fill (engine adds a small clap roll)
 */
export interface SequencedBar {
  pad: number[];
  bass: number;
  arp: (number | null)[]; // null = rest (no note this eighth)
  drums?: false | true;   // placeholder slot reserved for future per-bar flags
  fill: boolean;
}

function capNote(n: number): number {
  return n > 91 ? n - 12 : n;
}

export function expandSong(song: SongDef): SequencedBar[] {
  const out: SequencedBar[] = [];
  const cycles = Math.ceil(song.totalBars / 4);
  for (let c = 0; c < cycles; c++) {
    for (let b = 0; b < 4 && out.length < song.totalBars; b++) {
      const base = song.chords[b];
      const isIntro = c === 0;
      const octaveUp = c % 2 === 1; // every second cycle answers an octave higher
      const arp: (number | null)[] = base.arp.map((n, i) => {
        if (isIntro && i % 2 === 1) return null; // sparse intro
        let note = octaveUp ? n + 12 : n;
        return capNote(note);
      });
      const fill = c % 4 === 3 && b === 3;
      out.push({ pad: base.pad, bass: base.bass, arp, fill });
    }
  }
  return out;
}

/** Seconds one bar of a song occupies at its tempo (4 beats/bar). */
export function barSeconds(bpm: number): number {
  return 4 * beatSeconds(bpm);
}

/**
 * Soft boom-bap groove (one bar of 8 eighth-notes).
 * kick on 1 & 3, clap on 2 & 4, hats rolling with open off-beats.
 */
export const DRUM_PATTERN: DrumPattern = DRUM_VARIANTS.standard;

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
