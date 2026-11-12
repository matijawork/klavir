/** Practice settings: signals persisted to localStorage. Read by UI and (via .peek()) by the engine. */
import { effect, signal } from '@preact/signals';

export type Mode = 'wait' | 'tempo';
export type Hands = 'both' | 'L' | 'R';
export type OtherHand = 'dim' | 'hide' | 'play';
export type NoteNames = 'off' | 'upcoming' | 'all';
export type SoundOut = 'computer' | 'piano';

export interface Settings {
  mode: Mode;
  hands: Hands;
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
  /** computer sound loudness, 0..2 */
  volume: number;
  /** metronome loudness relative to the rest, 0..2 */
  clickVolume: number;
  noteNames: NoteNames;
  octaveNumbers: boolean;
  fingers: boolean;
  /** vertical zoom, pixels per second */
  zoom: number;
  autoSpeed: boolean;
  autoSpeedStart: number;
  autoSpeedStep: number;
  autoSpeedTarget: number;
  /** accuracy (0..1) a pass needs to count as clean */
  autoSpeedThreshold: number;
}

export const DEFAULTS: Settings = {
  mode: 'wait',
  hands: 'both',
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
  autoSpeed: false,
  autoSpeedStart: 0.6,
  autoSpeedStep: 0.05,
  autoSpeedTarget: 1,
  autoSpeedThreshold: 0.9,
};

const KEY = 'klavir.settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
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
