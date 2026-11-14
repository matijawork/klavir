/** Songs and exercises whose finger numbers Matija has checked himself. */
import type { StampedMap } from '../sync/merge.ts';
import { stampedStore } from './stamped.ts';

export const checkedStore = stampedStore<boolean>('klavir.fingeringChecked2', () => {
  const raw = localStorage.getItem('klavir.fingeringChecked');
  if (!raw) return null;
  const out: StampedMap<boolean> = {};
  for (const id of JSON.parse(raw) as string[]) out[id] = { v: true, at: 1 };
  return out;
});

export const isChecked = (id: string): boolean => checkedStore.map.value[id]?.v === true;
export const toggleChecked = (id: string): void => checkedStore.set(id, !isChecked(id));
