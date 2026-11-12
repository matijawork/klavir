/**
 * Falling-notes renderer. Runs on requestAnimationFrame, reads typed arrays and plain fields only,
 * and allocates nothing per frame. Time-driven, so it is correct at any refresh rate.
 */
import { type Tokens, tokens, withAlpha } from '../design/tokens.ts';
import { HIGH, isBlack, keyW, keyX, LOW, noteName, WHITE_COUNT } from '../engine/keys.ts';
import { HIT, MISSED, type PracticeSession } from '../engine/session.ts';
import type { LoadedSong } from '../engine/song.ts';
import { clearLastNoteOn, held, lastNoteOnAt } from '../midi/midi.ts';

export interface RenderStats {
  /** display refresh rate estimated from frame intervals */
  hz: number;
  avgFrameMs: number;
  /** 99th percentile frame interval */
  p99FrameMs: number;
  /** time spent drawing one frame */
  avgDrawMs: number;
  /** key press (MIDI timestamp) → start of the frame that draws its glow; excludes display scan-out */
  inputToFrameMs: number;
  frames: number;
}

const SAMPLE = 240;
const NOTE_RADIUS = 5;
const BLACK_RADII = [0, 0, 3, 3];

export class PlayerCanvas {
  /** vertical zoom: pixels per second of song time at 100 % speed */
  pxPerSec = 220;
  showFingers = true;
  /** how the hand that is not being practised is drawn */
  otherHand: 'dim' | 'hide' | 'play' = 'dim';
  noteNames: 'off' | 'upcoming' | 'all' = 'upcoming';
  octaveNumbers = false;
  /** flash the hit line on metronome beats */
  beatPulse = false;
  /** draw every note as if it were practised (Listen mode) */
  demo = false;
  /** live sustain pedal state, set by the UI */
  pedalDown = false;
  readonly stats: RenderStats = {
    hz: 0,
    avgFrameMs: 0,
    p99FrameMs: 0,
    avgDrawMs: 0,
    inputToFrameMs: 0,
    frames: 0,
  };

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly song: LoadedSong;
  private readonly session: PracticeSession;
  private readonly tk: Tokens;
  private readonly glow: Record<string, HTMLCanvasElement> = {};
  private readonly observer: ResizeObserver;
  private raf = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private keysH = 0;
  private lastFrame = 0;
  private readonly intervals = new Float32Array(SAMPLE);
  private readonly sorted = new Float32Array(SAMPLE);
  private sampleCount = 0;
  private drawSum = 0;
  private latencySum = 0;
  private latencyCount = 0;
  /** which hand's song note is sounding on each key: 0 none, 1 left, 2 right */
  private readonly due = new Uint8Array(128);
  /** keys with a note of the practised hand coming up soon */
  private readonly soon = new Uint8Array(128);
  private first = 0;
  private beatPtr = 0;

  constructor(canvas: HTMLCanvasElement, session: PracticeSession) {
    this.canvas = canvas;
    this.song = session.song;
    this.session = session;
    this.tk = tokens();
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    for (const name of ['accent', 'hand-left', 'hand-right', 'fb-correct'] as const)
      this.glow[name] = makeGlow(this.tk[name]);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    // white keys are about 5.5× as long as they are wide
    this.keysH = Math.min(this.h * 0.3, Math.max(72, (this.w / WHITE_COUNT) * 5.5));
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const t0 = performance.now();
    if (this.lastFrame > 0) {
      this.intervals[this.sampleCount % SAMPLE] = now - this.lastFrame;
      this.sampleCount++;
    }
    this.lastFrame = now;
    if (lastNoteOnAt > 0) {
      this.latencySum += Math.max(0, now - lastNoteOnAt);
      this.latencyCount++;
      clearLastNoteOn();
    }
    this.draw(this.session.update(now));
    this.drawSum += performance.now() - t0;
    this.stats.frames++;
    if (this.stats.frames % 60 === 0) this.updateStats();
  };

