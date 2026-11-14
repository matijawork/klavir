/**
 * Firebase backend: Google sign-in (popup; redirect cannot work on github.io) and Firestore Lite
 * (plain requests, no cache of its own: IndexedDB and localStorage stay the source of truth).
 * Everything lives under `users/<uid>/<collection>/<id>`. Loaded only when a project is configured.
 */
import type { Backend, CloudUser, Doc } from './backend.ts';
import type { FirebaseConfig } from './config.ts';

export async function firebaseBackend(config: FirebaseConfig): Promise<Backend> {
  const [{ initializeApp }, auth, store] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore/lite'),
  ]);
  const app = initializeApp(config);
  const a = auth.getAuth(app);
  const db = store.getFirestore(app);
  const uid = (): string => {
    const id = a.currentUser?.uid;
    if (!id) throw new Error('Not signed in');
    return id;
  };
  return {
    async start(onUser: (user: CloudUser | null) => void) {
      await a.authStateReady();
      auth.onAuthStateChanged(a, (u) =>
        onUser(u ? { id: u.uid, name: u.displayName ?? u.email ?? 'Signed in' } : null),
      );
    },
    async signIn() {
      await auth.signInWithPopup(a, new auth.GoogleAuthProvider());
    },
    async signOut() {
      await auth.signOut(a);
    },
    async list(collection) {
      const out: Record<string, Doc> = {};
      const snap = await store.getDocs(store.collection(db, 'users', uid(), collection));
      for (const d of snap.docs) out[d.id] = d.data();
      return out;
    },
    async get(collection, id) {
      const d = await store.getDoc(store.doc(db, 'users', uid(), collection, id));
      return d.exists() ? d.data() : null;
    },
    async put(collection, docs) {
      const entries = Object.entries(docs);
      // a batch takes at most 500 writes
      for (let i = 0; i < entries.length; i += 400) {
        const batch = store.writeBatch(db);
        for (const [id, data] of entries.slice(i, i + 400))
          batch.set(store.doc(db, 'users', uid(), collection, id), data);
        await batch.commit();
      }
    },
  };
}
