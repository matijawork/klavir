import type { Provenance } from '../engine/song.ts';

/** Says where a song's sustain-pedal marks come from: written in the score, or only suggested. */
export function PedalChip(props: { source: Provenance | null; small?: boolean }) {
  if (!props.source) return null;
  const fromScore = props.source === 'arranger' || props.source === 'verified';
  return (
    <span
      class="badge trust"
      data-state={fromScore ? 'source' : 'open'}
      data-testid="pedal-chip"
      title={
        fromScore
          ? 'Pedal marks are written in the score file.'
          : 'Not in the score: suggested by the app, not checked.'
      }
    >
      {fromScore ? '✓' : '?'} {props.small ? '' : 'Pedal: '}
      {fromScore ? 'the score' : 'suggested, not checked'}
    </span>
  );
}
