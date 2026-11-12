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

/** timing grade of a hit note, for drawing */
export const ON_TIME = 0;
export const EARLY = 1;
export const LATE = 2;

export interface PassResult {
  expected: number;
  /** notes whose outcome is known so far (= expected once the pass is over) */
  judged: number;
  hits: number;
  missed: number;
  wrong: number;
  /** notes that were hit but released too early */
  short: number;
  /** hits outside the on-time window */
  early: number;
  late: number;
  /** 0..1 share of judged notes that were played */
  notes: number;
  /** 0..1 how close to the beat the hits were; null when not measured (wait mode, no hits) */
  timing: number | null;
  /** 0..1 how fully the notes were held; null without hits */
  hold: number | null;
  /** mean onset deviation of the hits in ms (positive = late); null when not measured */
  meanDeviation: number | null;
  /** notes held well past their end */
  long: number;
  /** median onset deviation in ms and its spread (median absolute deviation); null when not measured */
  medianDeviation: number | null;
  spread: number | null;
  /** measures (indices, inclusive) where most went wrong; null when nothing stands out */
  weak: { a: number; b: number } | null;
  /** 0..1 overall score: see noteScore; every wrong key adds to the total */
  accuracy: number;
  /** wall-clock seconds the pass took */
  seconds: number;
}

/** A press this long before a wait-mode note arrives still counts for it. */
const EARLY_MS = 1000;
/** Lead-in when count-in is off, seconds of song time. */
const SHORT_LEAD = 1;

/** Weights of the three things a played note is judged on. */
const W_NOTE = 0.4;
const W_TIMING = 0.35;
const W_HOLD = 0.25;

/**
 * Score of one played note, 0..1: right key, how close to the beat (`timing` 0..1, null when the
 * mode does not measure it) and how fully it was held (`hold` 0..1).
 */
export const noteScore = (timing: number | null, hold: number): number =>
  timing === null
    ? (W_NOTE + W_HOLD * hold) / (W_NOTE + W_HOLD)
    : W_NOTE + W_TIMING * timing + W_HOLD * hold;

export type Strictness = 'easy' | 'normal' | 'strict';

interface Preset {
  /** on-time window: share of a beat, clamped to [winMin, winMax] wall ms */
  win: number;
  winMin: number;
  winMax: number;
  /** a press this far away still counts (early/late): share of a beat, clamped */
  accept: number;
  acceptMin: number;
  acceptMax: number;
  /** letting go is fine with this share of the note left, or leftMin real seconds if that is more */
  left: number;
  leftMin: number;
  /** holding on is fine for this share of the note past its end (at least 0.3 s) */
  over: number;
}

/** How closely the playing is followed (ADR-007). */
export const PRESETS: Record<Strictness, Preset> = {
  easy: {
    win: 0.25,
    winMin: 120,
    winMax: 200,
    accept: 0.6,
    acceptMin: 300,
    acceptMax: 500,
    left: 0.45,
    leftMin: 0.25,
    over: 1,
  },
  normal: {
    win: 0.15,
    winMin: 80,
    winMax: 120,
    accept: 0.5,
    acceptMin: 250,
    acceptMax: 400,
    left: 0.3,
    leftMin: 0.18,
    over: 0.5,
  },
  strict: {
    win: 0.08,
    winMin: 40,
    winMax: 60,
    accept: 0.35,
    acceptMin: 180,
    acceptMax: 280,
    left: 0.15,
    leftMin: 0.1,
    over: 0.25,
  },
};

/** "On time" onset window in wall milliseconds. */
export const hitWindowMs = (bpm: number, rate: number, s: Strictness = 'normal'): number => {
  const p = PRESETS[s];
  return Math.min(p.winMax, Math.max(p.winMin, (p.win * 60000) / (bpm * rate)));
};

/** A press this far from its note (wall ms) still counts, graded early or late. */
export const acceptWindowMs = (bpm: number, rate: number, s: Strictness = 'normal'): number => {
  const p = PRESETS[s];
  return Math.min(p.acceptMax, Math.max(p.acceptMin, (p.accept * 60000) / (bpm * rate)));
};
/** widest and narrowest accept window of any preset: bounds for scanning the note list */
const ACCEPT_MIN_MS = 180;
const ACCEPT_MAX_MS = 500;
/** Long notes may be struck even later than the accept window: up to half their length, capped. */
const LATE_MAX_MS = 1000;

