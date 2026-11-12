import { describe, expect, it } from 'vitest';
import {
  buildBeats,
  HIT,
  hitWindowMs,
  MISSED,
  PENDING,
  PracticeSession,
} from '../../src/engine/session.ts';
import { loadSong, type SongFile, type SongNote } from '../../src/engine/song.ts';
import { Transport } from '../../src/engine/transport.ts';

/** 60 BPM, 4/4: one beat = one second, so beats and seconds coincide. */
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
  return { song, transport, session: new PracticeSession(song, transport) };
}

const R = (p: number, b: number, d = 1): SongNote => ({ p, b, d, h: 'R' });
const L = (p: number, b: number, d = 1): SongNote => ({ p, b, d, h: 'L' });
const base = { handMask: 3, range: null, loop: false, countIn: false } as const;
/** wall ms at which song time t is reached when playing from the lead-in at wall 0 */
const at = (t: number, lead = 1) => (t + lead) * 1000;

describe('hitWindowMs', () => {
  it('is 15 % of a beat, clamped to 80–120 ms', () => {
    expect(hitWindowMs(60, 1)).toBe(120);
    expect(hitWindowMs(100, 1)).toBeCloseTo(90);
    expect(hitWindowMs(200, 1)).toBe(80);
    expect(hitWindowMs(200, 0.5)).toBeCloseTo(90);
  });
});

describe('buildBeats', () => {
  it('gives one beat per quarter in 4/4 with an accent on the downbeat', () => {
    const { song } = make([R(60, 0)], 1);
    const b = buildBeats(song);
    expect([...b.time]).toEqual([0, 1, 2, 3]);
    expect([...b.accent]).toEqual([1, 0, 0, 0]);
  });
});

describe('lead-in and count-in', () => {
  it('uses a short lead-in without count-in', () => {
    const { session } = make([R(60, 0)]);
    session.configure({ ...base, mode: 'tempo' }, 0);
    expect(session.leadStart).toBe(-1);
    expect(session.countInTimes).toEqual([]);
  });

  it('counts in one bar at the song tempo', () => {
    const { session } = make([R(60, 0)]);
    session.configure({ ...base, mode: 'tempo', countIn: true }, 0);
    expect(session.countInTimes).toEqual([-4, -3, -2, -1]);
    expect(session.leadStart).toBe(-4);
  });
});

describe('tempo mode', () => {
  it('scores hits with their deviation, misses and wrong notes', () => {
    const { session, song } = make([R(60, 0), R(62, 1), R(64, 2)]);
    session.configure({ ...base, mode: 'tempo' }, 0);
    session.play(0);
    session.noteOn(60, at(0) + 30); // 30 ms late
    session.update(at(0.5));
    session.noteOn(61, at(1)); // wrong pitch
    session.update(at(1.5));
    session.noteOn(64, at(2) - 50); // 50 ms early
    session.update(at(3));
    expect([...session.state]).toEqual([HIT, MISSED, HIT]);
    expect(session.deviation[0]).toBeCloseTo(30);
    expect(session.deviation[2]).toBeCloseTo(-50);
    expect(session.wrong).toBe(1);
    expect(song.count).toBe(3);
  });

  it('rejects a press outside the window', () => {
    const { session } = make([R(60, 0)]);
    session.configure({ ...base, mode: 'tempo' }, 0);
    session.play(0);
    session.noteOn(60, at(0) + 200);
    expect(session.state[0]).toBe(PENDING);
    expect(session.wrong).toBe(1);
  });

  it('matches repeated notes in order', () => {
    const { session } = make([R(60, 0, 0.5), R(60, 0.5, 0.5), R(60, 1, 0.5)]);
    session.configure({ ...base, mode: 'tempo' }, 0);
    session.play(0);
    session.noteOn(60, at(0));
    session.noteOn(60, at(0.5) + 20);
    session.noteOn(60, at(1) - 20);
    expect([...session.state]).toEqual([HIT, HIT, HIT]);
    expect(session.wrong).toBe(0);
  });

  it('keeps going and reports the pass at the end', () => {
    const { session, transport } = make([R(60, 0), R(62, 1)], 1);
    session.configure({ ...base, mode: 'tempo' }, 0);
    let result: { accuracy: number; missed: number } | null = null;
    let ended = false;
    session.onPass = (r) => {
      result = r;
    };
    session.onEnd = () => {
      ended = true;
    };
    session.play(0);
    session.noteOn(60, at(0));
    session.update(at(4));
    expect(result).toMatchObject({ accuracy: 0.5, missed: 1, expected: 2, hits: 1 });
    expect(ended).toBe(true);
    expect(transport.playing).toBe(false);
  });

  it('scales the timeline with speed but measures deviation in real milliseconds', () => {
    const { session, transport } = make([R(60, 1)]);
    transport.setRate(0.5, 0);
    session.configure({ ...base, mode: 'tempo' }, 0);
    session.play(0);
    // lead-in 1 s + 1 s of song at half speed = 4 s of wall time
    session.noteOn(60, 4000 + 40);
    expect(session.state[0]).toBe(HIT);
    expect(session.deviation[0]).toBeCloseTo(40);
  });
});

