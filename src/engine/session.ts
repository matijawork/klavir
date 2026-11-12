/**
 * One practice run over a song or a looped section: drives the transport, gates wait mode,
 * matches played notes to expected notes and counts results. No DOM, no MIDI: callers feed it
 * note-ons and call update() every frame. Wall times are performance.now() milliseconds.
 */
import type { LoadedSong } from './song.ts';
import type { Transport } from './transport.ts';

export const PENDING = 0;
export const HIT = 1;
export const MISSED = 2;
/** hit, but the key was let go well before the note ended */
export const SHORT = 3;

export type Mode = 'wait' | 'tempo';

export interface SessionConfig {
  mode: Mode;
  /** bit 0 = left hand, bit 1 = right hand */
  handMask: number;
  /** first and last measure index (inclusive) to practise; null = whole song */
  range: { a: number; b: number } | null;
  loop: boolean;
  countIn: boolean;
}

export interface PassResult {
  expected: number;
  hits: number;
  missed: number;
  wrong: number;
  /** notes that were hit but released too early */
  short: number;
  /** 0..1: early releases count half, every wrong key adds to the total */
  accuracy: number;
  /** wall-clock seconds the pass took */
  seconds: number;
}

/** A press this long before a wait-mode note arrives still counts for it. */
const EARLY_MS = 1000;
/** Lead-in when count-in is off, seconds of song time. */
const SHORT_LEAD = 1;

/** Score of a pass. Wrong keys and early releases both pull it down. */
export const passAccuracy = (
  hits: number,
  short: number,
  wrong: number,
  expected: number,
): number => (expected + wrong > 0 ? Math.max(0, hits - 0.5 * short) / (expected + wrong) : 1);

/** Normal-preset onset window in wall milliseconds (ADR-007): 15 % of a beat, clamped. */
export const hitWindowMs = (bpm: number, rate: number): number =>
  Math.min(120, Math.max(80, (0.15 * 60000) / (bpm * rate)));

export interface Beats {
  time: Float64Array;
  accent: Uint8Array;
}

/** Metronome beats of the whole song, in song seconds. Compound meters (6/8, 9/8, 12/8) beat in dotted quarters. */
export function buildBeats(song: LoadedSong): Beats {
  const times: number[] = [];
  const accents: number[] = [];
  for (const m of song.file.measures) {
    const compound = m.den === 8 && m.num % 3 === 0 && m.num > 3;
    const beatLen = compound ? 1.5 : 4 / m.den;
    const n = Math.max(1, Math.round(m.len / beatLen));
    for (let k = 0; k < n; k++) {
      times.push(song.tempo.toSeconds(m.b + k * beatLen));
      accents.push(k === 0 ? 1 : 0);
    }
  }
  return { time: Float64Array.from(times), accent: Uint8Array.from(accents) };
}

export class PracticeSession {
  readonly song: LoadedSong;
  readonly transport: Transport;
  readonly beats: Beats;
  /** per note: PENDING, HIT or MISSED */
  readonly state: Uint8Array;
  /** per note: onset deviation in wall ms (negative = early); NaN when not measured */
  readonly deviation: Float32Array;

  config: SessionConfig = { mode: 'wait', handMask: 3, range: null, loop: false, countIn: true };
  rangeStart = 0;
  rangeEnd = 0;
  /** song time where the lead-in (count-in) begins */
  leadStart = 0;
  /** count-in beat times in song seconds, all before rangeStart */
  countInTimes: number[] = [];
  /** true while wait mode holds the song for a key press */
  waiting = false;
  /** in wait mode: song time of the notes being waited for or coming next (Infinity when none) */
  gateTime = Number.POSITIVE_INFINITY;
  running = false;

  hits = 0;
  missed = 0;
  wrong = 0;
  short = 0;
  expected = 0;
  /** live sustain pedal: with it down, letting a key go early is fine */
  pedalDown = false;

  onPass: ((r: PassResult) => void) | null = null;
  onEnd: (() => void) | null = null;
  /** called after the session seeks on its own (loop restart), so schedulers can resync */
  onSeek: (() => void) | null = null;

  /** indices of the notes to play, in onset order */
  private active = new Int32Array(0);
  /** start offset of each onset group inside `active`; last entry = active.length */
  private groupAt = new Int32Array(1);
  private groupCount = 0;
  private group = 0;
  private missPtr = 0;
  private openWall = 0;
  private passStartWall = 0;
  private readonly lastOn = new Float64Array(128);
  private readonly down = new Uint8Array(128);
  /** per pitch: the press (its wall time) that already counted for an earlier note */
  private readonly usedOn = new Float64Array(128);
  /** per pitch: the song note the player is currently holding, or -1 */
  private readonly holding = new Int32Array(128).fill(-1);

