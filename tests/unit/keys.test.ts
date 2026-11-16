import { expect, it } from 'vitest';
import { noteName, usesFlats } from '../../src/engine/keys.ts';

it('names black keys as flats in flat keys, sharps otherwise', () => {
  expect(noteName(70)).toBe('A♯4');
  expect(noteName(70, true, true)).toBe('B♭4');
  expect(noteName(61, false, true)).toBe('D♭');
  expect(noteName(60, true, true)).toBe('C4');
  expect(usesFlats([{ fifths: -5 }])).toBe(true); // B flat minor
  expect(usesFlats([{ fifths: 2 }])).toBe(false);
  expect(usesFlats([])).toBe(false);
});
