/** Local history of finished passes per song (localStorage; small records, capped). */
import { signal } from '@preact/signals';

export interface PassRecord {
  /** Date.now() */
  at: number;
  /** 0..100 */
  score: number;
  mode: 'wait' | 'tempo';
  hands: 'both' | 'L' | 'R';
  speed: number;
  strict: 'easy' | 'normal' | 'strict';
  /** the whole song, not a section */
  whole: boolean;
}

const KEY = 'klavir.history';
const CAP = 100;
/** bumps on every change so views can subscribe */
export const historyVersion = signal(0);

type Store = Record<string, PassRecord[]>;
let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    cache = {};
  }
  return cache;
}

export const passesOf = (song: string): PassRecord[] => load()[song] ?? [];

/** Best score of whole-song passes, or null. */
export function bestOf(song: string, whole = true): number | null {
  let best: number | null = null;
  for (const r of passesOf(song))
    if (r.whole === whole && (best === null || r.score > best)) best = r.score;
  return best;
}

export function addPass(song: string, rec: PassRecord): void {
  const store = load();
  const list = store[song] ?? [];
  list.push(rec);
  store[song] = list.slice(-CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full or unavailable: history just is not kept */
  }
  historyVersion.value++;
}
