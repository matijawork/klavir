/**
 * Song playback to the piano over MIDI OUT.
 * Chrome cannot cancel messages already sent with a future timestamp, so only a short window is
 * scheduled ahead, and stop() silences both what sounds now and what is still queued.
 */
import type { LoadedSong } from '../engine/song.ts';
import type { Transport } from '../engine/transport.ts';
import { hasOutput, onOutputReady, send } from './midi.ts';

/** 0-based MIDI channels. The player's own keys are channel 0 and are never written to. */
export const CH_PLAYBACK = 2;
export const CH_CLICK = 3;

const LOOKAHEAD_MS = 100;
const TICK_MS = 25;

/** Korg D1 sounds: bank MSB 121, then LSB + program. Harmless on other instruments. */
export function setupSounds(): void {
  // playback: Pop Piano
  send([0xb0 | CH_PLAYBACK, 0, 121]);
  send([0xb0 | CH_PLAYBACK, 32, 2]);
  send([0xc0 | CH_PLAYBACK, 1]);
  send([0xb0 | CH_PLAYBACK, 7, 96]);
  // click: Marimba
  send([0xb0 | CH_CLICK, 0, 121]);
  send([0xb0 | CH_CLICK, 32, 0]);
  send([0xc0 | CH_CLICK, 12]);
  send([0xb0 | CH_CLICK, 7, 100]);
}
onOutputReady(setupSounds);

/** Silences the app's channels now and again just after the look-ahead window. */
export function panic(): void {
  const later = performance.now() + LOOKAHEAD_MS + 20;
  for (const ch of [CH_PLAYBACK, CH_CLICK]) {
    for (const t of [undefined, later]) {
      send([0xb0 | ch, 64, 0], t);
      send([0xb0 | ch, 123, 0], t);
      send([0xb0 | ch, 120, 0], t);
    }
  }
}

export class SongPlayback {
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  /** indices of notes that are sounding and still need a note-off */
  private readonly offs = new Int32Array(256);
  private offCount = 0;
  /** hands to play: bit 0 = left, bit 1 = right */
  handMask = 3;
  private readonly song: LoadedSong;
  private readonly transport: Transport;

  constructor(song: LoadedSong, transport: Transport) {
    this.song = song;
    this.transport = transport;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    this.stop();
    if (!hasOutput()) return;
    const t = this.transport.time();
    const { start } = this.song;
    let i = 0;
    while (i < this.song.count && start[i]! < t) i++;
    this.next = i;
    this.offCount = 0;
    this.timer = setInterval(this.tick, TICK_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.offCount = 0;
    panic();
  }

  private tick = (): void => {
    const tr = this.transport;
    if (!tr.playing) return;
    const now = performance.now();
    const horizon = now + LOOKAHEAD_MS;
    const { start, end, pitch, hand, count } = this.song;

    // note-offs first, so a repeated pitch is released before it is struck again
    let kept = 0;
    for (let k = 0; k < this.offCount; k++) {
      const i = this.offs[k]!;
      const offAt = tr.wallAt(end[i]!) - 8;
      if (offAt <= horizon) send([0x80 | CH_PLAYBACK, pitch[i]!, 64], Math.max(offAt, now));
      else this.offs[kept++] = i;
    }
    this.offCount = kept;

    while (this.next < count) {
      const i = this.next;
      const onAt = tr.wallAt(start[i]!);
      if (onAt > horizon) break;
      this.next++;
      if (!(this.handMask & (1 << hand[i]!))) continue;
      send([0x90 | CH_PLAYBACK, pitch[i]!, 72], Math.max(onAt, now));
      if (this.offCount < this.offs.length) this.offs[this.offCount++] = i;
    }
  };
}
