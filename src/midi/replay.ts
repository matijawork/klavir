/**
 * Plays a recorded pass back through the playback sound, following the transport, so the player
 * hears what they played while the review scrolls. The sustain pedal is acted out here (notes let
 * go while it is down ring on until it comes up), so it works for both sound targets.
 */
import { type PassSnapshot, REC_PEDAL } from '../engine/session.ts';
import type { Transport } from '../engine/transport.ts';
import { panic, playNote, SCHEDULE_AHEAD_MS } from './output.ts';

export class Replay {
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private pedal = false;
  /** per pitch: 1 = key down, 2 = let go but ringing on the pedal */
  private readonly sounding = new Uint8Array(128);
  private readonly transport: Transport;
  private readonly snap: PassSnapshot;

  constructor(transport: Transport, snap: PassSnapshot) {
    this.transport = transport;
    this.snap = snap;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Starts from where the transport stands (it must be playing); `onEnd` runs after song time `until`. */
  start(until: number, onEnd: () => void): void {
    if (this.timer !== null) return;
    const { recTime } = this.snap;
    const t = this.transport.time();
    this.next = 0;
    while (this.next < recTime.length && recTime[this.next]! < t - 1e-3) this.next++;
    this.pedal = false;
    this.sounding.fill(0);
    const tick = (): void => {
      const tr = this.transport;
      const now = performance.now();
      const horizon = now + SCHEDULE_AHEAD_MS;
      const { recKey, recVel } = this.snap;
      while (this.next < recTime.length) {
        const at = tr.wallAt(recTime[this.next]!);
        if (at > horizon) break;
        const key = recKey[this.next]!;
        const vel = recVel[this.next]!;
        const when = Math.max(at, now);
        this.next++;
        if (key === REC_PEDAL) {
          this.pedal = vel > 0;
          if (!this.pedal)
            for (let p = 0; p < 128; p++)
              if (this.sounding[p] === 2) {
                this.sounding[p] = 0;
                playNote(false, p, 0, when);
              }
        } else if (vel > 0) {
          if (this.sounding[key]) playNote(false, key, 0, when);
          this.sounding[key] = 1;
          playNote(true, key, vel, when);
        } else if (this.sounding[key] === 1) {
          if (this.pedal) this.sounding[key] = 2;
          else {
            this.sounding[key] = 0;
            playNote(false, key, 0, when);
          }
        }
      }
      if (now > tr.wallAt(until) + 400) {
        this.stop();
        onEnd();
      }
    };
    this.timer = setInterval(tick, 25);
    tick();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    panic();
  }
}
