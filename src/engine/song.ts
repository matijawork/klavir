/** Normalized song format: the only song data the app reads. Produced by scripts/import-song.ts. */

export type Hand = 'L' | 'R';
export type Provenance = 'arranger' | 'claude' | 'verified';

export interface SongNote {
  /** MIDI pitch, 21..108 */
  p: number;
  /** start, in quarter-note beats from song start */
  b: number;
  /** duration in beats */
  d: number;
  h: Hand;
  /** finger 1..5 */
  f?: number;
  fs?: Provenance;
  /** grace note */
  g?: 1;
}

export interface SongMeasure {
  b: number;
  len: number;
  num: number;
  den: number;
  /** measure label from the source score */
  n: string;
}

export interface SongFile {
  format: 1;
  id: string;
  version: string;
  title: string;
  composer: string;
  tempos: { b: number; bpm: number }[];
  measures: SongMeasure[];
  notes: SongNote[];
  pedal: { b: number; on: boolean }[];
  pedalSource: Provenance | null;
  keys: { b: number; fifths: number; mode: 'major' | 'minor' | null }[];
  sections: { b: number; name: string }[];
  /** where the finger numbers come from, for display; absent = see the notes' `fs` */
  fingeringSource?: { checked: boolean; text: string };
  /** true when hands came from a pitch split instead of staves/tracks */
  handsFromPitchSplit: boolean;
  warnings: string[];
}

export interface LibraryEntry {
  id: string;
  title: string;
  composer: string;
  difficulty: number;
  key: string;
  versions: { id: string; label: string }[];
  youtube: string | null;
  source: { url: string; license: string };
  durationSec: number;
  noteCount: number;
  fingering: Provenance | null;
}

/** Converts beats to seconds (at 100 % speed) through a tempo map. */
export class TempoMap {
  private readonly b: number[];
  private readonly t: number[];
  private readonly spb: number[];

  constructor(tempos: { b: number; bpm: number }[]) {
    const sorted = [...tempos].sort((x, y) => x.b - y.b);
    if (sorted.length === 0 || sorted[0]!.b > 0)
      sorted.unshift({ b: 0, bpm: sorted[0]?.bpm ?? 120 });
    this.b = [];
    this.t = [];
    this.spb = [];
    let t = 0;
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]!;
      if (i > 0) t += (cur.b - sorted[i - 1]!.b) * this.spb[i - 1]!;
      this.b.push(cur.b);
      this.t.push(t);
      this.spb.push(60 / cur.bpm);
    }
  }

  private segByBeat(beat: number): number {
    let lo = 0;
    let hi = this.b.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.b[mid]! <= beat) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  toSeconds(beat: number): number {
    const i = this.segByBeat(beat);
    return this.t[i]! + (beat - this.b[i]!) * this.spb[i]!;
  }

  toBeats(sec: number): number {
    let lo = 0;
    let hi = this.t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.t[mid]! <= sec) lo = mid;
      else hi = mid - 1;
    }
    return this.b[lo]! + (sec - this.t[lo]!) / this.spb[lo]!;
  }

  bpmAt(beat: number): number {
    return 60 / this.spb[this.segByBeat(beat)]!;
  }
}

/** Song prepared for playback: times in seconds at 100 % speed, typed arrays for the render loop. */
export interface LoadedSong {
  file: SongFile;
  tempo: TempoMap;
  count: number;
  /** sorted by start */
  start: Float64Array;
  end: Float64Array;
  pitch: Uint8Array;
  /** 0 = left, 1 = right */
  hand: Uint8Array;
  finger: Uint8Array;
  measureStart: Float64Array;
  pedalTime: Float64Array;
  pedalOn: Uint8Array;
  duration: number;
  /** longest note, used for view culling */
  maxLen: number;
}

export function loadSong(file: SongFile): LoadedSong {
  const tempo = new TempoMap(file.tempos);
  const notes = [...file.notes].sort((x, y) => x.b - y.b || x.p - y.p);
  const n = notes.length;
  const start = new Float64Array(n);
  const end = new Float64Array(n);
  const pitch = new Uint8Array(n);
  const hand = new Uint8Array(n);
  const finger = new Uint8Array(n);
  let duration = 0;
  let maxLen = 0;
  for (let i = 0; i < n; i++) {
    const note = notes[i]!;
    start[i] = tempo.toSeconds(note.b);
    end[i] = tempo.toSeconds(note.b + note.d);
    pitch[i] = note.p;
    hand[i] = note.h === 'R' ? 1 : 0;
    finger[i] = note.f ?? 0;
    if (end[i]! > duration) duration = end[i]!;
    if (end[i]! - start[i]! > maxLen) maxLen = end[i]! - start[i]!;
  }
  const last = file.measures[file.measures.length - 1];
  if (last) duration = Math.max(duration, tempo.toSeconds(last.b + last.len));
  return {
    file,
    tempo,
    count: n,
    start,
    end,
    pitch,
    hand,
    finger,
    measureStart: Float64Array.from(file.measures, (m) => tempo.toSeconds(m.b)),
    pedalTime: Float64Array.from(file.pedal, (p) => tempo.toSeconds(p.b)),
    pedalOn: Uint8Array.from(file.pedal, (p) => (p.on ? 1 : 0)),
    duration,
    maxLen,
  };
}
