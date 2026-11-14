# Progress

Updated 2026-11-14. Live: https://matijawork.github.io/klavir/ · 195 unit + 27 e2e green.
Matija plays a Korg D1 (no speakers) over CME C2MIDI Pro into a Mac; sound comes from the Mac.

## What exists
- **Player**: falling notes, 88 keys, wait / tempo mode, hands, speed 10–150 %, section loop, count-in, metronome, pedal lane, finger badges, fullscreen, shortcuts (Space, R, L, W, 1/2/3, ↑↓, C, M, F, D).
- **Scoring**: per note right key 40 % + timing 35 % + hold 25 % (`noteScore`); wrong keys add to the total. Strictness Easy / Normal / Strict (`PRESETS` in `session.ts`). Presses count up to about half a beat away, graded early / late; early release = short, over-holding = long.
- **Feedback**: live HUD (%, missed, wrong, early/late, short); wrong key red; notes green / yellow early / orange late / red let go too soon / grey missed; white end cap = let go; key orange with arrow when held too long.
- **Result card** (words, `feedback.ts`): verdict, Right notes / On the beat / Held right / Wrong keys, up to three tips, best score, "Practise measures a–b", "Stop counting this delay" (sets `timingOffset` when the offset is steady). While a loop runs the result is only a small chip.
- **Calibration**: ⚙ → Delay → Measure plays 20 clicks, he taps one key on each; median gap (first 4 clicks and slips dropped) becomes `timingOffset` (`engine/calibration.ts`, `ui/Calibrate.tsx`). "Picture" slider (`pictureOffset`) shifts only the drawing.
- **Review**: result card → Review. Steps through the pass note by note (← →, wheel, ruler drag, "Mistakes only"), text says what happened (`engine/review.ts`); canvas shows a white line where he pressed, a white bar for how long he held, red blocks for wrong keys. Works from `session.snapshot()`.
- **Progress chart**: click the best-score badge in the library: best score per practice day, whole piece / sections (`engine/progress.ts`, `ui/ProgressChart.tsx`).
- **Sound**: sampled piano (Salamander, CC BY 3.0), light reverb, limiter; Volume 0–3; player's keys and pedal through the computer.
- **Exercises**: major / minor, 12 keys: five-finger warm-up, scale (major, harmonic minor), chord inversions, I–IV–V–I, arpeggio. Warm-up button in a song opens the scale of its key.
- **History**: IndexedDB `klavir` / `passes` (old `klavir.history` in localStorage is moved over once; localStorage stays the fallback without IndexedDB), no cap.
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
| Calibration | Logic: table of 12 cases (late, early, wobble, slips, skipped clicks, too few, too uneven). E2E: a virtual player 45 ms late gets 45 ms and the offset is set; clicks measured as sound through the computer. **Not checked: whether the number it gives him on the Korg makes "on time" feel right.** |
| Review | Texts checked against a scripted pass (late, early, missed, short, too long, wrong key) in unit tests; stepping, wheel, Done, Again in e2e; marks looked at on a screenshot. Wait mode has no press timing, so the press line sits at the note start there. |
| Progress chart | E2E with seeded history: move to IndexedDB, survives reload, one dot per day at the day's best, tooltip, sections view. |
| Sound | Measured, not heard: one mf note peaks 0.57, 8-key chord 0.95 at 1.2× the RMS, no clipping. Chords are held back ~7 dB by the limiter (`DRIVE` 1.5); less drive = more natural chords but quieter notes. He has to judge by ear. |
| Hold on the real piano | Rules pass their table; he once said it "does not really work" without details. Unexplained. |
| Anything by ear or by hand on the Korg | Only Matija can check. Confirmed by him so far: keys, pedal, right-hand mode, no audible lag, metronome, wait mode, result card "good", layout "looks good". |

Matija marks fingerings he checked himself by clicking the chip ("checked by you", stored in `klavir.fingeringChecked`).

## Next
1. M4 recording and replay, M6 MIDI import and library, M7 Firebase sync, M8 tablet / PWA, M9 audit.

Removed 2026-11-14 on his request: automatic speed-up ("I will change the speed by hand"). Do not bring it back.

## Known gaps
- Click volume does nothing when Sound = Piano (MIDI velocity is fixed).
- MIDI chip "Test" sends three notes to the piano only; silent on the D1 without headphones.
- `PassResult.seconds` counts from configure, not from Play.
- A key held from one note into a repeated note of the same pitch shows green although a new press is needed.
- History is per browser; exercises have no sheet.
- E2E `count-in and metronome click on their own channel` (clicks within 2 ms) failed once when all tests ran in parallel, passes alone; scheduler jitter under load, not looked into.
- Calibration measures against the click sound; with Bluetooth speakers the result includes their lag (wanted for judging by ear, but then the picture needs the Picture slider).
- Gymnopédie source: 6 unmatched ties, 8 trimmed overlaps. Demo scores' "public domain" claim has no license file.
- Real MIDI-out timing and 120 Hz frame times never measured on his Mac (`?debug`).

## Working agreement (from his feedback)
- Test it yourself first; hand him only what needs ears or hands. Say plainly what was checked and how, and what was not.
- Never say "works" for something only reasoned about. If he says something does not work and it cannot be reproduced, ask for the exact steps instead of repeating that it works.
- Show trust level in the app where it matters (fingering chips).
