/**
 * Deliberately sloppy playing against every strictness level: the table says what each level must
 * make of the same press or release. This is the automated version of "play it wrong and look".
 */
import { describe, expect, it } from 'vitest';
import {
  EARLY,
  HIT,
  LATE,
  ON_TIME,
  PENDING,
  PracticeSession,
  SHORT,
  type Strictness,
} from '../../src/engine/session.ts';
import { loadSong, type SongFile } from '../../src/engine/song.ts';
import { Transport } from '../../src/engine/transport.ts';

const LEVELS: Strictness[] = ['easy', 'normal', 'strict'];

/** 60 BPM (1 beat = 1 s); one note of `len` beats at beat 4, then room to over-hold. */
function setup(len: number, strictness: Strictness, mode: 'tempo' | 'wait' = 'tempo') {
  const file: SongFile = {
    format: 1,
    id: 't',
    version: 'original',
    title: 'T',
    composer: '',
    tempos: [{ b: 0, bpm: 60 }],
    measures: [0, 4, 8, 12].map((b, i) => ({ b, len: 4, num: 4, den: 4, n: String(i + 1) })),
    notes: [{ p: 60, b: 4, d: len, h: 'R' }],
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
  const session = new PracticeSession(song, transport);
  session.strictness = strictness;
  session.configure({ mode, handMask: 3, range: null, loop: false, countIn: false }, 0);
  session.play(0);
  return session;
}
/** wall ms at which song second t is reached (1 s lead-in) */
const at = (t: number) => (t + 1) * 1000;

describe('press timing by strictness', () => {
  // offset in ms from the note → verdict per level: on time, early, late, or X = not accepted (wrong key)
  const table: [number, string, string, string][] = [
    [0, 'on', 'on', 'on'],
    [50, 'on', 'on', 'on'],
    [-50, 'on', 'on', 'on'],
    [100, 'on', 'on', 'late'],
    [150, 'on', 'late', 'late'],
    [-150, 'on', 'early', 'early'],
    [300, 'late', 'late', 'late'],
    [-300, 'early', 'early', 'X'],
    [-450, 'early', 'X', 'X'],
    [450, 'late', 'late', 'late'],
    [600, 'X', 'X', 'X'],
  ];
  for (const [offset, ...verdicts] of table)
    LEVELS.forEach((level, k) => {
      it(`${offset} ms on ${level} → ${verdicts[k]}`, () => {
        const s = setup(1, level);
        s.noteOn(60, at(4) + offset);
        const got =
          s.state[0] === PENDING
            ? 'X'
            : s.grade[0] === ON_TIME
              ? 'on'
              : s.grade[0] === EARLY
                ? 'early'
                : s.grade[0] === LATE
                  ? 'late'
                  : '?';
        expect(got).toBe(verdicts[k]);
        expect(s.wrong).toBe(got === 'X' ? 1 : 0);
      });
    });

  it('scores the same sloppy press lower the stricter the level', () => {
    const scores = LEVELS.map((level) => {
      const s = setup(1, level);
      s.noteOn(60, at(4) + 140);
      s.noteOff(60, at(4.9));
      return s.result(true).accuracy;
    });
    expect(scores[0]).toBe(1);
    expect(scores[1]!).toBeLessThan(scores[0]!);
    expect(scores[2]!).toBeLessThan(scores[1]!);
  });
});

describe('holding a 2-second note by strictness', () => {
  // key released after this share of the note → ok, short (let go too soon) or long (held too long)
  const table: [number, string, string, string][] = [
    [0.1, 'short', 'short', 'short'],
    [0.3, 'short', 'short', 'short'],
    [0.6, 'ok', 'short', 'short'],
    [0.8, 'ok', 'ok', 'short'],
    [0.95, 'ok', 'ok', 'ok'],
    [1, 'ok', 'ok', 'ok'],
    [1.2, 'ok', 'ok', 'ok'],
    [1.4, 'ok', 'ok', 'long'],
    [1.8, 'ok', 'long', 'long'],
    [2.2, 'long', 'long', 'long'],
  ];
  for (const mode of ['tempo', 'wait'] as const)
    for (const [share, ...verdicts] of table)
      LEVELS.forEach((level, k) => {
        it(`${mode}: released at ${share * 100} % on ${level} → ${verdicts[k]}`, () => {
          const s = setup(2, level, mode);
          s.update(at(4)); // wait mode stops here until the key comes
          s.noteOn(60, at(4));
          s.update(at(4) + 16);
          s.noteOff(60, at(4 + 2 * share));
          const got = s.state[0] === SHORT ? 'short' : s.long ? 'long' : 'ok';
          expect(got).toBe(verdicts[k]);
          const r = s.result(true);
          expect(r.short).toBe(got === 'short' ? 1 : 0);
          expect(r.long).toBe(got === 'long' ? 1 : 0);
          if (got === 'ok') expect(r.hold).toBe(1);
          else expect(r.hold!).toBeLessThan(1);
          if (got === 'short') expect(r.hold).toBeCloseTo(share, 1);
        });
      });

  it('never punishes an early release while the pedal is down', () => {
    for (const level of LEVELS) {
      const s = setup(2, level);
      s.pedalDown = true;
      s.noteOn(60, at(4));
      s.noteOff(60, at(4.2));
      expect(s.state[0]).toBe(HIT);
      expect(s.result(true).hold).toBe(1);
    }
  });

  it('does not judge a key that is never let go before the pass ends', () => {
    const s = setup(2, 'strict');
    s.noteOn(60, at(4));
    expect(s.result(true)).toMatchObject({ short: 0, long: 0, hold: 1 });
  });
});

/** 60 BPM (1 beat = 1 s); the given notes; hands 1 = left, 2 = right, 3 = both. */
function setupNotes(
  notes: SongFile['notes'],
  mode: 'tempo' | 'wait' = 'tempo',
  handMask = 3,
): PracticeSession {
  const file: SongFile = {
    format: 1,
    id: 't',
    version: 'original',
    title: 'T',
    composer: '',
    tempos: [{ b: 0, bpm: 60 }],
    measures: [0, 4, 8, 12].map((b, i) => ({ b, len: 4, num: 4, den: 4, n: String(i + 1) })),
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
  const session = new PracticeSession(song, transport);
  session.configure({ mode, handMask, range: null, loop: false, countIn: false }, 0);
  session.play(0);
  return session;
}

describe('one key, two hands (Clocks, Love Story, Interstellar)', () => {
  // both hands strike middle C together: right for half a beat, left for two beats
  const twins: SongFile['notes'] = [
    { p: 60, b: 4, d: 0.5, h: 'R' },
    { p: 60, b: 4, d: 2, h: 'L' },
  ];

  for (const mode of ['tempo', 'wait'] as const) {
    it(`${mode}: one press plays both notes; holding the key for the longer one is right`, () => {
      const s = setupNotes(twins, mode);
      s.update(at(4));
      s.noteOn(60, at(4));
      s.update(at(4) + 16);
      s.noteOff(60, at(6));
      s.update(at(9));
      const r = s.result(true);
      expect([...s.state]).toEqual([HIT, HIT]);
      expect(r).toMatchObject({ hits: 2, missed: 0, wrong: 0, short: 0, long: 0, hold: 1 });
    });
  }

  it('practising one hand: only that hand counts, judged by its own length', () => {
    const s = setupNotes(twins, 'tempo', 2); // right hand: half a beat
    s.noteOn(60, at(4));
    s.noteOff(60, at(4.5));
    s.update(at(9));
    expect(s.result(true)).toMatchObject({ hits: 1, missed: 0, short: 0, long: 0, hold: 1 });
  });

  it('letting go so the other hand can strike the same key again is not "too soon"', () => {
    // right hand holds A4 for 3 beats; the left hand strikes the same key after 1 beat
    const s = setupNotes([
      { p: 69, b: 4, d: 3, h: 'R' },
      { p: 69, b: 5, d: 0.5, h: 'L' },
    ]);
    s.noteOn(69, at(4));
    s.noteOff(69, at(4.9));
    s.noteOn(69, at(5));
    s.noteOff(69, at(5.5));
    s.update(at(9));
    expect([...s.state]).toEqual([HIT, HIT]);
    expect(s.result(true)).toMatchObject({ short: 0, long: 0, hold: 1 });
  });

  it('still says "too soon" when the key comes up long before the other hand needs it', () => {
    const s = setupNotes([
      { p: 69, b: 4, d: 3, h: 'R' },
      { p: 69, b: 6, d: 0.5, h: 'L' },
    ]);
    s.noteOn(69, at(4));
    s.noteOff(69, at(4.3));
    expect(s.state[0]).toBe(SHORT);
  });
});
