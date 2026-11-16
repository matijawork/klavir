/**
 * What is checked about a song and what is not, in plain words: the import's own checks
 * (`LibraryEntry.checks`), named web sources, where fingering and pedal come from, and what
 * Matija checked himself.
 */
import { chordName, fromChordId, prettyChord } from './harmony.ts';
import type { LibraryEntry } from './song.ts';

/** source = checked against a file or a named source; mine = checked by Matija; open = not checked */
export type CheckState = 'source' | 'mine' | 'open' | 'none';

export interface CheckRow {
  id: 'notes' | 'hands' | 'tempo' | 'key' | 'chords' | 'fingering' | 'pedal' | 'ear';
  what: string;
  state: CheckState;
  text: string;
}

const MUSESCORE = "MuseScore's own playback of your file";

export function checklist(
  s: LibraryEntry,
  marks: { fingering: boolean; ear: boolean },
): CheckRow[] {
  const rows: CheckRow[] = [];
  const c = s.checks;
  const ref = c?.reference;
  if (ref) {
    const same = ref.matched + ref.twins === ref.of && ref.extra === 0;
    const twins = ref.twins
      ? ` (${ref.twins} times both hands have the same key at the same moment; MuseScore's file keeps those as one note.)`
      : '';
    rows.push({
      id: 'notes',
      what: 'Notes',
      state: same || ref.note ? 'source' : 'open',
      text: same
        ? `All ${ref.of} notes are the same as ${MUSESCORE}: same keys, same moments.${twins}`
        : ref.note
          ? `${ref.matched} of ${ref.of} notes are the same as ${MUSESCORE}. ${ref.note}`
          : `Only ${ref.matched} of ${ref.of} notes are the same as ${MUSESCORE}.`,
    });
  } else
    rows.push({
      id: 'notes',
      what: 'Notes',
      state: 'open',
      text: `${s.noteCount} notes from the file, not compared with anything.`,
    });
  if (c && c.hands !== 'one')
    rows.push({
      id: 'hands',
      what: 'Hands',
      state: c.hands === 'score' ? 'source' : 'open',
      text:
        c.hands === 'score'
          ? "From the score's two staves: the upper one is the right hand."
          : c.hands === 'height'
            ? 'Guessed: the file does not say, so the higher part is taken as the right hand.'
            : 'Guessed: the file has one staff, so the notes were split by pitch.',
    });
  if (c)
    rows.push({
      id: 'tempo',
      what: 'Tempo',
      state: c.tempo === 'score' ? 'source' : 'open',
      text:
        c.tempo === 'score'
          ? `${Math.round(c.bpm)} beats a minute, written in the score.`
          : `Not written in the score: ${Math.round(c.bpm)} beats a minute, as MuseScore plays it. Set the speed to what sounds right.`,
    });
  if (c && c.key !== 'none')
    rows.push({
      id: 'key',
      what: 'Key',
      state: c.key === 'guessed' ? 'open' : 'source',
      text:
        c.key === 'source' && c.keySource
          ? `${s.key}, as ${c.keySource.site} gives it (and it fits your file's key signature).${c.keySource.note ? ` ${c.keySource.note}` : ''}`
          : c.key === 'score'
            ? `${s.key}, written in the score.`
            : `${s.key}: guessed from the notes. The score only has the key signature, and that fits two keys. No web source checked.`,
    });
  if (s.chords?.length) {
    const flats = s.flats === true;
    const found = s.chords.map((ch) => chordName(ch, flats)).join(', ');
    const cc = c?.chords;
    const names = (ids: string[]) => ids.map((id) => chordName(fromChordId(id), flats)).join(', ');
    const match = !!cc && cc.onlySource.length === 0 && cc.onlyFile.length === 0;
    rows.push({
      id: 'chords',
      what: 'Chords',
      state: cc && (match || cc.note || cc.onlyFile.length === 0) ? 'source' : 'open',
      text: !cc
        ? `Counted from the notes of your file: ${found}. No chord chart on the web to compare with.`
        : match
          ? `Counted from the notes of your file: ${found}. The same as the chart on ${cc.site}.`
          : `Counted from the notes of your file: ${found}. The chart on ${cc.site} lists ${cc.listed.map(prettyChord).join(', ')}.` +
            (cc.onlySource.length
              ? ` Never a full chord in your file: ${names(cc.onlySource)}.`
              : '') +
            (cc.onlyFile.length ? ` Only in your file: ${names(cc.onlyFile)}.` : '') +
            (cc.note ? ` ${cc.note}` : ''),
    });
  }
  rows.push({
    id: 'fingering',
    what: 'Fingering',
    state: marks.fingering
      ? 'mine'
      : !s.fingering
        ? 'none'
        : s.fingering === 'claude'
          ? 'open'
          : 'source',
    text: marks.fingering
      ? 'Checked by you.'
      : !s.fingering
        ? 'No finger numbers.'
        : s.fingering === 'claude'
          ? 'Not in the score: the app suggests finger numbers. Nobody has checked them.'
          : 'Written in the score.',
  });
  const pedalSame = !!ref && ref.pedalOf > 0 && ref.pedalMatched === ref.pedalOf;
  rows.push({
    id: 'pedal',
    what: 'Pedal',
    state: !s.pedal ? 'none' : s.pedal === 'claude' ? 'open' : 'source',
    text: !s.pedal
      ? 'The score has no pedal marks.'
      : s.pedal === 'claude'
        ? 'Not in the score: the app suggests one pedal change per measure. Not checked.'
        : pedalSame
          ? `Written in the score: ${Math.ceil(ref.pedalOf / 2)} times down and up, all at the same moments as ${MUSESCORE}. Listen plays it: a key let go while the pedal is down keeps sounding until it comes up.`
          : 'Written in the score. Listen plays it: a key let go while the pedal is down keeps sounding until it comes up.',
  });
  rows.push({
    id: 'ear',
    what: 'By ear',
    state: s.heard || marks.ear ? 'mine' : 'open',
    text: s.heard
      ? `You listened (${s.heard}) and said it sounds right.`
      : marks.ear
        ? 'You listened: it sounds like the song.'
        : 'Only you can tell whether it sounds like the song. Press Listen in Practise.',
  });
  return rows;
}

/** The rows split into what is checked and what is not ("none" rows are left out). */
export const checkedSplit = (rows: CheckRow[]): { yes: CheckRow[]; no: CheckRow[] } => ({
  yes: rows.filter((r) => r.state === 'source' || r.state === 'mine'),
  no: rows.filter((r) => r.state === 'open'),
});
