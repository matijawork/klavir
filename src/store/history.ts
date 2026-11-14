/**
 * Scores of performances per song: whole piece, full speed, Tempo mode, no stopping (the Perform
 * button). Practice is never kept. Stored in IndexedDB (database `klavir`, store `performances`)
 * with an in-memory copy so reads stay synchronous; localStorage is the fallback without IndexedDB.
 * Records of the older practice history (store `passes`, key `klavir.history`) are deleted: Matija
 * asked for that on 2026-11-14.
 */
import { signal } from '@preact/signals';
import { type IDBPDatabase, openDB } from 'idb';

export interface PerfRecord {
  /** Date.now() */
  at: number;
  /** 0..100 */
  score: number;
}

const OLD_KEY = 'klavir.history';
const FALLBACK_KEY = 'klavir.performances';
const DB = 'klavir';
const STORE = 'performances';
/** bumps on every change so views can subscribe */
export const historyVersion = signal(0);

type Store = Record<string, PerfRecord[]>;
const cache: Store = {};
let db: IDBPDatabase | null = null;

function push(store: Store, song: string, rec: PerfRecord): void {
  const list = store[song];
  if (list) list.push(rec);
  else store[song] = [rec];
}

function readFallback(): Store {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '{}') as Store;
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
  try {
    localStorage.removeItem(OLD_KEY);
  } catch {
    /* no storage: nothing to clear */
  }
  if (typeof indexedDB === 'undefined') {
    merge(readFallback());
    return;
  }
  try {
    db = await openDB(DB, 2, {
      upgrade(d) {
        if (d.objectStoreNames.contains('passes')) d.deleteObjectStore('passes');
        if (!d.objectStoreNames.contains(STORE))
          d.createObjectStore(STORE, { autoIncrement: true }).createIndex('song', 'song');
      },
    });
    const loaded: Store = {};
    for (const row of (await db.getAll(STORE)) as (PerfRecord & { song: string })[])
      push(loaded, row.song, { at: row.at, score: row.score });
    merge(loaded);
  } catch {
    db = null;
    merge(readFallback());
  }
}

/** Resolves once the stored history is in memory. */
export const historyReady: Promise<void> = load();

export const passesOf = (song: string): PerfRecord[] => cache[song] ?? [];

/** Best performance score, or null. */
export function bestOf(song: string): number | null {
  let best: number | null = null;
  for (const r of passesOf(song)) if (best === null || r.score > best) best = r.score;
  return best;
}

export function addPass(song: string, rec: PerfRecord): void {
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
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(cache));
    } catch {
      /* storage full or unavailable: history just is not kept */
    }
  });
}
