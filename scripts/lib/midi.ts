/**
 * Standard MIDI file → normalized song. Faithful: nothing is quantized, moved or invented.
 * A MIDI file has no staves, so the hands come from its two note tracks (or two channels of one
 * track); a file with one track and one channel needs `splitAt` or `oneHand` in meta.json.
 */
import midiFile from 'midi-file';
import type { Hand, SongFile, SongNote } from '../../src/engine/song.ts';
import { type ImportOptions, type ImportResult, validateSong } from './musicxml.ts';

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const LEFT = /\b(left|l\.?h\.?|links|linke|lijeva|bass|lower)\b/i;
const RIGHT = /\b(right|r\.?h\.?|rechts|rechte|desna|treble|upper|melody)\b/i;

interface RawNote {
  p: number;
  b: number;
  d: number;
}
interface Part {
  name: string;
  notes: RawNote[];
}

export function importMidi(bytes: Uint8Array, opts: ImportOptions): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const song: SongFile = {
    format: 1,
    id: opts.id,
    version: opts.version,
    title: opts.title ?? opts.id,
    composer: opts.composer ?? '',
    tempos: [],
    measures: [],
    notes: [],
    pedal: [],
    pedalSource: null,
    keys: [],
    sections: [],
    handsFromPitchSplit: false,
    warnings,
  };
  const fail = (message: string): ImportResult => ({ song, errors: [...errors, message] });

  let midi: ReturnType<typeof midiFile.parseMidi>;
  try {
    midi = midiFile.parseMidi(bytes);
  } catch (e) {
    return fail(`Not a readable MIDI file: ${(e as Error).message}`);
  }
  const tpb = midi.header.ticksPerBeat;
  if (!tpb)
    return fail('MIDI file uses SMPTE timing (frames), not beats; export it with beat timing');

  // one part per track and channel that has notes
  const parts = new Map<string, Part>();
  const signatures: { b: number; num: number; den: number }[] = [];
  let endBeat = 0;
  let unmatched = 0;
  midi.tracks.forEach((track, ti) => {
    let tick = 0;
    let name = '';
    const open = new Map<string, { b: number }[]>();
    for (const e of track) {
      tick += e.deltaTime;
      const b = r6(tick / tpb);
      if (e.type === 'trackName') name = e.text.trim();
      else if (e.type === 'setTempo')
        song.tempos.push({ b, bpm: Math.round(60_000_000_000 / e.microsecondsPerBeat) / 1000 });
      else if (e.type === 'timeSignature')
        signatures.push({ b, num: e.numerator, den: e.denominator });
      else if (e.type === 'keySignature')
        song.keys.push({ b, fifths: e.key, mode: e.scale === 1 ? 'minor' : 'major' });
      else if (e.type === 'controller' && e.controllerType === 64)
        song.pedal.push({ b, on: e.value >= 64 });
      else if (e.type === 'noteOn' || e.type === 'noteOff') {
        const id = `${ti}/${e.channel}`;
        const key = `${id}/${e.noteNumber}`;
        const on = e.type === 'noteOn' && e.velocity > 0;
        if (on) {
          const list = open.get(key) ?? [];
          list.push({ b });
          open.set(key, list);
        } else {
          const start = open.get(key)?.shift();
          if (!start) {
            unmatched++;
            continue;
          }
          let part = parts.get(id);
          if (!part) {
            part = { name: '', notes: [] };
            parts.set(id, part);
          }
          part.name = name;
          if (b > start.b) part.notes.push({ p: e.noteNumber, b: start.b, d: r6(b - start.b) });
          else
            warnings.push(`Note ${e.noteNumber} at beat ${start.b} has no length and was left out`);
          endBeat = Math.max(endBeat, b);
        }
      }
    }
    for (const [key, list] of open)
      if (list.length)
        errors.push(`Note ${key.split('/')[2]} in track ${ti + 1} is never released`);
  });
  if (unmatched) warnings.push(`${unmatched} note-off event(s) had no note-on and were ignored`);

  // hands
  const list = [...parts.values()].filter((p) => p.notes.length > 0);
  const hands: { part: Part; hand: Hand | null }[] = [];
  if (list.length === 0) return fail('MIDI file has no notes');
  if (list.length === 1) {
    if (opts.oneHand) hands.push({ part: list[0]!, hand: 'R' });
    else if (opts.splitAt !== undefined) {
      hands.push({ part: list[0]!, hand: null });
      song.handsFromPitchSplit = true;
      warnings.push(`One track only: hands split at pitch ${opts.splitAt} (lower = left)`);
    } else
      return fail(
        'MIDI file has one track, so the hands cannot be told apart. Use a file with one track per hand, or add "splitAt" (e.g. 60) or "oneHand" to the version in meta.json',
      );
  } else if (list.length === 2) {
    const [a, b] = list as [Part, Part];
    const named = (p: Part): Hand | null =>
      LEFT.test(p.name) && !RIGHT.test(p.name)
        ? 'L'
        : RIGHT.test(p.name) && !LEFT.test(p.name)
          ? 'R'
          : null;
    let ha = named(a);
    let hb = named(b);
    if (ha && !hb) hb = ha === 'L' ? 'R' : 'L';
    if (hb && !ha) ha = hb === 'L' ? 'R' : 'L';
    if (!ha || !hb || ha === hb) {
      const mean = (p: Part) => p.notes.reduce((s, n) => s + n.p, 0) / p.notes.length;
      ha = mean(a) >= mean(b) ? 'R' : 'L';
      hb = ha === 'R' ? 'L' : 'R';
      warnings.push(
        `Track names do not say which hand is which ("${a.name}", "${b.name}"): the higher track was taken as the right hand`,
      );
    }
    hands.push({ part: a, hand: ha }, { part: b, hand: hb });
  } else
    return fail(
      `MIDI file has ${list.length} tracks or channels with notes; a piano file needs two (one per hand)`,
    );

  for (const { part, hand } of hands)
    for (const n of part.notes) {
      const note: SongNote = {
        p: n.p,
        b: n.b,
        d: n.d,
        h: hand ?? (n.p < opts.splitAt! ? 'L' : 'R'),
      };
      song.notes.push(note);
    }
  song.notes.sort((x, y) => x.b - y.b || x.p - y.p);

  // measures from the time signatures (4/4 when the file has none)
  signatures.sort((x, y) => x.b - y.b);
  if (signatures.length === 0 || signatures[0]!.b > 1e-6) {
    if (signatures.length === 0) warnings.push('No time signature in the file; 4/4 assumed');
    signatures.unshift({ b: 0, num: 4, den: 4 });
  }
  let beat = 0;
  let si = 0;
  while (beat < endBeat - 1e-6 || song.measures.length === 0) {
    while (si + 1 < signatures.length && signatures[si + 1]!.b <= beat + 1e-6) si++;
    const next = signatures[si + 1];
    const sig = signatures[si]!;
    const len = r6((sig.num * 4) / sig.den);
    if (next && next.b < beat + len - 1e-6) {
      errors.push(`Time signature changes in the middle of a measure (beat ${next.b})`);
      break;
    }
    song.measures.push({
      b: r6(beat),
      len,
      num: sig.num,
      den: sig.den,
      n: String(song.measures.length + 1),
    });
    beat += len;
    if (song.measures.length > 5000) {
      errors.push('More than 5000 measures');
      break;
    }
  }

  // a played-in recording does not sit on the beat grid: say so, the measures will not mean much
  const offGrid = song.notes.filter((n) => Math.abs(n.b * 24 - Math.round(n.b * 24)) > 0.02).length;
  if (offGrid > song.notes.length * 0.2)
    warnings.push(
      `${offGrid} of ${song.notes.length} notes do not start on a beat subdivision: this looks like a recorded performance, not a written score, so measures and the metronome may not line up`,
    );

  if (song.tempos.length === 0) {
    song.tempos.push({ b: 0, bpm: 120 });
    warnings.push('No tempo in the source; defaulted to 120 BPM');
  }
  song.tempos.sort((x, y) => x.b - y.b);
  song.tempos = song.tempos.filter((t, i, arr) => i === 0 || t.bpm !== arr[i - 1]!.bpm);
  if (song.tempos[0]!.b > 0) song.tempos.unshift({ b: 0, bpm: song.tempos[0]!.bpm });
  song.keys.sort((x, y) => x.b - y.b);
  song.pedal.sort((x, y) => x.b - y.b || Number(x.on) - Number(y.on));
  song.pedal = song.pedal.filter((p, i, arr) => (i === 0 ? p.on : p.on !== arr[i - 1]!.on));
  if (song.pedal.length) song.pedalSource = 'arranger';

  errors.push(...validateSong(song, opts.oneHand));
  return { song, errors };
}
