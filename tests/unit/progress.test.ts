import { describe, expect, it } from 'vitest';
import { dailyScores } from '../../src/engine/progress.ts';

const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime();

describe('progress per day', () => {
  it('keeps the best pass of every day, oldest day first', () => {
    const days = dailyScores([
      { at: at(12, 20), score: 70, speed: 0.6 },
      { at: at(10, 9), score: 40, speed: 0.5 },
      { at: at(12, 8), score: 55, speed: 0.6 },
      { at: at(10, 23), score: 62, speed: 0.5 },
      { at: at(12, 21), score: 64, speed: 0.8 },
    ]);
    expect(days).toEqual([
      { day: at(10, 0), best: 62, speed: 0.5, passes: 2 },
      { day: at(12, 0), best: 70, speed: 0.6, passes: 3 },
    ]);
  });
  it('no passes, no days', () => {
    expect(dailyScores([])).toEqual([]);
  });
});
