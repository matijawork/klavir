# Progress

Updated 2026-11-12.

## Done
- **M0** Research, decisions, plan; repo, CI/deploy workflow, design tokens.
- **M1 (code complete, awaiting Korg test)**
  - Web MIDI: connect, device picker, remembered device, hot-plug, status chip, empty states.
  - Falling notes with duration-length bars, glowing 88-key keyboard, live input readout, pedal indicator.
  - Listen: plays the song on the piano over MIDI OUT (channel 3), look-ahead scheduler, panic on stop/hide/leave.
  - Import pipeline: MusicXML/.mxl → normalized JSON + sheet PDF; validators; repeats/voltas/jumps.
  - Library with four public-domain pieces (Ode to Joy, Minuet in G, Prelude in C, Gymnopédie No. 1).
  - Virtual MIDI device (`?mockmidi`), 30 unit tests, 4 e2e tests.
  - `add-song` skill.

- **M2 (code complete, awaiting Korg test)**
  - Wait mode (chords need all notes, early presses within 300 ms count) and tempo mode (per-pitch windowed matching, hit/miss/wrong).
  - Hands L/R/both; other hand dimmed, hidden or played by the piano.
  - Speed 10–150 %, zoom, section selection on the measure ruler, loop, auto speed-up after clean passes.
  - Count-in and metronome: visual pulse plus clicks on the piano (channel 4, Marimba).
  - Pedal lane, note names (off/upcoming/all), octave numbers, finger numbers.
  - Fullscreen, shortcuts, screen wake lock, settings persisted in localStorage.
  - 48 unit tests, 11 e2e tests.

## Shortcuts
Space play/pause · R restart · L loop · W wait/tempo · 1/2/3 left/both/right · ↑↓ speed ±5 % · C count-in · M metronome · F fullscreen · D frame stats

## Measurements
- Scheduled click timestamps are evenly spaced to within 2 ms in the virtual device (e2e). **Real MIDI-out timing on the Korg is not measured.**
- Headless Chromium, 60 Hz, 1512×982: draw 0.3 ms per frame on Prelude in C. **Not yet measured on the real 120 Hz display or with real key presses** — needs Matija's Mac with the Korg (`?debug` overlay).

## Next
- M1/M2 follow-up from Matija's Korg checklists (channel independence, sounds, stuck notes, click sound, timing feel).
- **M3** calibration, full scoring (strictness presets, duration, extras), results screen, heatmap, local history (IndexedDB).

## Known issues / not done
- No Firebase, scoring, review, exercises yet (M3–M7).
- MIDI file import not implemented.
- Gymnopédie source has 6 unmatched ties and 8 trimmed overlaps (warnings from the source file).
- Tempo-mode windows use the Normal preset only; no calibration offset yet, so timing is not yet trustworthy (M3).
- No seeking by clicking the ruler; a click selects one measure.
- None of the demo pieces has pedal marks, so the pedal lane is untested with real data.
- PWA manifest and service worker: M8.
- The demo scores come from a collection that states "public domain" but has no license file.

## 2026-11-12: feedback pass after M2 (Matija: "keys do not work", visuals)
- Diagnosis on his Mac: Chrome sees the interface (CME C2MIDI Pro, permission granted) but **zero MIDI messages arrived** from the piano in several minutes (not even active sensing). App code path untested with real input; suspect cabling (IN/OUT plugs swapped) or piano off. Not confirmed.
- MIDI chip: yellow "no signal" until the first key arrives; **Test** button plays C-E-G on the playback channel to check the cable towards the piano.
- Theme: neutral black surfaces (no purple tint); purple stays as accent only.
- Renderer: note halo + sheen + leading edge, light beam and larger glow on keys, sparks on correct held notes (off with reduced motion), pressed key is green when it is the right one.
- Finger numbers: badge on every note. Sources had no fingering, so `scripts/lib/fingering.ts` computes suggestions (provenance `claude`, Viterbi over ergonomic costs). `meta.json`: `"fingering": "none"` disables.
- Pedal: `meta.json` `"pedal": "measure"` generates one change per measure (provenance `claude`; used for Gymnopédie). Lane segment turns green while the pedal is held where the song wants it; strip on the hit line shows the live pedal.
- Still open: real-piano test of everything; exercises (M5) and scoring/calibration (M3) not started.
