/**
 * The chords a piece is built on, read from its notes: one chord per measure (half measure in 4/4
 * when the harmony changes there), matched against the 24 major and minor triads. Only what the
 * notes show is reported; a measure that fits no triad well (a melody alone, a passing figure)
 * counts for nothing.
 */
import type { SongFile } from '../../src/engine/song.ts';

export interface ChordCount {
  /** pitch class of the root, 0 = C */
  root: number;
  minor: boolean;
  /** number of measures (or half measures) it fills */
  count: number;
}

/** Scale steps of a key and the triad quality on each (major key; natural minor). */
const DIATONIC = {
  major: [
    [0, false],
    [2, true],
    [4, true],
    [5, false],
    [7, false],
    [9, true],
  ],
  minor: [
    [0, true],
    [3, false],
    [5, true],
    [7, true],
    [8, false],
    [10, false],
  ],
} as const;

/**
 * Best triad for one measure, or null when the notes do not make one clearly. A triad needs root,
 * third and fifth (added notes such as a sixth or seventh are allowed, they count against it); an
 * open fifth (root and fifth, no third) takes the key's own chord on that root. Seventh chords are
 * not told apart on purpose: G-B-D-E is G with a sixth or E minor with a seventh, and the bass
 * decides (G).
 */
export function triadOf(
  weight: number[],
  bass: number | null,
  key: { tonic: number; minor: boolean },
): { root: number; minor: boolean } | null {
  const total = weight.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const has = (pc: number) => weight[pc % 12]! > 0;
  let best: { root: number; minor: boolean; inside: number } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const consider = (root: number, minor: boolean, tones: number[]) => {
    const pcs = tones.map((i) => (root + i) % 12);
    const inside = pcs.reduce((sum, pc) => sum + weight[pc]!, 0);
    let score = inside - (total - inside);
    if (bass === root) score += 0.25 * total;
    else if (bass !== null && !pcs.includes(bass)) score -= 0.25 * total;
    if (score > bestScore) {
      bestScore = score;
      best = { root, minor, inside };
    }
  };
  for (let root = 0; root < 12; root++) {
    if (!has(root)) continue;
    if (has(root + 7)) {
      if (has(root + 4)) consider(root, false, [0, 4, 7]);
      if (has(root + 3)) consider(root, true, [0, 3, 7]);
    }
    // open fifth: no third, no seventh; the key decides major or minor
    if (has(root + 7) && !has(root + 3) && !has(root + 4)) {
      const step = DIATONIC[key.minor ? 'minor' : 'major'].find(
        ([d]) => (key.tonic + d) % 12 === root,
      );
      if (step) consider(root, step[1], [0, 7]);
    }
  }
  // at least 60 % of the sound must belong to the chord (the rest: melody passing through)
  const found = best as { root: number; minor: boolean; inside: number } | null;
  return found && found.inside >= 0.6 * total ? { root: found.root, minor: found.minor } : null;
}

/** Chords of the piece, most used first; one in fewer than three measures is left out (passing). */
export function chordsOf(song: SongFile, key: { tonic: number; minor: boolean }): ChordCount[] {
  const counts = new Map<string, ChordCount>();
  for (const m of song.measures) {
    const a = m.b;
    const b = a + m.len;
    const weight = new Array<number>(12).fill(0);
    let bass: number | null = null;
    let low = 128;
    for (const n of song.notes) {
      if (n.b >= b) break;
      const overlap = Math.min(b, n.b + n.d) - Math.max(a, n.b);
      if (overlap <= 1e-6) continue;
      // the left hand carries the harmony; the right hand's melody counts less
      weight[n.p % 12]! += overlap * (n.h === 'L' ? 2 : 1);
      if (n.p < low) {
        low = n.p;
        bass = n.p % 12;
      }
    }
    if (low === 128) continue;
    const t = triadOf(weight, bass, key);
    if (!t) continue;
    const id = `${t.root}${t.minor ? 'm' : ''}`;
    const c = counts.get(id) ?? { ...t, count: 0 };
    c.count++;
    counts.set(id, c);
  }
  return [...counts.values()].filter((c) => c.count >= 3).sort((x, y) => y.count - x.count);
}
