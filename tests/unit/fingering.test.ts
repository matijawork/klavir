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

test('chords played all at once get the inversion fingering of pianoguidelessons', async () => {
  const { applyTriadFingering } = await import('../../scripts/lib/fingering.ts');
  const notes: SongNote[] = [
    // right hand: C major root position, first inversion, second inversion
    ...[60, 64, 67].map((p) => ({ p, b: 0, d: 1, h: 'R' as const })),
    ...[64, 67, 72].map((p) => ({ p, b: 1, d: 1, h: 'R' as const })),
    ...[67, 72, 76].map((p) => ({ p, b: 2, d: 1, h: 'R' as const })),
    // left hand: B flat minor second inversion (Clocks): F B♭ D♭
    ...[41, 46, 49].map((p) => ({ p, b: 0, d: 1, h: 'L' as const })),
    // not a triad: left alone
    ...[60, 62, 64].map((p) => ({ p, b: 3, d: 1, h: 'R' as const })),
  ];
  expect(applyTriadFingering(notes)).toBe(12);
  expect(notes.slice(0, 12).map((n) => n.f)).toEqual([1, 3, 5, 1, 2, 5, 1, 3, 5, 5, 2, 1]);
  expect(notes.slice(12).every((n) => n.f === undefined)).toBe(true);
});

test("Claude's map fingers a figure that keeps the hand in place, only where it fits", async () => {
  const { applyFingerMap } = await import('../../scripts/lib/fingering.ts');
  const riff = [74, 81, 74, 79, 74, 78, 74]; // D A D G D F♯ D (L'amour toujours)
  const notes: SongNote[] = [
    ...riff.map((p, k) => ({ p, b: k * 0.5, d: 0.5, h: 'R' as const })),
    ...[74, 76, 81, 83].map((p, k) => ({ p, b: 4 + k, d: 1, h: 'R' as const })), // has E and B
  ];
  const map = new Map([
    [2, 1],
    [9, 5],
    [7, 4],
    [6, 3],
  ]);
  const measures = [
    { b: 0, len: 4 },
    { b: 4, len: 4 },
  ];
  expect(applyFingerMap(notes, measures, 'R', map)).toBe(7);
  expect(notes.slice(0, 7).map((n) => n.f)).toEqual([1, 5, 1, 4, 1, 3, 1]);
  expect(notes[0]!.fs).toBe('claude');
  expect(notes[7]!.f).toBeUndefined();
});
