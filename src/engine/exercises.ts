/**
 * Exercise generator: scales, chords, arpeggios and a five-finger warm-up in any key, built as a
 * normal SongFile so the player treats them like songs.
 * Scale fingerings are the ones printed on pianoscales.org (major.html, minor-harmonic.html, read
 * 2026-11-12), provenance "verified"; the page gives one octave for minors, the second octave
 * repeats the pattern. Chords, arpeggios and the warm-up use the common textbook fingering
 * (provenance "claude"); arpeggios on black-key roots carry none.
 */
import type { SongFile, SongNote } from './song.ts';

export type ExerciseKind =
  | 'five-finger'
  | 'scale-major'
  | 'scale-minor'
  | 'chords'
  | 'cadence'
  | 'arpeggio';

export const EXERCISES: { kind: ExerciseKind; title: string; about: string }[] = [
  { kind: 'five-finger', title: 'Five-finger warm-up', about: 'First five notes, up and down' },
  { kind: 'scale-major', title: 'Major scale', about: 'Two octaves, both hands' },
  { kind: 'scale-minor', title: 'Minor scale', about: 'Harmonic minor, two octaves' },
  { kind: 'chords', title: 'Chord inversions', about: 'The triad in all three positions' },
  { kind: 'cadence', title: 'Chord progression', about: 'I – IV – V – I (minor: i – iv – V – i)' },
  { kind: 'arpeggio', title: 'Arpeggio', about: 'Broken chord, two octaves' },
];

const MAJOR_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MINOR_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

export const keyName = (pc: number, minor = false): string =>
  (minor ? MINOR_NAMES : MAJOR_NAMES)[((pc % 12) + 12) % 12]!;

/** Pitch class of the tonic for a key signature. */
export const tonicOf = (fifths: number, minor: boolean): number =>
  (((fifths * 7 + (minor ? 9 : 0)) % 12) + 12) % 12;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

/**
 * One hand's scale fingering: the seven degrees of every octave and the top note; `start` replaces
 * the first fingers of the very first octave where the printed fingering begins differently.
 */
interface Fingering {
  start: number[];
  octave: number[];
  top: number;
}
const F = (start: number[], octave: number[], top: number): Fingering => ({ start, octave, top });
const RH_C = F([], [1, 2, 3, 1, 2, 3, 4], 5);
const RH_F = F([], [1, 2, 3, 4, 1, 2, 3], 4);
const RH_BB = F([2], [4, 1, 2, 3, 1, 2, 3], 4);
const RH_EB = F([], [3, 1, 2, 3, 4, 1, 2], 3);
const RH_AB = F([], [3, 4, 1, 2, 3, 1, 2], 3);
const LH_C = F([5], [1, 4, 3, 2, 1, 3, 2], 1);
const LH_B = F([4], [1, 3, 2, 1, 4, 3, 2], 1);
const LH_FLAT = F([], [3, 2, 1, 4, 3, 2, 1], 3);
const LH_FS = F([], [4, 3, 2, 1, 3, 2, 1], 4);

// index = pitch class of the tonic, C .. B
const MAJOR_RH: Fingering[] = [
  RH_C,
  F([], [2, 3, 1, 2, 3, 4, 1], 2),
  RH_C,
  RH_EB,
  RH_C,
  RH_F,
  F([], [2, 3, 4, 1, 2, 3, 1], 2),
  RH_C,
  RH_AB,
  RH_C,
  RH_BB,
  RH_C,
];
const MAJOR_LH: Fingering[] = [
  LH_C,
  LH_FLAT,
  LH_C,
  LH_FLAT,
  LH_C,
  LH_C,
  LH_FS,
  LH_C,
  LH_FLAT,
  LH_C,
  LH_FLAT,
  LH_B,
];
/** F sharp and G sharp minor: printed 2 3 1 2 3 1 2 3, so later octaves start 3 4. */
const RH_SHARP_MINOR = F([2, 3], [3, 4, 1, 2, 3, 1, 2], 3);
const MINOR_RH: Fingering[] = [
  RH_C,
  RH_AB,
  RH_C,
  RH_EB,
  RH_C,
  RH_F,
  RH_SHARP_MINOR,
  RH_C,
  RH_SHARP_MINOR,
  RH_C,
  RH_BB,
  RH_C,
];
const MINOR_LH: Fingering[] = [
  LH_C,
  LH_FLAT,
  LH_C,
  F([], [2, 1, 4, 3, 2, 1, 3], 2),
  LH_C,
  LH_C,
  LH_FS,
  LH_C,
  LH_FLAT,
  LH_C,
  F([], [2, 1, 3, 2, 1, 4, 3], 2),
  LH_B,
];

