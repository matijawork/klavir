/**
 * Automatic fingering for scores that have none. A Viterbi search over onset slices per hand with a
 * simple ergonomic cost (comfortable spans, thumb passing, thumb on black keys). The result is a
 * suggestion and is stored with provenance 'claude'; fingering from the source score always wins.
 */
import type { SongNote } from '../../src/engine/song.ts';

const BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
const isBlack = (p: number): boolean => BLACK[((p % 12) + 12) % 12] === 1;

/** Largest comfortable span in semitones between a lower finger (row) and a higher finger (column). */
const MAX_SPAN: number[][] = [
  [],
  [0, 0, 5, 7, 9, 10],
  [0, 0, 0, 3, 5, 7],
  [0, 0, 0, 0, 2, 4],
  [0, 0, 0, 0, 0, 2],
];

/**
 * Cost of playing pitch `p1` with finger `a`, then `p2` with finger `b`.
 * `dir` is +1 for the right hand and -1 for the left (mirrors the keyboard).
 */
export function stepCost(a: number, p1: number, b: number, p2: number, dir: number): number {
  let d = (p2 - p1) * dir;
  if (a === b) return d === 0 ? 0 : 3 + Math.abs(d);
  let lo = a;
  let hi = b;
  if (a > b) {
    lo = b;
    hi = a;
    d = -d;
  }
  // now: from finger `lo` to the higher finger `hi`, d > 0 means the natural direction
  if (d > 0) {
    const max = MAX_SPAN[lo]![hi]!;
    if (d > max) return 2 + 2 * (d - max);
    // the thumb reaches a little further than the other fingers without strain
    return Math.max(0, Math.abs(d - 2 * (hi - lo)) - (lo === 1 ? 1 : 0)) * 0.25;
  }
  if (d === 0) return 2; // finger substitution on a repeated key
  // crossing: only around the thumb, and not with the little finger
  if (lo !== 1 || hi === 5) return 8 + Math.abs(d);
  const thumbPitch = a === 1 ? p1 : p2;
  return 1.5 + Math.max(0, -d - 2) + (isBlack(thumbPitch) ? 3 : 0);
}

/**
 * Widest span in semitones a lower finger (row) and a higher finger (column) can hold at once:
 * an octave is 1-5 or 1-4, never 1-3 or 2-5 (chosen by Claude, not from a source).
 */
const HOLD_SPAN: number[][] = [
  [],
  [0, 0, 8, 10, 12, 13],
  [0, 0, 0, 4, 6, 9],
  [0, 0, 0, 0, 3, 5],
  [0, 0, 0, 0, 0, 3],
];

const noteCost = (finger: number, pitch: number): number =>
  (isBlack(pitch) ? (finger === 1 ? 1.5 : finger === 5 ? 0.6 : 0) : 0) + (finger === 4 ? 0.15 : 0);

/** All strictly ascending choices of k fingers out of 1..5. */
function combos(k: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, cur: number[]): void => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let f = start; f <= 5; f++) walk(f + 1, [...cur, f]);
  };
  walk(1, []);
  return out;
}

interface Slice {
  /** notes ordered thumb side → little-finger side */
  notes: SongNote[];
  b: number;
}

