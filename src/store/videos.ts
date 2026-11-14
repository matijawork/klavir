/** YouTube link per song, added by the player in the library (localStorage). Overrides meta.json. */
import { signal } from '@preact/signals';

const KEY = 'klavir.videos';

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** song id → link; an empty string means "removed", so a link from meta.json stays hidden */
export const videos = signal<Record<string, string>>(load());

export function setVideo(song: string, link: string): void {
  videos.value = { ...videos.value, [song]: link };
  try {
    localStorage.setItem(KEY, JSON.stringify(videos.value));
  } catch {
    /* not remembered */
  }
}
