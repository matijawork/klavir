import { useEffect, useState } from 'preact/hooks';
import { EXERCISES, keyName } from '../engine/exercises.ts';
import type { LibraryEntry } from '../engine/song.ts';
import { bestOf, historyVersion } from '../store/history.ts';
import { MidiChip } from './MidiChip.tsx';

const base = import.meta.env.BASE_URL;

const KEY_STORE = 'klavir.exerciseKey';
const savedKey = (): number => {
  try {
    return Number(localStorage.getItem(KEY_STORE)) || 0;
  } catch {
    return 0;
  }
};

function Best({ id }: { id: string }) {
  historyVersion.value;
  const best = bestOf(id);
  if (best === null) return null;
  return (
    <span class="badge best" title="Your best score for the whole piece">
      {best}%
    </span>
  );
}

const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function Library() {
  const [songs, setSongs] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [pc, setPc] = useState(savedKey);
  const [minor, setMinor] = useState(false);
  const pickKey = (v: number) => {
    setPc(v);
    try {
      localStorage.setItem(KEY_STORE, String(v));
    } catch {
      /* not remembered */
    }
  };
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
                <Best id={`${s.id}/${s.versions[0]?.id ?? 'original'}`} />
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
        <h2 class="section">Exercises</h2>
        <fieldset class="seg keys" aria-label="Mode">
          <button type="button" aria-pressed={!minor} onClick={() => setMinor(false)}>
            Major
          </button>
          <button
            type="button"
            aria-pressed={minor}
            onClick={() => setMinor(true)}
            data-testid="mode-minor"
          >
            Minor
          </button>
        </fieldset>{' '}
        <fieldset class="seg keys" aria-label="Key">
          {Array.from({ length: 12 }, (_, k) => (
            <button
              type="button"
              key={k}
              aria-pressed={pc === k}
              onClick={() => pickKey(k)}
              data-testid={`key-${k}`}
            >
              {keyName(k, minor)}
            </button>
          ))}
        </fieldset>
        <div class="cards">
          {EXERCISES.filter((e) => e.kind !== (minor ? 'scale-major' : 'scale-minor')).map((e) => {
            const scale = e.kind === 'scale-major' || e.kind === 'scale-minor';
            const suffix = minor && !scale ? '/minor' : '';
            return (
              <article class="card" key={e.kind}>
                <a
                  class="card-main"
                  href={`#/exercise/${e.kind}/${pc}${suffix}`}
                  data-testid={`exercise-${e.kind}`}
                >
                  <h3>
                    {keyName(pc, minor)} {minor ? 'minor' : 'major'} · {scale ? 'Scale' : e.title}
                  </h3>
                  <p class="composer">{e.about}</p>
                </a>
                <div class="badges">
                  <Best id={`exercise-${e.kind}-${pc}${suffix ? 'm' : ''}/original`} />
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
