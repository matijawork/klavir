import { describe, expect, it } from 'vitest';
import { CAL_CLICKS, CAL_PERIOD_MS, measureDelay } from '../../src/engine/calibration.ts';

const clicks = Array.from({ length: CAL_CLICKS }, (_, k) => 1000 + k * CAL_PERIOD_MS);
/** small repeatable wobble, -1..1 */
const wobble = (k: number): number => Math.sin(k * 12.9898) * 0.999;

describe('click-along calibration', () => {
  const cases: [string, (c: number, k: number) => number | null, number | 'few' | 'uneven'][] = [
    ['taps exactly on the click', (c) => c, 0],
    ['steady 40 ms late', (c) => c + 40, 40],
    ['steady 60 ms early', (c) => c - 60, -60],
    ['late with a human wobble of ±15 ms', (c, k) => c + 50 + wobble(k) * 15, 50],
    ['one slip far off is ignored', (c, k) => c + 30 + (k === 9 ? 220 : 0), 30],
    ['a few skipped clicks still measure', (c, k) => (k % 4 === 1 ? null : c + 35), 35],
    ['more than the slider allows is clamped', (c) => c + 240, 150],
    ['only three taps', (c, k) => (k > 6 && k < 10 ? c + 40 : null), 'few'],
    ['no taps at all', () => null, 'few'],
    ['taps all over the place', (c, k) => c + wobble(k) * 250, 'uneven'],
  ];
  it.each(cases)('%s', (_name, tap, want) => {
    const taps = clicks.map(tap).filter((t): t is number => t !== null);
    const r = measureDelay(clicks, taps);
    if (typeof want === 'number') {
      expect(r.problem).toBeNull();
      expect(r.ms).toBe(want);
    } else expect(r.problem).toBe(want);
  });

  it('ignores the first clicks, where the player is still finding the pulse', () => {
    const taps = clicks.map((c, k) => c + (k < 4 ? 200 : 20));
    expect(measureDelay(clicks, taps)).toMatchObject({ ms: 20, used: 16, problem: null });
  });

  it('a double press on one click counts once', () => {
    const taps = clicks.flatMap((c) => [c + 25, c + 140]);
    expect(measureDelay(clicks, taps)).toMatchObject({ ms: 25, used: 16, problem: null });
  });
});
