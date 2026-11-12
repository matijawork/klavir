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

## Measurements
- Headless Chromium, 60 Hz, 1512×982: draw 0.3 ms per frame on Prelude in C. **Not yet measured on the real 120 Hz display or with real key presses** — needs Matija's Mac with the Korg (`?debug` overlay).

## Next
- M1 follow-up from Matija's Korg checklist (channel independence, sounds, stuck notes).
- **M2** modes (wait/tempo), hands, speed, section loop + auto speed-up, count-in, metronome, pedal lane, fullscreen, shortcuts, wake lock.

## Known issues / not done
- No Firebase, scoring, review, exercises yet (M3–M7).
- MIDI file import not implemented.
- Gymnopédie source has 6 unmatched ties and 8 trimmed overlaps (warnings from the source file).
- Note names on keys, finger-number settings, zoom controls: M2.
- PWA manifest and service worker: M8.
- The demo scores come from a collection that states "public domain" but has no license file.
