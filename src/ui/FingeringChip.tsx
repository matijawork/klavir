import { signal } from '@preact/signals';

/** Songs and exercises whose finger numbers Matija has checked himself (kept in this browser). */
const KEY = 'klavir.fingeringChecked';
const read = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const mine = signal<string[]>(read());

function toggle(id: string): void {
  const next = mine.value.includes(id) ? mine.value.filter((x) => x !== id) : [...mine.value, id];
  mine.value = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* not remembered */
  }
}

/**
 * Says how far the finger numbers can be trusted: taken from a named source, only suggested, or
 * checked by the player. Click to mark them as checked by you (or undo).
 */
export function FingeringChip(props: {
  id: string;
  source: { checked: boolean; text: string };
  small?: boolean;
}) {
  const byMe = mine.value.includes(props.id);
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
      onClick={() => toggle(props.id)}
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
