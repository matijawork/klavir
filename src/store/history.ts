/**
 * Scores of performances per song: whole piece, full speed, Tempo mode, no stopping (the Perform
 * button), with both hands or one. Practice is never kept. Stored in IndexedDB (database `klavir`:
 * `performances` = every score, `last` = the latest performance in full for its review) with an
 * in-memory copy of the scores so reads stay synchronous; localStorage is the fallback for the
 * scores without IndexedDB. Records of the older practice history (store `passes`, key
 * `klavir.history`) are deleted: Matija asked for that on 2026-11-14.
 */
import { signal } from '@preact/signals';
import { type IDBPDatabase, openDB } from 'idb';
import { changed } from '../sync/notify.ts';

export type PerfHands = 'both' | 'L' | 'R';

export interface PerfRecord {
  /** Date.now() */
  at: number;
  /** 0..100 */
  score: number;
  hands: PerfHands;
}

const OLD_KEY = 'klavir.history';
const FALLBACK_KEY = 'klavir.performances';
const DB = 'klavir';
const STORE = 'performances';
const LAST = 'last';
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
    cache[song] = [...list, ...(cache[song] ?? [])]
      .map((r) => ({ at: r.at, score: r.score, hands: r.hands ?? 'both' }))
      .sort((a, b) => a.at - b.at);
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
    db = await openDB(DB, 3, {
      upgrade(d) {
        if (d.objectStoreNames.contains('passes')) d.deleteObjectStore('passes');
        if (!d.objectStoreNames.contains(STORE))
          d.createObjectStore(STORE, { autoIncrement: true }).createIndex('song', 'song');
        if (!d.objectStoreNames.contains(LAST)) d.createObjectStore(LAST);
      },
    });
    const loaded: Store = {};
    for (const row of (await db.getAll(STORE)) as (PerfRecord & { song: string })[])
      push(loaded, row.song, row);
    merge(loaded);
  } catch {
    db = null;
    merge(readFallback());
  }
}

/** Resolves once the stored history is in memory. */
export const historyReady: Promise<void> = load();

export const passesOf = (song: string, hands?: PerfHands): PerfRecord[] => {
  const all = cache[song] ?? [];
  return hands ? all.filter((r) => r.hands === hands) : all;
};

/** Best performance score with those hands, or null. */
export function bestOf(song: string, hands: PerfHands = 'both'): number | null {
  let best: number | null = null;
  for (const r of passesOf(song, hands)) if (best === null || r.score > best) best = r.score;
  return best;
}

/** Every kept score with its song, for sync. */
export function allPasses(): (PerfRecord & { song: string })[] {
  return Object.entries(cache).flatMap(([song, list]) => list.map((r) => ({ song, ...r })));
}

export function addPass(song: string, rec: PerfRecord, fromSync = false): void {
  push(cache, song, rec);
  cache[song]!.sort((a, b) => a.at - b.at);
  historyVersion.value++;
  if (!fromSync) changed();
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

/** Keeps the latest performance in full (result, settings, notes, recording), replacing the one before. */
export function saveLast(song: string, hands: PerfHands, value: { at: number }): void {
  void putLast(`${song}|${hands}`, value).then(changed);
}

/** The latest performance kept by saveLast, or null. */
export const loadLast = <T>(song: string, hands: PerfHands): Promise<T | null> =>
  getLast<T>(`${song}|${hands}`);

/** Saved performances by their key ("song|hands"), for sync. */
export async function putLast(key: string, value: { at: number }): Promise<void> {
  await historyReady;
  await db?.put(LAST, value, key).catch(() => {});
}
export async function getLast<T>(key: string): Promise<T | null> {
  await historyReady;
  try {
    return ((await db?.get(LAST, key)) as T | undefined) ?? null;
  } catch {
    return null;
  }
}
/** key → when it was played */
export async function lastIndex(): Promise<Record<string, number>> {
  await historyReady;
  const out: Record<string, number> = {};
  if (!db) return out;
  try {
    const keys = await db.getAllKeys(LAST);
    const values = (await db.getAll(LAST)) as { at?: number }[];
    keys.forEach((k, i) => {
      out[String(k)] = values[i]?.at ?? 0;
    });
  } catch {
    /* unreadable: nothing to sync */
  }
  return out;
}