  constructor(song: LoadedSong, transport: Transport) {
    this.song = song;
    this.transport = transport;
    this.beats = buildBeats(song);
    this.state = new Uint8Array(song.count);
    this.deviation = new Float32Array(song.count).fill(Number.NaN);
    this.configure(this.config);
  }

  /** Applies a new configuration and rewinds to the start of the range. */
  configure(config: SessionConfig, wall: number = performance.now()): void {
    this.config = config;
    const { song } = this;
    const ms = song.measureStart;
    const last = ms.length - 1;
    const a = config.range ? Math.max(0, Math.min(config.range.a, last)) : 0;
    const b = config.range ? Math.max(a, Math.min(config.range.b, last)) : last;
    this.rangeStart = ms[a] ?? 0;
    this.rangeEnd = b + 1 < ms.length ? ms[b + 1]! : song.duration;

    const idx: number[] = [];
    for (let i = 0; i < song.count; i++) {
      const s = song.start[i]!;
      if (s < this.rangeStart - 1e-6 || s >= this.rangeEnd - 1e-6) continue;
      if (config.handMask & (1 << song.hand[i]!)) idx.push(i);
    }
    this.active = Int32Array.from(idx);
    const groups: number[] = [];
    for (let k = 0; k < idx.length; k++)
      if (k === 0 || song.start[idx[k]!]! - song.start[idx[k - 1]!]! > 1e-4) groups.push(k);
    this.groupCount = groups.length;
    groups.push(idx.length);
    this.groupAt = Int32Array.from(groups);
    this.expected = idx.length;

    // count-in: one bar of beats at the tempo of the first measure in the range
    const m = song.file.measures[a];
    const compound = !!m && m.den === 8 && m.num % 3 === 0 && m.num > 3;
    const beatLen = compound ? 1.5 : 4 / (m?.den ?? 4);
    const spb = (60 / song.tempo.bpmAt(m?.b ?? 0)) * beatLen;
    const n = config.countIn ? Math.max(2, Math.round((m?.len ?? 4) / beatLen)) : 0;
    this.countInTimes = Array.from({ length: n }, (_, k) => this.rangeStart - (n - k) * spb);
    this.leadStart = n > 0 ? this.rangeStart - n * spb : this.rangeStart - SHORT_LEAD;

    this.rewind(wall);
  }

  /** Clears results for the range and moves to the start of the lead-in. */
  rewind(wall: number = performance.now()): void {
    for (let k = 0; k < this.active.length; k++) {
      const i = this.active[k]!;
      this.state[i] = PENDING;
      this.deviation[i] = Number.NaN;
    }
    this.hits = 0;
    this.missed = 0;
    this.wrong = 0;
    this.short = 0;
    this.holding.fill(-1);
    this.group = 0;
    this.missPtr = 0;
    this.waiting = false;
    this.openWall = wall;
    this.passStartWall = wall;
    this.transport.seek(this.leadStart, wall);
    this.updateGate();
    this.onSeek?.();
  }

  play(wall: number = performance.now()): void {
    if (this.running) return;
    if (this.transport.time(wall) >= this.rangeEnd - 1e-6) this.rewind(wall);
    this.running = true;
    if (!this.waiting) this.transport.play(wall);
  }

  pause(wall: number = performance.now()): void {
    if (!this.running) return;
    this.running = false;
    this.transport.pause(wall);
  }

  private groupTime(g: number): number {
    return this.song.start[this.active[this.groupAt[g]!]!]!;
  }

  private updateGate(): void {
    this.gateTime =
      this.config.mode === 'wait' && this.group < this.groupCount
        ? this.groupTime(this.group)
        : Number.POSITIVE_INFINITY;
  }

  /**
   * True when every key of group `g` has a fresh press: one made in this pass that has not already
   * counted for an earlier note, and that is either still held or no older than `notBefore`.
   */
  private groupSatisfied(g: number, notBefore: number): boolean {
    const { pitch } = this.song;
    for (let k = this.groupAt[g]!; k < this.groupAt[g + 1]!; k++) {
      const p = pitch[this.active[k]!]!;
      const on = this.lastOn[p]!;
      if (!(on > this.openWall && on > this.usedOn[p]! && (this.down[p]! > 0 || on >= notBefore)))
        return false;
    }
    return true;
  }

  private completeGroup(g: number): void {
    for (let k = this.groupAt[g]!; k < this.groupAt[g + 1]!; k++) {
      const i = this.active[k]!;
      this.state[i] = HIT;
      this.hits++;
      const p = this.song.pitch[i]!;
      this.usedOn[p] = this.lastOn[p]!;
      if (this.down[p]) this.holding[p] = i;
      else this.checkRelease(i, this.song.start[i]!);
    }
    this.group = g + 1;
    this.updateGate();
  }

