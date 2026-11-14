import { useEffect, useRef, useState } from 'preact/hooks';
import { youtubeId } from '../engine/youtube.ts';
import { setVideo, videos } from '../store/videos.ts';

/** The link in use for a song: the player's own, else the one that came with the song. */
export const videoOf = (song: string, fromSong: string | null): string | null => {
  const own = videos.value[song];
  return own !== undefined ? own || null : fromSong;
};

/** YouTube video of a song, shown in the app, with a field to add or change the link. */
export function Video(props: {
  song: string;
  title: string;
  fromSong: string | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const link = videoOf(props.song, props.fromSong);
  const id = link ? youtubeId(link) : null;
  const [text, setText] = useState(link ?? '');
  const typed = text.trim();
  const bad = typed !== '' && youtubeId(typed) === null;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the backdrop closes it; Esc does so natively
    <dialog
      ref={dialog}
      class="progress video"
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      data-testid="video"
    >
      <header>
        <div>
          <strong class="progress-title">{props.title}</strong>
        </div>
        {id && (
          <a
            class="btn"
            href={`https://www.youtube.com/watch?v=${id}`}
            target="_blank"
            rel="noreferrer"
            title="Some videos may only be watched on YouTube itself"
          >
            Open on YouTube
          </a>
        )}
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
      {id && (
        <iframe
          class="video-frame"
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={`${props.title} on YouTube`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          data-testid="video-frame"
        />
      )}
      <form
        class="video-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!bad) setVideo(props.song, typed);
        }}
      >
        <input
          type="url"
          value={text}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label="YouTube link"
          aria-invalid={bad}
          title={
            bad ? 'This is not a YouTube video link' : 'Paste a YouTube link; empty removes it'
          }
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          data-testid="video-link"
        />
        <button
          type="submit"
          class="btn primary"
          disabled={bad || typed === (link ?? '')}
          data-testid="video-save"
        >
          {typed === '' && link ? 'Remove' : 'Save'}
        </button>
      </form>
    </dialog>
  );
}
