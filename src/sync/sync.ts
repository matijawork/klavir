/**
 * Keeps this device and the cloud the same, for one signed-in user. The device is always the
 * source of truth for the app: sync only copies what one side is missing (rules in merge.ts).
 *
 *   performances/<song|hands|at>   every kept score; never changed, so sync is "copy what is missing"
 *   last/<song|hands>              the latest performance in full, as text; the newer one wins
 *   days/<device id>               seconds played per day on that device; devices are added up
 *   kv/videos, kv/checked          key → { v, at }; the later change wins per key
 *   kv/lastIndex                   key → time of each `last` document, so only newer ones are fetched
 *
 * A full sync reads the cloud; between full syncs changes are only pushed, against what the last
 * full sync saw, so playing does not cost a read of everything every few seconds.
 */
import { signal } from '@preact/signals';
import { checkedStore } from '../store/checked.ts';
import { ownDays, setOtherDays } from '../store/days.ts';
import {
  addPass,
  allPasses,
  getLast,
  lastIndex,
  type PerfRecord,
  putLast,
} from '../store/history.ts';
import type { StampedStore } from '../store/stamped.ts';
import { videoStore } from '../store/videos.ts';
import type { Backend, CloudUser, Doc } from './backend.ts';
import { firebaseConfig } from './config.ts';
import {
  mergeStamped,
  missing,
  newer,
  pack,
  type StampedMap,
  safeId,
  sumDays,
  unpack,
} from './merge.ts';
import { onLocalChange } from './notify.ts';

export interface SyncState {
  /** false = no cloud configured: the sign-in is not offered at all */
  available: boolean;
  user: CloudUser | null;
  status: 'idle' | 'syncing' | 'ok' | 'error';
  /** Date.now() of the last successful sync */
  at: number | null;
  /** why the last sync failed, in plain words */
  error: string | null;
}
export const syncState = signal<SyncState>({
  available: false,
  user: null,
  status: 'idle',
  at: null,
  error: null,
});
const set = (patch: Partial<SyncState>): void => {
  syncState.value = { ...syncState.value, ...patch };
};

const DEVICE = 'klavir.device';
function deviceId(): string {
  let id = localStorage.getItem(DEVICE);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE, id);
  }
  return id;
}

const perfId = (r: PerfRecord & { song: string }): string => safeId(`${r.song}|${r.hands}|${r.at}`);

let backend: Backend | null = null;
/** what the cloud held at the last full sync, updated with what was pushed since */
interface Seen {
  perf: Set<string>;
  days: string;
  kv: Record<string, string>;
  last: Record<string, number>;
}
let seen: Seen | null = null;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function syncStamped<T>(
  b: Backend,
  name: string,
  store: StampedStore<T>,
  s: Seen,
  full: boolean,
): Promise<void> {
  if (full) {
    const remote = ((await b.get('kv', name))?.map ?? {}) as StampedMap<T>;
    const m = mergeStamped(store.map.peek(), remote);
    if (m.local) store.replace(m.merged);
    s.kv[name] = JSON.stringify(remote);
  }
  const mine = JSON.stringify(store.map.peek());
  if (mine !== s.kv[name]) {
    await b.put('kv', { [name]: { map: store.map.peek() } as Doc });
    s.kv[name] = mine;
  }
}

