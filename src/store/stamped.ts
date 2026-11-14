/**
 * A small "key → value" store in localStorage where every entry remembers when it was changed,
 * so two devices can be merged: the later change wins (see sync/merge.ts).
 */
import { type Signal, signal } from '@preact/signals';
import type { StampedMap } from '../sync/merge.ts';
import { changed } from '../sync/notify.ts';

export interface StampedStore<T> {
  map: Signal<StampedMap<T>>;
  set(id: string, value: T): void;
  /** replaces everything (after a merge with another device) */
  replace(next: StampedMap<T>): void;
}

export function stampedStore<T>(key: string, old?: () => StampedMap<T> | null): StampedStore<T> {
  const write = (m: StampedMap<T>): void => {
    try {
      localStorage.setItem(key, JSON.stringify(m));
    } catch {
      /* not remembered */
    }
  };
  let start: StampedMap<T> = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) start = JSON.parse(raw) as StampedMap<T>;
    else {
      // data from before entries had a time: taken over once, as "very old" so any real change wins
      const before = old?.();
      if (before) {
        start = before;
        write(start);
      }
    }
  } catch {
    /* unreadable: start empty */
  }
  const map = signal(start);
  return {
    map,
    set(id, value) {
      map.value = { ...map.value, [id]: { v: value, at: Date.now() } };
      write(map.value);
      changed();
    },
    replace(next) {
      map.value = next;
      write(next);
    },
  };
}
