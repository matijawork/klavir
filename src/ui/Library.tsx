import { useEffect, useState } from 'preact/hooks';
import type { LibraryEntry } from '../engine/song.ts';
import { MidiChip } from './MidiChip.tsx';

const base = import.meta.env.BASE_URL;

const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function Library() {
  const [songs, setSongs] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(`${base}songs/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSongs)
      .catch(() => setError(true));
  }, []);

  return (
    <div class="page">
      <header class="topbar">
        <h1 class="brand">Klavir</h1>
        <MidiChip />
      </header>
      <main class="library">
        <h2>Library</h2>
        {error && <p class="empty">Could not load the song list.</p>}
        {songs?.length === 0 && <p class="empty">No songs yet.</p>}
        <div class="cards">
          {songs?.map((s) => (
            <article class="card" key={s.id}>
              <a
                class="card-main"
                href={`#/play/${s.id}/${s.versions[0]?.id ?? 'original'}`}
                data-testid={`song-${s.id}`}
              >
                <h3>{s.title}</h3>
                <p class="composer">{s.composer}</p>
              </a>
              <div class="badges">
                <span class="badge" title="Key from the score's key signature">
                  {s.key}
                </span>
                <span
                  class="badge"
                  role="img"
                  title={`Difficulty ${s.difficulty} of 5`}
                  aria-label={`Difficulty ${s.difficulty} of 5`}
                >
                  {'●'.repeat(s.difficulty)}
                  <span class="faint">{'●'.repeat(5 - s.difficulty)}</span>
                </span>
                <span class="badge">{fmtTime(s.durationSec)}</span>
                {s.fingering && (
                  <span
                    class="badge"
                    title={
                      s.fingering === 'claude'
                        ? 'Finger numbers are computed suggestions, not from the score'
                        : 'Finger numbers come from the source score'
                    }
                  >
                    Fingering
                  </span>
                )}
              </div>
              <div class="links">
                <a
                  href={`${base}songs/${s.id}/sheet-${s.versions[0]?.id ?? 'original'}.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Sheet
                </a>
                {s.youtube && (
                  <a href={s.youtube} target="_blank" rel="noreferrer">
                    YouTube
                  </a>
                )}
                <a href={s.source.url} target="_blank" rel="noreferrer" title={s.source.license}>
                  Source
                </a>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
