/** Seconds played per day (practice and performances), in localStorage as `klavir.days`. */
import { signal } from '@preact/signals';
import { dayKey } from '../engine/days.ts';

const KEY = 'klavir.days';

function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** day key → seconds */
export const days = signal<Record<string, number>>(load());

/** Adds playing time to the day it happened on. */
export function addPlayTime(seconds: number, at: number = Date.now()): void {
  if (seconds <= 0) return;
  const key = dayKey(at);
  // re-read so a second tab does not overwrite what this one cannot see
  const all = { ...load() };
  all[key] = Math.round((all[key] ?? 0) + seconds);
  days.value = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* not kept */
  }
}
