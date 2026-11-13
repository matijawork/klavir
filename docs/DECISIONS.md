# Decisions

Short ADRs. Status: **Proposed** = needs Matija's OK (scope or account impact). **Decided** = technical choice inside scope. Evidence is in `RESEARCH.md`.

## ADR-001 Stack — Decided
- **Context:** light UI around a canvas hot loop; build-time Node scripts; GitHub Pages.
- **Options:** React 19, Svelte 5, Solid, Preact.
- **Decision:** Vite 8, TypeScript 7, Preact 11 + signals, Biome, Vitest 5, Playwright, vite-plugin-pwa, idb, Tonal, plain CSS with custom-property tokens.
- **Why:** signals are readable from the render loop without re-rendering; ~9 kB runtime. Biome because typescript-eslint does not support TS 7. Fallback if Preact 11 misbehaves: Preact 10.

## ADR-002 Song data stays out of the public repo — Proposed
- **Context:** the brief puts songs in the public repo. All seven are copyrighted; no legitimate free files exist; even self-made arrangements are derivative works. GitHub has taken down single self-made transcriptions on personal Pages sites, with a permanent public notice and an account strike.
- **Options:**
  - A. Code public. Song sources in a local gitignored `songs/` (optionally a second, private repo as backup). Normalized JSON and sheet PDFs pushed by script into Firestore under Matija's user, readable only by him; the app caches them in IndexedDB. Public repo ships one or two public-domain demo pieces.
  - B. As in the brief: everything public. Low probability of a takedown, real cost if it happens.
  - C. Songs public but excluded from git and only deployed to Pages. Still publicly served; little gained.
- **Decision (Matija, 2026-11-11):** B. Songs are public, in the repo and on Pages, as in the brief. He was told about the takedown risk and accepted it.
- **Consequences:** Firebase stays in M7. If a takedown ever arrives, option A is the migration path.
- **Status:** Decided.

## ADR-003 No GPL code reuse; MIT license — Decided
- **Context:** Sightread is GPL-3.0, frozen, renderer tied to its player and state library; MusicXML parser lacks voltas and jumps. MIDIano has no license.
- **Decision:** read Sightread for ideas (viewport model, key geometry), write our own. License MIT.
- **Why:** the reusable part is a few hundred lines that would be rewritten for signals and 120 fps anyway; avoids binding the project to GPL.

## ADR-004 Songs are supplied by Matija; Claude does not arrange — Decided (Matija, 2026-11-11)
- **Context:** sourcing steps 1 and 2 of the brief return nothing usable for the seven songs. Matija rejected Claude-made arrangements.
- **Decision:** Claude never composes or arranges songs. Matija finds MusicXML/MIDI files himself and hands them over; Claude imports them with the `/add-song` skill. Until then the app ships public-domain starter pieces from legitimately licensed files.
- **Consequences:** the seven songs of brief §6.8 are no longer a V1 deliverable; the deliverable is a robust import pipeline and clear instructions. MusicXML and MIDI import therefore matter more: MIDI import and repeat/volta/jump handling are in scope for M6. Fingering or pedal missing from a supplied file may still be added as "Claude suggested".
- **Kept:** a Listen button (plays the song through the Korg) so he can check an imported file by ear.

## ADR-005 Arrangement source format — Decided, to be confirmed in M1
- **Superseded by ADR-004:** nothing is authored by Claude, so there is no authoring format. Source formats are MusicXML (`.musicxml`, `.mxl`), MuseScore (`.mscz`, converted by the MuseScore CLI) and MIDI. The importer fails loudly on anything it cannot represent faithfully.

## ADR-006 MIDI output scheduling — Decided
- **Context:** Chrome has no `MIDIOutput.clear()`; messages sent with a future timestamp cannot be cancelled.
- **Decision:** look-ahead scheduler: a timer every ~25 ms sends only events due in the next ~100 ms, timestamped. Every note-on is tracked; stop, pause, seek, tab hide and page leave send note-offs for sounding notes, then CC64=0, CC123, CC120 on the app's channels.
- **Channels:** player = 1 (Korg default, never written to). Playback = 3. Click = 4. Channel 2 avoided because Korg layer mode uses it.
- **Sounds:** click = Marimba (accent C7, beat G6, ~40 ms), other hand/replay = Pop Piano, both with CC7 for volume. Bank + program sent on connect and reconnect, since the Korg forgets at power-off.
- **Unverified:** part independence on the D1. Checked in the M1 Korg checklist; fallback is same-sound playback on channel 1's sound.

