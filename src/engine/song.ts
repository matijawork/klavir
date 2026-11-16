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
  /** the first key's major/minor is not in the score: guessed from the notes (scripts/lib/key.ts) */
  keyGuessed?: true;
  sections: { b: number; name: string }[];
  /** where the finger numbers come from, for display; absent = see the notes' `fs` */
  fingeringSource?: { checked: boolean; text: string };
  /** true when hands came from a pitch split instead of staves/tracks */
  handsFromPitchSplit: boolean;
  warnings: string[];
}

/** Comparison of an imported score with MuseScore's MIDI export of it (scripts/lib/reference.ts). */
export interface ReferenceCheck {
  /** notes in the score */
  of: number;
  /** score notes found in the MIDI: same key, same moment */
  matched: number;
  /** score notes missing from the MIDI because the other hand plays the same key at that moment */
  twins: number;
  /** MIDI notes with no score note */
  extra: number;
  /** matched notes that the MIDI puts in the other hand */
  otherHand: number;
  /** pedal downs and ups in the score, and how many the MIDI has at the same beat */
  pedalOf: number;
  pedalMatched: number;
}

/** A web page something was checked against: what it says, quoted. */
export interface WebSource {
  site: string;
  url: string;
  /** the words on the page relied on */
  quote?: string;
  /** how Claude read it, when that took interpretation */
  note?: string;
}

/** What the import could check by itself and against named sources; the card's lists show it. */
export interface SongChecks {
  /** hands from the score's two staves (or named tracks), from track height, or a pitch split */
  hands: 'score' | 'height' | 'split' | 'one';
  /** tempo written in the score; set by Claude from web sources (the score has none); or 120 */
  tempo: 'score' | 'claude' | 'default';
  bpm: number;
  tempoSources?: (WebSource & { bpm: number })[];
  tempoNote?: string;
  /**
   * key: written in the score; as several named sources agree; chosen by Claude (sources
   * disagree); guessed from the notes; or none (no key signature, or a one-note test pattern)
   */
  key: 'score' | 'source' | 'claude' | 'guessed' | 'none';
  keySources?: (WebSource & { key: string })[];
  keyNote?: string;
  reference?: ReferenceCheck & { file: string; note?: string };
  /** chord charts on the web compared with the chords counted from the file (chord ids: "10m") */
  charts?: (WebSource & {
    listed: string[];
    same: string[];
    onlySource: string[];
    onlyFile: string[];
  })[];
  /** finger numbers copied from a named source for repeating figures, and how many notes */
  fingering?: WebSource & { patterns: string[]; notes: number; of: number };
  /** why there is no pedal, or why Claude added or did not add one */
  pedalNote?: string;
  /** a difference between the charts and the file that Claude checked, in words */
  chordsNote?: string;
  /** where finger numbers were looked for, when none were found */
  fingeringNote?: string;
}

/**
 * How one hand plays a chord in the song: one note after another, all at once, its root alone, or
 * the melody (mostly other notes); `tones` = the chord notes it plays, lowest first (pitch classes).
 */
export interface ChordUse {
  style: 'broken' | 'block' | 'single' | 'melody';
  tones: number[];
}

/** A chord the piece is built on: root pitch class, minor or major, measures it fills. */
export interface SongChord {
  root: number;
  minor: boolean;
  count: number;
  right?: ChordUse;
  left?: ChordUse;
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
  /** where the pedal marks come from; null = the song has none */
  pedal: Provenance | null;
  /** exercises worth knowing before this song, each with the reason */
  checks?: SongChecks;
  /** its chords, counted from the notes, most used first (scripts/lib/chords.ts) */
  chords?: SongChord[];
  /** the day Matija listened and said it sounds right */
  heard?: string;
  /** the key signature has flats: name black keys as flats (B♭, not A♯) */
  flats?: true;
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

/**
 * When each note stops sounding in playback: at its written end, or, when the score's sustain
 * pedal is already down at that moment, when the pedal comes up (as on a real piano). A note of
 * the same key struck again cuts the earlier one there.
 */
export function soundingEnds(song: LoadedSong): Float64Array {
  const { start, end, pitch, count, pedalTime, pedalOn } = song;
  const out = Float64Array.from(end);
  // pedal down-intervals [from, to)
  const from: number[] = [];
  const to: number[] = [];
  for (let k = 0; k < pedalTime.length; k++) {
    if (pedalOn[k]) {
      if (from.length === to.length) from.push(pedalTime[k]!);
    } else if (from.length > to.length) to.push(pedalTime[k]!);
  }
  if (from.length > to.length) to.push(Number.POSITIVE_INFINITY);
  let j = 0;
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => end[a]! - end[b]!);
  for (const i of order) {
    const e = end[i]!;
    while (j < to.length && to[j]! <= e) j++;
    // the pedal must already be down a moment before the key comes up; pressed exactly then, it
    // catches nothing (a pedal change on the next chord)
    if (j < from.length && from[j]! < e - 0.01) out[i] = Math.max(e, to[j]!);
  }
  const lastOf = new Int32Array(128).fill(-1);
  for (let i = 0; i < count; i++) {
    const prev = lastOf[pitch[i]!]!;
    if (prev >= 0 && out[prev]! > start[i]!) out[prev] = Math.max(end[prev]!, start[i]!);
    lastOf[pitch[i]!] = i;
  }
  for (let i = 0; i < count; i++) if (out[i] === Number.POSITIVE_INFINITY) out[i] = song.duration;
  return out;
}