/** Root near middle C for the right hand: G3 .. F♯4. */
const rootFor = (pc: number): number => (pc <= 6 ? 60 + pc : 48 + pc);

function finger(
  n: SongNote,
  f: number | undefined,
  source: 'claude' | 'verified' = 'claude',
): SongNote {
  if (f) {
    n.f = f;
    n.fs = source;
  }
  return n;
}

/** Up and back down over a list of steps; the turning note is not repeated, the last note is long. */
function upDown<T>(up: T[]): T[] {
  return [...up, ...up.slice(0, -1).reverse()];
}

function scale(pc: number, steps: number[], rh: Fingering, lh: Fingering): SongNote[] {
  const octaves = 2;
  const seq: { semis: number; rf?: number; lf?: number }[] = [];
  for (let o = 0; o < octaves; o++)
    for (let d = 0; d < 7; d++)
      seq.push({
        semis: o * 12 + steps[d]!,
        rf: (o === 0 ? rh.start[d] : undefined) ?? rh.octave[d],
        lf: (o === 0 ? lh.start[d] : undefined) ?? lh.octave[d],
      });
  seq.push({ semis: octaves * 12, rf: rh.top, lf: lh.top });
  const root = rootFor(pc);
  const out: SongNote[] = [];
  const all = upDown(seq);
  all.forEach((s, k) => {
    const d = k === all.length - 1 ? 2 : 0.5;
    out.push(finger({ p: root - 12 + s.semis, b: k * 0.5, d, h: 'L' }, s.lf, 'verified'));
    out.push(finger({ p: root + s.semis, b: k * 0.5, d, h: 'R' }, s.rf, 'verified'));
  });
  return out;
}

function fiveFinger(pc: number, minor: boolean): SongNote[] {
  const root = rootFor(pc);
  const steps = [0, 2, minor ? 3 : 4, 5, 7];
  const idx = [...upDown([0, 1, 2, 3, 4]), ...upDown([0, 1, 2, 3, 4]).slice(1)];
  const out: SongNote[] = [];
  idx.forEach((i, k) => {
    const d = k === idx.length - 1 ? 2 : 0.5;
    out.push(finger({ p: root - 12 + steps[i]!, b: k * 0.5, d, h: 'L' }, 5 - i));
    out.push(finger({ p: root + steps[i]!, b: k * 0.5, d, h: 'R' }, i + 1));
  });
  return out;
}

/** Block chord in both hands (left an octave lower). */
function chord(
  out: SongNote[],
  b: number,
  d: number,
  pitches: number[],
  rf: number[],
  lf: number[],
) {
  pitches.forEach((p, i) => {
    out.push(finger({ p: p - 12, b, d, h: 'L' }, lf[i]));
    out.push(finger({ p, b, d, h: 'R' }, rf[i]));
  });
}

function inversions(pc: number, minor: boolean): SongNote[] {
  const r = rootFor(pc);
  const t = minor ? 3 : 4;
  const shapes: [number[], number[], number[]][] = [
    [
      [0, t, 7],
      [1, 3, 5],
      [5, 3, 1],
    ],
    [
      [t, 7, 12],
      [1, 2, 5],
      [5, 3, 1],
    ],
    [
      [7, 12, 12 + t],
      [1, 3, 5],
      [5, 2, 1],
    ],
    [
      [12, 12 + t, 19],
      [1, 3, 5],
      [5, 3, 1],
    ],
  ];
  const out: SongNote[] = [];
  upDown(shapes).forEach(([semis, rf, lf], k) => {
    chord(
      out,
      k * 2,
      2,
      semis.map((x) => r + x),
      rf,
      lf,
    );
  });
  return out;
}

