# Progress

Updated 2026-11-14. Live: https://matijawork.github.io/klavir/ · 177 unit + 26 e2e green.
Matija plays a Korg D1 (no speakers) over CME C2MIDI Pro into a Mac; sound comes from the Mac.

## What exists
- **Player**: falling notes, 88 keys, wait / tempo mode, hands, speed 10–150 %, section loop, count-in, metronome, pedal lane, finger badges, fullscreen, shortcuts (Space, R, L, W, 1/2/3, ↑↓, C, M, F, D).
- **Scoring**: per note right key 40 % + timing 35 % + hold 25 % (`noteScore`); wrong keys add to the total. Strictness Easy / Normal / Strict (`PRESETS` in `session.ts`). Presses count up to about half a beat away, graded early / late; early release = short, over-holding = long.
- **Feedback**: live HUD (%, missed, wrong, early/late, short); wrong key red; notes green / yellow early / orange late / red let go too soon / grey missed; white end cap = let go; key orange with arrow when held too long.
- **Result card** (words, `feedback.ts`): verdict, Right notes / On the beat / Held right / Wrong keys, up to three tips, best score, "Practise measures a–b", "Stop counting this delay" (sets `timingOffset` when the offset is steady). While a loop runs the result is only a small chip.
- **Speed-up**: one toolbar toggle (turns the loop on; loop off turns it off), steps in the ▾ menu next to it, needs `speedUpScore` (default 80 %); card/chip says what it did ("60 % → 65 %", "stays: needs 80 %, you got 71 %").
- **Sound**: sampled piano (Salamander, CC BY 3.0), light reverb, limiter; Volume 0–3; player's keys and pedal through the computer.
- **Exercises**: major / minor, 12 keys: five-finger warm-up, scale (major, harmonic minor), chord inversions, I–IV–V–I, arpeggio. Warm-up button in a song opens the scale of its key.
- **History**: `klavir.history` in localStorage, best whole-piece score as a badge in the library.
- **Import pipeline** for MusicXML (`add-song` skill); five public-domain pieces plus `test-c`.

## How sure we are (keep this table honest; the app shows the fingering rows as chips)
| Thing | Status |
|---|---|
| Scale fingerings, 24 keys | Copied from pianoscales.org, compared digit by digit by a test. Second octave of minor scales = same pattern repeated (page prints one octave). |
| Arpeggio fingerings, 24 keys | From Robert Kelley's chart (robertkelleyphd.com/home/arpfing.htm), all 48 hand/key patterns compared by a test. The chart gives 4-digit patterns; reading them as root-third-fifth-root is mine, supported by its own "thumb on white keys" rule holding in every key. 5 on first/last note as the page allows. |
| Chord inversion fingerings | pianoguidelessons.com (?p=4136), matches. |
| I–IV–V–I and five-finger fingering | No source found. Common practice; shown as "suggested, not checked". |
| Song fingerings | Computed by `scripts/lib/fingering.ts`, not from the scores; shown as "suggested, not checked". |
| Strictness, hold, timing rules | Tables in `tests/unit/scenarios.test.ts` (93 cases). |
| Every button, shortcut, setting | `tests/e2e/controls.spec.ts` with the virtual piano. |
| Speed-up | Tested: starts at start speed, rises only after a pass that reaches the score, stops at target, off when loop is off, idle while listening. **Matija still thinks it does not work**: not reproduced; ask what he did and saw. |
| Sound | Measured, not heard: one mf note peaks 0.57, 8-key chord 0.95 at 1.2× the RMS, no clipping. Chords are held back ~7 dB by the limiter (`DRIVE` 1.5); less drive = more natural chords but quieter notes. He has to judge by ear. |
| Hold on the real piano | Rules pass their table; he once said it "does not really work" without details. Unexplained. |
| Timing on the real piano | No calibration procedure yet; only the manual / one-click offset. |
| Anything by ear or by hand on the Korg | Only Matija can check. Confirmed by him so far: keys, pedal, right-hand mode, no audible lag, metronome, wait mode, result card "good", layout "looks good". |

Matija marks fingerings he checked himself by clicking the chip ("checked by you", stored in `klavir.fingeringChecked`).

## Next (he asked what these mean; explained to him 2026-11-14, not started)
1. **Click-along calibration** (ADR-009): the app plays ~16 metronome clicks, he presses one key on each, the app takes the median as his delay. Replaces guessing the Offset slider. Plus a second slider that shifts only the picture.
2. **Note-by-note review**: after a pass, scroll back through the song with every note coloured as he played it and a mark where he pressed, so he sees exactly which notes were late / short / missed.
3. **Progress chart**: score per day for each song from the history; move history to IndexedDB.
4. Then M4 recording and replay, M6 MIDI import and library, M7 Firebase sync, M8 tablet / PWA, M9 audit.

## Known gaps
- Click volume does nothing when Sound = Piano (MIDI velocity is fixed).
- MIDI chip "Test" sends three notes to the piano only; silent on the D1 without headphones.
- `PassResult.seconds` counts from configure, not from Play.
- A key held from one note into a repeated note of the same pitch shows green although a new press is needed.
- History is per browser; exercises have no sheet.
- Gymnopédie source: 6 unmatched ties, 8 trimmed overlaps. Demo scores' "public domain" claim has no license file.
- Real MIDI-out timing and 120 Hz frame times never measured on his Mac (`?debug`).

## Working agreement (from his feedback)
- Test it yourself first; hand him only what needs ears or hands. Say plainly what was checked and how, and what was not.
- Never say "works" for something only reasoned about. If he says something does not work and it cannot be reproduced, ask for the exact steps instead of repeating that it works.
- Show trust level in the app where it matters (fingering chips).
