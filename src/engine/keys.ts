/** 88-key piano geometry in normalized units: the keyboard spans x = 0..1. */
export const LOW = 21;
export const HIGH = 108;
export const WHITE_COUNT = 52;

const BLACK_PC = [false, true, false, true, false, false, true, false, true, false, true, false];
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const isBlack = (pitch: number): boolean => BLACK_PC[pitch % 12]!;

/** "C4", "F♯3" — middle C (60) is C4 */
export const noteName = (pitch: number, octave = true): string =>
  NAMES[pitch % 12]! + (octave ? Math.floor(pitch / 12) - 1 : '');

export const WHITE_W = 1 / WHITE_COUNT;
export const BLACK_W = WHITE_W * 0.58;

/** Left edge and width of every key, indexed by MIDI pitch. */
export const keyX = new Float32Array(128);
export const keyW = new Float32Array(128);

{
  let white = 0;
  for (let p = LOW; p <= HIGH; p++) {
    if (isBlack(p)) {
      keyX[p] = white * WHITE_W - BLACK_W / 2;
      keyW[p] = BLACK_W;
    } else {
      keyX[p] = white * WHITE_W;
      keyW[p] = WHITE_W;
      white++;
    }
  }
}
