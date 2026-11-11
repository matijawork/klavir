# Plan

Status: **awaiting Matija's OK** (see Open questions). Decisions referenced as ADR-nnn are in `DECISIONS.md`; evidence in `RESEARCH.md`.

## Architecture

```
src/
  engine/        pure TypeScript, no DOM, fully unit-tested
    song.ts        normalized song model, tempo map, measure/section lookup
    transport.ts   song clock: speed, loop, count-in, wait-mode gating
    scoring/       matcher, windows, grades, aggregates
    calibration.ts median/MAD offset math
    recording.ts   delta-encoded event codec
    exercises/     scale, chord, progression, arpeggio generators + fingering tables
    theory/        key detection, chord naming
  midi/          Web MIDI wrapper: device picker, reconnect, input parser,
                 look-ahead output scheduler, panic, mock backend for tests
  render/        canvas renderer (falling notes, keyboard, pedal lane, timeline)
  store/         IndexedDB repositories, sync queue, Firestore adapter
  ui/            Preact screens: Library, Player, Results, Review, Exercises, Profile
  design/        tokens.css (colors, spacing, radius, elevation, motion)
scripts/         import-song, push-songs, export-fingering (Node, build time)
songs/           gitignored song sources (ADR-002)
public/songs/    public-domain demo piece only
tests/           unit (Vitest), e2e (Playwright + mock MIDI)
```

Data flow: MIDI input → timestamped events → transport + matcher (engine) → signals → renderer reads signals each frame; UI subscribes to the same signals. Nothing in the frame loop touches the framework or the network.

Normalized song JSON: notes (pitch, start, duration in beats, hand, finger, finger source), pedal events with source, tempo map, measures, sections, per-section key and chords, provenance.

## Milestones

Each ends with tests green, deploy, `PROGRESS.md`, a Croatian report and a Korg checklist.

| # | Content | Changes vs brief |
|---|---|---|
| 0 | Research, decisions, plan (done). After OK: GitHub repo, Actions deploy skeleton, design tokens, `CLAUDE.md` | — |
| 1 | MIDI connect, falling notes with durations, glowing keyboard, live input display, import pipeline, Interstellar end to end. Frame-rate and input-to-glow measurements. Korg part-independence check | + Firebase project, Google sign-in and private song fetch (ADR-002); + public-domain demo piece; + Listen button (ADR-004) |
| 2 | Wait/tempo modes, hands, speed, section loop, auto speed-up, count-in, metronome, pedal lane, other hand on Korg, fullscreen, shortcuts, wake lock. MIDI-out timing measurement | — |
| 3 | Calibration, scoring, results screen, heatmap, local history | windows per ADR-007, calibration per ADR-009 |
| 4 | Recording, review timeline, overlays, replay through Korg | — |
| 5 | Exercises, key/chord analysis, warm-up linking | — |
| 6 | `/add-song` skill, remaining six songs with Easy versions, provenance badges, sheet PDFs, YouTube links, library UI, fingering editing and export | all songs Claude-arranged (ADR-004) |
| 7 | Full sync of results, recordings, settings, fingering edits; export/import JSON; security rules | auth already exists from M1 |
| 8 | Design pass, tablet and phone layouts, PWA, performance tuning, accessibility basics | — |
| 9 | Independent audit (scoring/timing, stuck notes, security rules, UI vs design spec), fixes | — |

## Testing

- Vitest: scoring (modes, presets, chords, repeated notes, overlapping holds, pedal), calibration math, tempo maps and speed scaling, import validators, key detection on known cases, fingering tables against their recorded sources.
- Mock `requestMIDIAccess` replaying scripted performances (perfect, late, early, short holds, wrong, missing); used by Playwright and exposed as a dev-only simulate panel.
- Performance: frame times on a dense song at 150 % speed, input-to-glow latency; numbers go into `PROGRESS.md`.

## Risks

| Risk | Handling |
|---|---|
| Arrangements contain wrong notes (I cannot hear) | Listen button, comparison with tutorial, correction rounds (ADR-004) |
| Korg parts not independent (program/volume/pedal on ch 3 affecting the keyboard) | 5-minute check in M1; fallback is plain piano playback |
| 120 fps not reached, or Low Power Mode caps at 60 | Timestamp-driven rendering; measured in M1; WebGL fallback |
| Stuck notes on the Korg | Short look-ahead, tracked note-ons, panic on every exit path; audited in M9 |
| Tablet MIDI undetected or jittery | Nice-to-have; tested on device in M8, limits documented |
| Chrome MIDI regressions after updates | Reconnect button, re-enumerate on every state change |
| Scale/chord fingering with a single source | "Suggested" badge until checked against a printed book |
| Context loss between sessions | `CLAUDE.md`, `PROGRESS.md`, commit per milestone |

## Open questions for Matija

1. **Songs private (ADR-002, option A) or public as in the brief (option B)?** Recommended: A.
2. **Self-arranged songs (ADR-004):** OK to proceed with Claude arrangements and correction rounds? Optionally name songs for which a bought easy edition should be transcribed instead.
3. **GitHub repo:** OK to create a public repo under the logged-in account, and what name (default `klavir`)?
4. **MuseScore:** OK to run `brew install --cask musescore` (system-level install, needed for sheet PDFs)?
5. **Firebase:** OK to set up the project in M1 instead of M7 (only if 1 = A)? Click-by-click steps will be provided.
