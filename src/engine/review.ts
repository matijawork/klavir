/** Note-by-note review of a finished pass: what happened at each step, in plain words. Pure, no DOM. */
import { noteName, usesFlats } from './keys.ts';
import { EARLY, HIT, LATE, MISSED, type PassSnapshot, SHORT } from './session.ts';
import type { LoadedSong } from './song.ts';

export interface ReviewStep {
  /** song time of the step */
  time: number;
  /** index of its measure */
  measure: number;
  /** something went wrong here */
  bad: boolean;
  /** e.g. "E4 85 ms late · G4 not played" */
  text: string;
}

const ms = (v: number): number => Math.round(Math.abs(v) / 5) * 5;

/** What happened to one played or missed note. Empty string = nothing to say (fine). */
function verdict(snap: PassSnapshot, song: LoadedSong, i: number): string {
  const st = snap.state[i]!;
  if (st === MISSED) return 'not played';
  const parts: string[] = [];
  if (snap.mode === 'tempo' && snap.grade[i] !== 0) {
    const dev = snap.deviation[i]!;
    if (snap.grade[i] === EARLY) parts.push(`${ms(dev)} ms early`);
    else if (snap.grade[i] === LATE) parts.push(`${ms(dev)} ms late`);
  }
  if (st === SHORT) {
    const share = Math.round((snap.hold[i]! * 100) / 5) * 5;
    parts.push(share > 0 ? `let go too soon (held ${share} % of it)` : 'let go at once');
  } else if (st === HIT && snap.hold[i]! < 1) {
    const over = (snap.releasedAt[i]! - song.end[i]!) / snap.rate;
    parts.push(Number.isFinite(over) ? `held ${over.toFixed(1)} s too long` : 'held too long');
  }
  return parts.join(', ');
}

/**
 * The pass as a list of steps in song order: one per group of notes that start together, plus one
 * per wrong key.
 */
export function reviewSteps(song: LoadedSong, snap: PassSnapshot): ReviewStep[] {
  const { start, pitch, measureStart } = song;
  const measureOf = (t: number): number => {
    let m = 0;
    while (m + 1 < measureStart.length && measureStart[m + 1]! <= t + 1e-6) m++;
    return m;
  };
  const steps: ReviewStep[] = [];
  const flats = usesFlats(song.file.keys);
  const n = snap.notes;
  for (let k = 0; k < n.length; ) {
    const t = start[n[k]!]!;
    const fine: string[] = [];
    const wrong: string[] = [];
    for (; k < n.length && start[n[k]!]! - t <= 1e-4; k++) {
      const i = n[k]!;
      const name = noteName(pitch[i]!, true, flats);
      const v = verdict(snap, song, i);
      if (v) wrong.push(`${name} ${v}`);
      else fine.push(name);
    }
    const ok = snap.mode === 'tempo' ? 'on time' : 'right';
    const text =
      wrong.length === 0
        ? `${fine.join(' ')} ${ok}`
        : fine.length === 0
          ? wrong.join(' · ')
          : `${wrong.join(' · ')} · ${fine.join(' ')} ${ok}`;
    steps.push({ time: t, measure: measureOf(t), bad: wrong.length > 0, text });
  }
  for (let w = 0; w < snap.wrongPitch.length; w++) {
    const t = snap.wrongTime[w]!;
    steps.push({
      time: t,
      measure: measureOf(Math.max(0, t)),
      bad: true,
      text: `${noteName(snap.wrongPitch[w]!, true, flats)} is not in the song here`,
    });
  }
  return steps.sort((a, b) => a.time - b.time);
}
