import { describe, expect, it } from 'vitest';
import { chordsOf, triadOf } from '../../scripts/lib/chords.ts';
import {
  chordName,
  keyFitsSignature,
  parseChord,
  parseKey,
  prettyChord,
} from '../../src/engine/harmony.ts';
import type { SongFile } from '../../src/engine/song.ts';

/** weights per pitch class from note names, e.g. "A C E" */
const w = (...pcs: number[]) => {
  const out = new Array<number>(12).fill(0);
  for (const pc of pcs) out[pc]! += 1;
  return out;
};
const aMinor = { tonic: 9, minor: true };

describe('triadOf', () => {
  it('finds major and minor triads, root from the bass', () => {
    expect(triadOf(w(9, 0, 4), 9, aMinor)).toEqual({ root: 9, minor: true }); // A C E
    expect(triadOf(w(0, 4, 7), 0, aMinor)).toEqual({ root: 0, minor: false }); // C E G
  });
  it('lets a melody note pass but not too many', () => {
    expect(triadOf(w(10, 1, 5, 3), 10, aMinor)).toEqual({ root: 10, minor: true }); // Bbm + Eb
    expect(triadOf(w(0, 2, 4, 5, 7, 9, 11), 0, aMinor)).toBeNull(); // a scale is no chord
  });
  it('an open fifth takes the key chord: E-B in A minor is E minor, C-G in A minor is C major', () => {
    expect(triadOf(w(4, 11), 11, aMinor)).toEqual({ root: 4, minor: true });
    expect(triadOf(w(0, 7), 0, aMinor)).toEqual({ root: 0, minor: false });
  });
  it('root and third without the fifth is not a chord (Interstellar: B D E C is not B minor)', () => {
    expect(triadOf(w(11, 2, 4, 0), 2, aMinor)).toBeNull();
  });
});

describe('chordsOf', () => {
  it('counts one chord per measure, most used first, leaves out what appears twice or less', () => {
    const measures = Array.from({ length: 8 }, (_, i) => ({
      b: i * 4,
      len: 4,
      num: 4,
      den: 4,
      n: String(i + 1),
    }));
    // A minor 3 times, F 3 times, C twice (too few: left out)
    const chord = (b: number, ps: number[]) => ps.map((p) => ({ p, b, d: 4, h: 'L' as const }));
    const notes = [
      ...chord(0, [45, 48, 52]),
      ...chord(4, [45, 48, 52]),
      ...chord(8, [41, 45, 48]),
      ...chord(12, [45, 48, 52]),
      ...chord(16, [41, 45, 48]),
      ...chord(20, [48, 52, 55]),
      ...chord(24, [48, 52, 55]),
      ...chord(28, [41, 45, 48]),
    ];
    const song = { measures, notes } as unknown as SongFile;
    expect(chordsOf(song, aMinor)).toEqual([
      { root: 9, minor: true, count: 3, left: { style: 'block', tones: [9, 0, 4] } },
      { root: 5, minor: false, count: 3, left: { style: 'block', tones: [5, 9, 0] } },
    ]);
  });
});

describe('how a hand plays a chord', () => {
  const measures = [0, 4, 8].map((b, i) => ({ b, len: 4, num: 4, den: 4, n: String(i + 1) }));
  it('one note after another, in the position it starts from (Clocks: G–B♭–E♭ is first inversion)', () => {
    // E♭ major broken downwards in the right hand, held E♭ in the left, three measures
    const notes = measures.flatMap((m) => [
      { p: 39, b: m.b, d: 4, h: 'L' as const },
      ...[75, 70, 67, 75, 70, 67, 75, 70].map((p, k) => ({
        p,
        b: m.b + k * 0.5,
        d: 0.5,
        h: 'R' as const,
      })),
    ]);
    const [chord] = chordsOf({ measures, notes } as unknown as SongFile, {
      tonic: 8,
      minor: false,
    });
    expect(chord).toEqual({
      root: 3,
      minor: false,
      count: 3,
      right: { style: 'broken', tones: [7, 10, 3] },
      left: { style: 'single', tones: [3] },
    });
  });
  it('a hand playing mostly other notes plays the melody', () => {
    const notes = measures.flatMap((m) => [
      ...[45, 48, 52].map((p) => ({ p, b: m.b, d: 4, h: 'L' as const })),
      ...[74, 76, 77, 79, 81].map((p, k) => ({ p, b: m.b + k * 0.5, d: 0.5, h: 'R' as const })),
    ]);
    const [chord] = chordsOf({ measures, notes } as unknown as SongFile, aMinor);
    expect(chord!.right).toEqual({ style: 'melody', tones: [4, 9] });
  });
  it('a right hand on one chord note among others plays the melody; a left hand plays the bass', () => {
    // A♭ major (Love Story): left A♭–E♭ together, right B♭ then C, three measures
    const notes = measures.flatMap((m) => [
      { p: 44, b: m.b, d: 4, h: 'L' as const },
      { p: 51, b: m.b, d: 4, h: 'L' as const },
      { p: 70, b: m.b, d: 2, h: 'R' as const },
      { p: 72, b: m.b + 2, d: 2, h: 'R' as const },
    ]);
    const [chord] = chordsOf({ measures, notes } as unknown as SongFile, {
      tonic: 10,
      minor: true,
    });
    expect(chord).toMatchObject({ root: 8, minor: false, right: { style: 'melody' } });
    expect(chord!.left).toEqual({ style: 'block', tones: [8, 3] });
    // the left hand with a passing note is still the bass note
    const bass = measures.flatMap((m) => [
      { p: 44, b: m.b, d: 3, h: 'L' as const },
      { p: 46, b: m.b + 3, d: 1, h: 'L' as const },
      ...[68, 72, 75].map((p) => ({ p, b: m.b, d: 4, h: 'R' as const })),
    ]);
    expect(
      chordsOf({ measures, notes: bass } as unknown as SongFile, { tonic: 8, minor: false })[0]!
        .left,
    ).toEqual({ style: 'single', tones: [8] });
  });
});

describe('chord and key names', () => {
  it('reads chart spellings', () => {
    expect(parseChord('Gbmaj7')).toEqual({ root: 6, minor: false });
    expect(parseChord('Bbm')).toEqual({ root: 10, minor: true });
    expect(parseChord('F#')).toEqual({ root: 6, minor: false });
    expect(parseChord('Em7')).toEqual({ root: 4, minor: true });
    expect(parseChord('H')).toBeNull();
    expect(parseKey('A♭ major')).toEqual({ tonic: 8, minor: false });
    expect(parseKey('Bb minor')).toEqual({ tonic: 10, minor: true });
    expect(prettyChord('Gbmaj7')).toBe('G♭maj7');
    expect(chordName({ root: 6, minor: false }, true)).toBe('G♭ major');
    expect(chordName({ root: 6, minor: true }, false)).toBe('F♯ minor');
  });
  it('checks a named key against the key signature', () => {
    expect(keyFitsSignature({ tonic: 8, minor: false }, -4)).toBe(true); // A♭ major, 4 flats
    expect(keyFitsSignature({ tonic: 10, minor: true }, -4)).toBe(false); // B♭ minor needs 5
    expect(keyFitsSignature({ tonic: 9, minor: true }, 0)).toBe(true);
  });
});
