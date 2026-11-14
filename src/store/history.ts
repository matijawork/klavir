/**
 * History of finished passes per song. Kept in IndexedDB (database `klavir`, store `passes`) with
 * an in-memory copy, so reads stay synchronous. Older versions kept it in localStorage: that is
 * moved over once. Without IndexedDB (private window) localStorage is used as before.
 */
import { signal } from '@preact/signals';
import { type IDBPDatabase, openDB } from 'idb';

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

const OLD_KEY = 'klavir.history';
const DB = 'klavir';
const STORE = 'passes';
/** bumps on every change so views can subscribe */
export const historyVersion = signal(0);

type Store = Record<string, PassRecord[]>;
const cache: Store = {};
let db: IDBPDatabase | null = null;

function push(store: Store, song: string, rec: PassRecord): void {
  const list = store[song];
  if (list) list.push(rec);
  else store[song] = [rec];
}

function readOld(): Store {
  try {
    return JSON.parse(localStorage.getItem(OLD_KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

/** Puts records in front of whatever was added while loading. */
function merge(loaded: Store): void {
  for (const [song, list] of Object.entries(loaded))
    cache[song] = [...list, ...(cache[song] ?? [])].sort((a, b) => a.at - b.at);
  historyVersion.value++;
}

async function load(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    merge(readOld());
    return;
  }
  try {
    db = await openDB(DB, 1, {
      upgrade(d) {
        d.createObjectStore(STORE, { autoIncrement: true }).createIndex('song', 'song');
      },
    });
    const loaded: Store = {};
    for (const row of (await db.getAll(STORE)) as (PassRecord & { song: string })[]) {
      const { song, ...rec } = row;
      push(loaded, song, rec);
    }
    // one-time move from localStorage
    const old = readOld();
    const tx = db.transaction(STORE, 'readwrite');
    for (const [song, list] of Object.entries(old))
      for (const rec of list) {
        void tx.store.add({ song, ...rec });
        push(loaded, song, rec);
      }
    await tx.done;
    localStorage.removeItem(OLD_KEY);
    merge(loaded);
  } catch {
    db = null;
    merge(readOld());
  }
}

/** Resolves once the stored history is in memory. */
export const historyReady: Promise<void> = load();

export const passesOf = (song: string): PassRecord[] => cache[song] ?? [];

/** Best score of whole-song passes, or null. */
export function bestOf(song: string, whole = true): number | null {
  let best: number | null = null;
  for (const r of passesOf(song))
    if (r.whole === whole && (best === null || r.score > best)) best = r.score;
  return best;
}

export function addPass(song: string, rec: PassRecord): void {
  push(cache, song, rec);
  historyVersion.value++;
  // written only once the stored history is in, so nothing is saved twice
  void historyReady.then(() => {
    if (db)
      return db.add(STORE, { song, ...rec }).then(
        () => {},
        () => {},
      );
    try {
      localStorage.setItem(OLD_KEY, JSON.stringify(cache));
    } catch {
      /* storage full or unavailable: history just is not kept */
    }
  });
}
