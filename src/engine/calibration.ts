/**
 * Click-along calibration (ADR-009): the player taps one key on every click and the steady part of
 * the gap between click and tap is the delay of the equipment (plus the habit of the hands).
 * Pure, no DOM. All times are performance.now() milliseconds.
 */

/** clicks in one run, their spacing, and how many at the start are only for finding the pulse */
export const CAL_CLICKS = 20;
export const CAL_PERIOD_MS = 600;
export const CAL_SKIP = 4;
/** fewer taps than this is not a measurement */
export const CAL_MIN_TAPS = 8;
/** taps scattered more than this (median distance from the median, ms) are not a measurement */
export const CAL_MAX_SPREAD = 40;
/** same range as the Offset slider */
export const CAL_LIMIT = 150;

export interface DelayResult {
  /** ms the taps arrive after the clicks (negative = before), rounded to 5 */
  ms: number;
  /** typical distance of a tap from that value, ms */
  spread: number;
  /** taps that counted */
  used: number;
  /** null = usable; 'few' = not enough taps; 'uneven' = too scattered */
  problem: 'few' | 'uneven' | null;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/**
 * Delay of the taps against the clicks. Each click takes its nearest tap; the first `skip` clicks
 * are ignored; taps far from the rest (a slip, a double press) are dropped before the median.
 */
export function measureDelay(
  clicks: number[],
  taps: number[],
  skip: number = CAL_SKIP,
): DelayResult {
  const period =
    clicks.length > 1 ? (clicks[clicks.length - 1]! - clicks[0]!) / (clicks.length - 1) : 0;
  const devs: number[] = [];
  for (let c = skip; c < clicks.length; c++) {
    let best = Number.NaN;
    for (const t of taps) {
      const d = t - clicks[c]!;
      if (Math.abs(d) < period / 2 && !(Math.abs(d) >= Math.abs(best))) best = d;
    }
    if (!Number.isNaN(best)) devs.push(best);
  }
  if (devs.length < CAL_MIN_TAPS) return { ms: 0, spread: 0, used: devs.length, problem: 'few' };
  const mid = median(devs);
  const mad = median(devs.map((d) => Math.abs(d - mid)));
  const keep = devs.filter((d) => Math.abs(d - mid) <= Math.max(30, 3 * 1.4826 * mad));
  const value = median(keep);
  const spread = median(keep.map((d) => Math.abs(d - value)));
  const ms = Math.max(-CAL_LIMIT, Math.min(CAL_LIMIT, Math.round(value / 5) * 5));
  if (keep.length < CAL_MIN_TAPS) return { ms, spread, used: keep.length, problem: 'few' };
  return { ms, spread, used: keep.length, problem: spread > CAL_MAX_SPREAD ? 'uneven' : null };
}
