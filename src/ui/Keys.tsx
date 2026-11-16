import { useEffect, useRef, useState } from 'preact/hooks';
import { learnList } from '../engine/learn.ts';
import type { LibraryEntry } from '../engine/song.ts';

/** "Keys: A minor" on a song card: opens the scale and chords of the song, each to practise. */
export function Keys({ song }: { song: LibraryEntry }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const { groups, chart } = learnList(song);
  if (groups.length === 0) return null;
  return (
    <>
      <button
        type="button"
        class="badge keys"
        title="The key and chords of this song: pick one to practise"
        onClick={() => setOpen(true)}
        data-testid={`keys-${song.id}`}
      >
        Keys: {song.key}
      </button>
      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the backdrop closes it; Esc does so natively
        <dialog
          ref={dialog}
          class="progress keys-dialog"
          onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === dialog.current) dialog.current?.close();
          }}
          data-testid="keys"
        >
          <header>
            <div>
              <strong class="progress-title">{song.title}</strong>
              <span>Key and chords: pick what to practise</span>
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
          <ul class="keys-list">
            {groups.map((g, k) => (
              <li key={g.title} data-testid="keys-group">
                <div>
                  <strong>{g.title}</strong>
                  <span class="keys-detail">{g.detail}</span>
                </div>
                <div class="keys-links">
                  {g.links.map((l) => (
                    <a
                      key={l.href}
                      class={`btn${k === 0 && l.label === 'Scale' ? ' primary' : ''}`}
                      href={l.href}
                      data-testid="keys-link"
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {chart && <p class="checks-source">{chart}</p>}
        </dialog>
      )}
    </>
  );
}
