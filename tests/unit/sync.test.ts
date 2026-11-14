import { describe, expect, it } from 'vitest';
import {
  mergeStamped,
  missing,
  newer,
  pack,
  safeId,
  sumDays,
  unpack,
} from '../../src/sync/merge.ts';

describe('sync rules', () => {
  it('records only one side has go to the other', () => {
    expect(missing(['a', 'b', 'c'], ['b', 'd'])).toEqual({ here: ['d'], there: ['a', 'c'] });
    expect(missing([], [])).toEqual({ here: [], there: [] });
  });

  it.each([
    ['same on both', { x: { v: 'a', at: 5 } }, { x: { v: 'a', at: 5 } }, { x: 'a' }, false, false],
    ['only here', { x: { v: 'a', at: 5 } }, {}, { x: 'a' }, false, true],
    ['only there', {}, { x: { v: 'a', at: 5 } }, { x: 'a' }, true, false],
    [
      'theirs is later',
      { x: { v: 'a', at: 5 } },
      { x: { v: 'b', at: 9 } },
      { x: 'b' },
      true,
      false,
    ],
    ['mine is later', { x: { v: 'a', at: 9 } }, { x: { v: 'b', at: 5 } }, { x: 'a' }, false, true],
    [
      'a later removal beats an older link',
      { x: { v: '', at: 9 } },
      { x: { v: 'link', at: 5 } },
      { x: '' },
      false,
      true,
    ],
    [
      'each side has news',
      { x: { v: 'a', at: 9 }, y: { v: 'old', at: 1 } },
      { x: { v: 'b', at: 5 }, y: { v: 'new', at: 2 }, z: { v: 'c', at: 1 } },
      { x: 'a', y: 'new', z: 'c' },
      true,
      true,
    ],
  ])('later change wins per key: %s', (_n, mine, theirs, want, local, remote) => {
    const r = mergeStamped<string>(mine, theirs);
    expect(Object.fromEntries(Object.entries(r.merged).map(([k, e]) => [k, e.v]))).toEqual(want);
    expect([r.local, r.remote]).toEqual([local, remote]);
  });

  it('practice time adds up over devices', () => {
    expect(sumDays([{ a: 60, b: 30 }, { b: 90, c: 10 }, {}])).toEqual({ a: 60, b: 120, c: 10 });
  });

  it('the newer saved performance wins, per song', () => {
    expect(newer({ a: 5, b: 9, c: 1 }, { a: 7, b: 3, d: 2 })).toEqual({
      fetch: ['a', 'd'],
      send: ['b', 'c'],
    });
  });

  it('ids are safe for the cloud', () => {
    expect(safeId('ode-to-joy/original|both|123')).toBe('ode-to-joy~original|both|123');
  });

  it('a saved performance survives the trip bit for bit', () => {
    const value = {
      at: 123,
      r: { accuracy: 0.93, timing: null },
      snap: {
        mode: 'tempo',
        notes: Int32Array.from([0, 1, 70000]),
        state: Uint8Array.from([1, 2, 3, 255]),
        deviation: Float32Array.from([12.5, Number.NaN, -80]),
        releasedAt: Float64Array.from([1.23456789012345, Number.NaN]),
        recKey: new Uint8Array(70000).fill(7),
      },
    };
    const back = unpack<typeof value>(pack(value));
    expect(back.at).toBe(123);
    expect(back.r).toEqual(value.r);
    expect(back.snap.notes).toBeInstanceOf(Int32Array);
    expect([...back.snap.notes]).toEqual([0, 1, 70000]);
    expect([...back.snap.state]).toEqual([1, 2, 3, 255]);
    expect(back.snap.deviation).toBeInstanceOf(Float32Array);
    expect([...back.snap.deviation]).toEqual([12.5, Number.NaN, -80]);
    expect([...back.snap.releasedAt]).toEqual([1.23456789012345, Number.NaN]);
    expect(back.snap.recKey.length).toBe(70000);
    expect(back.snap.recKey.every((v) => v === 7)).toBe(true);
  });
});
