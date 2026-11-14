/** YouTube link per song, added by the player in the library. Overrides meta.json. */
import { computed } from '@preact/signals';
import type { StampedMap } from '../sync/merge.ts';
import { stampedStore } from './stamped.ts';

/** song id → link; an empty string means "removed", so a link from meta.json stays hidden */
export const videoStore = stampedStore<string>('klavir.videos2', () => {
  const raw = localStorage.getItem('klavir.videos');
  if (!raw) return null;
  const out: StampedMap<string> = {};
  for (const [id, link] of Object.entries(JSON.parse(raw) as Record<string, string>))
    out[id] = { v: link, at: 1 };
  return out;
});

export const videos = computed(() => {
  const out: Record<string, string> = {};
  for (const [id, e] of Object.entries(videoStore.map.value)) out[id] = e.v;
  return out;
});

export const setVideo = (song: string, link: string): void => videoStore.set(song, link);
