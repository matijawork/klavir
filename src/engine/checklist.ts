/**
 * What is checked about a song and what is not, in plain words, and by whom: compared by Claude
 * with the file's MuseScore playback or with named web pages; added or chosen by Claude (not in the
 * file, nobody checked it); checked by Matija; or not checked at all. Claude's checks are not the
 * last word: the text says what was compared, so he can look again.
 */
import { chordName, fromChordId, prettyChord } from './harmony.ts';
import type { LibraryEntry } from './song.ts';

/** source = checked by Claude; claude = added or chosen by Claude; mine = by Matija; open = not checked */
export type CheckState = 'source' | 'claude' | 'mine' | 'open' | 'none';

export interface CheckRow {
  id:
    | 'notes'
    | 'hands'
    | 'tempo'
    | 'key'
    | 'chords'
    | 'fingering-source'
    | 'fingering-chords'
    | 'fingering'
    | 'pedal'
    | 'ear';
  what: string;
  state: CheckState;
  text: string;
}

const MUSESCORE = "MuseScore's own playback of your file";
const list = (items: string[]): string => items.join(' · ');
const bpm = (v: number): string => String(Math.round(v * 100) / 100);

export function checklist(
  s: LibraryEntry,
  marks: { fingering: boolean; ear: boolean },
): CheckRow[] {
  const rows: CheckRow[] = [];
  const c = s.checks;
  const flats = s.flats === true;
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
        ? `Claude compared all ${ref.of} notes with ${MUSESCORE}: same keys, same moments.${twins}`
        : ref.note
          ? `Claude compared the notes with ${MUSESCORE}: ${ref.matched} of ${ref.of} the same. ${ref.note}`
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
      state: c.hands === 'score' ? 'source' : 'claude',
      text:
        c.hands === 'score'
          ? "From the score's two staves: the upper one is the right hand."
          : c.hands === 'height'
            ? 'Guessed by the app: the file does not say, so the higher part is the right hand.'
            : 'Guessed by the app: the file has one staff, so the notes were split by pitch.',
    });

  if (c) {
    const pages = c.tempoSources?.length
      ? ` The pages say: ${list(c.tempoSources.map((t) => `${t.site} ${bpm(t.bpm)}`))}.`
      : '';
    const note = c.tempoNote ? ` ${c.tempoNote}` : '';
    rows.push({
      id: 'tempo',
      what: 'Tempo',
      state: c.tempo === 'score' ? 'source' : c.tempo === 'claude' ? 'claude' : 'open',
      text:
        c.tempo === 'score'
          ? `${bpm(c.bpm)} beats a minute, written in the score.${pages}${note}`
          : c.tempo === 'claude'
            ? `Set by Claude to ${bpm(c.bpm)} beats a minute.${pages}${note}`
            : `Not written in the score: ${bpm(c.bpm)} beats a minute, as MuseScore plays it. Set the speed to what sounds right.`,
    });
  }

  if (c && c.key !== 'none') {
    const pages = c.keySources?.length
      ? ` The pages say: ${list(c.keySources.map((k) => `${k.site} ${k.key}`))}.`
      : '';
    const note = c.keyNote ? ` ${c.keyNote}` : '';
    rows.push({
      id: 'key',
      what: 'Key',
      state: c.key === 'source' || c.key === 'score' ? 'source' : 'claude',
      text:
        c.key === 'source'
          ? `${s.key}: Claude checked it on several pages, and it fits your file's key signature.${pages}${note}`
          : c.key === 'claude'
            ? `${s.key}: chosen by Claude.${pages}${note}`
            : c.key === 'score'
              ? `${s.key}, written in the score.`
              : `${s.key}: guessed by the app from the notes (the file has only the key signature, which fits two keys). No page checked.`,
    });
  }

  if (s.chords?.length) {
    const found = s.chords.map((ch) => chordName(ch, flats)).join(', ');
    const charts = c?.charts ?? [];
    const names = (ids: string[]) => ids.map((id) => chordName(fromChordId(id), flats)).join(', ');
    const onAChart = s.chords.every((ch) =>
      charts.some((x) => x.same.includes(`${ch.root}${ch.minor ? 'm' : ''}`)),
    );
    const lines = charts.map(
      (x) =>
        ` ${x.site}: ${x.listed.map(prettyChord).join(' ')}` +
        (x.onlySource.length ? ` (not a full chord in your file: ${names(x.onlySource)})` : '') +
        (x.note ? ` (${x.note})` : '') +
        '.',
    );
    rows.push({
      id: 'chords',
      what: 'Chords',
      state: charts.length && (onAChart || c?.chordsNote) ? 'source' : 'open',
      text: charts.length
        ? `Counted by Claude's program from the notes of your file: ${found}. Compared with chord charts:${lines.join('')}${c?.chordsNote ? ` ${c.chordsNote}` : ''}`
        : `Counted by Claude's program from the notes of your file: ${found}. No chord chart on the web to compare with.`,
    });
  }

  const fsrc = c?.fingering;
  if (fsrc)
    rows.push({
      id: 'fingering-source',
      what: 'Fingering (main pattern)',
      state: 'source',
      text: `Copied from ${fsrc.site} for ${fsrc.notes} of ${fsrc.of} notes: ${list(fsrc.patterns)}.${fsrc.note ? ` ${fsrc.note}` : ''}`,
    });
  const tri = c?.chordFingering;
  if (tri)
    rows.push({
      id: 'fingering-chords',
      what: 'Fingering (chords)',
      state: 'source',
      text: `Chords played all at once (${tri.notes} notes) use the inversion fingering of ${tri.site}: ${tri.quote ?? ''} (root position, first and second inversion, low note first).`,
    });
  const own = c?.claudeFingering;
  rows.push({
    id: 'fingering',
    what: fsrc || tri ? 'Fingering (rest)' : 'Fingering',
    state: marks.fingering
      ? 'mine'
      : !s.fingering
        ? 'none'
        : s.fingering === 'claude'
          ? 'claude'
          : 'source',
    text: marks.fingering
      ? 'Checked by you.'
      : !s.fingering
        ? 'No finger numbers.'
        : s.fingering === 'claude'
          ? `${own ? `${own.note} (${own.notes} notes). ` : ''}The rest suggested by the app (Claude's program), not in the score; nobody has checked it.${c?.fingeringNote ? ` ${c.fingeringNote}` : ''}`
          : 'Written in the score.',
  });

  const pedalSame = !!ref && ref.pedalOf > 0 && ref.pedalMatched === ref.pedalOf;
  rows.push({
    id: 'pedal',
    what: 'Pedal',
    state: !s.pedal ? 'none' : s.pedal === 'claude' ? 'claude' : 'source',
    text: !s.pedal
      ? (c?.pedalNote ?? 'The score has no pedal marks.')
      : s.pedal === 'claude'
        ? `Added by Claude, not in the score; it starts switched off (Pedal in the player).${c?.pedalNote ? ` ${c.pedalNote}` : ''}`
        : pedalSame
          ? `Written in the score: ${Math.ceil(ref.pedalOf / 2)} times down and up; Claude compared every one with ${MUSESCORE}: same moments. Listen plays it: a key let go while the pedal is down keeps sounding until it comes up.`
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

/** The rows by who checked them ("none" rows are left out). */
export const checkedSplit = (
  rows: CheckRow[],
): { claude: CheckRow[]; you: CheckRow[]; added: CheckRow[]; no: CheckRow[] } => ({
  claude: rows.filter((r) => r.state === 'source'),
  you: rows.filter((r) => r.state === 'mine'),
  added: rows.filter((r) => r.state === 'claude'),
  no: rows.filter((r) => r.state === 'open'),
});
