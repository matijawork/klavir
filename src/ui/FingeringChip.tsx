import { isChecked, toggleChecked } from '../store/checked.ts';

/**
 * Says how far the finger numbers can be trusted: taken from a named source, only suggested, or
 * checked by the player. Click to mark them as checked by you (or undo).
 */
export function FingeringChip(props: {
  id: string;
  source: { checked: boolean; text: string };
  small?: boolean;
}) {
  const byMe = isChecked(props.id);
  const state = byMe ? 'mine' : props.source.checked ? 'source' : 'open';
  const label = byMe
    ? 'Fingering: checked by you'
    : props.source.checked
      ? `Fingering: ${props.source.text}`
      : 'Fingering: suggested, not checked';
  return (
    <button
      type="button"
      class="badge trust"
      data-state={state}
      data-testid="fingering-chip"
      onClick={() => toggleChecked(props.id)}
      title={`${
        props.source.checked
          ? `Copied from ${props.source.text} and compared by a test.`
          : `Not from a source (${props.source.text}).`
      } Click to ${byMe ? 'remove your mark' : 'mark that you checked it yourself'}.`}
    >
      {state === 'open' ? '?' : '✓'} {props.small ? label.replace('Fingering: ', '') : label}
    </button>
  );
}
