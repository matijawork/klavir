import { describe, expect, it } from 'vitest';
import { guessMode } from '../../scripts/lib/key.ts';
import { compareWithReference } from '../../scripts/lib/reference.ts';
import type { SongFile, SongNote } from '../../src/engine/song.ts';

const song = (notes: SongNote[], bpm = 120): SongFile => ({
  format: 1,
  id: 't',
  version: 'original',
  title: 't',
  composer: '',
  tempos: [{ b: 0, bpm }],
  measures: [],
  notes,
  pedal: [],
  pedalSource: null,
  keys: [],
  sections: [],
  handsFromPitchSplit: false,
  warnings: [],
});
const n = (p: number, b: number, h: 'L' | 'R' = 'R', d = 1): SongNote => ({ p, b, d, h });

describe('compareWithReference', () => {
  const score = song([n(48, 0, 'L'), n(60, 0), n(64, 1), n(67, 2)]);

  it('matches every note of an identical file', () => {
    expect(compareWithReference(score, song([...score.notes]))).toMatchObject({
      of: 4,
      matched: 4,
      twins: 0,
      extra: 0,
      otherHand: 0,
    });
  });

  it('finds a wrong key, a missing note and an extra one', () => {
    const midi = song([n(48, 0, 'L'), n(60, 0), n(65, 1), n(72, 3)]);
    expect(compareWithReference(score, midi)).toMatchObject({ matched: 2, extra: 2 });
  });

  it('notices a different tempo: same beats, other moments', () => {
    expect(compareWithReference(score, song([...score.notes], 100)).matched).toBe(2);
  });

  it('explains a note missing because both hands strike the same key together', () => {
    const both = song([n(60, 0, 'L'), n(60, 0, 'R'), n(64, 1)]);
    const midi = song([n(60, 0, 'R'), n(64, 1)]);
    expect(compareWithReference(both, midi)).toMatchObject({
      of: 3,
      matched: 2,
      twins: 1,
      extra: 0,
      otherHand: 0,
    });
  });
});

describe('guessMode', () => {
  // the same key signature (no sharps or flats), two different pieces
  const cMajor = [60, 64, 67, 72, 62, 65, 69, 71, 60, 67, 64, 60].map((p, i) => n(p, i));
  const aMinor = [57, 60, 64, 69, 59, 62, 64, 68, 69, 57, 64, 57].map((p, i) => n(p, i));

  it('tells C major from A minor', () => {
    expect(guessMode(cMajor, 0)).toBe('major');
    expect(guessMode(aMinor, 0)).toBe('minor');
  });

  it('works in other key signatures (four flats: A flat major or F minor)', () => {
    expect(
      guessMode(
        cMajor.map((x) => ({ ...x, p: x.p + 8 })),
        -4,
      ),
    ).toBe('major');
    expect(
      guessMode(
        aMinor.map((x) => ({ ...x, p: x.p + 8 })),
        -4,
      ),
    ).toBe('minor');
  });
});