  private inGroup(g: number, p: number): boolean {
    if (g >= this.groupCount) return false;
    for (let k = this.groupAt[g]!; k < this.groupAt[g + 1]!; k++)
      if (this.song.pitch[this.active[k]!] === p) return true;
    return false;
  }

  /** Marks note `i` as SHORT when it was let go at song time `t` with too much of it left. */
  private checkRelease(i: number, t: number): void {
    if (this.pedalDown || this.state[i] !== HIT) return;
    const { start, end } = this.song;
    const left = end[i]! - t;
    if (left > Math.max(0.18 * this.transport.rate, 0.3 * (end[i]! - start[i]!))) {
      this.state[i] = SHORT;
      this.short++;
    }
  }

  /** Feed every note-off from the player. */
  noteOff(p: number, wall: number): void {
    this.down[p] = 0;
    const i = this.holding[p]!;
    if (i < 0) return;
    this.holding[p] = -1;
    if (this.running) this.checkRelease(i, this.transport.time(wall));
  }

  /** Feed every note-on from the player. `wall` is the MIDI event timestamp. */
  noteOn(p: number, wall: number): void {
    this.lastOn[p] = wall;
    this.down[p] = 1;
    if (!this.running) return;
    const tr = this.transport;
    const t = tr.time(wall);
    if (t < this.leadStart) return;

    if (this.config.mode === 'wait') {
      if (!this.inGroup(this.group, p)) {
        if (t >= this.rangeStart - 0.05) this.wrong++;
        return;
      }
      if (this.waiting && this.groupSatisfied(this.group, 0)) {
        this.completeGroup(this.group);
        this.waiting = false;
        tr.play(wall);
      }
      return;
    }

    // tempo mode: nearest pending note of this pitch inside the window
    const { start, pitch, tempo } = this.song;
    const rate = tr.rate;
    let best = -1;
    let bestDev = Number.POSITIVE_INFINITY;
    for (let k = this.missPtr; k < this.active.length; k++) {
      const i = this.active[k]!;
      const dev = ((t - start[i]!) / rate) * 1000;
      if (dev < -200) break; // further notes are even later
      if (pitch[i] !== p || this.state[i] !== PENDING) continue;
      const win = hitWindowMs(tempo.bpmAt(tempo.toBeats(start[i]!)), rate);
      if (Math.abs(dev) <= win && Math.abs(dev) < Math.abs(bestDev)) {
        best = i;
        bestDev = dev;
      }
    }
    if (best >= 0) {
      this.state[best] = HIT;
      this.deviation[best] = bestDev;
      this.hits++;
      this.holding[p] = best;
    } else if (t >= this.rangeStart - 0.05) this.wrong++;
  }

  /** Call once per frame. Returns the song time to draw. */
  update(wall: number = performance.now()): number {
    const tr = this.transport;
    if (!this.running) return tr.time(wall);
    let t = tr.time(wall);

    if (this.config.mode === 'wait') {
      while (!this.waiting && this.group < this.groupCount && t >= this.groupTime(this.group)) {
        const gt = this.groupTime(this.group);
        if (this.groupSatisfied(this.group, tr.wallAt(gt) - EARLY_MS)) {
          this.completeGroup(this.group);
        } else {
          this.waiting = true;
          tr.pause(wall);
          tr.seek(gt, wall);
          t = gt;
        }
      }
    } else {
      const { start, tempo } = this.song;
      while (this.missPtr < this.active.length) {
        const i = this.active[this.missPtr]!;
        const win = hitWindowMs(tempo.bpmAt(tempo.toBeats(start[i]!)), tr.rate);
        if (((t - start[i]!) / tr.rate) * 1000 <= win) break;
        if (this.state[i] === PENDING) {
          this.state[i] = MISSED;
          this.missed++;
        }
        this.missPtr++;
      }
    }

    if (!this.waiting && t >= this.rangeEnd - 1e-6) {
      const result: PassResult = {
        expected: this.expected,
        hits: this.hits,
        missed: this.config.mode === 'tempo' ? this.expected - this.hits : 0,
        wrong: this.wrong,
        short: this.short,
        accuracy: passAccuracy(this.hits, this.short, this.wrong, this.expected),
        seconds: (wall - this.passStartWall) / 1000,
      };
      this.onPass?.(result);
      if (this.config.loop) {
        this.rewind(wall);
        t = tr.time(wall);
      } else {
        this.pause(wall);
        this.onEnd?.();
      }
    }
    return t;
  }
}
