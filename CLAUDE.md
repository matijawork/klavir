# Klavir

Personal piano practice web app (falling notes, MIDI in/out to a Korg D1). Spec: the original brief is summarized in `docs/PLAN.md`; decisions in `docs/DECISIONS.md`; verified facts in `docs/RESEARCH.md`; state in `docs/PROGRESS.md`. **Read PROGRESS.md first.**

## Rules
- Talk to Matija in Croatian, short. All code, docs and UI text in English. Keep docs compact.
- **Never compose or arrange songs.** Matija supplies files; import them with the `add-song` skill (`.claude/skills/add-song/SKILL.md`).
- No explanatory text in the UI; explanations go in `title` tooltips. Exceptions he asked for: the result card says in plain words what went wrong and what to work on (`src/engine/feedback.ts`); each song's "What is checked" list (`src/engine/checklist.ts`) and its "Keys" list of what to practise (`src/engine/learn.ts`).
- Colors, spacing, motion only from `src/design/tokens.css`. Canvas reads them via `src/design/tokens.ts`.
- Ask before: anything global/system-level, anything destructive outside the repo, anything needing his accounts.
- After each milestone: tests green, push (deploys), update PROGRESS.md, Croatian report. Test everything yourself first (scenario tables in `tests/unit/scenarios.test.ts`, control audit in `tests/e2e/controls.spec.ts`, `window.__klavir.level()` for sound); leave him only what needs ears and hands on the real piano.

## Commands
- `npm run dev` — dev server at http://localhost:5173/klavir/ (`?mockmidi` = virtual piano, `?debug` or key D = frame stats, `?mocksync` = stand-in cloud at `__cloud/`, answered by the tests, `?nosync` = no cloud at all)
- `npm test` — Vitest unit tests · `npm run e2e` — Playwright (builds, serves on :4173)
- `npm run lint` / `npm run format` — Biome · `npm run build` — type-check + build
- `npm run import-song [slug] [-- --pdf]` — sources in `songs/` → `public/songs/`

## Map
- `src/engine/` pure logic, no DOM: `song.ts` (normalized format, TempoMap, loadSong), `transport.ts` (song clock), `session.ts` (practice run: wait gate, matcher, loop, count-in), `keys.ts` (88-key geometry), `feedback.ts` (result → plain-word tips), `exercises.ts` (scales, chords, arpeggios as SongFiles), `calibration.ts` (click-along delay), `review.ts` (pass → note-by-note steps in words), `progress.ts` (best score per day), `days.ts` (practice days, streak), `youtube.ts` (link → video id), `checklist.ts` (what is checked about a song, in words), `learn.ts` (key + chords → exercise links), `harmony.ts` (key/chord names and parsing)
- `src/midi/` `midi.ts` (Web MIDI, signals, `held[]`), `output.ts` (look-ahead scheduler, panic, Korg sounds), `replay.ts` (plays a recorded pass back), `mock.ts` (virtual device, `window.__midi`)
- `src/audio/` `synth.ts` (computer sound: sampled piano from `public/samples/piano`, clicks), `monitor.ts` (player's own keys through the computer)
- `src/store/settings.ts` practice settings signal, persisted · `history.ts` performance scores per song and hands + the last performance in full (IndexedDB, in-memory copy for sync reads) · `days.ts` seconds played per day · `videos.ts` his YouTube link per song
- `src/sync/` `merge.ts` (pure rules), `sync.ts` (orchestrator, `syncState`), `firebase.ts` / `mock.ts` (backends), `config.ts` (Firebase project or `null` = sync off), `notify.ts` (stores call `changed()`) · ADR-017
- `src/render/player-canvas.ts` falling notes + keyboard, rAF, no per-frame allocation
- `src/ui/` Preact screens (`FingeringChip.tsx` = where finger numbers come from, click = checked by him; `Checks.tsx` = "✓ Checked: … / ? Not checked: …" on a card and the list behind it; `Keys.tsx` = "Keys: A minor" popup); hash routes `#/`, `#/play/<song>/<version>`, `#/exercise/<kind>/<key 0-11>`, and both again under `#/perform/…` (ADR-016: Practise keeps nothing, Perform is locked and is the only thing scored into history)
- `scripts/import-song.ts`, `scripts/lib/musicxml.ts` (parser + validators), `scripts/lib/midi.ts` (MIDI files), `scripts/lib/unroll.ts` (repeats, voltas, D.C./D.S./coda), `scripts/lib/reference.ts` (every note compared with MuseScore's MIDI of the same score), `scripts/lib/key.ts` (major/minor guess when the score has only a key signature), `scripts/lib/chords.ts` (one triad per measure from the notes)
- `songs/<slug>/` sources + `meta.json` → `public/songs/<slug>/<version>.json` + `public/songs/index.json` (generated, committed)

## Gotchas
- Vite `base` is `/klavir/`; always build URLs from `import.meta.env.BASE_URL`.
- github.io origin is shared between repos: prefix storage keys with `klavir.`.
- Chrome has no `MIDIOutput.clear()`: schedule at most ~100 ms ahead; `panic()` on every stop path.
- MIDI channels (0-based): 0 = player's keys, never send there; 2 = playback; 3 = click. Channel 1 is avoided (Korg layer mode).
- Input timing always from `MIDIMessageEvent.timeStamp`, never `Date.now()` or render time.
- Scripts run with plain `node` (type stripping): relative imports need the `.ts` extension, no enums or parameter properties.
- `git push` can hang on the macOS keychain helper; use `git -c credential.helper= -c credential.helper='!gh auth git-credential' push`.
- GitHub Pages caches `index.html` ~10 min: after a deploy tell Matija to hard-reload (Cmd+Shift+R); check the bundle name in `document.scripts`.
- Sound has two targets (`settings.soundOut`): `computer` (Web Audio, default; the Korg D1 has no speakers) and `piano` (MIDI). E2E tests force `piano` to inspect sent MIDI.
- E2E tests use fixture songs from `tests/fixtures/songs` (served by `tests/e2e/fixtures.ts`), not the library; a new e2e spec must import `test` from `./fixtures`.
- Nothing in the app is per song: Practise, Perform, score, chart, review and video come from `public/songs/index.json`. Adding a song is only the `add-song` skill; never add song-specific code.
- `songs/test-c` is a 3-note test pattern Matija asked for (not a song); keep it.
- Fingering: copy from a named web source and add a test that compares the digits; otherwise mark it unchecked (`fingeringSource.checked = false`). Keep the "How sure we are" table in PROGRESS.md honest.
- TypeScript 7 + Biome (typescript-eslint does not support TS 7).
- `useSignalEffect` runs on the next frame, not synchronously: after setting a signal, do not read engine state in the same tick (tests must poll).
