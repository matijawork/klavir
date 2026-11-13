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
      return s.result(true, 9000).accuracy;
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
          const r = s.result(true, 12000);
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
      expect(s.result(true, 9000).hold).toBe(1);
    }
  });

  it('does not judge a key that is never let go before the pass ends', () => {
    const s = setup(2, 'strict');
    s.noteOn(60, at(4));
    expect(s.result(true, 9000)).toMatchObject({ short: 0, long: 0, hold: 1 });
  });
});
