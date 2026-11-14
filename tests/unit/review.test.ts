import { describe, expect, it } from 'vitest';
import { reviewSteps } from '../../src/engine/review.ts';
import { type PassSnapshot, PracticeSession } from '../../src/engine/session.ts';
import { loadSong, type SongFile, type SongNote } from '../../src/engine/song.ts';
import { Transport } from '../../src/engine/transport.ts';

/** 60 BPM, 4/4: one beat = one second. */
function make(notes: SongNote[], measures = 2) {
  const file: SongFile = {
    format: 1,
    id: 't',
    version: 'original',
    title: 'T',
    composer: '',
    tempos: [{ b: 0, bpm: 60 }],
    measures: Array.from({ length: measures }, (_, i) => ({
      b: i * 4,
      len: 4,
      num: 4,
      den: 4,
      n: String(i + 1),
    })),
    notes,
    pedal: [],
    pedalSource: null,
    keys: [],
    sections: [],
    handsFromPitchSplit: false,
    warnings: [],
  };
  const song = loadSong(file);
  const transport = new Transport();
  transport.duration = song.duration;
  return { song, session: new PracticeSession(song, transport) };
}
const R = (p: number, b: number, d = 1): SongNote => ({ p, b, d, h: 'R' });
/** wall ms at which song time t is reached (1 s lead-in, started at wall 0) */
const at = (t: number) => (t + 1) * 1000;

/** Plays [pitch, press time, release time] (song seconds) in time order and returns the snapshot. */
function play(
  notes: SongNote[],
  mode: 'tempo' | 'wait',
  keys: [number, number, number][],
  measures = 2,
) {
  const { song, session } = make(notes, measures);
  let snap: PassSnapshot | null = null;
  session.onPass = () => {
    snap = session.snapshot();
  };
  session.configure({ mode, handMask: 3, range: null, loop: false, countIn: false }, 0);
  session.play(0);
  const events = keys
    .flatMap(([p, on, off]) => [
      { p, t: on, on: true },
      { p, t: off, on: false },
    ])
    .sort((a, b) => a.t - b.t);
  let e = 0;
  for (let wall = 0; wall <= at(song.duration) + 3000; wall += 10) {
    for (; e < events.length && at(events[e]!.t) <= wall; e++) {
      if (events[e]!.on) session.noteOn(events[e]!.p, at(events[e]!.t));
      else session.noteOff(events[e]!.p, at(events[e]!.t));
    }
    session.update(wall);
  }
  expect(snap, 'the pass finished').not.toBeNull();
  return { song, session, snap: snap! };
}

const song1 = [R(60, 0), R(62, 1), R(64, 2), R(65, 3), R(69, 3), R(67, 4, 2)];

describe('note-by-note review', () => {
  it('says in words what happened at every step, in song order', () => {
    const { song, snap } = play(song1, 'tempo', [
      [60, 0, 0.95], // fine
      [62, 1.2, 1.95], // 200 ms late
      [70, 2.5, 2.6], // not in the song; the E at beat 2 is never played
      [65, 3, 3.95], // fine
      [69, 3, 3.2], // let go after a fifth of it
      [67, 3.85, 7.5], // 150 ms early, held 1.5 s too long
    ]);
    expect(reviewSteps(song, snap).map((s) => [s.measure, s.bad, s.text])).toEqual([
      [0, false, 'C4 on time'],
      [0, true, 'D4 200 ms late'],
      [0, true, 'E4 not played'],
      [0, true, 'A♯4 is not in the song here'],
      [0, true, 'A4 let go too soon (held 20 % of it) · F4 on time'],
      [1, true, 'G4 150 ms early, held 1.5 s too long'],
    ]);
  });

  it('a clean pass has no bad steps', () => {
    const { song, snap } = play(
      song1,
      'tempo',
      song1.map((n) => [n.p, n.b, n.b + n.d - 0.05]),
    );
    const steps = reviewSteps(song, snap);
    expect(steps).toHaveLength(5);
    expect(steps.filter((s) => s.bad)).toEqual([]);
    expect(steps[3]!.text).toBe('F4 A4 on time');
  });

  it('wait mode does not talk about timing', () => {
    const { song, snap } = play(
      [R(60, 0), R(62, 1)],
      'wait',
      [
        [61, 0, 0.1],
        [60, 0.3, 1.2],
        [62, 1.4, 2.4],
      ],
      1,
    );
    expect(reviewSteps(song, snap).map((s) => s.text)).toEqual([
      'C4 right',
      'C♯4 is not in the song here',
      'D4 right',
    ]);
  });

  it('a snapshot survives the rewind and can be put back for drawing', () => {
    const { session, snap } = play(song1, 'tempo', [[62, 1.2, 1.95]]);
    session.rewind(0);
    expect(session.state[1]).toBe(0);
    session.restore(snap);
    expect(session.state[1]).toBe(1);
    expect(session.grade[1]).toBe(2);
    expect(session.deviation[1]).toBeCloseTo(200, 0);
    expect(session.releasedAt[1]).toBeCloseTo(1.95, 2);
    expect(session.state[0], 'never played = missed').toBe(2);
  });
});
