import midiFile, { type MidiEvent } from 'midi-file';
import { describe, expect, it } from 'vitest';
import { importMidi } from '../../scripts/lib/midi.ts';

const TPB = 480;
type Ev = { at: number } & (
  | { on: number; ch?: number }
  | { off: number; ch?: number }
  | { pedal: boolean }
  | { tempo: number }
  | { sig: [number, number] }
  | { key: [number, number] }
  | { name: string }
);

/** Builds one MIDI track from events at absolute beats. */
function track(events: Ev[]): MidiEvent[] {
  const out: MidiEvent[] = [];
  let tick = 0;
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const t = Math.round(e.at * TPB);
    const deltaTime = t - tick;
    tick = t;
    if ('on' in e)
      out.push({ deltaTime, type: 'noteOn', channel: e.ch ?? 0, noteNumber: e.on, velocity: 80 });
    else if ('off' in e)
      out.push({ deltaTime, type: 'noteOff', channel: e.ch ?? 0, noteNumber: e.off, velocity: 0 });
    else if ('pedal' in e)
      out.push({
        deltaTime,
        type: 'controller',
        channel: 0,
        controllerType: 64,
        value: e.pedal ? 127 : 0,
      });
    else if ('tempo' in e)
      out.push({
        deltaTime,
        type: 'setTempo',
        meta: true,
        microsecondsPerBeat: Math.round(60_000_000 / e.tempo),
      });
    else if ('sig' in e)
      out.push({
        deltaTime,
        type: 'timeSignature',
        meta: true,
        numerator: e.sig[0],
        denominator: e.sig[1],
        metronome: 24,
        thirtyseconds: 8,
      });
    else if ('key' in e)
      out.push({ deltaTime, type: 'keySignature', meta: true, key: e.key[0], scale: e.key[1] });
    else out.push({ deltaTime, type: 'trackName', meta: true, text: e.name });
  }
  out.push({ deltaTime: 0, type: 'endOfTrack', meta: true });
  return out;
}
const file = (...tracks: MidiEvent[][]): Uint8Array =>
  Uint8Array.from(
    midiFile.writeMidi({
      header: { format: 1, numTracks: tracks.length, ticksPerBeat: TPB },
      tracks,
    }),
  );
/** a note of `d` beats at beat `b` */
const note = (p: number, b: number, d = 1, ch = 0): Ev[] => [
  { at: b, on: p, ch },
  { at: b + d, off: p, ch },
];
const opts = { id: 't', version: 'original', title: 'T', composer: 'C' };

const conductor = track([
  { at: 0, tempo: 90 },
  { at: 0, sig: [3, 4] },
  { at: 0, key: [1, 0] },
  { at: 6, tempo: 60 },
]);
const right = [
  { at: 0, name: 'Piano right' } as Ev,
  ...note(67, 0),
  ...note(69, 1),
  ...note(71, 2, 0.5),
  ...note(74, 3, 3),
];
const left = [
  { at: 0, name: 'Piano left' } as Ev,
  ...note(43, 0, 3),
  ...note(50, 3, 3),
  { at: 0, pedal: true } as Ev,
  { at: 3, pedal: false } as Ev,
];

