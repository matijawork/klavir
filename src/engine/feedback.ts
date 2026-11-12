/** Turns a pass result into plain words: a verdict and what to work on next. Pure, no DOM. */
import type { PassResult } from './session.ts';

export interface Feedback {
  verdict: string;
  /** most important first, at most three */
  tips: string[];
}

export interface FeedbackContext {
  mode: 'wait' | 'tempo';
  /** 0.1 .. 1.5 */
  speed: number;
  metronome: boolean;
}

const n = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;

/** A steady early/late habit is more likely equipment delay than playing: ms to compensate, or null. */
export function calibrationHint(r: PassResult): number | null {
  if (r.medianDeviation === null || r.spread === null || r.hits < 8) return null;
  if (Math.abs(r.medianDeviation) < 30 || r.spread > 60) return null;
  return Math.round(r.medianDeviation / 5) * 5;
}

export function feedback(r: PassResult, ctx: FeedbackContext): Feedback {
  const a = r.accuracy;
  const verdict =
    a >= 0.95
      ? 'Excellent'
      : a >= 0.85
        ? 'Very good'
        : a >= 0.7
          ? 'Good'
          : a >= 0.5
            ? 'Getting there'
            : 'Keep practising';

  // each tip with the share of the score it costs, so the biggest problem comes first
  const tips: [number, string][] = [];
  const total = Math.max(1, r.expected);
  if (r.missed > 0) {
    const slower = Math.max(30, Math.round((ctx.speed * 100 * 0.8) / 5) * 5);
    tips.push([
      r.missed / total,
      r.missed / total > 0.2
        ? `You skipped ${n(r.missed, 'note')}. Slow down to ${slower} % or use Wait mode until the notes are safe.`
        : `You skipped ${n(r.missed, 'note')}. Loop that spot a few times.`,
    ]);
  }
  if (r.wrong > 0)
    tips.push([
      r.wrong / total,
      `${n(r.wrong, 'wrong key')}. Look at the next note before you press, not at your hand.`,
    ]);
  const off = r.early + r.late;
  if (off > 0 && r.hits > 0) {
    const ms = Math.round(Math.abs(r.medianDeviation ?? 0) / 10) * 10;
    const about = ms >= 30 ? ` (about ${ms} ms)` : '';
    let text: string;
    if (r.late >= 3 * Math.max(1, r.early))
      text = `You press after the beat on ${n(r.late, 'note')}${about}. Get the finger ready earlier and press as the note touches the keys.`;
    else if (r.early >= 3 * Math.max(1, r.late))
      text = `You rush: ${n(r.early, 'note')} came before the beat${about}. Wait until the note touches the keys.`;
    else
      text = `Uneven rhythm: ${r.early} early, ${r.late} late. ${ctx.metronome ? 'Count along with the metronome.' : 'Turn on the metronome (M) and count along.'}`;
    tips.push([(0.35 * off) / total, text]);
  }
  if (r.short > 0)
    tips.push([
      (0.25 * r.short) / total,
      `You let go of ${n(r.short, 'note')} too soon. Hold until the white line at the top of the bar reaches the keys.`,
    ]);
  if (r.long > 0)
    tips.push([
      (0.12 * r.long) / total,
      `You held ${n(r.long, 'note')} too long. Lift the finger when the key turns orange.`,
    ]);
  tips.sort((x, y) => y[0] - x[0]);
  const out = tips.slice(0, 3).map((t) => t[1]);
  if (out.length === 0)
    out.push(
      ctx.speed < 1
        ? 'Clean pass. Raise the speed a little.'
        : ctx.mode === 'wait'
          ? 'Clean pass. Try Tempo mode to train the rhythm.'
          : 'Clean pass. Try Strict, or the next song.',
    );
  return { verdict, tips: out };
}
