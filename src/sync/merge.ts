/** Rules for bringing two devices together. Pure, no DOM, no network. */

/** Document ids may not contain "/". */
export const safeId = (id: string): string => id.replaceAll('/', '~');

export interface Stamped<T> {
  v: T;
  /** Date.now() of the change */
  at: number;
}
export type StampedMap<T> = Record<string, Stamped<T>>;

/** Per key the later change wins. `local` is true when the result differs from `mine`, `remote` when from `theirs`. */
export function mergeStamped<T>(
  mine: StampedMap<T>,
  theirs: StampedMap<T>,
): { merged: StampedMap<T>; local: boolean; remote: boolean } {
  const merged: StampedMap<T> = { ...mine };
  let local = false;
  let remote = false;
  for (const [k, t] of Object.entries(theirs)) {
    const m = mine[k];
    if (!m || t.at > m.at) {
      merged[k] = t;
      local = true;
    }
  }
  for (const [k, m] of Object.entries(mine)) {
    const t = theirs[k];
    if (!t || m.at > t.at) remote = true;
  }
  return { merged, local, remote };
}

/** Ids only one side has. Records are never changed or deleted, so that is the whole merge. */
export function missing(
  mine: Iterable<string>,
  theirs: Iterable<string>,
): { here: string[]; there: string[] } {
  const a = new Set(mine);
  const b = new Set(theirs);
  return { here: [...b].filter((id) => !a.has(id)), there: [...a].filter((id) => !b.has(id)) };
}

/** Seconds per day added up over devices: each device only ever counts its own playing. */
export function sumDays(maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) for (const [day, s] of Object.entries(m)) out[day] = (out[day] ?? 0) + s;
  return out;
}

/** Which full records to fetch and which to send, from two "id → time" lists: the newer one wins. */
export function newer(
  mine: Record<string, number>,
  theirs: Record<string, number>,
): { fetch: string[]; send: string[] } {
  const fetch = Object.keys(theirs).filter((id) => theirs[id]! > (mine[id] ?? -1));
  const send = Object.keys(mine).filter((id) => mine[id]! > (theirs[id] ?? -1));
  return { fetch, send };
}

const TYPES = { Uint8Array, Int32Array, Float32Array, Float64Array } as const;
type TypeName = keyof typeof TYPES;

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** A value with typed arrays inside (a saved performance) as text, bit for bit. */
export function pack(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    for (const name of Object.keys(TYPES) as TypeName[])
      if (v instanceof TYPES[name])
        return { $t: name, b: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    return v;
  });
}
export function unpack<T>(text: string): T {
  return JSON.parse(text, (_k, v: unknown) => {
    if (v && typeof v === 'object' && '$t' in v && 'b' in v) {
      const { $t, b } = v as { $t: TypeName; b: string };
      const bytes = fromBase64(b);
      return new TYPES[$t](bytes.buffer, 0, bytes.byteLength / TYPES[$t].BYTES_PER_ELEMENT);
    }
    return v;
  }) as T;
}