function fingerHand(notes: SongNote[], dir: number): void {
  const sorted = [...notes].sort((x, y) => x.b - y.b || (x.p - y.p) * dir);
  const slices: Slice[] = [];
  for (const n of sorted) {
    const last = slices[slices.length - 1];
    if (last && Math.abs(last.b - n.b) < 1e-4) last.notes.push(n);
    else slices.push({ notes: [n], b: n.b });
  }
  // chords larger than one hand are left without fingering
  const usable = slices.filter((s) => s.notes.length <= 5);
  if (usable.length === 0) return;

  const states = usable.map((s) => combos(s.notes.length));
  const own = usable.map((s, i) =>
    states[i]!.map((fs) => {
      let c = 0;
      for (let k = 0; k < fs.length; k++) {
        c += noteCost(fs[k]!, s.notes[k]!.p);
        if (k > 0) c += stepCost(fs[k - 1]!, s.notes[k - 1]!.p, fs[k]!, s.notes[k]!.p, dir);
        // keys struck together must fit under the hand
        for (let j = 0; j < k; j++)
          if (Math.abs(s.notes[k]!.p - s.notes[j]!.p) > HOLD_SPAN[fs[j]!]![fs[k]!]!) c += 40;
      }
      return c;
    }),
  );

  let prev = own[0]!;
  const back: Int16Array[] = [new Int16Array(prev.length)];
  for (let i = 1; i < usable.length; i++) {
    const A = usable[i - 1]!;
    const B = usable[i]!;
    const aEnd = Math.max(...A.notes.map((n) => n.b + n.d));
    // a rest gives the hand time to move, so the transition matters less
    const ease = B.b - aEnd > 0.75 ? 0.35 : 1;
    const cur: number[] = [];
    const bk = new Int16Array(states[i]!.length);
    for (let j = 0; j < states[i]!.length; j++) {
      const fb = states[i]![j]!;
      let best = Number.POSITIVE_INFINITY;
      let bestK = 0;
      for (let k = 0; k < states[i - 1]!.length; k++) {
        const fa = states[i - 1]![k]!;
        const la = fa.length - 1;
        const lb = fb.length - 1;
        let c =
          (stepCost(fa[0]!, A.notes[0]!.p, fb[0]!, B.notes[0]!.p, dir) +
            stepCost(fa[la]!, A.notes[la]!.p, fb[lb]!, B.notes[lb]!.p, dir)) /
          2;
        c *= ease;
        // a finger still holding a key cannot play another one
        for (let x = 0; x < fa.length; x++) {
          const held = A.notes[x]!;
          if (held.b + held.d <= B.b + 1e-4) continue;
          for (let y = 0; y < fb.length; y++)
            if (fb[y] === fa[x] && B.notes[y]!.p !== held.p) c += 12;
        }
        c += prev[k]!;
        if (c < best) {
          best = c;
          bestK = k;
        }
      }
      cur.push(best + own[i]![j]!);
      bk[j] = bestK;
    }
    prev = cur;
    back.push(bk);
  }

  let j = prev.indexOf(Math.min(...prev));
  for (let i = usable.length - 1; i >= 0; i--) {
    const fs = states[i]![j]!;
    usable[i]!.notes.forEach((n, k) => {
      n.f = fs[k]!;
      n.fs = 'claude';
    });
    j = back[i]![j]!;
  }
}

/** Adds suggested fingering to every non-grace note, in place. */
export function autoFinger(notes: SongNote[]): void {
  fingerHand(
    notes.filter((n) => n.h === 'R' && !n.g),
    1,
  );
  fingerHand(
    notes.filter((n) => n.h === 'L' && !n.g),
    -1,
  );
}

/** Suggested pedalling: one change per measure (release on the barline, press just after). */
export function measurePedal(
  measures: { b: number; len: number }[],
  notes: SongNote[],
): { b: number; on: boolean }[] {
  const out: { b: number; on: boolean }[] = [];
  let down = false;
  for (const m of measures) {
    const hasNotes = notes.some((n) => n.b >= m.b - 1e-6 && n.b < m.b + m.len - 1e-6);
    if (down) out.push({ b: m.b, on: false });
    down = hasNotes;
    if (hasNotes) out.push({ b: m.b + Math.min(0.25, m.len / 8), on: true });
  }
  const last = measures[measures.length - 1];
  if (down && last) out.push({ b: last.b + last.len, on: false });
  return out;
}

/**
 * Copies finger numbers from a named source onto a repeating figure, e.g. Clocks' right hand
 * E♭–B♭–G played 5-2-1: every run of single notes of `hand` that walks the figure's pitch classes
 * in order, at least once round, gets the source's fingers (marked `verified`). Returns how many
 * notes it covered.
 */
export function applyFingerPattern(
  notes: SongNote[],
  hand: 'L' | 'R',
  pcs: number[],
  fingers: number[],
): number {
  const own = notes.filter((n) => n.h === hand && !n.g).sort((a, b) => a.b - b.b || a.p - b.p);
  // single notes only: a chord breaks the figure
  const single = own.filter(
    (n, i) =>
      !(i > 0 && Math.abs(own[i - 1]!.b - n.b) < 1e-6) &&
      !(i + 1 < own.length && Math.abs(own[i + 1]!.b - n.b) < 1e-6),
  );
  const L = pcs.length;
  let covered = 0;
  let i = 0;
  while (i < single.length) {
    const k0 = pcs.indexOf(single[i]!.p % 12);
    if (k0 < 0) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < single.length && single[j]!.p % 12 === pcs[(k0 + (j - i)) % L]) j++;
    if (j - i >= L) {
      for (let x = i; x < j; x++) {
        single[x]!.f = fingers[(k0 + (x - i)) % L]!;
        single[x]!.fs = 'verified';
      }
      covered += j - i;
      i = j;
    } else i++;
  }
  return covered;
}

