# Klavir

Personal piano practice web app (falling notes, MIDI in/out to a Korg D1). Spec: the original brief is summarized in `docs/PLAN.md`; decisions in `docs/DECISIONS.md`; verified facts in `docs/RESEARCH.md`; state in `docs/PROGRESS.md`. **Read PROGRESS.md first.**

## Rules
- Talk to Matija in Croatian, short. All code, docs and UI text in English. Keep docs compact.
- **Never compose or arrange songs.** Matija supplies files; import them with the `add-song` skill (`.claude/skills/add-song/SKILL.md`).
- No explanatory text in the UI; explanations go in `title` tooltips.
- Colors, spacing, motion only from `src/design/tokens.css`. Canvas reads them via `src/design/tokens.ts`.
- Ask before: anything global/system-level, anything destructive outside the repo, anything needing his accounts.
- After each milestone: tests green, push (deploys), update PROGRESS.md, Croatian report + Korg checklist.

## Commands
- `npm run dev` — dev server at http://localhost:5173/klavir/ (`?mockmidi` = virtual piano, `?debug` or key D = frame stats)
- `npm test` — Vitest unit tests · `npm run e2e` — Playwright (builds, serves on :4173)
- `npm run lint` / `npm run format` — Biome · `npm run build` — type-check + build
- `npm run import-song [slug] [-- --pdf]` — sources in `songs/` → `public/songs/`

## Map
- `src/engine/` pure logic, no DOM: `song.ts` (normalized format, TempoMap, loadSong), `transport.ts` (song clock), `keys.ts` (88-key geometry)
- `src/midi/` `midi.ts` (Web MIDI, signals, `held[]`), `output.ts` (look-ahead scheduler, panic, Korg sounds), `mock.ts` (virtual device, `window.__midi`)
- `src/render/player-canvas.ts` falling notes + keyboard, rAF, no per-frame allocation
- `src/ui/` Preact screens; hash routes `#/` and `#/play/<song>/<version>`
- `scripts/import-song.ts`, `scripts/lib/musicxml.ts` (parser + validators), `scripts/lib/unroll.ts` (repeats, voltas, D.C./D.S./coda)
- `songs/<slug>/` sources + `meta.json` → `public/songs/<slug>/<version>.json` + `public/songs/index.json` (generated, committed)

## Gotchas
- Vite `base` is `/klavir/`; always build URLs from `import.meta.env.BASE_URL`.
- github.io origin is shared between repos: prefix storage keys with `klavir.`.
- Chrome has no `MIDIOutput.clear()`: schedule at most ~100 ms ahead; `panic()` on every stop path.
- MIDI channels (0-based): 0 = player's keys, never send there; 2 = playback; 3 = click. Channel 1 is avoided (Korg layer mode).
- Input timing always from `MIDIMessageEvent.timeStamp`, never `Date.now()` or render time.
- Scripts run with plain `node` (type stripping): relative imports need the `.ts` extension, no enums or parameter properties.
- TypeScript 7 + Biome (typescript-eslint does not support TS 7).
