/**
 * Stand-in cloud for tests, enabled with ?mocksync in the URL. Documents go to
 * `<base>__cloud/<collection>[/<id>]` with plain requests, which the tests answer themselves, so
 * two browsers in one test can share one "cloud". The user is remembered in localStorage.
 */
import type { Backend, CloudUser, Doc } from './backend.ts';

const USER = 'klavir.mockuser';
const url = (path: string): string => `${import.meta.env.BASE_URL}__cloud/${path}`;

export function mockBackend(): Backend {
  let tell: (user: CloudUser | null) => void = () => {};
  const current = (): CloudUser | null => {
    const name = localStorage.getItem(USER);
    return name ? { id: name, name } : null;
  };
  const call = async (path: string, body?: unknown): Promise<unknown> => {
    const user = current();
    if (!user) throw new Error('Not signed in');
    const res = await fetch(url(`${user.id}/${path}`), {
      method: body === undefined ? 'GET' : 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Cloud answered ${res.status}`);
    return res.json();
  };
  return {
    async start(onUser) {
      tell = onUser;
      tell(current());
    },
    async signIn() {
      localStorage.setItem(USER, 'tester');
      tell(current());
    },
    async signOut() {
      localStorage.removeItem(USER);
      tell(null);
    },
    list: (collection) => call(collection) as Promise<Record<string, Doc>>,
    get: (collection, id) => call(`${collection}/${encodeURIComponent(id)}`) as Promise<Doc | null>,
    async put(collection, docs) {
      await call(collection, docs);
    },
  };
}
