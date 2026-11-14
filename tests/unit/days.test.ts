import { describe, expect, it } from 'vitest';
import { calendar, dayKey, lastWeek, levelOf, playTime, streak } from '../../src/engine/days.ts';

/** Saturday 14 Nov 2026, 21:00 */
const now = new Date(2026, 10, 14, 21).getTime();
const day = (d: number) => dayKey(new Date(2026, 10, d, 9).getTime());

describe('practice days', () => {
  it('names days in local time', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });

  it.each([
    ['nothing played', {}, 0],
    ['only today', { [day(14)]: 600 }, 1],
    ['three days up to today', { [day(12)]: 600, [day(13)]: 90, [day(14)]: 60 }, 3],
    ['today not yet, two before', { [day(12)]: 600, [day(13)]: 600 }, 2],
    ['a gap breaks it', { [day(11)]: 600, [day(13)]: 600, [day(14)]: 600 }, 2],
    ['yesterday and today missing', { [day(12)]: 600 }, 0],
    ['a few seconds do not count', { [day(13)]: 600, [day(14)]: 20 }, 1],
  ])('streak: %s', (_n, seconds, want) => {
    expect(streak(seconds, now)).toBe(want);
  });

  it('streak runs across a month boundary', () => {
    const first = new Date(2026, 11, 1, 8).getTime();
    const s = { '2026-11-29': 600, '2026-11-30': 600, '2026-12-01': 600 };
    expect(streak(s, first)).toBe(3);
  });

  it('calendar: weeks as Monday-first columns, today in the last one, later days marked', () => {
    const cal = calendar({ [day(14)]: 1900, [day(9)]: 300, [day(2)]: 30 }, now, 3);
    expect(cal.map((w) => w.length)).toEqual([7, 7, 7]);
    expect(cal[0]![0]!.key).toBe('2026-10-26'); // a Monday
    expect(cal[2]![5]).toMatchObject({ key: '2026-11-14', level: 3, future: false });
    expect(cal[2]![6]).toMatchObject({ key: '2026-11-15', future: true });
    expect(cal[2]![0]).toMatchObject({ key: '2026-11-09', level: 1 });
    expect(cal[1]![0]).toMatchObject({ key: '2026-11-02', level: 0 });
  });

  it('levels and words', () => {
    expect([0, 59, 60, 599, 600, 1799, 1800].map(levelOf)).toEqual([0, 0, 1, 1, 2, 2, 3]);
    expect(playTime(1500)).toBe('25 min');
    expect(playTime(3900)).toBe('1 h 05 min');
    expect(lastWeek({ [day(14)]: 600, [day(8)]: 300, [day(7)]: 999 }, now)).toBe(900);
  });
});
