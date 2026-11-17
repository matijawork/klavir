/**
 * What to practise for a song: the scale of its key, then every chord it is built on (counted
 * from its notes), each with how the song plays it (which hand, one note after another or all at
 * once, which position) and a link to the exercise that trains exactly that.
 */
import { keyName } from './exercises.ts';
import { chordName, parseKey } from './harmony.ts';
import type { ChordUse, LibraryEntry, SongChord } from './song.ts';

export interface LearnLink {
  label: string;
  href: string;
  /** the one that trains what the song does */
  main?: boolean;
}
export interface LearnGroup {
  /** "A minor" */
  title: string;
  /** what it is and how the song uses it, in words */
  detail: string;
  links: LearnLink[];
}

const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const POSITION = ['root position', 'first inversion', 'second inversion'];

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

/** "one note after another, first inversion (low to high: G–B♭–E♭)", "all at once: E and B (no third)" */
function how(ch: SongChord, use: ChordUse, hand: 'L' | 'R', flats: boolean): string {
  const names = flats ? FLAT : SHARP;
  if (use.style === 'melody') return 'the melody';
  if (use.style === 'single')
    return hand === 'L' ? `the bass note ${names[use.tones[0]!]}` : `only ${names[use.tones[0]!]}`;
  const way = use.style === 'broken' ? 'one note after another' : 'all at once';
  const third = (ch.root + (ch.minor ? 3 : 4)) % 12;
  if (use.tones.length >= 3) {
    const pos = use.tones[0] === ch.root ? 0 : use.tones[0] === third ? 1 : 2;
    return `${way}, ${POSITION[pos]} (low to high: ${use.tones.map((pc) => names[pc]).join('–')})`;
  }
  const played = use.tones.map((pc) => names[pc]).join(' and ');
  return `${way}: ${played}${use.tones.includes(third) ? '' : ' (no third)'}`;
}

/**
 * What the Scale exercise is next to the song. A minor key's Scale is the harmonic minor (the only
 * minor scale with checked fingering): its 7th note is raised. A song whose chord on the 5th note
 * is minor plays the plain 7th instead (Interstellar: E minor, so G, never G♯), and says so.
 */
function scaleWords(tonic: number, minor: boolean, chords: SongChord[], flats: boolean): string {
  if (!minor) return 'Its scale has the notes the song is built on.';
  const names = flats ? FLAT : SHARP;
  const five = (tonic + 7) % 12;
  const raised = names[(tonic + 11) % 12];
  const has = (m: boolean) => chords.some((c) => c.root === five && c.minor === m);
  if (has(true) && !has(false))
    return `Scale is the harmonic minor scale, which raises the 7th note to ${raised}; this song plays ${names[(tonic + 10) % 12]} instead (its ${names[five]} chord is minor).`;
  if (has(false))
    return `Scale is the harmonic minor scale: its 7th note is raised (${raised}), as in this song's ${names[five]} major chord.`;
  return `Scale is the harmonic minor scale: its 7th note is raised (${raised}).`;
}

export function learnList(s: LibraryEntry): LearnGroup[] {
  const c = s.checks;
  if (c?.key === 'none') return [];
  const key = parseKey(s.key);
  const flats = s.flats === true;
  const groups: LearnGroup[] = [];
  if (key) {
    const agree = (c?.keySources ?? [])
      .filter((k) => k.key === s.key)
      .map((k) => k.site)
      .join(', ');
    const from =
      c?.key === 'source'
        ? `checked by Claude on ${agree}`
        : c?.key === 'claude'
          ? 'chosen by Claude, the pages disagree (see what is checked)'
          : c?.key === 'guessed'
            ? 'guessed by the app from the notes'
            : 'written in the score';
    groups.push({
      title: title(key.tonic, key.minor, flats),
      detail: `The key of the song: ${from}. ${scaleWords(key.tonic, key.minor, s.chords ?? [], flats)}`,
      links: [
        { label: 'Scale', href: exercise('scale', key.tonic, key.minor), main: true },
        { label: 'Five-finger', href: exercise('five-finger', key.tonic, key.minor) },
        { label: 'Chord progression', href: exercise('cadence', key.tonic, key.minor) },
      ],
    });
  }
  for (const ch of s.chords ?? []) {
    const hands = [
      ch.left ? `Left hand: ${how(ch, ch.left, 'L', flats)}.` : '',
      ch.right ? `Right hand: ${how(ch, ch.right, 'R', flats)}.` : '',
    ].filter(Boolean);
    const broken = ch.left?.style === 'broken' || ch.right?.style === 'broken';
    const block = ch.left?.style === 'block' || ch.right?.style === 'block';
    groups.push({
      title: title(ch.root, ch.minor, flats),
      detail: `Chord in ${ch.count} measure${ch.count === 1 ? '' : 's'}. ${hands.join(' ')}`.trim(),
      links: [
        { label: 'Arpeggio', href: exercise('arpeggio', ch.root, ch.minor), main: broken },
        {
          label: 'Inversions',
          href: exercise('chords', ch.root, ch.minor),
          main: block,
        },
      ],
    });
  }
  return groups;
}