## ADR-007 Timing windows — Decided, tunable
- **Context:** fixed ±200 ms is ambiguous for fast notes; ±50 ms as pass/fail is harsh for a beginner.
- **Decision:** presets keep the brief's names and nominal values but scale with the beat and are clamped: Easy ±25 % of a beat (120–200 ms), Normal ±15 % (80–120 ms), Strict ±8 % (40–60 ms). Also capped at 45 % of the gap to the next same-pitch note. Custom values remain. Each hit is graded perfect / good / ok, not just pass/fail.
- **Why:** matches published rhythm-game ranges; stays unambiguous at any speed. Defaults get revisited after Matija's first real sessions.
- **Revised 2026-11-12 (his first sessions):** a single pass/fail window felt broken (late key = miss + wrong). The window above is now only the "on time" grade; a press counts up to half a beat away (250–400 ms, long notes up to half their length, max 1 s), graded early/late with a timing score falling from 1 to 0.2. Pass score per note: key 40 %, timing 35 %, hold 25 %; wrong keys add to the total.

## ADR-008 Note matching — Decided
- **Decision:** tempo mode uses per-pitch windowed matching in real time (earliest unmatched candidate inside the window), with a wrong-pitch pairing step and extras counted separately, then a per-pitch monotone alignment pass at the end for the stored score. Chords: each tone matched independently; chord timing = mean deviation; spread reported separately. Wait mode needs no matching: it gates on the required pitch set.
- **Why:** the app owns the clock, so score-following is unnecessary complexity.
- **As built:** earliest open note of the pitch wins, unless a later one is inside its on-time window (the earlier one was skipped). No wrong-pitch pairing or end-of-pass alignment yet.

## ADR-009 Calibration — Decided (deviates from the brief's "tap to a flash")
- **Decision:** two settings. (1) Input offset: play one key along with 16–20 Korg clicks; median with MAD outlier rejection; first taps discarded; repeat requested if spread is too wide; stored per device, clamped to −80…+40 ms. (2) Visual offset: a slider nudged until the falling note and the click coincide; applied only to drawing.
- **Interim (2026-11-12):** only a single judging offset exists (`timingOffset`), set by hand or from a pass whose deviations are steady (median ≥ 30 ms, MAD ≤ 60 ms). The click-along procedure and the visual offset are still to do.
- **Why:** tapping to flashes is much less consistent than tapping to sound, and one tap test cannot separate display lag from input lag. The measured median includes the natural human tendency to play slightly early; centring on it is what makes "on time" feel on time. Raw early/late tendency is still shown in stats.

## ADR-010 Rendering — Decided, to be measured in M1
- **Decision:** own Canvas 2D renderer behind a small interface; static layers on a separate canvas; glow from pre-rendered sprites with additive blending, no `shadowBlur`; timestamp-driven; no allocations per frame. If the tablet misses 60 fps, swap in a WebGL2 instanced renderer behind the same interface.
- **Why:** hundreds of rectangles is light work; zero dependencies. This is a judgment, not a benchmark, hence the M1 measurement.

## ADR-011 Storage and sync — Decided
- **Decision:** our own IndexedDB (via `idb`) is the source of truth; every write is local first. A sync queue pushes to Firestore when online; Firestore runs with memory cache only. Recordings are delta-encoded binary, stored as Firestore `Bytes`, chunked under 900 kB. Writes are batched and debounced. Conflict rule: per-record last-write-wins by timestamp; attempts are append-only.
- **Why:** practice never waits on the network; one clear source of truth; quotas (20k writes/day) are far above single-user needs.
- **Auth:** `signInWithPopup` (redirect cannot work on github.io). Security rules: `request.auth.uid == <owner uid>` on everything.

## ADR-012 Key detection — Decided
- **Decision:** at import time, per section: declared key signature as a prior, plus Krumhansl–Schmuckler with the Temperley–de Clercq rock profiles, with downbeat bass notes weighted up; windowed with hysteresis for modulations; my own judgment recorded as a manual override with a reason. `meta.json` stores main key, alternatives and a confidence value. Modal cases (Clocks: E♭ Mixolydian) are labelled as such, with the related major key as alternative.

## ADR-013 Scale fingering sources — Decided
- **Context:** the brief's candidate source (musicmagix) could not be read.
- **As built (2026-11-13):** scales follow pianoscales.org only (read through a fetch, compared digit by digit in a unit test); the second octave of minor scales repeats the printed pattern. Chords and arpeggio left hands are textbook fingering marked `claude`. Chang and Morin are not consulted yet.
- **Decision:** tables from Chang, Morin and pianoscales.org, with the source list stored per scale and disagreements encoded as accepted alternates. Melodic-minor exceptions and block-chord fingerings have one readable source, so they carry a "suggested" badge until checked against a printed scale book.

## ADR-014 Routing and hosting details — Decided
- Hash routing; app-prefixed IndexedDB and cache names (github.io origin is shared between repos); service worker at site root with relative registration; Actions deploy with current action majors.

## ADR-015 Easy versions — Decided
- With supplied files, an Easy version is produced by transposing the supplied file to C major / A minor in the import script (no re-arranging). Offered when the original key has three or more accidentals.
