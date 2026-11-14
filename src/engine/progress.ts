/** Progress over time from the history of finished passes. Pure, no DOM. */

export interface ScoredPass {
  /** Date.now() */
  at: number;
  /** 0..100 */
  score: number;
}

export interface DayScore {
  /** local midnight of the day, ms */
  day: number;
  /** best score of the day, 0..100 */
  best: number;
  passes: number;
}

/** One entry per day that has passes, oldest first, with that day's best score. */
export function dailyScores(passes: ScoredPass[]): DayScore[] {
  const days = new Map<number, DayScore>();
  for (const p of passes) {
    const d = new Date(p.at);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const cur = days.get(day);
    if (!cur) days.set(day, { day, best: p.score, passes: 1 });
    else {
      cur.passes++;
      if (p.score > cur.best) cur.best = p.score;
    }
  }
  return [...days.values()].sort((a, b) => a.day - b.day);
}