/**
 * Suggested pedalling, one change on every beat (release on the beat, press just after): for music
 * whose melody moves by step within a measure, so neighbouring notes do not ring together.
 */
export function beatPedal(
  measures: { b: number; len: number; num: number; den: number }[],
  notes: SongNote[],
): { b: number; on: boolean }[] {
  const out: { b: number; on: boolean }[] = [];
  let down = false;
  for (const m of measures) {
    const hasNotes = notes.some((n) => n.b >= m.b - 1e-6 && n.b < m.b + m.len - 1e-6);
    const compound = m.den === 8 && m.num % 3 === 0 && m.num > 3;
    const beat = compound ? 1.5 : 4 / m.den;
    for (let x = m.b; x < m.b + m.len - 1e-6; x += beat) {
      if (down) out.push({ b: x, on: false });
      down = hasNotes;
      if (hasNotes) out.push({ b: x + Math.min(0.125, beat / 8), on: true });
    }
  }
  const last = measures[measures.length - 1];
  if (down && last) out.push({ b: last.b + last.len, on: false });
  return out;
}

/** Chord-inversion fingering as pianoguidelessons.com (?p=4136) gives it, low note first. */
const TRIAD_FINGERS: Record<'R' | 'L', number[][]> = {
  // root position, first inversion, second inversion
  R: [
    [1, 3, 5],
    [1, 2, 5],
    [1, 3, 5],
  ],
  L: [
    [5, 3, 1],
    [5, 3, 1],
    [5, 2, 1],
  ],
};

/**
 * Every close major or minor triad one hand plays all at once gets the source's inversion
 * fingering (marked `verified`). Returns how many notes it covered.
 */
export function applyTriadFingering(notes: SongNote[]): number {
  let covered = 0;
  for (const hand of ['R', 'L'] as const) {
    const own = notes.filter((n) => n.h === hand && !n.g).sort((a, b) => a.b - b.b || a.p - b.p);
    for (let i = 0; i < own.length; ) {
      let j = i + 1;
      while (j < own.length && Math.abs(own[j]!.b - own[i]!.b) < 1e-6) j++;
      const group = own.slice(i, j);
      i = j;
      if (group.length !== 3) continue;
      const [a, b, c] = group.map((n) => n.p) as [number, number, number];
      if (c - a > 9) continue; // close position only
      const shape = `${b - a},${c - a}`;
      // root position 4,7 / 3,7; first inversion 3,8 / 4,9; second inversion 5,9 / 5,8
      const inv = ['4,7', '3,7'].includes(shape)
        ? 0
        : ['3,8', '4,9'].includes(shape)
          ? 1
          : ['5,9', '5,8'].includes(shape)
            ? 2
            : -1;
      if (inv < 0) continue;
      const fingers = TRIAD_FINGERS[hand][inv]!;
      group.forEach((n, k) => {
        n.f = fingers[k]!;
        n.fs = 'verified';
      });
      covered += 3;
    }
  }
  return covered;
}

/**
 * Claude's own fingering for a figure that keeps one hand in place: in every measure where that
 * hand plays only the given notes (at least four of them), one at a time, each note gets its
 * finger. A measure with two notes at once (octaves) is another figure: one finger cannot play
 * both, so it keeps the suggested fingering. Not from a source: stays marked `claude`. Returns how
 * many notes it covered.
 */
export function applyFingerMap(
  notes: SongNote[],
  measures: { b: number; len: number }[],
  hand: 'L' | 'R',
  map: Map<number, number>,
): number {
  let covered = 0;
  for (const m of measures) {
    const own = notes.filter(
      (n) => n.h === hand && !n.g && n.b >= m.b - 1e-6 && n.b < m.b + m.len - 1e-6,
    );
    if (own.length < 4 || !own.every((n) => map.has(n.p % 12))) continue;
    const together = own.some((n, k) => own.some((x, j) => j !== k && Math.abs(x.b - n.b) < 1e-6));
    if (together) continue;
    for (const n of own) {
      n.f = map.get(n.p % 12)!;
      n.fs = 'claude';
    }
    covered += own.length;
  }
  return covered;
}