describe('wait mode', () => {
  it('stops at a note until it is pressed, then continues', () => {
    const { session, transport } = make([R(60, 0), R(62, 1)]);
    session.configure({ ...base, mode: 'wait' }, 0);
    session.play(0);
    expect(session.update(at(0) + 500)).toBe(0);
    expect(session.waiting).toBe(true);
    expect(session.update(at(0) + 5000)).toBe(0);
    session.noteOn(60, 9000);
    expect(session.waiting).toBe(false);
    expect(transport.playing).toBe(true);
    expect(session.update(9500)).toBeCloseTo(0.5);
    expect(session.state[0]).toBe(HIT);
  });

  it('does not stop when the key was pressed just before the note arrived', () => {
    const { session } = make([R(60, 0), R(62, 1)]);
    session.configure({ ...base, mode: 'wait' }, 0);
    session.play(0);
    session.noteOn(60, at(0) - 100);
    expect(session.update(at(0) + 10)).toBeCloseTo(0.01);
    expect(session.waiting).toBe(false);
    expect(session.state[0]).toBe(HIT);
  });

  it('ignores a press made long before the note', () => {
    const { session } = make([R(60, 0)]);
    session.configure({ ...base, mode: 'wait' }, 0);
    session.play(0);
    session.noteOn(60, at(0) - 800);
    session.update(at(0) + 10);
    expect(session.waiting).toBe(true);
  });

  it('needs every note of a chord', () => {
    const { session } = make([R(60, 0), R(64, 0), L(48, 0)]);
    session.configure({ ...base, mode: 'wait' }, 0);
    session.play(0);
    session.update(at(0) + 10);
    session.noteOn(60, 2000);
    session.noteOn(48, 2010);
    expect(session.waiting).toBe(true);
    session.noteOn(64, 2020);
    expect(session.waiting).toBe(false);
    expect(session.hits).toBe(3);
  });

  it('needs a new press for a repeated note', () => {
    const { session } = make([R(60, 0), R(60, 1)]);
    session.configure({ ...base, mode: 'wait' }, 0);
    session.play(0);
    session.update(at(0) + 10);
    session.noteOn(60, 1500); // satisfies the first; song resumes from t = 0 at wall 1500
    expect(session.update(2600)).toBe(1);
    expect(session.waiting).toBe(true);
    session.noteOn(60, 2700);
    expect(session.waiting).toBe(false);
  });

  it('counts wrong keys without advancing', () => {
    const { session } = make([R(60, 0)]);
    session.configure({ ...base, mode: 'wait' }, 0);
    session.play(0);
    session.update(at(0) + 10);
    session.noteOn(61, 2000);
    expect(session.wrong).toBe(1);
    expect(session.waiting).toBe(true);
  });

  it('only waits for the selected hand', () => {
    const { session } = make([R(60, 0), L(48, 0), L(50, 1)]);
    session.configure({ ...base, mode: 'wait', handMask: 2 }, 0);
    session.play(0);
    session.update(at(0) + 10);
    session.noteOn(60, 1100);
    expect(session.waiting).toBe(false);
    expect(session.expected).toBe(1);
    expect(session.update(1100 + 1500)).toBeCloseTo(1.5); // the left-hand note at beat 1 does not gate
  });
});

describe('sections and looping', () => {
  it('limits the range to the chosen measures', () => {
    const { session } = make([R(60, 0), R(62, 4), R(64, 8)], 3);
    session.configure({ ...base, mode: 'tempo', range: { a: 1, b: 1 } }, 0);
    expect(session.rangeStart).toBe(4);
    expect(session.rangeEnd).toBe(8);
    expect(session.expected).toBe(1);
    expect(session.leadStart).toBe(3);
  });

  it('restarts the section and clears results when looping', () => {
    const { session, transport } = make([R(60, 0)], 1);
    session.configure({ ...base, mode: 'tempo', loop: true }, 0);
    const passes: number[] = [];
    session.onPass = (r) => passes.push(r.accuracy);
    session.play(0);
    session.noteOn(60, at(0));
    const t = session.update(at(4));
    expect(passes).toEqual([1]);
    expect(t).toBe(-1);
    expect(transport.playing).toBe(true);
    expect(session.state[0]).toBe(PENDING);
    expect(session.hits).toBe(0);
    session.update(at(4) + 5000);
    expect(passes).toEqual([1, 0]);
  });
});