function cadence(pc: number, minor: boolean): SongNote[] {
  const r = rootFor(pc);
  const t = minor ? 3 : 4;
  const six = minor ? 8 : 9;
  // right hand stays in one place: I root position, IV second inversion, V first inversion
  const steps: [number[], number[], number, number][] = [
    [[0, t, 7], [1, 3, 5], 0, 5],
    [[0, 5, six], [1, 3, 5], 5, 2],
    [[-1, 2, 7], [1, 2, 5], 7, 1],
    [[0, t, 7], [1, 3, 5], 0, 5],
  ];
  const out: SongNote[] = [];
  [...steps, ...steps].forEach(([semis, rf, bass, lf], k) => {
    const d = k === 7 ? 4 : 2;
    out.push(finger({ p: r - 12 + bass, b: k * 2, d, h: 'L' }, lf));
    for (let i = 0; i < 3; i++) out.push(finger({ p: r + semis[i]!, b: k * 2, d, h: 'R' }, rf[i]));
  });
  return out;
}

function arpeggio(pc: number, minor: boolean): SongNote[] {
  const r = rootFor(pc);
  const t = minor ? 3 : 4;
  // Right hand 1 2 3 is the general fingering on pianoscales.org; kept to white-key roots.
  // Left hand: 3 on the third for D, A and E major (black third), otherwise 4.
  const known = [0, 2, 4, 5, 7, 9].includes(pc);
  const lhMid = !minor && [2, 4, 9].includes(pc) ? 3 : 4;
  const seq: { semis: number; rf?: number; lf?: number }[] = [];
  for (let o = 0; o < 2; o++)
    [0, t, 7].forEach((x, d) => {
      seq.push({
        semis: o * 12 + x,
        rf: known ? d + 1 : undefined,
        lf: known ? (d === 0 ? (o === 0 ? 5 : 1) : d === 1 ? lhMid : 2) : undefined,
      });
    });
  seq.push({ semis: 24, rf: known ? 5 : undefined, lf: known ? 1 : undefined });
  const out: SongNote[] = [];
  const all = upDown(seq);
  all.forEach((s, k) => {
    const d = k === all.length - 1 ? 2 : 0.5;
    out.push(finger({ p: r - 12 + s.semis, b: k * 0.5, d, h: 'L' }, s.lf));
    out.push(finger({ p: r + s.semis, b: k * 0.5, d, h: 'R' }, s.rf));
  });
  return out;
}

export function buildExercise(kind: ExerciseKind, pcRaw: number, minorMode = false): SongFile {
  const pc = ((Math.round(pcRaw) % 12) + 12) % 12;
  const minor = kind === 'scale-minor' || (minorMode && kind !== 'scale-major');
  const notes =
    kind === 'scale-major'
      ? scale(pc, MAJOR, MAJOR_RH[pc]!, MAJOR_LH[pc]!)
      : kind === 'scale-minor'
        ? scale(pc, HARMONIC_MINOR, MINOR_RH[pc]!, MINOR_LH[pc]!)
        : kind === 'chords'
          ? inversions(pc, minor)
          : kind === 'cadence'
            ? cadence(pc, minor)
            : kind === 'arpeggio'
              ? arpeggio(pc, minor)
              : fiveFinger(pc, minor);
  notes.sort((x, y) => x.b - y.b || x.p - y.p);
  const total = Math.max(...notes.map((n) => n.b + n.d));
  const measures = Array.from({ length: Math.ceil(total / 4 - 1e-9) }, (_, i) => ({
    b: i * 4,
    len: 4,
    num: 4,
    den: 4,
    n: String(i + 1),
  }));
  const info = EXERCISES.find((e) => e.kind === kind)!;
  return {
    format: 1,
    id: `exercise-${kind}-${pc}${minor && kind !== 'scale-minor' ? 'm' : ''}`,
    version: 'original',
    title: `${keyName(pc, minor)} ${minor ? 'minor' : 'major'}: ${info.title.toLowerCase()}`,
    composer: info.about,
    tempos: [{ b: 0, bpm: 72 }],
    measures,
    notes,
    pedal: [],
    pedalSource: null,
    keys: [
      { b: 0, fifths: MAJOR_FIFTHS[minor ? (pc + 3) % 12 : pc]!, mode: minor ? 'minor' : 'major' },
    ],
    sections: [],
    handsFromPitchSplit: false,
    warnings: [],
  };
}
