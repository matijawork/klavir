import { expect, test } from 'vitest';
import { autoFinger, measurePedal } from '../../scripts/lib/fingering.ts';
import type { SongNote } from '../../src/engine/song.ts';

const line = (pitches: number[], h: 'L' | 'R'): SongNote[] =>
  pitches.map((p, i) => ({ p, b: i, d: 1, h }));

test('five-finger melody stays in one hand position', () => {
  const notes = line([64, 64, 65, 67, 67, 65, 64, 62, 60], 'R');
  autoFinger(notes);
  expect(notes.map((n) => n.f)).toEqual([3, 3, 4, 5, 5, 4, 3, 2, 1]);
  expect(notes.every((n) => n.fs === 'claude')).toBe(true);
});

test('an octave scale passes the thumb and never repeats a finger on a new key', () => {
  const notes = line([60, 62, 64, 65, 67, 69, 71, 72], 'R');
  autoFinger(notes);
  const f = notes.map((n) => n.f!);
  for (let i = 1; i < f.length; i++) expect(f[i]).not.toBe(f[i - 1]);
  expect(f.filter((x) => x === 1).length).toBeGreaterThanOrEqual(2);
});

test('left-hand chord gets the thumb on top, and held keys keep their finger', () => {
  const notes: SongNote[] = [
    { p: 48, b: 0, d: 2, h: 'L' },
    { p: 52, b: 0, d: 2, h: 'L' },
    { p: 55, b: 0, d: 2, h: 'L' },
  ];
  autoFinger(notes);
  expect(notes.map((n) => n.f)).toEqual([5, 3, 1]);
});

test('measure pedal releases on each barline and presses just after', () => {
  const ped = measurePedal(
    [
      { b: 0, len: 3 },
      { b: 3, len: 3 },
    ],
    line([60, 62, 64, 65], 'R'),
  );
  expect(ped).toEqual([
    { b: 0.25, on: true },
    { b: 3, on: false },
    { b: 3.25, on: true },
    { b: 6, on: false },
  ]);
});
