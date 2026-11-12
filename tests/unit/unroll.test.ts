import { describe, expect, it } from 'vitest';
import { type MeasureFlow, unrollMeasures } from '../../scripts/lib/unroll.ts';

const flow = (n: number, marks: Record<number, MeasureFlow>): MeasureFlow[] =>
  Array.from({ length: n }, (_, i) => marks[i] ?? {});

describe('unrollMeasures', () => {
  it('plays straight through without marks', () => {
    expect(unrollMeasures(flow(3, {}))).toEqual([0, 1, 2]);
  });

  it('repeats from the start when there is no forward repeat', () => {
    expect(unrollMeasures(flow(3, { 1: { repeatEnd: 2 } }))).toEqual([0, 1, 0, 1, 2]);
  });

  it('repeats from the forward repeat', () => {
    expect(unrollMeasures(flow(4, { 1: { repeatStart: true }, 2: { repeatEnd: 2 } }))).toEqual([
      0, 1, 2, 1, 2, 3,
    ]);
  });

  it('honours the times attribute', () => {
    expect(unrollMeasures(flow(2, { 0: { repeatEnd: 3 } }))).toEqual([0, 0, 0, 1]);
  });

  it('handles first and second endings', () => {
    const f = flow(4, { 1: { endings: [1], repeatEnd: 2 }, 2: { endings: [2] } });
    expect(unrollMeasures(f)).toEqual([0, 1, 0, 2, 3]);
  });

  it('handles two repeated sections in a row, each with voltas', () => {
    const f = flow(8, {
      1: { endings: [1], repeatEnd: 2 },
      2: { endings: [2] },
      3: { repeatStart: true },
      5: { endings: [1], repeatEnd: 2 },
      6: { endings: [2] },
    });
    expect(unrollMeasures(f)).toEqual([0, 1, 0, 2, 3, 4, 5, 3, 4, 6, 7]);
  });

  it('handles a multi-measure volta', () => {
    const f = flow(5, {
      1: { endings: [1] },
      2: { endings: [1], repeatEnd: 2 },
      3: { endings: [2] },
    });
    expect(unrollMeasures(f)).toEqual([0, 1, 2, 0, 3, 4]);
  });

  it('D.C. al Fine: no repeats after the jump, stops at Fine', () => {
    const f = flow(4, { 0: { repeatEnd: 2 }, 1: { fine: true }, 3: { daCapo: true } });
    expect(unrollMeasures(f)).toEqual([0, 0, 1, 2, 3, 0, 1]);
  });

  it('D.S. al Coda', () => {
    const f = flow(6, {
      1: { segno: true },
      2: { toCoda: true },
      3: { dalSegno: true },
      5: { coda: true },
    });
    expect(unrollMeasures(f)).toEqual([0, 1, 2, 3, 1, 2, 5]);
  });

  it('takes the last volta after a D.C.', () => {
    const f = flow(4, {
      1: { endings: [1], repeatEnd: 2 },
      2: { endings: [2] },
      3: { daCapo: true },
    });
    expect(unrollMeasures(f)).toEqual([0, 1, 0, 2, 3, 0, 2, 3]);
  });

  it('fails loudly on a jump without target', () => {
    expect(() => unrollMeasures(flow(2, { 1: { dalSegno: true } }))).toThrow(/segno/);
  });
});
