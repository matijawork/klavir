/**
 * What to practise before a song: the scale and chord progression of its key, then an arpeggio
 * and the inversions of every chord the song is built on (counted from its notes), each a link
 * to that exercise.
 */
import { keyName } from './exercises.ts';
import { chordName, fromChordId, parseKey, prettyChord } from './harmony.ts';
import type { LibraryEntry } from './song.ts';

export interface LearnLink {
  label: string;
  href: string;
}
export interface LearnGroup {
  /** "A minor" */
  title: string;
  /** where it comes from, in words */
  detail: string;
  links: LearnLink[];
}

const exercise = (kind: string, pc: number, minor: boolean): string =>
  kind === 'scale'
    ? `#/exercise/${minor ? 'scale-minor' : 'scale-major'}/${pc}`
    : `#/exercise/${kind}/${pc}${minor ? '/minor' : ''}`;

/** "G♭ major" in a flat key; when the exercise names it otherwise, both: "G♭ / F♯ major". */
function title(root: number, minor: boolean, flats: boolean): string {
  const name = chordName({ root, minor }, flats);
  const own = keyName(root, minor);
  return name.startsWith(`${own} `) ? name : name.replace(' ', ` / ${own} `);
}

export function learnList(s: LibraryEntry): { groups: LearnGroup[]; chart: string | null } {
  const key = parseKey(s.key);
  const flats = s.flats === true;
  const groups: LearnGroup[] = [];
  const c = s.checks;
  if (key) {
    const from =
      c?.key === 'source' && c.keySource
        ? `The key, as ${c.keySource.site} gives it.`
        : c?.key === 'guessed'
          ? 'The key, guessed from the notes (the file has only the key signature).'
          : 'The key, written in the score.';
    groups.push({
      title: title(key.tonic, key.minor, flats),
      detail: from,
      links: [
        { label: 'Scale', href: exercise('scale', key.tonic, key.minor) },
        { label: 'Five-finger', href: exercise('five-finger', key.tonic, key.minor) },
        { label: 'Chord progression', href: exercise('cadence', key.tonic, key.minor) },
      ],
    });
  }
  for (const ch of s.chords ?? [])
    groups.push({
      title: title(ch.root, ch.minor, flats),
      detail: `Chord in ${ch.count} measure${ch.count === 1 ? '' : 's'}.`,
      links: [
        { label: 'Arpeggio', href: exercise('arpeggio', ch.root, ch.minor) },
        { label: 'Inversions', href: exercise('chords', ch.root, ch.minor) },
      ],
    });
  let chart: string | null = null;
  const cc = c?.chords;
  if (cc) {
    const names = (ids: string[]) => ids.map((id) => chordName(fromChordId(id), flats)).join(', ');
    chart =
      cc.onlySource.length === 0 && cc.onlyFile.length === 0
        ? `Same chords as the chart on ${cc.site}: ${cc.listed.map(prettyChord).join(', ')}.`
        : `The chart on ${cc.site} lists ${cc.listed.map(prettyChord).join(', ')}.` +
          (cc.onlySource.length ? ` Not a full chord in your file: ${names(cc.onlySource)}.` : '') +
          (cc.onlyFile.length ? ` Only in your file: ${names(cc.onlyFile)}.` : '');
    if (cc.note) chart += ` ${cc.note}`;
  }
  return { groups, chart };
}
