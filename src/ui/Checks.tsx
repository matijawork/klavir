import { useEffect, useRef, useState } from 'preact/hooks';
import { checkedCount, checklist } from '../engine/checklist.ts';
import type { LibraryEntry } from '../engine/song.ts';
import { checkedStore, isChecked, toggleChecked } from '../store/checked.ts';

const MARK = { source: '✓', mine: '✓', open: '?', none: '–' } as const;
const isUrl = (s: string) => /^https?:\/\//.test(s);

/** "4 of 7 checked" on a song card; opens the list of what is checked, how, and what is not. */
export function Checks({ song, version }: { song: LibraryEntry; version: string }) {
  const [open, setOpen] = useState(false);
  checkedStore.map.value;
  const id = `${song.id}/${version}`;
  const rows = checklist(song, { fingering: isChecked(id), ear: isChecked(`ear:${id}`) });
  const { ok, of } = checkedCount(rows);
  return (
    <>
      <button
        type="button"
        class="badge checks"
        data-state={ok === of ? 'all' : 'some'}
        title="What is checked about this song, and what is not"
        onClick={() => setOpen(true)}
        data-testid={`checks-${song.id}`}
      >
        {ok === of ? '✓' : '?'} {ok} of {of} checked
      </button>
      {open && <ChecksDialog song={song} id={id} rows={rows} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChecksDialog(props: {
  song: LibraryEntry;
  id: string;
  rows: ReturnType<typeof checklist>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const { song, id, rows } = props;
  const source = song.source;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the backdrop closes it; Esc does so natively
    <dialog
      ref={dialog}
      class="progress checks-dialog"
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      data-testid="checks"
    >
      <header>
        <div>
          <strong class="progress-title">{song.title}</strong>
          <span>What is checked</span>
        </div>
        <button
          type="button"
          class="icon-btn small"
          aria-label="Close"
          title="Close · Esc"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
      </header>
      <ul class="checks-list">
        {rows.map((r) => (
          <li key={r.id} data-state={r.state} data-testid={`check-${r.id}`}>
            <span class="checks-mark" aria-hidden="true">
              {MARK[r.state]}
            </span>
            <div>
              <strong>{r.what}</strong> <span class="checks-text">{r.text}</span>
            </div>
            {r.id === 'fingering' && song.fingering === 'claude' && (
              <button
                type="button"
                class="btn"
                onClick={() => toggleChecked(id)}
                data-testid="check-mark-fingering"
              >
                {r.state === 'mine' ? 'Undo' : 'I checked it'}
              </button>
            )}
            {r.id === 'ear' && (
              <button
                type="button"
                class="btn"
                onClick={() => toggleChecked(`ear:${id}`)}
                data-testid="check-mark-ear"
              >
                {r.state === 'mine' ? 'Undo' : 'It sounds right'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p class="checks-source">
        File:{' '}
        {isUrl(source.url) ? (
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.url}
          </a>
        ) : (
          source.url
        )}
        . Licence: {source.license}.
      </p>
    </dialog>
  );
}
