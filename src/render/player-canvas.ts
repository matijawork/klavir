/**
 * Falling-notes renderer. Runs on requestAnimationFrame, reads typed arrays and plain fields only,
 * and allocates nothing per frame. Time-driven, so it is correct at any refresh rate.
 */
import { type Tokens, tokens, withAlpha } from '../design/tokens.ts';
import { HIGH, isBlack, keyW, keyX, LOW, noteName, WHITE_COUNT } from '../engine/keys.ts';
import { EARLY, HIT, LATE, MISSED, type PracticeSession, SHORT } from '../engine/session.ts';
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
const NOTE_RADIUS = 6;
const FINGER = ['', '1', '2', '3', '4', '5'];
const FONT_FINGER = '700 12px Inter, system-ui, sans-serif';
const FONT_FINGER_SMALL = '700 9px Inter, system-ui, sans-serif';
const GLOW_COLORS = [
  'accent',
  'hand-left',
  'hand-right',
  'fb-correct',
  'text',
  'fb-wrong',
  'fb-late',
] as const;
const GLOW_WRONG = 5;
const GLOW_RELEASE = 6;
/** seconds (real time) the "let go" flash stays on the hit line after a note ends */
const RELEASE_FLASH = 0.35;
const SPARKS = 256;
/** sparks per second from one sounding key */
const SPARK_RATE = 10;
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
  /** ms the picture runs ahead of the song clock, to cancel a slow screen; judging is untouched */
  pictureMs = 0;
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
  private readonly beam: Record<string, HTMLCanvasElement> = {};
  private readonly sparkX = new Float32Array(SPARKS);
  private readonly sparkY = new Float32Array(SPARKS);
  private readonly sparkVx = new Float32Array(SPARKS);
  private readonly sparkVy = new Float32Array(SPARKS);
  private readonly sparkLife = new Float32Array(SPARKS);
  private readonly sparkColor = new Uint8Array(SPARKS);
  private sparkNext = 0;
  private sparkAcc = 0;
  private dt = 0;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  /** start and end (song seconds) of the practised note most recently sounding on each key */
  private readonly dueStart = new Float64Array(128);
  private readonly dueEnd = new Float64Array(128).fill(-1);
  /** keys that were down while their note sounded and have not come up since */
  private readonly ride = new Uint8Array(128);
  private now = 0;
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
    for (const name of GLOW_COLORS) {
      this.glow[name] = makeGlow(this.tk[name]);
      this.beam[name] = makeBeam(this.tk[name]);
    }
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
    this.dt = this.lastFrame > 0 ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
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
    const t = this.session.update(now);
    this.draw(t + (this.pictureMs / 1000) * this.session.transport.rate);
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
    this.now = t;
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
    const grade = session.grade;
    const mask = session.config.handMask;
    const soonUntil = t + 1.5 * rate;
    this.due.fill(0);
    this.soon.fill(0);
    while (this.first > 0 && start[this.first - 1]! + maxLen >= t) this.first--;
    while (this.first < count && start[this.first]! + maxLen < t) this.first++;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sheen = withAlphaCached(tk.text, 0.16);
    const edge = withAlphaCached(tk.text, 0.6);
    const badge = withAlphaCached(tk.bg, 0.62);
    const cap = withAlphaCached(tk.text, 0.9);
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
        if (mine && inRange && active && !this.demo) {
          this.dueStart[p] = s;
          this.dueEnd[p] = e;
        }
        const st = state[i]!;
        // green on time, yellow early, orange late, red let go too soon, grey missed
        const base =
          st === HIT
            ? grade[i] === EARLY
              ? tk['fb-early']
              : grade[i] === LATE
                ? tk['fb-late']
                : tk['fb-correct']
            : st === MISSED
              ? tk['fb-missed']
              : st === SHORT
                ? tk['fb-wrong']
                : hand[i]
                  ? tk['hand-right']
                  : tk['hand-left'];
        const x = keyX[p]! * w + 1;
        const bw = keyW[p]! * w - 2;
        const yBottom = Math.min(hitY, hitY - (s - t) * pps);
        const yTop = hitY - (e - t) * pps;
        const bh = Math.max(4, yBottom - yTop - 2);
        const dim = !mine || !inRange;
        if (!dim) {
          // soft halo around the note
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = withAlphaCached(base, active ? 0.2 : 0.08);
          ctx.beginPath();
          ctx.roundRect(x - 4, yBottom - bh - 4, bw + 8, bh + 8, NOTE_RADIUS + 4);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = dim
          ? withAlphaCached(base, 0.18)
          : pass
            ? withAlphaCached(base, 0.8)
            : base;
        ctx.beginPath();
        ctx.roundRect(x, yBottom - bh, bw, bh, NOTE_RADIUS);
        ctx.fill();
        if (dim) continue;
        if (bh > 8) {
          ctx.fillStyle = sheen;
          ctx.beginPath();
          ctx.roundRect(x + 2, yBottom - bh + 2, Math.max(2, bw * 0.26), bh - 4, 3);
          ctx.fill();
        }
        if (!active && bw > 8) {
          ctx.fillStyle = edge;
          ctx.fillRect(x + 3, yBottom - 3, bw - 6, 2);
        }
        // end cap: when this line reaches the keys, let go
        if (!this.demo && (e - s) * pps > 22 && bh > 10) {
          ctx.fillStyle = cap;
          ctx.fillRect(x + 2, yBottom - bh + 2, bw - 4, 3);
        }
        const f = finger[i]!;
        if (this.showFingers && f > 0 && f < 6 && bw > 9) {
          const r = Math.min(9, bw / 2 - 1);
          const cx = x + bw / 2;
          const cy = yBottom - r - (active ? 3 : 6);
          ctx.fillStyle = badge;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, 6.2832);
          ctx.fill();
          ctx.font = r < 7 ? FONT_FINGER_SMALL : FONT_FINGER;
          ctx.fillStyle = tk.text;
          ctx.fillText(FINGER[f]!, cx, cy + 0.5);
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

  /** Lane at the left edge: where the song holds the sustain pedal, and the live pedal. */
  private drawPedalLane(t: number, pps: number, hitY: number): void {
    const { ctx, tk, song, w } = this;
    const pt = song.pedalTime;
    const laneW = 14;
    const x = 6;
    let wanted = false;
    if (pt.length > 0) {
      ctx.fillStyle = tk['surface-1'];
      ctx.fillRect(x, 0, laneW, hitY);
      let downAt = -1;
      for (let i = 0; i < pt.length; i++) {
        if (song.pedalOn[i]) {
          if (downAt < 0) downAt = pt[i]!;
        } else if (downAt >= 0) {
          const now = downAt <= t && pt[i]! > t;
          if (now) wanted = true;
          const y1 = hitY - (downAt - t) * pps;
          const y0 = hitY - (pt[i]! - t) * pps;
          downAt = -1;
          if (y1 < 0) break;
          if (y0 > hitY) continue;
          ctx.fillStyle = now
            ? this.pedalDown
              ? tk['fb-correct']
              : tk.pedal
            : withAlphaCached(tk.pedal, 0.55);
          ctx.beginPath();
          ctx.roundRect(x, Math.max(0, y0), laneW, Math.min(hitY, y1) - Math.max(0, y0) - 2, 4);
          ctx.fill();
        }
      }
    }
    if (this.pedalDown || wanted) {
      // strip along the hit line: solid while the pedal is down, faint while the song asks for it
      const color = this.pedalDown
        ? wanted || pt.length === 0
          ? tk['fb-correct']
          : tk.pedal
        : tk.pedal;
      ctx.globalAlpha = this.pedalDown ? 0.9 : 0.3;
      ctx.fillStyle = color;
      ctx.fillRect(0, hitY - 5, w, 3);
      ctx.globalAlpha = 1;
    }
  }

  private drawKeyboard(top: number): void {
    const { ctx, w, tk, due } = this;
    const kh = this.keysH;
    const blackH = kh * 0.62;
    const rate = this.session.transport.rate;
    ctx.fillStyle = tk['key-white'];
    ctx.fillRect(0, top, w, kh);

    // white keys: tint, separators
    for (let p = LOW; p <= HIGH; p++) {
      if (isBlack(p)) continue;
      const x = keyX[p]! * w;
      const kw = keyW[p]! * w;
      const pressed = held[p]! > 0;
      if (!pressed) this.ride[p] = 0;
      else if (due[p]) this.ride[p] = 1;
      const fill = this.keyFill(p);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, top, kw, kh * this.holdLeft(p));
        if (this.letGo(p)) this.drawArrow(x + kw / 2, top + kh * 0.2, Math.min(7, kw * 0.3));
      }
      ctx.fillStyle = withAlphaCached(tk.bg, 0.3);
      ctx.fillRect(Math.round(x + kw) - 1, top, 1, kh);
    }
    for (let p = LOW; p <= HIGH; p++) {
      if (!isBlack(p)) continue;
      const x = keyX[p]! * w;
      const kw = keyW[p]! * w;
      ctx.fillStyle = tk['key-black'];
      ctx.beginPath();
      ctx.roundRect(x, top, kw, blackH, BLACK_RADII);
      ctx.fill();
      const pressed = held[p]! > 0;
      if (!pressed) this.ride[p] = 0;
      else if (due[p]) this.ride[p] = 1;
      const fill = this.keyFill(p);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(x, top, kw, Math.max(4, blackH * this.holdLeft(p)), BLACK_RADII);
        ctx.fill();
        if (this.letGo(p)) this.drawArrow(x + kw / 2, top + blackH * 0.3, Math.min(5, kw * 0.32));
      }
    }

    // light above pressed and sounding keys (additive, pre-rendered sprites)
    ctx.globalCompositeOperation = 'lighter';
    this.sparkAcc += this.dt * SPARK_RATE;
    const spawn = this.calm ? 0 : Math.floor(this.sparkAcc);
    this.sparkAcc -= Math.floor(this.sparkAcc);
    for (let p = LOW; p <= HIGH; p++) {
      const pressed = held[p]! > 0;
      const d = due[p]!;
      // a note just ended on this key: flash the hit line above it
      const since = (this.now - this.dueEnd[p]!) / rate;
      if (!d && !this.demo && this.dueEnd[p]! >= 0 && since >= 0 && since < RELEASE_FLASH) {
        const kx = keyX[p]! * w;
        ctx.globalAlpha = 1 - since / RELEASE_FLASH;
        ctx.fillStyle = tk['fb-late'];
        ctx.fillRect(kx - 2, top - 7, keyW[p]! * w + 4, 7);
      }
      if (!pressed && !d) continue;
      const ci = pressed
        ? this.session.wrongDown[p]
          ? GLOW_WRONG
          : d
            ? 3
            : this.letGo(p)
              ? GLOW_RELEASE
              : 0
        : d;
      const name = GLOW_COLORS[ci]!;
      const kw = keyW[p]! * w;
      const cx = (keyX[p]! + kw / w / 2) * w;
      const gw = Math.max(40, kw * 2.6);
      const gh = gw * 1.2;
      const bw = Math.max(22, kw * 1.7);
      const bh = Math.min(top * 0.25, 110);
      ctx.globalAlpha = pressed ? 0.45 : 0.18;
      ctx.drawImage(this.beam[name]!, cx - bw / 2, top - bh, bw, bh);
      ctx.globalAlpha = pressed ? 0.7 : 0.4;
      ctx.drawImage(this.glow[name]!, cx - gw / 2, top - gh / 2, gw, gh);
      if (pressed && d) for (let k = 0; k < spawn; k++) this.addSpark(cx, top, kw, ci);
    }
    this.drawSparks();
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
        ctx.fillStyle = black ? tk.text : withAlphaCached(tk.bg, 0.85);
        ctx.fillText(
          noteName(p, this.octaveNumbers || isC),
          cx,
          black ? top + blackH - 6 : top + kh - 6,
        );
      } else {
        ctx.font = '500 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = withAlphaCached(tk.bg, 0.5);
        ctx.fillText(noteName(p), cx, top + kh - 6);
      }
    }
  }

  private addSpark(cx: number, y: number, kw: number, color: number): void {
    const i = this.sparkNext;
    this.sparkNext = (i + 1) % SPARKS;
    this.sparkX[i] = cx + (Math.random() - 0.5) * kw;
    this.sparkY[i] = y;
    this.sparkVx[i] = (Math.random() - 0.5) * 60;
    this.sparkVy[i] = -(70 + Math.random() * 170);
    this.sparkLife[i] = 0.5 + Math.random() * 0.5;
    this.sparkColor[i] = color;
  }

  private drawSparks(): void {
    const { ctx, tk, dt } = this;
    for (let i = 0; i < SPARKS; i++) {
      const life = this.sparkLife[i]! - dt * 1.4;
      if (life <= 0) {
        this.sparkLife[i] = 0;
        continue;
      }
      this.sparkLife[i] = life;
      this.sparkX[i]! += this.sparkVx[i]! * dt;
      this.sparkY[i]! += this.sparkVy[i]! * dt;
      this.sparkVy[i]! += 60 * dt;
      const size = 1.5 + life * 2;
      ctx.globalAlpha = Math.min(1, life * 1.4);
      ctx.fillStyle = tk[GLOW_COLORS[this.sparkColor[i]!]!];
      ctx.fillRect(this.sparkX[i]! - size / 2, this.sparkY[i]! - size / 2, size, size);
    }
  }

  /**
   * Share of the current note still to be held on key `p`, 1..0. The key's colour drains towards
   * the top as the note runs out, so an empty key means "let go". 1 when no note is sounding.
   */
  private holdLeft(p: number): number {
    if (!this.due[p] || this.demo) return 1;
    const len = this.dueEnd[p]! - this.dueStart[p]!;
    if (len <= 0) return 1;
    return Math.min(1, Math.max(0.04, (this.dueEnd[p]! - this.now) / len));
  }

  /** True while key `p` is still down although the note it was holding has ended: time to let go. */
  private letGo(p: number): boolean {
    if (!this.ride[p] || this.due[p] || held[p] === 0) return false;
    const over = this.now - this.dueEnd[p]!;
    return this.dueEnd[p]! >= 0 && over >= 0 && over < 4 * this.session.transport.rate;
  }

  /** Small upward arrow on a key: lift the finger. */
  private drawArrow(cx: number, cy: number, r: number): void {
    const { ctx } = this;
    ctx.fillStyle = this.tk.bg;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r * 0.7);
    ctx.lineTo(cx - r, cy + r * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  private keyFill(p: number): string | null {
    const d = this.due[p]!;
    if (held[p]! > 0) {
      if (this.session.wrongDown[p]) return this.tk['fb-wrong'];
      if (d) return this.tk['fb-correct'];
      return this.letGo(p) ? this.tk['fb-late'] : this.tk.accent;
    }
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
  grad.addColorStop(0, withAlpha(hex, 1));
  grad.addColorStop(0.25, withAlpha(hex, 0.6));
  grad.addColorStop(0.55, withAlpha(hex, 0.18));
  grad.addColorStop(1, withAlpha(hex, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Column of light rising from a key: bright at the bottom, fading up and to the sides. */
function makeBeam(hex: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  const up = g.createLinearGradient(0, 128, 0, 0);
  up.addColorStop(0, withAlpha(hex, 0.75));
  up.addColorStop(0.4, withAlpha(hex, 0.22));
  up.addColorStop(1, withAlpha(hex, 0));
  g.fillStyle = up;
  g.fillRect(0, 0, 32, 128);
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, 32, 0);
  side.addColorStop(0, withAlpha(hex, 0));
  side.addColorStop(0.5, withAlpha(hex, 1));
  side.addColorStop(1, withAlpha(hex, 0));
  g.fillStyle = side;
  g.fillRect(0, 0, 32, 128);
  return c;
}
