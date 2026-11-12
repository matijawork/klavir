/** Repeat structure of one source measure, as read from MusicXML. */
export interface MeasureFlow {
  repeatStart?: boolean;
  /** number of times the repeated passage is played (default 2) */
  repeatEnd?: number;
  /** volta numbers this measure belongs to */
  endings?: number[];
  segno?: boolean;
  coda?: boolean;
  fine?: boolean;
  toCoda?: boolean;
  daCapo?: boolean;
  dalSegno?: boolean;
}

/**
 * Returns the order in which source measures are played.
 * Conventions: repeats are not taken after a D.C./D.S. jump and the last volta is used there;
 * Fine and To Coda only apply after a jump.
 */
export function unrollMeasures(flow: MeasureFlow[]): number[] {
  const order: number[] = [];
  const n = flow.length;
  const maxEnding = (from: number): number => {
    let max = 2;
    for (let k = from; k < n; k++) {
      const m = flow[k]!;
      if (k > from && m.repeatStart) break;
      for (const e of m.endings ?? []) max = Math.max(max, e);
      if (m.repeatEnd) max = Math.max(max, m.repeatEnd);
    }
    return max;
  };

  let i = 0;
  let repStart = 0;
  let pass = 1;
  let jumped = false;
  let resetAfterVolta = false;
  let guard = 0;

  while (i < n) {
    if (++guard > 20000) throw new Error('Repeat structure does not terminate');
    const m = flow[i]!;
    if (m.repeatStart && repStart !== i) {
      repStart = i;
      pass = jumped ? maxEnding(i) : 1;
    }
    if (m.endings && !m.endings.includes(pass)) {
      // not our volta: skip it; a skipped backward repeat closes the repeated passage
      if (m.repeatEnd) {
        repStart = i + 1;
        resetAfterVolta = !jumped;
      }
      i++;
      continue;
    }
    if (!m.endings && resetAfterVolta) {
      pass = 1;
      resetAfterVolta = false;
    }
    order.push(i);

    if (jumped && m.fine) break;
    if (jumped && m.toCoda) {
      const coda = flow.findIndex((x, k) => k > i && x.coda);
      if (coda < 0) throw new Error(`To Coda at measure index ${i} but no coda found`);
      i = coda;
      repStart = coda;
      pass = maxEnding(coda);
      continue;
    }
    if (m.repeatEnd && !jumped) {
      if (pass < m.repeatEnd) {
        pass++;
        i = repStart;
        continue;
      }
      pass = 1;
      repStart = i + 1;
    }
    if (!jumped && (m.daCapo || m.dalSegno)) {
      jumped = true;
      let target = 0;
      if (m.dalSegno) {
        target = flow.findIndex((x) => x.segno);
        if (target < 0) throw new Error(`Dal Segno at measure index ${i} but no segno found`);
      }
      i = target;
      repStart = target;
      pass = maxEnding(target);
      continue;
    }
    i++;
  }
  return order;
}