/** 1 inside the on-time window, falling to 0.2 at the edge of the accept window and beyond. */
export const timingScore = (absDevMs: number, win: number, accept: number): number =>
  absDevMs <= win ? 1 : absDevMs >= accept ? 0.2 : 1 - (0.8 * (absDevMs - win)) / (accept - win);

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
  /** per note: PENDING, HIT, MISSED or SHORT */
  readonly state: Uint8Array;
  /** per note: onset deviation in wall ms (negative = early); NaN when not measured */
  readonly deviation: Float32Array;
  /** per note: ON_TIME, EARLY or LATE (meaningful once the note is hit) */
  readonly grade: Uint8Array;
  /** per note: timing score 0..1; NaN when not measured */
  readonly timing: Float32Array;
  /** per note: hold score 0..1 (1 until the key is let go too early) */
  readonly hold: Float32Array;
  /** per pitch: 1 while a key judged wrong is down */
  readonly wrongDown = new Uint8Array(128);
  /** bumps whenever a note is judged or a wrong key is counted, so the UI can poll cheaply */
  revision = 0;

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
  long = 0;
  /** live sustain pedal: with it down, letting a key go early is fine */
  pedalDown = false;
  /** how closely the playing is followed; can change mid-pass */
  strictness: Strictness = 'normal';
  /** calibration: the player's presses arrive this many ms late (tempo mode judges as if earlier) */
  offsetMs = 0;
  /** per note: index of its measure */
  private readonly noteMeasure: Uint16Array;
  /** per measure: wrong keys pressed there in this pass */
  private readonly wrongIn: Uint16Array;

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
    this.grade = new Uint8Array(song.count);
    this.timing = new Float32Array(song.count).fill(Number.NaN);
    this.hold = new Float32Array(song.count).fill(1);
    this.noteMeasure = new Uint16Array(song.count);
    const ms = song.measureStart;
    for (let i = 0, m = 0; i < song.count; i++) {
      while (m + 1 < ms.length && ms[m + 1]! <= song.start[i]! + 1e-6) m++;
      this.noteMeasure[i] = m;
    }
    this.wrongIn = new Uint16Array(Math.max(1, ms.length));
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
      this.grade[i] = ON_TIME;
      this.timing[i] = Number.NaN;
      this.hold[i] = 1;
    }
    this.wrongDown.fill(0);
    this.wrongIn.fill(0);
    this.long = 0;
    this.revision++;
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
      this.revision++;
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

  /** Wait mode: is `p` one of the keys due now or within the early-press allowance after song time `t`? */
  private expectedSoon(p: number, t: number): boolean {
    const until = Math.max(t, this.gateTime) + (EARLY_MS / 1000) * this.transport.rate;
    for (let g = this.group; g < this.groupCount; g++) {
      if (g > this.group && this.groupTime(g) > until) break;
      if (this.inGroup(g, p)) return true;
    }
    return false;
  }

  /** Song-time shift that takes the calibrated input delay out of tempo-mode judging. */
  private shift(): number {
    return this.config.mode === 'tempo' ? (this.offsetMs / 1000) * this.transport.rate : 0;
  }

  private countWrong(p: number, t: number): void {
    const ms = this.song.measureStart;
    let m = 0;
    while (m + 1 < ms.length && ms[m + 1]! <= t) m++;
    this.wrongIn[m]!++;
    this.wrong++;
    this.wrongDown[p] = 1;
    this.revision++;
  }

  /** Wall ms after its start until which note `i` can still be struck. */
  private lateLimitMs(i: number, accept: number): number {
    const lenMs = ((this.song.end[i]! - this.song.start[i]!) / this.transport.rate) * 1000;
    return Math.max(accept, Math.min(LATE_MAX_MS, 0.5 * lenMs));
  }

  /** Marks note `i` as SHORT when it was let go at song time `t` with too much of it left. */
  private checkRelease(i: number, t: number): void {
    if (this.pedalDown || this.state[i] !== HIT) return;
    const { start, end } = this.song;
    const len = end[i]! - start[i]!;
    const left = end[i]! - t;
    const P = PRESETS[this.strictness];
    const rate = this.transport.rate;
    if (left > Math.max(P.leftMin * rate, P.left * len)) {
      this.state[i] = SHORT;
      this.short++;
      this.hold[i] = Math.min(1, Math.max(0, 1 - left / len));
      this.revision++;
    } else if (-left > Math.max(0.3 * rate, P.over * len)) {
      // held on well after the note was over
      this.long++;
      this.hold[i] = 0.5;
      this.revision++;
    }
  }

  /** Feed every note-off from the player. */
  noteOff(p: number, wall: number): void {
    this.down[p] = 0;
    this.wrongDown[p] = 0;
    const i = this.holding[p]!;
    if (i < 0) return;
    this.holding[p] = -1;
    if (this.running) this.checkRelease(i, this.transport.time(wall) - this.shift());
  }

  /** Feed every note-on from the player. `wall` is the MIDI event timestamp. */
  noteOn(p: number, wall: number): void {
    this.lastOn[p] = wall;
    this.down[p] = 1;
    this.wrongDown[p] = 0;
    if (!this.running) return;
    const tr = this.transport;
    const t = tr.time(wall);
    if (t < this.leadStart) return;

    if (this.config.mode === 'wait') {
      if (!this.inGroup(this.group, p)) {
        // a key of one of the next notes, pressed a little ahead, is not a mistake
        if (t >= this.rangeStart - 0.05 && !this.expectedSoon(p, t)) this.countWrong(p, t);
        return;
      }
      if (this.waiting && this.groupSatisfied(this.group, 0)) {
        this.completeGroup(this.group);
        this.waiting = false;
        tr.play(wall);
      }
      return;
    }

    // tempo mode: the pending note of this pitch that the press most likely belongs to
    const { start, pitch, tempo } = this.song;
    const rate = tr.rate;
    const tj = t - this.shift();
    const strict = this.strictness;
    let best = -1;
    let bestDev = Number.POSITIVE_INFINITY;
    let bestWin = 0;
    let bestAccept = 0;
    for (let k = this.missPtr; k < this.active.length; k++) {
      const i = this.active[k]!;
      const dev = ((tj - start[i]!) / rate) * 1000;
      if (dev < -ACCEPT_MAX_MS) break; // further notes are even later
      if (pitch[i] !== p || this.state[i] !== PENDING) continue;
      const bpm = tempo.bpmAt(tempo.toBeats(start[i]!));
      const accept = acceptWindowMs(bpm, rate, strict);
      if (dev < -accept || dev > this.lateLimitMs(i, accept)) continue;
      const win = hitWindowMs(bpm, rate, strict);
      // The earliest open note wins (people run late more than early), unless a later one is
      // right on time, or the earliest is only open because it is a long note.
      const take =
        best < 0 ||
        Math.abs(dev) <= win ||
        (bestDev > bestAccept && Math.abs(dev) < Math.abs(bestDev));
      if (take) {
        best = i;
        bestDev = dev;
        bestWin = win;
        bestAccept = accept;
      }
    }
    if (best >= 0) {
      this.state[best] = HIT;
      this.deviation[best] = bestDev;
      this.grade[best] = Math.abs(bestDev) <= bestWin ? ON_TIME : bestDev < 0 ? EARLY : LATE;
      this.timing[best] = timingScore(Math.abs(bestDev), bestWin, bestAccept);
      this.hits++;
      this.revision++;
      this.holding[p] = best;
    } else if (t >= this.rangeStart - 0.05) this.countWrong(p, t);
  }

  /**
   * Result of the pass so far (`final` = false: only notes already judged count) or of the whole
   * pass. Allocates; not for the frame loop.
   */
  result(final: boolean, wall: number = performance.now()): PassResult {
    const tempoMode = this.config.mode === 'tempo';
    let sum = 0;
    let timingSum = 0;
    let holdSum = 0;
    let devSum = 0;
    let early = 0;
    let late = 0;
    const devs: number[] = [];
    const err = new Float32Array(this.wrongIn.length);
    for (let m = 0; m < err.length; m++) err[m] = this.wrongIn[m]!;
    for (let k = 0; k < this.active.length; k++) {
      const i = this.active[k]!;
      const st = this.state[i]!;
      const m = this.noteMeasure[i]!;
      if (st === MISSED || (final && st === PENDING)) err[m]! += 1;
      if (st !== HIT && st !== SHORT) continue;
      const h = this.hold[i]!;
      if (h < 1) err[m]! += 0.5;
      if (tempoMode && this.grade[i] !== ON_TIME) err[m]! += 0.5;
      if (tempoMode) devs.push(this.deviation[i]!);
      holdSum += h;
      if (tempoMode) {
        const tm = this.timing[i]!;
        timingSum += tm;
        devSum += this.deviation[i]!;
        if (this.grade[i] === EARLY) early++;
        else if (this.grade[i] === LATE) late++;
        sum += noteScore(tm, h);
      } else sum += noteScore(null, h);
    }
    const hits = this.hits;
    const missed = !tempoMode ? 0 : final ? this.expected - hits : this.missed;
    const judged = final ? this.expected : hits + missed;
    const total = judged + this.wrong;
    let median: number | null = null;
    let spread: number | null = null;
    if (devs.length > 0) {
      median = medianOf(devs);
      spread = medianOf(devs.map((d) => Math.abs(d - median!)));
    }
    return {
      expected: this.expected,
      judged,
      hits,
      missed,
      wrong: this.wrong,
      short: this.short,
      early,
      late,
      notes: judged > 0 ? hits / judged : 1,
      timing: tempoMode && hits > 0 ? timingSum / hits : null,
      hold: hits > 0 ? holdSum / hits : null,
      meanDeviation: tempoMode && hits > 0 ? devSum / hits : null,
      long: this.long,
      medianDeviation: median,
      spread,
      weak: this.weakSpot(err),
      accuracy: total > 0 ? sum / total : 1,
      seconds: (wall - this.passStartWall) / 1000,
    };
  }

  /** The few measures of the practised range with the most mistakes, when they stand out. */
  private weakSpot(err: Float32Array): { a: number; b: number } | null {
    const ms = this.song.measureStart;
    let first = 0;
    while (first + 1 < ms.length && ms[first + 1]! <= this.rangeStart + 1e-6) first++;
    let last = first;
    while (last + 1 < ms.length && ms[last + 1]! < this.rangeEnd - 1e-6) last++;
    if (last - first < 2) return null;
    let worst = first;
    for (let m = first; m <= last; m++) if (err[m]! > err[worst]!) worst = m;
    if (err[worst]! < 1) return null;
    let a = worst;
    let b = worst;
    while (b < last && b - a < 3 && err[b + 1]! >= 1) b++;
    while (a > first && b - a < 3 && err[a - 1]! >= 1) a--;
    return b - a >= last - first ? null : { a, b };
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
      // notes whose last chance has passed become misses; long ones stay open a little longer
      const { start, tempo } = this.song;
      const rate = tr.rate;
      const shift = this.shift();
      for (let k = this.missPtr; k < this.active.length; k++) {
        const i = this.active[k]!;
        const dev = ((t - shift - start[i]!) / rate) * 1000;
        if (dev <= ACCEPT_MIN_MS) break;
        if (this.state[i] === PENDING) {
          const accept = acceptWindowMs(
            tempo.bpmAt(tempo.toBeats(start[i]!)),
            rate,
            this.strictness,
          );
          if (dev > this.lateLimitMs(i, accept)) {
            this.state[i] = MISSED;
            this.missed++;
            this.revision++;
          }
        }
        if (k === this.missPtr && this.state[i] !== PENDING) this.missPtr++;
      }
    }

    if (!this.waiting && t >= this.rangeEnd - 1e-6) {
      this.onPass?.(this.result(true, wall));
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

function medianOf(values: number[]): number {
  const v = [...values].sort((x, y) => x - y);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}
