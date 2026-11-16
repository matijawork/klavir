/**
 * Major or minor, when the score only gives the key signature. A key signature fits two keys
 * (no sharps or flats = C major or A minor); the notes decide: their time-weighted pitch classes
 * are compared with the Krumhansl-Kessler key profiles of both candidates (Krumhansl 1990,
 * "Cognitive Foundations of Musical Pitch"). A guess, and shown as one.
 */
import type { SongNote } from '../../src/engine/song.ts';

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(x: number[], profile: number[], tonic: number): number {
  const y = x.map((_, i) => profile[(i - tonic + 12) % 12]!);
  const mx = x.reduce((a, b) => a + b, 0) / 12;
  const my = y.reduce((a, b) => a + b, 0) / 12;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < 12; i++) {
    num += (x[i]! - mx) * (y[i]! - my);
    dx += (x[i]! - mx) ** 2;
    dy += (y[i]! - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

/** Which of the two keys of a key signature (fifths: -7..7) the notes fit better. */
export function guessMode(notes: readonly SongNote[], fifths: number): 'major' | 'minor' {
  const weight = new Array<number>(12).fill(0);
  for (const n of notes) weight[n.p % 12]! += n.d;
  const majorTonic = (((fifths * 7) % 12) + 12) % 12;
  const minorTonic = (majorTonic + 9) % 12;
  return correlation(weight, MINOR, minorTonic) > correlation(weight, MAJOR, majorTonic)
    ? 'minor'
    : 'major';
}
