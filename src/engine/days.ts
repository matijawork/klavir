/** Practice days: day keys, streaks and the calendar grid. Pure, no DOM. */

/** "2026-11-14" in local time */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const two = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** Local noon of the day `n` days before the day of `ms` (noon keeps clock changes out of it). */
function daysBefore(ms: number, n: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 12).getTime();
}

/** A day counts as practised from this many seconds of playing. */
export const DAY_MIN_SECONDS = 60;

/**
 * Days in a row with practice, ending today, or yesterday when today has none yet (so the streak
 * is not shown as lost in the morning).
 */
export function streak(seconds: Record<string, number>, now: number): number {
  const played = (n: number) => (seconds[dayKey(daysBefore(now, n))] ?? 0) >= DAY_MIN_SECONDS;
  let n = played(0) ? 0 : 1;
  let count = 0;
  while (played(n)) {
    count++;
    n++;
  }
  return count;
}

export interface CalendarDay {
  key: string;
  /** local noon */
  at: number;
  seconds: number;
  /** 0 none, 1 a little, 2 a good session, 3 a long one */
  level: 0 | 1 | 2 | 3;
  /** after today: drawn empty */
  future: boolean;
}

export const levelOf = (seconds: number): 0 | 1 | 2 | 3 =>
  seconds < DAY_MIN_SECONDS ? 0 : seconds < 10 * 60 ? 1 : seconds < 30 * 60 ? 2 : 3;

/** The last `weeks` weeks as columns of seven days, Monday first; the last column holds today. */
export function calendar(
  seconds: Record<string, number>,
  now: number,
  weeks: number,
): CalendarDay[][] {
  const weekday = (new Date(now).getDay() + 6) % 7; // Monday = 0
  const out: CalendarDay[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const back = w * 7 + weekday - d;
      const at = daysBefore(now, back);
      const key = dayKey(at);
      const s = seconds[key] ?? 0;
      col.push({ key, at, seconds: s, level: levelOf(s), future: back < 0 });
    }
    out.push(col);
  }
  return out;
}

/** Seconds played in the last seven days, today included. */
export function lastWeek(seconds: Record<string, number>, now: number): number {
  let sum = 0;
  for (let n = 0; n < 7; n++) sum += seconds[dayKey(daysBefore(now, n))] ?? 0;
  return sum;
}

/** "25 min", "1 h 05 min" */
export function playTime(seconds: number): string {
  const min = Math.round(seconds / 60);
  return min < 60
    ? `${min} min`
    : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
