/**
 * What is checked about a song and what is not, in plain words: the import's own checks
 * (`LibraryEntry.checks`), where fingering and pedal come from, and the player's own marks.
 */
import type { LibraryEntry } from './song.ts';

/** source = checked against the score or a file; mine = checked by the player; open = not checked */
export type CheckState = 'source' | 'mine' | 'open' | 'none';

export interface CheckRow {
  id: 'notes' | 'hands' | 'tempo' | 'key' | 'fingering' | 'pedal' | 'ear';
  what: string;
  state: CheckState;
  text: string;
}

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
      ? ` ${ref.twins} of them are one key struck by both hands at once, which MuseScore's file holds as one note.`
      : '';
    rows.push({
      id: 'notes',
      what: 'Notes',
      state: same || ref.note ? 'source' : 'open',
      text: same
        ? `All ${ref.of} notes are the same as MuseScore's own playback of your file: same keys, same moments.${twins}`
        : ref.note
          ? `${ref.matched} of ${ref.of} notes are the same as MuseScore's own playback of your file. ${ref.note}`
          : `Only ${ref.matched} of ${ref.of} notes are the same as MuseScore's own playback of your file.`,
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
      state: c.key === 'score' ? 'source' : 'open',
      text:
        c.key === 'score'
          ? `${s.key}, written in the score.`
          : `${s.key}: guessed from the notes. The score only has the key signature, and that fits two keys.`,
    });
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
  rows.push({
    id: 'pedal',
    what: 'Pedal',
    state: !s.pedal ? 'none' : s.pedal === 'claude' ? 'open' : 'source',
    text: !s.pedal
      ? 'The score has no pedal marks.'
      : s.pedal === 'claude'
        ? 'Not in the score: the app suggests one pedal change per measure. Not checked.'
        : 'Written in the score.',
  });
  rows.push({
    id: 'ear',
    what: 'By ear',
    state: marks.ear ? 'mine' : 'open',
    text: marks.ear
      ? 'You listened: it sounds like the song.'
      : 'Only you can tell whether it sounds like the song. Press Listen in Practise, then mark it here.',
  });
  return rows;
}

/** How many of the rows that can be checked are checked. */
export const checkedCount = (rows: CheckRow[]): { ok: number; of: number } => {
  const counted = rows.filter((r) => r.state !== 'none');
  return {
    ok: counted.filter((r) => r.state === 'source' || r.state === 'mine').length,
    of: counted.length,
  };
};
