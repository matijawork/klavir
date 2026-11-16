/**
 * Compares an imported score with MuseScore's own MIDI export of the same score (the .mid that
 * musescore.com offers next to it). That MIDI is what MuseScore plays, so when every note matches
 * (same key, same moment, same hand) the import read the notes, the repeats and the tempo as
 * MuseScore does.
 */
import type { ReferenceCheck, SongFile } from '../../src/engine/song.ts';
import { TempoMap } from '../../src/engine/song.ts';

/** two notes are the same moment when they start this close (seconds) */
const SAME_MOMENT = 0.03;

export function compareWithReference(score: SongFile, midi: SongFile): ReferenceCheck {
  const ts = new TempoMap(score.tempos);
  const tm = new TempoMap(midi.tempos);
  const ref = midi.notes.map((n) => ({ p: n.p, h: n.h, t: tm.toSeconds(n.b), used: false }));
  const found = new Array<boolean>(score.notes.length).fill(false);
  const times = score.notes.map((n) => ts.toSeconds(n.b));
  let matched = 0;
  let otherHand = 0;
  // first the same key in the same hand, then the same key in either hand
  for (const sameHand of [true, false]) {
    let from = 0;
    score.notes.forEach((n, i) => {
      if (found[i]) return;
      const t = times[i]!;
      while (from < ref.length && ref[from]!.t < t - SAME_MOMENT) from++;
      for (let k = from; k < ref.length && ref[k]!.t <= t + SAME_MOMENT; k++) {
        const r = ref[k]!;
        if (r.used || r.p !== n.p || (sameHand && r.h !== n.h)) continue;
        r.used = true;
        found[i] = true;
        matched++;
        if (r.h !== n.h) otherHand++;
        break;
      }
    });
  }
  // A MIDI file holds one note per key at a time: when both hands strike the same key together,
  // MuseScore's file keeps one of them.
  let twins = 0;
  score.notes.forEach((n, i) => {
    if (found[i]) return;
    const twin = score.notes.some(
      (m, j) => j !== i && found[j] && m.p === n.p && m.h !== n.h && Math.abs(m.b - n.b) < 1e-6,
    );
    if (twin) twins++;
  });
  return {
    of: score.notes.length,
    matched,
    twins,
    extra: ref.filter((r) => !r.used).length,
    otherHand,
  };
}
