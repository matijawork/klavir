import { useEffect, useState } from 'preact/hooks';
import { EXERCISES, fingeringSourceOf, keyName } from '../engine/exercises.ts';
import type { LibraryEntry } from '../engine/song.ts';
import { bestOf, historyVersion, passesOf } from '../store/history.ts';
import { FingeringChip } from './FingeringChip.tsx';
import { MidiChip } from './MidiChip.tsx';
import { ProgressChart } from './ProgressChart.tsx';
import { Video, videoOf } from './Video.tsx';

const base = import.meta.env.BASE_URL;

const KEY_STORE = 'klavir.exerciseKey';
const savedKey = (): number => {
  try {
    return Number(localStorage.getItem(KEY_STORE)) || 0;
  } catch {
    return 0;
  }
};

/** Best score of the piece; click opens the progress chart. Shown as soon as there is any pass. */
function Best({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  historyVersion.value;
  if (passesOf(id).length === 0) return null;
  const best = bestOf(id);
  return (
    <>
      <button
        type="button"
        class="badge best"
        title="Your best performance · click for your progress"
        onClick={() => setOpen(true)}
        data-testid="best"
      >
        {best}%
      </button>
      {open && <ProgressChart id={id} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Practise (anything goes, nothing kept) or Perform (the real thing, scored and kept). */
function Actions({ path, testid }: { path: string; testid: string }) {
  return (
    <div class="card-actions">
      <a
        class="btn"
        href={`#/${path}`}
        title="Wait or Tempo mode, any speed, sections, loops. Nothing is kept."
        data-testid={`practise-${testid}`}
      >
        Practise
      </a>
      <a
        class="btn primary"
        href={`#/perform/${path.replace(/^play\//, '')}`}
        title="The real thing: whole piece, full speed, no stopping. Only this is scored, kept and charted."
        data-testid={`perform-${testid}`}
      >
        Perform
      </a>
    </div>
  );
}

function VideoButton({
  id,
  title,
  fromSong,
}: {
  id: string;
  title: string;
  fromSong: string | null;
}) {
  const [open, setOpen] = useState(false);
  const has = videoOf(id, fromSong) !== null;
  return (
    <>
      <button
        type="button"
        class="link"
        title={
          has ? 'Watch the video here, or change the link' : 'Add a YouTube link for this song'
        }
        onClick={() => setOpen(true)}
        data-testid={`video-${id}`}
      >
        {has ? 'Video' : '+ Video'}
      </button>
      {open && <Video song={id} title={title} fromSong={fromSong} onClose={() => setOpen(false)} />}
    </>
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
                <Best id={`${s.id}/${s.versions[0]?.id ?? 'original'}`} title={s.title} />
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
                  <FingeringChip
                    id={`${s.id}/${s.versions[0]?.id ?? 'original'}`}
                    small
                    source={
                      s.fingering === 'claude'
                        ? { checked: false, text: 'computed by the app, not in the score' }
                        : { checked: true, text: 'the score' }
                    }
                  />
                )}
              </div>
              <Actions path={`play/${s.id}/${s.versions[0]?.id ?? 'original'}`} testid={s.id} />
              <div class="links">
                <a
                  href={`${base}songs/${s.id}/sheet-${s.versions[0]?.id ?? 'original'}.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Sheet
                </a>
                <VideoButton id={s.id} title={s.title} fromSong={s.youtube} />
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
                  <Best
                    id={`exercise-${e.kind}-${pc}${suffix ? 'm' : ''}/original`}
                    title={`${keyName(pc, minor)} ${minor ? 'minor' : 'major'} · ${scale ? 'Scale' : e.title}`}
                  />
                  <FingeringChip
                    id={`exercise-${e.kind}-${pc}${suffix ? 'm' : ''}/original`}
                    small
                    source={fingeringSourceOf(e.kind)}
                  />
                </div>
                <Actions path={`exercise/${e.kind}/${pc}${suffix}`} testid={e.kind} />
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
