import { describe, expect, it } from 'vitest';
import { buildExercise, EXERCISES, keyName, tonicOf } from '../../src/engine/exercises.ts';
import { calibrationHint, feedback } from '../../src/engine/feedback.ts';
import { hitWindowMs, type PassResult, PracticeSession, SHORT } from '../../src/engine/session.ts';
import { loadSong } from '../../src/engine/song.ts';
import { Transport } from '../../src/engine/transport.ts';

const result = (over: Partial<PassResult>): PassResult => ({
  expected: 20,
  judged: 20,
  hits: 20,
  missed: 0,
  wrong: 0,
  short: 0,
  early: 0,
  late: 0,
  notes: 1,
  timing: 1,
  hold: 1,
  meanDeviation: 0,
  long: 0,
  medianDeviation: 0,
  spread: 10,
  weak: null,
  accuracy: 1,
  seconds: 10,
  ...over,
});
const ctx = { mode: 'tempo', speed: 1, metronome: false } as const;

describe('feedback', () => {
  it('praises a clean pass and suggests the next step', () => {
    const f = feedback(result({}), { ...ctx, speed: 0.6 });
    expect(f.verdict).toBe('Excellent');
    expect(f.tips).toEqual(['Clean pass. Raise the speed a little.']);
  });

  it('names lateness and early releases, biggest problem first', () => {
    const f = feedback(result({ late: 12, short: 2, medianDeviation: 140, accuracy: 0.72 }), ctx);
    expect(f.verdict).toBe('Good');
    expect(f.tips[0]).toContain('after the beat on 12 notes (about 140 ms)');
    expect(f.tips[1]).toContain('let go of 2 notes too soon');
  });

  it('tells a rusher, a wobbly rhythm, skipped notes and wrong keys apart', () => {
    expect(feedback(result({ early: 9, late: 1 }), ctx).tips[0]).toContain('You rush');
    expect(feedback(result({ early: 4, late: 5 }), ctx).tips[0]).toContain('Turn on the metronome');
    const f = feedback(result({ hits: 10, missed: 10, wrong: 3, accuracy: 0.4 }), ctx);
    expect(f.verdict).toBe('Keep practising');
    expect(f.tips[0]).toContain('Slow down to 80 %');
    expect(f.tips[1]).toContain('3 wrong keys');
  });

  it('suggests compensating only for a steady, sizeable offset', () => {
    expect(calibrationHint(result({ medianDeviation: 62, spread: 20 }))).toBe(60);
    expect(calibrationHint(result({ medianDeviation: 62, spread: 90 }))).toBeNull();
    expect(calibrationHint(result({ medianDeviation: 12, spread: 10 }))).toBeNull();
    expect(calibrationHint(result({ medianDeviation: 62, spread: 20, hits: 3 }))).toBeNull();
  });
});

describe('strictness, offset and over-holding', () => {
  const make = () => {
    const file = buildExercise('five-finger', 0);
    const song = loadSong(file);
    const transport = new Transport();
    transport.duration = song.duration;
    const session = new PracticeSession(song, transport);
    session.configure({ mode: 'tempo', handMask: 2, range: null, loop: false, countIn: false }, 0);
    // sorted by time then pitch: note 0 is the left hand's, note 1 the right hand's first C
    return { session, song };
  };
  /** wall ms of song second t (lead-in 1 s) */
  const at = (t: number) => (t + 1) * 1000;

  it('has wider windows on Easy and tighter on Strict', () => {
    expect(hitWindowMs(60, 1, 'easy')).toBe(200);
    expect(hitWindowMs(60, 1, 'normal')).toBe(120);
    expect(hitWindowMs(60, 1, 'strict')).toBe(60);
  });

  it('judges the same early release by the chosen strictness', () => {
    for (const [strictness, state] of [
      ['easy', 1],
      ['strict', SHORT],
    ] as const) {
      const { session, song } = make();
      session.strictness = strictness;
      session.play(0);
      const len = song.end[1]! - song.start[1]!;
      session.noteOn(60, at(0));
      session.noteOff(60, at(len * 0.6)); // 40 % of the note left
      expect(session.state[1]).toBe(state);
    }
  });

  it('takes the calibrated delay out of the timing', () => {
    const { session } = make();
    session.offsetMs = 150;
    session.play(0);
    session.noteOn(60, at(0) + 150);
    expect(session.deviation[1]).toBeCloseTo(0);
    expect(session.timing[1]).toBe(1);
  });

  it('counts a key held far past the end of its note', () => {
    const { session, song } = make();
    session.play(0);
    session.noteOn(60, at(0));
    session.noteOff(60, at(song.end[1]! + 1));
    expect(session.long).toBe(1);
    expect(session.hold[1]).toBe(0.5);
    expect(session.result(false, 5000).long).toBe(1);
  });
});

describe('exercises', () => {
  it('builds every exercise in every key inside the keyboard, in time order', () => {
    for (const e of EXERCISES)
      for (let pc = 0; pc < 12; pc++) {
        const f = buildExercise(e.kind, pc);
        expect(f.notes.length).toBeGreaterThan(10);
        for (const n of f.notes) {
          expect(n.p).toBeGreaterThanOrEqual(21);
          expect(n.p).toBeLessThanOrEqual(108);
        }
        expect(f.measures.length * 4).toBeGreaterThanOrEqual(
          Math.max(...f.notes.map((n) => n.b + n.d)),
        );
        expect(loadSong(f).count).toBe(f.notes.length);
      }
  });

  it('fingers the C major scale the standard way', () => {
    const f = buildExercise('scale-major', 0);
    const up = (h: string) => f.notes.filter((n) => n.h === h).slice(0, 15);
    expect(
      up('R')
        .map((n) => n.f)
        .join(''),
    ).toBe('123123412312345');
    expect(
      up('L')
        .map((n) => n.f)
        .join(''),
    ).toBe('543213214321321');
    expect(
      up('R')
        .map((n) => n.p)
        .slice(0, 8),
    ).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it('fingers B flat and F sharp major with thumbs off the black keys', () => {
    const black = [1, 3, 6, 8, 10];
    for (const pc of [1, 3, 6, 8, 10])
      for (const n of buildExercise('scale-major', pc).notes)
        if (n.f === 1) expect(black).not.toContain(n.p % 12);
  });

  it('leaves uncertain fingerings out and names keys', () => {
    expect(buildExercise('scale-minor', 1).notes.every((n) => n.f === undefined)).toBe(true);
    expect(buildExercise('scale-minor', 9).notes.every((n) => n.f !== undefined)).toBe(true);
    expect(buildExercise('scale-minor', 9).notes.filter((n) => n.h === 'R')[6]!.p % 12).toBe(8);
    expect(keyName(6)).toBe('F♯');
    expect(tonicOf(1, false)).toBe(7);
    expect(tonicOf(0, true)).toBe(9);
  });
});
