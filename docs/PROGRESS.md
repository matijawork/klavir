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

## 2026-11-12 (later): real piano works
- Cause of "no signal" was the piano being switched off. Matija confirmed: keys, pedal, right-hand mode work on the Korg.
- Built-in synth (`src/audio/synth.ts`, Web Audio, synthesized not sampled): clicks and song playback default to **Computer** (`soundOut`), **My keys on computer** (`monitor`, default on) because the D1 has no speakers. ⚙ → Sound switches back to Piano (MIDI).
- Key release is tracked: a hit note let go with more than max(0.18 s, 30 %) of it left becomes `SHORT` (orange), unless the sustain pedal is down.
- Pass score is stricter: `(hits − 0.5·short) / (expected + wrong)`, so wrong keys count in wait mode too.
- Glow toned down (smaller, dimmer, fewer sparks) on his request.
- Not verified: how the synth sounds and its latency on his Mac (no way to listen from here); timing windows still uncalibrated.

## 2026-11-12 (evening): sound, release cue, wait-mode fix
State: everything below is deployed (https://matijawork.github.io/klavir/), 57 unit + 11 e2e green. Matija plays through the Mac (wired), Korg D1 over CME C2MIDI Pro. He confirmed earlier today: keys, pedal, right-hand mode, computer sound without noticeable lag.

Done in this pass:
- **Sampled piano** (Salamander Grand, CC BY 3.0, 30 MP3s, 2 MB, `public/samples/piano/`) replaces the synthesized tone; loads after the first click; leading MP3 silence is skipped. Sustain pedal holds the player's notes in the computer sound.
- **Volume**: default 1.2, sliders ⚙ → Sound → Volume / Click.
- **When to let go**: the coloured fill on the key drains towards the top while the note runs; empty = release. A key still held >0.15 s after its note ended turns orange. Early release still marks the note orange (`SHORT`).
- **Wait mode sticking** (his report: "pressed the key, song does not continue"): a press made more than 300 ms before the note arrived was thrown away. Now any unused press from this pass counts if the key is still down or was pressed ≤1 s before; one press never counts for two notes. Not yet confirmed by him as the cause.
- **Metronome in wait mode**: clicks used to stop whenever the song waited (his "metronome does not work"). Now a free-running click at the song tempo × speed continues while waiting. Metronome is off by default and always follows the song tempo.
- **Test pattern** `songs/test-c` ("Test: three C notes"): top C (C8) ×3 at 60 BPM: 4 beats, 1 beat, rest, 2 beats. Importer option `oneHand` added for it. If he meant another C, change the octave in `original.musicxml` and re-import.
- Verified here with the virtual piano in Chrome: 4 count-in + 8 metronome clicks fired, sampled notes played, holding 2 notes fully and dropping the 3rd early gave "83% 3/3 1 short".

Matija must test on the real piano (cannot be checked from here):
1. Piano sound: does it sound like a real piano now, loud enough, any lag?
2. Pedal: hold pedal, play and release keys → notes keep ringing through the Mac; pedal up → they stop.
3. Test: three C notes, **Tempo** mode: hold the long one fully, the short one, release the last one early → expect about 83 %, "1 short", last note orange. Then all three held properly → 100 %.
4. Same in **Wait** mode: does the song always continue after the right key? If it sticks, note what he did just before.
5. Key fill draining: is "when to let go" clear enough?
6. Metronome (M) in both modes: audible, right tempo, loudness OK?
7. A wrong key on purpose: % goes down and shows "1 wrong".

Next (in order): M3 calibration (latency offset) + results screen with per-measure errors and history; then M5 exercises (scales, chords, warm-up); M4 recording; M6 MIDI import and library; M7 Firebase; M8 polish/PWA; M9 audit.
Known gaps: timing windows uncalibrated (Normal preset only); no seeking by clicking the ruler; `PassResult.seconds` counts from configure, not from Play; LH scale fingering suggestion is 4-3-2-1-4-3-2-1 instead of 5-4-3-2-1-3-2-1.

## 2026-11-12 (night): scoring rework after his Korg test — HANDOFF, read this first
His test of the 7 points: pedal OK, metronome OK, wait mode OK, no lag. Complaints: scoring "terrible" and too simple, tempo mode ignores a late key, release cue unclear, sound odd on chords and too quiet.

Root causes and fixes (deployed, 64 unit + 12 e2e green):
- **Tempo mode ignored late keys**: the only window was ±80–120 ms; anything outside was a miss *and* a wrong key (0 % for playing everything slightly late). Now: on-time window unchanged, but a press counts up to half a beat away (250–400 ms; long notes up to half their length, max 1 s) and is graded early/late. The earliest open note of a pitch wins unless a later one is right on time.
- **Score from several criteria** (`noteScore`): right key 40 %, timing 35 %, hold 25 % per note; every wrong key adds 1 to the total. Wait mode has no timing part. `session.result(final)` gives notes/timing/hold/mean deviation.
- **Live feedback**: HUD chip with running %, hits, missed, wrong, early/late, short (polls `session.revision`). Wrong key is red on the keyboard while down. Notes: green on time, yellow early, orange late, red let go too soon, grey missed.
- **Result card** after a pass: overall % plus Notes / Timing (mean ms early/late) / Hold / Wrong keys, Again button. While looping the previous pass is a small chip.
- **Release cue**: white end cap on every note bar; orange flash on the hit line when a note ends; a key still down after its note turns orange with an up arrow.
- **Sound**: the old compressor (−14 dB, 6:1, slow release) squashed chords. Now per-voice gain → drive ×1.5 → fast limiter (−6 dB, 12:1, 120 ms release), plus a light synthetic room reverb. About 4 dB louder at the same slider value; slider now goes to 3. Not heard by anyone yet.
- Changing volume, zoom, speed or note names no longer restarts the pass (only mode, hands, section, count-in, Listen do).
- Wait mode: a key of the next note pressed a little ahead is no longer counted wrong.

Matija must test on the real piano:
1. Sound: chords (5+ keys) still piano-like? Loud enough? (⚙ → Volume now up to 3.)
2. Tempo mode, test song: play every note on purpose a bit late → notes turn orange, HUD shows "late", score well above 0 %.
3. Wrong key → key red at once, HUD "1 wrong", % drops.
4. Hold: white line at the top of the bar reaches the keys → let go. Holding longer → orange key with arrow. Letting go early → rest of the bar red, "short".
5. Result card: do Notes / Timing / Hold / Wrong keys match what he played? Is the timing number (ms early/late) steady across passes? (That number is the calibration offset to apply in M3.)

Next (in order): M3 calibration (apply measured offset; strictness presets), per-measure error view, history; M5 exercises; then M4, M6–M9.
Known gaps: no latency calibration yet; `PassResult.seconds` counts from configure; a key held from one note into a repeated note of the same pitch shows green although a new press is needed; over-holding is shown but not scored.
