/**
 * Seconds played per day (practice and performances). Each device counts only its own playing
 * (`klavir.days`); what other devices counted arrives through sync (`klavir.days.others`) and the
 * two are added up for display.
 */
import { computed, signal } from '@preact/signals';
import { dayKey } from '../engine/days.ts';
import { sumDays } from '../sync/merge.ts';
import { changed } from '../sync/notify.ts';

const KEY = 'klavir.days';
const OTHERS = 'klavir.days.others';
type Days = Record<string, number>;

function load(key: string): Days {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Days;
  } catch {
    return {};
  }
}
function save(key: string, value: Days): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not kept */
  }
}

/** this device's own count */
export const ownDays = signal<Days>(load(KEY));
const others = signal<Days>(load(OTHERS));
/** day key → seconds, all devices together */
export const days = computed(() => sumDays([ownDays.value, others.value]));

export function setOtherDays(value: Days): void {
  others.value = value;
  save(OTHERS, value);
}

/** Adds playing time to the day it happened on. */
export function addPlayTime(seconds: number, at: number = Date.now()): void {
  if (seconds <= 0) return;
  const key = dayKey(at);
  // re-read so a second tab does not overwrite what this one cannot see
  const all = { ...load(KEY) };
  all[key] = Math.round((all[key] ?? 0) + seconds);
  ownDays.value = all;
  save(KEY, all);
  changed();
}