async function run(b: Backend, full: boolean): Promise<void> {
  const s: Seen = full || !seen ? { perf: new Set(), days: '', kv: {}, last: {} } : seen;
  const pull = full || !seen;

  // scores
  if (pull) {
    const remote = await b.list('performances');
    s.perf = new Set(Object.keys(remote));
    const local = new Set(allPasses().map(perfId));
    for (const id of missing(local, s.perf).here) {
      const r = remote[id] as unknown as PerfRecord & { song: string };
      addPass(r.song, { at: r.at, score: r.score, hands: r.hands ?? 'both' }, true);
    }
  }
  const send: Record<string, Doc> = {};
  for (const r of allPasses()) if (!s.perf.has(perfId(r))) send[perfId(r)] = { ...r };
  if (Object.keys(send).length) {
    await b.put('performances', send);
    for (const id of Object.keys(send)) s.perf.add(id);
  }

  // practice days: this device's count goes up, the other devices' counts come down
  if (pull) {
    const remote = await b.list('days');
    const mineId = deviceId();
    setOtherDays(
      sumDays(
        Object.entries(remote)
          .filter(([id]) => id !== mineId)
          .map(([, d]) => (d.seconds ?? {}) as Record<string, number>),
      ),
    );
    s.days = JSON.stringify(remote[mineId]?.seconds ?? {});
  }
  const mineDays = JSON.stringify(ownDays.peek());
  if (mineDays !== s.days) {
    await b.put('days', { [deviceId()]: { seconds: ownDays.peek() } });
    s.days = mineDays;
  }

  // videos and "checked by me" marks
  await syncStamped(b, 'videos', videoStore, s, pull);
  await syncStamped(b, 'checked', checkedStore, s, pull);

  // latest performances in full: only the newer ones travel
  if (pull) s.last = (((await b.get('kv', 'lastIndex'))?.at ?? {}) as Record<string, number>) || {};
  const mineIndex: Record<string, number> = {};
  for (const [key, at] of Object.entries(await lastIndex())) mineIndex[safeId(key)] = at;
  const keyOf = new Map(Object.keys(await lastIndex()).map((key) => [safeId(key), key]));
  const diff = newer(mineIndex, s.last);
  if (pull)
    for (const id of diff.fetch) {
      const doc = await b.get('last', id);
      if (typeof doc?.data !== 'string' || typeof doc.key !== 'string') continue;
      await putLast(doc.key, unpack<{ at: number }>(doc.data));
    }
  for (const id of diff.send) {
    const key = keyOf.get(id)!;
    const value = await getLast<{ at: number }>(key);
    if (!value) continue;
    await b.put('last', { [id]: { key, at: value.at, data: pack(value) } });
    s.last[id] = value.at;
  }
  if (diff.send.length) await b.put('kv', { lastIndex: { at: s.last } });

  seen = s;
}

const words = (e: unknown): string => {
  const text = e instanceof Error ? e.message : String(e);
  if (!navigator.onLine || /network|fetch|offline|unavailable/i.test(text))
    return 'No connection. Everything is kept on this device and sent when you are back online.';
  if (/permission|unauth/i.test(text)) return 'The cloud refused access. Sign out and in again.';
  return `Sync failed: ${text}`;
};

/** Syncs now. `full` also reads what other devices have sent. One at a time; a request made meanwhile runs after. */
export function sync(full: boolean): Promise<void> {
  const b = backend;
  if (!b || !syncState.peek().user) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  set({ status: 'syncing' });
  running = run(b, full)
    .then(
      () => set({ status: 'ok', at: Date.now(), error: null }),
      (e: unknown) => set({ status: 'error', error: words(e) }),
    )
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void sync(false);
      }
    });
  return running;
}

export async function signIn(): Promise<void> {
  try {
    await backend?.signIn();
  } catch (e) {
    set({ status: 'error', error: words(e) });
  }
}
export async function signOut(): Promise<void> {
  await backend?.signOut();
}

/**
 * Call once at start-up. Does nothing visible unless a cloud is configured (or ?mocksync).
 * `?nosync` = behave as if no cloud were configured (for the tests).
 */
export async function startSync(): Promise<void> {
  const query = new URLSearchParams(location.search);
  const mock = query.has('mocksync');
  if (query.has('nosync') || (!mock && !firebaseConfig)) return;
  set({ available: true });
  try {
    backend = mock
      ? (await import('./mock.ts')).mockBackend()
      : await (await import('./firebase.ts')).firebaseBackend(firebaseConfig!);
    await backend.start((user) => {
      seen = null;
      set({ user, status: 'idle', at: null, error: null });
      if (user) void sync(true);
    });
  } catch (e) {
    set({ status: 'error', error: words(e) });
    return;
  }
  // local changes are sent a little later, together; leaving the page sends them at once
  onLocalChange(() => {
    if (!syncState.peek().user) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void sync(false), 4000);
  });
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (timer) {
        clearTimeout(timer);
        timer = null;
        void sync(false);
      }
    } else if (Date.now() - hiddenAt > 60_000) void sync(true);
  });
  window.addEventListener('online', () => void sync(true));
}
