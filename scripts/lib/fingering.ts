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
