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
  const groups = learnList(song);
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
              <span>What to practise for this song</span>
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
            {groups.map((g, i) => (
              // the key and a chord can share a name (A minor and the A minor chord)
              <li key={i} data-testid="keys-group">
                <div>
                  <strong>{g.title}</strong>
                  <span class="keys-detail">{g.detail}</span>
                </div>
                <div class="keys-links">
                  {g.links.map((l) => (
                    <a
                      key={l.href}
                      class={`btn${l.main ? ' primary' : ''}`}
                      title={l.main ? 'This trains what the song does' : undefined}
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
          <p class="checks-source">
            Chords and how they are played: counted by Claude's program from the notes of your file.
            Highlighted: the exercise that trains what the song does.
          </p>
        </dialog>
      )}
    </>
  );
}