  private updateStats(): void {
    const n = Math.min(this.sampleCount, SAMPLE);
    if (n < 10) return;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += this.intervals[i]!;
      this.sorted[i] = this.intervals[i]!;
    }
    const view = this.sorted.subarray(0, n).sort();
    const s = this.stats;
    s.avgFrameMs = sum / n;
    s.hz = 1000 / view[n >> 1]!;
    s.p99FrameMs = view[Math.min(n - 1, Math.floor(n * 0.99))]!;
    s.avgDrawMs = this.drawSum / 60;
    this.drawSum = 0;
    if (this.latencyCount) s.inputToFrameMs = this.latencySum / this.latencyCount;
  }

  private draw(t: number): void {
    const { ctx, w, h, tk, song, session } = this;
    const hitY = h - this.keysH;
    const rate = session.transport.rate;
    // zoom is in pixels per real second, so slowing the song down spreads the notes out
    const pps = this.pxPerSec / rate;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = tk.bg;
    ctx.fillRect(0, 0, w, h);

    // octave guides at every C
    ctx.fillStyle = tk['surface-1'];
    for (let p = 24; p <= HIGH; p += 12) ctx.fillRect(Math.round(keyX[p]! * w), 0, 1, hitY);

    // measure lines
    const tTop = t + hitY / pps;
    ctx.fillStyle = tk['surface-2'];
    const ms = song.measureStart;
    for (let i = 0; i < ms.length; i++) {
      const mt = ms[i]!;
      if (mt < t) continue;
      if (mt > tTop) break;
      ctx.fillRect(0, Math.round(hitY - (mt - t) * pps), w, 1);
    }

    // practised section: boundaries, and a veil over what lies after it
    const { rangeStart, rangeEnd } = session;
    if (rangeEnd < song.duration - 1e-6 && rangeEnd < tTop) {
      const y = hitY - (rangeEnd - t) * pps;
      ctx.fillStyle = withAlphaCached(tk['surface-1'], 0.7);
      ctx.fillRect(0, 0, w, Math.max(0, y));
      ctx.fillStyle = withAlphaCached(tk.accent, 0.7);
      ctx.fillRect(0, Math.round(y) - 1, w, 2);
    }
    if (rangeStart > t && rangeStart < tTop && rangeStart > 1e-6) {
      ctx.fillStyle = withAlphaCached(tk.accent, 0.7);
      ctx.fillRect(0, Math.round(hitY - (rangeStart - t) * pps) - 1, w, 2);
    }

    // falling notes
    const { start, end, pitch, hand, finger, count, maxLen } = song;
    const state = session.state;
    const mask = session.config.handMask;
    const soonUntil = t + 1.5 * rate;
    this.due.fill(0);
    this.soon.fill(0);
    while (this.first > 0 && start[this.first - 1]! + maxLen >= t) this.first--;
    while (this.first < count && start[this.first]! + maxLen < t) this.first++;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let pass = 0; pass < 2; pass++) {
      // pass 0: white-key notes, pass 1: black-key notes on top
      for (let i = this.first; i < count; i++) {
        const s = start[i]!;
        if (s > tTop) break;
        const e = end[i]!;
        if (e < t) continue;
        const p = pitch[i]!;
        if ((isBlack(p) ? 1 : 0) !== pass) continue;
        const mine = this.demo || (mask & (1 << hand[i]!)) !== 0;
        if (!mine && this.otherHand === 'hide') continue;
        const inRange = s >= rangeStart - 1e-6 && s < rangeEnd - 1e-6;
        const active = s <= t;
        if (active && (mine || this.otherHand !== 'hide')) this.due[p] = mine ? hand[i]! + 1 : 0;
        if (mine && inRange && !active && s <= soonUntil) this.soon[p] = 1;
        const st = state[i]!;
        const base =
          st === HIT
            ? tk['fb-correct']
            : st === MISSED
              ? tk['fb-missed']
              : hand[i]
                ? tk['hand-right']
                : tk['hand-left'];
        const x = keyX[p]! * w + 1;
        const bw = keyW[p]! * w - 2;
        const yBottom = Math.min(hitY, hitY - (s - t) * pps);
        const yTop = hitY - (e - t) * pps;
        const bh = Math.max(4, yBottom - yTop - 2);
        ctx.fillStyle =
          !mine || !inRange
            ? withAlphaCached(base, 0.2)
            : active
              ? base
              : withAlphaCached(base, pass ? 0.78 : 0.9);
        ctx.beginPath();
        ctx.roundRect(x, yBottom - bh, bw, bh, NOTE_RADIUS);
        ctx.fill();
        if (mine && inRange && this.showFingers && finger[i] && bh > 16 && bw > 10 && !active) {
          ctx.fillStyle = tk.bg;
          ctx.fillText(String(finger[i]), x + bw / 2, yBottom - 9);
        }
      }
    }

    this.drawPedalLane(t, pps, hitY);

    // hit line, pulsing on count-in and metronome beats
    let pulse = 0;
    let countNumber = 0;
    const ci = session.countInTimes;
    if (t < rangeStart) {
      for (let k = ci.length - 1; k >= 0; k--) {
        if (ci[k]! <= t) {
          pulse = Math.max(0, 1 - (t - ci[k]!) / (0.22 * rate));
          countNumber = k + 1;
          break;
        }
      }
    } else if (this.beatPulse) {
      const bt = session.beats.time;
      while (this.beatPtr > 0 && bt[this.beatPtr]! > t) this.beatPtr--;
      while (this.beatPtr + 1 < bt.length && bt[this.beatPtr + 1]! <= t) this.beatPtr++;
      if (bt.length && bt[this.beatPtr]! <= t)
        pulse = Math.max(0, 1 - (t - bt[this.beatPtr]!) / (0.18 * rate));
    }
    ctx.fillStyle = withAlphaCached(tk.accent, 0.5);
    ctx.fillRect(0, hitY - 1, w, 2);
    if (pulse > 0) {
      ctx.globalAlpha = pulse;
      ctx.fillStyle = tk['accent-strong'];
      ctx.fillRect(0, hitY - 3, w, 6);
      ctx.globalAlpha = 1;
    }
    if (countNumber > 0) {
      ctx.globalAlpha = 0.35 + 0.65 * pulse;
      ctx.fillStyle = tk['accent-strong'];
      ctx.font = '650 96px Inter, system-ui, sans-serif';
      ctx.fillText(String(countNumber), w / 2, hitY * 0.42);
      ctx.globalAlpha = 1;
    }

    this.drawKeyboard(hitY);
  }

  /** Narrow lane at the left edge: when the song holds the sustain pedal, plus the live pedal. */
  private drawPedalLane(t: number, pps: number, hitY: number): void {
    const { ctx, tk, song } = this;
    const pt = song.pedalTime;
    const laneW = 10;
    const x = 6;
    if (pt.length > 0) {
      ctx.fillStyle = tk['surface-1'];
      ctx.fillRect(x, 0, laneW, hitY);
      ctx.fillStyle = withAlphaCached(tk.pedal, 0.75);
      let downAt = -1;
      for (let i = 0; i < pt.length; i++) {
        if (song.pedalOn[i]) {
          if (downAt < 0) downAt = pt[i]!;
        } else if (downAt >= 0) {
          const y1 = hitY - (downAt - t) * pps;
          const y0 = hitY - (pt[i]! - t) * pps;
          downAt = -1;
          if (y1 < 0) break;
          if (y0 > hitY) continue;
          ctx.beginPath();
          ctx.roundRect(x, Math.max(0, y0), laneW, Math.min(hitY, y1) - Math.max(0, y0), 3);
          ctx.fill();
        }
      }
    }
    if (this.pedalDown) {
      ctx.fillStyle = tk.pedal;
      ctx.beginPath();
      ctx.roundRect(x - 2, hitY - 12, laneW + 4, 12, 3);
      ctx.fill();
    }
  }

  private drawKeyboard(top: number): void {
    const { ctx, w, tk, due } = this;
    const kh = this.keysH;
    const blackH = kh * 0.62;
    ctx.fillStyle = tk['key-white'];
    ctx.fillRect(0, top, w, kh);

    // white keys: tint, separators
    for (let p = LOW; p <= HIGH; p++) {
      if (isBlack(p)) continue;
      const x = keyX[p]! * w;
      const kw = keyW[p]! * w;
      const fill = this.keyFill(p);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, top, kw, kh);
      }
      ctx.fillStyle = 'rgba(11, 10, 16, 0.28)';
      ctx.fillRect(Math.round(x + kw) - 1, top, 1, kh);
    }
    for (let p = LOW; p <= HIGH; p++) {
      if (!isBlack(p)) continue;
      const x = keyX[p]! * w;
      const kw = keyW[p]! * w;
      ctx.fillStyle = this.keyFill(p) ?? tk['key-black'];
      ctx.beginPath();
      ctx.roundRect(x, top, kw, blackH, BLACK_RADII);
      ctx.fill();
    }

    // glow above pressed and due keys (additive, pre-rendered sprites)
    ctx.globalCompositeOperation = 'lighter';
    for (let p = LOW; p <= HIGH; p++) {
      const pressed = held[p]! > 0;
      if (!pressed && !due[p]) continue;
      const sprite = pressed
        ? this.glow.accent!
        : due[p] === 2
          ? this.glow['hand-right']!
          : this.glow['hand-left']!;
      const cx = (keyX[p]! + keyW[p]! / 2) * w;
      const size = Math.max(36, keyW[p]! * w * 3.2);
      ctx.globalAlpha = pressed ? 0.95 : 0.6;
      ctx.drawImage(sprite, cx - size / 2, top - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // key labels
    const whiteW = w / WHITE_COUNT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const mode = this.noteNames;
    for (let p = LOW; p <= HIGH; p++) {
      const black = isBlack(p);
      const isC = p % 12 === 0;
      const wanted = mode === 'all' || (mode === 'upcoming' && (this.soon[p]! > 0 || due[p]! > 0));
      if (!wanted && !(isC && !black && whiteW > 16)) continue;
      if (wanted && whiteW < 13) continue;
      const cx = (keyX[p]! + keyW[p]! / 2) * w;
      if (wanted) {
        ctx.font = `600 ${black ? 9 : 11}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = black ? 'rgba(241, 238, 251, 0.92)' : 'rgba(11, 10, 16, 0.85)';
        ctx.fillText(
          noteName(p, this.octaveNumbers || isC),
          cx,
          black ? top + blackH - 6 : top + kh - 6,
        );
      } else {
        ctx.font = '500 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(11, 10, 16, 0.5)';
        ctx.fillText(noteName(p), cx, top + kh - 6);
      }
    }
  }

  private keyFill(p: number): string | null {
    if (held[p]! > 0) return this.tk.accent;
    const d = this.due[p]!;
    if (d === 0) return null;
    const color = d === 2 ? this.tk['hand-right'] : this.tk['hand-left'];
    return withAlphaCached(color, isBlack(p) ? 0.9 : 0.55);
  }
}

const alphaCache = new Map<string, string>();
function withAlphaCached(hex: string, alpha: number): string {
  const key = hex + alpha;
  let v = alphaCache.get(key);
  if (!v) {
    v = withAlpha(hex, alpha);
    alphaCache.set(key, v);
  }
  return v;
}

function makeGlow(hex: string): HTMLCanvasElement {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, withAlpha(hex, 0.85));
  grad.addColorStop(0.35, withAlpha(hex, 0.32));
  grad.addColorStop(1, withAlpha(hex, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}