describe('MIDI import', () => {
  it('reads notes, hands, measures, tempo, key and pedal as written', () => {
    const { song, errors } = importMidi(file(conductor, track(right), track(left)), opts);
    expect(errors).toEqual([]);
    expect(song.warnings).toEqual([]);
    expect(song.notes).toEqual([
      { p: 43, b: 0, d: 3, h: 'L' },
      { p: 67, b: 0, d: 1, h: 'R' },
      { p: 69, b: 1, d: 1, h: 'R' },
      { p: 71, b: 2, d: 0.5, h: 'R' },
      { p: 50, b: 3, d: 3, h: 'L' },
      { p: 74, b: 3, d: 3, h: 'R' },
    ]);
    expect(song.measures).toEqual([
      { b: 0, len: 3, num: 3, den: 4, n: '1' },
      { b: 3, len: 3, num: 3, den: 4, n: '2' },
    ]);
    expect(song.tempos).toEqual([
      { b: 0, bpm: 90 },
      { b: 6, bpm: 60 },
    ]);
    expect(song.keys).toEqual([{ b: 0, fifths: 1, mode: 'major' }]);
    expect(song.pedal).toEqual([
      { b: 0, on: true },
      { b: 3, on: false },
    ]);
    expect(song.pedalSource).toBe('arranger');
    expect(song.handsFromPitchSplit).toBe(false);
  });

  it('track order does not decide the hands: names do', () => {
    const { song, errors } = importMidi(file(conductor, track(left), track(right)), opts);
    expect(errors).toEqual([]);
    expect(song.notes.find((n) => n.p === 43)!.h).toBe('L');
    expect(song.notes.find((n) => n.p === 67)!.h).toBe('R');
  });

  it('without telling names the higher track is the right hand, and it says so', () => {
    const anon = (evs: Ev[]) => track(evs.filter((e) => !('name' in e)));
    const { song, errors } = importMidi(file(conductor, anon(left), anon(right)), opts);
    expect(errors).toEqual([]);
    expect(song.notes.find((n) => n.p === 43)!.h).toBe('L');
    expect(song.warnings.join(' ')).toContain('the higher track was taken as the right hand');
  });

  it('two channels in one track work as two hands', () => {
    const both = track([...note(67, 0, 1, 0), ...note(43, 0, 1, 1)]);
    const { song, errors } = importMidi(file(both), opts);
    expect(errors).toEqual([]);
    expect(song.notes.map((n) => n.h)).toEqual(['L', 'R']);
  });

  it('one track: refuses to guess, unless splitAt or oneHand is given', () => {
    const one = file(track([...note(67, 0), ...note(43, 0)]));
    expect(importMidi(one, opts).errors.join(' ')).toContain('the hands cannot be told apart');
    const split = importMidi(one, { ...opts, splitAt: 60 });
    expect(split.errors).toEqual([]);
    expect(split.song.notes.map((n) => n.h)).toEqual(['L', 'R']);
    expect(split.song.handsFromPitchSplit).toBe(true);
    const solo = importMidi(one, { ...opts, oneHand: true });
    expect(solo.errors).toEqual([]);
    expect(solo.song.notes.every((n) => n.h === 'R')).toBe(true);
  });

  it('says what is wrong with files it cannot use', () => {
    const three = file(track(note(60, 0)), track(note(64, 0)), track(note(67, 0)));
    expect(importMidi(three, opts).errors.join(' ')).toContain('3 tracks or channels with notes');
    expect(importMidi(file(conductor), opts).errors).toEqual(['MIDI file has no notes']);
    expect(importMidi(Uint8Array.from([1, 2, 3, 4]), opts).errors[0]).toContain(
      'Not a readable MIDI file',
    );
    const stuck = file(track([{ at: 0, on: 60 }]), track(note(40, 0)));
    expect(importMidi(stuck, opts).errors.join(' ')).toContain('never released');
    const low = file(track(note(10, 0)), track(note(70, 0)));
    expect(importMidi(low, opts).errors.join(' ')).toContain('outside the 88-key range');
  });

  it('defaults are named: no tempo, no time signature', () => {
    const { song, errors } = importMidi(file(track(note(67, 0, 5)), track(note(43, 0, 5))), opts);
    expect(errors).toEqual([]);
    expect(song.tempos).toEqual([{ b: 0, bpm: 120 }]);
    expect(song.measures.map((m) => [m.b, m.len])).toEqual([
      [0, 4],
      [4, 4],
    ]);
    expect(song.warnings.slice(1)).toEqual([
      'No time signature in the file; 4/4 assumed',
      'No tempo in the source; defaulted to 120 BPM',
    ]);
  });

  it('a played-in recording is flagged, not straightened', () => {
    const loose = (p: number, k: number) => note(p, k + 0.137 * ((k % 3) + 1), 0.8);
    const r = track([0, 1, 2, 3, 4, 5].flatMap((k) => loose(67 + k, k)));
    const l = track([0, 1, 2, 3, 4, 5].flatMap((k) => loose(43 + k, k)));
    const { song, errors } = importMidi(file(r, l), opts);
    expect(errors).toEqual([]);
    expect(song.notes[0]!.b).toBeCloseTo(0.137, 2);
    expect(song.warnings.join(' ')).toContain('looks like a recorded performance');
  });

  it('time signature change takes effect at its measure', () => {
    const c = track([
      { at: 0, sig: [4, 4] },
      { at: 4, sig: [6, 8] },
    ]);
    const { song, errors } = importMidi(
      file(c, track(note(67, 0, 7)), track(note(43, 0, 7))),
      opts,
    );
    expect(errors).toEqual([]);
    expect(song.measures.map((m) => [m.b, m.len, m.num, m.den])).toEqual([
      [0, 4, 4, 4],
      [4, 3, 6, 8],
    ]);
  });
});
