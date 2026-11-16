/** Names of keys and chords, and reading them from text ("Gbmaj7", "A♭ major"). */

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const shiftOf = (acc: string | undefined): number =>
  acc === 'b' || acc === '♭' ? -1 : acc === '#' || acc === '♯' ? 1 : 0;

/** "Gbmaj7", "B♭m", "F#", "Bbm7" → the triad it is built on (sevenths and added notes dropped). */
export function parseChord(name: string): { root: number; minor: boolean } | null {
  const m = /^([A-G])([b♭#♯]?)(m(?!aj))?/.exec(name.trim());
  if (!m) return null;
  return { root: (LETTER[m[1]!]! + shiftOf(m[2]) + 12) % 12, minor: !!m[3] };
}

/** "A♭ major", "Bb minor" → tonic pitch class and mode. */
export function parseKey(name: string): { tonic: number; minor: boolean } | null {
  const m = /^([A-G])([b♭#♯]?)\s+(major|minor)$/i.exec(name.trim());
  if (!m) return null;
  return {
    tonic: (LETTER[m[1]!.toUpperCase()]! + shiftOf(m[2]) + 12) % 12,
    minor: m[3]!.toLowerCase() === 'minor',
  };
}

/** Does a key fit a key signature (fifths -7..7)? */
export function keyFitsSignature(key: { tonic: number; minor: boolean }, fifths: number): boolean {
  const major = (((fifths * 7) % 12) + 12) % 12;
  return key.tonic === (key.minor ? (major + 9) % 12 : major);
}

/** "10m" = B♭ minor, "3" = E♭ major: how chords are stored in the library index. */
export const chordId = (c: { root: number; minor: boolean }): string =>
  `${c.root}${c.minor ? 'm' : ''}`;
export const fromChordId = (id: string): { root: number; minor: boolean } => ({
  root: Number.parseInt(id, 10),
  minor: id.endsWith('m'),
});

/** "B♭ minor", "F♯ major"; `flats` for pieces in flat keys. */
export const chordName = (c: { root: number; minor: boolean }, flats: boolean): string =>
  `${(flats ? FLAT : SHARP)[c.root]} ${c.minor ? 'minor' : 'major'}`;

/** Chart spelling made readable: "Gbmaj7" → "G♭maj7". */
export const prettyChord = (s: string): string =>
  s.replace(/^([A-G])b/, '$1♭').replace(/^([A-G])#/, '$1♯');
