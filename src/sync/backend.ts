/** What sync needs from a cloud: who is signed in, and documents in named collections under that user. */
export type Doc = Record<string, unknown>;

export interface CloudUser {
  id: string;
  name: string;
}

export interface Backend {
  /** Calls `onUser` now and whenever the signed-in user changes. */
  start(onUser: (user: CloudUser | null) => void): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** all documents of a collection, by id */
  list(collection: string): Promise<Record<string, Doc>>;
  get(collection: string, id: string): Promise<Doc | null>;
  /** creates or replaces the given documents */
  put(collection: string, docs: Record<string, Doc>): Promise<void>;
}
