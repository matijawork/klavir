/**
 * Exercise generator: scales, chords, arpeggios and a five-finger warm-up in any key, built as a
 * normal SongFile so the player treats them like songs. Fingerings are the standard ones written
 * from memory (provenance "claude"); where the standard one is not certain the notes carry none.
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
  { kind: 'chords', title: 'Chord inversions', about: 'Major triad in all three positions' },
  { kind: 'cadence', title: 'Chord progression', about: 'I – IV – V – I' },
  { kind: 'arpeggio', title: 'Arpeggio', about: 'Broken major chord, two octaves' },
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

/** One hand's scale fingering: first note, then the seven degrees of every octave, then the top note. */
interface Fingering {
  first: number;
  octave: number[];
  top: number;
}
const F = (first: number, octave: number[], top: number): Fingering => ({ first, octave, top });
const RH_C = F(1, [1, 2, 3, 1, 2, 3, 4], 5);
const RH_F = F(1, [1, 2, 3, 4, 1, 2, 3], 4);
const LH_C = F(5, [1, 4, 3, 2, 1, 3, 2], 1);
const LH_B = F(4, [1, 3, 2, 1, 4, 3, 2], 1);
const LH_FLAT = F(3, [3, 2, 1, 4, 3, 2, 1], 3);

const MAJOR_RH: (Fingering | null)[] = [
  RH_C,
  F(2, [2, 3, 1, 2, 3, 4, 1], 2),
  RH_C,
  F(3, [3, 1, 2, 3, 4, 1, 2], 3),
  RH_C,
  RH_F,
  F(2, [2, 3, 4, 1, 2, 3, 1], 2),
  RH_C,
  F(3, [3, 4, 1, 2, 3, 1, 2], 3),
  RH_C,
  F(4, [4, 1, 2, 3, 1, 2, 3], 4),
  RH_C,
];
const MAJOR_LH: (Fingering | null)[] = [
  LH_C,
  LH_FLAT,
  LH_C,
  LH_FLAT,
  LH_C,
  LH_C,
  F(4, [4, 3, 2, 1, 3, 2, 1], 4),
  LH_C,
  LH_FLAT,
  LH_C,
  LH_FLAT,
  LH_B,
];
// minor: only the white-key tonics, whose fingering matches the major pattern; others: none
const MINOR_RH: (Fingering | null)[] = [
  RH_C,
  null,
  RH_C,
  null,
  RH_C,
  RH_F,
  null,
  RH_C,
  null,
  RH_C,
  null,
  RH_C,
];
const MINOR_LH: (Fingering | null)[] = [
  LH_C,
  null,
  LH_C,
  null,
  LH_C,
  LH_C,
  null,
  LH_C,
  null,
  LH_C,
  null,
  LH_B,
];

/** Root near middle C for the right hand: G3 .. F♯4. */
const rootFor = (pc: number): number => (pc <= 6 ? 60 + pc : 48 + pc);

function finger(n: SongNote, f: number | undefined): SongNote {
  if (f) {
    n.f = f;
    n.fs = 'claude';
  }
  return n;
}

/** Up and back down over a list of steps; the turning note is not repeated, the last note is long. */
function upDown<T>(up: T[]): T[] {
  return [...up, ...up.slice(0, -1).reverse()];
}

function scale(
  pc: number,
  steps: number[],
  rh: Fingering | null,
  lh: Fingering | null,
): SongNote[] {
  const octaves = 2;
  const seq: { semis: number; rf?: number; lf?: number }[] = [];
  for (let o = 0; o < octaves; o++)
    for (let d = 0; d < 7; d++)
      seq.push({
        semis: o * 12 + steps[d]!,
        rf: o === 0 && d === 0 ? rh?.first : rh?.octave[d],
        lf: o === 0 && d === 0 ? lh?.first : lh?.octave[d],
      });
  seq.push({ semis: octaves * 12, rf: rh?.top, lf: lh?.top });
  const root = rootFor(pc);
  const out: SongNote[] = [];
  const all = upDown(seq);
  all.forEach((s, k) => {
    const d = k === all.length - 1 ? 2 : 0.5;
    out.push(finger({ p: root - 12 + s.semis, b: k * 0.5, d, h: 'L' }, s.lf));
    out.push(finger({ p: root + s.semis, b: k * 0.5, d, h: 'R' }, s.rf));
  });
  return out;
}

function fiveFinger(pc: number): SongNote[] {
  const root = rootFor(pc);
  const steps = [0, 2, 4, 5, 7];
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

function inversions(pc: number): SongNote[] {
  const r = rootFor(pc);
  const shapes: [number[], number[], number[]][] = [
    [
      [0, 4, 7],
      [1, 3, 5],
      [5, 3, 1],
    ],
    [
      [4, 7, 12],
      [1, 2, 5],
      [5, 3, 1],
    ],
    [
      [7, 12, 16],
      [1, 3, 5],
      [5, 2, 1],
    ],
    [
      [12, 16, 19],
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

function cadence(pc: number): SongNote[] {
  const r = rootFor(pc);
  // right hand stays in one place: I root position, IV second inversion, V first inversion
  const steps: [number[], number[], number, number][] = [
    [[0, 4, 7], [1, 3, 5], 0, 5],
    [[0, 5, 9], [1, 3, 5], 5, 2],
    [[-1, 2, 7], [1, 2, 5], 7, 1],
    [[0, 4, 7], [1, 3, 5], 0, 5],
  ];
  const out: SongNote[] = [];
  [...steps, ...steps].forEach(([semis, rf, bass, lf], k) => {
    const d = k === 7 ? 4 : 2;
    out.push(finger({ p: r - 12 + bass, b: k * 2, d, h: 'L' }, lf));
    for (let i = 0; i < 3; i++) out.push(finger({ p: r + semis[i]!, b: k * 2, d, h: 'R' }, rf[i]));
  });
  return out;
}

function arpeggio(pc: number): SongNote[] {
  const r = rootFor(pc);
  // standard fingering is certain for white-key roots only
  const known = [0, 2, 4, 5, 7, 9].includes(pc);
  const lhMid = [0, 5, 7].includes(pc) ? 4 : 3;
  const seq: { semis: number; rf?: number; lf?: number }[] = [];
  for (let o = 0; o < 2; o++)
    [0, 4, 7].forEach((x, d) => {
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

export function buildExercise(kind: ExerciseKind, pcRaw: number): SongFile {
  const pc = ((Math.round(pcRaw) % 12) + 12) % 12;
  const minor = kind === 'scale-minor';
  const notes =
    kind === 'scale-major'
      ? scale(pc, MAJOR, MAJOR_RH[pc]!, MAJOR_LH[pc]!)
      : kind === 'scale-minor'
        ? scale(pc, HARMONIC_MINOR, MINOR_RH[pc]!, MINOR_LH[pc]!)
        : kind === 'chords'
          ? inversions(pc)
          : kind === 'cadence'
            ? cadence(pc)
            : kind === 'arpeggio'
              ? arpeggio(pc)
              : fiveFinger(pc);
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
    id: `exercise-${kind}-${pc}`,
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
