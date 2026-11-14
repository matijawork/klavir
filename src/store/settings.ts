/** Practice settings: signals persisted to localStorage. Read by UI and (via .peek()) by the engine. */
import { effect, signal } from '@preact/signals';

export type Mode = 'wait' | 'tempo';
export type Hands = 'both' | 'L' | 'R';
export type OtherHand = 'dim' | 'hide' | 'play';
export type NoteNames = 'off' | 'upcoming' | 'all';
export type SoundOut = 'computer' | 'piano';
export type Strictness = 'easy' | 'normal' | 'strict';

export interface Settings {
  mode: Mode;
  hands: Hands;
  /** how closely timing and holding are followed */
  strictness: Strictness;
  /** ms the player's presses arrive late (equipment delay), taken out of the timing score */
  timingOffset: number;
  /** ms the falling notes are drawn ahead of the sound (a slow screen); drawing only */
  pictureOffset: number;
  otherHand: OtherHand;
  /** 0.1 .. 1.5 */
  speed: number;
  countIn: boolean;
  countInClick: boolean;
  metronome: boolean;
  metronomeClick: boolean;
  /** where clicks and song playback sound */
  soundOut: SoundOut;
  /** play the player's own keys through the computer */
  monitor: boolean;
  /** computer sound loudness, 0..3 */
  volume: number;
  /** metronome loudness relative to the rest, 0..2 */
  clickVolume: number;
  noteNames: NoteNames;
  octaveNumbers: boolean;
  fingers: boolean;
  /** vertical zoom, pixels per second */
  zoom: number;
}

export const DEFAULTS: Settings = {
  mode: 'wait',
  hands: 'both',
  strictness: 'normal',
  timingOffset: 0,
  pictureOffset: 0,
  otherHand: 'dim',
  speed: 1,
  countIn: true,
  countInClick: true,
  metronome: false,
  metronomeClick: true,
  soundOut: 'computer',
  monitor: true,
  volume: 1.2,
  clickVolume: 1,
  noteNames: 'upcoming',
  octaveNumbers: false,
  fingers: true,
  zoom: 220,
};

const KEY = 'klavir.settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // only known keys: settings of removed features are dropped
      const saved = JSON.parse(raw) as Record<string, unknown>;
      const out = { ...DEFAULTS } as Record<string, unknown>;
      for (const k of Object.keys(DEFAULTS)) if (k in saved) out[k] = saved[k];
      return out as unknown as Settings;
    }
  } catch {
    /* unreadable storage: fall back to defaults */
  }
  return { ...DEFAULTS };
}

export const settings = signal<Settings>(load());

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings.value = { ...settings.value, [key]: value };
}

export const clampSpeed = (v: number): number =>
  Math.min(1.5, Math.max(0.1, Math.round(v * 100) / 100));

effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings.value));
  } catch {
    /* not persisted */
  }
});
